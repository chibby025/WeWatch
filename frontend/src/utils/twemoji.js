import twemoji from 'twemoji';

const escapeHtml = (str) =>
  str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Parses a plain-text string and replaces emoji with crisp Twemoji SVG <img> tags.
// Input is HTML-escaped first so user-generated text cannot inject markup.
export const parseTwemoji = (text) => {
  if (!text) return '';
  const escaped = escapeHtml(String(text));
  return twemoji.parse(escaped, {
    folder: 'svg',
    ext: '.svg',
    base: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/',
  });
};
