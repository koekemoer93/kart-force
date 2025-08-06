// src/AdminDashboard.js
import React, { useEffect, useState } from 'react';
import { auth, db } from './firebase';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  query,
  where,
  Timestamp
} from 'firebase/firestore';
import TopNav from './components/TopNav';

function AdminDashboard({ displayName }) {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [trackProgress, setTrackProgress] = useState({});
  const [loading, setLoading] = useState(true);

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/');
  };

  useEffect(() => {
    async function fetchData() {
      const userSnapshot = await getDocs(collection(db, 'users'));
      const usersData = [];

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startOfDay = Timestamp.fromDate(today);

      const trackStats = {};

      for (const docSnap of userSnapshot.docs) {
        const userData = docSnap.data();
        const userId = docSnap.id;

        const assignedTrack = userData.assignedTrack || 'N/A';
        const role = userData.role || 'worker';
        const name = userData.name || 'Unnamed';

        // 1. Check clock-in status
        const clockQuery = query(
          collection(db, 'users', userId, 'clockLogs'),
          where('timestamp', '>=', startOfDay)
        );
        const clockLogs = await getDocs(clockQuery);

        let lastLog = null;
        clockLogs.forEach(log => {
          const data = log.data();
          if (!lastLog || data.timestamp.seconds > lastLog.timestamp.seconds) {
            lastLog = data;
          }
        });

        const isClockedIn = lastLog && lastLog.type === 'in';

        // 2. Get today's completed tasks
        const completedQuery = query(
          collection(db, 'users', userId, 'completedTasks'),
          where('completedAt', '>=', startOfDay)
        );
        const completedSnapshot = await getDocs(completedQuery);
        const completedCount = completedSnapshot.size;

        // 3. Get total tasks from track template
        let totalTasks = 0;
        if (assignedTrack !== 'N/A') {
          const templateDoc = await getDoc(doc(db, 'tracks', assignedTrack, 'templates', role));
          if (templateDoc.exists()) {
            totalTasks = (templateDoc.data().tasks || []).length;
          }
        }

        const percentDone = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;

        usersData.push({
          id: userId,
          name,
          role,
          assignedTrack,
          isClockedIn,
          completedCount,
          totalTasks,
          percentDone
        });

        // Track-wide aggregation
        if (!trackStats[assignedTrack]) {
          trackStats[assignedTrack] = {
            total: 0,
            completed: 0
          };
        }

        trackStats[assignedTrack].total += totalTasks;
        trackStats[assignedTrack].completed += completedCount;
      }

      setUsers(usersData);
      setTrackProgress(trackStats);
      setLoading(false);
    }

    fetchData();
  }, []);

  if (loading) {
    return (
      <>
       <TopNav role="admin" onLogout={handleLogout} />
        <div className="main-wrapper">
          <div className="glass-card">
            <p>Loading live worker data...</p>
          </div>
        </div>
      </>
    );
  }

  return (
  <>
    <TopNav role="admin" />

    <div className="main-wrapper admin-dashboard-layout">
      <div className="glass-card">
        <h2>Welcome, {displayName || "Admin"}!</h2>
        <p>This is your live owner dashboard.</p>
      </div>

      <div className="glass-card">
        <h3>Staff on Duty</h3>
        {users.map((user, index) => (
          <div key={index} style={{ marginBottom: '16px' }}>
            <p><strong>{user.name || user.email}</strong></p>
            <p>Role: {user.role}</p>
            <p>Track: {user.assignedTrack}</p>
            <p>
              Status:{" "}
              <span style={{ color: user.isClockedIn ? "lightgreen" : "gray" }}>
                {user.isClockedIn ? "Clocked In" : "Clocked Out"}
              </span>
            </p>
            <p>
              Task Progress: {user.percentDone}% ({user.completedCount}/{user.totalTasks})
            </p>
          </div>
        ))}
      </div>

      <div className="glass-card">
        <h3>Tracks Info</h3>
        {Object.entries(trackProgress).map(([trackName, data], index) => (
          <div key={index} style={{ marginBottom: '16px' }}>
            <p><strong>{trackName}</strong></p>
            <p>Completed Tasks: {data.completed}/{data.total}</p>
            <p>
              Track Completion:{" "}
              <strong>{Math.round((data.completed / data.total) * 100)}%</strong>
            </p>
          </div>
        ))}
      </div>
    </div>
  </>
);
}

export default AdminDashboard;
