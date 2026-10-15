export type StudyBranch = 'علمي' | 'أدبي';
export type GenderType = 'ذكر' | 'أنثى';

export interface AdmissionRecord {
  id: string;
  university: string; // اسم الجامعة
  college: string; // الكلية
  department: string; // القسم
  governorate?: string; // المحافظة
  minimumScore: number; // الحد الأدنى للقبول (50 - 100)
  gender?: string; // الجنس المقبول
  branch?: string; // الفرع الدراسي (علمي أو أدبي)
  studyType?: string; // نوع الدراسة (حكومي)
  academicYear?: string; // سنة القبول (2025–2026)
  channel?: string; // قناة القبول (القبول المركزي)
  isAmbiguous?: boolean; // للمراجعة الإدارية
  ambiguityReason?: string;
  notes?: string;
}

export type ScoreMatchCategory =
  | 'higher' // الحد الأدنى أعلى من معدل الطالب
  | 'exact' // الحد الأدنى يساوي معدل الطالب
  | 'lower_3_to_5' // الحد الأدنى يقل عن معدل الطالب بـ 3 إلى 5 درجات
  | 'lower_other'; // أقل بفارق آخر

export interface MatchedAdmissionResult {
  record: AdmissionRecord;
  studentScore: number;
  diff: number; // minimumScore - studentScore
  diffAbsolute: number;
  category: ScoreMatchCategory;
  categoryRank: number; // 1 for higher, 2 for exact, 3 for lower_3_to_5, 4 for other
  displayDiffText: string;
  statusBadge: {
    label: string;
    colorClass: string;
    bgClass: string;
    borderClass: string;
  };
}

export interface AdminUser {
  username: string;
  role: 'admin';
  token: string;
}
