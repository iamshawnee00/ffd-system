import { Suspense } from 'react';
import BatchDoReportContent from './BatchDoReportContent';

/**
 * This is a Server Component by default in the App Router.
 * By wrapping the content in Suspense, we prevent the "CSR Bailout" 
 * error during Vercel's static generation process.
 */
export default function BatchDoPage() {
  return (
    <div className="min-h-screen bg-[#0F172A] p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Batch Operations Report
          </h1>
          <p className="text-slate-400 text-sm">
            Real-time monitoring and historical batch data.
          </p>
        </header>

        {/* CRITICAL FIX: The Suspense boundary allows Next.js to prerender 
          the layout above while deferring the searchParam-dependent logic 
          to the client side. 
        */}
        <Suspense fallback={
          <div className="w-full h-64 flex items-center justify-center rounded-xl border border-slate-800 bg-[#1E293B]">
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