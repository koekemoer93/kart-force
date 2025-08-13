// src/components/TopNav.js
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../AuthContext';
import Avatar from './Avatar';
import './TopNav.css';
import { isAdmin, isWorkerLike } from '../utils/roles';

export default function TopNav() {
  const navigate = useNavigate();
  const location = useLocation();
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
    //{ label: 'Tracks Manager', path: '/admin-tracks' },
    //{ label: 'HR & Employees', path: '/admin-leave' },
    //{ label: 'H&S Review', path: '/safety-review' },
    { label: 'Users Manager', path: '/admin-users' },
    { label: 'Stock Room', path: '/stockroom' },
    { label: 'Task Creator', path: '/admin-task-manager' },
    //{ label: 'Seeder', path: '/admin-task-seeder'},
    //{ label: 'Employee Seeder', path: '/admin-employee-seeder' },
    { label: 'Register User', path: '/register' },
  ];

  const hrFinanceButtons = [
    { label: 'Dashboard', path: '/admin-dashboard' },
    { label: 'Tracks Manager', path: '/admin-tracks' },
    { label: 'Leave Requests', path: '/admin-leave' },
   // { label: 'H&S Review', path: '/safety-review' },
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

  // --- Mobile drawer state ---
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the drawer on route change or ESC
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setMobileOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <div className="topnav">
        {/* Left: logo */}
        <div className="left" onClick={() => navigate('/')} role="button" tabIndex={0}>
          <div className="logo-text"></div>
        </div>

        {/* Center: nav buttons (hidden on mobile via CSS) */}
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

        {/* Right: logout + avatar + hamburger (hamburger only shows on mobile via CSS) */}
        <div className="right">
          <button className="nav-btn" onClick={handleLogout}>
            Logout
          </button>
          <Avatar
            src={profile?.photoURL || user?.photoURL || ''}
            alt={profile?.displayName || user?.email || 'User'}
            size={36}
          />
          <button
            className="hamburger"
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>

      {/* Mobile overlay + drawer (added; desktop won't see this due to CSS) */}
      <div
        className={`mobile-backdrop ${mobileOpen ? 'show' : ''}`}
        onClick={() => setMobileOpen(false)}
      />
      <aside className={`mobile-drawer ${mobileOpen ? 'open' : ''}`} aria-hidden={!mobileOpen}>
        <div className="drawer-header">
          <div className="drawer-brand">Kart Force</div>
          <button className="drawer-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">×</button>
        </div>

        <div className="drawer-user">
          <Avatar
            src={profile?.photoURL || user?.photoURL || ''}
            alt={profile?.displayName || user?.email || 'User'}
            size={48}
          />
          <div className="drawer-user-meta">
            <div className="name">{profile?.displayName || user?.email || 'User'}</div>
            <div className="role">{effectiveRole || '—'}</div>
          </div>
        </div>

        <nav className="drawer-links" aria-label="Mobile menu">
          {buttons.map((b) => (
            <button
              key={b.path}
              className="drawer-link"
              onClick={() => {
                setMobileOpen(false);
                navigate(b.path);
              }}
            >
              {b.label}
            </button>
          ))}
        </nav>

        <div className="drawer-footer">
          <button
            className="drawer-logout"
            onClick={() => {
              setMobileOpen(false);
              handleLogout();
            }}
          >
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}
