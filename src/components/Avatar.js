// src/components/Avatar.js
// ⬇️ Paste this entire file

import React from 'react';
import './Avatar.css';

export default function Avatar({ src, alt = 'User', size = 36 }) {
  const initials = alt
    ? alt.trim().split(/\s+/).map(s => s[0]?.toUpperCase()).slice(0,2).join('')
    : '?';

  return (
    <div
      className="avatar-wrap"
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
      title={alt}
    >
      {src ? (
        <img src={src} alt={alt} className="avatar-img" />
      ) : (
        <div className="avatar-fallback">{initials}</div>
      )}
    </div>
  );
}
