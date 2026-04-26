# NovaMart — Phase 5: Secure Checkout Flow

This document describes the Phase 5 implementation. All earlier
features (Phases 1–4) remain intact.

## What was added

| Requirement (PDF rubric) | Where it lives |
|---|---|
| 1. PayPal sandbox account / fallback | `paypal.js` — uses real sandbox if `PAYPAL_CLIENT_ID`/`PAYPAL_SECRET` are set, otherwise enters a fully working simulation mode. |
| 2. Cart wrapped in `<form>`, checkout button submits the form | `index.html`, `category.html`, `product.html`, `account.html` (`<form id="checkoutForm">`). Submission is captured in `js/cart.js` (`preventDefault`). |
| 3. Order validation on click — pid+qty only via AJAX, server generates digest, stores order, clears cart, redirects to PayPal | `js/cart.js` → `POST /api/checkout/create-order` → `server.js` (`generateDigest()` + DB insert + `paypal.createOrder()`). The cart is cleared client-side before redirecting to the approve URL. |
| Digest H(order, salt) | `generateDigest()` in `server.js`: SHA-256 of `currency \| merchant_email \| salt \| sorted(pid:qty:price) \| total`. |
| Quantity must be a positive integer; prices read from DB | Validated in `/api/checkout/create-order`. |
| User must be logged in | `auth.requireAuth` on the route + client-side 401 redirect. |
| 4. Webhook | `POST /api/paypal/webhook` (`server.js`) — verifies signature via `paypal.verifyWebhookSignature()`, idempotency check via `processed_transactions` table, regenerates and validates digest, then persists transaction. |
| Endpoint served over HTTPS | Set `NODE_ENV=production` or `HTTPS=1` so the session cookie's `secure` flag is enabled; deploy behind your TLS terminator (e.g. Nginx) to actually serve HTTPS. |
| 5. Auto-redirect after PayPal | `GET /checkout/return` captures the order and 302-redirects to `/checkout/success.html`. |
| 6. Admin panel orders view | Admin "Orders" tab in `admin.html` + `loadOrders()` in `js/admin.js`, backed by `GET /api/admin/orders`. |
| 7. Member portal — last 5 orders | `account.html` + `js/account-page.js`, backed by `GET /api/orders/me` (`LIMIT 5`). |
| Public testing-account note | Banner on `index.html`, fed by `GET /api/test-accounts`. Admin password is **not** exposed publicly. |

## Database schema (Phase 5 additions)

```
orders                    -- one row per order
  order_id (PK)           NM-XXXXX… (our internal id)
  paypal_order_id         from PayPal /v2/checkout/orders
  userid, username
  currency, merchant_email, salt
  items_json              JSON snapshot of pid/quantity/price
  total
  digest                  SHA-256 of the canonical payload
  status                  pending | paid | integrity_failed | cancelled
  payment_status          COMPLETED, FAILED, …
  transaction_id, payer_email
  created_at, paid_at

order_items               -- denormalised line items (queryable)
processed_transactions    -- idempotency guard for the webhook
```

## Running

1. Install deps once on your machine:

   ```bash
   npm install
   ```

   (If you switch Node versions you may need `npm rebuild better-sqlite3`.)

2. Start the server:

   ```bash
   # Default — simulation mode (no real PayPal credentials needed)
   node server.js

   # With real PayPal sandbox credentials
   set PAYPAL_CLIENT_ID=AZ…
   set PAYPAL_SECRET=EH…
   set PAYPAL_WEBHOOK_ID=8H…       # for webhook signature verification
   set MERCHANT_EMAIL=sb-merchant@business.example.com
   set CURRENCY=USD
   node server.js
   ```

3. Visit http://localhost:3000.

## Test plan

Sign in as `user@novamart.com` / `User@1234`, add a few products to the
cart, then click "Checkout with PayPal".

- **Simulation mode**: a local `/checkout/simulate.html` page replaces
  the real PayPal site. Click "Pay now (simulate)" — the server
  validates the digest, stores a synthetic transaction, redirects you
  to `/checkout/success.html`, and the order appears in **My Orders**
  and in the **Admin → Orders** tab.

- **Real PayPal sandbox**: Set the env vars above, restart, repeat
  the flow. PayPal hosts the approval page; on return,
  `/checkout/return` calls `captureOrder` and the (optional) webhook
  re-validates the digest end-to-end.

## Security notes

- Passwords (Phase 4) are still bcrypt-hashed at cost 12.
- Sessions are HTTP-only; CSRF tokens are required on every mutation.
- `sameSite` was relaxed from `Strict` → `Lax` *only* so the session
  cookie survives the round-trip to the PayPal site (CSRF protection
  itself relies on our explicit `_csrf` token, not the SameSite flag).
- Prices are **never** trusted from the client — the server reads
  them from the `products` table when generating the digest.
- The webhook handler uses `crypto.timingSafeEqual` for digest
  comparison and a dedicated `processed_transactions` table to defeat
  replay attacks.
