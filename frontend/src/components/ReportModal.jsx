// WeWatch/frontend/src/components/ReportModal.jsx
import React, { useState, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/solid';
import apiClient from '../services/api';
import toast from 'react-hot-toast';

const REASONS = [
  { value: 'spam',           label: 'Spam' },
  { value: 'harassment',     label: 'Harassment or bullying' },
  { value: 'hate_speech',    label: 'Hate speech' },
  { value: 'violence',       label: 'Violence or dangerous content' },
  { value: 'nudity',         label: 'Nudity or sexual content' },
  { value: 'misinformation', label: 'Misinformation' },
  { value: 'copyright',      label: 'Copyright violation' },
  { value: 'other',          label: 'Other' },
];

const TARGET_LABELS = { room: 'room', post: 'post', user: 'user', session: 'session' };

const ReportModal = ({ targetType, targetId, targetName, onClose }) => {
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [alreadyReported, setAlreadyReported] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    apiClient
      .get('/api/reports/check', { params: { target_type: targetType, target_id: targetId } })
      .then(res => setAlreadyReported(res.data.reported))
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [targetType, targetId]);

  const handleSubmit = async () => {
    if (!reason) { toast.error('Please select a reason'); return; }
    setSubmitting(true);
    try {
      await apiClient.post('/api/reports', {
        target_type: targetType,
        target_id: targetId,
        reason,
        description,
      });
      toast.success('Report submitted. Thank you for keeping the community safe.');
      onClose();
    } catch (err) {
      if (err.response?.status === 409) {
        setAlreadyReported(true);
      } else {
        toast.error(err.response?.data?.error || 'Failed to submit report');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white text-base">Report {TARGET_LABELS[targetType]}</h2>
            {targetName && (
              <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[200px]">{targetName}</p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <XMarkIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {checking ? (
            <p className="text-sm text-gray-500 text-center py-4">Checking…</p>
          ) : alreadyReported ? (
            <div className="text-center py-6">
              <p className="text-2xl mb-2">✅</p>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">You've already reported this {TARGET_LABELS[targetType]}</p>
              <p className="text-xs text-gray-500 mt-1">Our team is reviewing it.</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Reason</p>
                <div className="space-y-1">
                  {REASONS.map(r => (
                    <button
                      key={r.value}
                      onClick={() => setReason(r.value)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors ${
                        reason === r.value
                          ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 font-medium border border-red-300 dark:border-red-700'
                          : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                  Additional details <span className="normal-case font-normal">(optional)</span>
                </p>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  maxLength={500}
                  rows={2}
                  placeholder="Help us understand the issue…"
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                />
              </div>
            </>
          )}
        </div>

        {!checking && !alreadyReported && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!reason || submitting}
              className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white text-sm font-medium transition-colors disabled:cursor-not-allowed"
            >
              {submitting ? 'Submitting…' : 'Submit Report'}
            </button>
          </div>
        )}

        {!checking && alreadyReported && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-800">
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportModal;
