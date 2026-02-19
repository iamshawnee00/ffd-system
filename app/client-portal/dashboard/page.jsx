'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { 
  ShoppingBagIcon, 
  ClipboardDocumentListIcon, 
  TruckIcon, 
  ChartBarIcon, 
  ArrowRightOnRectangleIcon,
  BuildingStorefrontIcon
} from '@heroicons/react/24/outline';

export default function ClientDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [clientSession, setClientSession] = useState(null);
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState(null);

  useEffect(() => {
    // 1. Check Session
    const sessionStr = localStorage.getItem('ffd_client_session');
    if (!sessionStr) {
      router.push('/client-portal/login');
      return;
    }
    const session = JSON.parse(sessionStr);
    setClientSession(session);

    // 2. Fetch Branches associated with this Username
    async function fetchBranches() {
        const { data, error } = await supabase
            .from('Customers')
            .select('*')
            .eq('Username', session.username);
        
        if (data) {
            setBranches(data);
            // Auto-select if only one branch
            if (data.length === 1) {
                setSelectedBranch(data[0]);
                localStorage.setItem('ffd_selected_branch_id', data[0].id);
            } else {
                // Try to restore previous selection
                const savedBranchId = localStorage.getItem('ffd_selected_branch_id');
                if (savedBranchId) {
                    const found = data.find(b => b.id === parseInt(savedBranchId));
                    if (found) setSelectedBranch(found);
                }
            }
        }
        setLoading(false);
    }
    fetchBranches();
  }, [router]);

  const handleBranchSelect = (branch) => {
      setSelectedBranch(branch);
      localStorage.setItem('ffd_selected_branch_id', branch.id);
  };

  const handleLogout = () => {
      localStorage.removeItem('ffd_client_session');
      localStorage.removeItem('ffd_selected_branch_id');
      router.push('/client-portal/login');
  };

  const navigateTo = (path) => {
      if (!selectedBranch) return alert("Please select a branch first.");
      router.push(`/client-portal/${path}`);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400 font-bold bg-gray-50">Loading Portal...</div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-20 font-sans">
       {/* Header */}
       <header className="bg-white shadow-sm sticky top-0 z-20">
           <div className="max-w-md mx-auto px-6 py-4 flex justify-between items-center">
               <div>
                   <h1 className="text-xl font-black text-gray-800 tracking-tight">Client Portal</h1>
                   <p className="text-[10px] font-bold text-gray-400 uppercase">Logged in as {clientSession?.username}</p>
               </div>
               <button onClick={handleLogout} className="text-gray-400 hover:text-red-500 p-2 transition-colors">
                   <ArrowRightOnRectangleIcon className="w-6 h-6" />
               </button>
           </div>
       </header>

       <div className="max-w-md mx-auto p-6 space-y-6">
           
           {/* Branch Selector */}
           <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 transition-all">
               <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                   <BuildingStorefrontIcon className="w-4 h-4" /> Select Active Branch
               </h2>
               
               {branches.length > 0 ? (
                   <div className="space-y-3">
                       {branches.map(branch => (
                           <div 
                               key={branch.id} 
                               onClick={() => handleBranchSelect(branch)}
                               className={`p-4 rounded-2xl border-2 cursor-pointer transition-all duration-200 ${
                                   selectedBranch?.id === branch.id 
                                   ? 'border-green-500 bg-green-50 shadow-md ring-1 ring-green-200' 
                                   : 'border-gray-100 hover:border-green-200 hover:bg-gray-50'
                               }`}
                           >
                               <div className="font-black text-gray-800 text-sm uppercase">
                                   {branch.Branch || 'Main Branch'}
                               </div>
                               <div className="text-[10px] font-medium text-gray-500 mt-1 truncate">
                                   {branch.DeliveryAddress}
                               </div>
                           </div>
                       ))}
                   </div>
               ) : (
                   <div className="text-center text-gray-400 text-sm italic py-4 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                       No branches found for this account.
                   </div>
               )}
           </div>

           {/* Main Menu Grid */}
           <div className={`grid grid-cols-2 gap-4 transition-all duration-300 ${selectedBranch ? 'opacity-100 translate-y-0' : 'opacity-50 pointer-events-none translate-y-4'}`}>
               
               <MenuCard 
                  title="New Order" 
                  icon={ShoppingBagIcon} 
                  color="green" 
                  onClick={() => navigateTo('purchase')}
               />
               
               <MenuCard 
                  title="My Orders" 
                  icon={ClipboardDocumentListIcon} 
                  color="blue" 
                  onClick={() => navigateTo('orders')}
               />

               <MenuCard 
                  title="Delivery" 
                  icon={TruckIcon} 
                  color="orange" 
                  onClick={() => navigateTo('delivery')}
               />

               <MenuCard 
                  title="Analysis" 
                  icon={ChartBarIcon} 
                  color="purple" 
                  onClick={() => navigateTo('analysis')}
               />

           </div>
       </div>
    </div>
  );
}

function MenuCard({ title, icon: Icon, color, onClick }) {
    const colors = {
        green: 'bg-green-50 text-green-600',
        blue: 'bg-blue-50 text-blue-600',
        orange: 'bg-orange-50 text-orange-600',
        purple: 'bg-purple-50 text-purple-600'
    };

    return (
        <div 
            onClick={onClick}
            className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center gap-3 cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all duration-200 h-40 group active:scale-95"
        >
            <div className={`p-4 rounded-2xl ${colors[color]} group-hover:scale-110 transition-transform duration-200`}>
                <Icon className="w-8 h-8" />
            </div>
            <span className="font-black text-gray-700 text-xs uppercase tracking-wide group-hover:text-gray-900">{title}</span>
        </div>
    );
}