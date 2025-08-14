// src/pages/Clock.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import TopNav from "../components/TopNav";
import { useAuth } from "../AuthContext";
import { useGeofence } from "../hooks/useGeofence";
import { clockIn, clockOut } from "../services/timeEntries";
import { db } from "../firebase";
import { collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";

const HOLD_MS = 3000;            
const CLOCK_RADIUS_MIN = 300;    

function formatHHmm(date) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    const h = String(date.getHours()).padStart(2, "0");
    const m = String(date.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  }
}

/** Mobile-safe Hold Button */
function HoldButton({
  labelIdle,
  labelHolding = "Keep holding…",
  labelDone = "Confirmed",
  onConfirm,
  disabled = false,
  danger = false,
}) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const startTsRef = useRef(0);
  const rafRef = useRef(null);

  const stop = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setHolding(false);
    setProgress(0);
    startTsRef.current = 0;
    window.removeEventListener("pointerup", onPointerUpCancel, true);
    window.removeEventListener("pointercancel", onPointerUpCancel, true);
    window.removeEventListener("pointerleave", onPointerUpCancel, true);
  };

  const tick = () => {
    const now = performance.now();
    const elapsed = now - startTsRef.current;
    const p = Math.max(0, Math.min(1, elapsed / HOLD_MS));
    setProgress(p);
    if (p >= 1) {
      stop();
      setProgress(1);
      onConfirm?.();
      setTimeout(() => setProgress(0), 400);
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  };

  const onPointerDown = (e) => {
    if (disabled || holding) return;
    if (e.isPrimary === false) return;
    e.preventDefault(); // Prevent ghost clicks on mobile
    setHolding(true);
    setProgress(0);
    startTsRef.current = performance.now();
    window.addEventListener("pointerup", onPointerUpCancel, true);
    window.addEventListener("pointercancel", onPointerUpCancel, true);
    window.addEventListener("pointerleave", onPointerUpCancel, true);
    rafRef.current = requestAnimationFrame(tick);
  };

  const onPointerUpCancel = () => {
    if (progress < 1) stop();
  };

  useEffect(() => () => stop(), []);

  return (
    <div style={{ width: "100%", maxWidth: 420, margin: "0 auto" }}>
      <button
        onPointerDown={onPointerDown}
        onContextMenu={(e) => e.preventDefault()}
        disabled={disabled}
        className="button-primary"
        style={{
          width: "100%",
          borderRadius: 18,
          padding: "22px 20px",
          fontSize: 22,
          fontWeight: 800,
          letterSpacing: 0.3,
          background: danger ? "linear-gradient(180deg,#ff6b6b,#c74b4b)" : undefined,
          border: danger ? "1px solid rgba(255,255,255,0.15)" : undefined,
          cursor: disabled ? "not-allowed" : "pointer",
          position: "relative",
          overflow: "hidden",
          touchAction: "none",              
          WebkitUserSelect: "none",
          userSelect: "none",
          WebkitTapHighlightColor: "transparent",
        }}
        aria-label={labelIdle}
      >
        <span style={{ position: "relative", zIndex: 2 }}>
          {holding ? labelHolding : progress >= 1 ? labelDone : labelIdle}
        </span>
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background: danger
              ? "rgba(255,255,255,0.15)"
              : "linear-gradient(180deg, rgba(36,255,152,0.18), rgba(36,255,152,0.10))",
            transform: `scaleX(${progress})`,
            transformOrigin: "left center",
            transition: holding ? "transform 30ms linear" : "transform 180ms ease",
            pointerEvents: "none",
          }}
        />
      </button>
      <div className="small muted" style={{ textAlign: "center", marginTop: 6 }}>
        Press & hold for 3 seconds
      </div>
    </div>
  );
}

