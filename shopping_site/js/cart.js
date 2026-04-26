/* ============================================================
   CART.JS — Phase 3: AJAX Shopping List
   - Persists pid + qty in localStorage (no page reload lost)
   - Fetches name & price from backend API (/api/products/:pid)
   - All shopping list updates happen WITHOUT a page reload
   ============================================================ */

var CART_KEY = 'novamart_cart';

// In-memory store: { pid: { id, name, price, qty } }
var cart = {};

// ── DOM References ───────────────────────────────────────────
var cartTrigger = document.getElementById('cartTrigger');
var cartPanel   = document.getElementById('cartPanel');
var cartOverlay = document.getElementById('cartOverlay');
var cartClose   = document.getElementById('cartClose');
var cartItemsEl = document.getElementById('cartItems');
var cartBadge   = document.getElementById('cartBadge');
var cartTotalEl = document.getElementById('cartTotal');

// ── Open / Close ─────────────────────────────────────────────
function openCart()  { cartPanel.classList.add('open');    cartOverlay.classList.add('open'); }
function closeCart() { cartPanel.classList.remove('open'); cartOverlay.classList.remove('open'); }

if (cartTrigger) cartTrigger.addEventListener('click', function(e) { e.stopPropagation(); openCart(); });
if (cartClose)   cartClose.addEventListener('click', closeCart);
if (cartOverlay) cartOverlay.addEventListener('click', closeCart);

// ── localStorage helpers ──────────────────────────────────────
function saveCart() {
    var storage = {};
    Object.keys(cart).forEach(function(pid) {
        storage[pid] = cart[pid].qty;
    });
    localStorage.setItem(CART_KEY, JSON.stringify(storage));
}

function loadStoredCart() {
    try {
        return JSON.parse(localStorage.getItem(CART_KEY) || '{}');
    } catch (e) {
        return {};
    }
}

// ── Fetch product info from backend ──────────────────────────
function fetchProduct(pid) {
    return fetch('/api/products/' + pid)
        .then(function(r) { return r.ok ? r.json() : null; })
        .catch(function()  { return null; });
}

// ── Add to Cart ───────────────────────────────────────────────
// Can be called from product listing pages where name/price are already known,
// but always confirms data against backend when pid is new to the cart.
function addToCart(pid, name, price) {
    pid = String(pid);

    if (cart[pid]) {
        cart[pid].qty += 1;
        saveCart();
        renderCart();
        openCart();
        return;
    }

    // Fetch name & price from backend for new cart items
    fetchProduct(pid).then(function(product) {
        if (!product) return;
        cart[pid] = {
            id:    pid,
            name:  product.name,
            price: parseFloat(product.price),
            qty:   1
        };
        saveCart();
        renderCart();
        openCart();
    });
}

// ── Remove ────────────────────────────────────────────────────
function removeFromCart(pid) {
    delete cart[String(pid)];
    saveCart();
    renderCart();
}

// ── Update quantity ───────────────────────────────────────────
function updateQty(pid, newQty) {
    pid    = String(pid);
    newQty = parseInt(newQty, 10);
    if (isNaN(newQty) || newQty < 1) {
        removeFromCart(pid);
    } else {
        if (cart[pid]) { cart[pid].qty = newQty; }
        saveCart();
        renderCart();
    }
}

// ── Render ────────────────────────────────────────────────────
function renderCart() {
    cartItemsEl.innerHTML = '';
    var total = 0;
    var count = 0;

    Object.keys(cart).forEach(function(pid) {
        var item     = cart[pid];
        var subtotal = item.price * item.qty;
        total += subtotal;
        count += item.qty;

        var li = document.createElement('li');
        li.className = 'cart-item';
        li.innerHTML =
            '<span class="cart-item-name">' + escHtml(item.name) + '</span>' +
            '<div class="cart-item-qty">' +
                '<button class="qty-dec" onclick="updateQty(\'' + pid + '\',' + (item.qty - 1) + ')">−</button>' +
                '<input type="number" min="1" value="' + item.qty + '" ' +
                       'onchange="updateQty(\'' + pid + '\', this.value)" />' +
                '<button class="qty-inc" onclick="updateQty(\'' + pid + '\',' + (item.qty + 1) + ')">+</button>' +
            '</div>' +
            '<span class="cart-item-price">$' + subtotal.toFixed(2) + '</span>' +
            '<button class="cart-item-remove" onclick="removeFromCart(\'' + pid + '\')">&times;</button>';

        cartItemsEl.appendChild(li);
    });

    if (cartBadge)   cartBadge.textContent   = count;
    if (cartTotalEl) cartTotalEl.textContent = total.toFixed(2);
}

