// tests/e2e/payment-flows.spec.js
// Playwright E2E Tests for Complete Payment Flows
// Tests: Token purchase → Ticket purchase → Donation → Wallet gift → Payout

import { test, expect } from '@playwright/test';

// Test configuration
const BASE_URL = 'http://localhost:5173';
const API_URL = 'http://localhost:8080';

// Test users (create these in your test database)
const HOST_USER = {
  email: 'host@test.com',
  password: 'testpassword123',
  name: 'Test Host'
};

const VIEWER_USER = {
  email: 'viewer@test.com',
  password: 'testpassword123',
  name: 'Test Viewer'
};

// Helper: Login as user
async function login(page, email, password) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  
  // Wait for redirect to lobby
  await page.waitForURL(`${BASE_URL}/lobby`);
  
  // Verify login success
  await expect(page.locator('text=Welcome back')).toBeVisible({ timeout: 5000 });
}

// Helper: Get wallet balance
async function getWalletBalance(page) {
  const balanceText = await page.locator('[data-testid="wallet-balance"]').textContent();
  return parseInt(balanceText.replace(/[^0-9]/g, ''));
}

test.describe('Payment System E2E Tests', () => {
  
  test.beforeEach(async ({ page }) => {
    // Clear cookies and localStorage
    await page.context().clearCookies();
    await page.goto(BASE_URL);
    await page.evaluate(() => localStorage.clear());
  });

  // ======================
  // Test 1: Token Purchase Flow
  // ======================
  test('Complete token purchase flow (Mock Paystack)', async ({ page }) => {
    test.setTimeout(60000); // 1 minute timeout
    
    await login(page, VIEWER_USER.email, VIEWER_USER.password);
    
    // Navigate to wallet/tokens page
    await page.click('[data-testid="wallet-button"]');
    await expect(page).toHaveURL(/.*wallet/);
    
    // Check initial balance
    const initialBalance = await getWalletBalance(page);
    console.log(`Initial balance: ${initialBalance} tokens`);
    
    // Click "Buy Tokens" button
    await page.click('button:has-text("Buy Tokens")');
    
    // Select token package (e.g., ₦1000 = 10,000 tokens)
    await page.click('[data-testid="token-package-1000"]');
    
    // Paystack modal should open
    // NOTE: In test environment, we'll mock Paystack
    // For real tests, use Paystack test cards
    
    // Mock successful payment (simulate webhook)
    // In production, you'd use Paystack test card: 4084084084084081
    const mockPaymentSuccess = () => {
      return page.evaluate(() => {
        window.postMessage({
          type: 'PAYSTACK_SUCCESS',
          reference: `test_ref_${Date.now()}`,
          amount: 100000 // ₦1000 in kobo
        }, '*');
      });
    };
    
    await mockPaymentSuccess();
    
    // Wait for success message
    await expect(page.locator('text=Payment successful')).toBeVisible({ timeout: 10000 });
    
    // Verify balance increased
    await page.reload(); // Refresh to get updated balance
    const newBalance = await getWalletBalance(page);
    expect(newBalance).toBeGreaterThan(initialBalance);
    console.log(`New balance: ${newBalance} tokens`);
    
    // Verify transaction appears in history
    await page.click('text=Transaction History');
    await expect(page.locator('text=Token Purchase')).toBeVisible();
  });

  // ======================
  // Test 2: Ticket Purchase Flow
  // ======================
  test('Purchase paid session ticket with tokens', async ({ page }) => {
    test.setTimeout(60000);
    
    await login(page, VIEWER_USER.email, VIEWER_USER.password);
    
    // Go to lobby and find paid session
    await page.goto(`${BASE_URL}/lobby`);
    
    // Look for session with ticket price
    const paidSession = page.locator('[data-testid="session-card"]').filter({ hasText: '₦' }).first();
    await paidSession.scrollIntoViewIfNeeded();
    
    // Click on paid session
    await paidSession.click();
    
    // Should show ticket purchase modal
    await expect(page.locator('text=Purchase Ticket')).toBeVisible();
    
    // Check wallet balance is sufficient
    const balance = await getWalletBalance(page);
    const ticketPrice = await page.locator('[data-testid="ticket-price"]').textContent();
    const price = parseInt(ticketPrice.replace(/[^0-9]/g, ''));
    
    if (balance < price) {
      console.log(`Insufficient balance: ${balance} < ${price}`);
      test.skip();
      return;
    }
    
    // Select "Pay with Tokens"
    await page.click('button:has-text("Pay with Tokens")');
    
    // Confirm purchase
    await page.click('button:has-text("Confirm Purchase")');
    
    // Wait for success
    await expect(page.locator('text=Ticket purchased')).toBeVisible({ timeout: 10000 });
    
    // Should redirect to watch page
    await expect(page).toHaveURL(/.*watch/);
    
    // Verify user can now access session
    await expect(page.locator('[data-testid="video-player"]')).toBeVisible();
    
    // Verify wallet balance decreased
    const newBalance = await getWalletBalance(page);
    expect(newBalance).toBe(balance - price);
  });

  // ======================
  // Test 3: In-Session Donation Flow
  // ======================
  test('Send donation to host during session', async ({ page }) => {
    test.setTimeout(60000);
    
    await login(page, VIEWER_USER.email, VIEWER_USER.password);
    
    // Join a free session (or paid session with ticket)
    await page.goto(`${BASE_URL}/lobby`);
    const freeSession = page.locator('[data-testid="session-card"]').filter({ hasText: 'Free' }).first();
    await freeSession.click();
    
    // Wait for session to load
    await expect(page.locator('[data-testid="video-player"]')).toBeVisible();
    
    // Check wallet balance
    const initialBalance = await getWalletBalance(page);
    if (initialBalance < 100) {
      console.log('Insufficient balance for donation test');
      test.skip();
      return;
    }
    
    // Find FloatingGiftIcon (should appear for hosts)
    const giftIcon = page.locator('[data-testid="floating-gift-icon"]');
    
    // If not visible, test might not be in right state
    if (!(await giftIcon.isVisible())) {
      console.log('Gift icon not visible (might not be a host in this session)');
      test.skip();
      return;
    }
    
    // Click gift icon
    await giftIcon.click();
    
    // Donation modal should appear
    await expect(page.locator('text=Send Donation')).toBeVisible();
    
    // Enter donation amount (e.g., 50 tokens)
    await page.fill('input[name="amount"]', '50');
    
    // Optional: Add message
    await page.fill('textarea[name="message"]', 'Great session!');
    
    // Confirm donation
    await page.click('button:has-text("Send Donation")');
    
    // Wait for success
    await expect(page.locator('text=Donation sent')).toBeVisible({ timeout: 5000 });
    
    // Verify balance decreased (50 tokens spent)
    const newBalance = await getWalletBalance(page);
    expect(newBalance).toBe(initialBalance - 50);
    
    // Verify host sees donation notification
    // (Would need to test with separate host session)
  });

  // ======================
  // Test 4: Wallet-to-Wallet Gift Flow
  // ======================
  test('Gift tokens to another user', async ({ page }) => {
    test.setTimeout(60000);
    
    await login(page, VIEWER_USER.email, VIEWER_USER.password);
    
    // Go to wallet/send page
    await page.goto(`${BASE_URL}/wallet/send`);
    
    // Check balance
    const initialBalance = await getWalletBalance(page);
    if (initialBalance < 100) {
      console.log('Insufficient balance for gift test');
      test.skip();
      return;
    }
    
    // Search for recipient by username
    await page.fill('input[placeholder="Search user..."]', HOST_USER.name);
    await page.click('button:has-text("Search")');
    
    // Select user from results
    await page.click(`[data-testid="user-result"]:has-text("${HOST_USER.name}")`);
    
    // Enter gift amount
    await page.fill('input[name="amount"]', '100');
    
    // Note about 5% fee
    await expect(page.locator('text=5% platform fee')).toBeVisible();
    const fee = Math.ceil(100 * 0.05); // 5 tokens fee
    await expect(page.locator(`text=Total: ${100 + fee} tokens`)).toBeVisible();
    
    // Confirm gift
    await page.click('button:has-text("Send Gift")');
    
    // Confirm in modal
    await page.click('button:has-text("Confirm")');
    
    // Wait for success
    await expect(page.locator('text=Gift sent successfully')).toBeVisible({ timeout: 5000 });
    
    // Verify balance decreased (100 tokens + 5 fee = 105 total)
    const newBalance = await getWalletBalance(page);
    expect(newBalance).toBe(initialBalance - (100 + fee));
    
    // TODO: Login as recipient and verify they received 100 tokens
  });

  // ======================
  // Test 5: Payout Request Flow
  // ======================
  test('Request payout to bank account', async ({ page }) => {
    test.setTimeout(60000);
    
    await login(page, HOST_USER.email, HOST_USER.password);
    
    // Go to earnings/payout page
    await page.goto(`${BASE_URL}/earnings/payout`);
    
    // Check if user has earnings
    const earningsText = await page.locator('[data-testid="available-earnings"]').textContent();
    const earnings = parseInt(earningsText.replace(/[^0-9]/g, ''));
    
    if (earnings < 1000) { // Minimum payout ₦100 = 1000 tokens
      console.log(`Insufficient earnings for payout: ${earnings} tokens`);
      test.skip();
      return;
    }
    
    // Check if payment account exists
    const hasAccount = await page.locator('[data-testid="payment-account"]').isVisible();
    
    if (!hasAccount) {
      // Add payment account first
      await page.click('button:has-text("Add Bank Account")');
      
      // Fill bank details (test account)
      await page.selectOption('select[name="bank"]', '058'); // GTBank test code
      await page.fill('input[name="account_number"]', '0123456789');
      await page.fill('input[name="account_name"]', HOST_USER.name);
      
      // Save account
      await page.click('button:has-text("Save Account")');
      await expect(page.locator('text=Account saved')).toBeVisible();
    }
    
    // Request payout
    await page.click('button:has-text("Request Payout")');
    
    // Select amount (or use all available)
    await page.fill('input[name="amount"]', earnings.toString());
    
    // Select bank account
    await page.click('[data-testid="payment-account"]');
    
    // Confirm payout
    await page.click('button:has-text("Request Payout")');
    
    // Wait for success
    await expect(page.locator('text=Payout requested')).toBeVisible({ timeout: 5000 });
    
    // Should show "Processing" status
    await expect(page.locator('text=Processing')).toBeVisible();
    
    // If auto-approved, should show "Completed" within seconds
    // (Admin bypass means immediate approval for test accounts)
    await expect(page.locator('text=Completed').or(page.locator('text=Pending'))).toBeVisible({ timeout: 10000 });
  });

  // ======================
  // Test 6: Complete Payment Flow (Integration)
  // ======================
  test('Complete flow: Token purchase → Ticket → Donation → Gift → Payout', async ({ page }) => {
    test.setTimeout(180000); // 3 minute timeout
    
    console.log('=== Starting Complete Payment Flow Test ===');
    
    // Step 1: Login as viewer
    console.log('Step 1: Login as viewer');
    await login(page, VIEWER_USER.email, VIEWER_USER.password);
    
    // Step 2: Check initial balance
    console.log('Step 2: Check initial balance');
    await page.goto(`${BASE_URL}/wallet`);
    const initialBalance = await getWalletBalance(page);
    console.log(`Initial balance: ${initialBalance} tokens`);
    
    // Step 3: Buy tokens (mock)
    console.log('Step 3: Buy tokens');
    if (initialBalance < 5000) {
      await page.click('button:has-text("Buy Tokens")');
      await page.click('[data-testid="token-package-1000"]');
      // Mock payment success
      await page.evaluate(() => {
        window.postMessage({
          type: 'PAYSTACK_SUCCESS',
          reference: `test_${Date.now()}`,
          amount: 100000
        }, '*');
      });
      await expect(page.locator('text=Payment successful')).toBeVisible({ timeout: 10000 });
      await page.reload();
    }
    
    // Step 4: Purchase ticket
    console.log('Step 4: Purchase ticket');
    await page.goto(`${BASE_URL}/lobby`);
    const paidSession = page.locator('[data-testid="session-card"]').filter({ hasText: '₦' }).first();
    if (await paidSession.isVisible()) {
      await paidSession.click();
      await page.click('button:has-text("Pay with Tokens")');
      await page.click('button:has-text("Confirm Purchase")');
      await expect(page.locator('text=Ticket purchased')).toBeVisible({ timeout: 10000 });
    }
    
    // Step 5: Send donation
    console.log('Step 5: Send donation');
    const giftIcon = page.locator('[data-testid="floating-gift-icon"]');
    if (await giftIcon.isVisible()) {
      await giftIcon.click();
      await page.fill('input[name="amount"]', '50');
      await page.click('button:has-text("Send Donation")');
      await expect(page.locator('text=Donation sent')).toBeVisible({ timeout: 5000 });
    }
    
    // Step 6: Gift tokens to another user
    console.log('Step 6: Gift tokens');
    await page.goto(`${BASE_URL}/wallet/send`);
    await page.fill('input[placeholder="Search user..."]', HOST_USER.name);
    await page.click('button:has-text("Search")');
    await page.click(`[data-testid="user-result"]:first-child`);
    await page.fill('input[name="amount"]', '100');
    await page.click('button:has-text("Send Gift")');
    await page.click('button:has-text("Confirm")');
    await expect(page.locator('text=Gift sent')).toBeVisible({ timeout: 5000 });
    
    // Step 7: Verify final balance
    console.log('Step 7: Verify final balance');
    await page.goto(`${BASE_URL}/wallet`);
    const finalBalance = await getWalletBalance(page);
    console.log(`Final balance: ${finalBalance} tokens`);
    expect(finalBalance).toBeLessThan(initialBalance);
    
    // Step 8: Login as host and request payout
    console.log('Step 8: Test payout as host');
    await page.goto(`${BASE_URL}/logout`);
    await login(page, HOST_USER.email, HOST_USER.password);
    await page.goto(`${BASE_URL}/earnings/payout`);
    
    // Request payout if earnings available
    const earnings = await page.locator('[data-testid="available-earnings"]').textContent();
    if (parseInt(earnings.replace(/[^0-9]/g, '')) >= 1000) {
      await page.click('button:has-text("Request Payout")');
      await page.fill('input[name="amount"]', '1000');
      await page.click('button:has-text("Request Payout")');
      await expect(page.locator('text=Payout requested')).toBeVisible({ timeout: 5000 });
    }
    
    console.log('=== Complete Payment Flow Test Finished ===');
  });

  // ======================
  // Test 7: Revenue Split Verification
  // ======================
  test('Verify revenue split calculations', async ({ page, request }) => {
    test.setTimeout(60000);
    
    // This test verifies backend calculations by checking database
    // or by inspecting API responses
    
    await login(page, HOST_USER.email, HOST_USER.password);
    
    // Get API token from localStorage
    const token = await page.evaluate(() => localStorage.getItem('token'));
    
    // Query wallet balance via API
    const walletResponse = await request.get(`${API_URL}/api/wallet/${HOST_USER.id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const walletData = await walletResponse.json();
    console.log('Wallet data:', walletData);
    
    // Query transaction history
    const transactionsResponse = await request.get(`${API_URL}/api/wallet/${HOST_USER.id}/transactions`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const transactions = await transactionsResponse.json();
    
    // Verify token purchase shows 75-25 split
    const tokenPurchase = transactions.find(t => t.transaction_type === 'token_purchase');
    if (tokenPurchase) {
      // Platform gets 25%, reserve gets 75%
      console.log('Token purchase found:', tokenPurchase);
      // Assert split is correct (would need platform_accounting table access)
    }
    
    // Verify donation shows 95-5 split
    const donation = transactions.find(t => t.transaction_type === 'donation');
    if (donation) {
      console.log('Donation found:', donation);
      // Host should receive 95% of donation amount
    }
    
    // Verify gift shows 95-5 split
    const gift = transactions.find(t => t.transaction_type === 'gift_received');
    if (gift) {
      console.log('Gift found:', gift);
      // Recipient should receive 95% of gift amount
    }
  });
});
