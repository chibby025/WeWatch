import { test as base } from '@playwright/test';

/**
 * Auth Fixture - Provides authenticated page context
 * 
 * Usage:
 *   test('my test', async ({ authenticatedPage }) => {
 *     // Page is already logged in
 *   });
 */

export const test = base.extend({
  // Authenticated page fixture (auto-login before test)
  authenticatedPage: async ({ page }, use) => {
    // Navigate to login
    await page.goto('/login');
    
    // Fill login form
    await page.fill('input[name="email"]', 'testhost1@example.com');
    await page.fill('input[name="password"]', 'Test1234!');
    
    // Submit and wait for redirect
    await page.click('button[type="submit"]');
    await page.waitForURL('**/lobby');
    
    // Use the authenticated page
    await use(page);
    
    // Cleanup (logout after test)
    // Note: Optional - page context is destroyed anyway
  },
  
  // Authenticated viewer (different user)
  authenticatedViewer: async ({ page }, use) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', 'testviewer1@example.com');
    await page.fill('input[name="password"]', 'Test1234!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/lobby');
    
    await use(page);
  },
});

export { expect } from '@playwright/test';
