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
  Bars3Icon, 
  ShoppingBagIcon,
  XMarkIcon // Added for closing mobile menu
} from '@heroicons/react/24/outline';

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  
  // State for Desktop Collapse
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  // State for Mobile Menu Open/Close
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const menuItems = [
    { name: 'Dashboard', path: '/', icon: HomeIcon },
    { name: 'New Order', path: '/orders/new', icon: PlusCircleIcon },
    { name: 'Log Purchase', path: '/purchase/new', icon: ShoppingBagIcon },
    { name: 'Order List', path: '/orders/list', icon: ClipboardDocumentListIcon },
    { name: 'Delivery / Reports', path: '/delivery', icon: TruckIcon },
    { name: 'Price Trend', path: '/price-trend', icon: ChartBarIcon },
    { name: 'Products', path: '/products', icon: CubeIcon },
    { name: 'Stock Adjust', path: '/stock', icon: AdjustmentsHorizontalIcon },
    { name: 'Customers', path: '/customers', icon: UserGroupIcon },
  ];

  return (
    <>
      {/* --- DESKTOP SIDEBAR (Visible on md screens and up) --- */}
      <div 
        className={`hidden md:flex bg-slate-900 text-white min-h-screen flex-col fixed left-0 top-0 h-full shadow-xl transition-all duration-300 z-50 ${
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

      {/* --- MOBILE HEADER & MENU (Visible only on small screens) --- */}
      <div className="md:hidden">
        {/* Mobile Top Bar */}
        <div className="fixed top-0 left-0 right-0 h-16 bg-slate-900 text-white z-50 shadow-md flex items-center justify-between px-4">
          <div>
            <h1 className="text-xl font-bold text-green-400 tracking-tight font-poppins">FFD<span className="text-white">System</span></h1>
          </div>
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="text-white p-2 rounded-md hover:bg-slate-800 focus:outline-none"
          >
            {isMobileMenuOpen ? (
              <XMarkIcon className="w-6 h-6" />
            ) : (
              <Bars3Icon className="w-6 h-6" />
            )}
          </button>
        </div>

        {/* Mobile Dropdown Menu Overlay */}
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-40 bg-slate-900/95 pt-20 px-4 pb-6 overflow-y-auto backdrop-blur-sm">
            <nav className="space-y-2">
              {menuItems.map((item) => {
                const isActive = pathname === item.path;
                return (
                  <Link 
                    key={item.path} 
                    href={item.path}
                    onClick={() => setIsMobileMenuOpen(false)} // Close menu on click
                    className={`flex items-center px-4 py-4 rounded-xl transition-all duration-200 ${
                      isActive 
                        ? 'bg-green-600 text-white shadow-lg' 
                        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <item.icon className={`w-6 h-6 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                    <span className="ml-4 font-medium text-lg font-poppins">{item.name}</span>
                  </Link>
                );
              })}
              
              <div className="border-t border-slate-800 my-4 pt-4">
                <button 
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    handleLogout();
                  }}
                  className="w-full flex items-center px-4 py-4 rounded-xl text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all"
                >
                  <ArrowLeftOnRectangleIcon className="w-6 h-6 flex-shrink-0" />
                  <span className="ml-4 font-medium text-lg font-poppins">Sign Out</span>
                </button>
              </div>
            </nav>
          </div>
        )}

        {/* Spacer to push content down below fixed header */}
        <div className="h-16 w-full"></div>
      </div>
    </>
  );
}