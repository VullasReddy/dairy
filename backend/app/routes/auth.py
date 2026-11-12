import hashlib
import hmac
import re
import secrets
from datetime import datetime, timedelta

from flask import Blueprint, request, current_app
from flask_jwt_extended import create_access_token

from ..extensions import db
from ..models import User, CustomerProfile, OtpCode
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


def _signup_otp_required():
    from ..services.messaging import sms_enabled, whatsapp_enabled
    cfg = current_app.config
    return bool(sms_enabled() or (whatsapp_enabled() and cfg.get("WHATSAPP_OTP_TEMPLATE")))


def _otp_serializer():
    from itsdangerous import URLSafeTimedSerializer
    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"], salt="signup-otp")


@bp.post("/register/send-otp")
@limiter.limit("3 per minute;10 per hour")
def register_send_otp():
    """Step 1 of sign-up when SMS is set up: text a 6-digit code to the new mobile number."""
    from ..services.messaging import send_sms_otp, send_whatsapp_otp
    p = request.get_json(force=True, silent=True) or {}
    phone = re.sub(r"\D", "", p.get("phone") or "")[-10:]
    if not PHONE_RE.match(phone):
        raise ApiError("Please enter a valid 10-digit Indian mobile number.", 422, "phone")
    if User.query.filter_by(phone=phone, role="customer").first():
        raise ApiError("This mobile number is already registered. Please log in.", 409, "phone")
    code = f"{secrets.randbelow(1_000_000):06d}"
    sent = send_sms_otp(phone, code) or send_whatsapp_otp(phone, code)
    dev = current_app.config["DEV_MODE"]
    if not sent and not dev:
        raise ApiError("Could not send the code right now. Please try again in a minute.", 503)
    token = _otp_serializer().dumps({"phone": phone, "h": _otp_hash(0, phone + code)})
    data = {"otp_token": token, "message": f"Code sent to +91 ••••• {phone[-5:]}", "resend_in": 30}
    if dev and not sent:
        data["dev_code"] = code
    return ok(data)


def _check_signup_otp(p, phone):
    from itsdangerous import BadSignature, SignatureExpired
    if not p.get("otp_token") or not p.get("otp"):
        raise ApiError("Please verify your mobile number with the code we send.", 422, "otp")
    try:
        d = _otp_serializer().loads(p["otp_token"], max_age=current_app.config["OTP_TTL_MINUTES"] * 60)
    except SignatureExpired:
        raise ApiError("The code has expired. Please request a new one.", 422, "otp")
    except BadSignature:
        raise ApiError("Please request a new code.", 422, "otp")
    code = re.sub(r"\D", "", str(p["otp"]))
    if d.get("phone") != phone or not hmac.compare_digest(d.get("h", ""), _otp_hash(0, phone + code)):
        raise ApiError("That code is incorrect.", 422, "otp")


@bp.post("/register")
@limiter.limit("5 per minute;30 per hour")
def register():
    p = request.get_json(force=True, silent=True) or {}
    require(p, "full_name", "phone", "password")
    email = (p.get("email") or "").strip().lower() or None  # email is optional – mobile number is the login
    phone = re.sub(r"\D", "", p["phone"])[-10:]
    if email and not EMAIL_RE.match(email):
        raise ApiError("Please enter a valid email address.", 422, "email")
    if not PHONE_RE.match(phone):
        raise ApiError("Please enter a valid 10-digit Indian mobile number.", 422, "phone")
    validate_password(p["password"])
    if _signup_otp_required():
        _check_signup_otp(p, phone)
    if email and User.query.filter_by(email=email).first():
        raise ApiError("An account with this email already exists. Please log in.", 409, "email")
    if User.query.filter_by(phone=phone, role="customer").first():
        raise ApiError("This mobile number is already registered.", 409, "phone")
    u = User(email=email, phone=phone, role="customer", verify_token=secrets.token_urlsafe(24) if email else None)
    u.set_password(p["password"])
    u.profile = CustomerProfile(full_name=p["full_name"].strip()[:120])
    db.session.add(u)
    db.session.flush()
    if email:
        link = f"{current_app.config['FRONTEND_URL']}/verify-email?token={u.verify_token}"
        send_email(u.email, "Verify your Aditya Milk Dairy account",
                   f"Hi {u.name},\n\nWelcome to Aditya Milk Dairy! Verify your email: {link}\n")
    notify(u, "Welcome to Aditya Milk Dairy", "Your account is ready. Choose your milk and plan to get fresh milk from tomorrow morning.", "info",
           email=False)
    db.session.commit()
    data = token_response(u)
    if current_app.config["DEV_MODE"] and u.verify_token:
        data["dev_verify_token"] = u.verify_token
    return ok(data, 201)


@bp.post("/login")
@limiter.limit("10 per minute;60 per hour")
def login():
    p = request.get_json(force=True, silent=True) or {}
    require(p, "email", "password")
    ident = p["email"].strip().lower()
    if "@" not in ident:  # mobile number: accept "+91 98480 12345", "098480…" etc.
        digits = re.sub(r"\D", "", ident)
        ident = digits[-10:] if len(digits) >= 10 else ident
        u = (User.query.filter_by(phone=ident, role="customer").first() or User.query.filter_by(phone=ident).first())
    else:
        u = User.query.filter_by(email=ident).first()
    if not u or not u.check_password(p["password"]):
        raise ApiError("Incorrect mobile number or password.", 401)
    if not u.is_active:
        raise ApiError("Your account has been deactivated. Please contact support.", 403)
    return ok(token_response(u))


