// frontend/src/components/HelpSupportModal.jsx
import React, { useState } from 'react';
import { XMarkIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline';

const HelpSupportModal = ({ isOpen, onClose, currentUser }) => {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!subject.trim() || !message.trim()) {
      alert('Please fill in both subject and message');
      return;
    }

    setIsLoading(true);

    try {
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
      const response = await fetch(`${API_BASE_URL}/api/support/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('wewatch_token')}`
        },
        body: JSON.stringify({
          subject,
          message,
          user_email: currentUser?.email,
          username: currentUser?.username
        })
      });

      if (response.ok) {
        // Success!
        alert('✅ Support request sent successfully! We\'ll get back to you soon.');
        setSubject('');
        setMessage('');
        onClose();
      } else {
        const error = await response.json();
        alert(`Failed to send: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error sending support request:', error);
      alert('Failed to send support request. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto custom-sleek-scrollbar">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 sm:p-6 rounded-t-2xl">
          <div className="flex justify-between items-center">
            <h2 className="text-lg sm:text-2xl font-bold">Help & Support</h2>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 transition-colors"
              aria-label="Close modal"
            >
              <XMarkIcon className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>
          <p className="text-purple-100 mt-1 sm:mt-2 text-xs sm:text-sm">
            We're here to help! Send us your questions or feedback.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          {/* User Info Display */}
          <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
            <p className="text-xs text-gray-600 mb-1">Sending as:</p>
            <p className="text-sm font-semibold text-gray-800">
              {currentUser?.username || 'User'} ({currentUser?.email || 'No email'})
            </p>
          </div>

          {/* Subject */}
          <div>
            <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-2">
              Subject *
            </label>
            <input
              id="subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Brief description of your issue or question"
              className="w-full px-4 py-2 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all text-sm sm:text-base"
              maxLength={150}
              required
            />
            <p className="text-xs text-gray-500 mt-1">{subject.length}/150 characters</p>
          </div>

          {/* Message */}
          <div>
            <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">
              Message *
            </label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe your issue, question, or feedback in detail..."
              rows={6}
              className="w-full px-4 py-2 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all resize-none text-sm sm:text-base"
              maxLength={1000}
              required
            />
            <p className="text-xs text-gray-500 mt-1">{message.length}/1000 characters</p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 sm:py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm sm:text-base"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !subject.trim() || !message.trim()}
              className="flex-1 px-4 py-2 sm:py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium text-sm sm:text-base flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4 sm:h-5 sm:w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Sending...
                </>
              ) : (
                <>
                  <PaperAirplaneIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                  Send Message
                </>
              )}
            </button>
          </div>
        </form>

        {/* Footer Note */}
        <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:py-4 border-t border-gray-200 rounded-b-2xl">
          <p className="text-xs text-gray-600 text-center">
            💡 We typically respond within 24-48 hours
          </p>
        </div>
      </div>
    </div>
  );
};

export default HelpSupportModal;
