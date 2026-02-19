'use client';
import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function ClientLoginPage() {
  const [username, setUsername] = useState('');
  const [passcode, setPasscode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Query the Customers table for a match
      // We look for ANY record with this username/passcode.
      // If multiple branches share credentials, we just need to validate one to let them in.
      const { data, error } = await supabase
        .from('Customers')
        .select('Username, CompanyName') // Minimal fields for validation
        .eq('Username', username)
        .eq('Passcode', passcode)
        .limit(1);

      if (error) throw error;

      if (data && data.length > 0) {
        // Successful Login
        // Store session in localStorage for this MVP client portal
        const sessionData = {
            username: data[0].Username,
            companyBaseName: data[0].CompanyName, // This might be "Starbucks" or "Starbucks - KL". We'll handle branch logic in dashboard.
            timestamp: new Date().getTime()
        };
        localStorage.setItem('ffd_client_session', JSON.stringify(sessionData));
        router.push('/client-portal/dashboard');
      } else {
        setError('Invalid Username or Passcode');
      }
    } catch (err) {
      console.error("Login error:", err);
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4 font-sans">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden border border-gray-200">
        
        <div className="bg-green-600 p-8 text-center relative overflow-hidden">
          <div className="relative z-10">
            <h1 className="text-3xl font-black text-white tracking-tight">Client Portal</h1>
            <p className="text-green-100 text-xs font-bold uppercase mt-2 opacity-80">Fresher Farm Direct</p>
          </div>
        </div>

        <div className="p-8 pt-10">
          <div className="mb-8 text-center">
            <h2 className="text-xl font-bold text-gray-800">Welcome Partner</h2>
            <p className="text-gray-400 text-xs mt-1">Sign in to manage your orders</p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl mb-6 text-xs font-bold text-center border border-red-100">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5 ml-1">Username</label>
              <input 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 transition-all placeholder-gray-300"
                placeholder="e.g. AURO_CAPITAL"
                required 
              />
            </div>
            
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5 ml-1">Passcode</label>
              <input 
                type="password" 
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 transition-all placeholder-gray-300"
                placeholder="••••••"
                required 
              />
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className={`w-full py-4 mt-4 rounded-xl text-white font-bold text-base shadow-lg transform transition-all 
                ${loading ? 'bg-gray-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 active:scale-95 hover:shadow-green-500/30'}`}
            >
              {loading ? 'Verifying...' : 'Access Portal'}
            </button>
          </form>
        </div>
        <div className="bg-gray-50 p-4 text-center border-t border-gray-100">
             <p className="text-[10px] text-gray-400 font-bold">© 2026 Fresher Farm Direct</p>
        </div>
      </div>
    </div>
  );
}