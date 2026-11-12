"""Outbound customer messaging: email (SMTP) and WhatsApp (Meta WhatsApp Cloud API).

Both are optional and configured only through environment variables. When not configured the
message is written to the server log, so the app works fully in development.

WhatsApp setup (Meta WhatsApp Business Platform):
  WHATSAPP_PROVIDER=meta
  WHATSAPP_TOKEN=<permanent access token>
  WHATSAPP_PHONE_NUMBER_ID=<phone number id>
  WHATSAPP_TEMPLATE=<approved template name with one {{1}} body variable>   (optional)
Business-initiated WhatsApp messages need an approved template; free-form text is only
delivered inside the 24-hour customer-service window. With WHATSAPP_TEMPLATE set, the
notification text is passed as the template's {{1}} parameter.
"""
import logging
import smtplib
from email.message import EmailMessage

import requests
from flask import current_app

log = logging.getLogger("aditya.messaging")


def _deliver(to, subject, body):
    cfg = current_app.config
    msg = EmailMessage()
    sender = cfg.get("MAIL_FROM") or (f"Aditya Milk Dairy <{cfg['SMTP_USER']}>" if cfg.get("SMTP_USER") else "no-reply@localhost")
    msg["From"], msg["To"], msg["Subject"] = sender, to, subject
    msg.set_content(body)
    port = int(cfg.get("SMTP_PORT") or 587)
    if port == 465:  # SSL (e.g. Gmail / Hostinger on 465)
        with smtplib.SMTP_SSL(cfg["SMTP_HOST"], port, timeout=15) as s:
            if cfg["SMTP_USER"]:
                s.login(cfg["SMTP_USER"], cfg["SMTP_PASSWORD"])
            s.send_message(msg)
    else:  # STARTTLS on 587
        with smtplib.SMTP(cfg["SMTP_HOST"], port, timeout=15) as s:
            s.starttls()
            if cfg["SMTP_USER"]:
                s.login(cfg["SMTP_USER"], cfg["SMTP_PASSWORD"])
            s.send_message(msg)


def send_email(to, subject, body):
    cfg = current_app.config
    if not cfg.get("SMTP_HOST"):
        log.info("EMAIL (SMTP not configured) to=%s subject=%s\n%s", to, subject, body)
        return False
    try:
        _deliver(to, subject, body)
        return True
    except Exception as e:  # a failed email must never break a booking
        log.warning("Email failed: %s", e)
        return False


def test_email(to):
    """Admin 'send test email' – returns (ok, readable reason)."""
    cfg = current_app.config
    if not cfg.get("SMTP_HOST"):
        return False, "Email is not set up on the server. Add SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASSWORD to backend/.env and restart."
    try:
        _deliver(to, "Test email from Aditya Milk Dairy", "Emails from your website are working.")
        return True, "Test email sent. Check the inbox (and Spam folder)."
    except smtplib.SMTPAuthenticationError:
        return False, "Login to the mail server failed. For Gmail use a 16-letter App Password, not your normal password."
    except Exception as e:
        return False, f"Could not send: {e}"


def whatsapp_enabled():
    cfg = current_app.config
    return cfg.get("WHATSAPP_PROVIDER") == "meta" and cfg.get("WHATSAPP_TOKEN") and cfg.get("WHATSAPP_PHONE_NUMBER_ID")


