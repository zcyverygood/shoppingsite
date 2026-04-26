/* ============================================================
   AUTH-COMMON.JS — Shared auth utilities for all pages
   ============================================================ */

// Fetch CSRF token from server and call cb(token)
function fetchCsrf(cb) {
    fetch('/api/csrf')
        .then(function(r){ return r.json(); })
        .then(function(d){ if(cb) cb(d.csrf); })
        .catch(function(){}); // silently ignore on public pages
}

// Simple client-side validators (mirroring server)
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email||''));
}
function isStrongPassword(pw) {
    return typeof pw==='string' && pw.length>=8 && /[A-Z]/.test(pw) && /[0-9]/.test(pw);
}

// Inject current user indicator into the header nav
function injectUserNav(adminMode) {
    fetch('/api/me')
        .then(function(r){ return r.json(); })
        .then(function(d){
            var user = d.user;
            var nav  = document.getElementById('userNavArea');
            if (!nav) return;
            if (user) {
                nav.innerHTML =
                    '<span class="nav-user-name">' + escHtmlUtil(user.name||user.email) + '</span>' +
                    (!adminMode ? '<a href="account.html" class="nav-admin-link">My Orders</a>' : '') +
                    (user.is_admin && !adminMode ? '<a href="admin.html" class="nav-admin-link">Admin</a>' : '') +
                    '<button class="nav-logout-btn" id="navLogoutBtn">Sign Out</button>';
                document.getElementById('navLogoutBtn').addEventListener('click', function(){
                    fetchCsrf(function(csrf){
                        fetch('/api/auth/logout',{
                            method:'POST',
                            headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},
                            body:JSON.stringify({_csrf:csrf})
                        }).then(function(){ window.location.href='index.html'; });
                    });
                });
            } else {
                nav.innerHTML = '<span class="nav-user-name">guest</span><a href="login.html" class="nav-login-link">Sign In</a>';
            }
        })
        .catch(function(){});
}

function escHtmlUtil(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
