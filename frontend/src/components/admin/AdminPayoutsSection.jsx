import React from 'react';
import { ArrowPathIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';

export default function AdminPayoutsSection({
  pendingPayouts,
  processingPayouts,
  processingPayout,
  handleApprovePayout,
  handleRejectPayout,
  handleCompletePayout,
  formatCurrency,
}) {
  if (!pendingPayouts.length && !processingPayouts.length) return null;

  return (
    <div className="space-y-6">
      {/* Pending Withdrawals */}
      {pendingPayouts.length > 0 && (
        <div className="bg-gradient-to-r from-red-600/20 to-orange-600/20 backdrop-blur-lg rounded-xl p-6 border-2 border-red-500/50">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            ⚠️ Pending Withdrawals
            <span className="text-sm bg-red-600 px-3 py-1 rounded-full">{pendingPayouts.length} Waiting</span>
          </h2>
          <div className="bg-white/5 rounded-lg overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/10">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-semibold">User</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold">Amount</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold">Source</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold">Bank</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold">Date</th>
                  <th className="text-right px-4 py-3 text-sm font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {pendingPayouts.map((payout) => (
                  <tr key={payout.id} className="hover:bg-white/5">
                    <td className="px-4 py-3">
                      <div className="font-semibold">{payout.user?.username || 'Unknown'}</div>
                      <div className="text-xs text-gray-400">ID: {payout.user_id}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-yellow-400">{formatCurrency(payout.amount_value || 0)}</div>
                      <div className="text-xs text-gray-400">{payout.amount_currency || 'NGN'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs ${
                        payout.payout_type === 'tokens'
                          ? 'bg-blue-600/30 text-blue-300'
                          : 'bg-green-600/30 text-green-300'
                      }`}>
                        {payout.payout_type === 'tokens' ? '🪙 Tokens' : '💰 Earnings'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {payout.payment_account ? (
                        <div>
                          <div className="text-white">{payout.payment_account.account_name}</div>
                          <div className="text-xs text-gray-400">{payout.payment_account.bank_name}</div>
                        </div>
                      ) : (
                        <span className="text-gray-500">N/A</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">
                      {new Date(payout.created_at).toLocaleDateString()}
                      <div className="text-xs text-gray-500">{new Date(payout.created_at).toLocaleTimeString()}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleApprovePayout(payout.id)}
                          disabled={processingPayout === payout.id}
                          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-semibold disabled:opacity-50 flex items-center gap-1"
                        >
                          {processingPayout === payout.id ? (
                            <><ArrowPathIcon className="h-4 w-4 animate-spin" />Processing...</>
                          ) : (
                            <><CheckCircleIcon className="h-4 w-4" />Approve</>
                          )}
                        </button>
                        <button
                          onClick={() => handleRejectPayout(payout.id)}
                          disabled={processingPayout === payout.id}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-semibold disabled:opacity-50 flex items-center gap-1"
                        >
                          <XCircleIcon className="h-4 w-4" />Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Manual Processing Required */}
      {processingPayouts.length > 0 && (
        <div className="bg-gradient-to-r from-yellow-600/20 to-blue-600/20 backdrop-blur-lg rounded-xl p-6 border-2 border-yellow-500/50">
          <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
            ⏳ Manual Processing Required
            <span className="text-sm bg-yellow-600 px-3 py-1 rounded-full">{processingPayouts.length} Waiting</span>
          </h2>
          <p className="text-sm text-gray-300 mb-4">
            Auto-transfer unavailable for these payouts.{' '}
            <span className="font-semibold text-yellow-300">Transfer via Paystack dashboard, then mark completed here.</span>
          </p>
          <div className="bg-white/5 rounded-lg overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/10">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-semibold">User</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold">Amount</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold">Bank Details</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold">Requested</th>
                  <th className="text-right px-4 py-3 text-sm font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {processingPayouts.map((payout) => (
                  <tr key={payout.id} className="hover:bg-white/5">
                    <td className="px-4 py-3">
                      <div className="font-semibold">{payout.user?.username || 'Unknown'}</div>
                      <div className="text-xs text-gray-400">ID: {payout.user_id} • Payout #{payout.id}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-yellow-400 text-lg">{formatCurrency(payout.amount_value || 0)}</div>
                      <div className="text-xs text-gray-400">
                        {payout.payout_type === 'tokens' ? '🪙 Token Withdrawal' : '💰 Earnings Withdrawal'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {payout.payment_account ? (
                        <div className="bg-white/5 p-2 rounded border border-white/10">
                          <div className="text-white font-semibold">{payout.payment_account.account_name}</div>
                          <div className="text-xs text-gray-400">{payout.payment_account.bank_name}</div>
                          <div className="text-xs text-blue-300 font-mono">{payout.payment_account.account_number}</div>
                        </div>
                      ) : (
                        <span className="text-gray-500">N/A</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">
                      {new Date(payout.created_at).toLocaleDateString()}
                      <div className="text-xs text-gray-500">{new Date(payout.created_at).toLocaleTimeString()}</div>
                      <div className="text-xs text-yellow-400 mt-1">
                        ⏱ {Math.floor((Date.now() - new Date(payout.created_at)) / (1000 * 60 * 60))}h ago
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end gap-2">
                        <button
                          onClick={() => handleCompletePayout(payout.id)}
                          disabled={processingPayout === payout.id}
                          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-semibold disabled:opacity-50 flex items-center gap-1 w-full justify-center"
                        >
                          {processingPayout === payout.id ? (
                            <><ArrowPathIcon className="h-4 w-4 animate-spin" />Updating...</>
                          ) : (
                            <><CheckCircleIcon className="h-4 w-4" />Mark Completed</>
                          )}
                        </button>
                        <button
                          onClick={() => handleRejectPayout(payout.id)}
                          disabled={processingPayout === payout.id}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-semibold disabled:opacity-50 flex items-center gap-1 w-full justify-center"
                        >
                          <XCircleIcon className="h-4 w-4" />Fail & Refund
                        </button>
                        <a
                          href="https://dashboard.paystack.com/#/transfers"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:text-blue-300 underline"
                        >
                          Open Paystack Dashboard →
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 bg-blue-900/30 border border-blue-500/30 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-300 mb-2">📝 Manual Transfer Steps:</h3>
            <ol className="text-xs text-gray-300 space-y-1 list-decimal list-inside">
              <li>Log in to <a href="https://dashboard.paystack.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">Paystack Dashboard</a></li>
              <li>Go to Transfers → Single Transfer</li>
              <li>Copy bank details from the table above</li>
              <li>Enter the exact amount shown</li>
              <li>Complete the transfer and copy the reference</li>
              <li>Click "Mark Completed" above and paste the reference</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
