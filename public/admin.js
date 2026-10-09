const $=s=>document.querySelector(s);
let applications=[];
const DOCS=[['passportPhoto','Passport photo'],['kcseCertificate','KCSE certificate'],['kcpeCertificate','KCPE certificate'],['birthCertificate','Birth certificate'],['chiefRecommendation','Parent/Guardian Consent']];

document.addEventListener('DOMContentLoaded',()=>{
  $('#loginBtn')?.addEventListener('click',login);
  $('#logoutBtn')?.addEventListener('click',logout);
  $('#materialBtn')?.addEventListener('click',addMaterial);
  $('#resultBtn')?.addEventListener('click',addResult);
  $('#refreshApps')?.addEventListener('click',loadApps);
  $('#appSearch')?.addEventListener('input',renderApplications);
  $('#appStatusFilter')?.addEventListener('change',renderApplications);
  $('#apps')?.addEventListener('click',e=>{const btn=e.target.closest('[data-verify-id]');if(btn)verify(btn.getAttribute('data-verify-id'));});
  ['#email','#password'].forEach(sel=>$(sel)?.addEventListener('keydown',e=>{if(e.key==='Enter')login();}));
});

async function login(){
  const msg=$('#loginMsg');msg.textContent='Signing in...';msg.style.color='';
  try{
    const r=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({email:$('#email').value.trim(),password:$('#password').value})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){msg.textContent=d.error||'Login failed';msg.style.color='#b42318';return;}
    $('#login').classList.add('hidden');$('#dash').classList.remove('hidden');await loadApps();
  }catch(err){msg.textContent='Could not connect to the administrator service. Please refresh and try again.';msg.style.color='#b42318';console.error(err);}
}

async function loadApps(){
  const box=$('#apps');if(box)box.innerHTML='<div class="card form-card"><strong>Loading applications...</strong></div>';
  const r=await fetch('/api/admin/applications',{credentials:'same-origin'});const d=await r.json().catch(()=>({}));
  if(!r.ok){if(box)box.innerHTML='<div class="card form-card"><p class="form-message">'+esc(d.error||'Could not load applications.')+'</p></div>';return;}
  applications=Array.isArray(d)?d:[];updateStats();renderApplications();
}

function renderApplications(){
  const box=$('#apps');if(!box)return;
  const q=($('#appSearch')?.value||'').trim().toLowerCase();const status=$('#appStatusFilter')?.value||'all';
  const rows=applications.filter(a=>{const hay=[a.id,a.fullName,a.phone,a.email,a.course,a.intake,a.learningMode,a.paymentMethod,a.transactionCode,a.paymentStatus,a.applicationStatus].join(' ').toLowerCase();return(!q||hay.includes(q))&&(status==='all'||String(a.applicationStatus).toLowerCase()===status||String(a.paymentStatus).toLowerCase()===status);});
  if(!rows.length){box.innerHTML='<div class="card form-card"><p class="muted">No applications match the current search or status filter.</p></div>';return;}
  box.innerHTML=rows.map(applicationCard).join('');
}

function updateStats(){
  const total=applications.length;
  const pending=applications.filter(a=>String(a.applicationStatus||'').toLowerCase()!=='approved').length;
  const approved=applications.filter(a=>String(a.applicationStatus||'').toLowerCase()==='approved').length;
  const paid=applications.filter(a=>String(a.paymentStatus||'').toLowerCase()==='paid').length;
  $('#appStats').innerHTML='<div><strong>'+total+'</strong><span>Total applications</span></div><div><strong>'+pending+'</strong><span>Needs review</span></div><div><strong>'+approved+'</strong><span>Approved</span></div><div><strong>'+paid+'</strong><span>Payments confirmed</span></div>';
}

