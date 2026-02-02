'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Sidebar from '../../components/Sidebar';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function OrderListPage() {
  const [orders, setOrders] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Packing'); // Default to Packing
  const [selectedOrders, setSelectedOrders] = useState(new Set());
  const [products, setProducts] = useState([]); // For Edit Modal Search
  const [customers, setCustomers] = useState([]); // For Edit Modal Customer List
  
  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null); // Holds header info
  const [editingItems, setEditingItems] = useState([]); // Holds line items
  const [deletedItemIds, setDeletedItemIds] = useState([]);
  const [productSearchTerm, setProductSearchTerm] = useState('');

  const router = useRouter();

  useEffect(() => {
    fetchOrders();
    fetchProducts();
    fetchCustomers();
  }, []);

  // Reset selection when switching tabs
  useEffect(() => {
    setSelectedOrders(new Set());
  }, [activeTab]);

  async function fetchProducts() {
    const { data } = await supabase
      .from('ProductMaster')
      .select('ProductCode, ProductName, BaseUOM, AllowedUOMs, Category');
    if (data) setProducts(data);
  }

  async function fetchCustomers() {
    const { data } = await supabase
      .from('Customers')
      .select('CompanyName, ContactPerson, DeliveryAddress, ContactNumber')
      .order('CompanyName');
    if (data) setCustomers(data);
  }

  async function fetchOrders() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/login');
      return;
    }

    const { data, error } = await supabase
      .from('Orders')
      .select('*')
      .order('Delivery Date', { ascending: false });

    if (error) {
      console.error('Error fetching orders:', error);
    } else {
      // Group by DO Number
      const uniqueOrders = [];
      const seenDOs = new Set();

      data.forEach(row => {
        if (!seenDOs.has(row.DONumber)) {
          seenDOs.add(row.DONumber);
          uniqueOrders.push(row);
        }
      });

      setOrders(uniqueOrders);
    }
    setLoading(false);
  }

  // --- ACTIONS ---

  const updateOrderStatus = async (doNumber, newStatus) => {
    // Optimistic Update
    setOrders(prev => prev.map(o => 
      o.DONumber === doNumber ? { ...o, Status: newStatus } : o
    ));

    const { error } = await supabase
      .from('Orders')
      .update({ Status: newStatus })
      .eq('DONumber', doNumber);

    if (error) {
      alert("Failed to update status.");
      fetchOrders();
    }
  };

  // --- EDIT MODAL LOGIC ---

  const openEditModal = async (orderSummary) => {
    // 1. Fetch all line items for this DO
    const { data: items, error } = await supabase
      .from('Orders')
      .select('*')
      .eq('DONumber', orderSummary.DONumber);

    if (error || !items) {
      alert("Error loading order details.");
      return;
    }

    // 2. Setup State
    setEditingOrder({ ...items[0] }); // Use first item for header info
    setEditingItems(items);
    setDeletedItemIds([]);
    setProductSearchTerm('');
    setIsEditModalOpen(true);
  };

  const handleEditHeaderChange = (field, value) => {
    setEditingOrder(prev => {
      const newState = { ...prev, [field]: value };
      
      // Auto-fill logic when Customer Name changes
      if (field === "Customer Name") {
        const matchedCustomer = customers.find(c => c.CompanyName.toLowerCase() === value.toLowerCase());
        if (matchedCustomer) {
          newState["Delivery Address"] = matchedCustomer.DeliveryAddress || newState["Delivery Address"];
          newState["Contact Person"] = matchedCustomer.ContactPerson || newState["Contact Person"];
          newState["Contact Number"] = matchedCustomer.ContactNumber || newState["Contact Number"];
        }
      }
      return newState;
    });
  };

  const handleEditItemChange = (index, field, value) => {
    const newItems = [...editingItems];
    newItems[index][field] = value;

    // Special logic for Item Name change to sync Product Code
    if (field === 'Order Items') {
        const matchedProduct = products.find(p => p.ProductName === value);
        if (matchedProduct) {
            newItems[index]["Product Code"] = matchedProduct.ProductCode;
            newItems[index]["UOM"] = matchedProduct.BaseUOM; // Reset to base UOM of new product
        }
    }

    setEditingItems(newItems);
  };

  const handleDeleteItem = (index) => {
    const item = editingItems[index];
    if (item.id) {
      setDeletedItemIds(prev => [...prev, item.id]);
    }
    setEditingItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddItem = (product) => {
    const newItem = {
      // Temporary negative ID to track new items
      id: `new-${Date.now()}`, 
      DONumber: editingOrder.DONumber,
      "Delivery Date": editingOrder["Delivery Date"],
      "Customer Name": editingOrder["Customer Name"],
      "Delivery Address": editingOrder["Delivery Address"],
      "Contact Person": editingOrder["Contact Person"],
      "Contact Number": editingOrder["Contact Number"],
      Status: editingOrder.Status,
      "Product Code": product.ProductCode,
      "Order Items": product.ProductName,
      Quantity: 1,
      UOM: product.BaseUOM,
      Price: 0,
      SpecialNotes: ''
    };
    setEditingItems([...editingItems, newItem]);
    setProductSearchTerm('');
  };

  const saveEditedOrder = async () => {
    if (!confirm("Save changes?")) return;

    // 1. Delete removed items
    if (deletedItemIds.length > 0) {
      await supabase.from('Orders').delete().in('id', deletedItemIds);
    }

    // 2. Prepare Upsert Data
    // We must ensure Header Info is updated for ALL items (even unchanged ones)
    const upsertPayload = editingItems.map(item => {
      // Strip temporary ID for new items so Supabase generates one
      const isNew = String(item.id).startsWith('new-');
      const { id, ...rest } = item;
      
      const cleanItem = isNew ? rest : item;

      return {
        ...cleanItem,
        // Sync Header Fields
        "Customer Name": editingOrder["Customer Name"],
        "Delivery Address": editingOrder["Delivery Address"],
        "Contact Person": editingOrder["Contact Person"],
        "Contact Number": editingOrder["Contact Number"],
        "Delivery Date": editingOrder["Delivery Date"],
        "Delivery Mode": editingOrder["Delivery Mode"],
      };
    });

    const { error } = await supabase.from('Orders').upsert(upsertPayload);

    if (error) {
      alert("Error saving: " + error.message);
    } else {
      alert("Order updated successfully.");
      setIsEditModalOpen(false);
      fetchOrders();
    }
  };

  // --- SELECTION & FILTER LOGIC ---

  const filteredOrders = orders.filter(order => {
    const status = order.Status || 'Pending';
    if (activeTab === 'Packing') return status === 'Pending' || status === 'Packing';
    if (activeTab === 'Completed') return status === 'Completed';
    return false;
  });

  const toggleSelectAll = () => {
    if (selectedOrders.size === filteredOrders.length) {
      setSelectedOrders(new Set());
    } else {
      const allDOs = filteredOrders.map(o => o.DONumber);
      setSelectedOrders(new Set(allDOs));
    }
  };

  const toggleSelectOrder = (doNumber) => {
    const newSet = new Set(selectedOrders);
    if (newSet.has(doNumber)) newSet.delete(doNumber);
    else newSet.add(doNumber);
    setSelectedOrders(newSet);
  };

  const getCount = (tab) => {
    return orders.filter(o => {
      const s = o.Status || 'Pending';
      if (tab === 'Packing') return s === 'Pending' || s === 'Packing';
      if (tab === 'Completed') return s === 'Completed';
      return false;
    }).length;
  };

  const getUOMOptions = (prodCode) => {
    const p = products.find(x => x.ProductCode === prodCode);
    if (!p || !p.AllowedUOMs) return [];
    return p.AllowedUOMs.split(',').map(u => u.trim().toUpperCase()).filter(Boolean);
  };

  // Fuzzy Search for Products
  const filteredProducts = products.filter(p => {
    if (!productSearchTerm) return false;
    const term = productSearchTerm.toLowerCase();
    return (p.ProductName.toLowerCase().includes(term) || p.ProductCode.toLowerCase().includes(term));
  });

  if (loading) return <div className="flex h-screen items-center justify-center bg-gray-50 text-gray-500">Loading Orders...</div>;

  return (
    <div className="flex bg-gray-50 min-h-screen font-sans">
      <Sidebar />
      
      {/* Global Datalist for Edit Modal Products (Placed here to be accessible) */}
      <datalist id="global-product-list">
        {products.map(p => <option key={p.ProductCode} value={p.ProductName} />)}
      </datalist>

      <main className="ml-64 flex-1 p-8">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-800 tracking-tight">Order Management</h1>
            <p className="text-sm text-gray-400 mt-1">Manage fulfillment workflow</p>
          </div>
          <Link 
            href="/orders/new"
            className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg transform transition hover:-translate-y-1 active:scale-95 flex items-center gap-2"
          >
            <span>+</span> Create New Order
          </Link>
        </div>

        {/* Simplified Workflow Tabs */}
        <div className="flex space-x-2 mb-6 bg-white p-1.5 rounded-2xl shadow-sm border border-gray-100 w-fit">
          {['Packing', 'Completed'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all duration-200 flex items-center gap-2 ${
                activeTab === tab 
                  ? 'bg-green-100 text-green-800 shadow-sm' 
                  : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              {tab}
              <span className={`text-xs px-2 py-0.5 rounded-full ${activeTab === tab ? 'bg-white' : 'bg-gray-100'}`}>
                {getCount(tab)}
              </span>
            </button>
          ))}
        </div>

        {/* Selection Toolbar */}
        {selectedOrders.size > 0 && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center gap-4 animate-fade-in">
            <span className="text-sm font-bold text-blue-700 ml-2">{selectedOrders.size} Selected</span>
            <button 
              className="text-xs bg-white border border-blue-200 text-blue-600 font-bold px-3 py-1.5 rounded-lg hover:bg-blue-100"
              onClick={() => {
                 if (activeTab === 'Packing') {
                    if(confirm(`Mark ${selectedOrders.size} orders as Done?`)) {
                        selectedOrders.forEach(doNum => updateOrderStatus(doNum, 'Completed'));
                        setSelectedOrders(new Set());
                    }
                 }
              }}
            >
              {activeTab === 'Packing' ? 'Mark All Done' : 'Bulk Action'}
            </button>
          </div>
        )}

        {/* Order List */}
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
          {filteredOrders.length === 0 ? (
            <div className="p-12 text-center text-gray-400 flex flex-col items-center">
              <span className="text-4xl mb-3">📭</span>
              <p>No orders in <strong>{activeTab}</strong>.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="p-5 w-10 text-center">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded text-green-600 focus:ring-green-500 border-gray-300 cursor-pointer"
                      checked={filteredOrders.length > 0 && selectedOrders.size === filteredOrders.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="p-5 text-xs font-bold text-gray-400 uppercase tracking-wider">DO Details</th>
                  <th className="p-5 text-xs font-bold text-gray-400 uppercase tracking-wider">Customer</th>
                  <th className="p-5 text-xs font-bold text-gray-400 uppercase tracking-wider">Delivery Info</th>
                  <th className="p-5 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-green-50/30 transition-colors group">
                    <td className="p-5 text-center">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 rounded text-green-600 focus:ring-green-500 border-gray-300 cursor-pointer"
                        checked={selectedOrders.has(order.DONumber)}
                        onChange={() => toggleSelectOrder(order.DONumber)}
                      />
                    </td>
                    <td className="p-5">
                      <div className="font-mono text-xs text-green-600 font-bold bg-green-50 px-2 py-1 rounded w-fit mb-1">
                        {order.DONumber}
                      </div>
                      <div className="text-xs text-gray-400">Date: {order["Delivery Date"]}</div>
                    </td>
                    <td className="p-5">
                      <div className="font-bold text-gray-800 text-sm">{order["Customer Name"]}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{order["Contact Person"]}</div>
                    </td>
                    <td className="p-5">
                      <span className={`text-[10px] font-bold px-2 py-1 rounded border ${
                        order["Delivery Mode"] === 'Driver' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                        order["Delivery Mode"] === 'Lalamove' ? 'bg-orange-50 text-orange-600 border-orange-100' :
                        'bg-purple-50 text-purple-600 border-purple-100'
                      }`}>
                        {order["Delivery Mode"] || 'Driver'}
                      </span>
                      <div className="text-xs text-gray-400 mt-2 truncate max-w-[200px]" title={order["Delivery Address"]}>
                        {order["Delivery Address"]}
                      </div>
                    </td>
                    <td className="p-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Print Button */}
                        <Link href={`/orders/${order.id}/print`} target="_blank" className="p-2 text-gray-400 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg transition" title="Print Invoice">🖨️</Link>

                        {activeTab === 'Packing' && (
                          <>
                            {/* EDIT BUTTON */}
                            <button 
                              onClick={() => openEditModal(order)}
                              className="p-2 text-orange-400 hover:text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-lg transition"
                              title="Edit Order"
                            >
                              ✏️
                            </button>
                            {/* MARK DONE BUTTON */}
                            <button 
                              onClick={() => updateOrderStatus(order.DONumber, 'Completed')}
                              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-4 rounded-lg shadow-sm transition active:scale-95"
                            >
                              Done ✓
                            </button>
                          </>
                        )}

                        {activeTab === 'Completed' && (
                          <button 
                            onClick={() => updateOrderStatus(order.DONumber, 'Packing')} // Returns to 'Packing' (which includes Pending)
                            className="text-xs font-bold text-gray-400 hover:text-red-500 py-2 px-3 transition"
                            title="Return to Packing"
                          >
                            ← Revert
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* --- EDIT ORDER MODAL --- */}
        {isEditModalOpen && editingOrder && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-up">
              
              {/* Modal Header */}
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <div>
                  <h3 className="text-xl font-bold text-gray-800">Edit Order: {editingOrder.DONumber}</h3>
                  <p className="text-xs text-gray-500">Modify items, prices, or delivery details.</p>
                </div>
                <button onClick={() => setIsEditModalOpen(false)} className="text-gray-400 hover:text-red-500 text-2xl font-bold px-2">×</button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto flex-1 space-y-6">
                
                {/* 1. Header Fields */}
                <div className="grid grid-cols-2 gap-4 bg-blue-50 p-4 rounded-xl border border-blue-100">
                   <div>
                      <label className="text-xs font-bold text-blue-700 uppercase block mb-1">Customer Name</label>
                      <input 
                        list="edit-customer-list"
                        className="w-full p-2 border border-blue-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" 
                        value={editingOrder["Customer Name"]}
                        onChange={e => handleEditHeaderChange("Customer Name", e.target.value)}
                        placeholder="Type to search or add new..."
                      />
                      <datalist id="edit-customer-list">
                        {customers.map(c => <option key={c.CompanyName} value={c.CompanyName} />)}
                      </datalist>
                   </div>
                   <div>
                      <label className="text-xs font-bold text-blue-700 uppercase block mb-1">Delivery Address</label>
                      <input 
                        className="w-full p-2 border border-blue-200 rounded-lg text-sm" 
                        value={editingOrder["Delivery Address"]}
                        onChange={e => handleEditHeaderChange("Delivery Address", e.target.value)}
                      />
                   </div>
                   <div>
                      <label className="text-xs font-bold text-blue-700 uppercase block mb-1">Contact Person</label>
                      <input 
                        className="w-full p-2 border border-blue-200 rounded-lg text-sm" 
                        value={editingOrder["Contact Person"]}
                        onChange={e => handleEditHeaderChange("Contact Person", e.target.value)}
                      />
                   </div>
                   <div>
                      <label className="text-xs font-bold text-blue-700 uppercase block mb-1">Contact Number</label>
                      <input 
                        className="w-full p-2 border border-blue-200 rounded-lg text-sm" 
                        value={editingOrder["Contact Number"]}
                        onChange={e => handleEditHeaderChange("Contact Number", e.target.value)}
                      />
                   </div>
                </div>

                {/* 2. Add Item Search */}
                <div className="relative">
                   <input 
                      type="text"
                      placeholder="🔍 Search product to add..."
                      className="w-full p-3 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-green-500 outline-none"
                      value={productSearchTerm}
                      onChange={e => setProductSearchTerm(e.target.value)}
                   />
                   {productSearchTerm && (
                      <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-xl shadow-xl mt-1 max-h-48 overflow-y-auto">
                         {filteredProducts.map(p => (
                            <div 
                              key={p.ProductCode} 
                              className="p-3 hover:bg-green-50 cursor-pointer flex justify-between items-center border-b border-gray-50 last:border-0"
                              onClick={() => handleAddItem(p)}
                            >
                               <span className="font-bold text-gray-700">{p.ProductName}</span>
                               <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-500">{p.ProductCode}</span>
                            </div>
                         ))}
                         {filteredProducts.length === 0 && <div className="p-3 text-center text-gray-400 text-sm">No match.</div>}
                      </div>
                   )}
                </div>

                {/* 3. Items Table */}
                <table className="w-full text-left border-collapse text-sm">
                  <thead className="bg-gray-100 text-gray-500 uppercase text-xs">
                    <tr>
                      <th className="p-3">Item</th>
                      <th className="p-3 w-20 text-center">Qty</th>
                      <th className="p-3 w-24 text-center">UOM</th>
                      <th className="p-3 w-24 text-right">Price</th>
                      <th className="p-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {editingItems.map((item, idx) => (
                      <tr key={item.id || idx} className="hover:bg-gray-50">
                        <td className="p-3">
                          {/* Editable Item Name with Datalist */}
                          <input 
                            list="global-product-list"
                            className="w-full p-1 border rounded text-sm font-medium text-gray-800 focus:ring-2 focus:ring-blue-100"
                            value={item["Order Items"]}
                            onChange={e => handleEditItemChange(idx, 'Order Items', e.target.value)}
                          />
                          <div className="text-xs text-gray-400 mt-1">{item["Product Code"]}</div>
                        </td>
                        <td className="p-3">
                          <input 
                            type="number" 
                            className="w-full p-1 border rounded text-center"
                            value={item.Quantity}
                            onChange={e => handleEditItemChange(idx, 'Quantity', e.target.value)}
                          />
                        </td>
                        <td className="p-3">
                          <select 
                            className="w-full p-1 border rounded text-xs bg-white"
                            value={item.UOM}
                            onChange={e => handleEditItemChange(idx, 'UOM', e.target.value)}
                          >
                             {getUOMOptions(item["Product Code"]).length > 0 ? (
                               getUOMOptions(item["Product Code"]).map(u => <option key={u} value={u}>{u}</option>)
                             ) : (
                               <option value={item.UOM}>{item.UOM}</option>
                             )}
                          </select>
                        </td>
                        <td className="p-3">
                          <input 
                            type="number" 
                            className="w-full p-1 border rounded text-right"
                            value={item.Price}
                            onChange={e => handleEditItemChange(idx, 'Price', e.target.value)}
                          />
                        </td>
                        <td className="p-3 text-center">
                          <button 
                            onClick={() => handleDeleteItem(idx)}
                            className="text-red-400 hover:text-red-600 font-bold"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                <button 
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-6 py-2 rounded-xl border border-gray-300 text-gray-600 font-bold hover:bg-gray-100 transition"
                >
                  Cancel
                </button>
                <button 
                  onClick={saveEditedOrder}
                  className="px-6 py-2 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700 shadow-lg transform active:scale-95 transition"
                >
                  Save Changes
                </button>
              </div>

            </div>
          </div>
        )}

      </main>
    </div>
  );
}