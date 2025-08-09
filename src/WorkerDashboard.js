import React, { useEffect, useMemo, useState } from 'react';
import { db } from './firebase';
import { useAuth } from './AuthContext';
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import TopNav from './components/TopNav';
import { clockIn, clockOut } from './services/timeEntries';
import { useGeofence } from './hooks/useGeofence';
import TRACKS from './constants/tracks';
import { haversineDistanceMeters } from './utils/geo';
import { useTasks } from './hooks/useTasks';

// --- Slim horizontal progress bar ---
function ProgressBar({ percent = 0, trackColor = '#4a4a4a', fillColor = '#24ff98', height = 16 }) {
  const v = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div
      style={{
        width: '100%',
        background: trackColor,
        borderRadius: 999,
        height,
        position: 'relative',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)'
      }}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v}
      role="progressbar"
    >
      <div
        style={{
          width: `${v}%`,
          height: '100%',
          background: fillColor,
          borderRadius: 999,
          transition: 'width .35s ease'
        }}
      />
    </div>
  );
}

export default function WorkerDashboard() {
  const navigate = useNavigate();
  const { user, userData, displayName } = useAuth();

  const assignedTrack = userData?.assignedTrack ?? '';
  const role = userData?.role ?? '';
  const isClockedIn = !!userData?.isClockedIn;

  // ✅ Fetch today's tasks
  const tasks = useTasks(assignedTrack, role);

  // ✅ Calculate completion % for THIS worker
  const completion = tasks.length
    ? Math.round(
        (tasks.filter(t => t.completedBy.includes(user.uid)).length / tasks.length) * 100
      )
    : 0;

  // ✅ Toggle a task's completion for this worker
  const toggleTask = async (task) => {
    const ref = doc(db, 'tasks', task.id);
    const isCompleted = task.completedBy.includes(user.uid);
    await updateDoc(ref, {
      completedBy: isCompleted
        ? arrayRemove(user.uid)
        : arrayUnion(user.uid)
    });
  };

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
  const { coords, isInsideFence, track } = useGeofence(assignedTrack);
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
    if (!isClockedIn || !user?.uid) { setClockInTime(null); return; }
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
      } else {
        setClockInTime(null);
      }
    });
    return () => unsub();
  }, [isClockedIn, user]);

  // --- Shift progress ---
  const shiftMinutes = Number.isFinite(userData?.shiftMinutes) ? userData.shiftMinutes : 480;
  const shiftPercent = useMemo(() => {
    if (!clockInTime) return 0;
    const elapsedMin = Math.max(0, Math.floor((Date.now() - clockInTime.getTime()) / 60000));
    const pct = (elapsedMin / Math.max(1, shiftMinutes)) * 100;
    return Math.max(0, Math.min(100, Math.round(pct)));
  }, [clockInTime, shiftMinutes]);

  // --- Geofence proximity percent ---
  const proximityPercent = useMemo(() => {
    if (!track || distanceToTrack == null) return 0;
    const radius = track?.radiusMeters || 300;
    if (insideFenceOrBypass) return 100;
    const pct = 100 - Math.min(100, Math.round((distanceToTrack / radius) * 100));
    return Math.max(0, pct);
  }, [track, distanceToTrack, insideFenceOrBypass]);

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

  return (
    <>
      <TopNav role="worker" />
      {bypassActive && <div className="bypass-banner">Geofence bypass enabled (dev mode)</div>}
      <div className="main-wrapper" style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: 16 }}>
        <div className="glass-card" style={{ maxWidth: 820, width: '100%', padding: 20 }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ marginTop: 0 }}>Welcome, {displayName || userData?.name || 'Worker'}!</h2>
              <p style={{ color: '#48ff99', margin: 0 }}>{currentTrackName}</p>
              <p style={{ margin: 0 }}>Staff on duty: {staffCount}</p>
              {isClockedIn && clockInTime && (
                <p style={{ margin: 0, color: '#24ff98' }}>
                  On shift since {clockInTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>

            {/* Progress bars */}
            <div style={{ width: 280, minWidth: 240, flex: '0 0 280px' }}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.85, display: 'flex', justifyContent: 'space-between' }}>
                  <span>Tasks completion</span><span>{completion}%</span>
                </div>
                <ProgressBar percent={completion} fillColor="#3ed37e" />
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.85, display: 'flex', justifyContent: 'space-between' }}>
                  <span>Shift progress</span>
                  <span>
                    {isClockedIn && clockInTime ? `${shiftPercent}%` : '—'}
                  </span>
                </div>
                <ProgressBar
                  percent={isClockedIn && clockInTime ? shiftPercent : 0}
                  fillColor="#ffb266"
                />
              </div>

              <div>
                <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.85, display: 'flex', justifyContent: 'space-between' }}>
                  <span>Proximity to gate</span>
                  <span>
                    {proximityPercent}%
                  </span>
                </div>
                <ProgressBar percent={proximityPercent} fillColor="#f3a4ad" />
              </div>
            </div>
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

          {/* Tasks list */}
          <h3 style={{ marginTop: 20 }}>Today's Tasks</h3>
          {tasks.length === 0 ? (
            <p>No tasks found.</p>
          ) : (
            <ul>
              {tasks.map(t => (
                <li key={t.id} style={{ margin: '10px 0' }}>
                  <label>
                    <input
                      type="checkbox"
                      checked={t.completedBy.includes(user.uid)}
                      onChange={() => toggleTask(t)}
                    /> {t.title}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
