import React, { useEffect, useMemo, useRef, useState } from "react";
import TopNav from "../components/TopNav";
import { useAuth } from "../AuthContext";
import { useGeofence } from "../hooks/useGeofence";
import { clockIn, clockOut } from "../services/timeEntries";
import { db } from "../firebase";
import { collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";

const CLOCK_RADIUS_MIN = 300; // fallback if track.radiusMeters missing

function formatHHmm(date) {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
  } catch {
    const h = String(date.getHours()).padStart(2, "0");
    const m = String(date.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  }
}

/** Big round primary button */
function CircleButton({ label, disabled, busy, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      className="button-primary"
      style={{
        width: 180,
        height: 180,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        fontSize: 20,
        fontWeight: 800,
        letterSpacing: 0.3,
        cursor: disabled || busy ? "not-allowed" : "pointer",
        position: "relative",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTapHighlightColor: "transparent",
        border: "1px solid rgba(255,255,255,0.12)",
        background: danger
          ? "radial-gradient(50% 50% at 50% 50%, #ff6b6b 0%, #c74b4b 100%)"
          : "radial-gradient(50% 50% at 50% 50%, #1fe2a7 0%, #0ea77b 100%)",
        boxShadow: "0 10px 25px rgba(0,0,0,0.35), inset 0 2px 8px rgba(255,255,255,0.08)",
        color: "#0b0b0c",
      }}
      aria-label={label}
    >
      <span style={{ opacity: busy ? 0.2 : 1 }}>{label}</span>
      {busy && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            width: 30,
            height: 30,
            borderRadius: "50%",
            border: "3px solid rgba(255,255,255,0.7)",
            borderTopColor: "transparent",
            animation: "kfspin 1s linear infinite",
          }}
        />
      )}
      {/* minimal keyframes without touching your global CSS files */}
      <style>{`@keyframes kfspin { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}

export default function Clock() {
  const { user, userData } = useAuth();
  const uid = user?.uid;
  const assignedTrack = userData?.assignedTrack ?? null;

  // Dev bypass toggle (Shift+G)
  const allowBypass =
    process.env.NODE_ENV !== "production" ||
    String(process.env.REACT_APP_ALLOW_BYPASS).toLowerCase() === "true";
  const bypassActive =
    allowBypass &&
    typeof window !== "undefined" &&
    window.localStorage.getItem("bypassFence") === "true";

  useEffect(() => {
    if (!allowBypass) return;
    const onKey = (e) => {
      if (e.shiftKey && (e.key === "g" || e.key === "G")) {
        const next =
          window.localStorage.getItem("bypassFence") === "true" ? "false" : "true";
        window.localStorage.setItem("bypassFence", next);
        window.location.reload();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [allowBypass]);

  // Geofence hook (must be the improved version we added earlier)
  const {
    coords,
    accuracy,                   // meters (may be null on first load)
    isInsideFence,              // boolean from hook (uses effective radius)
    permissionState,            // 'prompt' | 'granted' | 'denied' | ...
    error: geoError,
    track,
    requestPosition,            // triggers iOS prompt & refining
    startWatch,                 // begin a watch for smoother updates
  } = useGeofence(assignedTrack);

  // Start a watch once permission is granted (keeps coords fresh while page is open)
  useEffect(() => {
    if (permissionState === "granted") startWatch?.();
  }, [permissionState, startWatch]);

  // Fetch open time entry (if clocked in)
  const [openEntry, setOpenEntry] = useState(null);
  const [loadingEntry, setLoadingEntry] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadOpen() {
      if (!uid) return;
      setLoadingEntry(true);
      const qOpen = query(
        collection(db, "timeEntries"),
        where("uid", "==", uid),
        where("clockOutAt", "==", null),
        orderBy("clockInAt", "desc"),
        limit(1)
      );
      const snap = await getDocs(qOpen);
      if (cancelled) return;
      setOpenEntry(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() });
      setLoadingEntry(false);
    }
    loadOpen();
    return () => { cancelled = true; };
  }, [uid]);

  // Distance calc for display
  const approxDistance = useMemo(() => {
    if (!coords || !track?.lat || !track?.lng) return null;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(track.lat - coords.lat);
    const dLng = toRad(track.lng - coords.lng);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(coords.lat)) *
        Math.cos(toRad(track.lat)) *
        Math.sin(dLng / 2) ** 2;
    const d = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(d);
  }, [coords, track]);

  const trackRadius = useMemo(() => {
    const n = Number(track?.radiusMeters);
    return Number.isFinite(n) ? Math.max(n, CLOCK_RADIUS_MIN) : CLOCK_RADIUS_MIN;
  }, [track]);

  // Effective radius: trackRadius + up to 100m of accuracy slack
  const effectiveRadius = useMemo(() => {
    const acc = typeof accuracy === "number" ? Math.min(accuracy, 100) : 0;
    return trackRadius + acc;
  }, [trackRadius, accuracy]);

  // Allow if bypass, or hook says inside, or distance <= effectiveRadius
  const withinAllowedZone = useMemo(() => {
    if (bypassActive) return true;
    if (isInsideFence === true) return true;
    if (approxDistance == null) return false;
    return approxDistance <= effectiveRadius;
  }, [bypassActive, isInsideFence, approxDistance, effectiveRadius]);

  const currentTrackName = track?.displayName || assignedTrack || "No track";
  const clockedInAtText = useMemo(() => {
    if (!openEntry?.clockInAt) return "";
    const started = openEntry.clockInAt?.toDate
      ? openEntry.clockInAt.toDate()
      : new Date(openEntry.clockInAt);
    return formatHHmm(started);
  }, [openEntry]);

  /** Single round button handler:
   *  - triggers iOS location prompt/refine on first tap
   *  - checks fence after location
   *  - performs clock in/out
   */
  const onPressCircle = async () => {
    if (!uid) return;
    if (!assignedTrack) {
      setNotice("You do not have an assigned track. Ask an admin to assign you before clocking.");
      return;
    }
    if (busy) return;
    setNotice("");

    try {
      setBusy(true);

      // 1) Ensure we have permission + a fresh position (this triggers iOS prompt)
      await requestPosition?.();

      // 2) Re-check fence
      const allowedNow = bypassActive || withinAllowedZone;
      if (!allowedNow) {
        setBusy(false);
        setNotice(
          `You must be within ~${Math.round(effectiveRadius)}m of ${currentTrackName} to clock ${
            openEntry ? "out" : "in"
          }.`
        );
        return;
      }

      // 3) Do the clock action
      if (openEntry) {
        await clockOut({ uid });
      } else {
        await clockIn({ uid, trackId: assignedTrack });
      }

      // 4) Refresh open entry
      const qOpen = query(
        collection(db, "timeEntries"),
        where("uid", "==", uid),
        where("clockOutAt", "==", null),
        orderBy("clockInAt", "desc"),
        limit(1)
      );
      const snap = await getDocs(qOpen);
      setOpenEntry(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() });
      setNotice("");
    } catch (e) {
      setNotice(String(e?.message || "Clock action failed."));
    } finally {
      setBusy(false);
    }
  };

  const mainLabel = loadingEntry
    ? "Loading…"
    : openEntry
    ? "Clock Out"
    : "Clock In";

  return (
    <>
      <TopNav />

      {bypassActive && (
        <div className="bypass-banner" role="status" aria-live="polite">
          Geofence bypass enabled (dev mode)
        </div>
      )}

      <div className="main-wrapper" style={{ display: "flex", justifyContent: "center", padding: 16 }}>
        <div className="glass-card" style={{ maxWidth: 560, width: "100%", padding: 18 }}>
          <h2 style={{ marginTop: 0 }}>Clock</h2>

          <div
            className="glass-card"
            style={{
              padding: 16,
              marginBottom: 16,
              background: "rgba(0,0,0,0.25)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              Tap the button to clock {openEntry ? "out" : "in"} at <b>{currentTrackName}</b>.
            </div>

            {/* Live location readout (helps staff understand what's happening) */}
            {approxDistance !== null && (
              <div style={{ opacity: 0.85, marginTop: 6 }}>
                Distance to track: <strong>{approxDistance} m</strong>
                {typeof accuracy === "number" ? (
                  <> (acc ~{Math.round(accuracy)} m, allowed ≤ {Math.round(effectiveRadius)} m)</>
                ) : (
                  <> (allowed ≤ {Math.round(effectiveRadius)} m)</>
                )}
              </div>
            )}

            {/* Permission problems */}
            {permissionState === "denied" && (
              <div style={{ color: "#ff7070", marginTop: 8 }}>
                Location is denied. Go to iPhone Settings → Safari (or your Home Screen app) → Location → <b>While Using</b> + <b>Precise</b> ON.
                {geoError ? <div style={{ opacity: 0.75, marginTop: 6 }}>Error: {String(geoError)}</div> : null}
              </div>
            )}

            {/* Notices */}
            {notice && (
              <div style={{ color: "#ffb766", marginTop: 8 }}>
                {notice}
              </div>
            )}
          </div>

          {/* Centered big round button */}
          <div style={{ display: "grid", placeItems: "center", padding: 20 }}>
            <CircleButton
              label={mainLabel}
              disabled={loadingEntry}
              busy={busy}
              onClick={onPressCircle}
              danger={!!openEntry}
            />
          </div>

          {/* Status line */}
          {loadingEntry ? (
            <p>Checking your clock status…</p>
          ) : openEntry ? (
            <p style={{ marginTop: 0 }}>
              <strong>Clocked in</strong> since{" "}
              {formatHHmm(openEntry.clockInAt?.toDate ? openEntry.clockInAt.toDate() : new Date(openEntry.clockInAt))}
            </p>
          ) : (
            <p style={{ marginTop: 0, opacity: 0.9 }}>You are not clocked in.</p>
          )}
        </div>
      </div>
    </>
  );
}
