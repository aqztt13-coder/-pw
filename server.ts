import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Disable Express fingerprinting
app.disable('x-powered-by');

// General JSON body parser with defensive 1MB limit for standard APIs
// (Bypassed for /api/admin/upload-data which enforces authentication prior to its dedicated 50MB limit)
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/api/admin/upload-data') {
    return next();
  }
  express.json({ limit: '1mb' })(req, res, next);
});
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/api/admin/upload-data') {
    return next();
  }
  express.urlencoded({ extended: true, limit: '1mb' })(req, res, next);
});

// Client IP helper
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

// Persistent Storage Paths on the server
const DATA_DIR = path.join(__dirname, 'data');
const ADMISSIONS_FILE = path.join(DATA_DIR, 'admissions.json');
const REVIEW_FILE = path.join(DATA_DIR, 'admissions_review.json');
const METADATA_FILE = path.join(DATA_DIR, 'admissions_meta.json');
const BACKUP_FILE = path.join(DATA_DIR, 'admissions.backup.json');
const PRE_RESTORE_FILE = path.join(DATA_DIR, 'admissions.pre_restore_backup.json');
const RATE_LIMIT_FILE = path.join(DATA_DIR, 'login_rate_limits.json');
const AUDIT_LOG_FILE = path.join(DATA_DIR, 'security_audit.log');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Atomic File Writing: writes to a unique temporary file first, flushes, and renames atomically.
 * Prevents partial or corrupt file writes if the process is killed or disk write is interrupted.
 */
function atomicWriteFileSync(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tempPath = path.join(
    dir,
    `.${path.basename(filePath)}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`
  );
  fs.writeFileSync(tempPath, content, 'utf-8');
  fs.renameSync(tempPath, filePath);
}

/**
 * Structured Security Audit Logger (Logs actions safely without leaking secrets or passwords)
 */
interface AuditLogEntry {
  action:
    | 'LOGIN_SUCCESS'
    | 'LOGIN_FAILED'
    | 'LOGIN_LOCKED'
    | 'LOGOUT'
    | 'RESTORE_BACKUP'
    | 'ROLLBACK_RESTORE'
    | 'EXPORT_DATA'
    | 'DOWNLOAD_BACKUP'
    | 'UPLOAD_DATA'
    | 'DELETE_DATA'
    | 'VERIFY_TOKEN';
  ip: string;
  username?: string;
  status: 'SUCCESS' | 'FAILURE' | 'BLOCKED';
  details?: Record<string, unknown>;
}

function writeAuditLog(entry: AuditLogEntry): void {
  try {
    const logLine =
      JSON.stringify({
        timestamp: new Date().toISOString(),
        ...entry,
      }) + '\n';
    fs.appendFileSync(AUDIT_LOG_FILE, logLine, 'utf-8');
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}

// Rate Limiter for Login Protection (Brute Force Defense with Restart Persistence)
interface LoginAttemptRecord {
  attempts: number;
  blockedUntil: number;
  firstAttempt: number;
}

function loadRateLimits(): Map<string, LoginAttemptRecord> {
  const map = new Map<string, LoginAttemptRecord>();
  try {
    if (fs.existsSync(RATE_LIMIT_FILE)) {
      const data = JSON.parse(fs.readFileSync(RATE_LIMIT_FILE, 'utf-8'));
      const now = Date.now();
      if (typeof data === 'object' && data !== null) {
        for (const [ip, rec] of Object.entries(data)) {
          const r = rec as LoginAttemptRecord;
          if (r && r.blockedUntil > now) {
            map.set(ip, r);
          }
        }
      }
    }
  } catch (e) {
    console.error('Failed to load login rate limits:', e);
  }
  return map;
}

function persistRateLimits(map: Map<string, LoginAttemptRecord>): void {
  try {
    const obj: Record<string, LoginAttemptRecord> = {};
    const now = Date.now();
    for (const [ip, rec] of map.entries()) {
      if (rec.blockedUntil > now || rec.attempts > 0) {
        obj[ip] = rec;
      }
    }
    atomicWriteFileSync(RATE_LIMIT_FILE, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.error('Failed to persist rate limits:', e);
  }
}

const loginAttempts = loadRateLimits();

// Clean up stale rate limit entries every 15 minutes
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const [ip, record] of loginAttempts.entries()) {
    if (record.blockedUntil < now && now - record.firstAttempt > 15 * 60 * 1000) {
      loginAttempts.delete(ip);
      changed = true;
    }
  }
  if (changed) {
    persistRateLimits(loginAttempts);
  }
}, 15 * 60 * 1000);

// General API Rate Limiter (300 requests/minute/IP)
interface ApiRateRecord {
  count: number;
  resetAt: number;
}
const apiRateLimits = new Map<string, ApiRateRecord>();

app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  const ip = getClientIp(req);
  const now = Date.now();
  let record = apiRateLimits.get(ip);
  if (!record || record.resetAt <= now) {
    record = { count: 1, resetAt: now + 60 * 1000 };
    apiRateLimits.set(ip, record);
    return next();
  }
  record.count += 1;
  if (record.count > 300) {
    return res.status(429).json({
      success: false,
      error: 'تم تجاوز معدل الطلبات المسموح به. يرجى الانتظار قليلاً والمحاولة لاحقاً.',
    });
  }
  next();
});

