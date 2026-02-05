'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function OrderListPage() {
  const [orders, setOrders] = useState([]); 
  const [loading, setLoading] = useState(true);
  
  // Use localStorage to persist the active tab, defaulting to 'Packing'
  const [activeTab, setActiveTab] = useState('Packing');
  const [selectedOrders, setSelectedOrders] = useState(new Set());
  const [products, setProducts] = useState([]); 
  const [customers, setCustomers] = useState([]); 
  
  // Search State for Order List
  const [orderSearchTerm, setOrderSearchTerm] = useState('');

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null); 
  const [editingItems, setEditingItems] = useState([]); 
  const [deletedItemIds, setDeletedItemIds] = useState([]);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [isSendingToShipday, setIsSendingToShipday] = useState(false);
  const [isBulkSending, setIsBulkSending] = useState(false);

  const router = useRouter();

  // Load active tab from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTab = localStorage.getItem('orderListActiveTab');
      if (savedTab) {
        setActiveTab(savedTab);
      }
    }
  }, []);

  // Save active tab to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('orderListActiveTab', activeTab);
    }
    setSelectedOrders(new Set()); // Reset selection when switching tabs
  }, [activeTab]);

  useEffect(() => {
    fetchOrders();
    fetchProducts();
    fetchCustomers();
  }, []);

  async function fetchProducts() {
    const { data } = await supabase
      .from('ProductMaster')
      .select('ProductCode, ProductName, BaseUOM, AllowedUOMs');
    if (data) setProducts(data);
  }

  async function fetchCustomers() {
    const { data } = await supabase
      .from('Customers')
      .select('CompanyName, ContactPerson, DeliveryAddress, ContactNumber')
      .order('CompanyName');
    if (data) setCustomers(data);
  }

  async function fetchOrders() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/login');
      return;
    }

    const { data, error } = await supabase
      .from('Orders')
      .select('*')
      // Sort by Timestamp descending (latest first) as requested
      .order('Timestamp', { ascending: false });

    if (error) {
      console.error('Error fetching orders:', error);
    } else {
      // Deduplicate by DO Number - keep first occurrence (which is latest due to sort)
      const uniqueOrders = [];
      const seenDOs = new Set();
      data.forEach(row => {
        if (!seenDOs.has(row.DONumber)) {
          seenDOs.add(row.DONumber);
          uniqueOrders.push(row);
        }
      });
      setOrders(uniqueOrders);
    }
    setLoading(false);
  }

  // --- ACTIONS ---

  const updateOrderStatus = async (doNumber, newStatus) => {
    setOrders(prev => prev.map(o => 
      o.DONumber === doNumber ? { ...o, Status: newStatus } : o
    ));
    await supabase.from('Orders').update({ Status: newStatus }).eq('DONumber', doNumber);
  };

  const deleteOrder = async (doNumber) => {
    if (!confirm(`Are you sure you want to delete order ${doNumber}? This cannot be undone.`)) return;
    
    // Optimistic UI Update
    setOrders(prev => prev.filter(o => o.DONumber !== doNumber));

    const { error } = await supabase
      .from('Orders')
      .delete()
      .eq('DONumber', doNumber);

    if (error) {
      alert("Error deleting order: " + error.message);
      fetchOrders(); // Revert on error
    } else {
      // success - nothing else needed as UI is already updated
    }
  };

  // --- SEARCH LOGIC ---
  const handleSearch = async (term) => {
    setOrderSearchTerm(term);
    
    // If search is empty, reload full list
    if (!term) {
      fetchOrders(); 
      return;
    }

    // Do NOT set full page loading for search to avoid UI flicker
    // setLoading(true); 
    
    // Search for matches in Customer Name OR Product Name (Order Items)
    // Note: We search all rows, then group them by DO Number
    const { data, error } = await supabase
      .from('Orders')
      .select('*')
      .or(`"Customer Name".ilike.%${term}%,"Order Items".ilike.%${term}%`)
      .order('Timestamp', { ascending: false });

    if (data) {
      const uniqueOrders = [];
      const seenDOs = new Set();
      data.forEach(row => {
        if (!seenDOs.has(row.DONumber)) {
          seenDOs.add(row.DONumber);
          uniqueOrders.push(row);
        }
      });
      setOrders(uniqueOrders);
    }
    // setLoading(false);
  };

  // --- EDIT MODAL LOGIC ---
  const openEditModal = async (orderSummary) => {
    const { data: items, error } = await supabase
      .from('Orders')
      .select('*')
      .eq('DONumber', orderSummary.DONumber);

    if (error || !items) {
      alert("Error loading order details.");
      return;
    }

    setEditingOrder({ ...items[0] });
    setEditingItems(items);
    setDeletedItemIds([]);
    setProductSearchTerm('');
    setIsEditModalOpen(true);
  };

  const handleEditHeaderChange = (field, value) => {
    setEditingOrder(prev => {
      const newState = { ...prev, [field]: value };
      if (field === "Customer Name") {
        const matched = customers.find(c => c.CompanyName.toLowerCase() === value.toLowerCase());
        if (matched) {
          newState["Delivery Address"] = matched.DeliveryAddress || newState["Delivery Address"];
          newState["Contact Person"] = matched.ContactPerson || newState["Contact Person"];
          newState["Contact Number"] = matched.ContactNumber || newState["Contact Number"];
        }
      }
      return newState;
    });
  };

  const handleEditItemChange = (index, field, value) => {
    const newItems = [...editingItems];
    newItems[index][field] = value;
    if (field === 'Order Items') {
        const matched = products.find(p => p.ProductName === value);
        if (matched) {
            newItems[index]["Product Code"] = matched.ProductCode;
            newItems[index]["UOM"] = matched.BaseUOM;
        }
    }
    setEditingItems(newItems);
  };

  const handleDeleteItem = (index) => {
    const item = editingItems[index];
    if (item.id) {
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
      Status: editingOrder.Status,
      "Product Code": product.ProductCode,
      "Order Items": product.ProductName,
      Quantity: 1,
      UOM: product.BaseUOM,
      Price: 0,
      // FIX: Ensure Replacement is NOT null
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
    
    const upsertPayload = editingItems.map(item => {
      const isNew = String(item.id).startsWith('new-');
      const { id, ...rest } = item;
      const cleanItem = isNew ? rest : item;
      
      return {
        ...cleanItem,
        "Customer Name": editingOrder["Customer Name"],
        "Delivery Address": editingOrder["Delivery Address"],
        "Contact Person": editingOrder["Contact Person"],
        "Contact Number": editingOrder["Contact Number"],
        "Delivery Date": editingOrder["Delivery Date"],
        "Delivery Mode": editingOrder["Delivery Mode"],
        // FIX: Ensure Replacement is never null to satisfy DB constraint
        "Replacement": cleanItem.Replacement || ""
      };
    });

    const { error } = await supabase.from('Orders').upsert(upsertPayload);
    if (!error) { 
      setIsEditModalOpen(false); 
      fetchOrders(); 
    } else {
      alert("Error saving: " + error.message);
    }
  };

  // --- SHIPDAY INTEGRATION ---
  const sendToShipday = async () => {
    if (!editingOrder) return;
    setIsSendingToShipday(true);
    try {
      const response = await fetch('/api/shipday', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: { info: editingOrder, items: editingItems } }),
      });
      
      const result = await response.json();
      if (response.ok) {
        alert(`Sent order ${editingOrder.DONumber} to Shipday!`);
      } else {
        alert(`Failed: ${result.error?.message || "Unknown Error"}`);
      }
    } catch (err) {
      alert("Network Error");
    } finally { 
      setIsSendingToShipday(false); 
    }
  };

  const sendSelectedToShipday = async () => {
    if (selectedOrders.size === 0) return;
    if (!confirm(`Send ${selectedOrders.size} orders to Shipday?`)) return;

    setIsBulkSending(true);
    let successCount = 0;
    const doNumbers = Array.from(selectedOrders);
    
    for (const doNum of doNumbers) {
      try {
        const { data: items } = await supabase.from('Orders').select('*').eq('DONumber', doNum);
        if (items?.length) {
          // Format date if needed
          let dateStr = items[0]["Delivery Date"];
          const d = new Date(dateStr);
          if(!isNaN(d.getTime())) dateStr = d.toISOString().split('T')[0];

          const info = { ...items[0], "Delivery Date": dateStr };
          
          await fetch('/api/shipday', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ order: { info, items } }) 
          });
          successCount++;
        }
      } catch (err) {
        console.error(err);
      }
    }
    setIsBulkSending(false);
    setSelectedOrders(new Set());
    alert(`Bulk Send Complete. Processed: ${successCount}`);
  };

  const printOrder = () => {
    window.open(`/orders/${editingOrder.id}/print`, '_blank');
  };

  // --- SELECTION & FILTER LOGIC ---
  const filteredOrders = orders.filter(order => {
    const status = order.Status || 'Pending';
    if (activeTab === 'Packing') return status === 'Pending' || status === 'Packing';
    if (activeTab === 'Completed') return status === 'Completed';
    return false;
  });

  const toggleSelectAll = () => {
    if (selectedOrders.size === filteredOrders.length) {
      setSelectedOrders(new Set());
    } else {
      const allDOs = filteredOrders.map(o => o.DONumber);
      setSelectedOrders(new Set(allDOs));
    }
  };

  const toggleSelectOrder = (doNumber) => {
    const newSet = new Set(selectedOrders);
    if (newSet.has(doNumber)) newSet.delete(doNumber);
    else newSet.add(doNumber);
    setSelectedOrders(newSet);
  };

  const getCount = (tab) => {
    return orders.filter(o => {
      const s = o.Status || 'Pending';
      if (tab === 'Packing') return s === 'Pending' || s === 'Packing';
      if (tab === 'Completed') return s === 'Completed';
      return false;
    }).length;
  };

  const getUOMOptions = (prodCode) => {
    const p = products.find(x => x.ProductCode === prodCode);
    return p?.AllowedUOMs ? p.AllowedUOMs.split(',').map(u => u.trim().toUpperCase()) : [];
  };

  const getDeliveryModeStyle = (mode) => {
      if (!mode) return 'bg-purple-100 text-purple-700 border-purple-200';
      const m = mode.toLowerCase();
      if (m.includes('lalamove')) return 'bg-orange-100 text-orange-800 border-orange-200';
      if (m.includes('pick') || m.includes('self')) return 'bg-blue-100 text-blue-800 border-blue-200';
      return 'bg-purple-100 text-purple-700 border-purple-200';
  };

  if (loading) return <div className="p-10 text-center font-bold text-gray-400">Loading Orders...</div>;

  return (
    <div className="p-3 md:p-6 max-w-full overflow-x-hidden pt-16 md:pt-6">
      <datalist id="global-product-list">
        {products.map(p => <option key={p.ProductCode} value={p.ProductName} />)}
      </datalist>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight">Order Management</h1>
          <p className="text-[10px] text-gray-400 font-bold uppercase">Workflow status list</p>
        </div>
        <Link href="/orders/new" className="w-full sm:w-auto bg-green-600 text-white font-bold py-2.5 px-6 rounded-xl text-xs text-center shadow-lg active:scale-95">+ New Order</Link>
      </div>

      {/* SEARCH BAR */}
      <div className="mb-4 relative">
        <input 
          type="text" 
          placeholder="Search Customer or Product..." 
          className="w-full p-3 pl-10 border border-gray-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          value={orderSearchTerm}
          onChange={(e) => handleSearch(e.target.value)}
        />
        <span className="absolute left-3 top-3 text-gray-400">🔍</span>
      </div>

      <div className="flex space-x-1 mb-4 bg-white p-1 rounded-2xl shadow-sm border border-gray-100 w-full sm:w-fit">
        {['Packing', 'Completed'].map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-1 sm:flex-none px-6 py-2 rounded-xl font-black text-xs transition-all ${activeTab === tab ? 'bg-green-100 text-green-800 shadow-sm' : 'text-gray-400 hover:bg-gray-50'}`}>
            {tab} <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[9px] ${activeTab===tab ? 'bg-white' : 'bg-gray-100'}`}>{getCount(tab)}</span>
          </button>
        ))}
      </div>

      {selectedOrders.size > 0 && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-xl flex justify-between items-center animate-in fade-in">
          <span className="text-xs font-black text-blue-700">{selectedOrders.size} Selected</span>
          <button onClick={sendSelectedToShipday} disabled={isBulkSending} className="bg-indigo-600 text-white text-[10px] font-black py-1.5 px-4 rounded-lg shadow-md">
            {isBulkSending ? 'Sending...' : '🚀 Send to Shipday'}
          </button>
        </div>
      )}

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[700px]">
            <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
              <tr>
                <th className="p-4 w-10">
                  <input type="checkbox" onChange={() => setSelectedOrders(selectedOrders.size === filteredOrders.length ? new Set() : new Set(filteredOrders.map(o => o.DONumber)))} checked={selectedOrders.size > 0 && selectedOrders.size === filteredOrders.length} className="cursor-pointer" />
                </th>
                <th className="p-4">DO Details</th>
                <th className="p-4">Customer</th>
                <th className="p-4">Driver / Mode</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-xs">
              {filteredOrders.map((order) => (
                <tr key={order.DONumber} className="hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => openEditModal(order)}>
                  <td className="p-4" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedOrders.has(order.DONumber)} onChange={() => toggleSelectOrder(order.DONumber)} className="cursor-pointer" />
                  </td>
                  <td className="p-4">
                    <div className="font-mono text-blue-600 font-bold mb-1">{order.DONumber}</div>
                    <div className="text-gray-400 font-bold">{order["Delivery Date"]}</div>
                    <div className="text-[9px] text-gray-300 mt-1">{new Date(order.Timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                  </td>
                  <td className="p-4">
                    <div className="font-black text-gray-800 uppercase">{order["Customer Name"]}</div>
                    <div className="text-[10px] text-gray-400 mt-1 truncate max-w-[200px]">{order["Delivery Address"]}</div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-lg font-black text-[10px] border uppercase ${getDeliveryModeStyle(order.DriverName || order["Delivery Mode"])}`}>
                        {order.DriverName || order["Delivery Mode"] || 'Driver'}
                    </span>
                  </td>
                  <td className="p-4 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-end gap-2 items-center">
                       <Link href={`/orders/${order.id}/print`} target="_blank" className="p-2 bg-gray-50 rounded-lg hover:bg-gray-100 text-lg">🖨️</Link>
                       
                       {activeTab === 'Packing' && (
                         <button onClick={() => updateOrderStatus(order.DONumber, 'Completed')} className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black py-1.5 px-4 rounded-lg shadow-sm transition">Done</button>
                       )}
                       
                       {activeTab === 'Completed' && (
                         <button onClick={() => updateOrderStatus(order.DONumber, 'Packing')} className="text-gray-400 hover:text-red-500 font-bold px-2 transition">Revert</button>
                       )}

                       <button onClick={() => deleteOrder(order.DONumber)} className="p-2 text-red-200 hover:text-red-600 transition text-lg" title="Delete Order">🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredOrders.length === 0 && <div className="p-10 text-center text-gray-400 italic">No orders found.</div>}
        </div>
      </div>

      {/* --- EDIT MODAL --- */}
      {isEditModalOpen && editingOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-6 border-b bg-gray-50 flex justify-between items-center">
              <h3 className="font-black text-gray-800">Edit DO: {editingOrder.DONumber}</h3>
              <div className="flex gap-2">
                <button onClick={sendToShipday} disabled={isSendingToShipday} className="text-[10px] font-black bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg">🚀 {isSendingToShipday ? '...' : 'Shipday'}</button>
                <button onClick={printOrder} className="text-[10px] font-black bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg">🖨️ Print</button>
                <button onClick={() => setIsEditModalOpen(false)} className="text-gray-400 font-bold text-xl px-2">×</button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Customer Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-blue-50 p-4 rounded-2xl">
                 <input list="edit-cust" className="p-2 rounded-xl border text-sm font-bold uppercase" value={editingOrder["Customer Name"]} onChange={e => handleEditHeaderChange("Customer Name", e.target.value)} placeholder="CUSTOMER" />
                 <datalist id="edit-cust">{customers.map(c => <option key={c.id} value={c.CompanyName} />)}</datalist>
                 <input type="date" className="p-2 rounded-xl border text-sm font-bold" value={editingOrder["Delivery Date"]} onChange={e => handleEditHeaderChange("Delivery Date", e.target.value)} />
                 <input className="p-2 rounded-xl border text-sm md:col-span-2 uppercase" value={editingOrder["Delivery Address"]} onChange={e => handleEditHeaderChange("Delivery Address", e.target.value)} />
              </div>
              
              {/* Add Item */}
              <div className="relative">
                <input type="text" placeholder="Add product..." className="w-full p-3 border rounded-2xl text-sm" value={productSearchTerm} onChange={e => setProductSearchTerm(e.target.value)} />
                {productSearchTerm && (
                  <div className="absolute z-10 w-full bg-white border mt-1 rounded-xl shadow-xl max-h-40 overflow-y-auto">
                    {products.filter(p => p.ProductName.toLowerCase().includes(productSearchTerm.toLowerCase())).map(p => (
                      <div key={p.ProductCode} className="p-3 hover:bg-gray-50 cursor-pointer flex justify-between text-xs" onClick={() => handleAddItem(p)}>
                        <span className="font-bold">{p.ProductName}</span>
                        <span className="text-gray-400">{p.ProductCode}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Items Table */}
              <div className="border rounded-2xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-50 font-black text-[10px] uppercase">
                    <tr><th className="p-3">Item</th><th className="p-3 text-center">Qty</th><th className="p-3">UOM</th><th className="p-3 text-right">Price</th><th className="p-3"></th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {editingItems.map((item, idx) => (
                      <tr key={item.id || idx}>
                        <td className="p-3"><input list="global-product-list" className="w-full font-bold uppercase" value={item["Order Items"]} onChange={e => handleEditItemChange(idx, 'Order Items', e.target.value)} /></td>
                        <td className="p-3"><input type="number" className="w-12 text-center" value={item.Quantity} onChange={e => handleEditItemChange(idx, 'Quantity', e.target.value)} /></td>
                        <td className="p-3">
                          <select className="uppercase" value={item.UOM} onChange={e => handleEditItemChange(idx, 'UOM', e.target.value)}>
                            {getUOMOptions(item["Product Code"]).map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </td>
                        <td className="p-3"><input type="number" className="w-16 text-right font-bold" value={item.Price} onChange={e => handleEditItemChange(idx, 'Price', e.target.value)} /></td>
                        <td className="p-3"><button onClick={() => handleDeleteItem(idx)} className="text-red-400 font-bold">✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className="p-6 border-t flex justify-end gap-3">
              <button onClick={() => setIsEditModalOpen(false)} className="px-6 py-2 text-sm font-bold text-gray-400">Cancel</button>
              <button onClick={saveEditedOrder} className="px-8 py-2 bg-green-600 text-white rounded-xl text-sm font-black shadow-lg">Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}