package utils

import (
	"bytes"
	"image"
	"image/color"
	_ "image/gif"
	"image/jpeg"
	"image/png"
	_ "image/png"
)

const (
	statusMaxDim      = 1080   // px — longest side cap
	statusMaxBytes    = 450000 // 450 KB target output
	statusJPEGQuality = 80

	// Chat attachments (room chat, lobby DMs) are persistent — people may
	// reopen, zoom into, or view them full-screen far longer than a 24h
	// status — so these are deliberately more conservative than Status's own
	// settings above: a bigger dimension ceiling and a higher JPEG quality,
	// trading some of the size reduction for materially less visible loss.
	chatMaxDim      = 1600 // px — longest side cap
	chatJPEGQuality = 88
)

// CompressStatusImage decodes any common image format, resizes if wider/taller
// than statusMaxDim, and re-encodes as JPEG at quality 80.
// Returns the compressed bytes and the new content-type ("image/jpeg").
// On any decode error it returns the original bytes unchanged so the upload
// can still proceed.
func CompressStatusImage(data []byte) ([]byte, string) {
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return data, "image/jpeg"
	}

	img = downscaleIfNeeded(img, statusMaxDim)

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: statusJPEGQuality}); err != nil {
		return data, "image/jpeg"
	}
	return buf.Bytes(), "image/jpeg"
}

// CompressChatImage is CompressStatusImage's sibling for persistent chat
// attachments (room chat, lobby DMs) — same idea, deliberately gentler
// settings (see chatMaxDim/chatJPEGQuality above) since this content isn't
// ephemeral. Two things it does differently from CompressStatusImage,
// both to avoid a WORSE kind of quality loss than a JPEG quality drop:
//
//  1. GIF and WebP are left completely untouched (checked by content-type
//     up front, never even decoded) — GIF because re-encoding as a static
//     JPEG would destroy the animation entirely, and WebP because it's
//     already a modern, well-compressed format this codebase's stdlib
//     image pipeline can't even decode (no encoder dependency needed for a
//     format we're intentionally passing through unchanged).
//  2. Images with real alpha transparency (checked via a real per-pixel
//     scan, not guessed from the source format) are resized but kept as
//     PNG rather than converted to JPEG — JPEG has no alpha channel at
//     all, so converting a transparent screenshot/sticker would silently
//     flatten it onto a solid background, a far more visible and jarring
//     regression than a modest JPEG quality reduction.
//
// Returns the possibly-recompressed bytes, the resulting content-type, and
// whether it actually changed anything (false for GIF/WebP passthrough or
// any decode failure — the original bytes/content-type should be used
// as-is in that case, not relabeled).
func CompressChatImage(data []byte, contentType string) ([]byte, string, bool) {
	if contentType == "image/gif" || contentType == "image/webp" {
		return data, contentType, false
	}

	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return data, contentType, false
	}

	img = downscaleBilinear(img, chatMaxDim)

	if hasTransparency(img) {
		var buf bytes.Buffer
		if err := png.Encode(&buf, img); err != nil {
			return data, contentType, false
		}
		return buf.Bytes(), "image/png", true
	}

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: chatJPEGQuality}); err != nil {
		return data, contentType, false
	}
	return buf.Bytes(), "image/jpeg", true
}

// hasTransparency does a real per-pixel scan for any alpha value below
// fully opaque — not guessed from the source container format, since a PNG
// can easily have zero transparent pixels (a photo someone happened to save
// as PNG) and shouldn't be routed to the lossless PNG path just because of
// its extension.
func hasTransparency(img image.Image) bool {
	b := img.Bounds()
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			_, _, _, a := img.At(x, y).RGBA()
			if a < 0xffff {
				return true
			}
		}
	}
	return false
}

