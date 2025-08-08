// Map any old/legacy IDs to the real Firestore IDs.
// Add more as you discover them.
export const TRACK_ID_ALIASES = {
  // examples of older names you might still have in code:
  "Syringa": "SyringaPark",
  "Epic karting pavilion": "epic-karting-pavilion",
  "Epic karting midlands": "epic-karting-midlands",
  "Indykart gateway": "indykart-gateway",
  "Indykart eastgate": "indykart-eastgate",
  "Indykart parkview": "indykart-parkview",
  "Indykart mall of the south": "indykart-mall-of-the-south",
  "Indykart clearwater": "indykart-clearwater",
  "RBEK Rosebank electric karting": "rbek",
};

export function resolveTrackId(id) {
  return TRACK_ID_ALIASES[id] || id;
}
