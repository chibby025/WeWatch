// src/hooks/useMediaUploadManager.js
//
// Owns the entire media-upload state machine (progress, pause/resume, retry,
// cancel) for the cinema LeftSidebar's "Upload to Playlist" feature.
//
// Why this lives in a hook instead of inside LeftSidebar.jsx: LeftSidebar is
// conditionally rendered ({isLeftSidebarOpen && <LeftSidebar/>}) by its parent
// pages, so it fully unmounts/remounts every time the sidebar is toggled. An
// in-progress upload (File object reference, AbortController, progress state)
// living inside LeftSidebar's own state would be destroyed the moment the user
// closes the sidebar. Call this hook once in the parent page (VideoWatch,
// CinemaScene3DDemo, LectureHallPage, PositionCalculatorPage) so the upload
// survives sidebar open/close, and pass the returned object down as a prop.
import { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import { uploadChunk, uploadFileToBunnyCDN, assembleUpload, API_BASE_URL } from '../services/api';
import {
  splitFileIntoChunks,
  generateUploadId,
  uploadChunksParallel,
  getOptimalChunkSize,
  getUploadConcurrency,
  saveChunkUploadState,
  clearChunkUploadState,
} from '../utils/uploadChunker';
import { useUploadServiceWorker } from './useUploadServiceWorker';

const playSuccess = () => new Audio('/sounds/success.mp3').play().catch(() => {});

const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
};

