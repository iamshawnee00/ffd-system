import { Suspense } from 'react';
import UsageReportContent from './UsageReportContent';

export default function UsageReportPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 font-medium">Loading Usage Report...</p>
        </div>
      </div>
    }>
      <UsageReportContent />
    </Suspense>
  );
}