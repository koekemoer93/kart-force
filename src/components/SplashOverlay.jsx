// src/components/SplashOverlay.jsx
import React, { useEffect, useState } from "react";

/** Mobile-only check */
function isMobile() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(max-width: 768px)").matches ||
    /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
  );
}

/** Throttle: only show every 12h unless forceShow is true */
function hasSeenRecently(key = "splashSeenAt", hours = 12) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const last = Number(raw);
    return Date.now() - last < hours * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export default function SplashOverlay({
  /** If a user is already authenticated, skip showing the splash */
  skipIfAuthenticated = false,
  /** total time the splash is visible before fade starts */
  durationMs = 1500,
  /** set to true to ignore the “seen recently” throttle */
  forceShow = false,
}) {
  const [show, setShow] = useState(false);
  const [fade, setFade] = useState(false);

  useEffect(() => {
    // Respect reduced motion users – skip splash
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (skipIfAuthenticated || !isMobile() || reduceMotion) return;
    if (!forceShow && hasSeenRecently()) return;

    setShow(true);

    const t1 = setTimeout(() => setFade(true), Math.max(300, durationMs - 280));
    const t2 = setTimeout(() => {
      setShow(false);
      try {
        localStorage.setItem("splashSeenAt", String(Date.now()));
      } catch {}
    }, durationMs);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [skipIfAuthenticated, durationMs, forceShow]);

  if (!show) return null;

  return (
    <div className={`kf-splash ${fade ? "kf-splash--fade" : ""}`} aria-hidden="true">
      <div className="kf-splash__brand">
        {/* Optional: replace text with your logo img if you like */}
        <img src="/splash.png" alt="Kart Force" className="kf-splash__img" />
        <div className="kf-splash__title">Kart Force</div>
      </div>
    </div>
  );
}
