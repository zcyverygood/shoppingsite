// login-page.js — login form logic
(function(){
    var form    = document.getElementById('loginForm');
    var btnEl   = document.getElementById('loginBtn');
    var errBox  = document.getElementById('loginError');

    function showErr(msg){ errBox.textContent=msg; errBox.style.display='block'; }
    function hideErr(){ errBox.style.display='none'; }

    // Load CSRF token
    fetchCsrf(function(token){
        document.getElementById('csrfToken').value = token;
    });

    // Inline field validation
    document.getElementById('loginEmail').addEventListener('input', function(){
        var e = document.getElementById('errEmail');
        e.textContent = this.value && !isValidEmail(this.value) ? 'Enter a valid email' : '';
    });

    form.addEventListener('submit', function(e){
        e.preventDefault();
        hideErr();

        var email    = document.getElementById('loginEmail').value.trim();
        var password = document.getElementById('loginPassword').value;

        if(!email || !isValidEmail(email)){ document.getElementById('errEmail').textContent='Valid email required'; return; }
        if(!password){ document.getElementById('errPassword').textContent='Password required'; return; }

        btnEl.disabled = true; btnEl.textContent = 'Signing in…';

        var csrf = document.getElementById('csrfToken').value;
        fetch('/api/auth/login',{
            method:'POST',
            headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},
            body:JSON.stringify({email:email,password:password,_csrf:csrf})
        })
        .then(function(r){ return r.json(); })
        .then(function(d){
            btnEl.disabled=false; btnEl.textContent='Sign In';
            if(d.error){ showErr(d.error); return; }
            window.location.href = d.is_admin ? 'admin.html' : 'index.html';
        })
        .catch(function(){
            btnEl.disabled=false; btnEl.textContent='Sign In';
            showErr('Network error. Please try again.');
        });
    });
})();
