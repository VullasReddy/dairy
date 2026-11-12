import os
from datetime import timedelta
from dotenv import load_dotenv

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-me-jwt-secret")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=int(os.getenv("JWT_HOURS", "12")))

    # MySQL in production:  mysql+pymysql://user:pass@localhost:3306/aditya_milk_dairy
    # SQLite is the zero-setup default for local development.
    # An empty DATABASE_URL in .env also falls back to SQLite.
    # Supports MySQL (mysql+pymysql://...), PostgreSQL (postgres://... or postgresql://...) and SQLite.
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL") or "sqlite:///" + os.path.join(BASE_DIR, "aditya_dairy.db")
    for _prefix in ("postgres://", "postgresql://"):  # hosted Postgres URLs (Supabase, Render, Neon, ...)
        if SQLALCHEMY_DATABASE_URI.startswith(_prefix):
            SQLALCHEMY_DATABASE_URI = "postgresql+psycopg2://" + SQLALCHEMY_DATABASE_URI[len(_prefix):]
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}

    UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
    MAX_CONTENT_LENGTH = 8 * 1024 * 1024  # 8 MB uploads

    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

    # Business timezone for delivery days and 'today' (see app/clock.py)
    BUSINESS_TZ = os.getenv("BUSINESS_TZ", "Asia/Kolkata")

    # Payments: "mock" (local testing, no real money) or "razorpay"
    PAYMENT_PROVIDER = os.getenv("PAYMENT_PROVIDER", "mock")  # mock | offline | razorpay
    RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "")
    RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "")
    RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET", "")

    # Email (optional). When SMTP_HOST is empty, emails are written to the log instead.
    SMTP_HOST = os.getenv("SMTP_HOST", "")
    SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
    MAIL_FROM = os.getenv("MAIL_FROM", "")  # empty = "Aditya Milk Dairy <SMTP_USER>"

    # WhatsApp (optional) – see app/services/messaging.py
    WHATSAPP_PROVIDER = os.getenv("WHATSAPP_PROVIDER", "")
    WHATSAPP_TOKEN = os.getenv("WHATSAPP_TOKEN", "")
    WHATSAPP_PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")
    WHATSAPP_TEMPLATE = os.getenv("WHATSAPP_TEMPLATE", "")
    WHATSAPP_LANG = os.getenv("WHATSAPP_LANG", "en")
    # Approved WhatsApp "Authentication" template for login codes (body {{1}} = code, with copy-code button)
    WHATSAPP_OTP_TEMPLATE = os.getenv("WHATSAPP_OTP_TEMPLATE", "")

    # SMS for mobile OTP login (optional): fast2sms | msg91. Without it, codes go by WhatsApp/email.
    SMS_PROVIDER = os.getenv("SMS_PROVIDER", "")
    FAST2SMS_API_KEY = os.getenv("FAST2SMS_API_KEY", "")
    MSG91_AUTH_KEY = os.getenv("MSG91_AUTH_KEY", "")
    MSG91_TEMPLATE_ID = os.getenv("MSG91_TEMPLATE_ID", "")
    OTP_TTL_MINUTES = int(os.getenv("OTP_TTL_MINUTES", "5"))

    # Rate limiting (use redis:// in production with several workers)
    RATELIMIT_ENABLED = os.getenv("RATELIMIT_ENABLED", "1") == "1"
    RATELIMIT_STORAGE_URI = os.getenv("RATELIMIT_STORAGE_URI", "memory://")
    RATELIMIT_HEADERS_ENABLED = True

    # In development the API returns reset/verify tokens in responses so you can test without email.
    DEV_MODE = os.getenv("DEV_MODE", "1") == "1"

    # Built React app served by Flask in production (frontend/dist). Leave as is.
    FRONTEND_DIST = os.getenv("FRONTEND_DIST", os.path.join(os.path.dirname(BASE_DIR), "frontend", "dist"))


def check_production(cfg):
    """Refuse to start a live server with unsafe settings."""
    if cfg.get("DEV_MODE"):
        return
    problems = []
    if cfg["SECRET_KEY"].startswith("change-me") or cfg["JWT_SECRET_KEY"].startswith("change-me"):
        problems.append("set SECRET_KEY and JWT_SECRET_KEY to long random values")
    if cfg["PAYMENT_PROVIDER"] == "mock":
        problems.append("PAYMENT_PROVIDER=mock is test-only; use offline or razorpay")
    if cfg["PAYMENT_PROVIDER"] == "razorpay" and not (cfg["RAZORPAY_KEY_ID"] and cfg["RAZORPAY_KEY_SECRET"]):
        problems.append("PAYMENT_PROVIDER=razorpay needs RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET")
    if problems:
        raise RuntimeError("Production configuration error: " + "; ".join(problems))
