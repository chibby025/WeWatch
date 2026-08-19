package utils

import (
	"bytes"
	"image"
	"image/color"
	"image/gif"
	"image/jpeg"
	"image/png"
	"testing"
)

// makeOpaqueJPEG returns real encoded JPEG bytes of a solid-color image at
// the given dimensions — a stand-in for an ordinary photo with no
// transparency.
func makeOpaqueJPEG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x % 256), G: uint8(y % 256), B: 128, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 95}); err != nil {
		t.Fatalf("failed to build test JPEG: %v", err)
	}
	return buf.Bytes()
}

// makeTransparentPNG returns real encoded PNG bytes with a genuinely
// transparent region (not just an all-opaque PNG) — the case
// CompressChatImage must route to the lossless PNG path, not JPEG.
func makeTransparentPNG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			if x < w/2 {
				img.Set(x, y, color.RGBA{R: 200, G: 50, B: 50, A: 255})
			} else {
				img.Set(x, y, color.RGBA{R: 0, G: 0, B: 0, A: 0}) // fully transparent half
			}
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("failed to build test PNG: %v", err)
	}
	return buf.Bytes()
}

func TestCompressChatImage_OpaqueLargeJPEGGetsResizedAndReencoded(t *testing.T) {
	raw := makeOpaqueJPEG(t, 2000, 1000) // wider than chatMaxDim (1600)
	out, ct, changed := CompressChatImage(raw, "image/jpeg")
	if !changed {
		t.Fatal("expected changed=true for an oversized opaque JPEG")
	}
	if ct != "image/jpeg" {
		t.Fatalf("expected content-type image/jpeg, got %s", ct)
	}
	img, _, err := image.Decode(bytes.NewReader(out))
	if err != nil {
		t.Fatalf("output did not decode as a valid image: %v", err)
	}
	b := img.Bounds()
	if b.Dx() != chatMaxDim {
		t.Fatalf("expected resized width %d, got %d", chatMaxDim, b.Dx())
	}
	if b.Dx() > 2000 || b.Dy() > 1000 {
		t.Fatalf("output is not smaller than the original (%dx%d)", b.Dx(), b.Dy())
	}
}

func TestCompressChatImage_TransparentPNGStaysPNGWithAlphaPreserved(t *testing.T) {
	raw := makeTransparentPNG(t, 800, 400)
	out, ct, changed := CompressChatImage(raw, "image/png")
	if !changed {
		t.Fatal("expected changed=true for a PNG that gets processed")
	}
	if ct != "image/png" {
		t.Fatalf("expected content-type image/png (transparency must not be converted to JPEG), got %s", ct)
	}
	img, _, err := image.Decode(bytes.NewReader(out))
	if err != nil {
		t.Fatalf("output did not decode: %v", err)
	}
	if !hasTransparency(img) {
		t.Fatal("expected the output to still have real transparent pixels — alpha was lost")
	}
}

