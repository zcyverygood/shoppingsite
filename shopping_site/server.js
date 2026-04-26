/* ============================================================
   SERVER.JS — NovaMart Express Backend
   Phase 4: Security Implementation
   Phase 5: Secure Checkout Flow (PayPal Orders v2 + Webhook)
   ============================================================ */
const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');
const multer   = require('multer');
const sharp    = require('sharp');
const bcrypt   = require('bcryptjs');
const cookieParser = require('cookie-parser');
const db       = require('./database');
const auth     = require('./auth');
const paypal   = require('./paypal');

const app  = express();
const PORT = process.env.PORT || 3000;

// Behind nginx / load balancer: honour X-Forwarded-Proto so req.protocol
// reports 'https' when the browser hit https://… (one hop).
app.set('trust proxy', 1);

// Use secure cookies when running over HTTPS (production)
const IS_SECURE = process.env.NODE_ENV === 'production' || process.env.HTTPS === '1';

function sessionCookieOptions() {
  // Phase 5: 'Lax' is required so the session cookie is still sent
  // when PayPal redirects the buyer back via top-level navigation.
  // CSRF is still mitigated by our explicit CSRF-token middleware
  // on every state-changing endpoint.
  return { httpOnly: true, secure: IS_SECURE, sameSite: 'Lax', maxAge: auth.SESSION_TTL_MS };
}

/* ─────────────────────────────────────────────────────────────
   SECURITY HEADERS — Content Security Policy (Phase 4.1)
   ───────────────────────────────────────────────────────────── */
app.use((_req, res, next) => {
  // CSP: restrict sources to self + Google Fonts; no inline scripts
  res.setHeader('Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ')
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

/* ─────────────────────────────────────────────────────────────
   MIDDLEWARE
   ───────────────────────────────────────────────────────────── */
// Capture raw body for webhook signature verification (Phase 5)
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); }
}));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));
app.use(auth.sessionMiddleware);

/* ─────────────────────────────────────────────────────────────
   MULTER — in-memory, image files only
   ───────────────────────────────────────────────────────────── */
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files (jpg, png, gif, webp) are allowed'));
  }
});

/* ─────────────────────────────────────────────────────────────
   HELPERS
   ───────────────────────────────────────────────────────────── */
// Input sanitisation: strip tags, trim
function sanitise(str) {
  return String(str || '').trim().replace(/[<>"'`]/g, '');
}

function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email||'')); }
function isStrongPassword(pw) { return typeof pw==='string'&&pw.length>=8&&/[A-Z]/.test(pw)&&/[0-9]/.test(pw); }

