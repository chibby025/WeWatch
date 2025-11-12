# Enhanced Dynamic Lighting System

## ✨ What's New

### Light Toggle Button
A new button in the top-right corner lets you switch between:
- **Lights Off** (Dark Cinema Mode) - Original atmospheric lighting
- **Lights On** (Bright Mode) - Fully illuminated theater

### New Light Sources Added

#### 🔆 Ceiling Lights (3 lights)
- Position: Along the ceiling in a row
- Color: Warm peach (#ffe5b4)
- Intensity: 0.1 (dark) → 1.5 (bright)
- Creates general room illumination

#### 💡 Wall Sconces (6 lights)
- Position: 3 on left wall, 3 on right wall
- Color: Warm amber (#ffd4a3)
- Intensity: 0.05 (dark) → 0.8 (bright)
- Adds atmospheric side lighting

#### 🔴 Floor Aisle Lights (2 spotlights)
- Position: Along the aisle between seats
- Color: Warm red (#ff6b35)
- Intensity: 0.05 (dark) → 0.3 (bright)
- Guides viewers like real cinema aisles

#### 💫 Screen Light (existing, enhanced)
- Still pulses for immersion
- Illuminates seats from screen
- Always active

### Smooth Transitions

All lights smoothly transition between states using lerp:
```javascript
light.intensity += (targetIntensity - light.intensity) * 0.05
```

This creates a cinematic fade effect when toggling.

## Visual Layout

```
                     [SCREEN]
                  🔆 screen light
                        ↓
    💡          💡                    💡
  (wall)      (wall)               (wall)
    │           │                    │
    │           │                    │
    ├─────────────────────────────────┤
    │                                 │
    │   🔆                            │
    │  (ceiling)                      │
    │                                 │
    │   ◯ ◯ ◯ ◯ ◯ ◯ ◯ ◯              │
    │        🔴 aisle                 │
💡  │   ◯ ◯ ◯ ◯ ◯ ◯ ◯ ◯              │  💡
    │                                 │
    │   🔆                            │
    │  (ceiling)                      │
    │                                 │
    │   ◯ ◯ ◯ ◯ ◯ ◯ ◯ ◯              │
    │        🔴 aisle                 │
💡  │   ◯ ◯ ◯ ◯ ◯ ◯ ◯ ◯              │  💡
    │                                 │
    │   🔆                            │
    │  (ceiling)                      │
    │                                 │
    │   ◯ ◯ ◯ ◯ ◯ ◯ ◯ ◯              │
💡  │                                 │  💡
    └─────────────────────────────────┘

Legend:
🔆 = Ceiling/Screen Light
💡 = Wall Sconce
🔴 = Floor Aisle Light
◯ = Seat
```

## Usage

### In Your Component
```jsx
<CinemaScene3D
  videoElement={<YourPlayer />}
  userSeats={seats}
  authenticatedUserID={userId}
/>
```

The light toggle button appears automatically!

### Programmatic Control
You can also control lights programmatically:

```jsx
function MyCustomCinema() {
  const [lightsOn, setLightsOn] = useState(false);
  
  // Auto-turn lights on when video pauses
  useEffect(() => {
    if (videoPaused) {
      setLightsOn(true);
    }
  }, [videoPaused]);
  
  return (
    <CinemaScene3D 
      {...props}
      initialLightsState={lightsOn}
    />
  );
}
```

## Color Palette

All lights use warm cinema colors:

| Light Type | Color | Hex | Purpose |
|------------|-------|-----|---------|
| Ceiling | Warm Peach | #ffe5b4 | General illumination |
| Wall Sconce | Warm Amber | #ffd4a3 | Atmospheric glow |
| Aisle | Warm Red | #ff6b35 | Path guidance |
| Ambient | White | #ffffff | Base visibility |

## Performance Impact

✅ **Minimal** - Lights use simple point/spot lights
- No heavy shadow calculations (only screen light casts shadows)
- Smooth lerp transitions (no sudden changes)
- Optimized update loop

## Testing

Visit `/cinema-3d-demo` and:
1. Click the **"Lights Off"** button (top-right)
2. Watch the theater smoothly brighten
3. Click **"Lights On"** to return to dark mode
4. Notice the smooth transitions

## Customization

### Change Light Colors
```jsx
// In DynamicLighting component
<pointLight color="#ffe5b4" /> // Change to any color
```

### Adjust Brightness
```jsx
// Lights On intensity
const targetIntensity = lightsOn ? 1.5 : 0.1;
//                                 ↑     ↑
//                              bright  dark
```

### Add More Lights
```jsx
<pointLight 
  ref={el => ceilingLightsRef.current[3] = el}
  position={[x, y, z]} 
  intensity={lightsOn ? 1.5 : 0.1}
  color="#yourColor"
/>
```

## Next: Share Your Image!

Now that we have enhanced lighting, **please share your reference image** so I can:
- Match the color scheme
- Adjust seat arrangement
- Add decorative elements (curtains, etc.)
- Fine-tune the overall aesthetic

Just paste the image and I'll update the 3D cinema to match! 🎬
