// WeWatch/frontend/src/components/CreateTVContentModal.jsx
// Modal for host to create announcements or share media in RoomTV
import React, { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const CreateTVContentModal = ({ isOpen, onClose, onSubmit, activeSessionId = null }) => {
  const [contentType, setContentType] = useState('announcement');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [contentUrl, setContentUrl] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [durationMins, setDurationMins] = useState(30);
  const [uploadType, setUploadType] = useState('url'); // 'url' or 'file'
  const [mediaFile, setMediaFile] = useState(null);
  
  // Animation settings
  const [animationType, setAnimationType] = useState('scroll-left');
  const [textColor, setTextColor] = useState('#FFFFFF');
  const [bgGradient, setBgGradient] = useState('linear-gradient(90deg, #667eea 0%, #764ba2 100%)');
  const [animationSpeed, setAnimationSpeed] = useState('medium');
  const [useCustomGradient, setUseCustomGradient] = useState(false);
  const [gradientColor1, setGradientColor1] = useState('#667eea');
  const [gradientColor2, setGradientColor2] = useState('#764ba2');

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }

    try {
      // Build gradient string if using custom
      const finalGradient = useCustomGradient 
        ? `linear-gradient(90deg, ${gradientColor1} 0%, ${gradientColor2} 100%)`
        : bgGradient;

      await onSubmit({
        content_type: contentType,
        title: title.trim(),
        description: description.trim(),
        content_url: contentUrl.trim(),
        thumbnail_url: thumbnailUrl.trim(),
        duration_mins: durationMins,
        animation_type: animationType,
        text_color: textColor,
        bg_gradient: finalGradient,
        animation_speed: animationSpeed,
        session_id: activeSessionId, // Link to active session if exists
      });
      
      // Reset form
      setTitle('');
      setDescription('');
      setContentUrl('');
      setThumbnailUrl('');
      setDurationMins(30);
      setContentType('announcement');
      setUploadType('url');
      setMediaFile(null);
      setAnimationType('scroll-left');
      setTextColor('#FFFFFF');
      setBgGradient('linear-gradient(90deg, #667eea 0%, #764ba2 100%)');
      setAnimationSpeed('medium');
      setUseCustomGradient(false);
      setGradientColor1('#667eea');
      setGradientColor2('#764ba2');
      onClose();
    } catch (err) {
      console.error('Failed to create TV content:', err);
      toast.error('Failed to create content');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-bold text-white">Create RoomTV Content</h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Content Type */}
          <div>
            <label className="block text-white font-medium mb-2">
              Content Type
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="announcement"
                  checked={contentType === 'announcement'}
                  onChange={(e) => setContentType(e.target.value)}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-white">Announcement</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="media"
                  checked={contentType === 'media'}
                  onChange={(e) => setContentType(e.target.value)}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-white">Media/Link</span>
              </label>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-white font-medium mb-2">
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Important Announcement, New Movie Added"
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-white font-medium mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional details about the content..."
              rows={3}
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Media Source (for media type) */}
          {contentType === 'media' && (
            <>
              <div>
                <label className="block text-white font-medium mb-2">
                  Media Source
                </label>
                <div className="flex gap-4 mb-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="url"
                      checked={uploadType === 'url'}
                      onChange={(e) => setUploadType(e.target.value)}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-white">URL Link</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="file"
                      checked={uploadType === 'file'}
                      onChange={(e) => setUploadType(e.target.value)}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-white">Upload File</span>
                  </label>
                </div>

                {uploadType === 'url' ? (
                  <input
                    type="url"
                    value={contentUrl}
                    onChange={(e) => setContentUrl(e.target.value)}
                    placeholder="https://example.com/video.mp4"
                    className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <div className="flex items-center gap-3">
                    <label className="flex-1 cursor-pointer">
                      <div className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-700 hover:bg-gray-600 border-2 border-dashed border-gray-500 rounded-lg transition-colors">
                        <img src="/icons/uploadIcon.svg" alt="Upload" className="h-5 w-5" />
                        <span className="text-white">
                          {mediaFile ? mediaFile.name : 'Choose video file...'}
                        </span>
                      </div>
                      <input
                        type="file"
                        accept="video/*,audio/*"
                        onChange={(e) => setMediaFile(e.target.files[0])}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-white font-medium mb-2">
                  Thumbnail URL (Optional)
                </label>
                <input
                  type="url"
                  value={thumbnailUrl}
                  onChange={(e) => setThumbnailUrl(e.target.value)}
                  placeholder="https://example.com/thumbnail.jpg"
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          )}

          {/* Animation Settings */}
          <div className="border-t border-gray-700 pt-6 space-y-4">
            <h3 className="text-lg font-semibold text-white mb-4">🎬 Animation Settings</h3>
            
            {/* Animation Type */}
            <div>
              <label className="block text-white font-medium mb-2">
                Animation Type
              </label>
              <select
                value={animationType}
                onChange={(e) => setAnimationType(e.target.value)}
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="scroll-left">🎪 Jumbotron Scroll (Left to Right)</option>
                <option value="fade-pulse">✨ Fade Pulse</option>
                <option value="slide-up">⬆️ Slide Up</option>
                <option value="typewriter">⌨️ Typewriter</option>
                <option value="bounce-in">🎾 Bounce In</option>
                <option value="zoom-flash">💥 Zoom Flash</option>
              </select>
            </div>

            {/* Text Color */}
            <div>
              <label className="block text-white font-medium mb-2">
                Text Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                  className="w-16 h-12 rounded-lg cursor-pointer bg-gray-700 border-2 border-gray-600"
                />
                <input
                  type="text"
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                  placeholder="#FFFFFF"
                  className="flex-1 bg-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>
            </div>

            {/* Background Gradient */}
            <div>
              <label className="block text-white font-medium mb-2">
                Background Gradient
              </label>
              <div className="space-y-3">
                {/* Preset Gradients */}
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { name: 'Purple Dream', gradient: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)' },
                    { name: 'Fire', gradient: 'linear-gradient(90deg, #f12711 0%, #f5af19 100%)' },
                    { name: 'Ocean', gradient: 'linear-gradient(90deg, #2E3192 0%, #1BFFFF 100%)' },
                    { name: 'Sunset', gradient: 'linear-gradient(90deg, #ff6b6b 0%, #feca57 100%)' },
                  ].map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => {
                        setBgGradient(preset.gradient);
                        setUseCustomGradient(false);
                      }}
                      className={`h-12 rounded-lg border-2 transition-all ${
                        bgGradient === preset.gradient && !useCustomGradient
                          ? 'border-blue-500 scale-105'
                          : 'border-gray-600 hover:border-gray-400'
                      }`}
                      style={{ background: preset.gradient }}
                      title={preset.name}
                    />
                  ))}
                </div>

                {/* Custom Gradient */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={useCustomGradient}
                    onChange={(e) => setUseCustomGradient(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <label className="text-white text-sm">Use Custom Gradient</label>
                </div>

                {useCustomGradient && (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={gradientColor1}
                        onChange={(e) => setGradientColor1(e.target.value)}
                        className="w-12 h-12 rounded-lg cursor-pointer bg-gray-700 border-2 border-gray-600"
                      />
                      <span className="text-white text-sm">Start</span>
                    </div>
                    <span className="text-gray-400">→</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={gradientColor2}
                        onChange={(e) => setGradientColor2(e.target.value)}
                        className="w-12 h-12 rounded-lg cursor-pointer bg-gray-700 border-2 border-gray-600"
                      />
                      <span className="text-white text-sm">End</span>
                    </div>
                  </div>
                )}

                {/* Gradient Preview */}
                <div
                  className="h-16 rounded-lg flex items-center justify-center"
                  style={{ 
                    background: useCustomGradient 
                      ? `linear-gradient(90deg, ${gradientColor1} 0%, ${gradientColor2} 100%)`
                      : bgGradient
                  }}
                >
                  <span className="text-white font-bold text-sm px-4 py-1 bg-black bg-opacity-30 rounded">
                    Preview
                  </span>
                </div>
              </div>
            </div>

            {/* Animation Speed */}
            <div>
              <label className="block text-white font-medium mb-2">
                Animation Speed
              </label>
              <div className="flex gap-3">
                {['slow', 'medium', 'fast'].map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    onClick={() => setAnimationSpeed(speed)}
                    className={`flex-1 py-3 rounded-lg font-medium transition-all ${
                      animationSpeed === speed
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {speed.charAt(0).toUpperCase() + speed.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-white font-medium mb-2">
              Display Duration (minutes)
            </label>
            <input
              type="number"
              value={durationMins}
              onChange={(e) => setDurationMins(parseInt(e.target.value) || 30)}
              min="5"
              max="1440"
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-sm text-gray-400 mt-1">
              How long to display this content (5 minutes to 24 hours)
            </p>
          </div>

          {/* Buttons */}
          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-medium transition-colors"
            >
              Create Content
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateTVContentModal;
