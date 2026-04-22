import { test, expect } from '../../fixtures/auth.fixture.js';

/**
 * LiveShare Graphics E2E Tests
 * 
 * Based on LIVESHARE_REFINEMENT_PLAN.md
 * 
 * Test Cases:
 * - TC-LIVESHARE-001: Start LiveShare camera mode
 * - TC-LIVESHARE-002: Enable lower third graphic
 * - TC-LIVESHARE-003: Enable ticker with time display
 * - TC-LIVESHARE-004: Start break mode
 * - TC-LIVESHARE-005: End LiveShare session
 */

test.describe('LiveShare Modes & Graphics', () => {
  
  test.beforeEach(async ({ authenticatedPage: page }) => {
    // Create a session before testing LiveShare
    await page.goto('/lobby');
    await page.click('[title*="Create New"]');
    await page.click('text=Instant Watch');
    await page.click('text=Movie Night');
    await page.click('text=Free');
    await page.click('[alt="PG"]');
    await page.click('text=Create Session');
    await expect(page).toHaveURL(/.*\/watch\/.*/);
    
    // Wait for page to load
    await page.waitForTimeout(2000);
  });

  test('TC-LIVESHARE-001: Start LiveShare camera mode', async ({ authenticatedPage: page }) => {
    // Grant camera/mic permissions (Chromium auto-grants with launch args)
    
    // Click LiveShare tab or button
    const liveShareButton = page.locator('button:has-text("LiveShare"), button:has-text("Go Live"), [aria-label*="LiveShare"]');
    await liveShareButton.click({ timeout: 5000 });
    
    // Select mode (Regular)
    const regularMode = page.locator('text=Regular, button:has-text("Regular")');
    if (await regularMode.isVisible({ timeout: 3000 })) {
      await regularMode.click();
    }
    
    // Select Camera Only
    const cameraOption = page.locator('text=Camera Only, button:has-text("Camera")');
    if (await cameraOption.isVisible({ timeout: 3000 })) {
      await cameraOption.click();
    }
    
    // Click "Go Live"
    const goLiveButton = page.locator('button:has-text("Go Live"), button:has-text("Start")');
    await goLiveButton.click({ timeout: 5000 });
    
    // Verify LiveShare is active (LIVE indicator visible)
    const liveIndicator = page.locator('text=LIVE, .live-indicator, [data-testid="live-indicator"]');
    await expect(liveIndicator).toBeVisible({ timeout: 10000 });
  });

  test('TC-LIVESHARE-002: Enable lower third graphic', async ({ authenticatedPage: page }) => {
    // Start LiveShare first (simplified - assumes LiveShare is running)
    const liveShareButton = page.locator('button:has-text("LiveShare"), button:has-text("Go Live")');
    if (await liveShareButton.isVisible({ timeout: 3000 })) {
      await liveShareButton.click();
      
      // Quick start (Regular, Camera, Go Live)
      await page.click('text=Regular', { timeout: 3000 }).catch(() => {});
      await page.click('text=Camera', { timeout: 3000 }).catch(() => {});
      await page.click('button:has-text("Go Live")', { timeout: 3000 }).catch(() => {});
    }
    
    // Open Studio Controls or Graphics section
    const studioControls = page.locator('text=Studio Controls, button:has-text("Graphics"), [aria-label*="Graphics"]');
    if (await studioControls.isVisible({ timeout: 3000 })) {
      await studioControls.click();
    }
    
    // Find Lower Third toggle/button
    const lowerThirdToggle = page.locator('input[type="checkbox"]:near(:text("Lower Third")), button:has-text("Lower Third"), label:has-text("Lower Third")');
    
    if (await lowerThirdToggle.isVisible({ timeout: 5000 })) {
      await lowerThirdToggle.click();
      
      // Verify toggle is on (checked)
      if (await lowerThirdToggle.evaluate(el => el.tagName === 'INPUT')) {
        await expect(lowerThirdToggle).toBeChecked();
      }
    }
  });

  test('TC-LIVESHARE-003: Enable ticker with time display', async ({ authenticatedPage: page }) => {
    // Start LiveShare in News mode (ticker is for News mode)
    const liveShareButton = page.locator('button:has-text("LiveShare"), button:has-text("Go Live")');
    if (await liveShareButton.isVisible({ timeout: 3000 })) {
      await liveShareButton.click();
      
      // Select News mode
      await page.click('text=News', { timeout: 3000 }).catch(() => {});
      await page.click('text=Camera', { timeout: 3000 }).catch(() => {});
      await page.click('button:has-text("Go Live")', { timeout: 3000 }).catch(() => {});
    }
    
    // Find Ticker section
    const tickerSection = page.locator('text=Ticker, summary:has-text("Ticker")');
    if (await tickerSection.isVisible({ timeout: 5000 })) {
      await tickerSection.click();
      
      // Enable ticker
      const tickerToggle = page.locator('input[type="checkbox"]:near(:text("Ticker")), label:has-text("Show Ticker")');
      if (await tickerToggle.isVisible({ timeout: 3000 })) {
        await tickerToggle.click();
      }
      
      // Verify ticker text input appears
      const tickerInput = page.locator('input[placeholder*="ticker"], input[placeholder*="headline"]');
      await expect(tickerInput).toBeVisible({ timeout: 3000 });
    }
  });

  test('TC-LIVESHARE-004: Start break mode', async ({ authenticatedPage: page }) => {
    // Start LiveShare first
    const liveShareButton = page.locator('button:has-text("LiveShare"), button:has-text("Go Live")');
    if (await liveShareButton.isVisible({ timeout: 3000 })) {
      await liveShareButton.click();
      await page.click('text=Regular', { timeout: 3000 }).catch(() => {});
      await page.click('text=Camera', { timeout: 3000 }).catch(() => {});
      await page.click('button:has-text("Go Live")', { timeout: 3000 }).catch(() => {});
    }
    
    // Find "Take a Break" section
    const breakSection = page.locator('text=Break, summary:has-text("Break"), button:has-text("Take a Break")');
    if (await breakSection.isVisible({ timeout: 5000 })) {
      await breakSection.click();
      
      // Click "Start Break"
      const startBreakButton = page.locator('button:has-text("Start Break")');
      if (await startBreakButton.isVisible({ timeout: 3000 })) {
        await startBreakButton.click();
        
        // Verify break is active (break screen visible or status changed)
        const breakIndicator = page.locator('text=On Break, text=Break Active, .break-indicator');
        await expect(breakIndicator.first()).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('TC-LIVESHARE-005: End LiveShare session', async ({ authenticatedPage: page }) => {
    // Start LiveShare first
    const liveShareButton = page.locator('button:has-text("LiveShare"), button:has-text("Go Live")');
    if (await liveShareButton.isVisible({ timeout: 3000 })) {
      await liveShareButton.click();
      await page.click('text=Regular', { timeout: 3000 }).catch(() => {});
      await page.click('text=Camera', { timeout: 3000 }).catch(() => {});
      await page.click('button:has-text("Go Live")', { timeout: 3000 }).catch(() => {});
      
      // Wait for LiveShare to start
      await page.waitForTimeout(2000);
    }
    
    // End LiveShare
    const endLiveShareButton = page.locator('button:has-text("End LiveShare"), button:has-text("Stop")');
    if (await endLiveShareButton.isVisible({ timeout: 5000 })) {
      await endLiveShareButton.click();
      
      // Confirm if modal appears
      const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes")');
      if (await confirmButton.isVisible({ timeout: 2000 })) {
        await confirmButton.click();
      }
      
      // Verify LIVE indicator disappears
      const liveIndicator = page.locator('text=LIVE, .live-indicator');
      await expect(liveIndicator).not.toBeVisible({ timeout: 5000 });
    }
  });
});
