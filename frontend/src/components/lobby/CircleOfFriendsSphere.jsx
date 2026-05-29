import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  XMarkIcon, UserPlusIcon, PencilIcon, CheckIcon, ChevronLeftIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/solid';
import { ChatBubbleLeftIcon, PhoneIcon } from '@heroicons/react/24/solid';
import Avatar from '../Avatar';

// ── CSS ───────────────────────────────────────────────────────────────────────
const SPHERE_CSS = `
  @keyframes orbitCW  { from{transform:rotate(0deg);}  to{transform:rotate(360deg);}  }
  @keyframes orbitCCW { from{transform:rotate(0deg);}  to{transform:rotate(-360deg);} }
  @keyframes cofPulse {
    0%,100%{ box-shadow:0 0 0 0    rgba(139,92,246,0.55); }
    50%    { box-shadow:0 0 0 16px rgba(139,92,246,0);    }
  }
  @keyframes cofSlideUp  { from{opacity:0;transform:translateY(14px);} to{opacity:1;transform:translateY(0);} }
  @keyframes cofStarBlink{ 0%,100%{opacity:.15;} 50%{opacity:.55;} }
  @keyframes cofDrawerIn { from{transform:translateX(-100%);} to{transform:translateX(0);} }
  @keyframes ringSpinCW  { from{transform:rotate(0deg);}  to{transform:rotate(360deg);}  }
  @keyframes ringSpinCCW { from{transform:rotate(0deg);}  to{transform:rotate(-360deg);} }
  @keyframes ringGlow {
    0%,100%{ opacity:.45; filter:drop-shadow(0 0 3px rgba(34,211,238,0));   }
    50%    { opacity:.85; filter:drop-shadow(0 0 8px rgba(34,211,238,0.4)); }
  }
  @keyframes ringPulseOuter{ 0%,100%{opacity:.25;} 50%{opacity:.55;} }
  @keyframes addBtnPop {
    0%  { transform:translate(-50%,-178px) scale(0.5); opacity:0; }
    70% { transform:translate(-50%,-178px) scale(1.15); }
    100%{ transform:translate(-50%,-178px) scale(1);   opacity:1; }
  }
  @keyframes ringSelectedPulse {
    0%,100%{ box-shadow:0 0 8px  rgba(56,189,248,0.5); }
    50%    { box-shadow:0 0 22px rgba(56,189,248,0.9); }
  }

  .cof-inner-ring { animation:orbitCW  44s linear infinite; transform-origin:center; }
  .cof-outer-ring { animation:orbitCCW 70s linear infinite; transform-origin:center; }
  .cof-face-inner { animation:orbitCCW 44s linear infinite; transform-origin:center; }
  .cof-face-outer { animation:orbitCW  70s linear infinite; transform-origin:center; }
  .cof-center-pulse{ animation:cofPulse    2.8s ease-in-out infinite; }
  .cof-slide-up   { animation:cofSlideUp  0.22s ease-out both; }
  .cof-star       { animation:cofStarBlink 2.4s ease-in-out infinite; }
  .cof-drawer     { animation:cofDrawerIn  0.28s cubic-bezier(.22,.68,0,1.2) both; }

  .cof-deco-r1{ animation:ringSpinCW  18s linear infinite, ringGlow         2.8s ease-in-out infinite; transform-origin:center; }
  .cof-deco-r2{ animation:ringSpinCCW 30s linear infinite;                                              transform-origin:center; opacity:.5; }
  .cof-deco-r3{ animation:ringSpinCW  52s linear infinite, ringPulseOuter   4s   ease-in-out infinite; transform-origin:center; }
`;

// Ring radii — keep in sync with OrbitRing usage
const R1 = 65;   // inner accent (no avatar orbit)
const R2 = 100;  // inner orbit (INNER_R)
const R3 = 170;  // outer orbit (OUTER_R)
const SZ = 370;
const CX = SZ / 2; // 185

// Distance zones for tap detection (midpoints between radii)
const ZONES = [
  { ring: 1, min: 42,  max: 82  },  // ring 1 zone
  { ring: 2, min: 83,  max: 135 },  // ring 2 zone
  { ring: 3, min: 136, max: 200 },  // ring 3 zone
];

