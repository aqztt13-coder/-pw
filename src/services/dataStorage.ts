import { AdmissionRecord } from '../types/admission';
import initialDefaultData from '../data/centralAdmissionData.json';

const STORAGE_KEY = 'dalilak_university_records_v1';
const REVIEW_STORAGE_KEY = 'dalilak_review_records_v1';

export interface DataLoadResult {
  records: AdmissionRecord[];
  reviewRecords: AdmissionRecord[];
  sourceName: string;
  totalParsed: number;
  duplicateCount: number;
}

/**
 * Normalizes input text strings, trims extra spaces, guards against formula injection
 */
export function cleanText(val: unknown, maxLength = 250): string {
  if (val === null || val === undefined) return 'غير متوفر في البيانات';
  let str = String(val).trim();
  if (str.length === 0) return 'غير متوفر في البيانات';

  // Bound string length
  if (str.length > maxLength) {
    str = str.substring(0, maxLength);
  }
  return str;
}

/**
 * Escapes values for CSV/Spreadsheet exports to prevent Formula Injection (CWE-1236)
 * without mutating canonical source data in storage.
 */
export function escapeSpreadsheetCell(val: string): string {
  if (!val) return '';
  if (/^[=+\-@\t\r]/.test(val)) {
    return "'" + val;
  }
  return val;
}

/**
 * Parses numeric score safely
 */
export function parseScore(val: unknown): number | null {
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
 * Validates and transforms raw incoming JSON or array items into official AdmissionRecords
 */
export function parseAndValidateRawData(rawList: unknown[]): {
  validRecords: AdmissionRecord[];
  reviewRecords: AdmissionRecord[];
  duplicates: number;
} {
  const validRecords: AdmissionRecord[] = [];
  const reviewRecords: AdmissionRecord[] = [];
  const seenSignatures = new Set<string>();
  let duplicates = 0;

  if (!Array.isArray(rawList)) {
    return { validRecords, reviewRecords, duplicates };
  }

  rawList.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const obj = item as Record<string, unknown>;

    // Flexible key mapping for Arabic / English JSON keys
    const university = cleanText(
      obj['university'] ?? obj['الجامعة'] ?? obj['اسم الجامعة'] ?? obj['جامعة']
    );
    const college = cleanText(
      obj['college'] ?? obj['الكلية'] ?? obj['اسم الكلية'] ?? obj['كلية']
    );
    const department = cleanText(
      obj['department'] ?? obj['القسم'] ?? obj['اسم القسم'] ?? obj['قسم'] ?? obj['الفرع / القسم']
    );
    const governorate = cleanText(
      obj['governorate'] ?? obj['المحافظة'] ?? obj['محافظة'] ?? obj['المدينة']
    );
    const rawScore =
      obj['minimumScore'] ??
      obj['الحد الأدنى'] ??
      obj['الحد الادنى'] ??
      obj['المعدل'] ??
      obj['معدل القبول'] ??
      obj['معدل'] ??
      obj['score'];
    const rawGender =
      obj['gender'] ?? obj['الجنس'] ?? obj['جنس المقبولين'] ?? obj['نوع الجنس'];
    const rawBranch =
      obj['branch'] ?? obj['الفرع'] ?? obj['الفرع الدراسي'] ?? obj['فرع'];
    const notes = cleanText(obj['notes'] ?? obj['ملاحظات'] ?? obj['ملاحظة']);

    const minimumScore = parseScore(rawScore);

    let genderStr = cleanText(rawGender);
    if (genderStr === 'غير متوفر في البيانات') {
      genderStr = 'كلاهما'; // Standard default in Iraqi Central Admission if unspecified
    }

    let branchStr = cleanText(rawBranch);
    if (branchStr === 'غير متوفر في البيانات') {
      branchStr = 'عام';
    }

    const uniqueId = String(
      obj['id'] || `adm_${index + 1}_${Math.random().toString(36).substring(2, 7)}`
    );

    // Check duplicate signature
    const signature = `${university}__${college}__${department}__${minimumScore}__${branchStr}__${genderStr}`;
    if (seenSignatures.has(signature)) {
      duplicates++;
    } else {
      seenSignatures.add(signature);
    }

    // Validation rule: score must be between 50 and 105 (allowing for Iraqi bonus additions)
    const isScoreInvalid = minimumScore === null || minimumScore < 50 || minimumScore > 105;
    const isNameAmbiguous =
      university === 'غير متوفر في البيانات' ||
      college === 'غير متوفر في البيانات';

    if (isScoreInvalid || isNameAmbiguous) {
      // Exclude from confirmed results and mark for Administrative Review
      let reason = '';
      if (isScoreInvalid) {
        reason += `الحد الأدنى (${rawScore ?? 'مفقود'}) خارج النطاق الرسمي 50-105 أو غير محدد. `;
      }
      if (isNameAmbiguous) {
        reason += 'اسم الجامعة أو الكلية مفقود في النص المصدر.';
      }

      reviewRecords.push({
        id: uniqueId,
        university,
        college,
        department,
        governorate: governorate !== 'غير متوفر في البيانات' ? governorate : undefined,
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
        id: uniqueId,
        university,
        college,
        department,
        governorate: governorate !== 'غير متوفر في البيانات' ? governorate : undefined,
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

  return { validRecords, reviewRecords, duplicates };
}

/**
 * Loads admission records from LocalStorage or the bundled JSON file
 */
export function getSavedAdmissionData(): DataLoadResult {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const { validRecords, reviewRecords, duplicates } = parseAndValidateRawData(parsed);
        return {
          records: validRecords,
          reviewRecords,
          sourceName: 'الذاكرة المحلية للتطبيق (تم حفظها مسبقاً)',
          totalParsed: parsed.length,
          duplicateCount: duplicates,
        };
      }
    }
  } catch (err) {
    console.error('Error reading localStorage data:', err);
  }

  // Fallback to bundled JSON
  const initialList = initialDefaultData as unknown[];
  const { validRecords, reviewRecords, duplicates } = parseAndValidateRawData(initialList);

  return {
    records: validRecords,
    reviewRecords,
    sourceName: 'ملف البيانات المرفق بالمنظومة',
    totalParsed: initialList.length,
    duplicateCount: duplicates,
  };
}

/**
 * Saves uploaded JSON records directly to local storage for offline use
 */
export function saveAdmissionDataLocally(rawList: unknown[]): {
  success: boolean;
  count: number;
  reviewCount: number;
  duplicateCount: number;
} {
  const { validRecords, reviewRecords, duplicates } = parseAndValidateRawData(rawList);
  const combined = [...validRecords, ...reviewRecords];

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(combined));
    localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(reviewRecords));
    return {
      success: true,
      count: validRecords.length,
      reviewCount: reviewRecords.length,
      duplicateCount: duplicates,
    };
  } catch (err) {
    console.error('Failed to save to localStorage:', err);
    return {
      success: false,
      count: 0,
      reviewCount: 0,
      duplicateCount: 0,
    };
  }
}

/**
 * Clears local custom storage and resets
 */
export function resetToBundledData(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(REVIEW_STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear storage:', err);
  }
}
