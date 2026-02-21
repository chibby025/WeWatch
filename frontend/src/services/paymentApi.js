/**
 * Payment API Service
 * Handles all payment-related API calls for WeWatch Platform
 * 
 * Backend: 44 payment endpoints (Phase 2-3 Complete)
 * - Wallet management
 * - Token purchases (Stripe/Paystack)
 * - Ticketing system
 * - Donations
 * - Payment accounts
 * - Payouts/Withdrawals
 * - KYC verification
 * - Refunds
 */

import { apiClient } from './api';

// ============================================================================
// WALLET MANAGEMENT (3 endpoints)
// ============================================================================

/**
 * Get user's wallet balance and transaction history
 * GET /api/wallets/me
 */
export const getWallet = async () => {
  try {
    const response = await apiClient.get('/api/wallets/me');
    return response.data;
  } catch (error) {
    console.error('API Error (getWallet):', error);
    throw error;
  }
};

/**
 * Get wallet statistics (earnings, commissions, etc.)
 * GET /api/wallet/stats (currently not implemented in backend)
 */
export const getWalletStats = async () => {
  try {
    // Return empty stats since endpoint doesn't exist yet
    return {
      total_earnings: 0,
      total_spent: 0,
      pending_withdrawals: 0,
      completed_withdrawals: 0
    };
  } catch (error) {
    console.error('API Error (getWalletStats):', error);
    throw error;
  }
};

/**
 * Get wallet transaction history with pagination
 * GET /api/wallet/transactions?page=1&limit=20&type=all
 */
export const getTransactionHistory = async (params = {}) => {
  try {
    const { page = 1, limit = 20, type = 'all' } = params;
    const response = await apiClient.get('/api/wallet/transactions', {
      params: { page, limit, type }
    });
    return response.data;
  } catch (error) {
    console.error('API Error (getTransactionHistory):', error);
    throw error;
  }
};

// ============================================================================
// TOKEN PURCHASES (4 endpoints)
// ============================================================================

/**
 * Get token purchase packages
 * GET /api/tokens/packages
 */
export const getTokenPackages = async () => {
  try {
    const response = await apiClient.get('/api/tokens/packages');
    return response.data;
  } catch (error) {
    console.error('API Error (getTokenPackages):', error);
    throw error;
  }
};

/**
 * Purchase tokens via Stripe
 * POST /api/tokens/purchase/stripe
 */
export const purchaseTokensStripe = async (data) => {
  try {
    const response = await apiClient.post('/api/tokens/purchase/stripe', data);
    return response.data;
  } catch (error) {
    console.error('API Error (purchaseTokensStripe):', error);
    throw error;
  }
};

/**
 * Purchase tokens via Paystack
 * POST /api/tokens/purchase/paystack
 */
export const purchaseTokensPaystack = async (data) => {
  try {
    const response = await apiClient.post('/api/tokens/purchase/paystack', data);
    return response.data;
  } catch (error) {
    console.error('API Error (purchaseTokensPaystack):', error);
    throw error;
  }
};

/**
 * Verify token purchase after payment gateway callback
 * POST /api/tokens/verify
 */
export const verifyTokenPurchase = async (data) => {
  try {
    const response = await apiClient.post('/api/tokens/verify', data);
    return response.data;
  } catch (error) {
    console.error('API Error (verifyTokenPurchase):', error);
    throw error;
  }
};

// ============================================================================
// TICKETING SYSTEM (6 endpoints)
// ============================================================================

/**
 * Purchase ticket for watch session
 * POST /api/sessions/:sessionId/tickets/purchase
 */
export const purchaseTicket = async (data) => {
  try {
    const { session_id, ...requestBody } = data;
    const response = await apiClient.post(`/api/sessions/${session_id}/tickets/purchase`, requestBody);
    return response.data;
  } catch (error) {
    console.error('API Error (purchaseTicket):', error);
    throw error;
  }
};

/**
 * Gift ticket to another user
 * POST /api/tickets/gift
 */
