"""Payment gateway abstraction.

PAYMENT_PROVIDER=offline   -> UPI / cash: booking is reserved, the customer pays by UPI or cash and an admin
                              confirms the payment (Admin -> Bookings -> Record payment). Safe default for going live.
PAYMENT_PROVIDER=razorpay  -> Razorpay Orders API + HMAC signature verification + webhook
PAYMENT_PROVIDER=mock      -> local test gateway (no real money). Refused when DEV_MODE=0.

Any other Indian gateway (Cashfree, PayU, PhonePe PG, ...) can be added by implementing
create_gateway_order() and a signature check, then calling mark_success()/mark_failed().
"""
import hashlib
import hmac
import secrets
from datetime import timedelta

import requests
from flask import current_app

from ..extensions import db
from ..models import Payment, Subscription
from ..utils import ApiError, gen_code, notify, notify_admins, today, audit


def provider():
    return current_app.config["PAYMENT_PROVIDER"]


def create_gateway_order(payment: Payment):
    if provider() == "razorpay":
        cfg = current_app.config
        if not cfg["RAZORPAY_KEY_ID"] or not cfg["RAZORPAY_KEY_SECRET"]:
            raise ApiError("Online payments are not configured. Please contact support.", 503)
        r = requests.post("https://api.razorpay.com/v1/orders",
                          auth=(cfg["RAZORPAY_KEY_ID"], cfg["RAZORPAY_KEY_SECRET"]),
                          json={"amount": int(round(float(payment.amount) * 100)), "currency": "INR",
                                "receipt": payment.order.order_number, "payment_capture": 1}, timeout=15)
        if r.status_code >= 300:
            raise ApiError("Could not start payment with the gateway. Please try again.", 502)
        payment.provider_order_id = r.json()["id"]
    elif provider() == "offline":
        payment.provider_order_id = "offline_" + secrets.token_hex(8)
    else:
        payment.provider_order_id = "mock_order_" + secrets.token_hex(8)
    payment.provider = provider()
    return checkout_payload(payment)


def checkout_payload(payment: Payment):
    data = {"provider": payment.provider, "provider_order_id": payment.provider_order_id,
            "amount": float(payment.amount), "amount_paise": int(round(float(payment.amount) * 100)),
            "currency": "INR", "order_number": payment.order.order_number, "payment_id": payment.id}
    if payment.provider == "razorpay":
        data["key_id"] = current_app.config["RAZORPAY_KEY_ID"]
    if payment.provider == "offline":
        from ..utils import settings
        cfg = settings()
        data["upi_id"] = cfg.get("upi_id") or ""
        data["upi_name"] = cfg.get("business_name") or "Aditya Milk Dairy"
        data["instructions"] = cfg.get("payment_instructions") or ""
        data["support_phone"] = cfg.get("phone") or ""
    return data


def verify_razorpay_signature(order_id, payment_id, signature):
    secret = current_app.config["RAZORPAY_KEY_SECRET"].encode()
    expected = hmac.new(secret, f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature or "")


def verify_webhook_signature(raw_body: bytes, signature):
    secret = current_app.config["RAZORPAY_WEBHOOK_SECRET"].encode()
    expected = hmac.new(secret, raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature or "")


def _lock(provider_order_id):
    q = Payment.query.filter_by(provider_order_id=provider_order_id)
    try:
        q = q.with_for_update()
    except Exception:
        pass
    p = q.first()
    if not p:
        raise ApiError("Payment record not found.", 404)
    return p


def mark_success(provider_order_id, provider_payment_id, method="online"):
    """Idempotent: calling twice (redirect + webhook) never double-confirms."""
    p = _lock(provider_order_id)
    if p.status == "success":
        return p, False
    if p.status == "refunded":
        return p, False
    p.status = "success"
    p.provider_payment_id = provider_payment_id
    p.method = method
    p.receipt_number = gen_code("RCPT")
    order = p.order
    order.status = "confirmed"
    sub = order.subscription
    if sub and sub.status in ("pending_payment", "failed"):
        # If the customer paid after the chosen start date passed, shift the plan forward.
        if sub.start_date <= today():
            sub.start_date = today() + timedelta(days=1)
            sub.end_date = sub.start_date + timedelta(days=sub.plan.duration_days - 1)
        from .delivery import activate_after_confirmation
        activate_after_confirmation(sub)
    audit(None, "payment", p.id, "payment_success", {"txn": provider_payment_id, "amount": float(p.amount)})
    notify(order.user, "Payment successful",
           f"We received ₹{float(p.amount):,.2f} for order {order.order_number} (receipt {p.receipt_number}). "
           f"Your {sub.plan.name if sub else ''} subscription starts on {sub.start_date:%d %b %Y}." if sub else "",
           "payment")
    notify_admins("New paid subscription", f"{order.user.name} paid ₹{float(p.amount):,.2f} – {order.order_number}",
                  "booking")
    db.session.commit()
    return p, True


def mark_failed(provider_order_id, reason="Payment failed or was cancelled"):
    p = _lock(provider_order_id)
    if p.status in ("success", "refunded"):
        return p
    p.status = "failed"
    p.failure_reason = reason
    p.order.status = "failed"
    if p.order.subscription and p.order.subscription.status == "pending_payment":
        p.order.subscription.status = "failed"
    audit(None, "payment", p.id, "payment_failed", {"reason": reason})
    notify(p.order.user, "Payment failed", f"Payment for order {p.order.order_number} did not go through. "
                                           "You can retry from My Subscriptions.", "payment", email=False)
    db.session.commit()
    return p


def refund(payment: Payment, amount, note, actor):
    amount = float(amount)
    if payment.status != "success":
        raise ApiError("Only successful payments can be refunded.", 422)
    if amount <= 0 or amount > float(payment.amount) - float(payment.refund_amount or 0):
        raise ApiError("Refund amount is more than the refundable balance.", 422)
    if payment.provider == "razorpay":
        cfg = current_app.config
        r = requests.post(f"https://api.razorpay.com/v1/payments/{payment.provider_payment_id}/refund",
                          auth=(cfg["RAZORPAY_KEY_ID"], cfg["RAZORPAY_KEY_SECRET"]),
                          json={"amount": int(round(amount * 100))}, timeout=15)
        if r.status_code >= 300:
            raise ApiError("Gateway refused the refund: " + r.text[:200], 502)
    payment.refund_amount = float(payment.refund_amount or 0) + amount
    payment.refund_note = note
    if float(payment.refund_amount) >= float(payment.amount):
        payment.status = "refunded"
    sub = payment.order.subscription
    if sub:
        sub.refund_due = max(0, float(sub.refund_due or 0) - amount)
    audit(actor, "payment", payment.id, "refund", {"amount": amount, "note": note})
    notify(payment.user, "Refund processed", f"₹{amount:,.2f} has been refunded for order "
                                             f"{payment.order.order_number}. {note or ''}", "payment")
