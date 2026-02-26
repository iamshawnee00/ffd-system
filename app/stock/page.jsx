'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { 
    ExclamationTriangleIcon, 
    ArrowTrendingUpIcon,
    CheckCircleIcon,
    MagnifyingGlassIcon,
    ClipboardDocumentListIcon,
    PencilSquareIcon
} from '@heroicons/react/24/outline';

export default function StockBalancePage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('master'); // 'master' or 'log'
    const [currentUser, setCurrentUser] = useState('');

    // --- DATA STATES ---
    const [inventory, setInventory] = useState([]);
    
    // --- MASTER TAB STATES ---
    const [masterSearch, setMasterSearch] = useState('');

    // --- LOG INVENTORY STATES ---
    const [logDate, setLogDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [logSearch, setLogSearch] = useState('');
    const [logCart, setLogCart] = useState([]);
    const [productInputs, setProductInputs] = useState({});
    const [submittingLog, setSubmittingLog] = useState(false);

    // --- INITIAL DATA FETCH ---
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session) {
                router.push('/login');
            } else {
                const email = session.user.email || "";
                setCurrentUser(email.split('@')[0].toUpperCase());
            }
        });
        fetchInventoryData();
    }, [router]);

    const fetchInventoryData = async () => {
        setLoading(true);

        // Helper for local date string formatting (YYYY-MM-DD)
        const getLocalDateStr = (date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        // 1. Fetch Product Master (Golden Sheet) - Now includes SalesUOM
        const { data: prods } = await supabase
            .from('ProductMaster')
            .select('ProductCode, ProductName, Category, BaseUOM, SalesUOM, StockBalance, AllowedUOMs');

        // 2. Fetch Orders from the last 7 days UP TO tomorrow
        const today = new Date();
        
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(today.getDate() - 7);
        
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        const startStr = getLocalDateStr(sevenDaysAgo);
        const tomorrowStr = getLocalDateStr(tomorrow);

        const { data: orders } = await supabase
            .from('Orders')
            .select('"Product Code", Quantity, "Delivery Date"')
            .gte('"Delivery Date"', startStr)
            .lte('"Delivery Date"', tomorrowStr);

        // Aggregate 7-day usage & tomorrow's specific orders
        const usageMap = {};
        const tomorrowMap = {};
        
        if (orders) {
            orders.forEach(o => {
                const code = o["Product Code"];
                const qty = Number(o.Quantity || 0);
                const dDate = o["Delivery Date"];
                
                if (dDate === tomorrowStr) {
                    // This order is specifically for tomorrow
                    tomorrowMap[code] = (tomorrowMap[code] || 0) + qty;
                } else if (dDate >= startStr && dDate < tomorrowStr) {
                    // This order falls in the past 7 days up to today
                    usageMap[code] = (usageMap[code] || 0) + qty;
                }
            });
        }

        // 3. Process & Combine Data
        const enriched = (prods || []).map(p => {
            const past7 = usageMap[p.ProductCode] || 0;
            const avgDaily = past7 / 7;
            const actualTomorrow = tomorrowMap[p.ProductCode] || 0;
            
            // Needed Tomorrow = Max of (Predicted 1.5x buffer) OR (Actual Confirmed Orders for tomorrow)
            const predictedNeed = Math.max(Math.ceil(avgDaily * 1.5), actualTomorrow); 
            const currentStock = Number(p.StockBalance || 0);

            // Determine Status
            let status = 'Healthy';
            if (predictedNeed > 0 && currentStock <= predictedNeed) {
                status = 'Critical';
            } else if (currentStock < 20 && currentStock > 0) {
                status = 'Low';
            } else if (currentStock <= 0) {
                status = 'Out of Stock';
            }

            return {
                ...p,
                past7Days: past7.toFixed(1),
                avgDaily: avgDaily.toFixed(1),
                predictedNeed: predictedNeed,
                actualTomorrow: actualTomorrow, // Keep track if we need to show it
                status: status,
                displayUOM: p.SalesUOM || p.BaseUOM || 'KG' // Default to SalesUOM for Golden Display
            };
        });

        // 4. Sort: Critical/Out of Stock first, then Alphabetical
        enriched.sort((a, b) => {
            const getPriority = (s) => {
                if (s === 'Critical' || s === 'Out of Stock') return 1;
                if (s === 'Low') return 2;
                return 3;
            };
            
            const pA = getPriority(a.status);
            const pB = getPriority(b.status);
            
            if (pA !== pB) return pA - pB;
            return a.ProductName.localeCompare(b.ProductName);
        });

        setInventory(enriched);
        setLoading(false);
    };

    // --- LOG INVENTORY HANDLERS ---
    const handleLogProductChange = (code, field, value) => {
        setProductInputs(prev => ({
            ...prev,
            [code]: { ...prev[code], [field]: value }
        }));
    };

    const addToLogCart = (product) => {
        const inputs = productInputs[product.ProductCode] || {};
        const qty = parseFloat(inputs.qty);
        
        if (isNaN(qty) || qty < 0) return alert("Please enter a valid balance quantity.");

        const exists = logCart.find(item => item.ProductCode === product.ProductCode);
        if (exists) return alert("Item is already in the list to be updated.");

        const newItem = {
            ...product,
            cartId: `${product.ProductCode}-${Date.now()}`,
            qty: qty,
            uom: inputs.uom || product.BaseUOM
        };

        setLogCart([...logCart, newItem]);
        setProductInputs(prev => {
            const newState = { ...prev };
            delete newState[product.ProductCode];
            return newState;
        });
        // Deliberately NOT clearing logSearch here to allow continuous rapid entry
    };

    const removeFromLogCart = (cartId) => setLogCart(logCart.filter(item => item.cartId !== cartId));

    const handleSubmitLog = async () => {
        if (logCart.length === 0) return alert("No items to log.");
        setSubmittingLog(true);

        let successCount = 0;
        
        // Prepare rows for a StockAdjustments history table (if it exists, fails safely if not)
        const adjustmentRows = logCart.map(item => ({
            Timestamp: new Date(`${logDate}T12:00:00`),
            ProductCode: item.ProductCode,
            ProductName: item.ProductName,
            AdjustedQty: item.qty, // Treat as the "New Balance"
            UOM: item.uom,
            LoggedBy: currentUser
        }));

        try {
            // Log history 
            await supabase.from('StockAdjustments').insert(adjustmentRows);
        } catch (e) {
            console.log("StockAdjustments table logging skipped (table might not exist).", e);
        }

        // Update ProductMaster Golden Balances
        for (const item of logCart) {
            const { error } = await supabase
                .from('ProductMaster')
                .update({ StockBalance: item.qty, BaseUOM: item.uom })
                .eq('ProductCode', item.ProductCode);
            
            if (!error) successCount++;
        }

        alert(`Successfully updated golden balances for ${successCount} items.`);
        setLogCart([]);
        setLogSearch(''); // Clear search on final submit
        setSubmittingLog(false);
        fetchInventoryData(); // Refresh the master list
        setActiveTab('master'); // Send user back to master view
    };

    // --- HELPERS ---
    const getStatusStyle = (status) => {
        switch (status) {
            case 'Critical': return 'bg-red-100 text-red-700 border-red-200';
            case 'Out of Stock': return 'bg-gray-100 text-gray-500 border-gray-300';
            case 'Low': return 'bg-orange-100 text-orange-700 border-orange-200';
            default: return 'bg-green-100 text-green-700 border-green-200';
        }
    };

    // Fuzzy Search for Master Tab
    const filteredMaster = inventory.filter(p => {
        if (!masterSearch) return true;
        const terms = masterSearch.toLowerCase().split(' ').filter(t => t);
        const searchStr = `${p.ProductName || ''} ${p.ProductCode || ''}`.toLowerCase();
        return terms.every(term => searchStr.includes(term));
    });

    // Fuzzy Search for Log Tab
    const filteredLogProducts = inventory.filter(p => {
        if (!logSearch) return false;
        const terms = logSearch.toLowerCase().split(' ').filter(t => t);
        const searchStr = `${p.ProductName || ''} ${p.ProductCode || ''} ${p.Category || ''}`.toLowerCase();
        return terms.every(term => searchStr.includes(term));
    });

    const criticalCount = inventory.filter(i => i.status === 'Critical' || i.status === 'Out of Stock').length;
    const lowCount = inventory.filter(i => i.status === 'Low').length;
    const healthyCount = inventory.filter(i => i.status === 'Healthy').length;

    if (loading) return <div className="p-10 flex items-center justify-center h-screen text-gray-400 font-black tracking-widest animate-pulse">ANALYZING INVENTORY...</div>;

    return (
        <div className="p-3 md:p-8 max-w-full overflow-x-hidden min-h-screen bg-gray-50/50 pb-32">
            
            {/* Header */}
            <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-xl md:text-3xl font-black text-gray-800 tracking-tight">Stock Balance & FIFO</h1>
                    <p className="text-[10px] md:text-sm text-gray-400 font-bold uppercase mt-1">
                        Golden Sheet & Predictive Reordering
                    </p>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2 border-b border-gray-200">
                <button onClick={() => setActiveTab('master')} className={`px-6 py-3 rounded-t-2xl font-black text-sm transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === 'master' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-100'}`}>
                    <ClipboardDocumentListIcon className="w-5 h-5" /> Master Inventory
                </button>
                <button onClick={() => setActiveTab('log')} className={`px-6 py-3 rounded-t-2xl font-black text-sm transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === 'log' ? 'bg-orange-500 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-100'}`}>
                    <PencilSquareIcon className="w-5 h-5" /> Log Inventory
                </button>
            </div>

            {/* ==========================================
                TAB 1: MASTER INVENTORY
                ========================================== */}
            {activeTab === 'master' && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-in fade-in duration-300">
                
                {/* LEFT: Prediction Overview Cards */}
                <div className="lg:col-span-1 space-y-4">
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                        <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4">
                            <ArrowTrendingUpIcon className="w-6 h-6" />
                        </div>
                        <h2 className="text-xl font-black text-gray-800 uppercase leading-none">Smart Prediction</h2>
                        <p className="text-xs text-gray-500 font-medium mt-2">
                            The system analyzes the last 7 days of orders to calculate average usage. It predicts what you need for tomorrow (including confirmed tomorrow's orders + 50% safety buffer).
                        </p>
                    </div>

                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Auto-Sync Rules</h3>
                        <ul className="space-y-3 text-xs font-bold text-gray-700">
                            <li className="flex items-start gap-2">
                                <CheckCircleIcon className="w-4 h-4 text-green-500 shrink-0" />
                                <span>When placing orders, stock is automatically deducted.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <CheckCircleIcon className="w-4 h-4 text-green-500 shrink-0" />
                                <span>Low stock alerts appear dynamically in the cart.</span>
                            </li>
                            <li className="flex items-start gap-2 text-gray-400">
                                <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
                                <span>Note: Manual stock takes (Log Inventory tab) override these balances.</span>
                            </li>
                        </ul>
                    </div>

                    {/* Inventory Health Summary */}
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Inventory Health</h3>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center p-3 bg-red-50 rounded-xl border border-red-100 shadow-sm">
                                <span className="text-xs font-bold text-red-700">Critical / Out of Stock</span>
                                <span className="text-sm font-black text-red-700">{criticalCount}</span>
                            </div>
                            <div className="flex justify-between items-center p-3 bg-orange-50 rounded-xl border border-orange-100 shadow-sm">
                                <span className="text-xs font-bold text-orange-700">Low Stock</span>
                                <span className="text-sm font-black text-orange-700">{lowCount}</span>
                            </div>
                            <div className="flex justify-between items-center p-3 bg-green-50 rounded-xl border border-green-100 shadow-sm">
                                <span className="text-xs font-bold text-green-700">Healthy</span>
                                <span className="text-sm font-black text-green-700">{healthyCount}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT: Golden Sheet Table */}
                <div className="lg:col-span-3 bg-white p-4 md:p-6 rounded-3xl shadow-xl border border-gray-100 flex flex-col h-[calc(100vh-140px)]">
                    
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                        <h2 className="text-lg font-black text-gray-800 flex items-center gap-2 uppercase tracking-wide">
                            Master Inventory
                        </h2>
                        <div className="relative w-full sm:w-72">
                            <span className="absolute left-3.5 top-3.5 text-gray-400"><MagnifyingGlassIcon className="w-4 h-4" /></span>
                            <input 
                                type="text"
                                placeholder="Search inventory..."
                                className="w-full pl-10 p-2.5 border border-gray-200 rounded-xl text-sm font-bold bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                value={masterSearch}
                                onChange={e => setMasterSearch(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto custom-scrollbar border border-gray-100 rounded-2xl">
                        <table className="w-full text-left whitespace-nowrap min-w-[700px]">
                            <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest sticky top-0 z-10 border-b border-gray-100">
                                <tr>
                                    <th className="p-4 pl-6">Product</th>
                                    <th className="p-4 text-center">Past 7 Days</th>
                                    <th className="p-4 text-center">Needed Tomorrow</th>
                                    <th className="p-4 text-center">Status</th>
                                    <th className="p-4 text-right pr-6">Golden Balance</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 text-sm font-medium text-gray-700">
                                {filteredMaster.map(item => (
                                    <tr key={item.ProductCode} className="hover:bg-blue-50/30 transition-colors">
                                        <td className="p-4 pl-6">
                                            <div className="font-black text-gray-800 uppercase">{item.ProductName}</div>
                                            <div className="text-[10px] text-gray-400 font-mono mt-0.5">{item.ProductCode}</div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className="text-gray-500 font-bold">{item.past7Days} <span className="text-[9px] uppercase">{item.displayUOM}</span></span>
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className="bg-blue-50 text-blue-700 font-black px-2.5 py-1 rounded-lg border border-blue-100" title={`Actual Orders Tomorrow: ${item.actualTomorrow}`}>
                                                {item.predictedNeed} <span className="text-[9px] uppercase">{item.displayUOM}</span>
                                            </span>
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase border shadow-sm ${getStatusStyle(item.status)}`}>
                                                {item.status}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right pr-6">
                                            <span className="font-black text-gray-800 text-lg">{item.StockBalance}</span>
                                            <span className="text-xs font-bold text-gray-500 uppercase ml-1.5">{item.displayUOM}</span>
                                        </td>
                                    </tr>
                                ))}
                                {filteredMaster.length === 0 && (
                                    <tr>
                                        <td colSpan="5" className="p-12 text-center text-gray-400 font-bold italic">No products found matching your search.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            )}

            {/* ==========================================
                TAB 2: LOG INVENTORY
                ========================================== */}
            {activeTab === 'log' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100"> 
                        <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 border-b border-gray-50 pb-2">Record Actual Balances</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4"> 
                            <div className="col-span-1">
                                <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Date of Count</label>
                                <input 
                                    type="date" 
                                    className="w-full border border-gray-200 rounded-xl p-3 text-xs font-black bg-orange-50 text-orange-900 outline-none focus:ring-2 focus:ring-orange-500" 
                                    value={logDate} 
                                    onChange={e => setLogDate(e.target.value)} 
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="relative">
                            <input 
                                type="text" 
                                placeholder="Search catalog to log stock..." 
                                className="w-full pl-12 p-4 border border-gray-200 rounded-2xl shadow-sm focus:ring-2 focus:ring-orange-500 text-sm font-bold bg-white outline-none" 
                                value={logSearch} 
                                onChange={e => setLogSearch(e.target.value)} 
                            />
                            <span className="absolute left-4 top-4 text-gray-400 text-xl"><MagnifyingGlassIcon className="w-6 h-6" /></span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {filteredLogProducts.slice(0, 10).map(p => {
                                const inputs = productInputs[p.ProductCode] || {};
                                const availableUOMs = Array.from(new Set([
                                    p.BaseUOM, 
                                    ...(p.AllowedUOMs ? p.AllowedUOMs.split(',').map(u => u.trim().toUpperCase()).filter(Boolean) : [])
                                ]));

                                return (
                                    <div key={p.ProductCode} className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                                        <div className={`absolute top-0 right-0 px-3 py-1 rounded-bl-2xl text-[8px] font-black uppercase ${getStatusStyle(p.status)}`}>
                                            CURRENT: {p.StockBalance} {p.displayUOM}
                                        </div>
                                        <h3 className="font-black text-gray-800 text-sm uppercase leading-tight mb-3 pr-24">{p.ProductName}</h3>
                                        <div className="flex items-center gap-2">
                                            <input 
                                                type="number" 
                                                placeholder="New Bal" 
                                                className="flex-1 min-w-[80px] border border-gray-200 rounded-xl text-sm p-2.5 font-black text-center outline-none focus:ring-2 focus:ring-orange-500" 
                                                value={inputs.qty || ''} 
                                                onChange={(e) => handleLogProductChange(p.ProductCode, 'qty', e.target.value)} 
                                            />
                                            <select 
                                                className="bg-gray-50 border border-gray-200 rounded-xl text-xs p-3 font-black uppercase outline-none focus:ring-2 focus:ring-orange-500" 
                                                value={inputs.uom || p.displayUOM} 
                                                onChange={(e) => handleLogProductChange(p.ProductCode, 'uom', e.target.value)}
                                            >
                                                {availableUOMs.map(u => <option key={u} value={u}>{u}</option>)}
                                            </select>
                                            <button 
                                                onClick={() => addToLogCart(p)} 
                                                className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl w-12 h-11 flex items-center justify-center font-bold text-xl shadow-md transform transition active:scale-90"
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                            {logSearch && filteredLogProducts.length === 0 && (
                                <div className="col-span-full p-8 text-center text-gray-400 italic bg-white rounded-2xl border border-dashed border-gray-200">
                                    No products found matching "{logSearch}"
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-1">
                    <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-gray-100 sticky top-4 flex flex-col h-[calc(100vh-6rem)] min-h-[500px]">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-lg font-black text-gray-800 tracking-tight uppercase">Update List</h2>
                            <span className="bg-orange-100 text-orange-700 text-[10px] font-black px-3 py-1 rounded-full uppercase">{logCart.length} items</span>
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-3 mb-6 custom-scrollbar pr-1">
                            {logCart.length === 0 ? (
                                <div className="h-48 flex flex-col items-center justify-center text-gray-300 italic text-sm border-2 border-dashed border-gray-100 rounded-[2rem]">
                                    List is currently empty
                                </div>
                            ) : logCart.map((item) => (
                                <div key={item.cartId} className="p-4 rounded-2xl bg-gray-50/50 border border-gray-100 relative group hover:bg-white transition-all">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="pr-6">
                                            <div className="text-[11px] font-black uppercase text-gray-800 leading-tight">{item.ProductName}</div>
                                            <div className="text-[9px] text-gray-400 font-mono">{item.ProductCode}</div>
                                        </div>
                                        <button onClick={() => removeFromLogCart(item.cartId)} className="text-gray-300 hover:text-red-500 absolute top-3 right-3 p-1">✕</button>
                                    </div>
                                    <div className="flex items-center gap-2 mt-2">
                                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">New Balance:</span>
                                        <div className="text-sm font-black text-orange-700 bg-orange-50 px-2.5 py-1 rounded-lg border border-orange-200">
                                            {item.qty} <span className="text-[10px]">{item.uom}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-auto pt-6 border-t border-gray-100 space-y-4">
                            <div className="flex justify-between text-xs font-black text-gray-800 px-2 uppercase tracking-widest">
                                <span>Total Updates:</span><span>{logCart.length}</span>
                            </div>
                            <button 
                                onClick={handleSubmitLog} 
                                disabled={submittingLog || logCart.length === 0} 
                                className={`w-full py-4 rounded-2xl text-white font-black text-sm shadow-xl transition-all flex items-center justify-center gap-2 ${submittingLog || logCart.length === 0 ? 'bg-gray-300 cursor-not-allowed shadow-none' : 'bg-orange-500 hover:bg-orange-600 hover:shadow-orange-500/30 active:scale-95'}`}
                            >
                                {submittingLog ? 'UPDATING DB...' : 'UPDATE GOLDEN SHEET'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            )}
        </div>
    );
}