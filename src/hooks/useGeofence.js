import { useEffect, useMemo, useRef, useState } from "react";
import { useTrack } from "./useTrack";
import { getCurrentPosition, getImprovedPosition, watchPosition } from "../utils/nativeGeo";

const DEFAULT_OPTIONS = { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 };
const BYPASS = String(process.env.REACT_APP_BYPASS_GEOFENCE || "").toLowerCase() === "true";

function distanceMeters(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad((b.lat ?? 0) - (a.lat ?? 0));
  const dLng = toRad((b.lng ?? 0) - (a.lng ?? 0));
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const t = s1 * s1 + Math.cos(toRad(a.lat ?? 0)) * Math.cos(toRad(b.lat ?? 0)) * s2 * s2;
  return 2 * R * Math.atan2(Math.sqrt(t), Math.sqrt(1 - t));
}

export function useGeofence(assignedTrackId) {
  const track = useTrack(assignedTrackId);

  const [coords, setCoords] = useState(null);   // {lat, lng}
  const [accuracy, setAccuracy] = useState(null); // meters
  const [permissionState, setPermissionState] = useState("prompt"); // 'granted' | 'denied' | 'prompt' | 'unsupported'
  const [error, setError] = useState(null);
  const stopWatchRef = useRef(null);

  const startWatch = (opts = DEFAULT_OPTIONS) => {
    if (stopWatchRef.current) return;
    stopWatchRef.current = watchPosition(
      (p) => {
        if (!p?.coords) return;
        setCoords({ lat: p.coords.latitude, lng: p.coords.longitude });
        setAccuracy(typeof p.coords.accuracy === 'number' ? p.coords.accuracy : null);
        setPermissionState("granted");
      },
      (err) => setError(err),
      opts
    );
  };

  // Call this from a user click/tap to trigger iOS prompt and refine accuracy.
  const requestPosition = async (opts = DEFAULT_OPTIONS) => {
    setError(null);
    try {
      const one = await getCurrentPosition(opts);
      if (one?.coords) {
        setCoords({ lat: one.coords.latitude, lng: one.coords.longitude });
        setAccuracy(one.coords.accuracy ?? null);
        setPermissionState("granted");
      }
      const best = await getImprovedPosition({ windowMs: 8000 });
      if (best?.coords) {
        setCoords({ lat: best.coords.latitude, lng: best.coords.longitude });
        setAccuracy(best.coords.accuracy ?? null);
      }
      startWatch(opts);
      return true;
    } catch (err) {
      setError(err);
      if (err?.code === 1) setPermissionState("denied");
      return false;
    }
  };

  useEffect(() => {
    return () => {
      if (stopWatchRef.current) {
        try { stopWatchRef.current(); } catch {}
        stopWatchRef.current = null;
      }
    };
  }, []);

  const isInsideFence = useMemo(() => {
    if (BYPASS) return true;
    if (!coords || !track?.lat || !track?.lng) return false;
    const baseRadius = track?.radiusMeters ?? 300;
    const acc = typeof accuracy === 'number' ? Math.min(accuracy, 100) : 0; // soften when GPS is noisy
    const effectiveRadius = baseRadius + acc;
    const d = distanceMeters(coords, { lat: track.lat, lng: track.lng });
    return d <= effectiveRadius;
  }, [coords, track, accuracy]);

  return { coords, accuracy, isInsideFence, permissionState, error, track, requestPosition, startWatch };
}

export default useGeofence;
