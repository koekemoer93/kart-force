// src/AuthContext.js
// ⬇️ Paste this entire file

import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, updateProfile } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);          // Firebase Auth user
  const [role, setRole] = useState(null);          // 'admin' | 'worker' | null
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
        role: 'worker',              // default (set to 'admin' manually for owner accounts)
        assignedTrack: '',           // normalized field so UI never sees undefined
        isClockedIn: false,          // normalized field used by clock
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

          setUser(authUser);
          setProfile(effective);
          setRole(effective?.role ?? null);

          // Keep Auth displayName/photo in sync if Firestore has them
          if (
            (effective?.displayName && authUser.displayName !== effective.displayName) ||
            (effective?.photoURL && authUser.photoURL !== effective.photoURL)
          ) {
            await updateProfile(authUser, {
              displayName: effective.displayName || authUser.displayName || '',
              photoURL: effective.photoURL || authUser.photoURL || '',
            });
          }
        } else {
          setUser(null);
          setProfile(null);
          setRole(null);
        }
      } catch (e) {
        console.error('AuthContext error:', e);
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

  // ✅ Back-compat aliases for the rest of the app
  const value = {
    user,
    role,
    profile,                 // Firestore user doc
    loading,                 // profile loading
    userData: profile,       // alias used elsewhere
    userDataLoading: loading, // alias used elsewhere
    displayName: resolvedDisplayName,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
