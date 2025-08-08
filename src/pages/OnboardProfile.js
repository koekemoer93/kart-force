// src/pages/OnboardProfile.js
// ⬇️ Paste this entire file

import React, { useState } from 'react';
import { auth, db, storage } from '../firebase';
import { useAuth } from '../AuthContext';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateProfile } from 'firebase/auth';
import './OnboardProfile.css';

export default function OnboardProfile() {
  const { user, profile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.displayName || user?.displayName || '');
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  if (!user) {
    return (
      <div className="glass-card page-wrap">
        <h2>Please log in</h2>
        <p>You need to be logged in to edit your profile.</p>
      </div>
    );
  }

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      let photoURL = profile?.photoURL || user.photoURL || '';

      if (file) {
        const ext = file.name.split('.').pop().toLowerCase();
        const path = `user-avatars/${user.uid}.${ext || 'jpg'}`;
        const r = ref(storage, path);
        await uploadBytes(r, file);
        photoURL = await getDownloadURL(r);
      }

      // Update Auth profile (so the avatar appears everywhere without re-login)
      await updateProfile(auth.currentUser, {
        displayName: displayName || '',
        photoURL: photoURL || ''
      });

      // Update Firestore user doc
      await updateDoc(doc(db, 'users', user.uid), {
        displayName: displayName || '',
        photoURL: photoURL || '',
        updatedAt: serverTimestamp(),
      });

      setDone(true);
    } catch (err) {
      console.error(err);
      setError('Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-wrap">
      <div className="glass-card profile-card">
        <h2>My Profile</h2>
        <form onSubmit={handleSave} className="profile-form">
          <label className="label">
            Display Name
            <input
              type="text"
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Billy Gravenstein"
            />
          </label>

          <label className="label">
            Profile Photo
            <input
              type="file"
              accept="image/*"
              className="input-file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>

          {error && <p className="error">{error}</p>}
          {done && <p className="ok">Saved!</p>}

          <button className="button-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
      </div>
    </div>
  );
}
