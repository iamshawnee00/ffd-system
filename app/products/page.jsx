'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import Sidebar from '../components/Sidebar';

export default function ProductManagementPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    ProductCode: '',
    ProductName: '',
    Category: 'VEGE',
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
        AllowedUOMs: cleanedAllowed,
        SalesUOM: formData.SalesUOM || formData.BaseUOM,
        PurchaseUOM: formData.PurchaseUOM || formData.BaseUOM
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
        ProductCode: '', ProductName: '', Category: 'VEGE', 
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

  // FILTER LOGIC
  const categories = ['All', ...new Set(products.map(p => p.Category || 'Others'))];

  const filteredProducts = products.filter(p => {
    const matchesSearch = (p.ProductName + ' ' + p.ProductCode).toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || p.Category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  if (loading) return <div className="flex h-screen items-center justify-center bg-gray-50 text-gray-500 font-bold">Loading Products...</div>;

  return (
    <div className="p-3 md:p-6 max-w-full overflow-x-hidden pt-16 md:pt-6">
        
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
          <div>
              <h1 className="text-xl md:text-3xl font-black text-gray-800 tracking-tight">Product Management</h1>
              <p className="text-[10px] md:text-sm text-gray-400 font-medium mt-1">Manage inventory items and UOM settings</p>
          </div>
          <button 
            onClick={openAddModal}
            className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 px-6 rounded-xl shadow-lg transform transition active:scale-95 flex items-center justify-center gap-2 text-xs md:text-sm"
          >
            <span className="text-lg leading-none">+</span> Add New Product
          </button>
        </div>

        {/* FILTERS */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-gray-400 text-lg">🔍</span>
             </div>
             <input 
                type="text" 
                placeholder="Search by name or code..." 
                className="w-full pl-10 p-3 bg-white border border-gray-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 transition-all text-base md:text-sm font-medium"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
             />
          </div>
          <div className="w-full sm:w-64">
             <select 
                className="w-full p-3 bg-white border border-gray-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 transition-all text-base md:text-sm font-bold text-gray-600"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
             >
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
             </select>
          </div>
        </div>

        {/* PRODUCT TABLE */}
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead className="bg-gray-50 text-gray-500 text-[10px] md:text-xs font-bold uppercase tracking-wider border-b border-gray-100">
                <tr>
                  <th className="p-4 md:p-5">Code</th>
                  <th className="p-4 md:p-5">Product Name</th>
                  <th className="p-4 md:p-5">Category</th>
                  <th className="p-4 md:p-5 text-center">Base UOM</th>
                  <th className="p-4 md:p-5">Allowed UOMs</th>
                  <th className="p-4 md:p-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-xs md:text-sm">
                {filteredProducts.map((p) => (
                  <tr key={p.ProductCode || p.id} className="hover:bg-green-50/30 transition-colors group">
                    <td className="p-4 md:p-5">
                        <span className="font-mono text-[10px] md:text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-lg border border-gray-200">
                            {p.ProductCode}
                        </span>
                    </td>
                    <td className="p-4 md:p-5 font-bold text-gray-800">{p.ProductName}</td>
                    <td className="p-4 md:p-5">
                        <span className="text-[9px] md:text-[10px] font-bold px-2 py-1 rounded-full uppercase bg-blue-50 text-blue-600 border border-blue-100">
                            {p.Category}
                        </span>
                    </td>
                    <td className="p-4 md:p-5 text-center font-black text-gray-700">{p.BaseUOM}</td>
                    <td className="p-4 md:p-5 text-[10px] md:text-xs text-gray-500 font-medium">{p.AllowedUOMs}</td>
                    <td className="p-4 md:p-5 text-right">
                      <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => openEditModal(p)}
                            className="text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 md:px-3 md:py-1.5 rounded-lg font-bold text-[10px] md:text-xs transition"
                          >
                            Edit
                          </button>
                          <button 
                            onClick={() => handleDelete(p.ProductName, p.ProductCode)}
                            className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2 py-1 md:px-3 md:py-1.5 rounded-lg font-bold text-[10px] md:text-xs transition"
                          >
                            Delete
                          </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredProducts.length === 0 && (
                  <tr>
                    <td colSpan="6" className="p-10 text-center text-gray-400 italic">No products found matching your search.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* --- MODAL (POPUP) --- */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-2xl w-full max-w-2xl overflow-y-auto max-h-[90vh] border border-gray-200 flex flex-col">
              <div className="flex justify-between items-center mb-6 flex-shrink-0">
                  <h2 className="text-xl md:text-2xl font-black text-gray-800">
                    {editingProduct ? 'Edit Product' : 'Add New Product'}
                  </h2>
                  <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-2xl font-bold p-2">&times;</button>
              </div>
              
              <form onSubmit={handleSubmit} className="space-y-6 overflow-y-auto flex-1 pr-1 custom-scrollbar">
                
                {/* Basic Info Section */}
                <div className="space-y-4">
                    <h3 className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest border-b pb-2">Basic Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="col-span-1">
                            <label className="block text-[10px] md:text-xs font-bold text-gray-500 mb-1 uppercase">Code</label>
                            <input 
                                type="text" 
                                className="w-full border border-gray-200 rounded-xl p-3 bg-gray-50 font-mono text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500 transition"
                                value={formData.ProductCode}
                                onChange={(e) => setFormData({...formData, ProductCode: e.target.value})}
                                required
                                disabled={!!editingProduct} 
                                placeholder="e.g. A001"
                            />
                        </div>
                        <div className="col-span-1 md:col-span-2">
                            <label className="block text-[10px] md:text-xs font-bold text-gray-500 mb-1 uppercase">Product Name</label>
                            <input 
                                type="text" 
                                className="w-full border border-gray-200 rounded-xl p-3 text-sm font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 transition"
                                value={formData.ProductName}
                                onChange={(e) => setFormData({...formData, ProductName: e.target.value})}
                                required
                                placeholder="e.g. Australian Carrots"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] md:text-xs font-bold text-gray-500 mb-1 uppercase">Category</label>
                            <select 
                                className="w-full border border-gray-200 rounded-xl p-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                                value={formData.Category}
                                onChange={(e) => setFormData({...formData, Category: e.target.value})}
                            >
                                <option value="VEGE">VEGE</option>
                                <option value="IMPORT FRUITS">IMPORT FRUITS</option>
                                <option value="LOCAL FRUITS">LOCAL FRUITS</option>
                                <option value="OTHERS">OTHERS</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] md:text-xs font-bold text-gray-500 mb-1 uppercase">Allowed UOMs</label>
                            <input 
                                type="text" 
                                className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
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
                    <h3 className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest border-b pb-2">Unit Settings</h3>
                    
                    <div className="p-4 md:p-5 bg-blue-50/50 rounded-2xl border border-blue-100">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                            <div>
                                <label className="block text-[9px] md:text-[10px] font-bold text-blue-400 uppercase mb-1">Base UOM</label>
                                <select 
                                    className="w-full border border-blue-200 rounded-lg p-2 text-sm font-bold text-blue-900 bg-white focus:outline-none"
                                    value={formData.BaseUOM}
                                    onChange={(e) => setFormData({...formData, BaseUOM: e.target.value})}
                                >
                                    {getUOMOptions().map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[9px] md:text-[10px] font-bold text-blue-400 uppercase mb-1">Sales Default</label>
                                <select 
                                    className="w-full border border-blue-200 rounded-lg p-2 text-sm bg-white focus:outline-none"
                                    value={formData.SalesUOM}
                                    onChange={(e) => setFormData({...formData, SalesUOM: e.target.value})}
                                >
                                    {getUOMOptions().map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[9px] md:text-[10px] font-bold text-blue-400 uppercase mb-1">Purchase Default</label>
                                <select 
                                    className="w-full border border-blue-200 rounded-lg p-2 text-sm bg-white focus:outline-none"
                                    value={formData.PurchaseUOM}
                                    onChange={(e) => setFormData({...formData, PurchaseUOM: e.target.value})}
                                >
                                    {getUOMOptions().map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Conversion Rates - ONLY IF >1 UOM */}
                        {getSecondaryUOMs().length > 0 ? (
                            <div className="mt-4 pt-4 border-t border-blue-200">
                                <h4 className="text-[9px] md:text-[10px] font-bold text-blue-500 mb-2 uppercase">Conversion Rates (to Base)</h4>
                                <div className="space-y-2">
                                    {getSecondaryUOMs().map(uom => (
                                        <div key={uom} className="flex items-center gap-2 bg-white p-2 rounded-lg border border-blue-100 shadow-sm">
                                            <span className="font-bold text-gray-700 text-sm w-16 text-right">1 {uom}</span>
                                            <span className="text-gray-400">=</span>
                                            <input 
                                                type="number" 
                                                step="0.01"
                                                className="border border-gray-300 p-1 w-20 rounded text-center font-bold text-blue-600 focus:outline-none focus:border-blue-500 text-base md:text-sm"
                                                value={conversionFactors[uom] || ''}
                                                onChange={(e) => setConversionFactors({
                                                    ...conversionFactors, 
                                                    [uom]: e.target.value
                                                })}
                                                placeholder="?"
                                                required
                                            />
                                            <span className="text-xs font-bold text-gray-500">{formData.BaseUOM}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="mt-4 pt-4 border-t border-blue-200 text-[10px] text-blue-400 italic text-center">
                                Single unit type detected. No conversion needed.
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Buttons */}
                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 mt-auto flex-shrink-0">
                  <button 
                    type="button"
                    onClick={closeModal}
                    className="px-6 py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-xl transition text-xs md:text-sm"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-8 py-3 bg-green-600 text-white font-bold rounded-xl shadow-lg hover:bg-green-700 hover:shadow-green-500/30 transform transition active:scale-95 text-xs md:text-sm"
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