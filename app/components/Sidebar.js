'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '../lib/supabaseClient';
import { useSidebar } from '../context/SidebarContext';
import { 
  HomeIcon, 
  PlusCircleIcon, 
  ClipboardDocumentListIcon, 
  TruckIcon, 
  ChartBarIcon, 
  CubeIcon, 
  AdjustmentsHorizontalIcon, 
  UserGroupIcon, 
  ArrowLeftOnRectangleIcon, 
  Bars3Icon, 
  ShoppingBagIcon, 
  XMarkIcon, 
  PresentationChartLineIcon 
} from '@heroicons/react/24/outline';

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  
  // Use context for sidebar state
  const { isCollapsed, setIsCollapsed, isMobileOpen, setIsMobileOpen } = useSidebar();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const menuItems = [
    { name: 'Dashboard', path: '/', icon: HomeIcon },
    { name: 'New Order', path: '/orders/new', icon: PlusCircleIcon },
    { name: 'Quick Paste Order', path: '/orders/quick-paste', icon: ClipboardDocumentListIcon },
    { name: 'Log Purchase', path: '/purchase/new', icon: ShoppingBagIcon },
    { name: 'Order List', path: '/orders/list', icon: ClipboardDocumentListIcon },
    { name: 'Delivery / Reports', path: '/delivery', icon: TruckIcon },
    { name: 'Price Trend', path: '/price-trend', icon: ChartBarIcon },
    { name: 'Products', path: '/products', icon: CubeIcon },
    { name: 'Stock Adjust', path: '/stock', icon: AdjustmentsHorizontalIcon },
    { name: 'Customers', path: '/customers', icon: UserGroupIcon },
    { name: 'Business Insights', path: '/insights', icon: PresentationChartLineIcon },
  ];

  return (
    <>
      {/* DESKTOP SIDEBAR (Fixed) */}
      <div 
        className={`hidden md:flex bg-slate-900 text-white min-h-screen flex-col fixed left-0 top-0 h-full shadow-xl transition-all duration-300 z-50 ${
          isCollapsed ? 'w-20' : 'w-72'
        }`}
      >
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          {!isCollapsed && (
            <h1 className="text-2xl font-bold text-green-400 tracking-tight">FFD<span className="text-white">System</span></h1>
          )}
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 mx-auto transition-colors"
          >
            <Bars3Icon className="w-6 h-6" />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto custom-scrollbar">
          {menuItems.map((item) => {
            const isActive = pathname === item.path;
            return (
              <Link 
                key={item.path} 
                href={item.path}
                className={`flex items-center px-3 py-3 rounded-xl transition-all duration-200 group relative ${
                  isActive ? 'bg-green-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <item.icon className={`w-6 h-6 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-500 group-hover:text-green-400'}`} />
                {!isCollapsed && <span className="ml-3 font-medium text-sm whitespace-nowrap">{item.name}</span>}
                
                {isCollapsed && (
                  <div className="absolute left-full ml-4 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 border border-slate-700">
                    {item.name}
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button onClick={handleLogout} className={`w-full flex items-center px-3 py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-all ${isCollapsed ? 'justify-center' : ''}`}>
            <ArrowLeftOnRectangleIcon className="w-6 h-6 flex-shrink-0" />
            {!isCollapsed && <span className="ml-3 font-medium text-sm">Sign Out</span>}
          </button>
        </div>
      </div>

      {/* MOBILE HEADER */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-slate-900 text-white z-50 flex items-center justify-between px-4 shadow-md">
        <h1 className="text-lg font-bold text-green-400">FFDSystem</h1>
        <button onClick={() => setIsMobileOpen(!isMobileOpen)} className="p-2 text-white">
          {isMobileOpen ? <XMarkIcon className="w-6 h-6" /> : <Bars3Icon className="w-6 h-6" />}
        </button>
      </div>

      {/* MOBILE MENU OVERLAY */}
      {isMobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-slate-900/95 pt-20 px-4 backdrop-blur-sm">
          <nav className="space-y-1">
            {menuItems.map((item) => {
              const isActive = pathname === item.path;
              return (
                <Link 
                  key={item.path} 
                  href={item.path} 
                  onClick={() => setIsMobileOpen(false)}
                  className={`flex items-center p-4 rounded-2xl transition-all ${
                    isActive ? 'bg-green-600 text-white' : 'text-slate-400'
                  }`}
                >
                  <item.icon className="w-7 h-7" />
                  <span className="ml-4 font-bold text-lg">{item.name}</span>
                </Link>
              );
            })}
            
            <div className="border-t border-slate-800 my-4 pt-4">
              <button 
                onClick={() => { setIsMobileOpen(false); handleLogout(); }}
                className="w-full flex items-center p-4 rounded-2xl text-red-400 hover:bg-red-500/10 transition-all"
              >
                <ArrowLeftOnRectangleIcon className="w-7 h-7" />
                <span className="ml-4 font-bold text-lg">Sign Out</span>
              </button>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}