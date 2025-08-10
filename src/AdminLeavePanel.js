// src/AdminLeavePanel.js
import React, { useEffect, useMemo, useState } from 'react';
import { db } from './firebase';
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  query,
  orderBy,
  onSnapshot,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';
import './theme.css';
import TopNav from './components/TopNav';
import { useAuth } from './AuthContext';

// --- Helpers ---
function parseDateYYYYMMDD(s) {
  // supports "YYYY-MM-DD" or Date/string-ish; returns Date at local midnight
  if (!s) return null;
  if (s instanceof Date) return new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const parts = String(s).split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts.map((x) => parseInt(x, 10));
    return new Date(y, (m || 1) - 1, d || 1);
  }
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return null;
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

function daysInclusive(fromDate, toDate) {
  const a = parseDateYYYYMMDD(fromDate);
  const b = parseDateYYYYMMDD(toDate);
  if (!a || !b) return null;
  const ms = b.getTime() - a.getTime();
  const diff = Math.floor(ms / (1000 * 60 * 60 * 24));
  return diff >= 0 ? diff + 1 : null;
}

function timeAgo(from) {
  if (!from) return '';
  const ms = Date.now() - from.getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function toLocalDTString(ts) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    }).format(ts);
  } catch {
    return ts?.toString?.() || '';
  }
}

function badgeColor(status) {
  switch (status) {
    case 'approved': return '#18d17c';
    case 'denied': return '#ff6b6b';
    default: return '#e0b043'; // pending / default
  }
}

