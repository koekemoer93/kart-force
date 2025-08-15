import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../firebase';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp
} from 'firebase/firestore';
import TopNav from '../components/TopNav';
import { useTracks } from '../hooks/useTracks';
import { ROLE_OPTIONS, ROLE_LABELS } from '../constants/roles';
import { seedTasksNow, seedTasksRange } from '../services/seeder';
import { ALL_TRACKS_TOKEN, ALL_ROLES_TOKEN } from '../services/seeder';

const FREQ_OPTIONS = ['daily', 'weekly', 'monthly'];
const WEEKDAYS = ['mon','tue','wed','thu','fri','sat','sun'];

function normalizeTemplateDoc(docSnap) {
  const d = docSnap.data() || {};
  const assignedTrack = d.assignedTrack || d.track || '';
  const frequency = d.frequency || d.period || 'daily';
  const role = String(d.role || d.assigneeRole || d.assignedToRole || 'worker').toLowerCase();
  const daysOfWeek = Array.isArray(d.daysOfWeek) ? d.daysOfWeek : [];
  return {
    id: docSnap.id,
    title: d.title || '(untitled)',
    description: d.description || '',
    assignedTrack,
    frequency,
    role,
    daysOfWeek,
    createdAt: d.createdAt || null,
    _raw: d,
  };
}

