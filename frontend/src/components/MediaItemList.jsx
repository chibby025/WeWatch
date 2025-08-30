// WeWatch/frontend/src/components/MediaItemList.jsx
import React from 'react';
import MediaItem from './MediaItem'; 

const MediaItemList = ({ mediaItems, onSelectItem, selectedItemId }) => {
  if (!mediaItems || mediaItems.length === 0) {
    return <p>No media items uploaded yet.</p>;
  }

  return (
    <div className="media-item-list">
      <h3>Media Items in Room</h3>
      <ul>
        {mediaItems.map((item) => (
          <MediaItem 
            key={item.id} 
            item={item} 
            onSelect={() => onSelectItem(item)} 
            isSelected={item.id === selectedItemId}
          />
        ))}
      </ul>
    </div>
  );
};

export default MediaItemList;