'use client';
import './globals.css';
import { Poppins } from 'next/font/google';
import Sidebar from './components/Sidebar';
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

  // 1. 如果是客户端门户或登录页，返回无侧边栏布局
  // 打印时：解除 h-[100dvh] 限制，允许溢出 (print:h-auto print:overflow-visible)
  if (isClientPortal || isLogin) {
    return (
      <main className="w-full bg-gray-50 h-[100dvh] overflow-y-auto overflow-x-hidden overscroll-none print:h-auto print:overflow-visible">
        {children}
      </main>
    );
  }

  // 2. 内部员工布局 (带有侧边栏)
  return (
    <div className="flex flex-col md:flex-row h-[100dvh] overflow-hidden bg-gray-100 overscroll-none print:h-auto print:overflow-visible print:block">
      
      {/* 桌面端侧边栏 */}
      <div 
        className={`print:hidden hidden md:block flex-shrink-0 transition-all duration-300 h-full ${
          isCollapsed ? 'w-20' : 'w-72'
        }`}
      >
        <Sidebar />
      </div>
      
      {/* 手机端顶部/侧边栏导航区 (定高，不参与滚动) */}
      <div className="md:hidden print:hidden flex-none z-50">
        <Sidebar />
      </div>
      
      {/* 主内容区：独立滚动，彻底脱离原生 Body 滚动 */}
      {/* 打印时：必须解除所有的滚动限制，变成常规块级元素 */}
      <main className="flex-1 w-full h-full overflow-y-auto overflow-x-hidden md:pt-0 pt-[72px] overscroll-none pb-20 md:pb-0 print:h-auto print:overflow-visible print:block print:pt-0">
        {children}
      </main>
      
    </div>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // 注册 Service Worker 以激活 PWA 安装功能
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

  // 原生 App 体验优化：强制禁用双指缩放和双击缩放 (针对 iOS Safari 等忽略 meta 标签的浏览器)
  useEffect(() => {
    // 阻止双指捏合缩放 (Pinch-to-zoom)
    const preventPinchZoom = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    };

    // 阻止双击缩放 (Double-tap to zoom)
    let lastTouchEnd = 0;
    const preventDoubleTapZoom = (e: TouchEvent) => {
      const now = new Date().getTime();
      if (now - lastTouchEnd <= 300) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    };

    // 阻止 Safari 特有的手势缩放事件
    const preventGestureStart = (e: Event) => {
      e.preventDefault();
    };

    // 必须使用 { passive: false } 才能让 preventDefault() 真正生效
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
        {/* PWA Manifest 链接 */}
        <link rel="manifest" href="/manifest.json" />
        
        {/* iOS PWA 专属支持标签 */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="FFD System" />
        <link rel="apple-touch-icon" href="/icon-192x192.png" />

        {/* 原生 App 体验：强制视口不可缩放，彻底禁用双指缩放，适配刘海屏及状态栏 */}
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
        <meta name="theme-color" content="#0F172A" />
      </head>
      
      {/* 在 body 层面彻底禁用滚动，配合内部的 h-[100dvh] 实现完美 App 体验 */}
      {/* 打印时：恢复溢出 (print:overflow-visible) 和允许文本选中 (print:select-auto) */}
      <body className={`${poppins.className} overflow-hidden overscroll-none select-none print:overflow-visible print:select-auto print:bg-white`}>
        <SidebarProvider>
          <LayoutContent>{children}</LayoutContent>
        </SidebarProvider>
      </body>
    </html>
  );
}