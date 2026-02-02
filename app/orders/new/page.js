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

  // Form States
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [custDetails, setCustDetails] = useState({ 
    ContactPerson: '', 
    ContactNumber: '', 
    DeliveryAddress: '' 
  });
  
  // Default date to tomorrow
  const getTomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  };

  const [deliveryDate, setDeliveryDate] = useState(getTomorrow());
  const [deliveryMode, setDeliveryMode] = useState('Driver'); 
  
  // Cart State
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Temp State for product cards (to hold qty/uom/price before adding)
  const [productInputs, setProductInputs] = useState({});

  // 1. Fetch Customers & Products on Load
  useEffect(() => {
    async function loadData() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

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

  // Helper to manage inputs for each product card independently
  const getProductInput = (code, field, defaultValue) => {
    return productInputs[code]?.[field] ?? defaultValue;
  };

  const updateProductInput = (code, field, value) => {
    setProductInputs(prev => ({
      ...prev,
      [code]: { ...prev[code], [field]: value }
    }));
  };

  // 2. Add Item to Cart
  const addToCart = (product) => {
    const inputs = productInputs[product.ProductCode] || {};
    const qty = parseFloat(inputs.qty || 0);
    
    if (!qty || qty <= 0) {
      alert("Please enter a valid quantity.");
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
      price: inputs.price || 0,
      isReplacement: inputs.isReplacement || false,
      notes: ''
    };

    setCart([...cart, newItem]);
    
    // Reset inputs for this product
    setProductInputs(prev => {
      const newState = { ...prev };
      delete newState[product.ProductCode];
      return newState;
    });
    setSearchTerm(''); // Clear search to show "done" state
  };

  const removeFromCart = (code) => {
    setCart(cart.filter(item => item.ProductCode !== code));
  };

  const handleSubmit = async () => {
    if (!selectedCustomer || !deliveryDate || cart.length === 0) {
      alert("Please check fields. Customer, Date, and Items are required.");
      return;
    }

    setSubmitting(true);
    const dateStr = new Date().toISOString().slice(2,10).replace(/-/g,'');
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
      "SpecialNotes": item.isReplacement ? "REPLACEMENT" : item.notes
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
    const qty = Number(balance);
    if (!balance) return 'bg-gray-100 text-gray-500';
    if (qty < 20) return 'bg-red-100 text-red-600';
    return 'bg-green-100 text-green-600';
  };

  if (loading) return <div className="flex h-screen items-center justify-center bg-gray-50 text-gray-500">Loading Order System...</div>;

  return (
    <div className="flex bg-gray-50 min-h-screen font-sans text-gray-800">
      <Sidebar />
      
      <main className="ml-64 flex-1 p-6 lg:p-8">
        {/* Page Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Create New Order</h1>
            <p className="text-sm text-gray-400 mt-1">Fill in the details below to generate a Delivery Order.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* LEFT COLUMN: Transaction Details & Product Search */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* 1. Transaction Details Card */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold text-gray-800 mb-5 border-b border-gray-100 pb-2">Transaction Details</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5 ml-1">Company Name</label>
                  <input 
                    list="customer-list"
                    type="text"
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition-all text-sm font-medium"
                    placeholder="Search customer..."
                    value={selectedCustomer}
                    onChange={handleCustomerChange}
                  />
                  <datalist id="customer-list">
                    {customers.map(c => <option key={c.CompanyName} value={c.CompanyName} />)}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5 ml-1">Contact Person</label>
                  <input 
                    type="text" 
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition-all text-sm"
                    value={custDetails.ContactPerson}
                    onChange={(e) => handleDetailChange('ContactPerson', e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5 ml-1">Contact Number</label>
                  <input 
                    type="text" 
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition-all text-sm"
                    value={custDetails.ContactNumber}
                    onChange={(e) => handleDetailChange('ContactNumber', e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5 ml-1">Delivery Date</label>
                  <input 
                    type="date" 
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition-all text-sm"
                    value={deliveryDate}
                    onChange={e => setDeliveryDate(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5 ml-1">Delivery Mode</label>
                  <select 
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition-all text-sm appearance-none"
                    value={deliveryMode}
                    onChange={e => setDeliveryMode(e.target.value)}
                  >
                    <option value="Driver">Driver</option>
                    <option value="Lalamove">Lalamove</option>
                    <option value="Self Pick-up">Self Pick-up</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5 ml-1">Delivery Address</label>
                  <input 
                    type="text" 
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition-all text-sm"
                    value={custDetails.DeliveryAddress}
                    onChange={(e) => handleDetailChange('DeliveryAddress', e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* 2. Product Search & Cards */}
            <div>
              <div className="relative mb-4">
                <input 
                  type="text"
                  placeholder="🔍  Start typing to search products..."
                  className="w-full p-4 pl-5 rounded-2xl border border-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 text-lg transition-all"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>

              {/* Product Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredProducts.slice(0, 10).map(p => {
                  const stockColor = getStockColor(p.StockBalance);
                  const inputs = productInputs[p.ProductCode] || {};
                  const uomOptions = p.AllowedUOMs 
                    ? p.AllowedUOMs.split(',').map(u => u.trim().toUpperCase()).filter(u => u)
                    : [p.BaseUOM];

                  return (
                    <div key={p.ProductCode} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                      {/* Card Header */}
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-bold text-gray-800 text-sm">{p.ProductName}</h3>
                          <p className="text-xs text-gray-400 font-mono mt-0.5">{p.ProductCode}</p>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${stockColor}`}>
                          {p.StockBalance ? `${p.StockBalance} ${p.BaseUOM}` : 'NO STOCK'}
                        </span>
                      </div>

                      {/* Controls */}
                      <div className="space-y-3">
                        <div className="flex gap-2">
                          <select 
                            className="flex-1 bg-gray-50 border border-gray-200 rounded-lg text-sm p-2 font-medium focus:ring-2 focus:ring-green-500 outline-none"
                            value={inputs.uom || p.BaseUOM}
                            onChange={(e) => updateProductInput(p.ProductCode, 'uom', e.target.value)}
                          >
                            {uomOptions.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                          <input 
                            type="number" 
                            placeholder="Qty"
                            className="w-20 bg-gray-50 border border-gray-200 rounded-lg text-sm p-2 text-center font-bold focus:ring-2 focus:ring-green-500 outline-none"
                            value={inputs.qty || ''}
                            onChange={(e) => updateProductInput(p.ProductCode, 'qty', e.target.value)}
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <input 
                            type="checkbox" 
                            id={`rep-${p.ProductCode}`}
                            className="w-4 h-4 text-green-600 rounded focus:ring-green-500 border-gray-300"
                            checked={inputs.isReplacement || false}
                            onChange={(e) => updateProductInput(p.ProductCode, 'isReplacement', e.target.checked)}
                          />
                          <label htmlFor={`rep-${p.ProductCode}`} className="text-xs font-bold text-red-400 uppercase tracking-wide cursor-pointer select-none">
                            Replacement
                          </label>
                        </div>

                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <span className="absolute left-3 top-2 text-xs font-bold text-gray-400">RM</span>
                            <input 
                              type="number" 
                              placeholder="0.00" 
                              className="w-full bg-gray-50 border border-gray-200 rounded-lg text-sm p-2 pl-8 font-bold focus:ring-2 focus:ring-green-500 outline-none disabled:bg-gray-100 disabled:text-gray-400"
                              value={inputs.price || ''}
                              onChange={(e) => updateProductInput(p.ProductCode, 'price', e.target.value)}
                              disabled={inputs.isReplacement}
                            />
                          </div>
                          <button 
                            onClick={() => addToCart(p)}
                            className="bg-green-600 hover:bg-green-700 text-white rounded-lg w-10 flex items-center justify-center text-xl font-bold shadow-sm transition-colors active:scale-95"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                
                {filteredProducts.length === 0 && searchTerm && (
                  <div className="col-span-2 text-center p-8 text-gray-400 italic bg-white rounded-2xl border border-dashed border-gray-200">
                    No products found matching "{searchTerm}"
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Cart */}
          <div className="lg:col-span-1">
            <div className="bg-white p-6 rounded-2xl shadow-xl border border-gray-100 sticky top-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-bold text-gray-800">My Cart</h2>
                <span className="bg-gray-100 text-gray-600 text-xs font-bold px-3 py-1 rounded-full">{cart.length}</span>
              </div>

              {/* Cart Items List */}
              <div className="bg-gray-50 rounded-xl p-4 min-h-[250px] max-h-[400px] overflow-y-auto space-y-3 mb-4 border border-gray-100 custom-scrollbar">
                {cart.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-gray-400 text-sm italic">
                    Cart is empty
                  </div>
                ) : (
                  cart.map((item, idx) => (
                    <div key={`${item.ProductCode}-${idx}`} className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm flex justify-between items-center group">
                      <div className="flex-1">
                        <div className="font-bold text-sm text-gray-800">
                          {item.ProductName} 
                          {item.isReplacement && <span className="text-[10px] text-red-500 font-bold bg-red-50 px-1 ml-2 rounded">REP</span>}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          <span className="font-bold text-gray-700">{item.qty} {item.uom}</span>
                          {!item.isReplacement && item.price > 0 && ` • RM ${item.price}`}
                        </div>
                      </div>
                      <button 
                        onClick={() => removeFromCart(item.ProductCode)}
                        className="text-gray-300 hover:text-red-500 font-bold px-2 transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}
              </div>

              <textarea 
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition-all mb-4 resize-none"
                rows="3"
                placeholder="Notes..."
                value={cart[0]?.notes || ""} // Simplified notes handling for demo, ideally per item or global
                onChange={(e) => {
                   // Updating notes for all items for simplicity in this view, 
                   // or add a global note state if preferred.
                   const val = e.target.value;
                   setCart(cart.map(i => ({...i, notes: val})));
                }}
              ></textarea>

              <button 
                onClick={handleSubmit}
                disabled={submitting}
                className={`w-full py-4 rounded-xl text-white font-bold text-lg shadow-lg transform transition-all duration-200 
                  ${submitting 
                    ? 'bg-gray-400 cursor-not-allowed' 
                    : 'bg-green-600 hover:bg-green-700 hover:scale-[1.02] hover:shadow-xl active:scale-95'
                  }`}
              >
                {submitting ? 'Submitting...' : 'Submit Order'}
              </button>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}