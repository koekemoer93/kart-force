import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import './AdminTaskCreator.css';

export default function AdminTaskCreator() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [track, setTrack] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [tracks, setTracks] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Load available tracks from Firestore
  useEffect(() => {
    const fetchTracks = async () => {
      const snap = await getDocs(collection(db, 'tracks'));
      const trackList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTracks(trackList);
    };
    fetchTracks();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await addDoc(collection(db, 'tasks'), {
        title,
        description,
        assignedTo,
        track,
        status: 'pending',
        createdAt: serverTimestamp(),
        dueDate: dueDate ? new Date(dueDate) : null
      });
      setMessage('✅ Task created successfully');
      setTitle('');
      setDescription('');
      setAssignedTo('');
      setTrack('');
      setDueDate('');
    } catch (err) {
      console.error(err);
      setMessage('❌ Error creating task');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="main-wrapper">
      <div className="glass-card task-form-card">
        <h2>Create New Task</h2>
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
              required
            />
          </label>

          <label>Assign To
            <input
              type="text"
              className="input-field"
              value={assignedTo}
              placeholder="User UID or leave blank for track-only"
              onChange={(e) => setAssignedTo(e.target.value)}
            />
          </label>

          <label>Track
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

          <label>Due Date
            <input
              type="date"
              className="input-field"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </label>

          <button className="button-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Create Task'}
          </button>
        </form>
        {message && <p style={{ marginTop: '10px' }}>{message}</p>}
      </div>
    </div>
  );
}
