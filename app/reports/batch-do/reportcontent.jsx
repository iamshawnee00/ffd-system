'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient'; 
import { useSearchParams } from 'next/navigation';

export default function BatchDoReportContent() {
  const searchParams = useSearchParams();
  const date = searchParams.get('date');
  const driverFilter = searchParams.get('driver'); 
  const dosParam = searchParams.get('dos'); 

  const [doList, setDoList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  // Standardized for A4 fit with footer anchored at bottom
  const ITEMS_PER_PAGE = 28; 

  useEffect(() => {
    async function fetchAllDOs() {
      if (!date && !dosParam) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setErrorMsg(null);

      try {
        let query = supabase
          .from('Orders')
          .select('*')
          .order('DONumber');

        if (date) {
            query = query.eq('Delivery Date', date);
        }

        if (driverFilter && driverFilter.trim() !== '') {
            query = query.eq('DriverName', driverFilter);
        }

        if (dosParam) {
            const dosArray = dosParam.split(',').map(d => d.trim());
            query = query.in('DONumber', dosArray);
        }

        const { data, error } = await query;

        if (error) {
          setErrorMsg(error.message);
          setDoList([]);
        } else if (data) {
          const filteredData = dosParam ? data : data.filter(row => !String(row.DONumber).startsWith('CSGN-'));

          const grouped = {};
          filteredData.forEach(row => {
            if (!grouped[row.DONumber]) {
              grouped[row.DONumber] = {
                info: row,
                items: []
              };
            }
            grouped[row.DONumber].items.push(row);
          });
          
          const groupedArray = Object.values(grouped);
          
          groupedArray.sort((a, b) => {
            const driverA = a.info.DriverName || "";
            const driverB = b.info.DriverName || "";
            if (driverA && driverB) {
              if (driverA.toLowerCase() !== driverB.toLowerCase()) {
                return driverA.localeCompare(driverB);
              }
              return (a.info.DONumber || "").localeCompare(b.info.DONumber || "");
            }
            if (driverA && !driverB) return -1;
            if (!driverA && driverB) return 1;
            return (a.info.DONumber || "").localeCompare(b.info.DONumber || "");
          });
          
          setDoList(groupedArray);
        }
      } catch (err) {
          setErrorMsg(err.message);
      }
      setLoading(false);
    }
    
    if (date || dosParam) fetchAllDOs();
    else setLoading(false);
  }, [date, driverFilter, dosParam]);

  if (loading) return <div className="p-10 text-center text-gray-400 font-bold uppercase tracking-widest animate-pulse">Generating Batch DOs...</div>;
  if (!date && !dosParam) return <div className="p-10 text-center text-gray-400">Please provide a date or DO parameters.</div>;
  
  if (errorMsg) return (
    <div className="p-10 text-center text-red-500">
      <p>Error fetching data: {errorMsg}</p>
    </div>
  );

  if (doList.length === 0) return <div className="p-10 text-center text-gray-400">No orders found matching the criteria.</div>;

  return (
    <div className="text-black font-sans bg-gray-200 min-h-screen p-0 md:p-8 print:p-0 print:bg-white">
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { 
            size: A4; 
            margin: 0; 
          }
          
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
          .do-wrapper {
             page-break-after: always !important;
             display: block !important;
             margin: 0 !important;
             padding: 0 !important;
          }
          .do-wrapper:last-child {
             page-break-after: auto !important;
          }

          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}} />

      {/* Control Button - Floating in UI, Hidden in Print */}
      <div className="fixed bottom-8 right-8 print-hidden z-50">
        <button 
            onClick={() => window.print()}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-full shadow-2xl transition transform hover:scale-105 flex items-center gap-2"
        >
            <span>🖨️</span> Print All ({doList.length} DOs)
        </button>
      </div>

      <div className="flex flex-col items-center">
        {doList.map((order) => (
          <div key={order.info.DONumber} className="do-wrapper w-full flex flex-col items-center">
              <SingleDOComponent orderData={order.info} items={order.items} itemsPerPage={ITEMS_PER_PAGE} />
          </div>
        ))}
      </div>
    </div>
  );
}

function SingleDOComponent({ orderData, items, itemsPerPage }) {
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
             className={`bg-white print:shadow-none flex flex-col relative overflow-hidden box-border ${pageIndex < pages.length - 1 ? 'mb-8 print:mb-0 page-break-after' : 'mb-8 md:mb-16 print:mb-0'}`} 
             style={{ width: '210mm', height: '297mm', padding: '10mm', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}>
          
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
                  let priceDisplay = ""; 
                  if (Number(item.Price) > 0) {
                      priceDisplay = Number(item.Price).toFixed(2);
                  } else if (isReplacement) {
                      priceDisplay = "0"; 
                  }

                  return (
                    <tr key={index} className="border-b border-gray-200 h-[22px]">
                      <td className="py-0 px-1 text-center border-r border-gray-300 text-[9px] leading-tight">{index + 1 + (pageIndex * itemsPerPage)}</td>
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
                {Array.from({ length: Math.max(0, itemsPerPage - pageItems.length) }).map((_, i) => (
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
          <div className="h-[50mm] mt-auto shrink-0 flex flex-col justify-end">
              <div className="mb-4">
                  <div className="font-black text-[9px] uppercase mb-1">NOTE</div>
                  <div className="border-2 border-black h-[18mm] p-2 text-[10px] font-bold italic leading-tight overflow-hidden flex flex-col gap-1">
                      {orderData.notes && <div className="whitespace-pre-line">{orderData.notes}</div>}
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

              <div className="pt-2 flex justify-between items-end">
                <div className="w-[30%] text-center">
                    <div className="font-black uppercase text-[12px] mb-1 h-5 overflow-hidden">
                        {orderData.DriverName || ' '}
                    </div>
                    <div className="border-t-2 border-black w-full mx-auto"></div>
                    <p className="font-black uppercase text-[9px] mt-1 tracking-widest">PEMANDU</p>
                </div>
                <div className="w-[30%] text-center">
                    <div className="h-5 mb-1"></div>
                    <div className="border-t-2 border-black w-full mx-auto"></div>
                    <p className="font-black uppercase text-[9px] mt-1 tracking-widest">TEAM QC</p>
                </div>
                <div className="w-[30%] text-center">
                    <div className="h-5 mb-1"></div>
                    <div className="border-t-2 border-black w-full mx-auto"></div>
                    <p className="font-black uppercase text-[9px] mt-1 tracking-widest">TEAM PENGUTIP</p>
                </div>
              </div>
          </div>
        </div>
      ))}
    </>
  );
}