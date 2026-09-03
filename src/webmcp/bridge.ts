import { getWorld, log, setBridge, type BridgeMode } from "@/lib/store";
import { summariseCall, TOOLS } from "./tools";

/**
 * A local stand-in for document.modelContext.
 *
 * WebMCP only exists in Chrome behind a flag and in agent browsers that ship
 * it. Rather than degrade to a different code path when it is absent, the app
 * installs this object under the same name and keeps the same call shape. The
 * built in agent panel therefore drives the site through getTools and
 * executeTool in every environment, and the UI reports plainly which of the
 * two is in use so nothing is overstated.
 */
class ShimModelContext extends EventTarget {
  private registry = new Map<string, ModelContextTool>();
  ontoolchange: ((this: ModelContext, ev: Event) => unknown) | null = null;

  private changed() {
    const event = new Event("toolchange");
    this.dispatchEvent(event);
    this.ontoolchange?.call(this as unknown as ModelContext, event);
  }

  async registerTool(
    tool: ModelContextTool,
    options?: ModelContextRegisterToolOptions
  ): Promise<void> {
    this.registry.set(tool.name, tool);
    options?.signal?.addEventListener("abort", () => {
      this.registry.delete(tool.name);
      this.changed();
    });
    this.changed();
  }

  async getTools(): Promise<RegisteredTool[]> {
    return [...this.registry.values()].map((t) => ({
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema: t.inputSchema,
      annotations: t.annotations,
    }));
  }

  async executeTool(
    tool: RegisteredTool | string,
    input?: Record<string, unknown>
  ): Promise<string> {
    const name = typeof tool === "string" ? tool : tool.name;
    const found = this.registry.get(name);
    if (!found) throw new Error(`No tool registered under the name ${name}.`);
    const result = await found.execute(input ?? {}, {});
    return typeof result === "string" ? result : JSON.stringify(result);
  }
}

function installShim(): BridgeMode {
  if (document.modelContext) return "native";
  try {
    Object.defineProperty(document, "modelContext", {
      value: new ShimModelContext(),
      configurable: true,
      enumerable: false,
      writable: false,
    });
    return "shim";
  } catch {
    return "none";
  }
}

/**
 * Renders the human authored rules as a block appended to the description of
 * the tools that can change the floor.
 *
 * This is the point of the whole project expressed in the tool contract. A
 * correction does not just change what the app will accept, it narrows what
 * the agent is told it is able to do, before it composes a single call. The
 * constraint arrives as part of the tool definition rather than as an error
 * the agent has to run into first.
 */
function constraintBlock(): string {
  const authored = getWorld().rules.filter(
    (r) => r.enabled && r.source !== "builtin"
  );
  if (authored.length === 0) return "";
  const lines = authored.map((r) => `- ${r.statement}`).join("\n");
  return `\n\nThe human has added ${authored.length} standing rule${
    authored.length === 1 ? "" : "s"
  } during this session. Plans that break any of them are refused before they reach the human, so satisfy these first:\n${lines}`;
}

/**
 * Wraps a tool so that every call, and every refusal, lands in the activity
 * log. The log is the only record that proves real tool traffic happened,
 * so it is captured at the boundary rather than inside each tool.
 */
function wrap(tool: (typeof TOOLS)[number]): ModelContextTool {
  return {
    name: tool.name,
    title: tool.title,
    description:
      tool.group === "proposal"
        ? `${tool.description}${constraintBlock()}`
        : tool.description,
    inputSchema: tool.inputSchema,
    annotations: { readOnlyHint: tool.readOnly },
    execute: async (rawInput) => {
      const input = (rawInput ?? {}) as Record<string, unknown>;
      log("tool_call", "agent", summariseCall(tool.name, input), {
        tool: tool.name,
      });

      let result: unknown;
      try {
        result = tool.execute(input);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log("tool_refusal", "app", `${tool.name} failed: ${message}`, {
          tool: tool.name,
        });
        return JSON.stringify({ refused: true, message });
      }

      const record = result as Record<string, unknown> | null;
      if (record && record.refused === true) {
        log("tool_refusal", "app", String(record.message ?? "Refused."), {
          tool: tool.name,
          detail:
            typeof record.broken_rule === "object" && record.broken_rule
              ? String(
                  (record.broken_rule as Record<string, unknown>).statement ?? ""
                )
              : String(record.reason ?? ""),
        });
      } else if (tool.group === "proposal") {
        log("proposal", "agent", String(record?.summary ?? tool.name), {
          tool: tool.name,
          detail: String(record?.message ?? ""),
        });
      }

      return JSON.stringify(result, null, 2);
    },
  };
}

