/**
 * Token Purchase Modal
 * Allows users to buy tokens via Stripe or Paystack
 */

import React, { useState, useEffect } from 'react';
import { usePayment } from '../../contexts/PaymentContext';
import {
  getTokenPackages,
  purchaseTokensStripe,
  purchaseTokensPaystack,
  verifyTokenPurchase,
  formatCurrency,
  formatTokens
} from '../../services/paymentApi';

const TokenPurchaseModal = ({ isOpen, onClose }) => {
  const { fetchWallet } = usePayment();
  
  const [packages, setPackages] = useState([]);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [gateway, setGateway] = useState('paystack'); // Default: 'paystack' (MVP), 'stripe' coming soon
  const [currency, setCurrency] = useState('NGN'); // Default: NGN (Nigeria)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Default packages if backend doesn't provide them
  const defaultPackages = [
    { tokens: 100, usd: 10, ngn: 4000, eur: 9, gbp: 8, bonus: 0 },
    { tokens: 500, usd: 45, ngn: 18000, eur: 40, gbp: 35, bonus: 50, popular: true },
    { tokens: 1000, usd: 85, ngn: 34000, eur: 75, gbp: 65, bonus: 150 },
    { tokens: 5000, usd: 400, ngn: 160000, eur: 350, gbp: 300, bonus: 1000 },
  ];

  useEffect(() => {
    if (isOpen) {
      fetchPackages();
    }
  }, [isOpen]);

  const fetchPackages = async () => {
    try {
      const data = await getTokenPackages();
      setPackages(data.packages || defaultPackages);
    } catch (error) {
      console.error('Failed to fetch packages:', error);
      setPackages(defaultPackages);
    }
  };

  const handlePurchase = async () => {
    if (!selectedPackage) {
      setError('Please select a package');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const packagePriceNGN = currency === 'NGN' ? getPriceForCurrency(selectedPackage) : null;
      const purchaseData = {
        amount: selectedPackage.tokens,
        currency: currency,
        gateway: gateway,
        // Gross-up amount for Paystack: ensures platform receives clean package price after fees
        ...(packagePriceNGN ? { charge_amount_ngn: calcBuyerCharge(packagePriceNGN) } : {}),
      };

      let response;
      if (gateway === 'stripe') {
        response = await purchaseTokensStripe(purchaseData);
        // Redirect to Stripe Checkout
        if (response.checkout_url) {
          window.location.href = response.checkout_url;
        }
      } else {
        response = await purchaseTokensPaystack(purchaseData);
        // Redirect to Paystack payment page
        if (response.authorization_url) {
          window.location.href = response.authorization_url;
        }
      }
    } catch (err) {
      console.error('Purchase failed:', err);
      setError(err.response?.data?.error || 'Failed to initiate purchase');
    } finally {
      setLoading(false);
    }
  };

  // Check if we're returning from a payment gateway
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const reference = urlParams.get('reference') || urlParams.get('session_id');
    const status = urlParams.get('status');

    if (reference && status === 'success') {
      verifyPurchase(reference);
    }
  }, []);

  const verifyPurchase = async (reference) => {
    try {
      await verifyTokenPurchase({ reference });
      setSuccess('Purchase successful! Your tokens have been added to your wallet.');
      await fetchWallet(); // Refresh wallet balance
      
      // Clear URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (err) {
      console.error('Verification failed:', err);
      setError('Failed to verify purchase');
    }
  };

  const getPriceForCurrency = (pkg) => {
    const prices = {
      USD: pkg.usd,
      NGN: pkg.ngn,
      EUR: pkg.eur,
      GBP: pkg.gbp
    };
    return prices[currency] || pkg.usd;
  };

  // For packages ≥ ₦2,500 Paystack charges 1.5% + ₦100 flat. We gross-up the charge so the
  // platform always receives the clean package price — buyer covers the processing overhead.
  // For packages < ₦2,500 the 1.5% is small enough that the platform absorbs it.
  const calcBuyerCharge = (packagePriceNGN) => {
    if (packagePriceNGN < 2500) return packagePriceNGN;
    // gross-up: find Y such that Y * 0.985 - 100 = packagePrice
    return Math.ceil((packagePriceNGN + 100) / 0.985);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-pink-600 p-6 rounded-t-2xl">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-3xl font-bold text-white mb-2">🪙 Buy Tokens</h2>
              <p className="text-purple-100">Choose a package and payment method</p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Success Message */}
          {success && (
            <div className="bg-green-500/20 border border-green-500 rounded-lg p-4 text-green-400">
              ✅ {success}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-500/20 border border-red-500 rounded-lg p-4 text-red-400">
              ❌ {error}
            </div>
          )}

          {/* Currency Display (NGN Only) */}
          <div>
            <label className="block text-gray-300 mb-2 font-medium">Currency</label>
            <div className="bg-gray-750 border-2 border-gray-700 rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-3xl">₦</span>
                <div>
                  <div className="text-white font-bold">Nigerian Naira (NGN)</div>
                  <div className="text-gray-400 text-sm">Paystack payment gateway</div>
                </div>
              </div>
              <span className="bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-sm font-medium">
                Active
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              💡 More currencies (USD, EUR, GBP) coming soon with Stripe integration
            </p>
          </div>

          {/* Payment Gateway Selector */}
          <div>
            <label className="block text-gray-300 mb-2 font-medium">Payment Method</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setGateway('paystack')}
                className={`p-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                  gateway === 'paystack'
                    ? 'bg-green-600 text-white shadow-lg scale-105'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <span className="text-2xl">🏦</span>
                <div className="text-left">
                  <div>Paystack</div>
                  <div className="text-xs opacity-80">Nigeria & Africa</div>
                </div>
              </button>
              <button
                disabled
                className="p-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 bg-gray-750 text-gray-500 cursor-not-allowed opacity-60"
              >
                <span className="text-2xl">💳</span>
                <div className="text-left">
                  <div>Stripe</div>
                  <div className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded mt-1">
                    Coming Soon
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Token Packages */}
          <div>
            <label className="block text-gray-300 mb-3 font-medium">Choose Package</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {packages.map((pkg, index) => (
                <button
                  key={index}
                  onClick={() => setSelectedPackage(pkg)}
                  className={`relative p-6 rounded-xl transition-all border-2 text-left ${
                    selectedPackage === pkg
                      ? 'border-purple-500 bg-purple-500/10 shadow-xl scale-105'
                      : 'border-gray-700 bg-gray-750 hover:border-gray-600'
                  } ${pkg.popular ? 'ring-2 ring-yellow-500' : ''}`}
                >
                  {/* Popular Badge */}
                  {pkg.popular && (
                    <div className="absolute -top-3 -right-3 bg-yellow-500 text-black px-3 py-1 rounded-full text-xs font-bold">
                      ⭐ POPULAR
                    </div>
                  )}

                  {/* Tokens */}
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-4xl">🪙</span>
                    <div>
                      <div className="text-3xl font-bold text-white">
                        {pkg.tokens.toLocaleString()}
                      </div>
                      <div className="text-sm text-gray-400">tokens</div>
                    </div>
                  </div>

                  {/* Bonus */}
                  {pkg.bonus > 0 && (
                    <div className="mb-3 bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-sm inline-block">
                      + {pkg.bonus} bonus tokens! 🎁
                    </div>
                  )}

                  {/* Price */}
                  <div className="text-2xl font-bold text-purple-400">
                    {formatCurrency(getPriceForCurrency(pkg), currency)}
                  </div>
                  <div className="text-sm text-gray-400 mt-1">
                    {(getPriceForCurrency(pkg) / (pkg.tokens + (pkg.bonus || 0))).toFixed(3)} per token
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Purchase Summary */}
          {selectedPackage && (() => {
            const price = getPriceForCurrency(selectedPackage);
            const isNGN = currency === 'NGN';
            const buyerCharge = isNGN ? calcBuyerCharge(price) : price;
            const processingFee = buyerCharge - price;
            const totalTokens = selectedPackage.tokens + (selectedPackage.bonus || 0);
            return (
              <div className="bg-gray-750 rounded-lg p-4 border border-gray-700">
                <div className="text-gray-300 font-medium mb-3">Purchase Summary</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Base Tokens:</span>
                    <span className="text-white font-medium">{selectedPackage.tokens.toLocaleString()}</span>
                  </div>
                  {selectedPackage.bonus > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Bonus Tokens:</span>
                      <span className="text-green-400 font-medium">+{selectedPackage.bonus.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="border-t border-gray-700 pt-2 flex justify-between font-medium">
                    <span className="text-gray-300">You receive:</span>
                    <span className="text-white font-bold">{totalTokens.toLocaleString()} tokens</span>
                  </div>
                  <div className="border-t border-gray-700 pt-2 flex justify-between items-baseline">
                    <span className="text-gray-300 font-medium">You pay:</span>
                    <div className="text-right">
                      <span className="text-purple-400 font-bold text-lg">
                        {isNGN ? `₦${buyerCharge.toLocaleString()}` : formatCurrency(buyerCharge, currency)}
                      </span>
                      {processingFee > 0 && (
                        <div className="text-xs text-gray-500">incl. ₦{processingFee} processing</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handlePurchase}
              disabled={!selectedPackage || loading}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Processing...
                </span>
              ) : (
                `Purchase ${selectedPackage ? formatTokens(selectedPackage.tokens + (selectedPackage.bonus || 0)) : 'Tokens'}`
              )}
            </button>
          </div>

          {/* Security Note */}
          <div className="text-center text-sm text-gray-400">
            🔒 Your payment is secure and encrypted. Powered by {gateway === 'stripe' ? 'Stripe' : 'Paystack'}.
          </div>
        </div>
      </div>
    </div>
  );
};

export default TokenPurchaseModal;
