// Hook for Service Worker upload notifications
import { useEffect, useRef, useState } from 'react';

export const useUploadServiceWorker = () => {
  const [isSupported, setIsSupported] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const swRegistrationRef = useRef(null);
  const messageHandlersRef = useRef(new Map());

  // Register service worker on mount
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      setIsSupported(true);
      registerServiceWorker();
    } else {
      console.log('[Upload SW] Service Workers not supported');
    }

    return () => {
      // Cleanup message listener
      if (navigator.serviceWorker) {
        navigator.serviceWorker.removeEventListener('message', handleMessage);
      }
    };
  }, []);

  // Register the service worker
  const registerServiceWorker = async () => {
    try {
      const registration = await navigator.serviceWorker.register('/upload-sw.js', {
        scope: '/'
      });

      swRegistrationRef.current = registration;
      setIsRegistered(true);

      console.log('[Upload SW] Registered successfully');

      // Listen for messages from SW
      navigator.serviceWorker.addEventListener('message', handleMessage);

      // Request notification permission
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
      }

    } catch (error) {
      console.error('[Upload SW] Registration failed:', error);
    }
  };

  // Handle messages from service worker
  const handleMessage = (event) => {
    const { type, data } = event.data;

    // Call registered handler for this message type
    const handler = messageHandlersRef.current.get(type);
    if (handler) {
      handler(data);
    }
  };

  // Register a message handler
  const onMessage = (type, handler) => {
    messageHandlersRef.current.set(type, handler);

    // Return unregister function
    return () => {
      messageHandlersRef.current.delete(type);
    };
  };

  // Send message to service worker
  const sendMessage = async (type, data) => {
    if (!swRegistrationRef.current || !swRegistrationRef.current.active) {
      console.error('[Upload SW] Service worker not active');
      return;
    }

    swRegistrationRef.current.active.postMessage({
      type,
      data
    });
  };

  // Notify SW that upload was paused
  const notifyUploadPaused = async (uploadData) => {
    if (!isRegistered) return;
    await sendMessage('UPLOAD_PAUSED', uploadData);
  };

  // Notify SW that upload completed
  const notifyUploadCompleted = async (uploadData) => {
    if (!isRegistered) return;
    await sendMessage('UPLOAD_COMPLETED', uploadData);
  };

  // Cancel background upload
  const cancelUpload = async (uploadId) => {
    if (!isRegistered) return;
    await sendMessage('CANCEL_UPLOAD', { uploadId });
  };

  // Get upload status
  const getUploadStatus = async (uploadId) => {
    if (!isRegistered) return null;
    
    return new Promise((resolve) => {
      const unregister = onMessage('UPLOAD_STATUS', (data) => {
        unregister();
        resolve(data);
      });
      
      sendMessage('GET_UPLOAD_STATUS', { uploadId });
    });
  };

  return {
    isSupported,
    isRegistered,
    notifyUploadPaused,
    notifyUploadCompleted,
    cancelUpload,
    getUploadStatus,
    onMessage
  };
};