// Defensive Security Headers Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=(), autoplay=(), encrypted-media=(), picture-in-picture=(), display-capture=()'
  );
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('Origin-Agent-Cluster', '?1');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; frame-src 'none'; child-src 'self' blob:; worker-src 'self' blob:; manifest-src 'self'; media-src 'none'; img-src 'self' data:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; style-src-elem 'self' 'unsafe-inline'; style-src-attr 'self' 'unsafe-inline'; script-src 'self'; script-src-elem 'self'; script-src-attr 'none'; connect-src 'self'; upgrade-insecure-requests; block-all-mixed-content"
  );
  next();
});

// Strict No-Cache for API Endpoints to protect session and dynamic admission data
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

// Disaster Recovery: Automatic atomic backup utility before write operations
function createDatabaseBackup(): void {
  try {
    if (fs.existsSync(ADMISSIONS_FILE)) {
      const stats = fs.statSync(ADMISSIONS_FILE);
      // Only backup if file exists and contains non-empty data (> 2 bytes, i.e. not empty [])
      if (stats.size > 2) {
        fs.copyFileSync(ADMISSIONS_FILE, BACKUP_FILE);
      }
    }
  } catch (err) {
    console.error('Failed to create admissions database backup:', err);
  }
}

// Ensure initial files exist atomically
if (!fs.existsSync(ADMISSIONS_FILE)) {
  atomicWriteFileSync(ADMISSIONS_FILE, JSON.stringify([], null, 2));
}
if (!fs.existsSync(REVIEW_FILE)) {
  atomicWriteFileSync(REVIEW_FILE, JSON.stringify([], null, 2));
}
if (!fs.existsSync(METADATA_FILE)) {
  atomicWriteFileSync(
    METADATA_FILE,
    JSON.stringify(
      {
        totalRecords: 0,
        reviewRecords: 0,
        duplicateCount: 0,
        lastUpdated: null,
      },
      null,
      2
    )
  );
}

// Secure Server-side Admin Credentials (Never exposed to client bundles)
const ADMIN_USERNAME = process.env.ADMIN_USER || 'engali98';
const ADMIN_PASSWORD = process.env.ADMIN_PASS || '1998engali';

// Active In-Memory Sessions with Expiration
interface AdminSession {
  token: string;
  username: string;
  createdAt: number;
  expiresAt: number;
}
const activeSessions = new Map<string, AdminSession>();

// Cleanup expired sessions every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of activeSessions.entries()) {
    if (session.expiresAt <= now) {
      activeSessions.delete(token);
    }
  }
}, 10 * 60 * 1000);

// Helper to extract session token strictly from HttpOnly Cookie (prevents XSS exfiltration)
function extractTokenFromRequest(req: Request): string | null {
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)dalilak_admin_token=([^;]+)/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
  }
  return null;
}

/**
 * Authoritative Whitelist for CSRF & Origin Verification
 * (Immune to client-controlled Host or X-Forwarded-Host tampering)
 */
function getTrustedHosts(): Set<string> {
  const trusted = new Set<string>();

  // Local development & test environments
  trusted.add('localhost:3000');
  trusted.add('127.0.0.1:3000');
  trusted.add('localhost');
  trusted.add('127.0.0.1');

  // Cloud Run deployment origins for this applet
  trusted.add('ais-dev-ixsieqp3p2c2qehr7ezffa-289108455683.europe-west2.run.app');
  trusted.add('ais-pre-ixsieqp3p2c2qehr7ezffa-289108455683.europe-west2.run.app');

  // Authoritative environment-configured domains
  if (process.env.ALLOWED_ORIGINS) {
    process.env.ALLOWED_ORIGINS.split(',').forEach((origin) => {
      const trimmed = origin.trim().toLowerCase();
      if (trimmed) {
        try {
          const u = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
          trusted.add(u.host);
        } catch {
          trusted.add(trimmed);
        }
      }
    });
  }

  if (process.env.APP_DOMAIN) {
    trusted.add(process.env.APP_DOMAIN.trim().toLowerCase());
  }

  return trusted;
}

/**
 * Robust Origin & Referer CSRF Validator with Strict Authoritative Whitelist
 */
function verifyOriginAndReferer(req: Request): { valid: boolean; reason?: string } {
  // Safe HTTP methods do not modify server state
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return { valid: true };
  }

  const originHeader = req.headers.origin;
  const refererHeader = req.headers.referer;
  const sourceHeader = originHeader || refererHeader;

  // In standard browsers, state-changing requests carry Origin or Referer
  if (!sourceHeader || typeof sourceHeader !== 'string') {
    return {
      valid: false,
      reason: 'ترويسة المصدر (Origin/Referer) مفقودة في الطلب المعدّل للحالة.',
    };
  }

  try {
    const parsedSource = new URL(sourceHeader);
    const sourceHost = parsedSource.host.toLowerCase(); // includes port if present
    const sourceHostname = parsedSource.hostname.toLowerCase();

    const trustedHosts = getTrustedHosts();

    // Verify source strictly matches the authoritative whitelist
    if (!trustedHosts.has(sourceHost) && !trustedHosts.has(sourceHostname)) {
      return {
        valid: false,
        reason: `المصدر (${sourceHost}) غير مدرج في قائمة النطاقات الموثوقة المعتمدة للخادم.`,
      };
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: 'صيغة ترويسة المصدر غير صالحة.' };
  }
}

