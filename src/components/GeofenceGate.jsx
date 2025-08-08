// src/components/GeofenceGate.jsx
import React from 'react';
import { useAuth } from '../AuthContext';
import { useGeofence } from '../hooks/useGeofence';

export default function GeofenceGate({ children }) {
  const { role, userData } = useAuth(); // userData should contain assignedTrack
  const assignedTrack = userData?.assignedTrack ?? null;
  const { isInsideFence, error, permissionState, track } = useGeofence(assignedTrack);

  if (role !== 'worker') {
    // Only workers are restricted by geofence here. Admins can roam.
    return children;
  }

  // if worker has no assigned track yet: allow but show helpful note
  if (!assignedTrack) {
    return (
      <div className="glass-card" style={{ padding: 24 }}>
        <h3>No assigned track.</h3>
        <p>Please ask an admin to assign you to a track before clocking in.</p>
        {children}
      </div>
    );
  }

  if (error && permissionState !== 'granted') {
    return (
      <div className="glass-card" style={{ padding: 24 }}>
        <h3>Location permission needed</h3>
        <p>To clock in, please allow location access in your browser settings and reload.</p>
        <p style={{ opacity: 0.7 }}>Error: {error}</p>
      </div>
    );
  }

  if (!isInsideFence) {
    return (
      <div className="glass-card" style={{ padding: 24 }}>
        <h3>Outside {track?.displayName} geofence</h3>
        <p>You must be physically at the track to clock in.</p>
        <p style={{ opacity: 0.7 }}>If you are at the track, wait a few seconds for GPS to update, or toggle location services.</p>
      </div>
    );
  }

  // Inside fence -> allow
  return children;
}
