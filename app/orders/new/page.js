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
  
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryMode, setDeliveryMode] = useState('Driver'); 
  
  // Cart State
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 1. Fetch Customers & Products on Load
  useEffect(() => {
    async function loadData() {
      // Get User Session first
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      // Fetch Customers
      const { data: custData } = await supabase
        .from('Customers')
        .select('CompanyName, ContactPerson, DeliveryAddress, ContactNumber')
        .order('CompanyName');

      // Fetch Products (Added AllowedUOMs)
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

  // Handle Customer Selection / Typing
  const handleCustomerChange = (e) => {
    const custName = e.target.value;
    setSelectedCustomer(custName);
    
    // Check if the typed name matches an existing customer
    const details = customers.find(c => c.CompanyName.toLowerCase() === custName.toLowerCase());
    
    if (details) {
      // Auto-fill details if match found
      setCustDetails({
        ContactPerson: details.ContactPerson || '',
        ContactNumber: details.ContactNumber || '',
        DeliveryAddress: details.DeliveryAddress || ''
      });
    } else {
      // Don't clear immediately if user is just typing a new name
      // Only clear if it was previously populated and now they are typing something else? 
      // Actually, standard behavior for "New" is blank details.
      // But if editing a name, we might want to keep details. 
      // For simplicity: If no match, we assume it's new/custom, but we let the user fill it. 
      // We won't auto-clear to avoid frustration if they fix a typo in the name.
      // If they want to clear, they can delete the text.
    }
  };

  // Helper to update specific detail fields
  const handleDetailChange = (field, value) => {
    setCustDetails(prev => ({ ...prev, [field]: value }));
  };

  // 2. Add Item to Cart
  const addToCart = (product) => {
    const exists = cart.find(item => item.ProductCode === product.ProductCode);
    if (exists) {
      alert("Item already in cart!");
      return;
    }

    // Parse AllowedUOMs string into array
    const uomOptions = product.AllowedUOMs 
      ? product.AllowedUOMs.split(',').map(u => u.trim().toUpperCase()).filter(u => u)
      : [product.BaseUOM];

    const newItem = {
      ...product,
      qty: 1,
      uom: product.BaseUOM, // Default to Base
      uomOptions: uomOptions, // Store options for the dropdown
      price: 0,
      notes: ''
    };
    setCart([...cart, newItem]);
    setSearchTerm('');
  };

  // 3. Remove Item
  const removeFromCart = (code) => {
    setCart(cart.filter(item => item.ProductCode !== code));
  };

  // 4. Update Cart Item
  const updateItem = (code, field, value) => {
    setCart(cart.map(item => 
      item.ProductCode === code ? { ...item, [field]: value } : item
    ));
  };

  // 5. Submit Order
  const handleSubmit = async () => {
    if (!selectedCustomer || !deliveryDate || cart.length === 0) {
      alert("Please select a customer, date, and at least one item.");
      return;
    }

    setSubmitting(true);

    const dateStr = new Date().toISOString().slice(2,10).replace(/-/g,'');
    const random = Math.floor(1000 + Math.random() * 9000); 
    const doNumber = `DO-${dateStr}-${random}`;

    // Prepare Rows
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
      "Price": item.price,
      "SpecialNotes": item.notes
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

  // Improved "Fuzzy" Search
  const filteredProducts = products.filter(p => {
    if (!searchTerm) return false;
    const lowerTerm = searchTerm.toLowerCase();
    const searchParts = lowerTerm.split(' '); 
    const combinedText = (p.ProductName + ' ' + p.ProductCode + ' ' + (p.Category || '')).toLowerCase();
    return searchParts.every(part => combinedText.includes(part));
  });

  // Stock Color Logic
  const getStockColor = (balance) => {
    if (balance === null || balance === undefined) return 'bg-gray-200 text-gray-600'; 
    const qty = Number(balance);
    if (qty < 20) return 'bg-red-100 text-red-800 border-red-200';
    if (qty <= 50) return 'bg-orange-100 text-orange-800 border-orange-200';
    return 'bg-green-100 text-green-800 border-green-200';
  };

  if (loading) return <div className="p-10 ml-64">Loading Order Form...</div>;

  return (
    <div className="flex bg-gray-50 min-h-screen">
      <Sidebar />
      <main className="ml-64 flex-1 p-8">
        <h1 className="text-3xl font-bold mb-6 text-gray-800">Create New Order</h1>

        {/* --- 1. CUSTOMER & DELIVERY --- */}
        <div className="bg-white p-6 rounded shadow mb-6 border-l-4 border-blue-500">
          <h2 className="text-xl font-bold mb-4 text-gray-700">1. Customer & Delivery Info</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column: Selection */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold mb-1 text-gray-600">Customer Name</label>
                {/* Editable Input with Datalist for Autocomplete */}
                <input 
                  list="customer-list"
                  type="text"
                  className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-200 focus:outline-none"
                  placeholder="Type name or select from list..."
                  value={selectedCustomer}
                  onChange={handleCustomerChange}
                />
                <datalist id="customer-list">
                  {customers.map(c => (
                    <option key={c.CompanyName} value={c.CompanyName} />
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-1 text-gray-600">Delivery Date</label>
                  <input 
                    type="date" 
                    className="w-full border p-2 rounded"
                    value={deliveryDate}
                    onChange={e => setDeliveryDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1 text-gray-600">Delivery Mode</label>
                  <select 
                    className="w-full border p-2 rounded"
                    value={deliveryMode}
                    onChange={e => setDeliveryMode(e.target.value)}
                  >
                    <option value="Driver">Driver</option>
                    <option value="Lalamove">Lalamove</option>
                    <option value="Self Pick-up">Self Pick-up</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Right Column: Editable Details */}
            <div className="bg-gray-50 p-4 rounded border border-gray-200 text-sm h-full">
               <h3 className="font-bold text-gray-500 uppercase mb-3 text-xs tracking-wider border-b pb-1">Delivery Details (Editable)</h3>
               <div className="space-y-3">
                 <div>
                    <label className="text-gray-500 text-xs uppercase block mb-1">Contact Person</label>
                    <input 
                      type="text" 
                      className="w-full border p-1 rounded bg-white"
                      value={custDetails.ContactPerson}
                      onChange={(e) => handleDetailChange('ContactPerson', e.target.value)}
                      placeholder="Name..."
                    />
                 </div>
                 <div>
                    <label className="text-gray-500 text-xs uppercase block mb-1">Phone Number</label>
                    <input 
                      type="text" 
                      className="w-full border p-1 rounded bg-white"
                      value={custDetails.ContactNumber}
                      onChange={(e) => handleDetailChange('ContactNumber', e.target.value)}
                      placeholder="01x-xxxxxxx"
                    />
                 </div>
                 <div>
                    <label className="text-gray-500 text-xs uppercase block mb-1">Delivery Address</label>
                    <textarea 
                      className="w-full border p-1 rounded bg-white h-16 resize-none"
                      value={custDetails.DeliveryAddress}
                      onChange={(e) => handleDetailChange('DeliveryAddress', e.target.value)}
                      placeholder="Full Address..."
                    />
                 </div>
               </div>
            </div>
          </div>
        </div>

        {/* --- 2. PRODUCT SEARCH --- */}
        <div className="bg-white p-6 rounded shadow mb-6 border-l-4 border-green-500">
          <h2 className="text-xl font-bold mb-4 text-gray-700">2. Add Products</h2>
          <div className="relative">
            <input 
              type="text"
              placeholder="Start typing to search (e.g. 'apple fuji')..."
              className="w-full border p-3 rounded shadow-sm focus:ring-2 focus:ring-green-200 focus:outline-none"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            
            {/* Search Results Dropdown */}
            {searchTerm && (
              <div className="absolute z-10 w-full mt-1 max-h-80 overflow-y-auto border rounded-b bg-white shadow-xl">
                {filteredProducts.slice(0, 15).map(p => {
                    const stockColor = getStockColor(p.StockBalance);
                    
                    return (
                      <div key={p.ProductCode} className="flex justify-between items-center p-3 hover:bg-blue-50 border-b transition-colors group">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                             <span className="font-bold text-gray-800">{p.ProductName}</span>
                             <span className="text-xs text-gray-400 font-mono bg-gray-100 px-1 rounded">{p.ProductCode}</span>
                          </div>
                          
                          {/* Stock Balance Badge */}
                          <div className="mt-1 flex items-center gap-2">
                             <span className={`text-xs font-bold px-2 py-0.5 rounded border ${stockColor}`}>
                               Stock: {p.StockBalance ?? 0} {p.ReportingUOM || p.BaseUOM}
                             </span>
                             <span className="text-xs text-gray-400">({p.Category})</span>
                          </div>
                        </div>
                        
                        <button 
                          onClick={() => addToCart(p)}
                          className="bg-white border border-green-600 text-green-600 hover:bg-green-600 hover:text-white px-4 py-1.5 rounded text-sm font-bold transition-all"
                        >
                          + Add
                        </button>
                      </div>
                    );
                })}
                {filteredProducts.length === 0 && (
                   <p className="p-4 text-gray-500 text-center italic">No products found matching "{searchTerm}"</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* --- 3. CART --- */}
        <div className="bg-white p-6 rounded shadow mb-6 border-l-4 border-yellow-500">
          <h2 className="text-xl font-bold mb-4 text-gray-700">3. Order Summary ({cart.length} items)</h2>
          
          {cart.length === 0 ? (
            <div className="text-center py-8 text-gray-400 bg-gray-50 rounded border border-dashed border-gray-300">
              Your cart is empty. Search for products above to add them.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-100 border-b text-sm text-gray-600 uppercase">
                  <th className="p-3">Product</th>
                  <th className="p-3 w-24">Qty</th>
                  <th className="p-3 w-32">UOM</th>
                  <th className="p-3 w-28">Price</th>
                  <th className="p-3">Notes</th>
                  <th className="p-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {cart.map((item) => (
                  <tr key={item.ProductCode} className="border-b hover:bg-gray-50 transition-colors">
                    <td className="p-3">
                      <div className="font-bold text-gray-800">{item.ProductName}</div>
                      <div className="text-xs text-gray-500 font-mono">{item.ProductCode}</div>
                    </td>
                    <td className="p-3">
                      <input 
                        type="number" 
                        className="w-full border p-1 rounded text-center focus:border-blue-500"
                        value={item.qty}
                        onChange={e => updateItem(item.ProductCode, 'qty', e.target.value)}
                      />
                    </td>
                    <td className="p-3">
                      {/* Dropdown for Allowed UOMs */}
                      <select 
                        className="w-full border p-1 rounded bg-white text-center focus:border-blue-500"
                        value={item.uom}
                        onChange={e => updateItem(item.ProductCode, 'uom', e.target.value)}
                      >
                        {item.uomOptions && item.uomOptions.length > 0 ? (
                           item.uomOptions.map(u => (
                             <option key={u} value={u}>{u}</option>
                           ))
                        ) : (
                           <option value={item.BaseUOM}>{item.BaseUOM}</option>
                        )}
                      </select>
                    </td>
                    <td className="p-3">
                       <input 
                        type="number" 
                        className="w-full border p-1 rounded text-right"
                        value={item.price}
                        placeholder="0.00"
                        onChange={e => updateItem(item.ProductCode, 'price', e.target.value)}
                      />
                    </td>
                    <td className="p-3">
                      <input 
                        type="text" 
                        placeholder="Special requests..."
                        className="w-full border p-1 rounded text-sm"
                        value={item.notes}
                        onChange={e => updateItem(item.ProductCode, 'notes', e.target.value)}
                      />
                    </td>
                    <td className="p-3 text-center">
                      <button 
                        onClick={() => removeFromCart(item.ProductCode)}
                        className="text-gray-400 hover:text-red-600 font-bold px-2"
                        title="Remove Item"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* --- SUBMIT BUTTON --- */}
        <div className="text-right">
          <button 
            onClick={handleSubmit}
            disabled={submitting}
            className={`px-8 py-4 rounded text-white font-bold text-lg shadow-lg transform transition-all ${
              submitting 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-green-600 hover:bg-green-700 hover:scale-105 active:scale-95'
            }`}
          >
            {submitting ? 'Creating Order...' : '✅ Submit Order'}
          </button>
        </div>

      </main>
    </div>
  );
}