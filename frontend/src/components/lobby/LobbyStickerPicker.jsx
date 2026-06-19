// WeWatch/frontend/src/components/lobby/LobbyStickerPicker.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { XMarkIcon, PlusIcon } from '@heroicons/react/24/solid';
import { GlobeAltIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import {
  getStickerPacks, createStickerPack, uploadStickerToPack,
  addCommunityPack, getCommunityPacks, importTelegramPack,
} from '../../services/api';

// ── Emoji data ──────────────────────────────────────────────────────────────
const EMOJI_CATS = {
  smileys:    { name: '😊', emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','😵','🤯','🤠','🥳','😎','🤓','🧐'] },
  gestures:   { name: '👋', emojis: ['👋','🤚','🖐','✋','🖖','👌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💪'] },
  animals:    { name: '🐶', emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🦋','🐌','🐞','🐜','🐢','🐍','🦎','🐙','🦑','🦐','🦀','🐡','🐠','🐟','🐬','🐳','🦈'] },
  food:       { name: '🍕', emojis: ['🍇','🍈','🍉','🍊','🍋','🍌','🍍','🥭','🍎','🍏','🍐','🍑','🍒','🍓','🥝','🥑','🍆','🥦','🍄','🍞','🥐','🥖','🧀','🍔','🍟','🍕','🌭','🥪','🌮','🌯','🥚','🍳','🍜','🍝','🍦','🍧','🍨','🍩','🍪','🎂','🍰','🧁','🍫','🍬','🍭','☕','🍺','🍻','🥂','🍷'] },
  activities: { name: '⚽', emojis: ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🎱','🏓','🏸','🥊','🥋','🎽','🛹','⛸','🥌','🎿','🏆','🥇','🥈','🥉','🏅','🎮','🎲','♟','🎯','🎳','🎨','🎬','🎤','🎧','🎼','🎸','🎹','🥁','🎷','🎺','🎻'] },
  travel:     { name: '✈️', emojis: ['🚗','🚕','🚙','🚌','🏎','🚓','🚑','🚒','🛴','🚲','🛵','🏍','🚨','🚃','🚋','🚝','🚄','🚅','✈️','🛫','🛬','🚀','🛸','🚁','⛵','🚤','🛥','🚢','⚓','🗺','🗽','🗼','🏰','🏯','🎡','🎢','⛲','🏖','🏝','🏜','🌋','🏔','🏕'] },
  objects:    { name: '💡', emojis: ['⌚','📱','💻','🖥','🖨','🖱','🕹','💾','💿','📷','📹','🎥','📞','☎️','📺','📻','🔋','🔌','💡','🔦','🕯','💸','💎','⚖️','🔧','🔨','🛠','⚙️','🔫','💣','🔪','⚔️','🛡','🔮','💊','💉','🌡','🔑','🗝','🚪','🎁','🎈','🎊','🎉','✉️','📱','📝','✏️','🔍','🔎','🔒'] },
  symbols:    { name: '❤️', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉','☸️','✡️','🔯','☯️','🛐','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','❌','⭕','🛑','⛔','🚫','💯','⚠️','♻️','✅','❎','💠','🌀','💤'] },
};

// ── Emoji tab ────────────────────────────────────────────────────────────────
const EmojiTab = ({ onSelect }) => {
  const [cat, setCat] = useState('smileys');
  const [search, setSearch] = useState('');
  const emojis = useMemo(() => {
    if (!search.trim()) return EMOJI_CATS[cat].emojis;
    const kw = search.toLowerCase();
    return Object.values(EMOJI_CATS).flatMap(c => c.emojis).filter(() => true).slice(0, 60);
  }, [cat, search]);

  return (
    <>
      <div className="flex overflow-x-auto border-b border-gray-200 dark:border-gray-700 hide-scrollbar flex-shrink-0">
        {Object.entries(EMOJI_CATS).map(([key, c]) => (
          <button key={key} onClick={() => { setCat(key); setSearch(''); }}
            className={`flex-shrink-0 px-3 py-2.5 text-base transition-colors relative ${cat === key ? 'text-purple-600 dark:text-purple-400' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}>
            {c.name}
            {cat === key && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500" />}
          </button>
        ))}
      </div>
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
          className="w-full px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500" />
      </div>
      <div className="p-3 overflow-y-auto flex-1">
        <div className="grid grid-cols-7 sm:grid-cols-9 gap-1.5">
          {emojis.map((em, i) => (
            <button key={i} onClick={() => onSelect(em)}
              className="aspect-square bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-all hover:scale-110 flex items-center justify-center text-xl">
              {em}
            </button>
          ))}
        </div>
      </div>
    </>
  );
};

// ── Main component ──────────────────────────────────────────────────────────
const LobbyStickerPicker = ({ isOpen, onClose, onSend, recipientId }) => {
  const [tab, setTab] = useState('emoji');
  const [packs, setPacks] = useState([]);
  const [selectedPack, setSelectedPack] = useState(null);
  const [communityPacks, setCommunityPacks] = useState([]);
  const [addedPackIds, setAddedPackIds] = useState(new Set());
  const [telegramInput, setTelegramInput] = useState('');
  const [importing, setImporting] = useState(false);
  const [loadingCommunity, setLoadingCommunity] = useState(false);
  const [newPackName, setNewPackName] = useState('');
  const [creatingPack, setCreatingPack] = useState(false);
  const [uploadingSticker, setUploadingSticker] = useState(false);
  const [targetPackId, setTargetPackId] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    getStickerPacks().then(r => {
      const ps = r.data.packs || [];
      setPacks(ps);
      if (ps.length && !selectedPack) setSelectedPack(ps[0]);
      if (ps.length) setTargetPackId(ps[0].id);
    }).catch(() => {});
  }, [isOpen]);

  useEffect(() => {
    if (tab === 'community' && communityPacks.length === 0) {
      setLoadingCommunity(true);
      getCommunityPacks().then(r => setCommunityPacks(r.data.packs || []))
        .catch(() => {}).finally(() => setLoadingCommunity(false));
    }
  }, [tab]);

  const handleEmoji = async (emoji) => {
    try { await onSend(emoji, 'emoji', emoji, recipientId); onClose(); }
    catch { toast.error('Failed to send emoji'); }
  };

  const handleSticker = async (sticker) => {
    try { await onSend(sticker.url, 'cdn', String(sticker.id), recipientId); onClose(); }
    catch { toast.error('Failed to send sticker'); }
  };

  const handleCreatePack = async () => {
    if (!newPackName.trim()) return;
    setCreatingPack(true);
    try {
      const r = await createStickerPack(newPackName.trim());
      const np = r.data.pack;
      setPacks(prev => [np, ...prev]);
      setSelectedPack(np);
      setTargetPackId(np.id);
      setNewPackName('');
      toast.success('Pack created!');
    } catch { toast.error('Failed to create pack'); }
    finally { setCreatingPack(false); }
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const packId = targetPackId;
    if (!packId) { toast.error('Select or create a pack first'); return; }
    setUploadingSticker(true);
    let ok = 0;
    for (const f of files.slice(0, 10)) {
      if (f.size > 2 * 1024 * 1024) { toast.error(`${f.name} over 2 MB`); continue; }
      try { await uploadStickerToPack(packId, f); ok++; } catch {}
    }
    if (ok > 0) {
      toast.success(`${ok} sticker${ok > 1 ? 's' : ''} added`);
      getStickerPacks().then(r => {
        const ps = r.data.packs || [];
        setPacks(ps);
        const updated = ps.find(p => p.id === packId);
        if (updated) setSelectedPack(updated);
      });
    }
    setUploadingSticker(false);
  };

  const handleTelegramImport = async () => {
    if (!telegramInput.trim()) return;
    setImporting(true);
    try {
      const r = await importTelegramPack(telegramInput.trim());
      const pack = r.data.pack;
      const count = r.data.stickers_imported ?? pack.sticker_count;
      toast.success(`Imported "${pack.name}" — ${count} stickers`);
      setPacks(prev => prev.find(p => p.id === pack.id) ? prev : [pack, ...prev]);
      setSelectedPack(pack);
      setTelegramInput('');
      setTab('my');
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Import failed');
    } finally { setImporting(false); }
  };

  const handleAddCommunityPack = async (pack) => {
    try {
      await addCommunityPack(pack.id);
      setAddedPackIds(prev => new Set([...prev, pack.id]));
      setPacks(prev => prev.find(p => p.id === pack.id) ? prev : [pack, ...prev]);
      toast.success(`Added "${pack.name}"`);
    } catch { toast.error('Failed to add pack'); }
  };

  if (!isOpen) return null;

  const TABS = [
    { id: 'emoji', icon: '😊', title: 'Emoji' },
    { id: 'my', icon: '📦', title: 'My Stickers' },
    { id: 'create', icon: '✨', title: 'Create' },
    { id: 'import', icon: '🔗', title: 'Import' },
    { id: 'community', icon: '🌍', title: 'Community' },
  ];

  // Stickers of the currently selected pack (from the packs list, which has items preloaded)
  const currentItems = packs.find(p => p.id === selectedPack?.id)?.items || [];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-xl w-full max-h-[85vh] flex flex-col">

        {/* Header tabs */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2.5 rounded-t-2xl flex items-center justify-between flex-shrink-0">
          <div className="flex gap-1 overflow-x-auto hide-scrollbar">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} title={t.title}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-sm font-semibold transition-colors ${tab === t.id ? 'bg-white text-purple-700' : 'text-white hover:bg-white/20'}`}>
                {t.icon}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="ml-2 text-white hover:bg-white/20 rounded-full p-1 flex-shrink-0">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Tab label */}
        <div className="px-4 py-1.5 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            {TABS.find(t => t.id === tab)?.title}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">

          {/* ── EMOJI ── */}
          {tab === 'emoji' && <EmojiTab onSelect={handleEmoji} />}

          {/* ── MY STICKERS ── */}
          {tab === 'my' && (
            packs.length === 0 ? (
              <div className="flex flex-col items-center justify-center flex-1 gap-3 text-gray-400 p-6">
                <span className="text-5xl">📦</span>
                <p className="text-sm text-center">You have no sticker packs yet.<br />Import one from Telegram or create your own!</p>
              </div>
            ) : (
              <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                {/* Pack strip */}
                <div className="flex gap-2 px-2 py-2 border-b border-gray-200 dark:border-gray-700 overflow-x-auto flex-shrink-0 hide-scrollbar">
                  {packs.map(pack => (
                    <button key={pack.id} onClick={() => setSelectedPack(pack)}
                      className={`flex-shrink-0 flex flex-col items-center gap-1 p-1.5 rounded-lg transition-all ${selectedPack?.id === pack.id ? 'bg-purple-100 dark:bg-purple-900/40 ring-2 ring-purple-500' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                      {pack.thumbnail_url
                        ? <img src={pack.thumbnail_url} className="w-11 h-11 object-cover rounded-lg" alt={pack.name} />
                        : <div className="w-11 h-11 bg-gray-200 dark:bg-gray-600 rounded-lg flex items-center justify-center text-xl">📦</div>}
                      <span className="text-[9px] text-gray-500 dark:text-gray-400 max-w-[48px] truncate">{pack.name}</span>
                    </button>
                  ))}
                </div>
                {/* Sticker grid */}
                <div className="flex-1 overflow-y-auto p-2">
                  {currentItems.length === 0
                    ? <p className="text-center text-sm text-gray-400 py-8">No stickers in this pack yet</p>
                    : (
                      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                        {currentItems.map(sticker => (
                          <button key={sticker.id} onClick={() => handleSticker(sticker)}
                            className="aspect-square rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700 hover:ring-2 hover:ring-purple-500 hover:scale-105 transition-all">
                            <img src={sticker.url} alt={sticker.emoji || ''}
                              className="w-full h-full object-contain" loading="lazy" />
                          </button>
                        ))}
                      </div>
                    )}
                </div>
              </div>
            )
          )}

          {/* ── CREATE ── */}
          {tab === 'create' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Select pack</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {packs.filter(p => p.creator_user_id != null).map(pack => (
                    <button key={pack.id} onClick={() => setTargetPackId(pack.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-all ${targetPackId === pack.id ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-purple-400'}`}>
                      {pack.name}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={newPackName} onChange={e => setNewPackName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreatePack()}
                    placeholder="New pack name…"
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  <button onClick={handleCreatePack} disabled={creatingPack || !newPackName.trim()}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors">
                    {creatingPack ? '…' : 'Create'}
                  </button>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Upload stickers</p>
                <input ref={fileInputRef} type="file" multiple accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={handleFileUpload} />
                <button onClick={() => fileInputRef.current?.click()} disabled={uploadingSticker || !targetPackId}
                  className="w-full py-7 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl flex flex-col items-center gap-2 text-gray-400 hover:border-purple-400 hover:text-purple-500 transition-colors disabled:opacity-50">
                  {uploadingSticker
                    ? <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    : <PlusIcon className="w-8 h-8" />}
                  <span className="text-sm font-medium">{uploadingSticker ? 'Uploading…' : 'Upload images'}</span>
                  <span className="text-[11px] text-center px-4 text-gray-400">PNG, WebP, GIF · max 2 MB each · up to 10 at once<br />Use remove.bg first for transparent backgrounds</span>
                </button>
              </div>
            </div>
          )}

          {/* ── IMPORT ── */}
          {tab === 'import' && (
            <div className="p-5 flex flex-col gap-4 flex-1">
              <div>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Import from Telegram</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  Paste a Telegram sticker pack link or just the pack name
                </p>
                <div className="flex gap-2">
                  <input value={telegramInput} onChange={e => setTelegramInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleTelegramImport()}
                    placeholder="HotCherry  or  t.me/addstickers/HotCherry"
                    className="flex-1 px-3 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button onClick={handleTelegramImport} disabled={importing || !telegramInput.trim()}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-semibold hover:bg-blue-600 disabled:opacity-50 flex items-center gap-1.5 transition-colors">
                    {importing
                      ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <ArrowDownTrayIcon className="w-4 h-4" />}
                    {importing ? 'Importing…' : 'Import'}
                  </button>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                  <strong>How to find pack names:</strong> Open Telegram → find a sticker → tap & hold → "View sticker set" → share → copy the link. Only static (.webp) stickers are imported; animated ones are skipped.
                </p>
              </div>
            </div>
          )}

          {/* ── COMMUNITY ── */}
          {tab === 'community' && (
            <div className="flex-1 overflow-y-auto p-3">
              {loadingCommunity ? (
                <div className="flex justify-center py-10">
                  <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : communityPacks.length === 0 ? (
                <div className="text-center py-10 text-gray-400 flex flex-col items-center gap-2">
                  <GlobeAltIcon className="w-10 h-10 opacity-50" />
                  <p className="text-sm">No public packs yet. Create one and publish it!</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {communityPacks.map(pack => (
                    <div key={pack.id} className="bg-gray-50 dark:bg-gray-700/60 rounded-xl p-3 flex flex-col gap-2">
                      {pack.thumbnail_url
                        ? <img src={pack.thumbnail_url} className="w-full aspect-square object-cover rounded-lg" alt={pack.name} />
                        : <div className="w-full aspect-square bg-gray-200 dark:bg-gray-600 rounded-lg flex items-center justify-center text-3xl">📦</div>}
                      <p className="text-xs font-semibold text-gray-800 dark:text-white truncate">{pack.name}</p>
                      <p className="text-[10px] text-gray-500">{pack.sticker_count} stickers</p>
                      <button onClick={() => handleAddCommunityPack(pack)} disabled={addedPackIds.has(pack.id)}
                        className={`text-xs py-1.5 rounded-lg font-semibold transition-colors ${addedPackIds.has(pack.id) ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-purple-600 text-white hover:bg-purple-700'}`}>
                        {addedPackIds.has(pack.id) ? '✓ Added' : '+ Add'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default LobbyStickerPicker;
