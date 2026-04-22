import { test, expect } from '@playwright/test';
import { LoginPage } from '../../page-objects/LoginPage.js';
import { LobbyPage } from '../../page-objects/LobbyPage.js';
import { testUsers } from '../../fixtures/test-data.js';

/**
 * Authentication E2E Tests
 * 
 * Test Cases:
 * - TC-AUTH-001: Successful login with valid credentials
 * - TC-AUTH-003: Failed login with invalid password
 * - TC-AUTH-004: Logout functionality
 * - TC-AUTH-006: Navigate to registration from login
 */

test.describe('Authentication', () => {
  let loginPage;
  let lobbyPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    lobbyPage = new LobbyPage(page);
  });

  test('TC-AUTH-001: Successful login with valid credentials', async ({ page }) => {
    await loginPage.goto();
    
    // Fill login form
    await loginPage.login(testUsers.host.email, testUsers.host.password);
    
    // Verify redirect to lobby
    await expect(page).toHaveURL(/.*lobby/, { timeout: 10000 });
    
    // Verify user is logged in (create button visible)
    await expect(lobbyPage.createButton).toBeVisible();
  });

  test('TC-AUTH-003: Failed login with invalid password', async ({ page }) => {
    await loginPage.goto();
    
    // Attempt login with wrong password
    await loginPage.login(testUsers.host.email, 'WrongPassword123!');
    
    // Verify error message appears
    await expect(loginPage.errorMessage).toBeVisible({ timeout: 5000 });
    
    const errorText = await loginPage.getErrorMessage();
    expect(errorText.toLowerCase()).toContain('invalid');
    
    // Verify still on login page
    await expect(page).toHaveURL(/.*login/);
  });

  test('TC-AUTH-004: Logout functionality', async ({ page }) => {
    // Login first
    await loginPage.goto();
    await loginPage.login(testUsers.host.email, testUsers.host.password);
    await expect(page).toHaveURL(/.*lobby/);
    
    // Logout
    await lobbyPage.logout();
    
    // Verify redirect to login
    await expect(page).toHaveURL(/.*login/, { timeout: 5000 });
  });

  test('TC-AUTH-006: Navigate to registration from login', async ({ page }) => {
    await loginPage.goto();
    
    // Click register link
    await loginPage.goToRegister();
    
    // Verify redirect to register page
    await expect(page).toHaveURL(/.*register/);
  });

  test('TC-AUTH-007: Redirect to login when accessing protected route', async ({ page }) => {
    // Try accessing lobby without login
    await page.goto('/lobby');
    
    // Should redirect to login
    await expect(page).toHaveURL(/.*login/, { timeout: 5000 });
  });

  test('TC-AUTH-008: Password visibility toggle works', async ({ page }) => {
    // Step 1: Go to login page
    await loginPage.goto();
    
    // Step 2: Fill password field
    await loginPage.passwordInput.fill('Test1234!');
    
    // Step 3: Verify password is hidden by default (type="password")
    const passwordType = await loginPage.passwordInput.getAttribute('type');
    expect(passwordType).toBe('password');
    
    // Step 4: Find and click the visibility toggle button
    // (This button might be an icon next to password field - adjust selector if needed)
    const visibilityToggle = page.locator('[data-testid="password-visibility-toggle"]')
      .or(page.locator('button[aria-label*="password"]'))
      .or(page.locator('.password-toggle'))
      .first();
    
    await visibilityToggle.click();
    
    // Step 5: Verify password is now visible (type="text")
    const passwordTypeAfterShow = await loginPage.passwordInput.getAttribute('type');
    expect(passwordTypeAfterShow).toBe('text');
    
    // Step 6: Click toggle again to hide password
    await visibilityToggle.click();
    
    // Step 7: Verify password is hidden again (type="password")
    const passwordTypeAfterHide = await loginPage.passwordInput.getAttribute('type');
    expect(passwordTypeAfterHide).toBe('password');
  });

  test('TC-AUTH-009: Remember me checkbox toggles correctly', async ({ page }) => {
    await loginPage.goto();
    
    // Locate the "Remember me" checkbox
    const rememberMeCheckbox = page.locator('input[type="checkbox"]').first();
    
    // Verify checkbox is unchecked by default
    await expect(rememberMeCheckbox).not.toBeChecked();
    
    // Click checkbox to enable "Remember me"
    await rememberMeCheckbox.check();
    
    // Verify checkbox is now checked
    await expect(rememberMeCheckbox).toBeChecked();
    
    // Click again to uncheck
    await rememberMeCheckbox.uncheck();
    
    // Verify checkbox is unchecked again
    await expect(rememberMeCheckbox).not.toBeChecked();
  });
});
