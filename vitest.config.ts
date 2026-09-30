import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    // deep-rewriter.test.ts is a plain node:assert script, not a vitest suite
    exclude: ["tests/deep-rewriter.test.ts", "**/node_modules/**"],
    passWithNoTests: true,
  },
});
