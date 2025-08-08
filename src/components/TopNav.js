// src/components/TopNav.js
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import './TopNav.css';

const TopNav = ({ role }) => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (error) {
      console.error('Logout failed', error);
    }
  };

  // Buttons for admin
  const trackButtons = [
    { label: 'Dashboard', path: '/admin-dashboard' },
    { label: 'SyringaPark', path: '/track/syringa' },
    { label: 'Epic Karting Pavilion', path: '/track/pavilion' },
    { label: 'Midlands', path: '/track/midlands' },
    { label: 'Clearwater', path: '/track/clearwater' },
    { label: 'Indykart Parkview', path: '/track/parkview' },
    { label: 'Leave Requests', path: '/admin-leave' },
  ];

  // Buttons for worker
  const workerButtons = [
    { label: 'Dashboard', path: '/worker-dashboard' },
    { label: 'Apply for Leave', path: '/request-leave' },
  ];

  return (
    <div className="top-nav">
      <div className="nav-left">
        <h1 className="logo-text">Kart</h1>

        <div className="nav-buttons">
          {/* Admin Buttons */}
          {role === 'admin' &&
            trackButtons.map((button, idx) => (
              <button
                key={idx}
                className="nav-btn"
                onClick={() => navigate(button.path)}
              >
                {button.label}
              </button>
            ))}

          {role === 'worker' &&
            workerButtons.map((button, idx) => (
              <button
                key={`worker2-${idx}`}
                className="nav-btn"
                onClick={() => navigate(button.path)}
              >
                {button.label}
              </button>
            ))}
        </div>
      </div>

      {/* Right-side buttons */}
      <div className="nav-right" style={{ display: 'flex', gap: '10px' }}>
        <button className="logout-btn" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </div>
  );
};

export default TopNav;
