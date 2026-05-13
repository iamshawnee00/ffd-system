export function buildSupplierPriceMatrix(priceListRows, productMasterMap = {}) {
  const matrixMap = new Map();

  priceListRows.forEach((row) => {
    const supplier = row.Supplier?.trim();
    const productCode = row.ProductCode?.trim();
    const productName = row.ProductName?.trim() || productMasterMap[productCode]?.ProductName || '-';
    const costPrice = Number(row.CostPrice);

    if (!supplier || !productCode || !Number.isFinite(costPrice) || costPrice <= 0) {
      return;
    }

    const master = productMasterMap[productCode] || {};

    const category = master.Category || 'Uncategorized';
    const uom = master.BaseUOM || master.SalesUOM || '-';

    const key = productCode;

    if (!matrixMap.has(key)) {
      matrixMap.set(key, {
        productCode,
        chineseName: master.ChineseName || '-', // ready for future use
        productName,
        category,
        uom,
        supplierPrices: {},
        lowestPrice: null,
        highestPrice: null,
        spread: null,
        bestSupplier: null,
        quotedSupplierCount: 0
      });
    }

    const matrixRow = matrixMap.get(key);

    matrixRow.supplierPrices[supplier] = costPrice;
  });

  const matrix = Array.from(matrixMap.values()).map((row) => {
    const entries = Object.entries(row.supplierPrices)
      .filter(([, price]) => Number.isFinite(price) && price > 0);

    const prices = entries.map(([, price]) => price);

    if (prices.length === 0) {
      return row;
    }

    const lowestPrice = Math.min(...prices);
    const highestPrice = Math.max(...prices);
    const spread = highestPrice - lowestPrice;

    const bestSupplierEntry = entries.find(([, price]) => price === lowestPrice);

    return {
      ...row,
      lowestPrice,
      highestPrice,
      spread,
      bestSupplier: bestSupplierEntry?.[0] || '-',
      quotedSupplierCount: prices.length
    };
  });

  return matrix;
}


export function getSupplierNamesFromMatrix(matrix) {
  const supplierSet = new Set();

  matrix.forEach((row) => {
    Object.keys(row.supplierPrices || {}).forEach((supplier) => {
      supplierSet.add(supplier);
    });
  });

  return Array.from(supplierSet).sort((a, b) => a.localeCompare(b));
}


export function getSupplierWinStats(matrix) {
  const stats = {};

  matrix.forEach((row) => {
    if (!row.bestSupplier || row.bestSupplier === '-') return;

    if (!stats[row.bestSupplier]) {
      stats[row.bestSupplier] = {
        supplier: row.bestSupplier,
        winCount: 0
      };
    }

    stats[row.bestSupplier].winCount += 1;
  });

  return Object.values(stats).sort((a, b) => b.winCount - a.winCount);
}