export const giftTicket = async (data) => {
  try {
    const response = await apiClient.post('/api/tickets/gift', data);
    return response.data;
  } catch (error) {
    console.error('API Error (giftTicket):', error);
    throw error;
  }
};

/**
 * Get user's purchased tickets
 * GET /api/tickets/my-tickets
 */
export const getMyTickets = async () => {
  try {
    const response = await apiClient.get('/api/tickets/my-tickets');
    return response.data;
  } catch (error) {
    console.error('API Error (getMyTickets):', error);
    throw error;
  }
};

/**
 * Get tickets for a specific session (host only)
 * GET /api/tickets/session/:sessionId
 */
export const getSessionTickets = async (sessionId) => {
  try {
    const response = await apiClient.get(`/api/tickets/session/${sessionId}`);
    return response.data;
  } catch (error) {
    console.error('API Error (getSessionTickets):', error);
    throw error;
  }
};

/**
 * Get ticket sales summary (host only)
 * GET /api/tickets/sales-summary
 */
export const getTicketSalesSummary = async () => {
  try {
    const response = await apiClient.get('/api/tickets/sales-summary');
    return response.data;
  } catch (error) {
    console.error('API Error (getTicketSalesSummary):', error);
    throw error;
  }
};

/**
 * Verify ticket ownership
 * POST /api/tickets/verify
 */
export const verifyTicket = async (data) => {
  try {
    const response = await apiClient.post('/api/tickets/verify', data);
    return response.data;
  } catch (error) {
    console.error('API Error (verifyTicket):', error);
    throw error;
  }
};

// ============================================================================
// DONATIONS (3 endpoints)
// ============================================================================

/**
 * Send donation to host during session
 * POST /api/donations/send
 */
export const sendDonation = async (data) => {
  try {
    const response = await apiClient.post('/api/donations/send', data);
    return response.data;
  } catch (error) {
    console.error('API Error (sendDonation):', error);
    throw error;
  }
};

/**
 * Get donations received (host only)
 * GET /api/donations/received
 */
export const getDonationsReceived = async () => {
  try {
    const response = await apiClient.get('/api/donations/received');
    return response.data;
  } catch (error) {
    console.error('API Error (getDonationsReceived):', error);
    throw error;
  }
};

/**
 * Get donations sent by user
 * GET /api/donations/sent
 */
export const getDonationsSent = async () => {
  try {
    const response = await apiClient.get('/api/donations/sent');
    return response.data;
  } catch (error) {
    console.error('API Error (getDonationsSent):', error);
    throw error;
  }
};

// ============================================================================
// PAYMENT ACCOUNTS (8 endpoints)
// ============================================================================

/**
 * Get all payment accounts for current user
 * GET /api/payment-accounts
 */
export const getPaymentAccounts = async () => {
  try {
    const response = await apiClient.get('/api/payment-accounts');
    return response.data;
  } catch (error) {
    console.error('API Error (getPaymentAccounts):', error);
    throw error;
  }
};

/**
 * Add Paystack bank account
 * POST /api/payment-accounts/paystack
 */
export const addPaystackAccount = async (data) => {
  try {
    const response = await apiClient.post('/api/payment-accounts/paystack', data);
    return response.data;
  } catch (error) {
    console.error('API Error (addPaystackAccount):', error);
    throw error;
  }
};

/**
 * Verify Paystack account
 * POST /api/payment-accounts/paystack/verify
 */
export const verifyPaystackAccount = async (data) => {
  try {
    const response = await apiClient.post('/api/payment-accounts/paystack/verify', data);
    return response.data;
  } catch (error) {
    console.error('API Error (verifyPaystackAccount):', error);
    throw error;
  }
};

/**
 * Create Stripe Connect account
 * POST /api/payment-accounts/stripe/connect
 */
export const createStripeConnectAccount = async (data) => {
  try {
    const response = await apiClient.post('/api/payment-accounts/stripe/connect', data);
    return response.data;
  } catch (error) {
    console.error('API Error (createStripeConnectAccount):', error);
    throw error;
  }
};

