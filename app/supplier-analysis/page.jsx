'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  buildSupplierPriceMatrix,
  getSupplierNamesFromMatrix,
  getSupplierWinStats
} from '../lib/supplierPriceMatrix';

import {
  BuildingOfficeIcon,
  CurrencyDollarIcon,
  CubeIcon,
  TrophyIcon,
  ArrowsUpDownIcon,
  CalendarDaysIcon
} from '@heroicons/react/24/outline';

const formatRM = (value) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return '-';
  }

  return `RM ${Number(value).toFixed(2)}`;
};

const getDateOnly = (timestamp) => {
  if (!timestamp) return '';
  return String(timestamp).substring(0, 10);
};

export default function SupplierAnalysisPage() {
  const [loading, setLoading] = useState(true);

  const [priceListRows, setPriceListRows] = useState([]);
  const [productMasterMap, setProductMasterMap] = useState({});

  const [selectedDate, setSelectedDate] = useState('');
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('spread-desc');

  // ==========================================
  // 1. INITIAL FETCH
  // ==========================================
  useEffect(() => {
    async function fetchSupplierMatrixData() {
      setLoading(true);

      // 1. Fetch ProductMaster
      let allProducts = [];
      let productStart = 0;
      let keepFetchingProducts = true;

      while (keepFetchingProducts) {
        const { data, error } = await supabase
          .from('ProductMaster')
          .select('ProductCode, ProductName, Category, SalesUOM, BaseUOM')
          .range(productStart, productStart + 999);

        if (error || !data || data.length === 0) {
          keepFetchingProducts = false;
        } else {
          allProducts = allProducts.concat(data);

          if (data.length < 1000) {
            keepFetchingProducts = false;
          } else {
            productStart += 1000;
          }
        }
      }

      const masterMap = {};
      allProducts.forEach((p) => {
        masterMap[p.ProductCode] = p;
      });

      setProductMasterMap(masterMap);

      // 2. Fetch only pricelist rows from Purchase
      let allPriceListRows = [];
      let purchaseStart = 0;
      let keepFetchingPriceLists = true;

      while (keepFetchingPriceLists) {
        const { data, error } = await supabase
          .from('Purchase')
          .select('Supplier, ProductCode, ProductName, CostPrice, Timestamp, InvoiceNumber')
          .eq('InvoiceNumber', 'PRICE_LIST')
          .order('Timestamp', { ascending: false })
          .range(purchaseStart, purchaseStart + 999);

        if (error || !data || data.length === 0) {
          keepFetchingPriceLists = false;
        } else {
          allPriceListRows = allPriceListRows.concat(data);

          if (data.length < 1000) {
            keepFetchingPriceLists = false;
          } else {
            purchaseStart += 1000;
          }
        }
      }

      setPriceListRows(allPriceListRows);

      // 3. Set default date = latest pricelist date
      const uniqueDates = Array.from(
        new Set(
          allPriceListRows
            .map((row) => getDateOnly(row.Timestamp))
            .filter(Boolean)
        )
      ).sort((a, b) => b.localeCompare(a));

      if (uniqueDates.length > 0) {
        setSelectedDate(uniqueDates[0]);
      }

      setLoading(false);
    }

    fetchSupplierMatrixData();
  }, []);

  // ==========================================
  // 2. DATE OPTIONS
  // ==========================================
  const availableDates = useMemo(() => {
    return Array.from(
      new Set(
        priceListRows
          .map((row) => getDateOnly(row.Timestamp))
          .filter(Boolean)
      )
    ).sort((a, b) => b.localeCompare(a));
  }, [priceListRows]);

  // ==========================================
  // 3. FILTER PRICE LIST BY SELECTED DATE
  // ==========================================
  const rowsForSelectedDate = useMemo(() => {
    if (!selectedDate) return [];

    return priceListRows.filter((row) => {
      return getDateOnly(row.Timestamp) === selectedDate;
    });
  }, [priceListRows, selectedDate]);

  // ==========================================
  // 4. BUILD MATRIX
  // ==========================================
  const fullMatrix = useMemo(() => {
    return buildSupplierPriceMatrix(rowsForSelectedDate, productMasterMap);
  }, [rowsForSelectedDate, productMasterMap]);

  const supplierNames = useMemo(() => {
    return getSupplierNamesFromMatrix(fullMatrix);
  }, [fullMatrix]);

  const supplierWinStats = useMemo(() => {
    return getSupplierWinStats(fullMatrix);
  }, [fullMatrix]);

  // ==========================================
  // 5. CATEGORY FILTER OPTIONS
  // ==========================================
  const categoryOptions = useMemo(() => {
    const set = new Set();

    fullMatrix.forEach((row) => {
      if (row.category) set.add(row.category);
    });

    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [fullMatrix]);

  // ==========================================
  // 6. SEARCH + CATEGORY FILTER + SORT
  // ==========================================
  const filteredMatrix = useMemo(() => {
    let rows = [...fullMatrix];

    if (selectedCategory !== 'all') {
      rows = rows.filter((row) => row.category === selectedCategory);
    }

    if (productSearchTerm.trim()) {
      const term = productSearchTerm.toLowerCase();

      rows = rows.filter((row) => {
        const combinedText = [
          row.productCode,
          row.productName,
          row.chineseName,
          row.category,
          row.uom
        ]
          .join(' ')
          .toLowerCase();

        return combinedText.includes(term);
      });
    }

    rows.sort((a, b) => {
      if (sortBy === 'spread-desc') {
        return (b.spread || 0) - (a.spread || 0);
      }

      if (sortBy === 'lowest-price') {
        return (a.lowestPrice || Infinity) - (b.lowestPrice || Infinity);
      }

      if (sortBy === 'supplier-count') {
        return (b.quotedSupplierCount || 0) - (a.quotedSupplierCount || 0);
      }

      return (a.productName || '').localeCompare(b.productName || '');
    });

    return rows;
  }, [fullMatrix, selectedCategory, productSearchTerm, sortBy]);

  // ==========================================
  // 7. SUMMARY STATS
  // ==========================================
  const matrixStats = useMemo(() => {
    const productsCompared = fullMatrix.length;

    const multiSupplierProducts = fullMatrix.filter(
      (row) => row.quotedSupplierCount >= 2
    ).length;

    const totalSpread = fullMatrix.reduce(
      (sum, row) => sum + (Number(row.spread) || 0),
      0
    );

    const avgSpread =
      productsCompared > 0 ? totalSpread / productsCompared : 0;

    return {
      productsCompared,
      multiSupplierProducts,
      suppliersCompared: supplierNames.length,
      avgSpread
    };
  }, [fullMatrix, supplierNames]);

  if (loading) {
    return (
      <div className="p-10 flex items-center justify-center h-screen text-gray-400 font-black tracking-widest animate-pulse uppercase">
        Loading Supplier Intelligence...
      </div>
    );
  }

  return (
    <div className="p-3 md:p-8 max-w-full overflow-x-hidden min-h-screen bg-gray-50/50 pb-32 animate-in fade-in duration-300">
      <style jsx global>{`
        @media screen and (max-width: 768px) {
          input,
          select,
          textarea {
            font-size: 16px !important;
          }
        }

        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
          height: 4px;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 10px;
        }
      `}</style>

      {/* HEADER */}
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight">
            Supplier Price Intelligence
          </h1>
          <p className="text-[10px] md:text-xs text-gray-400 font-bold uppercase mt-1">
            Compare supplier pricelists by date, product, category and best quote
          </p>
        </div>
      </div>

      {/* FILTER BAR */}
      <div className="bg-white p-4 md:p-5 rounded-[2rem] shadow-sm border border-gray-100 mb-6 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
            Pricelist Date
          </label>
          <div className="relative">
            <CalendarDaysIcon className="w-4 h-4 text-gray-400 absolute left-3 top-3.5" />
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full pl-10 pr-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none"
            >
              {availableDates.map((date) => (
                <option key={date} value={date}>
                  {date}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
            Category
          </label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none"
          >
            <option value="all">All Categories</option>
            {categoryOptions.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
            Search Product
          </label>
          <input
            type="text"
            placeholder="Search name / code / category..."
            value={productSearchTerm}
            onChange={(e) => setProductSearchTerm(e.target.value)}
            className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none"
          />
        </div>

        <div>
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
            Sort By
          </label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none"
          >
            <option value="spread-desc">Biggest Price Spread</option>
            <option value="lowest-price">Lowest Market Price</option>
            <option value="supplier-count">Most Supplier Quotes</option>
            <option value="name">Product Name A-Z</option>
          </select>
        </div>
      </div>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
        <div className="bg-purple-50 p-4 md:p-5 rounded-[2rem] border border-purple-100 text-center shadow-sm">
          <BuildingOfficeIcon className="w-5 h-5 mx-auto mb-2 text-purple-500" />
          <p className="text-[8px] md:text-[10px] font-black text-purple-500 uppercase tracking-widest mb-1">
            Suppliers Compared
          </p>
          <p className="text-lg md:text-2xl font-black text-purple-800">
            {matrixStats.suppliersCompared}
          </p>
        </div>

        <div className="bg-blue-50 p-4 md:p-5 rounded-[2rem] border border-blue-100 text-center shadow-sm">
          <CubeIcon className="w-5 h-5 mx-auto mb-2 text-blue-500" />
          <p className="text-[8px] md:text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">
            Products Listed
          </p>
          <p className="text-lg md:text-2xl font-black text-blue-800">
            {matrixStats.productsCompared}
          </p>
        </div>

        <div className="bg-emerald-50 p-4 md:p-5 rounded-[2rem] border border-emerald-100 text-center shadow-sm">
          <TrophyIcon className="w-5 h-5 mx-auto mb-2 text-emerald-500" />
          <p className="text-[8px] md:text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">
            Multi-Supplier Items
          </p>
          <p className="text-lg md:text-2xl font-black text-emerald-800">
            {matrixStats.multiSupplierProducts}
          </p>
        </div>

        <div className="bg-orange-50 p-4 md:p-5 rounded-[2rem] border border-orange-100 text-center shadow-sm">
          <ArrowsUpDownIcon className="w-5 h-5 mx-auto mb-2 text-orange-500" />
          <p className="text-[8px] md:text-[10px] font-black text-orange-500 uppercase tracking-widest mb-1">
            Avg Price Spread
          </p>
          <p className="text-lg md:text-2xl font-black text-orange-800">
            {formatRM(matrixStats.avgSpread)}
          </p>
        </div>
      </div>

      {/* BEST PRICE WINS */}
      {supplierWinStats.length > 0 && (
        <div className="bg-white p-5 md:p-6 rounded-[2rem] shadow-sm border border-gray-100 mb-6">
          <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-4">
            Supplier Best-Price Wins
          </h3>

          <div className="flex flex-wrap gap-2">
            {supplierWinStats.map((stat) => (
              <div
                key={stat.supplier}
                className="px-4 py-2 rounded-full bg-emerald-50 border border-emerald-100 text-xs font-black text-emerald-700"
              >
                {stat.supplier}: {stat.winCount} wins
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MATRIX TABLE */}
      <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-gray-50/50">
          <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-widest">
            Supplier Price Comparison Matrix
          </h3>
          <p className="text-[10px] text-gray-400 font-bold mt-1">
            Showing {filteredMatrix.length} products for {selectedDate || '-'}
          </p>
        </div>

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left whitespace-nowrap">
            <thead className="bg-white sticky top-0 z-10 text-gray-400 font-black uppercase tracking-wider text-[9px] border-b border-gray-100">
              <tr>
                <th className="p-4 pl-6">Category</th>
                <th className="p-4">Chinese Name</th>
                <th className="p-4">Product</th>
                <th className="p-4">Code</th>
                <th className="p-4">UOM</th>

                {supplierNames.map((supplier) => (
                  <th key={supplier} className="p-4 text-right">
                    {supplier}
                  </th>
                ))}

                <th className="p-4 text-right text-emerald-600">Lowest</th>
                <th className="p-4 text-right text-red-500">Highest</th>
                <th className="p-4 text-right text-orange-500">Spread</th>
                <th className="p-4 pr-6 text-right text-purple-600">Best Supplier</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-50 text-xs font-bold text-gray-700">
              {filteredMatrix.map((row) => (
                <tr
                  key={row.productCode}
                  className="hover:bg-purple-50/30 transition-colors"
                >
                  <td className="p-4 pl-6">
                    <span className="bg-gray-100 px-2.5 py-1 rounded-full text-[10px] text-gray-600">
                      {row.category}
                    </span>
                  </td>

                  <td className="p-4 text-gray-500">
                    {row.chineseName}
                  </td>

                  <td className="p-4">
                    <div className="font-black text-gray-800 uppercase">
                      {row.productName}
                    </div>
                  </td>

                  <td className="p-4 font-mono text-[10px] text-gray-400">
                    {row.productCode}
                  </td>

                  <td className="p-4 text-gray-500">
                    {row.uom}
                  </td>

                  {supplierNames.map((supplier) => {
                    const price = row.supplierPrices[supplier];
                    const isBest =
                      Number.isFinite(price) &&
                      price === row.lowestPrice;

                    return (
                      <td
                        key={`${row.productCode}-${supplier}`}
                        className={`p-4 text-right ${
                          isBest
                            ? 'text-emerald-700 font-black bg-emerald-50/50'
                            : 'text-gray-600'
                        }`}
                      >
                        {formatRM(price)}
                      </td>
                    );
                  })}

                  <td className="p-4 text-right font-black text-emerald-700">
                    {formatRM(row.lowestPrice)}
                  </td>

                  <td className="p-4 text-right font-black text-red-600">
                    {formatRM(row.highestPrice)}
                  </td>

                  <td className="p-4 text-right font-black text-orange-600">
                    {formatRM(row.spread)}
                  </td>

                  <td className="p-4 pr-6 text-right font-black text-purple-700">
                    {row.bestSupplier}
                  </td>
                </tr>
              ))}

              {filteredMatrix.length === 0 && (
                <tr>
                  <td
                    colSpan={supplierNames.length + 10}
                    className="p-12 text-center text-gray-400 italic font-bold"
                  >
                    No supplier pricelist data found for this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}