/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  GraduationCap,
  Search,
  Filter,
  CheckCircle2,
  Lock,
  ArrowUpDown,
  Building2,
  MapPin,
  Sparkles,
  Info,
  SlidersHorizontal,
  RotateCcw,
  BookOpenCheck,
  AlertCircle,
  ShieldCheck,
  Check
} from 'lucide-react';
import { AdmissionRecord, MatchedAdmissionResult } from './types/admission';
import { fetchAdmissionRecords, adminVerify } from './services/apiClient';
import { getSavedAdmissionData } from './services/dataStorage';
import { matchAndRankAdmissions } from './utils/admissionMatcher';
import { AdmissionCard } from './components/AdmissionCard';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';
import { AdminLogin } from './components/AdminLogin';
import { AdminDashboard } from './components/AdminDashboard';

export default function App() {
  // Public admission records fetched from server persistent database or offline cache
  const [records, setRecords] = useState<AdmissionRecord[]>([]);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);

  // Admin state (strictly verified via server token)
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState<boolean>(false);
  const [showAdminLoginModal, setShowAdminLoginModal] = useState<boolean>(false);
  const [showAdminDashboard, setShowAdminDashboard] = useState<boolean>(false);

  // Student Input State (Rule 3)
  const [scoreInput, setScoreInput] = useState<string>('');
  const [selectedBranch, setSelectedBranch] = useState<'علمي' | 'أدبي'>('علمي');
  const [selectedGender, setSelectedGender] = useState<'ذكر' | 'أنثى'>('ذكر');

  // Triggered Search Submission State
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [scoreValidationError, setScoreValidationError] = useState<string | null>(null);
  const [submittedScore, setSubmittedScore] = useState<number | null>(null);
  const [submittedBranch, setSubmittedBranch] = useState<'علمي' | 'أدبي'>('علمي');
  const [submittedGender, setSubmittedGender] = useState<'ذكر' | 'أنثى'>('ذكر');

  // Secondary Filters
  const [selectedGovernorate, setSelectedGovernorate] = useState<string>('all');
  const [selectedUniversity, setSelectedUniversity] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [includeOtherLower, setIncludeOtherLower] = useState<boolean>(false);

  // Fetch admission data from persistent backend with offline PWA fallback
  const loadAdmissions = async () => {
    setIsLoadingData(true);
    try {
      const data = await fetchAdmissionRecords();
      if (data.success && Array.isArray(data.records) && data.records.length > 0) {
        setRecords(data.records);
      } else {
        const local = getSavedAdmissionData();
        if (local.records && local.records.length > 0) {
          setRecords(local.records);
        }
      }
    } catch (err) {
      console.warn('Network offline or server unavailable, loading offline dataset:', err);
      const local = getSavedAdmissionData();
      if (local.records && local.records.length > 0) {
        setRecords(local.records);
      }
    } finally {
      setIsLoadingData(false);
    }
  };

  // Check admin session on mount
  useEffect(() => {
    loadAdmissions();

    adminVerify().then((res) => {
      if (res.authenticated) {
        setIsAdminLoggedIn(true);
      }
    });

    // Handle #admin hash in URL
    const handleHash = () => {
      if (window.location.hash === '#admin') {
        adminVerify().then((res) => {
          if (res.authenticated) {
            setShowAdminDashboard(true);
          } else {
            setShowAdminLoginModal(true);
          }
        });
      }
    };

    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  // Handle Search Submission
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setScoreValidationError(null);

    const raw = scoreInput.trim().replace(',', '.');
    const parsed = parseFloat(raw);

    // Rule 3: Validates score within 50 to 100 without showing this range on UI
    if (!raw || isNaN(parsed) || parsed < 50 || parsed > 100) {
      setScoreValidationError('يرجى إدخال معدل صحيح.');
      setSubmittedScore(null);
      return;
    }

    // Keep exact numerical value (no integer rounding)
    setSubmittedScore(parsed);
    setSubmittedBranch(selectedBranch);
    setSubmittedGender(selectedGender);
    setHasSearched(true);
  };

  // Dynamic filter options from currently loaded records
  const availableGovernorates = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      if (r.governorate && r.governorate !== 'غير متوفر في البيانات') {
        set.add(r.governorate);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [records]);

  const availableUniversities = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      if (r.university && r.university !== 'غير متوفر في البيانات') {
        if (selectedGovernorate === 'all' || r.governorate === selectedGovernorate) {
          set.add(r.university);
        }
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [records, selectedGovernorate]);

  // Apply strict matching & ordering
  const matchedResults = useMemo(() => {
    if (submittedScore === null) return [];

    const rawMatched = matchAndRankAdmissions(
      records,
      submittedScore,
      submittedBranch,
      submittedGender,
      includeOtherLower
    );

    return rawMatched.filter((item) => {
      // Governorate filter
      if (selectedGovernorate !== 'all' && item.record.governorate !== selectedGovernorate) {
        return false;
      }

      // University filter
      if (selectedUniversity !== 'all' && item.record.university !== selectedUniversity) {
        return false;
      }

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const uni = item.record.university.toLowerCase();
        const col = item.record.college.toLowerCase();
        const dep = item.record.department.toLowerCase();
        const gov = item.record.governorate?.toLowerCase() ?? '';
        if (!uni.includes(q) && !col.includes(q) && !dep.includes(q) && !gov.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [
    records,
    submittedScore,
    submittedBranch,
    submittedGender,
    includeOtherLower,
    selectedGovernorate,
    selectedUniversity,
    searchQuery,
  ]);

  // Statistics breakdown
  const stats = useMemo(() => {
    if (submittedScore === null) return { higher: 0, exact: 0, lower3to5: 0, total: 0 };
    const allMatches = matchAndRankAdmissions(
      records,
      submittedScore,
      submittedBranch,
      submittedGender,
      true
    );
    return {
      higher: allMatches.filter((m) => m.category === 'higher').length,
      exact: allMatches.filter((m) => m.category === 'exact').length,
      lower3to5: allMatches.filter((m) => m.category === 'lower_3_to_5').length,
      total: allMatches.length,
    };
  }, [records, submittedScore, submittedBranch, submittedGender]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800">
      {/* Top Main Navigation Bar */}
      <header className="bg-gradient-to-r from-slate-950 via-blue-950 to-blue-900 text-white shadow-xl sticky top-0 z-30 border-b border-blue-800/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
          {/* Logo & Identity */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-tr from-amber-400 to-amber-500 p-0.5 shadow-lg shadow-amber-500/20 flex items-center justify-center shrink-0">
              <div className="w-full h-full bg-blue-950 rounded-[14px] flex items-center justify-center">
                <GraduationCap className="w-6 h-6 text-amber-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                  دليلك الجامعي – العراق
                </h1>
                <span className="text-[10px] font-bold bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full">
                  2025–2026
                </span>
              </div>
              <p className="text-xs text-blue-200/90 font-medium">
                بوابة القبول المركزي الحكومي • حساب الفروق والفرز الدقيق
              </p>
            </div>
          </div>

          {/* Quick Actions (PWA Install + Admin Panel button if authenticated) */}
          <div className="flex items-center gap-2.5">
            {isAdminLoggedIn && (
              <button
                onClick={() => setShowAdminDashboard(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold shadow-xs transition cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-slate-950" />
                <span>لوحة تحكم المدير</span>
              </button>
            )}

            <PWAInstallButton />
          </div>
        </div>
      </header>

      {/* Official Fixed Parameters Header Banner */}
      <section className="bg-gradient-to-b from-blue-950 to-blue-900 text-white pt-6 pb-12 px-4 sm:px-6 lg:px-8 shadow-inner">
        <div className="max-w-7xl mx-auto space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs border-b border-blue-800/60 pb-3">
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 font-semibold text-blue-200">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>نوع الدراسة: <strong>حكومي فقط</strong></span>
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>قناة القبول: <strong>القبول المركزي فقط</strong></span>
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>سنة القبول: <strong>2025–2026</strong></span>
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>الفرعان المشمولان: <strong>علمي وأدبي فقط</strong></span>
              </span>
            </div>
            <div className="text-[11px] text-blue-300 font-medium flex items-center gap-1">
              <BookOpenCheck className="w-3.5 h-3.5 text-amber-400" />
              <span>مصدر البيانات: جدول الحدود الدنيا المعتمد</span>
            </div>
          </div>

          <div className="text-center sm:text-right max-w-3xl">
            <h2 className="text-xl sm:text-3xl font-black text-white leading-tight">
              احسب خيارات كليتك وقسمك وفق الحدود الدنيا الرسمية
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-blue-200 leading-relaxed">
              أدخل معدلك وحدد الفرع الدراسي والجنس للبحث في قاعدة بيانات الكليات والأقسام الحكومية، مع عرض الفروق الحسابية بدقة وترتيب النتائج بحسب أولوية التنافس والقبول.
            </p>
          </div>
        </div>
      </section>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-7 mb-16 flex-1 w-full space-y-6">
        {/* Core Student Search Form (Rule 3) */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-200/90 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5 text-blue-900" />
              <h3 className="text-base font-extrabold text-blue-950">
                نموذج بحث الطالب
              </h3>
            </div>
            <span className="text-xs font-semibold text-slate-500">
              دعم المعدلات الصحيحة والعشرية (مثل 80 أو 80.5 أو 75.25)
            </span>
          </div>

          <form onSubmit={handleSearchSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Score Input (Strict Rule: placeholder is ONLY «أدخل معدلك», no ranges displayed) */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-2">
                  المعدل *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    value={scoreInput}
                    onChange={(e) => {
                      setScoreInput(e.target.value);
                      if (scoreValidationError) setScoreValidationError(null);
                    }}
                    placeholder="أدخل معدلك"
                    className="w-full text-lg font-black text-blue-950 px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl focus:border-blue-700 focus:bg-white focus:outline-none transition shadow-2xs font-mono"
                    dir="ltr"
                  />
                </div>
                {scoreValidationError && (
                  <p className="mt-2 text-xs text-rose-600 font-bold flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>{scoreValidationError}</span>
                  </p>
                )}
              </div>

              {/* Study Branch Selector (Strict Rule: ONLY «علمي» and «أدبي») */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-2">
                  الفرع الدراسي *
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSelectedBranch('علمي')}
                    className={`py-3 px-4 rounded-2xl font-bold text-sm transition cursor-pointer border-2 flex items-center justify-center gap-2 ${
                      selectedBranch === 'علمي'
                        ? 'border-blue-900 bg-blue-900 text-white shadow-sm'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {selectedBranch === 'علمي' && <Check className="w-4 h-4 text-white" />}
                    <span>علمي</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedBranch('أدبي')}
                    className={`py-3 px-4 rounded-2xl font-bold text-sm transition cursor-pointer border-2 flex items-center justify-center gap-2 ${
                      selectedBranch === 'أدبي'
                        ? 'border-blue-900 bg-blue-900 text-white shadow-sm'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {selectedBranch === 'أدبي' && <Check className="w-4 h-4 text-white" />}
                    <span>أدبي</span>
                  </button>
                </div>
              </div>

              {/* Gender Selector (Strict Rule: «ذكر» or «أنثى») */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-2">
                  الجنس *
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSelectedGender('ذكر')}
                    className={`py-3 px-4 rounded-2xl font-bold text-sm transition cursor-pointer border-2 flex items-center justify-center gap-2 ${
                      selectedGender === 'ذكر'
                        ? 'border-blue-900 bg-blue-900 text-white shadow-sm'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {selectedGender === 'ذكر' && <Check className="w-4 h-4 text-white" />}
                    <span>ذكر</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedGender('أنثى')}
                    className={`py-3 px-4 rounded-2xl font-bold text-sm transition cursor-pointer border-2 flex items-center justify-center gap-2 ${
                      selectedGender === 'أنثى'
                        ? 'border-blue-900 bg-blue-900 text-white shadow-sm'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {selectedGender === 'أنثى' && <Check className="w-4 h-4 text-white" />}
                    <span>أنثى</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Submit Button: «ابحث عن الجامعات» */}
            <div className="pt-2">
              <button
                type="submit"
                className="w-full py-3.5 bg-gradient-to-r from-blue-950 via-blue-900 to-indigo-900 hover:from-blue-900 hover:to-indigo-800 text-white font-black text-base rounded-2xl shadow-lg hover:shadow-xl transition cursor-pointer flex items-center justify-center gap-2.5 active:scale-[0.99]"
              >
                <Search className="w-5 h-5 text-amber-400" />
                <span>ابحث عن الجامعات</span>
              </button>
            </div>
          </form>
        </div>

        {/* Database Empty Notice (For visitors before admin attaches the data) */}
        {records.length === 0 && !isLoadingData && (
          <div className="bg-white rounded-3xl p-8 sm:p-10 text-center border border-slate-200 shadow-sm space-y-3">
            <Building2 className="w-12 h-12 text-slate-400 mx-auto" />
            <h3 className="text-lg font-extrabold text-blue-950">
              قاعدة بيانات جدول القبول بانتظار رفع الملف المعتمد
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
              تطبيقاً لشرط المشروع الصارم بعدم استخدام أي بيانات افتراضية أو وهمية، ستظهر نتائج القبول فور قيام إدارة الموقع برفع ملف جدول الحدود الدنيا الرسمي وحفظه في النظام.
            </p>
          </div>
        )}

        {/* Search Results Area */}
        {hasSearched && submittedScore !== null && records.length > 0 && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Results Filter & Stats Header */}
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <ArrowUpDown className="w-4 h-4 text-blue-900" />
                  <span className="text-sm font-extrabold text-blue-950">
                    نتائج البحث لمعدل ({submittedScore}) • الفرع: {submittedBranch} • الجنس: {submittedGender}
                  </span>
                </div>
                <div className="text-xs text-slate-500 font-bold">
                  إجمالي الخيارات المطابقة: <strong className="text-blue-900 font-mono text-sm">{matchedResults.length}</strong>
                </div>
              </div>

              {/* Strict Priority Order Indicator */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="bg-amber-50 border border-amber-200/80 p-3 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="font-extrabold text-amber-900 block">1. أعلى من معدلك</span>
                    <span className="text-[11px] text-amber-700">مرتبة من الأقرب ثم تصاعدياً</span>
                  </div>
                  <span className="text-base font-black font-mono text-amber-800 bg-white/80 px-2 py-0.5 rounded-xl">
                    {stats.higher}
                  </span>
                </div>

                <div className="bg-emerald-50 border border-emerald-200/80 p-3 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="font-extrabold text-emerald-900 block">2. مساوٍ لمعدلك تماماً</span>
                    <span className="text-[11px] text-emerald-700">حدود دنيا مطابقة للمعدل</span>
                  </div>
                  <span className="text-base font-black font-mono text-emerald-800 bg-white/80 px-2 py-0.5 rounded-xl">
                    {stats.exact}
                  </span>
                </div>

                <div className="bg-blue-50 border border-blue-200/80 p-3 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="font-extrabold text-blue-900 block">3. يقل بـ 3 إلى 5 درجات</span>
                    <span className="text-[11px] text-blue-700">نطاق الأمان المعتمد</span>
                  </div>
                  <span className="text-base font-black font-mono text-blue-900 bg-white/80 px-2 py-0.5 rounded-xl">
                    {stats.lower3to5}
                  </span>
                </div>
              </div>

              {/* Secondary Filters (Governorate, University, Search, Toggle other lower scores) */}
              <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3 items-center">
                {/* Live search in results */}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="تصفية باسم الجامعة أو الكلية..."
                    className="w-full text-xs font-semibold pr-9 pl-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-700"
                  />
                </div>

                {/* Governorate Filter */}
                <div>
                  <select
                    value={selectedGovernorate}
                    onChange={(e) => {
                      setSelectedGovernorate(e.target.value);
                      setSelectedUniversity('all');
                    }}
                    className="w-full text-xs font-bold text-slate-800 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-700 cursor-pointer"
                  >
                    <option value="all">كل المحافظات</option>
                    {availableGovernorates.map((gov) => (
                      <option key={gov} value={gov}>
                        {gov}
                      </option>
                    ))}
                  </select>
                </div>

                {/* University Filter */}
                <div>
                  <select
                    value={selectedUniversity}
                    onChange={(e) => setSelectedUniversity(e.target.value)}
                    className="w-full text-xs font-bold text-slate-800 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-700 cursor-pointer"
                  >
                    <option value="all">كل الجامعات ({availableUniversities.length})</option>
                    {availableUniversities.map((uni) => (
                      <option key={uni} value={uni}>
                        {uni}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Include other lower scores toggle */}
                <div className="flex items-center justify-between sm:justify-end gap-3">
                  <label className="text-[11px] font-semibold text-slate-600 flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeOtherLower}
                      onChange={(e) => setIncludeOtherLower(e.target.checked)}
                      className="rounded text-blue-600 cursor-pointer"
                    />
                    <span>عرض باقي الفوارق</span>
                  </label>
                  {(selectedGovernorate !== 'all' || selectedUniversity !== 'all' || searchQuery) && (
                    <button
                      onClick={() => {
                        setSelectedGovernorate('all');
                        setSelectedUniversity('all');
                        setSearchQuery('');
                      }}
                      className="text-xs text-rose-700 hover:text-rose-900 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>تفريغ الفلاتر</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Results Grid */}
            {matchedResults.length === 0 ? (
              <div className="bg-white rounded-3xl p-10 text-center border border-slate-200 space-y-3">
                <Info className="w-10 h-10 text-slate-400 mx-auto" />
                <h3 className="text-base font-extrabold text-slate-800">
                  لا توجد كليات أو أقسام مطابقة لخيارات البحث المحددة
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                  لم يتم العثور على أي خيار يطابق المعدل ({submittedScore}) والفرع ({submittedBranch}) والجنس ({submittedGender}) ضمن شروط الترتيب الحالية. يمكنك تجربة تحديد كل المحافظات أو تفعيل «عرض باقي الفوارق».
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {matchedResults.map((item, idx) => (
                  <AdmissionCard key={item.record.id} item={item} index={idx} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Legal Disclaimer & Transparency Note */}
        <div className="bg-blue-50/70 border border-blue-100 rounded-3xl p-5 text-xs text-slate-600 space-y-2 leading-relaxed">
          <div className="flex items-center gap-2 font-bold text-blue-950">
            <Info className="w-4 h-4 text-blue-800" />
            <span>تنبيه وإرشادات القبول المركزي</span>
          </div>
          <p>
            تعتمد نتائج هذا التطبيق على بيانات الحدود الدنيا للعام الدراسي 2025–2026 لقناة القبول المركزي الحكومي الصباحي، والمستخرجة من الجدول الرسمي المرفق. الفروق الحسابية المعروضة توضح موقع معدل الطالب مقارنة بالحدود الدنيا. لا يُعتبر ظهور الكلية أو القسم في النتائج أو تجاوز حدها الأدنى ضماناً حتمياً للقبول الفعلي، وتخضع النتائج النهائية لمفاضلة ومنافسة الطلبة وخطة القبول السنوية لوزارة التعليم العالي.
          </p>
        </div>
      </main>

      {/* Admin Login Modal (When triggered from footer or URL) */}
      {showAdminLoginModal && (
        <AdminLogin
          onSuccess={() => {
            setShowAdminLoginModal(false);
            setIsAdminLoggedIn(true);
            setShowAdminDashboard(true);
          }}
          onCancel={() => setShowAdminLoginModal(false)}
        />
      )}

      {/* Admin Dashboard (Only accessible after authenticated admin login) */}
      {showAdminDashboard && (
        <AdminDashboard
          onLogout={() => {
            setIsAdminLoggedIn(false);
            setShowAdminDashboard(false);
          }}
          onDataChanged={() => {
            loadAdmissions();
          }}
          onClose={() => setShowAdminDashboard(false)}
        />
      )}

      {/* Offline Indicator for PWA */}
      <OfflineIndicator />

      {/* Footer with Discreet Admin Portal Trigger */}
      <footer className="bg-slate-900 text-slate-400 text-xs py-7 border-t border-slate-800 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-right">
          <div>
            <span className="font-bold text-white">دليلك الجامعي – العراق</span> • منظومة القبول المركزي الحكومي 2025–2026
            <div className="text-[11px] text-slate-500 mt-0.5">
              تطبيق ويب تقدمي (PWA) يعمل بدون إنترنت مع حفظ دائم للبيانات
            </div>
          </div>

          {/* Discreet Admin Lock Link (No credentials revealed anywhere) */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (isAdminLoggedIn) {
                  setShowAdminDashboard(true);
                } else {
                  setShowAdminLoginModal(true);
                }
              }}
              className="text-slate-500 hover:text-slate-300 transition flex items-center gap-1.5 text-[11px] cursor-pointer"
              title="دخول الإدارة"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>بوابة الإدارة</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
