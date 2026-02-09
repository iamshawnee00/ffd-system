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
  TrashIcon 
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
    DeliveryAddress: ''
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
          dayFrequency[dayName] += 1;
       }
    });

    const sortedItems = Object.values(itemFrequency)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); 

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

  // 5. Handle Form Submit (Add or Edit)
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    if (!formData.CompanyName) {
        alert("Company Name is required");
        setIsSubmitting(false);
        return;
    }
    if (!formData.DeliveryAddress) {
        alert("Delivery Address is required (Unique Identifier)");
        setIsSubmitting(false);
        return;
    }

    // CHECK FOR UNIQUE ADDRESS
    // Logic: Look for ANY customer with this address.
    const { data: existingAddress } = await supabase
        .from('Customers')
        .select('id')
        .eq('DeliveryAddress', formData.DeliveryAddress) 
        .maybeSingle();

    if (existingAddress) {
        // If ADDING: existingAddress implies duplicate -> Block
        // If EDITING: Block ONLY if the found ID is NOT the one we are editing (i.e., address belongs to someone else)
        if (!editingId || (editingId && existingAddress.id !== editingId)) {
            alert("Error: A customer with this EXACT address already exists. Address must be unique per branch.");
            setIsSubmitting(false);
            return;
        }
    }

    const payload = {
        CompanyName: formData.CompanyName,
        Branch: formData.Branch, 
        ContactPerson: formData.ContactPerson,
        ContactNumber: formData.ContactNumber,
        DeliveryAddress: formData.DeliveryAddress
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
        setFormData({ CompanyName: '', Branch: '', ContactPerson: '', ContactNumber: '', DeliveryAddress: '' });
        setEditingId(null);
        fetchCustomers();
        // Update selection if we just edited the currently selected customer
        if (selectedCustomer && editingId === selectedCustomer.id) {
             setSelectedCustomer({ ...selectedCustomer, ...payload });
        }
    }
    setIsSubmitting(false);
  };

  // 6. Handle Delete Customer
  const handleDeleteCustomer = async (id, e) => {
      e.stopPropagation();
      if (!confirm("Are you sure you want to delete this customer? This cannot be undone.")) return;

      const { error } = await supabase
          .from('Customers')
          .delete()
          .eq('id', id);

      if (error) {
          alert("Error deleting customer: " + error.message);
      } else {
          alert("Customer deleted.");
          if (selectedCustomer?.id === id) {
              setSelectedCustomer(null);
          }
          fetchCustomers();
      }
  };

  const openAddModal = () => {
      setEditingId(null);
      setFormData({ CompanyName: '', Branch: '', ContactPerson: '', ContactNumber: '', DeliveryAddress: '' });
      setIsModalOpen(true);
  };

  const openEditModal = (customer, e) => {
      e.stopPropagation(); 
      setEditingId(customer.id);
      setFormData({
          CompanyName: customer.CompanyName,
          Branch: customer.Branch || '', 
          ContactPerson: customer.ContactPerson,
          ContactNumber: customer.ContactNumber,
          DeliveryAddress: customer.DeliveryAddress
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
          DeliveryAddress: ''
      });
      setIsModalOpen(true);
  };

  const filteredCustomers = customers.filter(c => {
    const term = searchTerm.toLowerCase();
    return (
        c.CompanyName.toLowerCase().includes(term) ||
        (c.Branch && c.Branch.toLowerCase().includes(term)) || 
        (c.ContactPerson && c.ContactPerson.toLowerCase().includes(term))
    );
  });

  if (loading) return <div className="p-10 text-center font-bold text-gray-400">Loading Customers...</div>;

  return (
    <div className="p-3 md:p-6 max-w-full overflow-x-hidden pt-16 md:pt-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-3">
        <div>
            <h1 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight">Customer Analysis</h1>
            <p className="text-[10px] md:text-xs text-gray-400 font-bold uppercase mt-1">Usual usage & delivery patterns</p>
        </div>
        <button 
            onClick={openAddModal}
            className="bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs shadow-lg flex items-center gap-2 transition transform active:scale-95"
        >
            <PlusIcon className="w-4 h-4" /> Add Customer
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-140px)]">
        
        {/* LEFT COLUMN: Customer List */}
        <div className="bg-white p-4 rounded-3xl shadow-xl border border-gray-100 lg:col-span-1 flex flex-col h-full">
           <div className="mb-4 relative">
              <input 
                type="text" 
                placeholder="Search Customer or Branch..." 
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
                  className={`p-4 rounded-xl cursor-pointer border transition-all duration-200 group relative ${
                    selectedCustomer?.id === c.id 
                    ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500 shadow-sm' 
                    : 'bg-white border-gray-100 hover:border-blue-200 hover:shadow-md'
                  }`}
                >
                   <div className="font-black text-gray-800 text-xs uppercase mb-1 pr-20 flex items-center flex-wrap">
                       {c.CompanyName}
                       {c.Branch && <span className="ml-2 text-blue-600 font-bold bg-blue-100 px-1.5 py-0.5 rounded text-[9px]">{c.Branch}</span>}
                   </div>
                   <div className="flex justify-between items-center text-[10px] text-gray-400 font-medium">
                      <span>{c.ContactPerson || 'No Contact'}</span>
                   </div>
                   
                   {/* Action Buttons */}
                   <div className="absolute top-3 right-3 flex gap-1">
                       <button 
                         onClick={(e) => openEditModal(c, e)}
                         className="p-1.5 text-gray-400 hover:text-blue-600 bg-gray-50 hover:bg-blue-100 rounded-lg transition"
                         title="Edit Customer"
                       >
                          <PencilSquareIcon className="w-4 h-4" />
                       </button>
                       <button 
                         onClick={(e) => openAddBranchModal(c, e)}
                         className="p-1.5 text-gray-400 hover:text-green-600 bg-gray-50 hover:bg-green-100 rounded-lg transition"
                         title="Add Branch"
                       >
                          <PlusIcon className="w-4 h-4" />
                       </button>
                       <button 
                         onClick={(e) => handleDeleteCustomer(c.id, e)}
                         className="p-1.5 text-gray-400 hover:text-red-600 bg-gray-50 hover:bg-red-100 rounded-lg transition"
                         title="Delete Customer"
                       >
                          <TrashIcon className="w-4 h-4" />
                       </button>
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
                      <h2 className="text-2xl font-black text-gray-800 uppercase leading-none flex items-center flex-wrap">
                          {selectedCustomer.CompanyName}
                      </h2>
                      {selectedCustomer.Branch && <span className="text-sm text-blue-500 font-bold mt-1 block">Branch: {selectedCustomer.Branch}</span>}
                      
                      <div className="flex gap-4 mt-3 text-xs font-bold text-gray-500">
                         <span className="flex items-center gap-1"><UserGroupIcon className="w-4 h-4"/> {selectedCustomer.ContactPerson}</span>
                         <span className="flex items-center gap-1"><ShoppingBagIcon className="w-4 h-4"/> {usualUsage.totalOrders} Orders Lifetime</span>
                      </div>
                      <div className="mt-2 text-xs text-gray-400 max-w-md whitespace-pre-line">{selectedCustomer.DeliveryAddress}</div>
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

                {/* 3. Top Items List */}
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

      {/* ADD / EDIT CUSTOMER MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-black text-gray-800">{editingId ? 'Edit Customer' : 'Add New Customer'}</h3>
                    <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-red-500 font-bold text-xl">×</button>
                </div>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Company Name</label>
                        <input 
                            className="w-full p-3 border border-gray-200 rounded-xl text-sm font-bold uppercase focus:ring-2 focus:ring-green-500 outline-none"
                            value={formData.CompanyName}
                            onChange={(e) => setFormData({...formData, CompanyName: e.target.value})}
                            required
                            placeholder="e.g. RESTORAN MAJU"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Branch (Optional)</label>
                        <input 
                            className="w-full p-3 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-green-500 outline-none uppercase"
                            value={formData.Branch}
                            onChange={(e) => setFormData({...formData, Branch: e.target.value})}
                            placeholder="e.g. HQ or OUTLET 1"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Contact Person</label>
                        <input 
                            className="w-full p-3 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-green-500 outline-none"
                            value={formData.ContactPerson}
                            onChange={(e) => setFormData({...formData, ContactPerson: e.target.value})}
                            placeholder="e.g. Mr. Tan"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Contact Number</label>
                        <input 
                            className="w-full p-3 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-green-500 outline-none"
                            value={formData.ContactNumber}
                            onChange={(e) => setFormData({...formData, ContactNumber: e.target.value})}
                            placeholder="e.g. 012-3456789"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Delivery Address</label>
                        <textarea 
                            className="w-full p-3 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-green-500 outline-none uppercase resize-none h-24"
                            value={formData.DeliveryAddress}
                            onChange={(e) => setFormData({...formData, DeliveryAddress: e.target.value})}
                            placeholder="Full address..."
                        />
                    </div>

                    <button 
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full py-3 bg-green-600 text-white font-bold rounded-xl shadow-lg hover:bg-green-700 transition active:scale-95 disabled:bg-gray-300 mt-4"
                    >
                        {isSubmitting ? 'Saving...' : (editingId ? 'Update Customer' : 'Save Customer')}
                    </button>
                </form>
            </div>
        </div>
      )}

    </div>
  );
}