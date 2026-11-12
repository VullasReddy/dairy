import csv
import io
import os
import re
import secrets
import uuid
from collections import defaultdict
from datetime import timedelta, datetime

from flask import Blueprint, request, current_app, Response
from sqlalchemy import or_
from werkzeug.utils import secure_filename

from ..extensions import db, limiter
from ..models import (AdminPermission, ADMIN_MODULES, SubscriptionSkip, OrderItem, SubscriptionItem,
                      User, CustomerProfile, AdminRole, Address, Product, ProductVariant, SubscriptionPlan,
                      Subscription, Order, Payment, DeliverySchedule, DeliveryStaff, DeliveryRoute,
                      ServiceablePincode, Review, BlogPost, QualityReport, ContactEnquiry, Notification, AuditLog,
                      DELIVERY_STATUSES)
from ..clock import local_date, local_day_start_utc
from ..services import delivery as dsvc
from ..services import payments as pay
from ..utils import (ApiError, ok, require, login_required, parse_date, today, audit, notify, get_content,
                     set_content, settings, gen_code)

bp = Blueprint("admin", __name__, url_prefix="/api/admin")


def perm(p):
    return login_required(roles=("admin",), permission=p)


def get_or_404(model, oid, label="Record"):
    obj = db.session.get(model, oid)
    if not obj:
        raise ApiError(f"{label} not found.", 404)
    return obj


def assign(obj, data, fields, actor=None, entity=None):
    changes = {}
    for f in fields:
        if f in data:
            v = data[f]
            if isinstance(v, str):
                v = v.strip()
            if f.endswith("_date") and v:
                v = parse_date(v, f)
            old = getattr(obj, f)
            if old != v:
                changes[f] = {"from": str(old), "to": str(v)}
                setattr(obj, f, v)
    if actor and entity and changes:
        db.session.flush()
        audit(actor, entity, obj.id, "update", changes)
    return changes


