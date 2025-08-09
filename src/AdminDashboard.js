// src/AdminDashboard.js
import React, { useEffect, useMemo, useState } from 'react';
import TopNav from './components/TopNav';
import { useStaffOnDuty } from './hooks/useStaffOnDuty';
import TRACKS from './constants/tracks';
import { db } from './firebase';
import { fetchTrackHoursRaw } from './services/tracks';
import { normalizeWeeklyHours, isOpenNow } from './utils/hours';
import { useAuth } from './AuthContext';
import Avatar from './components/Avatar';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, Timestamp, getDocs, getDoc, doc } from 'firebase/firestore';


// ---- Helpers to compute "open now" from hours ----
const DAY_KEYS = ['sun','mon','tue','wed','thu','fri','sat'];

function parseHHMM(s) {
  if (!s || typeof s !== 'string') return null;
  const [h, m] = s.split(':').map(n => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

// Accepts shapes like:
// { days: { mon:{open:"09:00", close:"18:00", closed:false}, ... } }
// or { mon:{open:"09:00", close:"18:00", closed:false}, ... }
function isOpenNowForHours(hoursDoc, now = new Date()) {
  if (!hoursDoc) return false;

  const dayKey = DAY_KEYS[now.getDay()];
  const dayCfg =
    (hoursDoc.days && hoursDoc.days[dayKey]) ||
    hoursDoc[dayKey];

  if (!dayCfg) return false;
  if (dayCfg.closed === true || dayCfg.isOpen === false) return false;

  const openStr  = dayCfg.open  || dayCfg.openTime  || dayCfg.openHHmm;
  const closeStr = dayCfg.close || dayCfg.closeTime || dayCfg.closeHHmm;
  const openMin  = parseHHMM(openStr);
  const closeMin = parseHHMM(closeStr);
  if (openMin == null || closeMin == null) return false;

  const nowMin = now.getHours() * 60 + now.getMinutes();

  // Same-day window (e.g., 09:00–18:00)
  if (closeMin > openMin) {
    return nowMin >= openMin && nowMin < closeMin;
  }
  // Overnight window (e.g., 20:00–03:00 next day)
  return nowMin >= openMin || nowMin < closeMin;
}


/** Helpers */
function computeIsOpenFromHours(hours, now = new Date()) {
  if (!hours) return { isOpen: false, note: 'No hours set' };

  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const dKey = days[now.getDay()];
  const day = hours[dKey];
  if (!day || day.closed) return { isOpen: false, note: 'Closed today' };

  const parseHM = (s) => {
    if (!s || !s.includes(':')) return null;
    const [h, m] = s.split(':').map(Number);
    return { h, m };
  };

  const o = parseHM(day.open);
  const c = parseHM(day.close);
  if (!o || !c) return { isOpen: false, note: 'Invalid hours' };

  const toMinutes = (h, m) => h * 60 + m;
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const openMins = toMinutes(o.h, o.m);
  const closeMins = toMinutes(c.h, c.m);

  const isOpen = nowMins >= openMins && nowMins < closeMins;
  const note = isOpen ? `Open until ${day.close}` : `Opens ${day.open}`;
  return { isOpen, note };
}

function formatPercent(n) {
  const v = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
  return v;
}

function TrackProgressBar({ percent }) {
  const v = formatPercent(percent);
  const empty = v <= 0;
  return (
    <div className={`track-progress ${empty ? 'track-progress--empty' : ''}`}>
      <div className="track-progress__fill" style={{ width: `${v}%` }} />
    </div>
  );
}

export default function AdminDashboard() {
  const [totalTasksToday, setTotalTasksToday] = useState(0);
  const [tasksCompletedToday, setTasksCompletedToday] = useState(0);
  const [clockedInEmployees, setClockedInEmployees] = useState(0);
  const [tracksOpenNow, setTracksOpenNow] = useState(0);
  const [pendingLeaveRequests, setPendingLeaveRequests] = useState(0);
  const [avgTaskCompletion, setAvgTaskCompletion] = useState(0);
  const [announcementsToday, setAnnouncementsToday] = useState(0);
  const [lateClockIns, setLateClockIns] = useState(0);
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const displayName =
    profile?.displayName ||
    user?.displayName ||
    (user?.email ? user.email.split('@')[0] : '') ||
    'Admin';
  const photoURL = profile?.photoURL || user?.photoURL || '';

  const { byTrack, loading: loadingDuty } = useStaffOnDuty();

  const trackIds = useMemo(() => Object.keys(TRACKS), []);
  const [trackDocs, setTrackDocs] = useState({});
  const [loadingTracks, setLoadingTracks] = useState(true);

  const [trackHours, setTrackHours] = useState({});
  const [hoursLoading, setHoursLoading] = useState(false);
  const [hoursError, setHoursError] = useState(null);

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = Timestamp.fromDate(today);

    // Total Tasks Today
    const qTasks = query(collection(db, 'tasks'), where('date', '>=', todayStart));
    const unsubTasks = onSnapshot(qTasks, snap => {
      const allTasks = snap.docs.map(d => d.data());
      setTotalTasksToday(allTasks.length);

      const completed = allTasks.filter(t => t.completedBy && t.completedBy.length > 0).length;
      setTasksCompletedToday(completed);

      // Avg completion
      const avg = allTasks.length
        ? Math.round((completed / allTasks.length) * 100)
        : 0;
      setAvgTaskCompletion(avg);
    });

    // Clocked-in Employees
    const qClockedIn = query(collection(db, 'timeEntries'), where('clockOutAt', '==', null));
    const unsubClock = onSnapshot(qClockedIn, snap => {
      setClockedInEmployees(snap.size);
    });

    /* 
    // (Old nested effect moved to top-level below)
    useEffect(() => {
      // Live count of tracks that are "open now" based on trading hours
      const unsubTracks = onSnapshot(collection(db, 'tracks'), async (tracksSnap) => {
        let openCount = 0;

        await Promise.all(
          tracksSnap.docs.map(async (tDoc) => {
            let hoursData = null;
            try {
              const hoursRef = doc(db, 'tracks', tDoc.id, 'config', 'hours');
              const hoursSnap = await getDoc(hoursRef);
              if (hoursSnap.exists()) {
                hoursData = hoursSnap.data();
              } else {
                const altRef = doc(db, 'tracks', tDoc.id, 'config', 'tradingHours');
                const altSnap = await getDoc(altRef);
                if (altSnap.exists()) hoursData = altSnap.data();
              }
            } catch (e) {}

            if (isOpenNowForHours(hoursData)) openCount += 1;
          })
        );

        setTracksOpenNow(openCount);
      });

      return () => unsubTracks();
    }, []);
    */

    // Keep this effect's own cleanup only
    return () => {
      unsubTasks();
      unsubClock();
      // other subscriptions in this effect are cleaned up here if added
    };
  }, []);

  // ✅ Top-level effect: Tracks Open Now based on trading hours
  useEffect(() => {
    const unsubTracks = onSnapshot(collection(db, 'tracks'), async (tracksSnap) => {
      let openCount = 0;

      await Promise.all(
        tracksSnap.docs.map(async (tDoc) => {
          let hoursData = null;
          try {
            const hoursRef = doc(db, 'tracks', tDoc.id, 'config', 'hours');
            const hoursSnap = await getDoc(hoursRef);
            if (hoursSnap.exists()) {
              hoursData = hoursSnap.data();
            } else {
              const altRef = doc(db, 'tracks', tDoc.id, 'config', 'tradingHours');
              const altSnap = await getDoc(altRef);
              if (altSnap.exists()) hoursData = altSnap.data();
            }
          } catch (e) {
            // optional: console.warn(e);
          }

          if (isOpenNowForHours(hoursData)) openCount += 1;
        })
      );

      setTracksOpenNow(openCount);
    });

    return () => unsubTracks();
  }, []);

  // Pending Leave Requests
  useEffect(() => {
    const qLeave = query(collection(db, 'leaveRequests'), where('status', '==', 'pending'));
    const unsubLeave = onSnapshot(qLeave, snap => {
      setPendingLeaveRequests(snap.size);
    });
    return () => unsubLeave();
  }, []);

  // Announcements Today
  useEffect(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const todayStart = Timestamp.fromDate(today);
    const qAnn = query(collection(db, 'announcements'), where('createdAt', '>=', todayStart));
    const unsubAnn = onSnapshot(qAnn, snap => {
      setAnnouncementsToday(snap.size);
    });
    return () => unsubAnn();
  }, []);

  // Late Clock-ins — (example: shift start 9:00 AM)
  useEffect(() => {
    const shiftStart = new Date();
    shiftStart.setHours(9, 0, 0, 0);
    const shiftStartTS = Timestamp.fromDate(shiftStart);

    const qLate = query(
      collection(db, 'timeEntries'),
      where('clockInAt', '>=', shiftStartTS),
      where('clockOutAt', '==', null)
    );
    const unsubLate = onSnapshot(qLate, snap => {
      setLateClockIns(snap.size);
    });
    return () => unsubLate();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const results = {};
        for (const id of trackIds) {
          try {
            const fetchId = TRACKS[id]?.id || id;
            const snap = await getDoc(doc(db, 'tracks', fetchId));

            if (!snap.exists()) {
              results[id] = {
                isOpen: false,
                note: 'No track doc',
                completionPercent: 0,
              };
              continue;
            }
            const data = snap.data() || {};

            let isOpen = false;
            let note = '';
            if (typeof data.isOpen === 'boolean') {
              isOpen = data.isOpen;
              note = isOpen ? 'Open now' : 'Closed now';
            } else {
              const hours = data.openingHours || data.tradingHours || null;
              const res = computeIsOpenFromHours(hours);
              isOpen = res.isOpen;
              note = res.note;
            }

            const p =
              (data.progress && typeof data.progress.completionPercent === 'number'
                ? data.progress.completionPercent
                : data.completionPercent) ?? 0;

            results[id] = {
              isOpen,
              note,
              completionPercent: formatPercent(p),
            };
          } catch {
            results[id] = {
              isOpen: false,
              note: 'Error loading',
              completionPercent: 0,
            };
          }
        }
        if (!cancelled) {
          setTrackDocs(results);
          setLoadingTracks(false);
        }
      } catch {
        if (!cancelled) setLoadingTracks(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trackIds]);

  useEffect(() => {
    let isMounted = true;
    async function loadAllHours() {
      try {
        setHoursLoading(true);
        setHoursError(null);

        const entries = Object.values(TRACKS);
        const results = await Promise.all(
          entries.map(async (t) => {
            const raw = await fetchTrackHoursRaw(t.id);
            const normalized = normalizeWeeklyHours(raw);
            return [t.id, normalized];
          })
        );

        

        if (!isMounted) return;
        const map = {};
        results.forEach(([id, normalized]) => {
          map[id] = normalized;
        });
        setTrackHours(map);
      } catch (e) {
        if (isMounted) setHoursError(e.message || String(e));
      } finally {
        if (isMounted) setHoursLoading(false);
      }
    }
    loadAllHours();
    return () => {
      isMounted = false;
    };
  }, []);
  // ✅ Derive "Tracks Open" from normalized hours we already loaded
useEffect(() => {
  // If hours haven’t loaded yet, do nothing
  if (!trackHours || Object.keys(trackHours).length === 0) return;

  let count = 0;
  const now = new Date();

  // TRACKS map: use TRACKS[id].id as Firestore key if present
  Object.keys(TRACKS).forEach((uiKey) => {
    const firestoreKey = TRACKS[uiKey]?.id || uiKey;
    const normalized = trackHours[firestoreKey] || trackHours[uiKey];
    if (normalized && isOpenNow(normalized, now)) count += 1;
  });

  setTracksOpenNow(count);
}, [trackHours]);


  // FIX: match duty counts by id, firestore id, and case-insensitive match
  const getDutyCount = (uiKey) => {
    const firestoreKey = TRACKS[uiKey]?.id || uiKey;
    const allKeysToCheck = [
      firestoreKey,
      uiKey,
      firestoreKey?.toLowerCase(),
      uiKey?.toLowerCase()
    ];
    for (const key of allKeysToCheck) {
      if (byTrack[key]) {
        return Array.isArray(byTrack[key]) ? byTrack[key].length : 0;
      }
    }
    return 0;
  };

  return (
    <>
      <TopNav role="admin" />
      <div className="main-wrapper admin-dashboard-layout">
        <div className="glass-card welcome-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={() => navigate('/profile')}
                aria-label="Open profile"
                title="Open profile"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  borderRadius: '50%',
                  outlineOffset: 2
                }}
              >
                <Avatar src={photoURL} alt={displayName} size={36} />
              </button>
              <div>
                <h2 style={{ margin: 0 }}>Welcome, {displayName}!</h2>
                <p style={{ margin: '6px 0 0 0', opacity: 0.85 }}>This is your live owner dashboard.</p>
              </div>
            </div>
          </div>
        </div>

        <div
  className="glass-card info-bar-card"
  style={{
    width: '100%',
    flexBasis: '100%',
    gridColumn: '1 / -1',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    padding: '12px',
    fontSize: '0.85rem',
    marginTop: '10px'
  }}
