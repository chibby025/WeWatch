# LiveShare Graphics - WebSocket Integration Guide

## 📡 WebSocket Message Format

### Message Types

#### 1. Graphics Update (Backend → All Viewers)
Broadcast when host updates any graphics overlay.

```json
{
  "type": "liveshare_graphics_update",
  "data": {
    "session_id": 123,
    "graphic": {
      "id": 1,
      "session_id": 123,
      "type": "lower_third",
      "content": {
        "name": "John Doe",
        "title": "CEO, TechCorp",
        "imageUrl": "/uploads/avatars/john.jpg"
      },
      "position": "bottom-left",
      "active": true,
      "z_index": 10,
      "created_at": "2026-03-19T10:30:00Z",
      "updated_at": "2026-03-19T10:30:00Z"
    }
  }
}
```

**Graphic Types:**
- `lower_third` - Name/title banner at bottom
- `logo_bug` - Corner logo watermark
- `ticker` - Scrolling text at bottom
- `banner` - Full-width breaking news banner

---

## 🎨 Frontend Integration (RoomPage.jsx)

### Step 1: Add Canvas Element

Add canvas overlay on top of video element:

```jsx
<div className="relative w-full h-full">
  {/* Video element */}
  <video ref={videoRef} className="w-full h-full" />
  
  {/* Graphics overlay canvas */}
  <canvas
    id="graphics-canvas"
    className="absolute top-0 left-0 w-full h-full pointer-events-none"
    style={{ zIndex: 10 }}
  />
</div>
```

### Step 2: Initialize GraphicsRenderer

```jsx
import GraphicsRenderer from '../components/GraphicsRenderer';

const RoomPage = () => {
  const [graphicsRenderer, setGraphicsRenderer] = useState(null);
  
  // Initialize renderer on mount
  useEffect(() => {
    const canvas = document.getElementById('graphics-canvas');
    if (!canvas) return;
    
    const renderer = new GraphicsRenderer(canvas);
    renderer.init(1920, 1080); // Match video resolution
    renderer.startRendering();
    
    setGraphicsRenderer(renderer);
    
    return () => {
      renderer.stopRendering();
    };
  }, []);
  
  // ... rest of component
};
```

### Step 3: Handle WebSocket Messages

```jsx
useEffect(() => {
  if (!ws || !graphicsRenderer) return;
  
  const handleMessage = (event) => {
    const message = JSON.parse(event.data);
    
    if (message.type === 'liveshare_graphics_update') {
      handleGraphicsUpdate(message.data);
    }
  };
  
  ws.addEventListener('message', handleMessage);
  
  return () => {
    ws.removeEventListener('message', handleMessage);
  };
}, [ws, graphicsRenderer]);

const handleGraphicsUpdate = (data) => {
  const { graphic } = data;
  
  if (graphic.active) {
    // Add or update layer
    graphicsRenderer.addLayer(`graphic-${graphic.id}`, {
      type: graphic.type,
      content: graphic.content,
      position: graphic.position,
      zIndex: graphic.z_index,
    });
  } else {
    // Remove layer
    graphicsRenderer.removeLayer(`graphic-${graphic.id}`);
  }
};
```

### Step 4: Fetch Initial Graphics on Join

