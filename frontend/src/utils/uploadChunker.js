// Upload Chunker Utility
// Handles chunked file uploads with retry logic and resume support

/**
 * Split file into chunks
 * @param {File} file - File to split
 * @param {number} chunkSize - Size of each chunk in bytes (default 5MB)
 * @returns {Array} Array of chunk metadata
 */
export const splitFileIntoChunks = (file, chunkSize = 5 * 1024 * 1024) => {
  const chunks = [];
  const totalChunks = Math.ceil(file.size / chunkSize);
  
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    
    chunks.push({
      index: i,
      start,
      end,
      size: end - start,
      totalChunks,
      blob: file.slice(start, end)
    });
  }
  
  console.log(`📦 [Chunker] Split file into ${totalChunks} chunks (${(chunkSize / 1024 / 1024).toFixed(1)}MB each)`);
  return chunks;
};

/**
 * Generate unique upload ID
 * @returns {string} Unique upload identifier
 */
export const generateUploadId = () => {
  return `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Calculate chunk hash for integrity verification
 * @param {Blob} blob - Chunk blob
 * @returns {Promise<string>} Hash string
 */
export const calculateChunkHash = async (blob) => {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
};

/**
 * Save chunk upload state to localStorage
 * @param {string} uploadId - Upload identifier
 * @param {Object} state - Upload state
 */
export const saveChunkUploadState = (uploadId, state) => {
  const key = `wewatch_chunk_upload_${uploadId}`;
  localStorage.setItem(key, JSON.stringify({
    ...state,
    timestamp: Date.now()
  }));
};

/**
 * Load chunk upload state from localStorage
 * @param {string} uploadId - Upload identifier
 * @returns {Object|null} Saved state or null
 */
export const loadChunkUploadState = (uploadId) => {
  const key = `wewatch_chunk_upload_${uploadId}`;
  const saved = localStorage.getItem(key);
  
  if (!saved) return null;
  
  try {
    return JSON.parse(saved);
  } catch (e) {
    console.error('Failed to parse saved upload state:', e);
    return null;
  }
};

/**
 * Clear chunk upload state from localStorage
 * @param {string} uploadId - Upload identifier
 */
export const clearChunkUploadState = (uploadId) => {
  const key = `wewatch_chunk_upload_${uploadId}`;
  localStorage.removeItem(key);
  console.log(`🗑️ [Chunker] Cleared upload state for ${uploadId}`);
};

/**
 * Upload single chunk with retry logic
 * @param {Object} params - Upload parameters
 * @returns {Promise<Object>} Upload response
 */
export const uploadChunkWithRetry = async ({
  chunk,
  uploadId,
  fileName,
  fileSize,
  roomId,
  sessionId,
  uploadFn,
  maxRetries = 3,
  onProgress
}) => {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📤 [Chunk ${chunk.index + 1}/${chunk.totalChunks}] Attempt ${attempt}/${maxRetries}`);
      
      const response = await uploadFn({
        chunk: chunk.blob,
        chunkIndex: chunk.index,
        totalChunks: chunk.totalChunks,
        uploadId,
        fileName,
        fileSize,
        roomId,
        sessionId
      });
      
      console.log(`✅ [Chunk ${chunk.index + 1}/${chunk.totalChunks}] Uploaded successfully`);
      
      if (onProgress) {
        onProgress({
          chunkIndex: chunk.index,
          totalChunks: chunk.totalChunks,
          percent: Math.round(((chunk.index + 1) / chunk.totalChunks) * 100)
        });
      }
      
      return response;
      
    } catch (error) {
      lastError = error;
      console.error(`❌ [Chunk ${chunk.index + 1}/${chunk.totalChunks}] Attempt ${attempt} failed:`, error.message);
      
      // Don't retry if abort was called
      if (error.name === 'CanceledError' || error.message?.includes('cancel')) {
        throw error;
      }
      
      // Wait before retry (exponential backoff: 1s, 2s, 4s)
      if (attempt < maxRetries) {
        const waitTime = Math.pow(2, attempt - 1) * 1000;
        console.log(`⏳ [Chunk ${chunk.index + 1}/${chunk.totalChunks}] Retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  // All retries failed
  throw new Error(`Failed to upload chunk ${chunk.index + 1} after ${maxRetries} attempts: ${lastError.message}`);
};

/**
 * Get chunk size based on network quality
 * @param {string} networkQuality - Network quality indicator
 * @returns {number} Optimal chunk size in bytes
 */
export const getOptimalChunkSize = (networkQuality) => {
  const chunkSizes = {
    '2g': 1 * 1024 * 1024,      // 1MB for 2G
    '3g': 2 * 1024 * 1024,      // 2MB for 3G
    '4g': 5 * 1024 * 1024,      // 5MB for 4G
    'wifi': 10 * 1024 * 1024,   // 10MB for WiFi
    'unknown': 2 * 1024 * 1024  // 2MB conservative default (iOS Safari / Firefox have no Network API)
  };
  
  return chunkSizes[networkQuality] || chunkSizes['unknown'];
};

/**
 * Get optimal upload concurrency based on network quality
 * @param {string} networkQuality - Network quality indicator
 * @returns {number} Number of chunks to upload in parallel
 */
export const getUploadConcurrency = (networkQuality) => {
  const concurrency = {
    '2g': 2,      // 2 chunks at once for 2G
    '3g': 3,      // 3 chunks at once for 3G
    '4g': 5,      // 5 chunks at once for 4G
    'wifi': 5,    // 5 chunks at once for WiFi
    'unknown': 3  // 3 chunks default
  };
  
  return concurrency[networkQuality] || concurrency['unknown'];
};

/**
 * Upload chunks in parallel batches
 * @param {Object} params - Upload parameters
 * @returns {Promise<void>}
 */
export const uploadChunksParallel = async ({
  chunks,
  uploadId,
  fileName,
  fileSize,
  roomId,
  sessionId,
  uploadFn,
  concurrency = 3,
  maxRetries = 3,
  onProgress
}) => {
  console.log(`🚀 [Parallel Upload] Starting with ${concurrency} concurrent chunks`);
  
  let completedChunks = 0;
  
  // Process chunks in batches
  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = chunks.slice(i, i + concurrency);
    
    console.log(`📦 [Batch ${Math.floor(i / concurrency) + 1}] Uploading chunks ${i + 1}-${Math.min(i + concurrency, chunks.length)} of ${chunks.length}`);
    
    // Upload batch in parallel
    await Promise.all(
      batch.map(chunk =>
        uploadChunkWithRetry({
          chunk,
          uploadId,
          fileName,
          fileSize,
          roomId,
          sessionId,
          uploadFn,
          maxRetries,
          onProgress: ({ chunkIndex, totalChunks }) => {
            completedChunks++;
            const percent = Math.round((completedChunks / totalChunks) * 100);
            
            if (onProgress) {
              onProgress({
                chunkIndex,
                totalChunks,
                completedChunks,
                percent
              });
            }
          }
        })
      )
    );
    
    console.log(`✅ [Batch ${Math.floor(i / concurrency) + 1}] Complete (${completedChunks}/${chunks.length} chunks uploaded)`);
  }
  
  console.log(`🎉 [Parallel Upload] All ${chunks.length} chunks uploaded successfully`);
};
