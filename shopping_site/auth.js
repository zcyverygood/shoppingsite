/* ============================================================
   AUTH.JS — Authentication & CSRF Utilities
   Phase 4 Security Module
   ============================================================ */
const crypto = require('crypto');
const db     = require('./database');

// Cookie name
const SESSION_COOKIE = 'nm_session';
// Session duration: 3 days (in ms)
const SESSION_TTL_MS = 3 * 24 * 60 * 60 * 1000;
// CSRF token cookie name
const CSRF_COOKIE = 'nm_csrf';

/* ── Token Generation ─────────────────────────────────────── */
// Generates a cryptographically secure random hex token
function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/* ── Session Management ───────────────────────────────────── */
function createSession(userid) {
  const token     = generateToken(32);
  const expiresAt = Date.now() + SESSION_TTL_MS;
  db.prepare('INSERT INTO sessions (token, userid, expires_at) VALUES (?,?,?)').run(token, userid, expiresAt);
  return { token, expiresAt };
}

function getSession(token) {
  if (!token) return null;
  const row = db.prepare('SELECT * FROM sessions WHERE token=?').get(token);
  if (!row) return null;
  if (Date.now() > row.expires_at) {
    db.prepare('DELETE FROM sessions WHERE token=?').run(token);
    return null;
  }
  return row;
}

function destroySession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(token);
}

// Purge expired sessions periodically
function purgeExpiredSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
}
setInterval(purgeExpiredSessions, 60 * 60 * 1000); // every hour

/* ── CSRF Token Management ────────────────────────────────── */
function getCsrfToken(req, res) {
  // Read existing CSRF token from cookie or create a new one
  let token = req.cookies && req.cookies[CSRF_COOKIE];
  if (!token || token.length < 32) {
    token = generateToken(32);
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false, // must be readable by JS to embed in forms
      sameSite: 'Lax',
      maxAge: SESSION_TTL_MS
    });
  }
  return token;
}

function validateCsrf(req, res) {
  const cookieToken = req.cookies && req.cookies[CSRF_COOKIE];
  const bodyToken   = req.body && req.body._csrf;
  const headerToken = req.headers && req.headers['x-csrf-token'];
  const provided    = bodyToken || headerToken;

  if (!cookieToken || !provided) return false;
  // Constant-time comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(cookieToken),
      Buffer.from(provided)
    );
  } catch {
    return false;
  }
}

/* ── Middleware ───────────────────────────────────────────── */

// Attaches req.user if session is valid
function sessionMiddleware(req, res, next) {
  const token = req.cookies && req.cookies[SESSION_COOKIE];
  const sess  = getSession(token);
  if (sess) {
    const user = db.prepare('SELECT userid, email, name, is_admin FROM users WHERE userid=?').get(sess.userid);
    req.user    = user || null;
    req.session = sess;
  } else {
    req.user    = null;
    req.session = null;
  }
  next();
}

// Requires a valid session; 401 otherwise
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required', redirect: '/login.html' });
  }
  next();
}

// Requires admin role
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required', redirect: '/login.html' });
  }
  next();
}

// Validates CSRF token on mutating requests; skips GET/HEAD/OPTIONS
function csrfMiddleware(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!validateCsrf(req, res)) {
    return res.status(403).json({ error: 'Invalid or missing CSRF token' });
  }
  next();
}

module.exports = {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  CSRF_COOKIE,
  generateToken,
  createSession,
  getSession,
  destroySession,
  getCsrfToken,
  validateCsrf,
  sessionMiddleware,
  requireAuth,
  requireAdmin,
  csrfMiddleware
};
