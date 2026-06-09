// WeWatch/frontend/src/components/lobby/LobbyStickerPicker.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { XMarkIcon, MagnifyingGlassIcon } from '@heroicons/react/24/solid';
import { StarIcon } from '@heroicons/react/24/outline';
import { StarIcon as StarSolidIcon } from '@heroicons/react/24/solid';
import toast from 'react-hot-toast';

const FAVS_KEY = 'wewatch_fav_stickers';
const loadFavs = () => {
  try { return JSON.parse(localStorage.getItem(FAVS_KEY) || '[]'); }
  catch { return []; }
};

// Replace with your own key from developers.giphy.com
const GIPHY_KEY = import.meta.env.VITE_GIPHY_API_KEY || 'dc6zaTOxFJmzC';

const emojiCategories = {
  smileys: {
    name: '😊 Smileys',
    emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '😵', '🤯', '🤠', '🥳', '😎', '🤓', '🧐']
  },
  gestures: {
    name: '👋 Gestures',
    emojis: ['👋', '🤚', '🖐', '✋', '🖖', '👌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🦷', '🦴', '👀', '👁', '👅', '👄', '💋']
  },
  animals: {
    name: '🐶 Animals',
    emojis: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🦗', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩', '🦮', '🐕‍🦺', '🐈', '🐓', '🦃', '🦚', '🦜', '🦢', '🦩', '🐇', '🦝', '🦨', '🦡', '🦦', '🦥', '🐁', '🐀', '🐿', '🦔']
  },
  food: {
    name: '🍕 Food',
    emojis: ['🍇', '🍈', '🍉', '🍊', '🍋', '🍌', '🍍', '🥭', '🍎', '🍏', '🍐', '🍑', '🍒', '🍓', '🥝', '🍅', '🥥', '🥑', '🍆', '🥔', '🥕', '🌽', '🌶', '🥒', '🥬', '🥦', '🧄', '🧅', '🍄', '🥜', '🌰', '🍞', '🥐', '🥖', '🥨', '🥯', '🥞', '🧇', '🧀', '🍖', '🍗', '🥩', '🥓', '🍔', '🍟', '🍕', '🌭', '🥪', '🌮', '🌯', '🥙', '🧆', '🥚', '🍳', '🥘', '🍲', '🥣', '🥗', '🍿', '🧈', '🧂', '🥫', '🍱', '🍘', '🍙', '🍚', '🍛', '🍜', '🍝', '🍠', '🍢', '🍣', '🍤', '🍥', '🥮', '🍡', '🥟', '🥠', '🥡', '🍦', '🍧', '🍨', '🍩', '🍪', '🎂', '🍰', '🧁', '🥧', '🍫', '🍬', '🍭', '🍮', '🍯']
  },
  activities: {
    name: '⚽ Activities',
    emojis: ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛷', '⛸', '🥌', '🎿', '⛷', '🏂', '🪂', '🏋️', '🤼', '🤸', '🤺', '🤾', '🏌️', '🏇', '🧘', '🏊', '🤽', '🚣', '🧗', '🚵', '🚴', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖', '🎗', '🎫', '🎟', '🎪', '🎭', '🎨', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🎷', '🎺', '🎸', '🪕', '🎻', '🎲', '♟', '🎯', '🎳', '🎮', '🎰', '🧩']
  },
  travel: {
    name: '✈️ Travel',
    emojis: ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎', '🚓', '🚑', '🚒', '🚐', '🚚', '🚛', '🚜', '🛴', '🚲', '🛵', '🏍', '🚨', '🚔', '🚍', '🚘', '🚖', '🚡', '🚠', '🚟', '🚃', '🚋', '🚞', '🚝', '🚄', '🚅', '🚈', '🚂', '🚆', '🚇', '🚊', '🚉', '✈️', '🛫', '🛬', '🛩', '💺', '🛰', '🚀', '🛸', '🚁', '🛶', '⛵', '🚤', '🛥', '🛳', '⛴', '🚢', '⚓', '⛽', '🚧', '🚦', '🚥', '🚏', '🗺', '🗿', '🗽', '🗼', '🏰', '🏯', '🏟', '🎡', '🎢', '🎠', '⛲', '⛱', '🏖', '🏝', '🏜', '🌋', '⛰', '🏔', '🗻', '🏕', '⛺', '🏠', '🏡', '🏘', '🏚', '🏗', '🏭', '🏢', '🏬', '🏣', '🏤', '🏥', '🏦', '🏨', '🏪', '🏫', '🏩', '💒', '🏛', '⛪', '🕌', '🕍', '🛕', '🕋']
  },
  objects: {
    name: '💡 Objects',
    emojis: ['⌚', '📱', '📲', '💻', '⌨️', '🖥', '🖨', '🖱', '🖲', '🕹', '🗜', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥', '📽', '🎞', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙', '🎚', '🎛', '🧭', '⏱', '⏲', '⏰', '🕰', '⌛', '⏳', '📡', '🔋', '🔌', '💡', '🔦', '🕯', '🪔', '🧯', '🛢', '💸', '💵', '💴', '💶', '💷', '💰', '💳', '🧾', '💎', '⚖️', '🧰', '🔧', '🔨', '⚒', '🛠', '⛏', '🔩', '⚙️', '🧱', '⛓', '🧲', '🔫', '💣', '🧨', '🪓', '🔪', '🗡', '⚔️', '🛡', '🚬', '⚰️', '⚱️', '🏺', '🔮', '📿', '🧿', '💈', '⚗️', '🔭', '🔬', '🕳', '🩹', '🩺', '💊', '💉', '🩸', '🧬', '🦠', '🧫', '🧪', '🌡', '🧹', '🧺', '🧻', '🚽', '🚰', '🚿', '🛁', '🛀', '🧼', '🪒', '🧽', '🧴', '🛎', '🔑', '🗝', '🚪', '🪑', '🛋', '🛏', '🛌', '🧸', '🖼', '🛍', '🛒', '🎁', '🎈', '🎏', '🎀', '🎊', '🎉', '🎎', '🏮', '🎐', '🧧', '✉️', '📩', '📨', '📧', '💌', '📥', '📤', '📦', '🏷', '📪', '📫', '📬', '📭', '📮', '📯', '📜', '📃', '📄', '📑', '🧾', '📊', '📈', '📉', '🗒', '🗓', '📆', '📅', '🗑', '📇', '🗃', '🗳', '🗄', '📋', '📁', '📂', '🗂', '🗞', '📰', '📓', '📔', '📒', '📕', '📗', '📘', '📙', '📚', '📖', '🔖', '🧷', '🔗', '📎', '🖇', '📐', '📏', '🧮', '📌', '📍', '✂️', '🖊', '🖋', '✒️', '🖌', '🖍', '📝', '✏️', '🔍', '🔎', '🔏', '🔐', '🔒', '🔓']
  },
  symbols: {
    name: '❤️ Symbols',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳', '🈶', '🈚', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🈴', '🈵', '🈹', '🈲', '🅰️', '🅱️', '🆎', '🆑', '🅾️', '🆘', '❌', '⭕', '🛑', '⛔', '📛', '🚫', '💯', '💢', '♨️', '🚷', '🚯', '🚳', '🚱', '🔞', '📵', '🚭', '❗', '❕', '❓', '❔', '‼️', '⁉️', '🔅', '🔆', '〽️', '⚠️', '🚸', '🔱', '⚜️', '🔰', '♻️', '✅', '❇️', '✳️', '❎', '🌐', '💠', '🌀', '💤', '🏧', '🚾', '♿', '🅿️', '🚹', '🚺', '🚼', '🚻', '🚮', '🎦', '📶', '🈁', '🔣', 'ℹ️', '🔤', '🔡', '🔠', '🆖', '🆗', '🆙', '🆒', '🆕', '🆓', '0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟']
  },
};

