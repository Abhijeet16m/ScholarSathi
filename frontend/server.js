import 'dotenv/config';
import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import pg from 'pg';
import { rateLimit } from 'express-rate-limit';
import nodemailer from 'nodemailer';
import multer from 'multer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const privateUploadRoot = path.join(__dirname, 'private_uploads');
const { Pool } = pg;
const scrypt = promisify(crypto.scrypt);
const app = express();
const port = Number(process.env.PORT || 3000);

for (const key of ['DATABASE_URL', 'SESSION_SECRET', 'OTP_SECRET', 'SMTP_USER', 'SMTP_APP_PASSWORD']) {
  if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
}
if (process.env.SESSION_SECRET.length < 32 || process.env.OTP_SECRET.length < 32) {
  throw new Error('SESSION_SECRET and OTP_SECRET must each be at least 32 characters.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined,
});
const PgSession = connectPgSimple(session);
const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
const smtpPort = Number(process.env.SMTP_PORT || 465);
if (![465, 587].includes(smtpPort)) throw new Error('SMTP_PORT must be 465 (SSL) or 587 (STARTTLS).');
const mailer = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpPort === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_APP_PASSWORD.replace(/\s/g, ''),
  },
});
const isProduction = process.env.NODE_ENV === 'production';

const documentTypes = {
  aadhaar_card: 'Aadhaar card',
  apaar_id: 'APAAR ID',
  marksheet_10: '10th marksheet',
  marksheet_12: '12th marksheet',
  income_certificate: 'Income certificate',
  domicile_certificate: 'Domicile certificate',
  institution_certificate: 'Institution certificate',
  category_certificate: 'Category certificate',
  bank_passbook: 'Bank passbook',
};
const extensionByMime = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
};
const documentUploadFields = Object.keys(documentTypes).map(name => ({ name, maxCount: 1 }));
const registrationDocumentUpload = multer({
  storage: multer.diskStorage({
    destination(req, file, callback) {
      const pendingId = req.session?.registration?.pendingId;
      if (!pendingId) return callback(new Error('No pending registration for file upload.'));
      const pendingDirectory = path.join(privateUploadRoot, 'pending', pendingId);
      fs.mkdir(pendingDirectory, { recursive: true }).then(
        () => callback(null, pendingDirectory),
        callback,
      );
    },
    filename(req, file, callback) {
      callback(null, `${crypto.randomUUID()}${extensionByMime[file.mimetype] || '.bin'}`);
    },
  }),
  limits: { files: Object.keys(documentTypes).length, fileSize: 10 * 1024 * 1024, fields: 4 },
  fileFilter(req, file, callback) {
    if (!Object.hasOwn(documentTypes, file.fieldname)) {
      return callback(new Error('Unexpected document field.'));
    }
    if (!Object.hasOwn(extensionByMime, file.mimetype)) {
      return callback(new Error('Upload PDF, JPG, or PNG documents only.'));
    }
    return callback(null, true);
  },
});

if (isProduction) app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(session({
  store: new PgSession({ pool, createTableIfMissing: true }),
  name: 'scholarsathi.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000,
  },
}));
const organizedPublicRoot = path.join(__dirname, 'frontend', 'public');
const publicRoot = existsSync(organizedPublicRoot) ? organizedPublicRoot : path.join(__dirname, 'public');
app.get(['/dashboard.html', '/documents.html'], (req, res, next) => {
  if (!req.session.studentId) return res.redirect(303, '/index.html');
  return res.sendFile(path.join(publicRoot, req.path.slice(1)), error => { if (error) next(error); });
});
app.use(express.static(publicRoot, { index: 'index.html' }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });
const otpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false });
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanEmail = value => String(value || '').trim().toLowerCase();
const textPage = (title, message, href = '/', linkText = 'Return to login', status = 200) => {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  return `<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${safeTitle} — ScholarSathi</title><body style="font:16px system-ui;max-width:38rem;margin:12vh auto;padding:2rem;color:#172b3d"><h1>${safeTitle}</h1><p>${safeMessage}</p><a style="color:#087f6e" href="${href}">${escapeHtml(linkText)}</a></body></html>`;
};
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}
function show(res, title, message, status = 200, href = '/', linkText = 'Return to login') {
  return res.status(status).type('html').send(textPage(title, message, href, linkText, status));
}
function otpDigest(code) {
  return crypto.createHmac('sha256', process.env.OTP_SECRET).update(code).digest('hex');
}
function safeCompareHex(a, b) {
  const left = Buffer.from(String(a), 'hex');
  const right = Buffer.from(String(b), 'hex');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}
