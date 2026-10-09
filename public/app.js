const PROGRAMS = [
  {name:'Artificial Intelligence', slug:'artificial-intelligence', icon:'🤖', desc:'Explore AI concepts, tools and practical digital workflows.'},
  {name:'Graphic Design', slug:'graphic-design', icon:'🎨', desc:'Learn design principles, digital graphics and creative production.'},
  {name:'Computer Applications', slug:'computer-applications', icon:'💻', desc:'Build confidence with everyday productivity and office software.'},
  {name:'Computer Hardware', slug:'computer-hardware', icon:'🔧', desc:'Understand PC components, maintenance, troubleshooting and setup.'},
  {name:'Software Installation', slug:'software-installation', icon:'⚙️', desc:'Learn operating systems, applications, setup and support skills.'},
  {name:'Networking (CCNA)', slug:'networking-ccna', icon:'🌐', desc:'Build foundations in networks, addressing, routing and switching.'},
  {name:'Printing Technology', slug:'printing-technology', icon:'🖨️', desc:'Learn digital printing workflows, equipment and production basics.'},
  {name:'Office Practice', slug:'office-practice', icon:'📋', desc:'Develop efficient workplace administration and office technology skills.'},
  {name:'Digital Marketing', slug:'digital-marketing', icon:'📣', desc:'Learn social media, online campaigns, content promotion and digital strategy.'},
  {name:'Barbering and Hair Locking', slug:'barbering-hair-locking', icon:'💈', desc:'Build practical skills in barbering, hair locking, grooming and personal care.'},
  {name:'Phone Repair and Maintenance', slug:'phone-repair-maintenance', icon:'📱', desc:'Learn smartphone diagnostics, repair techniques, maintenance and troubleshooting.'},
  {name:'Video Editing', slug:'video-editing', icon:'🎬', desc:'Develop video editing skills for social media, business and creative projects.'},
  {name:'Live Streaming', slug:'live-streaming', icon:'📡', desc:'Learn setup, production and delivery of professional live streams.'},
  {name:'Photography', slug:'photography', icon:'📷', desc:'Learn photography fundamentals, composition, lighting and digital image workflows.'},
  {name:'Sales and Marketing', slug:'sales-and-marketing', icon:'📈', desc:'Build practical skills in sales, customer engagement, promotion and marketing strategy.'}
];
const $ = (s) => document.querySelector(s);
function renderPrograms(){
  $('#programGrid').innerHTML = PROGRAMS.map((p,i)=>`<article class="program-card"><div class="program-icon">${p.icon}</div><h3><a href="/programs/${p.slug}">${p.name}</a></h3><p>${p.desc}</p><a class="apply" href="/programs/${p.slug}">View course & apply →</a></article>`).join('');
  $('#courseSelect').innerHTML = `<option value="">Select a program</option>` + PROGRAMS.map(p=>`<option>${p.name}</option>`).join('');
}
function chooseCourse(i){ $('#courseSelect').value=PROGRAMS[i].name; }
function toggleMenu(){ $('#nav').classList.toggle('open'); }
function togglePaymentFields(){ const m=document.querySelector('input[name="paymentMethod"]:checked').value; $('#tillFields').classList.toggle('hidden',m!=='till'); $('#stkFields').classList.toggle('hidden',m!=='stk'); }
function showMessage(text,ok=false){ const el=$('#formMessage'); el.textContent=text; el.style.color=ok?'#08743f':'#b42318'; }
function openModal(ref, text){ $('#successRef').textContent=ref; $('#successText').textContent=text; $('#successModal').classList.remove('hidden'); }
function closeModal(){ $('#successModal').classList.add('hidden'); }

