'use client';
import React, { useState, useEffect, useMemo, useRef } from 'react';

// ------------------------------------------------------------------
// --- 真实的本地环境导入 (请在您的本地项目中取消注释以下两行) ---
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
// ------------------------------------------------------------------



import { 
  PlusCircleIcon, 
  ClipboardDocumentListIcon, 
  PencilSquareIcon, 
  TrashIcon,
  ArrowPathIcon,
  PrinterIcon,
  TruckIcon,
  XMarkIcon,
  SignalIcon,
  AdjustmentsHorizontalIcon,
  PaperAirplaneIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  CheckIcon,
  PlayCircleIcon,
  MinusIcon,
  PlusIcon,
  ShoppingCartIcon,
  StarIcon,
  UserCircleIcon,
  CalendarDaysIcon,
  TagIcon,
  BoltIcon
} from '@heroicons/react/24/outline';

// ==========================================
// 状态与样式助手函数 (全局)
// ==========================================
const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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

const getStockColor = (balance) => {
    if (balance === null || balance === undefined) return 'bg-gray-100 text-gray-500'; 
    const qty = Number(balance);
    if (qty <= 0) return 'bg-red-100 text-red-600'; 
    if (qty < 20) return 'bg-orange-100 text-orange-600';
    if (qty <= 50) return 'bg-yellow-100 text-yellow-600';
    return 'bg-green-100 text-green-600';
};

