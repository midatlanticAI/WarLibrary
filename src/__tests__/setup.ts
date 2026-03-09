// Only import jest-dom matchers if we're in a DOM environment
if (typeof document !== "undefined") {
  await import("@testing-library/jest-dom/vitest");
}