async function verifyPassword(password, stored) {
  const [algorithm, saltHex, hashHex] = String(stored).split('$');
  if (algorithm !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}
function newOtp() { return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0'); }
async function sendRegistrationCode(email, name, code) {
  await mailer.sendMail({
    from: process.env.SMTP_FROM || `ScholarSathi <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Your ScholarSathi verification code',
    text: `Hi ${name},\n\nYour ScholarSathi verification code is ${code}. It expires in 10 minutes. If you did not request this code, you can ignore this email.`,
  });
}

async function sendLoginCode(email, name, code) {
  await mailer.sendMail({
    from: process.env.SMTP_FROM || `ScholarSathi <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Your ScholarSathi sign-in code',
    text: `Hi ${name},\n\nYour ScholarSathi sign-in code is ${code}. It expires in 10 minutes. If you did not try to sign in, you can ignore this email.`,
  });
}

async function sendPasswordResetCode(email, name, code) {
  await mailer.sendMail({
    from: process.env.SMTP_FROM || `ScholarSathi <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Reset your ScholarSathi password',
    text: `Hi ${name},\n\nYour ScholarSathi password reset code is ${code}. It expires in 10 minutes. If you did not request a password reset, you can ignore this email.`,
  });
}

function optionalBoolean(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function optionalNumber(value, min, max, integer = false) {
  if (value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) return NaN;
  return number;
}

function validDateOfBirth(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
  const age = (Date.now() - date.getTime()) / (365.2425 * 24 * 60 * 60 * 1000);
  return age >= 5 && age <= 110;
}

app.post('/api/auth/registration/request-otp', otpLimiter, async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = cleanEmail(req.body.email);
    const profile = {
      date_of_birth: String(req.body.date_of_birth || ''),
      gender: String(req.body.gender || ''),
      category: String(req.body.category || ''),
      domicile_state: String(req.body.domicile_state || '').trim(),
      annual_family_income: optionalNumber(req.body.annual_family_income, 0, 100000000),
      qualification_level: String(req.body.qualification_level || ''),
      qualification_marks: optionalNumber(req.body.qualification_marks, 0, 100),
      course_level: String(req.body.course_level || ''),
      course_name: String(req.body.course_name || '').trim(),
      course_year: optionalNumber(req.body.course_year, 1, 20, true),
      entrance_exam_rank: optionalNumber(req.body.entrance_exam_rank, 1, 100000000, true),
      institution_name: String(req.body.institution_name || '').trim(),
      has_disability: optionalBoolean(req.body.has_disability),
      is_orphan: optionalBoolean(req.body.is_orphan),
      parent_occupation: String(req.body.parent_occupation || '').trim(),
      receives_other_scholarship: optionalBoolean(req.body.receives_other_scholarship),
    };
    const validGenders = ['Female', 'Male', 'Other', 'Prefer not to say'];
    const validCategories = ['General', 'EWS', 'OBC-NCL', 'SEBC', 'SC', 'ST', 'Other'];
    const validQualifications = ['Class 10', 'Class 12', 'Diploma', 'Undergraduate degree', 'Postgraduate degree', 'Other'];
    const validCourseLevels = ['Pre-matric', 'Post-matric', 'Diploma', 'Undergraduate', 'Postgraduate', 'Research', 'Other'];
    const invalidOptionalNumber = [profile.annual_family_income, profile.qualification_marks, profile.course_year, profile.entrance_exam_rank].some(Number.isNaN);
    const invalidBoolean = ['has_disability', 'is_orphan', 'receives_other_scholarship'].some(key => !['', 'true', 'false'].includes(String(req.body[key] || '')));
    if (
      name.length < 2 || name.length > 120 || !emailPattern.test(email) || email.length > 254 ||
      !validDateOfBirth(profile.date_of_birth) || !validGenders.includes(profile.gender) || !validCategories.includes(profile.category) ||
      !profile.domicile_state || profile.domicile_state.length > 100 || profile.annual_family_income === null || Number.isNaN(profile.annual_family_income) ||
      !validQualifications.includes(profile.qualification_level) || !validCourseLevels.includes(profile.course_level) ||
      !profile.course_name || profile.course_name.length > 160 || profile.course_year === null || Number.isNaN(profile.course_year) || invalidOptionalNumber ||
      profile.institution_name.length > 200 || profile.parent_occupation.length > 160 || invalidBoolean
    ) {
      return show(res, 'Check your details', 'Please review the required profile fields and numeric values, then try again.', 400, '/register.html', 'Back to registration');
    }
    const existing = await pool.query('SELECT 1 FROM students WHERE email = $1', [email]);
    if (existing.rowCount) {
      return show(res, 'Account already exists', 'This email is already registered. Please log in instead.', 409, '/', 'Go to login');
    }
    const code = newOtp();
    await sendRegistrationCode(email, name, code);
    req.session.registration = {
      pendingId: crypto.randomUUID(),
      name,
      email,
      ...profile,
      otpHash: otpDigest(code),
      otpExpiresAt: Date.now() + 10 * 60 * 1000,
      otpAttempts: 0,
      lastOtpSentAt: Date.now(),
      verified: false,
    };
    return res.redirect(303, '/verify-email.html');
  } catch (error) { next(error); }
});

app.post('/api/auth/registration/resend-otp', otpLimiter, async (req, res, next) => {
  try {
    const registration = req.session.registration;
    if (!registration) return show(res, 'Start again', 'Your pending registration expired. Please enter your details again.', 400, '/register.html', 'Restart registration');
    if (Date.now() - registration.lastOtpSentAt < 60 * 1000) {
      return show(res, 'Please wait', 'You can request another code after one minute.', 429, '/verify-email.html', 'Back to verification');
    }
    const code = newOtp();
    await sendRegistrationCode(registration.email, registration.name, code);
    registration.otpHash = otpDigest(code);
    registration.otpExpiresAt = Date.now() + 10 * 60 * 1000;
    registration.otpAttempts = 0;
    registration.lastOtpSentAt = Date.now();
    return res.redirect(303, '/verify-email.html');
  } catch (error) { next(error); }
});

app.post('/api/auth/registration/verify-otp', otpLimiter, (req, res) => {
  const registration = req.session.registration;
  const code = String(req.body.code || '').trim();
  if (!registration) return show(res, 'Start again', 'Your pending registration expired. Please enter your details again.', 400, '/register.html', 'Restart registration');
  if (!/^\d{6}$/.test(code)) return show(res, 'Invalid code', 'Enter the six-digit code from your email.', 400, '/verify-email.html', 'Try again');
  if (Date.now() > registration.otpExpiresAt) return show(res, 'Code expired', 'Request a new code and try again.', 400, '/verify-email.html', 'Back to verification');
  registration.otpAttempts += 1;
  if (registration.otpAttempts > 5) {
    delete req.session.registration;
    return show(res, 'Too many attempts', 'For your security, restart registration and request a new code.', 429, '/register.html', 'Restart registration');
  }
  if (!safeCompareHex(otpDigest(code), registration.otpHash)) {
    return show(res, 'Code did not match', 'Check the code in your email and try again.', 400, '/verify-email.html', 'Try again');
  }
  registration.verified = true;
  delete registration.otpHash;
  delete registration.otpExpiresAt;
  delete registration.otpAttempts;
  return res.redirect(303, '/set-password.html');
});

function requireVerifiedRegistration(req, res, next) {
  if (!req.session.registration?.verified) {
    return show(res, 'Verify your email first', 'Complete email verification before setting your account password.', 403, '/register.html', 'Restart registration');
  }
  return next();
}

async function removeFiles(files = []) {
  await Promise.all(files.map(file => fs.rm(file.path, { force: true }).catch(() => {})));
}

app.post('/api/auth/register', authLimiter, requireVerifiedRegistration, registrationDocumentUpload.fields(documentUploadFields), async (req, res, next) => {
  const uploadedFiles = Object.values(req.files || {}).flat();
  const registration = req.session.registration;
  try {
    const password = String(req.body.password || '');
    const confirmation = String(req.body.password_confirmation || '');
    if (password.length < 8 || password.length > 128) {
      await removeFiles(uploadedFiles);
      return show(res, 'Choose a stronger password', 'Your password must be between 8 and 128 characters.', 400, '/set-password.html', 'Try again');
    }
    if (password !== confirmation) {
      await removeFiles(uploadedFiles);
      return show(res, 'Passwords do not match', 'Enter the same password in both password fields.', 400, '/set-password.html', 'Try again');
    }
    const passwordHash = await hashPassword(password);
    const client = await pool.connect();
    let student;
    const movedFiles = [];
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO students (
          name, email, password_hash, email_verified_at, date_of_birth, gender, category, domicile_state,
          annual_family_income, qualification_level, qualification_marks, course_level, course_name, course_year,
          entrance_exam_rank, institution_name, has_disability, is_orphan, parent_occupation, receives_other_scholarship
        ) VALUES (
          $1, $2, $3, NOW(), $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
        ) ON CONFLICT (email) DO NOTHING RETURNING id, name, email`,
        [
          registration.name, registration.email, passwordHash, registration.date_of_birth, registration.gender,
          registration.category, registration.domicile_state, registration.annual_family_income, registration.qualification_level,
          registration.qualification_marks, registration.course_level, registration.course_name, registration.course_year,
          registration.entrance_exam_rank, registration.institution_name || null, registration.has_disability, registration.is_orphan,
          registration.parent_occupation || null, registration.receives_other_scholarship,
        ],
      );
      if (!result.rowCount) {
        await client.query('ROLLBACK');
        await removeFiles(uploadedFiles);
        return show(res, 'Account already exists', 'This email is already registered. Please log in instead.', 409, '/', 'Go to login');
      }
      student = result.rows[0];
      const studentDirectory = path.join(privateUploadRoot, 'students', String(student.id));
      await fs.mkdir(studentDirectory, { recursive: true });
      for (const file of uploadedFiles) {
        const storageName = `${crypto.randomUUID()}${extensionByMime[file.mimetype]}`;
        const destination = path.join(studentDirectory, storageName);
        await fs.rename(file.path, destination);
        movedFiles.push(destination);
        await client.query(
          `INSERT INTO student_documents (student_id, document_type, original_name, storage_key, mime_type, file_size)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [student.id, file.fieldname, path.basename(file.originalname).slice(0, 255), path.join('students', String(student.id), storageName), file.mimetype, file.size],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      await removeFiles(uploadedFiles);
      await Promise.all(movedFiles.map(file => fs.rm(file, { force: true }).catch(() => {})));
      throw error;
    } finally {
      client.release();
    }
    await fs.rm(path.join(privateUploadRoot, 'pending', registration.pendingId), { recursive: true, force: true }).catch(() => {});
    req.session.regenerate(error => {
      if (error) return next(error);
      req.session.studentId = student.id;
      req.session.studentName = student.name;
      return req.session.save(saveError => {
        if (saveError) return next(saveError);
        return res.redirect(303, '/dashboard.html');
      });
    });
  } catch (error) { next(error); }
});

function requireStudentAuth(req, res, next) {
  if (!req.session.studentId) return res.status(401).json({ error: 'Sign in to view your documents.' });
  return next();
}

app.get('/api/documents', requireStudentAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, document_type, original_name, mime_type, file_size, uploaded_at
       FROM student_documents WHERE student_id = $1 ORDER BY uploaded_at DESC`,
      [req.session.studentId],
    );
    return res.json({ documents: result.rows.map(row => ({ ...row, label: documentTypes[row.document_type] || row.document_type })) });
  } catch (error) { next(error); }
});

app.get('/api/documents/:id/download', requireStudentAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT original_name, storage_key, mime_type FROM student_documents WHERE id = $1 AND student_id = $2',
      [req.params.id, req.session.studentId],
    );
    if (!result.rowCount) return res.status(404).type('text').send('Document not found.');
    const document = result.rows[0];
    const absolutePath = path.resolve(privateUploadRoot, document.storage_key);
    if (!absolutePath.startsWith(`${path.resolve(privateUploadRoot)}${path.sep}`)) return res.status(404).type('text').send('Document not found.');
    res.setHeader('Content-Type', document.mime_type);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.download(absolutePath, document.original_name, error => { if (error && !res.headersSent) next(error); });
  } catch (error) { next(error); }
});

