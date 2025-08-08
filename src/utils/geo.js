// src/utils/geo.js
// src/utils/geo.js

/**
 * Returns a Promise<{ coords: { latitude, longitude } }>
 * Priority:
 * 1) REACT_APP_BYPASS_GEOFENCE -> if true, fake coords (or null, up to caller)
 * 2) REACT_APP_MOCK_GEO="lat,lng"
 * 3) localStorage.mockGeo = "lat,lng"
 * 4) navigator.geolocation.getCurrentPosition
 */
export function getPosition(options = {}) {
  const bypass = String(process.env.REACT_APP_BYPASS_GEOFENCE || '').toLowerCase() === 'true';
  const parsePair = (s) => {
    if (!s) return null;
    const parts = String(s).split(',').map((x) => parseFloat(x.trim()));
    if (parts.length !== 2 || parts.some((n) => Number.isNaN(n))) return null;
    return { latitude: parts[0], longitude: parts[1] };
  };

  const envMock = parsePair(process.env.REACT_APP_MOCK_GEO);
  const lsMock = parsePair(typeof localStorage !== 'undefined' ? localStorage.getItem('mockGeo') : null);

  // If you want bypass to also fake a position, we’ll prefer a mock if present; else (0,0).
  if (bypass) {
    const mock = envMock || lsMock || { latitude: 0, longitude: 0 };
    return Promise.resolve({ coords: mock, bypass: true });
  }

  if (envMock || lsMock) {
    return Promise.resolve({ coords: envMock || lsMock, mock: true });
  }

  // Fall back to real browser geolocation
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0, ...options }
    );
  });
}

export function haversineDistanceMeters({ lat1, lng1, lat2, lng2 }) {
  const R = 6371000; // meters
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // meters
}

export function isWithinRadiusMeters(userLat, userLng, centerLat, centerLng, radiusMeters) {
  const d = haversineDistanceMeters({
    lat1: userLat,
    lng1: userLng,
    lat2: centerLat,
    lng2: centerLng,
  });
  return d <= radiusMeters;
}
