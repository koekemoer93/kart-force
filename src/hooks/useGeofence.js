// src/hooks/useGeofence.js
import { useEffect, useMemo, useRef, useState } from "react";
import { db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import TRACKS from "../constants/tracks";

function haversine(a, b) {
  if (!a || !b) return Infinity;
  const toRad = (x) => (x * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const c = s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2;
  return 2 * R * Math.asin(Math.sqrt(c));
}

const num = (v) => (typeof v === "string" ? parseFloat(v) : v);
function normalizeCoords(raw) {
  if (!raw) return { lat: undefined, lng: undefined, radiusMeters: undefined };
  const lat = num(raw.latitude ?? raw.lat ?? raw.trackLat);
  const lng = num(raw.longitude ?? raw.lng ?? raw.lon ?? raw.trackLng);
  let radiusMeters = num(raw.radiusMeters ?? raw.radius ?? raw.geoRadius);
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) radiusMeters = 300;
  return { lat, lng, radiusMeters };
}

async function getTrackMeta(trackId) {
  // Firestore
  try {
    if (trackId) {
      const snap = await getDoc(doc(db, "tracks", trackId));
      if (snap.exists()) {
        const data = snap.data() || {};
        const meta = normalizeCoords(data);
        if (Number.isFinite(meta.lat) && Number.isFinite(meta.lng)) return meta;
      }
    }
  } catch {}
  // Fallback constant
  if (trackId && TRACKS?.[trackId]) {
    const meta = normalizeCoords(TRACKS[trackId]);
    if (Number.isFinite(meta.lat) && Number.isFinite(meta.lng)) return meta;
  }
  return { lat: undefined, lng: undefined, radiusMeters: 300 };
}

function getSimFromEnvOrUrl() {
  const params = new URLSearchParams(window.location.search);
  const slat = params.get("simLat") ?? localStorage.getItem("GF_SIM_LAT") ?? process.env.REACT_APP_SIM_LAT;
  const slng = params.get("simLng") ?? localStorage.getItem("GF_SIM_LNG") ?? process.env.REACT_APP_SIM_LNG;
  const lat = slat != null ? parseFloat(slat) : undefined;
  const lng = slng != null ? parseFloat(slng) : undefined;
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return null;
}

/**
 * useGeofence({ trackId, radiusMeters?, enable?, highAccuracy? })
 */
export function useGeofence(opts = {}) {
  const { trackId, radiusMeters: radiusOverride, enable = true, highAccuracy = true } = opts;
  const [target, setTarget] = useState({ lat: undefined, lng: undefined, radiusMeters: 300 });
  const [position, setPosition] = useState(null);
  const [permission, setPermission] = useState("prompt");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const watchIdRef = useRef(null);

  // expose tiny dev helpers
  useEffect(() => {
    window.__KF_SET_SIM__ = (lat, lng) => {
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        localStorage.setItem("GF_SIM_LAT", String(lat));
        localStorage.setItem("GF_SIM_LNG", String(lng));
        setPosition({ lat, lng, raw: { simulated: true } });
      }
    };
    window.__KF_CLEAR_SIM__ = () => {
      localStorage.removeItem("GF_SIM_LAT");
      localStorage.removeItem("GF_SIM_LNG");
    };
  }, []);

  // load target
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const meta = await getTrackMeta(trackId);
      if (cancelled) return;
      const radiusMeters = Number.isFinite(radiusOverride) ? radiusOverride : meta.radiusMeters || 300;
      setTarget({ lat: meta.lat, lng: meta.lng, radiusMeters });
    })();
    return () => { cancelled = true; };
  }, [trackId, radiusOverride]);

  // permission (best effort)
  useEffect(() => {
    let cancelled = false;
    const permAPI = navigator.permissions?.query;
    if (permAPI) {
      navigator.permissions.query({ name: "geolocation" }).then(
        (res) => {
          if (!cancelled) {
            setPermission(res.state || "unknown");
            res.onchange = () => setPermission(res.state || "unknown");
          }
        },
        () => { if (!cancelled) setPermission("unknown"); }
      );
    } else {
      setPermission("unknown");
    }
    return () => { cancelled = true; };
  }, []);

  // watch GPS unless simulated
  useEffect(() => {
    if (!enable) { setLoading(false); return; }
    const sim = getSimFromEnvOrUrl();
    if (sim) {
      setPosition({ ...sim, raw: { simulated: true } });
      setLoading(false);
      return; // skip real GPS when simulating
    }

    setLoading(true);
    setError("");
    if (!("geolocation" in navigator)) {
      setError("Geolocation API not available");
      setLoading(false);
      return;
    }
    const opts = { enableHighAccuracy: !!highAccuracy, timeout: 15000, maximumAge: 5000 };
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords || {};
        setPosition({ lat: latitude, lng: longitude, raw: pos });
        setLoading(false);
      },
      (err) => {
        setError(err?.message || "Unable to get position");
        setLoading(false);
      },
      opts
    );
    return () => {
      if (watchIdRef.current !== null) {
        try { navigator.geolocation.clearWatch(watchIdRef.current); } catch {}
      }
    };
  }, [enable, highAccuracy]);

  const distance = useMemo(() => {
    if (!position || !Number.isFinite(target.lat) || !Number.isFinite(target.lng)) return Infinity;
    if (Math.abs(target.lat) > 90 || Math.abs(target.lng) > 180) return Infinity;
    return Math.round(haversine(position, target));
  }, [position, target]);

  const inside = useMemo(() => {
    if (!Number.isFinite(distance)) return false;
    return distance <= (target.radiusMeters || 300);
  }, [distance, target]);

  function retry() {
    setLoading(true);
    setError("");
    const sim = getSimFromEnvOrUrl();
    if (sim) {
      setPosition({ ...sim, raw: { simulated: true } });
      setLoading(false);
      return;
    }
    if (navigator.geolocation?.getCurrentPosition) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords || {};
          setPosition({ lat: latitude, lng: longitude, raw: pos });
          setLoading(false);
        },
        (err) => {
          setError(err?.message || "Unable to get position");
          setLoading(false);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    }
  }

  return { inside, distance, target, position, permission, error, loading, retry };
}
