// src/WorkerDashboard.js
import React, { useEffect, useMemo, useState } from "react";
import { db } from "./firebase";
import { useAuth } from "./AuthContext";
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
  doc,
  arrayUnion,
  arrayRemove,
  runTransaction,
  getDocs,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import TopNav from "./components/TopNav";
import { clockIn, clockOut } from "./services/timeEntries";
import { useGeofence } from "./hooks/useGeofence";
import { haversineDistanceMeters } from "./utils/geo";
import { formatDateYMD } from "./utils/dates";
import { useTracks } from "./hooks/useTracks";
import { ROLE_OPTIONS } from "./constants/roles";

// --- Slim horizontal progress bar ---
function ProgressBar({ percent = 0, trackColor = "#4a4a4a", fillColor = "#24ff98", height = 16 }) {
  const v = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div
      style={{
        width: "100%",
        background: trackColor,
        borderRadius: 999,
        height,
        position: "relative",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.05)",
      }}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v}
      role="progressbar"
    >
      <div
        style={{
          width: `${v}%`,
          height: "100%",
          background: fillColor,
          borderRadius: 999,
          transition: "width .35s ease",
        }}
      />
    </div>
  );
}

// Canonicalize role to one of ROLE_OPTIONS (case/spacing tolerant)
function canonicalRole(input) {
  const norm = (s) => String(s || "").toLowerCase().replace(/[\s_\-]/g, "");
  const want = norm(input || "worker");
  for (const r of ROLE_OPTIONS) {
    if (norm(r) === want) return r; // exact canonical
  }
  // Common aliases
  if (want === "workshopmanager" || want === "workshopmgr") return "workshopManager";
  if (want === "hr" || want === "hrfinance") return "hrfinance";
  return input || "worker";
}