app.post('/api/auth/login', authLimiter, otpLimiter, async (req, res, next) => {
  try {
    const email = cleanEmail(req.body.email);
    const password = String(req.body.password || '');
    if (!emailPattern.test(email) || !password) return show(res, 'Login failed', 'Check your email and password and try again.', 400);
    const result = await pool.query('SELECT id, name, email, password_hash FROM students WHERE email = $1', [email]);
    const student = result.rows[0];
    if (!student || !(await verifyPassword(password, student.password_hash))) {
      return show(res, 'Login failed', 'Check your email and password and try again.', 401);
    }
    const code = newOtp();
    await sendLoginCode(student.email, student.name, code);
    req.session.loginChallenge = {
      studentId: student.id,
      name: student.name,
      email: student.email,
      otpHash: otpDigest(code),
      otpExpiresAt: Date.now() + 10 * 60 * 1000,
      otpAttempts: 0,
      lastOtpSentAt: Date.now(),
    };
    return res.redirect(303, '/verify-login.html');
  } catch (error) { next(error); }
});

app.post('/api/auth/login/resend-otp', otpLimiter, async (req, res, next) => {
  try {
    const challenge = req.session.loginChallenge;
    if (!challenge) return show(res, 'Start again', 'Your sign-in request expired. Enter your email and password again.', 400, '/', 'Back to login');
    if (Date.now() - challenge.lastOtpSentAt < 60 * 1000) {
      return show(res, 'Please wait', 'You can request another code after one minute.', 429, '/verify-login.html', 'Back to verification');
    }
    const code = newOtp();
    await sendLoginCode(challenge.email, challenge.name, code);
    challenge.otpHash = otpDigest(code);
    challenge.otpExpiresAt = Date.now() + 10 * 60 * 1000;
    challenge.otpAttempts = 0;
    challenge.lastOtpSentAt = Date.now();
    return res.redirect(303, '/verify-login.html');
  } catch (error) { next(error); }
});

