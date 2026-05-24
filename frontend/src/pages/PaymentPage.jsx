import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BanknotesIcon,
  CreditCardIcon,
  ArrowDownTrayIcon,
  PlusIcon,
  TrashIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  CurrencyDollarIcon,
  GiftIcon,
} from '@heroicons/react/24/outline';
import {
  getWallet,
  getGatewayEarnings,
  getPaymentAccounts,
  addPaystackAccount,
  createStripeConnectAccount,
  setPrimaryAccount,
  deletePaymentAccount,
  requestWithdrawal,
  getMyPayouts,
  getPaystackBanks,
  purchaseTokens,
  exportPaymentHistory,
} from '../services/api';
import { getMyEventTickets, cancelRSVP } from '../services/paymentApi';
import DonateTokenToMember from '../components/payment/DonateTokenToMember';

const PaymentPage = () => {
  const navigate = useNavigate();
  
  // State for balance
  const [wallet, setWallet] = useState(null);
  const [earnings, setEarnings] = useState([]);
  const [totalEarnings, setTotalEarnings] = useState(0);
  
  // State for payment accounts
  const [paymentAccounts, setPaymentAccounts] = useState([]);
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [showPurchaseTokensModal, setShowPurchaseTokensModal] = useState(false);
  const [showDonateModal, setShowDonateModal] = useState(false);
  const [accountType, setAccountType] = useState('paystack'); // 'paystack' or 'stripe'
  
  // State for event tickets & RSVPs
  const [eventTickets, setEventTickets] = useState([]);
  const [eventRSVPs, setEventRSVPs] = useState([]);
  const [pastEvents, setPastEvents] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  
  // Token purchase state
  const [tokenAmount, setTokenAmount] = useState('');
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  
  // Paystack form state
  const [paystackCountry, setPaystackCountry] = useState('NG');
  const [banks, setBanks] = useState([]);
  const [selectedBank, setSelectedBank] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  
  // Stripe form state
  const [stripeCountry, setStripeCountry] = useState('US');
  
  // State for withdrawal
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawSource, setWithdrawSource] = useState('tokens'); // 'tokens' or 'earnings'
  const [selectedAccountId, setSelectedAccountId] = useState('');
  
  // State for transaction history
  const [payouts, setPayouts] = useState([]);
  
  // State for CSV export
  const [exportDateRange, setExportDateRange] = useState('30'); // Default: last 30 days
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  
  // Loading and error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Currency conversion rates (1 token = ₦165 purchase, ₦122 withdrawal at 75/25 split)
  const TOKEN_TO_NGN = 165.00; // Purchase rate
  const TOKEN_WITHDRAWAL_RATE = 122.00; // Withdrawal rate (75% of net after Paystack fees)
  const DEFAULT_CURRENCY = 'NGN';

  useEffect(() => {
    loadData();
  }, []);

  // WebSocket connection for withdrawal status updates
  useEffect(() => {
    const wsToken = localStorage.getItem('ws_token');
    if (!wsToken) return;

    const wsUrl = `ws://localhost:8080/ws/lobby?token=${wsToken}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        // Handle withdrawal failure notifications
        if (message.type === 'withdrawal_failed') {
          const { payout_id, error, refunded, message: errorMessage } = message.data;
          
          // Show error notification
          setError(`Withdrawal failed: ${error}. ${refunded ? 'Your funds have been refunded.' : ''}`);
          
          // Reload data to show updated status
          loadData();
          
          // Auto-dismiss after 10 seconds
          setTimeout(() => setError(''), 10000);
        }
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, []);

  // Load banks when modal opens with Paystack selected
  useEffect(() => {
    if (showAddAccountModal && accountType === 'paystack') {
      loadBanks(paystackCountry);
    }
  }, [showAddAccountModal, accountType]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Load payment accounts (required)
      const accountsData = await getPaymentAccounts();
      // Security: Account data should not be logged (contains masked but still sensitive info)
      setPaymentAccounts(accountsData.accounts || []);
      
      // Load optional data (may not be implemented yet)
      try {
        const walletData = await getWallet();
        setWallet(walletData.wallet || { token_balance: 0 });
      } catch (err) {
        // Create default wallet state if API not ready
        setWallet({ token_balance: 0, lifetime_earned: 0, lifetime_spent: 0 });
      }
      
      try {
        const earningsData = await getGatewayEarnings();
        setEarnings(earningsData.earnings || []);
        const total = (earningsData.earnings || [])
          .filter(e => !e.is_withdrawn)
          .reduce((sum, e) => sum + parseFloat(e.net_amount || 0), 0);
        setTotalEarnings(total);
      } catch (err) {
        // Gateway earnings tracking not implemented yet
        setEarnings([]);
        setTotalEarnings(0);
      }
      
      try {
        const payoutsData = await getMyPayouts();
        // Security: Do not log payout data as it contains sensitive account information
        setPayouts(payoutsData.payouts || []);
      } catch (err) {
        // Payouts history not implemented yet
        setPayouts([]);
      }
      
      // Load event tickets and RSVPs
      try {
        setTicketsLoading(true);
        const ticketsData = await getMyEventTickets();
        console.log('🎟️ [PaymentPage] Loaded event tickets:', ticketsData);
        setEventTickets(ticketsData.upcoming_tickets || []);
        setEventRSVPs(ticketsData.upcoming_rsvps || []);
        setPastEvents(ticketsData.past_events || []);
      } catch (err) {
        console.error('❌ Failed to load event tickets:', err);
        setEventTickets([]);
        setEventRSVPs([]);
        setPastEvents([]);
      } finally {
        setTicketsLoading(false);
      }
      
    } catch (err) {
      console.error('Error loading payment data:', err);
      setError('Failed to load payment accounts. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  };

  const loadBanks = async (country) => {
    try {
      const response = await getPaystackBanks(country);
      setBanks(response.banks || []);
    } catch (err) {
      setError('Failed to load banks list');
    }
  };

  const handleAddAccount = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    
    try {
      if (accountType === 'paystack') {
        // Add Paystack account
        const response = await addPaystackAccount({
          bank_code: selectedBank,
          account_number: accountNumber,
          currency: 'NGN', // Nigeria Naira
        });
        
        setSuccessMessage('Bank account added successfully!');
        setShowAddAccountModal(false);
        
        // Reset form
        setSelectedBank('');
        setAccountNumber('');
        setAccountName('');
        
        // Reload accounts
        loadData();
      } else {
        // Create Stripe Connect account
        const response = await createStripeConnectAccount(stripeCountry);
        
        if (response.onboarding_url) {
          // Redirect to Stripe onboarding
          window.location.href = response.onboarding_url;
        } else {
          setError('Failed to create Stripe account');
        }
      }
    } catch (err) {
      console.error('Error adding account:', err);
      setError(err.response?.data?.error || 'Failed to add account');
    }
  };

  const handleSetPrimary = async (accountId) => {
    try {
      await setPrimaryAccount(accountId);
      setSuccessMessage('Primary account updated!');
      loadData();
    } catch (err) {
      console.error('Error setting primary account:', err);
      setError('Failed to set primary account');
    }
  };

  const handleDeleteAccount = async (accountId) => {
    if (!window.confirm('Are you sure you want to delete this account?')) return;
    
    try {
      await deletePaymentAccount(accountId);
      setSuccessMessage('Account deleted successfully!');
      loadData();
    } catch (err) {
      console.error('Error deleting account:', err);
      setError('Failed to delete account');
    }
  };

  const handleWithdraw = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    
    console.log('🔵 [Withdraw] Button clicked');
    console.log('🔍 [Withdraw] withdrawSource:', withdrawSource);
    console.log('🔍 [Withdraw] withdrawAmount:', withdrawAmount);
    console.log('🔍 [Withdraw] selectedAccountId:', selectedAccountId);
    console.log('🔍 [Withdraw] wallet:', wallet);
    console.log('🔍 [Withdraw] totalEarnings:', totalEarnings);
    
    try {
      const amount = parseFloat(withdrawAmount);
      
      if (amount <= 0) {
        setError('Amount must be greater than 0');
        return;
      }
      
      // Find selected account
      const account = paymentAccounts.find(a => a.id === parseInt(selectedAccountId));
      if (!account) {
        setError('Please select a payment account');
        return;
      }
      
      console.log('✅ [Withdraw] Validation passed, account:', account);
      
      // Validate balance
      if (withdrawSource === 'tokens') {
        // wallet.token_balance is in cents (121 = 1.21 tokens)
        const availableTokens = (wallet?.token_balance || 0) / 100;
        console.log('💰 [Withdraw] Available tokens:', availableTokens);
        
        if (amount > availableTokens) {
          setError(`Insufficient token balance. Available: ${availableTokens.toFixed(2)} tokens`);
          return;
        }
        
        // Convert tokens to NGN for withdrawal (1 token = ₦122 withdrawal rate)
        const amountInNGN = amount * TOKEN_WITHDRAWAL_RATE;
        console.log(`🔄 [Withdraw] Converting ${amount} tokens to ₦${amountInNGN}`);
        
        const withdrawalRequest = {
          payment_account_id: parseInt(selectedAccountId),
          amount: amountInNGN,
          source_type: 'tokens',
          currency: account.currency || 'NGN'
        };
        
        console.log('📤 [Withdraw] Sending request:', withdrawalRequest);
        
        const response = await requestWithdrawal(withdrawalRequest);
        
        console.log('✅ [Withdraw] Response received:', response);
        
        // Calculate estimated arrival time (24 hours from now)
        const arrivalTime = new Date();
        arrivalTime.setHours(arrivalTime.getHours() + 24);
        const formattedTime = arrivalTime.toLocaleString('en-US', { 
          month: 'short', 
          day: 'numeric', 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true 
        });
        
        setSuccessMessage(`Withdrawal submitted! ₦${amountInNGN.toLocaleString()} will arrive by ${formattedTime} (24-hour processing time).`);
        setShowWithdrawModal(false);
        setWithdrawAmount('');
        
        // Reload data
        setTimeout(() => loadData(), 2000);
        return;
      }
      
      // Gateway earnings withdrawal
      if (amount > totalEarnings) {
        setError(`Insufficient earnings balance. Available: ₦${totalEarnings.toLocaleString()}`);
        return;
      }
      
      console.log(`📤 [Withdraw] Sending gateway earnings withdrawal: ₦${amount}`);
      
      const response = await requestWithdrawal({
        payment_account_id: parseInt(selectedAccountId),
        amount: amount,
        source_type: 'gateway_earnings',
        currency: account.currency
      });
      
      console.log('✅ [Withdraw] Response received:', response);
      
      // Calculate estimated arrival time (24 hours from now)
      const arrivalTime = new Date();
      arrivalTime.setHours(arrivalTime.getHours() + 24);
      const formattedTime = arrivalTime.toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
      
      setSuccessMessage(`Withdrawal submitted! Funds will arrive by ${formattedTime} (24-hour processing time).`);
      setShowWithdrawModal(false);
      setWithdrawAmount('');
      
      // Reload data
      setTimeout(() => loadData(), 2000);
      
    } catch (err) {
      console.error('❌ [Withdraw] Error:', err);
      console.error('❌ [Withdraw] Error response:', err.response?.data);
      
      // Make error messages user-friendly
      let errorMessage = 'Withdrawal failed. Please try again.';
      const backendError = err.response?.data?.error || err.response?.data?.message;
      
      if (backendError) {
        if (backendError.includes('minimum withdrawal')) {
          errorMessage = 'Withdrawal amount is too low. Please enter a higher amount.';
        } else if (backendError.includes('Daily withdrawal limit')) {
          errorMessage = 'You\'ve reached your daily withdrawal limit. Please try again tomorrow.';
        } else if (backendError.includes('Insufficient')) {
          errorMessage = 'Insufficient balance for this withdrawal.';
        } else if (backendError.includes('not verified')) {
          errorMessage = 'Please verify your bank account before withdrawing.';
        } else if (backendError.includes('Currency mismatch')) {
          errorMessage = 'Currency mismatch. Please check your bank account settings.';
        } else {
          // Show original message if it's user-friendly enough
          errorMessage = backendError;
        }
      }
      
      setError(errorMessage);
    }
  };

  const handleExportTransactions = async () => {
    try {
      setError('');
      
      // Calculate date range based on selection
      let startDate, endDate;
      const today = new Date();
      endDate = today.toISOString().split('T')[0];
      
      if (exportDateRange === 'custom') {
        if (!customStartDate || !customEndDate) {
          setError('Please select both start and end dates for custom range');
          return;
        }
        startDate = customStartDate;
        endDate = customEndDate;
      } else {
        const daysAgo = parseInt(exportDateRange);
        const startDateObj = new Date();
        startDateObj.setDate(startDateObj.getDate() - daysAgo);
        startDate = startDateObj.toISOString().split('T')[0];
      }
      
      // Call export API (will trigger download)
      await exportPaymentHistory(startDate, endDate);
      setSuccessMessage('Transaction history exported successfully!');
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(''), 3000);
      
    } catch (err) {
      console.error('Error exporting transactions:', err);
      setError(err.response?.data?.error || 'Failed to export transaction history');
    }
  };

  const handleCancelRSVP = async (eventId, ticketId) => {
    if (!window.confirm('Are you sure you want to cancel this RSVP?')) {
      return;
    }

    try {
      await cancelRSVP(eventId);
      setSuccessMessage('RSVP cancelled successfully!');
      
      // Remove from local state
      setEventRSVPs(prev => prev.filter(rsvp => rsvp.id !== ticketId));
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('Error cancelling RSVP:', err);
      setError(err.response?.data?.error || 'Failed to cancel RSVP');
      setTimeout(() => setError(''), 5000);
    }
  };


  const handlePurchaseTokens = async () => {
    console.log('🔵 [Purchase] Button clicked, tokenAmount:', tokenAmount);
    
    if (!tokenAmount || parseInt(tokenAmount) < 165) {
      console.log('❌ [Purchase] Amount validation failed:', tokenAmount);
      setError('Minimum purchase is ₦165 (1 token)');
      return;
    }

    console.log('🔍 [Purchase] Checking PaystackPop:', typeof window.PaystackPop);
    if (typeof window.PaystackPop === 'undefined') {
      console.log('❌ [Purchase] PaystackPop not loaded');
      setError('Payment system not loaded. Please refresh the page.');
      return;
    }

    console.log('✅ [Purchase] PaystackPop is available');
    setPurchaseLoading(true);
    setError('');

    try {
      const paystackKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;
      if (!paystackKey) {
        setError('Payment system not configured. Please contact support.');
        setPurchaseLoading(false);
        return;
      }
      const userEmail = localStorage.getItem('user_email') || 'user@wewatch.com';
      const amountInKobo = parseInt(tokenAmount) * 100;
      const reference = 'TOKEN_' + Math.floor((Math.random() * 1000000000) + 1);
      
      console.log('💳 [Purchase] Paystack config:', {
        key: paystackKey.substring(0, 10) + '...',
        email: userEmail,
        amount: amountInKobo,
        currency: 'NGN',
        ref: reference
      });

      // Initialize Paystack payment with split code
      const handler = window.PaystackPop.setup({
        key: paystackKey,
        email: userEmail,
        amount: amountInKobo,
        currency: 'NGN',
        ref: reference,
        split_code: import.meta.env.VITE_PAYSTACK_SPLIT_CODE, // 75/25 split: Reserve (75%) + Revenue (25%)
        callback: function(response) {
          console.log('✅ [Purchase] Payment successful, reference:', response.reference);
          console.log('🔄 [Purchase] Verifying payment with backend...');
          
          // Verify payment and add tokens (use promise-based approach)
          purchaseTokens(parseInt(tokenAmount), response.reference, 'NGN')
            .then(result => {
              console.log('✅ [Purchase] Backend verification successful:', result);
              setSuccessMessage(`Successfully purchased ${result.tokens_added} tokens! New balance: ${result.new_balance_display}`);
              setShowPurchaseTokensModal(false);
              setTokenAmount('');
              loadData(); // Reload wallet balance
              setPurchaseLoading(false);
            })
            .catch(err => {
              console.error('❌ [Purchase] Backend verification failed:', err);
              setError(err.response?.data?.error || 'Failed to verify payment');
              setPurchaseLoading(false);
            });
        },
        onClose: function() {
          console.log('⚠️ [Purchase] Payment popup closed');
          setPurchaseLoading(false);
        }
      });
      
      console.log('🚀 [Purchase] Opening Paystack iframe...');
      handler.openIframe();
      console.log('✅ [Purchase] Iframe opened successfully');
    } catch (err) {
      console.error('❌ [Purchase] Error initializing payment:', err);
      setError('Failed to initialize payment: ' + err.message);
      setPurchaseLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      pending: { icon: ClockIcon, color: 'yellow', text: 'Pending' },
      processing: { icon: ClockIcon, color: 'blue', text: 'Processing by Paystack' },
      completed: { icon: CheckCircleIcon, color: 'green', text: 'Completed' },
      failed: { icon: XCircleIcon, color: 'red', text: 'Failed' },
    };
    
    const config = statusConfig[status] || statusConfig.pending;
    const Icon = config.icon;
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-${config.color}-100 text-${config.color}-800`}>
        <Icon className="w-4 h-4 mr-1" />
        {config.text}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading payment data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate(-1)}
                className="text-gray-600 hover:text-gray-900 p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Go back"
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Payment & Earnings</h1>
                <p className="text-sm text-gray-600 mt-1">Manage your balance, bank accounts, and withdrawals</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Alert Messages */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded relative flex items-center">
            <ExclamationTriangleIcon className="h-5 w-5 mr-2" />
            {error}
            <button onClick={() => setError('')} className="absolute top-0 right-0 px-4 py-3">✕</button>
          </div>
        )}
        
        {successMessage && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded relative flex items-center">
            <CheckCircleIcon className="h-5 w-5 mr-2" />
            {successMessage}
            <button onClick={() => setSuccessMessage('')} className="absolute top-0 right-0 px-4 py-3">✕</button>
          </div>
        )}

        {/* Balance Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Tokens Balance */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-600">Token Balance</h3>
              <CurrencyDollarIcon className="h-6 w-6 text-blue-600" />
            </div>
            <p className="text-3xl font-bold text-gray-900">{((wallet?.token_balance || 0) / 100).toFixed(2)} 🪙</p>
            <p className="text-sm text-gray-500 mt-1">
              Platform currency for tickets & donations
            </p>
            <button
              onClick={() => setShowPurchaseTokensModal(true)}
              className="mt-4 w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center justify-center text-sm"
            >
              <PlusIcon className="h-4 w-4 mr-1" />
              Buy Tokens
            </button>
            <button
              onClick={() => setShowDonateModal(true)}
              className="mt-2 w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-2 rounded-lg hover:from-purple-700 hover:to-pink-700 flex items-center justify-center text-sm"
            >
              <GiftIcon className="h-4 w-4 mr-1" />
              Donate Tokens
            </button>
          </div>

          {/* Gateway Earnings */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-600">Gateway Earnings</h3>
              <CreditCardIcon className="h-6 w-6 text-green-600" />
            </div>
            <p className="text-3xl font-bold text-gray-900">₦{totalEarnings.toLocaleString()}</p>
            <p className="text-sm text-gray-500 mt-1">Available to withdraw</p>
          </div>

          {/* Total Available to Withdraw */}
          <div className="bg-white rounded-lg shadow p-6 bg-gradient-to-br from-green-500 to-green-600 text-white">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium">Available to Withdraw</h3>
              <ArrowDownTrayIcon className="h-6 w-6" />
            </div>
            <p className="text-3xl font-bold">
              ₦{(
                ((wallet?.token_balance || 0) / 100 * TOKEN_WITHDRAWAL_RATE) + totalEarnings
              ).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </p>
            <p className="text-xs mt-1 opacity-90">
              {((wallet?.token_balance || 0) / 100).toFixed(2)} tokens (₦{((wallet?.token_balance || 0) / 100 * TOKEN_WITHDRAWAL_RATE).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}) + Gateway ₦{totalEarnings.toLocaleString()}
            </p>
            <button
              onClick={() => setShowWithdrawModal(true)}
              disabled={((wallet?.token_balance || 0) === 0) && (totalEarnings === 0)}
              className="mt-3 w-full bg-white text-green-600 px-4 py-2 rounded-lg font-medium hover:bg-green-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {(((wallet?.token_balance || 0) === 0) && (totalEarnings === 0)) ? 'No Funds Available' : 'Withdraw Funds'}
            </button>
          </div>
        </div>

        {/* My Tickets Section */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">🎟️ My Tickets</h2>
            <p className="text-sm text-gray-600 mt-1">Paid tickets for upcoming events</p>
          </div>
          <div className="p-6">
            {ticketsLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
                <p className="text-gray-600 mt-4">Loading tickets...</p>
              </div>
            ) : eventTickets.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg">
                <p className="text-gray-500">No tickets purchased yet</p>
                <p className="text-sm text-gray-400 mt-2">Browse rooms to find paid events</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {eventTickets.map((ticket) => (
                  <div key={ticket.id} className="border rounded-lg overflow-hidden hover:shadow-lg transition-shadow">
                    {/* Ticket Image */}
                    <div className="relative h-48 bg-gradient-to-br from-purple-500 to-blue-600">
                      <img 
                        src={ticket.ticket_image} 
                        alt="Ticket" 
                        className="w-full h-full object-cover opacity-90"
                      />
                      {ticket.is_early_bird && (
                        <div className="absolute top-2 right-2 bg-yellow-400 text-yellow-900 px-2 py-1 rounded-full text-xs font-bold">
                          🎉 Early Bird
                        </div>
                      )}
                      {ticket.is_gift && ticket.gifted_by && (
                        <div className="absolute top-2 left-2 bg-pink-500 text-white px-2 py-1 rounded-full text-xs font-bold">
                          🎁 Gift from @{ticket.gifted_by.username}
                        </div>
                      )}
                      {ticket.is_starting_soon && (
                        <div className="absolute bottom-2 left-2 bg-red-500 text-white px-3 py-1 rounded-full text-xs font-bold animate-pulse">
                          ⏰ Starting Soon!
                        </div>
                      )}
                    </div>

                    {/* Ticket Details */}
                    <div className="p-4">
                      <h3 className="font-bold text-lg text-gray-900 mb-1">{ticket.event.title}</h3>
                      <p className="text-sm text-gray-600 mb-2">{ticket.event.room_name || `Room #${ticket.event.room_id}`}</p>
                      
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center text-gray-700">
                          <ClockIcon className="h-4 w-4 mr-2" />
                          {new Date(ticket.event.start_time).toLocaleString()}
                        </div>
                        
                        <div className="flex items-center text-green-600 font-medium">
                          <span className="mr-2">💰</span>
                          {ticket.ticket_price_tokens / 100} tokens
                          {ticket.is_early_bird && (
                            <span className="ml-2 text-xs text-yellow-600">(Early Bird Savings!)</span>
                          )}
                        </div>
                        
                        <div className="flex items-center text-gray-600">
                          <span className="mr-2">📅</span>
                          Purchased {new Date(ticket.created_at).toLocaleDateString()}
                        </div>
                      </div>

                      <button
                        onClick={() => navigate(`/rooms/${ticket.event.room_id}`)}
                        className="mt-4 w-full bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg font-medium transition-colors"
                      >
                        View Event
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* My RSVPs Section */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">✅ My RSVPs</h2>
            <p className="text-sm text-gray-600 mt-1">Free event reservations</p>
          </div>
          <div className="p-6">
            {ticketsLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-gray-600 mt-4">Loading RSVPs...</p>
              </div>
            ) : eventRSVPs.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg">
                <p className="text-gray-500">No RSVPs yet</p>
                <p className="text-sm text-gray-400 mt-2">RSVP to free events in rooms you join</p>
              </div>
            ) : (
              <div className="space-y-4">
                {eventRSVPs.map((rsvp) => (
                  <div key={rsvp.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-bold text-lg text-gray-900">{rsvp.event.title}</h3>
                        <p className="text-sm text-gray-600">{rsvp.event.room_name || `Room #${rsvp.event.room_id}`}</p>
                        
                        <div className="mt-3 space-y-2 text-sm">
                          <div className="flex items-center text-gray-700">
                            <ClockIcon className="h-4 w-4 mr-2" />
                            {new Date(rsvp.event.start_time).toLocaleString()}
                          </div>
                          
                          <div className="flex items-center text-green-600 font-medium">
                            <CheckCircleIcon className="h-4 w-4 mr-2" />
                            Free Event
                          </div>
                          
                          <div className="flex items-center text-gray-600">
                            <span className="mr-2">📅</span>
                            RSVP'd {new Date(rsvp.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>

                      {/* Ticket Preview Image */}
                      <div className="ml-4">
                        <img 
                          src={rsvp.ticket_image} 
                          alt="Event Type" 
                          className="w-20 h-20 object-cover rounded-lg"
                        />
                      </div>
                    </div>

                    <div className="mt-4 flex gap-3">
                      <button
                        onClick={() => navigate(`/rooms/${rsvp.event.room_id}`)}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium transition-colors"
                      >
                        View Event
                      </button>
                      
                      {rsvp.can_cancel && (
                        <button
                          onClick={() => handleCancelRSVP(rsvp.scheduled_event_id, rsvp.id)}
                          className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg font-medium transition-colors"
                        >
                          Cancel RSVP
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Payment Accounts */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Bank Accounts</h2>
            <button
              onClick={() => {
                setShowAddAccountModal(true);
                if (accountType === 'paystack') {
                  loadBanks(paystackCountry);
                }
              }}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <PlusIcon className="h-5 w-5 mr-2" />
              Add Account
            </button>
          </div>
          
          <div className="p-6">
            {paymentAccounts.length === 0 ? (
              <div className="text-center py-8">
                <CreditCardIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">No bank accounts linked yet</p>
                <p className="text-sm text-gray-500 mt-1">Add a bank account to receive withdrawals</p>
              </div>
            ) : (
              <div className="space-y-4">
                {paymentAccounts.map((account) => (
                  <div
                    key={account.id}
                    className={`border rounded-lg p-4 ${account.is_primary ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <h3 className="font-medium text-gray-900">{account.account_name || account.bank_name}</h3>
                          {account.is_primary && (
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                              Primary
                            </span>
                          )}
                          {account.is_verified ? (
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                              <CheckCircleIcon className="h-3 w-3 mr-1" />
                              Verified
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                              <ClockIcon className="h-3 w-3 mr-1" />
                              Pending
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          {account.gateway === 'paystack' 
                            ? `${account.bank_name} - ${account.masked_account_number}`
                            : `Stripe Connect - ${account.currency}`
                          }
                        </p>
                        {account.last_used_at && (
                          <p className="text-xs text-gray-500 mt-1">
                            Last used: {new Date(account.last_used_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      
                      <div className="flex flex-col items-end space-y-2">
                        {!account.is_primary && account.is_verified && (
                          <button
                            onClick={() => handleSetPrimary(account.id)}
                            className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded"
                          >
                            Set Primary
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteAccount(account.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Transaction History */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Transaction History</h2>
              
              {/* Export Button */}
              <button
                onClick={handleExportTransactions}
                className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export CSV
              </button>
            </div>
            
            {/* Date Range Selector */}
            <div className="mt-4 flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <label className="text-sm text-gray-600">Date Range:</label>
                <select
                  value={exportDateRange}
                  onChange={(e) => setExportDateRange(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="7">Last 7 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="90">Last 90 days</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              
              {exportDateRange === 'custom' && (
                <>
                  <div className="flex items-center space-x-2">
                    <label className="text-sm text-gray-600">From:</label>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      max={customEndDate || new Date().toISOString().split('T')[0]}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <label className="text-sm text-gray-600">To:</label>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      min={customStartDate}
                      max={new Date().toISOString().split('T')[0]}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Account</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Gateway</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {payouts.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                      No transactions yet
                    </td>
                  </tr>
                ) : (
                  payouts.map((payout) => (
                    <tr key={payout.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(payout.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {payout.payout_type === 'tokens' ? (
                          payout.amount_tokens != null 
                            ? `${(payout.amount_tokens / 100).toFixed(2)} tokens (₦${((payout.amount_tokens / 100) * TOKEN_WITHDRAWAL_RATE).toFixed(2)})`
                            : 'N/A'
                        ) : (
                          payout.amount_value != null
                            ? `${payout.amount_currency || 'NGN'} ${parseFloat(payout.amount_value).toFixed(2)}`
                            : 'N/A'
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {payout.payout_type === 'tokens' ? 'Tokens' : 'Gateway Earnings'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {payout.payment_account?.account_name || payout.payment_account?.bank_name || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(payout.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 capitalize">
                        {payout.payment_account?.gateway || 'N/A'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add Account Modal */}
      {showAddAccountModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Add Bank Account</h3>
              <button
                onClick={() => setShowAddAccountModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            {/* Account Type Selector */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Account Type</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    setAccountType('paystack');
                    loadBanks(paystackCountry);
                  }}
                  className={`px-4 py-2 rounded-lg border-2 font-medium ${
                    accountType === 'paystack'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-300 text-gray-700 hover:border-gray-400'
                  }`}
                >
                  Paystack (Africa)
                </button>
                <button
                  onClick={() => setAccountType('stripe')}
                  className={`px-4 py-2 rounded-lg border-2 font-medium ${
                    accountType === 'stripe'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-300 text-gray-700 hover:border-gray-400'
                  }`}
                >
                  Stripe (Global)
                </button>
              </div>
            </div>

            <form onSubmit={handleAddAccount}>
              {accountType === 'paystack' ? (
                <>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Country</label>
                    <select
                      value={paystackCountry}
                      onChange={(e) => {
                        setPaystackCountry(e.target.value);
                        loadBanks(e.target.value);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="NG">Nigeria (NGN)</option>
                      <option value="GH">Ghana (GHS)</option>
                      <option value="ZA">South Africa (ZAR)</option>
                      <option value="KE">Kenya (KES)</option>
                    </select>
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Bank</label>
                    <select
                      value={selectedBank}
                      onChange={(e) => setSelectedBank(e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select a bank</option>
                      {banks.map((bank) => (
                        <option key={bank.code} value={bank.code}>
                          {bank.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Account Number</label>
                    <input
                      type="text"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      placeholder="0123456789"
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Country</label>
                    <select
                      value={stripeCountry}
                      onChange={(e) => setStripeCountry(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="US">United States (USD)</option>
                      <option value="GB">United Kingdom (GBP)</option>
                      <option value="EU">European Union (EUR)</option>
                      <option value="CA">Canada (CAD)</option>
                      <option value="AU">Australia (AUD)</option>
                    </select>
                  </div>
                  
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <p className="text-sm text-blue-800">
                      You will be redirected to Stripe to complete your account setup and verify your identity.
                    </p>
                  </div>
                </>
              )}

              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => setShowAddAccountModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {accountType === 'stripe' ? 'Continue to Stripe' : 'Add Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Withdraw Funds</h3>
              <button
                onClick={() => setShowWithdrawModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleWithdraw}>
              {/* 24-Hour Processing Notice */}
              <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start">
                  <ClockIcon className="w-5 h-5 text-blue-600 mr-2 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-blue-900 mb-1">
                      ⏳ Bank transfers take 24 hours to process
                    </p>
                    <p className="text-xs text-blue-700">
                      This is Paystack's processing time, not ours. Your funds will arrive within 24 hours of approval.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Withdrawal Source</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setWithdrawSource('tokens')}
                    className={`px-4 py-2 rounded-lg border-2 font-medium ${
                      withdrawSource === 'tokens'
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-gray-300 text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    Tokens
                    <div className="text-xs mt-1">{((wallet?.token_balance || 0) / 100).toFixed(2)} available</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setWithdrawSource('earnings')}
                    className={`px-4 py-2 rounded-lg border-2 font-medium ${
                      withdrawSource === 'earnings'
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-gray-300 text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    Earnings
                    <div className="text-xs mt-1">₦{totalEarnings.toLocaleString()} available</div>
                  </button>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amount {withdrawSource === 'tokens' ? '(Tokens)' : '(NGN)'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                {withdrawSource === 'tokens' && withdrawAmount && (
                  <p className="text-sm text-gray-600 mt-1">
                    ≈ ₦{(parseFloat(withdrawAmount) * TOKEN_WITHDRAWAL_RATE).toLocaleString()} NGN (withdrawal rate)
                  </p>
                )}
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Bank Account</label>
                <select
                  value={selectedAccountId}
                  onChange={(e) => {
                    console.log('🏦 [Withdraw] Account selected:', e.target.value);
                    console.log('🏦 [Withdraw] Available accounts:', paymentAccounts.map(a => ({ ID: a.ID, name: a.account_name || a.bank_name })));
                    setSelectedAccountId(e.target.value);
                  }}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select account</option>
                  {paymentAccounts
                    .filter(a => a.is_verified)
                    .map((account) => {
                      console.log('🏦 [Withdraw] Rendering option - ID:', account.id, 'Name:', account.account_name || account.bank_name);
                      return (
                        <option key={account.id} value={account.id}>
                          {account.account_name || account.bank_name} - {account.currency}
                          {account.is_primary ? ' (Primary)' : ''}
                        </option>
                      );
                    })}
                </select>
              </div>

              {paymentAccounts.filter(a => a.is_verified).length === 0 && (
                <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm text-yellow-800">
                    You need to add and verify a bank account before you can withdraw funds.
                  </p>
                </div>
              )}

              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => setShowWithdrawModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={paymentAccounts.filter(a => a.is_verified).length === 0}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Withdraw
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Purchase Tokens Modal */}
      {showPurchaseTokensModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Purchase Tokens</h2>
            
            <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800 mb-2">
                <strong>Exchange Rate:</strong> ₦165 = 1 Token
              </p>
              <p className="text-xs text-blue-600">
                Use tokens to purchase tickets for scheduled watch sessions
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Amount (NGN)
              </label>
              <input
                type="number"
                step="165"
                min="165"
                value={tokenAmount}
                onChange={(e) => setTokenAmount(e.target.value)}
                placeholder="165"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              {tokenAmount && parseInt(tokenAmount) >= 165 && (
                <p className="text-sm text-gray-600 mt-2">
                  You will receive <strong>{(parseInt(tokenAmount) / 165).toFixed(2)} tokens</strong>
                </p>
              )}
              {tokenAmount && parseInt(tokenAmount) < 165 && (
                <p className="text-sm text-red-600 mt-2">
                  Minimum purchase is ₦165 (1 token)
                </p>
              )}
            </div>

            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Payment Method</h3>
              <div className="flex items-center text-sm text-gray-600">
                <CreditCardIcon className="h-5 w-5 mr-2 text-green-600" />
                Paystack (Card, Bank Transfer, USSD)
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowPurchaseTokensModal(false);
                  setTokenAmount('');
                  setError('');
                }}
                disabled={purchaseLoading}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handlePurchaseTokens}
                disabled={purchaseLoading || !tokenAmount || parseInt(tokenAmount) < 165}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {purchaseLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Processing...
                  </>
                ) : (
                  <>
                    <CreditCardIcon className="h-4 w-4 mr-1" />
                    Pay ₦{parseInt(tokenAmount || 0).toLocaleString()}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Donate Tokens Modal */}
      <DonateTokenToMember
        isOpen={showDonateModal}
        onClose={() => setShowDonateModal(false)}
        onDonationSuccess={(updatedBalance) => {
          // Update wallet balance after successful donation
          setWallet(prev => ({
            ...prev,
            token_balance: updatedBalance.token_balance,
            lifetime_spent: updatedBalance.lifetime_spent
          }));
          // Reload data to get latest state
          loadData();
        }}
      />
    </div>
  );
};

export default PaymentPage;
