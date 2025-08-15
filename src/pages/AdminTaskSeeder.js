import React, { useEffect, useMemo, useState } from 'react';
import TopNav from '../components/TopNav';
import { useTracks } from '../hooks/useTracks';
import { ROLE_OPTIONS, ROLE_LABELS } from '../constants/roles';
import { seedTasksRange, ALL_TRACKS_TOKEN, ALL_ROLES_TOKEN } from '../services/seeder';

function ymd(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
function startOfWeek(d = new Date()) {
  const x = new Date(d);
  const day = x.getDay(); // 0=Sun..6=Sat
  const diff = (day + 6) % 7; // make Monday the start
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfWeek(d = new Date()) {
  const s = startOfWeek(d);
  const e = new Date(s);
  e.setDate(s.getDate() + 6);
  e.setHours(0, 0, 0, 0);
  return e;
}
function startOfMonth(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfMonth(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  x.setHours(0, 0, 0, 0);
  return x;
}

const FREQ_OPTIONS = ['daily', 'weekly', 'monthly'];

export default function AdminTaskSeeder() {
  const tracks = useTracks(); // [{id, displayName}]
  const trackOptions = useMemo(() => {
    const live = Array.isArray(tracks) ? tracks.map(t => ({ value: t.id, label: t.displayName || t.id })) : [];
    return [{ value: ALL_TRACKS_TOKEN, label: 'All tracks (every site)' }, ...live];
  }, [tracks]);

  const today = ymd(new Date());
  const [seedStart, setSeedStart] = useState(today);
  const [seedEnd, setSeedEnd] = useState(today);
  const [seedTrack, setSeedTrack] = useState(ALL_TRACKS_TOKEN);

  const [seedRoles, setSeedRoles] = useState([]); // empty = all roles
  const [seedFreqs, setSeedFreqs] = useState(new Set(FREQ_OPTIONS)); // all by default

  const [seeding, setSeeding] = useState(false);
  const [result, setResult] = useState(null);

  // actions
  const toggleRole = (r) => {
    setSeedRoles(prev => (prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]));
  };
  const toggleFreq = (f) => {
    setSeedFreqs(prev => {
      const next = new Set(prev);
      next.has(f) ? next.delete(f) : next.add(f);
      return next;
    });
  };
  const selectAllRoles = () => setSeedRoles([...ROLE_OPTIONS]);
  const clearRoles = () => setSeedRoles([]);

  // presets
  const applyToday = () => {
    const d = new Date();
    setSeedStart(ymd(d));
    setSeedEnd(ymd(d));
  };
  const applyThisWeek = () => {
    setSeedStart(ymd(startOfWeek(new Date())));
    setSeedEnd(ymd(endOfWeek(new Date())));
  };
  const applyNextWeek = () => {
    const n = new Date();
    n.setDate(n.getDate() + 7);
    setSeedStart(ymd(startOfWeek(n)));
    setSeedEnd(ymd(endOfWeek(n)));
  };
  const applyThisMonth = () => {
    setSeedStart(ymd(startOfMonth(new Date())));
    setSeedEnd(ymd(endOfMonth(new Date())));
  };

  const handleSeed = async () => {
    if (seeding) return;
    const startDate = new Date(seedStart);
    const endDate = new Date(seedEnd);
    if (isNaN(startDate) || isNaN(endDate)) return alert('Pick valid dates.');
    if (endDate < startDate) return alert('End date must be on/after start date.');

    const includeFrequencies = Array.from(seedFreqs);
    const includeRoles = seedRoles.slice(); // empty means “all” in service
    const includeTrack = seedTrack;

    const msg =
      `Seed ${ymd(startDate)} → ${ymd(endDate)}\n` +
      `Track: ${includeTrack === ALL_TRACKS_TOKEN ? 'All tracks' : includeTrack}\n` +
      `Roles: ${includeRoles.length ? includeRoles.join(', ') : 'All roles'}\n` +
      `Frequencies: ${includeFrequencies.join(', ')}`;
    if (!window.confirm(msg)) return;

    try {
      setSeeding(true);
      setResult(null);
      const res = await seedTasksRange({
        startDate,
        endDate,
        includeRoles,
        includeFrequencies,
        includeTrack,
      });
      setResult(res);
      alert(
        `Seeding complete.\n` +
        `Range: ${res.start} → ${res.end} (${res.daysProcessed} day/s)\n` +
        `Created: ${res.createdCount}\n` +
        `Skipped: ${res.skippedCount}`
      );
    } catch (e) {
      console.error(e);
      alert(e?.message || 'Seeding failed.');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <>
      <TopNav role="admin" />
      <div className="main-wrapper" style={{ padding: 20, display: 'flex', justifyContent: 'center' }}>
        <div className="glass-card" style={{ width: '100%', maxWidth: 900, padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <h2 style={{ margin: 0 }}>Admin Task Seeder</h2>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button className="btn" onClick={applyToday}>Today</button>
              <button className="btn" onClick={applyThisWeek}>This Week</button>
              <button className="btn" onClick={applyNextWeek}>Next Week</button>
              <button className="btn" onClick={applyThisMonth}>This Month</button>
            </div>
          </div>

          {/* Date range + Track */}
          <div className="glass-card" style={{ marginTop: 14, padding: 16 }}>
            <div className="row gap12 wrap" style={{ alignItems: 'flex-end' }}>
              <div>
                <div className="small muted">Start date</div>
                <input type="date" className="input-field" value={seedStart} onChange={(e) => setSeedStart(e.target.value)} />
              </div>
              <div>
                <div className="small muted">End date</div>
                <input type="date" className="input-field" value={seedEnd} onChange={(e) => setSeedEnd(e.target.value)} />
              </div>
              <div style={{ minWidth: 260 }}>
                <div className="small muted">Track</div>
                <select className="input-field" value={seedTrack} onChange={(e) => setSeedTrack(e.target.value)}>
                  {trackOptions.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Roles + Frequencies */}
          <div className="glass-card" style={{ marginTop: 14, padding: 16 }}>
            <div className="row gap12 wrap" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 320 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <h4 style={{ margin: '0 0 8px 0' }}>Roles (multi)</h4>
                  <div className="row" style={{ gap: 8 }}>
                    <button className="btn" onClick={selectAllRoles}>Select all</button>
                    <button className="btn" onClick={clearRoles}>Clear</button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 8 }}>
                  {ROLE_OPTIONS.map((r) => {
                    const checked = seedRoles.includes(r);
                    return (
                      <label key={r} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)' }}>
                        <input type="checkbox" checked={checked} onChange={() => toggleRole(r)} />
                        <span>{ROLE_LABELS?.[r] ?? r}</span>
                      </label>
                    );
                  })}
                </div>
                <div className="small muted" style={{ marginTop: 6 }}>
                  Leave empty = all roles.
                </div>
              </div>

              <div style={{ width: 280 }}>
                <h4 style={{ margin: '0 0 8px 0' }}>Frequencies</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8 }}>
                  {FREQ_OPTIONS.map((f) => {
                    const checked = seedFreqs.has(f);
                    return (
                      <label key={f} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)' }}>
                        <input type="checkbox" checked={checked} onChange={() => toggleFreq(f)} />
                        <span style={{ textTransform: 'capitalize' }}>{f}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Action */}
          <div className="row" style={{ marginTop: 16, gap: 10, alignItems: 'center' }}>
            <button
              className="button-primary"
              onClick={handleSeed}
              disabled={seeding}
              style={{ padding: '10px 14px', borderRadius: 10, fontWeight: 700 }}
            >
              {seeding ? 'Seeding…' : 'Seed Tasks'}
            </button>
            <div className="small muted">No duplicates will be created. Weekly/monthly rules respected.</div>
          </div>

          {/* Result */}
          {result && (
            <div className="glass-card" style={{ padding: 14, marginTop: 12 }}>
              <div className="small muted">
                Seeded <b>{result.start}</b> → <b>{result.end}</b> ({result.daysProcessed} day/s).
                &nbsp;Created <b>{result.createdCount}</b>, Skipped <b>{result.skippedCount}</b>.
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
