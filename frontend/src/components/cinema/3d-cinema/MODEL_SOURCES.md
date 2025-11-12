# 3D Cinema Model Sources

## Recommended Free Cinema/Theater Models

### Option 1: Sketchfab (Best Quality)
Visit: https://sketchfab.com/

**Search Terms:**
- "cinema theater free"
- "movie theater glb"
- "cinema hall"

**Filters to Apply:**
- ✅ Downloadable
- ✅ Format: GLTF/GLB
- ✅ License: CC BY or CC0

**Recommended Models:**
1. Search for "low poly cinema" - easier to render, better performance
2. Look for models with <100k polygons for good performance

### Option 2: Poly Pizza
Visit: https://poly.pizza/

**Search:** "cinema" or "theater"
- All models are free and low-poly
- Download as GLB format

### Option 3: Three.js Examples
- Clone: https://github.com/mrdoob/three.js/tree/dev/examples/models
- Some theater/room examples included

### Option 4: Build Your Own (Simplest)
We can create a procedural cinema using Three.js primitives:
- Seats: Box geometries arranged in rows
- Screen: Large plane geometry
- Walls: Box geometries
- Floor: Plane geometry

## Instructions After Download

1. Download the GLB/GLTF file
2. Place it in: `frontend/public/models/cinema.glb`
3. The component will automatically load it

## Current Choice

We'll start with a **procedural cinema** (Option 4) so you can start testing immediately.
Once you find a model you like, we'll swap it in!
