import { supabase } from './supabaseClient';

export async function getCoreData() {
  // Run all queries at the same time for speed
  const [products, customers, suppliers] = await Promise.all([
    supabase.from('ProductMaster').select('ProductCode, ProductName, Category, BaseUOM'),
    supabase.from('Customers').select('*'),
    supabase.from('Suppliers').select('SupplierName')
  ]);

  return {
    products: products.data || [],
    customers: customers.data || [],
    suppliers: suppliers.data || []
  };
}