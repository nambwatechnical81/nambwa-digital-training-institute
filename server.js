const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Rebuild the optimized high-quality classroom carousel image from committed base64 parts.
const classroomAssetParts = [
  'asset-parts/classroom-2.part01.b64',
  'asset-parts/classroom-2.part02.b64',
  'asset-parts/classroom-2.part03.b64',
  'asset-parts/classroom-2.part04.b64',
  'asset-parts/classroom-2.part05.b64',
  'asset-parts/classroom-2.part06.b64'
];
const classroomAssetBase64 = classroomAssetParts
  .map(file => fs.readFileSync(path.join(__dirname, file), 'utf8').trim())
  .join('');
fs.writeFileSync(path.join(PUBLIC_DIR, 'classroom-2.webp'), Buffer.from(classroomAssetBase64, 'base64'));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');

const PROGRAMS = [
  ['artificial-intelligence','Artificial Intelligence','Explore AI concepts, tools and practical digital workflows.'],
  ['graphic-design','Graphic Design','Learn design principles, digital graphics and creative production.'],
  ['computer-applications','Computer Applications','Build confidence with everyday productivity and office software.'],
  ['computer-hardware','Computer Hardware','Understand PC components, maintenance, troubleshooting and setup.'],
  ['software-installation','Software Installation','Learn operating systems, applications, setup and support skills.'],
  ['networking-ccna','Networking (CCNA)','Build foundations in networks, addressing, routing and switching.'],
  ['printing-technology','Printing Technology','Learn digital printing workflows, equipment and production basics.'],
  ['office-practice','Office Practice','Develop efficient workplace administration and office technology skills.'],
  ['digital-marketing','Digital Marketing','Learn social media, online campaigns, content promotion and digital strategy.'],
  ['barbering-hair-locking','Barbering and Hair Locking','Build practical skills in barbering, hair locking, grooming and personal care.'],
  ['phone-repair-maintenance','Phone Repair and Maintenance','Learn smartphone diagnostics, repair techniques, maintenance and troubleshooting.'],
  ['video-editing','Video Editing','Develop video editing skills for social media, business and creative projects.'],
  ['live-streaming','Live Streaming','Learn setup, production and delivery of professional live streams.'],
  ['photography','Photography','Learn photography fundamentals, composition, lighting and digital image workflows.'],
  ['sales-and-marketing','Sales and Marketing','Build practical skills in sales, customer engagement, promotion and marketing strategy.']
];


const COURSE_DETAILS = {
  'artificial-intelligence': { learn: ['AI concepts, responsible use and common AI tools', 'Prompting and practical AI-assisted workflows', 'Ways to use AI for study, content and everyday productivity'], audience: 'Learners, professionals and entrepreneurs who want practical AI skills.' },
  'graphic-design': { learn: ['Design principles, typography, layout and visual communication', 'Digital graphics for branding, social media and print', 'Practical creative workflows for producing polished visual content'], audience: 'Learners interested in creative design, branding and digital content.' },
  'computer-applications': { learn: ['Everyday computer operation and file management', 'Productivity applications for documents, spreadsheets and presentations', 'Efficient digital workflows for school, business and office tasks'], audience: 'Beginners and anyone who wants stronger everyday computer skills.' },
  'computer-hardware': { learn: ['PC components and their functions', 'Basic assembly, maintenance and troubleshooting', 'Safe hardware setup and practical support procedures'], audience: 'Learners interested in computer maintenance and technical support.' },
  'software-installation': { learn: ['Operating-system and application setup fundamentals', 'Software configuration, updates and compatibility checks', 'Practical troubleshooting and user support techniques'], audience: 'Beginners and aspiring technical support assistants.' },
  'networking-ccna': { learn: ['Network fundamentals, devices and addressing', 'Routing, switching and basic network configuration concepts', 'Practical troubleshooting and network support foundations'], audience: 'Learners pursuing networking and IT support skills.' },
  'printing-technology': { learn: ['Digital printing workflows and production stages', 'Basic printer operation, setup and maintenance', 'Preparing digital files for practical printing work'], audience: 'Learners interested in printing, production and digital publishing.' },
  'office-practice': { learn: ['Office administration and workplace organization', 'Document handling, communication and digital office tools', 'Professional workflows for efficient office support'], audience: 'Learners preparing for administrative and office-support roles.' },
  'digital-marketing': { learn: ['Digital marketing channels and audience targeting', 'Social media content, online promotion and campaign basics', 'Measuring engagement and improving digital campaigns'], audience: 'Entrepreneurs, marketers and learners building online promotion skills.' },
  'barbering-hair-locking': { learn: ['Barbering tools, grooming techniques and hygiene', 'Hair locking methods and practical styling workflows', 'Client care, presentation and basic service professionalism'], audience: 'Learners seeking practical grooming and personal-care skills.' },
  'phone-repair-maintenance': { learn: ['Smartphone components, tools and safe handling', 'Basic diagnostics and common repair procedures', 'Preventive maintenance and troubleshooting approaches'], audience: 'Learners interested in mobile-device repair and technical services.' },
  'video-editing': { learn: ['Video editing workflow, timelines and media organization', 'Cuts, transitions, audio and visual enhancement', 'Producing videos for social media, business and creative projects'], audience: 'Creators, entrepreneurs and learners developing video-production skills.' },
  'live-streaming': { learn: ['Live-streaming equipment, software and basic setup', 'Audio, video and scene preparation for live production', 'Publishing and managing live sessions for online audiences'], audience: 'Creators, organizations and learners interested in online live production.' },
  'photography': { learn: ['Camera and photography fundamentals', 'Composition, lighting and practical shooting techniques', 'Digital image organization and basic post-production workflows'], audience: 'Beginners, creators and learners developing practical photography skills.' },
  'sales-and-marketing': { learn: ['Customer engagement and practical sales techniques', 'Promotion, product presentation and marketing fundamentals', 'Communication and relationship-building for business growth'], audience: 'Learners, sales assistants and entrepreneurs developing commercial skills.' }
};

