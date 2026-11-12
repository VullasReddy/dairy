"""DEMO data only – a sample customer with an active plan, a payment and a week of deliveries.

Kept separate from the business starter data in seed.py. Demo accounts use @example.com
addresses so they are easy to identify and remove. Never load this into the live database:
run `python seed.py --no-demo` in production.
"""
from datetime import timedelta, datetime

from app.extensions import db
from app.models import (User, CustomerProfile, Address, Product, ProductVariant, SubscriptionPlan, Subscription,
                        SubscriptionItem, Order, OrderItem, Payment)
from app.utils import today, gen_code


def seed_demo(staff):
    from app.services.delivery import generate_for_date, set_delivery_status
    from app.models import DeliverySchedule
    c = User(email="customer@example.com", phone="9848012345", role="customer", email_verified=True,
             trial_used=True)
    c.set_password("Customer@123")
    c.profile = CustomerProfile(full_name="Lakshmi Prasanna")
    db.session.add(c)
    db.session.flush()
    addr = Address(user_id=c.id, label="Home", line1="Flat 302, Sai Residency", line2="MG Road",
                   landmark="Clock Tower", area="Narasaraopet Town", city="Narasaraopet", pincode="522601",
                   instructions="Leave at the door, ring bell once", is_default=True)
    db.session.add(addr)
    db.session.flush()
    plan = SubscriptionPlan.query.filter_by(code="MONTHLY").first()
    cow500 = ProductVariant.query.join(Product).filter(Product.slug == "cow-milk", ProductVariant.size_ml == 500).first()
    buf500 = ProductVariant.query.join(Product).filter(Product.slug == "buffalo-milk",
                                                       ProductVariant.size_ml == 500).first()
    start = today() - timedelta(days=6)
    sub_total = (40 * 2 + 48 * 1) * 30
    disc = round(sub_total * 0.08, 2)
    order = Order(order_number=gen_code("AMD"), user_id=c.id, address_id=addr.id, plan_id=plan.id,
                  subtotal=sub_total, discount=disc, total=sub_total - disc, status="confirmed")
    db.session.add(order)
    db.session.flush()
    order.created_at = datetime.utcnow() - timedelta(days=7)
    for v, q in ((cow500, 2), (buf500, 1)):
        db.session.add(OrderItem(order_id=order.id, variant_id=v.id, daily_qty=q, unit_price=v.price, days=30,
                                 line_total=float(v.price) * q * 30))
    sub = Subscription(user_id=c.id, order_id=order.id, plan_id=plan.id, address_id=addr.id, start_date=start,
                       end_date=start + timedelta(days=29), status="active", total_amount=sub_total - disc)
    db.session.add(sub)
    db.session.flush()
    db.session.add_all([SubscriptionItem(subscription_id=sub.id, variant_id=cow500.id, daily_qty=2, unit_price=40),
                        SubscriptionItem(subscription_id=sub.id, variant_id=buf500.id, daily_qty=1, unit_price=48)])
    pm = Payment(order_id=order.id, user_id=c.id, provider="mock", provider_order_id="mock_order_demo0001",
                 provider_payment_id="mock_pay_demo0001", amount=sub_total - disc, method="upi", status="success",
                 receipt_number=gen_code("RCPT"))
    db.session.add(pm)
    db.session.flush()
    pm.created_at = pm.updated_at = datetime.utcnow() - timedelta(days=7)
    db.session.commit()
    for i in range(6, -1, -1):
        d = today() - timedelta(days=i)
        generate_for_date(d)
        if i > 0:
            for row in DeliverySchedule.query.filter_by(delivery_date=d).all():
                set_delivery_status(row, "delivered", None, "Delivered")
                row.delivered_at = datetime.combine(d, datetime.min.time()) + timedelta(hours=6, minutes=40)
    db.session.commit()