app.post('/api/auth/login/verify-otp', otpLimiter, (req, res, next) => {
  const challenge = req.session.loginChallenge;
  const code = String(req.body.code || '').trim();
  if (!challenge) return show(res, 'Start again', 'Your sign-in request expired. Enter your email and password again.', 400, '/', 'Back to login');
  if (!/^\d{6}$/.test(code)) return show(res, 'Invalid code', 'Enter the six-digit code from your email.', 400, '/verify-login.html', 'Try again');
  if (Date.now() > challenge.otpExpiresAt) return show(res, 'Code expired', 'Request a new code and try again.', 400, '/verify-login.html', 'Back to verification');
  challenge.otpAttempts += 1;
  if (challenge.otpAttempts > 5) {
    delete req.session.loginChallenge;
    return show(res, 'Too many attempts', 'For your security, enter your email and password again.', 429, '/', 'Back to login');
  }
  if (!safeCompareHex(otpDigest(code), challenge.otpHash)) {
    return show(res, 'Code did not match', 'Check the code in your email and try again.', 400, '/verify-login.html', 'Try again');
  }
  delete req.session.loginChallenge;
  req.session.regenerate(error => {
    if (error) return next(error);
    req.session.studentId = challenge.studentId;
    req.session.studentName = challenge.name;
    return req.session.save(saveError => {
      if (saveError) return next(saveError);
      return res.redirect(303, '/dashboard.html');
    });
  });
});

