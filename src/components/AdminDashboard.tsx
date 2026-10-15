import React, { useState, useEffect } from 'react';
import {
  Database,
  Upload,
  FileCheck,
  AlertTriangle,
  CheckCircle2,
  LogOut,
  RefreshCw,
  Eye,
  Trash2,
  Table,
  ShieldCheck,
  Layers,
  ArrowRight,
  FileText,
  AlertCircle
} from 'lucide-react';
import {
  adminLogout,
  uploadAdmissionRecords,
  fetchAdminDataSummary,
  deleteAdmissionRecords,
  fetchAdmissionRecords
} from '../services/apiClient';
import { AdmissionRecord } from '../types/admission';

interface AdminDashboardProps {
  onLogout: () => void;
  onDataChanged: () => void;
  onClose: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onLogout,
  onDataChanged,
  onClose,
}) => {
  const [summary, setSummary] = useState<{
    count: number;
    reviewCount: number;
    duplicateCount: number;
    lastUpdated: string | null;
    reviewRecords: AdmissionRecord[];
  }>({
    count: 0,
    reviewCount: 0,
    duplicateCount: 0,
    lastUpdated: null,
    reviewRecords: [],
  });

  const [activeTab, setActiveTab] = useState<'upload' | 'current' | 'review'>('upload');
  const [jsonInput, setJsonInput] = useState<string>('');
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  // Pre-import preview state
  const [parsedPreviewList, setParsedPreviewList] = useState<any[] | null>(null);
  const [previewStats, setPreviewStats] = useState<{
    total: number;
    valid: number;
    errors: number;
    duplicates: number;
  } | null>(null);

  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const [mergeWithExisting, setMergeWithExisting] = useState<boolean>(false);

  const loadSummary = async () => {
    const data = await fetchAdminDataSummary();
    if (data.success) {
      setSummary({
        count: data.count,
        reviewCount: data.reviewCount,
        duplicateCount: data.duplicateCount,
        lastUpdated: data.lastUpdated,
        reviewRecords: data.reviewRecords || [],
      });
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  // Pre-analyze raw items
  const analyzeData = (items: any[]) => {
    let valid = 0;
    let errors = 0;
    let duplicates = 0;
    const seen = new Set<string>();

    items.forEach((item) => {
      if (!item || typeof item !== 'object') {
        errors++;
        return;
      }

      const uni = String(item['university'] ?? item['الجامعة'] ?? '').trim();
      const col = String(item['college'] ?? item['الكلية'] ?? '').trim();
      const dep = String(item['department'] ?? item['القسم'] ?? '').trim();
      const rawScore = item['minimumScore'] ?? item['الحد الأدنى'] ?? item['المعدل'] ?? item['score'];
      const score = typeof rawScore === 'number' ? rawScore : parseFloat(String(rawScore).replace(',', '.'));

      const isScoreValid = !isNaN(score) && score >= 50 && score <= 100;
      const hasNames = uni.length > 0 && col.length > 0 && dep.length > 0;

      const sig = `${uni}__${col}__${dep}__${score}`;
      if (seen.has(sig)) {
        duplicates++;
      } else {
        seen.add(sig);
      }

      if (isScoreValid && hasNames) {
        valid++;
      } else {
        errors++;
      }
    });

    setParsedPreviewList(items);
    setPreviewStats({
      total: items.length,
      valid,
      errors,
      duplicates,
    });
  };

  // Handle File Input
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStatusMessage(null);
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) {
          throw new Error('يجب أن يحتوي الملف على مصفوفة من السجلات (Array [ { ... } ]).');
        }
        analyzeData(parsed);
        setStatusMessage({
          type: 'info',
          text: `تم فحص الملف «${file.name}». يمكنك معاينة البيانات أدناه قبل إتمام الحفظ الدائم.`,
        });
      } catch (err: any) {
        setStatusMessage({
          type: 'error',
          text: `خطأ في قراءة ملف JSON: ${err.message}`,
        });
        setParsedPreviewList(null);
        setPreviewStats(null);
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  // Handle Text/Paste Analysis
  const handleTextAnalyze = () => {
    setStatusMessage(null);
    if (!jsonInput.trim()) {
      setStatusMessage({ type: 'error', text: 'يرجى لصق نص الـ JSON أولاً.' });
      return;
    }
    try {
      const parsed = JSON.parse(jsonInput.trim());
      if (!Array.isArray(parsed)) {
        throw new Error('يجب أن يكون النص مصفوفة سجلات [ { ... } ].');
      }
      setSelectedFileName('نص ملصوق يدوياً');
      analyzeData(parsed);
      setStatusMessage({
        type: 'info',
        text: 'تم فحص النص المدخل بنجاح. راجع المعاينة والإحصائيات قبل الاستيراد.',
      });
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `صيغة JSON غير صالحة: ${err.message}`,
      });
    }
  };

  // Execute Permanent Import to Server
  const handleExecuteImport = async () => {
    if (!parsedPreviewList || parsedPreviewList.length === 0) {
      setStatusMessage({ type: 'error', text: 'لا توجد بيانات جاهزة للاستيراد.' });
      return;
    }

    setIsUploading(true);
    setStatusMessage(null);

    try {
      let finalPayload = parsedPreviewList;
      if (mergeWithExisting) {
        // Fetch current records and merge
        const currentData = await fetchAdmissionRecords();
        if (currentData.success && currentData.records.length > 0) {
          finalPayload = [...currentData.records, ...parsedPreviewList];
        }
      }

      const res = await uploadAdmissionRecords(finalPayload);
      if (res.success) {
        setStatusMessage({
          type: 'success',
          text: `تم استيراد وحفظ ${res.count} سجلاً بصورة دائمة في الخادم بنجاح! ${
            res.reviewCount > 0 ? `(${res.reviewCount} سجل للمراجعة الإدارية)` : ''
          }`,
        });
        setParsedPreviewList(null);
        setPreviewStats(null);
        setJsonInput('');
        setSelectedFileName(null);
        await loadSummary();
        onDataChanged();
      } else {
        setStatusMessage({
          type: 'error',
          text: res.error || 'فشل الاستيراد في قاعدة البيانات.',
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: 'حدث خطأ أثناء حفظ البيانات على الخادم.',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleClearAll = async () => {
    if (window.confirm('تحذير: هل أنت متأكد من رغبتك في حذف جميع بيانات القبول المخزنة على الخادم؟')) {
      const res = await deleteAdmissionRecords();
      if (res.success) {
        setStatusMessage({ type: 'success', text: 'تم تفريغ قاعدة البيانات الدائمة بنجاح.' });
        await loadSummary();
        onDataChanged();
      } else {
        setStatusMessage({ type: 'error', text: res.error || 'فشل الحذف.' });
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-right flex flex-col my-auto max-h-[92vh]">
        {/* Top Header */}
        <div className="bg-gradient-to-r from-blue-950 via-blue-900 to-indigo-950 text-white p-5 sm:p-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-800/80 border border-blue-600/50 flex items-center justify-center text-amber-400 shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black">لوحة تحكم المدير</h2>
                <span className="text-[11px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2.5 py-0.5 rounded-full font-bold">
                  حساب معتمد: engali98
                </span>
              </div>
              <p className="text-xs text-blue-200 mt-0.5">
                إدارة بيانات القبول المركزي الحكومي 2025–2026 وحفظها الدائم في الخادم
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                await adminLogout();
                onLogout();
              }}
              className="px-3 py-1.5 rounded-xl bg-rose-900/60 hover:bg-rose-900 text-rose-200 hover:text-white border border-rose-700/50 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>تسجيل الخروج</span>
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold transition cursor-pointer"
            >
              إغلاق اللوحة
            </button>
          </div>
        </div>

        {/* Section Title required by user: «إدارة بيانات القبول» */}
        <div className="bg-slate-100 border-b border-slate-200 px-6 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-slate-800 font-extrabold text-sm">
            <Database className="w-4 h-4 text-blue-900" />
            <span>إدارة بيانات القبول</span>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('upload')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'upload'
                  ? 'bg-blue-900 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>رفع واستيراد البيانات</span>
            </button>
            <button
              onClick={() => setActiveTab('current')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'current'
                  ? 'bg-blue-900 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              <span>السجلات الحالية ({summary.count})</span>
            </button>
            <button
              onClick={() => setActiveTab('review')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'review'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-white text-amber-800 hover:bg-amber-50'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>المراجعة الإدارية ({summary.reviewCount})</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Status Message */}
          {statusMessage && (
            <div
              className={`p-4 rounded-2xl text-xs font-bold flex items-center gap-2.5 shadow-xs ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : statusMessage.type === 'error'
                  ? 'bg-rose-50 text-rose-800 border border-rose-200'
                  : 'bg-blue-50 text-blue-900 border border-blue-200'
              }`}
            >
              {statusMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />}
              {statusMessage.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />}
              {statusMessage.type === 'info' && <FileCheck className="w-4 h-4 shrink-0 text-blue-600" />}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl text-center">
              <span className="text-[11px] text-slate-500 font-medium block">السجلات المعتمدة الحالية</span>
              <span className="text-2xl font-black text-blue-950 font-mono">{summary.count}</span>
            </div>
            <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-2xl text-center">
              <span className="text-[11px] text-amber-800 font-medium block">قيد المراجعة الإدارية</span>
              <span className="text-2xl font-black text-amber-700 font-mono">{summary.reviewCount}</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl text-center">
              <span className="text-[11px] text-slate-500 font-medium block">التكرارات المكتشفة</span>
              <span className="text-2xl font-black text-slate-700 font-mono">{summary.duplicateCount}</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl text-center">
              <span className="text-[11px] text-slate-500 font-medium block">آخر تحديث في الخادم</span>
              <span className="text-[11px] font-bold text-slate-800 block truncate mt-1">
                {summary.lastUpdated ? new Date(summary.lastUpdated).toLocaleString('ar-IQ') : 'لم تُرفع بيانات بعد'}
              </span>
            </div>
          </div>

          {/* TAB 1: UPLOAD & PREVIEW */}
          {activeTab === 'upload' && (
            <div className="space-y-5">
              {/* File upload box */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-2">
                  1. رفع ملف جدول القبول المركزي (JSON):
                </label>
                <label className="border-2 border-dashed border-blue-300 hover:border-blue-600 rounded-2xl p-6 flex flex-col items-center justify-center bg-blue-50/40 hover:bg-blue-50/80 transition cursor-pointer group">
                  <Upload className="w-10 h-10 text-blue-600 group-hover:scale-110 transition mb-2" />
                  <span className="text-sm font-bold text-blue-950">
                    {selectedFileName ? `الملف المحدد: ${selectedFileName}` : 'اضغط لاختيار ملف البيانات من جهازك (.json)'}
                  </span>
                  <span className="text-xs text-slate-500 mt-1">
                    التحقق التلقائي من المعدلات (50–100)، أسماء الجامعات والكليات والأقسام، والمحافظة، والجنس، والفرع
                  </span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Paste JSON text */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-2">
                  أو لصق نص الـ JSON مباشرة:
                </label>
                <textarea
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  placeholder='[ { "university": "جامعة بغداد", "college": "كلية الهندسة", "department": "قسم الحاسوب", "minimumScore": 88.5, "governorate": "بغداد", "gender": "كلاهما", "branch": "علمي" } ]'
                  rows={3}
                  className="w-full text-xs font-mono p-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-700"
                  dir="ltr"
                />
                <div className="flex justify-end mt-2">
                  <button
                    onClick={handleTextAnalyze}
                    disabled={!jsonInput.trim()}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-bold text-xs rounded-xl cursor-pointer shadow-xs transition"
                  >
                    معاينة وفحص النص المدخل
                  </button>
                </div>
              </div>

              {/* Pre-import Preview Card */}
              {previewStats && parsedPreviewList && (
                <div className="bg-white border-2 border-blue-500/40 rounded-2xl p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <div className="flex items-center gap-2">
                      <Eye className="w-5 h-5 text-blue-800" />
                      <h4 className="text-sm font-black text-blue-950">
                        معاينة نتائج فحص البيانات قبل الاستيراد
                      </h4>
                    </div>
                    <span className="text-xs font-bold text-slate-500">
                      إجمالي السجلات المفحوصة: <strong className="text-blue-900 font-mono">{previewStats.total}</strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-center text-xs">
                    <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl">
                      <span className="text-[11px] text-emerald-800 font-bold block">سجلات سليمة ومؤكدة</span>
                      <span className="text-lg font-black text-emerald-700 font-mono">{previewStats.valid}</span>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-xl">
                      <span className="text-[11px] text-amber-800 font-bold block">تكرارات مكتشفة</span>
                      <span className="text-lg font-black text-amber-700 font-mono">{previewStats.duplicates}</span>
                    </div>
                    <div className="bg-rose-50 border border-rose-200 p-2.5 rounded-xl">
                      <span className="text-[11px] text-rose-800 font-bold block">سجلات بحاجة لمراجعة</span>
                      <span className="text-lg font-black text-rose-700 font-mono">{previewStats.errors}</span>
                    </div>
                  </div>

                  {/* Sample rows table preview */}
                  <div className="overflow-x-auto max-h-48 border border-slate-200 rounded-xl">
                    <table className="w-full text-xs text-right">
                      <thead className="bg-slate-100 text-slate-700 sticky top-0 font-bold">
                        <tr>
                          <th className="p-2 border-b">#</th>
                          <th className="p-2 border-b">الجامعة</th>
                          <th className="p-2 border-b">الكلية</th>
                          <th className="p-2 border-b">القسم</th>
                          <th className="p-2 border-b">الحد الأدنى</th>
                          <th className="p-2 border-b">المحافظة</th>
                          <th className="p-2 border-b">الفرع</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsedPreviewList.slice(0, 8).map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="p-2 font-mono text-slate-400">{i + 1}</td>
                            <td className="p-2 font-semibold text-blue-950">
                              {row.university || row['الجامعة'] || 'غير متوفر'}
                            </td>
                            <td className="p-2">{row.college || row['الكلية'] || 'غير متوفر'}</td>
                            <td className="p-2">{row.department || row['القسم'] || 'غير متوفر'}</td>
                            <td className="p-2 font-mono font-bold text-blue-900">
                              {row.minimumScore || row['الحد الأدنى'] || row['المعدل'] || 'غير محدد'}
                            </td>
                            <td className="p-2 text-slate-600">{row.governorate || row['المحافظة'] || 'غير متوفر'}</td>
                            <td className="p-2 text-slate-600">{row.branch || row['الفرع'] || 'علمي وأدبي'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Merge option */}
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="merge"
                      checked={mergeWithExisting}
                      onChange={(e) => setMergeWithExisting(e.target.checked)}
                      className="rounded text-blue-600 cursor-pointer"
                    />
                    <label htmlFor="merge" className="text-xs font-bold text-slate-700 cursor-pointer">
                      تحديث ودمج البيانات مع السجلات السابقة دون حذف السجلات الصحيحة القائمة
                    </label>
                  </div>

                  {/* Final Import Execution Button */}
                  <button
                    onClick={handleExecuteImport}
                    disabled={isUploading}
                    className="w-full py-3 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-50 text-white font-black text-sm rounded-xl cursor-pointer shadow-md transition flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-5 h-5 text-emerald-200" />
                    <span>{isUploading ? 'جارٍ الحفظ الدائم على الخادم...' : 'اعتماد وحفظ البيانات بصورة دائمة في قاعدة البيانات'}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CURRENT SAVED RECORDS */}
          {activeTab === 'current' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-700">
                  السجلات المعتمدة المخزنة حالياً على الخادم:
                </h4>
                <button
                  onClick={handleClearAll}
                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>تفريغ كافة البيانات</span>
                </button>
              </div>

              {summary.count === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <Database className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-700">لا توجد سجلات محفوظة حتى الآن</p>
                  <p className="text-xs text-slate-500 mt-1">استخدم تبويب «رفع واستيراد البيانات» لرفع ملف الجدول.</p>
                </div>
              ) : (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-900 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <span>
                      قاعدة البيانات تعمل بصورة دائمة وتحتوي على <strong>{summary.count}</strong> سجلاً حكومياً معتمداً.
                    </span>
                  </div>
                  <button
                    onClick={loadSummary}
                    className="p-1 text-emerald-700 hover:text-emerald-900 cursor-pointer"
                    title="تحديث"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ADMINISTRATIVE REVIEW RECORDS */}
          {activeTab === 'review' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                تطبيقاً للشرط: «إذا كان النص غامضًا أو تعذّر تحديد معدل قسم معين بثقة، استبعده من النتائج المؤكدة واعرضه للمراجعة الإدارية».
              </p>

              {summary.reviewRecords.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-800">لا توجد سجلات للمراجعة الإدارية</p>
                  <p className="text-xs text-slate-500 mt-1">جميع السجلات المستوردة استوفت الشروط ومعدلاتها ضمن 50–100.</p>
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto space-y-2.5">
                  {summary.reviewRecords.map((rec) => (
                    <div
                      key={rec.id}
                      className="p-3.5 bg-white rounded-xl border border-amber-300 shadow-xs text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between font-bold text-slate-900">
                        <span className="text-blue-950 font-extrabold">{rec.university} • {rec.college}</span>
                        <span className="text-amber-800 bg-amber-100 px-2 py-0.5 rounded-lg font-mono">
                          معدل: {rec.minimumScore || 'غير محدد'}
                        </span>
                      </div>
                      <div className="text-slate-700 font-medium">القسم: {rec.department}</div>
                      {rec.ambiguityReason && (
                        <div className="text-amber-800 bg-amber-50 p-2 rounded-lg font-semibold">
                          سبب الاستبعاد للمراجعة: {rec.ambiguityReason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-500">
            البيانات المستوردة محفوظة بصورة دائمة على الخادم وتظهر للطلاب تلقائياً
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl cursor-pointer transition"
          >
            العودة للواجهة الرئيسية
          </button>
        </div>
      </div>
    </div>
  );
};
