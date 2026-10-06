"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui", background: "#0c0d0f", color: "#e7e8ea", display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 18 }}>Forgebase hit an unexpected error</h1>
          <button onClick={reset} style={{ marginTop: 16, padding: "6px 12px" }}>
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
