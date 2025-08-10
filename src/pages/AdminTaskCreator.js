import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import {
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
} from 'firebase/firestore';
import './AdminTaskCreator.css';

const ROLES = ['marshall', 'workshopManager', 'mechanic', 'reception', 'hrfinance'];

function yyyyMmDdLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

export default function AdminTaskCreator() {
  const [mode, setMode] = useState('template'); // 'template' | 'task'

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [role, setRole] = useState(ROLES[0]);
  const [track, setTrack] = useState('');
  const [frequency, setFrequency] = useState('daily'); // for templates
  const [dueDate, setDueDate] = useState('');          // for one-off task
  const [assignedTo, setAssignedTo] = useState('');    // optional for one-off task

  const [tracks, setTracks] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Load available tracks from Firestore
  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, 'tracks'));
      const trackList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTracks(trackList);
    })();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      if (mode === 'template') {
        // ✅ Write to /taskTemplates
        await addDoc(collection(db, 'taskTemplates'), {
          title: title.trim(),
          description: description.trim(),
          frequency,                // "daily" | "weekly" | "monthly"
          role,                     // required by seeder and worker filters
          assignedTrack: track,     // must match seeder/queries
          createdAt: serverTimestamp(),
        });
        setMessage('✅ Template created');
      } else {
        // ✅ Write to /tasks with the app’s canonical fields
        const dateStr = dueDate ? yyyyMmDdLocal(new Date(dueDate)) : yyyyMmDdLocal();
        const docBody = {
          assignedTrack: track,
          role,
          title: title.trim(),
          description: description.trim(),
          completedBy: [],          // workers will arrayUnion their uid
          date: dateStr,            // string "YYYY-MM-DD" — required
          status: 'pending',        // harmless; some UIs show status
          createdAt: serverTimestamp(),
        };
        if (assignedTo.trim()) docBody.assignedTo = assignedTo.trim(); // optional
        await addDoc(collection(db, 'tasks'), docBody);
        setMessage('✅ One-off task created for ' + dateStr);
      }

      // Reset
      setTitle('');
      setDescription('');
      setRole(ROLES[0]);
      setTrack('');
      setFrequency('daily');
      setDueDate('');
      setAssignedTo('');
    } catch (err) {
      console.error(err);
      setMessage('❌ Error: ' + (err?.message || String(err)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="main-wrapper">
      <div className="glass-card task-form-card">
        <div className="row between wrap" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>Create {mode === 'template' ? 'Template' : 'One-off Task'}</h2>
          <div className="row gap12">
            <button
              type="button"
              className={`btn-toggle ${mode === 'template' ? 'is-active' : ''}`}
              onClick={() => setMode('template')}
              aria-pressed={mode === 'template'}
              title="Create a reusable template"
            >
              Template
            </button>
            <button
              type="button"
              className={`btn-toggle ${mode === 'task' ? 'is-active' : ''}`}
              onClick={() => setMode('task')}
              aria-pressed={mode === 'task'}
              title="Create a single task for a specific day"
            >
              One-off Task
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="task-form">
          <label>Title
            <input
              type="text"
              className="input-field"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </label>

          <label>Description
            <textarea
              className="input-field"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={"What to do\nHow to do it\nDone = measurable check"}
              required
              rows={4}
            />
          </label>

          <div className="row gap12">
            <label style={{ flex: 1 }}>Role
              <select
                className="input-field"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                required
              >
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>

            <label style={{ flex: 1 }}>Track
              <select
                className="input-field"
                value={track}
                onChange={(e) => setTrack(e.target.value)}
                required
              >
                <option value="">Select track</option>
                {tracks.map(t => (
                  <option key={t.id} value={t.id}>{t.displayName || t.id}</option>
                ))}
              </select>
            </label>
          </div>

          {mode === 'template' ? (
            <label>Frequency
              <select
                className="input-field"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                required
              >
                <option value="daily">daily</option>
                <option value="weekly">weekly</option>
                <option value="monthly">monthly</option>
              </select>
            </label>
          ) : (
            <>
              <div className="row gap12">
                <label style={{ flex: 1 }}>Due Date
                  <input
                    type="date"
                    className="input-field"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </label>
                <label style={{ flex: 1 }}>Assign To (optional)
                  <input
                    type="text"
                    className="input-field"
                    value={assignedTo}
                    placeholder="User UID (optional)"
                    onChange={(e) => setAssignedTo(e.target.value)}
                  />
                </label>
              </div>
              <p className="muted" style={{ marginTop: 0 }}>
                If no date is set, the task will be created for today ({yyyyMmDdLocal()}).
              </p>
            </>
          )}

          <button className="button-primary" disabled={saving}>
            {saving ? 'Saving…' : (mode === 'template' ? 'Create Template' : 'Create Task')}
          </button>
        </form>

        {message && <p style={{ marginTop: 10 }}>{message}</p>}
      </div>
    </div>
  );
}
