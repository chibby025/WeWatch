// src/utils/GraphicsRenderer.js
// Canvas-based graphics overlay renderer for LiveShare Studio

export class GraphicsRenderer {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d');
    this.layers = [];
    this.animationFrameId = null;
    this.isRendering = false;
    this.imageCache = {}; // ✅ Cache loaded images
    this.videoCache = {}; // ✅ Cache video elements
    this.activeVideo = null; // Currently playing video
  }

  /**
   * Initialize canvas with proper sizing
   */
  init(width = 1920, height = 1080) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.clear();
  }

  /**
   * Clear canvas
   */
  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Add graphics layer
   * @param {string} id - Unique layer ID
   * @param {object} config - Layer configuration
   */
  addLayer(id, config) {
    // Remove existing layer with same ID
    this.layers = this.layers.filter(layer => layer.id !== id);
    
    // Add new layer
    this.layers.push({
      id,
      ...config,
      zIndex: config.zIndex || 1
    });
    
    // Sort by z-index
    this.sort();
  }

  /**
   * Remove layer by ID
   */
  removeLayer(id) {
    this.layers = this.layers.filter(layer => layer.id !== id);
    
    // Clean up break media state if break screen is removed
    if (id === 'break_screen' && this.breakMediaState) {
      console.log('🧹 [GraphicsRenderer] Cleaning up break media state');
      this.breakMediaState = null;
      
      // Stop and cleanup active video
      if (this.activeVideo) {
        console.log('🎥 [GraphicsRenderer] Stopping active video');
        this.activeVideo.pause();
        this.activeVideo.src = '';
        this.activeVideo = null;
      }
    }
  }

  /**
   * Update layer configuration
   */
  updateLayer(id, updates) {
    const layer = this.layers.find(l => l.id === id);
    if (layer) {
      Object.assign(layer, updates);
    }
  }

  /**
   * Sort layers by z-index
   */
  sort() {
    this.layers.sort((a, b) => a.zIndex - b.zIndex);
  }

  /**
   * Render all layers
   */
  render() {
    this.clear();
    
    this.layers.forEach(layer => {
      if (layer.type === 'lower_third') {
        this.renderLowerThird(layer);
      } else if (layer.type === 'logo_bug') {
        this.renderLogoBug(layer);
      } else if (layer.type === 'ticker') {
        this.renderTicker(layer);
      } else if (layer.type === 'banner') {
        this.renderBanner(layer);
      } else if (layer.type === 'media_queue') {
        this.renderMediaQueue(layer);
      } else if (layer.type === 'break_screen') {
        this.renderBreakScreen(layer);
      }
    });
    
    // Continue rendering if video is playing
    if (this.activeVideo && !this.activeVideo.paused) {
      requestAnimationFrame(() => this.render());
    }
  }

  /**
   * Render lower third (name banner at bottom) - CNN style with overlapping boxes
   */
  renderLowerThird(layer) {
    const { content } = layer;
    const { name, title, style } = content;
    
    if (!name) return;

    const ctx = this.ctx;
    const padding = 40;
    const baseY = this.canvas.height - 120; // Position from bottom
    
    // Box dimensions
    const nameBoxWidth = 400;
    const nameBoxHeight = 50;
    const titleBoxWidth = 380;
    const titleBoxHeight = 45;
    
    // Calculate font sizes to fill box heights (approximately 75% of box height)
    const nameFontSize = style?.nameFontSize || Math.floor(nameBoxHeight * 0.75);
    const titleFontSize = style?.titleFontSize || Math.floor(titleBoxHeight * 0.75);
    const condensedFont = "'Arial Narrow', 'Helvetica Neue Condensed', 'Roboto Condensed', sans-serif";
    
    // CNN-style: Title box (bottom, behind)
    if (title) {
      ctx.fillStyle = style?.bgColor || '#0052A5'; // Blue background
      ctx.fillRect(padding + 25, baseY + 49, titleBoxWidth, titleBoxHeight);
      
      // Accent bar on left
      ctx.fillStyle = style?.accentBar || '#DC2626'; // Red accent
      ctx.fillRect(padding + 25, baseY + 49, 4, titleBoxHeight);
      
      // Title text
      ctx.fillStyle = style?.textColor || '#FFFFFF';
      ctx.font = `300 ${titleFontSize}px ${condensedFont}`; // 300 = light weight
      ctx.textBaseline = 'middle';
      ctx.fillText(title, padding + 40, baseY + 49 + (titleBoxHeight / 2));
    }
    
    // CNN-style: Name box (top, overlapping and in front)
    ctx.fillStyle = style?.accentBar || '#DC2626'; // Red background for name
    ctx.fillRect(padding, baseY, nameBoxWidth, nameBoxHeight);
    
    // Name text (white on red)
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `300 ${nameFontSize}px ${condensedFont}`; // 300 = light weight
    ctx.textBaseline = 'middle';
    ctx.fillText(name, padding + 15, baseY + (nameBoxHeight / 2));
  }

  /**
   * Render logo bug (top-right corner)
   */
  renderLogoBug(layer) {
    const { content } = layer;
    const { imageUrl, style } = content;
    
    if (!imageUrl) return;

    const img = new Image();
    img.onload = () => {
      const size = style?.size || 100;
      const x = this.canvas.width - size - (style?.x || 20);
      const y = style?.y || 20;
      
      this.ctx.globalAlpha = style?.opacity || 0.9;
      this.ctx.drawImage(img, x, y, size, size);
      this.ctx.globalAlpha = 1.0;
    };
    img.src = imageUrl;
  }

  /**
   * Render scrolling ticker (news headlines) with time display
   */
  renderTicker(layer) {
    const { content } = layer;
    const { items, headlines, style } = content;
    
    // Support both 'items' and 'headlines' for backwards compatibility
    const tickerItems = items || headlines;
    
    if (!tickerItems || tickerItems.length === 0) return;

    const ctx = this.ctx;
    const height = style?.height || 60;
    const y = this.canvas.height - height;
    const timeBoxWidth = 120;
    
    // 1. Draw ticker background (full width)
    ctx.fillStyle = style?.bgColor || '#DC2626';
    ctx.fillRect(0, y, this.canvas.width, height);
    
    // 2. Draw scrolling text (clipped to not overlap time box)
    ctx.save();
    ctx.beginPath();
    ctx.rect(timeBoxWidth + 10, y, this.canvas.width - timeBoxWidth - 10, height);
    ctx.clip();
    
    const text = tickerItems.join('  •  ');
    const offset = (Date.now() / 25) % (ctx.measureText(text).width + this.canvas.width);
    ctx.fillStyle = style?.textColor || '#FFFFFF';
    ctx.font = `bold ${style?.fontSize || 28}px ${style?.font || 'Arial'}`;
    ctx.fillText(text, timeBoxWidth + 10 + this.canvas.width - offset, y + height / 2 + 10);
    ctx.restore();
    
    // 3. Draw time box (on top - text slides under it)
    const timeBoxBg = style?.timeBoxColor || '#1A1A2E';
    ctx.fillStyle = timeBoxBg;
    ctx.fillRect(0, y, timeBoxWidth, height);
    
    // 4. Draw time text (HH:MM format)
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const timeText = `${hours}:${minutes}`;
    
    ctx.fillStyle = '#FFFFFF'; // Always white
    ctx.font = `bold ${style?.fontSize || 28}px ${style?.font || 'Arial'}`;
    ctx.textAlign = 'center';
    ctx.fillText(timeText, timeBoxWidth / 2, y + height / 2 + 10);
    ctx.textAlign = 'left'; // Reset
    
    // 5. Draw border around time box
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, y, timeBoxWidth, height);
  }

  /**
   * Banner rendering removed - now using DOM-based rendering in VideoWatch.jsx
   * Canvas rendering had coordinate system issues with CSS-positioned elements
   * 
   * @deprecated Use DOM-based banner in VideoWatch.jsx instead
   */
  renderBanner(layer) {
    console.warn('[GraphicsRenderer] Banner rendering moved to DOM - see VideoWatch.jsx');
    // No-op: Banner now rendered as DOM element
  }

  /**
   * Start continuous rendering (60fps)
   */
  startRendering() {
    if (this.isRendering) return;
    
    this.isRendering = true;
    
    const renderLoop = () => {
      this.render();
      
      if (this.isRendering) {
        this.animationFrameId = requestAnimationFrame(renderLoop);
      }
    };
    
    renderLoop();
  }

  /**
   * Render media queue item (image/video overlay)
   */
  renderMediaQueue(layer) {
    const { content } = layer;
    const { mediaUrl, mediaType, itemId } = content;
    
    console.log('🎨 [GraphicsRenderer] renderMediaQueue called:', { mediaUrl, mediaType, itemId, cached: !!this.imageCache[mediaUrl] });
    
    if (!mediaUrl) {
      console.warn('⚠️ [GraphicsRenderer] No mediaUrl provided');
      return;
    }

    const ctx = this.ctx;
    
    // Render images
    if (mediaType && mediaType.startsWith('image')) {
      // Check cache first
      if (this.imageCache[mediaUrl]) {
        const img = this.imageCache[mediaUrl];
        console.log('✅ [GraphicsRenderer] Drawing cached image:', { width: img.width, height: img.height });
        
        // Center the image, scale to fit
        const maxWidth = this.canvas.width * 0.7; // 70% of canvas
        const maxHeight = this.canvas.height * 0.7;
        
        let width = img.width;
        let height = img.height;
        
        // Scale to fit
        const scale = Math.min(maxWidth / width, maxHeight / height);
        width *= scale;
        height *= scale;
        
        const x = (this.canvas.width - width) / 2;
        const y = (this.canvas.height - height) / 2;
        
        console.log('🎨 [GraphicsRenderer] Image dimensions:', { canvasW: this.canvas.width, canvasH: this.canvas.height, imgW: width, imgH: height, x, y, scale });
        
        // Semi-transparent dark background for better visibility
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Optional: Add subtle border around image
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 2, y - 2, width + 4, height + 4);
        
        // Draw image
        ctx.drawImage(img, x, y, width, height);
        console.log('✅ [GraphicsRenderer] Image drawn successfully');
        
      } else {
        // First load - cache it and trigger re-render
        console.log('📥 [GraphicsRenderer] Loading image for first time...');
        const img = new Image();
        img.onload = () => {
          console.log('✅ [GraphicsRenderer] Image loaded, caching and re-rendering');
          this.imageCache[mediaUrl] = img;
          this.render(); // Re-render now that image is loaded
        };
        img.onerror = () => {
          console.error('❌ [GraphicsRenderer] Failed to load media queue image:', mediaUrl);
        };
        img.src = mediaUrl;
        
        // Show loading state
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Loading media...', this.canvas.width / 2, this.canvas.height / 2);
        ctx.textAlign = 'left'; // Reset
        console.log('⏳ [GraphicsRenderer] Showing loading state');
      }
    } else if (mediaType && mediaType.startsWith('video')) {
      // Show video placeholder for now
      console.log('🎥 [GraphicsRenderer] Video playback not yet implemented');
      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '28px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('🎥 Video Playback', this.canvas.width / 2, this.canvas.height / 2 - 20);
      ctx.font = '18px Arial';
      ctx.fillText('Video support coming soon', this.canvas.width / 2, this.canvas.height / 2 + 20);
      ctx.textAlign = 'left'; // Reset
    }
  }

  /**
   * Render break screen overlay
   */
  renderBreakScreen(layer) {
    const { content } = layer;
    const { screenSource, customImage, timeRemaining, keepAudio } = content;
    
    const ctx = this.ctx;
    
    // Full screen overlay with dark background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Render based on screen source
    if (screenSource === 'static') {
      // Static text: "We'll Be Right Back!"
      ctx.font = 'bold 72px Arial';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText("We'll Be Right Back!", this.canvas.width / 2, this.canvas.height / 2 - 50);
      
      // Show countdown timer
      if (timeRemaining !== undefined) {
        const minutes = Math.floor(timeRemaining / 60);
        const seconds = timeRemaining % 60;
        const timeText = `${minutes}:${String(seconds).padStart(2, '0')}`;
        
        ctx.font = 'bold 48px Arial';
        ctx.fillStyle = '#FFA500';
        ctx.fillText(timeText, this.canvas.width / 2, this.canvas.height / 2 + 50);
      }
      
    } else if (screenSource === 'upload' && customImage) {
      // Custom uploaded image - use cache to avoid async loading issues
      console.log('🎨 [GraphicsRenderer] Rendering custom break image');
      
      if (!this.imageCache[customImage]) {
        // First time seeing this image - load it
        console.log('🎨 [GraphicsRenderer] Loading custom image into cache');
        const img = new Image();
        img.onload = () => {
          console.log('✅ [GraphicsRenderer] Custom image loaded successfully');
          this.imageCache[customImage] = img;
          this.render(); // Re-render now that image is loaded
        };
        img.onerror = (err) => {
          console.error('❌ [GraphicsRenderer] Failed to load custom image:', err);
        };
        img.src = customImage;
        
        // Show loading text while image loads
        ctx.font = 'bold 48px Arial';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Loading image...', this.canvas.width / 2, this.canvas.height / 2);
      } else {
        // Image is cached - draw it immediately
        const img = this.imageCache[customImage];
        const maxWidth = this.canvas.width * 0.6;
        const maxHeight = this.canvas.height * 0.6;
        
        let width = img.width;
        let height = img.height;
        
        const scale = Math.min(maxWidth / width, maxHeight / height);
        width *= scale;
        height *= scale;
        
        const x = (this.canvas.width - width) / 2;
        const y = (this.canvas.height - height) / 2 - 50;
        
        ctx.drawImage(img, x, y, width, height);
        
        console.log('✅ [GraphicsRenderer] Custom image drawn:', { width, height, x, y });
        
        // Show countdown below image
        if (timeRemaining !== undefined) {
          const minutes = Math.floor(timeRemaining / 60);
          const seconds = timeRemaining % 60;
          const timeText = `${minutes}:${String(seconds).padStart(2, '0')}`;
          
          ctx.font = 'bold 48px Arial';
          ctx.fillStyle = '#FFA500';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(timeText, this.canvas.width / 2, y + height + 80);
        }
      }
      
    } else if (screenSource === 'animation') {
      // Loading animation (spinning circle)
      const centerX = this.canvas.width / 2;
      const centerY = this.canvas.height / 2 - 50;
      const radius = 50;
      const lineWidth = 8;
      
      // Draw spinning arc
      const rotation = (Date.now() / 1000) * Math.PI; // Rotate based on time
      
      ctx.strokeStyle = '#FFA500';
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, rotation, rotation + Math.PI * 1.5);
      ctx.stroke();
      
      // "Taking a Break" text
      ctx.font = 'bold 48px Arial';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Taking a Break', centerX, centerY + 100);
      
      // Show countdown
      if (timeRemaining !== undefined) {
        const minutes = Math.floor(timeRemaining / 60);
        const seconds = timeRemaining % 60;
        const timeText = `${minutes}:${String(seconds).padStart(2, '0')}`;
        
        ctx.font = 'bold 36px Arial';
        ctx.fillStyle = '#FFA500';
        ctx.fillText(timeText, centerX, centerY + 160);
      }
      
    } else if (screenSource === 'media') {
      // Media queue playback during break
      const { mediaMode, mediaItems } = content;
      
      if (!mediaItems || mediaItems.length === 0) {
        // No media selected - show error message
        ctx.font = 'bold 48px Arial';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('No Media Selected', this.canvas.width / 2, this.canvas.height / 2 - 40);
        
        ctx.font = '24px Arial';
        ctx.fillStyle = '#AAAAAA';
        ctx.fillText('Host needs to select media items', this.canvas.width / 2, this.canvas.height / 2 + 10);
        return;
      }
      
      // Initialize media playback state if needed
      if (!this.breakMediaState) {
        this.breakMediaState = {
          currentIndex: 0,
          startTime: Date.now(),
          imageDisplayDuration: 10000, // 10 seconds per image
          mode: mediaMode // 'one' or 'all'
        };
        console.log('🎬 [GraphicsRenderer] Initialized break media playback:', this.breakMediaState);
      }
      
      const state = this.breakMediaState;
      const currentItem = mediaItems[state.currentIndex];
      
      if (!currentItem) {
        console.error('❌ [GraphicsRenderer] No current media item');
        return;
      }
      
      // Load and render current media
      const mediaUrl = currentItem.url;
      
      if (currentItem.type === 'image') {
        // Handle image display
        if (!this.imageCache[mediaUrl]) {
          // Load image
          const img = new Image();
          img.onload = () => {
            console.log('✅ [GraphicsRenderer] Break media image loaded:', currentItem.filename);
            this.imageCache[mediaUrl] = img;
            this.render();
          };
          img.onerror = (err) => {
            console.error('❌ [GraphicsRenderer] Failed to load break media image:', err);
          };
          img.src = mediaUrl;
          
          // Show loading
          ctx.font = 'bold 36px Arial';
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('Loading media...', this.canvas.width / 2, this.canvas.height / 2);
        } else {
          // Draw cached image
          const img = this.imageCache[mediaUrl];
          const maxWidth = this.canvas.width * 0.9;
          const maxHeight = this.canvas.height * 0.9;
          
          let width = img.width;
          let height = img.height;
          
          const scale = Math.min(maxWidth / width, maxHeight / height, 1);
          width *= scale;
          height *= scale;
          
          const x = (this.canvas.width - width) / 2;
          const y = (this.canvas.height - height) / 2;
          
          ctx.drawImage(img, x, y, width, height);
          
          // Check if it's time to advance (for images)
          const elapsed = Date.now() - state.startTime;
          if (elapsed >= state.imageDisplayDuration && state.mode === 'all') {
            // Auto-advance to next item
            if (state.currentIndex < mediaItems.length - 1) {
              state.currentIndex++;
              state.startTime = Date.now();
              console.log('➡️ [GraphicsRenderer] Auto-advancing to next media:', state.currentIndex);
            } else {
              // Loop back to start
              state.currentIndex = 0;
              state.startTime = Date.now();
              console.log('🔄 [GraphicsRenderer] Looping back to first media');
            }
          }
        }
      } else if (currentItem.type === 'video') {
        // Handle video playback
        if (!this.videoCache[mediaUrl]) {
          // Create and load video element
          console.log('🎥 [GraphicsRenderer] Creating video element for:', currentItem.filename);
          const video = document.createElement('video');
          video.src = mediaUrl;
          video.muted = false; // Allow audio
          video.crossOrigin = 'anonymous';
          video.playsInline = true;
          
          // Video loaded and ready
          video.onloadeddata = () => {
            console.log('✅ [GraphicsRenderer] Video loaded:', currentItem.filename);
            this.videoCache[mediaUrl] = video;
            
            // Start playing
            video.play().then(() => {
              console.log('▶️ [GraphicsRenderer] Video playing');
              this.activeVideo = video;
              this.render(); // Trigger continuous rendering
            }).catch(err => {
              console.error('❌ [GraphicsRenderer] Failed to play video:', err);
            });
          };
          
          // Video ended - auto-advance for "all" mode
          video.onended = () => {
            console.log('🏁 [GraphicsRenderer] Video ended');
            this.activeVideo = null;
            
            if (state.mode === 'all') {
              // Auto-advance to next item
              if (state.currentIndex < mediaItems.length - 1) {
                state.currentIndex++;
                state.startTime = Date.now();
                console.log('➡️ [GraphicsRenderer] Auto-advancing to next media:', state.currentIndex);
                this.render();
              } else {
                // Loop back to start
                state.currentIndex = 0;
                state.startTime = Date.now();
                console.log('🔄 [GraphicsRenderer] Looping back to first media');
                this.render();
              }
            }
          };
          
          video.onerror = (err) => {
            console.error('❌ [GraphicsRenderer] Failed to load video:', err);
            // Show error and skip to next
            if (state.mode === 'all' && state.currentIndex < mediaItems.length - 1) {
              state.currentIndex++;
              state.startTime = Date.now();
              this.render();
            }
          };
          
          video.load();
          
          // Show loading
          ctx.font = 'bold 36px Arial';
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('Loading video...', this.canvas.width / 2, this.canvas.height / 2);
        } else {
          // Video is cached - draw current frame to canvas
          const video = this.videoCache[mediaUrl];
          
          // Start playing if not already
          if (video.paused && video.readyState >= 2) {
            video.play().then(() => {
              console.log('▶️ [GraphicsRenderer] Resumed cached video');
              this.activeVideo = video;
            }).catch(err => {
              console.error('❌ [GraphicsRenderer] Failed to resume video:', err);
            });
          }
          
          // Draw video frame to canvas
          if (video.readyState >= 2) {
            const maxWidth = this.canvas.width * 0.9;
            const maxHeight = this.canvas.height * 0.9;
            
            let width = video.videoWidth;
            let height = video.videoHeight;
            
            const scale = Math.min(maxWidth / width, maxHeight / height, 1);
            width *= scale;
            height *= scale;
            
            const x = (this.canvas.width - width) / 2;
            const y = (this.canvas.height - height) / 2;
            
            ctx.drawImage(video, x, y, width, height);
            
            // Show video progress bar
            const progress = video.currentTime / video.duration;
            const barWidth = width * 0.8;
            const barHeight = 4;
            const barX = x + (width - barWidth) / 2;
            const barY = y + height + 20;
            
            // Background
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.fillRect(barX, barY, barWidth, barHeight);
            
            // Progress
            ctx.fillStyle = '#FFA500';
            ctx.fillRect(barX, barY, barWidth * progress, barHeight);
            
            // Time display
            const currentMin = Math.floor(video.currentTime / 60);
            const currentSec = Math.floor(video.currentTime % 60);
            const totalMin = Math.floor(video.duration / 60);
            const totalSec = Math.floor(video.duration % 60);
            const timeText = `${currentMin}:${String(currentSec).padStart(2, '0')} / ${totalMin}:${String(totalSec).padStart(2, '0')}`;
            
            ctx.font = 'bold 18px Arial';
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(timeText, this.canvas.width / 2, barY + 15);
          }
        }
      }
      
      // Show countdown timer in corner
      if (timeRemaining !== undefined) {
        const minutes = Math.floor(timeRemaining / 60);
        const seconds = timeRemaining % 60;
        const timeText = `Break: ${minutes}:${String(seconds).padStart(2, '0')}`;
        
        ctx.font = 'bold 24px Arial';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(this.canvas.width - 180, 20, 160, 40);
        ctx.fillStyle = '#FFA500';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(timeText, this.canvas.width - 30, 30);
      }
      
      // Show media indicator
      if (mediaItems.length > 1) {
        const indicator = `${state.currentIndex + 1} / ${mediaItems.length}`;
        ctx.font = 'bold 20px Arial';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(20, this.canvas.height - 60, 100, 40);
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(indicator, 30, this.canvas.height - 50);
      }
      
    } else {
      // Fallback for unknown screen sources
      ctx.font = 'bold 48px Arial';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText("We'll Be Right Back!", this.canvas.width / 2, this.canvas.height / 2);
    }
    
    // Show mic pulse indicator if audio is kept on
    if (keepAudio) {
      const pulseX = this.canvas.width - 80;
      const pulseY = 60;
      const pulseRadius = 20;
      
      // Pulsing circle
      const pulse = 0.5 + 0.5 * Math.sin((Date.now() / 500) * Math.PI);
      
      ctx.fillStyle = `rgba(34, 197, 94, ${0.3 + pulse * 0.4})`;
      ctx.beginPath();
      ctx.arc(pulseX, pulseY, pulseRadius + pulse * 10, 0, Math.PI * 2);
      ctx.fill();
      
      // Mic icon (simplified)
      ctx.fillStyle = '#22C55E';
      ctx.beginPath();
      ctx.arc(pulseX, pulseY, pulseRadius, 0, Math.PI * 2);
      ctx.fill();
      
      // "LIVE" text
      ctx.font = 'bold 12px Arial';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('LIVE', pulseX, pulseY);
    }
  }

  /**
   * Stop rendering
   */
  stopRendering() {
    this.isRendering = false;
    
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Cleanup
   */
  destroy() {
    this.stopRendering();
    this.layers = [];
    this.clear();
  }
}

export default GraphicsRenderer;
