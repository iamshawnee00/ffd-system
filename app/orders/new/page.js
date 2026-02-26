'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { 
    PlusCircleIcon, 
    ClipboardDocumentListIcon, 
    PencilSquareIcon, 
    TrashIcon,
    ArrowPathIcon,
    PrinterIcon,
    TruckIcon,
    XMarkIcon,
    ExclamationTriangleIcon, 
    ArrowTrendingUpIcon,
    CheckCircleIcon,
    MagnifyingGlassIcon,
    ChartBarIcon,
    CubeIcon,
    XCircleIcon
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
    const [statusFilter, setStatusFilter] = useState(null); // NEW: Track active status filter

    // --- LOG INVENTORY STATES ---
    const [logDate, setLogDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [logSearch, setLogSearch] = useState('');
    const [logCart, setLogCart] = useState([]);
    const [productInputs, setProductInputs] = useState({});
    const [submittingLog, setSubmittingLog] = useState(false);

    // --- LEDGER / TREND STATES ---
    const [ledgerProduct, setLedgerProduct] = useState(null);
    const [ledgerTransactions, setLedgerTransactions] = useState([]);
    const [isLedgerLoading, setIsLedgerLoading] = useState(false);
    const [showResetModal, setShowResetModal] = useState(false);
    const [resetQuantity, setResetQuantity] = useState('');
    const [resetRemarks, setResetRemarks] = useState('Daily Golden Set Physical Count');

    // --- INITIAL DATA FETCH ---
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session) {
                router.push('/login');
            } else {
                const email = session.user?.email || "";
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

        // 1. Fetch Product Master (Golden Sheet) from Supabase
        const { data: prods, error: prodError } = await supabase
            .from('ProductMaster')
            .select('ProductCode, ProductName, Category, BaseUOM, SalesUOM, StockBalance, AllowedUOMs');
            
        if (prodError) console.error("Error fetching products:", prodError);

        // 2. Fetch Orders from the last 7 days UP TO tomorrow
        const today = new Date();
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(today.getDate() - 7);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        const startStr = getLocalDateStr(sevenDaysAgo);
        const tomorrowStr = getLocalDateStr(tomorrow);

        const { data: orders, error: orderError } = await supabase
            .from('Orders')
            .select('"Product Code", Quantity, "Delivery Date"')
            .gte('"Delivery Date"', startStr)
            .lte('"Delivery Date"', tomorrowStr);
            
        if (orderError) console.error("Error fetching orders:", orderError);

        // Aggregate 7-day usage & tomorrow's specific orders
        const usageMap = {};
        const tomorrowMap = {};
        
        if (orders) {
            orders.forEach(o => {
                const code = o["Product Code"];
                const qty = Number(o.Quantity || 0);
                const dDate = o["Delivery Date"];
                
                if (dDate === tomorrowStr) {
                    tomorrowMap[code] = (tomorrowMap[code] || 0) + qty;
                } else if (dDate >= startStr && dDate < tomorrowStr) {
                    usageMap[code] = (usageMap[code] || 0) + qty;
                }
            });
        }

        // 3. Process & Combine Data
        const enriched = (prods || []).map(p => {
            const past7 = usageMap[p.ProductCode] || 0;
            const avgDaily = past7 / 7;
            const actualTomorrow = tomorrowMap[p.ProductCode] || 0;
            
            const predictedNeed = Math.max(Math.ceil(avgDaily * 1.5), actualTomorrow); 
            const currentStock = Number(p.StockBalance || 0);

            let status = 'Healthy';
            if (predictedNeed > 0 && currentStock <= predictedNeed) {
                status = 'Critical';
            } else if (currentStock <= 0) {
                status = 'Out of Stock';
            } else if (currentStock < 20 && currentStock > 0) {
                status = 'Low';
            }

            return {
                ...p,
                past7Days: past7.toFixed(1),
                avgDaily: avgDaily.toFixed(1),
                predictedNeed: predictedNeed,
                actualTomorrow: actualTomorrow,
                status: status,
                displayUOM: p.SalesUOM || p.BaseUOM || 'KG'
            };
        });

        enriched.sort((a, b) => {
            const getPriority = (s) => {
                if (s === 'Out of Stock') return 1;
                if (s === 'Critical') return 2;
                if (s === 'Low') return 3;
                return 4;
            };
            const pA = getPriority(a.status);
            const pB = getPriority(b.status);
            if (pA !== pB) return pA - pB;
            
            // Safe localeCompare to prevent crashes on null ProductNames
            const nameA = a.ProductName || '';
            const nameB = b.ProductName || '';
            return nameA.localeCompare(nameB);
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
        const qty = parseFloat(inputs.qty); // Allows decimal weights
        
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
    };

    const removeFromLogCart = (cartId) => setLogCart(logCart.filter(item => item.cartId !== cartId));

    const handleSubmitLog = async () => {
        if (logCart.length === 0) return alert("No items to log.");
        setSubmittingLog(true);

        let successCount = 0;

        const adjustmentRows = logCart.map(item => ({
            Timestamp: new Date(`${logDate}T12:00:00`),
            ProductCode: item.ProductCode,
            ProductName: item.ProductName,
            AdjustedQty: item.qty,
            UOM: item.uom,
            LoggedBy: currentUser
        }));

        try {
            await supabase.from('StockAdjustments').insert(adjustmentRows);
        } catch (e) {
            console.log("StockAdjustments table logging skipped (table might not exist).", e);
        }

        for (const item of logCart) {
            const { error } = await supabase
                .from('ProductMaster')
                .update({ StockBalance: item.qty, BaseUOM: item.uom })
                .eq('ProductCode', item.ProductCode);
            
            if (!error) successCount++;
        }

        alert(`Successfully updated golden balances for ${successCount} items.`);
        setLogCart([]);
        setLogSearch('');
        setSubmittingLog(false);
        fetchInventoryData();
        setActiveTab('master');
    };

    // --- INDIVIDUAL LEDGER / FIFO HANDLERS ---
    const handleOpenLedger = async (product) => {
        setLedgerProduct(product);
        setIsLedgerLoading(true);
        setLedgerTransactions([]); // Clear previous to prevent flashing old data
        
        // Fetch real history from Supabase
        const { data: adjustments } = await supabase
            .from('StockAdjustments')
            .select('*')
            .eq('ProductCode', product.ProductCode)
            .order('Timestamp', { ascending: false })
            .limit(10);
            
        const { data: orders } = await supabase
            .from('Orders')
            .select('*')
            .eq('Product Code', product.ProductCode)
            .order('Delivery Date', { ascending: false })
            .limit(15);
            
        const history = [];
        let runningBalance = Number(product.StockBalance) || 0;
        
        // Combine real Adjustments & Orders into a visual ledger safely
        if (adjustments) {
            adjustments.forEach(a => {
                // Safely extract date
                const ts = a.Timestamp ? new Date(a.Timestamp) : new Date();
                const dateStr = !isNaN(ts) ? ts.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
                
                history.push({
                    id: `adj-${a.id || Math.random()}`,
                    date: dateStr,
                    type: 'RESET',
                    qtyIn: 0,
                    qtyOut: 0,
                    balance: a.AdjustedQty,
                    remarks: `Logged by ${a.LoggedBy || 'System'}`
                });
            });
        }
        
        if (orders) {
            orders.forEach(o => {
                history.push({
                    id: `ord-${o.id || Math.random()}`,
                    date: o["Delivery Date"] || new Date().toISOString().split('T')[0],
                    type: 'OUT',
                    qtyIn: 0,
                    qtyOut: Number(o.Quantity || 0),
                    balance: 0,
                    remarks: 'Sales Order'
                });
            });
        }

        // Sort descending to process backwards balances
        history.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        let currentCalcBalance = runningBalance;
        for (let i = 0; i < history.length; i++) {
            if (history[i].type === 'RESET') {
                currentCalcBalance = history[i].balance;
            } else {
                history[i].balance = currentCalcBalance;
                if (history[i].type === 'OUT') currentCalcBalance += history[i].qtyOut;
                if (history[i].type === 'IN') currentCalcBalance -= history[i].qtyIn;
            }
        }

        setLedgerTransactions(history.slice(0, 20));
        setIsLedgerLoading(false);
    };

    const handleSaveSingleReset = async () => {
        if (!resetQuantity || !ledgerProduct) return;
        
        const newBalance = parseFloat(resetQuantity); // Allow decimal inputs
        if (isNaN(newBalance)) return alert("Please enter a valid number");
        
        try {
            // Update the master sheet
            const { error: masterErr } = await supabase
                .from('ProductMaster')
                .update({ StockBalance: newBalance })
                .eq('ProductCode', ledgerProduct.ProductCode);
                
            if (masterErr) throw masterErr;

            // Insert into adjustments
            try {
                await supabase.from('StockAdjustments').insert([{
                    Timestamp: new Date(),
                    ProductCode: ledgerProduct.ProductCode,
                    ProductName: ledgerProduct.ProductName,
                    AdjustedQty: newBalance,
                    UOM: ledgerProduct.displayUOM,
                    LoggedBy: currentUser
                }]);
            } catch (e) { /* silent fail if no table */ }

            // Update local state for immediate feedback
            const newTx = {
                id: `tx-new-${Date.now()}`,
                date: new Date().toISOString().split('T')[0],
                type: 'RESET',
                qtyIn: 0,
                qtyOut: 0,
                balance: newBalance,
                remarks: resetRemarks
            };

            setLedgerTransactions([newTx, ...ledgerTransactions].sort((a, b) => new Date(b.date) - new Date(a.date)));
            setLedgerProduct({ ...ledgerProduct, StockBalance: newBalance });
            setShowResetModal(false);
            setResetQuantity('');
            fetchInventoryData(); // Refresh master data in background

        } catch (error) {
            alert('Error updating golden set balance.');
        }
    };

    // --- CHART GENERATION ---
    const chartData = useMemo(() => {
        const dailyMap = {};
        ledgerTransactions.forEach(t => { dailyMap[t.date] = t.balance; });
        return Object.keys(dailyMap).map(date => ({
            date: date.substring(5), // MM-DD
            balance: dailyMap[date]
        })).sort((a, b) => a.date.localeCompare(b.date));
    }, [ledgerTransactions]);

    const generateChartPath = () => {
        if (chartData.length < 2) return "";
        const width = 800;
        const height = 200;
        const padding = 40;
        const maxBalance = Math.max(...chartData.map(d => d.balance)) * 1.2 || 10; 
        const minBalance = 0; 

        const points = chartData.map((dataPoint, index) => {
            const x = padding + (index * ((width - padding * 2) / (Math.max(chartData.length - 1, 1))));
            const y = height - padding - ((dataPoint.balance - minBalance) / (maxBalance - minBalance)) * (height - padding * 2);
            return `${x},${y}`;
        });
        return `M ${points.join(' L ')}`;
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

    const handleStatusFilterToggle = (status) => {
        setStatusFilter(prev => prev === status ? null : status);
    };

    const filteredMaster = inventory.filter(p => {
        // First filter by exact status if a box was clicked
        if (statusFilter && p.status !== statusFilter) return false;

        // Then apply text search
        if (!masterSearch) return true;
        const terms = masterSearch.toLowerCase().split(' ').filter(t => t);
        const searchStr = `${p.ProductName || ''} ${p.ProductCode || ''}`.toLowerCase();
        return terms.every(term => searchStr.includes(term));
    });

    const filteredLogProducts = inventory.filter(p => {
        if (!logSearch) return false;
        const terms = logSearch.toLowerCase().split(' ').filter(t => t);
        const searchStr = `${p.ProductName || ''} ${p.ProductCode || ''} ${p.Category || ''}`.toLowerCase();
        return terms.every(term => searchStr.includes(term));
    });

    // 4 Box Health Calculations
    const oosCount = inventory.filter(i => i.status === 'Out of Stock').length;
    const criticalCount = inventory.filter(i => i.status === 'Critical').length;
    const lowCount = inventory.filter(i => i.status === 'Low').length;
    const healthyCount = inventory.filter(i => i.status === 'Healthy').length;

    if (loading) return <div className="p-10 flex items-center justify-center h-screen text-gray-400 font-black tracking-widest animate-pulse">ANALYZING INVENTORY...</div>;

    // ==========================================
    // RENDER
    // ==========================================
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
                    <PencilSquareIcon className="w-5 h-5" /> Log Inventory (Batch)
                </button>
            </div>

            {/* TAB 1: MASTER INVENTORY (SPLIT VIEW) */}
            {activeTab === 'master' && (
            <div className="animate-in fade-in duration-300">
                
                {/* 4 Box Inventory Health (INTERACTIVE FILTERS) */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
                    <div 
                        onClick={() => handleStatusFilterToggle('Out of Stock')}
                        className={`cursor-pointer transition-all duration-200 p-4 md:p-5 rounded-3xl border shadow-sm text-center ${statusFilter === 'Out of Stock' ? 'bg-gray-100 border-gray-400 ring-2 ring-gray-400 scale-105 shadow-md' : 'bg-gray-50 border-gray-200 hover:shadow-md hover:-translate-y-1'}`}
                    >
                        <div className="flex justify-center items-center gap-1.5 mb-1 text-gray-500">
                            <XCircleIcon className="w-4 h-4" />
                            <p className="text-[9px] md:text-[10px] uppercase font-black tracking-widest">Out of Stock</p>
                        </div>
                        <h3 className="text-2xl md:text-3xl font-black text-gray-700">{oosCount}</h3>
                    </div>

                    <div 
                        onClick={() => handleStatusFilterToggle('Critical')}
                        className={`cursor-pointer transition-all duration-200 p-4 md:p-5 rounded-3xl border shadow-sm text-center ${statusFilter === 'Critical' ? 'bg-red-100 border-red-400 ring-2 ring-red-400 scale-105 shadow-md' : 'bg-red-50 border-red-200 hover:shadow-md hover:-translate-y-1'}`}
                    >
                        <div className="flex justify-center items-center gap-1.5 mb-1 text-red-500">
                            <ExclamationTriangleIcon className="w-4 h-4" />
                            <p className="text-[9px] md:text-[10px] uppercase font-black tracking-widest">Critical</p>
                        </div>
                        <h3 className="text-2xl md:text-3xl font-black text-red-700">{criticalCount}</h3>
                    </div>

                    <div 
                        onClick={() => handleStatusFilterToggle('Low')}
                        className={`cursor-pointer transition-all duration-200 p-4 md:p-5 rounded-3xl border shadow-sm text-center ${statusFilter === 'Low' ? 'bg-orange-100 border-orange-400 ring-2 ring-orange-400 scale-105 shadow-md' : 'bg-orange-50 border-orange-200 hover:shadow-md hover:-translate-y-1'}`}
                    >
                        <div className="flex justify-center items-center gap-1.5 mb-1 text-orange-500">
                            <ArrowTrendingUpIcon className="w-4 h-4" />
                            <p className="text-[9px] md:text-[10px] uppercase font-black tracking-widest">Low Stock</p>
                        </div>
                        <h3 className="text-2xl md:text-3xl font-black text-orange-700">{lowCount}</h3>
                    </div>

                    <div 
                        onClick={() => handleStatusFilterToggle('Healthy')}
                        className={`cursor-pointer transition-all duration-200 p-4 md:p-5 rounded-3xl border shadow-sm text-center ${statusFilter === 'Healthy' ? 'bg-green-100 border-green-400 ring-2 ring-green-400 scale-105 shadow-md' : 'bg-green-50 border-green-200 hover:shadow-md hover:-translate-y-1'}`}
                    >
                        <div className="flex justify-center items-center gap-1.5 mb-1 text-green-600">
                            <CheckCircleIcon className="w-4 h-4" />
                            <p className="text-[9px] md:text-[10px] uppercase font-black tracking-widest">Healthy</p>
                        </div>
                        <h3 className="text-2xl md:text-3xl font-black text-green-700">{healthyCount}</h3>
                    </div>
                </div>

                {/* Main Split View */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    
                    {/* LEFT COLUMN: Product List */}
                    <div className="bg-white rounded-3xl shadow-xl border border-gray-100 flex flex-col h-[500px] lg:h-[calc(100vh-280px)] lg:col-span-1">
                        <div className="p-4 border-b border-gray-100 bg-gray-50/50 rounded-t-3xl">
                            <div className="relative w-full">
                                <span className="absolute left-3.5 top-3.5 text-gray-400"><MagnifyingGlassIcon className="w-4 h-4" /></span>
                                <input 
                                    type="text"
                                    placeholder="Search inventory..."
                                    className="w-full pl-10 p-2.5 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    value={masterSearch}
                                    onChange={e => setMasterSearch(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                            {filteredMaster.map(item => {
                                const isSelected = ledgerProduct?.ProductCode === item.ProductCode;
                                return (
                                    <div 
                                        key={item.ProductCode} 
                                        onClick={() => handleOpenLedger(item)}
                                        className={`p-3 rounded-2xl cursor-pointer border transition-all duration-200 group ${
                                            isSelected 
                                            ? 'bg-blue-50 border-blue-400 shadow-sm ring-1 ring-blue-400' 
                                            : 'bg-white border-gray-100 hover:border-blue-200 hover:shadow-sm'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="pr-2">
                                                <div className={`font-black text-xs uppercase leading-tight ${isSelected ? 'text-blue-900' : 'text-gray-800'}`}>
                                                    {item.ProductName}
                                                </div>
                                                <div className="text-[9px] text-gray-400 font-mono mt-0.5">{item.ProductCode}</div>
                                            </div>
                                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase shrink-0 border ${getStatusStyle(item.status)}`}>
                                                {item.status}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-end mt-1">
                                            <div className="text-[10px] text-gray-500 font-medium">
                                                <span className="block">Need Tmw: <strong className="text-blue-600 font-black">{item.predictedNeed}</strong> {item.displayUOM}</span>
                                                <span className="block mt-0.5">7 Days: <strong className="font-black">{item.past7Days}</strong> {item.displayUOM}</span>
                                            </div>
                                            <div className="text-right">
                                                <span className="block text-[8px] text-gray-400 uppercase font-bold tracking-widest">Balance</span>
                                                <span className="font-black text-gray-900 text-sm">{item.StockBalance} <span className="text-[9px] text-gray-500">{item.displayUOM}</span></span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {filteredMaster.length === 0 && (
                                <div className="p-8 text-center text-gray-400 font-bold italic text-xs">
                                    {statusFilter ? `No products found with status "${statusFilter}".` : "No products found."}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Ledger & Trend Details */}
                    <div className="bg-white rounded-3xl shadow-xl border border-gray-100 flex flex-col h-[600px] lg:h-[calc(100vh-280px)] overflow-y-auto custom-scrollbar lg:col-span-2">
                        {ledgerProduct ? (
                            <div className="p-4 md:p-6 space-y-6">
                                {/* Detail Header */}
                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-100 pb-4">
                                    <div>
                                        <h2 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight uppercase">{ledgerProduct.ProductName}</h2>
                                        <p className="text-[10px] text-gray-400 font-bold font-mono mt-1 uppercase">CODE: {ledgerProduct.ProductCode}</p>
                                    </div>
                                    <button 
                                        onClick={() => setShowResetModal(true)}
                                        className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl shadow-md font-bold transition-all flex items-center gap-2 active:scale-95 text-xs uppercase tracking-widest w-full md:w-auto justify-center"
                                    >
                                        <CheckCircleIcon className="w-4 h-4 stroke-2" />
                                        Perform Golden Set
                                    </button>
                                </div>

                                {isLedgerLoading ? (
                                    <div className="flex-1 flex items-center justify-center min-h-[300px] text-gray-400 font-black animate-pulse uppercase tracking-widest text-xs">
                                        Loading Ledger Data...
                                    </div>
                                ) : (
                                    <>
                                        {/* Summary Stats for Selected Product */}
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 flex items-center gap-3">
                                                <div className="p-2 bg-white text-blue-600 rounded-xl shadow-sm"><CubeIcon className="w-6 h-6" /></div>
                                                <div>
                                                    <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Current Balance</p>
                                                    <h3 className="text-xl font-black text-blue-900 leading-none mt-1">
                                                        {ledgerTransactions.length > 0 ? ledgerTransactions[0].balance : 0} <span className="text-[10px] font-bold text-blue-500">{ledgerProduct.displayUOM}</span>
                                                    </h3>
                                                </div>
                                            </div>
                                            <div className="bg-green-50 p-4 rounded-2xl border border-green-100 flex items-center gap-3">
                                                <div className="p-2 bg-white text-green-600 rounded-xl shadow-sm"><ArrowTrendingUpIcon className="w-6 h-6" /></div>
                                                <div>
                                                    <p className="text-[9px] font-black text-green-400 uppercase tracking-widest">Total Usage In</p>
                                                    <h3 className="text-xl font-black text-green-900 leading-none mt-1">
                                                        {ledgerTransactions.filter(t => t.type === 'IN').reduce((sum, t) => sum + t.qtyIn, 0)} <span className="text-[10px] font-bold text-green-500">{ledgerProduct.displayUOM}</span>
                                                    </h3>
                                                </div>
                                            </div>
                                            <div className="bg-purple-50 p-4 rounded-2xl border border-purple-100 flex items-center gap-3">
                                                <div className="p-2 bg-white text-purple-600 rounded-xl shadow-sm"><CheckCircleIcon className="w-6 h-6" /></div>
                                                <div>
                                                    <p className="text-[9px] font-black text-purple-400 uppercase tracking-widest">Last Golden Set</p>
                                                    <h3 className="text-sm font-black text-purple-900 leading-none mt-1">
                                                        {[...ledgerTransactions].find(t => t.type === 'RESET')?.date || 'N/A'}
                                                    </h3>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Chart */}
                                        <div className="bg-white p-4 rounded-2xl border border-gray-100">
                                            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Daily Closing Balance Trend</h3>
                                            <div className="w-full overflow-x-auto custom-scrollbar pb-2">
                                                <div style={{ minWidth: '500px', height: '160px' }}>
                                                    <svg viewBox="0 0 800 200" className="w-full h-full text-blue-500 overflow-visible">
                                                        <line x1="40" y1="20" x2="760" y2="20" stroke="#f3f4f6" strokeWidth="1" strokeDasharray="4 4"/>
                                                        <line x1="40" y1="90" x2="760" y2="90" stroke="#f3f4f6" strokeWidth="1" strokeDasharray="4 4"/>
                                                        <line x1="40" y1="160" x2="760" y2="160" stroke="#e5e7eb" strokeWidth="1"/>
                                                        
                                                        {chartData.length > 1 && (
                                                            <path d={generateChartPath()} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                                                        )}
                                                        
                                                        {chartData.map((dataPoint, index) => {
                                                            const width = 800; const height = 200; const padding = 40;
                                                            const maxBalance = Math.max(...chartData.map(d => d.balance)) * 1.2 || 10;
                                                            const x = padding + (index * ((width - padding * 2) / (Math.max(chartData.length - 1, 1))));
                                                            const y = height - padding - ((dataPoint.balance) / maxBalance) * (height - padding * 2);

                                                            return (
                                                                <g key={index}>
                                                                    <circle cx={x} cy={y} r="5" fill="white" stroke="currentColor" strokeWidth="2" />
                                                                    <text x={x} y={y - 12} fontSize="11" fill="#4b5563" textAnchor="middle" fontWeight="900">
                                                                        {dataPoint.balance}
                                                                    </text>
                                                                    <text x={x} y={height - 15} fontSize="10" fill="#9ca3af" textAnchor="middle" fontWeight="bold">
                                                                        {dataPoint.date}
                                                                    </text>
                                                                </g>
                                                            );
                                                        })}
                                                    </svg>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Table */}
                                        <div className="border border-gray-100 rounded-2xl overflow-hidden">
                                            <div className="bg-gray-50 p-3 border-b border-gray-100">
                                                <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">FIFO Ledger</h3>
                                            </div>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-left">
                                                    <thead className="bg-white text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                                                        <tr>
                                                            <th className="p-3 pl-4">Date</th>
                                                            <th className="p-3">Type</th>
                                                            <th className="p-3 text-center">In</th>
                                                            <th className="p-3 text-center">Out</th>
                                                            <th className="p-3 text-center text-blue-600">Bal</th>
                                                            <th className="p-3 pr-4">Remarks</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-50 text-xs font-medium text-gray-700">
                                                        {ledgerTransactions.map((tx) => (
                                                            <tr key={tx.id} className="hover:bg-gray-50/50">
                                                                <td className="p-3 pl-4 font-mono text-[10px] text-gray-500">{tx.date}</td>
                                                                <td className="p-3">
                                                                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border tracking-widest ${
                                                                        tx.type === 'IN' ? 'bg-green-50 text-green-700 border-green-200' :
                                                                        tx.type === 'OUT' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                                                        'bg-blue-50 text-blue-700 border-blue-200'
                                                                    }`}>
                                                                        {tx.type}
                                                                    </span>
                                                                </td>
                                                                <td className="p-3 text-center text-green-600 font-bold">{tx.qtyIn > 0 ? `+${tx.qtyIn}` : '-'}</td>
                                                                <td className="p-3 text-center text-orange-500 font-bold">{tx.qtyOut > 0 ? `-${tx.qtyOut}` : '-'}</td>
                                                                <td className="p-3 text-center font-black text-gray-900">{tx.balance}</td>
                                                                <td className="p-3 pr-4 text-[10px] text-gray-500 truncate max-w-[150px]">{tx.remarks}</td>
                                                            </tr>
                                                        ))}
                                                        {ledgerTransactions.length === 0 && (
                                                            <tr>
                                                                <td colSpan="6" className="p-6 text-center text-gray-400 italic text-xs">No ledger history available.</td>
                                                            </tr>
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-gray-300 p-8 text-center min-h-[400px]">
                                <div className="bg-gray-50 p-6 rounded-full mb-4">
                                    <ChartBarIcon className="w-12 h-12 text-gray-300" />
                                </div>
                                <h3 className="text-lg font-black text-gray-500 uppercase tracking-widest mb-2">No Product Selected</h3>
                                <p className="text-xs max-w-xs mx-auto font-medium">Select a product from the master inventory list on the left to view its detailed ledger, trend chart, and perform physical counts.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            )}

            {/* TAB 2: LOG INVENTORY (Batch Update) */}
            {activeTab === 'log' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100"> 
                        <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 border-b border-gray-50 pb-2">Record Actual Balances (Batch)</h2>
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
                                                step="0.1"
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
                                        <button onClick={() => removeFromLogCart(item.cartId)} className="text-gray-300 hover:text-red-500 absolute top-3 right-3 p-1">
                                            <XMarkIcon className="w-5 h-5" />
                                        </button>
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

            {/* ROOT LEVEL GOLDEN SET MODAL */}
            {showResetModal && ledgerProduct && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100">
                        <div className="p-6 md:p-8 border-b border-gray-100 bg-gray-50/50">
                            <h3 className="text-xl font-black text-gray-900 flex items-center gap-2 uppercase tracking-tight">
                                <CheckCircleIcon className="w-7 h-7 text-blue-600" />
                                Perform Golden Set
                            </h3>
                            <p className="text-[10px] font-bold text-gray-400 mt-2 uppercase tracking-widest leading-relaxed">
                                Reset balance to match your physical count for <br/>
                                <span className="text-blue-600 text-xs">{ledgerProduct.ProductName}</span>
                            </p>
                        </div>
                        
                        <div className="p-6 md:p-8 space-y-6">
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Physical Count ({ledgerProduct.displayUOM})</label>
                                <input 
                                    type="number" 
                                    step="0.1"
                                    value={resetQuantity}
                                    onChange={(e) => setResetQuantity(e.target.value)}
                                    className="w-full p-4 border-2 border-gray-100 rounded-2xl focus:border-blue-500 outline-none text-xl font-black text-gray-800 transition-colors shadow-inner"
                                    placeholder={`e.g. ${ledgerProduct.StockBalance || '0'}`}
                                    autoFocus
                                />
                            </div>
                            
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Remarks</label>
                                <input 
                                    type="text" 
                                    value={resetRemarks}
                                    onChange={(e) => setResetRemarks(e.target.value)}
                                    className="w-full p-4 border-2 border-gray-100 rounded-2xl focus:border-blue-500 outline-none text-sm font-bold text-gray-700 transition-colors shadow-inner"
                                />
                            </div>
                        </div>

                        <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
                            <button 
                                onClick={() => setShowResetModal(false)}
                                className="px-6 py-4 text-[10px] font-black text-gray-500 hover:bg-gray-200 rounded-2xl transition-colors uppercase tracking-widest"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleSaveSingleReset}
                                disabled={!resetQuantity}
                                className="px-8 py-4 text-[10px] font-black text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 rounded-2xl shadow-xl transition-all uppercase tracking-widest active:scale-95"
                            >
                                Save Golden Set
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}