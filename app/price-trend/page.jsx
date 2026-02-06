'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

export default function PriceTrendPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [salesHistory, setSalesHistory] = useState([]);
  const [purchaseHistory, setPurchaseHistory] = useState([]);
  const [stats, setStats] = useState({ maxSell: 0, minSell: 0, avgSell: 0 });
  
  // Date Range State - Default to ALL TIME
  const [dateRange, setDateRange] = useState('all');

  // 1. Fetch Product List (Show ALL products, sorted by activity)
  useEffect(() => {
    async function fetchProducts() {
      setLoading(true);

      // A. Get ALL Products from Master
      const { data: prodData } = await supabase
        .from('ProductMaster')
        .select('ProductCode, ProductName, Category, SalesUOM, BaseUOM');

      // B. Get Latest Purchase Date for EACH product to sort
      const { data: latestPurchases } = await supabase
        .from('Purchase')
        .select('ProductCode, Timestamp')
        .order('Timestamp', { ascending: false });

      // Create a map of Code -> Latest Timestamp
      const latestMap = {};
      if (latestPurchases) {
        latestPurchases.forEach(p => {
          if (!latestMap[p.ProductCode]) {
            latestMap[p.ProductCode] = new Date(p.Timestamp).getTime();
          }
        });
      }

      // Merge and Sort
      const sortedProducts = (prodData || []).map(p => ({
        ...p,
        latestPurchase: latestMap[p.ProductCode] || 0 
      })).sort((a, b) => {
          if (b.latestPurchase !== a.latestPurchase) {
              return b.latestPurchase - a.latestPurchase;
          }
          return a.ProductName.localeCompare(b.ProductName);
      });

      setProducts(sortedProducts);
      setLoading(false);
    }
    fetchProducts();
  }, []);

  // 2. Fetch Data Trigger
  useEffect(() => {
    if (selectedProduct) {
        fetchHistoryData(selectedProduct, dateRange);
    }
  }, [selectedProduct, dateRange]);

  const handleProductSelect = (product) => {
      setSelectedProduct(product);
  };

  // 3. Core Data Fetching Logic
  const fetchHistoryData = async (product, range) => {
    let startDate = null;
    const now = new Date();
    
    if (range !== 'all') {
        const past = new Date();
        switch (range) {
            case '1day': past.setDate(now.getDate() - 1); break;
            case '3days': past.setDate(now.getDate() - 3); break;
            case '7days': past.setDate(now.getDate() - 7); break;
            case '1month': past.setDate(now.getDate() - 30); break;
            case '3months': past.setDate(now.getDate() - 90); break;
            case '1year': past.setFullYear(now.getFullYear() - 1); break;
        }
        startDate = past.toISOString();
    }

    const targetUOM = product.SalesUOM || product.BaseUOM;

    // A. Fetch Sales History (Orders)
    let salesQuery = supabase
      .from('Orders')
      .select('"Delivery Date", Price, "Customer Name", UOM')
      .eq('Product Code', product.ProductCode)
      .eq('UOM', targetUOM)
      .not('Price', 'is', null) 
      .order('Delivery Date', { ascending: true });

    if (startDate) {
        salesQuery = salesQuery.gte('"Delivery Date"', startDate.substring(0, 10));
    }

    const { data: salesData, error: salesError } = await salesQuery;
    if (salesError) console.error("Sales Error:", salesError);

    // B. Fetch Purchase History
    let purchaseQuery = supabase
      .from('Purchase') 
      .select('Timestamp, CostPrice, Supplier') 
      .eq('ProductCode', product.ProductCode)
      .order('Timestamp', { ascending: true });

    if (startDate) {
        purchaseQuery = purchaseQuery.gte('Timestamp', startDate);
    }

    const { data: costData, error: costError } = await purchaseQuery;
    if (costError) console.error("Purchase Error:", costError);

    // Update Tables (Show latest first)
    setSalesHistory(salesData ? [...salesData].reverse() : []);
    setPurchaseHistory(costData ? [...costData].reverse() : []);

    // C. Process Chart Data
    const combinedMap = {};

    // 1. Map Sales
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

    // 2. Map Purchases
    const validCosts = [];
    if (costData) {
        costData.forEach(row => {
            const d = row.Timestamp.substring(0, 10);
            if (!combinedMap[d]) combinedMap[d] = { date: d };
            
            const cost = parseFloat(row.CostPrice);
            if (cost > 0) {
                combinedMap[d].costPrice = cost;
                validCosts.push(cost);
            }
        });
    }

    const finalData = Object.values(combinedMap).sort((a, b) => 
        new Date(a.date) - new Date(b.date)
    );
    setChartData(finalData);

    // Calculate Stats based on COST PRICE (Purchases)
    if (validCosts.length > 0) {
        setStats({
            maxSell: Math.max(...validCosts),
            minSell: Math.min(...validCosts),
            avgSell: (validCosts.reduce((a, b) => a + b, 0) / validCosts.length).toFixed(2)
        });
    } else {
        setStats({ maxSell: 0, minSell: 0, avgSell: 0 });
    }
  };

  const filteredProducts = products.filter(p => {
    if (!searchTerm) return true;
    const lowerTerm = searchTerm.toLowerCase();
    const searchParts = lowerTerm.split(' '); 
    const combinedText = (
      (p.ProductName || '') + ' ' + 
      (p.ProductCode || '') + ' ' + 
      (p.Category || '')
    ).toLowerCase();
    return searchParts.every(part => combinedText.includes(part));
  });

  if (loading) return <div className="p-10 text-center font-bold text-gray-400">Loading Price Data...</div>;

  return (
    <div className="p-3 md:p-6 max-w-full overflow-x-hidden pt-16 md:pt-6">
        <h1 className="text-xl md:text-2xl font-black text-gray-800 mb-6 tracking-tight">Price Trend Analysis</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* LEFT COLUMN: Product List */}
            <div className="bg-white p-4 rounded-3xl shadow-xl border border-gray-100 lg:col-span-1 h-[400px] lg:h-[85vh] flex flex-col">
                <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">Select Product</h2>
                <input 
                    type="text"
                    placeholder="🔍 Search all products..."
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-green-100 transition-all mb-4"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
                
                <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                    {filteredProducts.map(p => (
                        <div 
                            key={p.ProductCode}
                            onClick={() => handleProductSelect(p)}
                            className={`p-3 rounded-xl cursor-pointer border transition-all duration-200 group ${
                                selectedProduct?.ProductCode === p.ProductCode 
                                ? 'bg-green-50 border-green-500 ring-1 ring-green-500 shadow-sm' 
                                : 'bg-white border-gray-100 hover:border-green-200 hover:shadow-md'
                            }`}
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className={`font-bold text-xs uppercase leading-tight mb-1 ${selectedProduct?.ProductCode === p.ProductCode ? 'text-green-800' : 'text-gray-700'}`}>
                                        {p.ProductName}
                                    </div>
                                    <div className="text-[9px] text-gray-400 font-mono bg-gray-100 px-1.5 py-0.5 rounded w-fit">
                                        {p.ProductCode}
                                    </div>
                                </div>
                                {p.latestPurchase > 0 ? (
                                    <div className="text-[8px] font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded-lg whitespace-nowrap ml-2">
                                        {new Date(p.latestPurchase).toLocaleDateString('en-GB', {day:'2-digit', month:'short'})}
                                    </div>
                                ) : (
                                    <div className="text-[8px] font-bold text-gray-300 bg-gray-50 px-2 py-1 rounded-lg whitespace-nowrap ml-2">
                                        -
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {filteredProducts.length === 0 && (
                        <div className="text-center py-10 text-gray-400 text-sm italic">
                            No matching products found.
                        </div>
                    )}
                </div>
            </div>

            {/* RIGHT COLUMN: Stats & Charts */}
            <div className="lg:col-span-2 space-y-6 overflow-y-auto lg:h-[85vh] pr-1 custom-scrollbar">
                
                {selectedProduct ? (
                    <>
                        {/* Header Card */}
                        <div className="bg-white p-4 md:p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div>
                                <h2 className="text-xl md:text-2xl font-black text-gray-800 leading-none uppercase">{selectedProduct.ProductName}</h2>
                                <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-wide">Code: {selectedProduct.ProductCode}</p>
                            </div>
                            
                            {/* Date Range Selector */}
                            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 p-1 rounded-xl shadow-sm w-full md:w-auto">
                                <select 
                                    value={dateRange} 
                                    onChange={(e) => setDateRange(e.target.value)}
                                    className="bg-transparent text-xs font-bold text-gray-700 outline-none px-3 py-2 cursor-pointer w-full"
                                >
                                    <option value="1day">Last 24 Hours</option>
                                    <option value="3days">Last 3 Days</option>
                                    <option value="7days">Last 7 Days</option>
                                    <option value="1month">Last 1 Month</option>
                                    <option value="3months">Last 3 Months</option>
                                    <option value="1year">Last 1 Year</option>
                                    <option value="all">All Time</option>
                                </select>
                            </div>
                        </div>

                        {/* Stats Cards (Cost Based) */}
                        <div className="grid grid-cols-3 gap-3 md:gap-4">
                            <div className="bg-green-50 p-3 md:p-5 rounded-3xl border border-green-100 text-center shadow-sm">
                                <p className="text-[8px] md:text-[10px] font-black text-green-400 uppercase tracking-widest mb-1">Max Cost</p>
                                <p className="text-lg md:text-2xl font-black text-green-700">RM {Number(stats.maxSell).toFixed(2)}</p>
                            </div>
                            <div className="bg-blue-50 p-3 md:p-5 rounded-3xl border border-blue-100 text-center shadow-sm">
                                <p className="text-[8px] md:text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Avg Cost</p>
                                <p className="text-lg md:text-2xl font-black text-blue-700">RM {Number(stats.avgSell).toFixed(2)}</p>
                            </div>
                            <div className="bg-orange-50 p-3 md:p-5 rounded-3xl border border-orange-100 text-center shadow-sm">
                                <p className="text-[8px] md:text-[10px] font-black text-orange-400 uppercase tracking-widest mb-1">Min Cost</p>
                                <p className="text-lg md:text-2xl font-black text-orange-700">RM {Number(stats.minSell).toFixed(2)}</p>
                            </div>
                        </div>

                        {/* Chart Section */}
                        <div className="bg-white p-4 md:p-6 rounded-3xl shadow-lg border border-gray-100">
                            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-6">Price Volatility Chart</h3>
                            
                            <div className="h-[300px] w-full"> 
                                {chartData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                            <CartesianGrid stroke="#f3f4f6" strokeDasharray="3 3" vertical={false} />
                                            <XAxis 
                                                dataKey="date" 
                                                tick={{fontSize: 10, fill: '#9ca3af', fontWeight: 'bold'}} 
                                                axisLine={false} 
                                                tickLine={false} 
                                                dy={10}
                                                minTickGap={30}
                                            />
                                            <YAxis 
                                                tick={{fontSize: 10, fill: '#9ca3af', fontWeight: 'bold'}} 
                                                axisLine={false} 
                                                tickLine={false} 
                                                domain={['auto', 'auto']}
                                            />
                                            <Tooltip 
                                                contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', padding: '12px'}}
                                                labelStyle={{fontWeight: 'bold', color: '#1f2937', marginBottom: '8px', fontSize: '12px'}}
                                                itemStyle={{fontSize: '12px', fontWeight: '500'}}
                                            />
                                            <Legend wrapperStyle={{paddingTop: '20px', fontSize: '12px', fontWeight: 'bold'}} iconType="circle" />
                                            <Line 
                                                type="monotone" 
                                                dataKey="sellingPrice" 
                                                name={`Selling Price (${selectedProduct.SalesUOM || 'Unit'})`} 
                                                stroke="#10b981" 
                                                strokeWidth={3} 
                                                dot={{r: 0}} 
                                                activeDot={{r: 6, strokeWidth: 0}} 
                                                connectNulls 
                                            />
                                            <Line 
                                                type="monotone" 
                                                dataKey="costPrice" 
                                                name="Cost Price" 
                                                stroke="#ef4444" 
                                                strokeWidth={3} 
                                                dot={{r: 0}} 
                                                activeDot={{r: 6, strokeWidth: 0}} 
                                                connectNulls 
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-gray-300">
                                        <span className="text-4xl mb-3 opacity-50">📉</span>
                                        <p className="font-bold text-sm">No pricing data for this period</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* History Tables */}
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 pb-4">
                            {/* Purchases */}
                            <div className="bg-white rounded-3xl shadow-md border border-gray-100 overflow-hidden flex flex-col h-[350px]">
                                <div className="p-4 border-b border-red-50 bg-red-50/50">
                                    <h3 className="text-[10px] font-black text-red-600 uppercase tracking-wide">Latest Costs (Purchases)</h3>
                                </div>
                                <div className="overflow-y-auto flex-1 custom-scrollbar">
                                    <table className="w-full text-[10px] md:text-xs text-left">
                                        <thead className="sticky top-0 bg-white shadow-sm z-10 text-gray-400 font-bold">
                                            <tr>
                                                <th className="p-4">Date</th>
                                                <th className="p-4">Supplier</th>
                                                <th className="p-4 text-right">Cost</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {purchaseHistory.slice(0, 50).map((row, idx) => (
                                                <tr key={idx} className="hover:bg-red-50/30 transition-colors">
                                                    <td className="p-4 text-gray-500 font-mono">{row.Timestamp ? row.Timestamp.substring(0, 10) : '-'}</td>
                                                    <td className="p-4 font-bold text-gray-700 truncate max-w-[120px]" title={row.Supplier}>{row.Supplier}</td>
                                                    <td className="p-4 text-right font-black text-red-600">RM {Number(row.CostPrice).toFixed(2)}</td>
                                                </tr>
                                            ))}
                                            {purchaseHistory.length === 0 && (
                                                <tr><td colSpan="3" className="p-8 text-center text-gray-300 italic">No purchase history found.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Sales */}
                            <div className="bg-white rounded-3xl shadow-md border border-gray-100 overflow-hidden flex flex-col h-[350px]">
                                <div className="p-4 border-b border-green-50 bg-green-50/50">
                                    <h3 className="text-[10px] font-black text-green-600 uppercase tracking-wide">Latest Sales ({selectedProduct.SalesUOM || 'Unit'})</h3>
                                </div>
                                <div className="overflow-y-auto flex-1 custom-scrollbar">
                                    <table className="w-full text-[10px] md:text-xs text-left">
                                        <thead className="sticky top-0 bg-white shadow-sm z-10 text-gray-400 font-bold">
                                            <tr>
                                                <th className="p-4">Date</th>
                                                <th className="p-4">Customer</th>
                                                <th className="p-4 text-right">Price</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {salesHistory.slice(0, 50).map((row, idx) => (
                                                <tr key={idx} className="hover:bg-green-50/30 transition-colors">
                                                    <td className="p-4 text-gray-500 font-mono">{row["Delivery Date"]}</td>
                                                    <td className="p-4 font-bold text-gray-800 truncate max-w-[120px]" title={row["Customer Name"]}>{row["Customer Name"]}</td>
                                                    <td className="p-4 text-right font-black text-green-600">RM {Number(row.Price).toFixed(2)}</td>
                                                </tr>
                                            ))}
                                            {salesHistory.length === 0 && (
                                                <tr><td colSpan="3" className="p-8 text-center text-gray-300 italic">No sales history found.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="bg-white rounded-3xl shadow-xl border border-gray-100 flex flex-col items-center justify-center h-full text-gray-300 p-10 text-center min-h-[400px]">
                        <div className="bg-gray-50 p-8 rounded-full mb-6">
                            <span className="text-6xl grayscale opacity-50">📊</span>
                        </div>
                        <h3 className="text-xl font-bold text-gray-600 mb-2">No Product Selected</h3>
                        <p className="text-sm max-w-sm mx-auto">Select a product from the list on the left to view detailed price trends, cost analysis, and history.</p>
                    </div>
                )}

            </div>
        </div>
    </div>
  );
}