'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient'; // Fixed: Changed from ../../../ to ../../
import { useSearchParams } from 'next/navigation';

export default function BatchDOPage() {
  const searchParams = useSearchParams();
  const date = searchParams.get('date');
  const [doList, setDoList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAllDOs() {
      if (!date) return;
      setLoading(true);

      // 1. Fetch raw rows
      const { data, error } = await supabase
        .from('Orders')
        .select('*')
        .eq('"Delivery Date"', date)
        .order('DONumber'); // Important to group them

      if (!error && data) {
        // 2. Group by DO Number
        const grouped = {};
        data.forEach(row => {
          if (!grouped[row.DONumber]) {
            grouped[row.DONumber] = {
              info: row, // Keep first row for header info
              items: []
            };
          }
          grouped[row.DONumber].items.push(row);
        });
        setDoList(Object.values(grouped));
      }
      setLoading(false);
    }
    fetchAllDOs();
  }, [date]);

  if (loading) return <div className="p-10 text-center">Generating Batch DOs...</div>;

  return (
    <div className="bg-gray-100 min-h-screen p-8 print:p-0 print:bg-white">
      
      {/* Print Controls */}
      <div className="fixed top-4 right-4 print:hidden z-50">
        <button 
            onClick={() => window.print()}
            className="bg-blue-600 text-white font-bold py-3 px-6 rounded-full shadow-lg"
        >
            🖨️ Print All ({doList.length})
        </button>
      </div>

      {doList.length === 0 ? (
        <div className="text-center mt-20 text-gray-500">No orders found for {date}</div>
      ) : (
        doList.map((order, idx) => (
          <div key={order.info.DONumber} className="page-break-after">
            <SingleDOView orderData={order.info} items={order.items} />
          </div>
        ))
      )}

      <style jsx global>{`
        @media print {
          body { background: white; }
          .page-break-after { page-break-after: always; }
        }
      `}</style>
    </div>
  );
}

// --- REUSABLE DO COMPONENT (Mini version of your Print Template) ---
function SingleDOView({ orderData, items }) {
  return (
    <div className="max-w-[210mm] mx-auto bg-white shadow-lg p-10 mb-8 print:shadow-none print:w-full print:max-w-none print:mb-0 print:p-8">
      {/* HEADER */}
      <div className="flex justify-between items-start mb-6 border-b-2 border-gray-800 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">FRESHER FARM DIRECT SDN BHD</h1>
            <p className="text-xs text-gray-500 mt-1">Reg No: 200701010054</p>
            <div className="text-xs mt-2 space-y-0.5 text-gray-700">
              <p>Lot 18 & 19, Kompleks Selayang, Batu 8-1/2</p>
              <p>Jalan Ipoh, 68100 Batu Caves, Selangor</p>
              <p><strong>Tel:</strong> 011-2862 8667</p>
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-3xl font-bold text-gray-800 uppercase tracking-widest mb-2">Delivery Order</h2>
            <div className="text-sm">
                <p><strong>DO No:</strong> {orderData.DONumber}</p>
                <p><strong>Date:</strong> {orderData["Delivery Date"]}</p>
            </div>
          </div>
        </div>

        {/* CUSTOMER */}
        <div className="mb-6 p-3 bg-gray-50 rounded border border-gray-200 print:border-none print:p-0">
          <p className="text-lg font-bold text-gray-900">{orderData["Customer Name"]}</p>
          <p className="text-sm text-gray-700 mt-1">{orderData["Delivery Address"]}</p>
          <p className="text-sm text-gray-600">Tel: {orderData["Contact Number"]}</p>
        </div>

        {/* ITEMS */}
        <table className="w-full text-sm mb-6 border-collapse">
          <thead>
            <tr className="bg-gray-100 print:bg-gray-100 border-y-2 border-gray-800">
              <th className="py-2 px-2 text-left w-10">#</th>
              <th className="py-2 px-2 text-left">Description</th>
              <th className="py-2 px-2 text-center w-16">Qty</th>
              <th className="py-2 px-2 text-center w-16">UOM</th>
              <th className="py-2 px-2 text-left">Notes</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={index} className="border-b border-gray-300">
                <td className="py-2 px-2 text-gray-500">{index + 1}</td>
                <td className="py-2 px-2 font-medium">{item["Order Items"]}</td>
                <td className="py-2 px-2 text-center font-bold">{item["Quantity"]}</td>
                <td className="py-2 px-2 text-center text-xs uppercase">{item["UOM"]}</td>
                <td className="py-2 px-2 italic text-gray-500 text-xs">{item["SpecialNotes"]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {/* SIGNATURES */}
        <div className="mt-12 grid grid-cols-2 gap-10 text-center">
            <div><div className="border-b border-black h-12"></div><p className="text-xs mt-1">Driver Sign</p></div>
            <div><div className="border-b border-black h-12"></div><p className="text-xs mt-1">Customer Sign & Chop</p></div>
        </div>
    </div>
  );
}