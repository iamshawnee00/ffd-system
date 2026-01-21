import { supabase } from './supabaseClient';

export async function calculateFIFO() {
  const START_DATE = new Date("2025-12-29T00:00:00");

  // 1. Fetch all raw transactions
  const [purchases, sales, adjustments] = await Promise.all([
    supabase.from('PURCHASES').select('*').gte('Timestamp', '2025-12-29'),
    supabase.from('Orders').select('*').gte('Delivery Date', '2025-12-29'), // Repeat for Wholesale/Outlet
    supabase.from('StockAdjustments').select('*').gte('Timestamp', '2025-12-29')
  ]);

  let stock = {};

  // Helper to init product in object
  const initItem = (code) => {
    if (!stock[code]) stock[code] = { incoming: [], outgoing: 0 };
  };

  // 2. Process Purchases (Incoming)
  purchases.data.forEach(p => {
    initItem(p.ProductCode);
    stock[p.ProductCode].incoming.push({
      date: new Date(p.Timestamp),
      qty: Number(p.PurchaseQty), // * Conversion Factor if needed
      cost: Number(p.LandedCost || p.CostPrice)
    });
  });

  // 3. Process Sales (Outgoing)
  sales.data.forEach(s => {
    initItem(s['Product Code']);
    stock[s['Product Code']].outgoing += Number(s.Quantity);
  });

  // 4. Run FIFO Calculation (The "Layer" logic from your code)
  const results = Object.keys(stock).map(code => {
    const item = stock[code];
    // Sort oldest first
    item.incoming.sort((a, b) => a.date - b.date);

    let qtyToDeduct = item.outgoing;
    let remainingLayers = [];

    // Eat up the layers
    for (let layer of item.incoming) {
      if (qtyToDeduct >= layer.qty) {
        qtyToDeduct -= layer.qty; // Layer fully used
      } else {
        layer.qty -= qtyToDeduct; // Layer partially used
        qtyToDeduct = 0;
        remainingLayers.push(layer);
      }
    }

    // Calculate Value
    let totalStock = 0;
    let totalValue = 0;
    remainingLayers.forEach(l => {
      totalStock += l.qty;
      totalValue += (l.qty * l.cost);
    });

    return {
      code,
      totalStock,
      avgCost: totalStock > 0 ? (totalValue / totalStock) : 0
    };
  });

  return results;
}