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
        // Fallback to text emoji if image fails to load
        e.target.style.display = 'none';
        const textNode = document.createTextNode(emoji);
        e.target.parentNode.appendChild(textNode);
      }}
    />
  );
}
