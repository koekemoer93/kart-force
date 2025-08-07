// src/TaskHistoryPage.js
import React, { useEffect, useState } from 'react';
import { db } from './firebase';
import { useAuth } from './AuthContext';
import { collection, getDocs } from 'firebase/firestore';

function TaskHistoryPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLogs() {
      const logsRef = collection(db, "users", user.uid, "completedTasks");
      const snapshot = await getDocs(logsRef);
      const arr = [];
      snapshot.forEach(doc => arr.push(doc.data()));
      setLogs(arr.sort((a, b) => b.completedAt.seconds - a.completedAt.seconds));
      setLoading(false);
    }
    if (user) fetchLogs();
  }, [user]);

  if (loading) return <div className="main-wrapper"><div className="glass-card">Loading...</div></div>;

  return (
    <div className="main-wrapper">
      <div className="glass-card" style={{ maxWidth: 500 }}>
        <h2>Task History</h2>
        {logs.length === 0 ? (
          <p>No completed tasks found.</p>
        ) : (
          <ul>
            {logs.map((log, idx) => (
              <li key={idx} style={{ margin: "10px 0" }}>
                <span style={{ fontWeight: 600 }}>{log.taskName}</span>
                <br />
                <span style={{ color: "#aaa", fontSize: 14 }}>
                  {log.completedAt?.toDate?.().toLocaleString() || ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        <button
          className="button-primary"
          onClick={() => window.history.back()}
          style={{ marginTop: 20 }}
        >
          Back
        </button>
      </div>
    </div>
  );
}

export default TaskHistoryPage;
