package utils

import (
	"fmt"
	"io"

	"github.com/dhowden/tag"
)

// AudioMetadata holds ID3/FLAC/MP4 tag data extracted from an audio file.
type AudioMetadata struct {
	Title       string
	Artist      string
	Album       string
	ArtworkData []byte
	ArtworkMIME string
}

// ExtractAudioMetadata reads tags from r (mp3/m4a/flac/ogg) and returns metadata.
// Always seeks r back to the start so the caller can still read/upload the file.
func ExtractAudioMetadata(r io.ReadSeeker) (*AudioMetadata, error) {
	m, err := tag.ReadFrom(r)
	// Seek back to 0 regardless of error so the caller can still upload the file.
	if _, seekErr := r.Seek(0, io.SeekStart); seekErr != nil && err == nil {
		return nil, fmt.Errorf("seek reset: %w", seekErr)
	}
	if err != nil {
		return nil, err
	}
	meta := &AudioMetadata{
		Title:  m.Title(),
		Artist: m.Artist(),
		Album:  m.Album(),
	}
	if pic := m.Picture(); pic != nil {
		meta.ArtworkData = pic.Data
		meta.ArtworkMIME = pic.MIMEType
		if meta.ArtworkMIME == "" {
			meta.ArtworkMIME = "image/jpeg"
		}
	}
	return meta, nil
}