const DOCUMENT_FIELDS = [
  'passportPhoto',
  'kcseCertificate',
  'kcpeCertificate',
  'birthCertificate',
  'parentGuardianId',
  'chiefRecommendation'
];
const REQUIRED_DOCUMENTS = ['passportPhoto', 'parentGuardianId'];

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required for production deployment.');
  process.exit(1);
}
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  console.error('SESSION_SECRET must be set and at least 32 characters long.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30000
});

const appLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 25, standardHeaders: 'draft-8', legacyHeaders: false });
app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
app.use(appLimiter);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  store: new pgSession({ pool, tableName: 'user_sessions', createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 8
  }
}));

app.get('/robots.txt', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  res.type('text/plain').send([
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin.html',
    'Disallow: /api/',
    `Sitemap: ${base}/sitemap.xml`
  ].join('\n'));
});

app.get('/sitemap.xml', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  const urls = ['/', ...PROGRAMS.map(program => '/programs/' + program[0])];
  const body = urls.map(url => `<url><loc>${base}${url}</loc></url>`).join('');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`);
});

app.get(['/logo.jpg', '/classroom.jpg', '/about-classroom.jpg'], (req, res) => {
  const allowed = new Set(['logo.jpg', 'classroom.jpg', 'about-classroom.jpg']);
  const file = path.basename(req.path);
  if (!allowed.has(file)) return res.status(404).end();
  res.sendFile(path.join(__dirname, file));
});

app.use(express.static(PUBLIC_DIR, {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
  setHeaders: (res, filePath) => {
    // Always fetch the latest HTML so users receive changed form fields and upload rules.
    if (path.basename(filePath) === 'index.html') {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));
app.get('/programs/:slug', (req, res) => {
  const program = PROGRAMS.find(([slug]) => slug === req.params.slug);
  if (!program) {
    return res.status(404).send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found | NAMBWA Digital Training Institute</title><meta name="robots" content="noindex, follow"></head><body><main style="max-width:760px;margin:0 auto;padding:48px 24px"><h1>Page not found</h1><p>The page you requested could not be found.</p><p><a href="/">Return to NAMBWA Digital Training Institute</a></p></main></body></html>`);
  }
  const [slug, name, description] = program;
  const details = COURSE_DETAILS[slug] || { learn: ['Practical concepts and guided exercises', 'Useful skills for study, work and business', 'Hands-on workflows supported by the institute'], audience: 'Learners seeking practical skills.' };
  const base = `${req.protocol}://${req.get('host')}`;
  const canonical = `${base}/programs/${slug}`;
  const breadcrumbData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: base + '/' },
      { '@type': 'ListItem', position: 2, name: 'Courses', item: base + '/#programs' },
      { '@type': 'ListItem', position: 3, name, item: canonical }
    ]
  };
  const courseData = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name,
    description,
    url: canonical,
    provider: { '@type': 'EducationalOrganization', name: 'NAMBWA Digital Training Institute', url: base + '/' }
  };
  const esc = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(name)} Course | NAMBWA Digital Training Institute</title>
  <meta name="description" content="${esc(description)} Study at NAMBWA Digital Training Institute with practical, career-focused digital skills training.">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(name)} Course | NAMBWA Digital Training Institute">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${base}/logo.jpg">
  <meta property="og:site_name" content="NAMBWA Digital Training Institute">
  <link rel="stylesheet" href="/styles.css">
  <script type="application/ld+json">${JSON.stringify(courseData)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumbData)}</script>
