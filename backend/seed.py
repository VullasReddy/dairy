"""Business starter data. Run:  python seed.py            (business data + demo data)
                                python seed.py --no-demo  (business data only – use this in production)

Schema is created by the Alembic migrations in migrations/ (seed runs `flask db upgrade` for you).
Demo customers, bookings and deliveries live separately in demo_data.py.

IMPORTANT before launch: prices, PIN codes, testimonials, quality claims and policies below are
starter values. Replace them with the business's confirmed details from the admin panel.
"""
import os
from datetime import timedelta, datetime

from app import create_app
from app.extensions import db
from app.models import (AdminPermission, ADMIN_MODULES, User, CustomerProfile, AdminRole, Address, Product, ProductVariant, SubscriptionPlan,
                        Subscription, SubscriptionItem, Order, OrderItem, Payment, DeliveryStaff, DeliveryRoute,
                        ServiceablePincode, Review, BlogPost, QualityReport, WebsiteContent)
from app.utils import set_content, today, gen_code

SETTINGS = {
    "business_name": "Aditya Milk Dairy", "phone": "+91 98765 43210", "email": "puritfarms@gmail.com",
    "whatsapp": "919876543210", "address": "Aditya Milk Dairy Farms, Narasaraopet, Andhra Pradesh",
    "city": "Narasaraopet · Vijayawada · Hyderabad · Bengaluru · Chennai",
    "delivery_timings": "5:30 AM – 8:00 AM daily", "order_cutoff": "Book by 8 PM for next-morning delivery",
    "social": {"facebook": "", "instagram": "", "youtube": ""},  # set real page URLs in Admin -> Settings
    "max_daily_qty": 10, "max_skips_per_subscription": 5, "max_pause_days": 15, "reminder_days_before": 2,
    "missed_delivery_policy": "extend", "trial_requires_verification": False,
    "booking_requires_approval": False, "skip_requires_approval": False, "whatsapp_notifications": False,
    "upi_id": "",  # e.g. adityamilkdairy@upi – shown to customers when PAYMENT_PROVIDER=offline
    "payment_instructions": "Pay the amount by UPI to the ID shown, or in cash to our delivery partner on your first "
                            "delivery. Your plan is confirmed as soon as our team verifies the payment.",
    "location_radius_km": 50,
    "change_cutoff_hour": 21,  # extra milk / changes for tomorrow close at 9 PM
}

HERO = {"eyebrow": "Pure. Fresh. Healthy.", "title": "Aditya Milk Dairy",
        "subtitle": "Farm Fresh Milk, Delivered to Your Home",
        "text": "Choose from our premium **Cow Milk & Buffalo Milk** with flexible subscription plans and doorstep delivery.",
        "image": "/images/hero.jpg"}

ABOUT = {"title": "About Aditya Milk Dairy",
         "text": "We are committed to bringing you the purest and freshest milk, directly from our farms. "
                 "With **advanced dairy practices** and stringent quality checks, we ensure every drop is "
                 "nutritious, safe and wholesome.",
         "mission": "To make pure, farm-fresh milk a dependable part of every family's morning – delivered on time, every day.",
         "farm": "Our cows and buffaloes are raised on green pastures on the outskirts of Narasaraopet, with clean "
                 "sheds, balanced feed, fresh water and regular veterinary care.",
         "values": ["Purity without compromise", "Kindness to our animals", "Hygiene at every step",
                    "On-time, every time"],
         "image": "/images/farm.jpg"}

JOURNEY = [
    {"title": "Milk Collection", "text": "Milked hygienically every morning at our own farms.", "icon": "farm"},
    {"title": "Quality Checks", "text": "Each batch is checked for freshness, fat and adulteration.", "icon": "lab"},
    {"title": "Chilling & Packing", "text": "Rapidly chilled and sealed in food-grade packs.", "icon": "pack"},
    {"title": "Doorstep Delivery", "text": "Delivered to your door before your morning tea.", "icon": "truck"},
]

