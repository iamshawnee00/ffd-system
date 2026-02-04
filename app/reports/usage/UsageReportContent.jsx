'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSearchParams } from 'next/navigation';

export default function UsageReportContent() {
  const searchParams = useSearchParams();
  const date = searchParams.get('date');
  const type = searchParams.get('type'); // 'daily' or 'weekly'

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // Constants for A4 Layout
  const ITEMS_PER_PAGE = 35; 

  useEffect(() => {
    async function fetchUsage() {
      if (!date) {
        setLoading(false);
        return;
      }
      setLoading(true);

      // Initialize query selecting needed columns
      // Note: Ensure column names match your DB exactly.
      let query = supabase
        .from('Orders')
        .select('"Product Code", "Order Items", Quantity, UOM, "Customer Name", "Delivery Date"');

      let startDate, endDate;

      if (type === 'weekly') {
        const d = new Date(date);
        const day = d.getDay(); 
        // Adjust to Monday start
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
        const start = new Date(d.setDate(diff));
        const end = new Date(d.setDate(diff + 6));
        
        startDate = start.toISOString().slice(0, 10);
        endDate = end.toISOString().slice(0, 10);
        
        console.log(`Fetching WEEKLY usage from ${startDate} to ${endDate}`);
      } else {
        // DAILY USAGE
        // Use the selected date directly
        startDate = date;
        endDate = date;
        console.log(`Fetching DAILY usage for ${date}`);
      }

      // Use .gte and .lte for potentially safer date comparison 
      // (works for both DATE and TIMESTAMP types if time is 00:00:00 or ranges overlap)
      // If your DB is purely DATE type, .eq is fine, but range is safer generally.
      // However, since Batch DO uses .eq and works, let's try to mimic that exact success pattern first,
      // but if that failed for you here, let's try the range approach which covers more edge cases.
      
      if (startDate === endDate) {
         // Exact match for daily to mimic Batch DO success
         query = query.eq('"Delivery Date"', startDate);
      } else {
         // Range for weekly
         query = query.gte('"Delivery Date"', startDate).lte('"Delivery Date"', endDate);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Supabase Error:", error);
        setItems([]);
      } else if (data) {
        console.log(`Fetched ${data.length} rows`);
        
        // Map to flat structure
        const usageList = data.map((row, index) => ({
            id: index,
            description: row["Order Items"],
            qty: Number(row.Quantity || 0),
            uom: row.UOM,
            customer: row["Customer Name"]
        }));
        
        // Sort by Description (A-Z)
        usageList.sort((a, b) => (a.description || "").localeCompare(b.description || ""));

        setItems(usageList);
      }
      setLoading(false);
    }

    if (date) {
        fetchUsage();
    } else {
        setLoading(false);
    }
  }, [date, type]);

  // Format Date for Header (DD-MM-YYYY)
  const formatDate = (dStr) => {
      if (!dStr) return '';
      const d = new Date(dStr);
      return !isNaN(d) ? d.toLocaleDateString('en-GB') : dStr;
  };

  // Pagination Logic
  const pages = [];
  for (let i = 0; i < items.length; i += ITEMS_PER_PAGE) {
    pages.push(items.slice(i, i + ITEMS_PER_PAGE));
  }

  return (
    <div className="bg-gray-100 min-h-screen p-4 md:p-8 print:p-0 print:bg-white text-black font-sans text-xs">
      
       {/* Safer style injection to prevent hydration errors */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { size: A4; margin: 0; }
          body { background: white; -webkit-print-color-adjust: exact; }
          .page-break-after { page-break-after: always; }
          .page-break-after:last-child { page-break-after: auto; }
          .print-hidden { display: none !important; }
        }
      `}} />

      {/* Print Controls */}
      <div className="fixed bottom-8 right-8 print-hidden z-50 flex gap-2">
        <button 
            onClick={() => window.print()}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-full shadow-lg transition transform hover:scale-105 flex items-center gap-2"
        >
            <span>🖨️</span> Print Report
        </button>
      </div>

      {loading && <div className="p-10 text-center">Generating Usage Report...</div>}
      {!loading && !date && <div className="p-10 text-center text-gray-500">Please provide a date parameter.</div>}
      {!loading && date && items.length === 0 && <div className="p-10 text-center text-gray-500">No orders found for {date}.</div>}

      {/* MOBILE VIEW */}
      {!loading && items.length > 0 && (
        <div className="block md:hidden print:hidden space-y-3 mb-20">
          <div className="bg-white p-4 rounded-lg shadow mb-4">
            <h2 className="text-xl font-bold uppercase mb-1">Usage Summary</h2>
            <div className="text-gray-500 font-bold text-xs uppercase">Date: {formatDate(date)}</div>
            <div className="text-gray-400 text-[10px] mt-1">Total Items: {items.length}</div>
          </div>
          {items.map((item, idx) => (
            <div key={idx} className="bg-white p-4 rounded-lg shadow border border-gray-100 flex flex-col gap-2">
              <div className="flex justify-between items-start">
                <span className="font-bold text-sm text-gray-800">{item.description}</span>
                <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded">
                  {item.qty} {item.uom}
                </span>
              </div>
              <div className="text-xs text-gray-500 border-t pt-2 mt-1">
                <span className="font-semibold text-gray-400 uppercase text-[10px] block mb-0.5">Customer</span>
                {item.customer}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* DESKTOP / PRINT VIEW */}
      <div className="hidden md:block print:block">
        {!loading && items.length > 0 && pages.map((pageItems, pageIndex) => (
            <div key={pageIndex} 
                className="mx-auto bg-white shadow-xl mb-8 print:shadow-none print:mb-0 flex flex-col relative page-break-after overflow-hidden box-border" 
                style={{ width: '210mm', height: '297mm', padding: '10mm', paddingBottom: '20mm' }}> 
                
                {/* --- HEADER (Module 1) --- */}
                <div className="flex justify-between items-start mb-2 border-b-2 border-black pb-2 h-[35mm]">
                <div className="flex gap-3 h-full items-center">
                    <div className="w-16 h-16 relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="https://ik.imagekit.io/dymeconnect/fresherfarmdirect_logo-removebg-preview.png?updatedAt=1760444368116" alt="Logo" className="w-full h-full object-contain" />
                    </div>
                    <div>
                        <h1 className="text-xl font-black uppercase tracking-tight mb-1">FRESHER FARM DIRECT SDN BHD</h1>
                        <div className="text-[9px] leading-tight text-gray-800 font-medium">
                            <p>Reg No: 200701010054 | TIN No: C20176000020 | MSIC Code: 46319</p>
                            <p>Address: Lot 18 & 19, Kompleks Selayang, Batu 8-1/2, Jalan Ipoh, 68100 Batu Caves, Selangor</p>
                            <p>Tel: 011-2862 8667 | Email: fresherfarmdirect2.0@gmail.com</p>
                        </div>
                    </div>
                </div>
                
                {/* DAILY USAGE FORM TITLE (Moved to Right) */}
                <div className="text-right self-center">
                    <h2 className="text-4xl font-black uppercase tracking-average leading-none">DAILY<br/>usage</h2>
                </div>
                </div>

                {/* --- TITLE & METADATA (Module 2) --- */}
                <div className="mb-2 flex justify-between items-end">
                    {/* Date (Moved to Left & Enlarged) */}
                    <div className="text-left">
                        <span className="text-gray-500 font-bold block text-xs uppercase mb-1">Date:</span>
                        <span className="text-3xl font-black tracking-tight">{formatDate(date)}</span>
                    </div>
                </div>

                {/* --- TABLE (Module 3) --- */}
                <div className="flex-grow border-t-2 border-black relative">
                <table className="w-full border-collapse table-fixed text-[10px]">
                    <thead className="h-6 bg-gray-100 print:bg-transparent">
                    <tr className="border-b-2 border-black text-black uppercase font-bold">
                        <th className="py-1 px-1 text-center w-8 border-r border-black">Item</th>
                        {/* 4. Larger width for product (increased from 40% to ~55%) */}
                        <th className="py-1 px-2 text-left border-r border-black w-[50%]">Description</th>
                        <th className="py-1 px-1 text-center w-10 border-r border-black">QTY</th>
                        <th className="py-1 px-1 text-center w-10 border-r border-black">UOM</th>
                        {/* 4. Reduce width for customer. No second line (handled by truncate) */}
                        <th className="py-1 px-2 text-left w-[35%]">CUSTOMER</th>
                    </tr>
                    </thead>
                    <tbody>
                    {pageItems.map((item, index) => (
                        <tr key={index} className="border-b border-gray-300 h-5">
                        <td className="py-1 px-1 text-center border-r border-gray-300 font-bold">{items.indexOf(item) + 1}</td>
                        <td className="py-1 px-2 border-r border-gray-300 font-bold truncate">{item.description}</td>
                        <td className="py-1 px-1 text-center border-r border-gray-300 font-bold">{item.qty}</td>
                        <td className="py-1 px-1 text-center border-r border-gray-300 uppercase">{item.uom}</td>
                        <td className="py-1 px-2 truncate font-medium text-gray-700">{item.customer}</td>
                        </tr>
                    ))}
                    {/* Filler Rows */}
                    {Array.from({ length: Math.max(0, ITEMS_PER_PAGE - pageItems.length) }).map((_, idx) => (
                        <tr key={`fill-${idx}`} className="border-b border-gray-100 h-5">
                            <td className="border-r border-gray-100"></td>
                            <td className="border-r border-gray-100"></td>
                            <td className="border-r border-gray-100"></td>
                            <td className="border-r border-gray-100"></td>
                            <td></td>
                        </tr>
                    ))}
                    </tbody>
                </table>
                </div>

                {/* Page Number Footer */}
                <div className="absolute bottom-4 right-10 text-[9px] text-gray-400">
                    Page {pageIndex + 1} of {pages.length}
                </div>

            </div>
        ))}
      </div>
    </div>
  );
}