/**
 * Get Stripe Connect account status
 * GET /api/payment-accounts/stripe/:accountId/status
 */
export const getStripeAccountStatus = async (accountId) => {
  try {
    const response = await apiClient.get(`/api/payment-accounts/stripe/${accountId}/status`);
    return response.data;
  } catch (error) {
    console.error('API Error (getStripeAccountStatus):', error);
    throw error;
  }
};

/**
 * Refresh Stripe onboarding link
 * POST /api/payment-accounts/stripe/:accountId/refresh-link
 */
export const refreshStripeOnboardingLink = async (accountId) => {
  try {
    const response = await apiClient.post(`/api/payment-accounts/stripe/${accountId}/refresh-link`);
    return response.data;
  } catch (error) {
    console.error('API Error (refreshStripeOnboardingLink):', error);
    throw error;
  }
};

/**
 * Set primary payment account
 * PUT /api/payment-accounts/:id/set-primary
 */
export const setPrimaryPaymentAccount = async (accountId) => {
  try {
    const response = await apiClient.put(`/api/payment-accounts/${accountId}/set-primary`);
    return response.data;
  } catch (error) {
    console.error('API Error (setPrimaryPaymentAccount):', error);
    throw error;
  }
};

/**
 * Delete payment account
 * DELETE /api/payment-accounts/:id
 */
export const deletePaymentAccount = async (accountId) => {
  try {
    const response = await apiClient.delete(`/api/payment-accounts/${accountId}`);
    return response.data;
  } catch (error) {
    console.error('API Error (deletePaymentAccount):', error);
    throw error;
  }
};

// ============================================================================
// PAYOUTS/WITHDRAWALS (7 endpoints)
// ============================================================================

/**
 * Request withdrawal
 * POST /api/withdrawals/request
 */
export const requestWithdrawal = async (data) => {
  try {
    const response = await apiClient.post('/api/withdrawals/request', data);
    return response.data;
  } catch (error) {
    console.error('API Error (requestWithdrawal):', error);
    throw error;
  }
};

/**
 * Get payout history
 * GET /api/payouts/history?page=1&limit=20
 */
export const getPayoutHistory = async (params = {}) => {
  try {
    const { page = 1, limit = 20 } = params;
    const response = await apiClient.get('/api/payouts/history', {
      params: { page, limit }
    });
    return response.data;
  } catch (error) {
    console.error('API Error (getPayoutHistory):', error);
    throw error;
  }
};

/**
 * Get payout statistics
 * GET /api/payouts/stats
 */
export const getPayoutStats = async () => {
  try {
    const response = await apiClient.get('/api/payouts/stats');
    return response.data;
  } catch (error) {
    console.error('API Error (getPayoutStats):', error);
    throw error;
  }
};

/**
 * Get single payout details
 * GET /api/payouts/:id
 */
export const getPayoutDetails = async (payoutId) => {
  try {
    const response = await apiClient.get(`/api/payouts/${payoutId}`);
    return response.data;
  } catch (error) {
    console.error('API Error (getPayoutDetails):', error);
    throw error;
  }
};

/**
 * Cancel pending payout (within 5 minutes)
 * POST /api/payouts/:id/cancel
 */
export const cancelPayout = async (payoutId) => {
  try {
    const response = await apiClient.post(`/api/payouts/${payoutId}/cancel`);
    return response.data;
  } catch (error) {
    console.error('API Error (cancelPayout):', error);
    throw error;
  }
};

/**
 * ADMIN: Approve pending payout (manual payouts)
 * POST /api/payouts/:id/approve
 */
export const approvePayout = async (payoutId) => {
  try {
    const response = await apiClient.post(`/api/payouts/${payoutId}/approve`);
    return response.data;
  } catch (error) {
    console.error('API Error (approvePayout):', error);
    throw error;
  }
};

/**
 * ADMIN: Mark payout as completed (manual payouts)
 * POST /api/payouts/:id/complete
 */