let installed: AbortController | null = null;
let currentMode: BridgeMode = "none";
/** Signature of the rules currently baked into the proposal tool descriptions. */
let describedRules = "";

function ruleSignature(): string {
  return getWorld()
    .rules.filter((r) => r.enabled && r.source !== "builtin")
    .map((r) => r.statement)
    .join("|");
}

/** Registers the whole tool surface. Safe to call more than once. */
export async function connectBridge(): Promise<void> {
  if (installed) return;
  const mode = installShim();
  currentMode = mode;
  if (mode === "none") {
    setBridge("none", []);
    log(
      "tool_refusal",
      "app",
      "This browser exposes no WebMCP surface and the local stand-in could not be installed."
    );
    return;
  }

  const controller = new AbortController();
  installed = controller;
  const mc = document.modelContext;
  if (!mc) return;

  for (const tool of TOOLS) {
    await mc.registerTool(wrap(tool), { signal: controller.signal });
  }
  describedRules = ruleSignature();

  const registered = await mc.getTools();
  setBridge(
    mode,
    registered.map((t) => t.name)
  );
  log(
    "tool_call",
    "app",
    `Registered ${TOOLS.length} tools on ${
      mode === "native" ? "the native WebMCP surface" : "the local WebMCP stand-in"
    }.`
  );
}

/**
 * Re-publishes the proposal tools when the human authored rules change, so an
 * agent reading the surface sees the narrowed contract rather than the one it
 * was handed at page load. Cheap to call, and a no-op when nothing moved.
 */
export async function refreshToolDescriptions(): Promise<void> {
  if (!installed) return;
  const signature = ruleSignature();
  if (signature === describedRules) return;
  describedRules = signature;

  const mc = document.modelContext;
  if (!mc) return;

  // Registering the same name again replaces the previous definition.
  for (const tool of TOOLS) {
    if (tool.group !== "proposal") continue;
    await mc.registerTool(wrap(tool), { signal: installed.signal });
  }

  const count = getWorld().rules.filter(
    (r) => r.enabled && r.source !== "builtin"
  ).length;
  log(
    "tool_call",
    "app",
    `Re-published propose_changes and optimise_layout with ${count} human authored rule${
      count === 1 ? "" : "s"
    } in the contract.`
  );
}

export function disconnectBridge() {
  installed?.abort();
  installed = null;
  currentMode = "none";
  describedRules = "";
  setBridge("none", []);
}

export function bridgeMode(): BridgeMode {
  return currentMode;
}

/** Re-reads the surface and updates the tool list shown in the interface. */
export async function syncTools(): Promise<void> {
  const mc = document.modelContext;
  if (!mc) return;
  const tools = await mc.getTools();
  setBridge(
    currentMode,
    tools.map((t) => t.name)
  );
}

/**
 * Calls a tool the same way an external agent would, through the browser
 * surface rather than by reaching into the module. The in page agent uses
 * this so the two paths cannot drift apart.
 */
export async function callToolThroughBridge(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  const mc = document.modelContext;
  if (!mc) throw new Error("No model context available.");
  const tools = await mc.getTools();
  const match = tools.find((t) => t.name === name);
  if (!match) throw new Error(`Tool ${name} is not registered.`);
  return mc.executeTool(match, input);
}
