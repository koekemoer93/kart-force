// src/TrackDetailsPage.js
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { db } from './firebase';
import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
  doc,
  getDoc
} from 'firebase/firestore';
import './theme.css';
import './TrackDetailsPage.css';
import TopNav from './components/TopNav';

const TrackDetailsPage = () => {
  const { trackName } = useParams();
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTrackWorkers = async () => {
      const userRef = collection(db, 'users');
      const q = query(userRef, where('assignedTrack', '==', trackName));
      const snapshot = await getDocs(q);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startOfDay = Timestamp.fromDate(today);

      const data = [];

      for (const docSnap of snapshot.docs) {
        const user = docSnap.data();
        const userId = docSnap.id;

        const completedRef = collection(db, 'users', userId, 'completedTasks');
        const completedQuery = query(completedRef, where('completedAt', '>=', startOfDay));
        const completedSnapshot = await getDocs(completedQuery);

        const role = user.role || 'worker';
        const templateDoc = await getDoc(doc(db, 'tracks', trackName, 'templates', role));
        const totalTasks = templateDoc.exists() ? (templateDoc.data().tasks || []).length : 0;

        data.push({
          name: user.name || 'Unnamed',
          role,
          completed: completedSnapshot.size,
          total: totalTasks,
          percent: totalTasks > 0 ? Math.round((completedSnapshot.size / totalTasks) * 100) : 0
        });
      }

      setWorkers(data);
      setLoading(false);
    };

    fetchTrackWorkers();
  }, [trackName]);

  if (loading) {
    return (
      <>
        <TopNav role="admin" />
        <div className="main-wrapper">
          <div className="glass-card">
            <p>Loading track data...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <TopNav role="admin" />
      <div className="main-wrapper">
        <div className="glass-card track-header">
          <h2>{trackName.replace(/_/g, ' ')}</h2>
          <p>Live Dashboard</p>
        </div>

        <div className="glass-card">
          <h3>Workers Assigned</h3>
          {workers.map((w, i) => (
            <div key={i} className="card-inner">
              <p><b>{w.name}</b> — {w.role}</p>
              <p>Tasks Done: {w.completed}/{w.total}</p>
              <p>Progress: <b>{w.percent}%</b></p>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${w.percent}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default TrackDetailsPage;
