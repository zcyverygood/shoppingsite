/* ============================================================
   ADMIN.JS — Part 1: Auth guard, CSRF, logout, tabs, confirm
   ============================================================ */

// Auth guard
fetch('/api/me')
  .then(function(r){return r.json();})
  .then(function(d){
    if(!d.user||!d.user.is_admin){window.location.href='/login.html';return;}
    document.getElementById('adminUserName').textContent=d.user.name||d.user.email;
    initAdmin();
  })
  .catch(function(){window.location.href='/login.html';});

// CSRF cache
var _csrf='';
function getCsrf(cb){
  if(_csrf){cb(_csrf);return;}
  fetch('/api/csrf').then(function(r){return r.json();}).then(function(d){_csrf=d.csrf;cb(_csrf);});
}
function invalidateCsrf(){_csrf='';}

// Logout
document.getElementById('adminLogoutBtn').addEventListener('click',function(){
  getCsrf(function(csrf){
    fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({_csrf:csrf})})
      .then(function(){window.location.href='/login.html';});
  });
});

function initAdmin(){

// Tab switching
document.querySelectorAll('.admin-nav-btn').forEach(function(btn){
  btn.addEventListener('click',function(){
    document.querySelectorAll('.admin-nav-btn').forEach(function(b){b.classList.remove('active');});
    document.querySelectorAll('.admin-tab').forEach(function(t){t.classList.remove('active');});
    btn.classList.add('active');
    document.getElementById('tab-'+btn.dataset.tab).classList.add('active');
    getCsrf(function(csrf){document.querySelectorAll('input[name="_csrf"]').forEach(function(f){f.value=csrf;});});
  });
});

// Confirm dialog
var confirmCallback=null;
var confirmOverlay=document.getElementById('confirmOverlay');
function showConfirm(msg,cb){document.getElementById('confirmText').textContent=msg;confirmCallback=cb;confirmOverlay.style.display='flex';}
document.getElementById('confirmYes').addEventListener('click',function(){confirmOverlay.style.display='none';if(confirmCallback)confirmCallback();confirmCallback=null;});
document.getElementById('confirmNo').addEventListener('click',function(){confirmOverlay.style.display='none';confirmCallback=null;});

// API helpers
function apiReq(method,url,body){
  return new Promise(function(resolve,reject){
    getCsrf(function(csrf){
      var opts={method:method,headers:{'X-CSRF-Token':csrf}};
      if(body instanceof FormData){body.set('_csrf',csrf);opts.body=body;}
      else if(body){opts.headers['Content-Type']='application/json';opts.body=JSON.stringify(Object.assign({_csrf:csrf},body));}
      fetch(url,opts).then(function(r){
        if(r.status===401||r.status===403){invalidateCsrf();window.location.href='/login.html';return null;}
        return r.json();
      }).then(function(d){if(d)resolve(d);}).catch(reject);
    });
  });
}
function apiGet(url){return fetch(url).then(function(r){return r.json();});}
function apiPost(url,body){return apiReq('POST',url,body);}
function apiPut(url,body){return apiReq('PUT',url,body);}
function apiDelete(url){return apiReq('DELETE',url,null);}
function imgOrPlaceholder(p){return p?'<img src="'+p+'" alt="" class="admin-table-thumb" onerror="this.style.display=\'none\'" />':'<span class="no-img">No image</span>';}
function escHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

// ============================================================
// CATEGORIES
// ============================================================
var allCategories=[];
function loadCategories(){
  apiGet('/api/categories').then(function(cats){allCategories=cats;renderCategoryTable(cats);populateCatDropdown(cats);});
}
function renderCategoryTable(cats){
  var tbody=document.getElementById('categoryTableBody');
  if(!cats.length){tbody.innerHTML='<tr><td colspan="4" class="table-empty">No categories yet.</td></tr>';return;}
  tbody.innerHTML=cats.map(function(c){
    return '<tr><td>'+c.catid+'</td><td>'+escHtml(c.name)+'</td>'+
      '<td><a href="category.html?catid='+c.catid+'" target="_blank" style="color:var(--clr-gold)">View</a></td>'+
      '<td class="actions-cell"><button class="btn-edit" onclick="editCategory('+c.catid+')">Edit</button>'+
      '<button class="btn-delete" onclick="deleteCategory('+c.catid+',\''+escHtml(c.name)+'\')" >Delete</button></td></tr>';
  }).join('');
}
function populateCatDropdown(cats){
  var sel=document.getElementById('productCatid'),cur=sel.value;
  sel.innerHTML='<option value="">Select category…</option>';
  cats.forEach(function(c){var o=document.createElement('option');o.value=c.catid;o.textContent=c.name;if(String(c.catid)===String(cur))o.selected=true;sel.appendChild(o);});
}
document.getElementById('btnNewCategory').addEventListener('click',function(){
  document.getElementById('categoryId').value='';document.getElementById('categoryName').value='';
  document.getElementById('categoryFormTitle').textContent='Add New Category';
  document.getElementById('categoryMsg').textContent='';document.getElementById('errCategoryName').textContent='';
  getCsrf(function(c){document.getElementById('categoryCsrf').value=c;});
  document.getElementById('categoryFormCard').style.display='block';
});
document.getElementById('categoryCancelBtn').addEventListener('click',function(){document.getElementById('categoryFormCard').style.display='none';});
window.editCategory=function(catid){
  var cat=allCategories.find(function(c){return c.catid===catid;});if(!cat)return;
  document.getElementById('categoryId').value=cat.catid;document.getElementById('categoryName').value=cat.name;
  document.getElementById('categoryFormTitle').textContent='Edit Category';
  document.getElementById('categoryMsg').textContent='';document.getElementById('errCategoryName').textContent='';
  getCsrf(function(c){document.getElementById('categoryCsrf').value=c;});
  document.getElementById('categoryFormCard').style.display='block';
  document.getElementById('categoryFormCard').scrollIntoView({behavior:'smooth'});
};
window.deleteCategory=function(catid,name){
  showConfirm('Delete category "'+name+'"? All its products will also be deleted.',function(){
    apiDelete('/api/admin/categories/'+catid).then(function(){invalidateCsrf();loadCategories();loadProducts();});
  });
};
document.getElementById('categoryForm').addEventListener('submit',function(e){
  e.preventDefault();
  var name=document.getElementById('categoryName').value.trim();
  var errEl=document.getElementById('errCategoryName'),msgEl=document.getElementById('categoryMsg');
  errEl.textContent='';msgEl.textContent='';
  if(!name||name.length>60){errEl.textContent='Name required (max 60 chars).';return;}
  var catid=document.getElementById('categoryId').value;
  var fd=new FormData();fd.append('name',name);
  (catid?apiPut('/api/admin/categories/'+catid,fd):apiPost('/api/admin/categories',fd)).then(function(res){
    invalidateCsrf();
    if(res&&res.error){msgEl.textContent=res.error;msgEl.className='form-msg error';return;}
    msgEl.textContent=catid?'Category updated!':'Category created!';msgEl.className='form-msg success';
    document.getElementById('categoryFormCard').style.display='none';loadCategories();
  });
});

// ============================================================
// PRODUCTS
// ============================================================
var allProducts=[];
function loadProducts(){
  apiGet('/api/products').then(function(prods){allProducts=prods;renderProductTable(prods);});
}
function renderProductTable(prods){
  var tbody=document.getElementById('productTableBody');
  if(!prods.length){tbody.innerHTML='<tr><td colspan="6" class="table-empty">No products yet.</td></tr>';return;}
  tbody.innerHTML=prods.map(function(p){
    return '<tr><td>'+p.pid+'</td><td>'+imgOrPlaceholder(p.thumb_path||p.image_path)+'</td>'+
      '<td>'+escHtml(p.name)+'</td><td>'+escHtml(p.category_name||'')+'</td><td>$'+Number(p.price).toFixed(2)+'</td>'+
      '<td class="actions-cell"><button class="btn-edit" onclick="editProduct('+p.pid+')">Edit</button>'+
      '<button class="btn-delete" onclick="deleteProduct('+p.pid+',\''+escHtml(p.name)+'\')" >Delete</button></td></tr>';
  }).join('');
}
function resetProductForm(){
  ['productId','productCatid','productName','productPrice','productDesc','productImage','productMsg'].forEach(function(id){var el=document.getElementById(id);if(el)el.value=''||'';});
  document.getElementById('productMsg').textContent='';
  document.getElementById('imagePreviewWrap').style.display='none';
  ['errCatid','errName','errPrice','errImage'].forEach(function(id){document.getElementById(id).textContent='';});
}
document.getElementById('btnNewProduct').addEventListener('click',function(){
  resetProductForm();
  document.getElementById('productFormTitle').textContent='Add New Product';
  getCsrf(function(c){document.getElementById('productCsrf').value=c;});
  document.getElementById('productFormCard').style.display='block';
});
document.getElementById('productCancelBtn').addEventListener('click',function(){document.getElementById('productFormCard').style.display='none';});
window.editProduct=function(pid){
  var p=allProducts.find(function(x){return x.pid===pid;});if(!p)return;
  resetProductForm();
  document.getElementById('productId').value=p.pid;
  document.getElementById('productCatid').value=p.catid;
  document.getElementById('productName').value=p.name;
  document.getElementById('productPrice').value=p.price;
  document.getElementById('productDesc').value=p.description||'';
  document.getElementById('productFormTitle').textContent='Edit Product #'+p.pid;
  var img=p.thumb_path||p.image_path;
  if(img){document.getElementById('imagePreview').src=img;document.getElementById('imagePreviewWrap').style.display='block';}
  getCsrf(function(c){document.getElementById('productCsrf').value=c;});
  document.getElementById('productFormCard').style.display='block';
  document.getElementById('productFormCard').scrollIntoView({behavior:'smooth'});
};
window.deleteProduct=function(pid,name){
  showConfirm('Delete product "'+name+'"?',function(){
    apiDelete('/api/admin/products/'+pid).then(function(){invalidateCsrf();loadProducts();});
  });
};
document.getElementById('productImage').addEventListener('change',function(){
  var e=document.getElementById('errImage');e.textContent='';
  if(this.files&&this.files[0]&&this.files[0].size>10*1024*1024){e.textContent='File must be ≤ 10 MB.';this.value='';}
});
document.getElementById('productForm').addEventListener('submit',function(e){
  e.preventDefault();
  var msgEl=document.getElementById('productMsg');msgEl.textContent='';
  var ok=true;
  var catid=document.getElementById('productCatid').value;
  var name=document.getElementById('productName').value.trim();
  var price=document.getElementById('productPrice').value;
  if(!catid){document.getElementById('errCatid').textContent='Select a category.';ok=false;}
  if(!name||name.length>120){document.getElementById('errName').textContent='Name required (max 120).';ok=false;}
  if(!price||isNaN(parseFloat(price))||parseFloat(price)<0){document.getElementById('errPrice').textContent='Enter a valid price.';ok=false;}
  if(!ok)return;
  var fd=new FormData(document.getElementById('productForm'));
  var pid=document.getElementById('productId').value;
  var btn=document.getElementById('productSubmitBtn');btn.textContent='Saving…';btn.disabled=true;
  (pid?apiPut('/api/admin/products/'+pid,fd):apiPost('/api/admin/products',fd)).then(function(res){
    btn.textContent='Save Product';btn.disabled=false;invalidateCsrf();
    if(res&&res.error){msgEl.textContent=res.error;msgEl.className='form-msg error';return;}
    msgEl.textContent=pid?'Product updated!':'Product created!';msgEl.className='form-msg success';
    document.getElementById('productFormCard').style.display='none';loadProducts();
  }).catch(function(err){btn.textContent='Save Product';btn.disabled=false;msgEl.textContent='Error: '+err.message;msgEl.className='form-msg error';});
});

// ============================================================
// ORDERS (Phase 5)
// ============================================================
function loadOrders() {
  var tbody = document.getElementById('ordersTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" class="table-loading">Loading…</td></tr>';
  apiGet('/api/admin/orders').then(function (orders) {
    if (!orders || !orders.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="table-empty">No orders yet.</td></tr>';
      return;
    }
    tbody.innerHTML = orders.map(function (o) {
      var itemsHtml = (o.items || []).map(function (it) {
        return escHtml(it.name || ('#' + it.pid)) + ' × ' + it.quantity;
      }).join('<br />');
      var dt = o.created_at ? new Date(o.created_at).toLocaleString() : '';
      return '<tr>' +
        '<td>' + escHtml(o.order_id) + '<br /><small style="color:var(--clr-text-muted)">PP: ' + escHtml(o.paypal_order_id || '—') + '</small></td>' +
        '<td>' + escHtml(o.username || '—') + '</td>' +
        '<td>' + itemsHtml + '</td>' +
        '<td>$' + Number(o.total).toFixed(2) + ' ' + escHtml(o.currency) + '</td>' +
        '<td><span class="order-status ' + escHtml(o.status) + '">' + escHtml(o.status) + '</span></td>' +
        '<td>' + escHtml(o.payment_status || '—') + '</td>' +
        '<td><small>' + escHtml(o.transaction_id || '—') + '</small></td>' +
        '<td><small>' + escHtml(dt) + '</small></td>' +
        '</tr>';
    }).join('');
  });
}
var btnRefreshOrders = document.getElementById('btnRefreshOrders');
if (btnRefreshOrders) btnRefreshOrders.addEventListener('click', loadOrders);

// Load orders when the tab is first activated
document.querySelectorAll('.admin-nav-btn').forEach(function (btn) {
  btn.addEventListener('click', function () {
    if (btn.dataset.tab === 'orders') loadOrders();
  });
});

// ============================================================
// CHANGE PASSWORD
// ============================================================
document.getElementById('changePasswordForm').addEventListener('submit',function(e){
  e.preventDefault();
  var pwErr=document.getElementById('pwError'),pwSucc=document.getElementById('pwSuccess');
  pwErr.style.display='none';pwSucc.style.display='none';
  ['errCurPw','errNewPw','errConfPw'].forEach(function(id){document.getElementById(id).textContent='';});
  var cur=document.getElementById('curPassword').value;
  var nw=document.getElementById('newPassword').value;
  var conf=document.getElementById('confirmPassword').value;
  var ok=true;
  if(!cur){document.getElementById('errCurPw').textContent='Current password required.';ok=false;}
  if(!nw||nw.length<8||!/[A-Z]/.test(nw)||!/[0-9]/.test(nw)){document.getElementById('errNewPw').textContent='Min 8 chars, 1 uppercase, 1 digit.';ok=false;}
  if(nw!==conf){document.getElementById('errConfPw').textContent='Passwords do not match.';ok=false;}
  if(!ok)return;
  var btn=document.getElementById('pwSubmitBtn');btn.disabled=true;btn.textContent='Updating…';
  getCsrf(function(csrf){
    fetch('/api/auth/change-password',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({current_password:cur,new_password:nw,confirm_password:conf,_csrf:csrf})})
      .then(function(r){return r.json();})
      .then(function(d){
        btn.disabled=false;btn.textContent='Update Password';invalidateCsrf();
        if(d.error){pwErr.textContent=d.error;pwErr.style.display='block';return;}
        pwSucc.textContent='Password updated. Signing you out…';pwSucc.style.display='block';
        setTimeout(function(){window.location.href='/login.html';},1500);
      })
      .catch(function(){btn.disabled=false;btn.textContent='Update Password';pwErr.textContent='Network error.';pwErr.style.display='block';});
  });
});

// Init
loadCategories();
loadProducts();
getCsrf(function(c){document.querySelectorAll('input[name="_csrf"]').forEach(function(f){f.value=c;});});

} // end initAdmin
