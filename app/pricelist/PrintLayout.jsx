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

  return (
    <div className="hidden print:block text-black font-sans text-xs bg-white">
        <style dangerouslySetInnerHTML={{__html: `
            @media print {
                @page { size: A4; margin: 0; }
                html, body, main { background: white !important; margin: 0 !important; padding: 0 !important; -webkit-print-color-adjust: exact; }
                main { padding-top: 0 !important; }
                
                /* Force Tailwind's print:hidden utility to completely eradicate the navigation from print */
                .print\\:hidden { display: none !important; } 
                
                /* Force table headers to repeat on new pages */
                thead { display: table-header-group; } 
                tr { page-break-inside: avoid; }
            }
        `}} />

        <div className="mx-auto bg-white mb-0 flex flex-col box-border" style={{ width: '210mm', minHeight: '297mm', padding: '15mm' }}> 
            
            {/* --- HEADER --- */}
            <div className="flex justify-between items-start mb-6 border-b-2 border-black pb-4 shrink-0">
                <div className="flex gap-4 h-full items-center">
                    <div className="w-20 h-20 relative">
                        <img src="https://ik.imagekit.io/dymeconnect/fresherfarmdirect_logo-removebg-preview.png?updatedAt=1760444368116" alt="Logo" className="w-full h-full object-contain" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black uppercase tracking-tight mb-1">FRESHER FARM DIRECT SDN BHD</h1>
                        <div className="text-[10px] leading-tight text-gray-800 font-bold uppercase">
                            <p>Reg No: 200701010054 | TIN No: C20176000020 | MSIC Code: 46319</p>
                            <p>Address: Lot 18 & 19, Kompleks Selayang, Batu 8-1/2, Jalan Ipoh, 68100 Batu Caves, Selangor</p>
                            <p>Tel: 011-2862 8667 | Email: fresherfarmdirect2.0@gmail.com</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- TITLE & METADATA --- */}
            <div className="mb-6 flex justify-between items-end shrink-0">
                <div className="text-left w-2/3">
                    <h2 className="text-4xl font-black uppercase tracking-widest leading-none mb-4 text-blue-900">PRICE LIST</h2>
                    <div className="bg-gray-100 p-3 rounded-lg border border-gray-300 inline-block w-full">
                        <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1">Prepared For</p>
                        <p className="text-lg font-black uppercase">{selectedCustomer === 'GENERAL' ? 'Valued Customer' : selectedCustomer}</p>
                    </div>
                </div>
                <div className="text-right border-l-2 border-black pl-4">
                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1">Effective Date</p>
                    <p className="text-lg font-black">{formatDateLabel(effectiveDate)}</p>
                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mt-2 mb-1">Valid Until</p>
                    <p className="text-lg font-black">{formatDateLabel(validUntil)}</p>
                </div>
            </div>

            {/* --- ITEMS TABLE (GROUPED UOMS & PRICES) --- */}
            <div className="flex-grow relative mt-2">
                <table className="w-full border-collapse text-xs">
                    <thead>
                        <tr className="border-b-2 border-t-2 border-black text-black uppercase font-black bg-gray-100/50">
                            <th className="py-2 px-2 text-center w-12 border-r border-gray-300">No</th>
                            <th className="py-2 px-3 text-left border-r border-gray-300">Product Description</th>
                            <th className="py-2 px-2 text-center w-32 border-r border-gray-300">UOM</th>
                            <th className="py-2 px-3 text-right w-40">Price (RM)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {/* Group by Category -> then by Product */}
                        {(() => {
                            const grouped = {};
                            selectedItems.forEach(item => {
                                if (!grouped[item.category]) grouped[item.category] = {};
                                if (!grouped[item.category][item.productCode]) {
                                    grouped[item.category][item.productCode] = {
                                        productName: item.productName,
                                        uoms: [],
                                        prices: []
                                    };
                                }
                                grouped[item.category][item.productCode].uoms.push(item.uom);
                                grouped[item.category][item.productCode].prices.push(item.price ? Number(item.price).toFixed(2) : 'TBA');
                            });
                            
                            const sortedCategories = Object.keys(grouped).sort((a, b) => {
                                if (a === 'VEGE') return -1;
                                if (b === 'VEGE') return 1;
                                return a.localeCompare(b);
                            });

                            let globalIndex = 1;
                            const rows = [];

                            sortedCategories.forEach(cat => {
                                // Category Header Row
                                rows.push(
                                    <tr key={`cat-${cat}`} className="border-b border-gray-300 bg-gray-50">
                                        <td colSpan="4" className="py-2 px-3 font-black text-blue-900 uppercase tracking-widest text-[10px]">
                                            {cat}
                                        </td>
                                    </tr>
                                );
                                
                                // Product Rows (Combining multiple UOMs / Prices)
                                const productsInCat = Object.values(grouped[cat]).sort((a, b) => a.productName.localeCompare(b.productName));
                                
                                productsInCat.forEach((prod, pIdx) => {
                                    const uomStr = prod.uoms.join(' / ');
                                    const priceStr = prod.prices.map(p => p === 'TBA' ? 'TBA' : `RM ${p}`).join(' / ');

                                    rows.push(
                                        <tr key={`prod-${cat}-${pIdx}`} className="border-b border-gray-200 h-8">
                                            <td className="py-1 px-2 text-center border-r border-gray-200 font-bold text-gray-500">{globalIndex++}</td>
                                            <td className="py-1 px-3 border-r border-gray-200 font-black uppercase text-gray-800">{prod.productName}</td>
                                            <td className="py-1 px-2 text-center border-r border-gray-200 font-bold uppercase">{uomStr}</td>
                                            <td className="py-1 px-3 text-right font-black text-black text-sm">{priceStr}</td>
                                        </tr>
                                    );
                                });
                            });
                            
                            return rows;
                        })()}
                    </tbody>
                </table>
            </div>

            {/* Footer Note */}
            <div className="mt-8 pt-4 border-t border-gray-300 text-center text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                Subject to stock availability. Please contact us to confirm your order.
            </div>
        </div>
    </div>
  );
}