export default function WorkerDashboard() {
  const navigate = useNavigate();
  const { user, userData, displayName } = useAuth();

  const assignedTrackRaw = userData?.assignedTrack ?? ""; // may be ID or displayName
  const roleRaw = userData?.role ?? "worker";
  const role = canonicalRole(roleRaw);
  const isClockedIn = !!userData?.isClockedIn;

  // Tracks for normalizing track ID
  const tracks = useTracks();

  // Normalize assignedTrack to a real Firestore doc ID
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

  const currentTrack = useMemo(() => {
    if (!assignedTrack || !Array.isArray(tracks)) return null;
    return tracks.find((t) => t.id === assignedTrack) || null;
  }, [assignedTrack, tracks]);

  const [tasks, setTasks] = useState([]);
  const [roleHint, setRoleHint] = useState(null); // shows if tasks exist for other roles today

  // --- Load today's tasks (exact match) ---
  useEffect(() => {
    if (!assignedTrack || !role || !user?.uid) return;

    const todayStr = formatDateYMD(); // "YYYY-MM-DD"
    const qTasks = query(
      collection(db, "tasks"),
      where("assignedTrack", "==", assignedTrack),
      where("role", "==", role),
      where("date", "==", todayStr),
      orderBy("createdAt", "desc")
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
        setTasks(rows);

        // If no results, look for same track/date but ANY role → show a hint
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
                    `Tasks exist for: ${rolesFound.join(
                      ", "
                    )}. Your profile role is “${role}”.`
                  );
                } else {
                  setRoleHint(null);
                }
              } else {
                setRoleHint(null);
              }
            } catch {
              setRoleHint(null);
            }
          })();
        } else {
          setRoleHint(null);
        }
      },
      (err) => {
        console.error("Tasks snapshot error:", err);
        setRoleHint(null);
      }
    );

    return () => unsub();
  }, [assignedTrack, role, user]);

  // --- Completion percent ---
  const completion = tasks.length
    ? Math.round(
        (tasks.filter((t) => (t.completedBy || []).includes(user?.uid)).length / tasks.length) *
          100
      )
    : 0;

  // --- Toggle task completion (rules-safe: only updates completedBy) ---
  const toggleTask = async (task) => {
    if (!task?.docId || !user?.uid) return;
    try {
      const ref = doc(db, "tasks", task.docId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("Task no longer exists");
        const data = snap.data() || {};
        const current = Array.isArray(data.completedBy) ? data.completedBy : [];
        const isCompleted = current.includes(user.uid);
        tx.update(ref, {
          completedBy: isCompleted ? arrayRemove(user.uid) : arrayUnion(user.uid),
        });
      });
    } catch (error) {
      console.error("Error updating task:", { code: error.code, message: error.message, error });
      alert("Failed to update task. Please try again.");
    }
  };

  // --- Geofence bypass (dev helper) ---
  const allowBypass =
    process.env.NODE_ENV !== "production" ||
    String(process.env.REACT_APP_ALLOW_BYPASS).toLowerCase() === "true";
  const bypassActive =
    allowBypass &&
    typeof window !== "undefined" &&
    localStorage.getItem("bypassFence") === "true";
  useEffect(() => {
    if (!allowBypass) return;
    const onKey = (e) => {
      if (e.shiftKey && (e.key === "g" || e.key === "G")) {
        const next = localStorage.getItem("bypassFence") === "true" ? "false" : "true";
        localStorage.setItem("bypassFence", next);
        window.location.reload();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [allowBypass]);

  // --- Geofence ---
  const { coords, isInsideFence, track } = useGeofence(assignedTrack);
  const insideFenceOrBypass = bypassActive ? true : isInsideFence;

  // --- Distance ---
  const distanceToTrack =
    coords && (track || currentTrack)
      ? Math.round(
          haversineDistanceMeters({
            lat1: coords.lat,
            lng1: coords.lng,
            lat2: (track?.lat ?? currentTrack?.lat) || 0,
            lng2: (track?.lng ?? currentTrack?.lng) || 0,
          })
        )
      : null;

  // --- Staff on duty count ---
  const [staffCount, setStaffCount] = useState(0);
  useEffect(() => {
    if (!assignedTrack) return;
    const qOnDuty = query(
      collection(db, "timeEntries"),
      where("trackId", "==", assignedTrack),
      where("clockOutAt", "==", null)
    );
    const unsub = onSnapshot(qOnDuty, (snap) => setStaffCount(snap.size));
    return () => unsub();
  }, [assignedTrack]);

  // --- My clock-in time ---
  const [clockInTime, setClockInTime] = useState(null);
  useEffect(() => {
    if (!isClockedIn || !user?.uid) {
      setClockInTime(null);
      return;
    }
    const qMyOpen = query(
      collection(db, "timeEntries"),
      where("uid", "==", user.uid),
      where("clockOutAt", "==", null),
      orderBy("clockInAt", "desc"),
      limit(1)
    );
    const unsub = onSnapshot(qMyOpen, (snap) => {
      if (!snap.empty) {
        const data = snap.docs[0].data();
        setClockInTime(data.clockInAt?.toDate() || null);
      } else {
        setClockInTime(null);
      }
    });
    return () => unsub();
  }, [isClockedIn, user]);

  // --- Shift progress ---
  const shiftMinutes = Number.isFinite(userData?.shiftMinutes) ? userData.shiftMinutes : 480;
  const shiftPercent = useMemo(() => {
    if (!clockInTime) return 0;
    const elapsedMin = Math.max(0, Math.floor((Date.now() - clockInTime.getTime()) / 60000));
    const pct = (elapsedMin / Math.max(1, shiftMinutes)) * 100;
    return Math.max(0, Math.min(100, Math.round(pct)));
  }, [clockInTime, shiftMinutes]);

  // --- Geofence proximity percent ---
  const proximityPercent = useMemo(() => {
    const effectiveTrack = track || currentTrack;
    if (!effectiveTrack || distanceToTrack == null) return 0;
    const radius = effectiveTrack?.radiusMeters || 300;
    if (insideFenceOrBypass) return 100;
    const pct = 100 - Math.min(100, Math.round((distanceToTrack / radius) * 100));
    return Math.max(0, pct);
  }, [track, currentTrack, distanceToTrack, insideFenceOrBypass]);

  const [announcements, setAnnouncements] = useState([]);
  useEffect(() => {
    const qAnn = query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(3));
    const unsub = onSnapshot(qAnn, (snap) =>
      setAnnouncements(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, []);

  const [busyClock, setBusyClock] = useState(false);
  async function handleClockButton() {
    if (!user) return;
    if (!assignedTrack) {
      alert("No assigned track. Ask an admin to set your track.");
      return;
    }
    const nameForMsg = track?.displayName || currentTrack?.displayName || assignedTrack;
    if (!insideFenceOrBypass) {
      alert(`You must be inside the ${nameForMsg} geofence to clock ${isClockedIn ? "out" : "in"}.`);
      return;
    }
    try {
      setBusyClock(true);
      if (isClockedIn) {
        await clockOut({ uid: user.uid });
      } else {
        await clockIn({ uid: user.uid, trackId: assignedTrack });
      }
    } catch (e) {
      alert(e.message);
    } finally {
      setBusyClock(false);
    }
  }

  const currentTrackName =
    currentTrack?.displayName || track?.displayName || assignedTrack || "No track";

  return (
    <>
      <TopNav />
      {bypassActive && <div className="bypass-banner">Geofence bypass enabled (dev mode)</div>}
      <div className="main-wrapper" style={{ minHeight: "100vh", display: "flex", justifyContent: "center", padding: 16 }}>
        <div className="glass-card" style={{ maxWidth: 820, width: "100%", padding: 20 }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div>
              <h2 style={{ marginTop: 0 }}>Welcome, {displayName || userData?.name || "Worker"}!</h2>
              <p style={{ color: "#48ff99", margin: 0 }}>{currentTrackName}</p>
              <p style={{ margin: 0 }}>Staff on duty: {staffCount}</p>
              {isClockedIn && clockInTime && (
                <p style={{ margin: 0, color: "#24ff98" }}>
                  On shift since{" "}
                  {clockInTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </div>

            {/* Progress bars */}
            <div style={{ width: 280, minWidth: 240, flex: "0 0 280px" }}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.85, display: "flex", justifyContent: "space-between" }}>
                  <span>Tasks completion</span><span>{completion}%</span>
                </div>
                <ProgressBar percent={completion} fillColor="#3ed37e" />
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.85, display: "flex", justifyContent: "space-between" }}>
                  <span>Shift progress</span><span>{isClockedIn && clockInTime ? `${shiftPercent}%` : "—"}</span>
                </div>
                <ProgressBar percent={isClockedIn && clockInTime ? shiftPercent : 0} fillColor="#ffb266" />
              </div>

              <div>
                <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.85, display: "flex", justifyContent: "space-between" }}>
                  <span>Proximity to gate</span><span>{proximityPercent}%</span>
                </div>
                <ProgressBar percent={proximityPercent} fillColor="#f3a4ad" />
              </div>
            </div>
          </div>

          {/* Announcements */}
          {announcements.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <h3>Announcements</h3>
              {announcements.map((a) => (
                <div key={a.id} style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                  <strong>{a.title}</strong>
                  <div style={{ fontSize: 14, opacity: 0.8 }}>{a.message}</div>
                </div>
              ))}
            </div>
          )}

          {/* Tasks list */}
          <h3 style={{ marginTop: 20 }}>Today's Tasks</h3>
          {roleHint && (
            <div className="small" style={{ color: "#ffb266", marginBottom: 8 }}>
              {roleHint}
            </div>
          )}
          {(!assignedTrack || tasks.length === 0) ? (
            <p style={{ color: "#ff6666" }}>
              {assignedTrack
                ? "No tasks assigned for today — please check with your manager."
                : "No assigned track on your profile — ask an admin to set your track."}
            </p>
          ) : (
            <ul>
              {tasks.map((t) => (
                <li key={t.docId} style={{ margin: "10px 0" }}>
                  <label>
                    <input
                      type="checkbox"
                      checked={(t.completedBy || []).includes(user?.uid)}
                      onChange={() => toggleTask(t)}
                    />{" "}
                    {t.title}
                  </label>
                </li>
              ))}
            </ul>
          )}

          {/* Clock button */}
          <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
            <button
              className="button-primary"
              onClick={handleClockButton}
              disabled={!!busyClock || !assignedTrack}
            >
              {isClockedIn ? "Clock Out" : "Clock In"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
