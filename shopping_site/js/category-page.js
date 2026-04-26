// category-page.js — category page logic
injectUserNav();
(function () {
    var params = new URLSearchParams(window.location.search);
    var catid  = params.get('catid');

    function escHtml(s) {
        return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function imgSrc(p) {
        return (p.thumb_path && p.thumb_path !== '') ? p.thumb_path
             : (p.image_path && p.image_path !== '') ? p.image_path
             : 'images/placeholder.jpg';
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

    function loadCategoryInfo() {
        if (!catid) return Promise.resolve(null);
        return fetch('/api/categories/' + catid)
            .then(function(r) { return r.ok ? r.json() : null; });
    }

    function loadProducts(catName) {
        var url = catid ? '/api/products?catid=' + catid : '/api/products';
        fetch(url)
            .then(function(r) { return r.json(); })
            .then(function(prods) {
                var title = catName || (prods.length > 0 ? prods[0].category_name : 'All Products');
                document.getElementById('categoryTitle').textContent = title;
                document.getElementById('breadcrumbCat').textContent = title;
                document.title = 'NovaMart — ' + title;

                var grid = document.getElementById('productGrid');
                if (!prods.length) {
                    grid.innerHTML = '<p style="color:var(--clr-text-muted);padding:20px 0">No products found in this category.</p>';
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

    loadNavCategories();
    loadCategoryInfo().then(function(cat) {
        loadProducts(cat ? cat.name : null);
    });
})();
