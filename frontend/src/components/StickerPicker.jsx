import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MagnifyingGlassIcon, XMarkIcon, StarIcon, TrashIcon, PlusIcon } from '@heroicons/react/24/outline';
import { StarIcon as StarSolidIcon } from '@heroicons/react/24/solid';
import EmojiPicker from './EmojiPicker';
import { uploadCustomSticker } from '../services/api';
import toast from 'react-hot-toast';

const GIPHY_KEY = import.meta.env.VITE_GIPHY_API_KEY || '';
const LIMIT = 21; // 3-col grid — multiples of 3 look tidy
const FAVS_KEY = 'wewatch_fav_stickers';
const CUSTOM_KEY = 'wewatch_custom_stickers';

const loadLS = (key) => {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); }
  catch { return []; }
};

const giphyUrl = (type, query) => {
  const base = 'https://api.giphy.com/v1';
  if (query.trim()) {
    return `${base}/${type}/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(query)}&limit=${LIMIT}&rating=pg`;
  }
  return `${base}/${type}/trending?api_key=${GIPHY_KEY}&limit=${LIMIT}&rating=pg`;
};

// ── Single sticker card ───────────────────────────────────────────────────────
const StickerCard = ({ gif, onSelect, isSaved, onToggleFav, aspectClass = 'aspect-square', children }) => {
  const thumb = gif.images?.fixed_height_small?.url
    || gif.images?.downsized?.url
    || gif.preview
    || gif.url
    || '';

  return (
    <div className={`relative group/card rounded-xl overflow-hidden bg-gray-700/60 ${aspectClass}`}>
      <button
        type="button"
        onClick={() => onSelect(gif)}
        className="w-full h-full hover:ring-2 hover:ring-purple-500 transition-all rounded-xl"
      >
        <img
          src={thumb}
          alt={gif.title || ''}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </button>

      {/* Star / save button */}
      {onToggleFav && (
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onToggleFav(gif); }}
          className={`absolute top-1 right-1 p-0.5 rounded-full transition-all
            opacity-0 group-hover/card:opacity-100
            ${isSaved ? 'bg-yellow-500/90 text-white' : 'bg-black/60 text-yellow-300 hover:bg-black/80'}`}
          title={isSaved ? 'Remove from saved' : 'Save'}
        >
          {isSaved
            ? <StarSolidIcon className="w-3 h-3" />
            : <StarIcon className="w-3 h-3" />
          }
        </button>
      )}

      {/* Optional extra overlay (e.g. delete button) */}
      {children}
    </div>
  );
};

// ── Grid wrapper ──────────────────────────────────────────────────────────────
const StickerGrid = ({ loading, error, empty, children }) => (
  <div className="flex-1 overflow-y-auto p-2" style={{ minHeight: 0 }}>
    {loading && (
      <div className="flex items-center justify-center py-8">
        <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )}
    {!loading && error && (
      <p className="text-center text-xs text-gray-400 py-6 px-2">{error}</p>
    )}
    {!loading && !error && empty && (
      <div className="flex flex-col items-center justify-center py-8 gap-2 text-gray-500">
        {empty}
      </div>
    )}
    {!loading && !error && !empty && (
      <div className="grid grid-cols-3 gap-2">
        {children}
      </div>
    )}
  </div>
);

