// src/pages/Register.js
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { auth, db } from '../firebase';
import {
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
 import TopNav from '../components/TopNav';
 import { useTracks } from "../hooks/useTracks";
 import { ROLE_OPTIONS, ROLE_LABELS } from '../constants/roles';

// Fallback only if Firestore has no tracks (rare)
const TRACK_OPTIONS_FALLBACK = ['SyringaPark', 'Epic Karting Pavilion', 'Midlands'];


function toDisplayName(name, surname) {
  const n = (name || '').trim();
  const s = (surname || '').trim();
  return [n, s].filter(Boolean).join(' ');
}

export default function Register() {
  const navigate = useNavigate();

  // ✅ Our hook returns an ARRAY (not {tracks, loading})
  const tracksList = useTracks();

  // Build options from Firestore: value = doc id, label = displayName
  const liveTrackOptions = useMemo(() => {
    if (Array.isArray(tracksList) && tracksList.length) {
      return tracksList.map(t => ({ value: t.id, label: t.displayName || t.id }));
    }
    // fallback labels/values
    return TRACK_OPTIONS_FALLBACK.map(n => ({ value: n, label: n }));
  }, [tracksList]);

  const [form, setForm] = useState({
    name: '',
    surname: '',
    email: '',
    password: '',
    assignedTrack: '',   // set after options load
    role: 'worker',
    displayName: ''
  });

  // Set a sensible default once options are available
  useEffect(() => {
    if (!form.assignedTrack && liveTrackOptions.length) {
      setForm(s => ({ ...s, assignedTrack: liveTrackOptions[0].value }));
    }
  }, [liveTrackOptions, form.assignedTrack]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const displayName = useMemo(
    () => (form.displayName || toDisplayName(form.name, form.surname)),
    [form.name, form.surname, form.displayName]
  );

  const onChange = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const { name, surname, email, password, assignedTrack, role } = form;

    if (!email || !password || !name || !surname) {
      setError('Please fill in name, surname, email, and password.');
      return;
    }
    if (!assignedTrack) {
      setError('Please select a track.');
      return;
    }

    setSubmitting(true);
    try {
      // 1) Create Auth user
      const cred = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      const { user } = cred;

      // 2) Set Auth displayName (optional)
      await updateProfile(user, { displayName });

      // 3) (Optional) verification email
      try { await sendEmailVerification(user); } catch {}

      // 4) Create /users/{uid} doc — assignedTrack is the Firestore doc ID ✅
      const payload = {
        uid: user.uid,
        name: name.trim(),
        surname: surname.trim(),
        assignedTrack, // Firestore doc ID
        role,
        email: email.trim().toLowerCase(),
        displayName,
        isClockedIn: false,
        shiftMinutes: 0,
        createdAt: serverTimestamp(),
        provisionedAuth: true
      };

      await setDoc(doc(db, 'users', user.uid), payload, { merge: true });

      // 5) Redirect
      navigate('/', { replace: true });
    } catch (err) {
      console.error('Register error:', err);
      setError(err?.message || 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #0f0f10)', color: 'var(--text, #f5f5f7)' }}>
      <TopNav role={null} />
      <div style={{ maxWidth: 520, margin: '40px auto', padding: 16 }}>
        <h1 style={{ fontFamily: 'Merriweather, serif', fontWeight: 700, marginBottom: 6 }}>
          Create your account
        </h1>
        <p style={{ color: 'var(--muted, #a1a1aa)', marginBottom: 16 }}>
          This will register you in Firebase Auth and create your profile in <code>{'/users/{uid}'}</code>.
        </p>

        <form
          onSubmit={handleSubmit}
          style={{
            background: 'var(--panel-2, #1d1f22)',
            border: '1px solid var(--border, #2a2d31)',
            borderRadius: 16,
            padding: 16,
            display: 'grid',
            gap: 12
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <input className="input-dark" placeholder="Name" value={form.name}
                   onChange={(e) => onChange('name', e.target.value)} />
            <input className="input-dark" placeholder="Surname" value={form.surname}
                   onChange={(e) => onChange('surname', e.target.value)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            <input className="input-dark" type="email" placeholder="email@example.com" value={form.email}
                   onChange={(e) => onChange('email', e.target.value)} autoComplete="email" />
            <input className="input-dark" type="password" placeholder="Password" value={form.password}
                   onChange={(e) => onChange('password', e.target.value)} autoComplete="new-password" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <select
              className="input-dark"
              value={form.assignedTrack}
              onChange={(e) => onChange('assignedTrack', e.target.value)}
              title={!liveTrackOptions.length ? 'No tracks found' : undefined}
            >
              {liveTrackOptions.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <select className="input-dark" value={form.role} onChange={(e) => onChange('role', e.target.value)}>
              + {ROLE_OPTIONS.map(r => (
   <option key={r} value={r}>     {ROLE_LABELS[r] ?? r}
   </option>
 ))}
            </select>
          </div>

          <input className="input-dark" placeholder="Display name (optional)" value={form.displayName}
                 onChange={(e) => onChange('displayName', e.target.value)} />

          {error ? <div style={{ color: '#ff6b6b', fontSize: 14 }}>{error}</div> : null}

          <button type="submit" disabled={submitting}
                  style={{ background: '#24ff98', color: '#000', borderRadius: 12, padding: '12px 14px', fontWeight: 800 }}>
            {submitting ? 'Creating account…' : 'Register'}
          </button>

          <div style={{ fontSize: 14, color: 'var(--muted, #a1a1aa)' }}>
            Already have an account? <Link to="/" style={{ color: 'var(--text, #f5f5f7)', textDecoration: 'underline' }}>Sign in</Link>
          </div>
        </form>
      </div>

      <style>{`
        .input-dark {
          background: var(--panel, #17181a);
          color: var(--text, #f5f5f7);
          border: 1px solid var(--border, #2a2d31);
          border-radius: 10px;
          padding: 10px 12px;
          outline: none;
          width: 100%;
        }
        .input-dark:focus { border-color: var(--accent, #5eead4); }
      `}</style>
    </div>
  );
}