QUALITY_PROMISE = [
    {"title": "100% Natural", "icon": "leaf"}, {"title": "Lab Tested", "icon": "check"},
    {"title": "Premium Quality", "icon": "medal"}, {"title": "Your Health Our Priority", "icon": "heart"},
]
QUALITY_PROCESS = [
    "No added preservatives, water or powder",
    "Batch-wise testing for fat, SNF and adulterants",
    "Cold chain maintained from farm to doorstep",
    "Sealed, tamper-evident packaging",
]
TRUST = [
    {"title": "100% Pure & Fresh", "icon": "shield"}, {"title": "From Our Own Farms", "icon": "barn"},
    {"title": "On-Time Delivery", "icon": "truck"}, {"title": "Secure Payments", "icon": "lock"},
    {"title": "Happier Families", "icon": "smile"},
]
FAQS = [
    {"q": "What time is milk delivered?", "a": "Deliveries reach you between 5:30 AM and 8:00 AM every day.", "cat": "Delivery"},
    {"q": "Which areas do you deliver to?", "a": "We deliver in Narasaraopet, Vijayawada, Hyderabad, Bengaluru and Chennai across selected PIN codes. Enter your PIN code on the Subscriptions page to check.", "cat": "Delivery"},
    {"q": "Can I skip a day or pause my plan?", "a": "Yes. Skip individual days or pause from My Subscriptions. Skipped and paused days are added to the end of your plan.", "cat": "Subscriptions"},
    {"q": "How is the price calculated?", "a": "Total = price per packet × packets per day × number of days, minus any plan discount. The exact total is shown before you pay.", "cat": "Payments"},
    {"q": "What payment methods do you accept?", "a": "UPI, cards, net banking and wallets through our secure payment gateway.", "cat": "Payments"},
    {"q": "What if a delivery is missed?", "a": "If we miss a delivery, a make-up day is automatically added to the end of your subscription.", "cat": "Delivery"},
    {"q": "How do I pay?", "a": "Pay securely online, or by UPI / cash when online payment isn't available in your area. Your plan is confirmed only after the payment is verified, and you get a receipt in My Account → Payment History.", "cat": "Payments"},
    {"q": "Is the milk pasteurised or raw?", "a": "We deliver fresh, chilled milk within hours of milking. Please boil it before drinking, as with any fresh dairy milk.", "cat": "Quality"},
    {"q": "Which packet sizes are available?", "a": "Cow Milk and Buffalo Milk come in 500 ml and 1 litre packets. You can mix both milks and sizes in one subscription.", "cat": "Subscriptions"},
    {"q": "Can I change my quantity or address?", "a": "Add or edit addresses any time in My Account → Addresses. To change the daily quantity, start a new plan after your current one ends or contact us and we'll help.", "cat": "Subscriptions"},
    {"q": "What if I'm not at home during delivery?", "a": "Add delivery instructions to your address (for example 'leave at the door' or 'hand to security'). If you're travelling, simply skip those days from My Subscriptions.", "cat": "Delivery"},
    {"q": "How do I contact support?", "a": "Use Help & Support in My Account, the Contact page, or WhatsApp us. We usually reply within a few hours.", "cat": "Support"},
    {"q": "Can I cancel my subscription?", "a": "Yes. Cancel any time from My Subscriptions. Undelivered days are refunded as per our refund policy.", "cat": "Payments"},
]
POLICIES = {
    "privacy": {"title": "Privacy Policy", "body": "We collect your name, phone number, email and delivery address only to deliver your orders and contact you about them. Payment details are processed by our payment gateway and are never stored on our servers. We do not sell your data. You may request deletion of your account by contacting us."},
    "terms": {"title": "Terms & Conditions", "body": "Subscriptions are confirmed only after successful advance payment. Deliveries are made to the selected address within published delivery timings. Customers must ensure someone is available or a safe drop point is provided. Prices may change for new subscriptions; active paid subscriptions keep the price at which they were booked."},
    "delivery": {"title": "Delivery Information", "body": "We deliver fresh milk every morning between 5:30 AM and 8:00 AM in our service areas of Narasaraopet, Vijayawada, Hyderabad, Bengaluru and Chennai. Delivery is free. Your first delivery is the morning after your booking is confirmed. Changes such as skipping a day, pausing or ordering extra milk must be made before the cut-off time the previous evening. If no one is home, our delivery partner leaves the milk at your safe drop point or follows your delivery instructions. Track every delivery from My Subscriptions."},
    "refund": {"title": "Cancellation & Refund Policy", "body": "You may cancel an active subscription at any time. The value of undelivered days is refunded to the original payment method within 5–7 working days. Skipped days and paused days are added to the end of the plan instead of refunded. Missed deliveries caused by us are made up with an extra day at the end of the plan."},
}

