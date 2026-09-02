"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [status, setStatus] = useState("checking");
  const [toolNames, setToolNames] = useState<string[]>([]);

  useEffect(() => {
    const mc = document.modelContext;
    if (!mc) {
      setStatus("unavailable");
      return;
    }
    const controller = new AbortController();
    mc.registerTool(
      {
        name: "ping",
        description: "Confirm the ConstraintCanvas tool bridge is live.",
        inputSchema: { type: "object", properties: {} },
        annotations: { readOnlyHint: true },
        execute: async () => "ConstraintCanvas tool bridge is live.",
      },
      { signal: controller.signal }
    )
      .then(async () => {
        setStatus("registered");
        const tools = await mc.getTools();
        setToolNames(tools.map((t) => t.name));
      })
      .catch((err) => setStatus(`error: ${String(err)}`));

    return () => controller.abort();
  }, []);

  return (
    <main style={{ padding: 32 }}>
      <h1 className="t-heading-03">ConstraintCanvas</h1>
      <p className="t-body-01" style={{ color: "var(--cds-text-secondary)" }}>
        WebMCP bridge status: <strong>{status}</strong>
      </p>
      <p className="t-mono t-body-01">{toolNames.join(", ") || "no tools"}</p>
    </main>
  );
}
