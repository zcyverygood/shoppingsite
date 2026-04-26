// checkout-simulate.js — local PayPal sandbox stand-in
(function () {
    var params         = new URLSearchParams(window.location.search);
    var paypalOrderId  = params.get('paypal_order_id') || '';
    var ref            = params.get('ref') || '';
    var returnUrl      = params.get('return') || '/index.html';
    var cancelUrl      = params.get('cancel') || '/checkout/cancel.html';

    var info = document.getElementById('simInfo');
    var msg  = document.getElementById('simMsg');
    info.innerHTML =
        '<li><strong>Internal order id:</strong> ' + escHtml(ref) + '</li>' +
        '<li><strong>PayPal order id:</strong> ' + escHtml(paypalOrderId) + '</li>' +
        '<li><strong>Return URL:</strong> ' + escHtml(returnUrl) + '</li>';

    document.getElementById('payBtn').addEventListener('click', function () {
        msg.textContent = 'Submitting simulated payment…';
        // Normally PayPal would redirect to the return URL with ?token=... .
        // Here we mimic that by forwarding to the same URL after the server
        // has marked the order paid via /api/checkout/simulate-pay.
        fetch('/api/checkout/simulate-pay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: ref })
        })
        .then(function (r) { return r.json(); })
        .then(function (d) {
            if (d.error) { msg.textContent = 'Failed: ' + d.error; return; }
            msg.textContent = 'Payment captured. Redirecting…';
            // Mimic PayPal's redirect (?token=PAYPAL_ORDER_ID)
            var sep = returnUrl.indexOf('?') === -1 ? '?' : '&';
            window.location.href = returnUrl + sep + 'token=' + encodeURIComponent(paypalOrderId);
        })
        .catch(function (e) { msg.textContent = 'Network error: ' + e.message; });
    });

    document.getElementById('cancelBtn').addEventListener('click', function () {
        window.location.href = cancelUrl;
    });

    function escHtml(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
})();