</head>
<body>
  <main style="max-width:900px;margin:0 auto;padding:48px 24px">
    <nav aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/#programs">Courses</a> / <span>${esc(name)}</span></nav>
    <h1>${esc(name)} Course</h1>
    <p style="font-size:1.15rem;line-height:1.7">${esc(description)}</p>
    <h2>What you can learn</h2>
    <ul>${details.learn.map(item => `<li>${esc(item)}</li>`).join('')}</ul>
    <h2>Who this course is for</h2>
    <p>${esc(details.audience)}</p>
    <h2>Practical skills and career preparation</h2>
    <p>This program focuses on practical learning that can help students apply their skills in school, employment, freelancing, entrepreneurship or everyday digital work. Learning is supported by guided training and student support at NAMBWA Digital Training Institute.</p>
    <h2>How to apply</h2>
    <p>Use the online application form to select this course and submit your admission details.</p>
    <div class="course-actions"><a class="btn primary" href="/?course=${encodeURIComponent(slug)}#admission">Apply for this course</a><a class="btn secondary" href="/#programs">View all programs</a><a class="btn secondary" href="/#contact">Contact the institute</a></div>
  </main>
</body>
</html>`;
  res.type('html').send(html);
});


const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname).toLowerCase()}`)
});
const upload = multer({
  storage,
  limits: { files: DOCUMENT_FIELDS.length, fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // Accept common formats from phones, including iPhone HEIC/HEIF and WebP.
    // Some mobile file pickers report application/octet-stream, so also check a safe filename extension.
    const ext = path.extname(file.originalname || '').toLowerCase();
    const allowedExt = new Set(['.jpg', '.jpeg', '.png', '.pdf', '.webp', '.heic', '.heif']);
    const allowedMime = new Set([
      'image/jpeg', 'image/jpg', 'image/png', 'application/pdf', 'application/x-pdf',
      'image/webp', 'image/heic', 'image/heif', 'application/octet-stream'
    ]);
    const accepted = allowedExt.has(ext) && allowedMime.has(file.mimetype);
    cb(accepted ? null : new Error('Unsupported document type. Please use JPG, PNG, WEBP, HEIC/HEIF or PDF.'));
  }
});

async function db(sql, params = []) {
  return pool.query(sql, params);
}

