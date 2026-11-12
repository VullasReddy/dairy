"""Database models – mirrors section 12 (Database Design) of the project proposal."""
from datetime import datetime, date
from decimal import Decimal
from werkzeug.security import generate_password_hash, check_password_hash
from .extensions import db


def money(v):
    return float(v or 0)


class TimestampMixin:
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ---------------------------------------------------------------- users & roles
role_permissions = db.Table(
    "role_permissions",
    db.Column("role_id", db.Integer, db.ForeignKey("admin_roles.id", ondelete="CASCADE"), primary_key=True),
    db.Column("permission_id", db.Integer, db.ForeignKey("admin_permissions.id", ondelete="CASCADE"), primary_key=True),
)

# Admin modules. Each has a ".view" and a ".manage" permission (manage = add/edit/activate/deactivate/delete).
ADMIN_MODULES = [
    ("dashboard", "Dashboard"), ("reports", "Reports & Analytics"), ("bookings", "Bookings & Subscriptions"),
    ("deliveries", "Daily Deliveries"), ("staff", "Delivery Staff & Routes"), ("payments", "Payments & Refunds"),
    ("customers", "Customers"), ("products", "Products, Prices & Packet Sizes"), ("plans", "Subscription Plans"),
    ("content", "Website Content, Reviews & Quality"), ("enquiries", "Contact Enquiries"),
    ("notifications", "Notifications"), ("settings", "Settings & Serviceable Areas"), ("roles", "Admin Roles & Users"),
]


class AdminPermission(db.Model):
    __tablename__ = "admin_permissions"
    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(60), unique=True, nullable=False)  # e.g. "products.manage"
    module = db.Column(db.String(40), nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)

    def to_dict(self):
        return {"id": self.id, "code": self.code, "module": self.module, "name": self.name}


class AdminRole(db.Model):
    __tablename__ = "admin_roles"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False)
    description = db.Column(db.String(200))
    is_super = db.Column(db.Boolean, default=False)  # owner role – every permission, cannot be edited away
    permissions = db.relationship("AdminPermission", secondary=role_permissions, lazy="joined")

    @property
    def codes(self):
        return sorted(p.code for p in self.permissions)

    def to_dict(self):
        return {"id": self.id, "name": self.name, "description": self.description, "is_super": self.is_super,
                "permissions": self.codes}


class User(TimestampMixin, db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=True, index=True)  # optional for customers
    phone = db.Column(db.String(15), index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="customer")  # customer | admin | staff
    admin_role_id = db.Column(db.Integer, db.ForeignKey("admin_roles.id"))
    is_active = db.Column(db.Boolean, default=True)
    email_verified = db.Column(db.Boolean, default=False)
    verify_token = db.Column(db.String(64))
    reset_token = db.Column(db.String(64))
    reset_expires = db.Column(db.DateTime)
    trial_used = db.Column(db.Boolean, default=False)

    profile = db.relationship("CustomerProfile", backref="user", uselist=False, cascade="all, delete-orphan")
    admin_role = db.relationship("AdminRole")
    addresses = db.relationship("Address", backref="user", cascade="all, delete-orphan")

    def set_password(self, pw):
        self.password_hash = generate_password_hash(pw)

    def check_password(self, pw):
        return check_password_hash(self.password_hash, pw)

    @property
    def name(self):
        return self.profile.full_name if self.profile else (self.email or self.phone)

    def has_permission(self, code):
        """code like "products.view" / "products.manage". manage implies view."""
        if self.role != "admin" or not self.admin_role:
            return False
        if self.admin_role.is_super:
            return True
        codes = set(self.admin_role.codes)
        module = code.split(".")[0]
        return code in codes or (code.endswith(".view") and f"{module}.manage" in codes)

    def permission_codes(self):
        if self.role != "admin" or not self.admin_role:
            return []
        if self.admin_role.is_super:
            return [f"{m}.{a}" for m, _ in ADMIN_MODULES for a in ("view", "manage")]
        out = set(self.admin_role.codes)
        out |= {c.replace(".manage", ".view") for c in out if c.endswith(".manage")}
        return sorted(out)

    def to_dict(self):
        return {
            "id": self.id, "email": self.email, "phone": self.phone, "role": self.role,
            "name": self.name, "is_active": self.is_active, "email_verified": self.email_verified,
            "trial_used": self.trial_used,
            "admin_role": self.admin_role.to_dict() if self.admin_role else None,
            "permissions": self.permission_codes(),
            "created_at": self.created_at.isoformat(),
        }


