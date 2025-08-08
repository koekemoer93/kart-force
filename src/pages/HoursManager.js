// src/pages/HoursManager.js
import React, { useEffect, useState } from 'react';
import TopNav from '../components/TopNav';
import TRACKS from '../constants/tracks';
import HoursEditor from '../components/HoursEditor';
import { emptyWeek, getOpeningHours, saveOpeningHours, isValidHM } from '../services/tracks';
import { useAuth } from '../AuthContext';

export default function HoursManager() {
  const { userData } = useAuth();
  const isAdmin = userData?.role === 'admin';

  const trackKeys = Object.keys(TRACKS);
  const [hoursMap, setHoursMap] = useState({}); // { [trackKey]: hours }
  const [busy, setBusy] = useState({});         // { [trackKey]: bool }
  const [status, setStatus] = useState({});     // { [trackKey]: string }

  // Load openingHours for all tracks
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = {};
      for (const key of trackKeys) {
        const docId = TRACKS[key]?.id || key;
        try {
          const h = await getOpeningHours(docId);
          next[key] = h || emptyWeek();
        } catch {
          next[key] = emptyWeek();
        }
      }
      if (!cancelled) setHoursMap(next);
    })();
    return () => { cancelled = true; };
  }, [trackKeys]);

  function setTrackHours(key, hours) {
    setHoursMap((prev) => ({ ...prev, [key]: hours }));
  }

  function validateWeek(hours) {
    // Allow closed days; if open, require HH:MM & open < close
    const order = ['mon','tue','wed','thu','fri','sat','sun'];
    for (const d of order) {
      const day = hours[d];
      if (!day || day.closed) continue;
      if (!isValidHM(day.open) || !isValidHM(day.close)) return false;
      const [oh, om] = day.open.split(':').map(Number);
      const [ch, cm] = day.close.split(':').map(Number);
      const openM = oh*60+om, closeM = ch*60+cm;
      if (!(openM < closeM)) return false;
    }
    return true;
  }

  async function saveOne(key) {
    if (!isAdmin) return alert('Admins only.');
    const docId = TRACKS[key]?.id || key;
    const hours = hoursMap[key];
    if (!validateWeek(hours)) return alert('Fix invalid times (HH:MM, open < close)');

    try {
      setBusy((b) => ({ ...b, [key]: true }));
      await saveOpeningHours(docId, hours);
      setStatus((s) => ({ ...s, [key]: 'Saved ✓' }));
      setTimeout(() => setStatus((s) => ({ ...s, [key]: '' })), 1500);
    } catch (e) {
      console.error(e);
      setStatus((s) => ({ ...s, [key]: 'Save failed' }));
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  }

  return (
    <>
      <TopNav role="admin" />
      <div className="main-wrapper admin-dashboard-layout">
        <div className="glass-card" style={{ gridColumn: '1 / -1' }}>
          <h3 style={{ marginTop: 0 }}>Trading Hours — All Tracks</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Edit opening/closing times. Closed days require only the checkbox. Changes save to
            <code> tracks/&lt;trackId&gt;.openingHours</code>.
          </p>
        </div>

        {trackKeys.map((key) => {
          const t = TRACKS[key];
          const hours = hoursMap[key];
          if (!hours) return null;
          return (
            <div key={key} className="glass-card">
              <div className="row between wrap">
                <h3 style={{ margin: 0 }}>{t.displayName || key}</h3>
                <div className="row gap12">
                  <button
                    className="button-primary"
                    disabled={!!busy[key]}
                    onClick={() => saveOne(key)}
                    style={{ width: 160 }}
                  >
                    {busy[key] ? 'Saving…' : 'Save'}
                  </button>
                  <span className="small muted" aria-live="polite">{status[key] || ''}</span>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <HoursEditor value={hours} onChange={(h) => setTrackHours(key, h)} />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
