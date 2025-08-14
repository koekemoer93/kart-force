import React, { useEffect } from "react";

export default function SplashScreen({ onFinish }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onFinish?.();
    }, 1500); // total splash duration in ms
    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <div style={styles.container}>
      <h1 style={styles.text}>Kart Force</h1>
    </div>
  );
}

const styles = {
  container: {
    backgroundColor: "#0f0f10",
    color: "#fff",
    position: "fixed",
    inset: 0,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontFamily: "'Segoe UI', Roboto, sans-serif",
    zIndex: 9999,
    animation: "fadeOut 0.4s ease-out 1.1s forwards"
  },
  text: {
    fontSize: "2.5rem",
    fontWeight: "700",
    letterSpacing: "2px",
    animation: "glow 1.5s ease-in-out infinite alternate"
  }
};

// Inject keyframes directly
const styleEl = document.createElement("style");
styleEl.innerHTML = `
@keyframes glow {
  from { text-shadow: 0 0 5px rgba(255,255,255,0.4), 0 0 10px rgba(94,234,212,0.2); }
  to { text-shadow: 0 0 12px rgba(255,255,255,0.8), 0 0 20px rgba(94,234,212,0.4); }
}
@keyframes fadeOut {
  to { opacity: 0; visibility: hidden; }
}
`;
document.head.appendChild(styleEl);
