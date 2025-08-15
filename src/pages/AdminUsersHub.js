import React, { useEffect, useMemo, useState } from "react";
import TopNav from "../components/TopNav";
import { useAuth } from "../AuthContext";
import { db } from "../firebase";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

// Optional (use if you already have these)
import { isAdmin } from "../utils/roles";
import { useTracks } from "../hooks/useTracks";

// ───────────────────────────────────────────────────────────────────────────────
// Theme helpers – keep in-file to avoid touching your CSS
// ───────────────────────────────────────────────────────────────────────────────
const cardStyle = {
  background: "rgba(23,24,26,0.85)",
  border: "1px solid #2a2d31",
  borderRadius: 16,
  padding: 12,
  boxShadow: "0 6px 24px rgba(0,0,0,0.35)",
};

const chip = (bg = "rgba(255,255,255,0.06)") => ({
  display: "inline-block",
  padding: "4px 10px",
  borderRadius: 999,
  border: "1px solid #2a2d31",
  background: bg,
  fontSize: 12,
});

// ───────────────────────────────────────────────────────────────────────────────
// Date helpers
// ───────────────────────────────────────────────────────────────────────────────
function toYMD(d) {
  const dd = new Date(d);
  const y = dd.getFullYear();
  const m = String(dd.getMonth() + 1).padStart(2, "0");
  const day = String(dd.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
function sameDay(a, b) {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() &&
         da.getMonth() === db.getMonth() &&
         da.getDate() === db.getDate();
}
function hoursBetween(a, b) {
  const ms = Math.max(0, (b?.getTime?.() ? b.getTime() : b) - (a?.getTime?.() ? a.getTime() : a));
  return ms / 1000 / 3600;
}

// ───────────────────────────────────────────────────────────────────────────────
// CSV helper
// ───────────────────────────────────────────────────────────────────────────────
function downloadCsv(filename, rows) {
  const csv = rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ───────────────────────────────────────────────────────────────────────────────
// Main page
// ───────────────────────────────────────────────────────────────────────────────
const TABS = [
  { key: "people", label: "People" },
  { key: "attendance", label: "Attendance" },
  { key: "payroll", label: "Payroll" },
  { key: "leave", label: "Leave" },
  { key: "training", label: "Training" },
  { key: "safety", label: "H&S" },
  { key: "incidents", label: "Incidents" },
  { key: "performance", label: "Performance" },
];

export default function AdminUsersHub() {
const { role: ctxRole } = useAuth();
const admin = isAdmin(ctxRole);          // no conditional, no dev fallback here
const { tracks } = useTracks();          // ✅ hooks must be unconditional

  const [tab, setTab] = useState("people");
  const [trackFilter, setTrackFilter] = useState(""); // "" = all
  const [roleFilter, setRoleFilter] = useState("");
  const [search, setSearch] = useState("");

  const [month, setMonth] = useState(startOfMonth());
  const [rangeStart, setRangeStart] = useState(startOfMonth());
  const [rangeEnd, setRangeEnd] = useState(endOfMonth());

  // Shared data
  const [users, setUsers] = useState([]);
  const [timeEntries, setTimeEntries] = useState([]); // you can scope by date if you want
  const [leaveReqs, setLeaveReqs] = useState([]);
  const [tasksToday, setTasksToday] = useState([]); // for H&S view
  const [certs, setCerts] = useState([]);
  const [incidents, setIncidents] = useState([]);

  // ── Live subscriptions (admin-only page) ─────────────────────────────────────
  useEffect(() => {
    if (!admin) return;

    // Users
    const unsubUsers = onSnapshot(
      query(collection(db, "users")),
      (snap) => setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );

    // Open time entries (on shift)
    const unsubTE = onSnapshot(
      query(collection(db, "timeEntries"), where("clockOutAt", "==", null)),
      (snap) => setTimeEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );

    // Leave requests
    const unsubLeave = onSnapshot(
      query(collection(db, "leaveRequests"), orderBy("createdAt", "desc")),
      (snap) => setLeaveReqs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );

    // Health & Safety: fetch today's tasks; if you tag H&S tasks with tag:'hs', we filter
    const unsubTasks = onSnapshot(
      query(collection(db, "tasks"), where("date", "==", toYMD(new Date()))),
      (snap) => setTasksToday(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );

    // Certifications (flat collection: certs)
    const unsubCerts = onSnapshot(
      query(collection(db, "certs"), orderBy("expiresAt", "asc")),
      (snap) => setCerts(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );

    // Incidents
    const unsubInc = onSnapshot(
      query(collection(db, "incidents"), orderBy("createdAt", "desc")),
      (snap) => setIncidents(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );

    return () => {
      unsubUsers(); unsubTE(); unsubLeave(); unsubTasks(); unsubCerts(); unsubInc();
    };
  }, [admin]);

  // Filters
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const okTrack = trackFilter ? (u.assignedTrack === trackFilter) : true;
      const okRole = roleFilter ? (u.role === roleFilter) : true;
      const q = search.trim().toLowerCase();
      const okSearch = !q || [u.displayName, u.email, u.role].filter(Boolean).join(" ").toLowerCase().includes(q);
      return okTrack && okRole && okSearch;
    });
  }, [users, trackFilter, roleFilter, search]);

  // Attendance: open sessions grouped
  const attendance = useMemo(() => {
    return timeEntries.map(te => {
      const u = users.find(x => x.id === te.uid || x.uid === te.uid) || {};
      const started = te.clockInAt?.toDate ? te.clockInAt.toDate() : (te.clockInAt instanceof Date ? te.clockInAt : null);
      const minsSoFar = started ? Math.floor((Date.now() - started.getTime()) / 60000) : 0;
      return { ...te, user: u, minsSoFar };
    }).sort((a,b) => (b.clockInAt?.seconds || 0) - (a.clockInAt?.seconds || 0));
  }, [timeEntries, users]);

  // Payroll aggregation within date range
  const [payrollRows, setPayrollRows] = useState([]);
  async function buildPayroll() {
    // pull entries between rangeStart and rangeEnd
    const rs = new Date(rangeStart), re = new Date(rangeEnd);
    const qy = query(
      collection(db, "timeEntries"),
      where("clockInAt", ">=", rs),
      where("clockInAt", "<=", re)
    );
    const snap = await getDocs(qy);
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // aggregate by user
    const byUser = {};
    rows.forEach(r => {
      const uid = r.uid;
      const user = users.find(u => u.id === uid || u.uid === uid);
      const name = user?.displayName || user?.name || uid;
      const cin = r.clockInAt?.toDate ? r.clockInAt.toDate() : null;
      const cout = r.clockOutAt?.toDate ? r.clockOutAt.toDate() : null;
      const hours = cin ? hoursBetween(cin, cout || new Date()) : 0;
      if (!byUser[uid]) byUser[uid] = { uid, name, trackId: r.trackId || user?.assignedTrack || "", totalHours: 0, days: new Set() };
      byUser[uid].totalHours += hours;
      if (cin) byUser[uid].days.add(toYMD(cin));
    });
    const out = Object.values(byUser).map(x => ({ ...x, daysCount: x.days.size }));
    setPayrollRows(out);
  }

  function exportPayrollCsv() {
    const rows = [
      ["UID", "Name", "Track", "Days Worked", "Total Hours (hh.mm)"]
    ];
    payrollRows.forEach(r => {
      rows.push([r.uid, r.name, r.trackId || "", String(r.daysCount), (Math.round(r.totalHours * 100) / 100).toFixed(2)]);
    });
    downloadCsv(`payroll_${toYMD(rangeStart)}_to_${toYMD(rangeEnd)}.csv`, rows);
  }

  // Leave calendar summary for selected month
  const leaveByDay = useMemo(() => {
    const s = startOfMonth(month), e = endOfMonth(month);
    const out = {};
    leaveReqs.forEach(lr => {
      const d = lr.date || lr.startDate; // support either field
      if (!d) return;
      const dd = new Date(d.seconds ? d.toDate() : d);
      if (dd >= s && dd <= e) {
        const ymd = toYMD(dd);
        out[ymd] = (out[ymd] || 0) + 1;
      }
    });
    return out;
  }, [leaveReqs, month]);

  // ────────────────────────────────────────────────────────────────────────────
  // Actions (admin-only)
  // ────────────────────────────────────────────────────────────────────────────
  async function approveLeave(id) {
    await updateDoc(doc(db, "leaveRequests", id), { status: "approved", decidedAt: serverTimestamp() });
  }
  async function denyLeave(id) {
    await updateDoc(doc(db, "leaveRequests", id), { status: "denied", decidedAt: serverTimestamp() });
  }
  async function addIncident(payload) {
    await addDoc(collection(db, "incidents"), { ...payload, createdAt: serverTimestamp() });
  }
  async function addCert(payload) {
    await addDoc(collection(db, "certs"), { ...payload, createdAt: serverTimestamp() });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#0f0f10", color: "#f5f5f7" }}>
      <TopNav />
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "10px 12px 80px" }}>
        {/* Filters row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8, marginBottom: 8 }}>
          <div style={{ ...cardStyle, display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <strong style={{ fontSize: 16 }}>Admin HR Hub</strong>
              <div style={chip()}>
                {users.length} employees
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
              <select
                value={trackFilter}
                onChange={(e) => setTrackFilter(e.target.value)}
                style={{ ...cardStyle, padding: 8 }}
              >
                <option value="">All Tracks</option>
                {tracks?.map(t => (
                  <option key={t.id || t.trackId} value={t.id || t.name || t.trackId}>
                    {t.name || t.id || t.trackId}
                  </option>
                ))}
              </select>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                style={{ ...cardStyle, padding: 8 }}
              >
                <option value="">All Roles</option>
                <option value="worker">worker</option>
                <option value="workshopManager">workshopManager</option>
                <option value="mechanic">mechanic</option>
                <option value="reception">reception</option>
                <option value="marshall">marshall</option>
                <option value="hrfinance">hrfinance</option>
                <option value="admin">admin</option>
              </select>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name/email/role"
                style={{ ...cardStyle, padding: 8 }}
              />
              <div style={{ ...cardStyle, padding: 8, display: "flex", gap: 8, overflowX: "auto" }}>
                {TABS.map(t => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    style={{
                      ...chip(tab === t.key ? "rgba(94,234,212,0.18)" : undefined),
                      borderColor: tab === t.key ? "#5eead4" : "#2a2d31",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Tab content */}
        <div style={{ display: "grid", gap: 10 }}>
          {tab === "people" && (
            <PeopleDirectory users={filteredUsers} onOpenPerformance={() => setTab("performance")} />
          )}

          {tab === "attendance" && (
            <AttendanceBoard attendance={attendance} />
          )}

          {tab === "payroll" && (
            <PayrollSection
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              setRangeStart={setRangeStart}
              setRangeEnd={setRangeEnd}
              onBuild={buildPayroll}
              rows={payrollRows}
              onExport={exportPayrollCsv}
            />
          )}

          {tab === "leave" && (
            <LeaveManager
              month={month}
              setMonth={setMonth}
              leaveReqs={leaveReqs}
              users={users}
              onApprove={approveLeave}
              onDeny={denyLeave}
            />
          )}

          {tab === "training" && (
            <TrainingCerts certs={certs} users={users} onAdd={addCert} />
          )}

          {tab === "safety" && (
            <SafetyChecklist tasks={tasksToday} />
          )}

          {tab === "incidents" && (
            <IncidentsLog incidents={incidents} users={users} onAdd={addIncident} />
          )}

          {tab === "performance" && (
            <PerformanceSnapshots users={filteredUsers} timeEntriesAll={timeEntries} incidents={incidents} />
          )}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Subcomponents
// ───────────────────────────────────────────────────────────────────────────────

function PeopleDirectory({ users, onOpenPerformance }) {
  return (
    <div style={{ ...cardStyle }}>
      <div style={{ display: "grid", gap: 8 }}>
        {users.map(u => (
          <div key={u.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, padding: 8, borderBottom: "1px solid #2a2d31" }}>
            <div style={{ display: "grid", gap: 2 }}>
              <div style={{ fontWeight: 600 }}>{u.displayName || u.name || u.email || u.id}</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                {u.role} • {u.assignedTrack || "Unassigned"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={chip()}>Shift mins: {u.shiftMinutes ?? 0}</span>
              <button onClick={onOpenPerformance} style={{ ...chip("rgba(94,234,212,0.18)"), borderColor: "#5eead4" }}>
                Performance
              </button>
            </div>
          </div>
        ))}
        {users.length === 0 && <div style={{ opacity: 0.7 }}>No users match filters.</div>}
      </div>
    </div>
  );
}

function AttendanceBoard({ attendance }) {
  return (
    <div style={{ ...cardStyle }}>
      <div style={{ marginBottom: 8, display: "flex", gap: 8, alignItems: "center" }}>
        <strong>Live Attendance</strong>
        <span style={chip()}>{attendance.length} on shift</span>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {attendance.map(a => (
          <div key={a.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", padding: 8, borderBottom: "1px solid #2a2d31" }}>
            <div style={{ display: "grid" }}>
              <div style={{ fontWeight: 600 }}>{a.user?.displayName || a.uid}</div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>
                {a.user?.role || "—"} • {a.trackId || a.user?.assignedTrack || "—"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={chip()}>{a.minsSoFar} mins</span>
              <span style={{ ...chip("rgba(36,255,152,0.08)"), borderColor: "#24ff98" }}>On shift</span>
            </div>
          </div>
        ))}
        {attendance.length === 0 && <div style={{ opacity: 0.7 }}>No one is currently clocked in.</div>}
      </div>
    </div>
  );
}

function PayrollSection({ rangeStart, rangeEnd, setRangeStart, setRangeEnd, onBuild, rows, onExport }) {
  return (
    <div style={{ ...cardStyle }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <strong>Payroll</strong>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <input type="date" value={toYMD(rangeStart)} onChange={(e) => setRangeStart(new Date(e.target.value))} style={{ ...cardStyle, padding: 8 }} />
          <input type="date" value={toYMD(rangeEnd)} onChange={(e) => setRangeEnd(new Date(e.target.value))} style={{ ...cardStyle, padding: 8 }} />
          <button onClick={onBuild} style={{ ...chip("rgba(94,234,212,0.18)"), borderColor: "#5eead4" }}>Build</button>
          <button onClick={onExport} style={{ ...chip() }}>Export CSV</button>
        </div>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {rows.map(r => (
          <div key={r.uid} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 0.6fr 0.8fr", padding: 8, borderBottom: "1px solid #2a2d31" }}>
            <div><strong>{r.name}</strong><div style={{ fontSize: 12, opacity: 0.8 }}>{r.uid}</div></div>
            <div>{r.trackId || "—"}</div>
            <div>{r.daysCount} days</div>
            <div>{(Math.round(r.totalHours * 100) / 100).toFixed(2)} h</div>
          </div>
        ))}
        {rows.length === 0 && <div style={{ opacity: 0.7 }}>Build to see totals for the selected range.</div>}
      </div>
    </div>
  );
}

function LeaveManager({ month, setMonth, leaveReqs, users, onApprove, onDeny }) {
  const ym = `${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,"0")}`;
  const s = startOfMonth(month), e = endOfMonth(month);
  const inMonth = leaveReqs.filter(l => {
    const d = l.date || l.startDate;
    if (!d) return false;
    const dd = d.seconds ? d.toDate() : new Date(d);
    return dd >= s && dd <= e;
  });

  function userName(uid) {
    const u = users.find(x => x.id === uid || x.uid === uid);
    return u?.displayName || u?.name || uid;
  }

  return (
    <div style={{ ...cardStyle }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <strong>Leave Manager</strong>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <input
            type="month"
            value={ym}
            onChange={e => {
              const [yy, mm] = e.target.value.split("-");
              setMonth(new Date(parseInt(yy,10), parseInt(mm,10)-1, 1));
            }}
            style={{ ...cardStyle, padding: 8 }}
          />
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {inMonth.map(l => {
          const d = l.date || l.startDate;
          const when = d?.seconds ? d.toDate() : new Date(d);
          return (
            <div key={l.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", padding: 8, borderBottom: "1px solid #2a2d31" }}>
              <div>
                <div><strong>{userName(l.userId)}</strong> — {l.type || "Leave"} on {toYMD(when)}</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>{l.reason || ""}</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={chip(l.status === "approved" ? "rgba(36,255,152,0.08)" : l.status === "denied" ? "rgba(255,68,68,0.08)" : undefined)}>
                  {l.status || "pending"}
                </span>
                {l.status !== "approved" && <button onClick={() => onApprove(l.id)} style={{ ...chip("rgba(36,255,152,0.08)"), borderColor: "#24ff98" }}>Approve</button>}
                {l.status !== "denied" && <button onClick={() => onDeny(l.id)} style={{ ...chip("rgba(255,68,68,0.08)"), borderColor: "#ff4444" }}>Deny</button>}
              </div>
            </div>
          );
        })}
        {inMonth.length === 0 && <div style={{ opacity: 0.7 }}>No leave in this month.</div>}
      </div>
    </div>
  );
}

function TrainingCerts({ certs, users, onAdd }) {
  const [form, setForm] = useState({ userId: "", name: "", expiresAt: "" });

  return (
    <div style={{ ...cardStyle }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <strong>Training & Certifications</strong>
      </div>
      <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8 }}>
          <select
            value={form.userId}
            onChange={e => setForm({ ...form, userId: e.target.value })}
            style={{ ...cardStyle, padding: 8 }}
          >
            <option value="">Select user</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.displayName || u.id}</option>)}
          </select>
          <input
            placeholder="Certificate name (e.g., First Aid)"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            style={{ ...cardStyle, padding: 8 }}
          />
          <input
            type="date"
            value={form.expiresAt}
            onChange={e => setForm({ ...form, expiresAt: e.target.value })}
            style={{ ...cardStyle, padding: 8 }}
          />
          <button
            onClick={() => {
              if (!form.userId || !form.name || !form.expiresAt) return;
              onAdd({ userId: form.userId, name: form.name, expiresAt: new Date(form.expiresAt) });
              setForm({ userId: "", name: "", expiresAt: "" });
            }}
            style={{ ...chip("rgba(94,234,212,0.18)"), borderColor: "#5eead4" }}
          >
            Add
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {certs.map(c => {
          const u = users.find(x => x.id === c.userId);
          const exp = c.expiresAt?.toDate ? c.expiresAt.toDate() : new Date(c.expiresAt);
          const soon = exp && (exp.getTime() - Date.now()) < 1000*60*60*24*30; // < 30 days
          return (
            <div key={`${c.userId}-${c.name}-${c.expiresAt?.seconds || c.expiresAt}`} style={{ display: "grid", gridTemplateColumns: "1fr auto", padding: 8, borderBottom: "1px solid #2a2d31" }}>
              <div>
                <strong>{u?.displayName || c.userId}</strong> — {c.name}
                <div style={{ fontSize: 12, opacity: 0.8 }}>Expires: {exp ? toYMD(exp) : "—"}</div>
              </div>
              <div>
                <span style={chip(soon ? "rgba(255,196,0,0.10)" : "rgba(36,255,152,0.08)")}>{soon ? "Expiring soon" : "OK"}</span>
              </div>
            </div>
          );
        })}
        {certs.length === 0 && <div style={{ opacity: 0.7 }}>No certifications recorded yet.</div>}
      </div>
    </div>
  );
}

function SafetyChecklist({ tasks }) {
  // Expect H&S tasks to be tagged with tag:'hs' or titles including 'safety'/'inspection'
  const filtered = tasks.filter(t => t.tag === "hs" ||
    /safety|inspection|health/i.test(t.title || ""));

  return (
    <div style={{ ...cardStyle }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <strong>Health & Safety — Today</strong>
        <span style={chip()}>{filtered.length} tasks</span>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {filtered.map(t => {
          const done = Array.isArray(t.completedBy) && t.completedBy.length > 0;
          return (
            <div key={t.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", padding: 8, borderBottom: "1px solid #2a2d31" }}>
              <div>
                <strong>{t.title}</strong>
                <div style={{ fontSize: 12, opacity: 0.85 }}>{t.description || ""}</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={chip(done ? "rgba(36,255,152,0.08)" : undefined)}>{done ? "Completed" : "Pending"}</span>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div style={{ opacity: 0.7 }}>No H&S tasks found for today. Tag tasks with <code>tag: "hs"</code> to show here.</div>}
      </div>
    </div>
  );
}

function IncidentsLog({ incidents, users, onAdd }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ userId: "", trackId: "", severity: "low", summary: "" });

  return (
    <div style={{ ...cardStyle }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <strong>Incidents</strong>
        <button onClick={() => setOpen(v => !v)} style={{ ...chip("rgba(94,234,212,0.18)"), borderColor: "#5eead4", marginLeft: "auto" }}>{open ? "Close" : "Add Incident"}</button>
      </div>

      {open && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
          <select value={form.userId} onChange={e => setForm({ ...form, userId: e.target.value })} style={{ ...cardStyle, padding: 8 }}>
            <option value="">User</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.displayName || u.id}</option>)}
          </select>
          <input placeholder="TrackId (optional)" value={form.trackId} onChange={e => setForm({ ...form, trackId: e.target.value })} style={{ ...cardStyle, padding: 8 }} />
          <select value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })} style={{ ...cardStyle, padding: 8 }}>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
          <input placeholder="Summary" value={form.summary} onChange={e => setForm({ ...form, summary: e.target.value })} style={{ gridColumn: "1 / -1", ...cardStyle, padding: 8 }} />
          <button
            onClick={() => {
              if (!form.userId || !form.summary) return;
              onAdd(form);
              setForm({ userId: "", trackId: "", severity: "low", summary: "" });
              setOpen(false);
            }}
            style={{ ...chip("rgba(36,255,152,0.08)"), borderColor: "#24ff98", gridColumn: "1 / -1" }}
          >
            Save Incident
          </button>
        </div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {incidents.map(i => {
          const u = users.find(x => x.id === i.userId);
          const when = i.createdAt?.toDate ? i.createdAt.toDate() : null;
          return (
            <div key={i.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", padding: 8, borderBottom: "1px solid #2a2d31" }}>
              <div>
                <strong>{u?.displayName || i.userId}</strong> — {i.summary}
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                  {i.severity?.toUpperCase?.()} • {when ? toYMD(when) : "—"} • {i.trackId || "—"}
                </div>
              </div>
              <span style={chip(i.severity === "high" ? "rgba(255,68,68,0.08)" : i.severity === "medium" ? "rgba(255,196,0,0.10)" : undefined)}>
                {i.severity}
              </span>
            </div>
          );
        })}
        {incidents.length === 0 && <div style={{ opacity: 0.7 }}>No incidents recorded.</div>}
      </div>
    </div>
  );
}

function PerformanceSnapshots({ users, timeEntriesAll, incidents }) {
  // Build quick KPIs per user for current month
  const s = startOfMonth(new Date());
  const e = endOfMonth(new Date());

  function byUser(uid) {
    const u = users.find(x => x.id === uid || x.uid === uid);
    return u?.displayName || uid;
  }

  const kpis = useMemo(() => {
    const map = {};
    users.forEach(u => {
      map[u.id] = { uid: u.id, name: byUser(u.id), hours: 0, days: new Set(), incidents: 0, role: u.role, track: u.assignedTrack };
    });

    timeEntriesAll.forEach(te => {
      // open sessions only here; in full version fetch within month too
      const uid = te.uid;
      const cin = te.clockInAt?.toDate ? te.clockInAt.toDate() : null;
      const cout = te.clockOutAt?.toDate ? te.clockOutAt.toDate() : null;
      if (!cin) return;
      if (cin < s || cin > e) return;
      const hours = hoursBetween(cin, cout || new Date());
      if (!map[uid]) map[uid] = { uid, name: byUser(uid), hours: 0, days: new Set(), incidents: 0, role: "", track: "" };
      map[uid].hours += hours;
      map[uid].days.add(toYMD(cin));
    });

    incidents.forEach(it => {
      const when = it.createdAt?.toDate ? it.createdAt.toDate() : null;
      if (!when || when < s || when > e) return;
      if (!map[it.userId]) map[it.userId] = { uid: it.userId, name: byUser(it.userId), hours: 0, days: new Set(), incidents: 0, role: "", track: "" };
      map[it.userId].incidents += 1;
    });

    return Object.values(map)
      .map(v => ({ ...v, daysCount: v.days.size, hours: Math.round(v.hours * 100) / 100 }))
      .sort((a,b) => b.hours - a.hours);
  }, [users, timeEntriesAll, incidents]);

  return (
    <div style={{ ...cardStyle }}>
      <div style={{ marginBottom: 8 }}><strong>Performance (current month)</strong></div>
      <div style={{ display: "grid", gap: 6 }}>
        {kpis.map(k => (
          <div key={k.uid} style={{ display: "grid", gridTemplateColumns: "1.1fr 0.8fr 0.8fr 0.6fr 0.6fr", padding: 8, borderBottom: "1px solid #2a2d31" }}>
            <div><strong>{k.name}</strong> <span style={{ fontSize: 12, opacity: 0.8 }}>({k.uid})</span></div>
            <div>{k.track || "—"}</div>
            <div>{k.role || "—"}</div>
            <div>{k.daysCount} days</div>
            <div>{k.hours.toFixed(2)} h • {k.incidents} inc</div>
          </div>
        ))}
        {kpis.length === 0 && <div style={{ opacity: 0.7 }}>No data this month.</div>}
      </div>
    </div>
  );
}
