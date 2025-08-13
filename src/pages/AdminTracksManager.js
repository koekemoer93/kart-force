// src/pages/AdminTracksManager.js
import React, { useEffect, useMemo, useState } from "react";
import TopNav from "../components/TopNav";
import { db } from "../firebase";
import {
  collection,
  doc,
  getDocs,
  updateDoc,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { isAdmin } from "../utils/roles";

function isFiniteNum(v) {
  return Number.isFinite(Number(v));
}
function clamp(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return NaN;
  return Math.min(max, Math.max(min, x));
}

export default function AdminTracksManager() {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  // Bulk paste
  const [bulkText, setBulkText] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  // Load all tracks once
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, "tracks"));
        const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setTracks(arr);
      } catch (e) {
        console.error("Load tracks error:", e);
        alert("Failed to load tracks.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function saveRow(row) {
    const { id, displayName } = row;
    const lat = clamp(row.lat, -90, 90);
    const lng = clamp(row.lng, -180, 180);
    const radius = Math.max(50, Math.round(Number(row.radiusMeters || 0) || 300));

    if (!id) return alert("Missing track id");
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return alert("Please enter valid coordinates.");
    }

    try {
      setSavingId(id);
      const ref = doc(db, "tracks", id);
      await updateDoc(ref, {
        displayName: displayName || id,
        lat,
        lng,
        radiusMeters: radius,
      });
      alert("Saved ✔");
    } catch (e) {
      // If doc might not exist, allow setDoc fallback
      try {
        const ref = doc(db, "tracks", id);
        await setDoc(ref, {
          displayName: displayName || id,
          lat,
          lng,
          radiusMeters: radius,
        }, { merge: true });
        alert("Saved ✔");
      } catch (err) {
        console.error("Save row error:", err);
        alert(err.message || "Failed to save.");
      }
    } finally {
      setSavingId(null);
    }
  }

  // Bulk format: one per line -> trackId,lat,lng,radius
  async function handleBulkApply() {
    if (!bulkText.trim()) return;
    const lines = bulkText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    // Preview parse
    const updates = [];
    for (const line of lines) {
      const parts = line.split(/[,;\s]+/).filter(Boolean);
      if (parts.length < 3) {
        return alert(`Line needs at least "trackId lat lng":\n${line}`);
      }
      const [id, latStr, lngStr, rStr] = parts;
      const lat = clamp(latStr, -90, 90);
      const lng = clamp(lngStr, -180, 180);
      const radius = Math.max(50, Math.round(Number(rStr || 300) || 300));
      if (!id || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        return alert(`Invalid line:\n${line}`);
      }
      updates.push({ id, lat, lng, radiusMeters: radius });
    }

    // Write batch
    try {
      setBulkBusy(true);
      const batch = writeBatch(db);
      updates.forEach((u) => {
        const ref = doc(db, "tracks", u.id);
        batch.set(
          ref,
          {
            displayName: u.id,   // can edit later per row
            lat: u.lat,
            lng: u.lng,
            radiusMeters: u.radiusMeters,
          },
          { merge: true }
        );
      });
      await batch.commit();
      alert(`Applied ${updates.length} track updates ✔`);
      setBulkText("");
    } catch (e) {
      console.error("Bulk set error:", e);
      alert(e.message || "Bulk apply failed.");
    } finally {
      setBulkBusy(false);
    }
  }

  const sorted = useMemo(
    () => tracks.slice().sort((a, b) => String(a.displayName || a.id).localeCompare(String(b.displayName || b.id))),
    [tracks]
  );

  return (
    <>
      <TopNav role="admin" />
      <div className="main-wrapper" style={{ padding: 16, display: "flex", justifyContent: "center" }}>
        <div className="glass-card" style={{ width: "100%", maxWidth: 980, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>Admin — Tracks Manager</h2>
            <div className="small muted">Edit lat / lng / radiusMeters used by geofence.</div>
          </div>

          {/* Bulk paste */}
          <div className="glass-card" style={{ marginTop: 12, padding: 12 }}>
            <div className="row between wrap" style={{ gap: 12 }}>
              <div>
                <strong>Bulk paste</strong>
                <div className="small muted">Format: <code>trackId, lat, lng, radius</code> — one per line.</div>
              </div>
              <button
                className="button-primary"
                disabled={bulkBusy || !bulkText.trim()}
                onClick={handleBulkApply}
              >
                {bulkBusy ? "Applying…" : "Apply Updates"}
              </button>
            </div>
            <textarea
              className="input-field"
              placeholder={`syringapark, -26.0995, 28.0582, 320\nindy-eastgate, -26.1430, 28.1164, 300`}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              style={{ marginTop: 8, minHeight: 100 }}
            />
          </div>

          {/* Table */}
          <div className="glass-card" style={{ marginTop: 12, padding: 12 }}>
            {loading ? (
              <p>Loading tracks…</p>
            ) : sorted.length === 0 ? (
              <p className="muted">No tracks yet.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="table dark responsive" style={{ width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>Track ID</th>
                      <th>Display name</th>
                      <th>Lat</th>
                      <th>Lng</th>
                      <th>Radius (m)</th>
                      <th>Save</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((t) => (
                      <Row key={t.id} row={t} onSave={saveRow} saving={savingId === t.id} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="small muted" style={{ marginTop: 10 }}>
            Tip: paste coords from Google Maps (Right-click → “What’s here?”).
          </div>
        </div>
      </div>
    </>
  );
}

function Row({ row, onSave, saving }) {
  const [form, setForm] = useState({
    id: row.id,
    displayName: row.displayName || row.id,
    lat: row.lat ?? "",
    lng: row.lng ?? "",
    radiusMeters: row.radiusMeters ?? 300,
  });

  return (
    <tr>
      <td data-label="Track ID">
        <code>{row.id}</code>
      </td>
      <td data-label="Display name">
        <input
          className="input-field"
          value={form.displayName}
          onChange={(e) => setForm({ ...form, displayName: e.target.value })}
          style={{ minWidth: 160 }}
        />
      </td>
      <td data-label="Lat">
        <input
          className="input-field"
          inputMode="decimal"
          value={form.lat}
          onChange={(e) => setForm({ ...form, lat: e.target.value })}
          placeholder="-26.1234"
          style={{ width: 140 }}
        />
      </td>
      <td data-label="Lng">
        <input
          className="input-field"
          inputMode="decimal"
          value={form.lng}
          onChange={(e) => setForm({ ...form, lng: e.target.value })}
          placeholder="28.1234"
          style={{ width: 140 }}
        />
      </td>
      <td data-label="Radius">
        <input
          className="input-field"
          type="number"
          min={50}
          value={form.radiusMeters}
          onChange={(e) => setForm({ ...form, radiusMeters: e.target.value })}
          style={{ width: 120 }}
        />
      </td>
      <td>
        <button
          className="button-primary"
          disabled={saving}
          onClick={() => onSave(form)}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </td>
    </tr>
  );
}
