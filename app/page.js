'use client';
import { useEffect, useState, useMemo } from 'react';
import { supabase } from './lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { 
    ShoppingBagIcon, 
    TruckIcon, 
    CubeIcon, 
    HeartIcon,
    ArrowPathIcon,
    PresentationChartLineIcon,
    FireIcon
} from '@heroicons/react/24/solid';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';

// Helper for local date string formatting (YYYY-MM-DD) across GMT+8
const getLocalDateStr = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export default function Dashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  // Metrics States
  const [todayDeliveries, setTodayDeliveries] = useState({ pending: 0, transit: 0, delivered: 0, total: 0 });
  const [weeklyOrders, setWeeklyOrders] = useState({ count: 0, revenue: 0 });
  const [productStats, setProductStats] = useState({ total: 0, healthIndex: 0, critical: 0 });
  
  // Insights States
  const [weeklyTrend, setWeeklyTrend] = useState([]);
  const [topProducts, setTopProducts] = useState([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
          router.push('/login');
      } else {
          const email = session.user?.email || "";
          setCurrentUser(email.split('@')[0].toUpperCase());
          fetchDashboardData();
      }
    });
  }, [router]);

  const fetchDashboardData = async () => {
    setLoading(true);
    
    const now = new Date();
    const todayStr = getLocalDateStr(now);
    
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 6); // Include today + 6 days past
    const weekStartStr = getLocalDateStr(sevenDaysAgo);

    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const tomorrowStr = getLocalDateStr(tomorrow);

    // 1. Fetch Orders 
    // SAFEFETCH: Fetching by Timestamp to bypass Supabase string filtering bugs on "Delivery Date" column space.
    const { data: orders, error: ordersErr } = await supabase
        .from('Orders')
        .select('*')
        .order('Timestamp', { ascending: false })
        .limit(5000);
        
    if (ordersErr) console.error("Error fetching orders for dashboard:", ordersErr);

    // 2. Fetch Products for Health Index
    const { data: prods } = await supabase
        .from('ProductMaster')
        .select('ProductCode, StockBalance, ProductName');

    // --- Process Today's Deliveries ---
    const deliv = { pending: 0, transit: 0, delivered: 0, total: 0 };
    const todayOrderRows = (orders || []).filter(o => {
        const dStrFull = o["Delivery Date"];
        const d = dStrFull && dStrFull.length >= 10 ? dStrFull.substring(0, 10) : null;
        return d === todayStr;
    });

    const uniqueDOsToday = new Set();
    todayOrderRows.forEach(o => {
        if (!uniqueDOsToday.has(o.DONumber)) {
            uniqueDOsToday.add(o.DONumber);
            const s = String(o.Status || 'PENDING').toUpperCase().trim().replace(/_/g, ' ');
            if (s.includes('DELIVERED') || s.includes('COMPLETED') || s.includes('DEPOSITED') || s.includes('POD')) {
                deliv.delivered++;
            } else if (s.includes('TRANSIT') || s.includes('STARTED') || s.includes('PICKED') || s.includes('WAY') || s.includes('READY')) {
                deliv.transit++;
            } else {
                deliv.pending++;
            }
            deliv.total++;
        }
    });
    setTodayDeliveries(deliv);

    // --- Process Weekly Overview & Trends & Usage Maps ---
    let weekCount = 0;
    let weekRev = 0;
    const trendMap = {};
    const prodRevMap = {};
    const uniqueDOsWeek = new Set();
    
    const usageMap = {};
    const tomorrowMap = {};

    // Initialize trend map for the last 7 days so chart is never completely empty
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dStr = getLocalDateStr(d);
        trendMap[dStr] = { date: dStr.substring(5), orders: 0 }; // MM-DD
    }

    (orders || []).forEach(o => {
        const dStrFull = o["Delivery Date"];
        if (!dStrFull || dStrFull.length < 10) return;
        const dStr = dStrFull.substring(0, 10);
        const code = o["Product Code"];
        const qty = Number(o.Quantity || 0);
        const price = Number(o.Price || 0);
        const lineRevenue = price * qty;

        // Usage maps for predictive stock analysis
        if (dStr === tomorrowStr) {
            tomorrowMap[code] = (tomorrowMap[code] || 0) + qty;
        } else if (dStr >= weekStartStr && dStr <= todayStr) {
            usageMap[code] = (usageMap[code] || 0) + qty;
        }
        
        // Only count towards "This Week" metrics if it falls in the strict 7-day window
        if (dStr >= weekStartStr && dStr <= todayStr) {
            if (!uniqueDOsWeek.has(o.DONumber)) {
                uniqueDOsWeek.add(o.DONumber);
                weekCount++;
            }
            
            // Build Revenue for Top Products (only considering recent 7 days)
            weekRev += lineRevenue;

            const pName = o["Order Items"];
            if (pName) {
                if (!prodRevMap[pName]) prodRevMap[pName] = { name: pName, revenue: 0 };
                prodRevMap[pName].revenue += lineRevenue;
            }
        }
        
        // Populate Trend Map (will only map if the date falls within the initialized 7 days)
        if (trendMap[dStr]) {
            // Count unique orders per day for the chart
            if (!trendMap[dStr].countedDOs) trendMap[dStr].countedDOs = new Set();
            if (!trendMap[dStr].countedDOs.has(o.DONumber)) {
                trendMap[dStr].countedDOs.add(o.DONumber);
                trendMap[dStr].orders++;
            }
        }
    });

    setWeeklyOrders({ count: weekCount, revenue: weekRev });
    setWeeklyTrend(Object.values(trendMap));
    
    const sortedProds = Object.values(prodRevMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    setTopProducts(sortedProds);

    // --- Process Product Health (Strictly CRITICAL vs TOTAL) ---
    let criticalCount = 0;
    const totalProds = prods?.length || 0;

    prods?.forEach(p => {
        const currentStock = Number(p.StockBalance || 0);
        const past7 = usageMap[p.ProductCode] || 0;
        const avgDaily = past7 / 7;
        const actualTomorrow = tomorrowMap[p.ProductCode] || 0;
        
        // Predicted need is the max between historically smoothed average and confirmed actual orders
        const predictedNeed = Math.max(Math.ceil(avgDaily * 1.5), actualTomorrow);

        let isCritical = false;

        if (currentStock <= 0) {
            // It is only critical if we have <= 0 stock AND we predict we need it tomorrow.
            // If predictedNeed is 0, it's just 'Out of Stock' but NOT critical.
            if (predictedNeed > 0) isCritical = true;
        } else if (currentStock < actualTomorrow) {
            // We have some stock, but NOT ENOUGH for confirmed actual orders tomorrow.
            isCritical = true;
        }

        if (isCritical) {
            criticalCount++;
        }
    });

    // New Health Index Formula: STRICTLY ((Total - Critical) / Total) * 100
    // OOS items without demand don't drag it down.
    const healthIndex = totalProds > 0 ? Math.round(((totalProds - criticalCount) / totalProds) * 100) : 100;
    setProductStats({ total: totalProds, healthIndex, critical: criticalCount });

    setLoading(false);
  };

  const handleManualSync = async () => {
      setIsSyncing(true);
      try {
          const res = await fetch('/api/shipday/sync-status', { method: 'POST' });
          if (res.ok) await fetchDashboardData();
      } catch (err) {
          console.error("Sync failed", err);
      } finally {
          setIsSyncing(false);
      }
  };

  // Current Date display
  const todayDisplay = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  if (loading) return <div className="p-10 flex items-center justify-center h-screen text-gray-400 font-black tracking-widest animate-pulse uppercase">Waking up Engine...</div>;

  return (
    <div className="p-3 md:p-8 max-w-full overflow-x-hidden min-h-screen bg-gray-50/50 pb-32 animate-in fade-in duration-300">
      
      {/* HEADER: Standardized to match Order Management page */}
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
         <div>
             <h1 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight">Overview</h1>
             <p className="text-[10px] md:text-xs text-gray-400 font-bold uppercase mt-1">Welcome back, {currentUser}</p>
         </div>
         <div className="flex items-center gap-3 w-full sm:w-auto">
             <div className="text-[9px] md:text-xs font-bold text-gray-500 bg-white border border-gray-200 px-3 py-1.5 rounded-full uppercase shadow-sm hidden sm:block">
                 Date: {todayDisplay}
             </div>
             <button
                 onClick={handleManualSync}
                 disabled={isSyncing}
                 className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-black py-2 px-4 md:py-2 md:px-5 rounded-full text-[10px] md:text-xs transition-all flex items-center justify-center gap-2 border border-blue-200 disabled:opacity-50 shadow-sm active:scale-95 w-full sm:w-auto uppercase"
             >
                 <ArrowPathIcon className={`w-3 h-3 md:w-4 md:h-4 ${isSyncing ? 'animate-spin text-blue-500' : ''}`} />
                 {isSyncing ? 'SYNCING...' : 'SYNC SHIPDAY'}
             </button>
         </div>
      </div>

      {/* 4 KEY METRICS ROW - NOW INTERACTIVE */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6">
          
          {/* 1. Today's Delivery -> Directs to Delivery Page */}
          <div 
              onClick={() => router.push('/delivery')}
              className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between group hover:border-blue-300 hover:shadow-md transition-all cursor-pointer"
          >
              <div className="flex justify-between items-start mb-4">
                  <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 group-hover:text-blue-500 transition-colors">Today's Delivery</p>
                      <h3 className="text-3xl font-black text-gray-900 group-hover:text-blue-600 transition-colors">{todayDeliveries.total}</h3>
                  </div>
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl group-hover:scale-110 group-hover:bg-blue-600 group-hover:text-white transition-all">
                      <TruckIcon className="w-6 h-6" />
                  </div>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide">
                  <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded-md">{todayDeliveries.pending} Pend</span>
                  <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-md">{todayDeliveries.transit} Trans</span>
                  <span className="bg-green-100 text-green-700 px-2 py-1 rounded-md">{todayDeliveries.delivered} Deliv</span>
              </div>
          </div>

          {/* 2. This Week Orders -> Directs to Order List */}
          <div 
              onClick={() => router.push('/orders/list')}
              className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between group hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer"
          >
              <div className="flex justify-between items-start mb-4">
                  <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 group-hover:text-indigo-500 transition-colors">This Week Orders</p>
                      <h3 className="text-3xl font-black text-gray-900 group-hover:text-indigo-600 transition-colors">{weeklyOrders.count}</h3>
                  </div>
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl group-hover:scale-110 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                      <ShoppingBagIcon className="w-6 h-6" />
                  </div>
              </div>
              <div className="text-xs font-bold text-gray-500 group-hover:text-gray-700 transition-colors">
                  Total Revenue: <span className="text-indigo-600 font-black group-hover:text-indigo-700">RM {weeklyOrders.revenue.toFixed(2)}</span>
              </div>
          </div>

          {/* 3. Total Products -> Directs to Products Page */}
          <div 
              onClick={() => router.push('/products')}
              className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between group hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer"
          >
              <div className="flex justify-between items-start mb-4">
                  <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 group-hover:text-emerald-500 transition-colors">Total Products</p>
                      <h3 className="text-3xl font-black text-gray-900 group-hover:text-emerald-600 transition-colors">{productStats.total}</h3>
                  </div>
                  <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:scale-110 group-hover:bg-emerald-600 group-hover:text-white transition-all">
                      <CubeIcon className="w-6 h-6" />
                  </div>
              </div>
              <p className="text-xs font-bold text-gray-500 group-hover:text-gray-700 transition-colors">Active items in catalog</p>
          </div>

          {/* 4. Stock Health Index -> Directs to Stock Adjust Page */}
          <div 
              onClick={() => router.push('/stock')}
              className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between group hover:border-red-300 hover:shadow-md transition-all cursor-pointer"
          >
              <div className="flex justify-between items-start mb-4">
                  <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 group-hover:text-red-500 transition-colors">Stock Health Index</p>
                      <div className="flex items-end gap-1">
                          <h3 className={`text-3xl font-black ${productStats.healthIndex < 50 ? 'text-red-600' : productStats.healthIndex < 80 ? 'text-orange-500' : 'text-green-600'}`}>
                              {productStats.healthIndex}%
                          </h3>
                      </div>
                  </div>
                  <div className={`p-3 rounded-2xl group-hover:scale-110 transition-all ${productStats.healthIndex < 50 ? 'bg-red-50 text-red-600 group-hover:bg-red-600 group-hover:text-white' : 'bg-green-50 text-green-600 group-hover:bg-green-600 group-hover:text-white'}`}>
                      <HeartIcon className="w-6 h-6" />
                  </div>
              </div>
              <div className="text-xs font-bold text-gray-500 flex items-center gap-1 group-hover:text-gray-700 transition-colors">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                  <span className="text-red-600 font-black">{productStats.critical}</span> items critical
              </div>
          </div>

      </div>

      {/* BUSINESS INSIGHTS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Chart 1: 7-Day Order Volume */}
          <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col">
              <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                      <PresentationChartLineIcon className="w-6 h-6 text-indigo-500" />
                      <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest">7-Day Order Volume</h3>
                  </div>
              </div>
              <div className="h-64 w-full flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={weeklyTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <defs>
                              <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                              </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6"/>
                          <XAxis dataKey="date" tick={{fontSize: 10, fontWeight: 'bold', fill: '#9ca3af'}} axisLine={false} tickLine={false} dy={10} />
                          <YAxis tick={{fontSize: 10, fontWeight: 'bold', fill: '#9ca3af'}} axisLine={false} tickLine={false} allowDecimals={false} />
                          <Tooltip 
                              contentStyle={{borderRadius: '16px', border:'none', boxShadow:'0 10px 15px -3px rgba(0, 0, 0, 0.1)', fontWeight: 'bold'}} 
                              itemStyle={{color: '#4f46e5'}}
                          />
                          <Area type="monotone" dataKey="orders" name="Orders" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorOrders)" activeDot={{r: 6, strokeWidth: 0}} />
                      </AreaChart>
                  </ResponsiveContainer>
              </div>
          </div>

          {/* Chart 2: Top Products This Week */}
          <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col">
              <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                      <FireIcon className="w-6 h-6 text-orange-500" />
                      <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest">Top Products (This Week)</h3>
                  </div>
                  <span className="text-[9px] font-black bg-orange-100 text-orange-700 px-2 py-1 rounded-md uppercase">By Revenue</span>
              </div>
              <div className="h-64 w-full flex-1">
                  {topProducts.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={topProducts} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f3f4f6"/>
                              <XAxis type="number" hide />
                              <YAxis dataKey="name" type="category" width={130} tick={{fontSize: 10, fontWeight: 700, fill: '#4b5563'}} axisLine={false} tickLine={false} />
                              <Tooltip 
                                  cursor={{fill: '#f3f4f6'}} 
                                  contentStyle={{borderRadius: '12px', border: 'none', boxShadow:'0 10px 15px -3px rgba(0, 0, 0, 0.1)'}} 
                                  formatter={(value) => [`RM ${value.toFixed(2)}`, 'Revenue']}
                              />
                              <Bar dataKey="revenue" fill="#f97316" radius={[0, 8, 8, 0]} barSize={24} />
                          </BarChart>
                      </ResponsiveContainer>
                  ) : (
                      <div className="flex items-center justify-center h-full w-full text-gray-400 font-bold text-sm">
                          No revenue data generated this week.
                      </div>
                  )}
              </div>
          </div>

      </div>

    </div>
  );
}