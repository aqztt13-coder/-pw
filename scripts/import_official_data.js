import fs from 'fs';
import path from 'path';

// University to Governorate mapper for Iraq public universities
const uniGovMap = {
  'جامعة بغداد': 'بغداد',
  'الجامعة المستنصرية': 'بغداد',
  'الجامعة التكنولوجية': 'بغداد',
  'الجامعة العراقية': 'بغداد',
  'جامعة النهرين': 'بغداد',
  'جامعة ابن سينا للعلوم الطبية والصيدلانية': 'بغداد',
  'جامعة الكرخ للعلوم': 'بغداد',
  'جامعة تكنولوجيا المعلومات والاتصالات': 'بغداد',
  'الجامعة التقنية الوسطى': 'بغداد',
  'جامعة البصرة': 'البصرة',
  'جامعة البصرة للنفط والغاز': 'البصرة',
  'الجامعة التقنية الجنوبية': 'البصرة',
  'جامعة الموصل': 'نينوى',
  'جامعة نينوى': 'نينوى',
  'جامعة الحمدانية': 'نينوى',
  'جامعة تلعفر': 'نينوى',
  'الجامعة التقنية الشمالية': 'كركوك / نينوى',
  'جامعة كركوك': 'كركوك',
  'جامعة تكريت': 'صلاح الدين',
  'جامعة سامراء': 'صلاح الدين',
  'جامعة ديالى': 'ديالى',
  'جامعة الانبار': 'الانبار',
  'جامعة الفلوجة': 'الانبار',
  'جامعة بابل': 'بابل',
  'جامعة القاسم الخضراء': 'بابل',
  'جامعة كربلاء': 'كربلاء',
  'جامعة الكوفة': 'النجف',
  'جامعة جابر بن حيان للعلوم الطبية والصيدلانية': 'النجف',
  'جامعة الفرات الاوسط التقنية': 'النجف / بابل',
  'جامعة القادسية': 'الديوانية',
  'جامعة واسط': 'واسط',
  'جامعة ذي قار': 'ذي قار',
  'جامعة سومر': 'ذي قار',
  'جامعة الشطرة': 'ذي قار',
  'جامعة ميسان': 'ميسان',
  'جامعة المثنى': 'المثنى',
};

// We will load the raw input from a data source or read raw
export function mapRawRecord(raw) {
  const university = (raw.university || 'غير متوفر في البيانات').trim();
  const college = (raw.college || 'غير متوفر في البيانات').trim();
  const department = raw.department ? raw.department.trim() : 'غير متوفر في البيانات';

  // Determine governorate
  let governorate = 'غير متوفر في البيانات';
  if (uniGovMap[university]) {
    governorate = uniGovMap[university];
  } else if (raw.location_or_unit) {
    governorate = raw.location_or_unit;
  }

  // Score
  const minimumScore = typeof raw.average === 'number' ? Number(raw.average.toFixed(2)) : parseFloat(raw.average);

  // Gender normalization: "مختلط" -> "كلاهما", "انثى" -> "أنثى", "ذكر" -> "ذكر"
  let gender = 'كلاهما';
  if (raw.gender === 'انثى' || raw.gender === 'أنثى') {
    gender = 'أنثى';
  } else if (raw.gender === 'ذكر') {
    gender = 'ذكر';
  } else if (raw.gender === 'مختلط') {
    gender = 'كلاهما';
  }

  // Branch normalization: "علمي", "ادبي" -> "أدبي", "فنون"
  let branch = 'علمي';
  if (raw.track === 'ادبي' || raw.track === 'أدبي') {
    branch = 'أدبي';
  } else if (raw.track === 'علمي') {
    branch = 'علمي';
  } else if (raw.track === 'فنون') {
    branch = 'فنون';
  }

  const notesList = [];
  if (raw.location_or_unit) notesList.push(`الموقع: ${raw.location_or_unit}`);
  if (raw.provincial_quota) notesList.push('قبول خاص بأبناء المحافظة');
  if (raw.total) notesList.push(`المجموع: ${raw.total}`);

  return {
    id: `adm_${raw.id}`,
    university,
    college,
    department,
    governorate,
    minimumScore,
    gender,
    branch,
    studyType: 'حكومي',
    academicYear: '2025–2026',
    channel: 'القبول المركزي',
    isAmbiguous: isNaN(minimumScore) || minimumScore < 50,
    ambiguityReason: (isNaN(minimumScore) || minimumScore < 50) ? 'المعدل أقل من 50 أو غير محدد' : undefined,
    notes: notesList.length > 0 ? notesList.join(' • ') : undefined,
  };
}
