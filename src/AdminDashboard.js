// src/AdminDashboard.js
import React, { useEffect, useMemo, useState } from 'react';
import TopNav from './components/TopNav';
import { useStaffOnDuty } from './hooks/useStaffOnDuty';
import TRACKS from './constants/tracks';
import { db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';

// ---- Helpers: compute "open now" from trading hours ----
// Expected structure in Firestore (tracks/{trackId}):
// {
//   isOpen?: boolean,                         // optional: immediate override
//   completionPercent?: number,               // optional: for progress bars
//   progress?: { completionPercent?: number}, // optional legacy shape
//   tradingHours?: {
//     mon: { open: "09:00", close: "21:00", closed?: boolean },
//     tue: { ... }, wed: { ... }, thu: { ... }, fri: { ... }, sat: { ... }, sun: { ... }
//   }
// }
function computeIsOpenFromHours(tradingHours, now = new Date()) {
  if (!tradingHours) return { isOpen: false, note: 'No hours set' };

  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const dKey = days[now.getDay()];
  const day = tradingHours[dKey];
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
      <div
        className="track-progress__fill"
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

export default function AdminDashboard() {
  const { byTrack, loading: loadingDuty } = useStaffOnDuty();
  const trackIds = useMemo(() => Object.keys(TRACKS), []);
  const [trackDocs, setTrackDocs] = useState({}); // { [trackId]: { isOpen, note, completionPercent } }
  const [loadingTracks, setLoadingTracks] = useState(true);

  // Fetch each track doc once (keeps your Firestore schema flexible)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const results = {};
        for (const id of trackIds) {
          try {
            const snap = await getDoc(doc(db, 'tracks', id));
            if (!snap.exists()) {
              results[id] = {
                isOpen: false,
                note: 'No track doc',
                completionPercent: 0,
              };
              continue;
            }
            const data = snap.data() || {};

            // Determine open/closed with sensible priority:
            // 1) explicit isOpen boolean (if you set it via a toggle)
            // 2) compute from tradingHours
            // 3) default false
            let isOpen = false;
            let note = '';
            if (typeof data.isOpen === 'boolean') {
              isOpen = data.isOpen;
              note = isOpen ? 'Open now' : 'Closed now';
            } else {
              const res = computeIsOpenFromHours(data.tradingHours);
              isOpen = res.isOpen;
              note = res.note;
            }

            // Read progress percent (multiple shapes supported)
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
    return () => { cancelled = true; };
  }, [trackIds]);

  return (
    <>
      <TopNav role="admin" />
      <div className="main-wrapper admin-dashboard-layout">
        {/* Welcome card (left) */}
        <div className="glass-card welcome-card">
          <h2 style={{ marginTop: 0 }}>Welcome, Admin!</h2>
          <p className="muted" style={{ marginBottom: 0 }}>
            This is your live owner dashboard.
          </p>
        </div>

        {/* Staff on Duty (right) */}
        <div className="glass-card team-overview-card">
          <h3 style={{ marginTop: 0 }}>Staff on Duty (Live)</h3>
          {loadingDuty ? (
            <p>Loading…</p>
          ) : (
            <>
              {trackIds.map((key) => {
                const list = byTrack[key] || [];
                return (
                  <div key={key} className="card-inner" style={{ marginBottom: 12 }}>
                    <p style={{ fontWeight: 600, margin: 0 }}>
                      {TRACKS[key]?.displayName || key} — {list.length} on duty
                    </p>
                    {list.length > 0 ? (
                      <ul style={{ marginTop: 6, opacity: 0.9 }}>
                        {list.map((u) => (
                          <li key={u.id} style={{ marginLeft: 16, listStyle: 'disc' }}>
                            {u.name || u.email || u.id}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p style={{ fontSize: 13, color: '#aaa', marginLeft: 16, marginTop: 6 }}>
                        No staff clocked in
                      </p>
                    )}
                  </div>
                );
              })}

              {/* Unexpected tracks present in Firestore but not in TRACKS.js */}
              {Object.keys(byTrack)
                .filter((k) => !trackIds.includes(k))
                .map((k) => (
                  <div key={k} className="card-inner" style={{ marginBottom: 12 }}>
                    <p style={{ fontWeight: 600, margin: 0 }}>
                      {k} — {byTrack[k].length} on duty
                    </p>
                    <ul style={{ marginTop: 6, opacity: 0.9 }}>
                      {byTrack[k].map((u) => (
                        <li key={u.id} style={{ marginLeft: 16, listStyle: 'disc' }}>
                          {u.name || u.email || u.id}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </>
          )}
        </div>

        {/* Track status + progress (full width under) */}
        <div className="glass-card progress-summary-card">
          <h3 style={{ marginTop: 0 }}>Tracks — Status & Progress</h3>

          {loadingTracks ? (
            <p>Loading tracks…</p>
          ) : (
            <div className="grid tracks-grid">
              {trackIds.map((id) => {
                const t = TRACKS[id];
                const meta = trackDocs[id] || { isOpen: false, note: '', completionPercent: 0 };
                const openClass = meta.isOpen ? 'dot-open' : 'dot-closed';
                const percent = meta.completionPercent ?? 0;

                return (
                  <div key={id} className="track-card">
                    <div className="card track">
                      <div className="row between wrap gap12">
                        <div className="row gap12 center">
                          <span className={`dot ${openClass}`} />
                          <h4 className="track-name">{t?.displayName || id}</h4>
                        </div>
                        <span className="small muted">{meta.note}</span>
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
