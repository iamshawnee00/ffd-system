'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import { 
  CurrencyDollarIcon, 
  TruckIcon, 
  UserGroupIcon, 
  PresentationChartLineIcon,
  ShoppingBagIcon,
  FunnelIcon 
} from '@heroicons/react/24/outline';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export default function InsightsPage() {
  const [loading, setLoading] = useState(true);
  
  // Data States
  const [volumeTrend, setVolumeTrend] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [customerSegments, setCustomerSegments] = useState([]);
  const [deliveryEfficiency, setDeliveryEfficiency] = useState([]);
  const [profitMargins, setProfitMargins] = useState([]);
  
  // New States for Interactivity
  const [dataRange, setDataRange] = useState('');
  const [selectedTier, setSelectedTier] = useState(null); // For Customer Modal
  const [tierCustomers, setTierCustomers] = useState({}); // Stores list of customers per tier
  const [sortConfig, setSortConfig] = useState({ key: 'margin', direction: 'asc' }); // Sorting state

  useEffect(() => {
    fetchDataAndAnalyze();
  }, []);

  const fetchDataAndAnalyze = async () => {
    setLoading(true);
    
    // 1. Fetch ALL Orders
    const { data: orders } = await supabase
      .from('Orders')
      .select('*')
      .order('Delivery Date', { ascending: true });

    // 2. Fetch Purchases
    const { data: purchases } = await supabase
      .from('Purchase')
      .select('*');

    // 3. Fetch Products
    const { data: products } = await supabase
      .from('ProductMaster')
      .select('*');

    if (orders && orders.length > 0) {
        // Set Data Range
        const start = new Date(orders[0]["Delivery Date"]);
        const end = new Date(orders[orders.length - 1]["Delivery Date"]);
        setDataRange(`${start.toLocaleDateString('en-GB', {month:'short', year:'numeric'})} - ${end.toLocaleDateString('en-GB', {month:'short', year:'numeric'})}`);

        analyzeVolumeTrends(orders);
        analyzeTopProducts(orders);
        analyzeCustomerSegments(orders);
        analyzeDeliveryEfficiency(orders);
        analyzeProfitMargins(orders, purchases || [], products || []);
    }
    
    setLoading(false);
  };

  const analyzeVolumeTrends = (orders) => {
      const trends = {};
      orders.forEach(o => {
          const date = new Date(o["Delivery Date"]);
          if(isNaN(date)) return;
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          if (!trends[key]) trends[key] = { month: key, orders: 0, revenue: 0 };
          trends[key].orders += 1;
          trends[key].revenue += Number(o.Price || 0);
      });
      const sorted = Object.values(trends).sort((a,b) => a.month.localeCompare(b.month)).slice(-6);
      setVolumeTrend(sorted);
  };

  const analyzeTopProducts = (orders) => {
      const prodMap = {};
      let totalRevenue = 0;
      orders.forEach(o => {
          const key = o["Product Code"];
          const rev = Number(o.Price || 0);
          if (!prodMap[key]) prodMap[key] = { code: key, name: o["Order Items"], revenue: 0 };
          prodMap[key].revenue += rev;
          totalRevenue += rev;
      });
      const sorted = Object.values(prodMap).sort((a, b) => b.revenue - a.revenue);
      setTopProducts(sorted.slice(0, 10)); 
  };

  const analyzeCustomerSegments = (orders) => {
      const custMap = {};
      orders.forEach(o => {
          const name = o["Customer Name"];
          if(!custMap[name]) custMap[name] = 0;
          custMap[name] += Number(o.Price || 0);
      });

      const tiers = { Platinum: [], Gold: [], Silver: [], Bronze: [] };
      
      Object.entries(custMap).forEach(([name, amt]) => {
          if (amt > 10000) tiers.Platinum.push({ name, amt });
          else if (amt > 5000) tiers.Gold.push({ name, amt });
          else if (amt > 1000) tiers.Silver.push({ name, amt });
          else tiers.Bronze.push({ name, amt });
      });

      // Sort customers within tiers by spending
      Object.keys(tiers).forEach(key => tiers[key].sort((a,b) => b.amt - a.amt));
      
      setTierCustomers(tiers);
      const data = Object.keys(tiers).map(key => ({ name: key, value: tiers[key].length }));
      setCustomerSegments(data);
  };

  const analyzeDeliveryEfficiency = (orders) => {
      const dayMap = { 'Sun': 0, 'Mon': 0, 'Tue': 0, 'Wed': 0, 'Thu': 0, 'Fri': 0, 'Sat': 0 };
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      orders.forEach(o => {
          const d = new Date(o["Delivery Date"]);
          if(!isNaN(d)) dayMap[days[d.getDay()]]++;
      });
      const data = days.map(d => ({ day: d, orders: dayMap[d] }));
      setDeliveryEfficiency(data);
  };

  const analyzeProfitMargins = (orders, purchases, products) => {
      const costMap = {};
      purchases.forEach(p => {
          if (!costMap[p.ProductCode]) costMap[p.ProductCode] = { total: 0, count: 0 };
          costMap[p.ProductCode].total += Number(p.CostPrice || 0);
          costMap[p.ProductCode].count++;
      });

      const marginData = [];
      const prodSales = {}; 

      orders.forEach(o => {
           const code = o["Product Code"];
           if (!prodSales[code]) prodSales[code] = { rev: 0, qty: 0 };
           prodSales[code].rev += Number(o.Price || 0);
           prodSales[code].qty += Number(o.Quantity || 0);
      });

      Object.keys(prodSales).forEach(code => {
          const sales = prodSales[code];
          const avgSellPrice = sales.rev / sales.qty;
          let avgCost = 0;
          if (costMap[code] && costMap[code].count > 0) {
              avgCost = costMap[code].total / costMap[code].count;
          }

          if (avgCost > 0 && sales.rev > 500) { 
              const margin = ((avgSellPrice - avgCost) / avgSellPrice) * 100;
              const pName = products.find(p => p.ProductCode === code)?.ProductName || code;
              marginData.push({
                  name: pName,
                  margin: parseFloat(margin.toFixed(1)),
                  revenue: sales.rev
              });
          }
      });
      // Initial sort by lowest margin
      setProfitMargins(marginData.sort((a,b) => a.margin - b.margin));
  };

  // --- Sorting Handler ---
  const handleSort = (key) => {
      let direction = 'asc';
      if (sortConfig.key === key && sortConfig.direction === 'asc') {
          direction = 'desc';
      }
      setSortConfig({ key, direction });

      const sorted = [...profitMargins].sort((a, b) => {
          if (a[key] < b[key]) return direction === 'asc' ? -1 : 1;
          if (a[key] > b[key]) return direction === 'asc' ? 1 : -1;
          return 0;
      });
      setProfitMargins(sorted);
  };

  if (loading) return <div className="p-10 text-center font-bold text-gray-400">Loading Business Intelligence...</div>;

  return (
    <div className="p-3 md:p-6 max-w-full overflow-x-hidden pt-16 md:pt-6 bg-gray-50 min-h-screen">
      
      <div className="mb-8">
        <h1 className="text-xl md:text-3xl font-black text-gray-800 tracking-tight">Business Insights</h1>
        <p className="text-[10px] md:text-sm text-gray-400 font-bold uppercase mt-1">Data Source: {dataRange}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          
          {/* 1. Volume Trend */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
              <div className="flex items-center gap-2 mb-6">
                  <PresentationChartLineIcon className="w-6 h-6 text-blue-500" />
                  <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest">Monthly Revenue Trend</h3>
              </div>
              <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={volumeTrend}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6"/>
                          <XAxis dataKey="month" tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                          <YAxis tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={{borderRadius: '12px', border:'none', boxShadow:'0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                          <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={3} dot={{r:4}} />
                      </LineChart>
                  </ResponsiveContainer>
              </div>
          </div>

          {/* 3. Customer Segments */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 relative">
              <div className="flex items-center gap-2 mb-6">
                  <UserGroupIcon className="w-6 h-6 text-purple-500" />
                  <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest">Customer Tiers (Click Slice)</h3>
              </div>
              <div className="h-64 w-full flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                          <Pie 
                            data={customerSegments} 
                            cx="50%" cy="50%" 
                            innerRadius={60} outerRadius={80} 
                            paddingAngle={5} 
                            dataKey="value"
                            onClick={(data) => setSelectedTier(data.name)} // Interactive Click
                            cursor="pointer"
                          >
                              {customerSegments.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                          </Pie>
                          <Tooltip />
                          <Legend verticalAlign="middle" align="right" />
                      </PieChart>
                  </ResponsiveContainer>
              </div>
              {/* Customer List Modal/Overlay */}
              {selectedTier && (
                  <div className="absolute inset-0 bg-white/95 backdrop-blur-sm z-10 flex flex-col p-6 rounded-3xl animate-in fade-in">
                      <div className="flex justify-between items-center mb-4">
                          <h4 className="font-black text-gray-800 uppercase text-lg">{selectedTier} Customers</h4>
                          <button onClick={() => setSelectedTier(null)} className="text-gray-400 hover:text-red-500 text-2xl font-bold">×</button>
                      </div>
                      <div className="overflow-y-auto flex-1 custom-scrollbar space-y-2">
                          {tierCustomers[selectedTier]?.map((c, i) => (
                              <div key={i} className="flex justify-between text-xs border-b border-gray-100 pb-1">
                                  <span className="font-bold text-gray-700">{c.name}</span>
                                  <span className="text-gray-500">RM {(c.amt/1000).toFixed(1)}k</span>
                              </div>
                          ))}
                      </div>
                  </div>
              )}
          </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          
          {/* 2. Top Products */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 lg:col-span-2">
              <div className="flex items-center gap-2 mb-6">
                  <ShoppingBagIcon className="w-6 h-6 text-emerald-500" />
                  <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest">Top Selling Products (Revenue)</h3>
              </div>
              <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topProducts} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f3f4f6"/>
                          <XAxis type="number" hide />
                          <YAxis dataKey="name" type="category" width={150} tick={{fontSize: 10, fontWeight: 600}} axisLine={false} tickLine={false} />
                          <Tooltip cursor={{fill: '#f9fafb'}} contentStyle={{borderRadius: '12px'}} />
                          <Bar dataKey="revenue" fill="#10b981" radius={[0, 4, 4, 0]} barSize={20} />
                      </BarChart>
                  </ResponsiveContainer>
              </div>
          </div>

          {/* 4. Delivery Efficiency */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
              <div className="flex items-center gap-2 mb-6">
                  <TruckIcon className="w-6 h-6 text-orange-500" />
                  <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest">Delivery Volume</h3>
              </div>
              <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={deliveryEfficiency}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6"/>
                          <XAxis dataKey="day" tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                          <Tooltip cursor={{fill: '#f9fafb'}} contentStyle={{borderRadius: '12px'}} />
                          <Bar dataKey="orders" fill="#f97316" radius={[4, 4, 0, 0]} barSize={30} />
                      </BarChart>
                  </ResponsiveContainer>
              </div>
          </div>
      </div>

      {/* 5. Profit Margins */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-6">
              <CurrencyDollarIcon className="w-6 h-6 text-red-500" />
              <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest">Margin Analysis (Sortable)</h3>
          </div>
          <div className="overflow-x-auto">
              <table className="w-full text-left">
                  <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase border-b border-gray-100 cursor-pointer select-none">
                      <tr>
                          <th className="p-4 rounded-tl-xl" onClick={() => handleSort('name')}>Product Name {sortConfig.key==='name' && (sortConfig.direction==='asc' ? '▲' : '▼')}</th>
                          <th className="p-4 text-right" onClick={() => handleSort('revenue')}>Revenue {sortConfig.key==='revenue' && (sortConfig.direction==='asc' ? '▲' : '▼')}</th>
                          <th className="p-4 text-right rounded-tr-xl" onClick={() => handleSort('margin')}>Margin % {sortConfig.key==='margin' && (sortConfig.direction==='asc' ? '▲' : '▼')}</th>
                      </tr>
                  </thead>
                  <tbody className="text-xs font-bold text-gray-700">
                      {profitMargins.map((item, idx) => (
                          <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50/50">
                              <td className="p-4">{item.name}</td>
                              <td className="p-4 text-right">RM {item.revenue.toFixed(2)}</td>
                              <td className={`p-4 text-right ${item.margin < 15 ? 'text-red-500' : 'text-green-600'}`}>
                                  {item.margin}%
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      </div>

    </div>
  );
}