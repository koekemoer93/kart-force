// src/hooks/useStaffOnDuty.js
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';

export function useStaffOnDuty() {
  const [byTrack, setByTrack] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'timeEntries'),
      where('status', '==', 'in')
    );

    const unsub = onSnapshot(q, (snap) => {
      const grouped = {};

      snap.forEach((doc) => {
        const data = doc.data();
        const trackId = data.trackId || '';
        if (!trackId) return;

        // Store everything in lowercase for consistent lookup
        const key = trackId.trim().toLowerCase();

        if (!grouped[key]) {
          grouped[key] = [];
        }
        grouped[key].push({ id: doc.id, ...data });
      });

      setByTrack(grouped);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  return { byTrack, loading };
}
