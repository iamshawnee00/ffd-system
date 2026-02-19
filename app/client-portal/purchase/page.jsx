'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { ChevronLeftIcon, PlusIcon, MinusIcon, ShoppingCartIcon } from '@heroicons/react/24/outline';

export default function ClientPurchasePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentBranch, setCurrentBranch] = useState(null);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // 1. Validate Session & Branch
    const sessionStr = localStorage.getItem('ffd_client_session');
    const branchId = localStorage.getItem('ffd_selected_branch_id');
    
    if (!sessionStr || !branchId) {
        router.push('/client-portal/dashboard');
        return;
    }

    // 2. Fetch Branch Details & Products
    async function loadData() {
        // Fetch Branch
        const { data: branchData } = await supabase.from('Customers').select('*').eq('id', branchId).single();
        setCurrentBranch(branchData);

        // Fetch Products
        const { data: prodData } = await supabase.from('ProductMaster').select('*').order('ProductName');
        setProducts(prodData || []);

        // Default Date: Tomorrow
        const tmr = new Date();
        tmr.setDate(tmr.getDate() + 1);
        setDeliveryDate(tmr.toISOString().split('T')[0]);

        setLoading(false);
    }
    loadData();
  }, [router]);

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
      if (cart.length === 0) return alert("Cart is empty");
      setIsSubmitting(true);

      const dateStr = deliveryDate.replaceAll('-', '').slice(2);
      const doNumber = `ORD-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;

      // Construct Customer Name for Orders table (matching internal format)
      // "Company - Branch" if branch exists
      const customerNameString = currentBranch.Branch 
         ? `${currentBranch.CompanyName} - ${currentBranch.Branch}`.toUpperCase()
         : currentBranch.CompanyName.toUpperCase();

      const orderRows = cart.map(item => ({
          "Timestamp": new Date(),
          "Status": "Pending",
          "DONumber": doNumber,
          "Delivery Date": deliveryDate,
          "Customer Name": customerNameString,
          "Delivery Address": currentBranch.DeliveryAddress,
          "Contact Person": currentBranch.ContactPerson,
          "Contact Number": currentBranch.ContactNumber,
          "Product Code": item.ProductCode,
          "Order Items": item.ProductName,
          "Quantity": item.qty,
          "UOM": item.uom,
          "Price": 0, // Price 0 for client portal orders (TBD by admin) or fetch price if available
          "LoggedBy": `CLIENT:${currentBranch.Username}`
      }));

      const { error } = await supabase.from('Orders').insert(orderRows);

      if (error) {
          alert("Error: " + error.message);
      } else {
          alert("Order Placed Successfully!");
          router.push('/client-portal/orders');
      }
      setIsSubmitting(false);
  };

  const filteredProducts = products.filter(p => p.ProductName.toLowerCase().includes(searchTerm.toLowerCase()));

  if (loading) return <div className="p-10 text-center font-bold text-gray-400">Loading Catalog...</div>;

  return (
    <div className="bg-gray-50 min-h-screen pb-24 font-sans">
        
        {/* Header */}
        <div className="bg-white sticky top-0 z-10 shadow-sm px-4 py-3 flex items-center gap-3">
            <button onClick={() => router.back()} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200">
                <ChevronLeftIcon className="w-5 h-5 text-gray-600" />
            </button>
            <div className="flex-1">
                <h1 className="text-sm font-black text-gray-800 uppercase tracking-wide">New Order</h1>
                <p className="text-[10px] text-gray-400 font-bold">{currentBranch?.Branch || 'Main Branch'}</p>
            </div>
            <input 
                type="date" 
                className="bg-gray-100 border-none rounded-lg text-xs font-bold p-2 text-gray-600 outline-none"
                value={deliveryDate}
                onChange={e => setDeliveryDate(e.target.value)}
            />
        </div>

        {/* Search */}
        <div className="p-4">
            <input 
                type="text" 
                placeholder="Search products..." 
                className="w-full p-3 rounded-xl border border-gray-200 shadow-sm focus:ring-2 focus:ring-green-500 outline-none text-sm font-bold"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
            />
        </div>

        {/* Product List */}
        <div className="px-4 space-y-3">
            {filteredProducts.map(p => {
                const qty = getItemQty(p.ProductCode);
                return (
                    <div key={p.ProductCode} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex justify-between items-center">
                        <div className="flex-1 pr-2">
                            <div className="font-bold text-gray-800 text-sm uppercase leading-tight">{p.ProductName}</div>
                            <div className="text-[10px] text-gray-400 mt-1 font-bold">{p.BaseUOM}</div>
                        </div>
                        
                        {qty === 0 ? (
                            <button 
                                onClick={() => addToCart(p)}
                                className="bg-green-100 text-green-700 w-8 h-8 rounded-lg flex items-center justify-center font-bold shadow-sm active:scale-95"
                            >
                                <PlusIcon className="w-5 h-5" />
                            </button>
                        ) : (
                            <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-1">
                                <button onClick={() => updateQty(p.ProductCode, -1)} className="w-8 h-8 bg-white rounded shadow-sm flex items-center justify-center text-gray-600 active:scale-95"><MinusIcon className="w-4 h-4"/></button>
                                <span className="font-black text-gray-800 text-sm w-4 text-center">{qty}</span>
                                <button onClick={() => updateQty(p.ProductCode, 1)} className="w-8 h-8 bg-green-600 text-white rounded shadow-sm flex items-center justify-center active:scale-95"><PlusIcon className="w-4 h-4"/></button>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>

        {/* Checkout Bar */}
        {cart.length > 0 && (
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] max-w-md mx-auto">
                <div className="flex justify-between items-center gap-4">
                    <div className="flex items-center gap-3">
                        <div className="bg-green-100 p-2 rounded-full relative">
                            <ShoppingCartIcon className="w-6 h-6 text-green-700" />
                            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-full font-bold">{cart.length}</span>
                        </div>
                        <div className="text-xs font-bold text-gray-500">
                            {cart.reduce((a,b) => a + b.qty, 0)} Items
                        </div>
                    </div>
                    <button 
                        onClick={handleSubmitOrder}
                        disabled={isSubmitting}
                        className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg active:scale-95 disabled:bg-gray-300 transition-all flex-1"
                    >
                        {isSubmitting ? 'Placing Order...' : 'Confirm Order'}
                    </button>
                </div>
            </div>
        )}
    </div>
  );
}