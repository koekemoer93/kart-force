// src/utils/roles.js
// Centralized role helpers. Accept a role string or an object with a `role` field.
// Merged to support both canonical (camelCase) keys from constants/roles.js
// and legacy lowercase usage in older code paths.

import { ROLE_OPTIONS } from '../constants/roles';

/** Get the raw role string from a string or an object with { role }. */
export function getRole(input) {
  if (!input) return undefined;
  if (typeof input === 'string') return input.trim();
  if (typeof input === 'object' && typeof input.role === 'string') {
    return input.role.trim();
  }
  return undefined;
}

/**
 * Map any variant (case/spacing) to a canonical key from ROLE_OPTIONS.
 * If not found, returns the original (so issues are visible in UI/logs).
 */
export function canonicalizeRole(input) {
  const raw = getRole(input);
  if (!raw) return 'worker';
  const lower = raw.toLowerCase();
  const hit = ROLE_OPTIONS.find((r) => r.toLowerCase() === lower);
  return hit || raw;
}

/** Case-insensitive equality using canonical keys. */
export function roleEquals(a, b) {
  return canonicalizeRole(a).toLowerCase() === canonicalizeRole(b).toLowerCase();
}

/* ------------------------------------------------------------------ */
/* Canonical role sets (camelCase)                                    */
/* ------------------------------------------------------------------ */
export const ADMIN_ROLES = ['admin', 'hrfinance'];
export const WORKER_LIKE_ROLES = [
  'worker',
  'workshopManager',
  'mechanic',
  'reception',
  'marshall',
  'manager',
  'assistantManager',
];
export const ALL_ROLES = [...new Set([...ADMIN_ROLES, ...WORKER_LIKE_ROLES])];

/* Legacy lowercase mirrors for older code paths */
export const ADMIN_ROLES_LC = ADMIN_ROLES.map((r) => r.toLowerCase());
export const WORKER_LIKE_ROLES_LC = WORKER_LIKE_ROLES.map((r) => r.toLowerCase());
export const ALL_ROLES_LC = ALL_ROLES.map((r) => r.toLowerCase());

/* ------------------------------------------------------------------ */
/* Predicates — accept string or { role }, robust to any casing       */
/* ------------------------------------------------------------------ */
export function isAdmin(input) {
  const key = canonicalizeRole(input);
  const lc = key.toLowerCase();
  return ADMIN_ROLES.includes(key) || ADMIN_ROLES_LC.includes(lc);
}

export function isWorkerLike(input) {
  const key = canonicalizeRole(input);
  const lc = key.toLowerCase();
  return WORKER_LIKE_ROLES.includes(key) || WORKER_LIKE_ROLES_LC.includes(lc);
}

export function isKnownRole(input) {
  const key = canonicalizeRole(input);
  const lc = key.toLowerCase();
  return ALL_ROLES.includes(key) || ALL_ROLES_LC.includes(lc);
}
