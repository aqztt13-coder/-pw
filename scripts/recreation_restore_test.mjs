// scripts/recreation_restore_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const ADMISSIONS_FILE = path.join(DATA_DIR, 'admissions.json');

// Safety backup of genuine data
const PRISTINE_BACKUP = path.join(DATA_DIR, 'admissions.pre_recreation_test.json');
fs.copyFileSync(ADMISSIONS_FILE, PRISTINE_BACKUP);

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

async function testOffContainerWorkflow() {
  console.log('--- بدء اختبار استعادة البيانات بملف محفوظ خارج الحاوية بعد إعادة إنشاء البيئة ---');

  // 1. Authenticate to get session cookie
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

  const cookie = (loginRes.headers['set-cookie']?.[0] || '').split(';')[0];

  // 2. Export data (simulating admin saving to local computer)
  const exportRes = await request({
    path: '/api/admin/export-data',
    method: 'GET',
    headers: { Cookie: cookie },
  });

  const downloadedData = JSON.parse(exportRes.body);
  console.log(`- تم تنزيل وحفظ النسخة الاحتياطية خارج الحاوية: ${downloadedData.length} سجلاً.`);

  // 3. Simulate container recreation: wipe local container admissions.json
  fs.writeFileSync(ADMISSIONS_FILE, JSON.stringify([], null, 2));
  const publicEmpty = await request({ path: '/api/admissions', method: 'GET' });
  console.log(`- محاكاة إعادة إنشاء الحاوية (القرص المحلي فارغ): عدد السجلات = ${publicEmpty.json?.count}`);

  // 4. Admin restores by uploading the off-container backup file to the recreated container
  const restoreUploadRes = await request(
    {
      path: '/api/admin/upload-data',
      method: 'POST',
      headers: {
        Cookie: cookie,
        Origin: 'http://localhost:3000',
        'Content-Type': 'application/json',
      },
    },
    { records: downloadedData }
  );

  console.log(`- استيراد واستعادة النسخة الخارجية في الحاوية المعاد إنشاؤها: رمز الاستجابة = ${restoreUploadRes.statusCode}, عدد السجلات المستعادة = ${restoreUploadRes.json?.count}`);

  // 5. Verify public API serving restored data
  const publicRestored = await request({ path: '/api/admissions', method: 'GET' });
  console.log(`- التحقق من واجهة الطلاب بعد الاستعادة: عدد السجلات المعروضة = ${publicRestored.json?.count}`);

  const passed =
    downloadedData.length === 950 &&
    publicEmpty.json?.count === 0 &&
    restoreUploadRes.statusCode === 200 &&
    publicRestored.json?.count === 950;

  console.log(`\nنتيجة اختبار الاستعادة خارج الحاوية: ${passed ? 'ناجح 100%' : 'فاشل'}`);

  // Cleanup & ensure pristine data
  fs.copyFileSync(PRISTINE_BACKUP, ADMISSIONS_FILE);
  fs.unlinkSync(PRISTINE_BACKUP);
}

testOffContainerWorkflow().catch(console.error);
