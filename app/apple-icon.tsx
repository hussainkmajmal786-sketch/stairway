import { ImageResponse } from "next/og";

// generated once at build time (static export)
export const dynamic = "force-static";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** PNG app icon: the (AI) block on paper. Also used by the PWA manifest. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#F4EFE6" }}>
        <div
          style={{
            display: "flex",
            padding: "10px 16px",
            background: "#FFB200",
            border: "6px solid #100F0D",
            boxShadow: "8px 8px 0 0 #100F0D",
            fontSize: 64,
            fontWeight: 800,
            color: "#100F0D",
            letterSpacing: -3,
          }}
        >
          (AI)
        </div>
      </div>
    ),
    size,
  );
}
