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
  CloudArrowUpIcon,
  CloudArrowDownIcon
} from '@heroicons/react/24/outline';

const getLocalDateString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Helper: Filter allowed UOMs, restrict 'PCS' for Thai/Local fruits, and globally remove 'PKT'
const getAllowedUOMs = (prod) => {
    let allowed = Array.from(new Set([prod.BaseUOM, ...(prod.AllowedUOMs ? prod.AllowedUOMs.split(',').map(u=>u.trim().toUpperCase()) : [])])).filter(Boolean);
    
    // Globally remove 'PKT' from the price list options
    allowed = allowed.filter(u => u !== 'PKT');

    const cat = (prod.Category || '').toUpperCase();
    if (cat.includes('LOCAL') || cat.includes('THAI')) {
        allowed = allowed.filter(u => u !== 'PCS');
    }
    return allowed;
};

export default function PricelistPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState('');

  // Data States
  const [allCustomers, setAllCustomers] = useState([]); 
  const [brandList, setBrandList] = useState([]); 
  const [products, setProducts] = useState([]);
  
  // Intelligence States (NEW)
  const [conversions, setConversions] = useState([]);
  const [latestCosts, setLatestCosts] = useState({});
  const [generalPrices, setGeneralPrices] = useState({});
  
  // Form States
  const [selectedCustomer, setSelectedCustomer] = useState('GENERAL');
  const [effectiveDate, setEffectiveDate] = useState(() => getLocalDateString(new Date()));
  const [validUntil, setValidUntil] = useState(() => {
      const d = new Date();
      d.setDate(d.getDate() + 7); // Default valid for 1 week
      return getLocalDateString(d);
  });
  
  // List States
  const [selectedItems, setSelectedItems] = useState([]); 
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSearchTerm, setActiveSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All'); 
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

          // Fetch all required data matrices in parallel for pricing intelligence
          const [custRes, prodRes, convRes, purRes, genPriceRes] = await Promise.all([
            supabase.from('Customers').select('BrandName, CompanyName').order('CompanyName'),
            supabase.from('ProductMaster').select('ProductCode, ProductName, ChineseName, Category, SalesUOM, BaseUOM, AllowedUOMs').order('ProductName'),
            supabase.from('UOM_Conversions').select('*'),
            supabase.from('Purchase').select('ProductCode, CostPrice, PurchaseUOM').order('Timestamp', { ascending: false }).limit(5000),
            supabase.from('CustomerPrices').select('ProductCode, UOM, Price').eq('CustomerName', 'GENERAL')
          ]);

          if (custRes.error) throw custRes.error;
          if (prodRes.error) throw prodRes.error;

          setAllCustomers(custRes.data || []);
          setProducts(prodRes.data || []);
          setConversions(convRes.data || []);

          // Map Latest Costs (since it's ordered by timestamp desc, first match is latest)
          const costsMap = {};
          (purRes.data || []).forEach(p => {
              if (!costsMap[p.ProductCode]) {
                  costsMap[p.ProductCode] = { cost: p.CostPrice, uom: p.PurchaseUOM };
              }
          });
          setLatestCosts(costsMap);

          // Map General Prices
          const genMap = {};
          (genPriceRes.data || []).forEach(p => {
              genMap[`${p.ProductCode}_${p.UOM}`] = p.Price;
          });
          setGeneralPrices(genMap);

          const uniqueBrands = Array.from(new Set(
              (custRes.data || []).map(c => (c.BrandName || c.CompanyName).toUpperCase().trim())
          )).filter(Boolean).sort();
          
          setBrandList(uniqueBrands);
      } catch (error) {
          console.error("Error loading intelligence:", error);
      } finally {
          setLoading(false);
      }
    }
    
    loadData();
  }, [router]);

  // --- PRICING INTELLIGENCE ENGINE ---
  const getSuggestedPrice = (prod, targetUom, currentCust) => {
      // 1. Prioritize GENERAL price list as the main reference for other outlets
      if (currentCust !== 'GENERAL') {
          const genKey = `${prod.ProductCode}_${targetUom}`;
          if (generalPrices[genKey] !== undefined) {
              return generalPrices[genKey];
          }
      }

      // 2. If it is GENERAL (or no general price exists), use Price Trend
      const costData = latestCosts[prod.ProductCode];
      if (!costData || !costData.cost) return '';

      const cost = Number(costData.cost);
      const purUom = (costData.uom || prod.BaseUOM).toUpperCase();

      // Step A: Calculate Primary Selling Price for the exact Purchase UOM (Cost + 15% margin)
      const primaryPrice = cost * 1.15;

      if (purUom === targetUom) {
          return (Math.ceil(primaryPrice * 10) / 10).toFixed(2);
      }

      // Step B: Calculate Conversion Ratio between Purchase UOM and Target UOM
      const getFactor = (uom) => {
          if (uom === prod.BaseUOM) return 1;
          const conv = conversions.find(c => c.ProductCode === prod.ProductCode && c.ConversionUOM === uom);
          return conv && Number(conv.Factor) > 0 ? Number(conv.Factor) : 1;
      };

      const purFactor = getFactor(purUom);
      const targetFactor = getFactor(targetUom);

      // Ratio > 1 means Purchase UOM is larger than Target UOM (e.g., CTN (15) to KG (1) = ratio 15)
      let ratio = purFactor / targetFactor;

      // --- CUSTOM EXCLUSIONS: Do not bother with KG/PCS or PKT/PCS conversions ---
      // Treat them as 1:1 equivalent in price to avoid weird fractional math and extra markups
      const isKgPcs = (purUom === 'KG' && targetUom === 'PCS') || (purUom === 'PCS' && targetUom === 'KG');
      const isPktPcs = (purUom === 'PKT' && targetUom === 'PCS') || (purUom === 'PCS' && targetUom === 'PKT');
      
      if (isKgPcs || isPktPcs) {
          ratio = 1;
      }

      // Step C: Calculate base proportional price for the Target UOM
      let finalPrice = primaryPrice / ratio;

      // Step D: Apply Repacking/Breakdown Markup (Extra 25% -> multiply by 1.25) 
      // This applies dynamically whenever breaking down a bulk unit into smaller units (CTN->KG, BKL->KG, CTN->PCS)
      if (ratio > 1) {
          finalPrice = finalPrice * 1.25;
      }

      // Rounding up to the nearest 10 cents for fresh produce standards
      return (Math.ceil(finalPrice * 10) / 10).toFixed(2);
  };

  // --- ACTIONS ---

  const handleAddProduct = (prod) => {
      if (selectedItems.find(i => i.productCode === prod.ProductCode)) return; 
      
      const allowed = getAllowedUOMs(prod);
      const pricesObj = {};
      const refPricesObj = {};
      allowed.forEach(u => {
          const sugg = getSuggestedPrice(prod, u, selectedCustomer);
          pricesObj[u] = sugg;
          refPricesObj[u] = sugg;
      });
      
      setSelectedItems(prev => [...prev, {
          productCode: prod.ProductCode,
          productName: prod.ProductName,
          chineseName: prod.ChineseName || '',
          category: prod.Category || 'OTHERS',
          allowedUoms: allowed,
          prices: pricesObj,
          referencePrices: refPricesObj
      }]);
      setSearchTerm('');
  };

  const handleAddAllProducts = () => {
      if (!confirm(`Are you sure you want to add ALL currently filtered products (${filteredProducts.length}) to the price list?`)) return;
      
      const currentCodes = new Set(selectedItems.map(i => i.productCode));
      const newItems = [];
      
      filteredProducts.forEach((prod) => {
          if (!currentCodes.has(prod.ProductCode)) {
              const allowed = getAllowedUOMs(prod);
              const pricesObj = {};
              const refPricesObj = {};
              allowed.forEach(u => {
                  const sugg = getSuggestedPrice(prod, u, selectedCustomer);
                  pricesObj[u] = sugg;
                  refPricesObj[u] = sugg;
              });
              
              newItems.push({
                  productCode: prod.ProductCode,
                  productName: prod.ProductName,
                  chineseName: prod.ChineseName || '',
                  category: prod.Category || 'OTHERS',
                  allowedUoms: allowed,
                  prices: pricesObj,
                  referencePrices: refPricesObj
              });
          }
      });
      
      setSelectedItems(prev => [...prev, ...newItems]);
  };

  const handleUpdatePrice = (productCode, uom, value) => {
      setSelectedItems(prev => prev.map(item => {
          if (item.productCode === productCode) {
              return { ...item, prices: { ...item.prices, [uom]: value } };
          }
          return item;
      }));
  };

  const handleRemoveItem = (productCode) => {
      setSelectedItems(prev => prev.filter(item => item.productCode !== productCode));
  };

  const handleClearList = () => {
      if (confirm("Clear all items from the list?")) {
          setSelectedItems([]);
          setActiveSearchTerm(''); // Clear search on empty list
      }
  };

  // --- DB LOGIC ---

  const handleLoadRecent14Days = async () => {
      setIsSmartLoading(true);

      try {
          const past14Days = new Date();
          past14Days.setDate(past14Days.getDate() - 14);
          const dateStr = getLocalDateString(past14Days);

          const { data } = await supabase.from('Orders')
              .select('"Product Code", "Order Items", UOM, Price, "Delivery Date"')
              .gte('"Delivery Date"', dateStr)
              .order('Timestamp', { ascending: false })
              .limit(5000); 

          if (data && data.length > 0) {
              const freqMap = {}; 
              data.forEach(row => {
                  const code = row["Product Code"];
                  const uom = (row.UOM || 'KG').toUpperCase();
                  if (!code) return;
                  
                  const masterProd = products.find(p => p.ProductCode === code);

                  if (!freqMap[code]) {
                      const allowed = masterProd ? getAllowedUOMs(masterProd) : [uom];
                      const pricesObj = {};
                      const refPricesObj = {};
                      allowed.forEach(u => {
                          const sugg = masterProd ? getSuggestedPrice(masterProd, u, selectedCustomer) : '';
                          pricesObj[u] = sugg;
                          refPricesObj[u] = sugg;
                      });
                      
                      freqMap[code] = { 
                          productCode: code, 
                          productName: row["Order Items"], 
                          chineseName: masterProd?.ChineseName || '',
                          category: masterProd?.Category || 'OTHERS',
                          allowedUoms: allowed,
                          prices: pricesObj,
                          referencePrices: refPricesObj,
                          count: 0 
                      };
                  }
                  
                  if (!freqMap[code].prices[uom] && row.Price > 0) {
                      const cat = (masterProd?.Category || '').toUpperCase();
                      const isRestrictedCat = cat.includes('LOCAL') || cat.includes('THAI');
                      
                      if (!(isRestrictedCat && uom === 'PCS')) {
                          if(!freqMap[code].allowedUoms.includes(uom)) freqMap[code].allowedUoms.push(uom);
                          // The pricesObj is prefilled with suggested intelligence. Only fallback to row.Price if empty.
                          if (freqMap[code].prices[uom] === '') freqMap[code].prices[uom] = row.Price;
                      }
                  }
                  freqMap[code].count++;
              });

              const currentCodes = new Set(selectedItems.map(i => i.productCode));
              const newItems = Object.values(freqMap)
                  .filter(item => !currentCodes.has(item.productCode))
                  .sort((a, b) => b.count - a.count);

              if (newItems.length > 0) {
                  setSelectedItems(prev => [...prev, ...newItems]);
                  alert(`Successfully loaded ${newItems.length} active products. Prices inferred from logic matrix!`);
              } else {
                  alert("All actively purchased products from the last 14 days are already in the list.");
              }
          } else {
              alert("No orders found in the last 14 days.");
          }
      } catch (err) {
          console.error("Error during Recent 14 Days Load:", err);
          alert("Error fetching recent data.");
      } finally {
          setIsSmartLoading(false);
      }
  };

  const handleSmartLoad = async () => {
      if (selectedCustomer === 'GENERAL') return alert("Please select a specific brand to load their usual items.");
      setIsSmartLoading(true);

      try {
          const matchingCompanies = Array.from(new Set(
              allCustomers
                  .filter(c => (c.BrandName || c.CompanyName).toUpperCase().trim() === selectedCustomer)
                  .map(c => c.CompanyName)
          ));

          const { data } = await supabase.from('Orders')
              .select('"Product Code", "Order Items", UOM, Price, "Delivery Date", "Customer Name"')
              .order('Timestamp', { ascending: false })
              .limit(5000); 

          const matchedData = (data || []).filter(row => {
              const rowCustName = (row["Customer Name"] || '').toUpperCase();
              return matchingCompanies.some(cn => rowCustName.includes(cn.toUpperCase()));
          });

          if (matchedData.length > 0) {
              const freqMap = {}; 
              matchedData.forEach(row => {
                  const code = row["Product Code"];
                  const uom = (row.UOM || 'KG').toUpperCase();
                  if (!code) return;

                  const masterProd = products.find(p => p.ProductCode === code);
                  
                  if (!freqMap[code]) {
                      const allowed = masterProd ? getAllowedUOMs(masterProd) : [uom];
                      const pricesObj = {};
                      const refPricesObj = {};
                      allowed.forEach(u => {
                          const sugg = masterProd ? getSuggestedPrice(masterProd, u, selectedCustomer) : '';
                          pricesObj[u] = sugg;
                          refPricesObj[u] = sugg;
                      });
                      
                      freqMap[code] = { 
                          productCode: code, 
                          productName: row["Order Items"], 
                          chineseName: masterProd?.ChineseName || '',
                          category: masterProd?.Category || 'OTHERS',
                          allowedUoms: allowed,
                          prices: pricesObj,
                          referencePrices: refPricesObj,
                          count: 0 
                      };
                  }
                  
                  if (!freqMap[code].prices[uom] && row.Price > 0) {
                      const cat = (masterProd?.Category || '').toUpperCase();
                      const isRestrictedCat = cat.includes('LOCAL') || cat.includes('THAI');

                      if (!(isRestrictedCat && uom === 'PCS')) {
                          if(!freqMap[code].allowedUoms.includes(uom)) freqMap[code].allowedUoms.push(uom);
                          if (freqMap[code].prices[uom] === '') freqMap[code].prices[uom] = row.Price;
                      }
                  }
                  freqMap[code].count++;
              });

              const currentCodes = new Set(selectedItems.map(i => i.productCode));
              const topItems = Object.values(freqMap)
                  .filter(item => !currentCodes.has(item.productCode))
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 40); 

              if (topItems.length > 0) {
                  setSelectedItems(prev => [...prev, ...topItems]);
                  alert(`Successfully loaded ${topItems.length} frequent products. Prices inferred from intelligence!`);
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

  const handleLoadSavedPrices = async () => {
      setIsSmartLoading(true); 

      try {
          const { data, error } = await supabase
              .from('CustomerPrices')
              .select('*')
              .eq('CustomerName', selectedCustomer);

          if (error) throw error;

          if (data && data.length > 0) {
              if (data[0].ValidUntil) setValidUntil(data[0].ValidUntil);
              if (data[0].EffectiveDate) {
                  setEffectiveDate(data[0].EffectiveDate);
              } else if (data[0].created_at) {
                  setEffectiveDate(data[0].created_at.substring(0, 10));
              }

              const prodMap = {};
              data.forEach(row => {
                  const masterProd = products.find(p => p.ProductCode === row.ProductCode);

                  if (!prodMap[row.ProductCode]) {
                      const allowed = masterProd ? getAllowedUOMs(masterProd) : [row.UOM];
                      const pricesObj = {};
                      const refPricesObj = {};
                      // Prefill unassigned slots with suggested pricing
                      allowed.forEach(u => {
                          const sugg = masterProd ? getSuggestedPrice(masterProd, u, selectedCustomer) : '';
                          pricesObj[u] = sugg;
                          refPricesObj[u] = sugg;
                      });
                      
                      prodMap[row.ProductCode] = {
                          productCode: row.ProductCode,
                          productName: row.ProductName,
                          chineseName: masterProd?.ChineseName || '',
                          category: masterProd?.Category || 'OTHERS',
                          allowedUoms: allowed,
                          prices: pricesObj,
                          referencePrices: refPricesObj
                      };
                  }
                  
                  if (row.Price > 0) {
                      const cat = (masterProd?.Category || '').toUpperCase();
                      const isRestrictedCat = cat.includes('LOCAL') || cat.includes('THAI');

                      if (!(isRestrictedCat && row.UOM === 'PCS')) {
                          if (!prodMap[row.ProductCode].allowedUoms.includes(row.UOM)) {
                              prodMap[row.ProductCode].allowedUoms.push(row.UOM);
                          }
                          // Overwrite suggestions with the explicitly saved price
                          prodMap[row.ProductCode].prices[row.UOM] = row.Price;
                      }
                  }
              });

              setSelectedItems(Object.values(prodMap));
              alert(`Successfully retrieved the saved price list for ${selectedCustomer}.`);
          } else {
              alert(`No saved price list found for ${selectedCustomer}.`);
          }
      } catch (err) {
          console.error("Error loading saved prices:", err);
          alert("Error retrieving saved prices.");
      } finally {
          setIsSmartLoading(false);
      }
  };

  const handleSaveToDB = async () => {
      if (selectedItems.length === 0) return alert("The price list is empty.");

      setIsSavingDB(true);

      try {
          let companyNamesToUpdate = [];
          
          if (selectedCustomer === 'GENERAL') {
              companyNamesToUpdate = ['GENERAL'];
          } else {
              companyNamesToUpdate = Array.from(new Set(
                  allCustomers
                      .filter(c => (c.BrandName || c.CompanyName).toUpperCase().trim() === selectedCustomer)
                      .map(c => c.CompanyName)
              ));

              if (companyNamesToUpdate.length === 0) {
                  companyNamesToUpdate.push(selectedCustomer);
              }
          }

          await supabase.from('CustomerPrices').delete().in('CustomerName', companyNamesToUpdate);

          const rows = [];
          companyNamesToUpdate.forEach(cName => {
              selectedItems.forEach(item => {
                  Object.entries(item.prices).forEach(([uom, priceVal]) => {
                      if (priceVal !== '' && priceVal !== undefined) {
                          rows.push({
                              CustomerName: cName,
                              ProductCode: item.productCode,
                              ProductName: item.productName,
                              UOM: uom,
                              Price: Number(priceVal) || 0,
                              ValidUntil: validUntil,
                              EffectiveDate: effectiveDate, 
                              LoggedBy: currentUser
                          });
                      }
                  });
              });
          });

          if (rows.length === 0) {
              setIsSavingDB(false);
              return alert("No valid prices entered to save. Please enter at least one price.");
          }

          const { error } = await supabase.from('CustomerPrices').insert(rows);

          if (error) {
              alert("Database Error: " + error.message);
          } else {
              alert(`Success! Saved pricing for ${selectedCustomer} (Applies to ${companyNamesToUpdate.length} outlets). They will now auto-fill in orders!`);
          }
      } catch (error) {
          console.error("Save error:", error);
          alert("Failed to save to database.");
      } finally {
          setIsSavingDB(false);
      }
  };

  const formatDateLabel = (dateStr) => {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      return !isNaN(d) ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : dateStr;
  };

  const copyToWhatsApp = () => {
      if (selectedItems.length === 0) return alert("The list is empty.");

      const custName = selectedCustomer === 'GENERAL' ? 'Valued Customer' : selectedCustomer;
      
      let text = `*Fresher Farm Direct* Pricelist\n`;
      text += `For: *${custName}*\n`;
      text += `Effective: ${formatDateLabel(effectiveDate)} to ${formatDateLabel(validUntil)}\n\n`;

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

      sortedCategories.forEach(cat => {
          text += `📦 *${cat}*\n`;
          grouped[cat].sort((a, b) => a.productName.localeCompare(b.productName)).forEach(item => {
              const activeUoms = item.allowedUoms.filter(u => item.prices[u] !== '' && item.prices[u] !== undefined);
              if (activeUoms.length > 0) {
                  const uomStr = activeUoms.join(' / ');
                  const priceStr = activeUoms.map(u => `RM ${Number(item.prices[u]).toFixed(2)}`).join(' / ');
                  // Include Chinese name in WhatsApp if it exists
                  const displayTitle = item.chineseName ? `${item.productName} ${item.chineseName}` : item.productName;
                  text += `• ${displayTitle} (${uomStr}): ${priceStr}\n`;
              }
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

  // --- SORTING & FILTERS ---
  const sortedSelectedItems = useMemo(() => {
      return [...selectedItems].sort((a, b) => a.productName.localeCompare(b.productName));
  }, [selectedItems]);

  const displayedActiveItems = useMemo(() => {
      if (!activeSearchTerm) return sortedSelectedItems;
      const terms = activeSearchTerm.toLowerCase().split(' ').filter(Boolean);
      return sortedSelectedItems.filter(item => {
          const str = `${item.productName} ${item.productCode} ${item.chineseName || ''}`.toLowerCase();
          return terms.every(t => str.includes(t));
      });
  }, [sortedSelectedItems, activeSearchTerm]);

  const uniqueCategories = useMemo(() => {
      const cats = new Set(products.map(p => p.Category).filter(Boolean));
      return ['All', ...Array.from(cats).sort()];
  }, [products]);

  const filteredProducts = products.filter(p => {
      const matchesCategory = selectedCategory === 'All' || p.Category === selectedCategory;
      if (!searchTerm) return matchesCategory;
      
      const terms = searchTerm.toLowerCase().split(' ').filter(Boolean);
      // Allow searching by Chinese name as well
      const str = `${p.ProductName} ${p.ProductCode} ${p.ChineseName || ''}`.toLowerCase();
      return matchesCategory && terms.every(t => str.includes(t));
  });

  if (loading) return <div className="p-10 flex items-center justify-center h-screen text-gray-400 font-black tracking-widest animate-pulse uppercase">Loading Intelligence...</div>;

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
          @media print {
              nav, aside, footer { display: none !important; }
              div[class*="fixed bottom-0"], div[class*="fixed"][class*="bottom-0"] { display: none !important; }
              .md\\:hidden { display: none !important; }
          }
      `}} />

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
              <div className="xl:col-span-4 bg-white p-5 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col h-[500px] md:h-[600px] xl:h-[calc(100vh-140px)]">
                  
                  {/* Document Settings */}
                  <div className="mb-6 space-y-4 flex-none">
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

                      {/* Load Actions */}
                      <div className="flex gap-2 pt-2">
                          <button 
                              onClick={handleLoadSavedPrices}
                              disabled={isSmartLoading}
                              className="flex-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 font-black py-3 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest active:scale-95 disabled:opacity-50"
                          >
                              <CloudArrowDownIcon className={`w-4 h-4 ${isSmartLoading ? 'animate-bounce' : ''}`} /> 
                              Load Saved
                          </button>
                          
                          {selectedCustomer !== 'GENERAL' ? (
                              <button 
                                  onClick={handleSmartLoad}
                                  disabled={isSmartLoading}
                                  className="flex-1 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-black py-3 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest active:scale-95 disabled:opacity-50"
                              >
                                  <SparklesIcon className={`w-4 h-4 ${isSmartLoading ? 'animate-pulse' : ''}`} /> 
                                  Smart Guess
                              </button>
                          ) : (
                              <button 
                                  onClick={handleLoadRecent14Days}
                                  disabled={isSmartLoading}
                                  className="flex-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-black py-3 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest active:scale-95 disabled:opacity-50"
                              >
                                  <SparklesIcon className={`w-4 h-4 ${isSmartLoading ? 'animate-pulse' : ''}`} /> 
                                  Recent 14 Days
                              </button>
                          )}
                      </div>
                  </div>

                  {/* Catalog Search */}
                  <div className="flex-1 flex flex-col overflow-hidden pt-4 border-t border-gray-100">
                      <div className="flex justify-between items-center mb-3">
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Product Catalog</label>
                          <button onClick={handleAddAllProducts} className="text-[9px] font-black bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-1 rounded transition-colors uppercase">Add All Filtered</button>
                      </div>
                      
                      <div className="flex flex-col gap-2 mb-3 flex-none">
                          <select
                              className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer text-gray-700 uppercase"
                              value={selectedCategory}
                              onChange={e => setSelectedCategory(e.target.value)}
                          >
                              {uniqueCategories.map(c => (
                                  <option key={c} value={c}>{c}</option>
                              ))}
                          </select>
                          <div className="relative">
                              <span className="absolute left-3 top-3 text-gray-400"><MagnifyingGlassIcon className="w-4 h-4" /></span>
                              <input 
                                  type="text"
                                  placeholder="Search to add products..."
                                  className="w-full pl-9 p-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm"
                                  value={searchTerm}
                                  onChange={e => setSearchTerm(e.target.value)}
                              />
                          </div>
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
                                          <div className="font-bold text-xs uppercase leading-tight text-gray-800 group-hover:text-blue-700">
                                              {p.ProductName}
                                              {p.ChineseName && <span className="block font-medium text-[9px] text-gray-500 mt-0.5">{p.ChineseName}</span>}
                                          </div>
                                          <div className="text-[9px] font-mono text-gray-400 mt-1">{p.ProductCode}</div>
                                      </div>
                                      {!isAdded && <PlusIcon className="w-5 h-5 text-gray-300 group-hover:text-blue-500 transition-colors shrink-0" />}
                                      {isAdded && <CheckCircleIcon className="w-5 h-5 text-green-500 shrink-0" />}
                                  </div>
                              );
                          })}
                          {filteredProducts.length === 0 && (
                              <div className="text-center py-6 text-gray-400 italic text-xs font-bold">No products found.</div>
                          )}
                      </div>
                  </div>
              </div>

              {/* RIGHT: Active Pricelist Editor */}
              <div className="xl:col-span-8 bg-white p-5 md:p-6 rounded-[2rem] shadow-xl border border-gray-100 flex flex-col h-[600px] xl:h-[calc(100vh-140px)]">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-4 gap-4 flex-none">
                      <div>
                          <h2 className="text-lg md:text-xl font-black text-gray-800 uppercase tracking-tight flex items-center gap-2">
                              <DocumentTextIcon className="w-6 h-6 text-blue-600" /> Active Price List
                          </h2>
                          <p className="text-[10px] md:text-xs text-gray-500 font-bold uppercase mt-1">
                              {sortedSelectedItems.length} Products included
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

                  {/* Active List Search Bar */}
                  {sortedSelectedItems.length > 0 && (
                      <div className="relative mb-4 flex-none">
                          <span className="absolute left-3 top-3 text-gray-400"><MagnifyingGlassIcon className="w-4 h-4" /></span>
                          <input 
                              type="text"
                              placeholder="Search active price list..."
                              className="w-full pl-9 p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                              value={activeSearchTerm}
                              onChange={e => setActiveSearchTerm(e.target.value)}
                          />
                      </div>
                  )}

                  <div className="flex-1 overflow-auto custom-scrollbar border border-gray-100 rounded-3xl">
                      {sortedSelectedItems.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-gray-300 p-8 text-center">
                              <DocumentTextIcon className="w-16 h-16 mb-4 opacity-20" />
                              <p className="font-bold text-sm">Your price list is empty.</p>
                              <p className="text-xs mt-1 max-w-xs">Select a customer and load prices, or manually add products from the catalog on the left.</p>
                          </div>
                      ) : (
                          <table className="w-full text-left whitespace-nowrap min-w-[600px]">
                              <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest sticky top-0 z-10 shadow-sm border-b border-gray-100">
                                  <tr>
                                      <th className="p-4 pl-6">Product</th>
                                      <th className="p-4 text-right">Pricing Setup (RM)</th>
                                      <th className="p-4 text-center w-16 pr-6"></th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50 text-sm font-bold text-gray-700">
                                  {displayedActiveItems.map((item) => (
                                      <tr key={item.productCode} className="hover:bg-blue-50/30 transition-colors group/row">
                                          <td className="p-4 pl-6 align-middle max-w-[200px] md:max-w-[280px]">
                                              <div className="font-black text-gray-800 uppercase leading-tight whitespace-normal break-words">
                                                  {item.productName}
                                                  {item.chineseName && <span className="block font-medium text-[9px] text-gray-500 mt-1">{item.chineseName}</span>}
                                              </div>
                                              <div className="flex gap-2 items-center mt-1.5">
                                                  <span className="text-[9px] font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">{item.productCode}</span>
                                                  <span className="text-[8px] font-black text-blue-500 uppercase tracking-widest">{item.category}</span>
                                              </div>
                                          </td>
                                          <td className="p-3 align-middle">
                                              <div className="flex flex-wrap gap-3 justify-end">
                                                  {item.allowedUoms.map(uom => {
                                                      const refPrice = item.referencePrices?.[uom];
                                                      const currentPrice = item.prices[uom];
                                                      const hasValue = currentPrice !== '' && currentPrice !== undefined && currentPrice !== null;
                                                      return (
                                                      <div key={uom} className="flex flex-col gap-1 bg-blue-50/50 border border-blue-100 rounded-xl p-2 shadow-sm w-[130px] md:w-[150px]">
                                                          <div className="flex items-center gap-2">
                                                              <span className="text-[10px] font-black text-blue-800 w-10 text-center uppercase tracking-widest">{uom}</span>
                                                              <input 
                                                                  type="number" 
                                                                  step="0.01" 
                                                                  className="w-full p-1.5 bg-white border border-blue-200 rounded-lg text-right font-black text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder-gray-300"
                                                                  placeholder="TBA"
                                                                  value={currentPrice || ''}
                                                                  onChange={(e) => handleUpdatePrice(item.productCode, uom, e.target.value)}
                                                              />
                                                          </div>
                                                          {refPrice && (
                                                              <div className={`text-[9px] font-bold text-right pr-1 ${hasValue ? 'text-gray-400' : 'text-red-500'}`}>
                                                                  Ref: RM {refPrice}
                                                              </div>
                                                          )}
                                                      </div>
                                                  )})}
                                              </div>
                                          </td>
                                          <td className="p-3 text-center pr-6 align-middle">
                                              <button onClick={() => handleRemoveItem(item.productCode)} className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                                  <TrashIcon className="w-5 h-5" />
                                              </button>
                                          </td>
                                      </tr>
                                  ))}
                                  {displayedActiveItems.length === 0 && (
                                      <tr>
                                          <td colSpan="3" className="p-8 text-center text-gray-400 italic text-xs font-bold">
                                              No matching products in active list.
                                          </td>
                                      </tr>
                                  )}
                              </tbody>
                          </table>
                      )}
                  </div>
              </div>
          </div>
      </div>

      <PrintLayout 
          selectedCustomer={selectedCustomer}
          effectiveDate={effectiveDate}
          validUntil={validUntil}
          selectedItems={sortedSelectedItems}
      />
    </>
  );
}