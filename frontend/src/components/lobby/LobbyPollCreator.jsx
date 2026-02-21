// WeWatch/frontend/src/components/lobby/LobbyPollCreator.jsx
import React, { useState } from 'react';
import { XMarkIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/solid';
import toast from 'react-hot-toast';

const LobbyPollCreator = ({ isOpen, onClose, onSend, recipientId }) => {
  const [pollType, setPollType] = useState('yes_no'); // 'yes_no' or 'multiple_choice'
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [sending, setSending] = useState(false);

  if (!isOpen) return null;

  const handleAddOption = () => {
    if (options.length < 10) {
      setOptions([...options, '']);
    } else {
      toast.error('Maximum 10 options allowed');
    }
  };

  const handleRemoveOption = (index) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    } else {
      toast.error('Minimum 2 options required');
    }
  };

  const handleOptionChange = (index, value) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const handleSend = async () => {
    // Validation
    if (!question.trim()) {
      toast.error('Please enter a question');
      return;
    }

    if (pollType === 'multiple_choice') {
      const filledOptions = options.filter(opt => opt.trim());
      if (filledOptions.length < 2) {
        toast.error('Please provide at least 2 options');
        return;
      }
      if (filledOptions.length > 10) {
        toast.error('Maximum 10 options allowed');
        return;
      }
    }

    setSending(true);
    try {
      const pollData = {
        poll_type: pollType,
        question: question.trim(),
        options: pollType === 'yes_no' 
          ? ['Yes', 'No'] 
          : options.filter(opt => opt.trim()).map(opt => opt.trim())
      };

      await onSend(pollData, recipientId);
      handleClose();
    } catch (err) {
      console.error('Failed to send poll:', err);
      toast.error('Failed to create poll');
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setQuestion('');
    setOptions(['', '']);
    setPollType('yes_no');
    setSending(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-4 rounded-t-2xl flex items-center justify-between flex-shrink-0">
          <h2 className="text-xl font-bold text-white">Create Poll</h2>
          <button
            onClick={handleClose}
            className="text-white hover:bg-white/20 rounded-full p-1 transition-colors"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* Poll Type Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Poll Type
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setPollType('yes_no')}
                className={`px-4 py-3 rounded-lg border-2 transition-colors ${
                  pollType === 'yes_no'
                    ? 'bg-purple-50 dark:bg-purple-900/30 border-purple-500 text-purple-700 dark:text-purple-300'
                    : 'bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                }`}
              >
                <div className="font-semibold mb-1">Yes/No</div>
                <div className="text-xs opacity-75">Quick poll</div>
              </button>
              <button
                onClick={() => setPollType('multiple_choice')}
                className={`px-4 py-3 rounded-lg border-2 transition-colors ${
                  pollType === 'multiple_choice'
                    ? 'bg-purple-50 dark:bg-purple-900/30 border-purple-500 text-purple-700 dark:text-purple-300'
                    : 'bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                }`}
              >
                <div className="font-semibold mb-1">Multiple Choice</div>
                <div className="text-xs opacity-75">Custom options</div>
              </button>
            </div>
          </div>

          {/* Question Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Question <span className="text-red-500">*</span>
            </label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What would you like to ask?"
              className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 resize-none"
              rows="3"
              maxLength="200"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-right">
              {question.length}/200
            </p>
          </div>

          {/* Options (for multiple choice) */}
          {pollType === 'multiple_choice' && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Options <span className="text-red-500">*</span> <span className="text-xs text-gray-500">(2-10 options)</span>
              </label>
              <div className="space-y-2">
                {options.map((option, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={option}
                      onChange={(e) => handleOptionChange(index, e.target.value)}
                      placeholder={`Option ${index + 1}`}
                      className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                      maxLength="100"
                    />
                    {options.length > 2 && (
                      <button
                        onClick={() => handleRemoveOption(index)}
                        className="px-3 py-2 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded-lg transition-colors"
                        title="Remove option"
                      >
                        <TrashIcon className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {options.length < 10 && (
                <button
                  onClick={handleAddOption}
                  className="mt-3 w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 dark:border-gray-600"
                >
                  <PlusIcon className="w-5 h-5" />
                  Add Option
                </button>
              )}
            </div>
          )}

          {/* Yes/No Preview */}
          {pollType === 'yes_no' && question.trim() && (
            <div className="mb-6 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Preview</p>
              <p className="font-semibold mb-3 text-gray-900 dark:text-white">{question}</p>
              <div className="space-y-2">
                <div className="px-3 py-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <span className="text-sm">✅ Yes</span>
                </div>
                <div className="px-3 py-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <span className="text-sm">❌ No</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer - Actions */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700 rounded-b-2xl flex gap-3 flex-shrink-0">
          <button
            onClick={handleClose}
            className="flex-1 px-4 py-3 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-900 dark:text-white font-medium rounded-lg transition-colors"
            disabled={sending}
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !question.trim()}
            className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors"
          >
            {sending ? 'Creating...' : 'Create Poll'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LobbyPollCreator;
