/**
 * Shared navigation vocabulary for the app shell.
 *
 * The map and the AI panel live under "/" (the panel as `?tab=ask`, so a
 * reload or a shared link lands on it). About, sources and support are real
 * pages. `pathForTab` is the single place that mapping is written down.
 */
export type Tab = "map" | "ask" | "donate" | "sources" | "about";
export type MobileTab = Tab | "feed";

export const CONFLICT_START = "2026-02-28";

export function pathForTab(tab: Tab | MobileTab): string {
  switch (tab) {
    case "about":
      return "/about";
    case "sources":
      return "/sources";
    case "donate":
      return "/support";
    case "ask":
      return "/?tab=ask";
    case "feed":
      return "/?tab=feed";
    default:
      return "/";
  }
}
