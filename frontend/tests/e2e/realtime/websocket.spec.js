import { test, expect } from '../../fixtures/auth.fixture.js';

/**
 * Real-time WebSocket E2E Tests
 * 
 * Test Cases:
 * - TC-REALTIME-001: WebSocket connection established on lobby
 * - TC-REALTIME-004: Chat message broadcast
 * - TC-REALTIME-006: Reconnection after disconnect
 */

test.describe('Real-time WebSocket Features', () => {
  
  test('TC-REALTIME-001: WebSocket connection established', async ({ authenticatedPage: page }) => {
    // Listen for WebSocket connections
    const wsPromise = page.waitForEvent('websocket', { timeout: 10000 });
    
    // Navigate to lobby (should trigger WS connection)
    await page.goto('/lobby');
    
    // Wait for WebSocket
    const ws = await wsPromise;
    
    // Verify WebSocket is connected
    expect(ws.url()).toContain('ws://');
    
    // Listen for lobby_connected message
    const messagePromise = new Promise((resolve) => {
      ws.on('framereceived', (event) => {
        const data = JSON.parse(event.payload);
        if (data.type === 'lobby_connected') {
          resolve(data);
        }
      });
    });
    
    const message = await messagePromise;
    expect(message.type).toBe('lobby_connected');
  });

  test('TC-REALTIME-004: Chat message broadcast', async ({ authenticatedPage: page }) => {
    // Create a session first
    await page.goto('/lobby');
    await page.click('[title*="Create New"]');
    await page.click('text=Instant Watch');
    await page.click('text=Movie Night');
    await page.click('text=Free');
    await page.click('[alt="PG"]');
    await page.click('text=Create Session');
    
    await expect(page).toHaveURL(/.*\/watch\/.*/);
    
    // Wait for chat to be ready
    await page.waitForTimeout(2000);
    
    // Send a chat message
    const chatInput = page.locator('input[placeholder*="message"], input[placeholder*="chat"], textarea[placeholder*="message"]');
    await chatInput.fill('Hello from E2E test!');
    
    // Submit message (press Enter or click send button)
    await chatInput.press('Enter');
    
    // Verify message appears in chat
    const chatMessage = page.locator('text=Hello from E2E test!');
    await expect(chatMessage).toBeVisible({ timeout: 5000 });
  });

  test('TC-REALTIME-006: Reconnection after disconnect', async ({ authenticatedPage: page, context }) => {
    await page.goto('/lobby');
    
    // Wait for initial WebSocket connection
    const ws1 = await page.waitForEvent('websocket');
    
    // Simulate network disconnect (go offline)
    await context.setOffline(true);
    
    // Wait 2 seconds
    await page.waitForTimeout(2000);
    
    // Reconnect (go online)
    await context.setOffline(false);
    
    // Wait for reconnection
    const ws2 = await page.waitForEvent('websocket', { timeout: 15000 });
    
    // Verify new WebSocket connection established
    expect(ws2.url()).toContain('ws://');
  });
});
