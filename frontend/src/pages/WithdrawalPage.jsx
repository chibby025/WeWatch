import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ChevronLeft, AlertCircle, CheckCircle, Clock, Loader } from 'lucide-react';

const WithdrawalPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState(0);
  const [amount, setAmount] = useState('');
  const [bankAccounts, setBankAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [withdrawalHistory, setWithdrawalHistory] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [autoApproved, setAutoApproved] = useState(false);
  const [showNewAccountForm, setShowNewAccountForm] = useState(false);
  const [newAccount, setNewAccount] = useState({
    account_number: '',
    bank_code: '',
    account_name: '',
  });

  // Fetch balance and withdrawal history
  useEffect(() => {
    fetchBalance();
    fetchWithdrawalHistory();
    fetchBankAccounts();
  }, []);

  const fetchBalance = async () => {
    try {
      const response = await axios.get('/api/user/wallet');
      setBalance(response.data.gateway_earnings || 0);
    } catch (err) {
      console.error('Failed to fetch balance:', err);
    }
  };

  const fetchWithdrawalHistory = async () => {
    try {
      const response = await axios.get('/api/payouts/me');
      setWithdrawalHistory(response.data.payouts || []);
    } catch (err) {
      console.error('Failed to fetch withdrawal history:', err);
    }
  };

  const fetchBankAccounts = async () => {
    try {
      const response = await axios.get('/api/user/bank-accounts');
      setBankAccounts(response.data.accounts || []);
    } catch (err) {
      console.error('Failed to fetch bank accounts:', err);
    }
  };

  const handleQuickWithdraw = (quickAmount) => {
    if (quickAmount > balance) {
      setError(`Insufficient balance. Available: ₦${balance.toLocaleString()}`);
      return;
    }
    setAmount(quickAmount.toString());
    setError('');
  };

  const validateForm = () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return false;
    }

    const amountNum = parseFloat(amount);

    if (amountNum > balance) {
      setError(`Insufficient balance. Available: ₦${balance.toLocaleString()}`);
      return false;
    }

    if (!selectedAccount && !newAccount.account_number) {
      setError('Please select or add a bank account');
      return false;
    }

    return true;
  };

  const handleWithdraw = async () => {
    if (!validateForm()) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const accountDetails = selectedAccount
        ? bankAccounts.find(acc => acc.id === selectedAccount)
        : newAccount;

      const response = await axios.post('/api/payouts/request', {
        payout_type: 'gateway_earnings',
        payout_method: 'bank_transfer',
        amount: parseInt(amount),
        currency: 'NGN',
        details: {
          account_number: accountDetails.account_number,
          bank_code: accountDetails.bank_code,
          account_name: accountDetails.account_name,
        },
      });

      if (response.data.auto_approve) {
        setAutoApproved(true);
        setSuccess('✅ Withdrawal approved! Money will arrive in 24 hours.');
      } else {
        setSuccess('⏳ Withdrawal request sent for review. This usually takes 24 hours.');
      }

      // Reset form
      setAmount('');
      setSelectedAccount('');
      setNewAccount({ account_number: '', bank_code: '', account_name: '' });
      setShowNewAccountForm(false);

      // Refresh balance and history
      fetchBalance();
      fetchWithdrawalHistory();
      fetchBankAccounts();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to process withdrawal');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    return `₦${parseInt(value).toLocaleString()}`;
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'processing':
        return <Loader className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'failed':
      case 'rejected':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-green-900/20 text-green-400 border-green-700';
      case 'processing':
        return 'bg-blue-900/20 text-blue-400 border-blue-700';
      case 'pending':
        return 'bg-yellow-900/20 text-yellow-400 border-yellow-700';
      case 'failed':
      case 'rejected':
        return 'bg-red-900/20 text-red-400 border-red-700';
      default:
        return 'bg-gray-900/20 text-gray-400 border-gray-700';
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-900 rounded-lg transition"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-3xl font-bold">Withdraw Earnings</h1>
      </div>

      <div className="max-w-4xl mx-auto">
        {/* Balance Card */}
        <div className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 border border-blue-700/50 rounded-2xl p-8 mb-8">
          <p className="text-gray-300 text-sm mb-2">Available Balance</p>
          <h2 className="text-4xl font-bold mb-4">{formatCurrency(balance)}</h2>
          <p className="text-sm text-gray-400">
            Includes earnings from streams and subscriptions
          </p>
        </div>

        {/* Quick Withdraw Buttons */}
        <div className="mb-8">
          <p className="text-sm text-gray-400 mb-3">Quick withdraw amounts:</p>
          <div className="grid grid-cols-3 gap-3">
            {[5000, 10000, 20000].map((quickAmount) => (
              <button
                key={quickAmount}
                onClick={() => handleQuickWithdraw(quickAmount)}
                disabled={quickAmount > balance}
                className={`p-3 rounded-lg font-semibold transition ${
                  quickAmount > balance
                    ? 'bg-gray-900 text-gray-600 cursor-not-allowed opacity-50'
                    : 'bg-blue-900/40 border border-blue-700/50 hover:bg-blue-900/60 text-blue-300'
                }`}
              >
                {formatCurrency(quickAmount)}
              </button>
            ))}
          </div>
        </div>

        {/* Withdrawal Form */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8 mb-8">
          <h3 className="text-xl font-semibold mb-6">Request Withdrawal</h3>

          {/* Amount Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Withdrawal Amount
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                ₦
              </span>
              <input
                type="number"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setError('');
                }}
                placeholder="5000"
                className="w-full bg-gray-800/50 border border-gray-700 rounded-lg pl-8 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            {amount && (
              <p className="text-xs text-gray-400 mt-2">
                You will receive: {formatCurrency(amount)}
              </p>
            )}
          </div>

          {/* Bank Account Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Bank Account
            </label>

            {!showNewAccountForm && bankAccounts.length > 0 && (
              <div className="mb-4">
                {bankAccounts.map((account) => (
                  <label
                    key={account.id}
                    className="flex items-center p-3 bg-gray-800/50 border border-gray-700 rounded-lg mb-2 cursor-pointer hover:border-blue-500 transition"
                  >
                    <input
                      type="radio"
                      name="bank-account"
                      value={account.id}
                      checked={selectedAccount === account.id}
                      onChange={(e) => {
                        setSelectedAccount(e.target.value);
                        setShowNewAccountForm(false);
                      }}
                      className="w-4 h-4"
                    />
                    <div className="ml-3 flex-1">
                      <p className="text-sm font-medium text-white">
                        {account.account_name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {account.account_number} • {account.bank_code}
                      </p>
                    </div>
                  </label>
                ))}

                <button
                  onClick={() => {
                    setShowNewAccountForm(true);
                    setSelectedAccount('');
                  }}
                  className="w-full mt-3 p-3 border-2 border-dashed border-gray-700 rounded-lg text-gray-400 hover:text-gray-300 hover:border-gray-600 transition"
                >
                  + Add New Bank Account
                </button>
              </div>
            )}

            {showNewAccountForm && (
              <div className="space-y-4 p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
                <input
                  type="text"
                  placeholder="Account Name"
                  value={newAccount.account_name}
                  onChange={(e) =>
                    setNewAccount({ ...newAccount, account_name: e.target.value })
                  }
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                <input
                  type="text"
                  placeholder="Account Number"
                  value={newAccount.account_number}
                  onChange={(e) =>
                    setNewAccount({ ...newAccount, account_number: e.target.value })
                  }
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                <input
                  type="text"
                  placeholder="Bank Code (e.g., 058)"
                  value={newAccount.bank_code}
                  onChange={(e) =>
                    setNewAccount({ ...newAccount, bank_code: e.target.value })
                  }
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={() => setShowNewAccountForm(false)}
                  className="w-full p-2 bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 transition"
                >
                  Done
                </button>
              </div>
            )}
          </div>

          {/* Auto-Approval Info */}
          {amount && !error && (
            <div className="mb-6 p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg">
              <p className="text-sm text-blue-300">
                <span className="font-semibold">✅ Auto-Approved Withdrawal</span>
                <br />
                This amount will be automatically approved and processed instantly.
              </p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-900/20 border border-red-700/50 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="mb-6 p-4 bg-green-900/20 border border-green-700/50 rounded-lg flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-green-300">{success}</p>
            </div>
          )}

          {/* Withdraw Button */}
          <button
            onClick={handleWithdraw}
            disabled={loading || !amount || !selectedAccount && !newAccount.account_number}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                Processing...
              </>
            ) : (
              `Withdraw ${amount ? formatCurrency(amount) : ''}`
            )}
          </button>
        </div>

        {/* Withdrawal History */}
        {withdrawalHistory.length > 0 && (
          <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8">
            <h3 className="text-xl font-semibold mb-6">Recent Withdrawals</h3>

            <div className="space-y-3">
              {withdrawalHistory.map((payout) => (
                <div
                  key={payout.id}
                  className={`flex items-center justify-between p-4 rounded-lg border ${getStatusColor(
                    payout.status
                  )}`}
                >
                  <div className="flex items-center gap-3 flex-1">
                    {getStatusIcon(payout.status)}
                    <div>
                      <p className="font-medium">
                        {formatCurrency(payout.amount_value)}
                      </p>
                      <p className="text-xs opacity-75">
                        {new Date(payout.created_at).toLocaleDateString()} •{' '}
                        {payout.status.charAt(0).toUpperCase() +
                          payout.status.slice(1)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs">
                      {payout.gateway_transfer_id && `ID: ${payout.gateway_transfer_id}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No History */}
        {withdrawalHistory.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400">No withdrawal history yet</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default WithdrawalPage;
