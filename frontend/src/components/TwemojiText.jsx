import { parseTwemoji } from '../utils/twemoji';

// Renders text with crisp Twemoji SVG images in place of OS emoji.
// Safe to use with user-generated content — input is HTML-escaped before parsing.
const TwemojiText = ({ children, className, as: Tag = 'span' }) => {
  const html = parseTwemoji(children);
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />;
};

export default TwemojiText;