def paginate(q, default=25):
    page = max(1, int(request.args.get("page", 1)))
    per = min(200, int(request.args.get("per_page", default)))
    total = q.count()
    rows = q.offset((page - 1) * per).limit(per).all()
    return rows, {"page": page, "per_page": per, "total": total, "pages": (total + per - 1) // per}


# ======================================================================= dashboard
@bp.get("/dashboard")
@perm("dashboard")
def dashboard(user):
    dsvc.housekeeping()
    t = today()
    todays = DeliverySchedule.query.filter_by(delivery_date=t).all()
    status_count = defaultdict(int)
    for r in todays:
        status_count[r.status] += 1
    paid = Payment.query.filter(Payment.status.in_(["success", "refunded"])).all()
    rev_by_day = defaultdict(float)
    for p in paid:
        rev_by_day[local_date(p.updated_at or p.created_at)] += float(p.amount) - float(p.refund_amount or 0)
    days = [t - timedelta(days=i) for i in range(13, -1, -1)]
    month_start = t.replace(day=1)
    active = Subscription.query.filter_by(status="active").all()
    plan_mix = defaultdict(int)
    for s in active:
        plan_mix[s.plan.name] += 1
    tomorrow = t + timedelta(days=1)
    demand = demand_for(tomorrow)
    low_stock = []
    for v in ProductVariant.query.filter_by(is_available=True).all():
        need = demand["by_variant"].get(v.id, {}).get("litres", 0)
        if float(v.stock_litres or 0) < max(need, float(v.low_stock_litres or 0)):
            low_stock.append({**v.to_dict(), "needed_litres": need})
    recent = Subscription.query.order_by(Subscription.created_at.desc()).limit(6).all()
    recent_pay = Payment.query.order_by(Payment.updated_at.desc()).limit(6).all()
    today_demand = demand_for(t)
    day_start = local_day_start_utc(t)
    todays_orders = Order.query.filter(Order.created_at >= day_start).all()
    # weekly (last 8 weeks) and monthly (last 6 months) revenue
    weeks = [(t - timedelta(days=t.weekday())) - timedelta(weeks=i) for i in range(7, -1, -1)]
    wk = defaultdict(float)
    mo = defaultdict(float)
    for d, v in rev_by_day.items():
        wk[d - timedelta(days=d.weekday())] += v
        mo[d.strftime("%Y-%m")] += v
    months = []
    y, m = t.year, t.month
    for _ in range(6):
        months.insert(0, f"{y}-{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    perf_days = [t - timedelta(days=i) for i in range(6, -1, -1)]
    perf = {d: defaultdict(int) for d in perf_days}
    for r in DeliverySchedule.query.filter(DeliverySchedule.delivery_date >= perf_days[0],
                                           DeliverySchedule.delivery_date <= t).all():
        perf[r.delivery_date][r.status] += 1
    sub_status = defaultdict(int)
    for st, n in db.session.query(Subscription.status, db.func.count(Subscription.id)).group_by(Subscription.status):
        sub_status[st] = n
    from ..models import SubscriptionSkip
    return ok({
        "cards": {
            "customers": User.query.filter_by(role="customer").count(),
            "active_subscriptions": len(active),
            "paused_subscriptions": Subscription.query.filter_by(status="paused").count(),
            "todays_orders": len(todays_orders),
            "todays_paid_orders": sum(1 for o in todays_orders if o.status == "confirmed"),
            "todays_deliveries": len(todays),
            "pending_deliveries": sum(status_count[s] for s in ("scheduled", "assigned", "out_for_delivery")),
            "delivered_today": status_count["delivered"],
            "missed_today": status_count["missed"],
            "revenue_today": round(rev_by_day.get(t, 0), 2),
            "revenue_week": round(wk.get(t - timedelta(days=t.weekday()), 0), 2),
            "revenue_month": round(sum(v for d, v in rev_by_day.items() if d >= month_start), 2),
            "cow_milk_litres_today": today_demand["by_product"].get("Cow Milk", 0),
            "buffalo_milk_litres_today": today_demand["by_product"].get("Buffalo Milk", 0),
            "pending_payments": Payment.query.filter_by(status="created").count(),
            "pending_approvals": Subscription.query.filter_by(status="pending_approval").count(),
            "pending_skips": SubscriptionSkip.query.filter_by(status="pending").count(),
            "open_enquiries": ContactEnquiry.query.filter(ContactEnquiry.status != "resolved").count(),
            "pending_reviews": Review.query.filter_by(is_approved=False).count(),
            "schedule_generated_today": len(todays) > 0,
        },
        "revenue_chart": {"labels": [d.strftime("%d %b") for d in days],
                          "values": [round(rev_by_day.get(d, 0), 2) for d in days]},
        "weekly_revenue": [{"label": d.strftime("%d %b"), "value": round(wk.get(d, 0), 2)} for d in weeks],
        "monthly_revenue": [{"label": datetime.strptime(m_, "%Y-%m").strftime("%b %Y"), "value": round(mo.get(m_, 0), 2)}
                            for m_ in months],
        "delivery_performance": [{"label": d.strftime("%d %b"), "delivered": perf[d]["delivered"],
                                  "missed": perf[d]["missed"], "skipped": perf[d]["skipped"]} for d in perf_days],
        "subscription_status": sub_status,
        "plan_mix": plan_mix, "delivery_status_today": status_count,
        "today_demand": today_demand, "tomorrow_demand": demand, "low_stock": low_stock,
        "recent_bookings": [s.to_dict() for s in recent],
        "recent_payments": [p.to_dict() for p in recent_pay],
    })


def demand_for(d):
    subs = Subscription.query.filter(Subscription.status == "active", Subscription.start_date <= d,
                                     Subscription.end_date >= d).all()
    by_variant, by_product = {}, defaultdict(float)
    for s in subs:
        if d in s.skip_dates():
            continue
        for i in s.items:
            v = i.variant
            e = by_variant.setdefault(v.id, {"product": v.product.name, "size": v.label, "packets": 0, "litres": 0})
            e["packets"] += i.daily_qty
            e["litres"] = round(e["packets"] * v.size_ml / 1000, 2)
            by_product[v.product.name] += i.daily_qty * v.size_ml / 1000
    return {"date": d.isoformat(), "by_variant": by_variant,
            "by_product": {k: round(v, 2) for k, v in by_product.items()},
            "total_litres": round(sum(by_product.values()), 2)}


# ======================================================================= products
PRODUCT_FIELDS = ("name", "slug", "tagline", "description", "image", "nutrition", "is_active", "sort_order")
VARIANT_FIELDS = ("size_ml", "label", "price", "mrp", "stock_litres", "low_stock_litres", "is_available",
                  "trial_eligible")


@bp.get("/products")
@perm("products")
def products(user):
    return ok([p.to_dict(include_inactive=True) for p in Product.query.order_by(Product.sort_order).all()])


@bp.post("/products")
@perm("products")
def create_product(user):
    p = request.get_json(force=True, silent=True) or {}
    require(p, "name")
    p.setdefault("slug", re.sub(r"[^a-z0-9]+", "-", p["name"].lower()).strip("-"))
    if Product.query.filter_by(slug=p["slug"]).first():
        raise ApiError("A product with this URL slug already exists.", 409, "slug")
    prod = Product()
    assign(prod, p, PRODUCT_FIELDS)
    db.session.add(prod)
    db.session.flush()
    audit(user, "product", prod.id, "create", {"name": prod.name})
    db.session.commit()
    return ok(prod.to_dict(include_inactive=True), 201)


@bp.put("/products/<int:pid>")
@perm("products")
def update_product(user, pid):
    prod = get_or_404(Product, pid, "Product")
    assign(prod, request.get_json(force=True, silent=True) or {}, PRODUCT_FIELDS, user, "product")
    db.session.commit()
    return ok(prod.to_dict(include_inactive=True))


@bp.delete("/products/<int:pid>")
@perm("products")
def delete_product(user, pid):
    prod = get_or_404(Product, pid, "Product")
    prod.is_active = False  # soft delete – history references variants
    audit(user, "product", pid, "deactivate")
    db.session.commit()
    return ok({"message": "Product hidden from the catalogue."})


@bp.post("/products/<int:pid>/variants")
@perm("products")
def add_variant(user, pid):
    get_or_404(Product, pid, "Product")
    p = request.get_json(force=True, silent=True) or {}
    require(p, "size_ml", "price")
    if float(p["price"]) <= 0:
        raise ApiError("Price must be greater than zero.", 422, "price")
    v = ProductVariant(product_id=pid)
    assign(v, p, VARIANT_FIELDS)
    v.label = v.label or (f"{int(v.size_ml) // 1000} L" if int(v.size_ml) % 1000 == 0 else f"{v.size_ml} ml")
    db.session.add(v)
    db.session.flush()
    audit(user, "variant", v.id, "create", {"price": float(v.price)})
    db.session.commit()
    return ok(v.to_dict(), 201)


@bp.put("/variants/<int:vid>")
@perm("products")
def update_variant(user, vid):
    v = get_or_404(ProductVariant, vid, "Variant")
    p = request.get_json(force=True, silent=True) or {}
    if "price" in p and float(p["price"]) <= 0:
        raise ApiError("Price must be greater than zero.", 422, "price")
    assign(v, p, VARIANT_FIELDS, user, "variant")
    db.session.commit()
    return ok(v.to_dict())


# ======================================================================= plans
PLAN_FIELDS = ("code", "name", "duration_days", "discount_percent", "is_trial", "trial_max_packets",
               "display_price", "is_popular", "is_active", "sort_order", "description")


@bp.get("/plans")
@perm("plans")
def plans(user):
    return ok([p.to_dict() for p in SubscriptionPlan.query.order_by(SubscriptionPlan.sort_order).all()])


@bp.post("/plans")
@perm("plans")
def create_plan(user):
    p = request.get_json(force=True, silent=True) or {}
    require(p, "code", "name", "duration_days")
    if int(p["duration_days"]) < 1:
        raise ApiError("Duration must be at least 1 day.", 422, "duration_days")
    plan = SubscriptionPlan()
    assign(plan, p, PLAN_FIELDS)
    db.session.add(plan)
    db.session.flush()
    audit(user, "plan", plan.id, "create", {"code": plan.code})
    db.session.commit()
    return ok(plan.to_dict(), 201)


@bp.put("/plans/<int:pid>")
@perm("plans")
def update_plan(user, pid):
    plan = get_or_404(SubscriptionPlan, pid, "Plan")
    p = request.get_json(force=True, silent=True) or {}
    if p.get("is_popular"):
        SubscriptionPlan.query.update({"is_popular": False})
    assign(plan, p, PLAN_FIELDS, user, "plan")
    db.session.commit()
    return ok(plan.to_dict())


# ======================================================================= customers
@bp.get("/customers")
@perm("customers")
def customers(user):
    q = User.query.filter_by(role="customer").outerjoin(CustomerProfile)
    s = (request.args.get("q") or "").strip()
    if s:
        like = f"%{s}%"
        q = q.filter(or_(User.email.ilike(like), User.phone.ilike(like), CustomerProfile.full_name.ilike(like)))
    rows, meta = paginate(q.order_by(User.created_at.desc()))
    out = []
    for u in rows:
        subs = Subscription.query.filter_by(user_id=u.id).all()
        out.append({**u.to_dict(), "subscriptions": len(subs),
                    "active": sum(1 for x in subs if x.status in ("active", "paused")),
                    "lifetime_value": sum(float(p.amount) for p in Payment.query.filter_by(user_id=u.id,
                                                                                            status="success"))})
    return ok(out, meta=meta)


@bp.get("/customers/<int:uid>")
@perm("customers")
def customer(user, uid):
    u = get_or_404(User, uid, "Customer")
    return ok({**u.to_dict(), "profile": u.profile.to_dict() if u.profile else None,
               "addresses": [a.to_dict() for a in u.addresses if not a.is_deleted],
               "subscriptions": [s.to_dict() for s in Subscription.query.filter_by(user_id=uid)
                                 .order_by(Subscription.created_at.desc())],
               "payments": [p.to_dict() for p in Payment.query.filter_by(user_id=uid)
                            .order_by(Payment.created_at.desc())]})


@bp.put("/customers/<int:uid>")
@perm("customers")
def update_customer(user, uid):
    u = get_or_404(User, uid, "Customer")
    p = request.get_json(force=True, silent=True) or {}
    assign(u, p, ("is_active", "trial_used", "email_verified"), user, "customer")
    if p.get("new_password"):  # customer forgot password and has no email – admin sets a new one
        from .auth import validate_password
        validate_password(p["new_password"])
        u.set_password(p["new_password"])
        audit(user, "customer", u.id, "password_reset_by_admin", {})
    db.session.commit()
    return ok(u.to_dict())


# ======================================================================= bookings / subscriptions
@bp.get("/subscriptions")
@perm("bookings")
def subscriptions(user):
    dsvc.housekeeping()
    q = Subscription.query.join(User, Subscription.user_id == User.id).outerjoin(CustomerProfile)
    a = request.args
    if a.get("status"):
        q = q.filter(Subscription.status == a["status"])
    if a.get("plan_id"):
        q = q.filter(Subscription.plan_id == int(a["plan_id"]))
    if a.get("q"):
        like = f"%{a['q']}%"
        q = q.outerjoin(Order, Subscription.order_id == Order.id).filter(
            or_(CustomerProfile.full_name.ilike(like), User.phone.ilike(like), Order.order_number.ilike(like)))
    rows, meta = paginate(q.order_by(Subscription.created_at.desc()))
    return ok([s.to_dict() for s in rows], meta=meta)


@bp.get("/subscriptions/<int:sid>")
@perm("bookings")
def subscription(user, sid):
    s = get_or_404(Subscription, sid, "Subscription")
    d = s.to_dict()
    d["order"] = s.order.to_dict() if s.order else None
    d["payments"] = [p.to_dict() for p in (s.order.payments if s.order else [])]
    d["payments"] += [pm.to_dict() for a in s.addons for pm in (a.order.payments if a.order else [])]
    d["addons"] = [a.to_dict() for a in s.addons]
    d["deliveries"] = [r.to_dict() for r in DeliverySchedule.query.filter_by(subscription_id=sid)
                       .order_by(DeliverySchedule.delivery_date)]
    d["audit"] = [x.to_dict() for x in AuditLog.query.filter(
        or_((AuditLog.entity == "subscription") & (AuditLog.entity_id == sid),
            (AuditLog.entity == "order") & (AuditLog.entity_id == s.order_id)))
        .order_by(AuditLog.created_at.desc())]
    return ok(d)


@bp.post("/subscriptions/<int:sid>/<action>")
@perm("bookings")
def subscription_action(user, sid, action):
    s = get_or_404(Subscription, sid, "Subscription")
    p = request.get_json(force=True, silent=True) or {}
    if action == "approve":
        dsvc.approve_booking(s, user)
    elif action == "reject":
        if s.status != "pending_approval":
            raise ApiError("Only bookings awaiting approval can be rejected.", 422)
        dsvc.cancel(s, ("Not approved: " + (p.get("reason") or "booking could not be accepted"))[:255], user)
        if not s.is_trial:
            s.refund_due = s.total_amount  # nothing delivered yet – full refund
    elif action == "cancel":
        dsvc.cancel(s, (p.get("reason") or "Cancelled by admin")[:255], user)
    elif action == "pause":
        dsvc.pause(s, parse_date(p.get("from_date") or (today() + timedelta(days=1)).isoformat()), user)
    elif action == "resume":
        dsvc.resume(s, parse_date(p.get("date") or (today() + timedelta(days=1)).isoformat()), user)
    elif action == "extend":
        days = int(p.get("days", 1))
        if days < 1 or days > 30:
            raise ApiError("Extend by 1–30 days.", 422)
        s.end_date = s.end_date + timedelta(days=days)
        audit(user, "subscription", s.id, "extend", {"days": days, "reason": p.get("reason")})
        notify(s.user, "Plan extended", f"Your plan has been extended by {days} day(s) to {s.end_date:%d %b %Y}.")
    elif action == "confirm-offline-payment":
        # Cash / bank transfer collected by staff – recorded with a reference and audited.
        require(p, "reference")
        if s.status not in ("pending_payment", "failed"):
            raise ApiError("This booking is not awaiting payment.", 422)
        pm = next((x for x in (s.order.payments if s.order else []) if x.status == "created"), None)
        if not pm:
            pm = Payment(order_id=s.order_id, user_id=s.user_id, amount=s.total_amount, provider="offline",
                         provider_order_id="offline_" + secrets.token_hex(6))
            db.session.add(pm)
            db.session.flush()
            pm.order = s.order
        db.session.commit()
        pay.mark_success(pm.provider_order_id, "offline_" + p["reference"][:60], p.get("method", "cash"))
        audit(user, "subscription", s.id, "offline_payment", {"reference": p["reference"]})
    else:
        raise ApiError("Unknown action.", 404)
    db.session.commit()
    return ok(s.to_dict())


@bp.post("/subscriptions/<int:sid>/addons/<int:aid>/<action>")
@perm("bookings")
def addon_action(user, sid, aid, action):
    """Extra-milk orders: record a UPI / cash payment, or cancel."""
    s = get_or_404(Subscription, sid, "Subscription")
    addon = next((a for a in s.addons if a.id == aid), None)
    if not addon:
        raise ApiError("Extra milk order not found.", 404)
    p = request.get_json(force=True, silent=True) or {}
    if action == "confirm-payment":
        require(p, "reference")
        if addon.status != "pending_payment":
            raise ApiError("This extra milk order is not awaiting payment.", 422)
        pm = next((x for x in addon.order.payments if x.status == "created"), None)
        if not pm:
            pm = Payment(order_id=addon.order_id, user_id=s.user_id, amount=addon.amount, provider="offline",
                         provider_order_id="offline_" + secrets.token_hex(6))
            db.session.add(pm)
            db.session.flush()
            pm.order = addon.order
        db.session.commit()
        pay.mark_success(pm.provider_order_id, "offline_" + p["reference"][:60], p.get("method", "cash"))
        audit(user, "subscription", s.id, "addon_offline_payment", {"addon": aid, "reference": p["reference"]})
    elif action == "cancel":
        paid = dsvc.cancel_addon(addon, user, by_admin=True)
        notify(s.user, "Extra milk cancelled", f"Your extra milk for {addon.delivery_date:%d %b} was cancelled."
               + (f" ₹{float(addon.amount):,.2f} will be refunded." if paid else ""), "subscription")
    else:
        raise ApiError("Unknown action.", 404)
    db.session.commit()
    return ok(addon.to_dict())


# ======================================================================= deliveries
@bp.get("/deliveries")
@perm("deliveries")
def deliveries(user):
    rows = _delivery_query().all()
    rows.sort(key=lambda r: (r.route.name if r.route else "zzz", r.subscription.address.pincode,
                             r.subscription.address.area or ""))
    summary = defaultdict(int)
    for r in rows:
        summary[r.status] += 1
    groups = defaultdict(list)
    for r in rows:
        groups[r.route.name if r.route else f"Unrouted – {r.subscription.address.pincode}"].append(r.id)
    return ok([r.to_dict() for r in rows], summary=summary, groups=groups,
              demand=demand_for(parse_date(request.args.get("date") or today().isoformat())))


def _delivery_query():
    a = request.args
    d = parse_date(a.get("date") or today().isoformat())
    q = (DeliverySchedule.query.filter(DeliverySchedule.delivery_date == d)
         .join(Subscription).join(Address, Subscription.address_id == Address.id))
    if a.get("status"):
        q = q.filter(DeliverySchedule.status == a["status"])
    if a.get("pincode"):
        q = q.filter(Address.pincode == a["pincode"])
    if a.get("area"):
        q = q.filter(Address.area.ilike(f"%{a['area']}%"))
    if a.get("city"):
        q = q.filter(Address.city == a["city"])
    if a.get("staff_id"):
        sid = a["staff_id"]
        q = q.filter(DeliverySchedule.staff_id.is_(None) if sid == "none" else DeliverySchedule.staff_id == int(sid))
    if a.get("route_id"):
        q = q.filter(DeliverySchedule.route_id == int(a["route_id"]))
    if a.get("milk"):
        from ..models import SubscriptionItem
        q = q.filter(Subscription.items.any(SubscriptionItem.variant.has(
            ProductVariant.product.has(Product.slug == a["milk"]))))
    return q


@bp.post("/deliveries/generate")
@perm("deliveries")
def generate(user):
    p = request.get_json(force=True, silent=True) or {}
    d = parse_date(p.get("date") or today().isoformat())
    return ok(dsvc.generate_for_date(d, user))


@bp.post("/deliveries/assign")
@perm("deliveries")
def assign_staff(user):
    p = request.get_json(force=True, silent=True) or {}
    require(p, "ids")
    staff = get_or_404(DeliveryStaff, int(p["staff_id"]), "Delivery person") if p.get("staff_id") else None
    n = 0
    for rid in p["ids"]:
        r = db.session.get(DeliverySchedule, int(rid))
        if not r or r.status not in ("scheduled", "assigned"):
            continue
        r.staff_id = staff.id if staff else None
        dsvc.set_delivery_status(r, "assigned" if staff else "scheduled", user,
                                 f"Assigned to {staff.name}" if staff else "Unassigned")
        n += 1
    db.session.commit()
    return ok({"updated": n})


@bp.post("/deliveries/status")
@perm("deliveries")
def bulk_status(user):
    p = request.get_json(force=True, silent=True) or {}
    require(p, "ids", "status")
    n = 0
    for rid in p["ids"]:
        r = db.session.get(DeliverySchedule, int(rid))
        if r:
            dsvc.set_delivery_status(r, p["status"], user, p.get("note"))
            n += 1
    db.session.commit()
    return ok({"updated": n})


@bp.get("/deliveries/export")
@perm("deliveries")
def export(user):
    rows = _delivery_query().all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Date", "Route", "Customer", "Phone", "Address", "PIN", "Milk", "Packet", "Qty", "Instructions",
                "Delivery person", "Status"])
    for r in rows:
        d = r.to_dict()
        for it in d["items"] or [{}]:
            w.writerow([d["delivery_date"], d["route"] or "", d["customer"], d["phone"], d["address"], d["pincode"],
                        it.get("product", ""), it.get("size", ""), it.get("qty", ""), d["instructions"] or "",
                        d["staff"] or "", d["status"]])
    name = f"deliveries_{request.args.get('date') or today().isoformat()}.csv"
    return Response(buf.getvalue(), mimetype="text/csv",
                    headers={"Content-Disposition": f"attachment; filename={name}"})


