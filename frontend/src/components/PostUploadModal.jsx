// WeWatch/frontend/src/components/PostUploadModal.jsx
// Redesigned: bottom-sheet mobile, two-step flow, full-bleed camera, circular progress
import { useState, useRef, useEffect, useMemo } from 'react';
import {
  X, Upload, Camera, Type as TypeIcon, Video, RefreshCw, Circle, Square,
  ChevronLeft, ChevronRight, ChevronDown, Globe, Lock, Download, DollarSign, Palette,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const RATINGS = [
  { value: 'G',           label: 'G',      bg: 'bg-green-600',  text: 'text-white', minAge: 0,  icon: '/icons/G Rating Icon.png',           desc: 'General Audiences — all ages admitted' },
  { value: 'PG',          label: 'PG',     bg: 'bg-teal-600',   text: 'text-white', minAge: 0,  icon: '/icons/PG Rating Icon.png',          desc: 'Parental Guidance — some material may not suit children' },
  { value: 'Educational', label: 'Edu',    bg: 'bg-blue-600',   text: 'text-white', minAge: 0,  icon: '/icons/Educational_Rating_Icon.png', desc: 'Educational — tutorials, classes, university material' },
  { value: 'Religious',   label: 'Faith',  bg: 'bg-indigo-600', text: 'text-white', minAge: 0,  icon: '/icons/Religious Rating.png',        desc: 'Religious — church services, Bible study, worship' },
  { value: '13+',         label: '13+',    bg: 'bg-amber-500',  text: 'text-black', minAge: 13, icon: '/icons/13_ Rating Icon.png',         desc: 'Teens 13+ — may not be suitable for younger audiences' },
  { value: '16+',         label: '16+',    bg: 'bg-orange-500', text: 'text-white', minAge: 16, icon: '/icons/16_ Rating Icon.png',         desc: 'Older Teens 16+ — may not suit viewers under 16' },
  { value: '18+',         label: '18+',    bg: 'bg-red-600',    text: 'text-white', minAge: 18, icon: '/icons/18_ Rating Icon.png',         desc: 'Adults Only — restricted to viewers 18 and over' },
  { value: 'Mature',      label: 'Mature', bg: 'bg-rose-700',   text: 'text-white', minAge: 18, icon: '/icons/Mature Rating Icon.png',      desc: 'Mature Content — explicit content for adults 18+' },
];

export default function PostUploadModal({ isOpen, onClose, onSuccess }) {
  const { currentUser } = useAuth();

  // Step: 1 = capture/select  2 = details + settings
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState('camera');

  // Common
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [allowDownloads, setAllowDownloads] = useState(true);
  const [isPaid, setIsPaid] = useState(false);
  const [priceNaira, setPriceNaira] = useState('');
  const [contentRating, setContentRating] = useState('G');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [hostedRooms, setHostedRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(true);

  // Camera
  const [cameraStream, setCameraStream] = useState(null);
  const [facingMode, setFacingMode] = useState('user');
  const [capturedMedia, setCapturedMedia] = useState(null);
  const [mediaType, setMediaType] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [selectedFilter, setSelectedFilter] = useState('none');
  const [showFilters, setShowFilters] = useState(false);

  // Type
  const [textContent, setTextContent] = useState('');
  const [textMediaFile, setTextMediaFile] = useState(null);

  // Upload
  const [dragActive, setDragActive] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  // Step-2 UI state
  const [ratingScrollIndex, setRatingScrollIndex] = useState(0);
  const [showRoomDropdown, setShowRoomDropdown] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const fileInputRef = useRef(null);
  const recordingIntervalRef = useRef(null);

  const MAX_VIDEO_SIZE = 500 * 1024 * 1024;
  const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
  const MAX_VIDEO_DURATION = 90;
  const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
  const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  const filters = [
    { id: 'none',      name: 'Original', filter: 'none' },
    { id: 'bright',    name: 'Bright',   filter: 'brightness(1.2)' },
    { id: 'contrast',  name: 'Contrast', filter: 'contrast(1.3)' },
    { id: 'saturate',  name: 'Vibrant',  filter: 'saturate(1.4)' },
    { id: 'grayscale', name: 'B&W',      filter: 'grayscale(1)' },
    { id: 'sepia',     name: 'Sepia',    filter: 'sepia(1)' },
    { id: 'vintage',   name: 'Vintage',  filter: 'sepia(0.5) contrast(1.2) brightness(1.1)' },
  ];

  // Age-gate ratings (creators can't set a rating above their own age)
  const userAge = useMemo(() => {
    if (!currentUser?.date_of_birth) return 0;
    const birth = new Date(currentUser.date_of_birth);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  }, [currentUser]);

  const availableRatings = useMemo(
    () => userAge === 0 ? RATINGS : RATINGS.filter(r => userAge >= r.minAge),
    [userAge]
  );

  // Auto-advance to step 2 after capture / file selection
  useEffect(() => { if (capturedMedia && step === 1) setStep(2); }, [capturedMedia]);
  useEffect(() => { if (uploadFile   && step === 1) setStep(2); }, [uploadFile]);

  useEffect(() => {
    if (isOpen && currentUser) fetchHostedRooms();
  }, [isOpen, currentUser]);

  // Camera lifecycle
  useEffect(() => {
    if (isOpen && mode === 'camera' && step === 1 && !capturedMedia) startCamera();
    return () => stopCamera();
  }, [isOpen, mode, facingMode, step, capturedMedia]);

  useEffect(() => {
    if (!isOpen) { stopCamera(); resetStates(); }
  }, [isOpen]);

  // ── Logic ──────────────────────────────────────────────────

  const fetchHostedRooms = async () => {
    try {
      setLoadingRooms(true);
      const response = await apiClient.get('/api/rooms');
      const userHostedRooms = response.data.rooms.filter(r => r.host_id === currentUser.id);
      setHostedRooms(userHostedRooms);
      if (currentUser.main_room_id) {
        const main = userHostedRooms.find(r => r.id === currentUser.main_room_id);
        if (main) setSelectedRoom(main);
      }
    } catch (err) {
      console.error('Failed to fetch rooms:', err);
      setHostedRooms([]);
    } finally {
      setLoadingRooms(false);
    }
  };

  const startCamera = async () => {
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      setCameraStream(stream);
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
    } catch (err) {
      console.error('Camera error:', err);
      toast.error('Could not access camera. Please grant camera permissions.');
    }
  };

  const stopCamera = () => {
    if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); setCameraStream(null); }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const toggleCamera = () => setFacingMode(p => p === 'user' ? 'environment' : 'user');

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current, c = canvasRef.current;
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    c.toBlob(blob => { setCapturedMedia(blob); setMediaType('photo'); stopCamera(); }, 'image/jpeg', 0.95);
  };

  const startRecording = () => {
    if (!cameraStream) return;
    recordedChunksRef.current = [];
    setRecordingTime(0);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    try {
      const mr = new MediaRecorder(cameraStream, { mimeType });
      mediaRecorderRef.current = mr;
      mr.ondataavailable = e => { if (e.data?.size > 0) recordedChunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        setCapturedMedia(blob); setMediaType('video'); stopCamera();
      };
      mr.start(100);
      setIsRecording(true);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(p => { if (p >= MAX_VIDEO_DURATION) { stopRecording(); return p; } return p + 1; });
      }, 1000);
    } catch (err) { console.error('Recording error:', err); toast.error('Failed to start recording'); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    }
  };

  const applyFilterToBlob = (blob, filterCss) => new Promise(resolve => {
    if (filterCss === 'none' || !blob) return resolve(blob);
    const img = new Image(), url = URL.createObjectURL(blob);
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.filter = filterCss; ctx.drawImage(img, 0, 0);
      c.toBlob(fb => { URL.revokeObjectURL(url); resolve(fb); }, 'image/jpeg', 0.95);
    };
    img.src = url;
  });

  const handleDrag = e => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = e => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false);
    if (e.dataTransfer.files?.[0]) handleUploadFileSelection(e.dataTransfer.files[0]);
  };

  const handleUploadFileSelection = async file => {
    if (!file) return;
    const isVideo = ACCEPTED_VIDEO_TYPES.includes(file.type);
    const isImage = ACCEPTED_IMAGE_TYPES.includes(file.type);
    if (!isVideo && !isImage) { toast.error('Invalid file type. Please upload a video or image.'); return; }
    if (file.size > (isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE)) {
      toast.error(`File too large. Max: ${isVideo ? '500MB' : '10MB'}`); return;
    }
    if (isVideo) {
      const dur = await getVideoDuration(file);
      if (dur > MAX_VIDEO_DURATION) { toast.error('Video too long. Max 90 seconds.'); return; }
    }
    setUploadFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setPreviewUrl(reader.result);
    reader.readAsDataURL(file);
  };

  const getVideoDuration = file => new Promise(resolve => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); resolve(v.duration); };
    v.onerror = () => resolve(0);
    v.src = URL.createObjectURL(file);
  });

  // Rating carousel helpers
  const handleRatingPrev = () => {
    const idx = Math.max(0, ratingScrollIndex - 1);
    setRatingScrollIndex(idx);
    setContentRating(availableRatings[idx].value);
  };
  const handleRatingNext = () => {
    const idx = Math.min(availableRatings.length - 1, ratingScrollIndex + 1);
    setRatingScrollIndex(idx);
    setContentRating(availableRatings[idx].value);
  };
  const handleRatingSelect = idx => {
    setRatingScrollIndex(idx);
    setContentRating(availableRatings[idx].value);
  };

  const handleBack = () => {
    if (mode === 'camera') { setCapturedMedia(null); setMediaType(null); setSelectedFilter('none'); setRecordingTime(0); }
    else if (mode === 'upload') { setUploadFile(null); setPreviewUrl(null); }
    setShowFilters(false);
    setShowRoomDropdown(false);
    setStep(1);
  };

  const resetStates = () => {
    setStep(1); setMode('camera'); setTitle(''); setDescription('');
    setIsPublic(true); setAllowDownloads(true); setIsPaid(false); setPriceNaira('');
    setContentRating('G'); setRatingScrollIndex(0); setSelectedRoom(null);
    setCapturedMedia(null); setMediaType(null); setSelectedFilter('none');
    setShowFilters(false); setShowRoomDropdown(false);
    setTextContent(''); setTextMediaFile(null);
    setUploadFile(null); setPreviewUrl(null); setRecordingTime(0);
  };

  const handleSubmit = async () => {
    let finalFile = null, finalMediaType = '';

    if (mode === 'camera') {
      if (!capturedMedia) { toast.error('Please capture a photo or video'); return; }
      if (!title.trim()) { toast.error('Please enter a title'); return; }
      const filterCss = filters.find(f => f.id === selectedFilter)?.filter || 'none';
      finalFile = mediaType === 'photo' ? await applyFilterToBlob(capturedMedia, filterCss) : capturedMedia;
      finalMediaType = mediaType === 'photo' ? 'image' : 'video';
    } else if (mode === 'type') {
      if (!textContent.trim() && !textMediaFile) { toast.error('Please enter text or add media'); return; }
      if (!title.trim()) { toast.error('Please enter a title'); return; }
      const canvas = document.createElement('canvas');
      canvas.width = 1080; canvas.height = 1080;
      const ctx = canvas.getContext('2d');
      const isDark = document.documentElement.classList.contains('dark');
      ctx.fillStyle = isDark ? '#111827' : '#ffffff';
      ctx.fillRect(0, 0, 1080, 1080);
      ctx.fillStyle = isDark ? '#ffffff' : '#111827';
      ctx.font = 'bold 64px Arial, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const words = textContent.split(' ');
      const lines = []; let cur = words[0];
      for (let i = 1; i < words.length; i++) {
        const test = cur + ' ' + words[i];
        if (ctx.measureText(test).width > 980) { lines.push(cur); cur = words[i]; } else cur = test;
      }
      lines.push(cur);
      const lh = 80, sy = (1080 - lines.length * lh) / 2;
      lines.forEach((l, i) => ctx.fillText(l, 540, sy + i * lh + lh / 2));
      await new Promise(res => {
        canvas.toBlob(blob => { finalFile = textMediaFile || blob; finalMediaType = textMediaFile ? 'video' : 'image'; res(); }, 'image/jpeg', 0.95);
      });
    } else if (mode === 'upload') {
      if (!uploadFile) { toast.error('Please select a file'); return; }
      if (!title.trim()) { toast.error('Please enter a title'); return; }
      finalFile = uploadFile;
      finalMediaType = uploadFile.type === 'image/gif' ? 'gif' : ACCEPTED_VIDEO_TYPES.includes(uploadFile.type) ? 'video' : 'image';
    }

    if (isPaid && (!priceNaira || parseFloat(priceNaira) < 122)) { toast.error('Minimum price is ₦122'); return; }

    setUploading(true); setUploadProgress(0);
    try {
      const createResponse = await apiClient.post('/api/posts', {
        title: title.trim(), description: description.trim(),
        media_type: finalMediaType, post_type: 'upload',
        is_public: isPublic, allow_downloads: isPaid ? false : allowDownloads,
        content_rating: contentRating, room_id: selectedRoom?.id || null,
        is_paid: isPaid, price: isPaid && priceNaira ? parseFloat(priceNaira) / 122 : null,
      });
      const postId = createResponse.data.post.id;
      setUploadProgress(10);
      const formData = new FormData();
      formData.append('file', finalFile, `post_${postId}.${finalMediaType === 'video' ? 'webm' : 'jpg'}`);
      await apiClient.post(`/api/posts/${postId}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: e => setUploadProgress(Math.round((e.loaded * 90) / e.total) + 10),
      });
      setUploadProgress(100);
      toast.success('Post created successfully! 🎉');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Upload error:', err);
      toast.error(err.response?.data?.error || 'Failed to create post');
    } finally { setUploading(false); setUploadProgress(0); }
  };

  if (!isOpen) return null;

  const circumference = 2 * Math.PI * 38;

  // Rating carousel window calculation
  const totalRatings = availableRatings.length;
  let ratingStartIdx;
  if (totalRatings <= 4)                        ratingStartIdx = 0;
  else if (ratingScrollIndex <= 1)              ratingStartIdx = 0;
  else if (ratingScrollIndex >= totalRatings - 2) ratingStartIdx = totalRatings - 4;
  else                                           ratingStartIdx = ratingScrollIndex - 1;
  const visibleRatings = availableRatings.slice(ratingStartIdx, ratingStartIdx + 4);

  return (
    <>
      <style>{`
        @keyframes pum-slide-up {
          from { transform: translateY(48px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes pum-fade-scale {
          from { opacity: 0; transform: scale(0.96); }
          to   { opacity: 1; transform: scale(1);    }
        }
        .pum-enter { animation: pum-slide-up 0.32s cubic-bezier(0.34, 1.2, 0.64, 1); }
        @media (min-width: 768px) {
          .pum-enter { animation: pum-fade-scale 0.2s ease-out; }
        }
      `}</style>

      <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={uploading ? undefined : onClose} />

        <div
          className="pum-enter relative w-full md:max-w-2xl md:min-h-[560px]
                     bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900
                     rounded-t-3xl md:rounded-2xl shadow-2xl
                     border-t border-x md:border border-gray-700/60
                     flex flex-col overflow-hidden
                     h-[95vh] md:h-auto md:max-h-[90vh]"
        >
          {/* ── Circular upload progress overlay ── */}
          {uploading && (
            <div className="absolute inset-0 rounded-t-3xl md:rounded-2xl bg-gray-950/95 z-50
                            flex flex-col items-center justify-center gap-5">
              <div className="relative w-28 h-28">
                <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="38" fill="none" stroke="#1f2937" strokeWidth="8" />
                  <circle
                    cx="50" cy="50" r="38" fill="none"
                    stroke="url(#pumGrad)" strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference * (1 - uploadProgress / 100)}
                    style={{ transition: 'stroke-dashoffset 0.35s ease' }}
                  />
                  <defs>
                    <linearGradient id="pumGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#9333ea" />
                      <stop offset="100%" stopColor="#ec4899" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-white font-bold text-xl">{uploadProgress}%</span>
                </div>
              </div>
              <div className="text-center">
                <p className="text-white font-semibold text-lg">Posting…</p>
                <p className="text-gray-400 text-sm mt-1">Please keep this window open</p>
              </div>
            </div>
          )}

          {/* Drag handle — mobile only */}
          <div className="md:hidden flex justify-center pt-3 pb-0.5 flex-shrink-0">
            <div className="w-10 h-1 rounded-full bg-gray-600" />
          </div>

          {/* Header */}
          <div className="flex items-center px-4 py-3 border-b border-gray-700/50 flex-shrink-0">
            <div className="w-9">
              {step === 2 && (
                <button
                  onClick={handleBack}
                  disabled={uploading}
                  className="p-1.5 rounded-full hover:bg-gray-700 text-gray-400 hover:text-white transition-colors disabled:opacity-40"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
            </div>
            <h2 className="flex-1 text-center text-base font-bold text-white tracking-tight">
              {step === 1 ? 'Create Post' : 'Post Details'}
            </h2>
            <button
              onClick={onClose}
              disabled={uploading}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-700/50 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors disabled:opacity-40"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* ══ STEP 1 ══ */}
          {step === 1 && (
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              {/* Pill mode switcher */}
              <div className="px-4 pt-3 pb-2 flex-shrink-0">
                <div className="flex bg-gray-800/80 rounded-full p-1 gap-0.5">
                  {[
                    { id: 'camera', label: 'Camera', Icon: Camera,   active: 'bg-purple-600' },
                    { id: 'type',   label: 'Text',   Icon: TypeIcon, active: 'bg-blue-600'   },
                    { id: 'upload', label: 'Upload', Icon: Upload,   active: 'bg-green-600'  },
                  ].map(({ id, label, Icon, active }) => (
                    <button
                      key={id}
                      onClick={() => setMode(id)}
                      disabled={uploading}
                      className={`flex-1 py-2 rounded-full text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                        mode === id ? `${active} text-white shadow` : 'text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Camera — full-bleed ── */}
              {mode === 'camera' && (
                <div className="flex-1 relative bg-black overflow-hidden min-h-0">
                  <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute bottom-0 left-0 right-0 pb-8 pt-16 px-6 bg-gradient-to-t from-black/85 via-black/30 to-transparent">
                    {isRecording && (
                      <div className="flex justify-center mb-5">
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-red-600/90 rounded-full backdrop-blur-sm">
                          <Circle className="w-2.5 h-2.5 fill-white animate-pulse" />
                          <span className="text-white font-mono text-sm">
                            {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')} / 1:30
                          </span>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-around">
                      <button onClick={toggleCamera} className="p-4 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-sm transition-all active:scale-90">
                        <RefreshCw className="w-6 h-6 text-white" />
                      </button>
                      <button onClick={capturePhoto} className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all active:scale-90">
                        <div className="w-14 h-14 rounded-full bg-white" />
                      </button>
                      <button
                        onClick={isRecording ? stopRecording : startRecording}
                        className={`p-4 rounded-full transition-all active:scale-90 ${isRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-white/15 hover:bg-white/25 backdrop-blur-sm'}`}
                      >
                        {isRecording ? <Square className="w-6 h-6 text-white fill-white" /> : <Video className="w-6 h-6 text-white" />}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Text ── */}
              {mode === 'type' && (
                <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4 min-h-0">
                  <div className="rounded-2xl overflow-hidden aspect-square max-h-64 w-full mx-auto flex items-center justify-center p-8 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
                    <p className="text-gray-900 dark:text-white text-center text-xl md:text-2xl font-bold break-words leading-tight max-w-full">
                      {textContent || <span className="text-gray-400 font-normal text-sm">What's on your mind?</span>}
                    </p>
                  </div>
                  <textarea
                    value={textContent}
                    onChange={e => setTextContent(e.target.value)}
                    maxLength={500}
                    rows={4}
                    placeholder="What's on your mind?"
                    autoFocus
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">{textContent.length}/500</span>
                    {textContent.trim() && (
                      <button onClick={() => setStep(2)} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-full transition-all active:scale-95">
                        Continue →
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* ── Upload ── */}
              {mode === 'upload' && (
                <div className="flex-1 overflow-y-auto px-4 pb-4 flex items-center min-h-0">
                  <div
                    onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`w-full border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all group ${
                      dragActive ? 'border-green-400 bg-green-500/10 scale-[1.01]' : 'border-gray-600 hover:border-green-500/60 hover:bg-gray-800/50'
                    }`}
                  >
                    <div className="flex flex-col items-center gap-4">
                      <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${dragActive ? 'bg-green-500/25' : 'bg-green-600/15 group-hover:bg-green-600/25'}`}>
                        <Upload className={`w-9 h-9 text-green-400 transition-transform ${dragActive ? 'scale-110' : 'group-hover:scale-110'}`} />
                      </div>
                      <div>
                        <p className="text-white font-semibold mb-1">
                          <span className="hidden sm:inline">Drop a file here or </span>
                          <span className="text-green-400">tap to browse</span>
                        </p>
                        <p className="text-gray-400 text-sm">Video (max 500MB, 90s) · Image (max 10MB)</p>
                        <p className="text-gray-500 text-xs mt-1">MP4, WebM, MOV, JPG, PNG, WebP, GIF</p>
                      </div>
                    </div>
                    <input ref={fileInputRef} type="file" accept="video/*,image/*" onChange={e => handleUploadFileSelection(e.target.files[0])} className="hidden" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ STEP 2 ══ */}
          {step === 2 && (
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">

              {/* Preview panel — taller on mobile for prominence */}
              <div className="md:w-[42%] bg-black flex-shrink-0 h-52 sm:h-64 md:h-auto relative overflow-hidden">
                {mode === 'camera' && capturedMedia && (
                  mediaType === 'photo' ? (
                    <img
                      src={URL.createObjectURL(capturedMedia)}
                      alt="Captured"
                      className="w-full h-full object-cover"
                      style={{ filter: filters.find(f => f.id === selectedFilter)?.filter || 'none' }}
                    />
                  ) : (
                    <video src={URL.createObjectURL(capturedMedia)} controls className="w-full h-full object-contain" />
                  )
                )}
                {mode === 'upload' && previewUrl && (
                  uploadFile?.type?.startsWith('video/')
                    ? <video src={previewUrl} controls className="w-full h-full object-contain" />
                    : <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                )}
                {mode === 'type' && (
                  <div className="w-full h-full flex items-center justify-center p-6 bg-white dark:bg-gray-900">
                    <p className="text-gray-900 dark:text-white text-center font-bold text-base break-words leading-tight line-clamp-6">{textContent}</p>
                  </div>
                )}

                {/* Filter — palette icon toggle (camera photo only) */}
                {mode === 'camera' && mediaType === 'photo' && (
                  <>
                    <button
                      onClick={() => setShowFilters(!showFilters)}
                      className={`absolute top-2 right-2 z-10 p-2 rounded-full backdrop-blur-sm transition-all ${
                        showFilters ? 'bg-white/30 text-white' : 'bg-black/50 text-white/80 hover:bg-black/70'
                      }`}
                      title="Filters"
                    >
                      <Palette className="w-4 h-4" />
                    </button>

                    {showFilters && (
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-2 pt-8 pb-2">
                        <div className="flex gap-1.5 overflow-x-auto pb-1">
                          {filters.map(f => (
                            <button
                              key={f.id}
                              onClick={() => setSelectedFilter(f.id)}
                              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                                selectedFilter === f.id ? 'bg-white text-gray-900 shadow' : 'bg-white/20 text-white hover:bg-white/30'
                              }`}
                            >
                              {f.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Settings form — tighter top padding so image feels prominent */}
              <div className="flex-1 overflow-y-auto px-4 pt-2 pb-4 space-y-3 min-h-0">

                {/* Title */}
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  maxLength={255}
                  placeholder="Title *"
                  autoFocus
                  className="w-full px-4 py-2.5 bg-gray-800/80 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                />

                {/* Description */}
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  maxLength={2000}
                  rows={2}
                  placeholder="Description (optional)"
                  className="w-full px-4 py-2.5 bg-gray-800/80 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none text-sm"
                />

                {/* Custom room selector */}
                {hostedRooms.length > 0 && (
                  <div>
                    <button
                      onClick={() => setShowRoomDropdown(!showRoomDropdown)}
                      className="w-full flex items-center px-4 py-2.5 bg-gray-800/80 border border-gray-700 rounded-xl transition-colors hover:border-gray-600"
                    >
                      <span className="text-gray-500 text-xs flex-shrink-0">Post to</span>
                      <span className="flex-1 text-left text-purple-300 font-medium ml-2 text-sm truncate">
                        {selectedRoom ? selectedRoom.name : 'My Profile'}
                      </span>
                      <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${showRoomDropdown ? 'rotate-180' : ''}`} />
                    </button>

                    {showRoomDropdown && (
                      <div className="mt-1 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
                        <button
                          onClick={() => { setSelectedRoom(null); setShowRoomDropdown(false); }}
                          className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${!selectedRoom ? 'text-purple-300 bg-gray-700/50' : 'text-gray-300 hover:bg-gray-700/60'}`}
                        >
                          My Profile
                        </button>
                        {hostedRooms.map(r => (
                          <button
                            key={r.id}
                            onClick={() => { setSelectedRoom(r); setShowRoomDropdown(false); }}
                            className={`w-full px-4 py-2.5 text-left text-sm transition-colors border-t border-gray-700/60 ${selectedRoom?.id === r.id ? 'text-purple-300 bg-gray-700/50' : 'text-gray-300 hover:bg-gray-700/60'}`}
                          >
                            <span className="truncate">{r.name}</span>
                            <span className="text-gray-500 text-xs ml-1.5">({r.member_count || 0})</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Icon+label toggles — LeftSidebar style */}
                <div className="flex items-center justify-around py-1">
                  {/* Public / Private */}
                  <button
                    onClick={() => setIsPublic(!isPublic)}
                    className="flex flex-col items-center gap-1.5 group hover:opacity-70 transition-all"
                  >
                    {isPublic
                      ? <Globe className="w-6 h-6 text-purple-400 group-hover:scale-110 transition-transform" />
                      : <Lock className="w-6 h-6 text-gray-400 group-hover:scale-110 transition-transform" />
                    }
                    <span className="text-[10px] text-gray-300 font-medium">{isPublic ? 'Public' : 'Private'}</span>
                  </button>

                  {/* Downloads */}
                  {!isPaid && (
                    <button
                      onClick={() => setAllowDownloads(!allowDownloads)}
                      className="flex flex-col items-center gap-1.5 group hover:opacity-70 transition-all"
                    >
                      <Download className={`w-6 h-6 group-hover:scale-110 transition-transform ${allowDownloads ? 'text-cyan-400' : 'text-gray-500'}`} />
                      <span className="text-[10px] text-gray-300 font-medium">{allowDownloads ? 'Downloads' : 'No DL'}</span>
                    </button>
                  )}

                  {/* Paid / Free */}
                  <button
                    onClick={() => { setIsPaid(!isPaid); setPriceNaira(''); }}
                    className="flex flex-col items-center gap-1.5 group hover:opacity-70 transition-all"
                  >
                    <DollarSign className={`w-6 h-6 group-hover:scale-110 transition-transform ${isPaid ? 'text-yellow-400' : 'text-gray-500'}`} />
                    <span className="text-[10px] text-gray-300 font-medium">{isPaid ? 'Paid' : 'Free'}</span>
                  </button>
                </div>

                {/* Price input — smooth expand */}
                <div className={`overflow-hidden transition-all duration-300 ${isPaid ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0'}`}>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₦</span>
                    <input
                      type="number" min="122" step="1" value={priceNaira}
                      onChange={e => setPriceNaira(e.target.value)}
                      placeholder="e.g. 500"
                      className="w-full pl-8 pr-4 py-2.5 bg-gray-800/80 border border-yellow-700/50 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 text-sm"
                    />
                  </div>
                  {priceNaira && parseFloat(priceNaira) >= 122
                    ? <p className="text-xs text-gray-400 mt-1">≈ {Math.floor(parseFloat(priceNaira) / 122)} 🪙 · buyers pay to unlock</p>
                    : priceNaira ? <p className="text-xs text-red-400 mt-1">Minimum is ₦122</p> : null
                  }
                </div>

                {/* Content rating carousel */}
                <div>
                  <p className="text-xs font-medium text-gray-400 mb-2">Content Rating</p>
                  <div className="relative">
                    {/* Left arrow */}
                    <button
                      onClick={handleRatingPrev}
                      disabled={ratingScrollIndex === 0}
                      className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 bg-gray-700 hover:bg-gray-600 rounded-full flex items-center justify-center disabled:opacity-25 disabled:cursor-not-allowed transition-all"
                    >
                      <ChevronLeft className="w-4 h-4 text-white" />
                    </button>

                    {/* Cards */}
                    <div className="flex items-center justify-center gap-2 py-1 px-9 min-h-[80px]">
                      {visibleRatings.map((r, i) => {
                        const actualIdx = ratingStartIdx + i;
                        const isSelected = actualIdx === ratingScrollIndex;
                        return (
                          <div
                            key={r.value}
                            onClick={() => handleRatingSelect(actualIdx)}
                            className={`flex-shrink-0 cursor-pointer transition-all duration-300 ${isSelected ? 'w-16' : 'w-10 opacity-50 scale-90'}`}
                          >
                            <div className={`${r.bg} rounded-lg transition-all ${isSelected ? 'p-1.5 shadow-lg ring-2 ring-white/40' : 'p-1 shadow'}`}>
                              <img src={r.icon} alt={r.label} className="w-full h-auto rounded" />
                              <p className={`text-white font-bold text-center mt-0.5 ${isSelected ? 'text-[10px]' : 'text-[8px]'}`}>{r.label}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Right arrow */}
                    <button
                      onClick={handleRatingNext}
                      disabled={ratingScrollIndex === availableRatings.length - 1}
                      className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 bg-gray-700 hover:bg-gray-600 rounded-full flex items-center justify-center disabled:opacity-25 disabled:cursor-not-allowed transition-all"
                    >
                      <ChevronRight className="w-4 h-4 text-white" />
                    </button>

                    {/* Pagination dots — hidden on mobile */}
                    <div className="hidden sm:flex justify-center gap-1 mt-1">
                      {availableRatings.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => handleRatingSelect(i)}
                          className={`rounded-full transition-all ${i === ratingScrollIndex ? 'w-4 h-1 bg-purple-500' : 'w-1 h-1 bg-gray-600 hover:bg-gray-500'}`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Description strip */}
                  <div className="mt-2 bg-gray-800/60 border border-gray-700/60 rounded-lg px-3 py-2">
                    <p className="text-xs text-gray-300 leading-snug">{availableRatings[ratingScrollIndex]?.desc}</p>
                  </div>
                </div>

                {/* Submit */}
                <button
                  onClick={handleSubmit}
                  disabled={uploading || !title.trim()}
                  className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600
                             hover:from-purple-700 hover:to-pink-700
                             disabled:opacity-50 disabled:cursor-not-allowed
                             text-white font-bold rounded-xl transition-all active:scale-[0.98]
                             flex items-center justify-center gap-2 text-sm"
                >
                  <Upload className="w-4 h-4" />
                  Post
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </>
  );
}
