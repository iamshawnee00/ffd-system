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
  ScaleIcon,
  DocumentTextIcon,
  ChevronLeftIcon,
  ClipboardIcon,
  XMarkIcon
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
    const [isClosing, setIsClosing] = useState(false); // Ghost click shield
    const [search, setSearch] = useState('');

    const closeDropdown = () => {
        setIsClosing(true);
        // Hide visually immediately, but keep overlay active for 350ms to absorb mobile ghost clicks
        setTimeout(() => {
            setIsOpen(false);
            setIsClosing(false);
            setSearch('');
        }, 350); 
    };

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
                className={`w-full p-2.5 rounded-xl text-base md:text-sm font-bold focus:outline-none cursor-pointer flex justify-between items-center active:scale-[0.98] transition-transform ${!selectedCustomerId ? 'bg-red-50 text-red-700' : (selectedCustomerId === 'NEW' ? 'bg-blue-50 text-blue-700' : 'bg-transparent text-gray-800')}`}
            >
                <span className="truncate pr-5">{displayName}</span>
                <span className="text-gray-400 text-xs shrink-0 ml-1">▼</span>
            </div>
            
            {isOpen && (
                <>
                    {/* The Shield: Remains in DOM to block clicks, but becomes invisible during closing */}
                    <div 
                        className={`fixed inset-0 z-40 transition-opacity duration-200 ${isClosing ? 'bg-transparent opacity-0' : 'bg-black/20 backdrop-blur-sm opacity-100'}`} 
                        onClick={(e) => { e.stopPropagation(); closeDropdown(); }}
                    ></div>
                    
                    {/* The Menu: Disappears instantly when isClosing is true */}
                    <div 
                        className={`absolute z-50 w-full mt-2 bg-white border border-gray-100 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-top-2 duration-200 ${isClosing ? 'hidden' : 'flex flex-col'}`} 
                        style={{ maxHeight: '350px' }}
                    >
                        <div className="p-2 border-b border-gray-100 bg-gray-50/80 backdrop-blur-md sticky top-0">
                            <input 
                                type="text"
                                autoFocus
                                placeholder="Search customer or branch..."
                                className="w-full p-3 border border-gray-200 rounded-xl text-base md:text-sm outline-none focus:ring-2 focus:ring-blue-500 font-medium bg-white shadow-inner"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                        <div className="overflow-y-auto flex-1 custom-scrollbar">
                            <div 
                                className="p-4 hover:bg-blue-50 cursor-pointer text-base md:text-sm font-bold text-blue-600 border-b border-gray-50 active:bg-blue-100 transition-colors"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    onSelect('NEW');
                                    closeDropdown();
                                }}
                            >
                                ➕ ADD NEW CUSTOMER (GUEST)
                            </div>
                            <div 
                                className="p-4 hover:bg-red-50 cursor-pointer text-base md:text-sm font-bold text-red-500 border-b border-gray-50 active:bg-red-100 transition-colors"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    onSelect('');
                                    closeDropdown();
                                }}
                            >
                                -- CLEAR SELECTION --
                            </div>
                            {filteredCustomers.map(c => (
                                <div 
                                    key={c.id}
                                    className="p-4 hover:bg-gray-50 cursor-pointer text-base md:text-sm font-bold text-gray-700 border-b border-gray-50 last:border-0 active:bg-gray-100 transition-colors"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        onSelect(c.id.toString());
                                        closeDropdown();
                                    }}
                                >
                                    {c.Branch ? `${c.CompanyName} - ${c.Branch}` : c.CompanyName}
                                </div>
                            ))}
                            {filteredCustomers.length === 0 && (
                                <div className="p-6 text-center text-sm text-gray-400 italic">No customers found</div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

// Custom Searchable Product Dropdown Component
function SearchableProductSelect({ item, products, onUpdate, onOpenChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const [isClosing, setIsClosing] = useState(false); // Ghost click shield
    const [search, setSearch] = useState('');

    const toggleOpen = (state) => {
        setIsOpen(state);
        if (onOpenChange) onOpenChange(state);
    };

    const closeDropdown = () => {
        setIsClosing(true);
        // Hide visually immediately, but keep overlay active for 350ms to absorb mobile ghost clicks
        setTimeout(() => {
            toggleOpen(false);
            setIsClosing(false);
            setSearch('');
        }, 350);
    };

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
                onClick={() => toggleOpen(!isOpen)}
                className={`w-full text-base md:text-xs font-bold p-3 md:p-2.5 rounded-xl md:rounded-lg border cursor-pointer flex justify-between items-center active:scale-[0.98] transition-transform ${!item.productCode ? 'border-red-300 bg-red-50 text-red-700' : 'border-gray-200 bg-white text-gray-800 shadow-sm md:shadow-none'}`}
            >
                <span className="truncate pr-8">{displayName}</span>
                <span className="text-gray-400 text-[10px] shrink-0 ml-1">▼</span>
            </div>
            
            {!item.productCode && !isOpen && <ExclamationTriangleIcon className="w-5 h-5 md:w-4 md:h-4 text-red-500 absolute right-8 md:right-8 top-3 md:top-2 pointer-events-none" />}
            {item.productCode && !isOpen && <CheckCircleIcon className="w-5 h-5 md:w-4 md:h-4 text-green-500 absolute right-8 md:right-8 top-3 md:top-2 pointer-events-none" />}

            {isOpen && (
                <>
                    {/* The Shield */}
                    <div 
                        className={`fixed inset-0 z-40 transition-opacity duration-200 ${isClosing ? 'bg-transparent opacity-0' : 'bg-black/20 backdrop-blur-sm opacity-100'}`} 
                        onClick={(e) => { e.stopPropagation(); closeDropdown(); }}
                    ></div>
                    
                    {/* The Menu */}
                    <div 
                        className={`absolute z-50 w-full mt-2 bg-white border border-gray-100 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-top-2 duration-200 ${isClosing ? 'hidden' : 'flex flex-col'}`} 
                        style={{ maxHeight: '280px', minWidth: '220px' }}
                    >
                        <div className="p-2 border-b border-gray-100 bg-gray-50/80 backdrop-blur-md sticky top-0 flex gap-2">
                            <input 
                                type="text"
                                autoFocus
                                placeholder="Search product..."
                                className="w-full p-3 border border-gray-200 rounded-xl text-base md:text-xs outline-none focus:ring-2 focus:ring-blue-500 font-medium bg-white shadow-inner"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                            />
                            {search && (
                                <button onClick={() => setSearch('')} className="p-3 text-gray-400 hover:text-gray-600 bg-gray-100 rounded-xl active:bg-gray-200">
                                    <XMarkIcon className="w-5 h-5" />
                                </button>
                            )}
                        </div>
                        <div className="overflow-y-auto flex-1 custom-scrollbar">
                            <div 
                                className="p-4 md:p-3 hover:bg-red-50 cursor-pointer text-base md:text-xs font-bold text-red-500 border-b border-gray-50 active:bg-red-100 transition-colors"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    onUpdate('');
                                    closeDropdown();
                                }}
                            >
                                -- CLEAR MATCH --
                            </div>
                            {filteredProducts.map(p => (
                                <div 
                                    key={p.ProductCode}
                                    className="p-4 md:p-3 hover:bg-gray-50 cursor-pointer text-base md:text-xs font-bold text-gray-700 border-b border-gray-50 last:border-0 active:bg-gray-100 transition-colors"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        onUpdate(p.ProductCode);
                                        closeDropdown();
                                    }}
                                >
                                    {p.ProductName}
                                </div>
                            ))}
                            {filteredProducts.length === 0 && (
                                <div className="p-6 text-center text-sm text-gray-400 italic font-medium">No products found</div>
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
  
  // Mobile Step State (1 = Paste Text, 2 = Review Data)
  const [mobileStep, setMobileStep] = useState(1);
  
  // Dropdown Elevate State (Fixes z-index overlap bugs)
  const [activeOrderDropdown, setActiveOrderDropdown] = useState(null);
  const [activePriceDropdown, setActivePriceDropdown] = useState(null);

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
  
  // Customer Contact State
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');

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
      setPriceDate(getLocalDateString(new Date())); 
    }
    loadData();
  }, [router]);

  const calculateDefaultDate = () => {
      const now = new Date();
      const hour = now.getHours();
      const targetDate = new Date(now);
      if (hour >= 12) targetDate.setDate(targetDate.getDate() + 1);
      return getLocalDateString(targetDate);
  };

  const handlePasteFromClipboard = async (setTextFunction, textAreaId) => {
      try {
          if (navigator.clipboard && navigator.clipboard.readText) {
              const text = await navigator.clipboard.readText();
              if (text) {
                  setTextFunction(prev => prev + (prev ? '\n\n' : '') + text);
                  return; 
              }
          }
          throw new Error("Clipboard API missing or empty");
      } catch (err) {
          console.error("Clipboard access error:", err);
          // Auto-focus the text area and kindly request native long-press paste
          alert("Clipboard access is restricted by your browser due to security.\n\nPlease LONG-PRESS inside the text box below and select 'Paste' manually.");
          const ta = document.getElementById(textAreaId);
          if (ta) ta.focus();
      }
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
              if (lineTokens.length > 0) score = (matches / lineTokens.length) * 60;
              if (branchName) {
                  const bTokens = branchName.replace(/[^\w\s]/g, ' ').split(' ').filter(t => t.length > 1);
                  let bMatches = 0;
                  lineTokens.forEach(t => { if (bTokens.some(dt => dt.includes(t) || t.includes(dt))) bMatches++; });
                  if (bTokens.length > 0 && bMatches > 0) score += (bMatches / bTokens.length) * 30; 
              }
          }
          if (score > highestScore) { highestScore = score; bestMatch = c; }
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
                  if (prodWords.includes(rw)) { matchedWordsLength += rw.length; exactWordMatches++; } 
                  else if (rw.length > 2 && prodWords.some(pw => pw.includes(rw) || rw.includes(pw))) { matchedWordsLength += rw.length * 0.7; }
              });

              if (totalRawLength > 0) {
                  score = (matchedWordsLength / totalRawLength) * 60;
                  if (exactWordMatches > 0) score += (exactWordMatches / rawWords.length) * 20;
              }
          }
          if (score >= 35 && historyCodesSet.has(p.ProductCode)) score += 40; 
          if (score > highestScore) { highestScore = score; bestMatch = p; }
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

      lines[0] = lines[0].replace(/^\*+/, '').replace(/\*+$/, '').trim();
      const firstLine = lines[0];

      let startIndex = 0;
      let matchedCust = findBestCustomerMatch(firstLine, customers);
      let customerHistoryCodes = new Set();
      
      setNewCustName('');
      setNewCustPhone('');
      setNewCustAddress('');

      if (matchedCust) {
          setSelectedCustomer(matchedCust.id.toString());
          setNewCustPhone(matchedCust.ContactNumber || '');
          setNewCustAddress(matchedCust.DeliveryAddress || '');
          startIndex = 1; 
          
          const safeSearchName = (matchedCust.CompanyName || '').split(' ')[0].replace(/[^\w\s]/g, '');
          const { data: hist } = await supabase.from('Orders').select('"Product Code"').ilike('Customer Name', `%${safeSearchName}%`).order('Timestamp', { ascending: false }).limit(200);
          if (hist) hist.forEach(h => customerHistoryCodes.add(h["Product Code"]));
      } else {
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
      const endQtyUomPriceRegex = new RegExp(`(?:[\\s\\-@xX,]+|^)([\\d.]+)\\s*(${uomPattern})(?:[\\s\\-@xX]*(?:RM|rm)?\\s*([\\d.]+))?\\s*$`, 'i');
      const startQtyUomRegex = new RegExp(`^([\\d.]+)\\s*(${uomPattern})\\b(?:[\\s\\-@xX,]+(.*))?$`, 'i');

      let extractedPhone = '';
      let extractedAddress = '';
      let inHeader = true; 

      const newItems = [];
      for (let i = startIndex; i < lines.length; i++) {
          let line = lines[i];
          line = line.replace(/^\*+/, '').replace(/\*+$/, '').trim();
          
          const dateMatch = line.match(/^\s*(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{2,4}))?\s*$/);
          if (dateMatch) {
              let [_, day, month, year] = dateMatch;
              if (!year) year = new Date().getFullYear().toString();
              else if (year.length === 2) year = '20' + year; 
              const parsedDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
              if (!isNaN(parsedDate)) { setDeliveryDate(getLocalDateString(parsedDate)); continue; }
          }

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
                  if (line.length > 2) extractedAddress += (extractedAddress ? ', ' : '') + line;
                  continue;
              }
          }
          
          let cleanLine = line.replace(/^[-*•\s]+|^\d+\.\s+/, '').trim();
          let bracketNote = '';
          const bracketMatch = cleanLine.match(/\s*(\(.*?\))\s*$/);
          if (bracketMatch) {
              bracketNote = bracketMatch[1];
              cleanLine = cleanLine.substring(0, bracketMatch.index).trim();
          }
          
          let qty = 1; let uom = ''; let price = 0; let rawName = cleanLine;

          const endMatch = rawName.match(endQtyUomPriceRegex);
          if (endMatch) {
              qty = parseFloat(endMatch[1]); uom = endMatch[2].toUpperCase();
              if (endMatch[3]) price = parseFloat(endMatch[3]);
              rawName = rawName.substring(0, endMatch.index).trim();
          } else {
              const startMatch = rawName.match(startQtyUomRegex);
              if (startMatch) {
                  qty = parseFloat(startMatch[1]); uom = startMatch[2].toUpperCase();
                  rawName = (startMatch[3] || '').trim();
                  const pMatch = rawName.match(/\s+[- \t@xX]*(?:RM|rm)?\s*(\d+(?:\.\d{1,2})?)\s*$/i);
                  if (pMatch) { price = parseFloat(pMatch[1]); rawName = rawName.substring(0, pMatch.index).trim(); }
              } else {
                  const qtyMatch = rawName.match(/(?:[\s\-@xX,]+|^)([\d.]+)\s*$/i);
                  if (qtyMatch) { qty = parseFloat(qtyMatch[1]); rawName = rawName.substring(0, qtyMatch.index).trim(); }
                  const pMatch = rawName.match(/\s+[- \t@xX]*(?:RM|rm)?\s*(\d+(?:\.\d{1,2})?)\s*$/i);
                  if (pMatch) { price = parseFloat(pMatch[1]); rawName = rawName.substring(0, pMatch.index).trim(); }
              }
          }

          rawName = rawName.replace(/^[-:]+\s*/, '').replace(/\s*[-:]+$/, '').trim();
          rawName = rawName + (bracketNote ? ' ' + bracketNote : '');

          const bestProduct = findBestProductMatch(rawName, customerHistoryCodes);
          let finalUom = uom || 'KG'; 
          
          if (bestProduct) {
              const allowedUoms = bestProduct.AllowedUOMs ? bestProduct.AllowedUOMs.split(',').map(u => u.trim().toUpperCase()).filter(Boolean) : [bestProduct.BaseUOM?.toUpperCase() || 'KG'];
              if (!allowedUoms.includes(finalUom)) finalUom = bestProduct.BaseUOM || allowedUoms[0] || 'KG';
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
      setMobileStep(2); // Proceed to review step
  };

  // ==========================================
  // 2. SUPPLIER PRICE PARSING
  // ==========================================
  const handleParsePrice = () => {
      if (!priceRawText.trim()) return;

      const lines = priceRawText.split('\n').map(l => l.trim()).filter(l => l !== '');
      const newItems = [];
      const uomPattern = KNOWN_UOMS.join('|');
      const uomRegex = new RegExp(`(\\d+(?:\\.\\d+)?\\s*(?:${uomPattern})(?:\\s*[xX\\*]\\s*\\d+\\s*[a-zA-Z]+)?)`, 'i');

      lines.forEach((line, i) => {
          if (line.startsWith('*') || line.toLowerCase().includes('price:')) return;

          const match = line.match(uomRegex);
          if (match) {
              const uomStr = match[1];
              const namePart = line.substring(0, match.index).trim();
              const afterPart = line.substring(match.index + uomStr.length).trim();

              const priceMatch = afterPart.match(/(\d+(?:\.\d+)?)/);
              if (priceMatch) {
                  const price = parseFloat(priceMatch[1]);
                  const cleanName = namePart.replace(/[^\w\s\u4e00-\u9fa5]/g, '').trim();
                  const bestProduct = findBestProductMatch(cleanName);

                  let finalUom = uomStr.toUpperCase();
                  if (bestProduct) {
                      const allowedUoms = bestProduct.AllowedUOMs ? bestProduct.AllowedUOMs.split(',').map(u => u.trim().toUpperCase()).filter(Boolean) : [bestProduct.BaseUOM?.toUpperCase() || 'KG'];
                      if (!allowedUoms.includes(finalUom)) finalUom = bestProduct.BaseUOM || allowedUoms[0] || 'KG';
                  }

                  if (bestProduct && price > 0) {
                      newItems.push({ id: Date.now() + i, rawLine: line, productCode: bestProduct.ProductCode, productName: bestProduct.ProductName, uom: finalUom, price: price });
                  }
              }
          }
      });

      setParsedPriceItems(newItems);
      setMobileStep(2); // Proceed to review step
  };

  const handleCompareSearch = async (productCode) => {
      if (!productCode) return;
      setIsComparing(true);
      const { data, error } = await supabase.from('Purchase').select('Supplier, CostPrice, PurchaseUOM, Timestamp, InvoiceNumber').eq('ProductCode', productCode).order('Timestamp', { ascending: false }).limit(30);
      if (!error && data) setCompareResults(data);
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
          const proceed = confirm("Some items are missing a matched product. Do you want to remove them and proceed?");
          if (!proceed) return;
      }

      setIsSubmittingOrder(true);
      const validItems = parsedOrderItems.filter(i => i.productCode);

      let finalCustomerName = '';
      let finalContactPerson = '';

      if (selectedCustomer === 'NEW') {
          if (!newCustName.trim()) { setIsSubmittingOrder(false); return alert("Please enter the new customer's name."); }
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
              "Timestamp": new Date(), "Status": "Pending", "DONumber": doNumber, "Delivery Date": deliveryDate, "Delivery Mode": deliveryMode, "Customer Name": finalCustomerName, "Delivery Address": finalDeliveryAddress, "Contact Person": finalContactPerson, "Contact Number": finalContactNumber, "Product Code": item.productCode, "Order Items": prod.ProductName, "Quantity": item.qty, "UOM": item.uom, "Price": item.isReplacement ? 0 : (Number(item.price) || 0), "Replacement": repVal, "LoggedBy": currentUser, "SpecialNotes": finalNotes
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
          "Timestamp": new Date(`${priceDate}T12:00:00`), "ProductCode": item.productCode, "ProductName": item.productName, "Supplier": selectedSupplier, "PurchaseQty": 0, "PurchaseUOM": item.uom, "CostPrice": item.price, "InvoiceNumber": "PRICE_LIST", "LoggedBy": currentUser
      }));

      const { error } = await supabase.from('Purchase').insert(purchaseRows);

      if (error) {
          alert("Error saving price: " + error.message);
      } else {
          alert("Prices Logged Successfully!");
          setParsedPriceItems([]);
          setPriceRawText('');
          setMobileStep(1); // Go back to paste on success
      }
      setIsSubmittingPrice(false);
  };

  // Render Helpers (Optimized to perform single pass state updates)
  const updateOrderItem = (id, field, value) => {
      setParsedOrderItems(prev => prev.map(item => {
          if (item.id === id) {
              let updated = { ...item, [field]: value };
              if (field === 'productCode') {
                  const prod = products.find(p => p.ProductCode === value);
                  if (prod) updated.uom = prod.BaseUOM;
              }
              return updated;
          }
          return item;
      }));
  };
  
  const removeOrderItem = (id) => setParsedOrderItems(prev => prev.filter(item => item.id !== id));
  const addBlankOrderItem = () => setParsedOrderItems(prev => [...prev, { id: Date.now(), rawLine: 'Manual Entry', qty: 1, uom: 'KG', price: 0, productCode: '', notes: '', showNotes: false, isReplacement: false }]);
  
  const updatePriceItem = (id, field, value) => {
      setParsedPriceItems(prev => prev.map(item => {
          if (item.id === id) {
              let updated = { ...item, [field]: value };
              if (field === 'productCode') {
                  const prod = products.find(p => p.ProductCode === value);
                  if (prod) updated.uom = prod.BaseUOM;
              }
              return updated;
          }
          return item;
      }));
  };
  
  const removePriceItem = (id) => setParsedPriceItems(prev => prev.filter(item => item.id !== id));

  if (loading) return <div className="p-10 flex items-center justify-center h-screen text-gray-400 font-black tracking-widest animate-pulse">FFD SYSTEM ENGINE BOOTING...</div>;

  return (
    <div className="p-3 md:p-8 max-w-full overflow-x-hidden min-h-[100dvh] bg-gray-50/50 pb-32 md:pb-6 animate-in fade-in duration-300 relative">
      
      {/* HEADER (Always visible) */}
      <div className="mb-4 md:mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
         <div>
             <h1 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight">Quick Paste Hub</h1>
             <p className="text-[10px] md:text-xs text-gray-400 font-bold uppercase mt-1">Parse orders and supplier prices instantly</p>
         </div>
      </div>

      {/* MOBILE iOS-STYLE SEGMENTED TABS (Hide on mobile Step 2) */}
      <div className={`md:hidden flex bg-gray-200/80 p-1 rounded-xl mb-4 shrink-0 shadow-inner ${mobileStep === 2 ? 'hidden' : 'flex'}`}>
         <button onClick={() => setActiveTab('orders')} className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all ${activeTab === 'orders' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Order Paste</button>
         <button onClick={() => setActiveTab('prices')} className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all ${activeTab === 'prices' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Price Paste</button>
         <button onClick={() => setActiveTab('compare')} className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all ${activeTab === 'compare' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Compare</button>
      </div>

      {/* DESKTOP TABS */}
      <div className="hidden md:flex gap-2 mb-6 overflow-x-auto pb-2 border-b border-gray-200">
          <button onClick={() => {setActiveTab('orders'); setMobileStep(1);}} className={`px-5 py-2.5 rounded-t-xl font-bold text-sm transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === 'orders' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-100'}`}>
              <ClipboardDocumentCheckIcon className="w-5 h-5" /> Order Paste
          </button>
          <button onClick={() => {setActiveTab('prices'); setMobileStep(1);}} className={`px-5 py-2.5 rounded-t-xl font-bold text-sm transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === 'prices' ? 'bg-purple-600 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-100'}`}>
              <CurrencyDollarIcon className="w-5 h-5" /> Price Paste
          </button>
          <button onClick={() => {setActiveTab('compare'); setMobileStep(1);}} className={`px-5 py-2.5 rounded-t-xl font-bold text-sm transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === 'compare' ? 'bg-orange-500 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-100'}`}>
              <ScaleIcon className="w-5 h-5" /> Compare Prices
          </button>
      </div>

      {/* ==========================================
          TAB 1: ORDER PASTE
          ========================================== */}
      {activeTab === 'orders' && (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT / STEP 1: Paste Area */}
          <div className={`lg:col-span-4 bg-white p-4 md:p-5 rounded-2xl md:rounded-3xl shadow-sm border border-gray-100 flex-col min-h-[50vh] lg:min-h-[300px] lg:h-[calc(100vh-180px)] animate-in fade-in zoom-in-95 duration-200 ${mobileStep === 2 ? 'hidden lg:flex' : 'flex'}`}>
              <div className="flex justify-between items-center mb-3 flex-none">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                      Paste Order Text Here
                  </label>
                  <div className="flex gap-2">
                      {orderRawText && (
                          <button onClick={() => setOrderRawText('')} className="text-[10px] font-bold text-red-500 bg-red-50 px-2 py-1 rounded hover:bg-red-100 transition active:scale-95">Clear</button>
                      )}
                      
                      <button onClick={() => handlePasteFromClipboard(setOrderRawText, 'order-paste-textarea')} className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-200 hover:bg-blue-100 transition active:scale-95 flex items-center gap-1">
                          <ClipboardIcon className="w-3 h-3" /> Paste
                      </button>
                      
                  </div>
              </div>
              <textarea 
                  id="order-paste-textarea"
                  className="w-full flex-1 border border-gray-200 bg-gray-50/50 rounded-2xl p-4 text-base md:text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-all placeholder-gray-300 shadow-inner"
                  placeholder={`Example:\n*NEW CAFE BISTRO*\n012-3456789\n123 Jalan Bukit Bintang, KL\n24/02\n2CTN MANGO GOLD SUSU\n5PCS avocado`}
                  value={orderRawText}
                  onChange={e => setOrderRawText(e.target.value)}
              />
              <button 
                  onClick={handleParseOrder}
                  className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg active:scale-95 flex items-center justify-center gap-2 transition flex-none text-lg md:text-base"
              >
                  <ClipboardDocumentCheckIcon className="w-6 h-6 md:w-5 md:h-5" /> Auto-Parse Order
              </button>
          </div>

          {/* RIGHT / STEP 2: Validation & Review */}
          <div className={`lg:col-span-8 bg-gray-50/50 md:bg-white p-0 md:p-6 rounded-none md:rounded-3xl md:shadow-xl md:border border-gray-100 flex-col min-h-[500px] lg:h-[calc(100vh-180px)] relative animate-in slide-in-from-right-4 fade-in duration-300 ${mobileStep === 1 ? 'hidden lg:flex' : 'flex'}`}>
              
              {/* Mobile Back Button */}
              <button 
                  onClick={() => setMobileStep(1)}
                  className="lg:hidden flex items-center gap-1.5 text-blue-600 font-bold mb-3 active:scale-95 transition-transform w-fit bg-blue-50 py-2 px-3 rounded-lg text-sm shadow-sm"
              >
                  <ChevronLeftIcon className="w-4 h-4 stroke-2" /> Back to Edit Text
              </button>

              {/* Unified Mobile Settings-style Order Header Block */}
              <div className="mb-4 bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col overflow-hidden relative z-[70]">
                  
                  {/* Row 1: Customer Selection */}
                  <div className="p-1 border-b border-gray-100 bg-gray-50/30 rounded-t-2xl">
                      <SearchableCustomerSelect 
                          selectedCustomerId={selectedCustomer}
                          customers={customers}
                          onSelect={(id) => {
                              setSelectedCustomer(id);
                              if (id === 'NEW') {
                                  setNewCustName('');
                              } else if (id) {
                                  const cust = customers.find(c => c.id.toString() === id);
                                  if (cust) {
                                      setNewCustPhone(cust.ContactNumber || '');
                                      setNewCustAddress(cust.DeliveryAddress || '');
                                  }
                              }
                          }}
                      />
                  </div>

                  {/* Row 1.5: New Company Name (Conditional) */}
                  {selectedCustomer === 'NEW' && (
                      <div className="flex items-center border-b border-gray-100 bg-blue-50/20 p-1 animate-in fade-in zoom-in-95 duration-200">
                          <span className="text-[10px] font-black text-blue-500 uppercase w-16 shrink-0 px-3">Name</span>
                          <input type="text" className="w-full p-2.5 text-base md:text-sm focus:outline-none font-bold text-blue-900 bg-transparent" value={newCustName} onChange={e=>setNewCustName(e.target.value)} placeholder="Company Name..." />
                      </div>
                  )}

                  {/* Row 2: Mode & Date */}
                  <div className="flex border-b border-gray-100 bg-white">
                      <div className="flex-1 flex flex-col border-r border-gray-100 p-2.5">
                          <label className="text-[9px] font-black text-gray-400 uppercase px-1 mb-0.5">Mode</label>
                          <select className="w-full text-base md:text-sm font-bold text-gray-800 outline-none bg-transparent px-0 focus:text-blue-600 transition-colors" value={deliveryMode} onChange={e => setDeliveryMode(e.target.value)}>
                              <option value="Driver">Driver</option><option value="Lalamove">Lalamove</option><option value="Self Pick-up">Pick-up</option>
                          </select>
                      </div>
                      <div className="flex-[1.2] flex flex-col p-2.5">
                          <label className="text-[9px] font-black text-gray-400 uppercase px-1 mb-0.5">Delivery Date</label>
                          <input type="date" className="w-full text-base md:text-sm font-bold text-gray-800 outline-none bg-transparent px-0 focus:text-blue-600 transition-colors" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
                      </div>
                  </div>

                  {/* Row 3: Phone & Address */}
                  <div className="flex bg-white rounded-b-2xl">
                      <div className="w-1/3 flex flex-col border-r border-gray-100 p-2.5">
                          <label className="text-[9px] font-black text-gray-400 uppercase px-1 mb-0.5">Phone</label>
                          <input type="tel" className="w-full text-base md:text-sm font-medium text-gray-800 outline-none bg-transparent px-1 focus:text-blue-600 transition-colors" value={newCustPhone} onChange={e=>setNewCustPhone(e.target.value)} placeholder="012..." />
                      </div>
                      <div className="w-2/3 flex flex-col p-2.5">
                          <label className="text-[9px] font-black text-gray-400 uppercase px-1 mb-0.5">Address</label>
                          <input type="text" className="w-full text-base md:text-sm font-medium text-gray-800 outline-none bg-transparent px-1 truncate focus:text-blue-600 transition-colors" value={newCustAddress} onChange={e=>setNewCustAddress(e.target.value)} placeholder="Delivery Address..." />
                      </div>
                  </div>
              </div>

              {/* Parsed Items List (Cards on Mobile, Table-ish on Desktop) */}
              <div className="flex-1 overflow-y-auto overflow-x-hidden px-1 md:px-0 pr-1 md:pr-2 custom-scrollbar space-y-3 pb-24 md:pb-0 relative z-20">
                  {parsedOrderItems.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-gray-300 border-2 border-dashed border-gray-200 bg-white rounded-2xl min-h-[200px] mt-4">
                          <ClipboardDocumentCheckIcon className="w-16 h-16 mb-4 opacity-20" />
                          <p className="font-bold text-sm">No items to review</p>
                      </div>
                  ) : (
                      <>
                          {/* DESKTOP HEADER */}
                          <div className="hidden lg:flex gap-2 px-3 pb-2 border-b border-gray-100 text-[9px] font-black text-gray-400 uppercase tracking-wider">
                              <div className="w-1/5">Original Text</div><div className="flex-1">Matched Product</div><div className="w-28 text-center">Qty</div><div className="w-20 text-center">UOM</div><div className="w-24 text-center">Price</div><div className="w-16 text-right"></div>
                          </div>

                          {/* ITEMS LIST (MOBILE CARDS) */}
                          {parsedOrderItems.map((item, index) => (
                              <div key={item.id} className={`flex flex-col p-3 md:p-3 rounded-2xl md:rounded-xl border shadow-sm transition relative ${item.isReplacement ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-200 hover:border-blue-300'} ${activeOrderDropdown === item.id ? 'z-[60]' : 'z-10'}`}>
                                  {/* Mobile Line Number Badge */}
                                  <div className="lg:hidden absolute -top-2 -left-2 bg-[#0f172a] text-white text-[9px] font-black w-6 h-6 rounded-full flex items-center justify-center shadow-md border-2 border-white">
                                      {index + 1}
                                  </div>

                                  <div className="flex flex-col lg:flex-row gap-3 lg:gap-2 items-start lg:items-center w-full mt-2 lg:mt-0">
                                      
                                      {/* Original Text */}
                                      <div className="w-full lg:w-1/5 text-[10px] text-gray-400 italic truncate pl-2 lg:pl-0" title={item.rawLine}>
                                          "{item.rawLine}"
                                      </div>
                                      
                                      {/* Product Select */}
                                      <div className="w-full lg:flex-1">
                                          <SearchableProductSelect 
                                              item={item} 
                                              products={products} 
                                              onUpdate={(code) => updateOrderItem(item.id, 'productCode', code)} 
                                              onOpenChange={(isOpen) => setActiveOrderDropdown(isOpen ? item.id : null)}
                                          />
                                      </div>

                                      {/* Mobile Controls Row (Decoupled Qty Stepper, UOM, Price) */}
                                      <div className="flex w-full lg:w-auto gap-2 items-end lg:items-center p-0 rounded-xl border-none">
                                          
                                          {/* Decoupled Native-style QTY Input with distinct buttons */}
                                          <div className="flex-1 lg:w-28 flex flex-col">
                                              <span className="lg:hidden text-[9px] font-black text-gray-400 mb-1 ml-1 tracking-widest">QTY</span>
                                              <div className="flex items-center gap-1">
                                                  <button onClick={() => updateOrderItem(item.id, 'qty', Math.max(0.1, (Number(item.qty) || 0) - 1).toFixed(1).replace(/\.0$/, ''))} className="w-[34px] md:w-8 h-[42px] md:h-9 bg-gray-100 active:bg-gray-200 text-gray-600 font-bold rounded-lg flex items-center justify-center transition-colors shadow-sm md:shadow-none border border-gray-200 md:border-none">
                                                      <span className="text-xl leading-none mb-1">-</span>
                                                  </button>
                                                  <input 
                                                      type="number" step="0.1" inputMode="decimal" 
                                                      className="w-full h-[42px] md:h-9 text-center font-black text-base md:text-xs border border-gray-200 rounded-lg shadow-inner outline-none focus:ring-2 focus:ring-blue-500 bg-white" 
                                                      value={item.qty} 
                                                      onChange={e => updateOrderItem(item.id, 'qty', e.target.value)} 
                                                  />
                                                  <button onClick={() => updateOrderItem(item.id, 'qty', ((Number(item.qty) || 0) + 1).toFixed(1).replace(/\.0$/, ''))} className="w-[34px] md:w-8 h-[42px] md:h-9 bg-gray-100 active:bg-gray-200 text-gray-600 font-bold rounded-lg flex items-center justify-center transition-colors shadow-sm md:shadow-none border border-gray-200 md:border-none">
                                                      <span className="text-xl leading-none mb-1">+</span>
                                                  </button>
                                              </div>
                                          </div>
                                          
                                          {/* UOM */}
                                          <div className="flex-[1.2] lg:w-20 flex flex-col">
                                              <span className="lg:hidden text-[9px] font-black text-gray-400 mb-1 ml-1 tracking-widest">UOM</span>
                                              <select className="w-full h-[42px] md:h-9 bg-white border border-gray-200 rounded-lg text-base md:text-xs font-bold uppercase focus:ring-2 focus:ring-blue-500 shadow-sm" value={item.uom} onChange={e => updateOrderItem(item.id, 'uom', e.target.value)}>
                                                  {(() => {
                                                      const matchedProd = products.find(p => p.ProductCode === item.productCode);
                                                      const validUoms = matchedProd && matchedProd.AllowedUOMs ? matchedProd.AllowedUOMs.split(',').map(u => u.trim().toUpperCase()).filter(Boolean) : KNOWN_UOMS;
                                                      const options = Array.from(new Set([item.uom, ...validUoms])).filter(Boolean);
                                                      return options.map(u => <option key={u} value={u}>{u}</option>);
                                                  })()}
                                              </select>
                                          </div>
                                          
                                          {/* PRICE */}
                                          <div className="flex-[1.5] lg:w-24 flex flex-col relative">
                                              <span className="lg:hidden text-[9px] font-black text-gray-400 mb-1 ml-1 tracking-widest">PRICE (RM)</span>
                                              <span className="absolute left-3 bottom-[11px] md:bottom-[9px] text-gray-400 text-xs font-bold pointer-events-none">RM</span>
                                              <input 
                                                  type="number" step="0.01" inputMode="decimal" 
                                                  className="w-full h-[42px] md:h-9 pl-8 md:pl-8 bg-white border border-gray-200 rounded-lg text-base md:text-xs font-black text-right pr-3 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400 shadow-sm" 
                                                  value={item.isReplacement ? 0 : item.price} 
                                                  onChange={e => updateOrderItem(item.id, 'price', e.target.value)} 
                                                  disabled={item.isReplacement}
                                              />
                                          </div>
                                      </div>

                                      {/* Mobile Bottom Actions Row */}
                                      <div className="w-full lg:w-auto flex justify-between lg:justify-end items-center gap-2 pt-3 border-t border-gray-100 lg:border-none lg:pt-0 mt-1 lg:mt-0">
                                          
                                          {/* iOS Style Toggle Switch for Replace */}
                                          <label className="relative inline-flex items-center cursor-pointer group">
                                              <input 
                                                  type="checkbox" 
                                                  className="sr-only peer" 
                                                  checked={item.isReplacement || false} 
                                                  onChange={e => updateOrderItem(item.id, 'isReplacement', e.target.checked)} 
                                              />
                                              <div className="w-10 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[16px] peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500 shadow-inner"></div>
                                              <span className="ml-2 text-[10px] font-black text-gray-500 uppercase tracking-widest group-active:text-gray-800 transition-colors">Replace</span>
                                          </label>

                                          <div className="flex gap-2">
                                              <button 
                                                  onClick={() => updateOrderItem(item.id, 'showNotes', !item.showNotes)} 
                                                  className={`p-2.5 md:p-1.5 rounded-xl md:rounded-lg transition border shadow-sm lg:shadow-none lg:border-none active:scale-95 ${item.showNotes || item.notes ? 'text-blue-600 bg-blue-50 border-blue-200' : 'text-gray-500 bg-white border-gray-200 hover:text-blue-600 hover:bg-gray-50'}`}
                                              >
                                                  <DocumentTextIcon className="w-5 h-5 md:w-5 md:h-5 inline" />
                                              </button>
                                              <button 
                                                  onClick={() => removeOrderItem(item.id)} 
                                                  className="p-2.5 md:p-1.5 text-red-500 bg-white border border-gray-200 shadow-sm lg:shadow-none lg:border-none hover:bg-red-50 rounded-xl md:rounded-lg transition active:scale-95"
                                              >
                                                  <TrashIcon className="w-5 h-5 md:w-5 md:h-5 inline" />
                                              </button>
                                          </div>
                                      </div>
                                  </div>
                                  
                                  {/* CONDITIONAL NOTES INPUT */}
                                  {item.showNotes && (
                                      <div className="mt-3 lg:pl-[20%] lg:pr-[240px] animate-in fade-in slide-in-from-top-2 duration-200">
                                          <input 
                                              type="text" 
                                              placeholder="Add special notes..." 
                                              className="w-full bg-blue-50/50 border border-blue-200 text-base md:text-xs font-medium text-blue-800 focus:ring-2 focus:ring-blue-400 outline-none p-3.5 md:p-2.5 rounded-xl shadow-inner placeholder-blue-300"
                                              value={item.notes || ''}
                                              onChange={e => updateOrderItem(item.id, 'notes', e.target.value)}
                                              autoFocus
                                          />
                                      </div>
                                  )}
                              </div>
                          ))}
                          <button onClick={addBlankOrderItem} className="w-full py-4 border-2 border-dashed border-gray-200 bg-white text-gray-500 font-black tracking-widest rounded-2xl hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/30 transition flex items-center justify-center gap-2 text-xs mt-2 uppercase active:scale-[0.98]">
                              <PlusIcon className="w-5 h-5 stroke-2" /> Add Item Manually
                          </button>
                      </>
                  )}
              </div>

              {/* STICKY BOTTOM CONFIRM BAR (Mobile & Desktop) */}
              <div className="fixed md:static bottom-[68px] md:bottom-auto left-0 right-0 p-3 md:p-0 bg-gray-50 md:bg-transparent border-t border-gray-200 md:border-none shadow-[0_-4px_15px_rgba(0,0,0,0.05)] md:shadow-none flex-none flex justify-between items-center z-[70] md:mt-4 md:pt-4">
                  <div className="text-xs font-bold text-gray-500 hidden sm:block">Valid Items: <span className="text-gray-800 text-sm ml-1 bg-gray-100 px-2 py-0.5 rounded">{parsedOrderItems.filter(i => i.productCode).length}</span></div>
                  <button onClick={handleSubmitOrder} disabled={isSubmittingOrder || parsedOrderItems.length === 0} className={`w-full sm:w-auto py-3.5 md:py-3 px-8 rounded-2xl md:rounded-xl font-black text-base md:text-sm text-white shadow-xl transition active:scale-95 flex items-center justify-center gap-2 ${isSubmittingOrder || parsedOrderItems.length === 0 ? 'bg-gray-300 cursor-not-allowed shadow-none text-gray-500' : 'bg-[#0f172a] hover:bg-slate-800 shadow-[#0f172a]/30'}`}>
                      {isSubmittingOrder ? 'Logging...' : 'Confirm & Log Order'} <CheckCircleIcon className="w-5 h-5 hidden sm:block" />
                  </button>
              </div>
          </div>
      </div>
      )}

      {/* ==========================================
          TAB 2: PRICE PASTE
          ========================================== */}
      {activeTab === 'prices' && (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT / STEP 1: Paste Area */}
          <div className={`lg:col-span-4 bg-white p-4 md:p-5 rounded-2xl md:rounded-3xl shadow-sm border border-purple-100 flex-col min-h-[50vh] lg:min-h-[300px] lg:h-[calc(100vh-180px)] animate-in fade-in zoom-in-95 duration-200 ${mobileStep === 2 ? 'hidden lg:flex' : 'flex'}`}>
              <div className="flex justify-between items-center mb-3 flex-none">
                  <label className="text-[10px] font-black text-purple-500 uppercase tracking-widest">
                      Paste Supplier Price List Here
                  </label>
                  <div className="flex gap-2">
                      {priceRawText && (
                          <button onClick={() => setPriceRawText('')} className="text-[10px] font-bold text-red-500 bg-red-50 px-2 py-1 rounded hover:bg-red-100 transition active:scale-95">Clear</button>
                      )}
                      
                      <button onClick={() => handlePasteFromClipboard(setPriceRawText, 'price-paste-textarea')} className="text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-1 rounded border border-purple-200 hover:bg-purple-100 transition active:scale-95 flex items-center gap-1">
                          <ClipboardIcon className="w-3 h-3" /> Paste
                      </button>
                      
                  </div>
              </div>
              <textarea 
                  id="price-paste-textarea"
                  className="w-full flex-1 border border-purple-200 bg-purple-50/30 rounded-2xl p-4 text-base md:text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none transition-all placeholder-purple-300 shadow-inner"
                  placeholder={`Example:\n*General Vegetable*\nCauliflower 12kg 30 KM\nCarrot 4.5kg 15`}
                  value={priceRawText}
                  onChange={e => setPriceRawText(e.target.value)}
              />
              <button 
                  onClick={handleParsePrice}
                  className="w-full mt-4 bg-purple-600 hover:bg-purple-700 text-white font-bold py-4 rounded-xl shadow-lg active:scale-95 flex items-center justify-center gap-2 transition flex-none text-lg md:text-base"
              >
                  <CurrencyDollarIcon className="w-6 h-6 md:w-5 md:h-5" /> Auto-Parse Prices
              </button>
          </div>

          {/* RIGHT / STEP 2: Validation & Review */}
          <div className={`lg:col-span-8 bg-gray-50/50 md:bg-white p-0 md:p-6 rounded-none md:rounded-3xl md:shadow-xl md:border border-purple-100 flex-col min-h-[500px] lg:h-[calc(100vh-180px)] relative animate-in slide-in-from-right-4 fade-in duration-300 ${mobileStep === 1 ? 'hidden lg:flex' : 'flex'}`}>
              
              {/* Mobile Back Button */}
              <button 
                  onClick={() => setMobileStep(1)}
                  className="lg:hidden flex items-center gap-1.5 text-purple-600 font-bold mb-3 active:scale-95 transition-transform w-fit bg-purple-50 py-2 px-3 rounded-lg text-sm shadow-sm ml-1"
              >
                  <ChevronLeftIcon className="w-4 h-4 stroke-2" /> Back to Edit Text
              </button>

              {/* Unified Mobile Settings-style Supplier Header Block */}
              <div className="mb-4 bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col overflow-hidden relative z-[70]">
                  <div className="flex flex-col border-b border-gray-100 p-2.5 bg-gray-50/30 rounded-t-2xl">
                      <label className="text-[9px] font-black text-purple-400 uppercase px-1 mb-1">Select Supplier</label>
                      <select 
                          className={`w-full text-base md:text-sm font-bold outline-none bg-transparent px-0 focus:text-purple-600 transition-colors ${!selectedSupplier ? 'text-red-600' : 'text-purple-900'}`}
                          value={selectedSupplier}
                          onChange={e => setSelectedSupplier(e.target.value)}
                      >
                          <option value="">-- SELECT SUPPLIER --</option>
                          {suppliers.map(s => <option key={s.SupplierName} value={s.SupplierName}>{s.SupplierName}</option>)}
                      </select>
                  </div>
                  <div className="flex flex-col p-2.5 bg-white rounded-b-2xl">
                      <label className="text-[9px] font-black text-purple-400 uppercase px-1 mb-1">Price Date</label>
                      <input 
                          type="date"
                          className="w-full text-base md:text-sm font-bold text-gray-800 outline-none bg-transparent px-0 focus:text-purple-600 transition-colors"
                          value={priceDate}
                          onChange={e => setPriceDate(e.target.value)}
                      />
                  </div>
              </div>

              <div className="flex-1 overflow-y-auto overflow-x-hidden px-1 md:px-0 pr-1 md:pr-2 custom-scrollbar space-y-3 pb-24 md:pb-0 relative z-20">
                  {parsedPriceItems.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-purple-300 border-2 border-dashed border-purple-200 bg-white rounded-2xl min-h-[200px] mt-4">
                          <CurrencyDollarIcon className="w-16 h-16 mb-4 opacity-20" />
                          <p className="font-bold text-sm text-center">Parse prices to review.<br/>Unmatched products are ignored.</p>
                      </div>
                  ) : (
                      <>
                          {/* DESKTOP HEADER */}
                          <div className="hidden lg:flex gap-2 px-3 pb-2 border-b border-purple-100 text-[9px] font-black text-purple-400 uppercase tracking-wider">
                              <div className="w-1/4">Original Text</div><div className="flex-1">Matched Product</div><div className="w-24 text-center">UOM</div><div className="w-28 text-center">Cost</div><div className="w-8 text-right"></div>
                          </div>

                          {/* ITEMS LIST */}
                          {parsedPriceItems.map((item) => (
                              <div key={item.id} className={`flex flex-col lg:flex-row gap-3 lg:gap-2 items-start lg:items-center bg-white p-3 rounded-2xl md:rounded-xl border border-purple-100 shadow-sm hover:border-purple-300 transition relative ${activePriceDropdown === item.id ? 'z-[60]' : 'z-10'}`}>
                                  {/* Original Text */}
                                  <div className="w-full lg:w-1/4 text-[10px] text-gray-500 font-bold truncate pl-2 lg:pl-0" title={item.rawLine}>
                                      "{item.rawLine}"
                                  </div>
                                  
                                  {/* Product Select */}
                                  <div className="w-full lg:flex-1">
                                      <SearchableProductSelect 
                                          item={item} 
                                          products={products} 
                                          onUpdate={(code) => updatePriceItem(item.id, 'productCode', code)} 
                                          onOpenChange={(isOpen) => setActivePriceDropdown(isOpen ? item.id : null)}
                                      />
                                  </div>

                                  {/* Mobile Controls Row */}
                                  <div className="flex w-full lg:w-auto gap-2 items-end lg:items-center mt-1 lg:mt-0 p-0 rounded-xl border-none">
                                      <div className="flex-1 lg:w-24 text-center">
                                          <span className="lg:hidden text-[9px] font-black text-gray-400 block mb-1">UOM</span>
                                          <span className="bg-purple-50 text-purple-700 font-bold text-base md:text-xs h-[42px] md:h-9 flex items-center justify-center rounded-lg border border-purple-100">{item.uom}</span>
                                      </div>
                                      <div className="flex-[1.5] lg:w-28 text-center relative">
                                          <span className="lg:hidden text-[9px] font-black text-gray-400 block mb-1">COST (RM)</span>
                                          <span className="absolute left-3 bottom-[11px] md:bottom-[9px] text-gray-400 text-xs font-bold pointer-events-none">RM</span>
                                          <input 
                                              type="number" step="0.01" inputMode="decimal"
                                              className="w-full h-[42px] md:h-9 pl-8 bg-white border border-gray-200 text-red-600 font-black text-base md:text-sm pr-3 rounded-lg text-right shadow-inner focus:ring-2 focus:ring-purple-500 outline-none"
                                              value={item.price}
                                              onChange={e => updatePriceItem(item.id, 'price', e.target.value)}
                                          />
                                      </div>
                                      <div className="w-12 lg:w-8 flex justify-end h-[42px] md:h-9">
                                          <button onClick={() => removePriceItem(item.id)} className="w-full h-full bg-white border border-gray-200 shadow-sm lg:shadow-none lg:border-none lg:bg-transparent text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition flex items-center justify-center active:scale-95"><TrashIcon className="w-5 h-5 inline" /></button>
                                      </div>
                                  </div>
                              </div>
                          ))}
                      </>
                  )}
              </div>

              {/* STICKY BOTTOM CONFIRM BAR */}
              <div className="fixed md:static bottom-[68px] md:bottom-auto left-0 right-0 p-3 md:p-0 bg-gray-50 md:bg-transparent border-t border-purple-200 md:border-none shadow-[0_-4px_15px_rgba(168,85,247,0.08)] md:shadow-none flex-none flex justify-between items-center z-[70] md:mt-4 md:pt-4">
                  <div className="text-xs font-bold text-gray-500 hidden sm:block">Valid Prices: <span className="text-purple-800 text-sm ml-1 font-black bg-purple-50 px-2 py-0.5 rounded border border-purple-100">{parsedPriceItems.length}</span></div>
                  <button onClick={handleSubmitPrice} disabled={isSubmittingPrice || parsedPriceItems.length === 0} className={`w-full sm:w-auto py-3.5 md:py-3 px-8 rounded-2xl md:rounded-xl font-black text-base md:text-sm text-white shadow-xl transition active:scale-95 flex items-center justify-center gap-2 ${isSubmittingPrice || parsedPriceItems.length === 0 ? 'bg-gray-300 cursor-not-allowed shadow-none text-gray-500' : 'bg-purple-600 hover:bg-purple-700 shadow-purple-600/30'}`}>
                      {isSubmittingPrice ? 'Logging...' : 'Save to Price DB'} <CheckCircleIcon className="w-5 h-5 hidden sm:block" />
                  </button>
              </div>
          </div>
      </div>
      )}

      {/* ==========================================
          TAB 3: PRICE COMPARE
          ========================================== */}
      {activeTab === 'compare' && (
      <div className="bg-white p-4 md:p-8 rounded-3xl shadow-xl border border-orange-100 h-[calc(100vh-210px)] md:h-[calc(100vh-180px)] flex flex-col animate-in fade-in">
          <div className="flex flex-col gap-4 mb-4 md:mb-8">
              <div className="relative">
                  <span className="absolute left-4 top-3.5 md:top-4 text-orange-400"><MagnifyingGlassIcon className="w-5 h-5" /></span>
                  <input 
                      type="text"
                      placeholder="Search product to compare prices..."
                      className="w-full pl-12 p-3 md:p-4 bg-orange-50/50 border border-orange-200 rounded-2xl text-base md:text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all placeholder-orange-300 shadow-inner"
                      value={compareSearchText}
                      onChange={e => setCompareSearchText(e.target.value)}
                  />
              </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 flex-1 overflow-hidden">
              {/* Search Results List */}
              <div className={`overflow-y-auto custom-scrollbar border border-gray-100 rounded-2xl p-2 bg-gray-50 ${compareResults.length > 0 && compareSearchText === '' ? 'hidden md:block' : 'block'}`}>
                  <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest p-2 mb-2">Matching Products</div>
                  {products.filter(p => !compareSearchText || p.ProductName.toLowerCase().includes(compareSearchText.toLowerCase()) || p.ProductCode.toLowerCase().includes(compareSearchText.toLowerCase())).slice(0,20).map(p => (
                      <div 
                          key={p.ProductCode} 
                          onClick={() => {
                              handleCompareSearch(p.ProductCode);
                              if (window.innerWidth < 768) setCompareSearchText('');
                          }}
                          className="p-4 md:p-3 mb-2 bg-white rounded-xl shadow-sm border border-gray-100 cursor-pointer hover:border-orange-400 active:scale-95 transition group"
                      >
                          <div className="font-bold text-gray-800 text-sm uppercase group-hover:text-orange-600 transition-colors">{p.ProductName}</div>
                          <div className="text-[10px] text-gray-400 mt-1 font-mono">{p.ProductCode}</div>
                      </div>
                  ))}
              </div>

              {/* Compare Results */}
              <div className="overflow-y-auto custom-scrollbar md:border-l-2 md:border-orange-100 md:pl-6 relative">
                  {isComparing ? (
                      <div className="flex justify-center items-center h-full font-bold text-orange-400">Searching...</div>
                  ) : compareResults.length > 0 ? (
                      <>
                          <h3 className="text-sm md:text-lg font-black text-gray-800 mb-4 md:mb-6 sticky top-0 bg-white py-2 z-10 flex items-center gap-2">
                              <ScaleIcon className="w-5 h-5 md:w-6 md:h-6 text-orange-500" /> Recent History
                          </h3>
                          <div className="space-y-3 md:space-y-4 pb-20 md:pb-0">
                              {compareResults.map((res, idx) => (
                                  <div key={idx} className={`p-4 rounded-2xl border flex justify-between items-center shadow-sm ${res.InvoiceNumber === 'PRICE_LIST' ? 'bg-purple-50/30 border-purple-200' : 'bg-white border-gray-200'}`}>
                                      <div>
                                          <div className="font-black text-gray-800 text-sm md:text-base mb-1.5">{res.Supplier}</div>
                                          <div className="flex gap-2 items-center">
                                              <span className="text-[9px] md:text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded uppercase">{new Date(res.Timestamp).toLocaleDateString('en-GB')}</span>
                                              {res.InvoiceNumber === 'PRICE_LIST' ? (
                                                  <span className="text-[8px] md:text-[9px] font-black text-purple-600 bg-purple-100 px-2 py-0.5 rounded border border-purple-200">Quote</span>
                                              ) : (
                                                  <span className="text-[8px] md:text-[9px] font-black text-blue-600 bg-blue-100 px-2 py-0.5 rounded border border-blue-200">Actual</span>
                                              )}
                                          </div>
                                      </div>
                                      <div className="text-right">
                                          <div className="font-black text-red-600 text-base md:text-lg">RM {Number(res.CostPrice).toFixed(2)}</div>
                                          <div className="text-[9px] md:text-[10px] font-bold text-gray-400 uppercase mt-0.5">per {res.PurchaseUOM}</div>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      </>
                  ) : (
                      <div className="hidden md:flex flex-col justify-center items-center h-full text-gray-300">
                          <ScaleIcon className="w-16 h-16 mb-4 opacity-20" />
                          <p className="font-bold text-sm">Select a product to view comparison</p>
                      </div>
                  )}
              </div>
          </div>
      </div>
      )}

    </div>
  );
}