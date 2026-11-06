"""End-to-end API tests.  Run:  cd backend && python -m pytest -q"""
import os
import sys
import tempfile
from datetime import date, timedelta

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ["DATABASE_URL"] = "sqlite:///" + DB
os.environ["PAYMENT_PROVIDER"] = "mock"
os.environ["RATELIMIT_ENABLED"] = "0"

from app import create_app  # noqa: E402
from seed import seed  # noqa: E402
from app.clock import today as biz_today  # noqa: E402

TOMORROW = (biz_today() + timedelta(days=1)).isoformat()


@pytest.fixture(scope="module")
def client():
    seed(demo=True)
    app = create_app()
    with app.test_client() as c:
        yield c


def login(c, email, pw):
    r = c.post("/api/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.json
    return {"Authorization": "Bearer " + r.json["data"]["token"]}


def j(r, code=200):
    assert r.status_code == code, (r.status_code, r.json)
    return r.json.get("data")


def test_public_home(client):
    d = j(client.get("/api/public/home"))
    assert {p["slug"] for p in d["products"]} == {"cow-milk", "buffalo-milk"}
    assert [p["duration_days"] for p in d["plans"]] == [1, 7, 10, 15, 30]
    assert d["plans"][0]["from_price"] == 0 and d["plans"][1]["from_price"] == 280
    assert len(d["testimonials"]) == 3
    assert j(client.get("/api/public/pincode/520008"))["serviceable"] is True
    assert j(client.get("/api/public/pincode/110001"))["serviceable"] is False


def test_register_validation(client):
    r = client.post("/api/auth/register", json={"full_name": "A", "email": "bad", "phone": "123", "password": "x"})
    assert r.status_code == 422
    r = client.post("/api/auth/register", json={"full_name": "A", "email": "a@b.com", "phone": "9123456789",
                                                "password": "short"})
    assert r.status_code == 422 and "8 characters" in r.json["error"]


def test_full_paid_flow(client):
    d = j(client.post("/api/auth/register", json={"full_name": "Kiran Kumar", "email": "kiran@example.com",
                                                  "phone": "9123456789", "password": "Secret123"}), 201)
    h = {"Authorization": "Bearer " + d["token"]}
    # email verification works
    j(client.post("/api/auth/verify-email", json={"token": d["dev_verify_token"]}))

    # address outside service area is saved but cannot check out
    far = j(client.post("/api/me/addresses", json={"line1": "1 Street", "pincode": "110001"}, headers=h), 201)
    assert far["serviceable"] is False
    addr = j(client.post("/api/me/addresses", json={"line1": "4-12 Main Rd", "area": "Patamata",
                                                   "pincode": "520007"}, headers=h), 201)

    plans = {p["code"]: p for p in j(client.get("/api/public/plans"))}
    cow = [p for p in j(client.get("/api/public/products")) if p["slug"] == "cow-milk"][0]
    v500 = [v for v in cow["variants"] if v["size_ml"] == 500][0]
    items = [{"variant_id": v500["id"], "daily_qty": 2}]

    # server-side calculation: 40 x 2 x 15 = 1200, 4% off = 1152
    q = j(client.post("/api/me/quote", json={"items": items, "plan_id": plans["HALF"]["id"]}, headers=h))
    assert q["subtotal"] == 1200 and q["discount"] == 48 and q["total"] == 1152

    # past start date rejected
    r = client.post("/api/me/checkout", json={"items": items, "plan_id": plans["HALF"]["id"],
                                              "start_date": biz_today().isoformat(), "address_id": addr["id"]},
                    headers=h)
    assert r.status_code == 422
    # unserviceable rejected
    r = client.post("/api/me/checkout", json={"items": items, "plan_id": plans["HALF"]["id"],
                                              "start_date": TOMORROW, "address_id": far["id"]}, headers=h)
    assert r.status_code == 422 and "110001" in r.json["error"]

    # client-sent total is ignored
    body = {"items": items, "plan_id": plans["HALF"]["id"], "start_date": TOMORROW, "address_id": addr["id"],
            "total": 1}
    hk = {**h, "Idempotency-Key": "test-key-1"}
    co = j(client.post("/api/me/checkout", json=body, headers=hk), 201)
    assert co["order"]["total"] == 1152 and co["subscription"]["status"] == "pending_payment"
    # duplicate submit returns same order
    dup = j(client.post("/api/me/checkout", json=body, headers=hk))
    assert dup["duplicate"] and dup["order"]["id"] == co["order"]["id"]

    poid = co["payment"]["provider_order_id"]
    res = j(client.post(f"/api/me/payments/mock/{poid}", json={"outcome": "success"}, headers=h))
    assert res["payment"]["status"] == "success" and res["subscription"]["status"] == "active"
    # idempotent second callback
    res2 = j(client.post(f"/api/me/payments/mock/{poid}", json={"outcome": "success"}, headers=h))
    assert res2["payment"]["transaction_id"] == res["payment"]["transaction_id"]
    sid = res["subscription"]["id"]

    # skip a day extends end date
    sub = j(client.get(f"/api/me/subscriptions/{sid}", headers=h))
    end0 = sub["end_date"]
    skip_day = (biz_today() + timedelta(days=3)).isoformat()
    j(client.post(f"/api/me/subscriptions/{sid}/skip", json={"date": skip_day}, headers=h))
    sub = j(client.get(f"/api/me/subscriptions/{sid}", headers=h))
    assert sub["end_date"] == (date.fromisoformat(end0) + timedelta(days=1)).isoformat()

    # admin generates tomorrow's deliveries – assigned to Route B staff
    ah = login(client, "admin@adityamilkdairy.com", "Admin@123")
    g = j(client.post("/api/admin/deliveries/generate", json={"date": TOMORROW}, headers=ah))
    assert g["created"] >= 1
    rows = client.get(f"/api/admin/deliveries?date={TOMORROW}&pincode=520007", headers=ah).json
    mine = [r for r in rows["data"] if r["subscription_id"] == sid][0]
    assert mine["status"] == "assigned" and mine["staff"] == "Suresh Babu"
    assert mine["items"][0]["qty"] == 2
    # regenerating does not duplicate
    assert j(client.post("/api/admin/deliveries/generate", json={"date": TOMORROW}, headers=ah))["created"] == 0
    # skipped day produces a skipped record
    j(client.post("/api/admin/deliveries/generate", json={"date": skip_day}, headers=ah))
    rows = client.get(f"/api/admin/deliveries?date={skip_day}", headers=ah).json["data"]
    assert [r for r in rows if r["subscription_id"] == sid][0]["status"] == "skipped"
    # CSV export
    csv = client.get(f"/api/admin/deliveries/export?date={TOMORROW}", headers=ah)
    assert csv.status_code == 200 and b"Kiran Kumar" in csv.data

    # delivery staff marks missed -> make-up day added
    sh = login(client, "suresh.delivery@adityamilkdairy.com", "Staff@123")
    lst = j(client.get(f"/api/staff/deliveries?date={TOMORROW}", headers=sh))
    assert any(r["id"] == mine["id"] for r in lst["deliveries"])
    r = client.post(f"/api/staff/deliveries/{mine['id']}/status", json={"status": "missed"}, headers=sh)
    assert r.status_code == 422  # reason required
    j(client.post(f"/api/staff/deliveries/{mine['id']}/status", json={"status": "missed", "note": "Gate locked"},
                  headers=sh))
    sub2 = j(client.get(f"/api/me/subscriptions/{sid}", headers=h))
    assert sub2["end_date"] == (date.fromisoformat(sub["end_date"]) + timedelta(days=1)).isoformat()
    # other staff cannot touch it
    rh = login(client, "ravi.delivery@adityamilkdairy.com", "Staff@123")
    assert client.post(f"/api/staff/deliveries/{mine['id']}/status", json={"status": "delivered"},
                       headers=rh).status_code == 404

    # cancel -> refund due -> admin refunds
    c = j(client.post(f"/api/me/subscriptions/{sid}/cancel", json={"reason": "Moving"}, headers=h))
    assert c["subscription"]["status"] == "cancelled" and c["subscription"]["refund_due"] == 1152
    pays = client.get("/api/admin/payments?status=success", headers=ah).json
    pid = [p for p in pays["data"] if p["provider_order_id"] == poid][0]["id"]
    assert client.post(f"/api/admin/payments/{pid}/refund", json={"amount": 99999}, headers=ah).status_code == 422
    rf = j(client.post(f"/api/admin/payments/{pid}/refund", json={"amount": 1152, "note": "Full"}, headers=ah))
    assert rf["status"] == "refunded"

    # audit trail exists
    det = j(client.get(f"/api/admin/subscriptions/{sid}", headers=ah))
    assert any(a["action"] == "cancel" for a in det["audit"])


def test_trial_rules(client):
    d = j(client.post("/api/auth/register", json={"full_name": "Trial User", "email": "trial@example.com",
                                                  "phone": "9988776655", "password": "Secret123"}), 201)
    h = {"Authorization": "Bearer " + d["token"]}
    addr = j(client.post("/api/me/addresses", json={"line1": "7 Lane", "pincode": "520001"}, headers=h), 201)
    plans = {p["code"]: p for p in j(client.get("/api/public/plans"))}
    v = j(client.get("/api/public/products"))[0]["variants"][0]
    # more than 2 packets not allowed on trial
    r = client.post("/api/me/checkout", json={"items": [{"variant_id": v["id"], "daily_qty": 3}],
                                              "plan_id": plans["TRIAL"]["id"], "start_date": TOMORROW,
                                              "address_id": addr["id"]}, headers=h)
    assert r.status_code == 422
    body = {"items": [{"variant_id": v["id"], "daily_qty": 1}], "plan_id": plans["TRIAL"]["id"],
            "start_date": TOMORROW, "address_id": addr["id"]}
    co = j(client.post("/api/me/checkout", json=body, headers=h), 201)
    assert co["order"]["total"] == 0 and co["subscription"]["status"] == "active" and co["payment"] is None
    r = client.post("/api/me/checkout", json=body, headers=h)
    assert r.status_code == 422 and "already used" in r.json["error"]


def test_failed_payment_and_retry(client):
    h = login(client, "trial@example.com", "Secret123")
    addr = j(client.get("/api/me/addresses", headers=h))[0]
    plans = {p["code"]: p for p in j(client.get("/api/public/plans"))}
    v = j(client.get("/api/public/products"))[1]["variants"][0]
    co = j(client.post("/api/me/checkout", json={"items": [{"variant_id": v["id"], "daily_qty": 1}],
                                                 "plan_id": plans["WEEKLY"]["id"], "start_date": TOMORROW,
                                                 "address_id": addr["id"]}, headers=h), 201)
    assert co["order"]["total"] == 48 * 7
    f = j(client.post(f"/api/me/payments/mock/{co['payment']['provider_order_id']}", json={"outcome": "failed"},
                      headers=h))
    assert f["subscription"]["status"] == "failed"
    rt = j(client.post(f"/api/me/subscriptions/{co['subscription']['id']}/retry-payment", headers=h))
    ok_ = j(client.post(f"/api/me/payments/mock/{rt['payment']['provider_order_id']}", json={"outcome": "success"},
                        headers=h))
    assert ok_["subscription"]["status"] == "active"
    # pause / resume
    sid = co["subscription"]["id"]
    j(client.post(f"/api/me/subscriptions/{sid}/pause", json={"from_date": TOMORROW}, headers=h))
    res = j(client.post(f"/api/me/subscriptions/{sid}/resume",
                        json={"date": (biz_today() + timedelta(days=3)).isoformat()}, headers=h))
    assert res["subscription"]["status"] == "active"
    assert res["subscription"]["end_date"] == (biz_today() + timedelta(days=9)).isoformat()


def test_permissions_and_dashboard(client):
    ch = login(client, "customer@example.com", "Customer@123")
    assert client.get("/api/admin/dashboard", headers=ch).status_code == 403
    mh = login(client, "ops@adityamilkdairy.com", "Manager@123")
    assert client.get("/api/admin/dashboard", headers=mh).status_code == 200
    assert client.get("/api/admin/settings", headers=mh).status_code == 403  # manager lacks settings
    # manager can VIEW products but not change prices (products.view only)
    prods = client.get("/api/admin/products", headers=mh)
    assert prods.status_code == 200
    vid = prods.json["data"][0]["variants"][0]["id"]
    assert client.put(f"/api/admin/variants/{vid}", json={"price": 1}, headers=mh).status_code == 403
    # delivery staff cannot reach admin endpoints
    sh = login(client, "ravi.delivery@adityamilkdairy.com", "Staff@123")
    assert client.get("/api/admin/deliveries", headers=sh).status_code == 403
    ah = login(client, "admin@adityamilkdairy.com", "Admin@123")
    d = j(client.get("/api/admin/dashboard", headers=ah))
    assert d["cards"]["customers"] >= 3 and d["cards"]["active_subscriptions"] >= 1
    rep = j(client.get("/api/admin/reports?group=week", headers=ah))
    assert rep["totals"]["revenue"] > 0
    dash = j(client.get("/api/me/dashboard", headers=ch))
    assert dash["active_subscriptions"] and dash["stats"]["delivered"] == 6
    assert client.get("/api/me/dashboard").status_code == 401


def test_contact_and_reviews(client):
    j(client.post("/api/public/contact", json={"name": "Asha", "phone": "9000011111", "message": "Do you deliver "
                                                                                               "to Poranki?"}), 201)
    ch = login(client, "customer@example.com", "Customer@123")
    rv = j(client.post("/api/me/reviews", json={"rating": 5, "comment": "Lovely milk"}, headers=ch), 201)
    assert rv["review"]["is_approved"] is False
    assert all(t["comment"] != "Lovely milk" for t in j(client.get("/api/public/testimonials")))
    ah = login(client, "admin@adityamilkdairy.com", "Admin@123")
    j(client.put(f"/api/admin/reviews/{rv['review']['id']}", json={"is_approved": True}, headers=ah))
    assert any(t["comment"] == "Lovely milk" for t in j(client.get("/api/public/testimonials")))


def _book(client, h, milk_slug, qty, plan_code, pin="520010"):
    addrs = j(client.get("/api/me/addresses", headers=h))
    addr = next((a for a in addrs if a["pincode"] == pin), None) or \
        j(client.post("/api/me/addresses", json={"line1": "9 Lane", "pincode": pin}, headers=h), 201)
    plans = {p["code"]: p for p in j(client.get("/api/public/plans"))}
    prod = [p for p in j(client.get("/api/public/products")) if p["slug"] == milk_slug][0]
    v = prod["variants"][0]
    co = j(client.post("/api/me/checkout", json={"items": [{"variant_id": v["id"], "daily_qty": qty}],
                                                  "plan_id": plans[plan_code]["id"], "start_date": TOMORROW,
                                                  "address_id": addr["id"]}, headers=h), 201)
    return co, v


def _new_customer(client, email, phone):
    d = j(client.post("/api/auth/register", json={"full_name": "Test " + email.split("@")[0], "email": email,
                                                  "phone": phone, "password": "Secret123"}), 201)
    return {"Authorization": "Bearer " + d["token"]}


def test_cow_and_buffalo_bookings(client):
    h = _new_customer(client, "cowbuf@example.com", "9700000001")
    co, v = _book(client, h, "cow-milk", 1, "WEEKLY")
    assert co["order"]["total"] == v["price"] * 7 and co["order"]["items"][0]["product"] == "Cow Milk"
    j(client.post(f"/api/me/payments/mock/{co['payment']['provider_order_id']}", json={"outcome": "success"}, headers=h))
    co2, v2 = _book(client, h, "buffalo-milk", 2, "SHORT")
    # 10 days, 2% discount
    assert co2["order"]["subtotal"] == v2["price"] * 2 * 10
    assert co2["order"]["total"] == round(v2["price"] * 2 * 10 * 0.98, 2)
    assert co2["order"]["items"][0]["product"] == "Buffalo Milk"
    j(client.post(f"/api/me/payments/mock/{co2['payment']['provider_order_id']}", json={"outcome": "success"}, headers=h))
    orders = j(client.get("/api/me/orders", headers=h))
    assert len(orders) == 2 and all(o["payment_status"] == "success" for o in orders)
    dash = j(client.get("/api/me/dashboard", headers=h))
    assert len(dash["active_subscriptions"]) == 2
    assert all(s["remaining_days"] == s["duration_days"] for s in dash["active_subscriptions"])


def test_admin_booking_and_skip_approval(client):
    ah = login(client, "admin@adityamilkdairy.com", "Admin@123")
    j(client.put("/api/admin/settings", json={"booking_requires_approval": True, "skip_requires_approval": True},
                 headers=ah))
    h = _new_customer(client, "approve@example.com", "9700000002")
    co, _ = _book(client, h, "cow-milk", 1, "WEEKLY")
    res = j(client.post(f"/api/me/payments/mock/{co['payment']['provider_order_id']}", json={"outcome": "success"},
                        headers=h))
    sid = res["subscription"]["id"]
    assert res["subscription"]["status"] == "pending_approval"
    # not generated into deliveries until approved
    j(client.post("/api/admin/deliveries/generate", json={"date": TOMORROW}, headers=ah))
    rows = client.get(f"/api/admin/deliveries?date={TOMORROW}", headers=ah).json["data"]
    assert not any(r["subscription_id"] == sid for r in rows)
    assert j(client.get("/api/admin/dashboard", headers=ah))["cards"]["pending_approvals"] >= 1
    j(client.post(f"/api/admin/subscriptions/{sid}/approve", headers=ah))
    j(client.post("/api/admin/deliveries/generate", json={"date": TOMORROW}, headers=ah))
    rows = client.get(f"/api/admin/deliveries?date={TOMORROW}", headers=ah).json["data"]
    assert any(r["subscription_id"] == sid for r in rows)

    # skip request needs approval: end date unchanged until approved
    end0 = j(client.get(f"/api/me/subscriptions/{sid}", headers=h))["end_date"]
    day = (biz_today() + timedelta(days=2)).isoformat()
    r = j(client.post(f"/api/me/subscriptions/{sid}/skip", json={"date": day}, headers=h))
    assert "request" in r["message"].lower()
    assert j(client.get(f"/api/me/subscriptions/{sid}", headers=h))["end_date"] == end0
    reqs = j(client.get("/api/admin/skip-requests", headers=ah))
    rid = [x for x in reqs if x["subscription_id"] == sid][0]["id"]
    j(client.post(f"/api/admin/skip-requests/{rid}/approve", headers=ah))
    s2 = j(client.get(f"/api/me/subscriptions/{sid}", headers=h))
    assert s2["end_date"] == (date.fromisoformat(end0) + timedelta(days=1)).isoformat() and day in s2["skips"]
    # a second request can be rejected
    day2 = (biz_today() + timedelta(days=4)).isoformat()
    j(client.post(f"/api/me/subscriptions/{sid}/skip", json={"date": day2}, headers=h))
    rid2 = [x for x in j(client.get("/api/admin/skip-requests", headers=ah)) if x["date"] == day2][0]["id"]
    j(client.post(f"/api/admin/skip-requests/{rid2}/reject", json={"reason": "Festival rush"}, headers=ah))
    assert day2 not in j(client.get(f"/api/me/subscriptions/{sid}", headers=h))["skips"]
    j(client.put("/api/admin/settings", json={"booking_requires_approval": False, "skip_requires_approval": False},
                 headers=ah))


def test_subscription_expiry(client):
    from app.extensions import db
    from app.models import Subscription
    h = login(client, "cowbuf@example.com", "Secret123")
    sid = j(client.get("/api/me/subscriptions?status=active", headers=h))[0]["id"]
    with client.application.app_context():
        s = db.session.get(Subscription, sid)
        s.start_date = biz_today() - timedelta(days=8)
        s.end_date = biz_today() - timedelta(days=1)
        db.session.commit()
    sub = j(client.get(f"/api/me/subscriptions/{sid}", headers=h))
    j(client.get("/api/me/dashboard", headers=h))  # housekeeping runs
    sub = j(client.get(f"/api/me/subscriptions/{sid}", headers=h))
    assert sub["status"] == "completed" and sub["remaining_days"] == 0
    notes = j(client.get("/api/me/notifications", headers=h))
    assert any(n["title"] == "Subscription completed" for n in notes)


def test_reports_exports(client):
    ah = login(client, "admin@adityamilkdairy.com", "Admin@123")
    for t in ("sales", "products", "demand", "subscriptions", "payments", "deliveries"):
        r = client.get(f"/api/admin/reports/export?type={t}&format=csv", headers=ah)
        assert r.status_code == 200 and r.mimetype == "text/csv" and len(r.data.splitlines()) >= 1, t
    x = client.get("/api/admin/reports/export?type=all&format=xlsx", headers=ah)
    assert x.status_code == 200 and x.data[:2] == b"PK"
    import io
    from openpyxl import load_workbook
    wb = load_workbook(io.BytesIO(x.data))
    assert {"Sales", "Payments", "Subscriptions", "Milk demand (L)"} <= set(wb.sheetnames)
    assert wb["Payments"].max_row > 1
    d = j(client.get("/api/admin/dashboard", headers=ah))
    assert len(d["weekly_revenue"]) == 8 and len(d["monthly_revenue"]) == 6
    assert "cow_milk_litres_today" in d["cards"] and d["recent_payments"]


def test_roles_crud_and_deletes(client):
    ah = login(client, "admin@adityamilkdairy.com", "Admin@123")
    meta = j(client.get("/api/admin/roles", headers=ah))
    assert len(meta["permissions"]) == 28
    r = j(client.post("/api/admin/roles", json={"name": "Delivery Supervisor",
                                                 "permissions": ["deliveries.manage", "staff.view"]}, headers=ah), 201)
    assert r["permissions"] == ["deliveries.manage", "staff.view"]
    u = j(client.post("/api/admin/admins", json={"name": "Sup", "email": "sup@adityamilkdairy.com",
                                                  "password": "Super123", "admin_role_id": r["id"]}, headers=ah), 201)
    sh = login(client, "sup@adityamilkdairy.com", "Super123")
    assert client.get("/api/admin/deliveries", headers=sh).status_code == 200
    assert client.get("/api/admin/payments", headers=sh).status_code == 403
    assert client.delete(f"/api/admin/roles/{r['id']}", headers=ah).status_code == 409  # in use
    j(client.delete(f"/api/admin/admins/{u['id']}", headers=ah))
    j(client.delete(f"/api/admin/roles/{r['id']}", headers=ah))
    # plans with bookings cannot be hard-deleted
    plans = j(client.get("/api/admin/plans", headers=ah))
    weekly = [p for p in plans if p["code"] == "WEEKLY"][0]
    assert client.delete(f"/api/admin/plans/{weekly['id']}", headers=ah).status_code == 409
    np_ = j(client.post("/api/admin/plans", json={"code": "TEMP", "name": "Temp", "duration_days": 3}, headers=ah), 201)
    j(client.delete(f"/api/admin/plans/{np_['id']}", headers=ah))
    pc = j(client.post("/api/admin/pincodes", json={"pincode": "520099", "area": "Test", "city": "Vijayawada"}, headers=ah), 201)
    j(client.delete(f"/api/admin/pincodes/{pc['id']}", headers=ah))


def test_staff_history(client):
    rh = login(client, "ravi.delivery@adityamilkdairy.com", "Staff@123")
    hist = j(client.get("/api/staff/history", headers=rh))
    assert "deliveries" in hist


def test_location_picker(client):
    cities = j(client.get("/api/public/locations"))
    by = {c["name"]: c for c in cities}
    assert all(by[c]["available"] for c in ("Vijayawada", "Hyderabad", "Bengaluru", "Chennai"))
    assert by["Mumbai"]["available"] is False and by["Guntur"]["available"] is False
    assert cities[0]["available"] and not cities[-1]["available"]  # available cities listed first
    r = j(client.get("/api/public/locate?lat=12.93&lng=77.62"))  # Koramangala
    assert r["city"]["name"] == "Bengaluru" and r["city"]["available"]
    r = j(client.get("/api/public/locate?lat=19.07&lng=72.88"))  # Mumbai
    assert r["city"]["name"] == "Mumbai" and not r["city"]["available"]
    assert r["nearest_available"]["name"] in ("Hyderabad", "Bengaluru")
    r = j(client.get("/api/public/locate?lat=16.30&lng=80.44"))  # Guntur: close to Vijayawada but its own city
    assert r["city"]["name"] == "Guntur" and not r["city"]["available"]
    r = j(client.get("/api/public/locate?lat=25.0&lng=75.0"))  # somewhere with no city nearby
    assert r["city"] is None and r["nearest_available"]
    assert client.get("/api/public/locate?lat=abc&lng=1").status_code == 422


def test_rate_limit_on_login():
    from config import Config
    from app import create_app as mk

    class RL(Config):
        RATELIMIT_ENABLED = True
    app = mk(RL)
    with app.test_client() as c:
        codes = [c.post("/api/auth/login", json={"email": "x@y.z", "password": "bad"}).status_code for _ in range(12)]
    from app.extensions import limiter
    limiter.reset()
    limiter.enabled = False  # don't leak rate limiting into later tests
    assert codes[0] == 401 and codes[-1] == 429


def test_multi_city_service_areas(client):
    areas = j(client.get("/api/public/service-areas"))
    cities = {a["city"] for a in areas}
    assert {"Vijayawada", "Hyderabad", "Bengaluru", "Chennai"} <= cities
    r = j(client.get("/api/public/pincode/560034"))
    assert r["serviceable"] and r["city"] == "Bengaluru" and r["area"] == "Koramangala"
    # an address in Chennai gets its city from the serviceable area and can be booked
    h = _new_customer(client, "chennai@example.com", "9700000009")
    a = j(client.post("/api/me/addresses", json={"line1": "12 Usman Rd", "pincode": "600017"}, headers=h), 201)
    assert a["city"] == "Chennai" and a["area"] == "T. Nagar" and a["serviceable"]
    co, _ = _book(client, h, "cow-milk", 1, "WEEKLY", pin="600017")
    assert co["order"]["address"]["city"] == "Chennai"
    j(client.post(f"/api/me/payments/mock/{co['payment']['provider_order_id']}", json={"outcome": "success"}, headers=h))
    ah = login(client, "admin@adityamilkdairy.com", "Admin@123")
    j(client.post("/api/admin/deliveries/generate", json={"date": TOMORROW}, headers=ah))
    rows = client.get(f"/api/admin/deliveries?date={TOMORROW}&city=Chennai", headers=ah).json["data"]
    assert rows and all("Chennai" in r["address"] for r in rows) and rows[0]["route"] == "Chennai – Central"


def test_production_guard():
    from config import Config, check_production
    bad = {k: getattr(Config, k) for k in dir(Config) if k.isupper()}
    bad.update(DEV_MODE=False, PAYMENT_PROVIDER="mock")
    with pytest.raises(RuntimeError):
        check_production(bad)
    good = dict(bad, SECRET_KEY="x" * 64, JWT_SECRET_KEY="y" * 64, PAYMENT_PROVIDER="offline")
    check_production(good)  # no error


def test_offline_upi_payment_flow(client):
    app = client.application
    app.config["PAYMENT_PROVIDER"] = "offline"
    try:
        ah = login(client, "admin@adityamilkdairy.com", "Admin@123")
        j(client.put("/api/admin/settings", json={"upi_id": "adityadairy@upi"}, headers=ah))
        h = _new_customer(client, "upi@example.com", "9700000077")
        co, _ = _book(client, h, "buffalo-milk", 1, "WEEKLY")
        assert co["payment"]["provider"] == "offline" and co["payment"]["upi_id"] == "adityadairy@upi"
        sid = co["subscription"]["id"]
        # mock gateway cannot be used to self-confirm
        assert client.post(f"/api/me/payments/mock/{co['payment']['provider_order_id']}", json={"outcome": "success"},
                           headers=h).status_code == 403
        assert j(client.get(f"/api/me/subscriptions/{sid}", headers=h))["status"] == "pending_payment"
        j(client.post(f"/api/admin/subscriptions/{sid}/confirm-offline-payment",
                      json={"reference": "UPI 998877", "method": "upi"}, headers=ah))
        sub = j(client.get(f"/api/me/subscriptions/{sid}", headers=h))
        assert sub["status"] == "active"
        assert len(sub["payments"]) == 1 and sub["payments"][0]["status"] == "success"  # reserved payment reused
    finally:
        app.config["PAYMENT_PROVIDER"] = "mock"
