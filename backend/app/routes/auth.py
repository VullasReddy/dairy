import re
import secrets
from datetime import datetime, timedelta

from flask import Blueprint, request, current_app
from flask_jwt_extended import create_access_token

from ..extensions import db
from ..models import User, CustomerProfile
from ..extensions import limiter
from ..utils import ApiError, ok, require, login_required, send_email, notify

bp = Blueprint("auth", __name__, url_prefix="/api/auth")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PHONE_RE = re.compile(r"^[6-9]\d{9}$")


def validate_password(pw):
    if len(pw or "") < 8 or not re.search(r"[A-Za-z]", pw) or not re.search(r"\d", pw):
        raise ApiError("Password must be at least 8 characters and include a letter and a number.", 422, "password")


def token_response(user):
    token = create_access_token(identity=str(user.id), additional_claims={"role": user.role})
    return {"token": token, "user": user.to_dict()}


@bp.post("/register")
@limiter.limit("5 per minute;30 per hour")
def register():
    p = request.get_json(force=True, silent=True) or {}
    require(p, "full_name", "email", "phone", "password")
    email = p["email"].strip().lower()
    phone = re.sub(r"\D", "", p["phone"])[-10:]
    if not EMAIL_RE.match(email):
        raise ApiError("Please enter a valid email address.", 422, "email")
    if not PHONE_RE.match(phone):
        raise ApiError("Please enter a valid 10-digit Indian mobile number.", 422, "phone")
    validate_password(p["password"])
    if User.query.filter_by(email=email).first():
        raise ApiError("An account with this email already exists. Please log in.", 409, "email")
    if User.query.filter_by(phone=phone, role="customer").first():
        raise ApiError("This mobile number is already registered.", 409, "phone")
    u = User(email=email, phone=phone, role="customer", verify_token=secrets.token_urlsafe(24))
    u.set_password(p["password"])
    u.profile = CustomerProfile(full_name=p["full_name"].strip()[:120])
    db.session.add(u)
    db.session.flush()
    link = f"{current_app.config['FRONTEND_URL']}/verify-email?token={u.verify_token}"
    send_email(u.email, "Verify your Aditya Milk Dairy account",
               f"Hi {u.name},\n\nWelcome to Aditya Milk Dairy! Verify your email: {link}\n")
    notify(u, "Welcome to Aditya Milk Dairy", "Your account is ready. Start with a free 1-day trial!", "info",
           email=False)
    db.session.commit()
    data = token_response(u)
    if current_app.config["DEV_MODE"]:
        data["dev_verify_token"] = u.verify_token
    return ok(data, 201)


@bp.post("/login")
@limiter.limit("10 per minute;60 per hour")
def login():
    p = request.get_json(force=True, silent=True) or {}
    require(p, "email", "password")
    ident = p["email"].strip().lower()
    u = User.query.filter((User.email == ident) | (User.phone == ident)).first()
    if not u or not u.check_password(p["password"]):
        raise ApiError("Incorrect email/phone or password.", 401)
    if not u.is_active:
        raise ApiError("Your account has been deactivated. Please contact support.", 403)
    return ok(token_response(u))


@bp.get("/me")
@login_required()
def me(user):
    d = user.to_dict()
    d["profile"] = user.profile.to_dict() if user.profile else None
    return ok(d)


@bp.post("/forgot-password")
@limiter.limit("5 per 15 minutes")
def forgot():
    p = request.get_json(force=True, silent=True) or {}
    require(p, "email")
    u = User.query.filter_by(email=p["email"].strip().lower()).first()
    data = {"message": "If that email is registered, a reset link has been sent."}
    if u:
        u.reset_token = secrets.token_urlsafe(24)
        u.reset_expires = datetime.utcnow() + timedelta(hours=1)
        link = f"{current_app.config['FRONTEND_URL']}/reset-password?token={u.reset_token}"
        send_email(u.email, "Reset your password", f"Reset your password (valid 1 hour): {link}")
        db.session.commit()
        if current_app.config["DEV_MODE"]:
            data["dev_reset_token"] = u.reset_token
    return ok(data)


@bp.post("/reset-password")
@limiter.limit("10 per 15 minutes")
def reset():
    p = request.get_json(force=True, silent=True) or {}
    require(p, "token", "password")
    u = User.query.filter_by(reset_token=p["token"]).first()
    if not u or not u.reset_expires or u.reset_expires < datetime.utcnow():
        raise ApiError("This reset link is invalid or has expired.", 400)
    validate_password(p["password"])
    u.set_password(p["password"])
    u.reset_token = None
    db.session.commit()
    return ok({"message": "Password updated. You can now log in."})


@bp.post("/verify-email")
@limiter.limit("20 per hour")
def verify_email():
    p = request.get_json(force=True, silent=True) or {}
    require(p, "token")
    u = User.query.filter_by(verify_token=p["token"]).first()
    if not u:
        raise ApiError("This verification link is invalid or already used.", 400)
    u.email_verified = True
    u.verify_token = None
    db.session.commit()
    return ok({"message": "Email verified successfully."})


@bp.post("/resend-verification")
@limiter.limit("5 per hour")
@login_required()
def resend(user):
    if user.email_verified:
        return ok({"message": "Your email is already verified."})
    user.verify_token = secrets.token_urlsafe(24)
    link = f"{current_app.config['FRONTEND_URL']}/verify-email?token={user.verify_token}"
    send_email(user.email, "Verify your email", f"Verify your email: {link}")
    db.session.commit()
    data = {"message": "Verification email sent."}
    if current_app.config["DEV_MODE"]:
        data["dev_verify_token"] = user.verify_token
    return ok(data)
