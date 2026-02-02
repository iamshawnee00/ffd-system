'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import Sidebar from '../components/Sidebar';

export default function DeliveryPage() {
  const [loading, setLoading] = useState(true);
  
  // --- DATE HELPERS (String Based to avoid Timezone Issues) ---
  const getTodayString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDateLabel = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // --- STATE ---
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  const [orderCounts, setOrderCounts] = useState({}); 

  // Data for the Selected Date
  const [groupedOrders, setGroupedOrders] = useState([]); 
  const [usageSummary, setUsageSummary] = useState([]);
  
  // Products & Drivers
  const [products, setProducts] = useState([]);
  const [targetDriver, setTargetDriver] = useState('');
  const [selectedDOs, setSelectedDOs] = useState(new Set());
  const [isUsageExpanded, setIsUsageExpanded] = useState(false);

  // Modal State (View/Edit)
  const [viewingOrder, setViewingOrder] = useState(null); 
  const [isEditing, setIsEditing] = useState(false);
  const [editedItems, setEditedItems] = useState([]);
  const [deletedItemIds, setDeletedItemIds] = useState([]);
  const [itemSearchTerm, setItemSearchTerm] = useState('');

  // --- 1. INITIAL LOAD ---
  useEffect(() => {
    fetchMonthData(currentDate);
    fetchProducts();
  }, [currentDate]);

  useEffect(() => {
    fetchDayOrders(selectedDate);
  }, [selectedDate]);

  const fetchProducts = async () => {
    const { data } = await supabase
      .from('ProductMaster')
      .select('ProductCode, ProductName, AllowedUOMs, BaseUOM, Category');
    if (data) setProducts(data);
  };

  // --- 2. DATA FETCHING ---
  
  const fetchMonthData = async (dateObj) => {
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth();
    
    // Calculate start (1st of month) and end (1st of next month)
    const startStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    // Careful month increment
    const nextMonth = new Date(year, month + 1, 1);
    const endStr = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;

    const { data } = await supabase
      .from('Orders')
      .select('DONumber, "Delivery Date"')
      .gte('"Delivery Date"', startStr)
      .lt('"Delivery Date"', endStr)
      .limit(50000); 

    if (data) {
      const counts = {};
      const uniqueSet = new Set();
      
      data.forEach(row => {
        if (!row["Delivery Date"]) return;
        const key = `${row["Delivery Date"]}|${row.DONumber}`;
        
        if (!uniqueSet.has(key)) {
          uniqueSet.add(key);
          // Extract YYYY-MM-DD safely
          let dKey = row["Delivery Date"];
          if (typeof dKey === 'string') dKey = dKey.substring(0, 10);
          
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
      // Group by DO
      if (!groups[row.DONumber]) {
        groups[row.DONumber] = {
          info: row,
          items: [],
          itemCount: 0
        };
      }
      groups[row.DONumber].items.push(row);
      groups[row.DONumber].itemCount += 1;

      // Usage
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

  // --- 4. CALENDAR LOGIC ---

  const changeMonth = (offset) => {
    const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1);
    setCurrentDate(newDate);
  };

  const monthNames = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

  const generateCalendarGrid = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayObj = new Date(year, month, 1);
    const startDay = firstDayObj.getDay(); // 0 = Sunday, 1 = Monday...

    const grid = [];
    
    // Empty slots for days before the 1st
    for (let i = 0; i < startDay; i++) {
      grid.push(null);
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      grid.push({
        day,
        dateStr,
        count: orderCounts[dateStr] || 0
      });
    }

    return grid;
  };

  const gridCells = generateCalendarGrid();

  // --- STYLING HELPERS ---
  
  const getCellClasses = (count, isSelected) => {
    let base = "h-24 rounded-xl border p-2 flex flex-col justify-between cursor-pointer transition-all duration-200 relative overflow-hidden group ";
    
    if (isSelected) {
      base += "ring-4 ring-blue-400 border-blue-600 z-10 shadow-lg transform -translate-y-1 ";
    } else {
      base += "hover:shadow-md hover:border-blue-300 ";
    }

    if (count > 30) return base + "bg-emerald-50 border-emerald-200";
    if (count > 10) return base + "bg-orange-50 border-orange-200";
    if (count > 0) return base + "bg-red-50 border-red-200";
    
    return base + "bg-white border-gray-200";
  };

  const getPillClasses = (count) => {
    if (count > 30) return "bg-emerald-200 text-emerald-800";
    if (count > 10) return "bg-orange-200 text-orange-800";
    return "bg-red-200 text-red-800";
  };

  const getFilteredProducts = () => {
    if (!itemSearchTerm) return [];
    const term = itemSearchTerm.toLowerCase();
    return products.filter(p => 
      p.ProductName.toLowerCase().includes(term) || 
      p.ProductCode.toLowerCase().includes(term)
    ).slice(0, 10);
  };

  return (
    <div className="flex bg-gray-50 min-h-screen font-sans">
      <Sidebar />
      <main className="ml-64 flex-1 p-8">
        
        {/* HEADER & ACTIONS */}
        <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-4">
               <button onClick={() => changeMonth(-1)} className="w-10 h-10 flex items-center justify-center bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 font-bold transition">◀</button>
               <h2 className="text-2xl font-black text-gray-800 uppercase tracking-widest">
                  {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
               </h2>
               <button onClick={() => changeMonth(1)} className="w-10 h-10 flex items-center justify-center bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 font-bold transition">▶</button>
            </div>
            
            <div className="flex gap-2">
                 <button onClick={() => window.open(`/reports/batch-do?date=${selectedDate}`, '_blank')} className="bg-purple-600 text-white font-bold py-2.5 px-5 rounded-xl text-sm shadow hover:bg-purple-700 transition flex items-center gap-2">
                    <span>📦</span> All DOs
                 </button>
                 <button className="bg-blue-600 text-white font-bold py-2.5 px-5 rounded-xl text-sm shadow hover:bg-blue-700 transition flex items-center gap-2">
                    <span>📊</span> Daily Usage
                 </button>
            </div>
        </div>

        {/* CALENDAR GRID */}
        <div className="mb-8">
            <div className="grid grid-cols-7 gap-4 mb-3 text-center text-xs font-black text-gray-400 uppercase tracking-widest">
               <div>SUN</div><div>MON</div><div>TUE</div><div>WED</div><div>THU</div><div>FRI</div><div>SAT</div>
            </div>
            <div className="grid grid-cols-7 gap-3">
               {gridCells.map((cell, idx) => {
                  if (!cell) return <div key={idx} className="h-24 bg-transparent"></div>;
                  
                  const isSelected = cell.dateStr === selectedDate;
                  
                  return (
                    <div 
                        key={cell.dateStr} 
                        onClick={() => setSelectedDate(cell.dateStr)}
                        className={getCellClasses(cell.count, isSelected)}
                    >
                        <div className={`text-lg font-bold ml-1 ${isSelected ? 'text-blue-700' : 'text-gray-700'}`}>
                            {cell.day}
                        </div>
                        {cell.count > 0 && (
                            <div className={`w-full text-center py-1 rounded-lg text-[10px] font-black uppercase tracking-wide ${getPillClasses(cell.count)}`}>
                                {cell.count} Orders
                            </div>
                        )}
                    </div>
                  );
               })}
            </div>
        </div>

        {/* ORDERS LIST SECTION */}
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h3 className="text-xl font-bold text-gray-800 flex items-center gap-3">
                    Orders for {formatDateLabel(selectedDate)}
                    <span className="bg-gray-200 text-gray-600 text-sm px-3 py-1 rounded-full">{groupedOrders.length}</span>
                </h3>
                
                {/* Driver Assignment */}
                <div className="flex gap-2">
                    <input 
                        list="drivers" 
                        placeholder="Assign Driver..." 
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-48"
                        value={targetDriver}
                        onChange={e => setTargetDriver(e.target.value)}
                    />
                    <datalist id="drivers">
                        <option value="Ali" /><option value="Muthu" /><option value="Ah Meng" /><option value="Lalamove" />
                    </datalist>
                    <button 
                        onClick={handleAssignDriver}
                        className="bg-blue-600 text-white font-bold px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
                    >
                        Assign ({selectedDOs.size})
                    </button>
                </div>
            </div>

            {/* EXPANDABLE USAGE SUMMARY */}
            <div className="border-b border-gray-100">
                <button 
                    onClick={() => setIsUsageExpanded(!isUsageExpanded)}
                    className="w-full flex justify-between items-center px-6 py-3 text-purple-700 font-bold bg-purple-50 hover:bg-purple-100 transition text-sm"
                >
                    <span className="flex items-center gap-2">📋 View Daily Production Usage Summary</span>
                    <span>{isUsageExpanded ? '▲' : '▼'}</span>
                </button>
                {isUsageExpanded && (
                    <div className="max-h-60 overflow-y-auto p-4 bg-gray-50 border-t border-purple-100">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-2 text-sm">
                            {usageSummary.map((u, i) => (
                                <div key={i} className="flex justify-between border-b border-purple-200 pb-1">
                                    <span className="text-gray-700">{u.name}</span>
                                    <span className="font-bold text-purple-800">{u.qty} {u.uom}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* ORDER TABLE */}
            <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 text-gray-500 text-xs font-bold uppercase tracking-wider">
                    <tr>
                        <th className="p-4 w-10 text-center"><input type="checkbox" onChange={handleSelectAll} checked={selectedDOs.size > 0 && selectedDOs.size === groupedOrders.length} /></th>
                        <th className="p-4">DO Details</th>
                        <th className="p-4">Customer</th>
                        <th className="p-4">Delivery Info</th>
                        <th className="p-4 text-center">Items</th>
                        <th className="p-4">Driver</th>
                        <th className="p-4 text-right">Action</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {groupedOrders.length === 0 ? (
                        <tr><td colSpan="7" className="p-12 text-center text-gray-400 italic">No orders found.</td></tr>
                    ) : (
                        groupedOrders.map(group => (
                            <tr key={group.info.DONumber} className="hover:bg-blue-50/40 transition-colors group">
                                <td className="p-4 text-center">
                                    <input 
                                        type="checkbox" 
                                        checked={selectedDOs.has(group.info.DONumber)} 
                                        onChange={() => handleCheckbox(group.info.DONumber)} 
                                    />
                                </td>
                                <td className="p-4">
                                    <span className="font-mono text-xs font-bold text-green-700 bg-green-100 px-2 py-1 rounded">
                                        {group.info.DONumber}
                                    </span>
                                </td>
                                <td className="p-4">
                                    <div className="font-bold text-gray-800 text-sm">{group.info["Customer Name"]}</div>
                                    <div className="text-xs text-gray-500">{group.info["Contact Person"]}</div>
                                </td>
                                <td className="p-4">
                                    <div className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded w-fit font-bold mb-1">
                                        {group.info["Delivery Mode"] || 'Standard'}
                                    </div>
                                    <div className="text-xs text-gray-500 truncate max-w-[200px]" title={group.info["Delivery Address"]}>
                                        {group.info["Delivery Address"]}
                                    </div>
                                </td>
                                <td className="p-4 text-center">
                                    <span className="bg-gray-100 text-gray-700 text-xs font-bold px-3 py-1 rounded-full">{group.itemCount}</span>
                                </td>
                                <td className="p-4">
                                    {group.info.DriverName ? (
                                        <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-1 rounded">
                                            {group.info.DriverName}
                                        </span>
                                    ) : (
                                        <span className="text-gray-300 text-xs italic">--</span>
                                    )}
                                </td>
                                <td className="p-4 text-right">
                                    <button 
                                        onClick={() => setViewingOrder(group)} 
                                        className="text-gray-400 hover:text-blue-600 p-2 rounded-lg hover:bg-blue-50 transition"
                                    >
                                        👁️ View
                                    </button>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>

      </main>
    </div>
  );
}