export default function Clock() {
  const { user, userData } = useAuth();
  const uid = user?.uid;
  const assignedTrack = userData?.assignedTrack ?? null;
  const isClockedInFlag = !!userData?.isClockedIn;

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

  const { coords, isInsideFence, permissionState, error: geoError, track } =
    useGeofence(assignedTrack);

  const hasLiveCoords = !!(coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng));
  const permissionOk = bypassActive || permissionState === "granted" || hasLiveCoords;

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

  const inside300m =
    approxDistance == null ? false : approxDistance <= CLOCK_RADIUS_MIN;
  const withinAllowedZone = bypassActive ? true : inside300m;

  const [openEntry, setOpenEntry] = useState(null);
  const [loadingEntry, setLoadingEntry] = useState(true);
  const [busy, setBusy] = useState(false);

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
    return () => {
      cancelled = true;
    };
  }, [uid, isClockedInFlag]);

  const currentTrackName = track?.displayName || assignedTrack || "No track";
  const clockedInAtText = useMemo(() => {
    if (!openEntry?.clockInAt) return "";
    const started = openEntry.clockInAt?.toDate
      ? openEntry.clockInAt.toDate()
      : new Date(openEntry.clockInAt);
    return formatHHmm(started);
  }, [openEntry]);

  const onConfirmClock = async () => {
    if (!uid) return;
    if (!assignedTrack) {
      alert("You do not have an assigned track. Ask an admin to assign you before clocking.");
      return;
    }
    if (!withinAllowedZone) {
      alert(
        `You must be within ${CLOCK_RADIUS_MIN}m of ${currentTrackName} to clock ${
          openEntry ? "out" : "in"
        }.`
      );
      return;
    }
    if (!permissionOk) {
      alert("Location permission is required to clock in/out.");
      return;
    }

    try {
      setBusy(true);
      if (openEntry) {
        await clockOut({ uid });
      } else {
        await clockIn({ uid, trackId: assignedTrack });
      }
    } catch (e) {
      alert(e?.message || "Clock action failed.");
    } finally {
      setBusy(false);
      try {
        const qOpen = query(
          collection(db, "timeEntries"),
          where("uid", "==", uid),
          where("clockOutAt", "==", null),
          orderBy("clockInAt", "desc"),
          limit(1)
        );
        const snap = await getDocs(qOpen);
        setOpenEntry(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() });
      } catch {}
    }
  };

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

          <div className="glass-card" style={{ padding: 16, marginBottom: 16, background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              Clock in only at your assigned track and avoid unnecessary clock in/out — payroll is calculated from your clocked-in hours.
            </div>
            <div className="small" style={{ opacity: 0.9 }}>
              Press & hold for 3 seconds. You must be within <strong>{CLOCK_RADIUS_MIN}m</strong> of <strong>{currentTrackName}</strong>.
            </div>

            {approxDistance !== null && (
              <div style={{ opacity: 0.8, marginTop: 6 }}>
                Approx. distance to track: {approxDistance} m
              </div>
            )}

            {!permissionOk && (
              <div style={{ color: "#ff7070", marginTop: 8 }}>
                Location permission is required. Enable location access for your browser and reload.
                {geoError ? (
                  <div style={{ opacity: 0.75, marginTop: 6 }}>Error: {geoError}</div>
                ) : null}
              </div>
            )}

            {bypassActive && (
              <div style={{ color: "#ffb766", marginTop: 8 }}>
                Dev bypass is ON — geofence and permission checks are ignored on this page.
              </div>
            )}
          </div>

          {loadingEntry ? (
            <p>Checking your clock status…</p>
          ) : openEntry ? (
            <p style={{ marginTop: 0 }}>
              <strong>Clocked in</strong> at {clockedInAtText}
            </p>
          ) : (
            <p style={{ marginTop: 0, opacity: 0.9 }}>You are not clocked in.</p>
          )}

          <div style={{ marginTop: 14 }}>
            {openEntry ? (
              <HoldButton
                labelIdle={`Clocked in at ${clockedInAtText} — Hold to Clock Out`}
                labelHolding="Hold to clock out…"
                labelDone="Clocked out"
                onConfirm={onConfirmClock}
                disabled={busy || !permissionOk || !withinAllowedZone}
                danger
              />
            ) : (
              <HoldButton
                labelIdle="Clock In"
                labelHolding="Hold to clock in…"
                labelDone="Clocked in"
                onConfirm={onConfirmClock}
                disabled={busy || !permissionOk || !withinAllowedZone}
              />
            )}

            {!withinAllowedZone && (
              <div className="small" style={{ color: "#ff9f5a", textAlign: "center", marginTop: 8 }}>
                You are outside the {CLOCK_RADIUS_MIN}m zone.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
