// src/components/TopNav.js
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../AuthContext';
import Avatar from './Avatar';
import './TopNav.css';
import { isAdmin, isWorkerLike } from '../utils/roles';

export default function TopNav() {
  const navigate = useNavigate();
  const { user, profile, role: ctxRole } = useAuth();

  // ✅ single declaration (no duplicates)
  const effectiveRole = ctxRole || profile?.role || '';
  const admin = isAdmin(effectiveRole);
  const workerLike = isWorkerLike(effectiveRole);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (error) {
      console.error('Logout failed', error);
    }
  };

  // ---- Button sets ----
  const adminButtons = [
    { label: 'Dashboard', path: '/admin-dashboard' },
    { label: 'Leave Requests', path: '/admin-leave' },
    { label: 'H&S Review', path: '/safety-review' },
    { label: 'HR & Finance', path: '/hr-finance' },
    { label: 'Stock Room', path: '/stockroom' },
    { label: 'Task Seeder', path: '/seed-tasks' }, // 🔹 admin-only tool
  ];

  const hrFinanceButtons = [
    { label: 'Dashboard', path: '/admin-dashboard' },
    { label: 'Leave Requests', path: '/admin-leave' },
    { label: 'H&S Review', path: '/safety-review' },
  ];

  const workerButtons = [
    { label: 'Worker Dashboard', path: '/worker-dashboard' },
    { label: 'Clock In/Out', path: '/clock' },
    { label: 'Apply for Leave', path: '/request-leave' },
    { label: 'Request Stock', path: '/request-supplies' },
  ];

  // ---- Role → Buttons mapping ----
  let buttons;
  if (admin) {
    buttons = adminButtons;
  } else if (effectiveRole === 'hrfinance') {
    buttons = hrFinanceButtons;
  } else if (workerLike) {
    buttons = workerButtons;
  } else {
    buttons = workerButtons; // fallback
  }

  return (
    <div className="topnav">
      {/* Left: logo */}
      <div className="left" onClick={() => navigate('/')} role="button" tabIndex={0}>
        <div className="logo-text">Kart Force</div>
      </div>

      {/* Center: nav buttons */}
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

      {/* Right: logout + avatar */}
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
}
