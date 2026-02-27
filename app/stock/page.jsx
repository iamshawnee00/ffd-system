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
    XCircleIcon,
    ClockIcon,
    CheckIcon,
    ChevronLeftIcon,
    ShoppingCartIcon
} from '@heroicons/react/24/outline';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine
} from 'recharts';

// Helper for local date string formatting (YYYY-MM-DD) across GMT+8
const getLocalDateStr = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export default function StockBalancePage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('master'); 
    const [currentUser, setCurrentUser] = useState('');

    // --- DATA STATES ---
    const [inventory, setInventory] = useState([]);
    const [isSyncingShipday, setIsSyncingShipday] = useState(false);
    
    // --- MASTER TAB STATES ---
    const [masterSearch, setMasterSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState(null); 

    // --- LOG INVENTORY STATES ---
    const [logDate, setLogDate] = useState(() => getLocalDateStr(new Date()));
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

        // Bind Inventory to Realtime DB Changes
        const channel = supabase
            .channel('realtime_orders_sync')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'Orders' }, () => {
                fetchInventoryData();
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [router]);

    // Format display status for consistent logic across pages
    const formatDisplayStatus = (rawStatus) => {
        if (!rawStatus) return 'PENDING';
        const s = String(rawStatus).toUpperCase().trim().replace(/_/g, ' ');
        if (s.includes('DELIVERED') || s.includes('COMPLETED') || s.includes('DEPOSITED') || s.includes('POD')) return 'DELIVERED';
        if (s.includes('TRANSIT') || s.includes('STARTED') || s.includes('PICKED') || s.includes('WAY') || s.includes('READY')) return 'IN TRANSIT';
        if (s.includes('ASSIGNED') || s.includes('ACCEPTED')) return 'ASSIGNED';
        if (s.includes('FAILED') || s.includes('CANCELLED') || s.includes('INCOMPLETE')) return 'FAILED';
        return 'PENDING';
    };

    const handleSyncShipday = async () => {
        setIsSyncingShipday(true);
        try {
            const res = await fetch('/api/shipday/sync-status', { method: 'POST' });
            if (res.ok) {
                await fetchInventoryData();
            }
        } catch (err) {
            console.error("Sync error:", err);
        } finally {
            setIsSyncingShipday(false);
        }
    };

    const fetchInventoryData = async () => {
        setLoading(true);

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
            .gte('Delivery Date', startStr)
            .lte('Delivery Date', tomorrowStr);
            
        if (orderError) console.error("Error fetching orders:", orderError);

        const usageMap = {};
        const tomorrowMap = {};
        
        if (orders) {
            orders.forEach(o => {
                const code = o["Product Code"];
                const qty = Number(o.Quantity || 0);
                // Defensively extract just the YYYY-MM-DD part in case of timestamp data
                const rawDate = o["Delivery Date"] || '';
                const dDate = rawDate.length >= 10 ? rawDate.substring(0, 10) : rawDate;
                
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
            if (actualTomorrow > 0 && currentStock < actualTomorrow) {
                // We have confirmed orders tomorrow but insufficient balance to fulfill them
                status = 'Critical';
            } else if (currentStock <= 0) {
                // Zero or negative balance, but no immediate confirmed orders tomorrow
                status = 'Out of Stock';
            } else if (currentStock <= predictedNeed) {
                // Stock is positive, but falls below our safe predictive buffer
                status = 'Low';
            }

            return {
                ...p,
                past7Days: past7.toFixed(2),
                avgDaily: avgDaily.toFixed(2),
                predictedNeed: Number(predictedNeed).toFixed(2),
                actualTomorrow: Number(actualTomorrow).toFixed(2),
                StockBalance: Number(p.StockBalance || 0).toFixed(2),
                status: status,
                displayUOM: p.SalesUOM || p.BaseUOM || 'KG'
            };
        });

        // SORTING LOGIC: 1. Balance (Ascending), 2. Name (A-Z)
        enriched.sort((a, b) => {
            const balA = Number(a.StockBalance || 0);
            const balB = Number(b.StockBalance || 0);
            
            if (balA !== balB) return balA - balB; 
            
            const nameA = a.ProductName || '';
            const nameB = b.ProductName || '';
            return nameA.localeCompare(nameB);
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

        try { await supabase.from('StockAdjustments').insert(adjustmentRows); } catch (e) {}

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
        setLedgerTransactions([]); 
        
        const [adjRes, ordRes, purRes] = await Promise.all([
            supabase.from('StockAdjustments').select('*').eq('ProductCode', product.ProductCode).order('Timestamp', { ascending: false }).limit(10),
            supabase.from('Orders').select('*').eq('Product Code', product.ProductCode).order('Delivery Date', { ascending: false }).limit(15),
            supabase.from('Purchase').select('*').eq('ProductCode', product.ProductCode).order('Timestamp', { ascending: false }).limit(15)
        ]);
            
        const history = [];
        let runningBalance = Number(product.StockBalance) || 0;
        
        if (adjRes.data) {
            adjRes.data.forEach(a => {
                const ts = a.Timestamp ? new Date(a.Timestamp) : new Date();
                const dateStr = !isNaN(ts) ? ts.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
                history.push({
                    id: `adj-${a.id || Math.random()}`,
                    date: dateStr,
                    type: 'RESET',
                    qtyIn: 0,
                    qtyOut: 0,
                    balance: a.AdjustedQty,
                    remarks: `Audit by ${a.LoggedBy || 'System'}`
                });
            });
        }
        
        if (ordRes.data) {
            ordRes.data.forEach(o => {
                history.push({
                    id: `ord-${o.id || Math.random()}`,
                    date: o["Delivery Date"] || new Date().toISOString().split('T')[0],
                    type: 'OUT',
                    qtyIn: 0,
                    qtyOut: Number(o.Quantity || 0),
                    balance: 0,
                    remarks: `DO: ${o.DONumber}`
                });
            });
        }

        if (purRes.data) {
            purRes.data.forEach(p => {
                const ts = p.Timestamp ? new Date(p.Timestamp) : new Date();
                const dateStr = !isNaN(ts) ? ts.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
                history.push({
                    id: `pur-${p.id || Math.random()}`,
                    date: dateStr,
                    type: 'IN',
                    qtyIn: Number(p.PurchaseQty || 0),
                    qtyOut: 0,
                    balance: 0,
                    remarks: `Supplier: ${p.Supplier || 'Unknown'}`
                });
            });
        }

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
        
        const newBalance = parseFloat(resetQuantity); 
        if (isNaN(newBalance)) return alert("Please enter a valid number");
        
        try {
            const { error: masterErr } = await supabase
                .from('ProductMaster')
                .update({ StockBalance: newBalance })
                .eq('ProductCode', ledgerProduct.ProductCode);
                
            if (masterErr) throw masterErr;

            try {
                await supabase.from('StockAdjustments').insert([{
                    Timestamp: new Date(),
                    ProductCode: ledgerProduct.ProductCode,
                    ProductName: ledgerProduct.ProductName,
                    AdjustedQty: newBalance,
                    UOM: ledgerProduct.displayUOM,
                    LoggedBy: currentUser
                }]);
            } catch (e) {}

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
            setLedgerProduct({ ...ledgerProduct, StockBalance: newBalance.toFixed(2) });
            setShowResetModal(false);
            setResetQuantity('');
            fetchInventoryData(); 

        } catch (error) {
            alert('Error updating golden set balance.');
        }
    };

    // --- CHART GENERATION ---
    const chartData = useMemo(() => {
        const dailyMap = {};
        ledgerTransactions.forEach(t => { 
            // Since ledgerTransactions is sorted newest-first (descending),
            // the first transaction we encounter for a specific date is the End Of Day balance.
            if (t.date && dailyMap[t.date] === undefined) {
                dailyMap[t.date] = Number(t.balance) || 0; 
            }
        });
        
        // Return sorted chronologically (ascending) for the chart
        return Object.keys(dailyMap)
            .sort((a, b) => new Date(a) - new Date(b))
            .map(dateStr => ({
                date: dateStr.substring(5), // "MM-DD"
                balance: Number(Number(dailyMap[dateStr]).toFixed(2))
            }));
    }, [ledgerTransactions]);

    // --- HELPERS ---
    const getStatusStyle = (status) => {
        switch (status) {
            case 'Critical': return 'bg-red-50 text-red-600 border-red-200';
            case 'Out of Stock': return 'bg-gray-100 text-gray-500 border-gray-300';
            case 'Low': return 'bg-orange-50 text-orange-600 border-orange-200';
            default: return 'bg-green-50 text-green-700 border-green-200';
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

    if (loading) return <div className="p-10 flex items-center justify-center h-screen text-gray-400 font-black tracking-widest animate-pulse">ANALYZING INVENTORY...</div>;

    return (
        <div className="p-3 md:p-8 w-full max-w-[1600px] mx-auto min-h-screen bg-gray-50 pb-32 md:pb-8 font-sans overflow-x-hidden">
            
            {/* Header */}
            <div className="mb-4 md:mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-xl md:text-3xl font-black text-gray-800 tracking-tight">Stock Dashboard</h1>
                    <p className="text-[10px] md:text-xs text-gray-500 font-bold uppercase mt-1 tracking-widest">
                        Predictive Analysis & Live Ledger
                    </p>
                </div>
                
                {/* Navigation Tabs (Mobile optimized scrolling) */}
                <div className="flex w-full md:w-auto gap-2 bg-white p-1.5 md:p-1.5 rounded-2xl shadow-sm border border-gray-100 overflow-x-auto snap-x custom-scrollbar">
                    <button onClick={() => setActiveTab('master')} className={`snap-center shrink-0 px-5 md:px-6 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 ${activeTab === 'master' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}>
                        <ClipboardDocumentListIcon className="w-4 h-4" /> Master Inventory
                    </button>
                    <button onClick={() => setActiveTab('log')} className={`snap-center shrink-0 px-5 md:px-6 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 ${activeTab === 'log' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}>
                        <PencilSquareIcon className="w-4 h-4" /> Batch Adjust
                    </button>
                </div>
            </div>

            {/* TAB 1: MASTER INVENTORY */}
            {activeTab === 'master' && (
            <div className="animate-in fade-in duration-300">
                
                {/* Health Matrix */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
                    <div 
                        onClick={() => handleStatusFilterToggle('Out of Stock')}
                        className={`cursor-pointer transition-all duration-200 p-3 md:p-4 rounded-2xl border flex items-center justify-between shadow-sm ${statusFilter === 'Out of Stock' ? 'bg-gray-100 border-gray-400 ring-1 ring-gray-400' : 'bg-white border-gray-100 hover:border-gray-300'}`}
                    >
                        <div>
                            <p className="text-[9px] text-gray-500 uppercase font-black tracking-widest">OOS</p>
                            <h3 className="text-3xl font-black text-gray-800 mt-0.5 leading-none">{oosCount}</h3>
                        </div>
                        <XCircleIcon className="w-8 h-8 text-gray-200" />
                    </div>

                    <div 
                        onClick={() => handleStatusFilterToggle('Critical')}
                        className={`cursor-pointer transition-all duration-200 p-3 md:p-4 rounded-2xl border flex items-center justify-between shadow-sm ${statusFilter === 'Critical' ? 'bg-red-50 border-red-400 ring-1 ring-red-400' : 'bg-white border-gray-100 hover:border-red-200'}`}
                    >
                        <div>
                            <p className="text-[9px] text-red-500 uppercase font-black tracking-widest">Critical</p>
                            <h3 className="text-3xl font-black text-red-700 mt-0.5 leading-none">{criticalCount}</h3>
                        </div>
                        <ExclamationTriangleIcon className="w-8 h-8 text-red-100" />
                    </div>

                    <div 
                        onClick={() => handleStatusFilterToggle('Low')}
                        className={`cursor-pointer transition-all duration-200 p-3 md:p-4 rounded-2xl border flex items-center justify-between shadow-sm ${statusFilter === 'Low' ? 'bg-orange-50 border-orange-400 ring-1 ring-orange-400' : 'bg-white border-gray-100 hover:border-orange-200'}`}
                    >
                        <div>
                            <p className="text-[9px] text-orange-500 uppercase font-black tracking-widest">Low</p>
                            <h3 className="text-3xl font-black text-orange-700 mt-0.5 leading-none">{lowCount}</h3>
                        </div>
                        <ArrowTrendingUpIcon className="w-8 h-8 text-orange-100" />
                    </div>

                    <div 
                        onClick={() => handleStatusFilterToggle('Healthy')}
                        className={`cursor-pointer transition-all duration-200 p-3 md:p-4 rounded-2xl border flex items-center justify-between shadow-sm ${statusFilter === 'Healthy' ? 'bg-green-50 border-green-400 ring-1 ring-green-400' : 'bg-white border-gray-100 hover:border-green-200'}`}
                    >
                        <div>
                            <p className="text-[9px] text-green-600 uppercase font-black tracking-widest">Healthy</p>
                            <h3 className="text-3xl font-black text-green-700 mt-0.5 leading-none">{healthyCount}</h3>
                        </div>
                        <CheckCircleIcon className="w-8 h-8 text-green-100" />
                    </div>
                </div>

                {/* Main View: List & Detail (Native mobile slide-over pattern) */}
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start xl:h-[calc(100vh-250px)] xl:min-h-[600px] relative overflow-hidden">
                    
                    {/* LEFT COLUMN: Product Selector */}
                    <div className="xl:col-span-4 bg-white rounded-[2rem] shadow-sm border border-gray-200 flex flex-col h-[calc(100vh-280px)] xl:h-full overflow-hidden">
                        <div className="p-3 md:p-4 border-b border-gray-100 bg-gray-50/50">
                            <div className="relative">
                                <span className="absolute left-3.5 top-2.5 text-gray-400"><MagnifyingGlassIcon className="w-4 h-4" /></span>
                                <input 
                                    type="text"
                                    placeholder="Search inventory..."
                                    className="w-full pl-10 p-2 border border-gray-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white"
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
                                        className={`p-3.5 rounded-2xl cursor-pointer border transition-all duration-100 group ${
                                            isSelected 
                                            ? 'bg-blue-50 border-blue-300 shadow-sm' 
                                            : 'bg-white border-transparent hover:border-gray-200 hover:bg-gray-50 active:bg-gray-100'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="pr-2">
                                                <div className={`font-black text-xs uppercase leading-tight ${isSelected ? 'text-blue-900' : 'text-gray-800'}`}>
                                                    {item.ProductName}
                                                </div>
                                                <div className={`text-[9px] font-bold font-mono mt-0.5 ${isSelected ? 'text-blue-500' : 'text-gray-400'}`}>{item.ProductCode}</div>
                                            </div>
                                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase shrink-0 border ${getStatusStyle(item.status)}`}>
                                                {item.status}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-end mt-1">
                                            <div className={`text-gray-500 font-medium ${isSelected ? 'text-blue-800' : ''}`}>
                                                <span className="block text-xs mb-1">Need Tmw: <strong className={`text-lg md:text-xl font-black ${isSelected ? 'text-blue-700' : 'text-blue-600'}`}>{item.predictedNeed}</strong> <span className="text-[10px] font-bold">{item.displayUOM}</span></span>
                                                <span className="block text-[10px]">7 Days: <strong className={`font-black ${isSelected ? 'text-blue-900' : 'text-gray-700'}`}>{item.past7Days}</strong> {item.displayUOM}</span>
                                            </div>
                                            <div className="text-right">
                                                <span className={`block text-[9px] uppercase font-bold tracking-widest ${isSelected ? 'text-blue-400' : 'text-gray-400'} mb-0.5`}>Balance</span>
                                                <span className={`font-black text-xl md:text-2xl ${isSelected ? 'text-blue-900' : 'text-slate-900'}`}>{item.StockBalance} <span className="text-[10px] font-bold opacity-60">{item.displayUOM}</span></span>
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

                    {/* RIGHT COLUMN: Ledger Details (Full screen slide-in on mobile, static on desktop) */}
                    <div className={`
                        xl:col-span-8 bg-white rounded-t-[2rem] xl:rounded-[2rem] shadow-2xl xl:shadow-sm border border-gray-200 
                        flex-col h-full xl:h-full overflow-hidden 
                        fixed inset-0 z-50 mt-14 xl:static xl:z-auto xl:mt-0 
                        transition-transform duration-300 ease-in-out
                        ${ledgerProduct ? 'translate-x-0 flex' : 'translate-x-full xl:translate-x-0 hidden xl:flex'}
                    `}>
                        {ledgerProduct ? (
                            <div className="flex flex-col h-full bg-white relative">
                                {/* Mobile Header with Back Button */}
                                <div className="xl:hidden flex items-center justify-between p-4 border-b border-gray-100 bg-white sticky top-0 z-10 shrink-0">
                                    <button onClick={() => setLedgerProduct(null)} className="flex items-center gap-1 text-blue-600 font-bold text-xs p-2 -ml-2 rounded-lg active:bg-blue-50">
                                        <ChevronLeftIcon className="w-5 h-5" /> Back
                                    </button>
                                    <div className="text-xs font-black uppercase text-gray-800 truncate px-4">{ledgerProduct.ProductName}</div>
                                </div>

                                <div className="p-4 md:p-8 space-y-6 overflow-y-auto custom-scrollbar flex-1 pb-24 xl:pb-8">
                                    {/* Desktop Detail Header */}
                                    <div className="hidden xl:flex justify-between items-start md:items-center gap-4 border-b border-gray-50 pb-6 shrink-0">
                                        <div>
                                            <h2 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight uppercase leading-none">{ledgerProduct.ProductName}</h2>
                                            <div className="flex items-center gap-3 mt-2">
                                                <span className="text-[10px] text-gray-400 font-black font-mono uppercase tracking-widest">CODE: {ledgerProduct.ProductCode}</span>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => setShowResetModal(true)}
                                            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl shadow-sm font-bold transition-all flex items-center gap-2 active:scale-95 text-[10px] uppercase tracking-widest"
                                        >
                                            <CheckCircleIcon className="w-4 h-4 stroke-[2]" />
                                            Manual Audit
                                        </button>
                                    </div>

                                    {/* Mobile Audit Button (Floating bottom or inline) */}
                                    <div className="xl:hidden shrink-0">
                                        <button 
                                            onClick={() => setShowResetModal(true)}
                                            className="w-full bg-blue-600 text-white p-3 rounded-xl shadow-md font-bold flex items-center justify-center gap-2 active:scale-95 text-xs uppercase tracking-widest"
                                        >
                                            <CheckCircleIcon className="w-4 h-4" /> Perform Manual Audit
                                        </button>
                                    </div>

                                    {isLedgerLoading ? (
                                        <div className="flex-1 flex items-center justify-center py-20 text-gray-300 font-black animate-pulse uppercase tracking-[0.2em] text-xs">Loading Ledger...</div>
                                    ) : (
                                        <>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                                <div className="bg-blue-50/50 p-3 md:p-4 rounded-2xl border border-blue-100 flex flex-col justify-center items-center text-center sm:items-start sm:text-left sm:flex-row sm:gap-3">
                                                <div className="p-2 bg-white text-blue-600 rounded-xl shadow-sm mb-2 sm:mb-0"><CubeIcon className="w-5 h-5 sm:w-6 sm:h-6" /></div>
                                                <div>
                                                    <p className="text-[8px] md:text-[9px] font-black text-blue-400 uppercase tracking-widest">Current Bal</p>
                                                    <h3 className="text-xl font-black text-blue-900 leading-none mt-1">{Number(ledgerTransactions[0]?.balance || 0).toFixed(2)} <span className="text-[9px] md:text-[10px] font-bold text-gray-500">{ledgerProduct.displayUOM}</span></h3>
                                                </div>
                                            </div>
                                            <div className="bg-emerald-50/50 p-3 md:p-4 rounded-2xl border border-emerald-100 flex flex-col justify-center items-center text-center sm:items-start sm:text-left sm:flex-row sm:gap-3">
                                                <div className="p-2 bg-white text-emerald-600 rounded-xl shadow-sm mb-2 sm:mb-0"><ArrowTrendingUpIcon className="w-5 h-5 sm:w-6 sm:h-6" /></div>
                                                <div>
                                                    <p className="text-[8px] md:text-[9px] font-black text-emerald-500 uppercase tracking-widest">Incoming</p>
                                                    <h3 className="text-xl font-black text-emerald-900 leading-none mt-1">{Number(ledgerTransactions.filter(t => t.type === 'IN').reduce((s, t) => s + (Number(t.qtyIn) || 0), 0)).toFixed(2)} <span className="text-[9px] md:text-[10px] font-bold text-gray-500">{ledgerProduct.displayUOM}</span></h3>
                                                </div>
                                            </div>
                                            <div className="col-span-2 sm:col-span-1 bg-slate-50 p-3 md:p-4 rounded-2xl border border-slate-200 flex flex-col justify-center items-center text-center sm:items-start sm:text-left sm:flex-row sm:gap-3">
                                                    <div className="p-2 bg-white text-slate-500 rounded-xl shadow-sm mb-2 sm:mb-0 hidden sm:block"><ClipboardDocumentListIcon className="w-5 h-5 sm:w-6 sm:h-6" /></div>
                                                    <div>
                                                        <p className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest">Recent Audit</p>
                                                        <h3 className="text-xs font-black text-slate-700 leading-none mt-2">{[...ledgerTransactions].find(t => t.type === 'RESET')?.date || 'N/A'}</h3>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="bg-white p-4 md:p-5 rounded-2xl border border-gray-100 shadow-sm">
                                                <h3 className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-4">Stock Trend</h3>
                                                <div className="h-[200px] w-full">
                                                    {chartData.length > 0 ? (
                                                        <ResponsiveContainer width="100%" height="100%">
                                                            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                                                <CartesianGrid stroke="#f3f4f6" strokeDasharray="3 3" vertical={false} />
                                                                <ReferenceLine y={0} stroke="#ef4444" strokeWidth={2} strokeDasharray="4 4" label={{ position: 'insideTopLeft', value: '0 Balance', fill: '#ef4444', fontSize: 10, fontWeight: 'bold' }} />
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
                                                                />
                                                                <Tooltip 
                                                                    contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', padding: '12px'}}
                                                                    labelStyle={{fontWeight: 'bold', color: '#1f2937', marginBottom: '8px', fontSize: '12px'}}
                                                                    itemStyle={{fontSize: '12px', fontWeight: '500'}}
                                                                />
                                                                <Line 
                                                                    type="monotone" 
                                                                    dataKey="balance" 
                                                                    name="Balance" 
                                                                    stroke="#3b82f6" 
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
                                                            <p className="font-bold text-sm">No trend data available</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                                                <table className="w-full text-left">
                                                    <thead className="bg-gray-50 text-[8px] md:text-[9px] font-black text-gray-400 uppercase border-b border-gray-100 tracking-widest">
                                                        <tr><th className="p-3 pl-4">Date</th><th className="p-3">Type</th><th className="p-3 text-center">In</th><th className="p-3 text-center">Out</th><th className="p-3 text-center text-blue-600">Bal</th></tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-50 text-[10px] md:text-xs font-bold text-gray-600">
                                                        {ledgerTransactions.map((tx) => (
                                                            <tr key={tx.id} className="hover:bg-gray-50/50 transition-colors">
                                                                <td className="p-3 pl-4 font-mono text-gray-400">{tx.date.substring(5)}</td>
                                                                <td className="p-3">
                                                                    <span className={`px-1.5 py-0.5 rounded text-[7px] md:text-[8px] font-black uppercase border tracking-widest ${
                                                                        tx.type === 'IN' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                                                        tx.type === 'OUT' ? 'bg-orange-50 text-orange-700 border-orange-100' :
                                                                        'bg-blue-50 text-blue-700 border-blue-100'
                                                                    }`}>{tx.type}</span>
                                                                </td>
                                                                <td className="p-3 text-center text-emerald-600">{tx.qtyIn > 0 ? `+${Number(tx.qtyIn).toFixed(2)}` : '—'}</td>
                                                                <td className="p-3 text-center text-orange-500">{tx.qtyOut > 0 ? `-${Number(tx.qtyOut).toFixed(2)}` : '—'}</td>
                                                                <td className="p-3 text-center font-black text-gray-800 bg-gray-50/50">{Number(tx.balance).toFixed(2)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-start pt-32 text-slate-400 p-8 text-center h-full">
                                <div className="bg-slate-50 p-6 rounded-full mb-6 border border-slate-100 shadow-sm hidden md:block">
                                    <ChartBarIcon className="w-10 h-10 text-slate-300" />
                                </div>
                                <h3 className="text-sm font-black uppercase tracking-widest mb-2 text-slate-600">Select Product</h3>
                                <p className="text-xs max-w-xs mx-auto font-medium text-slate-400 leading-relaxed">Choose an item from the list to view its ledger.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            )}

            {/* TAB 2: LOG INVENTORY (Batch Update) */}
            {activeTab === 'log' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-300">
                <div className="lg:col-span-8 space-y-4 md:space-y-6">
                    <div className="bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-gray-100"> 
                        <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 border-b border-gray-50 pb-2">Record Actual Balance</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"> 
                            <div>
                                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Count Date</label>
                                <input type="date" className="w-full border border-gray-200 rounded-xl p-3 text-xs font-black bg-orange-50/30 text-orange-900 outline-none focus:ring-2 focus:ring-orange-500" value={logDate} onChange={e => setLogDate(e.target.value)} />
                            </div>
                            <div className="relative flex items-end">
                                <div className="w-full relative">
                                    <input type="text" placeholder="Search catalog..." className="w-full pl-10 p-3 border border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-orange-500 text-xs font-bold bg-white outline-none" value={logSearch} onChange={e => setLogSearch(e.target.value)} />
                                    <span className="absolute left-3.5 top-3 text-gray-400"><MagnifyingGlassIcon className="w-4 h-4" /></span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:h-[calc(100vh-300px)] lg:overflow-y-auto custom-scrollbar pb-32 lg:pb-0">
                        {filteredLogProducts.slice(0, 15).map(p => {
                            const inputs = productInputs[p.ProductCode] || {};
                            const availableUOMs = Array.from(new Set([p.BaseUOM, ...(p.AllowedUOMs ? p.AllowedUOMs.split(',').map(u => u.trim().toUpperCase()).filter(Boolean) : [])]));
                            return (
                                <div key={p.ProductCode} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm relative group hover:border-orange-200 transition-all flex flex-col justify-between">
                                    <div className={`absolute top-0 right-0 px-2.5 py-1 rounded-bl-xl text-[8px] font-black uppercase ${getStatusStyle(p.status)}`}>CUR: {p.StockBalance} {p.displayUOM}</div>
                                    <h3 className="font-black text-gray-800 text-xs uppercase mb-3 pr-20 leading-tight">{p.ProductName}</h3>
                                    <div className="flex items-center gap-2 mt-auto">
                                        <input type="number" step="0.1" placeholder="New Bal" className="flex-1 border border-gray-200 rounded-xl text-xs p-2.5 font-black text-center outline-none focus:ring-2 focus:ring-orange-500 bg-gray-50 min-w-[70px]" value={inputs.qty || ''} onChange={(e) => handleLogProductChange(p.ProductCode, 'qty', e.target.value)} />
                                        <select className="bg-gray-50 border border-gray-200 rounded-xl text-[10px] p-2.5 font-black uppercase outline-none focus:ring-2 focus:ring-orange-500" value={inputs.uom || p.displayUOM} onChange={(e) => handleLogProductChange(p.ProductCode, 'uom', e.target.value)}>{availableUOMs.map(u => <option key={u} value={u}>{u}</option>)}</select>
                                        <button onClick={() => addToLogCart(p)} className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl w-10 h-10 flex items-center justify-center font-black text-lg shadow-sm transform transition active:scale-95 shrink-0">+</button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Desktop Cart Column (Hidden on Mobile) */}
                <div className="hidden lg:flex lg:col-span-4 bg-white p-5 rounded-[2rem] shadow-xl border border-gray-100 sticky top-4 flex-col h-[calc(100vh-6rem)] min-h-[500px]">
                    <div className="flex justify-between items-center mb-6"><h2 className="text-base font-black text-gray-800 tracking-tight uppercase">Update List</h2><span className="bg-orange-100 text-orange-700 text-[10px] font-black px-2.5 py-1 rounded-full uppercase">{logCart.length} Items</span></div>
                    <div className="flex-1 overflow-y-auto space-y-2 mb-6 custom-scrollbar pr-1">
                        {logCart.length === 0 ? (
                            <div className="h-32 flex flex-col items-center justify-center text-gray-300 italic text-xs border-2 border-dashed border-gray-100 rounded-2xl">List empty</div>
                        ) : logCart.map((item) => (
                            <div key={item.cartId} className="p-3 rounded-xl bg-gray-50 border border-gray-100 relative group">
                                <div className="flex justify-between items-start mb-1"><div className="pr-6"><div className="text-[10px] font-black uppercase text-gray-800 leading-tight">{item.ProductName}</div><div className="text-[8px] text-gray-400 font-mono mt-0.5">{item.ProductCode}</div></div><button onClick={() => removeFromLogCart(item.cartId)} className="text-gray-300 hover:text-red-500 absolute top-2 right-2"><XMarkIcon className="w-4 h-4" /></button></div>
                                <div className="flex items-center gap-2 mt-1"><span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Set to:</span><div className="text-[11px] font-black text-orange-700 bg-orange-50 px-2 py-0.5 rounded border border-orange-100">{item.qty} <span className="text-[8px]">{item.uom}</span></div></div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-auto pt-4 border-t border-gray-100 space-y-3">
                        <button 
                            onClick={handleSubmitLog} 
                            disabled={submittingLog || logCart.length === 0} 
                            className={`w-full py-3.5 rounded-xl text-white font-black text-xs shadow-md transition-all flex items-center justify-center gap-2 ${submittingLog || logCart.length === 0 ? 'bg-gray-300 cursor-not-allowed shadow-none' : 'bg-orange-500 hover:bg-orange-600 active:scale-95'}`}
                        >
                            {submittingLog ? 'PROCESS...' : 'COMMIT ADJUSTMENT'}
                        </button>
                    </div>
                </div>

                {/* Mobile Floating Cart Action Bar */}
                {logCart.length > 0 && (
                    <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 pb-6 shadow-[0_-10px_20px_rgba(0,0,0,0.1)] z-40">
                        <div className="flex items-center justify-between gap-4 max-w-lg mx-auto">
                            <div className="flex items-center gap-3">
                                <div className="bg-orange-100 p-3 rounded-full text-orange-600 relative">
                                    <ClipboardDocumentListIcon className="w-6 h-6" />
                                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-white">{logCart.length}</span>
                                </div>
                            </div>
                            <button 
                                onClick={handleSubmitLog}
                                disabled={submittingLog}
                                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-black py-3.5 px-6 rounded-xl shadow-lg transition active:scale-95 text-xs tracking-widest"
                            >
                                {submittingLog ? 'UPDATING...' : 'COMMIT BATCH'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
            )}

            {/* AUDIT MODAL */}
            {showResetModal && ledgerProduct && (
                <div className="fixed inset-0 z-[110] flex items-end md:items-center justify-center bg-gray-900/60 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-t-3xl md:rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in slide-in-from-bottom-10 md:zoom-in-95 duration-200 border border-gray-100">
                        <div className="p-6 border-b border-gray-100 bg-gray-50/50 text-center relative">
                            <button onClick={() => setShowResetModal(false)} className="absolute right-4 top-4 text-gray-400 p-2"><XMarkIcon className="w-5 h-5"/></button>
                            <h3 className="text-base font-black text-gray-900 flex items-center justify-center gap-2 uppercase tracking-tight mt-2">
                                <CheckCircleIcon className="w-5 h-5 text-blue-600" />
                                Manual Audit
                            </h3>
                            <p className="text-[10px] font-bold text-gray-500 mt-2 uppercase tracking-widest leading-relaxed">
                                Set balance for <br/><span className="text-blue-600 block mt-0.5">{ledgerProduct.ProductName}</span>
                            </p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Physical Count ({ledgerProduct.displayUOM})</label>
                                <input type="number" step="0.1" value={resetQuantity} onChange={(e) => setResetQuantity(e.target.value)} className="w-full p-4 border border-gray-200 rounded-2xl focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-xl font-black text-gray-800 transition-all text-center bg-gray-50" placeholder="0.0" autoFocus />
                            </div>
                            <div>
                                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Remarks</label>
                                <input type="text" value={resetRemarks} onChange={(e) => setResetRemarks(e.target.value)} className="w-full p-3 border border-gray-200 rounded-xl focus:border-blue-500 outline-none text-xs font-bold text-gray-600 transition-all" />
                            </div>
                        </div>
                        <div className="p-4 md:p-5 bg-gray-50 border-t border-gray-100 flex gap-2 pb-8 md:pb-5">
                            <button onClick={() => setShowResetModal(false)} className="flex-1 py-3.5 text-[10px] font-black text-gray-500 hover:bg-gray-200 rounded-xl transition-all uppercase tracking-widest">Cancel</button>
                            <button onClick={handleSaveSingleReset} disabled={!resetQuantity} className="flex-[2] py-3.5 text-[10px] font-black text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl shadow-sm transition-all uppercase tracking-widest active:scale-95">Confirm Result</button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}