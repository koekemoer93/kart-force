import React, { useEffect, useMemo, useRef, useState } from "react";
import TopNav from "../components/TopNav";
import { useAuth } from "../AuthContext";
import { clockIn, clockOut } from "../services/timeEntries";
import { db } from "../firebase";
import { collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";

const HOLD_MS = 3000; // press & hold duration

function formatHHmm(date) {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
  } catch {
    const h = String(date.getHours()).padStart(2, "0");
    const m = String(date.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  }
}

/** Mobile-safe Hold Button (3s press) */
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
    e.preventDefault(); // avoid ghost clicks on mobile
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
          borderRadius: 999,
          padding: "22px 20px",
          fontSize: 22,
          fontWeight: 800,
          letterSpacing: 0.3,
          background: danger ? "linear-gradient(180deg,#ff6b6b,#c74b4b)" : undefined,
          border: "1px solid rgba(255,255,255,0.15)",
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

  const [openEntry, setOpenEntry] = useState(null);
  const [loadingEntry, setLoadingEntry] = useState(true);
  const [busy, setBusy] = useState(false);

  // Load existing open time entry (if clocked in)
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
      // Refresh status
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

  const title = loadingEntry ? "Clock" : openEntry ? "Clock Out" : "Clock In";

  return (
    <>
      <TopNav />
      <div className="main-wrapper" style={{ display: "flex", justifyContent: "center", padding: 16 }}>
        <div className="glass-card" style={{ maxWidth: 560, width: "100%", padding: 18 }}>
          <h2 style={{ marginTop: 0 }}>{title}</h2>

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
              Location check happens at <b>Login</b>. To clock {openEntry ? "out" : "in"}, press and hold the button below for 3 seconds.
            </div>
            <div className="small" style={{ opacity: 0.9 }}>
              Assigned track: <strong>{assignedTrack || "None"}</strong>
            </div>
          </div>

          {loadingEntry ? (
            <p>Checking your clock status…</p>
          ) : openEntry ? (
            <p style={{ marginTop: 0 }}>
              <strong>Clocked in</strong> since {clockedInAtText}
            </p>
          ) : (
            <p style={{ marginTop: 0, opacity: 0.9 }}>You are not clocked in.</p>
          )}

          <div style={{ marginTop: 14 }}>
            {openEntry ? (
              <HoldButton
                labelIdle={`Clocked in since ${clockedInAtText} — Hold to Clock Out`}
                labelHolding="Hold to clock out…"
                labelDone="Clocked out"
                onConfirm={onConfirmClock}
                disabled={busy}
                danger
              />
            ) : (
              <HoldButton
                labelIdle="Clock In"
                labelHolding="Hold to clock in…"
                labelDone="Clocked in"
                onConfirm={onConfirmClock}
                disabled={busy}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
