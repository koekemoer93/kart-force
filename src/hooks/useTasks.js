// src/hooks/useTasks.js
import { useEffect, useMemo, useState } from 'react';
import { db } from '../firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
} from 'firebase/firestore';
import { useTracks } from '../hooks/useTracks';

// Match seeder: "YYYY-MM-DD" (local midnight)
function yyyyMmDdLocal(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const da = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

/**
 * Normalizes an input track value (doc ID or display name) to a track doc ID.
 * If input already matches an ID, returns it. If it matches displayName, returns that doc's ID.
 * Otherwise returns undefined (so we don't run a broken query).
 */
function useNormalizedTrackId(inputTrack) {
  const tracks = useTracks(); // [{ id, displayName, ... }, ...]
  return useMemo(() => {
    if (!inputTrack || !Array.isArray(tracks)) return undefined;

    // Exact ID match first
    const byId = tracks.find(t => t.id === inputTrack);
    if (byId) return byId.id;

    // Fallback: match by displayName (case-insensitive trim)
    const canon = String(inputTrack).trim().toLowerCase();
    const byName = tracks.find(t => String(t.displayName || '').trim().toLowerCase() === canon);
    return byName?.id;
  }, [inputTrack, tracks]);
}

/**
 * Live task list for a worker:
 * Filters by (assignedTrack doc ID) + (role) + ("YYYY-MM-DD")
 */
export function useTasks({ assignedTrack, role, forDate = new Date() }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const normalizedTrackId = useNormalizedTrackId(assignedTrack);
  const ymd = useMemo(() => yyyyMmDdLocal(forDate), [forDate]);

  useEffect(() => {
    // Wait until we know the normalized track ID and have role+date
    if (!normalizedTrackId || !role || !ymd) {
      setTasks([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const qRef = query(
      collection(db, 'tasks'),
      where('assignedTrack', '==', normalizedTrackId),
      where('role', '==', role),
      where('date', '==', ymd),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(
      qRef,
      (snap) => {
        setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('useTasks onSnapshot error:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [normalizedTrackId, role, ymd]);

  return {
    tasks,
    loading,
    error,
    filters: { assignedTrack: normalizedTrackId, role, date: ymd }
  };
}
