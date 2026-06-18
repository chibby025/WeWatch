// frontend/src/components/HelpSupportModal.jsx
import React, { useState } from 'react';
import { XMarkIcon, PaperAirplaneIcon, ChevronDownIcon, ChevronUpIcon, MegaphoneIcon } from '@heroicons/react/24/outline';
import AdInquiryForm from './AdInquiryForm';

const HelpSupportModal = ({ isOpen, onClose, currentUser }) => {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('contact'); // 'contact', 'faq', or 'advertise'
  const [expandedFaq, setExpandedFaq] = useState(null);
  const [advertiseModalOpen, setAdvertiseModalOpen] = useState(false);

  if (!isOpen) return null;

  // FAQ Data
  const faqCategories = [
    {
      category: '🔐 Account & Security',
      questions: [
        {
          question: 'How do I reset my password?',
          answer: 'Click "Forgot Password" on the login page. Enter your email and you\'ll receive a password reset link. For Google OAuth users, manage your password through Google.'
        },
        {
          question: 'What is 2FA and how do I enable it?',
          answer: 'Two-Factor Authentication adds extra security to your account. Go to Sidebar → Security → Enable 2FA. You\'ll need Google Authenticator app to scan the QR code. Save your backup codes safely!'
        },
        {
          question: 'Can I use Google to sign in?',
          answer: 'Yes! Click "Sign in with Google" on the login page. Your account will be created automatically with your Google profile information.'
        }
      ]
    },
    {
      category: '🎬 Rooms & Sessions',
      questions: [
        {
          question: 'How do I create a room?',
          answer: 'Click the "+" button in the Rooms tab. Choose public or private access, add a title and description, then click Create. You can customize room settings anytime from the room page.'
        },
        {
          question: 'What\'s the difference between watch types?',
          answer: 'Cinema: Movie theater experience with synchronized playback. Classroom: Educational environment with lecture hall or stage layouts. TV: Broadcast live content to viewers. Instant: Quick casual watch sessions.'
        },
        {
          question: 'How do I join someone else\'s session?',
          answer: 'Join the room first (if not already a member), then click "Join Active Session" when someone is hosting. For paid sessions, you\'ll need to purchase a ticket first.'
        },
        {
          question: 'Can I schedule watch events?',
          answer: 'Yes! Hosts can click "Schedule Event" to set up future watch sessions with specific dates, times, and ticket pricing. Members get notifications when events start.'
        }
      ]
    },
    {
      category: '💰 Payment & Tokens',
      questions: [
        {
          question: 'How do I purchase tokens?',
          answer: 'Go to Sidebar → Payment → Buy Tokens. Choose a package (100-10,000 tokens) and complete payment via Paystack or Stripe. Tokens are added to your balance instantly.'
        },
        {
          question: 'What are tokens used for?',
          answer: 'Tokens are LetsWatchOut\'s virtual currency. Use them to: buy tickets for paid sessions, send gifts/donations to hosts, unlock premium content, and participate in paid features.'
        },
        {
          question: 'How do ticket prices work?',
          answer: 'Hosts can set ticket prices when creating paid sessions. You purchase tickets with tokens. Early bird pricing may offer discounts. Free sessions don\'t require tickets.'
        },
        {
          question: 'How do I withdraw my earnings?',
          answer: 'Go to Payment → Withdraw. Set up your payout method (bank account/mobile money). Minimum withdrawal is 1000 tokens. Withdrawals process within 1-3 business days.'
        }
      ]
    },
    {
      category: '✨ Features',
      questions: [
        {
          question: 'How do voice notes work in chat?',
          answer: 'In any chat, click the microphone icon and hold to record. Release to send automatically. Voice notes play inline and show recording duration.'
        },
        {
          question: 'What is RoomTV?',
          answer: 'RoomTV lets hosts broadcast announcements, welcome messages, or promotions to all room members. Content appears at the top of the room page and can include images/text.'
        },
        {
          question: 'How do I post videos to Discover?',
          answer: 'Click "+" in Lobby → Post → Choose Recording or Upload. Add title, description, set privacy (public/private), and pricing. Videos appear in the Discover feed for all users.'
        },
        {
          question: 'What are the camera seat positions?',
          answer: 'In cinema sessions, you can position yourself anywhere in the virtual theater. Your camera appears in your chosen seat. Click seats to move around or go fullscreen.'
        }
      ]
    },
    {
      category: '🔧 Technical',
      questions: [
        {
          question: 'Why can\'t I hear others in the session?',
          answer: 'Check: 1) Your device volume is up, 2) Browser has microphone permissions, 3) You\'re not muted in the session controls, 4) Others have their microphones enabled. Try refreshing if issues persist.'
        },
        {
          question: 'How do I enable my camera/microphone?',
          answer: 'Browser will prompt for permissions when you join a session. If denied, go to browser settings → Site permissions → Allow camera and microphone for LetsWatchOut. Then refresh and rejoin.'
        },
        {
          question: 'What is Data Saver mode?',
          answer: 'Data Saver reduces bandwidth usage by limiting video quality to 480p and disabling autoplay. Enable it in Sidebar → Data Saver Mode. Great for mobile data or slow connections.'
        },
        {
          question: 'Can I use LetsWatchOut on mobile?',
          answer: 'Yes! LetsWatchOut is fully responsive and works on mobile browsers. For best experience, use Chrome or Safari on mobile. Some features like camera positions work better on desktop.'
        }
      ]
    }
  ];

  const toggleFaq = (categoryIndex, questionIndex) => {
    const faqId = `${categoryIndex}-${questionIndex}`;
    setExpandedFaq(expandedFaq === faqId ? null : faqId);
  };

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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-sleek-scrollbar">
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
            We're here to help! Browse FAQs or send us a message.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-50">
          <button
            onClick={() => setActiveTab('faq')}
            className={`flex-1 px-4 py-3 text-sm sm:text-base font-medium transition-colors ${
              activeTab === 'faq'
                ? 'text-purple-600 border-b-2 border-purple-600 bg-white'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            📚 FAQ
          </button>
          <button
            onClick={() => setActiveTab('contact')}
            className={`flex-1 px-4 py-3 text-sm sm:text-base font-medium transition-colors ${
              activeTab === 'contact'
                ? 'text-purple-600 border-b-2 border-purple-600 bg-white'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            ✉️ Contact Us
          </button>
          <button
            onClick={() => setActiveTab('advertise')}
            className={`flex-1 px-4 py-3 text-sm sm:text-base font-medium transition-colors ${
              activeTab === 'advertise'
                ? 'text-purple-600 border-b-2 border-purple-600 bg-white'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            📢 Advertise
          </button>
        </div>

        {/* FAQ Tab Content */}
        {activeTab === 'faq' && (
          <div className="p-4 sm:p-6 space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-blue-800">
                💡 <strong>Quick tip:</strong> Most common questions are answered below. Still need help? Switch to the Contact Us tab.
              </p>
            </div>

            {faqCategories.map((category, categoryIndex) => (
              <div key={categoryIndex} className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-100 px-4 py-2 font-semibold text-gray-800 text-sm">
                  {category.category}
                </div>
                <div className="divide-y divide-gray-200">
                  {category.questions.map((faq, questionIndex) => {
                    const faqId = `${categoryIndex}-${questionIndex}`;
                    const isExpanded = expandedFaq === faqId;
                    
                    return (
                      <div key={questionIndex} className="bg-white">
                        <button
                          onClick={() => toggleFaq(categoryIndex, questionIndex)}
                          className="w-full px-4 py-3 text-left flex justify-between items-center hover:bg-gray-50 transition-colors"
                        >
                          <span className="text-sm sm:text-base font-medium text-gray-900 pr-4">
                            {faq.question}
                          </span>
                          {isExpanded ? (
                            <ChevronUpIcon className="w-5 h-5 text-purple-600 flex-shrink-0" />
                          ) : (
                            <ChevronDownIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                          )}
                        </button>
                        {isExpanded && (
                          <div className="px-4 pb-3 text-sm text-gray-700 bg-gray-50">
                            {faq.answer}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-center">
              <p className="text-sm text-purple-800 mb-2">
                Didn't find what you're looking for?
              </p>
              <button
                onClick={() => setActiveTab('contact')}
                className="text-purple-600 hover:text-purple-700 font-semibold text-sm underline"
              >
                Contact our support team →
              </button>
            </div>
          </div>
        )}

        {/* Contact Form Tab Content */}
        {activeTab === 'contact' && (
          <>
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
        <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:py-4 border-t border-gray-200">
          <p className="text-xs text-gray-600 text-center">
            💡 We typically respond within 24-48 hours
          </p>
        </div>
          </>
        )}

        {/* Advertise Tab Content */}
        {activeTab === 'advertise' && (
          <div className="p-4 sm:p-6">
            {/* Header */}
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                <MegaphoneIcon className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                Reach Thousands of Engaged Viewers
              </h3>
              <p className="text-gray-600 max-w-xl mx-auto">
                Advertise on LetsWatchOut and connect with our community of movie lovers, gamers, and content enthusiasts watching together in real-time.
              </p>
            </div>

            {/* Benefits Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <div className="bg-gradient-to-br from-purple-50 to-blue-50 p-4 rounded-lg border border-purple-200">
                <div className="text-3xl mb-2">🎯</div>
                <h4 className="font-semibold text-gray-900 mb-1">Targeted Placement</h4>
                <p className="text-sm text-gray-600">
                  Ads appear in live sessions and discover feed, reaching viewers at peak engagement moments.
                </p>
              </div>
              
              <div className="bg-gradient-to-br from-blue-50 to-purple-50 p-4 rounded-lg border border-blue-200">
                <div className="text-3xl mb-2">📊</div>
                <h4 className="font-semibold text-gray-900 mb-1">Real-Time Analytics</h4>
                <p className="text-sm text-gray-600">
                  Track impressions, clicks, and CTR with our comprehensive analytics dashboard.
                </p>
              </div>
              
              <div className="bg-gradient-to-br from-pink-50 to-purple-50 p-4 rounded-lg border border-pink-200">
                <div className="text-3xl mb-2">💰</div>
                <h4 className="font-semibold text-gray-900 mb-1">Flexible Budgets</h4>
                <p className="text-sm text-gray-600">
                  Campaign budgets from $500 to $10,000+. Pay only for verified impressions delivered.
                </p>
              </div>
              
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-4 rounded-lg border border-purple-200">
                <div className="text-3xl mb-2">🎬</div>
                <h4 className="font-semibold text-gray-900 mb-1">Rich Media Support</h4>
                <p className="text-sm text-gray-600">
                  Display video ads, banners, or sponsored content. Full creative control over your campaigns.
                </p>
              </div>
            </div>

            {/* CTA */}
            <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl p-6 text-center text-white">
              <h4 className="text-xl font-bold mb-2">Ready to Get Started?</h4>
              <p className="text-purple-100 mb-4 text-sm">
                Submit an inquiry and our team will reach out within 2 business days to discuss your campaign goals.
              </p>
              <button
                onClick={() => setAdvertiseModalOpen(true)}
                className="bg-white text-purple-600 px-8 py-3 rounded-full font-semibold hover:bg-gray-100 transition-all transform hover:scale-105 shadow-lg"
              >
                Submit Advertising Inquiry
              </button>
            </div>

            {/* FAQ */}
            <div className="mt-8 pt-6 border-t border-gray-200">
              <h4 className="font-semibold text-gray-900 mb-3">Common Questions</h4>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-medium text-gray-900">What ad formats do you support?</p>
                  <p className="text-gray-600 mt-1">Banner images, video ads, and sponsored posts in the Discover feed.</p>
                </div>
                <div>
                  <p className="font-medium text-gray-900">How long does campaign approval take?</p>
                  <p className="text-gray-600 mt-1">Most campaigns are reviewed and approved within 1-2 business days.</p>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Can I target specific demographics?</p>
                  <p className="text-gray-600 mt-1">Yes! Target by age range and content rating to reach your ideal audience.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Ad Inquiry Modal (nested) */}
      <AdInquiryForm 
        isOpen={advertiseModalOpen} 
        onClose={() => setAdvertiseModalOpen(false)} 
      />
    </div>
  );
};

export default HelpSupportModal;