# ======================================================================= staff & routes & pincodes
@bp.get("/staff")
@perm("staff")
def staff(user):
    out = []
    since = today() - timedelta(days=30)
    for s in DeliveryStaff.query.order_by(DeliveryStaff.name).all():
        rows = DeliverySchedule.query.filter(DeliverySchedule.staff_id == s.id,
                                             DeliverySchedule.delivery_date >= since).all()
        done = sum(1 for r in rows if r.status == "delivered")
        missed = sum(1 for r in rows if r.status == "missed")
        out.append({**s.to_dict(), "last30": {"assigned": len(rows), "delivered": done, "missed": missed,
                                              "success_rate": round(100 * done / (done + missed), 1)
                                              if done + missed else None},
                    "today": DeliverySchedule.query.filter_by(staff_id=s.id, delivery_date=today()).count()})
    return ok(out)


@bp.post("/staff")
@perm("staff")
def create_staff(user):
    p = request.get_json(force=True, silent=True) or {}
    require(p, "name", "phone")
    s = DeliveryStaff(name=p["name"], phone=p["phone"], vehicle=p.get("vehicle"))
    if p.get("email") and p.get("password"):
        if User.query.filter_by(email=p["email"].lower()).first():
            raise ApiError("That login email is already in use.", 409, "email")
        u = User(email=p["email"].lower(), phone=p["phone"], role="staff", email_verified=True)
        u.set_password(p["password"])
        u.profile = CustomerProfile(full_name=p["name"])
        db.session.add(u)
        db.session.flush()
        s.user_id = u.id
    db.session.add(s)
    db.session.flush()
    audit(user, "staff", s.id, "create", {"name": s.name})
    db.session.commit()
    return ok(s.to_dict(), 201)


