'use client';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

// Use actual Supabase client
import { supabase } from '../../lib/supabaseClient';

import { 
  TrashIcon,
  PlayCircleIcon,
  ArrowPathIcon,
  BoltIcon,
  PlusCircleIcon,
  ClipboardDocumentListIcon,
  PencilSquareIcon,
  XMarkIcon,
  CheckIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  MinusIcon
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
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  
  const [targetGenDate, setTargetGenDate] = useState(() => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);
    return getLocalDateString(tmr);
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [autopilotMessage, setAutopilotMessage] = useState('');

  const autopilotFired = useRef(false);

  // Edit/Add Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [editingItems, setEditingItems] = useState([]);
  const [productSearchTerm, setProductSearchTerm] = useState('');

  useEffect(() => {
      if (isEditModalOpen) document.body.style.overflow = 'hidden';
      else document.body.style.overflow = '';
      return () => { document.body.style.overflow = ''; };
  }, [isEditModalOpen]);

  useEffect(() => {
    async function loadData() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }
      const email = session.user.email || "";
      const user = email.split('@')[0].toUpperCase();
      setCurrentUser(user);

      // Fetch Products for the edit catalog
      const { data: prodData } = await supabase.from('ProductMaster').select('ProductCode, ProductName, BaseUOM, AllowedUOMs').order('ProductName');
      setProducts(prodData || []);

      // Fetch Customers for auto-fill selection
      const { data: custData } = await supabase.from('Customers').select('*').order('CompanyName');
      setCustomers(custData || []);

      const templates = await fetchStandingOrders();

      // Trigger Background Autopilot (Generates ONCE for tomorrow)
      if (!autopilotFired.current) {
          autopilotFired.current = true;
          await runBackgroundAutopilot(templates, user);
      }
      
      setLoading(false);
    }
    loadData();
  }, [router]);

  const fetchStandingOrders = async () => {
    // Fetch directly without order to avoid schema case-sensitivity errors, then sort in memory
    const { data, error } = await supabase
        .from('StandingOrders')
        .select('*');
    
    if (error) {
        console.error("Error fetching standing orders:", error);
        alert("Database Error: Could not load templates. " + error.message);
        setStandingOrders([]);
        return [];
    }

    // Safe in-memory sorting by creation date (newest first)
    const sortedData = (data || []).sort((a, b) => {
        const timeA = new Date(a.created_at || a.CreatedAt || 0).getTime();
        const timeB = new Date(b.created_at || b.CreatedAt || 0).getTime();
        return timeB - timeA;
    });

    setStandingOrders(sortedData);
    return sortedData;
  };

  // ==========================================
  // AUTOPILOT ENGINE (Runs ONCE per day)
  // ==========================================
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

      // Supports multi-day strings like "Monday, Wednesday"
      const tomorrowTemplates = activeTemplates.filter(t => (t.DeliveryDay || '').includes(dayName) && t.Status === 'Active');
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

          const isConsign = template.IsConsignment === true;
          const prefix = isConsign ? 'CSGN' : 'DO';
          const dateStr = targetDate.replaceAll('-', '').slice(2);
          const doNumber = `${prefix}-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;
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
                  "SpecialNotes": isConsign ? "AUTO-GENERATED CONSIGNMENT" : "AUTO-GENERATED STANDING ORDER",
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
          setAutopilotMessage(`Autopilot successfully generated ${generatedCount} orders for tomorrow.`);
          setTimeout(() => setAutopilotMessage(''), 8000);
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
      // Supports multi-day strings like "Monday, Wednesday"
      const matchingTemplates = standingOrders.filter(t => (t.DeliveryDay || '').includes(dayName) && t.Status === 'Active');
      
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

          const isConsign = template.IsConsignment === true;
          const prefix = isConsign ? 'CSGN' : 'DO';
          const dateStr = targetGenDate.replaceAll('-', '').slice(2);
          const doNumber = `${prefix}-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;

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
                  "SpecialNotes": isConsign ? "AUTO-GENERATED CONSIGNMENT" : "AUTO-GENERATED STANDING ORDER",
                  "LoggedBy": currentUser
              };
          });

          if (orderRows.length > 0) {
              const { error } = await supabase.from('Orders').insert(orderRows);
              if (!error) successCount++;
          }
      }

      alert(`Manual Generation Complete!\n\n✅ Created: ${successCount} DOs/Routes\n⏭️ Skipped (Already Exist): ${skippedCount}`);
      setIsGenerating(false);
  };

  const deletePattern = async (id) => {
      if (!confirm("Permanently delete this weekly template?")) return;
      const { error } = await supabase.from('StandingOrders').delete().eq('id', id);
      if (!error) fetchStandingOrders();
  };

  // ==========================================
  // EDIT / ADD TEMPLATE LOGIC
  // ==========================================
  const openAddModal = () => {
      setEditingTemplate({
          CustomerName: '',
          DeliveryAddress: '',
          ContactPerson: '',
          ContactNumber: '',
          DeliveryDay: '', // Default empty so user can select
          DeliveryMode: 'Driver',
          Status: 'Active',
          IsConsignment: false,
          Items: []
      });
      setEditingItems([]);
      setProductSearchTerm('');
      setIsEditModalOpen(true);
  };

  const openEditModal = (template) => {
      setEditingTemplate({ ...template });
      setEditingItems(template.Items ? [...template.Items] : []);
      setProductSearchTerm('');
      setIsEditModalOpen(true);
  };

  const handleCustomerSelectChange = (e) => {
      const val = e.target.value;
      const newTemplate = { ...editingTemplate, CustomerName: val };
      
      const matchedCust = customers.find(c => {
          const cName = c.Branch ? `${c.CompanyName} - ${c.Branch}` : c.CompanyName;
          return cName.toUpperCase() === val.toUpperCase();
      });

      if (matchedCust) {
          newTemplate.DeliveryAddress = matchedCust.DeliveryAddress || '';
          newTemplate.ContactPerson = matchedCust.ContactPerson || '';
          newTemplate.ContactNumber = matchedCust.ContactNumber || '';
      }
      
      setEditingTemplate(newTemplate);
  };

  const toggleDeliveryDay = (day) => {
      let currentDays = editingTemplate.DeliveryDay ? editingTemplate.DeliveryDay.split(',').map(d => d.trim()).filter(Boolean) : [];
      if (currentDays.includes(day)) {
          currentDays = currentDays.filter(d => d !== day);
      } else {
          currentDays.push(day);
      }
      setEditingTemplate({ ...editingTemplate, DeliveryDay: currentDays.join(', ') });
  };

  const handleEditItemChange = (index, field, value) => {
      setEditingItems(prev => {
          const newItems = [...prev];
          newItems[index] = { ...newItems[index], [field]: value };
          
          if (field === 'OrderItems') {
              const matched = products.find(p => p.ProductName === value);
              if (matched) {
                  newItems[index].ProductCode = matched.ProductCode;
                  newItems[index].UOM = matched.BaseUOM;
              }
          }
          return newItems;
      });
  };

  const handleDeleteItem = (index) => {
      setEditingItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddItem = (product) => {
      const newItem = {
          ProductCode: product.ProductCode,
          OrderItems: product.ProductName,
          Quantity: 1,
          UOM: product.BaseUOM,
          Price: 0,
          Replacement: "" 
      };
      setEditingItems([...editingItems, newItem]);
      setProductSearchTerm('');
  };

  const saveEditedTemplate = async () => {
      if (!editingTemplate.CustomerName) return alert("Customer Name is required.");
      if (!editingTemplate.DeliveryDay) return alert("Please select at least one Generate On day.");
      if (!confirm("Save changes to this template?")) return;
      
      try {
          const payload = {
              ...editingTemplate,
              CustomerName: editingTemplate.CustomerName.toUpperCase(),
              Items: editingItems
          };

          if (editingTemplate.id) {
              // Update existing
              const { error } = await supabase
                  .from('StandingOrders')
                  .update(payload)
                  .eq('id', editingTemplate.id);
              if (error) throw error;
          } else {
              // Insert new
              const { error } = await supabase
                  .from('StandingOrders')
                  .insert([payload]);
              if (error) throw error;
          }
          
          alert("Template saved successfully.");
          setIsEditModalOpen(false);
          fetchStandingOrders();
      } catch(e) {
          alert("Error saving template.");
          console.error(e);
      }
  };

  const filteredModalProducts = useMemo(() => products.filter(p => {
      if (!productSearchTerm) return false;
      const searchTerms = productSearchTerm.toLowerCase().split(' ').filter(Boolean);
      const combinedText = `${p.ProductName} ${p.ProductCode}`.toLowerCase();
      return searchTerms.every(term => combinedText.includes(term));
  }), [products, productSearchTerm]);

  if (loading) return <div className="h-screen flex items-center justify-center text-gray-400 font-black animate-pulse uppercase tracking-widest">Waking up Engine...</div>;

  return (
    <div className="p-3 md:p-8 max-w-full overflow-x-hidden min-h-screen bg-gray-50/50 pb-40 md:pb-32 font-sans relative">
      
      <style jsx global>{`
        input, select, textarea { font-size: 16px !important; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 10px; }
      `}</style>

      {autopilotMessage && (
          <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[500] bg-green-600 text-white px-6 py-3 rounded-full shadow-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 animate-in fade-in slide-in-from-top-10">
              <BoltIcon className="w-5 h-5" />
              {autopilotMessage}
          </div>
      )}

      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"> 
         <div>
             <h1 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight uppercase leading-none">Order Management</h1> 
             <p className="text-[10px] md:text-xs text-gray-400 font-bold uppercase mt-2">Manage single-session and historical orders</p> 
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
          <div className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-[2.5rem] p-6 md:p-8 shadow-2xl flex flex-col xl:flex-row items-center justify-between gap-6 overflow-hidden relative">
              <div className="absolute top-0 right-0 p-10 opacity-10 pointer-events-none hidden md:block">
                  <PlayCircleIcon className="w-48 h-48 text-white transform rotate-12" />
              </div>
              <div className="text-white z-10 w-full xl:w-auto">
                  <h2 className="text-xl md:text-2xl font-black flex items-center gap-3 uppercase tracking-tight">
                      <PlayCircleIcon className="w-8 h-8"/> Auto-Generate Orders
                  </h2>
                  <p className="text-blue-200 font-medium mt-2 text-sm max-w-md">Select a date to manually force-generate Delivery Orders from your active templates.</p>
              </div>
              
              <div className="flex flex-col sm:flex-row items-center gap-4 w-full xl:w-auto z-10 bg-white/10 p-2 rounded-3xl backdrop-blur-sm border border-white/20">
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
                      <p className="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-wider">Note: Templates generate routes dynamically based on their target day.</p>
                  </div>
                  <button 
                      onClick={openAddModal}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-black py-2.5 px-4 rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-2 text-[10px] sm:text-xs uppercase tracking-widest shrink-0"
                  >
                      <PlusIcon className="w-4 h-4" /> <span className="hidden sm:inline">New Template</span>
                  </button>
              </div>

              <div className="flex-1 overflow-auto custom-scrollbar pr-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {standingOrders.map(t => {
                          const daysArr = t.DeliveryDay ? t.DeliveryDay.split(',').map(d=>d.trim()).filter(Boolean) : [];
                          return (
                          <div key={t.id} className={`p-5 rounded-3xl border transition-all relative group ${t.Status === 'Active' ? 'bg-white border-gray-200 shadow-sm hover:border-indigo-300' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
                              <div className="flex flex-wrap gap-1 mb-3 pr-16">
                                  {daysArr.map(day => (
                                      <span key={day} className="px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border shadow-sm bg-indigo-50 text-indigo-600 border-indigo-200">
                                          {day.substring(0,3)}
                                      </span>
                                  ))}
                                  {t.IsConsignment && (
                                      <span className="bg-orange-100 text-orange-700 border border-orange-200 px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest shadow-sm">Consignment</span>
                                  )}
                              </div>
                              
                              <div className="absolute top-5 right-5">
                                  {!t.IsConsignment && (
                                      <span className={`text-[9px] font-black uppercase tracking-widest ${t.Status === 'Active' ? 'text-green-500' : 'text-gray-400'}`}>{t.Status}</span>
                                  )}
                              </div>

                              <h4 className="font-black text-gray-800 uppercase leading-tight mb-1 pr-8">{t.CustomerName}</h4>
                              <p className="text-xs text-gray-500 font-medium mb-4 truncate max-w-full">{t.DeliveryAddress}</p>
                              
                              <div className="flex gap-2 border-t border-gray-100 pt-4 mt-auto">
                                  <div className="flex-1 py-2.5 bg-indigo-50 border border-indigo-100 text-indigo-700 font-bold rounded-xl text-[10px] uppercase tracking-widest flex items-center justify-center shadow-sm">
                                      {t.Items?.length || 0} Items
                                  </div>
                                  <button onClick={() => openEditModal(t)} className="p-2.5 bg-gray-50 hover:bg-blue-50 text-blue-600 rounded-xl transition shadow-sm border border-gray-200"><PencilSquareIcon className="w-5 h-5"/></button>
                                  <button onClick={() => deletePattern(t.id)} className="p-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition shadow-sm border border-red-100"><TrashIcon className="w-5 h-5"/></button>
                              </div>
                          </div>
                      )})}
                      {standingOrders.length === 0 && (
                          <div className="col-span-full py-20 text-center text-gray-400 italic font-bold">No standing orders found.</div>
                      )}
                  </div>
              </div>
          </div>
      </div>

      {/* ==========================================
          EDIT / ADD TEMPLATE MODAL
          ========================================== */}
      {isEditModalOpen && editingTemplate && (
          <div className="fixed inset-0 bg-black/60 z-[110] flex items-end sm:items-center justify-center sm:p-4 backdrop-blur-sm">
            <div className="bg-white rounded-t-3xl sm:rounded-[2.5rem] w-full max-w-5xl p-5 sm:p-8 shadow-2xl flex flex-col h-[100dvh] sm:h-auto max-h-[100dvh] sm:max-h-[95vh] animate-in slide-in-from-bottom-full sm:zoom-in duration-300 border-t sm:border border-gray-100">
                <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4 shrink-0" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))' }}>
                    <div><h2 className="text-lg md:text-2xl font-black text-gray-800 uppercase leading-none">{editingTemplate.id ? 'Edit Template' : 'New Template'}</h2></div>
                    <button onClick={() => setIsEditModalOpen(false)} className="text-gray-400 hover:text-red-500 text-3xl font-bold bg-gray-50 hover:bg-red-50 w-10 h-10 rounded-full flex items-center justify-center transition-all pb-1">×</button>
                </div>
                
                <div className="overflow-y-auto flex-1 custom-scrollbar px-1 pb-20">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 shrink-0 bg-gray-50/50 p-6 rounded-3xl border border-gray-100 text-xs font-bold uppercase shadow-inner">
                        <div className="md:col-span-2">
                            <label className="block text-[9px] text-gray-400 mb-1 ml-1">Customer</label>
                            <input 
                                list="template-customer-list"
                                className="w-full p-3 border border-gray-200 bg-white rounded-2xl outline-none font-black text-base md:text-xs focus:ring-2 focus:ring-indigo-500" 
                                value={editingTemplate.CustomerName} 
                                onChange={handleCustomerSelectChange} 
                                placeholder="TYPE TO SELECT OR ADD CUSTOMER..." 
                            />
                            <datalist id="template-customer-list">
                                {customers.map(c => {
                                    const cName = c.Branch ? `${c.CompanyName} - ${c.Branch}` : c.CompanyName;
                                    return <option key={c.id} value={cName} />;
                                })}
                            </datalist>
                        </div>
                        <div className="md:col-span-2"><label className="block text-[9px] text-gray-400 mb-1 ml-1">Address</label><input className="w-full p-3 border border-gray-200 bg-white rounded-2xl outline-none font-medium text-base md:text-xs" value={editingTemplate.DeliveryAddress} onChange={e => setEditingTemplate({...editingTemplate, DeliveryAddress: e.target.value})} /></div>
                        <div><label className="block text-[9px] text-gray-400 mb-1 ml-1">Phone</label><input className="w-full p-3 border border-gray-200 bg-white rounded-2xl outline-none font-black text-base md:text-xs" value={editingTemplate.ContactNumber || ''} onChange={e => setEditingTemplate({...editingTemplate, ContactNumber: e.target.value})} /></div>
                        
                        <div className="md:col-span-3">
                            <label className="block text-[9px] text-gray-400 mb-1 ml-1">Generate On (Multi-Select)</label>
                            <div className="flex flex-wrap gap-2 mt-1">
                                {DAYS_OF_WEEK.map(d => {
                                    const isActive = (editingTemplate.DeliveryDay || '').includes(d);
                                    return (
                                        <button 
                                            key={d} 
                                            type="button"
                                            onClick={() => toggleDeliveryDay(d)}
                                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all shadow-sm ${isActive ? 'bg-indigo-600 text-white border border-indigo-700' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-100'}`}
                                        >
                                            {d.substring(0,3)}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-[9px] text-gray-400 mb-1 ml-1">Order Type</label>
                            <label className="flex items-center gap-3 cursor-pointer bg-white border border-gray-200 p-3 rounded-2xl">
                                <input type="checkbox" className="w-5 h-5 text-orange-600 rounded border-gray-300 focus:ring-orange-500" checked={editingTemplate.IsConsignment || false} onChange={e => setEditingTemplate({...editingTemplate, IsConsignment: e.target.checked})} />
                                <span className="text-[10px] font-black text-gray-800 uppercase tracking-widest leading-tight">Consignment Outlet <span className="block text-[8px] font-bold text-orange-500 mt-0.5">Appears on Route Masterlist. Skips Bulk DO Printing.</span></span>
                            </label>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {/* MOBILE ITEM CARDS */}
                        <div className="md:hidden space-y-4">
                            {editingItems.map((item, idx) => (
                                <div key={idx} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm relative">
                                    <button onClick={() => handleDeleteItem(idx)} className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-red-500 bg-gray-50 rounded-lg"><TrashIcon className="w-5 h-5"/></button>
                                    <div className="text-xs font-black uppercase text-gray-800 pr-10 mb-4">{item.OrderItems}</div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center bg-gray-50 border rounded-xl p-1.5">
                                            <button onClick={() => handleEditItemChange(idx, 'Quantity', Math.max(0, Number(item.Quantity)-1))} className="w-10 h-10 flex items-center justify-center bg-white rounded-lg shadow-sm active:scale-90"><MinusIcon className="w-5 h-5"/></button>
                                            <span className="w-12 text-center text-lg font-black">{item.Quantity}</span>
                                            <button onClick={() => handleEditItemChange(idx, 'Quantity', Number(item.Quantity)+1)} className="w-10 h-10 flex items-center justify-center bg-white rounded-lg shadow-sm active:scale-90"><PlusIcon className="w-5 h-5"/></button>
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            <span className="text-[10px] font-black text-gray-400 uppercase">{item.UOM}</span>
                                            <input type="number" step="0.01" className="w-24 p-2 border border-gray-200 rounded-xl text-right font-black text-base" value={item.Price} onChange={e => handleEditItemChange(idx, 'Price', e.target.value)} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* DESKTOP TABLE */}
                        <div className="hidden md:block overflow-auto border border-gray-100 rounded-3xl bg-white shadow-inner">
                            <table className="w-full text-left text-xs whitespace-nowrap"><thead className="bg-gray-100/50 font-black text-gray-500 sticky top-0 z-10 text-[10px] uppercase tracking-widest border-b border-gray-100"><tr><th className="p-4 pl-6">Catalog Item</th><th className="p-4 w-24 text-center">Qty</th><th className="p-4 w-28 text-center">UOM</th><th className="p-4 w-32 text-right">Price</th><th className="p-4 w-12 pr-6"></th></tr></thead><tbody className="divide-y divide-gray-50 font-bold text-gray-700">{editingItems.map((item, idx) => (<tr key={idx} className="hover:bg-gray-50/50 transition-colors"><td className="p-3 pl-6"><select className="w-full p-2.5 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={item.OrderItems} onChange={e => handleEditItemChange(idx, 'OrderItems', e.target.value)}><option value={item.OrderItems}>{item.OrderItems}</option>{products.filter(p => p.ProductName !== item.OrderItems).map(p => <option key={p.ProductCode} value={p.ProductName}>{p.ProductName}</option>)}</select></td><td className="p-3 text-center"><input type="number" className="w-full p-2.5 border border-gray-200 rounded-xl text-center font-black outline-none shadow-sm focus:ring-2 focus:ring-indigo-500" value={item.Quantity} onChange={e => handleEditItemChange(idx, 'Quantity', e.target.value)} /></td><td className="p-3 text-center"><select className="w-full p-2.5 border border-gray-200 rounded-xl text-center font-bold uppercase outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm" value={item.UOM} onChange={e => handleEditItemChange(idx, 'UOM', e.target.value)}>{(() => {const matchedProd = products.find(p => p.ProductCode === item.ProductCode);const uoms = matchedProd && matchedProd.AllowedUOMs ? matchedProd.AllowedUOMs.split(',').map(u => u.trim().toUpperCase()).filter(Boolean) : [item.UOM, 'KG', 'CTN', 'PCS'];return Array.from(new Set([item.UOM, ...uoms])).filter(Boolean).map(u => <option key={u} value={u}>{u}</option>);})()}</select></td><td className="p-3 text-right font-black text-indigo-600"><input type="number" step="0.01" className="w-full p-2.5 border border-gray-200 rounded-xl text-right font-black outline-none shadow-sm focus:ring-2 focus:ring-indigo-500" value={item.Price} onChange={e => handleEditItemChange(idx, 'Price', e.target.value)} /></td><td className="p-3 text-center pr-6"><button onClick={() => handleDeleteItem(idx)} className="p-2.5 bg-red-50 text-red-500 hover:bg-red-100 rounded-xl transition shadow-sm border border-red-100"><TrashIcon className="w-4 h-4" /></button></td></tr>))}</tbody></table>
                        </div>
                    </div>

                    <div className="bg-white p-4 sm:p-5 rounded-2xl border border-indigo-100 shadow-sm relative mt-6">
                        <label className="block text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-2 ml-1">Add Product to Template</label>
                        <div className="flex gap-2 relative">
                            <span className="absolute left-3 top-3.5 text-gray-400"><MagnifyingGlassIcon className="w-4 h-4 sm:w-5 sm:h-5"/></span>
                            <input type="text" placeholder="Search catalog..." className="w-full pl-9 p-3 border border-gray-200 bg-gray-50 rounded-xl text-xs font-bold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 transition-all" value={productSearchTerm} onChange={e => setProductSearchTerm(e.target.value)} />
                        </div>
                        {productSearchTerm && (
                            <div className="absolute left-4 right-4 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto z-20 custom-scrollbar divide-y divide-gray-50">
                                {filteredModalProducts.map(p => (
                                    <div key={p.ProductCode} onClick={() => handleAddItem(p)} className="p-3 hover:bg-indigo-50 cursor-pointer flex justify-between items-center group/add text-[10px] sm:text-xs uppercase font-black">
                                        <div>{p.ProductName} <span className="text-[9px] text-gray-400 ml-2 font-mono">{p.ProductCode}</span></div>
                                        <span className="bg-indigo-600 text-white p-1 rounded flex items-center justify-center font-black shadow-sm"><PlusIcon className="w-3 h-3"/></span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-auto shrink-0 pt-6 border-t border-gray-100 bg-white" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
                    <button onClick={() => setIsEditModalOpen(false)} className="flex-1 px-8 py-5 bg-gray-100 text-gray-600 font-black rounded-2xl transition active:scale-95 uppercase text-xs tracking-widest border border-gray-200">Cancel</button>
                    <button onClick={saveEditedTemplate} className="flex-[2] px-10 py-5 bg-indigo-600 text-white font-black rounded-2xl shadow-xl active:scale-95 uppercase text-xs tracking-widest flex items-center justify-center gap-2 shadow-indigo-600/30">
                        <CheckIcon className="w-5 h-5" strokeWidth={3} /> Save Template
                    </button>
                </div>
            </div>
          </div>
      )}
    </div>
  );
}