// frontend/src/components/cinema/ui/EmojiImage.jsx
import React from 'react';

/**
 * EmojiImage - Renders high-quality emoji using Twemoji CDN
 * Provides crisp, scalable emoji images
 */
export default function EmojiImage({ emoji, size = 32, className = '', style = {} }) {
  // Map emoji to unicode codepoint for Twemoji
  const getEmojiCodepoint = (emoji) => {
    const codePoints = [];
    for (let i = 0; i < emoji.length; i++) {
      const char = emoji.charCodeAt(i);
      if (char >= 0xD800 && char <= 0xDBFF && i + 1 < emoji.length) {
        const low = emoji.charCodeAt(i + 1);
        if (low >= 0xDC00 && low <= 0xDFFF) {
          codePoints.push(0x10000 + ((char - 0xD800) << 10) + (low - 0xDC00));
          i++;
          continue;
        }
      }
      codePoints.push(char);
    }
    return codePoints.map(cp => cp.toString(16)).join('-');
  };

  const codepoint = getEmojiCodepoint(emoji);
  const twemojiUrl = `https://cdn.jsdelivr.net/gh/twitter/twemoji@14/assets/svg/${codepoint}.svg`;
  // Variation-selector-stripped fallback (e.g. 2764-fe0f → 2764)
  const fallbackUrl = twemojiUrl.replace(/-fe0[ef]/gi, '');

  return (
    <img
      src={twemojiUrl}
      alt={emoji}
      draggable={false}
      className={className}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        display: 'inline-block',
        verticalAlign: 'middle',
        ...style
      }}
      onError={(e) => {
        // First retry: strip variation selector (fe0f/fe0e) — Twemoji doesn't always include it
        if (fallbackUrl !== twemojiUrl && e.target.src !== fallbackUrl) {
          e.target.src = fallbackUrl;
          return;
        }
        // Both URLs failed: show native emoji in a span at the intended size
        e.target.style.display = 'none';
        const span = document.createElement('span');
        span.style.fontSize = `${size}px`;
        span.style.lineHeight = '1';
        span.style.verticalAlign = 'middle';
        span.textContent = emoji;
        e.target.parentNode.appendChild(span);
      }}
    />
  );
}
