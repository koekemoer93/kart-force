// src/components/StockListResponsive.jsx
import React from 'react';

/**
 * Props:
 * - items: Array<{ id, name, sku, qty, location?, category?, minQty? }>
 * - loading: boolean
 * - onAdjust: (id, delta) => void
 * - onEdit?: (item) => void
 * - onSearchChange?: (value) => void
 * - searchValue?: string
 * - onFilterChange?: (value) => void
 * - filterValue?: string
 *
 * This is UI-only. Wire your data/handlers from the page.
 */
export default function StockListResponsive({
  items = [],
  loading = false,
  onAdjust,
  onEdit,
  onSearchChange,
  searchValue = '',
  onFilterChange,
  filterValue = 'all',
}) {
  return (
    <div className="bg-neutral-900 text-neutral-100">
      {/* Controls */}
      <div className="sticky top-0 z-20 bg-neutral-900/90 backdrop-blur border-b border-neutral-800">
        <div className="max-w-6xl mx-auto px-4 py-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input
            value={searchValue}
            onChange={(e) => {
              if (onSearchChange) onSearchChange(e.target.value);
            }}
            placeholder="Search by name or SKU…"
            className="w-full bg-neutral-800/70 border border-neutral-700 rounded-2xl px-4 py-2 outline-none"
          />
          <select
            value={filterValue}
            onChange={(e) => {
              if (onFilterChange) onFilterChange(e.target.value);
            }}
            className="w-full bg-neutral-800/70 border border-neutral-700 rounded-2xl px-4 py-2"
          >
            <option value="all">All Categories</option>
            <option value="low">Low Stock (≤ min)</option>
            <option value="over">Overstock</option>
          </select>
          <div className="hidden sm:flex items-center justify-end text-sm text-neutral-400">
            {loading ? 'Loading…' : `${items.length} items`}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4 space-y-4">
        {/* Mobile Cards */}
        <div className="sm:hidden space-y-3">
          {items.length === 0 && !loading && (
            <div className="text-center text-neutral-400 py-8 border border-neutral-800 rounded-2xl">
              No stock items found.
            </div>
          )}

          {items.map((item) => {
            const isLow = item.minQty != null && (item.qty ?? 0) <= item.minQty;
            return (
              <div
                key={item.id}
                className="rounded-2xl border border-neutral-800 bg-neutral-800/50 backdrop-blur p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold leading-tight">{item.name}</div>
                    <div className="text-xs text-neutral-400">SKU: {item.sku || '—'}</div>
                    {item.category && (
                      <div className="mt-1 inline-block text-[10px] px-2 py-0.5 rounded-full border border-neutral-700 text-neutral-300">
                        {item.category}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className={`text-xl font-bold ${isLow ? 'text-red-400' : ''}`}>
                      {item.qty ?? 0}
                    </div>
                    {item.minQty != null && (
                      <div className="text-[10px] text-neutral-400">Min: {item.minQty}</div>
                    )}
                  </div>
                </div>

                {item.location && (
                  <div className="mt-2 text-xs text-neutral-300">
                    📦 Location: <span className="text-neutral-200">{item.location}</span>
                  </div>
                )}

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <button
                    onClick={() => {
                      if (onAdjust) onAdjust(item.id, -1);
                    }}
                    className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 active:scale-[0.98]"
                  >
                    −1
                  </button>
                  <button
                    onClick={() => {
                      if (onAdjust) onAdjust(item.id, +1);
                    }}
                    className="rounded-xl border border-neutral-700 bg-neutral-100 text-neutral-900 font-semibold px-3 py-2 active:scale-[0.98]"
                  >
                    +1
                  </button>
                  <button
                    onClick={() => {
                      if (onEdit) onEdit(item);
                    }}
                    className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 active:scale-[0.98]"
                  >
                    Edit
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop Table */}
        <div className="hidden sm:block rounded-2xl border border-neutral-800 bg-neutral-800/50 backdrop-blur overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-900/60 sticky top-0">
              <tr>
                <Th>Name</Th>
                <Th>SKU</Th>
                <Th>Qty</Th>
                <Th>Min</Th>
                <Th>Category</Th>
                <Th>Location</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="text-center text-neutral-400 py-8">
                    No stock items found.
                  </td>
                </tr>
              )}
              {items.map((item) => {
                const isLow = item.minQty != null && (item.qty ?? 0) <= item.minQty;
                return (
                  <tr key={item.id} className="border-t border-neutral-800">
                    <Td className="font-medium">{item.name}</Td>
                    <Td className="text-neutral-300">{item.sku || '—'}</Td>
                    <Td className={`font-semibold ${isLow ? 'text-red-400' : ''}`}>
                      {item.qty ?? 0}
                    </Td>
                    <Td className="text-neutral-300">{item.minQty ?? '—'}</Td>
                    <Td className="text-neutral-300">{item.category ?? '—'}</Td>
                    <Td className="text-neutral-300">{item.location ?? '—'}</Td>
                    <Td className="text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => {
                            if (onAdjust) onAdjust(item.id, -1);
                          }}
                          className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-1.5"
                        >
                          −1
                        </button>
                        <button
                          onClick={() => {
                            if (onAdjust) onAdjust(item.id, +1);
                          }}
                          className="rounded-xl border border-neutral-700 bg-neutral-100 text-neutral-900 font-semibold px-3 py-1.5"
                        >
                          +1
                        </button>
                        <button
                          onClick={() => {
                            if (onEdit) onEdit(item);
                          }}
                          className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-1.5"
                        >
                          Edit
                        </button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center text-neutral-400 py-6">Loading…</div>
        )}
      </div>
    </div>
  );
}

function Th({ children, className = '' }) {
  return (
    <th className={`text-left px-4 py-3 border-b border-neutral-800 font-semibold ${className}`}>
      {children}
    </th>
  );
}
function Td({ children, className = '' }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}