export const completePayout = async (payoutId, data) => {
  try {
    const response = await apiClient.post(`/api/payouts/${payoutId}/complete`, data);
    return response.data;
  } catch (error) {
    console.error('API Error (completePayout):', error);
    throw error;
  }
};

// ============================================================================
// KYC VERIFICATION (5 endpoints)
// ============================================================================

/**
 * Submit KYC verification
 * POST /api/kyc/submit (multipart/form-data)
 */
export const submitKYC = async (formData) => {
  try {
    const response = await apiClient.post('/api/kyc/submit', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return response.data;
  } catch (error) {
    console.error('API Error (submitKYC):', error);
    throw error;
  }
};

/**
 * Get KYC status for current user
 * GET /api/kyc/status
 */
export const getKYCStatus = async () => {
  try {
    const response = await apiClient.get('/api/kyc/status');
    return response.data;
  } catch (error) {
    console.error('API Error (getKYCStatus):', error);
    throw error;
  }
};

/**
 * ADMIN: Get all KYC submissions
 * GET /api/kyc/admin/submissions?status=pending&page=1&limit=20
 */
export const getKYCSubmissions = async (params = {}) => {
  try {
    const { status = 'pending', page = 1, limit = 20 } = params;
    const response = await apiClient.get('/api/kyc/admin/submissions', {
      params: { status, page, limit }
    });
    return response.data;
  } catch (error) {
    console.error('API Error (getKYCSubmissions):', error);
    throw error;
  }
};

/**
 * ADMIN: Approve KYC submission
 * POST /api/kyc/admin/:id/approve
 */
export const approveKYC = async (kycId) => {
  try {
    const response = await apiClient.post(`/api/kyc/admin/${kycId}/approve`);
    return response.data;
  } catch (error) {
    console.error('API Error (approveKYC):', error);
    throw error;
  }
};

/**
 * ADMIN: Reject KYC submission
 * POST /api/kyc/admin/:id/reject
 */
export const rejectKYC = async (kycId, data) => {
  try {
    const response = await apiClient.post(`/api/kyc/admin/${kycId}/reject`, data);
    return response.data;
  } catch (error) {
    console.error('API Error (rejectKYC):', error);
    throw error;
  }
};

// ============================================================================
// REFUNDS (3 endpoints)
// ============================================================================

/**
 * Request ticket refund
 * POST /api/refunds/request
 */
export const requestRefund = async (data) => {
  try {
    const response = await apiClient.post('/api/refunds/request', data);
    return response.data;
  } catch (error) {
    console.error('API Error (requestRefund):', error);
    throw error;
  }
};

/**
 * Get user's refund requests
 * GET /api/refunds/my-requests
 */
export const getMyRefundRequests = async () => {
  try {
    const response = await apiClient.get('/api/refunds/my-requests');
    return response.data;
  } catch (error) {
    console.error('API Error (getMyRefundRequests):', error);
    throw error;
  }
};

/**
 * ADMIN: Process refund request
 * POST /api/refunds/:id/process
 */
export const processRefund = async (refundId, data) => {
  try {
    const response = await apiClient.post(`/api/refunds/${refundId}/process`, data);
    return response.data;
  } catch (error) {
    console.error('API Error (processRefund):', error);
    throw error;
  }
};

// ============================================================================
// EARNINGS (2 endpoints)
// ============================================================================

/**
 * Get gateway earnings summary
 * GET /api/earnings/summary
 */
export const getEarningsSummary = async () => {
  try {
    const response = await apiClient.get('/api/earnings/summary');
    return response.data;
  } catch (error) {
    console.error('API Error (getEarningsSummary):', error);
    throw error;
  }
};

/**
 * Get detailed earnings breakdown
 * GET /api/earnings/breakdown
 */
export const getEarningsBreakdown = async () => {
  try {
    const response = await apiClient.get('/api/earnings/breakdown');
    return response.data;
  } catch (error) {
    console.error('API Error (getEarningsBreakdown):', error);
    throw error;
  }
};

// ============================================================================
// WEBHOOKS (Stripe & Paystack) - Backend Only
// ============================================================================
// These are called by payment gateways directly, not by frontend
// POST /api/webhooks/stripe
// POST /api/webhooks/paystack

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format currency amount with symbol
 */
export const formatCurrency = (amount, currency = 'USD') => {
  const symbols = {
    USD: '$',
    NGN: '₦',
    EUR: '€',
    GBP: '£'
  };
  
  const symbol = symbols[currency] || currency;
  const formattedAmount = parseFloat(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  
  return `${symbol}${formattedAmount}`;
};

/**
 * Format token amount
 * Tokens are stored as cents in database (185 = 1.85 tokens)
 * Divide by 100 to show actual tokens
 */
export const formatTokens = (amount) => {
  const actualTokens = (amount || 0) / 100;
  return `${actualTokens.toFixed(2)} tokens`;
};

/**
 * Get payment gateway display name
 */
export const getGatewayName = (gateway) => {
  const names = {
    stripe: 'Stripe',
    paystack: 'Paystack',
    tokens: 'Tokens'
  };
  return names[gateway] || gateway;
};

/**
 * Get transaction type display name
 */
export const getTransactionTypeName = (type) => {
  const names = {
    purchase: 'Token Purchase',
    ticket: 'Ticket Purchase',
    donation: 'Donation',
    refund: 'Refund',
    payout: 'Payout',
    commission: 'Platform Commission',
    earning: 'Earnings'
  };
  return names[type] || type;
};

/**
 * Get status badge color
 */
export const getStatusColor = (status) => {
  const colors = {
    pending: 'yellow',
    processing: 'blue',
    completed: 'green',
    failed: 'red',
    cancelled: 'gray',
    approved: 'green',
    rejected: 'red'
  };
  return colors[status] || 'gray';
};

// ============================================================================
// PAYMENT HISTORY EXPORT
// ============================================================================

/**
 * Export payment history as CSV file
 * GET /api/payments/export?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 */
export const exportPaymentHistory = async (startDate, endDate) => {
  try {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    
    const response = await apiClient.get(`/api/payments/export?${params.toString()}`, {
      responseType: 'blob', // Important for file download
    });
    
    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `wewatch_transactions_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    
    return { success: true };
  } catch (error) {
    console.error('API Error (exportPaymentHistory):', error);
    throw error;
  }
};

export default {
  // Wallet
  getWallet,
  getWalletStats,
  getTransactionHistory,
  
  // Tokens
  getTokenPackages,
  purchaseTokensStripe,
  purchaseTokensPaystack,
  verifyTokenPurchase,
  
  // Tickets
  purchaseTicket,
  giftTicket,
  getMyTickets,
  getSessionTickets,
  getTicketSalesSummary,
  verifyTicket,
  
  // Donations
  sendDonation,
  getDonationsReceived,
  getDonationsSent,
  
  // Payment Accounts
  getPaymentAccounts,
  addPaystackAccount,
  verifyPaystackAccount,
  createStripeConnectAccount,
  getStripeAccountStatus,
  refreshStripeOnboardingLink,
  setPrimaryPaymentAccount,
  deletePaymentAccount,
  
  // Payouts
  requestWithdrawal,
  getPayoutHistory,
  getPayoutStats,
  getPayoutDetails,
  cancelPayout,
  approvePayout,
  completePayout,
  
  // KYC
  submitKYC,
  getKYCStatus,
  getKYCSubmissions,
  approveKYC,
  rejectKYC,
  
  // Refunds
  requestRefund,
  getMyRefundRequests,
  processRefund,
  
  // Earnings
  getEarningsSummary,
  getEarningsBreakdown,
  
  // Export
  exportPaymentHistory,
  
  // Helpers
  formatCurrency,
  formatTokens,
  getGatewayName,
  getTransactionTypeName,
  getStatusColor
};
