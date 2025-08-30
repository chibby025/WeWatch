// WeWatch/frontend/src/components/MediaItem.jsx
import React from 'react';

const MediaItem = ({ item, onSelect, isSelected }) => {
  // Format file size for display
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <li className={`media-item ${isSelected ? 'selected' : ''}`}>
      <div className="media-item-info">
        <span className="media-item-name">{item.original_name}</span>
        <span className="media-item-size">{formatFileSize(item.file_size)}</span>
        <span className="media-item-uploader">Uploaded by: User {item.uploader_id}</span> {/* Fetch username later */}
      </div>
      <button onClick={onSelect} disabled={isSelected}>
        {isSelected ? 'Playing...' : 'Play'}
      </button>
    </li>
  );
};

export default MediaItem;