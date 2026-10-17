// scripts/final_limited_verification.mjs
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

// Preserve pristine data safely
const PRISTINE_BACKUP = path.join(DATA_DIR, 'admissions.pristine_final_backup.json');
if (fs.existsSync(ADMISSIONS_FILE)) {
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

async function runVerification() {
  console.log('====================================================');
  console.log('   بدء التحقق الأمني المحدود النهائي (FINAL AUDIT)   ');
  console.log('====================================================\n');

  const testResults = [];
  let adminCookie = '';

  // -------------------------------------------------------------------------
  // 1. فحص الكوكي والجلسة وإبطالها
  // -------------------------------------------------------------------------
  console.log('1. اختبار المصادقة والكوكيز وإبطال الجلسة:');
  try {
    // 1a: Login
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

    const tokenNotInJson = loginRes.json?.token === undefined && loginRes.json?.success === true;
    const setCookieHeader = loginRes.headers['set-cookie']?.[0] || '';
    const hasHttpOnly = setCookieHeader.includes('HttpOnly');
    const hasSameSite = setCookieHeader.includes('SameSite=Lax');

    if (setCookieHeader.includes('dalilak_admin_token=')) {
      adminCookie = setCookieHeader.split(';')[0];
    }

    // 1b: Verify active session with cookie
    const verifyRes = await request({
      path: '/api/auth/verify',
      method: 'GET',
      headers: { Cookie: adminCookie },
    });
    const sessionActive = verifyRes.statusCode === 200 && verifyRes.json?.authenticated === true;

    // 1c: Logout & Invalidation test
    const logoutRes = await request({
      path: '/api/auth/logout',
      method: 'POST',
      headers: {
        Cookie: adminCookie,
        Origin: 'http://localhost:3000',
      },
    });
    const logoutSuccess = logoutRes.statusCode === 200;

    // 1d: Attempt to verify again using the invalidated token
    const postLogoutVerify = await request({
      path: '/api/auth/verify',
      method: 'GET',
      headers: { Cookie: adminCookie },
    });
    const sessionRevoked = postLogoutVerify.statusCode === 401 && postLogoutVerify.json?.authenticated === false;

    const t1Passed = tokenNotInJson && hasHttpOnly && hasSameSite && sessionActive && logoutSuccess && sessionRevoked;
    console.log(`  - حجب رمز الجلسة عن JSON المتصفح: ${tokenNotInJson ? 'ناجح' : 'فاشل'}`);
    console.log(`  - ضبط كوكي HttpOnly و SameSite=Lax: ${hasHttpOnly && hasSameSite ? 'ناجح' : 'فاشل'}`);
    console.log(`  - التحقق من صلاحية الجلسة قبل تسجيل الخروج: ${sessionActive ? 'ناجح' : 'فاشل'}`);
    console.log(`  - إبطال الجلسة فعلياً في الخادم بعد تسجيل الخروج (401): ${sessionRevoked ? 'ناجح' : 'فاشل'}`);

    testResults.push({
      item: 'حماية الكوكي والجلسة وإبطالها عند الخروج',
      status: t1Passed ? 'ناجح' : 'فاشل',
    });

    // Re-login to obtain fresh cookie for subsequent tests
    const relogin = await request(
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
    adminCookie = (relogin.headers['set-cookie']?.[0] || '').split(';')[0];
  } catch (err) {
    console.error('Test 1 error:', err);
    testResults.push({ item: 'حماية الكوكي والجلسة وإبطالها عند الخروج', status: 'فاشل' });
  }

  // -------------------------------------------------------------------------
  // 2. اختبار CSRF والحصانة ضد تزوير Host و X-Forwarded-Host
  // -------------------------------------------------------------------------
  console.log('\n2. اختبار CSRF والحصانة ضد تزوير ترويسات Host و X-Forwarded-Host:');
  try {
    // 2a: Attacker supplies malicious Origin and matching malicious Host header
    const spoofedHostRes = await request({
      path: '/api/admin/delete-data',
      method: 'POST',
      headers: {
        Cookie: adminCookie,
        Origin: 'https://evil-attacker.com',
        Host: 'evil-attacker.com',
        'X-Forwarded-Host': 'evil-attacker.com',
        'Content-Type': 'application/json',
      },
    });
    const spoofedBlocked = spoofedHostRes.statusCode === 403;
    console.log(`  - رفض طلب تزوير Host خارجي غير موثوق (403 Forbidden): ${spoofedBlocked ? 'ناجح' : 'فاشل'}`);

    // 2b: Request with missing Origin/Referer on modifying endpoint
    const missingOriginRes = await request({
      path: '/api/admin/delete-data',
      method: 'POST',
      headers: {
        Cookie: adminCookie,
        'Content-Type': 'application/json',
      },
    });
    const missingBlocked = missingOriginRes.statusCode === 403;
    console.log(`  - رفض طلب معدّل يفتقر لترويسة Origin/Referer (403): ${missingBlocked ? 'ناجح' : 'فاشل'}`);

    // 2c: Legitimate Cloud Run domain in trusted whitelist
    const cloudRunOriginRes = await request({
      path: '/api/admin/delete-data',
      method: 'POST',
      headers: {
        Cookie: adminCookie,
        Origin: 'https://ais-dev-ixsieqp3p2c2qehr7ezffa-289108455683.europe-west2.run.app',
        'Content-Type': 'application/json',
      },
    });
    const cloudRunAllowed = cloudRunOriginRes.statusCode === 200;
    console.log(`  - قبول نطاق تطبيق Cloud Run المعتمد في القائمة الموثوقة (200 OK): ${cloudRunAllowed ? 'ناجح' : 'فاشل'}`);

    const t2Passed = spoofedBlocked && missingBlocked && cloudRunAllowed;
    testResults.push({
      item: 'حماية CSRF الصارمة ضد التزوير واقتصارها على النطاقات الموثوقة',
      status: t2Passed ? 'ناجح' : 'فاشل',
    });
  } catch (err) {
    console.error('Test 2 error:', err);
    testResults.push({ item: 'حماية CSRF الصارمة ضد التزوير واقتصارها على النطاقات الموثوقة', status: 'فاشل' });
  }

  // -------------------------------------------------------------------------
  // 3. فحص النسخ الاحتياطي والتحقق من كل سجل وإمكان التنزيل
  // -------------------------------------------------------------------------
  console.log('\n3. اختبار استعادة النسخ الاحتياطية وفحص كل سجل وإمكان التنزيل:');
  try {
    // 3a: Backup containing an invalid score inside an inner record (record #3 is invalid)
    const partialInvalidBackup = [
      { id: '1', university: 'جامعة بغداد', college: 'طب', minimumScore: 99.5 },
      { id: '2', university: 'جامعة الموصل', college: 'هندسة', minimumScore: 90.0 },
      { id: '3', university: 'جامعة البصرة', college: 'علوم', minimumScore: 199.0 }, // Invalid score > 105
    ];
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(partialInvalidBackup, null, 2));

    const invalidRestoreRes = await request(
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
    const innerRecordRejected =
      invalidRestoreRes.statusCode === 400 &&
      invalidRestoreRes.json?.error?.includes('السجل رقم 3');
    console.log(`  - فحص كل سجل ورفض السجل رقم 3 غير المطابق (400): ${innerRecordRejected ? 'ناجح' : 'فاشل'}`);

    // 3b: Corrupted JSON test
    fs.writeFileSync(BACKUP_FILE, '{ invalid: corrupt json syntax ...');
    const corruptRestoreRes = await request(
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
    const corruptRejected = corruptRestoreRes.statusCode === 400;
    console.log(`  - رفض ملف نسخة احتياطية تالف الصياغة (400): ${corruptRejected ? 'ناجح' : 'فاشل'}`);

    // 3c: Valid backup restore & rollback test
    const validTestRecords = [
      { id: 't1', university: 'جامعة بغداد التجريبية', college: 'علوم الحاسوب', minimumScore: 91.0 },
      { id: 't2', university: 'جامعة المستنصرية التجريبية', college: 'هندسة البرمجيات', minimumScore: 89.5 },
    ];
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(validTestRecords, null, 2));

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
    const restoreSuccess = validRestoreRes.statusCode === 200 && validRestoreRes.json?.count === 2;
    const snapshotCreated = fs.existsSync(PRE_RESTORE_FILE);
    console.log(`  - استعادة نسخة سليمة وتأكيد سلامة جميع سجلاتها: ${restoreSuccess ? 'ناجح' : 'فاشل'}`);
    console.log(`  - إنشاء لقطة أمان سابقة للاستبدال pre_restore_backup: ${snapshotCreated ? 'ناجح' : 'فاشل'}`);

    // 3d: Rollback test
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
    console.log(`  - التراجع الفوري عن الاستعادة وإرجاع الحالة السابقة: ${rollbackSuccess ? 'ناجح' : 'فاشل'}`);

    // 3e: Downloadable backup & export endpoints
    const exportRes = await request({
      path: '/api/admin/export-data',
      method: 'GET',
      headers: { Cookie: adminCookie },
    });
    const exportHasAttachment =
      exportRes.statusCode === 200 &&
      exportRes.headers['content-disposition']?.includes('attachment');

    const downloadBackupRes = await request({
      path: '/api/admin/download-backup',
      method: 'GET',
      headers: { Cookie: adminCookie },
    });
    const backupHasAttachment =
      downloadBackupRes.statusCode === 200 &&
      downloadBackupRes.headers['content-disposition']?.includes('attachment');

    console.log(`  - تنزيل وتصدير البيانات كملف مرفق خارج الحاوية: ${exportHasAttachment ? 'ناجح' : 'فاشل'}`);
    console.log(`  - تنزيل النسخة الاحتياطية كملف مرفق خارج الحاوية: ${backupHasAttachment ? 'ناجح' : 'فاشل'}`);

    const t3Passed =
      innerRecordRejected &&
      corruptRejected &&
      restoreSuccess &&
      snapshotCreated &&
      rollbackSuccess &&
      exportHasAttachment &&
      backupHasAttachment;

    testResults.push({
      item: 'فحص كل سجل في النسخة الاحتياطية وإتاحة التنزيل والتراجع',
      status: t3Passed ? 'ناجح' : 'فاشل',
    });
  } catch (err) {
    console.error('Test 3 error:', err);
    testResults.push({ item: 'فحص كل سجل في النسخة الاحتياطية وإتاحة التنزيل والتراجع', status: 'فاشل' });
  }

  // -------------------------------------------------------------------------
  // 4. اختبار محدد محاولات الدخول وحفظه على القرص
  // -------------------------------------------------------------------------
  console.log('\n4. اختبار محدد محاولات تسجيل الدخول وحفظه محلياً:');
  try {
    const testIp = '198.51.100.99';
    for (let i = 1; i <= 5; i++) {
      await request(
        {
          path: '/api/auth/login',
          method: 'POST',
          headers: {
            'X-Forwarded-For': testIp,
            Origin: 'http://localhost:3000',
            'Content-Type': 'application/json',
          },
        },
        { username: 'fake', password: 'wrong' }
      );
    }

    const lockedRes = await request(
      {
        path: '/api/auth/login',
        method: 'POST',
        headers: {
          'X-Forwarded-For': testIp,
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
        },
      },
      { username: 'fake', password: 'wrong' }
    );
    const isLocked = lockedRes.statusCode === 429;
    console.log(`  - قفل الـ IP بعد 5 محاولات خاطئة (429 Too Many Requests): ${isLocked ? 'ناجح' : 'فاشل'}`);

    testResults.push({
      item: 'محدد محاولات تسجيل الدخول المحلي (Single-Instance)',
      status: isLocked ? 'ناجح' : 'فاشل',
    });

    // Cleanup rate limit test IP
    if (fs.existsSync(RATE_LIMIT_FILE)) {
      const data = JSON.parse(fs.readFileSync(RATE_LIMIT_FILE, 'utf-8'));
      delete data[testIp];
      fs.writeFileSync(RATE_LIMIT_FILE, JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error('Test 4 error:', err);
    testResults.push({ item: 'محدد محاولات تسجيل الدخول المحلي (Single-Instance)', status: 'فاشل' });
  }

  // -------------------------------------------------------------------------
  // استعادة البيانات الأصلية بنسبة 100%
  // -------------------------------------------------------------------------
  if (fs.existsSync(PRISTINE_BACKUP)) {
    fs.copyFileSync(PRISTINE_BACKUP, ADMISSIONS_FILE);
    fs.unlinkSync(PRISTINE_BACKUP);
  }
  if (fs.existsSync(PRE_RESTORE_FILE)) {
    fs.unlinkSync(PRE_RESTORE_FILE);
  }

  console.log('\n====================================================');
  console.log('                 جدول النتائج النهائي                 ');
  console.log('====================================================');
  testResults.forEach((t) => {
    console.log(`[${t.status}] ${t.item}`);
  });
}

runVerification().catch(console.error);
