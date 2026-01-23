'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient'; // Adjust path if needed
import Sidebar from '../../components/Sidebar';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function OrderListPage() {
  const [orders, setOrders] = useState([]); // Stores UNIQUE orders (grouped by DO)
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function fetchOrders() {
      // 1. Check Session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      // 2. Fetch ALL raw rows from Orders
      // We order by Delivery Date descending (newest first)
      const { data, error } = await supabase
        .from('Orders')
        .select('*')
        .order('Delivery Date', { ascending: false });

      if (error) {
        console.error('Error fetching orders:', error);
      } else {
        // 3. GROUP BY DO NUMBER
        // Since Supabase returns 1 row per ITEM, we need to filter duplicates
        // to show 1 card per ORDER.
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

    fetchOrders();
  }, []);

  if (loading) return <div className="p-10 ml-64">Loading Orders...</div>;

  return (
    <div className="flex bg-gray-50 min-h-screen">
      <Sidebar />
      <main className="ml-64 flex-1 p-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-800">Order Management</h1>
          <Link 
            href="/orders/new"
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded shadow"
          >
            + Create New Order
          </Link>
        </div>

        {/* ORDER LIST TABLE */}
        <div className="bg-white rounded shadow overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-100 border-b border-gray-200">
              <tr>
                <th className="p-4 font-semibold text-gray-600">Date</th>
                <th className="p-4 font-semibold text-gray-600">DO Number</th>
                <th className="p-4 font-semibold text-gray-600">Customer</th>
                <th className="p-4 font-semibold text-gray-600 text-center">Status</th>
                <th className="p-4 font-semibold text-gray-600 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-gray-500 italic">
                    No orders found. Create one to get started!
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} className="border-b border-gray-100 hover:bg-blue-50 transition-colors">
                    <td className="p-4 text-sm text-gray-700">
                      {order["Delivery Date"]}
                    </td>
                    <td className="p-4 font-medium text-blue-900">
                      {order.DONumber}
                    </td>
                    <td className="p-4 text-gray-800 font-bold">
                      {order["Customer Name"]}
                    </td>
                    <td className="p-4 text-center">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        order.Status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                        order.Status === 'Completed' ? 'bg-green-100 text-green-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {order.Status || 'Pending'}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      {/* LINK TO THE PRINT PAGE */}
                      <Link 
                        href={`/orders/${order.id}/print`}
                        className="text-blue-600 hover:text-blue-800 hover:underline font-semibold text-sm"
                        target="_blank" // Opens in new tab so you don't lose your place
                      >
                        🖨️ Print DO
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}