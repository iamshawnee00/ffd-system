'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';
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
    XCircleIcon,
    ClockIcon,
    CheckIcon
} from '@heroicons/react/24/outline';

export default function StockBalancePage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('master'); // 'master' or 'log'
    const [currentUser, setCurrentUser] = useState('');

    // --- DATA STATES ---
    const [inventory, setInventory] = useState([]);
    const [deliveryStats, setDeliveryStats] = useState({ pending: 0, transit: 0, delivered: 0 });
    
    // --- MASTER TAB STATES ---
    const [masterSearch, setMasterSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState(null); 

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
        fetchDeliveryStats();
    }, [router]);

    // Format display status for consistent logic across pages
    const formatDisplayStatus = (rawStatus) => {
        if (!rawStatus) return 'PENDING';
        const s = String(rawStatus).toUpperCase().trim().replace(/_/g, ' ');
        if (s.includes('DELIVERED') || s.includes('COMPLETED') || s.includes('DEPOSITED')) return 'DELIVERED';
        if (s.includes('TRANSIT') || s.includes('STARTED') || s.includes('PICKED') || s.includes('WAY')) return 'IN TRANSIT';
        if (s.includes('ASSIGNED') || s.includes('ACCEPTED')) return 'ASSIGNED';
        return 'PENDING';
    };

    const fetchDeliveryStats = async () => {
        const today = new Date().toISOString().split('T')[0];
        const { data } = await supabase
            .from('Orders')
            .select('Status, status, delivery_status')
            .eq('"Delivery Date"', today);

        if (data) {
            const counts = { pending: 0, transit: 0, delivered: 0 };
            data.forEach(order => {
                const raw = order.Status || order.status || order.delivery_status;
                const mapped = formatDisplayStatus(raw);
                if (mapped === 'DELIVERED') counts.delivered++;
                else if (mapped === 'IN TRANSIT') counts.transit++;
                else counts.pending++;
            });
            setDeliveryStats(counts);
        }
    };

    const fetchInventoryData = async () => {
        setLoading(true);

        const getLocalDateStr = (date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        const { data: prods, error: prodError } = await supabase
            .from('ProductMaster')
            .select('ProductCode, ProductName, Category, BaseUOM, SalesUOM, StockBalance, AllowedUOMs');
            
        if (prodError) console.error("Error fetching products:", prodError);

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

        const enriched = (prods || []).map(p => {
            const past7 = usageMap[p.ProductCode] || 0;
            const avgDaily = past7 / 7;
            const actualTomorrow = tomorrowMap[p.ProductCode] || 0;
            
            const predictedNeed = Math.max(Math.ceil(avgDaily * 1.5), actualTomorrow); 
            const currentStock = Number(p.StockBalance || 0);

            let status = 'Healthy';
            if (predictedNeed > 0 && currentStock <= predictedNeed) status = 'Critical';
            else if (currentStock <= 0) status = 'Out of Stock';
            else if (currentStock < 20 && currentStock > 0) status = 'Low';

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
            return (a.ProductName || '').localeCompare(b.ProductName || '');
        });

        setInventory(enriched);
        setLoading(false);
    };

    // --- LOG INVENTORY HANDLERS ---
    const handleLogProductChange = (code, field, value) => {
        setProductInputs(prev => ({ ...prev, [code]: { ...prev[code], [field]: value } }));
    };

    const addToLogCart = (product) => {
        const inputs = productInputs[product.ProductCode] || {};
        const qty = parseFloat(inputs.qty);
        if (isNaN(qty) || qty < 0) return alert("Please enter valid quantity.");
        if (logCart.find(item => item.ProductCode === product.ProductCode)) return alert("Already in list.");
        setLogCart([...logCart, { ...product, cartId: `${product.ProductCode}-${Date.now()}`, qty, uom: inputs.uom || product.BaseUOM }]);
        setProductInputs(prev => { const n = { ...prev }; delete n[product.ProductCode]; return n; });
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

        try { await supabase.from('StockAdjustments').insert(adjustmentRows); } catch (e) {}

        for (const item of logCart) {
            const { error } = await supabase.from('ProductMaster').update({ StockBalance: item.qty, BaseUOM: item.uom }).eq('ProductCode', item.ProductCode);
            if (!error) successCount++;
        }

        alert(`Updated ${successCount} items.`);
        setLogCart([]); fetchInventoryData(); setActiveTab('master'); setSubmittingLog(false);
    };

    // --- DRILL-DOWN LEDGER ---
    const handleOpenLedger = async (product) => {
        setLedgerProduct(product);
        setIsLedgerLoading(true);
        
        const [adjRes, ordRes] = await Promise.all([
            supabase.from('StockAdjustments').select('*').eq('ProductCode', product.ProductCode).order('Timestamp', { ascending: false }).limit(10),
            supabase.from('Orders').select('*').eq('Product Code', product.ProductCode).order('Delivery Date', { ascending: false }).limit(15)
        ]);
            
        const history = [];
        if (adjRes.data) {
            adjRes.data.forEach(a => {
                const ts = a.Timestamp ? new Date(a.Timestamp) : new Date();
                history.push({ id: `adj-${a.id || Math.random()}`, date: ts.toISOString().split('T')[0], type: 'RESET', qtyIn: 0, qtyOut: 0, balance: a.AdjustedQty, remarks: `Logged by ${a.LoggedBy || 'System'}` });
            });
        }
        if (ordRes.data) {
            ordRes.data.forEach(o => {
                history.push({ id: `ord-${o.id || Math.random()}`, date: o["Delivery Date"] || new Date().toISOString().split('T')[0], type: 'OUT', qtyIn: 0, qtyOut: Number(o.Quantity || 0), balance: 0, remarks: 'Sales Order' });
            });
        }
        history.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        let currentCalcBalance = Number(product.StockBalance) || 0;
        for (let i = 0; i < history.length; i++) {
            if (history[i].type === 'RESET') currentCalcBalance = history[i].balance;
            else {
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
        const newBalance = parseFloat(resetQuantity);
        try {
            await supabase.from('ProductMaster').update({ StockBalance: newBalance }).eq('ProductCode', ledgerProduct.ProductCode);
            try {
                await supabase.from('StockAdjustments').insert([{ Timestamp: new Date(), ProductCode: ledgerProduct.ProductCode, ProductName: ledgerProduct.ProductName, AdjustedQty: newBalance, UOM: ledgerProduct.displayUOM, LoggedBy: currentUser }]);
            } catch (e) {}
            setLedgerProduct({ ...ledgerProduct, StockBalance: newBalance });
            setShowResetModal(false);
            fetchInventoryData();
        } catch (error) { alert('Error updating.'); }
    };

    const chartData = useMemo(() => {
        const dailyMap = {};
        ledgerTransactions.forEach(t => { 
            if (t.date) dailyMap[t.date] = Number(t.balance) || 0; 
        });
        return Object.keys(dailyMap).map(date => ({ date: date.substring(5), balance: dailyMap[date] })).sort((a, b) => a.date.localeCompare(b.date));
    }, [ledgerTransactions]);

    const generateChartPath = () => {
        if (chartData.length < 2) return "";
        const width = 800; const height = 200; const padding = 40;
        const maxBalance = Math.max(...chartData.map(d => Number(d.balance) || 0), 0) * 1.2 || 10; 
        const points = chartData.map((dataPoint, index) => {
            const x = padding + (index * ((width - padding * 2) / (Math.max(chartData.length - 1, 1))));
            const y = height - padding - ((Number(dataPoint.balance) || 0) / maxBalance) * (height - padding * 2);
            return `${x},${y}`;
        });
        return `M ${points.join(' L ')}`;
    };

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
        if (statusFilter && p.status !== statusFilter) return false;
        if (!masterSearch) return true;
        const searchStr = `${p.ProductName || ''} ${p.ProductCode || ''}`.toLowerCase();
        return masterSearch.toLowerCase().split(' ').every(term => searchStr.includes(term));
    });

    const filteredLogProducts = inventory.filter(p => {
        if (!logSearch) return false;
        const searchStr = `${p.ProductName || ''} ${p.ProductCode || ''} ${p.Category || ''}`.toLowerCase();
        return logSearch.toLowerCase().split(' ').every(term => searchStr.includes(term));
    });

    // 4 Box Health Calculations
    const oosCount = inventory.filter(i => i.status === 'Out of Stock').length;
    const criticalCount = inventory.filter(i => i.status === 'Critical').length;
    const lowCount = inventory.filter(i => i.status === 'Low').length;
    const healthyCount = inventory.filter(i => i.status === 'Healthy').length;

    if (loading) return <div className="p-10 flex items-center justify-center h-screen text-gray-400 font-black animate-pulse">ANALYZING INVENTORY...</div>;

    return (
        <div className="p-3 md:p-8 max-w-7xl mx-auto min-h-screen bg-gray-50/50 pb-32 font-sans">
            
            {/* Header */}
            <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black text-gray-800 tracking-tight">Stock Adjust Dashboard</h1>
                    <p className="text-[10px] md:text-sm text-gray-400 font-bold uppercase mt-1 tracking-widest">
                        Predictive Analysis & Live Ledger
                    </p>
                </div>
            </div>

            {/* LIVE DELIVERY STATUS SUMMARY */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl"><ClockIcon className="w-6 h-6" /></div>
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Today's Pending</p>
                        <h4 className="text-xl font-black text-indigo-900 mt-1">{deliveryStats.pending} <span className="text-xs text-gray-400">Orders</span></h4>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl"><TruckIcon className="w-6 h-6" /></div>
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">In Transit Now</p>
                        <h4 className="text-xl font-black text-purple-900 mt-1">{deliveryStats.transit} <span className="text-xs text-gray-400">On Way</span></h4>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl"><CheckIcon className="w-6 h-6 stroke-[3px]" /></div>
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Delivered Today</p>
                        <h4 className="text-xl font-black text-emerald-900 mt-1">{deliveryStats.delivered} <span className="text-xs text-gray-400">Success</span></h4>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2 border-b border-gray-200 scrollbar-hide">
                <button onClick={() => setActiveTab('master')} className={`px-6 py-3 rounded-t-2xl font-black text-sm transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === 'master' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-100'}`}>
                    <ClipboardDocumentListIcon className="w-5 h-5" /> Master Inventory
                </button>
                <button onClick={() => setActiveTab('log')} className={`px-6 py-3 rounded-t-2xl font-black text-sm transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === 'log' ? 'bg-orange-500 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-100'}`}>
                    <PencilSquareIcon className="w-5 h-5" /> Batch Adjust
                </button>
            </div>

            {/* TAB 1: MASTER INVENTORY (SPLIT VIEW) */}
            {activeTab === 'master' && (
            <div className="animate-in fade-in duration-500">
                
                {/* 4 Box Inventory Health (INTERACTIVE FILTERS) */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
                    <div 
                        onClick={() => handleStatusFilterToggle('Out of Stock')}
                        className={`cursor-pointer transition-all duration-300 p-5 rounded-[2.5rem] border shadow-sm text-center ${statusFilter === 'Out of Stock' ? 'bg-slate-100 border-slate-400 ring-2 ring-slate-400 scale-105 shadow-lg' : 'bg-white border-gray-100 hover:shadow-md hover:-translate-y-1'}`}
                    >
                        <div className="flex justify-center items-center gap-1.5 mb-1 text-gray-400">
                            <XCircleIcon className="w-4 h-4" />
                            <p className="text-[9px] uppercase font-black tracking-[0.2em]">OOS</p>
                        </div>
                        <h3 className="text-3xl font-black text-slate-700">{oosCount}</h3>
                    </div>

                    <div 
                        onClick={() => handleStatusFilterToggle('Critical')}
                        className={`cursor-pointer transition-all duration-300 p-5 rounded-[2.5rem] border shadow-sm text-center ${statusFilter === 'Critical' ? 'bg-red-100 border-red-400 ring-2 ring-red-400 scale-105 shadow-lg' : 'bg-white border-gray-100 hover:shadow-md hover:-translate-y-1'}`}
                    >
                        <div className="flex justify-center items-center gap-1.5 mb-1 text-red-500">
                            <ExclamationTriangleIcon className="w-4 h-4" />
                            <p className="text-[9px] uppercase font-black tracking-[0.2em]">Critical</p>
                        </div>
                        <h3 className="text-3xl font-black text-red-700">{criticalCount}</h3>
                    </div>

                    <div 
                        onClick={() => handleStatusFilterToggle('Low')}
                        className={`cursor-pointer transition-all duration-300 p-5 rounded-[2.5rem] border shadow-sm text-center ${statusFilter === 'Low' ? 'bg-orange-100 border-orange-400 ring-2 ring-orange-400 scale-105 shadow-lg' : 'bg-white border-gray-100 hover:shadow-md hover:-translate-y-1'}`}
                    >
                        <div className="flex justify-center items-center gap-1.5 mb-1 text-orange-500">
                            <ArrowTrendingUpIcon className="w-4 h-4" />
                            <p className="text-[9px] uppercase font-black tracking-[0.2em]">Low</p>
                        </div>
                        <h3 className="text-3xl font-black text-orange-700">{lowCount}</h3>
                    </div>

                    <div 
                        onClick={() => handleStatusFilterToggle('Healthy')}
                        className={`cursor-pointer transition-all duration-300 p-5 rounded-[2.5rem] border shadow-sm text-center ${statusFilter === 'Healthy' ? 'bg-green-100 border-green-400 ring-2 ring-green-400 scale-105 shadow-lg' : 'bg-white border-gray-100 hover:shadow-md hover:-translate-y-1'}`}
                    >
                        <div className="flex justify-center items-center gap-1.5 mb-1 text-green-600">
                            <CheckCircleIcon className="w-4 h-4" />
                            <p className="text-[9px] uppercase font-black tracking-[0.2em]">Healthy</p>
                        </div>
                        <h3 className="text-3xl font-black text-green-700">{healthyCount}</h3>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                    
                    {/* LEFT COLUMN: Product Selector */}
                    <div className="bg-white rounded-[2.5rem] shadow-xl border border-gray-100 flex flex-col h-[500px] lg:h-[calc(100vh-280px)] lg:col-span-1">
                        <div className="p-5 border-b border-gray-100 bg-gray-50/50 rounded-t-[2.5rem]">
                            <div className="relative">
                                <span className="absolute left-3.5 top-3.5 text-gray-400"><MagnifyingGlassIcon className="w-4 h-4" /></span>
                                <input 
                                    type="text"
                                    placeholder="Search inventory..."
                                    className="w-full pl-10 p-2.5 border border-gray-200 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white"
                                    value={masterSearch}
                                    onChange={e => setMasterSearch(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                            {filteredMaster.map(item => {
                                const isSelected = ledgerProduct?.ProductCode === item.ProductCode;
                                return (
                                    <div 
                                        key={item.ProductCode} 
                                        onClick={() => handleOpenLedger(item)}
                                        className={`p-4 rounded-3xl cursor-pointer border transition-all duration-200 group ${
                                            isSelected 
                                            ? 'bg-blue-600 border-blue-600 shadow-xl scale-[0.98]' 
                                            : 'bg-white border-gray-100 hover:border-blue-200 hover:shadow-md'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="pr-2">
                                                <div className={`font-black text-xs uppercase leading-tight ${isSelected ? 'text-white' : 'text-slate-800'}`}>
                                                    {item.ProductName}
                                                </div>
                                                <div className={`text-[9px] font-bold font-mono mt-1 ${isSelected ? 'text-blue-200' : 'text-gray-400'}`}>{item.ProductCode}</div>
                                            </div>
                                            <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase shrink-0 border ${isSelected ? 'bg-white/20 border-white/30 text-white' : (getStatusStyle(item.status))}`}>
                                                {item.status}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-end">
                                            <div className={`text-[10px] ${isSelected ? 'text-blue-100' : 'text-gray-500'} font-medium`}>
                                                <span className="block italic">Target Needs: <strong className={isSelected ? 'text-white' : 'text-blue-600'}>{item.predictedNeed}</strong> {item.displayUOM}</span>
                                            </div>
                                            <div className="text-right">
                                                <span className={`block text-[8px] uppercase font-black tracking-widest ${isSelected ? 'text-blue-200' : 'text-gray-400'}`}>In Stock</span>
                                                <span className={`font-black text-base ${isSelected ? 'text-white' : 'text-slate-900'}`}>{item.StockBalance} <span className="text-[9px] font-bold opacity-60">{item.displayUOM}</span></span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Ledger Details */}
                    <div className="bg-white rounded-[2.5rem] shadow-xl border border-gray-100 flex flex-col h-[600px] lg:h-[calc(100vh-280px)] overflow-y-auto custom-scrollbar lg:col-span-2">
                        {ledgerProduct ? (
                            <div className="p-5 md:p-8 space-y-8 animate-in slide-in-from-right-4">
                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-50 pb-6">
                                    <div>
                                        <h2 className="text-2xl font-black text-slate-800 tracking-tight uppercase leading-none">{ledgerProduct.ProductName}</h2>
                                        <div className="flex items-center gap-3 mt-2">
                                            <span className="bg-slate-100 text-slate-500 text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-widest">ID: {ledgerProduct.ProductCode}</span>
                                            <span className="text-[10px] text-blue-500 font-black uppercase tracking-widest">{ledgerProduct.Category}</span>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => setShowResetModal(true)}
                                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl shadow-xl font-black transition-all flex items-center gap-2 active:scale-95 text-[10px] uppercase tracking-widest"
                                    >
                                        <CheckCircleIcon className="w-5 h-5 stroke-[2.5]" />
                                        Manual Audit (Golden Set)
                                    </button>
                                </div>

                                {isLedgerLoading ? (
                                    <div className="h-full flex items-center justify-center py-20 text-gray-400 font-black animate-pulse uppercase tracking-[0.2em] text-xs">Loading Ledger...</div>
                                ) : (
                                    <>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                            <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100 flex items-center gap-3">
                                                <div className="p-3 bg-white text-blue-600 rounded-2xl shadow-sm"><CubeIcon className="w-7 h-7" /></div>
                                                <div>
                                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Calculated Bal</p>
                                                    <h3 className="text-2xl font-black text-slate-800 leading-none mt-1">{ledgerTransactions[0]?.balance || 0} <span className="text-[10px] text-gray-400">{ledgerProduct.displayUOM}</span></h3>
                                                </div>
                                            </div>
                                            <div className="bg-emerald-50 p-5 rounded-3xl border border-emerald-100 flex items-center gap-3">
                                                <div className="p-3 bg-white text-emerald-600 rounded-2xl shadow-sm"><ArrowTrendingUpIcon className="w-7 h-7" /></div>
                                                <div>
                                                    <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Incoming Volume</p>
                                                    <h3 className="text-2xl font-black text-emerald-800 leading-none mt-1">{ledgerTransactions.filter(t => t.type === 'IN').reduce((s, t) => s + t.qtyIn, 0)} <span className="text-[10px] text-emerald-400">{ledgerProduct.displayUOM}</span></h3>
                                                </div>
                                            </div>
                                            <div className="bg-indigo-50 p-5 rounded-3xl border border-indigo-100 flex items-center gap-3">
                                                <div className="p-3 bg-white text-indigo-600 rounded-2xl shadow-sm"><ClipboardDocumentListIcon className="w-7 h-7" /></div>
                                                <div>
                                                    <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Recent Logs</p>
                                                    <h3 className="text-sm font-black text-indigo-800 leading-none mt-2">{[...ledgerTransactions].find(t => t.type === 'RESET')?.date || 'No Recent Audit'}</h3>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-inner bg-gray-50/20">
                                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 ml-1">EOD Closing Balance History</h3>
                                            <div className="h-[200px] w-full">
                                                <svg viewBox="0 0 800 200" className="w-full h-full text-blue-500 overflow-visible">
                                                    <line x1="40" y1="20" x2="760" y2="20" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="6 6"/>
                                                    <line x1="40" y1="100" x2="760" y2="100" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="6 6"/>
                                                    <line x1="40" y1="180" x2="760" y2="180" stroke="#e2e8f0" strokeWidth="2"/>
                                                    {chartData.length > 1 && <path d={generateChartPath()} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-lg" />}
                                                    {chartData.map((dp, i) => {
                                                        const w = 800; const h = 200; const p = 40; 
                                                        const m = Math.max(...chartData.map(d => Number(d.balance) || 0), 0) * 1.2 || 10;
                                                        const x = p + (i * ((w - p * 2) / (Math.max(chartData.length - 1, 1))));
                                                        const yValue = Number(dp.balance) || 0;
                                                        const y = h - p - (yValue / m) * (h - p * 2);
                                                        
                                                        // Prevent rendering NaN or Infinity attributes
                                                        if (isNaN(x) || isNaN(y)) return null;

                                                        return (
                                                            <g key={i}>
                                                                <circle cx={x} cy={y} r="6" fill="white" stroke="currentColor" strokeWidth="3" className="shadow-sm" />
                                                                <text x={x} y={y - 15} fontSize="11" fill="#1e293b" textAnchor="middle" fontWeight="900">{dp.balance}</text>
                                                                <text x={x} y={h - 10} fontSize="10" fill="#94a3b8" textAnchor="middle" fontWeight="bold" className="uppercase tracking-tighter">{dp.date}</text>
                                                            </g>
                                                        );
                                                    })}
                                                </svg>
                                            </div>
                                        </div>

                                        <div className="border border-gray-100 rounded-[2rem] overflow-hidden shadow-sm">
                                            <div className="bg-slate-50 p-4 border-b border-gray-100 flex justify-between items-center">
                                                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">FIFO Transaction Stream</h3>
                                                <span className="text-[9px] font-bold text-slate-400">Showing Last 20 Entries</span>
                                            </div>
                                            <table className="w-full text-left">
                                                <thead className="bg-white text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-gray-50">
                                                    <tr><th className="p-4 pl-6">Date</th><th className="p-4">Type</th><th className="p-4 text-center">In</th><th className="p-4 text-center">Out</th><th className="p-4 text-center text-blue-600">EOD Bal</th><th className="p-4 pr-6">Activity</th></tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50 text-xs font-bold text-slate-600">
                                                    {ledgerTransactions.map((tx) => (
                                                        <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                                                            <td className="p-4 pl-6 font-mono text-[10px] text-slate-400">{tx.date}</td>
                                                            <td className="p-4">
                                                                <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase border tracking-widest ${
                                                                    tx.type === 'IN' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                                                    tx.type === 'OUT' ? 'bg-orange-50 text-orange-700 border-orange-100' :
                                                                    'bg-blue-50 text-blue-700 border-blue-100'
                                                                }`}>{tx.type}</span>
                                                            </td>
                                                            <td className="p-4 text-center text-emerald-600">{tx.qtyIn > 0 ? `+${tx.qtyIn}` : '—'}</td>
                                                            <td className="p-4 text-center text-orange-500">{tx.qtyOut > 0 ? `-${tx.qtyOut}` : '—'}</td>
                                                            <td className="p-4 text-center font-black text-slate-900 bg-slate-50/50">{tx.balance}</td>
                                                            <td className="p-4 pr-6 text-[10px] text-slate-400 truncate max-w-[120px]">{tx.remarks}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </>
                                )}
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-300 p-12 text-center min-h-[500px]">
                                <div className="bg-slate-50 p-10 rounded-full mb-6 border border-slate-100 shadow-inner">
                                    <ChartBarIcon className="w-16 h-16 text-slate-200" />
                                </div>
                                <h3 className="text-xl font-black text-slate-400 uppercase tracking-[0.3em] mb-3">Unit Selection Required</h3>
                                <p className="text-sm max-w-xs mx-auto font-bold text-slate-400 leading-relaxed uppercase tracking-tighter">Please choose a product from the master catalog on the left to initialize the analytics engine and ledger history.</p>
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
                    <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100"> 
                        <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 border-b border-gray-50 pb-2">Batch Inventory Log</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4"> 
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Actual Physical Count Date</label>
                                <input type="date" className="w-full border border-gray-100 rounded-2xl p-4 text-xs font-black bg-orange-50/30 text-orange-900 outline-none focus:ring-2 focus:ring-orange-500" value={logDate} onChange={e => setLogDate(e.target.value)} />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="relative">
                            <input type="text" placeholder="Search product to adjust..." className="w-full pl-12 p-4 border border-gray-200 rounded-[2rem] shadow-sm focus:ring-2 focus:ring-orange-500 text-sm font-bold bg-white outline-none" value={logSearch} onChange={e => setLogSearch(e.target.value)} />
                            <span className="absolute left-4 top-4 text-gray-400 text-xl"><MagnifyingGlassIcon className="w-6 h-6" /></span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {filteredLogProducts.slice(0, 10).map(p => {
                                const inputs = productInputs[p.ProductCode] || {};
                                const availableUOMs = Array.from(new Set([p.BaseUOM, ...(p.AllowedUOMs ? p.AllowedUOMs.split(',').map(u => u.trim().toUpperCase()).filter(Boolean) : [])]));
                                return (
                                    <div key={p.ProductCode} className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm relative group hover:shadow-md transition-all">
                                        <div className={`absolute top-0 right-0 px-3 py-1 rounded-bl-2xl text-[8px] font-black uppercase ${getStatusStyle(p.status)}`}>CUR: {p.StockBalance} {p.displayUOM}</div>
                                        <h3 className="font-black text-slate-800 text-sm uppercase mb-3 pr-20">{p.ProductName}</h3>
                                        <div className="flex items-center gap-2">
                                            <input type="number" step="0.1" placeholder="New" className="flex-1 border border-gray-100 rounded-xl text-sm p-3 font-black text-center outline-none focus:ring-2 focus:ring-orange-500 bg-slate-50" value={inputs.qty || ''} onChange={(e) => handleLogProductChange(p.ProductCode, 'qty', e.target.value)} />
                                            <select className="bg-slate-50 border border-gray-100 rounded-xl text-[10px] p-3 font-black uppercase outline-none" value={inputs.uom || p.displayUOM} onChange={(e) => handleLogProductChange(p.ProductCode, 'uom', e.target.value)}>{availableUOMs.map(u => <option key={u} value={u}>{u}</option>)}</select>
                                            <button onClick={() => addToLogCart(p)} className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl w-12 h-11 flex items-center justify-center font-black text-xl shadow-lg transform transition active:scale-90">+</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-1">
                    <div className="bg-white p-6 rounded-[2.5rem] shadow-xl border border-gray-100 sticky top-4 flex flex-col h-[calc(100vh-6rem)] min-h-[500px]">
                        <div className="flex justify-between items-center mb-6"><h2 className="text-lg font-black text-slate-800 tracking-tight uppercase">Batch Review</h2><span className="bg-orange-100 text-orange-700 text-[10px] font-black px-3 py-1 rounded-full uppercase">{logCart.length} Items</span></div>
                        <div className="flex-1 overflow-y-auto space-y-3 mb-6 custom-scrollbar pr-1">
                            {logCart.length === 0 ? (
                                <div className="h-48 flex flex-col items-center justify-center text-slate-300 italic text-sm border-2 border-dashed border-slate-100 rounded-[2rem]">Empty</div>
                            ) : logCart.map((item) => (
                                <div key={item.cartId} className="p-4 rounded-2xl bg-slate-50/50 border border-slate-100 relative group hover:bg-white transition-all">
                                    <div className="flex justify-between items-start mb-2"><div className="pr-6"><div className="text-[11px] font-black uppercase text-slate-800 leading-tight">{item.ProductName}</div><div className="text-[9px] text-slate-400 font-mono">{item.ProductCode}</div></div><button onClick={() => removeFromLogCart(item.cartId)} className="text-slate-300 hover:text-red-500 transition-colors"><XMarkIcon className="w-5 h-5" /></button></div>
                                    <div className="flex items-center gap-2 mt-2"><span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">New Balance:</span><div className="text-xs font-black text-orange-700 bg-orange-50 px-2 py-1 rounded-lg border border-orange-100">{item.qty} {item.uom}</div></div>
                                </div>
                            ))}
                        </div>
                        <button onClick={handleSubmitLog} disabled={submittingLog || logCart.length === 0} className={`w-full py-4 rounded-2xl text-white font-black text-sm shadow-xl transition-all flex items-center justify-center gap-2 ${submittingLog || logCart.length === 0 ? 'bg-slate-200 cursor-not-allowed text-slate-400' : 'bg-orange-500 hover:bg-orange-600 active:scale-95 shadow-orange-500/30'}`}>{submittingLog ? 'PROCESS...' : 'COMMIT BATCH ADJUSTMENT'}</button>
                    </div>
                </div>
            </div>
            )}

            {/* AUDIT MODAL */}
            {showResetModal && ledgerProduct && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 border-2 border-slate-50">
                        <div className="p-8 border-b border-slate-50 bg-slate-50/30 text-center">
                            <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600"><CheckCircleIcon className="w-10 h-10" /></div>
                            <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight leading-none">Manual Inventory Audit</h3>
                            <p className="text-[10px] font-bold text-slate-400 mt-3 uppercase tracking-widest leading-relaxed px-4">Overriding current system balance for <span className="text-blue-600 block text-xs mt-1">{ledgerProduct.ProductName}</span></p>
                        </div>
                        <div className="p-8 space-y-6">
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Verified Physical Count ({ledgerProduct.displayUOM})</label>
                                <input type="number" step="0.1" value={resetQuantity} onChange={(e) => setResetQuantity(e.target.value)} className="w-full p-5 border-2 border-slate-100 rounded-2xl focus:border-blue-500 outline-none text-3xl font-black text-slate-800 transition-all shadow-inner bg-slate-50/50" placeholder="0.0" autoFocus />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Audit Remarks</label>
                                <input type="text" value={resetRemarks} onChange={(e) => setResetRemarks(e.target.value)} className="w-full p-4 border-2 border-slate-100 rounded-2xl focus:border-blue-500 outline-none text-xs font-bold text-slate-600 transition-all shadow-inner bg-slate-50/50" />
                            </div>
                        </div>
                        <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex gap-3">
                            <button onClick={() => setShowResetModal(false)} className="flex-1 py-4 text-[10px] font-black text-slate-400 hover:bg-white hover:text-slate-600 rounded-2xl transition-all uppercase tracking-widest border border-transparent hover:border-slate-200">Cancel</button>
                            <button onClick={handleSaveSingleReset} disabled={!resetQuantity} className="flex-[2] py-4 text-[10px] font-black text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-2xl shadow-xl transition-all uppercase tracking-widest active:scale-95 shadow-blue-500/30">Confirm Audit Result</button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}