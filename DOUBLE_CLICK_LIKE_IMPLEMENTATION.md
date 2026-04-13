# Double-Click Like Implementation Guide

## Summary
All three watch session pages (VideoWatch, CinemaScene3DDemo, LectureHallPage) need:
1. Import TikTokHeartAnimation component
2. Add state for showing animation
3. Add double-click handler to main video/canvas container
4. Call like API endpoint
5. Show TikTok-style heart animation at center of screen
6. Handle already-liked state (don't allow duplicate likes)

## Common Implementation Pattern

### 1. Imports Needed
```javascript
import TikTokHeartAnimation from '../TikTokHeartAnimation'; // Adjust path as needed
import { HeartIcon } from '@heroicons/react/24/solid';
import apiClient from '../../services/api'; // Adjust path as needed
```

### 2. State Management
```javascript
// Add to existing useState declarations
const [showHeartAnimation, setShowHeartAnimation] = useState(false);
const [isSessionLiked, setIsSessionLiked] = useState(false);
const [sessionLikes, setSessionLikes] = useState(0);
const lastLikeTime = useRef(0); // Debounce double-click
```

### 3. Fetch Like Status on Mount
```javascript
// Add useEffect to fetch initial like status
useEffect(() => {
  const fetchLikeStatus = async () => {
    if (!sessionId) return;
    try {
      const response = await apiClient.get(`/api/sessions/${sessionId}/like-status`);
      setIsSessionLiked(response.data.isLiked);
      setSessionLikes(response.data.count);
    } catch (err) {
      console.error('Failed to fetch like status:', err);
    }
  };
  
  fetchLikeStatus();
}, [sessionId]);
```

### 4. Double-Click Handler Function
```javascript
const handleDoubleClickLike = async (e) => {
  e.preventDefault();
  e.stopPropagation();
  
  // Debounce (prevent rapid double-clicks)
  const now = Date.now();
  if (now - lastLikeTime.current < 1000) return;
  lastLikeTime.current = now;
  
  // Don't allow liking again if already liked
  if (isSessionLiked) {
    toast.error('You already liked this session!', { duration: 2000 });
    return;
  }
  
  // Show animation immediately
  setShowHeartAnimation(true);
  
  // Optimistic UI update
  setIsSessionLiked(true);
  setSessionLikes(prev => prev + 1);
  
  // Call API
  try {
    await apiClient.post(`/api/sessions/${sessionId}/like`);
    toast.success('Liked! ❤️', { duration: 2000 });
  } catch (err) {
    console.error('Failed to like session:', err);
    // Revert on error
    setIsSessionLiked(false);
    setSessionLikes(prev => prev - 1);
    toast.error(err.response?.data?.error || 'Failed to like session');
  }
};
```

### 5. Add to Main Container
Find the main video/canvas container div and add `onDoubleClick`:

```javascript
<div 
  className="video-container" // Or canvas-container, or main-content-area
  onDoubleClick={handleDoubleClickLike}
  style={{ position: 'relative' }} // Ensure relative positioning for absolute child
>
  {/* Existing video/canvas content */}
  
  {/* Add TikTok Heart Animation */}
  {showHeartAnimation && (
    <TikTokHeartAnimation 
      onComplete={() => setShowHeartAnimation(false)}
    />
  )}
</div>
```

### 6. WebSocket Listener for Real-Time Updates (Optional)
```javascript
// In existing WebSocket message handler, add case for session_liked
case 'session_liked':
  if (data.sessionId === sessionId) {
    setSessionLikes(data.newCount);
  }
  break;
```

## File-Specific Implementation

### VideoWatch.jsx (frontend/src/components/cinema/VideoWatch.jsx)

**Target Container:** Look for the main video player wrapper (around line 4500-5000)
- Likely `<div className="relative w-full h-full">` containing CinemaVideoPlayer
- Add `onDoubleClick={handleDoubleClickLike}` to this container

**Path Adjustments:**
- TikTokHeartAnimation import: `import TikTokHeartAnimation from '../TikTokHeartAnimation';`
- apiClient import: `import apiClient from '../../services/api';`

**sessionId Variable:** Use `sessionId` from useParams or props

---

### CinemaScene3DDemo.jsx (frontend/src/components/cinema/CinemaScene3DDemo.jsx)

**Target Container:** Look for the Three.js canvas container (around line 6500-6700)
- Likely `<div ref={mountRef}` or `<div className="cinema-scene-container">`
- Add `onDoubleClick={handleDoubleClickLike}` to this wrapper div

**Path Adjustments:**
- TikTokHeartAnimation import: `import TikTokHeartAnimation from '../TikTokHeartAnimation';`
- apiClient import: `import apiClient from '../../services/api';`

**sessionId Variable:** Use `sessionId` from useParams or props

---

### LectureHallPage.jsx (frontend/src/components/LectureHall/LectureHallPage.jsx)

**Target Container:** Look for the Three.js lecture hall canvas (around line 7500-7700)
- Likely `<div ref={mountRef}` or `<div className="lecture-hall-container">`
- Add `onDoubleClick={handleDoubleClickLike}` to this wrapper div

**Path Adjustments:**
- TikTokHeartAnimation import: `import TikTokHeartAnimation from '../../TikTokHeartAnimation';`
- apiClient import: `import apiClient from '../../../services/api';`

**sessionId Variable:** Use `sessionId` from useParams or props

---

## Testing Checklist

### Basic Functionality
- [ ] Double-click shows heart animation at center of screen
- [ ] Heart animation fades out after 800ms
- [ ] Like count increases by 1
- [ ] API POST request sent to `/api/sessions/:id/like`
- [ ] Toast notification shows "Liked! ❤️"

### Edge Cases
- [ ] Double-clicking again shows error "You already liked this session!"
- [ ] Rapid double-clicks are debounced (only first one counts)
- [ ] If API fails, like count reverts and error toast shows
- [ ] Animation doesn't interfere with video/canvas interaction

### Real-Time Updates
- [ ] When another user likes, count updates via WebSocket
- [ ] Like status persists after page refresh
- [ ] Liked status shows correctly on lobby preview cards

### UI/UX
- [ ] Heart animation is clearly visible over video content
- [ ] Animation doesn't block critical UI elements
- [ ] Double-click doesn't interfere with fullscreen toggle
- [ ] Works in all watch types (video, 3D cinema, lecture hall)

---

## Common Issues & Solutions

### Issue: Can't find sessionId
**Solution:** Check useParams or props. May be named `id`, `session_id`, or `sessionId`. Use:
```javascript
const { id: sessionId } = useParams();
```

### Issue: Import paths are wrong
**Solution:** Adjust relative paths based on file location:
- From `cinema/VideoWatch.jsx`: `../TikTokHeartAnimation`
- From `LectureHall/LectureHallPage.jsx`: `../../TikTokHeartAnimation`

### Issue: Animation not showing
**Solution:** 
1. Check parent div has `position: relative`
2. Check z-index of TikTokHeartAnimation (should be 9999)
3. Check state `showHeartAnimation` is being set to true

### Issue: Double-click interferes with video controls
**Solution:** Add event propagation stop:
```javascript
const handleDoubleClickLike = (e) => {
  e.stopPropagation(); // Prevents event from reaching video controls
  // ... rest of function
};
```

---

## Next Steps After Implementation

1. **Test in all three watch types**
2. **Verify WebSocket broadcasts work** (test with 2 users)
3. **Add taskbar integration** (optional - heart emoji button)
4. **Performance testing** (ensure no lag with animation)
5. **Mobile testing** (ensure double-tap works on touch devices)

---

## Priority
**HIGH** - Core feature for session engagement. Implement in this order:
1. VideoWatch.jsx (most common watch type)
2. CinemaScene3DDemo.jsx (3D cinema experience)
3. LectureHallPage.jsx (classroom mode)

---

## Status
- [x] TikTokHeartAnimation component created
- [x] Backend like API working
- [x] Lobby preview cards showing likes
- [ ] VideoWatch.jsx double-click like
- [ ] CinemaScene3DDemo.jsx double-click like
- [ ] LectureHallPage.jsx double-click like
