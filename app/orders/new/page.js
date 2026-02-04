'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Sidebar from '../../components/Sidebar';

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
  const [custDetails, setCustDetails] = useState({ 
    ContactPerson: '', 
    ContactNumber: '', 
    DeliveryAddress: '' 
  });
  
  // Initialize date to today's date in YYYY-MM-DD format
  const [deliveryDate, setDeliveryDate] = useState(() => {
    return new Date().toISOString().split('T')[0]; // Current date
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

      // Auto capture user
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
  }, []);

  // Handle Customer Selection
  const handleCustomerChange = (e) => {
    const custName = e.target.value;
    setSelectedCustomer(custName);
    const details = customers.find(c => c.CompanyName.toLowerCase() === custName.toLowerCase());
    
    if (details) {
      setCustDetails({
        ContactPerson: details.ContactPerson || '',
        ContactNumber: details.ContactNumber || '',
        DeliveryAddress: details.DeliveryAddress || ''
      });
    }
  };

  const handleDetailChange = (field, value) => {
    setCustDetails(prev => ({ ...prev, [field]: value }));
  };

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
    const price = inputs.price === undefined || inputs.price === '' ? 0 : parseFloat(inputs.price); 
    
    if (!qty || qty <= 0) {
      return; 
    }

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

  // Remove Item
  const removeFromCart = (code) => {
    setCart(cart.filter(item => item.ProductCode !== code));
  };

  // Update Cart Item 
  const updateCartItem = (code, field, value) => {
    setCart(cart.map(item => 
      item.ProductCode === code ? { ...item, [field]: value } : item
    ));
  };

  // Submit Order
  const handleSubmit = async () => {
    if (!selectedCustomer || !deliveryDate || cart.length === 0) {
      alert("Please select a customer, date, and at least one item.");
      return;
    }

    setSubmitting(true);

    // 1. Format Date string from YYYY-MM-DD to YYMMDD based on DELIVERY DATE
    // deliveryDate is "2026-02-04" -> split -> ["2026", "02", "04"] -> "260204"
    const [year, month, day] = deliveryDate.split('-');
    const dateStr = `${year.slice(2)}${month}${day}`;

    // 2. Generate Random 4-digit number
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
    <div className="flex bg-gray-50 min-h-screen font-sans text-gray-800">
      <Sidebar />
      <main className="ml-64 flex-1 p-8">
        
        {/* Page Header */}
        <div className="mb-4 flex justify-between items-end"> 
           <div>
               <h1 className="text-xl font-black text-gray-800 tracking-tight">Create New Order</h1> 
               <p className="text-xs text-gray-400 font-medium">Fill in the details below to generate a new DO.</p> 
           </div>
           {/* Display Logged In User */}
           <div className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full uppercase">
               Logged as: {currentUser}
           </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* --- LEFT COLUMN (2/3 width) --- */}
          <div className="lg:col-span-2 space-y-4">
            
            {/* 1. Transaction Details Card - Compact Layout */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100"> 
              <h2 className="text-xs font-bold text-gray-800 mb-3 border-b border-gray-100 pb-1">Transaction Details</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3"> 
                 
                 {/* Sales Channel */}
                 <div className="col-span-1">
                     <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Sales Channel</label>
                     <select 
                        className="w-full bg-green-50 border border-green-200 text-green-800 text-xs font-bold rounded p-2 focus:outline-none focus:ring-1 focus:ring-green-500 transition-shadow"
                        value={salesChannel}
                        onChange={(e) => setSalesChannel(e.target.value)}
                     >
                        <option>Online / FnB</option>
                        <option>Wholesale</option>
                        <option>Outlet</option>
                     </select>
                 </div>

                 {/* Company Name */}
                 <div className="col-span-1 md:col-span-2">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Company Name</label>
                    <input 
                      list="customer-list"
                      type="text"
                      className="w-full border border-gray-200 rounded p-2 text-xs font-medium focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all uppercase"
                      value={selectedCustomer}
                      onChange={handleCustomerChange}
                      placeholder="SEARCH CUSTOMER..."
                    />
                    <datalist id="customer-list">
                      {customers.map(c => <option key={c.CompanyName} value={c.CompanyName} />)}
                    </datalist>
                 </div>

                 {/* Contact Person */}
                 <div className="col-span-1">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Contact Person</label>
                    <input 
                      type="text" 
                      className="w-full border border-gray-200 rounded p-2 text-xs focus:outline-none focus:border-green-500 transition-all uppercase"
                      value={custDetails.ContactPerson}
                      onChange={(e) => handleDetailChange('ContactPerson', e.target.value)}
                    />
                 </div>

                 {/* Contact Number */}
                 <div className="col-span-1">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Contact Number</label>
                    <input 
                      type="text" 
                      className="w-full border border-gray-200 rounded p-2 text-xs focus:outline-none focus:border-green-500 transition-all"
                      value={custDetails.ContactNumber}
                      onChange={(e) => handleDetailChange('ContactNumber', e.target.value)}
                    />
                 </div>

                 {/* Date */}
                 <div className="col-span-1">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Delivery Date</label>
                    <input 
                      type="date" 
                      className="w-full border border-gray-200 rounded p-2 text-xs focus:outline-none focus:border-green-500 transition-all"
                      value={deliveryDate}
                      onChange={e => setDeliveryDate(e.target.value)}
                    />
                 </div>

                 {/* Mode */}
                 <div className="col-span-1">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Mode</label>
                    <select 
                      className="w-full border border-gray-200 rounded p-2 text-xs focus:outline-none focus:border-green-500 transition-all"
                      value={deliveryMode}
                      onChange={e => setDeliveryMode(e.target.value)}
                    >
                      <option value="Driver">Driver</option>
                      <option value="Lalamove">Lalamove</option>
                      <option value="Self Pick-up">Self Pick-up</option>
                    </select>
                 </div>

                 {/* Address */}
                 <div className="col-span-1 md:col-span-2">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Address</label>
                    <input 
                      type="text" 
                      className="w-full border border-gray-200 rounded p-2 text-xs focus:outline-none focus:border-green-500 transition-all uppercase"
                      value={custDetails.DeliveryAddress}
                      onChange={(e) => handleDetailChange('DeliveryAddress', e.target.value)}
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
                    className="w-full pl-10 p-3.5 border border-gray-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 transition-all text-sm"
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
                                className="bg-gray-50 border border-gray-200 rounded-lg text-xs p-1.5 flex-1 font-bold focus:outline-none focus:ring-1 focus:ring-green-500 uppercase"
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
                                    className="w-full bg-white border border-gray-200 rounded-lg text-xs p-1.5 pl-2 font-bold focus:outline-none focus:ring-1 focus:ring-green-500 text-center"
                                    value={inputs.qty || ''}
                                    onChange={(e) => handleProductInputChange(p.ProductCode, 'qty', e.target.value)}
                                 />
                              </div>
                           </div>

                           {/* Price & Add */}
                           <div className="flex items-center gap-2">
                              {/* Replacement Checkbox */}
                              <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input 
                                    type="checkbox" 
                                    className="w-3.5 h-3.5 text-red-500 rounded border-gray-300 focus:ring-red-500"
                                    checked={inputs.replacement || false}
                                    onChange={(e) => handleProductInputChange(p.ProductCode, 'replacement', e.target.checked)}
                                  />
                                  <span className="text-[9px] font-bold text-red-400 uppercase tracking-wide">REPLACEMENT</span>
                              </label>

                              <div className="flex-1"></div>

                              {/* Price Input */}
                              <div className="relative w-24">
                                 <span className="absolute left-2 top-1 text-[10px] text-gray-400 font-bold">RM</span>
                                 <input 
                                   type="number" 
                                   placeholder="0.00" 
                                   className="w-full pl-6 pr-1 py-1 text-xs border rounded bg-gray-50 text-right focus:outline-none focus:ring-1 focus:ring-green-500" 
                                   disabled={inputs.replacement}
                                   value={inputs.price || ''}
                                   onChange={(e) => handleProductInputChange(p.ProductCode, 'price', e.target.value)}
                                 />
                              </div>

                              <button 
                                onClick={() => addToCart(p)}
                                className="bg-green-500 hover:bg-green-600 text-white rounded-lg w-8 h-8 flex items-center justify-center font-bold text-lg shadow-sm transition-colors active:scale-95"
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
                   <h2 className="text-lg font-bold text-gray-800">My Cart</h2>
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
                                   
                                   {item.isReplacement && (
                                       <span className="text-[9px] font-black text-white bg-red-400 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                           REPLACEMENT
                                       </span>
                                   )}
                                    {!item.isReplacement && (
                                       <span className="text-[10px] font-bold text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded">
                                           RM {(item.price || 0).toFixed(2)}
                                       </span>
                                   )}
                               </div>

                               {/* Notes Input per item */}
                               <input 
                                  type="text" 
                                  placeholder="Item note..." 
                                  className="w-full mt-2 bg-transparent border-b border-gray-200 text-[10px] text-gray-600 focus:outline-none focus:border-green-400 pb-0.5 placeholder-gray-300"
                                  value={item.notes || ''}
                                  onChange={(e) => updateCartItem(item.ProductCode, 'notes', e.target.value)}
                               />
                           </div>
                        ))
                    )}
                </div>

                {/* Footer Actions */}
                <div className="mt-auto pt-4 border-t border-gray-100">
                    <textarea 
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs mb-3 focus:outline-none focus:ring-1 focus:ring-green-500 resize-none"
                        rows="2"
                        placeholder="Global Order Notes..."
                    ></textarea>

                    <button 
                        onClick={handleSubmit}
                        disabled={submitting || cart.length === 0}
                        className={`w-full py-3.5 rounded-xl text-white font-bold text-sm shadow-lg transform transition-all active:scale-95 ${
                            submitting || cart.length === 0
                            ? 'bg-gray-300 cursor-not-allowed shadow-none' 
                            : 'bg-green-600 hover:bg-green-700 hover:shadow-green-500/30'
                        }`}
                    >
                        {submitting ? 'Submitting...' : 'Submit Order'}
                    </button>
                </div>
             </div>
          </div>

        </div>
      </main>
    </div>
  );
}