// src/pages/SupplyRequest.js
// Employees Supply Request — mobile-first, fast search, compact list, sticky chips & footer

import React, { useEffect, useMemo, useRef, useState } from "react";
import TopNav from "../components/TopNav";
import { db, storage } from "../firebase";
import { useAuth } from "../AuthContext";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  doc,
  getDoc,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { createSupplyRequest } from "../services/inventory";
import "./SupplyRequest.css";

export default function SupplyRequest() {
  const { user, userData } = useAuth();
  const assignedTrack = userData?.assignedTrack || "";

  const [trackName, setTrackName] = useState(
    assignedTrack ? assignedTrack : "Unassigned"
  );
  const [items, setItems] = useState([]);
  const [cart, setCart] = useState({}); // { itemId: { qty, name, unit } }
  const [submitting, setSubmitting] = useState(false);

  // UI state
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState("All");
  const [note, setNote] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");

  // refs for sticky nav offsets & smooth scroll
  const reviewRef = useRef(null);

  // Load human-friendly track name
  useEffect(() => {
    let alive = true;
    async function fetchTrack() {
      if (!assignedTrack) {
        if (alive) setTrackName("Unassigned");
        return;
      }
      try {
        const ref = doc(db, "tracks", assignedTrack);
        const snap = await getDoc(ref);
        const name = snap.exists()
          ? snap.data().displayName || assignedTrack
          : assignedTrack;
        if (alive) setTrackName(name);
      } catch {
        if (alive) setTrackName(assignedTrack);
      }
    }
    fetchTrack();
    return () => {
      alive = false;
    };
  }, [assignedTrack]);

  // Load inventory catalog
  useEffect(() => {
    const invQ = query(collection(db, "inventory"), orderBy("name"));
    const un = onSnapshot(invQ, (snap) => {
      const arr = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
      setItems(arr);
    });
    return () => un();
  }, []);

  // Categories (stable, All first)
  const categories = useMemo(() => {
    const set = new Set();
    items.forEach((it) => set.add(String(it.category || "Uncategorized")));
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [items]);

  // Filtered + searched
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return items
      .filter((it) =>
        activeCat === "All" ? true : (it.category || "Uncategorized") === activeCat
      )
      .filter((it) =>
        s
          ? String(it.name || "").toLowerCase().includes(s) ||
            String(it.unit || "").toLowerCase().includes(s)
          : true
      );
  }, [items, search, activeCat]);

  // Cart helpers
  function setQty(item, qty) {
    const q = Math.max(0, Math.floor(Number(qty) || 0));
    const max = item.qty || 0; // available stock
    const safeQty = Math.min(q, max);
    setCart((prev) => ({
      ...prev,
      [item.id]:
        safeQty > 0
          ? { qty: safeQty, name: item.name, unit: item.unit }
          : undefined,
    }));
  }
  function step(item, delta) {
    const cur = cart[item.id]?.qty || 0;
    setQty(item, cur + delta);
  }
  function removeFromCart(id) {
    setCart((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  const cartList = useMemo(
    () =>
      Object.entries(cart)
        .filter(([, v]) => v && v.qty > 0)
        .map(([id, v]) => ({ itemId: id, ...v })),
    [cart]
  );

  // Photo preview
  useEffect(() => {
    if (!photoFile) {
      setPhotoPreview("");
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  // Submit request (adds note + optional photoURL)
  async function submitRequest() {
    if (!assignedTrack)
      return alert("You need an assigned track to request stock.");
    if (cartList.length === 0) return alert("Add at least one item.");

    setSubmitting(true);
    let photoURL = "";

    if (photoFile && storage) {
      try {
        const ext = (photoFile.name?.split(".").pop() || "jpg").toLowerCase();
        const safeBase = (photoFile.name || "attachment")
          .replace(/[^\w.\-]+/g, "_")
          .slice(0, 48);
        const path = `supplyRequests/${user?.uid || "anon"}/${Date.now()}-${safeBase}.${ext}`;

        const r = storageRef(storage, path);
        await uploadBytes(r, photoFile, {
          contentType: photoFile.type || "image/jpeg",
        });
        photoURL = await getDownloadURL(r);
      } catch (e) {
        console.warn("Photo upload failed; continuing without attachment.", e);
      }
    }

    try {
      await createSupplyRequest({
        trackId: assignedTrack,
        items: cartList,
        createdBy: user?.uid,
        note: note.trim() || null,
        photoURL: photoURL || null,
      });
      setCart({});
      setNote("");
      setPhotoFile(null);
      setPhotoPreview("");
      alert("Request submitted!");
      // optional: scroll back to top
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to submit request.");
    } finally {
      setSubmitting(false);
    }
  }

  function scrollToReview() {
    reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      <TopNav />
      <div className="srq-wrap">
        {/* Sticky search & category chips */}
        <div className="srq-toolbar card">
          <div className="srq-head">
            <h3 className="srq-title">Request Stock — {trackName}</h3>
            <div className="tiny muted">
              You can only request up to the available central stock.
            </div>
          </div>

          <input
            className="input srq-search"
            placeholder="Search items, units…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search items"
          />

          <div className="srq-chips" role="tablist" aria-label="Categories">
            {categories.map((cat) => {
              const active = cat === activeCat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCat(cat)}
                  role="tab"
                  aria-pressed={active}
                  className={`chip ${active ? "is-active" : ""}`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* Catalog — compact list */}
        <section className="card">
          <div className="srq-list">
            {filtered.map((it) => {
              const selectedQty = cart[it.id]?.qty ?? 0;
              const max = it.qty || 0;
              const isDisabledPlus = selectedQty >= max;
              return (
                <div key={it.id} className="srq-item">
                  <div className="srq-item-main">
                    <div className="srq-item-title">{it.name}</div>
                    <div className="tiny muted">
                      On hand: {max} {it.unit}
                    </div>
                  </div>

                  <div className="srq-stepper">
                    <button
                      type="button"
                      onClick={() => step(it, -1)}
                      aria-label={`Decrease ${it.name}`}
                      className="step"
                      disabled={selectedQty <= 0}
                    >
                      −
                    </button>

                    <input
                      className="input srq-qty"
                      type="number"
                      min="0"
                      inputMode="numeric"
                      placeholder={`Qty (${it.unit})`}
                      value={selectedQty || ""}
                      onChange={(e) => setQty(it, e.target.value)}
                    />

                    <button
                      type="button"
                      onClick={() => step(it, 1)}
                      aria-label={`Increase ${it.name}`}
                      className="step"
                      disabled={isDisabledPlus}
                    >
                      +
                    </button>

                    {selectedQty > 0 && (
                      <button
                        type="button"
                        onClick={() => removeFromCart(it.id)}
                        className="chip ghost"
                        title="Remove from request"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {filtered.length === 0 && (
              <div className="small muted" style={{ padding: 8 }}>
                No items match your filters.
              </div>
            )}
          </div>
        </section>

        {/* Review & Submit */}
        <section className="card" ref={reviewRef}>
          <div className="card-h">Review & Submit</div>

          <div className="small muted" style={{ marginBottom: 8 }}>
            Items in request: <strong>{cartList.length}</strong>
          </div>

          {cartList.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div className="small" style={{ opacity: 0.85, marginBottom: 6 }}>
                Selected
              </div>
              <div className="srq-selected">
                {cartList.map((line) => (
                  <div key={line.itemId} className="srq-selected-row">
                    <span className="srq-selected-name">{line.name}</span>
                    <span>
                      {line.qty} {line.unit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="srq-note">
            <textarea
              className="input"
              placeholder="Add a note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ minHeight: 72 }}
            />
            <div className="srq-photo">
              <label className="tiny muted" htmlFor="photoInput">
                Optional photo
              </label>
              <input
                id="photoInput"
                type="file"
                accept="image/*"
                onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
              />
              {photoPreview && (
                <img
                  src={photoPreview}
                  alt="attachment preview"
                  className="srq-preview"
                />
              )}
            </div>
          </div>

          <div className="srq-actions">
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setCart({});
                setNote("");
                setPhotoFile(null);
                setPhotoPreview("");
              }}
              disabled={submitting || (cartList.length === 0 && !note && !photoFile)}
            >
              Clear
            </button>

            <button className="btn primary" onClick={submitRequest} disabled={submitting}>
              {submitting ? "Submitting…" : "Submit Request"}
            </button>
          </div>
        </section>

        {/* Sticky footer mini-summary (mobile & desktop) */}
        <div className="srq-footer">
          <div className="srq-footer-left">
            <div className="tiny muted">In cart</div>
            <div className="footer-count">{cartList.length}</div>
          </div>
          <button className="btn primary footer-btn" onClick={scrollToReview}>
            Review
          </button>
        </div>
      </div>
      </>
  );
}

<style>{String.raw`
  :root { --border:#2a2d31; --muted:#a4a6ab; --glass:#15171a; }

  .srq-wrap{
    max-width: 1100px;
    margin: 0 auto;
    padding: 10px;
    display: grid;
    gap: 10px;
  }

  .card{
    background:#17181a;
    border:1px solid var(--border);
    border-radius:14px;
    padding:10px;
  }
  .card-h{ font-weight:700; margin-bottom:8px; }
  .tiny{ font-size:12px; } .muted{ color:var(--muted); }

  /* Sticky search + chips */
  .srq-toolbar{
    position: sticky;
    top: calc(var(--nav-h,56px) + 6px);
    z-index: 3;
    background: var(--glass);
  }
  .srq-head{ display:flex; flex-direction:column; gap:4px; margin-bottom:6px; }
  .srq-title{ margin:0; }
  .srq-search{ width:100%; margin:0; }
  .srq-chips{
    display:flex; gap:6px; margin-top:6px; overflow-x:auto; padding-bottom:2px;
    scrollbar-width: none;
  }
  .srq-chips::-webkit-scrollbar{ display:none; }

  .input{
    background:#111216; border:1px solid var(--border);
    border-radius:10px; padding:9px 10px; color:#fff; width:100%;
    box-sizing:border-box;
  }
  .chip{
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.10);
    color:#e7e7e7;
    border-radius: 999px;
    padding: 6px 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }
  .chip.is-active{
    color:#24ff98;
    border-color:#24ff98;
    background: rgba(36,255,152,0.06);
  }
  .chip.ghost{ background:#171a1f; color:#cfd1d6; }

  /* ===== Catalog list (authoritative, non-wrapping) ===== */
  .srq-list{ display:flex; flex-direction:column; gap:8px; }
  .srq-item{
    display:grid;
    grid-template-columns: 1fr;     /* one column everywhere */
    gap:8px;
    align-items:center;
    border:1px solid var(--border);
    border-radius:12px;
    padding:10px;
    background:#101216;
  }
  .srq-item-main{ min-width:0; }
  .srq-item-title{ font-weight:700; margin-bottom:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

  /* Stepper: ALWAYS a 3-cell grid: [-] [Qty] [+] */
  .srq-stepper{
    display:grid !important;               /* override any global flex rules */
    grid-template-columns: 48px 1fr 48px;  /* never wraps */
    align-items:center;
    gap:8px;
    min-width:0;
  }
  .srq-qty{
    min-width:0;
    width:100%;
    text-align:center;
  }
  .step{
    width:48px; height:48px; border-radius:10px; font-weight:800;
    border:1px solid rgba(255,255,255,0.15); background:rgba(255,255,255,0.06);
    cursor:pointer; color:#fff;
  }
  .step:disabled{ opacity:0.5; cursor:not-allowed; }

  /* "Remove" chip drops below, full row */
  .srq-stepper .chip{
    grid-column: 1 / -1;
    justify-self: end;
  }

  /* Selected list */
  .srq-selected{ display:grid; gap:6px; }
  .srq-selected-row{
    display:flex; justify-content:space-between; align-items:center;
    border:1px solid rgba(255,255,255,0.08);
    background:rgba(255,255,255,0.03);
    padding:6px 10px; border-radius:10px;
  }
  .srq-selected-name{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

  /* Note + photo */
  .srq-note{ display:grid; grid-template-columns: 1fr auto; gap:8px; align-items:start; }
  .srq-photo{ display:grid; gap:6px; width:160px; }
  .srq-preview{
    width: 160px; height: 110px; object-fit: cover;
    border-radius:10px; border:1px solid rgba(255,255,255,0.1);
  }

  /* Actions */
  .srq-actions{ display:flex; justify-content:space-between; gap:8px; margin-top:10px; }
  .btn{
    padding:10px 12px; border-radius:10px; border:1px solid var(--border);
    background:#191b20; color:#e7e8ea; cursor:pointer;
  }
  .btn.primary{ background:#1c3a31; color:#c0f3e7; border-color:#2b564a; }
  .btn.ghost{ background:#121419; color:#c9cace; }
  .btn:disabled{ opacity:0.6; cursor:not-allowed; }

  /* Sticky footer mini-summary */
  .srq-footer{
    position: sticky; bottom: 8px;
    display:flex; justify-content:space-between; align-items:center; gap:10px;
    background: rgba(16,18,22,0.92); backdrop-filter: blur(6px);
    border:1px solid var(--border); border-radius:12px; padding:8px 10px;
  }
  .srq-footer-left{ display:flex; align-items:center; gap:8px; }
  .footer-count{
    min-width:28px; text-align:center; border:1px solid var(--border);
    border-radius:999px; padding:2px 8px; background:#1a2226;
  }
  .footer-btn{ min-width:120px; }

  /* Form stacks on small screens */
  @media (max-width: 720px){
    .srq-note{ grid-template-columns: 1fr; }
    .srq-photo{ width:100%; }
    .srq-preview{ width:100%; height:160px; }
  }
`}</style>
