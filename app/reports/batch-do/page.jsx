import { Suspense } from 'react';
import BatchDoReportContent from './reportcontent';

export default function BatchDoPage() {
  return (
    /* Background is slate-900 on screen, but transparent/white on print */
    <div className="min-h-screen bg-[#0F172A] print:bg-white p-4 md:p-8 print:p-0">
      <div className="max-w-7xl mx-auto">
        {/* Hide header during printing */}
        <header className="mb-8 print:hidden">
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Batch Operations Report
          </h1>
          <p className="text-slate-400 text-sm">
            Real-time monitoring and historical batch data.
          </p>
        </header>

        <Suspense fallback={
          <div className="w-full h-64 flex items-center justify-center rounded-xl border border-slate-800 bg-[#1E293B] print:hidden">
            <div className="flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-slate-400 animate-pulse text-sm font-medium">
                Initializing Intelligence Feed...
              </p>
            </div>
          </div>
        }>
          <BatchDoReportContent />
        </Suspense>
      </div>
    </div>
  );
}