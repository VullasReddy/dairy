"""Server-side price calculation. The client total is NEVER trusted (proposal §11)."""
from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

from ..extensions import db
from ..models import ProductVariant, SubscriptionPlan, Subscription, Address, ServiceablePincode, User
from ..utils import ApiError, parse_date, today, settings

TWO = Decimal("0.01")


def is_serviceable(pincode):
    return ServiceablePincode.query.filter_by(pincode=str(pincode).strip(), is_active=True).first() is not None


def trial_eligibility(user: User, phone=None):
    """One free trial per customer account AND per phone number."""
    from ..models import SubscriptionPlan
    if not SubscriptionPlan.query.filter_by(is_trial=True, is_active=True).first():
        return {"eligible": False, "reason": "Free trial is not available right now."}
    if user is None:
        return {"eligible": True, "reason": None}
    if user.trial_used:
        return {"eligible": False, "reason": "You have already used your free trial."}
    phone = phone or user.phone
    if phone and User.query.filter(User.phone == phone, User.id != user.id, User.trial_used.is_(True)).first():
        return {"eligible": False, "reason": "A free trial has already been used with this phone number."}
    if settings().get("trial_requires_verification") and not user.email_verified:
        return {"eligible": False, "reason": "Please verify your email address to claim the free trial."}
    existing = Subscription.query.filter(Subscription.user_id == user.id, Subscription.is_trial.is_(True),
                                         Subscription.status.in_(["active", "paused", "completed"])).first()
    if existing:
        return {"eligible": False, "reason": "You have already used your free trial."}
    return {"eligible": True, "reason": None}


def quote(user, items, plan_id, start_date=None, address_id=None, strict=False):
    """Return a full price breakdown. strict=True enforces checkout-only rules (address, date)."""
    if not items:
        raise ApiError("Your cart is empty. Add Cow Milk or Buffalo Milk to continue.", 422)
    plan = db.session.get(SubscriptionPlan, int(plan_id)) if plan_id else None
    if not plan or not plan.is_active:
        raise ApiError("Please choose a valid subscription plan.", 422, "plan_id")
    cfg = settings()
    max_qty = int(cfg.get("max_daily_qty", 10))

    lines, subtotal, packets = [], Decimal("0"), 0
    seen = set()
    for it in items:
        try:
            vid, qty = int(it.get("variant_id")), int(it.get("daily_qty", it.get("qty", 0)))
        except (TypeError, ValueError):
            raise ApiError("Invalid item in cart.", 422)
        if vid in seen:
            raise ApiError("The same packet size appears twice in your cart.", 422)
        seen.add(vid)
        v = db.session.get(ProductVariant, vid)
        if not v or not v.is_available or not v.product.is_active:
            raise ApiError("One of the selected milk packets is currently unavailable.", 422)
        if qty < 1 or qty > max_qty:
            raise ApiError(f"Daily quantity must be between 1 and {max_qty} packets.", 422)
        if plan.is_trial and not v.trial_eligible:
            raise ApiError(f"{v.product.name} {v.label} is not included in the free trial.", 422)
        unit = Decimal(v.price)
        line = (unit * qty * plan.duration_days).quantize(TWO)
        subtotal += line
        packets += qty
        lines.append({"variant_id": v.id, "product": v.product.name, "size": v.label, "image": v.product.image,
                      "daily_qty": qty, "unit_price": float(unit), "days": plan.duration_days,
                      "line_total": float(line), "_variant": v})

    discount = Decimal("0")
    eligibility = None
    if plan.is_trial:
        eligibility = trial_eligibility(user)
        if packets > plan.trial_max_packets:
            raise ApiError(f"The free trial allows up to {plan.trial_max_packets} packets per day.", 422)
        if strict and not eligibility["eligible"]:
            raise ApiError(eligibility["reason"], 422)
        discount = subtotal
    elif plan.discount_percent:
        discount = (subtotal * Decimal(plan.discount_percent) / 100).quantize(TWO, ROUND_HALF_UP)
    total = (subtotal - discount).quantize(TWO)

    result = {"plan": plan.to_dict(), "lines": [{k: v for k, v in l.items() if k != "_variant"} for l in lines],
              "subtotal": float(subtotal), "discount": float(discount), "total": float(total),
              "daily_packets": packets, "trial_eligibility": eligibility}

    if start_date:
        sd = parse_date(start_date, "start_date")
        earliest = today() + timedelta(days=1)
        if sd < earliest:
            raise ApiError("Deliveries can start from tomorrow onwards.", 422, "start_date")
        if sd > today() + timedelta(days=30):
            raise ApiError("Start date must be within the next 30 days.", 422, "start_date")
        result["start_date"] = sd.isoformat()
        result["end_date"] = (sd + timedelta(days=plan.duration_days - 1)).isoformat()

    if strict:
        if not start_date:
            raise ApiError("Please choose a start date.", 422, "start_date")
        addr = db.session.get(Address, int(address_id)) if address_id else None
        if not addr or addr.user_id != user.id or addr.is_deleted:
            raise ApiError("Please select a delivery address.", 422, "address_id")
        if not is_serviceable(addr.pincode):
            raise ApiError(f"Sorry, we do not deliver to PIN code {addr.pincode} yet.", 422, "address_id")
        result["address"] = addr.to_dict()

    result["_lines"] = lines
    result["_plan"] = plan
    return result


def public_quote(q):
    return {k: v for k, v in q.items() if not k.startswith("_")}
