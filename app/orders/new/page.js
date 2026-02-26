'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { 
  PlusCircleIcon, 
  ClipboardDocumentListIcon, 
  PencilSquareIcon, 
  TrashIcon,
  ArrowPathIcon,
  PrinterIcon,
  TruckIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

export default function NewOrderPage() {
  const router = useRouter();
  
  // Tab State
  const [activeTab, setActiveTab] = useState('new'); // 'new' or 'list'

  // Data States
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [orderHistory, setOrderHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRealtimeActive, setIsRealtimeActive] = useState(false);

  // User State
  const [currentUser, setCurrentUser] = useState('');

  // --- NEW ORDER STATES ---
  const [selectedCustomerValue, setSelectedCustomerValue] = useState('');
  const [custDetails, setCustDetails] = useState({ 
    ContactPerson: '', 
    ContactNumber: '', 
    DeliveryAddress: '' 
  });
  
  const getLocalDateString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [deliveryDate, setDeliveryDate] = useState(() => {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    if (hours > 12 || (hours === 12 && minutes > 0)) {
      const tomorrow = new Date();
      tomorrow.setDate(now.getDate() + 1);
      return getLocalDateString(tomorrow);
    }
    return getLocalDateString(now);
  });

  const [deliveryMode, setDeliveryMode] = useState('Driver'); 
  const [salesChannel, setSalesChannel] = useState('Online / FnB'); 
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [productInputs, setProductInputs] = useState({});

  // --- ORDER LIST / EDIT STATES ---
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [editingItems, setEditingItems] = useState([]);
  const [deletedItemIds, setDeletedItemIds] = useState([]);
  const [productSearchTerm, setProductSearchTerm] = useState('');

  // --- MULTI-SELECT & BULK ACTION STATES ---
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [bulkEditData, setBulkEditData] = useState({ deliveryDate: '', deliveryMode: '', status: '' });

  const fetchOrderHistory = async () => {
    const { data, error } = await supabase
        .from('Orders')
        .select('*')
        .order('Delivery Date', { ascending: false }) 
        .limit(3000); 
    
    if (error) {
        console.error("Error fetching orders:", error);
        return;
    }

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
            if (dateA.getTime() !== dateB.getTime()) {
                return dateB - dateA;
            }
            return new Date(b.info.Timestamp) - new Date(a.info.Timestamp);
        });
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

      const email = session.user.email || "";
      const username = email.split('@')[0].toUpperCase();
      setCurrentUser(username);

      const { data: custData } = await supabase
        .from('Customers')
        .select('*')
        .order('CompanyName');

      const { data: prodData } = await supabase
        .from('ProductMaster')
        .select('ProductCode, ProductName, BaseUOM, SalesUOM, Category, StockBalance, ReportingUOM, AllowedUOMs')
        .order('ProductName');

      setCustomers(custData || []);
      setProducts(prodData || []);
      
      await fetchOrderHistory();
      setLoading(false);
    }
    
    loadData();

    const channel = supabase
      .channel('realtime_orders_sync')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'Orders' }, () => {
          fetchOrderHistory();
      })
      .subscribe((status) => {
          if (status === 'SUBSCRIBED') setIsRealtimeActive(true);
          else setIsRealtimeActive(false);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  // ==========================================
  // SHIPDAY PULL SYNC LOGIC
  // ==========================================
  const handlePullShipdayStatus = async () => {
      if (!confirm("Pulling latest status from Shipday (including completions). Proceed?")) return;
      
      setIsSyncing(true);
      try {
          const res = await fetch('/api/shipday/sync-status', { method: 'POST' });
          const result = await res.json();
          
          if (res.ok) {
              alert(`Success! Updated ${result.updatedCount || 0} orders.`);
              await fetchOrderHistory(); 
          } else {
              alert("Sync Error: " + (result.error || 'Unknown error'));
          }
      } catch (err) {
          console.error(err);
          alert("Error communicating with the server.");
      }
      setIsSyncing(false);
  };

  // ==========================================
  // NEW ORDER FORM LOGIC
  // ==========================================
  const handleCustomerChange = (e) => {
    const inputValue = e.target.value;
    setSelectedCustomerValue(inputValue);
    
    const details = customers.find(c => {
        const displayString = c.Branch ? `${c.CompanyName} - ${c.Branch}` : c.CompanyName;
        return displayString.trim().toLowerCase() === inputValue.trim().toLowerCase();
    });
    
    if (details) {
      setCustDetails({
        ContactPerson: details.ContactPerson || '',
        ContactNumber: details.ContactNumber || '',
        DeliveryAddress: details.DeliveryAddress || ''
      });
    }
  };

  const handleDetailChange = (field, value) => {
    setCustDetails(prev => ({ ...prev, [field]: value }));
  };

  const handleProductInputChange = (code, field, value) => {
    setProductInputs(prev => {
      const current = prev[code] || {};
      const newData = { ...current, [field]: value };
      if (field === 'replacement' && value === true) newData.price = 0;
      return { ...prev, [code]: newData };
    });
  };

  const addToCart = (product) => {
    const inputs = productInputs[product.ProductCode] || {};
    const qty = parseFloat(inputs.qty);
    const price = inputs.price === '' || inputs.price === undefined ? 0 : parseFloat(inputs.price); 
    
    if (!qty || qty <= 0) return;

    const newItem = {
      ...product,
      cartId: `${product.ProductCode}-${Date.now()}`, 
      qty: qty,
      uom: inputs.uom || product.SalesUOM || product.BaseUOM,
      price: price, 
      notes: '',
      isReplacement: inputs.replacement || false
    };

    setCart([...cart, newItem]);
    setProductInputs(prev => {
      const newState = { ...prev };
      delete newState[product.ProductCode];
      return newState;
    });
    setSearchTerm(''); 
  };

  const removeFromCart = (cartId) => setCart(cart.filter(item => item.cartId !== cartId));
  const updateCartItem = (cartId, field, value) => setCart(cart.map(item => item.cartId === cartId ? { ...item, [field]: value } : item));

  const handleSubmitOrder = async () => {
    if (!selectedCustomerValue || !deliveryDate || cart.length === 0) {
      alert("Please select a customer, date, and at least one item.");
      return;
    }

    setSubmitting(true);
    const [year, month, day] = deliveryDate.split('-');
    const dateStr = `${year.slice(2)}${month}${day}`;
    const doNumber = `DO-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;

    const orderRows = cart.map(item => ({
        "Timestamp": new Date(),
        "Status": "Pending",
        "DONumber": doNumber,
        "Delivery Date": deliveryDate,
        "Delivery Mode": deliveryMode,
        "Customer Name": selectedCustomerValue.toUpperCase(), 
        "Delivery Address": custDetails.DeliveryAddress.toUpperCase(),
        "Contact Person": custDetails.ContactPerson.toUpperCase(),
        "Contact Number": custDetails.ContactNumber,
        "Product Code": item.ProductCode,
        "Order Items": item.ProductName,
        "Quantity": item.qty,
        "UOM": item.uom,
        "Price": item.isReplacement ? 0 : item.price,
        "Replacement": item.isReplacement ? "YES" : (item.price === 0 ? "FOC" : ""),
        "SpecialNotes": item.notes,
        "LoggedBy": currentUser
    }));

    const { error } = await supabase.from('Orders').insert(orderRows);

    if (error) {
      alert("Error: " + error.message);
      setSubmitting(false);
    } else {
      alert(`Order Created: ${doNumber}`);
      setCart([]);
      setSelectedCustomerValue('');
      setCustDetails({ ContactPerson: '', ContactNumber: '', DeliveryAddress: '' });
      setSubmitting(false);
      fetchOrderHistory();
      setActiveTab('list'); 
    }
  };

  // ==========================================
  // ORDER LIST ACTIONS (INDIVIDUAL & BULK)
  // ==========================================
  const toggleOrderSelection = (doNumber) => {
    setSelectedOrders(prev => 
        prev.includes(doNumber) 
            ? prev.filter(id => id !== doNumber) 
            : [...prev, doNumber]
    );
  };

  const toggleSelectAll = () => {
    if (selectedOrders.length === displayedHistory.length) {
        setSelectedOrders([]);
    } else {
        setSelectedOrders(displayedHistory.map(group => group.info.DONumber));
    }
  };

  // 1. Delete
  const handleDeleteDO = async (doNumber) => {
      if (!confirm(`Delete entire order ${doNumber}?`)) return;
      const { error } = await supabase.from('Orders').delete().eq('DONumber', doNumber);
      if (!error) {
          setSelectedOrders(prev => prev.filter(id => id !== doNumber));
          fetchOrderHistory();
      }
  };

  const handleBulkDelete = async () => {
      if (!confirm(`Are you sure you want to permanently delete ${selectedOrders.length} selected orders?`)) return;
      const { error } = await supabase.from('Orders').delete().in('DONumber', selectedOrders);
      if (!error) {
          setSelectedOrders([]);
          fetchOrderHistory();
      } else {
          alert("Error deleting orders: " + error.message);
      }
  };

  // 2. Print
  const handlePrintOrder = (doNumber) => {
      window.open(`/orders/${doNumber}/print`, '_blank');
  };

  const handleBulkPrint = () => {
      if (selectedOrders.length === 0) return;
      // Get the date of the first selected order to satisfy the batch-do page requirement
      const firstSelectedGroup = orderHistory.find(group => selectedOrders.includes(group.info.DONumber));
      const targetDate = firstSelectedGroup ? firstSelectedGroup.info["Delivery Date"] : '';
      
      window.open(`/reports/batch-do?date=${targetDate}&dos=${selectedOrders.join(',')}`, '_blank');
  };

  // 3. Shipday Sync
  const handleSendToShipday = async (doNumber) => {
      if (!confirm(`Push order ${doNumber} to Shipday delivery?`)) return;
      try {
          const res = await fetch('/api/shipday', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ doNumber })
          });
          if (res.ok) alert(`Success! Sent ${doNumber} to Shipday.`);
          else alert(`Failed to send ${doNumber} to Shipday.`);
      } catch (err) {
          alert("Server connection error.");
      }
  };

  const handleBulkShipday = async () => {
      if (!confirm(`Are you sure you want to push ${selectedOrders.length} selected orders to Shipday?`)) return;
      let successCount = 0;
      
      // We loop because the API might be designed to process single orders at a time
      for (const doNumber of selectedOrders) {
          try {
              const res = await fetch('/api/shipday', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ doNumber })
              });
              if (res.ok) successCount++;
          } catch (e) {
              console.error(`Error sending ${doNumber}:`, e);
          }
      }
      alert(`Completed Shipday push. Successful: ${successCount} / ${selectedOrders.length}`);
  };

  // 4. Bulk Edit Save
  const handleBulkEditSave = async () => {
      const updates = {};
      if (bulkEditData.deliveryDate) updates["Delivery Date"] = bulkEditData.deliveryDate;
      if (bulkEditData.deliveryMode) updates["Delivery Mode"] = bulkEditData.deliveryMode;
      if (bulkEditData.status) updates["Status"] = bulkEditData.status;

      if (Object.keys(updates).length === 0) {
          alert("No fields to update.");
          return;
      }
      
      if (!confirm(`Apply changes to ${selectedOrders.length} orders?`)) return;

      const { error } = await supabase.from('Orders').update(updates).in('DONumber', selectedOrders);
      if (error) {
          alert("Bulk Edit Error: " + error.message);
      } else {
          alert("Bulk update successful!");
          setIsBulkEditOpen(false);
          setSelectedOrders([]);
          setBulkEditData({ deliveryDate: '', deliveryMode: '', status: '' });
          fetchOrderHistory();
      }
  };

  // ==========================================
  // EDIT INDIVIDUAL ORDER MODAL
  // ==========================================
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
      if (item.id && !String(item.id).startsWith('new-')) setDeletedItemIds(prev => [...prev, item.id]);
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
          UOM: product.SalesUOM || product.BaseUOM,
          Price: 0,
          Replacement: "" 
      };
      setEditingItems([...editingItems, newItem]);
      setProductSearchTerm('');
  };

  const saveEditedOrder = async () => {
      if (!confirm("Save changes?")) return;
      if (deletedItemIds.length > 0) await supabase.from('Orders').delete().in('id', deletedItemIds);
      
      const newItems = [];
      const existingItems = [];
      const cleanStatus = formatDisplayStatus(getRawStatus(editingOrder));

      editingItems.forEach(item => {
          const isNew = !item.id || (typeof item.id === 'string' && item.id.startsWith('new-'));
          const payload = {
              ...editingOrder,
              "Status": cleanStatus,
              "Replacement": item.Replacement || "", 
              "Product Code": item["Product Code"],
              "Order Items": item["Order Items"],
              "Quantity": item.Quantity,
              "UOM": item.UOM,
              "Price": item.Price,
          };
          delete payload.id; // Clean payload for upsert/insert logic
          if (isNew) newItems.push({ ...payload, "Timestamp": new Date() });
          else existingItems.push({ ...payload, id: item.id });
      });

      const res1 = newItems.length > 0 ? await supabase.from('Orders').insert(newItems) : { error: null };
      const res2 = existingItems.length > 0 ? await supabase.from('Orders').upsert(existingItems) : { error: null };

      if (res1.error || res2.error) alert("Error saving changes.");
      else {
          alert("Updated successfully.");
          setIsEditModalOpen(false); 
          fetchOrderHistory(); 
      }
  };

  // ==========================================
  // STATUS MAPPING HELPERS
  // ==========================================
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

  // ==========================================
  // FINAL SEARCH & DERIVED DATA LOGIC
  // ==========================================
  const filteredProducts = products.filter(p => {
    if (!searchTerm) return false;
    const searchParts = searchTerm.toLowerCase().split(' ').filter(Boolean);
    const combined = `${p.ProductName} ${p.ProductCode} ${p.Category || ''}`.toLowerCase();
    return searchParts.every(part => combined.includes(part));
  });

  const filteredOrderHistory = orderHistory.filter(group => {
      if (!historySearchTerm) return true;
      const terms = historySearchTerm.toLowerCase().split(' ').filter(Boolean);
      const cleanStatus = formatDisplayStatus(getRawStatus(group.info));
      const searchStr = `${group.info.DONumber} ${group.info["Customer Name"]} ${group.info["Delivery Date"]} ${cleanStatus}`.toLowerCase();
      return terms.every(t => searchStr.includes(t));
  });

  const displayedHistory = historySearchTerm ? filteredOrderHistory : filteredOrderHistory.slice(0, 100);

  const getStockColor = (balance) => {
    if (balance === null || balance === undefined) return 'bg-gray-100 text-gray-500'; 
    const qty = Number(balance);
    if (qty < 20) return 'bg-red-100 text-red-600';
    if (qty <= 50) return 'bg-orange-100 text-orange-600';
    return 'bg-green-100 text-green-600';
  };

  if (loading) return <div className="p-10 flex items-center justify-center h-screen text-gray-400 font-black tracking-widest animate-pulse">FFD SYSTEM ENGINE BOOTING...</div>;

  return (
    <div className="p-3 md:p-8 max-w-full overflow-x-hidden min-h-screen bg-gray-50/50 pb-32">
      
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"> 
         <div>
             <h1 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight">Order Management</h1> 
             <p className="text-[10px] md:text-xs text-gray-400 font-bold uppercase mt-1">Manage single-session and historical orders</p> 
         </div>
         <div className="text-[9px] md:text-xs font-bold text-gray-500 bg-white border border-gray-200 px-3 py-1.5 rounded-full uppercase shadow-sm">
             User: {currentUser}
         </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 border-b border-gray-200">
          <button onClick={() => setActiveTab('new')} className={`px-6 py-3 rounded-t-2xl font-black text-sm transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === 'new' ? 'bg-green-600 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-100'}`}>
              <PlusCircleIcon className="w-5 h-5" /> New Order
          </button>
          <button onClick={() => setActiveTab('list')} className={`px-6 py-3 rounded-t-2xl font-black text-sm transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === 'list' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-100'}`}>
              <ClipboardDocumentListIcon className="w-5 h-5" /> Order History
          </button>
      </div>

      {/* TAB 1: CREATE NEW ORDER */}
      {activeTab === 'new' && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100"> 
            <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 border-b border-gray-50 pb-2">Customer & Logistics</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4"> 
               <div className="col-span-1">
                   <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Sales Channel</label>
                   <select className="w-full bg-green-50 border border-green-200 text-green-800 text-xs font-black rounded-xl p-3 focus:ring-2 focus:ring-green-500 outline-none" value={salesChannel} onChange={(e) => setSalesChannel(e.target.value)}>
                      <option>Online / FnB</option><option>Wholesale</option><option>Outlet</option>
                   </select>
               </div>
               <div className="col-span-1 md:col-span-2">
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Customer Search</label>
                  <input list="customer-list" type="text" className="w-full border border-gray-200 rounded-xl p-3 text-xs font-black focus:ring-2 focus:ring-green-500 uppercase bg-gray-50/50 outline-none" value={selectedCustomerValue} onChange={handleCustomerChange} placeholder="TYPE TO FIND CUSTOMER..." />
                  <datalist id="customer-list">{customers.map(c => <option key={c.id} value={c.Branch ? `${c.CompanyName} - ${c.Branch}` : c.CompanyName} />)}</datalist>
               </div>
               <div className="col-span-1">
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Contact Details</label>
                  <input type="text" className="w-full border border-gray-200 rounded-xl p-3 text-xs font-bold uppercase" value={custDetails.ContactPerson} onChange={(e) => handleDetailChange('ContactPerson', e.target.value)} placeholder="PERSON" />
               </div>
               <div className="col-span-1">
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">&nbsp;</label>
                  <input type="text" className="w-full border border-gray-200 rounded-xl p-3 text-xs font-bold" value={custDetails.ContactNumber} onChange={(e) => handleDetailChange('ContactNumber', e.target.value)} placeholder="NUMBER" />
               </div>
               <div className="col-span-1">
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Delivery Date</label>
                  <input type="date" className="w-full border border-gray-200 rounded-xl p-3 text-xs font-black bg-blue-50 text-blue-800 outline-none" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
               </div>
               <div className="col-span-1">
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Mode</label>
                  <select className="w-full border border-gray-200 rounded-xl p-3 text-xs font-black outline-none" value={deliveryMode} onChange={e => setDeliveryMode(e.target.value)}>
                    <option value="Driver">Driver</option><option value="Lalamove">Lalamove</option><option value="Self Pick-up">Self Pick-up</option>
                  </select>
               </div>
               <div className="col-span-1 md:col-span-2">
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Delivery Address</label>
                  <input type="text" className="w-full border border-gray-200 rounded-xl p-3 text-xs font-medium uppercase bg-gray-50/50 outline-none" value={custDetails.DeliveryAddress} onChange={(e) => handleDetailChange('DeliveryAddress', e.target.value)} placeholder="FULL ADDRESS..." />
               </div>
            </div>
          </div>

          <div className="space-y-4">
             <div className="relative">
                <input type="text" placeholder="Search catalog..." className="w-full pl-12 p-4 border border-gray-200 rounded-2xl shadow-sm focus:ring-2 focus:ring-green-500 text-sm font-bold bg-white outline-none" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                <span className="absolute left-4 top-4 text-gray-400 text-xl">🔍</span>
             </div>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filteredProducts.slice(0, 10).map(p => {
                    const inputs = productInputs[p.ProductCode] || {};
                    const uomOptions = p.AllowedUOMs ? p.AllowedUOMs.split(',').map(u => u.trim().toUpperCase()).filter(u => u) : [p.BaseUOM];
                    return (
                      <div key={p.ProductCode} className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                         <div className={`absolute top-0 right-0 px-3 py-1 rounded-bl-2xl text-[8px] font-black uppercase ${getStockColor(p.StockBalance)}`}>
                            STOCK: {p.StockBalance ? Number(p.StockBalance).toFixed(1) : '0.0'} {p.BaseUOM}
                         </div>
                         <h3 className="font-black text-gray-800 text-sm uppercase leading-tight mb-3 pr-10">{p.ProductName}</h3>
                         <div className="flex gap-2 mb-3">
                            <select className="bg-gray-50 border border-gray-200 rounded-xl text-[10px] p-2 flex-1 font-black uppercase outline-none" value={inputs.uom || p.SalesUOM || p.BaseUOM} onChange={(e) => handleProductInputChange(p.ProductCode, 'uom', e.target.value)}>
                              {uomOptions.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                            <input type="number" placeholder="Qty" className="w-20 border border-gray-200 rounded-xl text-xs p-2 font-black text-center outline-none" value={inputs.qty || ''} onChange={(e) => handleProductInputChange(p.ProductCode, 'qty', e.target.value)} />
                         </div>
                         <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" className="w-4 h-4 text-red-500 rounded border-gray-300" checked={inputs.replacement || false} onChange={(e) => handleProductInputChange(p.ProductCode, 'replacement', e.target.checked)} /> <span className="text-[8px] font-black text-red-400 uppercase tracking-widest">REPLACEMENT</span></label>
                            <div className="flex-1"></div>
                            <div className="relative w-24">
                                <span className="absolute left-2 top-2 text-[8px] font-bold text-gray-400">RM</span>
                                <input type="number" step="0.01" className="w-full pl-6 p-2 text-xs border border-gray-200 rounded-xl text-right font-black outline-none" disabled={inputs.replacement} value={inputs.price || ''} onChange={(e) => handleProductInputChange(p.ProductCode, 'price', e.target.value)} />
                            </div>
                            <button onClick={() => addToCart(p)} className="bg-green-600 hover:bg-green-700 text-white rounded-xl w-10 h-10 flex items-center justify-center font-bold shadow-lg transform transition active:scale-90">+</button>
                         </div>
                      </div>
                    );
                })}
             </div>
          </div>
        </div>

        <div className="lg:col-span-1">
           <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-gray-100 sticky top-4 flex flex-col h-[calc(100vh-6rem)] min-h-[500px]">
              <div className="flex justify-between items-center mb-6">
                 <h2 className="text-lg font-black text-gray-800 tracking-tight uppercase">Cart Summary</h2>
                 <span className="bg-green-100 text-green-700 text-[10px] font-black px-3 py-1 rounded-full uppercase">{cart.length} items</span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-3 mb-6 custom-scrollbar pr-1">
                  {cart.length === 0 ? <div className="h-48 flex flex-col items-center justify-center text-gray-300 italic text-sm border-2 border-dashed border-gray-100 rounded-[2rem]">Cart is currently empty</div> : cart.map((item) => (
                    <div key={item.cartId} className="p-4 rounded-2xl bg-gray-50/50 border border-gray-100 relative group hover:bg-white transition-all">
                        <div className="flex justify-between items-start mb-2"><div className="pr-6"><div className="text-[11px] font-black uppercase text-gray-800 leading-tight">{item.ProductName}</div><div className="text-[9px] text-gray-400 font-mono">{item.ProductCode}</div></div><button onClick={() => removeFromCart(item.cartId)} className="text-gray-300 hover:text-red-500 absolute top-3 right-3 p-1">✕</button></div>
                        <div className="flex items-center justify-between mt-2"><div className="text-[10px] font-black text-green-700 bg-green-50 px-2.5 py-1 rounded-lg border border-green-100">{item.qty} {item.uom}</div>{item.isReplacement ? <span className="text-[8px] font-black text-white bg-red-400 px-2 py-1 rounded-lg uppercase shadow-sm">REPLACEMENT</span> : <span className="text-[10px] font-black text-gray-700 bg-white border px-2 py-1 rounded-lg">RM {(item.price || 0).toFixed(2)}</span>}</div>
                        <input type="text" placeholder="Internal item note..." className="w-full mt-3 bg-transparent border-b border-gray-100 text-[10px] font-medium text-gray-500 focus:border-green-400 outline-none pb-1 italic placeholder-gray-300" value={item.notes || ''} onChange={(e) => updateCartItem(item.cartId, 'notes', e.target.value)} />
                    </div>
                  ))}
              </div>
              <div className="mt-auto pt-6 border-t border-gray-100 space-y-4">
                  <div className="flex justify-between text-xs font-black text-gray-800 px-2 uppercase tracking-widest"><span>Total Entries:</span><span>{cart.length}</span></div>
                  <button onClick={handleSubmitOrder} disabled={submitting || cart.length === 0} className={`w-full py-4 rounded-2xl text-white font-black text-sm shadow-xl transition-all flex items-center justify-center gap-2 ${submitting || cart.length === 0 ? 'bg-gray-300 cursor-not-allowed shadow-none' : 'bg-green-600 hover:bg-green-700 hover:shadow-green-500/30 active:scale-95'}`}>
                      {submitting ? 'PROCESSING ENGINE...' : '🚀 FINALIZE ORDER'}
                  </button>
              </div>
           </div>
        </div>
      </div>
      )}

      {/* TAB 2: ORDER HISTORY LIST */}
      {activeTab === 'list' && (
      <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-gray-100 animate-in fade-in h-[calc(100vh-180px)] flex flex-col relative">
         <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 flex-none">
             <div>
                <h2 className="text-xl font-black text-gray-800 tracking-tight flex items-center gap-2 uppercase">
                    <ClipboardDocumentListIcon className="w-7 h-7 text-blue-600" /> Recent Logged Orders
                </h2>
                <div className="flex items-center gap-2 mt-1.5 ml-1">
                    <div className={`w-2.5 h-2.5 rounded-full ${isRealtimeActive ? 'bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-gray-300'}`}></div>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                        {isRealtimeActive ? 'Live Real-time Monitoring' : 'Real-time Disconnected'}
                    </span>
                </div>
             </div>
             <div className="flex items-center gap-3 w-full sm:w-auto">
                 <button onClick={handlePullShipdayStatus} disabled={isSyncing} className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-black py-3 px-5 rounded-2xl text-xs transition-all flex items-center gap-2 border border-blue-200 disabled:opacity-50 shadow-sm active:scale-95">
                     <ArrowPathIcon className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                     {isSyncing ? 'SYNCING...' : 'SYNC SHIPDAY'}
                 </button>
                 <div className="relative w-full sm:w-80">
                     <input type="text" placeholder="Search orders..." className="w-full pl-10 p-3.5 border border-gray-200 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-blue-500 bg-gray-50/50 outline-none transition-all" value={historySearchTerm} onChange={(e) => setHistorySearchTerm(e.target.value)} />
                     <span className="absolute left-3.5 top-4 text-gray-400">🔍</span>
                 </div>
             </div>
         </div>

         <div className="flex-1 overflow-auto custom-scrollbar border border-gray-100 rounded-3xl">
             <table className="w-full text-left whitespace-nowrap min-w-[1050px]">
                 <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest sticky top-0 z-10 shadow-sm border-b border-gray-100">
                     <tr>
                        <th className="p-5 w-10 text-center">
                            <input 
                                type="checkbox" 
                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                checked={displayedHistory.length > 0 && selectedOrders.length === displayedHistory.length}
                                onChange={toggleSelectAll}
                            />
                        </th>
                        <th className="p-5 w-32">Delivery Date</th>
                        <th className="p-5 w-32">DO Number</th>
                        <th className="p-5 w-[350px]">Customer Entity</th>
                        <th className="p-5 text-center w-16">Items</th>
                        <th className="p-5 text-center w-28">Live Status</th>
                        <th className="p-5 text-right pr-6 w-32">Actions</th>
                     </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-50 text-sm font-bold text-gray-700">
                     {displayedHistory.map((group) => {
                         const rawStatus = getRawStatus(group.info);
                         const isSelected = selectedOrders.includes(group.info.DONumber);
                         return (
                         <tr key={group.info.DONumber} className={`${isSelected ? 'bg-blue-50/60' : 'hover:bg-blue-50/30'} transition-colors group/row cursor-pointer`} onClick={() => toggleOrderSelection(group.info.DONumber)}>
                             <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                                <input 
                                    type="checkbox" 
                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                    checked={isSelected}
                                    onChange={() => toggleOrderSelection(group.info.DONumber)}
                                />
                             </td>
                             <td className="p-4 font-mono text-gray-500 text-xs">{new Date(group.info["Delivery Date"]).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                             <td className="p-4 font-black text-blue-600 font-mono text-sm">{group.info.DONumber}</td>
                             <td className="p-4">
                                 <div className="font-black text-gray-800 text-base md:text-lg uppercase max-w-[350px] whitespace-normal leading-tight" title={group.info["Customer Name"]}>{group.info["Customer Name"]}</div>
                             </td>
                             <td className="p-4 text-center"><span className="bg-white border border-gray-100 shadow-sm px-3 py-1 rounded-full font-black text-sm">{group.items.length}</span></td>
                             <td className="p-4 text-center"><span className={`px-2.5 py-1.5 rounded-full text-[10px] font-black uppercase border shadow-sm whitespace-nowrap ${getStatusColor(rawStatus)}`}>{formatDisplayStatus(rawStatus)}</span></td>
                             <td className="p-4 text-right pr-6" onClick={(e) => e.stopPropagation()}>
                                 <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity w-full">
                                     <button onClick={() => openEditModal(group)} className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition" title="Modify Order"><PencilSquareIcon className="w-5 h-5" /></button>
                                     <button onClick={() => handlePrintOrder(group.info.DONumber)} className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg transition" title="Print DO"><PrinterIcon className="w-5 h-5" /></button>
                                     <button onClick={() => handleSendToShipday(group.info.DONumber)} className="p-1.5 text-green-600 hover:bg-green-100 rounded-lg transition" title="Push to Shipday"><TruckIcon className="w-5 h-5" /></button>
                                     <button onClick={() => handleDeleteDO(group.info.DONumber)} className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition" title="Purge Record"><TrashIcon className="w-5 h-5" /></button>
                                 </div>
                             </td>
                         </tr>
                     )})}
                     {displayedHistory.length === 0 && (
                         <tr><td colSpan="7" className="p-16 text-center text-gray-300 italic font-bold">No orders match your current filter.</td></tr>
                     )}
                 </tbody>
             </table>
         </div>

         {/* STICKY FLOATING ACTION BAR FOR MULTI-SELECT */}
         {selectedOrders.length > 0 && (
             <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-gray-900/95 backdrop-blur-md text-white px-6 py-4 rounded-full shadow-[0_20px_40px_rgba(0,0,0,0.3)] flex items-center gap-6 z-[100] animate-in slide-in-from-bottom-10 border border-gray-700 w-max">
                 <div className="flex items-center gap-3">
                     <span className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-black text-xs shadow-inner">
                         {selectedOrders.length}
                     </span>
                     <span className="font-bold text-[10px] uppercase tracking-widest text-gray-300 mr-2">Selected</span>
                 </div>
                 
                 <div className="flex gap-2 border-l border-gray-700 pl-6 border-r pr-6">
                     <button onClick={() => setIsBulkEditOpen(true)} className="flex items-center gap-2 hover:bg-white/10 px-4 py-2 rounded-xl transition font-bold text-xs">
                         <PencilSquareIcon className="w-4 h-4 text-blue-400" /> Multi-Edit
                     </button>
                     <button onClick={handleBulkPrint} className="flex items-center gap-2 hover:bg-white/10 px-4 py-2 rounded-xl transition font-bold text-xs">
                         <PrinterIcon className="w-4 h-4 text-gray-300" /> Batch Print
                     </button>
                     <button onClick={handleBulkShipday} className="flex items-center gap-2 hover:bg-white/10 px-4 py-2 rounded-xl transition font-bold text-xs">
                         <TruckIcon className="w-4 h-4 text-green-400" /> Push Shipday
                     </button>
                     <button onClick={handleBulkDelete} className="flex items-center gap-2 hover:bg-red-500/20 px-4 py-2 rounded-xl transition font-bold text-xs text-red-400 hover:text-red-300">
                         <TrashIcon className="w-4 h-4" /> Batch Delete
                     </button>
                 </div>
                 
                 <button onClick={() => setSelectedOrders([])} className="text-gray-400 hover:text-white transition bg-gray-800 p-2 rounded-full hover:bg-gray-700" title="Clear Selection">
                     <XMarkIcon className="w-5 h-5" />
                 </button>
             </div>
         )}
      </div>
      )}

      {/* ==========================================
          BULK EDIT MODAL
          ========================================== */}
      {isBulkEditOpen && (
          <div className="fixed inset-0 bg-black/60 z-[110] flex items-center justify-center p-4 backdrop-blur-sm">
             <div className="bg-white rounded-3xl w-full max-w-lg p-8 shadow-2xl flex flex-col animate-in zoom-in duration-200 border border-gray-100">
                 <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                     <div>
                         <h2 className="text-xl font-black text-gray-800 uppercase tracking-tight">Bulk Edit Orders</h2>
                         <p className="text-xs text-gray-400 font-bold mt-1">Applying changes to <span className="text-blue-600">{selectedOrders.length}</span> orders.</p>
                     </div>
                     <button onClick={() => setIsBulkEditOpen(false)} className="text-gray-400 hover:text-red-500 text-3xl font-bold bg-gray-50 hover:bg-red-50 w-10 h-10 rounded-full flex items-center justify-center transition-all pb-1">×</button>
                 </div>
                 
                 <div className="space-y-4 mb-8">
                     <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
                         <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">New Delivery Date</label>
                         <input type="date" className="w-full p-3 border border-gray-200 rounded-xl outline-none font-bold text-sm focus:ring-2 focus:ring-blue-500" value={bulkEditData.deliveryDate} onChange={e => setBulkEditData({...bulkEditData, deliveryDate: e.target.value})} />
                         <p className="text-[9px] text-gray-400 mt-1 italic">*Leave blank to keep existing dates</p>
                     </div>
                     
                     <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                         <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Delivery Mode Override</label>
                         <select className="w-full p-3 border border-gray-200 rounded-xl outline-none font-bold text-sm focus:ring-2 focus:ring-blue-500" value={bulkEditData.deliveryMode} onChange={e => setBulkEditData({...bulkEditData, deliveryMode: e.target.value})}>
                             <option value="">-- No Change --</option>
                             <option value="Driver">Driver</option>
                             <option value="Lalamove">Lalamove</option>
                             <option value="Self Pick-up">Self Pick-up</option>
                         </select>
                     </div>

                     <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                         <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Force Status Update</label>
                         <select className="w-full p-3 border border-gray-200 rounded-xl outline-none font-bold text-sm focus:ring-2 focus:ring-blue-500" value={bulkEditData.status} onChange={e => setBulkEditData({...bulkEditData, status: e.target.value})}>
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

                 <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                    <button onClick={() => setIsBulkEditOpen(false)} className="px-6 py-3 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition-all active:scale-95 text-xs uppercase tracking-widest">Cancel</button>
                    <button onClick={handleBulkEditSave} className="px-8 py-3 bg-blue-600 text-white font-black rounded-xl shadow-lg hover:bg-blue-700 hover:shadow-blue-500/30 transition-all active:scale-95 text-xs uppercase tracking-widest">Apply to {selectedOrders.length} Orders</button>
                </div>
             </div>
          </div>
      )}

      {/* EDIT INDIVIDUAL ORDER MODAL */}
      {isEditModalOpen && editingOrder && (
          <div className="fixed inset-0 bg-black/60 z-[110] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-[2.5rem] w-full max-w-5xl p-8 shadow-2xl flex flex-col max-h-[95vh] animate-in zoom-in duration-200 border border-gray-100">
                <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-6 shrink-0">
                    <div>
                        <h2 className="text-2xl font-black text-gray-800 uppercase flex items-center gap-2">Edit Master Order <span className="text-blue-600 font-mono">{editingOrder.DONumber}</span></h2>
                        <div className="flex items-center gap-3 mt-3">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Manual Status Override:</span>
                            <select className={`border rounded-xl px-4 py-1.5 text-[10px] font-black outline-none shadow-sm transition-all ${getStatusColor(getRawStatus(editingOrder))}`} value={formatDisplayStatus(getRawStatus(editingOrder))} onChange={e => setEditingOrder({...editingOrder, Status: e.target.value})}>
                                <option value="PENDING">PENDING</option><option value="ASSIGNED">ASSIGNED</option><option value="IN TRANSIT">IN TRANSIT</option><option value="DELIVERED">DELIVERED</option><option value="FAILED">FAILED</option><option value="CANCELLED">CANCELLED</option>
                            </select>
                        </div>
                    </div>
                    <button onClick={() => setIsEditModalOpen(false)} className="text-gray-400 hover:text-red-500 text-4xl font-bold bg-gray-50 hover:bg-red-50 w-12 h-12 rounded-full flex items-center justify-center transition-all pb-1">×</button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 shrink-0 bg-gray-50/50 p-6 rounded-3xl border border-gray-100 text-xs uppercase font-bold">
                    <div className="md:col-span-2"><label className="block text-[10px] text-gray-400 mb-1.5 ml-1">Customer Entity</label><input className="w-full p-3 border border-gray-200 rounded-2xl outline-none font-black focus:ring-2 focus:ring-blue-500" value={editingOrder["Customer Name"]} onChange={e => setEditingOrder({...editingOrder, "Customer Name": e.target.value})} /></div>
                    <div className="md:col-span-2"><label className="block text-[10px] text-gray-400 mb-1.5 ml-1">Full Address</label><input className="w-full p-3 border border-gray-200 rounded-2xl outline-none font-medium focus:ring-2 focus:ring-blue-500" value={editingOrder["Delivery Address"]} onChange={e => setEditingOrder({...editingOrder, "Delivery Address": e.target.value})} /></div>
                    <div><label className="block text-[10px] text-gray-400 mb-1.5 ml-1">Phone</label><input className="w-full p-3 border border-gray-200 rounded-2xl outline-none" value={editingOrder["Contact Number"] || ''} onChange={e => setEditingOrder({...editingOrder, "Contact Number": e.target.value})} /></div>
                    <div><label className="block text-[10px] text-gray-400 mb-1.5 ml-1">Delivery Date</label><input type="date" className="w-full p-3 border border-gray-200 rounded-2xl outline-none bg-blue-50 text-blue-800" value={editingOrder["Delivery Date"]} onChange={e => setEditingOrder({...editingOrder, "Delivery Date": e.target.value})} /></div>
                </div>

                <div className="flex-1 overflow-auto border border-gray-100 rounded-3xl mb-6 custom-scrollbar shadow-inner">
                    <table className="w-full text-left text-xs whitespace-nowrap">
                        <thead className="bg-gray-100/50 font-black text-gray-500 sticky top-0 z-10 text-[10px] uppercase tracking-widest border-b border-gray-100">
                            <tr><th className="p-4 pl-6">Product Item</th><th className="p-4 w-24 text-center">Qty</th><th className="p-4 w-28 text-center">UOM</th><th className="p-4 w-32 text-right">Price (RM)</th><th className="p-4 w-24 text-center">Replace?</th><th className="p-4 w-12 pr-6"></th></tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 bg-white">
                            {editingItems.map((item, idx) => (
                                <tr key={idx} className={item.Replacement === 'YES' ? 'bg-red-50/20' : 'hover:bg-gray-50/30'}>
                                    <td className="p-3 pl-6">
                                        <select className="w-full p-2.5 border border-gray-200 rounded-xl text-xs font-black uppercase outline-none focus:ring-2 focus:ring-blue-500" value={item["Order Items"]} onChange={e => handleEditItemChange(idx, 'Order Items', e.target.value)}>
                                            <option value={item["Order Items"]}>{item["Order Items"]}</option>
                                            {products.filter(p => p.ProductName !== item["Order Items"]).map(p => <option key={p.ProductCode} value={p.ProductName}>{p.ProductName}</option>)}
                                        </select>
                                    </td>
                                    <td className="p-3 text-center"><input type="number" className="w-full p-2.5 border border-gray-200 rounded-xl text-center font-black outline-none focus:ring-2 focus:ring-blue-500" value={item.Quantity} onChange={e => handleEditItemChange(idx, 'Quantity', e.target.value)} /></td>
                                    <td className="p-3 text-center"><select className="w-full p-2.5 border border-gray-200 rounded-xl text-center font-bold uppercase outline-none focus:ring-2 focus:ring-blue-500" value={item.UOM} onChange={e => handleEditItemChange(idx, 'UOM', e.target.value)}>{[item.UOM, 'KG', 'CTN', 'PCS', 'BOX'].map(u => <option key={u} value={u}>{u}</option>)}</select></td>
                                    <td className="p-3 text-right"><input type="number" step="0.01" className="w-full p-2.5 border border-gray-200 rounded-xl text-right font-black outline-none focus:ring-2 focus:ring-blue-500" value={item.Price} onChange={e => handleEditItemChange(idx, 'Price', e.target.value)} disabled={item.Replacement === 'YES'} /></td>
                                    <td className="p-3 text-center"><input type="checkbox" className="w-5 h-5 text-red-500 rounded border-gray-300 focus:ring-red-500 cursor-pointer" checked={item.Replacement === 'YES'} onChange={e => { handleEditItemChange(idx, 'Replacement', e.target.checked ? 'YES' : ''); if (e.target.checked) handleEditItemChange(idx, 'Price', 0); }} /></td>
                                    <td className="p-3 text-center pr-6"><button onClick={() => handleDeleteItem(idx)} className="p-2.5 bg-red-50 text-red-500 hover:bg-red-100 rounded-xl transition shadow-sm"><TrashIcon className="w-4 h-4" /></button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 mb-8 shrink-0 relative">
                    <div className="flex gap-2 relative">
                        <span className="absolute left-4 top-3.5 text-gray-400 text-lg">🔍</span>
                        <input type="text" placeholder="Add additional product to this order..." className="w-full pl-11 p-3.5 border border-gray-200 rounded-2xl text-xs font-black outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" value={productSearchTerm} onChange={e => setProductSearchTerm(e.target.value)} />
                    </div>
                    {productSearchTerm && (
                        <div className="absolute left-6 right-6 mt-1 bg-white border border-gray-200 rounded-2xl shadow-2xl max-h-48 overflow-y-auto z-20 custom-scrollbar divide-y divide-gray-50">
                            {products.filter(p => p.ProductName.toLowerCase().includes(productSearchTerm.toLowerCase())).map(p => (
                                <div key={p.ProductCode} onClick={() => handleAddItem(p)} className="p-4 hover:bg-blue-50 cursor-pointer flex justify-between items-center group/add text-xs uppercase font-black">
                                    <div>{p.ProductName} <span className="text-[10px] text-gray-400 ml-2 font-mono tracking-tighter">{p.ProductCode}</span></div>
                                    <span className="bg-blue-600 text-white w-6 h-6 rounded-lg flex items-center justify-center opacity-0 group-hover/add:opacity-100 transition-all font-black">+</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-3 mt-auto shrink-0 pt-6 border-t border-gray-100">
                    <button onClick={() => setIsEditModalOpen(false)} className="px-8 py-4 bg-gray-100 text-gray-600 font-black rounded-2xl hover:bg-gray-200 transition-all active:scale-95 uppercase text-xs tracking-widest">Abort</button>
                    <button onClick={saveEditedOrder} className="px-10 py-4 bg-blue-600 text-white font-black rounded-2xl shadow-xl hover:bg-blue-700 hover:shadow-blue-500/30 transition-all active:scale-95 uppercase text-xs tracking-widest">Commit Changes</button>
                </div>
            </div>
          </div>
      )}
    </div>
  );
}