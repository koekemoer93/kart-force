import React, { useState } from 'react';
import { db } from '../firebase';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  Timestamp
} from 'firebase/firestore';
import TopNav from '../components/TopNav';

const TRACK_OPTIONS = ["SyringaPark", "Epic Karting Pavilion", "Midlands"];
const ROLE_OPTIONS = ["worker", "workshopManager", "mechanic", "reception", "marshall"];
const FREQ_OPTIONS = ["daily", "weekly", "monthly"];

export default function AdminTaskSeeder() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedTrack, setSelectedTrack] = useState('SyringaPark');
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedFreq, setSelectedFreq] = useState('');
  const [seeding, setSeeding] = useState(false);

  const seedTasks = async () => {
    if (!startDate || !endDate) return alert("Select start and end date");
    setSeeding(true);

    try {
      // Fetch templates
      let qTemplates = query(collection(db, 'taskTemplates'));
      if (selectedTrack) {
        qTemplates = query(qTemplates, where('assignedTrack', '==', selectedTrack));
      }
      if (selectedRole) {
        qTemplates = query(qTemplates, where('role', '==', selectedRole));
      }
      if (selectedFreq) {
        qTemplates = query(qTemplates, where('frequency', '==', selectedFreq));
      }

      const templateSnap = await getDocs(qTemplates);
      const templates = templateSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      if (!templates.length) {
        alert("No matching templates found.");
        setSeeding(false);
        return;
      }

      // Generate all dates in range
      const start = new Date(startDate);
      const end = new Date(endDate);
      const dates = [];
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().slice(0, 10));
      }

      // Seed tasks
      let createdCount = 0;
      for (const dateStr of dates) {
        for (const t of templates) {
          // Check if frequency matches date
          if (t.frequency === 'weekly') {
            const day = new Date(dateStr).getDay(); // 1 = Monday
            if (day !== 1) continue;
          }
          if (t.frequency === 'monthly') {
            const day = new Date(dateStr).getDate(); // 1st day
            if (day !== 1) continue;
          }

          // Check duplicates
          const dupQ = query(
            collection(db, 'tasks'),
            where('assignedTrack', '==', t.assignedTrack),
            where('role', '==', t.role),
            where('title', '==', t.title),
            where('date', '==', dateStr)
          );
          const dupSnap = await getDocs(dupQ);
          if (!dupSnap.empty) continue; // Skip existing

          // Create
          await addDoc(collection(db, 'tasks'), {
            assignedTrack: t.assignedTrack,
            role: t.role,
            title: t.title,
            description: t.description || '',
            days: [],
            completedBy: [],
            date: dateStr,
            createdAt: Timestamp.now()
          });
          createdCount++;
        }
      }

      alert(`Seeding complete. Created ${createdCount} new tasks.`);
    } catch (err) {
      console.error(err);
      alert("Error seeding tasks.");
    } finally {
      setSeeding(false);
    }
  };

  return (
    <>
      <TopNav role="admin" />
      <div className="main-wrapper" style={{ padding: 20 }}>
        <h2>Admin Task Seeder</h2>
        <div className="glass-card" style={{ padding: 20 }}>
          <label>Start Date</label>
          <input
            type="date"
            className="input-field"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <label>End Date</label>
          <input
            type="date"
            className="input-field"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />

          <label>Track</label>
          <select
            className="input-field"
            value={selectedTrack}
            onChange={(e) => setSelectedTrack(e.target.value)}
          >
            {TRACK_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <label>Role (optional)</label>
          <select
            className="input-field"
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
          >
            <option value="">All</option>
            {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>

          <label>Frequency (optional)</label>
          <select
            className="input-field"
            value={selectedFreq}
            onChange={(e) => setSelectedFreq(e.target.value)}
          >
            <option value="">All</option>
            {FREQ_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>

          <button
            className="button-primary"
            style={{ marginTop: 20 }}
            onClick={seedTasks}
            disabled={seeding}
          >
            {seeding ? "Seeding..." : "Seed Tasks"}
          </button>
        </div>
      </div>
    </>
  );
}
