// src/SeedHours.js
import React, { useState, useEffect } from 'react';
import { db, auth } from './firebase';
import { doc, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

export default function SeedHours() {
  const [status, setStatus] = useState('');
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const seedSyringa = async () => {
    if (!user) {
      setStatus('❌ You must be logged in as an admin to seed data.');
      return;
    }

    try {
      const openingHours = {
        mon: { closed: true },
        tue: { open: '11:00', close: '17:00', closed: false },
        wed: { open: '11:00', close: '17:00', closed: false },
        thu: { open: '11:00', close: '17:00', closed: false },
        fri: { open: '11:00', close: '18:00', closed: false },
        sat: { open: '09:00', close: '20:00', closed: false },
        sun: { open: '09:00', close: '18:00', closed: false },
      };

      await setDoc(
        doc(db, 'tracks', 'SyringaPark'),
        { name: 'SyringaPark', openingHours },
        { merge: true }
      );

      setStatus('✅ Syringa hours saved to Firestore.');
    } catch (e) {
      console.error(e);
      setStatus('❌ Failed to save: ' + e.message);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <h2>Seed Trading Hours</h2>
      {user ? (
        <p>Logged in as: {user.email}</p>
      ) : (
        <p style={{ color: 'red' }}>You are not logged in.</p>
      )}
      <button className="button-primary" onClick={seedSyringa} disabled={!user}>
        Seed SyringaPark Hours
      </button>
      {status && <p style={{ marginTop: 12 }}>{status}</p>}
    </div>
  );
}
