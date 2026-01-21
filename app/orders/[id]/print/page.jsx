// app/orders/[id]/print/page.jsx
"use client";
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useParams } from 'next/navigation';

// Initialize Supabase (Use your own env variables)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function PrintOrderPage() {
  const { id } = useParams(); // Get Order ID from URL
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrder = async () => {
      // 1. Fetch the Order Data
      // Note: Adjust table name if you use 'Orders_Wholesale' vs 'Orders'
      const { data, error } = await supabase
        .from('Orders') 
        .select('*')
        .eq('id', id)
        .single();

      if (error) console.error('Error fetching order:', error);
      else setOrder(data);
      setLoading(false);
    };

    if (id) fetchOrder();
  }, [id]);

  if (loading) return <div>Loading Invoice...</div>;
  if (!order) return <div>Order not found</div>;

  return (
    <div className="p-8 max-w-[210mm] mx-auto bg-white text-black font-sans">
      
      {/* --- HEADER SECTION --- */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold">FRESHER FARM DIRECT SDN BHD</h1>
          <p className="text-sm mt-1">Reg No: 200701010054 | TIN: C20176000020</p>
          <p className="text-sm">Lot 18 & 19, Kompleks Selayang, Batu 8-1/2, Jalan Ipoh</p>
          <p className="text-sm">68100 Batu Caves, Selangor Darul Ehsan</p>
          <p className="text-sm font-semibold mt-1">Tel: 011-2862 8667</p>
        </div>
        <div className="text-right">
          <h2 className="text-3xl font-bold uppercase tracking-widest mb-2">Delivery Order</h2>
          <div className="text-sm">
            <p><strong>DO No:</strong> {order.DONumber}</p>
            <p><strong>Date:</strong> {order["Delivery Date"]}</p>
            <p><strong>Status:</strong> {order.Status}</p>
          </div>
        </div>
      </div>

      <hr className="border-black mb-6" />

      {/* --- CUSTOMER INFO --- */}
      <div className="mb-8">
        <h3 className="font-bold text-lg mb-2">Deliver To:</h3>
        <p className="text-lg font-semibold">{order["Customer Name"]}</p>
        <p>{order["Delivery Address"] || "Address not provided"}</p>
        <p>Contact: {order["Contact Person"]} ({order["Contact Number"]})</p>
      </div>

      {/* --- ORDER TABLE --- */}
      <table className="w-full border-collapse border border-black text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-black p-2 text-left">Item Code</th>
            <th className="border border-black p-2 text-left">Description</th>
            <th className="border border-black p-2 text-center">Qty</th>
            <th className="border border-black p-2 text-center">UOM</th>
            {/* Hide Price if this is just a DO, show if Invoice */}
            <th className="border border-black p-2 text-right">Notes</th> 
          </tr>
        </thead>
        <tbody>
           {/* NOTE: Your CSV data structure seems to have 1 row per item. 
              If 'order' is just ONE row, we display it. 
              If you have multiple items per DO, you need to fetch all rows with this DONumber.
           */}
           <tr className="border border-black">
              <td className="border border-black p-2">{order["Product Code"]}</td>
              <td className="border border-black p-2">{order["Order Items"] || order["Product Name"]}</td>
              <td className="border border-black p-2 text-center">{order.Quantity}</td>
              <td className="border border-black p-2 text-center">{order.UOM}</td>
              <td className="border border-black p-2 text-right">{order.SpecialNotes}</td>
           </tr>
        </tbody>
      </table>

      {/* --- FOOTER --- */}
      <div className="mt-12 grid grid-cols-2 gap-8 text-center text-sm">
        <div>
          <p className="mb-8 border-b border-black inline-block min-w-[200px]"></p>
          <p>Driver / Storekeeper</p>
        </div>
        <div>
          <p className="mb-8 border-b border-black inline-block min-w-[200px]"></p>
          <p>Received By (Sign & Chop)</p>
        </div>
      </div>

      <div className="mt-8 text-xs text-center text-gray-500">
        Notes: All goods delivered are subject to inspection upon receipt.
      </div>

      {/* --- PRINT BUTTON (Hidden when printing) --- */}
      <style jsx global>{`
        @media print {
          .no-print { display: none; }
          body { -webkit-print-color-adjust: exact; }
        }
      `}</style>
      
      <button 
        onClick={() => window.print()}
        className="no-print fixed bottom-8 right-8 bg-blue-600 text-white px-6 py-3 rounded-full shadow-lg hover:bg-blue-700 font-bold"
      >
        🖨️ Print DO
      </button>

    </div>
  );
}