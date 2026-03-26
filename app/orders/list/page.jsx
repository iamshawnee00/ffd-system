'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { 
  PencilSquareIcon, 
  TrashIcon,
  ArrowPathIcon,
  PrinterIcon,
  TruckIcon,
  XMarkIcon,
  CheckIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  PlusCircleIcon,
  ClipboardDocumentListIcon,
  MinusIcon,
  ChevronLeftIcon
} from '@heroicons/react/24/outline';

const getRawStatus = (info) => info?.Status || info?.status || info?.delivery_status || 'PENDING';

const formatDisplayStatus = (rawStatus) => {
  if (!rawStatus) return 'PENDING';
  const s = String(rawStatus).toUpperCase().trim().replace(/_/g, ' ');
  if (s.includes('DELIVERED') || s.includes('COMPLETED') || s.includes('DEPOSITED') || s.includes('POD')) return 'DELIVERED';
  if (s.includes('TRANSIT') || s.includes('STARTED') || s.includes('PICKED') || s.includes('WAY') || s.includes('READY')) return 'IN TRANSIT';
  if (s.includes('ASSIGNED') || s.includes('ACCEPTED')) return 'ASSIGNED';
  if (s.includes('FAILED') || s.includes('CANCELLED') || s.includes('INCOMPLETE')) return 'FAILED';
  return 'PENDING'; 
};

const getStatusColor = (rawStatus) => {
  const s = formatDisplayStatus(rawStatus);
  if(s === 'PENDING') return 'bg-orange-100 text-orange-700 border-orange-200';
  if(s === 'ASSIGNED') return 'bg-blue-100 text-blue-700 border-blue-200';
  if(s === 'IN TRANSIT') return 'bg-purple-100 text-purple-700 border-purple-200';
  if(s === 'DELIVERED') return 'bg-green-100 text-green-700 border-green-200';
  if(s === 'FAILED') return 'bg-red-100 text-red-700 border-red-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
};

