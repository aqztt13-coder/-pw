// scripts/security_verification_stage3.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const ADMISSIONS_FILE = path.join(DATA_DIR, 'admissions.json');
const BACKUP_FILE = path.join(DATA_DIR, 'admissions.backup.json');
const PRE_RESTORE_FILE = path.join(DATA_DIR, 'admissions.pre_restore_backup.json');
const RATE_LIMIT_FILE = path.join(DATA_DIR, 'login_rate_limits.json');

// Preserve current live admissions data before tests
const PRISTINE_BACKUP = path.join(DATA_DIR, 'admissions.pristine_audit_backup.json');
if (fs.existsSync(ADMISSIONS_FILE) && !fs.existsSync(PRISTINE_BACKUP)) {
  fs.copyFileSync(ADMISSIONS_FILE, PRISTINE_BACKUP);
}

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        ...options,
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
        });
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(rawData);
          } catch {}
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: rawData,
            json,
          });
        });
      }
    );
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('=== بدء التدقيق والاختبار الأمني للمرحلة النهائية ===\n');
  const results = [];

  // Helper to extract cookie from Set-Cookie header
  let adminCookie = '';

  // ---------------------------------------------------------
  // TEST 1: POST /api/auth/login - Admin Token & Cookie Check
  // ---------------------------------------------------------
  console.log('--- الاختبار 1: فحص رمز المدير واستجابة تسجيل الدخول ---');
  try {
    const loginRes = await request(
      {
        path: '/api/auth/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:3000',
        },
      },
      { username: 'engali98', password: '1998engali' }
    );

    const hasNoExposedToken =
      loginRes.json?.token === undefined && loginRes.json?.success === true;
    const setCookieHeader = loginRes.headers['set-cookie']?.[0] || '';
    const hasHttpOnly = setCookieHeader.includes('HttpOnly');
    const hasSameSite = setCookieHeader.includes('SameSite=Lax');
    const hasTokenCookie = setCookieHeader.includes('dalilak_admin_token=');

    if (hasTokenCookie) {
      adminCookie = setCookieHeader.split(';')[0];
    }

    const test1Passed =
      loginRes.statusCode === 200 &&
      hasNoExposedToken &&
      hasHttpOnly &&
      hasSameSite;
    console.log(`- رمز الجلسة لا يعاد في جسم JSON: ${hasNoExposedToken ? 'ناجح (محجوب)' : 'فاشل (مكشوف)'}`);
    console.log(`- كوكي HttpOnly تم إصداره: ${hasHttpOnly ? 'ناجح' : 'فاشل'}`);
    console.log(`- خاصية SameSite=Lax مفعلة: ${hasSameSite ? 'ناجح' : 'فاشل'}`);
    results.push({ name: 'Admin Token Hidden & HttpOnly Cookie Issued', passed: test1Passed });
  } catch (err) {
    console.error('Test 1 error:', err);
    results.push({ name: 'Admin Token Hidden & HttpOnly Cookie Issued', passed: false });
  }

  // ---------------------------------------------------------
  // TEST 2: Bearer Header Elimination & Cookie Enforcement
  // ---------------------------------------------------------
  console.log('\n--- الاختبار 2: إلغاء مسار Bearer وفرض الكوكي الآمن ---');
  try {
    // Request with Fake Bearer header and NO cookie
    const bearerRes = await request({
      path: '/api/admin/data-summary',
      method: 'GET',
      headers: {
        Authorization: 'Bearer fake_stolen_token_12345',
      },
    });

    const bearerRejected = bearerRes.statusCode === 401;
    console.log(`- رفض مسار Bearer غير المصرح: ${bearerRejected ? 'ناجح (401)' : 'فاشل'}`);

    // Request WITH HttpOnly Cookie
    const cookieRes = await request({
      path: '/api/admin/data-summary',
      method: 'GET',
      headers: {
        Cookie: adminCookie,
      },
    });

    const cookieAccepted = cookieRes.statusCode === 200 && cookieRes.json?.success === true;
    console.log(`- قبول جلسة الكوكي الآمن: ${cookieAccepted ? 'ناجح (200)' : 'فاشل'}`);
    results.push({ name: 'Bearer Bypass Eliminated & Cookie Enforced', passed: bearerRejected && cookieAccepted });
  } catch (err) {
    console.error('Test 2 error:', err);
    results.push({ name: 'Bearer Bypass Eliminated & Cookie Enforced', passed: false });
  }

  // ---------------------------------------------------------
  // TEST 3: CSRF Defense with Origin & Reverse Proxy Matching
  // ---------------------------------------------------------
  console.log('\n--- الاختبار 3: حماية CSRF ومطابقة Origin والوكيل العكسي ---');
  try {
    // 3a: Untrusted Origin from external site
    const evilCsrfRes = await request(
      {
        path: '/api/admin/delete-data',
        method: 'POST',
        headers: {
          Cookie: adminCookie,
          Origin: 'https://evil-attacker-website.com',
          'Content-Type': 'application/json',
        },
      },
      {}
    );
    const evilBlocked = evilCsrfRes.statusCode === 403;
    console.log(`- حظر طلب CSRF ذو مصدر خارجي غير موثوق: ${evilBlocked ? 'ناجح (403 Forbidden)' : 'فاشل'}`);

    // 3b: Missing Origin and Referer on modifying request
    const missingCsrfRes = await request(
      {
        path: '/api/admin/delete-data',
        method: 'POST',
        headers: {
          Cookie: adminCookie,
          'Content-Type': 'application/json',
        },
      },
      {}
    );
    const missingBlocked = missingCsrfRes.statusCode === 403;
    console.log(`- حظر طلب بدون Origin أو Referer: ${missingBlocked ? 'ناجح (403 Forbidden)' : 'فاشل'}`);

    // 3c: Valid Origin matching local host
    const validLocalRes = await request(
      {
        path: '/api/admin/delete-data',
        method: 'POST',
        headers: {
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
        },
      },
      {}
    );
    const validLocalAllowed = validLocalRes.statusCode === 200;
    console.log(`- قبول المصدر المحلي المتطابق: ${validLocalAllowed ? 'ناجح (200 OK)' : 'فاشل'}`);

    // 3d: Reverse Proxy X-Forwarded-Host matching Origin
    const proxyCsrfRes = await request(
      {
        path: '/api/admin/delete-data',
        method: 'POST',
        headers: {
          Cookie: adminCookie,
          Origin: 'https://dalilak.iq',
          'X-Forwarded-Host': 'dalilak.iq',
          'Content-Type': 'application/json',
        },
      },
      {}
    );
    const proxyAllowed = proxyCsrfRes.statusCode === 200;
    console.log(`- مطابقة Origin مع ترويسة الوكيل العكسي X-Forwarded-Host: ${proxyAllowed ? 'ناجح (200 OK)' : 'فاشل'}`);

    results.push({
      name: 'CSRF Defense & Reverse Proxy Verification',
      passed: evilBlocked && missingBlocked && validLocalAllowed && proxyAllowed,
    });
  } catch (err) {
    console.error('Test 3 error:', err);
    results.push({ name: 'CSRF Defense & Reverse Proxy Verification', passed: false });
  }

  // ---------------------------------------------------------
  // TEST 4: Data Persistence & Atomic Disk Writing
  // ---------------------------------------------------------
  console.log('\n--- الاختبار 4: استمرارية البيانات والكتابة الذرية على الخادم ---');
  try {
    const testRecord = {
      university: 'جامعة بغداد التجريبية للأمن',
      college: 'كلية هندسة المعلومات',
      department: 'الأمن السيبراني',
      minimumScore: 94.5,
      branch: 'علمي',
      gender: 'كلاهما',
      governorate: 'بغداد',
    };

    const uploadRes = await request(
      {
        path: '/api/admin/upload-data',
        method: 'POST',
        headers: {
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
        },
      },
      { records: [testRecord] }
    );

    const uploadSuccess = uploadRes.statusCode === 200 && uploadRes.json?.count === 1;

    // Verify directly from disk file
    const diskContent = fs.readFileSync(ADMISSIONS_FILE, 'utf-8');
    const diskRecords = JSON.parse(diskContent);
    const diskMatches = diskRecords.length === 1 && diskRecords[0].minimumScore === 94.5;

    // Verify public /api/admissions returns the saved data
    const publicRes = await request({ path: '/api/admissions', method: 'GET' });
    const publicMatches = publicRes.json?.count === 1;

    console.log(`- استيراد وحفظ السجل عبر API: ${uploadSuccess ? 'ناجح' : 'فاشل'}`);
    console.log(`- تحقق السجل من ملف القرص admissions.json مباشرة: ${diskMatches ? 'ناجح' : 'فاشل'}`);
    console.log(`- تحقق قراءة واجهة الطلاب العامة: ${publicMatches ? 'ناجح' : 'فاشل'}`);

    results.push({
      name: 'Atomic Persistence & Server Disk Storage',
      passed: uploadSuccess && diskMatches && publicMatches,
    });
  } catch (err) {
    console.error('Test 4 error:', err);
    results.push({ name: 'Atomic Persistence & Server Disk Storage', passed: false });
  }

  // ---------------------------------------------------------
  // TEST 5: Backup Restoration, Integrity, Snapshot & Rollback
  // ---------------------------------------------------------
  console.log('\n--- الاختبار 5: استعادة النسخ الاحتياطية وسلامتها وإمكان التراجع ---');
  try {
    // 5a: Missing explicit confirmation
    const noConfirmRes = await request(
      {
        path: '/api/admin/restore-backup',
        method: 'POST',
        headers: {
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
        },
      },
      {}
    );
    const noConfirmRejected = noConfirmRes.statusCode === 400;
    console.log(`- رفض الاستعادة بدون تأكيد صريح: ${noConfirmRejected ? 'ناجح (400)' : 'فاشل'}`);

    // 5b: Corrupted JSON test (temporarily create corrupted backup)
    const originalBackup = fs.existsSync(BACKUP_FILE) ? fs.readFileSync(BACKUP_FILE, 'utf-8') : null;
    fs.writeFileSync(BACKUP_FILE, '{ corrupted_json: invalid syntax ... ]');

    const corruptRes = await request(
      {
        path: '/api/admin/restore-backup',
        method: 'POST',
        headers: {
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
        },
      },
      { confirm: true }
    );
    const corruptRejected = corruptRes.statusCode === 400 && corruptRes.json?.error?.includes('تالف');
    console.log(`- رفض ملف نسخة احتياطية تالف الصيغة: ${corruptRejected ? 'ناجح (400)' : 'فاشل'}`);

    // 5c: Invalid schema in backup (valid JSON, but missing required fields)
    fs.writeFileSync(BACKUP_FILE, JSON.stringify([{ invalid_key: 123 }]));
    const schemaRes = await request(
      {
        path: '/api/admin/restore-backup',
        method: 'POST',
        headers: {
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
        },
      },
      { confirm: true }
    );
    const schemaRejected = schemaRes.statusCode === 400 && schemaRes.json?.error?.includes('غير مطابقة');
    console.log(`- رفض ملف نسخة احتياطية ذو بنية غير مطابقة: ${schemaRejected ? 'ناجح (400)' : 'فاشل'}`);

    // 5d: Valid backup restoration and Pre-Restore Snapshot creation
    const validBackupRecords = [
      {
        id: 'backup_test_1',
        university: 'جامعة الموصل',
        college: 'كلية الهندسة',
        department: 'هندسة البرمجيات',
        minimumScore: 92.0,
        branch: 'علمي',
        gender: 'كلاهما',
        governorate: 'نينوى',
      },
      {
        id: 'backup_test_2',
        university: 'جامعة البصرة',
        college: 'كلية العلوم',
        department: 'علوم الحاسوب',
        minimumScore: 88.5,
        branch: 'علمي',
        gender: 'كلاهما',
        governorate: 'البصرة',
      },
    ];
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(validBackupRecords, null, 2));

    const validRestoreRes = await request(
      {
        path: '/api/admin/restore-backup',
        method: 'POST',
        headers: {
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
        },
      },
      { confirm: true }
    );
    const validRestoreSuccess = validRestoreRes.statusCode === 200 && validRestoreRes.json?.count === 2;
    const preRestoreExists = fs.existsSync(PRE_RESTORE_FILE);
    console.log(`- استعادة النسخة الاحتياطية الصالحة بنجاح: ${validRestoreSuccess ? 'ناجح (200 OK)' : 'فاشل'}`);
    console.log(`- أخذ لقطة أمان سابقة للاستبدال (pre_restore_backup): ${preRestoreExists ? 'ناجح' : 'فاشل'}`);

    // 5e: Rollback Restore verification
    const rollbackRes = await request(
      {
        path: '/api/admin/rollback-restore',
        method: 'POST',
        headers: {
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
        },
      },
      { confirm: true }
    );
    const rollbackSuccess = rollbackRes.statusCode === 200;
    const restoredDiskContent = JSON.parse(fs.readFileSync(ADMISSIONS_FILE, 'utf-8'));
    const rolledBackToPreState = restoredDiskContent.length === 1 && restoredDiskContent[0].university === 'جامعة بغداد التجريبية للأمن';
    console.log(`- التراجع عن الاستعادة وإعادة البيانات السابقة: ${rollbackSuccess && rolledBackToPreState ? 'ناجح' : 'فاشل'}`);

    // Restore original backup if existed
    if (originalBackup) {
      fs.writeFileSync(BACKUP_FILE, originalBackup);
    }

    results.push({
      name: 'Backup Restoration, Integrity Checks & Rollback',
      passed: noConfirmRejected && corruptRejected && schemaRejected && validRestoreSuccess && preRestoreExists && rollbackSuccess && rolledBackToPreState,
    });
  } catch (err) {
    console.error('Test 5 error:', err);
    results.push({ name: 'Backup Restoration, Integrity Checks & Rollback', passed: false });
  }

  // ---------------------------------------------------------
  // TEST 6: Login Rate Limiter Persistence & Multi-instance Analysis
  // ---------------------------------------------------------
  console.log('\n--- الاختبار 6: محدد محاولات الدخول وحفظ العدادات على القرص ---');
  try {
    // Generate failed login attempts with a distinct synthetic IP via X-Forwarded-For
    const testIp = '198.51.100.77';

    for (let i = 1; i <= 5; i++) {
      await request(
        {
          path: '/api/auth/login',
          method: 'POST',
          headers: {
            'X-Forwarded-For': testIp,
            'Content-Type': 'application/json',
            Origin: 'http://localhost:3000',
          },
        },
        { username: 'fake_user', password: 'wrong_password' }
      );
    }

    // 6th attempt should be blocked with 429
    const blockedRes = await request(
      {
        path: '/api/auth/login',
        method: 'POST',
        headers: {
          'X-Forwarded-For': testIp,
          'Content-Type': 'application/json',
          Origin: 'http://localhost:3000',
        },
      },
      { username: 'fake_user', password: 'wrong_password' }
    );

    const isBlocked = blockedRes.statusCode === 429;

    // Check persistence to RATE_LIMIT_FILE
    let rateLimitsSaved = false;
    if (fs.existsSync(RATE_LIMIT_FILE)) {
      const savedData = JSON.parse(fs.readFileSync(RATE_LIMIT_FILE, 'utf-8'));
      rateLimitsSaved = savedData[testIp]?.blockedUntil > Date.now();
    }

    console.log(`- قفل الحساب بعد 5 محاولات فاشلة: ${isBlocked ? 'ناجح (429 Too Many Requests)' : 'فاشل'}`);
    console.log(`- حفظ عدادات القفل في ملف القرص login_rate_limits.json: ${rateLimitsSaved ? 'ناجح' : 'فاشل'}`);

    // Clean up test IP from rate limits
    if (fs.existsSync(RATE_LIMIT_FILE)) {
      const savedData = JSON.parse(fs.readFileSync(RATE_LIMIT_FILE, 'utf-8'));
      delete savedData[testIp];
      fs.writeFileSync(RATE_LIMIT_FILE, JSON.stringify(savedData, null, 2));
    }

    results.push({
      name: 'Rate Limiter Lockout & Disk Persistence',
      passed: isBlocked && rateLimitsSaved,
    });
  } catch (err) {
    console.error('Test 6 error:', err);
    results.push({ name: 'Rate Limiter Lockout & Disk Persistence', passed: false });
  }

  // ---------------------------------------------------------
  // CLEANUP & RESTORATION
  // ---------------------------------------------------------
  if (fs.existsSync(PRISTINE_BACKUP)) {
    fs.copyFileSync(PRISTINE_BACKUP, ADMISSIONS_FILE);
    fs.unlinkSync(PRISTINE_BACKUP);
    console.log('\n[تنظيف أمان] تمت استعادة البيانات الأصلية للقبول بنجاح دون أي مساس.');
  }
  if (fs.existsSync(PRE_RESTORE_FILE)) {
    fs.unlinkSync(PRE_RESTORE_FILE);
  }

  console.log('\n=== ملخص نتائج الاختبارات الأمنية ===');
  let allPassed = true;
  for (const r of results) {
    console.log(`[${r.passed ? '✓ نجاح' : '✗ فشل'}] ${r.name}`);
    if (!r.passed) allPassed = false;
  }
  console.log(`\nالنتيجة النهائية: ${allPassed ? 'كافة الاختبارات نجحت بنسبة 100%' : 'توجد اختبارات غير مكتملة'}`);
}

runTests().catch(console.error);