@bp.put("/staff/<int:sid>")
@perm("staff")
def update_staff(user, sid):
    s = get_or_404(DeliveryStaff, sid, "Delivery person")
    p = request.get_json(force=True, silent=True) or {}
    assign(s, p, ("name", "phone", "vehicle", "is_active"), user, "staff")
    if s.user:
        s.user.is_active = s.is_active
        if p.get("password"):
            s.user.set_password(p["password"])
    db.session.commit()
    return ok(s.to_dict())


@bp.get("/routes")
@perm("staff")
def routes(user):
    return ok([r.to_dict() for r in DeliveryRoute.query.order_by(DeliveryRoute.name).all()])


@bp.post("/routes")
@perm("staff")
def create_route(user):
    p = request.get_json(force=True, silent=True) or {}
    require(p, "name")
    r = DeliveryRoute()
    assign(r, p, ("name", "area", "pincodes", "default_staff_id", "is_active"))
    db.session.add(r)
    db.session.flush()
    audit(user, "route", r.id, "create", {"name": r.name})
    db.session.commit()
    return ok(r.to_dict(), 201)


@bp.put("/routes/<int:rid>")
@perm("staff")
def update_route(user, rid):
    r = get_or_404(DeliveryRoute, rid, "Route")
    assign(r, request.get_json(force=True, silent=True) or {}, ("name", "area", "pincodes", "default_staff_id", "is_active"),
           user, "route")
    db.session.commit()
    return ok(r.to_dict())


@bp.get("/pincodes")
@perm("settings")
def pincodes(user):
    q = ServiceablePincode.query
    if request.args.get("city"):
        q = q.filter_by(city=request.args["city"])
    return ok([p.to_dict() for p in q.order_by(ServiceablePincode.city, ServiceablePincode.pincode).all()])


@bp.post("/pincodes")
@perm("settings")
def add_pincode(user):
    p = request.get_json(force=True, silent=True) or {}
    require(p, "pincode")
    if not re.match(r"^\d{6}$", p["pincode"]):
        raise ApiError("PIN code must be 6 digits.", 422, "pincode")
    if ServiceablePincode.query.filter_by(pincode=p["pincode"]).first():
        raise ApiError("PIN code already added.", 409, "pincode")
    require(p, "city")
    row = ServiceablePincode(pincode=p["pincode"], area=p.get("area"), city=p["city"].strip()[:60])
    db.session.add(row)
    audit(user, "pincode", None, "add", {"pincode": p["pincode"]})
    db.session.commit()
    return ok(row.to_dict(), 201)


@bp.put("/pincodes/<int:pid>")
@perm("settings")
def update_pincode(user, pid):
    row = get_or_404(ServiceablePincode, pid, "PIN code")
    assign(row, request.get_json(force=True, silent=True) or {}, ("area", "city", "is_active"), user, "pincode")
    db.session.commit()
    return ok(row.to_dict())


# ======================================================================= payments
@bp.get("/payments")
@perm("payments")
def payments(user):
    q = Payment.query
    a = request.args
    if a.get("status"):
        q = q.filter(Payment.status == a["status"])
    if a.get("q"):
        like = f"%{a['q']}%"
        q = q.join(Order).filter(or_(Payment.provider_payment_id.ilike(like), Order.order_number.ilike(like),
                                     Payment.provider_order_id.ilike(like)))
    rows, meta = paginate(q.order_by(Payment.created_at.desc()))
    totals = {s: round(sum(float(p.amount) for p in Payment.query.filter_by(status=s)), 2)
              for s in ("success", "created", "failed", "refunded")}
    totals["refunds"] = round(sum(float(p.refund_amount or 0) for p in Payment.query.all()), 2)
    refunds_due = [s.to_dict() for s in Subscription.query.filter(Subscription.refund_due > 0).all()]
    return ok([p.to_dict() for p in rows], meta=meta, totals=totals, refunds_due=refunds_due)


