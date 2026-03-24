// frontend/src/components/DateOfBirthPromptModal.jsx
import React, { useState } from 'react';

/**
 * DateOfBirthPromptModal - Blocks access until user provides date of birth
 * Required for COPPA compliance and content moderation
 * Cannot be dismissed - user must provide DOB to continue
 */
const DateOfBirthPromptModal = ({ isOpen, onSubmit, isSubmitting }) => {
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!dateOfBirth) {
      setError('Please enter your date of birth to continue');
      return;
    }

    // Validate age is 13+
    const birthDate = new Date(dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    if (age < 13) {
      setError('You must be at least 13 years old to use WeWatch');
      return;
    }

    // Validate not a future date
    if (birthDate > today) {
      setError('Date of birth cannot be in the future');
      return;
    }

    onSubmit(dateOfBirth);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[9999] p-4">
      <div className="bg-gradient-to-br from-purple-900 via-blue-900 to-purple-800 rounded-2xl shadow-2xl w-full max-w-md border-2 border-purple-500/50 animate-fade-in">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-6 rounded-t-2xl">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-white/20 rounded-full p-2">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold">Date of Birth Required</h2>
          </div>
          <p className="text-purple-100 text-sm">
            We need your date of birth to show age-appropriate content
          </p>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Info Box */}
          <div className="bg-blue-500/20 border-2 border-blue-400/50 rounded-lg p-4">
            <div className="flex gap-3">
              <svg className="w-6 h-6 text-blue-300 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div className="text-sm text-blue-100">
                <p className="font-semibold mb-1">Why we need this:</p>
                <ul className="space-y-1 text-xs">
                  <li>• Filter age-inappropriate content</li>
                  <li>• Comply with child protection laws (COPPA)</li>
                  <li>• Ensure safe viewing experience</li>
                  <li>• Your DOB is private and never shown publicly</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Date Input */}
          <div>
            <label htmlFor="dob" className="block text-sm font-semibold text-white mb-2">
              Your Date of Birth
            </label>
            <input
              type="date"
              id="dob"
              value={dateOfBirth}
              onChange={(e) => {
                setDateOfBirth(e.target.value);
                setError('');
              }}
              max={new Date().toISOString().split('T')[0]}
              disabled={isSubmitting}
              className="w-full px-4 py-3 bg-white/10 backdrop-blur-sm border-2 border-white/30 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300 disabled:opacity-50 [color-scheme:dark]"
              required
            />
            <p className="text-xs text-gray-300 mt-2">
              ⚠️ Must be 13+ to use WeWatch
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-500/20 border-2 border-red-400/50 text-red-200 rounded-lg p-3 animate-shake">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span className="text-sm">{error}</span>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || !dateOfBirth}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Confirming...
              </span>
            ) : (
              'Continue to WeWatch'
            )}
          </button>

          {/* Privacy Note */}
          <p className="text-xs text-center text-gray-400">
            🔒 Your date of birth is encrypted and kept private. It will never be displayed on your profile or shared with others.
          </p>
        </form>
      </div>
    </div>
  );
};

export default DateOfBirthPromptModal;
