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

  // Smarter active check: accurately matches specific sub-paths
  const isPathActive = (tabName) => {
    if (!pathname) return false;
    switch(tabName) {
      case 'home': return pathname === '/';
      case 'orders': return pathname.startsWith('/orders') && !pathname.includes('quick-paste');
      case 'quick': return pathname.startsWith('/orders/quick-paste');
      case 'trend': return pathname.startsWith('/price-trend');
      default: return false;
    }
  };

  return (
    <>
      {/* 📱 Mobile Bottom Navigation (Always on top with z-[60]) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-[60] pb-safe shadow-[0_-4px_25px_rgba(0,0,0,0.08)]">
        <div className="flex justify-between items-center h-[68px] max-w-md mx-auto relative px-2">
          
          {/* 1. Home */}
          <Link href="/" prefetch={false} onClick={() => setIsMenuOpen(false)} className={`flex flex-col items-center justify-center p-2 w-16 transition-colors duration-200 ${isPathActive('home') ? 'text-green-600' : 'text-slate-400 hover:text-gray-600'}`}>
            <div className={`mb-1 transition-transform ${isPathActive('home') ? 'scale-110' : ''}`}>
               <svg className="w-6 h-6 pointer-events-none" fill={isPathActive('home') ? "currentColor" : "none"} stroke={isPathActive('home') ? "none" : "currentColor"} viewBox="0 0 24 24">
                  {isPathActive('home') ? (
                    <path fillRule="evenodd" d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" clipRule="evenodd" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>
                  )}
               </svg>
            </div>
            <span className={`text-[10px] leading-tight ${isPathActive('home') ? 'font-black' : 'font-medium'}`}>Home</span>
          </Link>

          {/* 2. Orders */}
          <Link href="/orders/list" prefetch={false} onClick={() => setIsMenuOpen(false)} className={`flex flex-col items-center justify-center p-2 w-16 transition-colors duration-200 ${isPathActive('orders') ? 'text-green-600' : 'text-slate-400 hover:text-gray-600'}`}>
            <div className={`mb-1 transition-transform ${isPathActive('orders') ? 'scale-110' : ''}`}>
              <svg className="w-6 h-6 pointer-events-none" fill={isPathActive('orders') ? "currentColor" : "none"} stroke={isPathActive('orders') ? "none" : "currentColor"} viewBox="0 0 24 24">
                {isPathActive('orders') ? (
                   <>
                     <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                     <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                   </>
                ) : (
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
                )}
              </svg>
            </div>
            <span className={`text-[10px] leading-tight ${isPathActive('orders') ? 'font-black' : 'font-medium'}`}>Orders</span>
          </Link>

          {/* 3. Center Main Menu Button (Transforms into Close/X Button when open) */}
          <div className="relative w-20 h-full flex justify-center z-[65]">
            <button 
              type="button"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className={`absolute bottom-2 text-white rounded-full w-[72px] h-[72px] flex items-center justify-center shadow-xl border-[4px] border-white active:scale-90 transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                isMenuOpen ? 'bg-red-500 rotate-90' : 'bg-[#0f172a] rotate-0'
              }`}
            >
              {isMenuOpen ? (
                <svg className="w-8 h-8 pointer-events-none drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              ) : (
                <svg className="w-7 h-7 pointer-events-none drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path>
                </svg>
              )}
            </button>
          </div>

          {/* 4. Quick Paste */}
          <Link href="/orders/quick-paste" prefetch={false} onClick={() => setIsMenuOpen(false)} className={`flex flex-col items-center justify-center p-2 w-16 transition-colors duration-200 ${isPathActive('quick') ? 'text-green-600' : 'text-slate-400 hover:text-gray-600'}`}>
             <div className={`mb-1 transition-transform ${isPathActive('quick') ? 'scale-110' : ''}`}>
               <svg className="w-6 h-6 pointer-events-none" fill={isPathActive('quick') ? "currentColor" : "none"} stroke={isPathActive('quick') ? "none" : "currentColor"} viewBox="0 0 24 24">
                 {isPathActive('quick') ? (
                   <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                 ) : (
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                 )}
               </svg>
             </div>
            <span className={`text-[10px] leading-tight ${isPathActive('quick') ? 'font-black' : 'font-medium'}`}>Quick</span>
          </Link>

          {/* 5. Price Trend */}
          <Link href="/price-trend" prefetch={false} onClick={() => setIsMenuOpen(false)} className={`flex flex-col items-center justify-center p-2 w-16 transition-colors duration-200 ${isPathActive('trend') ? 'text-green-600' : 'text-slate-400 hover:text-gray-600'}`}>
            <div className={`mb-1 transition-transform ${isPathActive('trend') ? 'scale-110' : ''}`}>
              <svg className="w-6 h-6 pointer-events-none" fill={isPathActive('trend') ? "currentColor" : "none"} stroke={isPathActive('trend') ? "none" : "currentColor"} viewBox="0 0 24 24">
                {isPathActive('trend') ? (
                  <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414 0L17 14.414V17a1 1 0 102 0V9a1 1 0 00-1-1h-8a1 1 0 100 2h4.586l-3.293 3.293-2.293-2.293A1 1 0 007.586 11L5 13.586V5h14a1 1 0 100-2H3z" clipRule="evenodd" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"></path>
                )}
              </svg>
            </div>
            <span className={`text-[10px] leading-tight ${isPathActive('trend') ? 'font-black' : 'font-medium'}`}>Trend</span>
          </Link>

        </div>
      </nav>

      {/* 📱 Full Screen Overlay Backdrop */}
      <div 
        className={`fixed inset-0 bg-slate-900/60 z-[40] transition-opacity duration-300 md:hidden backdrop-blur-sm ${isMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} 
        onClick={() => setIsMenuOpen(false)} 
      />

      {/* 📱 Slide-up Full Screen Menu (Stops behind the bottom nav, z-[50]) */}
      <div 
        className={`fixed inset-x-0 bottom-0 top-0 z-[50] flex flex-col bg-gray-50 md:hidden transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
          isMenuOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        
        {/* Header (No close button needed here anymore since FAB handles it) */}
        <div className="flex justify-center items-center px-6 py-6 border-b border-gray-200/60 bg-white shadow-sm shrink-0">
          <h2 className="text-lg font-black text-[#0f172a] tracking-widest uppercase">System Menu</h2>
        </div>

        {/* Menu Links */}
        {/* pb-[100px] ensures the bottom items aren't hidden behind the navigation bar */}
        <div className="flex flex-col px-4 py-4 overflow-y-auto pb-[100px] h-full custom-scrollbar">
          
          <div className="bg-white rounded-3xl p-2 shadow-sm border border-gray-100 mb-4">
            <Link href="/customers" prefetch={false} onClick={() => setIsMenuOpen(false)} className="flex items-center text-base font-bold text-gray-700 p-4 active:bg-gray-50 rounded-2xl transition-colors">
              <span className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center mr-4 shadow-inner"><svg className="w-5 h-5 pointer-events-none" fill="currentColor" stroke="none" viewBox="0 0 24 24"><path d="M12 4a4 4 0 100 8 4 4 0 000-8zM2 20a10 10 0 0120 0H2z"></path></svg></span>
              Customers Master
            </Link>
            <div className="h-px w-full bg-gray-50 my-1"></div>
            <Link href="/products" prefetch={false} onClick={() => setIsMenuOpen(false)} className="flex items-center text-base font-bold text-gray-700 p-4 active:bg-gray-50 rounded-2xl transition-colors">
              <span className="w-10 h-10 rounded-xl bg-green-100 text-green-600 flex items-center justify-center mr-4 shadow-inner"><svg className="w-5 h-5 pointer-events-none" fill="currentColor" stroke="none" viewBox="0 0 24 24"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg></span>
              Product Catalog
            </Link>
            <div className="h-px w-full bg-gray-50 my-1"></div>
            <Link href="/delivery" prefetch={false} onClick={() => setIsMenuOpen(false)} className="flex items-center text-base font-bold text-gray-700 p-4 active:bg-gray-50 rounded-2xl transition-colors">
              <span className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center mr-4 shadow-inner"><svg className="w-5 h-5 pointer-events-none" fill="currentColor" stroke="none" viewBox="0 0 24 24"><path d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg></span>
              Delivery Schedule
            </Link>
            <div className="h-px w-full bg-gray-50 my-1"></div>
            <Link href="/reports" prefetch={false} onClick={() => setIsMenuOpen(false)} className="flex items-center text-base font-bold text-gray-700 p-4 active:bg-gray-50 rounded-2xl transition-colors">
              <span className="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center mr-4 shadow-inner"><svg className="w-5 h-5 pointer-events-none" fill="currentColor" stroke="none" viewBox="0 0 24 24"><path d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg></span>
              System Reports
            </Link>
          </div>
          
          <Link href="/login" prefetch={false} onClick={() => setIsMenuOpen(false)} className="flex items-center text-base font-black text-red-500 p-4 mt-auto mb-6 bg-white shadow-sm justify-center rounded-2xl border border-red-100 active:bg-red-50 active:scale-95 transition-all">
            Log Out Account
          </Link>

        </div>
      </div>
    </>
  );
}