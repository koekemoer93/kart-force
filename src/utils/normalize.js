// src/utils/normalize.js
import { ROLE_OPTIONS } from "../constants/roles";

/** Make "Workshop manager", "workshop_manager", etc → "workshopManager" */
export function canonicalRole(input) {
  const norm = (s) => String(s || "").toLowerCase().replace(/[\s_\-]/g, "");
  const want = norm(input || "worker");
  for (const r of ROLE_OPTIONS) {
    if (norm(r) === want) return r;
  }
  // common aliases
  if (want === "workshopmanager" || want === "workshopmgr") return "workshopManager";
  if (want === "hr" || want === "hrfinance") return "hrfinance";
  return "worker";
}

/** Return a Firestore track doc ID from either an ID or displayName */
export function normalizeTrackId(input, tracks = []) {
  if (!input || !Array.isArray(tracks)) return "";
  const byId = tracks.find((t) => t.id === input);
  if (byId) return byId.id;
  const needle = String(input).trim().toLowerCase();
  const byName = tracks.find(
    (t) => String(t.displayName || "").trim().toLowerCase() === needle
  );
  return byName?.id || "";
}
