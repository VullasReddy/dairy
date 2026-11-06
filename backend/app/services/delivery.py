"""Subscription lifecycle and daily delivery generation (proposal §9 and §11)."""
from datetime import datetime, timedelta, date
from decimal import Decimal

from ..extensions import db
from ..models import (Subscription, SubscriptionSkip, DeliverySchedule, DeliveryTracking, DeliveryRoute,
                      Order, DELIVERY_STATUSES)
from ..utils import ApiError, today, settings, notify, notify_admins, audit

OPEN_STATUSES = ("scheduled", "assigned")


def route_for_pincode(pincode):
    for r in DeliveryRoute.query.filter_by(is_active=True).all():
        if pincode in (r.pincodes or []):
            return r
    return None


def housekeeping():
    """Run on dashboard loads and by the daily CLI job. Safe to run repeatedly."""
    t = today()
    changed = 0
    for s in Subscription.query.filter(Subscription.status == "active", Subscription.end_date < t).all():
        s.status = "completed"
        notify(s.user, "Subscription completed",
               f"Your {s.plan.name} plan ended on {s.end_date:%d %b %Y}. Renew any time to keep fresh milk coming.",
               "subscription", email=False)
        changed += 1
    remind_on = t + timedelta(days=int(settings().get("reminder_days_before", 2)))
    for s in Subscription.query.filter(Subscription.status == "active", Subscription.end_date <= remind_on,
                                       Subscription.end_date >= t, Subscription.reminder_sent.is_(False),
                                       Subscription.is_trial.is_(False)).all():
        s.reminder_sent = True
        notify(s.user, "Your plan is ending soon",
               f"Your {s.plan.name} subscription ends on {s.end_date:%d %b %Y}. Renew now to avoid a break.",
               "reminder")
        changed += 1
    stale = datetime.utcnow() - timedelta(hours=24)
    for o in Order.query.filter(Order.status == "pending_payment", Order.created_at < stale).all():
        if any(p.provider == "offline" and p.status == "created" for p in o.payments):
            continue  # UPI / cash bookings wait for an admin to confirm the payment
        o.status = "failed"
        if o.subscription and o.subscription.status == "pending_payment":
            o.subscription.status = "failed"
        for p in o.payments:
            if p.status == "created":
                p.status = "failed"
                p.failure_reason = "Payment not completed within 24 hours"
        changed += 1
    if changed:
        db.session.commit()
    return changed


def generate_for_date(d: date, actor=None):
    housekeeping()
    created = skipped = existing = 0
    subs = Subscription.query.filter(Subscription.status == "active", Subscription.start_date <= d,
                                     Subscription.end_date >= d).all()
    for s in subs:
        if DeliverySchedule.query.filter_by(subscription_id=s.id, delivery_date=d).first():
            existing += 1
            continue
        is_skip = d in s.skip_dates()
        route = route_for_pincode(s.address.pincode)
        row = DeliverySchedule(
            subscription_id=s.id, delivery_date=d, route_id=route.id if route else None,
            items_snapshot=[{"product": i.variant.product.name, "size": i.variant.label, "qty": i.daily_qty,
                             "size_ml": i.variant.size_ml} for i in s.items],
        )
        if is_skip:
            row.status = "skipped"
            row.note = "Skipped by customer"
            skipped += 1
        else:
            if route and route.default_staff_id:
                row.staff_id = route.default_staff_id
                row.status = "assigned"
            created += 1
        db.session.add(row)
        db.session.flush()
        db.session.add(DeliveryTracking(schedule_id=row.id, status=row.status,
                                        changed_by=actor.id if actor else None, note="Generated"))
    if actor:
        audit(actor, "delivery", None, "generate", {"date": d.isoformat(), "created": created, "skipped": skipped})
    db.session.commit()
    return {"date": d.isoformat(), "created": created, "skipped": skipped, "already_existed": existing}


