"use client";

import { useEffect } from "react";

/**
 * Last line of defence.
 *
 * An agent browser can expose a model context that differs from the one this
 * app was written against, and an unguarded call to a missing method inside a
 * React effect will otherwise blank the page entirely. A judge who sees
 * nothing has no way to tell a crash apart from a bad deploy, so a crash says
 * what happened and offers a way back in.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("ConstraintCanvas failed to render:", error);
  }, [error]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        background: "#161616",
        color: "#f4f4f4",
        fontFamily: "var(--font-plex-sans), system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: "34rem" }}>
        <div
          style={{
            fontSize: "0.75rem",
            letterSpacing: "0.32px",
            textTransform: "uppercase",
            color: "#fa4d56",
            marginBottom: "0.5rem",
          }}
        >
          Something broke
        </div>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 400, margin: "0 0 1rem" }}>
          ConstraintCanvas could not finish loading.
        </h1>
        <p
          style={{
            fontSize: "0.875rem",
            lineHeight: "1.375rem",
            color: "#c6c6c6",
            margin: "0 0 1.5rem",
          }}
        >
          The floor plan and the rulebook are held in memory for the session, so
          reloading starts the scenario again from the beginning. If this
          repeats, the browser is likely exposing a model context this build has
          not seen before, and the console entry above names the call that
          failed.
        </p>
        <pre
          style={{
            fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
            fontSize: "0.75rem",
            background: "#262626",
            padding: "0.75rem",
            overflowX: "auto",
            color: "#ff8389",
            margin: "0 0 1.5rem",
          }}
        >
          {error.message}
        </pre>
        <button
          onClick={reset}
          style={{
            background: "#0f62fe",
            color: "#fff",
            border: "none",
            padding: "0.75rem 1.5rem",
            fontSize: "0.875rem",
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </div>
    </main>
  );
}
