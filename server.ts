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

// Body parsing with generous limit for large admission data files
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Defensive Security Headers Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=(), usb=(), vr=(), accelerometer=(), gyroscope=(), magnetometer=(), ambient-light-sensor=(), autoplay=(), encrypted-media=(), picture-in-picture=(), display-capture=(), interest-cohort=()');
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

// Persistent Storage Paths on the server
const DATA_DIR = path.join(__dirname, 'data');
const ADMISSIONS_FILE = path.join(DATA_DIR, 'admissions.json');
const REVIEW_FILE = path.join(DATA_DIR, 'admissions_review.json');
const METADATA_FILE = path.join(DATA_DIR, 'admissions_meta.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Ensure initial files exist
if (!fs.existsSync(ADMISSIONS_FILE)) {
  fs.writeFileSync(ADMISSIONS_FILE, JSON.stringify([], null, 2), 'utf-8');
}
if (!fs.existsSync(REVIEW_FILE)) {
  fs.writeFileSync(REVIEW_FILE, JSON.stringify([], null, 2), 'utf-8');
}
if (!fs.existsSync(METADATA_FILE)) {
  fs.writeFileSync(
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
    ),
    'utf-8'
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

// Authentication Middleware to strictly protect all Admin operations
function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'غير مصرح: يجب تسجيل الدخول كمدير للوصول إلى هذه العمليات.',
    });
  }

  const token = authHeader.split(' ')[1];
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
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: 'يرجى إدخال اسم المستخدم ورمز الدخول.',
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
    // Generate secure 256-bit token
    const token = crypto.randomBytes(32).toString('hex');
    const session: AdminSession = {
      token,
      username: ADMIN_USERNAME,
      createdAt: Date.now(),
      expiresAt: Date.now() + 4 * 60 * 60 * 1000, // 4 hours
    };
    activeSessions.set(token, session);

    return res.json({
      success: true,
      token,
      user: {
        username: ADMIN_USERNAME,
        role: 'admin',
      },
    });
  } else {
    return res.status(401).json({
      success: false,
      error: 'بيانات الدخول غير صحيحة. يرجى التحقق من اسم المستخدم ورمز الدخول.',
    });
  }
});

/**
 * Verify Admin Token
 */
app.get('/api/auth/verify', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ authenticated: false });
  }

  const token = authHeader.split(' ')[1];
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
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    activeSessions.delete(token);
  }
  res.json({ success: true });
});

// ----------------------------------------------------
// Protected Admin APIs
// ----------------------------------------------------

/**
 * Helper to clean and normalize text
 */
function clean(val: any): string {
  if (val === null || val === undefined) return 'غير متوفر في البيانات';
  const str = String(val).trim();
  return str.length > 0 ? str : 'غير متوفر في البيانات';
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
 * Upload & Validate Admission Records
 */
app.post('/api/admin/upload-data', requireAdminAuth, (req: Request, res: Response) => {
  try {
    const rawRecords = req.body?.records;
    if (!Array.isArray(rawRecords)) {
      return res.status(400).json({
        success: false,
        error: 'يجب أن تكون البيانات مصفوفة من السجلات (Array).',
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

    // Write permanently to Server Disk
    fs.writeFileSync(ADMISSIONS_FILE, JSON.stringify(validRecords, null, 2), 'utf-8');
    fs.writeFileSync(REVIEW_FILE, JSON.stringify(reviewRecords, null, 2), 'utf-8');

    const metadata = {
      totalRecords: validRecords.length,
      reviewRecords: reviewRecords.length,
      duplicateCount: duplicates,
      lastUpdated: new Date().toISOString(),
    };
    fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2), 'utf-8');

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

    res.json({
      success: true,
      count: validRecords.length,
      reviewCount: reviewRecords.length,
      duplicateCount: meta.duplicateCount || 0,
      lastUpdated: meta.lastUpdated,
      reviewRecords,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'تعذر جلب ملخص البيانات.' });
  }
});

/**
 * Clear Data (Admin Only)
 */
app.post('/api/admin/delete-data', requireAdminAuth, (req: Request, res: Response) => {
  try {
    fs.writeFileSync(ADMISSIONS_FILE, JSON.stringify([], null, 2), 'utf-8');
    fs.writeFileSync(REVIEW_FILE, JSON.stringify([], null, 2), 'utf-8');
    fs.writeFileSync(
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
      ),
      'utf-8'
    );
    res.json({ success: true, message: 'تم مسح البيانات بنجاح.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'فشل حذف البيانات.' });
  }
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
