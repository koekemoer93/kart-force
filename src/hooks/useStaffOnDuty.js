// src/hooks/useStaffOnDuty.js
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';

export function useStaffOnDuty() {
  const [byTrack, setByTrack] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'users'), where('isClockedIn', '==', true));
    const unsub = onSnapshot(q, (snap) => {
      const map = {};
      snap.forEach((doc) => {
        const u = doc.data();
        const track = u.assignedTrack || 'Unassigned';
        if (!map[track]) map[track] = [];
        map[track].push({ id: doc.id, ...u });
      });
      setByTrack(map);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return { byTrack, loading };
}
