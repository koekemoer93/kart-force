// src/hooks/useGeofence.js
import { useEffect, useMemo, useState } from "react";
import { useTrack } from "./useTrack";

const DEFAULT_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 10_000,
  timeout: 20_000,
};

const BYPASS = String(process.env.REACT_APP_BYPASS_GEOFENCE || "").toLowerCase() === "true";

function toCoords(position) {
  try {
    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy || 0,
    };
  } catch {
    return null;
  }
}

function distanceMeters(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const t = s1 * s1 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * s2 * s2;
  return 2 * R * Math.atan2(Math.sqrt(t), Math.sqrt(1 - t));
}

export function useGeofence(assignedTrackId) {
  const [coords, setCoords] = useState(null); // { lat, lng, accuracy }
  const [error, setError] = useState("");
  const [permissionState, setPermissionState] = useState("prompt");

  const track = useTrack(assignedTrackId);

  useEffect(() => {
    let timer;
    let cancelled = false;

    async function tick() {
      try {
        await new Promise((resolve, reject) => {
          if (!navigator.geolocation) return reject(new Error("Geolocation unavailable"));
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve(pos),
            (err) => reject(err),
            DEFAULT_OPTIONS
          );
        }).then((pos) => {
          if (!cancelled) {
            const c = toCoords(pos);
            if (c) setCoords(c);
            setError("");
          }
        });
      } catch (e) {
        if (!cancelled) setError(e.message || "Location unavailable");
      }
    }

    if (navigator?.permissions?.query) {
      navigator.permissions.query({ name: "geolocation" }).then((res) => {
        if (!cancelled) setPermissionState(res.state || "prompt");
        res.onchange = () => !cancelled && setPermissionState(res.state || "prompt");
      }).catch(() => {});
    }

    tick();
    timer = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  const isInsideFence = useMemo(() => {
    if (BYPASS) return true;
    if (!coords || !track?.lat || !track?.lng) return false;
    const radius = track?.radiusMeters || 300;
    return distanceMeters(coords, { lat: track.lat, lng: track.lng }) <= radius;
  }, [coords, track]);

  return { coords, isInsideFence, permissionState, error, track };
}
