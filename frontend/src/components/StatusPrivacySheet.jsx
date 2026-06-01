import React, { useState, useEffect } from 'react';
import { getStatusPrivacy, updateStatusPrivacy } from '../services/api';

// Bottom sheet that shows all friends.
// All friends are TICKED (can see) by default.
// Unticking a friend adds them to the exclusion list — they won't see future statuses.
//
// Props:
//   friendsList  – array of friend objects { id, username, avatar_url }
//   onClose      – fn()
export default function StatusPrivacySheet({ friendsList = [], onClose }) {
  const [excludedIds, setExcludedIds] = useState(new Set());
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [search, setSearch]           = useState('');

  useEffect(() => {
    getStatusPrivacy()
      .then(data => setExcludedIds(new Set(data.excluded_ids || [])))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id) => {
    setExcludedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateStatusPrivacy([...excludedIds]);
      onClose();
    } catch (err) {
      console.error('[StatusPrivacy] save error:', err);
    } finally {
      setSaving(false);
    }
  };

  const filtered = friendsList.filter(f =>
    f.username?.toLowerCase().includes(search.toLowerCase())
  );

  const excludedCount = excludedIds.size;

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-end justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 rounded-t-2xl w-full max-w-lg border border-white/10 flex flex-col"
        style={{ maxHeight: '80vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/10 flex-shrink-0">
          <div>
            <h3 className="text-white font-semibold text-base">Status Privacy</h3>
            <p className="text-gray-400 text-xs mt-0.5">
              {excludedCount === 0
                ? 'All friends can see your status'
                : `Hidden from ${excludedCount} friend${excludedCount > 1 ? 's' : ''}`}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        {/* Search */}
        <div className="px-4 py-2 flex-shrink-0">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search friends…"
            className="w-full bg-white/5 border border-white/10 text-white text-sm px-3 py-2 rounded-lg placeholder:text-gray-500 outline-none"
          />
        </div>

        {/* Friend list */}
        <div className="overflow-y-auto flex-1 px-4 pb-2">
          {loading ? (
            <p className="text-center text-gray-500 text-sm py-8">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-gray-500 text-sm py-8 italic">No friends found</p>
          ) : (
            filtered.map(friend => {
              const excluded = excludedIds.has(friend.id);
              return (
                <button
                  key={friend.id}
                  onClick={() => toggle(friend.id)}
                  className="w-full flex items-center gap-3 py-2.5 px-1 rounded-lg hover:bg-white/5 transition-colors"
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-purple-600 to-blue-600 flex-shrink-0">
                    {friend.avatar_url ? (
                      <img
                        src={friend.avatar_url}
                        alt={friend.username}
                        className="w-full h-full object-cover"
                        onError={e => { e.target.src = '/icons/user1avatar.svg'; }}
                      />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center text-white font-bold text-sm">
                        {friend.username?.[0]?.toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* Name */}
                  <span className="flex-1 text-left text-white text-sm font-medium truncate">
                    @{friend.username}
                  </span>

                  {/* Tick / cross indicator */}
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-colors ${
                    excluded
                      ? 'border-red-500 bg-red-500/20'
                      : 'border-purple-500 bg-purple-600'
                  }`}>
                    {excluded ? (
                      // X — hidden from this friend
                      <svg className="w-3 h-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    ) : (
                      // Tick — visible to this friend
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Save */}
        <div className="px-5 pt-3 pb-6 border-t border-white/10 flex-shrink-0">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-all"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
