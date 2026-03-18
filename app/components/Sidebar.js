'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '../lib/supabaseClient';
import { useSidebar } from '../context/SidebarContext';
import { 
  HomeIcon, 
  ShoppingCartIcon,
  ShoppingBagIcon, 
  ClipboardDocumentListIcon, 
  TruckIcon,
  ChartBarIcon,
  CubeIcon,
  ArrowPathIcon,
  UserGroupIcon,
  PresentationChartLineIcon,
  Bars3Icon,
  XMarkIcon,
  PlusCircleIcon
} from '@heroicons/react/24/outline';

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { isCollapsed, setIsCollapsed, isMobileOpen, setIsMobileOpen } = useSidebar();
  const [currentUser, setCurrentUser] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        const email = session.user.email || "";
        setCurrentUser(email.split('@')[0]);
      }
    });
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const menuItems = [
    { name: 'Dashboard', path: '/', icon: HomeIcon },
    { name: 'Order Management', path: '/orders/new', icon: PlusCircleIcon },
    { name: 'Log Purchase', path: '/purchase/new', icon: ShoppingBagIcon },
    { name: 'Quick Paste Order', path: '/orders/quick-paste', icon: ClipboardDocumentListIcon },
    { name: 'Delivery / Reports', path: '/delivery', icon: TruckIcon },
    { name: 'Price Trend', path: '/price-trend', icon: ChartBarIcon },
    { name: 'Products', path: '/products', icon: CubeIcon },
    { name: 'Stock Adjust', path: '/stock', icon: ArrowPathIcon },
    { name: 'Customers', path: '/customers', icon: UserGroupIcon },
    { name: 'Business Insights', path: '/insights', icon: PresentationChartLineIcon },
  ];

  return (
    <>
      {/* Mobile Top Bar (Only visible on small screens) */}
      <div className="md:hidden flex items-center justify-between bg-[#0F172A] text-white p-4 fixed top-0 w-full z-[100] shadow-md">
        <div className="flex items-center gap-3">
            <span className="font-black text-xl tracking-tight leading-none text-[#00E676]">
              FFD<span className="text-white font-bold">System</span>
            </span>
        </div>
        <button onClick={() => setIsMobileOpen(true)} className="p-1 hover:bg-white/10 rounded">
          <Bars3Icon className="w-6 h-6" />
        </button>
      </div>

      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/60 z-[100] backdrop-blur-sm animate-in fade-in"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <div className={`
        fixed md:sticky top-0 left-0 h-screen md:h-screen z-[110] md:z-auto
        bg-[#0F172A] text-gray-300 flex flex-col font-sans transition-all duration-300 ease-in-out
        ${isMobileOpen ? 'translate-x-0 w-72' : '-translate-x-full md:translate-x-0'}
        ${isCollapsed ? 'md:w-20' : 'md:w-72'}
      `}>
        {/* Sidebar Header / Logo */}
        <div className="flex items-center justify-between p-6 shrink-0 border-b border-white/5">
          {!isCollapsed && (
            <span className="font-black text-2xl tracking-tight leading-none text-[#00E676] overflow-hidden">
              FFD<span className="text-white font-bold">System</span>
            </span>
          )}
          {isCollapsed && (
            <span className="font-black text-2xl tracking-tight leading-none text-[#00E676] mx-auto">
              F
            </span>
          )}
          
          <button onClick={() => setIsCollapsed(!isCollapsed)} className="hidden md:block p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white transition">
            <Bars3Icon className="w-5 h-5" />
          </button>

          <button onClick={() => setIsMobileOpen(false)} className="md:hidden p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white transition">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Navigation Links - Scrollable Area */}
        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-2 custom-scrollbar">
          {menuItems.map((item) => {
            // 1. Clean trailing slash for matching (caused by next.config.js export settings)
            const cleanPath = pathname?.endsWith('/') && pathname !== '/' ? pathname.slice(0, -1) : pathname;
            
            // 2. Base exact match
            let isActive = cleanPath === item.path;

            // 3. Keep "Order Management" highlighted when inside its sub-tabs
            if (item.path === '/orders/new' && (cleanPath === '/orders/list' || cleanPath === '/orders/standing')) {
                isActive = true;
            }

            return (
              <Link 
                key={item.name} 
                href={item.path}
                onClick={() => setIsMobileOpen(false)}
                className={`
                  flex items-center py-3.5 px-4 rounded-xl font-bold transition-all duration-200 group
                  ${isActive 
                    ? 'bg-green-600 text-white shadow-[0_0_15px_rgba(22,163,74,0.4)]' 
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                  }
                  ${isCollapsed ? 'justify-center px-0' : 'gap-4'}
                `}
              >
                <item.icon className={`shrink-0 ${isCollapsed ? 'w-6 h-6' : 'w-5 h-5'} ${isActive ? 'text-white' : 'text-gray-500 group-hover:text-white transition-colors'}`} />
                {!isCollapsed && <span className="text-sm tracking-wide whitespace-nowrap">{item.name}</span>}
                
                {/* Tooltip for collapsed mode */}
                {isCollapsed && (
                  <div className="absolute left-full ml-4 px-3 py-1.5 bg-gray-800 text-white text-xs font-bold rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-xl">
                    {item.name}
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Profile & Logout - Fixed Bottom */}
        <div className="p-4 border-t border-white/5 shrink-0 bg-[#0B1120]">
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} mb-4 px-2`}>
            {!isCollapsed && (
                <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-black text-xs shrink-0">
                        {currentUser ? currentUser.charAt(0).toUpperCase() : 'U'}
                    </div>
                    <div className="truncate">
                        <p className="text-xs font-bold text-white truncate capitalize">{currentUser || 'User'}</p>
                        <p className="text-[10px] font-medium text-gray-500 uppercase tracking-widest">Admin</p>
                    </div>
                </div>
            )}
            {isCollapsed && (
                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-black text-xs shrink-0 cursor-pointer" title={currentUser}>
                    {currentUser ? currentUser.charAt(0).toUpperCase() : 'U'}
                </div>
            )}
          </div>

          <button 
            onClick={handleLogout}
            className={`
              w-full flex items-center py-3 rounded-xl font-bold text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors group
              ${isCollapsed ? 'justify-center px-0' : 'px-4 gap-4'}
            `}
          >
            <span className={`font-black shrink-0 ${isCollapsed ? 'text-lg' : ''}`}>N</span>
            {!isCollapsed && <span className="text-sm tracking-wide">Sign Out</span>}
            
            {isCollapsed && (
                <div className="absolute left-full ml-4 px-3 py-1.5 bg-gray-800 text-white text-xs font-bold rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-xl">
                  Sign Out
                </div>
            )}
          </button>
        </div>

      </div>
    </>
  );
}