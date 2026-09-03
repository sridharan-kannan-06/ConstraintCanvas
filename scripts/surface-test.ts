// Model context compatibility test. Run with: npm run surface
//
// The specification describes ModelContext as an EventTarget carrying
// getTools and executeTool. A shipping implementation is not obliged to
// expose all of it, and at least one exposes registerTool and little else.
// Calling a missing method from inside a React effect blanks the whole page,
// so these checks pin the behaviour against deliberately minimal surfaces.

import { safeGetTools, subscribeToolChange } from "../src/webmcp/bridge";
import { TOOLS } from "../src/webmcp/tools";

let failures = 0;
function check(label: string, condition: boolean, extra = "") {
  const mark = condition ? "PASS" : "FAIL";
  if (!condition) failures += 1;
  console.log(`${mark}  ${label}${extra ? `  ${extra}` : ""}`);
}

function withSurface(surface: unknown) {
  (globalThis as unknown as { document: unknown }).document = {
    modelContext: surface,
  };
}

async function run() {
  // 1. The surface ChatGPT's browser appears to expose: registerTool only.
  withSurface({ registerTool: async () => {} });

  let threw = false;
  let unsubscribe: (() => void) | null = null;
  try {
    unsubscribe = subscribeToolChange(() => {});
  } catch {
    threw = true;
  }
  check("subscribing survives a surface with no addEventListener", !threw);

  threw = false;
  try {
    unsubscribe?.();
  } catch {
    threw = true;
  }
  check("unsubscribing survives it too", !threw);

  const fallback = await safeGetTools();
  check(
    "getTools falls back to the local descriptors",
    fallback.length === TOOLS.length,
    `${fallback.length} tools`
  );
  check(
    "the fallback keeps the read only hints",
    fallback.filter((t) => t.annotations?.readOnlyHint).length === 6
  );

  // 2. A surface that exposes the methods but throws from them.
  withSurface({
    registerTool: async () => {},
    getTools: async () => {
      throw new Error("not allowed");
    },
    addEventListener: () => {
      throw new Error("not allowed");
    },
  });

  threw = false;
  try {
    subscribeToolChange(() => {})();
  } catch {
    threw = true;
  }
  check("subscribing survives an addEventListener that throws", !threw);
  check(
    "getTools survives a surface that throws",
    (await safeGetTools()).length === TOOLS.length
  );

  // 3. A surface offering only the property based handler.
  const calls: string[] = [];
  const propertySurface: Record<string, unknown> = {
    registerTool: async () => {},
    ontoolchange: null,
  };
  withSurface(propertySurface);
  const off = subscribeToolChange(() => calls.push("fired"));
  check(
    "the property handler is used when addEventListener is absent",
    typeof propertySurface.ontoolchange === "function"
  );
  off();
  check("and it is restored on cleanup", propertySurface.ontoolchange === null);

  // 4. No surface at all.
  withSurface(undefined);
  threw = false;
  try {
    subscribeToolChange(() => {})();
  } catch {
    threw = true;
  }
  check("everything survives no model context at all", !threw);
  check(
    "and getTools still answers from the descriptors",
    (await safeGetTools()).length === TOOLS.length
  );

  console.log(
    failures === 0
      ? "\nAll surface compatibility checks passed."
      : `\n${failures} check(s) failed.`
  );
  process.exit(failures === 0 ? 0 : 1);
}

void run();
