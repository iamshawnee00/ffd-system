'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSearchParams } from 'next/navigation';

export default function RouteReportContent() {
  const searchParams = useSearchParams();
  const date = searchParams.get('date');

  const [routeData, setRouteData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAndMapRoutes() {
      if (!date) return;
      setLoading(true);

      // 1. Fetch Supabase Orders to get Customers, Addresses, and Drivers
      const { data: orders } = await supabase
        .from('Orders')
        .select('DONumber, "Customer Name", "Delivery Address", "Delivery Mode", "Status", DriverName, "Contact Number"')
        .eq('Delivery Date', date);

      // 2. Fetch Live Shipday Orders to get the precise optimized Route Sequences
      let shipdayOrders = [];
      try {
        const res = await fetch('/api/shipday/active');
        if (res.ok) {
          shipdayOrders = await res.json();
        }
      } catch (e) {
        console.error("Shipday fetch error", e);
      }

      // 3. Process & Merge Data & Count Items
      const uniqueDOs = {};
      (orders || []).forEach(o => {
        const doNum = String(o.DONumber).trim();
        if (!uniqueDOs[doNum]) {
            // Initialize DO entry and start item count at 1
            uniqueDOs[doNum] = { ...o, itemCount: 1 };
        } else {
            // Increment item count for every row sharing the same DO Number
            uniqueDOs[doNum].itemCount += 1;
        }
      });

      // 4. Attach Shipday sequence based on optimized route times
      const safeShipdayOrders = Array.isArray(shipdayOrders) ? shipdayOrders : [];
      safeShipdayOrders.forEach((so) => {
          const shipdayDoNum = String(so.orderNumber || so.order_number || '').trim();
          if (uniqueDOs[shipdayDoNum]) {
              // Shipday updates these times when a route is planned/optimized
              const expectedDate = so.expectedDeliveryDate || '9999-99-99';
              const expectedTime = so.expectedDeliveryTime || '23:59:59';
              const eta = so.etaTime || expectedTime; 
              uniqueDOs[shipdayDoNum].shipdayTime = `${expectedDate}T${eta}`;
          }
      });

      // 5. Group perfectly by Driver
      const drivers = {};
      Object.values(uniqueDOs).forEach(o => {
          const driver = o.DriverName || o["Delivery Mode"] || 'DRIVER';
          if (!drivers[driver]) drivers[driver] = [];
          drivers[driver].push(o);
      });

      // 6. Sort each driver's list by Shipday's expected route time, fallback to customer name
      Object.keys(drivers).forEach(d => {
          drivers[d].sort((a, b) => {
              const timeA = a.shipdayTime || '9999-99-99T23:59:59';
              const timeB = b.shipdayTime || '9999-99-99T23:59:59';
              if (timeA !== timeB) return timeA.localeCompare(timeB);
              return String(a["Customer Name"]).localeCompare(String(b["Customer Name"]));
          });
      });

      // 7. Sort the drivers themselves: alphabetical, but "DRIVER" (unassigned) and "Self Pick-up" go to the bottom
      const groupedArray = Object.keys(drivers).sort((a, b) => {
          const aUpper = a.toUpperCase();
          const bUpper = b.toUpperCase();
          
          const isSelfA = aUpper.includes('SELF PICK');
          const isSelfB = bUpper.includes('SELF PICK');
          
          const isDriverA = aUpper === 'DRIVER' || aUpper === 'UNASSIGNED';
          const isDriverB = bUpper === 'DRIVER' || bUpper === 'UNASSIGNED';

          // 1st priority: push Self Pick-up to the absolute bottom
          if (isSelfA && !isSelfB) return 1;
          if (!isSelfA && isSelfB) return -1;

          // 2nd priority: push generic "DRIVER" to the bottom, just above Self Pick-up
          if (isDriverA && !isDriverB) return 1;
          if (!isDriverA && isDriverB) return -1;

          // Standard alphabetical for actual driver names
          return a.localeCompare(b);
      }).map(d => ({
          driver: d,
          orders: drivers[d]
      }));

      setRouteData(groupedArray);
      setLoading(false);
    }
    
    fetchAndMapRoutes();
  }, [date]);

  if (loading) return <div className="p-10 text-white text-center font-bold tracking-widest uppercase">Calculating Route Sequences...</div>;
  if (!date) return <div className="p-10 text-center text-slate-400">Please provide a date parameter.</div>;
  if (routeData.length === 0) return <div className="p-10 text-center text-slate-400">No scheduled routes found for this date.</div>;

  return (
    <div className="bg-white p-8 rounded-[2rem] shadow-xl print:shadow-none print:p-0 text-black font-sans">
       <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          
          /* Force overwrite global layouts to remove huge grey top space */
          html, body, main { 
            background: white !important; 
            margin: 0 !important; 
            padding: 0 !important; 
            -webkit-print-color-adjust: exact; 
          }
          main {
            padding-top: 0 !important; 
          }
          
          .print-hidden { display: none !important; }
          
          /* Prevent splitting elements across pages */
          .break-inside-avoid {
             page-break-inside: avoid !important;
             break-inside: avoid !important;
             display: block; /* Ensure block formatting context for breaks to apply */
          }
          
          tr.break-inside-avoid {
             display: table-row; /* Keep rows as rows, but avoid breaks */
          }
        }
      `}} />

      <div className="flex justify-between items-center mb-8 print-hidden">
         <h2 className="text-xl font-black uppercase text-gray-800">Masterlist - {date}</h2>
         <button onClick={() => window.print()} className="bg-orange-500 hover:bg-orange-600 transition active:scale-95 text-white px-8 py-4 rounded-full font-black shadow-lg flex items-center gap-2 uppercase tracking-widest text-sm">
            <span>🖨️</span> Print Driver Routes
         </button>
      </div>

      {routeData.map((group) => (
         <div key={group.driver} className="mb-20 print:mb-16 break-inside-avoid">
            {/* DRIVER HEADER */}
            <div className="border-b-2 border-black pb-2 mb-4 flex justify-between items-end">
                <div>
                    <h3 className="text-2xl font-black uppercase tracking-tighter leading-none">{date} - {group.driver}</h3>
                </div>
                <div className="font-black text-gray-800 uppercase text-xs border-2 border-black px-2 py-1 rounded-md">
                    Total Stops: <span className="text-base ml-1">{group.orders.length}</span>
                </div>
            </div>

            {/* ROUTE SEQUENCE COMPACT TABLE */}
            <table className="w-full text-xs border-collapse border-2 border-black">
                <thead>
                    <tr className="bg-gray-100 border-b-2 border-black text-[10px] uppercase font-black">
                        <th className="py-1.5 px-2 text-center w-10 border-r border-black">Stop</th>
                        <th className="py-1.5 px-2 text-left w-24 border-r border-black">DO Number</th>
                        <th className="py-1.5 px-2 text-left border-r border-black">Customer</th>
                        <th className="py-1.5 px-2 text-center w-12 border-r border-black">Final</th>
                        <th className="py-1.5 px-2 text-center w-12">Load</th>
                    </tr>
                </thead>
                <tbody>
                    {group.orders.map((o, i) => (
                        <tr key={o.DONumber} className="border-b border-black break-inside-avoid">
                            <td className="py-1 px-2 text-center border-r border-black bg-white align-middle"></td>
                            <td className="py-1 px-2 border-r border-black align-middle">
                                <div className="font-mono font-black text-xs leading-none">{o.DONumber}</div>
                            </td>
                            <td className="py-2 px-3 border-r border-black align-middle">
                                <div className="flex justify-between items-center gap-2">
                                    <div className="font-black uppercase text-[12.5px] leading-tight text-black">{o["Customer Name"]}</div>
                                    <div className="text-[10px] font-bold whitespace-nowrap bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                                        {o.itemCount} {o.itemCount === 1 ? 'Item' : 'Items'}
                                    </div>
                                </div>
                            </td>
                            <td className="p-1 border-r border-black align-middle">
                                <div className="w-5 h-5 border-2 border-gray-400 rounded-sm mx-auto"></div>
                            </td>
                            <td className="p-1 align-middle">
                                <div className="w-5 h-5 border-2 border-gray-400 rounded-sm mx-auto"></div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
         </div>
      ))}
    </div>
  );
}