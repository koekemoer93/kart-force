// src/AdminDashboard.js
import React, { useEffect, useMemo, useState } from 'react';
import TopNav from './components/TopNav';
import { useStaffOnDuty } from './hooks/useStaffOnDuty';
import TRACKS from './constants/tracks';
import { db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
import { fetchTrackHoursRaw } from './services/tracks';
import { normalizeWeeklyHours, isOpenNow } from './utils/hours';
import { useAuth } from './AuthContext';
import Avatar from './components/Avatar';
import { useNavigate } from 'react-router-dom';


/**
 * Full drop-in replacement.
 * - Welcome card now shows user display name + avatar
 * - Staff-on-duty middle column removed (you asked earlier)
 * - Tiny duty count badge on each track card
 * - Hours/progress logic preserved
 */

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
  // Auth (for welcome card)
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const displayName =
    profile?.displayName ||
    user?.displayName ||
    (user?.email ? user.email.split('@')[0] : '') ||
    'Admin';
  const photoURL = profile?.photoURL || user?.photoURL || '';

  // Staff on duty (live)
  const { byTrack, loading: loadingDuty } = useStaffOnDuty();

  const trackIds = useMemo(() => Object.keys(TRACKS), []);
  const [trackDocs, setTrackDocs] = useState({});
  const [loadingTracks, setLoadingTracks] = useState(true);

  // Normalized hours loaded from /tracks/{id}.hours (FIELD) with fallback to /tracks/{id}/config/hours
  const [trackHours, setTrackHours] = useState({});
  const [hoursLoading, setHoursLoading] = useState(false);
  const [hoursError, setHoursError] = useState(null);

  // Fetch each track doc once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const results = {};
        for (const id of trackIds) {
          try {
            const fetchId = TRACKS[id]?.id || id; // use Firestore doc id if provided
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

            // Determine open/closed:
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

            // Read progress percent
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

  // Load hours (field -> fallback /config/hours)
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

  // Convenience: count staff for a given track using both the UI key and the Firestore id
  const getDutyCount = (uiKey) => {
    const firestoreKey = TRACKS[uiKey]?.id || uiKey;
    const list = byTrack[firestoreKey] || byTrack[uiKey] || [];
    return Array.isArray(list) ? list.length : 0;
  };

  return (
    <>
      <TopNav role="admin" />
      <div className="main-wrapper admin-dashboard-layout">
        {/* Welcome card with avatar + name */}
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

        {/* Tracks — Status & Progress (FULL WIDTH) */}
        <div
          className="glass-card progress-summary-card"
          style={{ gridColumn: '1 / -1' }}
        >
          <h3 style={{ marginTop: 0 }}>Tracks — Status & Progress</h3>

          {loadingTracks ? (
            <p>Loading tracks…</p>
          ) : (
            <div className="grid tracks-grid">
              {trackIds.map((id) => {
                const t = TRACKS[id];

                const meta = trackDocs[id] || {
                  isOpen: false,
                  note: '',
                  completionPercent: 0,
                };

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
                          {/* Track name + tiny duty badge */}
                          <div className="row gap8 center">
                            <h4 className="track-name" style={{ margin: 0 }}>
                              {t?.displayName || id}
                            </h4>
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

function getTodayHoursString(normalized, now = new Date()) {
  // normalized is the array from normalizeWeeklyHours()
  try {
    const dayIdx = now.getDay(); // 0=Sun
    const today = normalized?.[dayIdx] || [];
    if (!Array.isArray(today) || today.length === 0) return 'Closed today';

    const parts = today.map(w => {
      const s = w.start?.slice(0, 5) || '';
      const e = w.end?.slice(0, 5) || '';
      return `${s}–${e}`;
    });
    return parts.join(', ');
  } catch {
    return '';
  }
}

function getNextChangeNote(normalized, now = new Date()) {
  // Returns "Closes at HH:MM" or "Opens at HH:MM" or ''
  try {
    const dayIdx = now.getDay();
    const tNow = now.toTimeString().slice(0, 5);

    const today = normalized?.[dayIdx] || [];
    const toMinutes = (hhmm) => {
      const [h, m] = hhmm.split(':').map(Number);
      return h * 60 + m;
    };
    const nowMin = toMinutes(tNow);

    // Use your existing isOpenNow util
    const open = isOpenNow(normalized, now);

    if (open) {
      // find current window end
      const current = today.find(w => toMinutes(w.start) <= nowMin && nowMin < toMinutes(w.end));
      if (!current) return '';
      return `Closes at ${current.end.slice(0, 5)}`;
    } else {
      // find first future window today
      const next = today.find(w => nowMin < toMinutes(w.start));
      if (next) return `Opens at ${next.start.slice(0, 5)}`;
      return ''; // (could extend logic to tomorrow if needed)
    }
  } catch {
    return '';
  }
}


              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
