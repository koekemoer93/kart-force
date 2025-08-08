// src/pages/SeedAllHours.js
import React, { useMemo, useState } from "react";
import { doc, getDoc, setDoc, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import TopNav from "../components/TopNav";

/**
 * What this page does (super simple English):
 * - You paste your full trading hours JSON for all tracks.
 * - We detect where your existing Syringa hours live (field on the track doc OR a subdoc).
 * - We read the current docs first (no writes yet).
 * - We only add updates to the batch for docs that actually changed.
 * - We commit ONE batch at the end so it's atomic and fast.
 *
 * Safety:
 * - Idempotent: running this again with the same JSON makes 0 writes.
 * - Merge-safe: we only update the "hours" (and "name" if present) field of a track doc OR the /config/hours subdoc, leaving everything else intact.
 * - Auto-creates missing parent track docs in SUBDOC mode so tracks show in your app.
 */

// Helper: clean up "09:00" etc to HH:mm
function normalizeTime(t) {
  if (!t) return t;
  const trimmed = String(t).trim();
  // Accept "9:00" -> "09:00"
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return trimmed;
  const hh = String(match[1]).padStart(2, "0");
  const mm = match[2];
  return `${hh}:${mm}`;
}

// Helper: normalize one day's shape
function normalizeDay(day) {
  if (!day) return day;
  const base = {
    open: day.open ? normalizeTime(day.open) : "",
    close: day.close ? normalizeTime(day.close) : "",
    closed: Boolean(day.closed),
  };
  return base;
}

// Helper: normalize "hours" object keys
function normalizeHours(hours) {
  if (!hours || typeof hours !== "object") return hours;
  const days = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];
  const out = {};
  for (const d of days) {
    out[d] = normalizeDay(hours[d] || { open: "", close: "", closed: true });
  }
  return out;
}

// Compare meaningful fields to decide if a write is needed
function shallowEqualHours(a, b) {
  const days = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];
  for (const d of days) {
    const A = (a && a[d]) || {};
    const B = (b && b[d]) || {};
    if (
      (A.open || "") !== (B.open || "") ||
      (A.close || "") !== (B.close || "") ||
      Boolean(A.closed) !== Boolean(B.closed)
    ) {
      return false;
    }
  }
  return true;
}

/**
 * We don't know your exact schema from here, so we auto-detect using "syringa".
 * We try in this order:
 *   1) tracks/syringa (has field "hours")  -> MODE = "FIELD"
 *   2) tracks/syringa/config/hours (subdoc) -> MODE = "SUBDOC"
 * If neither exists, we default to FIELD mode (safest common)
 */
async function detectHoursMode() {
  // Try FIELD mode first
  const fieldDoc = await getDoc(doc(db, "tracks", "syringa"));
  if (fieldDoc.exists() && fieldDoc.data() && "hours" in fieldDoc.data()) {
    return { mode: "FIELD" };
  }
  // Try SUBDOC mode
  const subDoc = await getDoc(doc(db, "tracks", "syringa", "config", "hours"));
  if (subDoc.exists()) {
    return { mode: "SUBDOC" };
  }
  // Default if nothing is there
  return { mode: "FIELD" };
}

// Build the doc ref based on detected mode and trackId
function getTargetRef(mode, trackId) {
  if (mode === "SUBDOC") {
    return doc(db, "tracks", trackId, "config", "hours");
  }
  // default FIELD mode
  return doc(db, "tracks", trackId);
}

// Parent track doc ref (works for both modes)
function getParentTrackRef(trackId) {
  return doc(db, "tracks", trackId);
}

