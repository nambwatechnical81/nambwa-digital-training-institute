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
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const REQUIRED_DOCUMENTS = [
  'passportPhoto',
  'kcseCertificate',
  'kcpeCertificate',
  'birthCertificate',
  'chiefRecommendation'
];

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
    `Sitemap: ${base}/sitemap.xml`
  ].join('\n'));
});

app.get('/sitemap.xml', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${base}/</loc></url></urlset>`);
});

app.get(['/logo.jpg', '/classroom.jpg'], (req, res) => {
  const allowed = new Set(['logo.jpg', 'classroom.jpg']);
  const file = path.basename(req.path);
  if (!allowed.has(file)) return res.status(404).end();
  res.sendFile(path.join(__dirname, file));
});

app.use(express.static(PUBLIC_DIR, { maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0 }));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname).toLowerCase()}`)
});
const upload = multer({
  storage,
  limits: { files: REQUIRED_DOCUMENTS.length, fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(['image/jpeg', 'image/png', 'application/pdf']);
    cb(allowed.has(file.mimetype) ? null : new Error('Only JPG, PNG or PDF files are allowed.'));
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
      payment_method TEXT NOT NULL,
      transaction_code TEXT,
      amount INTEGER NOT NULL DEFAULT 1000,
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
    paymentMethod: row.payment_method,
    transactionCode: row.transaction_code || '',
    amount: row.amount,
    paymentStatus: row.payment_status,
    applicationStatus: row.application_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
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
    applicationFee: 1000,
    till: '354536',
    email: 'nambwadigital@gmail.com',
    phone: '0733536145',
    onlineClassesAvailable: true,
    mpesaAutomaticEnabled: Boolean(process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET && process.env.MPESA_PASSKEY && process.env.MPESA_CALLBACK_URL),
    user: _req.session.user || null
  });
});

app.post('/api/applications', upload.fields(REQUIRED_DOCUMENTS.map(name => ({ name, maxCount: 1 }))), async (req, res, next) => {
  try {
    const { fullName, phone, email, course, intake, transactionCode, paymentMethod } = req.body || {};
    if (!fullName || !phone || !email || !course || !intake || !paymentMethod) return res.status(400).json({ error: 'Please complete all required registration fields.' });
    const normalized = normalizePhone(phone);
    if (!normalized) return res.status(400).json({ error: 'Enter a valid Kenyan phone number.' });
    const missing = REQUIRED_DOCUMENTS.filter(name => !req.files?.[name]?.[0]);
    if (missing.length) return res.status(400).json({ error: 'Please upload all required documents.' });

    const id = nowRef();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO applications (id, full_name, phone, email, course, intake, payment_method, transaction_code, amount, payment_status)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1000,$9)`, [
        id, String(fullName).trim(), normalized, String(email).trim().toLowerCase(), String(course).trim(), String(intake).trim(), paymentMethod,
        transactionCode ? String(transactionCode).trim() : null,
        transactionCode ? 'pending-verification' : 'pending-payment'
      ]);
      for (const field of REQUIRED_DOCUMENTS) {
        const file = req.files[field][0];
        await client.query(`INSERT INTO application_documents (application_id, field_name, original_name, stored_name, mime_type, size_bytes)
                  VALUES ($1,$2,$3,$4,$5,$6)`, [id, field, file.originalname, file.filename, file.mimetype, file.size]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      for (const field of REQUIRED_DOCUMENTS) {
        const file = req.files?.[field]?.[0];
        if (file) fs.rmSync(file.path, { force: true });
      }
      throw e;
    } finally {
      client.release();
    }
    res.status(201).json({ applicationId: id, paymentStatus: transactionCode ? 'pending-verification' : 'pending-payment', message: 'Application received.' });
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
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD_HASH) return res.status(503).json({ error: 'Admin access is not configured.' });
  if (String(email || '').trim().toLowerCase() !== process.env.ADMIN_EMAIL.toLowerCase() || !(await bcrypt.compare(String(password || ''), process.env.ADMIN_PASSWORD_HASH))) return res.status(401).json({ error: 'Invalid administrator credentials.' });
  req.session.user = { role: 'admin', email: process.env.ADMIN_EMAIL, name: 'Administrator' };
  res.json({ user: req.session.user });
});

app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

app.get('/api/student/dashboard', requireRole('student'), async (req, res, next) => {
  try {
    const r = await db(`SELECT s.id, s.full_name, s.email, s.phone, a.id AS application_id, a.course, a.intake, a.amount, a.payment_status, a.application_status
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

app.get('/api/admin/applications', requireRole('admin'), async (_req, res, next) => {
  try {
    const r = await db(`SELECT a.*, COUNT(d.id)::int AS documents_count FROM applications a LEFT JOIN application_documents d ON d.application_id=a.id GROUP BY a.id ORDER BY a.created_at DESC`);
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
      Amount: 1000,
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
    const paymentStatus = resultCode === 0 && amount >= 1000 ? 'paid' : 'failed';
    await db(`UPDATE applications SET payment_status=$1, transaction_code=COALESCE($2, transaction_code), updated_at=NOW() WHERE checkout_request_id=$3`, [paymentStatus, receipt, checkoutRequestId]);
    console.log(JSON.stringify({ checkoutRequestId, resultCode, receipt, phone }));
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (err) { next(err); }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Each uploaded document must be 10MB or smaller.' });
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  if (err && (err.message === 'Only JPG, PNG or PDF files are allowed.')) return res.status(400).json({ error: err.message });
  res.status(500).json({ error: 'Unable to process the request.' });
});

app.get('/{*splat}', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

initDb().then(() => {
  app.listen(PORT, '0.0.0.0', () => console.log(`NAMBWA website running on port ${PORT}`));
}).catch(err => {
  console.error('Database initialization failed:', err);
  process.exit(1);
});
