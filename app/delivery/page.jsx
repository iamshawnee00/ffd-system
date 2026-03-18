'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { 
  PencilSquareIcon,
  TrashIcon,
  PrinterIcon,
  TruckIcon,
  XMarkIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
  CheckIcon,
  MinusIcon,
  PlusIcon,
  ChevronUpIcon,
  ChevronDownIcon
} from '@heroicons/react/24/outline';

// --- STATUS HELPERS ---
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
  const [currentDate, setCurrentDate] = useState(new Date()); 
  const [selectedDate, setSelectedDate] = useState(toLocalISOString(new Date()));
  const [orderCounts, setOrderCounts] = useState({}); 
  const [calendarDays, setCalendarDays] = useState([]);

  const [groupedOrders, setGroupedOrders] = useState([]); 
  const [filteredGroupedOrders, setFilteredGroupedOrders] = useState([]); 
  
  // Data Masterlists
  const [products, setProducts] = useState([]);
  const [conversions, setConversions] = useState([]);
  const [customers, setCustomers] = useState([]); 

  const [selectedDOs, setSelectedDOs] = useState(new Set());
  const [isUsageExpanded, setIsUsageExpanded] = useState(false);
  const [isBulkSending, setIsBulkSending] = useState(false); 
  const [isSyncing, setIsSyncing] = useState(false); 

  // Search State
  const [searchTerm, setSearchTerm] = useState('');

  // Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null); 
  const [editingItems, setEditingItems] = useState([]); 
  const [deletedItemIds, setDeletedItemIds] = useState([]);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  
  // Bulk Edit State
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [bulkEditData, setBulkEditData] = useState({ deliveryDate: '', deliveryMode: '', status: '', driverName: '' });

  // --- 1. INITIAL LOAD ---
  useEffect(() => {
    fetchProducts();
    fetchCustomers();
  }, []);

  useEffect(() => {
    fetchCalendarData();
  }, [currentDate]);

  useEffect(() => {
    fetchDayOrders(selectedDate);
    setSelectedDOs(new Set()); 

    const channel = supabase
      .channel('realtime_delivery_status')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'Orders' }, () => {
          fetchDayOrders(selectedDate); 
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedDate]);

  useEffect(() => {
    if (!searchTerm) {
        setFilteredGroupedOrders(groupedOrders);
        return;
    }
    const lowerTerm = searchTerm.toLowerCase();
    const filtered = groupedOrders.filter(group => {
        if (group.info["Customer Name"].toLowerCase().includes(lowerTerm)) return true;
        if (group.info.DONumber.toLowerCase().includes(lowerTerm)) return true;
        return group.items.some(item => item["Order Items"].toLowerCase().includes(lowerTerm));
    });
    setFilteredGroupedOrders(filtered);
  }, [searchTerm, groupedOrders]);

  const fetchProducts = async () => {
    const { data } = await supabase
      .from('ProductMaster')
      .select('ProductCode, ProductName, AllowedUOMs, BaseUOM, SalesUOM, Category');
    if (data) setProducts(data);

    const { data: convData } = await supabase
      .from('UOM_Conversions')
      .select('*');
    if (convData) setConversions(convData);
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

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    
    const startDayOfWeek = firstDayOfMonth.getDay(); 
    
    const daysArr = [];
    for (let i = 0; i < startDayOfWeek; i++) {
        daysArr.push(null);
    }
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
        if (typeof dKey === 'string' && dKey.length >= 10) dKey = dKey.substring(0, 10);
        else if (dKey instanceof Date) dKey = toLocalISOString(dKey);

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
      .order('Timestamp', {ascending: true});

    if (!error && data) {
      processOrders(data);
    } else {
      setGroupedOrders([]);
    }
    setLoading(false);
  };

  const processOrders = (rows) => {
    const groups = {};
    rows.forEach(row => {
      if (!groups[row.DONumber]) {
        groups[row.DONumber] = {
          info: row,
          items: [],
          itemCount: 0
        };
      } else {
          const currentRaw = getRawStatus(groups[row.DONumber].info);
          const newRaw = getRawStatus(row);
          const currentMapped = formatDisplayStatus(currentRaw);
          const newMapped = formatDisplayStatus(newRaw);
          const statusPriority = { 'FAILED': 0, 'PENDING': 1, 'ASSIGNED': 2, 'IN TRANSIT': 3, 'DELIVERED': 4 };
          
          if (statusPriority[newMapped] > statusPriority[currentMapped]) {
              groups[row.DONumber].info.Status = newRaw;
          }
      }
      groups[row.DONumber].items.push(row);
      groups[row.DONumber].itemCount += 1;
    });
    const groupsArray = Object.values(groups);
    setGroupedOrders(groupsArray);
    setFilteredGroupedOrders(groupsArray); 
  };

  // --- SMART USAGE SUMMARY CALCULATION (UOM AWARE) ---
  const usageSummary = useMemo(() => {
      if (!products.length) return []; // Need product data to do conversions

      const usage = {};
      groupedOrders.forEach(group => {
          group.items.forEach(row => {
              const prodKey = row["Product Code"];
              const fallbackName = row["Order Items"];
              const orderUOM = (row.UOM || '').toUpperCase().trim();
              const qty = Number(row.Quantity || 0);

              const prod = products.find(p => p.ProductCode === prodKey);
              const baseUOM = (prod?.BaseUOM || orderUOM).toUpperCase().trim();
              const salesUOM = (prod?.SalesUOM || baseUOM).toUpperCase().trim();

              // 1. Convert everything to Base UOM
              let baseQty = qty;
              if (orderUOM !== baseUOM) {
                  const conv = conversions.find(c => c.ProductCode === prodKey && c.ConversionUOM?.toUpperCase().trim() === orderUOM);
                  if (conv && Number(conv.Factor) > 0) {
                      baseQty = qty * Number(conv.Factor);
                  }
              }

              const mapKey = prodKey || fallbackName;

              if (!usage[mapKey]) {
                  usage[mapKey] = {
                      code: prodKey,
                      name: fallbackName,
                      baseQtyTotal: 0,
                      salesUOM: salesUOM,
                      baseUOM: baseUOM
                  };
              }
              usage[mapKey].baseQtyTotal += baseQty;
          });
      });

      // 2. Convert from Base UOM into the final Sales UOM for the UI summary
      return Object.values(usage).map(u => {
          let displayQty = u.baseQtyTotal;
          if (u.salesUOM !== u.baseUOM) {
              const conv = conversions.find(c => c.ProductCode === u.code && c.ConversionUOM?.toUpperCase().trim() === u.salesUOM);
              if (conv && Number(conv.Factor) > 0) {
                  displayQty = u.baseQtyTotal / Number(conv.Factor);
              }
          }
          return {
              name: u.name,
              qty: Number(displayQty % 1 !== 0 ? displayQty.toFixed(2) : displayQty),
              uom: u.salesUOM
          };
      }).sort((a,b) => a.name.localeCompare(b.name));
  }, [groupedOrders, products, conversions]);

  // --- 3. ACTIONS ---
  const handleCheckbox = (doNum) => {
    const newSet = new Set(selectedDOs);
    if (newSet.has(doNum)) newSet.delete(doNum);
    else newSet.add(doNum);
    setSelectedDOs(newSet);
  };

  const handleSelectAll = () => {
    if (selectedDOs.size === filteredGroupedOrders.length) {
      setSelectedDOs(new Set());
    } else {
      setSelectedDOs(new Set(filteredGroupedOrders.map(o => o.info.DONumber)));
    }
  };

  const handleDeleteDO = async (doNumber) => {
    if (!confirm(`Delete entire order ${doNumber}?`)) return;
    const { error } = await supabase.from('Orders').delete().eq('DONumber', doNumber);
    if (!error) {
        setSelectedDOs(prev => {
            const newSet = new Set(prev);
            newSet.delete(doNumber);
            return newSet;
        });
        fetchDayOrders(selectedDate);
        fetchCalendarData();
    }
  };

  const handlePrintOrder = (doNumber) => {
      localStorage.setItem('print_do_target', doNumber);
      window.open(`/orders/print#${doNumber}`, '_blank');
  };

  // FRONTEND ONLY: Send to Shipday
  const handleSendToShipday = async (group) => {
      const doNumber = group.info.DONumber;
      if (!confirm(`Push order ${doNumber} to Shipday delivery?`)) return;
      try {
          const apiKey = process.env.NEXT_PUBLIC_SHIPDAY_API_KEY;
          if (!apiKey) return alert("Missing NEXT_PUBLIC_SHIPDAY_API_KEY in your .env.local file.");

          const shipdayPayload = {
              orderNumber: group.info.DONumber,
              customerName: group.info["Customer Name"],
              customerAddress: group.info["Delivery Address"],
              customerPhoneNumber: group.info["Contact Number"] || "",
              restaurantName: "Fresher Farm Direct",
              restaurantAddress: "Lot 18 & 19, Kompleks Selayang, Batu 8-1/2, Jalan Ipoh, 68100 Batu Caves, Selangor",
              orderItem: group.items.map(item => ({
                  name: item["Order Items"],
                  unitPrice: Number(item.Price || 0),
                  quantity: Number(item.Quantity || 0)
              })),
              totalOrderCost: group.items.reduce((sum, item) => sum + (Number(item.Price || 0) * Number(item.Quantity || 0)), 0),
              orderItemsText: group.items.map(item => `${item.Quantity} ${item.UOM} x ${item["Order Items"]}`).join(', ')
          };

          const res = await fetch('https://api.shipday.com/orders', {
              method: 'POST',
              headers: {
                  'Authorization': `Basic ${apiKey}`,
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify(shipdayPayload)
          });
          
          if (res.ok) {
              alert(`Success! Sent ${doNumber} to Shipday.`);
          } else {
              const result = await res.json();
              alert(`Failed to send ${doNumber} to Shipday. Message: ${result.message || 'Unknown error'}`);
          }
      } catch (err) {
          alert("Server connection error.");
      }
  };

  const handleBulkDelete = async () => {
      if (!confirm(`Are you sure you want to permanently delete ${selectedDOs.size} selected orders?`)) return;
      const doNumbers = Array.from(selectedDOs);
      const { error } = await supabase.from('Orders').delete().in('DONumber', doNumbers);
      if (!error) {
          setSelectedDOs(new Set());
          fetchDayOrders(selectedDate);
          fetchCalendarData();
      } else {
          alert("Error deleting orders: " + error.message);
      }
  };

  const handleBulkPrint = () => {
      const doNumbers = Array.from(selectedDOs).join(',');
      window.open(`/reports/batch-do?date=${selectedDate}&dos=${doNumbers}`, '_blank');
  };

  const handleBulkEditSave = async () => {
      const updates = {};
      if (bulkEditData.deliveryDate) updates["Delivery Date"] = bulkEditData.deliveryDate;
      if (bulkEditData.deliveryMode) updates["Delivery Mode"] = bulkEditData.deliveryMode;
      if (bulkEditData.status) updates["Status"] = bulkEditData.status;
      if (bulkEditData.driverName) updates["DriverName"] = bulkEditData.driverName;

      if (Object.keys(updates).length === 0) {
          alert("No fields to update.");
          return;
      }
      
      if (!confirm(`Apply changes to ${selectedDOs.size} orders?`)) return;

      const { error } = await supabase.from('Orders').update(updates).in('DONumber', Array.from(selectedDOs));
      if (error) {
          alert("Bulk Edit Error: " + error.message);
      } else {
          alert("Bulk update successful!");
          setIsBulkEditOpen(false);
          setSelectedDOs(new Set());
          setBulkEditData({ deliveryDate: '', deliveryMode: '', status: '', driverName: '' });
          fetchDayOrders(selectedDate);
          if (updates["Delivery Date"]) fetchCalendarData(); 
      }
  };

  // FRONTEND ONLY: Bulk send to Shipday
  const sendSelectedToShipday = async () => {
    if (selectedDOs.size === 0) return alert("Select orders to send.");
    if (!confirm(`Send ${selectedDOs.size} orders to Shipday?`)) return;

    setIsBulkSending(true);
    let successCount = 0;
    const doNumbers = Array.from(selectedDOs);
    const apiKey = process.env.NEXT_PUBLIC_SHIPDAY_API_KEY;

    if (!apiKey) {
        alert("Missing NEXT_PUBLIC_SHIPDAY_API_KEY in your .env.local file.");
        setIsBulkSending(false);
        return;
    }

    for (const doNum of doNumbers) {
      const group = groupedOrders.find(g => g.info.DONumber === doNum);
      if (!group) continue;

      try {
          const shipdayPayload = {
              orderNumber: group.info.DONumber,
              customerName: group.info["Customer Name"],
              customerAddress: group.info["Delivery Address"],
              customerPhoneNumber: group.info["Contact Number"] || "",
              restaurantName: "Fresher Farm Direct",
              restaurantAddress: "Lot 18 & 19, Kompleks Selayang, Batu 8-1/2, Jalan Ipoh, 68100 Batu Caves, Selangor",
              orderItem: group.items.map(item => ({
                  name: item["Order Items"],
                  unitPrice: Number(item.Price || 0),
                  quantity: Number(item.Quantity || 0)
              })),
              totalOrderCost: group.items.reduce((sum, item) => sum + (Number(item.Price || 0) * Number(item.Quantity || 0)), 0),
              orderItemsText: group.items.map(item => `${item.Quantity} ${item.UOM} x ${item["Order Items"]}`).join(', ')
          };

          const res = await fetch('https://api.shipday.com/orders', {
              method: 'POST',
              headers: {
                  'Authorization': `Basic ${apiKey}`,
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify(shipdayPayload)
          });
          
          if (res.ok) successCount++;
      } catch (err) {
          console.error(`Exception sending ${doNum}:`, err);
      }
    }

    setIsBulkSending(false);
    alert(`Completed push. Successful: ${successCount} / ${selectedDOs.size}`);
  };

  // FRONTEND ONLY: Pull Drivers and Statuses from Shipday directly
  const syncWithShipday = async () => {
    setIsSyncing(true);
    try {
        const apiKey = process.env.NEXT_PUBLIC_SHIPDAY_API_KEY;
        if (!apiKey) {
            alert("Please set NEXT_PUBLIC_SHIPDAY_API_KEY in your .env.local file.");
            setIsSyncing(false);
            return;
        }

        const headers = {
            'Authorization': `Basic ${apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        // 1. Fetch Completed Orders (Last 48 hours) to catch ALREADY_DELIVERED statuses
        const endTime = new Date().toISOString();
        const startTime = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        
        const completedRes = await fetch('https://api.shipday.com/orders/query', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                startTime,
                endTime,
                orderStatus: 'ALREADY_DELIVERED'
            })
        });

        // 2. Fetch Active Orders
        const activeRes = await fetch('https://api.shipday.com/orders', {
            method: 'GET',
            headers
        });

        if (!activeRes.ok && !completedRes.ok) {
             throw new Error("Failed to connect to Shipday API.");
        }

        const completedOrders = completedRes.ok ? await completedRes.json() : [];
        const activeOrders = activeRes.ok ? await activeRes.json() : [];

        // Combine both lists
        const allShipdayOrders = [...completedOrders, ...activeOrders];

        // 3. Create a map of Shipday orders for lightning-fast cross-referencing
        const shipdayMap = {};
        allShipdayOrders.forEach(sOrder => {
            const doNum = sOrder.orderNumber || sOrder.order_number;
            if (doNum) shipdayMap[doNum] = sOrder;
        });

        let updateCount = 0;

        // 4. Cross-reference ONLY the DOs currently on your screen (groupedOrders)
        // This instantly catches deletions and unassignments!
        for (const group of groupedOrders) {
            const doNum = group.info.DONumber;
            const sOrder = shipdayMap[doNum];
            
            let newDriver = group.info.DriverName || "";
            let newStatus = getRawStatus(group.info);

            if (sOrder) {
                // Order exists in Shipday: Pull the exact driver and status
                newDriver = sOrder.assignedCarrier?.name || sOrder.carrier?.name || "";
                newStatus = sOrder.status || sOrder.orderStatus?.orderState || 'PENDING';
            } else {
                // Order is MISSING from Shipday (Deleted or Never Sent)
                // If it currently has a driver in our system, we MUST unassign it
                if (group.info.DriverName && group.info.DriverName.trim() !== '') {
                    newDriver = "";
                    newStatus = "PENDING";
                } else {
                    continue; // No change needed, skip to save DB calls
                }
            }

            // Normalize strings to compare if an update is actually required
            const safeNewDriver = newDriver.trim();
            const safeOldDriver = (group.info.DriverName || "").trim();
            const safeNewStatus = newStatus.toUpperCase().trim();
            const safeOldStatus = (group.info.Status || "").toUpperCase().trim();

            // Only update the database if the data has actually changed
            if (safeNewDriver !== safeOldDriver || safeNewStatus !== safeOldStatus) {
                const { error } = await supabase
                    .from('Orders')
                    .update({ 
                        Status: safeNewStatus, 
                        DriverName: safeNewDriver 
                    })
                    .eq('DONumber', doNum);
                
                if (!error) updateCount++;
            }
        }

        alert(`Sync Complete! Updated ${updateCount} orders on this date.`);
        fetchDayOrders(selectedDate); // Refresh UI
    } catch (e) {
        console.error("Sync Error:", e);
        alert("Sync error: " + e.message);
    } finally {
        setIsSyncing(false);
    }
  };

  // --- EDIT MODAL HANDLERS ---
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
          if (deletedItemIds.length > 0) {
              await supabase.from('Orders').delete().in('id', deletedItemIds);
          }

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
                  "Customer Name": editingOrder["Customer Name"],
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
              fetchDayOrders(selectedDate);
          } else {
              alert("Error saving: " + (res1.error?.message || res2.error?.message));
          }
      } catch(e) {
          console.error(e);
      }
  };

  const changeMonth = (offset) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + offset);
    setCurrentDate(newDate);
  };
  
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const getCellClasses = (count, isSelected) => {
    let base = "h-20 sm:h-28 rounded-2xl border p-2 sm:p-3 cursor-pointer flex flex-col justify-between transition-all duration-200 relative overflow-hidden group min-w-[64px] sm:min-w-0 snap-center shrink-0 sm:shrink ";
    if (isSelected) base += "ring-2 sm:ring-4 ring-blue-400 border-blue-600 z-10 shadow-lg sm:shadow-xl transform sm:-translate-y-1 ";
    else base += "hover:shadow-md hover:border-blue-300 hover:-translate-y-0.5 ";
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

  const getDeliveryModeStyle = (mode) => {
      if (!mode) return 'bg-purple-100 text-purple-700 border-purple-200'; 
      const m = mode.toLowerCase();
      if (m.includes('lalamove')) return 'bg-orange-100 text-orange-800 border-orange-200';
      if (m.includes('pick') || m.includes('self')) return 'bg-blue-100 text-blue-800 border-blue-200';
      return 'bg-purple-100 text-purple-700 border-purple-200'; 
  };

  return (
    <div className="p-3 md:p-8 max-w-full overflow-x-clip min-h-screen bg-gray-50/50 pb-32">
      
      {/* HEADER & ACTIONS */}
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
             <h1 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight">Delivery Dashboard</h1>
             <p className="text-[10px] md:text-xs text-gray-400 font-bold uppercase mt-1">Manage delivery schedule and drivers</p>
          </div>
          
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 w-full sm:w-auto">
             <button onClick={syncWithShipday} disabled={isSyncing} className="flex-1 sm:flex-none bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-black py-2 px-4 rounded-full text-[10px] md:text-xs uppercase tracking-widest border border-indigo-200 shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50">
                <ArrowPathIcon className={`w-3 h-3 md:w-4 md:h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'SYNCING...' : 'SYNC SHIPDAY'}</span>
             </button>
             <button onClick={() => window.open(`/reports/route?date=${selectedDate}`, '_blank')} className="flex-1 sm:flex-none bg-orange-500 hover:bg-orange-600 text-white font-black py-2 px-4 rounded-full text-[10px] md:text-xs uppercase tracking-widest shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2">
                <span>🗺️</span> <span className="hidden sm:inline">Route</span><span className="sm:hidden">Route</span>
             </button>
             <button onClick={() => window.open(`/reports/batch-do?date=${selectedDate}`, '_blank')} className="flex-1 sm:flex-none bg-purple-600 hover:bg-purple-700 text-white font-black py-2 px-4 rounded-full text-[10px] md:text-xs uppercase tracking-widest shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2">
                <span>📦</span> <span className="hidden sm:inline">All DOs</span><span className="sm:hidden">DOs</span>
             </button>
             <button onClick={() => window.open(`/reports/usage?date=${selectedDate}`, '_blank')} className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 text-white font-black py-2 px-4 rounded-full text-[10px] md:text-xs uppercase tracking-widest shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2">
                <span>📊</span> <span className="hidden sm:inline">Daily Usage</span><span className="sm:hidden">Usage</span>
             </button>
          </div>
      </div>

      {/* CALENDAR GRID */}
      <div className="mb-6 md:mb-8 bg-white p-5 rounded-[2rem] shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
              <button onClick={() => changeMonth(-1)} className="p-2 sm:p-3 bg-gray-50 rounded-xl sm:rounded-2xl hover:bg-gray-100 transition-colors">◀</button>
              <h2 className="font-black text-gray-800 uppercase tracking-widest text-sm md:text-base">
                  {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
              </h2>
              <button onClick={() => changeMonth(1)} className="p-2 sm:p-3 bg-gray-50 rounded-xl sm:rounded-2xl hover:bg-gray-100 transition-colors">▶</button>
          </div>
          <div className="hidden sm:grid grid-cols-7 gap-2 md:gap-4 mb-2 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest min-w-[600px]">
             <div>SUN</div><div>MON</div><div>TUE</div><div>WED</div><div>THU</div><div>FRI</div><div>SAT</div>
          </div>
          <div className="flex sm:grid sm:grid-cols-7 overflow-x-auto sm:overflow-visible gap-2 md:gap-3 pb-2 sm:pb-0 snap-x snap-mandatory custom-scrollbar">
             {calendarDays.map((day, idx) => {
                if (!day) return <div key={`empty-${idx}`} className="hidden sm:block h-20 md:h-24 bg-transparent"></div>;
                const count = orderCounts[day.dateStr] || 0;
                const isSelected = day.dateStr === selectedDate;
                return (
                  <div key={day.dateStr} onClick={() => setSelectedDate(day.dateStr)} className={getCellClasses(count, isSelected)}>
                      <div className="flex flex-col sm:flex-row sm:justify-between items-center sm:items-start text-center sm:text-left">
                          <span className="text-[9px] sm:text-[10px] font-bold uppercase opacity-60 tracking-wider mb-1 sm:mb-0">{day.dayName}</span>
                          <span className={`text-base sm:text-lg md:text-xl font-black ${isSelected ? 'text-blue-600' : ''}`}>{day.dayNum}</span>
                      </div>
                      {count > 0 ? (
                          <div className={`w-full text-center py-1 sm:py-1.5 rounded-lg text-[8px] sm:text-[9px] font-black uppercase tracking-wide mt-2 sm:mt-auto ${getPillClasses(count)}`}>
                              {count} <span className="hidden sm:inline">Orders</span>
                          </div>
                      ) : (
                          <div className="w-full text-center py-1 sm:py-1.5 rounded-lg text-[8px] sm:text-[9px] font-bold text-gray-400 bg-gray-50 mt-2 sm:mt-auto">None</div>
                      )}
                  </div>
                );
             })}
          </div>
      </div>

      {/* ORDERS LIST SECTION: Fixed Height Box to trigger internal scrolling ("slider"), made 50% longer */}
      <div className="bg-white rounded-[2rem] shadow-xl border border-gray-100 flex flex-col relative overflow-hidden h-[85vh] min-h-[750px]">
          <div className="p-5 md:p-6 border-b border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center bg-gray-50/50 gap-4 shrink-0">
              <h3 className="text-base md:text-lg font-black text-gray-800 flex items-center gap-3 uppercase tracking-tight">
                  Pipeline for <span className="text-blue-600">{formatDateLabel(selectedDate)}</span>
                  <span className="bg-gray-200 text-gray-600 text-[10px] md:text-xs px-2.5 py-1 rounded-full font-black">{filteredGroupedOrders.length}</span>
              </h3>
          </div>

          <div className="p-5 md:p-6 border-b border-gray-100 bg-white flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 shrink-0 z-10 relative">
              {/* Search */}
              <div className="relative w-full xl:w-96 shadow-sm rounded-2xl shrink-0">
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400"><MagnifyingGlassIcon className="w-5 h-5"/></span>
                  <input 
                      type="text" 
                      placeholder="Search Customer, DO, or Item..." 
                      className="w-full pl-12 p-3.5 bg-gray-50 border border-gray-200 rounded-2xl text-base md:text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                  />
              </div>
              
              {/* BULK ACTIONS TOOLBAR */}
             <div className={`flex flex-wrap items-center gap-1 sm:gap-2 px-3 py-2 rounded-xl transition-all border w-full xl:w-auto justify-center xl:justify-end ${selectedDOs.size > 0 ? 'bg-blue-50 border-blue-200 shadow-sm' : 'bg-gray-50 border-gray-200 opacity-60 pointer-events-none'}`}>
                 <span className="text-[10px] sm:text-xs font-black uppercase text-blue-800 tracking-widest border-r border-blue-200/50 pr-2 sm:pr-3 mr-1 hidden sm:block">
                     {selectedDOs.size} Selected
                 </span>
                 <span className="text-xs font-black text-blue-800 sm:hidden mr-1 border-r border-blue-200/50 pr-2">{selectedDOs.size}</span>
                 
                 <button onClick={() => setIsBulkEditOpen(true)} className="flex items-center gap-1.5 p-1.5 sm:px-2 sm:py-1 rounded-lg text-blue-600 hover:bg-blue-100 transition" title="Bulk Edit">
                     <PencilSquareIcon className="w-4 h-4 md:w-5 md:h-5"/><span className="hidden md:inline text-xs font-bold uppercase tracking-wider">Edit</span>
                 </button>
                 <button onClick={handleBulkPrint} className="flex items-center gap-1.5 p-1.5 sm:px-2 sm:py-1 rounded-lg text-gray-600 hover:bg-gray-200 transition" title="Batch Print">
                     <PrinterIcon className="w-4 h-4 md:w-5 md:h-5"/><span className="hidden md:inline text-xs font-bold uppercase tracking-wider">Print</span>
                 </button>
                 <button onClick={sendSelectedToShipday} className="flex items-center gap-1.5 p-1.5 sm:px-2 sm:py-1 rounded-lg text-green-600 hover:bg-green-100 transition" title="Push Shipday">
                     <TruckIcon className="w-4 h-4 md:w-5 md:h-5"/><span className="hidden md:inline text-xs font-bold uppercase tracking-wider">Shipday</span>
                 </button>
                 <button onClick={handleBulkDelete} className="flex items-center gap-1.5 p-1.5 sm:px-2 sm:py-1 rounded-lg text-red-600 hover:bg-red-100 transition" title="Batch Delete">
                     <TrashIcon className="w-4 h-4 md:w-5 md:h-5"/><span className="hidden md:inline text-xs font-bold uppercase tracking-wider">Delete</span>
                 </button>
                 {selectedDOs.size > 0 && (
                     <button onClick={() => setSelectedDOs(new Set())} className="ml-1 p-1.5 text-gray-400 hover:text-red-500 rounded-lg transition" title="Clear Selection">
                         <XMarkIcon className="w-4 h-4 md:w-5 md:h-5" />
                     </button>
                 )}
             </div>
          </div>

          <div className="border-b border-gray-100 shrink-0">
              <button onClick={() => setIsUsageExpanded(!isUsageExpanded)} className="w-full flex justify-between items-center px-5 md:px-6 py-4 text-purple-700 font-bold bg-purple-50 hover:bg-purple-100 transition-colors text-xs md:text-sm uppercase tracking-widest">
                  <span className="flex items-center gap-2">📋 Daily Production Usage Summary</span>
                  <span>{isUsageExpanded ? '▲' : '▼'}</span>
              </button>
              {isUsageExpanded && (
                  <div className="max-h-64 overflow-y-auto p-5 md:p-6 bg-purple-50/30 border-t border-purple-100 custom-scrollbar">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-3 text-xs md:text-sm font-black">
                          {usageSummary.map((u, i) => (
                              <div key={i} className="flex justify-between border-b border-purple-100/50 pb-2">
                                  <span className="text-gray-700 truncate pr-2 uppercase">{u.name}</span>
                                  <span className="text-purple-800 whitespace-nowrap">{u.qty} <span className="text-[10px] font-bold text-gray-400 uppercase">{u.uom}</span></span>
                              </div>
                          ))}
                          {usageSummary.length === 0 && <div className="col-span-full text-center text-gray-400 italic text-xs">No usage data found for this date.</div>}
                      </div>
                  </div>
              )}
          </div>

          {/* DESKTOP TABLE VIEW: Scrolls internally within the constrained parent box */}
          <div className="hidden md:block overflow-auto flex-1 custom-scrollbar bg-white">
              <table className="w-full text-left min-w-[1050px]">
                  <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest sticky top-0 z-10 shadow-sm border-b border-gray-100">
                      <tr>
                          <th className="p-5 w-10 text-center"><input type="checkbox" onChange={handleSelectAll} checked={selectedDOs.size > 0 && selectedDOs.size === filteredGroupedOrders.length} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer" /></th>
                          <th className="p-5 w-32">DO Number</th><th className="p-5 w-[350px]">Customer Info</th><th className="p-5 w-[220px]">Logistics</th><th className="p-5 text-center w-16">Items</th><th className="p-5 w-28">Driver</th><th className="p-5 text-center w-28">Status</th><th className="p-5 text-right w-24 pr-6">Action</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-sm font-bold text-gray-700">
                      {filteredGroupedOrders.length === 0 ? (
                          <tr><td colSpan="8" className="p-16 text-center text-gray-400 italic font-bold bg-gray-50/30">No orders found.</td></tr>
                      ) : (
                          filteredGroupedOrders.map(group => {
                              const rawStatus = getRawStatus(group.info);
                              const isSelected = selectedDOs.has(group.info.DONumber);
                              const isConsignment = String(group.info.DONumber).startsWith('CSGN');
                              return (
                              <tr key={group.info.DONumber} className={`transition-colors group/row cursor-pointer ${isSelected ? 'bg-blue-50/60' : 'hover:bg-blue-50/30'}`} onClick={() => handleCheckbox(group.info.DONumber)}>
                                  <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={isSelected} onChange={() => handleCheckbox(group.info.DONumber)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer" /></td>
                                  <td className="p-4"><span className={`font-mono text-xs font-black px-2 py-1 rounded border ${isConsignment ? 'text-orange-700 bg-orange-100 border-orange-200' : 'text-green-700 bg-green-100 border-green-200'}`}>{group.info.DONumber}</span></td>
                                  <td className="p-4"><div className="font-black text-gray-800 text-base uppercase max-w-[350px] whitespace-normal leading-tight">{group.info["Customer Name"]}</div><div className="text-xs text-gray-500 mt-1 font-bold">{group.info["Contact Person"]}</div></td>
                                  <td className="p-4"><div className={`text-[9px] px-2 py-1 rounded w-fit font-black mb-1 uppercase tracking-widest border ${getDeliveryModeStyle(group.info["Delivery Mode"])}`}>{group.info["Delivery Mode"] || 'Standard'}</div><div className="text-xs text-gray-500 truncate max-w-[200px] font-medium">{group.info["Delivery Address"]}</div></td>
                                  <td className="p-4 text-center"><span className="bg-gray-100 text-gray-600 text-xs font-black px-3 py-1 rounded-full">{group.itemCount}</span></td>
                                  <td className="p-4">{group.info.DriverName ? (<span className="bg-indigo-50 text-indigo-700 text-[10px] font-black px-3 py-1 rounded-lg border border-indigo-100 uppercase tracking-wide">{group.info.DriverName}</span>) : (<span className="text-gray-300 text-[10px] font-bold uppercase tracking-widest italic">Unassigned</span>)}</td>
                                  <td className="p-4 text-center"><span className={`px-2.5 py-1.5 rounded-full text-[10px] font-black uppercase border shadow-sm whitespace-nowrap ${getStatusColor(rawStatus)}`}>{formatDisplayStatus(rawStatus)}</span></td>
                                  <td className="p-4 text-right pr-6" onClick={(e) => e.stopPropagation()}><div className="flex items-center justify-end gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity w-full"><button onClick={() => openEditModal(group)} className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition"><PencilSquareIcon className="w-5 h-5" /></button><button onClick={() => handlePrintOrder(group.info.DONumber)} className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg transition"><PrinterIcon className="w-5 h-5" /></button><button onClick={() => handleSendToShipday(group)} className="p-1.5 text-green-600 hover:bg-green-100 rounded-lg transition"><TruckIcon className="w-5 h-5" /></button><button onClick={() => handleDeleteDO(group.info.DONumber)} className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition"><TrashIcon className="w-5 h-5" /></button></div></td>
                              </tr>
                          )})
                      )}
                  </tbody>
              </table>
          </div>

          {/* MOBILE CARD VIEW: Scrolls internally within the constrained parent box */}
          <div className="md:hidden flex flex-col gap-3 p-3 bg-gray-50/50 pb-20 overflow-y-auto flex-1 custom-scrollbar">
              {filteredGroupedOrders.length > 0 && (<div className="flex items-center gap-3 px-3 py-2 bg-white rounded-xl shadow-sm border border-gray-100"><input type="checkbox" onChange={handleSelectAll} checked={selectedDOs.size > 0 && selectedDOs.size === filteredGroupedOrders.length} className="w-5 h-5 rounded text-blue-600 border-gray-300" /><span className="text-xs font-black text-gray-500 uppercase tracking-widest">Select All Today</span></div>)}
              {filteredGroupedOrders.length === 0 ? (<div className="p-10 text-center text-gray-400 italic font-bold bg-white rounded-2xl border border-dashed border-gray-200">No orders scheduled.</div>) : (filteredGroupedOrders.map(group => {
                      const rawStatus = getRawStatus(group.info);
                      const isSelected = selectedDOs.has(group.info.DONumber);
                      const isConsignment = String(group.info.DONumber).startsWith('CSGN');
                      return (
                          <div key={group.info.DONumber} className={`rounded-2xl p-4 transition-all relative border shrink-0 ${isSelected ? 'bg-blue-50/50 border-blue-400 shadow-md ring-1 ring-blue-400' : 'bg-white border-gray-100 shadow-sm hover:border-blue-200'}`} onClick={() => handleCheckbox(group.info.DONumber)}>
                              <div className="flex justify-between items-start mb-3">
                                  <div className="flex flex-col gap-1.5"><span className={`font-mono text-[10px] font-black px-2 py-1 rounded border w-fit ${isConsignment ? 'text-orange-700 bg-orange-100 border-orange-200' : 'text-green-700 bg-green-100 border-green-200'}`}>{group.info.DONumber}</span><span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase border w-fit ${getStatusColor(rawStatus)}`}>{formatDisplayStatus(rawStatus)}</span></div>
                                  <input type="checkbox" className="w-6 h-6 rounded-full text-blue-600 border-gray-300 pointer-events-none mt-1" checked={isSelected} readOnly />
                              </div>
                              <div className="mb-4"><h4 className="font-black text-gray-800 text-sm uppercase leading-tight mb-1 pr-6">{group.info["Customer Name"]}</h4><p className="text-[10px] text-gray-500 font-medium line-clamp-2 leading-snug">{group.info["Delivery Address"]}</p></div>
                              <div className="flex flex-wrap items-center gap-2 mb-4 border-t border-gray-50 pt-3"><span className="bg-gray-100 text-gray-600 text-[10px] font-black px-2 py-1 rounded-md">{group.itemCount} Items</span><span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase border tracking-wide ${getDeliveryModeStyle(group.info["Delivery Mode"])}`}>{group.info["Delivery Mode"] || 'Standard'}</span>{group.info.DriverName ? (<span className="bg-indigo-50 text-indigo-700 text-[9px] font-black px-2 py-1 rounded-md border border-indigo-100 uppercase truncate max-w-[100px]">{group.info.DriverName}</span>) : (<span className="bg-gray-50 text-gray-400 text-[9px] font-bold px-2 py-1 rounded-md border border-gray-200 uppercase">Unassigned</span>)}</div>
                              <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3" onClick={e => e.stopPropagation()}><button className="p-2.5 bg-gray-50 hover:bg-blue-50 text-blue-600 rounded-xl transition" onClick={() => openEditModal(group)}><PencilSquareIcon className="w-5 h-5"/></button><button className="p-2.5 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-xl transition" onClick={() => handlePrintOrder(group.info.DONumber)}><PrinterIcon className="w-5 h-5"/></button><button className="p-2.5 bg-gray-50 hover:bg-green-50 text-green-600 rounded-xl transition" onClick={() => handleSendToShipday(group)}><TruckIcon className="w-5 h-5"/></button><button className="p-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition" onClick={() => handleDeleteDO(group.info.DONumber)}><TrashIcon className="w-5 h-5"/></button></div>
                          </div>
                      );
                  })
              )}
          </div>
      </div>

      {/* MODALS (BULK EDIT & INDIVIDUAL EDIT) */}
      {isBulkEditOpen && (
          <div className="fixed inset-0 bg-black/60 z-[110] flex items-center justify-center p-4 backdrop-blur-sm overflow-hidden">
            <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl flex flex-col animate-in zoom-in duration-200 border border-gray-100 max-h-[90vh] overflow-hidden">
                <div className="flex justify-between items-center p-6 border-b border-gray-100 shrink-0 bg-white">
                    <div>
                        <h2 className="text-lg md:text-xl font-black text-gray-800 uppercase tracking-tight">Bulk Edit</h2>
                        <p className="text-[10px] md:text-xs text-gray-400 font-bold mt-1">Applying to <span className="text-blue-600">{selectedDOs.size}</span> orders.</p>
                    </div>
                    <button onClick={() => setIsBulkEditOpen(false)} className="text-gray-400 hover:text-red-500 text-2xl font-bold bg-gray-50 hover:bg-red-50 w-10 h-10 rounded-full flex items-center justify-center transition-all pb-1">×</button>
                </div>
                
                <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0 custom-scrollbar bg-white">
                    <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">New Delivery Date</label>
                        <input type="date" className="w-full p-3 border border-gray-200 bg-white rounded-xl outline-none font-bold text-base md:text-xs focus:ring-2 focus:ring-blue-500" value={bulkEditData.deliveryDate} onChange={e => setBulkEditData({...bulkEditData, deliveryDate: e.target.value})} />
                    </div>
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Assign Driver</label>
                        <input list="modal-drivers" placeholder="Type driver name..." className="w-full p-3 border border-gray-200 rounded-xl outline-none font-bold text-base md:text-xs focus:ring-2 focus:ring-blue-500" value={bulkEditData.driverName} onChange={e => setBulkEditData({...bulkEditData, driverName: e.target.value})} />
                        <datalist id="modal-drivers"><option value="Ali" /><option value="Muthu" /><option value="Ah Meng" /><option value="Lalamove" /></datalist>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Delivery Mode</label>
                            <select className="w-full p-3 border border-gray-200 rounded-xl outline-none font-bold text-base md:text-xs focus:ring-2 focus:ring-blue-500" value={bulkEditData.deliveryMode} onChange={e => setBulkEditData({...bulkEditData, deliveryMode: e.target.value})}>
                                <option value="">-- No Change --</option><option value="Driver">Driver</option><option value="Lalamove">Lalamove</option><option value="Self Pick-up">Self Pick-up</option>
                            </select>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Status</label>
                            <select className="w-full p-3 border border-gray-200 rounded-xl outline-none font-bold text-base md:text-xs focus:ring-2 focus:ring-blue-500" value={bulkEditData.status} onChange={e => setBulkEditData({...bulkEditData, status: e.target.value})}>
                                <option value="">-- No Change --</option><option value="PENDING">PENDING</option><option value="ASSIGNED">ASSIGNED</option><option value="IN TRANSIT">IN TRANSIT</option><option value="DELIVERED">DELIVERED</option><option value="FAILED">FAILED</option><option value="CANCELLED">CANCELLED</option>
                            </select>
                        </div>
                    </div>
                </div>
                
                <div className="flex justify-end gap-3 p-5 border-t border-gray-100 shrink-0 bg-gray-50">
                    <button onClick={() => setIsBulkEditOpen(false)} className="flex-1 sm:flex-none px-6 py-4 sm:py-3 bg-white border border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-100 transition-all active:scale-95 text-xs uppercase tracking-widest">Cancel</button>
                    <button onClick={handleBulkEditSave} className="flex-1 sm:flex-none px-8 py-4 sm:py-3 bg-blue-600 text-white font-black rounded-xl shadow-lg hover:bg-blue-700 transition-all active:scale-95 text-xs uppercase tracking-widest">Apply to {selectedDOs.size}</button>
                </div>
            </div>
          </div>
      )}

      {/* EDIT INDIVIDUAL ORDER MODAL */}
      {isEditModalOpen && editingOrder && (
          <div className="fixed inset-0 bg-black/60 z-[110] flex items-center justify-center p-4 md:p-8 backdrop-blur-sm overflow-hidden">
            <div className="bg-white rounded-[2rem] w-full max-w-5xl shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in duration-200 border border-gray-100 overflow-hidden">
                
                {/* Header - Fixed */}
                <div className="flex justify-between items-center px-6 py-5 border-b border-gray-100 shrink-0 bg-white">
                    <div><h2 className="text-lg md:text-xl font-black text-gray-800 uppercase flex items-center gap-2">Edit DO <span className="text-blue-600 font-mono">{editingOrder.DONumber}</span></h2></div>
                    <button onClick={() => setIsEditModalOpen(false)} className="text-gray-400 hover:text-red-500 text-3xl font-bold bg-gray-50 hover:bg-red-50 w-10 h-10 rounded-full flex items-center justify-center transition-all pb-1">×</button>
                </div>

                {/* Customer Info - Fixed */}
                <div className="px-6 py-5 shrink-0 bg-gray-50/50 border-b border-gray-100">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-xs font-bold uppercase">
                        <div className="md:col-span-2"><label className="block text-[9px] text-gray-400 mb-1 ml-1">Customer</label><input className="w-full p-2.5 border border-gray-200 bg-white rounded-xl outline-none font-black text-sm" value={editingOrder["Customer Name"]} onChange={e => setEditingOrder({...editingOrder, "Customer Name": e.target.value})} /></div>
                        <div className="md:col-span-3"><label className="block text-[9px] text-gray-400 mb-1 ml-1">Address</label><input className="w-full p-2.5 border border-gray-200 bg-white rounded-xl outline-none font-medium text-sm" value={editingOrder["Delivery Address"]} onChange={e => setEditingOrder({...editingOrder, "Delivery Address": e.target.value})} /></div>
                        <div className="md:col-span-2"><label className="block text-[9px] text-gray-400 mb-1 ml-1">Phone</label><input className="w-full p-2.5 border border-gray-200 bg-white rounded-xl outline-none font-black text-sm" value={editingOrder["Contact Number"] || ''} onChange={e => setEditingOrder({...editingOrder, "Contact Number": e.target.value})} /></div>
                        <div><label className="block text-[9px] text-gray-400 mb-1 ml-1">Date</label><input type="date" className="w-full p-2.5 border border-gray-200 bg-blue-50 text-blue-800 rounded-xl outline-none font-black text-sm" value={editingOrder["Delivery Date"]} onChange={e => setEditingOrder({...editingOrder, "Delivery Date": e.target.value})} /></div>
                        <div>
                            <label className="block text-[9px] text-gray-400 mb-1 ml-1">Mode</label>
                            <select className="w-full p-2.5 border border-gray-200 bg-white rounded-xl outline-none font-black text-sm uppercase shadow-sm" value={editingOrder["Delivery Mode"] || 'Driver'} onChange={e => setEditingOrder({...editingOrder, "Delivery Mode": e.target.value})}>
                                <option value="Driver">Driver</option>
                                <option value="Lalamove">Lalamove</option>
                                <option value="Self Pick-up">Self Pick-up</option>
                            </select>
                        </div>
                        <div><label className="block text-[9px] text-gray-400 mb-1 ml-1">Status</label><select className={`w-full p-2.5 border rounded-xl outline-none font-black text-sm uppercase shadow-sm ${getStatusColor(getRawStatus(editingOrder))}`} value={formatDisplayStatus(getRawStatus(editingOrder))} onChange={e => setEditingOrder({...editingOrder, Status: e.target.value})}><option value="PENDING">PENDING</option><option value="ASSIGNED">ASSIGNED</option><option value="IN TRANSIT">IN TRANSIT</option><option value="DELIVERED">DELIVERED</option><option value="FAILED">FAILED</option></select></div>
                    </div>
                </div>

                {/* Product List - Scrollable */}
                <div className="flex-1 overflow-y-auto p-0 bg-white custom-scrollbar min-h-0">
                    <div className="p-6">
                        {/* Add New Product Section */}
                        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-blue-100 shadow-sm relative mb-6">
                            <label className="block text-[10px] font-black text-blue-500 uppercase tracking-widest mb-2 ml-1">Add New Product</label>
                            <div className="flex gap-2 relative">
                                <span className="absolute left-3 top-3.5 text-gray-400"><MagnifyingGlassIcon className="w-4 h-4 sm:w-5 sm:h-5"/></span>
                                <input type="text" placeholder="Search catalog..." className="w-full pl-9 p-3 border border-gray-200 bg-gray-50 rounded-xl text-xs font-bold outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all" value={productSearchTerm} onChange={e => setProductSearchTerm(e.target.value)} />
                            </div>
                            {productSearchTerm && (
                                <div className="absolute left-4 right-4 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto z-20 custom-scrollbar divide-y divide-gray-50">
                                    {products.filter(p => `${p.ProductName} ${p.ProductCode}`.toLowerCase().includes(productSearchTerm.toLowerCase())).map(p => (
                                        <div key={p.ProductCode} onClick={() => handleAddItem(p)} className="p-3 hover:bg-blue-50 cursor-pointer flex justify-between items-center group/add text-[10px] sm:text-xs uppercase font-black">
                                            <div>{p.ProductName} <span className="text-[9px] text-gray-400 ml-2 font-mono">{p.ProductCode}</span></div>
                                            <span className="bg-blue-600 text-white p-1 rounded flex items-center justify-center font-black shadow-sm"><PlusIcon className="w-3 h-3"/></span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* MOBILE ITEM CARDS */}
                        <div className="md:hidden space-y-4">
                            {editingItems.map((item, idx) => (
                                <div key={idx} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm relative">
                                    <button onClick={() => handleDeleteItem(idx)} className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-red-500 bg-gray-50 rounded-lg"><TrashIcon className="w-5 h-5"/></button>
                                    <div className="text-xs font-black uppercase text-gray-800 pr-10 mb-4">{item["Order Items"]}</div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center bg-gray-50 border rounded-xl p-1.5">
                                            <button onClick={() => handleEditItemChange(idx, 'Quantity', Math.max(0, Number(item.Quantity)-1))} className="w-10 h-10 flex items-center justify-center bg-white rounded-lg shadow-sm active:scale-90"><MinusIcon className="w-5 h-5"/></button>
                                            <span className="w-12 text-center text-lg font-black">{item.Quantity}</span>
                                            <button onClick={() => handleEditItemChange(idx, 'Quantity', Number(item.Quantity)+1)} className="w-10 h-10 flex items-center justify-center bg-white rounded-lg shadow-sm active:scale-90"><PlusIcon className="w-5 h-5"/></button>
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            <select className="w-24 p-2 border border-gray-200 rounded-xl text-center font-bold uppercase text-xs outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" value={item.UOM} onChange={e => handleEditItemChange(idx, 'UOM', e.target.value)}>
                                                {(() => {
                                                    const matchedProd = products.find(p => p.ProductCode === item["Product Code"]);
                                                    const uoms = matchedProd && matchedProd.AllowedUOMs ? matchedProd.AllowedUOMs.split(',').map(u => u.trim().toUpperCase()).filter(Boolean) : [item.UOM, 'KG', 'CTN', 'PCS'];
                                                    return Array.from(new Set([item.UOM, ...uoms])).filter(Boolean).map(u => <option key={u} value={u}>{u}</option>);
                                                })()}
                                            </select>
                                            <input type="number" step="0.01" className="w-24 p-2 border border-gray-200 rounded-xl text-right font-black text-base mt-1" value={item.Price} onChange={e => handleEditItemChange(idx, 'Price', e.target.value)} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* DESKTOP TABLE */}
                        <div className="hidden md:block w-full">
                            <table className="w-full text-left text-xs whitespace-nowrap">
                                <thead className="bg-gray-50 font-black text-gray-500 text-[10px] uppercase tracking-widest border-b border-gray-200 sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th className="p-4 pl-6">Catalog Item</th>
                                        <th className="p-4 w-24 text-center">Qty</th>
                                        <th className="p-4 w-28 text-center">UOM</th>
                                        <th className="p-4 w-32 text-right">Price</th>
                                        <th className="p-4 w-12 pr-6"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 font-bold text-gray-700">
                                    {editingItems.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="p-3 pl-6">
                                                <select className="w-full p-2.5 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-white" value={item["Order Items"]} onChange={e => handleEditItemChange(idx, 'Order Items', e.target.value)}>
                                                    <option value={item["Order Items"]}>{item["Order Items"]}</option>
                                                    {products.filter(p => p.ProductName !== item["Order Items"]).map(p => <option key={p.ProductCode} value={p.ProductName}>{p.ProductName}</option>)}
                                                </select>
                                            </td>
                                            <td className="p-3 text-center">
                                                <input type="number" className="w-full p-2.5 border border-gray-200 rounded-xl text-center font-black outline-none focus:ring-2 focus:ring-blue-500 bg-white" value={item.Quantity} onChange={e => handleEditItemChange(idx, 'Quantity', e.target.value)} />
                                            </td>
                                            <td className="p-3 text-center">
                                                <select className="w-full p-2.5 border border-gray-200 rounded-xl text-center font-bold uppercase outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm" value={item.UOM} onChange={e => handleEditItemChange(idx, 'UOM', e.target.value)}>
                                                    {(() => {
                                                        const matchedProd = products.find(p => p.ProductCode === item["Product Code"]);
                                                        const uoms = matchedProd && matchedProd.AllowedUOMs ? matchedProd.AllowedUOMs.split(',').map(u => u.trim().toUpperCase()).filter(Boolean) : [item.UOM, 'KG', 'CTN', 'PCS'];
                                                        return Array.from(new Set([item.UOM, ...uoms])).filter(Boolean).map(u => <option key={u} value={u}>{u}</option>);
                                                    })()}
                                                </select>
                                            </td>
                                            <td className="p-3 text-right">
                                                <input type="number" step="0.01" className="w-full p-2.5 border border-gray-200 rounded-xl text-right font-black text-blue-600 outline-none focus:ring-2 focus:ring-blue-500 bg-white" value={item.Price} onChange={e => handleEditItemChange(idx, 'Price', e.target.value)} />
                                            </td>
                                            <td className="p-3 text-center pr-6">
                                                <button onClick={() => handleDeleteItem(idx)} className="p-2.5 bg-red-50 text-red-500 hover:bg-red-100 rounded-xl transition shadow-sm border border-red-100"><TrashIcon className="w-4 h-4" /></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Footer - Fixed */}
                <div className="p-5 border-t border-gray-100 bg-gray-50 shrink-0 flex justify-end gap-3">
                    <button onClick={() => setIsEditModalOpen(false)} className="px-6 md:px-8 py-3 md:py-3.5 bg-white border border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-100 transition-all active:scale-95 text-xs uppercase tracking-widest">Cancel</button>
                    <button onClick={saveEditedOrder} className="px-6 md:px-10 py-3 md:py-3.5 bg-blue-600 text-white font-black rounded-xl shadow-md active:scale-95 uppercase text-xs tracking-widest flex items-center justify-center gap-2 hover:bg-blue-700">
                        <CheckIcon className="w-5 h-5" strokeWidth={3} /> Save Changes
                    </button>
                </div>

            </div>
          </div>
      )}
    </div>
  );
}