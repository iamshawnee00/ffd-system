'use client';
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Sidebar from './components/Sidebar';

export default function Dashboard() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // 1. Check if user is logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/login'); // Redirect if not logged in
      } else {
        setSession(session);
        setLoading(false);
      }
    });
  }, []);

  if (loading) return <div className="p-10">Loading Dashboard...</div>;

  return (
    <div className="flex bg-gray-50 min-h-screen">
      {/* Sidebar Navigation */}
      <Sidebar />

      {/* Main Content Area */}
      <main className="ml-64 flex-1 p-8">
        <header className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>
          <div className="text-sm text-gray-600">
            Welcome, {session.user.email}
          </div>
        </header>

        {/* Dashboard Widgets (Placeholder for now) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded shadow border-l-4 border-blue-500">
            <h3 className="text-gray-500 text-sm font-bold uppercase">Pending Orders</h3>
            <p className="text-3xl font-bold mt-2">12</p>
          </div>
          <div className="bg-white p-6 rounded shadow border-l-4 border-green-500">
            <h3 className="text-gray-500 text-sm font-bold uppercase">Total Products</h3>
            <p className="text-3xl font-bold mt-2">450</p>
          </div>
          <div className="bg-white p-6 rounded shadow border-l-4 border-yellow-500">
            <h3 className="text-gray-500 text-sm font-bold uppercase">Low Stock Alerts</h3>
            <p className="text-3xl font-bold mt-2">3</p>
          </div>
        </div>

        <div className="mt-8 bg-white p-6 rounded shadow">
          <h3 className="font-bold text-lg mb-4">Quick Actions</h3>
          <p className="text-gray-600">Select an option from the sidebar to begin managing orders.</p>
        </div>
      </main>
    </div>
  );
}