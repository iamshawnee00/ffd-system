'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { 
  ClipboardDocumentCheckIcon, 
  ExclamationTriangleIcon, 
  CheckCircleIcon,
  TrashIcon,
  PlusIcon,
  CurrencyDollarIcon,
  MagnifyingGlassIcon,
  ScaleIcon
} from '@heroicons/react/24/outline';

const KNOWN_UOMS = ['KG', 'CTN', 'PCS', 'PKT', 'BKL', 'BOX', 'G', 'TRAY', 'BUNCH', 'BAG', 'ROLL'];

// Custom Searchable Customer Dropdown Component
function SearchableCustomerSelect({ selectedCustomerId, customers, onSelect }) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');

    const selectedCustomer = customers.find(c => c.id.toString() === selectedCustomerId);
    const displayName = selectedCustomer 
        ? (selectedCustomer.Branch ? `${selectedCustomer.CompanyName} - ${selectedCustomer.Branch}` : selectedCustomer.CompanyName)
        : '-- SELECT CUSTOMER --';

    const filteredCustomers = customers.filter(c => {
        if (!search) return true;
        const term = search.toLowerCase();
        const fullName = `${c.CompanyName} ${c.Branch || ''}`.toLowerCase();
        return fullName.includes(term);
    });

    return (
        <div className="relative w-full">
            <div 
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full border p-3 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer flex justify-between items-center ${!selectedCustomerId ? 'border-red-300 bg-red-50 text-red-700' : 'border-gray-200 bg-gray-50 text-gray-800'}`}
            >
                <span className="truncate pr-5">{displayName}</span>
                <span className="text-gray-400 text-xs shrink-0 ml-1">▼</span>
            </div>
            
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: '350px' }}>
                        <div className="p-2 border-b border-gray-100 bg-gray-50 sticky top-0">
                            <input 
                                type="text"
                                autoFocus
                                placeholder="Search customer or branch..."
                                className="w-full p-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                        <div className="overflow-y-auto flex-1 custom-scrollbar">
                            <div 
                                className="p-3 hover:bg-red-50 cursor-pointer text-sm font-bold text-red-500 border-b border-gray-50"
                                onClick={() => {
                                    onSelect('');
                                    setIsOpen(false);
                                    setSearch('');
                                }}
                            >
                                -- CLEAR SELECTION --
                            </div>
                            {filteredCustomers.map(c => (
                                <div 
                                    key={c.id}
                                    className="p-3 hover:bg-blue-50 cursor-pointer text-sm font-bold text-gray-700 border-b border-gray-50 last:border-0"
                                    onClick={() => {
                                        onSelect(c.id.toString());
                                        setIsOpen(false);
                                        setSearch('');
                                    }}
                                >
                                    {c.Branch ? `${c.CompanyName} - ${c.Branch}` : c.CompanyName}
                                </div>
                            ))}
                            {filteredCustomers.length === 0 && (
                                <div className="p-4 text-center text-sm text-gray-400 italic">No customers found</div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

// Custom Searchable Product Dropdown Component
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
  const [activeTab, setActiveTab] = useState('orders'); // 'orders', 'prices', 'compare'
  
  // Base Data
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [currentUser, setCurrentUser] = useState('');

  // Order Paste State
  const [orderRawText, setOrderRawText] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryMode, setDeliveryMode] = useState('Driver');
  const [parsedOrderItems, setParsedOrderItems] = useState([]);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

  // Price Paste State
  const [priceRawText, setPriceRawText] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [priceDate, setPriceDate] = useState('');
  const [parsedPriceItems, setParsedPriceItems] = useState([]);
  const [isSubmittingPrice, setIsSubmittingPrice] = useState(false);

  // Price Compare State
  const [compareSearchText, setCompareSearchText] = useState('');
  const [compareResults, setCompareResults] = useState([]);
  const [isComparing, setIsComparing] = useState(false);

  // Load Initial Data
  useEffect(() => {
    async function loadData() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }
      setCurrentUser(session.user.email?.split('@')[0].toUpperCase() || 'STAFF');

      const [custRes, prodRes, suppRes] = await Promise.all([
        supabase.from('Customers').select('*'),
        supabase.from('ProductMaster').select('*'),
        supabase.from('Suppliers').select('SupplierName').order('SupplierName')
      ]);

      setCustomers(custRes.data || []);
      setProducts(prodRes.data || []);
      setSuppliers(suppRes.data || []);
      setLoading(false);
      
      const defaultDate = calculateDefaultDate();
      setDeliveryDate(defaultDate);
      setPriceDate(new Date().toISOString().split('T')[0]); 
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

  // Token-based Customer Matching
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
              let matches = 0;
              lineTokens.forEach(t => {
                  if (dbTokens.some(dt => dt.includes(t) || t.includes(dt))) matches++;
              });
              if (lineTokens.length > 0) {
                  score = (matches / lineTokens.length) * 60;
              }
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

  // Token-based Product Matching
  const findBestProductMatch = (rawName, historyCodesSet = new Set()) => {
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
                  if (prodWords.includes(rw)) {
                      matchedWordsLength += rw.length;
                  } 
                  else if (rw.length > 2 && prodWords.some(pw => pw.includes(rw) || rw.includes(pw))) {
                      matchedWordsLength += rw.length * 0.8;
                  }
              });

              if (totalRawLength > 0) {
                  score = (matchedWordsLength / totalRawLength) * 60;
              }
          }

          // Order History Boost
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

  // ==========================================
  // 1. ORDER PARSING LOGIC
  // ==========================================
  const handleParseOrder = async () => {
      if (!orderRawText.trim()) return;

      const lines = orderRawText.split('\n').map(l => l.trim()).filter(l => l !== '');
      if (lines.length === 0) return;

      let startIndex = 0;
      let matchedCust = null;
      let customerHistoryCodes = new Set();

      const firstLine = lines[0];
      matchedCust = findBestCustomerMatch(firstLine, customers);

      if (matchedCust) {
          setSelectedCustomer(matchedCust.id.toString());
          startIndex = 1; 
          
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
          if (/^[-*•\s]*\d+/.test(firstLine)) {
              startIndex = 0; 
          } else {
              startIndex = 1; 
          }
      }

      const uomPattern = KNOWN_UOMS.join('|');
      const qtyUomRegex = new RegExp(`(?:^|\\s|-|x|X)\\s*([\\d.]+)\\s*(${uomPattern})\\b(.*)$`, 'i');

      const newItems = [];
      for (let i = startIndex; i < lines.length; i++) {
          const line = lines[i];
          
          // Date Extraction
          const dateMatch = line.match(/^\s*(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{2,4}))?\s*$/);
          if (dateMatch) {
              let [_, day, month, year] = dateMatch;
              if (!year) year = new Date().getFullYear().toString();
              else if (year.length === 2) year = '20' + year; 
              
              const parsedDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
              if (!isNaN(parsedDate)) {
                  setDeliveryDate(parsedDate.toISOString().split('T')[0]);
                  continue; 
              }
          }
          
          let cleanLine = line.replace(/^[-*•\s]+|^\d+\.\s+/, '').trim();
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

          const match = rawName.match(qtyUomRegex);
          if (match) {
              qty = parseFloat(match[1]);
              uom = match[2].toUpperCase();
              
              const beforeText = rawName.substring(0, match.index).trim();
              const afterText = match[3].trim();
              
              if (beforeText === '') {
                  rawName = afterText;
              } else {
                  if (afterText) {
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
              const qtyOnlyRegex = /(?:\s|-|x|X)\s*([\d.]+)\s*$/i;
              const qtyMatch = rawName.match(qtyOnlyRegex);
              if (qtyMatch) {
                  qty = parseFloat(qtyMatch[1]);
                  rawName = rawName.substring(0, qtyMatch.index).trim();
              }
          }

          if (price === 0) {
              const priceRegex = /\s+(?:(?:RM|rm)\s*([\d.]+)|(\d+\.\d{1,2}))\s*$/i;
              const pMatch = rawName.match(priceRegex);
              if (pMatch) {
                  price = parseFloat(pMatch[1] || pMatch[2]);
                  rawName = rawName.substring(0, pMatch.index).trim();
              }
          }

          rawName = rawName.replace(/^[-:]+\s*/, '').replace(/\s*[-:]+$/, '').trim();
          const bestProduct = findBestProductMatch(rawName + bracketNote, customerHistoryCodes);

          let finalUom = uom;
          if (!finalUom && bestProduct) finalUom = bestProduct.BaseUOM;
          if (!finalUom) finalUom = 'KG'; 

          newItems.push({
              id: Date.now() + i,
              rawLine: line,
              qty: qty,
              uom: finalUom,
              price: price, 
              productCode: bestProduct ? bestProduct.ProductCode : '',
          });
      }

      setParsedOrderItems(newItems);
  };

  // ==========================================
  // 2. SUPPLIER PRICE PARSING
  // ==========================================
  const handleParsePrice = () => {
      if (!priceRawText.trim()) return;

      const lines = priceRawText.split('\n').map(l => l.trim()).filter(l => l !== '');
      const newItems = [];
      const uomPattern = KNOWN_UOMS.join('|');
      // Match formats like: "12kg", "80gx50pkt", "200g x 20pkt"
      const uomRegex = new RegExp(`(\\d+(?:\\.\\d+)?\\s*(?:${uomPattern})(?:\\s*[xX\\*]\\s*\\d+\\s*[a-zA-Z]+)?)`, 'i');

      lines.forEach((line, i) => {
          // Skip headers
          if (line.startsWith('*') || line.toLowerCase().includes('price:')) return;

          const match = line.match(uomRegex);
          if (match) {
              const uomStr = match[1];
              const namePart = line.substring(0, match.index).trim();
              const afterPart = line.substring(match.index + uomStr.length).trim();

              // Find price after UOM
              const priceMatch = afterPart.match(/(\d+(?:\.\d+)?)/);
              if (priceMatch) {
                  const price = parseFloat(priceMatch[1]);
                  // Clean product name
                  const cleanName = namePart.replace(/[^\w\s\u4e00-\u9fa5]/g, '').trim();

                  // Basic match, no history boost
                  const bestProduct = findBestProductMatch(cleanName);

                  // Only add matched products with price > 0
                  if (bestProduct && price > 0) {
                      newItems.push({
                          id: Date.now() + i,
                          rawLine: line,
                          productCode: bestProduct.ProductCode,
                          productName: bestProduct.ProductName, 
                          uom: uomStr,
                          price: price
                      });
                  }
              }
          }
      });

      setParsedPriceItems(newItems);
  };

  // ==========================================
  // 3. PRICE COMPARISON SEARCH
  // ==========================================
  const handleCompareSearch = async (productCode) => {
      if (!productCode) return;
      setIsComparing(true);
      const { data, error } = await supabase
          .from('Purchase')
          .select('Supplier, CostPrice, PurchaseUOM, Timestamp, InvoiceNumber')
          .eq('ProductCode', productCode)
          .order('Timestamp', { ascending: false })
          .limit(30);
          
      if (!error && data) {
          setCompareResults(data);
      }
      setIsComparing(false);
  };

  // ==========================================
  // DATABASE SUBMISSIONS
  // ==========================================
  const handleSubmitOrder = async () => {
      if (!selectedCustomer) return alert("Please select a customer.");
      if (!deliveryDate) return alert("Please select a delivery date.");
      if (parsedOrderItems.length === 0) return alert("No items to order.");

      const unmatched = parsedOrderItems.find(i => !i.productCode);
      if (unmatched) {
          const proceed = confirm("Some items are missing a selected product. Do you want to remove them and proceed?");
          if (!proceed) return;
      }

      setIsSubmittingOrder(true);
      const validItems = parsedOrderItems.filter(i => i.productCode);

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
              "Delivery Mode": deliveryMode, 
              "Customer Name": customerNameString,
              "Delivery Address": cust.DeliveryAddress,
              "Contact Person": cust.ContactPerson || '',
              "Contact Number": cust.ContactNumber || '',
              "Product Code": item.productCode,
              "Order Items": prod.ProductName,
              "Quantity": item.qty,
              "UOM": item.uom,
              "Price": item.price || 0,
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
      setIsSubmittingOrder(false);
  };

  const handleSubmitPrice = async () => {
      if (!selectedSupplier) return alert("Please select a supplier.");
      if (parsedPriceItems.length === 0) return alert("No items parsed.");

      setIsSubmittingPrice(true);
      
      const purchaseRows = parsedPriceItems.map(item => ({
          "Timestamp": new Date(`${priceDate}T12:00:00`), 
          "ProductCode": item.productCode,
          "ProductName": item.productName,
          "Supplier": selectedSupplier,
          "PurchaseQty": 0, // Set 0 to not affect stock
          "PurchaseUOM": item.uom,
          "CostPrice": item.price,
          "InvoiceNumber": "PRICE_LIST", // Identifier
          "LoggedBy": currentUser
      }));

      const { error } = await supabase.from('Purchase').insert(purchaseRows);

      if (error) {
          alert("Error saving price: " + error.message);
      } else {
          alert("Prices Logged Successfully!");
          setParsedPriceItems([]);
          setPriceRawText('');
      }
      setIsSubmittingPrice(false);
  };

  // Render Helpers
  const updateOrderItem = (id, field, value) => {
      setParsedOrderItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
      if (field === 'productCode') {
          const prod = products.find(p => p.ProductCode === value);
          if (prod) {
              setParsedOrderItems(prev => prev.map(item => item.id === id ? { ...item, uom: prod.BaseUOM } : item));
          }
      }
  };
  const removeOrderItem = (id) => setParsedOrderItems(prev => prev.filter(item => item.id !== id));
  const addBlankOrderItem = () => setParsedOrderItems(prev => [...prev, { id: Date.now(), rawLine: 'Manual Entry', qty: 1, uom: 'KG', price: 0, productCode: '' }]);
  
  const updatePriceItem = (id, field, value) => {
      setParsedPriceItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };
  const removePriceItem = (id) => setParsedPriceItems(prev => prev.filter(item => item.id !== id));

  if (loading) return <div className="p-10 text-center text-gray-500 font-bold">Loading Engine...</div>;

  return (
    <div className="p-3 md:p-6 max-w-full overflow-x-hidden pt-16 md:pt-6 bg-gray-50 min-h-screen">
      
      <div className="mb-6">
         <h1 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight">Quick Paste Hub</h1>
         <p className="text-[10px] md:text-xs text-gray-400 font-bold uppercase mt-1">Parse orders and supplier prices instantly</p>
      </div>

      {/* TABS */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 border-b border-gray-200">
          <button 
              onClick={() => setActiveTab('orders')} 
              className={`px-5 py-2.5 rounded-t-xl font-bold text-sm transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === 'orders' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-100'}`}
          >
              <ClipboardDocumentCheckIcon className="w-5 h-5" /> Order Paste
          </button>
          <button 
              onClick={() => setActiveTab('prices')} 
              className={`px-5 py-2.5 rounded-t-xl font-bold text-sm transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === 'prices' ? 'bg-purple-600 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-100'}`}
          >
              <CurrencyDollarIcon className="w-5 h-5" /> Price Paste
          </button>
          <button 
              onClick={() => setActiveTab('compare')} 
              className={`px-5 py-2.5 rounded-t-xl font-bold text-sm transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === 'compare' ? 'bg-orange-500 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-100'}`}
          >
              <ScaleIcon className="w-5 h-5" /> Compare Prices
          </button>
      </div>

      {/* ==========================================
          TAB 1: ORDER PASTE
          ========================================== */}
      {activeTab === 'orders' && (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-in fade-in">
          {/* LEFT: Paste Area */}
          <div className="lg:col-span-4 bg-white p-5 rounded-3xl shadow-sm border border-gray-100 flex flex-col h-[calc(100vh-180px)]">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 block flex-none">
                  Paste Order Text Here
              </label>
              <textarea 
                  className="w-full flex-1 border border-gray-200 bg-gray-50 rounded-2xl p-4 text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-all placeholder-gray-300"
                  placeholder={`Example:\nHEYTEA GENTING\n2CTN MANGO GOLD SUSU\n5PCS avocado`}
                  value={orderRawText}
                  onChange={e => setOrderRawText(e.target.value)}
              />
              <button 
                  onClick={handleParseOrder}
                  className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg active:scale-95 flex items-center justify-center gap-2 transition flex-none"
              >
                  <ClipboardDocumentCheckIcon className="w-5 h-5" /> Auto-Parse Order
              </button>
          </div>

          {/* RIGHT: Validation & Review */}
          <div className="lg:col-span-8 bg-white p-5 md:p-6 rounded-3xl shadow-xl border border-gray-100 flex flex-col h-[calc(100vh-180px)] relative">
              <div className="flex flex-col md:flex-row gap-4 mb-6 flex-none">
                  <div className="flex-1">
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Detected Customer</label>
                      <SearchableCustomerSelect 
                          selectedCustomerId={selectedCustomer}
                          customers={customers}
                          onSelect={(id) => setSelectedCustomer(id)}
                      />
                  </div>
                  <div className="w-full md:w-32">
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Mode</label>
                      <select 
                          className="w-full border border-gray-200 bg-gray-50 p-3 rounded-xl text-sm font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={deliveryMode}
                          onChange={e => setDeliveryMode(e.target.value)}
                      >
                          <option value="Driver">Driver</option>
                          <option value="Lalamove">Lalamove</option>
                          <option value="Self Pick-up">Self Pick-up</option>
                      </select>
                  </div>
                  <div className="w-full md:w-40">
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Delivery Date</label>
                      <input 
                          type="date"
                          className="w-full border border-gray-200 bg-gray-50 p-3 rounded-xl text-sm font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={deliveryDate}
                          onChange={e => setDeliveryDate(e.target.value)}
                      />
                  </div>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
                  {parsedOrderItems.length === 0 ? (
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

                        {parsedOrderItems.map((item) => (
                            <div key={item.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center bg-white p-3 rounded-xl border border-gray-200 shadow-sm hover:border-blue-300 transition">
                                <div className="md:col-span-3 text-[10px] text-gray-500 italic truncate" title={item.rawLine}>
                                    "{item.rawLine}"
                                </div>
                                <div className="md:col-span-3">
                                    <SearchableProductSelect 
                                        item={item} 
                                        products={products} 
                                        onUpdate={(code) => updateOrderItem(item.id, 'productCode', code)} 
                                    />
                                </div>
                                <div className="md:col-span-2 flex items-center gap-1">
                                    <span className="md:hidden text-[9px] font-bold text-gray-400">QTY:</span>
                                    <input type="number" step="0.1" className="w-full p-2.5 border rounded-lg text-xs font-black text-center focus:ring-2 focus:ring-blue-500" value={item.qty} onChange={e => updateOrderItem(item.id, 'qty', e.target.value)} />
                                </div>
                                <div className="md:col-span-2 flex items-center gap-1">
                                    <span className="md:hidden text-[9px] font-bold text-gray-400">UOM:</span>
                                    <select className="w-full p-2.5 border rounded-lg text-xs font-bold uppercase focus:ring-2 focus:ring-blue-500" value={item.uom} onChange={e => updateOrderItem(item.id, 'uom', e.target.value)}>
                                        {KNOWN_UOMS.map(u => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                </div>
                                <div className="md:col-span-1 flex items-center gap-1">
                                    <span className="md:hidden text-[9px] font-bold text-gray-400">PRICE:</span>
                                    <input type="number" step="0.01" className="w-full p-2.5 border rounded-lg text-[10px] md:text-xs font-black text-center focus:ring-2 focus:ring-blue-500" value={item.price} onChange={e => updateOrderItem(item.id, 'price', e.target.value)} />
                                </div>
                                <div className="md:col-span-1 text-right">
                                    <button onClick={() => removeOrderItem(item.id)} className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"><TrashIcon className="w-5 h-5 inline" /></button>
                                </div>
                            </div>
                        ))}
                        <button onClick={addBlankOrderItem} className="w-full py-3 border-2 border-dashed border-gray-200 text-gray-400 font-bold rounded-xl hover:border-blue-400 hover:text-blue-500 transition flex items-center justify-center gap-2 text-xs">
                            <PlusIcon className="w-4 h-4" /> Add Item Manually
                        </button>
                      </>
                  )}
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100 flex-none flex justify-between items-center">
                  <div className="text-xs font-bold text-gray-500">Total Valid Items: <span className="text-gray-800 text-sm ml-1">{parsedOrderItems.filter(i => i.productCode).length}</span></div>
                  <button onClick={handleSubmitOrder} disabled={isSubmittingOrder || parsedOrderItems.length === 0} className={`py-3 px-8 rounded-xl font-black text-sm text-white shadow-lg transition active:scale-95 ${isSubmittingOrder || parsedOrderItems.length === 0 ? 'bg-gray-300 cursor-not-allowed shadow-none' : 'bg-blue-600 hover:bg-blue-700'}`}>
                      {isSubmittingOrder ? 'Logging...' : 'Confirm & Log Order'}
                  </button>
              </div>
          </div>
      </div>
      )}

      {/* ==========================================
          TAB 2: PRICE PASTE
          ========================================== */}
      {activeTab === 'prices' && (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-in fade-in">
          {/* LEFT: Paste Area */}
          <div className="lg:col-span-4 bg-white p-5 rounded-3xl shadow-sm border border-purple-100 flex flex-col h-[calc(100vh-180px)]">
              <label className="text-[10px] font-black text-purple-500 uppercase tracking-widest mb-3 block flex-none">
                  Paste Supplier Price List Here
              </label>
              <textarea 
                  className="w-full flex-1 border border-purple-200 bg-purple-50/30 rounded-2xl p-4 text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none transition-all placeholder-purple-300"
                  placeholder={`Example:\n*General Vegetable*\nCauliflower 12kg 30 KM\nCarrot 4.5kg 15`}
                  value={priceRawText}
                  onChange={e => setPriceRawText(e.target.value)}
              />
              <button 
                  onClick={handleParsePrice}
                  className="w-full mt-4 bg-purple-600 hover:bg-purple-700 text-white font-bold py-4 rounded-xl shadow-lg active:scale-95 flex items-center justify-center gap-2 transition flex-none"
              >
                  <CurrencyDollarIcon className="w-5 h-5" /> Auto-Parse Prices
              </button>
          </div>

          {/* RIGHT: Validation & Review */}
          <div className="lg:col-span-8 bg-white p-5 md:p-6 rounded-3xl shadow-xl border border-purple-100 flex flex-col h-[calc(100vh-180px)] relative">
              <div className="flex flex-col md:flex-row gap-4 mb-6 flex-none">
                  <div className="flex-1">
                      <label className="block text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1.5">Select Supplier</label>
                      <select 
                          className={`w-full border p-3 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-purple-500 ${!selectedSupplier ? 'border-red-300 bg-red-50 text-red-700' : 'border-purple-200 bg-purple-50 text-purple-900'}`}
                          value={selectedSupplier}
                          onChange={e => setSelectedSupplier(e.target.value)}
                      >
                          <option value="">-- SELECT SUPPLIER --</option>
                          {suppliers.map(s => <option key={s.SupplierName} value={s.SupplierName}>{s.SupplierName}</option>)}
                      </select>
                  </div>
                  <div className="w-full md:w-48">
                      <label className="block text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1.5">Price Date</label>
                      <input 
                          type="date"
                          className="w-full border border-purple-200 bg-purple-50 p-3 rounded-xl text-sm font-bold text-purple-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                          value={priceDate}
                          onChange={e => setPriceDate(e.target.value)}
                      />
                  </div>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
                  {parsedPriceItems.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-purple-300 border-2 border-dashed border-purple-100 rounded-2xl">
                          <CurrencyDollarIcon className="w-16 h-16 mb-4 opacity-20" />
                          <p className="font-bold text-sm">Unmatched products are ignored automatically</p>
                      </div>
                  ) : (
                      <>
                        <div className="hidden md:grid grid-cols-12 gap-2 px-2 pb-2 border-b border-purple-100 text-[9px] font-black text-purple-400 uppercase tracking-wider">
                            <div className="col-span-4">Original Text</div>
                            <div className="col-span-3">Matched Product</div>
                            <div className="col-span-2 text-center">UOM</div>
                            <div className="col-span-2 text-center">Cost</div>
                            <div className="col-span-1 text-right"></div>
                        </div>

                        {parsedPriceItems.map((item) => (
                            <div key={item.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center bg-white p-3 rounded-xl border border-purple-100 shadow-sm hover:border-purple-300 transition">
                                <div className="md:col-span-4 text-[10px] text-gray-500 font-bold truncate" title={item.rawLine}>
                                    "{item.rawLine}"
                                </div>
                                <div className="md:col-span-3">
                                    <SearchableProductSelect 
                                        item={item} 
                                        products={products} 
                                        onUpdate={(code) => updatePriceItem(item.id, 'productCode', code)} 
                                    />
                                </div>
                                <div className="md:col-span-2 flex items-center justify-center">
                                    <span className="bg-purple-50 text-purple-700 font-bold text-xs px-3 py-1.5 rounded-lg border border-purple-100">{item.uom}</span>
                                </div>
                                <div className="md:col-span-2 flex items-center justify-center">
                                    <span className="font-black text-red-600 text-sm">RM {Number(item.price).toFixed(2)}</span>
                                </div>
                                <div className="md:col-span-1 text-right">
                                    <button onClick={() => removePriceItem(item.id)} className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"><TrashIcon className="w-5 h-5 inline" /></button>
                                </div>
                            </div>
                        ))}
                      </>
                  )}
              </div>

              <div className="mt-4 pt-4 border-t border-purple-100 flex-none flex justify-between items-center">
                  <div className="text-xs font-bold text-gray-500">Total Valid Prices: <span className="text-purple-800 text-sm ml-1 font-black">{parsedPriceItems.length}</span></div>
                  <button onClick={handleSubmitPrice} disabled={isSubmittingPrice || parsedPriceItems.length === 0} className={`py-3 px-8 rounded-xl font-black text-sm text-white shadow-lg transition active:scale-95 ${isSubmittingPrice || parsedPriceItems.length === 0 ? 'bg-gray-300 cursor-not-allowed shadow-none' : 'bg-purple-600 hover:bg-purple-700'}`}>
                      {isSubmittingPrice ? 'Logging...' : 'Save to Price DB'}
                  </button>
              </div>
          </div>
      </div>
      )}

      {/* ==========================================
          TAB 3: PRICE COMPARE
          ========================================== */}
      {activeTab === 'compare' && (
      <div className="bg-white p-6 md:p-8 rounded-3xl shadow-xl border border-orange-100 h-[calc(100vh-180px)] flex flex-col animate-in fade-in">
          <div className="flex flex-col md:flex-row gap-4 mb-8">
              <div className="flex-1 relative">
                  <span className="absolute left-4 top-4 text-gray-400"><MagnifyingGlassIcon className="w-5 h-5" /></span>
                  <input 
                      type="text"
                      placeholder="Search product to compare prices..."
                      className="w-full pl-12 p-4 bg-orange-50/30 border border-orange-200 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all placeholder-orange-300"
                      value={compareSearchText}
                      onChange={e => setCompareSearchText(e.target.value)}
                  />
              </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 flex-1 overflow-hidden">
              {/* LEFT: Search Results List */}
              <div className="overflow-y-auto custom-scrollbar border border-gray-100 rounded-2xl p-2 bg-gray-50">
                  <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest p-2 mb-2">Matching Products</div>
                  {products.filter(p => !compareSearchText || p.ProductName.toLowerCase().includes(compareSearchText.toLowerCase()) || p.ProductCode.toLowerCase().includes(compareSearchText.toLowerCase())).slice(0,20).map(p => (
                      <div 
                          key={p.ProductCode} 
                          onClick={() => handleCompareSearch(p.ProductCode)}
                          className="p-3 mb-2 bg-white rounded-xl shadow-sm border border-gray-100 cursor-pointer hover:border-orange-400 hover:shadow-md transition group"
                      >
                          <div className="font-bold text-gray-800 text-sm uppercase group-hover:text-orange-600 transition-colors">{p.ProductName}</div>
                          <div className="text-[10px] text-gray-400 mt-1 font-mono">{p.ProductCode}</div>
                      </div>
                  ))}
              </div>

              {/* RIGHT: Compare Results */}
              <div className="overflow-y-auto custom-scrollbar border-l-2 border-orange-100 pl-6 relative">
                  {isComparing ? (
                      <div className="flex justify-center items-center h-full font-bold text-orange-400">Searching...</div>
                  ) : compareResults.length > 0 ? (
                      <>
                          <h3 className="text-lg font-black text-gray-800 mb-6 sticky top-0 bg-white py-2 z-10 flex items-center gap-2">
                              <ScaleIcon className="w-6 h-6 text-orange-500" /> Recent Price History
                          </h3>
                          <div className="space-y-4">
                              {compareResults.map((res, idx) => (
                                  <div key={idx} className={`p-4 rounded-2xl border flex justify-between items-center ${res.InvoiceNumber === 'PRICE_LIST' ? 'bg-purple-50/50 border-purple-200' : 'bg-white border-gray-200 shadow-sm'}`}>
                                      <div>
                                          <div className="font-black text-gray-800 text-base mb-1">{res.Supplier}</div>
                                          <div className="flex gap-2 items-center">
                                              <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded uppercase">{new Date(res.Timestamp).toLocaleDateString('en-GB')}</span>
                                              {res.InvoiceNumber === 'PRICE_LIST' ? (
                                                  <span className="text-[9px] font-bold text-purple-600 bg-purple-100 px-2 py-0.5 rounded border border-purple-200">Quotation</span>
                                              ) : (
                                                  <span className="text-[9px] font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded border border-blue-200">Actual Buy</span>
                                              )}
                                          </div>
                                      </div>
                                      <div className="text-right">
                                          <div className="font-black text-red-600 text-lg">RM {Number(res.CostPrice).toFixed(2)}</div>
                                          <div className="text-[10px] font-bold text-gray-400 uppercase mt-0.5">per {res.PurchaseUOM}</div>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      </>
                  ) : (
                      <div className="flex flex-col justify-center items-center h-full text-gray-300">
                          <ScaleIcon className="w-16 h-16 mb-4 opacity-20" />
                          <p className="font-bold text-sm">Select a product on the left to view comparison</p>
                      </div>
                  )}
              </div>
          </div>
      </div>
      )}

    </div>
  );
}