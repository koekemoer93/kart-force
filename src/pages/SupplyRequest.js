// src/pages/SupplyRequest.js
import React, { useEffect, useMemo, useState } from "react";
import TopNav from "../components/TopNav";
import { db } from "../firebase";
import { useAuth } from "../AuthContext";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  doc,
  getDoc,
} from "firebase/firestore";
import { createSupplyRequest } from "../services/inventory";

// ⬇️ Optional image upload (works if `storage` is exported from ../firebase)
import { storage } from "../firebase";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

export default function SupplyRequest() {
  const { user, userData } = useAuth();
  const assignedTrack = userData?.assignedTrack || "";

  const [trackName, setTrackName] = useState(
    assignedTrack ? assignedTrack : "Unassigned"
  );
  const [items, setItems] = useState([]);
  const [cart, setCart] = useState({}); // { itemId: { qty, name, unit } }
  const [submitting, setSubmitting] = useState(false);

  // New UI state
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState("All");
  const [note, setNote] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");

  // Load human-friendly track name from Firestore
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

  // Load inventory catalog (ordered by name)
  useEffect(() => {
    const invQ = query(collection(db, "inventory"), orderBy("name"));
    const un = onSnapshot(invQ, (snap) => {
      const arr = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
      setItems(arr);
    });
    return () => un();
  }, []);

  // Categories derived from items (stable + “All” first)
  const categories = useMemo(() => {
    const set = new Set();
    items.forEach((it) => set.add(String(it.category || "Uncategorized")));
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [items]);

  // Filtered + searched items
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return items
      .filter((it) => (activeCat === "All" ? true : (it.category || "Uncategorized") === activeCat))
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
    if (!assignedTrack) return alert("You need an assigned track to request stock.");
    if (cartList.length === 0) return alert("Add at least one item.");

    setSubmitting(true);
    let photoURL = "";

// Optional upload to Firebase Storage if configured
if (photoFile && storage) {
  try {
    // make a safe filename
    const ext = (photoFile.name?.split(".").pop() || "jpg").toLowerCase();
    const safeBase = (photoFile.name || "attachment")
      .replace(/[^\w.\-]+/g, "_")
      .slice(0, 48);
    const path = `supplyRequests/${user?.uid || "anon"}/${Date.now()}-${safeBase}.${ext}`;

    const r = storageRef(storage, path);
    // 👇 include contentType to keep CORS preflight simple
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
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to submit request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <TopNav />
      <div className="main-wrapper" style={{ padding: 16, display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 1100, display: "grid", gap: 12 }}>
          {/* Header / Controls */}
          <div className="glass-card" style={{ padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <h3 style={{ margin: 0 }}>Request Stock — {trackName}</h3>
              <div className="small muted">You can only request up to the available central stock.</div>
            </div>

            {/* Search + Category chips (mobile-first) */}
            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
              <input
                className="input-field"
                placeholder="Search items..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search items"
              />

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {categories.map((cat) => {
                  const active = cat === activeCat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setActiveCat(cat)}
                      className="weekday-chip"
                      aria-pressed={active}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: active ? "rgba(36,255,152,0.18)" : "rgba(255,255,255,0.04)",
                        fontWeight: 600,
                        fontSize: 13,
                      }}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Catalog grid */}
          <div className="glass-card" style={{ padding: 12 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
                gap: 10,
              }}
            >
              {filtered.map((it) => {
                const selectedQty = cart[it.id]?.qty ?? 0;
                const max = it.qty || 0;
                return (
                  <div key={it.id} className="track-card">
                    <div className="card track" style={{ padding: 12 }}>
                      <div className="row between wrap gap12">
                        <h4 className="track-name" style={{ margin: 0 }}>{it.name}</h4>
                        <span className="small muted">
                          On hand: {max} {it.unit}
                        </span>
                      </div>

                      {/* Stepper + input (mobile friendly) */}
                      <div className="row gap12" style={{ marginTop: 10, alignItems: "center", flexWrap: "nowrap" }}>
                        <button
                          type="button"
                          onClick={() => step(it, -1)}
                          aria-label={`Decrease ${it.name}`}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            border: "1px solid rgba(255,255,255,0.15)",
                            background: "rgba(255,255,255,0.06)",
                            fontWeight: 800,
                          }}
                          disabled={selectedQty <= 0}
                        >
                          −
                        </button>

                        <input
                          className="input-field"
                          type="number"
                          min="0"
                          inputMode="numeric"
                          placeholder={`Qty (${it.unit})`}
                          value={selectedQty || ""}
                          onChange={(e) => setQty(it, e.target.value)}
                          style={{ width: 110, textAlign: "center" }}
                        />

                        <button
                          type="button"
                          onClick={() => step(it, 1)}
                          aria-label={`Increase ${it.name}`}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            border: "1px solid rgba(255,255,255,0.15)",
                            background: "rgba(255,255,255,0.06)",
                            fontWeight: 800,
                          }}
                          disabled={selectedQty >= max}
                        >
                          +
                        </button>

                        {selectedQty > 0 && (
                          <button
                            type="button"
                            onClick={() => removeFromCart(it.id)}
                            className="small"
                            style={{
                              marginLeft: "auto",
                              opacity: 0.9,
                              border: "1px solid rgba(255,255,255,0.12)",
                              background: "rgba(255,255,255,0.03)",
                              padding: "6px 10px",
                              borderRadius: 8,
                            }}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {filtered.length === 0 && (
              <div className="small muted" style={{ padding: 12 }}>
                No items match your filters.
              </div>
            )}
          </div>

          {/* Review & Submit (note + photo) */}
          <div className="glass-card" style={{ padding: 14 }}>
            <h4 style={{ marginTop: 0, marginBottom: 8 }}>Review & Submit</h4>

            <div className="small muted" style={{ marginBottom: 8 }}>
              Items in request: <strong>{cartList.length}</strong>
            </div>

            {cartList.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div className="small" style={{ opacity: 0.85, marginBottom: 6 }}>Selected</div>
                <div style={{ display: "grid", gap: 6 }}>
                  {cartList.map((line) => (
                    <div
                      key={line.itemId}
                      className="small"
                      style={{
                        display: "flex",
                        gap: 8,
                        justifyContent: "space-between",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 10,
                        padding: "6px 10px",
                        background: "rgba(255,255,255,0.03)",
                      }}
                    >
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {line.name}
                      </span>
                      <span>
                        {line.qty} {line.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Note + optional photo */}
            <div className="row gap12 wrap" style={{ alignItems: "flex-start" }}>
              <textarea
                className="input-field"
                placeholder="Add a note (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                style={{ minHeight: 72, flex: "1 1 260px" }}
              />
              <div style={{ display: "grid", gap: 6 }}>
                <label className="small" htmlFor="photoInput" style={{ opacity: 0.85 }}>
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
                    style={{
                      width: 140,
                      height: 100,
                      objectFit: "cover",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.1)",
                    }}
                  />
                )}
              </div>
            </div>

            <div className="row between" style={{ marginTop: 14 }}>
              <button
                type="button"
                className="button-secondary"
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

              <button
                className="button-primary"
                onClick={submitRequest}
                disabled={submitting}
              >
                {submitting ? "Submitting…" : "Submit Request"}
              </button>
            </div>
          </div>

          {/* Bottom spacer for mobile safe area */}
          <div style={{ height: 12 }} />
        </div>
      </div>
    </>
  );
}
