import { Suspense } from 'react';
import UsageReportContent from './UsageReportContent'; // Make sure this path is correct relative to page.jsx

export default function UsageReportPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen w-full items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
          <p className="font-medium text-gray-600">Loading Usage Report...</p>
        </div>
      </div>
    }>
      <UsageReportContent />
    </Suspense>
  );
}