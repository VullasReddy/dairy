import json
from datetime import timedelta
from flask import Blueprint, request, current_app

from ..extensions import db
from ..models import DeliveryStaff, DeliverySchedule
from ..services import delivery as dsvc
from ..services import payments as pay
from ..utils import ApiError, ok, require, login_required, parse_date, today

bp = Blueprint("staff", __name__, url_prefix="/api/staff")
hooks = Blueprint("hooks", __name__, url_prefix="/api/payments")

STAFF_ALLOWED = ("out_for_delivery", "delivered", "missed")


def staff_profile(user):
    s = DeliveryStaff.query.filter_by(user_id=user.id).first()
    if not s or not s.is_active:
        raise ApiError("No delivery profile linked to this login.", 403)
    return s


@bp.get("/deliveries")
@login_required(roles=("staff",))
def my_deliveries(user):
    s = staff_profile(user)
    d = parse_date(request.args.get("date") or today().isoformat())
    rows = DeliverySchedule.query.filter_by(staff_id=s.id, delivery_date=d).all()
    rows.sort(key=lambda r: (r.subscription.address.pincode, r.subscription.address.area or ""))
    return ok({"staff": s.to_dict(), "date": d.isoformat(), "deliveries": [r.to_dict() for r in rows]})


@bp.get("/history")
@login_required(roles=("staff",))
def history(user):
    s = staff_profile(user)
    since = today() - timedelta(days=int(request.args.get("days", 30)))
    rows = (DeliverySchedule.query.filter(DeliverySchedule.staff_id == s.id, DeliverySchedule.delivery_date >= since,
                                          DeliverySchedule.delivery_date <= today(),
                                          DeliverySchedule.status.in_(["delivered", "missed"]))
            .order_by(DeliverySchedule.delivery_date.desc()).all())
    return ok({"delivered": sum(1 for r in rows if r.status == "delivered"),
               "missed": sum(1 for r in rows if r.status == "missed"),
               "deliveries": [r.to_dict() for r in rows]})


@bp.post("/deliveries/<int:rid>/status")
@login_required(roles=("staff",))
def update(user, rid):
    s = staff_profile(user)
    r = db.session.get(DeliverySchedule, rid)
    if not r or r.staff_id != s.id:
        raise ApiError("Delivery not found in your list.", 404)
    p = request.get_json(force=True, silent=True) or {}
    require(p, "status")
    if p["status"] not in STAFF_ALLOWED:
        raise ApiError("Invalid status.", 422)
    if p["status"] == "missed" and not p.get("note"):
        raise ApiError("Please add a reason for the missed delivery.", 422, "note")
    dsvc.set_delivery_status(r, p["status"], user, p.get("note"), p.get("proof_image"))
    db.session.commit()
    return ok(r.to_dict())


@hooks.post("/webhook/razorpay")
def razorpay_webhook():
    """Server-to-server confirmation. Idempotent with the client-side verify call."""
    raw = request.get_data()
    if not pay.verify_webhook_signature(raw, request.headers.get("X-Razorpay-Signature")):
        raise ApiError("Invalid signature", 400)
    event = json.loads(raw or b"{}")
    entity = (event.get("payload", {}).get("payment", {}) or {}).get("entity", {})
    order_id = entity.get("order_id")
    if not order_id:
        return ok({"ignored": True})
    try:
        if event.get("event") in ("payment.captured", "order.paid"):
            pay.mark_success(order_id, entity.get("id"), entity.get("method", "razorpay"))
        elif event.get("event") == "payment.failed":
            pay.mark_failed(order_id, entity.get("error_description") or "Payment failed")
    except ApiError as e:
        if e.status != 404:
            raise
    return ok({"received": True})
