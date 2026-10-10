import { ImageResponse } from "next/og";
import { TOKENS } from "@/lib/design/tokens";
import { OG_DISPLAY } from "@/lib/og";
import { loadGoogleFont } from "@/lib/og-font";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** PNG app icon: the (AI) block on the cobalt field (Anton when Google Fonts answers). Also used by the PWA manifest. */
export default async function AppleIcon() {
  const anton = await loadGoogleFont(OG_DISPLAY, "(AI)");
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: TOKENS.field }}>
        <div
          style={{
            display: "flex",
            padding: anton ? "4px 14px 0" : "10px 16px",
            background: TOKENS.yellow,
            border: `6px solid ${TOKENS.ink}`,
            boxShadow: `8px -8px 0 0 ${TOKENS.ink}`,
            fontFamily: anton ? OG_DISPLAY : undefined,
            fontSize: anton ? 84 : 64,
            fontWeight: anton ? 400 : 800,
            lineHeight: anton ? 1.08 : 1.2,
            color: TOKENS.ink,
            letterSpacing: anton ? 0 : -3,
          }}
        >
          (AI)
        </div>
      </div>
    ),
    { ...size, fonts: anton ? [{ name: OG_DISPLAY, data: anton, weight: 400, style: "normal" }] : undefined },
  );
}
