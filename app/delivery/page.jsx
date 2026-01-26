'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import Sidebar from '../components/Sidebar';

export default function DeliveryPage() {
  const [loading, setLoading] = useState(true);
  
  // Helper to get local date string YYYY-MM-DD
  const getLocalDateString = (date) => {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().split('T')[0];
  };

  // Calendar State
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(getLocalDateString(new Date()));
  const [orderCounts, setOrderCounts] = useState({}); 

  // Data for the Selected Date
  const [dayOrders, setDayOrders] = useState([]); // Flat list of items
  const [groupedOrders, setGroupedOrders] = useState([]); // Grouped by DO
  const [usageSummary, setUsageSummary] = useState([]);
  
  // Product Data (for editing/adding items)
  const [products, setProducts] = useState([]);

  // UI State
  const [isUsageExpanded, setIsUsageExpanded] = useState(false);
  const [selectedDOs, setSelectedDOs] = useState(new Set());
  const [targetDriver, setTargetDriver] = useState('');
  
  // Modal & Editing State
  const [viewingOrder, setViewingOrder] = useState(null); 
  const [isEditing, setIsEditing] = useState(false);
  const [editedItems, setEditedItems] = useState([]);
  const [deletedItemIds, setDeletedItemIds] = useState([]);
  const [itemSearchTerm, setItemSearchTerm] = useState('');

  // --- 1. INITIAL LOAD & CALENDAR DATA ---
  useEffect(() => {
    fetchMonthData(currentDate);
    fetchProducts();
  }, [currentDate]);

  // --- 2. FETCH ORDERS WHEN DATE SELECTED ---
  useEffect(() => {
    fetchDayOrders(selectedDate);
  }, [selectedDate]);

  const fetchProducts = async () => {
    const { data } = await supabase
      .from('ProductMaster')
      .select('ProductCode, ProductName, AllowedUOMs, BaseUOM, Category');
    if (data) setProducts(data);
  };

  const fetchMonthData = async (dateObj) => {
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth();
    
    // Construct simplified YYYY-MM-DD range to avoid timezone issues
    // Start: 1st of current month
    const startStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    // End: 1st of next month
    const nextMonthDate = new Date(year, month + 1, 1);
    const endStr = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-01`;

    // Fetch all orders for the month to populate the calendar heatmap
    // Using 50,000 limit to ensure full month data is retrieved even with high volume
    const { data } = await supabase
      .from('Orders')
      .select('DONumber, "Delivery Date"')
      .gte('"Delivery Date"', startStr)
      .lt('"Delivery Date"', endStr)
      .limit(50000); 

    if (data) {
      if (data.length === 50000) {
        console.warn("DeliveryPage: Hit 50,000 row limit. Month data might be incomplete.");
      }

      const counts = {};
      const uniqueSet = new Set();
      data.forEach(row => {
        if (!row["Delivery Date"]) return;
        const key = `${row["Delivery Date"]}|${row.DONumber}`;
        if (!uniqueSet.has(key)) {
          uniqueSet.add(key);
          
          // Ensure dKey is strictly YYYY-MM-DD (first 10 chars) to match calendar keys
          let dKey = row["Delivery Date"];
          if (dKey && typeof dKey === 'string') {
             dKey = dKey.trim();
             if (dKey.length > 10) dKey = dKey.substring(0, 10);
          }
          
          counts[dKey] = (counts[dKey] || 0) + 1;
        }
      });
      setOrderCounts(counts);
    }
  };

  const fetchDayOrders = async (dateStr) => {
    setLoading(true);
    // Fetch detailed rows for the specific selected day
    const { data, error } = await supabase
      .from('Orders')
      .select('*')
      .eq('"Delivery Date"', dateStr)
      .order('DONumber');

    if (error) {
      console.error("Error fetching day orders:", error);
    } else {
      setDayOrders(data || []);
      processOrders(data || []);
    }
    setLoading(false);
  };

  const processOrders = (rows) => {
    // 1. Group by DO for the List View
    const groups = {};
    const usage = {};

    rows.forEach(row => {
      // Grouping
      if (!groups[row.DONumber]) {
        groups[row.DONumber] = {
          info: row, // Keep first row metadata
          items: [],
          itemCount: 0
        };
      }
      groups[row.DONumber].items.push(row);
      groups[row.DONumber].itemCount += 1;

      // Usage Calculation
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

  // --- EDITING LOGIC ---

  const handleEditClick = () => {
    setEditedItems(JSON.parse(JSON.stringify(viewingOrder.items))); // Deep copy
    setDeletedItemIds([]);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedItems([]);
    setDeletedItemIds([]);
  };

  const handleEditItemChange = (index, field, value) => {
    const newItems = [...editedItems];
    newItems[index][field] = value;
    setEditedItems(newItems);
  };

  const handleDeleteItem = (index) => {
    const item = editedItems[index];
    if (item.id) {
      setDeletedItemIds([...deletedItemIds, item.id]);
    }
    const newItems = editedItems.filter((_, i) => i !== index);
    setEditedItems(newItems);
  };

  const handleAddItem = (product) => {
    const uomOptions = product.AllowedUOMs 
      ? product.AllowedUOMs.split(',').map(u => u.trim().toUpperCase()).filter(u => u)
      : [product.BaseUOM];

    const newItem = {
      // Temporary ID for UI key only (negative to distinguish from DB IDs)
      tempId: Date.now(), 
      DONumber: viewingOrder.info.DONumber,
      "Delivery Date": viewingOrder.info["Delivery Date"],
      "Customer Name": viewingOrder.info["Customer Name"],
      "Delivery Address": viewingOrder.info["Delivery Address"],
      "Contact Person": viewingOrder.info["Contact Person"],
      "Contact Number": viewingOrder.info["Contact Number"],
      "Delivery Mode": viewingOrder.info["Delivery Mode"],
      Status: viewingOrder.info.Status,
      DriverName: viewingOrder.info.DriverName,
      "Product Code": product.ProductCode,
      "Order Items": product.ProductName,
      Quantity: 1,
      UOM: product.BaseUOM || 'KG',
      Price: 0,
      SpecialNotes: ''
    };
    setEditedItems([...editedItems, newItem]);
    setItemSearchTerm('');
  };

  const handleSaveOrder = async () => {
    if (!confirm("Save changes to this order?")) return;

    // 1. Delete removed items
    if (deletedItemIds.length > 0) {
      await supabase.from('Orders').delete().in('id', deletedItemIds);
    }

    // 2. Upsert (Update existing / Insert new)
    // We need to strip 'tempId' and ensure 'id' is present for updates
    const upsertData = editedItems.map(item => {
      const { tempId, ...rest } = item; 
      // If it has an ID, it updates. If no ID (new item), it inserts.
      return rest;
    });

    const { error } = await supabase.from('Orders').upsert(upsertData);

    if (error) {
      alert("Error saving order: " + error.message);
    } else {
      alert("Order updated successfully!");
      setIsEditing(false);
      // Refresh Data
      fetchDayOrders(selectedDate);
      
      // Update the local modal view immediately so it doesn't close/flash old data
      // We re-fetch specifically this DO or just rely on fetchDayOrders
      // For simplicity, we just close the modal to force refresh from the list, or re-open it
      setViewingOrder(null); 
    }
  };

  // FUZZY SEARCH LOGIC
  const filteredProducts = products.filter(p => {
    if (!itemSearchTerm) return false;
    const lowerTerm = itemSearchTerm.toLowerCase();
    // Split by space and remove empty strings to avoid matching everything on double space
    const searchParts = lowerTerm.split(' ').filter(part => part.trim() !== '');

    const combinedText = (
      (p.ProductName || '') + ' ' + 
      (p.ProductCode || '') + ' ' + 
      (p.Category || '')
    ).toLowerCase();

    // Check if EVERY part of the search term exists in the combined text
    return searchParts.every(part => combinedText.includes(part));
  });

  const getUOMOptions = (productCode) => {
    const product = products.find(p => p.ProductCode === productCode);
    if (!product || !product.AllowedUOMs) return [];
    return product.AllowedUOMs.split(',').map(u => u.trim().toUpperCase()).filter(u => u);
  };

  // --- ACTIONS ---

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
    if (!targetDriver) return alert("Please enter or select a driver name.");

    if (!confirm(`Assign ${targetDriver} to ${selectedDOs.size} orders?`)) return;

    // We update rows where DONumber is in our selected list
    const { error } = await supabase
      .from('Orders')
      .update({ DriverName: targetDriver })
      .in('DONumber', Array.from(selectedDOs));

    if (error) {
      alert("Error updating drivers: " + error.message);
    } else {
      alert("Drivers Assigned!");
      fetchDayOrders(selectedDate); // Refresh
      setSelectedDOs(new Set());
    }
  };

  // --- HELPER UI ---
  const getColorClass = (count) => {
    if (!count) return 'bg-gray-50';
    if (count > 30) return 'bg-green-200 border-green-500 text-green-900';
    if (count > 10) return 'bg-orange-200 border-orange-500 text-orange-900';
    return 'bg-red-200 border-red-500 text-red-900';
  };

  const changeMonth = (offset) => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1));
  };
  
  // Calendar Helper Function (Inside component to access logic if needed, or outside is fine)
  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay(); 
    
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) {
      // Use local time construction to ensure date string matches getLocalDateString
      const d = new Date(year, month, i);
      const offset = d.getTimezoneOffset() * 60000;
      const localDateStr = new Date(d.getTime() - offset).toISOString().split('T')[0];
      days.push(localDateStr);
    }
    return days;
  };

  const days = getDaysInMonth(currentDate);
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  return (
    <div className="flex bg-gray-50 min-h-screen">
      <Sidebar />
      <main className="ml-64 flex-1 p-8">
        <h1 className="text-3xl font-bold mb-6 text-gray-800">Delivery Dashboard</h1>

        {/* --- CALENDAR SECTION --- */}
        <div className="bg-white rounded shadow p-6 mb-8">
            <div className="flex justify-between items-center mb-4">
              <button onClick={() => changeMonth(-1)} className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300">&lt;</button>
              <h2 className="text-xl font-bold text-gray-700">{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</h2>
              <button onClick={() => changeMonth(1)} className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300">&gt;</button>
            </div>
            
            <div className="grid grid-cols-7 gap-2 mb-2 text-center text-sm font-bold text-gray-500">
               <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {days.map((dateStr, idx) => {
                if (!dateStr) return <div key={idx} className="h-20"></div>;
                const count = orderCounts[dateStr] || 0;
                const isSelected = dateStr === selectedDate;
                return (
                  <div key={dateStr} 
                       onClick={() => setSelectedDate(dateStr)}
                       className={`h-20 border rounded p-2 cursor-pointer flex flex-col justify-between transition-all 
                         ${isSelected ? 'ring-2 ring-blue-600 shadow-lg scale-105 z-10' : ''} 
                         ${getColorClass(count)}`}
                  >
                    <div className="text-right font-bold text-sm">{parseInt(dateStr.split('-')[2])}</div>
                    {count > 0 && <div className="text-xs text-center font-bold bg-white bg-opacity-50 rounded px-1">{count} Orders</div>}
                  </div>
                );
              })}
            </div>
        </div>

        {/* --- MAIN CONTENT FOR SELECTED DATE --- */}
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-800 border-b pb-2">
                Orders for {selectedDate} ({groupedOrders.length})
            </h2>

            {/* 1. DAILY USAGE ACCORDION */}
            <div className="bg-white rounded shadow border-l-4 border-purple-500">
                <button 
                    onClick={() => setIsUsageExpanded(!isUsageExpanded)}
                    className="w-full flex justify-between items-center p-4 text-purple-800 font-bold hover:bg-purple-50"
                >
                    <span>📋 Daily Usage Summary ({usageSummary.length} Items)</span>
                    <span>{isUsageExpanded ? '▲' : '▼'}</span>
                </button>
                
                {isUsageExpanded && (
                    <div className="p-4 border-t max-h-96 overflow-y-auto bg-gray-50">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-purple-100 text-purple-900 sticky top-0">
                                <tr>
                                    <th className="p-2">Item</th>
                                    <th className="p-2 w-24 text-center">Total Qty</th>
                                    <th className="p-2 w-20 text-center">UOM</th>
                                </tr>
                            </thead>
                            <tbody>
                                {usageSummary.map((item, idx) => (
                                    <tr key={idx} className="border-b hover:bg-white">
                                        <td className="p-2">{item.name}</td>
                                        <td className="p-2 text-center font-bold">{item.qty}</td>
                                        <td className="p-2 text-center uppercase text-xs text-gray-500">{item.uom}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* 2. DRIVER ASSIGNMENT TOOLBAR */}
            <div className="bg-white rounded shadow p-4 flex flex-wrap gap-4 items-end border-l-4 border-blue-500">
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Assign Driver</label>
                    <div className="flex gap-2">
                        <input 
                            type="text" 
                            list="drivers"
                            placeholder="Select or Type Driver Name..."
                            className="flex-1 border p-2 rounded"
                            value={targetDriver}
                            onChange={e => setTargetDriver(e.target.value)}
                        />
                        <datalist id="drivers">
                            <option value="Ali" />
                            <option value="Muthu" />
                            <option value="Ah Meng" />
                            <option value="Lalamove" />
                            <option value="Self Pick-up" />
                        </datalist>
                        <button 
                            onClick={handleAssignDriver}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded"
                        >
                            Assign to Selected ({selectedDOs.size})
                        </button>
                    </div>
                </div>
                <div>
                     <button 
                        onClick={() => window.open(`/reports/batch-do?date=${selectedDate}`, '_blank')}
                        className="bg-gray-800 hover:bg-black text-white font-bold px-4 py-2 rounded flex items-center gap-2"
                     >
                        <span>🖨️</span> Print All DOs
                     </button>
                </div>
            </div>

            {/* 3. ORDER LIST */}
            <div className="bg-white rounded shadow overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-100 text-gray-600 text-sm uppercase">
                        <tr>
                            <th className="p-3 w-10 text-center">
                                <input type="checkbox" onChange={handleSelectAll} checked={selectedDOs.size > 0 && selectedDOs.size === groupedOrders.length} />
                            </th>
                            <th className="p-3">DO Number</th>
                            <th className="p-3">Customer</th>
                            <th className="p-3">Location</th>
                            <th className="p-3">Items</th>
                            <th className="p-3">Driver</th>
                            <th className="p-3 text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {groupedOrders.length === 0 ? (
                            <tr><td colSpan="7" className="p-8 text-center text-gray-400">No orders for this date.</td></tr>
                        ) : (
                            groupedOrders.map(group => (
                                <tr key={group.info.DONumber} className="border-b hover:bg-blue-50 transition-colors cursor-pointer">
                                    <td className="p-3 text-center">
                                        <input 
                                            type="checkbox" 
                                            checked={selectedDOs.has(group.info.DONumber)}
                                            onChange={(e) => { e.stopPropagation(); handleCheckbox(group.info.DONumber); }}
                                        />
                                    </td>
                                    <td className="p-3 font-medium text-blue-600" onClick={() => setViewingOrder(group)}>
                                        {group.info.DONumber}
                                    </td>
                                    <td className="p-3 font-bold" onClick={() => setViewingOrder(group)}>
                                        {group.info["Customer Name"]}
                                    </td>
                                    <td className="p-3 text-sm text-gray-500 truncate max-w-[200px]" onClick={() => setViewingOrder(group)}>
                                        {group.info["Delivery Address"]}
                                    </td>
                                    <td className="p-3 text-center" onClick={() => setViewingOrder(group)}>
                                        <span className="bg-gray-200 text-xs px-2 py-1 rounded-full">{group.itemCount}</span>
                                    </td>
                                    <td className="p-3" onClick={() => setViewingOrder(group)}>
                                        {group.info.DriverName ? (
                                            <span className="bg-indigo-100 text-indigo-800 text-xs font-bold px-2 py-1 rounded">
                                                {group.info.DriverName}
                                            </span>
                                        ) : (
                                            <span className="text-gray-300 text-xs italic">Unassigned</span>
                                        )}
                                    </td>
                                    <td className="p-3 text-center" onClick={() => setViewingOrder(group)}>
                                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                                            group.info.Status === 'Completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                                        }`}>
                                            {group.info.Status || 'Pending'}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>

        {/* --- ORDER DETAIL MODAL --- */}
        {viewingOrder && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                    
                    {/* MODAL HEADER */}
                    <div className="p-6 border-b flex justify-between items-center bg-gray-50">
                        <div>
                            <h3 className="text-2xl font-bold text-gray-800">
                                {isEditing ? 'Editing Order' : 'Order Details'}
                            </h3>
                            <p className="text-gray-500 text-sm">
                                {viewingOrder.info.DONumber} • {viewingOrder.info["Delivery Date"]}
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            {!isEditing && (
                                <button 
                                    onClick={handleEditClick}
                                    className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded font-bold shadow"
                                >
                                    ✏️ Edit Order
                                </button>
                            )}
                            <button 
                                onClick={() => { setViewingOrder(null); setIsEditing(false); }}
                                className="text-gray-400 hover:text-red-500 font-bold text-2xl px-2"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                    
                    {/* MODAL BODY */}
                    <div className="p-6 overflow-y-auto flex-1">
                        
                        {/* READ-ONLY INFO (Customer) */}
                        <div className="grid grid-cols-3 gap-4 mb-6 text-sm bg-blue-50 p-4 rounded border border-blue-100">
                            <div>
                                <p className="text-gray-500 uppercase text-xs font-bold">Customer</p>
                                <p className="font-bold text-gray-800">{viewingOrder.info["Customer Name"]}</p>
                            </div>
                            <div>
                                <p className="text-gray-500 uppercase text-xs font-bold">Driver</p>
                                <p className="font-bold text-gray-800">{viewingOrder.info.DriverName || "Unassigned"}</p>
                            </div>
                            <div>
                                <p className="text-gray-500 uppercase text-xs font-bold">Contact</p>
                                <p className="text-gray-800">{viewingOrder.info["Contact Number"]}</p>
                            </div>
                            <div className="col-span-3">
                                <p className="text-gray-500 uppercase text-xs font-bold">Address</p>
                                <p className="text-gray-800">{viewingOrder.info["Delivery Address"]}</p>
                            </div>
                        </div>

                        {/* EDIT MODE: ADD ITEM SEARCH */}
                        {isEditing && (
                            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded">
                                <label className="block text-xs font-bold text-green-800 uppercase mb-2">Add Item to Order</label>
                                <div className="relative">
                                    <input 
                                        type="text"
                                        placeholder="Search product to add..."
                                        className="w-full p-2 border rounded"
                                        value={itemSearchTerm}
                                        onChange={e => setItemSearchTerm(e.target.value)}
                                    />
                                    {itemSearchTerm && (
                                        <div className="absolute z-10 w-full bg-white border shadow-lg max-h-40 overflow-y-auto mt-1">
                                            {filteredProducts.map(p => (
                                                <div 
                                                    key={p.ProductCode} 
                                                    onClick={() => handleAddItem(p)}
                                                    className="p-2 hover:bg-green-100 cursor-pointer flex justify-between"
                                                >
                                                    <span className="font-bold">{p.ProductName}</span>
                                                    <span className="text-xs text-gray-500">{p.ProductCode}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ITEMS TABLE */}
                        <h4 className="font-bold text-gray-700 mb-2">Items ({(isEditing ? editedItems : viewingOrder.items).length})</h4>
                        <table className="w-full text-sm border-collapse">
                            <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
                                <tr>
                                    <th className="p-3 text-left">Item</th>
                                    <th className="p-3 text-center w-20">Qty</th>
                                    <th className="p-3 text-center w-24">UOM</th>
                                    <th className="p-3 text-right w-24">Price</th>
                                    <th className="p-3 text-left">Notes</th>
                                    {isEditing && <th className="p-3 text-center w-10"></th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {(isEditing ? editedItems : viewingOrder.items).map((item, i) => (
                                    <tr key={item.id || item.tempId || i} className="hover:bg-gray-50">
                                        
                                        {/* Product Name */}
                                        <td className="p-3">
                                            <div className="font-medium text-gray-800">{item["Order Items"]}</div>
                                            <div className="text-xs text-gray-400">{item["Product Code"]}</div>
                                        </td>

                                        {/* Quantity */}
                                        <td className="p-3 text-center">
                                            {isEditing ? (
                                                <input 
                                                    type="number" 
                                                    className="w-16 p-1 border rounded text-center"
                                                    value={item.Quantity}
                                                    onChange={(e) => handleEditItemChange(i, 'Quantity', e.target.value)}
                                                />
                                            ) : (
                                                <span className="font-bold">{item["Quantity"]}</span>
                                            )}
                                        </td>

                                        {/* UOM */}
                                        <td className="p-3 text-center">
                                            {isEditing ? (
                                                <select 
                                                    className="w-20 p-1 border rounded text-xs"
                                                    value={item.UOM}
                                                    onChange={(e) => handleEditItemChange(i, 'UOM', e.target.value)}
                                                >
                                                    {getUOMOptions(item["Product Code"]).length > 0 
                                                        ? getUOMOptions(item["Product Code"]).map(u => <option key={u} value={u}>{u}</option>)
                                                        : <option value={item.UOM}>{item.UOM}</option>
                                                    }
                                                </select>
                                            ) : (
                                                <span className="text-xs uppercase bg-gray-200 px-2 py-1 rounded">{item["UOM"]}</span>
                                            )}
                                        </td>

                                        {/* Price */}
                                        <td className="p-3 text-right">
                                            {isEditing ? (
                                                <input 
                                                    type="number" 
                                                    className="w-20 p-1 border rounded text-right"
                                                    value={item.Price}
                                                    onChange={(e) => handleEditItemChange(i, 'Price', e.target.value)}
                                                />
                                            ) : (
                                                item.Price || '-'
                                            )}
                                        </td>

                                        {/* Notes */}
                                        <td className="p-3">
                                            {isEditing ? (
                                                <input 
                                                    type="text" 
                                                    className="w-full p-1 border rounded text-xs"
                                                    value={item.SpecialNotes || ''}
                                                    onChange={(e) => handleEditItemChange(i, 'SpecialNotes', e.target.value)}
                                                />
                                            ) : (
                                                <span className="text-xs italic text-gray-500">{item.SpecialNotes}</span>
                                            )}
                                        </td>

                                        {/* Delete Action */}
                                        {isEditing && (
                                            <td className="p-3 text-center">
                                                <button 
                                                    onClick={() => handleDeleteItem(i)}
                                                    className="text-red-500 hover:text-red-700 font-bold"
                                                    title="Remove Item"
                                                >
                                                    🗑️
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* MODAL FOOTER */}
                    <div className="p-4 border-t bg-gray-100 flex justify-end gap-3">
                        {isEditing ? (
                            <>
                                <button 
                                    onClick={handleCancelEdit}
                                    className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded font-bold"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={handleSaveOrder}
                                    className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-bold shadow"
                                >
                                    Save Changes
                                </button>
                            </>
                        ) : (
                            <button 
                                onClick={() => window.open(`/orders/${viewingOrder.info.id}/print`, '_blank')}
                                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold flex items-center gap-2"
                            >
                                <span>🖨️</span> Print DO
                            </button>
                        )}
                    </div>
                </div>
            </div>
        )}

      </main>
    </div>
  );
}