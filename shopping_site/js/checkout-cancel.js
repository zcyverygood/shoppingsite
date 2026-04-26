// checkout-cancel.js
(function () {
    var params = new URLSearchParams(window.location.search);
    var reason = params.get('reason') || '';
    var orderId = params.get('order_id') || '';
    var msg = document.getElementById('cancelReason');

    var text = 'Your checkout was cancelled. No payment has been taken.';
    if (reason === 'capture-failed') {
        text = 'We could not capture the payment with PayPal. Please try again.';
    } else if (reason === 'not-found') {
        text = 'We could not find that order.';
    }
    if (orderId) text += ' (Order ' + orderId + ')';
    msg.textContent = text;
})();