class CustomerProfile(db.Model):
    __tablename__ = "customer_profiles"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), unique=True, nullable=False)
    full_name = db.Column(db.String(120), nullable=False)
    alt_phone = db.Column(db.String(15))
    preferred_time = db.Column(db.String(30), default="6:00 AM - 8:00 AM")
    whatsapp_opt_in = db.Column(db.Boolean, default=True, server_default=db.true(), nullable=False)

    def to_dict(self):
        return {"full_name": self.full_name, "alt_phone": self.alt_phone, "preferred_time": self.preferred_time,
                "whatsapp_opt_in": bool(self.whatsapp_opt_in)}


class Address(TimestampMixin, db.Model):
    __tablename__ = "addresses"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    label = db.Column(db.String(30), default="Home")
    line1 = db.Column(db.String(200), nullable=False)
    line2 = db.Column(db.String(200))
    landmark = db.Column(db.String(120))
    area = db.Column(db.String(100))
    city = db.Column(db.String(80), default="Narasaraopet")
    pincode = db.Column(db.String(6), nullable=False, index=True)
    instructions = db.Column(db.String(255))
    is_default = db.Column(db.Boolean, default=False)
    is_deleted = db.Column(db.Boolean, default=False)
    lat = db.Column(db.Float)  # map pin dropped by the customer (optional)
    lng = db.Column(db.Float)

    def full(self):
        parts = [self.line1, self.line2, self.landmark and f"Near {self.landmark}", self.area, self.city, self.pincode]
        return ", ".join(p for p in parts if p)

    def map_url(self):
        """Google Maps directions link for delivery staff – exact pin when set, otherwise the address text."""
        from urllib.parse import quote_plus
        dest = f"{self.lat},{self.lng}" if self.lat is not None and self.lng is not None else quote_plus(self.full())
        return f"https://www.google.com/maps/dir/?api=1&destination={dest}"

    def to_dict(self):
        return {
            "id": self.id, "label": self.label, "line1": self.line1, "line2": self.line2,
            "landmark": self.landmark, "area": self.area, "city": self.city, "pincode": self.pincode,
            "instructions": self.instructions, "is_default": self.is_default, "full": self.full(),
            "lat": self.lat, "lng": self.lng, "map_url": self.map_url(),
        }


# ---------------------------------------------------------------- catalogue
class Product(TimestampMixin, db.Model):
    __tablename__ = "products"
    id = db.Column(db.Integer, primary_key=True)
    slug = db.Column(db.String(60), unique=True, nullable=False)
    name = db.Column(db.String(100), nullable=False)
    tagline = db.Column(db.String(150))
    description = db.Column(db.Text)
    image = db.Column(db.String(255))
    nutrition = db.Column(db.JSON, default=dict)  # only verified values
    is_active = db.Column(db.Boolean, default=True)
    sort_order = db.Column(db.Integer, default=0)
    variants = db.relationship("ProductVariant", backref="product", cascade="all, delete-orphan",
                               order_by="ProductVariant.size_ml")

    def to_dict(self, include_inactive=False):
        vs = [v for v in self.variants if include_inactive or v.is_available]
        return {
            "id": self.id, "slug": self.slug, "name": self.name, "tagline": self.tagline,
            "description": self.description, "image": self.image, "nutrition": self.nutrition or {},
            "is_active": self.is_active, "sort_order": self.sort_order,
            "variants": [v.to_dict() for v in vs],
            "starting_price": min([money(v.price) for v in vs], default=None),
        }


class ProductVariant(db.Model):
    __tablename__ = "product_variants"
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    size_ml = db.Column(db.Integer, nullable=False)
    label = db.Column(db.String(30))  # "500 ml", "1 L"
    price = db.Column(db.Numeric(10, 2), nullable=False)
    mrp = db.Column(db.Numeric(10, 2))
    stock_litres = db.Column(db.Numeric(10, 2), default=0)  # daily available litres
    low_stock_litres = db.Column(db.Numeric(10, 2), default=20)
    is_available = db.Column(db.Boolean, default=True)
    trial_eligible = db.Column(db.Boolean, default=True)

    def to_dict(self):
        return {
            "id": self.id, "product_id": self.product_id, "product_name": self.product.name if self.product else None,
            "size_ml": self.size_ml, "label": self.label or f"{self.size_ml} ml", "price": money(self.price),
            "mrp": money(self.mrp) if self.mrp else None, "stock_litres": money(self.stock_litres),
            "low_stock_litres": money(self.low_stock_litres), "is_available": self.is_available,
            "trial_eligible": self.trial_eligible,
        }


