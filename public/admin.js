const $=s=>document.querySelector(s);let loggedIn=false;

document.addEventListener('DOMContentLoaded',()=>{
  $('#loginBtn')?.addEventListener('click', login);
  $('#logoutBtn')?.addEventListener('click', logout);
  $('#materialBtn')?.addEventListener('click', addMaterial);
  $('#resultBtn')?.addEventListener('click', addResult);
  $('#apps')?.addEventListener('click', e=>{
    const btn=e.target.closest('[data-verify-id]');
    if(btn) verify(btn.getAttribute('data-verify-id'));
  });
  ['#email','#password'].forEach(sel=>$(sel)?.addEventListener('keydown',e=>{if(e.key==='Enter') login();}));
});

async function login(){
  const msg=$('#loginMsg');
  msg.textContent='Signing in...';
  msg.style.color='';
  try{
    const r=await fetch('/api/admin/login',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      credentials:'same-origin',
      body:JSON.stringify({email:$('#email').value.trim(),password:$('#password').value})
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok){msg.textContent=d.error||'Login failed';msg.style.color='#b42318';return;}
    loggedIn=true;
    $('#login').classList.add('hidden');
    $('#dash').classList.remove('hidden');
    await loadApps();
  }catch(err){
    msg.textContent='Could not connect to the administrator service. Please refresh and try again.';
    msg.style.color='#b42318';
    console.error(err);
  }
}

async function loadApps(){
  const r=await fetch('/api/admin/applications',{credentials:'same-origin'});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){$('#loginMsg').textContent=d.error||'Could not load applications';return;}
  $('#apps').innerHTML=d.map(a=>`<article class="program-card"><div class="program-icon">📄</div><h3>${esc(a.fullName)}</h3><p>${esc(a.course)} · ${esc(a.intake)}<br>Payment: <strong>${esc(a.paymentStatus)}</strong><br>Status: <strong>${esc(a.applicationStatus)}</strong><br>Documents: ${esc(a.documentsCount ?? a.documents_count ?? 0)}</p><button class="btn primary" data-verify-id="${esc(a.id)}">Verify & approve</button></article>`).join('')||'<p>No applications yet.</p>';
}

async function verify(id){
  const r=await fetch('/api/admin/applications/'+encodeURIComponent(id)+'/verify',{method:'POST',credentials:'same-origin'});
  if(r.ok) loadApps();
}

async function addMaterial(){
  const msg=$('#matMsg');
  const r=await fetch('/api/admin/materials',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({course:$('#mcourse').value,title:$('#mtitle').value,description:$('#mdesc').value,url:$('#murl').value})});
  const d=await r.json().catch(()=>({}));
  msg.textContent=r.ok?'Material published.':(d.error||'Could not publish');
  msg.style.color=r.ok?'#08743f':'#b42318';
}

async function addResult(){
  const msg=$('#resMsg');
  const r=await fetch('/api/admin/results',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({studentId:$('#sid').value,course:$('#rcourse').value,unit:$('#unit').value,score:$('#score').value,grade:$('#grade').value})});
  const d=await r.json().catch(()=>({}));
  msg.textContent=r.ok?'Result saved.':(d.error||'Could not save');
  msg.style.color=r.ok?'#08743f':'#b42318';
}

async function logout(){await fetch('/api/logout',{method:'POST',credentials:'same-origin'});location.reload();}

function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));}
