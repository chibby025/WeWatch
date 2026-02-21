/**
 * Wallet Dashboard Component
 * Displays user's token balance, earnings, and transaction history
 */

import React, { useState, useEffect } from 'react';
import { usePayment } from '../../contexts/PaymentContext';
import { getTransactionHistory } from '../../services/paymentApi';
import { formatCurrency, formatTokens, getTransactionTypeName, getStatusColor } from '../../services/paymentApi';

const WalletDashboard = () => {
  const {
    wallet,
    walletStats,
    earnings,
    loadingWallet,
    loadingEarnings,
    fetchWallet,
    fetchEarnings
  } = usePayment();

  const [transactions, setTransactions] = useState([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filterType, setFilterType] = useState('all');

  // Fetch transactions
  useEffect(() => {
    fetchTransactions();
  }, [currentPage, filterType]);

  const fetchTransactions = async () => {
    try {
      setLoadingTransactions(true);
      const data = await getTransactionHistory({
        page: currentPage,
        limit: 20,
        type: filterType
      });
      setTransactions(data.transactions || []);
      setTotalPages(data.pagination?.total_pages || 1);
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    } finally {
      setLoadingTransactions(false);
    }
  };

  // Refresh all data
  const handleRefresh = async () => {
    await Promise.all([
      fetchWallet(),
      fetchEarnings(),
      fetchTransactions()
    ]);
  };

  if (loadingWallet || loadingEarnings) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-white">💰 My Wallet</h1>
        <button
          onClick={handleRefresh}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
        >
          🔄 Refresh
        </button>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Token Balance */}
        <div className="bg-gradient-to-br from-purple-600 to-purple-800 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-purple-200">Token Balance</span>
            <span className="text-3xl">🪙</span>
          </div>
          <div className="text-3xl font-bold mb-1">
            {wallet?.token_balance?.toLocaleString() || 0}
          </div>
          <div className="text-sm text-purple-200">
            ≈ {formatCurrency(wallet?.token_balance * 0.1 || 0, 'USD')}
          </div>
        </div>

        {/* Total Earnings */}
        <div className="bg-gradient-to-br from-green-600 to-green-800 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-green-200">Total Earnings</span>
            <span className="text-3xl">💵</span>
          </div>
          <div className="text-3xl font-bold mb-1">
            {formatCurrency(earnings?.total_earnings || 0, earnings?.currency || 'USD')}
          </div>
          <div className="text-sm text-green-200">
            Available: {formatCurrency(earnings?.total_available_for_withdrawal || 0, earnings?.currency || 'USD')}
          </div>
        </div>

        {/* Lifetime Stats */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-blue-200">Total Spent</span>
            <span className="text-3xl">📊</span>
          </div>
          <div className="text-3xl font-bold mb-1">
            {formatCurrency(walletStats?.total_spent || 0, 'USD')}
          </div>
          <div className="text-sm text-blue-200">
            {walletStats?.total_transactions || 0} transactions
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-gray-400 text-sm mb-1">Tickets Sold</div>
          <div className="text-2xl font-bold text-white">
            {earnings?.ticket_sales_count || 0}
          </div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-gray-400 text-sm mb-1">Donations Received</div>
          <div className="text-2xl font-bold text-white">
            {earnings?.donations_count || 0}
          </div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-gray-400 text-sm mb-1">Platform Commission</div>
          <div className="text-2xl font-bold text-white">
            {formatCurrency(earnings?.platform_commission || 0, earnings?.currency || 'USD')}
          </div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-gray-400 text-sm mb-1">Total Withdrawn</div>
          <div className="text-2xl font-bold text-white">
            {formatCurrency(earnings?.total_withdrawn || 0, earnings?.currency || 'USD')}
          </div>
        </div>
      </div>

      {/* Transaction History */}
      <div className="bg-gray-800 rounded-xl p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">Transaction History</h2>
          
          {/* Filter Buttons */}
          <div className="flex gap-2">
            {['all', 'purchase', 'ticket', 'donation', 'payout'].map(type => (
              <button
                key={type}
                onClick={() => {
                  setFilterType(type);
                  setCurrentPage(1);
                }}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  filterType === type
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Transactions Table */}
        {loadingTransactions ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-6xl mb-4">📭</div>
            <div className="text-xl">No transactions yet</div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-700">
                    <th className="pb-3 font-medium">Date</th>
                    <th className="pb-3 font-medium">Type</th>
                    <th className="pb-3 font-medium">Description</th>
                    <th className="pb-3 font-medium">Amount</th>
                    <th className="pb-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="border-b border-gray-700 hover:bg-gray-750">
                      <td className="py-4 text-gray-300">
                        {new Date(tx.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-4">
                        <span className="text-gray-300">
                          {getTransactionTypeName(tx.transaction_type)}
                        </span>
                      </td>
                      <td className="py-4 text-gray-400 text-sm">
                        {tx.description || '-'}
                      </td>
                      <td className="py-4">
                        <span className={`font-semibold ${
                          tx.amount > 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {tx.amount > 0 ? '+' : ''}{formatTokens(tx.amount)}
                        </span>
                      </td>
                      <td className="py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium
                          ${getStatusColor(tx.status) === 'green' ? 'bg-green-500/20 text-green-400' :
                            getStatusColor(tx.status) === 'yellow' ? 'bg-yellow-500/20 text-yellow-400' :
                            getStatusColor(tx.status) === 'red' ? 'bg-red-500/20 text-red-400' :
                            'bg-gray-500/20 text-gray-400'
                          }`}
                        >
                          {tx.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-6">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 bg-gray-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600"
                >
                  Previous
                </button>
                <span className="px-4 py-2 text-gray-300">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 bg-gray-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default WalletDashboard;
