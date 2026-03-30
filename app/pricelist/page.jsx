'use client';
import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '../lib/supabaseClient';

// Import the newly extracted PDF Print Layout
import PrintLayout from './PrintLayout';

import { 
  DocumentTextIcon, 
  PrinterIcon, 
  ChatBubbleBottomCenterTextIcon, 
  PlusIcon, 
  TrashIcon, 
  MagnifyingGlassIcon, 
  UserCircleIcon, 
  CheckCircleIcon,
  SparklesIcon,
  CloudArrowUpIcon
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
  const [allCustomers, setAllCustomers] = useState([]); // Raw list of all DB customers
  const [brandList, setBrandList] = useState([]); // Unique Brands (fallback to CompanyName)
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
  const [isSavingDB, setIsSavingDB] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();
          
          if (sessionError) throw sessionError;
          if (!session) {
            router.push('/login');
            return;
          }
          
          setCurrentUser(session.user.email?.split('@')[0].toUpperCase() || 'STAFF');

          const [custRes, prodRes] = await Promise.all([
            supabase.from('Customers').select('BrandName, CompanyName').order('CompanyName'),
            supabase.from('ProductMaster').select('ProductCode, ProductName, Category, SalesUOM, BaseUOM, AllowedUOMs').order('ProductName')
          ]);

          if (custRes.error) throw custRes.error;
          if (prodRes.error) throw prodRes.error;

          // 1. Save all raw customers for mapping later
          setAllCustomers(custRes.data || []);

          // 2. Extract Unique Brands (Fallback to CompanyName if BrandName is empty)
          const uniqueBrands = Array.from(new Set(
              (custRes.data || []).map(c => (c.BrandName || c.CompanyName).toUpperCase().trim())
          )).filter(Boolean).sort();
          
          setBrandList(uniqueBrands);
          setProducts(prodRes.data || []);
      } catch (error) {
          console.error("Error loading intelligence:", error);
      } finally {
          setLoading(false);
      }
    }
    
    loadData();
  }, [router]);

  // --- ACTIONS ---

  const handleAddProduct = (prod) => {
      const defaultUom = prod.SalesUOM || prod.BaseUOM || 'KG';
      
      // Determine which UOM to add next if they click multiple times
      const existingUoms = selectedItems.filter(i => i.productCode === prod.ProductCode).map(i => i.uom);
      const allAllowed = Array.from(new Set([prod.BaseUOM, ...(prod.AllowedUOMs ? prod.AllowedUOMs.split(',').map(u=>u.trim().toUpperCase()) : [])])).filter(Boolean);
      
      let uomToAdd = defaultUom;
      
      if (existingUoms.includes(defaultUom)) {
          // If default is already in the list, find the next available UOM
          const nextUom = allAllowed.find(u => !existingUoms.includes(u));
          if (!nextUom) return; // All possible UOMs are already added!
          uomToAdd = nextUom;
      }
      
      setSelectedItems(prev => [...prev, {
          id: Date.now() + Math.random(),
          productCode: prod.ProductCode,
          productName: prod.ProductName,
          category: prod.Category || 'OTHERS',
          uom: uomToAdd,
          price: '' 
      }]);
      setSearchTerm('');
  };

  const handleAddAllProducts = () => {
      if (!confirm("Are you sure you want to add ALL products (default UOM) to the price list?")) return;
      
      const newItems = [];
      products.forEach((prod, idx) => {
          const defaultUom = prod.SalesUOM || prod.BaseUOM || 'KG';
          // Only add if not already present with this UOM
          const exists = selectedItems.find(i => i.productCode === prod.ProductCode && i.uom === defaultUom);
          if (!exists) {
              newItems.push({
                  id: Date.now() + idx + Math.random(),
                  productCode: prod.ProductCode,
                  productName: prod.ProductName,
                  category: prod.Category || 'OTHERS',
                  uom: defaultUom,
                  price: ''
              });
          }
      });
      
      setSelectedItems(prev => [...prev, ...newItems]);
  };

  const handleSmartLoad = async () => {
      if (selectedCustomer === 'GENERAL') return alert("Please select a specific brand to load their usual items.");
      setIsSmartLoading(true);

      try {
          // 1. Find all CompanyNames that belong to this selected Brand (or CompanyName fallback)
          const matchingCompanies = Array.from(new Set(
              allCustomers
                  .filter(c => (c.BrandName || c.CompanyName).toUpperCase().trim() === selectedCustomer)
                  .map(c => c.CompanyName)
          ));

          // 2. Fetch a large chunk of recent orders
          const { data } = await supabase.from('Orders')
              .select('"Product Code", "Order Items", UOM, Price, "Delivery Date", "Customer Name"')
              .order('Timestamp', { ascending: false })
              .limit(5000); 

          // 3. Filter orders in memory to match ANY of the companies under this brand
          const matchedData = (data || []).filter(row => {
              const rowCustName = (row["Customer Name"] || '').toUpperCase();
              return matchingCompanies.some(cn => rowCustName.includes(cn.toUpperCase()));
          });

          if (matchedData.length > 0) {
              const freqMap = {};
              matchedData.forEach(row => {
                  const code = row["Product Code"];
                  const uom = row.UOM || 'KG';
                  if (!code) return;
                  
                  // Group by Product Code AND UOM so we can load multiple pricing tiers (e.g. CTN vs PKT)
                  const mapKey = `${code}_${uom}`;
                  
                  if (!freqMap[mapKey]) {
                      freqMap[mapKey] = { 
                          productCode: code, 
                          productName: row["Order Items"], 
                          uom: uom, 
                          price: Number(row.Price) || '', 
                          count: 0 
                      };
                  }
                  freqMap[mapKey].count++;
              });

              const currentMapKeys = new Set(selectedItems.map(i => `${i.productCode}_${i.uom}`));
              const topItems = Object.values(freqMap)
                  .filter(item => !currentMapKeys.has(`${item.productCode}_${item.uom}`))
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 40) // Top 40 most frequent items
                  .map((item, idx) => {
                      const masterProd = products.find(p => p.ProductCode === item.productCode);
                      return {
                          id: Date.now() + idx + Math.random(),
                          productCode: item.productCode,
                          productName: item.productName,
                          category: masterProd?.Category || 'OTHERS',
                          uom: item.uom,
                          price: item.price
                      };
                  });

              if (topItems.length > 0) {
                  setSelectedItems(prev => [...prev, ...topItems]);
                  alert(`Successfully loaded ${topItems.length} frequent item/UOM variants with their last sold prices!`);
              } else {
                  alert("No new historical items found for this brand.");
              }
          } else {
              alert("No order history found for this brand/customer.");
          }
      } catch (err) {
          console.error("Error during Smart Load:", err);
          alert("Error fetching historical data.");
      } finally {
          setIsSmartLoading(false);
      }
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

  // --- EXPORT & DB LOGIC ---

  const handleSaveToDB = async () => {
      if (selectedCustomer === 'GENERAL') return alert("Cannot save special prices for 'GENERAL'. Please select a specific brand.");
      if (selectedItems.length === 0) return alert("The price list is empty.");

      setIsSavingDB(true);

      try {
          // 1. Find all specific CompanyNames associated with this Brand
          const companyNamesToUpdate = Array.from(new Set(
              allCustomers
                  .filter(c => (c.BrandName || c.CompanyName).toUpperCase().trim() === selectedCustomer)
                  .map(c => c.CompanyName)
          ));

          // 2. Delete old prices for ALL these specific companies to ensure a clean slate
          await supabase.from('CustomerPrices').delete().in('CustomerName', companyNamesToUpdate);

          // 3. Create price rows duplicated for EVERY specific company under the brand
          const rows = [];
          companyNamesToUpdate.forEach(cName => {
              selectedItems.forEach(item => {
                  rows.push({
                      CustomerName: cName,
                      ProductCode: item.productCode,
                      ProductName: item.productName,
                      UOM: item.uom,
                      Price: Number(item.price) || 0,
                      ValidUntil: validUntil,
                      LoggedBy: currentUser
                  });
              });
          });

          // 4. Insert new prices into the database
          const { error } = await supabase.from('CustomerPrices').insert(rows);

          if (error) {
              alert("Database Error: " + error.message);
          } else {
              alert(`Success! Saved ${selectedItems.length} prices across ${companyNamesToUpdate.length} outlets for ${selectedCustomer}. They will now auto-fill in new orders!`);
          }
      } catch (error) {
          console.error("Save error:", error);
          alert("Failed to save to database.");
      } finally {
          setIsSavingDB(false);
      }
  };

  const copyToWhatsApp = () => {
      if (selectedItems.length === 0) return alert("The list is empty.");

      const custName = selectedCustomer === 'GENERAL' ? 'Valued Customer' : selectedCustomer;
      
      let text = `*FRESHER FARM DIRECT SDN BHD*\n`;
      text += `Special Weekly Price List\n`;
      text += `For: *${custName}*\n`;
      text += `Effective: ${effectiveDate.split('-').reverse().join('/')}\n\n`;

      // Group by Category -> then by Product Code to combine UOMs/Prices in WhatsApp
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
          grouped[item.category][item.productCode].prices.push(item.price ? `RM ${Number(item.price).toFixed(2)}` : 'TBA');
      });

      const sortedCategories = Object.keys(grouped).sort((a, b) => {
          if (a === 'VEGE') return -1;
          if (b === 'VEGE') return 1;
          return a.localeCompare(b);
      });

      sortedCategories.forEach(cat => {
          text += `📦 *${cat}*\n`;
          // Sort items alphabetically
          const productsInCat = Object.values(grouped[cat]).sort((a, b) => a.productName.localeCompare(b.productName));
          productsInCat.forEach(prod => {
              const uomStr = prod.uoms.join(' / ');
              const priceStr = prod.prices.join(' / ');
              text += `• ${prod.productName} (${uomStr}): ${priceStr}\n`;
          });
          text += `\n`;
      });

      text += `_Subject to stock availability. Please contact us to confirm your order._`;

      navigator.clipboard.writeText(text).then(() => {
          alert("Pricelist copied to clipboard! You can now paste it into WhatsApp.");
      }).catch(() => {
          alert("Failed to copy. Please try again.");
      });
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
    <>
      {/* ==========================================
          INTERACTIVE UI (HIDDEN DURING PRINT)
          ========================================== */}
      <div className="print:hidden p-3 md:p-8 max-w-full overflow-x-hidden min-h-screen bg-gray-50/50 pb-32 animate-in fade-in duration-300">
          
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
                          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Target Brand / Customer</label>
                          <div className="relative">
                              <UserCircleIcon className="w-5 h-5 text-gray-400 absolute left-3 top-3.5" />
                              <select 
                                  className="w-full pl-10 p-3.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-black uppercase text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
                                  value={selectedCustomer}
                                  onChange={e => setSelectedCustomer(e.target.value)}
                              >
                                  <option value="GENERAL">-- GENERAL PRICE LIST --</option>
                                  {brandList.map(brand => (
                                      <option key={brand} value={brand}>{brand}</option>
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
                              {isSmartLoading ? 'Analyzing Outlets...' : 'Smart Load Usual Items'}
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
                              const addedUoms = selectedItems.filter(i => i.productCode === p.ProductCode).map(i => i.uom);
                              const allAllowed = Array.from(new Set([p.BaseUOM, ...(p.AllowedUOMs ? p.AllowedUOMs.split(',').map(u=>u.trim().toUpperCase()) : [])])).filter(Boolean);
                              const isAllAdded = addedUoms.length > 0 && addedUoms.length >= allAllowed.length;

                              return (
                                  <div 
                                      key={p.ProductCode} 
                                      onClick={() => handleAddProduct(p)}
                                      className={`p-3 rounded-xl border flex justify-between items-center transition-all ${isAllAdded ? 'bg-gray-50 border-gray-200 opacity-50 cursor-not-allowed' : 'bg-white border-gray-200 cursor-pointer hover:border-blue-300 hover:shadow-sm group'}`}
                                  >
                                      <div>
                                          <div className="font-bold text-xs uppercase leading-tight text-gray-800 group-hover:text-blue-700">{p.ProductName}</div>
                                          <div className="flex gap-2 items-center mt-0.5">
                                              <span className="text-[9px] font-mono text-gray-400">{p.ProductCode}</span>
                                              {addedUoms.length > 0 && (
                                                  <span className="text-[8px] font-black text-blue-500 bg-blue-50 px-1 rounded uppercase tracking-widest">{addedUoms.join(', ')} added</span>
                                              )}
                                          </div>
                                      </div>
                                      {!isAllAdded && <PlusIcon className="w-5 h-5 text-gray-300 group-hover:text-blue-500 transition-colors shrink-0" />}
                                      {isAllAdded && <CheckCircleIcon className="w-5 h-5 text-green-500 shrink-0" />}
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
                              {selectedItems.length} Entries included
                          </p>
                      </div>
                      <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                          <button onClick={handleClearList} className="flex-1 sm:flex-none bg-red-50 hover:bg-red-100 text-red-600 font-black py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 text-[10px] md:text-xs uppercase tracking-widest"><TrashIcon className="w-4 h-4"/> Clear</button>
                          <button onClick={copyToWhatsApp} className="flex-1 sm:flex-none bg-[#25D366] hover:bg-[#20bd5a] text-white font-black py-2.5 px-4 rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 text-[10px] md:text-xs uppercase tracking-widest"><ChatBubbleBottomCenterTextIcon className="w-4 h-4"/> WhatsApp</button>
                          <button onClick={() => window.print()} className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 text-white font-black py-2.5 px-4 rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 text-[10px] md:text-xs uppercase tracking-widest"><PrinterIcon className="w-4 h-4"/> Print PDF</button>
                          <button onClick={handleSaveToDB} disabled={isSavingDB} className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-black py-2.5 px-4 rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 text-[10px] md:text-xs uppercase tracking-widest disabled:opacity-50">
                              <CloudArrowUpIcon className="w-4 h-4 md:w-5 md:h-5"/> Save DB
                          </button>
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
                                      <th className="p-4 text-center w-28">UOM</th>
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
                                              <select 
                                                  className="bg-gray-100 text-gray-600 px-3 py-1 rounded-lg text-xs font-black uppercase border border-gray-200 outline-none focus:ring-2 focus:ring-blue-500 w-full"
                                                  value={item.uom}
                                                  onChange={(e) => handleUpdateItem(item.id, 'uom', e.target.value)}
                                              >
                                                  {(() => {
                                                      const prod = products.find(p => p.ProductCode === item.productCode);
                                                      const allowed = prod?.AllowedUOMs ? prod.AllowedUOMs.split(',').map(u=>u.trim().toUpperCase()) : [];
                                                      const allUoms = Array.from(new Set([prod?.BaseUOM || item.uom, ...allowed])).filter(Boolean);
                                                      return allUoms.map(u => <option key={u} value={u}>{u}</option>);
                                                  })()}
                                              </select>
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
          EXTERNAL PRINT COMPONENT
          ========================================== */}
      <PrintLayout 
          selectedCustomer={selectedCustomer}
          effectiveDate={effectiveDate}
          validUntil={validUntil}
          selectedItems={selectedItems}
      />
    </>
  );
}