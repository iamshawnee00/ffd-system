'use client';
import React, { useState, useEffect, useRef, useMemo } from 'react';

// ==================================================================
// ⚠️ IMPORTANT: When copying back to your local project, uncomment these:
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
  MinusIcon,
  ChevronLeftIcon,
  UserCircleIcon,
  ChevronDownIcon
} from '@heroicons/react/24/outline';

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const getLocalDateString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Custom Searchable Customer Component tailored for Templates
function SearchableCustomerSelectForTemplate({ selectedCustomerName, customers, onSelect }) {
    const [isOpen, setIsOpen] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [search, setSearch] = useState('');

    const closeDropdown = () => {
        setIsClosing(true);
        setTimeout(() => {
            setIsOpen(false);
            setIsClosing(false);
            setSearch('');
        }, 350); 
    };

    const filteredCustomers = customers.filter(c => {
        if (!search) return true;
        const term = search.toLowerCase();
        const fullName = `${c.CompanyName || ''} ${c.Branch || ''}`.toLowerCase();
        return fullName.includes(term);
    });

    return (
        <div className="relative w-full">
            <div 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-2.5 pb-2.5 pt-0.5 cursor-pointer flex justify-between items-center active:scale-[0.98] transition-transform"
            >
                <span className={`text-base md:text-sm font-black uppercase truncate ${!selectedCustomerName ? 'text-gray-400' : 'text-gray-800'}`}>
                    {selectedCustomerName || 'SEARCH CUSTOMER...'}
                </span>
                <ChevronDownIcon className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
            </div>
            
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm animate-in fade-in duration-200" onClick={(e) => { e.stopPropagation(); closeDropdown(); }}></div>
                    <div className={`absolute z-50 w-full mt-2 bg-white border border-gray-100 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-top-2 duration-200 ${isClosing ? 'hidden' : 'flex flex-col'}`} style={{ maxHeight: '350px' }}>
                        <div className="p-2 border-b border-gray-100 bg-gray-50/80 backdrop-blur-md sticky top-0">
                            <input 
                                type="text"
                                autoFocus
                                placeholder="Search customer or branch..."
                                className="w-full p-3 border border-gray-200 rounded-xl text-base md:text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-medium bg-white shadow-inner"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                        <div className="overflow-y-auto flex-1 custom-scrollbar">
                            <div 
                                className="p-4 hover:bg-red-50 cursor-pointer text-base md:text-sm font-bold text-red-500 border-b border-gray-50 active:bg-red-100 transition-colors"
                                onClick={(e) => {
                                    e.stopPropagation(); e.preventDefault();
                                    onSelect(''); closeDropdown();
                                }}
                            >
                                -- CLEAR SELECTION --
                            </div>
                            {filteredCustomers.map(c => {
                                const cName = c.Branch ? `${c.CompanyName} - ${c.Branch}` : c.CompanyName;
                                return (
                                    <div 
                                        key={c.id}
                                        className="p-4 hover:bg-gray-50 cursor-pointer text-base md:text-sm font-bold text-gray-700 border-b border-gray-50 last:border-0 active:bg-gray-100 transition-colors uppercase"
                                        onClick={(e) => {
                                            e.stopPropagation(); e.preventDefault();
                                            onSelect(cName); closeDropdown();
                                        }}
                                    >
                                        {cName}
                                    </div>
                                );
                            })}
                            {filteredCustomers.length === 0 && (
                                <div className="p-6 text-center text-sm text-gray-400 italic">No customers found</div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

export default function StandingOrdersPage() {
  const router = useRouter();
  const pathname = usePathname();
  const cleanPath = pathname?.endsWith('/') && pathname !== '/' ? pathname.slice(0, -1) : pathname;
  
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
  const [isAddProductClosing, setIsAddProductClosing] = useState(false); // Ghost click shield

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
    const { data, error } = await supabase
        .from('StandingOrders')
        .select('*');
    
    if (error) {
        console.error("Error fetching standing orders:", error);
        alert("Database Error: Could not load templates. " + error.message);
        setStandingOrders([]);
        return [];
    }

    const sortedData = (data || []).sort((a, b) => {
        const timeA = new Date(a.created_at || a.CreatedAt || 0).getTime();
        const timeB = new Date(b.created_at || b.CreatedAt || 0).getTime();
        return timeB - timeA;
    });

    setStandingOrders(sortedData);
    return sortedData;
  };

  // ==========================================
  // AUTOPILOT ENGINE
  // ==========================================
  const runBackgroundAutopilot = async (activeTemplates, user) => {
      if (!activeTemplates || activeTemplates.length === 0) return;

      const tmr = new Date();
      tmr.setDate(tmr.getDate() + 1);
      const targetDate = getLocalDateString(tmr);
      const dayName = DAYS_OF_WEEK[tmr.getDay()];

      const lockKey = `ffd_autopilot_ran_${targetDate}`;
      if (typeof window !== 'undefined' && localStorage.getItem(lockKey)) return; 

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
          
          let itemsToProcess = template.Items || [];
          if (isConsign && itemsToProcess.length === 0) {
              itemsToProcess = [{
                  ProductCode: 'CSGN-DROP',
                  OrderItems: 'CONSIGNMENT DROP (ROUTE ONLY)',
                  Quantity: 0,
                  UOM: 'TRIP',
                  Price: 0,
                  Replacement: ""
              }];
          }

          const orderRows = itemsToProcess.map(item => {
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
      const matchingTemplates = standingOrders.filter(t => (t.DeliveryDay || '').includes(dayName) && t.Status === 'Active');
      
      if (matchingTemplates.length === 0) return alert(`No active standing orders found scheduled for ${dayName}.`);
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

          let itemsToProcess = template.Items || [];
          if (isConsign && itemsToProcess.length === 0) {
              itemsToProcess = [{ ProductCode: 'CSGN-DROP', OrderItems: 'CONSIGNMENT DROP (ROUTE ONLY)', Quantity: 0, UOM: 'TRIP', Price: 0, Replacement: "" }];
          }

          const orderRows = itemsToProcess.map(item => {
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
          DeliveryDay: '', 
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

  const handleCustomerSelectChange = (val) => {
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

  const handleDeleteItem = (index) => setEditingItems(prev => prev.filter((_, i) => i !== index));

  const closeAddProductDropdown = () => {
      setIsAddProductClosing(true);
      setTimeout(() => {
          setProductSearchTerm('');
          setIsAddProductClosing(false);
      }, 350);
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
      closeAddProductDropdown();
  };

  const saveEditedTemplate = async () => {
      if (!editingTemplate.CustomerName) return alert("Customer Name is required.");
      if (!editingTemplate.DeliveryDay) return alert("Please select at least one Generate On day.");
      
      if (!editingTemplate.IsConsignment && editingItems.length === 0) {
          return alert("Regular templates require at least one product. (Consignments can be empty).");
      }

      setIsGenerating(true); 
      try {
          const payload = {
              CustomerName: editingTemplate.CustomerName.toUpperCase(),
              DeliveryAddress: editingTemplate.DeliveryAddress || '',
              ContactPerson: editingTemplate.ContactPerson || '',
              ContactNumber: editingTemplate.ContactNumber || '',
              DeliveryDay: editingTemplate.DeliveryDay || '',
              DeliveryMode: editingTemplate.DeliveryMode || 'Driver',
              Status: editingTemplate.Status || 'Active',
              IsConsignment: editingTemplate.IsConsignment || false,
              Items: editingItems,
              LoggedBy: currentUser
          };

          let dbError;
          if (editingTemplate.id) {
              const { error } = await supabase.from('StandingOrders').update(payload).eq('id', editingTemplate.id);
              dbError = error;
          } else {
              const { error } = await supabase.from('StandingOrders').insert([payload]);
              dbError = error;
          }
          
          if (dbError) throw new Error(dbError.message || JSON.stringify(dbError));
          
          setIsEditModalOpen(false);
          fetchStandingOrders();
      } catch(e) {
          alert("Database Error:\n" + e.message);
      }
      setIsGenerating(false);
  };

  const filteredModalProducts = useMemo(() => products.filter(p => {
      if (!productSearchTerm) return false;
      const searchTerms = productSearchTerm.toLowerCase().split(' ').filter(Boolean);
      const combinedText = `${p.ProductName} ${p.ProductCode}`.toLowerCase();
      return searchTerms.every(term => combinedText.includes(term));
  }), [products, productSearchTerm]);

  if (loading) return <div className="h-screen flex items-center justify-center text-gray-400 font-black animate-pulse uppercase tracking-widest">Waking up Engine...</div>;

  return (
    <div className="p-3 md:p-8 max-w-full overflow-x-hidden min-h-[100dvh] bg-gray-50/50 pb-32 md:pb-32 font-sans relative">
      
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
      <div className="mb-4 md:mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"> 
         <div>
             <h1 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight uppercase leading-none">Order Management</h1> 
             <p className="text-[10px] md:text-xs text-gray-400 font-bold uppercase mt-1.5 md:mt-2">Manage single-session and historical orders</p> 
         </div>
         <div className="hidden sm:block text-[9px] md:text-xs font-bold text-gray-500 bg-white border border-gray-200 px-3 py-1.5 rounded-full uppercase shadow-sm">
             User: {currentUser}
         </div>
      </div>

      {/* MOBILE iOS-STYLE SEGMENTED TABS */}
      <div className="md:hidden flex bg-gray-200/80 p-1 rounded-xl mb-4 shrink-0 shadow-inner">
         <Link href="/orders/new" prefetch={false} className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all text-center ${cleanPath === '/orders/new' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>New Order</Link>
         <Link href="/orders/list" prefetch={false} className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all text-center ${cleanPath === '/orders/list' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>History</Link>
         <Link href="/orders/standing" prefetch={false} className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all text-center ${cleanPath === '/orders/standing' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Auto-Pilot</Link>
      </div>

      {/* DESKTOP TABS */}
      <div className="hidden md:flex gap-3 mb-6 overflow-x-auto pb-2 custom-scrollbar">
          <Link href="/orders/new" prefetch={false} className={`px-6 py-3.5 rounded-xl font-black text-sm transition-all whitespace-nowrap flex items-center gap-2 ${cleanPath === '/orders/new' ? 'bg-green-600 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-50 shadow-sm border border-gray-100'}`}>
              <PlusCircleIcon className="w-5 h-5" /> New Order
          </Link>
          <Link href="/orders/list" prefetch={false} className={`px-6 py-3.5 rounded-xl font-black text-sm transition-all whitespace-nowrap flex items-center gap-2 ${cleanPath === '/orders/list' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-50 shadow-sm border border-gray-100'}`}>
              <ClipboardDocumentListIcon className="w-5 h-5" /> Order History
          </Link>
          <Link href="/orders/standing" prefetch={false} className={`px-6 py-3.5 rounded-xl font-black text-sm transition-all whitespace-nowrap flex items-center gap-2 ${cleanPath === '/orders/standing' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-50 shadow-sm border border-gray-100'}`}>
              <ArrowPathIcon className="w-5 h-5" /> Auto-Pilot
          </Link>
      </div>

      <div className="animate-in fade-in duration-300 space-y-4 md:space-y-6">
          {/* GENERATOR WIDGET */}
          <div className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-[2rem] p-5 md:p-8 shadow-lg flex flex-col xl:flex-row items-start xl:items-center justify-between gap-5 overflow-hidden relative mx-1 md:mx-0">
              <div className="absolute top-0 right-0 p-10 opacity-10 pointer-events-none hidden md:block">
                  <PlayCircleIcon className="w-48 h-48 text-white transform rotate-12" />
              </div>
              <div className="text-white z-10 w-full xl:w-auto">
                  <h2 className="text-lg md:text-2xl font-black flex items-center gap-2 uppercase tracking-tight">
                      <PlayCircleIcon className="w-6 h-6 md:w-8 md:h-8"/> Auto-Generate
                  </h2>
                  <p className="text-blue-200 font-medium mt-1.5 md:mt-2 text-[11px] md:text-sm max-w-md">Force-generate Delivery Orders from your active templates for a specific date.</p>
              </div>
              
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full xl:w-auto z-10 bg-white/10 p-2 md:p-2 rounded-2xl md:rounded-3xl backdrop-blur-sm border border-white/20">
                  <div className="flex flex-col px-3 py-1 w-full sm:w-auto">
                      <span className="text-[9px] font-black text-blue-200 uppercase tracking-widest mb-0.5">Target Date ({getTargetDayName()})</span>
                      <input 
                          type="date" 
                          value={targetGenDate} 
                          onChange={e => setTargetGenDate(e.target.value)} 
                          className="bg-transparent text-white font-black text-base md:text-lg outline-none cursor-pointer" 
                          style={{colorScheme: 'dark'}} 
                      />
                  </div>
                  <button 
                      onClick={handleGenerateAutos} 
                      disabled={isGenerating} 
                      className="w-full sm:w-auto bg-white text-indigo-700 hover:bg-blue-50 font-black py-3 md:py-4 px-6 md:px-8 rounded-xl md:rounded-2xl shadow-md transition-all active:scale-95 disabled:opacity-50 uppercase text-xs md:text-xs tracking-widest"
                  >
                      {isGenerating ? 'GENERATING...' : `RUN GENERATOR`}
                  </button>
              </div>
          </div>

          {/* TEMPLATE LIST */}
          <div className="bg-transparent md:bg-white rounded-none md:rounded-[2.5rem] shadow-none md:shadow-xl border-none md:border border-gray-100 p-0 md:p-6 flex flex-col min-h-[500px] pb-24 md:pb-0">
              <div className="flex justify-between items-center mb-4 md:mb-6 border-b border-gray-200 md:border-gray-100 pb-3 mx-1 md:mx-0">
                  <div>
                      <h3 className="font-black text-gray-800 uppercase tracking-tight text-base md:text-lg flex items-center gap-2">
                          <ArrowPathIcon className="w-5 h-5 md:w-6 md:h-6 text-indigo-600" /> Active Templates
                      </h3>
                  </div>
                  <button 
                      onClick={openAddModal}
                      className="hidden lg:flex bg-indigo-600 hover:bg-indigo-700 text-white font-black py-2.5 px-4 rounded-xl shadow-md transition-all active:scale-95 items-center gap-2 text-[10px] sm:text-xs uppercase tracking-widest shrink-0"
                  >
                      <PlusIcon className="w-4 h-4" /> <span>New Template</span>
                  </button>
              </div>

              <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar px-1 md:px-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
                      {standingOrders.map(t => {
                          const daysArr = t.DeliveryDay ? t.DeliveryDay.split(',').map(d=>d.trim()).filter(Boolean) : [];
                          return (
                          <div key={t.id} className={`p-4 md:p-5 rounded-2xl md:rounded-3xl border transition-all relative group ${t.Status === 'Active' ? 'bg-white border-gray-200 shadow-sm hover:border-indigo-300' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
                              <div className="flex flex-wrap gap-1 mb-3 pr-16">
                                  {daysArr.map(day => (
                                      <span key={day} className="px-2 py-1 rounded-md md:rounded-lg text-[8px] font-black uppercase tracking-widest border shadow-sm bg-indigo-50 text-indigo-600 border-indigo-200">
                                          {day.substring(0,3)}
                                      </span>
                                  ))}
                                  {t.IsConsignment && (
                                      <span className="bg-orange-100 text-orange-700 border border-orange-200 px-2 py-1 rounded-md md:rounded-lg text-[8px] font-black uppercase tracking-widest shadow-sm">Consignment</span>
                                  )}
                              </div>
                              
                              <div className="absolute top-4 right-4 md:top-5 md:right-5">
                                  {!t.IsConsignment && (
                                      <span className={`text-[9px] font-black uppercase tracking-widest ${t.Status === 'Active' ? 'text-green-500' : 'text-gray-400'}`}>{t.Status}</span>
                                  )}
                              </div>

                              <h4 className="font-black text-gray-800 text-sm md:text-base uppercase leading-tight mb-1.5 pr-8">{t.CustomerName}</h4>
                              <p className="text-[11px] md:text-xs text-gray-500 font-medium mb-4 truncate max-w-full">{t.DeliveryAddress}</p>
                              
                              <div className="flex gap-2 border-t border-gray-100 pt-3 md:pt-4 mt-auto">
                                  <div className="flex-1 py-2 bg-indigo-50 border border-indigo-100 text-indigo-700 font-bold rounded-xl text-[10px] uppercase tracking-widest flex items-center justify-center shadow-sm">
                                      {t.Items?.length || 0} Items
                                  </div>
                                  <button onClick={() => openEditModal(t)} className="p-2 md:p-2.5 bg-gray-50 hover:bg-blue-50 text-blue-600 rounded-xl transition shadow-sm border border-gray-200 active:scale-95"><PencilSquareIcon className="w-5 h-5"/></button>
                                  <button onClick={() => deletePattern(t.id)} className="p-2 md:p-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition shadow-sm border border-red-100 active:scale-95"><TrashIcon className="w-5 h-5"/></button>
                              </div>
                          </div>
                      )})}
                      {standingOrders.length === 0 && (
                          <div className="col-span-full py-20 text-center text-gray-400 italic font-bold text-sm bg-white rounded-3xl border border-dashed border-gray-200 mx-1 md:mx-0">No standing orders found.</div>
                      )}
                  </div>
              </div>
          </div>
      </div>

      {/* MOBILE FLOATING ACTION BAR FOR NEW TEMPLATE */}
      <div className="lg:hidden fixed bottom-[68px] left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-200 p-3 shadow-[0_-10px_20px_rgba(0,0,0,0.1)] z-[50] animate-in slide-in-from-bottom-2 pb-safe">
          <div className="max-w-lg mx-auto">
              <button onClick={openAddModal} className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl transition active:scale-95 text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-indigo-600/30">
                  <PlusIcon className="w-5 h-5 stroke-2" /> Create New Template
              </button>
          </div>
      </div>

      {/* ==========================================
          EDIT / ADD TEMPLATE MODAL (Full Screen on Mobile)
          ========================================== */}
      {isEditModalOpen && editingTemplate && (
          <div className="fixed inset-0 bg-gray-50 md:bg-black/60 z-[110] flex items-end md:items-center justify-center md:p-8 backdrop-blur-sm overflow-hidden">
            <div className="bg-gray-50 md:bg-white rounded-none md:rounded-[2.5rem] w-full h-[100dvh] md:h-auto md:max-h-[95vh] md:max-w-5xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-full md:zoom-in duration-300 border-none md:border border-gray-100 overflow-hidden relative">
                
                {/* Header - Fixed */}
                <div className="flex justify-between items-center px-4 md:px-6 py-4 border-b border-gray-200 md:border-gray-100 shrink-0 bg-white shadow-sm z-20" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))' }}>
                    <div className="flex items-center gap-3">
                        <button onClick={() => setIsEditModalOpen(false)} className="md:hidden p-2 bg-gray-50 rounded-full text-indigo-600 active:scale-95 border border-gray-100"><ChevronLeftIcon className="w-5 h-5 stroke-2"/></button>
                        <h2 className="text-lg md:text-2xl font-black text-gray-800 uppercase leading-none tracking-tight">{editingTemplate.id ? 'Edit Template' : 'New Template'}</h2>
                    </div>
                    <button onClick={() => setIsEditModalOpen(false)} className="hidden md:flex text-gray-400 hover:text-red-500 text-3xl font-bold bg-gray-50 hover:bg-red-50 w-10 h-10 rounded-full items-center justify-center transition-all pb-1">×</button>
                </div>
                
                {/* Scrollable Body */}
                <div className="overflow-y-auto flex-1 custom-scrollbar pb-32 md:pb-0 z-10 relative">
                    
                    {/* Unified Settings Card */}
                    <div className="m-3 md:m-6 bg-white rounded-2xl md:rounded-3xl border border-gray-200 shadow-sm overflow-hidden flex flex-col relative z-[60]">
                        {/* Row 1: Customer Selection */}
                        <div className="p-1 border-b border-gray-100 bg-gray-50/30 rounded-t-2xl relative">
                            <label className="block text-[9px] font-black text-gray-400 uppercase ml-2 mt-1 mb-0.5">Customer Name</label>
                            <SearchableCustomerSelectForTemplate 
                                selectedCustomerName={editingTemplate.CustomerName}
                                customers={customers}
                                onSelect={handleCustomerSelectChange}
                            />
                        </div>
                        {/* Row 2: Address */}
                        <div className="p-2.5 border-b border-gray-100 bg-white">
                            <label className="text-[9px] font-black text-gray-400 uppercase px-1 mb-0.5 block">Delivery Address</label>
                            <input className="w-full text-base md:text-sm font-medium text-gray-800 outline-none bg-transparent px-1 focus:text-indigo-600 transition-colors" value={editingTemplate.DeliveryAddress} onChange={e => setEditingTemplate({...editingTemplate, DeliveryAddress: e.target.value})} placeholder="Full delivery address..." />
                        </div>
                        {/* Row 3: Phone & Mode */}
                        <div className="flex border-b border-gray-100 bg-white">
                            <div className="flex-[1.5] flex flex-col border-r border-gray-100 p-2.5">
                                <label className="text-[9px] font-black text-gray-400 uppercase px-1 mb-0.5">Phone Number</label>
                                <input type="tel" className="w-full text-base md:text-sm font-medium text-gray-800 outline-none bg-transparent px-1 focus:text-indigo-600 transition-colors" value={editingTemplate.ContactNumber || ''} onChange={e => setEditingTemplate({...editingTemplate, ContactNumber: e.target.value})} placeholder="012..." />
                            </div>
                            <div className="flex-1 flex flex-col p-2.5">
                                <label className="text-[9px] font-black text-gray-400 uppercase px-1 mb-0.5">Mode</label>
                                <select className="w-full text-base md:text-sm font-bold text-gray-800 outline-none bg-transparent px-0 focus:text-indigo-600 transition-colors" value={editingTemplate.DeliveryMode || 'Driver'} onChange={e => setEditingTemplate({...editingTemplate, DeliveryMode: e.target.value})}>
                                    <option value="Driver">Driver</option><option value="Lalamove">Lalamove</option><option value="Self Pick-up">Pick-up</option>
                                </select>
                            </div>
                        </div>
                        {/* Row 4: Status */}
                        <div className="flex bg-white rounded-b-2xl items-center justify-between p-3.5 border-t border-gray-50">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black text-gray-800 uppercase tracking-widest leading-none">Template Status</span>
                                <span className="text-[8px] font-bold text-gray-400 mt-1 uppercase">Active templates generate routes automatically</span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer group">
                                <input type="checkbox" className="sr-only peer" checked={editingTemplate.Status === 'Active'} onChange={e => setEditingTemplate({...editingTemplate, Status: e.target.checked ? 'Active' : 'Paused'})} />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500 shadow-inner"></div>
                            </label>
                        </div>
                    </div>

                    {/* Schedule & Consignment Card */}
                    <div className="m-3 md:m-6 bg-white rounded-2xl md:rounded-3xl border border-indigo-100 shadow-sm overflow-hidden flex flex-col relative z-[50]">
                        <div className="p-4 border-b border-indigo-50 bg-indigo-50/20">
                            <label className="block text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-3">Generate On (Multi-Select)</label>
                            <div className="flex flex-wrap gap-2">
                                {DAYS_OF_WEEK.map(d => {
                                    const isActive = (editingTemplate.DeliveryDay || '').includes(d);
                                    return (
                                        <button 
                                            key={d} 
                                            type="button"
                                            onClick={() => toggleDeliveryDay(d)}
                                            className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase transition-all shadow-sm active:scale-95 ${isActive ? 'bg-indigo-600 text-white border border-indigo-700' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-100'}`}
                                        >
                                            {d.substring(0,3)}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="flex bg-white items-center justify-between p-4">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black text-gray-800 uppercase tracking-widest leading-none">Consignment Outlet</span>
                                <span className="text-[8px] font-bold text-orange-500 mt-1 uppercase">Appears on Route Masterlist. Skips DO Printing.</span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer group">
                                <input type="checkbox" className="sr-only peer" checked={editingTemplate.IsConsignment || false} onChange={e => setEditingTemplate({...editingTemplate, IsConsignment: e.target.checked})} />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500 shadow-inner"></div>
                            </label>
                        </div>
                    </div>

                    <div className="px-3 md:px-6">
                        {/* Add Product Search Block */}
                        <div className="bg-white p-3 md:p-5 rounded-2xl border border-indigo-100 shadow-sm relative mb-4 z-40">
                            <label className="block text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-2 ml-1">Add Product {editingTemplate.IsConsignment && <span className="text-gray-400 font-medium normal-case tracking-normal">(Optional for Consignments)</span>}</label>
                            <div className="flex gap-2 relative">
                                <span className="absolute left-3 top-3.5 text-gray-400"><MagnifyingGlassIcon className="w-5 h-5"/></span>
                                <input type="text" placeholder="Search catalog..." className="w-full pl-10 p-3 border border-gray-200 bg-gray-50 rounded-xl text-base md:text-sm font-bold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 transition-all shadow-inner" value={productSearchTerm} onChange={e => setProductSearchTerm(e.target.value)} />
                                {productSearchTerm && (
                                    <button onClick={() => setProductSearchTerm('')} className="absolute right-3 top-3 p-1 text-gray-400 hover:text-gray-600 bg-gray-200 rounded-lg">
                                        <XMarkIcon className="w-5 h-5" />
                                    </button>
                                )}
                            </div>
                            
                            {/* Ghost Click Shield for Search Results */}
                            {productSearchTerm && (
                                <>
                                    <div className={`fixed inset-0 z-30 transition-opacity duration-200 ${isAddProductClosing ? 'bg-transparent opacity-0' : 'bg-black/20 backdrop-blur-sm opacity-100'}`} onClick={(e) => { e.stopPropagation(); closeAddProductDropdown(); }}></div>
                                    <div className={`absolute left-0 right-0 mt-2 bg-white border border-gray-200 rounded-2xl shadow-2xl max-h-64 overflow-y-auto z-40 custom-scrollbar divide-y divide-gray-50 animate-in slide-in-from-top-2 duration-200 ${isAddProductClosing ? 'hidden' : 'block'}`}>
                                        {filteredModalProducts.map(p => (
                                            <div key={p.ProductCode} onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleAddItem(p); }} className="p-4 hover:bg-indigo-50 cursor-pointer flex justify-between items-center group/add text-xs md:text-sm uppercase font-black active:bg-indigo-100 transition-colors">
                                                <div className="truncate pr-4">{p.ProductName} <span className="text-[10px] text-gray-400 ml-2 font-mono">{p.ProductCode}</span></div>
                                                <span className="bg-indigo-600 text-white p-1.5 rounded-lg flex items-center justify-center font-black shadow-sm"><PlusIcon className="w-4 h-4"/></span>
                                            </div>
                                        ))}
                                        {filteredModalProducts.length === 0 && (
                                            <div className="p-6 text-center text-sm text-gray-400 italic font-medium">No products found</div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* DESKTOP HEADER */}
                        <div className="hidden md:flex gap-2 px-3 pb-2 border-b border-gray-200 text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">
                            <div className="flex-1">Order Item</div><div className="w-28 text-center">Qty</div><div className="w-20 text-center">UOM</div><div className="w-24 text-center">Price</div><div className="w-12 text-right"></div>
                        </div>

                        {/* ITEM CARDS */}
                        <div className="space-y-3 z-10 relative">
                            {editingItems.map((item, idx) => (
                                <div key={idx} className="bg-white border border-gray-200 md:border-b md:border-x-0 md:border-t-0 md:rounded-none rounded-2xl p-3 md:p-2 shadow-sm md:shadow-none flex flex-col md:flex-row md:items-center gap-3 relative">
                                    
                                    {/* Mobile Delete Button */}
                                    <button onClick={() => handleDeleteItem(idx)} className="md:hidden absolute top-3 right-3 p-2 text-gray-400 hover:text-red-500 bg-gray-50 rounded-xl border border-gray-100 active:scale-95"><TrashIcon className="w-5 h-5"/></button>
                                    
                                    <div className="md:flex-1 pr-10 md:pr-0 w-full">
                                        <span className="md:hidden text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Product</span>
                                        <select className="w-full p-2.5 md:p-2 border border-gray-200 md:border-transparent md:hover:border-gray-200 rounded-xl md:rounded-lg text-base md:text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 md:bg-transparent font-bold uppercase truncate" value={item.OrderItems} onChange={e => handleEditItemChange(idx, 'OrderItems', e.target.value)}>
                                            <option value={item.OrderItems}>{item.OrderItems}</option>
                                            {products.filter(p => p.ProductName !== item.OrderItems).map(p => <option key={p.ProductCode} value={p.ProductName}>{p.ProductName}</option>)}
                                        </select>
                                    </div>
                                    
                                    <div className="flex w-full md:w-auto gap-2 items-end md:items-center">
                                        {/* QTY Stepper */}
                                        <div className="flex-1 md:w-28 flex flex-col">
                                            <span className="md:hidden text-[9px] font-black text-gray-400 mb-1 ml-1 tracking-widest">QTY</span>
                                            <div className="flex items-center gap-1">
                                                <button onClick={() => handleEditItemChange(idx, 'Quantity', Math.max(0.1, (Number(item.Quantity) || 0) - 1).toFixed(1).replace(/\.0$/, ''))} className="w-[34px] md:w-8 h-[42px] md:h-9 bg-gray-100 active:bg-gray-200 text-gray-600 font-bold rounded-lg flex items-center justify-center transition-colors border border-gray-200 md:border-none shadow-sm md:shadow-none"><span className="text-xl leading-none mb-1">-</span></button>
                                                <input type="number" step="0.1" inputMode="decimal" className="w-full h-[42px] md:h-9 text-center font-black text-base md:text-xs border border-gray-200 rounded-lg shadow-inner outline-none focus:ring-2 focus:ring-indigo-500 bg-white" value={item.Quantity} onChange={e => handleEditItemChange(idx, 'Quantity', e.target.value)} />
                                                <button onClick={() => handleEditItemChange(idx, 'Quantity', ((Number(item.Quantity) || 0) + 1).toFixed(1).replace(/\.0$/, ''))} className="w-[34px] md:w-8 h-[42px] md:h-9 bg-gray-100 active:bg-gray-200 text-gray-600 font-bold rounded-lg flex items-center justify-center transition-colors border border-gray-200 md:border-none shadow-sm md:shadow-none"><span className="text-xl leading-none mb-1">+</span></button>
                                            </div>
                                        </div>
                                        
                                        {/* UOM */}
                                        <div className="flex-[1.2] md:w-20 flex flex-col">
                                            <span className="md:hidden text-[9px] font-black text-gray-400 mb-1 ml-1 tracking-widest">UOM</span>
                                            <select className="w-full h-[42px] md:h-9 bg-white border border-gray-200 rounded-lg text-base md:text-xs font-bold uppercase outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm" value={item.UOM} onChange={e => handleEditItemChange(idx, 'UOM', e.target.value)}>
                                                {(() => {
                                                    const matchedProd = products.find(p => p.ProductCode === item.ProductCode);
                                                    const uoms = matchedProd && matchedProd.AllowedUOMs ? matchedProd.AllowedUOMs.split(',').map(u => u.trim().toUpperCase()).filter(Boolean) : [item.UOM, 'KG', 'CTN', 'PCS'];
                                                    return Array.from(new Set([item.UOM, ...uoms])).filter(Boolean).map(u => <option key={u} value={u}>{u}</option>);
                                                })()}
                                            </select>
                                        </div>

                                        {/* PRICE */}
                                        <div className="flex-[1.5] md:w-24 flex flex-col relative">
                                            <span className="md:hidden text-[9px] font-black text-gray-400 mb-1 ml-1 tracking-widest">PRICE (RM)</span>
                                            <span className="absolute left-3 bottom-[11px] md:bottom-[9px] text-gray-400 text-xs font-bold pointer-events-none">RM</span>
                                            <input type="number" step="0.01" inputMode="decimal" className="w-full h-[42px] md:h-9 pl-8 pr-3 bg-white border border-gray-200 rounded-lg text-base md:text-sm font-black text-right shadow-sm outline-none focus:ring-2 focus:ring-indigo-500" value={item.Price} onChange={e => handleEditItemChange(idx, 'Price', e.target.value)} />
                                        </div>

                                        {/* Desktop Trash */}
                                        <div className="hidden md:flex w-12 justify-end">
                                            <button onClick={() => handleDeleteItem(idx)} className="p-2 bg-white text-gray-300 hover:text-red-500 hover:bg-red-50 border border-gray-200 rounded-lg transition shadow-sm active:scale-95"><TrashIcon className="w-5 h-5" /></button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {editingItems.length === 0 && <div className="p-10 text-center text-gray-400 font-bold italic border-2 border-dashed border-gray-200 rounded-3xl bg-white text-sm">No items in template. Add products above.</div>}
                        </div>
                    </div>
                </div>

                {/* Footer - Fixed Sticky Bottom */}
                <div className="absolute md:static bottom-0 left-0 right-0 p-4 md:p-6 border-t border-gray-200 md:border-gray-100 bg-white/95 backdrop-blur-md md:bg-gray-50 shrink-0 flex justify-between md:justify-end gap-3 z-30 shadow-[0_-10px_20px_rgba(0,0,0,0.05)] md:shadow-none pb-safe">
                    <button onClick={() => setIsEditModalOpen(false)} disabled={isGenerating} className="flex-1 md:flex-none px-6 md:px-8 py-4 md:py-3.5 bg-gray-50 md:bg-white border border-gray-200 text-gray-600 font-bold rounded-2xl md:rounded-xl hover:bg-gray-100 transition-all active:scale-95 text-sm md:text-xs uppercase tracking-widest disabled:opacity-50">Cancel</button>
                    <button onClick={saveEditedTemplate} disabled={isGenerating} className="flex-[2] md:flex-none px-6 md:px-10 py-4 md:py-3.5 bg-indigo-600 text-white font-black rounded-2xl md:rounded-xl shadow-xl md:shadow-md active:scale-95 uppercase text-sm md:text-xs tracking-widest flex items-center justify-center gap-2 hover:bg-indigo-700 shadow-indigo-600/30 disabled:bg-indigo-400">
                        {isGenerating ? 'SAVING...' : <><CheckIcon className="w-5 h-5" strokeWidth={3} /> SAVE TEMPLATE</>}
                    </button>
                </div>
            </div>
          </div>
      )}
    </div>
  );
}