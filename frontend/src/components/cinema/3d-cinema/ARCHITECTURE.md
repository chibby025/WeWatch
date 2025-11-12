# 3D Cinema Architecture Overview

## Component Hierarchy

```
CinemaScene3D (Main Container)
│
├── Canvas (React Three Fiber)
│   │
│   ├── CinemaCamera
│   │   ├── PerspectiveCamera (seat view)
│   │   ├── OrbitControls (user exploration)
│   │   └── Auto-zoom logic
│   │
│   ├── DynamicLighting
│   │   ├── PointLight (screen light)
│   │   ├── AmbientLight (base visibility)
│   │   └── Pulsing effect
│   │
│   ├── CinemaTheater
│   │   ├── Floor
│   │   ├── Walls (back, left, right)
│   │   ├── Ceiling
│   │   ├── Screen + Frame
│   │   └── CinemaSeats
│   │       └── Seat × 48
│   │           ├── Base
│   │           ├── Back
│   │           └── Armrests
│   │
│   └── Fog (atmosphere)
│
└── 2D Overlay (appears after zoom)
    └── Your Video Player
```

## Data Flow

```
User Action
    ↓
Inactivity Timer (3s)
    ↓
isZoomed State Changes
    ↓
Camera Position Lerps
    ↓
Zoom Animation Complete
    ↓
showOverlay State Changes
    ↓
3D Fades Out / 2D Fades In
    ↓
onZoomComplete Callback
```

## State Management

```javascript
CinemaScene3D States:
├── isZoomed (boolean)
│   └── Controls camera position target
│
└── showOverlay (boolean)
    └── Controls 2D video player visibility

CinemaCamera States:
├── inactivityTimer (number)
│   └── Counts seconds without user input
│
└── User interaction events
    └── Resets inactivity timer
```

## File Dependencies

```
CinemaScene3D.jsx
├── imports React, useState, useEffect, useRef
├── imports Canvas, useFrame, useThree (@react-three/fiber)
├── imports PerspectiveCamera, OrbitControls (@react-three/drei)
├── imports THREE (three)
└── imports CinemaTheater (local)

CinemaTheater.jsx
├── imports React, useRef
├── imports useFrame (@react-three/fiber)
└── imports THREE (three)

CinemaScene3DDemo.jsx
├── imports React, useState
└── imports CinemaScene3D (local)
```

## Props Interface

```typescript
CinemaScene3D Props:
{
  videoElement: ReactElement      // Your video player component
  userSeats: Array<{             // User seat positions
    userID: number,
    username: string,
    position: { x: number, z: number }
  }>
  authenticatedUserID: number     // Current user ID
  onZoomComplete?: (zoomed: boolean) => void  // Callback
}
```

## Coordinate System

```
3D Space Layout (Top View):
                  ┌─────────────────┐
                  │   SCREEN        │  z = -18
                  │   (16 × 9)      │
                  └─────────────────┘
                         ↑
                         │ (0, 4, -18)
                         │
                    
    ┌──────────────────────────────┐
    │   Row 6    ◯ ◯ ◯ ◯ ◯ ◯ ◯ ◯   │  z = 14.5
    │   Row 5    ◯ ◯ ◯ ◯ ◯ ◯ ◯ ◯   │  z = 12
    │   Row 4    ◯ ◯ ◯ ◯ ◯ ◯ ◯ ◯   │  z = 9.5
    │   Row 3    ◯ ◯ ◯ ◯ ◯ ◯ ◯ ◯   │  z = 7
    │   Row 2    ◯ ◯ ◯ ◯ ◯ ◯ ◯ ◯   │  z = 4.5
    │   Row 1    ◯ ◯ ◯ ◯ ◯ ◯ ◯ ◯   │  z = 2
    └──────────────────────────────┘
    
    x = -7 to +7 (seats spread across)
    y = 0 (floor) to 10 (ceiling)
```

## Camera Positions

```
Initial (Seat View):
  position: (userSeatX, 1.5, userSeatZ)
  lookAt: (0, 4, -18) → screen
  FOV: 75°

Zoomed (Close-up):
  position: (0, 4, -10)
  lookAt: (0, 4, -18) → screen
  FOV: 75°

Transition:
  method: Vector3.lerp()
  speed: delta * 2
  duration: ~1-2 seconds
```

## Lighting Setup

```
Lighting Hierarchy:
├── PointLight (Screen)
│   ├── position: (0, 4, -17)
│   ├── intensity: 3 + pulse
│   ├── distance: 25
│   └── castShadow: true
│
├── AmbientLight (Base)
│   └── intensity: 0.05
│
└── PointLight (Ceiling)
    ├── position: (0, 9, 0)
    ├── intensity: 0.1
    └── color: #ffddaa
```

## Performance Optimization

```
Optimizations Applied:
├── Procedural Geometry
│   └── No heavy model loading
│
├── Instanced Seats
│   └── Reuses geometry
│
├── Shadow Optimization
│   └── Only screen light casts shadows
│
├── Fog
│   └── Hides distant geometry
│
└── Power Preference
    └── 'high-performance' WebGL
```

## Event Timeline

```
t=0s    User enters cinema
        ├── 3D scene renders
        ├── Camera at seat position
        └── OrbitControls active

t=0-3s  User can explore
        ├── Drag to rotate
        ├── Scroll to zoom
        └── Any input resets timer

t=3s    Auto-zoom triggers
        ├── isZoomed = true
        ├── OrbitControls disabled
        └── Camera lerps to screen

t=4-5s  Zoom completes
        ├── Camera reaches target
        └── showOverlay = true

t=5.5s  2D overlay appears
        ├── 3D fades to opacity 0
        ├── Video player visible
        └── onZoomComplete() called
```

## Integration Points

```
Your App → CinemaScene3D
    ↓
Props:
├── videoElement: <YourVideoPlayer />
├── userSeats: from WebSocket/API
├── authenticatedUserID: from auth state
└── onZoomComplete: callback handler

CinemaScene3D → Your VideoPlayer
    ↓
Renders inside 2D overlay
    ↓
Full control of playback
```

## Technology Stack

```
React Three Fiber
├── Declarative Three.js in React
├── Hooks: useFrame, useThree
└── Component-based 3D

Three.js
├── 3D rendering engine
├── Geometries, Materials, Lights
└── Camera controls

@react-three/drei
├── Helper components
├── PerspectiveCamera
└── OrbitControls

Your Existing Stack
├── React 19
├── Vite
└── Tailwind CSS
```

## Browser Requirements

```
Minimum:
├── WebGL support
├── ES6+ JavaScript
└── Modern browser (2020+)

Optimal:
├── WebGL 2
├── GPU acceleration
└── 60+ FPS capability
```

---

This architecture is designed to be:
- ✅ Modular (easy to swap components)
- ✅ Performant (optimized rendering)
- ✅ Extensible (add features easily)
- ✅ Maintainable (clear structure)
