import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import GameWinnerBanner from './GameWinnerBanner';
import GameRulesButton from './GameRulesButton';

// Hide & Seek — real-time, N-player (2-8) hidden-role game. Unlike every
// other real-time game in this package, this one needs NO canvas/physics
// loop at all: gameplay is a discrete "pick one of 10 fixed spots" choice
// (see hide_seek.go's file-level note on why continuous-position hiding
// was deliberately scoped out), so the whole UI is a simple spot-picker
// grid — the right fit for what the actual gameplay is, not a missed
// opportunity to build something fancier.
const SPOT_COUNT = 10;
const SPOT_ICONS = ['🪑', '📦', '🛋️', '🚪', '🪴', '🖼️', '🗄️', '🚽', '🛁', '🪞'];

function roleOf(index, total) {
  const numHunters = Math.max(1, Math.floor(total / 4));
  return index < numHunters ? 'hunter' : 'prop';
}

export default function HideSeekGame({ gameState, players, currentUserId, onMove, onClose, onEndGame, onPostResult, gameErrorMsg, gameErrorKey }) {
  const gs = gameState?.game_state || {};
  const phase = gs.phase || 'hiding';
  const isEnded = phase === 'ended' || gameState?.status === 'completed' || gameState?.status === 'forfeited';
  const myId = String(currentUserId);

  const orderedPlayers = useMemo(() => players || [], [players]);
  const myIndex = orderedPlayers.findIndex((p) => String(p.user_id) === myId);
  const isPlayer = myIndex >= 0;
  const myRole = myIndex >= 0 ? roleOf(myIndex, orderedPlayers.length) : null;
  const numHunters = Math.max(1, Math.floor(orderedPlayers.length / 4));
  const numProps = orderedPlayers.length - numHunters;

  const foundProps = useMemo(() => (gs.found_props || []).map(Number), [gs.found_props]);
  const iWasFound = foundProps.includes(Number(currentUserId));
  const hiddenCount = Number(gs.hidden_count ?? 0);
  const lastSearch = gs.last_search;

  const [mySpot, setMySpot] = useState(null); // remembered locally after a successful hide_at
  const [hideError, setHideError] = useState(null);
  const [searchedSpots, setSearchedSpots] = useState({}); // spot_id -> { hit, hunterName } — built up locally from the last_search stream
  const [foundToast, setFoundToast] = useState(null);
  const lastSearchSeenRef = useRef(null);
  const prevFoundCountRef = useRef(foundProps.length);
  const lastHandledErrorKeyRef = useRef(gameErrorKey);

  // Surface a rejected hide_at (most commonly "that spot is already taken",
  // the one genuinely common rejection in this game — unlike the other
  // real-time games in this batch, a Prop has no client-side way to know
  // which spots are already occupied, so this feedback loop matters more
  // here than elsewhere.
  useEffect(() => {
    if (gameErrorKey === lastHandledErrorKeyRef.current) return;
    lastHandledErrorKeyRef.current = gameErrorKey;
    if (!gameErrorMsg) return;
    setHideError(gameErrorMsg);
    if (/already taken/i.test(gameErrorMsg)) setMySpot(null); // the optimistic guess was wrong — let them pick again
    const t = setTimeout(() => setHideError(null), 3500);
    return () => clearTimeout(t);
  }, [gameErrorKey, gameErrorMsg]);

  // Accumulate the running "already searched" map from each new last_search
  // event — last_search itself is only ever the single most recent one.
  useEffect(() => {
    if (!lastSearch) return;
    const key = `${lastSearch.spot_id}-${lastSearch.hunter_id}-${lastSearch.hit}`;
    if (lastSearchSeenRef.current === key) return;
    lastSearchSeenRef.current = key;
    setSearchedSpots((prev) => ({ ...prev, [lastSearch.spot_id]: { hit: lastSearch.hit } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(lastSearch)]);

  // Toast when a new prop is found (for everyone, including that prop
  // themselves — a shared, spectacle-y reveal moment).
  useEffect(() => {
    if (foundProps.length > prevFoundCountRef.current) {
      const newestId = foundProps[foundProps.length - 1];
      const p = orderedPlayers.find((pp) => Number(pp.user_id) === newestId);
      setFoundToast(`😱 ${p?.username || 'A prop'} was found!`);
      const t = setTimeout(() => setFoundToast(null), 3000);
      return () => clearTimeout(t);
    }
    prevFoundCountRef.current = foundProps.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foundProps.length]);

  const handleHide = (spotId) => {
    setHideError(null);
    onMove({ move_type: 'hide_at', spot_id: spotId });
    setMySpot(spotId); // optimistic — a rejection (already taken) will just leave mySpot wrong until corrected by a retry
  };
  const handleSearch = (spotId) => {
    onMove({ move_type: 'search_spot', spot_id: spotId });
  };
  const handleForfeit = () => {
    onEndGame?.();
    onClose?.();
  };

  const winnerRole = gameState?.winner_id != null
    ? (() => {
        const idx = orderedPlayers.findIndex((p) => String(p.user_id) === String(gameState.winner_id));
        return idx >= 0 ? roleOf(idx, orderedPlayers.length) : null;
      })()
    : null;

  if (!isPlayer) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="bg-gray-900 rounded-2xl p-8 text-center max-w-sm mx-4">
          <div className="text-5xl mb-4">🙈</div>
          <h2 className="text-white text-xl font-bold mb-2">Hide &amp; Seek</h2>
          <p className="text-gray-400 text-sm mb-4">Spectating this match!</p>
          <button onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        <span className="text-white font-bold text-sm">🙈 Hide &amp; Seek</span>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-bold ${myRole === 'hunter' ? 'text-red-400' : 'text-blue-400'}`}>
            {myRole === 'hunter' ? '🔦 Hunter' : '📦 Prop'}
          </span>
          <GameRulesButton gameType="hide_seek" />
          <button onClick={handleForfeit} className="text-gray-400 hover:text-white" title="End Match">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-6 flex flex-col items-center">
        {foundToast && (
          <div className="mb-3 px-4 py-2 bg-red-600/80 text-white rounded-lg text-sm font-semibold animate-pulse">
            {foundToast}
          </div>
        )}

        {phase === 'hiding' && myRole === 'prop' && !mySpot && (
          <p className="text-gray-300 text-sm mb-4 text-center max-w-sm">
            Pick a hiding spot below! You can change your mind until every prop has chosen.
          </p>
        )}
        {phase === 'hiding' && myRole === 'prop' && mySpot != null && (
          <p className="text-blue-300 text-sm mb-4 text-center max-w-sm">
            You're hiding at {SPOT_ICONS[mySpot]} spot {mySpot + 1}. Waiting for the other props ({hiddenCount}/{numProps})...
          </p>
        )}
        {phase === 'hiding' && myRole === 'hunter' && (
          <p className="text-gray-300 text-sm mb-4 text-center max-w-sm">
            Props are hiding — {hiddenCount}/{numProps} ready. The hunt begins automatically once everyone's hidden!
          </p>
        )}
        {phase === 'hunting' && myRole === 'hunter' && !isEnded && (
          <p className="text-red-300 text-sm mb-4 text-center max-w-sm">
            The hunt is on! Tap a spot to search it.
          </p>
        )}
        {phase === 'hunting' && myRole === 'prop' && !iWasFound && !isEnded && (
          <p className="text-blue-300 text-sm mb-4 text-center max-w-sm">
            Stay hidden at {mySpot != null ? `${SPOT_ICONS[mySpot]} spot ${mySpot + 1}` : 'your spot'} — the hunters are searching!
          </p>
        )}
        {iWasFound && !isEnded && (
          <p className="text-red-400 text-sm mb-4 text-center max-w-sm font-bold">
            💥 You were found! Watching the rest of the round...
          </p>
        )}

        <div className="grid grid-cols-5 gap-3 max-w-lg w-full">
          {Array.from({ length: SPOT_COUNT }).map((_, spotId) => {
            const searched = searchedSpots[spotId];
            const isMine = mySpot === spotId;
            const canHide = myRole === 'prop' && phase === 'hiding' && !isEnded;
            const canSearch = myRole === 'hunter' && phase === 'hunting' && !isEnded;
            const clickable = canHide || canSearch;
            let bg = 'bg-gray-800 hover:bg-gray-700';
            if (isMine) bg = 'bg-blue-600/40 border-2 border-blue-400';
            if (searched?.hit) bg = 'bg-red-600/50 border-2 border-red-400';
            else if (searched && !searched.hit) bg = 'bg-gray-900 opacity-50';

            return (
              <button
                key={spotId}
                disabled={!clickable}
                onClick={() => (canHide ? handleHide(spotId) : canSearch ? handleSearch(spotId) : undefined)}
                className={`aspect-square rounded-xl flex flex-col items-center justify-center text-3xl transition-colors ${bg} ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <span>{SPOT_ICONS[spotId]}</span>
                <span className="text-[10px] text-gray-400 mt-1">#{spotId + 1}</span>
              </button>
            );
          })}
        </div>

        {hideError && <p className="text-red-400 text-xs mt-3">{hideError}</p>}

        {foundProps.length > 0 && (
          <div className="mt-6 text-xs text-gray-400 text-center">
            Found so far: {foundProps.map((id) => orderedPlayers.find((p) => Number(p.user_id) === id)?.username || id).join(', ')}
          </div>
        )}
      </div>

      {isEnded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <GameWinnerBanner
            winner={winnerRole ? { username: winnerRole === 'hunter' ? 'The Hunters' : 'The Props' } : null}
            gameType="hide_seek"
            gameStats={{
              lines: [
                { label: 'Props found', value: `${foundProps.length}/${numProps}` },
              ],
            }}
            isForfeit={gameState?.status === 'forfeited'}
            onClose={onClose}
            onPostResult={onPostResult}
          />
        </div>
      )}
    </div>
  );
}
