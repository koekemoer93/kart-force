// src/hooks/useGeofence.js
import { useEffect, useMemo, useState } from 'react';
import TRACKS from '../constants/tracks';
import { isWithinRadiusMeters } from '../utils/geo';

const DEFAULT_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 10_000,
  timeout: 20_000,
};

export function useGeofence(assignedTrackId) {
  const [coords, setCoords] = useState(null);
  const [error, setError] = useState('');
  const [permissionState, setPermissionState] = useState('prompt'); // 'granted' | 'denied' | 'prompt'
  const track = assignedTrackId ? TRACKS[assignedTrackId] : null;

  // Check permissions where supported
  useEffect(() => {
    let cancelled = false;
    if (navigator.permissions?.query) {
      navigator.permissions.query({ name: 'geolocation' }).then((status) => {
        if (!cancelled) setPermissionState(status.state);
        status.onchange = () => !cancelled && setPermissionState(status.state);
      }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setError('Geolocation is not supported by this browser.');
      return;
    }
    let watchId;
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setError('');
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        setError(err.message || 'Location error.');
      },
      DEFAULT_OPTIONS
    );
    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  const isInsideFence = useMemo(() => {
    if (!track || !coords) return false;
    return isWithinRadiusMeters(
      coords.lat,
      coords.lng,
      track.lat,
      track.lng,
      track.radiusMeters
    );
  }, [coords, track]);

  return {
    coords,
    error,
    permissionState,
    track,
    isInsideFence,
  };
}
