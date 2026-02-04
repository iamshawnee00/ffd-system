'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '../lib/supabaseClient';
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
  Bars3Icon, // Changed to Burger Menu
  ShoppingBagIcon // Added for Purchase
} from '@heroicons/react/24/outline';

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const menuItems = [
    { name: 'Dashboard', path: '/', icon: HomeIcon },
    { name: 'New Order', path: '/orders/new', icon: PlusCircleIcon },
    { name: 'Log Purchase', path: '/purchase/new', icon: ShoppingBagIcon }, // New Purchase Link
    { name: 'Order List', path: '/orders/list', icon: ClipboardDocumentListIcon },
    { name: 'Delivery / Reports', path: '/delivery', icon: TruckIcon },
    { name: 'Price Trend', path: '/price-trend', icon: ChartBarIcon },
    { name: 'Products', path: '/products', icon: CubeIcon },
    { name: 'Stock Adjust', path: '/stock', icon: AdjustmentsHorizontalIcon },
    { name: 'Customers', path: '/customers', icon: UserGroupIcon },
  ];

  return (
    <div 
      className={`bg-slate-900 text-white min-h-screen flex flex-col fixed left-0 top-0 h-full shadow-xl transition-all duration-300 z-20 ${
        isCollapsed ? 'w-20' : 'w-72'
      }`}
    >
      {/* HEADER / LOGO */}
      <div className="p-6 border-b border-slate-800 flex items-center justify-between">
        <div className={`flex items-center ${isCollapsed ? 'justify-center w-full' : 'justify-between w-full'}`}>
            {!isCollapsed && (
              <div>
                <h1 className="text-2xl font-bold text-green-400 tracking-tight font-poppins">FFD<span className="text-white">System</span></h1>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">Internal Portal</p>
              </div>
            )}
            
            {/* Toggle Button - Burger Menu */}
            <button 
              onClick={() => setIsCollapsed(!isCollapsed)}
              className={`text-slate-400 hover:text-white transition-colors p-1 rounded-md hover:bg-slate-800 ${isCollapsed ? 'mx-auto' : ''}`}
              title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              <Bars3Icon className="w-6 h-6" />
            </button>
        </div>
      </div>

      {/* MENU */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto custom-scrollbar">
        {menuItems.map((item) => {
          const isActive = pathname === item.path;
          return (
            <Link 
              key={item.path} 
              href={item.path}
              className={`flex items-center px-3 py-3 rounded-xl transition-all duration-200 group relative ${
                isActive 
                  ? 'bg-green-600 text-white shadow-lg shadow-green-900/20' 
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <item.icon className={`w-6 h-6 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-500 group-hover:text-green-400'}`} />
              
              {!isCollapsed && (
                <span className="ml-3 font-medium text-sm tracking-wide font-poppins">{item.name}</span>
              )}

              {/* Tooltip for collapsed state */}
              {isCollapsed && (
                <div className="absolute left-full ml-4 px-3 py-1.5 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 border border-slate-700 shadow-xl">
                  {item.name}
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* FOOTER */}
      <div className="p-4 border-t border-slate-800">
        <button 
          onClick={handleLogout}
          className={`w-full flex items-center px-3 py-3 rounded-xl text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all ${isCollapsed ? 'justify-center' : ''}`}
        >
          <ArrowLeftOnRectangleIcon className="w-6 h-6 flex-shrink-0" />
          {!isCollapsed && <span className="ml-3 font-medium text-sm font-poppins">Sign Out</span>}
        </button>
      </div>
    </div>
  );
}