app.post('/api/auth/password/request-otp', otpLimiter, async (req, res, next) => {
  try {
    const email = cleanEmail(req.body.email);
    if (!emailPattern.test(email) || email.length > 254) {
      return show(res, 'Check your email', 'Enter a valid email address and try again.', 400, '/forgot-password.html', 'Try again');
    }
    const result = await pool.query('SELECT id, name, email FROM students WHERE email = $1', [email]);
    const student = result.rows[0] || null;
    const code = newOtp();
    if (student) await sendPasswordResetCode(student.email, student.name, code);
    req.session.passwordResetChallenge = {
      studentId: student?.id ?? null,
      email,
      name: student?.name || 'Student',
      otpHash: otpDigest(student ? code : crypto.randomBytes(32).toString('hex')),
      otpExpiresAt: Date.now() + 10 * 60 * 1000,
      otpAttempts: 0,
      lastOtpSentAt: Date.now(),
      verified: false,
    };
    return res.redirect(303, '/verify-reset-email.html');
  } catch (error) { next(error); }
});

app.post('/api/auth/password/resend-otp', otpLimiter, async (req, res, next) => {
  try {
    const challenge = req.session.passwordResetChallenge;
    if (!challenge) return show(res, 'Start again', 'Your password reset request expired. Enter your email again.', 400, '/forgot-password.html', 'Restart password reset');
    if (Date.now() - challenge.lastOtpSentAt < 60 * 1000) {
      return show(res, 'Please wait', 'You can request another code after one minute.', 429, '/verify-reset-email.html', 'Back to verification');
    }
    const code = newOtp();
    if (challenge.studentId) await sendPasswordResetCode(challenge.email, challenge.name, code);
    challenge.otpHash = otpDigest(challenge.studentId ? code : crypto.randomBytes(32).toString('hex'));
    challenge.otpExpiresAt = Date.now() + 10 * 60 * 1000;
    challenge.otpAttempts = 0;
    challenge.lastOtpSentAt = Date.now();
    challenge.verified = false;
    return res.redirect(303, '/verify-reset-email.html');
  } catch (error) { next(error); }
});

