// src/components/GeofenceGate.jsx
// ⬇️ Paste this entire file

import React, { useEffect, useMemo } from 'react';

// ✅ Keep your existing import path for the hook:
import { useGeofence } from '../hooks/useGeofence'; // <-- change the path if your hook lives elsewhere

// (Optional) If you use auth/track context here, keep your existing imports:
// import { useAuth } from '../AuthContext';
// import TRACKS from '../constants/tracks';

/**
 * GeofenceGate
 * Wraps protected worker areas. Only shows children when inside the geofence,
 * OR when dev-bypass is active (local testing).
 *
 * Props:
 *  - children: ReactNode
 *  - ...anything else your current component already accepts (unchanged)
 */
export default function GeofenceGate(props) {
  // 🔒----- BYPASS SAFETY GUARD ---------------------------------------------
  // Off in production by default. You can enable it on staging/preview by setting:
  // REACT_APP_ALLOW_BYPASS=true (in your hosting env), otherwise only dev builds can bypass.
  const allowBypass =
    process.env.NODE_ENV !== 'production' ||
    String(process.env.REACT_APP_ALLOW_BYPASS).toLowerCase() === 'true';

  // Read the flag from localStorage (only in browser)
  const bypassRequested = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('bypassFence') === 'true';
  }, []);

  const bypassActive = allowBypass && bypassRequested;

  // 🧭----- USE THE GEOFENCE HOOK *UNCONDITIONALLY* -------------------------
  // ❗ IMPORTANT: Put your ORIGINAL useGeofence(...) arguments between the parentheses below.
  // Example from your old code (DO NOT use this exact example unless it matches your project):
  // const { insideFence, distance, loading, error } = useGeofence({ userLat, userLng, trackLat, trackLng, radiusMeters: 300 });
  //
  // 👉 Do this: Copy everything inside your old useGeofence( ... ) call and
  // paste it between these parentheses ↓↓↓ so the call is UNCONDITIONAL.
  const { insideFence, distance, loading, error } = useGeofence(
    /* PASTE YOUR ORIGINAL useGeofence(...) ARGUMENTS HERE */
  );
  // ------------------------------------------------------------------------

  // 👀 Keyboard helper for devs: Shift + G toggles the bypass on/off (dev/staging only)
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

  // ✅ Allowed if inside the fence OR dev bypass is active
  const permitted = bypassActive || insideFence;

  // 🧩 Loading state (skip if bypass is active)
  if (loading && !bypassActive) {
    return (
      <div className="glass-card" style={{ margin: 16, padding: 16, textAlign: 'center' }}>
        <p>Checking your location…</p>
      </div>
    );
  }

  // 🚧 Error state (skip if bypass is active)
  if (error && !bypassActive) {
    return (
      <div className="glass-card" style={{ margin: 16, padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Location error</h3>
        <p style={{ opacity: 0.9 }}>{String(error)}</p>
        <p style={{ opacity: 0.8, fontSize: 12 }}>
          Tip: Enable location permissions and ensure GPS is on.
        </p>
      </div>
    );
  }

  // ❌ Not permitted (outside fence and no bypass)
  if (!permitted) {
    return (
      <div className="glass-card" style={{ margin: 16, padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Not at the track</h3>
        <p>You must be inside the geofence to access this page.</p>
        {typeof distance === 'number' && (
          <p style={{ opacity: 0.85, fontSize: 14 }}>Distance from gate: ~{Math.round(distance)} m</p>
        )}
      </div>
    );
  }

  // ✅ Permitted: Render children + small orange dev banner if bypass enabled
  return (
    <>
      {bypassActive && (
        <div className="bypass-banner" role="status" aria-live="polite">
          Geofence bypass enabled (dev mode)
        </div>
      )}
      {props.children}
    </>
  );
}
