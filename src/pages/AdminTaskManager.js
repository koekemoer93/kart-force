import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp
} from 'firebase/firestore';
import TopNav from '../components/TopNav';

const TRACK_OPTIONS = ["SyringaPark", "Epic Karting Pavilion", "Midlands"];
const ROLE_OPTIONS = ["worker", "workshopManager", "mechanic", "reception", "marshall"];
const FREQ_OPTIONS = ["daily", "weekly", "monthly"];

 function AdminTaskManager() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    frequency: 'daily',
    role: 'worker',
    assignedTrack: 'SyringaPark'
  });

  // Fetch templates
  useEffect(() => {
    const fetchTemplates = async () => {
      setLoading(true);
      const q = query(collection(db, 'taskTemplates'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setTemplates(snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })));
      setLoading(false);
    };
    fetchTemplates();
  }, []);

  // Add template
  const addTemplate = async (e) => {
    e.preventDefault();
    if (!newTask.title.trim()) return alert('Task title is required');
    try {
      await addDoc(collection(db, 'taskTemplates'), {
        ...newTask,
        createdAt: serverTimestamp()
      });
      alert('Template added');
      setNewTask({
        title: '',
        description: '',
        frequency: 'daily',
        role: 'worker',
        assignedTrack: 'SyringaPark'
      });
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert('Error adding template');
    }
  };

  // Delete template
  const deleteTemplate = async (id) => {
    if (!window.confirm('Delete this template?')) return;
    try {
      await deleteDoc(doc(db, 'taskTemplates', id));
      alert('Deleted');
      setTemplates(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      console.error(err);
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
            onChange={e => setNewTask({ ...newTask, title: e.target.value })}
          />
          <textarea
            className="input-field"
            placeholder="Description"
            value={newTask.description}
            onChange={e => setNewTask({ ...newTask, description: e.target.value })}
          />
          <select
            className="input-field"
            value={newTask.frequency}
            onChange={e => setNewTask({ ...newTask, frequency: e.target.value })}
          >
            {FREQ_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <select
            className="input-field"
            value={newTask.role}
            onChange={e => setNewTask({ ...newTask, role: e.target.value })}
          >
            {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select
            className="input-field"
            value={newTask.assignedTrack}
            onChange={e => setNewTask({ ...newTask, assignedTrack: e.target.value })}
          >
            {TRACK_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button className="button-primary" type="submit">Add Template</button>
        </form>

        {/* List */}
        <div className="glass-card" style={{ padding: 20 }}>
          <h3>Existing Templates</h3>
          {loading ? (
            <p>Loading...</p>
          ) : (
            <ul>
              {templates.map(t => (
                <li key={t.id} style={{ marginBottom: 10 }}>
                  <strong>{t.title}</strong> — {t.frequency}, {t.role}, {t.assignedTrack}
                  <br />
                  {t.description && <small>{t.description}</small>}
                  <br />
                  <button
                    style={{ marginTop: 5 }}
                    onClick={() => deleteTemplate(t.id)}
                  >
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