async function initDb() {
  await db(`
    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      course TEXT NOT NULL,
      intake TEXT NOT NULL,
      learning_mode TEXT NOT NULL DEFAULT 'Physical',
      guardian_name TEXT,
      guardian_id_number TEXT,
      guardian_phone TEXT,
      guardian_designation TEXT,
      guardian_agreed BOOLEAN NOT NULL DEFAULT FALSE,
      payment_method TEXT NOT NULL,
      transaction_code TEXT,
      amount INTEGER NOT NULL DEFAULT 500,
      payment_status TEXT NOT NULL DEFAULT 'pending-payment',
      application_status TEXT NOT NULL DEFAULT 'submitted',
      checkout_request_id TEXT,
      merchant_request_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS applications_email_idx ON applications (LOWER(email));
    CREATE INDEX IF NOT EXISTS applications_payment_idx ON applications (payment_status);

    CREATE TABLE IF NOT EXISTS application_documents (
      id BIGSERIAL PRIMARY KEY,
      application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
      field_name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(application_id, field_name)
    );

    CREATE TABLE IF NOT EXISTS students (
      id BIGSERIAL PRIMARY KEY,
      application_id TEXT UNIQUE REFERENCES applications(id) ON DELETE SET NULL,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS learning_materials (
      id BIGSERIAL PRIMARY KEY,
      course TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS results (
      id BIGSERIAL PRIMARY KEY,
      student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      course TEXT NOT NULL,
      unit TEXT NOT NULL,
      score NUMERIC(6,2),
      grade TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await db("ALTER TABLE applications ADD COLUMN IF NOT EXISTS learning_mode TEXT NOT NULL DEFAULT 'Physical'");
  await db("ALTER TABLE applications ADD COLUMN IF NOT EXISTS guardian_name TEXT");
  await db("ALTER TABLE applications ADD COLUMN IF NOT EXISTS guardian_id_number TEXT");
  await db("ALTER TABLE applications ADD COLUMN IF NOT EXISTS guardian_phone TEXT");
  await db("ALTER TABLE applications ADD COLUMN IF NOT EXISTS guardian_designation TEXT");
  await db("ALTER TABLE applications ADD COLUMN IF NOT EXISTS guardian_agreed BOOLEAN NOT NULL DEFAULT FALSE");
}

function nowRef() {
  return `NAMBWA-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}
function normalizePhone(phone) {
  const p = String(phone || '').replace(/\s|-/g, '');
  if (/^0\d{9}$/.test(p)) return '254' + p.slice(1);
  if (/^254\d{9}$/.test(p)) return p;
  if (/^\+254\d{9}$/.test(p)) return p.slice(1);
  return null;
}
function publicApplication(row) {
  if (!row) return null;
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    course: row.course,
    intake: row.intake,
    learningMode: row.learning_mode || 'Physical',
    paymentMethod: row.payment_method,
    transactionCode: row.transaction_code || '',
    amount: row.amount,
    paymentStatus: row.payment_status,
    applicationStatus: row.application_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    documentsCount: Number(row.documents_count || 0),
    documentFields: Array.isArray(row.document_fields) ? row.document_fields : []
  };
}
async function getApplication(id) {
  const r = await db('SELECT * FROM applications WHERE id = $1', [id]);
  return r.rows[0];
}
function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.user || req.session.user.role !== role) return res.status(401).json({ error: 'Unauthorized.' });
    next();
  };
}

app.get('/health', async (_req, res) => {
  try {
    await db('SELECT 1');
    res.json({ ok: true, service: 'nambwa', time: new Date().toISOString() });
  } catch (_err) {
    res.status(503).json({ ok: false });
  }
});

app.get('/api/config', (_req, res) => {
  res.json({
    institute: 'NAMBWA DIGITAL TRAINING INSTITUTE',
    applicationFee: 500,
    till: '354536',
    email: 'nambwadigital@gmail.com',
    phone: '0733536145',
    onlineClassesAvailable: true,
    mpesaAutomaticEnabled: Boolean(process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET && process.env.MPESA_PASSKEY && process.env.MPESA_CALLBACK_URL),
    user: _req.session.user || null
  });
});