function ymd(d) {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export default function AdminTaskManager() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Tracks from Firestore (array of { id, displayName })
  const tracksList = useTracks();
  const trackOptions = useMemo(() => {
    const live = Array.isArray(tracksList)
      ? tracksList.map(t => ({ value: t.id, label: t.displayName || t.id }))
      : [];
    return [{ value: ALL_TRACKS_TOKEN, label: 'All tracks (every site)' }, ...live];
  }, [tracksList]);

  // Roles (centralized) + prepend "All roles"
  const roleOptions = useMemo(() => {
    const live = ROLE_OPTIONS.map(r => ({ value: r, label: ROLE_LABELS?.[r] ?? r }));
    return [{ value: ALL_ROLES_TOKEN, label: 'All roles' }, ...live];
  }, []);

  // Template form
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    frequency: 'daily',
    role: ALL_ROLES_TOKEN,
    assignedTrack: ALL_TRACKS_TOKEN,
    daysOfWeek: [],
  });

  useEffect(() => {
    if (!newTask.assignedTrack && trackOptions.length) {
      setNewTask(s => ({ ...s, assignedTrack: trackOptions[0].value })); // default ALL
    }
  }, [trackOptions, newTask.assignedTrack]);

  // Live templates
  useEffect(() => {
    const q = query(collection(db, 'taskTemplates'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setTemplates(snap.docs.map(normalizeTemplateDoc));
        setLoading(false);
      },
      (err) => {
        console.error('taskTemplates onSnapshot error:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const toggleDay = (dKey) => {
    setNewTask((s) => {
      const exists = s.daysOfWeek.includes(dKey);
      return {
        ...s,
        daysOfWeek: exists ? s.daysOfWeek.filter((k) => k !== dKey) : [...s.daysOfWeek, dKey],
      };
    });
  };

  // Add template
  const addTemplate = async (e) => {
    e.preventDefault();
    if (submitting) return;

    const { title, description, frequency, role, assignedTrack, daysOfWeek } = newTask;
    if (!title.trim()) return alert('Task title is required');

    if (frequency === 'weekly' && daysOfWeek.length === 0) {
      const cont = window.confirm('No weekdays selected. Continue anyway? (Defaults to Mondays)');
      if (!cont) return;
    }

    setSubmitting(true);
    try {
      await addDoc(collection(db, 'taskTemplates'), {
        title: title.trim(),
        description: description.trim(),
        frequency,
        role,            // concrete role or ALL_ROLES_TOKEN
        assignedTrack,   // track ID or ALL_TRACKS_TOKEN
        daysOfWeek,      // ["mon","wed",...]
        createdAt: serverTimestamp(),
      });

      setNewTask({
        title: '',
        description: '',
        frequency,
        role,
        assignedTrack,
        daysOfWeek: [],
      });
    } catch (err) {
      console.error('Error adding template:', err);
      alert('Error adding template. Check console for details.');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete template
  const deleteTemplate = async (id) => {
    if (!window.confirm('Delete this template?')) return;
    try {
      await deleteDoc(doc(db, 'taskTemplates', id));
    } catch (err) {
      console.error('Error deleting template:', err);
      alert('Error deleting template');
    }
  };

  // -----------------------------
  // Bulk Seeder panel (filters)
  // -----------------------------
  const todayStr = ymd(new Date());
  const [seedStart, setSeedStart] = useState(todayStr);
  const [seedEnd, setSeedEnd] = useState(todayStr);
  const [seedTrack, setSeedTrack] = useState(ALL_TRACKS_TOKEN);
  const [seedRoles, setSeedRoles] = useState([]); // empty = all roles
  const [seedFreqs, setSeedFreqs] = useState(new Set(FREQ_OPTIONS)); // default: all
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState(null);

  const toggleSeedRole = (role) => {
    setSeedRoles((prev) => {
      const exists = prev.includes(role);
      if (exists) return prev.filter((r) => r !== role);
      return [...prev, role];
    });
  };

  const toggleSeedFreq = (freq) => {
    setSeedFreqs((prev) => {
      const next = new Set(prev);
      if (next.has(freq)) next.delete(freq); else next.add(freq);
      return next;
    });
  };

  const selectAllRoles = () => setSeedRoles([...ROLE_OPTIONS]);
  const clearRoles = () => setSeedRoles([]);

  async function handleSeedSelected() {
    if (seeding) return;
    const startDate = new Date(seedStart);
    const endDate = new Date(seedEnd);
    if (isNaN(startDate) || isNaN(endDate)) return alert('Please pick valid dates.');
    if (endDate < startDate) return alert('End date must be on/after start date.');

    const includeFrequencies = Array.from(seedFreqs);
    const includeRoles = seedRoles.slice(); // empty means "all roles" in the seeder
    const includeTrack = seedTrack;

    const confirmMsg =
      `Seed tasks from templates for ${ymd(startDate)} → ${ymd(endDate)}\n` +
      `Track: ${includeTrack === ALL_TRACKS_TOKEN ? 'All tracks' : includeTrack}\n` +
      `Roles: ${includeRoles.length ? includeRoles.join(', ') : 'All roles'}\n` +
      `Frequencies: ${includeFrequencies.join(', ')}`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setSeeding(true);
      setSeedResult(null);
      const result = await seedTasksRange({
        startDate,
        endDate,
        includeRoles,
        includeFrequencies,
        includeTrack,
      });
      setSeedResult(result);
      alert(
        `Seeding complete.\n` +
        `Range: ${result.start} → ${result.end} (${result.daysProcessed} day(s))\n` +
        `Created: ${result.createdCount}\n` +
        `Skipped: ${result.skippedCount}`
      );
    } catch (e) {
      console.error('Seed error:', e);
      alert(e?.message || 'Seeding failed.');
    } finally {
      setSeeding(false);
    }
  }

  // -----------------------------

  const prettyTrack = (val) => {
    if (val === ALL_TRACKS_TOKEN) return 'All tracks';
    const item = trackOptions.find(o => o.value === val);
    return item?.label || val || '(no track)';
  };
  const prettyRole = (val) => {
    if (val === ALL_ROLES_TOKEN) return 'All roles';
    return ROLE_LABELS?.[val] ?? val;
  };

  return (
    <>
      <TopNav role="admin" />

      <div className="main-wrapper" style={{ padding: 20 }}>
        {/* Header */}
        <div className="glass-card" style={{ padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h2 style={{ margin: 0 }}>Admin Task Manager</h2>
          <button
            className="button-primary"
            onClick={async () => {
              if (seeding) return;
              if (!window.confirm('Seed tasks for TODAY (all tracks, all roles, all freqs)?')) return;
              try {
                setSeeding(true); setSeedResult(null);
                const result = await seedTasksNow({ date: new Date() });
                setSeedResult({ start: result.date, end: result.date, daysProcessed: 1, createdCount: result.createdCount, skippedCount: result.skippedCount });
                alert(`Seeded ${result.date} → Created: ${result.createdCount}, Skipped: ${result.skippedCount}`);
              } catch (e) {
                console.error(e);
                alert(e?.message || 'Seeding failed.');
              } finally {
                setSeeding(false);
              }
            }}
            disabled={seeding}
            title="Create today's tasks from all templates"
            style={{ padding: '8px 12px', borderRadius: 10, fontWeight: 700 }}
          >
            {seeding ? 'Seeding…' : 'Seed Today (All)'}
          </button>
        </div>

        {/* Bulk Seeder Panel */}
        <div className="glass-card" style={{ padding: 20, marginTop: 16, marginBottom: 30 }}>
          <h3 style={{ marginTop: 0 }}>Bulk Seed — Filters</h3>

          <div className="row gap12 wrap" style={{ marginBottom: 12 }}>
            <div>
              <div className="small muted">Start date</div>
              <input type="date" className="input-field" value={seedStart} onChange={(e) => setSeedStart(e.target.value)} />
            </div>
            <div>
              <div className="small muted">End date</div>
              <input type="date" className="input-field" value={seedEnd} onChange={(e) => setSeedEnd(e.target.value)} />
            </div>
            <div style={{ minWidth: 220 }}>
              <div className="small muted">Track</div>
              <select className="input-field" value={seedTrack} onChange={(e) => setSeedTrack(e.target.value)}>
                {trackOptions.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="row gap12 wrap" style={{ alignItems: 'flex-start' }}>
            <div style={{ minWidth: 240 }}>
              <div className="small muted" style={{ marginBottom: 6 }}>Roles (multi)</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 8 }}>
                {ROLE_OPTIONS.map((r) => {
                  const checked = seedRoles.includes(r);
                  return (
                    <label key={r} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSeedRole(r)}
                      />
                      <span>{ROLE_LABELS?.[r] ?? r}</span>
                    </label>
                  );
                })}
              </div>
              <div className="row" style={{ gap: 8, marginTop: 8 }}>
                <button type="button" className="btn" onClick={selectAllRoles} style={{ padding: '6px 10px', borderRadius: 8 }}>Select all</button>
                <button type="button" className="btn" onClick={clearRoles} style={{ padding: '6px 10px', borderRadius: 8 }}>Clear</button>
              </div>
              <div className="small muted" style={{ marginTop: 6 }}>Leave empty = all roles.</div>
            </div>

            <div style={{ minWidth: 220 }}>
              <div className="small muted" style={{ marginBottom: 6 }}>Frequencies</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8 }}>
                {FREQ_OPTIONS.map((f) => {
                  const checked = seedFreqs.has(f);
                  return (
                    <label key={f} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSeedFreq(f)}
                      />
                      <span style={{ textTransform: 'capitalize' }}>{f}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <button
            className="button-primary"
            onClick={handleSeedSelected}
            disabled={seeding}
            style={{ marginTop: 16, padding: '10px 14px', borderRadius: 10, fontWeight: 700 }}
          >
            {seeding ? 'Seeding…' : 'Seed Selected (Range)'}
          </button>

          {seedResult ? (
            <div className="small muted" style={{ marginTop: 12 }}>
              Seeded {seedResult.start} → {seedResult.end} ({seedResult.daysProcessed} day/s). Created {seedResult.createdCount}, Skipped {seedResult.skippedCount}.
            </div>
          ) : null}
        </div>

        {/* Add template */}
        <form onSubmit={addTemplate} className="glass-card" style={{ padding: 20, marginBottom: 30 }}>
          <h3 style={{ marginTop: 0 }}>Add New Task Template</h3>

          <input
            className="input-field"
            placeholder="Task title"
            value={newTask.title}
            onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
          />

          <textarea
            className="input-field"
            placeholder="Description"
            value={newTask.description}
            onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
          />

          <div className="row gap12 wrap">
            <select
              className="input-field"
              value={newTask.frequency}
              onChange={(e) => setNewTask({ ...newTask, frequency: e.target.value })}
              title="How often should this task repeat?"
            >
              {FREQ_OPTIONS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>

            <select
              className="input-field"
              value={newTask.role}
              onChange={(e) => setNewTask({ ...newTask, role: e.target.value })}
              title="Role responsible"
            >
              {roleOptions.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>

            <select
              className="input-field"
              value={newTask.assignedTrack}
              onChange={(e) => setNewTask({ ...newTask, assignedTrack: e.target.value })}
              title="Track (Firestore doc ID)"
            >
              {trackOptions.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Weekday picker (for weekly) */}
          <div style={{ marginTop: 8 }}>
            <div className="small muted" style={{ marginBottom: 6 }}>
              Select specific weekdays (optional for weekly)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(92px,1fr))', gap: 8 }}>
              {WEEKDAYS.map((d) => {
                const active = newTask.daysOfWeek.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    className="weekday-chip"
                    aria-pressed={active}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: '1px solid rgba(255,255,255,0.12)',
                      background: active ? 'rgba(36,255,152,0.15)' : 'rgba(0,0,0,0.25)',
                      fontWeight: 600
                    }}
                  >
                    {d.toUpperCase()}
                  </button>
                );
              })}
            </div>
            <div className="small muted" style={{ marginTop: 6 }}>
              Stored as <code>daysOfWeek: ["mon","wed",...]</code>. If none selected, weekly seeds on Mondays by default.
            </div>
          </div>

          <button className="button-primary" type="submit" disabled={submitting} style={{ marginTop: 12 }}>
            {submitting ? 'Adding…' : 'Add Template'}
          </button>
        </form>

        {/* Templates list */}
        <div className="glass-card" style={{ padding: 20 }}>
          <h3 style={{ marginTop: 0 }}>Existing Templates</h3>
          {loading ? (
            <p>Loading...</p>
          ) : templates.length === 0 ? (
            <p>No templates yet.</p>
          ) : (
            <ul style={{ paddingLeft: 16 }}>
              {templates.map((t) => (
                <li key={t.id} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                    <div>
                      <strong>{t.title}</strong>
                      <div className="small muted">
                        {t.frequency}, {prettyRole(t.role)}, {prettyTrack(t.assignedTrack)}
                        {t.daysOfWeek?.length ? (
                          <> — days: {t.daysOfWeek.map(d => d.toUpperCase()).join(', ')}</>
                        ) : null}
                      </div>
                    </div>
                    <button onClick={() => deleteTemplate(t.id)}>Delete</button>
                  </div>
                  {t.description && <div className="small" style={{ opacity: 0.9 }}>{t.description}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Seed result tiny debug */}
        {seedResult ? (
          <div className="glass-card" style={{ padding: 16, marginTop: 12 }}>
            <div className="small muted">
              Seeded {seedResult.start} → {seedResult.end} ({seedResult.daysProcessed} day/s). Created {seedResult.createdCount}, Skipped {seedResult.skippedCount}.
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
