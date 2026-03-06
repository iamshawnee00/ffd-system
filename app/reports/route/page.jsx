import { Suspense } from 'react';
import RouteReportContent from './reportcontent';

export default function RoutePage() {
  return (
    <div className="min-h-screen bg-[#0F172A] print:bg-white p-4 md:p-8 print:p-0">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8 print:hidden">
          <h1 className="text-3xl font-black text-white tracking-tight uppercase">Driver Route Masterlist</h1>
          <p className="text-slate-400 text-sm font-bold mt-2">Delivery sequence generated directly from Shipday route mapping.</p>
        </header>

        <Suspense fallback={
          <div className="w-full h-64 flex items-center justify-center rounded-2xl border border-slate-800 bg-[#1E293B] print:hidden shadow-xl">
            <div className="flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-slate-400 animate-pulse text-sm font-black tracking-widest uppercase">
                Mapping Live Routes...
              </p>
            </div>
          </div>
        }>
          <RouteReportContent />
        </Suspense>
      </div>
    </div>
  );
}