# ------------------------------------------------------------------ OTP login (mobile or email)
OTP_RESEND_SECONDS = 30


def _otp_hash(user_id, code):
    key = current_app.config["SECRET_KEY"].encode()
    return hmac.new(key, f"{user_id}:{code}".encode(), hashlib.sha256).hexdigest()


def _find_by_identifier(ident):
    ident = (ident or "").strip().lower()
    digits = re.sub(r"\D", "", ident)
    if "@" in ident:
        if not EMAIL_RE.match(ident):
            raise ApiError("Please enter a valid email address.", 422, "identifier")
        return User.query.filter_by(email=ident).first(), "email"
    phone = digits[-10:]
    if not PHONE_RE.match(phone):
        raise ApiError("Enter your 10-digit mobile number or email.", 422, "identifier")
    u = (User.query.filter_by(phone=phone, role="customer").first()
         or User.query.filter_by(phone=phone).first())
    return u, "phone"


def _mask_phone(p):
    return "+91 ••••• " + p[-5:] if p else ""


def _mask_email(e):
    name, _, dom = e.partition("@")
    return (name[:2] + "•" * max(1, len(name) - 2)) + "@" + dom


@bp.post("/otp/request")
@limiter.limit("5 per minute;20 per hour")
def otp_request():
    from ..services.messaging import send_sms_otp, send_whatsapp_otp
    p = request.get_json(force=True, silent=True) or {}
    require(p, "identifier")
    u, kind = _find_by_identifier(p["identifier"])
    if not u or u.role == "admin":  # admin accounts always sign in with their password
        raise ApiError("No customer account found with this " + ("mobile number." if kind == "phone" else "email.")
                       + " Please create an account first.", 404, "identifier")
    if not u.is_active:
        raise ApiError("Your account has been deactivated. Please contact support.", 403)
    now = datetime.utcnow()
    last = OtpCode.query.filter_by(user_id=u.id).order_by(OtpCode.created_at.desc()).first()
    if last and (now - last.created_at).total_seconds() < OTP_RESEND_SECONDS:
        wait = OTP_RESEND_SECONDS - int((now - last.created_at).total_seconds())
        raise ApiError(f"Please wait {wait} seconds before requesting a new code.", 429)
    if OtpCode.query.filter(OtpCode.user_id == u.id, OtpCode.created_at > now - timedelta(hours=1)).count() >= 6:
        raise ApiError("Too many codes requested. Please try again in an hour or log in with your password.", 429)
    OtpCode.query.filter_by(user_id=u.id, used=False).update({"used": True})  # only the newest code works
    code = f"{secrets.randbelow(1_000_000):06d}"
    ttl = current_app.config["OTP_TTL_MINUTES"]
    db.session.add(OtpCode(user_id=u.id, code_hash=_otp_hash(u.id, code), expires_at=now + timedelta(minutes=ttl)))
    sent = []
    if kind == "phone":
        if send_sms_otp(u.phone, code):
            sent.append("SMS to " + _mask_phone(u.phone))
        if send_whatsapp_otp(u.phone, code):
            sent.append("WhatsApp to " + _mask_phone(u.phone))
    if u.email and send_email(u.email, f"{code} is your Aditya Milk Dairy login code",
                              f"Hi {u.name},\n\nYour login code is {code}. It is valid for {ttl} minutes.\n"
                              "Do not share this code with anyone. If you did not request it, ignore this email.\n"):
        sent.append("email to " + _mask_email(u.email))
    dev = current_app.config["DEV_MODE"]
    if not sent and not dev:
        db.session.rollback()
        raise ApiError("Login by code is not available right now. Please log in with your password.", 503)
    db.session.commit()
    data = {"sent_to": sent or ["(development mode – code shown below)"], "resend_in": OTP_RESEND_SECONDS,
            "expires_in": ttl * 60}
    if dev:
        data["dev_code"] = code
    return ok(data)


@bp.post("/otp/verify")
@limiter.limit("10 per minute;40 per hour")
def otp_verify():
    p = request.get_json(force=True, silent=True) or {}
    require(p, "identifier", "code")
    u, _ = _find_by_identifier(p["identifier"])
    code = re.sub(r"\D", "", str(p["code"]))
    bad = ApiError("That code is incorrect or has expired. Request a new code.", 401, "code")
    if not u or u.role == "admin" or len(code) != 6:
        raise bad
    otp = (OtpCode.query.filter_by(user_id=u.id, used=False).order_by(OtpCode.created_at.desc()).first())
    if not otp or otp.expires_at < datetime.utcnow():
        raise bad
    otp.attempts = (otp.attempts or 0) + 1
    if otp.attempts > 5:
        otp.used = True
        db.session.commit()
        raise ApiError("Too many wrong attempts. Please request a new code.", 401, "code")
    if not hmac.compare_digest(otp.code_hash, _otp_hash(u.id, code)):
        db.session.commit()
        raise bad
    otp.used = True
    if "@" in p["identifier"]:
        u.email_verified = True  # the code reached their inbox, so the email is theirs
    if not u.is_active:
        db.session.commit()
        raise ApiError("Your account has been deactivated. Please contact support.", 403)
    db.session.commit()
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