$('#admissionForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const f=new FormData(e.currentTarget);
  const data=Object.fromEntries(f.entries());
  const btn=$('#submitBtn'); btn.disabled=true; btn.textContent='Submitting…'; showMessage('');
  try{
    let result;
    try {
      const response=await fetch('/api/applications',{method:'POST',body:f});
      result=await response.json();
      if(!response.ok) throw new Error(result.error||'Unable to submit application.');
    } catch(apiErr) {
      // Static-preview fallback: keep demo applications in the browser when no Node backend is running.
      if (location.protocol === 'file:') throw apiErr;
      const demoRef='NAMBWA-'+new Date().getFullYear()+'-'+Math.random().toString(36).slice(2,8).toUpperCase();
      result={applicationId:demoRef,paymentStatus:data.transactionCode?'pending-verification':'pending-payment'};
      const demoApps=JSON.parse(localStorage.getItem('nambwa_demo_apps')||'[]');
      demoApps.unshift({...data,id:demoRef,amount:500,applicationStatus:'submitted',paymentStatus:result.paymentStatus,documentsUploaded:[...['passportPhoto','kcseCertificate','kcpeCertificate','birthCertificate','chiefRecommendation'].map(k=>f.get(k)).filter(v=>v && v.name).map(v=>v.name)]});
      localStorage.setItem('nambwa_demo_apps',JSON.stringify(demoApps));
    }
    localStorage.setItem('nambwa_last_application',result.applicationId);
    if(data.paymentMethod==='stk'){
      try {
        const stk=await fetch('/api/mpesa/stkpush',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:data.phone,applicationId:result.applicationId})});
        const stkResult=await stk.json();
        if(!stk.ok) throw new Error(stkResult.error||'Automatic M-Pesa could not be initiated.');
        openModal(result.applicationId,'Your application is registered. Check your phone for the M-Pesa payment prompt, then keep this reference for your records.');
      } catch(stkErr) {
        openModal(result.applicationId,'Your application is registered. Automatic M-Pesa is not active on this preview yet, so please pay KSh 500 to Till 354536 and submit the transaction code for verification.');
      }
    } else {
      openModal(result.applicationId,'Your application has been received. Your Till payment will remain pending verification until the transaction is confirmed by the institute.');
    }
    e.currentTarget.reset(); togglePaymentFields();
  } catch(err){ showMessage(err.message); } finally { btn.disabled=false; btn.textContent='Submit application'; }
});

