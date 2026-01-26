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

  // 1. Fetch Product List on Load
  useEffect(() => {
    async function fetchProducts() {
      // Fetch SalesUOM and BaseUOM to filter correctly
      const { data } = await supabase
        .from('ProductMaster')
        .select('ProductCode, ProductName, Category, SalesUOM, BaseUOM')
        .order('ProductName');
      setProducts(data || []);
      setLoading(false);
    }
    fetchProducts();
  }, []);

  // 2. Fetch History when a Product is clicked
  const handleProductSelect = async (product) => {
    setSelectedProduct(product);
    setChartData([]);
    setSalesHistory([]);
    setPurchaseHistory([]);

    // Determine the UOM to filter by (SalesUOM > BaseUOM > 'KG')
    const targetUOM = product.SalesUOM || product.BaseUOM;

    // A. Fetch Sales History (Orders) - Filtered by UOM
    const { data: salesData, error: salesError } = await supabase
      .from('Orders')
      .select('"Delivery Date", Price, "Customer Name", UOM')
      .eq('Product Code', product.ProductCode)
      .eq('UOM', targetUOM) // <--- Only show prices for the specific Sales UOM
      .not('Price', 'is', null) 
      .order('Delivery Date', { ascending: true });

    if (salesError) console.error("Sales Fetch Error:", salesError);

    // B. Fetch Cost History (Purchase) - Using 'Purchase' table and ONLY CostPrice
    const { data: costData, error: costError } = await supabase
      .from('Purchase') 
      .select('Timestamp, CostPrice, Supplier') 
      .eq('ProductCode', product.ProductCode)
      .order('Timestamp', { ascending: true });

    if (costError) {
        console.error("Purchases Fetch Error:", costError);
    } else if (!costData || costData.length === 0) {
        console.warn("Purchases: No data found for code", product.ProductCode);
    }

    // Save Raw History for Tables
    setSalesHistory(salesData || []);
    setPurchaseHistory(costData || []);

    // C. Merge Data for Charting
    const combinedData = {};

    // Process Sales
    if (salesData) {
      salesData.forEach(row => {
        const date = row["Delivery Date"];
        if (!combinedData[date]) combinedData[date] = { date };
        combinedData[date].sellingPrice = Number(row.Price);
      });
    }

    // Process Costs
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

    // Convert Object to Array and Sort by Date
    const finalData = Object.values(combinedData).sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );

    setChartData(finalData);

    // Calculate basic stats based on the filtered UOM
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

  // FUZZY SEARCH LOGIC
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

  if (loading) return <div className="p-10 ml-64">Loading...</div>;

  return (
    <div className="flex bg-gray-50 min-h-screen">
      <Sidebar />
      <main className="ml-64 flex-1 p-8">
        <h1 className="text-3xl font-bold mb-6 text-gray-800">Price Trend Analysis</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* LEFT COLUMN: Search & Select */}
            <div className="bg-white p-6 rounded shadow lg:col-span-1 h-[85vh] flex flex-col">
                <h2 className="font-bold text-gray-700 mb-4">1. Select Product</h2>
                <input 
                    type="text"
                    placeholder="Search product..."
                    className="w-full border p-3 rounded mb-4"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
                
                <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                    {filteredProducts.map(p => (
                        <div 
                            key={p.ProductCode}
                            onClick={() => handleProductSelect(p)}
                            className={`p-3 rounded cursor-pointer border transition-colors ${
                                selectedProduct?.ProductCode === p.ProductCode 
                                ? 'bg-blue-100 border-blue-500' 
                                : 'bg-gray-50 border-gray-100 hover:bg-gray-100'
                            }`}
                        >
                            <div className="font-bold text-gray-800">{p.ProductName}</div>
                            <div className="text-xs text-gray-500">{p.ProductCode}</div>
                            <div className="text-xs text-gray-400 mt-1">
                                Sales UOM: {p.SalesUOM || p.BaseUOM || 'KG'}
                            </div>
                        </div>
                    ))}
                    {filteredProducts.length === 0 && searchTerm && (
                        <p className="text-gray-400 text-center text-sm">No match found.</p>
                    )}
                    {!searchTerm && (
                        <p className="text-gray-400 text-center text-sm mt-10">
                            Type to search for a product...
                        </p>
                    )}
                </div>
            </div>

            {/* RIGHT COLUMN: Chart & Stats */}
            <div className="lg:col-span-2 space-y-6 overflow-y-auto h-[85vh] pr-2">
                
                {selectedProduct ? (
                    <>
                        {/* Summary Cards */}
                        <div className="grid grid-cols-3 gap-4">
                            <div className="bg-white p-4 rounded shadow border-t-4 border-green-500">
                                <p className="text-xs text-gray-500 uppercase">Max Selling Price ({selectedProduct.SalesUOM || selectedProduct.BaseUOM})</p>
                                <p className="text-xl font-bold">RM {stats.maxSell}</p>
                            </div>
                            <div className="bg-white p-4 rounded shadow border-t-4 border-yellow-500">
                                <p className="text-xs text-gray-500 uppercase">Avg Selling Price ({selectedProduct.SalesUOM || selectedProduct.BaseUOM})</p>
                                <p className="text-xl font-bold">RM {stats.avgSell}</p>
                            </div>
                            <div className="bg-white p-4 rounded shadow border-t-4 border-red-500">
                                <p className="text-xs text-gray-500 uppercase">Min Selling Price ({selectedProduct.SalesUOM || selectedProduct.BaseUOM})</p>
                                <p className="text-xl font-bold">RM {stats.minSell}</p>
                            </div>
                        </div>

                        {/* CHART */}
                        <div className="bg-white p-6 rounded shadow h-[400px]">
                            <h3 className="font-bold text-gray-700 mb-2">
                                Price History: {selectedProduct.ProductName}
                            </h3>
                            {chartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                                        <CartesianGrid stroke="#f5f5f5" />
                                        <XAxis dataKey="date" tick={{fontSize: 12}} />
                                        <YAxis unit=" RM" />
                                        <Tooltip />
                                        <Legend />
                                        <Line 
                                            type="monotone" 
                                            dataKey="sellingPrice" 
                                            name={`Selling Price (${selectedProduct.SalesUOM || 'Unit'})`} 
                                            stroke="#10b981" 
                                            strokeWidth={2}
                                            connectNulls
                                            dot={false}
                                        />
                                        <Line 
                                            type="monotone" 
                                            dataKey="costPrice" 
                                            name="Cost Price" 
                                            stroke="#ef4444" 
                                            strokeWidth={2}
                                            connectNulls
                                            dot={false}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex items-center justify-center text-gray-400">
                                    No historical data found for this product.
                                </div>
                            )}
                        </div>

                        {/* TRANSACTION TABLES */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            
                            {/* PURCHASES TABLE (COST) */}
                            <div className="bg-white p-6 rounded shadow">
                                <h3 className="font-bold text-gray-700 mb-4 border-b pb-2 text-red-600">
                                    Latest Purchases (Cost)
                                </h3>
                                <div className="overflow-x-auto max-h-[300px]">
                                    <table className="w-full text-sm text-left">
                                        <thead className="sticky top-0 bg-red-50 text-red-800">
                                            <tr>
                                                <th className="p-2">Date</th>
                                                <th className="p-2">Supplier</th>
                                                <th className="p-2 text-right">Cost (RM)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {purchaseHistory.slice().reverse().slice(0, 50).map((row, idx) => {
                                                // UPDATED: Only use CostPrice
                                                const cost = parseFloat(row.CostPrice) || 0;

                                                return (
                                                    <tr key={idx} className="border-b hover:bg-gray-50">
                                                        <td className="p-2">{row.Timestamp ? row.Timestamp.substring(0, 10) : '-'}</td>
                                                        <td className="p-2 font-medium">{row.Supplier}</td>
                                                        <td className="p-2 text-right">{cost.toFixed(2)}</td>
                                                    </tr>
                                                );
                                            })}
                                            {purchaseHistory.length === 0 && (
                                                <tr><td colSpan="3" className="p-4 text-center text-gray-400">No records found.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* SALES TABLE (SELLING PRICE) */}
                            <div className="bg-white p-6 rounded shadow">
                                <h3 className="font-bold text-gray-700 mb-4 border-b pb-2 text-green-600">
                                    Latest Sales ({selectedProduct.SalesUOM || 'Unit'})
                                </h3>
                                <div className="overflow-x-auto max-h-[300px]">
                                    <table className="w-full text-sm text-left">
                                        <thead className="sticky top-0 bg-green-50 text-green-800">
                                            <tr>
                                                <th className="p-2">Date</th>
                                                <th className="p-2">Customer</th>
                                                <th className="p-2 text-right">Price (RM)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {salesHistory.slice().reverse().slice(0, 50).map((row, idx) => (
                                                <tr key={idx} className="border-b hover:bg-gray-50">
                                                    <td className="p-2">{row["Delivery Date"]}</td>
                                                    <td className="p-2 font-medium">{row["Customer Name"]}</td>
                                                    <td className="p-2 text-right">{row.Price}</td>
                                                </tr>
                                            ))}
                                            {salesHistory.length === 0 && (
                                                <tr><td colSpan="3" className="p-4 text-center text-gray-400">No records found.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                        </div>
                    </>
                ) : (
                    <div className="bg-white p-10 rounded shadow flex flex-col items-center justify-center h-64 text-gray-400">
                        <span className="text-4xl mb-4">📈</span>
                        <p>Select a product from the left to view its price trend.</p>
                    </div>
                )}

            </div>
        </div>
      </main>
    </div>
  );
}