// src/pages/HRFinancePage.js
import React from 'react';
import TopNav from '../components/TopNav';
import { useAuth } from '../AuthContext';

export default function HRFinancePage() {
  const { userData } = useAuth();
  return (
    <>
      <TopNav role="admin" />
      <div className="main-wrapper" style={{ padding: 16 }}>
        <div className="glass-card" style={{ maxWidth: 960, margin: '0 auto' }}>
          <h2 style={{ marginTop: 0 }}>HR & Finance</h2>
          <p style={{ opacity: 0.85 }}>This page will summarize clock-ins/outs, leave, overtime and month-end totals. (Coming soon)</p>
        </div>
      </div>
    </>
  );
}
