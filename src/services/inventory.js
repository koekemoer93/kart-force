// src/services/inventory.js
import { db } from '../firebase';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  increment,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

/**
 * Create a new inventory item in the root "inventory" collection.
 * Fields:
 *  - name, unit, category, minQty, maxQty
 *  - qty (starts at initialQty)
 *  - createdAt, createdBy
 */
export async function createItem(payload, opts = {}) {
  const {
    name,
    unit,
    category,
    minQty = 0,
    maxQty = 0,
    initialQty = 0,
    createdBy = opts.createdBy || null,
  } = payload;

  const docData = {
    name: String(name || '').trim(),
    unit: String(unit || 'pcs').trim(),
    category: String(category || 'essentials'),
    minQty: Number(minQty) || 0,
    maxQty: Number(maxQty) || 0,
    qty: Number(initialQty) || 0,
    createdAt: serverTimestamp(),
    createdBy,
  };

  if (!docData.name) {
    throw new Error('Item name is required.');
  }

  // Write to /inventory
  const ref = await addDoc(collection(db, 'inventory'), docData);

  // Optional: write an initial movement record
  if ((Number(initialQty) || 0) > 0) {
    await addDoc(collection(db, 'inventory', ref.id, 'movements'), {
      type: 'receive',
      qty: Number(initialQty),
      reason: 'initial stock',
      at: serverTimestamp(),
      by: createdBy || null,
    });
  }

  return ref.id;
}

/**
 * Receive stock into an existing inventory item.
 *  - itemId (inventory doc id)
 *  - qty (>0)
 *  - reason (optional)
 *  - byUid (optional)
 */
export async function receiveStock({ itemId, qty, reason, byUid }) {
  const id = String(itemId || '').trim();
  const delta = Number(qty) || 0;
  if (!id) throw new Error('Missing itemId.');
  if (delta <= 0) throw new Error('Quantity must be > 0.');

  const itemRef = doc(db, 'inventory', id);

  // Use a transaction to be safe under concurrency
  await runTransaction(db, async (trx) => {
    const snap = await trx.get(itemRef);
    if (!snap.exists()) throw new Error('Item not found.');

    // increment qty
    trx.update(itemRef, { qty: increment(delta) });

    // movement log
    const mvRef = doc(collection(db, 'inventory', id, 'movements'));
    trx.set(mvRef, {
      type: 'receive',
      qty: delta,
      reason: reason || 'receive',
      at: serverTimestamp(),
      by: byUid || null,
    });
  });
}

/**
 * Fulfill a supply request:
 *  - requestId (doc id in /supplyRequests)
 *  - fulfilledBy (uid)
 *
 * Expects request doc with:
 *   { items: [{ itemId, name, unit, qty }], status, trackId }
 * Deducts from inventory.qty and marks request as "fulfilled".
 */
export async function fulfillRequest({ requestId, fulfilledBy }) {
  const reqId = String(requestId || '').trim();
  if (!reqId) throw new Error('Missing requestId.');

  const reqRef = doc(db, 'supplyRequests', reqId);

  await runTransaction(db, async (trx) => {
    const reqSnap = await trx.get(reqRef);
    if (!reqSnap.exists()) throw new Error('Request not found.');

    const data = reqSnap.data();
    if (data.status && data.status !== 'pending') {
      // already fulfilled or canceled
      return;
    }

    const items = Array.isArray(data.items) ? data.items : [];
    for (const it of items) {
      const itemId = it.itemId || it.id; // support both shapes
      const take = Number(it.qty) || 0;
      if (!itemId || take <= 0) continue;

      const invRef = doc(db, 'inventory', itemId);
      const invSnap = await trx.get(invRef);
      if (!invSnap.exists()) {
        // skip missing inventory items
        continue;
      }

      // Deduct (can go negative if you allow; otherwise clamp)
      const current = Number(invSnap.data().qty) || 0;
      const newQty = Math.max(0, current - take);
      trx.update(invRef, { qty: newQty });

      // movement record
      const mvRef = doc(collection(db, 'inventory', itemId, 'movements'));
      trx.set(mvRef, {
        type: 'issue',
        qty: take,
        reason: `fulfill:${reqId}`,
        at: serverTimestamp(),
        by: fulfilledBy || null,
        trackId: data.trackId || null,
      });
    }

    // Mark request fulfilled
    trx.update(reqRef, {
      status: 'fulfilled',
      fulfilledAt: serverTimestamp(),
      fulfilledBy: fulfilledBy || null,
    });
  });
}

// Create a new supply request in /supplyRequests
// Payload shape (flexible):
// {
//   trackId: "SyringaPark",
//   items: [
//     { itemId: "abc123", name: "Coke 330ml", unit: "can", qty: 12 },
//     { id: "def456", name: "Brake Pads", unit: "set", qty: 2 } // itemId or id is fine
//   ],
//   note: "Weekend top-up",
//   requestedBy: "<uid>"
// }
export async function createSupplyRequest({ trackId, items, note, requestedBy }) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Items array is required.');
  }

  const clean = items
    .map((it) => {
      const qty = Number(it.qty) || 0;
      if (qty <= 0) return null;
      return {
        itemId: it.itemId || it.id || null,
        name: String(it.name || '').trim(),
        unit: String(it.unit || '').trim(),
        qty,
      };
    })
    .filter(Boolean);

  if (clean.length === 0) {
    throw new Error('All item quantities must be > 0.');
  }

  await addDoc(collection(db, 'supplyRequests'), {
    trackId: trackId || null,
    items: clean,
    status: 'pending',
    note: note || '',
    createdAt: serverTimestamp(),
    createdBy: requestedBy || null,
  });
}






/*
 * (Optional helper) Ensure a user doc exists with role.
 * Only used if you want to seed /users/{uid}. Not called by the UI.
 */
export async function ensureUserRole(uid, role = 'worker') {
  if (!uid) return;
  const uref = doc(db, 'users', uid);
  const snap = await getDoc(uref);
  if (!snap.exists()) {
    await setDoc(uref, { role, createdAt: serverTimestamp() });
  }
}
