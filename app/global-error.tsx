"use client";

/**
 * Last-resort fallback that replaces the root layout when it throws (for example
 * when the database is unreachable). It must stay self-contained: no site data,
 * no providers, no global stylesheet.
 */
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#F4EFE6",
          color: "#100F0D",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <title>st(AI)rway</title>
        <main style={{ maxWidth: 520, textAlign: "center" }}>
          <p style={{ fontSize: "2rem", fontWeight: 600, margin: "0 0 8px", letterSpacing: "-0.03em" }}>st(AI)rway</p>
          <p style={{ fontSize: "1.15rem", lineHeight: 1.5, margin: "0 0 28px" }}>
            Something went wrong loading st(AI)rway. Please try again in a moment.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              background: "#FFB200",
              color: "#100F0D",
              border: "2px solid #100F0D",
              boxShadow: "4px 4px 0 0 #100F0D",
              padding: "12px 24px",
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
