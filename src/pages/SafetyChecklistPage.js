// src/pages/SafetyChecklistPage.js
import React, { useState } from 'react';
import TopNav from '../components/TopNav';
import { useAuth } from '../AuthContext';
import { useSafetyChecklist } from '../hooks/useSafetyChecklist';

export default function SafetyChecklistPage() {
  const { user, userData } = useAuth();
  const trackId = userData?.assignedTrack || '';
  const { items, loading, error, weekStartDate, uploadProofAndMark } = useSafetyChecklist(trackId, user?.uid);
  const [busyId, setBusyId] = useState(null);

  return (
    <>
      <TopNav role="worker" />
      <div className="main-wrapper" style={{ padding: 16 }}>
        <div className="glass-card" style={{ maxWidth: 800, margin: '0 auto' }}>
          <h2 style={{ marginTop: 0 }}>Health & Safety — Weekly Checklist</h2>
          <p style={{ opacity: 0.8, marginTop: -6 }}>Week starting {weekStartDate.toLocaleDateString()}</p>
          {loading && <p>Loading…</p>}
          {error && <p style={{ color: '#f88' }}>{error}</p>}
          {!loading && items.length === 0 && <p>No items yet.</p>}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {items.map(item => {
              const done = Array.isArray(item.completedBy) && item.completedBy.includes(user?.uid);
              const myProofs = (item.proofs && item.proofs[user?.uid]) || [];
              return (
                <li key={item.id} className="glass-card" style={{ margin: '10px 0', padding: 12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                    <div>
                      <strong>{item.title}</strong>
                      <div style={{ fontSize:12, opacity:0.8 }}>{done ? 'Completed' : 'Pending'}</div>
                    </div>
                    <div>
                      <label style={{ fontSize: 13, cursor:'pointer' }}>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          style={{ display:'none' }}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              setBusyId(item.id);
                              await uploadProofAndMark(item, file, user.uid);
                            } catch (err) {
                              alert(err.message);
                            } finally {
                              setBusyId(null);
                              e.target.value = '';
                            }
                          }}
                        />
                        <span className="button-primary" style={{ padding: '6px 12px' }}>
                          {busyId === item.id ? 'Uploading…' : (done ? 'Add More Proof' : 'Upload Proof & Complete')}
                        </span>
                      </label>
                    </div>
                  </div>
                  {myProofs.length > 0 && (
                    <div style={{ marginTop: 8, display:'flex', gap:8, flexWrap:'wrap' }}>
                      {myProofs.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noreferrer">
                          <img src={url} alt="proof" style={{ width: 96, height: 96, objectFit:'cover', borderRadius:8 }} />
                        </a>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </>
  );
}
