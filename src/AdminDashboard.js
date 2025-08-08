// src/AdminDashboard.js
import React, { useEffect, useMemo, useState } from 'react';
import TopNav from './components/TopNav';
import { useStaffOnDuty } from './hooks/useStaffOnDuty';
import TRACKS from './constants/tracks';
import { db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
import { fetchTrackHoursRaw } from './services/tracks';
import { normalizeWeeklyHours, isOpenNow } from './utils/hours';

/**
 * NOTE: This file is a full drop-in replacement.
 *
 * ✅ What changed (as requested):
 * 1) REMOVED the entire "Staff on Duty (Live)" column/card.
 * 2) ADDED a tiny circular badge next to each track name showing the number of
 *    clocked-in staff for that track (uses useStaffOnDuty live data).
 * 3) UPDATED "Tracks — Status & Progress" to span full width (forces grid span).
 * 4) PRESERVED hours logic (field /tracks/{id}.hours with fallback to /config/hours),
 *    progress bars, and the dark glassy style.
 *
 * No external CSS refactor; minimal inline styling for the tiny badge and grid span.
 */

/**
 * Helpers: compute "open now" from hours (legacy compatibility)
 * Supports BOTH:
 *  - openingHours (your SeedHours.js writes this)
 *  - tradingHours (legacy shape)
 *
 * Firestore shape per day:
 * { open: "HH:MM", close: "HH:MM", closed?: boolean }
 */
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
  const { byTrack, loading: loadingDuty } = useStaffOnDuty();
  const trackIds = useMemo(() => Object.keys(TRACKS), []);
  const [trackDocs, setTrackDocs] = useState({}); // { [trackId]: { isOpen, note, completionPercent } }
  const [loadingTracks, setLoadingTracks] = useState(true);

  // Normalized hours loaded from /tracks/{id}.hours (FIELD) with fallback to /tracks/{id}/config/hours
  const [trackHours, setTrackHours] = useState({}); // { [trackIdOrFirestoreId]: normalizedArrayOrNull }
  const [hoursLoading, setHoursLoading] = useState(false);
  const [hoursError, setHoursError] = useState(null);

  // Fetch each track doc once (keeps your Firestore schema flexible)
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

            // Determine open/closed with sensible priority:
            // 1) explicit isOpen boolean (if you set it via a toggle)
            // 2) openingHours (SeedHours.js) OR tradingHours (legacy)
            // 3) default false
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
    return () => {
      cancelled = true;
    };
  }, [trackIds]);

  // Load hours for every track on mount (FIELD hours with fallback to /config/hours)
  useEffect(() => {
    let isMounted = true;
    async function loadAllHours() {
      try {
        setHoursLoading(true);
        setHoursError(null);

        const entries = Object.values(TRACKS); // [{id, displayName, ...}, ...]
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
        {/* Welcome card (kept) */}
        <div className="glass-card welcome-card">
          <h2 style={{ marginTop: 0 }}>Welcome, Admin!</h2>
          <p className="muted" style={{ marginBottom: 0 }}>
            This is your live owner dashboard.
          </p>
        </div>

        {/* ================================================
            REMOVED: Staff on Duty (Live) right column/card
            ================================================ */}

        {/* Tracks — Status & Progress (FULL WIDTH) */}
        <div
          className="glass-card progress-summary-card"
          // Force full-width span regardless of parent grid template
          style={{ gridColumn: '1 / -1' }}
        >
          <h3 style={{ marginTop: 0 }}>Tracks — Status & Progress</h3>

          {loadingTracks ? (
            <p>Loading tracks…</p>
          ) : (
            <div className="grid tracks-grid">
              {trackIds.map((id) => {
                const t = TRACKS[id];

                // meta from your existing Firestore doc fetch (fallback if hours missing)
                const meta = trackDocs[id] || {
                  isOpen: false,
                  note: '',
                  completionPercent: 0,
                };

                // Map the UI key -> Firestore doc id used when we loaded hours
                const trackKey = TRACKS[id]?.id || id;

                // Prefer normalized hours we fetched (field hours -> fallback /config/hours)
                const normalized = trackHours[trackKey];

                // Build final status, preferring normalized hours. Fallback to meta.
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

                // NEW: live clocked-in count (uses both keys to be safe)
                const dutyCount = loadingDuty ? '…' : getDutyCount(id);

                return (
                  <div key={id} className="track-card">
                    <div className="card track">
                      <div className="row between wrap gap12">
                        <div className="row gap12 center">
                          <span className={`dot ${openClass}`} />
                          {/* Track name + tiny circular duty badge */}
                          <div className="row gap8 center">
                            <h4 className="track-name" style={{ margin: 0 }}>
                              {t?.displayName || id}
                            </h4>
                            <span
                              className="duty-badge"
                              title="Clocked-in staff"
                              aria-label="Clocked-in staff"
                      
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
