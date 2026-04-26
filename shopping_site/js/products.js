// products.js — index page logic
injectUserNav();
(function () {
    var catBg = ['#2c2c2c','#3a2f2a','#1e2a3a','#2a2a3a','#2d2620'];

    function escHtml(s) {
        return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function imgSrc(p) {
        return (p.thumb_path && p.thumb_path !== '') ? p.thumb_path
             : (p.image_path && p.image_path !== '') ? p.image_path
             : 'images/placeholder.jpg';
    }

    function loadCategories() {
        fetch('/api/categories')
            .then(function(r) { return r.json(); })
            .then(function(cats) {
                var dd = document.getElementById('navCatDropdown');
                dd.innerHTML = cats.map(function(c) {
                    return '<li><a href="category.html?catid=' + c.catid + '">' + escHtml(c.name) + '</a></li>';
                }).join('');

                var fl = document.getElementById('footerCatList');
                fl.innerHTML = cats.map(function(c) {
                    return '<li><a href="category.html?catid=' + c.catid + '">' + escHtml(c.name) + '</a></li>';
                }).join('');

                var grid = document.getElementById('categoryGrid');
                grid.innerHTML = cats.map(function(c, i) {
                    var bg = catBg[i % catBg.length];
                    var imgHtml = (c.image_path && c.image_path !== '')
                        ? '<img src="' + escHtml(c.image_path) + '" alt="' + escHtml(c.name) + '" class="category-card-img" />'
                        : '<div class="category-card-img"></div>';
                    return '<a href="category.html?catid=' + c.catid + '" class="category-card" data-bg="' + bg + '">' +
                               imgHtml +
                               '<h3>' + escHtml(c.name) + '</h3>' +
                           '</a>';
                }).join('');
            });
    }

    function loadProducts() {
        var grid = document.getElementById('productGrid');
        fetch('/api/products')
            .then(function(r) { return r.json(); })
            .then(function(prods) {
                if (!prods.length) {
                    grid.innerHTML = '<p style="color:var(--clr-text-muted);padding:20px 0">No products yet.</p>';
                    return;
                }
                grid.innerHTML = prods.map(function(p) {
                    return '<article class="product-card">' +
                        '<a href="product.html?id=' + p.pid + '" class="product-card-link">' +
                            '<div class="product-thumbnail">' +
                                '<img src="' + escHtml(imgSrc(p)) + '" alt="' + escHtml(p.name) + '" />' +
                            '</div>' +
                            '<div class="product-info">' +
                                '<h3>' + escHtml(p.name) + '</h3>' +
                                '<p class="product-price">$' + Number(p.price).toFixed(2) + '</p>' +
                            '</div>' +
                        '</a>' +
                        '<button class="add-to-cart-btn" data-id="' + p.pid + '">Add to Cart</button>' +
                    '</article>';
                }).join('');
            });
    }

    function loadTestAccounts() {
        fetch('/api/test-accounts').then(function (r) { return r.json(); }).then(function (d) {
            if (!d || !d.accounts) return;
            var list = d.accounts.map(function (a) {
                return ' <code>' + escHtml(a.email) + '</code> / <code>' + escHtml(a.password) + '</code> (' + escHtml(a.role) + ')';
            }).join(' &nbsp;|&nbsp; ');
            document.getElementById('testAccountsList').innerHTML = list;
            if (d.paypal_simulation) {
                document.getElementById('paypalModeNote').innerHTML =
                    ' &nbsp; — PayPal in <strong>simulation</strong> mode (set <code>PAYPAL_CLIENT_ID</code> & <code>PAYPAL_SECRET</code> for real sandbox).';
            }
            document.getElementById('testAccountsBanner').style.display = 'block';
        }).catch(function () {});
    }

    loadCategories();
    loadProducts();
    loadTestAccounts();
})();