app.post('/api/applications', upload.fields(DOCUMENT_FIELDS.map(name => ({ name, maxCount: 1 }))), async (req, res, next) => {
  try {
    const { fullName, phone, email, course, intake, learningMode, transactionCode, paymentMethod, guardianName, guardianIdNumber, guardianPhone, guardianDesignation, guardianAgreement } = req.body || {};
    if (!fullName || !phone || !email || !course || !intake || !learningMode || !paymentMethod ||
        !guardianName || !guardianIdNumber || !guardianPhone || !guardianDesignation || guardianAgreement !== 'accepted') {
      return res.status(400).json({ error: 'Complete all required registration and Parent/Guardian consent fields.' });
    }
    if (!['Physical', 'Online'].includes(learningMode)) return res.status(400).json({ error: 'Choose Physical or Online as your mode of learning.' });
    if (!['Parent', 'Guardian'].includes(guardianDesignation)) return res.status(400).json({ error: 'Choose Parent or Guardian as the designation.' });
    const receiptCode = String(transactionCode || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{6,15}$/.test(receiptCode)) return res.status(400).json({ error: 'A valid M-Pesa transaction code is required before you can submit.' });
    const normalized = normalizePhone(phone);
    if (!normalized) return res.status(400).json({ error: 'Enter a valid Kenyan student phone number.' });
    const normalizedGuardianPhone = normalizePhone(guardianPhone);
    if (!normalizedGuardianPhone) return res.status(400).json({ error: 'Enter a valid Kenyan Parent/Guardian phone number.' });
    const missing = REQUIRED_DOCUMENTS.filter(name => !req.files?.[name]?.[0]);
    if (missing.length) return res.status(400).json({ error: 'Please upload the student passport photo and Parent/Guardian ID copy.' });

    const id = nowRef();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO applications
        (id, full_name, phone, email, course, intake, learning_mode, guardian_name, guardian_id_number, guardian_phone, guardian_designation, guardian_agreed, payment_method, transaction_code, amount, payment_status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,500,'pending-verification')`, [
        id, String(fullName).trim(), normalized, String(email).trim().toLowerCase(), String(course).trim(), String(intake).trim(), learningMode,
        String(guardianName).trim(), String(guardianIdNumber).trim(), normalizedGuardianPhone, guardianDesignation, true, paymentMethod, receiptCode
      ]);
      for (const field of DOCUMENT_FIELDS) {
        const file = req.files?.[field]?.[0];
        if (!file) continue;
        await client.query(`INSERT INTO application_documents (application_id, field_name, original_name, stored_name, mime_type, size_bytes)
                  VALUES ($1,$2,$3,$4,$5,$6)`, [id, field, file.originalname, file.filename, file.mimetype, file.size]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      for (const field of DOCUMENT_FIELDS) {
        const file = req.files?.[field]?.[0];
        if (file) fs.rmSync(file.path, { force: true });
      }
      throw e;
    } finally {
      client.release();
    }
    res.status(201).json({ applicationId: id, paymentStatus: 'pending-verification', message: 'Application received. Payment code is required for institute verification.' });
  } catch (err) { next(err); }
});

app.get('/api/applications/:id', async (req, res, next) => {
  try {
    const item = await getApplication(req.params.id);
    if (!item) return res.status(404).json({ error: 'Application not found.' });
    if (req.session.user?.role !== 'admin') {
      return res.json(publicApplication(item));
    }
    res.json(publicApplication(item));
  } catch (err) { next(err); }
});

app.post('/api/student/activate', authLimiter, async (req, res, next) => {
  try {
    const { applicationId, email, password } = req.body || {};
    if (!applicationId || !email || !password || password.length < 8) return res.status(400).json({ error: 'Application reference, email and an 8+ character password are required.' });
    const appRow = await getApplication(applicationId);
    if (!appRow || appRow.email.toLowerCase() !== String(email).trim().toLowerCase()) return res.status(400).json({ error: 'Application reference and email do not match.' });
    const existing = await db('SELECT id FROM students WHERE LOWER(email)=LOWER($1)', [String(email).trim()]);
    if (existing.rowCount) return res.status(409).json({ error: 'An account already exists for this email. Please log in.' });
    const passwordHash = await bcrypt.hash(password, 12);
    const r = await db(`INSERT INTO students (application_id, full_name, email, phone, password_hash) VALUES ($1,$2,$3,$4,$5) RETURNING id, full_name, email`, [applicationId, appRow.full_name, appRow.email, appRow.phone, passwordHash]);
    req.session.user = { id: r.rows[0].id, role: 'student', email: r.rows[0].email, name: r.rows[0].full_name };
    res.json({ message: 'Student account activated.', user: req.session.user });
  } catch (err) { next(err); }
});

app.post('/api/student/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const r = await db('SELECT * FROM students WHERE LOWER(email)=LOWER($1)', [String(email || '').trim()]);
    if (!r.rowCount || !(await bcrypt.compare(String(password || ''), r.rows[0].password_hash))) return res.status(401).json({ error: 'Invalid email or password.' });
    req.session.user = { id: r.rows[0].id, role: 'student', email: r.rows[0].email, name: r.rows[0].full_name };
    res.json({ user: req.session.user });
  } catch (err) { next(err); }
});

app.post('/api/admin/login', authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!process.env.ADMIN_EMAIL || (!process.env.ADMIN_PASSWORD_HASH && !process.env.ADMIN_PASSWORD)) return res.status(503).json({ error: 'Admin access is not configured.' });
  const suppliedPassword = String(password || '');
  const validPassword = process.env.ADMIN_PASSWORD
    ? suppliedPassword === String(process.env.ADMIN_PASSWORD)
    : await bcrypt.compare(suppliedPassword, process.env.ADMIN_PASSWORD_HASH);
  if (String(email || '').trim().toLowerCase() !== process.env.ADMIN_EMAIL.toLowerCase() || !validPassword) return res.status(401).json({ error: 'Invalid administrator credentials.' });
  req.session.user = { role: 'admin', email: process.env.ADMIN_EMAIL, name: 'Administrator' };
  res.json({ user: req.session.user });
});

app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

app.get('/api/student/dashboard', requireRole('student'), async (req, res, next) => {
  try {
    const r = await db(`SELECT s.id, s.full_name, s.email, s.phone, a.id AS application_id, a.course, a.intake, a.learning_mode, a.amount, a.payment_status, a.application_status
                       FROM students s LEFT JOIN applications a ON a.id=s.application_id WHERE s.id=$1`, [req.session.user.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Student record not found.' });
    const row = r.rows[0];
    const materials = await db('SELECT id, title, description, url, course FROM learning_materials WHERE course=$1 ORDER BY created_at DESC', [row.course]);
    const results = await db('SELECT course, unit, score, grade, created_at FROM results WHERE student_id=$1 ORDER BY created_at DESC', [row.id]);
    res.json({ student: row, materials: materials.rows, results: results.rows });
  } catch (err) { next(err); }
});

app.get('/api/student/documents/:applicationId/:field', requireRole('student'), async (req, res, next) => {
  try {
    const r = await db(`SELECT d.* FROM application_documents d JOIN students s ON s.application_id=d.application_id WHERE d.application_id=$1 AND d.field_name=$2 AND s.id=$3`, [req.params.applicationId, req.params.field, req.session.user.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Document not found.' });
    const f = r.rows[0];
    const filePath = path.join(UPLOAD_DIR, f.stored_name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File is unavailable.' });
    res.type(f.mime_type).download(filePath, f.original_name);
  } catch (err) { next(err); }
});

app.get('/api/admin/applications/:id/documents/:field', requireRole('admin'), async (req, res, next) => {
  try {
    const r = await db('SELECT * FROM application_documents WHERE application_id=$1 AND field_name=$2', [req.params.id, req.params.field]);
    if (!r.rowCount) return res.status(404).json({ error: 'Document not found.' });
    const f = r.rows[0];
    const filePath = path.join(UPLOAD_DIR, f.stored_name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File is unavailable.' });
    res.type(f.mime_type).download(filePath, f.original_name);
  } catch (err) { next(err); }
});
app.get('/api/admin/applications', requireRole('admin'), async (_req, res, next) => {
  try {
    const r = await db(`SELECT a.*, COUNT(d.id)::int AS documents_count, COALESCE(array_agg(d.field_name) FILTER (WHERE d.id IS NOT NULL), ARRAY[]::text[]) AS document_fields FROM applications a LEFT JOIN application_documents d ON d.application_id=a.id GROUP BY a.id ORDER BY a.created_at DESC`);
    res.json(r.rows.map(publicApplication));
  } catch (err) { next(err); }
});
app.post('/api/admin/applications/:id/verify', requireRole('admin'), async (req, res, next) => {
  try {
    const r = await db(`UPDATE applications SET payment_status='paid', application_status='approved', updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Application not found.' });
    res.json(publicApplication(r.rows[0]));
  } catch (err) { next(err); }
});

