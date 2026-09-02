// Ambient declarations for the WebMCP browser API.
// The spec is at https://webmachinelearning.github.io/webmcp/ and the surface is not
// yet present in TypeScript's lib.dom, so we describe the parts we depend on here.

interface ModelContextToolAnnotations {
  /** Signals to the agent that the tool has no side effects and is free to call. */
  readOnlyHint?: boolean;
  /** Signals that the returned content may include text the page did not author. */
  untrustedContentHint?: boolean;
}

interface ModelContextTool {
  name: string;
  description: string;
  title?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: ModelContextToolAnnotations;
  execute: (
    input: Record<string, unknown>,
    options: { signal?: AbortSignal }
  ) => unknown | Promise<unknown>;
}

interface ModelContextRegisterToolOptions {
  signal?: AbortSignal;
  exposedTo?: string[];
}

interface RegisteredTool {
  name: string;
  description?: string;
  title?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: ModelContextToolAnnotations;
}

interface ModelContext extends EventTarget {
  registerTool(
    tool: ModelContextTool,
    options?: ModelContextRegisterToolOptions
  ): Promise<void>;
  getTools(options?: Record<string, unknown>): Promise<RegisteredTool[]>;
  executeTool(
    tool: RegisteredTool | string,
    input?: Record<string, unknown>,
    options?: Record<string, unknown>
  ): Promise<string>;
  ontoolchange: ((this: ModelContext, ev: Event) => unknown) | null;
}

interface Document {
  readonly modelContext?: ModelContext;
}
