// src/components/TopNav.js
import React from 'react';
import { useNavigate } from 'react-router-dom';
import './TopNav.css';

const TopNav = ({ role }) => {
  const navigate = useNavigate();

  const tracks = [
    'Syringa Park',
    'Epic Karting Pavilion',
    'Midlands',
    'Clearwater',
    'Indykart Parkview'
  ];

  const goToTrack = (trackName) => {
    const formatted = trackName.toLowerCase().replace(/\s+/g, '-');
    navigate(`/track-details/${formatted}`);
  };

  return (
    <div className="top-nav">
      <div className="logo-text">Kart Force</div>
      <div className="middle">
        {role === 'admin' && tracks.map(track => (
          <button
            key={track}
            className="nav-button"
            onClick={() => goToTrack(track)}
          >
            {track}
          </button>
        ))}
      </div>
      <button className="logout-button" onClick={() => navigate('/')}>
        Logout
      </button>
    </div>
  );
};

export default TopNav;
