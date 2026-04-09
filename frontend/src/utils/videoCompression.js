// Video Compression Utility using FFmpeg.wasm
// Provides client-side video compression before upload

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpegInstance = null;
let isFFmpegLoaded = false;

/**
 * Compression presets optimized for African market
 */
export const COMPRESSION_PRESETS = {
  low: {
    label: '💰 Save Data (480p)',
    description: 'Best for 2G/3G - Saves 70% data',
    resolution: '854x480',
    bitrate: '1M',
    fps: 24,
    savings: 0.7 // 70% reduction
  },
  medium: {
    label: '⚖️ Balanced (720p)',
    description: 'Good for 4G - Saves 50% data',
    resolution: '1280x720',
    bitrate: '2M',
    fps: 30,
    savings: 0.5 // 50% reduction
  },
  high: {
    label: '🎬 Best Quality (1080p)',
    description: 'WiFi recommended - Saves 20% data',
    resolution: '1920x1080',
    bitrate: '4M',
    fps: 30,
    savings: 0.2 // 20% reduction
  },
  none: {
    label: '⚡ Original Quality',
    description: 'No compression - WiFi only',
    resolution: null,
    bitrate: null,
    fps: null,
    savings: 0
  }
};

/**
 * Load FFmpeg.wasm instance
 * @returns {Promise<FFmpeg>} Loaded FFmpeg instance
 */
export const loadFFmpeg = async () => {
  if (isFFmpegLoaded && ffmpegInstance) {
    console.log('✅ [FFmpeg] Using cached instance');
    return ffmpegInstance;
  }

  console.log('🎬 [FFmpeg] Loading FFmpeg.wasm...');
  const loadStartTime = Date.now();
  
  const ffmpeg = new FFmpeg();
  
  // Set up logging
  ffmpeg.on('log', ({ message }) => {
    console.log('🎬 [FFmpeg]', message);
  });
  
  // Set up progress logging
  ffmpeg.on('progress', ({ progress, time }) => {
    console.log(`🎬 [FFmpeg] Load progress: ${(progress * 100).toFixed(1)}% (${time}ms)`);
  });

  // Try multiple CDNs in order
  const cdnUrls = [
    'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd',
    'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd',
  ];

  for (let i = 0; i < cdnUrls.length; i++) {
    const baseURL = cdnUrls[i];
    const attemptNum = i + 1;
    
    try {
      console.log(`📥 [FFmpeg] Attempt ${attemptNum}/${cdnUrls.length} - Downloading from ${baseURL.split('/')[2]}...`);
      console.log(`   - Core JS: ${baseURL}/ffmpeg-core.js`);
      console.log(`   - Core WASM: ${baseURL}/ffmpeg-core.wasm`);
      
      // ✅ Test if SharedArrayBuffer is available (required for FFmpeg)
      if (typeof SharedArrayBuffer === 'undefined') {
        console.error('❌ [FFmpeg] SharedArrayBuffer not available! Check COOP/COEP headers.');
        console.error('   Required headers:');
        console.error('   - Cross-Origin-Embedder-Policy: require-corp');
        console.error('   - Cross-Origin-Opener-Policy: same-origin');
        throw new Error('SharedArrayBuffer is not available. Missing security headers.');
      } else {
        console.log('✅ [FFmpeg] SharedArrayBuffer is available');
      }
      
      const loadPromise = ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      
      // Add 60 second timeout per attempt (increased for slow connections)
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`FFmpeg load timeout after 60 seconds (attempt ${attemptNum})`)), 60000)
      );
      
      await Promise.race([loadPromise, timeoutPromise]);
      
      const loadDuration = ((Date.now() - loadStartTime) / 1000).toFixed(2);
      console.log(`✅ [FFmpeg] Loaded successfully from ${baseURL.split('/')[2]} in ${loadDuration}s`);
      
      ffmpegInstance = ffmpeg;
      isFFmpegLoaded = true;
      
      return ffmpeg;
    } catch (error) {
      const loadDuration = ((Date.now() - loadStartTime) / 1000).toFixed(2);
      console.error(`❌ [FFmpeg] Attempt ${attemptNum} failed after ${loadDuration}s:`, error.message);
      console.error(`   Error type: ${error.name}`);
      console.error(`   Stack trace:`, error.stack?.substring(0, 200));
      
      // If this was the last attempt, throw the error
      if (i === cdnUrls.length - 1) {
        throw new Error(`Failed to load FFmpeg from all CDN sources after ${loadDuration}s. Please check your internet connection or try uploading without compression.`);
      }
      
      // Otherwise, continue to next CDN
      console.log(`⏭️ [FFmpeg] Trying next CDN...`);
    }
  }
};

/**
 * Estimate compressed file size
 * @param {number} originalSize - Original file size in bytes
 * @param {string} preset - Compression preset key
 * @returns {number} Estimated compressed size in bytes
 */