# Delivery cities -> (PIN code, area). Confirm the exact serviceable PIN codes with the business before launch;
# more can be added any time in Admin -> Settings -> Serviceable areas.
LOCATIONS = {
    "Narasaraopet": [("522601", "Narasaraopet Town"), ("522603", "Kakani / Ikkurru"), ("522611", "Gonepudi"),
                     ("522616", "Chilakaluripet"), ("522617", "Rompicherla"), ("522619", "Nadendla"),
                     ("522626", "Boppudi")],
    "Vijayawada": [("520001", "Governorpet"), ("520002", "One Town"), ("520003", "Krishna Lanka"),
                   ("520007", "Patamata"), ("520008", "Benz Circle"), ("520010", "Labbipet"),
                   ("520012", "Gunadala"), ("520013", "Ajit Singh Nagar"), ("520015", "Poranki")],
    "Hyderabad": [("500003", "Secunderabad"), ("500016", "Begumpet"), ("500032", "Gachibowli"),
                  ("500033", "Jubilee Hills"), ("500034", "Banjara Hills"), ("500072", "Kukatpally"),
                  ("500081", "Madhapur / HITEC City")],
    "Bengaluru": [("560010", "Rajajinagar"), ("560011", "Jayanagar"), ("560034", "Koramangala"),
                  ("560037", "Marathahalli"), ("560038", "Indiranagar"), ("560066", "Whitefield"),
                  ("560078", "JP Nagar"), ("560102", "HSR Layout")],
    "Chennai": [("600004", "Mylapore"), ("600017", "T. Nagar"), ("600020", "Adyar"), ("600034", "Nungambakkam"),
                ("600040", "Anna Nagar"), ("600042", "Velachery")],
}
from app.locations import CITIES  # noqa: E402  (location-picker cities, see app/locations.py)

# every PIN code of the four cities (India Post directory); hand-picked area names above win
from app.pincodes import PINCODES  # noqa: E402
for _city, _rows in PINCODES.items():
    _have = {p for p, _ in LOCATIONS.setdefault(_city, [])}
    LOCATIONS[_city] += [(p, a) for p, a in _rows if p not in _have]

CITY_ROUTES = {  # city -> [(route name, [pins])]; Narasaraopet routes are created with their staff below
    "Hyderabad": [("Hyderabad – West", ["500032", "500033", "500034", "500081", "500072"]),
                  ("Hyderabad – Central", ["500003", "500016"])],
    "Bengaluru": [("Bengaluru – South & East", ["560011", "560034", "560078", "560102", "560037", "560066"]),
                  ("Bengaluru – Central & North", ["560010", "560038"])],
    "Chennai": [("Chennai – Central", ["600004", "600017", "600034", "600040"]),
                ("Chennai – South", ["600020", "600042"])],
}

# Sample reviews are DEMO data only (loaded by demo_data.py) – the live site shows only real, approved reviews.
TESTIMONIALS = [
    ("Priya Sharma", "Aditya Milk Dairy has given us the freshest milk every day. Highly recommended!", "/images/avatar-1.jpg"),
    ("Ramesh Kumar", "Great quality and on-time delivery. Our family loves it!", "/images/avatar-2.jpg"),
    ("Sneha Reddy", "Subscription process is so easy. Milk is always fresh and pure.", "/images/avatar-3.jpg"),
]

