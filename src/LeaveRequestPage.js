// src/LeaveRequestPage.js
import React, { useState } from 'react';
import { db } from './firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import './theme.css';
import TopNav from './components/TopNav';

function LeaveRequestPage() {
  const { user, userData } = useAuth(); // Get user info from context
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!fromDate || !toDate || !reason) {
      setStatus('Please fill in all fields.');
      return;
    }

    try {
      await addDoc(collection(db, 'leaveRequests'), {
        uid: user.uid,
        name: userData?.name || '',
        role: userData?.role || '',
        track: userData?.assignedTrack || '',
        fromDate,
        toDate,
        reason,
        status: 'pending',
        createdAt: serverTimestamp()
      });

      setStatus('✅ Leave request submitted!');
      setFromDate('');
      setToDate('');
      setReason('');
    } catch (error) {
      setStatus('❌ Failed to submit leave request.');
    }
  };

  return (
    <>
      <TopNav />

      <div className="main-wrapper" style={{ marginTop: 80 }}>
        <div className="glass-card">
          <h2>Request Leave</h2>

          <form onSubmit={handleSubmit}>
            <label>From Date:</label>
            <input
              type="date"
              className="input-field"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />

            <label>To Date:</label>
            <input
              type="date"
              className="input-field"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />

            <label>Reason:</label>
            <textarea
              className="input-field"
              rows="4"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            ></textarea>

            <div style={{ marginTop: 20 }}>
              <button type="submit" className="button-primary">
                Submit Request
              </button>
            </div>
          </form>

          {status && <p style={{ marginTop: 16 }}>{status}</p>}
        </div>
      </div>
    </>
  );
}

export default LeaveRequestPage;
