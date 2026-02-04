'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

// Define navigation items for easier management
const navItems = [
  { name: 'Dashboard', href: '/', icon: '🏠' },
  { name: 'New Order', href: '/orders/new', icon: '📝' },
  { name: 'Orders List', href: '/orders/list', icon: '📋' },
  { name: 'Delivery', href: '/delivery', icon: '🚚' },
  { name: 'Products', href: '/products', icon: '📦' },
  { name: 'Batch DO', href: '/reports/batch-do', icon: '📑' },
  { name: 'Usage', href: '/reports/usage', icon: '📊' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <>
      {/* DESKTOP SIDEBAR (Visible on md and up) */}
      <aside className="hidden md:flex flex-col w-64 h-screen bg-gray-900 text-white fixed left-0 top-0 overflow-y-auto z-50">
        <div className="p-6 border-b border-gray-800">
          <h1 className="text-2xl font-bold text-blue-400">FFD System</h1>
          <p className="text-xs text-gray-400 mt-1">Management Console</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link 
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive 
                    ? 'bg-blue-600 text-white shadow-md' 
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                <span className="font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <div className="text-xs text-gray-500 text-center">
            &copy; 2023 Fresher Farm Direct
          </div>
        </div>
      </aside>

      {/* MOBILE HEADER & NAVIGATION (Visible on small screens) */}
      <div className="md:hidden fixed top-0 left-0 right-0 bg-gray-900 text-white z-50 shadow-lg">
        <div className="flex items-center justify-between p-4">
          <div className="font-bold text-lg text-blue-400">FFD System</div>
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 rounded hover:bg-gray-800 focus:outline-none"
          >
            {isMobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>

        {/* Mobile Dropdown Menu */}
        {isMobileMenuOpen && (
          <nav className="border-t border-gray-800 bg-gray-900 max-h-[80vh] overflow-y-auto">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link 
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)} // Close menu on click
                  className={`flex items-center gap-3 px-6 py-4 border-b border-gray-800 ${
                    isActive ? 'bg-blue-900/30 text-blue-400' : 'text-gray-300'
                  }`}
                >
                  <span className="text-xl">{item.icon}</span>
                  <span className="font-medium">{item.name}</span>
                </Link>
              );
            })}
          </nav>
        )}
      </div>

      {/* Spacer for Mobile Header Content pushing */}
      <div className="md:hidden h-16 w-full"></div>
    </>
  );
}