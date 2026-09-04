"use client";

import { useSyncExternalStore } from "react";
import { store, type AppState } from "./store";

/**
 * The store keeps one immutable state object and replaces it on every change,
 * which is all useSyncExternalStore needs. There is no selector layer because
 * a floor of this size re-renders in a single pass.
 */
export function useAppState(): AppState {
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot
  );
}
