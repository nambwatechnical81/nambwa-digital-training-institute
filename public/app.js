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
function showMessage(text,ok=false){ const el=$('#formMessage'); el.textContent=text; el.style.color=ok?'#08743f':'#b42318'; }
function openModal(ref, text){ $('#successRef').textContent=ref; $('#successText').textContent=text; $('#successModal').classList.remove('hidden'); }
function closeModal(){ $('#successModal').classList.add('hidden'); }

$('#admissionForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const form=e.currentTarget;
  const f=new FormData(form);
  const data=Object.fromEntries(f.entries());
  const btn=$('#submitBtn'); btn.disabled=true; btn.textContent='Submitting…'; showMessage('');
  try{
    const receipt=String(data.transactionCode||'').trim().toUpperCase();
    if(!/^[A-Z0-9]{6,15}$/.test(receipt)) throw new Error('Enter a valid M-Pesa transaction code before submitting.');
    if(data.guardianAgreement!=='accepted') throw new Error('Parent/Guardian consent is required.');
    f.set('transactionCode',receipt);
    const response=await fetch('/api/applications',{method:'POST',body:f});
    const result=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(result.error||'Unable to submit application.');
    localStorage.setItem('nambwa_last_application',result.applicationId);
    const emailNotice = result.emailVerificationSent
      ? ` A verification link has been sent to ${data.email}. Open it before signing in. Your application reference is your initial portal password.`
      : ' Your application reference is your initial portal password, but the verification email could not be sent automatically. Use “Resend verification link” in the Student Portal or contact the institute.';
    openModal(result.applicationId,'Your application has been received. Your M-Pesa transaction code has been recorded and payment will remain pending verification until the institute confirms it.'+emailNotice);
    form.reset();
  } catch(err){ showMessage(err.message); } finally { btn.disabled=false; btn.textContent='Submit application'; }
});

function showPortalPanel(id, button){
  document.querySelectorAll('.portal-tab').forEach(b=>b.classList.remove('active')); if(button) button.classList.add('active');
  ['loginPanel','resendPanel'].forEach(x=>document.getElementById(x)?.classList.toggle('hidden',x!==id));
  document.getElementById('portalResult')?.classList.add('hidden');
}
async function studentLogin(){
  const msg=$('#loginMessage'); msg.textContent='';
  try{ const r=await fetch('/api/student/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('#studentLoginEmail').value,password:$('#studentLoginPassword').value})}); const data=await r.json(); if(!r.ok) throw new Error(data.error||'Login failed.'); await loadStudentDashboard(); }
  catch(e){msg.textContent=e.message;msg.style.color='#b42318';}
}
async function studentResendVerification(){
  const msg=$('#resendMessage');
  msg.textContent='Sending verification link…';msg.style.color='';
  try{
    const r=await fetch('/api/student/resend-verification',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({applicationId:$('#resendRef').value.trim(),email:$('#resendEmail').value.trim()})});
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(data.error||'Could not send verification email.');
    msg.textContent=data.message||'Check your email for the verification link.';msg.style.color='#08743f';
  }catch(e){msg.textContent=e.message;msg.style.color='#b42318';}
}
async function loadStudentDashboard(){
  const out=$('#portalResult');
  const r=await fetch('/api/student/dashboard'); const data=await r.json(); if(!r.ok) throw new Error(data.error||'Unable to load portal.');
  const materials=(data.materials||[]).map(m=>`<a href="${escapeHtml(m.url||'#')}" target="_blank" rel="noopener">${escapeHtml(m.title)}</a>`).join('')||'<p>No learning materials published for your course yet.</p>';
  const results=(data.results||[]).map(x=>`<div><span>${escapeHtml(x.unit)}</span><strong>${escapeHtml(x.score??'')} ${escapeHtml(x.grade||'')}</strong></div>`).join('')||'<p>No results published yet.</p>';
  out.classList.remove('hidden'); out.innerHTML=`<div class="section-kicker">MY DASHBOARD</div><h3 style="font-family:Poppins;margin:7px 0 12px">Welcome, ${escapeHtml(data.student.full_name)}</h3><div class="result-grid"><div><span>Program</span><strong>${escapeHtml(data.student.course||'—')}</strong></div><div><span>Intake</span><strong>${escapeHtml(data.student.intake||'—')}</strong></div><div><span>Mode of learning</span><strong>${escapeHtml(data.student.learning_mode||'—')}</strong></div><div><span>Payment</span><strong>${escapeHtml(data.student.payment_status||'—')}</strong></div><div><span>Application</span><strong>${escapeHtml(data.student.application_status||'—')}</strong></div></div><div class="dashboard-card"><strong>Learning materials</strong><div class="dashboard-list">${materials}</div></div><div class="dashboard-card"><strong>Results</strong><div class="result-grid" style="margin-top:12px">${results}</div></div><div class="portal-actions"><button onclick="logoutPortal()">Sign out</button></div>`;
}
async function logoutPortal(){ await fetch('/api/logout',{method:'POST',credentials:'same-origin'}); $('#portalResult').classList.add('hidden'); showPortalPanel('loginPanel', document.querySelector('.portal-tab')); $('#studentLoginPassword').value=''; }

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
const emailVerificationState = new URLSearchParams(location.search);
if (emailVerificationState.get('emailVerified') === '1') {
  $('#loginMessage').textContent='Email verified successfully. Sign in using your registered email and application reference.';
  $('#loginMessage').style.color='#08743f';
} else if (emailVerificationState.get('emailVerification') === 'invalid') {
  $('#loginMessage').textContent='That verification link is invalid or has expired. Request a new verification link.';
  $('#loginMessage').style.color='#b42318';
}
renderPrograms();
const requestedCourse = new URLSearchParams(location.search).get('course');
if (requestedCourse) {
  const match = PROGRAMS.find(p => p.slug === requestedCourse);
  if (match) $('#courseSelect').value = match.name;
}
