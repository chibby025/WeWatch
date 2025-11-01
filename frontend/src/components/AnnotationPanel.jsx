import React from 'react';

const AnnotationPanel = ({ annotations, showAnnotations, onClose }) => {
  if (!showAnnotations) return null;
  
  return (
    <div className="fixed bottom-20 right-4 w-80 bg-black bg-opacity-80 text-white p-4 rounded-lg max-h-64 overflow-y-auto z-50 animate-fade-in-up">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold">Annotations</h3>
        <button 
          onClick={onClose}
          className="text-gray-400 hover:text-white text-sm"
        >
          ×
        </button>
      </div>
      
      {annotations.length === 0 ? (
        <p className="text-gray-400 text-sm">No annotations yet</p>
      ) : (
        annotations.map((annotation) => (
          <div 
            key={annotation.id}
            className="mb-3 p-3 bg-gray-800 rounded-lg animate-slide-in-right"
          >
            <div className="text-sm">{annotation.text}</div>
            <div className="text-xs opacity-75 mt-1 flex justify-between">
              <span>By User {annotation.user_id}</span>
              <span>{formatTime(annotation.timestamp)}</span>
            </div>
          </div>
        ))
      )}
    </div>
  );
};

// Helper function to format time
const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export default AnnotationPanel;