function applicationCard(a){
  const statusClass=String(a.applicationStatus||'submitted').toLowerCase()==='approved'?'status-approved':'status-pending';
  const paymentClass=String(a.paymentStatus||'').toLowerCase()==='paid'?'status-approved':'status-pending';
  const docLinks=DOCS.map(([field,label])=>'<a class="document-link" href="/api/admin/applications/'+encodeURIComponent(a.id)+'/documents/'+encodeURIComponent(field)+'" target="_blank" rel="noopener">'+esc(label)+' <span>Download</span></a>').join('');
  const approved=String(a.applicationStatus||'').toLowerCase()==='approved';
  const phone=String(a.phone||'').replace(/^254/,'+254');
  return '<article class="card application-card">'+
    '<div class="application-head"><div><div class="application-id">'+esc(a.id)+'</div><h3>'+esc(a.fullName)+'</h3><p class="muted">Submitted '+esc(formatDate(a.createdAt))+'</p></div>'+
    '<div class="status-stack"><span class="status-pill '+statusClass+'">Application: '+esc(a.applicationStatus)+'</span><span class="status-pill '+paymentClass+'">Payment: '+esc(a.paymentStatus)+'</span></div></div>'+
    '<div class="application-grid">'+
    '<section><h4>Applicant details</h4><div class="detail-list"><div><span>Full name</span><strong>'+esc(a.fullName)+'</strong></div><div><span>Phone</span><a href="tel:'+esc(a.phone)+'">'+esc(phone)+'</a></div><div><span>Email</span><a href="mailto:'+esc(a.email)+'">'+esc(a.email)+'</a></div></div></section>'+
    '<section><h4>Course & intake</h4><div class="detail-list"><div><span>Course</span><strong>'+esc(a.course)+'</strong></div><div><span>Intake</span><strong>'+esc(a.intake)+'</strong></div><div><span>Mode of learning</span><strong>'+esc(a.learningMode||'Not recorded')+'</strong></div><div><span>Application fee</span><strong>KSh '+esc(Number(a.amount||0).toLocaleString())+'</strong></div></div></section>'+
    '<section><h4>Payment</h4><div class="detail-list"><div><span>Payment method</span><strong>'+esc(a.paymentMethod)+'</strong></div><div><span>Transaction code</span><strong>'+esc(a.transactionCode||'Not provided')+'</strong></div><div><span>Last updated</span><strong>'+esc(formatDate(a.updatedAt))+'</strong></div></div></section>'+
    '<section><h4>Documents <span class="doc-count">'+esc(a.documentsCount??0)+'/5</span></h4><div class="document-list">'+docLinks+'</div></section>'+
    '</div><div class="application-actions"><a class="btn secondary" href="mailto:'+esc(a.email)+'">Email applicant</a><a class="btn secondary" href="tel:'+esc(a.phone)+'">Call applicant</a>'+
    (approved?'<span class="approved-note">Application approved</span>':'<button class="btn primary" data-verify-id="'+esc(a.id)+'">Verify payment & approve</button>')+
    '</div></article>';
}

async function verify(id){
  const r=await fetch('/api/admin/applications/'+encodeURIComponent(id)+'/verify',{method:'POST',credentials:'same-origin'});
  const d=await r.json().catch(()=>({}));if(r.ok)await loadApps();else alert(d.error||'Could not verify application.');
}
async function addMaterial(){const msg=$('#matMsg');const r=await fetch('/api/admin/materials',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({course:$('#mcourse').value,title:$('#mtitle').value,description:$('#mdesc').value,url:$('#murl').value})});const d=await r.json().catch(()=>({}));msg.textContent=r.ok?'Material published.':(d.error||'Could not publish');msg.style.color=r.ok?'#08743f':'#b42318';}
async function addResult(){const msg=$('#resMsg');const r=await fetch('/api/admin/results',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({studentId:$('#sid').value,course:$('#rcourse').value,unit:$('#unit').value,score:$('#score').value,grade:$('#grade').value})});const d=await r.json().catch(()=>({}));msg.textContent=r.ok?'Result saved.':(d.error||'Could not save');msg.style.color=r.ok?'#08743f':'#b42318';}
async function logout(){await fetch('/api/logout',{method:'POST',credentials:'same-origin'});location.reload();}
function formatDate(value){if(!value)return'—';const d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});}
function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));}
