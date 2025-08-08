// src/AdminDashboard.js
import React, { useEffect, useState, useMemo } from 'react';
import { auth, db } from './firebase';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  query,
  where,
  Timestamp,
  onSnapshot
} from 'firebase/firestore';
import TopNav from './components/TopNav';

function AdminDashboard({ displayName, role }) {
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);
  const [trackProgress, setTrackProgress] = useState({});
  const [loading, setLoading] = useState(true);
  const [pendingLeaveCount, setPendingLeaveCount] = useState(0);
  const [trackStatuses, setTrackStatuses] = useState({});

  // Group only clocked-in users by track
  const clockedInByTrack = useMemo(() => {
    const grouped = {};
    users
      .filter(u => u.isClockedIn)
      .forEach(u => {
        const key = u.assignedTrack || 'Unassigned';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(u);
      });
    return grouped;
  }, [users]);

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/');
  };

  const toMinutes = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };

  const isOpenNow = (openingHours) => {
    const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const now = new Date();
    const key = dayKeys[now.getDay()];
    const today = openingHours?.[key];

    if (!today || today.closed) return false;

    const minutesNow = now.getHours() * 60 + now.getMinutes();
    const openMins = toMinutes(today.open);
    const closeMins = toMinutes(today.close);

    return minutesNow >= openMins && minutesNow < closeMins;
  };

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'tracks'), (snap) => {
      const next = {};
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        const name = data.name || docSnap.id;
        next[name] = { openNow: isOpenNow(data.openingHours || {}) };
      });
      setTrackStatuses(next);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, 'leaveRequests'),
      where('status', '==', 'pending')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPendingLeaveCount(snapshot.size);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    async function fetchData() {
      const userSnapshot = await getDocs(collection(db, 'users'));
      const usersData = [];

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startOfDay = Timestamp.fromDate(today);

      const trackStats = {};

      for (const docSnap of userSnapshot.docs) {
        const userData = docSnap.data();
        const userId = docSnap.id;

        const assignedTrack = userData.assignedTrack || 'N/A';
        const role = userData.role || 'worker';
        const name = userData.name || 'Unnamed';

        const clockQuery = query(
          collection(db, 'users', userId, 'clockLogs'),
          where('timestamp', '>=', startOfDay)
        );
        const clockLogs = await getDocs(clockQuery);

        let lastLog = null;
        clockLogs.forEach((log) => {
          const data = log.data();
          if (!lastLog || data.timestamp.seconds > lastLog.timestamp.seconds) {
            lastLog = data;
          }
        });

        const isClockedIn = !!lastLog && lastLog.type === 'in';

        const completedQuery = query(
          collection(db, 'users', userId, 'completedTasks'),
          where('completedAt', '>=', startOfDay)
        );
        const completedSnapshot = await getDocs(completedQuery);
        const completedCount = completedSnapshot.size;

        let totalTasks = 0;
        if (assignedTrack !== 'N/A') {
          const templateDoc = await getDoc(
            doc(db, 'tracks', assignedTrack, 'templates', role)
          );
          if (templateDoc.exists()) {
            totalTasks = (templateDoc.data().tasks || []).length;
          }
        }

        const percentDone =
          totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;

        usersData.push({
          id: userId,
          name,
          role,
          assignedTrack,
          isClockedIn,
          completedCount,
          totalTasks,
          percentDone,
        });

        if (!trackStats[assignedTrack]) {
          trackStats[assignedTrack] = { total: 0, completed: 0 };
        }
        trackStats[assignedTrack].total += totalTasks;
        trackStats[assignedTrack].completed += completedCount;
      }

      setUsers(usersData);
      setTrackProgress(trackStats);
      setLoading(false);
    }

    fetchData();
  }, []);

  if (loading) {
    return (
      <>
        <TopNav role="admin" onLogout={handleLogout} />
        <div className="main-wrapper">
          <div className="glass-card">
            <p>Loading live worker data...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <TopNav role="admin" />
      <div className="main-wrapper" style={{ flexDirection: 'column', gap: 24 }}>
        
        {/* New Button to Seed Hours */}
        {role === 'admin' && (
          <button
            className="button-primary"
            style={{ marginBottom: 20 }}
            onClick={() => navigate('/seed-hours')}
          >
            Seed SyringaPark Hours
          </button>
        )}

        {/* Compact welcome card */}
        <div
          className="glass-card welcome-card"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            marginBottom: 20,
            gap: 16,
            textAlign: 'center',
          }}
        >
          <img
            src="/profile-placeholder.jpg"
            alt="Profile"
            style={{
              width: 60,
              height: 60,
              borderRadius: '50%',
              objectFit: 'cover',
              border: '2px solid white',
            }}
          />
          <div>
            <h2 style={{ margin: 0 }}>Welcome, {displayName || 'Admin'}!</h2>
            <p style={{ margin: 0, fontSize: 14 }}>
              This is your live owner dashboard.
            </p>
          </div>
        </div>

        {/* Combined: Pending Leave + Tracks Overview */}
