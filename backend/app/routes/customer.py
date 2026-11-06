import re
from datetime import timedelta

from flask import Blueprint, request, current_app

from ..extensions import db
from ..models import (Address, Order, OrderItem, Subscription, SubscriptionItem, Payment, DeliverySchedule,
                      Notification, Review, ContactEnquiry, CustomerProfile)
from ..services import payments as pay
from ..services import delivery as dsvc
from ..services.pricing import quote, public_quote, is_serviceable, trial_eligibility
from ..extensions import limiter
from ..utils import ApiError, ok, require, login_required, parse_date, today, gen_code, notify, notify_admins, audit
from .auth import validate_password

bp = Blueprint("customer", __name__, url_prefix="/api/me")
customer_only = login_required(roles=("customer",))


def own_sub(user, sid):
    s = db.session.get(Subscription, sid)
    if not s or s.user_id != user.id:
        raise ApiError("Subscription not found.", 404)
    return s


# ------------------------------------------------------------------ dashboard
@bp.get("/dashboard")
@customer_only
def dashboard(user):
    dsvc.housekeeping()
    subs = Subscription.query.filter_by(user_id=user.id).order_by(Subscription.created_at.desc()).all()
    active = [s for s in subs if s.status in ("active", "paused")]
    nxt = None
    for s in active:
        if s.status != "active":
            continue
        d = max(s.start_date, today())
        done = DeliverySchedule.query.filter_by(subscription_id=s.id, delivery_date=today()).first()
        if d == today() and done and done.status in ("delivered", "missed", "skipped", "cancelled"):
            d = today() + timedelta(days=1)
        skips = s.skip_dates()
        while d <= s.end_date and d in skips:
            d += timedelta(days=1)
        if d <= s.end_date and (not nxt or d < nxt["date"]):
            nxt = {"date": d, "subscription_id": s.id, "items": [i.to_dict() for i in s.items]}
    today_row = (DeliverySchedule.query.join(Subscription).filter(Subscription.user_id == user.id,
                 DeliverySchedule.delivery_date == today()).first())
    pays = (Payment.query.filter_by(user_id=user.id).order_by(Payment.created_at.desc()).limit(5).all())
    notes = (Notification.query.filter_by(user_id=user.id, audience="customer")
             .order_by(Notification.created_at.desc()).limit(6).all())
    return ok({
        "user": user.to_dict(),
        "active_subscriptions": [s.to_dict() for s in active],
        "next_delivery": {**nxt, "date": nxt["date"].isoformat()} if nxt else None,
        "today_delivery": today_row.to_dict(with_tracking=True) if today_row else None,
        "recent_orders": [s.to_dict() for s in subs[:5]],
        "recent_payments": [p.to_dict() for p in pays],
        "notifications": [n.to_dict() for n in notes],
        "unread": Notification.query.filter_by(user_id=user.id, is_read=False).count(),
        "trial": trial_eligibility(user),
        "stats": {"total_subscriptions": len(subs),
                  "delivered": DeliverySchedule.query.join(Subscription).filter(
                      Subscription.user_id == user.id, DeliverySchedule.status == "delivered").count(),
                  "total_paid": sum(float(p.amount) for p in Payment.query.filter_by(user_id=user.id,
                                                                                      status="success"))},
    })


# ------------------------------------------------------------------ profile
@bp.put("/profile")
@login_required()
def update_profile(user):
    p = request.get_json(force=True, silent=True) or {}
    if "full_name" in p:
        if not p["full_name"].strip():
            raise ApiError("Name cannot be empty.", 422, "full_name")
        if not user.profile:
            user.profile = CustomerProfile(full_name=p["full_name"].strip())
        user.profile.full_name = p["full_name"].strip()[:120]
    if "phone" in p:
        phone = re.sub(r"\D", "", p["phone"])[-10:]
        if not re.match(r"^[6-9]\d{9}$", phone):
            raise ApiError("Please enter a valid 10-digit mobile number.", 422, "phone")
        user.phone = phone
    if user.profile:
        for k in ("alt_phone", "preferred_time"):
            if k in p:
                setattr(user.profile, k, (p[k] or "")[:30])
    db.session.commit()
    d = user.to_dict()
    d["profile"] = user.profile.to_dict() if user.profile else None
    return ok(d)


