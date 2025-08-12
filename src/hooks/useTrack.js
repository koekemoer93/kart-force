// src/hooks/useTrack.js
import { useEffect, useState } from "react";
import { db } from "../firebase";
import { doc, onSnapshot } from "firebase/firestore";
import TRACKS from "../constants/tracks"; // fallback only

/**
 * Returns { id, displayName, lat, lng, radiusMeters } (or null)
 * - Live Firestore doc subscription
 * - Safe fallback to constants if doc missing or errors
 */
export function useTrack(trackId) {
  const [track, setTrack] = useState(null);

  useEffect(() => {
    if (!trackId) { setTrack(null); return; }
    const ref = doc(db, "tracks", String(trackId));
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const d = snap.data() || {};
          setTrack({
            id: trackId,
            displayName: d.displayName || String(trackId),
            lat: typeof d.lat === "number" ? d.lat : undefined,
            lng: typeof d.lng === "number" ? d.lng : undefined,
            radiusMeters: typeof d.radiusMeters === "number" ? d.radiusMeters : 300,
          });
        } else {
          // fallback to constants
          const c = TRACKS?.[trackId];
          setTrack(
            c
              ? {
                  id: trackId,
                  displayName: c.displayName || String(trackId),
                  lat: c.lat,
                  lng: c.lng,
                  radiusMeters: c.radiusMeters || 300,
                }
              : { id: trackId, displayName: String(trackId), radiusMeters: 300 }
          );
        }
      },
      (err) => {
        console.warn("useTrack(): Firestore error, using constants fallback.", err);
        const c = TRACKS?.[trackId];
        setTrack(
          c
            ? {
                id: trackId,
                displayName: c.displayName || String(trackId),
                lat: c.lat,
                lng: c.lng,
                radiusMeters: c.radiusMeters || 300,
              }
            : { id: trackId, displayName: String(trackId), radiusMeters: 300 }
        );
      }
    );
    return () => unsub();
  }, [trackId]);

  return track;
}
