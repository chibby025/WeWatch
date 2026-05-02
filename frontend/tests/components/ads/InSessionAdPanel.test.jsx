// frontend/tests/components/ads/InSessionAdPanel.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import InSessionAdPanel from '../../../src/components/ads/InSessionAdPanel';

describe('InSessionAdPanel', () => {
  const mockAd = {
    id: 1,
    advertiser_name: 'Test Corp',
    campaign_name: 'Test Corp',
    title: 'Summer Sale',
    media_url: 'https://example.com/video.mp4',
    click_url: 'https://example.com/sale',
    duration: 15,
    thumbnail_url: 'https://example.com/thumb.jpg',
  };

  const mockGifAd = {
    ...mockAd,
    media_url: 'https://example.com/banner.gif',
  };

  const mockOnComplete = vi.fn();
  const mockOnTrackImpression = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Fullscreen Mode', () => {
    it('renders fullscreen video ad correctly', () => {
      render(
        <InSessionAdPanel
          ad={mockAd}
          fullscreen={true}
          onComplete={mockOnComplete}
          onTrackImpression={mockOnTrackImpression}
        />
      );

      const video = screen.getByRole('button', { name: /unmute/i }).closest('div').querySelector('video');
      expect(video).toBeTruthy();
      expect(video.src).toContain('video.mp4');
      expect(video.muted).toBe(true);
    });

    it('tracks impression on mount', () => {
      render(
        <InSessionAdPanel
          ad={mockAd}
          fullscreen={true}
          onComplete={mockOnComplete}
          onTrackImpression={mockOnTrackImpression}
        />
      );

      expect(mockOnTrackImpression).toHaveBeenCalledWith(mockAd.id);
    });

    it('opens advertiser URL on click', () => {
      const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      render(
        <InSessionAdPanel
          ad={mockAd}
          fullscreen={true}
          onComplete={mockOnComplete}
          onTrackImpression={mockOnTrackImpression}
        />
      );

      const learnMoreButton = screen.getByText(/learn more/i);
      fireEvent.click(learnMoreButton);

      expect(windowOpenSpy).toHaveBeenCalledWith('https://example.com/sale', '_blank', 'noopener,noreferrer');
      expect(mockOnTrackImpression).toHaveBeenCalledWith(mockAd.id, true);

      windowOpenSpy.mockRestore();
    });

    it('toggles mute state', () => {
      render(
        <InSessionAdPanel
          ad={mockAd}
          fullscreen={true}
          onComplete={mockOnComplete}
          onTrackImpression={mockOnTrackImpression}
        />
      );

      const muteButton = screen.getByRole('button', { name: /unmute/i });
      const video = muteButton.closest('div').querySelector('video');

      expect(video.muted).toBe(true);

      fireEvent.click(muteButton);
      expect(video.muted).toBe(false);

      fireEvent.click(muteButton);
      expect(video.muted).toBe(true);
    });

    it('calls onComplete when video ends', async () => {
      render(
        <InSessionAdPanel
          ad={mockAd}
          fullscreen={true}
          onComplete={mockOnComplete}
          onTrackImpression={mockOnTrackImpression}
        />
      );

      const video = document.querySelector('video');
      fireEvent.ended(video);

      await waitFor(() => {
        expect(mockOnComplete).toHaveBeenCalled();
      });
    });
  });

  describe('Sidebar Mode (80-20 Split)', () => {
    it('renders sidebar GIF ad correctly', () => {
      const { container } = render(
        <InSessionAdPanel
          ad={mockGifAd}
          fullscreen={false}
          onComplete={mockOnComplete}
          onTrackImpression={mockOnTrackImpression}
        />
      );

      const image = container.querySelector('img[alt="Test Corp"]');
      expect(image).toBeTruthy();
      expect(image.src).toContain('banner.gif');
    });

    it('auto-closes after 15 seconds for image ads', async () => {
      vi.useFakeTimers();

      render(
        <InSessionAdPanel
          ad={mockGifAd}
          fullscreen={false}
          onComplete={mockOnComplete}
          onTrackImpression={mockOnTrackImpression}
        />
      );

      expect(mockOnComplete).not.toHaveBeenCalled();

      // Fast-forward time
      await vi.advanceTimersByTimeAsync(15000);

      // Check if complete was called
      expect(mockOnComplete).toHaveBeenCalled();

      vi.useRealTimers();
    }, 10000);

    it('renders compact UI in sidebar mode', () => {
      const { container } = render(
        <InSessionAdPanel
          ad={mockAd}
          fullscreen={false}
          onComplete={mockOnComplete}
          onTrackImpression={mockOnTrackImpression}
        />
      );

      // Check for relative positioning (not fixed)
      const adContainer = container.firstChild;
      expect(adContainer.className).toContain('relative');
      expect(adContainer.className).not.toContain('fixed');
    });
  });

  describe('Format Detection', () => {
    it('detects video formats', () => {
      const videoFormats = ['.mp4', '.webm', '.mov', '.avi'];

      videoFormats.forEach((ext) => {
        const ad = { ...mockAd, media_url: `https://example.com/video${ext}` };
        const { container } = render(
          <InSessionAdPanel
            ad={ad}
            fullscreen={true}
            onComplete={mockOnComplete}
            onTrackImpression={mockOnTrackImpression}
          />
        );

        const video = container.querySelector('video');
        expect(video).toBeTruthy();
      });
    });

    it('detects animated formats', () => {
      const animatedFormats = ['.gif', '.webp'];

      animatedFormats.forEach((ext) => {
        const ad = { ...mockAd, media_url: `https://example.com/banner${ext}` };
        const { container } = render(
          <InSessionAdPanel
            ad={ad}
            fullscreen={false}
            onComplete={mockOnComplete}
            onTrackImpression={mockOnTrackImpression}
          />
        );

        const image = container.querySelector('img[alt="Test Corp"]');
        expect(image).toBeTruthy();
      });
    });
  });

  describe('Progress Display', () => {
    it('shows remaining time', () => {
      render(
        <InSessionAdPanel
          ad={mockAd}
          fullscreen={true}
          onComplete={mockOnComplete}
          onTrackImpression={mockOnTrackImpression}
        />
      );

      // Remaining time should be visible
      const timeDisplay = screen.getByText(/\d+s/);
      expect(timeDisplay).toBeTruthy();
    });

    it('updates progress bar as video plays', async () => {
      const { container } = render(
        <InSessionAdPanel
          ad={mockAd}
          fullscreen={true}
          onComplete={mockOnComplete}
          onTrackImpression={mockOnTrackImpression}
        />
      );

      const video = container.querySelector('video');
      
      // First load metadata
      Object.defineProperty(video, 'duration', { value: 15, writable: true, configurable: true });
      fireEvent.loadedMetadata(video);
      
      // Then simulate video progress
      Object.defineProperty(video, 'currentTime', { value: 7.5, writable: true, configurable: true });
      fireEvent.timeUpdate(video);

      await waitFor(() => {
        const progressBar = container.querySelector('.bg-blue-500');
        // Progress should be 50% (7.5 / 15)
        expect(progressBar.style.width).toContain('50');
      }, { timeout: 3000 });
    }, 10000);
  });

  describe('Error Handling', () => {
    it('handles missing ad data gracefully', () => {
      // Component should not crash when ad is null - check it doesn't throw
      expect(() => {
        render(
          <InSessionAdPanel
            ad={null}
            fullscreen={true}
            onComplete={mockOnComplete}
            onTrackImpression={mockOnTrackImpression}
          />
        );
      }).not.toThrow();
    });

    it('handles video load errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { container } = render(
        <InSessionAdPanel
          ad={mockAd}
          fullscreen={true}
          onComplete={mockOnComplete}
          onTrackImpression={mockOnTrackImpression}
        />
      );

      const video = container.querySelector('video');
      fireEvent.error(video);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalled();
      }, { timeout: 3000 });

      consoleSpy.mockRestore();
    }, 10000);
  });
});
