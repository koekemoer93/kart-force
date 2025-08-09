// src/hooks/useSafetyChecklist.js
import { useEffect, useMemo, useState, useCallback } from 'react';
import { db, storage } from '../firebase';
import {
  collection, query, where, onSnapshot, addDoc, Timestamp, doc, updateDoc, arrayUnion, getDocs
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import SAFETY_CHECKLIST_TEMPLATE from '../constants/safetyChecklistTemplate';

function startOfWeek(date=new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1) - day; // make Monday the start
  d.setDate(d.getDate() + diff);
  d.setHours(0,0,0,0);
  return d;
}

export function useSafetyChecklist(trackId, uid) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const weekStartDate = useMemo(() => startOfWeek(new Date()), []);
  const weekStartTs = useMemo(() => Timestamp.fromDate(weekStartDate), [weekStartDate]);

  // Ensure week docs exist for this track
  const ensureWeek = useCallback(async () => {
    if (!trackId) return;
    const q = query(collection(db, 'safetyChecklist'),
      where('trackId', '==', trackId),
      where('weekStart', '==', weekStartTs)
    );
    const snap = await getDocs(q);
    if (!snap.empty) return;

    const batch = SAFETY_CHECKLIST_TEMPLATE.map(item => addDoc(collection(db, 'safetyChecklist'), {
      trackId,
      weekStart: weekStartTs,
      key: item.key,
      title: item.title,
      completedBy: [],
      proofs: {}, // map: uid -> [urls]
      createdAt: Timestamp.now()
    }));
    await Promise.all(batch);
  }, [trackId, weekStartTs]);

  useEffect(() => {
    let unsub = () => {};
    (async () => {
      try {
        setLoading(true);
        await ensureWeek();
        const qItems = query(collection(db, 'safetyChecklist'),
          where('trackId', '==', trackId || '__none__'),
          where('weekStart', '==', weekStartTs)
        );
        unsub = onSnapshot(qItems, (snap) => {
          setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          setLoading(false);
        });
      } catch (e) {
        setError(e.message || String(e));
        setLoading(false);
      }
    })();
    return () => unsub && unsub();
  }, [trackId, weekStartTs, ensureWeek]);

  const uploadProofAndMark = useCallback(async (item, file, userId) => {
    if (!file || !userId) throw new Error('Missing file or userId');
    const path = `safetyProof/${item.trackId}/${item.id}/${userId}/${Date.now()}_${file.name}`;
    const r = ref(storage, path);
    await uploadBytes(r, file);
    const url = await getDownloadURL(r);

    const proofs = item.proofs || {};
    const arr = proofs[userId] || [];
    const next = { ...proofs, [userId]: [...arr, url] };

    const refDoc = doc(db, 'safetyChecklist', item.id);
    await updateDoc(refDoc, {
      proofs: next,
      completedBy: arrayUnion(userId)
    });
    return url;
  }, []);

  return { items, loading, error, weekStartDate, uploadProofAndMark };
}
