'use client';
import { Suspense } from 'react';
import RouteReportContent from './reportcontent';

export default function RoutePage() {
  return (
    <div className="min-h-screen bg-[#0F172A] print:bg-white p-4 md:p-8 print:p-0 print-wrapper">
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

      {/* Aggressive scoped styles to ensure the mobile UI is destroyed during printing */}
      <style jsx global>{`
        @media print {
          /* 1. Force hide the entire global app shell around the content */
          nav, 
          aside, 
          header:not(.print-header), 
          footer,
          [class*="MobileNavigation"],
          [class*="SystemMenu"],
          [class*="sidebar"],
          .fixed,
          .sticky,
          button {
            display: none !important;
            opacity: 0 !important;
            visibility: hidden !important;
            height: 0 !important;
            width: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          /* 2. Reset the viewport and unlock screen-locked heights */
          html, body, main, #__next, .print-wrapper {
            background-color: white !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            overflow: visible !important;
            margin: 0 !important;
            padding: 0 !important;
            position: relative !important;
          }

          /* 3. Ensure the main content takes up 100% width and flows naturally */
          main {
            display: block !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          /* 4. Fix colors for the PDF engine */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  );
}