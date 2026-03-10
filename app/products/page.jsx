'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { 
  MagnifyingGlassIcon, 
  PlusIcon, 
  PencilSquareIcon, 
  TrashIcon,
  CalendarIcon,
  CubeIcon
} from '@heroicons/react/24/outline';

// ==========================================
// MOCK AVAILABILITY CALENDAR DATA
// ==========================================
const parseAvailability = (str) => str.replace(/\s/g, '').split('').map(c => c === '1');

const MOCK_CALENDAR = [
  {
    product: 'Apples',
    color: '#EF4444', // Red
    origins: [
      { name: 'FRANCE',      data: "1111 1111 1111 1111 1111 1111 1111 1111 1111 1111 1111 1111" },
      { name: 'ITALY',       data: "1111 1111 1111 1111 1111 1111 1111 1111 1111 1111 1111 1111" },
      { name: 'GERMANY',     data: "1111 1111 1111 1100 0000 0000 0000 0000 1111 1111 1111 1111" },
      { name: 'UK',          data: "1111 1111 1111 1111 1111 1111 1100 0000 1111 1111 1111 1111" },
      { name: 'SOUTH AFRICA',data: "0000 0000 0000 1111 1111 1111 1111 1111 0000 0000 0000 0000" },
      { name: 'POLAND',      data: "1111 1111 1111 0000 0000 0000 0000 0000 0000 1111 1111 1111" },
      { name: 'SPAIN',       data: "1111 1111 1111 0000 0000 0000 0000 0000 0000 1111 1111 1111" },
      { name: 'NEW ZEALAND', data: "0000 0000 0000 0000 1111 1111 1111 1111 1111 0000 0000 0000" },
    ]
  },
  {
    product: 'Avocados',
    color: '#856635', // Olive Brown
    origins: [
      { name: 'PERU',         data: "0000 0000 0000 1111 1111 1111 1111 1111 0000 0000 0000 0000" },
      { name: 'SOUTH AFRICA', data: "0000 0000 0000 1111 1111 1111 1111 1111 1111 1100 0000 0000" },
      { name: 'KENYA',        data: "0000 0000 0000 1111 1111 1111 0000 0000 0000 0000 0000 0000" },
      { name: 'SPAIN',        data: "1111 1111 1111 0000 0000 0000 0000 0000 0000 1111 1111 1111" },
    ]
  },
  {
    product: 'Bananas',
    color: '#EAB308', // Yellow
    origins: [
      { name: 'BELIZE',       data: "1111 1111 1111 1111 1111 1111 1111 1111 1111 1111 1111 1111" },
      { name: 'COSTA RICA',   data: "1111 1111 1111 1111 1111 1111 1111 1111 1111 1111 1111 1111" },
      { name: 'COLOMBIA',     data: "1111 1111 1111 1111 1111 1111 1111 1111 1111 1111 1111 1111" }
    ]
  },
  {
    product: 'Blueberries',
    color: '#1E3A8A', // Dark Blue
    origins: [
      { name: 'IRELAND',      data: "0000 0000 0000 0000 0000 0000 1111 1111 0000 0000 0000 0000" },
      { name: 'UK',           data: "0000 0000 0000 0000 0000 0000 1111 1111 0000 0000 0000 0000" },
      { name: 'POLAND',       data: "0000 0000 0000 0000 0000 1111 1111 1111 0000 0000 0000 0000" },
      { name: 'ARGENTINA',    data: "0000 0000 0000 0000 0000 0000 0000 0000 1111 1111 1111 1111" },
      { name: 'CHILE',        data: "1111 1111 1111 0000 0000 0000 0000 0000 0000 1111 1111 1111" },
      { name: 'MOROCCO',      data: "0000 1111 1111 1111 1111 0000 0000 0000 0000 0000 0000 0000" }
    ]
  },
  {
    product: 'Cherries',
    color: '#7F1D1D', // Dark Red
    origins: [
      { name: 'UK',           data: "0000 0000 0000 0000 0000 0000 1111 1111 0000 0000 0000 0000" },
      { name: 'BULGARIA',     data: "0000 0000 0000 0000 1111 1111 1111 0000 0000 0000 0000 0000" },
      { name: 'SPAIN',        data: "0000 0000 0000 1111 1111 1111 1111 1111 1111 0000 0000 0000" },
      { name: 'SOUTH AFRICA', data: "0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 1111 1111" },
      { name: 'ARGENTINA',    data: "1111 0000 0000 0000 0000 0000 0000 0000 0000 1111 1111 1111" }
    ]
  },
  {
    product: 'Citrus',
    color: '#F97316', // Orange
    origins: [
      { name: 'SPAIN',        data: "1111 1111 1111 1111 1111 0000 0000 0000 0000 0000 1111 1111" },
      { name: 'MOROCCO',      data: "1111 1111 1111 1111 1111 0000 0000 0000 0000 0000 1111 1111" },
      { name: 'SOUTH AFRICA', data: "0000 0000 0000 0000 1111 1111 1111 1111 1111 1111 0000 0000" },
      { name: 'ARGENTINA',    data: "0000 0000 0000 0000 1111 1111 1111 1111 1111 0000 0000 0000" }
    ]
  }
];

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
      code: '',
      name: '',
      category: '',
      baseUom: '',
      allowedUoms: ''
  });
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    ProductCode: '',
    ProductName: '',
    Category: '', // Changed from 'VEGE' to '' to show full datalist
    AllowedUOMs: 'KG',     
    BaseUOM: 'KG',
    SalesUOM: 'KG',        
    PurchaseUOM: 'KG'      
  });

  // Conversion State
  const [conversionFactors, setConversionFactors] = useState({});

  // 1. Fetch Products
  async function fetchProducts() {
    setLoading(true);
    const { data, error } = await supabase
      .from('ProductMaster')
      .select('*')
      .order('ProductName');
    
    if (error) console.error('Error fetching products:', error);
    else setProducts(data || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchProducts();
  }, []);

  // Update Base/Sales/Purchase UOMs when AllowedUOMs changes to ensure validity
  useEffect(() => {
    if (!isModalOpen) return;

    const options = formData.AllowedUOMs 
      ? formData.AllowedUOMs.split(',').map(u => u.trim().toUpperCase()).filter(u => u !== '')
      : [];

    if (options.length === 1) {
      const singleUOM = options[0];
      if (formData.BaseUOM !== singleUOM || formData.SalesUOM !== singleUOM || formData.PurchaseUOM !== singleUOM) {
        setFormData(prev => ({
          ...prev,
          BaseUOM: singleUOM,
          SalesUOM: singleUOM,
          PurchaseUOM: singleUOM
        }));
      }
    }
  }, [formData.AllowedUOMs, isModalOpen]);

  // 2. Handle Form Submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const cleanedAllowed = formData.AllowedUOMs.toUpperCase().split(',').map(u => u.trim()).join(',');
    
    const cleanedData = {
        ...formData,
        Category: formData.Category.toUpperCase().trim(), // Ensure category is saved in uppercase
        AllowedUOMs: cleanedAllowed,
        SalesUOM: formData.SalesUOM || formData.BaseUOM,
        PurchaseUOM: formData.PurchaseUOM || formData.BaseUOM,
        updated_at: new Date().toISOString() // Saving last update timestamp
    };

    // SAVE PRODUCT MASTER
    if (editingProduct) {
      const { error } = await supabase
        .from('ProductMaster')
        .update(cleanedData)
        .eq('ProductCode', editingProduct.ProductCode);

      if (error) { alert('Error updating: ' + error.message); return; }
    } else {
      const { data: existing } = await supabase
        .from('ProductMaster')
        .select('ProductCode') 
        .eq('ProductCode', formData.ProductCode)
        .single();

      if (existing) { alert('Error: Product Code already exists!'); return; }

      const { error } = await supabase.from('ProductMaster').insert([cleanedData]);
      if (error) { alert('Error adding: ' + error.message); return; }
    }

    // SAVE CONVERSIONS
    await supabase.from('UOM_Conversions').delete().eq('ProductCode', formData.ProductCode);

    const otherUOMs = getUOMOptions().filter(u => u !== formData.BaseUOM);
    const conversionRows = otherUOMs.map(uom => ({
        "ProductCode": formData.ProductCode,
        "BaseUOM": formData.BaseUOM,
        "ConversionUOM": uom,
        "Factor": conversionFactors[uom] || 0
    }));

    if (conversionRows.length > 0) {
        const { error: convError } = await supabase.from('UOM_Conversions').insert(conversionRows);
        if (convError) console.error("Error saving conversions:", convError);
    }

    alert('Product & Conversions saved successfully!');
    closeModal();
    fetchProducts();
  };

  // 3. Handle Delete
  const handleDelete = async (name, code) => {
    if (confirm(`Are you sure you want to delete "${name}"?`)) {
      await supabase.from('UOM_Conversions').delete().eq('ProductCode', code);
      const { error } = await supabase.from('ProductMaster').delete().eq('ProductCode', code);

      if (error) alert('Error deleting: ' + error.message);
      else fetchProducts();
    }
  };

  // Helper Functions
  const openAddModal = () => {
    setEditingProduct(null);
    setFormData({ 
        ProductCode: '', ProductName: '', Category: '', // Changed from 'VEGE' to ''
        AllowedUOMs: 'KG', BaseUOM: 'KG', SalesUOM: 'KG', PurchaseUOM: 'KG'
    });
    setConversionFactors({});
    setIsModalOpen(true);
  };

  const openEditModal = async (product) => {
    setEditingProduct(product);
    setFormData({
      ProductCode: product.ProductCode,
      ProductName: product.ProductName,
      Category: product.Category || 'VEGE',
      AllowedUOMs: product.AllowedUOMs || 'KG',
      BaseUOM: product.BaseUOM || 'KG',
      SalesUOM: product.SalesUOM || product.BaseUOM || 'KG',
      PurchaseUOM: product.PurchaseUOM || product.BaseUOM || 'KG'
    });

    const { data: convs } = await supabase
        .from('UOM_Conversions')
        .select('ConversionUOM, Factor')
        .eq('ProductCode', product.ProductCode);
    
    const factors = {};
    if (convs) {
        convs.forEach(c => factors[c.ConversionUOM] = c.Factor);
    }
    setConversionFactors(factors);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
  };

  const getUOMOptions = () => {
    if (!formData.AllowedUOMs) return [];
    return formData.AllowedUOMs.split(',').map(u => u.trim().toUpperCase()).filter(u => u !== '');
  };

  const getSecondaryUOMs = () => {
    return getUOMOptions().filter(u => u !== formData.BaseUOM);
  };

  // ==========================================
  // TABLE FILTERING & CATEGORY LOGIC
  // ==========================================
  // Dynamically extract all unique categories from products
  const uniqueCategories = useMemo(() => {
      const cats = new Set(products.map(p => p.Category).filter(Boolean));
      // Add default fallbacks just in case the DB is empty
      ['VEGE', 'IMPORT FRUITS', 'LOCAL FRUITS', 'OTHERS'].forEach(c => cats.add(c));
      return Array.from(cats).sort();
  }, [products]);

  const filterCategories = ['All', ...uniqueCategories];

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const handleClearFilters = () => {
      setColumnFilters({ code: '', name: '', category: '', baseUom: '', allowedUoms: '' });
  };

  const filteredAndSortedProducts = useMemo(() => {
      let filtered = products.filter(p => {
          // 1. Global Token-based fuzzy search
          const searchTerms = searchTerm.toLowerCase().split(' ').filter(t => t);
          const productString = `${p.ProductName || ''} ${p.ProductCode || ''}`.toLowerCase();
          const matchesSearch = searchTerms.length === 0 || searchTerms.every(term => productString.includes(term));
          
          // 2. Global Category Dropdown
          const matchesCategory = selectedCategory === 'All' || p.Category === selectedCategory;
          
          // 3. Individual Column Filters
          const matchesColCode = !columnFilters.code || (p.ProductCode || '').toLowerCase().includes(columnFilters.code.toLowerCase());
          const matchesColName = !columnFilters.name || (p.ProductName || '').toLowerCase().includes(columnFilters.name.toLowerCase());
          const matchesColCat = !columnFilters.category || (p.Category || '').toLowerCase().includes(columnFilters.category.toLowerCase());
          const matchesColBase = !columnFilters.baseUom || (p.BaseUOM || '').toLowerCase().includes(columnFilters.baseUom.toLowerCase());
          const matchesColAllow = !columnFilters.allowedUoms || (p.AllowedUOMs || '').toLowerCase().includes(columnFilters.allowedUoms.toLowerCase());

          return matchesSearch && matchesCategory && matchesColCode && matchesColName && matchesColCat && matchesColBase && matchesColAllow;
      });

      // Sorting
      if (sortConfig.key) {
          filtered.sort((a, b) => {
              let aVal = a[sortConfig.key];
              let bVal = b[sortConfig.key];

              // Handle Timestamp Sorting Specifically
              if (sortConfig.key === 'lastUpdate') {
                  aVal = new Date(a.updated_at || a.created_at || a.Timestamp || 0).getTime();
                  bVal = new Date(b.updated_at || b.created_at || b.Timestamp || 0).getTime();
              } else {
                  aVal = (aVal || '').toString().toLowerCase();
                  bVal = (bVal || '').toString().toLowerCase();
              }

              if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
              if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
              return 0;
          });
      }

      return filtered;
  }, [products, searchTerm, selectedCategory, columnFilters, sortConfig]);

  if (loading) return <div className="p-10 flex h-screen items-center justify-center bg-gray-50/50 text-gray-400 font-black tracking-widest uppercase animate-pulse">Loading Catalog...</div>;

  return (
    <div className="p-3 md:p-8 max-w-full overflow-x-hidden min-h-screen bg-gray-50/50 pb-32 animate-in fade-in duration-300">
        
        {/* HEADER */}
        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
              <h1 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight">Product Management</h1>
              <p className="text-[10px] md:text-xs text-gray-400 font-bold uppercase mt-1">Manage inventory items and UOM settings</p>
          </div>
          <button 
            onClick={openAddModal}
            className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-black py-3 px-6 rounded-2xl shadow-sm transform transition active:scale-95 flex items-center justify-center gap-2 text-xs uppercase tracking-widest"
          >
            <PlusIcon className="w-5 h-5" strokeWidth={3} /> Add Product
          </button>
        </div>

        {/* TABS */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 border-b border-gray-200">
            <button 
                onClick={() => setActiveTab('masterlist')} 
                className={`px-5 py-2.5 rounded-t-xl font-bold text-sm transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === 'masterlist' ? 'bg-green-600 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-100'}`}
            >
                <CubeIcon className="w-5 h-5" /> Product Masterlist
            </button>
            <button 
                onClick={() => setActiveTab('calendar')} 
                className={`px-5 py-2.5 rounded-t-xl font-bold text-sm transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === 'calendar' ? 'bg-orange-500 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-100'}`}
            >
                <CalendarIcon className="w-5 h-5" /> Availability Calendar
            </button>
        </div>

        {/* ==========================================
            TAB 1: PRODUCT MASTERLIST
            ========================================== */}
        {activeTab === 'masterlist' && (
        <div className="bg-white p-4 md:p-6 rounded-[2rem] shadow-xl border border-gray-100 flex flex-col h-[calc(100vh-180px)] min-h-[500px]">
            <div className="flex flex-col sm:flex-row gap-4 mb-6 flex-none">
              <div className="relative flex-1">
                 <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <MagnifyingGlassIcon className="w-5 h-5 text-gray-400" />
                 </div>
                 <input 
                    type="text" 
                    placeholder="Search by name or code..." 
                    className="w-full pl-12 p-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-green-500 transition-all text-xs font-bold"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                 />
              </div>
              <div className="w-full sm:w-64">
                 <select 
                    className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-green-500 transition-all text-xs font-bold text-gray-700 uppercase"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                 >
                    {filterCategories.map(c => <option key={c} value={c}>{c}</option>)}
                 </select>
              </div>
            </div>

            {/* PRODUCT TABLE WITH SORTING & FILTERING */}
            <div className="flex-1 overflow-auto custom-scrollbar border border-gray-100 rounded-3xl">
                <table className="w-full text-left whitespace-nowrap min-w-[1000px]">
                  <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest sticky top-0 z-10 shadow-sm border-b border-gray-100">
                    <tr>
                      <th className="p-4 pl-6 cursor-pointer hover:text-black select-none" onClick={() => requestSort('ProductCode')}>Code {sortConfig.key === 'ProductCode' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                      <th className="p-4 cursor-pointer hover:text-black select-none" onClick={() => requestSort('ProductName')}>Product Name {sortConfig.key === 'ProductName' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                      <th className="p-4 cursor-pointer hover:text-black select-none" onClick={() => requestSort('Category')}>Category {sortConfig.key === 'Category' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                      <th className="p-4 text-center cursor-pointer hover:text-black select-none" onClick={() => requestSort('BaseUOM')}>Base UOM {sortConfig.key === 'BaseUOM' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                      <th className="p-4 cursor-pointer hover:text-black select-none" onClick={() => requestSort('AllowedUOMs')}>Allowed UOMs {sortConfig.key === 'AllowedUOMs' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                      <th className="p-4 cursor-pointer hover:text-black select-none" onClick={() => requestSort('lastUpdate')}>Last Update {sortConfig.key === 'lastUpdate' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                      <th className="p-4 text-right pr-6">Actions</th>
                    </tr>
                    {/* Inline Column Filter Row */}
                    <tr className="bg-white border-t border-gray-200 shadow-[0_2px_4px_rgba(0,0,0,0.02)]">
                        <th className="p-2 pl-4"><input type="text" placeholder="Filter Code..." className="w-full p-2 rounded-lg border border-gray-200 text-[10px] font-bold normal-case outline-none focus:ring-2 focus:ring-green-500 bg-gray-50" value={columnFilters.code} onChange={e => setColumnFilters({...columnFilters, code: e.target.value})} /></th>
                        <th className="p-2"><input type="text" placeholder="Filter Name..." className="w-full p-2 rounded-lg border border-gray-200 text-[10px] font-bold normal-case outline-none focus:ring-2 focus:ring-green-500 bg-gray-50" value={columnFilters.name} onChange={e => setColumnFilters({...columnFilters, name: e.target.value})} /></th>
                        <th className="p-2"><input type="text" placeholder="Filter Category..." className="w-full p-2 rounded-lg border border-gray-200 text-[10px] font-bold normal-case outline-none focus:ring-2 focus:ring-green-500 bg-gray-50" value={columnFilters.category} onChange={e => setColumnFilters({...columnFilters, category: e.target.value})} /></th>
                        <th className="p-2"><input type="text" placeholder="Filter UOM..." className="w-full p-2 rounded-lg border border-gray-200 text-[10px] font-bold normal-case outline-none focus:ring-2 focus:ring-green-500 bg-gray-50 text-center" value={columnFilters.baseUom} onChange={e => setColumnFilters({...columnFilters, baseUom: e.target.value})} /></th>
                        <th className="p-2"><input type="text" placeholder="Filter Allowed..." className="w-full p-2 rounded-lg border border-gray-200 text-[10px] font-bold normal-case outline-none focus:ring-2 focus:ring-green-500 bg-gray-50" value={columnFilters.allowedUoms} onChange={e => setColumnFilters({...columnFilters, allowedUoms: e.target.value})} /></th>
                        <th className="p-2"></th>
                        <th className="p-2 pr-6 text-right"><button onClick={handleClearFilters} className="text-gray-400 hover:text-red-600 font-bold uppercase tracking-widest text-[9px] bg-white border border-gray-200 px-3 py-1.5 rounded-lg shadow-sm transition-colors w-full">Clear</button></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-sm font-bold text-gray-700">
                    {filteredAndSortedProducts.map((p) => {
                      // Dynamically pull the latest available timestamp
                      const dStr = p.updated_at || p.created_at || p.Timestamp;
                      let formattedDate = '-';
                      if (dStr) {
                          const d = new Date(dStr);
                          if (!isNaN(d)) formattedDate = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute:'2-digit' });
                      }

                      return (
                      <tr key={p.ProductCode || p.id} className="hover:bg-green-50/30 transition-colors group/row">
                        <td className="p-4 pl-6">
                            <span className="font-mono text-[10px] font-black text-gray-500 bg-gray-100 px-2.5 py-1 rounded border border-gray-200">
                                {p.ProductCode}
                            </span>
                        </td>
                        <td className="p-4 font-black text-gray-800 uppercase">{p.ProductName}</td>
                        <td className="p-4">
                            <span className="text-[9px] font-black px-2.5 py-1 rounded-md uppercase bg-blue-50 text-blue-600 border border-blue-100 tracking-widest">
                                {p.Category}
                            </span>
                        </td>
                        <td className="p-4 text-center font-black text-gray-700">{p.BaseUOM}</td>
                        <td className="p-4 text-[10px] text-gray-500 font-medium whitespace-normal leading-tight max-w-[200px]">{p.AllowedUOMs}</td>
                        <td className="p-4 font-mono text-[10px] text-gray-400 font-medium">
                            {formattedDate}
                        </td>
                        <td className="p-4 text-right pr-6">
                          <div className="flex justify-end gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
                              <button 
                                onClick={() => openEditModal(p)}
                                className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition"
                                title="Edit Product"
                              >
                                <PencilSquareIcon className="w-5 h-5" />
                              </button>
                              <button 
                                onClick={() => handleDelete(p.ProductName, p.ProductCode)}
                                className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition"
                                title="Delete Product"
                              >
                                <TrashIcon className="w-5 h-5" />
                              </button>
                          </div>
                        </td>
                      </tr>
                    )})}
                    {filteredAndSortedProducts.length === 0 && (
                      <tr>
                        <td colSpan="7" className="p-16 text-center text-gray-400 italic font-bold">No products found matching your search or filters.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
            </div>
        </div>
        )}

        {/* ==========================================
            TAB 2: AVAILABILITY CALENDAR
            ========================================== */}
        {activeTab === 'calendar' && (
        <div className="bg-white p-4 md:p-6 rounded-[2rem] shadow-xl border border-gray-100 flex flex-col h-[calc(100vh-180px)] min-h-[500px] animate-in fade-in">
            <div className="mb-6 flex-none">
                <h2 className="text-xl font-black text-gray-800 tracking-tight">Global Availability Calendar</h2>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Seasonal sourcing matrix by country of origin</p>
            </div>
            
            <div className="flex-1 overflow-auto custom-scrollbar border border-gray-200 rounded-2xl relative">
                <table className="w-full text-left border-collapse min-w-[1200px] text-xs">
                    <thead className="bg-gray-50 text-[10px] font-black text-gray-500 uppercase tracking-widest sticky top-0 z-20 shadow-sm">
                        <tr>
                            <th rowSpan={2} className="p-4 bg-gray-50 sticky left-0 z-30 border-r border-gray-200 w-32 border-b">Product</th>
                            <th rowSpan={2} className="p-4 bg-gray-50 sticky left-32 z-30 border-r border-gray-200 w-40 text-right border-b">Origin</th>
                            {['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'].map(m => (
                                <th key={m} colSpan={4} className="p-2 text-center border-r border-gray-200 bg-gray-100">{m}</th>
                            ))}
                        </tr>
                        <tr className="bg-white border-b border-gray-200">
                            {Array.from({length: 12}).map((_, mi) => (
                                [1,2,3,4].map(w => (
                                    <th key={`${mi}-${w}`} className="p-1 text-center border-r border-gray-200 text-[8px] text-gray-400 bg-gray-50">{w}</th>
                                ))
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium">
                        {MOCK_CALENDAR.map(cat => (
                            cat.origins.map((org, idx) => (
                                <tr key={`${cat.product}-${org.name}`} className="hover:bg-orange-50/30 transition-colors">
                                    {idx === 0 && (
                                        <td rowSpan={cat.origins.length} className="p-3 bg-white sticky left-0 z-10 border-r border-gray-200 align-top shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                                            <span className="font-black text-sm uppercase tracking-tight" style={{color: cat.color}}>{cat.product}</span>
                                        </td>
                                    )}
                                    <td className="p-2 pr-4 bg-white sticky left-32 z-10 border-r border-gray-200 text-right font-black text-[10px] text-gray-600 uppercase shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                                        {org.name}
                                    </td>
                                    {parseAvailability(org.data).map((isActive, wIdx) => (
                                        <td key={wIdx} className="p-[2px] border-r border-gray-100/50 text-center">
                                            <div 
                                                className="w-full h-4 rounded-sm transition-colors" 
                                                style={{ backgroundColor: isActive ? cat.color : 'transparent' }}
                                                title={isActive ? `${cat.product} from ${org.name}` : ''}
                                            ></div>
                                        </td>
                                    ))}
                                </tr>
                            ))
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
        )}

        {/* --- MODAL (POPUP) --- */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-in zoom-in duration-200">
            <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl w-full max-w-3xl overflow-y-auto max-h-[95vh] border border-gray-100 flex flex-col">
              <div className="flex justify-between items-center mb-6 flex-shrink-0 border-b border-gray-100 pb-4">
                  <h2 className="text-xl md:text-2xl font-black text-gray-800 uppercase tracking-tight">
                    {editingProduct ? 'Edit Product' : 'Add New Product'}
                  </h2>
                  <button onClick={closeModal} className="text-gray-400 hover:text-red-500 text-3xl font-bold bg-gray-50 hover:bg-red-50 w-10 h-10 rounded-full flex items-center justify-center transition-all pb-1">×</button>
              </div>
              
              <form onSubmit={handleSubmit} className="space-y-6 overflow-y-auto flex-1 pr-2 custom-scrollbar">
                
                {/* Basic Info Section */}
                <div className="space-y-4">
                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-2">Basic Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="col-span-1">
                            <label className="block text-[10px] font-black text-gray-500 mb-1.5 uppercase tracking-widest ml-1">Code</label>
                            <input 
                                type="text" 
                                className="w-full border border-gray-200 rounded-xl p-3.5 bg-gray-50 font-mono text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500 transition-all font-bold"
                                value={formData.ProductCode}
                                onChange={(e) => setFormData({...formData, ProductCode: e.target.value})}
                                required
                                disabled={!!editingProduct} 
                                placeholder="e.g. A001"
                            />
                        </div>
                        <div className="col-span-1 md:col-span-2">
                            <label className="block text-[10px] font-black text-gray-500 mb-1.5 uppercase tracking-widest ml-1">Product Name</label>
                            <input 
                                type="text" 
                                className="w-full border border-gray-200 rounded-xl p-3.5 text-xs font-black text-gray-800 uppercase focus:outline-none focus:ring-2 focus:ring-green-500 transition-all"
                                value={formData.ProductName}
                                onChange={(e) => setFormData({...formData, ProductName: e.target.value})}
                                required
                                placeholder="e.g. AUSTRALIAN CARROTS"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-black text-gray-500 mb-1.5 uppercase tracking-widest ml-1">Category</label>
                            <input 
                                type="text"
                                list="modal-categories"
                                className="w-full border border-gray-200 rounded-xl p-3.5 text-xs font-black uppercase bg-white focus:outline-none focus:ring-2 focus:ring-green-500 transition-all"
                                value={formData.Category}
                                onChange={(e) => setFormData({...formData, Category: e.target.value})}
                                placeholder="TYPE OR SELECT CATEGORY..."
                                required
                            />
                            <datalist id="modal-categories">
                                {uniqueCategories.map(c => <option key={c} value={c} />)}
                            </datalist>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-gray-500 mb-1.5 uppercase tracking-widest ml-1">Allowed UOMs (Comma Separated)</label>
                            <input 
                                type="text" 
                                className="w-full border border-gray-200 rounded-xl p-3.5 text-xs font-bold uppercase focus:outline-none focus:ring-2 focus:ring-green-500 transition-all"
                                placeholder="e.g. KG, PKT, CTN"
                                value={formData.AllowedUOMs}
                                onChange={(e) => setFormData({...formData, AllowedUOMs: e.target.value})}
                                required
                            />
                        </div>
                    </div>
                </div>

                {/* UOM Settings Section */}
                <div className="space-y-4">
                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-2">Unit Settings</h3>
                    
                    <div className="p-5 md:p-6 bg-blue-50/50 rounded-2xl border border-blue-100 shadow-sm">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                            <div>
                                <label className="block text-[9px] font-black text-blue-500 uppercase tracking-widest mb-1.5 ml-1">Base UOM</label>
                                <select 
                                    className="w-full border border-blue-200 rounded-xl p-3 text-xs font-black uppercase text-blue-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-all"
                                    value={formData.BaseUOM}
                                    onChange={(e) => setFormData({...formData, BaseUOM: e.target.value})}
                                >
                                    {getUOMOptions().map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[9px] font-black text-blue-500 uppercase tracking-widest mb-1.5 ml-1">Sales Default</label>
                                <select 
                                    className="w-full border border-blue-200 rounded-xl p-3 text-xs font-bold uppercase bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-all"
                                    value={formData.SalesUOM}
                                    onChange={(e) => setFormData({...formData, SalesUOM: e.target.value})}
                                >
                                    {getUOMOptions().map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[9px] font-black text-blue-500 uppercase tracking-widest mb-1.5 ml-1">Purchase Default</label>
                                <select 
                                    className="w-full border border-blue-200 rounded-xl p-3 text-xs font-bold uppercase bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-all"
                                    value={formData.PurchaseUOM}
                                    onChange={(e) => setFormData({...formData, PurchaseUOM: e.target.value})}
                                >
                                    {getUOMOptions().map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Conversion Rates - ONLY IF >1 UOM */}
                        {getSecondaryUOMs().length > 0 ? (
                            <div className="mt-6 pt-4 border-t border-blue-100">
                                <h4 className="text-[10px] font-black text-blue-600 mb-3 uppercase tracking-widest">Conversion Rates (to Base)</h4>
                                <div className="space-y-2">
                                    {getSecondaryUOMs().map(uom => (
                                        <div key={uom} className="flex items-center gap-3 bg-white p-3 rounded-xl border border-blue-100 shadow-sm">
                                            <span className="font-black text-gray-800 text-sm w-16 text-right">1 {uom}</span>
                                            <span className="text-gray-300 font-bold">=</span>
                                            <input 
                                                type="number" 
                                                step="0.01"
                                                className="border border-gray-200 p-2.5 rounded-lg text-center font-black text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm w-24 bg-gray-50"
                                                value={conversionFactors[uom] || ''}
                                                onChange={(e) => setConversionFactors({
                                                    ...conversionFactors, 
                                                    [uom]: e.target.value
                                                })}
                                                placeholder="?"
                                                required
                                            />
                                            <span className="text-xs font-black text-gray-500 uppercase">{formData.BaseUOM}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="mt-4 pt-4 border-t border-blue-100 text-[10px] font-bold text-blue-400 italic text-center">
                                Single unit type detected. No conversion factors needed.
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Buttons */}
                <div className="flex justify-end gap-3 pt-6 border-t border-gray-100 mt-auto flex-shrink-0">
                  <button 
                    type="button"
                    onClick={closeModal}
                    className="px-6 py-4 bg-gray-100 text-gray-600 font-black uppercase tracking-widest rounded-2xl hover:bg-gray-200 transition-all active:scale-95 text-xs"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-8 py-4 bg-green-600 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl hover:bg-green-700 hover:shadow-green-500/30 transition-all active:scale-95 text-xs"
                  >
                    {editingProduct ? 'Save Changes' : 'Create Product'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

    </div>
  );
}