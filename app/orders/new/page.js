'use client';
import React, { useState, useEffect, useMemo } from 'react';

// ==================================================================
// ⚠️ 重要提示：当您将此代码复制回本地项目时，请取消注释以下真实的导入，
// 并删除下方的 MOCK API 和 MOCK NEXT.JS 部分！
// ==================================================================
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';


import { 
  PlusCircleIcon, 
  XMarkIcon,
  ChevronDownIcon,
  ChevronLeftIcon, // <-- FIXED: Added missing icon import for the mobile cart!
  MagnifyingGlassIcon,
  MinusIcon,
  PlusIcon,
  ShoppingCartIcon,
  UserCircleIcon,
  ClipboardDocumentListIcon,
  ArrowPathIcon,
  CheckIcon
} from '@heroicons/react/24/outline';

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
  // 1. Data States
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState('');

  // 2. UI States
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

  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringDay, setRecurringDay] = useState('Monday');
  const [isConsignment, setIsConsignment] = useState(false); // NEW STATE ADDED

  // 3. Router Hooks
  const router = useRouter();
  const pathname = usePathname();
  const cleanPath = pathname?.endsWith('/') && pathname !== '/' ? pathname.slice(0, -1) : pathname;

  // 4. Effects
  useEffect(() => {
      if (isMobileCartOpen) {
          document.body.style.overflow = 'hidden';
      } else {
          document.body.style.overflow = '';
      }
      return () => { document.body.style.overflow = ''; };
  }, [isMobileCartOpen]);

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

        const { data: custData } = await supabase.from('Customers').select('*').order('CompanyName');
        const { data: prodData } = await supabase.from('ProductMaster').select('ProductCode, ProductName, BaseUOM, SalesUOM, Category, StockBalance, ReportingUOM, AllowedUOMs').order('ProductName');

        setCustomers(custData || []);
        setProducts(prodData || []);
      } catch(err) {}
      setLoading(false);
    }
    
    loadData();
  }, [router]);

  useEffect(() => {
      if (deliveryDate) {
          const d = new Date(deliveryDate);
          if (!isNaN(d)) setRecurringDay(DAYS_OF_WEEK[d.getDay()]);
      }
  }, [deliveryDate]);

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
      if (window.innerWidth < 1024) setIsCustomerBoxOpen(false);

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

  const updateCartNote = (cartId, note) => {
    setCart(prevCart => prevCart.map(item => {
      if (item.cartId === cartId) {
        return { ...item, notes: note };
      }
      return item;
    }));
  };

  const removeFromCart = (cartId) => setCart(cart.filter(item => item.cartId !== cartId));

  const handleSubmitOrder = async () => {
    if (!selectedCustomerValue || !deliveryDate || cart.length === 0) {
      alert("Please select a customer, date, and at least one item.");
      return;
    }

    setSubmitting(true);
    const [year, month, day] = deliveryDate.split('-');
    const dateStr = `${year.slice(2)}${month}${day}`;
    // APPLY CONSIGNMENT PREFIX IF CHECKED IN RECURRING SETTINGS
    const prefix = isConsignment && isRecurring ? 'CSGN' : 'DO';
    const doNumber = `${prefix}-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;

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
            "SpecialNotes": (isConsignment && isRecurring) ? "CONSIGNMENT - NO DO REQUIRED" : item.notes, 
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
                IsConsignment: isConsignment, // SAVE CONSIGNMENT FLAG TO DB
                Items: cleanItems
            };
            
            await supabase.from('StandingOrders').insert([patternPayload]);
        }

        alert(`Order Created: ${doNumber}`);
        router.push('/orders/list'); 
        
    } catch(err) {
        console.error(err);
    }
    setSubmitting(false);
  };

  const categories = useMemo(() => ['All', ...new Set(products.map(p => p.Category || 'Other'))], [products]);

  const filteredProducts = useMemo(() => products.filter(p => {
    const matchesCat = activeCategory === 'All' || p.Category === activeCategory;
    if (!searchTerm) return matchesCat;
    
    const searchTerms = searchTerm.toLowerCase().split(' ').filter(Boolean);
    const combinedText = `${p.ProductName} ${p.ProductCode}`.toLowerCase();
    const matchesSearch = searchTerms.every(term => combinedText.includes(term));
    return matchesCat && matchesSearch;
  }).slice(0, 30), [products, activeCategory, searchTerm]);

  if (loading) return <div className="p-10 flex items-center justify-center h-screen font-black text-gray-300 animate-pulse uppercase tracking-widest">Booting New Order Engine...</div>;

  return (
    <div className="p-3 md:p-8 max-w-full overflow-x-clip min-h-[100dvh] bg-gray-50/50 pb-32 md:pb-32 font-sans relative">
      
      {/* Header */}
      <div className="mb-4 md:mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"> 
         <div>
             <h1 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight uppercase leading-none">Order Management</h1> 
             <p className="text-[10px] md:text-xs text-gray-400 font-bold uppercase mt-1.5 md:mt-2">Manage single-session and historical orders</p> 
         </div>
         <div className="hidden sm:block text-[9px] md:text-xs font-bold text-gray-500 bg-white border border-gray-200 px-3 py-1.5 rounded-full uppercase shadow-sm">
             User: {currentUser || 'GUEST'}
         </div>
      </div>

      {/* MOBILE iOS-STYLE SEGMENTED TABS */}
      <div className="md:hidden flex bg-gray-200/80 p-1 rounded-xl mb-4 shrink-0 shadow-inner">
         <Link href="/orders/new" className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all text-center ${cleanPath === '/orders/new' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>New Order</Link>
         <Link href="/orders/list" className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all text-center ${cleanPath === '/orders/list' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>History</Link>
         <Link href="/orders/standing" className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all text-center ${cleanPath === '/orders/standing' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Auto-Pilot</Link>
      </div>

      {/* DESKTOP TABS */}
      <div className="hidden md:flex gap-2 mb-6 overflow-x-auto pb-2 border-b border-gray-200">
          <Link href="/orders/new" className={`px-6 py-3 rounded-t-2xl font-black text-sm transition-all whitespace-nowrap flex items-center gap-2 ${cleanPath === '/orders/new' ? 'bg-green-600 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-100'}`}>
              <PlusCircleIcon className="w-5 h-5" /> New Order
          </Link>
          <Link href="/orders/list" className={`px-6 py-3 rounded-t-2xl font-black text-sm transition-all whitespace-nowrap flex items-center gap-2 ${cleanPath === '/orders/list' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-100'}`}>
              <ClipboardDocumentListIcon className="w-5 h-5" /> Order History
          </Link>
          <Link href="/orders/standing" className={`px-6 py-3 rounded-t-2xl font-black text-sm transition-all whitespace-nowrap flex items-center gap-2 ${cleanPath === '/orders/standing' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-100'}`}>
              <ArrowPathIcon className="w-5 h-5" /> Auto-Pilot
          </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 animate-in fade-in duration-300 relative items-start">
        <div className="lg:col-span-2 space-y-4 md:space-y-6">
          
          {/* Unified Order Settings Card */}
          <div className="bg-white rounded-2xl md:rounded-[2rem] border border-gray-200 shadow-sm overflow-hidden flex flex-col mx-1 md:mx-0 transition-all">
              <div 
                  className="px-4 py-3 md:py-4 flex justify-between items-center cursor-pointer bg-gray-50/50 hover:bg-gray-50 transition-colors border-b border-gray-100"
                  onClick={() => setIsCustomerBoxOpen(!isCustomerBoxOpen)}
              >
                  <div className="flex items-center gap-3">
                      <UserCircleIcon className="w-6 h-6 text-gray-400 shrink-0" />
                      <div className="flex flex-col">
                          <span className="text-sm md:text-base font-black text-gray-800 uppercase tracking-wide">
                              {selectedCustomerValue || 'Select Customer...'}
                          </span>
                          {!isCustomerBoxOpen && deliveryDate && (
                              <span className="text-[10px] font-bold text-gray-500 mt-0.5 uppercase tracking-wider">
                                  {new Date(deliveryDate).toLocaleDateString('en-GB', {weekday:'short', day:'2-digit', month:'short'})} • {deliveryMode}
                              </span>
                          )}
                      </div>
                  </div>
                  <ChevronDownIcon className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${isCustomerBoxOpen ? 'rotate-180' : ''}`} />
              </div>

              {isCustomerBoxOpen && (
                  <div className="flex flex-col bg-white animate-in slide-in-from-top-2 duration-200">
                      
                      {/* Row 1: Customer Search */}
                      <div className="p-3 border-b border-gray-100 bg-gray-50/30">
                          <input 
                              list="customer-list" 
                              type="text" 
                              className="w-full text-base md:text-sm font-bold text-gray-900 bg-white border border-gray-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-500 placeholder-gray-400 uppercase shadow-inner" 
                              value={selectedCustomerValue} 
                              onChange={handleCustomerChange} 
                              placeholder="SEARCH CUSTOMER / BRANCH..." 
                          />
                          <datalist id="customer-list">{customers.map(c => <option key={c.id} value={c.Branch ? `${c.CompanyName} - ${c.Branch}` : c.CompanyName} />)}</datalist>
                      </div>
                      
                      {/* Row 2: Mode & Date */}
                      <div className="flex border-b border-gray-100 bg-white">
                          <div className="flex-[1.2] flex flex-col border-r border-gray-100 p-3">
                              <label className="text-[9px] font-black text-gray-400 uppercase px-1 mb-1">Delivery Date</label>
                              <input type="date" className="w-full text-base md:text-sm font-bold text-gray-800 outline-none bg-transparent px-1 focus:text-green-600 transition-colors" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
                          </div>
                          <div className="flex-1 flex flex-col border-r border-gray-100 p-3">
                              <label className="text-[9px] font-black text-gray-400 uppercase px-1 mb-1">Mode</label>
                              <select className="w-full text-base md:text-sm font-bold text-gray-800 outline-none bg-transparent px-0 focus:text-green-600 transition-colors" value={deliveryMode} onChange={e => setDeliveryMode(e.target.value)}>
                                  <option value="Driver">Driver</option><option value="Lalamove">Lalamove</option><option value="Self Pick-up">Pick-up</option>
                              </select>
                          </div>
                          <div className="flex-1 flex flex-col p-3">
                              <label className="text-[9px] font-black text-gray-400 uppercase px-1 mb-1">Channel</label>
                              <select className="w-full text-base md:text-sm font-bold text-gray-800 outline-none bg-transparent px-0 focus:text-green-600 transition-colors" value={salesChannel} onChange={(e) => setSalesChannel(e.target.value)}>
                                  <option>Online / FnB</option><option>Wholesale</option><option>Outlet</option>
                              </select>
                          </div>
                      </div>
                      
                      {/* Row 3: Contact & Phone */}
                      <div className="flex border-b border-gray-100 bg-white">
                          <div className="flex-1 flex flex-col border-r border-gray-100 p-3">
                              <label className="text-[9px] font-black text-gray-400 uppercase px-1 mb-1">Contact Person</label>
                              <input type="text" className="w-full text-base md:text-sm font-medium text-gray-800 outline-none bg-transparent px-1 placeholder-gray-300 focus:text-green-600 transition-colors" value={custDetails.ContactPerson} onChange={(e) => handleDetailChange('ContactPerson', e.target.value)} placeholder="Name..." />
                          </div>
                          <div className="flex-1 flex flex-col p-3">
                              <label className="text-[9px] font-black text-gray-400 uppercase px-1 mb-1">Phone Number</label>
                              <input type="tel" className="w-full text-base md:text-sm font-medium text-gray-800 outline-none bg-transparent px-1 placeholder-gray-300 focus:text-green-600 transition-colors" value={custDetails.ContactNumber} onChange={(e) => handleDetailChange('ContactNumber', e.target.value)} placeholder="012-345..." />
                          </div>
                      </div>

                      {/* Row 4: Address */}
                      <div className="p-3 bg-white">
                          <label className="text-[9px] font-black text-gray-400 uppercase px-1 mb-1 block">Full Delivery Address</label>
                          <input type="text" className="w-full text-base md:text-sm font-medium text-gray-800 outline-none bg-transparent px-1 placeholder-gray-300 focus:text-green-600 transition-colors" value={custDetails.DeliveryAddress} onChange={(e) => handleDetailChange('DeliveryAddress', e.target.value)} placeholder="Street, City, Postal Code..." />
                      </div>
                  </div>
              )}
          </div>

          {/* Quick Add Items */}
          {selectedCustomerValue && quickAddItems.length > 0 && (
             <div className="animate-in slide-in-from-left-4 duration-500 mx-1 md:mx-0">
                <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar snap-x">
                    {quickAddItems.map(p => (
                        <button key={p.ProductCode} onClick={() => addToCart(p, 1)} className="snap-start shrink-0 bg-white border border-green-200 p-3 rounded-2xl shadow-sm flex flex-col items-center justify-center gap-1.5 hover:border-green-400 active:scale-95 transition-all w-[100px] h-[80px] group">
                            <span className="text-[9px] font-black text-gray-800 uppercase line-clamp-2 text-center leading-tight group-hover:text-green-600 transition-colors">{p.ProductName}</span>
                            <div className="text-[8px] text-gray-400 font-bold mt-auto bg-gray-50 px-2 py-0.5 rounded-md border border-gray-100">{p.BaseUOM}</div>
                        </button>
                    ))}
                </div>
             </div>
          )}

          {/* Product Catalog & Search */}
          <div className="space-y-3 mx-1 md:mx-0 relative z-0">
             
             {/* FIXED: Sticky Search Header (top-0 with z-40 so it stays above product cards) */}
             <div className="sticky top-0 z-[40] bg-gray-50/95 backdrop-blur-md py-3 -mx-2 px-2 md:mx-0 md:px-0 shadow-sm md:shadow-none">
                <div className="flex flex-col gap-3">
                    <div className="relative shadow-sm md:shadow-none rounded-xl overflow-hidden">
                        <input type="text" placeholder="Search catalog..." className="w-full pl-11 p-3.5 md:p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 text-base md:text-sm font-bold bg-white outline-none" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"><MagnifyingGlassIcon className="w-5 h-5"/></span>
                    </div>
                    {/* Category Pills */}
                    <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                        {categories.map(cat => (
                            <button key={cat} onClick={() => setActiveCategory(cat)} className={`shrink-0 px-4 py-2 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest border transition-all active:scale-95 ${activeCategory === cat ? 'bg-[#0f172a] text-white border-[#0f172a] shadow-md' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400 shadow-sm'}`}>{cat}</button>
                        ))}
                    </div>
                </div>
             </div>
             
             {/* Product Grid */}
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 pb-6 md:pb-0">
                {filteredProducts.map(p => {
                    const inputs = productInputs[p.ProductCode] || {};
                    const uoms = Array.from(new Set(p.AllowedUOMs ? p.AllowedUOMs.split(',').map(u => u.trim().toUpperCase()) : [p.BaseUOM]));
                    return (
                      <div key={p.ProductCode} className="bg-white p-3 md:p-4 rounded-2xl border border-gray-200 shadow-sm relative group flex flex-col justify-between hover:border-green-400 transition-all z-10">
                          <div className={`absolute top-0 right-0 px-3 py-1.5 rounded-bl-2xl rounded-tr-2xl text-[8px] font-black uppercase tracking-widest ${getStockColor(p.StockBalance)}`}>BAL: {p.StockBalance || '0'} {p.BaseUOM}</div>
                          
                          <div className="pr-16 mb-3">
                              <h3 className="font-black text-gray-800 text-sm uppercase leading-tight line-clamp-2">{p.ProductName}</h3>
                              <p className="text-[9px] text-gray-400 font-mono mt-1 tracking-widest bg-gray-50 w-fit px-1.5 py-0.5 rounded border border-gray-100">{p.ProductCode}</p>
                          </div>
                          
                          {/* Decoupled Controls Row */}
                          <div className="flex flex-col gap-2 mt-auto">
                              
                              {/* Top row: Stepper & UOM */}
                              <div className="flex gap-2 h-[42px] md:h-10">
                                  {/* QTY Stepper */}
                                  <div className="flex items-center bg-gray-50 border border-gray-200 rounded-xl p-1 flex-[1.2]">
                                      <button onClick={() => handleProductInputChange(p.ProductCode, 'qty', Math.max(0.1, (Number(inputs.qty) || 1) - 1).toFixed(1).replace(/\.0$/, ''))} className="w-8 h-8 flex items-center justify-center text-gray-600 bg-white rounded-lg shadow-sm active:bg-gray-100 transition-colors shrink-0"><MinusIcon className="w-4 h-4 stroke-2"/></button>
                                      <input type="number" step="0.1" inputMode="decimal" className="w-full text-center font-black text-base md:text-sm bg-transparent outline-none focus:ring-0 mx-1" value={inputs.qty || ''} placeholder="1" onChange={(e) => handleProductInputChange(p.ProductCode, 'qty', e.target.value)} />
                                      <button onClick={() => handleProductInputChange(p.ProductCode, 'qty', ((Number(inputs.qty) || 1) + 1).toFixed(1).replace(/\.0$/, ''))} className="w-8 h-8 flex items-center justify-center text-gray-600 bg-white rounded-lg shadow-sm active:bg-gray-100 transition-colors shrink-0"><PlusIcon className="w-4 h-4 stroke-2"/></button>
                                  </div>
                                  
                                  {/* UOM */}
                                  <select className="bg-white border border-gray-200 rounded-xl text-base md:text-sm px-2 flex-1 font-black uppercase outline-none focus:ring-2 focus:ring-green-500 shadow-sm" value={inputs.uom || p.SalesUOM || p.BaseUOM} onChange={(e) => handleProductInputChange(p.ProductCode, 'uom', e.target.value)}>
                                      {uoms.map(u => <option key={u} value={u}>{u}</option>)}
                                  </select>
                              </div>

                              {/* Bottom row: Price, Replace, Add */}
                              <div className="flex items-center gap-2 h-[42px] md:h-10 mt-1">
                                  {/* iOS Style Toggle Switch for Replace */}
                                  <label className="relative inline-flex items-center cursor-pointer group bg-gray-50 px-2 rounded-xl border border-gray-100 h-full">
                                      <input 
                                          type="checkbox" 
                                          className="sr-only peer" 
                                          checked={inputs.replacement || false} 
                                          onChange={(e) => handleProductInputChange(p.ProductCode, 'replacement', e.target.checked)} 
                                      />
                                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[16px] peer-checked:after:border-white after:content-[''] after:absolute after:top-[12px] md:after:top-[11px] after:left-[10px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-500 shadow-inner"></div>
                                      <span className="ml-1.5 text-[9px] font-black text-red-500 uppercase tracking-widest transition-colors">REP</span>
                                  </label>
                                  
                                  {/* PRICE */}
                                  <div className="flex-[1.5] relative h-full">
                                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400 pointer-events-none">RM</span>
                                      <input 
                                          type="number" step="0.01" inputMode="decimal"
                                          className="w-full h-full pl-8 pr-3 text-base md:text-sm border border-gray-200 rounded-xl text-right font-black outline-none disabled:bg-gray-100 disabled:text-gray-400 focus:ring-2 focus:ring-green-500 shadow-sm" 
                                          disabled={inputs.replacement} 
                                          value={inputs.price || ''} 
                                          onChange={(e) => handleProductInputChange(p.ProductCode, 'price', e.target.value)} 
                                          placeholder="0.00" 
                                      />
                                  </div>
                                  
                                  <button onClick={() => addToCart(p)} className="bg-[#0f172a] hover:bg-slate-800 text-white rounded-xl w-14 h-full flex items-center justify-center font-bold shadow-md active:scale-95 shrink-0 transition-transform">
                                      <PlusIcon className="w-6 h-6 stroke-2" />
                                  </button>
                              </div>
                          </div>
                      </div>
                    );
                })}
             </div>
          </div>
        </div>

        {/* Desktop Cart Column */}
        {/* We keep h-full on the column wrapper, and perfectly nest sticky inside to scroll correctly */}
        <div className="hidden lg:block lg:col-span-1 h-full relative">
           <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-gray-100 flex flex-col h-[calc(100vh-4rem)] sticky top-6 z-10">
              <div className="flex justify-between items-center mb-6 shrink-0">
                 <h2 className="text-lg font-black text-gray-800 tracking-tight uppercase">Cart Summary</h2>
                 <span className="bg-green-100 text-green-700 text-[10px] font-black px-3 py-1 rounded-full uppercase">{cart.length} items</span>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-3 mb-6 custom-scrollbar pr-2 min-h-0">
                  {cart.length === 0 ? <div className="h-full flex flex-col items-center justify-center text-gray-300 italic text-sm border-2 border-dashed border-gray-100 rounded-[2rem]">Cart is empty</div> : cart.map((item) => (
                    <div key={item.cartId} className="p-4 bg-white border border-gray-100 shadow-sm rounded-2xl relative group shrink-0">
                        <div className="flex justify-between items-start mb-2">
                            <div className="pr-6 text-[10px] font-black uppercase text-gray-800 leading-tight">{item.ProductName}</div>
                            <button onClick={() => removeFromCart(item.cartId)} className="text-gray-300 hover:text-red-500 absolute top-3 right-3 transition-colors"><XMarkIcon className="w-4 h-4 stroke-2" /></button>
                        </div>
                        <div className="flex items-center justify-between mt-3">
                             <div className="flex items-center bg-gray-50 border border-gray-200 rounded-xl p-1">
                                 <button onClick={() => updateCartQty(item.cartId, -1)} className="w-7 h-7 flex items-center justify-center text-gray-500 bg-white shadow-sm hover:bg-gray-100 rounded-lg active:scale-95"><MinusIcon className="w-3 h-3 stroke-2"/></button>
                                 <span className="w-8 text-center text-xs font-black">{item.qty}</span>
                                 <button onClick={() => updateCartQty(item.cartId, 1)} className="w-7 h-7 flex items-center justify-center text-gray-500 bg-white shadow-sm hover:bg-gray-100 rounded-lg active:scale-95"><PlusIcon className="w-3 h-3 stroke-2"/></button>
                             </div>
                             <span className="text-[10px] font-black text-gray-500 ml-2 mr-auto">{item.uom}</span>
                             {item.isReplacement ? <span className="text-[9px] font-black text-white bg-red-500 px-2 py-1 rounded shadow-sm tracking-widest">REP</span> : <span className="text-[11px] font-black text-gray-800 bg-gray-50 border border-gray-200 px-2 py-1 rounded-lg">RM {(Number(item.price || 0) * Number(item.qty || 1)).toFixed(2)}</span>}
                        </div>
                        {/* Notes Input */}
                        <div className="mt-3 pt-3 border-t border-gray-50">
                            <input 
                                type="text" 
                                placeholder="Add note (e.g. masak sikit)..." 
                                className="w-full bg-gray-50 border border-gray-200 text-[11px] p-2.5 rounded-xl outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all text-gray-700 placeholder-gray-400 font-medium"
                                value={item.notes || ''}
                                onChange={(e) => updateCartNote(item.cartId, e.target.value)}
                            />
                        </div>
                    </div>
                  ))}
              </div>
              
              <div className="mt-auto pt-4 border-t border-gray-100 space-y-4 shrink-0 bg-white">
                  
                  {/* Desktop Pattern Saving Block */}
                  <div className="bg-indigo-50/50 border border-indigo-100 p-4 rounded-2xl">
                      {/* iOS Style Toggle Switch for Recurring */}
                      <label className="relative flex items-center cursor-pointer group mb-1">
                          <input 
                              type="checkbox" 
                              className="sr-only peer" 
                              checked={isRecurring} 
                              onChange={e => setIsRecurring(e.target.checked)} 
                          />
                          <div className="w-11 h-6 bg-indigo-200/50 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600 shadow-inner"></div>
                          <span className="ml-3 text-[10px] font-black text-indigo-900 uppercase tracking-widest transition-colors">Save as Weekly Pattern</span>
                      </label>

                      {isRecurring && (
                          <div className="mt-4 animate-in fade-in slide-in-from-top-1 space-y-4 border-t border-indigo-100/50 pt-4">
                              <div>
                                  <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest ml-1">Generate On:</span>
                                  <select className="w-full mt-1 border border-indigo-200 p-2.5 rounded-xl text-sm font-black bg-white text-indigo-800 outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm" value={recurringDay} onChange={e => setRecurringDay(e.target.value)}>
                                      {DAYS_OF_WEEK.map(d => <option key={d} value={d}>{d}</option>)}
                                  </select>
                              </div>
                              <div>
                                  {/* iOS Style Toggle Switch for Consignment */}
                                  <label className="relative flex items-center cursor-pointer group">
                                      <input 
                                          type="checkbox" 
                                          className="sr-only peer" 
                                          checked={isConsignment} 
                                          onChange={e => setIsConsignment(e.target.checked)} 
                                      />
                                      <div className="w-9 h-5 bg-orange-200/50 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[16px] peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500 shadow-inner shrink-0 mt-0.5"></div>
                                      <div className="ml-2 flex flex-col">
                                          <span className="text-[10px] font-black text-orange-900 uppercase tracking-widest leading-none">Consignment Order</span>
                                          <span className="text-[8px] font-bold text-orange-500 mt-1">Route Only. Skips DO Printing.</span>
                                      </div>
                                  </label>
                              </div>
                          </div>
                      )}
                  </div>

                  <div className="flex justify-between text-xs font-black text-gray-800 px-1 uppercase tracking-widest"><span>Total Products:</span><span className="text-gray-900 text-sm bg-gray-100 px-2 py-0.5 rounded border border-gray-200">{cart.length}</span></div>
                  <button onClick={handleSubmitOrder} disabled={submitting || cart.length === 0} className={`w-full py-4 rounded-2xl text-white font-black text-sm shadow-xl transition-all flex items-center justify-center gap-2 ${submitting || cart.length === 0 ? 'bg-gray-300 cursor-not-allowed shadow-none text-gray-500' : 'bg-green-600 hover:bg-green-700 shadow-green-600/30 active:scale-95'}`}>
                      {submitting ? 'PROCESSING...' : (isRecurring ? 'SAVE PATTERN & ORDER' : 'CONFIRM ORDER')}
                  </button>
              </div>
           </div>
        </div>
      </div>

      {/* Mobile Cart Floating Bar - Uses bottom-[68px] to float precisely over MobileNavigation */}
      {!isMobileCartOpen && (
          <div className="lg:hidden fixed bottom-[68px] left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-200 p-3 shadow-[0_-10px_20px_rgba(0,0,0,0.1)] z-[50] animate-in slide-in-from-bottom-2 pb-safe">
              <div className="flex items-center justify-between gap-3 max-w-lg mx-auto">
                  <button onClick={() => setIsMobileCartOpen(true)} className="flex items-center justify-center gap-3 bg-gray-50 px-4 py-3.5 rounded-2xl border border-gray-200 flex-1 active:bg-gray-100 transition-colors shadow-sm">
                      <div className="relative">
                          <ShoppingCartIcon className="w-6 h-6 text-gray-700" />
                          {cart.length > 0 && (
                              <span className="absolute -top-1.5 -right-1.5 bg-green-500 text-white text-[9px] font-black w-4 h-4 flex items-center justify-center rounded-full shadow-sm ring-2 ring-white">
                                  {cart.length}
                              </span>
                          )}
                      </div>
                      <div className="flex flex-col items-start leading-none">
                          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">View Cart</span>
                          <span className="text-xs font-black text-gray-900 mt-1">{cart.length} Products</span>
                      </div>
                  </button>
                  <button 
                      onClick={handleSubmitOrder} 
                      disabled={submitting || cart.length === 0} 
                      className={`text-white font-black py-4 px-6 rounded-2xl shadow-xl transition active:scale-95 text-xs uppercase tracking-widest flex-1 ${submitting || cart.length === 0 ? 'bg-gray-300 shadow-none text-gray-500' : 'bg-[#0f172a] shadow-[#0f172a]/30'}`}
                  >
                      {submitting ? 'PROCESSING...' : 'CONFIRM ORDER'}
                  </button>
              </div>
          </div>
      )}

      {/* Full-Screen Mobile Cart Modal */}
      {isMobileCartOpen && (
           <div className="lg:hidden fixed inset-0 bg-gray-50 z-[300] flex flex-col h-[100dvh] w-screen overflow-hidden animate-in slide-in-from-bottom-full duration-300">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white shrink-0 shadow-sm" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))' }}>
                  <div className="flex items-center gap-3">
                      <button onClick={() => setIsMobileCartOpen(false)} className="p-2 bg-gray-50 rounded-full text-gray-600 active:scale-95 border border-gray-100"><ChevronLeftIcon className="w-5 h-5 stroke-2"/></button>
                      <h2 className="text-lg font-black text-gray-800 uppercase tracking-tight flex items-center gap-2"><ShoppingCartIcon className="w-5 h-5 text-gray-400" /> Review Cart</h2>
                  </div>
                  <span className="bg-green-100 text-green-700 text-[10px] font-black px-3 py-1 rounded-full uppercase">{cart.length} Items</span>
              </div>
              
              {/* Cart Items */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50 custom-scrollbar pb-32">
                  {cart.map((item) => (
                      <div key={item.cartId} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 relative group">
                          <button onClick={() => removeFromCart(item.cartId)} className="absolute top-4 right-4 text-gray-300 hover:text-red-500 active:scale-90 transition-transform"><XMarkIcon className="w-5 h-5 stroke-2" /></button>
                          <div className="text-xs font-black uppercase text-gray-800 pr-10 mb-4">{item.ProductName}</div>
                          <div className="flex items-center justify-between">
                              <div className="flex items-center bg-gray-50 border border-gray-200 rounded-xl p-1">
                                  <button onClick={() => updateCartQty(item.cartId, -1)} className="w-9 h-9 flex items-center justify-center text-gray-600 bg-white rounded-lg shadow-sm active:scale-95"><MinusIcon className="w-4 h-4 stroke-2"/></button>
                                  <span className="w-10 text-center text-base font-black">{item.qty}</span>
                                  <button onClick={() => updateCartQty(item.cartId, 1)} className="w-9 h-9 flex items-center justify-center text-gray-600 bg-white rounded-lg shadow-sm active:scale-95"><PlusIcon className="w-4 h-4 stroke-2"/></button>
                              </div>
                              <div className="flex flex-col items-end">
                                  <span className="text-[10px] font-black text-gray-500 uppercase mx-2 mb-1">{item.uom}</span>
                                  {item.isReplacement ? <span className="text-[10px] font-black text-white bg-red-500 px-3 py-1 rounded-lg shadow-sm tracking-widest">REP</span> : <span className="text-sm font-black text-gray-800 bg-gray-50 border border-gray-200 px-3 py-1 rounded-xl">RM {(Number(item.price || 0) * Number(item.qty || 1)).toFixed(2)}</span>}
                              </div>
                          </div>
                          {/* Notes Input Mobile */}
                          <div className="mt-4 pt-4 border-t border-gray-100">
                              <input 
                                  type="text" 
                                  placeholder="Add special note (optional)..." 
                                  // text-base to prevent zoom
                                  className="w-full bg-gray-50/80 border border-gray-200 text-base md:text-sm p-3 rounded-xl outline-none focus:bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all text-gray-700 placeholder-gray-400 font-medium"
                                  value={item.notes || ''}
                                  onChange={(e) => updateCartNote(item.cartId, e.target.value)}
                              />
                          </div>
                      </div>
                  ))}
                  {cart.length === 0 && <div className="text-center p-12 text-gray-400 font-bold italic text-sm border-2 border-dashed border-gray-200 rounded-3xl mx-2 mt-4 bg-white">Cart is empty. Add products to continue.</div>}
              </div>

              {/* Mobile Cart Settings & Confirm Bar */}
              <div className="bg-white border-t border-gray-200 shrink-0 shadow-[0_-10px_20px_rgba(0,0,0,0.05)] pb-safe relative z-10">
                  <div className="p-4 space-y-4">
                      
                      {/* Mobile Pattern Saving Block */}
                      <div className="bg-indigo-50/50 border border-indigo-100 p-4 rounded-2xl">
                          {/* iOS Style Toggle Switch for Recurring */}
                          <label className="relative flex items-center justify-between cursor-pointer group mb-1">
                              <span className="text-[11px] font-black text-indigo-900 uppercase tracking-widest transition-colors">Save as Weekly Pattern</span>
                              <div className="relative">
                                  <input 
                                      type="checkbox" 
                                      className="sr-only peer" 
                                      checked={isRecurring} 
                                      onChange={e => setIsRecurring(e.target.checked)} 
                                  />
                                  <div className="w-12 h-7 bg-indigo-200/50 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-indigo-600 shadow-inner"></div>
                              </div>
                          </label>

                          {isRecurring && (
                              <div className="mt-4 animate-in fade-in slide-in-from-top-1 space-y-4 border-t border-indigo-100/50 pt-4">
                                  <div className="flex items-center justify-between gap-4">
                                      <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest shrink-0">Generate On</span>
                                      <select className="w-full flex-1 border border-indigo-200 p-3 rounded-xl text-base md:text-sm font-black bg-white text-indigo-800 outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm" value={recurringDay} onChange={e => setRecurringDay(e.target.value)}>
                                          {DAYS_OF_WEEK.map(d => <option key={d} value={d}>{d}</option>)}
                                      </select>
                                  </div>
                                  <div className="pt-2">
                                      {/* iOS Style Toggle Switch for Consignment */}
                                      <label className="relative flex items-center cursor-pointer group">
                                          <div className="relative">
                                              <input 
                                                  type="checkbox" 
                                                  className="sr-only peer" 
                                                  checked={isConsignment} 
                                                  onChange={e => setIsConsignment(e.target.checked)} 
                                              />
                                              <div className="w-10 h-6 bg-orange-200/50 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[16px] peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500 shadow-inner shrink-0"></div>
                                          </div>
                                          <div className="ml-3 flex flex-col">
                                              <span className="text-[11px] font-black text-orange-900 uppercase tracking-widest leading-none">Consignment Order</span>
                                              <span className="text-[9px] font-bold text-orange-500 mt-1">Route Only. Skips DO Printing.</span>
                                          </div>
                                      </label>
                                  </div>
                              </div>
                          )}
                      </div>

                      <button onClick={handleSubmitOrder} disabled={submitting || cart.length === 0} className={`w-full py-4 rounded-2xl text-white font-black text-base shadow-xl transition-all flex items-center justify-center gap-2 ${submitting || cart.length === 0 ? 'bg-gray-300 cursor-not-allowed shadow-none text-gray-500' : 'bg-green-600 hover:bg-green-700 shadow-green-600/30 active:scale-95'}`}>
                          {submitting ? 'PROCESSING...' : (isRecurring ? 'SAVE PATTERN & SUBMIT' : 'CONFIRM ORDER')}
                      </button>
                  </div>
              </div>
           </div>
      )}
    </div>
  );
}