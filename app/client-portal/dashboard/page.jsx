'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { ShoppingBagIcon, ArrowRightOnRectangleIcon, PlusIcon, MinusIcon } from '@heroicons/react/24/outline';

export default function ClientDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [clientInfo, setClientInfo] = useState(null);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. Initialize & Fetch Data
  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/client-portal/login');
        return;
      }

      // In a real app, you'd fetch the linked Customer Profile here using session.user.id
      // For this MVP, we will simulate or look up by email match if you have that set up
      // Or just let them "select" their profile once (insecure for prod but okay for MVP demo)
      // Ideally: select * from ClientUsers where auth_id = session.user.id
      
      // Fetch Products
      const { data: prodData } = await supabase
        .from('ProductMaster')
        .select('*')
        .order('ProductName');
        
      setProducts(prodData || []);

      // Default Delivery Date: Tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setDeliveryDate(tomorrow.toISOString().split('T')[0]);

      setLoading(false);
    }
    init();
  }, [router]);

  // 2. Cart Logic
  const updateCart = (product, delta) => {
      setCart(prev => {
          const existing = prev.find(item => item.ProductCode === product.ProductCode);
          if (existing) {
              const newQty = existing.qty + delta;
              if (newQty <= 0) return prev.filter(item => item.ProductCode !== product.ProductCode);
              return prev.map(item => item.ProductCode === product.ProductCode ? { ...item, qty: newQty } : item);
          } else {
              if (delta > 0) {
                  return [...prev, { ...product, qty: 1, uom: product.BaseUOM }];
              }
              return prev;
          }
      });
  };

  const getItemQty = (code) => {
      return cart.find(i => i.ProductCode === code)?.qty || 0;
  };

  // 3. Submit Order
  const handleSubmitOrder = async () => {
      if (cart.length === 0) return alert("Your cart is empty.");
      if (!deliveryDate) return alert("Please select a delivery date.");
      
      // HARDCODED CLIENT FOR DEMO - You need to link this to Auth
      const clientName = "MY CLIENT ACCOUNT"; 
      
      setIsSubmitting(true);
      const dateStr = deliveryDate.replaceAll('-', '').slice(2);
      const doNumber = `ORD-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;

      const orderRows = cart.map(item => ({
        "Timestamp": new Date(),
        "Status": "Pending",
        "DONumber": doNumber,
        "Delivery Date": deliveryDate,
        "Customer Name": clientName, // This should come from their profile
        "Delivery Address": "Default Client Address", // Should come from profile
        "Product Code": item.ProductCode,
        "Order Items": item.ProductName,
        "Quantity": item.qty,
        "UOM": item.uom,
        "Price": 0, // Price TBD by Admin or fetched if public
        "LoggedBy": "CLIENT_PORTAL"
      }));

      const { error } = await supabase.from('Orders').insert(orderRows);

      if (error) {
          alert("Failed to place order: " + error.message);
      } else {
          alert("Order placed successfully! We will process it shortly.");
          setCart([]);
      }
      setIsSubmitting(false);
  };

  const filteredProducts = products.filter(p => 
      p.ProductName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="p-10 text-center font-bold text-gray-500">Loading Portal...</div>;

  return (
    <div className="bg-gray-50 min-h-screen pb-20 md:pb-0">
        
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-10 px-4 py-4 flex justify-between items-center shadow-sm">
            <div>
                <h1 className="text-lg font-black text-gray-800 tracking-tight">Order Portal</h1>
                <p className="text-[10px] text-gray-400 font-bold uppercase">Place your orders below</p>
            </div>
            <button 
                onClick={async () => { await supabase.auth.signOut(); router.push('/client-portal/login'); }}
                className="text-gray-400 hover:text-red-500 p-2"
            >
                <ArrowRightOnRectangleIcon className="w-6 h-6" />
            </button>
        </header>

        <div className="max-w-3xl mx-auto p-4 md:p-8">
            
            {/* Delivery Info */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-6">
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2">Requested Delivery Date</label>
                <input 
                    type="date" 
                    className="w-full p-3 border border-gray-200 rounded-xl font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                />
            </div>

            {/* Search */}
            <div className="mb-6 relative">
                 <input 
                    type="text" 
                    placeholder="Search for fruits or vegetables..." 
                    className="w-full pl-10 p-4 border border-gray-200 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                 />
                 <span className="absolute left-4 top-4 text-gray-400">🔍</span>
            </div>

            {/* Product List */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-24">
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
                                        <button 
                                            onClick={() => updateCart(p, -1)}
                                            className="w-8 h-8 flex items-center justify-center bg-white rounded-lg text-gray-600 shadow-sm active:scale-90 transition"
                                        >
                                            <MinusIcon className="w-4 h-4" />
                                        </button>
                                        <span className="w-8 text-center font-black text-sm text-gray-800">{qty}</span>
                                    </>
                                )}
                                <button 
                                    onClick={() => updateCart(p, 1)}
                                    className={`w-8 h-8 flex items-center justify-center rounded-lg shadow-sm active:scale-90 transition ${qty > 0 ? 'bg-white text-blue-600' : 'bg-blue-600 text-white'}`}
                                >
                                    <PlusIcon className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Bottom Cart Bar */}
            {cart.length > 0 && (
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-20">
                    <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="bg-blue-100 p-3 rounded-full text-blue-600 relative">
                                <ShoppingBagIcon className="w-6 h-6" />
                                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-white">
                                    {cart.length}
                                </span>
                            </div>
                            <div className="hidden sm:block">
                                <p className="text-xs font-bold text-gray-400 uppercase">Total Items</p>
                                <p className="font-black text-gray-800 text-lg">{cart.reduce((a,b)=>a+b.qty,0)} units</p>
                            </div>
                        </div>
                        <button 
                            onClick={handleSubmitOrder}
                            disabled={isSubmitting}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-6 rounded-xl shadow-lg transition active:scale-95 disabled:bg-gray-300"
                        >
                            {isSubmitting ? 'Sending Order...' : 'Confirm Order'}
                        </button>
                    </div>
                </div>
            )}

        </div>
    </div>
  );
}