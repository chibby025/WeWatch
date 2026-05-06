// WeWatch/frontend/src/components/PostUploadModal.jsx
import { useState, useRef, useEffect } from 'react';
import { X, Upload, Image as ImageIcon, Film, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

export default function PostUploadModal({ isOpen, onClose, onSuccess }) {
  const { currentUser } = useAuth();
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedRoom, setSelectedRoom] = useState(null); // null = personal post
  const [hostedRooms, setHostedRooms] = useState([]); // Rooms where user is host
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [allowDownloads, setAllowDownloads] = useState(true); // Allow downloads by default
  const fileInputRef = useRef(null);

  // File validation constants
  const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500MB
  const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
  const MAX_VIDEO_DURATION = 90; // 90 seconds (TikTok/Reels style)
  const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
  const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  // Fetch user's hosted rooms on modal open
  useEffect(() => {
    if (isOpen && currentUser) {
      fetchHostedRooms();
    }
  }, [isOpen, currentUser]);

  const fetchHostedRooms = async () => {
    try {
      setLoadingRooms(true);
      const response = await apiClient.get('/api/rooms');
      // Filter rooms where current user is the host
      const userHostedRooms = response.data.rooms.filter(
        room => room.host_id === currentUser.id
      );
      setHostedRooms(userHostedRooms);
    } catch (error) {
      console.error('Failed to fetch rooms:', error);
      setHostedRooms([]);
    } finally {
      setLoadingRooms(false);
    }
  };

  if (!isOpen) return null;

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelection = async (file) => {
    if (!file) return;

    // Validate file type
    const isVideo = ACCEPTED_VIDEO_TYPES.includes(file.type);
    const isImage = ACCEPTED_IMAGE_TYPES.includes(file.type);

    if (!isVideo && !isImage) {
      toast.error('Invalid file type. Please upload a video or image.');
      return;
    }

    // Validate file size
    const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
    if (file.size > maxSize) {
      toast.error(`File too large. Max size: ${isVideo ? '500MB' : '10MB'}`);
      return;
    }

    // Validate video duration
    if (isVideo) {
      const duration = await getVideoDuration(file);
      if (duration > MAX_VIDEO_DURATION) {
        toast.error('Video too long. Maximum duration is 90 seconds.');
        return;
      }
    }

    setSelectedFile(file);

    // Generate preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const getVideoDuration = (file) => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src);
        resolve(video.duration);
      };
      video.onerror = () => resolve(0);
      video.src = URL.createObjectURL(file);
    });
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error('Please select a file');
      return;
    }

    if (!title.trim()) {
      toast.error('Please enter a title');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      // Determine media type
      const isVideo = ACCEPTED_VIDEO_TYPES.includes(selectedFile.type);
      const mediaType = selectedFile.type === 'image/gif' ? 'gif' : isVideo ? 'video' : 'image';

      // Step 1: Create post entry
      const createResponse = await apiClient.post('/api/posts', {
        title: title.trim(),
        description: description.trim(),
        media_type: mediaType,
        post_type: 'upload',
        is_public: isPublic,
        allow_downloads: allowDownloads,
        room_id: selectedRoom, // null = personal post, otherwise room ID
      });

      const postId = createResponse.data.post.id;
      setUploadProgress(10);

      // Step 2: Upload media file
      const formData = new FormData();
      formData.append('file', selectedFile);

      await apiClient.post(`/api/posts/${postId}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 90) / progressEvent.total) + 10;
          setUploadProgress(percentCompleted);
        },
      });

      setUploadProgress(100);
      toast.success('Post uploaded successfully! 🎉');

      // Reset form
      setSelectedFile(null);
      setPreviewUrl(null);
      setTitle('');
      setDescription('');
      setIsPublic(true);
      setAllowDownloads(true);
      setSelectedRoom(null);

      if (onSuccess) onSuccess();
      onClose();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error.response?.data?.error || 'Failed to upload post');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-gray-700/50">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700/50">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Upload className="w-6 h-6 text-purple-400" />
            Upload Post
          </h2>
          <button
            onClick={onClose}
            disabled={uploading}
            className="p-2 rounded-lg bg-gray-700/50 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* File Upload Area */}
          {!selectedFile ? (
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
                dragActive
                  ? 'border-purple-500 bg-purple-500/10'
                  : 'border-gray-600 hover:border-purple-500/50 hover:bg-gray-800/50'
              }`}
            >
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 bg-purple-600/20 rounded-full flex items-center justify-center">
                  <Upload className="w-8 h-8 text-purple-400" />
                </div>
                <div>
                  <p className="text-white font-semibold mb-1">Drop your file here or click to browse</p>
                  <p className="text-gray-400 text-sm">Video (max 500MB, 90s) or Image (max 10MB)</p>
                  <p className="text-gray-500 text-xs mt-2">MP4, WebM, MOV, JPG, PNG, WebP, GIF</p>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*,image/*"
                onChange={(e) => handleFileSelection(e.target.files[0])}
                className="hidden"
              />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Preview */}
              <div className="relative bg-black rounded-xl overflow-hidden">
                {selectedFile.type.startsWith('video/') ? (
                  <video src={previewUrl} controls className="w-full max-h-96 object-contain" />
                ) : (
                  <img src={previewUrl} alt="Preview" className="w-full max-h-96 object-contain" />
                )}
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setPreviewUrl(null);
                  }}
                  disabled={uploading}
                  className="absolute top-2 right-2 p-2 bg-red-600 hover:bg-red-700 rounded-full text-white transition-colors disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Title <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={uploading}
                  maxLength={255}
                  placeholder="Give your post a catchy title..."
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                />
                <p className="text-xs text-gray-500 mt-1">{title.length}/255</p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={uploading}
                  maxLength={2000}
                  rows={3}
                  placeholder="Add a description (optional)"
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none disabled:opacity-50"
                />
                <p className="text-xs text-gray-500 mt-1">{description.length}/2000</p>
              </div>

              {/* Room Selection (only show if user hosts rooms) */}
              {loadingRooms ? (
                <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700 flex items-center gap-2 text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Loading rooms...</span>
                </div>
              ) : hostedRooms.length > 0 ? (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Post to
                  </label>
                  <select
                    value={selectedRoom || ''}
                    onChange={(e) => setSelectedRoom(e.target.value ? parseInt(e.target.value) : null)}
                    disabled={uploading}
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                  >
                    <option value="">My Profile (Personal Post)</option>
                    {hostedRooms.map(room => (
                      <option key={room.id} value={room.id}>
                        {room.name} ({room.member_count || 0} members)
                      </option>
                    ))}
                  </select>
                  {selectedRoom && (
                    <p className="text-xs text-purple-400 mt-2 flex items-center gap-1">
                      <Film className="w-3 h-3" />
                      This post will appear in RoomTV and notify all members
                    </p>
                  )}
                </div>
              ) : null}

              {/* Privacy Toggle */}
              <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                <div>
                  <p className="text-white font-medium">Public Post</p>
                  <p className="text-xs text-gray-400">Anyone can see this post</p>
                </div>
                <button
                  onClick={() => setIsPublic(!isPublic)}
                  disabled={uploading}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                    isPublic ? 'bg-purple-600' : 'bg-gray-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isPublic ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Allow Downloads Toggle (only for videos) */}
              {selectedFile && ACCEPTED_VIDEO_TYPES.includes(selectedFile.type) && (
                <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                  <div>
                    <p className="text-white font-medium flex items-center gap-2">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                      Allow Downloads
                    </p>
                    <p className="text-xs text-gray-400">Let viewers download this video (with WeWatch watermark)</p>
                  </div>
                  <button
                    onClick={() => setAllowDownloads(!allowDownloads)}
                    disabled={uploading}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                      allowDownloads ? 'bg-cyan-600' : 'bg-gray-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        allowDownloads ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              )}

              {/* Upload Progress */}
              {uploading && (
                <div className="space-y-2">
                  <div className="bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-purple-600 h-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="text-center text-sm text-gray-400">{uploadProgress}% uploaded</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {selectedFile && (
          <div className="border-t border-gray-700/50 p-6">
            <button
              onClick={handleUpload}
              disabled={uploading || !title.trim()}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  Upload Post
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