def set_delivery_status(row: DeliverySchedule, status, actor, note=None, proof=None):
    if status not in DELIVERY_STATUSES:
        raise ApiError("Unknown delivery status.", 422)
    if row.status == status and not note:
        return row
    old = row.status
    row.status = status
    row.note = note or row.note
    if status == "delivered":
        row.delivered_at = datetime.utcnow()
    db.session.add(DeliveryTracking(schedule_id=row.id, status=status, note=note, proof_image=proof,
                                    changed_by=actor.id if actor else None))
    audit(actor, "delivery", row.id, "status_change", {"from": old, "to": status, "note": note})
    sub = row.subscription
    if status == "missed" and old != "missed":
        policy = settings().get("missed_delivery_policy", "extend")
        if policy == "extend" and sub.status == "active":
            sub.end_date = sub.end_date + timedelta(days=1)
        notify(sub.user, "Delivery missed",
               f"We could not deliver your milk on {row.delivery_date:%d %b}. "
               + ("A make-up day has been added to the end of your plan." if policy == "extend"
                  else "Our team will contact you about a refund."), "delivery")
        notify_admins("Missed delivery", f"{sub.user.name} – {row.delivery_date:%d %b} ({note or 'no reason'})",
                      "delivery")
    elif status == "delivered":
        notify(sub.user, "Milk delivered", f"Your milk for {row.delivery_date:%d %b} has been delivered. Enjoy!",
               "delivery", email=False)
    elif status == "out_for_delivery":
        notify(sub.user, "Out for delivery", "Your fresh milk is on the way.", "delivery", email=False)
    return row


# ----------------------------------------------------------- customer self-service
def _future_open_rows(sub, from_date):
    return DeliverySchedule.query.filter(DeliverySchedule.subscription_id == sub.id,
                                         DeliverySchedule.delivery_date >= from_date,
                                         DeliverySchedule.status.in_(OPEN_STATUSES)).all()


def skip_date(sub: Subscription, d: date, actor, reason=None):
    """Customer skip request. Auto-approved within policy, or queued for admin approval when the
    'skip_requires_approval' setting is on. Approved skips add one day to the end of the plan."""
    if sub.status != "active":
        raise ApiError("Only active subscriptions can skip a day.", 422)
    if d <= today():
        raise ApiError("You can skip deliveries from tomorrow onwards.", 422)
    if d < sub.start_date or d > sub.end_date:
        raise ApiError("That date is outside your subscription period.", 422)
    existing = next((k for k in sub.skips if k.skip_date == d), None)
    if existing and existing.status != "rejected":
        raise ApiError("That day is already skipped or awaiting approval.", 422)
    max_skips = int(settings().get("max_skips_per_subscription", 5))
    if sum(1 for k in sub.skips if k.status != "rejected") >= max_skips:
        raise ApiError(f"You can skip at most {max_skips} days per subscription.", 422)
    if existing:  # re-request a previously rejected date
        req = existing
        req.status, req.reason = "pending", reason
    else:
        req = SubscriptionSkip(subscription_id=sub.id, skip_date=d, status="pending", reason=reason)
        db.session.add(req)
        sub.skips.append(req)
    if settings().get("skip_requires_approval"):
        notify_admins("Skip request", f"{sub.user.name} asked to skip {d:%d %b} (subscription #{sub.id})", "skip")
        audit(actor, "subscription", sub.id, "skip_requested", {"date": d.isoformat()})
        return req
    approve_skip(req, actor, auto=True)
    return req


def approve_skip(req: SubscriptionSkip, actor, auto=False):
    if req.status == "approved":
        return req
    sub = req.subscription
    req.status = "approved"
    sub.end_date = sub.end_date + timedelta(days=1)  # skipped day is added to the end
    for row in _future_open_rows(sub, req.skip_date):
        if row.delivery_date == req.skip_date:
            set_delivery_status(row, "skipped", actor, "Skipped by customer")
    audit(actor, "subscription", sub.id, "skip" if auto else "skip_approved", {"date": req.skip_date.isoformat()})
    if not auto:
        notify(sub.user, "Skip approved", f"Your delivery on {req.skip_date:%d %b} is skipped. "
                                          f"Your plan now ends on {sub.end_date:%d %b %Y}.", "subscription")
    return req


def reject_skip(req: SubscriptionSkip, actor, reason=None):
    if req.status != "pending":
        raise ApiError("Only pending skip requests can be rejected.", 422)
    req.status = "rejected"
    req.reason = reason or req.reason
    audit(actor, "subscription", req.subscription_id, "skip_rejected",
          {"date": req.skip_date.isoformat(), "reason": reason})
    notify(req.subscription.user, "Skip request not approved",
           f"Your delivery on {req.skip_date:%d %b} will go ahead as planned. {reason or ''}", "subscription")


