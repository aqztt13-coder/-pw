import { AdmissionRecord, MatchedAdmissionResult, ScoreMatchCategory } from '../types/admission';

/**
 * Helper to normalize Arabic characters for robust comparison
 */
export function normalizeArabic(text: string): string {
  if (!text) return '';
  return text
    .trim()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F]/g, ''); // Remove tashkeel/diacritics
}

/**
 * Checks if a candidate record matches the student's selected branch (علمي / أدبي)
 */
export function matchesBranch(recordBranch: string | undefined, selectedBranch: 'علمي' | 'أدبي'): boolean {
  if (!recordBranch || recordBranch === 'غير متوفر في البيانات' || recordBranch === 'عام' || recordBranch.includes('علمي وأدبي')) {
    return true;
  }

  const normRecord = normalizeArabic(recordBranch);
  const normSelected = normalizeArabic(selectedBranch);

  if (normSelected.includes('علمي')) {
    return (
      normRecord.includes('علمي') ||
      normRecord.includes('احيائي') ||
      normRecord.includes('تطبيقي')
    );
  }

  if (normSelected.includes('ادبي')) {
    return normRecord.includes('ادبي');
  }

  return true;
}

/**
 * Checks if a candidate record matches the student's gender (ذكر / أنثى)
 */
export function matchesGender(recordGender: string | undefined, selectedGender: 'ذكر' | 'أنثى'): boolean {
  if (
    !recordGender ||
    recordGender === 'غير متوفر في البيانات' ||
    recordGender === 'كلاهما' ||
    recordGender === 'مختلط' ||
    recordGender.includes('بنين وبنات')
  ) {
    return true;
  }

  const normRecord = normalizeArabic(recordGender);
  const normSelected = normalizeArabic(selectedGender);

  if (normSelected === 'ذكر') {
    // Exclude if exclusively for females
    if (normRecord.includes('انثي') || normRecord.includes('بنات') || normRecord.includes('اناث')) {
      return false;
    }
    return true;
  }

  if (normSelected === 'انثي') {
    // Exclude if exclusively for males
    if (normRecord.includes('ذكر') || normRecord.includes('بنين') || normRecord.includes('ذكور')) {
      return false;
    }
    return true;
  }

  return true;
}

/**
 * Matches and calculates exact decimal differences for all records against student score
 * Follows strict user ranking:
 * 1. Options where minimumScore > studentScore, sorted from closest to student score then ascending.
 * 2. Options where minimumScore == studentScore.
 * 3. Options where minimumScore is below student score by 3 to 5 degrees.
 */
export function matchAndRankAdmissions(
  records: AdmissionRecord[],
  studentScore: number,
  branchFilter: 'علمي' | 'أدبي',
  genderFilter: 'ذكر' | 'أنثى',
  includeOtherLowerScores = false
): MatchedAdmissionResult[] {
  // Validate score within 50 to 100 without showing this range on UI
  if (studentScore === null || isNaN(studentScore) || studentScore < 50 || studentScore > 100) {
    return [];
  }

  const results: MatchedAdmissionResult[] = [];

  for (const record of records) {
    // Only confirmed government central admission
    if (record.isAmbiguous) continue;

    if (!matchesBranch(record.branch, branchFilter)) continue;
    if (!matchesGender(record.gender, genderFilter)) continue;

    // Accurate decimal difference calculation
    const diff = Number((record.minimumScore - studentScore).toFixed(4));
    const diffRounded = Number(diff.toFixed(2));
    const diffAbs = Math.abs(diffRounded);

    let category: ScoreMatchCategory;
    let categoryRank: number;
    let displayDiffText = '';
    let statusBadge: MatchedAdmissionResult['statusBadge'];

    // Float tolerance for equality (e.g. 0.0001)
    if (diff > 0.0001) {
      // 1. الخيارات ذات الحدود الدنيا الأعلى من معدل الطالب
      category = 'higher';
      categoryRank = 1;
      displayDiffText = `الحد الأدنى أعلى من معدلك بمقدار (+${diffRounded.toFixed(2)}) درجة`;
      statusBadge = {
        label: 'الحد الأدنى أعلى من معدلك (تنافسي)',
        colorClass: 'text-amber-800',
        bgClass: 'bg-amber-50',
        borderClass: 'border-amber-200',
      };
    } else if (Math.abs(diff) <= 0.0001) {
      // 2. الخيارات التي يساوي حدها الأدنى معدل الطالب
      category = 'exact';
      categoryRank = 2;
      displayDiffText = 'الحد الأدنى مساوٍ لمعدلك تماماً (0.00)';
      statusBadge = {
        label: 'مطابق لمعدلك تماماً',
        colorClass: 'text-emerald-800',
        bgClass: 'bg-emerald-50',
        borderClass: 'border-emerald-200',
      };
    } else {
      // Below student score
      const belowAmount = Number((studentScore - record.minimumScore).toFixed(2));

      if (belowAmount >= 3.0 && belowAmount <= 5.0) {
        // 3. الخيارات التي يقل حدها الأدنى عن معدله بمقدار 3 إلى 5 درجات
        category = 'lower_3_to_5';
        categoryRank = 3;
        displayDiffText = `الحد الأدنى يقل عن معدلك بمقدار (-${belowAmount.toFixed(2)}) درجة`;
        statusBadge = {
          label: 'نطاق الأمان (يقل بـ 3 إلى 5 درجات)',
          colorClass: 'text-blue-800',
          bgClass: 'bg-blue-50',
          borderClass: 'border-blue-200',
        };
      } else {
        category = 'lower_other';
        categoryRank = 4;
        displayDiffText = `الحد الأدنى يقل عن معدلك بمقدار (-${belowAmount.toFixed(2)}) درجة`;
        statusBadge = {
          label: belowAmount < 3 ? 'يقل عن معدلك بأقل من 3 درجات' : 'يقل عن معدلك بأكثر من 5 درجات',
          colorClass: 'text-slate-700',
          bgClass: 'bg-slate-100',
          borderClass: 'border-slate-200',
        };
      }
    }

    if (category === 'lower_other' && !includeOtherLowerScores) {
      continue;
    }

    results.push({
      record,
      studentScore,
      diff: diffRounded,
      diffAbsolute: diffAbs,
      category,
      categoryRank,
      displayDiffText,
      statusBadge,
    });
  }

  // Exact sorting requirement:
  // 1. Category 1: higher than student score, sorted from closest to student score then ascending
  // 2. Category 2: exact match
  // 3. Category 3: lower by 3 to 5 degrees
  results.sort((a, b) => {
    if (a.categoryRank !== b.categoryRank) {
      return a.categoryRank - b.categoryRank;
    }

    if (a.category === 'higher') {
      // Closest to student score first (diff is positive, so smaller diff is closer)
      if (Math.abs(a.diff - b.diff) > 0.0001) {
        return a.diff - b.diff;
      }
    } else if (a.category === 'lower_3_to_5' || a.category === 'lower_other') {
      // Closest to 3 degrees first (higher minimumScore first)
      if (Math.abs(b.record.minimumScore - a.record.minimumScore) > 0.0001) {
        return b.record.minimumScore - a.record.minimumScore;
      }
    }

    // Secondary alphabetical order
    return a.record.university.localeCompare(b.record.university, 'ar');
  });

  return results;
}
