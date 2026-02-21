/**
 * Payment Account Management
 * Add and manage Paystack and Stripe Connect payment accounts
 */

import React, { useState, useEffect } from 'react';
import { usePayment } from '../../contexts/PaymentContext';
import {
  addPaystackAccount,
  verifyPaystackAccount,
  createStripeConnectAccount,
  getStripeAccountStatus,
  refreshStripeOnboardingLink,
  setPrimaryPaymentAccount,
  deletePaymentAccount
} from '../../services/paymentApi';

const PaymentAccountManagement = () => {
  const { paymentAccounts, primaryAccount, fetchPaymentAccounts } = usePayment();
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [accountType, setAccountType] = useState('paystack'); // 'paystack' or 'stripe'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Paystack form fields
  const [paystackData, setPaystackData] = useState({
    bank_code: '',
    account_number: '',
    account_name: '',
    currency: 'NGN'
  });

  // Stripe form fields
  const [stripeData, setStripeData] = useState({
    country: 'US',
    currency: 'USD'
  });

  // Common Nigerian banks for Paystack
  const nigerianBanks = [
    { code: '044', name: 'Access Bank' },
    { code: '023', name: 'Citibank' },
    { code: '050', name: 'Ecobank' },
    { code: '011', name: 'First Bank' },
    { code: '214', name: 'First City Monument Bank' },
    { code: '058', name: 'Guaranty Trust Bank' },
    { code: '030', name: 'Heritage Bank' },
    { code: '301', name: 'Jaiz Bank' },
    { code: '082', name: 'Keystone Bank' },
    { code: '526', name: 'Parallex Bank' },
    { code: '076', name: 'Polaris Bank' },
    { code: '101', name: 'Providus Bank' },
    { code: '221', name: 'Stanbic IBTC Bank' },
    { code: '068', name: 'Standard Chartered Bank' },
    { code: '232', name: 'Sterling Bank' },
    { code: '032', name: 'Union Bank' },
    { code: '033', name: 'United Bank for Africa' },
    { code: '215', name: 'Unity Bank' },
    { code: '035', name: 'Wema Bank' },
    { code: '057', name: 'Zenith Bank' }
  ];

  const stripeCountries = [
    { code: 'US', name: 'United States', currency: 'USD' },
    { code: 'GB', name: 'United Kingdom', currency: 'GBP' },
    { code: 'CA', name: 'Canada', currency: 'CAD' },
    { code: 'AU', name: 'Australia', currency: 'AUD' },
    { code: 'DE', name: 'Germany', currency: 'EUR' },
    { code: 'FR', name: 'France', currency: 'EUR' },
    { code: 'IT', name: 'Italy', currency: 'EUR' },
    { code: 'ES', name: 'Spain', currency: 'EUR' }
  ];

  useEffect(() => {
    if (!showAddModal) {
      // Reset forms when modal closes
      setPaystackData({
        bank_code: '',
        account_number: '',
        account_name: '',
        currency: 'NGN'
      });
      setStripeData({
        country: 'US',
        currency: 'USD'
      });
      setError(null);
      setSuccess(null);
    }
  }, [showAddModal]);

  const handleAddPaystackAccount = async () => {
    if (!paystackData.bank_code || !paystackData.account_number) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // First, verify the account
      const verifyResponse = await verifyPaystackAccount({
        bank_code: paystackData.bank_code,
        account_number: paystackData.account_number
      });

      // Then add the account
      await addPaystackAccount({
        ...paystackData,
        account_name: verifyResponse.account_name,
        is_primary: paymentAccounts.length === 0 // First account is primary
      });

      setSuccess('Paystack account added successfully!');
      await fetchPaymentAccounts();
      
      setTimeout(() => {
        setShowAddModal(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to add Paystack account:', err);
      setError(err.response?.data?.error || 'Failed to add account');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateStripeConnect = async () => {
    if (!stripeData.country || !stripeData.currency) {
      setError('Please select country and currency');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await createStripeConnectAccount({
        ...stripeData,
        is_primary: paymentAccounts.length === 0
      });

      // Redirect to Stripe onboarding
      if (response.onboarding_url) {
        window.location.href = response.onboarding_url;
      }
    } catch (err) {
      console.error('Failed to create Stripe Connect:', err);
      setError(err.response?.data?.error || 'Failed to create Stripe account');
    } finally {
      setLoading(false);
    }
  };

  const handleSetPrimary = async (accountId) => {
    try {
      await setPrimaryPaymentAccount(accountId);
      setSuccess('Primary account updated!');
      await fetchPaymentAccounts();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to set primary account');
    }
  };

  const handleDeleteAccount = async (accountId) => {
    if (!confirm('Are you sure you want to delete this payment account?')) {
      return;
    }

    try {
      await deletePaymentAccount(accountId);
      setSuccess('Account deleted successfully');
      await fetchPaymentAccounts();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete account');
    }
  };

  const handleRefreshStripeLink = async (accountId) => {
    try {
      const response = await refreshStripeOnboardingLink(accountId);
      if (response.onboarding_url) {
        window.location.href = response.onboarding_url;
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to refresh link');
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">🏦 Payment Accounts</h1>
          <p className="text-gray-400 mt-1">Manage your withdrawal accounts</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-6 py-3 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white rounded-lg font-medium transition-all shadow-lg"
        >
          + Add Account
        </button>
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

      {/* Accounts List */}
      {paymentAccounts.length === 0 ? (
        <div className="bg-gray-800 rounded-xl p-12 text-center">
          <div className="text-6xl mb-4">🏦</div>
          <h3 className="text-2xl font-bold text-white mb-2">No Payment Accounts</h3>
          <p className="text-gray-400 mb-6">
            Add a payment account to receive withdrawals
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-6 py-3 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white rounded-lg font-medium transition-all"
          >
            Add Your First Account
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {paymentAccounts.map((account) => (
            <div
              key={account.id}
              className={`bg-gray-800 rounded-xl p-6 border-2 transition-all ${
                account.is_primary
                  ? 'border-green-500 shadow-lg shadow-green-500/20'
                  : 'border-gray-700'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  {/* Gateway Badge */}
                  <div className="flex items-center gap-3 mb-3">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      account.gateway === 'paystack'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-blue-500/20 text-blue-400'
                    }`}>
                      {account.gateway === 'paystack' ? '🏦 Paystack' : '💳 Stripe Connect'}
                    </span>
                    
                    {account.is_primary && (
                      <span className="px-3 py-1 rounded-full text-sm font-medium bg-yellow-500/20 text-yellow-400">
                        ⭐ Primary
                      </span>
                    )}
                    
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      account.is_verified
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {account.is_verified ? '✓ Verified' : '⏳ Pending'}
                    </span>
                  </div>

                  {/* Account Details */}
                  <h3 className="text-xl font-bold text-white mb-2">
                    {account.display_name}
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-400">Currency:</span>
                      <span className="text-white ml-2 font-medium">{account.currency}</span>
                    </div>
                    {account.gateway === 'paystack' && account.bank_name && (
                      <div>
                        <span className="text-gray-400">Bank:</span>
                        <span className="text-white ml-2 font-medium">{account.bank_name}</span>
                      </div>
                    )}
                    {account.created_at && (
                      <div>
                        <span className="text-gray-400">Added:</span>
                        <span className="text-white ml-2 font-medium">
                          {new Date(account.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 ml-4">
                  {!account.is_primary && account.is_verified && (
                    <button
                      onClick={() => handleSetPrimary(account.id)}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
                    >
                      Set as Primary
                    </button>
                  )}
                  
                  {account.gateway === 'stripe' && !account.is_verified && (
                    <button
                      onClick={() => handleRefreshStripeLink(account.id)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
                    >
                      Complete Setup
                    </button>
                  )}
                  
                  <button
                    onClick={() => handleDeleteAccount(account.id)}
                    className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-sm transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Account Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-gradient-to-r from-green-600 to-blue-600 p-6 rounded-t-2xl">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-3xl font-bold text-white mb-2">Add Payment Account</h2>
                  <p className="text-green-100">Choose your preferred withdrawal method</p>
                </div>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Account Type Selector */}
              <div>
                <label className="block text-gray-300 mb-3 font-medium">Select Account Type</label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setAccountType('paystack')}
                    className={`p-6 rounded-xl font-medium transition-all border-2 ${
                      accountType === 'paystack'
                        ? 'bg-green-600/20 border-green-500 text-white shadow-lg'
                        : 'bg-gray-750 border-gray-700 text-gray-300 hover:border-gray-600'
                    }`}
                  >
                    <div className="text-4xl mb-2">🏦</div>
                    <div className="font-bold mb-1">Paystack</div>
                    <div className="text-xs">For African bank accounts</div>
                  </button>
                  
                  <button
                    disabled
                    className="p-6 rounded-xl font-medium transition-all border-2 bg-gray-750 border-gray-700 text-gray-500 cursor-not-allowed opacity-60"
                  >
                    <div className="text-4xl mb-2">💳</div>
                    <div className="font-bold mb-1">Stripe Connect</div>
                    <div className="text-xs mb-2">For international accounts</div>
                    <div className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded mt-2">
                      Coming Soon
                    </div>
                  </button>
                </div>
              </div>

              {/* Paystack Form */}
              {accountType === 'paystack' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-gray-300 text-sm mb-2">Bank *</label>
                    <select
                      value={paystackData.bank_code}
                      onChange={(e) => setPaystackData({...paystackData, bank_code: e.target.value})}
                      className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-green-500 focus:outline-none"
                    >
                      <option value="">Select your bank</option>
                      {nigerianBanks.map(bank => (
                        <option key={bank.code} value={bank.code}>{bank.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-gray-300 text-sm mb-2">Account Number *</label>
                    <input
                      type="text"
                      value={paystackData.account_number}
                      onChange={(e) => setPaystackData({...paystackData, account_number: e.target.value})}
                      placeholder="0123456789"
                      maxLength={10}
                      className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-green-500 focus:outline-none"
                    />
                  </div>

                  <div className="bg-blue-500/20 border border-blue-500 rounded-lg p-4 text-sm text-blue-300">
                    ℹ️ We'll verify your account details automatically with your bank
                  </div>

                  <button
                    onClick={handleAddPaystackAccount}
                    disabled={loading}
                    className="w-full px-6 py-3 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                  >
                    {loading ? 'Verifying...' : 'Add Paystack Account'}
                  </button>
                </div>
              )}

              {/* Stripe Form */}
              {accountType === 'stripe' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-gray-300 text-sm mb-2">Country *</label>
                    <select
                      value={stripeData.country}
                      onChange={(e) => {
                        const country = stripeCountries.find(c => c.code === e.target.value);
                        setStripeData({
                          country: e.target.value,
                          currency: country?.currency || 'USD'
                        });
                      }}
                      className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                    >
                      {stripeCountries.map(country => (
                        <option key={country.code} value={country.code}>
                          {country.name} ({country.currency})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="bg-blue-500/20 border border-blue-500 rounded-lg p-4 text-sm text-blue-300 space-y-2">
                    <div className="font-bold">What happens next:</div>
                    <ol className="list-decimal list-inside space-y-1 ml-2">
                      <li>You'll be redirected to Stripe's secure onboarding</li>
                      <li>Provide your business and bank account details</li>
                      <li>Complete identity verification</li>
                      <li>Your account will be verified within 24-48 hours</li>
                    </ol>
                  </div>

                  <button
                    onClick={handleCreateStripeConnect}
                    disabled={loading}
                    className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                  >
                    {loading ? 'Creating...' : 'Continue to Stripe'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentAccountManagement;
