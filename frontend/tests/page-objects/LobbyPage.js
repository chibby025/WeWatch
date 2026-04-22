/**
 * Lobby Page Object
 * 
 * Represents the lobby/dashboard page
 */

export class LobbyPage {
  constructor(page) {
    this.page = page;
    
    // Navigation tabs
    this.chatsTab = page.locator('button:has-text("Chats")');
    this.roomsTab = page.locator('button:has-text("Rooms")');
    this.watchingNowTab = page.locator('button:has-text("Watching Now")');
    
    // Create button
    this.createButton = page.locator('[title*="Create New"], button:has-text("Create")').first();
    
    // Search
    this.searchInput = page.locator('input[placeholder*="Search"]');
    
    // Session cards
    this.sessionCards = page.locator('.session-card, [data-testid="session-card"]');
    
    // Profile
    this.profileButton = page.locator('[data-testid="profile-button"], button[aria-label*="Profile"]');
    this.logoutButton = page.locator('button:has-text("Logout"), a:has-text("Logout")');
  }

  async goto() {
    await this.page.goto('/lobby');
  }

  async switchToChatsTab() {
    await this.chatsTab.click();
  }

  async switchToRoomsTab() {
    await this.roomsTab.click();
  }

  async switchToWatchingNowTab() {
    await this.watchingNowTab.click();
  }

  async openCreateModal() {
    await this.createButton.click();
  }

  async searchSessions(query) {
    await this.searchInput.fill(query);
    await this.searchInput.press('Enter');
  }

  async getSessionCount() {
    return await this.sessionCards.count();
  }

  async clickFirstSession() {
    await this.sessionCards.first().click();
  }

  async logout() {
    await this.profileButton.click();
    await this.logoutButton.click();
  }

  async isCreateButtonVisible() {
    return await this.createButton.isVisible();
  }
}