export default function OrderListPage() {
  // 1. Data States
  const [orderHistory, setOrderHistory] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [currentUser, setCurrentUser] = useState('');

  // 2. Filter & UI States
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); 

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [editingItems, setEditingItems] = useState([]);
  const [deletedItemIds, setDeletedItemIds] = useState([]);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [isAddProductClosing, setIsAddProductClosing] = useState(false); // Ghost click shield

  const [selectedOrders, setSelectedOrders] = useState([]);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [bulkEditData, setBulkEditData] = useState({ deliveryDate: '', deliveryMode: '', status: '' });
  const [sortConfig, setSortConfig] = useState({ key: 'Delivery Date', direction: 'desc' });

  // 3. Router Hooks
  const router = useRouter();
  const pathname = usePathname();
  const cleanPath = pathname?.endsWith('/') && pathname !== '/' ? pathname.slice(0, -1) : pathname;
  
  // 4. Effects
  useEffect(() => {
      if (isEditModalOpen || isBulkEditOpen) {
          document.body.style.overflow = 'hidden';
      } else {
          document.body.style.overflow = '';
      }
      return () => { document.body.style.overflow = ''; };
  }, [isEditModalOpen, isBulkEditOpen]);

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
          .from('Orders')
          .select('*')
          .order('Delivery Date', { ascending: false }) 
          .limit(3000); 
      
      if (data) {
          const grouped = {};
          data.forEach(row => {
              const dn = row.DONumber;
              if (!grouped[dn]) {
                  grouped[dn] = { info: { ...row }, items: [] };
              } else {
                  const currentRaw = getRawStatus(grouped[dn].info);
                  const newRaw = getRawStatus(row);
                  const currentMapped = formatDisplayStatus(currentRaw);
                  const newMapped = formatDisplayStatus(newRaw);
                  const statusPriority = { 'FAILED': 0, 'PENDING': 1, 'ASSIGNED': 2, 'IN TRANSIT': 3, 'DELIVERED': 4 };
                  
                  if (statusPriority[newMapped] > statusPriority[currentMapped]) {
                      grouped[dn].info.Status = newRaw;
                  }
              }
              grouped[dn].items.push(row);
          });
          
          const sortedHistory = Object.values(grouped).sort((a, b) => {
              const dateA = new Date(a.info["Delivery Date"]);
              const dateB = new Date(b.info["Delivery Date"]);
              if (dateA.getTime() !== dateB.getTime()) return dateB - dateA;
              return new Date(b.info.Timestamp) - new Date(a.info.Timestamp);
          });
          setOrderHistory(sortedHistory);
      }
    } catch(err) {}
  };

  useEffect(() => {
    async function loadData() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          router.push('/login');
          return;
        }

        const email = session?.user?.email || "";
        setCurrentUser(email.split('@')[0].toUpperCase());

        await fetchOrders();
        
        const { data: prodData } = await supabase
          .from('ProductMaster')
          .select('ProductCode, ProductName, BaseUOM, AllowedUOMs')
          .order('ProductName');
        setProducts(prodData || []);

        const { data: custData } = await supabase
          .from('Customers')
          .select('*')
          .order('CompanyName');
        setCustomers(custData || []);

      } catch(e) {}
      setLoading(false);
    }
    
    loadData();

    const channel = supabase
      .channel('realtime_orders_status_list')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'Orders' }, () => {
          fetchOrders(); 
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  const handlePullShipdayStatus = async () => {
      if (!confirm("Pull status from Shipday?")) return;
      setIsSyncing(true);
      try {
          const res = await fetch('/api/shipday/sync-status', { method: 'POST' });
          const result = await res.json();
          if (res.ok) {
              alert(`Success! Updated ${result.updatedCount || 0} orders.`);
              await fetchOrders(); 
          }
      } catch (err) {}
      setIsSyncing(false);
  };

  const toggleOrderSelection = (doNumber) => {
    setSelectedOrders(prev => prev.includes(doNumber) ? prev.filter(id => id !== doNumber) : [...prev, doNumber]);
  };

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const openEditModal = (group) => {
      setEditingOrder({ ...group.info });
      setEditingItems([...group.items]);
      setDeletedItemIds([]);
      setProductSearchTerm('');
      setIsEditModalOpen(true);
  };

  const handleCustomerSelectChange = (e) => {
      const val = e.target.value;
      const newOrder = { ...editingOrder, "Customer Name": val };
      
      const matchedCust = customers.find(c => {
          const cName = c.Branch ? `${c.CompanyName} - ${c.Branch}` : c.CompanyName;
          return cName.toUpperCase() === val.toUpperCase();
      });

      if (matchedCust) {
          newOrder["Delivery Address"] = matchedCust.DeliveryAddress || '';
          newOrder["Contact Person"] = matchedCust.ContactPerson || '';
          newOrder["Contact Number"] = matchedCust.ContactNumber || '';
      }
      
      setEditingOrder(newOrder);
  };

  const handleEditItemChange = (index, field, value) => {
    setEditingItems(prev => {
      const newItems = [...prev];
      newItems[index] = { ...newItems[index], [field]: value };
      if (field === 'Order Items') {
          const matched = products.find(p => p.ProductName === value);
          if (matched) {
              newItems[index]["Product Code"] = matched.ProductCode;
              newItems[index]["UOM"] = matched.BaseUOM;
          }
      }
      return newItems;
    });
  };

  const handleDeleteItem = (index) => {
    const item = editingItems[index];
    if (item.id && !String(item.id).startsWith('new-')) {
      setDeletedItemIds(prev => [...prev, item.id]);
    }
    setEditingItems(prev => prev.filter((_, i) => i !== index));
  };

  const closeAddProductDropdown = () => {
      setIsAddProductClosing(true);
      setTimeout(() => {
          setProductSearchTerm('');
          setIsAddProductClosing(false);
      }, 350);
  };

  const handleAddItem = (product) => {
    const newItem = {
      id: `new-${Date.now()}`, 
      DONumber: editingOrder.DONumber,
      "Delivery Date": editingOrder["Delivery Date"],
      "Customer Name": editingOrder["Customer Name"],
      "Delivery Address": editingOrder["Delivery Address"],
      "Contact Person": editingOrder["Contact Person"],
      "Contact Number": editingOrder["Contact Number"],
      Status: formatDisplayStatus(getRawStatus(editingOrder)),
      "Product Code": product.ProductCode,
      "Order Items": product.ProductName,
      Quantity: 1,
      UOM: product.BaseUOM,
      Price: 0,
      Replacement: "" 
    };
    setEditingItems([...editingItems, newItem]);
    closeAddProductDropdown();
  };

  const saveEditedOrder = async () => {
      if (!confirm("Save changes?")) return;
      try {
        if (deletedItemIds.length > 0) await supabase.from('Orders').delete().in('id', deletedItemIds);
        
        const newItems = [];
        const existingItems = [];
        const cleanStatus = formatDisplayStatus(getRawStatus(editingOrder));
        const occurrenceMap = {};

        editingItems.forEach(item => {
            const isNew = !item.id || (typeof item.id === 'string' && item.id.startsWith('new-'));
            let baseRep = item.Replacement || "";
            if (item.Price === 0 && baseRep !== "YES") baseRep = "FOC";
            
            const key = `${item["Product Code"]}_${baseRep.trim()}`;
            let repVal = baseRep;
            if (occurrenceMap[key]) {
                repVal = baseRep.trim() + " ".repeat(occurrenceMap[key]);
                occurrenceMap[key]++;
            } else {
                occurrenceMap[key] = 1;
            }

            const payload = {
                "Customer Name": editingOrder["Customer Name"].toUpperCase(),
                "Delivery Address": editingOrder["Delivery Address"],
                "Contact Person": editingOrder["Contact Person"],
                "Contact Number": editingOrder["Contact Number"],
                "Delivery Date": editingOrder["Delivery Date"],
                "Delivery Mode": editingOrder["Delivery Mode"],
                "Status": cleanStatus,
                "Replacement": repVal, 
                "Product Code": item["Product Code"],
                "Order Items": item["Order Items"],
                "Quantity": item.Quantity,
                "UOM": item.UOM,
                "Price": item.Price,
                "DONumber": editingOrder.DONumber
            };

            if (isNew) {
                newItems.push({ ...payload, "Timestamp": new Date() });
            } else {
                existingItems.push({ ...payload, id: item.id });
            }
        });

        const res1 = newItems.length > 0 ? await supabase.from('Orders').insert(newItems) : { error: null };
        const res2 = existingItems.length > 0 ? await supabase.from('Orders').upsert(existingItems) : { error: null };

        if (!res1.error && !res2.error) {
            alert("Updated successfully.");
            setIsEditModalOpen(false); 
            fetchOrders(); 
        } else {
            alert("Encountered errors while saving. Check console.");
        }
      } catch(e) {}
  };

  const handleBulkPrint = () => {
      if (selectedOrders.length === 0) return;
      const firstSelectedGroup = orderHistory.find(group => selectedOrders.includes(group.info.DONumber));
      const targetDate = firstSelectedGroup ? firstSelectedGroup.info["Delivery Date"] : '';
      window.open(`/reports/batch-do?date=${targetDate}&dos=${selectedOrders.join(',')}`, '_blank');
  };

  const handleBulkShipday = async () => {
      if (!confirm(`Push ${selectedOrders.length} selected orders to Shipday?`)) return;
      let successCount = 0;
      for (const doNumber of selectedOrders) {
          const group = orderHistory.find(g => g.info.DONumber === doNumber);
          if (!group) continue;
          try {
              const res = await fetch('/api/shipday', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ order: group })
              });
              if (res.ok) successCount++;
          } catch (e) {}
      }
      alert(`Completed push. Successful: ${successCount} / ${selectedOrders.length}`);
  };

  const handleBulkDelete = async () => {
      if (!confirm(`Are you sure you want to permanently delete ${selectedOrders.length} selected orders?`)) return;
      try {
        const { error } = await supabase.from('Orders').delete().in('DONumber', selectedOrders);
        if (!error) {
            setSelectedOrders([]);
            fetchOrders();
        }
      } catch(e){}
  };

  const handleBulkEditSave = async () => {
      const updates = {};
      if (bulkEditData.deliveryDate) updates["Delivery Date"] = bulkEditData.deliveryDate;
      if (bulkEditData.deliveryMode) updates["Delivery Mode"] = bulkEditData.deliveryMode;
      if (bulkEditData.status) updates["Status"] = bulkEditData.status;

      if (Object.keys(updates).length === 0) return alert("No fields to update.");
      if (!confirm(`Apply changes to ${selectedOrders.length} orders?`)) return;

      try {
        const { error } = await supabase.from('Orders').update(updates).in('DONumber', selectedOrders);
        if (!error) {
            alert("Bulk update successful!");
            setIsBulkEditOpen(false);
            setSelectedOrders([]);
            setBulkEditData({ deliveryDate: '', deliveryMode: '', status: '' });
            fetchOrders();
        }
      } catch(e){}
  };

  const handlePrintOrder = (doNumber) => {
      localStorage.setItem('print_do_target', doNumber);
      window.open(`/orders/print?do=${doNumber}`, '_blank');
  };

  const filteredOrderHistory = useMemo(() => orderHistory.filter(group => {
      const rawStatus = getRawStatus(group.info);
      const displayStatus = formatDisplayStatus(rawStatus);
      
      if (statusFilter !== 'ALL' && displayStatus !== statusFilter) return false;
      if (!historySearchTerm) return true;

      const terms = historySearchTerm.toLowerCase().split(' ').filter(Boolean);
      const itemsText = group.items.map(item => `${item["Order Items"] || ''} ${item["Product Code"] || ''}`).join(' ');
      const searchStr = `${group.info.DONumber} ${group.info["Customer Name"]} ${group.info["Delivery Date"]} ${displayStatus} ${itemsText}`.toLowerCase();
      
      return terms.every(t => searchStr.includes(t));
  }), [orderHistory, historySearchTerm, statusFilter]);

  const sortedOrderHistory = useMemo(() => {
      let sortableItems = [...filteredOrderHistory];
      if (sortConfig !== null) {
          sortableItems.sort((a, b) => {
              let aValue, bValue;
              if (sortConfig.key === 'Delivery Date') {
                  aValue = new Date(a.info['Delivery Date']).getTime();
                  bValue = new Date(b.info['Delivery Date']).getTime();
              } else if (sortConfig.key === 'DONumber') {
                  aValue = a.info.DONumber;
                  bValue = b.info.DONumber;
              } else if (sortConfig.key === 'Customer Name') {
                  aValue = a.info['Customer Name'];
                  bValue = b.info['Customer Name'];
              } else if (sortConfig.key === 'Items') {
                  aValue = a.items.length;
                  bValue = b.items.length;
              } else if (sortConfig.key === 'Status') {
                  aValue = formatDisplayStatus(getRawStatus(a.info));
                  bValue = formatDisplayStatus(getRawStatus(b.info));
              }

              if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
              if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
              return 0;
          });
      }
      return sortableItems;
  }, [filteredOrderHistory, sortConfig]);

  const displayedHistory = sortedOrderHistory.slice(0, 100);

  const toggleSelectAll = () => {
    if (selectedOrders.length === displayedHistory.length) setSelectedOrders([]);
    else setSelectedOrders(displayedHistory.map(group => group.info.DONumber));
  };

  if (loading) return <div className="p-10 flex items-center justify-center h-screen font-black text-gray-300 animate-pulse uppercase tracking-widest">Loading Orders...</div>;

  return (
    <div className="p-3 md:p-8 max-w-full min-h-[100dvh] bg-gray-50/50 pb-32 font-sans relative overflow-x-hidden">
      
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
         <Link href="/orders/new" className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all text-center ${cleanPath === '/orders/new' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>New Order</Link>
         <Link href="/orders/list" className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all text-center ${cleanPath === '/orders/list' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>History</Link>
         <Link href="/orders/standing" className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all text-center ${cleanPath === '/orders/standing' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Auto-Pilot</Link>
      </div>

      {/* DESKTOP TABS */}
      <div className="hidden md:flex gap-3 mb-6 overflow-x-auto pb-2 custom-scrollbar">
          <Link href="/orders/new" className={`px-6 py-3.5 rounded-xl font-black text-sm transition-all whitespace-nowrap flex items-center gap-2 ${cleanPath === '/orders/new' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-50 shadow-sm border border-gray-100'}`}>
              <PlusCircleIcon className="w-5 h-5" /> New Order
          </Link>
          <Link href="/orders/list" className={`px-6 py-3.5 rounded-xl font-black text-sm transition-all whitespace-nowrap flex items-center gap-2 ${cleanPath === '/orders/list' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-50 shadow-sm border border-gray-100'}`}>
              <ClipboardDocumentListIcon className="w-5 h-5" /> Order History
          </Link>
          <Link href="/orders/standing" className={`px-6 py-3.5 rounded-xl font-black text-sm transition-all whitespace-nowrap flex items-center gap-2 ${cleanPath === '/orders/standing' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-50 shadow-sm border border-gray-100'}`}>
              <ArrowPathIcon className="w-5 h-5" /> Auto-Pilot
          </Link>
      </div>

      <div className="animate-in fade-in bg-transparent md:bg-white p-0 md:p-6 rounded-none md:rounded-3xl md:shadow-xl md:border border-gray-100 flex flex-col relative md:overflow-hidden h-auto md:h-[calc(100vh-140px)]">
         
         {/* TOP ACTION BAR: Search, Sync */}
         <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-4 md:mb-6 gap-3 md:gap-4 flex-none w-full">
             
             {/* Left: Search & Filter */}
             <div className="flex flex-row items-center gap-2 w-full xl:w-auto">
                 <div className="relative flex-1 sm:w-64 sm:flex-none">
                     <span className="absolute left-3 top-3 md:top-2.5 text-gray-400"><MagnifyingGlassIcon className="w-4 h-4 md:w-5 md:h-5" /></span>
                     <input type="text" placeholder="Search DO or Customer..." className="bg-white md:bg-gray-50 text-base md:text-sm pl-9 md:pl-10 pr-4 py-3 md:py-2 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-blue-500 w-full font-medium shadow-sm md:shadow-none" value={historySearchTerm} onChange={(e) => setHistorySearchTerm(e.target.value)} />
                 </div>
                 <select className="bg-white md:bg-gray-50 border border-gray-200 text-base md:text-sm px-4 py-3 md:py-2 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-gray-700 font-bold cursor-pointer shadow-sm md:shadow-none w-1/3 md:w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                     <option value="ALL">All Status</option>
                     <option value="PENDING">Pending</option>
                     <option value="ASSIGNED">Assigned</option>
                     <option value="IN TRANSIT">IN TRANSIT</option>
                     <option value="DELIVERED">Delivered</option>
                     <option value="FAILED">Failed</option>
                 </select>
             </div>

             {/* Right: Sync */}
             <div className="hidden xl:flex items-center gap-2 w-full xl:w-auto justify-end">
                 <button onClick={handlePullShipdayStatus} disabled={isSyncing} className="px-4 py-2 bg-white border border-gray-200 shadow-sm rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-2 uppercase tracking-widest active:scale-95">
                     <ArrowPathIcon className={`w-4 h-4 md:w-5 md:h-5 ${isSyncing ? 'animate-spin text-blue-500' : ''}`} /> 
                     <span>{isSyncing ? 'SYNCING...' : 'SYNC SHIPDAY'}</span>
                 </button>
             </div>
         </div>

         {/* Mobile History View */}
         <div className="md:hidden flex-1 overflow-y-auto space-y-0 custom-scrollbar pb-10">
            {displayedHistory.map((group) => {
                   const rawStatus = getRawStatus(group.info);
                   const isSelected = selectedOrders.includes(group.info.DONumber);
                   return (
                       <div key={group.info.DONumber} className={`bg-white border rounded-2xl p-4 shadow-sm relative transition-all mb-3 active:scale-[0.99] ${isSelected ? 'border-blue-400 ring-2 ring-blue-400 bg-blue-50/20' : 'border-gray-200 hover:border-blue-300'}`} onClick={() => toggleOrderSelection(group.info.DONumber)}>
                           
                           {/* Selection Checkbox (Visual only, container handles click) */}
                           <div className="absolute top-4 right-4 pointer-events-none">
                               <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                                   {isSelected && <CheckIcon className="w-3 h-3 text-white" strokeWidth={4} />}
                               </div>
                           </div>

                           <div className="flex justify-between items-start mb-3 pr-8">
                               <div className="flex flex-col gap-1.5">
                                   <span className="font-mono text-xs font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 w-fit">{group.info.DONumber}</span>
                                   <span className="text-[10px] font-bold text-gray-500">{new Date(group.info["Delivery Date"]).toLocaleDateString('en-GB', {weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'})}</span>
                               </div>
                           </div>
                           <div className="font-black text-gray-800 text-base uppercase leading-tight mb-2">
                               {group.info["Customer Name"]}
                           </div>
                           <div className="flex items-center gap-2 mb-4">
                               <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase border ${getStatusColor(rawStatus)}`}>{formatDisplayStatus(rawStatus)}</span>
                               <span className="bg-gray-100 text-gray-600 text-[10px] font-black px-2 py-1 rounded-md border border-gray-200">{group.items.length} Items</span>
                           </div>
                           <div className="flex justify-end gap-2 border-t border-gray-100 pt-3" onClick={e => e.stopPropagation()}>
                               <button onClick={() => openEditModal(group)} className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl font-bold text-xs transition-colors flex items-center gap-1.5 active:scale-95"><PencilSquareIcon className="w-4 h-4"/> Edit</button>
                               <button onClick={() => handlePrintOrder(group.info.DONumber)} className="px-4 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-600 rounded-xl font-bold text-xs transition-colors flex items-center gap-1.5 active:scale-95"><PrinterIcon className="w-4 h-4"/> Print</button>
                           </div>
                       </div>
                 )
            })}
            {displayedHistory.length === 0 && <div className="text-center p-10 text-gray-400 italic font-bold">No orders match your filter.</div>}
         </div>

         {/* Desktop Table View */}
         <div className="hidden md:block flex-1 overflow-auto custom-scrollbar border border-gray-200 rounded-2xl">
             <table className="w-full text-left whitespace-nowrap text-sm">
                 <thead className="text-gray-400 border-b border-gray-200 sticky top-0 bg-gray-50 z-10 shadow-sm text-xs uppercase tracking-widest">
                     <tr>
                        <th className="p-4 font-medium text-center w-12"><input type="checkbox" className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer" checked={displayedHistory.length > 0 && selectedOrders.length === displayedHistory.length} onChange={toggleSelectAll} /></th>
                        <th className="p-4 font-bold cursor-pointer hover:text-blue-600 transition-colors select-none" onClick={() => requestSort('Delivery Date')}>Date {sortConfig.key === 'Delivery Date' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                        <th className="p-4 font-bold cursor-pointer hover:text-blue-600 transition-colors select-none" onClick={() => requestSort('DONumber')}>DO Number {sortConfig.key === 'DONumber' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                        <th className="p-4 font-bold cursor-pointer hover:text-blue-600 transition-colors select-none" onClick={() => requestSort('Customer Name')}>Customer {sortConfig.key === 'Customer Name' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                        <th className="p-4 font-bold text-center cursor-pointer hover:text-blue-600 transition-colors select-none" onClick={() => requestSort('Items')}>Items {sortConfig.key === 'Items' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                        <th className="p-4 font-bold text-center cursor-pointer hover:text-blue-600 transition-colors select-none" onClick={() => requestSort('Status')}>Status {sortConfig.key === 'Status' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                        <th className="p-4 font-bold text-right pr-6">Actions</th>
                     </tr>
                 </thead>
                 <tbody className="text-gray-700 font-bold bg-white">
                     {displayedHistory.map((group) => {
                           const rawStatus = getRawStatus(group.info);
                           const isSelected = selectedOrders.includes(group.info.DONumber);
                           return (
                           <tr key={group.info.DONumber} className={`${isSelected ? 'bg-blue-50/60' : 'hover:bg-blue-50/30'} transition-colors group/row cursor-pointer border-b border-gray-100`} onClick={() => toggleOrderSelection(group.info.DONumber)}>
                               <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                                  <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer" checked={isSelected} onChange={() => toggleOrderSelection(group.info.DONumber)} />
                               </td>
                               <td className="p-4 font-mono text-gray-500 text-xs">{new Date(group.info["Delivery Date"]).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                               <td className="p-4 font-black text-blue-600 font-mono text-sm">{group.info.DONumber}</td>
                               <td className="p-4 uppercase truncate max-w-[250px] text-gray-800">{group.info["Customer Name"]}</td>
                               <td className="p-4 text-center"><span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs border border-gray-200">{group.items.length}</span></td>
                               <td className="p-4 text-center"><span className={`px-2.5 py-1.5 rounded-md text-[10px] font-black uppercase border shadow-sm whitespace-nowrap ${getStatusColor(rawStatus)}`}>{formatDisplayStatus(rawStatus)}</span></td>
                               <td className="p-4 text-right pr-6" onClick={(e) => e.stopPropagation()}>
                                   <div className="flex items-center justify-end gap-2 opacity-0 group-hover/row:opacity-100 transition-opacity w-full">
                                       <button onClick={() => openEditModal(group)} className="p-2 text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-100 rounded-lg transition"><PencilSquareIcon className="w-4 h-4" /></button>
                                       <button onClick={() => handlePrintOrder(group.info.DONumber)} className="p-2 text-gray-600 bg-gray-50 hover:bg-gray-200 border border-gray-200 rounded-lg transition"><PrinterIcon className="w-4 h-4" /></button>
                                   </div>
                               </td>
                           </tr>
                       )})}
                       {displayedHistory.length === 0 && <tr><td colSpan="7" className="p-16 text-center text-gray-400 italic font-bold">No orders match your current filter.</td></tr>}
                 </tbody>
             </table>
         </div>
      </div>

      {/* STICKY BOTTOM BULK ACTION BAR (Mimics iOS Photos native multi-select) */}
      <div className={`fixed bottom-[68px] md:bottom-0 left-0 right-0 bg-white md:bg-blue-600 border-t border-gray-200 md:border-none shadow-[0_-10px_30px_rgba(0,0,0,0.15)] z-[60] transition-transform duration-300 ease-out transform ${selectedOrders.length > 0 ? 'translate-y-0' : 'translate-y-full pb-safe'}`}>
          <div className="max-w-7xl mx-auto px-4 py-3 md:py-4 flex justify-between items-center">
              <div className="flex items-center gap-2 md:gap-4">
                  <button onClick={() => setSelectedOrders([])} className="p-2 text-gray-400 md:text-blue-200 hover:text-gray-700 md:hover:text-white rounded-full bg-gray-100 md:bg-blue-700/50 transition-colors">
                      <XMarkIcon className="w-5 h-5 stroke-2" />
                  </button>
                  <span className="text-base md:text-sm font-black text-gray-800 md:text-white tracking-widest">{selectedOrders.length} <span className="hidden md:inline">Orders Selected</span></span>
              </div>
              <div className="flex items-center gap-2 md:gap-3">
                  <button onClick={() => setIsBulkEditOpen(true)} className="flex items-center gap-1.5 px-3 py-2 md:px-4 rounded-xl text-blue-600 md:text-white bg-blue-50 md:bg-blue-500 hover:bg-blue-100 md:hover:bg-blue-400 transition font-bold text-xs uppercase" title="Bulk Edit">
                      <PencilSquareIcon className="w-5 h-5"/><span className="hidden sm:inline">Edit</span>
                  </button>
                  <button onClick={handleBulkPrint} className="flex items-center gap-1.5 px-3 py-2 md:px-4 rounded-xl text-gray-700 md:text-white bg-gray-100 md:bg-blue-500 hover:bg-gray-200 md:hover:bg-blue-400 transition font-bold text-xs uppercase" title="Batch Print">
                      <PrinterIcon className="w-5 h-5"/><span className="hidden sm:inline">Print</span>
                  </button>
                  <button onClick={handleBulkShipday} className="flex items-center gap-1.5 px-3 py-2 md:px-4 rounded-xl text-emerald-600 md:text-white bg-emerald-50 md:bg-blue-500 hover:bg-emerald-100 md:hover:bg-blue-400 transition font-bold text-xs uppercase" title="Push Shipday">
                      <TruckIcon className="w-5 h-5"/><span className="hidden sm:inline">Ship</span>
                  </button>
                  <button onClick={handleBulkDelete} className="flex items-center gap-1.5 px-3 py-2 md:px-4 rounded-xl text-red-600 md:text-white bg-red-50 md:bg-red-500 hover:bg-red-100 md:hover:bg-red-400 transition font-bold text-xs uppercase ml-1 md:ml-4 border border-red-200 md:border-none" title="Batch Delete">
                      <TrashIcon className="w-5 h-5"/><span className="hidden sm:inline">Delete</span>
                  </button>
              </div>
          </div>
      </div>

      {/* BULK EDIT MODAL */}
      {isBulkEditOpen && (
          <div className="fixed inset-0 bg-black/60 z-[110] flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-sm overflow-hidden">
            <div className="bg-white rounded-t-[2rem] md:rounded-[2.5rem] w-full max-w-lg shadow-2xl flex flex-col animate-in slide-in-from-bottom-full md:zoom-in duration-200 border border-gray-100 max-h-[90vh] overflow-hidden pb-safe">
                <div className="flex justify-between items-center p-6 border-b border-gray-100 shrink-0 bg-white">
                    <div>
                        <h2 className="text-xl font-black text-gray-800 uppercase tracking-tight">Bulk Edit</h2>
                        <p className="text-xs text-gray-400 font-bold mt-1">Applying to <span className="text-blue-600">{selectedOrders.length}</span> orders.</p>
                    </div>
                    <button onClick={() => setIsBulkEditOpen(false)} className="text-gray-400 hover:text-red-500 text-2xl font-bold bg-gray-50 hover:bg-red-50 w-10 h-10 rounded-full flex items-center justify-center transition-all pb-1">×</button>
                </div>
                
                <div className="p-6 space-y-5 overflow-y-auto flex-1 min-h-0 custom-scrollbar bg-white">
                    <div className="bg-blue-50/50 p-4 md:p-5 rounded-2xl border border-blue-100">
                        <label className="block text-[10px] font-black text-blue-500 uppercase tracking-widest mb-2">New Delivery Date</label>
                        <input type="date" className="w-full p-3.5 md:p-3 border border-blue-200 bg-white rounded-xl outline-none font-bold text-base md:text-sm focus:ring-2 focus:ring-blue-500 shadow-sm" value={bulkEditData.deliveryDate} onChange={e => setBulkEditData({...bulkEditData, deliveryDate: e.target.value})} />
                    </div>
                    <div className="bg-gray-50 p-4 md:p-5 rounded-2xl border border-gray-200 shadow-sm">
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Delivery Mode Override</label>
                        <select className="w-full p-3.5 md:p-3 border border-gray-200 bg-white rounded-xl outline-none font-bold text-base md:text-sm focus:ring-2 focus:ring-blue-500" value={bulkEditData.deliveryMode} onChange={e => setBulkEditData({...bulkEditData, deliveryMode: e.target.value})}>
                            <option value="">-- No Change --</option>
                            <option value="Driver">Driver</option>
                            <option value="Lalamove">Lalamove</option>
                            <option value="Self Pick-up">Self Pick-up</option>
                        </select>
                    </div>
                    <div className="bg-gray-50 p-4 md:p-5 rounded-2xl border border-gray-200 shadow-sm">
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Force Status Update</label>
                        <select className="w-full p-3.5 md:p-3 border border-gray-200 bg-white rounded-xl outline-none font-bold text-base md:text-sm focus:ring-2 focus:ring-blue-500" value={bulkEditData.status} onChange={e => setBulkEditData({...bulkEditData, status: e.target.value})}>
                            <option value="">-- No Change --</option>
                            <option value="PENDING">PENDING</option>
                            <option value="ASSIGNED">ASSIGNED</option>
                            <option value="IN TRANSIT">IN TRANSIT</option>
                            <option value="DELIVERED">DELIVERED</option>
                            <option value="FAILED">FAILED</option>
                            <option value="CANCELLED">CANCELLED</option>
                        </select>
                    </div>
                </div>
                
                <div className="flex gap-3 p-5 md:p-6 border-t border-gray-100 shrink-0 bg-gray-50">
                    <button onClick={() => setIsBulkEditOpen(false)} className="flex-1 px-6 py-4 bg-white border border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-100 transition-all active:scale-95 text-sm uppercase tracking-widest">Cancel</button>
                    <button onClick={handleBulkEditSave} className="flex-[2] px-8 py-4 bg-blue-600 text-white font-black rounded-xl shadow-xl hover:bg-blue-700 transition-all active:scale-95 text-sm uppercase tracking-widest">Apply Updates</button>
                </div>
            </div>
          </div>
      )}

      {/* EDIT INDIVIDUAL ORDER MODAL (Full Screen on Mobile) */}
      {isEditModalOpen && editingOrder && (
          <div className="fixed inset-0 bg-gray-100 md:bg-black/60 z-[110] flex items-end md:items-center justify-center p-0 md:p-4 md:p-8 backdrop-blur-sm overflow-hidden">
            <div className="bg-white rounded-none md:rounded-[2rem] w-full h-[100dvh] md:h-auto md:max-h-[90vh] md:max-w-5xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-full md:zoom-in duration-300 border border-gray-100 overflow-hidden relative">
                
                {/* Header - Fixed */}
                <div className="flex justify-between items-center px-4 md:px-6 py-4 border-b border-gray-100 shrink-0 bg-white shadow-sm z-20">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setIsEditModalOpen(false)} className="md:hidden p-2 bg-gray-50 rounded-full text-blue-600 active:scale-95"><ChevronLeftIcon className="w-5 h-5 stroke-2"/></button>
                        <h2 className="text-lg md:text-2xl font-black text-gray-800 uppercase flex items-center gap-2">Edit <span className="text-blue-600 font-mono hidden md:inline">{editingOrder.DONumber}</span></h2>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] md:text-xs font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-md border border-blue-100 md:hidden">{editingOrder.DONumber}</span>
                        <button onClick={() => setIsEditModalOpen(false)} className="hidden md:flex text-gray-400 hover:text-red-500 text-3xl font-bold bg-gray-50 hover:bg-red-50 w-10 h-10 rounded-full items-center justify-center transition-all pb-1">×</button>
                    </div>
                </div>

                {/* Customer Info - Scrollable inside parent */}
                <div className="flex-1 overflow-y-auto bg-gray-50/50 md:bg-gray-50 custom-scrollbar pb-28 md:pb-0 relative z-10">
                    
                    {/* Unified Mobile Settings-style Order Header Block */}
                    <div className="m-3 md:m-6 bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col overflow-hidden relative z-30">
                        {/* Row 1: Customer Selection */}
                        <div className="p-1 border-b border-gray-100 bg-gray-50/30 rounded-t-2xl relative">
                            <label className="block text-[9px] font-black text-gray-400 uppercase ml-2 mt-1 mb-0.5">Customer</label>
                            <input 
                                list="edit-modal-customers"
                                className="w-full px-2.5 pb-2.5 pt-0.5 bg-transparent outline-none font-black text-base md:text-sm uppercase text-gray-800 focus:text-blue-600 transition-colors" 
                                value={editingOrder["Customer Name"]} 
                                onChange={handleCustomerSelectChange} 
                                placeholder="Search customer..."
                            />
                            <datalist id="edit-modal-customers">
                                {customers.map(c => {
                                    const cName = c.Branch ? `${c.CompanyName} - ${c.Branch}` : c.CompanyName;
                                    return <option key={c.id} value={cName} />;
                                })}
                            </datalist>
                        </div>
                        {/* Row 2: Mode & Date */}
                        <div className="flex border-b border-gray-100 bg-white">
                            <div className="flex-1 flex flex-col border-r border-gray-100 p-2.5">
                                <label className="text-[9px] font-black text-gray-400 uppercase px-1 mb-0.5">Mode</label>
                                <select className="w-full text-base md:text-sm font-bold text-gray-800 outline-none bg-transparent px-0 focus:text-blue-600 transition-colors" value={editingOrder["Delivery Mode"] || 'Driver'} onChange={e => setEditingOrder({...editingOrder, "Delivery Mode": e.target.value})}>
                                    <option value="Driver">Driver</option><option value="Lalamove">Lalamove</option><option value="Self Pick-up">Pick-up</option>
                                </select>
                            </div>
                            <div className="flex-[1.2] flex flex-col p-2.5">
                                <label className="text-[9px] font-black text-gray-400 uppercase px-1 mb-0.5">Delivery Date</label>
                                <input type="date" className="w-full text-base md:text-sm font-bold text-blue-700 outline-none bg-transparent px-0 focus:text-blue-600 transition-colors" value={editingOrder["Delivery Date"]} onChange={e => setEditingOrder({...editingOrder, "Delivery Date": e.target.value})} />
                            </div>
                        </div>
                        {/* Row 3: Phone & Address */}
                        <div className="flex border-b border-gray-100 bg-white">
                            <div className="w-1/3 flex flex-col border-r border-gray-100 p-2.5">
                                <label className="text-[9px] font-black text-gray-400 uppercase px-1 mb-0.5">Phone</label>
                                <input type="tel" className="w-full text-base md:text-sm font-medium text-gray-800 outline-none bg-transparent px-1 focus:text-blue-600 transition-colors" value={editingOrder["Contact Number"] || ''} onChange={e => setEditingOrder({...editingOrder, "Contact Number": e.target.value})} placeholder="012..." />
                            </div>
                            <div className="w-2/3 flex flex-col p-2.5">
                                <label className="text-[9px] font-black text-gray-400 uppercase px-1 mb-0.5">Address</label>
                                <input type="text" className="w-full text-base md:text-sm font-medium text-gray-800 outline-none bg-transparent px-1 truncate focus:text-blue-600 transition-colors" value={editingOrder["Delivery Address"]} onChange={e => setEditingOrder({...editingOrder, "Delivery Address": e.target.value})} placeholder="Delivery Address..." />
                            </div>
                        </div>
                        {/* Row 4: Status */}
                        <div className="p-2.5 bg-white rounded-b-2xl">
                            <label className="text-[9px] font-black text-gray-400 uppercase px-1 mb-0.5 block">Order Status</label>
                            <select className={`w-full text-base md:text-sm font-black outline-none bg-transparent px-1 transition-colors ${getStatusColor(getRawStatus(editingOrder)).split(' ')[1]}`} value={formatDisplayStatus(getRawStatus(editingOrder))} onChange={e => setEditingOrder({...editingOrder, Status: e.target.value})}>
                                <option value="PENDING">PENDING</option><option value="ASSIGNED">ASSIGNED</option><option value="IN TRANSIT">IN TRANSIT</option><option value="DELIVERED">DELIVERED</option><option value="FAILED">FAILED</option>
                            </select>
                        </div>
                    </div>

                    <div className="px-3 md:px-6 pb-6">
                        {/* Add New Product Section */}
                        <div className="bg-white p-3 md:p-5 rounded-2xl border border-blue-100 shadow-sm relative mb-4 z-20">
                            <label className="block text-[10px] font-black text-blue-500 uppercase tracking-widest mb-2 ml-1">Add New Product</label>
                            <div className="flex gap-2 relative">
                                <span className="absolute left-3 top-3 md:top-3.5 text-gray-400"><MagnifyingGlassIcon className="w-5 h-5"/></span>
                                <input type="text" placeholder="Search catalog..." className="w-full pl-10 p-3 border border-gray-200 bg-gray-50 rounded-xl text-base md:text-xs font-bold outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all shadow-inner" value={productSearchTerm} onChange={e => setProductSearchTerm(e.target.value)} />
                                {productSearchTerm && (
                                    <button onClick={() => setProductSearchTerm('')} className="absolute right-3 top-3 p-1 text-gray-400 hover:text-gray-600 bg-gray-200 rounded-lg">
                                        <XMarkIcon className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                            
                            {/* Ghost Click Shield for Search Results */}
                            {productSearchTerm && (
                                <>
                                    <div className={`fixed inset-0 z-30 transition-opacity duration-200 ${isAddProductClosing ? 'bg-transparent opacity-0' : 'bg-black/20 backdrop-blur-sm opacity-100'}`} onClick={(e) => { e.stopPropagation(); closeAddProductDropdown(); }}></div>
                                    <div className={`absolute left-0 right-0 mt-2 bg-white border border-gray-200 rounded-2xl shadow-2xl max-h-64 overflow-y-auto z-40 custom-scrollbar divide-y divide-gray-50 animate-in slide-in-from-top-2 duration-200 ${isAddProductClosing ? 'hidden' : 'block'}`}>
                                        {products.filter(p => `${p.ProductName} ${p.ProductCode}`.toLowerCase().includes(productSearchTerm.toLowerCase())).map(p => (
                                            <div key={p.ProductCode} onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleAddItem(p); }} className="p-4 hover:bg-blue-50 cursor-pointer flex justify-between items-center group/add text-xs md:text-sm uppercase font-black active:bg-blue-100 transition-colors">
                                                <div className="truncate pr-4">{p.ProductName} <span className="text-[10px] text-gray-400 ml-2 font-mono">{p.ProductCode}</span></div>
                                                <span className="bg-blue-600 text-white p-1.5 rounded-lg flex items-center justify-center font-black shadow-sm"><PlusIcon className="w-4 h-4"/></span>
                                            </div>
                                        ))}
                                        {products.filter(p => `${p.ProductName} ${p.ProductCode}`.toLowerCase().includes(productSearchTerm.toLowerCase())).length === 0 && (
                                            <div className="p-6 text-center text-sm text-gray-400 italic font-medium">No products found</div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* DESKTOP HEADER (Hidden on Mobile) */}
                        <div className="hidden md:flex gap-2 px-3 pb-2 border-b border-gray-200 text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">
                            <div className="flex-1">Order Item</div><div className="w-24 text-center">Qty</div><div className="w-24 text-center">UOM</div><div className="w-28 text-center">Price</div><div className="w-12 text-right"></div>
                        </div>

                        {/* MOBILE ITEM CARDS / DESKTOP ROWS */}
                        <div className="space-y-3 z-10 relative">
                            {editingItems.map((item, idx) => (
                                <div key={idx} className="bg-white border border-gray-200 md:border-b md:border-x-0 md:border-t-0 md:rounded-none rounded-2xl p-3 md:p-2 shadow-sm md:shadow-none flex flex-col md:flex-row md:items-center gap-3">
                                    
                                    {/* Mobile Delete Button (Top Right) */}
                                    <button onClick={() => handleDeleteItem(idx)} className="md:hidden absolute top-3 right-3 p-2 text-gray-400 hover:text-red-500 bg-gray-50 rounded-xl border border-gray-100 active:scale-95"><TrashIcon className="w-5 h-5"/></button>
                                    
                                    {/* Product Select */}
                                    <div className="md:flex-1 pr-10 md:pr-0 w-full">
                                        <span className="md:hidden text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Product</span>
                                        <select className="w-full p-2.5 md:p-2 border border-gray-200 md:border-transparent md:hover:border-gray-200 rounded-xl md:rounded-lg text-base md:text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 md:bg-transparent font-bold uppercase truncate" value={item["Order Items"]} onChange={e => handleEditItemChange(idx, 'Order Items', e.target.value)}>
                                            <option value={item["Order Items"]}>{item["Order Items"]}</option>
                                            {products.filter(p => p.ProductName !== item["Order Items"]).map(p => <option key={p.ProductCode} value={p.ProductName}>{p.ProductName}</option>)}
                                        </select>
                                    </div>
                                    
                                    {/* Mobile Controls Row (Decoupled Qty Stepper, UOM, Price) */}
                                    <div className="flex w-full md:w-auto gap-2 items-end md:items-center">
                                        
                                        {/* QTY Stepper */}
                                        <div className="flex-1 md:w-24 flex flex-col">
                                            <span className="md:hidden text-[9px] font-black text-gray-400 mb-1 ml-1 tracking-widest">QTY</span>
                                            <div className="flex items-center gap-1">
                                                <button onClick={() => handleEditItemChange(idx, 'Quantity', Math.max(0.1, (Number(item.Quantity) || 0) - 1).toFixed(1).replace(/\.0$/, ''))} className="w-[34px] md:w-8 h-[42px] md:h-9 bg-gray-100 active:bg-gray-200 text-gray-600 font-bold rounded-lg flex items-center justify-center transition-colors">
                                                    <span className="text-xl leading-none mb-1">-</span>
                                                </button>
                                                <input type="number" step="0.1" inputMode="decimal" className="w-full h-[42px] md:h-9 text-center font-black text-base md:text-xs border border-gray-200 rounded-lg shadow-inner outline-none focus:ring-2 focus:ring-blue-500 bg-white" value={item.Quantity} onChange={e => handleEditItemChange(idx, 'Quantity', e.target.value)} />
                                                <button onClick={() => handleEditItemChange(idx, 'Quantity', ((Number(item.Quantity) || 0) + 1).toFixed(1).replace(/\.0$/, ''))} className="w-[34px] md:w-8 h-[42px] md:h-9 bg-gray-100 active:bg-gray-200 text-gray-600 font-bold rounded-lg flex items-center justify-center transition-colors">
                                                    <span className="text-xl leading-none mb-1">+</span>
                                                </button>
                                            </div>
                                        </div>
                                        
                                        {/* UOM */}
                                        <div className="flex-[1.2] md:w-24 flex flex-col">
                                            <span className="md:hidden text-[9px] font-black text-gray-400 mb-1 ml-1 tracking-widest">UOM</span>
                                            <select className="w-full h-[42px] md:h-9 bg-white border border-gray-200 rounded-lg text-base md:text-xs font-bold uppercase focus:ring-2 focus:ring-blue-500 shadow-sm" value={item.UOM} onChange={e => handleEditItemChange(idx, 'UOM', e.target.value)}>
                                                {(() => {
                                                    const matchedProd = products.find(p => p.ProductCode === item["Product Code"]);
                                                    const uoms = matchedProd && matchedProd.AllowedUOMs ? matchedProd.AllowedUOMs.split(',').map(u => u.trim().toUpperCase()).filter(Boolean) : [item.UOM, 'KG', 'CTN', 'PCS'];
                                                    return Array.from(new Set([item.UOM, ...uoms])).filter(Boolean).map(u => <option key={u} value={u}>{u}</option>);
                                                })()}
                                            </select>
                                        </div>

                                        {/* PRICE */}
                                        <div className="flex-[1.5] md:w-28 flex flex-col relative">
                                            <span className="md:hidden text-[9px] font-black text-gray-400 mb-1 ml-1 tracking-widest">PRICE (RM)</span>
                                            <span className="absolute left-3 bottom-[11px] md:bottom-[9px] text-gray-400 text-xs font-bold pointer-events-none">RM</span>
                                            <input type="number" step="0.01" inputMode="decimal" className="w-full h-[42px] md:h-9 pl-8 bg-white border border-gray-200 rounded-lg text-base md:text-sm font-black text-right pr-3 focus:ring-2 focus:ring-blue-500 shadow-sm" value={item.Price} onChange={e => handleEditItemChange(idx, 'Price', e.target.value)} />
                                        </div>

                                        {/* Desktop Trash */}
                                        <div className="hidden md:flex w-12 justify-end">
                                            <button onClick={() => handleDeleteItem(idx)} className="p-2 bg-white text-gray-300 hover:text-red-500 hover:bg-red-50 border border-gray-200 rounded-lg transition shadow-sm"><TrashIcon className="w-5 h-5" /></button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {editingItems.length === 0 && <div className="p-10 text-center text-gray-400 font-bold italic border-2 border-dashed border-gray-200 rounded-2xl bg-white">No items in this order. Use the search box above to add some.</div>}
                        </div>
                    </div>
                </div>

                {/* Footer - Fixed Sticky Bottom on Mobile */}
                <div className="absolute md:static bottom-0 left-0 right-0 p-4 md:p-6 border-t border-gray-100 bg-white/95 backdrop-blur-md md:bg-gray-50 shrink-0 flex justify-between md:justify-end gap-3 z-30 shadow-[0_-10px_20px_rgba(0,0,0,0.05)] md:shadow-none pb-safe">
                    <button onClick={() => setIsEditModalOpen(false)} className="flex-1 md:flex-none px-6 md:px-8 py-3.5 md:py-3.5 bg-gray-50 md:bg-white border border-gray-200 text-gray-600 font-bold rounded-xl md:rounded-xl hover:bg-gray-100 transition-all active:scale-95 text-sm md:text-xs uppercase tracking-widest">Cancel</button>
                    <button onClick={saveEditedOrder} className="flex-[2] md:flex-none px-6 md:px-10 py-3.5 md:py-3.5 bg-blue-600 text-white font-black rounded-xl shadow-xl md:shadow-md active:scale-95 uppercase text-sm md:text-xs tracking-widest flex items-center justify-center gap-2 hover:bg-blue-700">
                        <CheckIcon className="w-5 h-5" strokeWidth={3} /> Save Order
                    </button>
                </div>

            </div>
          </div>
      )}
    </div>
  );
}