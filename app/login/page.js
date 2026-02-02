'use client';
import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push('/');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 font-sans">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 transition-all hover:shadow-3xl">
        
        {/* Brand Header */}
        <div className="bg-green-600 p-10 text-center relative">
          <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent"></div>
          <div className="relative z-10 flex flex-col items-center">
            <div className="text-6xl mb-2 filter drop-shadow-md">🍎</div>
            <h1 className="text-3xl font-black text-white tracking-tight">FFD Wholesale</h1>
            <p className="text-green-100 text-xs font-bold tracking-[0.2em] mt-2 uppercase opacity-80">System V7.99</p>
          </div>
        </div>

        {/* Login Form */}
        <div className="p-8 pt-10">
          <div className="mb-8 text-center">
            <h2 className="text-xl font-bold text-gray-800">Welcome Back</h2>
            <p className="text-gray-400 text-sm mt-1">Please sign in to continue</p>
          </div>

          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 text-red-700 px-4 py-3 rounded-r-lg mb-6 text-sm shadow-sm flex items-center animate-pulse">
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-gray-500 text-xs font-bold uppercase mb-2 ml-1 tracking-wider">Email Address</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:bg-white focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 placeholder-gray-300"
                placeholder="name@ffdwholesale.com"
                required 
              />
            </div>
            
            <div>
              <label className="block text-gray-500 text-xs font-bold uppercase mb-2 ml-1 tracking-wider">Password</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:bg-white focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 placeholder-gray-300"
                placeholder="••••••••"
                required 
              />
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className={`w-full py-4 mt-4 rounded-xl text-white font-bold text-lg shadow-lg transform transition-all duration-200 
                ${loading 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-green-600 hover:bg-green-700 hover:-translate-y-1 hover:shadow-green-500/30 active:scale-95'
                }`}
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Signing In...</span>
                </div>
              ) : 'Sign In'}
            </button>
          </form>
        </div>

        <div className="bg-gray-50 p-4 text-center border-t border-gray-100">
          <p className="text-xs text-gray-400 font-medium">© 2026 Fresher Farm Direct</p>
        </div>
      </div>
    </div>
  );
}