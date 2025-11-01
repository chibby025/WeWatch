// utils/generatePoster.js
export const generatePosterFromVideoFile = (fileOrUrl) => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'metadata';
    video.crossOrigin = 'anonymous'; // ✅ Critical for CORS
    video.playsInline = true;

    const isFile = fileOrUrl instanceof File;
    const url = isFile ? URL.createObjectURL(fileOrUrl) : fileOrUrl;
    let hasCalledReject = false;

    const handleError = (msg = 'Video load failed') => {
      if (hasCalledReject) return;
      hasCalledReject = true;
      if (isFile) URL.revokeObjectURL(url);
      video.remove();
      reject(new Error(msg));
    };

    video.onerror = () => handleError();
    video.onabort = () => handleError();

    // ✅ TIMEOUT FOR LARGE FILES (8 seconds)
    const timeout = setTimeout(() => {
      handleError("Video metadata load timeout");
    }, 8000);

    video.onloadedmetadata = () => {
      clearTimeout(timeout);
      const seekTime = Math.min(5, video.duration * 0.25 || 5);
      video.currentTime = seekTime;
    };

    video.onseeked = () => {
      clearTimeout(timeout);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const maxWidth = 320;
      const scale = Math.min(1, maxWidth / (video.videoWidth || 1));
      canvas.width = (video.videoWidth || 1) * scale;
      canvas.height = (video.videoHeight || 1) * scale;

      // ✅ Check for canvas tainting
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      } catch (e) {
        handleError("Canvas tainted - CORS issue");
        return;
      }

      const posterUrl = canvas.toDataURL('image/jpeg', 0.7);
      resolve(posterUrl);
      if (isFile) URL.revokeObjectURL(url);
      video.remove();
    };

    video.src = url;
  });
};