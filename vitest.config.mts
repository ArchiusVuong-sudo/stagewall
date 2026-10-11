import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/live/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // SQLite files and module-level singletons: keep each file in its own process.
    pool: "forks",
    testTimeout: 15_000,
  },
});
