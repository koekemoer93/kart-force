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
  const [loading, setLoading] = useState(true);

  // Ensure Firestore user doc exists with required fields
  const ensureUserDoc = async (authUser) => {
    if (!authUser) return;

    const userRef = doc(db, 'users', authUser.uid);
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
      // Create minimal doc — you can edit Billy’s role here or in Firestore
      const newDoc = {
        uid: authUser.uid,
        email: authUser.email || '',
        displayName: authUser.displayName || '',
        photoURL: authUser.photoURL || '',
        role: 'worker', // default; set 'admin' manually for owner accounts (e.g., Billy)
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(userRef, newDoc);
      return newDoc;
    } else {
      // Patch any missing keys to keep shape consistent
      const data = snap.data();
      const updates = {};
      if (data.role == null) updates.role = 'worker';
      if (data.displayName == null) updates.displayName = authUser.displayName || '';
      if (data.photoURL == null) updates.photoURL = authUser.photoURL || '';
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
          const effective = ensured || (await getDoc(doc(db, 'users', authUser.uid))).data();
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
              photoURL: effective.photoURL || authUser.photoURL || ''
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

  const value = { user, role, profile, loading };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
