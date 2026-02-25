'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { 
  ClipboardDocumentListIcon, 
  PencilSquareIcon, 
  TrashIcon
} from '@heroicons/react/24/outline';

export default function OrderListPage() {
  const router = useRouter();
  
  // Data States
  const [orderHistory, setOrderHistory] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter
  const [historySearchTerm, setHistorySearchTerm] = useState('');

  // Edit Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [editingItems, setEditingItems] = useState([]);
  const [deletedItemIds, setDeletedItemIds] = useState([]);
  const [productSearchTerm, setProductSearchTerm] = useState('');

  // 1. Fetch Orders & Products
  const fetchOrders = async () => {
    const { data, error } = await supabase
        .from('Orders')
        .select('*') // Select all, or explicitly select Status if needed: select('*, Status')
        .order('Timestamp', { ascending: false })
        .limit(3000); 
    
    if (error) {
        console.error("Error fetching orders:", error);
        return;
    }

    if (data) {
        const grouped = {};
        data.forEach(row => {
            if (!grouped[row.DONumber]) {
                // Store the ENTIRE row as info, ensuring Status is captured
                grouped[row.DONumber] = { info: { ...row }, items: [] };
            }
            grouped[row.DONumber].items.push(row);
        });
        const sortedHistory = Object.values(grouped).sort((a, b) => new Date(b.info.Timestamp) - new Date(a.info.Timestamp));
        setOrderHistory(sortedHistory);
    }
  };

  useEffect(() => {
    async function loadData() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      await fetchOrders();
      
      const { data: prodData } = await supabase
        .from('ProductMaster')
        .select('ProductCode, ProductName, BaseUOM, AllowedUOMs')
        .order('ProductName');
      setProducts(prodData || []);
      
      setLoading(false);
    }
    
    loadData();

    // 🔴 REAL-TIME LISTENER: Auto-refresh Order List when Shipday Webhook updates the database
    const channel = supabase
      .channel('realtime_orders_status')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'Orders' }, () => {
          fetchOrders(); // Silently pull the new data in the background
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  // ==========================================
  // ORDER DELETION & MODAL TOGGLES
  // ==========================================
  const handleDeleteDO = async (doNumber) => {
      if (!confirm(`Are you sure you want to delete order ${doNumber}? This will remove all items inside it.`)) return;
      
      const { error } = await supabase.from('Orders').delete().eq('DONumber', doNumber);
      if (error) {
          alert("Error deleting order: " + error.message);
      } else {
          fetchOrders();
      }
  };

  const openEditModal = (group) => {
      setEditingOrder({ ...group.info });
      setEditingItems([...group.items]);
      setDeletedItemIds([]);
      setProductSearchTerm('');
      setIsEditModalOpen(true);
  };

  // ==========================================
  // EDIT MODAL ITEM LOGIC
  // ==========================================
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
    
    if (deletedItemIds.length > 0) {
      await supabase.from('Orders').delete().in('id', deletedItemIds);
    }
    
    const newItems = [];
    const existingItems = [];

    // Ensure status is cleanly saved regardless of DB column origins
    const cleanStatus = formatDisplayStatus(getRawStatus(editingOrder));

    editingItems.forEach(item => {
        const isNew = !item.id || (typeof item.id === 'string' && item.id.startsWith('new-'));
        
        const payload = {
            "Customer Name": editingOrder["Customer Name"],
            "Delivery Address": editingOrder["Delivery Address"],
            "Contact Person": editingOrder["Contact Person"],
            "Contact Number": editingOrder["Contact Number"],
            "Delivery Date": editingOrder["Delivery Date"],
            "Delivery Mode": editingOrder["Delivery Mode"],
            "Replacement": item.Replacement || "", 
            "Product Code": item["Product Code"],
            "Order Items": item["Order Items"],
            "Quantity": item.Quantity,
            "UOM": item.UOM,
            "Price": item.Price,
            "DONumber": editingOrder.DONumber,
            "Status": cleanStatus
        };

        if (isNew) {
            newItems.push({ ...payload, "Timestamp": new Date() });
        } else {
            existingItems.push({ ...payload, id: item.id });
        }
    });

    let error = null;

    if (newItems.length > 0) {
        const { error: insertError } = await supabase.from('Orders').insert(newItems);
        if (insertError) error = insertError;
    }

    if (!error && existingItems.length > 0) {
        const { error: updateError } = await supabase.from('Orders').upsert(existingItems);
        if (updateError) error = updateError;
    }

    if (error) {
      alert("Error saving: " + error.message);
    } else {
      alert("Order updated successfully.");
      setIsEditModalOpen(false); 
      fetchOrders(); 
    }
  };

  // ==========================================
  // STATUS MAPPER & ROBUST UI HELPERS
  // ==========================================
  
  // 1. Safely extract status checking multiple possible casing/column names from different API syncs
  const getRawStatus = (info) => {
      if (!info) return 'PENDING';
      return info.Status || info.status || info.delivery_status || 'PENDING';
  };

  // 2. Map raw DB or Shipday statuses into clean UI labels
  const formatDisplayStatus = (rawStatus) => {
      if (!rawStatus) return 'PENDING';
      const s = String(rawStatus).toUpperCase().trim();
      
      if (s === 'NOT_ASSIGNED' || s === 'PENDING') return 'PENDING';
      if (s === 'NOT_ACCEPTED' || s === 'NOT_STARTED_YET' || s === 'ASSIGNED') return 'ASSIGNED';
      if (s === 'STARTED' || s === 'PICKED_UP' || s === 'READY_TO_DELIVER' || s === 'IN TRANSIT') return 'IN TRANSIT';
      if (s === 'ALREADY_DELIVERED' || s === 'DELIVERED') return 'DELIVERED';
      if (s === 'FAILED_DELIVERY' || s === 'INCOMPLETE' || s === 'CANCELLED' || s === 'FAILED') return 'FAILED';
      
      return s; // Fallback to whatever raw string it is if unrecognized
  };

  // 3. Apply color styling based on the clean UI label
  const getStatusColor = (rawStatus) => {
      const s = formatDisplayStatus(rawStatus);
      if(s === 'PENDING') return 'bg-orange-100 text-orange-700 border-orange-200';
      if(s === 'ASSIGNED') return 'bg-blue-100 text-blue-700 border-blue-200';
      if(s === 'IN TRANSIT') return 'bg-purple-100 text-purple-700 border-purple-200';
      if(s === 'DELIVERED') return 'bg-green-100 text-green-700 border-green-200';
      if(s === 'FAILED' || s === 'CANCELLED') return 'bg-red-100 text-red-700 border-red-200';
      return 'bg-gray-100 text-gray-700 border-gray-200';
  };

  const filteredOrderHistory = orderHistory.filter(group => {
      if (!historySearchTerm) return true;
      const terms = historySearchTerm.toLowerCase().split(' ').filter(t => t);
      const cleanStatus = formatDisplayStatus(getRawStatus(group.info));
      const searchStr = `${group.info.DONumber} ${group.info["Customer Name"]} ${group.info["Delivery Date"]} ${cleanStatus}`.toLowerCase();
      return terms.every(t => searchStr.includes(t));
  });

  const displayedHistory = historySearchTerm ? filteredOrderHistory : filteredOrderHistory.slice(0, 100);

  const filteredModalProducts = products.filter(p => {
      if (!productSearchTerm) return false;
      const lowerTerm = productSearchTerm.toLowerCase();
      const searchParts = lowerTerm.split(' ');
      const combinedText = (p.ProductName + ' ' + p.ProductCode).toLowerCase();
      return searchParts.every(part => combinedText.includes(part));
  });


  if (loading) return <div className="p-10 flex items-center justify-center h-screen text-gray-500 font-bold">Loading Order List...</div>;

  return (
    <div className="p-3 md:p-8 max-w-full overflow-x-hidden min-h-screen bg-gray-50">
      
      {/* Page Header */}
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"> 
         <div>
             <h1 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight">Order List</h1> 
             <p className="text-[10px] md:text-xs text-gray-400 font-bold uppercase mt-1">Manage and track your full order history</p> 
         </div>
      </div>

      <div className="bg-white p-4 md:p-6 rounded-3xl shadow-xl border border-gray-100 animate-in fade-in flex flex-col h-[calc(100vh-140px)]">
         
         {/* History Header & Search */}
         <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4 flex-none">
             <h2 className="text-lg font-black text-gray-800 tracking-tight flex items-center gap-2">
                 <ClipboardDocumentListIcon className="w-6 h-6 text-blue-600" />
                 All Orders
             </h2>
             <div className="relative w-full sm:w-80">
                 <input 
                     type="text" 
                     placeholder="Search DO, Customer, Date, Status..." 
                     className="w-full pl-10 p-3 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50/50 transition-all"
                     value={historySearchTerm}
                     onChange={(e) => setHistorySearchTerm(e.target.value)}
                 />
                 <span className="absolute left-3.5 top-3.5 text-gray-400">🔍</span>
             </div>
         </div>

         <div className="flex-1 overflow-auto custom-scrollbar border border-gray-100 rounded-2xl">
             <table className="w-full text-left whitespace-nowrap min-w-[800px]">
                 <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-wider sticky top-0 z-10 shadow-sm">
                     <tr>
                         <th className="p-4 pl-5">Delivery Date</th>
                         <th className="p-4">DO Number</th>
                         <th className="p-4">Customer Name</th>
                         <th className="p-4 text-center">Items</th>
                         <th className="p-4 text-center">Live Status</th>
                         <th className="p-4 text-center pr-5">Actions</th>
                     </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-50 text-xs font-medium text-gray-700">
                     {displayedHistory.map((group) => {
                         const rawStatus = getRawStatus(group.info);
                         const displayStatus = formatDisplayStatus(rawStatus);

                         return (
                         <tr key={group.info.DONumber} className="hover:bg-blue-50/30 transition-colors group/row">
                             <td className="p-4 pl-5 font-mono text-gray-500 text-[11px]">
                                 {new Date(group.info["Delivery Date"]).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                             </td>
                             <td className="p-4 font-bold text-blue-600 font-mono text-xs">{group.info.DONumber}</td>
                             <td className="p-4 font-black text-gray-800 uppercase">{group.info["Customer Name"]}</td>
                             <td className="p-4 text-center">
                                 <span className="bg-gray-100 px-3 py-1 rounded-full font-bold">{group.items.length}</span>
                             </td>
                             <td className="p-4 text-center">
                                 <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase border ${getStatusColor(rawStatus)}`}>
                                     {displayStatus}
                                 </span>
                             </td>
                             <td className="p-4 text-center pr-5">
                                 <div className="flex items-center justify-center gap-2 opacity-0 group-hover/row:opacity-100 transition-opacity">
                                     <button onClick={() => openEditModal(group)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition" title="Edit Order"><PencilSquareIcon className="w-5 h-5" /></button>
                                     <button onClick={() => handleDeleteDO(group.info.DONumber)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Delete Entire Order"><TrashIcon className="w-5 h-5" /></button>
                                 </div>
                             </td>
                         </tr>
                     )})}
                     {displayedHistory.length === 0 && (
                         <tr>
                             <td colSpan="6" className="p-12 text-center text-gray-400 italic font-bold">No order records found matching your search.</td>
                         </tr>
                     )}
                 </tbody>
             </table>
         </div>
      </div>

      {/* ==========================================
          EDIT ORDER MODAL
          ========================================== */}
      {isEditModalOpen && editingOrder && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-3xl w-full max-w-5xl p-6 shadow-2xl flex flex-col max-h-[95vh] animate-in zoom-in duration-200">
                
                {/* Modal Header */}
                <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-4 shrink-0">
                    <div>
                        <h2 className="text-xl font-black text-gray-800 uppercase flex items-center gap-2">
                            Edit Order 
                            <span className="text-blue-600 font-mono text-lg">{editingOrder.DONumber}</span>
                        </h2>
                        <div className="flex items-center gap-2 mt-2">
                            <span className="text-[10px] font-bold text-gray-400 uppercase">Status:</span>
                            <select 
                                className={`border rounded-lg px-2 py-1 text-xs font-black outline-none ${getStatusColor(getRawStatus(editingOrder))}`}
                                value={formatDisplayStatus(getRawStatus(editingOrder))}
                                onChange={e => setEditingOrder({...editingOrder, Status: e.target.value})}
                            >
                                <option value="PENDING">PENDING</option>
                                <option value="ASSIGNED">ASSIGNED</option>
                                <option value="IN TRANSIT">IN TRANSIT</option>
                                <option value="DELIVERED">DELIVERED</option>
                                <option value="FAILED">FAILED</option>
                                <option value="CANCELLED">CANCELLED</option>
                            </select>
                        </div>
                    </div>
                    <button onClick={() => setIsEditModalOpen(false)} className="text-gray-400 hover:text-red-500 text-3xl font-bold bg-gray-50 hover:bg-red-50 w-10 h-10 rounded-full flex items-center justify-center transition-colors pb-1">×</button>
                </div>

                {/* Customer Details Editing */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6 shrink-0 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                    <div className="md:col-span-2">
                        <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Customer Name</label>
                        <input 
                            type="text" 
                            className="w-full p-2 border border-gray-200 rounded-xl text-xs font-bold uppercase focus:ring-2 focus:ring-blue-500 outline-none"
                            value={editingOrder["Customer Name"]}
                            onChange={e => setEditingOrder({...editingOrder, "Customer Name": e.target.value})}
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Delivery Address</label>
                        <input 
                            type="text" 
                            className="w-full p-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none uppercase"
                            value={editingOrder["Delivery Address"]}
                            onChange={e => setEditingOrder({...editingOrder, "Delivery Address": e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Contact Person</label>
                        <input 
                            type="text" 
                            className="w-full p-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none uppercase"
                            value={editingOrder["Contact Person"] || ''}
                            onChange={e => setEditingOrder({...editingOrder, "Contact Person": e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Contact Number</label>
                        <input 
                            type="text" 
                            className="w-full p-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                            value={editingOrder["Contact Number"] || ''}
                            onChange={e => setEditingOrder({...editingOrder, "Contact Number": e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Delivery Date</label>
                        <input 
                            type="date" 
                            className="w-full p-2 border border-gray-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                            value={editingOrder["Delivery Date"]}
                            onChange={e => setEditingOrder({...editingOrder, "Delivery Date": e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Mode</label>
                        <select 
                            className="w-full p-2 border border-gray-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                            value={editingOrder["Delivery Mode"] || 'Driver'}
                            onChange={e => setEditingOrder({...editingOrder, "Delivery Mode": e.target.value})}
                        >
                            <option value="Driver">Driver</option>
                            <option value="Lalamove">Lalamove</option>
                            <option value="Self Pick-up">Self Pick-up</option>
                        </select>
                    </div>
                </div>

                {/* Items Table */}
                <div className="flex-1 overflow-auto border border-gray-200 rounded-2xl mb-4 custom-scrollbar">
                    <table className="w-full text-left text-xs whitespace-nowrap">
                        <thead className="bg-gray-100 font-black text-gray-500 sticky top-0 z-10 text-[10px] uppercase tracking-wider">
                            <tr>
                                <th className="p-3 pl-4">Product Name</th>
                                <th className="p-3 w-20 text-center">Qty</th>
                                <th className="p-3 w-24 text-center">UOM</th>
                                <th className="p-3 w-28 text-right">Price (RM)</th>
                                <th className="p-3 w-24 text-center">Replace?</th>
                                <th className="p-3 w-12 text-center pr-4"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {editingItems.map((item, idx) => (
                                <tr key={idx} className={item.Replacement === 'YES' ? 'bg-red-50/30' : ''}>
                                    <td className="p-2 pl-4">
                                        <select 
                                            className="w-full p-2 border border-gray-200 rounded-lg text-xs font-bold uppercase outline-none focus:ring-2 focus:ring-blue-500"
                                            value={item["Order Items"]}
                                            onChange={e => handleEditItemChange(idx, 'Order Items', e.target.value)}
                                        >
                                            <option value={item["Order Items"]}>{item["Order Items"]}</option>
                                            {products.filter(p => p.ProductName !== item["Order Items"]).map(p => (
                                                <option key={p.ProductCode} value={p.ProductName}>{p.ProductName}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="p-2 text-center">
                                        <input 
                                            type="number" 
                                            className="w-full p-2 border border-gray-200 rounded-lg text-center font-black outline-none focus:ring-2 focus:ring-blue-500" 
                                            value={item.Quantity} 
                                            onChange={e => handleEditItemChange(idx, 'Quantity', e.target.value)} 
                                        />
                                    </td>
                                    <td className="p-2 text-center">
                                        <select 
                                            className="w-full p-2 border border-gray-200 rounded-lg text-center font-bold uppercase outline-none focus:ring-2 focus:ring-blue-500" 
                                            value={item.UOM} 
                                            onChange={e => handleEditItemChange(idx, 'UOM', e.target.value)} 
                                        >
                                            {(() => {
                                                const matchedProd = products.find(p => p.ProductCode === item["Product Code"]);
                                                const uoms = matchedProd && matchedProd.AllowedUOMs 
                                                    ? matchedProd.AllowedUOMs.split(',').map(u => u.trim().toUpperCase()).filter(Boolean)
                                                    : [item.UOM, 'KG', 'CTN', 'PCS', 'PKT', 'BKL', 'BOX'];
                                                const uniqueUoms = Array.from(new Set([item.UOM, ...uoms])).filter(Boolean);
                                                return uniqueUoms.map(u => <option key={u} value={u}>{u}</option>);
                                            })()}
                                        </select>
                                    </td>
                                    <td className="p-2 text-right">
                                        <input 
                                            type="number" 
                                            className="w-full p-2 border border-gray-200 rounded-lg text-right font-black outline-none focus:ring-2 focus:ring-blue-500" 
                                            value={item.Price} 
                                            onChange={e => handleEditItemChange(idx, 'Price', e.target.value)} 
                                            disabled={item.Replacement === 'YES'}
                                        />
                                    </td>
                                    <td className="p-2 text-center">
                                        <input 
                                            type="checkbox" 
                                            className="w-4 h-4 text-red-500 rounded focus:ring-red-500 cursor-pointer"
                                            checked={item.Replacement === 'YES'} 
                                            onChange={e => {
                                                handleEditItemChange(idx, 'Replacement', e.target.checked ? 'YES' : '');
                                                if (e.target.checked) handleEditItemChange(idx, 'Price', 0);
                                            }} 
                                        />
                                    </td>
                                    <td className="p-2 text-center pr-4">
                                        <button onClick={() => handleDeleteItem(idx)} className="p-2 bg-red-50 text-red-500 hover:bg-red-100 rounded-lg transition"><TrashIcon className="w-4 h-4" /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Add New Item Section */}
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 mb-6 shrink-0 relative">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Add Product to Order</label>
                    <div className="flex gap-2 relative">
                        <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
                        <input 
                            type="text" 
                            placeholder="Search product to add..." 
                            className="w-full pl-9 p-2 border border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                            value={productSearchTerm}
                            onChange={e => setProductSearchTerm(e.target.value)}
                        />
                    </div>
                    {/* Add Item Search Dropdown */}
                    {productSearchTerm && (
                        <div className="absolute left-4 right-4 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-48 overflow-y-auto z-20 custom-scrollbar">
                            {filteredModalProducts.map(p => (
                                <div 
                                    key={p.ProductCode} 
                                    onClick={() => handleAddItem(p)}
                                    className="p-3 hover:bg-blue-50 cursor-pointer border-b border-gray-50 last:border-0 flex justify-between items-center group/add"
                                >
                                    <div>
                                        <div className="font-bold text-gray-800 text-xs uppercase">{p.ProductName}</div>
                                        <div className="text-[10px] text-gray-400 font-mono mt-0.5">{p.ProductCode}</div>
                                    </div>
                                    <span className="text-blue-600 font-bold text-xl opacity-0 group-hover/add:opacity-100 transition-opacity">+</span>
                                </div>
                            ))}
                            {filteredModalProducts.length === 0 && <div className="p-4 text-center text-xs text-gray-400">No products found</div>}
                        </div>
                    )}
                </div>

                {/* Modal Actions */}
                <div className="flex justify-end gap-3 mt-auto shrink-0 pt-4 border-t border-gray-100">
                    <button onClick={() => setIsEditModalOpen(false)} className="px-6 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition active:scale-95">Cancel</button>
                    <button onClick={saveEditedOrder} className="px-8 py-3 bg-blue-600 text-white font-black rounded-xl shadow-lg hover:bg-blue-700 hover:shadow-blue-500/30 transition active:scale-95">Save Changes</button>
                </div>

            </div>
          </div>
      )}

    </div>
  );
}