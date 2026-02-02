'use client';
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Sidebar from './components/Sidebar';
import { 
  ShoppingBagIcon, 
  CurrencyDollarIcon, 
  ExclamationTriangleIcon,
  CubeIcon 
} from '@heroicons/react/24/solid';

export default function Dashboard() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ pending: 0, products: 0, lowStock: 0 });
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/login');
      } else {
        setSession(session);
        fetchStats();
      }
    });
  }, []);

  const fetchStats = async () => {
    // 1. Pending Orders
    const { count: pendingCount } = await supabase
      .from('Orders')
      .select('*', { count: 'exact', head: true })
      .eq('Status', 'Pending');

    // 2. Total Products
    const { count: prodCount } = await supabase
      .from('ProductMaster')
      .select('*', { count: 'exact', head: true });

    // 3. Low Stock (Simple check, assumes StockBalance exists)
    // Note: This might need adjustment if column name differs or logic is complex
    const { count: lowCount } = await supabase
      .from('ProductMaster')
      .select('*', { count: 'exact', head: true })
      .lt('StockBalance', 20);

    setStats({
      pending: pendingCount || 0,
      products: prodCount || 0,
      lowStock: lowCount || 0
    });
    setLoading(false);
  };

  if (loading) return <div className="flex h-screen items-center justify-center bg-slate-50"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div></div>;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      
      {/* Margin-left matches the default sidebar width (w-72 = 18rem). 
         Since Sidebar is fixed, we add a generic left margin and assume expanded by default for simple layout.
         Note: In a fully responsive setup with context, this margin would be dynamic.
      */}
      <main className="flex-1 p-8 ml-0 lg:ml-72 transition-all duration-300"> 
        
        {/* Header Section */}
        <header className="flex justify-between items-end mb-10 fade-in">
          <div>
            <h1 className="text-4xl font-bold text-slate-800 tracking-tight">Overview</h1>
            <p className="text-slate-500 mt-2">Welcome back, {session?.user?.email?.split('@')[0] || 'Staff'}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-slate-400 uppercase tracking-wide">Today's Date</p>
            <p className="text-xl font-bold text-slate-700">{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10 fade-in">
          
          <StatCard 
            title="Pending Orders" 
            value={stats.pending} 
            icon={ShoppingBagIcon} 
            color="blue" 
            desc="Orders needing attention"
          />
          
          <StatCard 
            title="Total Products" 
            value={stats.products} 
            icon={CubeIcon} 
            color="green" 
            desc="Active items in catalog"
          />
          
          <StatCard 
            title="Low Stock Alerts" 
            value={stats.lowStock} 
            icon={ExclamationTriangleIcon} 
            color="orange" 
            desc="Items below threshold"
          />

        </div>

        {/* Quick Actions / Recent Activity Placeholder */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 fade-in">
          <h3 className="font-bold text-lg text-slate-800 mb-4">System Status</h3>
          <div className="flex gap-4">
             <div className="flex-1 bg-green-50 rounded-xl p-4 border border-green-100">
                <p className="text-green-800 font-medium">System Online</p>
                <p className="text-green-600 text-sm mt-1">Database connection is stable.</p>
             </div>
             <div className="flex-1 bg-slate-50 rounded-xl p-4 border border-slate-100">
                <p className="text-slate-800 font-medium">Last Sync</p>
                <p className="text-slate-500 text-sm mt-1">Real-time updates enabled.</p>
             </div>
          </div>
        </div>

      </main>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, desc }) {
  const colors = {
    blue: 'bg-blue-500 shadow-blue-500/30 text-blue-500',
    green: 'bg-emerald-500 shadow-emerald-500/30 text-emerald-500',
    orange: 'bg-amber-500 shadow-amber-500/30 text-amber-500',
  };

  const bgColors = {
    blue: 'bg-blue-50',
    green: 'bg-emerald-50',
    orange: 'bg-amber-50',
  };

  return (
    <div className={`rounded-2xl p-6 shadow-sm border border-slate-100 bg-white transition-transform hover:-translate-y-1 hover:shadow-md cursor-default`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider">{title}</p>
          <h3 className="text-3xl font-bold text-slate-800 mt-2">{value}</h3>
          <p className="text-sm text-slate-500 mt-1">{desc}</p>
        </div>
        <div className={`p-3 rounded-xl ${bgColors[color]} ${colors[color].split(' ')[2]}`}>
          <Icon className="w-8 h-8" />
        </div>
      </div>
    </div>
  );
}