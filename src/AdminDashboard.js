// src/AdminDashboard.js
import React from 'react';
import { auth } from './firebase';
import { useNavigate } from 'react-router-dom';

function AdminDashboard({ displayName }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/');
  };

  return (
    <div className="main-wrapper">
      <div className="glass-card">
        <h2>Welcome, {displayName || "Admin"}!</h2>
        <p>This is the <b>Admin Dashboard</b>.</p>
        <p>(Here you’ll manage users, see reports, etc.)</p>
        <button className="button-primary" onClick={handleLogout} style={{marginTop: 32}}>Logout</button>
      </div>
    </div>
  );
}

export default AdminDashboard;
