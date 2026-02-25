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
  XMarkIcon 
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
                className="p-1.5 border border-purple-300 rounded outline-none focus:ring-1 focus:ring-purple-500 w-full font-bold uppercase bg-white cursor-pointer text-xs flex justify-between items-center"
            >
                <span className="truncate">{displayName}</span>
                <span className="text-[10px] text-gray-400 ml-1 shrink-0">▼</span>
            </div>
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
                    <div className="absolute z-50 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-xl flex flex-col overflow-hidden">
                        <div className="p-2 border-b border-gray-100 bg-gray-50">
                            <input 
                                type="text"
                                autoFocus
                                placeholder="Search product..."
                                className="w-full p-1.5 border border-gray-200 rounded text-xs outline-none focus:ring-1 focus:ring-purple-500"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                        <div className="max-h-48 overflow-y-auto custom-scrollbar">
                            {filteredProducts.map(p => (
                                <div 
                                    key={p.ProductCode}
                                    className="p-2 hover:bg-purple-50 cursor-pointer text-xs border-b border-gray-50 last:border-0"
                                    onClick={() => {
                                        onChange(p.ProductCode, p.ProductName);
                                        setIsOpen(false);
                                        setSearch('');
                                    }}
                                >
                                    <div className="font-bold text-gray-800 uppercase">{p.ProductName}</div>
                                    <div className="text-[9px] text-gray-400 font-mono">{p.ProductCode}</div>
                                </div>
                            ))}
                            {filteredProducts.length === 0 && (
                                <div className="p-3 text-center text-xs text-gray-400">No products found</div>
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
        .limit(5000); // Fetch a large batch to allow comprehensive searching
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

    const exists = cart.find(item => item.ProductCode === product.ProductCode);
    if (exists) {
      alert("Item already in list!");
      return;
    }

    const newItem = {
      ...product,
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

  const removeFromCart = (code) => {
    setCart(cart.filter(item => item.ProductCode !== code));
  };

  const handleSubmit = async () => {
    if (!selectedSupplier || !purchaseDate || cart.length === 0) {
      alert("Please select a supplier, date, and items.");
      return;
    }

    setSubmitting(true);

    const purchaseRows = cart.map(item => ({
      "Timestamp": new Date(`${purchaseDate}T12:00:00`), // Use selected date
      "ProductCode": item.ProductCode,
      "ProductName": item.ProductName,
      "Supplier": selectedSupplier,
      "PurchaseQty": item.qty,
      "PurchaseUOM": item.uom,
      "CostPrice": item.cost,
      "InvoiceNumber": invoiceNumber || "",
      "LoggedBy": currentUser 
    }));

    const { error } = await supabase.from('Purchase').insert(purchaseRows);

    if (error) {
      alert("Error logging purchase: " + error.message);
      setSubmitting(false);
    } else {
      alert("Purchase Logged Successfully!");
      setCart([]);
      setInvoiceNumber('');
      setSubmitting(false);
      fetchPurchaseHistory(); // Refresh history table
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

  // Limit direct view to 50 items, but allow full results if searching
  const displayedHistory = historySearchTerm ? filteredPurchaseHistory : filteredPurchaseHistory.slice(0, 50);

  const getStockColor = (balance) => {
    if (balance === null || balance === undefined) return 'bg-gray-100 text-gray-500'; 
    const qty = Number(balance);
    if (qty < 20) return 'bg-red-100 text-red-600';
    if (qty <= 50) return 'bg-orange-100 text-orange-600';
    return 'bg-green-100 text-green-600';
  };

  if (loading) return <div className="p-10 flex items-center justify-center h-screen text-gray-500 font-bold">Loading...</div>;

  return (
    <div className="p-3 md:p-6 max-w-full overflow-x-hidden pt-16 md:pt-6 bg-gray-50 min-h-screen">
      
      {/* Page Header */}
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
         <div>
             <h1 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight">Purchase Hub</h1>
             <p className="text-[10px] md:text-xs text-gray-400 font-bold uppercase mt-1">Record and manage incoming stock costs</p>
         </div>
         <div className="text-[9px] md:text-xs font-bold text-gray-500 bg-white border border-gray-200 px-3 py-1.5 rounded-full uppercase shadow-sm">
             Logged as: {currentUser}
         </div>
      </div>

      {/* TABS */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 border-b border-gray-200">
          <button 
              onClick={() => setActiveTab('new')} 
              className={`px-5 py-2.5 rounded-t-xl font-bold text-sm transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === 'new' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-100'}`}
          >
              <ShoppingBagIcon className="w-5 h-5" /> Log New Purchase
          </button>
          <button 
              onClick={() => setActiveTab('history')} 
              className={`px-5 py-2.5 rounded-t-xl font-bold text-sm transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === 'history' ? 'bg-purple-600 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-100'}`}
          >
              <ClipboardDocumentListIcon className="w-5 h-5" /> Purchase History
          </button>
      </div>

      {/* ==============================
          TAB 1: LOG NEW PURCHASE 
          ============================== */}
      {activeTab === 'new' && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 animate-in fade-in">
        
        {/* --- LEFT COLUMN --- */}
        <div className="lg:col-span-2 space-y-4 md:space-y-6">
          
          {/* 1. Purchase Details Card */}
          <div className="bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-[10px] md:text-xs font-black text-gray-400 uppercase tracking-widest mb-3 border-b border-gray-50 pb-2">Purchase Details</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
               
               {/* Supplier Name */}
               <div className="col-span-1 md:col-span-2">
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Supplier Name</label>
                  <input 
                    list="supplier-list"
                    type="text"
                    className="w-full border border-gray-200 rounded-xl p-2.5 text-base md:text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all uppercase bg-gray-50/50"
                    value={selectedSupplier}
                    onChange={(e) => setSelectedSupplier(e.target.value)}
                    placeholder="SEARCH SUPPLIER..."
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
                    className="w-full border border-gray-200 rounded-xl p-2.5 text-base md:text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    value={purchaseDate}
                    onChange={e => setPurchaseDate(e.target.value)}
                  />
               </div>

               {/* Invoice No */}
               <div className="col-span-1">
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Invoice / Ref No.</label>
                  <input 
                    type="text" 
                    className="w-full border border-gray-200 rounded-xl p-2.5 text-base md:text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all uppercase"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="Optional"
                  />
               </div>
            </div>
          </div>

          {/* 2. Product Search & Selection */}
          <div className="space-y-3">
             {/* Search Input */}
             <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <span className="text-gray-400 text-lg">🔍</span>
                </div>
                <input 
                  type="text"
                  placeholder="Search product to add..."
                  className="w-full pl-10 p-3 md:p-4 border border-gray-200 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-base md:text-sm font-medium bg-white"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
             </div>

             {/* Product Grid */}
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                {filteredProducts.slice(0, 10).map(p => {
                    const inputs = productInputs[p.ProductCode] || {};
                    const uomOptions = p.AllowedUOMs 
                      ? p.AllowedUOMs.split(',').map(u => u.trim().toUpperCase()).filter(u => u)
                      : [p.BaseUOM];
                    const stockClass = getStockColor(p.StockBalance);

                    return (
                      <div key={p.ProductCode} className="bg-white p-3 md:p-4 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
                         {/* Stock Badge */}
                         <div className={`absolute top-0 right-0 px-2 md:px-3 py-1 rounded-bl-xl text-[8px] md:text-[9px] font-black uppercase tracking-wider ${stockClass}`}>
                            {p.StockBalance ? `${Number(p.StockBalance).toFixed(2)} ${p.BaseUOM}` : 'No Stock'}
                         </div>

                         <h3 className="font-bold text-gray-800 text-[13px] md:text-sm mb-0.5 pr-14 leading-tight uppercase">{p.ProductName}</h3>
                         <p className="text-[9px] md:text-[10px] text-gray-400 font-mono mb-3 md:mb-4">{p.ProductCode}</p>

                         {/* Controls */}
                         <div className="flex gap-2 mb-2 md:mb-3">
                            {/* UOM Select */}
                            <select 
                              className="bg-gray-50 border border-gray-200 rounded-xl text-base md:text-[10px] p-2 flex-1 font-black focus:outline-none focus:ring-1 focus:ring-blue-500 uppercase"
                              value={inputs.uom || p.BaseUOM}
                              onChange={(e) => handleProductInputChange(p.ProductCode, 'uom', e.target.value)}
                            >
                              {uomOptions.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>

                            {/* Qty Input */}
                            <div className="relative w-20 md:w-24">
                               <input 
                                  type="number" 
                                  placeholder="Qty" 
                                  className="w-full bg-white border border-gray-200 rounded-xl text-base md:text-xs p-2 font-black focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
                                  value={inputs.qty || ''}
                                  onChange={(e) => handleProductInputChange(p.ProductCode, 'qty', e.target.value)}
                               />
                            </div>
                         </div>

                         {/* Cost & Add */}
                         <div className="flex items-center gap-2 md:gap-3">
                            {/* Cost Input */}
                            <div className="relative flex-1">
                               <span className="absolute left-2.5 top-2.5 text-[9px] md:text-[10px] text-gray-400 font-black">COST</span>
                               <input 
                                 type="number" 
                                 placeholder="0.00" 
                                 className="w-full pl-10 pr-2 py-2 text-base md:text-xs border border-gray-200 rounded-xl bg-gray-50/50 text-right focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-gray-700" 
                                 value={inputs.cost || ''}
                                 onChange={(e) => handleProductInputChange(p.ProductCode, 'cost', e.target.value)}
                               />
                            </div>

                            <button 
                              onClick={() => addToCart(p)}
                              className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl w-10 h-10 md:w-10 md:h-10 flex items-center justify-center font-bold text-lg md:text-xl shadow-lg transform transition active:scale-90"
                            >
                              +
                            </button>
                         </div>
                      </div>
                    );
                })}
                {filteredProducts.length === 0 && searchTerm && (
                    <div className="col-span-full p-8 text-center text-gray-400 italic bg-white rounded-xl border border-dashed border-gray-200">
                        No products found matching "{searchTerm}"
                    </div>
                )}
             </div>
          </div>
        </div>

        {/* --- RIGHT COLUMN (Cart) --- */}
        <div className="lg:col-span-1">
           <div className="bg-white p-4 md:p-6 rounded-3xl shadow-xl border border-gray-100 sticky top-4 flex flex-col md:h-[calc(100vh-4rem)] min-h-[400px]">
              <div className="flex justify-between items-center mb-4 md:mb-6">
                 <h2 className="text-base md:text-lg font-black text-gray-800 tracking-tight">Purchasing List</h2>
                 <span className="bg-blue-50 text-blue-600 text-[10px] md:text-xs font-black px-2.5 py-1 rounded-full">{cart.length} items</span>
              </div>

              {/* Cart Items List */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar mb-4 md:mb-6">
                  {cart.length === 0 ? (
                      <div className="h-32 md:h-48 flex flex-col items-center justify-center text-gray-300 italic text-sm border-2 border-dashed border-gray-100 rounded-3xl">
                         <span className="text-3xl md:text-4xl mb-2 grayscale opacity-30">🛒</span>
                         Cart is empty
                      </div>
                  ) : (
                      cart.map((item, idx) => (
                         <div key={`${item.ProductCode}-${idx}`} className="p-3 md:p-4 rounded-2xl bg-gray-50/80 border border-gray-100 relative group transition-all hover:bg-white hover:shadow-md">
                             <div className="flex justify-between items-start mb-1 md:mb-2">
                                 <div className="pr-6">
                                     <div className="text-[11px] md:text-xs font-black text-gray-800 line-clamp-2 leading-tight uppercase">{item.ProductName}</div>
                                     <div className="text-[9px] md:text-[10px] text-gray-400 font-mono mt-0.5">{item.ProductCode}</div>
                                 </div>
                                 <button 
                                   onClick={() => removeFromCart(item.ProductCode)}
                                   className="text-gray-300 hover:text-red-500 font-bold p-1 transition-colors absolute top-2 right-2 md:top-3 md:right-3"
                                 >
                                   ✕
                                 </button>
                             </div>
                             
                             <div className="flex items-center justify-between mt-2 md:mt-3">
                                 <div className="text-[10px] md:text-xs font-black text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 md:py-1 rounded-lg">
                                     {item.qty} {item.uom}
                                 </div>
                                 
                                 <div className="flex items-center gap-1">
                                    <span className="text-[8px] md:text-[9px] font-black text-gray-400">COST:</span>
                                    <span className="text-[10px] md:text-[11px] font-black text-gray-700 bg-white border border-gray-200 px-2 py-0.5 md:py-1 rounded-lg">
                                        RM {(item.cost || 0).toFixed(2)}
                                    </span>
                                 </div>
                             </div>
                         </div>
                      ))
                  )}
              </div>

              {/* Footer Actions */}
              <div className="mt-auto pt-4 md:pt-6 border-t border-gray-100 space-y-3 md:space-y-4">
                  <div className="flex justify-between items-center text-xs md:text-sm font-black text-gray-800 px-1">
                      <span>Total Items:</span>
                      <span>{cart.length}</span>
                  </div>

                  <button 
                      onClick={handleSubmit}
                      disabled={submitting || cart.length === 0}
                      className={`w-full py-3 md:py-4 rounded-2xl text-white font-black text-base md:text-sm shadow-xl transform transition-all active:scale-95 ${
                          submitting || cart.length === 0
                          ? 'bg-gray-300 cursor-not-allowed shadow-none' 
                          : 'bg-blue-600 hover:bg-blue-700 hover:shadow-blue-500/30'
                      }`}
                  >
                      {submitting ? 'Logging...' : 'Confirm Purchase'}
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
      <div className="bg-white p-4 md:p-6 rounded-3xl shadow-xl border border-gray-100 animate-in fade-in h-[calc(100vh-180px)] flex flex-col">
         
         {/* History Header & Search */}
         <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
             <h2 className="text-lg font-black text-gray-800 tracking-tight flex items-center gap-2">
                 <ClipboardDocumentListIcon className="w-6 h-6 text-purple-600" />
                 Recent Purchases
             </h2>
             <div className="relative w-full sm:w-72">
                 <input 
                     type="text" 
                     placeholder="Search date, product, supplier, invoice..." 
                     className="w-full pl-10 p-2.5 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50/50 transition-all"
                     value={historySearchTerm}
                     onChange={(e) => setHistorySearchTerm(e.target.value)}
                 />
                 <span className="absolute left-3 top-3 text-gray-400">🔍</span>
             </div>
         </div>

         <div className="flex-1 overflow-auto custom-scrollbar border border-gray-100 rounded-2xl pb-32">
             <table className="w-full text-left whitespace-nowrap min-w-[800px]">
                 <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-wider sticky top-0 z-10 shadow-sm">
                     <tr>
                         <th className="p-3 pl-4">Date</th>
                         <th className="p-3">Supplier</th>
                         <th className="p-3">Product</th>
                         <th className="p-3 text-center">Qty</th>
                         <th className="p-3 text-center">UOM</th>
                         <th className="p-3 text-right">Cost (RM)</th>
                         <th className="p-3">Invoice/Ref</th>
                         <th className="p-3 text-center pr-4">Actions</th>
                     </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-50 text-xs font-medium text-gray-700">
                     {displayedHistory.map((item) => (
                         <tr key={item.id} className="hover:bg-purple-50/30 transition-colors group">
                             {/* Date */}
                             <td className="p-3 pl-4 text-gray-500 font-mono text-[10px]">
                                 {new Date(item.Timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                             </td>
                             
                             {/* Supplier */}
                             <td className="p-3">
                                 {editingId === item.id ? (
                                     <select 
                                        className="p-1.5 border border-purple-300 rounded outline-none focus:ring-1 focus:ring-purple-500 w-full font-bold uppercase"
                                        value={editData.Supplier}
                                        onChange={e => setEditData({...editData, Supplier: e.target.value})}
                                     >
                                        <option value="">Select...</option>
                                        {suppliers.map(s => <option key={s.SupplierName} value={s.SupplierName}>{s.SupplierName}</option>)}
                                     </select>
                                 ) : (
                                     <span className="font-bold text-gray-800 uppercase">{item.Supplier}</span>
                                 )}
                             </td>

                             {/* Product - Now Editable via Custom Select */}
                             <td className="p-3">
                                 {editingId === item.id ? (
                                     <HistoryProductSelect 
                                         currentProductCode={editData.ProductCode}
                                         products={products}
                                         onChange={(code, name) => setEditData({...editData, ProductCode: code, ProductName: name})}
                                     />
                                 ) : (
                                     <>
                                         <div className="font-bold text-gray-800 uppercase">{item.ProductName}</div>
                                         <div className="text-[9px] text-gray-400 font-mono mt-0.5">{item.ProductCode}</div>
                                     </>
                                 )}
                             </td>

                             {/* Qty */}
                             <td className="p-3 text-center">
                                 {editingId === item.id ? (
                                     <input 
                                        type="number" 
                                        className="p-1.5 border border-purple-300 rounded outline-none focus:ring-1 focus:ring-purple-500 w-16 text-center font-bold"
                                        value={editData.PurchaseQty}
                                        onChange={e => setEditData({...editData, PurchaseQty: e.target.value})}
                                     />
                                 ) : (
                                     <span className="font-black text-gray-800 bg-gray-100 px-2 py-1 rounded-lg">{item.PurchaseQty}</span>
                                 )}
                             </td>

                             {/* UOM */}
                             <td className="p-3 text-center">
                                 {editingId === item.id ? (
                                     <input 
                                        type="text" 
                                        className="p-1.5 border border-purple-300 rounded outline-none focus:ring-1 focus:ring-purple-500 w-16 text-center font-bold uppercase"
                                        value={editData.PurchaseUOM}
                                        onChange={e => setEditData({...editData, PurchaseUOM: e.target.value.toUpperCase()})}
                                     />
                                 ) : (
                                     <span className="font-bold text-gray-500 uppercase">{item.PurchaseUOM}</span>
                                 )}
                             </td>

                             {/* Cost */}
                             <td className="p-3 text-right">
                                 {editingId === item.id ? (
                                     <input 
                                        type="number" 
                                        step="0.01"
                                        className="p-1.5 border border-purple-300 rounded outline-none focus:ring-1 focus:ring-purple-500 w-20 text-right font-black text-red-600"
                                        value={editData.CostPrice}
                                        onChange={e => setEditData({...editData, CostPrice: e.target.value})}
                                     />
                                 ) : (
                                     <span className="font-black text-red-600">{Number(item.CostPrice).toFixed(2)}</span>
                                 )}
                             </td>

                             {/* Invoice */}
                             <td className="p-3">
                                 {editingId === item.id ? (
                                     <input 
                                        type="text" 
                                        className="p-1.5 border border-purple-300 rounded outline-none focus:ring-1 focus:ring-purple-500 w-full uppercase text-xs"
                                        value={editData.InvoiceNumber}
                                        onChange={e => setEditData({...editData, InvoiceNumber: e.target.value})}
                                     />
                                 ) : (
                                     <span className="text-gray-400 font-mono text-[10px] bg-gray-50 px-2 py-1 rounded">{item.InvoiceNumber || '-'}</span>
                                 )}
                             </td>

                             {/* Actions */}
                             <td className="p-3 text-center pr-4">
                                 {editingId === item.id ? (
                                     <div className="flex items-center justify-center gap-2">
                                         <button onClick={handleSaveEdit} className="p-1.5 bg-green-100 text-green-600 hover:bg-green-200 rounded transition"><CheckIcon className="w-4 h-4" /></button>
                                         <button onClick={cancelEditing} className="p-1.5 bg-gray-100 text-gray-500 hover:bg-gray-200 rounded transition"><XMarkIcon className="w-4 h-4" /></button>
                                     </div>
                                 ) : (
                                     <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                         <button onClick={() => startEditing(item)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"><PencilSquareIcon className="w-4 h-4" /></button>
                                         <button onClick={() => handleDeletePurchase(item.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"><TrashIcon className="w-4 h-4" /></button>
                                     </div>
                                 )}
                             </td>
                         </tr>
                     ))}
                     {displayedHistory.length === 0 && (
                         <tr>
                             <td colSpan="8" className="p-10 text-center text-gray-400 italic">No purchase records found matching your search.</td>
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