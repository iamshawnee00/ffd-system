'use client';
import { useEffect, useState, Suspense } from 'react';
import { supabase } from '../../lib/supabaseClient';

function PrintOrderContent() {
  const [doNumber, setDoNumber] = useState(null);
  const [orderData, setOrderData] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // Constants: Standardized for A4 fit with footer anchored at bottom (matches Batch DO)
  const ITEMS_PER_PAGE = 28;

  useEffect(() => {
    if (typeof window !== 'undefined') {
        document.title = "Print DO - FFD System";

        const extractDO = () => {
            let target = '';
            const rawUrl = window.location.href; 
            
            if (rawUrl.includes('#')) {
                target = rawUrl.split('#')[1].split('?')[0].trim();
            }
            if (!target && rawUrl.includes('?do=')) {
                target = new URLSearchParams(window.location.search).get('do');
            }
            if (!target) {
                target = localStorage.getItem('print_do_target');
            }
            return target;
        };

        let foundDo = extractDO();

        if (foundDo && foundDo !== 'null' && foundDo !== 'undefined') {
            setDoNumber(foundDo);
        } else {
            setTimeout(() => {
                const retryDo = extractDO();
                if (retryDo && retryDo !== 'null' && retryDo !== 'undefined') {
                    setDoNumber(retryDo);
                } else {
                    setLoading(false); 
                }
            }, 300);
        }
    }
  }, []);

  useEffect(() => {
    async function fetchFullOrder() {
      if (!doNumber) return;

      try {
          await supabase.auth.getSession();

          const { data: allItems, error: listError } = await supabase
            .from('Orders')
            .select('*')
            .eq('DONumber', doNumber);

          if (listError || !allItems || allItems.length === 0) {
            console.error("Error fetching items:", listError);
            setLoading(false);
            return;
          }

          setOrderData(allItems[0]);
          setItems(allItems);
      } catch (err) {
          console.error("Fetch error:", err);
      } finally {
          setLoading(false);
      }
    }

    fetchFullOrder();
  }, [doNumber]);

  // ======================================================================
  // THE FIX: Smart Print Handler
  // Protects Desktop from zooming while fixing Mobile layout scaling
  // ======================================================================
  const handleSmartPrint = () => {
      if (typeof window === 'undefined') return;

      // If viewing on Desktop/Tablet, print immediately without viewport hacking
      if (window.innerWidth >= 768) {
          window.print();
          return;
      }

      // Mobile Viewport Hack
      const viewportMeta = document.querySelector('meta[name="viewport"]');
      const originalContent = viewportMeta ? viewportMeta.content : '';

      if (viewportMeta) {
          viewportMeta.content = "width=794, initial-scale=1.0";
      } else {
          const meta = document.createElement('meta');
          meta.name = "viewport";
          meta.content = "width=794, initial-scale=1.0";
          document.head.appendChild(meta);
      }

      setTimeout(() => {
          window.print();
          setTimeout(() => {
              if (viewportMeta) {
                  viewportMeta.content = originalContent;
              }
          }, 1000);
      }, 500);
  };

  if (loading) return <div className="p-10 text-center font-bold text-gray-400 uppercase tracking-widest animate-pulse font-sans text-black">Loading Invoice...</div>;
  if (!orderData) return (
      <div className="p-20 text-center flex flex-col items-center gap-4 font-sans text-black">
          <span className="text-red-500 font-black uppercase tracking-widest text-xl">Order not found</span>
          <span className="text-xs font-bold text-gray-500 bg-gray-100 border border-gray-200 px-4 py-2 rounded-xl uppercase tracking-widest">
              Target DO: <span className="text-blue-600 ml-1">{doNumber || 'None provided'}</span>
          </span>
      </div>
  );

  const pages = [];
  for (let i = 0; i < items.length; i += ITEMS_PER_PAGE) {
    pages.push(items.slice(i, i + ITEMS_PER_PAGE));
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const str = String(dateStr);
    if (str.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [y, m, d] = str.split('-');
        return `${d}/${m}/${y}`;
    }
    const d = new Date(str);
    return !isNaN(d) ? d.toLocaleDateString('en-GB') : str;
  };

  return (
    // ADDED text-black font-sans to root wrapper to ensure "Poppins" font weights apply properly
    <div className="bg-gray-200 min-h-[100dvh] w-full p-4 md:p-8 flex flex-col items-center relative z-0 text-black font-sans">
      
      <button 
        onClick={handleSmartPrint}
        className="fixed bottom-8 right-8 bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-full shadow-2xl z-[100] transition-all transform hover:scale-105 flex items-center gap-2"
      >
        <span className="text-xl">🖨️</span> Print Standard PDF
      </button>

      <div className="w-full flex justify-center pb-24 overflow-x-auto custom-scrollbar">
        
        {/* NATIVE PRINT WRAPPER */}
        <div id="print-isolate-root" className="flex flex-col bg-white shadow-2xl border border-gray-300 print:border-none print:shadow-none" style={{ width: '210mm', minWidth: '210mm' }}>
            
            {pages.map((pageItems, pageIndex) => (
                <div key={pageIndex} 
                    className={`bg-white flex flex-col relative overflow-hidden box-border print-page-container ${pageIndex < pages.length - 1 ? 'pdf-page-break border-b-2 border-dashed border-gray-300 print:border-none' : ''}`} 
                    style={{ 
                        width: '210mm', 
                        height: '297mm', // Exact A4 Height restored
                        padding: '10mm', // Standard padding restored
                        boxSizing: 'border-box',
                        margin: '0 auto'
                    }}>
                
                {/* --- HEADER SECTION --- */}
                <div className="flex justify-between items-start mb-4 border-b-2 border-black pb-4 h-[20mm] shrink-0">
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
                <div className="h-[50mm] mt-auto shrink-0 flex flex-col justify-end">
                    <div className="mb-4">
                        <div className="font-black text-[9px] uppercase mb-1">NOTE</div>
                        <div className="border-2 border-black h-[18mm] p-2 text-[10px] font-bold italic leading-tight overflow-hidden flex flex-col gap-1">
                            {orderData.SpecialNotes && <div className="whitespace-pre-line">{orderData.SpecialNotes}</div>}
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
        </div>
      </div>

      {/* NUCLEAR NATIVE PRINT CSS */}
      <style jsx global>{`
        @media print {
          @page { 
            size: A4 portrait; 
            margin: 0 !important; 
          }

          /* 1. Hide everything by default */
          body * {
            visibility: hidden !important;
          }

          /* 2. Show only the specific isolate container */
          #print-isolate-root, #print-isolate-root * {
            visibility: visible !important;
          }

          /* 3. Force container to absolute top-left and STRICT 210mm width */
          #print-isolate-root {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 210mm !important; /* Locks desktop from stretching 100% wide */
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            box-sizing: border-box !important;
            border: none !important;
            box-shadow: none !important;
          }

          /* 4. Ensure no mobile UI survives */
          nav, aside, footer, .fixed, [role="navigation"], [class*="nav"], [class*="menu"], button, .print\\:hidden {
            display: none !important;
            opacity: 0 !important;
            height: 0 !important;
            width: 0 !important;
          }

          /* 5. Unlock Heights */
          html, body {
            height: auto !important;
            min-height: 100% !important;
            overflow: visible !important;
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          main, #__next, div[class*="flex-1"] {
            height: auto !important;
            overflow: visible !important;
            display: block !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          /* 6. EXACT A4 CONTAINER DIMENSIONS FOR EVERY PAGE */
          .print-page-container {
            width: 210mm !important; 
            height: 297mm !important; 
            padding: 10mm !important; 
            margin: 0 auto !important;
            overflow: hidden !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            display: flex !important;
            flex-direction: column !important;
            box-shadow: none !important;
            border: none !important;
          }

          .pdf-page-break { 
            page-break-after: always !important;
          }
          
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  );
}

export default function PrintOrderPage() {
    return (
        <Suspense fallback={<div className="p-10 text-center font-bold text-gray-400">Loading Order Data...</div>}>
            <title>Print DO - FFD System</title>
            <PrintOrderContent />
        </Suspense>
    );
}