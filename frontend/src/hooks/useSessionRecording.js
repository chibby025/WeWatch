// WeWatch/frontend/src/hooks/useSessionRecording.js
// Hook for recording watch sessions (30min max @ 720p)
import { useState, useRef, useCallback } from 'react';
import apiClient from '../services/api';
import toast from 'react-hot-toast';

const useSessionRecording = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0); // seconds
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);

  const MAX_DURATION = 30 * 60; // 30 minutes in seconds
  const WARNING_TIME = 28 * 60; // 28 minutes - show warning

  // Format time as MM:SS
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Start recording timer
  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      setRecordingTime((prev) => {
        const newTime = prev + 1;
        
        // Show warning at 28 minutes
        if (newTime === WARNING_TIME) {
          toast('⏰ 2 minutes remaining!', {
            icon: '⚠️',
            duration: 5000,
          });
        }
        
        // Auto-stop at 30 minutes
        if (newTime >= MAX_DURATION) {
          stopRecording();
          toast('Recording stopped - 30 minute limit reached', {
            icon: '⏱️',
          });
        }
        
        return newTime;
      });
    }, 1000);
  }, []);

  // Stop timer
  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Start recording
  const startRecording = useCallback(async (source, roomId, title) => {
    try {
      let stream = null;

      // Get appropriate stream based on source
      switch (source) {
        case 'full_canvas': {
          // Capture entire cinema canvas
          const canvas = document.querySelector('canvas'); // Three.js canvas
          if (!canvas) {
            throw new Error('Canvas not found. Make sure you are in cinema view.');
          }
          stream = canvas.captureStream(30); // 30fps
          break;
        }

        case 'video_only': {
          // Capture video player element
          const videoElement = document.querySelector('video');
          if (!videoElement) {
            throw new Error('Video player not found. Play a video first.');
          }
          stream = videoElement.captureStream();
          break;
        }

        case 'liveshare': {
          // Capture LiveShare video/screen
          const liveShareVideo = document.querySelector('[data-liveshare-video]');
          if (liveShareVideo) {
            stream = liveShareVideo.captureStream();
          } else {
            throw new Error('LiveShare not active. Start camera/screen sharing first.');
          }
          break;
        }

        default:
          throw new Error('Invalid recording source');
      }

      if (!stream) {
        throw new Error('Failed to capture stream');
      }

      streamRef.current = stream;

      // Create MediaRecorder with optimized settings for 720p
      const options = {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 2500000, // 2.5 Mbps for 720p
      };

      // Fallback to vp8 if vp9 not supported
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'video/webm;codecs=vp8';
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      // Handle data available event (collect chunks)
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      // Handle stop event (create blob and upload)
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        await handleUpload(blob, roomId, title);
      };

      // Start recording with 10 second chunks
      mediaRecorder.start(10000);
      setIsRecording(true);
      setRecordingTime(0);
      startTimer();

      toast.success('🔴 Recording started!');
      console.log('✅ [Recording] Started:', { source, roomId });

      return true;
    } catch (error) {
      console.error('❌ [Recording] Start failed:', error);
      toast.error(error.message || 'Failed to start recording');
      return false;
    }
  }, [startTimer]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      stopTimer();
      setIsRecording(false);

      // Stop all tracks in the stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      toast('Processing recording...', { icon: '⏳' });
      console.log('✅ [Recording] Stopped');
    }
  }, [isRecording, stopTimer]);

  // Upload recording and create post
  const handleUpload = async (blob, roomId, title) => {
    setIsProcessing(true);
    setUploadProgress(0);

    try {
      // Step 1: Create post entry
      const postData = {
        title: title || `Watch Party Recording - ${new Date().toLocaleDateString()}`,
        description: 'Recorded live watch party session',
        media_type: 'video',
        post_type: 'recording',
        room_id: roomId ? parseInt(roomId, 10) : null, // ✅ Convert to integer
        is_public: true,
      };

      const createResponse = await apiClient.post('/api/posts', postData);
      const post = createResponse.data.post;
      console.log('✅ [Recording] Post created:', post.id);

      // Step 2: Upload video file
      const formData = new FormData();
      const filename = `recording_${post.id}_${Date.now()}.webm`;
      formData.append('file', blob, filename);

      const uploadResponse = await apiClient.post(`/api/posts/${post.id}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadProgress(percentCompleted);
        },
      });

      // Update post with video URLs from upload response
      const updatedPost = {
        ...post,
        video_url: uploadResponse.data.video_url,
        thumbnail_url: uploadResponse.data.thumbnail_url,
      };

      console.log('✅ [Recording] Upload complete:', uploadResponse.data);
      toast.success('🎉 Recording posted successfully!');

      // Reset state
      setIsProcessing(false);
      setUploadProgress(0);
      setRecordingTime(0);
      chunksRef.current = [];

      return updatedPost;
    } catch (error) {
      console.error('❌ [Recording] Upload failed:', error);
      toast.error(error.response?.data?.error || 'Failed to upload recording');
      setIsProcessing(false);
      return null;
    }
  };

  // Cancel recording (without saving)
  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      stopTimer();
      setIsRecording(false);
      setRecordingTime(0);
      chunksRef.current = [];

      // Stop all tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      toast('Recording cancelled', { icon: '🚫' });
    }
  }, [isRecording, stopTimer]);

  return {
    isRecording,
    recordingTime,
    isProcessing,
    uploadProgress,
    startRecording,
    stopRecording,
    cancelRecording,
    formatTime,
    maxDuration: MAX_DURATION,
  };
};

export default useSessionRecording;
