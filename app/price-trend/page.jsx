'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import Sidebar from '../components/Sidebar';
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
  const [dateRange, setDateRange] = useState('all'); 

  useEffect(() => {
    async function fetchProducts() {
      const { data } = await supabase
        .from('ProductMaster')
        .select('ProductCode, ProductName, Category, SalesUOM, BaseUOM')
        .order('ProductName');
      setProducts(data || []);
      setLoading(false);
    }
    fetchProducts();
  }, []);

  const handleProductSelect = async (product) => {
    setSelectedProduct(product);
    setChartData([]);
    setSalesHistory([]);
    setPurchaseHistory([]);
    await fetchData(product, dateRange);
  };

  useEffect(() => {
    if (selectedProduct) {
      fetchData(selectedProduct, dateRange);
    }
  }, [dateRange]); 

  const fetchData = async (product, range) => {
    let startDate = null;
    if (range !== 'all') {
      const d = new Date();
      d.setDate(d.getDate() - parseInt(range));
      startDate = d.toISOString().split('T')[0];
    } else if (range === '365') {
       const d = new Date(new Date().getFullYear(), 0, 1);
       startDate = d.toISOString().split('T')[0];
    }

    const targetUOM = product.SalesUOM || product.BaseUOM;

    // Sales Query
    let salesQuery = supabase
      .from('Orders')
      .select('"Delivery Date", Price, "Customer Name", UOM')
      .eq('Product Code', product.ProductCode)
      .eq('UOM', targetUOM)
      .not('Price', 'is', null)
      .order('Delivery Date', { ascending: true });
    
    if (startDate) salesQuery = salesQuery.gte('"Delivery Date"', startDate);
    const { data: salesData } = await salesQuery;

    // Cost Query
    let costQuery = supabase
      .from('Purchase') 
      .select('Timestamp, CostPrice, Supplier') 
      .eq('ProductCode', product.ProductCode)
      .order('Timestamp', { ascending: true });

    if (startDate) costQuery = costQuery.gte('Timestamp', startDate);
    const { data: costData } = await costQuery;

    setSalesHistory(salesData || []);
    setPurchaseHistory(costData || []);

    const combinedData = {};

    if (salesData) {
      salesData.forEach(row => {
        const date = row["Delivery Date"];
        if (!combinedData[date]) combinedData[date] = { date };
        combinedData[date].sellingPrice = Number(row.Price);
      });
    }

    if (costData) {
      costData.forEach(row => {
        const date = row.Timestamp ? row.Timestamp.substring(0, 10) : '';
        if (date) {
            if (!combinedData[date]) combinedData[date] = { date };
            const cost = parseFloat(row.CostPrice);
            if (cost > 0) combinedData[date].costPrice = cost;
        }
      });
    }

    const finalData = Object.values(combinedData).sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );

    setChartData(finalData);

    const prices = finalData.map(d => d.sellingPrice).filter(p => p);
    if (prices.length > 0) {
        setStats({
            maxSell: Math.max(...prices),
            minSell: Math.min(...prices),
            avgSell: (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2)
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

  if (loading) return <div className="flex h-screen items-center justify-center bg-gray-50 text-gray-500">Loading Price Data...</div>;

  return (
    <div className="flex bg-gray-50 min-h-screen font-sans text-gray-800">
      <Sidebar />
      <main className="ml-64 flex-1 p-8">
        
        {/* Header */}
        <div className="mb-8">
            <h1 className="text-3xl font-extrabold text-gray-800 tracking-tight">Price Trend Analysis</h1>
            <p className="text-sm text-gray-400 mt-1">Track product pricing and costs over time</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-[calc(100vh-140px)]">
            
            {/* LEFT COLUMN: Search & Select */}
            <div className="lg:col-span-4 bg-white rounded-3xl shadow-xl border border-gray-100 flex flex-col overflow-hidden">
                <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                    <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Product Selection</h2>
                    <div className="relative">
                        <input 
                            type="text"
                            placeholder="🔍 Search products..."
                            className="w-full p-3 pl-4 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 transition-shadow"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                    {filteredProducts.map(p => (
                        <div 
                            key={p.ProductCode}
                            onClick={() => handleProductSelect(p)}
                            className={`p-4 rounded-2xl cursor-pointer border transition-all duration-200 group ${
                                selectedProduct?.ProductCode === p.ProductCode 
                                ? 'bg-green-50 border-green-500 ring-1 ring-green-500 shadow-sm' 
                                : 'bg-white border-gray-100 hover:border-green-200 hover:bg-gray-50 hover:shadow-sm'
                            }`}
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className={`font-bold text-sm ${selectedProduct?.ProductCode === p.ProductCode ? 'text-green-800' : 'text-gray-700'}`}>
                                        {p.ProductName}
                                    </div>
                                    <div className="text-[10px] text-gray-400 font-mono mt-1">{p.ProductCode}</div>
                                </div>
                                <div className={`text-[10px] font-bold px-2 py-1 rounded-lg uppercase ${selectedProduct?.ProductCode === p.ProductCode ? 'bg-green-200 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                                    {p.SalesUOM || p.BaseUOM || 'KG'}
                                </div>
                            </div>
                        </div>
                    ))}
                    {filteredProducts.length === 0 && searchTerm && (
                        <div className="text-center py-10 text-gray-400 text-sm italic">No products found.</div>
                    )}
                    {!searchTerm && filteredProducts.length === 0 && (
                        <div className="text-center py-10 text-gray-400 text-sm">Loading products...</div>
                    )}
                </div>
            </div>

            {/* RIGHT COLUMN: Chart & Stats */}
            <div className="lg:col-span-8 flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2">
                
                {selectedProduct ? (
                    <>
                        {/* Header & Controls */}
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
                             <div>
                                 <h2 className="text-2xl font-black text-gray-800">{selectedProduct.ProductName}</h2>
                                 <p className="text-xs text-gray-400 font-mono mt-1">CODE: {selectedProduct.ProductCode}</p>
                             </div>
                             
                             <select 
                                value={dateRange}
                                onChange={(e) => setDateRange(e.target.value)}
                                className="mt-3 sm:mt-0 p-2 pr-8 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500 cursor-pointer"
                             >
                                 <option value="7">Last 7 Days</option>
                                 <option value="14">Last 14 Days</option>
                                 <option value="30">Last 30 Days</option>
                                 <option value="90">Last 3 Months</option>
                                 <option value="180">Last 6 Months</option>
                                 <option value="365">Year to Date</option>
                                 <option value="all">All Time</option>
                             </select>
                        </div>

                        {/* Summary Stats */}
                        <div className="grid grid-cols-3 gap-4">
                            <div className="bg-emerald-50 p-5 rounded-3xl border border-emerald-100 flex flex-col justify-center items-center shadow-sm">
                                <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1">Max Price</p>
                                <p className="text-2xl font-black text-emerald-700">RM {stats.maxSell.toFixed(2)}</p>
                            </div>
                            <div className="bg-blue-50 p-5 rounded-3xl border border-blue-100 flex flex-col justify-center items-center shadow-sm">
                                <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">Avg Price</p>
                                <p className="text-2xl font-black text-blue-700">RM {stats.avgSell}</p>
                            </div>
                            <div className="bg-orange-50 p-5 rounded-3xl border border-orange-100 flex flex-col justify-center items-center shadow-sm">
                                <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-1">Min Price</p>
                                <p className="text-2xl font-black text-orange-700">RM {stats.minSell.toFixed(2)}</p>
                            </div>
                        </div>

                        {/* CHART - Fixed Height Container */}
                        <div className="bg-white p-6 rounded-3xl shadow-lg border border-gray-100" style={{ height: '400px' }}>
                            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Price Volatility Chart</h3>
                            <div style={{ width: '100%', height: 'calc(100% - 30px)' }}>
                                {chartData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                                            <CartesianGrid stroke="#f3f4f6" strokeDasharray="3 3" vertical={false} />
                                            <XAxis 
                                                dataKey="date" 
                                                tick={{fontSize: 10, fill: '#9ca3af'}} 
                                                axisLine={false} 
                                                tickLine={false} 
                                                dy={10}
                                                minTickGap={30}
                                            />
                                            <YAxis 
                                                unit="" 
                                                tick={{fontSize: 10, fill: '#9ca3af'}} 
                                                axisLine={false} 
                                                tickLine={false} 
                                                dx={-10}
                                                domain={['auto', 'auto']}
                                            />
                                            <Tooltip 
                                                contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'}}
                                                labelStyle={{fontWeight: 'bold', color: '#374151', marginBottom: '5px'}}
                                            />
                                            <Legend wrapperStyle={{paddingTop: '20px'}} />
                                            <Line 
                                                type="monotone" 
                                                dataKey="sellingPrice" 
                                                name={`Selling Price (${selectedProduct.SalesUOM || 'Unit'})`} 
                                                stroke="#10b981" 
                                                strokeWidth={3}
                                                dot={{r: 0}}
                                                activeDot={{r: 6}}
                                                connectNulls
                                            />
                                            <Line 
                                                type="monotone" 
                                                dataKey="costPrice" 
                                                name="Cost Price" 
                                                stroke="#ef4444" 
                                                strokeWidth={3}
                                                dot={{r: 0}}
                                                activeDot={{r: 6}}
                                                connectNulls
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-gray-300">
                                        <span className="text-4xl mb-2">📉</span>
                                        <p>No pricing data available for this range.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* TRANSACTION TABLES */}
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 pb-6">
                            
                            {/* PURCHASES */}
                            <div className="bg-white rounded-3xl shadow-md border border-gray-100 overflow-hidden flex flex-col h-[400px]">
                                <div className="p-5 border-b border-red-50 bg-red-50/30">
                                    <h3 className="text-sm font-black text-red-600 uppercase tracking-wide">Latest Costs (Purchases)</h3>
                                </div>
                                <div className="overflow-y-auto flex-1 p-0 custom-scrollbar">
                                    <table className="w-full text-sm text-left">
                                        <thead className="sticky top-0 bg-white shadow-sm z-10 text-xs text-gray-400 uppercase">
                                            <tr>
                                                <th className="p-3 pl-5 font-bold">Date</th>
                                                <th className="p-3 font-bold">Supplier</th>
                                                <th className="p-3 pr-5 text-right font-bold">Cost</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {purchaseHistory.slice().reverse().slice(0, 50).map((row, idx) => {
                                                const cost = parseFloat(row.CostPrice) || 0;
                                                return (
                                                    <tr key={idx} className="hover:bg-red-50/50 transition-colors">
                                                        <td className="p-3 pl-5 text-gray-500 font-mono text-xs">{row.Timestamp ? row.Timestamp.substring(0, 10) : '-'}</td>
                                                        <td className="p-3 font-medium text-gray-700">{row.Supplier}</td>
                                                        <td className="p-3 pr-5 text-right font-bold text-red-600">RM {cost.toFixed(2)}</td>
                                                    </tr>
                                                );
                                            })}
                                            {purchaseHistory.length === 0 && (
                                                <tr><td colSpan="3" className="p-8 text-center text-gray-400 italic">No purchase records found.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* SALES */}
                            <div className="bg-white rounded-3xl shadow-md border border-gray-100 overflow-hidden flex flex-col h-[400px]">
                                <div className="p-5 border-b border-green-50 bg-green-50/30">
                                    <h3 className="text-sm font-black text-green-600 uppercase tracking-wide">Latest Sales ({selectedProduct.SalesUOM || 'Unit'})</h3>
                                </div>
                                <div className="overflow-y-auto flex-1 p-0 custom-scrollbar">
                                    <table className="w-full text-sm text-left">
                                        <thead className="sticky top-0 bg-white shadow-sm z-10 text-xs text-gray-400 uppercase">
                                            <tr>
                                                <th className="p-3 pl-5 font-bold">Date</th>
                                                <th className="p-3 font-bold">Customer</th>
                                                <th className="p-3 pr-5 text-right font-bold">Price</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {salesHistory.slice().reverse().slice(0, 50).map((row, idx) => (
                                                <tr key={idx} className="hover:bg-green-50/50 transition-colors">
                                                    <td className="p-3 pl-5 text-gray-500 font-mono text-xs">{row["Delivery Date"]}</td>
                                                    <td className="p-3 font-medium text-gray-700 truncate max-w-[150px]" title={row["Customer Name"]}>{row["Customer Name"]}</td>
                                                    <td className="p-3 pr-5 text-right font-bold text-green-600">RM {Number(row.Price).toFixed(2)}</td>
                                                </tr>
                                            ))}
                                            {salesHistory.length === 0 && (
                                                <tr><td colSpan="3" className="p-8 text-center text-gray-400 italic">No sales records found.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                        </div>
                    </>
                ) : (
                    <div className="bg-white rounded-3xl shadow-xl border border-gray-100 flex flex-col items-center justify-center h-full text-gray-400 p-10 text-center">
                        <div className="bg-gray-50 p-6 rounded-full mb-4">
                            <span className="text-5xl">📊</span>
                        </div>
                        <h3 className="text-lg font-bold text-gray-600">No Product Selected</h3>
                        <p className="text-sm max-w-xs mt-2">Select a product from the list on the left to analyze its price trends, sales history, and cost fluctuations.</p>
                    </div>
                )}

            </div>
        </div>
      </main>
    </div>
  );
}