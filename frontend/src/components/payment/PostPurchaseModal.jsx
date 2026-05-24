/**
 * Post Purchase Modal
 * Buy access to a paid post/recording with tokens. Mirrors TicketPurchaseModal
 * but simpler — no gifting, no early-bird discount.
 *
 * Pricing convention:
 *   post.price is in TOKENS (e.g. 50.0 = 50 tokens)
 *   wallet.token_balance is in CENTS (5000 = 50 tokens)
 *   So: priceInCents = post.price * 100
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePayment } from '../../contexts/PaymentContext';
import { purchasePost, formatTokens } from '../../services/paymentApi';

const PostPurchaseModal = ({ isOpen, onClose, post, onSuccess }) => {
  const { wallet, fetchWallet } = usePayment();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [showBuyTokens, setShowBuyTokens] = useState(false);

  const priceTokens = parseFloat(post?.price) || 0;
  const priceInCents = Math.round(priceTokens * 100);
  const priceInNaira = priceTokens * 165; // Display equivalent at purchase rate
  const balance = wallet?.token_balance || 0;
  const hasInsufficientBalance = priceInCents > balance;
  const shortfallCents = Math.max(0, priceInCents - balance);

  useEffect(() => {
    if (isOpen) {
      fetchWallet().catch((err) =>
        console.error('❌ [PostPurchaseModal] Failed to fetch wallet:', err)
      );
    } else {
      setError(null);
      setSuccess(false);
      setShowBuyTokens(false);
    }
  }, [isOpen, fetchWallet]);

  const handlePurchase = async () => {
    if (!post) return;

    if (hasInsufficientBalance) {
      setError('Insufficient token balance');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const result = await purchasePost(post.id);
      setSuccess(true);
      await fetchWallet();

      setTimeout(() => {
        if (onSuccess) onSuccess(result);
        onClose();
      }, 600);
    } catch (err) {
      console.error('Post purchase failed:', err);
      const status = err.response?.status;
      if (status === 402) {
        setError('Insufficient token balance');
        setShowBuyTokens(true);
      } else if (status === 409) {
        // Already owned — surface as success path
        setError(null);
        setSuccess(true);
        await fetchWallet();
        setTimeout(() => {
          if (onSuccess) onSuccess({ already_owned: true });
          onClose();
        }, 600);
      } else {
        setError(err.response?.data?.error || 'Purchase failed');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !post) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl shadow-2xl border border-purple-500/30 max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header with thumbnail */}
        <div className="relative">
          {post.thumbnail_url ? (
            <img
              src={post.thumbnail_url}
              alt={post.description?.slice(0, 60) || 'Post'}
              className="w-full h-48 object-cover rounded-t-2xl"
            />
          ) : (
            <div className="w-full h-48 bg-gradient-to-br from-purple-900 to-pink-900 rounded-t-2xl flex items-center justify-center">
              <span className="text-6xl">🎬</span>
            </div>
          )}

          {/* Close button */}
          <button
            onClick={onClose}
            disabled={loading}
            className="absolute top-3 right-3 z-10 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* "Paid" badge */}
          <div className="absolute top-3 left-3 bg-yellow-500 text-black text-xs font-bold px-2.5 py-1 rounded-full shadow-md">
            🔒 PAID
          </div>
        </div>

        <div className="p-6">
          <h2 className="text-xl font-bold text-white mb-1">Purchase Post</h2>
          {post.description && <p className="text-sm text-gray-300 line-clamp-2 mb-4">{post.description}</p>}

          {post.user?.username && (
            <p className="text-xs text-gray-400 mb-4">
              by <span className="text-purple-300 font-medium">@{post.user.username}</span>
            </p>
          )}

          {/* Success message */}
          {success && (
            <div className="bg-green-500/20 border border-green-500/40 rounded-lg p-3 text-green-300 text-sm mb-4 flex items-center gap-2">
              ✅ <span>Purchase complete — you can now watch and download.</span>
            </div>
          )}

          {/* Error message */}
          {error && !success && (
            <div className="bg-red-500/20 border border-red-500/40 rounded-lg p-3 text-red-300 text-sm mb-4 flex items-center gap-2">
              ❌ <span>{error}</span>
            </div>
          )}

          {/* Price + balance summary */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4 space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-gray-400">Price</span>
              <div className="text-right">
                <div className="text-2xl font-bold text-purple-300">
                  {priceTokens.toLocaleString()} tokens
                </div>
                <div className="text-xs text-gray-400">
                  ≈ ₦{priceInNaira.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>
            </div>

            <div className="border-t border-white/10 pt-3 flex items-center justify-between">
              <span className="text-sm text-gray-400">Your balance</span>
              <span className={`text-sm font-semibold ${hasInsufficientBalance ? 'text-red-400' : 'text-green-400'}`}>
                {formatTokens(balance)}
              </span>
            </div>

            {hasInsufficientBalance && (
              <div className="border-t border-white/10 pt-3 flex items-center justify-between">
                <span className="text-sm text-red-400">Shortfall</span>
                <span className="text-sm font-semibold text-red-400">
                  {formatTokens(shortfallCents)}
                </span>
              </div>
            )}
          </div>

          {/* What you get */}
          <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 mb-4">
            <div className="text-xs font-semibold text-purple-300 mb-2">What you get:</div>
            <ul className="text-xs text-gray-300 space-y-1">
              <li>✓ Permanent access to watch this post</li>
              <li>✓ Download anytime — even if the host removes it later, you keep your copy</li>
              <li>✓ One-time payment, no subscription</li>
            </ul>
          </div>

          {/* Buy-tokens deflection when broke */}
          {hasInsufficientBalance && showBuyTokens && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-4">
              <div className="text-xs text-blue-300 mb-2">Top up to complete this purchase:</div>
              <button
                onClick={() => {
                  onClose();
                  navigate('/payment');
                }}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Buy Tokens
              </button>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-3 bg-white/10 hover:bg-white/20 text-gray-200 rounded-lg font-medium transition-colors text-sm disabled:opacity-50"
            >
              Cancel
            </button>
            {hasInsufficientBalance ? (
              <button
                onClick={() => {
                  onClose();
                  navigate('/payment');
                }}
                disabled={loading}
                className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm disabled:opacity-50"
              >
                Buy Tokens
              </button>
            ) : (
              <button
                onClick={handlePurchase}
                disabled={loading || success}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg font-bold transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '⏳ Processing…' : `Purchase for ${priceTokens.toLocaleString()} tokens`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PostPurchaseModal;