@bp.put("/password")
@limiter.limit("5 per 15 minutes")
@login_required()
def change_password(user):
    p = request.get_json(force=True, silent=True) or {}
    require(p, "current_password", "new_password")
    if not user.check_password(p["current_password"]):
        raise ApiError("Current password is incorrect.", 422, "current_password")
    validate_password(p["new_password"])
    user.set_password(p["new_password"])
    db.session.commit()
    return ok({"message": "Password changed successfully."})


# ------------------------------------------------------------------ addresses
ADDR_FIELDS = ("label", "line1", "line2", "landmark", "area", "city", "pincode", "instructions")


def _apply_address(a, p):
    for f in ADDR_FIELDS:
        if f in p:
            setattr(a, f, (p[f] or "").strip()[:255] or None)
    if not a.line1:
        raise ApiError("House / flat and street are required.", 422, "line1")
    if not re.match(r"^\d{6}$", a.pincode or ""):
        raise ApiError("Please enter a valid 6-digit PIN code.", 422, "pincode")
    from ..models import ServiceablePincode
    sa = ServiceablePincode.query.filter_by(pincode=a.pincode).first()
    if sa:  # city and area follow the serviceable-area record for this PIN code
        a.city = sa.city
        a.area = a.area or sa.area
    elif not a.city:
        a.city = "—"


@bp.get("/addresses")
@customer_only
def addresses(user):
    rows = Address.query.filter_by(user_id=user.id, is_deleted=False).order_by(Address.is_default.desc()).all()
    return ok([{**a.to_dict(), "serviceable": is_serviceable(a.pincode)} for a in rows])


@bp.post("/addresses")
@customer_only
def add_address(user):
    p = request.get_json(force=True, silent=True) or {}
    a = Address(user_id=user.id)
    _apply_address(a, p)
    has_any = Address.query.filter_by(user_id=user.id, is_deleted=False).count()
    if p.get("is_default") or not has_any:
        Address.query.filter_by(user_id=user.id).update({"is_default": False})
        a.is_default = True
    db.session.add(a)
    db.session.commit()
    return ok({**a.to_dict(), "serviceable": is_serviceable(a.pincode)}, 201)


@bp.put("/addresses/<int:aid>")
@customer_only
def edit_address(user, aid):
    a = db.session.get(Address, aid)
    if not a or a.user_id != user.id or a.is_deleted:
        raise ApiError("Address not found.", 404)
    p = request.get_json(force=True, silent=True) or {}
    _apply_address(a, p)
    if p.get("is_default"):
        Address.query.filter_by(user_id=user.id).update({"is_default": False})
        a.is_default = True
    db.session.commit()
    return ok({**a.to_dict(), "serviceable": is_serviceable(a.pincode)})


@bp.delete("/addresses/<int:aid>")
@customer_only
def delete_address(user, aid):
    a = db.session.get(Address, aid)
    if not a or a.user_id != user.id:
        raise ApiError("Address not found.", 404)
    in_use = Subscription.query.filter(Subscription.address_id == aid,
                                       Subscription.status.in_(["active", "paused"])).count()
    if in_use:
        raise ApiError("This address is used by an active subscription and cannot be deleted.", 422)
    a.is_deleted = True  # soft delete keeps order history intact
    a.is_default = False
    db.session.commit()
    return ok({"message": "Address removed."})


# ------------------------------------------------------------------ booking
@bp.post("/quote")
@customer_only
def my_quote(user):
    p = request.get_json(force=True, silent=True) or {}
    q = quote(user, p.get("items", []), p.get("plan_id"), p.get("start_date"))
    out = public_quote(q)
    if p.get("address_id"):
        a = db.session.get(Address, int(p["address_id"]))
        out["address_serviceable"] = bool(a and a.user_id == user.id and is_serviceable(a.pincode))
    return ok(out)


