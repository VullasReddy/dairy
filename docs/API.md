# Aditya Milk Dairy – REST API reference

Responses: `{"ok": true, "data": ...}` or `{"ok": false, "error": "message", "field": "name"}`. Auth: `Authorization: Bearer <token>`.


## Authentication (rate-limited)

| Method | Path | Handler |
|---|---|---|
| POST | `/api/auth/register` | register |
| POST | `/api/auth/login` | login |
| GET | `/api/auth/me` | me |
| POST | `/api/auth/forgot-password` | forgot |
| POST | `/api/auth/reset-password` | reset |
| POST | `/api/auth/verify-email` | verify email |
| POST | `/api/auth/resend-verification` | resend |
| POST | `/api/auth/otp/request` | send a 6-digit login code (mobile → SMS / WhatsApp + email; email → email). Customers & staff only |
| POST | `/api/auth/otp/verify` | log in with the code (5 tries, expires in OTP_TTL_MINUTES) |

## Public website (no login)

| Method | Path | Handler |
|---|---|---|
| GET | `/api/public/site` | site |
| GET | `/api/public/home` | home |
| GET | `/api/public/products` | products |
| GET | `/api/public/products/<slug>` | product |
| GET | `/api/public/plans` | plans |
| POST | `/api/public/quote` | public quote route |
| GET | `/api/public/testimonials` | testimonials |
| GET | `/api/public/blog` | blog |
| GET | `/api/public/blog/<slug>` | blog post |
| GET | `/api/public/faqs` | faqs |
| GET | `/api/public/quality` | quality |
| GET | `/api/public/policies/<key>` | policy |
| GET | `/api/public/pincode/<pin>` | pincode |
| GET | `/api/public/service-areas` | service areas |
| POST | `/api/public/contact` | contact |

## Customer app (role: customer)

| Method | Path | Handler |
|---|---|---|
| GET | `/api/me/dashboard` | dashboard |
| PUT | `/api/me/profile` | update profile |
| PUT | `/api/me/password` | change password |
| GET | `/api/me/addresses` | addresses |
| POST | `/api/me/addresses` | add address |
| PUT | `/api/me/addresses/<int:aid>` | edit address |
| DELETE | `/api/me/addresses/<int:aid>` | delete address |
| POST | `/api/me/quote` | my quote |
| POST | `/api/me/checkout` | checkout |
| POST | `/api/me/subscriptions/<int:sid>/retry-payment` | retry payment |
| POST | `/api/me/payments/verify` | verify payment |
| POST | `/api/me/payments/mock/<provider_order_id>` | mock payment |
| GET | `/api/me/payments/status/<provider_order_id>` | payment status |
| GET | `/api/me/subscriptions` | subscriptions |
| GET | `/api/me/subscriptions/<int:sid>` | subscription |
| POST | `/api/me/subscriptions/<int:sid>/<action>` | subscription action |
| GET | `/api/me/deliveries` | deliveries |
| GET | `/api/me/orders` | my orders |
| GET | `/api/me/payments` | payments |
| GET | `/api/me/payments/<int:pid>/receipt` | receipt |
| GET | `/api/me/notifications` | notifications |
| POST | `/api/me/notifications/read` | notifications read |
| POST | `/api/me/reviews` | add review |
| GET | `/api/me/reviews` | my reviews |
| GET | `/api/me/support` | support |

### Extra milk (one-day add-on)
| Method | Path | Notes |
|---|---|---|
| POST | `/api/me/subscriptions/<id>/addons` | `{date, variant_id, qty}` → creates an order + payment (same Pay page). Must be booked before the cut-off hour the previous day |
| POST | `/api/me/subscriptions/<id>/addons/<aid>/cancel` | before the cut-off; a paid add-on becomes a refund due |

## Admin app (role: admin; GET needs <module>.view, writes need <module>.manage)

