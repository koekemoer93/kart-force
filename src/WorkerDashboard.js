// src/WorkerDashboard.js
import React, { useEffect, useState } from 'react';
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
  Timestamp
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

  // From profile (keeps Firestore naming consistent)
  const assignedTrack = userData?.assignedTrack ?? '';
  const role = userData?.role ?? '';
  const isClockedIn = !!userData?.isClockedIn;

  // Geofence
  const { coords, isInsideFence, permissionState, error: geoError, track } = useGeofence(assignedTrack);

  // Tasks + completion (today)
  const [tasks, setTasks] = useState([]);
  const [completedTaskNames, setCompletedTaskNames] = useState([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [busyClock, setBusyClock] = useState(false);
  const [clockStatusMsg, setClockStatusMsg] = useState('');

  // Compute distance (optional, for UX)
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

  // Load tasks (template lives at tracks/{assignedTrack}/templates/{role})
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!user || !assignedTrack || !role) return;

        const tplRef = doc(db, 'tracks', assignedTrack, 'templates', role);
        const tplSnap = await getDoc(tplRef);
        const tplTasks = tplSnap.exists() ? tplSnap.data().tasks || [] : [];
        if (!cancelled) setTasks(tplTasks);

        // Load today's completed task names
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startOfDay = Timestamp.fromDate(today);
        const logsRef = collection(db, 'users', user.uid, 'completedTasks');
        const qCompleted = query(logsRef, where('completedAt', '>=', startOfDay));
        const snap = await getDocs(qCompleted);
        const done = [];
        snap.forEach((d) => done.push(d.data().taskName));
        if (!cancelled) setCompletedTaskNames(done);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, assignedTrack, role]);

  // Progress %
  const percent =
    tasks.length === 0 ? 0 : Math.round((completedTaskNames.length / tasks.length) * 100);

  // Task check
  async function handleTaskCheck(taskName) {
    if (!user) return;
    if (completedTaskNames.includes(taskName)) return;
    await addDoc(collection(db, 'users', user.uid, 'completedTasks'), {
      taskName,
      completedAt: Timestamp.now(),
      trackId: assignedTrack,
      role,
    });
    setCompletedTaskNames((prev) => [...prev, taskName]);
  }

  // Clock in/out using the centralized service + geofence
  async function handleClockButton() {
    if (!user) return;
    if (!assignedTrack) {
      alert('No assigned track. Ask an admin to set your track.');
      return;
    }
    if (!isInsideFence) {
      alert(
        `You must be inside the ${TRACKS[assignedTrack]?.displayName || assignedTrack} geofence to clock ${
          isClockedIn ? 'out' : 'in'
        }.`
      );
      return;
    }
    try {
      setBusyClock(true);
      if (isClockedIn) {
        await clockOut({ uid: user.uid });
        setClockStatusMsg('You are clocked out');
      } else {
        await clockIn({ uid: user.uid, trackId: assignedTrack });
        setClockStatusMsg('You are clocked in');
      }
    } catch (e) {
      alert(e.message);
    } finally {
      setBusyClock(false);
    }
  }

  if (loading) {
    return (
      <>
        <TopNav role="worker" />
        <div className="main-wrapper">
          <div className="glass-card">
            <p>Loading your tasks...</p>
          </div>
        </div>
      </>
    );
  }

  const currentTrackName =
    assignedTrack ? TRACKS[assignedTrack]?.displayName || assignedTrack : 'No track';

  return (
    <>
      <TopNav role="worker" />
      <div
        className="main-wrapper"
        style={{ minHeight: '100vh', alignItems: 'center', justifyContent: 'center', display: 'flex' }}
      >
        {/* Geolocation warnings / guard-ish UX (hard enforcement happens at button) */}
        {permissionState !== 'granted' && (
          <div
            className="glass-card"
            style={{
              background: 'rgba(30, 30, 30, 0.92)',
              color: '#ff7070',
              border: '1.5px solid #ff7070',
              fontWeight: 'bold',
              padding: 24,
              textAlign: 'center',
              maxWidth: 520,
              minWidth: 320,
              boxShadow: '0 6px 32px 0 rgba(0,0,0,0.4)',
              fontSize: 18,
              margin: '0 auto 18px',
            }}
          >
            Location permission needed to clock in at {currentTrackName}.
            <div style={{ marginTop: 12, fontSize: 15, color: '#fff', opacity: 0.8 }}>
              Allow location access in your browser settings and refresh the page.
              {geoError ? <div style={{ marginTop: 8, opacity: 0.8 }}>Error: {geoError}</div> : null}
            </div>
          </div>
        )}

        {coords && distanceToTrack !== null && distanceToTrack > (track?.radiusMeters || 300) ? (
          <div
            className="glass-card"
            style={{
              background: 'rgba(30,30,30,0.94)',
              color: '#fff',
              border: '2px solid #ffb020',
              fontWeight: 'bold',
              margin: '0 auto 24px auto',
              padding: 24,
              textAlign: 'center',
              maxWidth: 520,
              fontSize: 18,
            }}
          >
            <span style={{ color: '#ffb020' }}>
              You are not inside the {currentTrackName} geofence.
            </span>
            <br />
            <br />
            Move within {track?.radiusMeters || 300}m of the track to clock in/out.
            <br />
            <span style={{ fontSize: 15, opacity: 0.75 }}>
              Current distance: {distanceToTrack} meters
            </span>
          </div>
        ) : null}

        {/* Main worker card */}
        <div className="glass-card" style={{ maxWidth: 820, width: '100%', padding: 20 }}>
          {/* Role & Track Info + Progress */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
            <ProgressRing percent={percent} />
            <div>
              <div style={{ fontWeight: 'bold', fontSize: 18, letterSpacing: 1 }}>
                {role ? role.toUpperCase() : 'ROLE'}
              </div>
              <div style={{ color: '#48ff99', fontSize: 16, marginTop: 2 }}>{currentTrackName}</div>
              <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>
                Geofence:{' '}
                <strong style={{ color: isInsideFence ? 'lightgreen' : '#f88' }}>
                  {isInsideFence ? 'Inside' : 'Outside'}
                </strong>
                {coords && track ? <> · ~{distanceToTrack}m away</> : null}
              </div>
            </div>
          </div>

          <h2 style={{ marginTop: 4, marginBottom: 12 }}>
            Welcome, {displayName || userData?.name || 'Worker'}!
          </h2>

          <h3>Today's Tasks</h3>
          {tasks.length === 0 ? (
            <p>No tasks found for your track/role.</p>
          ) : (
            <ul>
              {tasks
                .filter((task) => !completedTaskNames.includes(task.name))
                .map((task) => (
                  <li key={task.id || task.name} style={{ margin: '16px 0', fontSize: 18 }}>
                    <label>
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => handleTaskCheck(task.name)}
                      />{' '}
                      {task.name}
                    </label>
                  </li>
                ))}
            </ul>
          )}
          {tasks.filter((t) => !completedTaskNames.includes(t.name)).length === 0 && tasks.length > 0 && (
            <p style={{ color: '#24ff98', marginTop: 10, fontWeight: 500 }}>All tasks complete!</p>
          )}

          {/* Task History (Today) */}
          <div style={{ marginTop: 30 }}>
            <h4 style={{ margin: 0, color: '#aaa' }}>Today’s Completed Tasks</h4>
            {completedTaskNames.length === 0 ? (
              <p style={{ color: '#bbb' }}>No tasks completed yet.</p>
            ) : (
              <ul style={{ margin: '10px 0 0 0', padding: 0, listStyle: 'none' }}>
                {completedTaskNames.map((task, idx) => (
                  <li key={idx} style={{ color: '#48ff99', marginBottom: 4 }}>
                    {task}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Clock In/Out Section */}
          <div style={{ marginTop: 30, textAlign: 'center' }}>
            <button
              className="button-primary"
              style={{
                padding: '12px 32px',
                fontSize: 18,
                borderRadius: 14,
                fontWeight: 600,
                background: isClockedIn ? '#232e1f' : '#215b37',
                color: '#fff',
                border: 'none',
                opacity: busyClock ? 0.7 : 1,
                cursor: busyClock ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 12px 0 rgba(0,0,0,0.14)',
              }}
              disabled={busyClock}
              onClick={handleClockButton}
            >
              {isClockedIn ? 'Clock Out' : 'Clock In'}
            </button>
            <div
              style={{
                marginTop: 14,
                color: isClockedIn ? '#24ff98' : '#fff',
                fontWeight: 500,
                fontSize: 17,
              }}
            >
              {clockStatusMsg || (isClockedIn ? 'You are clocked in' : 'You are not clocked in')}
            </div>
          </div>

          {/* View Task History Button */}
          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <button
              className="button-primary"
              onClick={() => navigate('/task-history')}
              style={{ width: 180, fontSize: 15, borderRadius: 10 }}
            >
              View Task History
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