class SubscriptionPlan(db.Model):
    __tablename__ = "subscription_plans"
    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(30), unique=True, nullable=False)
    name = db.Column(db.String(60), nullable=False)
    duration_days = db.Column(db.Integer, nullable=False)
    discount_percent = db.Column(db.Numeric(5, 2), default=0)
    is_trial = db.Column(db.Boolean, default=False)
    trial_max_packets = db.Column(db.Integer, default=2)
    display_price = db.Column(db.Numeric(10, 2))  # "starting from" price shown on cards
    is_popular = db.Column(db.Boolean, default=False)
    is_active = db.Column(db.Boolean, default=True)
    sort_order = db.Column(db.Integer, default=0)
    description = db.Column(db.String(255))

    def to_dict(self):
        return {
            "id": self.id, "code": self.code, "name": self.name, "duration_days": self.duration_days,
            "discount_percent": money(self.discount_percent), "is_trial": self.is_trial,
            "trial_max_packets": self.trial_max_packets, "display_price": money(self.display_price),
            "is_popular": self.is_popular, "is_active": self.is_active, "sort_order": self.sort_order,
            "description": self.description,
        }


# ---------------------------------------------------------------- delivery areas
class DeliveryRoute(db.Model):
    __tablename__ = "delivery_routes"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    area = db.Column(db.String(100))
    pincodes = db.Column(db.JSON, default=list)
    default_staff_id = db.Column(db.Integer, db.ForeignKey("delivery_staff.id"))
    is_active = db.Column(db.Boolean, default=True)

    def to_dict(self):
        return {"id": self.id, "name": self.name, "area": self.area, "pincodes": self.pincodes or [],
                "default_staff_id": self.default_staff_id, "is_active": self.is_active}


class ServiceablePincode(db.Model):
    __tablename__ = "serviceable_areas"
    id = db.Column(db.Integer, primary_key=True)
    pincode = db.Column(db.String(6), unique=True, nullable=False)
    area = db.Column(db.String(100))
    city = db.Column(db.String(60), nullable=False, default="Narasaraopet", server_default="Vijayawada", index=True)
    is_active = db.Column(db.Boolean, default=True)

    def to_dict(self):
        return {"id": self.id, "pincode": self.pincode, "area": self.area, "city": self.city,
                "is_active": self.is_active}


class DeliveryStaff(TimestampMixin, db.Model):
    __tablename__ = "delivery_staff"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), unique=True)
    name = db.Column(db.String(100), nullable=False)
    phone = db.Column(db.String(15), nullable=False)
    vehicle = db.Column(db.String(50))
    is_active = db.Column(db.Boolean, default=True)
    user = db.relationship("User")
    routes = db.relationship("DeliveryRoute", backref="default_staff", foreign_keys=[DeliveryRoute.default_staff_id])

    def to_dict(self):
        return {"id": self.id, "user_id": self.user_id, "name": self.name, "phone": self.phone,
                "vehicle": self.vehicle, "is_active": self.is_active,
                "login_email": self.user.email if self.user else None,
                "routes": [{"id": r.id, "name": r.name} for r in self.routes]}