export const estimateCompressedSize = (originalSize, preset) => {
  const presetConfig = COMPRESSION_PRESETS[preset];
  if (!presetConfig || preset === 'none') {
    return originalSize;
  }
  
  return Math.round(originalSize * (1 - presetConfig.savings));
};

/**
 * Format file size for display
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted size string
 */
export const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
};

/**
 * Compress video file using FFmpeg.wasm
 * @param {File} file - Video file to compress
 * @param {string} preset - Compression preset ('low', 'medium', 'high', 'none')
 * @param {Function} onProgress - Progress callback (0-100)
 * @returns {Promise<File>} Compressed video file
 */
export const compressVideo = async (file, preset = 'medium', onProgress = null) => {
  if (preset === 'none') {
    console.log('⚡ [Compression] Skipping compression (preset: none)');
    return file;
  }

  const presetConfig = COMPRESSION_PRESETS[preset];
  if (!presetConfig) {
    throw new Error(`Invalid preset: ${preset}`);
  }

  console.log(`🎬 [Compression] Starting with preset: ${preset}`, presetConfig);

  try {
    // Load FFmpeg
    const ffmpeg = await loadFFmpeg();

    // Write input file to FFmpeg virtual filesystem
    const inputName = 'input' + getFileExtension(file.name);
    const outputName = 'output.mp4';
    
    console.log(`📥 [Compression] Writing input file: ${inputName} (${formatFileSize(file.size)})`);
    await ffmpeg.writeFile(inputName, await fetchFile(file));

    // Build FFmpeg command
    const args = [
      '-i', inputName,
      '-c:v', 'libx264', // H.264 codec
      '-preset', 'fast', // Fast encoding
      '-crf', '23', // Quality (lower = better, 18-28 range)
    ];

    // Add resolution scaling if specified
    if (presetConfig.resolution) {
      args.push('-vf', `scale=${presetConfig.resolution}:force_original_aspect_ratio=decrease`);
    }

    // Add bitrate limit
    if (presetConfig.bitrate) {
      args.push('-b:v', presetConfig.bitrate);
      args.push('-maxrate', presetConfig.bitrate);
      args.push('-bufsize', '2M');
    }

    // Add FPS limit
    if (presetConfig.fps) {
      args.push('-r', presetConfig.fps.toString());
    }

    // Audio settings (compress audio too)
    args.push('-c:a', 'aac');
    args.push('-b:a', '128k');
    args.push('-ac', '2'); // Stereo

    // Output file
    args.push(outputName);

    console.log('🎬 [Compression] FFmpeg command:', args.join(' '));

    // Track progress
    let lastProgress = 0;
    ffmpeg.on('progress', ({ progress, time }) => {
      const percent = Math.round(progress * 100);
      if (percent !== lastProgress && onProgress) {
        lastProgress = percent;
        onProgress({
          percent,
          time: Math.round(time / 1000), // Convert to seconds
          stage: 'compression'
        });
        console.log(`🎬 [Compression] Progress: ${percent}%`);
      }
    });

    // Execute compression
    await ffmpeg.exec(args);

    // Read compressed file
    console.log('📤 [Compression] Reading compressed file...');
    const data = await ffmpeg.readFile(outputName);
    const compressedBlob = new Blob([data.buffer], { type: 'video/mp4' });
    
    // Create File object
    const compressedFile = new File(
      [compressedBlob],
      file.name.replace(/\.[^/.]+$/, '.mp4'), // Change extension to .mp4
      { type: 'video/mp4' }
    );

    // Cleanup
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);

    const compressionRatio = ((1 - compressedFile.size / file.size) * 100).toFixed(1);
    
    console.log('✅ [Compression] Complete:', {
      original: formatFileSize(file.size),
      compressed: formatFileSize(compressedFile.size),
      saved: formatFileSize(file.size - compressedFile.size),
      ratio: compressionRatio + '%'
    });

    return compressedFile;

  } catch (error) {
    console.error('❌ [Compression] Failed:', error);
    throw new Error(`Compression failed: ${error.message}`);
  }
};

/**
 * Get file extension from filename
 * @param {string} filename - File name
 * @returns {string} File extension with dot
 */
const getFileExtension = (filename) => {
  const match = filename.match(/\.[^/.]+$/);
  return match ? match[0] : '.mp4';
};

/**
 * Check if compression is recommended based on network quality
 * @param {string} networkQuality - Network quality indicator
 * @returns {string} Recommended preset
 */
export const getRecommendedPreset = (networkQuality) => {
  const recommendations = {
    '2g': 'low',
    '3g': 'low',
    '4g': 'medium',
    'wifi': 'high',
    'unknown': 'medium'
  };
  
  return recommendations[networkQuality] || 'medium';
};

/**
 * Should force compression (2G/3G networks)
 * @param {string} networkQuality - Network quality indicator
 * @returns {boolean} True if compression should be forced
 */
export const shouldForceCompression = (networkQuality) => {
  return networkQuality === '2g' || networkQuality === '3g';
};
