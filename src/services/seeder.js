// src/services/seeder.js
import {
  addDoc,
  collection,
  getDocs,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { ROLE_OPTIONS } from "../constants/roles";
import { canonicalRole } from "../utils/normalize";

// Tokens must match AdminTaskManager
export const ALL_TRACKS_TOKEN = "__all_tracks__";
export const ALL_ROLES_TOKEN = "__all_roles__";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function yyyyMmDdLocal(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const da = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function shouldSeedOnDate(template, date) {
  const freq = (template.frequency || "daily").toLowerCase();
  const weekdayKey = DAY_KEYS[new Date(date).getDay()]; // mon..sun keys

  if (freq === "daily") return true;

  if (freq === "weekly") {
    const days = Array.isArray(template.daysOfWeek) ? template.daysOfWeek : [];
    // If days specified: only seed on listed days. If not specified: seed every week day.
    return days.length ? days.includes(weekdayKey) : true;
  }

  if (freq === "monthly") {
    // Simple default: seed on the 1st of the month
    return new Date(date).getDate() === 1;
  }

  // Unknown frequency -> be safe and skip
  return false;
}

/**
 * Seed all eligible tasks for a single date (default = today).
 * - Expands "__all_tracks__" to all /tracks IDs
 * - Expands "__all_roles__" to ROLE_OPTIONS
 * - Avoids duplicates by checking existing tasks for (track, role, date, title)
 */
export async function seedTasksNow({ date = new Date() } = {}) {
  const targetDateStr = yyyyMmDdLocal(date);
  const created = [];
  const skipped = [];

  // 1) Load tracks
  const tracksSnap = await getDocs(collection(db, "tracks"));
  const trackIds = tracksSnap.docs.map((d) => d.id);

  // 2) Load templates
  const templatesSnap = await getDocs(collection(db, "taskTemplates"));
  const templates = templatesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // 3) Walk templates -> expand -> write if not duplicate
  for (const t of templates) {
    if (!shouldSeedOnDate(t, date)) {
      skipped.push({ reason: "not_scheduled_today", templateId: t.id, title: t.title });
      continue;
    }

 const roleList =
   t.role === ALL_ROLES_TOKEN
     ? ROLE_OPTIONS
     : [canonicalRole(t.role)].filter(Boolean);
    const trackList =
      t.assignedTrack === ALL_TRACKS_TOKEN ? trackIds : [t.assignedTrack].filter(Boolean);

    if (!roleList.length || !trackList.length) {
      skipped.push({ reason: "no_targets", templateId: t.id, title: t.title });
      continue;
    }

    for (const trackId of trackList) {
      for (const role of roleList) {
        // Duplicate check: same date + role + track + title
        const qExisting = query(
          collection(db, "tasks"),
          where("assignedTrack", "==", trackId),
          where("role", "==", role),
          where("date", "==", targetDateStr)
        );
        const existingSnap = await getDocs(qExisting);
        const existsSameTitle = existingSnap.docs.some(
          (d) => (d.data().title || "") === (t.title || "")
        );
        if (existsSameTitle) {
          skipped.push({
            reason: "duplicate",
            templateId: t.id,
            title: t.title,
            trackId,
            role,
          });
          continue;
        }

        const payload = {
          assignedTrack: trackId,
          role,
          title: t.title || "(untitled)",
          description: t.description || "",
          date: targetDateStr, // "YYYY-MM-DD"
          completedBy: [],
          createdAt: serverTimestamp(),
          templateId: t.id,
        };

        const ref = await addDoc(collection(db, "tasks"), payload);
        created.push({ id: ref.id, ...payload });
      }
    }
  }

  return {
    date: targetDateStr,
    createdCount: created.length,
    skippedCount: skipped.length,
    created,
    skipped,
  };
}
