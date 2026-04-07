import React from 'react';

export default function PrintLayout({ 
    selectedCustomer, 
    effectiveDate, 
    validUntil, 
    selectedItems 
}) {
  
  const formatDateLabel = (dateStr) => {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      return !isNaN(d) ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : dateStr;
  };

  // Partition into Left (Local/Thai/Others), Right (Import), Bottom (Vege)
  const leftCats = {};
  const rightCats = {};
  const vegeCats = {};

  selectedItems.forEach(item => {
      const cat = (item.category || 'OTHERS').toUpperCase();
      if (cat.includes('LOCAL') || cat.includes('THAI') || cat.includes('OTHER')) {
          if (!leftCats[cat]) leftCats[cat] = [];
          leftCats[cat].push(item);
      } else if (cat.includes('IMPORT')) {
          if (!rightCats[cat]) rightCats[cat] = [];
          rightCats[cat].push(item);
      } else {
          if (!vegeCats[cat]) vegeCats[cat] = [];
          vegeCats[cat].push(item);
      }
  });

  // Helper to render independent compact tables per category
  const renderTableContent = (catGroup) => {
      const sortedCategories = Object.keys(catGroup).sort((a, b) => a.localeCompare(b));
      
      return sortedCategories.map(cat => {
          const products = catGroup[cat].sort((a, b) => a.productName.localeCompare(b.productName));
          
          return (
              <table key={cat} className="w-full border-collapse border border-gray-400 table-fixed mb-2 break-inside-avoid">
                  <colgroup>
                      <col style={{ width: '8%' }} />
                      <col style={{ width: '54%' }} />
                      <col style={{ width: '19%' }} />
                      <col style={{ width: '19%' }} />
                  </colgroup>
                  <thead>
                      <tr className="bg-gray-100 border-b border-gray-400">
                          <th colSpan="4" className="py-1 px-2 text-left font-black text-black uppercase tracking-widest text-[9px]">
                              {cat}
                          </th>
                      </tr>
                      <tr className="bg-gray-50 border-b border-gray-400 text-black uppercase font-black text-[8px]">
                          <th className="py-0.5 px-0.5 text-center border-r border-gray-300">No</th>
                          <th className="py-0.5 px-1 text-left border-r border-gray-300">Description</th>
                          <th className="py-0.5 px-1 text-center border-r border-gray-300">UOM</th>
                          <th className="py-0.5 px-1 text-right">Price</th>
                      </tr>
                  </thead>
                  <tbody className="font-bold">
                      {products.map((prod, pIdx) => {
                          const activeUoms = [];
                          const activePrices = [];
                          
                          if (prod.allowedUoms && prod.prices) {
                              prod.allowedUoms.forEach(u => {
                                  const pVal = prod.prices[u];
                                  if (pVal !== '' && pVal !== undefined && pVal !== null) {
                                      activeUoms.push(u);
                                      activePrices.push(Number(pVal).toFixed(2));
                                  }
                              });
                          }

                          let uomStr = '';
                          let priceStr = '';
                          if (activeUoms.length > 0) {
                              uomStr = activeUoms.join(' / ');
                              priceStr = activePrices.join(' / ');
                          } else {
                              const placeholders = prod.allowedUoms ? prod.allowedUoms.slice(0, 2) : ['UOM'];
                              uomStr = placeholders.join(' / ');
                              priceStr = placeholders.map(() => 'TBA').join(' / ');
                          }

                          return (
                              <tr key={`prod-${pIdx}`} className="border-b border-gray-300 break-inside-avoid">
                                  <td className="py-0.5 px-0.5 text-center border-r border-gray-300 text-[8px] text-gray-500 align-top">
                                      {pIdx + 1}
                                  </td>
                                  <td className="py-0.5 px-1 border-r border-gray-300 uppercase text-[8px] leading-tight whitespace-normal break-words text-gray-800 align-top">
                                      <div className="font-bold">{prod.productName}</div>
                                      {prod.chineseName && (
                                          <div className="font-medium text-gray-500 text-[7px] mt-[1px] tracking-wide">
                                              {prod.chineseName}
                                          </div>
                                      )}
                                  </td>
                                  <td className="py-0.5 px-1 text-center border-r border-gray-300 uppercase text-[7px] tracking-wider align-top">
                                      {uomStr}
                                  </td>
                                  <td className="py-0.5 px-1 text-right font-black text-black text-[8px] tracking-wide align-top">
                                      {priceStr}
                                  </td>
                              </tr>
                          );
                      })}
                  </tbody>
              </table>
          );
      });
  };

  const PrintHeader = () => (
      <div className="shrink-0 mb-3">
        <div className="flex justify-between items-start mb-1.5 border-b-2 border-black pb-1.5">
            <div className="flex gap-2 items-center h-full">
                <img 
                  src="https://ik.imagekit.io/dymeconnect/fresherfarmdirect_logo-removebg-preview.png?updatedAt=1760444368116" 
                  alt="Logo" 
                  className="w-10 h-10 object-contain" 
                />
                <div>
                    <h1 className="text-base font-black uppercase tracking-tight leading-none mb-0.5">FRESHER FARM DIRECT SDN BHD</h1>
                    <div className="text-[7px] leading-tight text-gray-700 font-bold uppercase">
                        <p>Reg No: 200701010054 | TIN No: C20176000020</p>
                        <p>Lot 18 & 19, Kompleks Selayang, Batu 8-1/2, Jalan Ipoh, Selangor</p>
                        <p>Tel: 011-2862 8667 | Email: fresherfarmdirect2.0@gmail.com</p>
                    </div>
                </div>
            </div>
            <div className="text-right self-center">
                <h2 className="text-xl font-black uppercase tracking-tighter leading-none">PRICE<br/>LIST</h2>
            </div>
        </div>

        <div className="flex justify-between items-end border-b border-gray-300 pb-1.5">
            <div className="text-left w-2/3">
                <p className="text-[7px] text-gray-500 font-black uppercase tracking-widest mb-0.5">Prepared For</p>
                <p className="text-xs font-black uppercase leading-tight">{selectedCustomer === 'GENERAL' ? 'Valued Customer' : selectedCustomer}</p>
            </div>
            <div className="text-right border-l-2 border-black pl-3 flex gap-4">
                <div>
                    <p className="text-[7px] text-gray-500 font-black uppercase tracking-widest mb-0.5">Effective</p>
                    <p className="text-xs font-black leading-tight">{formatDateLabel(effectiveDate)}</p>
                </div>
                <div>
                    <p className="text-[7px] text-gray-500 font-black uppercase tracking-widest mb-0.5">Valid Until</p>
                    <p className="text-xs font-black leading-tight">{formatDateLabel(validUntil)}</p>
                </div>
            </div>
        </div>
      </div>
  );

  return (
    <div className="hidden print:block text-black font-sans bg-white">
        <style dangerouslySetInnerHTML={{__html: `
            @media print {
                @page { size: A4 portrait; margin: 10mm; }
                html, body, main { background: white !important; margin: 0 !important; padding: 0 !important; -webkit-print-color-adjust: exact; }
                main { padding-top: 0 !important; }
                .print\\:hidden { display: none !important; } 
                table { break-inside: avoid; page-break-inside: avoid; }
                tr { break-inside: avoid; page-break-inside: avoid; }
                .break-inside-avoid { break-inside: avoid; page-break-inside: avoid; }
            }
        `}} />

        <div className="box-border relative">
            <PrintHeader />
            
            { (Object.keys(leftCats).length > 0 || Object.keys(rightCats).length > 0) && (
                <div className="flex items-start gap-4">
                    <div className="w-1/2">
                        {Object.keys(leftCats).length > 0 
                            ? renderTableContent(leftCats) 
                            : <div className="text-[9px] text-gray-400 italic font-bold">No Local/Thai Fruits</div>}
                    </div>
                    <div className="w-1/2">
                        {Object.keys(rightCats).length > 0 
                            ? renderTableContent(rightCats) 
                            : <div className="text-[9px] text-gray-400 italic font-bold">No Import Fruits</div>}
                    </div>
                </div>
            )}

            { Object.keys(vegeCats).length > 0 && (
                <div className="mt-[10px]">
                    <div className="columns-2 gap-4">
                        {renderTableContent(vegeCats)}
                    </div>
                </div>
            )}

            <div className="mt-2 pt-2 border-t border-gray-300 text-center text-[7px] font-bold text-gray-500 uppercase tracking-widest">
                Subject to stock availability. Please contact us to confirm your order.
            </div>
        </div>
    </div>
  );
}