'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { 
  ShoppingBagIcon, 
  ClipboardDocumentListIcon, 
  PencilSquareIcon, 
  TrashIcon, 
  CheckIcon, 
  XMarkIcon,
  MagnifyingGlassIcon,
  PlusIcon
} from '@heroicons/react/24/outline';

// Custom Searchable Product Dropdown for History Editing
function HistoryProductSelect({ currentProductCode, products, onChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');

    const selectedProduct = products.find(p => p.ProductCode === currentProductCode);
    const displayName = selectedProduct ? selectedProduct.ProductName : '-- Select Product --';

    const filteredProducts = products.filter(p => {
        if (!search) return true;
        const terms = search.toLowerCase().split(' ').filter(t => t);
        const searchStr = `${p.ProductName || ''} ${p.ProductCode || ''}`.toLowerCase();
        return terms.every(term => searchStr.includes(term));
    });

    return (
        <div className="relative w-full min-w-[200px]">
            <div 
                onClick={() => setIsOpen(!isOpen)}
                className="p-2 border border-purple-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 w-full font-black uppercase bg-white cursor-pointer text-xs flex justify-between items-center shadow-sm"
            >
                <span className="truncate">{displayName}</span>
                <span className="text-[10px] text-gray-400 ml-1 shrink-0">▼</span>
            </div>
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
                    <div className="absolute z-50 mt-1 w-64 bg-white border border-gray-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                        <div className="p-3 border-b border-gray-100 bg-gray-50">
                            <input 
                                type="text"
                                autoFocus
                                placeholder="Search product..."
                                className="w-full p-2 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-purple-500 font-bold"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                        <div className="max-h-48 overflow-y-auto custom-scrollbar">
                            {filteredProducts.map(p => (
                                <div 
                                    key={p.ProductCode}
                                    className="p-3 hover:bg-purple-50 cursor-pointer text-xs border-b border-gray-50 last:border-0"
                                    onClick={() => {
                                        onChange(p.ProductCode, p.ProductName);
                                        setIsOpen(false);
                                        setSearch('');
                                    }}
                                >
                                    <div className="font-black text-gray-800 uppercase">{p.ProductName}</div>
                                    <div className="text-[10px] text-gray-400 font-mono mt-0.5">{p.ProductCode}</div>
                                </div>
                            ))}
                            {filteredProducts.length === 0 && (
                                <div className="p-4 text-center text-xs font-bold text-gray-400">No products found</div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

export default function NewPurchasePage() {
  const router = useRouter();
  
  // Tab State
  const [activeTab, setActiveTab] = useState('new'); // 'new' or 'history'

  // Data States
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [purchaseHistory, setPurchaseHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // User State
  const [currentUser, setCurrentUser] = useState('');

  // Form States
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  
  // Cart State
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Temporary input state for product cards
  const [productInputs, setProductInputs] = useState({});

  // History Edit State
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [historySearchTerm, setHistorySearchTerm] = useState('');

  // 1. Fetch Data & User on Load
  useEffect(() => {
    async function loadData() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      // Auto capture user from session email
      const email = session.user.email || "";
      const username = email.split('@')[0].toUpperCase();
      setCurrentUser(username);

      // Fetch Suppliers
      const { data: suppData } = await supabase
        .from('Suppliers')
        .select('SupplierName')
        .order('SupplierName');

      // Fetch Products
      const { data: prodData } = await supabase
        .from('ProductMaster')
        .select('ProductCode, ProductName, BaseUOM, Category, StockBalance, ReportingUOM, AllowedUOMs')
        .order('ProductName');

      setSuppliers(suppData || []);
      setProducts(prodData || []);
      
      await fetchPurchaseHistory();
      setLoading(false);
    }
    loadData();
  }, [router]);

  const fetchPurchaseHistory = async () => {
    const { data } = await supabase
        .from('Purchase')
        .select('*')
        .order('Timestamp', { ascending: false })
        .limit(5000); 
    if (data) setPurchaseHistory(data);
  };

  // --- NEW PURCHASE LOGIC ---

  const handleProductInputChange = (code, field, value) => {
    setProductInputs(prev => ({
      ...prev,
      [code]: { ...prev[code], [field]: value }
    }));
  };

  const addToCart = (product) => {
    const inputs = productInputs[product.ProductCode] || {};
    const qty = parseFloat(inputs.qty);
    const cost = inputs.cost === undefined || inputs.cost === '' ? 0 : parseFloat(inputs.cost);
    
    if (!qty || qty <= 0) return;

    const newItem = {
      ...product,
      cartId: `${product.ProductCode}-${Date.now()}-${Math.random()}`, 
      qty: qty,
      uom: inputs.uom || product.BaseUOM,
      cost: cost,
      notes: ''
    };

    setCart([...cart, newItem]);
    
    setProductInputs(prev => {
      const newState = { ...prev };
      delete newState[product.ProductCode];
      return newState;
    });
    setSearchTerm('');
  };

  const removeFromCart = (cartId) => {
    setCart(cart.filter(item => item.cartId !== cartId));
  };

  const handleSubmit = async () => {
    if (!selectedSupplier || !purchaseDate || cart.length === 0) {
      alert("Please select a supplier, date, and items.");
      return;
    }

    setSubmitting(true);

    const now = new Date();
    const [year, month, day] = purchaseDate.split('-');

    const purchaseRows = cart.map((item, index) => {
      // Create a truly unique timestamp dynamically to completely bypass constraint errors
      const rowDate = new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds() + index);

      return {
        "Timestamp": rowDate.toISOString(), 
        "ProductCode": item.ProductCode,
        "ProductName": item.ProductName,
        "Supplier": selectedSupplier,
        "PurchaseQty": item.qty,
        "PurchaseUOM": item.uom,
        "CostPrice": item.cost,
        "InvoiceNumber": invoiceNumber || "",
        "LoggedBy": currentUser 
      };
    });

    const { error } = await supabase.from('Purchase').insert(purchaseRows);

    if (error) {
      alert("Error logging purchase: " + error.message);
      setSubmitting(false);
    } else {
      alert("Purchase Logged Successfully!");
      setCart([]);
      setInvoiceNumber('');
      setSubmitting(false);
      fetchPurchaseHistory(); 
      setActiveTab('history');
    }
  };

  // --- HISTORY EDIT LOGIC ---

  const startEditing = (item) => {
      setEditingId(item.id);
      setEditData({ ...item });
  };

  const cancelEditing = () => {
      setEditingId(null);
      setEditData({});
  };

  const handleSaveEdit = async () => {
      if (!editData.Supplier || !editData.ProductCode || editData.PurchaseQty === '' || editData.CostPrice === '') {
          return alert("Please fill in all required fields.");
      }

      const { error } = await supabase
          .from('Purchase')
          .update({
              Supplier: editData.Supplier,
              ProductCode: editData.ProductCode,
              ProductName: editData.ProductName,
              PurchaseQty: Number(editData.PurchaseQty),
              PurchaseUOM: editData.PurchaseUOM,
              CostPrice: Number(editData.CostPrice),
              InvoiceNumber: editData.InvoiceNumber || ''
          })
          .eq('id', editingId);

      if (error) {
          alert("Error updating purchase: " + error.message);
      } else {
          alert("Purchase updated successfully.");
          setEditingId(null);
          fetchPurchaseHistory();
      }
  };

  const handleDeletePurchase = async (id) => {
      if (!confirm("Are you sure you want to delete this purchase record? This action cannot be undone.")) return;
      
      const { error } = await supabase.from('Purchase').delete().eq('id', id);
      if (error) {
          alert("Error deleting: " + error.message);
      } else {
          fetchPurchaseHistory();
      }
  };

  // --- HELPERS ---

  const filteredProducts = products.filter(p => {
    if (!searchTerm) return false;
    const lowerTerm = searchTerm.toLowerCase();
    const searchParts = lowerTerm.split(' '); 
    const combinedText = (p.ProductName + ' ' + p.ProductCode + ' ' + (p.Category || '')).toLowerCase();
    return searchParts.every(part => combinedText.includes(part));
  });

  const filteredPurchaseHistory = purchaseHistory.filter(item => {
    if (!historySearchTerm) return true;
    const searchTerms = historySearchTerm.toLowerCase().split(' ').filter(t => t);
    
    const dateStr = new Date(item.Timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const combinedText = `${dateStr} ${item.Supplier || ''} ${item.ProductName || ''} ${item.ProductCode || ''} ${item.InvoiceNumber || ''}`.toLowerCase();
    
    return searchTerms.every(part => combinedText.includes(part));
  });

  // Limit direct view to 100 items, but allow full results if searching
  const displayedHistory = historySearchTerm ? filteredPurchaseHistory : filteredPurchaseHistory.slice(0, 100);

  const getStockColor = (balance) => {
    if (balance === null || balance === undefined) return 'bg-gray-100 text-gray-500'; 
    const qty = Number(balance);
    if (qty < 20) return 'bg-red-100 text-red-600';
    if (qty <= 50) return 'bg-orange-100 text-orange-600';
    return 'bg-green-100 text-green-600';
  };

  if (loading) return <div className="p-10 flex items-center justify-center h-screen text-gray-400 font-black tracking-widest animate-pulse">FFD SYSTEM ENGINE BOOTING...</div>;

  return (
    <div className="p-3 md:p-8 max-w-full overflow-x-hidden min-h-screen bg-gray-50/50 pb-32 animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
         <div>
             <h1 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight">Purchase Hub</h1>
             <p className="text-[10px] md:text-xs text-gray-400 font-bold uppercase mt-1">Record and manage incoming stock costs</p>
         </div>
         <div className="text-[9px] md:text-xs font-bold text-gray-500 bg-white border border-gray-200 px-3 py-1.5 rounded-full uppercase shadow-sm">
             User: {currentUser}
         </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 border-b border-gray-200">
          <button 
              onClick={() => setActiveTab('new')} 
              className={`px-6 py-3 rounded-t-2xl font-black text-sm transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === 'new' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-100'}`}
          >
              <ShoppingBagIcon className="w-5 h-5" /> Log New Purchase
          </button>
          <button 
              onClick={() => setActiveTab('history')} 
              className={`px-6 py-3 rounded-t-2xl font-black text-sm transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === 'history' ? 'bg-purple-600 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-100'}`}
          >
              <ClipboardDocumentListIcon className="w-5 h-5" /> Purchase History
          </button>
      </div>

      {/* ==============================
          TAB 1: LOG NEW PURCHASE 
          ============================== */}
      {activeTab === 'new' && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
        
        {/* --- LEFT COLUMN --- */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* 1. Purchase Details Card */}
          <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
            <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 border-b border-gray-50 pb-2">Purchase Details</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
               {/* Supplier Name */}
               <div className="col-span-1 md:col-span-2">
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Supplier Name</label>
                  <input 
                    list="supplier-list"
                    type="text"
                    className="w-full border border-gray-200 rounded-xl p-3 text-xs font-black focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all uppercase bg-gray-50/50"
                    value={selectedSupplier}
                    onChange={(e) => setSelectedSupplier(e.target.value)}
                    placeholder="TYPE TO FIND SUPPLIER..."
                  />
                  <datalist id="supplier-list">
                    {suppliers.map(s => <option key={s.SupplierName} value={s.SupplierName} />)}
                  </datalist>
               </div>

               {/* Purchase Date */}
               <div className="col-span-1">
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Date</label>
                  <input 
                    type="date" 
                    className="w-full border border-gray-200 rounded-xl p-3 text-xs font-black bg-blue-50 text-blue-800 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    value={purchaseDate}
                    onChange={e => setPurchaseDate(e.target.value)}
                  />
               </div>

               {/* Invoice No */}
               <div className="col-span-1 md:col-span-3">
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Invoice / Ref No.</label>
                  <input 
                    type="text" 
                    className="w-full border border-gray-200 rounded-xl p-3 text-xs font-black focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all uppercase bg-gray-50/50"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="OPTIONAL INVOICE NO..."
                  />
               </div>
            </div>
          </div>

          {/* 2. Product Search & Selection */}
          <div className="space-y-4">
             <div className="relative">
                <input 
                  type="text"
                  placeholder="Search catalog to add..."
                  className="w-full pl-12 p-4 border border-gray-200 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-bold bg-white"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
                <span className="absolute left-4 top-4 text-gray-400 text-xl"><MagnifyingGlassIcon className="w-5 h-5"/></span>
             </div>

             {/* Product Grid */}
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filteredProducts.slice(0, 10).map(p => {
                    const inputs = productInputs[p.ProductCode] || {};
                    const uomOptions = p.AllowedUOMs 
                      ? p.AllowedUOMs.split(',').map(u => u.trim().toUpperCase()).filter(u => u)
                      : [p.BaseUOM];

                    return (
                      <div key={p.ProductCode} className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                         <div className={`absolute top-0 right-0 px-3 py-1 rounded-bl-2xl text-[8px] font-black uppercase ${getStockColor(p.StockBalance)}`}>
                            STOCK: {p.StockBalance ? Number(p.StockBalance).toFixed(1) : '0.0'} {p.BaseUOM}
                         </div>

                         <h3 className="font-black text-gray-800 text-sm uppercase leading-tight mb-3 pr-10">{p.ProductName}</h3>

                         {/* Controls */}
                         <div className="flex gap-2 mb-3">
                            <select 
                              className="bg-gray-50 border border-gray-200 rounded-xl text-[10px] p-2 flex-1 font-black uppercase outline-none focus:ring-1 focus:ring-blue-500"
                              value={inputs.uom || p.BaseUOM}
                              onChange={(e) => handleProductInputChange(p.ProductCode, 'uom', e.target.value)}
                            >
                              {uomOptions.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                            <input 
                              type="number" 
                              placeholder="Qty" 
                              className="w-20 border border-gray-200 rounded-xl text-xs p-2 font-black text-center outline-none focus:ring-2 focus:ring-blue-500"
                              value={inputs.qty || ''}
                              onChange={(e) => handleProductInputChange(p.ProductCode, 'qty', e.target.value)}
                            />
                         </div>

                         <div className="flex items-center gap-2">
                            <div className="flex-1"></div>
                            <div className="relative w-24">
                               <span className="absolute left-2 top-2 text-[8px] font-bold text-gray-400">RM</span>
                               <input 
                                 type="number" 
                                 step="0.01" 
                                 placeholder="COST" 
                                 className="w-full pl-7 pr-2 py-2 text-xs border border-gray-200 rounded-xl text-right font-black outline-none bg-gray-50 focus:ring-2 focus:ring-blue-500" 
                                 value={inputs.cost || ''}
                                 onChange={(e) => handleProductInputChange(p.ProductCode, 'cost', e.target.value)}
                               />
                            </div>
                            <button 
                              onClick={() => addToCart(p)}
                              className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl w-10 h-10 flex items-center justify-center font-bold shadow-lg active:scale-90 transition-transform"
                            >
                              <PlusIcon className="w-6 h-6" />
                            </button>
                         </div>
                      </div>
                    );
                })}
                {filteredProducts.length === 0 && searchTerm && (
                    <div className="col-span-full p-8 text-center text-gray-400 italic font-bold bg-white rounded-2xl border border-dashed border-gray-200">
                        No products found matching "{searchTerm}"
                    </div>
                )}
             </div>
          </div>
        </div>

        {/* --- RIGHT COLUMN (Cart) --- */}
        <div className="lg:col-span-1">
           <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-gray-100 sticky top-4 flex flex-col h-[calc(100vh-6rem)] min-h-[500px]">
              <div className="flex justify-between items-center mb-6">
                 <h2 className="text-lg font-black text-gray-800 tracking-tight uppercase">Purchasing List</h2>
                 <span className="bg-blue-100 text-blue-700 text-[10px] font-black px-3 py-1 rounded-full uppercase">{cart.length} items</span>
              </div>

              {/* Cart Items List */}
              <div className="flex-1 overflow-y-auto space-y-3 mb-6 custom-scrollbar pr-1">
                  {cart.length === 0 ? (
                      <div className="h-48 flex flex-col items-center justify-center text-gray-300 italic text-sm border-2 border-dashed border-gray-100 rounded-[2rem]">
                         Cart is currently empty
                      </div>
                  ) : (
                      cart.map((item) => (
                         <div key={item.cartId} className="p-4 rounded-2xl bg-gray-50/50 border border-gray-100 relative group hover:bg-white transition-all">
                             <div className="flex justify-between items-start mb-2">
                                 <div className="pr-6">
                                     <div className="text-[11px] font-black uppercase text-gray-800 leading-tight">{item.ProductName}</div>
                                 </div>
                                 <button 
                                   onClick={() => removeFromCart(item.cartId)}
                                   className="text-gray-300 hover:text-red-500 absolute top-3 right-3 p-1 transition-colors"
                                 >
                                   <XMarkIcon className="w-4 h-4" />
                                 </button>
                             </div>
                             
                             <div className="flex items-center justify-between mt-2">
                                 <div className="text-[10px] font-black text-blue-700 bg-blue-50 border border-blue-100 px-2 py-1 rounded-lg">
                                     {item.qty} {item.uom}
                                 </div>
                                 
                                 <div className="flex items-center gap-1">
                                    <span className="text-[8px] font-black text-gray-400">RM</span>
                                    <span className="text-[10px] font-black text-gray-700 bg-white border border-gray-200 px-2 py-1 rounded-lg">
                                        {(item.cost || 0).toFixed(2)}
                                    </span>
                                 </div>
                             </div>
                         </div>
                      ))
                  )}
              </div>

              {/* Footer Actions */}
              <div className="mt-auto pt-6 border-t border-gray-100 space-y-4">
                  <div className="flex justify-between items-center text-xs font-black text-gray-800 px-2 uppercase tracking-widest">
                      <span>Total Entries:</span>
                      <span>{cart.length}</span>
                  </div>

                  <button 
                      onClick={handleSubmit}
                      disabled={submitting || cart.length === 0}
                      className={`w-full py-4 rounded-2xl text-white font-black text-sm shadow-xl flex items-center justify-center gap-2 transition-all active:scale-95 ${
                          submitting || cart.length === 0
                          ? 'bg-gray-300 cursor-not-allowed shadow-none' 
                          : 'bg-blue-600 hover:bg-blue-700 hover:shadow-blue-500/30'
                      }`}
                  >
                      {submitting ? 'PROCESSING ENGINE...' : '🚀 CONFIRM PURCHASE'}
                  </button>
              </div>
           </div>
        </div>

      </div>
      )}

      {/* ==============================
          TAB 2: PURCHASE HISTORY 
          ============================== */}
      {activeTab === 'history' && (
      <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-gray-100 animate-in fade-in h-[calc(100vh-180px)] flex flex-col relative">
         
         {/* History Header & Search */}
         <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 flex-none">
             <div>
                 <h2 className="text-xl font-black text-gray-800 tracking-tight flex items-center gap-2 uppercase">
                     <ClipboardDocumentListIcon className="w-7 h-7 text-purple-600" />
                     Recent Purchases
                 </h2>
             </div>
             <div className="relative w-full sm:w-80">
                 <input 
                     type="text" 
                     placeholder="Search date, product, supplier, invoice..." 
                     className="w-full pl-10 p-3.5 border border-gray-200 rounded-2xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50/50 transition-all"
                     value={historySearchTerm}
                     onChange={(e) => setHistorySearchTerm(e.target.value)}
                 />
                 <span className="absolute left-3.5 top-4 text-gray-400"><MagnifyingGlassIcon className="w-5 h-5"/></span>
             </div>
         </div>

         <div className="flex-1 overflow-auto custom-scrollbar border border-gray-100 rounded-3xl">
             <table className="w-full text-left whitespace-nowrap min-w-[1050px]">
                 <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest sticky top-0 z-10 shadow-sm border-b border-gray-100">
                     <tr>
                         <th className="p-5 w-32">Date</th>
                         <th className="p-5 w-64">Supplier</th>
                         <th className="p-5 flex-1">Product</th>
                         <th className="p-5 text-center w-24">Qty</th>
                         <th className="p-5 text-center w-24">UOM</th>
                         <th className="p-5 text-right w-32">Cost (RM)</th>
                         <th className="p-5 w-32">Invoice/Ref</th>
                         <th className="p-5 text-right pr-6 w-32">Actions</th>
                     </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-50 text-sm font-bold text-gray-700">
                     {displayedHistory.map((item) => (
                         <tr key={item.id} className="hover:bg-purple-50/30 transition-colors group/row">
                             {/* Date */}
                             <td className="p-4 pl-5 text-gray-500 font-mono text-xs">
                                 {new Date(item.Timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                             </td>
                             
                             {/* Supplier */}
                             <td className="p-4">
                                 {editingId === item.id ? (
                                     <select 
                                        className="p-2 border border-purple-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 w-full font-black uppercase text-xs shadow-sm"
                                        value={editData.Supplier}
                                        onChange={e => setEditData({...editData, Supplier: e.target.value})}
                                     >
                                        <option value="">Select...</option>
                                        {suppliers.map(s => <option key={s.SupplierName} value={s.SupplierName}>{s.SupplierName}</option>)}
                                     </select>
                                 ) : (
                                     <span className="font-black text-gray-800 uppercase">{item.Supplier}</span>
                                 )}
                             </td>

                             {/* Product */}
                             <td className="p-4">
                                 {editingId === item.id ? (
                                     <HistoryProductSelect 
                                         currentProductCode={editData.ProductCode}
                                         products={products}
                                         onChange={(code, name) => setEditData({...editData, ProductCode: code, ProductName: name})}
                                     />
                                 ) : (
                                     <>
                                         <div className="font-black text-gray-800 uppercase leading-tight">{item.ProductName}</div>
                                         <div className="text-[10px] text-gray-400 font-mono mt-0.5 tracking-tighter">{item.ProductCode}</div>
                                     </>
                                 )}
                             </td>

                             {/* Qty */}
                             <td className="p-4 text-center">
                                 {editingId === item.id ? (
                                     <input 
                                        type="number" 
                                        className="p-2 border border-purple-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 w-20 text-center font-black shadow-sm"
                                        value={editData.PurchaseQty}
                                        onChange={e => setEditData({...editData, PurchaseQty: e.target.value})}
                                     />
                                 ) : (
                                     <span className="font-black text-gray-800 bg-gray-100 px-3 py-1 rounded-full">{item.PurchaseQty}</span>
                                 )}
                             </td>

                             {/* UOM */}
                             <td className="p-4 text-center">
                                 {editingId === item.id ? (
                                     <input 
                                        type="text" 
                                        className="p-2 border border-purple-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 w-20 text-center font-bold uppercase shadow-sm"
                                        value={editData.PurchaseUOM}
                                        onChange={e => setEditData({...editData, PurchaseUOM: e.target.value.toUpperCase()})}
                                     />
                                 ) : (
                                     <span className="font-bold text-gray-500 uppercase">{item.PurchaseUOM}</span>
                                 )}
                             </td>

                             {/* Cost */}
                             <td className="p-4 text-right">
                                 {editingId === item.id ? (
                                     <input 
                                        type="number" 
                                        step="0.01"
                                        className="p-2 border border-purple-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 w-24 text-right font-black text-red-600 shadow-sm"
                                        value={editData.CostPrice}
                                        onChange={e => setEditData({...editData, CostPrice: e.target.value})}
                                     />
                                 ) : (
                                     <span className="font-black text-red-600">{Number(item.CostPrice).toFixed(2)}</span>
                                 )}
                             </td>

                             {/* Invoice */}
                             <td className="p-4">
                                 {editingId === item.id ? (
                                     <input 
                                        type="text" 
                                        className="p-2 border border-purple-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 w-full uppercase text-xs shadow-sm"
                                        value={editData.InvoiceNumber}
                                        onChange={e => setEditData({...editData, InvoiceNumber: e.target.value})}
                                     />
                                 ) : (
                                     <span className="text-gray-500 font-mono text-[10px] bg-gray-50 px-2 py-1 rounded-lg border border-gray-100">{item.InvoiceNumber || '-'}</span>
                                 )}
                             </td>

                             {/* Actions */}
                             <td className="p-4 text-center pr-6">
                                 {editingId === item.id ? (
                                     <div className="flex items-center justify-end gap-1 w-full">
                                         <button onClick={handleSaveEdit} className="p-1.5 text-green-600 bg-green-50 hover:bg-green-100 rounded-lg transition"><CheckIcon className="w-5 h-5" /></button>
                                         <button onClick={cancelEditing} className="p-1.5 text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg transition"><XMarkIcon className="w-5 h-5" /></button>
                                     </div>
                                 ) : (
                                     <div className="flex items-center justify-end gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity w-full">
                                         <button onClick={() => startEditing(item)} className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition"><PencilSquareIcon className="w-5 h-5" /></button>
                                         <button onClick={() => handleDeletePurchase(item.id)} className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition"><TrashIcon className="w-5 h-5" /></button>
                                     </div>
                                 )}
                             </td>
                         </tr>
                     ))}
                     {displayedHistory.length === 0 && (
                         <tr>
                             <td colSpan="8" className="p-16 text-center text-gray-300 italic font-bold">No purchase records found matching your search.</td>
                         </tr>
                     )}
                 </tbody>
             </table>
         </div>
      </div>
      )}

    </div>
  );
}