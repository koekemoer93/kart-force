import React from 'react';
import { db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { useAuth } from '../AuthContext';

export default function TaskSeeder() {
  const { userData } = useAuth();

  // ✅ Realistic made-up tasks + Clock In/Out for all roles
  const tasksData = {
    manager: [
      { name: 'Clock In', days: 'Every day' },
      { name: 'Clock Out', days: 'Every day' },
      { name: 'Review weekly safety reports', days: 'Monday' },
      { name: 'Approve timesheets', days: 'Friday' },
      { name: 'Hold staff briefing', days: 'Every day' },
      { name: 'Update shift schedule', days: 'Sunday' },
    ],
    assistantManager: [
      { name: 'Clock In', days: 'Every day' },
      { name: 'Clock Out', days: 'Every day' },
      { name: 'Prepare daily sales report', days: 'Every day' },
      { name: 'Check and restock office supplies', days: 'Wednesday' },
      { name: 'Assist with opening checks', days: 'Every day' },
      { name: 'Verify cash-up records', days: 'Friday' },
    ],
    marshall: [
      { name: 'Clock In', days: 'Every day' },
      { name: 'Clock Out', days: 'Every day' },
      { name: 'Check track for debris', days: 'Every day' },
      { name: 'Inspect safety barriers', days: 'Monday' },
      { name: 'Guide drivers into pit lane', days: 'Every day' },
      { name: 'Test timing system before first race', days: 'Every day' },
    ],
    workshopManager: [
      { name: 'Clock In', days: 'Every day' },
      { name: 'Clock Out', days: 'Every day' },
      { name: 'Approve repair jobs', days: 'Every day' },
      { name: 'Order workshop parts', days: 'Tuesday' },
      { name: 'Maintain service logs', days: 'Friday' },
      { name: 'Conduct weekly toolbox check', days: 'Monday' },
    ],
    mechanic: [
      { name: 'Clock In', days: 'Every day' },
      { name: 'Clock Out', days: 'Every day' },
      { name: 'Check oil level for all karts', days: 'Every day' },
      { name: 'Inspect brake pads', days: 'Every day' },
      { name: 'Replace worn tyres', days: 'Thursday' },
      { name: 'Clean air filters', days: 'Friday' },
    ],
    reception: [
      { name: 'Clock In', days: 'Every day' },
      { name: 'Clock Out', days: 'Every day' },
      { name: 'Greet customers on arrival', days: 'Every day' },
      { name: 'Confirm bookings', days: 'Every day' },
      { name: 'Answer phone inquiries', days: 'Every day' },
      { name: 'Update booking board', days: 'Every morning' },
    ],
  };

  const seedTasks = async () => {
    if (userData?.role !== 'admin') {
      alert('Only admins can seed tasks!');
      return;
    }

    const trackId = 'SyringaPark'; // Change this if seeding for a different track
    try {
      for (const role of Object.keys(tasksData)) {
        const roleDocRef = doc(db, 'tracks', trackId, 'templates', role);
        await setDoc(roleDocRef, { tasks: tasksData[role] }, { merge: true });
      }
      alert('Tasks seeded successfully!');
    } catch (err) {
      console.error(err);
      alert('Error seeding tasks: ' + err.message);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Seed Tasks to Firestore</h1>
      <p>This will overwrite existing tasks for SyringaPark.</p>
      <button className="button-primary" onClick={seedTasks}>
        Seed Now
      </button>
    </div>
  );
}
