# 3D Cinema Experience

An immersive 3D cinema environment for WeWatch that transitions from a first-person theater view to full-screen video playback.

## Features

✅ **First-Person View**: Users start in their assigned seat with a realistic theater perspective
✅ **Auto-Zoom**: After 3 seconds of inactivity, camera smoothly zooms to the screen
✅ **Dynamic Lighting**: Screen illuminates the theater with realistic lighting
✅ **Smooth Transitions**: Lerp-based camera movement for cinematic feel
✅ **Interactive Seats**: Hover over seats to see them highlighted
✅ **Performance Optimized**: Built with procedural geometry for fast rendering

## Components

### `CinemaScene3D.jsx`
Main component that orchestrates the 3D cinema experience.

**Props:**
- `videoElement` - React element containing your video player
- `userSeats` - Array of user seat positions
- `authenticatedUserID` - Current user's ID to position camera
- `onZoomComplete` - Callback when zoom transition completes

### `CinemaTheater.jsx`
Creates the 3D theater environment with seats, walls, screen, and floor.

### `CinemaScene3DDemo.jsx`
Standalone demo component for testing the 3D cinema.

## Usage

### Basic Integration

```jsx
import { CinemaScene3D } from '@/components/cinema/3d-cinema';
import CinemaVideoPlayer from '@/components/CinemaVideoPlayer';

function WatchPage() {
  const [isZoomed, setIsZoomed] = useState(false);
  
  return (
    <CinemaScene3D
      videoElement={<CinemaVideoPlayer url={videoUrl} />}
      userSeats={userSeats}
      authenticatedUserID={currentUser.id}
      onZoomComplete={(zoomed) => setIsZoomed(zoomed)}
    />
  );
}
```

### Testing the Demo

```jsx
// In your router or test page
import CinemaScene3DDemo from '@/components/cinema/3d-cinema/CinemaScene3DDemo';

function TestPage() {
  return <CinemaScene3DDemo />;
}
```

## How It Works

1. **Initial Load**: User sees 3D theater from their seat position
2. **Exploration**: User can orbit/pan/zoom using mouse/touch (first 3 seconds)
3. **Inactivity Detection**: After 3 seconds without input, auto-zoom triggers
4. **Smooth Transition**: Camera lerps from seat view to screen view
5. **2D Overlay**: 3D fades out, video player appears in fullscreen

## Customization

### Change Seat Configuration
Edit `CinemaSeats` in `CinemaTheater.jsx`:
```jsx
const rows = 6; // Number of rows
const seatsPerRow = 8; // Seats per row
const seatSpacing = 2; // Distance between seats
```

### Adjust Lighting
Modify `DynamicLighting` in `CinemaScene3D.jsx`:
```jsx
<pointLight
  intensity={3} // Brightness
  distance={25} // Range
  color="#ffffff" // Light color
/>
```

### Change Inactivity Timer
In `CinemaScene3D.jsx`:
```jsx
if (inactivityTimer >= 3) // Change to any number of seconds
```

## Future Enhancements

- [ ] Load custom GLTF/GLB cinema models
- [ ] Video texture on 3D screen (before zoom)
- [ ] Multi-user avatars in seats
- [ ] Speaking indicators with animations
- [ ] Screen color sampling for dynamic lighting
- [ ] Sound spatialization
- [ ] VR support

## Performance Tips

1. **Procedural geometry** is used for speed - you can swap in high-quality models later
2. **Shadow rendering** can be disabled for better FPS:
   ```jsx
   <Canvas shadows={false}>
   ```
3. **Reduce seat count** if targeting mobile devices

## File Structure

```
3d-cinema/
├── CinemaScene3D.jsx       # Main component
├── CinemaTheater.jsx       # Theater geometry
├── CinemaScene3DDemo.jsx   # Test/demo component
├── index.js                # Exports
├── MODEL_SOURCES.md        # Where to find 3D models
└── README.md               # This file
```

## Next Steps

1. Test the demo component
2. Download a cinema model from Sketchfab (optional)
3. Integrate with your existing VideoWatch flow
4. Add video texture to 3D screen (advanced)
5. Connect user seat positions from your backend

## Troubleshooting

**3D scene is black:**
- Check lighting intensity
- Verify camera position isn't inside geometry

**Performance is slow:**
- Disable shadows
- Reduce number of seats
- Check GPU acceleration is enabled

**Camera doesn't move:**
- Ensure userSeatPosition is valid
- Check console for errors
- Verify Three.js loaded correctly
