"use client";

import { Anton } from "next/font/google";
import { FRAME_ORG } from "@/lib/design/brand";
import { TOKENS } from "@/lib/design/tokens";

// global-error replaces the root layout, so it loads its own display face (same file as the layout's Anton).
const anton = Anton({ subsets: ["latin"], weight: "400", display: "swap", fallback: ["Impact", "Haettenschweiler", "Arial Narrow Bold", "sans-serif"] });

const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const MONO = "ui-monospace, 'Cascadia Mono', Consolas, 'Courier New', monospace";

/**
 * Last-resort fallback that replaces the root layout when it throws (for example
 * when the database is unreachable). It must stay self-contained: no site data,
 * no providers, no global stylesheet (only the token and brand constants).
 */
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en-IN">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          boxSizing: "border-box",
          display: "grid",
          placeItems: "center",
          padding: "24px 16px",
          background: TOKENS.field,
          color: TOKENS.paper,
          fontFamily: SANS,
          colorScheme: "light",
        }}
      >
        <title>st(AI)rway</title>
        {/* Next's error shell has an empty <head>; without this phones lay the page out at 980px */}
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{`*,*::before,*::after{box-sizing:border-box}button:focus-visible{outline:3px solid ${TOKENS.yellow};outline-offset:3px}`}</style>
        <main
          style={{
            width: "100%",
            maxWidth: 560,
            textAlign: "center",
            border: `6px solid ${TOKENS.paper}`,
            outline: `2px solid ${TOKENS.paper}`,
            outlineOffset: -14,
            padding: "28px clamp(20px, 6vw, 40px) 40px",
          }}
        >
          <p style={{ fontFamily: MONO, fontWeight: 700, fontSize: "0.72rem", letterSpacing: "0.14em", textTransform: "uppercase", margin: "0 0 28px" }}>
            <span aria-hidden="true" style={{ display: "inline-block", width: 10, height: 10, background: TOKENS.paper, transform: "rotate(45deg)", marginRight: 10 }} />
            {FRAME_ORG}
          </p>
          <p style={{ fontSize: "1.6rem", fontWeight: 600, margin: "0 0 18px", letterSpacing: "-0.03em" }}>
            st<span style={{ background: TOKENS.yellow, color: TOKENS.ink, padding: "0 0.08em" }}>(AI)</span>rway
          </p>
          <h1
            className={anton.className}
            style={{
              fontWeight: 400,
              textTransform: "uppercase",
              fontSize: "clamp(2.4rem, 9vw, 3.6rem)",
              lineHeight: 0.95,
              letterSpacing: "0.01em",
              margin: "0 0 18px",
              paddingTop: "0.12em",
              textShadow: Array.from({ length: 6 }, (_, i) => `${0.02 * (i + 1)}em ${-0.02 * (i + 1)}em 0 ${TOKENS.ink}`).join(", "),
            }}
          >
            Something <span style={{ color: TOKENS.yellow }}>slipped.</span>
          </h1>
          <p style={{ fontSize: "1.1rem", lineHeight: 1.55, margin: "0 0 28px" }}>
            Something went wrong loading st(AI)rway. Please try again in a moment.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              background: TOKENS.yellow,
              color: TOKENS.ink,
              border: `2px solid ${TOKENS.ink}`,
              boxShadow: `4px 4px 0 0 ${TOKENS.ink}`,
              padding: "12px 24px",
              minHeight: 48,
              fontFamily: SANS,
              fontSize: "1rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
