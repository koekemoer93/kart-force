// src/components/GeofenceGate.jsx
import React, { useMemo } from "react";
import { useGeofence } from "../hooks/useGeofence";
import { useAuth } from "../AuthContext";
import { isAdmin } from "../utils/roles";

const card = {
  background: "rgba(23,24,26,0.85)",
  border: "1px solid #2a2d31",
  borderRadius: 16,
  padding: 14,
  color: "#f5f5f7",
};

const chip = {
  display: "inline-block",
  padding: "4px 10px",
  borderRadius: 999,
  border: "1px solid #2a2d31",
  background: "rgba(255,255,255,0.06)",
  fontSize: 12,
};

function useBypassFlags(adminCanBypass) {
  const params = new URLSearchParams(window.location.search);
  const qBypass = ["1", "true", "on", "off"].includes((params.get("bypass") || "").toLowerCase())
    || (params.get("gf") || "").toLowerCase() === "off";
  const lsBypass = localStorage.getItem("GF_BYPASS") === "1";
  const envBypass = String(process.env.REACT_APP_GEOFENCE_BYPASS) === "1";
  const active = adminCanBypass && (qBypass || lsBypass || envBypass);
  return { active, setActive: (v) => localStorage.setItem("GF_BYPASS", v ? "1" : "0") };
}

/**
 * GeofenceGate
 * Blocks access unless inside geofence or an admin enables dev bypass.
 *
 * Props:
 * - trackId: string (required)
 * - radiusMeters?: number
 * - mode?: "block" | "soft"  (default "block"; "soft" shows a banner but allows view)
 */
 export default function GeofenceGate({ trackId: propTrackId, radiusMeters, mode = "block", children }) {
  const { role: ctxRole, profile } = useAuth();
  // ✅ Use passed prop if provided, otherwise fall back to the signed-in user's assignedTrack
  const trackId = propTrackId ?? profile?.assignedTrack ?? null;
  const admin = isAdmin(ctxRole);
  const { inside, distance, target, position, permission, error, loading, retry } =
    useGeofence({ trackId, radiusMeters, enable: true });

  const { active: bypass, setActive } = useBypassFlags(admin);

  const allowSoft = mode === "soft";
  const allowed = inside || bypass || allowSoft;

  const Banner = useMemo(() => {
    if (inside) return null;
    return (
      <div style={{ ...card, marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <strong>Geofence</strong>
          <span style={chip}>
            {Number.isFinite(distance) ? `${distance} m from track` : "No GPS fix"}
          </span>
          {permission && <span style={chip}>perm: {permission}</span>}
          {target?.lat && target?.lng && (
            <span style={chip}>target: {target.lat.toFixed(5)}, {target.lng.toFixed(5)}</span>
          )}
          {position?.lat && position?.lng && (
            <span style={chip}>you: {position.lat.toFixed(5)}, {position.lng.toFixed(5)}</span>
          )}
          {error && <span style={{ ...chip, borderColor: "#ff4444", background: "rgba(255,68,68,0.08)" }}>{error}</span>}
          <button onClick={retry} style={{ ...chip, borderColor: "#5eead4", background: "rgba(94,234,212,0.18)" }}>
            Retry GPS
          </button>
          {admin && (
            <button
              onClick={() => { setActive(true); window.location.reload(); }}
              style={{ ...chip, borderColor: "#24ff98", background: "rgba(36,255,152,0.08)" }}
              title="Admin-only dev bypass (clears on turning off)"
            >
              Enable Dev Bypass
            </button>
          )}
        </div>
        {admin && (
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
            Tip: add <code>?bypass=1</code> to the URL (admin-only). Disable by removing it,
            or click “Disable” in the debug tray on this page after reload.
          </div>
        )}
      </div>
    );
  }, [inside, distance, target, position, permission, error, retry, admin, setActive]);

  if (!allowed) {
    return (
      <div style={{ minHeight: "100vh", background: "#0f0f10" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: 12 }}>
          {Banner}
          <div style={{ ...card }}>
            <strong>Access limited to on-site staff.</strong>
            <div style={{ opacity: 0.85, marginTop: 6 }}>
              Move within the geofence to proceed. Admins can enable a temporary dev bypass.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {!inside && Banner}
      {children}
    </div>
  );
}
