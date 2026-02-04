'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Sidebar from '../../components/Sidebar';

export default function NewPurchasePage() {
  const router = useRouter();
  
  // Data States
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
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
  // Key: ProductCode, Value: { qty: number, uom: string, cost: number }
  const [productInputs, setProductInputs] = useState({});

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
      setLoading(false);
    }
    loadData();
  }, []);

  // Handle inputs for individual product cards
  const handleProductInputChange = (code, field, value) => {
    setProductInputs(prev => ({
      ...prev,
      [code]: { ...prev[code], [field]: value }
    }));
  };

  // Add Item to Cart
  const addToCart = (product) => {
    const inputs = productInputs[product.ProductCode] || {};
    const qty = parseFloat(inputs.qty);
    // Use inputted cost, or default to 0
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
    
    // Clear inputs for this product
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

  // Submit Purchase
  const handleSubmit = async () => {
    if (!selectedSupplier || !purchaseDate || cart.length === 0) {
      alert("Please select a supplier, date, and items.");
      return;
    }

    setSubmitting(true);

    const purchaseRows = cart.map(item => ({
      "Timestamp": new Date(), 
      "ProductCode": item.ProductCode,
      "ProductName": item.ProductName,
      "Supplier": selectedSupplier,
      "PurchaseQty": item.qty,
      "PurchaseUOM": item.uom,
      "CostPrice": item.cost,
      "InvoiceNumber": invoiceNumber || "",
      "LoggedBy": currentUser // Use automatically captured user
    }));

    // Insert into 'Purchase' table
    const { error } = await supabase.from('Purchase').insert(purchaseRows);

    if (error) {
      alert("Error logging purchase: " + error.message);
      setSubmitting(false);
    } else {
      alert("Purchase Logged Successfully!");
      // Reset form
      setCart([]);
      setInvoiceNumber('');
      setSubmitting(false);
    }
  };

  const filteredProducts = products.filter(p => {
    if (!searchTerm) return false;
    const lowerTerm = searchTerm.toLowerCase();
    const searchParts = lowerTerm.split(' '); 
    const combinedText = (p.ProductName + ' ' + p.ProductCode + ' ' + (p.Category || '')).toLowerCase();
    return searchParts.every(part => combinedText.includes(part));
  });

  const getStockColor = (balance) => {
    if (balance === null || balance === undefined) return 'bg-gray-100 text-gray-500'; 
    const qty = Number(balance);
    if (qty < 20) return 'bg-red-100 text-red-600';
    if (qty <= 50) return 'bg-orange-100 text-orange-600';
    return 'bg-green-100 text-green-600';
  };

  if (loading) return <div className="p-10 flex items-center justify-center h-screen text-gray-500 font-bold">Loading...</div>;

  return (
    <div className="flex bg-gray-50 min-h-screen font-sans text-gray-800">
      <Sidebar />
      <main className="ml-64 flex-1 p-8">
        
        {/* Page Header */}
        <div className="mb-4 flex justify-between items-end">
           <div>
               <h1 className="text-xl font-black text-gray-800 tracking-tight">Log New Purchase</h1>
               <p className="text-xs text-gray-400 font-medium">Record incoming stock and costs.</p>
           </div>
           {/* Display Logged In User */}
           <div className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full uppercase">
               Logged as: {currentUser}
           </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* --- LEFT COLUMN (2/3 width) --- */}
          <div className="lg:col-span-2 space-y-4">
            
            {/* 1. Purchase Details Card */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
              <h2 className="text-xs font-bold text-gray-800 mb-3 border-b border-gray-100 pb-1">Purchase Details</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                 
                 {/* Supplier Name */}
                 <div className="col-span-1 md:col-span-2">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Supplier Name</label>
                    <input 
                      list="supplier-list"
                      type="text"
                      className="w-full border border-gray-200 rounded p-2 text-xs font-medium focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all uppercase"
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
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Date</label>
                    <input 
                      type="date" 
                      className="w-full border border-gray-200 rounded p-2 text-xs focus:outline-none focus:border-blue-500 transition-all"
                      value={purchaseDate}
                      onChange={e => setPurchaseDate(e.target.value)}
                    />
                 </div>

                 {/* Invoice No */}
                 <div className="col-span-1">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Invoice / Ref No.</label>
                    <input 
                      type="text" 
                      className="w-full border border-gray-200 rounded p-2 text-xs focus:outline-none focus:border-blue-500 transition-all uppercase"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      placeholder="Optional"
                    />
                 </div>
              </div>
            </div>

            {/* 2. Product Search & Selection */}
            <div>
               {/* Search Input */}
               <div className="relative mb-4">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-gray-400 text-lg">🔍</span>
                  </div>
                  <input 
                    type="text"
                    placeholder="Search product to add..."
                    className="w-full pl-10 p-3.5 border border-gray-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
               </div>

               {/* Product Grid */}
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredProducts.slice(0, 10).map(p => {
                      const inputs = productInputs[p.ProductCode] || {};
                      const uomOptions = p.AllowedUOMs 
                        ? p.AllowedUOMs.split(',').map(u => u.trim().toUpperCase()).filter(u => u)
                        : [p.BaseUOM];
                      const stockClass = getStockColor(p.StockBalance);

                      return (
                        <div key={p.ProductCode} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                           {/* Stock Badge */}
                           <div className={`absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${stockClass}`}>
                              {p.StockBalance ? `${Number(p.StockBalance).toFixed(2)} ${p.BaseUOM}` : 'No Stock'}
                           </div>

                           <h3 className="font-bold text-gray-800 text-sm mb-0.5 pr-16">{p.ProductName}</h3>
                           <p className="text-[10px] text-gray-400 font-mono mb-3">{p.ProductCode}</p>

                           {/* Controls */}
                           <div className="flex gap-2 mb-2">
                              {/* UOM Select */}
                              <select 
                                className="bg-gray-50 border border-gray-200 rounded-lg text-xs p-1.5 flex-1 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 uppercase"
                                value={inputs.uom || p.BaseUOM}
                                onChange={(e) => handleProductInputChange(p.ProductCode, 'uom', e.target.value)}
                              >
                                {uomOptions.map(u => <option key={u} value={u}>{u}</option>)}
                              </select>

                              {/* Qty Input */}
                              <div className="relative w-20">
                                 <input 
                                    type="number" 
                                    placeholder="Qty" 
                                    className="w-full bg-white border border-gray-200 rounded-lg text-xs p-1.5 pl-2 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 text-center"
                                    value={inputs.qty || ''}
                                    onChange={(e) => handleProductInputChange(p.ProductCode, 'qty', e.target.value)}
                                 />
                              </div>
                           </div>

                           {/* Cost & Add */}
                           <div className="flex items-center gap-2">
                              {/* Cost Input */}
                              <div className="relative flex-1">
                                 <span className="absolute left-2 top-1 text-[10px] text-gray-400 font-bold">COST</span>
                                 <input 
                                   type="number" 
                                   placeholder="0.00" 
                                   className="w-full pl-10 pr-1 py-1 text-xs border rounded bg-white text-right focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold text-gray-700" 
                                   value={inputs.cost || ''}
                                   onChange={(e) => handleProductInputChange(p.ProductCode, 'cost', e.target.value)}
                                 />
                              </div>

                              <button 
                                onClick={() => addToCart(p)}
                                className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg w-8 h-8 flex items-center justify-center font-bold text-lg shadow-sm transition-colors active:scale-95"
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
             <div className="bg-white p-6 rounded-2xl shadow-xl border border-gray-100 sticky top-4 flex flex-col h-[calc(100vh-4rem)]">
                <div className="flex justify-between items-center mb-4">
                   <h2 className="text-lg font-bold text-gray-800">Purchasing List</h2>
                   <span className="bg-gray-100 text-gray-600 text-xs font-black px-2.5 py-1 rounded-full">{cart.length}</span>
                </div>

                {/* Cart Items List */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar mb-4">
                    {cart.length === 0 ? (
                        <div className="h-40 flex items-center justify-center text-gray-300 italic text-sm border-2 border-dashed border-gray-100 rounded-xl">
                           Empty
                        </div>
                    ) : (
                        cart.map((item, idx) => (
                           <div key={`${item.ProductCode}-${idx}`} className="p-3 rounded-xl bg-gray-50 border border-gray-100 relative group transition-all hover:bg-white hover:shadow-sm">
                               <div className="flex justify-between items-start mb-1">
                                   <div className="pr-6">
                                       <div className="text-xs font-bold text-gray-800 line-clamp-2 leading-tight">{item.ProductName}</div>
                                       <div className="text-[10px] text-gray-400 font-mono mt-0.5">{item.ProductCode}</div>
                                   </div>
                                   <button 
                                     onClick={() => removeFromCart(item.ProductCode)}
                                     className="text-gray-300 hover:text-red-500 font-bold px-1 transition-colors absolute top-2 right-2"
                                   >
                                     ✕
                                   </button>
                               </div>
                               
                               <div className="flex items-center justify-between mt-2">
                                   <div className="text-xs font-black text-gray-600 bg-white border border-gray-200 px-2 py-1 rounded">
                                       {item.qty} {item.uom}
                                   </div>
                                   
                                   <div className="flex items-center gap-1">
                                      <span className="text-[9px] font-bold text-gray-400">COST:</span>
                                      <span className="text-[10px] font-bold text-gray-700 bg-white border border-gray-200 px-1.5 py-0.5 rounded">
                                          RM {(item.cost || 0).toFixed(2)}
                                      </span>
                                   </div>
                               </div>
                           </div>
                        ))
                    )}
                </div>

                {/* Footer Actions */}
                <div className="mt-auto pt-4 border-t border-gray-100">
                    <button 
                        onClick={handleSubmit}
                        disabled={submitting || cart.length === 0}
                        className={`w-full py-3.5 rounded-xl text-white font-bold text-sm shadow-lg transform transition-all active:scale-95 ${
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
      </main>
    </div>
  );
}