// downscaleBilinear is downscaleIfNeeded's higher-quality sibling — bilinear
// interpolation (blends the 4 nearest source pixels per output pixel)
// instead of nearest-neighbour, meaningfully reducing the jagged/aliased
// edges nearest-neighbour introduces on a downscale. Kept as a separate
// function rather than changing downscaleIfNeeded itself, so Status's
// already-shipped output is never affected by this — only new chat-image
// compression uses this path. Still zero new dependencies, just more
// arithmetic per pixel.
func downscaleBilinear(src image.Image, maxDim int) image.Image {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	if w <= maxDim && h <= maxDim {
		return src
	}

	var newW, newH int
	if w >= h {
		newW = maxDim
		newH = int(float64(h) * float64(maxDim) / float64(w))
	} else {
		newH = maxDim
		newW = int(float64(w) * float64(maxDim) / float64(h))
	}
	if newW < 1 {
		newW = 1
	}
	if newH < 1 {
		newH = 1
	}

	dst := image.NewRGBA(image.Rect(0, 0, newW, newH))
	xScale := float64(w) / float64(newW)
	yScale := float64(h) / float64(newH)

	sample := func(sx, sy int) (float64, float64, float64, float64) {
		if sx < 0 {
			sx = 0
		} else if sx >= w {
			sx = w - 1
		}
		if sy < 0 {
			sy = 0
		} else if sy >= h {
			sy = h - 1
		}
		r, g, bl, a := src.At(b.Min.X+sx, b.Min.Y+sy).RGBA()
		return float64(r), float64(g), float64(bl), float64(a)
	}

	for y := 0; y < newH; y++ {
		srcYf := (float64(y)+0.5)*yScale - 0.5
		y0 := int(srcYf)
		fy := srcYf - float64(y0)
		if srcYf < 0 {
			y0 = 0
			fy = 0
		}
		for x := 0; x < newW; x++ {
			srcXf := (float64(x)+0.5)*xScale - 0.5
			x0 := int(srcXf)
			fx := srcXf - float64(x0)
			if srcXf < 0 {
				x0 = 0
				fx = 0
			}

			r00, g00, b00, a00 := sample(x0, y0)
			r10, g10, b10, a10 := sample(x0+1, y0)
			r01, g01, b01, a01 := sample(x0, y0+1)
			r11, g11, b11, a11 := sample(x0+1, y0+1)

			lerp := func(v00, v10, v01, v11 float64) float64 {
				top := v00 + (v10-v00)*fx
				bottom := v01 + (v11-v01)*fx
				return top + (bottom-top)*fy
			}

			dst.SetRGBA(x, y, color.RGBA{
				R: uint8(uint32(lerp(r00, r10, r01, r11)) >> 8),
				G: uint8(uint32(lerp(g00, g10, g01, g11)) >> 8),
				B: uint8(uint32(lerp(b00, b10, b01, b11)) >> 8),
				A: uint8(uint32(lerp(a00, a10, a01, a11)) >> 8),
			})
		}
	}
	return dst
}

// downscaleIfNeeded returns a new RGBA image scaled so that neither dimension
// exceeds maxDim. Uses nearest-neighbour — fast, zero extra dependencies,
// acceptable quality for story-sized images.
func downscaleIfNeeded(src image.Image, maxDim int) image.Image {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	if w <= maxDim && h <= maxDim {
		return src
	}

	var newW, newH int
	if w >= h {
		newW = maxDim
		newH = int(float64(h) * float64(maxDim) / float64(w))
	} else {
		newH = maxDim
		newW = int(float64(w) * float64(maxDim) / float64(h))
	}
	if newW < 1 {
		newW = 1
	}
	if newH < 1 {
		newH = 1
	}

	dst := image.NewRGBA(image.Rect(0, 0, newW, newH))
	xScale := float64(w) / float64(newW)
	yScale := float64(h) / float64(newH)

	for y := 0; y < newH; y++ {
		srcY := int(float64(y)*yScale) + b.Min.Y
		for x := 0; x < newW; x++ {
			srcX := int(float64(x)*xScale) + b.Min.X
			r, g, bl, a := src.At(srcX, srcY).RGBA()
			dst.SetRGBA(x, y, color.RGBA{
				R: uint8(r >> 8),
				G: uint8(g >> 8),
				B: uint8(bl >> 8),
				A: uint8(a >> 8),
			})
		}
	}
	return dst
}
