'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { ChevronLeftIcon, PlusIcon, MinusIcon, ShoppingCartIcon } from '@heroicons/react/24/outline';

export default function GuestPurchasePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Manual Input State for Guests
  const [guestDetails, setGuestDetails] = useState({
      companyName: '',
      contactPerson: '',
      contactNumber: '',
      deliveryAddress: ''
  });

  useEffect(() => {
    async function loadCatalog() {
        // Fetch Only Products - NO Customers
        const { data: prodData } = await supabase.from('ProductMaster').select('*').order('ProductName');
        setProducts(prodData || []);

        // Default Date: Tomorrow
        const tmr = new Date();
        tmr.setDate(tmr.getDate() + 1);
        setDeliveryDate(tmr.toISOString().split('T')[0]);

        setLoading(false);
    }
    loadCatalog();
  }, []);

  // Cart Logic
  const addToCart = (product) => {
    setCart(prev => {
        const existing = prev.find(p => p.ProductCode === product.ProductCode);
        if (existing) {
            return prev.map(p => p.ProductCode === product.ProductCode ? { ...p, qty: p.qty + 1 } : p);
        }
        return [...prev, { ...product, qty: 1, uom: product.BaseUOM }];
    });
  };

  const updateQty = (code, delta) => {
    setCart(prev => prev.map(p => {
        if (p.ProductCode === code) {
            const newQty = Math.max(0, p.qty + delta);
            return { ...p, qty: newQty };
        }
        return p;
    }).filter(p => p.qty > 0));
  };

  const getItemQty = (code) => cart.find(p => p.ProductCode === code)?.qty || 0;

  const handleSubmitOrder = async () => {
      // 1. Validation
      if (cart.length === 0) return alert("Cart is empty");
      if (!guestDetails.companyName.trim()) return alert("Please enter your Company Name");
      if (!guestDetails.contactNumber.trim()) return alert("Please enter a Contact Number");
      if (!guestDetails.deliveryAddress.trim()) return alert("Please enter a Delivery Address");

      setIsSubmitting(true);

      const dateStr = deliveryDate.replaceAll('-', '').slice(2);
      const doNumber = `GUEST-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;

      const orderRows = cart.map(item => ({
          "Timestamp": new Date(),
          "Status": "Pending",
          "DONumber": doNumber,
          "Delivery Date": deliveryDate,
          "Customer Name": guestDetails.companyName.toUpperCase(), // Manual Input
          "Delivery Address": guestDetails.deliveryAddress.toUpperCase(),
          "Contact Person": guestDetails.contactPerson.toUpperCase(),
          "Contact Number": guestDetails.contactNumber,
          "Product Code": item.ProductCode,
          "Order Items": item.ProductName,
          "Quantity": item.qty,
          "UOM": item.uom,
          "Price": 0,
          "LoggedBy": "GUEST_PORTAL"
      }));

      const { error } = await supabase.from('Orders').insert(orderRows);

      if (error) {
          alert("Error: " + error.message);
      } else {
          alert(`Order Placed Successfully! Your Order ID is ${doNumber}. Please save this for your reference.`);
          router.push('/client-portal/login'); // Redirect back to login
      }
      setIsSubmitting(false);
  };

  const filteredProducts = products.filter(p => p.ProductName.toLowerCase().includes(searchTerm.toLowerCase()));

  if (loading) return <div className="p-10 text-center font-bold text-gray-400">Loading Catalog...</div>;

  return (
    <div className="bg-gray-50 min-h-screen pb-32 font-sans">
        
        {/* Header */}
        <div className="bg-white sticky top-0 z-20 shadow-sm px-4 py-4 flex items-center gap-3">
            <button onClick={() => router.back()} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200">
                <ChevronLeftIcon className="w-5 h-5 text-gray-600" />
            </button>
            <div className="flex-1">
                <h1 className="text-sm font-black text-gray-800 uppercase tracking-wide">Guest Order</h1>
                <p className="text-[10px] text-gray-400 font-bold">Manual Entry Mode</p>
            </div>
            <input 
                type="date" 
                className="bg-gray-100 border-none rounded-lg text-xs font-bold p-2 text-gray-600 outline-none"
                value={deliveryDate}
                onChange={e => setDeliveryDate(e.target.value)}
            />
        </div>

        <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6">
            
            {/* GUEST DETAILS FORM (Key for Privacy: Manual Input ONLY) */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Your Details</h2>
                <div className="space-y-3">
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Company / Name</label>
                        <input 
                            className="w-full p-3 border border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-green-500"
                            placeholder="e.g. My Cafe"
                            value={guestDetails.companyName}
                            onChange={e => setGuestDetails({...guestDetails, companyName: e.target.value})}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Contact Person</label>
                            <input 
                                className="w-full p-3 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-green-500"
                                placeholder="Name"
                                value={guestDetails.contactPerson}
                                onChange={e => setGuestDetails({...guestDetails, contactPerson: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Phone Number</label>
                            <input 
                                className="w-full p-3 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-green-500"
                                placeholder="012..."
                                value={guestDetails.contactNumber}
                                onChange={e => setGuestDetails({...guestDetails, contactNumber: e.target.value})}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Delivery Address</label>
                        <textarea 
                            className="w-full p-3 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-green-500 h-20 resize-none"
                            placeholder="Full address for delivery..."
                            value={guestDetails.deliveryAddress}
                            onChange={e => setGuestDetails({...guestDetails, deliveryAddress: e.target.value})}
                        />
                    </div>
                </div>
            </div>

            {/* Product Search */}
            <div className="relative">
                 <input 
                    type="text" 
                    placeholder="Search products..." 
                    className="w-full pl-10 p-4 border border-gray-200 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 transition-all font-medium"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                 />
                 <span className="absolute left-4 top-4 text-gray-400">🔍</span>
            </div>

            {/* Product List */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredProducts.map(p => {
                    const qty = getItemQty(p.ProductCode);
                    return (
                        <div key={p.ProductCode} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex justify-between items-center group">
                            <div className="flex-1 pr-4">
                                <h3 className="font-bold text-gray-800 text-sm leading-tight">{p.ProductName}</h3>
                                <p className="text-[10px] text-gray-400 mt-1 uppercase font-bold">{p.BaseUOM}</p>
                            </div>
                            
                            <div className="flex items-center bg-gray-50 rounded-xl p-1">
                                {qty > 0 && (
                                    <>
                                        <button onClick={() => updateQty(p.ProductCode, -1)} className="w-8 h-8 flex items-center justify-center bg-white rounded-lg text-gray-600 shadow-sm active:scale-90 transition"><MinusIcon className="w-4 h-4"/></button>
                                        <span className="w-8 text-center font-black text-sm text-gray-800">{qty}</span>
                                    </>
                                )}
                                <button onClick={() => updateQty(p.ProductCode, 1)} className={`w-8 h-8 flex items-center justify-center rounded-lg shadow-sm active:scale-90 transition ${qty > 0 ? 'bg-white text-green-600' : 'bg-green-600 text-white'}`}><PlusIcon className="w-4 h-4" /></button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>

        {/* Checkout Bar */}
        {cart.length > 0 && (
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-20">
                <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="bg-green-100 p-3 rounded-full text-green-600 relative">
                            <ShoppingBagIcon className="w-6 h-6" />
                            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-white">{cart.length}</span>
                        </div>
                        <div className="hidden sm:block">
                            <p className="text-xs font-bold text-gray-400 uppercase">Total Items</p>
                            <p className="font-black text-gray-800 text-lg">{cart.reduce((a,b)=>a+b.qty,0)} units</p>
                        </div>
                    </div>
                    <button 
                        onClick={handleSubmitOrder}
                        disabled={isSubmitting}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 px-6 rounded-xl shadow-lg transition active:scale-95 disabled:bg-gray-300"
                    >
                        {isSubmitting ? 'Sending Order...' : 'Submit Guest Order'}
                    </button>
                </div>
            </div>
        )}

    </div>
  );
}