app.post('/api/auth/password/verify-otp', otpLimiter, (req, res) => {
  const challenge = req.session.passwordResetChallenge;
  const code = String(req.body.code || '').trim();
  if (!challenge) return show(res, 'Start again', 'Your password reset request expired. Enter your email again.', 400, '/forgot-password.html', 'Restart password reset');
  if (!/^\d{6}$/.test(code)) return show(res, 'Invalid code', 'Enter the six-digit code from your email.', 400, '/verify-reset-email.html', 'Try again');
  if (Date.now() > challenge.otpExpiresAt) return show(res, 'Code expired', 'Request a new code and try again.', 400, '/verify-reset-email.html', 'Back to verification');
  challenge.otpAttempts += 1;
  if (challenge.otpAttempts > 5) {
    delete req.session.passwordResetChallenge;
    return show(res, 'Too many attempts', 'Restart the password reset and request a new code.', 429, '/forgot-password.html', 'Restart password reset');
  }
  if (!safeCompareHex(otpDigest(code), challenge.otpHash) || !challenge.studentId) {
    return show(res, 'Code did not match', 'Check the code in your email and try again. If you cannot find it, request a new code.', 400, '/verify-reset-email.html', 'Try again');
  }
  challenge.verified = true;
  delete challenge.otpHash;
  delete challenge.otpExpiresAt;
  delete challenge.otpAttempts;
  return res.redirect(303, '/reset-password.html');
});

app.post('/api/auth/password/reset', authLimiter, async (req, res, next) => {
  try {
    const challenge = req.session.passwordResetChallenge;
    if (!challenge?.verified || !challenge.studentId) {
      return show(res, 'Verify your email first', 'Use the code sent to your email before setting a new password.', 403, '/forgot-password.html', 'Restart password reset');
    }
    const password = String(req.body.password || '');
    const confirmation = String(req.body.password_confirmation || '');
    if (password.length < 8 || password.length > 128) {
      return show(res, 'Choose a stronger password', 'Your password must be between 8 and 128 characters.', 400, '/reset-password.html', 'Try again');
    }
    if (password !== confirmation) {
      return show(res, 'Passwords do not match', 'Enter the same password in both fields.', 400, '/reset-password.html', 'Try again');
    }
    const passwordHash = await hashPassword(password);
    const result = await pool.query('UPDATE students SET password_hash = $1 WHERE id = $2 RETURNING id', [passwordHash, challenge.studentId]);
    if (!result.rowCount) return show(res, 'Account not found', 'Start the password reset again using your account email.', 404, '/forgot-password.html', 'Restart password reset');
    req.session.regenerate(error => {
      if (error) return next(error);
      return show(res, 'Password updated', 'Your password has been reset. You can now log in with your new password.', 200, '/index.html', 'Go to login');
    });
  } catch (error) { next(error); }
});

