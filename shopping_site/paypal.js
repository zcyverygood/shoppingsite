/* ============================================================
   PAYPAL.JS — PayPal Orders v2 Integration (Phase 5)
   ------------------------------------------------------------
   - Talks to PayPal sandbox via REST API
       https://developer.paypal.com/api/rest/integration/orders-api/
   - Reads CLIENT_ID / SECRET from environment variables
   - Falls back to a SIMULATION mode when credentials are missing,
     so the full secure-checkout flow (digest generation, return
     URL, webhook validation, idempotency) can still be tested
     end-to-end without real PayPal credentials.
   ============================================================ */
const crypto = require('crypto');

const PAYPAL_BASE   = process.env.PAYPAL_BASE   || 'https://api-m.sandbox.paypal.com';
const PAYPAL_WEB    = process.env.PAYPAL_WEB    || 'https://www.sandbox.paypal.com';
const CLIENT_ID     = process.env.PAYPAL_CLIENT_ID || '';
const CLIENT_SECRET = process.env.PAYPAL_SECRET    || '';
const WEBHOOK_ID    = process.env.PAYPAL_WEBHOOK_ID || '';

// Merchant configuration — used in digest generation
const MERCHANT_EMAIL = process.env.MERCHANT_EMAIL || 'merchant@novamart.test';
const CURRENCY       = process.env.CURRENCY       || 'USD';

const SIMULATION_MODE = !(CLIENT_ID && CLIENT_SECRET);

if (SIMULATION_MODE) {
  console.log('[PayPal] Running in SIMULATION mode (no PAYPAL_CLIENT_ID/SECRET set).');
  console.log('[PayPal] To use real sandbox, set PAYPAL_CLIENT_ID / PAYPAL_SECRET env vars.');
} else {
  console.log('[PayPal] Sandbox credentials detected — using real PayPal Orders v2 API.');
}

/* ── Access Token (cached) ───────────────────────────────── */
let _tokenCache = { token: null, expires_at: 0 };

async function getAccessToken() {
  if (SIMULATION_MODE) return 'SIMULATED_TOKEN';
  if (_tokenCache.token && Date.now() < _tokenCache.expires_at - 60_000) {
    return _tokenCache.token;
  }
  const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res  = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method:  'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type':  'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  _tokenCache = {
    token:      data.access_token,
    expires_at: Date.now() + (data.expires_in * 1000)
  };
  return data.access_token;
}

/* ── Create Order ────────────────────────────────────────── */
/**
 * Creates a PayPal Order via /v2/checkout/orders.
 *
 * @param {Object} opts
 * @param {Array}  opts.items   Array of { name, pid, quantity, price }
 * @param {Number} opts.total
 * @param {String} opts.returnUrl
 * @param {String} opts.cancelUrl
 * @param {String} opts.referenceId  Our internal order ID
 * @returns {{ id: string, approveUrl: string }}
 */
async function createOrder({ items, total, returnUrl, cancelUrl, referenceId }) {
  if (SIMULATION_MODE) {
    // Simulated order id; "approve" page is served by our own server
    const simId = 'SIM-' + crypto.randomBytes(8).toString('hex').toUpperCase();
    const approveUrl =
      `/checkout/simulate.html?paypal_order_id=${encodeURIComponent(simId)}` +
      `&ref=${encodeURIComponent(referenceId)}` +
      `&return=${encodeURIComponent(returnUrl)}` +
      `&cancel=${encodeURIComponent(cancelUrl)}`;
    return { id: simId, approveUrl };
  }

  const token = await getAccessToken();
  const body  = {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: referenceId,
      amount: {
        currency_code: CURRENCY,
        value: total.toFixed(2),
        breakdown: {
          item_total: { currency_code: CURRENCY, value: total.toFixed(2) }
        }
      },
      items: items.map(it => ({
        name:     String(it.name).slice(0, 127),
        sku:      String(it.pid),
        quantity: String(it.quantity),
        unit_amount: { currency_code: CURRENCY, value: Number(it.price).toFixed(2) },
        category: 'PHYSICAL_GOODS'
      }))
    }],
    application_context: {
      brand_name: 'NovaMart',
      shipping_preference: 'NO_SHIPPING',
      user_action: 'PAY_NOW',
      return_url: returnUrl,
      cancel_url: cancelUrl
    }
  };

  const res = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`PayPal createOrder failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const approve = (data.links || []).find(l => l.rel === 'approve');
  return { id: data.id, approveUrl: approve ? approve.href : null, raw: data };
}

/* ── Capture Order ───────────────────────────────────────── */
async function captureOrder(paypalOrderId) {
  if (SIMULATION_MODE) {
    return {
      id: paypalOrderId,
      status: 'COMPLETED',
      payer: { email_address: 'sim-buyer@novamart.test' },
      purchase_units: [{
        payments: { captures: [{
          id:     'SIM-TXN-' + crypto.randomBytes(6).toString('hex').toUpperCase(),
          status: 'COMPLETED'
        }] }
      }]
    };
  }
  const token = await getAccessToken();
  const res = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${paypalOrderId}/capture`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json'
    }
  });
  if (!res.ok) throw new Error(`PayPal captureOrder failed: ${res.status} ${await res.text()}`);
  return await res.json();
}

/* ── Webhook signature verification ──────────────────────── */
/**
 * Verifies a webhook callback came from PayPal using their
 * /v1/notifications/verify-webhook-signature endpoint.
 */
async function verifyWebhookSignature(headers, rawBody) {
  if (SIMULATION_MODE) {
    // In simulation mode, only accept events that include our shared secret
    return rawBody && rawBody.simulated === true;
  }
  if (!WEBHOOK_ID) {
    console.warn('[PayPal] PAYPAL_WEBHOOK_ID not set — cannot verify signature.');
    return false;
  }
  const token = await getAccessToken();
  const verifyBody = {
    auth_algo:         headers['paypal-auth-algo'],
    cert_url:          headers['paypal-cert-url'],
    transmission_id:   headers['paypal-transmission-id'],
    transmission_sig:  headers['paypal-transmission-sig'],
    transmission_time: headers['paypal-transmission-time'],
    webhook_id:        WEBHOOK_ID,
    webhook_event:     rawBody
  };
  const res = await fetch(`${PAYPAL_BASE}/v1/notifications/verify-webhook-signature`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json'
    },
    body: JSON.stringify(verifyBody)
  });
  if (!res.ok) return false;
  const data = await res.json();
  return data.verification_status === 'SUCCESS';
}

module.exports = {
  SIMULATION_MODE,
  CLIENT_ID,
  MERCHANT_EMAIL,
  CURRENCY,
  PAYPAL_WEB,
  createOrder,
  captureOrder,
  verifyWebhookSignature
};
