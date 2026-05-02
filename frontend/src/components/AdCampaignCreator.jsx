// frontend/src/components/AdCampaignCreator.jsx
import React, { useState } from 'react';
import { XMarkIcon, CloudArrowUpIcon, PlayIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const AdCampaignCreator = ({ isOpen, onClose, onCampaignCreated }) => {
  const [step, setStep] = useState(1); // 1: Basic Info, 2: Creative Upload, 3: Targeting, 4: Budget & Review
  const [formData, setFormData] = useState({
    campaign_name: '',
    ad_type: 'banner',
    start_date: '',
    end_date: '',
    budget: '',
    target_age_min: 13,
    target_age_max: 99,
    target_content_rating: '',
    click_url: '',
    media_file: null,
    mediaPreview: null
  });
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    const validTypes = formData.ad_type === 'video_preroll' 
      ? ['video/mp4', 'video/webm']
      : ['image/jpeg', 'image/png', 'image/gif'];
    
    if (!validTypes.includes(file.type)) {
      toast.error(`Please upload a valid ${formData.ad_type === 'video_preroll' ? 'video' : 'image'} file`);
      return;
    }

    // Validate file size (max 50MB for video, 5MB for images)
    const maxSize = formData.ad_type === 'video_preroll' ? 50 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(`File size must be under ${formData.ad_type === 'video_preroll' ? '50MB' : '5MB'}`);
      return;
    }

    // Create preview URL
    const previewURL = URL.createObjectURL(file);
    setFormData({
      ...formData,
      media_file: file,
      mediaPreview: previewURL
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (step < 4) {
      setStep(step + 1);
      return;
    }

    setLoading(true);

    try {
      // Upload media file first
      const uploadFormData = new FormData();
      uploadFormData.append('file', formData.media_file);
      uploadFormData.append('type', 'ad_media');

      const uploadResponse = await fetch('/api/upload/ad-media', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: uploadFormData
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload media');
      }

      const { media_url, thumbnail_url } = await uploadResponse.json();

      // Create campaign
      const campaignData = {
        campaign_name: formData.campaign_name,
        ad_type: formData.ad_type,
        start_date: new Date(formData.start_date).toISOString(),
        end_date: new Date(formData.end_date).toISOString(),
        budget: parseFloat(formData.budget),
        target_age_min: formData.target_age_min,
        target_age_max: formData.target_age_max,
        target_content_rating: formData.target_content_rating || null,
        click_url: formData.click_url,
        media_url,
        thumbnail_url,
        status: 'pending_review'
      };

      const response = await fetch('/api/ads/campaigns', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(campaignData)
      });

      if (response.ok) {
        const data = await response.json();
        toast.success('Campaign submitted for review!');
        if (onCampaignCreated) onCampaignCreated(data.campaign);
        onClose();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to create campaign');
      }
    } catch (error) {
      console.error('Failed to create campaign:', error);
      toast.error('Failed to create campaign');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const renderStep1 = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Campaign Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          required
          value={formData.campaign_name}
          onChange={(e) => setFormData({...formData, campaign_name: e.target.value})}
          className="w-full px-4 py-2.5 bg-[#2A2A2A] border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:outline-none"
          placeholder="Summer Sale 2026"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Ad Type <span className="text-red-500">*</span>
        </label>
        <select
          required
          value={formData.ad_type}
          onChange={(e) => setFormData({...formData, ad_type: e.target.value})}
          className="w-full px-4 py-2.5 bg-[#2A2A2A] border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:outline-none"
        >
          <option value="banner">Banner Ad (Sidebar)</option>
          <option value="video_preroll">Video Pre-Roll (Before Content)</option>
          <option value="sponsored_room">Sponsored Room (Featured Placement)</option>
        </select>
        <p className="text-xs text-gray-400 mt-1">
          {formData.ad_type === 'banner' && '📱 Static banner displayed in lobby sidebar (300x250px recommended)'}
          {formData.ad_type === 'video_preroll' && '🎬 5-15 second video shown before content starts'}
          {formData.ad_type === 'sponsored_room' && '⭐ Your room featured at top of Discover tab'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Start Date <span className="text-red-500">*</span>
          </label>
          <input
            type="datetime-local"
            required
            value={formData.start_date}
            onChange={(e) => setFormData({...formData, start_date: e.target.value})}
            className="w-full px-4 py-2.5 bg-[#2A2A2A] border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            End Date <span className="text-red-500">*</span>
          </label>
          <input
            type="datetime-local"
            required
            value={formData.end_date}
            onChange={(e) => setFormData({...formData, end_date: e.target.value})}
            className="w-full px-4 py-2.5 bg-[#2A2A2A] border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:outline-none"
          />
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Upload {formData.ad_type === 'video_preroll' ? 'Video' : 'Image'} <span className="text-red-500">*</span>
        </label>
        <div className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center hover:border-purple-500 transition-colors">
          {formData.mediaPreview ? (
            <div className="space-y-4">
              {formData.ad_type === 'video_preroll' ? (
                <video src={formData.mediaPreview} controls className="max-w-full max-h-64 mx-auto rounded" />
              ) : (
                <img src={formData.mediaPreview} alt="Ad preview" className="max-w-full max-h-64 mx-auto rounded" />
              )}
              <button
                type="button"
                onClick={() => setFormData({...formData, media_file: null, mediaPreview: null})}
                className="text-red-400 hover:text-red-300 text-sm"
              >
                Remove & Upload Different File
              </button>
            </div>
          ) : (
            <label className="cursor-pointer">
              <CloudArrowUpIcon className="w-16 h-16 mx-auto text-gray-500 mb-4" />
              <p className="text-gray-300 mb-2">Click to upload {formData.ad_type === 'video_preroll' ? 'video' : 'image'}</p>
              <p className="text-xs text-gray-500">
                {formData.ad_type === 'video_preroll' 
                  ? 'MP4 or WebM, max 50MB, 5-15 seconds'
                  : 'JPG, PNG or GIF, max 5MB, 300x250px recommended'}
              </p>
              <input
                type="file"
                accept={formData.ad_type === 'video_preroll' ? 'video/mp4,video/webm' : 'image/jpeg,image/png,image/gif'}
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Click URL <span className="text-red-500">*</span>
        </label>
        <input
          type="url"
          required
          value={formData.click_url}
          onChange={(e) => setFormData({...formData, click_url: e.target.value})}
          className="w-full px-4 py-2.5 bg-[#2A2A2A] border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:outline-none"
          placeholder="https://yourwebsite.com/landing-page"
        />
        <p className="text-xs text-gray-400 mt-1">Where should users go when they click your ad?</p>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-3">Target Age Range</label>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Minimum Age</label>
            <select
              value={formData.target_age_min}
              onChange={(e) => setFormData({...formData, target_age_min: parseInt(e.target.value)})}
              className="w-full px-4 py-2.5 bg-[#2A2A2A] border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:outline-none"
            >
              <option value="13">13+</option>
              <option value="16">16+</option>
              <option value="18">18+</option>
              <option value="21">21+</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Maximum Age</label>
            <select
              value={formData.target_age_max}
              onChange={(e) => setFormData({...formData, target_age_max: parseInt(e.target.value)})}
              className="w-full px-4 py-2.5 bg-[#2A2A2A] border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:outline-none"
            >
              <option value="25">Up to 25</option>
              <option value="35">Up to 35</option>
              <option value="50">Up to 50</option>
              <option value="99">All Ages (No Max)</option>
            </select>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Target Content Rating (Optional)</label>
        <select
          value={formData.target_content_rating}
          onChange={(e) => setFormData({...formData, target_content_rating: e.target.value})}
          className="w-full px-4 py-2.5 bg-[#2A2A2A] border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:outline-none"
        >
          <option value="">All Content (No Filter)</option>
          <option value="G">G - General Audiences</option>
          <option value="PG">PG - Parental Guidance</option>
          <option value="13+">13+ - Teens and Up</option>
          <option value="16+">16+ - Mature Teens</option>
          <option value="18+">18+ - Adults Only</option>
          <option value="Mature">Mature - Explicit Content</option>
        </select>
        <p className="text-xs text-gray-400 mt-1">Show your ad only in rooms with this content rating</p>
      </div>
    </div>
  );

  const renderStep4 = () => {
    const estimatedImpressions = (parseFloat(formData.budget) / 2) * 1000; // Assuming $2 CPM
    const estimatedClicks = estimatedImpressions * 0.02; // 2% CTR estimate

    return (
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Total Budget (USD) <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400">$</span>
            <input
              type="number"
              required
              min="50"
              step="10"
              value={formData.budget}
              onChange={(e) => setFormData({...formData, budget: e.target.value})}
              className="w-full pl-8 pr-4 py-2.5 bg-[#2A2A2A] border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:outline-none"
              placeholder="500"
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">Minimum budget: $50</p>
        </div>

        {formData.budget && (
          <div className="bg-purple-600/10 border border-purple-500/30 rounded-lg p-4">
            <h4 className="text-white font-semibold mb-2">📊 Estimated Performance</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Impressions:</span>
                <span className="text-white font-medium">{estimatedImpressions.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Estimated Clicks:</span>
                <span className="text-white font-medium">{Math.round(estimatedClicks).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Cost Per Click (CPC):</span>
                <span className="text-white font-medium">${(parseFloat(formData.budget) / estimatedClicks).toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        <div className="bg-blue-600/10 border border-blue-500/30 rounded-lg p-4">
          <h4 className="text-white font-semibold mb-2">📝 Campaign Summary</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Campaign:</span>
              <span className="text-white">{formData.campaign_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Ad Type:</span>
              <span className="text-white">{formData.ad_type.replace('_', ' ')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Duration:</span>
              <span className="text-white">
                {new Date(formData.start_date).toLocaleDateString()} - {new Date(formData.end_date).toLocaleDateString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Target Age:</span>
              <span className="text-white">{formData.target_age_min} - {formData.target_age_max === 99 ? 'All' : formData.target_age_max}</span>
            </div>
          </div>
        </div>

        <div className="bg-yellow-600/10 border border-yellow-500/30 rounded-lg p-3">
          <p className="text-xs text-yellow-300">
            ⚠️ Your campaign will be reviewed within 24 hours. You'll be notified when it's approved and ready to launch.
          </p>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/70 z-50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-gradient-to-br from-[#1E1E1E] to-[#2A2A2A] rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden border border-purple-500/30">
          {/* Header */}
          <div className="relative p-6 border-b border-gray-700 bg-gradient-to-r from-purple-600/20 to-pink-600/20">
            <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">
              <XMarkIcon className="w-6 h-6" />
            </button>
            
            <h2 className="text-2xl font-bold text-white">Create Ad Campaign</h2>
            <div className="flex items-center gap-2 mt-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="flex items-center flex-1">
                  <div className={`w-full h-2 rounded-full ${i <= step ? 'bg-purple-500' : 'bg-gray-700'}`} />
                  {i < 4 && <div className="w-2" />}
                </div>
              ))}
            </div>
            <p className="text-sm text-gray-300 mt-2">
              Step {step} of 4: {['Basic Info', 'Creative Upload', 'Targeting', 'Budget & Review'][step - 1]}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[calc(90vh-250px)] custom-sleek-scrollbar">
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
            {step === 4 && renderStep4()}
          </form>

          {/* Footer */}
          <div className="p-6 border-t border-gray-700 flex gap-3">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-colors"
              >
                ← Back
              </button>
            )}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || (step === 2 && !formData.media_file)}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : step === 4 ? '🚀 Submit for Review' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default AdCampaignCreator;
