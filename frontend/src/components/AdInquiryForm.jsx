// frontend/src/components/AdInquiryForm.jsx
import React, { useState } from 'react';
import { MegaphoneIcon, XMarkIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const AdInquiryForm = ({ isOpen, onClose }) => {
  const [formData, setFormData] = useState({
    company_name: '',
    contact_name: '',
    email: '',
    phone: '',
    budget: 'under_500',
    campaign_goals: '',
    target_audience: '',
    message: ''
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/ads/inquiries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        toast.success('Thank you! Your inquiry has been submitted. We\'ll contact you within 2 business days.');
        setFormData({
          company_name: '',
          contact_name: '',
          email: '',
          phone: '',
          budget: 'under_500',
          campaign_goals: '',
          target_audience: '',
          message: ''
        });
        setTimeout(() => onClose(), 2000);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to submit inquiry');
      }
    } catch (error) {
      console.error('Failed to submit ad inquiry:', error);
      toast.error('Failed to submit inquiry. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div 
        className="fixed inset-0 bg-black/70 z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-gradient-to-br from-[#1E1E1E] to-[#2A2A2A] rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden border border-purple-500/30">
          {/* Header */}
          <div className="relative p-6 border-b border-gray-700 bg-gradient-to-r from-purple-600/20 to-pink-600/20">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
            
            <div className="flex items-center gap-4 mb-2">
              <MegaphoneIcon className="w-10 h-10 text-purple-400" />
              <div>
                <h2 className="text-3xl font-bold text-white">Advertise on LetsWatchOut</h2>
                <p className="text-gray-300 text-sm mt-1">Reach thousands of engaged viewers watching content together</p>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[calc(90vh-180px)] custom-sleek-scrollbar">
            <div className="space-y-5">
              {/* Company Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Company Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.company_name}
                    onChange={(e) => setFormData({...formData, company_name: e.target.value})}
                    className="w-full px-4 py-2.5 bg-[#2A2A2A] border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:outline-none transition-colors"
                    placeholder="Your Company Inc."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Contact Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.contact_name}
                    onChange={(e) => setFormData({...formData, contact_name: e.target.value})}
                    className="w-full px-4 py-2.5 bg-[#2A2A2A] border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:outline-none transition-colors"
                    placeholder="John Doe"
                  />
                </div>
              </div>

              {/* Contact Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    className="w-full px-4 py-2.5 bg-[#2A2A2A] border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:outline-none transition-colors"
                    placeholder="contact@company.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Phone (Optional)
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    className="w-full px-4 py-2.5 bg-[#2A2A2A] border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:outline-none transition-colors"
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
              </div>

              {/* Budget */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Estimated Monthly Budget <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={formData.budget}
                  onChange={(e) => setFormData({...formData, budget: e.target.value})}
                  className="w-full px-4 py-2.5 bg-[#2A2A2A] border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:outline-none transition-colors"
                >
                  <option value="under_500">Under $500</option>
                  <option value="500_1k">$500 - $1,000</option>
                  <option value="1k_5k">$1,000 - $5,000</option>
                  <option value="5k_10k">$5,000 - $10,000</option>
                  <option value="over_10k">Over $10,000</option>
                </select>
              </div>

              {/* Campaign Goals */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Campaign Goals <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  value={formData.campaign_goals}
                  onChange={(e) => setFormData({...formData, campaign_goals: e.target.value})}
                  rows={3}
                  className="w-full px-4 py-2.5 bg-[#2A2A2A] border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:outline-none transition-colors resize-none"
                  placeholder="What are you looking to achieve? (e.g., Brand awareness, Drive traffic, Generate leads)"
                />
              </div>

              {/* Target Audience */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Target Audience (Optional)
                </label>
                <textarea
                  value={formData.target_audience}
                  onChange={(e) => setFormData({...formData, target_audience: e.target.value})}
                  rows={2}
                  className="w-full px-4 py-2.5 bg-[#2A2A2A] border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:outline-none transition-colors resize-none"
                  placeholder="Who do you want to reach? (e.g., Age range, interests, demographics)"
                />
              </div>

              {/* Additional Message */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Additional Information (Optional)
                </label>
                <textarea
                  value={formData.message}
                  onChange={(e) => setFormData({...formData, message: e.target.value})}
                  rows={3}
                  className="w-full px-4 py-2.5 bg-[#2A2A2A] border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:outline-none transition-colors resize-none"
                  placeholder="Any other details about your campaign or questions?"
                />
              </div>
            </div>

            {/* Submit Button */}
            <div className="mt-6 flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
                    Submitting...
                  </span>
                ) : (
                  '📨 Submit Inquiry'
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-colors"
              >
                Cancel
              </button>
            </div>

            {/* Info Note */}
            <p className="mt-4 text-xs text-gray-400 text-center">
              By submitting this form, you agree to be contacted by LetsWatchOut regarding advertising opportunities.
              We typically respond within 2 business days.
            </p>
          </form>
        </div>
      </div>
    </>
  );
};

export default AdInquiryForm;
