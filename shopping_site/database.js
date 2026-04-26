/* ============================================================
   DATABASE.JS — SQLite Setup & Seeding
   Phase 4: Added users table with hashed passwords
   Phase 5: Added orders, order_items, processed_transactions
   ============================================================ */
const Database = require('better-sqlite3');
const path     = require('path');
const bcrypt   = require('bcryptjs');

const db = new Database(path.join(__dirname, 'novamart.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    catid      INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    image_path TEXT    DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS products (
    pid         INTEGER PRIMARY KEY AUTOINCREMENT,
    catid       INTEGER NOT NULL,
    name        TEXT    NOT NULL,
    price       REAL    NOT NULL,
    description TEXT    DEFAULT '',
    image_path  TEXT    DEFAULT '',
    thumb_path  TEXT    DEFAULT '',
    FOREIGN KEY (catid) REFERENCES categories(catid) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS users (
    userid    INTEGER PRIMARY KEY AUTOINCREMENT,
    email     TEXT    NOT NULL UNIQUE,
    password  TEXT    NOT NULL,
    name      TEXT    NOT NULL DEFAULT '',
    is_admin  INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT    PRIMARY KEY,
    userid     INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (userid) REFERENCES users(userid) ON DELETE CASCADE
  );

  /* ── Phase 5: Orders ────────────────────────────────────── */
  CREATE TABLE IF NOT EXISTS orders (
    order_id        TEXT    PRIMARY KEY,
    paypal_order_id TEXT,
    userid          INTEGER,
    username        TEXT    NOT NULL,
    currency        TEXT    NOT NULL,
    merchant_email  TEXT    NOT NULL,
    salt            TEXT    NOT NULL,
    items_json      TEXT    NOT NULL,
    total           REAL    NOT NULL,
    digest          TEXT    NOT NULL,
    status          TEXT    NOT NULL DEFAULT 'pending',
    payment_status  TEXT,
    transaction_id  TEXT,
    payer_email     TEXT,
    created_at      INTEGER NOT NULL,
    paid_at         INTEGER,
    FOREIGN KEY (userid) REFERENCES users(userid) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id  TEXT    NOT NULL,
    pid       INTEGER NOT NULL,
    quantity  INTEGER NOT NULL,
    price     REAL    NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
  );

  /* Idempotency table — prevents replay of webhook events.        */
  CREATE TABLE IF NOT EXISTS processed_transactions (
    transaction_id TEXT    PRIMARY KEY,
    order_id       TEXT    NOT NULL,
    processed_at   INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_orders_userid ON orders(userid);
  CREATE INDEX IF NOT EXISTS idx_orders_paypal ON orders(paypal_order_id);
  CREATE INDEX IF NOT EXISTS idx_order_items_orderid ON order_items(order_id);
`);

// Seed categories & products only if empty
const catCount = db.prepare('SELECT COUNT(*) as cnt FROM categories').get().cnt;
if (catCount === 0) {
  const insertCat  = db.prepare('INSERT INTO categories (name, image_path) VALUES (?,?)');
  const insertProd = db.prepare(
    'INSERT INTO products (catid, name, price, description, image_path, thumb_path) VALUES (?,?,?,?,?,?)'
  );

  const cat1 = insertCat.run('Electronics',   'images/cat-electronics.jpg').lastInsertRowid;
  const cat2 = insertCat.run('Fashion',       'images/cat-fashion.jpg').lastInsertRowid;
  const cat3 = insertCat.run('Home & Living', 'images/cat-home.jpg').lastInsertRowid;

  insertProd.run(cat1, 'Ultra Laptop Pro', 1299.00,
    'Experience unmatched performance with the Ultra Laptop Pro. Featuring a stunning 16" Retina display, M3 Pro chip, and up to 22 hours of battery life, this machine redefines portable productivity.',
    'images/prod-laptop.jpg', 'images/prod-laptop.jpg');

  insertProd.run(cat1, 'Sonic Headphones X', 249.00,
    'Immerse yourself in studio-quality sound with active noise cancellation that adapts to your environment.',
    'images/prod-headphones.jpg', 'images/prod-headphones.jpg');

  insertProd.run(cat2, 'Minimal Watch S1', 189.00,
    'The S1 distills timekeeping to its purest form. A sapphire crystal face, Swiss-made movement, and a hand-stitched leather strap.',
    'images/prod-watch.jpg', 'images/prod-watch.jpg');

  insertProd.run(cat2, 'Urban Jacket', 320.00,
    'Tailored from recycled wool blend, the Urban Jacket balances structure with movement.',
    'images/prod-jacket.jpg', 'images/prod-jacket.jpg');

  insertProd.run(cat3, 'Arc Floor Lamp', 145.00,
    'Inspired by mid-century design, the Arc Floor Lamp brings sculptural beauty to any room.',
    'images/prod-lamp.jpg', 'images/prod-lamp.jpg');

  insertProd.run(cat2, 'Cloud Runner Sneakers', 210.00,
    'Engineered for the modern mover, Cloud Runner features a responsive cushioning system that adapts to your stride.',
    'images/prod-sneakers.jpg', 'images/prod-sneakers.jpg');

  console.log('Database seeded with initial data.');
}

// Seed users only if empty
const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;
if (userCount === 0) {
  const insertUser = db.prepare('INSERT INTO users (email, password, name, is_admin) VALUES (?,?,?,?)');

  // Admin user: admin@novamart.com / Admin@1234
  const adminHash = bcrypt.hashSync('Admin@1234', 12);
  insertUser.run('admin@novamart.com', adminHash, 'Admin User', 1);

  // Normal user: user@novamart.com / User@1234
  const userHash = bcrypt.hashSync('User@1234', 12);
  insertUser.run('user@novamart.com', userHash, 'Normal User', 0);

  console.log('Users seeded (admin@novamart.com / Admin@1234, user@novamart.com / User@1234)');
}

module.exports = db;