# ---------------------------------------------------------------- orders & subscriptions
class Order(TimestampMixin, db.Model):
    __tablename__ = "orders"
    id = db.Column(db.Integer, primary_key=True)
    order_number = db.Column(db.String(30), unique=True, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    address_id = db.Column(db.Integer, db.ForeignKey("addresses.id"))
    plan_id = db.Column(db.Integer, db.ForeignKey("subscription_plans.id"))
    subtotal = db.Column(db.Numeric(10, 2), default=0)
    discount = db.Column(db.Numeric(10, 2), default=0)
    total = db.Column(db.Numeric(10, 2), default=0)
    status = db.Column(db.String(20), default="pending_payment")  # pending_payment|confirmed|failed|cancelled
    kind = db.Column(db.String(20), default="subscription", server_default="subscription", nullable=False)  # subscription | addon
    idempotency_key = db.Column(db.String(64), unique=True)
    user = db.relationship("User")
    address = db.relationship("Address")
    plan = db.relationship("SubscriptionPlan")
    items = db.relationship("OrderItem", backref="order", cascade="all, delete-orphan")
    subscription = db.relationship("Subscription", backref="order", uselist=False)
    addons = db.relationship("DeliveryAddon", backref="order")

    @property
    def linked_subscription(self):
        """The subscription this order belongs to (a plan booking, or the plan an extra-milk order was added to)."""
        if self.subscription:
            return self.subscription
        return self.addons[0].subscription if self.addons else None

    def to_dict(self):
        return {
            "id": self.id, "order_number": self.order_number, "user_id": self.user_id,
            "customer": self.user.name if self.user else None, "plan": self.plan.to_dict() if self.plan else None,
            "address": self.address.to_dict() if self.address else None, "subtotal": money(self.subtotal),
            "discount": money(self.discount), "total": money(self.total), "status": self.status,
            "items": [i.to_dict() for i in self.items], "created_at": self.created_at.isoformat(),
            "subscription_id": self.linked_subscription.id if self.linked_subscription else None,
            "kind": self.kind or "subscription",
            "addon_date": self.addons[0].delivery_date.isoformat() if self.addons else None,
        }


class OrderItem(db.Model):
    __tablename__ = "order_items"
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False)
    variant_id = db.Column(db.Integer, db.ForeignKey("product_variants.id"), nullable=False)
    daily_qty = db.Column(db.Integer, nullable=False)
    unit_price = db.Column(db.Numeric(10, 2), nullable=False)
    days = db.Column(db.Integer, nullable=False)
    line_total = db.Column(db.Numeric(10, 2), nullable=False)
    variant = db.relationship("ProductVariant")

    def to_dict(self):
        return {"variant_id": self.variant_id, "product": self.variant.product.name, "size": self.variant.label,
                "daily_qty": self.daily_qty, "unit_price": money(self.unit_price), "days": self.days,
                "line_total": money(self.line_total)}


class Subscription(TimestampMixin, db.Model):
    __tablename__ = "subscriptions"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"))
    plan_id = db.Column(db.Integer, db.ForeignKey("subscription_plans.id"), nullable=False)
    address_id = db.Column(db.Integer, db.ForeignKey("addresses.id"), nullable=False)
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)
    # pending_payment | pending_approval | active | paused | completed | cancelled | failed
    status = db.Column(db.String(20), default="pending_payment", index=True)
    paused_from = db.Column(db.Date)
    total_amount = db.Column(db.Numeric(10, 2), default=0)
    is_trial = db.Column(db.Boolean, default=False)
    cancel_reason = db.Column(db.String(255))
    refund_due = db.Column(db.Numeric(10, 2), default=0)
    reminder_sent = db.Column(db.Boolean, default=False)
    user = db.relationship("User")
    plan = db.relationship("SubscriptionPlan")
    address = db.relationship("Address")
    items = db.relationship("SubscriptionItem", backref="subscription", cascade="all, delete-orphan")
    skips = db.relationship("SubscriptionSkip", backref="subscription", cascade="all, delete-orphan")

    def skip_dates(self):
        """Dates actually skipped (approved). Pending/rejected requests do not affect deliveries."""
        return {k.skip_date for k in self.skips if k.status == "approved"}

    def remaining_days(self, on=None):
        from .clock import today
        on = on or today()
        if self.status not in ("active", "paused", "pending_approval"):
            return 0
        start = max(self.start_date, on)
        if start > self.end_date:
            return 0
        days = (self.end_date - start).days + 1
        return days - sum(1 for d in self.skip_dates() if start <= d <= self.end_date)

    def to_dict(self, detail=False):
        d = {
            "id": self.id, "user_id": self.user_id, "customer": self.user.name if self.user else None,
            "customer_phone": self.user.phone if self.user else None,
            "order_number": self.order.order_number if self.order else None, "plan": self.plan.name,
            "plan_code": self.plan.code, "duration_days": self.plan.duration_days,
            "start_date": self.start_date.isoformat(), "end_date": self.end_date.isoformat(),
            "status": self.status, "paused_from": self.paused_from.isoformat() if self.paused_from else None,
            "total_amount": money(self.total_amount), "is_trial": self.is_trial,
            "address": self.address.to_dict() if self.address else None,
            "items": [i.to_dict() for i in self.items], "skips": sorted(x.isoformat() for x in self.skip_dates()),
            "skip_requests": [k.to_dict() for k in sorted(self.skips, key=lambda k: k.skip_date)],
            "remaining_days": self.remaining_days(),
            "cancel_reason": self.cancel_reason, "refund_due": money(self.refund_due),
            "created_at": self.created_at.isoformat(),
        }
        return d


