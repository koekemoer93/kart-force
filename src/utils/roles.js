// src/utils/roles.js
// Centralized role helpers. Accept a role string or an object with a `role` field.

export function getRole(input) {
  if (!input) return undefined;
  if (typeof input === 'string') return input.trim().toLowerCase();
  if (typeof input === 'object' && typeof input.role === 'string') {
    return input.role.trim().toLowerCase();
  }
  return undefined;
}

// Canonical role sets (lowercase)
export const ADMIN_ROLES = ['admin', 'hrfinance',];
export const WORKER_LIKE_ROLES = [
  'worker',
  'workshopmanager', // note: we normalize to lowercase, so "workshopManager" → "workshopmanager"
  'mechanic',
  'reception',
  'marshall',
  'manager',
  'assistantmanager',
  
];

export const ALL_ROLES = [...new Set([...ADMIN_ROLES, ...WORKER_LIKE_ROLES])];

export function isAdmin(input) {
  const role = getRole(input);
  return ADMIN_ROLES.includes(role);
}

export function isWorkerLike(input) {
  const role = getRole(input);
  return WORKER_LIKE_ROLES.includes(role);
}

export function isKnownRole(input) {
  const role = getRole(input);
  return ALL_ROLES.includes(role);
}
