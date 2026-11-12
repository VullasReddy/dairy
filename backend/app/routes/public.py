from flask import Blueprint, request
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity

from ..extensions import db
from ..models import (Product, SubscriptionPlan, Review, BlogPost, QualityReport, ContactEnquiry,
                      ServiceablePincode, User)
from ..services.pricing import quote, public_quote, is_serviceable
from ..extensions import limiter
from ..utils import ApiError, ok, require, get_content, settings, notify_admins

bp = Blueprint("public", __name__, url_prefix="/api/public")

PUBLIC_SETTINGS = ("business_name", "phone", "email", "whatsapp", "address", "city", "delivery_timings",
                   "social", "order_cutoff")


def optional_user():
    try:
        verify_jwt_in_request(optional=True)
        uid = get_jwt_identity()
        return db.session.get(User, int(uid)) if uid else None
    except Exception:
        return None


def plan_cards(plans):
    """'Starting from' price = cheapest available packet x 1/day x days, minus plan discount."""
    from ..models import ProductVariant
    cheapest = min([float(v.price) for v in ProductVariant.query.filter_by(is_available=True).all()
                    if v.product.is_active], default=0)
    out = []
    for p in plans:
        d = p.to_dict()
        base = cheapest * p.duration_days
        d["from_price"] = 0 if p.is_trial else round(base * (1 - float(p.discount_percent or 0) / 100))
        out.append(d)
    return out


def business():
    s = settings()
    return {k: s.get(k) for k in PUBLIC_SETTINGS}


@bp.get("/site")
def site():
    from flask import current_app
    from ..services.messaging import sms_enabled, whatsapp_enabled
    cfg = current_app.config
    return ok({"business": business(), "payment_provider": cfg["PAYMENT_PROVIDER"],
               "otp_login": bool(sms_enabled() or (whatsapp_enabled() and cfg.get("WHATSAPP_OTP_TEMPLATE"))),
               "email_enabled": bool(cfg.get("SMTP_HOST")), "hero": get_content("hero", {}), "about": get_content("about", {}),
               "journey": get_content("journey", []), "quality_promise": get_content("quality_promise", []),
               "trust_highlights": get_content("trust_highlights", []), "banners": get_content("banners", [])})


@bp.get("/home")
def home():
    products = Product.query.filter_by(is_active=True).order_by(Product.sort_order).all()
    plans = SubscriptionPlan.query.filter_by(is_active=True).order_by(SubscriptionPlan.sort_order).all()
    reviews = (Review.query.filter_by(is_approved=True).order_by(Review.is_featured.desc(), Review.id)
               .limit(3).all())
    data = site()[0].get_json()["data"]
    data.update({"products": [p.to_dict() for p in products], "plans": plan_cards(plans),
                 "testimonials": [r.to_dict() for r in reviews]})
    return ok(data)


@bp.get("/products")
def products():
    rows = Product.query.filter_by(is_active=True).order_by(Product.sort_order).all()
    return ok([p.to_dict() for p in rows])


@bp.get("/products/<slug>")
def product(slug):
    p = Product.query.filter_by(slug=slug, is_active=True).first()
    if not p:
        raise ApiError("Product not found.", 404)
    return ok(p.to_dict())


@bp.get("/plans")
def plans():
    rows = SubscriptionPlan.query.filter_by(is_active=True).order_by(SubscriptionPlan.sort_order).all()
    return ok(plan_cards(rows))


@bp.post("/quote")
def public_quote_route():
    p = request.get_json(force=True, silent=True) or {}
    q = quote(optional_user(), p.get("items", []), p.get("plan_id"), p.get("start_date"))
    return ok(public_quote(q))


@bp.get("/testimonials")
def testimonials():
    rows = Review.query.filter_by(is_approved=True).order_by(Review.created_at.desc()).all()
    return ok([r.to_dict() for r in rows])


@bp.get("/blog")
def blog():
    rows = BlogPost.query.filter_by(is_published=True).order_by(BlogPost.created_at.desc()).all()
    return ok([b.to_dict(full=False) for b in rows])


@bp.get("/blog/<slug>")
def blog_post(slug):
    b = BlogPost.query.filter_by(slug=slug, is_published=True).first()
    if not b:
        raise ApiError("Article not found.", 404)
    return ok(b.to_dict())


@bp.get("/faqs")
def faqs():
    return ok(get_content("faqs", []))


@bp.get("/quality")
def quality():
    rows = QualityReport.query.filter_by(is_published=True).order_by(QualityReport.report_date.desc()).all()
    return ok({"promise": get_content("quality_promise", []), "process": get_content("quality_process", []),
               "reports": [r.to_dict() for r in rows]})


