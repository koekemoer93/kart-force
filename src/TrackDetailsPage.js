// src/TrackDetailsPage.js
import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { db } from './firebase';
import {
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import './theme.css';
import './TrackDetailsPage.css';
import TopNav from './components/TopNav';

// Local YYYY-MM-DD string
function yyyyMmDdLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

const TrackDetailsPage = () => {
  const { trackName } = useParams(); // we pass the Firestore track id in the route
  const trackId = trackName;
  const todayStr = yyyyMmDdLocal();

  const [workers, setWorkers] = useState([]);  // [{ uid, name, roleLower }]
  const [tasks, setTasks] = useState([]);      // live tasks for this track+today
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      // 1) Workers assigned to this track
      const usersQ = query(collection(db, 'users'), where('assignedTrack', '==', trackId));
      const usersSnap = await getDocs(usersQ);
      const workerRows = usersSnap.docs.map((d) => {
        const u = d.data() || {};
        const name =
          u.displayName ||
          u.name ||
          (u.email ? u.email.split('@')[0] : 'Unnamed');
        const roleLower = String(u.role || '').toLowerCase();
        return { uid: d.id, name, roleLower, rawRole: u.role || 'worker' };
      });

      // 2) Tasks for this track today
      const tasksQ = query(
        collection(db, 'tasks'),
        where('assignedTrack', '==', trackId),
        where('date', '==', todayStr)
      );
      const tasksSnap = await getDocs(tasksQ);
      const taskRows = tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      if (!cancelled) {
        setWorkers(workerRows);
        setTasks(taskRows);
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [trackId, todayStr]);

  // Build per-worker totals and completed counts using /tasks.completedBy
  const workerProgress = useMemo(() => {
    // Index tasks by role (lowercased) to speed up
    const byRole = tasks.reduce((acc, t) => {
      const r = String(t.role || '').toLowerCase();
      (acc[r] ||= []).push(t);
      return acc;
    }, {});

    return workers.map((w) => {
      const roleTasks = byRole[w.roleLower] || [];
      const total = roleTasks.length;

      const done = roleTasks.filter((t) =>
        Array.isArray(t.completedBy) && t.completedBy.includes(w.uid)
      ).length;

      const percent = total ? Math.round((done / total) * 100) : 0;

      return {
        name: w.name,
        role: w.rawRole,
        completed: done,
        total,
        percent,
      };
    });
  }, [workers, tasks]);

  if (loading) {
    return (
      <>
        <TopNav role="admin" />
        <div className="main-wrapper">
          <div className="glass-card">
            <p>Loading track data...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <TopNav role="admin" />
      <div className="main-wrapper">
        <div className="glass-card track-header">
          <h2>{trackId.replace(/_/g, ' ')}</h2>
          <p>Live Dashboard</p>
        </div>

        <div className="glass-card">
          <h3>Workers Assigned</h3>
          {workerProgress.length === 0 ? (
            <p className="muted">No workers assigned to this track.</p>
          ) : (
            workerProgress.map((w, i) => (
              <div key={i} className="card-inner">
                <p><b>{w.name}</b> — {w.role}</p>
                <p>Tasks Done: {w.completed}/{w.total}</p>
                <p>Progress: <b>{w.percent}%</b></p>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${w.percent}%` }} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
};

export default TrackDetailsPage;
