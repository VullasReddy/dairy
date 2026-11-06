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


def send_email(to, subject, body):
    cfg = current_app.config
    if not cfg.get("SMTP_HOST"):
        log.info("EMAIL (SMTP not configured) to=%s subject=%s\n%s", to, subject, body)
        return False
    try:
        msg = EmailMessage()
        msg["From"], msg["To"], msg["Subject"] = cfg["MAIL_FROM"], to, subject
        msg.set_content(body)
        with smtplib.SMTP(cfg["SMTP_HOST"], cfg["SMTP_PORT"], timeout=10) as s:
            s.starttls()
            if cfg["SMTP_USER"]:
                s.login(cfg["SMTP_USER"], cfg["SMTP_PASSWORD"])
            s.send_message(msg)
        return True
    except Exception as e:  # a failed email must never break a booking
        log.warning("Email failed: %s", e)
        return False


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
