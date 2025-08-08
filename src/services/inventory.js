// src/services/inventory.js
import {
  addDoc, collection, serverTimestamp, doc, runTransaction, getDoc, updateDoc, query, orderBy, onSnapshot
} from 'firebase/firestore';
import { db } from '../firebase';

// Collections
const INVENTORY = collection(db, 'inventory');
const MOVEMENTS = collection(db, 'stockMovements');
const SUPPLY_REQUESTS = collection(db, 'supplyRequests');

// Add a new inventory item
export async function createItem({ name, unit, category, minQty = 0, maxQty = 0, initialQty = 0 }) {
  const ref = await addDoc(INVENTORY, {
    name, unit, category,
    qty: Number(initialQty) || 0,
    minQty: Number(minQty) || 0,
    maxQty: Number(maxQty) || 0,
    createdAt: serverTimestamp(),
  });
  if (initialQty) {
    await addDoc(MOVEMENTS, {
      itemId: ref.id,
      delta: Number(initialQty),
      reason: 'initial',
      at: serverTimestamp(),
    });
  }
  return ref.id;
}

// Receive stock (increase qty)
export async function receiveStock({ itemId, qty, reason = 'receive', byUid = null }) {
  const itemRef = doc(db, 'inventory', itemId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(itemRef);
    if (!snap.exists()) throw new Error('Item not found.');
    const current = snap.data().qty || 0;
    const next = current + Number(qty);
    tx.update(itemRef, { qty: next });

    // movement
    const moveRef = doc(MOVEMENTS);
    tx.set(moveRef, {
      itemId, delta: Number(qty), reason, byUid, at: serverTimestamp(),
    });
  });
}

// Create a supply request (tracks)
export async function createSupplyRequest({ trackId, items, createdBy }) {
  // Validate items array
  const cleaned = items
    .map((i) => ({ ...i, qty: Number(i.qty) || 0 }))
    .filter((i) => i.qty > 0);

  if (cleaned.length === 0) throw new Error('No items in request.');

  // Check availability atomically: when fulfilling, but here we only create pending
  return addDoc(SUPPLY_REQUESTS, {
    trackId,
    status: 'pending',
    items: cleaned,
    createdBy,
    createdAt: serverTimestamp(),
  });
}

// Fulfill a supply request (admins): decrements central inventory
export async function fulfillRequest({ requestId, fulfilledBy }) {
  const reqRef = doc(db, 'supplyRequests', requestId);

  await runTransaction(db, async (tx) => {
    const reqSnap = await tx.get(reqRef);
    if (!reqSnap.exists()) throw new Error('Request not found.');
    const req = reqSnap.data();
    if (req.status !== 'pending') throw new Error('Only pending requests can be fulfilled.');

    // ensure stock availability
    for (const it of req.items) {
      const itemRef = doc(db, 'inventory', it.itemId);
      const itemSnap = await tx.get(itemRef);
      if (!itemSnap.exists()) throw new Error(`Item ${it.name} missing.`);
      const cur = itemSnap.data().qty || 0;
      if (cur < it.qty) throw new Error(`Not enough stock for ${it.name}. Need ${it.qty}, have ${cur}.`);
    }

    // decrement all
    for (const it of req.items) {
      const itemRef = doc(db, 'inventory', it.itemId);
      const itemSnap = await tx.get(itemRef);
      const cur = itemSnap.data().qty || 0;
      tx.update(itemRef, { qty: cur - it.qty });

      // log movement
      const mvRef = doc(MOVEMENTS);
      tx.set(mvRef, {
        itemId: it.itemId,
        delta: -it.qty,
        reason: `fulfill:${req.trackId}`,
        at: serverTimestamp(),
        byUid: fulfilledBy || null,
      });
    }

    // mark request fulfilled
    tx.update(reqRef, { status: 'fulfilled', fulfilledAt: serverTimestamp(), fulfilledBy: fulfilledBy || null });
  });
}

// Simple live listeners you can reuse (if needed)
export function listenInventory(cb) {
  const q = query(INVENTORY, orderBy('name'));
  return onSnapshot(q, cb);
}

export function listenPendingRequests(cb) {
  const q = query(SUPPLY_REQUESTS, orderBy('createdAt'));
  return onSnapshot(q, cb);
}
