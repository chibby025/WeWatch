// src/utils/GraphicsRenderer.js
// Canvas-based graphics overlay renderer for LiveShare Studio

export class GraphicsRenderer {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d');
    this.layers = [];
    this.animationFrameId = null;
    this.isRendering = false;
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
      }
    });
  }

  /**
   * Render lower third (name banner at bottom)
   */
  renderLowerThird(layer) {
    const { content } = layer;
    const { name, title, style } = content;
    
    if (!name) return;

    const ctx = this.ctx;
    const padding = 20;
    const height = style?.height || 80;
    const y = this.canvas.height - height - padding;
    
    // Background
    ctx.fillStyle = style?.bgColor || '#0052A5';
    ctx.fillRect(padding, y, 400, height);
    
    // Accent bar
    ctx.fillStyle = style?.accentBar || '#DC2626';
    ctx.fillRect(padding, y, 5, height);
    
    // Text
    ctx.fillStyle = style?.textColor || '#FFFFFF';
    ctx.font = `bold ${style?.fontSize || 24}px ${style?.font || 'Arial'}`;
    ctx.fillText(name, padding + 20, y + 35);
    
    if (title) {
      ctx.font = `${style?.fontSize ? style.fontSize - 6 : 18}px ${style?.font || 'Arial'}`;
      ctx.fillText(title, padding + 20, y + 60);
    }
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
   * Render scrolling ticker (news headlines)
   */
  renderTicker(layer) {
    const { content } = layer;
    const { headlines, style } = content;
    
    if (!headlines || headlines.length === 0) return;

    const ctx = this.ctx;
    const height = style?.height || 40;
    const y = this.canvas.height - height;
    
    // Background
    ctx.fillStyle = style?.bgColor || '#DC2626';
    ctx.fillRect(0, y, this.canvas.width, height);
    
    // Text
    ctx.fillStyle = style?.textColor || '#FFFFFF';
    ctx.font = `bold ${style?.fontSize || 16}px ${style?.font || 'Arial'}`;
    
    // Simple scrolling (would need requestAnimationFrame for smooth animation)
    const text = headlines.join('  •  ');
    const offset = (Date.now() / 50) % (ctx.measureText(text).width + this.canvas.width);
    ctx.fillText(text, this.canvas.width - offset, y + 25);
  }

  /**
   * Render banner (breaking news, etc)
   */
  renderBanner(layer) {
    const { content } = layer;
    const { text, style } = content;
    
    if (!text) return;

    const ctx = this.ctx;
    const height = style?.height || 60;
    const y = style?.position === 'bottom' 
      ? this.canvas.height - height 
      : 0;
    
    // Background
    ctx.fillStyle = style?.bgColor || '#DC2626';
    ctx.fillRect(0, y, this.canvas.width, height);
    
    // Text (centered)
    ctx.fillStyle = style?.textColor || '#FFFFFF';
    ctx.font = `bold ${style?.fontSize || 28}px ${style?.font || 'Impact'}`;
    ctx.textAlign = 'center';
    ctx.fillText(text, this.canvas.width / 2, y + height / 2 + 10);
    ctx.textAlign = 'left'; // Reset
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
