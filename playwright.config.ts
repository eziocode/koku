import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:3107",
    permissions: ["notifications"],
    viewport: { width: 1440, height: 1000 },
    launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {},
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node .next/standalone/appsail-server.cjs",
    env: { HOSTNAME: "127.0.0.1", PORT: "3107", X_ZOHO_CATALYST_LISTEN_PORT: "3107" },
    url: "http://127.0.0.1:3107",
    // Set PLAYWRIGHT_REUSE_SERVER=1 to iterate against an already-running
    // server (e.g. `next dev -p 3107`) instead of rebuilding standalone.
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "1",
    timeout: 60_000,
  },
});
