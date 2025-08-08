// src/components/HoursEditor.jsx
import React from 'react';
import { isValidHM } from '../services/tracks';

const DAY_LABELS = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

export default function HoursEditor({ value, onChange }) {
  // value shape: { mon:{open,close,closed}, ... }
  function setDay(day, patch) {
    onChange({ ...value, [day]: { ...value[day], ...patch } });
  }

  function copy(dayFrom, dayTo) {
    const src = value[dayFrom];
    onChange({ ...value, [dayTo]: { ...src } });
  }

  function copyWeekdaysFrom(dayFrom) {
    const src = value[dayFrom];
    onChange({
      ...value,
      mon: { ...src },
      tue: { ...src },
      wed: { ...src },
      thu: { ...src },
      fri: { ...src },
    });
  }

  function applyToAllDays(dayFrom) {
    const src = value[dayFrom];
    const next = {};
    Object.keys(value).forEach((d) => (next[d] = { ...src }));
    onChange(next);
  }

  return (
    <div className="card" style={{ padding: 12 }}>
      {Object.keys(DAY_LABELS).map((day) => {
        const d = value[day] || { closed: true };
        const closed = !!d.closed;
        const openErr = !closed && d.open && !isValidHM(d.open);
        const closeErr = !closed && d.close && !isValidHM(d.close);

        return (
          <div key={day} className="row between wrap gap12" style={{ marginBottom: 10 }}>
            <strong style={{ width: 60 }}>{DAY_LABELS[day]}</strong>

            <label className="row gap8 center">
              <input
                type="checkbox"
                checked={closed}
                onChange={(e) => setDay(day, { closed: e.target.checked })}
              />
              <span className="small">Closed</span>
            </label>

            {!closed && (
              <>
                <input
                  className="input-field"
                  placeholder="Open HH:MM"
                  value={d.open || ''}
                  onChange={(e) => setDay(day, { open: e.target.value })}
                  style={{ maxWidth: 140, borderColor: openErr ? '#ef4444' : undefined }}
                />
                <input
                  className="input-field"
                  placeholder="Close HH:MM"
                  value={d.close || ''}
                  onChange={(e) => setDay(day, { close: e.target.value })}
                  style={{ maxWidth: 140, borderColor: closeErr ? '#ef4444' : undefined }}
                />
              </>
            )}

            {/* Quick copy helpers */}
            <div className="row gap8">
              <button className="nav-btn" onClick={() => copy(day, 'sat')}>Copy → Sat</button>
              <button className="nav-btn" onClick={() => copy(day, 'sun')}>Copy → Sun</button>
              <button className="nav-btn" onClick={() => copyWeekdaysFrom(day)}>Copy → Mon–Fri</button>
              <button className="nav-btn" onClick={() => applyToAllDays(day)}>Apply to all days</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
