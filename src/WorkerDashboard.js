// src/WorkerDashboard.js
import React, { useEffect, useMemo, useState } from 'react';
import { db } from './firebase';
import { useAuth } from './AuthContext';
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  Timestamp,
  onSnapshot,
  orderBy,
  limit
} from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import TopNav from './components/TopNav';
import { clockIn, clockOut } from './services/timeEntries';
import { useGeofence } from './hooks/useGeofence';
import TRACKS from './constants/tracks';
import { haversineDistanceMeters } from './utils/geo';

function ProgressRing({ percent }) {
  const radius = 32;
  const stroke = 6;
  const normalizedRadius = radius - stroke * 0.5;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percent / 100) * circumference;
  return (
    <svg height={radius * 2} width={radius * 2}>
      <circle
        stroke="#232e1f"
        fill="transparent"
        strokeWidth={stroke}
        r={normalizedRadius}
        cx={radius}
        cy={radius}
      />
      <circle
        stroke="#24ff98"
        fill="transparent"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference + ' ' + circumference}
        style={{ strokeDashoffset, transition: 'stroke-dashoffset 0.5s' }}
        r={normalizedRadius}
        cx={radius}
        cy={radius}
      />
      <text
        x="50%"
        y="54%"
        textAnchor="middle"
        fill="#fff"
        fontSize="18px"
        fontWeight="bold"
        dy="0.3em"
      >
        {percent}%
      </text>
    </svg>
  );
}

