// src/AuthContext.js
// ⬇️ Paste this entire file

import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, updateProfile } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { isAdmin as isAdminFn, isWorkerLike as isWorkerLikeFn } from './utils/roles';

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

// ---- Helpers ----
const WORKER_LIKE_ROLES = [
  'worker',
  'mechanic',
  'marshall',
  'workshopmanager',
  'assistantmanager',
  'reception',
];

const ALLOWED_ROLES = ['admin', ...WORKER_LIKE_ROLES];

function normalizeRole(input) {
  if (!input) return null;
  const r = String(input).trim().toLowerCase();
  return ALLOWED_ROLES.includes(r) ? r : null;
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);          // Firebase Auth user
  const [role, setRole] = useState(null);          // 'admin' | worker-like | null (all lowercase)
  const [profile, setProfile] = useState(null);    // Firestore user doc data
  const [loading, setLoading] = useState(true);    // loading Firestore user doc

  // Ensure Firestore user doc exists with required fields (normalized shape)
  const ensureUserDoc = async (authUser) => {
    if (!authUser) return;

    const userRef = doc(db, 'users', authUser.uid);
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
      const newDoc = {
        uid: authUser.uid,
        email: authUser.email || '',
        displayName: authUser.displayName || '',
        photoURL: authUser.photoURL || '',
        role: 'worker',              // default
        assignedTrack: '',
        isClockedIn: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(userRef, newDoc);
      return newDoc;
    } else {
      // Patch missing keys to keep the document shape consistent
      const data = snap.data();
      const updates = {};
      if (data.role == null) updates.role = 'worker';
      if (data.displayName == null) updates.displayName = authUser.displayName || '';
      if (data.photoURL == null) updates.photoURL = authUser.photoURL || '';
      if (data.assignedTrack == null) updates.assignedTrack = '';
      if (data.isClockedIn == null) updates.isClockedIn = false;

      if (Object.keys(updates).length) {
        updates.updatedAt = serverTimestamp();
        await updateDoc(userRef, updates);
      }
      return { ...data, ...updates };
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (authUser) => {
      try {
        if (authUser) {
          const ensured = await ensureUserDoc(authUser);
          const effective =
            ensured || (await getDoc(doc(db, 'users', authUser.uid))).data();

          // Normalize role here (lowercase + trim + validate)
          const normalized = normalizeRole(effective?.role);
          setRole(normalized);

          setUser(authUser);
          setProfile(effective);

          // Keep Auth displayName/photo in sync if Firestore has them
          const wantsDisplay = effective?.displayName || authUser.displayName || '';
          const wantsPhoto = effective?.photoURL || authUser.photoURL || '';
          const shouldSync =
            (effective?.displayName && authUser.displayName !== effective.displayName) ||
            (effective?.photoURL && authUser.photoURL !== effective.photoURL);

          if (shouldSync) {
            try {
              await updateProfile(authUser, {
                displayName: wantsDisplay,
                photoURL: wantsPhoto,
              });
            } catch (e) {
              console.warn('Auth display sync failed (non-fatal):', e);
            }
          }
        } else {
          setUser(null);
          setProfile(null);
          setRole(null);
        }
      } catch (e) {
        console.error('AuthContext error:', e);
        // On error, at least prevent infinite loading UI
        setUser(null);
        setProfile(null);
        setRole(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  // Convenience: consistent display name
  const resolvedDisplayName =
    profile?.displayName ||
    user?.displayName ||
    (user?.email ? user.email.split('@')[0] : '') ||
    '';

  // ✅ Use helpers to compute booleans (rename to avoid shadowing)
  const admin = isAdminFn(role);
  const workerLike = isWorkerLikeFn(role);

  // ✅ Context value: expose both functions and booleans
  const value = {
    user,
    role,                      // normalized, lowercase
    profile,                   // Firestore user doc
    loading,                   // profile loading

    // Functions (helpers)
    isAdmin: isAdminFn,
    isWorkerLike: isWorkerLikeFn,

    // Convenient booleans
    admin,
    workerLike,

    // Back-compat aliases used elsewhere
    userData: profile,
    userDataLoading: loading,
    displayName: resolvedDisplayName,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
