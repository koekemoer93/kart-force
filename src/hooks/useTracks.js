// src/hooks/useTracks.js
import { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, onSnapshot } from "firebase/firestore";
import TRACKS from "../constants/tracks"; // fallback only (safety net)

/**
 * Always returns an ARRAY of tracks:
 * [{ id, displayName, lat, lng, radiusMeters }]
 * - Live Firestore subscription (no orderBy needed; we sort in JS)
 * - Falls back to constants ONLY if Firestore is empty or errors out.
 */
export function useTracks() {
  const [tracks, setTracks] = useState([]);

  useEffect(() => {
    let unsub = () => {};
    try {
      const ref = collection(db, "tracks");
      unsub = onSnapshot(
        ref,
        (snap) => {
          if (!snap.empty) {
            const arr = snap.docs.map((d) => {
              const x = d.data() || {};
              return {
                id: d.id,
                displayName: x.displayName || d.id,
                lat: typeof x.lat === "number" ? x.lat : undefined,
                lng: typeof x.lng === "number" ? x.lng : undefined,
                radiusMeters: typeof x.radiusMeters === "number" ? x.radiusMeters : 300,
              };
            });
            arr.sort((a, b) => (a.displayName || a.id).localeCompare(b.displayName || b.id));
            setTracks(arr);
          } else {
            // Empty collection → fall back to constants once
            const arr = Object.entries(TRACKS || {}).map(([id, v]) => ({
              id,
              displayName: v.displayName || id,
              lat: v.lat,
              lng: v.lng,
              radiusMeters: v.radiusMeters || 300,
            }));
            setTracks(arr);
            if (!arr.length) {
              console.warn("useTracks(): Firestore 'tracks' is empty and constants are empty.");
            }
          }
        },
        (err) => {
          console.warn("useTracks(): Firestore subscription error, using constants fallback.", err);
          const arr = Object.entries(TRACKS || {}).map(([id, v]) => ({
            id,
            displayName: v.displayName || id,
            lat: v.lat,
            lng: v.lng,
            radiusMeters: v.radiusMeters || 300,
          }));
          setTracks(arr);
        }
      );
    } catch (e) {
      console.warn("useTracks(): unexpected error, using constants fallback.", e);
      const arr = Object.entries(TRACKS || {}).map(([id, v]) => ({
        id,
        displayName: v.displayName || id,
        lat: v.lat,
        lng: v.lng,
        radiusMeters: v.radiusMeters || 300,
      }));
      setTracks(arr);
    }
    return () => unsub && unsub();
  }, []);

  return tracks;
}