BLOG = [
    ("benefits-of-a-milk-subscription", "5 Reasons a Daily Milk Subscription Makes Mornings Easier",
     "No more early-morning shop runs – here's why families are switching to doorstep delivery.",
     "1. Fresh milk is at your door before you wake up, every single day.\n\n2. You pay once for the whole plan, so there are no daily payments or change to manage.\n\n3. Skip a day when you travel and it's added to the end of your plan – nothing is wasted.\n\n4. Mix Cow Milk and Buffalo Milk and choose 500 ml or 1 litre packets to match your family's needs.\n\n5. Track every delivery, payment and receipt from your account on your phone.",
     "/images/hero.jpg"),
    ("how-to-make-thick-curd-at-home", "How to Make Thick, Creamy Curd at Home",
     "A simple everyday method for perfect homemade curd with fresh milk.",
     "Boil the milk and let it cool until it is warm to the touch – about the temperature of a warm bath.\n\nAdd one teaspoon of curd from a previous batch for every half litre and stir gently.\n\nCover and leave it in a warm place for 6 to 8 hours. In winter, keep it inside a closed oven or wrap the bowl in a cloth.\n\nOnce set, refrigerate it. Buffalo milk gives an especially thick, creamy curd thanks to its richer fat content.",
     "/images/buffalo-milk.jpg"),
    ("why-boil-fresh-milk", "Why You Should Boil Fresh Milk – and How to Do It Right",
     "Simple steps to keep fresh dairy milk safe and tasty.",
     "Fresh farm milk should be boiled before drinking. Bring it to a rolling boil, then lower the heat and let it simmer for a minute while stirring.\n\nUse a heavy-bottomed vessel so the milk doesn't stick or burn.\n\nCool it quickly, cover it and refrigerate. Reheat only the amount you need each time instead of boiling the whole quantity again and again.",
     "/images/cow-milk.jpg"),
    ("cow-milk-vs-buffalo-milk", "Cow Milk vs Buffalo Milk: Which Is Right for Your Family?",
     "Both are wholesome – here is how they differ in taste, texture and everyday use.",
     "Cow milk is lighter and easier to digest for many people, which makes it a popular everyday choice for tea, coffee and children.\n\nBuffalo milk is naturally thicker and creamier because it carries more fat. It is ideal for curd, paneer, ghee and sweets.\n\nMany families keep both: cow milk for drinking and buffalo milk for the kitchen. With Aditya Milk Dairy you can add both to one subscription.",
     "/images/cow-milk.jpg"),
    ("how-to-store-fresh-milk", "How to Store Fresh Milk the Right Way",
     "Simple habits that keep your milk fresh and safe for longer.",
     "Refrigerate milk as soon as it arrives and keep it at 4°C or below.\n\nStore it on an inner shelf rather than the door, where the temperature changes each time it is opened.\n\nBoil only what you need and cool it quickly before putting it back in the fridge. Always keep the container covered.",
     "/images/buffalo-milk.jpg"),
    ("from-our-farm-to-your-home", "From Our Farm to Your Home – Every Morning",
     "A look at what happens between milking and your morning cup.",
     "Our day starts before sunrise. Milk is collected hygienically, checked for quality, chilled immediately and packed in sealed packs.\n\nOur delivery partners then pick up route-wise lists and bring the milk to your doorstep before 8 AM.",
     "/images/farm.jpg"),
]