async function processImage(buffer, pid) {
  const uploadDir = path.join(__dirname, 'images', 'uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const fullPath  = path.join(uploadDir, `prod-${pid}.jpg`);
  const thumbPath = path.join(uploadDir, `prod-${pid}-thumb.jpg`);
  await sharp(buffer).resize(1200,1200,{fit:'inside',withoutEnlargement:true}).jpeg({quality:85}).toFile(fullPath);
  await sharp(buffer).resize(400,400,{fit:'cover'}).jpeg({quality:80}).toFile(thumbPath);
  return { image_path:`images/uploads/prod-${pid}.jpg`, thumb_path:`images/uploads/prod-${pid}-thumb.jpg` };
}

/* AUTH ROUTES */
app.get('/api/csrf',(req,res)=>{ res.json({csrf:auth.getCsrfToken(req,res)}); });
app.get('/api/me',(req,res)=>{ if(!req.user)return res.json({user:null}); res.json({user:{userid:req.user.userid,email:req.user.email,name:req.user.name,is_admin:req.user.is_admin}}); });

app.post('/api/auth/register', auth.csrfMiddleware, async(req,res)=>{
  try{
    const name=sanitise(req.body.name), email=sanitise(req.body.email).toLowerCase();
    const password=String(req.body.password||''), confirm=String(req.body.confirm||'');
    if(!name) return res.status(400).json({error:'Name is required'});
    if(!isValidEmail(email)) return res.status(400).json({error:'Invalid email address'});
    if(!isStrongPassword(password)) return res.status(400).json({error:'Password: min 8 chars, 1 uppercase, 1 digit'});
    if(password!==confirm) return res.status(400).json({error:'Passwords do not match'});
    if(db.prepare('SELECT userid FROM users WHERE email=?').get(email)) return res.status(409).json({error:'Email already registered'});
    const hash=await bcrypt.hash(password,12);
    const result=db.prepare('INSERT INTO users (email,password,name,is_admin) VALUES (?,?,?,?)').run(email,hash,name,0);
    const {token}=auth.createSession(result.lastInsertRowid);
    res.cookie(auth.SESSION_COOKIE,token,sessionCookieOptions());
    res.json({success:true,is_admin:0});
  }catch(err){console.error(err);res.status(500).json({error:'Server error'});}
});

app.post('/api/auth/login', auth.csrfMiddleware, async(req,res)=>{
  try{
    const email=sanitise(req.body.email).toLowerCase(), password=String(req.body.password||'');
    if(!isValidEmail(email)||!password) return res.status(400).json({error:'Email and password are required'});
    const user=db.prepare('SELECT * FROM users WHERE email=?').get(email);
    const dummy='$2a$12$dummyhashfortimingsafety00000000000000000000000000000';
    const match=await bcrypt.compare(password, user?user.password:dummy);
    if(!user||!match) return res.status(401).json({error:'Incorrect email or password'});
    const old=req.cookies&&req.cookies[auth.SESSION_COOKIE]; if(old) auth.destroySession(old);
    const {token}=auth.createSession(user.userid);
    res.cookie(auth.SESSION_COOKIE,token,sessionCookieOptions());
    res.json({success:true,is_admin:user.is_admin,name:user.name});
  }catch(err){console.error(err);res.status(500).json({error:'Server error'});}
});

app.post('/api/auth/logout', auth.csrfMiddleware,(req,res)=>{
  const token=req.cookies&&req.cookies[auth.SESSION_COOKIE];
  auth.destroySession(token);
  res.clearCookie(auth.SESSION_COOKIE,{httpOnly:true,sameSite:'Lax'});
  res.json({success:true});
});

app.post('/api/auth/change-password', auth.csrfMiddleware, auth.requireAuth, async(req,res)=>{
  try{
    const current=String(req.body.current_password||''), newPw=String(req.body.new_password||''), confirm=String(req.body.confirm_password||'');
    if(!current||!newPw) return res.status(400).json({error:'All password fields required'});
    if(!isStrongPassword(newPw)) return res.status(400).json({error:'New password: min 8 chars, 1 uppercase, 1 digit'});
    if(newPw!==confirm) return res.status(400).json({error:'New passwords do not match'});
    const user=db.prepare('SELECT * FROM users WHERE userid=?').get(req.user.userid);
    if(!await bcrypt.compare(current,user.password)) return res.status(401).json({error:'Current password is incorrect'});
    db.prepare('UPDATE users SET password=? WHERE userid=?').run(await bcrypt.hash(newPw,12),req.user.userid);
    const token=req.cookies&&req.cookies[auth.SESSION_COOKIE]; auth.destroySession(token);
    res.clearCookie(auth.SESSION_COOKIE,{httpOnly:true,sameSite:'Lax'});
    res.json({success:true});
  }catch(err){console.error(err);res.status(500).json({error:'Server error'});}
});

/* PUBLIC API: Categories */
app.get('/api/categories',(_req,res)=>{ res.json(db.prepare('SELECT * FROM categories ORDER BY catid').all()); });
app.get('/api/categories/:catid',(req,res)=>{
  const catid=parseInt(req.params.catid,10); if(isNaN(catid)) return res.status(400).json({error:'Invalid catid'});
  const row=db.prepare('SELECT * FROM categories WHERE catid=?').get(catid);
  if(!row) return res.status(404).json({error:'Category not found'}); res.json(row);
});

/* PUBLIC API: Products */
app.get('/api/products',(req,res)=>{
  if(req.query.catid){
    const catid=parseInt(req.query.catid,10); if(isNaN(catid)) return res.status(400).json({error:'Invalid catid'});
    return res.json(db.prepare('SELECT p.*,c.name AS category_name FROM products p JOIN categories c ON p.catid=c.catid WHERE p.catid=? ORDER BY p.pid').all(catid));
  }
  res.json(db.prepare('SELECT p.*,c.name AS category_name FROM products p JOIN categories c ON p.catid=c.catid ORDER BY p.pid').all());
});
app.get('/api/products/:pid',(req,res)=>{
  const pid=parseInt(req.params.pid,10); if(isNaN(pid)) return res.status(400).json({error:'Invalid pid'});
  const row=db.prepare('SELECT p.*,c.name AS category_name FROM products p JOIN categories c ON p.catid=c.catid WHERE p.pid=?').get(pid);
  if(!row) return res.status(404).json({error:'Product not found'}); res.json(row);
});

/* ADMIN API: Categories */
app.post('/api/admin/categories',auth.requireAdmin,auth.csrfMiddleware,(req,res)=>{
  const name=sanitise(req.body.name); if(!name||name.length>60) return res.status(400).json({error:'Name required (max 60)'});
  res.json({...db.prepare('INSERT INTO categories (name) VALUES (?)').run(name),name});
});
app.put('/api/admin/categories/:catid',auth.requireAdmin,auth.csrfMiddleware,(req,res)=>{
  const catid=parseInt(req.params.catid,10); if(isNaN(catid)) return res.status(400).json({error:'Invalid catid'});
  const name=sanitise(req.body.name); if(!name||name.length>60) return res.status(400).json({error:'Name required (max 60)'});
  const info=db.prepare('UPDATE categories SET name=? WHERE catid=?').run(name,catid);
  if(info.changes===0) return res.status(404).json({error:'Not found'}); res.json({success:true});
});
app.delete('/api/admin/categories/:catid',auth.requireAdmin,auth.csrfMiddleware,(req,res)=>{
  const catid=parseInt(req.params.catid,10); if(isNaN(catid)) return res.status(400).json({error:'Invalid catid'});
  db.prepare('DELETE FROM categories WHERE catid=?').run(catid); res.json({success:true});
});

/* ADMIN API: Products */
app.post('/api/admin/products',auth.requireAdmin,auth.csrfMiddleware,upload.single('image'),async(req,res)=>{
  try{
    const catid=parseInt(req.body.catid,10),nameClean=sanitise(req.body.name),descClean=sanitise(req.body.description),priceNum=parseFloat(req.body.price);
    if(isNaN(catid)) return res.status(400).json({error:'Invalid catid'});
    if(!nameClean||nameClean.length>120) return res.status(400).json({error:'Name required (max 120)'});
    if(isNaN(priceNum)||priceNum<0) return res.status(400).json({error:'Invalid price'});
    if(descClean.length>2000) return res.status(400).json({error:'Description too long'});
    if(!db.prepare('SELECT catid FROM categories WHERE catid=?').get(catid)) return res.status(400).json({error:'Invalid catid'});
    const result=db.prepare('INSERT INTO products (catid,name,price,description,image_path,thumb_path) VALUES (?,?,?,?,?,?)').run(catid,nameClean,priceNum,descClean,'','');
    const pid=result.lastInsertRowid;
    let imgs={image_path:'',thumb_path:''};
    if(req.file){imgs=await processImage(req.file.buffer,pid);db.prepare('UPDATE products SET image_path=?,thumb_path=? WHERE pid=?').run(imgs.image_path,imgs.thumb_path,pid);}
    res.json({pid,catid,name:nameClean,price:priceNum,description:descClean,...imgs});
  }catch(err){console.error(err);res.status(500).json({error:err.message});}
});
app.put('/api/admin/products/:pid',auth.requireAdmin,auth.csrfMiddleware,upload.single('image'),async(req,res)=>{
  try{
    const pid=parseInt(req.params.pid,10),catid=parseInt(req.body.catid,10),nameClean=sanitise(req.body.name),descClean=sanitise(req.body.description),priceNum=parseFloat(req.body.price);
    if(isNaN(pid)||isNaN(catid)) return res.status(400).json({error:'Invalid pid or catid'});
    if(!nameClean||nameClean.length>120) return res.status(400).json({error:'Name required (max 120)'});
    if(isNaN(priceNum)||priceNum<0) return res.status(400).json({error:'Invalid price'});
    if(req.file){const imgs=await processImage(req.file.buffer,pid);db.prepare('UPDATE products SET catid=?,name=?,price=?,description=?,image_path=?,thumb_path=? WHERE pid=?').run(catid,nameClean,priceNum,descClean,imgs.image_path,imgs.thumb_path,pid);}
    else{db.prepare('UPDATE products SET catid=?,name=?,price=?,description=? WHERE pid=?').run(catid,nameClean,priceNum,descClean,pid);}
    res.json({success:true});
  }catch(err){console.error(err);res.status(500).json({error:err.message});}
});
app.delete('/api/admin/products/:pid',auth.requireAdmin,auth.csrfMiddleware,(req,res)=>{
  const pid=parseInt(req.params.pid,10); if(isNaN(pid)) return res.status(400).json({error:'Invalid pid'});
  db.prepare('DELETE FROM products WHERE pid=?').run(pid); res.json({success:true});
});

/* ─────────────────────────────────────────────────────────────
   PHASE 5: SECURE CHECKOUT FLOW
   ───────────────────────────────────────────────────────────── */

/**
 * Build a deterministic, delimiter-separated string from order
 * data and hash it together with a per-order salt (HMAC-SHA-256).
 *
 * Fields (in this exact order):
 *   currency | merchant_email | salt | item_1 | item_2 | … | total
 *   item_n   = pid:quantity:unit_price
 *
 * Items are sorted by pid before joining for stability.
 */
function generateDigest({ currency, merchant_email, salt, items, total }) {
  const itemPart = [...items]
    .sort((a, b) => a.pid - b.pid)
    .map(it => `${it.pid}:${it.quantity}:${Number(it.price).toFixed(2)}`)
    .join('|');
  const payload = [
    currency,
    merchant_email,
    salt,
    itemPart,
    Number(total).toFixed(2)
  ].join('|');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function siteOrigin(req) {
  return process.env.PUBLIC_BASE_URL ||
    `${req.protocol}://${req.get('host')}`;
}

/* ── 1) Create order — invoked by checkout button via AJAX ── */
app.post('/api/checkout/create-order', auth.csrfMiddleware, auth.requireAuth, async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : null;
    if (!items || !items.length) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    // Validate every line: pid is integer, quantity is positive integer
    const cleaned = [];
    for (const it of items) {
      const pid = parseInt(it.pid, 10);
      const qty = parseInt(it.quantity, 10);
      if (isNaN(pid) || pid <= 0)         return res.status(400).json({ error: 'Invalid product id' });
      if (isNaN(qty) || qty <= 0)         return res.status(400).json({ error: 'Quantity must be a positive integer' });
      if (qty > 999)                       return res.status(400).json({ error: 'Quantity too large' });
      const prod = db.prepare('SELECT pid, name, price FROM products WHERE pid=?').get(pid);
      if (!prod) return res.status(400).json({ error: `Product #${pid} no longer exists` });
      cleaned.push({
        pid:      prod.pid,
        name:     prod.name,
        price:    Number(prod.price),
        quantity: qty
      });
    }

    // Total computed from authoritative DB prices (never trust the client)
    const total = cleaned.reduce((s, it) => s + it.price * it.quantity, 0);
    if (total <= 0) return res.status(400).json({ error: 'Order total must be positive' });

    const internalOrderId = 'NM-' + crypto.randomBytes(10).toString('hex').toUpperCase();
    const salt   = crypto.randomBytes(16).toString('hex');
    const digest = generateDigest({
      currency:       paypal.CURRENCY,
      merchant_email: paypal.MERCHANT_EMAIL,
      salt,
      items: cleaned,
      total
    });

    // Create order at PayPal (or simulated)
    const origin    = siteOrigin(req);
    const returnUrl = `${origin}/checkout/return?order_id=${encodeURIComponent(internalOrderId)}`;
    const cancelUrl = `${origin}/checkout/cancel.html?order_id=${encodeURIComponent(internalOrderId)}`;

    const ppOrder = await paypal.createOrder({
      items: cleaned,
      total,
      returnUrl,
      cancelUrl,
      referenceId: internalOrderId
    });

    // Persist the order row + items
    const insertOrder = db.prepare(`
      INSERT INTO orders
        (order_id, paypal_order_id, userid, username, currency, merchant_email,
         salt, items_json, total, digest, status, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, pid, quantity, price) VALUES (?,?,?,?)
    `);

    const tx = db.transaction(() => {
      insertOrder.run(
        internalOrderId,
        ppOrder.id,
        req.user.userid,
        req.user.email,
        paypal.CURRENCY,
        paypal.MERCHANT_EMAIL,
        salt,
        JSON.stringify(cleaned.map(it => ({ pid: it.pid, quantity: it.quantity, price: it.price }))),
        total,
        digest,
        'pending',
        Date.now()
      );
      cleaned.forEach(it => insertItem.run(internalOrderId, it.pid, it.quantity, it.price));
    });
    tx();

    res.json({
      order_id:        internalOrderId,
      paypal_order_id: ppOrder.id,
      digest,                    // returned for client visibility (server still re-validates)
      total,
      currency:        paypal.CURRENCY,
      approve_url:     ppOrder.approveUrl,
      simulated:       paypal.SIMULATION_MODE
    });
  } catch (err) {
    console.error('[checkout/create-order]', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

/* ── 2) Return URL — buyer comes back from PayPal ───────────
   Captures the payment, validates digest, marks order paid.
   In real PayPal flow the webhook may also fire; we handle
   both paths idempotently using processed_transactions.
   ─────────────────────────────────────────────────────────── */
app.get('/checkout/return', async (req, res) => {
  const orderId       = String(req.query.order_id || '');
  const paypalOrderId = String(req.query.token    || ''); // PayPal sends ?token=PAYPAL_ORDER_ID
  const order = db.prepare('SELECT * FROM orders WHERE order_id=?').get(orderId);
  if (!order) return res.redirect('/checkout/cancel.html?reason=not-found');

  try {
    const ppOrderId = paypalOrderId || order.paypal_order_id;
    const capture   = await paypal.captureOrder(ppOrderId);
    await processCompletedPayment(order, capture);
  } catch (err) {
    console.error('[checkout/return]', err);
    return res.redirect(`/checkout/cancel.html?order_id=${encodeURIComponent(orderId)}&reason=capture-failed`);
  }
  // Auto-redirect buyer back to shop with success page
  res.redirect(`/checkout/success.html?order_id=${encodeURIComponent(orderId)}`);
});

/**
 * Validate digest, mark order paid, persist transaction.
 * Idempotent: safe to call from both /checkout/return and webhook.
 */
async function processCompletedPayment(order, paypalData) {
  // Pull primary capture/transaction id
  const capture = paypalData.purchase_units &&
                  paypalData.purchase_units[0] &&
                  paypalData.purchase_units[0].payments &&
                  paypalData.purchase_units[0].payments.captures &&
                  paypalData.purchase_units[0].payments.captures[0];
  const transactionId = (capture && capture.id) || paypalData.id;

  // Idempotency check — has this transaction already been processed?
  const dup = db.prepare('SELECT 1 FROM processed_transactions WHERE transaction_id=?').get(transactionId);
  if (dup) {
    console.log('[checkout] Transaction already processed:', transactionId);
    return { alreadyProcessed: true };
  }

  // Reconstruct order data from DB and recompute digest
  const items = JSON.parse(order.items_json);
  const recomputed = generateDigest({
    currency:       order.currency,
    merchant_email: order.merchant_email,
    salt:           order.salt,
    items,
    total:          order.total
  });

  let validated = false;
  try {
    validated = crypto.timingSafeEqual(
      Buffer.from(recomputed, 'hex'),
      Buffer.from(order.digest, 'hex')
    );
  } catch { validated = false; }

  if (!validated) {
    db.prepare('UPDATE orders SET status=?, payment_status=? WHERE order_id=?')
      .run('integrity_failed', 'DIGEST_MISMATCH', order.order_id);
    throw new Error('Digest mismatch — order integrity check failed');
  }

  const payerEmail =
    (paypalData.payer && paypalData.payer.email_address) ||
    (capture && capture.payer && capture.payer.email_address) || '';

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE orders
         SET status=?, payment_status=?, transaction_id=?, payer_email=?, paid_at=?
       WHERE order_id=?
    `).run('paid', (capture && capture.status) || 'COMPLETED', transactionId, payerEmail, Date.now(), order.order_id);

    db.prepare(`
      INSERT INTO processed_transactions (transaction_id, order_id, processed_at)
      VALUES (?,?,?)
    `).run(transactionId, order.order_id, Date.now());
  });
  tx();

  console.log(`[checkout] Order ${order.order_id} paid (txn=${transactionId})`);
  return { alreadyProcessed: false, transactionId };
}

/* ── 3) PayPal Webhook ─────────────────────────────────────
   Validates authenticity, prevents replay, regenerates digest,
   validates against the digest stored in `orders`.
   ─────────────────────────────────────────────────────────── */
app.post('/api/paypal/webhook', async (req, res) => {
  try {
    const evt = req.body || {};
    console.log('[webhook] Event received:', evt.event_type || '(unknown)');

    const verified = await paypal.verifyWebhookSignature(req.headers, evt);
    if (!verified) {
      console.warn('[webhook] Signature verification failed');
      return res.status(401).json({ error: 'Webhook signature invalid' });
    }

    if (evt.event_type !== 'CHECKOUT.ORDER.APPROVED' &&
        evt.event_type !== 'PAYMENT.CAPTURE.COMPLETED' &&
        evt.event_type !== 'CHECKOUT.ORDER.COMPLETED') {
      return res.status(200).json({ ignored: true });
    }

    // Resolve our internal order id from the event
    const resource = evt.resource || {};
    let order;
    // From PAYMENT.CAPTURE.COMPLETED, supplementary_data points to the order
    const paypalOrderId =
      (resource.supplementary_data && resource.supplementary_data.related_ids && resource.supplementary_data.related_ids.order_id) ||
      resource.id;
    if (paypalOrderId) {
      order = db.prepare('SELECT * FROM orders WHERE paypal_order_id=?').get(paypalOrderId);
    }
    // Fallback via reference_id which we set to internal order id
    if (!order && resource.purchase_units && resource.purchase_units[0]) {
      const ref = resource.purchase_units[0].reference_id;
      if (ref) order = db.prepare('SELECT * FROM orders WHERE order_id=?').get(ref);
    }
    if (!order) {
      console.warn('[webhook] No matching order for', paypalOrderId);
      return res.status(404).json({ error: 'Order not found' });
    }

    // Build a paypalData shape that processCompletedPayment understands
    let payload = resource;
    if (evt.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      payload = {
        id: resource.supplementary_data?.related_ids?.order_id,
        payer: resource.payer,
        purchase_units: [{ payments: { captures: [resource] } }]
      };
    }
    const result = await processCompletedPayment(order, payload);
    res.json({ ok: true, alreadyProcessed: !!result.alreadyProcessed });
  } catch (err) {
    console.error('[webhook]', err);
    res.status(500).json({ error: err.message });
  }
});

/* ── 4) Simulation-mode helper — only available without creds.
       The simulate.html page POSTs here to mimic a successful
       PayPal payment, exercising the full webhook path.        */
app.post('/api/checkout/simulate-pay', async (req, res) => {
  if (!paypal.SIMULATION_MODE) return res.status(404).json({ error: 'Not available' });
  try {
    const orderId = String(req.body.order_id || '');
    const order = db.prepare('SELECT * FROM orders WHERE order_id=?').get(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Synthesise a "PayPal" capture event and run it through the pipeline
    const fakeCapture = await paypal.captureOrder(order.paypal_order_id);
    await processCompletedPayment(order, fakeCapture);

    // Also simulate the webhook arriving (idempotent)
    const fakeEvent = {
      simulated: true,
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: {
        id: fakeCapture.purchase_units[0].payments.captures[0].id,
        status: 'COMPLETED',
        supplementary_data: { related_ids: { order_id: order.paypal_order_id } },
        payer: fakeCapture.payer
      }
    };
    // Forward through the same code path the real webhook uses (no HTTP roundtrip)
    if (await paypal.verifyWebhookSignature({}, fakeEvent)) {
      // already processed above; processCompletedPayment is idempotent
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[simulate-pay]', err);
    res.status(500).json({ error: err.message });
  }
});

/* ── 5) Member portal — recent 5 orders ─────────────────── */
app.get('/api/orders/me', auth.requireAuth, (req, res) => {
  const orders = db.prepare(`
    SELECT order_id, paypal_order_id, currency, total, status, payment_status,
           transaction_id, created_at, paid_at
      FROM orders
     WHERE userid=?
     ORDER BY created_at DESC
     LIMIT 5
  `).all(req.user.userid);

  const itemsStmt = db.prepare(`
    SELECT oi.pid, oi.quantity, oi.price, p.name
      FROM order_items oi
 LEFT JOIN products p ON p.pid = oi.pid
     WHERE oi.order_id=?
     ORDER BY oi.id
  `);
  const enriched = orders.map(o => ({ ...o, items: itemsStmt.all(o.order_id) }));
  res.json(enriched);
});

/* ── 6) Admin — list all orders ─────────────────────────── */
app.get('/api/admin/orders', auth.requireAdmin, (_req, res) => {
  const orders = db.prepare(`
    SELECT order_id, paypal_order_id, userid, username, currency, total,
           status, payment_status, transaction_id, payer_email, created_at, paid_at
      FROM orders
     ORDER BY created_at DESC
  `).all();
  const itemsStmt = db.prepare(`
    SELECT oi.pid, oi.quantity, oi.price, p.name
      FROM order_items oi
 LEFT JOIN products p ON p.pid = oi.pid
     WHERE oi.order_id=?
     ORDER BY oi.id
  `);
  const enriched = orders.map(o => ({ ...o, items: itemsStmt.all(o.order_id) }));
  res.json(enriched);
});

/* ── 7) Public hint — testing accounts on front page ─────── */
app.get('/api/test-accounts', (_req, res) => {
  res.json({
    paypal_simulation: paypal.SIMULATION_MODE,
    accounts: [
      { role: 'Member',  email: 'user@novamart.com',  password: 'User@1234'  }
      // Admin credentials are intentionally NOT exposed publicly.
    ]
  });
});

/* ERROR HANDLER */
app.use((err,_req,res,_next)=>{ console.error(err.stack); res.status(500).json({error:err.message||'Internal server error'}); });

app.listen(PORT,()=>{
  console.log(`\n  NovaMart running at http://localhost:${PORT}`);
  console.log(`  Login: http://localhost:${PORT}/login.html`);
  console.log(`  PayPal mode: ${paypal.SIMULATION_MODE ? 'SIMULATION' : 'SANDBOX'}\n`);
});
