import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    // Node by default. Component suites opt into a DOM with a
    // `// @vitest-environment happy-dom` docblock at the top of the file.
    //
    // There used to be an `environmentMatchGlobs` block here mapping *.test.tsx
    // to jsdom. It was removed in Vitest 4 and silently ignored, so it never
    // took effect — the .tsx suites have always run on happy-dom via their
    // docblocks, and the config was describing a setup that did not exist.
    environment: "node",
    setupFiles: ["./src/__tests__/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
