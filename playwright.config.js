// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  // Each test launches its own persistent context with a fresh temp
  // userDataDir, so they don't share state and can run in parallel both
  // across files and within them.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // 2 workers on CI (free runners have ~4 GB RAM; each Chromium ~250-400 MB)
  // and 4 locally where there's more headroom.
  workers: process.env.CI ? 2 : 4,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    trace: 'retain-on-failure',
  },
  // No "projects" or webServer — each test launches its own persistent
  // Chromium context with the unpacked extension and intercepts all
  // tcgplayer.com requests via page.route.
});
