import { defineConfig } from 'playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3199',
  },
  webServer: {
    command: 'npm run dev -- -p 3199',
    port: 3199,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
