'use client';
import { Suspense } from 'react';
import BatchDoReportContent from './reportcontent';

export default function BatchDoPage() {
  return (
    // We wrap this in a print-clean div to ensure no parent layout 
    // styles interfere with the report generation.
    <div className="print-wrapper print:bg-white print:p-0">
      <Suspense fallback={
        <div className="p-10 text-center font-black text-gray-400 animate-pulse uppercase tracking-widest">
          Initializing Batch Engine...
        </div>
      }>
        <BatchDoReportContent />
      </Suspense>

      {/* Aggressive scoped styles just for this report route */}
      <style jsx global>{`
        @media print {
          /* 1. Force hide the entire global app shell around the content */
          nav, 
          aside, 
          header, 
          footer:not(.do-footer),
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

          /* 2. Reset the viewport to allow standard scrolling flow */
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

          /* 3. Ensure the main content takes up 100% width and no padding */
          main {
            display: block !important;
            padding: 0 !important;
            margin: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}