```jsx
useEffect(() => {
  if (!sessionId || !graphicsRenderer) return;
  
  // Fetch existing graphics when joining session
  const fetchGraphics = async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/sessions/${sessionId}/graphics`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );
      
      if (response.ok) {
        const graphics = await response.json();
        
        // Render all active graphics
        graphics.forEach((graphic) => {
          if (graphic.active) {
            graphicsRenderer.addLayer(`graphic-${graphic.id}`, {
              type: graphic.type,
              content: graphic.content,
              position: graphic.position,
              zIndex: graphic.z_index,
            });
          }
        });
      }
    } catch (error) {
      console.error('Failed to fetch graphics:', error);
    }
  };
  
  fetchGraphics();
}, [sessionId, graphicsRenderer]);
```

---

## 🎬 LiveShareManager Integration

### Sending Graphics Updates

When host toggles lower third in `LiveShareManager.jsx`:

```jsx
const handleToggleLowerThird = async () => {
  const active = !showLowerThird;
  setShowLowerThird(active);
  
  try {
    const response = await fetch(
      `${API_URL}/api/sessions/${sessionId}/graphics`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'lower_third',
          content: {
            name: lowerThirdName,
            title: lowerThirdTitle,
          },
          position: 'bottom-left',
          active: active,
          z_index: 10,
        }),
      }
    );
    
    if (response.ok) {
      // Backend will broadcast to all viewers via WebSocket
      console.log('Lower third updated successfully');
    }
  } catch (error) {
    console.error('Failed to update lower third:', error);
  }
};
```

### Uploading Logo Bug

```jsx
const handleLogoBugUpload = async (file) => {
  if (!file) return;
  
  // Validate size (500KB max)
  if (file.size > 500 * 1024) {
    toast.error('Logo must be less than 500KB');
    return;
  }
  
  const formData = new FormData();
  formData.append('logo', file);
  
  try {
    const response = await fetch(
      `${API_URL}/api/sessions/${sessionId}/logo-bug`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      setLogoBugUrl(data.logo_url);
      
      // Update graphics to show logo
      await fetch(`${API_URL}/api/sessions/${sessionId}/graphics`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'logo_bug',
          content: {
            imageUrl: data.logo_url,
          },
          position: 'top-right',
          active: true,
          z_index: 5,
        }),
      });
      
      toast.success('Logo uploaded successfully');
    }
  } catch (error) {
    console.error('Failed to upload logo:', error);
    toast.error('Failed to upload logo');
  }
};
```

### Adding Media to Queue

```jsx
const handleMediaQueueUpload = async (file) => {
  if (!file) return;
  
  // Validate size
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  const maxSize = isImage ? 5 * 1024 * 1024 : 20 * 1024 * 1024;
  
  if (file.size > maxSize) {
    const maxMB = isImage ? 5 : 20;
    toast.error(`File must be less than ${maxMB}MB`);
    return;
  }
  
  // Check queue limit
  if (mediaQueue.length >= 5) {
    toast.error('Maximum 5 media items allowed');
    return;
  }
  
  const formData = new FormData();
  formData.append('media', file);
  
  try {
    const response = await fetch(
      `${API_URL}/api/sessions/${sessionId}/media-queue`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      }
    );
    
    if (response.ok) {
      const queueItem = await response.json();
      setMediaQueue([...mediaQueue, queueItem]);
      toast.success('Media added to queue');
    }
  } catch (error) {
    console.error('Failed to add media:', error);
    toast.error('Failed to add media');
  }
};
```

---

## 🎯 Complete Example Component

```jsx
import React, { useState, useEffect } from 'react';
import GraphicsRenderer from './GraphicsRenderer';

const LiveShareViewer = ({ sessionId, token, ws }) => {
  const [graphicsRenderer, setGraphicsRenderer] = useState(null);
  
  // Initialize canvas renderer
  useEffect(() => {
    const canvas = document.getElementById('graphics-canvas');
    if (!canvas) return;
    
    const renderer = new GraphicsRenderer(canvas);
    renderer.init(1920, 1080);
    renderer.startRendering();
    
    setGraphicsRenderer(renderer);
    
    return () => renderer.stopRendering();
  }, []);
  
  // Fetch initial graphics
  useEffect(() => {
    if (!sessionId || !graphicsRenderer) return;
    
    const fetchGraphics = async () => {
      try {
        const response = await fetch(
          `${process.env.REACT_APP_API_URL}/api/sessions/${sessionId}/graphics`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          }
        );
        
        if (response.ok) {
          const graphics = await response.json();
          graphics.forEach((graphic) => {
            if (graphic.active) {
              graphicsRenderer.addLayer(`graphic-${graphic.id}`, {
                type: graphic.type,
                content: graphic.content,
                position: graphic.position,
                zIndex: graphic.z_index,
              });
            }
          });
        }
      } catch (error) {
        console.error('Failed to fetch graphics:', error);
      }
    };
    
    fetchGraphics();
  }, [sessionId, graphicsRenderer, token]);
  
  // Handle WebSocket updates
  useEffect(() => {
    if (!ws || !graphicsRenderer) return;
    
    const handleMessage = (event) => {
      const message = JSON.parse(event.data);
      
      if (message.type === 'liveshare_graphics_update') {
        const { graphic } = message.data;
        
        if (graphic.active) {
          graphicsRenderer.addLayer(`graphic-${graphic.id}`, {
            type: graphic.type,
            content: graphic.content,
            position: graphic.position,
            zIndex: graphic.z_index,
          });
        } else {
          graphicsRenderer.removeLayer(`graphic-${graphic.id}`);
        }
      }
    };
    
    ws.addEventListener('message', handleMessage);
    
    return () => ws.removeEventListener('message', handleMessage);
  }, [ws, graphicsRenderer]);
  
  return (
    <div className="relative w-full h-full">
      {/* Video element */}
      <video id="main-video" className="w-full h-full" />
      
      {/* Graphics overlay canvas */}
      <canvas
        id="graphics-canvas"
        className="absolute top-0 left-0 w-full h-full pointer-events-none"
        style={{ zIndex: 10 }}
      />
    </div>
  );
};

