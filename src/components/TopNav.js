// src/components/TopNav.js
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import './TopNav.css';
import AvatarUploader from './AvatarUploader';

const TopNav = ({ role }) => {
  const navigate = useNavigate();
  const safeRole = role || 'worker'; // default just in case

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (error) {
      console.error('Logout failed', error);
    }
  };

  // Buttons for admin
  const adminButtons = [
    { label: 'Dashboard', path: '/admin-dashboard' },
    { label: 'SyringaPark', path: '/track/syringa' },
    { label: 'Epic Karting Pavilion', path: '/track/pavilion' },
    { label: 'Midlands', path: '/track/midlands' },
    { label: 'Clearwater', path: '/track/clearwater' },
    { label: 'Indykart Parkview', path: '/track/parkview' },
    { label: 'Leave Requests', path: '/admin-leave' },
    { label: 'Stock Room', path: '/stockroom' },           // NEW: admin inventory
  ];

  // Buttons for worker
  const workerButtons = [
    { label: 'Dashboard', path: '/worker-dashboard' },
    { label: 'Apply for Leave', path: '/request-leave' },
    { label: 'Request Supplies', path: '/request-supplies' }, // NEW: weekly supply list
  ];

  const buttonsToShow = safeRole === 'admin' ? adminButtons : workerButtons;

  return (
    <div className="top-nav">
      <div className="nav-left">
        {/* Navigation buttons */}
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
        {/* Profile picture uploader */}
        <AvatarUploader
          currentPhotoURL={auth.currentUser?.photoURL}
          onUploaded={(url) => {
            // optional: you could force a reload of user data in context if needed
          }}
        />

        {/* Logout button */}
        <button className="logout-btn" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </div>
  );
};

export default TopNav;
