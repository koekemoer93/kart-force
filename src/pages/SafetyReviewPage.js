// src/pages/SafetyReviewPage.js
import React, { useEffect, useMemo, useState } from 'react';
import TopNav from '../components/TopNav';
import { useAuth } from '../AuthContext';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useTracks } from '../hooks/useTracks';

function startOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();                 // 0=Sun .. 6=Sat
  const diff = (day === 0 ? -6 : 1) - day; // move to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function SafetyReviewPage() {
  const { userData } = useAuth();
  const role = userData?.role;

  const weekStartTs = useMemo(() => Timestamp.fromDate(startOfWeek(new Date())), []);
  const tracks = useTracks(); // ALWAYS an array after step #1
  const [byTrack, setByTrack] = useState({}); // { [trackId]: { total, completed } }

  useEffect(() => {
    if (!Array.isArray(tracks) || tracks.length === 0) return;

    const unsubs = tracks.map((t) => {
      const trackId = t.id;
      const qx = query(
        collection(db, 'safetyChecklist'),
        where('trackId', '==', trackId),
        where('weekStart', '==', weekStartTs)
      );
      return onSnapshot(qx, (snap) => {
        const docs = snap.docs.map((d) => d.data());
        const total = docs.length;
        const completed = docs.filter(
          (d) => Array.isArray(d.completedBy) && d.completedBy.length > 0
        ).length;
        setByTrack((prev) => ({ ...prev, [trackId]: { total, completed } }));
      });
    });

    return () => unsubs.forEach((u) => typeof u === 'function' && u());
  }, [tracks, weekStartTs]);

  return (
    <>
      <TopNav />
      <div className="main-wrapper" style={{ padding: 16 }}>
        <div className="glass-card" style={{ maxWidth: 980, margin: '0 auto' }}>
          <h2 style={{ marginTop: 0 }}>Health &amp; Safety — Weekly Review</h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 12,
            }}
          >
            {tracks.map((t) => {
              const stats = byTrack[t.id] || { total: 0, completed: 0 };
              const pct = stats.total ? Math.round((stats.completed / stats.total) * 100) : 0;
              return (
                <div key={t.id} className="glass-card" style={{ padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>{t.displayName || t.id}</strong>
                    <span style={{ opacity: 0.8 }}>{pct}%</span>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    {stats.completed} / {stats.total} completed this week
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