def activate_after_confirmation(sub: Subscription):
    """Called once payment is verified (or a free trial is booked)."""
    if settings().get("booking_requires_approval"):
        sub.status = "pending_approval"
        notify_admins("Booking awaiting approval", f"{sub.user.name} – {sub.plan.name} #{sub.id}", "booking")
        notify(sub.user, "Booking received", f"Your {sub.plan.name} booking is confirmed and awaiting a quick "
                                              "check by our team. We'll notify you once it's approved.",
               "subscription")
    else:
        sub.status = "active"
        notify(sub.user, "Subscription activated", f"Your {sub.plan.name} subscription is active. Deliveries "
                                                    f"start on {sub.start_date:%d %b %Y}.", "subscription",
               email=False)


def approve_booking(sub: Subscription, actor):
    if sub.status != "pending_approval":
        raise ApiError("This booking is not awaiting approval.", 422)
    if sub.start_date <= today():  # don't lose paid days while waiting for approval
        shift = (today() + timedelta(days=1) - sub.start_date).days
        sub.start_date += timedelta(days=shift)
        sub.end_date += timedelta(days=shift)
    sub.status = "active"
    audit(actor, "subscription", sub.id, "approved", {})
    notify(sub.user, "Subscription activated", f"Your {sub.plan.name} subscription is approved and active from "
                                                f"{sub.start_date:%d %b %Y}.", "subscription")


def pause(sub: Subscription, from_date: date, actor):
    if sub.status != "active":
        raise ApiError("Only active subscriptions can be paused.", 422)
    if from_date <= today():
        raise ApiError("Pauses can start from tomorrow onwards.", 422)
    if from_date > sub.end_date:
        raise ApiError("That date is after your plan ends.", 422)
    sub.status = "paused"
    sub.paused_from = max(from_date, sub.start_date)
    for row in _future_open_rows(sub, sub.paused_from):
        set_delivery_status(row, "cancelled", actor, "Subscription paused")
    audit(actor, "subscription", sub.id, "pause", {"from": sub.paused_from.isoformat()})


def resume(sub: Subscription, resume_date: date, actor):
    if sub.status != "paused":
        raise ApiError("This subscription is not paused.", 422)
    if resume_date <= today():
        resume_date = today() + timedelta(days=1)
    max_pause = int(settings().get("max_pause_days", 15))
    pf = sub.paused_from or resume_date
    paused_days = max(0, (min(resume_date, sub.end_date + timedelta(days=1)) - pf).days)
    if paused_days > max_pause:
        raise ApiError(f"Pauses can be at most {max_pause} days. Choose an earlier resume date.", 422)
    sub.end_date = sub.end_date + timedelta(days=paused_days)
    sub.status = "active"
    sub.paused_from = None
    audit(actor, "subscription", sub.id, "resume", {"resume": resume_date.isoformat(), "added_days": paused_days})
    return paused_days


def remaining_value(sub: Subscription):
    """Value of deliveries not yet made – basis for pro-rata refunds."""
    if sub.is_trial:
        return Decimal("0")
    delivered = DeliverySchedule.query.filter(DeliverySchedule.subscription_id == sub.id,
                                              DeliverySchedule.status.in_(["delivered", "out_for_delivery"])).count()
    days_total = sub.plan.duration_days
    remaining = max(0, days_total - delivered)
    per_day = Decimal(sub.total_amount) / days_total if days_total else Decimal("0")
    return (per_day * remaining).quantize(Decimal("0.01"))


def cancel(sub: Subscription, reason, actor):
    if sub.status in ("cancelled", "completed"):
        raise ApiError("This subscription is already closed.", 422)
    was_paid = sub.status in ("active", "paused", "pending_approval")
    sub.status = "cancelled"
    sub.cancel_reason = reason
    for row in _future_open_rows(sub, today() + timedelta(days=1)):
        set_delivery_status(row, "cancelled", actor, "Subscription cancelled")
    if sub.order and sub.order.status == "pending_payment":
        sub.order.status = "cancelled"
    if was_paid and not sub.is_trial:
        sub.refund_due = remaining_value(sub)
        if sub.refund_due > 0:
            notify_admins("Refund due", f"{sub.user.name} cancelled subscription #{sub.id}. "
                                        f"Refund due ₹{float(sub.refund_due):,.2f}", "payment")
    audit(actor, "subscription", sub.id, "cancel", {"reason": reason, "refund_due": float(sub.refund_due or 0)})
    notify(sub.user, "Subscription cancelled",
           f"Your subscription #{sub.id} has been cancelled."
           + (f" A refund of ₹{float(sub.refund_due):,.2f} will be processed as per our refund policy."
              if sub.refund_due and sub.refund_due > 0 else ""), "subscription")
