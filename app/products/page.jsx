'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import Sidebar from '../components/Sidebar';

export default function ProductManagementPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
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

  // Conversion State: Stores factors like { "CTN": 28, "PKT": 5 }
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

  // 2. Handle Form Submit (Add or Edit)
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Clean up UOMs
    const cleanedAllowed = formData.AllowedUOMs.toUpperCase().split(',').map(u => u.trim()).join(',');
    
    const cleanedData = {
        ...formData,
        AllowedUOMs: cleanedAllowed,
        SalesUOM: formData.SalesUOM || formData.BaseUOM,
        PurchaseUOM: formData.PurchaseUOM || formData.BaseUOM
    };

    // --- SAVE PRODUCT MASTER ---
    if (editingProduct) {
      const { error } = await supabase
        .from('ProductMaster')
        .update(cleanedData)
        .eq('id', editingProduct.id);

      if (error) { alert('Error updating: ' + error.message); return; }
    } else {
      // Check duplicate
      const { data: existing } = await supabase
        .from('ProductMaster')
        .select('id')
        .eq('ProductCode', formData.ProductCode)
        .single();

      if (existing) { alert('Error: Product Code already exists!'); return; }

      const { error } = await supabase.from('ProductMaster').insert([cleanedData]);
      if (error) { alert('Error adding: ' + error.message); return; }
    }

    // --- SAVE CONVERSIONS ---
    // 1. Delete old conversions for this product (Clean slate approach)
    await supabase.from('UOM_Conversions').delete().eq('ProductCode', formData.ProductCode);

    // 2. Prepare new rows
    const otherUOMs = getUOMOptions().filter(u => u !== formData.BaseUOM);
    const conversionRows = otherUOMs.map(uom => ({
        "ProductCode": formData.ProductCode,
        "BaseUOM": formData.BaseUOM,
        "ConversionUOM": uom,
        "Factor": conversionFactors[uom] || 0 // Default to 0 if not set
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
  const handleDelete = async (id, name, code) => {
    if (confirm(`Are you sure you want to delete "${name}"?`)) {
      // Delete conversions first
      await supabase.from('UOM_Conversions').delete().eq('ProductCode', code);
      // Delete product
      const { error } = await supabase.from('ProductMaster').delete().eq('id', id);

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

    // Fetch existing conversions
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

  // Get UOMs that are NOT the base (need conversion)
  const getSecondaryUOMs = () => {
    return getUOMOptions().filter(u => u !== formData.BaseUOM);
  };

  // FUZZY SEARCH LOGIC
  const filteredProducts = products.filter(p => {
    if (!searchTerm) return true;
    const lowerTerm = searchTerm.toLowerCase();
    const searchParts = lowerTerm.split(' '); // Split by space for multi-word matching

    const combinedText = (
      (p.ProductName || '') + ' ' + 
      (p.ProductCode || '') + ' ' + 
      (p.Category || '')
    ).toLowerCase();

    // Check if EVERY part of the search term exists in the combined text
    return searchParts.every(part => combinedText.includes(part));
  });

  if (loading) return <div className="p-10 ml-64">Loading Products...</div>;

  return (
    <div className="flex bg-gray-50 min-h-screen">
      <Sidebar />
      <main className="ml-64 flex-1 p-8">
        
        {/* HEADER */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-800">Product Management</h1>
          <button 
            onClick={openAddModal}
            className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded shadow flex items-center gap-2"
          >
            <span>+</span> Add New Product
          </button>
        </div>

        {/* SEARCH BAR */}
        <div className="mb-6">
          <input 
            type="text" 
            placeholder="Search by name, code, or category..." 
            className="w-full max-w-md p-3 border rounded shadow-sm focus:ring-2 focus:ring-blue-200 focus:outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* PRODUCT TABLE */}
        <div className="bg-white rounded shadow overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-100 border-b">
              <tr>
                <th className="p-4 font-semibold text-gray-600">Code</th>
                <th className="p-4 font-semibold text-gray-600">Product Name</th>
                <th className="p-4 font-semibold text-gray-600">Category</th>
                <th className="p-4 font-semibold text-gray-600">Base UOM</th>
                <th className="p-4 font-semibold text-gray-600">Allowed UOMs</th>
                <th className="p-4 font-semibold text-gray-600 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((p) => (
                <tr key={p.id} className="border-b hover:bg-gray-50">
                  <td className="p-4 font-mono text-sm text-blue-600 font-bold">{p.ProductCode}</td>
                  <td className="p-4 font-medium">{p.ProductName}</td>
                  <td className="p-4 text-sm text-gray-500">{p.Category}</td>
                  <td className="p-4 text-sm font-bold">{p.BaseUOM}</td>
                  <td className="p-4 text-xs text-gray-500">{p.AllowedUOMs}</td>
                  <td className="p-4 text-right space-x-2">
                    <button 
                      onClick={() => openEditModal(p)}
                      className="text-blue-600 hover:text-blue-800 font-semibold text-sm border border-blue-200 px-3 py-1 rounded hover:bg-blue-50"
                    >
                      Edit
                    </button>
                    <button 
                      onClick={() => handleDelete(p.id, p.ProductName, p.ProductCode)}
                      className="text-red-500 hover:text-red-700 font-semibold text-sm border border-red-200 px-3 py-1 rounded hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-gray-400">No products found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* --- MODAL (POPUP) --- */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded shadow-xl w-full max-w-2xl overflow-y-auto max-h-[90vh]">
              <h2 className="text-2xl font-bold mb-6">
                {editingProduct ? 'Edit Product' : 'Add New Product'}
              </h2>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Row 1: Code & Name */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="col-span-1">
                        <label className="block text-sm font-bold mb-1">Product Code</label>
                        <input 
                            type="text" 
                            className="w-full border p-2 rounded bg-gray-50"
                            value={formData.ProductCode}
                            onChange={(e) => setFormData({...formData, ProductCode: e.target.value})}
                            required
                            disabled={!!editingProduct} 
                        />
                    </div>
                    <div className="col-span-2">
                        <label className="block text-sm font-bold mb-1">Product Name</label>
                        <input 
                            type="text" 
                            className="w-full border p-2 rounded"
                            value={formData.ProductName}
                            onChange={(e) => setFormData({...formData, ProductName: e.target.value})}
                            required
                        />
                    </div>
                </div>

                {/* Row 2: Category & Allowed UOMs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-bold mb-1">Category</label>
                        <select 
                            className="w-full border p-2 rounded"
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
                        <label className="block text-sm font-bold mb-1">Allowed UOMs (Comma Separated)</label>
                        <input 
                            type="text" 
                            className="w-full border p-2 rounded"
                            placeholder="e.g. KG, PKT, CTN"
                            value={formData.AllowedUOMs}
                            onChange={(e) => setFormData({...formData, AllowedUOMs: e.target.value})}
                            required
                        />
                    </div>
                </div>

                {/* Row 3: UOM Settings */}
                <div className="p-4 bg-gray-50 rounded border border-gray-200">
                    <h3 className="text-sm font-bold text-gray-700 mb-3 uppercase">Unit of Measure Settings</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-bold mb-1">Base UOM (Smallest)</label>
                            <select 
                                className="w-full border p-2 rounded bg-white"
                                value={formData.BaseUOM}
                                onChange={(e) => setFormData({...formData, BaseUOM: e.target.value})}
                            >
                                {getUOMOptions().map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-bold mb-1">Sales UOM</label>
                            <select 
                                className="w-full border p-2 rounded bg-white"
                                value={formData.SalesUOM}
                                onChange={(e) => setFormData({...formData, SalesUOM: e.target.value})}
                            >
                                {getUOMOptions().map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-bold mb-1">Purchase UOM</label>
                            <select 
                                className="w-full border p-2 rounded bg-white"
                                value={formData.PurchaseUOM}
                                onChange={(e) => setFormData({...formData, PurchaseUOM: e.target.value})}
                            >
                                {getUOMOptions().map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* CONVERSION RATES SECTION */}
                    {getSecondaryUOMs().length > 0 && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                            <h4 className="text-xs font-bold text-gray-500 mb-2">CONVERSION RATES (1 Unit = ? {formData.BaseUOM})</h4>
                            <div className="grid grid-cols-1 gap-2">
                                {getSecondaryUOMs().map(uom => (
                                    <div key={uom} className="flex items-center bg-white p-2 border rounded">
                                        <span className="font-bold text-gray-700 w-16 text-right mr-2">1 {uom}</span>
                                        <span className="text-gray-400 mx-2">=</span>
                                        <input 
                                            type="number" 
                                            step="0.01"
                                            className="border p-1 w-24 rounded text-center font-bold text-blue-600"
                                            value={conversionFactors[uom] || ''}
                                            onChange={(e) => setConversionFactors({
                                                ...conversionFactors, 
                                                [uom]: e.target.value
                                            })}
                                            placeholder="?"
                                            required
                                        />
                                        <span className="ml-2 text-gray-600 font-bold">{formData.BaseUOM}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button 
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white font-bold rounded hover:bg-blue-700"
                  >
                    {editingProduct ? 'Update Product' : 'Save Product'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}