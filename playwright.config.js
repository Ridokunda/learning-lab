import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:4180", channel: "msedge", headless: true },
  webServer: {
    command: `"${process.execPath}" tests/browser-server.js`,
    url: "http://127.0.0.1:4180",
    reuseExistingServer: false,
  },
  reporter: "list",
});