app.post('/api/admin/materials', requireRole('admin'), async (req, res, next) => {
  try {
    const { course, title, description, url } = req.body || {};
    if (!course || !title || !url) return res.status(400).json({ error: 'Course, title and URL are required.' });
    const r = await db('INSERT INTO learning_materials (course, title, description, url) VALUES ($1,$2,$3,$4) RETURNING *', [course, title, description || '', url]);
    res.status(201).json(r.rows[0]);
  } catch (err) { next(err); }
});
app.post('/api/admin/results', requireRole('admin'), async (req, res, next) => {
  try {
    const { studentId, course, unit, score, grade } = req.body || {};
    if (!studentId || !course || !unit) return res.status(400).json({ error: 'Student ID, course and unit are required.' });
    const r = await db('INSERT INTO results (student_id, course, unit, score, grade) VALUES ($1,$2,$3,$4,$5) RETURNING *', [studentId, course, unit, score || null, grade || null]);
    res.status(201).json(r.rows[0]);
  } catch (err) { next(err); }
});
app.get('/api/admin/students', requireRole('admin'), async (_req, res, next) => {
  try {
    const r = await db('SELECT id, full_name, email, phone, application_id, created_at FROM students ORDER BY created_at DESC');
    res.json(r.rows);
  } catch (err) { next(err); }
});

