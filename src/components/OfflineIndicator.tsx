import React from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { WifiOff, Database } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-xl bg-slate-900/90 text-amber-300 border border-amber-500/30 px-3.5 py-2 text-xs font-semibold shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-2">
      <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
      <div className="flex flex-col">
        <span>أنت تعمل حالياً بدون إنترنت (وضع عدم الاتصال)</span>
        <span className="text-[10px] text-slate-300 flex items-center gap-1 font-normal">
          <Database className="w-3 h-3 text-blue-400" />
          تطبيق «دليلك الجامعي» يعمل ببيانات الذاكرة المحلية المخزنة
        </span>
      </div>
    </div>
  );
};
