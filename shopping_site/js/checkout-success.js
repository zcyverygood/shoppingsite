// checkout-success.js — show order details after PayPal redirect
(function () {
    var params = new URLSearchParams(window.location.search);
    var orderId = params.get('order_id') || '';

    var info = document.getElementById('orderInfo');
    if (!orderId) {
        info.textContent = 'Order id missing from URL.';
        return;
    }

    fetch('/api/orders/me')
        .then(function (r) {
            if (r.status === 401) { window.location.href = '/login.html'; return null; }
            return r.json();
        })
        .then(function (orders) {
            if (!orders) return;
            var o = orders.find(function (x) { return x.order_id === orderId; });
            if (!o) {
                info.innerHTML = '<strong>Order ID:</strong> ' + escHtml(orderId) +
                                 '<br><em>Awaiting confirmation. Check "My Orders" in a moment.</em>';
                return;
            }
            var rows = (o.items || []).map(function (it) {
                return '<li>' + escHtml(it.name || 'Product #' + it.pid) +
                       ' × ' + it.quantity +
                       ' — $' + Number(it.price).toFixed(2) + '</li>';
            }).join('');
            info.innerHTML =
                '<div><strong>Order ID:</strong> ' + escHtml(o.order_id) + '</div>' +
                '<div><strong>Status:</strong> ' + escHtml(o.status) + '</div>' +
                (o.transaction_id ? '<div><strong>Txn:</strong> ' + escHtml(o.transaction_id) + '</div>' : '') +
                '<div><strong>Total:</strong> $' + Number(o.total).toFixed(2) + ' ' + escHtml(o.currency) + '</div>' +
                '<ul style="margin-top:10px;padding-left:18px">' + rows + '</ul>';
        });

    function escHtml(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
})();
