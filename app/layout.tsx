'use client';
import './globals.css';
import { Poppins } from 'next/font/google';
import Sidebar from './components/Sidebar';
import MobileNavigation from './components/MobileNavigation'; // 新增引入
import { SidebarProvider, useSidebar } from './context/SidebarContext';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const poppins = Poppins({ 
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-poppins',
});

function LayoutContent({ children }: { children: React.ReactNode }) {
  const { isCollapsed } = useSidebar();
  const pathname = usePathname();

  // Hide sidebar completely on these paths
  const isClientPortal = pathname.startsWith('/client-portal');
  const isLogin = pathname === '/login';

  // 1. If client portal or login, return layout without sidebar
  if (isClientPortal || isLogin) {
    return (
      <main className="w-full bg-gray-50 h-[100dvh] overflow-y-auto overflow-x-hidden overscroll-none print:h-auto print:overflow-visible">
        {children}
      </main>
    );
  }

  // 2. Internal Layout (Desktop Sidebar + Mobile Bottom Nav)
  return (
    <div className="flex flex-col md:flex-row h-[100dvh] overflow-hidden bg-gray-100 overscroll-none print:h-auto print:overflow-visible print:block relative">
      
      {/* Desktop Sidebar */}
      <div 
        className={`print:hidden hidden md:block flex-shrink-0 transition-all duration-300 h-full ${
          isCollapsed ? 'w-20' : 'w-72'
        }`}
      >
        <Sidebar />
      </div>
      
      {/* Main Content Area */}
      {/* Removed mobile top nav/sidebar and removed top padding to match */}
      <main className="flex-1 w-full h-full overflow-y-auto overflow-x-hidden pb-[80px] md:pb-0 overscroll-none print:h-auto print:overflow-visible print:block print:pt-0">
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      <MobileNavigation />
      
    </div>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Register Service Worker for PWA
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js').then(
          function(registration) {
            console.log('ServiceWorker registration successful with scope: ', registration.scope);
          },
          function(err) {
            console.log('ServiceWorker registration failed: ', err);
          }
        );
      });
    }
  }, []);

  // Native App Experience Optimizations: Disable pinch-to-zoom and double-tap zoom
  useEffect(() => {
    const preventPinchZoom = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    };

    let lastTouchEnd = 0;
    const preventDoubleTapZoom = (e: TouchEvent) => {
      const now = new Date().getTime();
      if (now - lastTouchEnd <= 300) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    };

    const preventGestureStart = (e: Event) => {
      e.preventDefault();
    };

    document.addEventListener('touchmove', preventPinchZoom, { passive: false });
    document.addEventListener('touchend', preventDoubleTapZoom, { passive: false });
    document.addEventListener('gesturestart', preventGestureStart);

    return () => {
      document.removeEventListener('touchmove', preventPinchZoom);
      document.removeEventListener('touchend', preventDoubleTapZoom);
      document.removeEventListener('gesturestart', preventGestureStart);
    };
  }, []);

  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="FFD System" />
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
        <meta name="theme-color" content="#0F172A" />
      </head>
      
      <body className={`${poppins.className} overflow-hidden overscroll-none select-none print:overflow-visible print:select-auto print:bg-white`}>
        <SidebarProvider>
          <LayoutContent>{children}</LayoutContent>
        </SidebarProvider>
      </body>
    </html>
  );
}