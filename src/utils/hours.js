// src/utils/hours.js

// We’ll support multiple shapes:
//
// 1) Array of 7 items (Sun=0..Sat=6):
//    [{ open: "09:00", close: "17:00", closed: false }, ...]
//
// 2) Object keyed by day names:
//    { monday: {...}, tuesday: {...}, ... }
//
// 3) Optional multiple ranges per day:
//    { open: "09:00", close: "12:00", open2: "13:00", close2: "17:00" }
//
// Any missing/closed day -> closed all day.

const DAY_KEYS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

/**
 * Ensure we always get a canonical weekly array: index 0..6 (Sun..Sat)
 * Each item: { periods: [{open:"HH:MM", close:"HH:MM"}], closed:boolean }
 */
export function normalizeWeeklyHours(raw) {
  if (!raw) return null;

  const toPeriods = (obj) => {
    if (!obj || obj.closed === true) return { periods: [], closed: true };

    // Accept single or split shift fields
    const p = [];
    if (obj.open && obj.close) p.push({ open: obj.open, close: obj.close });
    if (obj.open2 && obj.close2) p.push({ open: obj.open2, close: obj.close2 });
    return { periods: p, closed: p.length === 0 };
  };

  // Case: already an array of 7
  if (Array.isArray(raw) && raw.length === 7) {
    return raw.map(toPeriods);
  }

  // Case: object keyed by day
  if (typeof raw === "object") {
    return DAY_KEYS.map((k) => toPeriods(raw[k]));
  }

  return null;
}

/**
 * Is a track open "now" given normalized weekly hours.
 * @param {*} normalized array of 7
 * @param {*} now a Date in local time (Africa/Johannesburg)
 */
export function isOpenNow(normalized, now = new Date()) {
  if (!normalized || normalized.length !== 7) return false;

  const day = now.getDay(); // 0..6 (Sun..Sat)
  const entry = normalized[day];
  if (!entry || entry.closed) return false;

  const toMinutes = (hhmm) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + (m || 0);
  };

  const minutesNow = now.getHours() * 60 + now.getMinutes();

  // Open if any period contains "now"
  return entry.periods.some(({ open, close }) => {
    if (!open || !close) return false;
    const start = toMinutes(open);
    const end = toMinutes(close);
    // Assume same-day ranges (no overnight), common for venues
    return minutesNow >= start && minutesNow < end;
  });
}
