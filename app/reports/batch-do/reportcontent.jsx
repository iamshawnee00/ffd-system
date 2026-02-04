'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient'; 
import { useSearchParams } from 'next/navigation';

export default function BatchDoReportContent() {
  const searchParams = useSearchParams();
  const date = searchParams.get('date');
  const driverFilter = searchParams.get('driver'); 

  const [doList, setDoList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  // Constants
  const ITEMS_PER_PAGE = 18; 

  useEffect(() => {
    async function fetchAllDOs() {
      if (!date) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setErrorMsg(null);

      console.log("🚀 Starting Fetch - Date:", date, "Driver:", driverFilter || "ALL");

      try {
        // 1. Fetch raw rows
        let query = supabase
          .from('Orders')
          .select('*')
          // Ensure exact column name matching. 
          // If your DB column is "Delivery Date", this is correct.
          .eq('Delivery Date', date) 
          .order('DONumber');

        // If driver filter is present AND not empty
        if (driverFilter && driverFilter.trim() !== '') {
            console.log("Applying Driver Filter:", driverFilter);
            query = query.eq('DriverName', driverFilter);
        }

        const { data, error } = await query;

        if (error) {
          console.error("❌ Supabase Error:", error);
          setErrorMsg(error.message);
          setDoList([]);
        } else if (data) {
          console.log("✅ Fetched Orders Count:", data.length);
          
          if (data.length === 0) {
             console.warn("⚠️ No data returned for this date.");
          }

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
          
          const groupedArray = Object.values(grouped);
          // Optional: Sort by DO Number if not already
          groupedArray.sort((a, b) => (a.info.DONumber || "").localeCompare(b.info.DONumber || ""));
          
          setDoList(groupedArray);
        }
      } catch (err) {
          console.error("Unexpected Error:", err);
          setErrorMsg(err.message);
      }
      setLoading(false);
    }
    
    // Only run if date is available
    if (date) {
        fetchAllDOs();
    } else {
        setLoading(false);
    }
  }, [date, driverFilter]);

  // Handle Loading & Empty States
  if (loading) return <div className="p-10 text-center">Generating Batch DOs...</div>;
  if (!date) return <div className="p-10 text-center text-gray-500">Please provide a date parameter (e.g., ?date=YYYY-MM-DD).</div>;
  
  if (errorMsg) return (
    <div className="p-10 text-center text-red-500">
      <p>Error fetching data: {errorMsg}</p>
      <p className="text-sm text-gray-400 mt-2">Check console for details.</p>
    </div>
  );

  if (doList.length === 0) return <div className="p-10 text-center text-gray-500">No orders found for {date} {driverFilter ? `assigned to ${driverFilter}` : ''}.</div>;

  return (
    <div className="bg-gray-100 min-h-screen p-8 print:p-0 print:bg-white text-black font-sans">
      
      {/* Safer style injection */}
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
      <div className="fixed top-4 right-4 print-hidden z-50 flex gap-2">
        <button 
            onClick={() => window.print()}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-full shadow-lg transition transform hover:scale-105 flex items-center gap-2"
        >
            <span>🖨️</span> Print All ({doList.length})
        </button>
      </div>

      {doList.map((order) => (
        <div key={order.info.DONumber} className="page-break-after">
            <SingleDOComponent orderData={order.info} items={order.items} itemsPerPage={ITEMS_PER_PAGE} />
        </div>
      ))}
    </div>
  );
}

// --- REUSABLE COMPONENT (Single DO Page) ---
function SingleDOComponent({ orderData, items, itemsPerPage }) {
  // Pagination for this specific order
  const pages = [];
  for (let i = 0; i < items.length; i += itemsPerPage) {
    pages.push(items.slice(i, i + itemsPerPage));
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return !isNaN(d) ? d.toLocaleDateString('en-GB') : dateStr;
  };

  return (
    <>
      {pages.map((pageItems, pageIndex) => (
        <div key={pageIndex} 
             className="mx-auto bg-white shadow-xl mb-8 print:shadow-none print:mb-0 flex flex-col relative page-break-after overflow-hidden box-border" 
             style={{ width: '210mm', height: '297mm', padding: '10mm' }}>
          
          {/* --- HEADER --- */}
          <div className="flex justify-between items-start mb-2 border-b-2 border-black pb-2 h-[35mm]">
             <div className="flex gap-3 h-full items-center">
                <div className="w-16 h-16 relative">
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
             
             <div className="text-right self-center">
                  <h2 className="text-3xl font-black uppercase tracking-widest leading-none">DELIVERY<br/>ORDER</h2>
             </div>
          </div>

          {/* --- INFO --- */}
          <div className="h-[35mm] flex justify-between items-start text-xs pt-1 mb-0">
              <div className="w-[60%] pr-2">
                  <div className="mb-2">
                      <span className="font-bold text-[10px] text-gray-500 uppercase tracking-widest block mb-0.5">Deliver To:</span>
                      <div className="font-black text-lg uppercase leading-tight mb-0.5">{orderData["Customer Name"]}</div>
                      <div className="whitespace-pre-line leading-tight text-gray-700 mb-0.5">{orderData["Delivery Address"]}</div>
                      <div className="font-bold text-gray-800">
                          {orderData["Contact Number"]} {orderData["Contact Person"] ? `(${orderData["Contact Person"]})` : ''}
                      </div>
                  </div>
              </div>

              <div className="w-[35%]">
                  <div className="grid grid-cols-[60px_1fr] gap-y-0.5 text-right border-l-2 border-gray-100 pl-4 py-1">
                      <span className="font-bold text-gray-500">DO No:</span>
                      <span className="font-bold text-black text-sm">{orderData.DONumber}</span>

                      <span className="font-bold text-gray-500">Date:</span>
                      <span className="font-bold text-black">{formatDate(orderData["Delivery Date"])}</span>

                      <span className="font-bold text-gray-500">Status:</span>
                      <span className="font-bold uppercase text-black">{orderData["Delivery Mode"] || 'DRIVER'}</span>

                      <span className="font-bold text-gray-500">Page:</span>
                      <span className="font-bold text-black">{pageIndex + 1} / {pages.length}</span>
                  </div>
              </div>
          </div>

          {/* --- ITEMS --- */}
          <div className="flex-grow border-t-2 border-black relative mt-0">
            <table className="w-full text-xs border-collapse table-fixed">
              <thead className="h-8">
                <tr className="border-b-2 border-black text-black uppercase font-bold bg-gray-100 print:bg-transparent">
                  <th className="py-1 px-1 text-center w-8 border-r border-black">No</th>
                  <th className="py-1 px-2 text-left border-r border-black w-auto">Description</th>
                  <th className="py-1 px-1 text-center w-10 border-r border-black">Qty</th>
                  <th className="py-1 px-1 text-center w-12 border-r border-black">UOM</th>
                  <th className="py-1 px-1 text-center w-24 border-r border-black">Wgt</th>
                  <th className="py-1 px-1 text-right w-16">Price</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((item, index) => (
                  <tr key={index} className="border-b border-gray-200 h-7">
                    <td className="py-1 px-1 text-center border-r border-gray-300 text-[10px]">{index + 1 + (pageIndex * itemsPerPage)}</td>
                    <td className="py-1 px-2 border-r border-gray-300 font-bold truncate text-[11px]">
                        {item["Order Items"]}
                    </td>
                    <td className="py-1 px-1 text-center border-r border-gray-300 font-bold text-[11px]">{item["Quantity"]}</td>
                    <td className="py-1 px-1 text-center border-r border-gray-300 uppercase text-[10px]">{item["UOM"]}</td>
                    <td className="py-1 px-1 text-center border-r border-gray-300"></td>
                    <td className="py-1 px-1 text-right text-[11px]">{item.Price > 0 ? Number(item.Price).toFixed(2) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* --- FOOTER --- */}
          <div className="h-[55mm] mt-auto">
              <div className="mb-2 h-[20mm]">
                  <div className="font-bold text-[10px] uppercase mb-0.5">NOTE</div>
                  <div className="border border-black h-full p-1 text-[10px] leading-tight overflow-hidden"></div>
              </div>

              <div className="h-[25mm] relative">
                 <div className="grid grid-cols-3 gap-4 pt-1 absolute bottom-0 w-full">
                    <div className="mt-8 pt-1 text-center relative">
                        {/* DRIVER NAME FROM DB */}
                        {orderData.DriverName && (
                            <div className="absolute bottom-6 left-0 w-full text-center font-bold text-xs uppercase tracking-wider">
                                {orderData.DriverName}
                            </div>
                        )}
                        <div className="border-t border-black w-3/4 mx-auto"></div>
                        <p className="font-bold uppercase text-[10px] mt-1">PEMANDU</p>
                    </div>
                    <div className="mt-8 pt-1 text-center">
                        <div className="border-t border-black w-3/4 mx-auto"></div>
                        <p className="font-bold uppercase text-[10px] mt-1">TEAM QC</p>
                    </div>
                    <div className="mt-8 pt-1 text-center">
                        <div className="border-t border-black w-3/4 mx-auto"></div>
                        <p className="font-bold uppercase text-[10px] mt-1">TEAM PENGUTIP</p>
                    </div>
                 </div>
              </div>
          </div>
          
        </div>
      ))}
    </>
  );
}