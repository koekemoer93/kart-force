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
import { createItem, receiveStock } from '../services/inventory'; // ⬅ removed fulfillRequest import (we do it here safely)

/**
 * IMPORTANT CHANGE:
 * - Replaced handleFulfill() to run a single Firestore transaction where
 *   ALL reads happen before ANY writes (fixes "transactions require all reads before writes").
 * - Works with request.items having either { itemId, qty, ... } OR just { name, qty, ... }.
 */

export default function StockRoom() {
  const { user, userData } = useAuth();
  const isAdmin = userData?.role === 'admin';

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

  // Fast lookups for fulfill handler (supports requests that only have item 'name')
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

  async function handleCreateItem(e) {
    e.preventDefault();
    if (!isAdmin) return alert('Admin only.');
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
    if (!isAdmin) return alert('Admin only.');
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

  /**
   * ✅ NEW: Safe fulfill using a single transaction.
   * - Reads every needed doc first using tx.get(...)
   * - Then performs tx.update(...) writes
   * - Validates stock (no negatives)
   */
  async function handleFulfill(requestId) {
    if (!isAdmin) return alert('Admin only.');
    try {
      await runTransaction(db, async (tx) => {
        // --- 1) READ all docs first -----------------------
        const reqRef = doc(db, 'supplyRequests', requestId);
        const reqSnap = await tx.get(reqRef);
        if (!reqSnap.exists()) throw new Error('Request not found.');

        const request = reqSnap.data();
        if (request.status && request.status !== 'pending') {
          throw new Error(`Request is already ${request.status}.`);
        }
        const itemsInReq = Array.isArray(request.items) ? request.items : [];
        if (itemsInReq.length === 0) throw new Error('Request has no items.');

        // Build the list of inventory refs to read, resolving by itemId OR by name.
        const invRefs = [];
        const resolved = []; // { idx, ref, qtyToDeduct, label, unit }

        itemsInReq.forEach((it, idx) => {
          const qty = Number(it.qty || 0);
          if (!qty || qty <= 0) return; // skip invalid lines

          // Prefer itemId if present
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
            idx,
            ref,
            qtyToDeduct: qty,
            label: it.name || invDocId,
            unit: it.unit || itemsById.get(invDocId)?.unit || '',
          });
        });

        // Read all inventory docs (still READ phase)
        const invSnaps = [];
        for (const ref of invRefs) {
          const snap = await tx.get(ref);
          invSnaps.push(snap);
        }

        // --- 2) VALIDATE & PREPARE new values -------------
        const updates = []; // { ref, newQty, label }
        resolved.forEach((line, i) => {
          const snap = invSnaps[i];
          if (!snap.exists()) {
            throw new Error(`Inventory doc missing for "${line.label}".`);
          }
          const data = snap.data();
          const current = Number(data.qty ?? 0);
          const newQty = current - line.qtyToDeduct;
          if (newQty < 0) {
            throw new Error(
              `Not enough stock for "${line.label}" — need ${line.qtyToDeduct}, have ${current}.`
            );
          }
          updates.push({ ref: line.ref, newQty, label: line.label });
        });

        // --- 3) WRITE updates (after ALL reads) -----------
        updates.forEach((u) => {
          tx.update(u.ref, { qty: u.newQty });
        });

        // Mark request fulfilled
        tx.update(reqRef, {
          status: 'fulfilled',
          fulfilledAt: serverTimestamp(),
          fulfilledBy: user?.uid || null,
        });
      });

      alert('Stock deducted and request fulfilled ✔');
    } catch (err) {
      console.error(err);
      alert(err.message || String(err));
    }
  }

  return (
    <>
      <TopNav role={userData?.role || 'worker'} />
      <div className="main-wrapper admin-dashboard-layout">
        {/* Inventory Overview */}
        <div className="glass-card progress-summary-card" style={{ gridColumn: '1 / -1' }}>
          <h3 style={{ marginTop: 0 }}>Central Stock — Overview</h3>
          <div className="grid tracks-grid">
            {items.map((it) => (
              <div key={it.id} className="track-card">
                <div className="card track">
                  <div className="row between wrap gap12">
                    <h4 className="track-name" style={{ margin: 0 }}>
                      {it.name}
                    </h4>
                    <span className="small muted">
                      {it.category} · {it.unit}
                    </span>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <StockProgress qty={it.qty || 0} minQty={it.minQty || 0} maxQty={it.maxQty || 0} />
                    <div className="row between" style={{ marginTop: 6 }}>
                      <span className="small muted">On hand</span>
                      <span className="small">
                        {it.qty || 0} {it.unit}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {items.length === 0 && <p className="muted">No items yet.</p>}
          </div>
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
            <button className="button-primary" type="submit">
              Save Item
            </button>
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
                <option key={it.id} value={it.id}>
                  {it.name}
                </option>
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
            <button className="button-primary" type="submit">
              Add to Inventory
            </button>
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
                {isAdmin && (
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
