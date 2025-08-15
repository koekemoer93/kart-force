import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../AuthContext';
import Avatar from './Avatar';
import './TopNav.css';
import { isAdmin, isWorkerLike } from '../utils/roles';
import BrandMark from "./BrandMark";

export default function TopNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, role: ctxRole } = useAuth();

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

  const adminButtons = [
    { label: 'Dashboard', path: '/admin-dashboard' },
    //{ label: 'Tracks Manager', path: '/admin-tracks' },
    { label: 'Users Manager', path: '/admin-users' },
    { label: 'Stock Room', path: '/stockroom' },
    //{ label: 'Task Creator', path: '/admin-task-manager' },
   // { label: 'Register User', path: '/register' },
    { label: 'HR Hub', path: '/admin-hr-hub' },
  ];

  const hrFinanceButtons = [
    { label: 'Dashboard', path: '/admin-dashboard' },
    { label: 'Leave Requests', path: '/admin-leave' },
  ];

  const workerButtons = [
    { label: 'Dashboard', path: '/worker-dashboard' },
    { label: 'Clock In/Out', path: '/clock' },
    { label: 'Apply for Leave', path: '/request-leave' },
    { label: 'Request Stock', path: '/request-supplies' },
  ];

  let buttons;
  if (admin) buttons = adminButtons;
  else if (effectiveRole === 'hrfinance') buttons = hrFinanceButtons;
  else if (workerLike) buttons = workerButtons;
  else buttons = workerButtons;

  // --- Mobile drawer state + a11y refs ---
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawerRef = useRef(null);
  const hamburgerRef = useRef(null);

  // Close drawer on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // ESC to close
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setMobileOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Manage focus + inert when opening/closing
  useEffect(() => {
    const el = drawerRef.current;
    if (!el) return;

    if (mobileOpen) {
      el.removeAttribute('inert');
      el.setAttribute('aria-hidden', 'false');
      // focus first focusable item
      const first = el.querySelector('button, [href], [tabindex]:not([tabindex="-1"])');
      if (first) first.focus();
    } else {
      el.setAttribute('aria-hidden', 'true');
      el.setAttribute('inert', '');
      // if focus was inside, return it to hamburger
      if (el.contains(document.activeElement)) {
        hamburgerRef.current?.focus();
      }
    }
  }, [mobileOpen]);

  // Keyboard support on brand/home button
  const onBrandKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      navigate('/');
    }
  };

  return (
    <>
      <div className="topnav">
        {/* Left: brand (BrandMark + title) */}
        <div
          className="left"
          onClick={() => navigate('/')}
          onKeyDown={onBrandKeyDown}
          role="button"
          tabIndex={0}
          aria-label="Go to Home"
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <BrandMark size={28} />
          <span className="brand" style={{ fontWeight: 800 }}></span>
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

        {/* Right: logout + avatar + hamburger */}
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
            ref={hamburgerRef}
            className="hamburger"
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            aria-controls="mobile-drawer"
            onClick={() => setMobileOpen(true)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>

      {/* Backdrop (non-focusable) */}
      <div
        className={`mobile-backdrop ${mobileOpen ? 'show' : ''}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        id="mobile-drawer"
        ref={drawerRef}
        className={`mobile-drawer ${mobileOpen ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={!mobileOpen}
        tabIndex={-1}
      >
        <div className="drawer-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div className="drawer-brand" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BrandMark size={24} />
            <span>Kart Force</span>
          </div>
          <button
            className="drawer-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            ×
          </button>
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
