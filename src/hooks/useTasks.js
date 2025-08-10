import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';

export function useTasks(trackId, role) {
  const [tasks, setTasks] = useState([]);

  // Get today's start/end time
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  useEffect(() => {
    if (!trackId || !role) return;

    const q = query(
      collection(db, 'tasks'),
      where('trackId', '==', trackId),
      where('role', '==', role),
      where('date', '>=', Timestamp.fromDate(todayStart)),
      where('date', '<=', Timestamp.fromDate(todayEnd))
    );

    const unsub = onSnapshot(q, (snapshot) => {
      setTasks(snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          // Always ensure completedBy is an array
          completedBy: Array.isArray(data.completedBy) ? data.completedBy : []
        };
      }));
    });

    return unsub;
  }, [trackId, role]);

  return tasks;
}
