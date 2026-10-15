import React from 'react';
import { MatchedAdmissionResult } from '../types/admission';
import { School, MapPin, Users, ShieldAlert, ArrowUpRight, Check, ArrowDownRight } from 'lucide-react';

interface AdmissionCardProps {
  item: MatchedAdmissionResult;
  index: number;
}

export const AdmissionCard: React.FC<AdmissionCardProps> = ({ item, index }) => {
  const { record, studentScore, diff, category, displayDiffText, statusBadge } = item;

  // Format student score without trailing superfluous zeros if integer or clean decimal
  const formattedScore = Number.isInteger(studentScore)
    ? studentScore.toString()
    : studentScore.toFixed(2).replace(/\.?0+$/, '');

  const formattedMin = Number.isInteger(record.minimumScore)
    ? record.minimumScore.toString()
    : record.minimumScore.toFixed(2);

  return (
    <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col justify-between group">
      {/* Top Banner / Category Badge */}
      <div className={`px-4 py-2.5 text-xs font-bold flex items-center justify-between border-b ${statusBadge.bgClass} ${statusBadge.colorClass} ${statusBadge.borderClass}`}>
        <div className="flex items-center gap-1.5">
          {category === 'higher' && <ArrowUpRight className="w-4 h-4 shrink-0 text-amber-600 font-black" />}
          {category === 'exact' && <Check className="w-4 h-4 shrink-0 text-emerald-600 font-black" />}
          {(category === 'lower_3_to_5' || category === 'lower_other') && (
            <ArrowDownRight className="w-4 h-4 shrink-0 text-blue-600 font-black" />
          )}
          <span>{statusBadge.label}</span>
        </div>
        <span className="text-[11px] font-mono bg-white/80 px-2 py-0.5 rounded-full shadow-2xs font-bold text-slate-700">
          تسلسل #{index + 1}
        </span>
      </div>

      {/* Main Content */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-4">
        <div>
          {/* University & Governorate */}
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <h3 className="text-base font-extrabold text-blue-950 flex items-center gap-2 group-hover:text-blue-700 transition">
              <School className="w-4 h-4 text-blue-800 shrink-0" />
              <span>{record.university}</span>
            </h3>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-xl shrink-0">
              <MapPin className="w-3 h-3 text-slate-400" />
              <span>{record.governorate || 'غير متوفر في البيانات'}</span>
            </span>
          </div>

          {/* College */}
          <div className="text-sm font-bold text-slate-800 mb-1 pr-6">
            {record.college}
          </div>

          {/* Department */}
          <div className="text-xs font-semibold text-slate-600 pr-6 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0" />
            <span>القسم: <strong className="text-slate-900">{record.department}</strong></span>
          </div>
        </div>

        {/* Metadata Details Grid */}
        <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs">
          <div>
            <span className="text-[10px] text-slate-500 block font-medium">الحد الأدنى للقبول</span>
            <span className="font-black text-base text-blue-950 font-mono">
              {formattedMin}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block font-medium">الجنس المقبول</span>
            <span className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
              <Users className="w-3.5 h-3.5 text-blue-600" />
              <span>{record.gender || 'غير متوفر في البيانات'}</span>
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block font-medium">الفرع الدراسي</span>
            <span className="font-bold text-slate-700">
              {record.branch || 'علمي وأدبي'}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block font-medium">نوع الدراسة والقناة</span>
            <span className="font-bold text-slate-700">
              حكومي • قبول مركزي
            </span>
          </div>
        </div>

        {/* Math Difference Indicator */}
        <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 text-xs flex items-center justify-between">
          <span className="text-slate-700 font-semibold">الفارق الحسابي مع معدلك ({formattedScore}):</span>
          <span
            className={`font-mono font-black text-xs ${
              category === 'higher'
                ? 'text-amber-800'
                : category === 'exact'
                ? 'text-emerald-700'
                : 'text-blue-800'
            }`}
          >
            {diff > 0 ? `+${diff.toFixed(2)}` : diff < 0 ? `${diff.toFixed(2)}` : '0.00'}
          </span>
        </div>

        <div className="text-[11px] text-slate-600 bg-blue-50/50 border-r-2 border-blue-500 pr-2.5 py-1 rounded-l-md leading-relaxed">
          {displayDiffText}
        </div>
      </div>

      {/* Footer non-guarantee reminder */}
      <div className="bg-slate-50 border-t border-slate-100 px-4 py-2.5 text-[10px] text-slate-500 flex items-center gap-1.5 font-medium">
        <ShieldAlert className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span>لا يعتبر تجاوز الحد الأدنى أو مطابقته ضماناً حتمياً للقبول الفعلي</span>
      </div>
    </div>
  );
};
