// src/components/cinema/3d-cinema/CinemaLoadingOverlay.jsx
import React from 'react';
import AppSplash from '../../AppSplash';

const statusMessages = {
  connecting:       'Connecting to cinema...',
  connecting_voice: 'Connecting to voice chat...',
  finding_seat:     'Finding your seat...',
  loading_scene:    'Loading 3D theater...',
};

export default function CinemaLoadingOverlay({ status = 'connecting' }) {
  const text = statusMessages[status] || statusMessages.connecting;
  return <AppSplash statusText={text} />;
}
