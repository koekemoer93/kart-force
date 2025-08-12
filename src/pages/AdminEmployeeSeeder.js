import React, { useMemo, useState } from 'react';
import TopNav from '../components/TopNav';
import { db } from '../firebase';
import {
  collection,
  doc,
  setDoc,
  serverTimestamp
} from 'firebase/firestore';

// Keep these aligned with your project
const TRACK_OPTIONS = ["SyringaPark", "Epic Karting Pavilion", "Midlands"];
const ROLE_OPTIONS = ["worker", "workshopManager", "mechanic", "reception", "marshall", "hrfinance"];

function toDisplayName(name, surname) {
  const n = (name || '').trim();
  const s = (surname || '').trim();
  return [n, s].filter(Boolean).join(' ');
}

// Using email as doc id? DON'T unless you are 100% sure you won't later rely on auth UID.
// We'll default to autoId = false -> create doc with deterministic ID based on email but namespaced with "email:"
function emailKey(email) {
  return `email:${(email || '').trim().toLowerCase()}`;
}

function RowEditor({ value, onChange, index }) {
  const [row, setRow] = useState(value);

  function update(k, v) {
    const next = { ...row, [k]: v };
    setRow(next);
    onChange(next);
  }

  return (
    <div style={{
      border: '1px solid var(--border, #2a2d31)',
      borderRadius: 12,
      padding: 12,
      background: 'var(--panel, #17181a)',
      display: 'grid',
      gap: 8
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <input
          value={row.name || ''}
          onChange={e => update('name', e.target.value)}
          placeholder="Name"
          className="input-dark"
        />
        <input
          value={row.surname || ''}
          onChange={e => update('surname', e.target.value)}
          placeholder="Surname"
          className="input-dark"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <select
          value={row.assignedTrack || TRACK_OPTIONS[0]}
          onChange={e => update('assignedTrack', e.target.value)}
          className="input-dark"
        >
          {TRACK_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <select
          value={row.role || ROLE_OPTIONS[0]}
          onChange={e => update('role', e.target.value)}
          className="input-dark"
        >
          {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <input
          value={row.email || ''}
          onChange={e => update('email', e.target.value)}
          placeholder="email@example.com"
          className="input-dark"
        />
        <input
          value={row.displayName || toDisplayName(row.name, row.surname)}
          onChange={e => update('displayName', e.target.value)}
          placeholder="Display Name"
          className="input-dark"
        />
      </div>

      <div style={{ fontSize: 12, color: 'var(--muted, #a1a1aa)' }}>
        #{index + 1}
      </div>
    </div>
  );
}

export default function AdminEmployeeSeeder() {
  const [single, setSingle] = useState({
    name: '',
    surname: '',
    assignedTrack: TRACK_OPTIONS[0],
    role: ROLE_OPTIONS[0],
    email: '',
    displayName: ''
  });

  const [bulkText, setBulkText] = useState('');
  const [bulkRows, setBulkRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [useDeterministicIds, setUseDeterministicIds] = useState(true); // email-based keys by default

  const parsedBulk = useMemo(() => {
    // Accept CSV with headers OR rows in the given order:
    // name,surname,assignedTrack,role,email,displayName
    if (!bulkText.trim()) return [];
    const lines = bulkText
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);

    if (!lines.length) return [];

    let headers = [];
    let rows = [];

    const first = lines[0];
    if (/name\s*,\s*surname\s*,\s*assignedtrack\s*,\s*role\s*,\s*email\s*,\s*displayname/i.test(first)) {
      headers = first.split(',').map(h => h.trim().toLowerCase());
      rows = lines.slice(1);
    } else {
      headers = ['name','surname','assignedtrack','role','email','displayname'];
      rows = lines;
    }

    function col(obj, key) {
      return obj[key] || obj[key.toLowerCase()] || '';
    }

    const out = rows.map((line) => {
      const parts = line.split(',').map(p => p.trim());
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = parts[i] || '';
      });

      return {
        name: col(obj, 'name'),
        surname: col(obj, 'surname'),
        assignedTrack: col(obj, 'assignedtrack') || TRACK_OPTIONS[0],
        role: col(obj, 'role') || ROLE_OPTIONS[0],
        email: col(obj, 'email'),
        displayName: col(obj, 'displayname')
      };
    }).filter(r => r.email); // require email for bulk

    return out;
  }, [bulkText]);

  function updateRow(idx, next) {
    const clone = [...bulkRows];
    clone[idx] = next;
    setBulkRows(clone);
  }

  function loadParsedIntoEditors() {
    setBulkRows(parsedBulk);
  }

  async function saveOne() {
    const payload = {
      name: (single.name || '').trim(),
      surname: (single.surname || '').trim(),
      assignedTrack: single.assignedTrack,
      role: single.role,
      email: (single.email || '').trim().toLowerCase(),
      displayName: (single.displayName || toDisplayName(single.name, single.surname)).trim(),
      isClockedIn: false,
      shiftMinutes: 0,
      createdAt: serverTimestamp(),
      provisionedAuth: false, // later true once an Auth UID exists
    };

    if (!payload.email) {
      alert('Email is required');
      return;
    }

    setSaving(true);
    try {
      if (useDeterministicIds) {
        await setDoc(doc(db, 'users', emailKey(payload.email)), payload, { merge: true });
      } else {
        await setDoc(doc(collection(db, 'users')), payload);
      }
      alert('Employee saved.');
      setSingle({
        name: '',
        surname: '',
        assignedTrack: TRACK_OPTIONS[0],
        role: ROLE_OPTIONS[0],
        email: '',
        displayName: ''
      });
    } catch (e) {
      console.error('saveOne error:', e);
      alert('Failed to save employee (see console).');
    } finally {
      setSaving(false);
    }
  }

  async function saveBulk() {
    if (!bulkRows.length) {
      alert('No rows to save. Paste CSV and click "Load rows".');
      return;
    }
    setSaving(true);
    try {
      for (const r of bulkRows) {
        const payload = {
          name: (r.name || '').trim(),
          surname: (r.surname || '').trim(),
          assignedTrack: r.assignedTrack || TRACK_OPTIONS[0],
          role: r.role || ROLE_OPTIONS[0],
          email: (r.email || '').trim().toLowerCase(),
          displayName: (r.displayName || toDisplayName(r.name, r.surname)).trim(),
          isClockedIn: false,
          shiftMinutes: 0,
          createdAt: serverTimestamp(),
          provisionedAuth: false,
        };
        if (!payload.email) continue;
        if (useDeterministicIds) {
          await setDoc(doc(db, 'users', emailKey(payload.email)), payload, { merge: true });
        } else {
          await setDoc(doc(collection(db, 'users')), payload);
        }
      }
      alert('Bulk employees saved.');
      setBulkRows([]);
      setBulkText('');
    } catch (e) {
      console.error('saveBulk error:', e);
      alert('Bulk save failed (see console).');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #0f0f10)', color: 'var(--text, #f5f5f7)' }}>
      <TopNav role="admin" />
      <div style={{ maxWidth: 960, margin: '0 auto', padding: 16 }}>
        <h1 style={{ fontFamily: 'Merriweather, serif', fontWeight: 700, marginBottom: 8 }}>Admin • Employee Seeder</h1>
        <p style={{ color: 'var(--muted, #a1a1aa)', marginBottom: 16 }}>
          Add employees to <code>/users</code>. This does <b>not</b> create Firebase Auth accounts; we’ll provision those later.
        </p>

        <div style={{
          background: 'var(--panel-2, #1d1f22)',
          border: '1px solid var(--border, #2a2d31)',
          borderRadius: 16,
          padding: 16,
          marginBottom: 24
        }}>
          <h3 style={{ marginBottom: 12 }}>Single employee</h3>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <input className="input-dark" placeholder="Name" value={single.name} onChange={e => setSingle(s => ({ ...s, name: e.target.value }))} />
              <input className="input-dark" placeholder="Surname" value={single.surname} onChange={e => setSingle(s => ({ ...s, surname: e.target.value }))} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <select className="input-dark" value={single.assignedTrack} onChange={e => setSingle(s => ({ ...s, assignedTrack: e.target.value }))}>
                {TRACK_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select className="input-dark" value={single.role} onChange={e => setSingle(s => ({ ...s, role: e.target.value }))}>
                {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <input className="input-dark" placeholder="email@example.com" value={single.email} onChange={e => setSingle(s => ({ ...s, email: e.target.value }))} />
              <input className="input-dark" placeholder="Display name (optional)" value={single.displayName} onChange={e => setSingle(s => ({ ...s, displayName: e.target.value }))} />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={useDeterministicIds}
                onChange={e => setUseDeterministicIds(e.target.checked)}
              />
              Use deterministic doc IDs (email-based). Uncheck to use auto IDs.
            </label>

            <button
              disabled={saving}
              onClick={saveOne}
              style={{
                background: '#24ff98',
                color: '#000',
                borderRadius: 12,
                padding: '10px 14px',
                fontWeight: 700
              }}
            >
              {saving ? 'Saving…' : 'Save employee'}
            </button>
          </div>
        </div>

        <div style={{
          background: 'var(--panel-2, #1d1f22)',
          border: '1px solid var(--border, #2a2d31)',
          borderRadius: 16,
          padding: 16
        }}>
          <h3 style={{ marginBottom: 8 }}>Bulk add (CSV)</h3>
          <p style={{ color: 'var(--muted, #a1a1aa)', marginBottom: 8 }}>
            Columns: <code>name,surname,assignedTrack,role,email,displayName</code> (header optional).
          </p>

          <textarea
            className="input-dark"
            style={{ width: '100%', minHeight: 120, marginBottom: 12 }}
            placeholder={`name,surname,assignedTrack,role,email,displayName
Desmond,Sweep,SyringaPark,marshall,desmond@company.com,Desmond Sweep
Tumi,Moagi,Midlands,marshall,tumi@company.com,Tumi Moagi`}
            value={bulkText}
            onChange={e => setBulkText(e.target.value)}
          />

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <button
              onClick={loadParsedIntoEditors}
              style={{ background: 'var(--panel, #17181a)', border: '1px solid var(--border, #2a2d31)', borderRadius: 10, padding: '8px 12px', color: 'var(--text, #f5f5f7)' }}
            >
              Load rows
            </button>
            <button
              disabled={!bulkRows.length || saving}
              onClick={saveBulk}
              style={{ background: '#24ff98', color: '#000', borderRadius: 10, padding: '8px 12px', fontWeight: 700 }}
            >
              {saving ? 'Saving…' : `Save ${bulkRows.length} rows`}
            </button>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {bulkRows.map((r, i) => (
              <RowEditor key={i} value={r} onChange={val => updateRow(i, val)} index={i} />
            ))}
          </div>
        </div>
      </div>

      {/* Minimal dark inputs if not already styled */}
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
        .input-dark:focus {
          border-color: var(--accent, #5eead4);
        }
      `}</style>
    </div>
  );
}
