// src/services/tracks.js
import { db } from "../firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

/**
 * Load hours for a track from /tracks/{id}.hours (FIELD mode),
 * falling back to /tracks/{id}/config/hours (document) if needed.
 *
 * Returns the raw "hours" object (not normalized), or null if none.
 */
export async function fetchTrackHoursRaw(trackId) {
  // 1) Try field on /tracks/{id}
  const trackRef = doc(db, "tracks", trackId);
  const trackSnap = await getDoc(trackRef);
  if (trackSnap.exists()) {
    const data = trackSnap.data();
    // Prefer the new canonical field if present
    if (data && data.hours) return data.hours;
    // Support legacy names, just in case older docs still use them
    if (data && data.openingHours) return data.openingHours;
    if (data && data.tradingHours) return data.tradingHours;
  }

  // 2) Fallback: /tracks/{id}/config/hours (a single doc called "hours")
  const fallbackRef = doc(db, "tracks", trackId, "config", "hours");
  const fbSnap = await getDoc(fallbackRef);
  if (fbSnap.exists()) {
    return fbSnap.data();
  }

  return null;
}

/** Validate "HH:MM" (24h) */
export function isValidHM(hhmm) {
  if (typeof hhmm !== "string") return false;
  // 0-23 for hours, 00-59 for minutes (e.g., "9:00" or "09:00" both OK)
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(hhmm.trim());
}

/** A simple empty week object keyed by full day names (sunday..saturday) */
export function emptyWeek() {
  // Closed by default; editor can flip to open and set times
  const mk = () => ({ open: "09:00", close: "17:00", closed: true });
  return {
    sunday: mk(),
    monday: mk(),
    tuesday: mk(),
    wednesday: mk(),
    thursday: mk(),
    friday: mk(),
    saturday: mk(),
  };
}

/**
 * Normalize assorted saved shapes into editor shape keyed by
 * full day names (sunday..saturday) with {open, close, closed}.
 */
function toEditorWeek(raw) {
  if (!raw) return emptyWeek();

  // If it's an array of 7 (Sun..Sat)
  if (Array.isArray(raw) && raw.length === 7) {
    const toDay = (d) => ({
      open: isValidHM(d?.open) ? d.open : "09:00",
      close: isValidHM(d?.close) ? d.close : "17:00",
      closed: d?.closed === true,
    });
    return {
      sunday: toDay(raw[0]),
      monday: toDay(raw[1]),
      tuesday: toDay(raw[2]),
      wednesday: toDay(raw[3]),
      thursday: toDay(raw[4]),
      friday: toDay(raw[5]),
      saturday: toDay(raw[6]),
    };
  }

  // If it's an object keyed by day names (various styles)
  const out = emptyWeek();

  const alias = {
    sun: "sunday",
    sunday: "sunday",
    mon: "monday",
    monday: "monday",
    tue: "tuesday",
    tues: "tuesday",
    tuesday: "tuesday",
    wed: "wednesday",
    weds: "wednesday",
    wednesday: "wednesday",
    thu: "thursday",
    thur: "thursday",
    thurs: "thursday",
    thursday: "thursday",
    fri: "friday",
    friday: "friday",
    sat: "saturday",
    saturday: "saturday",
  };

  if (typeof raw === "object") {
    Object.keys(raw).forEach((k) => {
      const key = alias[k.toLowerCase()];
      if (!key || !out[key]) return;
      const v = raw[k] || {};
      out[key] = {
        open: isValidHM(v.open) ? v.open : out[key].open,
        close: isValidHM(v.close) ? v.close : out[key].close,
        closed: v.closed === true,
      };
    });
    return out;
  }

  return out;
}

/**
 * Read "opening hours" for editors. Returns an object keyed by day names
 * (sunday..saturday) with { open, close, closed } fields.
 */
export async function getOpeningHours(trackId) {
  const raw = await fetchTrackHoursRaw(trackId);
  return toEditorWeek(raw);
}

/**
 * Save the editor's opening hours back to /tracks/{id}.hours (FIELD mode).
 * (Keeps your new canonical location in one place.)
 */
export async function saveOpeningHours(trackId, week) {
  // Light validation: ensure strings are valid or mark closed
  const base = emptyWeek();
  const norm = { ...base };

  for (const day of Object.keys(base)) {
    const src = week?.[day] || {};
    const closed = !!src.closed;
    const open = isValidHM(src.open) ? src.open : base[day].open;
    const close = isValidHM(src.close) ? src.close : base[day].close;
    norm[day] = { open, close, closed };
  }

  const ref = doc(db, "tracks", trackId);
  await setDoc(ref, { hours: norm }, { merge: true });
}
