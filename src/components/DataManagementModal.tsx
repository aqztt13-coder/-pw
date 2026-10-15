import React, { useState } from 'react';
import { Upload, FileText, CheckCircle2, AlertTriangle, X, RefreshCw, Download, Database } from 'lucide-react';
import { saveAdmissionDataLocally, resetToBundledData } from '../services/dataStorage';
import { AdmissionRecord } from '../types/admission';

interface DataManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataUpdated: () => void;
  currentCount: number;
  reviewCount: number;
  duplicateCount: number;
  sourceName: string;
  reviewRecords: AdmissionRecord[];
}

export const DataManagementModal: React.FC<DataManagementModalProps> = ({
  isOpen,
  onClose,
  onDataUpdated,
  currentCount,
  reviewCount,
  duplicateCount,
  sourceName,
  reviewRecords,
}) => {
  const [jsonText, setJsonText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'review'>('upload');

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!Array.isArray(parsed)) {
          throw new Error('يجب أن يحتوي ملف الـ JSON على مصفوفة (Array) من السجلات.');
        }
        const result = saveAdmissionDataLocally(parsed);
        if (result.success) {
          setSuccessMsg(`تم تحميل وحفظ ${result.count} سجلاً مؤكداً بنجاح! ${result.reviewCount > 0 ? `(${result.reviewCount} سجل للمراجعة الإدارية)` : ''}`);
          onDataUpdated();
        } else {
          setErrorMsg('تعذر حفظ البيانات في الذاكرة المحلية للتطبيق.');
        }
      } catch (err: unknown) {
        const error = err as Error;
        setErrorMsg(`صيغة الـ JSON غير صالحة: ${error.message}`);
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handlePasteSubmit = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!jsonText.trim()) {
      setErrorMsg('يرجى لصق نص الـ JSON أولاً.');
      return;
    }

    try {
      const parsed = JSON.parse(jsonText.trim());
      if (!Array.isArray(parsed)) {
        throw new Error('يجب أن يكون محتوى الـ JSON مصفوفة سِجلات [ { ... } ].');
      }
      const result = saveAdmissionDataLocally(parsed);
      if (result.success) {
        setSuccessMsg(`تم استيراد ${result.count} سجلاً معتمداً بنجاح.`);
        setJsonText('');
        onDataUpdated();
      } else {
        setErrorMsg('فشل الحفظ.');
      }
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMsg(`خطأ في قراءة الـ JSON: ${error.message}`);
    }
  };

  const handleReset = () => {
    if (window.confirm('هل تريد إعادة تعيين البيانات إلى الحالة الافتراضية؟')) {
      resetToBundledData();
      onDataUpdated();
      setSuccessMsg('تمت إعادة التعيين بنجاح.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-800">
        {/* Header */}
        <div className="bg-gradient-to-l from-blue-950 via-blue-900 to-indigo-950 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-800/60 rounded-xl border border-blue-600/40">
              <Database className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-lg font-bold">إدارة وتحديث بيانات القبول المركزي (JSON)</h2>
              <p className="text-xs text-blue-200">
                قناة القبول المركزي الحكومي لسنة 2025–2026 • حفظ دائم ومحلي 100% بدون إنترنت
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-blue-200 hover:text-white hover:bg-blue-800/50 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-5 pt-3 gap-4">
          <button
            onClick={() => setActiveTab('upload')}
            className={`pb-3 font-bold text-xs md:text-sm border-b-2 transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'upload'
                ? 'border-blue-700 text-blue-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>رفع أو لصق ملف JSON</span>
          </button>
          <button
            onClick={() => setActiveTab('review')}
            className={`pb-3 font-bold text-xs md:text-sm border-b-2 transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'review'
                ? 'border-amber-600 text-amber-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>سجلات المراجعة الإدارية ({reviewCount})</span>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Status summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-center">
            <div>
              <div className="text-[11px] text-slate-500 font-medium">السجلات المعتمدة</div>
              <div className="text-xl font-black text-blue-900">{currentCount}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500 font-medium">قيد المراجعة الإدارية</div>
              <div className="text-xl font-black text-amber-600">{reviewCount}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500 font-medium">التكرارات المكتشفة</div>
              <div className="text-xl font-black text-slate-700">{duplicateCount}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500 font-medium">مصدر البيانات</div>
              <div className="text-xs font-semibold text-slate-800 truncate" title={sourceName}>
                {sourceName}
              </div>
            </div>
          </div>

          {activeTab === 'upload' && (
            <>
              {/* File Upload Box */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  اختر ملف الـ JSON الرسمي للجدول:
                </label>
                <label className="border-2 border-dashed border-blue-300 hover:border-blue-600 rounded-xl p-5 flex flex-col items-center justify-center bg-blue-50/40 hover:bg-blue-50/70 transition cursor-pointer group">
                  <Upload className="w-8 h-8 text-blue-600 group-hover:scale-110 transition mb-2" />
                  <span className="text-sm font-bold text-blue-950">
                    اضغط هنا لاختيار ملف .json من جهازك
                  </span>
                  <span className="text-xs text-slate-500 mt-1">
                    يقوم التطبيق بالتحقق التلقائي من المعدلات (50-100) والأسماء والمحافظة وحفظها محلياً
                  </span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Paste JSON directly */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  أو الصق مصفوفة الـ JSON مباشرة:
                </label>
                <textarea
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  placeholder='[ { "university": "جامعة بغداد", "college": "كلية الهندسة", "department": "قسم الحاسوب", "minimumScore": 88.5, "governorate": "بغداد", "gender": "كلاهما", "branch": "علمي" } ]'
                  rows={4}
                  className="w-full text-xs font-mono p-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                  dir="ltr"
                />
                <div className="flex justify-end mt-2">
                  <button
                    onClick={handlePasteSubmit}
                    disabled={!jsonText.trim()}
                    className="px-4 py-2 bg-blue-900 hover:bg-blue-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl cursor-pointer shadow-sm transition"
                  >
                    معالجة وتطبيق البيانات الملصوقة
                  </button>
                </div>
              </div>
            </>
          )}

          {activeTab === 'review' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                تطبيقاً للشرط: «إذا كان النص غامضًا أو تعذّر تحديد معدل قسم معين بثقة، استبعده من النتائج المؤكدة واعرضه للمراجعة الإدارية».
              </p>
              {reviewRecords.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-800">
                    لا توجد أي سجلات غامضة أو غير محددة حالياً
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    جميع السجلات مطابقة للمعايير ومعدلاتها ضمن النطاق 50–100.
                  </p>
                </div>
              ) : (
                <div className="max-h-60 overflow-y-auto space-y-2 border border-slate-200 rounded-xl p-2 bg-slate-50">
                  {reviewRecords.map((rec) => (
                    <div
                      key={rec.id}
                      className="p-3 bg-white rounded-lg border border-amber-200 shadow-xs text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between font-bold text-slate-900">
                        <span>{rec.university} • {rec.college}</span>
                        <span className="text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                          معدل: {rec.minimumScore || 'غير محدد'}
                        </span>
                      </div>
                      <div className="text-slate-600">القسم: {rec.department}</div>
                      {rec.ambiguityReason && (
                        <div className="text-amber-700 font-medium">سبب المراجعة: {rec.ambiguityReason}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Messages */}
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between">
          <button
            onClick={handleReset}
            className="text-xs text-slate-600 hover:text-rose-700 flex items-center gap-1.5 cursor-pointer font-medium"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>إعادة ضبط البيانات</span>
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl cursor-pointer shadow-sm transition"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
