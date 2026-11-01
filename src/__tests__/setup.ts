import { beforeEach } from "vitest";

// Only import jest-dom matchers if we're in a DOM environment
if (typeof document !== "undefined") {
  await import("@testing-library/jest-dom/vitest");

  // setLocale() writes the language cookie and the provider honours it, so a
  // cookie left by one test would pick the next test's language.
  beforeEach(() => {
    document.cookie = "wl_lang=; path=/; max-age=0";
  });
}

export {};
