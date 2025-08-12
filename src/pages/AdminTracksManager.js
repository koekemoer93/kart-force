// src/pages/AdminTracksManager.js
import React, { useEffect, useState } from "react";
import TopNav from "../components/TopNav";
import { db } from "../firebase";
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { useAuth } from "../AuthContext";
import { isAdmin as isAdminFn } from "../utils/roles";

const defaultHours = {
  mon: { open: "09:00", close: "18:00" },
  tue: { open: "09:00", close: "18:00" },
  wed: { open: "09:00", close: "18:00" },
  thu: { open: "09:00", close: "18:00" },
  fri: { open: "09:00", close: "18:00" },
  sat: { open: "09:00", close: "18:00" },
  sun: { open: "09:00", close: "18:00" },
};

function Row({ label, children }) {
  return (
    <label style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 12, alignItems: "center", marginBottom: 10 }}>
      <span style={{ opacity: 0.9 }}>{label}</span>
      {children}
    </label>
  );
}

export default function AdminTracksManager() {
  const { role } = useAuth();
  const admin = isAdminFn(role);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const qTracks = query(collection(db, "tracks"), orderBy("displayName"));
      const snap = await getDocs(qTracks);
      setTracks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  function startCreate() {
    setEditing({ trackId: "", displayName: "", lat: "", lng: "", radiusMeters: 300, hours: defaultHours });
  }
  function startEdit(t) {
    setEditing({ trackId: t.id, displayName: t.displayName || "", lat: t.lat ?? "", lng: t.lng ?? "", radiusMeters: t.radiusMeters ?? 300, hours: t.hours || defaultHours });
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!admin) return alert("Admins only.");
    const payload = {
      displayName: String(editing.displayName || "").trim(),
      lat: Number(editing.lat),
      lng: Number(editing.lng),
      radiusMeters: Number(editing.radiusMeters) || 300,
      hours: editing.hours || {},
      updatedAt: serverTimestamp(),
    };
    if (!payload.displayName) return alert("Display name is required.");
    if (!Number.isFinite(payload.lat) || !Number.isFinite(payload.lng)) return alert("Valid numeric lat/lng required.");
    setSaving(true);
    try {
      if (editing.trackId) {
        await updateDoc(doc(db, "tracks", editing.trackId), payload);
      } else {
        const slug = (editing.trackId || payload.displayName).toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
        if (!slug) return alert("Please provide a valid trackId or displayName.");
        await setDoc(doc(db, "tracks", slug), { ...payload, createdAt: serverTimestamp() });
      }
      await refresh();
      setEditing(null);
    } catch (err) {
      console.error("Save track error:", err);
      alert(err.message || "Failed to save track.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!admin) return alert("Admins only.");
    if (!window.confirm("Delete this track? This cannot be undone.")) return;
    try {
      await deleteDoc(doc(db, "tracks", id));
      setTracks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      console.error("Delete track error:", err);
      alert("Failed to delete track.");
    }
  }

  function setHours(day, field, value) {
    setEditing((prev) => ({ ...prev, hours: { ...prev.hours, [day]: { ...prev.hours[day], [field]: value } } }));
  }

  return (
    <>
      <TopNav />
      <div className="main-wrapper" style={{ minHeight: "100vh", display: "flex", justifyContent: "center", padding: 16 }}>
        <div className="glass-card" style={{ maxWidth: 920, width: "100%", padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>Admin · Tracks Manager</h2>
            <button onClick={startCreate} className="btn" style={{ padding: "10px 14px", borderRadius: 12, background: "#222", border: "1px solid #2a2d31", color: "#fff" }} disabled={!admin}>+ New Track</button>
          </div>

          <div style={{ marginTop: 16 }}>
            {loading ? <div>Loading…</div> : tracks.length === 0 ? <div style={{ opacity: 0.8 }}>No tracks yet.</div> : (
              <div style={{ display: "grid", gap: 10 }}>
                {tracks.map((t) => (
                  <div key={t.id} style={{ background: "#17181a", border: "1px solid #2a2d31", borderRadius: 14, padding: 14 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{t.displayName || t.id}</div>
                        <div style={{ fontSize: 13, opacity: 0.8 }}>id: <code>{t.id}</code> · lat/lng: {t.lat},{t.lng} · r: {t.radiusMeters}m</div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => startEdit(t)} style={{ padding: "8px 12px", borderRadius: 10, background: "#222", border: "1px solid #2a2d31", color: "#fff" }} disabled={!admin}>Edit</button>
                        <button onClick={() => handleDelete(t.id)} style={{ padding: "8px 12px", borderRadius: 10, background: "#2a1212", border: "1px solid #3a1c1c", color: "#fff" }} disabled={!admin}>Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {editing && (
            <form onSubmit={handleSave} style={{ marginTop: 18, background: "#17181a", border: "1px solid #2a2d31", borderRadius: 14, padding: 14 }}>
              <h3 style={{ marginTop: 0 }}>{editing.trackId ? "Edit Track" : "New Track"}</h3>

              {!editing.trackId && (
                <Row label="Track ID (slug)">
                  <input value={editing.trackId} onChange={(e) => setEditing({ ...editing, trackId: e.target.value })} placeholder="e.g. syringapark" style={{ width: "100%", padding: 10, borderRadius: 10, background: "#121315", border: "1px solid #2a2d31", color: "#fff" }} />
                </Row>
              )}

              <Row label="Display name">
                <input value={editing.displayName} onChange={(e) => setEditing({ ...editing, displayName: e.target.value })} placeholder="Syringa Park" required style={{ width: "100%", padding: 10, borderRadius: 10, background: "#121315", border: "1px solid #2a2d31", color: "#fff" }} />
              </Row>

              <Row label="Latitude">
                <input value={editing.lat} onChange={(e) => setEditing({ ...editing, lat: e.target.value })} placeholder="-25.74" required style={{ width: "100%", padding: 10, borderRadius: 10, background: "#121315", border: "1px solid #2a2d31", color: "#fff" }} />
              </Row>

              <Row label="Longitude">
                <input value={editing.lng} onChange={(e) => setEditing({ ...editing, lng: e.target.value })} placeholder="28.19" required style={{ width: "100%", padding: 10, borderRadius: 10, background: "#121315", border: "1px solid #2a2d31", color: "#fff" }} />
              </Row>

              <Row label="Radius (m)">
                <input type="number" value={editing.radiusMeters} onChange={(e) => setEditing({ ...editing, radiusMeters: e.target.value })} min={50} style={{ width: "100%", padding: 10, borderRadius: 10, background: "#121315", border: "1px solid #2a2d31", color: "#fff" }} />
              </Row>

              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Hours (optional)</div>
                {Object.entries(editing.hours || {}).map(([day, val]) => (
                  <div key={day} style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr", gap: 10, marginBottom: 6 }}>
                    <div style={{ opacity: 0.85, alignSelf: "center" }}>{day.toUpperCase()}</div>
                    <input value={val.open} onChange={(e) => setHours(day, "open", e.target.value)} placeholder="09:00" style={{ padding: 10, borderRadius: 10, background: "#121315", border: "1px solid #2a2d31", color: "#fff" }} />
                    <input value={val.close} onChange={(e) => setHours(day, "close", e.target.value)} placeholder="18:00" style={{ padding: 10, borderRadius: 10, background: "#121315", border: "1px solid #2a2d31", color: "#fff" }} />
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button type="submit" disabled={saving || !admin} style={{ padding: "10px 14px", borderRadius: 12, background: "#1e2a1f", border: "1px solid #2d3d2e", color: "#d6ffd6" }}>{saving ? "Saving…" : "Save"}</button>
                <button type="button" onClick={() => setEditing(null)} style={{ padding: "10px 14px", borderRadius: 12, background: "#222", border: "1px solid #2a2d31", color: "#fff" }}>Cancel</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
