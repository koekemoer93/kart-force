// src/utils/nativeGeo.js
// Unified location helper: prefers Capacitor native when available, otherwise
// uses a Safari-friendly web strategy with a short refining watch to improve accuracy.
// Honors your existing BYPASS + MOCK env/localStorage flags to keep behavior consistent.

import { Capacitor } from '@capacitor/core';
let Geolocation;
try { Geolocation = require('@capacitor/geolocation').Geolocation; } catch {}

// ---- Mock / bypass (match your geo.js behavior) ----
const BYPASS = String(process.env.REACT_APP_BYPASS_GEOFENCE || '').toLowerCase() === 'true';

function parsePair(s) {
  if (!s) return null;
  const parts = String(s).split(',').map((x) => parseFloat(String(x).trim()));
  if (parts.length !== 2 || parts.some((n) => Number.isNaN(n))) return null;
  return { latitude: parts[0], longitude: parts[1] };
}
const ENV_MOCK = parsePair(process.env.REACT_APP_MOCK_GEO);
const LS_MOCK = (() => {
  try { return parsePair(localStorage.getItem('mockGeo')); } catch { return null; }
})();

function normalize(p) {
  const c = p?.coords || p;
  const lat = c?.latitude;
  const lng = c?.longitude ?? c?.lng;
  const accuracy = c?.accuracy ?? 0;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  return {
    coords: { latitude: lat, longitude: lng, accuracy },
    timestamp: Date.now()
  };
}

const isNative = () => {
  try { return Capacitor?.isNativePlatform?.() === true; } catch { return false; }
};

/** Returns mock/bypass coords if configured, else null */
function getMockOrBypass() {
  if (BYPASS) return { coords: ENV_MOCK || LS_MOCK || { latitude: 0, longitude: 0, accuracy: 0 }, bypass: true };
  if (ENV_MOCK || LS_MOCK) return { coords: ENV_MOCK || LS_MOCK, mock: true };
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Single-shot position (native if available, else web). Honors BYPASS/MOCK. */
export async function getCurrentPosition(options = {}) {
  const special = getMockOrBypass();
  if (special) {
    const n = normalize(special);
    if (n) return n;
  }

  if (isNative() && Geolocation) {
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 10000,
      ...options,
    });
    return normalize(pos);
  }

  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Geolocation unsupported'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(normalize(p)),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000, ...options }
    );
  });
}

/**
 * Refines accuracy on the web by watching briefly (default 8s).
 * On native (Capacitor), a single getCurrentPosition is already good.
 * Honors BYPASS/MOCK.
 */
export async function getImprovedPosition({ windowMs = 8000 } = {}) {
  const special = getMockOrBypass();
  if (special) {
    const n = normalize(special);
    if (n) return n;
  }

  if (isNative() && Geolocation) {
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 20000 });
    return normalize(pos);
  }
  if (!('geolocation' in navigator)) throw new Error('Geolocation unsupported');

  let best = null;
  const start = Date.now();

  await new Promise((resolve, reject) => {
    const wid = navigator.geolocation.watchPosition(
      (p) => {
        const n = normalize(p);
        if (!n) return;
        // keep the best (lowest accuracy)
        if (!best || (n.coords.accuracy ?? 99999) < (best.coords.accuracy ?? 99999)) {
          best = n;
        }
        // stop early if already precise
        if ((n.coords.accuracy ?? 99999) <= 30) {
          navigator.geolocation.clearWatch(wid);
          resolve();
        } else if (Date.now() - start >= windowMs) {
          navigator.geolocation.clearWatch(wid);
          resolve();
        }
      },
      (err) => {
        try { navigator.geolocation.clearWatch(wid); } catch {}
        if (!best) reject(err);
        else resolve();
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
  });

  if (!best) best = await getCurrentPosition({ enableHighAccuracy: true, timeout: 20000 });
  return best;
}

/** watchPosition wrapper for both native and web. Returns a stop() function. Honors BYPASS/MOCK by emitting once. */
export function watchPosition(success, error, options = {}) {
  const special = getMockOrBypass();
  if (special) {
    const n = normalize(special);
    if (n) setTimeout(() => success?.(n), 0);
    return () => {};
  }

  if (isNative() && Geolocation) {
    const id = Geolocation.watchPosition(
      { enableHighAccuracy: true, ...options },
      (pos, err) => {
        if (err) return error?.(err);
        if (pos) success?.(normalize(pos));
      }
    );
    return () => Geolocation.clearWatch({ id });
  }

  if (!('geolocation' in navigator)) return () => {};
  const id = navigator.geolocation.watchPosition(
    (p) => success?.(normalize(p)),
    (err) => error?.(err),
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0, ...options }
  );
  return () => navigator.geolocation.clearWatch(id);
}