| Method | Path | Handler |
|---|---|---|
| GET | `/api/admin/dashboard` | dashboard |
| GET | `/api/admin/products` | products |
| POST | `/api/admin/products` | create product |
| PUT | `/api/admin/products/<int:pid>` | update product |
| DELETE | `/api/admin/products/<int:pid>` | delete product |
| POST | `/api/admin/products/<int:pid>/variants` | add variant |
| PUT | `/api/admin/variants/<int:vid>` | update variant |
| GET | `/api/admin/plans` | plans |
| POST | `/api/admin/plans` | create plan |
| PUT | `/api/admin/plans/<int:pid>` | update plan |
| GET | `/api/admin/customers` | customers |
| GET | `/api/admin/customers/<int:uid>` | customer |
| PUT | `/api/admin/customers/<int:uid>` | update customer |
| GET | `/api/admin/subscriptions` | subscriptions |
| GET | `/api/admin/subscriptions/<int:sid>` | subscription |
| POST | `/api/admin/subscriptions/<int:sid>/<action>` | subscription action |
| GET | `/api/admin/deliveries` | deliveries |
| POST | `/api/admin/deliveries/generate` | generate |
| POST | `/api/admin/deliveries/assign` | assign staff |
| POST | `/api/admin/deliveries/status` | bulk status |
| GET | `/api/admin/deliveries/export` | export |
| GET | `/api/admin/staff` | staff |
| POST | `/api/admin/staff` | create staff |
| PUT | `/api/admin/staff/<int:sid>` | update staff |
| GET | `/api/admin/routes` | routes |
| POST | `/api/admin/routes` | create route |
| PUT | `/api/admin/routes/<int:rid>` | update route |
| GET | `/api/admin/pincodes` | pincodes |
| POST | `/api/admin/pincodes` | add pincode |
| PUT | `/api/admin/pincodes/<int:pid>` | update pincode |
| GET | `/api/admin/payments` | payments |
| POST | `/api/admin/payments/<int:pid>/refund` | refund |
| GET | `/api/admin/reports` | reports |
| GET | `/api/admin/reports/export` | export report |
| GET | `/api/admin/content/<key>` | get block |
| PUT | `/api/admin/content/<key>` | put block |
| GET | `/api/admin/blog` | blog |
| POST | `/api/admin/blog` | create blog |
| PUT | `/api/admin/blog/<int:bid>` | update blog |
| DELETE | `/api/admin/blog/<int:bid>` | delete blog |
| GET | `/api/admin/reviews` | reviews |
| POST | `/api/admin/reviews` | create review |
| PUT | `/api/admin/reviews/<int:rid>` | update review |
| DELETE | `/api/admin/reviews/<int:rid>` | delete review |
| GET | `/api/admin/quality-reports` | quality reports |
| POST | `/api/admin/quality-reports` | create qr |
| PUT | `/api/admin/quality-reports/<int:rid>` | update qr |
| DELETE | `/api/admin/quality-reports/<int:rid>` | delete qr |
| POST | `/api/admin/upload` | upload |
| GET | `/api/admin/enquiries` | enquiries |
| PUT | `/api/admin/enquiries/<int:eid>` | update enquiry |
| GET | `/api/admin/notifications` | admin notifications |
| POST | `/api/admin/notifications/read` | admin notifications read |
| POST | `/api/admin/notifications/broadcast` | broadcast |
| GET | `/api/admin/settings` | get settings |
| PUT | `/api/admin/settings` | put settings |
| GET | `/api/admin/admins` | admins |
| POST | `/api/admin/admins` | create admin |
| PUT | `/api/admin/admins/<int:uid>` | update admin |
| GET | `/api/admin/audit` | audit log |
| GET | `/api/admin/skip-requests` | skip requests |
| POST | `/api/admin/skip-requests/<int:rid>/<action>` | skip request action |
| GET | `/api/admin/roles` | roles |
| POST | `/api/admin/roles` | create role |
| PUT | `/api/admin/roles/<int:rid>` | update role |
| DELETE | `/api/admin/roles/<int:rid>` | delete role |
| DELETE | `/api/admin/admins/<int:uid>` | delete admin |
| DELETE | `/api/admin/variants/<int:vid>` | delete variant |
| DELETE | `/api/admin/products/<int:pid>/permanent` | delete product permanent |
| DELETE | `/api/admin/plans/<int:pid>` | delete plan |
| DELETE | `/api/admin/staff/<int:sid>` | delete staff |
| DELETE | `/api/admin/routes/<int:rid>` | delete route |
| DELETE | `/api/admin/pincodes/<int:pid>` | delete pincode |
| DELETE | `/api/admin/enquiries/<int:eid>` | delete enquiry |
| GET | `/api/admin/orders` | orders |

### Extra milk, integrations
| Method | Path | Notes |
|---|---|---|
| POST | `/api/admin/subscriptions/<id>/addons/<aid>/confirm-payment` | record a UPI / cash payment `{reference, method}` |
| POST | `/api/admin/subscriptions/<id>/addons/<aid>/cancel` | cancel (refund due if paid) |
| GET | `/api/admin/integrations` | which of WhatsApp / SMS / email / payments are configured (no keys returned) |
| POST | `/api/admin/integrations/whatsapp-test` | `{phone}` sends a WhatsApp test message |

## Delivery staff app (role: staff) & Razorpay webhook

| Method | Path | Handler |
|---|---|---|
| GET | `/api/staff/deliveries` | my deliveries |
| GET | `/api/staff/history` | history |
| POST | `/api/staff/deliveries/<int:rid>/status` | update |
| POST | `/api/payments/webhook/razorpay` | razorpay webhook |