const getLocalDateString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export default function NewOrderPage() {
  const router = useRouter();
  
  // Tab State
  const [activeTab, setActiveTab] = useState('new'); 

  // Data States
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [orderHistory, setOrderHistory] = useState([]);
  const [standingOrders, setStandingOrders] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRealtimeActive, setIsRealtimeActive] = useState(false);
  const [autopilotMessage, setAutopilotMessage] = useState(''); // Background Engine Message

  // User State
  const [currentUser, setCurrentUser] = useState('');

  // --- NEW ORDER STATES (UI/UX Enhanced) ---
  const [isCustomerBoxOpen, setIsCustomerBoxOpen] = useState(true); 
  const [activeCategory, setActiveCategory] = useState('All');
  const [quickAddItems, setQuickAddItems] = useState([]); 
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);

  const [selectedCustomerValue, setSelectedCustomerValue] = useState('');
  const [custDetails, setCustDetails] = useState({ 
    ContactPerson: '', 
    ContactNumber: '', 
    DeliveryAddress: '' 
  });
  
  const [deliveryDate, setDeliveryDate] = useState(() => {
    const now = new Date();
    const hours = now.getHours();
    if (hours > 12) {
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

  // RECURRING LOGIC STATES
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringDay, setRecurringDay] = useState('Monday');
  
  const [targetGenDate, setTargetGenDate] = useState(() => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);
    return getLocalDateString(tmr);
  });
  const [isGenerating, setIsGenerating] = useState(false);

  // --- ORDER LIST / EDIT STATES ---
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // Add Status Filter state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [editingItems, setEditingItems] = useState([]);
  const [deletedItemIds, setDeletedItemIds] = useState([]);
  const [productSearchTerm, setProductSearchTerm] = useState('');

  // --- MULTI-SELECT & BULK ACTION STATES ---
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [bulkEditData, setBulkEditData] = useState({ deliveryDate: '', deliveryMode: '', status: '' });
  const [sortConfig, setSortConfig] = useState({ key: 'Delivery Date', direction: 'desc' });

  const autopilotFired = useRef(false);

  // ==========================================
  // INITIAL DATA FETCH & BACKGROUND ENGINE
  // ==========================================
  const fetchOrderHistory = async () => {
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
    } catch(err) {
      console.error(err);
    }
  };

  const fetchStandingOrders = async () => {
      try {
          const { data } = await supabase.from('StandingOrders').select('*').order('CreatedAt', { ascending: false });
          if (data) setStandingOrders(data);
          return data || [];
      } catch (err) {
          return [];
      }
  };

  // THE AUTOPILOT ENGINE: Checks and generates tomorrow's orders silently
  const runBackgroundAutopilot = async (activeTemplates) => {
      if (!activeTemplates || activeTemplates.length === 0) return;

      const tmr = new Date();
      tmr.setDate(tmr.getDate() + 1);
      const targetDate = getLocalDateString(tmr);
      const dayName = DAYS_OF_WEEK[tmr.getDay()];

      // --- 1. LOCAL BROWSER LOCK (Prevents looping across page navigations) ---
      const lockKey = `ffd_autopilot_ran_${targetDate}`;
      if (typeof window !== 'undefined' && localStorage.getItem(lockKey)) {
          return; 
      }

      // Filter templates meant for tomorrow
      const tomorrowTemplates = activeTemplates.filter(t => t.DeliveryDay === dayName && t.Status === 'Active');
      if (tomorrowTemplates.length === 0) {
          if (typeof window !== 'undefined') localStorage.setItem(lockKey, 'true');
          return;
      }

      // --- 2. DATABASE SAFETY LOCK (Fetch ALL auto-generated orders for tomorrow ONCE) ---
      const { data: existingOrders } = await supabase.from('Orders')
          .select('"Customer Name"')
          .like('Delivery Date', `${targetDate}%`)
          .ilike('SpecialNotes', '%AUTO-GENERATED%');

      const existingCustomers = new Set((existingOrders || []).map(o => String(o["Customer Name"]).toUpperCase().trim()));

      let generatedCount = 0;

      for (const template of tomorrowTemplates) {
          const cName = String(template.CustomerName).toUpperCase().trim();
          
          // Check if already auto-generated in DB
          if (existingCustomers.has(cName)) continue; 

          // Generate
          const dateStr = targetDate.replaceAll('-', '').slice(2);
          const doNumber = `DO-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;
          const occurrenceMap = {};
          
          const orderRows = (template.Items || []).map(item => {
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
                  "SpecialNotes": "AUTO-GENERATED STANDING ORDER",
                  "LoggedBy": "SYSTEM_AUTOPILOT"
              };
          });

          if (orderRows.length > 0) {
              const { error } = await supabase.from('Orders').insert(orderRows);
              if (!error) {
                  generatedCount++;
                  existingCustomers.add(cName); // Mark as generated in memory to prevent duplicate batches
              }
          }
      }

      // Lock it down for today so it doesn't hit DB again on remounts
      if (typeof window !== 'undefined') {
          localStorage.setItem(lockKey, 'true');
      }

      if (generatedCount > 0) {
          setAutopilotMessage(`Autopilot generated ${generatedCount} DOs for tomorrow.`);
          setTimeout(() => setAutopilotMessage(''), 5000);
          await fetchOrderHistory(); // Refresh to show new orders
      }
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
        const username = email.split('@')[0].toUpperCase();
        setCurrentUser(username);

        const { data: custData } = await supabase.from('Customers').select('*').order('CompanyName');
        const { data: prodData } = await supabase.from('ProductMaster').select('ProductCode, ProductName, BaseUOM, SalesUOM, Category, StockBalance, ReportingUOM, AllowedUOMs').order('ProductName');

        setCustomers(custData || []);
        setProducts(prodData || []);
        
        await fetchOrderHistory();
        const templates = await fetchStandingOrders();

        // 🚀 FIRE AUTOPILOT ENGINE (Protected by Ref to prevent double-firing) 🚀
        if (!autopilotFired.current) {
            autopilotFired.current = true;
            await runBackgroundAutopilot(templates);
        }

      } catch(err) {}
      setLoading(false);
    }
    
    loadData();

    const channel = supabase
      .channel('realtime_orders_sync')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'Orders' }, () => {
          fetchOrderHistory();
      })
      .subscribe((status) => {
          setIsRealtimeActive(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
      if (deliveryDate) {
          const d = new Date(deliveryDate);
          if (!isNaN(d)) setRecurringDay(DAYS_OF_WEEK[d.getDay()]);
      }
  }, [deliveryDate]);

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
          }
      } catch (err) {}
      setIsSyncing(false);
  };

  // ==========================================
  // NEW ORDER FORM LOGIC
  // ==========================================
  const handleCustomerChange = async (e) => {
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
      // UX Enhancement: Auto-collapse on mobile to save space
      if (window.innerWidth < 1024) {
          setIsCustomerBoxOpen(false);
      }

      // UX Enhancement: Fetch Favorites / Quick Add
      const { data: pastItems } = await supabase.from('Orders')
          .select('"Product Code"')
          .ilike('Customer Name', inputValue)
          .order('Timestamp', {ascending: false})
          .limit(100);
          
      if (pastItems) {
          const freq = {};
          pastItems.forEach(i => { freq[i["Product Code"]] = (freq[i["Product Code"]] || 0) + 1; });
          const topCodes = Object.keys(freq).sort((a,b) => freq[b] - freq[a]).slice(0, 8);
          setQuickAddItems(products.filter(p => topCodes.includes(p.ProductCode)));
      }
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

  const addToCart = (product, forcedQty = null) => {
    const inputs = productInputs[product.ProductCode] || {};
    const qty = forcedQty || parseFloat(inputs.qty) || 1;
    const price = inputs.price === '' || inputs.price === undefined ? 0 : parseFloat(inputs.price); 
    const uom = inputs.uom || product.SalesUOM || product.BaseUOM;
    
    if (qty <= 0) return;

    setCart(prevCart => {
      const existingItemIndex = prevCart.findIndex(item => 
        item.ProductCode === product.ProductCode && 
        item.uom === uom && 
        item.isReplacement === (inputs.replacement || false)
      );
      
      if (existingItemIndex > -1) {
        const newCart = [...prevCart];
        newCart[existingItemIndex].qty += qty;
        return newCart;
      }

      const newItem = {
        ...product,
        cartId: `${product.ProductCode}-${Date.now()}-${Math.random()}`, 
        qty: qty,
        uom: uom,
        price: price, 
        notes: '',
        isReplacement: inputs.replacement || false
      };
      return [...prevCart, newItem];
    });

    setProductInputs(prev => {
      const newState = { ...prev };
      delete newState[product.ProductCode];
      return newState;
    });
    setSearchTerm(''); 
  };

  const updateCartQty = (cartId, delta) => {
    setCart(prevCart => prevCart.map(item => {
      if (item.cartId === cartId) {
        const newQty = Math.max(0, item.qty + delta);
        return { ...item, qty: newQty };
      }
      return item;
    }).filter(item => item.qty > 0));
  };

  const removeFromCart = (cartId) => setCart(cart.filter(item => item.cartId !== cartId));

  const totalAmount = useMemo(() => cart.reduce((sum, item) => sum + (Number(item.price) * Number(item.qty)), 0), [cart]);

  const handleSubmitOrder = async () => {
    if (!selectedCustomerValue || !deliveryDate || cart.length === 0) {
      alert("Please select a customer, date, and at least one item.");
      return;
    }

    setSubmitting(true);
    const [year, month, day] = deliveryDate.split('-');
    const dateStr = `${year.slice(2)}${month}${day}`;
    const doNumber = `DO-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;

    const occurrenceMap = {};
    const orderRows = cart.map(item => {
        let baseRep = item.isReplacement ? "YES" : (item.price === 0 ? "FOC" : "");
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
            "Replacement": repVal,
            "SpecialNotes": item.notes,
            "LoggedBy": currentUser
        };
    });

    try {
        const { error } = await supabase.from('Orders').insert(orderRows);

        if (error) {
            alert("Database Error: " + error.message);
            setSubmitting(false);
            return;
        }

        if (isRecurring) {
            const cleanItems = cart.map(({ cartId, ...rest }) => ({
                ProductCode: rest.ProductCode,
                OrderItems: rest.ProductName,
                Quantity: rest.qty,
                UOM: rest.uom,
                Price: rest.price,
                Replacement: rest.isReplacement ? "YES" : (rest.price === 0 ? "FOC" : "")
            }));

            const patternPayload = {
                CustomerName: selectedCustomerValue.toUpperCase(),
                DeliveryAddress: custDetails.DeliveryAddress.toUpperCase(),
                ContactPerson: custDetails.ContactPerson.toUpperCase(),
                ContactNumber: custDetails.ContactNumber,
                DeliveryMode: deliveryMode,
                DeliveryDay: recurringDay,
                Status: 'Active',
                Items: cleanItems
            };
            
            await supabase.from('StandingOrders').insert([patternPayload]);
            fetchStandingOrders(); 
        }

        alert(`Order Created: ${doNumber}`);
        setCart([]);
        setSelectedCustomerValue('');
        setCustDetails({ ContactPerson: '', ContactNumber: '', DeliveryAddress: '' });
        setIsRecurring(false);
        setIsMobileCartOpen(false); 
        setIsCustomerBoxOpen(true); 
        fetchOrderHistory();
        setActiveTab('list'); 
        
    } catch(err) {
        console.error(err);
    }
    setSubmitting(false);
  };

  // ==========================================
  // MANUAL RECURRING PATTERN GENERATOR (Fallback)
  // ==========================================
  const getTargetDayName = () => {
      if (!targetGenDate) return '';
      const [y, m, d] = targetGenDate.split('-');
      const localDate = new Date(Number(y), Number(m)-1, Number(d));
      return DAYS_OF_WEEK[localDate.getDay()];
  };

  const handleGenerateAutos = async () => {
      const dayName = getTargetDayName();
      const matchingTemplates = standingOrders.filter(t => t.DeliveryDay === dayName && t.Status === 'Active');
      
      if (matchingTemplates.length === 0) {
          return alert(`No active recurring orders scheduled for ${dayName}s.`);
      }

      if (!confirm(`Ready to manually generate ${matchingTemplates.length} delivery orders for ${targetGenDate} (${dayName})?`)) return;

      setIsGenerating(true);
      let successCount = 0;
      let skippedCount = 0;

      for (const template of matchingTemplates) {
          const { data: existing } = await supabase.from('Orders')
              .select('DONumber')
              .eq('Delivery Date', targetGenDate)
              .eq('Customer Name', template.CustomerName)
              .ilike('SpecialNotes', '%AUTO-GENERATED%');

          if (existing && existing.length > 0) {
              skippedCount++;
              continue;
          }

          const dateStr = targetGenDate.replaceAll('-', '').slice(2);
          const doNumber = `DO-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;

          const occurrenceMap = {};
          const orderRows = (template.Items || []).map(item => {
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
                  "SpecialNotes": "AUTO-GENERATED STANDING ORDER",
                  "LoggedBy": currentUser
              };
          });

          if (orderRows.length > 0) {
              const { error } = await supabase.from('Orders').insert(orderRows);
              if (!error) successCount++;
          }
      }

      alert(`Manual Generation Complete!\n\n✅ Created: ${successCount} DOs\n⏭️ Skipped (Already Exist): ${skippedCount}`);
      fetchOrderHistory();
      setIsGenerating(false);
  };

  const deletePattern = async (id) => {
      if (!confirm("Permanently delete this weekly pattern?")) return;
      const { error } = await supabase.from('StandingOrders').delete().eq('id', id);
      if (!error) fetchStandingOrders();
  };

  // ==========================================
  // ORDER LIST ACTIONS & MODALS
  // ==========================================
  const toggleOrderSelection = (doNumber) => {
    setSelectedOrders(prev => 
        prev.includes(doNumber) 
            ? prev.filter(id => id !== doNumber) 
            : [...prev, doNumber]
    );
  };

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const handleDeleteDO = async (doNumber) => {
      if (!confirm(`Delete entire order ${doNumber}?`)) return;
      try {
        const { error } = await supabase.from('Orders').delete().eq('DONumber', doNumber);
        if (!error) {
            setSelectedOrders(prev => prev.filter(id => id !== doNumber));
            fetchOrderHistory();
        }
      } catch(e){}
  };

  const handleBulkDelete = async () => {
      if (!confirm(`Are you sure you want to permanently delete ${selectedOrders.length} selected orders?`)) return;
      try {
        const { error } = await supabase.from('Orders').delete().in('DONumber', selectedOrders);
        if (!error) {
            setSelectedOrders([]);
            fetchOrderHistory();
        }
      } catch(e){}
  };

  const handlePrintOrder = (doNumber) => {
      window.open(`/orders/${doNumber}/print`, '_blank');
  };

  const handleBulkPrint = () => {
      if (selectedOrders.length === 0) return;
      const firstSelectedGroup = orderHistory.find(group => selectedOrders.includes(group.info.DONumber));
      const targetDate = firstSelectedGroup ? firstSelectedGroup.info["Delivery Date"] : '';
      window.open(`/reports/batch-do?date=${targetDate}&dos=${selectedOrders.join(',')}`, '_blank');
  };

  const handleSendToShipday = async (doNumber) => {
      if (!confirm(`Push order ${doNumber} to Shipday delivery?`)) return;
      try {
          const res = await fetch('/api/shipday', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ doNumber })
          });
          const result = await res.json();
          if (res.ok) alert(`Success! Sent ${doNumber} to Shipday.`);
          else alert(`Failed. Message: ${result.message}`);
      } catch (err) {}
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
            fetchOrderHistory();
        }
      } catch(e){}
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
      if (item.id && !String(item.id).startsWith('new-')) setDeletedItemIds(prev => [...prev, item.id]);
      setEditingItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddItem = (product) => {
      const newItem = {
          id: `new-${Date.now()}-${Math.random()}`, 
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
            delete payload.id; 
            if (isNew) newItems.push({ ...payload, "Timestamp": new Date() });
            else existingItems.push({ ...payload, id: item.id });
        });

        const res1 = newItems.length > 0 ? await supabase.from('Orders').insert(newItems) : { error: null };
        const res2 = existingItems.length > 0 ? await supabase.from('Orders').upsert(existingItems) : { error: null };

        if (!res1.error && !res2.error) {
            alert("Updated successfully.");
            setIsEditModalOpen(false); 
            fetchOrderHistory(); 
        }
      } catch(e) {}
  };

  // --- FILTERS, SORTING & MEMOIZATION ---
  const categories = useMemo(() => ['All', ...new Set(products.map(p => p.Category || 'Other'))], [products]);

  const filteredProducts = useMemo(() => products.filter(p => {
    const matchesCat = activeCategory === 'All' || p.Category === activeCategory;
    const matchesSearch = !searchTerm || `${p.ProductName} ${p.ProductCode}`.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCat && matchesSearch;
  }).slice(0, 30), [products, activeCategory, searchTerm]);

  const filteredOrderHistory = useMemo(() => orderHistory.filter(group => {
      const rawStatus = getRawStatus(group.info);
      const displayStatus = formatDisplayStatus(rawStatus);
      
      // Status Filter
      if (statusFilter !== 'ALL' && displayStatus !== statusFilter) return false;

      // Text Search
      if (!historySearchTerm) return true;
      const terms = historySearchTerm.toLowerCase().split(' ').filter(Boolean);
      const searchStr = `${group.info.DONumber} ${group.info["Customer Name"]} ${group.info["Delivery Date"]} ${displayStatus}`.toLowerCase();
      return terms.every(t => searchStr.includes(t));
  }), [orderHistory, historySearchTerm, statusFilter]);

  // Apply Sorting Engine
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


  if (loading) return <div className="p-10 flex items-center justify-center h-screen font-black text-gray-300 animate-pulse">FFD SYSTEM ENGINE BOOTING...</div>;

  return (
    <div className="p-3 md:p-8 max-w-full overflow-x-hidden min-h-screen bg-gray-50/50 pb-40 md:pb-32 font-sans relative">
      
      {/* 防缩放输入框全局样式 */}
      <style jsx global>{`
        input, select, textarea { font-size: 16px !important; }
        @supports (-webkit-touch-callout: none) { .h-screen { height: -webkit-fill-available; } }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 10px; }
      `}</style>

      {/* Autopilot Status Toast */}
      {autopilotMessage && (
          <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[500] bg-green-600 text-white px-6 py-3 rounded-full shadow-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 animate-in fade-in slide-in-from-top-10">
              <BoltIcon className="w-5 h-5" />
              {autopilotMessage}
          </div>
      )}

      {/* 桌面端头部 */}
      <div className="hidden sm:flex mb-6 flex-col sm:flex-row justify-between items-start sm:items-center gap-3"> 
         <div>
             <h1 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight">Order Management</h1> 
             <p className="text-[10px] md:text-xs text-gray-400 font-bold uppercase mt-1">Manage single-session and historical orders</p> 
         </div>
         <div className="text-[9px] md:text-xs font-bold text-gray-500 bg-white border border-gray-200 px-3 py-1.5 rounded-full uppercase shadow-sm">
             User: {currentUser}
         </div>
      </div>

      {/* 选项卡导航 */}
      <div className="flex gap-2 mb-4 md:mb-6 overflow-x-auto pb-2 border-b border-gray-200 snap-x custom-scrollbar -mx-3 px-3 sm:mx-0 sm:px-0 shrink-0">
          <button onClick={() => setActiveTab('new')} className={`snap-start shrink-0 px-4 md:px-6 py-2.5 md:py-3 rounded-xl md:rounded-t-2xl font-black text-xs md:text-sm transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === 'new' ? 'bg-green-600 text-white shadow-md' : 'bg-white text-gray-500 border hover:bg-gray-50'}`}>
              <PlusCircleIcon className="w-4 h-4 md:w-5 h-5" /> New Order
          </button>
          <button onClick={() => setActiveTab('list')} className={`snap-start shrink-0 px-4 md:px-6 py-2.5 md:py-3 rounded-xl md:rounded-t-2xl font-black text-xs md:text-sm transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === 'list' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-500 border hover:bg-gray-50'}`}>
              <ClipboardDocumentListIcon className="w-4 h-4 md:w-5 h-5" /> Order History
          </button>
          <button onClick={() => setActiveTab('recurring')} className={`snap-start shrink-0 px-4 md:px-6 py-2.5 md:py-3 rounded-xl md:rounded-t-2xl font-black text-xs md:text-sm transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === 'recurring' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-gray-500 border hover:bg-gray-50'}`}>
              <ArrowPathIcon className="w-4 h-4 md:w-5 h-5" /> Auto-Pilot
          </button>
      </div>

      {/* TAB 1: 新建订单界面 (Fragment wrapping to separate animated container from fixed modals) */}
      {activeTab === 'new' && (
      <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 animate-in fade-in duration-300">
            
            <div className="lg:col-span-2 space-y-4 md:space-y-6">
              
              {/* 极致轻量化的极简客户面板 (Minimalistic Flat UX) */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-2"> 
                <div 
                   className="px-4 py-3.5 flex justify-between items-center cursor-pointer bg-white hover:bg-gray-50 transition-colors"
                   onClick={() => setIsCustomerBoxOpen(!isCustomerBoxOpen)}
                >
                   <div className="flex items-center gap-3">
                       <UserCircleIcon className="w-5 h-5 text-gray-400 shrink-0" />
                       <div className="flex flex-col">
                           <span className="text-sm font-semibold text-gray-800 uppercase tracking-wide">
                               {selectedCustomerValue || 'Select Customer...'}
                           </span>
                           {!isCustomerBoxOpen && deliveryDate && (
                               <span className="text-[10px] font-medium text-gray-500 mt-0.5 uppercase tracking-wider">
                                   {deliveryDate} • {deliveryMode}
                               </span>
                           )}
                       </div>
                   </div>
                   <ChevronDownIcon className={`w-4 h-4 text-gray-400 transition-transform ${isCustomerBoxOpen ? 'rotate-180' : ''}`} />
                </div>

                {isCustomerBoxOpen && (
                    <div className="px-4 pb-4 bg-white animate-in slide-in-from-top-2 duration-200"> 
                       <div className="space-y-1 mt-2">
                          {/* Search Customer */}
                          <div className="border-b border-gray-100 py-2.5">
                             <input list="customer-list" type="text" className="w-full text-sm font-semibold text-gray-900 bg-transparent outline-none placeholder-gray-400 uppercase" value={selectedCustomerValue} onChange={handleCustomerChange} placeholder="SEARCH CUSTOMER / BRANCH..." />
                             <datalist id="customer-list">{customers.map(c => <option key={c.id} value={c.Branch ? `${c.CompanyName} - ${c.Branch}` : c.CompanyName} />)}</datalist>
                          </div>
                          
                          {/* Date & Mode Inline */}
                          <div className="flex gap-4 border-b border-gray-100 py-2.5">
                             <div className="flex-1 flex items-center gap-2">
                                 <span className="text-[10px] font-bold text-gray-400 w-10 uppercase">Date</span>
                                 <input type="date" className="flex-1 text-sm font-semibold text-gray-800 bg-transparent outline-none" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
                             </div>
                             <div className="w-[1px] bg-gray-100 my-1"></div>
                             <div className="flex-1 flex items-center gap-2">
                                 <span className="text-[10px] font-bold text-gray-400 w-10 uppercase">Mode</span>
                                 <select className="flex-1 text-sm font-semibold text-gray-800 bg-transparent outline-none" value={deliveryMode} onChange={e => setDeliveryMode(e.target.value)}>
                                     <option value="Driver">Driver</option>
                                     <option value="Lalamove">Lalamove</option>
                                     <option value="Self Pick-up">Pick-up</option>
                                 </select>
                             </div>
                          </div>
                          
                          {/* Contact & Phone Inline */}
                          <div className="flex gap-4 border-b border-gray-100 py-2.5">
                             <input type="text" className="flex-1 text-sm font-medium text-gray-800 bg-transparent outline-none placeholder-gray-400" value={custDetails.ContactPerson} onChange={(e) => handleDetailChange('ContactPerson', e.target.value)} placeholder="Contact Person" />
                             <div className="w-[1px] bg-gray-100 my-1"></div>
                             <input type="text" className="flex-1 text-sm font-medium text-gray-800 bg-transparent outline-none placeholder-gray-400" value={custDetails.ContactNumber} onChange={(e) => handleDetailChange('ContactNumber', e.target.value)} placeholder="Phone Number" />
                          </div>

                          {/* Address */}
                          <div className="border-b border-gray-100 py-2.5">
                             <input type="text" className="w-full text-sm font-medium text-gray-800 bg-transparent outline-none placeholder-gray-400" value={custDetails.DeliveryAddress} onChange={(e) => handleDetailChange('DeliveryAddress', e.target.value)} placeholder="Full Delivery Address..." />
                          </div>

                          {/* Channel */}
                          <div className="flex items-center gap-3 py-2.5">
                             <span className="text-[10px] font-bold text-gray-400 uppercase w-16">Channel</span>
                             <select className="flex-1 text-sm font-semibold text-gray-800 bg-transparent outline-none" value={salesChannel} onChange={(e) => setSalesChannel(e.target.value)}>
                                 <option>Online / FnB</option><option>Wholesale</option><option>Outlet</option>
                             </select>
                          </div>
                       </div>
                    </div>
                )}
              </div>

              {/* 常用商品快捷栏 */}
              {selectedCustomerValue && quickAddItems.length > 0 && (
                 <div className="animate-in slide-in-from-left-4 duration-500">
                    <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 custom-scrollbar snap-x">
                        {quickAddItems.map(p => (
                            <button key={p.ProductCode} onClick={() => addToCart(p, 1)} className="snap-start shrink-0 bg-white border border-orange-200 p-2.5 rounded-xl shadow-sm flex flex-col items-center gap-1.5 hover:border-orange-400 active:scale-95 transition-all w-24 group">
                                <span className="text-[9px] font-black text-gray-800 uppercase line-clamp-2 text-center h-6 leading-tight group-hover:text-orange-600 transition-colors">{p.ProductName}</span>
                                <div className="text-[8px] text-gray-400 font-bold">{p.BaseUOM}</div>
                            </button>
                        ))}
                    </div>
                 </div>
              )}

              {/* 分类与产品搜索 */}
              <div className="space-y-3">
                 <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 custom-scrollbar">
                    {categories.map(cat => (
                        <button key={cat} onClick={() => setActiveCategory(cat)} className={`shrink-0 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${activeCategory === cat ? 'bg-gray-800 text-white border-gray-800 shadow-md' : 'bg-white text-gray-400 border-gray-100 hover:border-gray-400'}`}>{cat}</button>
                    ))}
                 </div>

                 <div className="sticky top-[0px] z-20 bg-gray-50/90 backdrop-blur-md py-1">
                    <div className="relative shadow-sm rounded-xl overflow-hidden">
                        <input type="text" placeholder="Search catalog..." className="w-full pl-10 p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 text-base md:text-sm font-bold bg-white outline-none" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"><MagnifyingGlassIcon className="w-5 h-5"/></span>
                    </div>
                 </div>
                 
                 {/* 更紧凑的移动端产品卡片 */}
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-6 md:pb-0">
                    {filteredProducts.map(p => {
                        const inputs = productInputs[p.ProductCode] || {};
                        const uoms = Array.from(new Set(p.AllowedUOMs ? p.AllowedUOMs.split(',').map(u => u.trim().toUpperCase()) : [p.BaseUOM]));
                        return (
                          <div key={p.ProductCode} className="bg-white p-3 rounded-2xl border border-gray-200 shadow-sm relative group active:scale-[0.98] flex flex-col justify-between hover:border-green-400 transition-all">
                              <div className={`absolute top-0 right-0 px-2 py-0.5 text-[8px] font-black uppercase rounded-bl-xl border-l border-b ${getStockColor(p.StockBalance)}`}>BAL: {p.StockBalance || '0'} {p.BaseUOM}</div>
                              <div className="pr-12 mb-2"><h3 className="font-black text-gray-800 text-xs uppercase leading-tight line-clamp-2">{p.ProductName}</h3><p className="text-[9px] text-gray-400 font-mono mt-0.5 tracking-widest">{p.ProductCode}</p></div>
                              <div className="flex gap-2 mb-2 bg-gray-50 p-1.5 rounded-xl border border-gray-100">
                                  <select className="bg-white border border-gray-200 rounded-lg text-sm p-1.5 flex-1 font-black uppercase outline-none focus:ring-1 focus:ring-green-500" value={inputs.uom || p.SalesUOM || p.BaseUOM} onChange={(e) => handleProductInputChange(p.ProductCode, 'uom', e.target.value)}>{uoms.map(u => <option key={u} value={u}>{u}</option>)}</select>
                                  <input type="number" placeholder="QTY" className="w-14 border border-gray-200 bg-white rounded-lg text-sm p-1.5 font-black text-center outline-none focus:ring-2 focus:ring-green-500" value={inputs.qty || ''} onChange={(e) => handleProductInputChange(p.ProductCode, 'qty', e.target.value)} />
                              </div>
                              <div className="flex items-center gap-2 mt-auto">
                                  <label className="flex items-center gap-1 cursor-pointer p-1.5 bg-gray-50 rounded-lg border border-gray-100"><input type="checkbox" className="w-3.5 h-3.5 text-red-500 rounded border-gray-300" checked={inputs.replacement || false} onChange={(e) => handleProductInputChange(p.ProductCode, 'replacement', e.target.checked)} /> <span className="text-[8px] font-black text-red-500 uppercase tracking-widest">REP</span></label>
                                  <div className="flex-1 relative"><span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-gray-400">RM</span><input type="number" step="0.01" className="w-full pl-6 pr-2 py-1.5 text-sm border border-gray-200 rounded-lg text-right font-black outline-none disabled:bg-gray-100 focus:ring-2 focus:ring-green-500" disabled={inputs.replacement} value={inputs.price || ''} onChange={(e) => handleProductInputChange(p.ProductCode, 'price', e.target.value)} placeholder="0.00" /></div>
                                  <button onClick={() => addToCart(p)} className="bg-green-600 hover:bg-green-700 text-white rounded-xl w-10 h-10 flex items-center justify-center font-bold shadow-md active:scale-90 shrink-0 transition-transform"><PlusIcon className="w-5 h-5" strokeWidth={3} /></button>
                              </div>
                          </div>
                        );
                    })}
                 </div>
              </div>
            </div>

            {/* 桌面端购物车 */}
            <div className="hidden lg:block lg:col-span-1">
               <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-gray-100 sticky top-4 flex flex-col h-[calc(100vh-6rem)] min-h-[500px]">
                  <div className="flex justify-between items-center mb-6">
                     <h2 className="text-lg font-black text-gray-800 tracking-tight uppercase">Cart Summary</h2>
                     <span className="bg-green-100 text-green-700 text-[10px] font-black px-3 py-1 rounded-full uppercase">{cart.length} items</span>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-3 mb-6 custom-scrollbar pr-1">
                      {cart.length === 0 ? <div className="h-48 flex flex-col items-center justify-center text-gray-300 italic text-sm border-2 border-dashed border-gray-100 rounded-[2rem]">Cart is empty</div> : cart.map((item) => (
                        <div key={item.cartId} className="p-3 bg-gray-50/80 border border-gray-100 rounded-xl relative group">
                            <div className="flex justify-between items-start mb-1">
                                <div className="pr-6 text-[10px] font-black uppercase text-gray-800 leading-tight">{item.ProductName}</div>
                                <button onClick={() => removeFromCart(item.cartId)} className="text-gray-400 hover:text-red-500 absolute top-2 right-2"><XMarkIcon className="w-4 h-4" /></button>
                            </div>
                            <div className="flex items-center justify-between mt-2">
                                 <div className="flex items-center bg-white border border-gray-200 rounded-lg p-0.5"><button onClick={() => updateCartQty(item.cartId, -1)} className="w-6 h-6 flex items-center justify-center text-gray-500 hover:bg-gray-100 rounded"><MinusIcon className="w-3 h-3"/></button><span className="w-6 text-center text-xs font-black">{item.qty}</span><button onClick={() => updateCartQty(item.cartId, 1)} className="w-6 h-6 flex items-center justify-center text-gray-500 hover:bg-gray-100 rounded"><PlusIcon className="w-3 h-3"/></button></div>
                                 <span className="text-[9px] font-black text-gray-500 ml-1 mr-auto">{item.uom}</span>
                                 {item.isReplacement ? <span className="text-[8px] font-black text-white bg-red-400 px-2 py-1 rounded shadow-sm">REP</span> : <span className="text-[10px] font-black text-gray-700 bg-white border border-gray-200 px-2 py-1 rounded">RM {(item.price || 0).toFixed(2)}</span>}
                            </div>
                        </div>
                      ))}
                  </div>
                  <div className="mt-auto pt-4 border-t border-gray-100 space-y-4">
                      <div className="bg-indigo-50/50 border border-indigo-100 p-3 rounded-2xl">
                          <label className="flex items-center gap-2 cursor-pointer mb-2">
                              <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} />
                              <span className="text-[10px] font-black text-indigo-900 uppercase tracking-widest">Save as Weekly Pattern</span>
                          </label>
                          {isRecurring && (
                              <div className="mt-2 animate-in fade-in slide-in-from-top-1">
                                  <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest ml-1">Generate On:</span>
                                  <select className="w-full mt-1 border border-indigo-200 p-2 rounded-xl text-xs font-black bg-white text-indigo-800 outline-none" value={recurringDay} onChange={e => setRecurringDay(e.target.value)}>
                                      {DAYS_OF_WEEK.map(d => <option key={d} value={d}>{d}</option>)}
                                  </select>
                              </div>
                          )}
                      </div>
                      <div className="flex justify-between text-xs font-black text-gray-800 px-1 uppercase tracking-widest"><span>Total Products:</span><span className="text-gray-900 text-sm">{cart.length}</span></div>
                      <button onClick={handleSubmitOrder} disabled={submitting || cart.length === 0} className={`w-full py-4 rounded-2xl text-white font-black text-sm shadow-xl transition-all flex items-center justify-center gap-2 ${submitting || cart.length === 0 ? 'bg-gray-300 cursor-not-allowed shadow-none' : 'bg-green-600 hover:bg-green-700 hover:shadow-green-500/30 active:scale-95'}`}>
                          {submitting ? 'PROCESSING...' : (isRecurring ? 'SAVE PATTERN & ORDER' : 'CONFIRM ORDER')}
                      </button>
                  </div>
               </div>
            </div>
          </div>
          
          {/* 移动端永远显示的底部购物车栏 (从 grid 容器中移出，绝对锚定视口底部) */}
          {!isMobileCartOpen && (
              <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-200 p-3 shadow-[0_-10px_20px_rgba(0,0,0,0.1)] z-[200] animate-in slide-in-from-bottom-2" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
                  <div className="flex items-center justify-between gap-3 max-w-lg mx-auto">
                      <button onClick={() => setIsMobileCartOpen(true)} className="flex items-center justify-center gap-3 bg-gray-50 px-4 py-3.5 rounded-xl border border-gray-200 flex-1 active:bg-gray-100 transition-colors">
                          <div className="relative">
                              <ShoppingCartIcon className="w-6 h-6 text-gray-700" />
                              {cart.length > 0 && (
                                  <span className="absolute -top-1.5 -right-1.5 bg-green-500 text-white text-[9px] font-black w-4 h-4 flex items-center justify-center rounded-full shadow-sm">
                                      {cart.length}
                                  </span>
                              )}
                          </div>
                          <div className="flex flex-col items-start leading-none">
                              <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wide">View Cart</span>
                              <span className="text-xs font-black text-gray-900 mt-1">{cart.length} Products</span>
                          </div>
                      </button>
                      <button 
                          onClick={handleSubmitOrder} 
                          disabled={submitting || cart.length === 0} 
                          className={`text-white font-black py-3.5 px-6 rounded-xl shadow-lg transition active:scale-95 text-xs uppercase tracking-widest flex-1 ${submitting || cart.length === 0 ? 'bg-gray-300 shadow-none' : 'bg-green-600 hover:bg-green-700'}`}
                      >
                          {submitting ? 'PROCESSING...' : 'CONFIRM'}
                      </button>
                  </div>
              </div>
          )}

          {/* 移动端购物车弹窗 (从 grid 容器中移出) */}
          {isMobileCartOpen && (
               <div className="lg:hidden fixed inset-0 bg-white z-[300] flex flex-col h-[100dvh] w-screen overflow-hidden animate-in slide-in-from-bottom-full duration-300">
                  <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50 shrink-0" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))' }}>
                      <div className="flex items-center gap-2"><ShoppingCartIcon className="w-6 h-6 text-green-600" /><h2 className="text-base font-black text-gray-800 uppercase tracking-tight">Review Cart</h2></div>
                      <button onClick={() => setIsMobileCartOpen(false)} className="p-2 bg-gray-200 rounded-full text-gray-600"><XMarkIcon className="w-5 h-5"/></button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-100/50 custom-scrollbar pb-24">
                      {cart.map((item) => (
                          <div key={item.cartId} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 relative">
                              <button onClick={() => removeFromCart(item.cartId)} className="absolute top-3 right-3 text-gray-300 hover:text-red-500 p-1"><XMarkIcon className="w-4 h-4" /></button>
                              <div className="text-xs font-black uppercase text-gray-800 pr-8 mb-3">{item.ProductName}</div>
                              <div className="flex items-center justify-between">
                                  <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg p-1">
                                      <button onClick={() => updateCartQty(item.cartId, -1)} className="w-8 h-8 flex items-center justify-center text-gray-600 bg-white rounded shadow-sm active:scale-90"><MinusIcon className="w-4 h-4"/></button>
                                      <span className="w-8 text-center text-sm font-black">{item.qty}</span>
                                      <button onClick={() => updateCartQty(item.cartId, 1)} className="w-8 h-8 flex items-center justify-center text-gray-600 bg-white rounded shadow-sm active:scale-90"><PlusIcon className="w-4 h-4"/></button>
                                  </div>
                                  <div className="flex flex-col items-end">
                                      <span className="text-[10px] font-black text-gray-500 uppercase mx-2 mb-1">{item.uom}</span>
                                      {item.isReplacement ? <span className="text-[9px] font-black text-white bg-red-400 px-2 py-1 rounded shadow-sm">REP</span> : <span className="text-[11px] font-black text-gray-700 bg-gray-50 border border-gray-200 px-2 py-1 rounded">RM {(item.price * item.qty).toFixed(2)}</span>}
                                  </div>
                              </div>
                          </div>
                      ))}
                      {cart.length === 0 && <div className="text-center p-10 text-gray-400 font-bold italic text-sm">Cart is empty</div>}
                  </div>

                  <div className="bg-white border-t border-gray-200 shrink-0 shadow-[0_-10px_20px_rgba(0,0,0,0.05)]">
                      <div className="p-4 space-y-4" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
                          <div className="flex justify-between items-end mb-2">
                              <div><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Products</p><h3 className="text-2xl font-black text-gray-900 leading-none">{cart.length}</h3></div>
                              <div className="bg-indigo-50 border border-indigo-100 p-2.5 rounded-xl"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="w-5 h-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} /><span className="text-[10px] font-black text-indigo-900 uppercase tracking-widest">Save Pattern</span></label></div>
                          </div>
                          {isRecurring && <select className="w-full mt-2 border border-indigo-200 p-3 rounded-xl text-base font-black bg-white text-indigo-800 outline-none" value={recurringDay} onChange={e => setRecurringDay(e.target.value)}>{DAYS_OF_WEEK.map(d => <option key={d} value={d}>{d}</option>)}</select>}
                          <button onClick={handleSubmitOrder} disabled={submitting || cart.length === 0} className={`w-full py-4 rounded-xl text-white font-black text-sm shadow-xl transition-all flex items-center justify-center gap-2 ${submitting || cart.length === 0 ? 'bg-gray-300 cursor-not-allowed' : 'bg-green-600 active:scale-95'}`}>
                              {submitting ? 'PROCESSING...' : (isRecurring ? 'SAVE PATTERN & SUBMIT' : 'SUBMIT ORDER')}
                          </button>
                      </div>
                  </div>
               </div>
          )}
      </>
      )}

      {/* TAB 2: ORDER HISTORY LIST */}
      {activeTab === 'list' && (
      <>
      {/* TAB 2: ORDER HISTORY LIST (Minimal) */}
      {activeTab === 'list' && (
      <div className="animate-in fade-in h-[calc(100vh-140px)] flex flex-col relative overflow-hidden">
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

         {/* Mobile History View (Minimal Rows) */}
         <div className="md:hidden flex-1 overflow-y-auto space-y-0 custom-scrollbar pb-20">
            {displayedHistory.map((group) => {
                   const rawStatus = getRawStatus(group.info);
                   const isSelected = selectedOrders.includes(group.info.DONumber);
                   return (
                       <div key={group.info.DONumber} className={`bg-white border rounded-2xl p-4 shadow-sm relative transition-all ${isSelected ? 'border-blue-400 ring-1 ring-blue-400 bg-blue-50/30' : 'border-gray-100'}`} onClick={() => toggleOrderSelection(group.info.DONumber)}>
                           <div className="flex justify-between items-start mb-2">
                               <div className="flex flex-col gap-1">
                                   <span className="font-mono text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 w-fit">{group.info.DONumber}</span>
                                   <span className="text-[9px] font-bold text-gray-500">{new Date(group.info["Delivery Date"]).toLocaleDateString('en-GB')}</span>
                               </div>
                               <span className={`px-2 py-1 rounded-md text-[8px] font-black uppercase border ${getStatusColor(rawStatus)}`}>{formatDisplayStatus(rawStatus)}</span>
                           </div>
                           <div className="font-black text-gray-800 text-sm uppercase leading-tight mb-2 pr-6">
                               {group.info["Customer Name"]}
                           </div>
                           <div className="flex items-center gap-2 mb-3 border-t border-gray-50 pt-2">
                               <span className="bg-gray-100 text-gray-600 text-[10px] font-black px-2 py-1 rounded-md">{group.items.length} Items</span>
                           </div>
                           <div className="flex justify-end gap-2 border-t border-gray-100 pt-3" onClick={e => e.stopPropagation()}>
                               <button onClick={() => openEditModal(group)} className="p-2 bg-gray-50 text-blue-600 rounded-lg"><PencilSquareIcon className="w-4 h-4"/></button>
                               <button onClick={() => handlePrintOrder(group.info.DONumber)} className="p-2 bg-gray-50 text-gray-600 rounded-lg"><PrinterIcon className="w-4 h-4"/></button>
                               <button onClick={() => handleSendToShipday(group.info.DONumber)} className="p-2 bg-gray-50 text-green-600 rounded-lg"><TruckIcon className="w-4 h-4"/></button>
                             <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                                 <button onClick={() => openEditModal(group)}><PencilSquareIcon className="w-4 h-4 hover:text-black"/></button>
                                 <button onClick={() => handlePrintOrder(group.info.DONumber)}><PrinterIcon className="w-4 h-4 hover:text-black"/></button>
                             </div>
                         </div>
                     </div>
                 )
            })}
         </div>

         {/* Desktop Table View (Minimal Table) */}
         <div className="hidden md:block flex-1 overflow-auto custom-scrollbar">
             <table className="w-full text-left whitespace-nowrap text-sm">
                 <thead className="text-gray-400 border-b border-gray-200 sticky top-0 bg-white">
                     <tr>
                        <th className="py-3 font-medium text-center w-10"><input type="checkbox" className="rounded text-black focus:ring-black border-gray-300" checked={displayedHistory.length > 0 && selectedOrders.length === displayedHistory.length} onChange={toggleSelectAll} /></th>
                        <th className="py-3 font-medium cursor-pointer hover:text-black transition-colors select-none" onClick={() => requestSort('Delivery Date')}>Date {sortConfig.key === 'Delivery Date' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                        <th className="py-3 font-medium cursor-pointer hover:text-black transition-colors select-none" onClick={() => requestSort('DONumber')}>DO Number {sortConfig.key === 'DONumber' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                        <th className="py-3 font-medium cursor-pointer hover:text-black transition-colors select-none" onClick={() => requestSort('Customer Name')}>Customer {sortConfig.key === 'Customer Name' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                        <th className="py-3 font-medium text-center cursor-pointer hover:text-black transition-colors select-none" onClick={() => requestSort('Items')}>Items {sortConfig.key === 'Items' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                        <th className="py-3 font-medium cursor-pointer hover:text-black transition-colors select-none" onClick={() => requestSort('Status')}>Status {sortConfig.key === 'Status' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                        <th className="py-3 font-medium text-right">Actions</th>
                     </tr>
                 </thead>
                 <tbody className="text-gray-700">
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
                               <td className="p-4">
                                   <div className="font-black text-gray-800 text-base uppercase max-w-[350px] whitespace-normal leading-tight" title={group.info["Customer Name"]}>{group.info["Customer Name"]}</div>
                               </td>
                               <td className="p-4 text-center"><span className="bg-white border border-gray-100 shadow-sm px-3 py-1 rounded-full font-black text-sm">{group.items.length}</span></td>
                               <td className="p-4 text-center"><span className={`px-2.5 py-1.5 rounded-full text-[10px] font-black uppercase border shadow-sm whitespace-nowrap ${getStatusColor(rawStatus)}`}>{formatDisplayStatus(rawStatus)}</span></td>
                               <td className="p-4 text-right pr-6" onClick={(e) => e.stopPropagation()}>
                                   <div className="flex items-center justify-end gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity w-full">
                                       <button onClick={() => openEditModal(group)} className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition"><PencilSquareIcon className="w-5 h-5" /></button>
                                       <button onClick={() => handlePrintOrder(group.info.DONumber)} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"><PrinterIcon className="w-5 h-5" /></button>
                                       <button onClick={() => handleSendToShipday(group.info.DONumber)} className="p-2 text-green-600 hover:bg-green-100 rounded-lg transition"><TruckIcon className="w-5 h-5" /></button>
                                       <button onClick={() => handleDeleteDO(group.info.DONumber)} className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition"><TrashIcon className="w-5 h-5" /></button>
                                   </div>
                               </td>
                           </tr>
                       )})}
                       {displayedHistory.length === 0 && <tr><td colSpan="7" className="p-16 text-center text-gray-300 italic font-bold">No orders match your current filter.</td></tr>}
                   </tbody>
               </table>
           </div>
        </div>)}

        {/* 提取到外面，避免被父级 container clip */}
        {selectedOrders.length > 0 && (
             <div className="fixed bottom-4 md:bottom-8 left-1/2 transform -translate-x-1/2 w-[92%] sm:w-max bg-gray-900/95 backdrop-blur-xl text-white p-3 sm:px-6 sm:py-4 rounded-2xl sm:rounded-full shadow-[0_20px_40px_rgba(0,0,0,0.4)] flex flex-col sm:flex-row items-center gap-3 sm:gap-6 z-[100] animate-in slide-in-from-bottom-10 border border-gray-700">
                 
                 <div className="flex items-center justify-between w-full sm:w-auto sm:border-r border-gray-700 sm:pr-6 shrink-0">
                     <div className="flex items-center gap-3">
                         <span className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-black text-xs shadow-inner">
                             {selectedOrders.length}
                         </span>
                         <span className="font-bold text-[10px] md:text-xs uppercase tracking-widest text-gray-300">Selected</span>
                     </div>
                     <button onClick={() => setSelectedOrders([])} className="sm:hidden text-gray-400 hover:text-white bg-gray-800 p-1.5 rounded-full transition">
                         <XMarkIcon className="w-5 h-5" />
                     </button>
                 </div>
                 
                 <div className="flex gap-2 w-full sm:w-auto overflow-x-auto custom-scrollbar pb-1 sm:pb-0 snap-x">
                     <button onClick={() => setIsBulkEditOpen(true)} className="flex items-center gap-2 bg-gray-800 sm:bg-transparent hover:bg-white/10 px-4 py-2.5 sm:py-2 rounded-xl transition font-bold text-[10px] md:text-xs shrink-0 snap-start border border-gray-700 sm:border-none">
                         <PencilSquareIcon className="w-4 h-4 text-blue-400" /> Multi-Edit
                     </button>
                     <button onClick={handleBulkPrint} className="flex items-center gap-2 bg-gray-800 sm:bg-transparent hover:bg-white/10 px-4 py-2.5 sm:py-2 rounded-xl transition font-bold text-[10px] md:text-xs shrink-0 snap-start border border-gray-700 sm:border-none">
                         <PrinterIcon className="w-4 h-4 text-gray-300" /> Batch Print
                     </button>
                     <button onClick={handleBulkShipday} className="flex items-center gap-2 bg-gray-800 sm:bg-transparent hover:bg-white/10 px-4 py-2.5 sm:py-2 rounded-xl transition font-bold text-[10px] md:text-xs shrink-0 snap-start border border-gray-700 sm:border-none">
                         <TruckIcon className="w-4 h-4 text-green-400" /> Push Shipday
                     </button>
                     <button onClick={handleBulkDelete} className="flex items-center gap-2 bg-red-900/30 sm:bg-transparent hover:bg-red-500/20 px-4 py-2.5 sm:py-2 rounded-xl transition font-bold text-[10px] md:text-xs text-red-400 hover:text-red-300 shrink-0 snap-start border border-red-900/50 sm:border-none">
                         <TrashIcon className="w-4 h-4" /> Batch Delete
                     </button>
                 </div>
                 
                 <button onClick={() => setSelectedOrders([])} className="hidden sm:block text-gray-400 hover:text-white transition bg-gray-800 p-2 rounded-full hover:bg-gray-700 shrink-0" title="Clear Selection">
                     <XMarkIcon className="w-5 h-5" />
                 </button>
             </div>
         )}
      </>
      )}

      {/* TAB 3: WEEKLY PATTERNS / AUTOPILOT */}
      {activeTab === 'recurring' && (
      <div className="bg-white p-4 md:p-6 rounded-[2rem] shadow-xl border border-indigo-100 animate-in fade-in h-[calc(100vh-140px)] flex flex-col relative overflow-hidden">
         <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 flex-none">
             <div>
                <h2 className="text-lg md:text-xl font-black text-indigo-900 tracking-tight flex items-center gap-2 uppercase">
                    <ArrowPathIcon className="w-6 h-6 md:w-7 md:h-7 text-indigo-600" /> Weekly Auto-Orders
                </h2>
                <p className="text-[9px] md:text-[10px] font-black text-indigo-400 uppercase tracking-widest mt-1">Templates saved from checkout</p>
             </div>
             
             <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-indigo-50 border border-indigo-100 p-2 md:p-3 rounded-2xl w-full sm:w-auto">
                 <div className="flex flex-col px-2">
                     <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest mb-1">Target Date ({getTargetDayName()})</span>
                     <input type="date" value={targetGenDate} onChange={e=>setTargetGenDate(e.target.value)} className="bg-transparent font-black text-indigo-900 text-xs md:text-sm outline-none cursor-pointer w-full" />
                 </div>
                 <button onClick={handleGenerateAutos} disabled={isGenerating} className="bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 px-6 rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-md active:scale-95 disabled:opacity-50 uppercase tracking-widest w-full sm:w-auto">
                     <PlayCircleIcon className="w-5 h-5" />
                     {isGenerating ? 'RUNNING...' : 'GENERATE TODAY'}
                 </button>
             </div>
         </div>

         <div className="flex-1 overflow-auto custom-scrollbar border border-indigo-50 rounded-3xl bg-gray-50/30 p-2 md:p-4">
             <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
                 {standingOrders.map(t => (
                     <div key={t.id} className="bg-white p-4 md:p-5 rounded-2xl border border-gray-100 shadow-sm hover:border-indigo-300 transition-all">
                         <div className="flex justify-between items-start mb-3">
                             <span className="px-2 py-1 md:px-2.5 md:py-1 rounded-lg text-[8px] md:text-[9px] font-black uppercase tracking-widest border bg-indigo-50 text-indigo-600 border-indigo-200">
                                 Every {t.DeliveryDay}
                             </span>
                             <button onClick={() => deletePattern(t.id)} className="p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500 rounded-md transition"><TrashIcon className="w-4 h-4 md:w-5 md:h-5"/></button>
                         </div>
                         <h4 className="font-black text-gray-800 text-sm md:text-base uppercase leading-tight mb-1 pr-4">{t.CustomerName}</h4>
                         <p className="text-[9px] md:text-[10px] text-gray-500 font-medium mb-3 truncate max-w-full">{t.DeliveryAddress}</p>
                         
                         <div className="border-t border-gray-50 pt-3 text-[10px] md:text-xs font-bold text-gray-600 flex justify-between">
                             <span>{t.Items?.length || 0} Items</span>
                             <span>Mode: {t.DeliveryMode}</span>
                         </div>
                     </div>
                 ))}
                 {standingOrders.length === 0 && (
                     <div className="col-span-full py-20 flex flex-col items-center text-center text-indigo-300 italic font-bold px-4">
                         <ArrowPathIcon className="w-12 h-12 md:w-16 md:h-16 mb-4 opacity-20" />
                         No weekly patterns found. <br/><span className="text-[10px] md:text-xs mt-2 font-medium">Create one by checking the "Save as Weekly Pattern" box when placing a New Order.</span>
                     </div>
                 )}
             </div>
         </div>
      </div>
      )}

      {/* BULK EDIT MODAL */}
      {isBulkEditOpen && (
          <div className="fixed inset-0 bg-black/60 z-[110] flex items-end sm:items-center justify-center sm:p-4 backdrop-blur-sm">
             <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg p-6 sm:p-8 shadow-2xl flex flex-col animate-in slide-in-from-bottom-10 sm:zoom-in duration-200 border-t border-gray-100 sm:border max-h-[90dvh]">
                 <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4 shrink-0">
                     <div>
                         <h2 className="text-lg md:text-xl font-black text-gray-800 uppercase tracking-tight">Bulk Edit Orders</h2>
                         <p className="text-[10px] md:text-xs text-gray-400 font-bold mt-1">Applying changes to <span className="text-blue-600">{selectedOrders.length}</span> orders.</p>
                     </div>
                     <button onClick={() => setIsBulkEditOpen(false)} className="text-gray-400 hover:text-red-500 text-2xl font-bold bg-gray-50 hover:bg-red-50 w-10 h-10 rounded-full flex items-center justify-center transition-all pb-1">×</button>
                 </div>
                 
                 <div className="space-y-4 mb-6 overflow-y-auto custom-scrollbar px-1">
                     <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
                         <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">New Delivery Date</label>
                         <input type="date" className="w-full p-3 border border-gray-200 bg-white rounded-xl outline-none font-bold text-base md:text-sm focus:ring-2 focus:ring-blue-500" value={bulkEditData.deliveryDate} onChange={e => setBulkEditData({...bulkEditData, deliveryDate: e.target.value})} />
                         <p className="text-[9px] text-gray-400 mt-2 italic">*Leave blank to keep existing dates</p>
                     </div>
                     
                     <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                         <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Delivery Mode Override</label>
                         <select className="w-full p-3 border border-gray-200 rounded-xl outline-none font-bold text-base md:text-sm focus:ring-2 focus:ring-blue-500" value={bulkEditData.deliveryMode} onChange={e => setBulkEditData({...bulkEditData, deliveryMode: e.target.value})}>
                             <option value="">-- No Change --</option>
                             <option value="Driver">Driver</option>
                             <option value="Lalamove">Lalamove</option>
                             <option value="Self Pick-up">Self Pick-up</option>
                         </select>
                     </div>

                     <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                         <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Force Status Update</label>
                         <select className="w-full p-3 border border-gray-200 rounded-xl outline-none font-bold text-base md:text-sm focus:ring-2 focus:ring-blue-500" value={bulkEditData.status} onChange={e => setBulkEditData({...bulkEditData, status: e.target.value})}>
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

                 <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 shrink-0 pb-4 sm:pb-0">
                    <button onClick={() => setIsBulkEditOpen(false)} className="flex-1 sm:flex-none px-6 py-4 sm:py-3 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition-all active:scale-95 text-xs uppercase tracking-widest">Cancel</button>
                    <button onClick={handleBulkEditSave} className="flex-1 sm:flex-none px-8 py-4 sm:py-3 bg-blue-600 text-white font-black rounded-xl shadow-lg hover:bg-blue-700 transition-all active:scale-95 text-xs uppercase tracking-widest">Apply to {selectedOrders.length}</button>
                </div>
             </div>
          </div>
      )}

      {/* EDIT INDIVIDUAL ORDER MODAL */}
      {isEditModalOpen && editingOrder && (
          <div className="fixed inset-0 bg-black/60 z-[110] flex items-end sm:items-center justify-center sm:p-4 backdrop-blur-sm">
            <div className="bg-white rounded-t-3xl sm:rounded-[2.5rem] w-full max-w-5xl p-5 sm:p-8 shadow-2xl flex flex-col max-h-[90dvh] sm:max-h-[95vh] animate-in slide-in-from-bottom-10 sm:zoom-in duration-200 border-t sm:border border-gray-100">
                
                {/* Modal Header */}
                <div className="flex justify-between items-center mb-4 sm:mb-6 border-b pb-4 sm:pb-6 shrink-0">
                    <div>
                        <h2 className="text-lg sm:text-2xl font-black text-gray-800 uppercase flex items-center gap-2">
                            Edit <span className="text-blue-600 font-mono tracking-tighter">{editingOrder.DONumber}</span>
                        </h2>
                        <div className="flex items-center gap-2 mt-2">
                            <span className="text-[9px] sm:text-[10px] font-black text-gray-400 uppercase tracking-widest hidden sm:block">Status:</span>
                            <select className={`border rounded-lg px-2 sm:px-4 py-1 sm:py-1.5 text-[9px] sm:text-[10px] font-black outline-none shadow-sm transition-all ${getStatusColor(getRawStatus(editingOrder))}`} value={formatDisplayStatus(getRawStatus(editingOrder))} onChange={e => setEditingOrder({...editingOrder, Status: e.target.value})}>
                                <option value="PENDING">PENDING</option><option value="ASSIGNED">ASSIGNED</option><option value="IN TRANSIT">IN TRANSIT</option><option value="DELIVERED">DELIVERED</option><option value="FAILED">FAILED</option><option value="CANCELLED">CANCELLED</option>
                            </select>
                        </div>
                    </div>
                    <button onClick={() => setIsEditModalOpen(false)} className="text-gray-400 hover:text-red-500 text-3xl font-bold bg-gray-50 hover:bg-red-50 w-10 h-10 rounded-full flex items-center justify-center transition-all pb-1">×</button>
                </div>
                
                <div className="overflow-y-auto flex-1 custom-scrollbar px-1 pb-4">
                    {/* Form Fields */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6 bg-gray-50/50 p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-gray-100 shadow-inner">
                        <div className="sm:col-span-2"><label className="block text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1 ml-1">Customer</label><input className="w-full p-3 border border-gray-200 bg-white rounded-xl outline-none font-black text-base md:text-xs focus:ring-2 focus:ring-blue-500" value={editingOrder["Customer Name"]} onChange={e => setEditingOrder({...editingOrder, "Customer Name": e.target.value})} /></div>
                        <div className="sm:col-span-2"><label className="block text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1 ml-1">Address</label><input className="w-full p-3 border border-gray-200 bg-white rounded-xl outline-none font-medium text-base md:text-xs focus:ring-2 focus:ring-blue-500" value={editingOrder["Delivery Address"]} onChange={e => setEditingOrder({...editingOrder, "Delivery Address": e.target.value})} /></div>
                        <div><label className="block text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1 ml-1">Contact</label><input className="w-full p-3 border border-gray-200 bg-white rounded-xl outline-none font-black text-base md:text-xs focus:ring-2 focus:ring-blue-500" value={editingOrder["Contact Person"] || ''} onChange={e => setEditingOrder({...editingOrder, "Contact Person": e.target.value})} /></div>
                        <div><label className="block text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1 ml-1">Phone</label><input className="w-full p-3 border border-gray-200 bg-white rounded-xl outline-none font-black text-base md:text-xs focus:ring-2 focus:ring-blue-500" value={editingOrder["Contact Number"] || ''} onChange={e => setEditingOrder({...editingOrder, "Contact Number": e.target.value})} /></div>
                        <div><label className="block text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1 ml-1">Date</label><input type="date" className="w-full p-3 border border-gray-200 rounded-xl outline-none font-black text-base md:text-xs bg-blue-50 text-blue-800 focus:ring-2 focus:ring-blue-500" value={editingOrder["Delivery Date"]} onChange={e => setEditingOrder({...editingOrder, "Delivery Date": e.target.value})} /></div>
                        <div>
                            <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1 ml-1">Mode</label>
                            <select className="w-full p-3 border border-gray-200 bg-white rounded-xl outline-none font-black text-base md:text-xs focus:ring-2 focus:ring-blue-500" value={editingOrder["Delivery Mode"] || 'Driver'} onChange={e => setEditingOrder({...editingOrder, "Delivery Mode": e.target.value})}>
                                <option value="Driver">Driver</option><option value="Lalamove">Lalamove</option><option value="Self Pick-up">Self Pick-up</option>
                            </select>
                        </div>
                    </div>

                    {/* Items List (Mobile Cards & Desktop Table) */}
                    <div className="mb-6">
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-1">Order Items</label>
                        
                        {/* Mobile Cards for Items */}
                        <div className="md:hidden space-y-3">
                            {editingItems.map((item, idx) => (
                                <div key={item.id || idx} className={`p-4 rounded-2xl border relative ${item.Replacement === 'YES' ? 'bg-red-50/30 border-red-200' : 'bg-white border-gray-200 shadow-sm'}`}>
                                    <button onClick={() => handleDeleteItem(idx)} className="absolute top-3 right-3 p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 rounded-lg"><TrashIcon className="w-4 h-4"/></button>
                                    
                                    <div className="pr-8 mb-3">
                                        <select className="w-full p-2 border-none bg-transparent text-base md:text-xs font-black uppercase outline-none focus:ring-2 focus:ring-blue-500 -ml-2" value={item["Order Items"]} onChange={e => handleEditItemChange(idx, 'Order Items', e.target.value)}>
                                            <option value={item["Order Items"]}>{item["Order Items"]}</option>
                                            {products.filter(p => p.ProductName !== item["Order Items"]).map(p => <option key={p.ProductCode} value={p.ProductName}>{p.ProductName}</option>)}
                                        </select>
                                    </div>
                                    
                                    <div className="flex items-center gap-2 mb-3">
                                        <input type="number" className="w-16 p-2 border border-gray-200 rounded-lg text-center font-black text-base md:text-xs" value={item.Quantity} onChange={e => handleEditItemChange(idx, 'Quantity', e.target.value)} />
                                        <select className="w-20 p-2 border border-gray-200 rounded-lg text-center font-bold uppercase text-base md:text-xs outline-none" value={item.UOM} onChange={e => handleEditItemChange(idx, 'UOM', e.target.value)}>
                                            {(() => {
                                                const matchedProd = products.find(p => p.ProductCode === item["Product Code"]);
                                                const uoms = matchedProd && matchedProd.AllowedUOMs ? matchedProd.AllowedUOMs.split(',').map(u => u.trim().toUpperCase()).filter(Boolean) : [item.UOM, 'KG', 'CTN', 'PCS'];
                                                return Array.from(new Set([item.UOM, ...uoms])).filter(Boolean).map(u => <option key={u} value={u}>{u}</option>);
                                            })()}
                                        </select>
                                    </div>

                                    <div className="flex items-center justify-between border-t border-gray-50 pt-3 mt-1">
                                        <label className="flex items-center gap-1.5 cursor-pointer">
                                            <input type="checkbox" className="w-4 h-4 text-red-500 rounded border-gray-300" checked={item.Replacement === 'YES'} onChange={e => { handleEditItemChange(idx, 'Replacement', e.target.checked ? 'YES' : ''); if (e.target.checked) handleEditItemChange(idx, 'Price', 0); }} />
                                            <span className="text-[9px] font-black text-red-500 uppercase tracking-widest">REP</span>
                                        </label>
                                        <div className="relative w-24">
                                            <span className="absolute left-2 top-2 text-[8px] font-bold text-gray-400">RM</span>
                                            <input type="number" step="0.01" className="w-full pl-7 pr-2 py-1.5 border border-gray-200 rounded-lg text-right font-black text-base md:text-xs outline-none" value={item.Price} onChange={e => handleEditItemChange(idx, 'Price', e.target.value)} disabled={item.Replacement === 'YES'} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Desktop Table for Items */}
                        <div className="hidden md:block overflow-x-auto border border-gray-200 rounded-2xl shadow-inner bg-white">
                            <table className="w-full text-left text-xs whitespace-nowrap min-w-[700px]">
                                <thead className="bg-gray-50 font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 text-[10px]">
                                    <tr><th className="p-3 pl-4">Product Catalog Item</th><th className="p-3 w-20 text-center">Qty</th><th className="p-3 w-24 text-center">UOM</th><th className="p-3 w-28 text-right">Price</th><th className="p-3 w-20 text-center">REP?</th><th className="p-3 w-12 pr-4"></th></tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {editingItems.map((item, idx) => (
                                        <tr key={item.id || idx} className={item.Replacement === 'YES' ? 'bg-red-50/20' : 'hover:bg-gray-50/50'}>
                                            <td className="p-2 pl-4">
                                                <select className="w-full p-2 border border-gray-200 rounded-lg text-xs font-black uppercase outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" value={item["Order Items"]} onChange={e => handleEditItemChange(idx, 'Order Items', e.target.value)}>
                                                    <option value={item["Order Items"]}>{item["Order Items"]}</option>
                                                    {products.filter(p => p.ProductName !== item["Order Items"]).map(p => <option key={p.ProductCode} value={p.ProductName}>{p.ProductName}</option>)}
                                                </select>
                                            </td>
                                            <td className="p-2 text-center"><input type="number" className="w-full p-2 border border-gray-200 rounded-lg text-center font-black outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" value={item.Quantity} onChange={e => handleEditItemChange(idx, 'Quantity', e.target.value)} /></td>
                                            <td className="p-2 text-center">
                                                <select className="w-full p-2 border border-gray-200 rounded-lg text-center font-bold uppercase outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" value={item.UOM} onChange={e => handleEditItemChange(idx, 'UOM', e.target.value)}>
                                                    {(() => {
                                                        const matchedProd = products.find(p => p.ProductCode === item["Product Code"]);
                                                        const uoms = matchedProd && matchedProd.AllowedUOMs ? matchedProd.AllowedUOMs.split(',').map(u => u.trim().toUpperCase()).filter(Boolean) : [item.UOM, 'KG', 'CTN', 'PCS'];
                                                        return Array.from(new Set([item.UOM, ...uoms])).filter(Boolean).map(u => <option key={u} value={u}>{u}</option>);
                                                    })()}
                                                </select>
                                            </td>
                                            <td className="p-2 text-right"><input type="number" step="0.01" className="w-full p-2 border border-gray-200 rounded-lg text-right font-black outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" value={item.Price} onChange={e => handleEditItemChange(idx, 'Price', e.target.value)} disabled={item.Replacement === 'YES'} /></td>
                                            <td className="p-2 text-center"><input type="checkbox" className="w-4 h-4 text-red-500 rounded border-gray-300 focus:ring-red-500 cursor-pointer shadow-sm" checked={item.Replacement === 'YES'} onChange={e => { handleEditItemChange(idx, 'Replacement', e.target.checked ? 'YES' : ''); if (e.target.checked) handleEditItemChange(idx, 'Price', 0); }} /></td>
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
                            <span className="absolute left-3 sm:left-4 top-3.5 text-gray-400"><MagnifyingGlassIcon className="w-4 h-4 sm:w-5 sm:h-5"/></span>
                            <input type="text" placeholder="Search catalog..." className="w-full pl-9 sm:pl-11 p-3 sm:p-3.5 border border-gray-200 bg-gray-50 rounded-xl text-base md:text-xs font-bold outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all" value={productSearchTerm} onChange={e => setProductSearchTerm(e.target.value)} />
                        </div>
                        {productSearchTerm && (
                            <div className="absolute left-4 right-4 mt-2 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto z-20 custom-scrollbar divide-y divide-gray-50">
                                {products.filter(p => p.ProductName.toLowerCase().includes(productSearchTerm.toLowerCase())).map(p => (
                                    <div key={p.ProductCode} onClick={() => handleAddItem(p)} className="p-3 sm:p-4 hover:bg-blue-50 cursor-pointer flex justify-between items-center group/add text-[10px] sm:text-xs uppercase font-black">
                                        <div>{p.ProductName} <span className="text-[9px] sm:text-[10px] text-gray-400 ml-2 font-mono tracking-tighter">{p.ProductCode}</span></div>
                                        <span className="bg-blue-600 text-white p-1 rounded flex items-center justify-center opacity-100 md:opacity-0 md:group-hover/add:opacity-100 transition-all font-black shadow-sm"><PlusIcon className="w-3 h-3 sm:w-4 sm:h-4"/></span>
                                    </div>
                                ))}
                                {products.filter(p => p.ProductName.toLowerCase().includes(productSearchTerm.toLowerCase())).length === 0 && (
                                    <div className="p-4 text-center text-[10px] text-gray-400 font-bold italic">No match found</div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex justify-end gap-2 sm:gap-3 mt-4 shrink-0 pt-4 sm:pt-6 border-t border-gray-100 pb-2 sm:pb-0">
                    <button onClick={() => setIsEditModalOpen(false)} className="flex-1 sm:flex-none px-4 sm:px-8 py-3.5 sm:py-4 bg-gray-100 text-gray-600 font-black rounded-xl sm:rounded-2xl hover:bg-gray-200 transition-all active:scale-95 uppercase text-[10px] sm:text-xs tracking-widest border border-gray-200">Cancel</button>
                    <button onClick={saveEditedOrder} className="flex-[2] sm:flex-none px-6 sm:px-10 py-3.5 sm:py-4 bg-blue-600 text-white font-black rounded-xl sm:rounded-2xl shadow-lg hover:bg-blue-700 hover:shadow-blue-500/30 transition-all active:scale-95 uppercase text-[10px] sm:text-xs tracking-widest flex justify-center items-center gap-2">
                        <CheckIcon className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={3} /> Save Order
                    </button>
                </div>
            </div>
          </div>
      )}
    </div>
  );
}