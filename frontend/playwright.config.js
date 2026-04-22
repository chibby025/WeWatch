import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration for WeWatch
 * 
 * Features tested:
 * - Authentication (Login, Register, Logout)
 * - Session Management (Create, Join, End)
 * - Video Upload (Chunked, Network-aware compression)
 * - Payment System (Ticket purchase, Paystack integration)
 * - Real-time Features (WebSocket, Chat, Likes)
 * - LiveShare Modes (Camera, Screen, Podcast, News, Show)
 * - 3D Cinema (Seat selection, Spatial audio)
 */

export default defineConfig({
  testDir: './tests/e2e',
  
  // Timeout for each test (30 seconds)
  timeout: 30 * 1000,
  
  // Global setup timeout (e.g., starting servers)
  globalTimeout: 60 * 60 * 1000, // 1 hour
  
  // Expect timeout for assertions
  expect: {
    timeout: 5000,
  },
  
  // Fail fast - stop on first failure during development
  fullyParallel: false,
  
  // Retry failed tests (helps with flaky tests)
  retries: process.env.CI ? 2 : 0,
  
  // Number of parallel workers
  workers: process.env.CI ? 1 : 3,
  
  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],
  
  // Shared settings for all tests
  use: {
    // Base URL for navigation
    baseURL: 'http://localhost:5173',
    
    // Browser context options
    viewport: { width: 1280, height: 720 },
    
    // Artifacts on failure
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    
    // Action timeout (click, fill, etc.)
    actionTimeout: 10 * 1000,
    
    // Navigation timeout
    navigationTimeout: 15 * 1000,
  },
  
  // Test projects (browsers/devices to test on)
  projects: [
    // Desktop Browsers
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        // Chrome-specific settings
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream', // Auto-grant camera/mic permissions
            '--use-fake-device-for-media-stream',
          ],
        },
      },
    },
    
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    
    // Mobile Browsers
    {
      name: 'mobile-chrome',
      use: { 
        ...devices['Pixel 5'],
        // Mobile-specific settings
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
          ],
        },
      },
    },
    
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },
  ],
  
  // Web server to start before tests (optional - assumes backend is running)
  // webServer: {
  //   command: 'npm run dev',
  //   url: 'http://localhost:5173',
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120 * 1000,
  // },
});
