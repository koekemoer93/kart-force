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

function formatHHmm(d) {
  if (!d) return '';
  try {
    return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(d);
  } catch {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
}

function minutesBetween(a, b) {
  if (!a || !b) return 0;
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 60000));
}

function parseTimeHHmm(str) {
  // "08:00" -> minutes since 00:00
  if (!str || !/^\d{2}:\d{2}$/.test(str)) return null;
  const [hh, mm] = str.split(':').map(Number);
  return hh * 60 + mm;
}

// --- Constants (unchanged lists) ---
const STATUS_OPTIONS = ['all', 'pending', 'approved', 'denied'];
const ROLE_OPTIONS = ['all', 'worker', 'workshopManager', 'mechanic', 'reception', 'marshall'];
const TRACK_OPTIONS = ['all', 'SyringaPark', 'Epic Karting Pavilion', 'Midlands'];

// --- New constants for reports ---
const DEFAULT_STANDARD_HOURS_PER_DAY = 9; // can adjust in UI
const DEFAULT_SHIFT_START = '08:00';
const DEFAULT_LATE_GRACE_MINUTES = 5;

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

  // ----- NEW: report filters -----
  const [repFrom, setRepFrom] = useState(() => new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString().slice(0, 10)); // last 7 days
  const [repTo, setRepTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [repTrack, setRepTrack] = useState('all');
  const [repRole, setRepRole] = useState('all');
  const [stdHours, setStdHours] = useState(DEFAULT_STANDARD_HOURS_PER_DAY);
  const [shiftStart, setShiftStart] = useState(DEFAULT_SHIFT_START);
  const [lateGrace, setLateGrace] = useState(DEFAULT_LATE_GRACE_MINUTES);
  const [reportLoading, setReportLoading] = useState(false);

  // ----- NEW: results -----
  const [taskAnalytics, setTaskAnalytics] = useState(null);
  const [overtimeRows, setOvertimeRows] = useState([]);
  const [lateRows, setLateRows] = useState([]);

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
                role: u.role || '',
                assignedTrack: u.assignedTrack || '',
              }];
            }
          } catch (_) { /* noop */ }
          return [uid, { email: '', phone: '', displayName: '', role: '', assignedTrack: '' }];
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

  // -------------------------
  // NEW: Reports (Tasks + TimeEntries)
  // -------------------------
  const runReports = async () => {
    setReportLoading(true);
    try {
      // Date window
      const from = parseDateYYYYMMDD(repFrom);
      const to = parseDateYYYYMMDD(repTo);
      if (!from || !to || to < from) {
        alert('Please select a valid date range.');
        setReportLoading(false);
        return;
      }

      // Fetch tasks in range (client-side filter to avoid extra composite indexes)
      const taskSnap = await getDocs(collection(db, 'tasks'));
      const tasks = [];
      taskSnap.forEach((d) => {
        const t = { id: d.id, ...d.data() };
        // Expecting task.date === "YYYY-MM-DD"
        if (!t.date) return;
        const dt = parseDateYYYYMMDD(t.date);
        if (!dt) return;
        if (dt < from || dt > to) return;
        if (repTrack !== 'all' && t.assignedTrack !== repTrack) return;
        if (repRole !== 'all' && (t.role || '').toLowerCase() !== repRole.toLowerCase()) return;
        tasks.push(t);
      });

      // Compute completion stats
      const totalTasks = tasks.length;
      const completedTasks = tasks.filter(t => Array.isArray(t.completedBy) && t.completedBy.length > 0).length;

      const byTrack = {};
      const byRole = {};
      tasks.forEach(t => {
        const tr = t.assignedTrack || 'Unknown';
        const rl = t.role || 'Unknown';
        if (!byTrack[tr]) byTrack[tr] = { total: 0, done: 0 };
        if (!byRole[rl]) byRole[rl] = { total: 0, done: 0 };
        byTrack[tr].total += 1;
        byRole[rl].total += 1;
        const done = Array.isArray(t.completedBy) && t.completedBy.length > 0;
        if (done) {
          byTrack[tr].done += 1;
          byRole[rl].done += 1;
        }
      });

      setTaskAnalytics({
        window: { from: repFrom, to: repTo },
        filterTrack: repTrack,
        filterRole: repRole,
        totals: { totalTasks, completedTasks, completionRate: totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0 },
        byTrack,
        byRole
      });

      // Fetch time entries in range (client-side filter)
      const teSnap = await getDocs(collection(db, 'timeEntries'));
      const byUserDate = {}; // { uid|dateKey: { uid, dateKey, dateStr, entries: [], totalMinutes } }
      const overtime = [];
      const late = [];

      const shiftStartMins = parseTimeHHmm(shiftStart) ?? parseTimeHHmm(DEFAULT_SHIFT_START) ?? 8 * 60;
      const grace = Number.isFinite(Number(lateGrace)) ? Number(lateGrace) : DEFAULT_LATE_GRACE_MINUTES;
      const standardDayMins = Math.max(0, Math.floor((Number(stdHours) || DEFAULT_STANDARD_HOURS_PER_DAY) * 60));

      teSnap.forEach((d) => {
        const e = { id: d.id, ...d.data() };
        const clockInAt = e.clockInAt?.toDate ? e.clockInAt.toDate() : (e.clockInAt instanceof Date ? e.clockInAt : null);
        const clockOutAt = e.clockOutAt?.toDate ? e.clockOutAt.toDate() : (e.clockOutAt instanceof Date ? e.clockOutAt : null);
        if (!clockInAt) return;
        const day = new Date(clockInAt.getFullYear(), clockInAt.getMonth(), clockInAt.getDate());
        if (day < from || day > to) return;
        if (repTrack !== 'all' && e.trackId !== repTrack) return;

        // Optional role filter via userCache (best-effort once we have cache); fallback passes
        const roleOk = (repRole === 'all')
          || (e.uid && userCache[e.uid]?.role && userCache[e.uid]?.role.toLowerCase() === repRole.toLowerCase());

        if (!roleOk) return;

        const dateKey = day.toISOString().slice(0, 10);
        const key = `${e.uid || 'unknown'}|${dateKey}`;
        if (!byUserDate[key]) {
          byUserDate[key] = {
            uid: e.uid || 'unknown',
            dateKey,
            dateStr: dateKey,
            entries: [],
            totalMinutes: 0,
            trackId: e.trackId || '',
          };
        }
        const entryMinutes = clockOutAt ? minutesBetween(clockInAt, clockOutAt) : 0;
        byUserDate[key].entries.push(e);
        byUserDate[key].totalMinutes += entryMinutes;

        // Late?
        const clockInMins = clockInAt.getHours() * 60 + clockInAt.getMinutes();
        const lateBy = clockInMins - (shiftStartMins + grace);
        if (lateBy > 0) {
          late.push({
            uid: e.uid || 'unknown',
            name: (e.uid && userCache[e.uid]?.displayName) || '',
            track: e.trackId || '',
            date: dateKey,
            clockIn: formatHHmm(clockInAt),
            minutesLate: lateBy,
          });
        }
      });

      // Overtime rows
      Object.values(byUserDate).forEach((row) => {
        if (row.totalMinutes > standardDayMins) {
          const uid = row.uid;
          const name = (uid && userCache[uid]?.displayName) || '';
          const role = (uid && userCache[uid]?.role) || '';
          overtime.push({
            uid,
            name,
            role,
            track: row.trackId || '',
            date: row.dateStr,
            hoursWorked: (row.totalMinutes / 60).toFixed(2),
            overtimeHours: ((row.totalMinutes - standardDayMins) / 60).toFixed(2),
          });
        }
      });

      setOvertimeRows(overtime.sort((a, b) => a.date.localeCompare(b.date)));
      setLateRows(late.sort((a, b) => a.date.localeCompare(b.date)));
    } catch (err) {
      console.error('runReports error:', err);
      alert('Failed to run reports. Check console for details.');
    } finally {
      setReportLoading(false);
    }
  };

  const exportOvertimeCSV = () => {
    const header = ['UID', 'Name', 'Role', 'Track', 'Date', 'Hours Worked', 'Overtime Hours'];
    const rows = overtimeRows.map(r => [r.uid, r.name, r.role, r.track, r.date, r.hoursWorked, r.overtimeHours]);
    downloadCSV(`overtime-${repFrom}_to_${repTo}.csv`, [header, ...rows]);
  };

  const exportLateCSV = () => {
    const header = ['UID', 'Name', 'Track', 'Date', 'Clock In', 'Minutes Late'];
    const rows = lateRows.map(r => [r.uid, r.name, r.track, r.date, r.clockIn, r.minutesLate]);
    downloadCSV(`late-clockins-${repFrom}_to_${repTo}.csv`, [header, ...rows]);
  };

  return (
    <>
      <TopNav role="admin" />

      <div className="main-wrapper" style={{ marginTop: 80 }}>
        <div className="glass-card" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Leave Requests</h2>

          {/* Overview badges (neutralized colors) */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <span className="chip" style={{ background: '#2d2d2d' }}>Total: {counts.total}</span>
            <span className="chip" style={{ background: '#2d2d2d' }}>Pending: {counts.pending || 0}</span>
            <span className="chip" style={{ background: '#2d2d2d' }}>Approved: {counts.approved || 0}</span>
            <span className="chip" style={{ background: '#2d2d2d' }}>Denied: {counts.denied || 0}</span>
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

        {/* =========================
            NEW: Reports Section
           ========================= */}
        <div className="glass-card" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>HR & Employees — Reports</h2>

          {/* Report filters */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr) repeat(2, 1fr) repeat(3, 1fr) auto', gap: 12 }}>
            <input className="input" type="date" value={repFrom} onChange={(e) => setRepFrom(e.target.value)} />
            <input className="input" type="date" value={repTo} onChange={(e) => setRepTo(e.target.value)} />

            <select className="input" value={repTrack} onChange={e => setRepTrack(e.target.value)}>
              {TRACK_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
            <select className="input" value={repRole} onChange={e => setRepRole(e.target.value)}>
              {ROLE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>

            <input
              className="input"
              type="number"
              min={0}
              step={0.5}
              value={stdHours}
              onChange={(e) => setStdHours(e.target.value)}
              placeholder="Std hours/day"
              title="Standard hours per day (overtime threshold)"
            />
            <input
              className="input"
              type="time"
              value={shiftStart}
              onChange={(e) => setShiftStart(e.target.value)}
              title="Shift start time (HH:mm)"
            />
            <input
              className="input"
              type="number"
              min={0}
              value={lateGrace}
              onChange={(e) => setLateGrace(e.target.value)}
              placeholder="Grace min"
              title="Late clock-in grace (minutes)"
            />

            <button className="button-primary" onClick={runReports} disabled={reportLoading}>
              {reportLoading ? 'Running…' : 'Run Reports'}
            </button>
          </div>

          {/* Task completion analytics */}
          {taskAnalytics && (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ marginTop: 0 }}>Task Completion ( {taskAnalytics.window.from} → {taskAnalytics.window.to} )</h3>
              <div className="glass-card" style={{ padding: 12, marginBottom: 12 }}>
                <p style={{ margin: 0 }}>
                  <strong>Filters:</strong> Track = {taskAnalytics.filterTrack}, Role = {taskAnalytics.filterRole}
                </p>
                <p style={{ margin: '8px 0 0 0' }}>
                  <strong>Totals:</strong> {taskAnalytics.totals.completedTasks}/{taskAnalytics.totals.totalTasks} completed
                  &nbsp;•&nbsp; {taskAnalytics.totals.completionRate}% overall
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="glass-card" style={{ padding: 12 }}>
                  <h4 style={{ marginTop: 0 }}>By Track</h4>
                  {Object.keys(taskAnalytics.byTrack).length === 0 ? (
                    <p>No tasks found.</p>
                  ) : (
                    Object.entries(taskAnalytics.byTrack).map(([trk, v]) => {
                      const rate = v.total ? Math.round((v.done / v.total) * 100) : 0;
                      return (
                        <div key={trk} style={{ marginBottom: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <strong>{trk}</strong>
                            <span>{v.done}/{v.total} ({rate}%)</span>
                          </div>
                          <div style={{ width: '100%', background: '#2b2b2b', borderRadius: 8, height: 10, overflow: 'hidden' }}>
                            <div style={{ width: `${rate}%`, height: '100%', background: '#5eead4' }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="glass-card" style={{ padding: 12 }}>
                  <h4 style={{ marginTop: 0 }}>By Role</h4>
                  {Object.keys(taskAnalytics.byRole).length === 0 ? (
                    <p>No tasks found.</p>
                  ) : (
                    Object.entries(taskAnalytics.byRole).map(([role, v]) => {
                      const rate = v.total ? Math.round((v.done / v.total) * 100) : 0;
                      return (
                        <div key={role} style={{ marginBottom: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <strong>{role}</strong>
                            <span>{v.done}/{v.total} ({rate}%)</span>
                          </div>
                          <div style={{ width: '100%', background: '#2b2b2b', borderRadius: 8, height: 10, overflow: 'hidden' }}>
                            <div style={{ width: `${rate}%`, height: '100%', background: '#5eead4' }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Overtime and late clock-ins */}
          {(overtimeRows.length > 0 || lateRows.length > 0) && (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ marginTop: 0 }}>Time Reports</h3>

              <div className="glass-card" style={{ padding: 12, marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <button className="button-primary" onClick={exportOvertimeCSV} disabled={overtimeRows.length === 0}>Export Overtime CSV</button>
                  <button className="button-primary" onClick={exportLateCSV} disabled={lateRows.length === 0}>Export Late Clock-ins CSV</button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="glass-card" style={{ padding: 12 }}>
                  <h4 style={{ marginTop: 0 }}>Overtime ( {stdHours}h/day)</h4>
                  {overtimeRows.length === 0 ? (
                    <p>No overtime entries.</p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Date</th><th>Name</th><th>Role</th><th>Track</th><th>Hours Worked</th><th>Overtime Hours</th>
                          </tr>
                        </thead>
                        <tbody>
                          {overtimeRows.map((r, i) => (
                            <tr key={i}>
                              <td>{r.date}</td>
                              <td>{r.name || r.uid}</td>
                              <td>{r.role}</td>
                              <td>{r.track}</td>
                              <td>{r.hoursWorked}</td>
                              <td>{r.overtimeHours}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="glass-card" style={{ padding: 12 }}>
                  <h4 style={{ marginTop: 0 }}>Late Clock-ins (start {shiftStart} + {lateGrace}m)</h4>
                  {lateRows.length === 0 ? (
                    <p>No late clock-ins.</p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Date</th><th>Name</th><th>Track</th><th>Clock In</th><th>Minutes Late</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lateRows.map((r, i) => (
                            <tr key={i}>
                              <td>{r.date}</td>
                              <td>{r.name || r.uid}</td>
                              <td>{r.track}</td>
                              <td>{r.clockIn}</td>
                              <td>{r.minutesLate}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Existing Leave List */}
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
                        {/* Status chip: neutral styling (no highlight) */}
                        <span className="chip" style={{ background: '#2f2f2f' }}>
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

                        {(userMeta?.email || userMeta?.phone) && (
                          <p style={{ margin: 0 }}>
                            <strong>Contact:</strong> {userMeta?.email || '—'}{userMeta?.phone ? ` • ${userMeta.phone}` : ''}
                          </p>
                        )}

                        {req.attachmentUrl && (
                          <p style={{ margin: 0 }}>
                            <strong>Attachment:</strong>{' '}
                            <a href={req.attachmentUrl} target="_blank" rel="noreferrer">View file</a>
                          </p>
                        )}

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
