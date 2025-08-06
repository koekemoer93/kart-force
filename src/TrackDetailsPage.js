// src/TrackDetailsPage.js
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { db } from './firebase';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  Timestamp,
} from 'firebase/firestore';
import TopNav from './components/TopNav';

function TrackDetailsPage() {
  const { trackName } = useParams();
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTrackData = async () => {
      const usersRef = collection(db, 'users');
      const trackQuery = query(usersRef, where('assignedTrack', '==', trackName));
      const snapshot = await getDocs(trackQuery);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startOfDay = Timestamp.fromDate(today);

      const data = [];

      for (const docSnap of snapshot.docs) {
        const user = docSnap.data();
        const userId = docSnap.id;

        // Clock-in logs
        const clockLogsRef = collection(db, 'users', userId, 'clockLogs');
        const clockQuery = query(clockLogsRef, where('timestamp', '>=', startOfDay));
        const clockSnap = await getDocs(clockQuery);

        let lastLog = null;
        clockSnap.forEach(log => {
          const logData = log.data();
          if (!lastLog || logData.timestamp.seconds > lastLog.timestamp.seconds) {
            lastLog = logData;
          }
        });

        const isClockedIn = lastLog?.type === 'in';

        // Task completion
        const completedRef = collection(db, 'users', userId, 'completedTasks');
        const completedQuery = query(completedRef, where('completedAt', '>=', startOfDay));
        const completedSnap = await getDocs(completedQuery);
        const completedCount = completedSnap.size;

        const templateRef = doc(db, 'tracks', trackName, 'templates', user.role);
        const templateSnap = await getDoc(templateRef);
        const totalTasks = templateSnap.exists() ? (templateSnap.data().tasks || []).length : 0;

        const percent = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;

        data.push({
          name: user.name || 'Unnamed',
          role: user.role || 'worker',
          isClockedIn,
          completedCount,
          totalTasks,
          percent,
        });
      }

      setWorkers(data);
      setLoading(false);
    };

    fetchTrackData();
  }, [trackName]);

  if (loading) {
    return (
      <>
        <TopNav role="admin" />
        <div className="main-wrapper">
          <div className="glass-card">
            <p>Loading track details for {trackName}...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <TopNav role="admin" />
      <div className="main-wrapper">
        <div className="glass-card">
          <h2>{trackName} – Track Overview</h2>
          {workers.map((worker, index) => (
            <div key={index} className="card-inner">
              <p><b>{worker.name}</b> – {worker.role}</p>
              <p>Status: <span style={{ color: worker.isClockedIn ? 'lightgreen' : 'gray' }}>
                {worker.isClockedIn ? 'Clocked In' : 'Clocked Out'}
              </span></p>
              <p>Tasks: {worker.completedCount}/{worker.totalTasks} – <b>{worker.percent}%</b></p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default TrackDetailsPage;