export default LiveShareViewer;
```

---

## 🔧 Backend WebSocket Broadcasting

The backend automatically broadcasts graphics updates:

```go
// In liveshare_graphics.go
func broadcastGraphicsUpdate(sessionID uint, graphic LiveShareGraphic) {
    message := map[string]interface{}{
        "type": "liveshare_graphics_update",
        "data": map[string]interface{}{
            "session_id": sessionID,
            "graphic":    graphic,
        },
    }
    
    messageJSON, _ := json.Marshal(message)
    hub := GetHub()
    
    // Get room ID from session
    var session WatchSession
    DB.First(&session, sessionID)
    
    // Broadcast to all room members
    hub.broadcastToRoom(session.RoomID, messageJSON)
}
```

---

## 📊 Message Flow Diagram

```
Host Updates Lower Third
         ↓
POST /api/sessions/:id/graphics
         ↓
Backend Handler (UpdateGraphics)
         ↓
Save to Database
         ↓
broadcastGraphicsUpdate()
         ↓
WebSocket Hub
         ↓
[Broadcast to All Viewers]
         ↓
Viewer A ← Viewer B ← Viewer C
         ↓
graphicsRenderer.addLayer()
         ↓
Canvas Renders at 60fps
```

---

## ✅ Testing WebSocket Integration

### Test 1: Lower Third Update
1. Host toggles lower third ON
2. Backend broadcasts `liveshare_graphics_update`
3. All viewers render lower third
4. Host toggles lower third OFF
5. All viewers remove lower third

### Test 2: Logo Bug Upload
1. Host uploads logo (<500KB)
2. Backend saves to `/uploads/liveshare/`
3. Backend broadcasts graphics update with `imageUrl`
4. All viewers render logo in corner

### Test 3: Multi-Viewer Sync
1. Open 3 browser tabs (1 host + 2 viewers)
2. Host updates graphics
3. Verify all tabs show changes within 500ms

### Test 4: Late Joiner
1. Host sets up graphics (lower third, logo)
2. New viewer joins session
3. Viewer calls `GET /api/sessions/:id/graphics`
4. Viewer renders all active graphics

---

## 🐛 Debug Tips

### Graphics Not Rendering
```javascript
// Check if canvas exists
const canvas = document.getElementById('graphics-canvas');
console.log('Canvas:', canvas);

// Check if renderer initialized
console.log('Renderer:', graphicsRenderer);

// Check if WebSocket connected
console.log('WebSocket state:', ws?.readyState);
```

### WebSocket Not Receiving Messages
```javascript
ws.addEventListener('message', (event) => {
  console.log('WebSocket message:', event.data);
});
```

### Graphics Out of Sync
```javascript
// Force re-fetch graphics
const refetchGraphics = async () => {
  const response = await fetch(`${API_URL}/api/sessions/${sessionId}/graphics`);
  const graphics = await response.json();
  console.log('Current graphics:', graphics);
};
```

---

## 📚 Related Files

- **Backend Handler:** `backend/internal/handlers/liveshare_graphics.go`
- **Frontend Renderer:** `frontend/src/components/GraphicsRenderer.js`
- **Host Controls:** `frontend/src/components/LiveShareManager.jsx`
- **WebSocket Hub:** `backend/internal/handlers/websocket.go`

---

**Status:** ✅ Complete - Ready for Integration
