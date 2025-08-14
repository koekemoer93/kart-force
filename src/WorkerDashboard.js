import React, { useEffect, useMemo, useState, useRef } from "react";
import { db } from "./firebase";
import { useAuth } from "./AuthContext";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  getDocs,
} from "firebase/firestore";
import TopNav from "./components/TopNav";
import { formatDateYMD } from "./utils/dates";
import { useTracks } from "./hooks/useTracks";
import { ROLE_OPTIONS } from "./constants/roles";

/* ────────────────────────────────────────────────────────────────────────────
   Helpers
   ──────────────────────────────────────────────────────────────────────────── */

function canonicalRole(input) {
  const norm = (s) => String(s || "").toLowerCase().replace(/[\s_\-]/g, "");
  const want = norm(input || "worker");
  for (const r of ROLE_OPTIONS) if (norm(r) === want) return r;
  if (want === "workshopmanager" || want === "workshopmgr") return "workshopManager";
  if (want === "hr" || want === "hrfinance") return "hrfinance";
  return input || "worker";
}

/** SVG circular progress (animated), shows % in the center */
function ProgressCircle({ percent = 0, size = 56, stroke = 7 }) {
  const [anim, setAnim] = useState(0);
  const rafRef = useRef(null);

  useEffect(() => {
    let start;
    const duration = 800;
    const from = 0;
    const to = Math.max(0, Math.min(100, percent));
    const ease = (t) => 1 - Math.pow(1 - t, 3); // easeOutCubic

    const step = (ts) => {
      if (!start) start = ts;
      const t = Math.min(1, (ts - start) / duration);
      setAnim(from + (to - from) * ease(t));
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };

    cancelAnimationFrame(rafRef.current ?? 0);
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current ?? 0);
  }, [percent]);

  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const offset = C * (1 - anim / 100);

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgba(255,255,255,0.15)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="#24ff98"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 120ms linear" }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          fontSize: 12,
          fontWeight: 800,
          color: "#fff",
        }}
      >
        {Math.round(anim)}%
      </div>
    </div>
  );
}

// One admin-style tile for a task (checkbox only)
function TaskTile({ task, uid, onToggle, busy }) {
  const mine = (task.completedBy || []).includes(uid);
  const others = Math.max(0, (task.completedBy || []).length - (mine ? 1 : 0));

  return (
    <div
      className="glass-card"
      style={{
        padding: 12,
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: 12,
        alignItems: "center",
        border: "1px solid rgba(255,255,255,0.08)",
        minHeight: "auto", // ⬅️ kill global 420px
      }}
    >
      <input
        type="checkbox"
        checked={mine}
        disabled={busy}
        onChange={() => onToggle(task, mine)}
        aria-label={mine ? "Uncheck task" : "Check task"}
        style={{ width: 20, height: 20 }}
      />
      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 800 }}>{task.title || "(untitled)"}</div>
          <span
            className="small"
            style={{
              padding: "2px 8px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.06)",
              opacity: 0.9,
            }}
          >
            {task.role}
          </span>
          <span
            className="small"
            style={{
              padding: "2px 8px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(0,0,0,0.25)",
              opacity: 0.8,
            }}
            title="Track ID"
          >
            {task.assignedTrack}
          </span>
        </div>

        {task.description && (
          <div className="small" style={{ opacity: 0.9, marginTop: 4 }}>
            {task.description}
          </div>
        )}

        <div className="small" style={{ opacity: 0.7, marginTop: 6, display: "flex", gap: 12 }}>
          <span>Team done: {others}{mine ? " + you" : ""}</span>
          <span>Date: {task.date || "—"}</span>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Component
   ──────────────────────────────────────────────────────────────────────────── */

