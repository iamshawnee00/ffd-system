'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

// ==================================================================
// ⚠️ 重要提示：当您将此代码复制回本地项目时，请取消注释以下两行真实的导入，
// 并删除下方的 MOCK API 部分！
// ==================================================================
import { supabase } from '../../lib/supabaseClient';



import { 
  TrashIcon,
  PlayCircleIcon,
  ArrowPathIcon,
  BoltIcon,
  PlusCircleIcon,
  ClipboardDocumentListIcon
} from '@heroicons/react/24/outline';

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const getLocalDateString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export default function StandingOrdersPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState('');

  const [standingOrders, setStandingOrders] = useState([]);
  
  const [targetGenDate, setTargetGenDate] = useState(() => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);
    return getLocalDateString(tmr);
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [autopilotMessage, setAutopilotMessage] = useState('');

  const autopilotFired = useRef(false);

  useEffect(() => {
    async function loadData() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }
      const email = session.user.email || "";
      setCurrentUser(email.split('@')[0].toUpperCase());

      const templates = await fetchStandingOrders();

      if (!autopilotFired.current) {
          autopilotFired.current = true;
          await runBackgroundAutopilot(templates, email.split('@')[0].toUpperCase());
      }
      
      setLoading(false);
    }
    loadData();
  }, [router]);

  const fetchStandingOrders = async () => {
    const { data, error } = await supabase
        .from('StandingOrders')
        .select('*')
        .order('CreatedAt', { ascending: false });
    
    if (error) console.error("Error fetching standing orders:", error);
    else setStandingOrders(data || []);
    return data || [];
  };

  const runBackgroundAutopilot = async (activeTemplates, user) => {
      if (!activeTemplates || activeTemplates.length === 0) return;

      const tmr = new Date();
      tmr.setDate(tmr.getDate() + 1);
      const targetDate = getLocalDateString(tmr);
      const dayName = DAYS_OF_WEEK[tmr.getDay()];

      const lockKey = `ffd_autopilot_ran_${targetDate}`;
      if (typeof window !== 'undefined' && localStorage.getItem(lockKey)) {
          return; 
      }

      const tomorrowTemplates = activeTemplates.filter(t => t.DeliveryDay === dayName && t.Status === 'Active');
      if (tomorrowTemplates.length === 0) {
          if (typeof window !== 'undefined') localStorage.setItem(lockKey, 'true');
          return;
      }

      const { data: existingOrders, error: lockError } = await supabase.from('Orders')
          .select('"Customer Name", SpecialNotes')
          .eq('Delivery Date', targetDate);

      if (lockError) return;

      const existingCustomers = new Set(
          (existingOrders || [])
          .filter(o => o.SpecialNotes && String(o.SpecialNotes).includes('AUTO-GENERATED'))
          .map(o => String(o["Customer Name"]).toUpperCase().trim())
      );

      let generatedCount = 0;

      for (const template of tomorrowTemplates) {
          const cName = String(template.CustomerName).toUpperCase().trim();
          if (existingCustomers.has(cName)) continue; 

          const dateStr = targetDate.replaceAll('-', '').slice(2);
          const doNumber = `DO-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;
          const occurrenceMap = {};
          
          const orderRows = (template.Items || []).map(item => {
              let baseRep = item.Replacement || "";
              const key = `${item.ProductCode}_${baseRep}`;
              let repVal = baseRep;
              if (occurrenceMap[key]) {
                  repVal = baseRep + " ".repeat(occurrenceMap[key]);
                  occurrenceMap[key]++;
              } else {
                  occurrenceMap[key] = 1;
              }
              return {
                  "Timestamp": new Date(),
                  "Status": "Pending",
                  "DONumber": doNumber,
                  "Delivery Date": targetDate,
                  "Delivery Mode": template.DeliveryMode || 'Driver',
                  "Customer Name": template.CustomerName,
                  "Delivery Address": template.DeliveryAddress,
                  "Contact Person": template.ContactPerson,
                  "Contact Number": template.ContactNumber,
                  "Product Code": item.ProductCode,
                  "Order Items": item.OrderItems,
                  "Quantity": item.Quantity,
                  "UOM": item.UOM,
                  "Price": item.Price,
                  "Replacement": repVal,
                  "SpecialNotes": "AUTO-GENERATED STANDING ORDER",
                  "LoggedBy": "SYSTEM_AUTOPILOT"
              };
          });

          if (orderRows.length > 0) {
              const { error } = await supabase.from('Orders').insert(orderRows);
              if (!error) {
                  generatedCount++;
                  existingCustomers.add(cName);
              }
          }
      }

      if (typeof window !== 'undefined') localStorage.setItem(lockKey, 'true');

      if (generatedCount > 0) {
          setAutopilotMessage(`Autopilot generated ${generatedCount} DOs for tomorrow.`);
          setTimeout(() => setAutopilotMessage(''), 5000);
      }
  };

  const getTargetDayName = () => {
      if (!targetGenDate) return '';
      const [y, m, d] = targetGenDate.split('-');
      const localDate = new Date(Number(y), Number(m)-1, Number(d));
      return DAYS_OF_WEEK[localDate.getDay()];
  };

  const handleGenerateAutos = async () => {
      const dayName = getTargetDayName();
      const matchingTemplates = standingOrders.filter(t => t.DeliveryDay === dayName && t.Status === 'Active');
      
      if (matchingTemplates.length === 0) {
          return alert(`No active standing orders found scheduled for ${dayName}.`);
      }

      if (!confirm(`Ready to manually generate ${matchingTemplates.length} delivery orders for ${targetGenDate} (${dayName})?`)) return;

      setIsGenerating(true);
      let successCount = 0;
      let skippedCount = 0;

      const { data: existingOrders, error: lockError } = await supabase.from('Orders')
          .select('"Customer Name", SpecialNotes')
          .eq('Delivery Date', targetGenDate);

      if (lockError) {
          setIsGenerating(false);
          return alert("Database safety lock failed. Cannot safely generate orders.");
      }

      const existingCustomers = new Set(
          (existingOrders || [])
          .filter(o => o.SpecialNotes && String(o.SpecialNotes).includes('AUTO-GENERATED'))
          .map(o => String(o["Customer Name"]).toUpperCase().trim())
      );

      for (const template of matchingTemplates) {
          const cName = String(template.CustomerName).toUpperCase().trim();
          
          if (existingCustomers.has(cName)) {
              skippedCount++;
              continue;
          }

          const dateStr = targetGenDate.replaceAll('-', '').slice(2);
          const doNumber = `DO-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;

          const occurrenceMap = {};
          const orderRows = (template.Items || []).map(item => {
              let baseRep = item.Replacement || "";
              const key = `${item.ProductCode}_${baseRep}`;
              let repVal = baseRep;
              if (occurrenceMap[key]) {
                  repVal = baseRep + " ".repeat(occurrenceMap[key]);
                  occurrenceMap[key]++;
              } else {
                  occurrenceMap[key] = 1;
              }

              return {
                  "Timestamp": new Date(),
                  "Status": "Pending",
                  "DONumber": doNumber,
                  "Delivery Date": targetGenDate,
                  "Delivery Mode": template.DeliveryMode || 'Driver',
                  "Customer Name": template.CustomerName,
                  "Delivery Address": template.DeliveryAddress,
                  "Contact Person": template.ContactPerson,
                  "Contact Number": template.ContactNumber,
                  "Product Code": item.ProductCode,
                  "Order Items": item.OrderItems,
                  "Quantity": item.Quantity,
                  "UOM": item.UOM,
                  "Price": item.Price,
                  "Replacement": repVal,
                  "SpecialNotes": "AUTO-GENERATED STANDING ORDER",
                  "LoggedBy": currentUser
              };
          });

          if (orderRows.length > 0) {
              const { error } = await supabase.from('Orders').insert(orderRows);
              if (!error) successCount++;
          }
      }

      alert(`Manual Generation Complete!\n\n✅ Created: ${successCount} DOs\n⏭️ Skipped (Already Exist): ${skippedCount}`);
      setIsGenerating(false);
  };

  const deletePattern = async (id) => {
      if (!confirm("Permanently delete this weekly pattern?")) return;
      const { error } = await supabase.from('StandingOrders').delete().eq('id', id);
      if (!error) fetchStandingOrders();
  };

  if (loading) return <div className="h-screen flex items-center justify-center text-gray-400 font-black animate-pulse uppercase tracking-widest">Waking up Engine...</div>;

  return (
    <div className="p-4 md:p-8 bg-gray-50 min-h-screen text-slate-800 font-sans relative">
      
      {autopilotMessage && (
          <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[500] bg-green-600 text-white px-6 py-3 rounded-full shadow-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 animate-in fade-in slide-in-from-top-10">
              <BoltIcon className="w-5 h-5" />
              {autopilotMessage}
          </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight uppercase text-indigo-900">Order Management</h1>
          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mt-1">Manage single-session and historical orders</p>
        </div>
        <div className="text-[9px] md:text-xs font-bold text-gray-500 bg-white border border-gray-200 px-3 py-1.5 rounded-full uppercase shadow-sm">
             User: {currentUser}
         </div>
      </div>

      {/* SUB-NAVIGATION BAR (Route-based Tabs) */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 border-b border-gray-200 snap-x custom-scrollbar">
          <Link href="/orders/new" className={`snap-start shrink-0 px-4 md:px-6 py-2.5 md:py-3 rounded-xl md:rounded-t-2xl font-black text-xs md:text-sm transition-all whitespace-nowrap flex items-center gap-2 ${pathname === '/orders/new' ? 'bg-green-600 text-white shadow-md' : 'bg-white text-gray-500 border hover:bg-gray-50'}`}>
              <PlusCircleIcon className="w-4 h-4 md:w-5 h-5" /> New Order
          </Link>
          <Link href="/orders/list" className={`snap-start shrink-0 px-4 md:px-6 py-2.5 md:py-3 rounded-xl md:rounded-t-2xl font-black text-xs md:text-sm transition-all whitespace-nowrap flex items-center gap-2 ${pathname === '/orders/list' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-500 border hover:bg-gray-50'}`}>
              <ClipboardDocumentListIcon className="w-4 h-4 md:w-5 h-5" /> Order History
          </Link>
          <Link href="/orders/standing" className={`snap-start shrink-0 px-4 md:px-6 py-2.5 md:py-3 rounded-xl md:rounded-t-2xl font-black text-xs md:text-sm transition-all whitespace-nowrap flex items-center gap-2 ${pathname === '/orders/standing' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-gray-500 border hover:bg-gray-50'}`}>
              <ArrowPathIcon className="w-4 h-4 md:w-5 h-5" /> Auto-Pilot
          </Link>
      </div>

      <div className="animate-in fade-in duration-300 space-y-6">
          {/* GENERATOR WIDGET */}
          <div className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-[2.5rem] p-6 md:p-8 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative">
              <div className="absolute top-0 right-0 p-10 opacity-10 pointer-events-none">
                  <PlayCircleIcon className="w-48 h-48 text-white transform rotate-12" />
              </div>
              <div className="text-white z-10 w-full md:w-auto">
                  <h2 className="text-xl md:text-2xl font-black flex items-center gap-3 uppercase tracking-tight">
                      <PlayCircleIcon className="w-8 h-8"/> Auto-Generate Orders
                  </h2>
                  <p className="text-blue-200 font-medium mt-2 text-sm max-w-md">Select an upcoming date to instantly generate real Delivery Orders from your active templates.</p>
              </div>
              
              <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto z-10 bg-white/10 p-2 rounded-3xl backdrop-blur-sm border border-white/20">
                  <div className="flex flex-col px-4 w-full sm:w-auto">
                      <span className="text-[9px] font-black text-blue-200 uppercase tracking-widest mb-1">Target Date ({getTargetDayName()})</span>
                      <input 
                          type="date" 
                          value={targetGenDate} 
                          onChange={e => setTargetGenDate(e.target.value)} 
                          className="bg-transparent text-white font-black text-lg outline-none cursor-pointer" 
                          style={{colorScheme: 'dark'}} 
                      />
                  </div>
                  <button 
                      onClick={handleGenerateAutos} 
                      disabled={isGenerating} 
                      className="w-full sm:w-auto bg-white text-indigo-700 hover:bg-blue-50 font-black py-4 px-8 rounded-2xl shadow-xl transition-all active:scale-95 disabled:opacity-50 uppercase text-xs tracking-widest"
                  >
                      {isGenerating ? 'GENERATING ENGINE...' : `RUN GENERATOR`}
                  </button>
              </div>
          </div>

          {/* TEMPLATE LIST */}
          <div className="bg-white rounded-[2.5rem] shadow-xl border border-gray-100 p-6 flex flex-col h-[calc(100vh-360px)] min-h-[500px]">
              <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                  <div>
                      <h3 className="font-black text-gray-800 uppercase tracking-tight text-lg flex items-center gap-2">
                          <ArrowPathIcon className="w-6 h-6 text-indigo-600" /> Active Templates
                      </h3>
                      <p className="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-wider">Note: Templates are created via the "Save Pattern" checkbox when submitting a New Order.</p>
                  </div>
              </div>

              <div className="flex-1 overflow-auto custom-scrollbar pr-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {standingOrders.map(t => (
                          <div key={t.id} className={`p-5 rounded-3xl border transition-all relative group ${t.Status === 'Active' ? 'bg-white border-gray-200 shadow-sm hover:border-indigo-300' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
                              <div className="flex justify-between items-start mb-3">
                                  <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${t.DeliveryDay === 'Monday' ? 'bg-blue-50 text-blue-600 border-blue-200' : t.DeliveryDay === 'Friday' ? 'bg-green-50 text-green-600 border-green-200' : 'bg-purple-50 text-purple-600 border-purple-200'}`}>
                                      Every {t.DeliveryDay}
                                  </span>
                                  <span className={`text-[9px] font-black uppercase tracking-widest ${t.Status === 'Active' ? 'text-green-500' : 'text-gray-400'}`}>{t.Status}</span>
                              </div>
                              <h4 className="font-black text-gray-800 uppercase leading-tight mb-1 pr-8">{t.CustomerName}</h4>
                              <p className="text-xs text-gray-500 font-medium mb-4 truncate max-w-full">{t.DeliveryAddress}</p>
                              
                              <div className="flex gap-2">
                                  <div className="flex-1 py-2 bg-indigo-50 text-indigo-700 font-bold rounded-xl text-[10px] uppercase tracking-widest flex items-center justify-center">
                                      {t.Items?.length || 0} Items
                                  </div>
                                  <button onClick={() => deletePattern(t.id)} className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition shadow-sm"><TrashIcon className="w-4 h-4"/></button>
                              </div>
                          </div>
                      ))}
                      {standingOrders.length === 0 && (
                          <div className="col-span-full py-20 text-center text-gray-400 italic font-bold">No standing orders found.</div>
                      )}
                  </div>
              </div>
          </div>
      </div>

    </div>
  );
}