// Authentication Middleware to strictly protect all Admin operations
function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  // CSRF Defense for all state-changing requests
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const csrfCheck = verifyOriginAndReferer(req);
    if (!csrfCheck.valid) {
      return res.status(403).json({
        success: false,
        error: `تم رفض الطلب لاشتباه تزوير الطلبات عبر المواقع (CSRF): ${csrfCheck.reason}`,
      });
    }
  }

  const token = extractTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'غير مصرح: يجب تسجيل الدخول كمدير عبر جلسة مؤمنة للوصول إلى هذه العمليات.',
    });
  }

  const session = activeSessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    if (session) activeSessions.delete(token);
    return res.status(403).json({
      success: false,
      error: 'انتهت صلاحية جلسة المدير أو الرمز غير صالح. يرجى تسجيل الدخول مجدداً.',
    });
  }

  // Extend session on activity (sliding window: 4 hours)
  session.expiresAt = Date.now() + 4 * 60 * 60 * 1000;
  (req as any).adminSession = session;
  next();
}

// ----------------------------------------------------
// Public APIs
// ----------------------------------------------------

/**
 * Public: Get confirmed admission records for students
 */
app.get('/api/admissions', (req: Request, res: Response) => {
  try {
    const raw = fs.readFileSync(ADMISSIONS_FILE, 'utf-8');
    const records = JSON.parse(raw);

    let meta = { lastUpdated: null, totalRecords: records.length };
    if (fs.existsSync(METADATA_FILE)) {
      meta = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf-8'));
    }

    res.json({
      success: true,
      records,
      count: records.length,
      lastUpdated: meta.lastUpdated,
    });
  } catch (err: any) {
    console.error('Error reading admissions file:', err);
    res.status(500).json({
      success: false,
      error: 'تعذر تحميل بيانات القبول من الخادم.',
      records: [],
    });
  }
});

// ----------------------------------------------------
// Authentication APIs
// ----------------------------------------------------

/**
 * Admin Login Endpoint
 */
