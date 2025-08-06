// src/WorkerDashboard.js
import React from 'react';
import { auth } from './firebase';
import { useNavigate } from 'react-router-dom';

function WorkerDashboard({ displayName }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/');
  };

  return (
    <div className="main-wrapper">
      <div className="glass-card">
        <h2>Welcome, {displayName || "Team Member"}!</h2>
        <p>This is your <b>Worker Dashboard</b>.</p>
        <p>(Here you’ll see your daily tasks for your assigned track!)</p>
        <button className="button-primary" onClick={handleLogout} style={{marginTop: 32}}>Logout</button>
      </div>
    </div>
  );
}

export default WorkerDashboard;
