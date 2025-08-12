// src/pages/SupplyRequest.js
import React, { useEffect, useMemo, useState } from 'react';
import TopNav from '../components/TopNav';
import { db } from '../firebase';
import { useAuth } from '../AuthContext';
import { collection, onSnapshot, orderBy, query, doc, getDoc } from 'firebase/firestore';
import { createSupplyRequest } from '../services/inventory';

export default function SupplyRequest() {
  const { user, userData } = useAuth();
  const assignedTrack = userData?.assignedTrack || '';

  const [trackName, setTrackName] = useState(assignedTrack ? assignedTrack : 'Unassigned');
  const [items, setItems] = useState([]);
  const [cart, setCart] = useState({}); // { itemId: { qty, name, unit } }
  const [submitting, setSubmitting] = useState(false);

  // Load human-friendly track name from Firestore
  useEffect(() => {
    let alive = true;
    async function fetchTrack() {
      if (!assignedTrack) {
        if (alive) setTrackName('Unassigned');
        return;
      }
      try {
        const ref = doc(db, 'tracks', assignedTrack);
        const snap = await getDoc(ref);
        const name = snap.exists() ? (snap.data().displayName || assignedTrack) : assignedTrack;
        if (alive) setTrackName(name);
      } catch {
        if (alive) setTrackName(assignedTrack);
      }
    }
    fetchTrack();
    return () => { alive = false; };
  }, [assignedTrack]);

  // Load inventory catalog
  useEffect(() => {
    const invQ = query(collection(db, 'inventory'), orderBy('name'));
    const un = onSnapshot(invQ, (snap) => {
      const arr = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
      setItems(arr);
    });
    return () => un();
  }, []);

  function setQty(item, qty) {
    const q = Math.max(0, Math.floor(Number(qty) || 0));
    const max = item.qty || 0; // available stock
    const safeQty = Math.min(q, max);
    setCart((prev) => ({
      ...prev,
      [item.id]: safeQty > 0 ? { qty: safeQty, name: item.name, unit: item.unit } : undefined
    }));
  }

  const cartList = useMemo(
    () =>
      Object.entries(cart)
        .filter(([, v]) => v && v.qty > 0)
        .map(([id, v]) => ({ itemId: id, ...v })),
    [cart]
  );

  async function submitRequest() {
    if (!assignedTrack) return alert('You need an assigned track to request stock.');
    if (cartList.length === 0) return alert('Add at least one item.');
    try {
      setSubmitting(true);
      await createSupplyRequest({
        trackId: assignedTrack,
        items: cartList,
        createdBy: user?.uid,
      });
      setCart({});
      alert('Request submitted!');
    } catch (err) {
      console.error(err);
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <TopNav />
      <div className="main-wrapper admin-dashboard-layout">
        <div className="glass-card" style={{ gridColumn: '1 / -1' }}>
          <h3 style={{ marginTop: 0 }}>Weekly Supply Request — {trackName}</h3>
          <p className="muted" style={{ marginTop: 0 }}>You can only request up to the available central stock.</p>

          <div className="grid tracks-grid">
            {items.map((it) => (
              <div key={it.id} className="track-card">
                <div className="card track">
                  <div className="row between wrap gap12">
                    <h4 className="track-name" style={{ margin: 0 }}>{it.name}</h4>
                    <span className="small muted">On hand: {it.qty || 0} {it.unit}</span>
                  </div>
                  <div className="row gap12" style={{ marginTop: 8 }}>
                    <input
                      className="input-field"
                      type="number"
                      min="0"
                      placeholder={`Qty (${it.unit})`}
                      value={cart[it.id]?.qty ?? ''}
                      onChange={(e) => setQty(it, e.target.value)}
                      style={{ maxWidth: 140 }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="row between" style={{ marginTop: 16 }}>
            <span className="small muted">Items in request: {cartList.length}</span>
            <button className="button-primary" onClick={submitRequest} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit Request'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
