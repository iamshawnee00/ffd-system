'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { 
  UserGroupIcon, 
  ChartBarIcon, 
  CalendarIcon, 
  ShoppingBagIcon 
} from '@heroicons/react/24/outline';

export default function CustomerPage() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Selected Customer State for Analysis
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerOrders, setCustomerOrders] = useState([]);
  const [usualUsage, setUsualUsage] = useState({ 
    topItems: [], 
    deliveryPattern: {}, 
    totalOrders: 0,
    lastOrderDate: null
  });

  // 1. Initial Load
  useEffect(() => {
    fetchCustomers();
  }, []);

  // 2. Fetch Customer List
  const fetchCustomers = async () => {
    const { data } = await supabase
      .from('Customers')
      .select('*')
      .order('CompanyName');
    if (data) setCustomers(data);
    setLoading(false);
  };

  // 3. Analyze Customer when selected
  const handleSelectCustomer = async (customer) => {
    setSelectedCustomer(customer);
    
    // Fetch order history for this customer
    const { data: orders } = await supabase
      .from('Orders')
      .select('*')
      .eq('Customer Name', customer.CompanyName)
      .order('Delivery Date', { ascending: false });

    if (orders) {
      setCustomerOrders(orders);
      analyzeUsage(orders);
    }
  };

  // 4. Core Logic: Calculate "Usual Usage"
  const analyzeUsage = (orders) => {
    if (!orders.length) {
      setUsualUsage({ topItems: [], deliveryPattern: {}, totalOrders: 0, lastOrderDate: null });
      return;
    }

    const itemFrequency = {};
    const dayFrequency = { 'Sun': 0, 'Mon': 0, 'Tue': 0, 'Wed': 0, 'Thu': 0, 'Fri': 0, 'Sat': 0 };
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    orders.forEach(order => {
       // Item Frequency
       const itemName = order["Order Items"];
       const qty = Number(order.Quantity || 0);
       const uom = order.UOM;
       const key = `${itemName} (${uom})`; // Group by Item + UOM to differentiate

       if (!itemFrequency[key]) {
         itemFrequency[key] = { name: itemName, uom: uom, count: 0, totalQty: 0 };
       }
       itemFrequency[key].count += 1; // Frequency (how many times ordered)
       itemFrequency[key].totalQty += qty; // Volume (total amount ordered)

       // Delivery Day Pattern
       const d = new Date(order["Delivery Date"]);
       if (!isNaN(d)) {
          const dayName = days[d.getDay()];
          dayFrequency[dayName] += 1;
       }
    });

    // Sort items by Frequency (Count)
    const sortedItems = Object.values(itemFrequency)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Top 10 items

    // Find typical delivery days (days with > 15% of orders)
    const total = orders.length;
    const typicalDays = Object.entries(dayFrequency)
      .filter(([_, count]) => (count / total) > 0.15)
      .map(([day]) => day);

    setUsualUsage({
      topItems: sortedItems,
      deliveryPattern: typicalDays,
      totalOrders: total,
      lastOrderDate: orders[0]["Delivery Date"]
    });
  };

  // Filter List
  const filteredCustomers = customers.filter(c => 
    c.CompanyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.ContactPerson && c.ContactPerson.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (loading) return <div className="p-10 text-center font-bold text-gray-400">Loading Customers...</div>;

  return (
    <div className="p-3 md:p-6 max-w-full overflow-x-hidden pt-16 md:pt-6">
      
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight">Customer Analysis</h1>
        <p className="text-[10px] md:text-xs text-gray-400 font-bold uppercase mt-1">Usual usage & delivery patterns</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-140px)]">
        
        {/* LEFT COLUMN: Customer List */}
        <div className="bg-white p-4 rounded-3xl shadow-xl border border-gray-100 lg:col-span-1 flex flex-col h-full">
           <div className="mb-4 relative">
              <input 
                type="text" 
                placeholder="Search Customer..." 
                className="w-full p-3 pl-10 border border-gray-200 rounded-xl bg-gray-50 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <span className="absolute left-3 top-3 text-gray-400">🔍</span>
           </div>

           <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {filteredCustomers.map(c => (
                <div 
                  key={c.id} 
                  onClick={() => handleSelectCustomer(c)}
                  className={`p-4 rounded-xl cursor-pointer border transition-all duration-200 group ${
                    selectedCustomer?.id === c.id 
                    ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500 shadow-sm' 
                    : 'bg-white border-gray-100 hover:border-blue-200 hover:shadow-md'
                  }`}
                >
                   <div className="font-black text-gray-800 text-xs uppercase mb-1">{c.CompanyName}</div>
                   <div className="flex justify-between items-center text-[10px] text-gray-400 font-medium">
                      <span>{c.ContactPerson || 'No Contact'}</span>
                      {selectedCustomer?.id === c.id && <span className="text-blue-600 font-bold">Selected</span>}
                   </div>
                </div>
              ))}
           </div>
        </div>

        {/* RIGHT COLUMN: Analysis Dashboard */}
        <div className="lg:col-span-2 h-full overflow-y-auto custom-scrollbar pr-1">
           {selectedCustomer ? (
             <div className="space-y-6">
                
                {/* 1. Customer Profile Card */}
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between gap-4">
                   <div>
                      <h2 className="text-2xl font-black text-gray-800 uppercase leading-none">{selectedCustomer.CompanyName}</h2>
                      <div className="flex gap-4 mt-3 text-xs font-bold text-gray-500">
                         <span className="flex items-center gap-1"><UserGroupIcon className="w-4 h-4"/> {selectedCustomer.ContactPerson}</span>
                         <span className="flex items-center gap-1"><ShoppingBagIcon className="w-4 h-4"/> {usualUsage.totalOrders} Orders Lifetime</span>
                      </div>
                   </div>
                   <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 min-w-[200px]">
                      <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Last Order</div>
                      <div className="text-lg font-black text-gray-800">
                        {usualUsage.lastOrderDate ? new Date(usualUsage.lastOrderDate).toLocaleDateString('en-GB') : 'N/A'}
                      </div>
                   </div>
                </div>

                {/* 2. Usage Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   {/* Delivery Pattern */}
                   <div className="bg-purple-50 p-5 rounded-3xl border border-purple-100">
                      <div className="flex items-center gap-2 mb-3">
                         <CalendarIcon className="w-5 h-5 text-purple-600" />
                         <h3 className="text-xs font-black text-purple-800 uppercase tracking-widest">Usual Delivery Days</h3>
                      </div>
                      <div className="flex flex-wrap gap-2">
                         {usualUsage.deliveryPattern.length > 0 ? (
                           usualUsage.deliveryPattern.map(day => (
                             <span key={day} className="bg-white text-purple-700 px-3 py-1.5 rounded-lg text-xs font-black border border-purple-200 shadow-sm">
                               {day}
                             </span>
                           ))
                         ) : (
                           <span className="text-purple-400 text-xs italic">No clear pattern yet</span>
                         )}
                      </div>
                   </div>

                   {/* Preferred Variety (Placeholder for future logic) */}
                   <div className="bg-orange-50 p-5 rounded-3xl border border-orange-100">
                      <div className="flex items-center gap-2 mb-3">
                         <ChartBarIcon className="w-5 h-5 text-orange-600" />
                         <h3 className="text-xs font-black text-orange-800 uppercase tracking-widest">Order Frequency</h3>
                      </div>
                      <div className="text-2xl font-black text-orange-900">
                         {(usualUsage.totalOrders / 12).toFixed(1)} <span className="text-sm font-bold text-orange-600">orders / month (avg)</span>
                      </div>
                   </div>
                </div>

                {/* 3. Top Items / Usual Usage List */}
                <div className="bg-white rounded-3xl shadow-lg border border-gray-100 overflow-hidden">
                   <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                      <h3 className="text-sm font-black text-gray-800 uppercase tracking-wide">🏆 Top Products (Usual Usage)</h3>
                      <span className="text-[10px] bg-green-100 text-green-700 px-2 py-1 rounded-md font-bold">Based on frequency</span>
                   </div>
                   
                   <div className="overflow-x-auto">
                     <table className="w-full text-left">
                        <thead className="bg-white text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                           <tr>
                              <th className="p-4">Product Name</th>
                              <th className="p-4 text-center">Freq (Times)</th>
                              <th className="p-4 text-center">Total Qty</th>
                              <th className="p-4 text-right">Avg Qty/Order</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 text-xs font-medium text-gray-700">
                           {usualUsage.topItems.map((item, idx) => (
                             <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                                <td className="p-4 font-bold text-gray-800 uppercase">
                                   <div className="flex items-center gap-2">
                                      <span className="text-gray-400 w-4">{idx + 1}.</span>
                                      {item.name}
                                   </div>
                                </td>
                                <td className="p-4 text-center">
                                   <span className="bg-gray-100 px-2 py-1 rounded-lg font-bold">{item.count}</span>
                                </td>
                                <td className="p-4 text-center">
                                   {item.totalQty} <span className="text-[9px] text-gray-400 uppercase">{item.uom}</span>
                                </td>
                                <td className="p-4 text-right font-black text-blue-600">
                                   {(item.totalQty / item.count).toFixed(1)} {item.uom}
                                </td>
                             </tr>
                           ))}
                           {usualUsage.topItems.length === 0 && (
                             <tr><td colSpan="4" className="p-8 text-center text-gray-400 italic">No order history available.</td></tr>
                           )}
                        </tbody>
                     </table>
                   </div>
                </div>

             </div>
           ) : (
             <div className="h-full flex flex-col items-center justify-center text-gray-300 bg-white rounded-3xl border border-dashed border-gray-200">
                <UserGroupIcon className="w-16 h-16 mb-4 opacity-20" />
                <h3 className="text-lg font-bold text-gray-400">Select a Customer</h3>
                <p className="text-xs">View their usual usage, delivery days, and history.</p>
             </div>
           )}
        </div>

      </div>
    </div>
  );
}