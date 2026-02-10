'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useParams } from 'next/navigation';

export default function PrintOrderPage() {
  const params = useParams();
  const { id } = params;
  
  const [orderData, setOrderData] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // Constants: Adjusted for A4 fit with fixed footer
  const ITEMS_PER_PAGE = 18;

  useEffect(() => {
    async function fetchFullOrder() {
      if (!id) return;

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

      const { data: allItems, error: listError } = await supabase
        .from('Orders')
        .select('*')
        .eq('DONumber', currentItem.DONumber);

      if (listError) {
        console.error("Error fetching items:", listError);
      } else {
        setOrderData(allItems[0]);
        setItems(allItems);
      }
      setLoading(false);
    }

    fetchFullOrder();
  }, [id]);

  if (loading) return <div className="p-10 text-center">Loading Invoice...</div>;
  if (!orderData) return <div className="p-10 text-center text-red-500">Order not found.</div>;

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
          
          {/* --- MODULE 1: COMPANY INFO --- */}
          <div className="flex justify-between items-start mb-2 border-b-2 border-black pb-2 h-[28mm]">
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
             
             {/* DELIVERY ORDER TITLE */}
             <div className="text-right self-center">
                  <h2 className="text-3xl font-black uppercase tracking-widest leading-none">DELIVERY<br/>ORDER</h2>
             </div>
          </div>

          {/* --- MODULE 2: HEADER & CUSTOMER --- */}
          <div className="h-[35mm] flex justify-between items-start text-xs pt-1 mb-0">
              <div className="w-[60%] pr-2">
                  <div className="mb-2">
                      <span className="font-bold text-[10px] text-gray-500 uppercase tracking-widest block mb-1">Deliver To:</span>
                      <div className="font-black text-lg uppercase leading-tight mb-1">{orderData["Customer Name"]}</div>
                      <div className="whitespace-pre-line leading-tight text-gray-700 mb-1">{orderData["Delivery Address"]}</div>
                      <div className="font-bold text-gray-800">
                          {orderData["Contact Number"]} {orderData["Contact Person"] ? `(${orderData["Contact Person"]})` : ''}
                      </div>
                  </div>
              </div>

              <div className="w-[30%]">
                  <div className="grid grid-cols-[60px_1fr] gap-y-1 text-right border-l-2 border-gray-100 pl-4 py-1">
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

          {/* --- MODULE 3: ITEMS TABLE --- */}
          <div className="flex-grow border-t-2 border-black relative mt-0">
            <table className="w-full text-xs border-collapse table-fixed">
              <thead className="h-8">
                <tr className="border-b-2 border-black text-black uppercase font-bold bg-gray-100 print:bg-transparent">
                  <th className="py-1 px-1 text-center w-8 border-r border-black">No</th>
                  <th className="py-1 px-2 text-left border-r border-black w-auto">Description</th>
                  <th className="py-1 px-1 text-center w-10 border-r border-black">Qty</th>
                  <th className="py-1 px-1 text-center w-12 border-r border-black">UOM</th>
                  <th className="py-1 px-1 text-center w-16 border-r border-black">Wgt</th>
                  <th className="py-1 px-1 text-right w-16">Price</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((item, index) => {
                  // SAFE CHECK: Determine replacement status robustly
                  const isReplacement = 
                      item.Replacement === 'YES' || 
                      item.Replacement === true || 
                      item.isReplacement === true;

                  return (
                    <tr key={index} className="border-b border-gray-200 h-5">
                      <td className="py-1 px-1 text-center border-r border-gray-300 text-[10px]">{index + 1 + (pageIndex * ITEMS_PER_PAGE)}</td>
                      <td className="py-1 px-2 border-r border-gray-300 font-bold truncate text-[11px] relative">
                          <div className="flex justify-between items-center w-full">
                             <span className="truncate pr-1">{item["Order Items"]}</span>
                             {/* Conditionally render (R) */}
                             {isReplacement && (
                                <span className="font-black text-black ml-1 shrink-0">(R)</span>
                             )}
                          </div>
                      </td>
                      <td className="py-1 px-1 text-center border-r border-gray-300 font-bold text-[11px]">{item["Quantity"]}</td>
                      <td className="py-1 px-1 text-center border-r border-gray-300 uppercase text-[10px]">{item["UOM"]}</td>
                      <td className="py-1 px-1 text-center border-r border-gray-300"></td>
                      <td className="py-1 px-1 text-right text-[11px]">{item.Price > 0 ? Number(item.Price).toFixed(2) : '-'}</td>
                    </tr>
                  );
                })}
                {/* Filler lines */}
                {Array.from({ length: Math.max(0, ITEMS_PER_PAGE - pageItems.length) }).map((_, i) => (
                  <tr key={`fill-${i}`} className="border-b border-gray-100 h-5">
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

          {/* --- FIXED BOTTOM SECTION (Modules 4 & 5) --- */}
          <div className="h-[55mm] mt-auto">
              {/* --- MODULE 4: NOTES --- */}
              <div className="mb-2 h-[20mm]">
                  <div className="font-bold text-[10px] uppercase mb-0.5">NOTE</div>
                  <div className="border border-black h-full p-1 text-[12px] leading-tight overflow-hidden flex flex-col gap-1">
                      {orderData.notes && <div className="whitespace-pre-line">{orderData.notes}</div>}
                      
                      {/* Deduplicate item special notes and display each on a new line */}
                      {[...new Set(pageItems
                        .filter(i => i.SpecialNotes && i.SpecialNotes.trim() !== "")
                        .map(i => i.SpecialNotes)
                      )].map((note, idx) => (
                          <div key={idx} className="whitespace-pre-line">{note}</div>
                      ))} 
                  </div>
              </div>

              {/* --- MODULE 5: SIGNATURES --- */}
              <div className="h-[25mm] relative">
                 <div className="grid grid-cols-3 gap-4 pt-1 absolute bottom-0 w-full">
                    {/* Driver */}
                    <div className="mt-8 pt-1 text-center relative">
                        {orderData.DriverName && (
                            <div className="absolute bottom-6 left-0 w-full text-center font-bold text-xs uppercase tracking-wider">
                                {orderData.DriverName}
                            </div>
                        )}
                        <div className="border-t border-black w-3/4 mx-auto"></div>
                        <p className="font-bold uppercase text-[10px] mt-1">PEMANDU</p>
                    </div>
                    {/* QC */}
                    <div className="mt-8 pt-1 text-center">
                        <div className="border-t border-black w-3/4 mx-auto"></div>
                        <p className="font-bold uppercase text-[10px] mt-1">TEAM QC</p>
                    </div>
                    {/* Receiver */}
                    <div className="mt-8 pt-1 text-center">
                        <div className="border-t border-black w-3/4 mx-auto"></div>
                        <p className="font-bold uppercase text-[10px] mt-1">TEAM PENGUTIP</p>
                    </div>
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