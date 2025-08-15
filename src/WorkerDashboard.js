// src/WorkerDashboard.js
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
  setDoc,
  getDoc,
  increment,
} from "firebase/firestore";
import TopNav from "./components/TopNav";
import { formatDateYMD } from "./utils/dates";
import { useTracks } from "./hooks/useTracks";
import { ROLE_OPTIONS } from "./constants/roles";
import SwipeableTaskTile from "./components/SwipeableTaskTile";

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

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function ymd(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function isYesterdayStr(todayStr, lastStr) {
  const y1 = ymd(addDays(todayStr, -1));
  return y1 === lastStr;
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

// 🔥 tiny confetti overlay (no deps)
function ConfettiOverlay({ show = false, onDone }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!show) return;
    const canvas = ref.current;
    const ctx = canvas.getContext("2d");
    let raf;
    let t = 0;
    const W = (canvas.width = canvas.offsetWidth);
    const H = (canvas.height = canvas.offsetHeight);

    const parts = Array.from({ length: 90 }).map(() => ({
      x: Math.random() * W,
      y: -20 - Math.random() * 100,
      vx: (Math.random() - 0.5) * 2,
      vy: 2 + Math.random() * 3.5,
      r: 2 + Math.random() * 3,
      a: 0.6 + Math.random() * 0.4,
    }));

    const colors = ["#24ff98", "#7dd3fc", "#f472b6", "#facc15", "#a78bfa"];

    function draw() {
      ctx.clearRect(0, 0, W, H);
      parts.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;
        ctx.globalAlpha = p.a;
        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });
      t += 1 / 60;
      if (t < 1.6) {
        raf = requestAnimationFrame(draw);
      } else {
        onDone?.();
      }
    }
    draw();
    return () => cancelAnimationFrame(raf);
  }, [show, onDone]);

  return (
    <div
      style={{
        pointerEvents: "none",
        position: "fixed",
        inset: 0,
        display: show ? "block" : "none",
        zIndex: 9999,
      }}
    >
      <canvas ref={ref} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

// One admin-style tile for a task (checkbox only) — minimal shows ONLY title + description
function TaskTile({ task, uid, onToggle, busy, streakCount = 0, minimal = false }) {
  const mine = (task.completedBy || []).includes(uid);

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
        minHeight: "auto",
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
        {/* Title */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 800 }}>
            {task.title || "(untitled)"}
          </div>
        </div>

        {/* Description only in minimal mode (and we hide all other meta) */}
        {minimal ? (
          task.description ? (
            <div className="small" style={{ opacity: 0.9, marginTop: 4 }}>
              {task.description}
            </div>
          ) : null
        ) : (
          <>
            {/* Non-minimal mode (kept for future) */}
            {task.description && (
              <div className="small" style={{ opacity: 0.9, marginTop: 4 }}>
                {task.description}
              </div>
            )}
            <div className="small" style={{ opacity: 0.7, marginTop: 6, display: "flex", gap: 12 }}>
              <span>
                Team done: {Math.max(0, (task.completedBy || []).length - (mine ? 1 : 0))}
                {mine ? " + you" : ""}
              </span>
              <span>Date: {task.date || "—"}</span>
              <span title="Track ID" className="muted">{task.assignedTrack}</span>
              <span className="muted">{task.role}</span>
            </div>
          </>
        )}
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

  // tabs
  const [tab, setTab] = useState("today"); // 'today' | 'upcoming'

  // data
  const [tasksToday, setTasksToday] = useState([]);
  const [tasksUpcoming, setTasksUpcoming] = useState([]);
  const [busyToggleId, setBusyToggleId] = useState(null);
  const [roleHint, setRoleHint] = useState(null);
  const [streaksMap, setStreaksMap] = useState({}); // templateKey -> {count, lastDate}
  const [xp, setXp] = useState(Number(userData?.xp || 0));

  // confetti + undo
  const [celebrate, setCelebrate] = useState(false);
  const [undo, setUndo] = useState(null); // { task, xpDelta, prevStreak, key }

  const displayNameSafe = displayName || userData?.name || "Worker";
  const todayStr = formatDateYMD();

  // Load today's tasks
  useEffect(() => {
    if (!assignedTrack || !role || !user?.uid) return;

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

        setTasksToday(rows);

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
  }, [assignedTrack, role, user, todayStr]);

  // Upcoming (next 3 dates) — read-only, swipe disabled
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!assignedTrack || !role) return;
      const d1 = ymd(addDays(new Date(), 1));
      const d2 = ymd(addDays(new Date(), 2));
      const d3 = ymd(addDays(new Date(), 3));
      const dates = [d1, d2, d3];

      const results = [];
      for (const dt of dates) {
        const qx = query(
          collection(db, "tasks"),
          where("assignedTrack", "==", assignedTrack),
          where("role", "==", role),
          where("date", "==", dt)
        );
        const snap = await getDocs(qx);
        snap.forEach((d) => {
          results.push({
            docId: d.id,
            ...d.data(),
            completedBy: Array.isArray(d.data().completedBy) ? d.data().completedBy : [],
          });
        });
      }
      if (!alive) return;
      results.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.title || "").localeCompare(String(b.title || "")));
      setTasksUpcoming(results);
    })();
    return () => { alive = false; };
  }, [assignedTrack, role]);

  // Load streaks cache for this user (optional; created on first toggle)
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user?.uid) return;
      const uref = doc(db, "users", user.uid);
      const uds = await getDoc(uref);
      setXp(Number(uds.data()?.xp || 0));

      // streaks are small docs; load lazily when needed (kept simple here)
      // We’ll refresh per-toggle anyway.
    })();
    return () => { alive = false; };
  }, [user]);

  // Completion stats for TODAY
  const total = tasksToday.length;
  const done = tasksToday.filter((t) => (t.completedBy || []).includes(user?.uid)).length;
  const percent = total ? Math.round((done / total) * 100) : 0;

  // trigger confetti when reaching 100%
  const prevPercentRef = useRef(percent);
  useEffect(() => {
    if (prevPercentRef.current < 100 && percent === 100) {
      setCelebrate(true);
    }
    prevPercentRef.current = percent;
  }, [percent]);

  // streak helpers
  function templateKeyForTask(t) {
    return t.templateId || `${t.title || ""}|${t.role || ""}|${t.assignedTrack || ""}`;
  }

  async function getStreakDoc(key) {
    if (!user?.uid) return null;
    const sref = doc(db, "users", user.uid, "streaks", key);
    const s = await getDoc(sref);
    return s.exists() ? { ...s.data(), __ref: sref } : { count: 0, lastDate: null, __ref: sref };
    }

  async function setStreakDoc(key, data) {
    if (!user?.uid) return;
    const sref = doc(db, "users", user.uid, "streaks", key);
    await setDoc(sref, { count: Number(data.count || 0), lastDate: data.lastDate || null }, { merge: true });
    // local cache update
    setStreaksMap((m) => ({ ...m, [key]: { count: Number(data.count || 0), lastDate: data.lastDate || null } }));
  }

  // XP helpers
  function levelFromXp(x) {
    const n = Math.max(0, Number(x || 0));
    return Math.floor(n / 100) + 1; // 100 xp per level
  }

  // Toggle handler (rules-safe) + streak + XP + undo
  const onToggle = async (task, isCompleted, source = "checkbox") => {
    if (!task?.docId || !user?.uid) return;

    // block interaction on upcoming tab
    if (tab === "upcoming") return;

    try {
      setBusyToggleId(task.docId);
      const ref = doc(db, "tasks", task.docId);

      // 1) Update task completedBy
      await updateDoc(ref, {
        completedBy: isCompleted ? arrayRemove(user.uid) : arrayUnion(user.uid),
      });

      // If user is un-checking, we just clear (XP/streak undo only via snackbar Undo below).
      if (isCompleted) return;

      // 2) Award XP + maintain streak
      const key = templateKeyForTask(task);
      const prev = await getStreakDoc(key);

      const cont = prev.lastDate ? isYesterdayStr(todayStr, prev.lastDate) : false;
      const newCount = cont ? (Number(prev.count || 0) + 1) : 1;
      const xpBase = 10;
      const xpBonus = cont ? 5 : 0;
      const xpDelta = xpBase + xpBonus;

      // write streak (today)
      await setStreakDoc(key, { count: newCount, lastDate: todayStr });

      // write xp on user doc
      await updateDoc(doc(db, "users", user.uid), {
        xp: increment(xpDelta),
      });
      setXp((x) => Number(x || 0) + xpDelta);

      // Show Undo
      setUndo({
        task,
        xpDelta,
        prevStreak: { count: prev.count || 0, lastDate: prev.lastDate || null },
        key,
      });
    } catch (e) {
      console.error("Error updating task:", e);
      alert("Missing permissions to update this task. Ask an admin to check rules for completedBy.");
    } finally {
      setBusyToggleId(null);
    }
  };

  async function handleUndo() {
    const u = undo;
    setUndo(null);
    if (!u || !user?.uid) return;
    try {
      // revert task completion
      const ref = doc(db, "tasks", u.task.docId);
      await updateDoc(ref, {
        completedBy: arrayRemove(user.uid),
      });
      // revert streak
      await setStreakDoc(u.key, u.prevStreak);
      // revert xp
      await updateDoc(doc(db, "users", user.uid), { xp: increment(-u.xpDelta) });
      setXp((x) => Math.max(0, Number(x || 0) - u.xpDelta));
    } catch (e) {
      console.error("Undo failed:", e);
    }
  }

  // Sectioning (Progress pill per section)
  function detectSection(t) {
    // If your templates later add t.section or t.tags, they’ll override this simple heuristic.
    if (t.section) return t.section;
    const title = String(t.title || "").toLowerCase();
    if (title.includes("clock in") || title.includes("open") || title.includes("morning")) return "Opening";
    if (title.includes("clean") || title.includes("close") || title.includes("lock")) return "Closing";
    if (title.includes("lunch") || title.includes("midday")) return "Midday";
    return "General";
  }

  const sectioned = useMemo(() => {
    const list = tasksToday.slice();
    const groups = {};
    for (const t of list) {
      const sec = detectSection(t);
      (groups[sec] ||= []).push(t);
    }
    // sort sections in a friendly order
    const order = ["Opening", "Midday", "General", "Closing"];
    const keys = Object.keys(groups).sort(
      (a, b) => (order.indexOf(a) === -1 ? 999 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 999 : order.indexOf(b))
    );
    return { groups, keys };
  }, [tasksToday]);

  // level badge
  const level = levelFromXp(xp);

  // display list by tab
  const displayTasks = tab === "today" ? tasksToday : tasksUpcoming;

  return (
    <>
      <TopNav />

      <div
        className="main-wrapper"
        style={{
          minHeight: "100vh",
          display: "flex",
          justifyContent: "flex-start",
          padding: 16,
        }}
      >
        <div style={{ width: "100%", maxWidth: 1100, display: "grid", gap: 12 }}>
          {/* Welcome (compact) */}
          <div
            className="glass-card"
            style={{
              padding: 12,
              marginBottom: 0,
              minHeight: "auto",
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
                  Welcome, {displayNameSafe}! <span className="small muted">Lv {level}</span>
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

          {/* Tabs: Today | Upcoming */}
          <div className="glass-card" style={{ padding: 8, minHeight: "auto" }}>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="button-secondary"
                onClick={() => setTab("today")}
                style={{
                  flex: 1,
                  background: tab === "today" ? "rgba(255,255,255,0.08)" : undefined,
                }}
              >
                Today
              </button>
              <button
                className="button-secondary"
                onClick={() => setTab("upcoming")}
                style={{
                  flex: 1,
                  background: tab === "upcoming" ? "rgba(255,255,255,0.08)" : undefined,
                }}
              >
                Upcoming (3 days)
              </button>
            </div>
          </div>

          {/* Tasks — Status & Progress */}
          <div
            className="glass-card"
            style={{ padding: 14, marginTop: 0, minHeight: "auto" }}
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

            {/* UPCOMING — simple flat list, slide disabled */}
            {tab === "upcoming" && (
              <>
                {displayTasks.length === 0 ? (
                  <p className="small" style={{ color: "#ff6666", margin: 0 }}>
                    Nothing scheduled for the next 3 days.
                  </p>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                      gap: 12,
                    }}
                  >
                    {displayTasks.map((t) => (
                      <TaskTile
                        key={`up-${t.docId}`}
                        task={t}
                        uid={user?.uid}
                        busy={false}
                        onToggle={() => {}}
                        streakCount={streaksMap[templateKeyForTask(t)]?.count || 0}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            {/* TODAY — sectioned with progress pills + swipe to complete */}
            {tab === "today" && (
              <>
                {tasksToday.length === 0 ? (
                  <p className="small" style={{ color: "#ff6666", margin: 0 }}>
                    No tasks for today.
                  </p>
                ) : (
                  <div style={{ display: "grid", gap: 16 }}>
                    {sectioned.keys.map((sec) => {
                      const list = sectioned.groups[sec] || [];
                      const secDone = list.filter((t) =>
                        (t.completedBy || []).includes(user?.uid)
                      ).length;
                      return (
                        <div key={sec} style={{ display: "grid", gap: 10 }}>
                          {/* Section header + progress pill */}
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                            }}
                          >
                            <div style={{ fontWeight: 800 }}>{sec}</div>
                            <div
                              className="small"
                              style={{
                                padding: "2px 8px",
                                borderRadius: 999,
                                border: "1px solid rgba(255,255,255,0.08)",
                                background: "rgba(255,255,255,0.06)",
                              }}
                            >
                              {sec} {secDone}/{list.length}
                            </div>
                          </div>

                          {/* Section grid */}
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                              gap: 12,
                            }}
                          >
                            {list.map((t) => {
                              const key = templateKeyForTask(t);
                              const streakCount = streaksMap[key]?.count || 0;
                              const mine = (t.completedBy || []).includes(user?.uid);
                              return (
                                <SwipeableTaskTile
                                  key={t.docId}
                                  disabled={mine} // already completed by me — keep swipe off; can uncheck via checkbox
                                  onComplete={() => onToggle(t, false, "swipe")}
                                >
                                  <TaskTile
                                    task={t}
                                    uid={user?.uid}
                                    busy={busyToggleId === t.docId}
                                    onToggle={onToggle}
                                    streakCount={streakCount}
                                  />
                                </SwipeableTaskTile>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Undo snackbar */}
      {undo && (
        <div
          role="status"
          aria-live="polite"
          className="glass-card"
          style={{
            position: "fixed",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: 16,
            padding: 10,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(20,20,20,0.9)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            zIndex: 1000,
          }}
        >
          <span className="small">Task completed — XP +{undo.xpDelta}</span>
          <button className="button-secondary" onClick={handleUndo}>
            Undo
          </button>
          <AutoHide onHide={() => setUndo(null)} ms={6500} />
        </div>
      )}

      {/* Confetti when 100% */}
      <ConfettiOverlay show={celebrate} onDone={() => setCelebrate(false)} />

      {/* Scoped bits */}
      <style>{`
        .button-secondary { cursor: pointer; }
      `}</style>
    </>
  );
}

/** Auto-hider for snackbars */
function AutoHide({ ms = 5000, onHide }) {
  useEffect(() => {
    const t = setTimeout(() => onHide?.(), ms);
    return () => clearTimeout(t);
  }, [ms, onHide]);
  return null;
}
