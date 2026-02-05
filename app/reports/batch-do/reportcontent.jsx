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

  // Constants for A4 Layout - 18 is optimal for single-page A4 given our header/footer heights
  const ITEMS_PER_PAGE = 18; 

  useEffect(() => {
    async function fetchAllDOs() {
      if (!date) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setErrorMsg(null);

      try {
        let query = supabase
          .from('Orders')
          .select('*')
          .eq('Delivery Date', date) 
          .order('DONumber');

        if (driverFilter && driverFilter.trim() !== '') {
            query = query.eq('DriverName', driverFilter);
        }

        const { data, error } = await query;

        if (error) {
          setErrorMsg(error.message);
          setDoList([]);
        } else if (data) {
          const grouped = {};
          data.forEach(row => {
            if (!grouped[row.DONumber]) {
              grouped[row.DONumber] = {
                info: row,
                items: []
              };
            }
            grouped[row.DONumber].items.push(row);
          });
          
          const groupedArray = Object.values(grouped);
          
          // SORTING LOGIC: Driver A -> Driver B -> ... -> No Driver
          groupedArray.sort((a, b) => {
            const driverA = a.info.DriverName || "";
            const driverB = b.info.DriverName || "";

            // 1. If both have drivers, sort alphabetically by driver name
            if (driverA && driverB) {
              if (driverA.toLowerCase() !== driverB.toLowerCase()) {
                return driverA.localeCompare(driverB);
              }
              // If same driver, sort by DO Number
              return (a.info.DONumber || "").localeCompare(b.info.DONumber || "");
            }

            // 2. If A has a driver and B doesn't, A comes first
            if (driverA && !driverB) return -1;
            
            // 3. If B has a driver and A doesn't, B comes first
            if (!driverA && driverB) return 1;

            // 4. If neither has a driver, sort by DO Number
            return (a.info.DONumber || "").localeCompare(b.info.DONumber || "");
          });
          
          setDoList(groupedArray);
        }
      } catch (err) {
          setErrorMsg(err.message);
      }
      setLoading(false);
    }
    
    if (date) fetchAllDOs();
    else setLoading(false);
  }, [date, driverFilter]);

  if (loading) return <div className="p-10 text-center text-white">Generating Batch DOs...</div>;
  if (!date) return <div className="p-10 text-center text-gray-400">Please provide a date parameter.</div>;
  
  if (errorMsg) return (
    <div className="p-10 text-center text-red-500">
      <p>Error fetching data: {errorMsg}</p>
    </div>
  );

  if (doList.length === 0) return <div className="p-10 text-center text-gray-400">No orders found for this date.</div>;

  return (
    <div className="text-black font-sans">
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { size: A4; margin: 0; }
          html, body { 
            background: white !important; 
            margin: 0 !important; 
            padding: 0 !important; 
            -webkit-print-color-adjust: exact;
          }
          .page-break-after { 
            page-break-after: always !important; 
            display: block; 
          }
          .page-break-after:last-child { page-break-after: auto !important; }
          .print-hidden { display: none !important; }
        }
      `}} />

      {/* Control Button - Floating in UI, Hidden in Print */}
      <div className="fixed bottom-8 right-8 print-hidden z-50 flex gap-2">
        <button 
            onClick={() => window.print()}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-full shadow-2xl transition transform hover:scale-105 flex items-center gap-2"
        >
            <span>🖨️</span> Print All ({doList.length} DOs)
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
             className="mx-auto bg-white shadow-xl mb-8 print:shadow-none print:mb-0 flex flex-col relative overflow-hidden box-border" 
             style={{ width: '210mm', height: '297mm', padding: '10mm' }}>
          
          {/* --- HEADER SECTION --- */}
          <div className="flex justify-between items-start mb-4 border-b-2 border-black pb-2 h-[28mm]">
             <div className="flex gap-4 items-center h-full">
                <img 
                  src="https://ik.imagekit.io/dymeconnect/fresherfarmdirect_logo-removebg-preview.png?updatedAt=1760444368116" 
                  alt="Logo" 
                  className="w-16 h-16 object-contain" 
                />
                <div>
                    <h1 className="text-xl font-black uppercase tracking-tight leading-none mb-1">FRESHER FARM DIRECT SDN BHD</h1>
                    <div className="text-[9px] leading-tight text-gray-700 font-bold uppercase">
                        <p>Reg No: 200701010054 | TIN No: C20176000020</p>
                        <p>Lot 18 & 19, Kompleks Selayang, Batu 8-1/2, Jalan Ipoh, 68100 Batu Caves</p>
                        <p>Tel: 011-2862 8667 | Email: fresherfarmdirect2.0@gmail.com</p>
                    </div>
                </div>
             </div>
             <div className="text-right self-center">
                  <h2 className="text-3xl font-black uppercase tracking-tighter leading-none">DELIVERY<br/>ORDER</h2>
             </div>
          </div>

          {/* --- CUSTOMER INFO & DO DETAILS --- */}
          <div className="flex justify-between items-start text-xs mb-4 h-[35mm]">
              <div className="w-[65%] pr-4">
                  <span className="font-bold text-[9px] text-gray-500 uppercase tracking-widest block mb-1">Deliver To:</span>
                  <div className="font-black text-lg uppercase leading-tight mb-1">{orderData["Customer Name"]}</div>
                  <div className="whitespace-pre-line leading-tight text-gray-800 font-bold text-[11px] mb-1 line-clamp-3">{orderData["Delivery Address"]}</div>
                  <div className="font-black text-gray-900 text-[12px]">
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
                  <th className="py-1.5 px-1 text-center w-8 border-r border-black">No</th>
                  <th className="py-1.5 px-2 text-left border-r border-black">Description</th>
                  <th className="py-1.5 px-1 text-center w-12 border-r border-black">Qty</th>
                  <th className="py-1.5 px-1 text-center w-12 border-r border-black">UOM</th>
                  <th className="py-1.5 px-1 text-center w-16 border-r border-black">Wgt</th>
                  <th className="py-1.5 px-2 text-right w-16">Price</th>
                </tr>
              </thead>
              <tbody className="font-bold">
                {pageItems.map((item, index) => (
                  <tr key={index} className="border-b border-gray-200 h-7">
                    <td className="py-1 px-1 text-center border-r border-gray-300 text-[9px]">{index + 1 + (pageIndex * itemsPerPage)}</td>
                    <td className="py-1 px-2 border-r border-gray-300 truncate uppercase text-[10px]">{item["Order Items"]}</td>
                    <td className="py-1 px-1 text-center border-r border-gray-300 text-[12px]">{item["Quantity"]}</td>
                    <td className="py-1 px-1 text-center border-r border-gray-300 uppercase text-[9px]">{item["UOM"]}</td>
                    <td className="py-1 px-1 text-center border-r border-gray-300"></td>
                    <td className="py-1 px-2 text-right text-[10px]">{item.Price > 0 ? Number(item.Price).toFixed(2) : '-'}</td>
                  </tr>
                ))}
                {/* Filler lines to maintain table structure */}
                {Array.from({ length: Math.max(0, itemsPerPage - pageItems.length) }).map((_, i) => (
                  <tr key={`fill-${i}`} className="border-b border-gray-100 h-7">
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
          <div className="h-[50mm] mt-auto">
              <div className="mb-4">
                  <div className="font-black text-[9px] uppercase mb-1">NOTE</div>
                  <div className="border-2 border-black h-[15mm] p-2 text-[10px] font-bold italic leading-tight overflow-hidden">
                    {orderData.SpecialNotes}
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
    </>
  );
}