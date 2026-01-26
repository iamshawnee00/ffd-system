'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useSearchParams } from 'next/navigation';

export default function UsageReportPage() {
  const searchParams = useSearchParams();
  const date = searchParams.get('date');
  const type = searchParams.get('type'); // 'daily' or 'weekly'

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUsage() {
      if (!date) return;
      setLoading(true);

      let startDate = date;
      let endDate = date;
      let titleDate = date;

      if (type === 'weekly') {
        // Calculate start/end of week
        const d = new Date(date);
        const day = d.getDay(); 
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
        const start = new Date(d.setDate(diff));
        const end = new Date(d.setDate(diff + 6));
        
        startDate = start.toISOString().slice(0, 10);
        endDate = end.toISOString().slice(0, 10);
        titleDate = `${startDate} to ${endDate}`;
      }

      // Fetch Orders for range
      // Note: We need to sum quantities for duplicate items
      const { data, error } = await supabase
        .from('Orders')
        .select('"Product Code", "Order Items", Quantity, UOM')
        .gte('"Delivery Date"', startDate)
        .lte('"Delivery Date"', endDate);

      if (error) {
        console.error("Error:", error);
      } else {
        // Aggregation Logic
        const aggregated = {};
        data.forEach(row => {
          const key = row["Product Code"];
          if (!aggregated[key]) {
            aggregated[key] = {
              code: key,
              name: row["Order Items"],
              uom: row.UOM,
              total: 0
            };
          }
          aggregated[key].total += Number(row.Quantity || 0);
        });

        // Convert to array and sort by Name
        const list = Object.values(aggregated).sort((a, b) => a.name.localeCompare(b.name));
        setItems(list);
      }
      setLoading(false);
    }

    fetchUsage();
  }, [date, type]);

  return (
    <div className="bg-white min-h-screen p-8 text-black">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8 border-b-2 border-black pb-4">
          <h1 className="text-3xl font-bold uppercase mb-2">
            {type === 'weekly' ? 'Weekly' : 'Daily'} Usage Report
          </h1>
          <p className="text-lg font-mono">Date: {date} {type === 'weekly' && '(Week Range)'}</p>
        </div>

        {loading ? (
          <p className="text-center">Calculating usage...</p>
        ) : (
          <>
            <table className="w-full text-left border-collapse border border-black">
              <thead>
                <tr className="bg-gray-200">
                  <th className="border border-black p-2 w-16 text-center">#</th>
                  <th className="border border-black p-2">Item Description</th>
                  <th className="border border-black p-2 w-32 text-center">Total Qty</th>
                  <th className="border border-black p-2 w-24 text-center">UOM</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={item.code}>
                    <td className="border border-black p-2 text-center">{idx + 1}</td>
                    <td className="border border-black p-2 font-medium">
                      {item.name} <span className="text-xs text-gray-500 block">{item.code}</span>
                    </td>
                    <td className="border border-black p-2 text-center font-bold text-lg">{item.total}</td>
                    <td className="border border-black p-2 text-center uppercase">{item.uom}</td>
                  </tr>
                ))}
                {items.length === 0 && (
                   <tr><td colSpan="4" className="p-4 text-center italic">No orders found for this period.</td></tr>
                )}
              </tbody>
            </table>

            <div className="mt-8 flex justify-center print:hidden">
              <button 
                onClick={() => window.print()}
                className="bg-purple-600 text-white font-bold py-3 px-8 rounded shadow hover:bg-purple-700"
              >
                Print Usage Report
              </button>
            </div>
          </>
        )}
      </div>
      <style jsx global>{`
        @media print {
          body { background: white; }
          button { display: none; }
        }
      `}</style>
    </div>
  );
}