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
  const { user, profile, userData } = useAuth(); // include userData for role fallback

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (error) {
      console.error('Logout failed', error);
    }
  };

  // 🔐 Determine effective role: prop overrides, else userData.role, else worker
  const effectiveRole =
    (typeof role === 'string' && role) ||
    (userData && userData.role) ||
    'worker';

  // ✅ Button sets per role
  const adminButtons = [
    { label: 'Dashboard', path: '/admin-dashboard' },
    { label: 'Leave Requests', path: '/admin-leave' },
    { label: 'H&S Review', path: '/safety-review' },
    { label: 'HR & Finance', path: '/hr-finance' }, // admin-only
    { label: 'Stock Room', path: '/stockroom' },    // adjust if your route differs
  
  ];

  const hrFinanceButtons = [
    { label: 'Dashboard', path: '/admin-dashboard' },
    { label: 'Leave Requests', path: '/admin-leave' },
    { label: 'H&S Review', path: '/safety-review' },
    // Note: No "HR & Finance" here (admin-only by request)
  ];

  const workerButtons = [
    { label: 'Worker Dashboard', path: '/worker-dashboard' },
    { label: 'Clock In/Out', path: '/clock' }, // adjust if your route name differs
    { label: 'Apply for Leave', path: '/request-leave' },
    // Optionally later: { label: 'Safety Checklist', path: '/safety-checklist' }
  ];

  const buttons =
    effectiveRole === 'admin'
      ? adminButtons
      : effectiveRole === 'hrFinance'
      ? hrFinanceButtons
      : workerButtons;

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

      {/* Right: Logout + Avatar */}
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
