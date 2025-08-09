import React, { useState } from 'react';
import { db } from '../firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import './AdminTaskCreator.css';

export default function AdminTaskCreator() {
  const [title, setTitle] = useState('');
  const [trackId, setTrackId] = useState('');
  const [role, setRole] = useState('worker');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title || !trackId) return;

    await addDoc(collection(db, 'tasks'), {
      title,
      trackId,
      role,
      date: Timestamp.fromDate(new Date(date)),
      completedBy: [],
      createdBy: 'ADMIN_UID', // TODO: from auth
      createdAt: Timestamp.now()
    });

    setTitle('');
    alert('Task created!');
  };

  return (
    <form className="glass-card" onSubmit={handleSubmit}>
      <h3>Create Task</h3>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" />
      <select value={trackId} onChange={(e) => setTrackId(e.target.value)}>
        <option value="">Select Track</option>
        <option value="pavilion">Pavilion</option>
        <option value="syringaPark">Syringa Park</option>
      </select>
      <select value={role} onChange={(e) => setRole(e.target.value)}>
        <option value="worker">Worker</option>
        <option value="admin">Admin</option>
      </select>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <button type="submit">Add Task</button>
    </form>
  );
}