<div
  className="glass-card"
  style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
>
  <div>
    <h3 style={{ marginTop: 0 }}>Pending Leave Requests</h3>
    <p
      style={{
        fontSize: 24,
        fontWeight: 'bold',
        color: pendingLeaveCount > 0 ? 'tomato' : 'lightgreen',
        margin: 0,
      }}
    >
      {pendingLeaveCount}
    </p>
  </div>

  <div>
    <h3 style={{ marginTop: 0 }}>Tracks Overview</h3>
    {Object.entries(trackProgress).map(([trackName, data], index) => {
      const pct =
        data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0;

      // 🔔 Live open/closed (computed from Firestore tracks collection)
      const openNow = trackStatuses?.[trackName]?.openNow === true;

      return (
        <div
          key={index}
          style={{
            marginBottom: 12,
            paddingBottom: 12,
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <strong>{trackName}</strong>
            <span
              style={{
                fontSize: 12,
                padding: '2px 8px',
                borderRadius: 999,
                background: openNow ? 'rgba(72,255,153,0.15)' : 'rgba(255,99,71,0.15)',
                color: openNow ? '#48ff99' : 'tomato',
                border: `1px solid ${
                  openNow ? 'rgba(72,255,153,0.5)' : 'rgba(255,99,71,0.5)'
                }`,
              }}
            >
              {openNow ? 'OPEN' : 'CLOSED'}
            </span>
          </p>

          <p style={{ margin: '6px 0 0' }}>
            Completed Tasks: {data.completed}/{data.total}
          </p>
          <p style={{ margin: '2px 0 0' }}>
            Track Completion: <strong>{pct}%</strong>
          </p>
        </div>
      );
    })}
  </div>
</div>


{/* Staff on Duty — grouped by track, only clocked-in */}
<div
  className="glass-card"
  style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
>
  <h3 style={{ marginTop: 0 }}>Staff on Duty</h3>

  {Object.keys(clockedInByTrack).length === 0 ? (
    <p style={{ opacity: 0.8, margin: 0 }}>No staff are currently clocked in.</p>
  ) : (
    Object.entries(clockedInByTrack).map(([trackName, staff]) => (
      <div key={trackName} style={{ marginBottom: 16 }}>
        <h4 style={{ margin: '0 0 8px', opacity: 0.9 }}>{trackName}</h4>

        {staff.map((u, idx) => (
          <div
            key={u.id || idx}
            style={{
              padding: '8px 0',
              borderBottom:
                idx === staff.length - 1
                  ? 'none'
                  : '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <p style={{ margin: 0 }}>
              <strong>{u.name || u.email}</strong>
            </p>
            <p style={{ margin: '2px 0 0' }}>Role: {u.role}</p>
            <p style={{ margin: '2px 0 0' }}>
              Status: <span style={{ color: 'lightgreen' }}>Clocked In</span>
            </p>
            <p style={{ margin: '2px 0 0' }}>
              Task Progress: {u.percentDone}% ({u.completedCount}/{u.totalTasks})
            </p>
          </div>
        ))}
      </div>
    ))
  )}
</div>



       
      </div>
    </>
  );
}

export default AdminDashboard;
