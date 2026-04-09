// src/components/cinema/ui/LiveShareLayoutSelector.jsx
// Layout selector modal for LiveShare - Choose participant grid layout

import React from 'react';
import { X, Monitor, Camera, Grid2X2, Grid3x3, Users } from 'lucide-react';

export default function LiveShareLayoutSelector({
  hasGuest, // boolean - is there a guest selected?
  hasScreenShare, // boolean - will screen be shared?
  shareType, // 'camera' | 'screen' | 'both'
  mode, // 'regular' | 'podcast' | 'news' | 'show'
  onSelectLayout,
  onClose,
  embedded = false
}) {
  
  // ✅ Build layouts array based on shareType
  // Solo-view ONLY for camera-only mode (NO screen share)
  
  const layouts = [];
  
  // Solo-view: Only for camera-only (no screen share at all)
  if (shareType === 'camera') {
    layouts.push({
      id: 'solo-view',
      name: 'Solo View',
      description: 'Fullscreen host camera only',
      icon: Camera,
      disabled: false,
      gridPreview: '1x1'
    });
  }
  
  // Screen-share: Always available when screen sharing
  if (hasScreenShare) {
    layouts.push({
      id: 'screen-share',
      name: 'Screen Share',
      description: 'Fullscreen screen with optional camera PIP',
      icon: Monitor,
      disabled: false,
      gridPreview: '1x1 + PIP'
    });
  }
  
  // Split-view: Available when both streams exist (guest OR screen+camera)
  if (hasGuest || shareType === 'both') {
    layouts.push({
      id: 'split-view',
      name: 'Split View',
      description: 'Screen and camera side-by-side (responsive)',
      icon: Users,
      disabled: false,
      gridPreview: '50/50'
    });
  }
  
  // Panel-view: Requires guest AND screen share
  if (hasGuest && hasScreenShare) {
    layouts.push({
      id: 'panel-view',
      name: 'Panel View',
      description: 'Host + guest (top), screen (bottom)',
      icon: Grid3x3,
      disabled: false,
      gridPreview: '3-grid'
    });
  }
  
  // 🎨 Debug: Log available layouts
  console.log('🎨 [LiveShareLayoutSelector] Available layouts:', {
    mode,
    shareType,
    hasGuest,
    hasScreenShare,
    layoutCount: layouts.length,
    layoutIds: layouts.map(l => l.id)
  });
  
  const handleSelect = (layoutId) => {
    // Store layout preference
    localStorage.setItem('liveshare_layout_preference', layoutId);
    console.log('🎯 [LiveShareLayoutSelector] Layout selected:', layoutId);
    onSelectLayout(layoutId);
  };

  // Embedded version (for wizard)
  if (embedded) {
    return (
      <div className="w-full flex flex-col h-full">
        <div className="space-y-2.5">
          {layouts.map((layout) => {
            const IconComponent = layout.icon;
            const isDisabled = layout.disabled;
            
            return (
              <button
                key={layout.id}
                onClick={() => !isDisabled && handleSelect(layout.id)}
                disabled={isDisabled}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
                  isDisabled 
                    ? 'border-gray-800 bg-gray-900/50 opacity-40 cursor-not-allowed' 
                    : 'border-gray-700 bg-gray-800/50 hover:border-purple-500 hover:bg-gray-800 cursor-pointer'
                }`}
              >
                {/* Icon */}
                <div className={`w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  isDisabled ? 'bg-gray-800' : 'bg-purple-500/20'
                }`}>
                  <IconComponent size={22} className={isDisabled ? 'text-gray-600' : 'text-purple-400'} />
                </div>

                {/* Label */}
                <div className="flex-1 text-left">
                  <h3 className={`text-base md:text-lg font-semibold ${isDisabled ? 'text-gray-600' : 'text-white'}`}>
                    {layout.name}
                  </h3>
                  {isDisabled && (
                    <p className="text-xs text-gray-700 mt-0.5">
                      {!hasGuest && layout.id.includes('split') && 'Requires guest'}
                      {!hasGuest && layout.id === 'panel-view' && 'Requires guest'}
                      {!hasScreenShare && layout.id === 'screen-share' && 'Requires screen share'}
                      {!hasScreenShare && layout.id === 'panel-view' && !hasGuest && 'Requires guest & screen'}
                    </p>
                  )}
                </div>

                {/* Grid Badge */}
                <div className={`px-2.5 py-1 rounded text-xs font-medium flex-shrink-0 ${
                  isDisabled ? 'bg-gray-800 text-gray-600' : 'bg-purple-500/10 text-purple-400'
                }`}>
                  {layout.gridPreview}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Standalone modal version (backwards compatibility)
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div>
            <h2 className="text-2xl font-bold text-white">Choose Layout</h2>
            <p className="text-sm text-gray-400 mt-1">Select how participants will appear on screen</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        {/* Layout Grid */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {layouts.map((layout) => {
            const IconComponent = layout.icon;
            const isDisabled = layout.disabled;
            
            return (
              <button
                key={layout.id}
                onClick={() => !isDisabled && handleSelect(layout.id)}
                disabled={isDisabled}
                className={`
                  relative p-6 rounded-xl border-2 transition-all duration-200 text-left
                  ${isDisabled 
                    ? 'border-gray-800 bg-gray-900/50 opacity-50 cursor-not-allowed' 
                    : 'border-gray-700 bg-gray-800/50 hover:border-purple-500 hover:bg-gray-800 cursor-pointer'
                  }
                `}
              >
                {/* Icon */}
                <div className={`
                  w-12 h-12 rounded-lg flex items-center justify-center mb-4
                  ${isDisabled ? 'bg-gray-800' : 'bg-purple-500/20'}
                `}>
                  <IconComponent className={`w-6 h-6 ${isDisabled ? 'text-gray-600' : 'text-purple-400'}`} />
                </div>

                {/* Name & Description */}
                <h3 className={`text-lg font-bold mb-1 ${isDisabled ? 'text-gray-600' : 'text-white'}`}>
                  {layout.name}
                </h3>
                <p className={`text-sm ${isDisabled ? 'text-gray-700' : 'text-gray-400'}`}>
                  {layout.description}
                </p>

                {/* Grid Preview Badge */}
                <div className={`
                  mt-3 inline-block px-2 py-1 rounded text-xs font-medium
                  ${isDisabled ? 'bg-gray-800 text-gray-600' : 'bg-purple-500/10 text-purple-400'}
                `}>
                  {layout.gridPreview}
                </div>

                {/* Disabled Overlay */}
                {isDisabled && (
                  <div className="absolute top-3 right-3 px-2 py-1 bg-gray-800 rounded text-xs text-gray-500">
                    {!hasGuest && layout.id.includes('split') && 'No guest'}
                    {!hasGuest && layout.id === 'panel-view' && 'No guest'}
                    {!hasScreenShare && layout.id === 'screen-share' && 'No screen'}
                    {!hasScreenShare && layout.id === 'panel-view' && !hasGuest && 'No guest/screen'}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer Help Text */}
        <div className="p-6 border-t border-gray-800 bg-gray-900/50">
          <p className="text-sm text-gray-400">
            💡 <span className="font-medium">Tip:</span> You can change layout anytime during the broadcast.
            {!hasGuest && ' Add a guest to unlock Split View and Panel View.'}
            {!hasScreenShare && ' Enable screen sharing to unlock Screen Share and Panel View.'}
          </p>
        </div>
      </div>
    </div>
  );
}
