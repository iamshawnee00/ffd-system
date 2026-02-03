'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import Sidebar from '../components/Sidebar';

export default function DeliveryPage() {
  const [loading, setLoading] = useState(true);
  
  // --- DATE HELPERS ---
  const toLocalISOString = (date) => {
    const offset = date.getTimezoneOffset() * 60000; 
    const localDate = new Date(date.getTime() - offset);
    return localDate.toISOString().split('T')[0];
  };

  const formatDateLabel = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // --- STATE ---
  const [currentDate, setCurrentDate] = useState(new Date()); // Tracks the month being viewed
  const [selectedDate, setSelectedDate] = useState(toLocalISOString(new Date()));
  const [orderCounts, setOrderCounts] = useState({}); 
  const [calendarDays, setCalendarDays] = useState([]);

  const [groupedOrders, setGroupedOrders] = useState([]); 
  const [usageSummary, setUsageSummary] = useState([]);
  
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]); // Added customers state
  const [targetDriver, setTargetDriver] = useState('');
  const [selectedDOs, setSelectedDOs] = useState(new Set());
  const [isUsageExpanded, setIsUsageExpanded] = useState(false);
  const [isBulkSending, setIsBulkSending] = useState(false); 
  const [isSyncing, setIsSyncing] = useState(false); // Sync state

  // Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null); // Holds header info
  const [editingItems, setEditingItems] = useState([]); // Holds line items
  const [deletedItemIds, setDeletedItemIds] = useState([]);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [isSendingToShipday, setIsSendingToShipday] = useState(false);


  // --- 1. INITIAL LOAD ---
  useEffect(() => {
    fetchProducts();
    fetchCustomers();
  }, []);

  // Fetch Calendar Data whenever the viewed month (currentDate) changes
  useEffect(() => {
    fetchCalendarData();
  }, [currentDate]);

  // Fetch Orders whenever a specific date is selected
  useEffect(() => {
    fetchDayOrders(selectedDate);
    setSelectedDOs(new Set()); 
  }, [selectedDate]);

  const fetchProducts = async () => {
    const { data } = await supabase
      .from('ProductMaster')
      .select('ProductCode, ProductName, AllowedUOMs, BaseUOM, Category');
    if (data) setProducts(data);
  };

  const fetchCustomers = async () => {
    const { data } = await supabase
      .from('Customers')
      .select('CompanyName, ContactPerson, DeliveryAddress, ContactNumber')
      .order('CompanyName');
    if (data) setCustomers(data);
  };

  // --- 2. DATA FETCHING ---
  const fetchCalendarData = async () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // 1. Calculate Grid Range (Start of Month to End of Month)
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    
    // We need to pad the start to align with the grid (Sunday start)
    const startDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sun
    
    // Generate Days Array
    const daysArr = [];
    
    // Add empty slots for days before the 1st
    for (let i = 0; i < startDayOfWeek; i++) {
        daysArr.push(null);
    }

    // Add actual days
    for (let d = 1; d <= lastDayOfMonth.getDate(); d++) {
        const dateObj = new Date(year, month, d);
        const dStr = toLocalISOString(dateObj);
        daysArr.push({
            dateStr: dStr,
            dayNum: d,
            dayName: dateObj.toLocaleDateString('en-US', { weekday: 'short' }),
            fullLabel: dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
        });
    }
    setCalendarDays(daysArr);

    // 2. Fetch Counts for this Month Range
    const startStr = toLocalISOString(firstDayOfMonth);
    const endStr = toLocalISOString(lastDayOfMonth);

    const { data } = await supabase
      .from('Orders')
      .select('DONumber, "Delivery Date"')
      .gte('"Delivery Date"', startStr)
      .lte('"Delivery Date"', endStr);

    if (data) {
      const counts = {};
      const uniqueSet = new Set();
      data.forEach(row => {
        if (!row["Delivery Date"]) return;
        
        let dKey = row["Delivery Date"];
        // Ensure dKey is strictly YYYY-MM-DD
        if (typeof dKey === 'string' && dKey.length >= 10) {
             dKey = dKey.substring(0, 10);
        } else if (dKey instanceof Date) {
             dKey = toLocalISOString(dKey);
        }

        const key = `${dKey}|${row.DONumber}`;
        if (!uniqueSet.has(key)) {
          uniqueSet.add(key);
          counts[dKey] = (counts[dKey] || 0) + 1;
        }
      });
      setOrderCounts(counts);
    }
  };

  const fetchDayOrders = async (dateStr) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('Orders')
      .select('*')
      .eq('"Delivery Date"', dateStr) 
      .order('DONumber');

    if (!error && data) {
      processOrders(data);
    } else {
      setGroupedOrders([]);
      setUsageSummary([]);
    }
    setLoading(false);
  };

  const processOrders = (rows) => {
    const groups = {};
    const usage = {};
    rows.forEach(row => {
      if (!groups[row.DONumber]) {
        groups[row.DONumber] = {
          info: row,
          items: [],
          itemCount: 0
        };
      }
      groups[row.DONumber].items.push(row);
      groups[row.DONumber].itemCount += 1;

      const prodKey = row["Product Code"];
      if (!usage[prodKey]) {
        usage[prodKey] = {
          code: prodKey,
          name: row["Order Items"],
          uom: row.UOM,
          qty: 0
        };
      }
      usage[prodKey].qty += Number(row.Quantity || 0);
    });
    setGroupedOrders(Object.values(groups));
    setUsageSummary(Object.values(usage).sort((a,b) => a.name.localeCompare(b.name)));
  };

  // --- 3. ACTIONS ---
  const handleCheckbox = (doNum) => {
    const newSet = new Set(selectedDOs);
    if (newSet.has(doNum)) newSet.delete(doNum);
    else newSet.add(doNum);
    setSelectedDOs(newSet);
  };

  const handleSelectAll = () => {
    if (selectedDOs.size === groupedOrders.length) {
      setSelectedDOs(new Set());
    } else {
      setSelectedDOs(new Set(groupedOrders.map(o => o.info.DONumber)));
    }
  };

  const handleAssignDriver = async () => {
    if (selectedDOs.size === 0) return alert("Select at least one order.");
    if (!targetDriver) return alert("Please select a driver.");
    if (!confirm(`Assign ${targetDriver} to ${selectedDOs.size} orders?`)) return;

    const { error } = await supabase
      .from('Orders')
      .update({ DriverName: targetDriver })
      .in('DONumber', Array.from(selectedDOs));

    if (error) {
      alert("Error: " + error.message);
    } else {
      alert("Assigned!");
      fetchDayOrders(selectedDate);
      setSelectedDOs(new Set());
    }
  };

  // --- SYNC WITH SHIPDAY ---
  const syncWithShipday = async () => {
    setIsSyncing(true);
    // Get all DO numbers currently on screen
    const currentDOs = groupedOrders.map(g => g.info.DONumber);
    
    if (currentDOs.length === 0) {
        alert("No orders to sync.");
        setIsSyncing(false);
        return;
    }

    try {
        const response = await fetch('/api/shipday/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderNumbers: currentDOs })
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            const driversToUpdate = result.foundDrivers; // Expecting [{doNumber: '...', driverName: '...'}]
            
            if (driversToUpdate && driversToUpdate.length > 0) {
                // 1. Update Supabase
                let updateCount = 0;
                for (const item of driversToUpdate) {
                    const { error } = await supabase
                        .from('Orders')
                        .update({ DriverName: item.driverName })
                        .eq('DONumber', item.doNumber);
                    
                    if (!error) updateCount++;
                }

                // 2. Optimistic UI Update (Important fix!)
                setGroupedOrders(prevOrders => prevOrders.map(group => {
                   const match = driversToUpdate.find(d => d.doNumber === group.info.DONumber);
                   if (match) {
                       // Return new object with updated DriverName in info
                       return {
                           ...group,
                           info: { ...group.info, DriverName: match.driverName }
                       };
                   }
                   return group;
                }));

                alert(`Sync Complete! Updated ${updateCount} drivers.`);
            } else {
                alert("Sync Complete. No drivers found in Shipday yet.");
            }
        } else {
            console.error(result);
            alert("Sync failed.");
        }
    } catch (e) {
        console.error(e);
        alert("Sync error: " + e.message);
    } finally {
        setIsSyncing(false);
    }
  };

  // --- BULK SHIPDAY SEND (Robust Implementation) ---
  const sendSelectedToShipday = async () => {
    if (selectedDOs.size === 0) return alert("Select orders to send.");
    if (!confirm(`Send ${selectedDOs.size} orders to Shipday?`)) return;

    setIsBulkSending(true);
    let successCount = 0;
    let failCount = 0;
    const doNumbers = Array.from(selectedDOs);

    for (const doNum of doNumbers) {
      try {
        const { data: items, error } = await supabase
          .from('Orders')
          .select('*')
          .eq('DONumber', doNum);

        if (error || !items || items.length === 0) {
          console.error(`Failed to fetch items for ${doNum}`);
          failCount++;
          continue;
        }

        // --- ROBUST DATE FIX ---
        // Explicitly get the date string from the item, ignoring local timezones if possible
        // Ideally, the DB returns 'YYYY-MM-DD'. If it returns a full ISO string with T, split it.
        let rawDate = items[0]["Delivery Date"];
        let finalDate = "";
        
        if (rawDate) {
            // Check if it's already a simple date string (e.g. "2026-02-13")
            if (typeof rawDate === 'string' && rawDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
                finalDate = rawDate;
            } else {
                // If it's a full ISO string or Date object, convert carefully to avoid timezone shift
                const d = new Date(rawDate);
                if (!isNaN(d.getTime())) {
                    // Use toLocalISOString to ensure we get the date part relative to local/system time
                    // but since the DB stores YYYY-MM-DD, the best way is often just to slice the string
                    // if it comes back as ISO from Supabase
                    if (typeof rawDate === 'string' && rawDate.includes('T')) {
                        finalDate = rawDate.split('T')[0];
                    } else {
                        // Fallback
                        finalDate = d.toISOString().split('T')[0];
                    }
                }
            }
        }
        
        // If finalDate is still empty, fallback to today (which is the error behavior, but we try to avoid it)
        if (!finalDate) {
            console.warn(`Date missing for ${doNum}, defaulting to today.`);
            finalDate = new Date().toISOString().split('T')[0];
        }

        const orderInfo = {
             ...items[0],
             "Delivery Date": finalDate // Explicitly set correct date
        };

        const orderPayload = {
          info: orderInfo, 
          items: items   
        };
        
        const response = await fetch('/api/shipday', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order: orderPayload }),
        });

        if (response.ok) {
          successCount++;
        } else {
          console.error(`Shipday API failed for ${doNum}`);
          failCount++;
        }

      } catch (err) {
        console.error(`Exception sending ${doNum}:`, err);
        failCount++;
      }
    }

    setIsBulkSending(false);
    alert(`Bulk Send Complete:\n✅ Success: ${successCount}\n❌ Failed: ${failCount}`);
    setSelectedDOs(new Set()); 
  };

  // --- EDIT MODAL LOGIC ---
  const openEditModal = async (orderSummary) => {
    const { data: items, error } = await supabase
      .from('Orders')
      .select('*')
      .eq('DONumber', orderSummary.info.DONumber);

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
        const matchedCustomer = customers.find(c => c.CompanyName.toLowerCase() === value.toLowerCase());
        if (matchedCustomer) {
          newState["Delivery Address"] = matchedCustomer.DeliveryAddress || newState["Delivery Address"];
          newState["Contact Person"] = matchedCustomer.ContactPerson || newState["Contact Person"];
          newState["Contact Number"] = matchedCustomer.ContactNumber || newState["Contact Number"];
        }
      }
      return newState;
    });
  };

  const handleEditItemChange = (index, field, value) => {
    const newItems = [...editingItems];
    newItems[index][field] = value;
    if (field === 'Order Items') {
        const matchedProduct = products.find(p => p.ProductName === value);
        if (matchedProduct) {
            newItems[index]["Product Code"] = matchedProduct.ProductCode;
            newItems[index]["UOM"] = matchedProduct.BaseUOM;
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
      SpecialNotes: ''
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
      };
    });

    const { error } = await supabase.from('Orders').upsert(upsertPayload);

    if (error) {
      alert("Error saving: " + error.message);
    } else {
      alert("Order updated successfully.");
      setIsEditModalOpen(false);
      fetchDayOrders(selectedDate);
    }
  };

  const sendSingleToShipday = async () => {
    if (!editingOrder) return;
    setIsSendingToShipday(true);

    try {
      const response = await fetch('/api/shipday', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order: {
            info: editingOrder,
            items: editingItems
          }
        }),
      });

      const result = await response.json();

      if (response.ok) {
        alert(`Successfully sent order ${editingOrder.DONumber} to Shipday!`);
      } else {
        alert(`Failed to send to Shipday: ${result.error?.message || JSON.stringify(result.error) || "Unknown error"}`);
      }
    } catch (error) {
      console.error("API Request failed:", error);
      alert("Error connecting to server. Please try again.");
    } finally {
      setIsSendingToShipday(false);
    }
  };
  
  const printOrder = () => {
    window.open(`/orders/${editingOrder.id}/print`, '_blank');
  };


  // --- CALENDAR NAVIGATION ---
  const changeMonth = (offset) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + offset);
    setCurrentDate(newDate);
  };
  
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  // --- STYLING HELPERS ---
  const getCellClasses = (count, isSelected) => {
    let base = "h-28 rounded-2xl border-2 p-3 cursor-pointer flex flex-col justify-between transition-all duration-200 relative overflow-hidden group ";
    if (isSelected) {
      base += "ring-4 ring-blue-400 border-blue-600 z-10 shadow-xl transform -translate-y-1 ";
    } else {
      base += "hover:shadow-md hover:border-blue-300 hover:-translate-y-0.5 ";
    }
    if (count > 30) return base + "bg-emerald-50 border-emerald-200 text-emerald-900";
    if (count > 10) return base + "bg-orange-50 border-orange-200 text-orange-900";
    if (count > 0) return base + "bg-red-50 border-red-200 text-red-900";
    return base + "bg-white border-gray-100 text-gray-400";
  };

  const getPillClasses = (count) => {
    if (count > 30) return "bg-emerald-200 text-emerald-800";
    if (count > 10) return "bg-orange-200 text-orange-800";
    return "bg-red-200 text-red-800";
  };

  const getUOMOptions = (prodCode) => {
    const p = products.find(x => x.ProductCode === prodCode);
    if (!p || !p.AllowedUOMs) return [];
    return p.AllowedUOMs.split(',').map(u => u.trim().toUpperCase()).filter(Boolean);
  };

  const filteredProducts = products.filter(p => {
    if (!productSearchTerm) return false;
    const term = productSearchTerm.toLowerCase();
    return (p.ProductName.toLowerCase().includes(term) || p.ProductCode.toLowerCase().includes(term));
  });

  return (
    <div className="flex bg-gray-50 min-h-screen font-sans">
      <Sidebar />
      <main className="ml-64 flex-1 p-8">
        
        {/* HEADER & ACTIONS */}
        <div className="flex justify-between items-center mb-8 bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
            <div>
               <h1 className="text-3xl font-black text-gray-800 tracking-tight">Delivery Dashboard</h1>
               <p className="text-sm text-gray-400 font-medium mt-1">Manage delivery schedule and drivers</p>
            </div>
            
            <div className="flex gap-3">
                 <button onClick={() => window.open(`/reports/batch-do?date=${selectedDate}`, '_blank')} className="bg-purple-600 text-white font-bold py-3 px-6 rounded-2xl text-sm shadow-lg hover:bg-purple-700 transition transform active:scale-95 flex items-center gap-2">
                    <span>📦</span> All DOs
                 </button>
                 <button 
                    onClick={() => window.open(`/reports/usage?date=${selectedDate}`, '_blank')}
                    className="bg-blue-600 text-white font-bold py-3 px-6 rounded-2xl text-sm shadow-lg hover:bg-blue-700 transition transform active:scale-95 flex items-center gap-2"
                 >
                    <span>📊</span> Daily Usage
                 </button>
            </div>
        </div>

        {/* CALENDAR GRID (Month View) */}
        <div className="mb-10 bg-white p-6 rounded-3xl shadow-lg border border-gray-100">
            {/* Month Navigation */}
            <div className="flex items-center justify-between mb-6">
                <button onClick={() => changeMonth(-1)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition">◀</button>
                <h2 className="text-2xl font-black text-gray-800 uppercase tracking-widest">
                    {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                </h2>
                <button onClick={() => changeMonth(1)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition">▶</button>
            </div>

            <div className="grid grid-cols-7 gap-4 mb-3 text-center text-xs font-black text-gray-400 uppercase tracking-widest">
               <div>SUN</div><div>MON</div><div>TUE</div><div>WED</div><div>THU</div><div>FRI</div><div>SAT</div>
            </div>
            <div className="grid grid-cols-7 gap-3">
               {calendarDays.map((day, idx) => {
                  if (!day) return <div key={`empty-${idx}`} className="h-28 bg-transparent"></div>;
                  
                  const count = orderCounts[day.dateStr] || 0;
                  const isSelected = day.dateStr === selectedDate;
                  return (
                    <div 
                        key={day.dateStr} 
                        onClick={() => setSelectedDate(day.dateStr)}
                        className={getCellClasses(count, isSelected)}
                    >
                        <div className="flex justify-between items-start">
                            <span className="text-xs font-bold uppercase opacity-60 tracking-wider">{day.dayName}</span>
                            <span className={`text-2xl font-black ${isSelected ? 'text-blue-600' : ''}`}>{day.dayNum}</span>
                        </div>
                        {count > 0 ? (
                            <div className={`w-full text-center py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wide ${getPillClasses(count)}`}>
                                {count} Orders
                            </div>
                        ) : (
                            <div className="w-full text-center py-1.5 rounded-xl text-[10px] font-bold text-gray-300 bg-gray-50">
                                No Orders
                            </div>
                        )}
                    </div>
                  );
               })}
            </div>
        </div>

        {/* ORDERS LIST SECTION */}
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden animate-fade-in-up">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h3 className="text-xl font-bold text-gray-800 flex items-center gap-3">
                    Orders for <span className="text-blue-600">{formatDateLabel(selectedDate)}</span>
                    <span className="bg-gray-200 text-gray-600 text-sm px-3 py-1 rounded-full font-black">{groupedOrders.length}</span>
                </h3>
                
                {/* Driver Assignment & Bulk Send */}
                <div className="flex gap-2">
                    <input 
                        list="drivers" 
                        placeholder="Assign Driver..." 
                        className="border border-gray-300 rounded-xl px-4 py-2 text-sm w-48 focus:ring-2 focus:ring-blue-500 outline-none"
                        value={targetDriver}
                        onChange={e => setTargetDriver(e.target.value)}
                    />
                    <datalist id="drivers">
                        <option value="Ali" /><option value="Muthu" /><option value="Ah Meng" /><option value="Lalamove" />
                    </datalist>
                    <button 
                        onClick={handleAssignDriver}
                        className="bg-gray-800 text-white font-bold px-5 py-2 rounded-xl text-sm hover:bg-black shadow-md transition"
                    >
                        Assign
                    </button>
                    {/* SYNC BUTTON */}
                    <button 
                        onClick={syncWithShipday}
                        disabled={isSyncing}
                        className={`bg-blue-500 text-white font-bold px-5 py-2 rounded-xl text-sm hover:bg-blue-600 shadow-md transition ${isSyncing ? 'opacity-50 cursor-wait' : ''}`}
                    >
                        {isSyncing ? 'Syncing...' : '🔄 Sync Drivers'}
                    </button>
                    <button 
                        onClick={sendSelectedToShipday}
                        disabled={isBulkSending || selectedDOs.size === 0}
                        className={`bg-indigo-600 text-white font-bold px-5 py-2 rounded-xl text-sm hover:bg-indigo-700 shadow-md transition flex items-center gap-2 ${isBulkSending ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {isBulkSending ? 'Sending...' : '🚀 Send to Shipday'}
                    </button>
                </div>
            </div>

            {/* EXPANDABLE USAGE SUMMARY */}
            <div className="border-b border-gray-100">
                <button 
                    onClick={() => setIsUsageExpanded(!isUsageExpanded)}
                    className="w-full flex justify-between items-center px-6 py-4 text-purple-700 font-bold bg-purple-50 hover:bg-purple-100 transition text-sm"
                >
                    <span className="flex items-center gap-2">📋 View Daily Production Usage Summary</span>
                    <span>{isUsageExpanded ? '▲' : '▼'}</span>
                </button>
                {isUsageExpanded && (
                    <div className="max-h-60 overflow-y-auto p-6 bg-purple-50/30 border-t border-purple-100">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-2 text-sm">
                            {usageSummary.map((u, i) => (
                                <div key={i} className="flex justify-between border-b border-purple-100 pb-1">
                                    <span className="text-gray-700 font-medium">{u.name}</span>
                                    <span className="font-bold text-purple-800">{u.qty} <span className="text-[10px] text-gray-400 uppercase">{u.uom}</span></span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* ORDER TABLE */}
            <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 text-gray-400 text-[10px] font-black uppercase tracking-wider border-b border-gray-100">
                    <tr>
                        <th className="p-5 w-10 text-center"><input type="checkbox" onChange={handleSelectAll} checked={selectedDOs.size > 0 && selectedDOs.size === groupedOrders.length} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300" /></th>
                        <th className="p-5">DO Number</th>
                        <th className="p-5">Customer Info</th>
                        <th className="p-5">Logistics</th>
                        <th className="p-5 text-center">Items</th>
                        <th className="p-5">Driver</th>
                        <th className="p-5 text-right">Action</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-sm">
                    {groupedOrders.length === 0 ? (
                        <tr><td colSpan="7" className="p-12 text-center text-gray-400 italic bg-gray-50/30">No orders scheduled for this date.</td></tr>
                    ) : (
                        groupedOrders.map(group => (
                            <tr 
                                key={group.info.DONumber} 
                                className="hover:bg-blue-50/40 transition-colors group cursor-pointer"
                                onClick={() => openEditModal(group)} // Row click triggers modal
                            >
                                <td className="p-5 text-center" onClick={(e) => e.stopPropagation()}>
                                    <input 
                                        type="checkbox" 
                                        checked={selectedDOs.has(group.info.DONumber)} 
                                        onChange={() => handleCheckbox(group.info.DONumber)} 
                                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300"
                                    />
                                </td>
                                <td className="p-5">
                                    <span className="font-mono text-xs font-bold text-green-700 bg-green-100 px-2 py-1 rounded border border-green-200">
                                        {group.info.DONumber}
                                    </span>
                                </td>
                                <td className="p-5">
                                    <div className="font-bold text-gray-800">{group.info["Customer Name"]}</div>
                                    <div className="text-xs text-gray-400 mt-0.5">{group.info["Contact Person"]}</div>
                                </td>
                                <td className="p-5">
                                    <div className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded w-fit font-bold mb-1 uppercase tracking-wide">
                                        {group.info["Delivery Mode"] || 'Standard'}
                                    </div>
                                    <div className="text-xs text-gray-500 truncate max-w-[200px]" title={group.info["Delivery Address"]}>
                                        {group.info["Delivery Address"]}
                                    </div>
                                </td>
                                <td className="p-5 text-center">
                                    <span className="bg-gray-100 text-gray-600 text-xs font-black px-3 py-1 rounded-full">{group.itemCount}</span>
                                </td>
                                <td className="p-5">
                                    {group.info.DriverName ? (
                                        <span className="bg-indigo-50 text-indigo-700 text-xs font-bold px-3 py-1 rounded-lg border border-indigo-100">
                                            {group.info.DriverName}
                                        </span>
                                    ) : (
                                        <span className="text-gray-300 text-xs italic">--</span>
                                    )}
                                </td>
                                <td className="p-5 text-right" onClick={(e) => e.stopPropagation()}>
                                    <button 
                                        onClick={() => openEditModal(group)} 
                                        className="text-gray-400 hover:text-blue-600 p-2 rounded-lg hover:bg-blue-50 transition"
                                    >
                                        👁️
                                    </button>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>

        {/* --- EDIT ORDER MODAL --- */}
        {isEditModalOpen && editingOrder && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-up">
              
              {/* Modal Header */}
              <div className="p-6 border-b border-gray-100 flex justify-between items-start bg-gray-50">
                <div>
                  <h3 className="text-xl font-bold text-gray-800">Edit Order: {editingOrder.DONumber}</h3>
                  <p className="text-xs text-gray-500 mt-1">Modify items, prices, or delivery details.</p>
                </div>
                <div className="flex gap-2">
                    <button 
                      onClick={sendSingleToShipday} 
                      disabled={isSendingToShipday}
                      className={`px-4 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg text-xs font-bold transition flex items-center gap-2 ${isSendingToShipday ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {isSendingToShipday ? 'Sending...' : '🚀 Send to Shipday'}
                    </button>
                    <button onClick={printOrder} className="px-4 py-2 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg text-xs font-bold transition flex items-center gap-2">
                        🖨️ Print DO
                    </button>
                    <button onClick={() => setIsEditModalOpen(false)} className="text-gray-400 hover:text-red-500 text-2xl font-bold px-2 ml-2">×</button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto flex-1 space-y-6 bg-gray-50/30">
                
                {/* 1. Customer Details Section */}
                <div className="bg-blue-50 p-6 rounded-xl border border-blue-100">
                   <div className="grid grid-cols-2 gap-6">
                       <div className="col-span-2 md:col-span-1">
                          <label className="text-[10px] font-bold text-blue-700 uppercase block mb-1">Customer Name</label>
                          <input 
                            list="edit-customer-list"
                            className="w-full p-2.5 border border-blue-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" 
                            value={editingOrder["Customer Name"]}
                            onChange={e => handleEditHeaderChange("Customer Name", e.target.value)}
                            placeholder="Type to search or add new..."
                          />
                          <datalist id="edit-customer-list">
                            {customers.map(c => <option key={c.CompanyName} value={c.CompanyName} />)}
                          </datalist>
                       </div>
                       <div className="col-span-2 md:col-span-1">
                          <label className="text-[10px] font-bold text-blue-700 uppercase block mb-1">Delivery Date</label>
                          <input 
                            type="date"
                            className="w-full p-2.5 border border-blue-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" 
                            value={editingOrder["Delivery Date"]}
                            onChange={e => handleEditHeaderChange("Delivery Date", e.target.value)}
                          />
                       </div>
                       <div className="col-span-2">
                          <label className="text-[10px] font-bold text-blue-700 uppercase block mb-1">Delivery Address</label>
                          <input 
                            className="w-full p-2.5 border border-blue-200 rounded-lg text-sm bg-white" 
                            value={editingOrder["Delivery Address"]}
                            onChange={e => handleEditHeaderChange("Delivery Address", e.target.value)}
                          />
                       </div>
                       <div>
                          <label className="text-[10px] font-bold text-blue-700 uppercase block mb-1">Contact Person</label>
                          <input 
                            className="w-full p-2.5 border border-blue-200 rounded-lg text-sm bg-white" 
                            value={editingOrder["Contact Person"]}
                            onChange={e => handleEditHeaderChange("Contact Person", e.target.value)}
                          />
                       </div>
                       <div>
                          <label className="text-[10px] font-bold text-blue-700 uppercase block mb-1">Contact Number</label>
                          <input 
                            className="w-full p-2.5 border border-blue-200 rounded-lg text-sm bg-white" 
                            value={editingOrder["Contact Number"]}
                            onChange={e => handleEditHeaderChange("Contact Number", e.target.value)}
                          />
                       </div>
                   </div>
                </div>

                {/* 2. Add Item Search */}
                <div className="relative">
                   <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="text-gray-400">🔍</span>
                   </div>
                   <input 
                      type="text"
                      placeholder="Search product to add..."
                      className="w-full p-3 pl-10 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-green-500 outline-none bg-white"
                      value={productSearchTerm}
                      onChange={e => setProductSearchTerm(e.target.value)}
                   />
                   {productSearchTerm && (
                      <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-xl shadow-xl mt-1 max-h-48 overflow-y-auto">
                         {filteredProducts.map(p => (
                            <div 
                              key={p.ProductCode} 
                              className="p-3 hover:bg-green-50 cursor-pointer flex justify-between items-center border-b border-gray-50 last:border-0"
                              onClick={() => handleAddItem(p)}
                            >
                               <span className="font-bold text-gray-700">{p.ProductName}</span>
                               <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-500">{p.ProductCode}</span>
                            </div>
                         ))}
                         {filteredProducts.length === 0 && <div className="p-3 text-center text-gray-400 text-sm">No match found.</div>}
                      </div>
                   )}
                </div>

                {/* 3. Items List */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="grid grid-cols-12 gap-4 p-3 bg-gray-50 border-b border-gray-200 text-[10px] font-bold text-gray-500 uppercase">
                        <div className="col-span-5">Item</div>
                        <div className="col-span-2 text-center">Qty</div>
                        <div className="col-span-2 text-center">UOM</div>
                        <div className="col-span-2 text-right">Price</div>
                        <div className="col-span-1"></div>
                    </div>
                    <div className="divide-y divide-gray-100">
                        {editingItems.map((item, idx) => (
                          <div key={item.id || idx} className="grid grid-cols-12 gap-4 p-3 items-center hover:bg-gray-50">
                            <div className="col-span-5">
                              <input 
                                list="global-product-list"
                                className="w-full p-1.5 border border-gray-200 rounded text-sm font-bold text-gray-800 focus:ring-2 focus:ring-blue-100 outline-none"
                                value={item["Order Items"]}
                                onChange={e => handleEditItemChange(idx, 'Order Items', e.target.value)}
                              />
                              <div className="text-[10px] text-gray-400 mt-1 pl-1">{item["Product Code"]}</div>
                            </div>
                            <div className="col-span-2">
                              <input 
                                type="number" 
                                className="w-full p-1.5 border border-gray-200 rounded text-center text-sm"
                                value={item.Quantity}
                                onChange={e => handleEditItemChange(idx, 'Quantity', e.target.value)}
                              />
                            </div>
                            <div className="col-span-2">
                              <select 
                                className="w-full p-1.5 border border-gray-200 rounded text-xs bg-white text-center uppercase"
                                value={item.UOM}
                                onChange={e => handleEditItemChange(idx, 'UOM', e.target.value)}
                              >
                                 {getUOMOptions(item["Product Code"]).length > 0 ? (
                                   getUOMOptions(item["Product Code"]).map(u => <option key={u} value={u}>{u}</option>)
                                 ) : (
                                   <option value={item.UOM}>{item.UOM}</option>
                                 )}
                              </select>
                            </div>
                            <div className="col-span-2">
                              <input 
                                type="number" 
                                className="w-full p-1.5 border border-gray-200 rounded text-right text-sm"
                                value={item.Price}
                                onChange={e => handleEditItemChange(idx, 'Price', e.target.value)}
                              />
                            </div>
                            <div className="col-span-1 text-center">
                              <button 
                                onClick={() => handleDeleteItem(idx)}
                                className="text-red-300 hover:text-red-600 font-bold text-lg transition"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                </div>

              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-gray-100 bg-white flex justify-end gap-3">
                <button 
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-6 py-2.5 rounded-xl border border-gray-300 text-gray-600 font-bold hover:bg-gray-50 transition text-sm"
                >
                  Cancel
                </button>
                <button 
                  onClick={saveEditedOrder}
                  className="px-8 py-2.5 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700 shadow-lg transform active:scale-95 transition text-sm"
                >
                  Save Changes
                </button>
              </div>

            </div>
          </div>
        )}

      </main>
    </div>
  );
}