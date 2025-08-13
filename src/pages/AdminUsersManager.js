// src/pages/AdminUsersManager.js
import React, { useEffect, useMemo, useState } from "react";
import TopNav from "../components/TopNav";
import { db } from "../firebase";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { useAuth } from "../AuthContext";
import { isAdmin } from "../utils/roles";
import { ROLE_OPTIONS, ROLE_LABELS } from "../constants/roles";
import { useTracks } from "../hooks/useTracks";
import { canonicalRole, normalizeTrackId } from "../utils/normalize";

export default function AdminUsersManager() {
  const { role } = useAuth();
  const admin = isAdmin(role);

  const [users, setUsers] = useState([]);
  const [savingId, setSavingId] = useState(null);

  // 🔹 Edits are stored here per userId: { [id]: { role, assignedTrack } }
  const [edits, setEdits] = useState({});

  const tracks = useTracks();
  const trackOptions = useMemo(() => {
    return Array.isArray(tracks)
      ? tracks.map((t) => ({ value: t.id, label: t.displayName || t.id }))
      : [];
  }, [tracks]);

  // Live users list
  useEffect(() => {
    const qUsers = query(collection(db, "users"), orderBy("displayName", "asc"));
    const unsub = onSnapshot(qUsers, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setUsers(rows);
    });
    return () => unsub();
  }, []);

  // Ensure `edits` always has an entry for each user (without resetting your in-progress edits)
  useEffect(() => {
    if (!users.length) return;
    setEdits((prev) => {
      const next = { ...prev };
      for (const u of users) {
        if (!next[u.id]) {
          next[u.id] = {
            role: u.role || "worker",
            assignedTrack: u.assignedTrack || "",
          };
        }
      }
      return next;
    });
  }, [users]);

  // Row handlers (no hooks here)
  const handleRoleChange = (userId, value) => {
    setEdits((prev) => ({
      ...prev,
      [userId]: { ...(prev[userId] || {}), role: value },
    }));
  };

  const handleTrackChange = (userId, value) => {
    setEdits((prev) => ({
      ...prev,
      [userId]: { ...(prev[userId] || {}), assignedTrack: value },
    }));
  };

  async function saveUser(u) {
    if (!admin) return alert("Admins only.");
    try {
      setSavingId(u.id);
      const draft = edits[u.id] || {};

      // ✅ Normalize before saving
      const nextRole = canonicalRole(draft.role ?? u.role ?? "worker");
      const nextAssignedTrack = normalizeTrackId(
        draft.assignedTrack ?? u.assignedTrack ?? "",
        tracks
      );

      await updateDoc(doc(db, "users", u.id), {
        role: nextRole,
        assignedTrack: nextAssignedTrack || null,
      });

      // Keep the edited state in sync with what we wrote
      setEdits((prev) => ({
        ...prev,
        [u.id]: {
          role: nextRole,
          assignedTrack: nextAssignedTrack || "",
        },
      }));
    } catch (e) {
      console.error("Update user failed:", e);
      alert(e?.message || "Failed to update user.");
    } finally {
      setSavingId(null);
    }
  }

  if (!admin) {
    return (
      <>
        <TopNav />
        <div className="main-wrapper" style={{ padding: 20 }}>
          <div className="glass-card" style={{ padding: 16 }}>
            Admins only.
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <TopNav />
      <div className="main-wrapper" style={{ padding: 20 }}>
        <div className="glass-card" style={{ padding: 16, marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Admin — Users</h2>
          <div className="small muted">
            Roles and tracks are normalized on save (canonical roles + track doc IDs).
          </div>
        </div>

        <div className="glass-card" style={{ padding: 16 }}>
          {users.length === 0 ? (
            <div>No users found.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: 8 }}>Name</th>
                  <th style={{ textAlign: "left", padding: 8 }}>Email</th>
                  <th style={{ textAlign: "left", padding: 8 }}>Role</th>
                  <th style={{ textAlign: "left", padding: 8 }}>Assigned Track</th>
                  <th style={{ textAlign: "left", padding: 8 }}></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const draft = edits[u.id] || {};
                  const roleSel = draft.role ?? u.role ?? "worker";
                  const trackSel = draft.assignedTrack ?? u.assignedTrack ?? "";

                  return (
                    <tr key={u.id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                      <td style={{ padding: 8 }}>
                        {u.displayName || u.name || "(no name)"}
                      </td>
                      <td style={{ padding: 8 }}>{u.email || ""}</td>
                      <td style={{ padding: 8 }}>
                        <select
                          className="input-field"
                          value={roleSel}
                          onChange={(e) => handleRoleChange(u.id, e.target.value)}
                        >
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS?.[r] ?? r}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: 8 }}>
                        <select
                          className="input-field"
                          value={trackSel}
                          onChange={(e) => handleTrackChange(u.id, e.target.value)}
                          title="Track doc ID"
                        >
                          <option value="">— none —</option>
                          {trackOptions.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: 8 }}>
                        <button
                          className="button-primary"
                          disabled={savingId === u.id}
                          onClick={() => saveUser(u)}
                        >
                          {savingId === u.id ? "Saving…" : "Save"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