const getVideoDurationFromFile = (file) =>
  new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const s = Math.floor(video.duration) || 0;
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      resolve(
        `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
      );
      URL.revokeObjectURL(video.src);
    };
    video.onerror = () => { URL.revokeObjectURL(video.src); resolve('00:00:00'); };
    video.src = URL.createObjectURL(file);
  });

export default function useMediaUploadManager({ roomId, sessionId, onUploadComplete }) {
  const [uploading, setUploading] = useState(false);
  const [uploadPaused, setUploadPaused] = useState(false); // same-session pause on network drop
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState(0); // MB/s
  const [uploadETA, setUploadETA] = useState(''); // Estimated time remaining
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const uploadAbortControllerRef = useRef(null);
  const uploadStartTimeRef = useRef(null);
  const lastProgressUpdateRef = useRef(0); // Throttle progress updates
  const progressPersistenceTimerRef = useRef(null);
  // Refs for same-session auto-retry — always current, no stale-closure risk.
  // Because this hook is called once at the parent-page level (which does not
  // unmount when the sidebar toggles), these refs stay populated across
  // sidebar open/close — that's what makes the upload survive the toggle.
  const uploadFileRef = useRef(null);        // the live File object for the current upload
  const uploadPausedRef = useRef(false);     // mirrors uploadPaused without closure staleness
  const visibilityPauseRef = useRef(false);  // true when upload was paused by a tab switch (not user cancel)
  const uploadFileDirectRef = useRef(null);  // always points at the latest uploadFileDirect fn
  const posterPollTimerRef = useRef(null);

  const [networkQuality, setNetworkQuality] = useState('unknown');

  const uploadSW = useUploadServiceWorker();

  const [showUploadDisclaimer, setShowUploadDisclaimer] = useState(false);
  const [showResumeUpload, setShowResumeUpload] = useState(false);
  const [pendingResumeData, setPendingResumeData] = useState(null);
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(() => (
    localStorage.getItem('wewatch_upload_terms_accepted') === 'true'
  ));

  // Listen for SW status updates (not used in simplified approach but kept for future)
  useEffect(() => {
    if (!uploadSW.isRegistered) return;
    const unregister = uploadSW.onMessage('UPLOAD_STATUS', (data) => {
      console.log('[SW Status]:', data);
    });
    return unregister;
  }, [uploadSW.isRegistered]);

  // Check for incomplete uploads ONCE when this hook is created (true page
  // load / reload only — sidebar toggling never re-runs this, since this hook
  // lives in the parent page, not in LeftSidebar). If `uploadFileRef.current`
  // is already set, an upload survived in-memory and there's nothing to ask
  // about; this only fires for genuinely lost uploads (full page reload).
  useEffect(() => {
    // Dev path: chunks sent directly to Railway
    const uploadId = localStorage.getItem('current_upload_id');
    if (uploadId) {
      const stateStr = localStorage.getItem(`upload_chunks_${uploadId}`);
      if (!stateStr) {
        localStorage.removeItem('current_upload_id');
      } else {
        const state = JSON.parse(stateStr);
        const uploadedChunks = state.uploadedChunks || [];
        const remaining = state.totalChunks - uploadedChunks.length;
        if (remaining > 0) {
          console.log('📋 [Resume] Found incomplete dev upload:', {
            uploadId,
            fileName: state.fileName,
            progress: Math.round((uploadedChunks.length / state.totalChunks) * 100),
            remainingChunks: remaining,
          });
          setPendingResumeData({ ...state, uploadPath: 'dev' });
          setShowResumeUpload(true);
          return; // only show one resume prompt at a time
        } else {
          clearChunkUploadState(uploadId);
          localStorage.removeItem('current_upload_id');
        }
      }
    }

    // Production path: chunks go to BunnyCDN via Vercel edge function
    const bunnyId = localStorage.getItem('current_bunny_upload_id');
    if (!bunnyId) return;
    const bunnyStr = localStorage.getItem(`wewatch_bunny_upload_${bunnyId}`);
    if (!bunnyStr) {
      localStorage.removeItem('current_bunny_upload_id');
      return;
    }
    try {
      const state = JSON.parse(bunnyStr);
      const completed = state.completedChunks?.length ?? 0;
      const total = state.totalChunks ?? Math.ceil(state.fileSize / (state.chunkSize || 1));
      console.log('📋 [Resume] Found incomplete BunnyCDN upload:', {
        uploadId: bunnyId,
        fileName: state.fileName,
        progress: Math.round((completed / total) * 100),
        needsAssembly: state.needsAssembly ?? false,
      });
      setPendingResumeData({ ...state, uploadPath: 'bunny' });
      setShowResumeUpload(true);
    } catch (_) {
      localStorage.removeItem(`wewatch_bunny_upload_${bunnyId}`);
      localStorage.removeItem('current_bunny_upload_id');
    }
  }, []);

  // Detect network quality on mount
  useEffect(() => {
    const detectNetworkQuality = () => {
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (!connection) {
        setNetworkQuality(navigator.onLine === false ? '2g' : 'unknown');
        return;
      }
      const effectiveType = connection.effectiveType;
      if (effectiveType === 'slow-2g' || effectiveType === '2g') setNetworkQuality('2g');
      else if (effectiveType === '3g') setNetworkQuality('3g');
      else if (effectiveType === '4g') setNetworkQuality('4g');
      else setNetworkQuality('wifi');
    };

    detectNetworkQuality();

    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection) connection.addEventListener('change', detectNetworkQuality);

    const handleOffline = () => setNetworkQuality('2g');
    const handleOnline = () => detectNetworkQuality();
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      if (connection) connection.removeEventListener('change', detectNetworkQuality);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  // Notify SW that upload was paused, only on true tab/page close.
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!uploading || !uploadSW.isRegistered) return;
      const uploadId = localStorage.getItem('current_upload_id');
      const stateStr = localStorage.getItem(`upload_chunks_${uploadId}`);
      if (!uploadId || !stateStr) return;

      const state = JSON.parse(stateStr);
      const uploadedChunks = state.uploadedChunks || [];
      const remainingChunks = [];
      for (let i = 0; i < state.totalChunks; i++) {
        if (!uploadedChunks.includes(i)) remainingChunks.push(i);
      }
      if (remainingChunks.length === 0) return;

      console.log(`⚠️ [Tab Close] Notifying SW - ${remainingChunks.length}/${state.totalChunks} chunks remaining`);
      uploadSW.notifyUploadPaused({
        uploadId,
        fileName: state.fileName,
        fileSize: state.fileSize,
        totalChunks: state.totalChunks,
        uploadedChunks,
        remainingChunks,
        roomId: roomId || state.roomId,
        sessionId: sessionId || state.sessionId,
      });

      e.preventDefault();
      e.returnValue = 'Upload in progress. If you leave, you can resume when you return.';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [uploading, uploadSW, roomId, sessionId]);

  // Same-session auto-retry: resumes on network restore OR when the tab becomes visible
  // again after a background pause. Lives here (not in LeftSidebar) so closing/reopening
  // the sidebar never tears these listeners down mid-upload.
  useEffect(() => {
    const resume = () => {
      const bunnyId = localStorage.getItem('current_bunny_upload_id');
      let savedState = null;
      if (bunnyId) {
        try {
          savedState = JSON.parse(localStorage.getItem(`wewatch_bunny_upload_${bunnyId}`) || 'null');
        } catch (_) {}
      }
      uploadFileDirectRef.current?.(uploadFileRef.current, savedState);
    };

    const handleOnline = () => {
      if (!uploadPausedRef.current || !uploadFileRef.current) return;
      console.log('🔄 [AutoRetry] Connection restored — resuming upload automatically…');
      toast('Connection restored — resuming upload…', { icon: '📶' });
      resume();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (!uploadFileRef.current) return;
        visibilityPauseRef.current = true;
        uploadAbortControllerRef.current?.abort();
      } else {
        if (!visibilityPauseRef.current || !uploadFileRef.current) return;
        visibilityPauseRef.current = false;
        console.log('🔄 [VisibilityResume] Tab visible again — resuming upload…');
        resume();
      }
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    return () => { if (posterPollTimerRef.current) clearTimeout(posterPollTimerRef.current); };
  }, []);

  // Poll the temporary-media API until the newly uploaded item has a real poster.
  const pollForPoster = (itemId, attempt = 0) => {
    const MAX_ATTEMPTS = 10;
    const INTERVAL_MS = 3000;
    if (attempt >= MAX_ATTEMPTS || !itemId) return;

    posterPollTimerRef.current = setTimeout(async () => {
      try {
        const token = localStorage.getItem('wewatch_token');
        const resp = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/temporary-media`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) return;
        const data = await resp.json();
        const items = data.temporary_media_items || [];
        const target = items.find((it) => (it.ID || it.id) === itemId);
        if (target?.poster_url && !target.poster_url.includes('placeholder-poster')) {
          console.log(`🖼️ [PosterPoll] Poster ready for item ${itemId}: ${target.poster_url}`);
          if (onUploadComplete) { playSuccess(); onUploadComplete(); }
        } else {
          pollForPoster(itemId, attempt + 1);
        }
      } catch (_) {
        pollForPoster(itemId, attempt + 1);
      }
    }, INTERVAL_MS);
  };

  // ✅ CHUNKED UPLOAD FUNCTION WITH PARALLEL UPLOADS (dev path)
  const uploadFileChunked = async (file) => {
    setUploading(true);
    setUploadProgress(0);
    setUploadSpeed(0);
    setUploadETA('Calculating...');
    setUploadedBytes(0);
    setTotalBytes(file.size);
    uploadStartTimeRef.current = Date.now();
    lastProgressUpdateRef.current = Date.now();

    const abortController = new AbortController();
    uploadAbortControllerRef.current = abortController;

    const uploadId = generateUploadId();
    const chunkSize = getOptimalChunkSize(networkQuality);
    const chunks = splitFileIntoChunks(file, chunkSize);

    console.log(`📦 [Chunked Upload] Starting:`, {
      uploadId,
      fileName: file.name,
      fileSize: formatFileSize(file.size),
      totalChunks: chunks.length,
      chunkSize: formatFileSize(chunkSize),
    });

    saveChunkUploadState(uploadId, {
      uploadId,
      fileName: file.name,
      fileSize: file.size,
      totalChunks: chunks.length,
      uploadedChunks: [],
      sessionId,
      roomId,
    });

    localStorage.setItem('current_upload_id', uploadId);

    try {
      const startTime = Date.now();
      const concurrency = getUploadConcurrency(networkQuality);

      console.log(`🚀 [Parallel Upload] Using ${concurrency} concurrent uploads for ${networkQuality}`);

      await uploadChunksParallel({
        chunks,
        uploadId,
        fileName: file.name,
        fileSize: file.size,
        roomId,
        sessionId,
        uploadFn: uploadChunk,
        concurrency,
        maxRetries: 3,
        onProgress: ({ chunkIndex, totalChunks, completedChunks, percent }) => {
          const now = Date.now();
          if (now - lastProgressUpdateRef.current < 500 && percent < 100) return;
          lastProgressUpdateRef.current = now;

          const uploadedBytesNow = completedChunks * chunkSize;
          const elapsedSeconds = (now - startTime) / 1000;
          const speed = uploadedBytesNow / 1024 / 1024 / (elapsedSeconds || 1);
          const remainingBytes = file.size - uploadedBytesNow;
          const etaSeconds = remainingBytes / (speed * 1024 * 1024);

          setUploadProgress(percent);
          setUploadedBytes(uploadedBytesNow);
          setUploadSpeed(speed);

          if (etaSeconds < 60) setUploadETA(`${Math.round(etaSeconds)}s`);
          else if (etaSeconds < 3600) setUploadETA(`${Math.round(etaSeconds / 60)}m`);
          else setUploadETA(`${Math.round(etaSeconds / 3600)}h`);

          saveChunkUploadState(uploadId, {
            uploadId,
            fileName: file.name,
            fileSize: file.size,
            totalChunks: chunks.length,
            uploadedChunks: Array.from({ length: completedChunks }, (_, i) => i),
            sessionId,
            roomId,
            progress: percent,
          });
        },
      });

      console.log('✅ [Chunked Upload] Complete');
      setUploadProgress(100);
      clearChunkUploadState(uploadId);
      localStorage.removeItem('current_upload_id');

      if (uploadSW.isRegistered) {
        uploadSW.notifyUploadCompleted({ uploadId, fileName: file.name, roomId });
      }

      setTimeout(async () => {
        try {
          console.log('🎨 [Poster Retry] Fetching updated media items for poster...');
          const token = localStorage.getItem('wewatch_token');
          const response = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/temporary-media`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (response.ok) {
            const data = await response.json();
            console.log('🎨 [Poster Retry] Received updated media items:', data);
            if (onUploadComplete) { playSuccess(); onUploadComplete(); }
          }
        } catch (err) {
          console.warn('⚠️ [Poster Retry] Failed to fetch updated poster:', err);
        }
      }, 5000);

      if (onUploadComplete) { playSuccess(); onUploadComplete(); }
    } catch (err) {
      if (err.name === 'CanceledError' || err.message?.includes('cancel')) {
        console.log('🚫 [Upload] Cancelled');
        clearChunkUploadState(uploadId);
        localStorage.removeItem('current_upload_id');
        toast('Upload cancelled.');
      } else {
        console.error('❌ [Upload] Failed:', err);
        clearChunkUploadState(uploadId);
        localStorage.removeItem('current_upload_id');
        toast.error(`Upload failed: ${err.message}`);
      }
    } finally {
      localStorage.removeItem('wewatch_active_upload');
      localStorage.removeItem('current_upload_id');
      setUploading(false);
      setUploadProgress(0);
      setUploadSpeed(0);
      setUploadETA('');
      setUploadedBytes(0);
      setTotalBytes(0);
      uploadAbortControllerRef.current = null;
    }
  };

  // Direct BunnyCDN upload path (production only).
  // resumeState: saved state from a previous interrupted upload (Option A).
  const uploadFileDirect = async (file, resumeState = null) => {
    // Keep the ref current so the online/visibility auto-retry handler always finds this function.
    uploadFileDirectRef.current = uploadFileDirect;

    setUploading(true);
    setUploadPaused(false);
    uploadPausedRef.current = false;
    setUploadProgress(resumeState
      ? Math.round(((resumeState.completedChunks?.length ?? 0) / (resumeState.totalChunks ?? 1)) * 100)
      : 0);
    setUploadSpeed(0);
    setUploadETA('Calculating...');
    setUploadedBytes(0);
    setTotalBytes(file.size);
    uploadStartTimeRef.current = Date.now();

    const abortController = new AbortController();
    uploadAbortControllerRef.current = abortController;
    let shouldPause = false;

    let activeBunnyUploadId = null;

    const handleChunkComplete = (completedIndices, uploadId, chunkSize) => {
      activeBunnyUploadId = uploadId;
      const totalChunksEstimate = Math.ceil(file.size / chunkSize);
      localStorage.setItem('current_bunny_upload_id', uploadId);
      localStorage.setItem(`wewatch_bunny_upload_${uploadId}`, JSON.stringify({
        uploadId,
        fileName: file.name,
        fileSize: file.size,
        chunkSize,
        totalChunks: totalChunksEstimate,
        completedChunks: completedIndices,
        roomId,
        sessionId: sessionId || '',
        timestamp: Date.now(),
      }));
    };

    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'mp4';
      const uniqueId = resumeState?.uniqueId ?? crypto.randomUUID();
      const cdnFolder = (sessionId || resumeState?.sessionId) ? 'temp-media' : 'media';
      const cdnPath = resumeState?.cdnPath ?? `${cdnFolder}/${uniqueId}.${ext}`;
      const pullZoneUrl = import.meta.env.VITE_BUNNY_PULL_ZONE_URL?.replace(/\/$/, '');
      const cdnUrl = resumeState?.cdnUrl ?? `${pullZoneUrl}/${cdnPath}`;

      console.log(`🚀 [DirectUpload] ${resumeState ? 'Resuming' : 'Starting'}: ${file.name} → ${cdnPath}`);

      const duration = resumeState?.duration ?? await getVideoDurationFromFile(file);

      const startTime = Date.now();
      const { uploadId, totalChunks } = await uploadFileToBunnyCDN(
        file,
        cdnPath,
        (percent, loaded, total) => {
          const now = Date.now();
          if (now - lastProgressUpdateRef.current < 500 && percent < 100) return;
          lastProgressUpdateRef.current = now;

          const elapsedSeconds = (now - startTime) / 1000;
          const speed = loaded / 1024 / 1024 / (elapsedSeconds || 1);
          const remainingBytes = total - loaded;
          const etaSeconds = remainingBytes / (speed * 1024 * 1024);

          setUploadProgress(percent);
          setUploadedBytes(loaded);
          setUploadSpeed(speed);
          if (etaSeconds < 60) setUploadETA(`${Math.round(etaSeconds)}s`);
          else if (etaSeconds < 3600) setUploadETA(`${Math.round(etaSeconds / 60)}m`);
          else setUploadETA(`${Math.round(etaSeconds / 3600)}h`);
        },
        abortController.signal,
        resumeState,
        handleChunkComplete,
      );

      console.log(`[DirectUpload] All chunks on BunnyCDN, requesting assembly...`);
      setUploadProgress(99);

      if (activeBunnyUploadId) {
        localStorage.setItem(`wewatch_bunny_upload_${activeBunnyUploadId}`, JSON.stringify({
          uploadId,
          fileName: file.name,
          fileSize: file.size,
          chunkSize: resumeState?.chunkSize ?? Math.ceil(file.size / totalChunks),
          totalChunks,
          completedChunks: Array.from({ length: totalChunks }, (_, i) => i),
          roomId,
          sessionId: sessionId || '',
          cdnPath,
          cdnUrl,
          uniqueId,
          duration,
          needsAssembly: true,
          timestamp: Date.now(),
        }));
      }

      const assembleResp = await assembleUpload(roomId, {
        upload_id: uploadId,
        total_chunks: totalChunks,
        original_name: file.name,
        mime_type: file.type || `video/${ext}`,
        file_size: file.size,
        session_id: sessionId || '',
        duration,
      });

      if (activeBunnyUploadId) {
        localStorage.removeItem(`wewatch_bunny_upload_${activeBunnyUploadId}`);
        localStorage.removeItem('current_bunny_upload_id');
      }

      console.log('✅ [DirectUpload] DB record created');
      if (onUploadComplete) { playSuccess(); onUploadComplete(); }

      const newItemId = assembleResp?.data?.media_item_id;
      if (newItemId) pollForPoster(newItemId);
    } catch (err) {
      if (err.name === 'CanceledError' || err.message?.includes('cancel')) {
        if (visibilityPauseRef.current) {
          console.log('⏸ [DirectUpload] Paused (tab hidden) — will resume on return');
          shouldPause = true;
          uploadPausedRef.current = true;
          setUploadPaused(true);
          setUploadSpeed(0);
          setUploadETA('Resuming when you return…');
        } else {
          console.log('🚫 [DirectUpload] Cancelled');
          if (activeBunnyUploadId) {
            localStorage.removeItem(`wewatch_bunny_upload_${activeBunnyUploadId}`);
            localStorage.removeItem('current_bunny_upload_id');
          }
          uploadFileRef.current = null;
          toast('Upload cancelled.');
        }
      } else {
        console.error('❌ [DirectUpload] Network error, entering paused state:', err);
        shouldPause = true;
        uploadPausedRef.current = true;
        setUploadPaused(true);
        setUploadSpeed(0);
        setUploadETA('Waiting for connection…');
      }
    } finally {
      if (!shouldPause) {
        setUploading(false);
        setUploadProgress(0);
        setUploadSpeed(0);
        setUploadETA('');
        setUploadedBytes(0);
        setTotalBytes(0);
      }
      uploadAbortControllerRef.current = null;
    }
  };

  const handleFileUpload = async (files) => {
    if (!files?.length || !roomId) return;

    const file = files[0];

    const allowedTypes = [
      'video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska', 'video/matroska',
      'video/avi', 'video/x-msvideo', 'video/x-m4v', 'video/x-wmv',
      'video/3gpp', 'video/mp2t',
      'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg',
      'audio/flac', 'audio/aac', 'audio/x-m4a',
      'application/pdf',
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'text/plain',
    ];
    const allowedExtensions = [
      'mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v', 'wmv', '3gp', 'ts',
      'mp3', 'm4a', 'wav', 'ogg', 'flac', 'aac',
      'pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'txt',
    ];
    const ext = file.name.split('.').pop()?.toLowerCase();
    const typeOk = allowedTypes.includes(file.type) || (!file.type && allowedExtensions.includes(ext));
    if (!typeOk) {
      toast.error(`Invalid file type: ${file.type || ext}. Allowed: MP4, WebM, MOV, MKV, AVI, MP3, WAV, AAC, FLAC, PDF, PNG, JPG, GIF, TXT`);
      return;
    }

    const isDocument = file.type === 'application/pdf' || file.type === 'text/plain'
      || file.type?.startsWith('image/') || ['pdf', 'txt', 'jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
    const maxSize = isDocument ? 50 * 1024 * 1024 : 1 * 1024 * 1024 * 1024;
    const maxLabel = isDocument ? '50 MB' : '1 GB';
    if (file.size > maxSize) {
      toast.error(`File too large (${isDocument ? (file.size / 1024 / 1024).toFixed(1) + ' MB' : (file.size / 1024 / 1024 / 1024).toFixed(2) + ' GB'}). Maximum is ${maxLabel}.`);
      return;
    }

    if (file.size < 1024) {
      toast.error('File too small. Please select a valid media file.');
      return;
    }

    console.log('✅ [Validation] Passed:', { name: file.name, type: file.type, size: formatFileSize(file.size) });

    if (!hasAcceptedTerms) {
      setShowUploadDisclaimer(true);
      return;
    }

    let resumeState = null;
    if (
      pendingResumeData?.uploadPath === 'bunny' &&
      pendingResumeData.fileName === file.name &&
      pendingResumeData.fileSize === file.size
    ) {
      resumeState = pendingResumeData;
      setShowResumeUpload(false);
      setPendingResumeData(null);
      const completed = resumeState.completedChunks?.length ?? 0;
      const total = resumeState.totalChunks ?? 1;
      toast.success(`Resuming from ${Math.round((completed / total) * 100)}%…`);
    }

    // Keep the File object alive for same-session auto-retry on network drop —
    // and now, since this hook outlives sidebar toggles, alive across those too.
    uploadFileRef.current = file;
    uploadFileDirectRef.current = uploadFileDirect;

    if (import.meta.env.PROD) {
      await uploadFileDirect(file, resumeState);
    } else {
      await uploadFileChunked(file);
    }
  };

  const handleCancelUpload = () => {
    if (uploadAbortControllerRef.current) {
      uploadAbortControllerRef.current.abort();
      console.log('🚫 [Upload] Cancel requested');
    }

    if (progressPersistenceTimerRef.current) {
      clearInterval(progressPersistenceTimerRef.current);
      progressPersistenceTimerRef.current = null;
    }

    const uploads = Object.keys(localStorage).filter((key) => key.startsWith('wewatch_chunk_upload_'));
    uploads.forEach((key) => localStorage.removeItem(key));
    localStorage.removeItem('wewatch_active_upload');
    const bunnyId = localStorage.getItem('current_bunny_upload_id');
    if (bunnyId) {
      localStorage.removeItem(`wewatch_bunny_upload_${bunnyId}`);
      localStorage.removeItem('current_bunny_upload_id');
    }

    // This is the ONLY place that clears uploadFileRef — explicit user cancel.
    // Network drops / tab hides / sidebar toggles must never reach this.
    uploadFileRef.current = null;
    uploadPausedRef.current = false;
    setUploadPaused(false);
    setUploading(false);
    setUploadProgress(0);
    setUploadSpeed(0);
    setUploadETA('');
    setUploadedBytes(0);
    setTotalBytes(0);
  };

  // "Retry Now" button — same resume() used by the auto-retry effect, exposed for manual use.
  const handleRetryNow = () => {
    if (!uploadFileRef.current) return;
    const bunnyId = localStorage.getItem('current_bunny_upload_id');
    let savedState = null;
    if (bunnyId) {
      try { savedState = JSON.parse(localStorage.getItem(`wewatch_bunny_upload_${bunnyId}`) || 'null'); } catch (_) {}
    }
    uploadFileDirectRef.current?.(uploadFileRef.current, savedState);
  };

  const acceptUploadTerms = () => {
    setHasAcceptedTerms(true);
    localStorage.setItem('wewatch_upload_terms_accepted', 'true');
    setShowUploadDisclaimer(false);
  };

  // Resume button in the Resume Upload dialog. If the File is still held in memory
  // (e.g. dialog reappeared for some other reason while the upload survived), resume
  // immediately with no re-pick. Otherwise (true page reload — the file reference is
  // unavoidably lost; the browser will not let JS reconstruct a File from disk without
  // a fresh user gesture) ask for the same file via the normal upload button/drop zone.
  const resumeUpload = () => {
    const data = pendingResumeData;
    if (!data) return;
    setShowResumeUpload(false);

    if (uploadFileRef.current) {
      const isSameFile = uploadFileRef.current.name === data.fileName && uploadFileRef.current.size === data.fileSize;
      if (isSameFile) {
        setPendingResumeData(null);
        handleRetryNow();
        return;
      }
    }

    if (data.uploadPath !== 'bunny') {
      toast('Use the upload button and re-select the same file to continue.', { duration: 5000 });
      // pendingResumeData stays cleared for dev path — it never auto-matches on re-pick anyway.
      setPendingResumeData(null);
      return;
    }

    // Bunny path: keep pendingResumeData so handleFileUpload's name+size match
    // can pick this up the moment the user re-selects the same file.
    toast('Re-select the same file to continue where you left off.', { duration: 5000 });
  };

  const discardResume = () => {
    const devId = localStorage.getItem('current_upload_id');
    if (devId) { clearChunkUploadState(devId); localStorage.removeItem('current_upload_id'); }
    const bunnyId = localStorage.getItem('current_bunny_upload_id');
    if (bunnyId) {
      localStorage.removeItem(`wewatch_bunny_upload_${bunnyId}`);
      localStorage.removeItem('current_bunny_upload_id');
    }
    setShowResumeUpload(false);
    setPendingResumeData(null);
  };

  // "Finalise" button for the needsAssembly case — all chunks are already on BunnyCDN,
  // just needs the confirm call to Railway.
  const finalizeResume = async () => {
    setShowResumeUpload(false);
    const state = pendingResumeData;
    setPendingResumeData(null);
    if (!state) return;
    try {
      toast('Finalising upload…');
      const finalResp = await assembleUpload(roomId, {
        upload_id: state.uploadId,
        total_chunks: state.totalChunks,
        original_name: state.fileName,
        mime_type: state.mimeType || `video/${state.fileName.split('.').pop()?.toLowerCase() || 'mp4'}`,
        file_size: state.fileSize,
        session_id: state.sessionId || '',
        duration: state.duration || '00:00:00',
      });
      localStorage.removeItem(`wewatch_bunny_upload_${state.uploadId}`);
      localStorage.removeItem('current_bunny_upload_id');
      toast.success('Upload finalised!');
      if (onUploadComplete) { playSuccess(); onUploadComplete(); }
      const resumedItemId = finalResp?.data?.media_item_id;
      if (resumedItemId) pollForPoster(resumedItemId);
    } catch (err) {
      toast.error(`Finalisation failed: ${err.message}`);
    }
  };

  return {
    uploading,
    uploadPaused,
    uploadProgress,
    uploadSpeed,
    uploadETA,
    uploadedBytes,
    totalBytes,
    showUploadDisclaimer,
    setShowUploadDisclaimer,
    hasAcceptedTerms,
    acceptUploadTerms,
    showResumeUpload,
    pendingResumeData,
    resumeUpload,
    discardResume,
    finalizeResume,
    handleFileUpload,
    handleCancelUpload,
    handleRetryNow,
    formatFileSize,
  };
}
