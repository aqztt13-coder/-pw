import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, MonitorCheck, HelpCircle, X, ExternalLink } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  // If already installed in standalone window mode
  if (isInstalled) {
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-900/40 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-medium">
        <MonitorCheck className="w-3.5 h-3.5 text-emerald-400" />
        <span>مثبت كاختصار على سطح المكتب</span>
      </div>
    );
  }

  // Chromium / Edge / Android / Desktop flow with direct prompt
  if (isInstallable) {
    return (
      <button
        onClick={async () => {
          const success = await install();
          if (success) setShowSuccessToast(true);
        }}
        className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold px-3.5 py-2 text-xs md:text-sm shadow-md hover:shadow-lg transition cursor-pointer active:scale-95"
        title="تثبيت التطبيق على سطح المكتب للعمل بدون إنترنت"
      >
        <Download className="w-4 h-4 text-slate-950" />
        <span>تثبيت اختصار لسطح المكتب</span>
      </button>
    );
  }

  // iOS Safari flow or generic browser desktop guide
  return (
    <>
      <button
        onClick={() => setShowGuide(true)}
        className="flex items-center gap-2 rounded-xl bg-blue-800/80 hover:bg-blue-800 text-blue-100 hover:text-white border border-blue-600/40 px-3 py-1.5 text-xs font-semibold transition cursor-pointer"
        title="طريقة إنشاء اختصار على سطح المكتب والعمل دون إنترنت"
      >
        <Download className="w-3.5 h-3.5 text-amber-400" />
        <span>تثبيت اختصار لسطح المكتب</span>
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl text-slate-900 border border-slate-200 text-right">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-50 text-blue-700 rounded-xl">
                  <MonitorCheck className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  {isIOS ? 'إضافة التطبيق للشاشة الرئيسية (iOS)' : 'تثبيت كاختصار على سطح المكتب'}
                </h3>
              </div>
              <button
                onClick={() => setShowGuide(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isIOS ? (
              <div className="space-y-3 text-sm text-slate-600 leading-relaxed">
                <p>لتثبيت «دليلك الجامعي» على جهاز الآيفون أو الآيباد والوصول إليه بدون إنترنت:</p>
                <ol className="list-decimal list-inside space-y-2 pr-2 text-slate-800 font-medium">
                  <li>
                    اضغط على زر <strong className="text-blue-700">المشاركة (Share)</strong> في شريط متصفح سفاري السفلي.
                  </li>
                  <li>
                    مرر للأسفل واختر <strong className="text-blue-700">«إضافة إلى الشاشة الرئيسية» (Add to Home Screen)</strong>.
                  </li>
                  <li>
                    اضغط <strong className="text-blue-700">«إضافة» (Add)</strong> في الزاوية العلوية.
                  </li>
                </ol>
              </div>
            ) : (
              <div className="space-y-3 text-sm text-slate-600 leading-relaxed">
                <p>يدعم موقع «دليلك الجامعي» العمل كتطبيق مستقل PWA والعمل بدون إنترنت تماماً:</p>
                <div className="bg-blue-50 border border-blue-100 p-3.5 rounded-xl space-y-2 text-blue-950 font-medium text-xs">
                  <div className="flex items-start gap-2">
                    <span className="bg-blue-600 text-white w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-xs">1</span>
                    <span>من شريط عنوان المتصفح (في الأعلى): اضغط على أيقونة التثبيت <Download className="w-3.5 h-3.5 inline mx-1 text-blue-700" /> أو من قائمة المتصفح (⋮).</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="bg-blue-600 text-white w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-xs">2</span>
                    <span>اختر <strong>«تثبيت دليلك الجامعي»</strong> أو <strong>«إنشاء اختصار لسطح المكتب»</strong>.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="bg-blue-600 text-white w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-xs">3</span>
                    <span>سيظهر التطبيق كأيقونة مستقلة على سطح المكتب وقائمة البرامج ويعمل دون اتصال بالشبكة.</span>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={() => setShowGuide(false)}
              className="mt-5 w-full rounded-xl bg-blue-900 py-2.5 text-sm font-bold text-white hover:bg-blue-800 cursor-pointer shadow-md transition"
            >
              تم، حسناً
            </button>
          </div>
        </div>
      )}

      {showSuccessToast && (
        <div className="fixed bottom-5 left-5 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-sm">
          <MonitorCheck className="w-5 h-5" />
          <span>تم تثبيت التطبيق بنجاح كاختصار لسطح المكتب!</span>
        </div>
      )}
    </>
  );
};
