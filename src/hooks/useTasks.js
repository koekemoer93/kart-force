import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';

export function useTasks(trackId, role) {
  const [tasks, setTasks] = useState([]);
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
      setTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return unsub;
  }, [trackId, role]);

  return tasks;
}