const ringRadius = r => r === 1 ? R1 : r === 2 ? R2 : R3;

// ── OrbitRing ─────────────────────────────────────────────────────────────────
const OrbitRing = ({ members, radius, size, ringClass, faceClass, onTap, activeId, borderCls, paused }) => {
  if (!members.length) return null;
  return (
    <div className={`absolute inset-0 ${ringClass}`}
      style={{ animationPlayState: paused ? 'paused' : 'running' }}>
      {members.map((friend, i) => {
        const deg = -90 + (360 / members.length) * i;
        return (
          <div key={friend.id} className="absolute"
            style={{ left: '50%', top: '50%', transform: `translate(-50%,-50%) rotate(${deg}deg) translateX(${radius}px)` }}>
            <div className={faceClass} style={{ animationPlayState: paused ? 'paused' : 'running' }}>
              <div className="flex flex-col items-center gap-0.5">
                <button
                  onClick={e => { e.stopPropagation(); onTap(friend); }}
                  className={`rounded-full overflow-hidden flex-shrink-0 transition-transform active:scale-90 border-2 shadow-xl ${borderCls} ${activeId === friend.id ? 'scale-110 ring-2 ring-white/90' : ''}`}
                  style={{ width: size, height: size }}
                >
                  <Avatar user={friend}
                    className="w-full h-full object-cover rounded-full"
                  />
                </button>
                <span
                  className="text-white font-medium truncate pointer-events-none select-none"
                  style={{
                    fontSize: size >= 44 ? 9 : 8,
                    maxWidth: size + 14,
                    textShadow: '0 1px 3px rgba(0,0,0,0.9)',
                  }}
                >
                  {friend.username}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── Decorative ring element ───────────────────────────────────────────────────
const DecoRing = ({ r, decoClass, defaultBorder, activeBorder, hoverBorder, activeGlow, hoverGlow, isActive, isHovered, playState }) => (
  <div
    className={`${decoClass} absolute rounded-full pointer-events-none`}
    style={{
      width: r * 2, height: r * 2, left: CX - r, top: CX - r,
      border: isActive ? activeBorder : isHovered ? hoverBorder : defaultBorder,
      boxShadow: isActive ? activeGlow : isHovered ? hoverGlow : 'none',
      animationPlayState: playState,
      transition: 'border 0.15s, box-shadow 0.2s',
    }}
  />
);

// ── Main Component ────────────────────────────────────────────────────────────
const CircleOfFriendsSphere = ({
  isOpen, onClose,
  currentUser,
  friendsList   = [],
  circleMembers = [],
  onAddMember,
  onRemoveMember,
  onChatWith,
  onCallUser,
  onGroupChat,
  onStartWatchOut,
}) => {
  const [activeRing,   setActiveRing]   = useState(null); // null | 1 | 2 | 3
  const [hoverRing,    setHoverRing]    = useState(null);
  const [activeUser,   setActiveUser]   = useState(null);
  const [showAdd,      setShowAdd]      = useState(false);
  const [searchQuery,  setSearchQuery]  = useState('');
  const [editingLabel, setEditingLabel] = useState(false);
  const [groupLabel,   setGroupLabel]   = useState(
    () => localStorage.getItem('circleGroupLabel') || 'My Inner Circle'
  );
  const labelInputRef = useRef(null);

  const stars = useMemo(() =>
    Array.from({ length: 14 }, (_, i) => ({
      left:  10 + (i * 37 + 11) % 80,
      top:   10 + (i * 53 + 7)  % 80,
      delay: (i * 0.18).toFixed(2),
      size:  i % 3 === 0 ? 2.5 : 1.5,
    })), []);

  useEffect(() => {
    if (editingLabel && labelInputRef.current) labelInputRef.current.focus();
  }, [editingLabel]);

  if (!isOpen) return null;

  const INNER_MAX = 5;
  const OUTER_MAX = 9;
  const inner          = circleMembers.slice(0, INNER_MAX);
  const outer          = circleMembers.slice(INNER_MAX, INNER_MAX + OUTER_MAX);
  const availableToAdd = friendsList.filter(f => !circleMembers.find(m => m.id === f.id));
  const filteredFriends = availableToAdd.filter(f =>
    !searchQuery || f.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const closeAdd = () => { setShowAdd(false); setSearchQuery(''); };

  const saveLabel = () => {
    localStorage.setItem('circleGroupLabel', groupLabel);
    setEditingLabel(false);
  };

  const handleAvatarTap = (friend) => {
    setActiveUser(p => (p?.id === friend.id ? null : friend));
    setActiveRing(null); // deselect ring when inspecting a friend
    setShowAdd(false);
  };

  const handleRemove = (id) => {
    onRemoveMember(id);
    if (activeUser?.id === id) setActiveUser(null);
  };

  // ── Shared distance-from-center calc ─────────────────────────────────────
  const distFromCenter = (e, el) => {
    const rect = el.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width  / 2);
    const dy = e.clientY - (rect.top  + rect.height / 2);
    return Math.sqrt(dx * dx + dy * dy);
  };

  // ── Sphere tap → detect which ring zone was hit ────────────────────────────
  const handleSphereClick = e => {
    e.stopPropagation(); // prevent bubbling to handleOutsideClick
    const dist = distFromCenter(e, e.currentTarget);

    const zone = ZONES.find(z => dist >= z.min && dist <= z.max);
    if (zone) {
      setActiveRing(prev => prev === zone.ring ? null : zone.ring);
      setActiveUser(null);
      setShowAdd(false);
    } else if (dist > 200) {
      setActiveRing(null);
      setActiveUser(null);
    }
  };

  // ── Hover — highlight whichever ring the cursor is over ───────────────────
  const handleSphereMouseMove = e => {
    const dist = distFromCenter(e, e.currentTarget);
    const zone = ZONES.find(z => dist >= z.min && dist <= z.max);
    setHoverRing(zone ? zone.ring : null);
  };

  // Clicking anywhere outside the sphere (header, bottom bar, full-screen bg) resumes rings
  const handleOutsideClick = () => {
    setActiveRing(null);
    setActiveUser(null);
  };

  const WIcon = ({ size = 22 }) => (
    <img src="/icons/lwoIcon.png" alt="WatchOut" style={{ width: size, height: size }} className="object-contain" />
  );

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden select-none"
      style={{ background: 'radial-gradient(ellipse 120% 80% at 50% 0%, #1a1060 0%, #080c18 65%)' }}
      onClick={handleOutsideClick}
    >
      <style>{SPHERE_CSS}</style>

      {/* ═══ HEADER ═══════════════════════════════════════════════════════════ */}
      <div
        className="relative flex-shrink-0 pb-3"
        style={{ background: 'linear-gradient(180deg, rgba(26,16,96,0.95) 0%, transparent 100%)' }}
        onClick={e => e.stopPropagation()} // header clicks don't reset rings
      >
        <div className="flex items-center px-3 pt-10 pb-1">
          <button onClick={onClose}
            className="p-2 rounded-full text-white/70 hover:bg-white/10 transition-colors active:scale-90 flex-shrink-0">
            <ChevronLeftIcon className="w-6 h-6" />
          </button>
          <div className="flex-1 text-center">
            <h2 className="text-white text-2xl font-bold tracking-tight leading-none">Circle of Friends</h2>
          </div>
          <div className="w-10 flex-shrink-0" />
        </div>

        {/* Editable group label */}
        <div className="flex items-center justify-center gap-1.5 px-6 mt-0.5">
          {editingLabel ? (
            <div className="flex items-center gap-2">
              <input
                ref={labelInputRef}
                value={groupLabel}
                onChange={e => setGroupLabel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveLabel()}
                maxLength={32}
                className="bg-white/10 text-white text-sm text-center rounded-lg px-3 py-1 outline-none border border-purple-400/60 w-48"
              />
              <button onClick={saveLabel}
                className="p-1.5 rounded-full bg-purple-600/80 text-white active:scale-90">
                <CheckIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button onClick={() => setEditingLabel(true)} className="flex items-center gap-1.5 group">
              <span className="text-white/50 text-xs font-medium">{groupLabel}</span>
              <PencilIcon className="w-3 h-3 text-white/25 group-hover:text-white/60 transition-colors" />
            </button>
          )}
        </div>

        {/* Stacked mini-avatars */}
        {circleMembers.length > 0 && (
          <div className="flex justify-center mt-2">
            <div className="flex items-center -space-x-2">
              {circleMembers.slice(0, 6).map(m => (
                <Avatar key={m.id} user={m} size={26}
                  className="rounded-full border-2 border-[#080c18] shadow-sm" />
              ))}
              {circleMembers.length > 6 && (
                <div className="w-7 h-7 rounded-full border-2 border-[#080c18] bg-white/15 flex items-center justify-center">
                  <span className="text-white text-[9px] font-bold">+{circleMembers.length - 6}</span>
                </div>
              )}
              <span className="ml-2.5 text-white/35 text-xs">{circleMembers.length} in orbit</span>
            </div>
          </div>
        )}
      </div>

      {/* ═══ SPHERE ═══════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden">
        {stars.map((s, i) => (
          <div key={i} className="cof-star absolute rounded-full bg-white pointer-events-none"
            style={{ width: s.size, height: s.size, left: `${s.left}%`, top: `${s.top}%`, animationDelay: `${s.delay}s` }} />
        ))}

        {/* Ring-stopped hint */}
        {activeRing !== null && (
          <div className="absolute top-2 left-0 right-0 flex justify-center pointer-events-none">
            <span className="text-cyan-300/70 text-xs font-medium tracking-wide">
              Tap <span className="text-white/90">＋</span> to add a friend to this orbit
            </span>
          </div>
        )}

        <div
          className="relative cursor-pointer"
          style={{ width: SZ, height: SZ }}
          onClick={handleSphereClick}
          onMouseMove={handleSphereMouseMove}
          onMouseLeave={() => setHoverRing(null)}
        >
          {/* ── Decorative concentric rings ── */}
          <DecoRing
            r={R1} decoClass="cof-deco-r1"
            defaultBorder="2px solid rgba(34,211,238,0.5)"
            hoverBorder="2.5px solid rgba(34,211,238,0.85)"
            activeBorder="3px solid rgba(34,211,238,1)"
            hoverGlow="0 0 10px rgba(34,211,238,0.35)"
            activeGlow="0 0 18px rgba(34,211,238,0.7)"
            isActive={activeRing === 1}
            isHovered={hoverRing === 1 && activeRing !== 1}
            playState={activeRing === 1 ? 'paused' : 'running'}
          />
          <DecoRing
            r={R2} decoClass="cof-deco-r2"
            defaultBorder="2px dashed rgba(56,189,248,0.5)"
            hoverBorder="2.5px dashed rgba(56,189,248,0.85)"
            activeBorder="3px dashed rgba(56,189,248,1)"
            hoverGlow="0 0 10px rgba(56,189,248,0.35)"
            activeGlow="0 0 20px rgba(56,189,248,0.65)"
            isActive={activeRing === 2}
            isHovered={hoverRing === 2 && activeRing !== 2}
            playState={activeRing === 2 ? 'paused' : 'running'}
          />
          <DecoRing
            r={R3} decoClass="cof-deco-r3"
            defaultBorder="2px dashed rgba(139,92,246,0.4)"
            hoverBorder="2.5px dashed rgba(167,139,250,0.8)"
            activeBorder="3px dashed rgba(167,139,250,1)"
            hoverGlow="0 0 10px rgba(139,92,246,0.35)"
            activeGlow="0 0 20px rgba(139,92,246,0.7)"
            isActive={activeRing === 3}
            isHovered={hoverRing === 3 && activeRing !== 3}
            playState={activeRing === 3 ? 'paused' : 'running'}
          />

          {/* ── Outer orbit ── */}
          <OrbitRing
            members={outer} radius={R3} size={38}
            ringClass="cof-outer-ring" faceClass="cof-face-outer"
            onTap={handleAvatarTap} activeId={activeUser?.id}
            borderCls="border-purple-400/55"
            paused={activeRing === 3}
          />

          {/* ── Inner orbit ── */}
          <OrbitRing
            members={inner} radius={R2} size={46}
            ringClass="cof-inner-ring" faceClass="cof-face-inner"
            onTap={handleAvatarTap} activeId={activeUser?.id}
            borderCls="border-cyan-400/80"
            paused={activeRing === 1 || activeRing === 2}
          />

          {/* ── Add-friend button — appears on the stopped ring at 12 o'clock ── */}
          {activeRing !== null && (
            <div
              key={activeRing}
              className="absolute z-20"
              style={{
                left: '50%',
                top: '50%',
                // Position at the top of the active ring
                transform: `translate(-50%, calc(-50% - ${ringRadius(activeRing)}px))`,
                animation: 'addBtnPop 0.32s cubic-bezier(.34,1.56,.64,1) both',
              }}
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={() => { if (showAdd) closeAdd(); else setShowAdd(true); }}
                title="Add a friend to this orbit"
                className={`w-10 h-10 rounded-full flex items-center justify-center shadow-xl border-2 transition-all active:scale-90
                  ${showAdd
                    ? 'bg-purple-600 border-purple-300 scale-110'
                    : 'bg-gray-900/90 border-cyan-300/80 hover:bg-purple-700/80 hover:border-purple-300'
                  }`}
              >
                <UserPlusIcon className="w-5 h-5 text-white" />
              </button>
            </div>
          )}

          {/* ── Center user ── */}
          <div
            className="cof-center-pulse absolute rounded-full"
            style={{ width: 82, height: 82, left: CX - 41, top: CX - 41 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="w-full h-full rounded-full ring-2 ring-purple-500/50 overflow-hidden">
              <Avatar user={currentUser} size={82} className="rounded-full" />
            </div>
          </div>

          {/* Empty hint */}
          {circleMembers.length === 0 && activeRing === null && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="text-white/20 text-xs text-center mt-24 leading-relaxed px-14">
                Tap a ring to freeze it,<br />then add friends to that orbit
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ═══ ACTIVE USER STRIP ════════════════════════════════════════════════ */}
      {activeUser && (
        <div
          className="cof-slide-up mx-4 mb-2 p-3 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 flex items-center gap-3"
          onClick={e => e.stopPropagation()}
        >
          <Avatar user={activeUser} size={42}
            className="rounded-full flex-shrink-0 border-2 border-purple-400/60" />
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm truncate">@{activeUser.username}</p>
            <p className="text-white/40 text-[11px]">In your circle</p>
          </div>
          <button onClick={() => { onChatWith(activeUser); onClose(); }}
            className="p-2.5 rounded-full bg-purple-600/80 text-white hover:bg-purple-600 active:scale-90 transition-colors">
            <ChatBubbleLeftIcon className="w-4 h-4" />
          </button>
          <button onClick={() => { onCallUser(activeUser); onClose(); }}
            className="p-2.5 rounded-full bg-green-600/80 text-white hover:bg-green-600 active:scale-90 transition-colors">
            <PhoneIcon className="w-4 h-4" />
          </button>
          <button onClick={() => handleRemove(activeUser.id)}
            className="p-2.5 rounded-full bg-white/10 text-red-400 hover:bg-red-500/20 active:scale-90 transition-colors">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ═══ BOTTOM 3-ICON ACTION ROW ════════════════════════════════════════ */}
      <div
        className="flex justify-center gap-10 px-6 pb-10 pt-2 flex-shrink-0"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={() => onStartWatchOut(circleMembers.map(m => m.id))}
          disabled={circleMembers.length === 0}
          className="flex flex-col items-center gap-1.5 group disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <div className="w-14 h-14 flex items-center justify-center transition-transform group-active:scale-90 group-hover:scale-105">
            <WIcon size={48} />
          </div>
          <span className="text-white/60 text-[10px] font-semibold uppercase tracking-wider">WatchOut</span>
        </button>

        <button
          onClick={() => { if (circleMembers.length) { onCallUser(circleMembers[0]); onClose(); } }}
          disabled={circleMembers.length === 0}
          className="flex flex-col items-center gap-1.5 group disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-transform group-active:scale-90 group-hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #059669, #0891b2)' }}>
            <PhoneIcon className="w-7 h-7 text-white" />
          </div>
          <span className="text-white/60 text-[10px] font-semibold uppercase tracking-wider">Call</span>
        </button>

        <button
          onClick={() => { if (circleMembers.length) { onGroupChat(circleMembers); onClose(); } }}
          disabled={circleMembers.length === 0}
          className="flex flex-col items-center gap-1.5 group disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-transform group-active:scale-90 group-hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #2563eb, #7c3aed)' }}>
            <ChatBubbleLeftIcon className="w-7 h-7 text-white" />
          </div>
          <span className="text-white/60 text-[10px] font-semibold uppercase tracking-wider">Group Chat</span>
        </button>
      </div>

      {/* ═══ ADD-FRIENDS LEFT DRAWER ══════════════════════════════════════════ */}
      {showAdd && (
        <>
          <div
            className="fixed inset-0 z-10 bg-black/50"
            onClick={e => { e.stopPropagation(); closeAdd(); }}
          />
          <div className="cof-drawer fixed inset-y-0 left-0 z-20 flex flex-col"
            style={{ width: '85%', maxWidth: 360, background: 'linear-gradient(160deg, #12103a 0%, #0b0f1e 100%)' }}>

            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 pt-12 pb-3 border-b border-white/[0.08] flex-shrink-0">
              <div>
                <h3 className="text-white font-bold text-base">Add to Circle</h3>
                <p className="text-white/40 text-xs mt-0.5">
                  {availableToAdd.length} friend{availableToAdd.length !== 1 ? 's' : ''} available
                </p>
              </div>
              <button onClick={closeAdd}
                className="p-2 rounded-full bg-white/10 text-white/60 hover:bg-white/20 active:scale-90">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Search bar */}
            <div className="px-3 py-2.5 border-b border-white/[0.06] flex-shrink-0">
              <div className="flex items-center gap-2 bg-white/[0.08] rounded-xl px-3 py-2.5">
                <MagnifyingGlassIcon className="w-4 h-4 text-white/40 flex-shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search friends…"
                  className="flex-1 bg-transparent text-white text-sm placeholder-white/30 outline-none"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="text-white/40 hover:text-white/70">
                    <XMarkIcon className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Friend list — same card style as chat tab */}
            <div className="flex-1 overflow-y-auto">
              {filteredFriends.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-center px-8">
                  <p className="text-white/30 text-sm">
                    {availableToAdd.length === 0
                      ? (friendsList.length === 0
                          ? 'No friends yet. Connect with people first!'
                          : 'All your friends are already in your circle 🎉')
                      : 'No results found'}
                  </p>
                </div>
              ) : (
                filteredFriends.map(friend => (
                  <button
                    key={friend.id}
                    onClick={() => onAddMember(friend)}
                    className="w-full px-3 py-3 flex items-center gap-3 hover:bg-white/[0.08] active:bg-white/[0.12] transition-colors border-b border-white/[0.05] text-left"
                  >
                    {/* Avatar — matches chat tab size + ring */}
                    <div className="relative flex-shrink-0">
                      <div className="w-14 h-14 rounded-full overflow-hidden ring-2 ring-white/20 bg-gradient-to-br from-purple-500 to-blue-600">
                        <Avatar user={friend} size={56} className="w-full h-full object-cover" />
                      </div>
                      {/* Purple dot = not yet in circle */}
                      <div className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full border-2 bg-purple-400"
                        style={{ borderColor: '#0b0f1e' }} />
                    </div>

                    {/* Name */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-base text-white truncate leading-tight">
                        {friend.username}
                      </p>
                      {friend.display_name && friend.display_name !== friend.username && (
                        <p className="text-white/40 text-sm truncate leading-tight">{friend.display_name}</p>
                      )}
                    </div>

                    {/* Add indicator */}
                    <div className="w-8 h-8 rounded-full border-2 border-purple-500/70 bg-purple-500/15 flex items-center justify-center flex-shrink-0">
                      <UserPlusIcon className="w-4 h-4 text-purple-300" />
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default CircleOfFriendsSphere;
