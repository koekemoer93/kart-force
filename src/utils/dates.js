// src/utils/date.js
export function formatDateYMD(date = new Date(), tz = 'Africa/Johannesburg') {
  // Returns "YYYY-MM-DD" in the given timezone
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d); // en-CA -> YYYY-MM-DD
}
