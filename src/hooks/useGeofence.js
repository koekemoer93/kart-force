// src/hooks/useGeofence.js
import { useEffect, useMemo, useState } from 'react';
import TRACKS from '../constants/tracks';
import { isWithinRadiusMeters, getPosition } from '../utils/geo';

const DEFAULT_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 10_000,
  timeout: 20_000,
};

// Read env once (CRA exposes REACT_APP_*)
const BYPASS =
  String(process.env.REACT_APP_BYPASS_GEOFENCE || '').toLowerCase() === 'true';

// Helper: parse "lat,lng" from env or localStorage
function readMockPair() {
  const fromEnv = process.env.REACT_APP_MOCK_GEO;
  const fromLS =
    typeof localStorage !== 'undefined' ? localStorage.getItem('mockGeo') : null;

  const pick = (str) => {
    if (!str) return null;
    const [lat, lng] = String(str)
      .split(',')
      .map((v) => parseFloat(v.trim()));
    if ([lat, lng].some((n) => Number.isNaN(n))) return null;
    return { lat, lng, accuracy: 0 };
  };

  return pick(fromEnv) || pick(fromLS);
}

export function useGeofence(assignedTrackId) {
  const [coords, setCoords] = useState(null); // { lat, lng, accuracy }
  const [error, setError] = useState('');
  const [permissionState, setPermissionState] = useState('prompt'); // 'granted' | 'denied' | 'prompt'
  const track = assignedTrackId ? TRACKS[assignedTrackId] : null;

  // Permissions watcher (no-op in bypass)
  useEffect(() => {
    let cancelled = false;

    if (BYPASS) {
      setPermissionState('granted');
      return;
    }

    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((status) => {
          if (!cancelled) setPermissionState(status.state);
          status.onchange = () => !cancelled && setPermissionState(status.state);
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
    };
  }, []);

  // Position polling (uses our getPosition, which supports mocks & bypass)
  useEffect(() => {
    let cancelled = false;
    let timer = null;

    async function tick() {
      try {
        const pos = await getPosition(DEFAULT_OPTIONS); // resolves mock when configured
        if (cancelled) return;
        setError('');
        const { latitude, longitude, accuracy } = pos.coords;
        setCoords({ lat: latitude, lng: longitude, accuracy: accuracy ?? 0 });
      } catch (err) {
        if (cancelled) return;
        setError(err?.message || 'Location error.');
      }
    }

    // If BYPASS: set a single mock and stop
    if (BYPASS) {
      const mock = readMockPair() || { lat: 0, lng: 0, accuracy: 0 };
      setCoords(mock);
      setError('');
      setPermissionState('granted');
      return () => {};
    }

    // Initial fetch + poll every 5s (instead of watchPosition)
    tick();
    timer = setInterval(tick, 5000);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  const isInsideFence = useMemo(() => {
    // In dev bypass, always allow the page to render
    if (BYPASS) return true;

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
