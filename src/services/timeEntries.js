// src/services/timeEntries.js
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
  orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';

const USERS = (uid) => doc(db, 'users', uid);
const TIME_ENTRIES = collection(db, 'timeEntries');

export async function clockIn({ uid, trackId }) {
  // Create a time entry with clockInAt and set user isClockedIn true
  // First, ensure the user is not already clocked in (no open entry)
  const openQ = query(
    TIME_ENTRIES,
    where('uid', '==', uid),
    where('clockOutAt', '==', null),
    orderBy('clockInAt', 'desc'),
    limit(1)
  );
  const snap = await getDocs(openQ);
  if (!snap.empty) {
    throw new Error('Already clocked in. Please clock out first.');
  }

  await addDoc(TIME_ENTRIES, {
    uid,
    trackId,
    clockInAt: serverTimestamp(),
    clockOutAt: null,
    durationSec: null,
  });

  await updateDoc(USERS(uid), {
    isClockedIn: true,
    lastClockIn: serverTimestamp(),
  });
}

export async function clockOut({ uid }) {
  // Find the latest open entry for this uid
  const openQ = query(
    TIME_ENTRIES,
    where('uid', '==', uid),
    where('clockOutAt', '==', null),
    orderBy('clockInAt', 'desc'),
    limit(1)
  );
  const snap = await getDocs(openQ);
  if (snap.empty) {
    throw new Error('No open time entry found.');
  }
  const entryDoc = snap.docs[0];
  const startedAt = entryDoc.get('clockInAt')?.toDate?.() ?? new Date();

  const end = new Date();
  const durationSec = Math.max(0, Math.floor((end.getTime() - startedAt.getTime()) / 1000));

  await updateDoc(entryDoc.ref, {
    clockOutAt: end,
    durationSec,
  });

  await updateDoc(USERS(uid), {
    isClockedIn: false,
  });
}
