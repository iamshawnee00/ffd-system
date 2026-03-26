'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function MobileNavigation() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();

  // Hide the entire navigation bar on the login page
  if (pathname === '/login' || pathname?.includes('/login')) {
    return null;
  }

  const isActive = (path) => pathname === path;

  return (
    <>
      {/* 📱 Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 pb-safe shadow-[0_-4px_15px_rgba(0,0,0,0.05)]">
        <div className="flex justify-between items-center h-[68px] max-w-md mx-auto relative px-2">
          
          {/* 1. Home - Added prefetch={false} to prevent 404 RSC hanging */}
          <Link href="/" prefetch={false} className={`flex flex-col items-center p-2 w-16 transition-colors ${isActive('/') ? 'text-green-600' : 'text-slate-500 hover:text-green-600'}`}>
            <svg className="w-6 h-6 mb-1 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
            <span className="text-[10px] font-medium leading-tight">Home</span>
          </Link>

          {/* 2. Orders */}
          <Link href="/orders/list" prefetch={false} className={`flex flex-col items-center p-2 w-16 transition-colors ${isActive('/orders/list') ? 'text-green-600' : 'text-slate-500 hover:text-green-600'}`}>
            <svg className="w-6 h-6 mb-1 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
            <span className="text-[10px] font-medium leading-tight">Orders</span>
          </Link>

          {/* 3. Center Main Menu Button */}
          {/* Added type="button" and z-50 to ensure it's always the top clickable layer */}
          <div className="relative w-20 h-full flex justify-center z-50">
            <button 
              type="button"
              onClick={() => setIsMenuOpen(true)}
              className="absolute bottom-2 bg-[#0f172a] text-white rounded-full w-[72px] h-[72px] flex items-center justify-center shadow-lg border-[4px] border-white active:scale-95 transition-transform"
            >
              <svg className="w-8 h-8 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>
            </button>
          </div>

          {/* 4. Quick Paste */}
          <Link href="/orders/quick-paste" prefetch={false} className={`flex flex-col items-center p-2 w-16 transition-colors ${isActive('/orders/quick-paste') ? 'text-green-600' : 'text-slate-500 hover:text-green-600'}`}>
             <svg className="w-6 h-6 mb-1 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            <span className="text-[10px] font-medium leading-tight">Quick</span>
          </Link>

          {/* 5. Price Trend */}
          <Link href="/price-trend" prefetch={false} className={`flex flex-col items-center p-2 w-16 transition-colors ${isActive('/price-trend') ? 'text-green-600' : 'text-slate-500 hover:text-green-600'}`}>
            <svg className="w-6 h-6 mb-1 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"></path></svg>
            <span className="text-[10px] font-medium leading-tight">Trend</span>
          </Link>

        </div>
      </nav>

      {/* 📱 Full Screen Overlay Menu */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-white md:hidden animate-in fade-in duration-200">
          
          {/* Header & Close Button */}
          <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-gray-50 shadow-sm">
            <h2 className="text-xl font-bold text-[#0f172a]">Menu</h2>
            {/* Dramatically increased padding (p-4) to make the hit-box huge, added type="button" */}
            <button 
              type="button"
              onClick={() => setIsMenuOpen(false)}
              className="bg-white text-gray-500 p-3 -mr-3 rounded-full shadow-sm hover:bg-gray-100 border border-gray-200 active:scale-90 transition-transform"
            >
              <svg className="w-6 h-6 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>

          {/* Menu Links */}
          <div className="flex flex-col px-6 py-2 overflow-y-auto pb-20">
            <Link href="/customers" prefetch={false} onClick={() => setIsMenuOpen(false)} className="flex items-center text-lg font-medium text-gray-700 py-5 border-b border-gray-100 active:bg-gray-50 rounded-lg">
              <span className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center mr-4"><svg className="w-5 h-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg></span>
              Customers
            </Link>
            
            <Link href="/products" prefetch={false} onClick={() => setIsMenuOpen(false)} className="flex items-center text-lg font-medium text-gray-700 py-5 border-b border-gray-100 active:bg-gray-50 rounded-lg">
              <span className="w-10 h-10 rounded-lg bg-green-100 text-green-600 flex items-center justify-center mr-4"><svg className="w-5 h-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg></span>
              Product Catalog
            </Link>
            
            <Link href="/delivery" prefetch={false} onClick={() => setIsMenuOpen(false)} className="flex items-center text-lg font-medium text-gray-700 py-5 border-b border-gray-100 active:bg-gray-50 rounded-lg">
              <span className="w-10 h-10 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center mr-4"><svg className="w-5 h-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg></span>
              Delivery Schedule
            </Link>
            
            <Link href="/reports" prefetch={false} onClick={() => setIsMenuOpen(false)} className="flex items-center text-lg font-medium text-gray-700 py-5 border-b border-gray-100 active:bg-gray-50 rounded-lg">
              <span className="w-10 h-10 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center mr-4"><svg className="w-5 h-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg></span>
              Reports
            </Link>
            
            <Link href="/login" prefetch={false} onClick={() => setIsMenuOpen(false)} className="flex items-center text-lg font-bold text-red-500 py-4 mt-8 bg-red-50 justify-center rounded-xl border border-red-100 active:bg-red-100">
              Log Out
            </Link>
          </div>
        </div>
      )}
    </>
  );
}