// ── Restore cart on page load (Phase 3 requirement) ──────────
function restoreCart() {
    var stored = loadStoredCart();
    var pids   = Object.keys(stored);
    if (!pids.length) { renderCart(); return; }

    // Fetch all product details concurrently from backend
    var promises = pids.map(function(pid) {
        return fetchProduct(pid).then(function(product) {
            return { pid: pid, product: product, qty: stored[pid] };
        });
    });

    Promise.all(promises).then(function(results) {
        cart = {};
        results.forEach(function(r) {
            if (r.product && r.qty > 0) {
                cart[r.pid] = {
                    id:    r.pid,
                    name:  r.product.name,
                    price: parseFloat(r.product.price),
                    qty:   parseInt(r.qty, 10)
                };
            }
        });
        renderCart();
    });
}

// ── Bind "Add to Cart" buttons ────────────────────────────────
document.addEventListener('click', function(e) {
    var btn = e.target.closest('.add-to-cart-btn');
    if (!btn) return;
    if (btn.id === 'detailAddToCart') return; // handled in product.html

    var pid = btn.getAttribute('data-id');
    if (pid) addToCart(pid);
});

// ── Phase 5: Secure Checkout (PayPal Orders v2) ─────────────
//
// The shopping cart is wrapped in a <form> (#checkoutForm). When the
// user submits the form via the Checkout button:
//   1. cancel the default form submission
//   2. send ONLY {pid, quantity} pairs to /api/checkout/create-order
//   3. server returns a PayPal approve URL + internal order_id
//   4. clear the cart locally, then redirect the buyer to PayPal
//
function clearCart() {
    cart = {};
    saveCart();
    renderCart();
}

function setCartMsg(text, kind) {
    var el = document.getElementById('cartMsg');
    if (!el) return;
    el.textContent = text || '';
    el.className   = 'cart-msg' + (kind ? ' ' + kind : '');
}

var checkoutForm = document.getElementById('checkoutForm');
if (checkoutForm) {
    checkoutForm.addEventListener('submit', function (e) {
        e.preventDefault(); // cancel default form submission

        if (Object.keys(cart).length === 0) {
            setCartMsg('Your cart is empty.', 'error');
            return;
        }

        // Pass ONLY pid and quantity to the server (the server reads
        // current price from the DB to keep prices authoritative).
        var items = Object.keys(cart).map(function (pid) {
            return { pid: parseInt(pid, 10), quantity: parseInt(cart[pid].qty, 10) };
        });

        var btn = document.getElementById('checkoutBtn');
        btn.disabled = true;
        var origText = btn.textContent;
        btn.textContent = 'Processing…';
        setCartMsg('Validating order…', '');

        // Need a fresh CSRF token before posting
        fetch('/api/csrf')
            .then(function (r) { return r.json(); })
            .then(function (d) {
                var csrf = d.csrf;
                return fetch('/api/checkout/create-order', {
                    method: 'POST',
                    headers: {
                        'Content-Type':  'application/json',
                        'X-CSRF-Token':  csrf
                    },
                    body: JSON.stringify({ _csrf: csrf, items: items })
                });
            })
            .then(function (r) {
                if (r.status === 401) {
                    setCartMsg('Please sign in to checkout. Redirecting…', 'error');
                    setTimeout(function () { window.location.href = '/login.html'; }, 800);
                    return null;
                }
                return r.json().then(function (data) { return { ok: r.ok, data: data }; });
            })
            .then(function (resp) {
                if (!resp) return;
                if (!resp.ok) {
                    setCartMsg((resp.data && resp.data.error) || 'Checkout failed.', 'error');
                    btn.disabled = false;
                    btn.textContent = origText;
                    return;
                }
                var d = resp.data;
                setCartMsg('Order #' + d.order_id + ' created. Redirecting to PayPal…', 'success');

                // Clear the shopping cart on the client side as required
                clearCart();

                // Eventually let the user check out at the given PayPal site
                if (d.approve_url) {
                    setTimeout(function () { window.location.href = d.approve_url; }, 600);
                } else {
                    setCartMsg('Order created but no PayPal approve URL was returned.', 'error');
                    btn.disabled = false;
                    btn.textContent = origText;
                }
            })
            .catch(function (err) {
                setCartMsg('Network error: ' + err.message, 'error');
                btn.disabled = false;
                btn.textContent = origText;
            });
    });
}

// ── Utility ──────────────────────────────────────────────────
function escHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── Initialise ────────────────────────────────────────────────
restoreCart();
