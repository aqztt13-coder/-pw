import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const universityGovMap = {
  'جامعة بغداد': 'بغداد',
  'جامعة النهرين': 'بغداد',
  'الجامعة المستنصرية': 'بغداد',
  'الجامعة العراقية': 'بغداد',
  'الجامعة التكنولوجية': 'بغداد',
  'جامعة تكنولوجيا المعلومات والاتصالات': 'بغداد',
  'جامعة ابن سينا للعلوم الطبية والصيدلانية': 'بغداد',
  'جامعة الكرخ للعلوم': 'بغداد',
  'جامعة البصرة': 'البصرة',
  'جامعة البصرة للنفط والغاز': 'البصرة',
  'جامعة الموصل': 'نينوى',
  'جامعة نينوى': 'نينوى',
  'جامعة الحمدانية': 'نينوى',
  'جامعة تلعفر': 'نينوى',
  'جامعة كركوك': 'كركوك',
  'جامعة تكريت': 'صلاح الدين',
  'جامعة سامراء': 'صلاح الدين',
  'جامعة الانبار': 'الانبار',
  'جامعة الفلوجة': 'الانبار',
  'جامعة ديالى': 'ديالى',
  'جامعة واسط': 'واسط',
  'جامعة بابل': 'بابل',
  'جامعة القاسم الخضراء': 'بابل',
  'جامعة كربلاء': 'كربلاء',
  'جامعة الكوفة': 'النجف',
  'جامعة جابر بن حيان للعلوم الطبية والصيدلانية': 'النجف',
  'جامعة القادسية': 'القادسية',
  'جامعة المثنى': 'المثنى',
  'جامعة ذي قار': 'ذي قار',
  'جامعة سومر': 'ذي قار',
  'جامعة الشطرة': 'ذي قار',
  'جامعة ميسان': 'ميسان'
};

const locationGovMap = {
  'بغداد': 'بغداد',
  'الخوارزمي': 'بغداد',
  'ابن الهيثم': 'بغداد',
  'الطارمية': 'بغداد',
  'الرصافة': 'بغداد',
  'الكرخ': 'بغداد',
  'المنصور': 'بغداد',
  'الزعفرانية': 'بغداد',
  'البصرة': 'البصرة',
  'القرنة': 'البصرة',
  'الموصل': 'نينوى',
  'الحدباء': 'نينوى',
  'كركوك': 'كركوك',
  'الحويجة': 'كركوك',
  'تكريت': 'صلاح الدين',
  'سامراء': 'صلاح الدين',
  'بلد': 'صلاح الدين',
  'الشرقاط': 'صلاح الدين',
  'طوزخورماتو': 'صلاح الدين',
  'الدور': 'صلاح الدين',
  'الانبار': 'الانبار',
  'الرمادي': 'الانبار',
  'الفلوجة': 'الانبار',
  'هيت': 'الانبار',
  'حديثة': 'الانبار',
  'القائم': 'الانبار',
  'ديالى': 'ديالى',
  'بعقوبة': 'ديالى',
  'المقدادية': 'ديالى',
  'خانقين': 'ديالى',
  'بلدروز': 'ديالى',
  'واسط': 'واسط',
  'الكوت': 'واسط',
  'الحي': 'واسط',
  'الصويرة': 'واسط',
  'العزيزية': 'واسط',
  'بابل': 'بابل',
  'الحلة': 'بابل',
  'المسيب': 'بابل',
  'كربلاء': 'كربلاء',
  'النجف': 'النجف',
  'الكوفة': 'النجف',
  'القادسية': 'القادسية',
  'الديوانية': 'القادسية',
  'المثنى': 'المثنى',
  'السماوة': 'المثنى',
  'الرميثة': 'المثنى',
  'ذي قار': 'ذي قار',
  'الناصرية': 'ذي قار',
  'الشطرة': 'ذي قار',
  'سوق الشيوخ': 'ذي قار',
  'الدواية': 'ذي قار',
  'ميسان': 'ميسان',
  'العمارة': 'ميسان'
};

