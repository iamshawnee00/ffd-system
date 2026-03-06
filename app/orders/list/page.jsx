'use client';
import React, { useState, useEffect, useMemo } from 'react';

// ==================================================================
// ⚠️ 重要提示：当您将此代码复制回本地项目时，请取消注释以下三行真实的导入，
// 并删除下方的 MOCK API 部分！
// ==================================================================
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
  ClipboardDocumentListIcon
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
  // 1. Data States (Moved to top to prevent Hook order errors)
  const [orderHistory, setOrderHistory] = useState([]);
  const [products, setProducts] = useState([]);
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

  const [selectedOrders, setSelectedOrders] = useState([]);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [bulkEditData, setBulkEditData] = useState({ deliveryDate: '', deliveryMode: '', status: '' });
  const [sortConfig, setSortConfig] = useState({ key: 'Delivery Date', direction: 'desc' });

  // 3. Router Hooks
  const router = useRouter();
  const pathname = usePathname();

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
    setProductSearchTerm('');
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
                ...editingOrder,
                "Status": cleanStatus,
                "Replacement": repVal, 
                "Product Code": item["Product Code"],
                "Order Items": item["Order Items"],
                "Quantity": item.Quantity,
                "UOM": item.UOM,
                "Price": item.Price,
            };
            
            const cleanPayload = {...payload};
            delete cleanPayload.id;

            if (isNew) {
                newItems.push({ ...cleanPayload, "Timestamp": new Date() });
            } else {
                existingItems.push({ ...cleanPayload, id: item.id });
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

  // Fuzzy search for list
  const filteredOrderHistory = useMemo(() => orderHistory.filter(group => {
      const rawStatus = getRawStatus(group.info);
      const displayStatus = formatDisplayStatus(rawStatus);
      
      if (statusFilter !== 'ALL' && displayStatus !== statusFilter) return false;
      if (!historySearchTerm) return true;
      const terms = historySearchTerm.toLowerCase().split(' ').filter(Boolean);
      const searchStr = `${group.info.DONumber} ${group.info["Customer Name"]} ${group.info["Delivery Date"]} ${displayStatus}`.toLowerCase();
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

  // Fuzzy search for Modal Product Catalog
  const filteredModalProducts = products.filter(p => {
      if (!productSearchTerm) return false;
      const searchTerms = productSearchTerm.toLowerCase().split(' ').filter(Boolean);
      const combinedText = `${p.ProductName} ${p.ProductCode}`.toLowerCase();
      return searchTerms.every(term => combinedText.includes(term));
  });

  if (loading) return <div className="p-10 flex items-center justify-center h-screen font-black text-gray-300 animate-pulse uppercase tracking-widest">Loading Orders...</div>;

  return (
    <div className="p-3 md:p-8 max-w-full min-h-screen bg-gray-50/50 pb-40 md:pb-32 font-sans relative overflow-x-clip">
      
      <style jsx global>{`
        input, select, textarea { font-size: 16px !important; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 10px; }
      `}</style>

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

      {/* SUB-NAVIGATION BAR (Added Tabs here) */}
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

      <div className="animate-in fade-in bg-white p-4 md:p-6 rounded-3xl shadow-xl border border-gray-100 flex flex-col relative overflow-hidden h-[calc(100vh-140px)]">
         <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 flex-none">
             <div className="flex flex-wrap items-center gap-2">
                 <input type="text" placeholder="Search orders..." className="bg-gray-50 text-sm px-4 py-2 rounded-full outline-none focus:ring-1 focus:ring-gray-300 w-full sm:w-64" value={historySearchTerm} onChange={(e) => setHistorySearchTerm(e.target.value)} />
                 <select 
                     className="bg-gray-50 text-sm px-4 py-2 rounded-full outline-none focus:ring-1 focus:ring-gray-300 text-gray-700 font-medium cursor-pointer"
                     value={statusFilter}
                     onChange={(e) => setStatusFilter(e.target.value)}
                 >
                     <option value="ALL">All Status</option>
                     <option value="PENDING">Pending</option>
                     <option value="ASSIGNED">Assigned</option>
                     <option value="IN TRANSIT">In Transit</option>
                     <option value="DELIVERED">Delivered</option>
                     <option value="FAILED">Failed</option>
                 </select>
             </div>
             <button onClick={handlePullShipdayStatus} disabled={isSyncing} className="text-sm font-medium text-gray-500 hover:text-black flex items-center gap-1 transition-colors">
                 <ArrowPathIcon className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} /> Sync Shipday
             </button>
         </div>

         {/* Desktop Table View */}
         <div className="hidden md:block flex-1 overflow-auto custom-scrollbar">
             <table className="w-full text-left whitespace-nowrap text-sm">
                 <thead className="text-gray-400 border-b border-gray-200 sticky top-0 bg-white z-10 shadow-sm">
                     <tr>
                        <th className="py-3 font-medium text-center w-10"><input type="checkbox" className="rounded text-black focus:ring-black border-gray-300" checked={displayedHistory.length > 0 && selectedOrders.length === displayedHistory.length} onChange={toggleSelectAll} /></th>
                        <th className="py-3 font-medium cursor-pointer hover:text-black transition-colors select-none" onClick={() => requestSort('Delivery Date')}>Date {sortConfig.key === 'Delivery Date' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                        <th className="py-3 font-medium">DO Number</th>
                        <th className="py-3 font-medium">Customer</th>
                        <th className="py-3 font-medium text-center">Items</th>
                        <th className="py-3 font-medium text-center">Status</th>
                        <th className="py-3 font-medium text-right pr-6">Actions</th>
                     </tr>
                 </thead>
                 <tbody className="text-gray-700 font-bold">
                     {displayedHistory.map((group) => {
                           const rawStatus = getRawStatus(group.info);
                           const isSelected = selectedOrders.includes(group.info.DONumber);
                           return (
                           <tr key={group.info.DONumber} className={`${isSelected ? 'bg-blue-50/60' : 'hover:bg-blue-50/30'} transition-colors group/row cursor-pointer`} onClick={() => toggleOrderSelection(group.info.DONumber)}>
                               <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                                  <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer" checked={isSelected} onChange={() => toggleOrderSelection(group.info.DONumber)} />
                               </td>
                               <td className="p-4 font-mono text-gray-500 text-xs">{new Date(group.info["Delivery Date"]).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                               <td className="p-4 font-black text-blue-600 font-mono text-sm">{group.info.DONumber}</td>
                               <td className="p-4 uppercase truncate max-w-[250px]">{group.info["Customer Name"]}</td>
                               <td className="p-4 text-center"><span className="bg-gray-100 px-3 py-1 rounded-full text-xs">{group.items.length}</span></td>
                               <td className="p-4 text-center"><span className={`px-2.5 py-1.5 rounded-full text-[10px] font-black uppercase border shadow-sm whitespace-nowrap ${getStatusColor(rawStatus)}`}>{formatDisplayStatus(rawStatus)}</span></td>
                               <td className="p-4 text-right pr-6" onClick={(e) => e.stopPropagation()}>
                                   <div className="flex items-center justify-end gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity w-full">
                                       <button onClick={() => openEditModal(group)} className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition"><PencilSquareIcon className="w-5 h-5" /></button>
                                       <button onClick={() => handlePrintOrder(group.info.DONumber)} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"><PrinterIcon className="w-5 h-5" /></button>
                                   </div>
                               </td>
                           </tr>
                       )})}
                   </tbody>
             </table>
         </div>
      </div>

      {/* EDIT INDIVIDUAL ORDER MODAL */}
      {isEditModalOpen && editingOrder && (
          <div className="fixed inset-0 bg-black/60 z-[110] flex items-end sm:items-center justify-center sm:p-4 backdrop-blur-sm">
            <div className="bg-white rounded-t-3xl sm:rounded-[2.5rem] w-full max-w-5xl p-5 sm:p-8 shadow-2xl flex flex-col max-h-[90dvh] sm:max-h-[95vh] animate-in slide-in-from-bottom-10 sm:zoom-in duration-200 border-t sm:border border-gray-100">
                <div className="flex justify-between items-center mb-4 sm:mb-6 border-b pb-4 sm:pb-6 shrink-0">
                    <h2 className="text-lg sm:text-2xl font-black text-gray-800 uppercase leading-none">Edit Order <span className="text-blue-600 font-mono tracking-tighter">{editingOrder.DONumber}</span></h2>
                    <button onClick={() => setIsEditModalOpen(false)} className="text-gray-400 hover:text-red-500 text-3xl font-bold bg-gray-50 hover:bg-red-50 w-10 h-10 rounded-full flex items-center justify-center transition-all pb-1">×</button>
                </div>
                
                <div className="overflow-y-auto flex-1 custom-scrollbar px-1 pb-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6 bg-gray-50/50 p-4 sm:p-6 rounded-2xl border border-gray-100 shadow-inner">
                        <div className="sm:col-span-2"><label className="block text-[9px] font-bold text-gray-500 uppercase mb-1 ml-1">Customer</label><input className="w-full p-3 border border-gray-200 bg-white rounded-xl outline-none font-black text-xs uppercase" value={editingOrder["Customer Name"]} onChange={e => setEditingOrder({...editingOrder, "Customer Name": e.target.value})} /></div>
                        <div className="sm:col-span-2"><label className="block text-[9px] font-bold text-gray-500 uppercase mb-1 ml-1">Address</label><input className="w-full p-3 border border-gray-200 bg-white rounded-xl outline-none font-medium text-xs uppercase" value={editingOrder["Delivery Address"]} onChange={e => setEditingOrder({...editingOrder, "Delivery Address": e.target.value})} /></div>
                        <div><label className="block text-[9px] font-bold text-gray-500 uppercase mb-1 ml-1">Date</label><input type="date" className="w-full p-3 border border-gray-200 rounded-xl outline-none font-black text-xs bg-blue-50 text-blue-800" value={editingOrder["Delivery Date"]} onChange={e => setEditingOrder({...editingOrder, "Delivery Date": e.target.value})} /></div>
                    </div>

                    <div className="mb-6">
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-1">Order Items</label>
                        <div className="overflow-x-auto border border-gray-200 rounded-2xl bg-white shadow-inner">
                            <table className="w-full text-left text-xs whitespace-nowrap min-w-[700px]">
                                <thead className="bg-gray-50 font-black text-gray-400 uppercase border-b border-gray-100 text-[10px]">
                                    <tr><th className="p-3 pl-4">Product Catalog Item</th><th className="p-3 w-20 text-center">Qty</th><th className="p-3 w-24 text-center">UOM</th><th className="p-3 w-28 text-right">Price</th><th className="p-3 w-12 pr-4"></th></tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {editingItems.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="p-2 pl-4"><select className="w-full p-2 border border-gray-200 rounded-lg text-xs font-black uppercase outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" value={item["Order Items"]} onChange={e => handleEditItemChange(idx, 'Order Items', e.target.value)}><option value={item["Order Items"]}>{item["Order Items"]}</option>{products.filter(p => p.ProductName !== item["Order Items"]).map(p => <option key={p.ProductCode} value={p.ProductName}>{p.ProductName}</option>)}</select></td>
                                            <td className="p-2 text-center"><input type="number" className="w-full p-2 border border-gray-200 rounded-lg text-center font-black outline-none shadow-sm" value={item.Quantity} onChange={e => handleEditItemChange(idx, 'Quantity', e.target.value)} /></td>
                                            <td className="p-2 text-center uppercase text-gray-500 font-bold">{item.UOM}</td>
                                            <td className="p-2 text-right"><input type="number" step="0.01" className="w-full p-2 border border-gray-200 rounded-lg text-right font-black outline-none shadow-sm" value={item.Price} onChange={e => handleEditItemChange(idx, 'Price', e.target.value)} /></td>
                                            <td className="p-2 text-center pr-4"><button onClick={() => handleDeleteItem(idx)} className="p-2 bg-red-50 text-red-500 hover:bg-red-100 rounded-lg transition shadow-sm"><TrashIcon className="w-4 h-4" /></button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="bg-white p-4 sm:p-5 rounded-2xl border border-blue-100 shadow-sm relative">
                        <label className="block text-[10px] font-black text-blue-500 uppercase tracking-widest mb-2 ml-1">Add New Product</label>
                        <div className="flex gap-2 relative">
                            <span className="absolute left-3 top-3.5 text-gray-400"><MagnifyingGlassIcon className="w-4 h-4 sm:w-5 sm:h-5"/></span>
                            <input type="text" placeholder="Search catalog..." className="w-full pl-9 p-3 border border-gray-200 bg-gray-50 rounded-xl text-xs font-bold outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all" value={productSearchTerm} onChange={e => setProductSearchTerm(e.target.value)} />
                        </div>
                        {productSearchTerm && (
                            <div className="absolute left-4 right-4 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto z-20 custom-scrollbar divide-y divide-gray-50">
                                {filteredModalProducts.map(p => (
                                    <div key={p.ProductCode} onClick={() => handleAddItem(p)} className="p-3 hover:bg-blue-50 cursor-pointer flex justify-between items-center group/add text-[10px] sm:text-xs uppercase font-black">
                                        <div>{p.ProductName} <span className="text-[9px] text-gray-400 ml-2 font-mono">{p.ProductCode}</span></div>
                                        <span className="bg-blue-600 text-white p-1 rounded flex items-center justify-center font-black shadow-sm"><PlusIcon className="w-3 h-3"/></span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex justify-end gap-2 sm:gap-3 mt-4 shrink-0 pt-4 sm:pt-6 border-t border-gray-100 pb-2 sm:pb-0">
                    <button onClick={() => setIsEditModalOpen(false)} className="flex-1 sm:flex-none px-4 sm:px-8 py-3.5 bg-gray-100 text-gray-600 font-black rounded-xl hover:bg-gray-200 transition-all active:scale-95 uppercase text-[10px] sm:text-xs tracking-widest border border-gray-200">Cancel</button>
                    <button onClick={saveEditedOrder} className="flex-[2] sm:flex-none px-6 sm:px-10 py-3.5 bg-blue-600 text-white font-black rounded-xl shadow-lg hover:bg-blue-700 transition-all active:scale-95 uppercase text-[10px] sm:text-xs tracking-widest flex justify-center items-center gap-2">
                        <CheckIcon className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={3} /> Save Changes
                    </button>
                </div>
            </div>
          </div>
      )}
    </div>
  );
}