'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { 
  ClipboardDocumentCheckIcon, 
  ExclamationTriangleIcon, 
  CheckCircleIcon,
  TrashIcon,
  PlusIcon
} from '@heroicons/react/24/outline';

const KNOWN_UOMS = ['KG', 'CTN', 'PCS', 'PKT', 'BKL', 'BOX', 'G', 'TRAY', 'BUNCH', 'BAG', 'ROLL'];

// Custom Searchable Dropdown Component
function SearchableProductSelect({ item, products, onUpdate }) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');

    const selectedProduct = products.find(p => p.ProductCode === item.productCode);
    const displayName = selectedProduct ? selectedProduct.ProductName : '-- UNMATCHED --';

    const filteredProducts = products.filter(p => {
        if (!search) return true;
        const term = search.toLowerCase();
        return p.ProductName.toLowerCase().includes(term) || p.ProductCode.toLowerCase().includes(term);
    });

    return (
        <div className="relative w-full">
            <div 
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full text-[10px] md:text-xs font-bold p-2.5 rounded-lg border cursor-pointer flex justify-between items-center ${!item.productCode ? 'border-red-300 bg-red-50 text-red-700' : 'border-gray-200 bg-white text-gray-800'}`}
            >
                <span className="truncate pr-5">{displayName}</span>
                <span className="text-gray-400 text-[10px] shrink-0 ml-1">▼</span>
            </div>
            
            {/* Status Icons */}
            {!item.productCode && !isOpen && <ExclamationTriangleIcon className="w-3 h-3 text-red-500 absolute right-6 top-3 pointer-events-none" />}
            {item.productCode && !isOpen && <CheckCircleIcon className="w-3 h-3 text-green-500 absolute right-6 top-3 pointer-events-none" />}

            {/* Dropdown Menu */}
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: '250px', minWidth: '220px' }}>
                        <div className="p-2 border-b border-gray-100 bg-gray-50 sticky top-0">
                            <input 
                                type="text"
                                autoFocus
                                placeholder="Search product..."
                                className="w-full p-2 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                        <div className="overflow-y-auto flex-1 custom-scrollbar">
                            <div 
                                className="p-3 hover:bg-red-50 cursor-pointer text-xs font-bold text-red-500 border-b border-gray-50"
                                onClick={() => {
                                    onUpdate('');
                                    setIsOpen(false);
                                    setSearch('');
                                }}
                            >
                                -- CLEAR MATCH --
                            </div>
                            {filteredProducts.map(p => (
                                <div 
                                    key={p.ProductCode}
                                    className="p-3 hover:bg-blue-50 cursor-pointer text-xs font-bold text-gray-700 border-b border-gray-50 last:border-0"
                                    onClick={() => {
                                        onUpdate(p.ProductCode);
                                        setIsOpen(false);
                                        setSearch('');
                                    }}
                                >
                                    {p.ProductName}
                                </div>
                            ))}
                            {filteredProducts.length === 0 && (
                                <div className="p-4 text-center text-xs text-gray-400 italic">No products found</div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

export default function QuickPastePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [currentUser, setCurrentUser] = useState('');

  // Paste State
  const [rawText, setRawText] = useState('');
  
  // Parsed State
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [parsedItems, setParsedItems] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load Initial Data
  useEffect(() => {
    async function loadData() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }
      setCurrentUser(session.user.email?.split('@')[0].toUpperCase() || 'STAFF');

      const [custRes, prodRes] = await Promise.all([
        supabase.from('Customers').select('*'),
        supabase.from('ProductMaster').select('*')
      ]);

      setCustomers(custRes.data || []);
      setProducts(prodRes.data || []);
      setLoading(false);
      
      // Set Default Date Logic
      setDeliveryDate(calculateDefaultDate());
    }
    loadData();
  }, [router]);

  // Date Logic: 10am-6pm (Next Day), 6.01pm-9.59am (Same Day)
  const calculateDefaultDate = () => {
      const now = new Date();
      const hour = now.getHours();
      const targetDate = new Date(now);
      
      if (hour >= 10 && hour < 18) {
          targetDate.setDate(targetDate.getDate() + 1);
      } else if (hour >= 18) {
          targetDate.setDate(targetDate.getDate() + 1); 
      }
      
      return targetDate.toISOString().split('T')[0];
  };

  // Robust Customer Matching using Tokens
  const findBestCustomerMatch = (firstLine, customersList) => {
      const cleanLine = firstLine.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
      const lineTokens = cleanLine.split(' ').filter(t => t.length > 1);

      let bestMatch = null;
      let highestScore = 0;

      customersList.forEach(c => {
          let score = 0;
          const compName = c.CompanyName.toLowerCase();
          const branchName = (c.Branch || '').toLowerCase();
          const fullStr = `${compName} ${branchName}`.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
          const dbTokens = fullStr.split(' ').filter(t => t.length > 1);

          if (fullStr === cleanLine) {
              score = 100;
          } else if (fullStr.includes(cleanLine) || cleanLine.includes(fullStr)) {
              score = 80;
          } else {
              // Calculate overlap
              let matches = 0;
              lineTokens.forEach(t => {
                  if (dbTokens.some(dt => dt.includes(t) || t.includes(dt))) matches++;
              });
              if (lineTokens.length > 0) {
                  score = (matches / lineTokens.length) * 60;
              }
              // Branch specific boost
              if (branchName) {
                  const bTokens = branchName.replace(/[^\w\s]/g, ' ').split(' ').filter(t => t.length > 1);
                  let bMatches = 0;
                  lineTokens.forEach(t => {
                      if (bTokens.some(dt => dt.includes(t) || t.includes(dt))) bMatches++;
                  });
                  if (bTokens.length > 0 && bMatches > 0) {
                      score += (bMatches / bTokens.length) * 30; 
                  }
              }
          }

          if (score > highestScore) {
              highestScore = score;
              bestMatch = c;
          }
      });

      return highestScore >= 30 ? bestMatch : null;
  };

  // The Magic Parsing Function
  const handleParse = async () => {
      if (!rawText.trim()) return;

      const lines = rawText.split('\n').map(l => l.trim()).filter(l => l !== '');
      if (lines.length === 0) return;

      let startIndex = 0;
      let matchedCust = null;
      let customerHistoryCodes = new Set();

      // 1. Detect Customer
      const firstLine = lines[0];
      matchedCust = findBestCustomerMatch(firstLine, customers);

      if (matchedCust) {
          setSelectedCustomer(matchedCust.id.toString());
          startIndex = 1; 
          
          // Fetch history using a safe partial match on the base company name to ensure hits
          const safeSearchName = matchedCust.CompanyName.split(' ')[0].replace(/[^\w\s]/g, '');
          const { data: hist } = await supabase
              .from('Orders')
              .select('"Product Code"')
              .ilike('Customer Name', `%${safeSearchName}%`)
              .order('Timestamp', { ascending: false })
              .limit(200);
              
          if (hist) {
              hist.forEach(h => customerHistoryCodes.add(h["Product Code"]));
          }
      } else {
          setSelectedCustomer(''); 
          // Check if first line is a product (starts with bullet or digit)
          if (/^[-*•\s]*\d+/.test(firstLine)) {
              startIndex = 0; 
          } else {
              startIndex = 1; 
          }
      }

      // Regex patterns
      const uomPattern = KNOWN_UOMS.join('|');
      const qtyUomRegex = new RegExp(`(?:^|\\s|-|x|X)\\s*([\\d.]+)\\s*(${uomPattern})\\b(.*)$`, 'i');

      // 2. Parse Items
      const newItems = [];
      for (let i = startIndex; i < lines.length; i++) {
          const line = lines[i];
          
          // --- DATE EXTRACTION (Check if line is a Date) ---
          // Matches 24/2/2026, 24-02-26, 24.2.2026
          const dateMatch = line.match(/^\s*(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\s*$/);
          if (dateMatch) {
              let [_, day, month, year] = dateMatch;
              if (year.length === 2) year = '20' + year; 
              const parsedDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
              if (!isNaN(parsedDate)) {
                  setDeliveryDate(parsedDate.toISOString().split('T')[0]);
                  continue; // Skip processing this line as a product
              }
          }
          
          // Strip leading bullets/numbers
          let cleanLine = line.replace(/^[-*•\s]+|^\d+\.\s+/, '').trim();
          
          // Extract trailing bracket notes (e.g., "(setengah masak)")
          let bracketNote = '';
          const bracketMatch = cleanLine.match(/\((.*?)\)$/);
          if (bracketMatch) {
              bracketNote = ` (${bracketMatch[1]})`;
              cleanLine = cleanLine.replace(/\(.*?\)$/, '').trim();
          }
          
          let qty = 1;
          let uom = '';
          let price = 0;
          let rawName = cleanLine;

          // Attempt to extract Qty and UOM, dealing with 'x' prefix gracefully
          const match = rawName.match(qtyUomRegex);
          if (match) {
              qty = parseFloat(match[1]);
              uom = match[2].toUpperCase();
              
              const beforeText = rawName.substring(0, match.index).trim();
              const afterText = match[3].trim();
              
              if (beforeText === '') {
                  // Qty/UOM was at the start (e.g., "1kg Apple")
                  rawName = afterText;
              } else {
                  // Qty/UOM was in the middle or end
                  if (afterText) {
                      // Explicit Price Check (Strict: Requires RM or Decimal)
                      const priceMatch = afterText.match(/^(?:(?:RM|rm)\s*([\d.]+)|(\d+\.\d{1,2}))$/i);
                      if (priceMatch) {
                          price = parseFloat(priceMatch[1] || priceMatch[2]);
                      } else {
                          rawName = beforeText + ' ' + afterText;
                      }
                  } else {
                      rawName = beforeText;
                  }
              }
          } else {
              // Fallback: Multiplier at the end without UOM (e.g., "x5" or "x 5")
              const qtyOnlyRegex = /(?:\s|-|x|X)\s*([\d.]+)\s*$/i;
              const qtyMatch = rawName.match(qtyOnlyRegex);
              if (qtyMatch) {
                  qty = parseFloat(qtyMatch[1]);
                  rawName = rawName.substring(0, qtyMatch.index).trim();
              }
          }

          // Price Fallback: Look for standalone numbers at the end of the string
          // Strictly requires RM/rm prefix OR a decimal point (e.g., 8.5, 12.00) 
          // Prevents parsing size attributes like "56" or "10A" as prices
          if (price === 0) {
              const priceRegex = /\s+(?:(?:RM|rm)\s*([\d.]+)|(\d+\.\d{1,2}))\s*$/i;
              const pMatch = rawName.match(priceRegex);
              if (pMatch) {
                  price = parseFloat(pMatch[1] || pMatch[2]);
                  rawName = rawName.substring(0, pMatch.index).trim();
              }
          }

          // Clean up dangling dashes
          rawName = rawName.replace(/^[-:]+\s*/, '').replace(/\s*[-:]+$/, '').trim();

          // 3. Robust Fuzzy Match Product
          const bestProduct = findBestProductMatch(rawName + bracketNote, customerHistoryCodes);

          let finalUom = uom;
          if (!finalUom && bestProduct) finalUom = bestProduct.BaseUOM;
          if (!finalUom) finalUom = 'KG'; 

          newItems.push({
              id: Date.now() + i,
              rawLine: line,
              qty: qty,
              uom: finalUom,
              price: price, // Extracted price
              productCode: bestProduct ? bestProduct.ProductCode : '',
          });
      }

      setParsedItems(newItems);
  };

  // Improved Token-based similarity scorer
  const findBestProductMatch = (rawName, historyCodesSet) => {
      // Remove text in parentheses for matching
      const nameForMatching = rawName.replace(/\(.*?\)/g, '').trim().toLowerCase();
      if (!nameForMatching) return null;

      let bestMatch = null;
      let highestScore = 0;

      const rawWords = nameForMatching.split(/[\s-]+/).filter(w => w.length > 0);
      const totalRawLength = rawWords.join('').length;

      products.forEach(p => {
          const lowerProd = p.ProductName.toLowerCase();
          let score = 0;

          if (lowerProd === nameForMatching) {
              score = 100;
          } else {
              let matchedWordsLength = 0;
              const prodWords = lowerProd.split(/[\s-]+/);

              rawWords.forEach(rw => {
                  // Exact word match
                  if (prodWords.includes(rw)) {
                      matchedWordsLength += rw.length;
                  } 
                  // Partial match for substantial words
                  else if (rw.length > 3 && prodWords.some(pw => pw.includes(rw) || rw.includes(pw))) {
                      matchedWordsLength += rw.length * 0.8;
                  }
              });

              if (totalRawLength > 0) {
                  score = (matchedWordsLength / totalRawLength) * 60;
              }
          }

          // History boost - Massive boost if they ordered it before
          if (score >= 20 && historyCodesSet.has(p.ProductCode)) {
              score += 40; 
          }

          if (score > highestScore) {
              highestScore = score;
              bestMatch = p;
          }
      });

      return highestScore >= 25 ? bestMatch : null;
  };

  // Item List Handlers
  const updateItem = (id, field, value) => {
      setParsedItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
      
      // Auto-update UOM if product changes
      if (field === 'productCode') {
          const prod = products.find(p => p.ProductCode === value);
          if (prod) {
              setParsedItems(prev => prev.map(item => item.id === id ? { ...item, uom: prod.BaseUOM } : item));
          }
      }
  };

  const removeItem = (id) => {
      setParsedItems(prev => prev.filter(item => item.id !== id));
  };

  const addNewBlankItem = () => {
      setParsedItems(prev => [...prev, { id: Date.now(), rawLine: 'Manual Entry', qty: 1, uom: 'KG', price: 0, productCode: '' }]);
  };

  // Submit Order
  const handleSubmit = async () => {
      if (!selectedCustomer) return alert("Please select a customer.");
      if (!deliveryDate) return alert("Please select a delivery date.");
      if (parsedItems.length === 0) return alert("No items to order.");

      const unmatched = parsedItems.find(i => !i.productCode);
      if (unmatched) {
          const proceed = confirm("Some items are missing a selected product. Do you want to remove them and proceed?");
          if (!proceed) return;
      }

      setIsSubmitting(true);
      const validItems = parsedItems.filter(i => i.productCode);

      const cust = customers.find(c => c.id.toString() === selectedCustomer);
      const customerNameString = cust.Branch ? `${cust.CompanyName} - ${cust.Branch}`.toUpperCase() : cust.CompanyName.toUpperCase();

      const dateStr = deliveryDate.replaceAll('-', '').slice(2);
      const doNumber = `DO-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;

      const orderRows = validItems.map(item => {
          const prod = products.find(p => p.ProductCode === item.productCode);
          return {
              "Timestamp": new Date(),
              "Status": "Pending",
              "DONumber": doNumber,
              "Delivery Date": deliveryDate,
              "Customer Name": customerNameString,
              "Delivery Address": cust.DeliveryAddress,
              "Contact Person": cust.ContactPerson || '',
              "Contact Number": cust.ContactNumber || '',
              "Product Code": item.productCode,
              "Order Items": prod.ProductName,
              "Quantity": item.qty,
              "UOM": item.uom,
              "Price": item.price || 0, // Injects parsed price
              "LoggedBy": currentUser,
              "SpecialNotes": `Pasted: ${item.rawLine}`
          };
      });

      const { error } = await supabase.from('Orders').insert(orderRows);

      if (error) {
          alert("Error saving order: " + error.message);
      } else {
          alert(`Order successfully created! DO: ${doNumber}`);
          router.push('/orders/list');
      }
      setIsSubmitting(false);
  };

  if (loading) return <div className="p-10 text-center text-gray-500 font-bold">Loading Engine...</div>;

  return (
    <div className="p-3 md:p-6 max-w-full overflow-x-hidden pt-16 md:pt-6">
      
      <div className="mb-6">
         <h1 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight">Quick Paste Order</h1>
         <p className="text-[10px] md:text-xs text-gray-400 font-bold uppercase mt-1">Seamlessly convert text to orders</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT: Paste Area */}
          <div className="lg:col-span-4 bg-white p-5 rounded-3xl shadow-sm border border-gray-100 flex flex-col h-[calc(100vh-140px)]">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 block flex-none">
                  Paste Message Here
              </label>
              <textarea 
                  className="w-full flex-1 border border-gray-200 bg-gray-50 rounded-2xl p-4 text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-all placeholder-gray-300"
                  placeholder={`Example:\nHEYTEA GENTING\n2CTN MANGO GOLD SUSU\n5PCS avocado`}
                  value={rawText}
                  onChange={e => setRawText(e.target.value)}
              />
              <button 
                  onClick={handleParse}
                  className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg active:scale-95 flex items-center justify-center gap-2 transition flex-none"
              >
                  <ClipboardDocumentCheckIcon className="w-5 h-5" /> Auto-Parse Order
              </button>
          </div>

          {/* RIGHT: Validation & Review */}
          <div className="lg:col-span-8 bg-white p-5 md:p-6 rounded-3xl shadow-xl border border-gray-100 flex flex-col h-[calc(100vh-140px)] relative">
              
              {/* Review Header */}
              <div className="flex flex-col md:flex-row gap-4 mb-6 flex-none">
                  <div className="flex-1">
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Detected Outlet / Customer</label>
                      <select 
                          className={`w-full border p-3 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 ${!selectedCustomer ? 'border-red-300 bg-red-50 text-red-700' : 'border-gray-200 bg-gray-50 text-gray-800'}`}
                          value={selectedCustomer}
                          onChange={e => setSelectedCustomer(e.target.value)}
                      >
                          <option value="">-- SELECT CUSTOMER --</option>
                          {customers.map(c => (
                              <option key={c.id} value={c.id}>
                                  {c.Branch ? `${c.CompanyName} - ${c.Branch}` : c.CompanyName}
                              </option>
                          ))}
                      </select>
                  </div>
                  <div className="w-full md:w-48">
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Delivery Date</label>
                      <input 
                          type="date"
                          className="w-full border border-gray-200 bg-gray-50 p-3 rounded-xl text-sm font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={deliveryDate}
                          onChange={e => setDeliveryDate(e.target.value)}
                      />
                  </div>
              </div>

              {/* Items Table */}
              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
                  {parsedItems.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-gray-300 border-2 border-dashed border-gray-100 rounded-2xl">
                          <ClipboardDocumentCheckIcon className="w-16 h-16 mb-4 opacity-20" />
                          <p className="font-bold text-sm">Paste text and click Parse</p>
                      </div>
                  ) : (
                      <>
                        <div className="hidden md:grid grid-cols-12 gap-2 px-2 pb-2 border-b border-gray-100 text-[9px] font-black text-gray-400 uppercase tracking-wider">
                            <div className="col-span-3">Original Text</div>
                            <div className="col-span-3">Matched Product</div>
                            <div className="col-span-2 text-center">Qty</div>
                            <div className="col-span-2 text-center">UOM</div>
                            <div className="col-span-1 text-center">Price</div>
                            <div className="col-span-1 text-right"></div>
                        </div>

                        {parsedItems.map((item, index) => (
                            <div key={item.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center bg-white p-3 rounded-xl border border-gray-200 shadow-sm hover:border-blue-300 transition">
                                {/* Raw Text Reference */}
                                <div className="md:col-span-3 text-[10px] text-gray-500 italic truncate" title={item.rawLine}>
                                    "{item.rawLine}"
                                </div>
                                
                                {/* Product Select - USING NEW SEARCHABLE COMPONENT */}
                                <div className="md:col-span-3">
                                    <SearchableProductSelect 
                                        item={item} 
                                        products={products} 
                                        onUpdate={(code) => updateItem(item.id, 'productCode', code)} 
                                    />
                                </div>

                                {/* Qty */}
                                <div className="md:col-span-2 flex items-center gap-1">
                                    <span className="md:hidden text-[9px] font-bold text-gray-400">QTY:</span>
                                    <input 
                                        type="number" 
                                        step="0.1"
                                        className="w-full p-2.5 border border-gray-200 rounded-lg text-xs font-black text-center focus:ring-2 focus:ring-blue-500"
                                        value={item.qty}
                                        onChange={e => updateItem(item.id, 'qty', e.target.value)}
                                    />
                                </div>

                                {/* UOM */}
                                <div className="md:col-span-2 flex items-center gap-1">
                                    <span className="md:hidden text-[9px] font-bold text-gray-400">UOM:</span>
                                    <select 
                                        className="w-full p-2.5 border border-gray-200 rounded-lg text-xs font-bold uppercase focus:ring-2 focus:ring-blue-500"
                                        value={item.uom}
                                        onChange={e => updateItem(item.id, 'uom', e.target.value)}
                                    >
                                        <option value="KG">KG</option>
                                        <option value="CTN">CTN</option>
                                        <option value="PCS">PCS</option>
                                        <option value="PKT">PKT</option>
                                        <option value="BKL">BKL</option>
                                        <option value="BOX">BOX</option>
                                        <option value="G">G</option>
                                        <option value="TRAY">TRAY</option>
                                    </select>
                                </div>

                                {/* Price */}
                                <div className="md:col-span-1 flex items-center gap-1">
                                    <span className="md:hidden text-[9px] font-bold text-gray-400">PRICE:</span>
                                    <input 
                                        type="number" 
                                        step="0.01"
                                        className="w-full p-2.5 border border-gray-200 rounded-lg text-[10px] md:text-xs font-black text-center focus:ring-2 focus:ring-blue-500"
                                        value={item.price}
                                        onChange={e => updateItem(item.id, 'price', e.target.value)}
                                    />
                                </div>

                                {/* Delete */}
                                <div className="md:col-span-1 text-right">
                                    <button onClick={() => removeItem(item.id)} className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
                                        <TrashIcon className="w-5 h-5 inline" />
                                    </button>
                                </div>
                            </div>
                        ))}
                        
                        <button 
                            onClick={addNewBlankItem}
                            className="w-full py-3 border-2 border-dashed border-gray-200 text-gray-400 font-bold rounded-xl hover:border-blue-400 hover:text-blue-500 transition flex items-center justify-center gap-2 text-xs"
                        >
                            <PlusIcon className="w-4 h-4" /> Add Item Manually
                        </button>
                      </>
                  )}
              </div>

              {/* Action Bar */}
              <div className="mt-4 pt-4 border-t border-gray-100 flex-none flex justify-between items-center">
                  <div className="text-xs font-bold text-gray-500">
                      Total Valid Items: <span className="text-gray-800 text-sm ml-1">{parsedItems.filter(i => i.productCode).length}</span>
                  </div>
                  <button 
                      onClick={handleSubmit}
                      disabled={isSubmitting || parsedItems.length === 0}
                      className={`py-3 px-8 rounded-xl font-black text-sm text-white shadow-lg transition active:scale-95 ${
                          isSubmitting || parsedItems.length === 0 ? 'bg-gray-300 cursor-not-allowed shadow-none' : 'bg-green-600 hover:bg-green-700'
                      }`}
                  >
                      {isSubmitting ? 'Logging...' : 'Confirm & Log Order'}
                  </button>
              </div>

          </div>

      </div>
    </div>
  );
}