class SubscriptionItem(db.Model):
    __tablename__ = "subscription_items"
    id = db.Column(db.Integer, primary_key=True)
    subscription_id = db.Column(db.Integer, db.ForeignKey("subscriptions.id"), nullable=False)
    variant_id = db.Column(db.Integer, db.ForeignKey("product_variants.id"), nullable=False)
    daily_qty = db.Column(db.Integer, nullable=False)
    unit_price = db.Column(db.Numeric(10, 2), nullable=False)
    variant = db.relationship("ProductVariant")

    def to_dict(self):
        return {"variant_id": self.variant_id, "product": self.variant.product.name,
                "product_slug": self.variant.product.slug, "size": self.variant.label,
                "size_ml": self.variant.size_ml, "daily_qty": self.daily_qty, "unit_price": money(self.unit_price)}


class SubscriptionSkip(db.Model):
    __tablename__ = "subscription_skips"
    id = db.Column(db.Integer, primary_key=True)
    subscription_id = db.Column(db.Integer, db.ForeignKey("subscriptions.id"), nullable=False)
    skip_date = db.Column(db.Date, nullable=False)
    status = db.Column(db.String(12), default="approved", nullable=False)  # pending | approved | rejected
    reason = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    __table_args__ = (db.UniqueConstraint("subscription_id", "skip_date"),)

    def to_dict(self):
        s = self.subscription
        return {"id": self.id, "subscription_id": self.subscription_id, "date": self.skip_date.isoformat(),
                "status": self.status, "reason": self.reason,
                "customer": s.user.name if s and s.user else None,
                "created_at": self.created_at.isoformat() if self.created_at else None}


class DeliveryAddon(TimestampMixin, db.Model):
    """One-day extra milk on top of a subscription ("1 litre extra tomorrow"). Paid separately; once paid it is
    added to that day's delivery."""
    __tablename__ = "delivery_addons"
    id = db.Column(db.Integer, primary_key=True)
    subscription_id = db.Column(db.Integer, db.ForeignKey("subscriptions.id"), nullable=False, index=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False)
    delivery_date = db.Column(db.Date, nullable=False, index=True)
    variant_id = db.Column(db.Integer, db.ForeignKey("product_variants.id"), nullable=False)
    qty = db.Column(db.Integer, nullable=False)
    unit_price = db.Column(db.Numeric(10, 2), nullable=False)
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    status = db.Column(db.String(20), default="pending_payment", index=True)  # pending_payment|confirmed|cancelled|failed
    subscription = db.relationship("Subscription", backref=db.backref("addons", order_by="DeliveryAddon.delivery_date"))
    variant = db.relationship("ProductVariant")

    def snapshot(self):
        return {"product": self.variant.product.name, "size": self.variant.label, "qty": self.qty,
                "size_ml": self.variant.size_ml, "extra": True, "addon_id": self.id}

    def to_dict(self):
        return {"id": self.id, "subscription_id": self.subscription_id, "order_id": self.order_id,
                "order_number": self.order.order_number if self.order else None,
                "delivery_date": self.delivery_date.isoformat(), "variant_id": self.variant_id,
                "product": self.variant.product.name, "size": self.variant.label, "qty": self.qty,
                "unit_price": money(self.unit_price), "amount": money(self.amount), "status": self.status,
                "provider_order_id": (self.order.payments[-1].provider_order_id
                                      if self.order and self.order.payments else None),
                "created_at": self.created_at.isoformat()}


