import logging
import secrets
from datetime import date, datetime
from functools import wraps

from flask import current_app, jsonify, request
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity

from .extensions import db
from .models import User, AuditLog, Notification, WebsiteContent

log = logging.getLogger("aditya")


class ApiError(Exception):
    def __init__(self, message, status=400, field=None):
        super().__init__(message)
        self.message, self.status, self.field = message, status, field


def ok(data=None, status=200, **extra):
    body = {"ok": True}
    if data is not None:
        body["data"] = data
    body.update(extra)
    return jsonify(body), status


def require(payload, *fields):
    missing = [f for f in fields if payload.get(f) in (None, "", [])]
    if missing:
        raise ApiError(f"Please fill in: {', '.join(missing)}", 422, missing[0])


def parse_date(v, field="date"):
    try:
        return date.fromisoformat(str(v)[:10])
    except Exception:
        raise ApiError(f"Invalid {field}. Use YYYY-MM-DD.", 422, field)


def today():
    from .clock import today as _t
    return _t()


def gen_code(prefix):
    return f"{prefix}{datetime.utcnow():%y%m%d}{secrets.token_hex(3).upper()}"


def current_user():
    uid = get_jwt_identity()
    user = db.session.get(User, int(uid)) if uid else None
    if not user or not user.is_active:
        raise ApiError("Your session has expired. Please log in again.", 401)
    return user


def login_required(roles=None, permission=None):
    """roles: allowed roles. permission: admin module ("products") -> needs "products.view" for GET
    requests and "products.manage" for create/update/delete; or an explicit code ("roles.manage")."""
    def deco(fn):
        @wraps(fn)
        def wrapper(*a, **kw):
            verify_jwt_in_request()
            user = current_user()
            if roles and user.role not in roles:
                raise ApiError("You do not have access to this area.", 403)
            if permission and user.role == "admin":
                code = permission if "." in permission else \
                    f"{permission}.{'view' if request.method in ('GET', 'HEAD') else 'manage'}"
                if not user.has_permission(code):
                    raise ApiError("Your admin role does not include this permission "
                                   f"({code.replace('.', ' – ')}).", 403)
            return fn(user, *a, **kw)
        return wrapper
    return deco


def audit(user, entity, entity_id, action, details=None):
    db.session.add(AuditLog(user_id=user.id if user else None, entity=entity, entity_id=entity_id,
                            action=action, details=details or {}))


def send_email(to, subject, body):
    from .services.messaging import send_email as _send
    return _send(to, subject, body)


# Notification kinds that are also sent on WhatsApp when the integration is enabled.
WHATSAPP_KINDS = {"payment", "subscription", "booking", "delivery", "reminder"}


def notify(user, title, message, kind="info", email=True, whatsapp=None):
    """In-app notification + optional email + optional WhatsApp (configurable integrations)."""
    db.session.add(Notification(user_id=user.id, audience="customer", title=title, message=message, kind=kind))
    if email and user.email:
        send_email(user.email, f"Aditya Milk Dairy – {title}", message)
    if whatsapp is None:
        whatsapp = kind in WHATSAPP_KINDS and bool(settings().get("whatsapp_notifications"))
    if whatsapp and user.phone:
        from .services.messaging import send_whatsapp
        send_whatsapp(user.phone, f"{title}: {message}")


def notify_admins(title, message, kind="info"):
    db.session.add(Notification(user_id=None, audience="admin", title=title, message=message, kind=kind))


def get_content(key, default=None):
    row = WebsiteContent.query.filter_by(key=key).first()
    return row.value if row else default


def set_content(key, value):
    row = WebsiteContent.query.filter_by(key=key).first()
    if not row:
        row = WebsiteContent(key=key)
        db.session.add(row)
    row.value = value
    return row


def settings():
    return get_content("settings", {}) or {}
