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

export function isAdmin(input) {
  const role = getRole(input);
  return role === 'admin';
}

export function isWorkerLike(input) {
  const role = getRole(input);
  return role === 'worker' || role === 'workshopmanager';
}
