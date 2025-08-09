// src/components/TopNav.js
// ⬇️ Paste this entire file

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../AuthContext';
import Avatar from './Avatar';
import './TopNav.css';

const TopNav = ({ role }) => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (error) {
      console.error('Logout failed', error);
    }
  };

  // ✅ Keep your button set; adjust labels/paths if needed
  const adminButtons = [
    { label: 'Dashboard', path: '/admin-dashboard' },
    { label: 'Leave Requests', path: '/admin-leave' },
    { label: 'Stock Room', path: '/stockroom' },      // NOTE: if your route is /stock-room, change it here
    { label: 'Create Task', path: '/task-creator' },
  ];

  const workerButtons = [
    { label: 'Worker Dashboard', path: '/worker-dashboard' },
    { label: 'Apply for Leave', path: '/request-leave' },
    { label: 'Clock In/Out', path: '/clock' }, // NEW: routes to the Clock page
    // You can add { label: 'Clock Out', path: '/clock-out' } after we add that page
  ];

  const buttons = role === 'admin' ? adminButtons : workerButtons;

return (
  <div className="topnav">
    {/* Left: app title */}
    <div className="left" onClick={() => navigate('/')} role="button" tabIndex={0}>
      <div className="logo-text">Kart Force</div>
    </div>

    {/* Center: scrollable button strip */}
    <div className="center">
      <div className="nav-scroll">
        {buttons.map((b) => (
          <button
            key={b.path}
            className="nav-btn"
            onClick={() => navigate(b.path)}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>

    {/* Right: Logout + Avatar only */}
    <div className="right">
      <button className="nav-btn" onClick={handleLogout}>
        Logout
      </button>
      <Avatar
        src={profile?.photoURL || user?.photoURL || ''}
        alt={profile?.displayName || user?.email || 'User'}
        size={36}
      />
    </div>
  </div>
);

};

export default TopNav;
