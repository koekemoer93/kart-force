// src/pages/Clock.js
// ⬇️ Paste this entire file

import React, { useEffect, useMemo, useState } from 'react';
import TopNav from '../components/TopNav';
import { useAuth } from '../AuthContext';
import { useGeofence } from '../hooks/useGeofence';
import TRACKS from '../constants/tracks';
import { clockIn, clockOut } from '../services/timeEntries';
import { db } from '../firebase';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs
} from 'firebase/firestore';

function formatHHmm(date) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
}

export default function Clock() {
  const { user, userData } = useAuth();
  const uid = user?.uid;
  const assignedTrack = userData?.assignedTrack ?? null;
  const isClockedInFlag = !!userData?.isClockedIn;

  // --- DEV BYPASS SETUP ----------------------------------------------------
  // Allow bypass in dev OR if you explicitly allow it via env on staging:
  // REACT_APP_ALLOW_BYPASS=true
  const allowBypass =
    process.env.NODE_ENV !== 'production' ||
    String(process.env.REACT_APP_ALLOW_BYPASS).toLowerCase() === 'true';

  const bypassActive =
    allowBypass &&
    typeof window !== 'undefined' &&
    window.localStorage.getItem('bypassFence') === 'true';

  // Optional: Shift+G toggles the bypass quickly in dev/staging
  useEffect(() => {
    if (!allowBypass) return;
    const onKey = (e) => {
      if (e.shiftKey && (e.key === 'g' || e.key === 'G')) {
        const next = window.localStorage.getItem('bypassFence') === 'true' ? 'false' : 'true';
        window.localStorage.setItem('bypassFence', next);
        window.location.reload();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [allowBypass]);
  // ------------------------------------------------------------------------

  // Geofence (call UNCONDITIONALLY to keep hook order correct)
  const { coords, isInsideFence, permissionState, error: geoError, track } =
    useGeofence(assignedTrack);

  // When bypass is active, we "treat" the user as inside the fence.
  const insideFenceOrBypass = bypassActive ? true : isInsideFence;

  // Open entry (if any)
  const [openEntry, setOpenEntry] = useState(null); // { id, clockInAt: Timestamp, ... }
  const [loadingEntry, setLoadingEntry] = useState(true);
  const [busy, setBusy] = useState(false);

  // Load the latest open time entry for the user
  useEffect(() => {
    let cancelled = false;
    async function loadOpen() {
      if (!uid) return;
      setLoadingEntry(true);
      const qOpen = query(
        collection(db, 'timeEntries'),
        where('uid', '==', uid),                 // ✅ your code uses `uid` field
        where('clockOutAt', '==', null),
        orderBy('clockInAt', 'desc'),
        limit(1)
      );
      const snap = await getDocs(qOpen);
      if (cancelled) return;
      setOpenEntry(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() });
      setLoadingEntry(false);
    }
    loadOpen();
    return () => { cancelled = true; };
  }, [uid, isClockedInFlag]);

  const currentTrackName = useMemo(() => {
    if (!assignedTrack) return 'No track';
    return TRACKS[assignedTrack]?.displayName || assignedTrack;
  }, [assignedTrack]);

  async function handleClock() {
    if (!uid) return;
    if (!assignedTrack) {
      alert('You do not have an assigned track. Ask an admin to assign you before clocking.');
      return;
    }

    // Geofence enforcement — allow bypass to skip this guard
    if (!insideFenceOrBypass) {
      alert(`You must be at ${currentTrackName} to clock in/out.`);
      return;
    }

    try {
      setBusy(true);
      if (openEntry) {
        await clockOut({ uid });
      } else {
        // Pass assigned track as before
        await clockIn({ uid, trackId: assignedTrack });
      }
    } catch (e) {
      alert(e?.message || 'Clock action failed.');
    } finally {
      setBusy(false);
      // Refresh open entry status
      try {
        const qOpen = query(
          collection(db, 'timeEntries'),
          where('uid', '==', uid),
          where('clockOutAt', '==', null),
          orderBy('clockInAt', 'desc'),
          limit(1)
        );
        const snap = await getDocs(qOpen);
        setOpenEntry(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() });
      } catch {}
    }
  }

  // Format "Clocked in at 08:16"
  const clockedInAtText = useMemo(() => {
    if (!openEntry?.clockInAt) return '';
    const started = openEntry.clockInAt?.toDate ? openEntry.clockInAt.toDate() : new Date(openEntry.clockInAt);
    return formatHHmm(started);
  }, [openEntry]);

  // Distance helper (nice UX)
  const distanceInfo = (() => {
    if (!coords || !track) return null;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(track.lat - coords.lat);
    const dLng = toRad(track.lng - coords.lng);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(coords.lat)) * Math.cos(toRad(track.lat)) * Math.sin(dLng / 2) ** 2;
    const d = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(d);
  })();

  return (
    <>
      <TopNav role="worker" />

      {/* Small orange dev banner when bypass is active */}
      {bypassActive && (
        <div className="bypass-banner" role="status" aria-live="polite">
          Geofence bypass enabled (dev mode)
        </div>
      )}

      <div className="main-wrapper" style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
        <div className="glass-card" style={{ maxWidth: 560, width: '100%' }}>
          <h2 style={{ marginTop: 0 }}>Clock</h2>

          {/* Info container */}
          <div
            className="glass-card"
            style={{
              padding: 16,
              marginBottom: 16,
              background: 'rgba(0,0,0,0.25)',
              border: '1px solid rgba(255,255,255,0.08)'
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              Please clock in once you arrive at work.
            </div>
            <div style={{ opacity: 0.9 }}>
              You need to be inside the <strong>{currentTrackName}</strong> location geofence to
              clock in and out.
            </div>

            {distanceInfo !== null && (
              <div style={{ opacity: 0.8, marginTop: 6 }}>
                Approx. distance to track: {distanceInfo} m
              </div>
            )}

            {/* If bypass is active, soften the permission error and don’t block the button */}
            {permissionState !== 'granted' && !bypassActive && (
              <div style={{ color: '#ff7070', marginTop: 8 }}>
                Location permission is required. Enable location access for your browser and reload.
                {geoError ? <div style={{ opacity: 0.75, marginTop: 6 }}>Error: {geoError}</div> : null}
              </div>
            )}

            {bypassActive && (
              <div style={{ color: '#ffb766', marginTop: 8 }}>
                Dev bypass is ON — geofence and permission checks are ignored on this page.
              </div>
            )}
          </div>

          {/* Status line */}
          {loadingEntry ? (
            <p>Checking your clock status…</p>
          ) : openEntry ? (
            <p style={{ marginTop: 0 }}>
              <strong>Clocked in</strong> at {clockedInAtText}
            </p>
          ) : (
            <p style={{ marginTop: 0, opacity: 0.9 }}>You are not clocked in.</p>
          )}

          {/* Big action button */}
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <button
              className="button-primary"
              onClick={handleClock}
              // If bypass is active, do NOT disable the button due to permissions
              disabled={busy || (!bypassActive && permissionState !== 'granted')}
              style={{
                padding: '14px 32px',
                fontSize: 18,
                borderRadius: 14,
                fontWeight: 700,
                width: '100%',
                maxWidth: 300,
                opacity: busy ? 0.7 : 1,
                cursor: busy ? 'not-allowed' : 'pointer'
              }}
            >
              {openEntry ? 'Clock Out' : 'Clock In'}
            </button>

            {!bypassActive && permissionState !== 'granted' && (
              <div style={{ marginTop: 10, color: '#ff9f5a' }}>
                Enable location to use the clock.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
