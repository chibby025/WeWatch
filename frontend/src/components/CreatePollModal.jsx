import React, { useState } from 'react';
import { XMarkIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const CreatePollModal = ({ isOpen, onClose, onSubmit }) => {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addOption = () => {
    if (options.length < 10) {
      setOptions([...options, '']);
    } else {
      toast.error('Maximum 10 options allowed');
    }
  };

  const removeOption = (index) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    } else {
      toast.error('Minimum 2 options required');
    }
  };

  const updateOption = (index, value) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const handleSubmit = async () => {
    // Validation
    if (!question.trim()) {
      toast.error('Please enter a question');
      return;
    }

    const validOptions = options.filter(opt => opt.trim() !== '');
    if (validOptions.length < 2) {
      toast.error('Please provide at least 2 options');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        question: question.trim(),
        options: validOptions.map(opt => opt.trim()),
        allowMultiple,
      });
      
      // Reset form
      setQuestion('');
      setOptions(['', '']);
      setAllowMultiple(false);
      onClose();
      toast.success('Poll created successfully!');
    } catch (error) {
      console.error('Failed to create poll:', error);
      toast.error('Failed to create poll');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setQuestion('');
    setOptions(['', '']);
    setAllowMultiple(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-sleek-scrollbar">
        {/* Header */}
        <div className="sticky top-0 bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-bold text-white">Create Poll</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Question Input */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Question *
            </label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What movie should we watch?"
              maxLength={200}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              {question.length}/200 characters
            </p>
          </div>

          {/* Options */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Options * (Min 2, Max 10)
            </label>
            <div className="space-y-3">
              {options.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="flex-shrink-0 w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center text-gray-300 text-sm font-medium">
                    {index + 1}
                  </div>
                  <input
                    type="text"
                    value={option}
                    onChange={(e) => updateOption(index, e.target.value)}
                    placeholder={`Option ${index + 1}`}
                    maxLength={100}
                    className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {options.length > 2 && (
                    <button
                      onClick={() => removeOption(index)}
                      className="flex-shrink-0 w-8 h-8 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center transition-colors"
                      title="Remove option"
                    >
                      <TrashIcon className="w-4 h-4 text-white" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Add Option Button */}
            {options.length < 10 && (
              <button
                onClick={addOption}
                className="mt-3 w-full bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg px-4 py-2 text-gray-300 hover:text-white transition-colors flex items-center justify-center gap-2"
              >
                <PlusIcon className="w-5 h-5" />
                <span>Add Option</span>
              </button>
            )}
          </div>

          {/* Poll Settings */}
          <div className="border-t border-gray-700 pt-4">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={allowMultiple}
                onChange={(e) => setAllowMultiple(e.target.checked)}
                className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
              />
              <div>
                <span className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">
                  Allow multiple selections
                </span>
                <p className="text-xs text-gray-400 mt-0.5">
                  Users can select more than one option
                </p>
              </div>
            </label>
          </div>

          {/* Info Box */}
          <div className="bg-blue-900 bg-opacity-20 border border-blue-500 border-opacity-30 rounded-lg p-4">
            <h4 className="text-blue-400 text-sm font-medium mb-2">Poll Settings</h4>
            <ul className="text-xs text-gray-300 space-y-1">
              <li>• Voting is anonymous - only vote counts are visible</li>
              <li>• Results are shown in real-time as members vote</li>
              <li>• Members can change their vote at any time</li>
              <li>• Creator and host can close the poll</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-800 border-t border-gray-700 px-6 py-4 flex items-center justify-end gap-3">
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-6 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Creating...</span>
              </>
            ) : (
              <span>Create Poll</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreatePollModal;
