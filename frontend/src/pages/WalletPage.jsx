/**
 * Wallet Page
 * Main page for wallet dashboard with token purchase integration
 */

import React, { useState } from 'react';
import WalletDashboard from '../components/payment/WalletDashboard';
import TokenPurchaseModal from '../components/payment/TokenPurchaseModal';
import { useNavigate } from 'react-router-dom';
import { usePayment } from '../contexts/PaymentContext';

const WalletPage = () => {
  const [showTokenPurchase, setShowTokenPurchase] = useState(false);
  const navigate = useNavigate();
  const { kycStatus, paymentAccounts } = usePayment();

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Top Navigation Bar */}
      <div className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="text-gray-400 hover:text-white transition-colors"
              >
                ← Back to Home
              </button>
              <h1 className="text-2xl font-bold text-white">💳 Wallet</h1>
            </div>
            
            <button
              onClick={() => setShowTokenPurchase(true)}
              className="px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg font-medium transition-all shadow-lg"
            >
              🪙 Buy Tokens
            </button>
          </div>

          {/* Quick Navigation Links */}
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/wallet/accounts')}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              🏦 Payment Accounts
              {paymentAccounts.length > 0 && (
                <span className="bg-green-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {paymentAccounts.length}
                </span>
              )}
            </button>
            
            <button
              onClick={() => navigate('/wallet/withdraw')}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              💸 Withdraw
            </button>
            
            <button
              onClick={() => navigate('/wallet/kyc')}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              🔐 KYC Verification
              {kycStatus?.status === 'approved' && (
                <span className="text-green-400">✓</span>
              )}
              {kycStatus?.status === 'pending' && (
                <span className="text-yellow-400">⏳</span>
              )}
              {kycStatus?.status === 'rejected' && (
                <span className="text-red-400">❌</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Wallet Dashboard */}
      <WalletDashboard />

      {/* Token Purchase Modal */}
      <TokenPurchaseModal
        isOpen={showTokenPurchase}
        onClose={() => setShowTokenPurchase(false)}
      />
    </div>
  );
};

export default WalletPage;
