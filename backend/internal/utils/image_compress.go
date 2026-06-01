package utils

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	_ "image/gif"
	_ "image/png"
)

const (
	statusMaxDim     = 1080   // px — longest side cap
	statusMaxBytes   = 450000 // 450 KB target output
	statusJPEGQuality = 80
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
