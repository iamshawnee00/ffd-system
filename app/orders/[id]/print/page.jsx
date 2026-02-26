'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useParams } from 'next/navigation';

export default function PrintOrderPage() {
  const params = useParams();
  const { id } = params; // 'id' from the URL is actually the DONumber passed by the print buttons
  
  const [orderData, setOrderData] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // Constants: Adjusted for A4 fit with fixed footer
  const ITEMS_PER_PAGE = 25;

  useEffect(() => {
    async function fetchFullOrder() {
      if (!id) return;

      // FIX: Query the DONumber column directly using the 'id' parameter from the URL. 
      // We no longer try to match the URL string against the database's internal row 'id'.
      const { data: allItems, error: listError } = await supabase
        .from('Orders')
        .select('*')
        .eq('DONumber', id);

      if (listError) {
        console.error("Error fetching items:", listError);
        setLoading(false);
        return;
      }

      // If no items match the DO Number, trigger the not found state
      if (!allItems || allItems.length === 0) {
        console.error("Order not found for DO:", id);
        setLoading(false);
        return;
      }

      setOrderData(allItems[0]);
      setItems(allItems);
      setLoading(false);
    }

    fetchFullOrder();
  }, [id]);

  if (loading) return <div className="p-10 text-center font-bold text-gray-500 animate-pulse">Loading Invoice...</div>;
  if (!orderData) return <div className="p-10 text-center text-red-500 font-bold">Order not found.</div>;

  const pages = [];
  for (let i = 0; i < items.length; i += ITEMS_PER_PAGE) {
    pages.push(items.slice(i, i + ITEMS_PER_PAGE));
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}/${y}`;
    }
    const d = new Date(dateStr);
    return !isNaN(d) ? d.toLocaleDateString('en-GB') : dateStr;
  };

  return (
    <div className="bg-gray-200 min-h-screen p-8 print:p-0 print:bg-white text-black font-sans">
      
      <button 
        onClick={() => window.print()}
        className="fixed bottom-8 right-8 bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-full shadow-2xl print:hidden flex items-center gap-2 z-50 transition-all transform hover:scale-105"
      >
        <span className="text-xl">🖨️</span> Print DO
      </button>

      {pages.map((pageItems, pageIndex) => (
        <div key={pageIndex} 
             className="mx-auto bg-white shadow-xl mb-8 print:shadow-none print:mb-0 flex flex-col relative page-break-after overflow-hidden box-border" 
             style={{ width: '210mm', height: '297mm', padding: '10mm' }}>
          
          {/* --- HEADER SECTION --- */}
          <div className="flex justify-between items-start mb-4 border-b-2 border-black pb-2 h-[28mm] shrink-0">
             <div className="flex gap-4 items-center h-full">
                <img 
                  src="https://ik.imagekit.io/dymeconnect/fresherfarmdirect_logo-removebg-preview.png?updatedAt=1760444368116" 
                  alt="Logo" 
                  className="w-16 h-16 object-contain" 
                />
                <div>
                    <h1 className="text-xl font-black uppercase tracking-tight leading-none mb-1">FRESHER FARM DIRECT SDN BHD</h1>
                    <div className="text-[9px] leading-tight text-gray-700 font-bold uppercase">
                        <p>Reg No: 200701010054 | TIN No: C20176000020 | MSIC Code: 46319</p>
                        <p>Lot 18 & 19, Kompleks Selayang, Batu 8-1/2, Jalan Ipoh, 68100 Batu Caves, Selangor</p>
                        <p>Tel: 011-2862 8667 | Email: fresherfarmdirect2.0@gmail.com</p>
                    </div>
                </div>
             </div>
             <div className="text-right self-center">
                  <h2 className="text-3xl font-black uppercase tracking-tighter leading-none">DELIVERY<br/>ORDER</h2>
             </div>
          </div>

          {/* --- CUSTOMER INFO & DO DETAILS --- */}
          <div className="flex justify-between items-start text-xs mb-3 min-h-[30mm] shrink-0">
              <div className="w-[65%] pr-4 flex flex-col">
                  <span className="font-bold text-[9px] text-gray-500 uppercase tracking-widest block mb-1">Deliver To:</span>
                  <div className="font-black text-[16px] uppercase leading-tight mb-1">{orderData["Customer Name"]}</div>
                  <div className="whitespace-pre-line leading-tight text-gray-800 font-bold text-[11px] mb-1">{orderData["Delivery Address"]}</div>
                  <div className="font-black text-gray-900 text-[12px] mt-1">
                      {orderData["Contact Number"]} {orderData["Contact Person"] ? `(${orderData["Contact Person"]})` : ''}
                  </div>
              </div>

              <div className="w-[30%] border-l-2 border-black pl-4 py-1">
                  <div className="grid grid-cols-[60px_1fr] gap-y-1 text-right font-bold">
                      <span className="text-gray-500 text-[9px] uppercase">DO No:</span>
                      <span className="text-[12px] font-black">{orderData.DONumber}</span>

                      <span className="text-gray-500 text-[9px] uppercase">Date:</span>
                      <span className="text-[12px]">{formatDate(orderData["Delivery Date"])}</span>

                      <span className="text-gray-500 text-[9px] uppercase">Status:</span>
                      <span className="uppercase text-[11px]">{orderData["Delivery Mode"] || 'DRIVER'}</span>

                      <span className="text-gray-500 text-[9px] uppercase">Page:</span>
                      <span className="text-[11px]">{pageIndex + 1} / {pages.length}</span>
                  </div>
              </div>
          </div>

          {/* --- ITEMS TABLE --- */}
          <div className="flex-grow">
            <table className="w-full text-[10px] border-collapse table-fixed border-t-2 border-black">
              <thead>
                <tr className="bg-gray-100 border-b-2 border-black text-black uppercase font-black text-[9px]">
                  <th className="py-1 px-1 text-center w-8 border-r border-black">No</th>
                  <th className="py-1 px-2 text-left border-r border-black">Description</th>
                  <th className="py-1 px-1 text-center w-12 border-r border-black">Qty</th>
                  <th className="py-1 px-1 text-center w-12 border-r border-black">UOM</th>
                  <th className="py-1 px-1 text-center w-16 border-r border-black">Wgt</th>
                  <th className="py-1 px-2 text-right w-16">Price</th>
                </tr>
              </thead>
              <tbody className="font-bold">
                {pageItems.map((item, index) => {
                  const isReplacement = item.Replacement === 'YES' || item.Replacement === true || item.isReplacement === true;
                  
                  // Price Logic
                  let priceDisplay = ""; // Default empty
                  if (Number(item.Price) > 0) {
                      priceDisplay = Number(item.Price).toFixed(2);
                  } else if (isReplacement) {
                      priceDisplay = "0"; 
                  }

                  return (
                    <tr key={index} className="border-b border-gray-200 h-[22px]">
                      <td className="py-0 px-1 text-center border-r border-gray-300 text-[9px] leading-tight">{index + 1 + (pageIndex * ITEMS_PER_PAGE)}</td>
                      <td className="py-0 px-2 border-r border-gray-300 truncate uppercase text-[10px] leading-tight">
                          <div className="flex justify-between items-center w-full">
                             <span className="truncate pr-1">{item["Order Items"]}</span>
                             {isReplacement && <span className="font-black text-black ml-1 shrink-0">(R)</span>}
                          </div>
                      </td>
                      <td className="py-0 px-1 text-center border-r border-gray-300 text-[12px] leading-tight">{item["Quantity"]}</td>
                      <td className="py-0 px-1 text-center border-r border-gray-300 uppercase text-[9px] leading-tight">{item["UOM"]}</td>
                      <td className="py-0 px-1 text-center border-r border-gray-300 leading-tight"></td>
                      <td className="py-0 px-2 text-right text-[10px] leading-tight">{priceDisplay}</td>
                    </tr>
                  );
                })}
                {/* Filler lines to maintain table structure */}
                {Array.from({ length: Math.max(0, ITEMS_PER_PAGE - pageItems.length) }).map((_, i) => (
                  <tr key={`fill-${i}`} className="border-b border-gray-100 h-[22px]">
                    <td className="border-r border-gray-100"></td>
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

          {/* --- FOOTER SECTION --- */}
          <div className="h-[50mm] mt-auto shrink-0">
              <div className="mb-4">
                  <div className="font-black text-[9px] uppercase mb-1">NOTE</div>
                  <div className="border-2 border-black h-[15mm] p-2 text-[10px] font-bold italic leading-tight overflow-hidden flex flex-col gap-1">
                      {orderData.notes && <div className="whitespace-pre-line">{orderData.notes}</div>}
                      {/* Formatted Special Notes */}
                      {(() => {
                          const validItemsWithNotes = items.filter(i => i.SpecialNotes && i.SpecialNotes.trim() !== "" && !i.SpecialNotes.trim().toLowerCase().startsWith("pasted:"));
                          const uniqueNotes = [];
                          validItemsWithNotes.forEach(item => {
                              const noteStr = `${item["Order Items"]}: ${item.SpecialNotes}`;
                              if (!uniqueNotes.includes(noteStr)) {
                                  uniqueNotes.push(noteStr);
                              }
                          });
                          return uniqueNotes.map((noteStr, idx) => (
                              <div key={idx} className="whitespace-pre-line">{idx + 1}. {noteStr}</div>
                          ));
                      })()}
                  </div>
              </div>

              <div className="pt-6 flex justify-between items-end">
                {/* PEMANDU / DRIVER */}
                <div className="w-[30%] text-center">
                    <div className="font-black uppercase text-[12px] mb-1 h-5 overflow-hidden">
                        {orderData.DriverName || ' '}
                    </div>
                    <div className="border-t-2 border-black w-full mx-auto"></div>
                    <p className="font-black uppercase text-[9px] mt-1 tracking-widest">PEMANDU</p>
                </div>

                {/* TEAM QC */}
                <div className="w-[30%] text-center">
                    <div className="h-5 mb-1"></div>
                    <div className="border-t-2 border-black w-full mx-auto"></div>
                    <p className="font-black uppercase text-[9px] mt-1 tracking-widest">TEAM QC</p>
                </div>

                {/* TEAM PENGUTIP / RECEIVER */}
                <div className="w-[30%] text-center">
                    <div className="h-5 mb-1"></div>
                    <div className="border-t-2 border-black w-full mx-auto"></div>
                    <p className="font-black uppercase text-[9px] mt-1 tracking-widest">TEAM PENGUTIP</p>
                </div>
              </div>
          </div>
          
        </div>
      ))}

      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 0; }
          body { background: white; -webkit-print-color-adjust: exact; }
          .page-break-after { page-break-after: always; }
          .page-break-after:last-child { page-break-after: auto; }
        }
      `}</style>
    </div>
  );
}