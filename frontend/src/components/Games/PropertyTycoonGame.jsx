import { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import GameWinnerBanner from './GameWinnerBanner';
import GameRulesButton from './GameRulesButton';

// Mirrors backend/internal/handlers/games/property_tycoon.go's ptBoard
// exactly — original names/theme, same structural layout as a classic
// property-trading board (functional design, not tied to any one game's
// branding). Cosmetic only; the server is fully authoritative.
const BOARD = [
  { name: 'GO', type: 'go' },
  { name: 'Riverside Lane', type: 'property', group: 'brown', price: 60 },
  { name: 'City Fund', type: 'community_chest' },
  { name: 'Dockside Alley', type: 'property', group: 'brown', price: 60 },
  { name: 'Income Tax', type: 'tax' },
  { name: 'North Station', type: 'railroad', price: 200 },
  { name: 'Maple Street', type: 'property', group: 'lightblue', price: 100 },
  { name: 'Fortune', type: 'chance' },
  { name: 'Elm Street', type: 'property', group: 'lightblue', price: 100 },
  { name: 'Cedar Street', type: 'property', group: 'lightblue', price: 120 },
  { name: 'Jail', type: 'jail' },
  { name: 'Sunset Boulevard', type: 'property', group: 'pink', price: 140 },
  { name: 'Power Plant', type: 'utility', price: 150 },
  { name: 'Harbor View', type: 'property', group: 'pink', price: 140 },
  { name: 'Marina Walk', type: 'property', group: 'pink', price: 160 },
  { name: 'South Station', type: 'railroad', price: 200 },
  { name: 'Central Plaza', type: 'property', group: 'orange', price: 180 },
  { name: 'City Fund', type: 'community_chest' },
  { name: 'Market Square', type: 'property', group: 'orange', price: 180 },
  { name: 'Union Court', type: 'property', group: 'orange', price: 200 },
  { name: 'Free Parking', type: 'free_parking' },
  { name: 'Highland Ave', type: 'property', group: 'red', price: 220 },
  { name: 'Fortune', type: 'chance' },
  { name: 'Ridgeway Drive', type: 'property', group: 'red', price: 220 },
  { name: 'Summit Road', type: 'property', group: 'red', price: 240 },
  { name: 'East Terminal', type: 'railroad', price: 200 },
  { name: 'Golden Gate Row', type: 'property', group: 'yellow', price: 260 },
  { name: 'Silver Creek', type: 'property', group: 'yellow', price: 260 },
  { name: 'Water Utility', type: 'utility', price: 150 },
  { name: 'Amber Heights', type: 'property', group: 'yellow', price: 280 },
  { name: 'Go To Jail', type: 'go_to_jail' },
  { name: 'Emerald District', type: 'property', group: 'green', price: 300 },
  { name: 'Jade Terrace', type: 'property', group: 'green', price: 300 },
  { name: 'City Fund', type: 'community_chest' },
  { name: 'Crystal Park', type: 'property', group: 'green', price: 320 },
  { name: 'West Terminal', type: 'railroad', price: 200 },
  { name: 'Fortune', type: 'chance' },
  { name: 'Skyline Tower', type: 'property', group: 'darkblue', price: 350 },
  { name: 'Luxury Tax', type: 'tax' },
  { name: 'Grand Plaza', type: 'property', group: 'darkblue', price: 400 },
];

const GROUP_COLORS = {
  brown: '#7c4a1e', lightblue: '#a8d8f0', pink: '#e91e8c', orange: '#f5871f',
  red: '#e53e3e', yellow: '#f6e05e', green: '#38a169', darkblue: '#2b6cb0',
};

const PLAYER_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316'];

function spaceGridPos(i) {
  if (i <= 10) return { row: 11, col: 11 - i };
  if (i <= 20) return { row: 11 - (i - 10), col: 1 };
  if (i <= 30) return { row: 1, col: 1 + (i - 20) };
  return { row: 1 + (i - 30), col: 11 };
}

const TYPE_ICON = { go: '➡️', jail: '🚔', free_parking: '🅿️', go_to_jail: '👮', chance: '❔', community_chest: '📦', tax: '💰' };

function Space({ index, space, owner, houses, positions, onClick, isCorner }) {
  const isProperty = space.type === 'property';
  const groupColor = isProperty ? GROUP_COLORS[space.group] : null;
  const here = positions.filter(p => p.pos === index);

  return (
    <div
      onClick={onClick}
      className="relative flex flex-col overflow-hidden cursor-pointer"
      style={{
        background: '#1e293b',
        border: '1px solid #334155',
        minWidth: 0, minHeight: 0,
      }}
    >
      {groupColor && <div style={{ height: isCorner ? 0 : '18%', background: groupColor, flexShrink: 0 }} />}
      <div className="flex-1 flex flex-col items-center justify-center px-0.5 text-center overflow-hidden">
        {!isProperty && !isCorner && <span style={{ fontSize: '55%' }}>{TYPE_ICON[space.type] || ''}</span>}
        {isCorner && <span style={{ fontSize: '110%' }}>{TYPE_ICON[space.type] || '⭐'}</span>}
        <span className="text-white font-semibold leading-tight" style={{ fontSize: isCorner ? '60%' : '48%' }}>
          {space.name}
        </span>
        {owner !== -1 && owner !== undefined && (
          <div className="flex items-center gap-0.5 mt-0.5">
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: PLAYER_COLORS[owner] }} />
            {houses > 0 && houses < 5 && <span style={{ fontSize: '45%' }}>{'🏠'.repeat(houses)}</span>}
            {houses === 5 && <span style={{ fontSize: '50%' }}>🏨</span>}
          </div>
        )}
      </div>
      {here.length > 0 && (
        <div className="absolute bottom-0.5 right-0.5 flex gap-0.5">
          {here.map((p, i) => (
            <span key={i} style={{
              width: 8, height: 8, borderRadius: '50%',
              background: PLAYER_COLORS[p.idx], border: '1px solid white',
            }} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function PropertyTycoonGame({ gameState, players, currentUserId, onMove, onClose, onEndGame, onPostResult, onPlayAgain }) {
  const gs = gameState?.game_state || {};
  const cash = gs.cash || {};
  const positionsMap = gs.positions || {};
  const properties = gs.properties || {};
  const jail = gs.jail || {};
  const getOutFree = gs.get_out_free || {};
  const bankrupt = gs.bankrupt || {};
  const dice = gs.dice || [];
  const awaitingRoll = gs.awaiting_roll !== false;
  const pendingPurchase = gs.pending_purchase;
  const lastEvent = gs.last_event || '';

  const isOver = ['finished', 'completed', 'forfeited'].includes(gameState?.status || '');
  const currentTurnIdx = gameState?.current_turn ?? 0;
  const currentTurnPlayer = players?.[currentTurnIdx];
  const isMyTurn = !isOver && currentTurnPlayer?.user_id === currentUserId;
  const myIdx = players.findIndex(p => p.user_id === currentUserId);

  const [showBuild, setShowBuild] = useState(false);

  const positions = useMemo(
    () => players.map((p, i) => ({ idx: i, pos: positionsMap[String(i)] ?? 0 })),
    [players, positionsMap]
  );

  const myInJail = jail[String(myIdx)]?.in_jail || false;
  const myJailCards = getOutFree[String(myIdx)] || 0;

  const pendingSpace = pendingPurchase !== null && pendingPurchase !== undefined ? BOARD[pendingPurchase] : null;

  const myBuildableProperties = useMemo(() => {
    if (myIdx < 0) return [];
    const groupCounts = {};
    const groupOwned = {};
    BOARD.forEach((s, i) => {
      if (s.type !== 'property') return;
      groupCounts[s.group] = (groupCounts[s.group] || 0) + 1;
      const p = properties[String(i)];
      if (p && p.owner === myIdx) {
        groupOwned[s.group] = (groupOwned[s.group] || 0) + 1;
      }
    });
    return BOARD.map((s, i) => ({ s, i })).filter(({ s, i }) => {
      if (s.type !== 'property') return false;
      const p = properties[String(i)];
      if (!p || p.owner !== myIdx) return false;
      if ((p.houses || 0) >= 5) return false;
      return groupOwned[s.group] === groupCounts[s.group];
    });
  }, [properties, myIdx]);

  const winner = gameState?.winner_id
    ? (players.find(p => p.user_id === gameState.winner_id) || 'draw')
    : 'draw';
  const gameStats = {
    lines: players.map((p, i) => ({
      label: p.username,
      value: bankrupt[String(i)] ? 'Bankrupt' : `$${cash[String(i)] ?? 0}`,
    })),
  };

  const endOrLeave = () => {
    const isHostUser = (gameState?.host_id ?? players?.[0]?.user_id) === currentUserId;
    if (isHostUser && onEndGame) onEndGame();
    else onClose();
  };

  const rollDice = () => onMove({ move_type: 'roll' });
  const buy = () => onMove({ move_type: 'buy' });
  const decline = () => onMove({ move_type: 'decline' });
  const build = (space) => { onMove({ move_type: 'build', space }); setShowBuild(false); };
  const payFine = () => onMove({ move_type: 'pay_jail_fine' });
  const useCard = () => onMove({ move_type: 'use_jail_card' });

  return (
    <>
      {isOver && (
        <GameWinnerBanner
          winner={winner === 'draw' ? null : winner}
          players={players}
          gameType="property_tycoon"
          gameStats={gameStats}
          isForfeit={gameState?.status === 'forfeited'}
          onClose={onClose}
          onPostResult={onPostResult}
          secondaryAction={(gameState?.host_id ?? players?.[0]?.user_id) === currentUserId && onPlayAgain ? { label: 'Play Again 🔄', onClick: onPlayAgain } : undefined}
        />
      )}

      <div className="fixed inset-0 z-50 flex flex-col bg-gray-950">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900 border-b border-gray-800 flex-shrink-0">
          <span className="text-white font-bold text-lg">Property Tycoon</span>
          <div className="flex items-center gap-2">
            <GameRulesButton gameType="property_tycoon" className="text-gray-400 hover:text-white" />
            {!isOver && (
              <button onClick={endOrLeave} className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors">
                End Game
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-white p-1"><X size={18} /></button>
          </div>
        </div>

        {/* Player status row */}
        <div className="flex gap-2 px-4 py-2 overflow-x-auto bg-gray-900/50 border-b border-gray-800 flex-shrink-0">
          {players.map((p, i) => {
            const isTheirTurn = currentTurnPlayer?.user_id === p.user_id;
            const isBankrupt = bankrupt[String(i)];
            return (
              <div key={p.user_id} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs flex-shrink-0
                ${isBankrupt ? 'opacity-40' : isTheirTurn ? 'bg-purple-800/60 ring-1 ring-purple-400' : 'bg-gray-800/50'}`}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: PLAYER_COLORS[i] }} />
                <span className="text-gray-300 font-semibold">{p.username}</span>
                <span className="text-green-400 font-bold">{isBankrupt ? 'Bankrupt' : `$${cash[String(i)] ?? 0}`}</span>
                {jail[String(i)]?.in_jail && <span className="text-red-400">🚔</span>}
              </div>
            );
          })}
        </div>

        {lastEvent && lastEvent.startsWith('card:') && (
          <div className="text-center py-1 text-xs text-yellow-300 flex-shrink-0">{lastEvent.slice(5)}</div>
        )}

        {/* Board */}
        <div className="flex-1 flex items-center justify-center p-2 min-h-0 overflow-auto">
          <div
            className="grid"
            style={{
              width: 'min(94vw, 84vh, 780px)',
              aspectRatio: '1',
              gridTemplateColumns: 'repeat(11, 1fr)',
              gridTemplateRows: 'repeat(11, 1fr)',
              background: '#0f172a',
              border: '3px solid #6d28d9',
              borderRadius: 8,
              gap: 1,
              padding: 4,
            }}
          >
            {BOARD.map((space, i) => {
              const { row, col } = spaceGridPos(i);
              const p = properties[String(i)];
              const isCorner = i === 0 || i === 10 || i === 20 || i === 30;
              return (
                <div key={i} style={{ gridRow: row, gridColumn: col }}>
                  <Space
                    index={i}
                    space={space}
                    owner={p ? p.owner : -1}
                    houses={p ? p.houses : 0}
                    positions={positions}
                    isCorner={isCorner}
                  />
                </div>
              );
            })}
            {/* Center info panel */}
            <div style={{ gridRow: '2 / 11', gridColumn: '2 / 11' }} className="flex flex-col items-center justify-center gap-3">
              <span className="text-white/20 font-black text-2xl sm:text-4xl tracking-widest select-none">PROPERTY TYCOON</span>
              {dice.length > 0 && (
                <div className="flex gap-2">
                  {dice.map((d, i) => (
                    <div key={i} className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-white text-gray-900 font-black flex items-center justify-center text-lg shadow-lg">
                      {d}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Controls */}
        {!isOver && (
          <div className="bg-gray-900/80 border-t border-gray-800 px-3 py-3 flex-shrink-0">
            {!isMyTurn ? (
              <p className="text-center text-gray-400 text-sm py-2">Waiting for {currentTurnPlayer?.username || 'the next player'}…</p>
            ) : pendingSpace ? (
              <div className="flex items-center justify-center gap-3">
                <span className="text-white text-sm">Buy <b>{pendingSpace.name}</b> for ${pendingSpace.price}?</span>
                <button onClick={buy} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-xl transition-colors">Buy</button>
                <button onClick={decline} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold rounded-xl transition-colors">Decline</button>
              </div>
            ) : myInJail && awaitingRoll ? (
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <span className="text-red-400 text-sm font-semibold">In Jail</span>
                <button onClick={payFine} className="px-3 py-2 bg-yellow-600 hover:bg-yellow-700 text-white text-sm font-semibold rounded-xl transition-colors">Pay $50 Fine</button>
                {myJailCards > 0 && (
                  <button onClick={useCard} className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors">Use Jail Card</button>
                )}
                <button onClick={rollDice} className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-xl transition-colors">Roll for Doubles</button>
              </div>
            ) : awaitingRoll ? (
              <div className="flex items-center justify-center gap-2">
                <button onClick={rollDice} className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded-xl transition-colors">🎲 Roll Dice</button>
                {myBuildableProperties.length > 0 && (
                  <button onClick={() => setShowBuild(s => !s)} className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold rounded-xl transition-colors">🏗️ Build</button>
                )}
              </div>
            ) : (
              <p className="text-center text-gray-400 text-sm py-2">Resolving turn…</p>
            )}

            {showBuild && myBuildableProperties.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                {myBuildableProperties.map(({ s, i }) => {
                  const p = properties[String(i)];
                  const cost = ({ brown: 50, lightblue: 50, pink: 100, orange: 100, red: 150, yellow: 150, green: 200, darkblue: 200 })[s.group];
                  return (
                    <button
                      key={i}
                      onClick={() => build(i)}
                      className="px-2 py-1 bg-gray-800 hover:bg-gray-700 border rounded-lg text-xs text-white transition-colors"
                      style={{ borderColor: GROUP_COLORS[s.group] }}
                    >
                      {s.name} (${cost}) — {(p?.houses || 0) === 4 ? 'Hotel' : `House ${(p?.houses || 0) + 1}`}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