// ── Main picker ───────────────────────────────────────────────────────────────
const StickerPicker = ({ onEmojiSelect, onStickerSelect }) => {
  const [tab, setTab] = useState('emoji');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [favs, setFavs] = useState(() => loadLS(FAVS_KEY));
  const [customs, setCustoms] = useState(() => loadLS(CUSTOM_KEY));
  const [uploading, setUploading] = useState(false);
  const debounceRef = useRef(null);
  const fileInputRef = useRef(null);

  const fetchItems = useCallback(async (q, type) => {
    if (!GIPHY_KEY) { setError('Giphy API key not configured'); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(giphyUrl(type, q));
      if (!res.ok) throw new Error();
      const data = await res.json();
      setItems(data.data || []);
    } catch { setError('Could not load content'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (tab !== 'stickers' && tab !== 'gifs') return;
    setItems([]);
    setQuery('');
    fetchItems('', tab);
  }, [tab, fetchItems]);

  const handleQueryChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchItems(q, tab), 400);
  };

  const handleSelectGiphy = (gif) => {
    const url = gif.images?.fixed_height?.url || gif.images?.downsized?.url || gif.url || '';
    const preview = gif.images?.fixed_height_small?.url || gif.images?.downsized_small?.url || gif.preview || url;
    onStickerSelect?.({ url, preview, id: gif.id || url, title: gif.title || 'GIF', provider: 'giphy' });
  };

  const handleSelectCustom = (sticker) => {
    onStickerSelect?.({ url: sticker.url, preview: sticker.url, id: sticker.id, title: sticker.name || 'sticker', provider: 'custom' });
  };

  const toggleFav = (gif) => {
    const url = gif.images?.fixed_height?.url || gif.images?.downsized?.url || gif.url || '';
    const preview = gif.images?.fixed_height_small?.url || gif.images?.downsized_small?.url || gif.preview || url;
    const id = gif.id || url;
    const entry = { url, preview, id, title: gif.title || 'GIF', provider: 'giphy' };
    setFavs(prev => {
      const next = prev.some(f => f.id === id) ? prev.filter(f => f.id !== id) : [entry, ...prev];
      localStorage.setItem(FAVS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    if (!allowed.includes(file.type)) {
      toast.error('Use PNG, JPEG, GIF, or WebP');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be under 2 MB');
      return;
    }

    setUploading(true);
    try {
      const { url } = await uploadCustomSticker(file);
      const entry = { url, id: `custom_${Date.now()}`, name: file.name.replace(/\.[^.]+$/, '') };
      setCustoms(prev => {
        const next = [entry, ...prev];
        localStorage.setItem(CUSTOM_KEY, JSON.stringify(next));
        return next;
      });
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const deleteCustom = (id) => {
    setCustoms(prev => {
      const next = prev.filter(s => s.id !== id);
      localStorage.setItem(CUSTOM_KEY, JSON.stringify(next));
      return next;
    });
  };

  const TABS = [
    { id: 'saved',    label: '⭐' },
    { id: 'emoji',    label: '😊' },
    { id: 'stickers', label: '✨' },
    { id: 'gifs',     label: '🎬' },
    { id: 'mine',     label: '🖼' },
  ];

  const isGiphyTab = tab === 'stickers' || tab === 'gifs';

  return (
    <div
      className="bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden flex flex-col"
      style={{
        width: tab === 'emoji' ? '352px' : '320px',
        maxHeight: tab === 'emoji' ? '460px' : '380px',
      }}
    >
      {/* Tab bar */}
      <div className="flex border-b border-gray-700 flex-shrink-0">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            title={t.id.charAt(0).toUpperCase() + t.id.slice(1)}
            className={`flex-1 py-2 text-sm transition-colors ${
              tab === t.id
                ? 'bg-gray-700/60 border-b-2 border-purple-500'
                : 'text-gray-400 hover:bg-gray-700/30'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Emoji ── */}
      {tab === 'emoji' && (
        <div className="flex-1 overflow-hidden">
          <EmojiPicker onEmojiSelect={onEmojiSelect} />
        </div>
      )}

      {/* ── Saved ── */}
      {tab === 'saved' && (
        <StickerGrid
          empty={favs.length === 0 && (
            <>
              <StarIcon className="w-7 h-7" />
              <p className="text-xs text-center px-4">Hover a sticker and tap ⭐ to save it here</p>
            </>
          )}
        >
          {favs.map(gif => (
            <StickerCard
              key={gif.id}
              gif={gif}
              onSelect={handleSelectGiphy}
              isSaved
              onToggleFav={toggleFav}
            />
          ))}
        </StickerGrid>
      )}

      {/* ── Stickers / GIFs ── */}
      {isGiphyTab && (
        <>
          <div className="px-2 pt-2 flex-shrink-0">
            <div className="flex items-center gap-1.5 bg-gray-700 rounded-lg px-2 py-1.5">
              <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <input
                type="text"
                value={query}
                onChange={handleQueryChange}
                placeholder={`Search ${tab}…`}
                className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none min-w-0"
                autoFocus
              />
              {query && (
                <button type="button" onClick={() => { setQuery(''); fetchItems('', tab); }}
                  className="text-gray-400 hover:text-white flex-shrink-0">
                  <XMarkIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <StickerGrid
            loading={loading}
            error={error}
            empty={!loading && !error && items.length === 0 && (
              <p className="text-xs">{!GIPHY_KEY ? 'API key not set' : 'Nothing found'}</p>
            )}
          >
            {items.map(gif => (
              <StickerCard
                key={gif.id}
                gif={gif}
                onSelect={handleSelectGiphy}
                aspectClass={tab === 'gifs' ? 'aspect-video' : 'aspect-square'}
                isSaved={favs.some(f => f.id === gif.id)}
                onToggleFav={toggleFav}
              />
            ))}
          </StickerGrid>

          <div className="px-2 py-1 flex-shrink-0 border-t border-gray-700 flex justify-end">
            <span className="text-[10px] text-gray-500 select-none">Powered by GIPHY</span>
          </div>
        </>
      )}

      {/* ── Mine (custom) ── */}
      {tab === 'mine' && (
        <>
          <div className="px-2 pt-2 flex-shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden"
              onChange={handleFileSelect}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-purple-600/20 border border-purple-500/40 text-purple-300 text-sm font-medium hover:bg-purple-600/30 transition-colors disabled:opacity-50"
            >
              {uploading
                ? <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                : <PlusIcon className="w-4 h-4" />
              }
              {uploading ? 'Uploading…' : 'Add sticker'}
            </button>
          </div>

          <StickerGrid
            empty={customs.length === 0 && !uploading && (
              <>
                <p className="text-xs text-center px-4">Upload PNG, GIF, or WebP images to use as stickers</p>
              </>
            )}
          >
            {customs.map(sticker => (
              <div key={sticker.id} className="relative group/card rounded-xl overflow-hidden bg-gray-700/60 aspect-square">
                <button
                  type="button"
                  onClick={() => handleSelectCustom(sticker)}
                  className="w-full h-full hover:ring-2 hover:ring-purple-500 transition-all rounded-xl"
                >
                  <img
                    src={sticker.url}
                    alt={sticker.name || 'sticker'}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); deleteCustom(sticker.id); }}
                  className="absolute top-1 right-1 p-0.5 rounded-full bg-red-500/80 text-white opacity-0 group-hover/card:opacity-100 transition-all"
                  title="Remove"
                >
                  <TrashIcon className="w-3 h-3" />
                </button>
              </div>
            ))}
          </StickerGrid>
        </>
      )}
    </div>
  );
};

export default StickerPicker;