export default function WorkerDashboard() {
  const { user, userData, displayName } = useAuth();

  // Normalize track & role to match seeder/query
  const tracks = useTracks();
  const assignedTrackRaw = userData?.assignedTrack ?? "";
  const role = canonicalRole(userData?.role ?? "worker");

  const assignedTrack = useMemo(() => {
    if (!assignedTrackRaw || !Array.isArray(tracks)) return "";
    const byId = tracks.find((t) => t.id === assignedTrackRaw);
    if (byId) return byId.id;
    const needle = String(assignedTrackRaw).trim().toLowerCase();
    const byName = tracks.find(
      (t) => String(t.displayName || "").trim().toLowerCase() === needle
    );
    return byName?.id || "";
  }, [assignedTrackRaw, tracks]);

  const [tasks, setTasks] = useState([]);
  const [busyToggleId, setBusyToggleId] = useState(null);
  const [roleHint, setRoleHint] = useState(null);

  // Load today's tasks
  useEffect(() => {
    if (!assignedTrack || !role || !user?.uid) return;

    const todayStr = formatDateYMD();
    const qTasks = query(
      collection(db, "tasks"),
      where("assignedTrack", "==", assignedTrack),
      where("role", "==", role),
      where("date", "==", todayStr)
    );

    const unsub = onSnapshot(
      qTasks,
      (snap) => {
        const rows = snap.docs.map((d) => {
          const data = d.data();
          return {
            docId: d.id,
            ...data,
            completedBy: Array.isArray(data.completedBy) ? data.completedBy : [],
          };
        });

        const uid = user?.uid;
        rows.sort((a, b) => {
          const aMine = (a.completedBy || []).includes(uid);
          const bMine = (b.completedBy || []).includes(uid);
          if (aMine !== bMine) return aMine ? 1 : -1;
          return String(a.title || "").localeCompare(String(b.title || ""));
        });

        setTasks(rows);

        if (rows.length === 0) {
          (async () => {
            try {
              const altQ = query(
                collection(db, "tasks"),
                where("assignedTrack", "==", assignedTrack),
                where("date", "==", todayStr)
              );
              const altSnap = await getDocs(altQ);
              if (!altSnap.empty) {
                const rolesFound = Array.from(
                  new Set(altSnap.docs.map((d) => d.data()?.role).filter(Boolean))
                );
                if (rolesFound.length && !rolesFound.includes(role)) {
                  setRoleHint(
                    `Tasks exist for: ${rolesFound.join(", ")}. Your profile role is “${role}”.`
                  );
                } else setRoleHint(null);
              } else setRoleHint(null);
            } catch {
              setRoleHint(null);
            }
          })();
        } else setRoleHint(null);
      },
      (err) => {
        console.error("Tasks snapshot error:", err);
      }
    );

    return () => unsub();
  }, [assignedTrack, role, user]);

  // Completion stats (your own ticks)
  const total = tasks.length;
  const done = tasks.filter((t) => (t.completedBy || []).includes(user?.uid)).length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  const displayNameSafe = displayName || userData?.name || "Worker";

  // Toggle handler (rules-safe)
  const onToggle = async (task, isCompleted) => {
    if (!task?.docId || !user?.uid) return;
    try {
      setBusyToggleId(task.docId);
      const ref = doc(db, "tasks", task.docId);
      await updateDoc(ref, {
        completedBy: isCompleted ? arrayRemove(user.uid) : arrayUnion(user.uid),
      });
    } catch (e) {
      console.error("Error updating task:", e);
      alert("Missing permissions to update this task. Ask an admin to check rules for completedBy.");
    } finally {
      setBusyToggleId(null);
    }
  };

  return (
    <>
      <TopNav />

      <div
        className="main-wrapper"
        style={{
          minHeight: "100vh",
          display: "flex",
          justifyContent: "flex-start", // ⬅️ anchor to top
          padding: 16,
        }}
      >
        <div style={{ width: "100%", maxWidth: 1100, display: "grid", gap: 12 }}>
          {/* Welcome (compact) */}
          <div
            className="glass-card"
            style={{
              padding: 12,         // tighter
              marginBottom: 0,
              minHeight: "auto",   // ⬅️ kill global 420px
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.08)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: 12,
                }}
              >
                {displayNameSafe.slice(0, 2).toUpperCase()}
              </div>

              <div style={{ minWidth: 200 }}>
                <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.15 }}>
                  Welcome, {displayNameSafe}!
                </div>
                <div className="small muted" style={{ lineHeight: 1.1 }}>
                  Today is{" "}
                  {new Date().toLocaleDateString([], {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
                </div>
              </div>

              <div
                className="welcome-progress"
                style={{
                  marginLeft: "auto",
                  display: "grid",
                  placeItems: "center",
                  minWidth: 64,
                }}
              >
                <ProgressCircle percent={percent} size={56} />
                <div className="small muted" style={{ marginTop: 2 }}>
                  {done}/{total} completed
                </div>
              </div>
            </div>
          </div>

          {/* Tasks — Status & Progress (compact) */}
          <div
            className="glass-card"
            style={{ padding: 14, marginTop: 0, minHeight: "auto" }} // ⬅️ compact + no global min-height
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <h3 style={{ margin: 0 }}>Tasks — Status &amp; Progress</h3>
              <div className="small muted">{formatDateYMD()}</div>
            </div>

            {roleHint && (
              <div className="small" style={{ color: "#ffb266", marginBottom: 8 }}>
                {roleHint}
              </div>
            )}

            {total === 0 ? (
              <p className="small" style={{ color: "#ff6666", margin: 0 }}>
                No tasks for today.
              </p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                  gap: 12,
                }}
              >
                {tasks.map((t) => (
                  <TaskTile
                    key={t.docId}
                    task={t}
                    uid={user?.uid}
                    busy={busyToggleId === t.docId}
                    onToggle={onToggle}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