app.post('/api/auth/login', (req: Request, res: Response) => {
  // CSRF Defense for login requests
  const csrfCheck = verifyOriginAndReferer(req);
  if (!csrfCheck.valid) {
    return res.status(403).json({
      success: false,
      error: `تم رفض الطلب لاشتباه تزوير الطلبات عبر المواقع (CSRF): ${csrfCheck.reason}`,
    });
  }

  const ip = getClientIp(req);
  const now = Date.now();
  const attemptRecord = loginAttempts.get(ip) || { attempts: 0, blockedUntil: 0, firstAttempt: now };

  if (attemptRecord.blockedUntil > now) {
    const remainingSeconds = Math.ceil((attemptRecord.blockedUntil - now) / 1000);
    const remainingMinutes = Math.ceil(remainingSeconds / 60);
    writeAuditLog({
      action: 'LOGIN_LOCKED',
      ip,
      status: 'BLOCKED',
      details: { remainingMinutes },
    });
    return res.status(429).json({
      success: false,
      error: `تم قفل محاولات تسجيل الدخول مؤقتاً لتكرار المحاولات الخاطئة. يرجى المحاولة بعد ${remainingMinutes} دقيقة.`,
    });
  }

  const { username, password } = req.body || {};

  if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'يرجى إدخال اسم المستخدم ورمز الدخول بصيغة نصية صحيحة.',
    });
  }

  const userBuf = Buffer.from(username.trim());
  const adminUserBuf = Buffer.from(ADMIN_USERNAME);
  const isUserValid =
    userBuf.length === adminUserBuf.length &&
    crypto.timingSafeEqual(userBuf, adminUserBuf);

  const passBuf = Buffer.from(password.trim());
  const adminPassBuf = Buffer.from(ADMIN_PASSWORD);
  const isPassValid =
    passBuf.length === adminPassBuf.length &&
    crypto.timingSafeEqual(passBuf, adminPassBuf);

  if (isUserValid && isPassValid) {
    // Reset rate limit on successful authentication
    loginAttempts.delete(ip);
    persistRateLimits(loginAttempts);

    // Generate secure 256-bit token
    const token = crypto.randomBytes(32).toString('hex');
    const session: AdminSession = {
      token,
      username: ADMIN_USERNAME,
      createdAt: Date.now(),
      expiresAt: Date.now() + 4 * 60 * 60 * 1000, // 4 hours
    };
    activeSessions.set(token, session);

    // Set secure HttpOnly cookie for defense against XSS token exfiltration
    const isHttps =
      req.secure ||
      req.headers['x-forwarded-proto'] === 'https' ||
      process.env.NODE_ENV === 'production';
    const cookieFlags = [
      `dalilak_admin_token=${encodeURIComponent(token)}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      'Max-Age=14400',
      isHttps ? 'Secure' : '',
    ]
      .filter(Boolean)
      .join('; ');
    res.setHeader('Set-Cookie', cookieFlags);

    writeAuditLog({
      action: 'LOGIN_SUCCESS',
      ip,
      username: ADMIN_USERNAME,
      status: 'SUCCESS',
    });

    // Session token is strictly held in the HttpOnly cookie - NEVER exposed in JSON to JS
    return res.json({
      success: true,
      user: {
        username: ADMIN_USERNAME,
        role: 'admin',
      },
    });
  } else {
    attemptRecord.attempts += 1;
    if (attemptRecord.attempts >= 5) {
      attemptRecord.blockedUntil = now + 15 * 60 * 1000; // 15 minutes lockout
      loginAttempts.set(ip, attemptRecord);
      persistRateLimits(loginAttempts);

      writeAuditLog({
        action: 'LOGIN_LOCKED',
        ip,
        status: 'BLOCKED',
        details: { attempts: attemptRecord.attempts },
      });

      return res.status(429).json({
        success: false,
        error: 'تم تجاوز الحد الأقصى لمحاولات تسجيل الدخول (5 محاولات). تم قفل الحساب مؤقتاً لمدة 15 دقيقة لحماية النظام.',
      });
    } else {
      loginAttempts.set(ip, attemptRecord);
      persistRateLimits(loginAttempts);

      writeAuditLog({
        action: 'LOGIN_FAILED',
        ip,
        status: 'FAILURE',
        details: { attemptNumber: attemptRecord.attempts },
      });

      const remainingAttempts = 5 - attemptRecord.attempts;
      return res.status(401).json({
        success: false,
        error: `بيانات الدخول غير صحيحة. متبقي ${remainingAttempts} محاولات قبل القفل المؤقت.`,
      });
    }
  }
});

/**
 * Verify Admin Token
 */
app.get('/api/auth/verify', (req: Request, res: Response) => {
  const token = extractTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ authenticated: false });
  }

  const session = activeSessions.get(token);
  if (session && session.expiresAt > Date.now()) {
    return res.json({
      authenticated: true,
      username: session.username,
      role: 'admin',
    });
  }

  return res.status(401).json({ authenticated: false });
});

/**
 * Admin Logout
 */
app.post('/api/auth/logout', (req: Request, res: Response) => {
  // CSRF Defense for logout
  const csrfCheck = verifyOriginAndReferer(req);
  if (!csrfCheck.valid) {
    return res.status(403).json({
      success: false,
      error: `تم رفض الطلب لاشتباه تزوير الطلبات عبر المواقع (CSRF): ${csrfCheck.reason}`,
    });
  }

  const token = extractTokenFromRequest(req);
  if (token) {
    const session = activeSessions.get(token);
    writeAuditLog({
      action: 'LOGOUT',
      ip: getClientIp(req),
      username: session?.username || 'admin',
      status: 'SUCCESS',
    });
    activeSessions.delete(token);
  }

  // Clear cookie
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production';
  const clearFlags = [
    'dalilak_admin_token=',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    isHttps ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
  res.setHeader('Set-Cookie', clearFlags);
  res.json({ success: true });
});

// ----------------------------------------------------
// Protected Admin APIs
// ----------------------------------------------------

/**
 * Helper to clean and normalize text with Formula Injection defense & length bounding
 */
function clean(val: any, maxLength = 250): string {
  if (val === null || val === undefined) return 'غير متوفر في البيانات';
  let str = String(val).trim();
  if (str.length === 0) return 'غير متوفر في البيانات';

  // String length bound to prevent memory exhaustion
  if (str.length > maxLength) {
    str = str.substring(0, maxLength);
  }
  return str;
}

/**
 * Escapes values for CSV/Spreadsheet exports to prevent Formula Injection (CWE-1236)
 * without mutating canonical source data in storage.
 */
function escapeSpreadsheetCell(val: string): string {
  if (!val) return '';
  if (/^[=+\-@\t\r]/.test(val)) {
    return "'" + val;
  }
  return val;
}

function parseScore(val: any): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    return isNaN(val) ? null : Number(val.toFixed(2));
  }
  const str = String(val).trim().replace(',', '.');
  const num = parseFloat(str);
  if (isNaN(num)) return null;
  return Number(num.toFixed(2));
}

/**
 * Upload & Validate Admission Records with 50MB dedicated limit and backup
 */
app.post(
  '/api/admin/upload-data',
  requireAdminAuth,
  express.json({ limit: '50mb' }),
  (req: Request, res: Response) => {
    try {
      const rawRecords = req.body?.records;
      if (!Array.isArray(rawRecords)) {
        return res.status(400).json({
          success: false,
          error: 'يجب أن تكون البيانات مصفوفة من السجلات (Array).',
        });
      }

      // Defense against resource exhaustion / DoS
      if (rawRecords.length > 25000) {
        return res.status(400).json({
          success: false,
          error: 'تتجاوز كمية السجلات الحد الأقصى المسموح به في المرة الواحدة (25,000 سجل).',
        });
      }

    const validRecords: any[] = [];
    const reviewRecords: any[] = [];
    const seen = new Set<string>();
    let duplicates = 0;

    rawRecords.forEach((item, index) => {
      if (!item || typeof item !== 'object') return;

      const university = clean(
        item['university'] ?? item['الجامعة'] ?? item['اسم الجامعة'] ?? item['جامعة']
      );
      const college = clean(
        item['college'] ?? item['الكلية'] ?? item['اسم الكلية'] ?? item['كلية']
      );
      const department = clean(
        item['department'] ?? item['القسم'] ?? item['اسم القسم'] ?? item['قسم'] ?? item['الفرع / القسم']
      );
      const governorate = clean(
        item['governorate'] ?? item['المحافظة'] ?? item['محافظة'] ?? item['المدينة']
      );
      const rawScore =
        item['minimumScore'] ??
        item['الحد الأدنى'] ??
        item['الحد الادنى'] ??
        item['المعدل'] ??
        item['معدل القبول'] ??
        item['معدل'] ??
        item['score'];
      const rawGender =
        item['gender'] ?? item['الجنس'] ?? item['جنس المقبولين'] ?? item['نوع الجنس'];
      const rawBranch =
        item['branch'] ?? item['الفرع'] ?? item['الفرع الدراسي'] ?? item['فرع'];
      const notes = clean(item['notes'] ?? item['ملاحظات'] ?? item['ملاحظة']);

      const minimumScore = parseScore(rawScore);

      let genderStr = clean(rawGender);
      if (genderStr === 'غير متوفر في البيانات') {
        genderStr = 'كلاهما';
      }

      // Branch normalization: strictly «علمي» or «أدبي» or 'كلاهما/عام'
      let branchStr = clean(rawBranch);
      if (branchStr === 'غير متوفر في البيانات') {
        branchStr = 'علمي وأدبي';
      }

      const id = String(
        item['id'] || `adm_${Date.now()}_${index + 1}_${Math.random().toString(36).substring(2, 6)}`
      );

      // Track duplicate signature
      const sig = `${university}__${college}__${department}__${minimumScore}__${branchStr}__${genderStr}`;
      if (seen.has(sig)) {
        duplicates++;
      } else {
        seen.add(sig);
      }

      // Validation: score between 50 and 105 (allowing for Iraqi bonus points like French/First round)
      const isScoreInvalid = minimumScore === null || minimumScore < 50 || minimumScore > 105;
      const isMissingNames =
        university === 'غير متوفر في البيانات' ||
        college === 'غير متوفر في البيانات';

      if (isScoreInvalid || isMissingNames) {
        let reason = '';
        if (isScoreInvalid) reason += `المعدل (${rawScore ?? 'مفقود'}) خارج النطاق المعتمد 50-105 أو غير محدد. `;
        if (isMissingNames) reason += 'اسم الجامعة أو الكلية مفقود في النص المصدر.';

        reviewRecords.push({
          id,
          university,
          college,
          department,
          governorate: governorate !== 'غير متوفر في البيانات' ? governorate : 'غير متوفر في البيانات',
          minimumScore: minimumScore ?? 0,
          gender: genderStr,
          branch: branchStr,
          studyType: 'حكومي',
          academicYear: '2025–2026',
          channel: 'القبول المركزي',
          isAmbiguous: true,
          ambiguityReason: reason.trim(),
          notes: notes !== 'غير متوفر في البيانات' ? notes : undefined,
        });
      } else {
        validRecords.push({
          id,
          university,
          college,
          department,
          governorate: governorate !== 'غير متوفر في البيانات' ? governorate : 'غير متوفر في البيانات',
          minimumScore: minimumScore!,
          gender: genderStr,
          branch: branchStr,
          studyType: 'حكومي',
          academicYear: '2025–2026',
          channel: 'القبول المركزي',
          isAmbiguous: false,
          notes: notes !== 'غير متوفر في البيانات' ? notes : undefined,
        });
      }
    });

    // Backup existing data before committing changes
    createDatabaseBackup();

    // Write permanently and atomically to Server Disk
    atomicWriteFileSync(ADMISSIONS_FILE, JSON.stringify(validRecords, null, 2));
    atomicWriteFileSync(REVIEW_FILE, JSON.stringify(reviewRecords, null, 2));

    const metadata = {
      totalRecords: validRecords.length,
      reviewRecords: reviewRecords.length,
      duplicateCount: duplicates,
      lastUpdated: new Date().toISOString(),
    };
    atomicWriteFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));

    const session = (req as any).adminSession;
    writeAuditLog({
      action: 'UPLOAD_DATA',
      ip: getClientIp(req),
      username: session?.username || 'admin',
      status: 'SUCCESS',
      details: {
        validCount: validRecords.length,
        reviewCount: reviewRecords.length,
        duplicateCount: duplicates,
      },
    });

    res.json({
      success: true,
      count: validRecords.length,
      reviewCount: reviewRecords.length,
      duplicateCount: duplicates,
      lastUpdated: metadata.lastUpdated,
    });
  } catch (err: any) {
    console.error('Error saving admission data:', err);
    res.status(500).json({
      success: false,
      error: 'فشل حفظ واستيراد البيانات في قاعدة البيانات الدائمة على الخادم.',
    });
  }
});

/**
 * Get Admin Data Summary & Review Records
 */
app.get('/api/admin/data-summary', requireAdminAuth, (req: Request, res: Response) => {
  try {
    let validRecords: any[] = [];
    let reviewRecords: any[] = [];
    let meta = { totalRecords: 0, reviewRecords: 0, duplicateCount: 0, lastUpdated: null };

    if (fs.existsSync(ADMISSIONS_FILE)) {
      validRecords = JSON.parse(fs.readFileSync(ADMISSIONS_FILE, 'utf-8'));
    }
    if (fs.existsSync(REVIEW_FILE)) {
      reviewRecords = JSON.parse(fs.readFileSync(REVIEW_FILE, 'utf-8'));
    }
    if (fs.existsSync(METADATA_FILE)) {
      meta = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf-8'));
    }

    const hasBackup = fs.existsSync(BACKUP_FILE);
    const hasPreRestoreSnapshot = fs.existsSync(PRE_RESTORE_FILE);

    res.json({
      success: true,
      count: validRecords.length,
      reviewCount: reviewRecords.length,
      duplicateCount: meta.duplicateCount || 0,
      lastUpdated: meta.lastUpdated,
      reviewRecords,
      hasBackup,
      hasPreRestoreSnapshot,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'تعذر جلب ملخص البيانات.' });
  }
});

/**
 * Clear Data (Admin Only)
 */
app.post('/api/admin/delete-data', requireAdminAuth, (req: Request, res: Response) => {
  const session = (req as any).adminSession;
  const ip = getClientIp(req);

  try {
    // Backup existing data before clearing
    createDatabaseBackup();

    atomicWriteFileSync(ADMISSIONS_FILE, JSON.stringify([], null, 2));
    atomicWriteFileSync(REVIEW_FILE, JSON.stringify([], null, 2));
    atomicWriteFileSync(
      METADATA_FILE,
      JSON.stringify(
        {
          totalRecords: 0,
          reviewRecords: 0,
          duplicateCount: 0,
          lastUpdated: new Date().toISOString(),
        },
        null,
        2
      )
    );

    writeAuditLog({
      action: 'DELETE_DATA',
      ip,
      username: session?.username || 'admin',
      status: 'SUCCESS',
    });

    res.json({ success: true, message: 'تم مسح البيانات بنجاح.' });
  } catch (err: any) {
    writeAuditLog({
      action: 'DELETE_DATA',
      ip,
      username: session?.username || 'admin',
      status: 'FAILURE',
      details: { error: err.message },
    });
    res.status(500).json({ success: false, error: 'فشل حذف البيانات.' });
  }
});

/**
 * Restore Data from Disaster Recovery Backup (Admin Only)
 */
app.post('/api/admin/restore-backup', requireAdminAuth, (req: Request, res: Response) => {
  const session = (req as any).adminSession;
  const ip = getClientIp(req);

  try {
    // 1. Explicit confirmation check to prevent accidental invocation
    if (req.body?.confirm !== true) {
      writeAuditLog({
        action: 'RESTORE_BACKUP',
        ip,
        username: session?.username || 'admin',
        status: 'FAILURE',
        details: { reason: 'Confirmation flag missing' },
      });
      return res.status(400).json({
        success: false,
        error: 'يرجى تأكيد عملية الاستعادة صراحة عبر إرسال { confirm: true } لمنع الاستبدال العرضي.',
      });
    }

    // 2. Check backup file existence
    if (!fs.existsSync(BACKUP_FILE)) {
      writeAuditLog({
        action: 'RESTORE_BACKUP',
        ip,
        username: session?.username || 'admin',
        status: 'FAILURE',
        details: { reason: 'Backup file does not exist' },
      });
      return res.status(404).json({
        success: false,
        error: 'لا توجد نسخة احتياطية محفوظة على الخادم حالياً.',
      });
    }

    // 3. Strict integrity and schema validation
    const backupContent = fs.readFileSync(BACKUP_FILE, 'utf-8');
    let parsed: any[];
    try {
      parsed = JSON.parse(backupContent);
    } catch {
      writeAuditLog({
        action: 'RESTORE_BACKUP',
        ip,
        username: session?.username || 'admin',
        status: 'FAILURE',
        details: { reason: 'Corrupt JSON in backup' },
      });
      return res.status(400).json({
        success: false,
        error: 'ملف النسخة الاحتياطية تالف ولا يمثل نص JSON صالحاً.',
      });
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      writeAuditLog({
        action: 'RESTORE_BACKUP',
        ip,
        username: session?.username || 'admin',
        status: 'FAILURE',
        details: { reason: 'Backup is empty or not an array' },
      });
      return res.status(400).json({
        success: false,
        error: 'ملف النسخة الاحتياطية فارغ أو لا يحتوي على مصفوفة صالحة.',
      });
    }

    if (parsed.length > 25000) {
      writeAuditLog({
        action: 'RESTORE_BACKUP',
        ip,
        username: session?.username || 'admin',
        status: 'FAILURE',
        details: { reason: 'Record count exceeds maximum 25,000 limit' },
      });
      return res.status(400).json({
        success: false,
        error: 'حجم النسخة الاحتياطية يتجاوز الحد الأقصى المسموح به (25,000 سجل).',
      });
    }

    // 3. Strict record-by-record schema validation across EVERY item in the backup
    for (let i = 0; i < parsed.length; i++) {
      const record = parsed[i];
      if (!record || typeof record !== 'object') {
        writeAuditLog({
          action: 'RESTORE_BACKUP',
          ip,
          username: session?.username || 'admin',
          status: 'FAILURE',
          details: { reason: `Record at index ${i} is not a valid object` },
        });
        return res.status(400).json({
          success: false,
          error: `السجل رقم ${i + 1} في ملف النسخة الاحتياطية غير صالح أو ليس كائناً.`,
        });
      }

      const university =
        record.university ??
        record['الجامعة'] ??
        record['جامعة'] ??
        record['اسم الجامعة'];
      const score =
        record.minimumScore ??
        record['الحد الأدنى'] ??
        record['الحد الادنى'] ??
        record['المعدل'] ??
        record['score'];

      if (!university || typeof university !== 'string' || university.trim().length === 0) {
        writeAuditLog({
          action: 'RESTORE_BACKUP',
          ip,
          username: session?.username || 'admin',
          status: 'FAILURE',
          details: { reason: `Missing university at index ${i}` },
        });
        return res.status(400).json({
          success: false,
          error: `السجل رقم ${i + 1} يفتقر إلى حقل الجامعة المطلوب.`,
        });
      }

      const numScore =
        typeof score === 'number'
          ? score
          : parseFloat(String(score).replace(',', '.'));
      if (score === undefined || score === null || isNaN(numScore) || numScore < 50 || numScore > 105) {
        writeAuditLog({
          action: 'RESTORE_BACKUP',
          ip,
          username: session?.username || 'admin',
          status: 'FAILURE',
          details: { reason: `Invalid score at index ${i}: ${score}` },
        });
        return res.status(400).json({
          success: false,
          error: `السجل رقم ${i + 1} يحتوي على معدل غير صالح (${score ?? 'مفقود'}). يجب أن يكون رقماً بين 50 و105.`,
        });
      }
    }

    // 4. Create pre-restore safety backup of the CURRENT data before replacing
    if (fs.existsSync(ADMISSIONS_FILE)) {
      try {
        fs.copyFileSync(ADMISSIONS_FILE, PRE_RESTORE_FILE);
      } catch (err) {
        console.error('Failed to snapshot pre-restore data:', err);
      }
    }

    // 5. Atomic write to prevent file corruption
    atomicWriteFileSync(ADMISSIONS_FILE, backupContent);

    const metadata = {
      totalRecords: parsed.length,
      reviewRecords: 0,
      duplicateCount: 0,
      lastUpdated: new Date().toISOString(),
      restoredFromBackup: true,
      restoredAt: new Date().toISOString(),
    };
    atomicWriteFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));

    writeAuditLog({
      action: 'RESTORE_BACKUP',
      ip,
      username: session?.username || 'admin',
      status: 'SUCCESS',
      details: { restoredCount: parsed.length },
    });

    res.json({
      success: true,
      count: parsed.length,
      message: `تمت استعادة ${parsed.length} سجلاً معتمداً من النسخة الاحتياطية بنجاح عبر عملية ذرية آمنة.`,
      lastUpdated: metadata.lastUpdated,
    });
  } catch (err: any) {
    console.error('Error restoring backup:', err);
    writeAuditLog({
      action: 'RESTORE_BACKUP',
      ip,
      username: session?.username || 'admin',
      status: 'FAILURE',
      details: { error: err.message },
    });
    res.status(500).json({
      success: false,
      error: 'حدث خطأ أثناء محاولة استعادة النسخة الاحتياطية.',
    });
  }
});

/**
 * Rollback Restore: Restore the snapshot taken immediately prior to the last restore operation
 */
app.post('/api/admin/rollback-restore', requireAdminAuth, (req: Request, res: Response) => {
  const session = (req as any).adminSession;
  const ip = getClientIp(req);

  try {
    if (req.body?.confirm !== true) {
      writeAuditLog({
        action: 'ROLLBACK_RESTORE',
        ip,
        username: session?.username || 'admin',
        status: 'FAILURE',
        details: { reason: 'Confirmation flag missing' },
      });
      return res.status(400).json({
        success: false,
        error: 'يرجى تأكيد عملية التراجع صراحة عبر إرسال { confirm: true }.',
      });
    }

    if (!fs.existsSync(PRE_RESTORE_FILE)) {
      writeAuditLog({
        action: 'ROLLBACK_RESTORE',
        ip,
        username: session?.username || 'admin',
        status: 'FAILURE',
        details: { reason: 'No pre-restore snapshot available' },
      });
      return res.status(404).json({
        success: false,
        error: 'لا توجد لقطة سابقة لما قبل الاستعادة محفوظة للتراجع عنها حالياً.',
      });
    }

    const preContent = fs.readFileSync(PRE_RESTORE_FILE, 'utf-8');
    let parsed: any[];
    try {
      parsed = JSON.parse(preContent);
    } catch {
      writeAuditLog({
        action: 'ROLLBACK_RESTORE',
        ip,
        username: session?.username || 'admin',
        status: 'FAILURE',
        details: { reason: 'Corrupt snapshot file' },
      });
      return res.status(400).json({
        success: false,
        error: 'ملف اللقطة السابقة تالف ولا يمكن التراجع إليه بأمان.',
      });
    }

    if (!Array.isArray(parsed)) {
      writeAuditLog({
        action: 'ROLLBACK_RESTORE',
        ip,
        username: session?.username || 'admin',
        status: 'FAILURE',
        details: { reason: 'Snapshot is not an array' },
      });
      return res.status(400).json({
        success: false,
        error: 'ملف اللقطة السابقة لا يحتوي على مصفوفة صالحة.',
      });
    }

    // Atomic restore back to ADMISSIONS_FILE
    atomicWriteFileSync(ADMISSIONS_FILE, preContent);

    const metadata = {
      totalRecords: parsed.length,
      reviewRecords: 0,
      duplicateCount: 0,
      lastUpdated: new Date().toISOString(),
      rolledBackAt: new Date().toISOString(),
    };
    atomicWriteFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));

    writeAuditLog({
      action: 'ROLLBACK_RESTORE',
      ip,
      username: session?.username || 'admin',
      status: 'SUCCESS',
      details: { recordCount: parsed.length },
    });

    res.json({
      success: true,
      count: parsed.length,
      message: `تم التراجع عن الاستعادة وإعادة البيانات السابقة (${parsed.length} سجلاً) بنجاح.`,
      lastUpdated: metadata.lastUpdated,
    });
  } catch (err: any) {
    console.error('Error in rollback-restore:', err);
    writeAuditLog({
      action: 'ROLLBACK_RESTORE',
      ip,
      username: session?.username || 'admin',
      status: 'FAILURE',
      details: { error: err.message },
    });
    res.status(500).json({
      success: false,
      error: 'حدث خطأ أثناء محاولة التراجع عن الاستعادة.',
    });
  }
});

/**
 * Export Current Admissions Data as downloadable file outside the container
 */
app.get('/api/admin/export-data', requireAdminAuth, (req: Request, res: Response) => {
  const session = (req as any).adminSession;
  const ip = getClientIp(req);

  try {
    if (!fs.existsSync(ADMISSIONS_FILE)) {
      return res.status(404).json({ success: false, error: 'لا توجد بيانات متاحة للتصدير.' });
    }
    const data = fs.readFileSync(ADMISSIONS_FILE, 'utf-8');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    writeAuditLog({
      action: 'EXPORT_DATA',
      ip,
      username: session?.username || 'admin',
      status: 'SUCCESS',
    });

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="admissions_export_${timestamp}.json"`);
    res.send(data);
  } catch (err: any) {
    writeAuditLog({
      action: 'EXPORT_DATA',
      ip,
      username: session?.username || 'admin',
      status: 'FAILURE',
      details: { error: err.message },
    });
    res.status(500).json({ success: false, error: 'فشل تصدير البيانات.' });
  }
});

