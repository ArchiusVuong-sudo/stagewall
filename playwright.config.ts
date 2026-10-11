import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 4113);

/**
 * End-to-end tests run against the production build in replay mode: no login,
 * no network, a fresh seeded database in ./data-e2e. Run `npm run build` first.
 * Locally, PW_CHANNEL=chrome uses the installed Chrome instead of a download.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1440, height: 900 },
    channel: process.env.PW_CHANNEL || undefined,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx tsx scripts/reset.ts && npx next start -H 127.0.0.1 -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/status`,
    reuseExistingServer: false,
    timeout: 90_000,
    env: {
      PORT: String(PORT),
      DATA_DIR: "data-e2e",
      DEMO_REPLAY: "1",
      REPLAY_DELAY_MS: "400",
      RATE_LIMIT_MAX: "100",
    },
  },
});
