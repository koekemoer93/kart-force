// src/WorkerDashboard.js
import React, { useEffect, useState } from 'react';
import { db } from './firebase';
import { useAuth } from './AuthContext';
import { doc, getDoc } from 'firebase/firestore';

function WorkerDashboard() {
  const { user, displayName } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTasks() {
      if (!user) return;
      // Get the user's profile for assignedTrack and role
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (!userDoc.exists()) return;
      const { assignedTrack, role } = userDoc.data();
      // Get the tasks for this track and role
      const taskDoc = await getDoc(doc(db, "tracks", assignedTrack, "templates", role));
      if (taskDoc.exists()) {
        setTasks(taskDoc.data().tasks || []);
      } else {
        setTasks([]);
      }
      setLoading(false);
    }
    fetchTasks();
  }, [user]);

  if (loading) {
    return (
      <div className="main-wrapper">
        <div className="glass-card">
          <p>Loading your tasks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="main-wrapper">
      <div className="glass-card">
        <h2>Welcome, {displayName || "Worker"}!</h2>
        <h3>Today's Tasks</h3>
        {tasks.length === 0 ? (
          <p>No tasks found for your track/role.</p>
        ) : (
          <ul>
            {tasks.map((task) => (
              <li key={task.id} style={{ margin: "16px 0", fontSize: 18 }}>
                <input type="checkbox" disabled />
                {" "}
                {task.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default WorkerDashboard;
