'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { 
  UserGroupIcon, 
  ChartBarIcon, 
  CalendarIcon, 
  ShoppingBagIcon,
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  UserCircleIcon 
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

  // Add/Edit Customer Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    CompanyName: '',
    Branch: '',
    ContactPerson: '',
    ContactNumber: '',
    DeliveryAddress: '',
    Username: '' 
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. Initial Load
  useEffect(() => {
    fetchCustomers();
  }, []);

  // 2. Fetch Customer List
  const fetchCustomers = async () => {
    const { data } = await supabase
      .from('Customers')
      .select('*')
      .order('CompanyName', { ascending: true })
      .order('Branch', { ascending: true });
    if (data) setCustomers(data);
    setLoading(false);
  };

  // 3. Analyze Customer when selected
  const handleSelectCustomer = async (customer) => {
    setSelectedCustomer(customer);
    
    // Construct search string to find orders for this specific branch
    const targetName = customer.Branch 
        ? `${customer.CompanyName} - ${customer.Branch}` 
        : customer.CompanyName;

    // Fetch order history for this specific customer/branch entity
    // We use ilike to match the stored string in Orders table
    const { data: orders } = await supabase
      .from('Orders')
      .select('*')
      .ilike('Customer Name', targetName) 
      .order('Delivery Date', { ascending: false });

    if (orders) {
      setCustomerOrders(orders);
      analyzeUsage(orders);
    }
  };

  // 4. Core Logic: Calculate "Usual Usage"
  const analyzeUsage = (orders) => {
    if (!orders || orders.length === 0) {
      setUsualUsage({ topItems: [], deliveryPattern: {}, totalOrders: 0, lastOrderDate: null });
      return;
    }

    const itemFrequency = {};
    const dayFrequency = { 'Sun': 0, 'Mon': 0, 'Tue': 0, 'Wed': 0, 'Thu': 0, 'Fri': 0, 'Sat': 0 };
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    orders.forEach(order => {
       const itemName = order["Order Items"];
       const qty = Number(order.Quantity || 0);
       const uom = order.UOM;
       const key = `${itemName} (${uom})`; 

       if (!itemFrequency[key]) {
         itemFrequency[key] = { name: itemName, uom: uom, count: 0, totalQty: 0 };
       }
       itemFrequency[key].count += 1; 
       itemFrequency[key].totalQty += qty; 

       const d = new Date(order["Delivery Date"]);
       if (!isNaN(d)) {
          const dayName = days[d.getDay()];
          if (dayName) dayFrequency[dayName] += 1;
       }
    });

    const sortedItems = Object.values(itemFrequency)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); 

    const total = orders.length;
    // Find typical delivery days (days with > 15% of orders)
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

  // 5. Handle Form Submit (Add or Edit)
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    if (!formData.CompanyName) {
        alert("Company Name is required");
        setIsSubmitting(false);
        return;
    }

    // REMOVED ADDRESS UNIQUENESS CHECK per user request.
    // The system now relies on the primary key (UUID) for uniqueness.
    // Duplicate addresses are allowed (e.g. different departments in same building).

    const payload = {
        CompanyName: formData.CompanyName,
        Branch: formData.Branch, 
        ContactPerson: formData.ContactPerson,
        ContactNumber: formData.ContactNumber,
        DeliveryAddress: formData.DeliveryAddress,
        Username: formData.Username
    };

    let error;
    if (editingId) {
        const { error: updateError } = await supabase
            .from('Customers')
            .update(payload)
            .eq('id', editingId);
        error = updateError;
    } else {
        const { error: insertError } = await supabase
            .from('Customers')
            .insert([payload]);
        error = insertError;
    }

    if (error) {
        alert("Error saving customer: " + error.message);
    } else {
        alert(editingId ? "Customer updated!" : "Customer added!");
        setIsModalOpen(false);
        setFormData({ CompanyName: '', Branch: '', ContactPerson: '', ContactNumber: '', DeliveryAddress: '', Username: '' });
        setEditingId(null);
        fetchCustomers();
        // Refresh selected customer logic
        if (selectedCustomer && editingId === selectedCustomer.id) {
             const updated = { ...selectedCustomer, ...payload };
             handleSelectCustomer(updated);
        }
    }
    setIsSubmitting(false);
  };

  const handleDeleteCustomer = async (id, e) => {
      e.stopPropagation();
      if (!confirm("Are you sure you want to delete this customer?")) return;

      const { error } = await supabase.from('Customers').delete().eq('id', id);
      if (error) {
          alert("Error deleting: " + error.message);
      } else {
          alert("Customer deleted.");
          if (selectedCustomer?.id === id) setSelectedCustomer(null);
          fetchCustomers();
      }
  };

  const openAddModal = () => {
      setEditingId(null);
      setFormData({ CompanyName: '', Branch: '', ContactPerson: '', ContactNumber: '', DeliveryAddress: '', Username: '' });
      setIsModalOpen(true);
  };

  const openEditModal = (customer, e) => {
      e.stopPropagation(); 
      setEditingId(customer.id);
      setFormData({
          CompanyName: customer.CompanyName,
          Branch: customer.Branch || '', 
          ContactPerson: customer.ContactPerson || '',
          ContactNumber: customer.ContactNumber || '',
          DeliveryAddress: customer.DeliveryAddress || '',
          Username: customer.Username || ''
      });
      setIsModalOpen(true);
  };
  
  const openAddBranchModal = (customer, e) => {
      e.stopPropagation();
      setEditingId(null); 
      setFormData({
          CompanyName: customer.CompanyName, 
          Branch: '', 
          ContactPerson: customer.ContactPerson || '', 
          ContactNumber: customer.ContactNumber || '',
          DeliveryAddress: '',
          Username: customer.Username || '' // Optional: pre-fill username for new branch
      });
      setIsModalOpen(true);
  };

  const filteredCustomers = customers.filter(c => {
    const term = searchTerm.toLowerCase();
    const combined = `${c.CompanyName} ${c.Branch || ''} ${c.ContactPerson || ''} ${c.Username || ''}`.toLowerCase();
    return combined.includes(term);
  });

  if (loading) return <div className="p-10 flex h-screen items-center justify-center bg-gray-50/50 text-gray-400 font-black tracking-widest uppercase animate-pulse">Loading Customers...</div>;

  return (
    <div className="p-3 md:p-8 max-w-full overflow-x-hidden min-h-screen bg-gray-50/50 pb-32 animate-in fade-in duration-300">
      
      {/* Header Standardized */}
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
            <h1 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight">Customer Analysis</h1>
            <p className="text-[10px] md:text-xs text-gray-400 font-bold uppercase mt-1">Usual usage & delivery patterns</p>
        </div>
        <button 
            onClick={openAddModal}
            className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-black py-3 px-6 rounded-2xl shadow-sm transform transition active:scale-95 flex items-center justify-center gap-2 text-xs uppercase tracking-widest"
        >
            <PlusIcon className="w-5 h-5" strokeWidth={3} /> Add Customer
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: Customer List */}
        <div className="bg-white p-4 md:p-6 rounded-[2rem] shadow-xl border border-gray-100 lg:col-span-1 flex flex-col h-[500px] lg:h-[calc(100vh-140px)]">
           <div className="relative mb-6 flex-none">
              <span className="absolute left-4 top-3.5 text-gray-400"><MagnifyingGlassIcon className="w-5 h-5"/></span>
              <input 
                type="text" 
                placeholder="Search Customer, Branch, or Username..." 
                className="w-full pl-12 p-3.5 border border-gray-200 rounded-2xl bg-gray-50 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
           </div>

           <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {filteredCustomers.map(c => (
                <div 
                  key={c.id} 
                  onClick={() => handleSelectCustomer(c)}
                  className={`p-4 rounded-2xl cursor-pointer border transition-all duration-200 group relative ${
                    selectedCustomer?.id === c.id 
                    ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-400 shadow-md' 
                    : 'bg-white border-gray-100 hover:border-blue-200 hover:shadow-sm'
                  }`}
                >
                   <div className="font-black text-gray-800 text-xs uppercase pr-24 leading-tight">
                       {c.CompanyName}
                   </div>
                   {c.Branch && (
                       <div className="mt-1.5">
                           <span className="text-blue-600 font-black bg-blue-100 px-2 py-0.5 rounded-md text-[9px] border border-blue-200 inline-block">
                               {c.Branch}
                           </span>
                       </div>
                   )}
                   <div className="flex justify-between items-center text-[10px] text-gray-400 font-bold mt-3">
                      <span>{c.ContactPerson || 'No Contact'}</span>
                      {c.Username && <span className="text-purple-500 bg-purple-50 px-2 py-0.5 rounded-md flex items-center gap-1 border border-purple-100"><UserCircleIcon className="w-3 h-3"/> {c.Username}</span>}
                   </div>
                   
                   {/* Action Buttons */}
                   <div className="absolute top-3 right-3 flex gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                       <button onClick={(e) => openEditModal(c, e)} className="p-1.5 text-gray-400 hover:text-blue-600 bg-gray-50 hover:bg-blue-100 rounded-lg transition" title="Edit"><PencilSquareIcon className="w-4 h-4 md:w-5 md:h-5" /></button>
                       <button onClick={(e) => openAddBranchModal(c, e)} className="p-1.5 text-gray-400 hover:text-green-600 bg-gray-50 hover:bg-green-100 rounded-lg transition" title="Add Branch"><PlusIcon className="w-4 h-4 md:w-5 md:h-5" /></button>
                       <button onClick={(e) => handleDeleteCustomer(c.id, e)} className="p-1.5 text-gray-400 hover:text-red-600 bg-gray-50 hover:bg-red-100 rounded-lg transition" title="Delete"><TrashIcon className="w-4 h-4 md:w-5 md:h-5" /></button>
                   </div>
                </div>
              ))}
              {filteredCustomers.length === 0 && (
                  <div className="p-8 text-center text-gray-400 font-bold italic text-xs">No customers found.</div>
              )}
           </div>
        </div>

        {/* RIGHT COLUMN: Analysis Dashboard */}
        <div className="lg:col-span-2 space-y-6 overflow-y-auto lg:h-[calc(100vh-140px)] pr-1 custom-scrollbar">
           {selectedCustomer ? (
             <>
                {/* 1. Customer Profile Card */}
                <div className="bg-white p-5 md:p-6 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between gap-4">
                   <div className="flex-1">
                      <h2 className="text-xl md:text-2xl font-black text-gray-800 uppercase leading-none mb-1">
                          {selectedCustomer.CompanyName}
                      </h2>
                      {selectedCustomer.Branch && <span className="text-xs text-blue-600 font-black bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md mt-1 mb-2 inline-block">Branch: {selectedCustomer.Branch}</span>}
                      
                      <div className="flex flex-wrap gap-2 md:gap-4 mt-3 text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-wide">
                         <span className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-lg border border-gray-100"><UserGroupIcon className="w-4 h-4"/> {selectedCustomer.ContactPerson || 'N/A'}</span>
                         <span className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-lg border border-gray-100"><ShoppingBagIcon className="w-4 h-4"/> {usualUsage.totalOrders} Orders</span>
                         {selectedCustomer.Username && <span className="flex items-center gap-1.5 text-purple-600 bg-purple-50 border border-purple-100 px-2 py-1 rounded-lg"><UserCircleIcon className="w-4 h-4"/> @{selectedCustomer.Username}</span>}
                      </div>
                      <div className="mt-3 text-xs text-gray-500 font-medium max-w-md whitespace-pre-line leading-relaxed">{selectedCustomer.DeliveryAddress || 'No address provided'}</div>
                   </div>
                   <div className="bg-gray-50 p-4 md:p-5 rounded-2xl border border-gray-200 min-w-[180px] flex flex-col justify-center shrink-0 text-center md:text-left">
                      <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Last Order Date</div>
                      <div className="text-xl font-black text-gray-800">
                        {usualUsage.lastOrderDate ? new Date(usualUsage.lastOrderDate).toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: 'numeric'}) : 'N/A'}
                      </div>
                   </div>
                </div>

                {/* 2. Usage Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                   <div className="bg-purple-50 p-5 md:p-6 rounded-[2rem] border border-purple-100 shadow-sm">
                      <div className="flex items-center gap-2 mb-4">
                         <CalendarIcon className="w-5 h-5 text-purple-600" />
                         <h3 className="text-[10px] font-black text-purple-800 uppercase tracking-widest">Usual Delivery Days</h3>
                      </div>
                      <div className="flex flex-wrap gap-2">
                         {usualUsage.deliveryPattern.length > 0 ? (
                           usualUsage.deliveryPattern.map(day => (
                             <span key={day} className="bg-white text-purple-700 px-4 py-2 rounded-xl text-xs font-black border border-purple-200 shadow-sm uppercase">
                               {day}
                             </span>
                           ))
                         ) : (
                           <span className="text-purple-400 text-xs font-bold italic">No clear pattern established yet</span>
                         )}
                      </div>
                   </div>

                   <div className="bg-orange-50 p-5 md:p-6 rounded-[2rem] border border-orange-100 shadow-sm">
                      <div className="flex items-center gap-2 mb-4">
                         <ChartBarIcon className="w-5 h-5 text-orange-600" />
                         <h3 className="text-[10px] font-black text-orange-800 uppercase tracking-widest">Order Frequency</h3>
                      </div>
                      <div className="text-3xl md:text-4xl font-black text-orange-900 leading-none">
                         {(usualUsage.totalOrders / 12).toFixed(1)} <span className="text-xs md:text-sm font-bold text-orange-600 tracking-wide">orders / month (avg)</span>
                      </div>
                   </div>
                </div>

                {/* 3. Top Items List */}
                <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
                   <div className="p-5 md:p-6 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                      <h3 className="text-sm font-black text-gray-800 uppercase tracking-tight flex items-center gap-2">
                          🏆 Top Products
                      </h3>
                      <span className="text-[9px] bg-green-100 text-green-700 border border-green-200 px-2 py-1 rounded-md font-black uppercase tracking-widest">Ranked by Purchase Frequency</span>
                   </div>
                   
                   <div className="overflow-x-auto">
                     <table className="w-full text-left">
                        <thead className="bg-white text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                           <tr>
                              <th className="p-4 pl-6">Product Name</th>
                              <th className="p-4 text-center">Freq (Times)</th>
                              <th className="p-4 text-center">Total Qty</th>
                              <th className="p-4 text-right pr-6">Avg Qty / Order</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 text-xs font-bold text-gray-700">
                           {usualUsage.topItems.map((item, idx) => (
                             <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                                <td className="p-4 pl-6 uppercase">
                                   <div className="flex items-center gap-3">
                                      <span className="text-gray-400 font-black w-4">{idx + 1}.</span>
                                      <span className="font-black text-gray-800">{item.name}</span>
                                   </div>
                                </td>
                                <td className="p-4 text-center">
                                   <span className="bg-gray-100 px-3 py-1 rounded-full font-black text-gray-600">{item.count}</span>
                                </td>
                                <td className="p-4 text-center font-black text-gray-800">
                                   {item.totalQty} <span className="text-[9px] text-gray-400 uppercase">{item.uom}</span>
                                </td>
                                <td className="p-4 text-right pr-6 font-black text-blue-600 text-sm">
                                   {(item.totalQty / item.count).toFixed(1)} <span className="text-[9px] text-blue-400 uppercase font-bold">{item.uom}</span>
                                </td>
                             </tr>
                           ))}
                           {usualUsage.topItems.length === 0 && (
                             <tr><td colSpan="4" className="p-10 text-center text-gray-400 italic font-bold">No order history available for this customer.</td></tr>
                           )}
                        </tbody>
                     </table>
                   </div>
                </div>
             </>
           ) : (
             <div className="h-full flex flex-col items-center justify-center text-gray-300 bg-white rounded-[2rem] shadow-sm border border-gray-100 min-h-[400px] p-8 text-center">
                <div className="bg-gray-50 p-6 rounded-full mb-6 border border-gray-100 shadow-sm">
                    <UserGroupIcon className="w-12 h-12 text-gray-300" />
                </div>
                <h3 className="text-lg font-black text-gray-600 uppercase tracking-tight mb-2">Select a Customer</h3>
                <p className="text-xs font-medium text-gray-400 max-w-xs leading-relaxed">Choose a customer from the directory on the left to view their complete ordering habits and history.</p>
             </div>
           )}
        </div>

      </div>

      {/* ADD / EDIT CUSTOMER MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-in zoom-in duration-200">
            <div className="bg-white rounded-[2.5rem] w-full max-w-lg p-6 md:p-8 shadow-2xl flex flex-col max-h-[95vh] border border-gray-100">
                <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4 shrink-0">
                    <h3 className="text-xl md:text-2xl font-black text-gray-800 uppercase tracking-tight">
                        {editingId ? 'Edit Customer' : 'Add New Customer'}
                    </h3>
                    <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-red-500 text-3xl font-bold bg-gray-50 hover:bg-red-50 w-10 h-10 rounded-full flex items-center justify-center transition-all pb-1">×</button>
                </div>
                
                <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto pr-1 custom-scrollbar">
                    <div>
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Company Name</label>
                        <input 
                            className="w-full p-3.5 border border-gray-200 rounded-2xl text-xs font-black uppercase focus:ring-2 focus:ring-green-500 outline-none bg-gray-50 focus:bg-white transition-all"
                            value={formData.CompanyName}
                            onChange={(e) => setFormData({...formData, CompanyName: e.target.value})}
                            required
                            placeholder="e.g. RESTORAN MAJU"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Branch (Optional)</label>
                        <input 
                            className="w-full p-3.5 border border-gray-200 rounded-2xl text-xs font-black uppercase focus:ring-2 focus:ring-green-500 outline-none bg-gray-50 focus:bg-white transition-all"
                            value={formData.Branch}
                            onChange={(e) => setFormData({...formData, Branch: e.target.value})}
                            placeholder="e.g. HQ or OUTLET 1"
                        />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Contact Person</label>
                            <input 
                                className="w-full p-3.5 border border-gray-200 rounded-2xl text-xs font-bold uppercase focus:ring-2 focus:ring-green-500 outline-none bg-gray-50 focus:bg-white transition-all"
                                value={formData.ContactPerson}
                                onChange={(e) => setFormData({...formData, ContactPerson: e.target.value})}
                                placeholder="e.g. Mr. Tan"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Contact Number</label>
                            <input 
                                className="w-full p-3.5 border border-gray-200 rounded-2xl text-xs font-bold uppercase focus:ring-2 focus:ring-green-500 outline-none bg-gray-50 focus:bg-white transition-all"
                                value={formData.ContactNumber}
                                onChange={(e) => setFormData({...formData, ContactNumber: e.target.value})}
                                placeholder="e.g. 012-3456789"
                            />
                        </div>
                    </div>
                    <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
                        <label className="block text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1.5 ml-1">Client Portal Username (Optional)</label>
                        <input 
                            className="w-full p-3.5 border border-blue-200 bg-white rounded-xl text-xs font-black text-blue-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            value={formData.Username}
                            onChange={(e) => setFormData({...formData, Username: e.target.value})}
                            placeholder="e.g. AURO_TRX"
                        />
                        <p className="text-[9px] text-blue-500 mt-2 font-bold leading-tight">Assigning a username allows the customer to log into the client portal and place self-service orders.</p>
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Delivery Address</label>
                        <textarea 
                            className="w-full p-3.5 border border-gray-200 rounded-2xl text-xs font-bold uppercase focus:ring-2 focus:ring-green-500 outline-none bg-gray-50 focus:bg-white transition-all resize-none h-24"
                            value={formData.DeliveryAddress}
                            onChange={(e) => setFormData({...formData, DeliveryAddress: e.target.value})}
                            placeholder="Full address..."
                        />
                    </div>

                    <div className="pt-4 border-t border-gray-100 mt-4 flex gap-3 shrink-0">
                        <button 
                            type="button"
                            onClick={() => setIsModalOpen(false)}
                            className="flex-1 py-4 bg-gray-100 text-gray-600 font-black rounded-2xl hover:bg-gray-200 transition-all active:scale-95 text-xs uppercase tracking-widest"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-[2] py-4 bg-green-600 text-white font-black rounded-2xl shadow-xl hover:bg-green-700 hover:shadow-green-500/30 transition-all active:scale-95 disabled:bg-gray-300 disabled:shadow-none text-xs uppercase tracking-widest"
                        >
                            {isSubmitting ? 'Saving...' : (editingId ? 'Update Customer' : 'Save Customer')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}

    </div>
  );
}