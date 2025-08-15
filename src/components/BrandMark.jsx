// src/components/BrandMark.jsx
export default function BrandMark({ size = 28, text = "KF" }) {
  const r = Math.round(size * 0.28);
  return (
    <div
      aria-label="Kart Force"
      style={{
        width: size,
        height: size,
        borderRadius: r,
        display: "grid",
        placeItems: "center",
        fontWeight: 900,
        letterSpacing: 0.3,
        fontSize: Math.max(12, Math.floor(size * 0.42)),
        background:
          "radial-gradient(50% 50% at 50% 50%, rgba(14,245,163,0.95) 0%, rgba(7,120,90,0.95) 100%)",
        color: "#0b0b0c",
        boxShadow:
          "0 8px 24px rgba(0,0,0,0.36), inset 0 1px 6px rgba(255,255,255,0.10), 0 0 18px rgba(14,245,163,0.28)",
        border: "1px solid rgba(255,255,255,0.14)",
        userSelect: "none",
      }}
    >
      {text}
    </div>
  );
}
