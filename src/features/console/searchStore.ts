/**
 * Console search (M6).
 *
 * The top bar lives in the console layout and the tables live in the screens,
 * so the term has to cross that boundary. It is one string, so it is a zustand
 * field rather than a context or a prop threaded through every screen.
 *
 * The search is applied client-side by each list. Server-side filtering and
 * pagination arrive with the console screens in M7/M11.
 */
import { create } from "zustand";

export type ConsoleSearchState = {
  search: string;
  setSearch: (search: string) => void;
  /** Called when a screen mounts, so a stale term does not filter a new list. */
  clearSearch: () => void;
};

export const useConsoleSearch = create<ConsoleSearchState>()((set) => ({
  search: "",
  setSearch: (search) => set({ search }),
  clearSearch: () => set({ search: "" }),
}));