def seed(demo=True):
    app = create_app()
    with app.app_context():
        from flask_migrate import upgrade
        upgrade(directory=os.path.join(os.path.dirname(os.path.abspath(__file__)), "migrations"))
        if User.query.filter_by(role="admin").first():
            added = ensure_locations()
            print(f"Database already seeded – migrations applied, {added} new delivery area(s) added.")
            return

        perms = {}
        for code, name in ADMIN_MODULES:
            for action, label in (("view", "View"), ("manage", "Add / edit / delete")):
                ap = AdminPermission(code=f"{code}.{action}", module=code, name=f"{name} – {label}")
                db.session.add(ap)
                perms[ap.code] = ap
        r_admin = AdminRole(name="Owner / Super Admin", description="Full access to everything", is_super=True)
        ops = ["dashboard.view", "reports.view", "bookings.manage", "deliveries.manage", "staff.manage",
               "customers.manage", "enquiries.manage", "notifications.manage", "payments.view", "products.view",
               "plans.view", "content.manage"]
        r_mgr = AdminRole(name="Operations Manager", description="Day-to-day operations; read-only prices & payments",
                          permissions=[perms[c] for c in ops])
        r_acc = AdminRole(name="Accounts", description="Payments, refunds and reports",
                          permissions=[perms[c] for c in ("dashboard.view", "reports.view", "payments.manage",
                                                          "bookings.view", "customers.view")])
        db.session.add_all([r_admin, r_mgr, r_acc])
        db.session.flush()

        # Owner account. In production set ADMIN_EMAIL / ADMIN_PASSWORD (env) – never use the demo password live.
        admin_email = (os.getenv("ADMIN_EMAIL") or "admin@adityamilkdairy.com").strip().lower()
        admin_pw = os.getenv("ADMIN_PASSWORD") or ("Admin@123" if demo else None)
        if not admin_pw:
            import secrets as _s
            admin_pw = _s.token_urlsafe(10)
            print(f"!! No ADMIN_PASSWORD set – generated one-time owner password: {admin_pw}  (change it after login)")
        admin = User(email=admin_email, phone=None, role="admin", admin_role_id=r_admin.id, email_verified=True)
        admin.set_password(admin_pw)
        admin.profile = CustomerProfile(full_name=os.getenv("ADMIN_NAME") or "Aditya (Owner)")
        db.session.add(admin)
        if demo:
            mgr = User(email="ops@adityamilkdairy.com", phone="9876500001", role="admin", admin_role_id=r_mgr.id,
                       email_verified=True)
            mgr.set_password("Manager@123")
            mgr.profile = CustomerProfile(full_name="Operations Manager")
            db.session.add(mgr)

        for k, v in [("settings", SETTINGS), ("hero", HERO), ("about", ABOUT), ("journey", JOURNEY),
                     ("quality_promise", QUALITY_PROMISE), ("quality_process", QUALITY_PROCESS),
                     ("trust_highlights", TRUST), ("faqs", FAQS), ("policies", POLICIES), ("banners", [])]:
            set_content(k, v)

        cow = Product(slug="cow-milk", name="Cow Milk", tagline="Rich in Nutrition for a Stronger You",
                      description="Light, wholesome and easy to digest – fresh cow milk from our own farms, "
                                  "perfect for drinking, tea and coffee.",
                      image="/images/cow-milk.jpg", sort_order=1, nutrition={})
        buf = Product(slug="buffalo-milk", name="Buffalo Milk", tagline="Thick & Nutritious for Better Health",
                      description="Naturally thick and creamy buffalo milk – ideal for curd, paneer, ghee and "
                                  "traditional sweets.",
                      image="/images/buffalo-milk.jpg", sort_order=2, nutrition={})
        db.session.add_all([cow, buf])
        db.session.flush()
        db.session.add_all([
            ProductVariant(product_id=cow.id, size_ml=500, label="500 ml", price=40, mrp=45, stock_litres=300),
            ProductVariant(product_id=cow.id, size_ml=1000, label="1 L", price=78, mrp=88, stock_litres=300),
            ProductVariant(product_id=buf.id, size_ml=500, label="500 ml", price=48, mrp=54, stock_litres=200),
            ProductVariant(product_id=buf.id, size_ml=1000, label="1 L", price=94, mrp=105, stock_litres=200),
        ])

        plans = [
            SubscriptionPlan(code="TRIAL", name="Free Trial", duration_days=1, is_trial=True, trial_max_packets=2, is_active=False,
                             sort_order=0, description="One free day for new customers"),
            SubscriptionPlan(code="WEEKLY", name="7 Days", duration_days=7, discount_percent=0, sort_order=1,
                             description="Weekly plan"),
            SubscriptionPlan(code="SHORT", name="10 Days", duration_days=10, discount_percent=2, sort_order=2,
                             description="Short subscription"),
            SubscriptionPlan(code="HALF", name="15 Days", duration_days=15, discount_percent=4, sort_order=3,
                             description="Half-month plan"),
            SubscriptionPlan(code="MONTHLY", name="30 Days", duration_days=30, discount_percent=8, sort_order=4,
                             is_popular=True, description="Best value monthly plan"),
        ]
        db.session.add_all(plans)


        st1 = st2 = None
        if demo:  # demo delivery staff; in production add your real staff in Admin -> Delivery Staff & Routes
            s1u = User(email="ravi.delivery@adityamilkdairy.com", phone="9000000001", role="staff", email_verified=True)
            s1u.set_password("Staff@123")
            s1u.profile = CustomerProfile(full_name="Ravi Teja")
            s2u = User(email="suresh.delivery@adityamilkdairy.com", phone="9000000002", role="staff",
                       email_verified=True)
            s2u.set_password("Staff@123")
            s2u.profile = CustomerProfile(full_name="Suresh Babu")
            db.session.add_all([s1u, s2u])
            db.session.flush()
            st1 = DeliveryStaff(user_id=s1u.id, name="Ravi Teja", phone="9000000001", vehicle="AP16 AB 1234")
            st2 = DeliveryStaff(user_id=s2u.id, name="Suresh Babu", phone="9000000002", vehicle="AP16 CD 5678")
            db.session.add_all([st1, st2])
            db.session.flush()
        db.session.add_all([
            DeliveryRoute(name="Narasaraopet – Route A Town", area="Narasaraopet / Kakani / Rompicherla",
                          pincodes=["522601", "522603", "522617"], default_staff_id=st1.id if st1 else None),
            DeliveryRoute(name="Narasaraopet – Route B Outskirts", area="Chilakaluripet / Nadendla / Gonepudi / Boppudi",
                          pincodes=["522616", "522619", "522611", "522626"],
                          default_staff_id=st2.id if st2 else None),
        ])

        for slug, title, ex, body, img in BLOG:
            db.session.add(BlogPost(slug=slug, title=title, excerpt=ex, body=body, cover_image=img))
        db.session.commit()

        ensure_locations()
        if demo:
            from demo_data import seed_demo
            seed_demo(st1)
            for n, c, av in TESTIMONIALS:
                db.session.add(Review(name=n, comment=c, avatar=av, rating=5, is_approved=True, is_featured=True))
            db.session.commit()
        print("Seed complete.")
        print(f"  Owner admin: {admin_email}")
        if demo:
            if not os.getenv("ADMIN_PASSWORD"):
                print(f"  Admin:    {admin_email} / Admin@123")
            print("  Manager:  ops@adityamilkdairy.com / Manager@123")
            print("  Delivery: ravi.delivery@adityamilkdairy.com / Staff@123")
            print("  Customer: customer@example.com / Customer@123  (DEMO data – see demo_data.py)")