async function lookupPortal(){
  const email=$('#portalEmail')?.value.trim(); const ref=$('#portalRef')?.value.trim(); const msg=$('#portalMessage'); const out=$('#portalResult');
  if(!email||!ref){if(msg){msg.textContent='Enter your student email and application reference.';msg.style.color='#b42318';}return;}
  try{ const r=await fetch('/api/applications/'+encodeURIComponent(ref)); const data=await r.json(); if(!r.ok) throw new Error(data.error||'Not found'); if(data.email.toLowerCase()!==email.toLowerCase()) throw new Error('The email does not match this application.'); out.classList.remove('hidden'); out.innerHTML=`<div class="section-kicker">APPLICATION</div><h3 style="font-family:Poppins;margin:7px 0 12px">${escapeHtml(data.fullName)}</h3><div class="result-grid"><div><span>Program</span><strong>${escapeHtml(data.course)}</strong></div><div><span>Intake</span><strong>${escapeHtml(data.intake)}</strong></div><div><span>Mode of learning</span><strong>${escapeHtml(data.learningMode||'—')}</strong></div><div><span>Payment</span><strong>${escapeHtml(data.paymentStatus)}</strong></div><div><span>Application</span><strong>${escapeHtml(data.applicationStatus)}</strong></div></div><div class="portal-actions"><button onclick="showPortalPanel('activatePanel', document.querySelector('.portal-tab:nth-child(2)'))">Activate account</button></div>`;
  }catch(err){out.classList.add('hidden');if(msg){msg.textContent=err.message;msg.style.color='#b42318';}}
}
function showPortalPanel(id, button){
  document.querySelectorAll('.portal-tab').forEach(b=>b.classList.remove('active')); if(button) button.classList.add('active');
  ['loginPanel','activatePanel'].forEach(x=>document.getElementById(x)?.classList.toggle('hidden',x!==id));
  document.getElementById('portalResult')?.classList.add('hidden');
}
async function studentLogin(){
  const msg=$('#loginMessage'); msg.textContent='';
  try{ const r=await fetch('/api/student/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('#studentLoginEmail').value,password:$('#studentLoginPassword').value})}); const data=await r.json(); if(!r.ok) throw new Error(data.error||'Login failed.'); await loadStudentDashboard(); }
  catch(e){msg.textContent=e.message;msg.style.color='#b42318';}
}
async function activateStudent(){
  const msg=$('#activateMessage'); msg.textContent='';
  try{ const r=await fetch('/api/student/activate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({applicationId:$('#activateRef').value.trim(),email:$('#activateEmail').value.trim(),password:$('#activatePassword').value})}); const data=await r.json(); if(!r.ok) throw new Error(data.error||'Account activation failed.'); msg.textContent='Account activated. Loading your portal…';msg.style.color='#08743f'; await loadStudentDashboard(); }
  catch(e){msg.textContent=e.message;msg.style.color='#b42318';}
}
async function loadStudentDashboard(){
  const out=$('#portalResult');
  const r=await fetch('/api/student/dashboard'); const data=await r.json(); if(!r.ok) throw new Error(data.error||'Unable to load portal.');
  const materials=(data.materials||[]).map(m=>`<a href="${escapeHtml(m.url||'#')}" target="_blank" rel="noopener">${escapeHtml(m.title)}</a>`).join('')||'<p>No learning materials published for your course yet.</p>';
  const results=(data.results||[]).map(x=>`<div><span>${escapeHtml(x.unit)}</span><strong>${escapeHtml(x.score??'')} ${escapeHtml(x.grade||'')}</strong></div>`).join('')||'<p>No results published yet.</p>';
  out.classList.remove('hidden'); out.innerHTML=`<div class="section-kicker">MY DASHBOARD</div><h3 style="font-family:Poppins;margin:7px 0 12px">Welcome, ${escapeHtml(data.student.full_name)}</h3><div class="result-grid"><div><span>Program</span><strong>${escapeHtml(data.student.course||'—')}</strong></div><div><span>Intake</span><strong>${escapeHtml(data.student.intake||'—')}</strong></div><div><span>Mode of learning</span><strong>${escapeHtml(data.student.learning_mode||'—')}</strong></div><div><span>Payment</span><strong>${escapeHtml(data.student.payment_status||'—')}</strong></div><div><span>Application</span><strong>${escapeHtml(data.student.application_status||'—')}</strong></div></div><div class="dashboard-card"><strong>Learning materials</strong><div class="dashboard-list">${materials}</div></div><div class="dashboard-card"><strong>Results</strong><div class="result-grid" style="margin-top:12px">${results}</div></div><div class="portal-actions"><button onclick="logoutPortal()">Sign out</button></div>`;
}
async function logoutPortal(){ await fetch('/api/logout',{method:'POST'}); $('#portalResult').classList.add('hidden'); showPortalPanel('loginPanel', document.querySelector('.portal-tab')); $('#studentLoginPassword').value=''; }

function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));}

const heroPhotoPrimary = document.querySelector('.hero-photo-primary');
const heroPhotoSecondary = document.querySelector('.hero-photo-secondary');
if (heroPhotoPrimary && heroPhotoSecondary) {
  window.setInterval(() => {
    const showSecond = heroPhotoSecondary.classList.toggle('is-active');
    heroPhotoPrimary.classList.toggle('is-hidden', showSecond);
  }, 6000);
}

document.querySelectorAll('nav a').forEach(a=>a.addEventListener('click',()=>$('#nav').classList.remove('open')));
document.getElementById('year').textContent=new Date().getFullYear();
renderPrograms();
const requestedCourse = new URLSearchParams(location.search).get('course');
if (requestedCourse) {
  const match = PROGRAMS.find(p => p.slug === requestedCourse);
  if (match) $('#courseSelect').value = match.name;
}
