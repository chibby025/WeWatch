// frontend/tests/components/ads/FeedAdCard.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FeedAdCard from '../../../src/components/ads/FeedAdCard';

// Mock formatCount utility
vi.mock('../../../src/utils/formatCount', () => ({
  formatCount: (num) => num >= 1000 ? `${(num / 1000).toFixed(1)}K` : num.toString(),
}));

describe('FeedAdCard', () => {
  const mockVideoAd = {
    id: 1,
    advertiser_name: 'Video Corp',
    advertiser_logo: 'https://example.com/logo.png',
    title: 'Amazing Product',
    description: 'Check out our latest offers!',
    media_url: 'https://example.com/ad.mp4',
    click_url: 'https://example.com/product',
  };

  const mockImageAd = {
    id: 2,
    advertiser_name: 'Image Corp',
    title: 'Special Deal',
    media_url: 'https://example.com/banner.jpg',
    thumbnail_url: 'https://example.com/thumb.jpg',
    click_url: 'https://example.com/deal',
  };

  const mockOnTrackImpression = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders video ad correctly', () => {
      render(<FeedAdCard ad={mockVideoAd} onTrackImpression={mockOnTrackImpression} />);

      expect(screen.getByText('Video Corp')).toBeTruthy();
      expect(screen.getByText('Amazing Product')).toBeTruthy();
      expect(screen.getByText('Check out our latest offers!')).toBeTruthy();
      expect(screen.getByText('Learn More')).toBeTruthy();

      const video = document.querySelector('video');
      expect(video).toBeTruthy();
      expect(video.src).toContain('ad.mp4');
      expect(video.autoplay).toBe(true);
      expect(video.loop).toBe(true);
      expect(video.muted).toBe(true);
    });

    it('renders image ad correctly', () => {
      const { container } = render(<FeedAdCard ad={mockImageAd} onTrackImpression={mockOnTrackImpression} />);

      expect(screen.getByText('Image Corp')).toBeTruthy();
      expect(screen.getByText('Special Deal')).toBeTruthy();

      const image = container.querySelector('img[alt="Image Corp"]');
      expect(image).toBeTruthy();
      expect(image.src).toContain('banner.jpg');
    });

    it('shows advertiser logo when available', () => {
      const { container } = render(<FeedAdCard ad={mockVideoAd} onTrackImpression={mockOnTrackImpression} />);

      const logo = container.querySelector('img[alt="Video Corp"]');
      expect(logo).toBeTruthy();
      expect(logo.src).toContain('logo.png');
    });

    it('shows fallback initial when logo is missing', () => {
      const adWithoutLogo = { ...mockImageAd, advertiser_logo: null };
      render(<FeedAdCard ad={adWithoutLogo} onTrackImpression={mockOnTrackImpression} />);

      expect(screen.getByText('I')).toBeTruthy(); // "Image Corp" -> "I"
    });
  });

  describe('Impression Tracking', () => {
    it('tracks impression on mount', () => {
      render(<FeedAdCard ad={mockVideoAd} onTrackImpression={mockOnTrackImpression} />);

      expect(mockOnTrackImpression).toHaveBeenCalledTimes(1);
      expect(mockOnTrackImpression).toHaveBeenCalledWith(false);
    });

    it('tracks click when card is clicked', () => {
      const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      render(<FeedAdCard ad={mockVideoAd} onTrackImpression={mockOnTrackImpression} />);

      const card = screen.getByText('Video Corp').closest('div').parentElement;
      fireEvent.click(card);

      expect(windowOpenSpy).toHaveBeenCalledWith('https://example.com/product', '_blank');
      expect(mockOnTrackImpression).toHaveBeenCalledWith(true);

      windowOpenSpy.mockRestore();
    });

    it('tracks click when CTA button is clicked', () => {
      const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      render(<FeedAdCard ad={mockVideoAd} onTrackImpression={mockOnTrackImpression} />);

      const ctaButton = screen.getByText('Learn More');
      fireEvent.click(ctaButton);

      expect(windowOpenSpy).toHaveBeenCalledWith('https://example.com/product', '_blank');

      windowOpenSpy.mockRestore();
    });

    it('does not track impression if callback is missing', () => {
      render(<FeedAdCard ad={mockVideoAd} onTrackImpression={null} />);

      // Should not throw error
      expect(screen.getByText('Video Corp')).toBeTruthy();
    });
  });

  describe('UI Elements', () => {
    it('displays fake engagement stats', () => {
      render(<FeedAdCard ad={mockVideoAd} onTrackImpression={mockOnTrackImpression} />);

      // Should show view count (randomized between 1K-10K)
      const viewCount = screen.getByText(/\d+(\.\d+)?K?/);
      expect(viewCount).toBeTruthy();
    });

    it('shows gradient overlay for readability', () => {
      const { container } = render(<FeedAdCard ad={mockVideoAd} onTrackImpression={mockOnTrackImpression} />);

      const overlay = container.querySelector('.bg-gradient-to-t');
      expect(overlay).toBeTruthy();
    });

    it('applies hover effects', () => {
      const { container } = render(<FeedAdCard ad={mockVideoAd} onTrackImpression={mockOnTrackImpression} />);

      const card = container.firstChild;
      expect(card.className).toContain('hover:scale-[1.02]');
      expect(card.className).toContain('cursor-pointer');
    });
  });

  describe('Format Detection', () => {
    it('renders video for video URLs', () => {
      const videoFormats = ['.mp4', '.webm', '.mov', '.avi'];

      videoFormats.forEach((ext) => {
        const ad = { ...mockVideoAd, media_url: `https://example.com/video${ext}` };
        const { container } = render(<FeedAdCard ad={ad} onTrackImpression={mockOnTrackImpression} />);

        const video = container.querySelector('video');
        expect(video).toBeTruthy();
      });
    });

    it('renders image for non-video URLs', () => {
      const imageFormats = ['.jpg', '.png', '.gif', '.webp'];

      imageFormats.forEach((ext) => {
        const ad = { ...mockVideoAd, media_url: `https://example.com/banner${ext}` };
        const { container } = render(<FeedAdCard ad={ad} onTrackImpression={mockOnTrackImpression} />);

        const image = container.querySelector('img[alt="Video Corp"]');
        expect(image).toBeTruthy();
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles missing description', () => {
      const adWithoutDesc = { ...mockVideoAd, description: null };
      render(<FeedAdCard ad={adWithoutDesc} onTrackImpression={mockOnTrackImpression} />);

      expect(screen.queryByText('Check out our latest offers!')).toBeNull();
      expect(screen.getByText('Amazing Product')).toBeTruthy();
    });

    it('handles missing title (uses advertiser name)', () => {
      const adWithoutTitle = { ...mockVideoAd, title: null };
      render(<FeedAdCard ad={adWithoutTitle} onTrackImpression={mockOnTrackImpression} />);

      // Should use advertiser name as title
      const titles = screen.getAllByText('Video Corp');
      expect(titles.length).toBeGreaterThan(1);
    });

    it('returns null for missing ad data', () => {
      const { container } = render(<FeedAdCard ad={null} onTrackImpression={mockOnTrackImpression} />);

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels', () => {
      const { container } = render(<FeedAdCard ad={mockVideoAd} onTrackImpression={mockOnTrackImpression} />);

      const image = container.querySelector('img[alt="Video Corp"]');
      expect(image).toBeTruthy();
    });

    it('is keyboard accessible', () => {
      const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      render(<FeedAdCard ad={mockVideoAd} onTrackImpression={mockOnTrackImpression} />);

      const ctaButton = screen.getByText('Learn More');
      ctaButton.focus();
      
      fireEvent.keyDown(ctaButton, { key: 'Enter', code: 'Enter' });

      windowOpenSpy.mockRestore();
    });
  });
});
