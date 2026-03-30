'use client';
import React, { useState, useEffect, useMemo } from 'react';

// ==================================================================
// ⚠️ IMPORTANT: When copying back to your local project, uncomment these:
// import Link from 'next/link';
// import { usePathname, useRouter } from 'next/navigation';
// ==================================================================

// --- MOCK NEXT.JS FOR CANVAS PREVIEW ---
const Link = ({ href, children, className, onClick }) => (
  <a href={href} className={className} onClick={(e) => { e.preventDefault(); if(onClick) onClick(e); }}>{children}</a>
);
const usePathname = () => '/pricelist';
const useRouter = () => ({ push: (url) => console.log('Navigating to:', url) });
// ------------------------------------------------------------------

import { supabase } from '../lib/supabaseClient';

import { 
  DocumentTextIcon, 
  PrinterIcon, 
  ChatBubbleBottomCenterTextIcon, 
  PlusIcon, 
  TrashIcon, 
  MagnifyingGlassIcon, 
  UserCircleIcon, 
  ArrowPathIcon,
  CheckCircleIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';

const getLocalDateString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export default function PricelistPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState('');

  // Data States
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  
  // Form States
  const [selectedCustomer, setSelectedCustomer] = useState('GENERAL');
  const [effectiveDate, setEffectiveDate] = useState(() => getLocalDateString(new Date()));
  const [validUntil, setValidUntil] = useState(() => {
      const d = new Date();
      d.setDate(d.getDate() + 7); // Default valid for 1 week
      return getLocalDateString(d);
  });
  
  // List States
  const [selectedItems, setSelectedItems] = useState([]); // { id, productCode, productName, category, uom, price }
  const [searchTerm, setSearchTerm] = useState('');
  const [isSmartLoading, setIsSmartLoading] = useState(false);

  useEffect(() => {
    async function loadData() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }
      setCurrentUser(session.user.email?.split('@')[0].toUpperCase() || 'STAFF');

      const [custRes, prodRes] = await Promise.all([
        supabase.from('Customers').select('id, CompanyName, Branch').order('CompanyName'),
        supabase.from('ProductMaster').select('ProductCode, ProductName, Category, SalesUOM, BaseUOM').order('ProductName')
      ]);

      setCustomers(custRes.data || []);
      setProducts(prodRes.data || []);
      setLoading(false);
    }
    loadData();
  }, [router]);

  // --- ACTIONS ---

  const handleAddProduct = (prod) => {
      if (selectedItems.find(i => i.productCode === prod.ProductCode)) return; // Prevent duplicates
      
      setSelectedItems(prev => [...prev, {
          id: Date.now() + Math.random(),
          productCode: prod.ProductCode,
          productName: prod.ProductName,
          category: prod.Category || 'OTHERS',
          uom: prod.SalesUOM || prod.BaseUOM || 'KG',
          price: '' // Default blank
      }]);
      setSearchTerm('');
  };

  const handleAddAllProducts = () => {
      if (!confirm("Are you sure you want to add ALL products to the price list?")) return;
      
      const currentCodes = new Set(selectedItems.map(i => i.productCode));
      const newItems = products
          .filter(p => !currentCodes.has(p.ProductCode))
          .map((prod, idx) => ({
              id: Date.now() + idx,
              productCode: prod.ProductCode,
              productName: prod.ProductName,
              category: prod.Category || 'OTHERS',
              uom: prod.SalesUOM || prod.BaseUOM || 'KG',
              price: ''
          }));
      
      setSelectedItems(prev => [...prev, ...newItems]);
  };

  const handleSmartLoad = async () => {
      if (selectedCustomer === 'GENERAL') return alert("Please select a specific customer to load their usual items.");
      setIsSmartLoading(true);

      const cust = customers.find(c => c.id.toString() === selectedCustomer);
      const targetName = cust.Branch ? `${cust.CompanyName} - ${cust.Branch}` : cust.CompanyName;
      
      // Fetch their past orders to find favorites and last sold prices
      const { data } = await supabase.from('Orders')
          .select('"Product Code", "Order Items", UOM, Price, "Delivery Date"')
          .ilike('Customer Name', `%${targetName.split(' ')[0]}%`) 
          .order('Timestamp', { ascending: false })
          .limit(1000);

      if (data && data.length > 0) {
          const freqMap = {};
          data.forEach(row => {
              const code = row["Product Code"];
              if (!code) return;
              
              if (!freqMap[code]) {
                  // Since ordered by Timestamp DESC, the first encounter is the most recent price!
                  freqMap[code] = { 
                      productCode: code, 
                      productName: row["Order Items"], 
                      uom: row.UOM, 
                      price: Number(row.Price) || '', 
                      count: 0 
                  };
              }
              freqMap[code].count++;
          });

          const currentCodes = new Set(selectedItems.map(i => i.productCode));
          const topItems = Object.values(freqMap)
              .filter(item => !currentCodes.has(item.productCode))
              .sort((a, b) => b.count - a.count)
              .slice(0, 30) // Top 30 most frequent items
              .map((item, idx) => {
                  // Find category from master
                  const masterProd = products.find(p => p.ProductCode === item.productCode);
                  return {
                      id: Date.now() + idx,
                      productCode: item.productCode,
                      productName: item.productName,
                      category: masterProd?.Category || 'OTHERS',
                      uom: item.uom,
                      price: item.price
                  };
              });

          if (topItems.length > 0) {
              setSelectedItems(prev => [...prev, ...topItems]);
              alert(`Successfully loaded ${topItems.length} frequent products with their last sold prices!`);
          } else {
              alert("No new historical items found for this customer.");
          }
      } else {
          alert("No order history found for this customer.");
      }
      
      setIsSmartLoading(false);
  };

  const handleUpdateItem = (id, field, value) => {
      setSelectedItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const handleRemoveItem = (id) => {
      setSelectedItems(prev => prev.filter(item => item.id !== id));
  };

  const handleClearList = () => {
      if (confirm("Clear all items from the list?")) setSelectedItems([]);
  };

  // --- EXPORT LOGIC ---

  const copyToWhatsApp = () => {
      if (selectedItems.length === 0) return alert("The list is empty.");

      const custName = selectedCustomer === 'GENERAL' ? 'Valued Customer' : customers.find(c => c.id.toString() === selectedCustomer)?.CompanyName;
      
      let text = `*FRESHER FARM DIRECT SDN BHD*\n`;
      text += `Special Weekly Price List\n`;
      text += `For: *${custName}*\n`;
      text += `Effective: ${effectiveDate.split('-').reverse().join('/')}\n\n`;

      // Group by Category for neat WhatsApp display
      const grouped = {};
      selectedItems.forEach(item => {
          if (!grouped[item.category]) grouped[item.category] = [];
          grouped[item.category].push(item);
      });

      // Sort categories (VEGE first, then alphabetical)
      const sortedCategories = Object.keys(grouped).sort((a, b) => {
          if (a === 'VEGE') return -1;
          if (b === 'VEGE') return 1;
          return a.localeCompare(b);
      });

      sortedCategories.forEach(cat => {
          text += `📦 *${cat}*\n`;
          // Sort items alphabetically within category
          grouped[cat].sort((a, b) => a.productName.localeCompare(b.productName)).forEach(item => {
              const priceStr = item.price ? `RM ${Number(item.price).toFixed(2)}` : 'TBA';
              text += `• ${item.productName} (${item.uom}): ${priceStr}\n`;
          });
          text += `\n`;
      });

      text += `_Subject to stock availability. Please contact us to confirm your order._`;

      // Copy to clipboard
      navigator.clipboard.writeText(text).then(() => {
          alert("Pricelist copied to clipboard! You can now paste it into WhatsApp.");
      }).catch(() => {
          alert("Failed to copy. Please try again.");
      });
  };

  const formatDateLabel = (dateStr) => {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      return !isNaN(d) ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : dateStr;
  };

  // --- FILTERS ---
  const filteredProducts = products.filter(p => {
      if (!searchTerm) return true;
      const terms = searchTerm.toLowerCase().split(' ').filter(Boolean);
      const str = `${p.ProductName} ${p.ProductCode}`.toLowerCase();
      return terms.every(t => str.includes(t));
  });

  if (loading) return <div className="p-10 flex items-center justify-center h-screen text-gray-400 font-black tracking-widest animate-pulse uppercase">Loading Intelligence...</div>;

  return (
    <div className="p-3 md:p-8 max-w-full overflow-x-hidden min-h-screen bg-gray-50/50 pb-32 animate-in fade-in duration-300 print:bg-white print:p-0 print:pb-0">
      
      {/* WRAPPER TO HIDE ALL ON-SCREEN UI DURING PRINT */}
      <div className="print-hidden flex flex-col h-full">
          
          <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
             <div>
                 <h1 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight">Price List Generator</h1>
                 <p className="text-[10px] md:text-xs text-gray-400 font-bold uppercase mt-1">Create and export customized weekly pricing for clients</p>
             </div>
             <div className="text-[9px] md:text-xs font-bold text-gray-500 bg-white border border-gray-200 px-3 py-1.5 rounded-full uppercase shadow-sm hidden sm:block">
                 User: {currentUser}
             </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
              
              {/* LEFT: Settings & Catalog */}
              <div className="xl:col-span-4 bg-white p-5 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col min-h-[400px] xl:h-[calc(100vh-140px)]">
                  
                  {/* Document Settings */}
                  <div className="mb-6 space-y-4">
                      <div>
                          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Target Customer</label>
                          <div className="relative">
                              <UserCircleIcon className="w-5 h-5 text-gray-400 absolute left-3 top-3.5" />
                              <select 
                                  className="w-full pl-10 p-3.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-black uppercase text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
                                  value={selectedCustomer}
                                  onChange={e => setSelectedCustomer(e.target.value)}
                              >
                                  <option value="GENERAL">-- GENERAL PRICE LIST --</option>
                                  {customers.map(c => (
                                      <option key={c.id} value={c.id}>{c.Branch ? `${c.CompanyName} - ${c.Branch}` : c.CompanyName}</option>
                                  ))}
                              </select>
                          </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                          <div>
                              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Effective Date</label>
                              <input 
                                  type="date" 
                                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
                                  value={effectiveDate}
                                  onChange={e => setEffectiveDate(e.target.value)}
                              />
                          </div>
                          <div>
                              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Valid Until</label>
                              <input 
                                  type="date" 
                                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
                                  value={validUntil}
                                  onChange={e => setValidUntil(e.target.value)}
                              />
                          </div>
                      </div>

                      {/* Smart Load Action */}
                      {selectedCustomer !== 'GENERAL' && (
                          <button 
                              onClick={handleSmartLoad}
                              disabled={isSmartLoading}
                              className="w-full bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-black py-3 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 text-xs uppercase tracking-widest active:scale-95 disabled:opacity-50"
                          >
                              <SparklesIcon className={`w-5 h-5 ${isSmartLoading ? 'animate-pulse' : ''}`} /> 
                              {isSmartLoading ? 'Analyzing...' : 'Smart Load Usual Items'}
                          </button>
                      )}
                  </div>

                  {/* Catalog Search */}
                  <div className="flex-1 flex flex-col overflow-hidden pt-4 border-t border-gray-100">
                      <div className="flex justify-between items-center mb-3">
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Product Catalog</label>
                          <button onClick={handleAddAllProducts} className="text-[9px] font-black bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-1 rounded transition-colors uppercase">Add All</button>
                      </div>
                      <div className="relative mb-3 flex-none">
                          <span className="absolute left-3 top-3 text-gray-400"><MagnifyingGlassIcon className="w-4 h-4" /></span>
                          <input 
                              type="text"
                              placeholder="Search to add products..."
                              className="w-full pl-9 p-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm"
                              value={searchTerm}
                              onChange={e => setSearchTerm(e.target.value)}
                          />
                      </div>
                      
                      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-1.5">
                          {filteredProducts.map(p => {
                              const isAdded = selectedItems.some(i => i.productCode === p.ProductCode);
                              return (
                                  <div 
                                      key={p.ProductCode} 
                                      onClick={() => handleAddProduct(p)}
                                      className={`p-3 rounded-xl border flex justify-between items-center transition-all ${isAdded ? 'bg-gray-50 border-gray-200 opacity-50 cursor-not-allowed' : 'bg-white border-gray-200 cursor-pointer hover:border-blue-300 hover:shadow-sm group'}`}
                                  >
                                      <div>
                                          <div className="font-bold text-xs uppercase leading-tight text-gray-800 group-hover:text-blue-700">{p.ProductName}</div>
                                          <div className="text-[9px] font-mono text-gray-400 mt-0.5">{p.ProductCode}</div>
                                      </div>
                                      {!isAdded && <PlusIcon className="w-5 h-5 text-gray-300 group-hover:text-blue-500 transition-colors" />}
                                      {isAdded && <CheckCircleIcon className="w-5 h-5 text-green-500" />}
                                  </div>
                              );
                          })}
                      </div>
                  </div>
              </div>

              {/* RIGHT: Active Pricelist Editor */}
              <div className="xl:col-span-8 bg-white p-5 md:p-6 rounded-[2rem] shadow-xl border border-gray-100 flex flex-col h-[calc(100vh-140px)] min-h-[600px]">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-6 gap-4 border-b border-gray-100 pb-4 flex-none">
                      <div>
                          <h2 className="text-lg md:text-xl font-black text-gray-800 uppercase tracking-tight flex items-center gap-2">
                              <DocumentTextIcon className="w-6 h-6 text-blue-600" /> Active Price List
                          </h2>
                          <p className="text-[10px] md:text-xs text-gray-500 font-bold uppercase mt-1">
                              {selectedItems.length} Products included
                          </p>
                      </div>
                      <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                          <button onClick={handleClearList} className="flex-1 sm:flex-none bg-red-50 hover:bg-red-100 text-red-600 font-black py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 text-[10px] md:text-xs uppercase tracking-widest"><TrashIcon className="w-4 h-4"/> Clear</button>
                          <button onClick={copyToWhatsApp} className="flex-1 sm:flex-none bg-[#25D366] hover:bg-[#20bd5a] text-white font-black py-2.5 px-4 rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 text-[10px] md:text-xs uppercase tracking-widest"><ChatBubbleBottomCenterTextIcon className="w-4 h-4"/> WhatsApp</button>
                          <button onClick={() => window.print()} className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 text-white font-black py-2.5 px-4 rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 text-[10px] md:text-xs uppercase tracking-widest"><PrinterIcon className="w-4 h-4"/> Print PDF</button>
                      </div>
                  </div>

                  <div className="flex-1 overflow-auto custom-scrollbar border border-gray-100 rounded-3xl">
                      {selectedItems.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-gray-300 p-8 text-center">
                              <DocumentTextIcon className="w-16 h-16 mb-4 opacity-20" />
                              <p className="font-bold text-sm">Your price list is empty.</p>
                              <p className="text-xs mt-1 max-w-xs">Select a customer and click "Smart Load", or manually add products from the catalog on the left.</p>
                          </div>
                      ) : (
                          <table className="w-full text-left whitespace-nowrap min-w-[500px]">
                              <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest sticky top-0 z-10 shadow-sm border-b border-gray-100">
                                  <tr>
                                      <th className="p-4 pl-6">Product</th>
                                      <th className="p-4 text-center w-24">UOM</th>
                                      <th className="p-4 text-right w-40">Selling Price (RM)</th>
                                      <th className="p-4 text-center w-16 pr-6"></th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50 text-sm font-bold text-gray-700">
                                  {selectedItems.map((item, idx) => (
                                      <tr key={item.id} className="hover:bg-blue-50/30 transition-colors group/row">
                                          <td className="p-3 pl-6">
                                              <div className="font-black text-gray-800 uppercase leading-tight truncate max-w-[250px]">{item.productName}</div>
                                              <div className="flex gap-2 items-center mt-1">
                                                  <span className="text-[9px] font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">{item.productCode}</span>
                                                  <span className="text-[8px] font-black text-blue-500 uppercase tracking-widest">{item.category}</span>
                                              </div>
                                          </td>
                                          <td className="p-3 text-center">
                                              <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-lg text-xs font-black uppercase border border-gray-200">{item.uom}</span>
                                          </td>
                                          <td className="p-3 text-right">
                                              <input 
                                                  type="number" 
                                                  step="0.01" 
                                                  className="w-full max-w-[120px] p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-right font-black text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ml-auto shadow-sm"
                                                  placeholder="0.00"
                                                  value={item.price}
                                                  onChange={(e) => handleUpdateItem(item.id, 'price', e.target.value)}
                                              />
                                          </td>
                                          <td className="p-3 text-center pr-6">
                                              <button onClick={() => handleRemoveItem(item.id)} className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                                  <TrashIcon className="w-5 h-5" />
                                              </button>
                                          </td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      )}
                  </div>
              </div>
          </div>
      </div>

      {/* ==========================================
          PRINT LAYOUT (A4 OPTIMIZED)
          ========================================== */}
      <div className="hidden print:block text-black font-sans text-xs bg-white">
          <style dangerouslySetInnerHTML={{__html: `
              @media print {
                  @page { size: A4; margin: 0; }
                  html, body, main { background: white !important; margin: 0 !important; padding: 0 !important; -webkit-print-color-adjust: exact; }
                  main { padding-top: 0 !important; }
                  .print-hidden { display: none !important; }
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
                          <p className="text-lg font-black uppercase">{selectedCustomer === 'GENERAL' ? 'Valued Customer' : customers.find(c => c.id.toString() === selectedCustomer)?.CompanyName}</p>
                      </div>
                  </div>
                  <div className="text-right border-l-2 border-black pl-4">
                      <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1">Effective Date</p>
                      <p className="text-lg font-black">{formatDateLabel(effectiveDate)}</p>
                      <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mt-2 mb-1">Valid Until</p>
                      <p className="text-lg font-black">{formatDateLabel(validUntil)}</p>
                  </div>
              </div>

              {/* --- ITEMS TABLE --- */}
              <div className="flex-grow relative mt-2">
                  <table className="w-full border-collapse text-xs">
                      <thead>
                          <tr className="border-b-2 border-t-2 border-black text-black uppercase font-black bg-gray-100/50">
                              <th className="py-2 px-2 text-center w-12 border-r border-gray-300">No</th>
                              <th className="py-2 px-3 text-left border-r border-gray-300">Product Description</th>
                              <th className="py-2 px-2 text-center w-24 border-r border-gray-300">UOM</th>
                              <th className="py-2 px-3 text-right w-32">Price (RM)</th>
                          </tr>
                      </thead>
                      <tbody>
                          {/* Group by category and sort */}
                          {(() => {
                              const grouped = {};
                              selectedItems.forEach(item => {
                                  if (!grouped[item.category]) grouped[item.category] = [];
                                  grouped[item.category].push(item);
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
                                  
                                  // Product Rows
                                  grouped[cat].sort((a, b) => a.productName.localeCompare(b.productName)).forEach(item => {
                                      rows.push(
                                          <tr key={item.id} className="border-b border-gray-200 h-8">
                                              <td className="py-1 px-2 text-center border-r border-gray-200 font-bold text-gray-500">{globalIndex++}</td>
                                              <td className="py-1 px-3 border-r border-gray-200 font-black uppercase text-gray-800">{item.productName}</td>
                                              <td className="py-1 px-2 text-center border-r border-gray-200 font-bold uppercase">{item.uom}</td>
                                              <td className="py-1 px-3 text-right font-black text-black text-sm">
                                                  {item.price ? Number(item.price).toFixed(2) : 'TBA'}
                                              </td>
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

    </div>
  );
}