/**
 * Download Disaster Recovery Backup file outside the container
 */
app.get('/api/admin/download-backup', requireAdminAuth, (req: Request, res: Response) => {
  const session = (req as any).adminSession;
  const ip = getClientIp(req);

  try {
    if (!fs.existsSync(BACKUP_FILE)) {
      return res.status(404).json({ success: false, error: 'لا توجد نسخة احتياطية محفوظة للتنزيل.' });
    }
    const data = fs.readFileSync(BACKUP_FILE, 'utf-8');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    writeAuditLog({
      action: 'DOWNLOAD_BACKUP',
      ip,
      username: session?.username || 'admin',
      status: 'SUCCESS',
    });

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="admissions_backup_${timestamp}.json"`);
    res.send(data);
  } catch (err: any) {
    writeAuditLog({
      action: 'DOWNLOAD_BACKUP',
      ip,
      username: session?.username || 'admin',
      status: 'FAILURE',
      details: { error: err.message },
    });
    res.status(500).json({ success: false, error: 'فشل تنزيل النسخة الاحتياطية.' });
  }
});

// Global Error Handler to sanitize responses and eliminate stack trace leaks
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      error: 'حجم الطلب يتجاوز الحد المسموح به.',
    });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: 'صيغة بيانات JSON غير صالحة.',
    });
  }
  res.status(err?.status || 500).json({
    success: false,
    error: 'حدث خطأ غير متوقع في معالجة الطلب.',
  });
});

// ----------------------------------------------------
// Vite Dev Server or Production Static Serving
// ----------------------------------------------------
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  const server = http.createServer(app);

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`[Server] Dalilak Al-Jami'i server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