>

          <div>📋 Total Tasks Today: <strong>{totalTasksToday}</strong></div>
          <div>✅ Tasks Completed: <strong>{tasksCompletedToday}</strong></div>
          <div>🕒 Clocked-in Employees: <strong>{clockedInEmployees}</strong></div>
          <div>🏁 Tracks Open: <strong>{tracksOpenNow}</strong></div>
          <div>📅 Pending Leave Requests: <strong>{pendingLeaveRequests}</strong></div>
          <div>📊 Avg Completion: <strong>{avgTaskCompletion}%</strong></div>
          <div>📢 Announcements Today: <strong>{announcementsToday}</strong></div>
          <div>⏰ Late Clock-ins: <strong>{lateClockIns}</strong></div>
        </div>

        <div className="glass-card progress-summary-card" style={{ gridColumn: '1 / -1' }}>
          <h3 style={{ marginTop: 0 }}>Tracks — Status & Progress</h3>

          {loadingTracks ? (
            <p>Loading tracks…</p>
          ) : (
            <div className="grid tracks-grid">
              {trackIds.map((id) => {
                const t = TRACKS[id];
                const meta = trackDocs[id] || { isOpen: false, note: '', completionPercent: 0 };
                const trackKey = TRACKS[id]?.id || id;
                const normalized = trackHours[trackKey];

                let statusOpen = meta.isOpen;
                let statusNote = meta.note || 'No hours set';

                if (hoursLoading) {
                  statusNote = 'Loading hours…';
                } else if (hoursError) {
                  statusNote = 'Hours error';
                } else if (normalized) {
                  statusOpen = isOpenNow(normalized, new Date());
                  statusNote = statusOpen ? 'Open now' : 'Closed now';
                }

                const openClass = statusOpen ? 'dot-open' : 'dot-closed';
                const percent = meta.completionPercent ?? 0;
                const dutyCount = loadingDuty ? '…' : getDutyCount(id);

                return (
                  <div key={id} className="track-card">
                    <div className="card track">
                      <div className="row between wrap gap12">
                        <div className="row gap12 center">
                          <span className={`dot ${openClass}`} />
                          <div className="row gap8 center">
                            <h4 className="track-name" style={{ margin: 0 }}>{t?.displayName || id}</h4>
                            <span
                              className="duty-badge"
                              title="Clocked-in staff"
                              aria-label="Clocked-in staff"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 20,
                                height: 20,
                                borderRadius: '50%',
                                fontSize: 12,
                                fontWeight: 700,
                                background: 'rgba(0,0,0,0.35)',
                                border: '1px solid rgba(255,255,255,0.12)'
                              }}
                            >
                              {dutyCount}
                            </span>
                          </div>
                        </div>
                        <span className="small muted">{statusNote}</span>
                      </div>
                      <div style={{ marginTop: 10 }}>
                        <TrackProgressBar percent={percent} />
                        <div className="row between" style={{ marginTop: 6 }}>
                          <span className="small muted">Completion</span>
                          <span className="small">{percent}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
