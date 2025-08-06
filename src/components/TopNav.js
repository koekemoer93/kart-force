import React from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';

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

  const trackButtons = [
    { label: 'Dashboard', path: '/admin-dashboard' },
    { label: 'Syringa Park', path: '/track/syringa' },
    { label: 'Epic Karting Pavilion', path: '/track/pavilion' },
    { label: 'Midlands', path: '/track/midlands' },
    { label: 'Clearwater', path: '/track/clearwater' },
    { label: 'Indykart Parkview', path: '/track/parkview' },
  ];

  return (
    <div className="top-nav">
      <div className="nav-left">
        <h1 className="logo-text">Kart Force</h1>
        {role === 'admin' && (
          <div className="nav-buttons">
            {trackButtons.map((button, idx) => (
              <button
                key={idx}
                className="nav-btn"
                onClick={() => navigate(button.path)}
              >
                {button.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="nav-right">
        <button className="logout-btn" onClick={handleLogout}>Logout</button>
      </div>
    </div>
  );
};

export default TopNav;
