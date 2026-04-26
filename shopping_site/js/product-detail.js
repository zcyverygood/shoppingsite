// product-detail.js — product page logic
injectUserNav();
(function () {
    var params = new URLSearchParams(window.location.search);
    var pid    = params.get('id');

    function escHtml(s) {
        return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function loadNavCategories() {
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
            });
    }

    function loadProduct() {
        if (!pid) { window.location.href = 'index.html'; return; }

        fetch('/api/products/' + pid)
            .then(function(r) {
                if (!r.ok) throw new Error('Not found');
                return r.json();
            })
            .then(function(p) {
                var fullImg = (p.image_path && p.image_path !== '') ? p.image_path
                            : (p.thumb_path && p.thumb_path !== '') ? p.thumb_path
                            : '';

                var container = document.getElementById('productDetailContainer');
                container.innerHTML =
                    '<div class="product-detail-images">' +
                        (fullImg
                            ? '<img id="detailImage" src="' + escHtml(fullImg) + '" alt="' + escHtml(p.name) + '" />'
                            : '<div class="product-detail-images" style="background:var(--clr-bg);border-radius:12px;height:420px;display:flex;align-items:center;justify-content:center;color:var(--clr-text-muted);font-size:0.85rem">No image</div>'
                        ) +
                    '</div>' +
                    '<div class="product-detail-info">' +
                        '<h1 id="detailName">' + escHtml(p.name) + '</h1>' +
                        '<p class="detail-price" id="detailPrice">$' + Number(p.price).toFixed(2) + '</p>' +
                        '<p class="detail-description" id="detailDescription">' + escHtml(p.description || '') + '</p>' +
                        '<div class="detail-actions">' +
                            '<label for="detailQty">Quantity</label>' +
                            '<input type="number" id="detailQty" class="qty-input" min="1" value="1" />' +
                            '<button class="add-to-cart-btn detail-add-btn" id="detailAddToCart">Add to Cart</button>' +
                        '</div>' +
                    '</div>';

                document.title = 'NovaMart — ' + p.name;
                document.getElementById('breadcrumbProduct').textContent = p.name;
                document.getElementById('breadcrumbCat').querySelector('a').textContent = p.category_name || 'Category';
                document.getElementById('breadcrumbCatLink').href = 'category.html?catid=' + p.catid;

                document.getElementById('detailAddToCart').addEventListener('click', function() {
                    var qty = parseInt(document.getElementById('detailQty').value, 10) || 1;
                    for (var i = 0; i < qty; i++) {
                        addToCart(p.pid);
                    }
                });
            })
            .catch(function() {
                window.location.href = 'index.html';
            });
    }

    loadNavCategories();
    loadProduct();
})();
