'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { 
  MagnifyingGlassIcon, 
  PlusIcon, 
  PencilSquareIcon, 
  TrashIcon,
  CalendarIcon,
  CubeIcon,
  CheckIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

// ==========================================
// HELPERS
// ==========================================
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

export default function ProductManagementPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('masterlist'); // 'masterlist' | 'calendar'
  
  // Global Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Column Filters & Sorting
  const [sortConfig, setSortConfig] = useState({ key: 'ProductName', direction: 'asc' });
  const [columnFilters, setColumnFilters] = useState({
      code: '', name: '', category: '', origin: '', baseUom: '', allowedUoms: '', lastUpdate: ''
  });
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    ProductCode: '', ProductName: '', Category: '', origin: '', 
    AllowedUOMs: 'KG', BaseUOM: 'KG', SalesUOM: 'KG', PurchaseUOM: 'KG'      
  });

  const [conversionFactors, setConversionFactors] = useState({});

  // ==========================================
  // BULK ACTIONS STATE
  // ==========================================
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [bulkEditData, setBulkEditData] = useState({ Category: '', origin: '' });

  // ==========================================
  // CALENDAR STATES & CLOUD LOGIC
  // ==========================================
  const [calendarData, setCalendarData] = useState([]);
  const [isCalendarEditMode, setIsCalendarEditMode] = useState(false);
  const [isSyncingCalendar, setIsSyncingCalendar] = useState(false);

  // Drag-to-Select State
  const [isDragging, setIsDragging] = useState(false);
  const [dragTargetValue, setDragTargetValue] = useState(false);
  const [dragActiveRow, setDragActiveRow] = useState(null); // { gIdx, oIdx }

  // 1. Initial Load from Supabase
  async function loadAllData() {
    setLoading(true);
    
    // Fetch Products
    const { data: prodData } = await supabase.from('ProductMaster').select('*').order('ProductName');
    setProducts(prodData || []);

    // Fetch Calendar from Supabase
    const { data: calData } = await supabase.from('AvailabilityCalendar').select('*').order('display_order', { ascending: true });
    
    if (calData && calData.length > 0) {
        const grouped = [];
        const productMap = {};

        calData.forEach(row => {
            if (!productMap[row.product_name]) {
                productMap[row.product_name] = {
                    db_id: row.id,
                    product: row.product_name,
                    color: row.color,
                    origins: []
                };
                grouped.push(productMap[row.product_name]);
            }
            productMap[row.product_name].origins.push({
                id: row.id,
                name: row.origin_name,
                data: row.weeks
            });
        });
        setCalendarData(grouped);
    } else {
        setCalendarData([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadAllData();

    // Global mouse up listener to stop dragging
    const handleGlobalMouseUp = () => {
        setIsDragging(false);
        setDragActiveRow(null);
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  // Sync Base/Sales/Purchase UOMs
  useEffect(() => {
    if (!isModalOpen) return;
    const options = formData.AllowedUOMs 
      ? formData.AllowedUOMs.split(',').map(u => u.trim().toUpperCase()).filter(u => u !== '')
      : [];

    if (options.length === 1) {
      const singleUOM = options[0];
      if (formData.BaseUOM !== singleUOM || formData.SalesUOM !== singleUOM || formData.PurchaseUOM !== singleUOM) {
        setFormData(prev => ({
          ...prev, BaseUOM: singleUOM, SalesUOM: singleUOM, PurchaseUOM: singleUOM
        }));
      }
    }
  }, [formData.AllowedUOMs, isModalOpen]);

  // ==========================================
  // MASTERLIST HANDLERS
  // ==========================================
  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanedAllowed = formData.AllowedUOMs.toUpperCase().split(',').map(u => u.trim()).join(',');
    
    const cleanedData = {
        ...formData,
        Category: formData.Category.toUpperCase().trim(),
        origin: formData.origin ? formData.origin.toUpperCase().trim() : '',
        AllowedUOMs: cleanedAllowed,
        SalesUOM: formData.SalesUOM || formData.BaseUOM,
        PurchaseUOM: formData.PurchaseUOM || formData.BaseUOM,
        updated_at: new Date().toISOString()
    };

    if (editingProduct) {
      const { error } = await supabase.from('ProductMaster').update(cleanedData).eq('ProductCode', editingProduct.ProductCode);
      if (error) { alert('Error updating: ' + error.message); return; }
    } else {
      const { data: existing } = await supabase.from('ProductMaster').select('ProductCode').eq('ProductCode', formData.ProductCode).single();
      if (existing) { alert('Error: Product Code already exists!'); return; }
      const { error } = await supabase.from('ProductMaster').insert([cleanedData]);
      if (error) { alert('Error adding: ' + error.message); return; }
    }

    await supabase.from('UOM_Conversions').delete().eq('ProductCode', formData.ProductCode);
    const otherUOMs = getUOMOptions().filter(u => u !== formData.BaseUOM);
    const conversionRows = otherUOMs.map(uom => ({
        "ProductCode": formData.ProductCode, "BaseUOM": formData.BaseUOM, "ConversionUOM": uom, "Factor": conversionFactors[uom] || 0
    }));
    if (conversionRows.length > 0) {
        const { error: convError } = await supabase.from('UOM_Conversions').insert(conversionRows);
        if (convError) console.error("Error saving conversions:", convError);
    }
    alert('Product & Conversions saved successfully!');
    closeModal();
    loadAllData();
  };

  const handleDelete = async (name, code) => {
    if (confirm(`Are you sure you want to delete "${name}"?`)) {
      await supabase.from('UOM_Conversions').delete().eq('ProductCode', code);
      const { error } = await supabase.from('ProductMaster').delete().eq('ProductCode', code);
      if (error) alert('Error deleting: ' + error.message);
      else {
          setSelectedProducts(prev => prev.filter(c => c !== code));
          loadAllData();
      }
    }
  };

  const openAddModal = () => {
    setEditingProduct(null);
    setFormData({ ProductCode: '', ProductName: '', Category: '', origin: '', AllowedUOMs: 'KG', BaseUOM: 'KG', SalesUOM: 'KG', PurchaseUOM: 'KG' });
    setConversionFactors({});
    setIsModalOpen(true);
  };

  const openEditModal = async (product) => {
    setEditingProduct(product);
    setFormData({
      ProductCode: product.ProductCode, 
      ProductName: product.ProductName, 
      Category: product.Category || 'VEGE',
      origin: product.origin || '',
      AllowedUOMs: product.AllowedUOMs || 'KG', 
      BaseUOM: product.BaseUOM || 'KG', 
      SalesUOM: product.SalesUOM || product.BaseUOM || 'KG', 
      PurchaseUOM: product.PurchaseUOM || product.BaseUOM || 'KG'
    });
    const { data: convs } = await supabase.from('UOM_Conversions').select('ConversionUOM, Factor').eq('ProductCode', product.ProductCode);
    const factors = {};
    if (convs) convs.forEach(c => factors[c.ConversionUOM] = c.Factor);
    setConversionFactors(factors);
    setIsModalOpen(true);
  };

  const closeModal = () => { setIsModalOpen(false); setEditingProduct(null); };

  const getUOMOptions = () => formData.AllowedUOMs ? formData.AllowedUOMs.split(',').map(u => u.trim().toUpperCase()).filter(u => u !== '') : [];
  const getSecondaryUOMs = () => getUOMOptions().filter(u => u !== formData.BaseUOM);

  const uniqueCategories = useMemo(() => {
      const cats = new Set(products.map(p => p.Category).filter(Boolean));
      ['VEGE', 'IMPORT FRUITS', 'LOCAL FRUITS', 'OTHERS'].forEach(c => cats.add(c));
      return Array.from(cats).sort();
  }, [products]);
  const filterCategories = ['All', ...uniqueCategories];

  const uniqueOrigins = useMemo(() => {
      const orgs = new Set(products.map(p => p.origin).filter(Boolean));
      // Fallback defaults if empty
      ['MALAYSIA', 'CHINA', 'THAILAND', 'AUSTRALIA', 'SPAIN', 'SOUTH AFRICA'].forEach(o => orgs.add(o));
      return Array.from(orgs).sort();
  }, [products]);

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };
  const handleClearFilters = () => setColumnFilters({ code: '', name: '', category: '', origin: '', baseUom: '', allowedUoms: '', lastUpdate: '' });

  const filteredAndSortedProducts = useMemo(() => {
      let filtered = products.filter(p => {
          const searchTerms = searchTerm.toLowerCase().split(' ').filter(t => t);
          const productString = `${p.ProductName || ''} ${p.ProductCode || ''}`.toLowerCase();
          const matchesSearch = searchTerms.length === 0 || searchTerms.every(term => productString.includes(term));
          const matchesCategory = selectedCategory === 'All' || p.Category === selectedCategory;
          const matchesColCode = !columnFilters.code || (p.ProductCode || '').toLowerCase().includes(columnFilters.code.toLowerCase());
          const matchesColName = !columnFilters.name || (p.ProductName || '').toLowerCase().includes(columnFilters.name.toLowerCase());
          const matchesColCat = !columnFilters.category || (p.Category || '').toLowerCase().includes(columnFilters.category.toLowerCase());
          const matchesColOrigin = !columnFilters.origin || (p.origin || '').toLowerCase().includes(columnFilters.origin.toLowerCase());
          const matchesColBase = !columnFilters.baseUom || (p.BaseUOM || '').toLowerCase().includes(columnFilters.baseUom.toLowerCase());
          const matchesColAllow = !columnFilters.allowedUoms || (p.AllowedUOMs || '').toLowerCase().includes(columnFilters.allowedUoms.toLowerCase());

          // Filter Logic for Date
          let matchesColLastUpdate = true;
          if (columnFilters.lastUpdate) {
              const dStr = p.updated_at || p.created_at || p.Timestamp;
              if (!dStr) {
                  matchesColLastUpdate = false;
              } else {
                  const pDate = new Date(dStr);
                  if (isNaN(pDate)) {
                      matchesColLastUpdate = false;
                  } else {
                      const pDateStr = `${pDate.getFullYear()}-${String(pDate.getMonth() + 1).padStart(2, '0')}-${String(pDate.getDate()).padStart(2, '0')}`;
                      matchesColLastUpdate = pDateStr === columnFilters.lastUpdate;
                  }
              }
          }

          return matchesSearch && matchesCategory && matchesColCode && matchesColName && matchesColCat && matchesColOrigin && matchesColBase && matchesColAllow && matchesColLastUpdate;
      });

      if (sortConfig.key) {
          filtered.sort((a, b) => {
              let aVal = a[sortConfig.key]; let bVal = b[sortConfig.key];
              if (sortConfig.key === 'lastUpdate') {
                  aVal = new Date(a.updated_at || a.created_at || a.Timestamp || 0).getTime();
                  bVal = new Date(b.updated_at || b.created_at || b.Timestamp || 0).getTime();
              } else {
                  aVal = (aVal || '').toString().toLowerCase(); bVal = (bVal || '').toString().toLowerCase();
              }
              if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
              if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
              return 0;
          });
      }
      return filtered;
  }, [products, searchTerm, selectedCategory, columnFilters, sortConfig]);

  // ==========================================
  // BULK ACTIONS LOGIC
  // ==========================================
  const toggleSelectAll = () => {
    if (selectedProducts.length === filteredAndSortedProducts.length) {
        setSelectedProducts([]);
    } else {
        setSelectedProducts(filteredAndSortedProducts.map(p => p.ProductCode));
    }
  };

  const toggleProductSelection = (code) => {
    setSelectedProducts(prev => 
        prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const handleBulkDelete = async () => {
      if (!confirm(`Are you sure you want to permanently delete ${selectedProducts.length} selected products?`)) return;
      try {
          await supabase.from('UOM_Conversions').delete().in('ProductCode', selectedProducts);
          const { error } = await supabase.from('ProductMaster').delete().in('ProductCode', selectedProducts);
          
          if (error) {
              alert("Error deleting products: " + error.message);
          } else {
              setSelectedProducts([]);
              loadAllData();
          }
      } catch(e) {
          console.error(e);
      }
  };

  const handleBulkEditSave = async () => {
      const updates = {};
      if (bulkEditData.Category) updates.Category = bulkEditData.Category.toUpperCase().trim();
      if (bulkEditData.origin) updates.origin = bulkEditData.origin.toUpperCase().trim();

      if (Object.keys(updates).length === 0) return alert("No fields to update.");
      if (!confirm(`Apply changes to ${selectedProducts.length} products?`)) return;

      updates.updated_at = new Date().toISOString();

      try {
          const { error } = await supabase
              .from('ProductMaster')
              .update(updates)
              .in('ProductCode', selectedProducts);
          
          if (error) {
              alert("Bulk update failed: " + error.message);
          } else {
              alert("Bulk update successful!");
              setIsBulkEditOpen(false);
              setSelectedProducts([]);
              setBulkEditData({ Category: '', origin: '' });
              loadAllData();
          }
      } catch(e) {
          console.error(e);
      }
  };

  // ==========================================
  // CALENDAR CRUD (SUPABASE SYNC)
  // ==========================================
  const syncCalendarToSupabase = async (newData) => {
      setIsSyncingCalendar(true);
      try {
          const flatRows = [];
          newData.forEach((group, groupIdx) => {
              group.origins.forEach((org, orgIdx) => {
                  flatRows.push({
                      product_name: group.product,
                      color: group.color,
                      origin_name: org.name,
                      weeks: org.data,
                      display_order: groupIdx * 100 + orgIdx
                  });
              });
          });

          await supabase.from('AvailabilityCalendar').delete().neq('product_name', 'SystemReserved_Ignore');
          const { error } = await supabase.from('AvailabilityCalendar').insert(flatRows);
          if (error) throw error;
          loadAllData();
      } catch (e) {
          console.error("Sync error:", e);
          alert("Error syncing to Supabase: " + e.message);
      } finally {
          setIsSyncingCalendar(false);
      }
  };

  const handleDoneEditing = async () => {
      await syncCalendarToSupabase(calendarData);
      setIsCalendarEditMode(false);
  };

  // --- DRAG-TO-SELECT LOGIC ---
  const handleCellMouseDown = (gIdx, oIdx, wIdx) => {
      if (!isCalendarEditMode) return;
      const currentValue = calendarData[gIdx].origins[oIdx].data[wIdx];
      const targetValue = !currentValue;
      
      setIsDragging(true);
      setDragTargetValue(targetValue);
      setDragActiveRow({ gIdx, oIdx });
      
      // Update the first cell clicked
      const newData = [...calendarData];
      const newWeeks = [...newData[gIdx].origins[oIdx].data];
      newWeeks[wIdx] = targetValue;
      newData[gIdx].origins[oIdx].data = newWeeks;
      setCalendarData(newData);
  };

  const handleCellMouseEnter = (gIdx, oIdx, wIdx) => {
      if (!isDragging || !isCalendarEditMode) return;
      // Lock drag to the same origin row
      if (dragActiveRow?.gIdx !== gIdx || dragActiveRow?.oIdx !== oIdx) return;

      const newData = [...calendarData];
      if (newData[gIdx].origins[oIdx].data[wIdx] === dragTargetValue) return; // No change needed

      const newWeeks = [...newData[gIdx].origins[oIdx].data];
      newWeeks[wIdx] = dragTargetValue;
      newData[gIdx].origins[oIdx].data = newWeeks;
      setCalendarData(newData);
  };

  const updateProductData = (groupIndex, field, value) => {
      const newData = [...calendarData];
      newData[groupIndex][field] = value;
      setCalendarData(newData);
  };

  const updateOriginName = (groupIndex, originIndex, value) => {
      const newData = [...calendarData];
      newData[groupIndex].origins[originIndex].name = value;
      setCalendarData(newData);
  };

  const addCalendarProduct = () => {
      const newProd = {
          id: generateId(),
          product: 'New Item',
          color: '#3B82F6',
          origins: [{ id: generateId(), name: 'Origin', data: Array(48).fill(false) }]
      };
      setCalendarData([newProd, ...calendarData]);
  };

  const addCalendarOrigin = (groupIndex) => {
      const newData = [...calendarData];
      newData[groupIndex].origins.push({ id: generateId(), name: 'New Origin', data: Array(48).fill(false) });
      setCalendarData(newData);
  };

  const removeCalendarOrigin = (groupIndex, originIndex) => {
      const newData = [...calendarData];
      newData[groupIndex].origins.splice(originIndex, 1);
      if (newData[groupIndex].origins.length === 0) {
          newData.splice(groupIndex, 1);
      }
      setCalendarData(newData);
  };

  const removeCalendarProduct = (groupIndex) => {
      if (!confirm("Remove this entire product group?")) return;
      const newData = [...calendarData];
      newData.splice(groupIndex, 1);
      setCalendarData(newData);
  };

  return (
    <div className="p-3 md:p-8 max-w-full overflow-x-hidden min-h-screen bg-gray-50/50 pb-32 animate-in fade-in duration-300">
        
        {/* HEADER */}
        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
              <h1 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight">Product Management</h1>
              <p className="text-[10px] md:text-xs text-gray-400 font-bold uppercase mt-1">Manage inventory items and UOM settings</p>
          </div>
          {activeTab === 'masterlist' && (
            <button 
              onClick={openAddModal}
              className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-black py-3 px-6 rounded-2xl shadow-sm transform transition active:scale-95 flex items-center justify-center gap-2 text-xs uppercase tracking-widest"
            >
              <PlusIcon className="w-5 h-5" strokeWidth={3} /> Add Product
            </button>
          )}
        </div>

        {/* TABS */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 border-b border-gray-200 custom-scrollbar">
            <button onClick={() => setActiveTab('masterlist')} className={`px-5 py-2.5 rounded-t-xl font-bold text-sm transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === 'masterlist' ? 'bg-green-600 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-100'}`}><CubeIcon className="w-5 h-5" /> Product Masterlist</button>
            <button onClick={() => setActiveTab('calendar')} className={`px-5 py-2.5 rounded-t-xl font-bold text-sm transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === 'calendar' ? 'bg-orange-500 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-100'}`}><CalendarIcon className="w-5 h-5" /> Availability Calendar</button>
        </div>

        {/* ==========================================
            TAB 1: PRODUCT MASTERLIST
            ========================================== */}
        {activeTab === 'masterlist' && (
        <div className="bg-white p-4 md:p-6 rounded-[2rem] shadow-xl border border-gray-100 flex flex-col h-[calc(100vh-180px)] min-h-[500px] animate-in fade-in">
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-4 flex-none">
              
              <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
                  <div className="relative flex-1 sm:w-64 sm:flex-none">
                     <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><MagnifyingGlassIcon className="w-5 h-5 text-gray-400" /></div>
                     <input type="text" placeholder="Search by name or code..." className="w-full pl-12 p-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-green-500 transition-all text-xs font-bold" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                  </div>
                  <div className="w-full sm:w-64">
                     <select className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-green-500 transition-all text-xs font-bold text-gray-700 uppercase" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>{filterCategories.map(c => <option key={c} value={c}>{c}</option>)}</select>
                  </div>
              </div>

              {/* Bulk Actions Toolbar */}
              <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto justify-end">
                  <div className={`flex items-center gap-1 sm:gap-2 px-3 py-1.5 rounded-xl transition-all border ${selectedProducts.length > 0 ? 'bg-blue-50 border-blue-200 shadow-sm' : 'bg-gray-50 border-gray-200 opacity-60 pointer-events-none'}`}>
                      <span className="text-[10px] sm:text-xs font-black uppercase text-blue-800 tracking-widest border-r border-blue-200/50 pr-2 sm:pr-3 mr-1 hidden sm:block">
                          {selectedProducts.length} Selected
                      </span>
                      <span className="text-xs font-black text-blue-800 sm:hidden mr-1 border-r border-blue-200/50 pr-2">{selectedProducts.length}</span>
                      
                      <button onClick={() => setIsBulkEditOpen(true)} className="flex items-center gap-1.5 p-1.5 sm:px-2 sm:py-1 rounded-lg text-blue-600 hover:bg-blue-100 transition" title="Bulk Edit">
                          <PencilSquareIcon className="w-4 h-4 md:w-5 md:h-5"/><span className="hidden md:inline text-xs font-bold uppercase tracking-wider">Edit</span>
                      </button>
                      <button onClick={handleBulkDelete} className="flex items-center gap-1.5 p-1.5 sm:px-2 sm:py-1 rounded-lg text-red-600 hover:bg-red-100 transition" title="Batch Delete">
                          <TrashIcon className="w-4 h-4 md:w-5 md:h-5"/><span className="hidden md:inline text-xs font-bold uppercase tracking-wider">Delete</span>
                      </button>
                  </div>
              </div>

            </div>

            <div className="flex-1 overflow-auto custom-scrollbar border border-gray-100 rounded-3xl">
                <table className="w-full text-left whitespace-nowrap min-w-[1000px]">
                  <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest sticky top-0 z-10 shadow-sm border-b border-gray-100">
                    <tr>
                      <th className="p-4 text-center w-12"><input type="checkbox" className="w-4 h-4 rounded text-green-600 focus:ring-green-500 border-gray-300 cursor-pointer" checked={filteredAndSortedProducts.length > 0 && selectedProducts.length === filteredAndSortedProducts.length} onChange={toggleSelectAll} /></th>
                      <th className="p-4 cursor-pointer hover:text-black select-none" onClick={() => requestSort('ProductCode')}>Code {sortConfig.key === 'ProductCode' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                      <th className="p-4 cursor-pointer hover:text-black select-none" onClick={() => requestSort('ProductName')}>Product Name {sortConfig.key === 'ProductName' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                      <th className="p-4 cursor-pointer hover:text-black select-none" onClick={() => requestSort('Category')}>Category {sortConfig.key === 'Category' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                      <th className="p-4 cursor-pointer hover:text-black select-none" onClick={() => requestSort('origin')}>Origin {sortConfig.key === 'origin' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                      <th className="p-4 text-center cursor-pointer hover:text-black select-none" onClick={() => requestSort('BaseUOM')}>Base UOM {sortConfig.key === 'BaseUOM' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                      <th className="p-4 cursor-pointer hover:text-black select-none" onClick={() => requestSort('AllowedUOMs')}>Allowed UOMs {sortConfig.key === 'AllowedUOMs' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                      <th className="p-4 cursor-pointer hover:text-black select-none" onClick={() => requestSort('lastUpdate')}>Last Update {sortConfig.key === 'lastUpdate' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                      <th className="p-4 text-right pr-6">Actions</th>
                    </tr>
                    <tr className="bg-white border-t border-gray-200 shadow-[0_2px_4px_rgba(0,0,0,0.02)]">
                        <th className="p-2 pl-4"></th>
                        <th className="p-2"><input type="text" placeholder="Filter Code..." className="w-full p-2 rounded-lg border border-gray-200 text-[10px] font-bold normal-case outline-none focus:ring-2 focus:ring-green-500 bg-gray-50" value={columnFilters.code} onChange={e => setColumnFilters({...columnFilters, code: e.target.value})} /></th>
                        <th className="p-2"><input type="text" placeholder="Filter Name..." className="w-full p-2 rounded-lg border border-gray-200 text-[10px] font-bold normal-case outline-none focus:ring-2 focus:ring-green-500 bg-gray-50" value={columnFilters.name} onChange={e => setColumnFilters({...columnFilters, name: e.target.value})} /></th>
                        <th className="p-2"><input type="text" placeholder="Filter Category..." className="w-full p-2 rounded-lg border border-gray-200 text-[10px] font-bold normal-case outline-none focus:ring-2 focus:ring-green-500 bg-gray-50" value={columnFilters.category} onChange={e => setColumnFilters({...columnFilters, category: e.target.value})} /></th>
                        <th className="p-2"><input type="text" placeholder="Filter Origin..." className="w-full p-2 rounded-lg border border-gray-200 text-[10px] font-bold normal-case outline-none focus:ring-2 focus:ring-green-500 bg-gray-50" value={columnFilters.origin} onChange={e => setColumnFilters({...columnFilters, origin: e.target.value})} /></th>
                        <th className="p-2"><input type="text" placeholder="Filter UOM..." className="w-full p-2 rounded-lg border border-gray-200 text-[10px] font-bold normal-case outline-none focus:ring-2 focus:ring-green-500 bg-gray-50 text-center" value={columnFilters.baseUom} onChange={e => setColumnFilters({...columnFilters, baseUom: e.target.value})} /></th>
                        <th className="p-2"><input type="text" placeholder="Filter Allowed..." className="w-full p-2 rounded-lg border border-gray-200 text-[10px] font-bold normal-case outline-none focus:ring-2 focus:ring-green-500 bg-gray-50" value={columnFilters.allowedUoms} onChange={e => setColumnFilters({...columnFilters, allowedUoms: e.target.value})} /></th>
                        <th className="p-2"><input type="date" className="w-full p-2 rounded-lg border border-gray-200 text-[10px] font-bold normal-case outline-none focus:ring-2 focus:ring-green-500 bg-gray-50" value={columnFilters.lastUpdate} onChange={e => setColumnFilters({...columnFilters, lastUpdate: e.target.value})} /></th>
                        <th className="p-2 pr-6 text-right"><button onClick={handleClearFilters} className="text-gray-400 hover:text-red-600 font-bold uppercase tracking-widest text-[9px] bg-white border border-gray-200 px-3 py-1.5 rounded-lg shadow-sm transition-colors w-full">Clear</button></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-sm font-bold text-gray-700">
                    {filteredAndSortedProducts.map((p) => {
                      const dStr = p.updated_at || p.created_at || p.Timestamp;
                      let formattedDate = '-';
                      if (dStr) {
                          const d = new Date(dStr);
                          if (!isNaN(d)) formattedDate = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute:'2-digit' });
                      }
                      const isSelected = selectedProducts.includes(p.ProductCode);

                      return (
                      <tr key={p.ProductCode || p.id} className={`${isSelected ? 'bg-blue-50/60' : 'hover:bg-green-50/30'} transition-colors group/row cursor-pointer`} onClick={() => toggleProductSelection(p.ProductCode)}>
                        <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" className="w-4 h-4 rounded text-green-600 focus:ring-green-500 border-gray-300 cursor-pointer" checked={isSelected} onChange={() => toggleProductSelection(p.ProductCode)} />
                        </td>
                        <td className="p-4"><span className="font-mono text-[10px] font-black text-gray-500 bg-gray-100 px-2.5 py-1 rounded border border-gray-200">{p.ProductCode}</span></td>
                        <td className="p-4 font-black text-gray-800 uppercase">{p.ProductName}</td>
                        <td className="p-4"><span className="text-[9px] font-black px-2.5 py-1 rounded-md uppercase bg-blue-50 text-blue-600 border border-blue-100 tracking-widest">{p.Category}</span></td>
                        <td className="p-4 font-medium text-gray-600 uppercase text-xs">{p.origin || '-'}</td>
                        <td className="p-4 text-center font-black text-gray-700">{p.BaseUOM}</td>
                        <td className="p-4 text-[10px] text-gray-500 font-medium whitespace-normal leading-tight max-w-[200px]">{p.AllowedUOMs}</td>
                        <td className="p-4 font-mono text-[10px] text-gray-400 font-medium">{formattedDate}</td>
                        <td className="p-4 text-right pr-6" onClick={(e) => e.stopPropagation()}><div className="flex justify-end gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity"><button onClick={() => openEditModal(p)} className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition" title="Edit Product"><PencilSquareIcon className="w-5 h-5" /></button><button onClick={() => handleDelete(p.ProductName, p.ProductCode)} className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition" title="Delete Product"><TrashIcon className="w-5 h-5" /></button></div></td>
                      </tr>
                    )})}
                    {filteredAndSortedProducts.length === 0 && <tr><td colSpan="9" className="p-16 text-center text-gray-400 italic font-bold">No products found matching your search or filters.</td></tr>}
                  </tbody>
                </table>
            </div>
        </div>
        )}

        {/* ==========================================
            TAB 2: AVAILABILITY CALENDAR (DATABASE SYNC + DRAG SUPPORT)
            ========================================== */}
        {activeTab === 'calendar' && (
        <div className="bg-white p-4 md:p-6 rounded-[2rem] shadow-xl border border-gray-100 flex flex-col h-[calc(100vh-180px)] min-h-[500px] animate-in fade-in select-none">
            <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 flex-none">
                <div>
                    <h2 className="text-xl font-black text-gray-800 tracking-tight flex items-center gap-2">
                        Global Availability Calendar 
                        {isCalendarEditMode && <span className="bg-red-100 text-red-600 text-[10px] px-2 py-0.5 rounded-md uppercase tracking-widest border border-red-200">Edit Mode</span>}
                    </h2>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Seasonal sourcing matrix by country of origin</p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    {isCalendarEditMode ? (
                        <>
                            <button onClick={addCalendarProduct} className="flex-1 sm:flex-none bg-orange-50 text-orange-600 hover:bg-orange-100 font-black py-2.5 px-5 rounded-xl border border-orange-200 transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest"><PlusIcon className="w-4 h-4" /> Add Product</button>
                            <button onClick={handleDoneEditing} disabled={isSyncingCalendar} className="flex-1 sm:flex-none bg-green-600 text-white hover:bg-green-700 font-black py-2.5 px-6 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 text-xs uppercase tracking-widest active:scale-95 disabled:opacity-50"><CheckIcon className="w-4 h-4"/> {isSyncingCalendar ? 'SYNCING...' : 'SAVE & FINISH'}</button>
                        </>
                    ) : (
                        <button onClick={() => setIsCalendarEditMode(true)} className="flex-1 sm:flex-none bg-gray-800 text-white hover:bg-gray-900 font-black py-2.5 px-6 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 text-xs uppercase tracking-widest active:scale-95"><PencilSquareIcon className="w-4 h-4"/> Customize</button>
                    )}
                </div>
            </div>
            
            <div className="flex-1 overflow-auto custom-scrollbar border border-gray-200 rounded-2xl relative">
                <table className="w-full text-left border-collapse min-w-[1200px] text-xs">
                    <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest sticky top-0 z-30 shadow-sm">
                        <tr>
                            <th rowSpan={2} className="p-4 bg-gray-50 sticky left-0 z-40 border-r border-gray-200 w-40 border-b">Product</th>
                            <th rowSpan={2} className="p-4 bg-gray-50 sticky left-40 z-40 border-r border-gray-200 w-48 text-right border-b">Origin</th>
                            {['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'].map((m, idx) => (
                                <th key={m} colSpan={4} className={`p-2 text-center border-r border-gray-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-100'}`}>{m}</th>
                            ))}
                        </tr>
                        <tr className="border-b border-gray-200">
                            {Array.from({length: 48}).map((_, wIdx) => {
                                const mIdx = Math.floor(wIdx / 4);
                                return <th key={`w-${wIdx}`} className={`p-1 text-center border-r border-gray-200 text-[8px] text-gray-400 ${mIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>{(wIdx % 4) + 1}</th>;
                            })}
                        </tr>
                    </thead>
                    <tbody className="font-medium">
                        {calendarData.length === 0 ? (
                            <tr><td colSpan="50" className="p-20 text-center text-gray-400 italic font-bold">No availability data. Click "Customize" to build your cloud calendar.</td></tr>
                        ) : calendarData.map((cat, gIdx) => (
                            cat.origins.map((org, oIdx) => (
                                <tr key={org.id} className="group/row transition-colors">
                                    {oIdx === 0 && (
                                        <td rowSpan={cat.origins.length} className="p-3 bg-white sticky left-0 z-20 border-r border-gray-200 align-top shadow-[2px_0_5px_rgba(0,0,0,0.02)] border-b border-b-gray-200">
                                            <div className="flex flex-col gap-2">
                                                <div className="flex items-center gap-2">
                                                    {isCalendarEditMode ? (
                                                        <>
                                                            <input type="color" value={cat.color} onChange={e => updateProductData(gIdx, 'color', e.target.value)} className="w-5 h-5 rounded cursor-pointer border-0 p-0" />
                                                            <input type="text" value={cat.product} onChange={e => updateProductData(gIdx, 'product', e.target.value)} className="font-black text-sm uppercase tracking-tight bg-gray-50 border border-gray-200 rounded px-2 py-1 w-full outline-none focus:border-blue-400" style={{color: cat.color}} />
                                                        </>
                                                    ) : (
                                                        <span className="font-black text-sm uppercase tracking-tight" style={{color: cat.color}}>{cat.product}</span>
                                                    )}
                                                </div>
                                                {isCalendarEditMode && (
                                                    <div className="flex gap-1 mt-1">
                                                        <button onClick={() => addCalendarOrigin(gIdx)} className="text-[9px] bg-blue-50 text-blue-600 px-2 py-1 rounded font-bold hover:bg-blue-100 flex-1 flex justify-center items-center gap-1"><PlusIcon className="w-3 h-3"/> Origin</button>
                                                        <button onClick={() => removeCalendarProduct(gIdx)} className="text-[9px] bg-red-50 text-red-600 px-2 py-1 rounded font-bold hover:bg-red-100 flex items-center justify-center"><TrashIcon className="w-3 h-3"/></button>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    )}

                                    <td className={`p-2 pr-4 bg-white sticky left-40 z-20 border-r border-gray-200 text-right shadow-[2px_0_5px_rgba(0,0,0,0.02)] ${oIdx === cat.origins.length - 1 ? 'border-b border-gray-200' : 'border-b border-gray-50'}`}>
                                        {isCalendarEditMode ? (
                                            <div className="flex items-center justify-end gap-2">
                                                <button onClick={() => removeCalendarOrigin(gIdx, oIdx)} className="text-gray-300 hover:text-red-500"><XMarkIcon className="w-3 h-3"/></button>
                                                <input type="text" value={org.name} onChange={e => updateOriginName(gIdx, oIdx, e.target.value)} className="font-black text-[10px] text-gray-600 uppercase bg-gray-50 border border-gray-200 rounded px-2 py-1 w-28 text-right outline-none focus:border-blue-400" />
                                            </div>
                                        ) : (
                                            <span className="font-black text-[10px] text-gray-600 uppercase">{org.name}</span>
                                        )}
                                    </td>

                                    {org.data.map((isActive, wIdx) => {
                                        const mIdx = Math.floor(wIdx / 4);
                                        const bgClass = mIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                                        const borderBottomClass = oIdx === cat.origins.length - 1 ? 'border-b-gray-200' : 'border-b-gray-50';
                                        return (
                                            <td 
                                                key={wIdx} 
                                                onMouseDown={() => handleCellMouseDown(gIdx, oIdx, wIdx)}
                                                onMouseEnter={() => handleCellMouseEnter(gIdx, oIdx, wIdx)}
                                                className={`p-[2px] border-r border-gray-100/50 text-center border-b ${borderBottomClass} ${bgClass} ${isCalendarEditMode ? 'cursor-pointer hover:bg-orange-100/50 transition-colors' : ''}`}
                                            >
                                                <div 
                                                    className={`w-full h-5 rounded-sm transition-all duration-200 pointer-events-none ${isActive ? 'scale-100 opacity-100' : 'scale-90 opacity-0'}`} 
                                                    style={{ backgroundColor: isActive ? cat.color : 'transparent' }}
                                                ></div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
        )}

        {/* BULK EDIT MODAL */}
        {isBulkEditOpen && (
          <div className="fixed inset-0 bg-black/60 z-[110] flex items-center justify-center p-4 backdrop-blur-sm overflow-hidden">
            <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl flex flex-col animate-in zoom-in duration-200 border border-gray-100 max-h-[90vh] overflow-hidden">
                <div className="flex justify-between items-center p-6 border-b border-gray-100 shrink-0 bg-white">
                    <div>
                        <h2 className="text-lg md:text-xl font-black text-gray-800 uppercase tracking-tight">Bulk Edit Products</h2>
                        <p className="text-[10px] md:text-xs text-gray-400 font-bold mt-1">Applying to <span className="text-blue-600">{selectedProducts.length}</span> items.</p>
                    </div>
                    <button onClick={() => setIsBulkEditOpen(false)} className="text-gray-400 hover:text-red-500 text-2xl font-bold bg-gray-50 hover:bg-red-50 w-10 h-10 rounded-full flex items-center justify-center transition-all pb-1">×</button>
                </div>
                
                <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0 custom-scrollbar bg-white">
                    <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
                        <label className="block text-[10px] font-black text-blue-600 uppercase tracking-widest mb-2">Override Category</label>
                        <input 
                            type="text" 
                            list="bulk-categories" 
                            className="w-full p-3 border border-blue-200 bg-white rounded-xl outline-none font-bold uppercase text-base md:text-xs focus:ring-2 focus:ring-blue-500" 
                            value={bulkEditData.Category} 
                            onChange={e => setBulkEditData({...bulkEditData, Category: e.target.value})} 
                            placeholder="-- Leave blank for no change --"
                        />
                        <datalist id="bulk-categories">{uniqueCategories.map(c => <option key={c} value={c} />)}</datalist>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Override Origin</label>
                        <input 
                            type="text" 
                            list="bulk-origins" 
                            className="w-full p-3 border border-gray-200 bg-white rounded-xl outline-none font-bold uppercase text-base md:text-xs focus:ring-2 focus:ring-green-500" 
                            value={bulkEditData.origin} 
                            onChange={e => setBulkEditData({...bulkEditData, origin: e.target.value})} 
                            placeholder="-- Leave blank for no change --"
                        />
                        <datalist id="bulk-origins">{uniqueOrigins.map(o => <option key={o} value={o} />)}</datalist>
                    </div>
                </div>
                
                <div className="flex justify-end gap-3 p-5 border-t border-gray-100 shrink-0 bg-gray-50">
                    <button onClick={() => setIsBulkEditOpen(false)} className="flex-1 sm:flex-none px-6 py-4 sm:py-3 bg-white border border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-100 transition-all active:scale-95 text-xs uppercase tracking-widest">Cancel</button>
                    <button onClick={handleBulkEditSave} className="flex-1 sm:flex-none px-8 py-4 sm:py-3 bg-blue-600 text-white font-black rounded-xl shadow-lg hover:bg-blue-700 transition-all active:scale-95 text-xs uppercase tracking-widest">Apply to {selectedProducts.length}</button>
                </div>
            </div>
          </div>
        )}

        {/* MODAL (MASTERLIST) */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-in zoom-in duration-200">
            <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl w-full max-w-3xl overflow-y-auto max-h-[95vh] border border-gray-100 flex flex-col">
              <div className="flex justify-between items-center mb-6 flex-shrink-0 border-b border-gray-100 pb-4">
                  <h2 className="text-xl md:text-2xl font-black text-gray-800 uppercase tracking-tight">{editingProduct ? 'Edit Product' : 'Add New Product'}</h2>
                  <button onClick={closeModal} className="text-gray-400 hover:text-red-500 text-3xl font-bold bg-gray-50 hover:bg-red-50 w-10 h-10 rounded-full flex items-center justify-center transition-all pb-1">×</button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-6 overflow-y-auto flex-1 pr-2 custom-scrollbar">
                <div className="space-y-4">
                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-2">Basic Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="col-span-1"><label className="block text-[10px] font-black text-gray-500 mb-1.5 uppercase tracking-widest ml-1">Code</label><input type="text" className="w-full border border-gray-200 rounded-xl p-3.5 bg-gray-50 font-mono text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500 transition-all font-bold" value={formData.ProductCode} onChange={(e) => setFormData({...formData, ProductCode: e.target.value})} required disabled={!!editingProduct} placeholder="e.g. A001" /></div>
                        <div className="col-span-1 md:col-span-2"><label className="block text-[10px] font-black text-gray-500 mb-1.5 uppercase tracking-widest ml-1">Product Name</label><input type="text" className="w-full border border-gray-200 rounded-xl p-3.5 text-xs font-black text-gray-800 uppercase focus:outline-none focus:ring-2 focus:ring-green-500 transition-all" value={formData.ProductName} onChange={(e) => setFormData({...formData, ProductName: e.target.value})} required placeholder="e.g. AUSTRALIAN CARROTS" /></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div><label className="block text-[10px] font-black text-gray-500 mb-1.5 uppercase tracking-widest ml-1">Category</label><input type="text" list="modal-categories" className="w-full border border-gray-200 rounded-xl p-3.5 text-xs font-black uppercase bg-white focus:outline-none focus:ring-2 focus:ring-green-500 transition-all" value={formData.Category} onChange={(e) => setFormData({...formData, Category: e.target.value})} placeholder="CATEGORY..." required /><datalist id="modal-categories">{uniqueCategories.map(c => <option key={c} value={c} />)}</datalist></div>
                        <div><label className="block text-[10px] font-black text-gray-500 mb-1.5 uppercase tracking-widest ml-1">Origin</label><input type="text" list="modal-origins" className="w-full border border-gray-200 rounded-xl p-3.5 text-xs font-black uppercase bg-white focus:outline-none focus:ring-2 focus:ring-green-500 transition-all" value={formData.origin} onChange={(e) => setFormData({...formData, origin: e.target.value})} placeholder="e.g. MALAYSIA" /><datalist id="modal-origins">{uniqueOrigins.map(o => <option key={o} value={o} />)}</datalist></div>
                        <div><label className="block text-[10px] font-black text-gray-500 mb-1.5 uppercase tracking-widest ml-1">Allowed UOMs</label><input type="text" className="w-full border border-gray-200 rounded-xl p-3.5 text-xs font-bold uppercase focus:outline-none focus:ring-2 focus:ring-green-500 transition-all" placeholder="e.g. KG, PKT, CTN" value={formData.AllowedUOMs} onChange={(e) => setFormData({...formData, AllowedUOMs: e.target.value})} required /></div>
                    </div>
                </div>
                <div className="space-y-4">
                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-2">Unit Settings</h3>
                    <div className="p-5 md:p-6 bg-blue-50/50 rounded-2xl border border-blue-100 shadow-sm">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                            <div><label className="block text-[9px] font-black text-blue-500 uppercase tracking-widest mb-1.5 ml-1">Base UOM</label><select className="w-full border border-blue-200 rounded-xl p-3 text-xs font-black uppercase text-blue-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-all" value={formData.BaseUOM} onChange={(e) => setFormData({...formData, BaseUOM: e.target.value})}>{getUOMOptions().map(u => <option key={u} value={u}>{u}</option>)}</select></div>
                            <div><label className="block text-[9px] font-black text-blue-500 uppercase tracking-widest mb-1.5 ml-1">Sales Default</label><select className="w-full border border-blue-200 rounded-xl p-3 text-xs font-bold uppercase bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-all" value={formData.SalesUOM} onChange={(e) => setFormData({...formData, SalesUOM: e.target.value})}>{getUOMOptions().map(u => <option key={u} value={u}>{u}</option>)}</select></div>
                            <div><label className="block text-[9px] font-black text-blue-500 uppercase tracking-widest mb-1.5 ml-1">Purchase Default</label><select className="w-full border border-blue-200 rounded-xl p-3 text-xs font-bold uppercase bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-all" value={formData.PurchaseUOM} onChange={(e) => setFormData({...formData, PurchaseUOM: e.target.value})}>{getUOMOptions().map(u => <option key={u} value={u}>{u}</option>)}</select></div>
                        </div>
                        {getSecondaryUOMs().length > 0 ? (
                            <div className="mt-6 pt-4 border-t border-blue-100">
                                <h4 className="text-[10px] font-black text-blue-600 mb-3 uppercase tracking-widest">Conversion Rates</h4>
                                <div className="space-y-2">{getSecondaryUOMs().map(uom => (<div key={uom} className="flex items-center gap-3 bg-white p-3 rounded-xl border border-blue-100 shadow-sm"><span className="font-black text-gray-800 text-sm w-16 text-right">1 {uom}</span><span className="text-gray-300 font-bold">=</span><input type="number" step="0.01" className="border border-gray-200 p-2.5 rounded-lg text-center font-black text-blue-600 outline-none focus:ring-2 focus:ring-blue-500 text-sm w-24 bg-gray-50" value={conversionFactors[uom] || ''} onChange={(e) => setConversionFactors({...conversionFactors, [uom]: e.target.value})} placeholder="?" required /><span className="text-xs font-black text-gray-500 uppercase">{formData.BaseUOM}</span></div>))}</div>
                            </div>
                        ) : <div className="mt-4 pt-4 border-t border-blue-100 text-[10px] font-bold text-blue-400 italic text-center">Single unit type detected.</div>}
                    </div>
                </div>
                <div className="flex justify-end gap-3 pt-6 border-t border-gray-100 mt-auto flex-shrink-0">
                  <button type="button" onClick={closeModal} className="px-6 py-4 bg-gray-100 text-gray-600 font-black uppercase tracking-widest rounded-2xl hover:bg-gray-200 transition-all active:scale-95 text-xs">Cancel</button>
                  <button type="submit" className="px-8 py-4 bg-green-600 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl hover:bg-green-700 active:scale-95 text-xs">{editingProduct ? 'Save Changes' : 'Create Product'}</button>
                </div>
              </form>
            </div>
          </div>
        )}
    </div>
  );
}