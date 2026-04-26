// account-page.js — show recent 5 orders for the signed-in member
injectUserNav();

(function () {
    function escHtml(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function loadNavCategories() {
        fetch('/api/categories').then(function (r) { return r.json(); })
            .then(function (cats) {
                var dd = document.getElementById('navCatDropdown');
                if (dd) dd.innerHTML = cats.map(function (c) {
                    return '<li><a href="category.html?catid=' + c.catid + '">' + escHtml(c.name) + '</a></li>';
                }).join('');
                var fl = document.getElementById('footerCatList');
                if (fl) fl.innerHTML = cats.map(function (c) {
                    return '<li><a href="category.html?catid=' + c.catid + '">' + escHtml(c.name) + '</a></li>';
                }).join('');
            });
    }

    function fmtDate(ts) {
        if (!ts) return '—';
        try { return new Date(ts).toLocaleString(); } catch (e) { return '' + ts; }
    }

    function renderOrders(orders) {
        var box = document.getElementById('orderList');
        if (!orders || !orders.length) {
            box.innerHTML = '<p style="color:var(--clr-text-muted)">You have no orders yet. <a href="index.html">Go shopping →</a></p>';
            return;
        }
        box.innerHTML = orders.map(function (o) {
            var rows = (o.items || []).map(function (it) {
                return '<tr><td>' + escHtml(it.name || ('#' + it.pid)) + '</td>' +
                       '<td>' + it.quantity + '</td>' +
                       '<td>$' + Number(it.price).toFixed(2) + '</td>' +
                       '<td>$' + (Number(it.price) * Number(it.quantity)).toFixed(2) + '</td></tr>';
            }).join('');
            return '<div class="order-card">' +
                '<div class="order-card-head">' +
                    '<div>' +
                        '<div class="oid">' + escHtml(o.order_id) + '</div>' +
                        '<div style="color:var(--clr-text-muted);font-size:0.82rem">' +
                            'Created: ' + fmtDate(o.created_at) +
                            (o.paid_at ? ' · Paid: ' + fmtDate(o.paid_at) : '') +
                        '</div>' +
                    '</div>' +
                    '<span class="order-status ' + escHtml(o.status) + '">' + escHtml(o.status) + '</span>' +
                '</div>' +
                '<table class="order-items-table">' +
                    '<thead><tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>Subtotal</th></tr></thead>' +
                    '<tbody>' + rows + '</tbody>' +
                '</table>' +
                '<div class="order-totals">Total: $' + Number(o.total).toFixed(2) + ' ' + escHtml(o.currency) + '</div>' +
                (o.transaction_id
                    ? '<div style="color:var(--clr-text-muted);font-size:0.82rem;margin-top:6px">PayPal txn: ' + escHtml(o.transaction_id) + '</div>'
                    : '') +
                '</div>';
        }).join('');
    }

    fetch('/api/orders/me').then(function (r) {
        if (r.status === 401) { window.location.href = 'login.html'; return null; }
        return r.json();
    }).then(function (orders) {
        if (!orders) return;
        renderOrders(orders);
    }).catch(function () {
        document.getElementById('orderList').innerHTML =
            '<p class="cart-msg error">Could not load orders.</p>';
    });

    loadNavCategories();
})();
