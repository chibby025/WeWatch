# 3D Cinema - Quick Start Guide

## ✅ What's Been Set Up

All the 3D cinema components are ready to go! Here's what was created:

### 📁 File Structure
```
frontend/src/components/cinema/3d-cinema/
├── CinemaScene3D.jsx          # Main 3D cinema component
├── CinemaTheater.jsx          # 3D theater environment
├── CinemaScene3DDemo.jsx      # Test/demo page
├── index.js                   # Exports
├── README.md                  # Full documentation
└── MODEL_SOURCES.md           # Where to find 3D models
```

### 📦 Dependencies Installed
- ✅ `@react-three/fiber` - React renderer for Three.js
- ✅ `@react-three/drei` - Helpers and abstractions
- ✅ `@react-three/postprocessing` - Visual effects
- ✅ `three` - 3D library (already had it)

### 🎯 Features Implemented
- ✅ First-person view from user's seat
- ✅ Auto-zoom after 3 seconds of inactivity
- ✅ Smooth camera transitions (lerp-based)
- ✅ Dynamic lighting from screen
- ✅ Interactive seats (hover effects)
- ✅ Fade transition to 2D video player
- ✅ Procedural 3D cinema (no model needed!)

## 🚀 How to Test It

### Option 1: Visit the Demo Page

1. **Start your dev server:**
   ```bash
   cd frontend
   npm run dev
   ```

2. **Navigate to the demo:**
   ```
   http://localhost:5173/cinema-3d-demo
   ```

3. **Experience the cinema:**
   - You'll start in a 3D cinema theater
   - Look around (drag to rotate camera)
   - Wait 3 seconds without moving
   - Camera auto-zooms to the screen
   - 3D fades out, 2D video view appears

### Option 2: Integrate Into Your App

```jsx
import { CinemaScene3D } from '@/components/cinema/3d-cinema';
import CinemaVideoPlayer from '@/components/CinemaVideoPlayer';

function YourWatchPage() {
  return (
    <CinemaScene3D
      videoElement={<CinemaVideoPlayer url={videoUrl} />}
      userSeats={userSeats}
      authenticatedUserID={currentUserId}
      onZoomComplete={(zoomed) => console.log('Zoomed:', zoomed)}
    />
  );
}
```

## 🎨 Customization Options

### Change Cinema Colors
Edit `CinemaTheater.jsx`:
```jsx
// Walls
<meshStandardMaterial color="#0a0505" /> // Change to any color

// Seats
<meshStandardMaterial color="#4a0000" /> // Red velvet seats
```

### Adjust Seat Layout
In `CinemaSeats` function:
```jsx
const rows = 6;           // Number of rows
const seatsPerRow = 8;    // Seats per row
const seatSpacing = 2;    // Gap between seats
```

### Change Zoom Timing
In `CinemaScene3D.jsx`:
```jsx
if (inactivityTimer >= 3) // Change to 5 for 5 seconds, etc.
```

### Modify Lighting
```jsx
<pointLight
  intensity={3}        // Brightness (0-10)
  distance={25}        // How far light reaches
  color="#ffffff"      // Light color
/>
```

## 🔧 Advanced Features

### Add Video Texture to 3D Screen (Before Zoom)

To show the actual video on the 3D cinema screen:

```jsx
// In CinemaTheater.jsx
const videoTexture = new THREE.VideoTexture(videoElement);

<mesh position={[0, 4, -17.8]} name="cinema-screen">
  <planeGeometry args={[16, 9]} />
  <meshBasicMaterial map={videoTexture} />
</mesh>
```

### Screen Color-Based Lighting

Sample video colors to change light dynamically:

```jsx
// In DynamicLighting component
useFrame(() => {
  // Sample video element pixel data
  const dominantColor = extractDominantColor(videoElement);
  lightRef.current.color.set(dominantColor);
});
```

### Load Custom 3D Models

1. Download a cinema model from Sketchfab (see MODEL_SOURCES.md)
2. Place in `public/models/cinema.glb`
3. Use in component:

```jsx
import { useGLTF } from '@react-three/drei';

function CinemaTheater() {
  const { scene } = useGLTF('/models/cinema.glb');
  return <primitive object={scene} />;
}
```

## 🎮 Controls

### Mouse/Desktop
- **Left Click + Drag**: Rotate camera
- **Right Click + Drag**: Pan camera
- **Scroll Wheel**: Zoom in/out

### Touch/Mobile
- **One Finger Drag**: Rotate camera
- **Two Finger Pinch**: Zoom
- **Two Finger Drag**: Pan

### Auto-Zoom
- **No Input for 3 seconds**: Automatically zooms to screen

## 🐛 Troubleshooting

### Black Screen
- Check browser console for errors
- Verify Three.js is loaded: `console.log(THREE)`
- Ensure lighting is present

### Performance Issues
- Disable shadows: `<Canvas shadows={false}>`
- Reduce seat count
- Lower screen resolution

### Camera Not Moving
- Check `userSeatPosition` is valid
- Verify lerp is working (add console.logs)
- Ensure `isZoomed` state updates

### No Auto-Zoom
- Check inactivity timer in console
- Verify event listeners are attached
- Try moving mouse to reset, then wait 3 seconds

## 📝 Next Steps

### Phase 1: Testing (Now)
- [x] Test the demo page
- [ ] Adjust colors/lighting to your taste
- [ ] Test on mobile devices
- [ ] Verify performance is acceptable

### Phase 2: Integration
- [ ] Connect to real user seat data from backend
- [ ] Integrate with your VideoWatch component
- [ ] Add user avatars in seats
- [ ] Show speaking indicators

### Phase 3: Enhancement
- [ ] Download premium 3D cinema model
- [ ] Add video texture to 3D screen
- [ ] Implement color-based lighting
- [ ] Add sound spatialization
- [ ] Multi-user synchronized experience

## 📚 Resources

- **Three.js Docs**: https://threejs.org/docs/
- **React Three Fiber**: https://docs.pmnd.rs/react-three-fiber
- **Drei Helpers**: https://github.com/pmndrs/drei
- **Sketchfab**: https://sketchfab.com/search?q=cinema&type=models
- **Poly Pizza**: https://poly.pizza/

## 💡 Tips

1. **Start simple**: Use the procedural cinema first, add models later
2. **Performance first**: Test on target devices early
3. **Iterate lighting**: Small changes make big differences
4. **User feedback**: The auto-zoom timing might need adjustment
5. **Mobile testing**: Touch controls behave differently

## 🎉 You're Ready!

Everything is set up and ready to test. Visit `/cinema-3d-demo` to see it in action!

Questions? Check the full README.md in the 3d-cinema folder.