const LobbyStickerPicker = ({ isOpen, onClose, onSend, recipientId }) => {
  const [mode, setMode] = useState('emoji'); // 'emoji' | 'gifs' | 'saved'
  const [emojiCategory, setEmojiCategory] = useState('smileys');
  const [emojiSearch, setEmojiSearch] = useState('');

  const [gifQuery, setGifQuery] = useState('');
  const [gifs, setGifs] = useState([]);
  const [gifLoading, setGifLoading] = useState(false);
  const gifDebounce = useRef(null);
  const [favs, setFavs] = useState(loadFavs);

  // Load trending GIFs when tab first opens
  useEffect(() => {
    if (mode !== 'gifs') return;
    if (gifs.length > 0) return;
    fetchGifs('');
  }, [mode]);

  const fetchGifs = async (query) => {
    setGifLoading(true);
    try {
      // Use /stickers/ endpoint so results are transparent animated stickers, not regular GIFs
      const endpoint = query.trim()
        ? `https://api.giphy.com/v1/stickers/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(query)}&limit=24&rating=pg`
        : `https://api.giphy.com/v1/stickers/trending?api_key=${GIPHY_KEY}&limit=24&rating=pg`;
      const res = await fetch(endpoint);
      const json = await res.json();
      setGifs(json.data || []);
    } catch {
      setGifs([]);
    } finally {
      setGifLoading(false);
    }
  };

  const handleGifQueryChange = (e) => {
    const q = e.target.value;
    setGifQuery(q);
    clearTimeout(gifDebounce.current);
    gifDebounce.current = setTimeout(() => fetchGifs(q), 450);
  };

  const filteredEmojis = useMemo(() => {
    if (!emojiSearch.trim()) return emojiCategories[emojiCategory].emojis;
    const keywordMap = {
      smile: 'smileys', happy: 'smileys', sad: 'smileys', face: 'smileys',
      hand: 'gestures', thumb: 'gestures', wave: 'gestures',
      animal: 'animals', cat: 'animals', dog: 'animals', bird: 'animals',
      food: 'food', fruit: 'food', pizza: 'food',
      sport: 'activities', game: 'activities', ball: 'activities',
      car: 'travel', plane: 'travel', train: 'travel',
      phone: 'objects', book: 'objects',
      heart: 'symbols', love: 'symbols',
    };
    const matched = keywordMap[emojiSearch.toLowerCase()];
    return matched ? emojiCategories[matched].emojis : emojiCategories[emojiCategory].emojis;
  }, [emojiSearch, emojiCategory]);

  const handleEmojiSelect = async (emoji) => {
    try {
      await onSend(emoji, 'emoji', emoji, recipientId);
      onClose();
    } catch {
      toast.error('Failed to send emoji');
    }
  };

  const handleGifSelect = async (gif) => {
    const url = gif.images?.fixed_height?.url || gif.images?.downsized?.url || gif.url;
    if (!url) return;
    try {
      await onSend(url, 'giphy', gif.id || gif.title, recipientId);
      onClose();
    } catch {
      toast.error('Failed to send sticker');
    }
  };

  const toggleFav = (gif) => {
    const url = gif.images?.fixed_height?.url || gif.images?.downsized?.url || gif.url || '';
    const preview = gif.images?.fixed_height_small?.url || gif.images?.downsized?.url || gif.preview || url;
    const id = gif.id || gif.title || url;
    const entry = { url, preview, id, title: gif.title || 'Sticker', provider: 'giphy' };
    setFavs(prev => {
      const already = prev.some(f => f.id === id);
      const next = already ? prev.filter(f => f.id !== id) : [entry, ...prev];
      localStorage.setItem(FAVS_KEY, JSON.stringify(next));
      return next;
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-yellow-500 to-orange-500 px-5 py-3 rounded-t-2xl flex items-center justify-between flex-shrink-0">
          {/* Mode tabs */}
          <div className="flex gap-1 overflow-x-auto hide-scrollbar">
            {[
              { id: 'saved', label: '⭐ Saved' },
              { id: 'emoji', label: '😊 Emoji' },
              { id: 'gifs',  label: '✨ Stickers' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setMode(t.id)}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-sm font-semibold transition-colors ${
                  mode === t.id ? 'bg-white text-orange-600' : 'text-white hover:bg-white/20'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="text-white hover:bg-white/20 rounded-full p-1 transition-colors">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* ── EMOJI MODE ── */}
        {mode === 'emoji' && (
          <>
            <div className="flex overflow-x-auto border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0 hide-scrollbar">
              {Object.entries(emojiCategories).map(([key, cat]) => (
                <button
                  key={key}
                  onClick={() => { setEmojiCategory(key); setEmojiSearch(''); }}
                  className={`flex-shrink-0 px-4 py-3 text-sm font-medium transition-colors relative ${
                    emojiCategory === key
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  {cat.name.split(' ')[0]}
                  {emojiCategory === key && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
                  )}
                </button>
              ))}
            </div>
            <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div className="relative">
                <input
                  type="text"
                  value={emojiSearch}
                  onChange={e => setEmojiSearch(e.target.value)}
                  placeholder="Search e.g. 'smile', 'heart', 'food'…"
                  className="w-full px-4 py-2 pl-10 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2">
                {filteredEmojis.map((emoji, i) => (
                  <button
                    key={i}
                    onClick={() => handleEmojiSelect(emoji)}
                    className="aspect-square bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-all hover:scale-110 flex items-center justify-center text-2xl"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
            <div className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-b-2xl text-center flex-shrink-0">
              <p className="text-xs text-gray-500 dark:text-gray-400">{filteredEmojis.length} emojis · click to send</p>
            </div>
          </>
        )}

        {/* ── SAVED MODE ── */}
        {mode === 'saved' && (
          <>
            <div className="p-3 overflow-y-auto flex-1">
              {favs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-2">
                  <StarIcon className="w-10 h-10 text-gray-400" />
                  <p className="text-sm text-gray-400 text-center px-4">
                    Hover a sticker and tap ⭐ to save it here
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {favs.map(gif => {
                    const thumb = gif.preview || gif.url || '';
                    return (
                      <div key={gif.id} className="relative group/card rounded-lg overflow-hidden aspect-video bg-gray-100 dark:bg-gray-700">
                        <button
                          onClick={() => handleGifSelect(gif)}
                          className="w-full h-full hover:ring-2 hover:ring-orange-400 transition-all"
                        >
                          <img src={thumb} alt={gif.title || ''} className="w-full h-full object-cover" loading="lazy" />
                        </button>
                        <button
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); toggleFav(gif); }}
                          className="absolute top-1 right-1 p-0.5 rounded-full bg-yellow-500/80 text-white opacity-0 group-hover/card:opacity-100 transition-all"
                          title="Remove from saved"
                        >
                          <StarSolidIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-b-2xl text-center flex-shrink-0">
              <p className="text-xs text-gray-500 dark:text-gray-400">{favs.length} saved · click to send</p>
            </div>
          </>
        )}

        {/* ── STICKERS / GIF MODE ── */}
        {mode === 'gifs' && (
          <>
            <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div className="relative">
                <input
                  type="text"
                  value={gifQuery}
                  onChange={handleGifQueryChange}
                  placeholder="Search stickers…"
                  className="w-full px-4 py-2 pl-10 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>
            </div>
            <div className="p-3 overflow-y-auto flex-1">
              {gifLoading ? (
                <div className="flex items-center justify-center h-40">
                  <div className="w-8 h-8 rounded-full border-4 border-orange-400 border-t-transparent animate-spin" />
                </div>
              ) : gifs.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">No stickers found</div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {gifs.map(gif => {
                    const isSaved = favs.some(f => f.id === gif.id);
                    return (
                      <div key={gif.id} className="relative group/card rounded-lg overflow-hidden aspect-video bg-gray-100 dark:bg-gray-700">
                        <button
                          onClick={() => handleGifSelect(gif)}
                          className="w-full h-full hover:ring-2 hover:ring-orange-400 transition-all"
                        >
                          <img
                            src={gif.images?.fixed_height_small?.url || gif.images?.downsized?.url}
                            alt={gif.title}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </button>
                        <button
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); toggleFav(gif); }}
                          className={`absolute top-1 right-1 p-0.5 rounded-full transition-all
                            opacity-0 group-hover/card:opacity-100
                            ${isSaved ? 'bg-yellow-500/80 text-white' : 'bg-black/50 text-yellow-300 hover:bg-black/70'}`}
                          title={isSaved ? 'Remove from saved' : 'Save'}
                        >
                          {isSaved
                            ? <StarSolidIcon className="w-3.5 h-3.5" />
                            : <StarIcon className="w-3.5 h-3.5" />
                          }
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-b-2xl text-center flex-shrink-0">
              <p className="text-xs text-gray-500 dark:text-gray-400">Powered by GIPHY · click to send</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default LobbyStickerPicker;
