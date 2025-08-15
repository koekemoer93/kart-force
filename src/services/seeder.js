// src/services/seeder.js
// Bulk seeding with filters for track, roles, frequency, and date range.
// - Respects daysOfWeek for weekly
// - Avoids duplicates using (assignedTrack, role, date, title)
// - Expands ALL_* tokens
// - Canonicalizes role strings so casing variants don't break queries
//
// Required Firestore index (already in your project spec):
//   tasks composite: assignedTrack (==), role (==), date (==)

import {
  addDoc, collection, getDocs, orderBy, query, serverTimestamp, where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { ROLE_OPTIONS } from '../constants/roles';
import { canonicalizeRole } from '../utils/roles';

export const ALL_TRACKS_TOKEN = '__all_tracks__';
export const ALL_ROLES_TOKEN  = '__all_roles__';

const FREQS = ['daily','weekly','monthly'];
const WEEKDAYS = ['sun','mon','tue','wed','thu','fri','sat'];

const ymd = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
};
const wkey = (d) => WEEKDAYS[new Date(d).getDay()];

function normalizeTemplate(raw, id) {
  return {
    id,
    title: raw.title || '(untitled)',
    description: raw.description || '',
    assignedTrack: raw.assignedTrack || raw.track || '',
    frequency: String(raw.frequency || raw.period || 'daily').toLowerCase(),
    // 🔒 canonical role key (e.g. assistantManager)
    role: canonicalizeRole(raw.role || raw.assigneeRole || raw.assignedToRole || 'worker'),
    daysOfWeek: Array.isArray(raw.daysOfWeek) ? raw.daysOfWeek : [],
  };
}

function eligible(t, dateObj) {
  if (t.frequency === 'daily') return true;
  if (t.frequency === 'weekly') {
    const w = wkey(dateObj);
    if (t.daysOfWeek?.length) return t.daysOfWeek.includes(w);
    return w === 'mon'; // default weekly day if none provided
  }
  if (t.frequency === 'monthly') return new Date(dateObj).getDate() === 1; // 1st of month
  return false;
}

async function taskExists({ assignedTrack, role, date, title }) {
  const q1 = query(
    collection(db, 'tasks'),
    where('assignedTrack', '==', assignedTrack),
    where('role', '==', role),              // exact canonical match
    where('date', '==', date),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q1);
  if (snap.empty) return false;
  return snap.docs.some((d) => (d.data()?.title || '').trim() === title.trim());
}

function expandRoles(tmplRole, includeRoles) {
  const roleKey = canonicalizeRole(tmplRole);
  if (roleKey && roleKey !== ALL_ROLES_TOKEN) return [roleKey];       // template is specific
  // Template is "all roles" → use selected roles, or all ROLE_OPTIONS if none selected
  const pool = Array.isArray(includeRoles) && includeRoles.length
    ? includeRoles.map(canonicalizeRole)
    : ROLE_OPTIONS.slice();
  return pool;
}

async function expandTracks(tmplTrack, includeTrack) {
  if (tmplTrack && tmplTrack !== ALL_TRACKS_TOKEN) return [tmplTrack];
  if (includeTrack && includeTrack !== ALL_TRACKS_TOKEN) return [includeTrack];
  const snap = await getDocs(collection(db, 'tracks'));
  return snap.docs.map(d => d.id);
}

async function seedOne({ dateObj, template, includeRoles, includeFrequencies, includeTrack }) {
  const dateStr = ymd(dateObj);
  if (!includeFrequencies.includes(template.frequency)) return { created: 0, skipped: 1 };
  if (!eligible(template, dateObj)) return { created: 0, skipped: 1 };

  const roles = expandRoles(template.role, includeRoles);
  const tracks = await expandTracks(template.assignedTrack, includeTrack);

  let created = 0, skipped = 0;
  for (const r of roles) {
    const role = canonicalizeRole(r); // defensive
    for (const trackId of tracks) {
      if (await taskExists({ assignedTrack: trackId, role, date: dateStr, title: template.title })) {
        skipped++; continue;
      }
      await addDoc(collection(db, 'tasks'), {
        assignedTrack: trackId,
        role,                               // always canonical key
        title: template.title,
        description: template.description || '',
        completedBy: [],
        date: dateStr,                      // "YYYY-MM-DD"
        createdAt: serverTimestamp(),
      });
      created++;
    }
  }
  return { created, skipped };
}

export async function seedTasksRange({
  startDate = new Date(),
  endDate,
  includeRoles = [],
  includeFrequencies = FREQS.slice(),
  includeTrack = ALL_TRACKS_TOKEN,
} = {}) {
  const start = new Date(startDate);
  const end   = new Date(endDate ?? start);

  const tSnap = await getDocs(collection(db, 'taskTemplates'));
  const templates = tSnap.docs.map(d => normalizeTemplate(d.data(), d.id));

  let createdCount = 0, skippedCount = 0, daysProcessed = 0;

  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  while (cur <= last) {
    for (const t of templates) {
      const { created, skipped } = await seedOne({
        dateObj: cur, template: t, includeRoles, includeFrequencies, includeTrack,
      });
      createdCount += created;
      skippedCount += skipped;
    }
    daysProcessed++;
    cur.setDate(cur.getDate() + 1);
  }

  return { start: ymd(start), end: ymd(last), daysProcessed, createdCount, skippedCount };
}

// 🔁 Back-compat: single-day seeding wrapper used by existing pages
export async function seedTasksNow({
  date = new Date(),
  includeRoles = [],                               // empty = all roles
  includeFrequencies = ['daily', 'weekly', 'monthly'],
  includeTrack = ALL_TRACKS_TOKEN,                 // all tracks
} = {}) {
  const d = new Date(date);
  const res = await seedTasksRange({
    startDate: d,
    endDate: d,
    includeRoles,
    includeFrequencies,
    includeTrack,
  });
  return {
    date: res.start,                // "YYYY-MM-DD"
    createdCount: res.createdCount,
    skippedCount: res.skippedCount,
  };
}
