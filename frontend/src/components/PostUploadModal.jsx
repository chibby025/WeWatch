// WeWatch/frontend/src/components/PostUploadModal_new.jsx
// Modern mobile-first post creation with Camera, Type, and Upload modes
import { useState, useRef, useEffect } from 'react';
import { X, Upload, Image as ImageIcon, Film, Loader2, Camera, Type as TypeIcon, Video, RefreshCw, Circle, Square } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

export default function PostUploadModal({ isOpen, onClose, onSuccess }) {
  const { currentUser } = useAuth();
  
  // Mode state: 'camera', 'type', 'upload'
  const [mode, setMode] = useState('camera');
  
  // Common states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [allowDownloads, setAllowDownloads] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [hostedRooms, setHostedRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  
  // Camera mode states
  const [cameraStream, setCameraStream] = useState(null);
  const [facingMode, setFacingMode] = useState('user'); // 'user' (front) or 'environment' (back)
  const [capturedMedia, setCapturedMedia] = useState(null);
  const [mediaType, setMediaType] = useState(null); // 'photo' or 'video'
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [selectedFilter, setSelectedFilter] = useState('none');
  
  // Type mode states
  const [textContent, setTextContent] = useState('');
  const [backgroundColor, setBackgroundColor] = useState('#667eea'); // Default purple gradient
  const [textMediaFile, setTextMediaFile] = useState(null);
  
  // Upload mode states
  const [dragActive, setDragActive] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  
  // Refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const fileInputRef = useRef(null);
  const recordingIntervalRef = useRef(null);
  
  // Constants
  const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500MB
  const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
  const MAX_VIDEO_DURATION = 90; // 90 seconds
  const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
  const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  
  // Available filters
  const filters = [
    { id: 'none', name: 'Original', filter: 'none' },
    { id: 'bright', name: 'Bright', filter: 'brightness(1.2)' },
    { id: 'contrast', name: 'Contrast', filter: 'contrast(1.3)' },
    { id: 'saturate', name: 'Vibrant', filter: 'saturate(1.4)' },
    { id: 'grayscale', name: 'B&W', filter: 'grayscale(1)' },
    { id: 'sepia', name: 'Sepia', filter: 'sepia(1)' },
    { id: 'vintage', name: 'Vintage', filter: 'sepia(0.5) contrast(1.2) brightness(1.1)' },
  ];
  
  // Background colors for text posts
  const backgroundColors = [
    { id: 'purple', color: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
    { id: 'blue', color: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
    { id: 'pink', color: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
    { id: 'orange', color: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' },
    { id: 'green', color: 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)' },
    { id: 'sunset', color: 'linear-gradient(135deg, #ff9a56 0%, #ff6a88 100%)' },
  ];
  
  // Fetch user's hosted rooms on modal open
  useEffect(() => {
    if (isOpen && currentUser) {
      fetchHostedRooms();
    }
  }, [isOpen, currentUser]);
  
  // Initialize camera when in camera mode
  useEffect(() => {
    if (isOpen && mode === 'camera' && !capturedMedia) {
      startCamera();
    }
    
    return () => {
      stopCamera();
    };
  }, [isOpen, mode, capturedMedia, facingMode]);
  
  // Cleanup on unmount or modal close
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      resetStates();
    }
  }, [isOpen]);
  
  const fetchHostedRooms = async () => {
    try {
      setLoadingRooms(true);
      const response = await apiClient.get('/api/rooms');
      const userHostedRooms = response.data.rooms.filter(
        room => room.host_id === currentUser.id
      );
      setHostedRooms(userHostedRooms);
    } catch (error) {
      console.error('Failed to fetch rooms:', error);
      setHostedRooms([]);
    } finally {
      setLoadingRooms(false);
    }
  };
  
  const startCamera = async () => {
    try {
      stopCamera(); // Stop any existing stream
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: true
      });
      
      setCameraStream(stream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (error) {
      console.error('Camera access error:', error);
      toast.error('Could not access camera. Please grant camera permissions.');
    }
  };
  
  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };
  
  const toggleCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };
  
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    canvas.toBlob((blob) => {
      setCapturedMedia(blob);
      setMediaType('photo');
      stopCamera();
    }, 'image/jpeg', 0.95);
  };
  
  const startRecording = () => {
    if (!cameraStream) return;
    
    recordedChunksRef.current = [];
    setRecordingTime(0);
    
    const options = { mimeType: 'video/webm;codecs=vp9' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options.mimeType = 'video/webm';
    }
    
    try {
      const mediaRecorder = new MediaRecorder(cameraStream, options);
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        setCapturedMedia(blob);
        setMediaType('video');
        stopCamera();
      };
      
      mediaRecorder.start(100);
      setIsRecording(true);
      
      // Recording timer
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= MAX_VIDEO_DURATION) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (error) {
      console.error('Recording error:', error);
      toast.error('Failed to start recording');
    }
  };
  
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    }
  };
  
  const retakeMedia = () => {
    setCapturedMedia(null);
    setMediaType(null);
    setSelectedFilter('none');
    setRecordingTime(0);
    startCamera();
  };
  
  const applyFilterToBlob = async (blob, filterCss) => {
    if (filterCss === 'none' || !blob) return blob;
    
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        
        const ctx = canvas.getContext('2d');
        ctx.filter = filterCss;
        ctx.drawImage(img, 0, 0);
        
        canvas.toBlob((filteredBlob) => {
          URL.revokeObjectURL(url);
          resolve(filteredBlob);
        }, 'image/jpeg', 0.95);
      };
      
      img.src = url;
    });
  };
  
  // Handle upload mode file selection
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };
  
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUploadFileSelection(e.dataTransfer.files[0]);
    }
  };
  
  const handleUploadFileSelection = async (file) => {
    if (!file) return;
    
    const isVideo = ACCEPTED_VIDEO_TYPES.includes(file.type);
    const isImage = ACCEPTED_IMAGE_TYPES.includes(file.type);
    
    if (!isVideo && !isImage) {
      toast.error('Invalid file type. Please upload a video or image.');
      return;
    }
    
    const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
    if (file.size > maxSize) {
      toast.error(`File too large. Max size: ${isVideo ? '500MB' : '10MB'}`);
      return;
    }
    
    if (isVideo) {
      const duration = await getVideoDuration(file);
      if (duration > MAX_VIDEO_DURATION) {
        toast.error('Video too long. Maximum duration is 90 seconds.');
        return;
      }
    }
    
    setUploadFile(file);
    
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };
  
  const getVideoDuration = (file) => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src);
        resolve(video.duration);
      };
      video.onerror = () => resolve(0);
      video.src = URL.createObjectURL(file);
    });
  };
  
  const resetStates = () => {
    setMode('camera');
    setTitle('');
    setDescription('');
    setIsPublic(true);
    setAllowDownloads(true);
    setSelectedRoom(null);
    setCapturedMedia(null);
    setMediaType(null);
    setSelectedFilter('none');
    setTextContent('');
    setBackgroundColor('#667eea');
    setTextMediaFile(null);
    setUploadFile(null);
    setPreviewUrl(null);
    setRecordingTime(0);
  };
  
  const handleSubmit = async () => {
    let finalFile = null;
    let finalMediaType = '';
    
    // Validate based on mode
    if (mode === 'camera') {
      if (!capturedMedia) {
        toast.error('Please capture a photo or video');
        return;
      }
      
      if (!title.trim()) {
        toast.error('Please enter a title');
        return;
      }
      
      // Apply filter if photo
      if (mediaType === 'photo') {
        const filterCss = filters.find(f => f.id === selectedFilter)?.filter || 'none';
        finalFile = await applyFilterToBlob(capturedMedia, filterCss);
      } else {
        finalFile = capturedMedia;
      }
      
      finalMediaType = mediaType === 'photo' ? 'image' : 'video';
      
    } else if (mode === 'type') {
      if (!textContent.trim() && !textMediaFile) {
        toast.error('Please enter text or add media');
        return;
      }
      
      if (!title.trim()) {
        toast.error('Please enter a title');
        return;
      }
      
      // Create text image with background color
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1080;
      const ctx = canvas.getContext('2d');
      
      // Apply gradient background
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      const selectedBg = backgroundColors.find(bg => bg.color === backgroundColor) || backgroundColors[0];
      
      // Parse gradient colors
      const gradientMatch = backgroundColor.match(/linear-gradient\(.*?, (#[0-9a-f]{6}).*?, (#[0-9a-f]{6})/i);
      if (gradientMatch) {
        gradient.addColorStop(0, gradientMatch[1]);
        gradient.addColorStop(1, gradientMatch[2]);
      } else {
        gradient.addColorStop(0, backgroundColor);
        gradient.addColorStop(1, backgroundColor);
      }
      
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw text
      ctx.fillStyle = 'white';
      ctx.font = 'bold 64px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Word wrap
      const maxWidth = canvas.width - 100;
      const words = textContent.split(' ');
      const lines = [];
      let currentLine = words[0];
      
      for (let i = 1; i < words.length; i++) {
        const testLine = currentLine + ' ' + words[i];
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth) {
          lines.push(currentLine);
          currentLine = words[i];
        } else {
          currentLine = testLine;
        }
      }
      lines.push(currentLine);
      
      const lineHeight = 80;
      const startY = (canvas.height - (lines.length * lineHeight)) / 2;
      
      lines.forEach((line, index) => {
        ctx.fillText(line, canvas.width / 2, startY + (index * lineHeight) + lineHeight / 2);
      });
      
      // Convert to blob
      await new Promise((resolve) => {
        canvas.toBlob((blob) => {
          finalFile = textMediaFile || blob;
          finalMediaType = textMediaFile ? 'video' : 'image';
          resolve();
        }, 'image/jpeg', 0.95);
      });
      
    } else if (mode === 'upload') {
      if (!uploadFile) {
        toast.error('Please select a file');
        return;
      }
      
      if (!title.trim()) {
        toast.error('Please enter a title');
        return;
      }
      
      finalFile = uploadFile;
      finalMediaType = uploadFile.type === 'image/gif' ? 'gif' : 
                       ACCEPTED_VIDEO_TYPES.includes(uploadFile.type) ? 'video' : 'image';
    }
    
    setUploading(true);
    setUploadProgress(0);
    
    try {
      // Step 1: Create post entry
      const createResponse = await apiClient.post('/api/posts', {
        title: title.trim(),
        description: description.trim(),
        media_type: finalMediaType,
        post_type: 'upload',
        is_public: isPublic,
        allow_downloads: allowDownloads,
        room_id: selectedRoom,
      });
      
      const postId = createResponse.data.post.id;
      setUploadProgress(10);
      
      // Step 2: Upload media file
      const formData = new FormData();
      formData.append('file', finalFile, `post_${postId}.${finalMediaType === 'video' ? 'webm' : 'jpg'}`);
      
      await apiClient.post(`/api/posts/${postId}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 90) / progressEvent.total) + 10;
          setUploadProgress(percentCompleted);
        },
      });
      
      setUploadProgress(100);
      toast.success('Post created successfully! 🎉');
      
      console.log('✅ [PostUploadModal] Upload complete, calling onSuccess:', !!onSuccess);
      if (onSuccess) onSuccess();
      onClose();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error.response?.data?.error || 'Failed to create post');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-gray-700/50">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700/50">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            {mode === 'camera' && <Camera className="w-6 h-6 text-purple-400" />}
            {mode === 'type' && <TypeIcon className="w-6 h-6 text-blue-400" />}
            {mode === 'upload' && <Upload className="w-6 h-6 text-green-400" />}
            Create Post
          </h2>
          <button
            onClick={onClose}
            disabled={uploading}
            className="p-2 rounded-lg bg-gray-700/50 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Camera Mode */}
          {mode === 'camera' && (
            <div className="space-y-4">
              {!capturedMedia ? (
                <>
                  {/* Live Camera Preview */}
                  <div className="relative bg-black rounded-xl overflow-hidden aspect-[9/16] md:aspect-video">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                    
                    {/* Camera Controls Overlay */}
                    <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent">
                      <div className="flex items-center justify-around">
                        {/* Flip Camera */}
                        <button
                          onClick={toggleCamera}
                          className="p-4 bg-white/20 hover:bg-white/30 rounded-full transition-colors backdrop-blur-sm"
                        >
                          <RefreshCw className="w-6 h-6 text-white" />
                        </button>
                        
                        {/* Capture Photo */}
                        <button
                          onClick={capturePhoto}
                          className="p-6 bg-white rounded-full hover:bg-gray-200 transition-all transform hover:scale-110"
                        >
                          <Camera className="w-8 h-8 text-gray-900" />
                        </button>
                        
                        {/* Record Video */}
                        <button
                          onClick={isRecording ? stopRecording : startRecording}
                          className={`p-4 rounded-full transition-all ${
                            isRecording 
                              ? 'bg-red-600 hover:bg-red-700' 
                              : 'bg-white/20 hover:bg-white/30 backdrop-blur-sm'
                          }`}
                        >
                          {isRecording ? (
                            <Square className="w-6 h-6 text-white fill-white" />
                          ) : (
                            <Video className="w-6 h-6 text-white" />
                          )}
                        </button>
                      </div>
                      
                      {/* Recording Timer */}
                      {isRecording && (
                        <div className="text-center mt-4">
                          <div className="inline-block px-4 py-2 bg-red-600 rounded-full text-white font-mono text-sm">
                            <Circle className="w-3 h-3 inline-block mr-2 fill-white animate-pulse" />
                            {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')} / 1:30
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Captured Media Preview with Filters */}
                  <div className="relative bg-black rounded-xl overflow-hidden">
                    {mediaType === 'photo' ? (
                      <img
                        src={URL.createObjectURL(capturedMedia)}
                        alt="Captured"
                        className="w-full max-h-96 object-contain"
                        style={{
                          filter: filters.find(f => f.id === selectedFilter)?.filter || 'none'
                        }}
                      />
                    ) : (
                      <video
                        src={URL.createObjectURL(capturedMedia)}
                        controls
                        className="w-full max-h-96 object-contain"
                      />
                    )}
                    
                    {/* Retake Button */}
                    <button
                      onClick={retakeMedia}
                      className="absolute top-4 right-4 px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-full text-white text-sm font-medium transition-colors"
                    >
                      Retake
                    </button>
                  </div>
                  
                  {/* Filters (only for photos) */}
                  {mediaType === 'photo' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Filters</label>
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {filters.map((filter) => (
                          <button
                            key={filter.id}
                            onClick={() => setSelectedFilter(filter.id)}
                            className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                              selectedFilter === filter.id
                                ? 'bg-purple-600 text-white'
                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            }`}
                          >
                            {filter.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Title */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Title <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      maxLength={255}
                      placeholder="Give your post a title..."
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  
                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      maxLength={2000}
                      rows={2}
                      placeholder="Add a description (optional)"
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                    />
                  </div>
                </>
              )}
            </div>
          )}
          
          {/* Type Mode */}
          {mode === 'type' && (
            <div className="space-y-4">
              {/* Text Post Preview */}
              <div 
                className="relative rounded-xl overflow-hidden aspect-square max-h-96 mx-auto flex items-center justify-center p-8"
                style={{ background: backgroundColor }}
              >
                <p className="text-white text-center text-2xl md:text-4xl font-bold break-words max-w-full">
                  {textContent || 'Type something...'}
                </p>
              </div>
              
              {/* Background Color Picker */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Background</label>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {backgroundColors.map((bg) => (
                    <button
                      key={bg.id}
                      onClick={() => setBackgroundColor(bg.color)}
                      className={`flex-shrink-0 w-12 h-12 rounded-lg transition-all ${
                        backgroundColor === bg.color ? 'ring-4 ring-white scale-110' : ''
                      }`}
                      style={{ background: bg.color }}
                    />
                  ))}
                </div>
              </div>
              
              {/* Text Input */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Your Message <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  maxLength={500}
                  rows={4}
                  placeholder="What's on your mind?"
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <p className="text-xs text-gray-500 mt-1">{textContent.length}/500</p>
              </div>
              
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Title <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={255}
                  placeholder="Give your post a title..."
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
          
          {/* Upload Mode */}
          {mode === 'upload' && (
            <div className="space-y-4">
              {!uploadFile ? (
                <div
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
                    dragActive
                      ? 'border-green-500 bg-green-500/10'
                      : 'border-gray-600 hover:border-green-500/50 hover:bg-gray-800/50'
                  }`}
                >
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 bg-green-600/20 rounded-full flex items-center justify-center">
                      <Upload className="w-8 h-8 text-green-400" />
                    </div>
                    <div>
                      <p className="text-white font-semibold mb-1">Drop your file here or click to browse</p>
                      <p className="text-gray-400 text-sm">Video (max 500MB, 90s) or Image (max 10MB)</p>
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*,image/*"
                    onChange={(e) => handleUploadFileSelection(e.target.files[0])}
                    className="hidden"
                  />
                </div>
              ) : (
                <>
                  {/* Upload Preview */}
                  <div className="relative bg-black rounded-xl overflow-hidden">
                    {uploadFile.type.startsWith('video/') ? (
                      <video src={previewUrl} controls className="w-full max-h-96 object-contain" />
                    ) : (
                      <img src={previewUrl} alt="Preview" className="w-full max-h-96 object-contain" />
                    )}
                    <button
                      onClick={() => {
                        setUploadFile(null);
                        setPreviewUrl(null);
                      }}
                      className="absolute top-4 right-4 p-2 bg-red-600 hover:bg-red-700 rounded-full text-white transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  
                  {/* Title */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Title <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      maxLength={255}
                      placeholder="Give your post a title..."
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  
                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      maxLength={2000}
                      rows={2}
                      placeholder="Add a description (optional)"
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                    />
                  </div>
                </>
              )}
            </div>
          )}
          
          {/* Common Settings (shown when ready to post) */}
          {((mode === 'camera' && capturedMedia) || (mode === 'type' && textContent) || (mode === 'upload' && uploadFile)) && (
            <>
              {/* Room Selection */}
              {hostedRooms.length > 0 && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">Post to</label>
                  <select
                    value={selectedRoom || ''}
                    onChange={(e) => setSelectedRoom(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">My Profile</option>
                    {hostedRooms.map(room => (
                      <option key={room.id} value={room.id}>
                        {room.name} ({room.member_count || 0} members)
                      </option>
                    ))}
                  </select>
                </div>
              )}
              
              {/* Privacy & Downloads */}
              <div className="flex gap-4 mt-4">
                <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-700 flex-1">
                  <div>
                    <p className="text-white font-medium text-sm">Public</p>
                  </div>
                  <button
                    onClick={() => setIsPublic(!isPublic)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      isPublic ? 'bg-purple-600' : 'bg-gray-700'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isPublic ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
                
                {mode === 'camera' && mediaType === 'video' && (
                  <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-700 flex-1">
                    <div>
                      <p className="text-white font-medium text-sm">Downloads</p>
                    </div>
                    <button
                      onClick={() => setAllowDownloads(!allowDownloads)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        allowDownloads ? 'bg-cyan-600' : 'bg-gray-700'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        allowDownloads ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>
                )}
              </div>
              
              {/* Upload Progress */}
              {uploading && (
                <div className="space-y-2 mt-4">
                  <div className="bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-purple-600 h-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="text-center text-sm text-gray-400">{uploadProgress}% uploaded</p>
                </div>
              )}
              
              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={uploading}
                className="w-full mt-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    Post
                  </>
                )}
              </button>
            </>
          )}
        </div>
        
        {/* Mode Selector (Bottom Tabs) */}
        <div className="border-t border-gray-700/50 p-4">
          <div className="flex gap-2">
            <button
              onClick={() => setMode('camera')}
              disabled={uploading}
              className={`flex-1 py-3 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                mode === 'camera'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
              }`}
            >
              <Camera className="w-5 h-5" />
              Camera
            </button>
            
            <button
              onClick={() => setMode('type')}
              disabled={uploading}
              className={`flex-1 py-3 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                mode === 'type'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
              }`}
            >
              <TypeIcon className="w-5 h-5" />
              Text
            </button>
            
            <button
              onClick={() => setMode('upload')}
              disabled={uploading}
              className={`flex-1 py-3 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                mode === 'upload'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
              }`}
            >
              <Upload className="w-5 h-5" />
              Upload
            </button>
          </div>
        </div>
      </div>
      
      {/* Hidden canvas for photo capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}