@bp.get("/policies/<key>")
def policy(key):
    pols = get_content("policies", {}) or {}
    if key not in pols:
        raise ApiError("Policy not found.", 404)
    return ok(pols[key])


@bp.get("/pincode/<pin>")
def pincode(pin):
    row = ServiceablePincode.query.filter_by(pincode=pin.strip(), is_active=True).first()
    return ok({"pincode": pin, "serviceable": bool(row), "area": row.area if row else None,
               "city": row.city if row else None})


@bp.get("/service-areas")
def service_areas():
    rows = ServiceablePincode.query.filter_by(is_active=True).order_by(ServiceablePincode.city,
                                                                       ServiceablePincode.pincode).all()
    return ok([r.to_dict() for r in rows])


@bp.post("/contact")
@limiter.limit("5 per minute;30 per day")
def contact():
    p = request.get_json(force=True, silent=True) or {}
    require(p, "name", "message")
    if not p.get("email") and not p.get("phone"):
        raise ApiError("Please share an email or phone number so we can reply.", 422, "email")
    if len(p["message"]) > 3000:
        raise ApiError("Message is too long.", 422, "message")
    u = optional_user()
    e = ContactEnquiry(user_id=u.id if u else None, name=p["name"][:100], email=(p.get("email") or "")[:120],
                       phone=(p.get("phone") or "")[:15], kind=p.get("kind", "enquiry")
                       if p.get("kind") in ("enquiry", "complaint", "support") else "enquiry",
                       subject=(p.get("subject") or "")[:150], message=p["message"])
    db.session.add(e)
    notify_admins(f"New {e.kind}", f"{e.name}: {e.subject or e.message[:60]}", "enquiry")
    db.session.commit()
    return ok({"message": "Thank you! Our team will get back to you within 24 hours.", "id": e.id}, 201)


@bp.post("/newsletter")
@limiter.limit("5 per minute")
def newsletter():
    """Footer newsletter sign-up – kept with enquiries (kind = newsletter) so admins can see and export them."""
    import re
    p = request.get_json(force=True, silent=True) or {}
    email = (p.get("email") or "").strip().lower()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email) or len(email) > 120:
        raise ApiError("Please enter a valid email address.", 422, "email")
    if not ContactEnquiry.query.filter_by(kind="newsletter", email=email).first():
        db.session.add(ContactEnquiry(name=email.split("@")[0][:100], email=email, kind="newsletter",
                                      subject="Newsletter subscription", message="Subscribed from the website footer.",
                                      status="resolved"))
        db.session.commit()
    return ok({"message": "Thank you for subscribing! You'll hear about offers and updates first."}, 201)


# ---------------------------------------------------------------- location picker
def _city_list():
    from sqlalchemy import func
    counts = dict(db.session.query(ServiceablePincode.city, func.count(ServiceablePincode.id))
                  .filter(ServiceablePincode.is_active.is_(True)).group_by(ServiceablePincode.city).all())
    from ..locations import CITIES
    cities = [dict(c) for c in (get_content("locations") or CITIES) if c.get("name")]
    known = {c["name"] for c in cities}
    for name in counts:  # a city with delivery areas is always listed, even if not in the picker list
        if name not in known:
            cities.append({"name": name, "state": ""})
    for c in cities:
        c["areas"] = counts.get(c["name"], 0)
        c["available"] = c["areas"] > 0
    cities.sort(key=lambda c: (not c["available"], c["name"]))
    return cities


@bp.get("/locations")
def locations():
    return ok(_city_list())


@bp.get("/locate")
def locate():
    """Match browser GPS coordinates to the nearest known city (within the configured radius)."""
    import math
    try:
        lat, lng = float(request.args["lat"]), float(request.args["lng"])
        assert -90 <= lat <= 90 and -180 <= lng <= 180
    except Exception:
        raise ApiError("Invalid location.", 422)

    def km(c):
        r = 6371.0
        p1, p2 = math.radians(lat), math.radians(c["lat"])
        dp, dl = math.radians(c["lat"] - lat), math.radians(c["lng"] - lng)
        a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
        return round(2 * r * math.asin(math.sqrt(a)), 1)

    cities = [c for c in _city_list() if c.get("lat") is not None and c.get("lng") is not None]
    for c in cities:
        c["distance_km"] = km(c)
    radius = float(settings().get("location_radius_km", 50))
    nearest = min(cities, key=lambda c: c["distance_km"], default=None)
    available = [c for c in cities if c["available"]]
    nearest_available = min(available, key=lambda c: c["distance_km"], default=None)
    match = nearest if nearest and nearest["distance_km"] <= radius else None
    return ok({"city": match, "nearest_available": nearest_available, "radius_km": radius})
