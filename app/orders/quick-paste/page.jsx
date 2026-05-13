'use client';
import { useState, useEffect, useMemo } from 'react';
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
  ScaleIcon,
  DocumentTextIcon,
  ClipboardDocumentIcon
} from '@heroicons/react/24/outline';

const KNOWN_UOMS = ['KG', 'CTN', 'PCS', 'PKT', 'BKL', 'BOX', 'G', 'TRAY', 'BUNCH', 'BAG', 'ROLL', 'SISIR', 'PACK', 'BTL', 'TIN'];

// Helper to get local date string (YYYY-MM-DD) avoiding UTC timezone shift issues
const getLocalDateString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Custom Searchable Customer Dropdown Component
function SearchableCustomerSelect({ selectedCustomerId, customers, onSelect }) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');

    let displayName = '-- SELECT CUSTOMER --';
    if (selectedCustomerId === 'NEW') {
        displayName = '➕ NEW CUSTOMER (GUEST)';
    } else if (selectedCustomerId) {
        const selectedCustomer = customers.find(c => c.id.toString() === selectedCustomerId);
        if (selectedCustomer) {
            displayName = selectedCustomer.Branch ? `${selectedCustomer.CompanyName} - ${selectedCustomer.Branch}` : selectedCustomer.CompanyName;
        }
    }

    const filteredCustomers = customers.filter(c => {
        if (!search) return true;
        const term = search.toLowerCase();
        const fullName = `${c.CompanyName || ''} ${c.Branch || ''}`.toLowerCase();
        return fullName.includes(term);
    });

    return (
        <div className="relative w-full">
            <div 
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full border p-3 rounded-xl text-[16px] md:text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer flex justify-between items-center ${!selectedCustomerId ? 'border-red-300 bg-red-50 text-red-700' : (selectedCustomerId === 'NEW' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 bg-gray-50 text-gray-800')}`}
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
                                className="w-full p-2 border border-gray-200 rounded-lg text-[16px] md:text-sm outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                        <div className="overflow-y-auto flex-1 custom-scrollbar">
                            <div 
                                className="p-3 hover:bg-blue-50 cursor-pointer text-[16px] md:text-sm font-bold text-blue-600 border-b border-gray-50"
                                onClick={() => {
                                    onSelect('NEW');
                                    setIsOpen(false);
                                    setSearch('');
                                }}
                            >
                                ➕ ADD NEW CUSTOMER (GUEST)
                            </div>
                            <div 
                                className="p-3 hover:bg-red-50 cursor-pointer text-[16px] md:text-sm font-bold text-red-500 border-b border-gray-50"
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
                                    className="p-3 hover:bg-blue-50 cursor-pointer text-[16px] md:text-sm font-bold text-gray-700 border-b border-gray-50 last:border-0"
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
        const terms = search.toLowerCase().split(' ').filter(t => t);
        const searchStr = `${p.ProductName || ''} ${p.ProductCode || ''}`.toLowerCase();
        return terms.every(term => searchStr.includes(term));
    });

    return (
        <div className="relative w-full">
            <div 
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full text-[16px] md:text-xs font-bold p-2.5 rounded-lg border cursor-pointer flex justify-between items-center ${!item.productCode ? 'border-red-300 bg-red-50 text-red-700' : 'border-gray-200 bg-white text-gray-800'}`}
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
                                className="w-full p-2 border border-gray-200 rounded-lg text-[16px] md:text-xs outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                        <div className="overflow-y-auto flex-1 custom-scrollbar">
                            <div 
                                className="p-3 hover:bg-red-50 cursor-pointer text-[16px] md:text-xs font-bold text-red-500 border-b border-gray-50"
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
                                    className="p-3 hover:bg-blue-50 cursor-pointer text-[16px] md:text-xs font-bold text-gray-700 border-b border-gray-50 last:border-0"
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
                                <div className="p-4 text-center text-[16px] md:text-xs text-gray-400 italic">No products found</div>
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
  const [activeTab, setActiveTab] = useState('orders'); 
  
  // Base Data
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [currentUser, setCurrentUser] = useState('');
  
  // Customer Specific Prices State
  const [customerPrices, setCustomerPrices] = useState([]);

  // Order Paste State
  const [orderRawText, setOrderRawText] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryMode, setDeliveryMode] = useState('Driver');
  const [parsedOrderItems, setParsedOrderItems] = useState([]);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  
  // Customer Contact State
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');

  // Supplier Price Matrix State — temporary, in-memory comparison only
  const [matrixSupplierName, setMatrixSupplierName] = useState('');
  const [matrixRawText, setMatrixRawText] = useState('');
  const [supplierPriceLists, setSupplierPriceLists] = useState([]);
  const [matrixSearchTerm, setMatrixSearchTerm] = useState('');
  const [matrixCategoryFilter, setMatrixCategoryFilter] = useState('all');
  const [matrixViewFilter, setMatrixViewFilter] = useState('all'); // all, comparable, spread
  const [matrixSortBy, setMatrixSortBy] = useState('category'); // category, spread, lowest, name
  const [matrixNotice, setMatrixNotice] = useState('');

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
      
      setDeliveryDate(calculateDefaultDate());
    }
    loadData();
  }, [router]);

  const calculateDefaultDate = () => {
      const now = new Date();
      const hour = now.getHours();
      const targetDate = new Date(now);
      
      // Default to today if morning (before 12pm). Default to tomorrow if after 12pm.
      if (hour >= 12) {
          targetDate.setDate(targetDate.getDate() + 1);
      }
      
      return getLocalDateString(targetDate);
  };

  const findBestCustomerMatch = (firstLine, customersList) => {
      const cleanLine = firstLine.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
      const lineTokens = cleanLine.split(' ').filter(t => t.length > 1);

      let bestMatch = null;
      let highestScore = 0;

      customersList.forEach(c => {
          let score = 0;
          const compName = (c.CompanyName || '').toLowerCase();
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

  const findBestProductMatch = (rawName, historyCodesSet = new Set()) => {
      const nameForMatching = rawName.replace(/\(.*?\)/g, '').trim().toLowerCase();
      if (!nameForMatching) return null;

      let bestMatch = null;
      let highestScore = 0;

      const rawWords = nameForMatching.split(/[\s\-]+/).filter(w => w.length > 0);
      const totalRawLength = rawWords.join('').length;

      products.forEach(p => {
          const lowerProd = (p.ProductName || '').toLowerCase();
          if (!lowerProd) return;

          let score = 0;

          if (lowerProd === nameForMatching) {
              score = 100;
          } else {
              let matchedWordsLength = 0;
              const prodWords = lowerProd.split(/[\s\-]+/);
              let exactWordMatches = 0;

              rawWords.forEach(rw => {
                  if (prodWords.includes(rw)) {
                      matchedWordsLength += rw.length;
                      exactWordMatches++;
                  } 
                  else if (rw.length > 2 && prodWords.some(pw => pw.includes(rw) || rw.includes(pw))) {
                      matchedWordsLength += rw.length * 0.7; 
                  }
              });

              if (totalRawLength > 0) {
                  score = (matchedWordsLength / totalRawLength) * 60;
                  if (exactWordMatches > 0) {
                      score += (exactWordMatches / rawWords.length) * 20;
                  }
              }
          }

          if (score >= 35 && historyCodesSet.has(p.ProductCode)) {
              score += 40; 
          }

          if (score > highestScore) {
              highestScore = score;
              bestMatch = p;
          }
      });

      return highestScore >= 45 ? bestMatch : null;
  };

  // ==========================================
  // 1. ORDER PARSING LOGIC
  // ==========================================
  const handleParseOrder = async () => {
      if (!orderRawText.trim()) return;

      const lines = orderRawText.split('\n').map(l => l.trim()).filter(l => l !== '');
      if (lines.length === 0) return;

      // Clean first line of bold formatting (asterisks) immediately
      lines[0] = lines[0].replace(/^\*+/, '').replace(/\*+$/, '').trim();
      const firstLine = lines[0];

      let startIndex = 0;
      let matchedCust = findBestCustomerMatch(firstLine, customers);
      let customerHistoryCodes = new Set();
      let custPrices = []; // Local reference for immediate loop processing
      
      // Reset meta states
      setNewCustName('');
      setNewCustPhone('');
      setNewCustAddress('');

      if (matchedCust) {
          setSelectedCustomer(matchedCust.id.toString());
          setNewCustPhone(matchedCust.ContactNumber || '');
          setNewCustAddress(matchedCust.DeliveryAddress || '');
          startIndex = 1; 
          
          const safeSearchName = (matchedCust.CompanyName || '').split(' ')[0].replace(/[^\w\s]/g, '');
          
          // Parallel fetch history & specific prices for this customer
          const [histRes, priceRes] = await Promise.all([
              supabase.from('Orders').select('"Product Code"').ilike('Customer Name', `%${safeSearchName}%`).order('Timestamp', { ascending: false }).limit(200),
              supabase.from('CustomerPrices').select('ProductCode, Price, UOM').eq('CustomerName', matchedCust.CompanyName)
          ]);
              
          if (histRes.data) {
              histRes.data.forEach(h => customerHistoryCodes.add(h["Product Code"]));
          }
          
          if (priceRes.data) {
              setCustomerPrices(priceRes.data);
              custPrices = priceRes.data;
          } else {
              setCustomerPrices([]);
          }
      } else {
          setCustomerPrices([]);
          // If unmatched, check if it's a product line
          if (!/^[-*•\s]*\d+/.test(firstLine)) {
              setSelectedCustomer('NEW');
              setNewCustName(firstLine);
              startIndex = 1; 
          } else {
              setSelectedCustomer(''); 
              startIndex = 0; 
          }
      }

      const uomPattern = KNOWN_UOMS.join('|');
      
      // Regex 1: Matches Qty & UOM at the END
      const endQtyUomPriceRegex = new RegExp(`(?:[\\s\\-@xX,]+|^)([\\d.]+)\\s*(${uomPattern})(?:[\\s\\-@xX]*(?:RM|rm)?\\s*([\\d.]+))?\\s*$`, 'i');
      
      // Regex 2: Matches Qty & UOM at the START
      const startQtyUomRegex = new RegExp(`^([\\d.]+)\\s*(${uomPattern})\\b(?:[\\s\\-@xX,]+(.*))?$`, 'i');

      let extractedPhone = '';
      let extractedAddress = '';
      let inHeader = true; 

      const newItems = [];
      for (let i = startIndex; i < lines.length; i++) {
          let line = lines[i];
          
          line = line.replace(/^\*+/, '').replace(/\*+$/, '').trim();
          
          // --- DATE EXTRACTION ---
          const dateMatch = line.match(/^\s*(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{2,4}))?\s*$/);
          if (dateMatch) {
              let [_, day, month, year] = dateMatch;
              if (!year) year = new Date().getFullYear().toString();
              else if (year.length === 2) year = '20' + year; 
              
              const parsedDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
              if (!isNaN(parsedDate)) {
                  setDeliveryDate(getLocalDateString(parsedDate));
                  continue; 
              }
          }

          // --- HEADER METADATA EXTRACTION ---
          if (inHeader) {
              const phoneMatch = line.match(/^(?:\+?6?0)[1-9][0-9\-\s]{5,12}$/);
              if (phoneMatch) {
                  if (!extractedPhone) extractedPhone = line.trim();
                  continue;
              }

              const hasEndUom = endQtyUomPriceRegex.test(line);
              const hasStartUom = startQtyUomRegex.test(line);
              const hasUomKeyword = new RegExp(`\\b(?:${uomPattern})\\b`, 'i').test(line);
              const isBulletStart = /^[-*•]\s/.test(line); 

              if (hasEndUom || hasStartUom || isBulletStart || (hasUomKeyword && !line.toLowerCase().includes('jalan'))) {
                  inHeader = false; 
              } else {
                  if (line.length > 2) {
                      extractedAddress += (extractedAddress ? ', ' : '') + line;
                  }
                  continue; 
              }
          }
          
          // --- PRODUCT ITEM EXTRACTION ---
          let cleanLine = line.replace(/^[-*•\s]+|^\d+\.\s+/, '').trim();
          let bracketNote = '';
          const bracketMatch = cleanLine.match(/\s*(\(.*?\))\s*$/);
          if (bracketMatch) {
              bracketNote = bracketMatch[1];
              cleanLine = cleanLine.substring(0, bracketMatch.index).trim();
          }
          
          let qty = 1;
          let uom = '';
          let price = 0;
          let rawName = cleanLine;

          const endMatch = rawName.match(endQtyUomPriceRegex);
          if (endMatch) {
              qty = parseFloat(endMatch[1]);
              uom = endMatch[2].toUpperCase();
              if (endMatch[3]) price = parseFloat(endMatch[3]);
              rawName = rawName.substring(0, endMatch.index).trim();
          } else {
              const startMatch = rawName.match(startQtyUomRegex);
              if (startMatch) {
                  qty = parseFloat(startMatch[1]);
                  uom = startMatch[2].toUpperCase();
                  rawName = (startMatch[3] || '').trim();
                  
                  const pMatch = rawName.match(/\s+[- \t@xX]*(?:RM|rm)?\s*(\d+(?:\.\d{1,2})?)\s*$/i);
                  if (pMatch) {
                      price = parseFloat(pMatch[1]);
                      rawName = rawName.substring(0, pMatch.index).trim();
                  }
              } else {
                  const qtyMatch = rawName.match(/(?:[\s\-@xX,]+|^)([\d.]+)\s*$/i);
                  if (qtyMatch) {
                      qty = parseFloat(qtyMatch[1]);
                      rawName = rawName.substring(0, qtyMatch.index).trim();
                  }
                  
                  const pMatch = rawName.match(/\s+[- \t@xX]*(?:RM|rm)?\s*(\d+(?:\.\d{1,2})?)\s*$/i);
                  if (pMatch) {
                      price = parseFloat(pMatch[1]);
                      rawName = rawName.substring(0, pMatch.index).trim();
                  }
              }
          }

          rawName = rawName.replace(/^[-:]+\s*/, '').replace(/\s*[-:]+$/, '').trim();
          rawName = rawName + (bracketNote ? ' ' + bracketNote : '');

          const bestProduct = findBestProductMatch(rawName, customerHistoryCodes);

          let finalUom = uom || 'KG'; 
          
          if (bestProduct) {
              const allowedUoms = bestProduct.AllowedUOMs 
                  ? bestProduct.AllowedUOMs.split(',').map(u => u.trim().toUpperCase()).filter(Boolean)
                  : [bestProduct.BaseUOM?.toUpperCase() || 'KG'];
              
              if (!allowedUoms.includes(finalUom)) {
                  finalUom = bestProduct.BaseUOM || allowedUoms[0] || 'KG';
              }
              
              if (price === 0) {
                  const savedPriceObj = custPrices.find(cp => cp.ProductCode === bestProduct.ProductCode && cp.UOM === finalUom);
                  if (savedPriceObj) price = savedPriceObj.Price;
              }
          }

          newItems.push({
              id: Date.now() + i,
              rawLine: line,
              qty: qty,
              uom: finalUom,
              price: price, 
              productCode: bestProduct ? bestProduct.ProductCode : '',
              notes: '',
              showNotes: false, 
              isReplacement: false 
          });
      }

      if (extractedPhone) setNewCustPhone(extractedPhone);
      if (extractedAddress) setNewCustAddress(extractedAddress);
      
      setParsedOrderItems(newItems);
  };

  // ==========================================
  // 2. SUPPLIER PRICE MATRIX LOGIC
  // ==========================================
  const normalizeMultiplierSymbols = (value = '') => {
      return String(value)
          .replace(/[ⅹ×✕✖＊]/g, 'x')
          .replace(/\*/g, 'x');
  };

  const normalizeMatrixKeyPart = (value = '') => {
      return normalizeMultiplierSymbols(value)
          .toLowerCase()
          .replace(/\s+/g, '')
          .replace(/[^\w\u4e00-\u9fff#/-]/g, '');
  };

  // Supplier pricelists often use a leading "A" as a list marker, for example:
  // A北葱 / A冬瓜 / A螺丝椒. We strip that marker only for comparison purposes.
  const normalizeChineseProductKey = (value = '') => {
      const cleaned = normalizeMatrixKeyPart(value);
      return cleaned.replace(/^[a-z](?=[\u4e00-\u9fff])/i, '');
  };

  // "200gx20pkt", "200g x 20 pkt", "200gx20PACK" and "200gx20"
  // should compare as the same quoted packaging basis.
  // We keep the normalized comparison UOM in the matrix to make equivalent quotes line up.
  const normalizeSupplierUom = (value = '') => {
      let normalized = normalizeMultiplierSymbols(value)
          .toLowerCase()
          .replace(/\s+/g, '')
          .replace(/pieces?/g, 'pcs')
          .replace(/packets?/g, 'pkt')
          .replace(/packs?/g, 'pkt');

      // Remove trailing package labels only when they appear after a multiplier count.
      // Example: 200gx20pkt -> 200gx20, 1.5kgx5pkt -> 1.5kgx5.
      normalized = normalized.replace(
          /^(\d+(?:\.\d+)?(?:kg|g|ctn|pcs|pkt|box|tray|bunch|bag|roll|sisir|pack|btl|tin|#)?x\d+)(?:pkt|pack|pcs)$/i,
          '$1'
      );

      return normalized || '-';
  };

  const normalizeEnglishProductKey = (value = '') => {
      return normalizeMatrixKeyPart(value);
  };

  // Starter canonical alias dictionary.
  // This is intentionally conservative: it only covers naming variants that are clearly the same produce term.
  // Chinese-name matching remains the primary automatic resolver when a Chinese name exists.
  const SUPPLIER_PRODUCT_ALIASES = [
      {
          canonicalId: 'BABY_CHOYSUM',
          displayChineseName: '菜心仔',
          displayName: 'Baby Choysum',
          chineseAliases: ['菜心仔'],
          nameAliases: [
              'babychoysum',
              'baby choysum',
              'baby choy sum',
              'babychoysam',
              'baby choysam',
              'baby choy sam'
          ]
      },
      {
          canonicalId: 'CHOYSUM',
          displayChineseName: '菜心',
          displayName: 'Choysum',
          chineseAliases: ['菜心'],
          nameAliases: [
              'choysum',
              'choy sum',
              'choysam',
              'choy sam'
          ]
      },
      {
          canonicalId: 'BABY_PAKCHOY',
          displayChineseName: '青白仔',
          displayName: 'Baby Pakchoy',
          chineseAliases: ['青白仔'],
          nameAliases: [
              'babypakchoy',
              'baby pakchoy',
              'baby pak choy',
              'babypakchoi',
              'baby pakchoi',
              'baby pak choi'
          ]
      },
      {
          canonicalId: 'BABY_KAILAN',
          displayChineseName: '芥兰仔',
          displayName: 'Baby Kailan',
          chineseAliases: ['芥兰仔'],
          nameAliases: [
              'babykailan',
              'baby kailan',
              'baby kai lan'
          ]
      },
      {
          canonicalId: 'KAILAN',
          displayChineseName: '芥兰',
          displayName: 'Kailan',
          chineseAliases: ['芥兰'],
          nameAliases: [
              'kailan',
              'kai lan'
          ]
      }
  ];

  const getCanonicalAlias = ({ chineseName = '-', name = '-' }) => {
      const chineseKey = normalizeChineseProductKey(chineseName);
      const englishKey = normalizeEnglishProductKey(name);

      return SUPPLIER_PRODUCT_ALIASES.find(alias => {
          const chineseAliasKeys = (alias.chineseAliases || []).map(normalizeChineseProductKey);
          const englishAliasKeys = (alias.nameAliases || []).map(normalizeEnglishProductKey);

          return (
              (chineseKey && chineseKey !== '-' && chineseAliasKeys.includes(chineseKey)) ||
              (englishKey && englishKey !== '-' && englishAliasKeys.includes(englishKey))
          );
      }) || null;
  };

  const resolveCanonicalSupplierProduct = ({
      chineseName = '-',
      name = '-',
      uom = '-'
  }) => {
      const normalizedChineseKey = normalizeChineseProductKey(chineseName);
      const normalizedEnglishKey = normalizeEnglishProductKey(name);
      const normalizedUom = normalizeSupplierUom(uom);
      const normalizedUomKey = normalizeMatrixKeyPart(normalizedUom);

      const alias = getCanonicalAlias({ chineseName, name });

      let canonicalProductId = '';
      let displayChineseName = chineseName || '-';
      let displayName = name || '-';

      if (alias) {
          canonicalProductId = `ALIAS:${alias.canonicalId}`;
          displayChineseName = alias.displayChineseName || displayChineseName;
          displayName = alias.displayName || displayName;
      } else if (normalizedChineseKey && normalizedChineseKey !== '-') {
          // Chinese name is the strongest fallback signal in these supplier lists.
          // This automatically merges rows like:
          // 菜心仔 Baby ChoySum / 菜心仔 BabyChoysam.
          canonicalProductId = `ZH:${normalizedChineseKey}`;
      } else {
          canonicalProductId = `EN:${normalizedEnglishKey || 'unknown'}`;
      }

      return {
          canonicalProductId,
          normalizedUom,
          normalizedUomKey,
          displayChineseName,
          displayName,
          matrixKey: `${canonicalProductId}|${normalizedUomKey || 'nouom'}`
      };
  };

  const cleanSupplierCategory = (line = '') => {
      return String(line)
          .replace(/[*_]/g, '')
          .replace(/[🇨🇳🇹🇭🇻🇳]/g, '')
          .replace(/[🥦🥬🥗🍋🍊🍠🫚🧅🌶️🍄🌟]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
  };

  const extractSupplierDate = (rawText = '') => {
      const chineseDateMatch = String(rawText).match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
      if (chineseDateMatch) {
          const [, year, month, day] = chineseDateMatch;
          return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }

      const isoDateMatch = String(rawText).match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
      if (isoDateMatch) {
          const [, year, month, day] = isoDateMatch;
          return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }

      return '';
  };

  const looksLikeSupplierUom = (value = '') => {
      const normalized = normalizeMultiplierSymbols(String(value).trim());
      return /^(\d+(?:\.\d+)?)(?:\s*(?:kg|g|ctn|pcs|pkt|box|tray|bunch|bag|roll|sisir|pack|btl|tin|#))?(?:\s*x\s*\d+(?:\s*(?:kg|g|ctn|pcs|pkt|box|tray|bunch|bag|roll|sisir|pack|btl|tin))?)?$/i.test(normalized);
  };

  const splitSupplierProductName = (rawName = '') => {
      const cleaned = String(rawName)
          .replace(/[🇨🇳🇹🇭🇻🇳]/g, '')
          .replace(/[🍋🍊🥦🥬🥗🍠🫚🧅🌶️🍄🌟]/g, '')
          .replace(/[^\w\s\u4e00-\u9fff#/-]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

      const zhMatch = cleaned.match(/^([A-Za-z]?[\u4e00-\u9fff/]+)\s*(.*)$/);

      if (zhMatch) {
          return {
              chineseName: zhMatch[1].trim() || '-',
              name: (zhMatch[2] || '').trim() || '-'
          };
      }

      return {
          chineseName: '-',
          name: cleaned || '-'
      };
  };

  const parseSupplierPricelist = (rawText = '') => {
      const lines = String(rawText)
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(Boolean);

      const detectedDate = extractSupplierDate(rawText);
      const items = [];
      let currentCategory = 'Uncategorized';

      const uomAtEndRegex = /((?:\d+(?:\.\d+)?)(?:\s*(?:kg|g|ctn|pcs|pkt|box|tray|bunch|bag|roll|sisir|pack|btl|tin|#))?(?:\s*[xX×ⅹ*]\s*\d+(?:\s*(?:kg|g|ctn|pcs|pkt|box|tray|bunch|bag|roll|sisir|pack|btl|tin))?)?)\s*$/i;

      lines.forEach((originalLine, index) => {
          const line = originalLine.trim();

          if (!line) return;

          // Skip decorative date/slogan lines.
          if (/价目表/.test(line) || /^_.*_$/.test(line)) return;

          // Category headers are usually wrapped with asterisks and do not contain a price delimiter.
          if (line.startsWith('*') && line.endsWith('*') && !line.includes(':')) {
              const category = cleanSupplierCategory(line);
              if (category) currentCategory = category;
              return;
          }

          // Product rows in the shared supplier formats use the last colon as the quote separator.
          const lastColonIndex = line.lastIndexOf(':');
          if (lastColonIndex === -1) return;

          const beforeColon = line.slice(0, lastColonIndex).trim();
          const afterColon = line.slice(lastColonIndex + 1).trim();

          let price = null;
          let bodyForParsing = beforeColon;

          const cleanPriceText = afterColon.replace(/^RM\s*/i, '').trim();
          if (/^\d+(?:\.\d+)?$/.test(cleanPriceText)) {
              price = Number(cleanPriceText);
          } else if (!beforeColon.match(uomAtEndRegex) && looksLikeSupplierUom(afterColon)) {
              // Handles rows such as "A冬瓜WinterMelon: 2.8kg" where the text after the colon behaves like UOM.
              bodyForParsing = `${beforeColon}${afterColon}`;
          }

          const normalizedBody = normalizeMultiplierSymbols(bodyForParsing);
          const uomMatch = normalizedBody.match(uomAtEndRegex);

          let rawUom = '-';
          let productNamePart = normalizedBody;

          if (uomMatch) {
              rawUom = normalizeMultiplierSymbols(uomMatch[1])
                  .replace(/\s+/g, '')
                  .toLowerCase();
              productNamePart = normalizedBody.slice(0, uomMatch.index).trim();
          }

          const { chineseName, name } = splitSupplierProductName(productNamePart);

          if (chineseName === '-' && name === '-') return;

          const canonical = resolveCanonicalSupplierProduct({
              chineseName,
              name,
              uom: rawUom
          });

          items.push({
              id: `${Date.now()}-${index}`,
              category: currentCategory,
              chineseName: canonical.displayChineseName || chineseName,
              name: canonical.displayName || name,
              rawChineseName: chineseName,
              rawName: name,
              rawUom,
              uom: canonical.normalizedUom,
              price: Number.isFinite(price) ? price : null,
              rawLine: originalLine,
              canonicalProductId: canonical.canonicalProductId,
              key: canonical.matrixKey
          });
      });

      return {
          detectedDate,
          items,
          totalItems: items.length,
          pricedItems: items.filter(item => Number.isFinite(item.price)).length
      };
  };

  const handleAddSupplierPricelist = () => {
      const supplierName = matrixSupplierName.trim();

      if (!supplierName) {
          alert('Please enter a supplier name first.');
          return;
      }

      if (!matrixRawText.trim()) {
          alert('Please paste a supplier pricelist first.');
          return;
      }

      const parsed = parseSupplierPricelist(matrixRawText);

      if (parsed.items.length === 0) {
          alert('No usable pricelist rows were detected. Please check the pasted format.');
          return;
      }

      setSupplierPriceLists(prev => {
          const withoutSameSupplier = prev.filter(
              supplier => supplier.supplierName.toLowerCase() !== supplierName.toLowerCase()
          );

          return [
              ...withoutSameSupplier,
              {
                  supplierName,
                  detectedDate: parsed.detectedDate,
                  items: parsed.items,
                  totalItems: parsed.totalItems,
                  pricedItems: parsed.pricedItems
              }
          ];
      });

      setMatrixNotice(
          `${supplierName} added: ${parsed.pricedItems} priced items from ${parsed.totalItems} parsed rows.`
      );
      setMatrixSupplierName('');
      setMatrixRawText('');
  };

  const handleRemoveSupplierPricelist = (supplierName) => {
      setSupplierPriceLists(prev =>
          prev.filter(supplier => supplier.supplierName !== supplierName)
      );
  };

  const handleClearSupplierMatrix = () => {
      setSupplierPriceLists([]);
      setMatrixNotice('');
      setMatrixSearchTerm('');
      setMatrixCategoryFilter('all');
      setMatrixViewFilter('all');
      setMatrixSortBy('category');
  };

  const supplierMatrixSupplierNames = useMemo(() => {
      return supplierPriceLists.map(supplier => supplier.supplierName);
  }, [supplierPriceLists]);

  const supplierMatrixRows = useMemo(() => {
      const matrixMap = new Map();

      supplierPriceLists.forEach(supplierList => {
          supplierList.items.forEach(item => {
              if (!matrixMap.has(item.key)) {
                  matrixMap.set(item.key, {
                      key: item.key,
                      category: item.category || 'Uncategorized',
                      chineseName: item.chineseName || '-',
                      name: item.name || '-',
                      uom: item.uom || '-',
                      supplierPrices: {},
                      rawLines: {}
                  });
              }

              const row = matrixMap.get(item.key);

              if ((!row.category || row.category === 'Uncategorized') && item.category) {
                  row.category = item.category;
              }

              row.supplierPrices[supplierList.supplierName] = item.price;
              row.rawLines[supplierList.supplierName] = item.rawLine;
          });
      });

      return Array.from(matrixMap.values()).map(row => {
          const validQuotes = Object.entries(row.supplierPrices)
              .filter(([, price]) => Number.isFinite(price));

          const quotedSupplierCount = validQuotes.length;
          const validPrices = validQuotes.map(([, price]) => Number(price));

          const lowestPrice = validPrices.length > 0 ? Math.min(...validPrices) : null;
          const highestPrice = validPrices.length > 0 ? Math.max(...validPrices) : null;
          const spread = validPrices.length >= 2 ? highestPrice - lowestPrice : null;

          const bestSuppliers = lowestPrice === null
              ? []
              : validQuotes
                  .filter(([, price]) => Number(price) === lowestPrice)
                  .map(([supplier]) => supplier);

          return {
              ...row,
              quotedSupplierCount,
              lowestPrice,
              highestPrice,
              spread,
              bestSuppliers,
              bestSupplierLabel: bestSuppliers.length > 0 ? bestSuppliers.join(' / ') : '-'
          };
      });
  }, [supplierPriceLists]);

  const supplierMatrixCategories = useMemo(() => {
      return Array.from(
          new Set(supplierMatrixRows.map(row => row.category).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b));
  }, [supplierMatrixRows]);

  const filteredSupplierMatrixRows = useMemo(() => {
      const search = matrixSearchTerm.trim().toLowerCase();

      const filtered = supplierMatrixRows.filter(row => {
          const categoryPass =
              matrixCategoryFilter === 'all' || row.category === matrixCategoryFilter;

          const viewPass =
              matrixViewFilter === 'all' ||
              (matrixViewFilter === 'comparable' && row.quotedSupplierCount >= 2) ||
              (matrixViewFilter === 'spread' && Number.isFinite(row.spread) && row.spread > 0);

          const searchableText = [
              row.category,
              row.chineseName,
              row.name,
              row.uom
          ].join(' ').toLowerCase();

          const searchPass = !search || searchableText.includes(search);

          return categoryPass && viewPass && searchPass;
      });

      filtered.sort((a, b) => {
          if (matrixSortBy === 'spread') {
              return (Number(b.spread) || 0) - (Number(a.spread) || 0);
          }

          if (matrixSortBy === 'lowest') {
              const aLow = Number.isFinite(a.lowestPrice) ? a.lowestPrice : Number.POSITIVE_INFINITY;
              const bLow = Number.isFinite(b.lowestPrice) ? b.lowestPrice : Number.POSITIVE_INFINITY;
              return aLow - bLow;
          }

          if (matrixSortBy === 'name') {
              return `${a.name} ${a.chineseName}`.localeCompare(`${b.name} ${b.chineseName}`);
          }

          const categoryCompare = (a.category || '').localeCompare(b.category || '');
          if (categoryCompare !== 0) return categoryCompare;

          return `${a.name} ${a.chineseName}`.localeCompare(`${b.name} ${b.chineseName}`);
      });

      return filtered;
  }, [
      supplierMatrixRows,
      matrixSearchTerm,
      matrixCategoryFilter,
      matrixViewFilter,
      matrixSortBy
  ]);

  const supplierMatrixSummary = useMemo(() => {
      const comparableRows = supplierMatrixRows.filter(row => row.quotedSupplierCount >= 2);
      const biggestSpread = comparableRows.reduce((max, row) => {
          return Math.max(max, Number(row.spread) || 0);
      }, 0);

      return {
          suppliersCompared: supplierPriceLists.length,
          matrixProducts: supplierMatrixRows.length,
          comparableProducts: comparableRows.length,
          biggestSpread
      };
  }, [supplierPriceLists, supplierMatrixRows]);

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

      let finalCustomerName = '';
      let finalContactPerson = '';

      if (selectedCustomer === 'NEW') {
          if (!newCustName.trim()) {
              setIsSubmittingOrder(false);
              return alert("Please enter the new customer's name.");
          }
          finalCustomerName = newCustName.toUpperCase();
      } else {
          const cust = customers.find(c => c.id.toString() === selectedCustomer);
          finalCustomerName = cust.Branch ? `${cust.CompanyName} - ${cust.Branch}`.toUpperCase() : cust.CompanyName.toUpperCase();
          finalContactPerson = cust.ContactPerson || '';
      }

      const finalContactNumber = newCustPhone;
      const finalDeliveryAddress = newCustAddress;

      const dateStr = deliveryDate.replaceAll('-', '').slice(2);
      const doNumber = `DO-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;

      const occurrenceMap = {};

      const orderRows = validItems.map(item => {
          const prod = products.find(p => p.ProductCode === item.productCode);
          const finalNotes = item.notes ? item.notes.trim() : '';

          let baseRep = item.isReplacement ? "YES" : (Number(item.price) === 0 ? "FOC" : "");
          const key = `${item.productCode}_${baseRep}`;
          let repVal = baseRep;
          
          if (occurrenceMap[key]) {
              repVal = baseRep + " ".repeat(occurrenceMap[key]);
              occurrenceMap[key]++;
          } else {
              occurrenceMap[key] = 1;
          }
          
          return {
              "Timestamp": new Date(),
              "Status": "Pending",
              "DONumber": doNumber,
              "Delivery Date": deliveryDate,
              "Delivery Mode": deliveryMode, 
              "Customer Name": finalCustomerName,
              "Delivery Address": finalDeliveryAddress,
              "Contact Person": finalContactPerson,
              "Contact Number": finalContactNumber,
              "Product Code": item.productCode,
              "Order Items": prod.ProductName,
              "Quantity": item.qty,
              "UOM": item.uom,
              "Price": item.isReplacement ? 0 : (Number(item.price) || 0),
              "Replacement": repVal,
              "LoggedBy": currentUser,
              "SpecialNotes": finalNotes
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

  // Render Helpers
  const updateOrderItem = (id, field, value) => {
      setParsedOrderItems(prev => prev.map(item => {
          if (item.id !== id) return item;
          const updated = { ...item, [field]: value };
          
          if (field === 'productCode') {
              const prod = products.find(p => p.ProductCode === value);
              if (prod) {
                  updated.uom = prod.BaseUOM;
                  const savedPrice = customerPrices.find(cp => cp.ProductCode === value && cp.UOM === prod.BaseUOM);
                  if (savedPrice) updated.price = savedPrice.Price;
              }
          }
          if (field === 'uom') {
              const savedPrice = customerPrices.find(cp => cp.ProductCode === item.productCode && cp.UOM === value);
              if (savedPrice) updated.price = savedPrice.Price;
          }
          
          return updated;
      }));
  };
  const removeOrderItem = (id) => setParsedOrderItems(prev => prev.filter(item => item.id !== id));
  const addBlankOrderItem = () => setParsedOrderItems(prev => [...prev, { id: Date.now(), rawLine: 'Manual Entry', qty: 1, uom: 'KG', price: 0, productCode: '', notes: '', showNotes: false, isReplacement: false }]);
  


  if (loading) return <div className="p-10 flex items-center justify-center h-screen text-gray-400 font-black tracking-widest animate-pulse">FFD SYSTEM ENGINE BOOTING...</div>;

  return (
    <div className="p-3 md:p-8 max-w-full overflow-x-hidden min-h-screen bg-gray-50/50 pb-32 animate-in fade-in duration-300">
      
      {/* Aggressive Global Style specifically for this page.
        This forces all inputs, textareas, and selects to be 16px on mobile,
        completely stopping iOS Safari from auto-zooming.
      */}
      <style jsx global>{`
        @media screen and (max-width: 768px) {
          input, select, textarea {
            font-size: 16px !important;
          }
        }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 10px; }
      `}</style>

      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
         <div>
             <h1 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight">Quick Paste Hub</h1>
             <p className="text-[10px] md:text-xs text-gray-400 font-bold uppercase mt-1">Parse orders and compare supplier pricelists instantly</p>
         </div>
         <div className="text-[9px] md:text-xs font-bold text-gray-500 bg-white border border-gray-200 px-3 py-1.5 rounded-full uppercase shadow-sm hidden sm:block">
             User: {currentUser}
         </div>
      </div>

      {/* TABS */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 border-b border-gray-200 custom-scrollbar">
          <button 
              onClick={() => setActiveTab('orders')} 
              className={`px-5 py-2.5 rounded-t-xl font-bold text-sm transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === 'orders' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-100'}`}
          >
              <ClipboardDocumentCheckIcon className="w-5 h-5" /> Order Paste
          </button>
          <button 
              onClick={() => setActiveTab('matrix')} 
              className={`px-5 py-2.5 rounded-t-xl font-bold text-sm transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === 'matrix' ? 'bg-purple-600 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-100'}`}
          >
              <ScaleIcon className="w-5 h-5" /> Supplier Price Matrix
          </button>
      </div>

      {/* ==========================================
          TAB 1: ORDER PASTE
          ========================================== */}
      {activeTab === 'orders' && (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-in fade-in">
          {/* LEFT: Paste Area */}
          <div className="lg:col-span-4 bg-white p-5 rounded-3xl shadow-sm border border-gray-100 flex flex-col min-h-[300px] lg:h-[calc(100vh-180px)]">
              <div className="flex justify-between items-center mb-3 flex-none">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                      Paste Order Text Here
                  </label>
                  <button 
                      onClick={async () => {
                          try {
                              const text = await navigator.clipboard.readText();
                              setOrderRawText(text);
                          } catch (err) {
                              alert('Unable to read clipboard. Please ensure browser permissions are granted, or paste manually using Ctrl+V or Cmd+V.');
                          }
                      }}
                      className="text-[9px] font-black bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-600 px-2 py-1.5 rounded-lg transition-colors flex items-center gap-1 uppercase"
                  >
                      <ClipboardDocumentIcon className="w-3 h-3" /> Paste
                  </button>
              </div>
              <textarea 
                  className="w-full flex-1 border border-gray-200 bg-gray-50 rounded-2xl p-4 text-[16px] md:text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-all placeholder-gray-300"
                  placeholder={`Example:\n*NEW CAFE BISTRO*\n012-3456789\n123 Jalan Bukit Bintang, KL\n24/02\n2CTN MANGO GOLD SUSU\n5PCS avocado`}
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
          <div className="lg:col-span-8 bg-white p-4 md:p-6 rounded-3xl shadow-xl border border-gray-100 flex flex-col min-h-[500px] lg:h-[calc(100vh-180px)] relative">
              
              {/* Dynamic Header Block */}
              <div className="flex flex-col gap-4 mb-6 flex-none bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  <div className="flex flex-col lg:flex-row gap-4">
                      <div className="flex-[2]">
                          <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Customer Selection</label>
                          <SearchableCustomerSelect 
                              selectedCustomerId={selectedCustomer}
                              customers={customers}
                              onSelect={(id) => {
                                  setSelectedCustomer(id);
                                  if (id === 'NEW') {
                                      setNewCustName('');
                                      setCustomerPrices([]);
                                  } else if (id) {
                                      const cust = customers.find(c => c.id.toString() === id);
                                      if (cust) {
                                          setNewCustPhone(cust.ContactNumber || '');
                                          setNewCustAddress(cust.DeliveryAddress || '');
                                          
                                          supabase.from('CustomerPrices').select('*').eq('CustomerName', cust.CompanyName).then(({data}) => {
                                              if (data) {
                                                  setCustomerPrices(data);
                                                  setParsedOrderItems(prev => prev.map(item => {
                                                      if (item.productCode && !item.isReplacement) {
                                                          const saved = data.find(cp => cp.ProductCode === item.productCode && cp.UOM === item.uom);
                                                          if (saved) return { ...item, price: saved.Price };
                                                      }
                                                      return item;
                                                  }));
                                              }
                                          });
                                      }
                                  } else {
                                      setCustomerPrices([]);
                                  }
                              }}
                          />
                      </div>
                      
                      {selectedCustomer === 'NEW' && (
                          <div className="flex-[1.5]">
                              <label className="block text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1.5">New Company Name *</label>
                              <input type="text" className="w-full p-2.5 rounded-xl border border-blue-200 text-[16px] md:text-sm focus:ring-2 focus:ring-blue-500 outline-none font-bold text-blue-900 bg-white" value={newCustName} onChange={e=>setNewCustName(e.target.value)} placeholder="e.g. BISTRO 123" />
                          </div>
                      )}

                      <div className="w-full lg:w-32">
                          <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Mode</label>
                          <select 
                              className="w-full border border-gray-200 bg-white p-2.5 rounded-xl text-[16px] md:text-sm font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              value={deliveryMode}
                              onChange={e => setDeliveryMode(e.target.value)}
                          >
                              <option value="Driver">Driver</option>
                              <option value="Lalamove">Lalamove</option>
                              <option value="Self Pick-up">Self Pick-up</option>
                          </select>
                      </div>
                      <div className="w-full lg:w-40">
                          <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Delivery Date</label>
                          <input 
                              type="date"
                              className="w-full border border-gray-200 bg-white p-2.5 rounded-xl text-[16px] md:text-sm font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              value={deliveryDate}
                              onChange={e => setDeliveryDate(e.target.value)}
                          />
                      </div>
                  </div>
                  
                  {/* Exposed Contact & Address Fields */}
                  <div className="flex flex-col lg:flex-row gap-4">
                      <div className="flex-1">
                          <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Phone Number</label>
                          <input type="text" className="w-full p-2.5 rounded-xl border border-gray-200 text-[16px] md:text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white" value={newCustPhone} onChange={e=>setNewCustPhone(e.target.value)} placeholder="e.g. 012-3456789" />
                      </div>
                      <div className="flex-[2]">
                          <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Delivery Address</label>
                          <input type="text" className="w-full p-2.5 rounded-xl border border-gray-200 text-[16px] md:text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white" value={newCustAddress} onChange={e=>setNewCustAddress(e.target.value)} placeholder="Full delivery address" />
                      </div>
                  </div>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
                  {parsedOrderItems.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-gray-300 border-2 border-dashed border-gray-100 rounded-2xl min-h-[200px]">
                          <ClipboardDocumentCheckIcon className="w-16 h-16 mb-4 opacity-20" />
                          <p className="font-bold text-sm">Paste text and click Parse</p>
                      </div>
                  ) : (
                      <>
                          {/* DESKTOP HEADER */}
                          <div className="hidden lg:flex gap-2 px-3 pb-2 border-b border-gray-100 text-[9px] font-black text-gray-400 uppercase tracking-wider">
                              <div className="w-1/5">Original Text</div>
                              <div className="flex-1">Matched Product</div>
                              <div className="w-16 text-center">Qty</div>
                              <div className="w-20 text-center">UOM</div>
                              <div className="w-20 text-center">Price</div>
                              <div className="w-16 text-right"></div>
                          </div>

                          {/* ITEMS LIST */}
                          {parsedOrderItems.map((item) => (
                              <div key={item.id} className={`flex flex-col p-3 rounded-xl border shadow-sm transition ${item.isReplacement ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-200 hover:border-blue-300'}`}>
                                  <div className="flex flex-col lg:flex-row gap-3 lg:gap-2 items-start lg:items-center w-full">
                                      {/* Original Text */}
                                      <div className="w-full lg:w-1/5 text-[10px] text-gray-500 italic truncate" title={item.rawLine}>
                                          "{item.rawLine}"
                                      </div>
                                      
                                      {/* Product Select (Flex-1 makes it stretch) */}
                                      <div className="w-full lg:flex-1">
                                          <SearchableProductSelect 
                                              item={item} 
                                              products={products} 
                                              onUpdate={(code) => updateOrderItem(item.id, 'productCode', code)} 
                                          />
                                      </div>

                                      {/* Qty, UOM, Price, Actions */}
                                      <div className="flex w-full lg:w-auto gap-2 items-end lg:items-center mt-1 lg:mt-0">
                                          <div className="flex-1 lg:w-16">
                                              <span className="lg:hidden text-[9px] font-bold text-gray-400 block mb-1 text-center">QTY</span>
                                              <input type="number" step="0.1" className="w-full p-2.5 border border-gray-200 rounded-lg text-[16px] md:text-xs font-black text-center focus:ring-2 focus:ring-blue-500" value={item.qty} onChange={e => updateOrderItem(item.id, 'qty', e.target.value)} />
                                          </div>
                                          <div className="flex-[1.5] lg:w-20">
                                              <span className="lg:hidden text-[9px] font-bold text-gray-400 block mb-1 text-center">UOM</span>
                                              <select className="w-full p-2.5 border border-gray-200 rounded-lg text-[16px] md:text-xs font-bold uppercase focus:ring-2 focus:ring-blue-500" value={item.uom} onChange={e => updateOrderItem(item.id, 'uom', e.target.value)}>
                                                  {(() => {
                                                      const matchedProd = products.find(p => p.ProductCode === item.productCode);
                                                      const validUoms = matchedProd && matchedProd.AllowedUOMs 
                                                          ? matchedProd.AllowedUOMs.split(',').map(u => u.trim().toUpperCase()).filter(Boolean)
                                                          : KNOWN_UOMS;
                                                      const options = Array.from(new Set([item.uom, ...validUoms])).filter(Boolean);
                                                      return options.map(u => <option key={u} value={u}>{u}</option>);
                                                  })()}
                                              </select>
                                          </div>
                                          
                                          {/* Price & Replacement Toggle */}
                                          <div className="flex-1 lg:w-20 flex flex-col items-center">
                                              <span className="lg:hidden text-[9px] font-bold text-gray-400 block mb-1 text-center">PRICE</span>
                                              <input 
                                                  type="number" step="0.01" 
                                                  className="w-full p-2.5 border border-gray-200 rounded-lg text-[16px] md:text-xs font-black text-center focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400" 
                                                  value={item.isReplacement ? 0 : item.price} 
                                                  onChange={e => updateOrderItem(item.id, 'price', e.target.value)} 
                                                  disabled={item.isReplacement}
                                              />
                                              <label className="flex items-center gap-1 mt-1.5 cursor-pointer">
                                                  <input 
                                                      type="checkbox" 
                                                      checked={item.isReplacement || false} 
                                                      onChange={e => updateOrderItem(item.id, 'isReplacement', e.target.checked)}
                                                      className="w-3 h-3 text-orange-500 rounded border-gray-300 focus:ring-orange-500"
                                                  />
                                                  <span className="text-[9px] font-black text-orange-600 uppercase tracking-widest">Replace</span>
                                              </label>
                                          </div>
                                          
                                          {/* Actions */}
                                          <div className="w-auto flex justify-end gap-1 pb-1.5 lg:pb-0 self-start lg:self-auto pt-4 lg:pt-0">
                                              <button 
                                                  onClick={() => updateOrderItem(item.id, 'showNotes', !item.showNotes)} 
                                                  className={`p-1.5 rounded-lg transition ${item.showNotes || item.notes ? 'text-blue-600 bg-blue-50 hover:bg-blue-100' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'}`}
                                                  title="Toggle Notes"
                                              >
                                                  <DocumentTextIcon className="w-4 h-4 md:w-5 md:h-5 inline" />
                                              </button>
                                              <button 
                                                  onClick={() => removeOrderItem(item.id)} 
                                                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                                                  title="Remove Item"
                                              >
                                                  <TrashIcon className="w-4 h-4 md:w-5 md:h-5 inline" />
                                              </button>
                                          </div>
                                      </div>
                                  </div>
                                  
                                  {/* CONDITIONAL NOTES INPUT */}
                                  {item.showNotes && (
                                      <div className="mt-2 pl-0 lg:pl-[20%] lg:pr-[240px] animate-in fade-in slide-in-from-top-2">
                                          <input 
                                              type="text" 
                                              placeholder="Add special notes for this item (e.g. masak sikit)..." 
                                              className="w-full bg-blue-50/50 border border-blue-200 text-[16px] md:text-xs font-medium text-blue-800 focus:ring-1 focus:ring-blue-400 outline-none p-2.5 rounded-lg placeholder-blue-300"
                                              value={item.notes || ''}
                                              onChange={e => updateOrderItem(item.id, 'notes', e.target.value)}
                                              autoFocus
                                          />
                                      </div>
                                  )}
                              </div>
                          ))}
                          <button onClick={addBlankOrderItem} className="w-full py-3 border-2 border-dashed border-gray-200 text-gray-400 font-bold rounded-xl hover:border-blue-400 hover:text-blue-500 transition flex items-center justify-center gap-2 text-xs mt-2">
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
          TAB 2: SUPPLIER PRICE MATRIX
          ========================================== */}
      {activeTab === 'matrix' && (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-in fade-in">
          {/* LEFT: Supplier Pricelist Input */}
          <div className="lg:col-span-4 bg-white p-5 rounded-3xl shadow-sm border border-purple-100 flex flex-col min-h-[420px] lg:h-[calc(100vh-180px)]">
              <div className="mb-4">
                  <label className="block text-[10px] font-black text-purple-500 uppercase tracking-widest mb-1.5">
                      Supplier Name
                  </label>
                  <input
                      list="supplier-matrix-suggestions"
                      type="text"
                      value={matrixSupplierName}
                      onChange={e => setMatrixSupplierName(e.target.value)}
                      placeholder="e.g. Longxing"
                      className="w-full border border-purple-200 bg-purple-50/40 p-3 rounded-xl text-[16px] md:text-sm font-bold text-purple-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <datalist id="supplier-matrix-suggestions">
                      {suppliers.map(s => (
                          <option key={s.SupplierName} value={s.SupplierName} />
                      ))}
                  </datalist>
              </div>

              <div className="flex justify-between items-center mb-3 flex-none">
                  <label className="text-[10px] font-black text-purple-500 uppercase tracking-widest">
                      Paste Supplier Pricelist
                  </label>
                  <button 
                      onClick={async () => {
                          try {
                              const text = await navigator.clipboard.readText();
                              setMatrixRawText(text);
                          } catch (err) {
                              alert('Unable to read clipboard. Please ensure browser permissions are granted, or paste manually using Ctrl+V or Cmd+V.');
                          }
                      }}
                      className="text-[9px] font-black bg-purple-50 text-purple-600 hover:bg-purple-100 px-2 py-1.5 rounded-lg transition-colors flex items-center gap-1 uppercase"
                  >
                      <ClipboardDocumentIcon className="w-3 h-3" /> Paste
                  </button>
              </div>

              <textarea 
                  className="w-full flex-1 border border-purple-200 bg-purple-50/30 rounded-2xl p-4 text-[16px] md:text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none transition-all placeholder-purple-300"
                  placeholder={`Example:
*2026年05月12日价目表*

*🥦通用菜CommonVege*
西兰花Broccoli7kg:50
白花Cauliflower12kg:70
白萝卜LobakPutih10kg:

*🥬精品菜 Longxing Premium*
油麦菜YaoMak300gx13:45`}
                  value={matrixRawText}
                  onChange={e => setMatrixRawText(e.target.value)}
              />

              <button 
                  onClick={handleAddSupplierPricelist}
                  className="w-full mt-4 bg-purple-600 hover:bg-purple-700 text-white font-bold py-4 rounded-xl shadow-lg active:scale-95 flex items-center justify-center gap-2 transition flex-none"
              >
                  <CurrencyDollarIcon className="w-5 h-5" /> Parse & Add Supplier
              </button>

              {matrixNotice && (
                  <div className="mt-3 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                      {matrixNotice}
                  </div>
              )}

              <div className="mt-5 pt-4 border-t border-purple-100 min-h-[120px] overflow-y-auto custom-scrollbar">
                  <div className="flex items-center justify-between mb-3">
                      <h3 className="text-[10px] font-black text-purple-500 uppercase tracking-widest">
                          Added Suppliers
                      </h3>
                      {supplierPriceLists.length > 0 && (
                          <button
                              onClick={handleClearSupplierMatrix}
                              className="text-[9px] font-black text-gray-400 hover:text-red-500 uppercase transition"
                          >
                              Clear All
                          </button>
                      )}
                  </div>

                  {supplierPriceLists.length === 0 ? (
                      <div className="text-xs font-bold text-gray-300 border border-dashed border-purple-100 rounded-xl p-4 text-center">
                          Add at least two supplier lists to unlock side-by-side comparison.
                      </div>
                  ) : (
                      <div className="space-y-2">
                          {supplierPriceLists.map(supplier => (
                              <div key={supplier.supplierName} className="bg-purple-50/50 border border-purple-100 rounded-xl p-3 flex justify-between items-start gap-3">
                                  <div className="min-w-0">
                                      <div className="font-black text-xs text-purple-900 uppercase truncate">
                                          {supplier.supplierName}
                                      </div>
                                      <div className="text-[10px] font-bold text-purple-500 mt-1">
                                          {supplier.pricedItems} priced / {supplier.totalItems} parsed
                                          {supplier.detectedDate ? ` • ${supplier.detectedDate}` : ''}
                                      </div>
                                  </div>
                                  <button
                                      onClick={() => handleRemoveSupplierPricelist(supplier.supplierName)}
                                      className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition shrink-0"
                                      title="Remove supplier"
                                  >
                                      <TrashIcon className="w-4 h-4" />
                                  </button>
                              </div>
                          ))}
                      </div>
                  )}
              </div>
          </div>

          {/* RIGHT: Supplier Matrix */}
          <div className="lg:col-span-8 bg-white p-4 md:p-6 rounded-3xl shadow-xl border border-purple-100 flex flex-col min-h-[650px] lg:h-[calc(100vh-180px)] relative">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5 flex-none">
                  <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4 text-center">
                      <div className="text-[9px] font-black text-purple-500 uppercase tracking-widest">Suppliers</div>
                      <div className="text-2xl font-black text-purple-900 mt-1">{supplierMatrixSummary.suppliersCompared}</div>
                  </div>
                  <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-center">
                      <div className="text-[9px] font-black text-blue-500 uppercase tracking-widest">Matrix Products</div>
                      <div className="text-2xl font-black text-blue-900 mt-1">{supplierMatrixSummary.matrixProducts}</div>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-center">
                      <div className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">2+ Quotes</div>
                      <div className="text-2xl font-black text-emerald-900 mt-1">{supplierMatrixSummary.comparableProducts}</div>
                  </div>
                  <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 text-center">
                      <div className="text-[9px] font-black text-orange-500 uppercase tracking-widest">Biggest Spread</div>
                      <div className="text-2xl font-black text-orange-900 mt-1">RM {Number(supplierMatrixSummary.biggestSpread || 0).toFixed(2)}</div>
                  </div>
              </div>

              {/* Filters */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-5 flex-none">
                  <div className="relative">
                      <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-3 top-3.5" />
                      <input
                          type="text"
                          value={matrixSearchTerm}
                          onChange={e => setMatrixSearchTerm(e.target.value)}
                          placeholder="Search product..."
                          className="w-full pl-10 pr-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-[16px] md:text-xs font-bold focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                  </div>

                  <select
                      value={matrixCategoryFilter}
                      onChange={e => setMatrixCategoryFilter(e.target.value)}
                      className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-[16px] md:text-xs font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                      <option value="all">All Categories</option>
                      {supplierMatrixCategories.map(category => (
                          <option key={category} value={category}>{category}</option>
                      ))}
                  </select>

                  <select
                      value={matrixViewFilter}
                      onChange={e => setMatrixViewFilter(e.target.value)}
                      className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-[16px] md:text-xs font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                      <option value="all">Show All Items</option>
                      <option value="comparable">Only 2+ Quotes</option>
                      <option value="spread">Only With Price Spread</option>
                  </select>

                  <select
                      value={matrixSortBy}
                      onChange={e => setMatrixSortBy(e.target.value)}
                      className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-[16px] md:text-xs font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                      <option value="category">Sort: Category</option>
                      <option value="spread">Sort: Biggest Spread</option>
                      <option value="lowest">Sort: Lowest Price</option>
                      <option value="name">Sort: Product Name</option>
                  </select>
              </div>

              {/* Matrix Table */}
              <div className="flex-1 overflow-auto custom-scrollbar border border-purple-100 rounded-2xl">
                  {supplierMatrixRows.length === 0 ? (
                      <div className="h-full min-h-[360px] flex flex-col items-center justify-center text-purple-200">
                          <ScaleIcon className="w-16 h-16 mb-4 opacity-30" />
                          <p className="font-bold text-sm text-purple-300">Paste supplier pricelists to build the comparison matrix</p>
                      </div>
                  ) : (
                      <table className="w-full text-left whitespace-nowrap min-w-max">
                          <thead className="sticky top-0 z-20 bg-purple-50 border-b border-purple-100 text-[9px] font-black text-purple-500 uppercase tracking-wider">
                              <tr>
                                  <th className="p-4 pl-5">Category</th>
                                  <th className="p-4">中文名</th>
                                  <th className="p-4">Name</th>
                                  <th className="p-4">UOM</th>
                                  {supplierMatrixSupplierNames.map(supplier => (
                                      <th key={supplier} className="p-4 text-right">{supplier}</th>
                                  ))}
                                  <th className="p-4 text-right text-emerald-600">Lowest</th>
                                  <th className="p-4 text-right text-orange-600">Spread</th>
                                  <th className="p-4 pr-5 text-right text-purple-700">Best Supplier</th>
                              </tr>
                          </thead>

                          <tbody className="divide-y divide-purple-50 text-xs font-bold text-gray-700">
                              {filteredSupplierMatrixRows.map(row => (
                                  <tr key={row.key} className="hover:bg-purple-50/30 transition-colors">
                                      <td className="p-4 pl-5">
                                          <span className="inline-flex px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-[10px] font-black">
                                              {row.category}
                                          </span>
                                      </td>
                                      <td className="p-4 text-gray-600">{row.chineseName}</td>
                                      <td className="p-4 text-gray-900 font-black">{row.name}</td>
                                      <td className="p-4 text-gray-500">{row.uom}</td>

                                      {supplierMatrixSupplierNames.map(supplier => {
                                          const price = row.supplierPrices[supplier];
                                          const isBest = Number.isFinite(price) && row.lowestPrice !== null && price === row.lowestPrice;

                                          return (
                                              <td
                                                  key={`${row.key}-${supplier}`}
                                                  className={`p-4 text-right ${isBest ? 'bg-emerald-50/60 text-emerald-700 font-black' : 'text-gray-600'}`}
                                                  title={row.rawLines[supplier] || ''}
                                              >
                                                  {Number.isFinite(price) ? `RM ${Number(price).toFixed(2)}` : '—'}
                                              </td>
                                          );
                                      })}

                                      <td className="p-4 text-right text-emerald-700 font-black">
                                          {row.lowestPrice !== null ? `RM ${Number(row.lowestPrice).toFixed(2)}` : '—'}
                                      </td>
                                      <td className="p-4 text-right text-orange-600 font-black">
                                          {row.spread !== null ? `RM ${Number(row.spread).toFixed(2)}` : '—'}
                                      </td>
                                      <td className="p-4 pr-5 text-right text-purple-700 font-black">
                                          {row.bestSupplierLabel}
                                      </td>
                                  </tr>
                              ))}

                              {filteredSupplierMatrixRows.length === 0 && (
                                  <tr>
                                      <td
                                          colSpan={supplierMatrixSupplierNames.length + 7}
                                          className="p-12 text-center text-gray-400 italic font-bold"
                                      >
                                          No matrix rows match the current filters.
                                      </td>
                                  </tr>
                              )}
                          </tbody>
                      </table>
                  )}
              </div>
          </div>
      </div>
      )}

    </div>
  );
}