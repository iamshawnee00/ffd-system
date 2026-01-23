'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient'; // Fixed path (3 levels up)
import { useParams } from 'next/navigation';

export default function PrintOrderPage() {
  const params = useParams(); // Get ID from URL
  const { id } = params;
  
  const [orderData, setOrderData] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchFullOrder() {
      if (!id) return;

      // 1. Get the specific row clicked to find the DONumber
      const { data: currentItem, error: fetchError } = await supabase
        .from('Orders')
        .select('DONumber')
        .eq('id', id)
        .single();

      if (fetchError || !currentItem) {
        console.error("Error finding order:", fetchError);
        setLoading(false);
        return;
      }

      // 2. Fetch ALL items with this DONumber
      const { data: allItems, error: listError } = await supabase
        .from('Orders')
        .select('*')
        .eq('DONumber', currentItem.DONumber);

      if (listError) {
        console.error("Error fetching items:", listError);
      } else {
        // Use the first item to populate header info (Customer, Date, etc.)
        setOrderData(allItems[0]);
        setItems(allItems);
      }
      setLoading(false);
    }

    fetchFullOrder();
  }, [id]);

  if (loading) return <div className="p-10 text-center">Loading Invoice...</div>;
  if (!orderData) return <div className="p-10 text-center text-red-500">Order not found.</div>;

  return (
    <div className="bg-gray-100 min-h-screen p-8 print:p-0 print:bg-white">
      {/* PAPER CONTAINER */}
      <div className="max-w-[210mm] mx-auto bg-white shadow-lg p-10 print:shadow-none print:w-full print:max-w-none">
        
        {/* --- HEADER --- */}
        <div className="flex justify-between items-start mb-8 border-b-2 border-gray-800 pb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">FRESHER FARM DIRECT SDN BHD</h1>
            <p className="text-xs text-gray-500 mt-1">Reg No: 200701010054 | TIN: C20176000020</p>
            <div className="text-sm mt-3 space-y-1 text-gray-700">
              <p>Lot 18 & 19, Kompleks Selayang, Batu 8-1/2</p>
              <p>Jalan Ipoh, 68100 Batu Caves, Selangor</p>
              <p><strong>Tel:</strong> 011-2862 8667</p>
              <p><strong>Email:</strong> fresherfarmdirect2.0@gmail.com</p>
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-4xl font-bold text-gray-800 uppercase tracking-widest mb-4">Delivery Order</h2>
            <table className="text-sm ml-auto">
              <tbody>
                <tr>
                  <td className="font-bold text-gray-600 pr-4">DO No:</td>
                  <td className="font-bold">{orderData.DONumber}</td>
                </tr>
                <tr>
                  <td className="font-bold text-gray-600 pr-4">Date:</td>
                  <td>{orderData["Delivery Date"]}</td>
                </tr>
                <tr>
                  <td className="font-bold text-gray-600 pr-4">Mode:</td>
                  <td>{orderData["Delivery Mode"] || 'Standard'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* --- CUSTOMER INFO --- */}
        <div className="mb-8 p-4 bg-gray-50 rounded border border-gray-200 print:bg-transparent print:border-none print:p-0">
          <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Deliver To:</h3>
          <p className="text-xl font-bold text-gray-900">{orderData["Customer Name"]}</p>
          <p className="text-sm text-gray-700 whitespace-pre-line mt-1 max-w-md">
            {orderData["Delivery Address"] || "Address not provided"}
          </p>
          {(orderData["Contact Person"] || orderData["Contact Number"]) && (
            <p className="text-sm mt-2 text-gray-600">
              <strong>Contact:</strong> {orderData["Contact Person"]} ({orderData["Contact Number"]})
            </p>
          )}
        </div>

        {/* --- ITEMS TABLE --- */}
        <table className="w-full text-sm mb-8 border-collapse">
          <thead>
            <tr className="bg-gray-100 print:bg-gray-100 border-y-2 border-gray-800">
              <th className="py-3 px-2 text-left w-12">#</th>
              <th className="py-3 px-2 text-left">Item Description</th>
              <th className="py-3 px-2 text-left w-24">Code</th>
              <th className="py-3 px-2 text-center w-20">Qty</th>
              <th className="py-3 px-2 text-center w-20">UOM</th>
              <th className="py-3 px-2 text-left">Notes</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={index} className="border-b border-gray-300">
                <td className="py-3 px-2 text-gray-500">{index + 1}</td>
                <td className="py-3 px-2 font-medium">{item["Order Items"]}</td>
                <td className="py-3 px-2 text-gray-500 text-xs">{item["Product Code"]}</td>
                <td className="py-3 px-2 text-center font-bold">{item["Quantity"]}</td>
                <td className="py-3 px-2 text-center text-xs uppercase">{item["UOM"]}</td>
                <td className="py-3 px-2 italic text-gray-500 text-xs">{item["SpecialNotes"]}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* --- FOOTER / SIGNATURES --- */}
        <div className="mt-16 grid grid-cols-2 gap-20 text-center break-inside-avoid">
          <div>
            <div className="h-20 border-b border-black mb-2"></div>
            <p className="text-sm font-bold">Driver / Storekeeper</p>
            <p className="text-xs text-gray-500">Sign & Date</p>
          </div>
          <div>
            <div className="h-20 border-b border-black mb-2"></div>
            <p className="text-sm font-bold">Received By</p>
            <p className="text-xs text-gray-500">Sign & Chop</p>
          </div>
        </div>

        <div className="mt-8 text-center text-xs text-gray-400">
          <p>Notes: All goods delivered are subject to inspection upon receipt.</p>
          <p>Please return any rejected goods immediately via the driver.</p>
        </div>

      </div>

      {/* --- FLOATING PRINT BUTTON --- */}
      <button 
        onClick={() => window.print()}
        className="fixed bottom-8 right-8 bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-full shadow-2xl print:hidden flex items-center gap-2 z-50 transition-all transform hover:scale-105"
      >
        <span className="text-xl">🖨️</span> Print DO
      </button>

      <style jsx global>{`
        @media print {
          body { background: white; }
          @page { margin: 0; size: auto; }
        }
      `}</style>
    </div>
  );
}