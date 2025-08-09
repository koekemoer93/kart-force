// src/services/timeEntries.js
import { addDoc, collection, doc, getDocs, query, updateDoc, where, serverTimestamp, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';

// Create (clock in)
export async function clockIn({ uid, trackId }) {
  // Ensure no open entry exists (optional safeguard)
  const qOpen = query(
    collection(db, 'timeEntries'),
    where('uid', '==', uid),
    where('clockOutAt', '==', null),
    orderBy('clockInAt', 'desc'),
    limit(1)
  );
  const snap = await getDocs(qOpen);
  if (!snap.empty) return; // already clocked in

  await addDoc(collection(db, 'timeEntries'), {
    uid,                      // <<<<<<<<<< must exist and equal auth uid (rules check this)
    trackId: trackId || null,
    status: 'in',
    clockInAt: serverTimestamp(),
    clockOutAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// Update (clock out)
export async function clockOut({ uid }) {
  // find latest open entry for this uid
  const qOpen = query(
    collection(db, 'timeEntries'),
    where('uid', '==', uid),
    where('clockOutAt', '==', null),
    orderBy('clockInAt', 'desc'),
    limit(1)
  );
  const snap = await getDocs(qOpen);
  if (snap.empty) return;

  const docRef = doc(db, 'timeEntries', snap.docs[0].id);
  await updateDoc(docRef, {
    status: 'out',
    clockOutAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
