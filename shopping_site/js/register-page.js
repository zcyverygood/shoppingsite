// register-page.js — registration form logic
(function(){
    var form     = document.getElementById('registerForm');
    var btnEl    = document.getElementById('regBtn');
    var errBox   = document.getElementById('regError');
    var succBox  = document.getElementById('regSuccess');

    function showErr(msg){ errBox.textContent=msg; errBox.style.display='block'; succBox.style.display='none'; }
    function showSucc(msg){ succBox.textContent=msg; succBox.style.display='block'; errBox.style.display='none'; }
    function hideErr(){ errBox.style.display='none'; }

    fetchCsrf(function(token){ document.getElementById('csrfToken').value=token; });

    // Inline validation
    document.getElementById('regEmail').addEventListener('input',function(){
        var e=document.getElementById('errEmail');
        e.textContent=this.value&&!isValidEmail(this.value)?'Enter a valid email':'';
    });
    document.getElementById('regPassword').addEventListener('input',function(){
        var e=document.getElementById('errPassword');
        e.textContent=this.value&&!isStrongPassword(this.value)?'Min 8 chars, 1 uppercase, 1 digit':'';
    });
    document.getElementById('regConfirm').addEventListener('input',function(){
        var e=document.getElementById('errConfirm');
        var pw=document.getElementById('regPassword').value;
        e.textContent=this.value&&this.value!==pw?'Passwords do not match':'';
    });

    form.addEventListener('submit',function(e){
        e.preventDefault(); hideErr();

        var name     = document.getElementById('regName').value.trim();
        var email    = document.getElementById('regEmail').value.trim();
        var password = document.getElementById('regPassword').value;
        var confirm  = document.getElementById('regConfirm').value;

        var ok=true;
        if(!name){ document.getElementById('errName').textContent='Name required'; ok=false; }
        if(!email||!isValidEmail(email)){ document.getElementById('errEmail').textContent='Valid email required'; ok=false; }
        if(!isStrongPassword(password)){ document.getElementById('errPassword').textContent='Min 8 chars, 1 uppercase, 1 digit'; ok=false; }
        if(password!==confirm){ document.getElementById('errConfirm').textContent='Passwords do not match'; ok=false; }
        if(!ok) return;

        btnEl.disabled=true; btnEl.textContent='Creating…';
        var csrf=document.getElementById('csrfToken').value;
        fetch('/api/auth/register',{
            method:'POST',
            headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},
            body:JSON.stringify({name:name,email:email,password:password,confirm:confirm,_csrf:csrf})
        })
        .then(function(r){ return r.json(); })
        .then(function(d){
            btnEl.disabled=false; btnEl.textContent='Create Account';
            if(d.error){ showErr(d.error); return; }
            showSucc('Account created! Redirecting…');
            setTimeout(function(){ window.location.href='index.html'; },1200);
        })
        .catch(function(){
            btnEl.disabled=false; btnEl.textContent='Create Account';
            showErr('Network error. Please try again.');
        });
    });
})();