class OtpCode(db.Model):
    """One-time login codes. Only a hash of the code is stored."""
    __tablename__ = "otp_codes"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    code_hash = db.Column(db.String(64), nullable=False)
    purpose = db.Column(db.String(20), default="login")
    expires_at = db.Column(db.DateTime, nullable=False)
    attempts = db.Column(db.Integer, default=0)
    used = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Payment(TimestampMixin, db.Model):
    __tablename__ = "payments"
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    provider = db.Column(db.String(20), default="mock")
    provider_order_id = db.Column(db.String(80), unique=True, index=True)
    provider_payment_id = db.Column(db.String(80), unique=True)
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    currency = db.Column(db.String(5), default="INR")
    method = db.Column(db.String(30))
    status = db.Column(db.String(20), default="created")  # created|success|failed|refunded
    failure_reason = db.Column(db.String(255))
    refund_amount = db.Column(db.Numeric(10, 2), default=0)
    refund_note = db.Column(db.String(255))
    receipt_number = db.Column(db.String(30))
    order = db.relationship("Order", backref="payments")
    user = db.relationship("User")

    def to_dict(self):
        return {
            "id": self.id, "order_id": self.order_id, "order_number": self.order.order_number if self.order else None,
            "customer": self.user.name if self.user else None, "provider": self.provider,
            "provider_order_id": self.provider_order_id, "transaction_id": self.provider_payment_id,
            "amount": money(self.amount), "currency": self.currency, "method": self.method, "status": self.status,
            "failure_reason": self.failure_reason, "refund_amount": money(self.refund_amount),
            "refund_note": self.refund_note, "receipt_number": self.receipt_number,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


# ---------------------------------------------------------------- deliveries
DELIVERY_STATUSES = ["scheduled", "assigned", "out_for_delivery", "delivered", "missed", "skipped", "cancelled"]


class DeliverySchedule(TimestampMixin, db.Model):
    __tablename__ = "delivery_schedule"
    id = db.Column(db.Integer, primary_key=True)
    subscription_id = db.Column(db.Integer, db.ForeignKey("subscriptions.id"), nullable=False, index=True)
    delivery_date = db.Column(db.Date, nullable=False, index=True)
    staff_id = db.Column(db.Integer, db.ForeignKey("delivery_staff.id"))
    route_id = db.Column(db.Integer, db.ForeignKey("delivery_routes.id"))
    status = db.Column(db.String(20), default="scheduled", index=True)
    items_snapshot = db.Column(db.JSON, default=list)
    note = db.Column(db.String(255))
    delivered_at = db.Column(db.DateTime)
    subscription = db.relationship("Subscription")
    staff = db.relationship("DeliveryStaff")
    route = db.relationship("DeliveryRoute")
    tracking = db.relationship("DeliveryTracking", backref="schedule", cascade="all, delete-orphan",
                               order_by="DeliveryTracking.created_at")
    __table_args__ = (db.UniqueConstraint("subscription_id", "delivery_date"),)

    def to_dict(self, with_tracking=False):
        s = self.subscription
        a = s.address
        d = {
            "id": self.id, "subscription_id": self.subscription_id, "delivery_date": self.delivery_date.isoformat(),
            "customer": s.user.name, "phone": s.user.phone, "address": a.full() if a else "",
            "area": a.area if a else "", "pincode": a.pincode if a else "",
            "instructions": a.instructions if a else "", "items": self.items_snapshot or [],
            "lat": a.lat if a else None, "lng": a.lng if a else None, "map_url": a.map_url() if a else None,
            "staff_id": self.staff_id, "staff": self.staff.name if self.staff else None,
            "route_id": self.route_id, "route": self.route.name if self.route else None,
            "status": self.status, "note": self.note,
            "delivered_at": self.delivered_at.isoformat() if self.delivered_at else None,
        }
        if with_tracking:
            d["tracking"] = [t.to_dict() for t in self.tracking]
        return d


class DeliveryTracking(db.Model):
    __tablename__ = "delivery_tracking"
    id = db.Column(db.Integer, primary_key=True)
    schedule_id = db.Column(db.Integer, db.ForeignKey("delivery_schedule.id"), nullable=False)
    status = db.Column(db.String(20), nullable=False)
    note = db.Column(db.String(255))
    proof_image = db.Column(db.String(255))
    changed_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {"status": self.status, "note": self.note, "proof_image": self.proof_image,
                "created_at": self.created_at.isoformat()}


# ---------------------------------------------------------------- content & engagement
class Review(TimestampMixin, db.Model):
    __tablename__ = "reviews"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    name = db.Column(db.String(100), nullable=False)
    avatar = db.Column(db.String(255))
    rating = db.Column(db.Integer, default=5)
    comment = db.Column(db.Text, nullable=False)
    is_approved = db.Column(db.Boolean, default=False)
    is_featured = db.Column(db.Boolean, default=False)

    def to_dict(self):
        return {"id": self.id, "user_id": self.user_id, "name": self.name, "avatar": self.avatar,
                "rating": self.rating, "comment": self.comment, "is_approved": self.is_approved,
                "is_featured": self.is_featured, "created_at": self.created_at.isoformat()}


class Notification(db.Model):
    __tablename__ = "notifications"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), index=True)  # null => all admins
    audience = db.Column(db.String(10), default="customer")  # customer | admin
    title = db.Column(db.String(150), nullable=False)
    message = db.Column(db.Text)
    kind = db.Column(db.String(30), default="info")
    is_read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {"id": self.id, "title": self.title, "message": self.message, "kind": self.kind,
                "is_read": self.is_read, "created_at": self.created_at.isoformat()}


