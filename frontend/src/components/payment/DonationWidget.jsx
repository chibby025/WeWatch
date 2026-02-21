/**
 * Donation Widget
 * Quick widget for sending tips to hosts during sessions
 */

import React, { useState } from 'react';
import { usePayment } from '../../contexts/PaymentContext';
import { sendDonation, formatTokens } from '../../services/paymentApi';

const DonationWidget = ({ sessionId, hostId, hostName }) => {
  const { wallet, fetchWallet } = usePayment();
  
  const [amount, setAmount] = useState(null);
  const [customAmount, setCustomAmount] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const presetAmounts = [10, 25, 50, 100, 250, 500];

  const handleDonate = async () => {
    const finalAmount = amount || parseInt(customAmount);
    
    if (!finalAmount || finalAmount <= 0) {
      setError('Please select or enter a valid amount');
      return;
    }

    if (finalAmount > (wallet?.token_balance || 0)) {
      setError('Insufficient token balance');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await sendDonation({
        session_id: sessionId,
        host_id: hostId,
        amount: finalAmount,
        message: message || undefined
      });

      setSuccess(true);
      await fetchWallet(); // Refresh balance
      
      // Reset form
      setTimeout(() => {
        setAmount(null);
        setCustomAmount('');
        setMessage('');
        setSuccess(false);
      }, 3000);
    } catch (err) {
      console.error('Donation failed:', err);
      setError(err.response?.data?.error || 'Failed to send donation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-xl p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-3xl">💝</span>
        <div>
          <h3 className="text-lg font-bold text-white">Send a Tip</h3>
          <p className="text-sm text-gray-400">Support {hostName || 'the host'}</p>
        </div>
      </div>

      {/* Balance */}
      <div className="bg-gray-750 rounded-lg p-3 flex justify-between items-center">
        <span className="text-gray-400">Your Balance:</span>
        <span className="text-white font-bold">{formatTokens(wallet?.token_balance || 0)}</span>
      </div>

      {/* Success Message */}
      {success && (
        <div className="bg-green-500/20 border border-green-500 rounded-lg p-3 text-green-400 text-sm">
          ✅ Donation sent successfully! Thank you! 🎉
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-500/20 border border-red-500 rounded-lg p-3 text-red-400 text-sm">
          ❌ {error}
        </div>
      )}

      {/* Preset Amounts */}
      <div>
        <label className="block text-gray-300 text-sm mb-2">Quick Amount</label>
        <div className="grid grid-cols-3 gap-2">
          {presetAmounts.map((preset) => (
            <button
              key={preset}
              onClick={() => {
                setAmount(preset);
                setCustomAmount('');
              }}
              className={`px-3 py-2 rounded-lg font-medium transition-all ${
                amount === preset
                  ? 'bg-purple-600 text-white shadow-lg scale-105'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {preset} 🪙
            </button>
          ))}
        </div>
      </div>

      {/* Custom Amount */}
      <div>
        <label className="block text-gray-300 text-sm mb-2">Custom Amount</label>
        <input
          type="number"
          value={customAmount}
          onChange={(e) => {
            setCustomAmount(e.target.value);
            setAmount(null);
          }}
          placeholder="Enter custom amount..."
          min="1"
          className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
        />
      </div>

      {/* Message */}
      <div>
        <label className="block text-gray-300 text-sm mb-2">Message (Optional)</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Say something nice... 💬"
          maxLength={200}
          rows={2}
          className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none resize-none"
        />
        <div className="text-xs text-gray-400 mt-1 text-right">
          {message.length}/200
        </div>
      </div>

      {/* Donate Button */}
      <button
        onClick={handleDonate}
        disabled={loading || (!amount && !customAmount)}
        className="w-full px-4 py-3 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 text-white rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            Sending...
          </span>
        ) : (
          `💝 Send ${formatTokens(amount || parseInt(customAmount) || 0)}`
        )}
      </button>

      {/* Note */}
      <div className="text-xs text-gray-400 text-center">
        85% goes to the host, 15% platform fee
      </div>
    </div>
  );
};

export default DonationWidget;
