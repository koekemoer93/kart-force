import React from 'react';
import { db } from '../firebase';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { useTasks } from '../hooks/useTasks';
import './WorkerTasks.css';

export default function WorkerTasks({ trackId, role, userId }) {
  const tasks = useTasks(trackId, role);

  const toggleTask = async (task) => {
    const ref = doc(db, 'tasks', task.id);
    const isCompleted = task.completedBy.includes(userId);
    await updateDoc(ref, {
      completedBy: isCompleted ? arrayRemove(userId) : arrayUnion(userId)
    });
  };

  const completion = tasks.length
    ? Math.round((tasks.filter(t => t.completedBy.includes(userId)).length / tasks.length) * 100)
    : 0;

  return (
    <div className="glass-card">
      <h3>Today's Tasks ({completion}%)</h3>
      <ul>
        {tasks.map(task => (
          <li key={task.id}>
            <label>
              <input
                type="checkbox"
                checked={task.completedBy.includes(userId)}
                onChange={() => toggleTask(task)}
              />
              {task.title}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
