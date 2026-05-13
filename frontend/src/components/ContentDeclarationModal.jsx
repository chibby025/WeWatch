// WeWatch Content Declaration Modal
// Legal protection for paid cinema/video sessions
import React, { useState } from 'react';

const ContentDeclarationModal = ({ isOpen, onClose, onSubmit, sessionData }) => {
  const [formData, setFormData] = useState({
    contentType: '',
    contentTitle: '',
    contentDescription: '',
    productionYear: new Date().getFullYear(),
    rightsHolder: '',
    additionalInfo: '',
    agreedToTerms: false,
  });

  const [errors, setErrors] = useState({});

  if (!isOpen) return null;

  const contentTypes = [
    { id: 'original', label: 'Original Content I Created', description: 'Film, series, or video you produced' },
    { id: 'licensed', label: 'Licensed Content', description: 'Content you have commercial rights to' },
    { id: 'educational', label: 'Educational/Transformative Use', description: 'Commentary, criticism, or teaching' },
    { id: 'public_domain', label: 'Public Domain', description: 'Content with expired copyright (pre-1928)' },
  ];

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.contentType) newErrors.contentType = 'Please select a content type';
    if (!formData.contentTitle.trim()) newErrors.contentTitle = 'Content title is required';
    if (!formData.contentDescription.trim()) newErrors.contentDescription = 'Description is required';
    if (!formData.rightsHolder.trim()) newErrors.rightsHolder = 'Rights holder name is required';
    if (!formData.agreedToTerms) newErrors.agreedToTerms = 'You must agree to the terms';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validateForm()) {
      onSubmit({
        ...formData,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        ipAddress: 'recorded_server_side',
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-3xl my-8" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 rounded-t-2xl">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold mb-2">⚖️ Content Declaration</h2>
              <p className="text-blue-100 text-sm">Required for paid cinema and video sessions</p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Form Content */}
        <div className="p-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {/* Why This Matters */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <div className="flex gap-3">
              <span className="text-2xl">ℹ️</span>
              <div>
                <h3 className="font-semibold text-yellow-900 mb-1">Why declare content ownership?</h3>
                <p className="text-sm text-yellow-800">
                  This declaration protects both you and LetsWatchOut. It creates a legal record that you have the right
                  to monetize this content. False declarations may result in account suspension.
                </p>
              </div>
            </div>
          </div>

          {/* Content Type Selection */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Content Type <span className="text-red-500">*</span>
            </label>
            <div className="space-y-3">
              {contentTypes.map((type) => (
                <label
                  key={type.id}
                  className={`block p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    formData.contentType === type.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="contentType"
                    value={type.id}
                    checked={formData.contentType === type.id}
                    onChange={(e) => setFormData({ ...formData, contentType: e.target.value })}
                    className="mr-3"
                  />
                  <span className="font-medium text-gray-900">{type.label}</span>
                  <p className="text-sm text-gray-600 ml-6 mt-1">{type.description}</p>
                </label>
              ))}
            </div>
            {errors.contentType && <p className="text-red-500 text-sm mt-1">{errors.contentType}</p>}
          </div>

          {/* Content Details */}
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Content Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.contentTitle}
                onChange={(e) => setFormData({ ...formData, contentTitle: e.target.value })}
                placeholder="e.g., My Indie Film, Documentary Title"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {errors.contentTitle && <p className="text-red-500 text-sm mt-1">{errors.contentTitle}</p>}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Content Description <span className="text-red-500">*</span>
              </label>
              <textarea
                value={formData.contentDescription}
                onChange={(e) => setFormData({ ...formData, contentDescription: e.target.value })}
                placeholder="Brief description of your content (genre, length, synopsis)"
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {errors.contentDescription && <p className="text-red-500 text-sm mt-1">{errors.contentDescription}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Production Year
                </label>
                <input
                  type="number"
                  value={formData.productionYear}
                  onChange={(e) => setFormData({ ...formData, productionYear: parseInt(e.target.value) })}
                  min="1900"
                  max={new Date().getFullYear()}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Rights Holder Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.rightsHolder}
                  onChange={(e) => setFormData({ ...formData, rightsHolder: e.target.value })}
                  placeholder="Your name or company"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            {errors.rightsHolder && <p className="text-red-500 text-sm mt-1">{errors.rightsHolder}</p>}

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Additional Information (Optional)
              </label>
              <textarea
                value={formData.additionalInfo}
                onChange={(e) => setFormData({ ...formData, additionalInfo: e.target.value })}
                placeholder="Cast, crew, production company, IMDb link, etc."
                rows={2}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Legal Agreement */}
          <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 mb-6">
            <h3 className="font-bold text-red-900 mb-3">Legal Certification</h3>
            <div className="text-sm text-red-800 space-y-2 mb-4">
              <p>By submitting this declaration, I certify under penalty of perjury that:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>I am the copyright owner OR have permission to monetize this content</li>
                <li>This content does not infringe on any third-party copyrights, trademarks, or rights</li>
                <li>I grant LetsWatchOut a non-exclusive license to display this content</li>
                <li>I indemnify LetsWatchOut against any copyright claims related to this content</li>
                <li>I understand that false declarations may result in:
                  <ul className="list-circle list-inside ml-4 mt-1">
                    <li>Immediate account suspension</li>
                    <li>Forfeiture of earnings</li>
                    <li>Legal action for fraud</li>
                  </ul>
                </li>
                <li>LetsWatchOut may remove content if a valid DMCA complaint is received</li>
              </ul>
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.agreedToTerms}
                onChange={(e) => setFormData({ ...formData, agreedToTerms: e.target.checked })}
                className="mt-1 w-5 h-5"
              />
              <span className="text-sm font-semibold text-red-900">
                I have read and agree to the above terms. I certify that the information provided is accurate
                and complete to the best of my knowledge.
              </span>
            </label>
            {errors.agreedToTerms && <p className="text-red-500 text-sm mt-2">{errors.agreedToTerms}</p>}
          </div>

          {/* Educational Note */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex gap-3">
              <span className="text-xl">💡</span>
              <div className="text-sm text-blue-800">
                <p className="font-semibold mb-1">Not sure if your content qualifies?</p>
                <p>
                  For free sessions, no declaration is needed. For paid sessions, if you're unsure about
                  copyright, use <strong>LiveShare</strong> or <strong>Watch From</strong> to screen share
                  from legal platforms instead.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-gray-50 px-6 py-4 rounded-b-2xl border-t border-gray-200 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!formData.agreedToTerms}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Submit Declaration & Continue
          </button>
        </div>

        {/* Record Keeping Notice */}
        <div className="px-6 pb-4">
          <p className="text-xs text-gray-500 text-center">
            🔒 This declaration is recorded with timestamp, IP address, and user details for legal compliance
          </p>
        </div>
      </div>
    </div>
  );
};

export default ContentDeclarationModal;