func TestCompressChatImage_OpaquePNGConvertsToJPEG(t *testing.T) {
	// A PNG with zero actual transparency should NOT be forced onto the
	// lossless (larger) PNG path just because of its container format —
	// hasTransparency is a real per-pixel scan, not a format guess.
	img := image.NewRGBA(image.Rect(0, 0, 100, 100))
	for y := 0; y < 100; y++ {
		for x := 0; x < 100; x++ {
			img.Set(x, y, color.RGBA{R: 10, G: 20, B: 30, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("failed to build test PNG: %v", err)
	}
	_, ct, changed := CompressChatImage(buf.Bytes(), "image/png")
	if !changed {
		t.Fatal("expected changed=true")
	}
	if ct != "image/jpeg" {
		t.Fatalf("expected an opaque PNG to convert to JPEG, got %s", ct)
	}
}

func TestCompressChatImage_GIFPassesThroughUnchanged(t *testing.T) {
	img := image.NewPaletted(image.Rect(0, 0, 10, 10), []color.Color{color.RGBA{255, 0, 0, 255}, color.RGBA{0, 255, 0, 255}})
	var buf bytes.Buffer
	if err := gif.Encode(&buf, img, nil); err != nil {
		t.Fatalf("failed to build test GIF: %v", err)
	}
	raw := buf.Bytes()
	out, ct, changed := CompressChatImage(raw, "image/gif")
	if changed {
		t.Fatal("expected changed=false for a GIF — must never be re-encoded (would destroy animation)")
	}
	if ct != "image/gif" {
		t.Fatalf("expected content-type to stay image/gif, got %s", ct)
	}
	if !bytes.Equal(raw, out) {
		t.Fatal("expected GIF bytes to be returned byte-for-byte unchanged")
	}
}

func TestCompressChatImage_WebPPassesThroughUnchanged(t *testing.T) {
	// Not a real WebP file (this package can't decode WebP at all), but that's
	// exactly the point — CompressChatImage must recognize the content-type
	// and skip decoding entirely, never attempting (and failing) to process it.
	raw := []byte("not a real image, just checking the content-type short-circuit")
	out, ct, changed := CompressChatImage(raw, "image/webp")
	if changed {
		t.Fatal("expected changed=false for image/webp")
	}
	if ct != "image/webp" {
		t.Fatalf("expected content-type to stay image/webp, got %s", ct)
	}
	if !bytes.Equal(raw, out) {
		t.Fatal("expected WebP bytes to be returned byte-for-byte unchanged")
	}
}

func TestCompressChatImage_DecodeFailureReturnsOriginalUnchanged(t *testing.T) {
	raw := []byte("this is not a valid image at all")
	out, ct, changed := CompressChatImage(raw, "image/jpeg")
	if changed {
		t.Fatal("expected changed=false on decode failure")
	}
	if ct != "image/jpeg" {
		t.Fatalf("expected the ORIGINAL content-type to be preserved on decode failure, got %s", ct)
	}
	if !bytes.Equal(raw, out) {
		t.Fatal("expected original bytes back unchanged on decode failure")
	}
}

func TestCompressChatImage_SmallImageIsNotUpscaled(t *testing.T) {
	raw := makeOpaqueJPEG(t, 200, 100) // well under chatMaxDim
	out, _, _ := CompressChatImage(raw, "image/jpeg")
	img, _, err := image.Decode(bytes.NewReader(out))
	if err != nil {
		t.Fatalf("output did not decode: %v", err)
	}
	b := img.Bounds()
	if b.Dx() != 200 || b.Dy() != 100 {
		t.Fatalf("expected dimensions unchanged at 200x100, got %dx%d", b.Dx(), b.Dy())
	}
}

func TestHasTransparency(t *testing.T) {
	opaque := image.NewRGBA(image.Rect(0, 0, 5, 5))
	for y := 0; y < 5; y++ {
		for x := 0; x < 5; x++ {
			opaque.Set(x, y, color.RGBA{R: 1, G: 2, B: 3, A: 255})
		}
	}
	if hasTransparency(opaque) {
		t.Fatal("expected no transparency in a fully-opaque image")
	}

	withHole := image.NewRGBA(image.Rect(0, 0, 5, 5))
	for y := 0; y < 5; y++ {
		for x := 0; x < 5; x++ {
			withHole.Set(x, y, color.RGBA{R: 1, G: 2, B: 3, A: 255})
		}
	}
	withHole.Set(2, 2, color.RGBA{0, 0, 0, 0}) // a single transparent pixel
	if !hasTransparency(withHole) {
		t.Fatal("expected transparency to be detected from a single non-opaque pixel")
	}
}

func TestDownscaleBilinear_PreservesAspectRatioAndCapsLongestSide(t *testing.T) {
	src := image.NewRGBA(image.Rect(0, 0, 3200, 1600)) // 2:1
	out := downscaleBilinear(src, 1600)
	b := out.Bounds()
	if b.Dx() != 1600 || b.Dy() != 800 {
		t.Fatalf("expected 1600x800 (aspect preserved), got %dx%d", b.Dx(), b.Dy())
	}
}

func TestDownscaleBilinear_NoOpWhenAlreadyWithinBounds(t *testing.T) {
	src := image.NewRGBA(image.Rect(0, 0, 500, 300))
	out := downscaleBilinear(src, 1600)
	if out.Bounds() != src.Bounds() {
		t.Fatal("expected the exact same image returned unchanged when already within maxDim")
	}
}