def ensure_locations():
    """Idempotent: adds any missing cities / PIN codes / city routes. Safe to run on a live database."""
    added = 0
    for city, pins in LOCATIONS.items():
        for pin, area in pins:
            row = ServiceablePincode.query.filter_by(pincode=pin).first()
            if not row:
                db.session.add(ServiceablePincode(pincode=pin, area=area, city=city))
                added += 1
            elif row.city != city and row.city == "Vijayawada" and not pin.startswith("520"):
                row.city = city
    for city, routes in CITY_ROUTES.items():
        for name, pins in routes:
            if not DeliveryRoute.query.filter_by(name=name).first():
                db.session.add(DeliveryRoute(name=name, area=city, pincodes=pins))
    from app.models import WebsiteContent
    # free trial is switched off
    for pl in SubscriptionPlan.query.filter_by(is_trial=True, is_active=True).all():
        pl.is_active = False
    for key in ("faqs",):
        row = WebsiteContent.query.filter_by(key=key).first()
        if row and row.value:
            row.value = [f for f in row.value if "free trial" not in f.get("q", "").lower()]
    pol = WebsiteContent.query.filter_by(key="policies").first()
    if pol and pol.value:
        v = {k: dict(x) for k, x in pol.value.items()}
        for x in v.values():
            x["body"] = x.get("body", "").replace(" (except the free trial)", "").replace(" Free trials are not refundable.", "")
        pol.value = v
    if not WebsiteContent.query.filter_by(key="locations").first():
        set_content("locations", CITIES)
    cfg = WebsiteContent.query.filter_by(key="settings").first()
    if cfg and (cfg.value or {}).get("city") == "Vijayawada":
        cfg.value = {**cfg.value, "city": SETTINGS["city"]}
    # Narasaraopet added (Vijayawada kept); business email
    import json as _json
    for row in ServiceablePincode.query.filter_by(city="Vijayawada", is_active=False).all():
        row.is_active = True
    for r in DeliveryRoute.query.filter(DeliveryRoute.name.like("Vijayawada%"), DeliveryRoute.is_active.is_(False)).all():
        r.is_active = True
    for name, area, pins in (("Narasaraopet – Route A Town", "Narasaraopet / Kakani / Rompicherla", ["522601", "522603", "522617"]),
                             ("Narasaraopet – Route B Outskirts", "Chilakaluripet / Nadendla / Gonepudi / Boppudi",
                              ["522616", "522619", "522611", "522626"])):
        if not DeliveryRoute.query.filter_by(name=name).first():
            db.session.add(DeliveryRoute(name=name, area=area, pincodes=pins))
    known = {c["name"]: c for c in CITIES}
    for row in WebsiteContent.query.all():
        raw = _json.dumps(row.value, ensure_ascii=False)
        new = raw.replace("info@adityamilkdairy.com", "puritfarms@gmail.com")
        if "Narasaraopet" not in new:
            new = new.replace("Vijayawada · Hyderabad", "Narasaraopet · Vijayawada · Hyderabad") \
                     .replace("Vijayawada, Hyderabad", "Narasaraopet, Vijayawada, Hyderabad")
        elif "Vijayawada" not in new:  # an earlier version renamed Vijayawada -> Narasaraopet
            new = new.replace("Narasaraopet · Hyderabad", "Narasaraopet · Vijayawada · Hyderabad") \
                     .replace("Narasaraopet, Hyderabad", "Narasaraopet, Vijayawada, Hyderabad")
        val = _json.loads(new)
        if row.key == "locations" and isinstance(val, list):
            names = [c.get("name") for c in val]
            for n in ("Narasaraopet", "Vijayawada"):
                if n not in names:
                    val.insert(0 if n == "Narasaraopet" else 1, dict(known[n]))
            val = [dict(known[c["name"]]) if c.get("name") in ("Narasaraopet", "Vijayawada") else c for c in val]
        if new != raw or row.key == "locations":
            row.value = val
    pols = WebsiteContent.query.filter_by(key="policies").first()
    if pols and pols.value is not None and "delivery" not in pols.value:
        pols.value = {**pols.value, "delivery": POLICIES["delivery"]}
    faqs = WebsiteContent.query.filter_by(key="faqs").first()
    if faqs and faqs.value:
        faqs.value = [({**f, "a": next(x["a"] for x in FAQS if x["q"] == f["q"])}
                       if "selected Vijayawada PIN codes" in f.get("a", "") else f) for f in faqs.value]
    db.session.commit()
    return added


if __name__ == "__main__":
    import sys
    seed(demo="--no-demo" not in sys.argv)
