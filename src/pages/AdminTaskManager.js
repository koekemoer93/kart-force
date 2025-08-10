import React, { useEffect, useState } from 'react';
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

const TRACK_OPTIONS = ['SyringaPark', 'Epic Karting Pavilion', 'Midlands'];
const ROLE_OPTIONS = ['worker', 'workshopManager', 'mechanic', 'reception', 'marshall'];
const FREQ_OPTIONS = ['daily', 'weekly', 'monthly'];

function normalizeTemplateDoc(docSnap) {
  const d = docSnap.data() || {};

  // Fallbacks for legacy docs
  const assignedTrack = d.assignedTrack || d.track || '';
  const frequency = d.frequency || d.period || 'daily';
  const role = String(d.role || d.assigneeRole || d.assignedToRole || 'worker').toLowerCase();

  return {
    id: docSnap.id,
    title: d.title || '(untitled)',
    description: d.description || '',
    assignedTrack,
    frequency,
    role,
    createdAt: d.createdAt || null,
    _raw: d, // keep original around (useful for the fixer)
  };
}


function AdminTaskManager() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    frequency: 'daily',
    role: 'worker',
    assignedTrack: 'SyringaPark',
  });

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

  // Add template (NO page reload)
  const addTemplate = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!newTask.title.trim()) return alert('Task title is required');

    setSubmitting(true);
    try {
      await addDoc(collection(db, 'taskTemplates'), {
        title: newTask.title.trim(),
        description: newTask.description.trim(),
        frequency: newTask.frequency,
        role: newTask.role,
        assignedTrack: newTask.assignedTrack,
        createdAt: serverTimestamp(),
      });

      // Clear form — the new item will appear via onSnapshot
      setNewTask({
        title: '',
        description: '',
        frequency: 'daily',
        role: 'worker',
        assignedTrack: 'SyringaPark',
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
      // List updates automatically via onSnapshot
    } catch (err) {
      console.error('Error deleting template:', err);
      alert('Error deleting template');
    }
  };

  return (
    <>
      <TopNav role="admin" />
      <div className="main-wrapper" style={{ padding: 20 }}>
        <h2>Admin Task Manager</h2>

        {/* Add form */}
        <form onSubmit={addTemplate} className="glass-card" style={{ padding: 20, marginBottom: 30 }}>
          <h3>Add New Task Template</h3>

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

          <select
            className="input-field"
            value={newTask.frequency}
            onChange={(e) => setNewTask({ ...newTask, frequency: e.target.value })}
          >
            {FREQ_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>

          <select
            className="input-field"
            value={newTask.role}
            onChange={(e) => setNewTask({ ...newTask, role: e.target.value })}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          <select
            className="input-field"
            value={newTask.assignedTrack}
            onChange={(e) => setNewTask({ ...newTask, assignedTrack: e.target.value })}
          >
            {TRACK_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <button className="button-primary" type="submit" disabled={submitting}>
            {submitting ? 'Adding…' : 'Add Template'}
          </button>
        </form>

        {/* List */}
        <div className="glass-card" style={{ padding: 20 }}>
          <h3>Existing Templates</h3>
          {loading ? (
            <p>Loading...</p>
          ) : templates.length === 0 ? (
            <p>No templates yet.</p>
          ) : (
            <ul>
              {templates.map((t) => (
                <li key={t.id} style={{ marginBottom: 10 }}>
                  <strong>{t.title}</strong> — {t.frequency}, {t.role}, {t.assignedTrack}
                  <br />
                  {t.description && <small>{t.description}</small>}
                  <br />
                  <button style={{ marginTop: 5 }} onClick={() => deleteTemplate(t.id)}>
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

export default AdminTaskManager;
