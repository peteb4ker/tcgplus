// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: false, // each test launches a persistent context with the extension; serialise to keep things sane
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    trace: 'retain-on-failure',
  },
  // No "projects" or webServer — each test launches its own persistent
  // Chromium context with the unpacked extension and intercepts all
  // tcgplayer.com requests via page.route.
});
