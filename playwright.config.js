const { defineConfig, devices } = require("@playwright/test");

const PORT = process.env.TEST_PORT || 3100;

module.exports = defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },

  // Sobe o servidor real da aplicação antes dos testes.
  webServer: {
    command: "node server/server.js",
    url: `http://localhost:${PORT}`,
    env: { PORT: String(PORT) },
    reuseExistingServer: false,
    timeout: 20_000,
  },

  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
      testIgnore: /tablet\.spec\.js/,
    },
    {
      // Emulação do Galaxy Tab (toque, tela e densidade de pixels).
      name: "tablet",
      use: { ...devices["Galaxy Tab S4 landscape"] },
      testMatch: /tablet\.spec\.js/,
    },
  ],
});
