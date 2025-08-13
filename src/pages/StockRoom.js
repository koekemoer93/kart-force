// src/pages/StockRoom.js
import React, { useEffect, useMemo, useState } from 'react';
import TopNav from '../components/TopNav';
import StockProgress from '../components/StockProgress'; // kept import (no removals)
import { db } from '../firebase';
import { useAuth } from '../AuthContext';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  doc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { createItem, receiveStock } from '../services/inventory';
import { isAdmin, isWorkerLike } from '../utils/roles';

function fmtDateTime(v) {
  try {
    const d = v?.toDate ? v.toDate() : new Date(v);
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return String(v || '');
  }
}

export default function StockRoom() {
  const { user, profile, role: ctxRole } = useAuth();
  const effectiveRole = ctxRole || profile?.role || '';
  const admin = isAdmin(effectiveRole);
  const workerLike = isWorkerLike(effectiveRole); // reserved for future UI gates

  const [items, setItems] = useState([]);
  const [reqs, setReqs] = useState([]);
  const [selectedReq, setSelectedReq] = useState(null); // ⬅️ details modal

  // forms
  const [newItem, setNewItem] = useState({
    name: '',
    unit: 'pcs',
    category: 'essentials',
    minQty: 0,
    maxQty: 0,
    initialQty: 0,
  });
  const [receive, setReceive] = useState({ itemId: '', qty: 0, reason: 'receive' });

  // 🔎 filters/sort
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name'); // logic kept; controls hidden
  const [sortDir, setSortDir] = useState('asc'); // logic kept; controls hidden
  const [showLowStockOnly, setShowLowStockOnly] = useState(false); // logic kept; controls hidden

  // view controls (forced list)
  const [density, setDensity] = useState('cozy'); // cozy|compact
  const [viewMode, setViewMode] = useState('list'); // cards|list (forced)
  useEffect(() => {
    if (viewMode !== 'list') setViewMode('list');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live inventory + requests
  useEffect(() => {
    const invQ = query(collection(db, 'inventory'), orderBy('name'));
    const un1 = onSnapshot(invQ, (snap) => {
      const arr = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
      setItems(arr);
    });

    const reqQ = query(collection(db, 'supplyRequests'), orderBy('createdAt'));
    const un2 = onSnapshot(reqQ, (snap) => {
      const arr = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
      setReqs(arr.reverse()); // newest first
    });

    return () => {
      un1();
      un2();
    };
  }, []);

  const pendingReqs = useMemo(() => reqs.filter((r) => r.status === 'pending'), [reqs]);

  const itemsById = useMemo(() => {
    const map = new Map();
    items.forEach((it) => map.set(it.id, it));
    return map;
  }, [items]);

  const itemsByNameLower = useMemo(() => {
    const map = new Map();
    items.forEach((it) => map.set(String(it.name || '').toLowerCase(), it));
    return map;
  }, [items]);

  // category options + counts
  const categoryCounts = useMemo(() => {
    const counts = {};
    for (const it of items) {
      const cat = (it.category || 'uncategorised').toLowerCase();
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [items]);

  const categoryOptions = useMemo(() => {
    const keys = Object.keys(categoryCounts).sort();
    return ['all', ...keys];
  }, [categoryCounts]);

  // visible list after filter/search/sort
  const visibleItems = useMemo(() => {
    const s = search.trim().toLowerCase();
    let arr = items.slice();

    if (categoryFilter !== 'all') {
      arr = arr.filter(
        (it) => String(it.category || '').toLowerCase() === categoryFilter.toLowerCase()
      );
    }

    if (s) {
      arr = arr.filter((it) => {
        const hay = [it.name, it.category, it.unit].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(s);
      });
    }

    if (showLowStockOnly) {
      arr = arr.filter((it) => Number(it.qty || 0) <= Number(it.minQty || 0));
    }

    const dir = sortDir === 'desc' ? -1 : 1;
    arr.sort((a, b) => {
      const av =
        sortBy === 'name' || sortBy === 'category'
          ? String(a[sortBy] || '').toLowerCase()
          : Number(a[sortBy] || 0);
      const bv =
        sortBy === 'name' || sortBy === 'category'
          ? String(b[sortBy] || '').toLowerCase()
          : Number(b[sortBy] || 0);

      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      // secondary sort by name to keep stable order
      const an = String(a.name || '').toLowerCase();
      const bn = String(b.name || '').toLowerCase();
      if (an < bn) return -1;
      if (an > bn) return 1;
      return 0;
    });

    return arr;
  }, [items, categoryFilter, search, sortBy, sortDir, showLowStockOnly]);

  async function handleCreateItem(e) {
    e.preventDefault();
    if (!admin) return alert('Admin only.');
    try {
      const payload = {
        name: newItem.name.trim(),
        unit: newItem.unit.trim(),
        category: newItem.category,
        minQty: Number(newItem.minQty) || 0,
        maxQty: Number(newItem.maxQty) || 0,
        initialQty: Number(newItem.initialQty) || 0,
      };
      if (!payload.name) return alert('Item name required.');
      await createItem(payload);
      setNewItem({
        name: '',
        unit: 'pcs',
        category: 'essentials',
        minQty: 0,
        maxQty: 0,
        initialQty: 0,
      });
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  }

  async function handleReceive(e) {
    e.preventDefault();
    if (!admin) return alert('Admin only.');
    try {
      if (!receive.itemId) return alert('Select item');
      const qty = Number(receive.qty);
      if (!qty || qty <= 0) return alert('Enter quantity > 0');
      await receiveStock({ itemId: receive.itemId, qty, reason: receive.reason, byUid: user?.uid });
      setReceive({ itemId: '', qty: 0, reason: 'receive' });
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  }

  async function handleFulfill(requestId) {
    if (!admin) return alert('Admin only.');
    try {
      await runTransaction(db, async (tx) => {
        const reqRef = doc(db, 'supplyRequests', requestId);
        const reqSnap = await tx.get(reqRef);
        if (!reqSnap.exists()) throw new Error('Request not found.');

        const request = reqSnap.data();
        if (request.status && request.status !== 'pending') {
          throw new Error(`Request is already ${request.status}.`);
        }
        const itemsInReq = Array.isArray(request.items) ? request.items : [];
        if (itemsInReq.length === 0) throw new Error('Request has no items.');

        const invRefs = [];
        const resolved = [];

        itemsInReq.forEach((it) => {
          const qty = Number(it.qty || 0);
          if (!qty || qty <= 0) return;

          let invDocId = it.itemId;
          if (!invDocId && it.name) {
            const found = itemsByNameLower.get(String(it.name).toLowerCase());
            if (found) invDocId = found.id;
          }
          if (!invDocId) {
            throw new Error(`Cannot resolve inventory item for "${it.name || 'unknown'}".`);
          }

          const ref = doc(db, 'inventory', invDocId);
          invRefs.push(ref);
          resolved.push({
            ref,
            qtyToDeduct: qty,
            label: it.name || invDocId,
            unit: it.unit || itemsById.get(invDocId)?.unit || '',
          });
        });

        const invSnaps = [];
        for (const ref of invRefs) invSnaps.push(await tx.get(ref));

        const updates = [];
        resolved.forEach((line, i) => {
          const snap = invSnaps[i];
          if (!snap.exists()) throw new Error(`Inventory doc missing for "${line.label}".`);
          const data = snap.data();
          const current = Number(data.qty ?? 0);
          const newQty = current - line.qtyToDeduct;
          if (newQty < 0)
            throw new Error(
              `Not enough stock for "${line.label}" — need ${line.qtyToDeduct}, have ${current}.`
            );
          updates.push({ ref: line.ref, newQty });
        });

        updates.forEach((u) => tx.update(u.ref, { qty: u.newQty }));
        tx.update(reqRef, {
          status: 'fulfilled',
          fulfilledAt: serverTimestamp(),
          fulfilledBy: user?.uid || null,
        });
      });

      alert('Stock deducted and request fulfilled ✔');
      setSelectedReq(null); // close modal if open
    } catch (err) {
      console.error(err);
      alert(err.message || String(err));
    }
  }

  return (
    <>
      <TopNav />
      <div className="main-wrapper admin-dashboard-layout">
        {/* Inventory Overview */}
        <div className="glass-card progress-summary-card" style={{ gridColumn: '1 / -1' }}>
          <h3 style={{ marginTop: 0 }}>Central Stock — Overview</h3>

          {/* --- Full-width Pending + Stock Actions --- */}
          <div className="stock-actions-grid">
            {/* Pending Requests */}
            <div className="glass-subcard">
              <h3>Track Orders</h3>
              {pendingReqs.length === 0 ? (
                <p className="muted">No pending requests.</p>
              ) : (
                pendingReqs.map((r) => (
                  <div
                    key={r.id}
                    className="card-inner"
                    style={{ padding: 8, marginBottom: 8, cursor: 'pointer' }}
                    onClick={() => setSelectedReq(r)}               // ⬅️ open details
                  >
                    <div className="row between" style={{ alignItems: 'flex-start' }}>
                      <strong>{r.trackId}</strong>
                      <span className="small muted">{r.status || 'pending'}</span>
                    </div>

                    {/* Hint if there are notes */}
                    {!!r.note && (
                      <div className="small" style={{ marginTop: 4, opacity: 0.8 }}>
                        <em>Note attached — click to view</em>
                      </div>
                    )}

                    <ul style={{ marginTop: 6 }}>
                      {r.items?.map((it, idx) => (
                        <li key={idx} className="small">
                          {it.name} — {it.qty} {it.unit}
                        </li>
                      ))}
                    </ul>

                    {admin && (
                      <div className="pending-actions" style={{ marginTop: 10 }}>
                        <button
                          className="button-primary"
                          style={{ width: '100%' }}
                          onClick={(e) => {
                            e.stopPropagation(); // don't open modal
                            handleFulfill(r.id);
                          }}
                        >
                          Fulfill & Deduct Stock
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Stock Actions */}
            <div className="glass-subcard stock-actions-card">
              <h3>Stock Control</h3>
              <div className="actions-two-col">
                {/* Add New Item */}
                <div>
                  <h4 style={{ margin: '6px 0 8px 0' }}>Add New Item to Stock</h4>
                  <form onSubmit={handleCreateItem}>
                    <input
                      className="input-field"
                      placeholder="Item name (e.g., Coke 330ml)"
                      value={newItem.name}
                      onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                    />
                    <div className="row gap12" style={{ flexWrap: 'wrap' }}>
                      <input
                        className="input-field"
                        placeholder="Unit (e.g., can, pcs)"
                        value={newItem.unit}
                        onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                      />
                      <select
                        className="input-field"
                        value={newItem.category}
                        onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                      >
                        <option value="drinks">drinks</option>
                        <option value="spares - chassis">spares - chassis</option>
                        <option value="spares - drivetrain">spares - drivetrain</option>
                        <option value="essentials">essentials</option>
                      </select>
                    </div>
                    <div className="row gap12" style={{ flexWrap: 'wrap' }}>
                      <input
                        className="input-field"
                        type="number"
                        placeholder="Min qty"
                        value={newItem.minQty}
                        onChange={(e) => setNewItem({ ...newItem, minQty: e.target.value })}
                      />
                      <input
                        className="input-field"
                        type="number"
                        placeholder="Max qty (optional)"
                        value={newItem.maxQty}
                        onChange={(e) => setNewItem({ ...newItem, maxQty: e.target.value })}
                      />
                      <input
                        className="input-field"
                        type="number"
                        placeholder="Initial qty"
                        value={newItem.initialQty}
                        onChange={(e) => setNewItem({ ...newItem, initialQty: e.target.value })}
                      />
                    </div>
                    <button className="button-primary" type="submit">Save Item</button>
                  </form>
                </div>

                {/* Receive Stock */}
                <div>
                  <h4 style={{ margin: '6px 0 8px 0' }}>Check in new Stock</h4>
                  <form onSubmit={handleReceive}>
                    <select
                      className="input-field"
                      value={receive.itemId}
                      onChange={(e) => setReceive({ ...receive, itemId: e.target.value })}
                    >
                      <option value="">Select item…</option>
                      {items.map((it) => (
                        <option key={it.id} value={it.id}>{it.name}</option>
                      ))}
                    </select>
                    <div className="row gap12" style={{ flexWrap: 'wrap' }}>
                      <input
                        className="input-field"
                        type="number"
                        placeholder="Quantity"
                        value={receive.qty}
                        onChange={(e) => setReceive({ ...receive, qty: e.target.value })}
                      />
                      <input
                        className="input-field"
                        placeholder="Reason (optional)"
                        value={receive.reason}
                        onChange={(e) => setReceive({ ...receive, reason: e.target.value })}
                      />
                    </div>
                    <button className="button-primary" type="submit">Add to Inventory</button>
                  </form>
                </div>
              </div>
            </div>
          </div>

          {/* ↓↓↓ Moved toolbar HERE — right above the list ↓↓↓ */}
          <div className="stock-toolbar" style={{ marginTop: 12, marginBottom: 12 }}>
            <select
              className="input-field"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              title="Filter by category"
            >
              {categoryOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt === 'all'
                    ? `Choose category (${items.length})`
                    : `${opt} (${categoryCounts[opt] || 0})`}
                </option>
              ))}
            </select>

            <input
              className="input-field"
              placeholder="Search items (name, category, unit)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              title="Search"
            />
          </div>

          {/* List view (forced) */}
          <div className="glass-subcard" style={{ overflowX: 'auto' }}>
            <table
              className={`table dark ${density === 'compact' ? 'table-compact' : ''} responsive`}
              style={{ width: '100%' }}
            >
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Name</th>
                  <th>Category</th>
                  <th>Unit</th>
                  <th>Qty</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((it) => {
                  const qty = Number(it.qty || 0);
                  const min = Number(it.minQty || 0);
                  const low = qty <= min;
                  return (
                    <tr key={it.id}>
                      <td data-label="Name" className="ellipsis" title={it.name}>{it.name}</td>
                      <td data-label="Category" className="muted">{it.category || '—'}</td>
                      <td data-label="Unit">{it.unit || '—'}</td>
                      <td data-label="Qty">{qty}</td>
                      <td data-label="Status">
                        <span className="chip" style={{ background: low ? '#ff6b6b' : '#2f2f2f' }}>
                          {low ? 'Low' : 'OK'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {visibleItems.length === 0 && (
                  <tr>
                    <td colSpan={7} className="muted" style={{ textAlign: 'center' }}>
                      No items match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Order details modal */}
      {selectedReq && (
        <div
          className="modal-overlay"
          onClick={() => setSelectedReq(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="modal-card glass-card"
            onClick={(e) => e.stopPropagation()}
            style={{ width: 'min(720px, 96vw)' }}
          >
            <div className="row between" style={{ alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>{selectedReq.trackId} — Order Details</h3>
              <button className="button-secondary" onClick={() => setSelectedReq(null)}>Close</button>
            </div>

            <div className="small muted" style={{ marginTop: 6 }}>
              Status: <strong>{selectedReq.status || 'pending'}</strong>
              {selectedReq.createdAt && <> · Created: {fmtDateTime(selectedReq.createdAt)}</>}
            </div>

            {selectedReq.note && (
              <div className="glass-card" style={{ marginTop: 12, padding: 12 }}>
                <div className="small muted" style={{ marginBottom: 6 }}>Note</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{selectedReq.note}</div>
              </div>
            )}

            {selectedReq.photoURL && (
              <div style={{ marginTop: 12 }}>
                <div className="small muted" style={{ marginBottom: 6 }}>Attachment</div>
                <img
                  src={selectedReq.photoURL}
                  alt="attachment"
                  style={{
                    maxWidth: '100%',
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.1)'
                  }}
                />
              </div>
            )}

            <div className="glass-card" style={{ marginTop: 12, padding: 12 }}>
              <div className="small muted" style={{ marginBottom: 6 }}>Items</div>
              <ul style={{ margin: 0 }}>
                {selectedReq.items?.map((line, i) => (
                  <li key={i} className="small">
                    {line.name} — {line.qty} {line.unit}
                  </li>
                ))}
              </ul>
            </div>

            {admin && selectedReq.status === 'pending' && (
              <div style={{ marginTop: 14 }}>
                <button
                  className="button-primary"
                  style={{ width: '100%' }}
                  onClick={() => handleFulfill(selectedReq.id)}
                >
                  Fulfill & Deduct Stock
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scoped tweaks: compact toolbar + full-width sections + modal */}
      <style>{`
        /* Toolbar (above the list) */
        .stock-toolbar {
          display: grid;
          grid-template-columns: minmax(220px, 320px) 1fr;
          gap: 8px;
        }
        .stock-toolbar .input-field {
          height: 36px;
          padding: 6px 10px;
          font-size: 14px;
          border-radius: 10px;
        }

        /* Full-width sections */
        .stock-actions-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
          margin-top: 8px;
        }

        .actions-two-col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        @media (max-width: 880px) {
          .actions-two-col { grid-template-columns: 1fr; }
          .stock-toolbar { grid-template-columns: 1fr; }
        }

        /* Modal */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.55);
          backdrop-filter: blur(2px);
          display: grid;
          place-items: center;
          z-index: 999;
          padding: 14px;
        }
        .modal-card {
          padding: 16px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(10,10,10,0.9);
          max-height: 92vh;
          overflow: auto;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        }
      `}</style>
    </>
  );
}