class BlogPost(TimestampMixin, db.Model):
    __tablename__ = "blog_posts"
    id = db.Column(db.Integer, primary_key=True)
    slug = db.Column(db.String(120), unique=True, nullable=False)
    title = db.Column(db.String(200), nullable=False)
    excerpt = db.Column(db.String(300))
    body = db.Column(db.Text)
    cover_image = db.Column(db.String(255))
    author = db.Column(db.String(100), default="Aditya Milk Dairy")
    is_published = db.Column(db.Boolean, default=True)

    def to_dict(self, full=True):
        d = {"id": self.id, "slug": self.slug, "title": self.title, "excerpt": self.excerpt,
             "cover_image": self.cover_image, "author": self.author, "is_published": self.is_published,
             "created_at": self.created_at.isoformat()}
        if full:
            d["body"] = self.body
        return d


class WebsiteContent(db.Model):
    """Key/value JSON blocks: hero, about, journey, faqs, policies, business details, banners."""
    __tablename__ = "website_content"
    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(60), unique=True, nullable=False)
    value = db.Column(db.JSON)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class QualityReport(TimestampMixin, db.Model):
    __tablename__ = "quality_reports"
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(150), nullable=False)
    report_type = db.Column(db.String(50), default="Lab Report")
    issued_by = db.Column(db.String(150))
    report_date = db.Column(db.Date)
    file_url = db.Column(db.String(255))
    summary = db.Column(db.Text)
    is_published = db.Column(db.Boolean, default=False)

    def to_dict(self):
        return {"id": self.id, "title": self.title, "report_type": self.report_type, "issued_by": self.issued_by,
                "report_date": self.report_date.isoformat() if self.report_date else None,
                "file_url": self.file_url, "summary": self.summary, "is_published": self.is_published}


class ContactEnquiry(TimestampMixin, db.Model):
    __tablename__ = "contact_enquiries"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120))
    phone = db.Column(db.String(15))
    kind = db.Column(db.String(20), default="enquiry")  # enquiry | complaint | support
    subject = db.Column(db.String(150))
    message = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(20), default="open")  # open | in_progress | resolved
    admin_reply = db.Column(db.Text)

    def to_dict(self):
        return {"id": self.id, "user_id": self.user_id, "name": self.name, "email": self.email, "phone": self.phone,
                "kind": self.kind, "subject": self.subject, "message": self.message, "status": self.status,
                "admin_reply": self.admin_reply, "created_at": self.created_at.isoformat()}


class AuditLog(db.Model):
    __tablename__ = "audit_logs"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    entity = db.Column(db.String(40), nullable=False)
    entity_id = db.Column(db.Integer)
    action = db.Column(db.String(60), nullable=False)
    details = db.Column(db.JSON)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    user = db.relationship("User")

    def to_dict(self):
        return {"id": self.id, "by": self.user.name if self.user else "system", "entity": self.entity,
                "entity_id": self.entity_id, "action": self.action, "details": self.details,
                "created_at": self.created_at.isoformat()}
