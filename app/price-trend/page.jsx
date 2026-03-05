'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { 
  PresentationChartLineIcon, 
  BuildingOfficeIcon,
  CubeIcon,
  CurrencyDollarIcon,
  DocumentTextIcon,
  SunIcon,
  CalendarDaysIcon,
  ArrowsUpDownIcon,
  XMarkIcon,
  CheckIcon
} from '@heroicons/react/24/outline';

// Helper to get consistent local YYYY-MM-DD
const getLocalDateString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Colors for Fruit Comparison Chart
const FRUIT_COLORS = ['#f97316', '#3b82f6', '#10b981', '#a855f7', '#ef4444'];

export default function PriceTrendPage() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('product'); // 'product', 'supplier', or 'seasonality'
  const [dateRange, setDateRange] = useState('all');

  // ==========================================
  // PRODUCT TREND STATES
  // ==========================================
  const [products, setProducts] = useState([]);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  
  const [productChartData, setProductChartData] = useState([]);
  const [salesHistory, setSalesHistory] = useState([]);
  const [purchaseHistory, setPurchaseHistory] = useState([]);
  const [productStats, setProductStats] = useState({ maxSell: 0, latestCost: 0, avgSell: 0 });
  const [recommendedPrice, setRecommendedPrice] = useState(0); 

  // ==========================================
  // SUPPLIER TREND STATES
  // ==========================================
  const [suppliers, setSuppliers] = useState([]);
  const [supplierSearchTerm, setSupplierSearchTerm] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [supplierSortBy, setSupplierSortBy] = useState('spend'); // Default to Top Spend

  const [supplierPurchases, setSupplierPurchases] = useState([]);
  const [supplierStats, setSupplierStats] = useState({ totalSpend: 0, orderCount: 0, uniqueProducts: 0 });
  const [supplierChartData, setSupplierChartData] = useState([]);
  const [supplierProductStats, setSupplierProductStats] = useState([]);

  // ==========================================
  // FRUIT LIFECYCLE (SEASONALITY) STATES
  // ==========================================
  const [fruitSearchTerm, setFruitSearchTerm] = useState('');
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [selectedFruits, setSelectedFruits] = useState([]); // Array of products (up to 5 in compare, 1 in normal)
  const [fruitComparisonData, setFruitComparisonData] = useState([]);
  const [fruitComparisonStats, setFruitComparisonStats] = useState([]);

  // ==========================================
  // 1. INITIAL LOAD (WITH PAGINATION FIX)
  // ==========================================
  useEffect(() => {
    async function fetchInitialData() {
      setLoading(true);

      // Fetch Products
      let allProducts = [];
      let pKeep = true;
      let pStart = 0;
      while(pKeep) {
          const { data } = await supabase.from('ProductMaster').select('ProductCode, ProductName, Category, SalesUOM, BaseUOM').range(pStart, pStart + 999);
          if (!data || data.length === 0) pKeep = false;
          else { allProducts = allProducts.concat(data); if (data.length < 1000) pKeep = false; else pStart += 1000; }
      }

      // Fetch latest purchases to sort products
      const { data: latestPurchases } = await supabase.from('Purchase').select('ProductCode, Timestamp').order('Timestamp', { ascending: false }).limit(5000); 

      const latestMap = {};
      if (latestPurchases) {
        latestPurchases.forEach(p => {
          if (!latestMap[p.ProductCode]) latestMap[p.ProductCode] = new Date(p.Timestamp).getTime();
        });
      }

      const sortedProducts = allProducts.map(p => ({
        ...p, latestPurchase: latestMap[p.ProductCode] || 0 
      })).sort((a, b) => {
          if (b.latestPurchase !== a.latestPurchase) return b.latestPurchase - a.latestPurchase;
          return a.ProductName.localeCompare(b.ProductName);
      });

      setProducts(sortedProducts);

      // Fetch Suppliers Names
      const { data: suppData } = await supabase.from('Suppliers').select('SupplierName').limit(5000);

      // FULL FETCH PURCHASES (Bypass 1000 limit for accurate global stats)
      let allPurchases = [];
      let keepFetching = true;
      let startIdx = 0;
      
      while (keepFetching) {
          const { data, error } = await supabase
              .from('Purchase')
              .select('Supplier, CostPrice, PurchaseQty, InvoiceNumber, ProductCode, Timestamp')
              .range(startIdx, startIdx + 999);
              
          if (error || !data || data.length === 0) {
              keepFetching = false;
          } else {
              allPurchases = allPurchases.concat(data);
              if (data.length < 1000) keepFetching = false;
              else startIdx += 1000;
          }
      }

      const supplierMetrics = {};
      
      // Robust grouping ignoring case and trailing spaces
      if (suppData) {
          suppData.forEach(s => {
              const key = s.SupplierName.trim().toUpperCase();
              supplierMetrics[key] = { name: s.SupplierName.trim(), spend: 0, invoices: new Set(), products: new Set() };
          });
      }

      if (allPurchases) {
          allPurchases.forEach(p => {
              if (!p.Supplier) return;
              const key = p.Supplier.trim().toUpperCase();
              
              if (!supplierMetrics[key]) {
                  supplierMetrics[key] = { name: p.Supplier.trim(), spend: 0, invoices: new Set(), products: new Set() };
              }
              
              const total = (Number(p.CostPrice) || 0) * (Number(p.PurchaseQty) || 0);
              supplierMetrics[key].spend += total;
              supplierMetrics[key].products.add(p.ProductCode);
              
              if (p.InvoiceNumber && p.InvoiceNumber !== "PRICE_LIST") {
                  supplierMetrics[key].invoices.add(p.InvoiceNumber);
              } else if (Number(p.PurchaseQty) > 0) {
                  supplierMetrics[key].invoices.add(p.Timestamp.substring(0, 10));
              }
          });
      }

      const enrichedSuppliers = Object.values(supplierMetrics).map(s => ({
          SupplierName: s.name,
          spend: s.spend,
          invoiceCount: s.invoices.size,
          productCount: s.products.size
      }));
      
      setSuppliers(enrichedSuppliers);
      setLoading(false);
    }
    fetchInitialData();
  }, []);

  // ==========================================
  // 2. DATA FETCH TRIGGERS
  // ==========================================
  useEffect(() => {
    if (activeTab === 'product' && selectedProduct) {
        fetchProductHistoryData(selectedProduct, dateRange);
    } else if (activeTab === 'supplier' && selectedSupplier) {
        fetchSupplierHistoryData(selectedSupplier, dateRange);
    } else if (activeTab === 'seasonality') {
        fetchFruitComparisonData(selectedFruits);
    }
  }, [selectedProduct, selectedSupplier, selectedFruits, dateRange, activeTab]);

  // ==========================================
  // 3. PRODUCT TREND LOGIC
  // ==========================================
  const fetchProductHistoryData = async (product, range) => {
    let startDateStr = null;
    let startDateISO = null;
    const past = new Date();
    past.setHours(0, 0, 0, 0);

    if (range !== 'all') {
        if (range === '1day') past.setDate(past.getDate() - 1);
        if (range === '3days') past.setDate(past.getDate() - 3);
        if (range === '7days') past.setDate(past.getDate() - 7);
        if (range === '1month') past.setMonth(past.getMonth() - 1);
        if (range === '3months') past.setMonth(past.getMonth() - 3);
        if (range === '1year') past.setFullYear(past.getFullYear() - 1);
        
        startDateStr = getLocalDateString(past); // For Delivery Date YYYY-MM-DD
        startDateISO = past.toISOString(); // For Purchase Timestamp
    }

    const targetUOM = product.SalesUOM || product.BaseUOM;

    let salesData = [];
    let sKeep = true; let sStart = 0;
    while(sKeep) {
        let salesQuery = supabase.from('Orders').select('"Delivery Date", Price, "Customer Name", UOM').eq('Product Code', product.ProductCode).eq('UOM', targetUOM).not('Price', 'is', null).order('Delivery Date', { ascending: true }).range(sStart, sStart + 999);
        if (startDateStr) salesQuery = salesQuery.gte('"Delivery Date"', startDateStr);
        const { data, error } = await salesQuery;
        if (error || !data || data.length === 0) sKeep = false;
        else { salesData = salesData.concat(data); if(data.length < 1000) sKeep = false; else sStart += 1000; }
    }

    let costData = [];
    let cKeep = true; let cStart = 0;
    while(cKeep) {
        let purchaseQuery = supabase.from('Purchase').select('Timestamp, CostPrice, Supplier').eq('ProductCode', product.ProductCode).order('Timestamp', { ascending: true }).range(cStart, cStart + 999);
        if (startDateISO) purchaseQuery = purchaseQuery.gte('Timestamp', startDateISO);
        const { data, error } = await purchaseQuery;
        if (error || !data || data.length === 0) cKeep = false;
        else { costData = costData.concat(data); if(data.length < 1000) cKeep = false; else cStart += 1000; }
    }

    setSalesHistory([...salesData].reverse());
    setPurchaseHistory([...costData].reverse());

    const combinedMap = {};
    if (salesData) {
        salesData.forEach(row => {
            const price = Number(row.Price);
            if (price > 0) {
                const d = row["Delivery Date"].substring(0, 10);
                if (!combinedMap[d]) combinedMap[d] = { date: d };
                combinedMap[d].sellingPrice = price;
            }
        });
    }

    const validCosts = [];
    let latestCost = 0;

    if (costData) {
        costData.forEach(row => {
            const d = row.Timestamp.substring(0, 10);
            if (!combinedMap[d]) combinedMap[d] = { date: d };
            
            const cost = parseFloat(row.CostPrice);
            if (cost > 0) {
                combinedMap[d].costPrice = cost;
                validCosts.push(cost);
                latestCost = cost;
            }
        });
    }

    const finalData = Object.values(combinedMap).sort((a, b) => new Date(a.date) - new Date(b.date));
    setProductChartData(finalData);

    if (validCosts.length > 0) {
        setProductStats({
            maxSell: Math.max(...validCosts),
            latestCost: latestCost,
            avgSell: (validCosts.reduce((a, b) => a + b, 0) / validCosts.length).toFixed(2)
        });
        setRecommendedPrice((latestCost * 1.15).toFixed(2));
    } else {
        setProductStats({ maxSell: 0, latestCost: 0, avgSell: 0 });
        setRecommendedPrice(0);
    }
  };

  // ==========================================
  // 4. SUPPLIER TREND LOGIC (WITH PAGINATION)
  // ==========================================
  const fetchSupplierHistoryData = async (supplier, range) => {
      let startDateISO = null;
      const past = new Date();
      past.setHours(0, 0, 0, 0);
      
      if (range !== 'all') {
          if (range === '1day') past.setDate(past.getDate() - 1);
          if (range === '3days') past.setDate(past.getDate() - 3);
          if (range === '7days') past.setDate(past.getDate() - 7);
          if (range === '1month') past.setMonth(past.getMonth() - 1);
          if (range === '3months') past.setMonth(past.getMonth() - 3);
          if (range === '1year') past.setFullYear(past.getFullYear() - 1);
          startDateISO = past.toISOString();
      }

      let supplierPurchasesData = [];
      let sKeep = true;
      let sStart = 0;

      while(sKeep) {
          let purchaseQuery = supabase
              .from('Purchase')
              .select('*')
              .eq('Supplier', supplier.SupplierName)
              .order('Timestamp', { ascending: true })
              .range(sStart, sStart + 999);

          // Apply pure ISO date filter so it perfectly bounds the table results
          if (startDateISO) {
              purchaseQuery = purchaseQuery.gte('Timestamp', startDateISO);
          }

          const { data, error } = await purchaseQuery;
          if (error || !data || data.length === 0) {
              sKeep = false;
          } else {
              supplierPurchasesData = supplierPurchasesData.concat(data);
              if (data.length < 1000) sKeep = false;
              else sStart += 1000;
          }
      }

      setSupplierPurchases([...supplierPurchasesData].reverse());

      let spend = 0;
      let orders = new Set();
      let prodMap = {};
      let timeMap = {};

      supplierPurchasesData.forEach(row => {
          const cost = Number(row.CostPrice) || 0;
          const qty = Number(row.PurchaseQty) || 0;
          const total = cost * qty;
          spend += total;

          // Track unique orders (fallback to date if no invoice number)
          let orderIdentifier = '';
          if (row.InvoiceNumber && row.InvoiceNumber !== "PRICE_LIST") {
              orderIdentifier = row.InvoiceNumber;
              orders.add(orderIdentifier);
          } else if (qty > 0) {
              orderIdentifier = row.Timestamp.substring(0, 10);
              orders.add(orderIdentifier);
          }

          // Product Lifecycle mapping
          const pCode = row.ProductCode;
          if (!prodMap[pCode]) {
              prodMap[pCode] = { name: row.ProductName, code: pCode, qty: 0, costs: [], latest: 0 };
          }
          prodMap[pCode].qty += qty;
          if (cost > 0) {
              prodMap[pCode].costs.push(cost);
              // Timestamp is sorted ascending, so last processed is the latest
              prodMap[pCode].latest = cost;
          }

          // Chart mapping (By Month)
          const month = row.Timestamp.substring(0, 7); // YYYY-MM
          if (!timeMap[month]) timeMap[month] = { date: month, spend: 0, monthlyOrders: new Set() };
          timeMap[month].spend += total;
          if (orderIdentifier) {
              timeMap[month].monthlyOrders.add(orderIdentifier);
          }
      });

      setSupplierStats({ 
          totalSpend: spend, 
          orderCount: orders.size, 
          uniqueProducts: Object.keys(prodMap).length 
      });

      const finalChartData = Object.values(timeMap).map(m => ({
          date: m.date,
          spend: m.spend,
          interactions: m.monthlyOrders.size
      })).sort((a,b) => a.date.localeCompare(b.date));

      setSupplierChartData(finalChartData);

      const prodArray = Object.values(prodMap).map(p => {
          const validCosts = p.costs.filter(c => c > 0);
          const min = validCosts.length > 0 ? Math.min(...validCosts) : 0;
          const max = validCosts.length > 0 ? Math.max(...validCosts) : 0;
          const avg = validCosts.length > 0 ? validCosts.reduce((a,b)=>a+b,0) / validCosts.length : 0;
          return { ...p, min, max, avg };
      }).sort((a,b) => b.qty - a.qty);

      setSupplierProductStats(prodArray);
  };

  // ==========================================
  // 5. FRUIT LIFECYCLE (COMPARISON) LOGIC
  // ==========================================
  const toggleFruitSelection = (product) => {
      setSelectedFruits(prev => {
          const exists = prev.find(p => p.ProductCode === product.ProductCode);
          
          if (isCompareMode) {
              if (exists) {
                  return prev.filter(p => p.ProductCode !== product.ProductCode);
              } else {
                  if (prev.length >= 5) {
                      alert("You can only compare up to 5 fruits at once.");
                      return prev;
                  }
                  return [...prev, product];
              }
          } else {
              // Single Select Mode
              return [product];
          }
      });
  };

  const handleCompareToggle = () => {
      setIsCompareMode(prevMode => {
          const newMode = !prevMode;
          // If we switch off compare mode and have multiple selected, keep only the first one
          if (!newMode && selectedFruits.length > 1) {
              setSelectedFruits([selectedFruits[0]]);
          }
          return newMode;
      });
  };

  const fetchFruitComparisonData = async (fruits) => {
      if (!fruits || fruits.length === 0) {
          setFruitComparisonData([]);
          setFruitComparisonStats([]);
          return;
      }

      const productCodes = fruits.map(f => f.ProductCode);
      let fruitData = [];
      let fKeep = true;
      let fStart = 0;
      
      while(fKeep) {
          const { data, error } = await supabase
              .from('Purchase')
              .select('ProductCode, Timestamp, CostPrice')
              .in('ProductCode', productCodes)
              .range(fStart, fStart + 999);

          if (error || !data || data.length === 0) fKeep = false;
          else {
              fruitData = fruitData.concat(data);
              if (data.length < 1000) fKeep = false;
              else fStart += 1000;
          }
      }

      // Initialize monthly structure
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthlyDataMap = {};
      months.forEach(m => monthlyDataMap[m] = { month: m });

      const statsMap = {};
      fruits.forEach(f => {
          statsMap[f.ProductCode] = {
              name: f.ProductName,
              code: f.ProductCode,
              monthlyTotals: Array(12).fill(0),
              monthlyCounts: Array(12).fill(0),
              allTimeTotal: 0,
              allTimeCount: 0
          };
      });

      fruitData.forEach(row => {
          const d = new Date(row.Timestamp);
          const cost = Number(row.CostPrice);
          const code = row.ProductCode;

          if (!isNaN(d) && cost > 0 && statsMap[code]) {
              const mIndex = d.getMonth();
              statsMap[code].monthlyTotals[mIndex] += cost;
              statsMap[code].monthlyCounts[mIndex] += 1;
              statsMap[code].allTimeTotal += cost;
              statsMap[code].allTimeCount += 1;
          }
      });

      const finalStats = [];
      
      fruits.forEach((f, idx) => {
          const sm = statsMap[f.ProductCode];
          let minPrice = Infinity;
          let maxPrice = 0;
          let peakSeason = '-';
          let offSeason = '-';

          months.forEach((m, mIndex) => {
              const total = sm.monthlyTotals[mIndex];
              const count = sm.monthlyCounts[mIndex];
              const avg = count > 0 ? total / count : null;

              if (avg !== null) {
                  monthlyDataMap[m][f.ProductName] = parseFloat(avg.toFixed(2));
                  if (avg < minPrice) { minPrice = avg; peakSeason = m; }
                  if (avg > maxPrice) { maxPrice = avg; offSeason = m; }
              }
          });

          finalStats.push({
              name: f.ProductName,
              code: f.ProductCode,
              color: FRUIT_COLORS[idx % FRUIT_COLORS.length],
              minPrice: minPrice === Infinity ? 0 : minPrice,
              maxPrice: maxPrice,
              avgPrice: sm.allTimeCount > 0 ? (sm.allTimeTotal / sm.allTimeCount) : 0,
              peakSeason,
              offSeason
          });
      });

      setFruitComparisonData(Object.values(monthlyDataMap));
      setFruitComparisonStats(finalStats);
  };

  // ==========================================
  // FILTERS & SORTING
  // ==========================================
  const filteredProducts = products.filter(p => {
    if (!productSearchTerm) return true;
    const lowerTerm = productSearchTerm.toLowerCase();
    const searchParts = lowerTerm.split(' '); 
    const combinedText = ((p.ProductName || '') + ' ' + (p.ProductCode || '') + ' ' + (p.Category || '')).toLowerCase();
    return searchParts.every(part => combinedText.includes(part));
  });

  // Accurate Sorting logic ensuring fallback values and exact targeting
  const sortedSuppliers = [...suppliers].sort((a, b) => {
      if (supplierSortBy === 'spend') return (Number(b.spend) || 0) - (Number(a.spend) || 0);
      if (supplierSortBy === 'invoices') return (Number(b.invoiceCount) || 0) - (Number(a.invoiceCount) || 0);
      if (supplierSortBy === 'products') return (Number(b.productCount) || 0) - (Number(a.productCount) || 0);
      return (a.SupplierName || '').localeCompare(b.SupplierName || '');
  });

  const filteredSuppliers = sortedSuppliers.filter(s => {
      if (!supplierSearchTerm) return true;
      return s.SupplierName.toLowerCase().includes(supplierSearchTerm.toLowerCase());
  });

  // Filter only items likely to be fruits for the new tab, and push selected to top
  const fruitProducts = products.filter(p => {
      const cat = (p.Category || '').toUpperCase();
      const matchesFruit = cat.includes('FRUIT') || cat.includes('LOCAL') || cat.includes('IMPORT');
      
      if (!fruitSearchTerm) return matchesFruit;
      
      const lowerTerm = fruitSearchTerm.toLowerCase();
      const searchParts = lowerTerm.split(' '); 
      const combinedText = ((p.ProductName || '') + ' ' + (p.ProductCode || '') + ' ' + cat).toLowerCase();
      return matchesFruit && searchParts.every(part => combinedText.includes(part));
  }).sort((a, b) => {
      const aSelected = selectedFruits.some(sf => sf.ProductCode === a.ProductCode);
      const bSelected = selectedFruits.some(sf => sf.ProductCode === b.ProductCode);

      if (aSelected && !bSelected) return -1;
      if (!aSelected && bSelected) return 1;

      return a.ProductName.localeCompare(b.ProductName);
  });

  if (loading) return <div className="p-10 flex items-center justify-center h-screen text-gray-400 font-black tracking-widest animate-pulse uppercase">Loading Intelligence...</div>;

  return (
    <div className="p-3 md:p-8 max-w-full overflow-x-hidden min-h-screen bg-gray-50/50 pb-32 animate-in fade-in duration-300">
        
        {/* HEADER */}
        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
           <div>
               <h1 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight">Price Intelligence</h1>
               <p className="text-[10px] md:text-xs text-gray-400 font-bold uppercase mt-1">Analyze product volatility and supplier relationships</p>
           </div>
        </div>

        {/* TABS */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 border-b border-gray-200">
            <button 
                onClick={() => setActiveTab('product')} 
                className={`px-5 py-2.5 rounded-t-xl font-bold text-sm transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === 'product' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-100'}`}
            >
                <PresentationChartLineIcon className="w-5 h-5" /> Product Price Trend
            </button>
            <button 
                onClick={() => setActiveTab('supplier')} 
                className={`px-5 py-2.5 rounded-t-xl font-bold text-sm transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === 'supplier' ? 'bg-purple-600 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-100'}`}
            >
                <BuildingOfficeIcon className="w-5 h-5" /> Supplier Analysis
            </button>
            <button 
                onClick={() => setActiveTab('seasonality')} 
                className={`px-5 py-2.5 rounded-t-xl font-bold text-sm transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === 'seasonality' ? 'bg-orange-500 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-100'}`}
            >
                <SunIcon className="w-5 h-5" /> Fruit Lifecycle Comparison
            </button>
        </div>

        {/* ==========================================
            TAB 1: PRODUCT PRICE TREND
            ========================================== */}
        {activeTab === 'product' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in">
                {/* LEFT: Product List */}
                <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-gray-100 lg:col-span-1 h-[400px] lg:h-[calc(100vh-140px)] flex flex-col">
                    <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">Select Product</h2>
                    <div className="relative mb-4 shrink-0">
                        <span className="absolute left-3.5 top-3.5 text-gray-400">🔍</span>
                        <input 
                            type="text"
                            placeholder="Search all products..."
                            className="w-full pl-10 p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                            value={productSearchTerm}
                            onChange={e => setProductSearchTerm(e.target.value)}
                        />
                    </div>
                    
                    <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                        {filteredProducts.map(p => (
                            <div 
                                key={p.ProductCode}
                                onClick={() => setSelectedProduct(p)}
                                className={`p-3 rounded-xl cursor-pointer border transition-all duration-200 group ${
                                    selectedProduct?.ProductCode === p.ProductCode 
                                    ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500 shadow-sm' 
                                    : 'bg-white border-gray-100 hover:border-blue-200 hover:bg-gray-50'
                                }`}
                            >
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className={`font-bold text-xs uppercase leading-tight mb-1 ${selectedProduct?.ProductCode === p.ProductCode ? 'text-blue-900' : 'text-gray-700'}`}>
                                            {p.ProductName}
                                        </div>
                                        <div className="text-[9px] text-gray-400 font-mono bg-white border border-gray-200 px-1.5 py-0.5 rounded w-fit">
                                            {p.ProductCode}
                                        </div>
                                    </div>
                                    {p.latestPurchase > 0 ? (
                                        <div className="text-[8px] font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded-lg whitespace-nowrap ml-2 border border-gray-100">
                                            {new Date(p.latestPurchase).toLocaleDateString('en-GB', {day:'2-digit', month:'short'})}
                                        </div>
                                    ) : (
                                        <div className="text-[8px] font-bold text-gray-300 bg-gray-50 px-2 py-1 rounded-lg whitespace-nowrap ml-2 border border-gray-100">-</div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {filteredProducts.length === 0 && <div className="text-center py-10 text-gray-400 text-sm italic font-bold">No matching products found.</div>}
                    </div>
                </div>

                {/* RIGHT: Product Stats & Charts */}
                <div className="lg:col-span-2 space-y-6 overflow-y-auto lg:h-[calc(100vh-140px)] pr-1 custom-scrollbar">
                    {selectedProduct ? (
                        <>
                            {/* Header Card */}
                            <div className="bg-white p-5 md:p-6 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <div>
                                    <h2 className="text-xl md:text-2xl font-black text-gray-800 leading-none uppercase tracking-tight">{selectedProduct.ProductName}</h2>
                                    <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-wide font-mono">Code: {selectedProduct.ProductCode}</p>
                                </div>
                                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 p-1 rounded-xl shadow-sm w-full md:w-auto">
                                    <select value={dateRange} onChange={(e) => setDateRange(e.target.value)} className="bg-transparent text-xs font-bold text-gray-700 outline-none px-3 py-2 cursor-pointer w-full uppercase tracking-wider">
                                        <option value="1day">Last 24 Hours</option><option value="3days">Last 3 Days</option><option value="7days">Last 7 Days</option><option value="1month">Last 1 Month</option><option value="3months">Last 3 Months</option><option value="1year">Last 1 Year</option><option value="all">All Time</option>
                                    </select>
                                </div>
                            </div>

                            {/* Stats Cards */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                                <div className="bg-green-50 p-4 md:p-5 rounded-[2rem] border border-green-100 text-center shadow-sm">
                                    <p className="text-[8px] md:text-[10px] font-black text-green-500 uppercase tracking-widest mb-1">Max Cost</p>
                                    <p className="text-lg md:text-xl font-black text-green-700">RM {Number(productStats.maxSell).toFixed(2)}</p>
                                </div>
                                <div className="bg-blue-50 p-4 md:p-5 rounded-[2rem] border border-blue-100 text-center shadow-sm">
                                    <p className="text-[8px] md:text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">Avg Cost</p>
                                    <p className="text-lg md:text-xl font-black text-blue-700">RM {Number(productStats.avgSell).toFixed(2)}</p>
                                </div>
                                <div className="bg-orange-50 p-4 md:p-5 rounded-[2rem] border border-orange-100 text-center shadow-sm">
                                    <p className="text-[8px] md:text-[10px] font-black text-orange-500 uppercase tracking-widest mb-1">Latest Cost</p>
                                    <p className="text-lg md:text-xl font-black text-orange-700">RM {Number(productStats.latestCost).toFixed(2)}</p>
                                </div>
                                <div className="bg-purple-50 p-4 md:p-5 rounded-[2rem] border border-purple-100 text-center shadow-sm">
                                    <p className="text-[8px] md:text-[10px] font-black text-purple-500 uppercase tracking-widest mb-1">Sugg. Price (+15%)</p>
                                    <p className="text-lg md:text-xl font-black text-purple-700">RM {recommendedPrice}</p>
                                </div>
                            </div>

                            {/* Chart Section */}
                            <div className="bg-white p-5 md:p-6 rounded-[2rem] shadow-sm border border-gray-100">
                                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-6">Price Volatility Chart</h3>
                                <div className="h-[300px] w-full"> 
                                    {productChartData.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={productChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                                <CartesianGrid stroke="#f3f4f6" strokeDasharray="3 3" vertical={false} />
                                                <XAxis dataKey="date" tick={{fontSize: 10, fill: '#9ca3af', fontWeight: 'bold'}} axisLine={false} tickLine={false} dy={10} minTickGap={30} />
                                                <YAxis tick={{fontSize: 10, fill: '#9ca3af', fontWeight: 'bold'}} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                                                <Tooltip 
                                                    contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', padding: '12px'}} 
                                                    labelStyle={{fontWeight: 'bold', color: '#1f2937', marginBottom: '8px', fontSize: '12px'}} 
                                                    itemStyle={{fontSize: '12px', fontWeight: '500'}} 
                                                    formatter={(value, name) => [Number(value).toFixed(2), name]}
                                                />
                                                <Legend wrapperStyle={{paddingTop: '20px', fontSize: '12px', fontWeight: 'bold'}} iconType="circle" />
                                                <Line type="monotone" dataKey="sellingPrice" name={`Selling Price (${selectedProduct.SalesUOM || 'Unit'})`} stroke="#10b981" strokeWidth={3} dot={{r: 0}} activeDot={{r: 6, strokeWidth: 0}} connectNulls />
                                                <Line type="monotone" dataKey="costPrice" name="Cost Price" stroke="#ef4444" strokeWidth={3} dot={{r: 0}} activeDot={{r: 6, strokeWidth: 0}} connectNulls />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-gray-300 bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-100">
                                            <span className="text-4xl mb-3 opacity-50 grayscale">📉</span><p className="font-bold text-sm">No pricing data for this period</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* History Tables */}
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 pb-4">
                                <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[350px]">
                                    <div className="p-5 border-b border-red-50 bg-red-50/50"><h3 className="text-[10px] font-black text-red-600 uppercase tracking-widest">Latest Costs (Purchases)</h3></div>
                                    <div className="overflow-y-auto flex-1 custom-scrollbar">
                                        <table className="w-full text-[10px] md:text-xs text-left">
                                            <thead className="sticky top-0 bg-white shadow-sm z-10 text-gray-400 font-bold uppercase tracking-wider text-[9px]"><tr><th className="p-4 pl-5">Date</th><th className="p-4">Supplier</th><th className="p-4 text-right pr-5">Cost</th></tr></thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {purchaseHistory.slice(0, 50).map((row, idx) => (
                                                    <tr key={idx} className="hover:bg-red-50/30 transition-colors"><td className="p-4 pl-5 text-gray-500 font-mono text-[10px]">{row.Timestamp ? row.Timestamp.substring(0, 10) : '-'}</td><td className="p-4 font-bold text-gray-700 truncate max-w-[120px]" title={row.Supplier}>{row.Supplier}</td><td className="p-4 pr-5 text-right font-black text-red-600">RM {Number(row.CostPrice).toFixed(2)}</td></tr>
                                                ))}
                                                {purchaseHistory.length === 0 && <tr><td colSpan="3" className="p-10 text-center text-gray-400 italic font-bold">No purchase history found.</td></tr>}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[350px]">
                                    <div className="p-5 border-b border-green-50 bg-green-50/50"><h3 className="text-[10px] font-black text-green-600 uppercase tracking-widest">Latest Sales ({selectedProduct.SalesUOM || 'Unit'})</h3></div>
                                    <div className="overflow-y-auto flex-1 custom-scrollbar">
                                        <table className="w-full text-[10px] md:text-xs text-left">
                                            <thead className="sticky top-0 bg-white shadow-sm z-10 text-gray-400 font-bold uppercase tracking-wider text-[9px]"><tr><th className="p-4 pl-5">Date</th><th className="p-4">Customer</th><th className="p-4 text-right pr-5">Price</th></tr></thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {salesHistory.slice(0, 50).map((row, idx) => (
                                                    <tr key={idx} className="hover:bg-green-50/30 transition-colors"><td className="p-4 pl-5 text-gray-500 font-mono text-[10px]">{row["Delivery Date"] ? row["Delivery Date"].substring(0, 10) : '-'}</td><td className="p-4 font-bold text-gray-800 truncate max-w-[120px]" title={row["Customer Name"]}>{row["Customer Name"]}</td><td className="p-4 pr-5 text-right font-black text-green-600">RM {Number(row.Price).toFixed(2)}</td></tr>
                                                ))}
                                                {salesHistory.length === 0 && <tr><td colSpan="3" className="p-10 text-center text-gray-400 italic font-bold">No sales history found.</td></tr>}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 flex flex-col items-center justify-center h-full text-gray-300 p-10 text-center min-h-[400px]">
                            <div className="bg-gray-50 p-8 rounded-full mb-6 border border-gray-100"><PresentationChartLineIcon className="w-16 h-16 text-gray-300" /></div>
                            <h3 className="text-xl font-black text-gray-800 mb-2 uppercase tracking-tight">No Product Selected</h3>
                            <p className="text-xs max-w-xs mx-auto font-bold text-gray-400">Select a product from the list to view its price trend.</p>
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* ==========================================
            TAB 2: SUPPLIER ANALYSIS
            ========================================== */}
        {activeTab === 'supplier' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in">
                {/* LEFT: Supplier List */}
                <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-gray-100 lg:col-span-1 h-[400px] lg:h-[calc(100vh-140px)] flex flex-col">
                    <div className="flex justify-between items-center mb-2">
                        <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Select Supplier</h2>
                        <select 
                            className="bg-gray-50 border border-gray-200 text-gray-600 text-[9px] font-bold rounded p-1 outline-none cursor-pointer uppercase"
                            value={supplierSortBy}
                            onChange={(e) => setSupplierSortBy(e.target.value)}
                        >
                            <option value="alpha">A-Z</option>
                            <option value="spend">Top Spend</option>
                            <option value="invoices">Top Activity</option>
                            <option value="products">Most Products</option>
                        </select>
                    </div>
                    <div className="relative mb-4 shrink-0">
                        <span className="absolute left-3.5 top-3.5 text-gray-400">🔍</span>
                        <input 
                            type="text"
                            placeholder="Search suppliers..."
                            className="w-full pl-10 p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                            value={supplierSearchTerm}
                            onChange={e => setSupplierSearchTerm(e.target.value)}
                        />
                    </div>
                    
                    <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                        {filteredSuppliers.map(s => (
                            <div 
                                key={s.SupplierName}
                                onClick={() => setSelectedSupplier(s)}
                                className={`p-3 rounded-xl cursor-pointer border transition-all duration-200 group ${
                                    selectedSupplier?.SupplierName === s.SupplierName 
                                    ? 'bg-purple-50 border-purple-500 ring-1 ring-purple-500 shadow-sm' 
                                    : 'bg-white border-gray-100 hover:border-purple-200 hover:bg-gray-50'
                                }`}
                            >
                                <div className={`font-bold text-xs uppercase leading-tight ${selectedSupplier?.SupplierName === s.SupplierName ? 'text-purple-900' : 'text-gray-700'}`}>
                                    {s.SupplierName}
                                </div>
                                <div className="flex gap-2 mt-1.5">
                                    {supplierSortBy === 'spend' && <span className="text-[9px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded font-bold border border-gray-200">RM {Number(s.spend/1000).toFixed(1)}k</span>}
                                    {supplierSortBy === 'invoices' && <span className="text-[9px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded font-bold border border-gray-200">{s.invoiceCount} Ords</span>}
                                    {supplierSortBy === 'products' && <span className="text-[9px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded font-bold border border-gray-200">{s.productCount} Items</span>}
                                </div>
                            </div>
                        ))}
                        {filteredSuppliers.length === 0 && <div className="text-center py-10 text-gray-400 text-sm italic font-bold">No matching suppliers found.</div>}
                    </div>
                </div>

                {/* RIGHT: Supplier Stats & Charts */}
                <div className="lg:col-span-2 space-y-6 overflow-y-auto lg:h-[calc(100vh-140px)] pr-1 custom-scrollbar">
                    {selectedSupplier ? (
                        <>
                            {/* Header Card */}
                            <div className="bg-white p-5 md:p-6 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <div>
                                    <h2 className="text-xl md:text-2xl font-black text-gray-800 leading-none uppercase tracking-tight">{selectedSupplier.SupplierName}</h2>
                                    <p className="text-[10px] font-bold text-purple-600 mt-1 uppercase tracking-wide flex items-center gap-1"><BuildingOfficeIcon className="w-3 h-3"/> Supplier Profile</p>
                                </div>
                                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 p-1 rounded-xl shadow-sm w-full md:w-auto">
                                    <select value={dateRange} onChange={(e) => setDateRange(e.target.value)} className="bg-transparent text-xs font-bold text-gray-700 outline-none px-3 py-2 cursor-pointer w-full uppercase tracking-wider">
                                        <option value="1day">Last 24 Hours</option><option value="3days">Last 3 Days</option><option value="7days">Last 7 Days</option><option value="1month">Last 1 Month</option><option value="3months">Last 3 Months</option><option value="1year">Last 1 Year</option><option value="all">All Time</option>
                                    </select>
                                </div>
                            </div>

                            {/* Stats Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                                <div className="bg-purple-50 p-4 md:p-5 rounded-[2rem] border border-purple-100 text-center shadow-sm">
                                    <p className="text-[8px] md:text-[10px] font-black text-purple-500 uppercase tracking-widest mb-1">Total Spend</p>
                                    <p className="text-lg md:text-2xl font-black text-purple-800">RM {Number(supplierStats.totalSpend).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                                </div>
                                <div className="bg-blue-50 p-4 md:p-5 rounded-[2rem] border border-blue-100 text-center shadow-sm">
                                    <p className="text-[8px] md:text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">Total Invoices / POs</p>
                                    <p className="text-lg md:text-2xl font-black text-blue-800">{supplierStats.orderCount}</p>
                                </div>
                                <div className="bg-emerald-50 p-4 md:p-5 rounded-[2rem] border border-emerald-100 text-center shadow-sm">
                                    <p className="text-[8px] md:text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Unique Products</p>
                                    <p className="text-lg md:text-2xl font-black text-emerald-800">{supplierStats.uniqueProducts}</p>
                                </div>
                            </div>

                            {/* Chart Section */}
                            <div className="bg-white p-5 md:p-6 rounded-[2rem] shadow-sm border border-gray-100">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Spend Volume & Activity (Monthly)</h3>
                                    <div className="flex gap-2">
                                        <span className="flex items-center gap-1 text-[9px] font-bold text-purple-600"><span className="w-2 h-2 rounded-full bg-purple-500"></span> Spend (RM)</span>
                                        <span className="flex items-center gap-1 text-[9px] font-bold text-orange-500"><span className="w-2 h-2 rounded-full bg-orange-500"></span> Invoices Count</span>
                                    </div>
                                </div>
                                <div className="h-[300px] w-full"> 
                                    {supplierChartData.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={supplierChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                                <CartesianGrid stroke="#f3f4f6" strokeDasharray="3 3" vertical={false} />
                                                <XAxis dataKey="date" tick={{fontSize: 10, fill: '#9ca3af', fontWeight: 'bold'}} axisLine={false} tickLine={false} dy={10} />
                                                <YAxis yAxisId="left" tick={{fontSize: 10, fill: '#9ca3af', fontWeight: 'bold'}} axisLine={false} tickLine={false} />
                                                <YAxis yAxisId="right" orientation="right" tick={{fontSize: 10, fill: '#cbd5e1', fontWeight: 'bold'}} axisLine={false} tickLine={false} />
                                                <Tooltip 
                                                    contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', padding: '12px'}} 
                                                    labelStyle={{fontWeight: 'bold', color: '#1f2937', marginBottom: '8px', fontSize: '12px'}} 
                                                    formatter={(value, name) => [name === 'Total Spend (RM)' ? Number(value).toFixed(2) : value, name]}
                                                />
                                                <Bar yAxisId="left" dataKey="spend" name="Total Spend (RM)" fill="#a855f7" radius={[4, 4, 0, 0]} maxBarSize={50} />
                                                <Line yAxisId="right" type="monotone" dataKey="interactions" name="Invoices Count" stroke="#f59e0b" strokeWidth={3} activeDot={{r: 6}} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-gray-300 bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-100">
                                            <span className="text-4xl mb-3 opacity-50 grayscale">📉</span><p className="font-bold text-sm">No activity data for this period</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Products Supplied Table */}
                            <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                                <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
                                    <CubeIcon className="w-5 h-5 text-gray-600" />
                                    <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Products Supplied & Price Lifecycle</h3>
                                </div>
                                <div className="overflow-x-auto custom-scrollbar">
                                    <table className="w-full text-left whitespace-nowrap">
                                        <thead className="bg-white shadow-sm z-10 text-gray-400 font-black uppercase tracking-wider text-[9px] border-b border-gray-100">
                                            <tr>
                                                <th className="p-4 pl-6">Product Name</th>
                                                <th className="p-4 text-center">Qty Bought</th>
                                                <th className="p-4 text-right">Lowest Cost</th>
                                                <th className="p-4 text-right">Highest Cost</th>
                                                <th className="p-4 text-right">Avg Cost</th>
                                                <th className="p-4 text-right pr-6 text-purple-600">Latest Cost</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50 text-xs font-bold text-gray-700">
                                            {supplierProductStats.map((row, idx) => {
                                                const trendUp = row.latest > row.avg;
                                                const trendDown = row.latest < row.avg;
                                                return (
                                                <tr key={idx} className="hover:bg-purple-50/30 transition-colors">
                                                    <td className="p-4 pl-6">
                                                        <div className="text-gray-800 uppercase truncate max-w-[200px]">{row.name}</div>
                                                        <div className="text-[9px] font-mono text-gray-400 mt-0.5">{row.code}</div>
                                                    </td>
                                                    <td className="p-4 text-center"><span className="bg-gray-100 px-2.5 py-1 rounded-full text-gray-600">{row.qty}</span></td>
                                                    <td className="p-4 text-right font-medium text-gray-500">RM {row.min.toFixed(2)}</td>
                                                    <td className="p-4 text-right font-medium text-gray-500">RM {row.max.toFixed(2)}</td>
                                                    <td className="p-4 text-right font-medium text-gray-500">RM {row.avg.toFixed(2)}</td>
                                                    <td className="p-4 pr-6 text-right font-black text-purple-700 flex items-center justify-end gap-1.5 h-full">
                                                        RM {row.latest.toFixed(2)}
                                                        {trendUp && <span className="text-red-500 text-[10px]" title="Above Average">↑</span>}
                                                        {trendDown && <span className="text-green-500 text-[10px]" title="Below Average">↓</span>}
                                                        {!trendUp && !trendDown && <span className="text-gray-300 text-[10px]">-</span>}
                                                    </td>
                                                </tr>
                                            )})}
                                            {supplierProductStats.length === 0 && (
                                                <tr><td colSpan="6" className="p-10 text-center text-gray-400 italic font-bold">No product data found.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 flex flex-col items-center justify-center h-full text-gray-300 p-10 text-center min-h-[400px]">
                            <div className="bg-gray-50 p-8 rounded-full mb-6 border border-gray-100">
                                <BuildingOfficeIcon className="w-16 h-16 text-gray-300" />
                            </div>
                            <h3 className="text-xl font-black text-gray-800 mb-2 uppercase tracking-tight">No Supplier Selected</h3>
                            <p className="text-xs max-w-xs mx-auto font-bold text-gray-400">Select a supplier from the list on the left to analyze their cost patterns, volume, and product lifecycles.</p>
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* ==========================================
            TAB 3: FRUIT LIFECYCLE (COMPARISON)
            ========================================== */}
        {activeTab === 'seasonality' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in">
                {/* LEFT: Fruit List with Multi-Select logic */}
                <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-gray-100 lg:col-span-1 h-[400px] lg:h-[calc(100vh-140px)] flex flex-col">
                    <div className="flex justify-between items-center mb-2">
                        <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                            {isCompareMode ? 'Select Up to 5 Fruits' : 'Select Fruit'}
                        </h2>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={handleCompareToggle}
                                className={`text-[9px] font-bold px-2 py-1 rounded border transition-colors ${isCompareMode ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                            >
                                COMPARE
                            </button>
                            {isCompareMode && (
                                <span className="text-[10px] font-bold text-orange-500 bg-orange-50 px-2 py-0.5 rounded border border-orange-100">
                                    {selectedFruits.length}/5 Selected
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="relative mb-4 shrink-0">
                        <span className="absolute left-3.5 top-3.5 text-gray-400">🔍</span>
                        <input 
                            type="text"
                            placeholder="Search fruits..."
                            className="w-full pl-10 p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                            value={fruitSearchTerm}
                            onChange={e => setFruitSearchTerm(e.target.value)}
                        />
                    </div>
                    
                    <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                        {fruitProducts.map(p => {
                            const isSelected = selectedFruits.some(sf => sf.ProductCode === p.ProductCode);
                            return (
                                <div 
                                    key={p.ProductCode}
                                    onClick={() => toggleFruitSelection(p)}
                                    className={`p-3 rounded-xl cursor-pointer border transition-all duration-200 group ${
                                        isSelected 
                                        ? 'bg-orange-50 border-orange-500 ring-1 ring-orange-500 shadow-sm' 
                                        : 'bg-white border-gray-100 hover:border-orange-200 hover:bg-gray-50'
                                    }`}
                                >
                                    <div className={`font-bold text-xs uppercase leading-tight mb-1 ${isSelected ? 'text-orange-900' : 'text-gray-700'}`}>
                                        {p.ProductName}
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <div className="text-[9px] text-gray-400 font-mono bg-white border border-gray-200 px-1.5 py-0.5 rounded w-fit">
                                            {p.ProductCode}
                                        </div>
                                        {isSelected && <CheckIcon className="w-4 h-4 text-orange-500" strokeWidth={3} />}
                                    </div>
                                </div>
                            );
                        })}
                        {fruitProducts.length === 0 && <div className="text-center py-10 text-gray-400 text-sm italic font-bold">No fruit found.</div>}
                    </div>
                </div>

                {/* RIGHT: Seasonality Insights & Overlap Chart */}
                <div className="lg:col-span-2 space-y-6 overflow-y-auto lg:h-[calc(100vh-140px)] pr-1 custom-scrollbar">
                    {selectedFruits.length > 0 ? (
                        <>
                            {/* Header Card & Chips */}
                            <div className="bg-white p-5 md:p-6 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col gap-4">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <h2 className="text-xl md:text-2xl font-black text-gray-800 leading-none uppercase tracking-tight">
                                            {isCompareMode ? 'Lifecycle Comparison' : selectedFruits[0].ProductName}
                                        </h2>
                                        <p className="text-[10px] font-bold text-orange-600 mt-1 uppercase tracking-wide flex items-center gap-1">
                                            <SunIcon className="w-3 h-3"/> 
                                            {isCompareMode ? 'Average Cost by Season' : 'Seasonality Profile'}
                                        </p>
                                    </div>
                                </div>
                                {isCompareMode && (
                                    <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-50">
                                        {selectedFruits.map((f, idx) => (
                                            <span key={f.ProductCode} className="px-3 py-1.5 rounded-full text-xs font-bold text-white flex items-center gap-1.5" style={{backgroundColor: FRUIT_COLORS[idx % FRUIT_COLORS.length]}}>
                                                {f.ProductName}
                                                <XMarkIcon className="w-3 h-3 cursor-pointer hover:text-gray-200" onClick={() => toggleFruitSelection(f)} />
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Singular View Summary Cards */}
                            {!isCompareMode && fruitComparisonStats.length > 0 && (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                                    <div className="bg-green-50 p-4 md:p-5 rounded-[2rem] border border-green-100 text-center shadow-sm">
                                        <p className="text-[8px] md:text-[10px] font-black text-green-500 uppercase tracking-widest mb-1 flex items-center justify-center gap-1"><SunIcon className="w-3 h-3"/> Peak Season</p>
                                        <p className="text-lg md:text-xl font-black text-green-700">{fruitComparisonStats[0]?.peakSeason || '-'}</p>
                                        <p className="text-[9px] text-green-600 font-bold mt-1">Lowest Prices</p>
                                    </div>
                                    <div className="bg-red-50 p-4 md:p-5 rounded-[2rem] border border-red-100 text-center shadow-sm">
                                        <p className="text-[8px] md:text-[10px] font-black text-red-500 uppercase tracking-widest mb-1 flex items-center justify-center gap-1"><CalendarDaysIcon className="w-3 h-3"/> Off Season</p>
                                        <p className="text-lg md:text-xl font-black text-red-700">{fruitComparisonStats[0]?.offSeason || '-'}</p>
                                        <p className="text-[9px] text-red-600 font-bold mt-1">Highest Prices</p>
                                    </div>
                                    <div className="bg-white p-4 md:p-5 rounded-[2rem] border border-gray-100 text-center shadow-sm">
                                        <p className="text-[8px] md:text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Lowest Avg Cost</p>
                                        <p className="text-lg md:text-xl font-black text-gray-800">RM {Number(fruitComparisonStats[0]?.minPrice || 0).toFixed(2)}</p>
                                    </div>
                                    <div className="bg-white p-4 md:p-5 rounded-[2rem] border border-gray-100 text-center shadow-sm">
                                        <p className="text-[8px] md:text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Highest Avg Cost</p>
                                        <p className="text-lg md:text-xl font-black text-gray-800">RM {Number(fruitComparisonStats[0]?.maxPrice || 0).toFixed(2)}</p>
                                    </div>
                                </div>
                            )}

                            {/* Overlap Chart Section */}
                            <div className="bg-white p-5 md:p-6 rounded-[2rem] shadow-sm border border-gray-100">
                                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-6">Historical Monthly Averages (Overlap)</h3>
                                <div className="h-[350px] w-full"> 
                                    {fruitComparisonData.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={fruitComparisonData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                                <CartesianGrid stroke="#f3f4f6" strokeDasharray="3 3" vertical={false} />
                                                <XAxis dataKey="month" tick={{fontSize: 10, fill: '#9ca3af', fontWeight: 'bold'}} axisLine={false} tickLine={false} dy={10} />
                                                <YAxis tick={{fontSize: 10, fill: '#9ca3af', fontWeight: 'bold'}} axisLine={false} tickLine={false} domain={['auto', 'auto']} tickFormatter={(val) => val.toFixed(1)} />
                                                <Tooltip 
                                                    contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', padding: '12px'}} 
                                                    labelStyle={{fontWeight: 'bold', color: '#1f2937', marginBottom: '8px', fontSize: '12px'}} 
                                                    formatter={(value, name) => [`RM ${Number(value).toFixed(2)}`, name]}
                                                />
                                                <Legend wrapperStyle={{paddingTop: '20px', fontSize: '12px', fontWeight: 'bold'}} iconType="circle" />
                                                {selectedFruits.map((f, idx) => (
                                                    <Area 
                                                        key={f.ProductCode}
                                                        type="monotone" 
                                                        dataKey={f.ProductName} 
                                                        stroke={FRUIT_COLORS[idx % FRUIT_COLORS.length]} 
                                                        fill={FRUIT_COLORS[idx % FRUIT_COLORS.length]}
                                                        fillOpacity={0.15}
                                                        strokeWidth={3} 
                                                        dot={{r: 4, strokeWidth: 0, fill: FRUIT_COLORS[idx % FRUIT_COLORS.length]}} 
                                                        activeDot={{r: 7, strokeWidth: 0}} 
                                                        connectNulls 
                                                    />
                                                ))}
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-gray-300 bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-100">
                                            <span className="text-4xl mb-3 opacity-50 grayscale">📉</span><p className="font-bold text-sm">Loading historical data...</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Comparison Stats Table */}
                            <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                                <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
                                    <ArrowsUpDownIcon className="w-5 h-5 text-gray-600" />
                                    <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Aggregate Cost Comparison</h3>
                                </div>
                                <div className="overflow-x-auto custom-scrollbar">
                                    <table className="w-full text-left whitespace-nowrap">
                                        <thead className="bg-white shadow-sm z-10 text-gray-400 font-black uppercase tracking-wider text-[9px] border-b border-gray-100">
                                            <tr>
                                                <th className="p-4 pl-6">Product</th>
                                                <th className="p-4 text-center">Peak Season (Low Cost)</th>
                                                <th className="p-4 text-center">Off Season (High Cost)</th>
                                                <th className="p-4 text-right">Lowest Avg</th>
                                                <th className="p-4 text-right">Highest Avg</th>
                                                <th className="p-4 text-right pr-6">All-Time Avg</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50 text-xs font-bold text-gray-700">
                                            {fruitComparisonStats.map((row) => (
                                                <tr key={row.code} className="hover:bg-orange-50/30 transition-colors">
                                                    <td className="p-4 pl-6 flex items-center gap-2">
                                                        <div className="w-3 h-3 rounded-full" style={{backgroundColor: row.color}}></div>
                                                        <div>
                                                            <div className="text-gray-800 uppercase truncate max-w-[180px]">{row.name}</div>
                                                            <div className="text-[9px] font-mono text-gray-400 mt-0.5">{row.code}</div>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-center text-green-600">{row.peakSeason}</td>
                                                    <td className="p-4 text-center text-red-600">{row.offSeason}</td>
                                                    <td className="p-4 text-right font-medium text-gray-500">RM {Number(row.minPrice).toFixed(2)}</td>
                                                    <td className="p-4 text-right font-medium text-gray-500">RM {Number(row.maxPrice).toFixed(2)}</td>
                                                    <td className="p-4 pr-6 text-right font-black text-gray-800">RM {Number(row.avgPrice).toFixed(2)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 flex flex-col items-center justify-center h-full text-gray-300 p-10 text-center min-h-[400px]">
                            <div className="bg-orange-50 p-8 rounded-full mb-6 border border-orange-100">
                                <SunIcon className="w-16 h-16 text-orange-400" />
                            </div>
                            <h3 className="text-xl font-black text-gray-800 mb-2 uppercase tracking-tight">No Fruits Selected</h3>
                            <p className="text-xs max-w-xs mx-auto font-bold text-gray-400">Select a fruit to uncover its seasonal lifecycle and historical pricing trends.</p>
                        </div>
                    )}
                </div>
            </div>
        )}

    </div>
  );
}