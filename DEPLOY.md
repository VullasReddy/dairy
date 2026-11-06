# Going live – Aditya Milk Dairy

The whole app (website + API) runs as **one service** from the `Dockerfile`, with a hosted database.
Recommended free setup: **Render** (hosting) + **Supabase** (PostgreSQL database). It takes about 20–30 minutes.

## 1. Put the code on GitHub
1. Create a new **private** repository on github.com, for example `aditya-milk-dairy`.
2. Upload the project folder with GitHub Desktop, or with "Add file → Upload files".
   **Do not upload** `frontend/node_modules`, `backend/venv`, `backend/.env` or `backend/*.db`. The `.gitignore` already excludes them.

## 2. Create the database (Supabase)
1. Go to supabase.com → New project. Choose a strong database password and the **Mumbai (ap-south-1)** region.
2. Go to Project → **Connect** → Connection string → **Session pooler** (URI) and copy it. It looks like:
   `postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`
3. Replace `[YOUR-PASSWORD]` with your database password.

## 3. Deploy on Render
1. Go to render.com → **New → Blueprint** → connect GitHub → select the repository. Render reads `render.yaml`.
2. Fill in the values it asks for:
   | Key | Value |
   |---|---|
   | `DATABASE_URL` | the Supabase string from step 2 |
   | `ADMIN_EMAIL` | your owner login email |
   | `ADMIN_PASSWORD` | a strong password: 10+ characters, with letters, numbers and a symbol |
   | `FRONTEND_URL`, `CORS_ORIGINS` | your site address, e.g. `https://aditya-milk-dairy.onrender.com`, later `https://yourdomain.com` |
   | `SMTP_*`, `MAIL_FROM` | optional now. Hostinger email: `smtp.hostinger.com`, port `587`, your email and password |
3. Click **Apply**. The first build takes about 5–10 minutes. Then open the `onrender.com` link.
4. The first start creates the tables and starter business data: products, plans, 4 cities with PIN codes, routes, FAQs, blog articles, policies and your owner account. **No demo customers, fake reviews or test accounts are created.**

## 4. First login – fill in the real business details (Admin panel → `/admin`)
- **Settings → Business & rules:** real phone number, email, WhatsApp number, address, **UPI ID** and payment instructions, and social media links.
- **Products & Pricing:** confirm each packet price, MRP and daily stock.
- **Subscription Plans:** confirm the discounts.
- **Settings → Serviceable areas:** confirm the PIN codes you really deliver to, city by city.
- **Delivery Staff & Routes:** add your delivery staff (with app login) and set each route's default person.
- **Website Content:** check About, policies and FAQs. Approve real customer reviews as they arrive, and upload genuine lab reports.

## 5. Payments
- `PAYMENT_PROVIDER=offline` (the default in `render.yaml`): customers book, then pay by **UPI or cash**. They see your UPI ID with an "Open UPI app" button.
- You confirm each payment in **Admin → Bookings → (booking) → Record payment (UPI / cash)**, and the plan becomes active.
- To accept online payments, get Razorpay keys. Then set `PAYMENT_PROVIDER=razorpay`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET`, and add the webhook URL `https://YOUR-DOMAIN/api/payments/webhook/razorpay`.
- The test payment mode (`mock`) is blocked in production. The server refuses to start with it.

## 6. Your own domain (e.g. from Hostinger)
1. In Render: Service → Settings → **Custom Domains** → add `yourdomain.com` and `www.yourdomain.com`.
2. In Hostinger: Domains → DNS → add the records Render shows. These are usually a **CNAME** for `www` pointing to `aditya-milk-dairy.onrender.com`, and an **A** record for `@` pointing to Render's IP.
3. When the domain shows "Verified" (HTTPS is automatic), update `FRONTEND_URL` and `CORS_ORIGINS` to `https://yourdomain.com`.
4. Submit `https://yourdomain.com/sitemap.xml` in Google Search Console.

## 7. Daily routine
- Every morning: **Admin → Dashboard → Generate today's deliveries**, then share the sheet or the staff app (`/staff`) with your delivery team.
- Watch **Bookings → Awaiting approval / Skip requests**, **Payments** and **Enquiries**.

## Good to know
- **Render free plan:** the site sleeps after 15 minutes without visitors, so the first visit then takes about 50 seconds. The **Starter plan** (about $7/month) keeps it always on, which is recommended for real customers.
- **Image uploads** on the free plan are lost when the service redeploys. Use image URLs, or add a Render Disk mounted at `/app/backend/uploads` on a paid plan.
- **Other hosts:** the same `Dockerfile` runs on Railway, Fly.io or any VPS (`docker build -t amd . && docker run -p 80:10000 --env-file .env amd`). Hostinger *shared* hosting cannot run Python apps; a Hostinger **VPS** can.
- **Backups:** Supabase takes daily backups. You can also export reports any time from Admin → Reports → Full workbook (Excel).
