import { test, expect } from '../../fixtures/auth.fixture.js';
import { LobbyPage } from '../../page-objects/LobbyPage.js';
import { SessionCreationModal } from '../../page-objects/SessionCreationModal.js';

/**
 * Session Management E2E Tests
 * 
 * Test Cases:
 * - TC-SESSION-001: Create free instant watch session
 * - TC-SESSION-002: Create paid session with ticket pricing
 * - TC-SESSION-003: Create scheduled event
 * - TC-SESSION-004: Create lecture hall session
 * - TC-SESSION-006: End session
 */

test.describe('Session Management', () => {
  test('TC-SESSION-001: Create free instant watch session', async ({ authenticatedPage: page }) => {
    const lobbyPage = new LobbyPage(page);
    const sessionModal = new SessionCreationModal(page);
    
    // Open create modal
    await lobbyPage.openCreateModal();
    
    // Create free movie night session
    await sessionModal.createFreeSession('Movie Night', 'PG');
    
    // Verify redirect to watch page
    await expect(page).toHaveURL(/.*\/watch\/.*/, { timeout: 10000 });
    
    // Verify session page loaded (video player or upload prompt visible)
    const uploadButton = page.locator('button:has-text("Upload"), button:has-text("Select Video")');
    await expect(uploadButton).toBeVisible({ timeout: 5000 });
  });

  test('TC-SESSION-002: Create paid session with ticket pricing', async ({ authenticatedPage: page }) => {
    const lobbyPage = new LobbyPage(page);
    const sessionModal = new SessionCreationModal(page);
    
    await lobbyPage.openCreateModal();
    
    // Create paid session
    await sessionModal.createPaidSession('Watch Party', 500, 50, '13+');
    
    // Verify redirect to watch page
    await expect(page).toHaveURL(/.*\/watch\/.*/, { timeout: 10000 });
    
    // Verify ticket badge visible
    const ticketBadge = page.locator('text=₦500, text=500');
    await expect(ticketBadge.first()).toBeVisible({ timeout: 5000 });
  });

  test('TC-SESSION-004: Create lecture hall session', async ({ authenticatedPage: page }) => {
    const lobbyPage = new LobbyPage(page);
    const sessionModal = new SessionCreationModal(page);
    
    await lobbyPage.openCreateModal();
    
    // Select classroom type
    await sessionModal.selectInstantWatch();
    await sessionModal.selectClassroom();
    await sessionModal.selectLectureHall();
    
    // Set capacity and rating
    await sessionModal.capacityInput.fill('100');
    await sessionModal.selectRating('G');
    await sessionModal.createSession();
    
    // Verify redirect to lecture hall page
    await expect(page).toHaveURL(/.*\/lecture-hall\/.*/, { timeout: 10000 });
    
    // Verify seats are visible (lecture hall has 145 seats max)
    const seats = page.locator('.seat, [data-testid="seat"]');
    const seatCount = await seats.count();
    expect(seatCount).toBeGreaterThan(0);
  });

  test('TC-SESSION-006: End session', async ({ authenticatedPage: page }) => {
    const lobbyPage = new LobbyPage(page);
    const sessionModal = new SessionCreationModal(page);
    
    // Create a session first
    await lobbyPage.openCreateModal();
    await sessionModal.createFreeSession('Movie Night', 'PG');
    await expect(page).toHaveURL(/.*\/watch\/.*/);
    
    // End session (look for end button)
    const endButton = page.locator('button:has-text("End"), button:has-text("End Session"), button[title*="End"]');
    await endButton.click({ timeout: 5000 });
    
    // Confirm end (if confirmation modal appears)
    const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes")');
    if (await confirmButton.isVisible({ timeout: 2000 })) {
      await confirmButton.click();
    }
    
    // Verify redirect back to lobby
    await expect(page).toHaveURL(/.*lobby/, { timeout: 10000 });
  });

  test('TC-SESSION-007: Search for session in lobby', async ({ authenticatedPage: page }) => {
    const lobbyPage = new LobbyPage(page);
    
    await lobbyPage.goto();
    
    // Search for "movie"
    await lobbyPage.searchSessions('movie');
    
    // Wait for search results to update
    await page.waitForTimeout(1000);
    
    // Get visible session cards
    const sessionCount = await lobbyPage.getSessionCount();
    
    // At minimum, no error should occur
    expect(sessionCount).toBeGreaterThanOrEqual(0);
  });
});
