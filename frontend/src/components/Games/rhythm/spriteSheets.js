// Pure constants — split out of InstrumentCloseup.jsx because a file mixing
// component exports with plain value exports breaks Fast Refresh
// (react-refresh/only-export-components).

const SPRITE_BASE = 'https://letswatchout.b-cdn.net/games/rhythm';

// Top-of-highway overlay sprite sheet — one per instrument, all 4 real,
// user-supplied GIFs decoded once into horizontal PNG strips (never a live
// <img src="x.gif">, which gives JS zero playback-rate control — see
// SpriteFramePlayer). Guitar/bass share the exact same sheet (only the
// accentColor prop passed into InstrumentTopOverlay differs between them);
// drums/vocals each have their own sheet.
//
// Both drums/vocals sheets were converted the same way: parsed with
// gifuct-js (every frame in both source GIFs was already full-canvas-sized,
// so no disposal-method compositing was needed — each frame's own decoded
// patch IS the complete image), downscaled to ~240px tall (matching the
// existing guitar sheets' rough scale — plenty for how small this ever
// renders on screen), composited into one horizontal strip, encoded via
// pngjs, uploaded to BunnyCDN.
export const INSTRUMENT_TOP_SHEETS = {
  guitar: { url: `${SPRITE_BASE}/guitar-top-v1.png`, frameCount: 8, frameWidth: 197, frameHeight: 220 },
  bass: { url: `${SPRITE_BASE}/guitar-top-v1.png`, frameCount: 8, frameWidth: 197, frameHeight: 220 },
  drums: { url: `${SPRITE_BASE}/drums-v1.png`, frameCount: 16, frameWidth: 240, frameHeight: 240 },
  vocals: { url: `${SPRITE_BASE}/mic-v1.png`, frameCount: 8, frameWidth: 239, frameHeight: 240 },
};

// Fretting-hand close-up bottom overlay — guitar/bass only. Drums/vocals
// have no equivalent second "close-up" shot, so they're simply absent from
// this map; callers must guard with INSTRUMENT_BOTTOM_SHEETS[id] &&.
export const INSTRUMENT_BOTTOM_SHEETS = {
  guitar: { url: `${SPRITE_BASE}/guitar-bottom-v1.png`, frameCount: 16, frameWidth: 220, frameHeight: 220 },
  bass: { url: `${SPRITE_BASE}/guitar-bottom-v1.png`, frameCount: 16, frameWidth: 220, frameHeight: 220 },
};
