'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function NewOrderPage() {
  const router = useRouter();
  
  // Data States
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // User State
  const [currentUser, setCurrentUser] = useState('');

  // Form States
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [custDetails, setCustDetailsx] = useState({ 
    ContactPerson: '', 
    ContactNumber: '', 
    DeliveryAddress: '' 
  });
  
  // Helper to get local date string (YYYY-MM-DD)
  const getLocalDateString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // 12:00 PM Threshold Logic for Default Date
  const [deliveryDate, setDeliveryDate] = useState(() => {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    
    // If after 12:00:00 PM (12:01 onwards)
    if (hours > 12 || (hours === 12 && minutes > 0)) {
      const tomorrow = new Date();
      tomorrow.setDate(now.getDate() + 1);
      return getLocalDateString(tomorrow);
    }
    // Morning (00:00 - 12:00)
    return getLocalDateString(now);
  });

  const [deliveryMode, setDeliveryMode] = useState('Driver'); 
  const [salesChannel, setSalesChannel] = useState('Online / FnB'); 
  
  // Cart State
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Temporary input state for quantities in the product list
  const [productInputs, setProductInputs] = useState({});

  // 1. Fetch Customers & Products on Load
  useEffect(() => {
    async function loadData() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const email = session.user.email || "";
      const username = email.split('@')[0].toUpperCase();
      setCurrentUser(username);

      const { data: custData } = await supabase
        .from('Customers')
        .select('CompanyName, ContactPerson, DeliveryAddress, ContactNumber')
        .order('CompanyName');

      const { data: prodData } = await supabase
        .from('ProductMaster')
        .select('ProductCode, ProductName, BaseUOM, Category, StockBalance, ReportingUOM, AllowedUOMs')
        .order('ProductName');

      setCustomers(custData || []);
      setProducts(prodData || []);
      setLoading(false);
    }
    loadData();
  }, [router]);

  // Handle Customer Selection
  const handleCustomerChange = (e) => {
    const custName = e.target.value;
    setSelectedCustomer(custName);
    const details = customers.find(c => c.CompanyName.toLowerCase() === custName.toLowerCase());
    
    if (details) {
      setCustDetailsx({
        ContactPerson: details.ContactPerson || '',
        ContactNumber: details.ContactNumber || '',
        DeliveryAddress: details.DeliveryAddress || ''
      });
    }
  };

  const handleDetailChange = (field, value) => {
    setCustDetailsx(prev => ({ ...prev, [field]: value }));
  };

  const handleProductInputChange = (code, field, value) => {
    setProductInputs(prev => ({
      ...prev,
      [code]: { ...prev[code], [field]: value }
    }));
  };

  const addToCart = (product) => {
    const inputs = productInputs[product.ProductCode] || {};
    const qty = parseFloat(inputs.qty);
    const price = inputs.price === undefined || inputs.price === '' ? 0 : parseFloat(inputs.price); 
    
    if (!qty || qty <= 0) return;

    const exists = cart.find(item => item.ProductCode === product.ProductCode);
    if (exists) {
      alert("Item already in cart!");
      return;
    }

    const newItem = {
      ...product,
      qty: qty,
      uom: inputs.uom || product.BaseUOM,
      price: price, 
      notes: '',
      isReplacement: inputs.replacement || false
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

  const updateCartItem = (code, field, value) => {
    setCart(cart.map(item => 
      item.ProductCode === code ? { ...item, [field]: value } : item
    ));
  };

  const handleSubmit = async () => {
    if (!selectedCustomer || !deliveryDate || cart.length === 0) {
      alert("Please select a customer, date, and at least one item.");
      return;
    }

    setSubmitting(true);

    const [year, month, day] = deliveryDate.split('-');
    const dateStr = `${year.slice(2)}${month}${day}`;
    const random = Math.floor(1000 + Math.random() * 9000); 
    const doNumber = `DO-${dateStr}-${random}`;

    const orderRows = cart.map(item => ({
      "Timestamp": new Date(),
      "Status": "Pending",
      "DONumber": doNumber,
      "Delivery Date": deliveryDate,
      "Delivery Mode": deliveryMode,
      "Customer Name": selectedCustomer,
      "Delivery Address": custDetails.DeliveryAddress,
      "Contact Person": custDetails.ContactPerson,
      "Contact Number": custDetails.ContactNumber,
      "Product Code": item.ProductCode,
      "Order Items": item.ProductName,
      "Quantity": item.qty,
      "UOM": item.uom,
      "Price": item.isReplacement ? 0 : item.price,
      "Replacement": item.isReplacement ? "YES" : "",
      "SpecialNotes": item.notes,
      "LoggedBy": currentUser
    }));

    const { error } = await supabase.from('Orders').insert(orderRows);

    if (error) {
      alert("Error creating order: " + error.message);
      setSubmitting(false);
    } else {
      alert(`Order Created! DO Number: ${doNumber}`);
      router.push('/orders/list');
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
    <div className="p-3 md:p-8 max-w-full overflow-x-hidden">
      
      {/* Page Header */}
      <div className="mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2"> 
         <div>
             <h1 className="text-lg md:text-2xl font-black text-gray-800 tracking-tight">Create New Order</h1> 
             <p className="text-[10px] md:text-xs text-gray-400 font-medium">Generate a new delivery order document.</p> 
         </div>
         <div className="text-[9px] md:text-xs font-bold text-gray-500 bg-white border border-gray-200 px-3 py-1 rounded-full uppercase shadow-sm">
             Logged: {currentUser}
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        
        {/* --- LEFT COLUMN --- */}
        <div className="lg:col-span-2 space-y-4 md:space-y-6">
          
          {/* 1. Transaction Details Card */}
          <div className="bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-gray-100"> 
            <h2 className="text-[10px] md:text-xs font-black text-gray-400 uppercase tracking-widest mb-3 border-b border-gray-50 pb-2">1. Transaction Details</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4"> 
               
               <div className="col-span-1">
                   <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Sales Channel</label>
                   <select 
                      className="w-full bg-green-50 border border-green-200 text-green-800 text-base md:text-xs font-bold rounded-xl p-2 focus:outline-none focus:ring-2 focus:ring-green-500 transition-all"
                      value={salesChannel}
                      onChange={(e) => setSalesChannel(e.target.value)}
                   >
                      <option>Online / FnB</option>
                      <option>Wholesale</option>
                      <option>Outlet</option>
                   </select>
               </div>

               <div className="col-span-1 md:col-span-2">
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Company Name</label>
                  <input 
                    list="customer-list"
                    type="text"
                    className="w-full border border-gray-200 rounded-xl p-2 text-base md:text-xs font-bold focus:outline-none focus:ring-2 focus:ring-green-500 transition-all uppercase bg-gray-50/50"
                    value={selectedCustomer}
                    onChange={handleCustomerChange}
                    placeholder="SEARCH CUSTOMER..."
                  />
                  <datalist id="customer-list">
                    {customers.map(c => <option key={c.CompanyName} value={c.CompanyName} />)}
                  </datalist>
               </div>

               <div className="col-span-1">
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Contact Person</label>
                  <input 
                    type="text" 
                    className="w-full border border-gray-200 rounded-xl p-2 text-base md:text-xs focus:outline-none focus:ring-2 focus:ring-green-500 transition-all uppercase"
                    value={custDetails.ContactPerson}
                    onChange={(e) => handleDetailChange('ContactPerson', e.target.value)}
                  />
               </div>

               <div className="col-span-1">
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Contact Number</label>
                  <input 
                    type="text" 
                    className="w-full border border-gray-200 rounded-xl p-2 text-base md:text-xs focus:outline-none focus:ring-2 focus:ring-green-500 transition-all"
                    value={custDetails.ContactNumber}
                    onChange={(e) => handleDetailChange('ContactNumber', e.target.value)}
                  />
               </div>

               <div className="col-span-1">
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Delivery Date</label>
                  <input 
                    type="date" 
                    className="w-full border border-gray-200 rounded-xl p-2 text-base md:text-xs font-bold focus:outline-none focus:ring-2 focus:ring-green-500 transition-all bg-blue-50 text-blue-800"
                    value={deliveryDate}
                    onChange={e => setDeliveryDate(e.target.value)}
                  />
               </div>

               <div className="col-span-1">
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Mode</label>
                  <select 
                    className="w-full border border-gray-200 rounded-xl p-2 text-base md:text-xs font-bold focus:outline-none focus:ring-2 focus:ring-green-500 transition-all"
                    value={deliveryMode}
                    onChange={e => setDeliveryMode(e.target.value)}
                  >
                    <option value="Driver">Driver</option>
                    <option value="Lalamove">Lalamove</option>
                    <option value="Self Pick-up">Self Pick-up</option>
                  </select>
               </div>

               <div className="col-span-1 md:col-span-2">
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Address</label>
                  <input 
                    type="text" 
                    className="w-full border border-gray-200 rounded-xl p-2 text-base md:text-xs focus:outline-none focus:ring-2 focus:ring-green-500 transition-all uppercase bg-gray-50/50"
                    value={custDetails.DeliveryAddress}
                    onChange={(e) => handleDetailChange('DeliveryAddress', e.target.value)}
                  />
               </div>
            </div>
          </div>

          {/* 2. Product Search & Selection */}
          <div className="space-y-3">
             <h2 className="text-[10px] md:text-xs font-black text-gray-400 uppercase tracking-widest mb-1">2. Add Items</h2>
             
             <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <span className="text-gray-400 text-lg">🔍</span>
                </div>
                <input 
                  type="text"
                  placeholder="Search product..."
                  className="w-full pl-10 p-3 md:p-4 border border-gray-200 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 transition-all text-base md:text-sm font-medium bg-white"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
             </div>

             <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                {filteredProducts.slice(0, 10).map(p => {
                    const inputs = productInputs[p.ProductCode] || {};
                    const uomOptions = p.AllowedUOMs 
                      ? p.AllowedUOMs.split(',').map(u => u.trim().toUpperCase()).filter(u => u)
                      : [p.BaseUOM];
                    const stockClass = getStockColor(p.StockBalance);

                    return (
                      <div key={p.ProductCode} className="bg-white p-3 md:p-4 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
                         <div className={`absolute top-0 right-0 px-2 md:px-3 py-1 rounded-bl-xl text-[8px] md:text-[9px] font-black uppercase tracking-wider ${stockClass}`}>
                            {p.StockBalance ? `${Number(p.StockBalance).toFixed(1)} ${p.BaseUOM}` : '0.0'}
                         </div>

                         <h3 className="font-bold text-gray-800 text-[13px] md:text-sm mb-0.5 pr-12 leading-tight uppercase">{p.ProductName}</h3>
                         <p className="text-[9px] md:text-[10px] text-gray-400 font-mono mb-3 md:mb-4">{p.ProductCode}</p>

                         <div className="flex gap-2 mb-2 md:mb-3">
                            <select 
                              className="bg-gray-50 border border-gray-200 rounded-xl text-base md:text-[10px] p-2 flex-1 font-black focus:outline-none focus:ring-1 focus:ring-green-500 uppercase"
                              value={inputs.uom || p.BaseUOM}
                              onChange={(e) => handleProductInputChange(p.ProductCode, 'uom', e.target.value)}
                            >
                              {uomOptions.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>

                            <div className="relative w-24 md:w-24">
                               <input 
                                  type="number" 
                                  placeholder="Qty" 
                                  className="w-full bg-white border border-gray-200 rounded-xl text-base md:text-xs p-2 font-black focus:outline-none focus:ring-2 focus:ring-green-500 text-center"
                                  value={inputs.qty || ''}
                                  onChange={(e) => handleProductInputChange(p.ProductCode, 'qty', e.target.value)}
                               />
                            </div>
                         </div>

                         <div className="flex items-center gap-2 md:gap-3">
                            <label className="flex items-center gap-1 cursor-pointer select-none">
                                <input 
                                  type="checkbox" 
                                  className="w-4 h-4 md:w-4 md:h-4 text-red-500 rounded border-gray-300 focus:ring-red-500 cursor-pointer"
                                  checked={inputs.replacement || false}
                                  onChange={(e) => handleProductInputChange(p.ProductCode, 'replacement', e.target.checked)}
                                />
                                <span className="text-[8px] md:text-[9px] font-black text-red-400 uppercase tracking-widest">Free</span>
                            </label>

                            <div className="flex-1"></div>

                            <div className="relative w-28 md:w-28">
                               <span className="absolute left-2.5 top-2.5 text-[9px] md:text-[10px] text-gray-400 font-black">RM</span>
                               <input 
                                 type="number" 
                                 placeholder="0.00" 
                                 className="w-full pl-8 pr-2 py-2 text-base md:text-xs border border-gray-200 rounded-xl bg-gray-50/50 text-right focus:outline-none focus:ring-2 focus:ring-green-500 font-bold" 
                                 disabled={inputs.replacement}
                                 value={inputs.price || ''}
                                 onChange={(e) => handleProductInputChange(p.ProductCode, 'price', e.target.value)}
                               />
                            </div>

                            <button 
                              onClick={() => addToCart(p)}
                              className="bg-green-600 hover:bg-green-700 text-white rounded-xl w-10 h-10 md:w-10 md:h-10 flex items-center justify-center font-bold text-lg md:text-xl shadow-lg transform transition active:scale-90"
                            >
                              +
                            </button>
                         </div>
                      </div>
                    );
                })}
             </div>
          </div>
        </div>

        {/* --- RIGHT COLUMN (Cart Summary) --- */}
        <div className="lg:col-span-1">
           <div className="bg-white p-4 md:p-6 rounded-3xl shadow-xl border border-gray-100 sticky top-4 flex flex-col md:h-[calc(100vh-4rem)] min-h-[400px]">
              <div className="flex justify-between items-center mb-4 md:mb-6">
                 <h2 className="text-base md:text-lg font-black text-gray-800 tracking-tight">Order Summary</h2>
                 <span className="bg-green-100 text-green-700 text-[10px] md:text-xs font-black px-2.5 py-1 rounded-full">{cart.length} items</span>
              </div>

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
                                 <div className="text-[10px] md:text-xs font-black text-green-700 bg-green-50 border border-green-100 px-2 py-0.5 md:py-1 rounded-lg">
                                     {item.qty} {item.uom}
                                 </div>
                                 
                                 {item.isReplacement ? (
                                     <span className="text-[8px] md:text-[9px] font-black text-white bg-red-400 px-2 py-0.5 md:py-1 rounded-lg uppercase tracking-wider shadow-sm">
                                         FREE
                                     </span>
                                 ) : (
                                     <span className="text-[10px] md:text-[11px] font-black text-gray-700 bg-white border border-gray-200 px-2 py-0.5 md:py-1 rounded-lg">
                                         RM {(item.price || 0).toFixed(2)}
                                     </span>
                                 )}
                             </div>

                             <input 
                                type="text" 
                                placeholder="Add specific item note..." 
                                className="w-full mt-2 md:mt-3 bg-transparent border-b border-gray-200 text-base md:text-[10px] text-gray-600 focus:outline-none focus:border-green-400 pb-1 placeholder-gray-300 italic"
                                value={item.notes || ''}
                                onChange={(e) => updateCartItem(item.ProductCode, 'notes', e.target.value)}
                             />
                         </div>
                      ))
                  )}
              </div>

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
                          : 'bg-green-600 hover:bg-green-700 hover:shadow-green-500/40'
                      }`}
                  >
                      {submitting ? 'Creating Order...' : '🚀 Finalize Order'}
                  </button>
              </div>
           </div>
        </div>

      </div>
    </div>
  );
}