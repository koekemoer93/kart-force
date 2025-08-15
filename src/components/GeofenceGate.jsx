import React from 'react';
import { useAuth } from '../AuthContext';
import { useGeofence } from '../hooks/useGeofence';

export default function GeofenceGate({ children }) {
  const { userData } = useAuth();
  const assignedTrack = userData?.assignedTrack ?? null;

  const { coords, accuracy, isInsideFence, permissionState, error, track, requestPosition } =
    useGeofence(assignedTrack);

  if (!assignedTrack) return children;
  if (isInsideFence) return children;

  return (
    <div className="panel" style={{ margin: 16, padding: 16 }}>
      <h2 style={{ marginBottom: 8 }}>Enable Location to Continue</h2>
      <p style={{ opacity: 0.85, marginBottom: 12 }}>
        We need your location to confirm you’re at <b>{track?.displayName || assignedTrack}</b>.
      </p>

      <button
        onClick={() => requestPosition()}
        className="btn"
        style={{ padding: '12px 16px', borderRadius: 12, width: '100%', marginBottom: 12 }}
      >
        Enable Location
      </button>

      {coords && (
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
          GPS accuracy: <b>{accuracy ? Math.round(accuracy) : '—'} m</b>
        </div>
      )}

      {permissionState === 'granted' && !isInsideFence && (
        <div style={{ marginTop: 10, fontSize: 13 }}>
          You appear outside the geofence. Move closer to the track center or try again to refine accuracy.
        </div>
      )}
      {error && (
        <div style={{ marginTop: 10, color: '#f66', fontSize: 13 }}>
          {String(error.message || error)}
        </div>
      )}

      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 12, lineHeight: 1.4 }}>
        iPhone: Settings → Privacy & Security → Location Services → Safari Websites / (or your Home Screen app) → While Using + Precise ON.
      </div>
    </div>
  );
}