@bp.post("/checkout")
@limiter.limit("10 per minute")
@customer_only
def checkout(user):
    p = request.get_json(force=True, silent=True) or {}
    key = (request.headers.get("Idempotency-Key") or p.get("idempotency_key") or "")[:64] or None
    if key:
        existing = Order.query.filter_by(idempotency_key=key, user_id=user.id).first()
        if existing:
            pm = existing.payments[-1] if existing.payments else None
            return ok({"order": existing.to_dict(), "payment": pay.checkout_payload(pm) if pm else None,
                       "duplicate": True})

    q = quote(user, p.get("items", []), p.get("plan_id"), p.get("start_date"), p.get("address_id"), strict=True)
    plan = q["_plan"]
    sd = parse_date(q["start_date"])
    order = Order(order_number=gen_code("AMD"), user_id=user.id, address_id=int(p["address_id"]), plan_id=plan.id,
                  subtotal=q["subtotal"], discount=q["discount"], total=q["total"], idempotency_key=key)
    db.session.add(order)
    db.session.flush()
    for l in q["_lines"]:
        db.session.add(OrderItem(order_id=order.id, variant_id=l["variant_id"], daily_qty=l["daily_qty"],
                                 unit_price=l["unit_price"], days=l["days"], line_total=l["line_total"]))
    sub = Subscription(user_id=user.id, order_id=order.id, plan_id=plan.id, address_id=order.address_id,
                       start_date=sd, end_date=sd + timedelta(days=plan.duration_days - 1),
                       total_amount=q["total"], is_trial=plan.is_trial)
    db.session.add(sub)
    db.session.flush()
    for l in q["_lines"]:
        db.session.add(SubscriptionItem(subscription_id=sub.id, variant_id=l["variant_id"],
                                        daily_qty=l["daily_qty"], unit_price=l["unit_price"]))

    payment_data = None
    if plan.is_trial or q["total"] == 0:
        # Free trial follows the zero-payment rule – confirmed immediately.
        order.status = "confirmed"
        if plan.is_trial:
            user.trial_used = True
        notify(user, "Free trial booked", f"Your free trial is confirmed for {sd:%d %b %Y}. Enjoy fresh milk!",
               "booking")
        dsvc.activate_after_confirmation(sub)
        notify_admins("New free trial", f"{user.name} booked a free trial for {sd:%d %b}", "booking")
    else:
        offline = current_app.config["PAYMENT_PROVIDER"] == "offline"
        notify(user, "Booking received", f"Order {order.order_number} for your {plan.name} plan is reserved. " +
               ("Pay by UPI or cash – your plan is confirmed as soon as our team verifies the payment."
                if offline else "Complete payment to confirm it."), "booking", email=offline)
        if offline:
            notify_admins("Booking awaiting payment", f"{user.name} – {order.order_number} – ₹{q['total']:,.2f} "
                                                      "(UPI / cash). Confirm it once the money is received.", "payment")
        payment = Payment(order_id=order.id, user_id=user.id, amount=q["total"])
        db.session.add(payment)
        db.session.flush()
        payment.order = order
        payment_data = pay.create_gateway_order(payment)
    audit(user, "order", order.id, "created", {"total": q["total"], "plan": plan.code})
    db.session.commit()
    return ok({"order": order.to_dict(), "subscription": sub.to_dict(), "payment": payment_data}, 201)


@bp.post("/subscriptions/<int:sid>/retry-payment")
@customer_only
def retry_payment(user, sid):
    sub = own_sub(user, sid)
    if sub.status not in ("pending_payment", "failed") or sub.is_trial:
        raise ApiError("This subscription does not need payment.", 422)
    if sub.start_date <= today():
        sub.start_date = today() + timedelta(days=1)
        sub.end_date = sub.start_date + timedelta(days=sub.plan.duration_days - 1)
    sub.status = "pending_payment"
    sub.order.status = "pending_payment"
    payment = Payment(order_id=sub.order_id, user_id=user.id, amount=sub.total_amount)
    db.session.add(payment)
    db.session.flush()
    payment.order = sub.order
    data = pay.create_gateway_order(payment)
    db.session.commit()
    return ok({"payment": data, "subscription": sub.to_dict()})