function csvEscape(val) {
  if (val == null) return '';
  const s = String(val);
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadCSV(filename, rows) {
  const csv = rows.map(r => r.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const STATUS_OPTIONS = ['all', 'pending', 'approved', 'denied'];
const ROLE_OPTIONS = ['all', 'worker', 'workshopManager', 'mechanic', 'reception', 'marshall'];
const TRACK_OPTIONS = ['all', 'SyringaPark', 'Epic Karting Pavilion', 'Midlands'];

function AdminLeavePanel() {
  const { user: authUser, profile: authProfile } = useAuth(); // for approver fields
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [userCache, setUserCache] = useState({}); // uid -> {email, phone, displayName}
  const [loading, setLoading] = useState(true);

  // filters
  const [statusFilter, setStatusFilter] = useState('pending');
  const [roleFilter, setRoleFilter] = useState('all');
  const [trackFilter, setTrackFilter] = useState('all');
  const [search, setSearch] = useState('');

  // notes keyed by request id
  const [notes, setNotes] = useState({}); // { [id]: string }

  // live subscribe to leaveRequests
  useEffect(() => {
    const qRef = query(collection(db, 'leaveRequests'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(qRef, async (snap) => {
      const base = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setLeaveRequests(base);
      // fetch missing user profiles
      const missingUids = Array.from(new Set(base.map(r => r.uid).filter(Boolean)))
        .filter(uid => !userCache[uid]);

      if (missingUids.length > 0) {
        const pairs = await Promise.all(missingUids.map(async (uid) => {
          try {
            const udoc = await getDoc(doc(db, 'users', uid));
            if (udoc.exists()) {
              const u = udoc.data();
              return [uid, {
                email: u.email || '',
                phone: u.phone || u.phoneNumber || '',
                displayName: u.displayName || u.name || '',
              }];
            }
          } catch (_) { /* noop */ }
          return [uid, { email: '', phone: '', displayName: '' }];
        }));
        setUserCache(prev => {
          const next = { ...prev };
          for (const [uid, val] of pairs) next[uid] = val;
          return next;
        });
      }
      setLoading(false);
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return leaveRequests.filter((r) => {
      if (statusFilter !== 'all' && (r.status || 'pending') !== statusFilter) return false;
      if (roleFilter !== 'all' && (r.role || '').toLowerCase() !== roleFilter.toLowerCase()) return false;
      if (trackFilter !== 'all' && (r.track || '') !== trackFilter) return false;

      if (s) {
        const userMeta = r.uid ? userCache[r.uid] : null;
        const hay = [
          r.name, r.reason, r.track, r.role, r.leaveType,
          userMeta?.email, userMeta?.displayName, userMeta?.phone,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(s)) return false;
      }

      return true;
    });
  }, [leaveRequests, statusFilter, roleFilter, trackFilter, search, userCache]);

  const counts = useMemo(() => {
    const c = { total: leaveRequests.length, pending: 0, approved: 0, denied: 0 };
    leaveRequests.forEach(r => { c[r.status || 'pending'] = (c[r.status || 'pending'] || 0) + 1; });
    return c;
  }, [leaveRequests]);

  const updateStatus = async (id, newStatus) => {
    const req = leaveRequests.find((x) => x.id === id);
    if (!req) return;

    const note = (notes[id] || '').trim();
    const ref = doc(db, 'leaveRequests', id);
    await updateDoc(ref, {
      status: newStatus,
      approverUid: authUser?.uid || null,
      approverName: authProfile?.displayName || authProfile?.name || authUser?.email || 'Admin',
      decidedAt: serverTimestamp(),
      managerNote: note || null,
    });

    // local optimistic update
    setLeaveRequests((prev) =>
      prev.map((item) =>
        item.id === id ? {
          ...item,
          status: newStatus,
          approverUid: authUser?.uid || null,
          approverName: authProfile?.displayName || authProfile?.name || authUser?.email || 'Admin',
          decidedAt: new Date(),
          managerNote: note || null,
        } : item
      )
    );
    setNotes((prev) => ({ ...prev, [id]: '' }));
  };

  const exportCSV = () => {
    const header = [
      'Name', 'Role', 'Track', 'Leave Type', 'From', 'To',
      'Days', 'Reason', 'Status', 'Created At', 'Decided At',
      'Approver', 'Email', 'Phone'
    ];
    const rows = filtered.map((r) => {
      const userMeta = r.uid ? userCache[r.uid] : null;
      const d = daysInclusive(r.fromDate, r.toDate);
      const createdAt = r.createdAt?.toDate ? r.createdAt.toDate() : (r.createdAt instanceof Date ? r.createdAt : null);
      const decidedAt = r.decidedAt?.toDate ? r.decidedAt.toDate() : (r.decidedAt instanceof Date ? r.decidedAt : null);
      return [
        r.name || userMeta?.displayName || '',
        r.role || '',
        r.track || '',
        r.leaveType || '',
        r.fromDate || '',
        r.toDate || '',
        d ?? '',
        r.reason || '',
        r.status || 'pending',
        createdAt ? toLocalDTString(createdAt) : '',
        decidedAt ? toLocalDTString(decidedAt) : '',
        r.approverName || '',
        userMeta?.email || '',
        userMeta?.phone || '',
      ];
    });
    downloadCSV(`leave-requests-${new Date().toISOString().slice(0,10)}.csv`, [header, ...rows]);
  };

  return (
    <>
      <TopNav role="admin" />

      <div className="main-wrapper" style={{ marginTop: 80 }}>
        <div className="glass-card" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Leave Requests</h2>

          {/* Overview badges */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <span className="chip" style={{ background: '#2d2d2d' }}>Total: {counts.total}</span>
            <span className="chip" style={{ background: badgeColor('pending') }}>Pending: {counts.pending || 0}</span>
            <span className="chip" style={{ background: badgeColor('approved') }}>Approved: {counts.approved || 0}</span>
            <span className="chip" style={{ background: badgeColor('denied') }}>Denied: {counts.denied || 0}</span>
          </div>

          {/* Filters */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 2fr auto', gap: 12 }}>
            <select className="input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              {STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt[0].toUpperCase() + opt.slice(1)}</option>)}
            </select>
            <select className="input" value={trackFilter} onChange={e => setTrackFilter(e.target.value)}>
              {TRACK_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
            <select className="input" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
              {ROLE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
            <input
              className="input"
              placeholder="Search name, reason, email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button className="button-primary" onClick={exportCSV}>Export CSV</button>
          </div>
        </div>

        <div className="glass-card">
          {loading ? (
            <p>Loading…</p>
          ) : filtered.length === 0 ? (
            <p>No leave requests found.</p>
          ) : (
            filtered.map((req) => {
              const userMeta = req.uid ? userCache[req.uid] : null;
              const d = daysInclusive(req.fromDate, req.toDate);
              const createdAt = req.createdAt?.toDate ? req.createdAt.toDate() : (req.createdAt instanceof Date ? req.createdAt : null);
              const decidedAt = req.decidedAt?.toDate ? req.decidedAt.toDate() : (req.decidedAt instanceof Date ? req.decidedAt : null);

              return (
                <div key={req.id} className="glass-card" style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <h3 style={{ margin: 0 }}>{req.name || userMeta?.displayName || 'Unknown user'}</h3>
                        <span className="chip" style={{ background: badgeColor(req.status || 'pending') }}>
                          {(req.status || 'pending').toUpperCase()}
                        </span>
                        {req.leaveType && <span className="chip" style={{ background: '#3a3a3a' }}>{req.leaveType}</span>}
                        {req.track && <span className="chip" style={{ background: '#2f2f2f' }}>{req.track}</span>}
                        {req.role && <span className="chip" style={{ background: '#2f2f2f' }}>{req.role}</span>}
                      </div>

                      <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                        <p style={{ margin: 0 }}><strong>From:</strong> {req.fromDate} &nbsp; <strong>To:</strong> {req.toDate}
                          {d != null && <> &nbsp; <strong>Days:</strong> {d}</>}
                        </p>
                        <p style={{ margin: 0 }}><strong>Reason:</strong> {req.reason || '—'}</p>
                        <p style={{ margin: 0 }}>
                          <strong>Requested:</strong> {createdAt ? toLocalDTString(createdAt) : '—'}
                          {createdAt && <> &nbsp; <em>({timeAgo(createdAt)})</em></>}
                        </p>

                        {/* Optional contact info */}
                        {(userMeta?.email || userMeta?.phone) && (
                          <p style={{ margin: 0 }}>
                            <strong>Contact:</strong> {userMeta?.email || '—'}{userMeta?.phone ? ` • ${userMeta.phone}` : ''}
                          </p>
                        )}

                        {/* Attachment, if provided */}
                        {req.attachmentUrl && (
                          <p style={{ margin: 0 }}>
                            <strong>Attachment:</strong>{' '}
                            <a href={req.attachmentUrl} target="_blank" rel="noreferrer">View file</a>
                          </p>
                        )}

                        {/* Decision info */}
                        {(req.approverName || decidedAt) && (
                          <p style={{ margin: 0 }}>
                            <strong>Decided by:</strong> {req.approverName || '—'}
                            {decidedAt && <> &nbsp; <strong>at</strong> {toLocalDTString(decidedAt)}</>}
                          </p>
                        )}
                        {req.managerNote && (
                          <p style={{ margin: 0 }}>
                            <strong>Manager note:</strong> {req.managerNote}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  {(req.status || 'pending') === 'pending' && (
                    <>
                      <textarea
                        className="input"
                        placeholder="Add an optional note to include with your decision…"
                        value={notes[req.id] || ''}
                        onChange={(e) => setNotes(prev => ({ ...prev, [req.id]: e.target.value }))}
                        style={{ width: '100%', minHeight: 64, marginTop: 12 }}
                      />
                      <div style={{ marginTop: 12, display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <button className="button-primary" onClick={() => updateStatus(req.id, 'approved')}>
                          Approve
                        </button>
                        <button className="button-primary" onClick={() => updateStatus(req.id, 'denied')}>
                          Deny
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}

export default AdminLeavePanel;
