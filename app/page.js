'use client';
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';

export default function Home() {
  const [products, setProducts] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchProducts() {
      // Fetch top 5 products to test connection
      const { data, error } = await supabase
        .from('ProductMaster')
        .select('ProductName, ProductCode')
        .limit(5);

      if (error) {
        console.error("Supabase Error:", error);
        setError(error.message);
      } else {
        setProducts(data || []);
      }
    }
    fetchProducts();
  }, []);

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Connection Test</h1>
      
      {/* Show Error if any */}
      {error && (
        <div style={{ color: 'red', background: '#ffe6e6', padding: '10px', borderRadius: '5px' }}>
          <strong>Error:</strong> {error}
        </div>
      )}
      
      {/* Show Loading State */}
      {products.length === 0 && !error ? <p>Loading data from Supabase...</p> : null}
      
      {/* Show Data */}
      <ul style={{ lineHeight: '1.6' }}>
        {products.map((p) => (
          <li key={p.ProductCode || Math.random()}>
            <strong>{p.ProductName}</strong> <span style={{color: '#666'}}>({p.ProductCode})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}