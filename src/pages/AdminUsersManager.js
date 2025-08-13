// src/pages/AdminUsersManager.js
import React, { useEffect, useMemo, useState } from "react";
import TopNav from "../components/TopNav";
import { db } from "../firebase";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { useAuth } from "../AuthContext";
import { isAdmin } from "../utils/roles";
import { ROLE_OPTIONS, ROLE_LABELS } from "../constants/roles";

export default function AdminUsersManager() {
  const { role } = useAuth();
  const admin = isAdmin(role);

  const [users, setUsers] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [filter, setFilter] = useState({ role: "all", track: "all", q: "" });

  // NEW: live set of uids currently clocked in (open time entry)
  const [clockedInIds, setClockedInIds] = useState(() => new Set());

  async function refreshOnce() {
    setLoading(true);
    try {
      const [uSnap, tSnap] = await Promise.all([
        getDocs(
          query(collection(db, "users"), orderBy("displayName"))
        ).catch(async () => await getDocs(collection(db, "users"))),
        getDocs(query(collection(db, "tracks"), orderBy("displayName"))),
      ]);
      setUsers(uSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setTracks(tSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshOnce();
  }, []);

  // 🔴 Authoritative live clocked-in state from /timeEntries
  useEffect(() => {
    const qOpen = query(
      collection(db, "timeEntries"),
      where("clockOutAt", "==", null)
    );
    const unsub = onSnapshot(qOpen, (snap) => {
      const s = new Set();
      snap.forEach((d) => {
        const v = d.data() || {};
        if (v.uid) s.add(v.uid);
      });
      setClockedInIds(s);
    });
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    return users
      .filter((u) => (filter.role === "all" ? true : (u.role || "") === filter.role))
      .filter((u) => (filter.track === "all" ? true : (u.assignedTrack || "") === filter.track))
      .filter((u) => {
        const q = filter.q.trim().toLowerCase();
        if (!q) return true;
        const hay = `${u.displayName || ""} ${u.name || ""} ${u.surname || ""} ${u.email || ""} ${u.role || ""}`.toLowerCase();
        return hay.includes(q);
      });
  }, [users, filter]);

  async function saveUser(u, patch) {
    if (!admin) return alert("Admins only.");
    setSavingId(u.id);
    try {
      await updateDoc(doc(db, "users", u.id), patch);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, ...patch } : x)));
    } catch (e) {
      console.error("Update user error:", e);
      alert(e.message || "Failed to update user.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <TopNav />
      <div className="main-wrapper" style={{ minHeight: "100vh", display: "flex", justifyContent: "center", padding: 16 }}>
        <div className="glass-card" style={{ maxWidth: 1100, width: "100%", padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>Admin · Users Manager</h2>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input
                placeholder="Search name/email…"
                value={filter.q}
                onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))}
                style={{ padding: 10, borderRadius: 10, background: "#121315", border: "1px solid #2a2d31", color: "#fff", minWidth: 220 }}
              />
              <select
                value={filter.role}
                onChange={(e) => setFilter((f) => ({ ...f, role: e.target.value }))}
                style={{ padding: 10, borderRadius: 10, background: "#121315", border: "1px solid #2a2d31", color: "#fff" }}
              >
                <option value="all">All roles</option>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS?.[r] ?? r}</option>
                ))}
              </select>
              <select
                value={filter.track}
                onChange={(e) => setFilter((f) => ({ ...f, track: e.target.value }))}
                style={{ padding: 10, borderRadius: 10, background: "#121315", border: "1px solid #2a2d31", color: "#fff" }}
              >
                <option value="all">All tracks</option>
                {tracks.map((t) => (
                  <option key={t.id} value={t.id}>{t.displayName || t.id}</option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div style={{ marginTop: 16 }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ marginTop: 16, opacity: 0.85 }}>No users match your filters.</div>
          ) : (
            <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
              {filtered.map((u) => {
                // ✅ Use live open time entry OR fallback user flag
                const isClockedIn = clockedInIds.has(u.id) || !!u.isClockedIn;
                return (
                  <div key={u.id} style={{ background: "#17181a", border: "1px solid #2a2d31", borderRadius: 14, padding: 14 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1.2fr 1fr 0.8fr auto", gap: 10, alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>
                          {u.displayName || `${u.name || ""} ${u.surname || ""}`.trim() || u.email || u.id}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.8 }}>{u.email || "—"} · id: <code>{u.id}</code></div>
                      </div>

                      <div>
                        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Role</div>
                        <select
                          value={u.role || ""}
                          onChange={(e) => saveUser(u, { role: e.target.value })}
                          disabled={!admin || savingId === u.id}
                          style={{ width: "100%", padding: 10, borderRadius: 10, background: "#121315", border: "1px solid #2a2d31", color: "#fff" }}
                        >
                          <option value="">— Select —</option>
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r} value={r}>{ROLE_LABELS?.[r] ?? r}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Assigned track</div>
                        <select
                          value={u.assignedTrack || ""}
                          onChange={(e) => saveUser(u, { assignedTrack: e.target.value })}
                          disabled={!admin || savingId === u.id}
                          style={{ width: "100%", padding: 10, borderRadius: 10, background: "#121315", border: "1px solid #2a2d31", color: "#fff" }}
                        >
                          <option value="">— Select —</option>
                          {tracks.map((t) => (
                            <option key={t.id} value={t.id}>{t.displayName || t.id}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Shift minutes</div>
                        <input
                          type="number"
                          min={60}
                          step={15}
                          value={Number.isFinite(u.shiftMinutes) ? u.shiftMinutes : 480}
                          onChange={(e) => saveUser(u, { shiftMinutes: Number(e.target.value) || 480 })}
                          disabled={!admin || savingId === u.id}
                          style={{ width: "100%", padding: 10, borderRadius: 10, background: "#121315", border: "1px solid #2a2d31", color: "#fff" }}
                        />
                      </div>

                      <div>
                        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Clocked in</div>
                        <div
                          style={{
                            padding: "8px 10px",
                            borderRadius: 10,
                            background: isClockedIn ? "#1e2a1f" : "#2a1212",
                            border: `1px solid ${isClockedIn ? "#2d3d2e" : "#3a1c1c"}`,
                            color: isClockedIn ? "#d6ffd6" : "#ffd6d6",
                            textAlign: "center",
                            fontWeight: 600,
                          }}
                          title="Live badge based on open time entry; read-only."
                        >
                          {isClockedIn ? "Yes" : "No"}
                        </div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <button
                          onClick={() =>
                            saveUser(u, {
                              role: u.role || "",
                              assignedTrack: u.assignedTrack || "",
                              shiftMinutes: u.shiftMinutes ?? 480,
                            })
                          }
                          disabled={!admin || savingId === u.id}
                          style={{
                            padding: "10px 14px",
                            borderRadius: 12,
                            background: "#222",
                            border: "1px solid #2a2d31",
                            color: "#fff",
                            minWidth: 90,
                          }}
                        >
                          {savingId === u.id ? "Saving…" : "Save"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
