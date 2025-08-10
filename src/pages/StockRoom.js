// src/pages/StockRoom.js
import React, { useEffect, useMemo, useState } from 'react';
import TopNav from '../components/TopNav';
import StockProgress from '../components/StockProgress';
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

export default function StockRoom() {
  const { user, profile, role: ctxRole } = useAuth();
  const effectiveRole = ctxRole || profile?.role || '';
  const admin = isAdmin(effectiveRole);
  const workerLike = isWorkerLike(effectiveRole);

  const [items, setItems] = useState([]);
  const [reqs, setReqs] = useState([]);

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
  const [sortBy, setSortBy] = useState('name'); // name|qty|minQty|maxQty|category
  const [sortDir, setSortDir] = useState('asc'); // asc|desc
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);

  // 🆕 view controls
  const [density, setDensity] = useState('cozy'); // cozy|compact
  const [viewMode, setViewMode] = useState('cards'); // cards|list

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
      arr = arr.filter((it) => String(it.category || '').toLowerCase() === categoryFilter.toLowerCase());
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
      const av = (sortBy === 'name' || sortBy === 'category')
        ? String(a[sortBy] || '').toLowerCase()
        : Number(a[sortBy] || 0);
      const bv = (sortBy === 'name' || sortBy === 'category')
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
      setNewItem({ name: '', unit: 'pcs', category: 'essentials', minQty: 0, maxQty: 0, initialQty: 0 });
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

        itemsInReq.forEach((it, idx) => {
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
          resolved.push({ idx, ref, qtyToDeduct: qty, label: it.name || invDocId, unit: it.unit || itemsById.get(invDocId)?.unit || '' });
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
          if (newQty < 0) throw new Error(`Not enough stock for "${line.label}" — need ${line.qtyToDeduct}, have ${current}.`);
          updates.push({ ref: line.ref, newQty });
        });

        updates.forEach((u) => tx.update(u.ref, { qty: u.newQty }));
        tx.update(reqRef, { status: 'fulfilled', fulfilledAt: serverTimestamp(), fulfilledBy: user?.uid || null });
      });

      alert('Stock deducted and request fulfilled ✔');
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

          {/* Toolbar: filter/search/sort + view & density */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.4fr 1fr auto auto auto', gap: 10, marginBottom: 12 }}>
            <select
              className="input-field"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              title="Filter by category"
            >
              {categoryOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt === 'all' ? `All categories (${items.length})` : `${opt} (${categoryCounts[opt] || 0})`}
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

            <select
              className="input-field"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              title="Sort by"
            >
              <option value="name">Sort: Name</option>
              <option value="qty">Sort: Quantity</option>
              <option value="minQty">Sort: Min Qty</option>
              <option value="maxQty">Sort: Max Qty</option>
              <option value="category">Sort: Category</option>
            </select>

<button
  type="button"
  className={`btn-toggle ${sortDir === 'desc' ? 'is-active' : ''}`}
  onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
  title="Toggle sort direction"
  aria-pressed={sortDir === 'desc'}
>
  {sortDir === 'asc' ? 'Asc ↑' : 'Desc ↓'}
</button>


            <select
              className="input-field"
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value)}
              title="View mode"
            >
              <option value="cards">View: Cards</option>
              <option value="list">View: List</option>
            </select>

            <select
              className="input-field"
              value={density}
              onChange={(e) => setDensity(e.target.value)}
              title="Density"
            >
              <option value="cozy">Density: Cozy</option>
              <option value="compact">Density: Compact</option>
            </select>

            <label
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', opacity: 0.9 }}
              title="Show items at or below minimum level"
            >
              <input
                type="checkbox"
                checked={showLowStockOnly}
                onChange={(e) => setShowLowStockOnly(e.target.checked)}
              />
              Low stock only
            </label>
          </div>

          {/* Cards view */}
          {viewMode === 'cards' && (
            <div
              className={`grid tracks-grid ${density === 'compact' ? 'stock-compact' : ''}`}
              style={{ ['--col-min']: density === 'compact' ? '220px' : '260px' }}
            >
              {visibleItems.map((it) => (
                <div key={it.id} className="track-card">
                  <div className="card track">
                    <div className="row between wrap gap12">
                      <h4 className="track-name ellipsis" title={it.name} style={{ margin: 0 }}>
                        {it.name}
                      </h4>
                      <span className="small muted ellipsis" title={`${it.category || 'uncategorised'} · ${it.unit}`}>
                        {it.category || 'uncategorised'} · {it.unit}
                      </span>
                    </div>
                    <div style={{ marginTop: density === 'compact' ? 6 : 10 }}>
                      <StockProgress qty={it.qty || 0} minQty={it.minQty || 0} maxQty={it.maxQty || 0} />
                      <div className="row between" style={{ marginTop: density === 'compact' ? 4 : 6 }}>
                        <span className="small muted">On hand</span>
                        <span className="small">
                          {it.qty || 0} {it.unit}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {visibleItems.length === 0 && <p className="muted">No items match your filters.</p>}
            </div>
          )}

          {/* List view (super compact) */}
          {viewMode === 'list' && (
            <div className="glass-subcard" style={{ overflowX: 'auto' }}>
              <table className={`table dark ${density === 'compact' ? 'table-compact' : ''}`} style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Name</th>
                    <th>Category</th>
                    <th>Unit</th>
                    <th>Qty</th>
                    <th>Min</th>
                    <th>Max</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((it) => {
                    const qty = Number(it.qty || 0);
                    const min = Number(it.minQty || 0);
                    const max = Number(it.maxQty || 0);
                    const low = qty <= min;
                    return (
                      <tr key={it.id}>
                        <td className="ellipsis" title={it.name}>{it.name}</td>
                        <td className="muted">{it.category || '—'}</td>
                        <td className="muted">{it.unit || '—'}</td>
                        <td>{qty}</td>
                        <td className="muted">{min}</td>
                        <td className="muted">{max || '—'}</td>
                        <td>
                          <span className="chip" style={{ background: low ? '#ff6b6b' : '#2f2f2f' }}>
                            {low ? 'Low' : 'OK'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {visibleItems.length === 0 && (
                    <tr><td colSpan={7} className="muted" style={{ textAlign: 'center' }}>No items match your filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Left: Add new item + Receive stock */}
        <div className="glass-card welcome-card">
          <h3 style={{ marginTop: 0 }}>Add New Item</h3>
          <form onSubmit={handleCreateItem}>
            <input
              className="input-field"
              placeholder="Item name (e.g., Coke 330ml)"
              value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
            />
            <div className="row gap12">
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
                <option value="spares">spares</option>
                <option value="essentials">essentials</option>
              </select>
            </div>
            <div className="row gap12">
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

          <hr style={{ borderColor: 'rgba(255,255,255,0.1)', margin: '18px 0' }} />

          <h3>Receive Stock</h3>
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
            <div className="row gap12">
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

        {/* Right: Pending Requests */}
        <div className="glass-card team-overview-card">
          <h3 style={{ marginTop: 0 }}>Pending Requests</h3>
          {pendingReqs.length === 0 ? (
            <p className="muted">No pending requests.</p>
          ) : (
            pendingReqs.map((r) => (
              <div key={r.id} className="card-inner">
                <div className="row between">
                  <strong>{r.trackId}</strong>
                  <span className="small muted">{r.status}</span>
                </div>
                <ul style={{ marginTop: 8 }}>
                  {r.items.map((it, idx) => (
                    <li key={idx} className="small">
                      {it.name} — {it.qty} {it.unit}
                    </li>
                  ))}
                </ul>
                {admin && (
                  <div className="row gap12" style={{ marginTop: 10 }}>
                    <button className="button-primary" onClick={() => handleFulfill(r.id)}>
                      Fulfill & Deduct Stock
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
