'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSearchParams } from 'next/navigation';

export default function UsageReportContent() {
  const searchParams = useSearchParams();
  const date = searchParams.get('date');

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // Constants for A4 Layout - Standardized to 28 for consistency with DO reports
  const ITEMS_PER_PAGE = 28; 

  useEffect(() => {
    async function fetchUsage() {
      if (!date) {
        setLoading(false);
        return;
      }
      setLoading(true);

      // Fetch Orders for the specific date using exact match
      const { data, error } = await supabase
        .from('Orders')
        .select('*') 
        .eq('"Delivery Date"', date);

      if (error) {
        console.error("Supabase Error:", error);
        setItems([]);
      } else if (data) {
        // Map to flat structure for display and FORCE UPPERCASE for all text fields
        const usageList = data.map((row, index) => ({
            id: index,
            description: String(row["Order Items"] || "").toUpperCase(), 
            qty: Number(row.Quantity || 0),
            uom: String(row.UOM || "").toUpperCase(),
            customer: String(row["Customer Name"] || "").toUpperCase()
        }));
        
        // Sort by Description (A-Z) so similar items are grouped visually
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
  }, [date]);

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
    <div className="bg-gray-100 min-h-screen p-0 md:p-8 print:p-0 print:bg-white text-black font-sans text-xs">
      
      {/* Aggressive Print Styles to bypass Mobile UI Layout constraints */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { size: A4; margin: 0; }
          
          /* 1. Neutralize global app layout specifically for printing */
          html, body {
            height: auto !important;
            min-height: 0 !important;
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
          }

          /* 2. Unstick parent wrappers to allow pagination flow */
          main, #__next, .flex-1, div[class*="h-[100dvh]"], div[class*="h-screen"] {
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            overflow: visible !important;
            display: block !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          /* 3. Hide all UI elements including navigation bars and menu pages */
          nav, aside, button, .fixed, .print-hidden, .z-[60], .z-[200] { 
            display: none !important; 
          }
          
          /* 4. Page Break Logic */
          .page-wrapper {
             page-break-after: always !important;
             display: block !important;
             margin: 0 !important;
             padding: 0 !important;
             height: 297mm !important;
             overflow: hidden !important;
          }
          .page-wrapper:last-child {
             page-break-after: auto !important;
          }

          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
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

      {loading && <div className="p-10 text-center font-black text-gray-400 animate-pulse uppercase tracking-widest">Generating Usage Report...</div>}
      {!loading && !date && <div className="p-10 text-center text-gray-500">Please provide a date parameter.</div>}
      {!loading && date && items.length === 0 && <div className="p-10 text-center text-gray-500">No orders found for {date}.</div>}

      {/* MOBILE VIEW (HIDDEN IN PRINT) */}
      {!loading && items.length > 0 && (
        <div className="block md:hidden print:hidden space-y-3 mb-20 px-3 pt-3">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-4">
            <h2 className="text-xl font-black uppercase tracking-tight mb-1">Usage Summary</h2>
            <div className="text-gray-500 font-bold text-xs uppercase">Date: {formatDate(date)}</div>
            <div className="text-gray-400 text-[10px] mt-1 font-black uppercase tracking-widest">Total Items: {items.length}</div>
          </div>
          {items.map((item, idx) => (
            <div key={idx} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-2">
              <div className="flex justify-between items-start">
                <span className="font-black text-sm text-gray-800 uppercase leading-tight">{item.description}</span>
                <span className="bg-blue-100 text-blue-800 text-[10px] font-black px-2.5 py-1 rounded-lg uppercase border border-blue-200 shadow-sm">
                  {item.qty} {item.uom}
                </span>
              </div>
              <div className="text-xs text-gray-500 border-t border-gray-50 pt-2 mt-1">
                <span className="font-black text-gray-400 uppercase text-[9px] block mb-0.5 tracking-widest">Customer</span>
                <span className="uppercase font-bold text-gray-700">{item.customer}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* DESKTOP / PRINT VIEW */}
      <div className="hidden md:flex flex-col items-center print:flex">
        {!loading && items.length > 0 && pages.map((pageItems, pageIndex) => (
            <div key={pageIndex} 
                className="mx-auto bg-white shadow-xl print:shadow-none flex flex-col relative overflow-hidden box-border page-wrapper" 
                style={{ width: '210mm', height: '297mm', padding: '10mm' }}> 
                
                {/* --- HEADER (Module 1) --- */}
                <div className="flex justify-between items-start mb-2 border-b-2 border-black pb-2 h-[35mm] shrink-0">
                  <div className="flex gap-4 h-full items-center">
                      <div className="w-16 h-16 relative">
                          <img src="https://ik.imagekit.io/dymeconnect/fresherfarmdirect_logo-removebg-preview.png?updatedAt=1760444368116" alt="Logo" className="w-full h-full object-contain" />
                      </div>
                      <div>
                          <h1 className="text-xl font-black uppercase tracking-tight mb-1 leading-none">FRESHER FARM DIRECT SDN BHD</h1>
                          <div className="text-[9px] leading-tight text-gray-800 font-bold uppercase">
                              <p>Reg No: 200701010054 | TIN No: C20176000020 | MSIC Code: 46319</p>
                              <p>Address: Lot 18 & 19, Kompleks Selayang, Batu 8-1/2, Jalan Ipoh, 68100 Batu Caves, Selangor</p>
                              <p>Tel: 011-2862 8667 | Email: fresherfarmdirect2.0@gmail.com</p>
                          </div>
                      </div>
                  </div>
                  
                  {/* DAILY USAGE FORM TITLE */}
                  <div className="text-right self-center">
                      <h2 className="text-4xl font-black uppercase tracking-tighter leading-none">DAILY<br/>USAGE</h2>
                  </div>
                </div>

                {/* --- TITLE & METADATA (Module 2) --- */}
                <div className="mb-4 flex justify-between items-end shrink-0">
                    <div className="text-left">
                        <span className="text-gray-500 font-black block text-[10px] uppercase mb-1 tracking-widest">Target Date:</span>
                        <span className="text-3xl font-black tracking-tight">{formatDate(date)}</span>
                    </div>
                    <div className="text-right">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Page {pageIndex + 1} of {pages.length}</span>
                    </div>
                </div>

                {/* --- TABLE (Module 3) --- */}
                <div className="flex-grow border-t-2 border-black relative">
                  <table className="w-full border-collapse table-fixed text-[10px]">
                      <thead className="h-6 bg-gray-100 print:bg-transparent">
                        <tr className="border-b-2 border-black text-black uppercase font-black text-[9px]">
                            <th className="py-1 px-1 text-center w-10 border-r border-black">Item</th>
                            <th className="py-1 px-2 text-left border-r border-black w-[50%]">Description</th>
                            <th className="py-1 px-1 text-center w-14 border-r border-black">QTY</th>
                            <th className="py-1 px-1 text-center w-14 border-r border-black">UOM</th>
                            <th className="py-1 px-2 text-left w-[35%]">CUSTOMER</th>
                        </tr>
                      </thead>
                      <tbody>
                      {pageItems.map((item, index) => (
                          <tr key={index} className="border-b border-gray-300 h-6">
                            <td className="py-1 px-1 text-center border-r border-gray-300 font-bold">{items.indexOf(item) + 1}</td>
                            <td className="py-1 px-2 border-r border-gray-300 font-black truncate uppercase">{item.description}</td>
                            <td className="py-1 px-1 text-center border-r border-gray-300 font-black">{item.qty}</td>
                            <td className="py-1 px-1 text-center border-r border-gray-300 uppercase font-black">{item.uom}</td>
                            <td className="py-1 px-2 truncate font-bold text-gray-700 uppercase">{item.customer}</td>
                          </tr>
                      ))}
                      {/* Filler Rows to maintain consistent footer anchor */}
                      {Array.from({ length: Math.max(0, ITEMS_PER_PAGE - pageItems.length) }).map((_, idx) => (
                          <tr key={`fill-${idx}`} className="border-b border-gray-100 h-6">
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

                {/* Print Footer */}
                <div className="pt-4 border-t border-gray-200 mt-auto shrink-0 flex justify-between items-center text-[8px] font-black text-gray-400 uppercase tracking-widest">
                    <span>Generated by FFD Intelligence Engine</span>
                    <span>{new Date().toLocaleString('en-GB')}</span>
                </div>

            </div>
        ))}
      </div>
    </div>
  );
}