@bp.post("/payments/<int:pid>/refund")
@perm("payments")
def refund(user, pid):
    pm = get_or_404(Payment, pid, "Payment")
    p = request.get_json(force=True, silent=True) or {}
    require(p, "amount")
    pay.refund(pm, p["amount"], (p.get("note") or "")[:255], user)
    db.session.commit()
    return ok(pm.to_dict())


# ======================================================================= reports
def _report_range():
    a = request.args
    end = parse_date(a.get("to") or today().isoformat())
    start = parse_date(a.get("from") or (end - timedelta(days=29)).isoformat())
    if start > end:
        raise ApiError("From date must be before To date.", 422)
    group = a.get("group", "day")
    if group not in ("day", "week", "month"):
        raise ApiError("Group must be day, week or month.", 422)
    return start, end, group


def compute_report(start, end, group):
    def bucket(d):
        if group == "week":
            return (d - timedelta(days=d.weekday())).isoformat()
        if group == "month":
            return d.strftime("%Y-%m")
        return d.isoformat()

    sales, count = defaultdict(float), defaultdict(int)
    product_rev = defaultdict(float)
    product_qty = defaultdict(float)
    pay_rows = []
    for p in Payment.query.order_by(Payment.created_at).all():
        d = local_date(p.updated_at or p.created_at)
        if not (start <= d <= end):
            continue
        pay_rows.append(p)
        if p.status not in ("success", "refunded"):
            continue
        net = float(p.amount) - float(p.refund_amount or 0)
        sales[bucket(d)] += net
        count[bucket(d)] += 1
        for it in p.order.items:
            share = float(it.line_total) / float(p.order.subtotal) if float(p.order.subtotal) else 0
            product_rev[it.variant.product.name] += round(net * share, 2)
            product_qty[it.variant.product.name] += it.daily_qty * it.days * it.variant.size_ml / 1000

    demand = defaultdict(lambda: defaultdict(float))
    perf = defaultdict(lambda: defaultdict(int))
    staff_perf = defaultdict(lambda: defaultdict(int))
    for r in DeliverySchedule.query.filter(DeliverySchedule.delivery_date.between(start, end)).all():
        perf[bucket(r.delivery_date)][r.status] += 1
        staff_perf[r.staff.name if r.staff else "Unassigned"][r.status] += 1
        if r.status not in ("skipped", "cancelled"):
            for it in r.items_snapshot or []:
                demand[bucket(r.delivery_date)][it["product"]] += it["qty"] * it.get("size_ml", 500) / 1000

    subs = Subscription.query.filter(Subscription.created_at >= local_day_start_utc(start),
                                     Subscription.created_at < local_day_start_utc(end + timedelta(days=1))).all()
    by_plan, by_status = defaultdict(int), defaultdict(int)
    for s in subs:
        by_plan[s.plan.name] += 1
        by_status[s.status] += 1
    labels = sorted(set(sales) | set(demand) | set(perf))
    total_del = sum(v.get("delivered", 0) for v in perf.values())
    total_missed = sum(v.get("missed", 0) for v in perf.values())
    pay_totals = defaultdict(float)
    for p in pay_rows:
        pay_totals[p.status] += float(p.amount)
    return {
        "range": {"from": start.isoformat(), "to": end.isoformat(), "group": group},
        "labels": labels,
        "sales": [round(sales.get(l, 0), 2) for l in labels],
        "orders": [count.get(l, 0) for l in labels],
        "product_revenue": {k: round(v, 2) for k, v in product_rev.items()},
        "product_litres_sold": {k: round(v, 2) for k, v in product_qty.items()},
        "milk_demand": {l: {k: round(v, 2) for k, v in demand[l].items()} for l in labels},
        "delivery_performance": {l: dict(perf[l]) for l in labels},
        "staff_performance": {k: dict(v) for k, v in staff_perf.items()},
        "payments": {"by_status": {k: round(v, 2) for k, v in pay_totals.items()}, "count": len(pay_rows)},
        "subscriptions": {"by_plan": by_plan, "by_status": by_status, "new": len(subs),
                          "trial_conversions": _trial_conversions()},
        "totals": {"revenue": round(sum(sales.values()), 2), "orders": sum(count.values()),
                   "delivered": total_del, "missed": total_missed,
                   "on_time_rate": round(100 * total_del / (total_del + total_missed), 1)
                   if total_del + total_missed else None},
        "_payments": pay_rows, "_subs": subs,
    }


@bp.get("/reports")
@perm("reports")
def reports(user):
    r = compute_report(*_report_range())
    return ok({k: v for k, v in r.items() if not k.startswith("_")})


REPORT_SHEETS = ("sales", "products", "demand", "subscriptions", "payments", "deliveries")


def report_tables(r, which):
    """Return {sheet_name: [header, *rows]} for the requested report type ('all' = every sheet)."""
    products = sorted({k for v in r["milk_demand"].values() for k in v})
    t = {}
    if which in ("sales", "all"):
        t["Sales"] = [["Period", "Net revenue (INR)", "Paid orders"]] + \
            [[l, r["sales"][i], r["orders"][i]] for i, l in enumerate(r["labels"])]
    if which in ("products", "all"):
        t["Product-wise sales"] = [["Product", "Net revenue (INR)", "Litres booked"]] + \
            [[k, v, r["product_litres_sold"].get(k, 0)] for k, v in r["product_revenue"].items()]
    if which in ("demand", "all"):
        t["Milk demand (L)"] = [["Period", *products, "Total"]] + \
            [[l, *[r["milk_demand"][l].get(p, 0) for p in products], round(sum(r["milk_demand"][l].values()), 2)]
             for l in r["labels"]]
    if which in ("subscriptions", "all"):
        t["Subscriptions"] = [["#", "Created", "Customer", "Phone", "Plan", "Milk / day", "Start", "End", "Status",
                               "Amount (INR)"]] + \
            [[s.id, s.created_at.strftime("%Y-%m-%d"), s.user.name, s.user.phone, s.plan.name,
              ", ".join(f"{i.daily_qty}x {i.variant.product.name} {i.variant.label}" for i in s.items),
              s.start_date.isoformat(), s.end_date.isoformat(), s.status, float(s.total_amount)] for s in r["_subs"]]
    if which in ("payments", "all"):
        t["Payments"] = [["Date", "Order", "Customer", "Gateway", "Transaction ID", "Receipt", "Method", "Amount (INR)",
                          "Refunded (INR)", "Status"]] + \
            [[(p.updated_at or p.created_at).strftime("%Y-%m-%d %H:%M"), p.order.order_number, p.user.name, p.provider,
              p.provider_payment_id or p.provider_order_id, p.receipt_number or "", p.method or "", float(p.amount),
              float(p.refund_amount or 0), p.status] for p in r["_payments"]]
    if which in ("deliveries", "all"):
        statuses = ["delivered", "missed", "skipped", "cancelled", "assigned", "scheduled", "out_for_delivery"]
        t["Delivery performance"] = [["Period", *statuses]] + \
            [[l, *[r["delivery_performance"][l].get(s, 0) for s in statuses]] for l in r["labels"]]
        t["Staff performance"] = [["Delivery person", *statuses]] + \
            [[k, *[v.get(s, 0) for s in statuses]] for k, v in r["staff_performance"].items()]
    return t


