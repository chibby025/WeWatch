/**
 * Withdrawal Request Form
 * Request withdrawals from token balance or gateway earnings
 */

import React, { useState, useEffect } from 'react';
import { usePayment } from '../../contexts/PaymentContext';
import {
  requestWithdrawal,
  getPayoutHistory,
  cancelPayout,
  formatCurrency
} from '../../services/paymentApi';

const WithdrawalRequestForm = () => {
  const {
    wallet,
    earnings,
    paymentAccounts,
    primaryAccount,
    kycStatus,
    fetchWallet,
    fetchEarnings,
    fetchPaymentAccounts
  } = usePayment();

  const [source, setSource] = useState('token_balance'); // 'token_balance' or 'gateway_earnings'
  const [amount, setAmount] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  const [payoutHistory, setPayoutHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Minimum withdrawal amounts
  const MIN_WITHDRAWAL = {
    USD: 5,
    NGN: 2000,
    EUR: 5,
    GBP: 5
  };

  // Set default account when accounts load
  useEffect(() => {
    if (primaryAccount && !selectedAccountId) {
      setSelectedAccountId(primaryAccount.id);
    }
  }, [primaryAccount, selectedAccountId]);

  // Load payout history
  const loadPayoutHistory = async () => {
    try {
      setLoadingHistory(true);
      const response = await getPayoutHistory();
      setPayoutHistory(response.payouts || []);
    } catch (err) {
      console.error('Failed to load payout history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (showHistory) {
      loadPayoutHistory();
    }
  }, [showHistory]);

  // Get available balance based on source
  const getAvailableBalance = () => {
    if (source === 'token_balance') {
      return wallet?.balance || 0;
    } else {
      const selectedAccount = paymentAccounts.find(acc => acc.id === parseInt(selectedAccountId));
      if (!selectedAccount) return 0;

      if (selectedAccount.gateway === 'paystack') {
        return earnings?.paystack_earnings || 0;
      } else if (selectedAccount.gateway === 'stripe') {
        return earnings?.stripe_earnings || 0;
      }
    }
    return 0;
  };

  // Get currency for selected account
  const getAccountCurrency = () => {
    const account = paymentAccounts.find(acc => acc.id === parseInt(selectedAccountId));
    return account?.currency || 'USD';
  };

  // Get minimum withdrawal for currency
  const getMinWithdrawal = () => {
    const currency = getAccountCurrency();
    return MIN_WITHDRAWAL[currency] || 5;
  };

  // Validate form
  const canSubmit = () => {
    if (!selectedAccountId) return false;
    if (!amount || parseFloat(amount) <= 0) return false;
    if (parseFloat(amount) < getMinWithdrawal()) return false;
    if (parseFloat(amount) > getAvailableBalance()) return false;
    if (kycStatus?.status !== 'approved') return false;
    
    const account = paymentAccounts.find(acc => acc.id === parseInt(selectedAccountId));
    if (!account?.is_verified) return false;
    
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!canSubmit()) {
      setError('Please fill in all fields correctly');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const withdrawalAmount = source === 'token_balance' 
        ? parseFloat(amount) 
        : parseFloat(amount);

      await requestWithdrawal({
        amount: withdrawalAmount,
        source: source,
        payment_account_id: parseInt(selectedAccountId)
      });

      setSuccess(`Withdrawal request submitted! Funds will be processed within 2-3 business days.`);
      setAmount('');
      
      // Refresh data
      await fetchWallet();
      await fetchEarnings();
      if (showHistory) {
        await loadPayoutHistory();
      }

      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      console.error('Withdrawal failed:', err);
      setError(err.response?.data?.error || 'Failed to request withdrawal');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelPayout = async (payoutId) => {
    if (!confirm('Are you sure you want to cancel this withdrawal?')) {
      return;
    }

    try {
      await cancelPayout(payoutId);
      setSuccess('Withdrawal cancelled successfully');
      await loadPayoutHistory();
      await fetchWallet();
      await fetchEarnings();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to cancel withdrawal');
    }
  };

  const getStatusBadge = (status) => {
    const statusStyles = {
      pending: 'bg-yellow-500/20 text-yellow-400',
      processing: 'bg-blue-500/20 text-blue-400',
      completed: 'bg-green-500/20 text-green-400',
      cancelled: 'bg-gray-500/20 text-gray-400',
      failed: 'bg-red-500/20 text-red-400'
    };
    
    const statusEmojis = {
      pending: '⏳',
      processing: '🔄',
      completed: '✅',
      cancelled: '❌',
      failed: '⚠️'
    };

    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusStyles[status]}`}>
        {statusEmojis[status]} {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">💸 Request Withdrawal</h1>
        <p className="text-gray-400">Transfer your earnings to your bank account</p>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="bg-green-500/20 border border-green-500 rounded-lg p-4 text-green-400">
          ✅ {success}
        </div>
      )}
      {error && (
        <div className="bg-red-500/20 border border-red-500 rounded-lg p-4 text-red-400">
          ❌ {error}
        </div>
      )}

      {/* KYC Warning */}
      {kycStatus?.status !== 'approved' && (
        <div className="bg-yellow-500/20 border border-yellow-500 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="text-2xl">⚠️</div>
            <div className="flex-1">
              <h3 className="font-bold text-yellow-400 mb-1">KYC Verification Required</h3>
              <p className="text-yellow-300 text-sm">
                You must complete KYC verification before requesting withdrawals.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* No Accounts Warning */}
      {paymentAccounts.length === 0 && (
        <div className="bg-blue-500/20 border border-blue-500 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="text-2xl">ℹ️</div>
            <div className="flex-1">
              <h3 className="font-bold text-blue-400 mb-1">Add Payment Account</h3>
              <p className="text-blue-300 text-sm">
                You need to add a payment account before requesting withdrawals.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Withdrawal Form */}
      <form onSubmit={handleSubmit} className="bg-gray-800 rounded-xl p-6 space-y-6">
        {/* Source Selection */}
        <div>
          <label className="block text-gray-300 font-medium mb-3">Withdrawal Source</label>
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setSource('token_balance')}
              className={`p-4 rounded-xl font-medium transition-all border-2 ${
                source === 'token_balance'
                  ? 'bg-purple-600/20 border-purple-500 text-white'
                  : 'bg-gray-750 border-gray-700 text-gray-300 hover:border-gray-600'
              }`}
            >
              <div className="text-2xl mb-2">🪙</div>
              <div className="font-bold mb-1">Token Balance</div>
              <div className="text-2xl font-bold">{wallet?.balance || 0}</div>
            </button>
            
            <button
              type="button"
              onClick={() => setSource('gateway_earnings')}
              className={`p-4 rounded-xl font-medium transition-all border-2 ${
                source === 'gateway_earnings'
                  ? 'bg-green-600/20 border-green-500 text-white'
                  : 'bg-gray-750 border-gray-700 text-gray-300 hover:border-gray-600'
              }`}
            >
              <div className="text-2xl mb-2">💰</div>
              <div className="font-bold mb-1">Gateway Earnings</div>
              <div className="text-sm text-gray-400">
                Paystack: {formatCurrency(earnings?.paystack_earnings || 0, 'NGN')}
                <br />
                Stripe: {formatCurrency(earnings?.stripe_earnings || 0, 'USD')}
              </div>
            </button>
          </div>
        </div>

        {/* Payment Account Selection */}
        <div>
          <label className="block text-gray-300 font-medium mb-3">Payment Account *</label>
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-green-500 focus:outline-none"
            required
          >
            <option value="">Select account</option>
            {paymentAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.display_name} - {account.currency} 
                {account.is_primary ? ' (Primary)' : ''}
                {!account.is_verified ? ' (Unverified)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Amount Input */}
        <div>
          <label className="block text-gray-300 font-medium mb-3">
            Amount ({getAccountCurrency()}) *
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`Minimum ${formatCurrency(getMinWithdrawal(), getAccountCurrency())}`}
            step="0.01"
            min={getMinWithdrawal()}
            max={getAvailableBalance()}
            className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-green-500 focus:outline-none text-lg font-medium"
            required
          />
          <div className="flex justify-between mt-2 text-sm">
            <span className="text-gray-400">
              Available: {formatCurrency(getAvailableBalance(), getAccountCurrency())}
            </span>
            <button
              type="button"
              onClick={() => setAmount(getAvailableBalance().toString())}
              className="text-green-400 hover:text-green-300"
            >
              Use Max
            </button>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-blue-500/10 border border-blue-500/50 rounded-lg p-4 text-sm text-blue-300">
          <div className="font-bold mb-2">Withdrawal Information:</div>
          <ul className="space-y-1 ml-4 list-disc">
            <li>Minimum withdrawal: {formatCurrency(getMinWithdrawal(), getAccountCurrency())}</li>
            <li>Processing time: 2-3 business days</li>
            <li>No withdrawal fees for amounts above minimum</li>
            <li>KYC verification required for all withdrawals</li>
          </ul>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={!canSubmit() || loading}
          className="w-full px-6 py-4 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white rounded-lg font-bold text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
        >
          {loading ? 'Processing...' : 'Request Withdrawal'}
        </button>
      </form>

      {/* Payout History */}
      <div>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="flex items-center justify-between w-full bg-gray-800 rounded-xl p-4 text-white hover:bg-gray-750 transition-colors"
        >
          <span className="font-bold">📋 Withdrawal History</span>
          <span className="text-2xl">{showHistory ? '▼' : '▶'}</span>
        </button>

        {showHistory && (
          <div className="mt-4 bg-gray-800 rounded-xl overflow-hidden">
            {loadingHistory ? (
              <div className="p-8 text-center text-gray-400">Loading...</div>
            ) : payoutHistory.length === 0 ? (
              <div className="p-8 text-center text-gray-400">No withdrawal history yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-750">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Date</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Amount</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Account</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {payoutHistory.map((payout) => (
                      <tr key={payout.id} className="hover:bg-gray-750/50">
                        <td className="px-4 py-3 text-sm text-gray-300">
                          {new Date(payout.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-white">
                          {formatCurrency(payout.amount, payout.currency)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300">
                          {payout.payment_account_display_name}
                        </td>
                        <td className="px-4 py-3">
                          {getStatusBadge(payout.status)}
                        </td>
                        <td className="px-4 py-3">
                          {payout.status === 'pending' && (
                            <button
                              onClick={() => handleCancelPayout(payout.id)}
                              className="text-red-400 hover:text-red-300 text-sm font-medium"
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default WithdrawalRequestForm;