export default function WorkerDashboard() {
  const navigate = useNavigate();
  const { user, userData, displayName } = useAuth();

  const assignedTrack = userData?.assignedTrack ?? '';
  const role = userData?.role ?? '';
  const isClockedIn = !!userData?.isClockedIn;

  // --- DEV BYPASS ---
  const allowBypass =
    process.env.NODE_ENV !== 'production' ||
    String(process.env.REACT_APP_ALLOW_BYPASS).toLowerCase() === 'true';
  const bypassActive =
    allowBypass &&
    typeof window !== 'undefined' &&
    localStorage.getItem('bypassFence') === 'true';
  useEffect(() => {
    if (!allowBypass) return;
    const onKey = (e) => {
      if (e.shiftKey && (e.key === 'g' || e.key === 'G')) {
        const next = localStorage.getItem('bypassFence') === 'true' ? 'false' : 'true';
        localStorage.setItem('bypassFence', next);
        window.location.reload();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [allowBypass]);

  // --- Geofence ---
  const { coords, isInsideFence, permissionState, error: geoError, track } =
    useGeofence(assignedTrack);
  const insideFenceOrBypass = bypassActive ? true : isInsideFence;

  // --- Distance ---
  const distanceToTrack =
    coords && track
      ? Math.round(
          haversineDistanceMeters({
            lat1: coords.lat,
            lng1: coords.lng,
            lat2: track.lat,
            lng2: track.lng,
          })
        )
      : null;

  // --- Tasks & completion ---
  const [tasks, setTasks] = useState([]);
  const [completedTaskNames, setCompletedTaskNames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user || !assignedTrack || !role) return;
      const tplRef = doc(db, 'tracks', assignedTrack, 'templates', role);
      const tplSnap = await getDoc(tplRef);
      const tplTasks = tplSnap.exists() ? tplSnap.data().tasks || [] : [];
      if (!cancelled) setTasks(tplTasks);

      // Completed tasks today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startOfDay = Timestamp.fromDate(today);
      const logsRef = collection(db, 'users', user.uid, 'completedTasks');
      const qCompleted = query(logsRef, where('completedAt', '>=', startOfDay));
      const snap = await getDocs(qCompleted);
      const done = [];
      snap.forEach((d) => done.push(d.data().taskName));
      if (!cancelled) setCompletedTaskNames(done);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user, assignedTrack, role]);

  const percent = tasks.length === 0 ? 0 : Math.round((completedTaskNames.length / tasks.length) * 100);
  async function handleTaskCheck(taskName) {
    if (!user || completedTaskNames.includes(taskName)) return;
    await addDoc(collection(db, 'users', user.uid, 'completedTasks'), {
      taskName,
      completedAt: Timestamp.now(),
      trackId: assignedTrack,
      role,
    });
    setCompletedTaskNames((prev) => [...prev, taskName]);
  }

  // --- Staff on duty count (realtime) ---
  const [staffCount, setStaffCount] = useState(0);
  useEffect(() => {
    if (!assignedTrack) return;
    const qOnDuty = query(
      collection(db, 'timeEntries'),
      where('trackId', '==', assignedTrack),
      where('clockOutAt', '==', null)
    );
    const unsub = onSnapshot(qOnDuty, (snap) => {
      setStaffCount(snap.size);
    });
    return () => unsub();
  }, [assignedTrack]);

  // --- My clock-in time (live) ---
  const [clockInTime, setClockInTime] = useState(null);
  useEffect(() => {
    if (!isClockedIn) { setClockInTime(null); return; }
    const qMyOpen = query(
      collection(db, 'timeEntries'),
      where('uid', '==', user.uid),
      where('clockOutAt', '==', null),
      orderBy('clockInAt', 'desc'),
      limit(1)
    );
    const unsub = onSnapshot(qMyOpen, (snap) => {
      if (!snap.empty) {
        const data = snap.docs[0].data();
        setClockInTime(data.clockInAt?.toDate() || null);
      }
    });
    return () => unsub();
  }, [isClockedIn, user]);

  const clockDuration = useMemo(() => {
    if (!clockInTime) return '';
    const diffMs = Date.now() - clockInTime.getTime();
    const h = Math.floor(diffMs / 3600000);
    const m = Math.floor((diffMs % 3600000) / 60000);
    return `${h}h ${m}m`;
  }, [clockInTime, Date.now()]); // Date.now() will force re-render if we tie to interval
  useEffect(() => {
    if (!clockInTime) return;
    const t = setInterval(() => { }, 60000); // triggers rerender via state change
    return () => clearInterval(t);
  }, [clockInTime]);

  // --- Announcements ---
  const [announcements, setAnnouncements] = useState([]);
  useEffect(() => {
    const qAnn = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(3));
    const unsub = onSnapshot(qAnn, (snap) => {
      setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // --- Clock in/out ---
  const [busyClock, setBusyClock] = useState(false);
  async function handleClockButton() {
    if (!user) return;
    if (!assignedTrack) {
      alert('No assigned track. Ask an admin to set your track.');
      return;
    }
    if (!insideFenceOrBypass) {
      alert(`You must be inside the ${TRACKS[assignedTrack]?.displayName || assignedTrack} geofence to clock ${isClockedIn ? 'out' : 'in'}.`);
      return;
    }
    try {
      setBusyClock(true);
      if (isClockedIn) {
        await clockOut({ uid: user.uid });
      } else {
        await clockIn({ uid: user.uid, trackId: assignedTrack });
      }
    } catch (e) {
      alert(e.message);
    } finally {
      setBusyClock(false);
    }
  }

  const currentTrackName = assignedTrack ? TRACKS[assignedTrack]?.displayName || assignedTrack : 'No track';

  if (loading) {
    return (
      <>
        <TopNav role="worker" />
        <div className="main-wrapper"><div className="glass-card"><p>Loading your tasks...</p></div></div>
      </>
    );
  }

  return (
    <>
      <TopNav role="worker" />
      {bypassActive && <div className="bypass-banner">Geofence bypass enabled (dev mode)</div>}
      <div className="main-wrapper" style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: 16 }}>
        <div className="glass-card" style={{ maxWidth: 820, width: '100%', padding: 20 }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2>Welcome, {displayName || userData?.name || 'Worker'}!</h2>
              <p style={{ color: '#48ff99', margin: 0 }}>{currentTrackName}</p>
              <p style={{ margin: 0 }}>Staff on duty: {staffCount}</p>
              {isClockedIn && clockInTime && (
                <p style={{ margin: 0, color: '#24ff98' }}>Clocked in since {clockInTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({clockDuration})</p>
              )}
            </div>
            <ProgressRing percent={percent} />
          </div>

          {/* Announcements */}
          {announcements.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <h3>Announcements</h3>
              {announcements.map(a => (
                <div key={a.id} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <strong>{a.title}</strong>
                  <div style={{ fontSize: 14, opacity: 0.8 }}>{a.message}</div>
                </div>
              ))}
            </div>
          )}

          {/* Tasks */}
          <h3 style={{ marginTop: 20 }}>Today's Tasks</h3>
          {tasks.length === 0 ? (
            <p>No tasks found.</p>
          ) : (
            <ul>
              {tasks.filter(t => !completedTaskNames.includes(t.name)).map(t => (
                <li key={t.id || t.name} style={{ margin: '10px 0' }}>
                  <label>
                    <input type="checkbox" onChange={() => handleTaskCheck(t.name)} /> {t.name}
                  </label>
                </li>
              ))}
            </ul>
          )}
          {completedTaskNames.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <h4>Completed Today</h4>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {completedTaskNames.map((t, i) => <li key={i} style={{ color: '#48ff99' }}>{t}</li>)}
              </ul>
            </div>
          )}

      

          {/* View history */}
          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <button className="button-primary" onClick={() => navigate('/task-history')} style={{ width: 180 }}>
              View Task History
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
