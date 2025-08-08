// src/utils/geo.js

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
