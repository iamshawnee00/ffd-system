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
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryMode, setDeliveryMode] = useState('Morning (9 AM - 12 PM)');
  
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
        .select('CompanyName, ContactPerson, DeliveryAddress')
        .order('CompanyName');

      // Fetch Products
      const { data: prodData } = await supabase
        .from('ProductMaster')
        .select('ProductCode, ProductName, BaseUOM, Category')
        .order('ProductName');

      setCustomers(custData || []);
      setProducts(prodData || []);
      setLoading(false);
    }
    loadData();
  }, []);

  // 2. Add Item to Cart
  const addToCart = (product) => {
    // Check if already in cart
    const exists = cart.find(item => item.ProductCode === product.ProductCode);
    if (exists) {
      alert("Item already in cart!");
      return;
    }

    const newItem = {
      ...product,
      qty: 1,
      uom: product.BaseUOM,
      price: 0, // You can fetch price from PriceList if needed later
      notes: ''
    };
    setCart([...cart, newItem]);
    setSearchTerm(''); // Clear search to show cart
  };

  // 3. Remove Item
  const removeFromCart = (code) => {
    setCart(cart.filter(item => item.ProductCode !== code));
  };

  // 4. Update Cart Item (Qty, Price, etc)
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

    // Generate DO Number: DO-YYMMDD-RANDOM
    const dateStr = new Date().toISOString().slice(2,10).replace(/-/g,'');
    const random = Math.floor(1000 + Math.random() * 9000); 
    const doNumber = `DO-${dateStr}-${random}`;

    // Get Customer Details
    const custDetails = customers.find(c => c.CompanyName === selectedCustomer);

    // Prepare Rows for Supabase (One row per item)
    const orderRows = cart.map(item => ({
      "Timestamp": new Date(),
      "Status": "Pending",
      "DONumber": doNumber,
      "Delivery Date": deliveryDate,
      "Delivery Mode": deliveryMode,
      "Customer Name": selectedCustomer,
      "Delivery Address": custDetails?.DeliveryAddress || '',
      "Contact Person": custDetails?.ContactPerson || '',
      "Product Code": item.ProductCode,
      "Order Items": item.ProductName,
      "Quantity": item.qty,
      "UOM": item.uom,
      "Price": item.price,
      "SpecialNotes": item.notes
    }));

    // Insert into Supabase
    const { error } = await supabase.from('Orders').insert(orderRows);

    if (error) {
      alert("Error creating order: " + error.message);
      setSubmitting(false);
    } else {
      alert(`Order Created! DO Number: ${doNumber}`);
      router.push('/'); // Go back to dashboard
    }
  };

  // Filter products for search
  const filteredProducts = products.filter(p => 
    p.ProductName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.ProductCode?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="p-10">Loading Order Form...</div>;

  return (
    <div className="flex bg-gray-50 min-h-screen">
      <Sidebar />
      <main className="ml-64 flex-1 p-8">
        <h1 className="text-3xl font-bold mb-6">Create New Order</h1>

        {/* --- CUSTOMER DETAILS SECTION --- */}
        <div className="bg-white p-6 rounded shadow mb-6">
          <h2 className="text-xl font-bold mb-4 text-gray-700">1. Customer & Delivery</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold mb-1">Customer</label>
              <select 
                className="w-full border p-2 rounded"
                value={selectedCustomer}
                onChange={e => setSelectedCustomer(e.target.value)}
              >
                <option value="">-- Select Customer --</option>
                {customers.map(c => (
                  <option key={c.id || c.CompanyName} value={c.CompanyName}>
                    {c.CompanyName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold mb-1">Delivery Date</label>
              <input 
                type="date" 
                className="w-full border p-2 rounded"
                value={deliveryDate}
                onChange={e => setDeliveryDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* --- PRODUCT SEARCH SECTION --- */}
        <div className="bg-white p-6 rounded shadow mb-6">
          <h2 className="text-xl font-bold mb-4 text-gray-700">2. Add Products</h2>
          <input 
            type="text"
            placeholder="Search Product Name or Code..."
            className="w-full border p-3 rounded mb-4"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          
          {/* Search Results Dropdown */}
          {searchTerm && (
            <div className="max-h-60 overflow-y-auto border rounded bg-gray-50 p-2">
              {filteredProducts.slice(0, 10).map(p => (
                <div key={p.ProductCode} className="flex justify-between items-center p-2 hover:bg-blue-50 border-b">
                  <div>
                    <span className="font-bold">{p.ProductName}</span>
                    <span className="text-xs text-gray-500 ml-2">({p.ProductCode})</span>
                  </div>
                  <button 
                    onClick={() => addToCart(p)}
                    className="bg-blue-600 text-white px-3 py-1 rounded text-sm"
                  >
                    Add
                  </button>
                </div>
              ))}
              {filteredProducts.length === 0 && <p className="p-2 text-gray-500">No products found.</p>}
            </div>
          )}
        </div>

        {/* --- CART / ORDER ITEMS --- */}
        <div className="bg-white p-6 rounded shadow mb-6">
          <h2 className="text-xl font-bold mb-4 text-gray-700">3. Order Items ({cart.length})</h2>
          
          {cart.length === 0 ? (
            <p className="text-gray-400 italic">No items added yet.</p>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-100 border-b">
                  <th className="p-2">Product</th>
                  <th className="p-2 w-20">Qty</th>
                  <th className="p-2 w-24">UOM</th>
                  <th className="p-2 w-24">Price</th>
                  <th className="p-2">Notes</th>
                  <th className="p-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {cart.map((item) => (
                  <tr key={item.ProductCode} className="border-b hover:bg-gray-50">
                    <td className="p-2">
                      <div className="font-bold">{item.ProductName}</div>
                      <div className="text-xs text-gray-500">{item.ProductCode}</div>
                    </td>
                    <td className="p-2">
                      <input 
                        type="number" 
                        className="w-full border p-1 rounded"
                        value={item.qty}
                        onChange={e => updateItem(item.ProductCode, 'qty', e.target.value)}
                      />
                    </td>
                    <td className="p-2">
                      <input 
                        type="text" 
                        className="w-full border p-1 rounded"
                        value={item.uom}
                        onChange={e => updateItem(item.ProductCode, 'uom', e.target.value)}
                      />
                    </td>
                    <td className="p-2">
                       {/* Make Price Editable */}
                       <input 
                        type="number" 
                        className="w-full border p-1 rounded"
                        value={item.price}
                        onChange={e => updateItem(item.ProductCode, 'price', e.target.value)}
                      />
                    </td>
                    <td className="p-2">
                      <input 
                        type="text" 
                        placeholder="Special requests..."
                        className="w-full border p-1 rounded text-sm"
                        value={item.notes}
                        onChange={e => updateItem(item.ProductCode, 'notes', e.target.value)}
                      />
                    </td>
                    <td className="p-2">
                      <button 
                        onClick={() => removeFromCart(item.ProductCode)}
                        className="text-red-500 hover:text-red-700 font-bold"
                      >
                        X
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
            className={`px-8 py-4 rounded text-white font-bold text-lg shadow-lg ${
              submitting ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {submitting ? 'Creating Order...' : '✅ Submit Order'}
          </button>
        </div>

      </main>
    </div>
  );
}