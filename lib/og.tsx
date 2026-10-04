// Shared JSX for generated Open Graph images (rendered by next/og).

export const ogSize = { width: 1200, height: 630 };

export function OgFrame({ eyebrow, title, subtitle, accent = "#FFB200" }: { eyebrow: string; title: string; subtitle: string; accent?: string }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 64,
        background: "#F4EFE6",
        backgroundImage: "linear-gradient(rgba(16,15,13,.07) 2px, transparent 2px), linear-gradient(90deg, rgba(16,15,13,.07) 2px, transparent 2px)",
        backgroundSize: "48px 48px",
        color: "#100F0D",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", fontSize: 46, fontWeight: 700, letterSpacing: -2 }}>
          <span>st</span>
          <span style={{ background: "#FFB200", padding: "0 6px" }}>(AI)</span>
          <span>rway</span>
        </div>
        <div style={{ display: "flex", padding: "8px 18px", border: "3px solid #100F0D", boxShadow: "5px 5px 0 0 #100F0D", fontSize: 22, fontWeight: 700, background: "#ECE4D7" }}>
          IEEE SB CEK
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex" }}>
          <div style={{ display: "flex", background: accent, padding: "6px 14px", fontSize: 24, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>{eyebrow}</div>
        </div>
        <div style={{ display: "flex", fontSize: 96, fontWeight: 700, letterSpacing: -4, lineHeight: 1, marginTop: 22 }}>{title}</div>
        <div style={{ display: "flex", fontSize: 36, color: "#4F4A40", marginTop: 18 }}>{subtitle}</div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end" }}>
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} style={{ width: 56, height: 12 + i * 8, marginRight: 8, border: "3px solid #100F0D", background: i === 11 ? "#FF5C38" : i % 3 === 0 ? "#FFB200" : "#ECE4D7" }} />
        ))}
      </div>
    </div>
  );
}
