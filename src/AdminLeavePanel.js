// src/AdminLeavePanel.js
import React, { useEffect, useState } from 'react';
import { db } from './firebase';
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  query,
  orderBy
} from 'firebase/firestore';
import './theme.css';
import TopNav from './components/TopNav';

function AdminLeavePanel() {
  const [leaveRequests, setLeaveRequests] = useState([]);

  useEffect(() => {
    const fetchLeaveRequests = async () => {
      const q = query(collection(db, 'leaveRequests'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setLeaveRequests(data);
    };

    fetchLeaveRequests();
  }, []);

  const updateStatus = async (id, newStatus) => {
    const ref = doc(db, 'leaveRequests', id);
    await updateDoc(ref, { status: newStatus });

    setLeaveRequests((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: newStatus } : item
      )
    );
  };

  return (
    <>
      <TopNav role="admin" />

      <div className="main-wrapper" style={{ marginTop: 80 }}>
        <div className="glass-card">
          <h2>Leave Requests</h2>
          {leaveRequests.length === 0 ? (
            <p>No leave requests found.</p>
          ) : (
            leaveRequests.map((req) => (
              <div key={req.id} className="glass-card" style={{ marginBottom: 20 }}>
                <p><strong>Name:</strong> {req.name}</p>
                <p><strong>Role:</strong> {req.role}</p>
                <p><strong>Track:</strong> {req.track}</p>
                <p><strong>From:</strong> {req.fromDate}</p>
                <p><strong>To:</strong> {req.toDate}</p>
                <p><strong>Reason:</strong> {req.reason}</p>
                <p><strong>Status:</strong> {req.status}</p>

                {req.status === 'pending' && (
                  <div style={{ marginTop: 12, display: 'flex', gap: '12px' }}>
                    <button className="button-primary" onClick={() => updateStatus(req.id, 'approved')}>
                      Approve
                    </button>
                    <button className="button-primary" onClick={() => updateStatus(req.id, 'denied')}>
                      Deny
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

export default AdminLeavePanel;