// Read the current value used for comparison (hours field for FIELD, doc data for SUBDOC)
async function getCurrentHours(mode, trackId) {
  const ref = getTargetRef(mode, trackId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  if (mode === "SUBDOC") {
    // The entire subdoc is just the "hours" shape
    return snap.data();
  }
  // mode FIELD: "hours" is a field on the track doc
  const data = snap.data();
  return data && data.hours ? data.hours : null;
}

// Prepare the batch write for a single track (if changes are needed)
function addWriteToBatch(batch, mode, track) {
  const { trackId, name, hours } = track;
  const normalizedHours = normalizeHours(hours || {});
  const ref = getTargetRef(mode, trackId);

  if (mode === "SUBDOC") {
    // In SUBDOC mode, the whole doc is just the hours object.
    batch.set(ref, normalizedHours, { merge: true });
  } else {
    // In FIELD mode, we set on the track doc:
    const toSet = { hours: normalizedHours };
    if (name) toSet.name = name; // update name if provided
    batch.set(ref, toSet, { merge: true });
  }
}

export default function SeedAllHours() {
  const [jsonText, setJsonText] = useState("");
  const [status, setStatus] = useState("");
  const [detectedMode, setDetectedMode] = useState(null);
  const [preview, setPreview] = useState([]);

  const parsed = useMemo(() => {
    try {
      const arr = JSON.parse(jsonText);
      if (!Array.isArray(arr)) return [];
      return arr.map((t) => {
  const hasHours = Object.prototype.hasOwnProperty.call(t, "hours");
  return {
    trackId: String(t.trackId || "").trim(),
    name: t.name ? String(t.name).trim() : "",
    hours: hasHours
      ? (t.hours === null ? null : normalizeHours(t.hours || {}))
      : null, // if not provided, treat as null (no change)
  };
});

    } catch {
      return [];
    }
  }, [jsonText]);

  const handleDetect = async () => {
    setStatus("Detecting hours schema…");
    const mode = await detectHoursMode();
    setDetectedMode(mode.mode);
    setStatus(
      `Detected schema: ${
        mode.mode === "SUBDOC"
          ? "Subdocument at /tracks/{id}/config/hours"
          : "Field 'hours' on /tracks/{id}"
      }`
    );
  };

  const handlePreview = () => {
    setPreview(parsed);
    if (!parsed.length) {
      setStatus("⚠️ JSON is invalid or empty.");
    } else {
      setStatus(
        `Loaded ${parsed.length} track(s). Click "Seed Hours" to write (idempotent).`
      );
    }
  };

  const handleSeed = async () => {
    try {
      if (!parsed.length) {
        setStatus("⚠️ Please paste valid JSON and click Preview first.");
        return;
      }
      if (!detectedMode) {
        setStatus("⚠️ Please click 'Detect Schema' first.");
        return;
      }

      setStatus("Reading current data to compute diffs…");

      // 1) Read current hours and (if SUBDOC) whether parent track docs exist
      const currentByTrack = {};
      const parentExistsByTrack = {};

      for (const t of parsed) {
        if (!t.trackId) continue;

        currentByTrack[t.trackId] = await getCurrentHours(
          detectedMode,
          t.trackId
        );

        if (detectedMode === "SUBDOC") {
          const parentRef = getParentTrackRef(t.trackId);
          const parentSnap = await getDoc(parentRef);
          parentExistsByTrack[t.trackId] = parentSnap.exists();
        }
      }

      // 2) Build a single batch with only necessary writes
      const batch = writeBatch(db);
      let writes = 0;

      for (const t of parsed) {
        if (!t.trackId) continue;

        // Ensure parent track doc exists in SUBDOC mode (so your app can see the track in /tracks)
        if (detectedMode === "SUBDOC" && !parentExistsByTrack[t.trackId]) {
          const parentRef = getParentTrackRef(t.trackId);
          const base = { createdAt: serverTimestamp() };
          if (t.name) base.name = t.name;
          batch.set(parentRef, base, { merge: true });
          writes++;
        }

        // Compare and only write hours if changed / not present
        const existing = currentByTrack[t.trackId] || null;
const incoming = t.hours;

// If hours is null, we DO NOT modify hours (but we may still create/merge parent name in SUBDOC mode above)
if (incoming === null) {
  // If FIELD mode and we want to update the name only (optional)
  if (detectedMode !== "SUBDOC" && t.name) {
    const parentRef = getParentTrackRef(t.trackId);
    batch.set(parentRef, { name: t.name }, { merge: true });
    writes++;
  }
  continue;
}

// Normal idempotent compare
if (existing && shallowEqualHours(existing, incoming)) {
  continue; // no change -> no write
}

addWriteToBatch(batch, detectedMode, t);
writes++;

      }

      if (writes === 0) {
        setStatus("No changes detected. ✅ Everything already up-to-date.");
        return;
      }

      setStatus(`Committing a single batch with ${writes} write(s)…`);
      await batch.commit();
      setStatus(`✅ Done! Wrote ${writes} document(s) in one batch.`);
    } catch (err) {
      console.error(err);
      setStatus("❌ Failed: " + (err?.message || String(err)));
    }
  };

  return (
    <>
      <TopNav role="admin" />
      <div
        className="main-wrapper"
        style={{ padding: 16, maxWidth: 920, margin: "0 auto" }}
      >
        <div className="glass-card" style={{ padding: 16 }}>
          <h2>Batch Seed Trading Hours (Admin)</h2>
          <p style={{ opacity: 0.9 }}>
            Paste the full JSON for all tracks, then click{" "}
            <strong>Detect Schema</strong>, <strong>Preview</strong>, and
            finally <strong>Seed Hours</strong>.
          </p>

          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            rows={12}
            placeholder="Paste your JSON array here…"
            style={{
              width: "100%",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.15)",
              color: "white",
              padding: 12,
              borderRadius: 12,
              fontFamily: "monospace",
            }}
          />

          <div
            style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}
          >
            <button className="button-primary" onClick={handleDetect}>
              Detect Schema
            </button>
            <button className="button-primary" onClick={handlePreview}>
              Preview
            </button>
            <button className="button-primary" onClick={handleSeed}>
              Seed Hours
            </button>
          </div>

          <p style={{ marginTop: 12 }}>{status}</p>

          {preview.length > 0 && (
            <div className="glass-card" style={{ marginTop: 12, padding: 12 }}>
              <h3>Preview ({preview.length})</h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 2fr",
                  gap: 8,
                }}
              >
                {preview.map((t) => (
                  <div
                    key={t.trackId}
                    style={{
                      borderBottom: "1px solid rgba(255,255,255,0.08)",
                      padding: "8px 0",
                    }}
                  >
                    <div>
                      <strong>{t.name || t.trackId}</strong>
                    </div>
                    <code style={{ fontSize: 12, opacity: 0.85 }}>
                      {t.trackId}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
