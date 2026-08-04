// Room-chat sticker picker — inline dropdown (dark theme, compact).
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MagnifyingGlassIcon, XMarkIcon, PlusIcon } from '@heroicons/react/24/outline';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import EmojiPicker from './EmojiPicker';
import toast from 'react-hot-toast';
import {
  getStickerPacks, createStickerPack, uploadStickerToPack,
  getCommunityPacks, addCommunityPack, importTelegramPack,
} from '../services/api';

const StickerPicker = ({ onEmojiSelect, onStickerSelect }) => {
  const [tab, setTab] = useState('emoji');
  const [packs, setPacks] = useState([]);
  const [selectedPack, setSelectedPack] = useState(null);
  const [communityPacks, setCommunityPacks] = useState([]);
  const [addedPackIds, setAddedPackIds] = useState(new Set());
  const [newPackName, setNewPackName] = useState('');
  const [creatingPack, setCreatingPack] = useState(false);
  const [targetPackId, setTargetPackId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [telegramInput, setTelegramInput] = useState('');
  const [importing, setImporting] = useState(false);
  const [loadingCommunity, setLoadingCommunity] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    getStickerPacks().then(r => {
      const ps = r.data.packs || [];
      setPacks(ps);
      if (ps.length) { setSelectedPack(ps[0]); setTargetPackId(ps[0].id); }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === 'community' && communityPacks.length === 0) {
      setLoadingCommunity(true);
      getCommunityPacks().then(r => setCommunityPacks(r.data.packs || []))
        .catch(() => {}).finally(() => setLoadingCommunity(false));
    }
  }, [tab]);

  const handleStickerSelect = (sticker) => {
    onStickerSelect?.({ url: sticker.url, id: sticker.id, provider: 'cdn' });
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
    } catch { toast.error('Failed to create pack'); }
    finally { setCreatingPack(false); }
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length || !targetPackId) return;
    setUploading(true);
    let ok = 0;
    for (const f of files.slice(0, 5)) {
      if (f.size > 2 * 1024 * 1024) { toast.error(`${f.name} over 2 MB`); continue; }
      try { await uploadStickerToPack(targetPackId, f); ok++; } catch {}
    }
    if (ok > 0) {
      getStickerPacks().then(r => {
        const ps = r.data.packs || [];
        setPacks(ps);
        const updated = ps.find(p => p.id === targetPackId);
        if (updated) setSelectedPack(updated);
      });
    }
    setUploading(false);
  };

  const handleTelegramImport = async () => {
    if (!telegramInput.trim()) return;
    setImporting(true);
    try {
      const r = await importTelegramPack(telegramInput.trim());
      const pack = r.data.pack;
      setPacks(prev => prev.find(p => p.id === pack.id) ? prev : [pack, ...prev]);
      setSelectedPack(pack);
      setTelegramInput('');
      setTab('my');
      toast.success(`Imported "${pack.name}"`);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Import failed');
    } finally { setImporting(false); }
  };

  const handleAddCommunityPack = async (pack) => {
    try {
      await addCommunityPack(pack.id);
      setAddedPackIds(prev => new Set([...prev, pack.id]));
      setPacks(prev => prev.find(p => p.id === pack.id) ? prev : [pack, ...prev]);
    } catch {}
  };

  const TABS = [
    { id: 'emoji',     label: '😊' },
    { id: 'my',        label: '📦' },
    { id: 'create',    label: '✨' },
    { id: 'import',    label: '🔗' },
    { id: 'community', label: '🌍' },
  ];

  const currentItems = packs.find(p => p.id === selectedPack?.id)?.items || [];

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden flex flex-col"
      style={{
        // A fixed 320px popup anchored to the emoji button (absolute bottom-full
        // left-0 in the parent) can overflow past the right edge of a narrow
        // phone screen with no way to reach the rest of it. min() caps it to
        // whatever actually fits, while staying 320px on anything roomier.
        width: 'min(320px, calc(100vw - 2rem))',
        maxHeight: tab === 'emoji' ? 'min(460px, 70vh)' : 'min(380px, 60vh)',
      }}>

      {/* Tab bar */}
      <div className="flex border-b border-gray-700 flex-shrink-0">
        {TABS.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            title={{ emoji:'Emoji', my:'My Stickers', create:'Create', import:'Import', community:'Community' }[t.id]}
            className={`flex-1 py-2 text-base transition-colors ${tab === t.id ? 'bg-gray-700/60 border-b-2 border-purple-500' : 'text-gray-400 hover:bg-gray-700/30'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── EMOJI ── */}
      {tab === 'emoji' && (
        <div className="flex-1 overflow-hidden">
          <EmojiPicker onEmojiSelect={onEmojiSelect} height="100%" />
        </div>
      )}

      {/* ── MY STICKERS ── */}
      {tab === 'my' && (
        packs.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-2 py-8 text-gray-400 text-sm px-4 text-center">
            <span className="text-3xl">📦</span>
            Import a Telegram pack or create your own stickers
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            {/* Pack strip */}
            <div className="flex gap-1.5 px-2 py-1.5 border-b border-gray-700 overflow-x-auto flex-shrink-0 hide-scrollbar">
              {packs.map(pack => (
                <button key={pack.id} onClick={() => setSelectedPack(pack)}
                  className={`flex-shrink-0 rounded-lg p-1 transition-all ${selectedPack?.id === pack.id ? 'ring-2 ring-purple-500' : 'opacity-60 hover:opacity-100'}`}>
                  {pack.thumbnail_url
                    ? <img src={pack.thumbnail_url} className="w-9 h-9 object-cover rounded-md" alt={pack.name} />
                    : <div className="w-9 h-9 bg-gray-600 rounded-md flex items-center justify-center text-base">📦</div>}
                </button>
              ))}
            </div>
            {/* Sticker grid */}
            <div className="flex-1 overflow-y-auto p-1.5">
              {currentItems.length === 0
                ? <p className="text-center text-xs text-gray-400 py-6">No stickers in this pack</p>
                : (
                  <div className="grid grid-cols-4 gap-1.5">
                    {currentItems.map(sticker => (
                      <button key={sticker.id} type="button" onClick={() => handleStickerSelect(sticker)}
                        className="aspect-square rounded-lg overflow-hidden bg-gray-700/60 hover:ring-2 hover:ring-purple-500 hover:scale-105 transition-all">
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
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <div className="flex gap-1.5">
            <input value={newPackName} onChange={e => setNewPackName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreatePack()}
              placeholder="New pack name…"
              className="flex-1 px-2.5 py-1.5 text-sm bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 min-w-0" />
            <button onClick={handleCreatePack} disabled={creatingPack || !newPackName.trim()}
              className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-semibold disabled:opacity-50 hover:bg-purple-700">
              {creatingPack ? '…' : 'Create'}
            </button>
          </div>
          {packs.filter(p => p.creator_user_id != null).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {packs.filter(p => p.creator_user_id != null).map(p => (
                <button key={p.id} onClick={() => setTargetPackId(p.id)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-all ${targetPackId === p.id ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-600 text-gray-300 hover:border-purple-400'}`}>
                  {p.name}
                </button>
              ))}
            </div>
          )}
          <input ref={fileInputRef} type="file" multiple accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={handleFileUpload} />
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading || !targetPackId}
            className="w-full py-5 border-2 border-dashed border-gray-600 rounded-xl flex flex-col items-center gap-1.5 text-gray-400 hover:border-purple-500 hover:text-purple-400 transition-colors disabled:opacity-50">
            {uploading
              ? <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              : <PlusIcon className="w-6 h-6" />}
            <span className="text-xs font-medium">{uploading ? 'Uploading…' : 'Upload images'}</span>
            <span className="text-[10px] text-gray-500">PNG / WebP / GIF · max 2 MB</span>
          </button>
        </div>
      )}

      {/* ── IMPORT ── */}
      {tab === 'import' && (
        <div className="p-3 flex flex-col gap-3 flex-1">
          <p className="text-xs text-gray-400">Paste a Telegram sticker pack name or link</p>
          <div className="flex gap-1.5">
            <input value={telegramInput} onChange={e => setTelegramInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleTelegramImport()}
              placeholder="HotCherry  or  t.me/addstickers/…"
              className="flex-1 px-2.5 py-1.5 text-xs bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0" />
            <button onClick={handleTelegramImport} disabled={importing || !telegramInput.trim()}
              className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-semibold disabled:opacity-50 hover:bg-blue-600 flex items-center gap-1">
              {importing
                ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <ArrowDownTrayIcon className="w-3.5 h-3.5" />}
              {importing ? '…' : 'Import'}
            </button>
          </div>
          <p className="text-[10px] text-gray-500 leading-relaxed">Only static stickers are imported. Animated Lottie stickers are skipped.</p>
        </div>
      )}

      {/* ── COMMUNITY ── */}
      {tab === 'community' && (
        <div className="flex-1 overflow-y-auto p-2">
          {loadingCommunity ? (
            <div className="flex justify-center py-6">
              <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : communityPacks.length === 0 ? (
            <p className="text-center text-xs text-gray-400 py-6">No public packs yet</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {communityPacks.map(pack => (
                <div key={pack.id} className="bg-gray-700/60 rounded-xl p-2 flex flex-col gap-1.5">
                  {pack.thumbnail_url
                    ? <img src={pack.thumbnail_url} className="w-full aspect-square object-cover rounded-lg" alt={pack.name} />
                    : <div className="w-full aspect-square bg-gray-600 rounded-lg flex items-center justify-center text-xl">📦</div>}
                  <p className="text-[10px] font-semibold text-white truncate">{pack.name}</p>
                  <button onClick={() => handleAddCommunityPack(pack)} disabled={addedPackIds.has(pack.id)}
                    className={`text-[10px] py-1 rounded-lg font-semibold transition-colors ${addedPackIds.has(pack.id) ? 'bg-green-900/30 text-green-400' : 'bg-purple-600 text-white hover:bg-purple-700'}`}>
                    {addedPackIds.has(pack.id) ? '✓ Added' : '+ Add'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StickerPicker;
