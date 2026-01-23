'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '../lib/supabaseClient';

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const menuItems = [
    { name: 'Dashboard', path: '/' },
    { name: 'New Order', path: '/orders/new' },
    { name: 'Order List', path: '/orders/list' },
    { name: 'Products', path: '/products' },
    { name: 'Stock Adjust', path: '/stock' },
    { name: 'Customers', path: '/customers' },
  ];

  return (
    <div className="w-64 bg-gray-900 text-white min-h-screen flex flex-col fixed left-0 top-0">
      <div className="p-6 border-b border-gray-800">
        <h2 className="text-xl font-bold">FFD System</h2>
        <p className="text-xs text-gray-400 mt-1">Staff Portal</p>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => (
          <Link 
            key={item.path} 
            href={item.path}
            className={`block px-4 py-3 rounded transition-colors ${
              pathname === item.path 
                ? 'bg-blue-600 text-white' 
                : 'text-gray-300 hover:bg-gray-800'
            }`}
          >
            {item.name}
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-800">
        <button 
          onClick={handleLogout}
          className="w-full text-left px-4 py-2 text-red-400 hover:bg-gray-800 rounded transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}