// Upload Chunker Utility
// Handles chunked file uploads with retry logic and resume support

/**
 * Split file into chunks
 * @param {File} file - File to split
 * @param {number} chunkSize - Size of each chunk in bytes (default 5MB)
 * @returns {Array} Array of chunk metadata
 */
export const splitFileIntoChunks = (file, chunkSize = 3 * 1024 * 1024) => {
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
  onProgress,
  onRetry,
  clientDuration = null,
  clientPosterBlob = null
}) => {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await uploadFn({
        chunk: chunk.blob,
        chunkIndex: chunk.index,
        totalChunks: chunk.totalChunks,
        uploadId,
        fileName,
        fileSize,
        roomId,
        sessionId,
        // Only meaningful on chunk 0 — uploadChunk decides whether to actually attach
        // these (no point sending the same blob/string with every chunk).
        clientDuration,
        clientPosterBlob
      });
      
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

      // Signals network strain to the caller (uploadChunksParallel uses this to back
      // off concurrency) regardless of whether a next attempt is about to happen.
      onRetry?.();

      // Wait before retry (exponential backoff: 1s, 2s, 4s)
      if (attempt < maxRetries) {
        const waitTime = Math.pow(2, attempt - 1) * 1000;
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
    '2g':     256 * 1024,        // 256KB for 2G  (~1.2s at 0.17 MB/s)
    '3g':     512 * 1024,        // 512KB for 3G  (~2.4s at 0.21 MB/s) — Railway proxy timeout fix
    '4g':     2 * 1024 * 1024,  // 2MB for 4G
    'wifi':   3 * 1024 * 1024,  // 3MB for WiFi (Vercel rewrite proxy has 4.5MB body limit — stay well under)
    'unknown': 512 * 1024,       // 512KB safe default
  };

  const size = chunkSizes[networkQuality] || chunkSizes['unknown'];
  console.log(`🌐 [Chunker] Network quality: ${networkQuality} → chunk size: ${(size / 1024 / 1024).toFixed(2)}MB`);
  return size;
};

/**
 * Get optimal upload concurrency based on network quality
 * @param {string} networkQuality - Network quality indicator
 * @returns {number} Number of chunks to upload in parallel
 */
export const getUploadConcurrency = (networkQuality) => {
  const concurrency = {
    '2g': 1,      // 1 chunk at a time for 2G (slow — serialise to avoid proxy timeouts)
    // 2 (not 1) for 3G — effectiveType is a heuristic and frequently misclassifies a
    // perfectly decent connection as 3G (e.g. real-world Vercel↔Railway round trips vs.
    // localhost), so starting fully serialized punishes a lot of users unnecessarily.
    // uploadChunksParallel adapts this up or down per-batch based on observed retries,
    // so this is just a starting guess, not a hard ceiling or floor.
    '3g': 2,
    '4g': 3,      // 3 chunks at once for 4G
    'wifi': 5,    // 5 chunks at once for WiFi
    'unknown': 3  // 3 chunks default
  };

  return concurrency[networkQuality] || concurrency['unknown'];
};

// Adaptive concurrency bounds — independent of the effectiveType-based starting guess
// above. A batch that completes with zero retries for two batches running bumps
// concurrency up by one (network has headroom); any retry within a batch drops it by
// one immediately (signals strain, e.g. the Railway-proxy-timeout case the static 2G/3G
// values were originally added to avoid). Floor/ceiling keep it from ever serializing
// to zero or running away to an unbounded number of simultaneous requests.
const MIN_ADAPTIVE_CONCURRENCY = 1;
const MAX_ADAPTIVE_CONCURRENCY = 6;
const CLEAN_BATCHES_BEFORE_RAMP_UP = 2;

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
  alreadyUploadedIndices = null,
  onProgress,
  clientDuration = null,
  clientPosterBlob = null
}) => {
  // Resume support: skip chunks already confirmed uploaded in a previous attempt —
  // re-sending them would still work (the backend overwrites by index), but wastes
  // bandwidth on exactly the large files this is most likely to matter for.
  const pendingChunks = alreadyUploadedIndices?.size
    ? chunks.filter(c => !alreadyUploadedIndices.has(c.index))
    : chunks;
  let completedChunks = alreadyUploadedIndices?.size ?? 0;

  console.log(`🚀 [Parallel Upload] Starting with ${concurrency} concurrent chunks (adaptive)` +
    (completedChunks > 0 ? ` (resuming — ${completedChunks}/${chunks.length} already done)` : ''));

  let currentConcurrency = Math.min(Math.max(concurrency, MIN_ADAPTIVE_CONCURRENCY), MAX_ADAPTIVE_CONCURRENCY);
  let cleanBatchStreak = 0;
  let batchNumber = 0;
  let i = 0;

  // Process chunks in batches — batch size (currentConcurrency) adapts after every
  // batch based on whether any chunk in it needed a retry, rather than staying fixed
  // for the whole upload. See the constants above for the ramp policy.
  while (i < pendingChunks.length) {
    const batch = pendingChunks.slice(i, i + currentConcurrency);
    batchNumber++;

    console.log(`📦 [Batch ${batchNumber}] Uploading chunks ${batch[0].index + 1}-${batch[batch.length - 1].index + 1} of ${chunks.length} (concurrency=${currentConcurrency})`);

    let hadRetryInBatch = false;

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
          // Only chunk 0 ever needs these — sending them with every chunk would just
          // mean re-uploading the same poster blob pointlessly on every request.
          clientDuration: chunk.index === 0 ? clientDuration : null,
          clientPosterBlob: chunk.index === 0 ? clientPosterBlob : null,
          onRetry: () => { hadRetryInBatch = true; },
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

    console.log(`✅ [Batch ${batchNumber}] Complete (${completedChunks}/${chunks.length} chunks uploaded)`);

    if (hadRetryInBatch) {
      const next = Math.max(MIN_ADAPTIVE_CONCURRENCY, currentConcurrency - 1);
      if (next !== currentConcurrency) {
        console.log(`📉 [Adaptive] Retry seen — backing off concurrency ${currentConcurrency} → ${next}`);
        currentConcurrency = next;
      }
      cleanBatchStreak = 0;
    } else {
      cleanBatchStreak++;
      if (cleanBatchStreak >= CLEAN_BATCHES_BEFORE_RAMP_UP && currentConcurrency < MAX_ADAPTIVE_CONCURRENCY) {
        currentConcurrency++;
        console.log(`📈 [Adaptive] ${CLEAN_BATCHES_BEFORE_RAMP_UP} clean batches — raising concurrency to ${currentConcurrency}`);
        cleanBatchStreak = 0;
      }
    }

    i += batch.length;
  }

  console.log(`🎉 [Parallel Upload] All ${chunks.length} chunks uploaded successfully`);
};
