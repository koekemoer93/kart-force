// src/components/SwipeableTaskTile.js
import React, { useEffect, useRef, useState } from "react";

/**
 * Lightweight swipe wrapper for mobile/desktop.
 * - Drag right to complete (reveals green check background)
 * - Release past threshold to fire onComplete()
 * - Drag left or release before threshold -> snaps back
 * - Keeps children (TaskTile) intact. Checkbox still works.
 */
export default function SwipeableTaskTile({
  disabled = false,
  threshold = 0.33,         // % of width
  onComplete,               // () => void
  children,
}) {
  const wrapperRef = useRef(null);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const widthRef = useRef(1);

  useEffect(() => {
    widthRef.current = wrapperRef.current?.offsetWidth || 1;
  });

  function onPointerDown(e) {
    if (disabled) return;
    setDragging(true);
    startX.current = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
  }
  function onPointerMove(e) {
    if (!dragging) return;
    const x = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const d = Math.max(0, x - startX.current);
    setDx(d);
  }
  function finishGesture(commit) {
    setDragging(false);
    if (commit) {
      setDx(0);
      onComplete?.();
    } else {
      // snap back
      setDx(0);
    }
  }
  function onPointerUp() {
    if (!dragging) return;
    const commit = dx > widthRef.current * threshold;
    finishGesture(commit);
  }

  return (
    <div
      ref={wrapperRef}
      className="swipe-wrap"
      onMouseDown={onPointerDown}
      onMouseMove={onPointerMove}
      onMouseUp={onPointerUp}
      onMouseLeave={() => dragging && onPointerUp()}
      onTouchStart={onPointerDown}
      onTouchMove={onPointerMove}
      onTouchEnd={onPointerUp}
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 12,
      }}
    >
      {/* Green success background */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(90deg, rgba(36,255,152,0.25), rgba(36,255,152,0.15))",
          display: "grid",
          placeItems: "center",
          opacity: Math.min(1, dx / (widthRef.current * threshold)),
          transition: dragging ? "none" : "opacity 140ms ease",
        }}
      >
        <div
          style={{
            fontWeight: 800,
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid rgba(36,255,152,0.5)",
            background: "rgba(36,255,152,0.15)",
            color: "#24ff98",
            fontSize: 12,
          }}
        >
          Slide to complete ✓
        </div>
      </div>

      {/* Foreground content (moves with drag) */}
      <div
        style={{
          position: "relative",
          transform: `translateX(${dx}px)`,
          transition: dragging ? "none" : "transform 160ms ease",
          willChange: "transform",
        }}
      >
        {children}
      </div>
    </div>
  );
}