async function mpesaToken() {
  const base = process.env.MPESA_ENV === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
  const auth = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
  const r = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${auth}` } });
  if (!r.ok) throw new Error(`M-Pesa auth failed: ${r.status}`);
  return { token: (await r.json()).access_token, base };
}

app.post('/api/mpesa/stkpush', authLimiter, async (req, res, next) => {
  try {
    const { phone, applicationId } = req.body || {};
    const normalized = normalizePhone(phone);
    if (!normalized || !applicationId) return res.status(400).json({ error: 'Valid phone and application ID are required.' });
    const application = await getApplication(applicationId);
    if (!application) return res.status(404).json({ error: 'Application not found.' });
    if (application.phone !== normalized) return res.status(403).json({ error: 'Phone number does not match the application.' });
    if (!(process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET && process.env.MPESA_PASSKEY && process.env.MPESA_CALLBACK_URL)) return res.status(503).json({ error: 'Automatic M-Pesa is not configured yet. Use Till No. 354536 and submit the transaction code.' });
    const { token, base } = await mpesaToken();
    const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    const shortcode = process.env.MPESA_SHORTCODE;
    if (!shortcode) return res.status(503).json({ error: 'MPESA_SHORTCODE is not configured.' });
    const password = Buffer.from(`${shortcode}${process.env.MPESA_PASSKEY}${timestamp}`).toString('base64');
    const payload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: process.env.MPESA_TRANSACTION_TYPE || 'CustomerBuyGoodsOnline',
      Amount: 500,
      PartyA: normalized,
      PartyB: shortcode,
      PhoneNumber: normalized,
      CallBackURL: process.env.MPESA_CALLBACK_URL,
      AccountReference: `${process.env.MPESA_ACCOUNT_REFERENCE || 'NAMBWA-APP'}-${applicationId}`,
      TransactionDesc: 'NAMBWA application fee'
    };
    const r = await fetch(`${base}/mpesa/stkpush/v1/processrequest`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: data.errorMessage || 'M-Pesa STK request failed.' });
    await db('UPDATE applications SET checkout_request_id=$1, merchant_request_id=$2, updated_at=NOW() WHERE id=$3', [data.CheckoutRequestID || null, data.MerchantRequestID || null, applicationId]);
    res.json(data);
  } catch (err) { next(err); }
});

app.post('/api/mpesa/callback', async (req, res, next) => {
  try {
    const body = req.body || {};
    const stk = body.Body?.stkCallback;
    if (!stk) return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    const resultCode = Number(stk.ResultCode);
    const checkoutRequestId = stk.CheckoutRequestID;
    const items = Object.fromEntries((stk.CallbackMetadata?.Item || []).map(x => [x.Name, x.Value]));
    const receipt = items.MpesaReceiptNumber || null;
    const amount = Number(items.Amount || 0);
    const phone = items.PhoneNumber ? String(items.PhoneNumber) : null;
    const paymentStatus = resultCode === 0 && amount >= 500 ? 'paid' : 'failed';
    await db(`UPDATE applications SET payment_status=$1, transaction_code=COALESCE($2, transaction_code), updated_at=NOW() WHERE checkout_request_id=$3`, [paymentStatus, receipt, checkoutRequestId]);
    console.log(JSON.stringify({ checkoutRequestId, resultCode, receipt, phone }));
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (err) { next(err); }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Each uploaded document must be 20MB or smaller.' });
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  if (err && err.message && err.message.startsWith('Unsupported document type.')) return res.status(400).json({ error: err.message });
  if (err && err.message === 'File too large') return res.status(400).json({ error: 'Each uploaded document must be 20MB or smaller.' });
  res.status(500).json({ error: 'Unable to process the request.' });
});

app.get('/{*splat}', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

initDb().then(() => {
  app.listen(PORT, '0.0.0.0', () => console.log(`NAMBWA website running on port ${PORT}`));
}).catch(err => {
  console.error('Database initialization failed:', err);
  process.exit(1);
});