@bp.post("/payments/verify")
@limiter.limit("20 per minute")
@customer_only
def verify_payment(user):
    """Razorpay Checkout success handler – signature is verified server-side."""
    p = request.get_json(force=True, silent=True) or {}
    require(p, "razorpay_order_id", "razorpay_payment_id", "razorpay_signature")
    pm = Payment.query.filter_by(provider_order_id=p["razorpay_order_id"]).first()
    if not pm or pm.user_id != user.id:
        raise ApiError("Payment not found.", 404)
    if not pay.verify_razorpay_signature(p["razorpay_order_id"], p["razorpay_payment_id"], p["razorpay_signature"]):
        pay.mark_failed(p["razorpay_order_id"], "Signature verification failed")
        raise ApiError("We could not verify this payment. If money was deducted it will be auto-refunded.", 400)
    pm, _ = pay.mark_success(p["razorpay_order_id"], p["razorpay_payment_id"], p.get("method", "razorpay"))
    return ok({"payment": pm.to_dict(), "subscription": pm.order.subscription.to_dict()})


@bp.post("/payments/mock/<provider_order_id>")
@customer_only
def mock_payment(user, provider_order_id):
    """Local test gateway. Disabled automatically when PAYMENT_PROVIDER != mock."""
    if current_app.config["PAYMENT_PROVIDER"] != "mock":
        raise ApiError("Test payments are disabled.", 403)
    pm = Payment.query.filter_by(provider_order_id=provider_order_id).first()
    if not pm or pm.user_id != user.id:
        raise ApiError("Payment not found.", 404)
    p = request.get_json(force=True, silent=True) or {}
    if p.get("outcome") == "success":
        pm, _ = pay.mark_success(provider_order_id, "mock_pay_" + provider_order_id[-8:] + gen_code("")[-4:],
                                 p.get("method", "upi"))
    else:
        pm = pay.mark_failed(provider_order_id, p.get("reason") or "Cancelled by customer")
    return ok({"payment": pm.to_dict(), "subscription": pm.order.subscription.to_dict()})


@bp.get("/payments/status/<provider_order_id>")
@customer_only
def payment_status(user, provider_order_id):
    pm = Payment.query.filter_by(provider_order_id=provider_order_id).first()
    if not pm or pm.user_id != user.id:
        raise ApiError("Payment not found.", 404)
    return ok({"payment": pm.to_dict(), "subscription": pm.order.subscription.to_dict(),
               "order": pm.order.to_dict(), "checkout": pay.checkout_payload(pm)})


# ------------------------------------------------------------------ subscriptions
@bp.get("/subscriptions")
@customer_only
def subscriptions(user):
    dsvc.housekeeping()
    q = Subscription.query.filter_by(user_id=user.id)
    if request.args.get("status"):
        q = q.filter_by(status=request.args["status"])
    return ok([s.to_dict() for s in q.order_by(Subscription.created_at.desc()).all()])


@bp.get("/subscriptions/<int:sid>")
@customer_only
def subscription(user, sid):
    s = own_sub(user, sid)
    rows = (DeliverySchedule.query.filter_by(subscription_id=s.id).order_by(DeliverySchedule.delivery_date).all())
    d = s.to_dict()
    d["deliveries"] = [r.to_dict(with_tracking=True) for r in rows]
    d["payments"] = [p.to_dict() for p in (s.order.payments if s.order else [])]
    d["order"] = s.order.to_dict() if s.order else None
    return ok(d)


