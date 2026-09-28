/**
 * Driver settings (M10).
 *
 * Small client state that belongs to the driver rather than to the server, so a
 * zustand store is the right home (CLAUDE.md: TanStack Query for server state,
 * zustand for client state).
 *
 * Only one setting exists in Phase 1: keeping the screen awake while a trip is
 * recording. It is **off by default** — a driver who wants the screen to stay on
 * for the whole trip opts in, because the cost is battery (the thing D2 already
 * warns about). D8 owns the settings list; until then D5 exposes the toggle
 * where it matters.
 */
import { create } from "zustand";

export type SettingsState = {
  /** Keep the screen on while a trip is being recorded. Off unless opted in. */
  keepAwakeEnabled: boolean;
  setKeepAwakeEnabled: (enabled: boolean) => void;
  toggleKeepAwake: () => void;
};

export const useSettingsStore = create<SettingsState>()((set) => ({
  keepAwakeEnabled: false,
  setKeepAwakeEnabled: (enabled) => set({ keepAwakeEnabled: enabled }),
  toggleKeepAwake: () => set((state) => ({ keepAwakeEnabled: !state.keepAwakeEnabled })),
}));