const chunkFiles = [
  path.join(rootDir, 'data/chunk_1_to_250.json'),
  path.join(rootDir, 'data/chunk_251_to_450.json'),
  path.join(rootDir, 'data/chunk_451_to_650.json'),
  path.join(rootDir, 'data/chunk_651_to_850.json'),
  path.join(rootDir, 'data/chunk_851_to_950.json')
];

let rawChunks = [];
for (const file of chunkFiles) {
  if (fs.existsSync(file)) {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    rawChunks = rawChunks.concat(data);
  }
}

console.log(`Loaded ${rawChunks.length} raw chunk items.`);

const validRecords = [];
const seenSignatures = new Set();
let duplicates = 0;

for (const item of rawChunks) {
  const university = item.university ? item.university.trim() : 'غير متوفر في البيانات';
  const college = item.college ? item.college.trim() : 'غير متوفر في البيانات';
  const department = item.department && item.department.trim() ? item.department.trim() : 'عام / القبول بالكلية';
  
  let gov = 'غير متوفر في البيانات';
  if (item.location_or_unit && locationGovMap[item.location_or_unit.trim()]) {
    gov = locationGovMap[item.location_or_unit.trim()];
  } else if (universityGovMap[university]) {
    gov = universityGovMap[university];
  } else if (university.includes('التقنية الوسطى')) {
    gov = 'بغداد';
  } else if (university.includes('التقنية الجنوبية')) {
    gov = 'البصرة';
  } else if (university.includes('الفرات الاوسط')) {
    gov = 'النجف';
  } else if (university.includes('التقنية الشمالية')) {
    gov = 'نينوى';
  }

  let gender = 'كلاهما';
  if (item.gender) {
    const g = item.gender.trim();
    if (g === 'مختلط' || g === 'كلاهما') gender = 'كلاهما';
    else if (g === 'ذكر' || g.includes('بنين') || g.includes('ذكور')) gender = 'ذكر';
    else if (g === 'انثى' || g === 'أنثى' || g.includes('بنات') || g.includes('إناث')) gender = 'أنثى';
  }

  let branch = 'علمي';
  if (item.track) {
    const t = item.track.trim();
    if (t === 'ادبي' || t === 'أدبي') branch = 'أدبي';
    else if (t === 'علمي' || t.includes('إحيائي') || t.includes('تطبيقي')) branch = 'علمي';
    else branch = t;
  }

  const minimumScore = Number(Number(item.average).toFixed(2));
  const id = String(item.id || validRecords.length + 1);

  const sig = `${university}__${college}__${department}__${minimumScore}__${branch}__${gender}`;
  if (seenSignatures.has(sig)) {
    duplicates++;
  } else {
    seenSignatures.add(sig);
  }

  validRecords.push({
    id,
    university,
    college,
    department,
    governorate: gov,
    minimumScore,
    gender,
    branch,
    studyType: 'حكومي',
    academicYear: '2025–2026',
    channel: 'القبول المركزي',
    isAmbiguous: false,
    notes: item.location_or_unit ? `الموقع / التشكيل: ${item.location_or_unit}` : undefined
  });
}

console.log(`Processed ${validRecords.length} records with ${duplicates} duplicate signatures.`);

// Sort by minimumScore descending
validRecords.sort((a, b) => b.minimumScore - a.minimumScore);

const admissionsFile = path.join(rootDir, 'data/admissions.json');
const metaFile = path.join(rootDir, 'data/admissions_meta.json');
const clientDataFile = path.join(rootDir, 'src/data/centralAdmissionData.json');

fs.writeFileSync(admissionsFile, JSON.stringify(validRecords, null, 2), 'utf-8');
console.log(`Wrote to ${admissionsFile}`);

const metadata = {
  totalRecords: validRecords.length,
  reviewRecords: 0,
  duplicateCount: duplicates,
  lastUpdated: new Date().toISOString()
};
fs.writeFileSync(metaFile, JSON.stringify(metadata, null, 2), 'utf-8');
console.log(`Wrote to ${metaFile}`);

fs.writeFileSync(clientDataFile, JSON.stringify(validRecords, null, 2), 'utf-8');
console.log(`Wrote to ${clientDataFile}`);