@bp.post("/subscriptions/<int:sid>/<action>")
@customer_only
def subscription_action(user, sid, action):
    s = own_sub(user, sid)
    p = request.get_json(force=True, silent=True) or {}
    if action == "skip":
        require(p, "date")
        req = dsvc.skip_date(s, parse_date(p["date"]), user, (p.get("reason") or "")[:255] or None)
        msg = ("Delivery skipped. The day has been added to the end of your plan." if req.status == "approved"
               else "Skip request sent. You'll be notified once it is approved.")
    elif action == "pause":
        require(p, "from_date")
        dsvc.pause(s, parse_date(p["from_date"], "from_date"), user)
        msg = "Subscription paused. Resume any time."
    elif action == "resume":
        added = dsvc.resume(s, parse_date(p.get("date") or (today() + timedelta(days=1)).isoformat()), user)
        msg = f"Subscription resumed. {added} day(s) added to your end date."
    elif action == "cancel":
        dsvc.cancel(s, (p.get("reason") or "Cancelled by customer")[:255], user)
        msg = "Subscription cancelled."
    else:
        raise ApiError("Unknown action.", 404)
    db.session.commit()
    return ok({"message": msg, "subscription": s.to_dict()})


# ------------------------------------------------------------------ deliveries & payments
@bp.get("/deliveries")
@customer_only
def deliveries(user):
    q = DeliverySchedule.query.join(Subscription).filter(Subscription.user_id == user.id)
    if request.args.get("status"):
        q = q.filter(DeliverySchedule.status == request.args["status"])
    rows = q.order_by(DeliverySchedule.delivery_date.desc()).limit(200).all()
    return ok([r.to_dict(with_tracking=True) for r in rows])


@bp.get("/orders")
@customer_only
def my_orders(user):
    rows = Order.query.filter_by(user_id=user.id).order_by(Order.created_at.desc()).all()
    out = []
    for o in rows:
        d = o.to_dict()
        d["subscription_status"] = o.subscription.status if o.subscription else None
        d["payment_status"] = o.payments[-1].status if o.payments else ("free" if float(o.total) == 0 else None)
        out.append(d)
    return ok(out)


@bp.get("/payments")
@customer_only
def payments(user):
    rows = Payment.query.filter_by(user_id=user.id).order_by(Payment.created_at.desc()).all()
    return ok([p.to_dict() for p in rows])


@bp.get("/payments/<int:pid>/receipt")
@customer_only
def receipt(user, pid):
    pm = db.session.get(Payment, pid)
    if not pm or pm.user_id != user.id or pm.status not in ("success", "refunded"):
        raise ApiError("Receipt not available.", 404)
    return ok({"payment": pm.to_dict(), "order": pm.order.to_dict(),
               "subscription": pm.order.subscription.to_dict() if pm.order.subscription else None,
               "customer": {"name": user.name, "email": user.email, "phone": user.phone}})


# ------------------------------------------------------------------ notifications, reviews, support
@bp.get("/notifications")
@login_required()
def notifications(user):
    rows = (Notification.query.filter_by(user_id=user.id).order_by(Notification.created_at.desc()).limit(100).all())
    return ok([n.to_dict() for n in rows])


@bp.post("/notifications/read")
@login_required()
def notifications_read(user):
    Notification.query.filter_by(user_id=user.id, is_read=False).update({"is_read": True})
    db.session.commit()
    return ok({"message": "All caught up."})


@bp.post("/reviews")
@customer_only
def add_review(user):
    p = request.get_json(force=True, silent=True) or {}
    require(p, "comment")
    rating = int(p.get("rating", 5))
    if rating < 1 or rating > 5:
        raise ApiError("Rating must be between 1 and 5.", 422, "rating")
    if not Subscription.query.filter(Subscription.user_id == user.id,
                                     Subscription.status.in_(["active", "paused", "completed"])).first():
        raise ApiError("You can review after your first delivery.", 422)
    r = Review(user_id=user.id, name=user.name, rating=rating, comment=p["comment"][:1000], is_approved=False)
    db.session.add(r)
    notify_admins("New review awaiting approval", f"{user.name} rated {rating}★", "review")
    db.session.commit()
    return ok({"message": "Thanks! Your review will appear once approved.", "review": r.to_dict()}, 201)


@bp.get("/reviews")
@customer_only
def my_reviews(user):
    return ok([r.to_dict() for r in Review.query.filter_by(user_id=user.id).order_by(Review.created_at.desc())])


@bp.get("/support")
@customer_only
def support(user):
    rows = ContactEnquiry.query.filter_by(user_id=user.id).order_by(ContactEnquiry.created_at.desc()).all()
    return ok([r.to_dict() for r in rows])
