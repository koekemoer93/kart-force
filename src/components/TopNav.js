// src/components/TopNav.js
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import './TopNav.css';
import AvatarUploader from './AvatarUploader';

const TopNav = ({ role }) => {
  const navigate = useNavigate();
  const safeRole = role || 'worker'; // fallback if role missing

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (error) {
      console.error('Logout failed', error);
    }
  };

  // Clean, minimal buttons for admin
  // ✅ Added "Seed Hours" (admin-only) that links to /admin/seed-hours
  const adminButtons = [
    { label: 'Dashboard', path: '/admin-dashboard' },
    { label: 'Leave Requests', path: '/admin-leave' },
    { label: 'Stock Room', path: '/stockroom' },
    { label: 'Hours', path: '/hours' },
    { label: 'Seed Hours', path: '/admin/seed-hours' }, // <-- NEW
  ];

  // Clean, minimal buttons for worker
  const workerButtons = [
    { label: 'Dashboard', path: '/worker-dashboard' },
    { label: 'Apply for Leave', path: '/request-leave' },
    { label: 'Request Supplies', path: '/request-supplies' },
  ];

  const buttonsToShow = safeRole === 'admin' ? adminButtons : workerButtons;

  return (
    <div className="top-nav">
      <div className="nav-left">
        <div className="nav-buttons">
          {buttonsToShow.map((btn) => (
            <button
              key={btn.path}
              className="nav-btn"
              onClick={() => navigate(btn.path)}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Right side: profile + logout */}
      <div className="nav-right" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <AvatarUploader
          currentPhotoURL={auth.currentUser?.photoURL}
          onUploaded={(url) => {
            // optional: refresh UI or user context
          }}
        />
        <button className="logout-btn" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </div>
  );
};

export default TopNav;