app.post('/api/auth/logout', (req, res, next) => {
  req.session.destroy(error => {
    if (error) return next(error);
    res.clearCookie('scholarsathi.sid', { httpOnly: true, sameSite: 'strict', secure: isProduction });
    return res.redirect(303, '/');
  });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session.studentId) return res.status(401).json({ authenticated: false });
  return res.json({ authenticated: true, id: req.session.studentId, name: req.session.studentName });
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    const pendingId = req.session?.registration?.pendingId;
    if (pendingId) void fs.rm(path.join(privateUploadRoot, 'pending', pendingId), { recursive: true, force: true }).catch(() => {});
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return show(res, 'Document upload problem', error.code === 'LIMIT_FILE_SIZE' ? 'Each document must be 10 MB or smaller.' : 'Check the selected documents and try again.', status, '/set-password.html', 'Back to registration');
  }
  if (error.message === 'Upload PDF, JPG, or PNG documents only.' || error.message === 'Unexpected document field.') {
    const pendingId = req.session?.registration?.pendingId;
    if (pendingId) void fs.rm(path.join(privateUploadRoot, 'pending', pendingId), { recursive: true, force: true }).catch(() => {});
    return show(res, 'Document upload problem', error.message, 400, '/set-password.html', 'Back to registration');
  }
  console.error(error);
  if (res.headersSent) return next(error);
  return show(res, 'Something went wrong', 'The request could not be completed. Please try again in a moment.', 500);
});

async function start() {
  await pool.query(`CREATE TABLE IF NOT EXISTS students (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    email_verified_at TIMESTAMPTZ NOT NULL,
    date_of_birth DATE,
    gender TEXT,
    category TEXT,
    domicile_state TEXT,
    annual_family_income NUMERIC(12, 2),
    qualification_level TEXT,
    qualification_marks NUMERIC(5, 2),
    course_level TEXT,
    course_name TEXT,
    course_year INTEGER,
    entrance_exam_rank INTEGER,
    institution_name TEXT,
    has_disability BOOLEAN,
    is_orphan BOOLEAN,
    parent_occupation TEXT,
    receives_other_scholarship BOOLEAN,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`ALTER TABLE students
    ADD COLUMN IF NOT EXISTS date_of_birth DATE,
    ADD COLUMN IF NOT EXISTS gender TEXT,
    ADD COLUMN IF NOT EXISTS category TEXT,
    ADD COLUMN IF NOT EXISTS domicile_state TEXT,
    ADD COLUMN IF NOT EXISTS annual_family_income NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS qualification_level TEXT,
    ADD COLUMN IF NOT EXISTS qualification_marks NUMERIC(5, 2),
    ADD COLUMN IF NOT EXISTS course_level TEXT,
    ADD COLUMN IF NOT EXISTS course_name TEXT,
    ADD COLUMN IF NOT EXISTS course_year INTEGER,
    ADD COLUMN IF NOT EXISTS entrance_exam_rank INTEGER,
    ADD COLUMN IF NOT EXISTS institution_name TEXT,
    ADD COLUMN IF NOT EXISTS has_disability BOOLEAN,
    ADD COLUMN IF NOT EXISTS is_orphan BOOLEAN,
    ADD COLUMN IF NOT EXISTS parent_occupation TEXT,
    ADD COLUMN IF NOT EXISTS receives_other_scholarship BOOLEAN`);
  await pool.query(`CREATE TABLE IF NOT EXISTS student_documents (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL CHECK (document_type IN (${Object.keys(documentTypes).map(type => `'${type}'`).join(', ')})),
    original_name TEXT NOT NULL,
    storage_key TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png')),
    file_size BIGINT NOT NULL CHECK (file_size > 0 AND file_size <= 10485760),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS student_documents_student_id_idx ON student_documents(student_id)');
  app.listen(port, () => console.log(`ScholarSathi auth server listening on http://localhost:${port}`));
}
start().catch(error => {
  console.error('Could not start the auth server:', error);
  process.exit(1);
});




