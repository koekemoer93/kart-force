// src/components/StockProgress.js
import React from 'react';

export default function StockProgress({ qty = 0, minQty = 0, maxQty = 0 }) {
  // If max is not set, derive a soft max = min*2 or qty+min
  const softMax = maxQty > 0 ? maxQty : Math.max(minQty * 2, qty + minQty, 10);
  const percent = Math.min(100, Math.round((qty / softMax) * 100));
  const empty = qty <= 0;

  return (
    <div className={`track-progress ${empty ? 'track-progress--empty' : ''}`}>
      <div className="track-progress__fill" style={{ width: `${percent}%` }} />
    </div>
  );
}
