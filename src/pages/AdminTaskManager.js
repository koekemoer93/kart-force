// src/pages/AdminTaskManager.js
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
import { seedTasksNow } from '../services/seeder'; // ✅ Seed action brought here

const FREQ_OPTIONS = ['daily', 'weekly', 'monthly'];
const WEEKDAYS = ['mon','tue','wed','thu','fri','sat','sun'];

// ✅ Special tokens (must match services/seeder + the values used when saving)
const ALL_TRACKS_TOKEN = '__all_tracks__';
const ALL_ROLES_TOKEN  = '__all_roles__';

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

export default function AdminTaskManager() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // 🔥 Seed state
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState(null);

  // 🔥 Tracks from Firestore (array of { id, displayName })
  const tracksList = useTracks();
  const trackOptions = useMemo(() => {
    const live = Array.isArray(tracksList)
      ? tracksList.map(t => ({ value: t.id, label: t.displayName || t.id }))
      : [];
    // Prepend “All tracks”
    return [{ value: ALL_TRACKS_TOKEN, label: 'All tracks (every site)' }, ...live];
  }, [tracksList]);

  // Roles (centralized) + prepend “All roles”
  const roleOptions = useMemo(() => {
    const live = ROLE_OPTIONS.map(r => ({ value: r, label: ROLE_LABELS?.[r] ?? r }));
    return [{ value: ALL_ROLES_TOKEN, label: 'All roles' }, ...live];
  }, []);

  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    frequency: 'daily',
    role: ALL_ROLES_TOKEN,
    assignedTrack: ALL_TRACKS_TOKEN,
    daysOfWeek: [],
  });

  // Pick a default concrete track once options arrive (if user moves away from “All”)
  useEffect(() => {
    if (!newTask.assignedTrack && trackOptions.length) {
      setNewTask(s => ({ ...s, assignedTrack: trackOptions[0].value })); // ALL by default
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
      const cont = window.confirm('No weekdays selected. Continue anyway?');
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

      // Clear form (keep last selections for speed)
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

  // 🔥 Seed today (no duplicates, respects daysOfWeek, expands ALL_* tokens)
  async function handleSeedToday() {
    if (seeding) return;
    const ok = window.confirm('Seed tasks for TODAY from all templates?');
    if (!ok) return;
    try {
      setSeeding(true);
      setSeedResult(null);
      const result = await seedTasksNow({ date: new Date() });
      setSeedResult(result);
      alert(`Seeding complete for ${result.date}.\nCreated: ${result.createdCount}\nSkipped: ${result.skippedCount}`);
    } catch (e) {
      console.error('Seed error:', e);
      alert(e?.message || 'Seeding failed.');
    } finally {
      setSeeding(false);
    }
  }

  // Helper: pretty labels for list view
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
        {/* Header row with Seed button */}
        <div className="glass-card" style={{ padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h2 style={{ margin: 0 }}>Admin Task Manager</h2>
          <button
            className="button-primary"
            onClick={handleSeedToday}
            disabled={seeding}
            title="Create today's tasks from all templates"
            style={{ padding: '8px 12px', borderRadius: 10, fontWeight: 700 }}
          >
            {seeding ? 'Seeding…' : 'Seed Today'}
          </button>
        </div>

        {/* Add form */}
        <form onSubmit={addTemplate} className="glass-card" style={{ padding: 20, marginTop: 16, marginBottom: 30 }}>
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

          {/* Weekday picker (optional, useful for weekly frequency) */}
          <div style={{ marginTop: 8 }}>
            <div className="small muted" style={{ marginBottom: 6 }}>
              Select specific weekdays (optional)
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
              Stored as <code>daysOfWeek: ["mon","wed",...]</code>. Seeder respects this.
            </div>
          </div>

          <button className="button-primary" type="submit" disabled={submitting} style={{ marginTop: 12 }}>
            {submitting ? 'Adding…' : 'Add Template'}
          </button>
        </form>

        {/* List */}
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

        {/* Seed result (optional tiny debug) */}
        {seedResult ? (
          <div className="glass-card" style={{ padding: 16, marginTop: 12 }}>
            <div className="small muted">
              Seeded for {seedResult.date}: created {seedResult.createdCount}, skipped {seedResult.skippedCount}.
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
