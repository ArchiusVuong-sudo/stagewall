import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/live/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // SQLite files and module-level singletons: keep each file in its own process.
    pool: "forks",
    testTimeout: 15_000,
  },
});