@bp.get("/reports/export")
@perm("reports")
def export_report(user):
    start, end, group = _report_range()
    which = request.args.get("type", "all")
    fmt = request.args.get("format", "xlsx")
    if which not in REPORT_SHEETS + ("all",):
        raise ApiError("Unknown report type.", 422)
    tables = report_tables(compute_report(start, end, group), which)
    name = f"aditya_{which}_report_{start}_{end}"
    if fmt == "csv":
        if which == "all":
            raise ApiError("Choose a single report for CSV, or use Excel for all sheets.", 422)
        buf = io.StringIO()
        w = csv.writer(buf)
        for rows in tables.values():
            w.writerows(rows)
        return Response(buf.getvalue(), mimetype="text/csv",
                        headers={"Content-Disposition": f"attachment; filename={name}.csv"})
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    wb = Workbook()
    wb.remove(wb.active)
    for title, rows in tables.items():
        ws = wb.create_sheet(title[:31])
        for row in rows:
            ws.append(row)
        for c in ws[1]:
            c.font = Font(bold=True, color="FFFFFF")
            c.fill = PatternFill("solid", fgColor="073B70")
        for col in ws.columns:
            ws.column_dimensions[col[0].column_letter].width = min(45, max(12, *(len(str(c.value or "")) + 2
                                                                               for c in col)))
        ws.freeze_panes = "A2"
    out = io.BytesIO()
    wb.save(out)
    audit(user, "report", None, "export", {"type": which, "from": start.isoformat(), "to": end.isoformat()})
    db.session.commit()
    return Response(out.getvalue(), headers={"Content-Disposition": f"attachment; filename={name}.xlsx"},
                    mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


def _trial_conversions():
    trial_users = {s.user_id for s in Subscription.query.filter_by(is_trial=True).all()}
    paid_users = {s.user_id for s in Subscription.query.filter(Subscription.is_trial.is_(False),
                                                               Subscription.status.in_(
                                                                   ["active", "paused", "completed"])).all()}
    conv = len(trial_users & paid_users)
    return {"trials": len(trial_users), "converted": conv,
            "rate": round(100 * conv / len(trial_users), 1) if trial_users else None}


# ======================================================================= content
CONTENT_KEYS = ("locations", "hero", "about", "journey", "quality_promise", "quality_process", "trust_highlights", "banners",
                "faqs", "policies")


@bp.get("/content/<key>")
@perm("content")
def get_block(user, key):
    if key not in CONTENT_KEYS:
        raise ApiError("Unknown content block.", 404)
    return ok(get_content(key))


@bp.put("/content/<key>")
@perm("content")
def put_block(user, key):
    if key not in CONTENT_KEYS:
        raise ApiError("Unknown content block.", 404)
    set_content(key, (request.get_json(force=True, silent=True) or {}).get("value"))
    audit(user, "content", None, "update", {"key": key})
    db.session.commit()
    return ok(get_content(key))


@bp.get("/blog")
@perm("content")
def blog(user):
    return ok([b.to_dict() for b in BlogPost.query.order_by(BlogPost.created_at.desc())])


@bp.post("/blog")
@perm("content")
def create_blog(user):
    p = request.get_json(force=True, silent=True) or {}
    require(p, "title", "body")
    p.setdefault("slug", re.sub(r"[^a-z0-9]+", "-", p["title"].lower()).strip("-")[:110])
    if BlogPost.query.filter_by(slug=p["slug"]).first():
        p["slug"] += "-" + secrets.token_hex(2)
    b = BlogPost()
    assign(b, p, ("slug", "title", "excerpt", "body", "cover_image", "author", "is_published"))
    db.session.add(b)
    db.session.flush()
    audit(user, "blog", b.id, "create", {"title": b.title})
    db.session.commit()
    return ok(b.to_dict(), 201)


@bp.put("/blog/<int:bid>")
@perm("content")
def update_blog(user, bid):
    b = get_or_404(BlogPost, bid, "Article")
    assign(b, request.get_json(force=True, silent=True) or {}, ("title", "excerpt", "body", "cover_image", "author",
                                                    "is_published"), user, "blog")
    db.session.commit()
    return ok(b.to_dict())


@bp.delete("/blog/<int:bid>")
@perm("content")
def delete_blog(user, bid):
    b = get_or_404(BlogPost, bid, "Article")
    db.session.delete(b)
    audit(user, "blog", bid, "delete")
    db.session.commit()
    return ok({"message": "Article deleted."})


@bp.get("/reviews")
@perm("content")
def reviews(user):
    return ok([r.to_dict() for r in Review.query.order_by(Review.is_approved, Review.created_at.desc())])


@bp.post("/reviews")
@perm("content")
def create_review(user):
    p = request.get_json(force=True, silent=True) or {}
    require(p, "name", "comment")
    r = Review(is_approved=True)
    assign(r, p, ("name", "avatar", "rating", "comment", "is_approved", "is_featured"))
    db.session.add(r)
    db.session.commit()
    return ok(r.to_dict(), 201)


@bp.put("/reviews/<int:rid>")
@perm("content")
def update_review(user, rid):
    r = get_or_404(Review, rid, "Review")
    assign(r, request.get_json(force=True, silent=True) or {}, ("name", "avatar", "rating", "comment", "is_approved",
                                                    "is_featured"), user, "review")
    db.session.commit()
    return ok(r.to_dict())


@bp.delete("/reviews/<int:rid>")
@perm("content")
def delete_review(user, rid):
    db.session.delete(get_or_404(Review, rid, "Review"))
    audit(user, "review", rid, "delete")
    db.session.commit()
    return ok({"message": "Review deleted."})


QR_FIELDS = ("title", "report_type", "issued_by", "report_date", "file_url", "summary", "is_published")


@bp.get("/quality-reports")
@perm("content")
def quality_reports(user):
    return ok([r.to_dict() for r in QualityReport.query.order_by(QualityReport.created_at.desc())])


@bp.post("/quality-reports")
@perm("content")
def create_qr(user):
    p = request.get_json(force=True, silent=True) or {}
    require(p, "title")
    r = QualityReport()
    assign(r, p, QR_FIELDS)
    db.session.add(r)
    db.session.flush()
    audit(user, "quality_report", r.id, "create", {"title": r.title})
    db.session.commit()
    return ok(r.to_dict(), 201)


@bp.put("/quality-reports/<int:rid>")
@perm("content")
def update_qr(user, rid):
    r = get_or_404(QualityReport, rid, "Report")
    assign(r, request.get_json(force=True, silent=True) or {}, QR_FIELDS, user, "quality_report")
    db.session.commit()
    return ok(r.to_dict())


@bp.delete("/quality-reports/<int:rid>")
@perm("content")
def delete_qr(user, rid):
    db.session.delete(get_or_404(QualityReport, rid, "Report"))
    audit(user, "quality_report", rid, "delete")
    db.session.commit()
    return ok({"message": "Report deleted."})


ALLOWED_EXT = {"png", "jpg", "jpeg", "webp", "gif", "pdf", "svg"}


@bp.post("/upload")
@login_required(roles=("admin",))
def upload(user):
    f = request.files.get("file")
    if not f or not f.filename:
        raise ApiError("Choose a file to upload.", 422)
    ext = f.filename.rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_EXT:
        raise ApiError("Allowed files: images and PDF.", 422)
    name = f"{uuid.uuid4().hex[:12]}_{secure_filename(f.filename)}"
    os.makedirs(current_app.config["UPLOAD_FOLDER"], exist_ok=True)
    f.save(os.path.join(current_app.config["UPLOAD_FOLDER"], name))
    return ok({"url": f"/uploads/{name}"}, 201)


# ======================================================================= enquiries & notifications
@bp.get("/enquiries")
@perm("enquiries")
def enquiries(user):
    q = ContactEnquiry.query
    if request.args.get("status"):
        q = q.filter_by(status=request.args["status"])
    if request.args.get("kind"):
        q = q.filter_by(kind=request.args["kind"])
    return ok([e.to_dict() for e in q.order_by(ContactEnquiry.created_at.desc()).limit(300)])


@bp.put("/enquiries/<int:eid>")
@perm("enquiries")
def update_enquiry(user, eid):
    e = get_or_404(ContactEnquiry, eid, "Enquiry")
    p = request.get_json(force=True, silent=True) or {}
    assign(e, p, ("status", "admin_reply"), user, "enquiry")
    if p.get("admin_reply") and e.user_id:
        notify(db.session.get(User, e.user_id), f"Reply to your {e.kind}", p["admin_reply"], "support")
    db.session.commit()
    return ok(e.to_dict())


@bp.get("/notifications")
@login_required(roles=("admin",))
def admin_notifications(user):
    rows = Notification.query.filter_by(audience="admin").order_by(Notification.created_at.desc()).limit(100).all()
    return ok([n.to_dict() for n in rows], unread=Notification.query.filter_by(audience="admin",
                                                                              is_read=False).count())


@bp.post("/notifications/read")
@login_required(roles=("admin",))
def admin_notifications_read(user):
    Notification.query.filter_by(audience="admin", is_read=False).update({"is_read": True})
    db.session.commit()
    return ok({})


@bp.post("/notifications/broadcast")
@perm("notifications")
def broadcast(user):
    p = request.get_json(force=True, silent=True) or {}
    require(p, "title", "message")
    q = User.query.filter_by(role="customer", is_active=True)
    if p.get("audience") == "active":
        q = q.filter(User.id.in_(db.session.query(Subscription.user_id).filter(Subscription.status == "active")))
    n = 0
    for u in q.all():
        notify(u, p["title"], p["message"], "announcement", email=bool(p.get("email")))
        n += 1
    audit(user, "notification", None, "broadcast", {"title": p["title"], "recipients": n})
    db.session.commit()
    return ok({"sent": n})


# ======================================================================= settings, admins, audit
@bp.get("/settings")
@perm("settings")
def get_settings(user):
    return ok(settings())


@bp.put("/settings")
@perm("settings")
def put_settings(user):
    p = request.get_json(force=True, silent=True) or {}
    cur = settings()
    cur.update(p)
    set_content("settings", cur)
    audit(user, "settings", None, "update", {"keys": list(p.keys())})
    db.session.commit()
    return ok(cur)


@bp.get("/integrations")
@perm("settings")
def integrations(user):
    """Which server-side integrations are configured (keys themselves are never returned)."""
    from ..services.messaging import whatsapp_enabled, sms_enabled
    cfg = current_app.config
    return ok({
        "whatsapp": {"configured": bool(whatsapp_enabled()), "template": cfg.get("WHATSAPP_TEMPLATE") or None,
                     "otp_template": cfg.get("WHATSAPP_OTP_TEMPLATE") or None,
                     "enabled": bool(settings().get("whatsapp_notifications"))},
        "sms": {"configured": bool(sms_enabled()), "provider": cfg.get("SMS_PROVIDER") or None},
        "email": {"configured": bool(cfg.get("SMTP_HOST"))},
        "payments": {"provider": cfg.get("PAYMENT_PROVIDER")},
    })


@bp.post("/integrations/email-test")
@limiter.limit("5 per minute")
@perm("settings")
def email_test(user):
    from ..services.messaging import test_email
    p = request.get_json(force=True, silent=True) or {}
    to = (p.get("email") or user.email or "").strip()
    if "@" not in to:
        raise ApiError("Enter a valid email address.", 422, "email")
    good, msg = test_email(to)
    if not good:
        raise ApiError(msg, 422)
    return ok({"message": msg})


@bp.post("/integrations/whatsapp-test")
@limiter.limit("5 per minute")
@perm("settings")
def whatsapp_test(user):
    from ..services.messaging import whatsapp_enabled, send_whatsapp
    p = request.get_json(force=True, silent=True) or {}
    phone = re.sub(r"\D", "", p.get("phone") or "")[-10:]
    if not re.match(r"^[6-9]\d{9}$", phone):
        raise ApiError("Enter a valid 10-digit mobile number.", 422, "phone")
    if not whatsapp_enabled():
        raise ApiError("WhatsApp is not set up on the server yet. Add WHATSAPP_PROVIDER=meta, WHATSAPP_TOKEN and "
                       "WHATSAPP_PHONE_NUMBER_ID to the server environment.", 422)
    if not send_whatsapp(phone, "Test message from Aditya Milk Dairy – WhatsApp updates are working."):
        raise ApiError("WhatsApp did not accept the message. Check the token, phone number ID and template name "
                       "(see the server log for details).", 502)
    audit(user, "settings", None, "whatsapp_test", {"phone": phone[-4:]})
    db.session.commit()
    return ok({"message": "Test message sent. Check WhatsApp on that phone."})


@bp.get("/admins")
@perm("roles")
def admins(user):
    return ok({"admins": [u.to_dict() for u in User.query.filter_by(role="admin")],
               "roles": [r.to_dict() for r in AdminRole.query.all()]})


@bp.post("/admins")
@perm("roles")
def create_admin(user):
    p = request.get_json(force=True, silent=True) or {}
    require(p, "name", "email", "password", "admin_role_id")
    if User.query.filter_by(email=p["email"].lower()).first():
        raise ApiError("Email already in use.", 409, "email")
    u = User(email=p["email"].lower(), phone=p.get("phone"), role="admin", admin_role_id=int(p["admin_role_id"]),
             email_verified=True)
    u.set_password(p["password"])
    u.profile = CustomerProfile(full_name=p["name"])
    db.session.add(u)
    db.session.flush()
    audit(user, "admin", u.id, "create", {"email": u.email})
    db.session.commit()
    return ok(u.to_dict(), 201)


@bp.put("/admins/<int:uid>")
@perm("roles")
def update_admin(user, uid):
    u = get_or_404(User, uid, "Admin")
    if u.role != "admin":
        raise ApiError("Not an admin account.", 422)
    p = request.get_json(force=True, silent=True) or {}
    if u.id == user.id and p.get("is_active") is False:
        raise ApiError("You cannot deactivate your own account.", 422)
    assign(u, p, ("is_active", "admin_role_id"), user, "admin")
    db.session.commit()
    return ok(u.to_dict())


@bp.get("/audit")
@perm("settings")
def audit_log(user):
    q = AuditLog.query
    if request.args.get("entity"):
        q = q.filter_by(entity=request.args["entity"])
    rows, meta = paginate(q.order_by(AuditLog.created_at.desc()), 50)
    return ok([r.to_dict() for r in rows], meta=meta)


# ======================================================================= approvals
@bp.get("/skip-requests")
@perm("bookings")
def skip_requests(user):
    q = SubscriptionSkip.query
    st = request.args.get("status", "pending")
    if st:
        q = q.filter_by(status=st)
    return ok([k.to_dict() for k in q.order_by(SubscriptionSkip.skip_date).limit(300)])


@bp.post("/skip-requests/<int:rid>/<action>")
@perm("bookings")
def skip_request_action(user, rid, action):
    req = get_or_404(SubscriptionSkip, rid, "Skip request")
    if action == "approve":
        if req.status != "pending":
            raise ApiError("This request is not pending.", 422)
        if req.skip_date <= today():
            raise ApiError("That date has already passed – reject the request instead.", 422)
        dsvc.approve_skip(req, user)
    elif action == "reject":
        dsvc.reject_skip(req, user, (request.get_json(force=True, silent=True) or {}).get("reason"))
    else:
        raise ApiError("Unknown action.", 404)
    db.session.commit()
    return ok(req.to_dict())


# ======================================================================= roles & permissions
@bp.get("/roles")
@perm("roles")
def roles(user):
    perms = AdminPermission.query.order_by(AdminPermission.id).all()
    return ok({"roles": [{**r.to_dict(), "users": User.query.filter_by(admin_role_id=r.id).count()}
                         for r in AdminRole.query.order_by(AdminRole.id)],
               "permissions": [p.to_dict() for p in perms],
               "modules": [{"code": c, "name": n} for c, n in ADMIN_MODULES]})


def _apply_role(role, p):
    if "name" in p:
        if not (p["name"] or "").strip():
            raise ApiError("Role name is required.", 422, "name")
        dup = AdminRole.query.filter(AdminRole.name == p["name"].strip(), AdminRole.id != (role.id or 0)).first()
        if dup:
            raise ApiError("A role with this name already exists.", 409, "name")
        role.name = p["name"].strip()[:50]
    if "description" in p:
        role.description = (p["description"] or "")[:200]
    if "permissions" in p and not role.is_super:
        codes = set(p["permissions"] or [])
        role.permissions = AdminPermission.query.filter(AdminPermission.code.in_(codes)).all() if codes else []


@bp.post("/roles")
@perm("roles")
def create_role(user):
    p = request.get_json(force=True, silent=True) or {}
    require(p, "name")
    r = AdminRole()
    _apply_role(r, p)
    db.session.add(r)
    db.session.flush()
    audit(user, "role", r.id, "create", {"name": r.name, "permissions": r.codes})
    db.session.commit()
    return ok(r.to_dict(), 201)


@bp.put("/roles/<int:rid>")
@perm("roles")
def update_role(user, rid):
    r = get_or_404(AdminRole, rid, "Role")
    before = r.codes
    _apply_role(r, request.get_json(force=True, silent=True) or {})
    audit(user, "role", r.id, "update", {"from": before, "to": r.codes})
    db.session.commit()
    return ok(r.to_dict())


@bp.delete("/roles/<int:rid>")
@perm("roles")
def delete_role(user, rid):
    r = get_or_404(AdminRole, rid, "Role")
    if r.is_super:
        raise ApiError("The owner role cannot be deleted.", 422)
    if User.query.filter_by(admin_role_id=rid, role="admin").count():
        raise ApiError("Move the admins using this role to another role first.", 409)
    db.session.delete(r)
    audit(user, "role", rid, "delete", {"name": r.name})
    db.session.commit()
    return ok({"message": "Role deleted."})


@bp.delete("/admins/<int:uid>")
@perm("roles")
def delete_admin(user, uid):
    u = get_or_404(User, uid, "Admin")
    if u.role != "admin":
        raise ApiError("Not an admin account.", 422)
    if u.id == user.id:
        raise ApiError("You cannot delete your own account.", 422)
    if u.admin_role and u.admin_role.is_super and \
            User.query.join(AdminRole).filter(AdminRole.is_super.is_(True), User.is_active.is_(True)).count() <= 1:
        raise ApiError("At least one active owner account must remain.", 422)
    # keep the row (audit history refers to it) but remove access
    u.is_active = False
    u.role = "disabled"
    u.admin_role_id = None
    u.email = f"deleted+{u.id}+{u.email}"[:120]
    audit(user, "admin", uid, "delete", {})
    db.session.commit()
    return ok({"message": "Admin removed."})


# ======================================================================= safe deletes
def _blocked(msg):
    raise ApiError(msg + " Deactivate it instead to keep history intact.", 409)


@bp.delete("/variants/<int:vid>")
@perm("products")
def delete_variant(user, vid):
    v = get_or_404(ProductVariant, vid, "Packet size")
    if OrderItem.query.filter_by(variant_id=vid).count() or SubscriptionItem.query.filter_by(variant_id=vid).count():
        _blocked("This packet size has been ordered before.")
    db.session.delete(v)
    audit(user, "variant", vid, "delete", {})
    db.session.commit()
    return ok({"message": "Packet size deleted."})


@bp.delete("/products/<int:pid>/permanent")
@perm("products")
def delete_product_permanent(user, pid):
    prod = get_or_404(Product, pid, "Product")
    ids = [v.id for v in prod.variants]
    if ids and (OrderItem.query.filter(OrderItem.variant_id.in_(ids)).count()
                or SubscriptionItem.query.filter(SubscriptionItem.variant_id.in_(ids)).count()):
        _blocked("This product has orders.")
    db.session.delete(prod)
    audit(user, "product", pid, "delete", {"name": prod.name})
    db.session.commit()
    return ok({"message": "Product deleted."})


@bp.delete("/plans/<int:pid>")
@perm("plans")
def delete_plan(user, pid):
    plan = get_or_404(SubscriptionPlan, pid, "Plan")
    if Subscription.query.filter_by(plan_id=pid).count() or Order.query.filter_by(plan_id=pid).count():
        _blocked("Customers have booked this plan.")
    db.session.delete(plan)
    audit(user, "plan", pid, "delete", {"code": plan.code})
    db.session.commit()
    return ok({"message": "Plan deleted."})


@bp.delete("/staff/<int:sid>")
@perm("staff")
def delete_staff(user, sid):
    st = get_or_404(DeliveryStaff, sid, "Delivery person")
    if DeliverySchedule.query.filter_by(staff_id=sid).count():
        _blocked("This person has delivery history.")
    DeliveryRoute.query.filter_by(default_staff_id=sid).update({"default_staff_id": None})
    if st.user:
        st.user.is_active = False
    db.session.delete(st)
    audit(user, "staff", sid, "delete", {"name": st.name})
    db.session.commit()
    return ok({"message": "Delivery person deleted."})


@bp.delete("/routes/<int:rid>")
@perm("staff")
def delete_route(user, rid):
    r = get_or_404(DeliveryRoute, rid, "Route")
    DeliverySchedule.query.filter_by(route_id=rid).update({"route_id": None})
    db.session.delete(r)
    audit(user, "route", rid, "delete", {"name": r.name})
    db.session.commit()
    return ok({"message": "Route deleted."})


@bp.delete("/pincodes/<int:pid>")
@perm("settings")
def delete_pincode(user, pid):
    row = get_or_404(ServiceablePincode, pid, "PIN code")
    active = Subscription.query.join(Address, Subscription.address_id == Address.id).filter(
        Address.pincode == row.pincode, Subscription.status.in_(["active", "paused", "pending_approval"])).count()
    if active:
        _blocked(f"{active} active subscription(s) deliver to this PIN code.")
    db.session.delete(row)
    audit(user, "pincode", pid, "delete", {"pincode": row.pincode})
    db.session.commit()
    return ok({"message": "PIN code removed."})


@bp.delete("/enquiries/<int:eid>")
@perm("enquiries")
def delete_enquiry(user, eid):
    db.session.delete(get_or_404(ContactEnquiry, eid, "Enquiry"))
    audit(user, "enquiry", eid, "delete", {})
    db.session.commit()
    return ok({"message": "Enquiry deleted."})


@bp.get("/orders")
@perm("bookings")
def orders(user):
    q = Order.query
    if request.args.get("status"):
        q = q.filter_by(status=request.args["status"])
    rows, meta = paginate(q.order_by(Order.created_at.desc()))
    return ok([o.to_dict() for o in rows], meta=meta)
