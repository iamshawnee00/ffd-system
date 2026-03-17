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

    // --- ALERT MUTING STATES ---
    const [mutedAlerts, setMutedAlerts] = useState({});

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
            const apiKey = process.env.NEXT_PUBLIC_SHIPDAY_API_KEY;
            if (!apiKey) return alert("Missing NEXT_PUBLIC_SHIPDAY_API_KEY");

            const res = await fetch('https://api.shipday.com/orders', {
                method: 'GET',
                headers: { 'Authorization': `Basic ${apiKey}`, 'Content-Type': 'application/json' }
            });
            if (!res.ok) throw new Error("Failed to connect to Shipday");
            const shipdayOrders = await res.json();

            for (const sOrder of shipdayOrders) {
                const doNum = sOrder.orderNumber || sOrder.order_number;
                const driverName = sOrder.carrier?.name;
                const status = sOrder.orderStatus?.orderState;

                if (doNum && driverName) {
                    await supabase.from('Orders').update({ DriverName: driverName, Status: status || 'ASSIGNED' }).eq('DONumber', doNum);
                }
            }
            await fetchInventoryData();
        } catch (err) {
            console.error("Sync error:", err);
        } finally {
            setIsSyncingShipday(false);
        }
    };

    const fetchInventoryData = async () => {
        setLoading(true);

        // --- READ MUTED ALERTS ---
        let localMuted = {};
        if (typeof window !== 'undefined') {
            try {
                const stored = localStorage.getItem('ffd_muted_alerts');
                if (stored) {
                    localMuted = JSON.parse(stored);
                    let changed = false;
                    Object.keys(localMuted).forEach(k => {
                        if (localMuted[k].expiry < Date.now()) {
                            delete localMuted[k];
                            changed = true;
                        }
                    });
                    if (changed) localStorage.setItem('ffd_muted_alerts', JSON.stringify(localMuted));
                }
            } catch(e) {}
            setMutedAlerts(localMuted);
        }

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
            if (localMuted[p.ProductCode]) {
                status = localMuted[p.ProductCode].type === 'OOS' ? 'Out of Season' : 'Acknowledged';
            } else if (currentStock <= 0) {
                // If we have 0 or negative stock, it's Critical IF we predict we need it tomorrow.
                status = predictedNeed > 0 ? 'Critical' : 'Out of Stock';
            } else if (currentStock < actualTomorrow) {
                // We have some stock, but NOT ENOUGH for confirmed actual orders tomorrow.
                status = 'Critical';
            } else if (currentStock <= predictedNeed) {
                // We have enough for confirmed orders, but below our safe predictive buffer.
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

    // --- ALERT MUTING HANDLERS ---
    const handleMuteAlert = (productCode, type) => {
        const expiry = type === 'OOS' 
            ? Date.now() + (30 * 24 * 60 * 60 * 1000) // 30 days
            : Date.now() + (24 * 60 * 60 * 1000);     // 24 hours
        
        const updated = { ...mutedAlerts, [productCode]: { type, expiry } };
        localStorage.setItem('ffd_muted_alerts', JSON.stringify(updated));
        setMutedAlerts(updated);
        fetchInventoryData(); // Refresh UI
    };

    const handleUnmuteAlert = (productCode) => {
        const updated = { ...mutedAlerts };
        delete updated[productCode];
        localStorage.setItem('ffd_muted_alerts', JSON.stringify(updated));
        setMutedAlerts(updated);
        fetchInventoryData(); // Refresh UI
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
            case 'Out of Season': return 'bg-slate-100 text-slate-500 border-slate-300';
            case 'Acknowledged': return 'bg-gray-100 text-gray-500 border-gray-300';
            default: return 'bg-green-50 text-green-700 border-green-200';
        }
    };

    const handleStatusFilterToggle = (status) => {
        setStatusFilter(prev => prev === status ? null : status);
    };

    const filteredMaster = inventory.filter(p => {
        if (statusFilter === 'OOS' && !['Out of Stock', 'Out of Season'].includes(p.status)) return false;
        if (statusFilter === 'Healthy' && !['Healthy', 'Acknowledged'].includes(p.status)) return false;
        if (statusFilter === 'Critical' && p.status !== 'Critical') return false;
        if (statusFilter === 'Low' && p.status !== 'Low') return false;

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
    const oosCount = inventory.filter(i => i.status === 'Out of Stock' || i.status === 'Out of Season').length;
    const criticalCount = inventory.filter(i => i.status === 'Critical').length;
    const lowCount = inventory.filter(i => i.status === 'Low').length;
    const healthyCount = inventory.filter(i => i.status === 'Healthy' || i.status === 'Acknowledged').length;

    if (loading) return <div className="p-10 flex items-center justify-center h-screen text-gray-400 font-black tracking-widest animate-pulse">ANALYZING INVENTORY...</div>;

    return (
        <div className="p-3 md:p-8 max-w-full overflow-x-hidden min-h-screen bg-gray-50/50 pb-32 animate-in fade-in duration-300">
            
            {/* Header */}
            <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                    <h1 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight">Stock Dashboard</h1>
                    <p className="text-[10px] md:text-xs text-gray-400 font-bold uppercase mt-1">
                        Predictive Analysis & Live Ledger
                    </p>
                </div>
                <div className="text-[9px] md:text-xs font-bold text-gray-500 bg-white border border-gray-200 px-3 py-1.5 rounded-full uppercase shadow-sm hidden sm:block">
                    User: {currentUser}
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2 border-b border-gray-200">
                <button onClick={() => setActiveTab('master')} className={`px-6 py-3 rounded-t-2xl font-black text-sm transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === 'master' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-100'}`}>
                    <ClipboardDocumentListIcon className="w-5 h-5" /> Master Inventory
                </button>
                <button onClick={() => setActiveTab('log')} className={`px-6 py-3 rounded-t-2xl font-black text-sm transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === 'log' ? 'bg-orange-500 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-100'}`}>
                    <PencilSquareIcon className="w-5 h-5" /> Batch Adjust
                </button>
            </div>

            {/* TAB 1: MASTER INVENTORY */}
            {activeTab === 'master' && (
            <div className="animate-in fade-in duration-300 h-full flex flex-col">
                
                {/* Main View: List & Detail (Native mobile slide-over pattern) */}
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 md:gap-6 items-start xl:h-[calc(100vh-160px)] relative overflow-hidden">
                    
                    {/* LEFT COLUMN: Health Matrix + Product Selector */}
                    <div className="xl:col-span-4 flex flex-col h-[calc(100vh-200px)] xl:h-full overflow-hidden gap-4">
                        
                        {/* Health Matrix (Moved Left & Compact) */}
                        <div className="grid grid-cols-2 gap-3 shrink-0">
                            <div 
                                onClick={() => handleStatusFilterToggle('OOS')}
                                className={`cursor-pointer transition-all duration-200 p-3 md:p-4 rounded-2xl border flex items-center justify-between shadow-sm ${statusFilter === 'OOS' ? 'bg-gray-100 border-gray-400 ring-2 ring-gray-400' : 'bg-white border-gray-100 hover:border-gray-300 hover:shadow-md'}`}
                            >
                                <div>
                                    <p className="text-[9px] text-gray-500 uppercase font-black tracking-widest">OOS / OUT SEAS</p>
                                    <h3 className="text-2xl font-black text-gray-800 mt-0.5 leading-none">{oosCount}</h3>
                                </div>
                                <XCircleIcon className="w-6 h-6 md:w-8 md:h-8 text-gray-300" />
                            </div>

                            <div 
                                onClick={() => handleStatusFilterToggle('Critical')}
                                className={`cursor-pointer transition-all duration-200 p-3 md:p-4 rounded-2xl border flex items-center justify-between shadow-sm ${statusFilter === 'Critical' ? 'bg-red-50 border-red-400 ring-2 ring-red-400' : 'bg-white border-gray-100 hover:border-red-300 hover:shadow-md'}`}
                            >
                                <div>
                                    <p className="text-[9px] text-red-500 uppercase font-black tracking-widest">Critical</p>
                                    <h3 className="text-2xl font-black text-red-700 mt-0.5 leading-none">{criticalCount}</h3>
                                </div>
                                <ExclamationTriangleIcon className="w-6 h-6 md:w-8 md:h-8 text-red-200" />
                            </div>

                            <div 
                                onClick={() => handleStatusFilterToggle('Low')}
                                className={`cursor-pointer transition-all duration-200 p-3 md:p-4 rounded-2xl border flex items-center justify-between shadow-sm ${statusFilter === 'Low' ? 'bg-orange-50 border-orange-400 ring-2 ring-orange-400' : 'bg-white border-gray-100 hover:border-orange-300 hover:shadow-md'}`}
                            >
                                <div>
                                    <p className="text-[9px] text-orange-500 uppercase font-black tracking-widest">Low</p>
                                    <h3 className="text-2xl font-black text-orange-700 mt-0.5 leading-none">{lowCount}</h3>
                                </div>
                                <ArrowTrendingUpIcon className="w-6 h-6 md:w-8 md:h-8 text-orange-200" />
                            </div>

                            <div 
                                onClick={() => handleStatusFilterToggle('Healthy')}
                                className={`cursor-pointer transition-all duration-200 p-3 md:p-4 rounded-2xl border flex items-center justify-between shadow-sm ${statusFilter === 'Healthy' ? 'bg-green-50 border-green-400 ring-2 ring-green-400' : 'bg-white border-gray-100 hover:border-green-300 hover:shadow-md'}`}
                            >
                                <div>
                                    <p className="text-[9px] text-green-600 uppercase font-black tracking-widest">Healthy / NOTED</p>
                                    <h3 className="text-2xl font-black text-green-700 mt-0.5 leading-none">{healthyCount}</h3>
                                </div>
                                <CheckCircleIcon className="w-6 h-6 md:w-8 md:h-8 text-green-200" />
                            </div>
                        </div>

                        {/* Product Selector */}
                        <div className="bg-white rounded-[2rem] shadow-xl border border-gray-100 flex flex-col flex-1 overflow-hidden min-h-[300px]">
                            <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                                <div className="relative">
                                    <span className="absolute left-4 top-3.5 text-gray-400"><MagnifyingGlassIcon className="w-5 h-5" /></span>
                                    <input 
                                        type="text"
                                        placeholder="Search inventory..."
                                        className="w-full pl-12 p-3.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
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
                                            className={`p-4 rounded-2xl cursor-pointer border transition-all duration-100 group ${
                                                isSelected 
                                                ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-400 shadow-md' 
                                                : 'bg-white border-gray-100 hover:border-blue-200 hover:shadow-sm'
                                            }`}
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="pr-2">
                                                    <div className={`font-black text-xs uppercase leading-tight ${isSelected ? 'text-blue-900' : 'text-gray-800'}`}>
                                                        {item.ProductName}
                                                    </div>
                                                    <div className={`text-[10px] font-bold font-mono mt-0.5 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`}>{item.ProductCode}</div>
                                                </div>
                                                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase shrink-0 border ${getStatusStyle(item.status)}`}>
                                                    {item.status}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-end mt-2 pt-2 border-t border-gray-50">
                                                <div className={`text-gray-500 font-medium ${isSelected ? 'text-blue-800' : ''}`}>
                                                    <span className="block text-xs mb-1">Need Tmw: <strong className={`text-lg md:text-xl font-black ${isSelected ? 'text-blue-700' : 'text-blue-600'}`}>{item.predictedNeed}</strong> <span className="text-[10px] font-bold">{item.displayUOM}</span></span>
                                                    <span className="block text-[10px]">7 Days: <strong className={`font-black ${isSelected ? 'text-blue-900' : 'text-gray-700'}`}>{item.past7Days}</strong> {item.displayUOM}</span>
                                                </div>
                                                <div className="text-right">
                                                    <span className={`block text-[9px] uppercase font-bold tracking-widest ${isSelected ? 'text-blue-500' : 'text-gray-400'} mb-0.5`}>Balance</span>
                                                    <span className={`font-black text-xl md:text-2xl ${isSelected ? 'text-blue-900' : 'text-slate-900'}`}>{item.StockBalance} <span className="text-[10px] font-bold opacity-60">{item.displayUOM}</span></span>
                                                </div>
                                            </div>
                                            {/* NEW: ALERTS ACTION BAR */}
                                            {['Critical', 'Low', 'Out of Stock'].includes(item.status) && (
                                                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                                                    <button onClick={() => handleMuteAlert(item.ProductCode, 'ACK')} className="flex-1 text-[9px] font-black bg-gray-100 hover:bg-gray-200 text-gray-600 py-1.5 rounded-lg transition-colors">✓ NOTED (24H)</button>
                                                    <button onClick={() => handleMuteAlert(item.ProductCode, 'OOS')} className="flex-1 text-[9px] font-black bg-slate-100 hover:bg-slate-200 text-slate-600 py-1.5 rounded-lg transition-colors">❄️ OUT SEASON</button>
                                                </div>
                                            )}
                                            {['Acknowledged', 'Out of Season'].includes(item.status) && (
                                                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                                                    <button onClick={() => handleUnmuteAlert(item.ProductCode)} className="flex-1 text-[9px] font-black bg-blue-50 hover:bg-blue-100 text-blue-600 py-1.5 rounded-lg transition-colors">↺ RESTORE ALERTS</button>
                                                </div>
                                            )}
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
                    </div>

                    {/* RIGHT COLUMN: Ledger Details (Full screen slide-in on mobile, static on desktop) */}
                    <div className={`
                        xl:col-span-8 bg-white rounded-t-[2rem] xl:rounded-[2rem] shadow-2xl xl:shadow-xl border border-gray-100 
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

                                <div className="p-5 md:p-8 space-y-6 overflow-y-auto custom-scrollbar flex-1 pb-24 xl:pb-8">
                                    {/* Desktop Detail Header */}
                                    <div className="hidden xl:flex justify-between items-start md:items-center gap-4 border-b border-gray-50 pb-6 shrink-0">
                                        <div>
                                            <h2 className="text-xl md:text-3xl font-black text-gray-800 tracking-tight uppercase leading-none">{ledgerProduct.ProductName}</h2>
                                            <div className="flex items-center gap-3 mt-3">
                                                <span className="text-[10px] text-gray-400 font-black font-mono uppercase tracking-widest bg-gray-50 px-2 py-1 rounded-md border border-gray-100">CODE: {ledgerProduct.ProductCode}</span>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => setShowResetModal(true)}
                                            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl shadow-lg font-black transition-all flex items-center gap-2 active:scale-95 text-[10px] md:text-xs uppercase tracking-widest"
                                        >
                                            <CheckCircleIcon className="w-5 h-5 stroke-[2]" />
                                            Manual Audit
                                        </button>
                                    </div>

                                    {/* Mobile Audit Button (Floating bottom or inline) */}
                                    <div className="xl:hidden shrink-0">
                                        <button 
                                            onClick={() => setShowResetModal(true)}
                                            className="w-full bg-blue-600 text-white p-4 rounded-2xl shadow-lg font-black flex items-center justify-center gap-2 active:scale-95 text-xs uppercase tracking-widest"
                                        >
                                            <CheckCircleIcon className="w-5 h-5" /> Perform Manual Audit
                                        </button>
                                    </div>

                                    {isLedgerLoading ? (
                                        <div className="flex-1 flex items-center justify-center py-20 text-gray-300 font-black animate-pulse uppercase tracking-[0.2em] text-xs">Loading Ledger...</div>
                                    ) : (
                                        <>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                                <div className="bg-blue-50/50 p-4 md:p-5 rounded-3xl border border-blue-100 flex flex-col justify-center items-center text-center sm:items-start sm:text-left sm:flex-row sm:gap-4 shadow-sm">
                                                    <div className="p-3 bg-white text-blue-600 rounded-2xl shadow-sm mb-2 sm:mb-0"><CubeIcon className="w-6 h-6 sm:w-7 sm:h-7" /></div>
                                                    <div>
                                                        <p className="text-[9px] md:text-[10px] font-black text-blue-500 uppercase tracking-widest">Current Bal</p>
                                                        <h3 className="text-2xl font-black text-blue-900 leading-none mt-1">{Number(ledgerTransactions[0]?.balance || 0).toFixed(2)} <span className="text-[10px] font-bold text-gray-500">{ledgerProduct.displayUOM}</span></h3>
                                                    </div>
                                                </div>
                                                <div className="bg-emerald-50/50 p-4 md:p-5 rounded-3xl border border-emerald-100 flex flex-col justify-center items-center text-center sm:items-start sm:text-left sm:flex-row sm:gap-4 shadow-sm">
                                                    <div className="p-3 bg-white text-emerald-600 rounded-2xl shadow-sm mb-2 sm:mb-0"><ArrowTrendingUpIcon className="w-6 h-6 sm:w-7 sm:h-7" /></div>
                                                    <div>
                                                        <p className="text-[9px] md:text-[10px] font-black text-emerald-500 uppercase tracking-widest">Incoming</p>
                                                        <h3 className="text-2xl font-black text-emerald-900 leading-none mt-1">{Number(ledgerTransactions.filter(t => t.type === 'IN').reduce((s, t) => s + (Number(t.qtyIn) || 0), 0)).toFixed(2)} <span className="text-[10px] font-bold text-gray-500">{ledgerProduct.displayUOM}</span></h3>
                                                    </div>
                                                </div>
                                                <div className="col-span-2 sm:col-span-1 bg-slate-50 p-4 md:p-5 rounded-3xl border border-slate-200 flex flex-col justify-center items-center text-center sm:items-start sm:text-left sm:flex-row sm:gap-4 shadow-sm">
                                                    <div className="p-3 bg-white text-slate-500 rounded-2xl shadow-sm mb-2 sm:mb-0 hidden sm:block"><ClipboardDocumentListIcon className="w-6 h-6 sm:w-7 sm:h-7" /></div>
                                                    <div>
                                                        <p className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest">Recent Audit</p>
                                                        <h3 className="text-sm font-black text-slate-800 leading-tight mt-2">{[...ledgerTransactions].find(t => t.type === 'RESET')?.date || 'N/A'}</h3>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="bg-white p-5 md:p-6 rounded-[2rem] border border-gray-100 shadow-sm">
                                                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Stock Trend</h3>
                                                <div className="h-[300px] xl:h-[350px] w-full">
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

                                            <div className="border border-gray-100 rounded-[2rem] overflow-hidden shadow-sm">
                                                <table className="w-full text-left">
                                                    <thead className="bg-gray-50 text-[9px] font-black text-gray-400 uppercase border-b border-gray-100 tracking-widest">
                                                        <tr><th className="p-4 pl-6">Date</th><th className="p-4">Type</th><th className="p-4 text-center">In</th><th className="p-4 text-center">Out</th><th className="p-4 text-center text-blue-600">Bal</th></tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-50 text-xs font-bold text-gray-600">
                                                        {ledgerTransactions.map((tx) => (
                                                            <tr key={tx.id} className="hover:bg-gray-50/50 transition-colors">
                                                                <td className="p-4 pl-6 font-mono text-gray-400">{tx.date.substring(5)}</td>
                                                                <td className="p-4">
                                                                    <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase border tracking-widest shadow-sm ${
                                                                        tx.type === 'IN' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                                                        tx.type === 'OUT' ? 'bg-orange-50 text-orange-700 border-orange-100' :
                                                                        'bg-blue-50 text-blue-700 border-blue-100'
                                                                    }`}>{tx.type}</span>
                                                                </td>
                                                                <td className="p-4 text-center text-emerald-600">{tx.qtyIn > 0 ? `+${Number(tx.qtyIn).toFixed(2)}` : '—'}</td>
                                                                <td className="p-4 text-center text-orange-500">{tx.qtyOut > 0 ? `-${Number(tx.qtyOut).toFixed(2)}` : '—'}</td>
                                                                <td className="p-4 text-center font-black text-gray-800 bg-gray-50/50">{Number(tx.balance).toFixed(2)}</td>
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
                                <div className="bg-slate-50 p-8 rounded-full mb-6 border border-slate-100 shadow-sm hidden md:block">
                                    <ChartBarIcon className="w-12 h-12 text-slate-300" />
                                </div>
                                <h3 className="text-lg font-black uppercase tracking-widest mb-2 text-slate-600">Select Product</h3>
                                <p className="text-sm max-w-xs mx-auto font-medium text-slate-400 leading-relaxed">Choose an item from the catalog on the left to view its detailed ledger.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            )}

            {/* TAB 2: LOG INVENTORY (Batch Update) */}
            {activeTab === 'log' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-300">
                <div className="lg:col-span-8 space-y-6">
                    <div className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-gray-100"> 
                        <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 border-b border-gray-50 pb-2">Record Actual Balance</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"> 
                            <div>
                                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Count Date</label>
                                <input type="date" className="w-full border border-gray-200 rounded-xl p-3.5 text-sm font-black bg-orange-50/30 text-orange-900 outline-none focus:ring-2 focus:ring-orange-500 transition-all" value={logDate} onChange={e => setLogDate(e.target.value)} />
                            </div>
                            <div className="relative flex items-end">
                                <div className="w-full relative">
                                    <input type="text" placeholder="Search catalog..." className="w-full pl-12 p-3.5 border border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-orange-500 text-sm font-bold bg-white outline-none transition-all" value={logSearch} onChange={e => setLogSearch(e.target.value)} />
                                    <span className="absolute left-4 top-4 text-gray-400"><MagnifyingGlassIcon className="w-5 h-5" /></span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:h-[calc(100vh-320px)] lg:overflow-y-auto custom-scrollbar pb-32 lg:pb-0 pr-2">
                        {filteredLogProducts.slice(0, 15).map(p => {
                            const inputs = productInputs[p.ProductCode] || {};
                            const availableUOMs = Array.from(new Set([p.BaseUOM, ...(p.AllowedUOMs ? p.AllowedUOMs.split(',').map(u => u.trim().toUpperCase()).filter(Boolean) : [])]));
                            return (
                                <div key={p.ProductCode} className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm relative group hover:border-orange-300 hover:shadow-md transition-all flex flex-col justify-between">
                                    <div className={`absolute top-0 right-0 px-3 py-1 rounded-bl-2xl text-[8px] font-black uppercase ${getStatusStyle(p.status)}`}>CUR: {p.StockBalance} {p.displayUOM}</div>
                                    <h3 className="font-black text-gray-800 text-sm uppercase mb-4 pr-20 leading-tight">{p.ProductName}</h3>
                                    <div className="flex items-center gap-2 mt-auto">
                                        <select className="bg-gray-50 border border-gray-200 rounded-xl text-[10px] p-2 flex-1 font-black uppercase outline-none focus:ring-2 focus:ring-orange-500" value={inputs.uom || p.displayUOM} onChange={(e) => handleLogProductChange(p.ProductCode, 'uom', e.target.value)}>{availableUOMs.map(u => <option key={u} value={u}>{u}</option>)}</select>
                                        <input type="number" step="0.1" placeholder="New Bal" className="w-24 border border-gray-200 rounded-xl text-xs p-2 font-black text-center outline-none focus:ring-2 focus:ring-orange-500 bg-gray-50" value={inputs.qty || ''} onChange={(e) => handleLogProductChange(p.ProductCode, 'qty', e.target.value)} />
                                        <button onClick={() => addToLogCart(p)} className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl w-10 h-10 flex items-center justify-center font-black text-lg shadow-sm transform transition active:scale-95 shrink-0">+</button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Desktop Cart Column (Hidden on Mobile) */}
                <div className="hidden lg:flex lg:col-span-4 bg-white p-6 rounded-[2rem] shadow-xl border border-gray-100 sticky top-4 flex-col h-[calc(100vh-6rem)] min-h-[500px]">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-lg font-black text-gray-800 tracking-tight uppercase">Update List</h2>
                        <span className="bg-orange-100 text-orange-700 text-[10px] font-black px-3 py-1 rounded-full uppercase">{logCart.length} Items</span>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-3 mb-6 custom-scrollbar pr-1">
                        {logCart.length === 0 ? (
                            <div className="h-48 flex flex-col items-center justify-center text-gray-300 italic text-sm border-2 border-dashed border-gray-100 rounded-[2rem]">List is empty</div>
                        ) : logCart.map((item) => (
                            <div key={item.cartId} className="p-4 rounded-2xl bg-gray-50/50 border border-gray-100 relative group hover:bg-white transition-all">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="pr-6">
                                        <div className="text-xs font-black uppercase text-gray-800 leading-tight">{item.ProductName}</div>
                                        <div className="text-[9px] text-gray-400 font-mono mt-1">{item.ProductCode}</div>
                                    </div>
                                    <button onClick={() => removeFromLogCart(item.cartId)} className="text-gray-300 hover:text-red-500 absolute top-3 right-3 p-1 transition-colors"><XMarkIcon className="w-4 h-4" /></button>
                                </div>
                                <div className="flex items-center justify-between mt-2">
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Set to:</span>
                                    <div className="text-xs font-black text-orange-700 bg-orange-50 px-3 py-1 rounded-lg border border-orange-100 shadow-sm">{item.qty} <span className="text-[10px]">{item.uom}</span></div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-auto pt-6 border-t border-gray-100 space-y-4">
                        <button 
                            onClick={handleSubmitLog} 
                            disabled={submittingLog || logCart.length === 0} 
                            className={`w-full py-4 rounded-2xl text-white font-black text-sm shadow-xl transition-all flex items-center justify-center gap-2 ${submittingLog || logCart.length === 0 ? 'bg-gray-300 cursor-not-allowed shadow-none' : 'bg-orange-500 hover:bg-orange-600 active:scale-95'}`}
                        >
                            {submittingLog ? 'PROCESSING ENGINE...' : '🚀 COMMIT ADJUSTMENT'}
                        </button>
                    </div>
                </div>

                {/* Mobile Floating Cart Action Bar */}
                {logCart.length > 0 && (
                    <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-40">
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
                                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-black py-4 px-6 rounded-xl shadow-lg transition active:scale-95 text-sm tracking-widest"
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
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in zoom-in duration-200">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 flex flex-col">
                        <div className="flex justify-between items-center mb-2 flex-shrink-0 border-b border-gray-100 pb-4 pt-6 px-6 bg-gray-50/50 relative">
                            <button onClick={() => setShowResetModal(false)} className="text-gray-400 hover:text-red-500 text-3xl font-bold bg-gray-50 hover:bg-red-50 w-10 h-10 rounded-full flex items-center justify-center transition-all pb-1 absolute right-6 top-6">×</button>
                            <div className="text-center w-full mt-2">
                                <h3 className="text-xl md:text-2xl font-black text-gray-900 flex items-center justify-center gap-2 uppercase tracking-tight">
                                    <CheckCircleIcon className="w-6 h-6 text-blue-600" />
                                    Manual Audit
                                </h3>
                                <p className="text-[10px] md:text-xs font-bold text-gray-500 mt-2 uppercase tracking-widest leading-relaxed">
                                    Set balance for <br/><span className="text-blue-600 block mt-1">{ledgerProduct.ProductName}</span>
                                </p>
                            </div>
                        </div>
                        <div className="p-6 md:p-8 space-y-6">
                            <div>
                                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 ml-1">Physical Count ({ledgerProduct.displayUOM})</label>
                                <input type="number" step="0.1" value={resetQuantity} onChange={(e) => setResetQuantity(e.target.value)} className="w-full p-4 border border-gray-200 rounded-2xl focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-2xl font-black text-gray-800 transition-all text-center bg-gray-50" placeholder="0.0" autoFocus />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 ml-1">Remarks</label>
                                <input type="text" value={resetRemarks} onChange={(e) => setResetRemarks(e.target.value)} className="w-full p-4 border border-gray-200 rounded-2xl focus:border-blue-500 outline-none text-sm font-bold text-gray-600 transition-all" />
                            </div>
                        </div>
                        <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3 pb-8 md:pb-6">
                            <button onClick={() => setShowResetModal(false)} className="flex-1 py-4 text-xs font-black text-gray-600 hover:bg-gray-200 rounded-2xl transition-all uppercase tracking-widest border border-gray-200 bg-white">Cancel</button>
                            <button onClick={handleSaveSingleReset} disabled={!resetQuantity} className="flex-[2] py-4 text-xs font-black text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:bg-gray-300 rounded-2xl shadow-xl transition-all uppercase tracking-widest active:scale-95">Confirm Result</button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}