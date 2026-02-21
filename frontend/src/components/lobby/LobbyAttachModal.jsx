// WeWatch/frontend/src/components/lobby/LobbyAttachModal.jsx
import React, { useState, useRef } from 'react';
import { XMarkIcon, PhotoIcon, VideoCameraIcon, DocumentIcon } from '@heroicons/react/24/solid';
import toast from 'react-hot-toast';

const LobbyAttachModal = ({ isOpen, onClose, onSend, recipientId }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileType, setFileType] = useState(null); // 'image', 'video', 'document'
  const [previewUrl, setPreviewUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  // File size limits
  const MAX_SIZES = {
    image: 5 * 1024 * 1024, // 5MB
    video: 50 * 1024 * 1024, // 50MB
    document: 10 * 1024 * 1024 // 10MB
  };

  // Accepted file types
  const ACCEPT_TYPES = {
    image: 'image/jpeg,image/png,image/gif,image/webp',
    video: 'video/mp4,video/webm,video/quicktime',
    document: 'application/pdf,.doc,.docx,.txt'
  };

  const handleFileSelect = (type) => {
    setFileType(type);
    fileInputRef.current.accept = ACCEPT_TYPES[type];
    fileInputRef.current.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file size
    if (file.size > MAX_SIZES[fileType]) {
      toast.error(`File too large! Max size: ${MAX_SIZES[fileType] / 1024 / 1024}MB`);
      return;
    }

    // Validate file type
    const validTypes = {
      image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
      video: ['video/mp4', 'video/webm', 'video/quicktime'],
      document: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
    };

    if (!validTypes[fileType].includes(file.type) && fileType !== 'document') {
      toast.error('Invalid file type!');
      return;
    }

    setSelectedFile(file);

    // Generate preview for images/videos
    if (fileType === 'image' || fileType === 'video') {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  const handleSend = async () => {
    if (!selectedFile || !recipientId) return;

    setUploading(true);
    try {
      await onSend(fileType, selectedFile, recipientId);
      handleClose();
    } catch (err) {
      console.error('Upload failed:', err);
      toast.error('Failed to send file');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setFileType(null);
    setPreviewUrl(null);
    setUploading(false);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-600 to-green-700 px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Send File</h2>
          <button
            onClick={handleClose}
            className="text-white hover:bg-white/20 rounded-full p-1 transition-colors"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {!selectedFile ? (
            /* File Type Selection */
            <div className="space-y-3">
              <button
                onClick={() => handleFileSelect('image')}
                className="w-full flex items-center gap-4 p-4 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg transition-colors border-2 border-blue-200 dark:border-blue-800"
              >
                <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
                  <PhotoIcon className="w-6 h-6 text-white" />
                </div>
                <div className="text-left flex-1">
                  <p className="font-semibold text-gray-900 dark:text-white">Photo</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">JPG, PNG, GIF, WEBP (max 5MB)</p>
                </div>
              </button>

              <button
                onClick={() => handleFileSelect('video')}
                className="w-full flex items-center gap-4 p-4 bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/50 rounded-lg transition-colors border-2 border-purple-200 dark:border-purple-800"
              >
                <div className="w-12 h-12 bg-purple-500 rounded-full flex items-center justify-center">
                  <VideoCameraIcon className="w-6 h-6 text-white" />
                </div>
                <div className="text-left flex-1">
                  <p className="font-semibold text-gray-900 dark:text-white">Video</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">MP4, WEBM (max 50MB)</p>
                </div>
              </button>

              <button
                onClick={() => handleFileSelect('document')}
                className="w-full flex items-center gap-4 p-4 bg-green-50 dark:bg-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/50 rounded-lg transition-colors border-2 border-green-200 dark:border-green-800"
              >
                <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
                  <DocumentIcon className="w-6 h-6 text-white" />
                </div>
                <div className="text-left flex-1">
                  <p className="font-semibold text-gray-900 dark:text-white">Document</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">PDF, DOC, DOCX, TXT (max 10MB)</p>
                </div>
              </button>
            </div>
          ) : (
            /* File Preview & Send */
            <div className="space-y-4">
              {/* Preview */}
              <div className="bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden">
                {fileType === 'image' && (
                  <img src={previewUrl} alt="Preview" className="w-full max-h-64 object-contain" />
                )}
                {fileType === 'video' && (
                  <video src={previewUrl} controls className="w-full max-h-64" />
                )}
                {fileType === 'document' && (
                  <div className="p-8 text-center">
                    <DocumentIcon className="w-16 h-16 mx-auto text-gray-400 mb-3" />
                    <p className="font-medium text-gray-900 dark:text-white">{selectedFile.name}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                )}
              </div>

              {/* File Info */}
              <div className="text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {selectedFile.name} • {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setFileType(null);
                    if (previewUrl) {
                      URL.revokeObjectURL(previewUrl);
                      setPreviewUrl(null);
                    }
                  }}
                  className="flex-1 px-4 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-medium rounded-lg transition-colors"
                  disabled={uploading}
                >
                  Change File
                </button>
                <button
                  onClick={handleSend}
                  disabled={uploading}
                  className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors"
                >
                  {uploading ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          )}

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>
    </div>
  );
};

export default LobbyAttachModal;
