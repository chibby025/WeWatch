// LetsWatchOut Upload Service Worker
// Handles upload pause/resume notifications when tab is closed

const CACHE_NAME = 'lwo-upload-v1';
const UPLOAD_QUEUE_KEY = 'lwo_upload_queue';

// Note: Service Workers can't access localStorage or handle file uploads directly
// This SW provides:
// 1. Notifications when user closes tab during upload
// 2. Persistent storage of upload state
// 3. Resume prompts when user returns

self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker activated');
  event.waitUntil(self.clients.claim());
});

// Listen for messages from main thread
self.addEventListener('message', async (event) => {
  const { type, data } = event.data;

  switch (type) {
    case 'UPLOAD_PAUSED':
      await handleUploadPaused(data);
      break;
    
    case 'UPLOAD_COMPLETED':
      await handleUploadCompleted(data);
      break;
    
    case 'CANCEL_UPLOAD':
      await handleUploadCancel(data.uploadId);
      break;
    
    case 'GET_UPLOAD_STATUS':
      await sendUploadStatus(data.uploadId, event.source);
      break;
    
    default:
      console.log('[SW] Unknown message type:', type);
  }
});

// Handle notification click - reopen room page
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const { uploadId, roomId } = event.notification.data || {};
  
  if (roomId) {
    event.waitUntil(
      clients.openWindow(`/cinema/${roomId}`)
    );
  }
});

// Handle upload paused notification
async function handleUploadPaused(uploadData) {
  const { 
    uploadId, 
    fileName, 
    totalChunks,
    uploadedChunks,
    remainingChunks,
    roomId 
  } = uploadData;

  console.log('[SW] Upload paused:', {
    uploadId,
    fileName,
    remainingChunks: remainingChunks.length,
    totalChunks
  });

  // Save to queue for tracking
  const queue = await getUploadQueue();
  queue[uploadId] = {
    ...uploadData,
    status: 'paused',
    pausedAt: Date.now()
  };
  await saveUploadQueue(queue);

  // Show notification
  const progress = Math.round((uploadedChunks.length / totalChunks) * 100);
  
  await showNotification(
    'Upload Paused',
    {
      body: `Upload of ${fileName} was paused at ${progress}%. Click to resume.`,
      tag: `upload-${uploadId}`,
      icon: '/logo.png',
      requireInteraction: true,
      data: { uploadId, roomId },
      actions: [
        { action: 'resume', title: 'Resume Upload' }
      ]
    }
  );
}

// Handle upload completed
async function handleUploadCompleted(uploadData) {
  const { uploadId, fileName, roomId } = uploadData;

  console.log('[SW] Upload completed:', uploadId);

  // Update queue
  const queue = await getUploadQueue();
  if (queue[uploadId]) {
    queue[uploadId].status = 'completed';
    queue[uploadId].completedAt = Date.now();
    await saveUploadQueue(queue);
  }

  // Show success notification
  await showNotification(
    'Upload Complete',
    {
      body: `${fileName} uploaded successfully`,
      tag: `upload-${uploadId}`,
      icon: '/logo.png',
      data: { uploadId, roomId }
    }
  );
}

// Handle upload cancellation
async function handleUploadCancel(uploadId) {
  console.log('[SW] Cancelling upload:', uploadId);
  
  const queue = await getUploadQueue();
  if (queue[uploadId]) {
    queue[uploadId].status = 'cancelled';
    queue[uploadId].cancelledAt = Date.now();
    await saveUploadQueue(queue);
  }
}

// Send upload status to client
async function sendUploadStatus(uploadId, client) {
  const queue = await getUploadQueue();
  const upload = queue[uploadId];

  if (client && client.postMessage) {
    client.postMessage({
      type: 'UPLOAD_STATUS',
      data: upload || { uploadId, status: 'not_found' }
    });
  }
}

// Show browser notification
async function showNotification(title, options) {
  // Check notification permission before attempting to show
  if (Notification.permission !== 'granted') {
    console.log('[SW] Notification skipped (permission not granted)');
    return;
  }

  if (self.registration && self.registration.showNotification) {
    try {
      await self.registration.showNotification(title, options);
    } catch (error) {
      console.log('[SW] Notification not shown:', error.message);
    }
  }
}

// Get upload queue from Cache API
async function getUploadQueue() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(UPLOAD_QUEUE_KEY);
    
    if (response) {
      const data = await response.json();
      return data;
    }
  } catch (error) {
    console.error('[SW] Error reading upload queue:', error);
  }
  
  return {};
}

// Save upload queue to Cache API
async function saveUploadQueue(queue) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = new Response(JSON.stringify(queue), {
      headers: { 'Content-Type': 'application/json' }
    });
    await cache.put(UPLOAD_QUEUE_KEY, response);
  } catch (error) {
    console.error('[SW] Error saving upload queue:', error);
  }
}
