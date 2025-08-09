// src/components/GeofenceGate.jsx
// ⬇️ Paste this entire file

import React, { useEffect, useMemo } from 'react';
import { useAuth } from '../AuthContext';
import { useGeofence } from '../hooks/useGeofence';

export default function GeofenceGate({ children }) {
  const { userData } = useAuth();
  const assignedTrack = userData?.assignedTrack ?? null;

  // Allow bypass in dev; in prod only if REACT_APP_ALLOW_BYPASS=true
  const allowBypass =
    process.env.NODE_ENV !== 'production' ||
    String(process.env.REACT_APP_ALLOW_BYPASS).toLowerCase() === 'true';

  const bypassActive = useMemo(() => {
    if (!allowBypass || typeof window === 'undefined') return false;
    return window.localStorage.getItem('bypassFence') === 'true';
  }, [allowBypass]);

  // Keyboard toggle: Shift+G (dev/staging)
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

  // ✅ Call the hook UNCONDITIONALLY
  const { isInsideFence, loading, error, distance } = useGeofence(assignedTrack);

  const permitted = bypassActive || isInsideFence;

  if (loading && !bypassActive) {
    return (
      <div className="glass-card" style={{ margin: 16, padding: 16, textAlign: 'center' }}>
        Checking your location…
      </div>
    );
  }

  if (error && !bypassActive) {
    return (
      <div className="glass-card" style={{ margin: 16, padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Location error</h3>
        <p style={{ opacity: 0.9 }}>{String(error)}</p>
        <p style={{ opacity: 0.8, fontSize: 12 }}>Enable location and reload.</p>
      </div>
    );
  }

  if (!permitted) {
    return (
      <div className="glass-card" style={{ margin: 16, padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Not at the track</h3>
        <p>You must be inside the geofence to access this page.</p>
        {typeof distance === 'number' && (
          <p style={{ opacity: 0.85, fontSize: 14 }}>Distance: ~{Math.round(distance)} m</p>
        )}
      </div>
    );
  }

  return (
    <>
      {bypassActive && (
        <div className="bypass-banner" role="status" aria-live="polite">
          Geofence bypass enabled (dev mode)
        </div>
      )}
      {children}
    </>
  );
}
