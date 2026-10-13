import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://127.0.0.1:5173", trace: "retain-on-failure" },
  webServer: [
    {
      command: "node tests/start-api.mjs",
      url: "http://127.0.0.1:4000/api/v1/health",
      timeout: 180000,
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -w client",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