def send_whatsapp(phone, text):
    if not phone:
        return False
    to = "91" + phone[-10:] if len(phone) <= 10 else phone.lstrip("+")
    if not whatsapp_enabled():
        log.info("WHATSAPP (not configured) to=%s: %s", to, text)
        return False
    cfg = current_app.config
    if cfg.get("WHATSAPP_TEMPLATE"):
        payload = {"messaging_product": "whatsapp", "to": to, "type": "template",
                   "template": {"name": cfg["WHATSAPP_TEMPLATE"], "language": {"code": cfg.get("WHATSAPP_LANG", "en")},
                                "components": [{"type": "body", "parameters": [{"type": "text", "text": text[:1000]}]}]}}
    else:
        payload = {"messaging_product": "whatsapp", "to": to, "type": "text", "text": {"body": text[:4000]}}
    try:
        r = requests.post(f"https://graph.facebook.com/v20.0/{cfg['WHATSAPP_PHONE_NUMBER_ID']}/messages",
                          headers={"Authorization": f"Bearer {cfg['WHATSAPP_TOKEN']}"}, json=payload, timeout=10)
        if r.status_code >= 300:
            log.warning("WhatsApp send failed %s: %s", r.status_code, r.text[:300])
            return False
        return True
    except Exception as e:
        log.warning("WhatsApp error: %s", e)
        return False


def _wa_to(phone):
    return "91" + phone[-10:] if len(phone) <= 10 else phone.lstrip("+")


def send_whatsapp_otp(phone, code):
    """Login code via an approved WhatsApp Authentication template (copy-code button)."""
    cfg = current_app.config
    if not (phone and whatsapp_enabled() and cfg.get("WHATSAPP_OTP_TEMPLATE")):
        return False
    payload = {"messaging_product": "whatsapp", "to": _wa_to(phone), "type": "template",
               "template": {"name": cfg["WHATSAPP_OTP_TEMPLATE"], "language": {"code": cfg.get("WHATSAPP_LANG", "en")},
                            "components": [{"type": "body", "parameters": [{"type": "text", "text": code}]},
                                           {"type": "button", "sub_type": "url", "index": "0",
                                            "parameters": [{"type": "text", "text": code}]}]}}
    try:
        r = requests.post(f"https://graph.facebook.com/v20.0/{cfg['WHATSAPP_PHONE_NUMBER_ID']}/messages",
                          headers={"Authorization": f"Bearer {cfg['WHATSAPP_TOKEN']}"}, json=payload, timeout=10)
        if r.status_code >= 300:
            log.warning("WhatsApp OTP failed %s: %s", r.status_code, r.text[:300])
            return False
        return True
    except Exception as e:
        log.warning("WhatsApp OTP error: %s", e)
        return False


def sms_enabled():
    cfg = current_app.config
    return (cfg.get("SMS_PROVIDER") == "fast2sms" and cfg.get("FAST2SMS_API_KEY")) or \
        (cfg.get("SMS_PROVIDER") == "msg91" and cfg.get("MSG91_AUTH_KEY") and cfg.get("MSG91_TEMPLATE_ID"))


def send_sms_otp(phone, code):
    """Login code by SMS. Fast2SMS 'OTP' route or an MSG91 OTP template ({{otp}} / ##OTP##)."""
    cfg = current_app.config
    if not phone:
        return False
    if not sms_enabled():
        log.info("SMS OTP (not configured) to=%s code=%s", phone[-10:], code)
        return False
    try:
        if cfg["SMS_PROVIDER"] == "fast2sms":
            r = requests.post("https://www.fast2sms.com/dev/bulkV2", headers={"authorization": cfg["FAST2SMS_API_KEY"]},
                              data={"route": "otp", "variables_values": code, "numbers": phone[-10:]}, timeout=10)
            good = r.status_code < 300 and r.json().get("return") is True
        else:
            r = requests.post("https://control.msg91.com/api/v5/flow",
                              headers={"authkey": cfg["MSG91_AUTH_KEY"], "content-type": "application/json"},
                              json={"template_id": cfg["MSG91_TEMPLATE_ID"], "short_url": "0",
                                    "recipients": [{"mobiles": "91" + phone[-10:], "otp": code, "OTP": code}]},
                              timeout=10)
            good = r.status_code < 300
        if not good:
            log.warning("SMS OTP failed %s: %s", r.status_code, r.text[:300])
        return good
    except Exception as e:
        log.warning("SMS OTP error: %s", e)
        return False
