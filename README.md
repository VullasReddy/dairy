# Aditya Milk Dairy – Premium Online Milk Subscription & Delivery Management System

A full-stack dairy e-commerce and daily milk subscription platform, built to the master development prompt and the project proposal.

| Area | What's included |
|---|---|
| Public website | Homepage built to match the supplied design, products, subscription plans with live server-side price calculator and PIN code check, about / farm journey, quality reports, testimonials, blog, FAQ, contact and policies |
| Customer app `/account` | Dashboard (active plan, milk type, daily quantity, remaining days, next and today's delivery, recent orders, payments, notifications), My Orders, My Subscriptions (skip / pause / resume / cancel), Delivery History, Payment History with receipts, My Cart, Checkout, Addresses, Profile & password, Notifications, Reviews, Help & Support |
| Admin app `/admin` | All 20 modules from the prompt, listed in §5 below |
| Delivery staff app `/staff` | Mobile-first route list: call or map the customer, Start, Delivered, Missed (with reason), and completed-delivery history |

## 1. Technology stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, **Tailwind CSS**, **Framer Motion**, React Router, **Axios**, **Recharts**, **Lucide React** icons; self-hosted fonts (Lora, Poppins, Kaushan Script) |
| Backend | Python **Flask** REST API, **SQLAlchemy**, **Flask-Migrate** (Alembic), **Flask-JWT-Extended**, Flask-Limiter (rate limiting), Flask-CORS |
| Database | **MySQL** in production; SQLite for zero-setup local development (same migrations) |
| Integrations | **Razorpay** (Orders API, server-side signature verification, webhook, refunds), SMTP email, **WhatsApp Business** (Meta Cloud API), all configured through environment variables |

**How Tailwind is used:** Tailwind is configured with the brand tokens in `tailwind.config.js` (sky, biscuit, cream, navy, gold, fonts, shadows) and is used for utilities across the app. The pixel-matched homepage and the shared components (cards, buttons, tables, sidebar) live in `src/styles/global.css` and `src/styles/app.css` as a component stylesheet. Tailwind's preflight reset and its `container` utility are switched off so they can't shift the design.

## 2. Run it locally

You need **Python 3.10+** and **Node.js 18+**.

```bash
# Backend
cd backend
python -m venv venv
# Windows: venv\Scripts\activate      macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                 # Windows: copy .env.example .env
python seed.py                       # runs the migrations, then loads business data + demo data
python run.py                        # API on http://127.0.0.1:5000

# Frontend (second terminal)
cd frontend
npm install
npm run dev                          # website on http://localhost:5173 (proxies /api to Flask)
```

### Demo logins
| Role | Email | Password |
|---|---|---|
| Owner / Super admin (all permissions) | admin@adityamilkdairy.com | Admin@123 |
| Operations Manager (role-limited) | ops@adityamilkdairy.com | Manager@123 |
| Delivery staff | ravi.delivery@adityamilkdairy.com · suresh.delivery@adityamilkdairy.com | Staff@123 |
| Demo customer (active 30-day plan) | customer@example.com | Customer@123 |

**Demo vs business data:**
- `seed.py` loads the business starter data: products, prices, plans, PIN codes, routes, staff, content and roles.
- `demo_data.py` holds the demo customer, their bookings and deliveries, separately. Demo accounts use `@example.com` addresses.
- For production, run `python seed.py --no-demo`, then change every password.

### Database & migrations
```bash
cd backend
flask --app run db upgrade                       # apply migrations (seed.py does this for you)
flask --app run db migrate -m "describe change"  # after changing app/models.py
flask --app run db upgrade --sql > schema.sql    # print the SQL without a database
```
The initial migration is in `backend/migrations/versions/`. The generated MySQL DDL is in `docs/schema_mysql.sql`. It has 28 tables, including every table named in prompt §7. `serviceable_areas` holds the PIN codes, and `admin_permissions` and `role_permissions` implement the permission system.

## 3. Tests

```bash
cd backend && pip install pytest && python -m pytest -q        # 14 test groups, all passing
```

| Prompt §13 workflow | Covered by |
|---|---|
| 1 Registration & login | `test_register_validation`, `test_full_paid_flow` |
| 2–3 Cow milk / Buffalo milk booking | `test_cow_and_buffalo_bookings` |
| 4 Free-trial eligibility | `test_trial_rules` (one per account and phone, packet limit, zero payment) |
| 5–6 Paid checkout, successful & failed payments | `test_full_paid_flow`, `test_failed_payment_and_retry` (idempotent callbacks, duplicate-checkout protection, retry) |
| 7 Admin booking approval & management | `test_admin_booking_and_skip_approval` |
| 8–10 Daily generation (no duplicates), staff assignment by route, status updates | `test_full_paid_flow` |
| 11 Customer delivery tracking | `test_full_paid_flow`, `test_permissions_and_dashboard` |
| 12 Subscription expiry | `test_subscription_expiry` |
| 13 Pause & resume | `test_failed_payment_and_retry` |
| 14 Reports & exports (CSV + Excel) | `test_reports_exports` |
| 15 Admin role permissions | `test_permissions_and_dashboard`, `test_roles_crud_and_deletes` |
| Rate limiting | `test_rate_limit_on_login` |

The whole UI was also exercised end to end in a browser: book, register, add an address, pay, then the customer pages, every admin module, and the staff app. There were no console errors and no horizontal overflow at phone width.

## 4. Business rules

- **Booking:** an account is required, and checkout is allowed only for serviceable PIN codes.
- **Pricing:** prices are calculated on the server from admin-managed packet prices; client totals are ignored. Total = packet price × daily quantity × days − plan discount.
- **Free trial:** one per account and per phone number, with a configurable packet limit and trial-eligible packets only, and optionally a verified email.
- **Payment:** a booking is confirmed only after server-verified payment. Payment callbacks are idempotent (client verification and webhook), and checkout accepts an `Idempotency-Key`. A frontend success message never marks an order paid.
- **Optional approvals (Settings):** paid bookings can wait for admin approval (`pending_approval`), and customer skip requests can require approval. When skip approval is off, skips are approved automatically within policy (maximum skips per plan).
- **Plan length:** an approved skip adds a day at the end of the plan. A pause extends the plan by the paused days, up to a configurable maximum. A missed delivery adds a make-up day (configurable).
- **Cancellation:** the refund due is worked out pro rata from undelivered days. Admins record refunds; with Razorpay the refund API is called.
- **Housekeeping:** expired plans move to Completed automatically, renewal reminders are sent, and unpaid orders fail after 24 hours.
- **Timezone:** dates follow the business timezone (`BUSINESS_TZ`, default Asia/Kolkata), not the server's UTC clock.
- **Audit log:** every important admin action is recorded, including bookings, approvals, payments, refunds, deliveries, prices, plans, roles, settings and exports.

## 5. Admin modules

1. Dashboard: total customers, active subscriptions, today's orders and deliveries, pending deliveries, weekly and monthly revenue, cow and buffalo milk demand, sales charts (daily, weekly, monthly), subscription analytics, delivery performance, recent bookings and payments. All figures come from database records.
2. Products, Milk Prices and Packet Sizes: products, variants, price, MRP, daily stock, low-stock alerts, availability and trial eligibility.
3. Subscription Plans.
4. Customers.
5. Bookings and Subscriptions, with tabs for all bookings, awaiting approval and skip requests, plus a per-booking audit history, extend, pause, resume, cancel and offline-payment entry.
6. Daily Deliveries: generate for any date; filter by PIN code, area, milk type, staff or status; group by route; assign or reassign; bulk status; CSV export; print.
7. Delivery Staff and Routes.
8. Payments and Refunds.
9. Reports and Analytics: date filters with CSV per report and an Excel workbook covering sales, products, demand, subscriptions, payments and deliveries.
10. Website Content: hero, about, journey, FAQs, policies, blog, testimonials (approval) and quality certificates.
11. Contact Enquiries.
12. Notifications and broadcasts.
13. Settings and serviceable areas.
14. Admin users, Roles and Permissions: a matrix of 14 modules × view/manage. Menus and API endpoints both enforce it.

Delete actions follow history rules. Records that bookings refer to (a plan, packet size, product or staff member with history) can't be hard-deleted; the API explains why and you can deactivate them instead.

## 6. Configuration (`backend/.env`)

| Setting | Purpose |
|---|---|
| `DATABASE_URL` | e.g. `mysql+pymysql://user:pass@localhost:3306/aditya_milk_dairy?charset=utf8mb4` |
| `SECRET_KEY`, `JWT_SECRET_KEY` | Long random values in production |
| `PAYMENT_PROVIDER` | `offline` (UPI / cash, admin confirms – default for going live), `razorpay`, or `mock` (local testing only; refused when `DEV_MODE=0`) |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | Razorpay test or live keys. Webhook URL: `https://YOUR-DOMAIN/api/payments/webhook/razorpay` (events `payment.captured`, `payment.failed`) |
| `SMTP_*`, `MAIL_FROM` | Email. If empty, emails are written to the server log |
| `WHATSAPP_PROVIDER=meta`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE` | WhatsApp Business Cloud API. Also tick "WhatsApp notifications" in Admin → Settings. Business-initiated messages need an approved template (see `app/services/messaging.py`) |
| `RATELIMIT_ENABLED`, `RATELIMIT_STORAGE_URI` | Rate limits on login, register, password reset, contact, checkout and payment verify. Use `redis://` with several workers |
| `BUSINESS_TZ` | Default `Asia/Kolkata` |
| `DEV_MODE` | `1` returns verify and reset tokens in responses for testing. **Set `0` in production** |

No secret is ever sent to the browser. The frontend only receives the public Razorpay key ID for checkout.

## 7. Daily operations & deployment

**Going live: follow [DEPLOY.md](DEPLOY.md)** (Render + Supabase, one Docker service, step by step).


- **Daily job** (cron, for example 4:00 AM):
  ```
  cd /path/backend && venv/bin/flask --app run daily-job
  ```
  It completes expired plans, sends reminders, fails abandoned payments, and generates today's and tomorrow's delivery lists. The admin dashboard also has a Generate button.
- **Production:**
  1. Set up MySQL and run `python seed.py --no-demo`.
  2. Set `DEV_MODE=0`.
  3. Run the API with `gunicorn -w 3 -b 127.0.0.1:5000 run:app`.
  4. Build the frontend with `cd frontend && npm run build` and serve `frontend/dist/` with Nginx, proxying `/api` and `/uploads` to gunicorn. Enable HTTPS.
- **Before launch, confirm with the business:**
  - Prices and packet sizes. The plan cards show "starting from" prices calculated from real packet prices, so they never advertise a price that isn't charged.
  - PIN codes and delivery timings.
  - Policies.
  - Social media page URLs (Settings). The footer shows only icons whose links are configured, so there are no placeholder links.
  - **Real customer testimonials.** The seeded three are samples.
  - **Genuine lab reports.**
- **Images:** `frontend/public/images/` contains photos cropped from the design reference so the site matches it. Replace them with high-resolution originals under the same file names.

## 8. Project structure
```
backend/
  app/models.py              28 tables (see docs/schema_mysql.sql)
  app/clock.py               business-timezone "today"
  app/services/pricing.py    server-side quote + trial eligibility
  app/services/payments.py   Razorpay/mock gateway, verification, idempotent confirmation, refunds
  app/services/delivery.py   daily generation, skip/pause/resume/cancel, approvals, housekeeping
  app/services/messaging.py  email + WhatsApp
  app/routes/                auth, public, customer, admin, staff (+ payment webhook)
  migrations/                Flask-Migrate / Alembic
  seed.py  demo_data.py  run.py  tests/
frontend/
  src/api.js                 Axios client
  src/components/            Navbar/Footer (Layout), Sidebar (Shell), cards, charts (Recharts),
                             Modal, ConfirmDialog, Toasts, skeletons, empty states, icons (Lucide)
  src/pages/public|customer|admin|staff
  src/styles/                brand stylesheet + Tailwind
  tailwind.config.js         brand tokens
docs/API.md  docs/schema_mysql.sql
```
