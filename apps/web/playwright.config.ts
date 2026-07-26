import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    ignoreHTTPSErrors: Boolean(process.env.REAL_HTTPS_APP_URL),
    trace: "retain-on-failure"
  }
});
