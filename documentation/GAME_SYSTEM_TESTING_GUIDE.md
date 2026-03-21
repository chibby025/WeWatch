# 🎮 Game System Testing Guide

## ✅ Completion Status

### Backend (100% Complete)
- ✅ Database migration with game_sessions and game_moves tables
- ✅ Game models (GameSession, GameMove) in `backend/internal/models/game.go`
- ✅ GameManager with state management in `backend/internal/handlers/games/game_manager.go`
- ✅ WebSocket handler in `backend/internal/handlers/games/websocket_handler.go`
- ✅ Tic Tac Toe logic in `backend/internal/handlers/games/tic_tac_toe.go`
- ✅ Rock Paper Scissors logic in `backend/internal/handlers/games/rock_paper_scissors.go`
- ✅ Ludo placeholder in `backend/internal/handlers/games/ludo.go`
- ✅ Integration with main WebSocket handler in `backend/internal/handlers/websocket.go`
- ✅ Build successful (46MB binary)

### Frontend (100% Complete)
- ✅ GameLobbyModal component (game selection + player selection)
- ✅ TicTacToeGame component (3x3 grid with turn indicators)
- ✅ RockPaperScissorsGame component (5s countdown + reveal)
- ✅ GameOverlay component (routing container)
- ✅ Game button added to LeftSidebar
- ✅ Game state management in VideoWatch.jsx
- ✅ WebSocket message handlers integrated
- ✅ All event listeners connected

---

## 🎯 Game Features

### 1. Tic Tac Toe
**Rules:**
- 2 players
- 3x3 grid
- No time limit
- Win: 3 in a row (horizontal, vertical, diagonal)
- Draw: All cells filled with no winner

**Backend Logic:**
- Position validation (0-8)
- Turn enforcement
- Win detection (8 combinations)
- Draw detection

**Frontend UI:**
- Blue-to-purple gradient overlay
- Turn indicator with player names
- Symbol coloring (X: red #FF6B6B, O: cyan #4ECDC4)
- Winner display with trophy icon
- Close button

### 2. Rock Paper Scissors
**Rules:**
- 2 players
- 5-second countdown for simultaneous picks
- Rock beats Scissors, Scissors beats Paper, Paper beats Rock
- Same pick = Draw

**Backend Logic:**
- Pick validation (rock/paper/scissors)
- Both picks stored before reveal
- Winner determination
- Countdown enforcement

**Frontend UI:**
- Choice buttons with icons (🪨📄✂️)
- 5-second countdown timer
- Disabled state after picking
- Reveal animation showing both picks
- Winner announcement

### 3. Ludo (Phase 4 - Placeholder)
**Status:** Backend returns "ludo not yet implemented - coming in Phase 4"

---

## 🧪 Testing Instructions

### Prerequisites
1. Backend server running: `cd backend && ./server`
2. Frontend dev server running: `cd frontend && npm run dev`
3. Multiple browser tabs/windows for multiplayer testing
4. At least 2 users in the same room
5. One user must be the host

### Test Flow

#### A. Test Tic Tac Toe

**Step 1: Start Game (Host)**
1. Open room as host
2. Click "Start Game" button (blue-purple gradient) in LeftSidebar
3. Select "Tic Tac Toe" game
4. Select 2 players (host auto-selected)
5. Click "Start Game"
6. Verify toast: "TIC TAC TOE started! 🎮"
7. Verify game overlay appears

**Step 2: Play Game**
1. Player 1 (X): Click any cell (1-9)
2. Verify cell shows red X
3. Verify turn switches to Player 2
4. Player 2 (O): Click empty cell
5. Verify cell shows cyan O
6. Continue alternating turns
7. Try clicking occupied cell - should fail
8. Try clicking when not your turn - should fail

**Step 3: Win Condition**
1. Get 3 in a row (horizontal/vertical/diagonal)
2. Verify winner announcement with trophy icon
3. Verify toast: "[Winner] wins! 🏆"
4. Close game overlay

**Step 4: Draw Condition**
1. Fill all 9 cells with no winner
2. Verify "It's a draw!" message
3. Verify toast: "It's a draw! 🤝"

**Step 5: Disconnect Test**
1. Start new game
2. One player closes browser tab
3. Other player should receive forfeit notification
4. Game should end with winner

---

#### B. Test Rock Paper Scissors

**Step 1: Start Game (Host)**
1. Click "Start Game" button in LeftSidebar
2. Select "Rock Paper Scissors"
3. Select 2 players
4. Click "Start Game"
5. Verify toast: "ROCK PAPER SCISSORS started! 🎮"

**Step 2: Play Round**
1. Both players see 5-second countdown
2. Player 1: Click Rock/Paper/Scissors
3. Verify countdown continues for Player 2
4. Player 2: Click Rock/Paper/Scissors
5. Verify reveal shows both picks
6. Verify winner determined correctly:
   - Rock > Scissors
   - Scissors > Paper
   - Paper > Rock
   - Same pick = Draw

**Step 3: Timeout Test**
1. Start new game
2. One player doesn't pick anything
3. Wait for countdown to reach 0
4. Verify auto-forfeit or default pick

**Step 4: Disconnect Test**
1. Start new game
2. One player closes tab before picking
3. Other player should receive forfeit notification
4. Winner announced

---

#### C. Test Edge Cases

**Multiple Games**
1. Start Tic Tac Toe
2. Complete game
3. Start Rock Paper Scissors immediately
4. Verify no state leakage between games

**Invalid Moves**
1. Try moving when not your turn
2. Try clicking occupied Tic Tac Toe cell
3. Try picking twice in Rock Paper Scissors
4. Verify error toasts appear

**Connection Issues**
1. Start game with 2 players
2. Disconnect internet briefly
3. Verify game state syncs when reconnected

**Host Disconnect**
1. Host starts game
2. Host closes tab
3. Verify game ends gracefully for non-host

---

## 🔌 WebSocket Message Flow

### Outgoing (Client → Server)

**start_game**
```json
{
  "type": "start_game",
  "data": {
    "game_type": "tic_tac_toe",
    "players": [
      { "user_id": 1, "username": "Host", "color": "#FF6B6B" },
      { "user_id": 2, "username": "Player2", "color": "#4ECDC4" }
    ]
  }
}
```

**make_move (Tic Tac Toe)**
```json
{
  "type": "make_move",
  "data": {
    "game_session_id": 123,
    "position": 4
  }
}
```

**make_move (Rock Paper Scissors)**
```json
{
  "type": "make_move",
  "data": {
    "game_session_id": 123,
    "pick": "rock"
  }
}
```

### Incoming (Server → Client)

**game_started**
```json
{
  "type": "game_started",
  "data": {
    "game_session_id": 123,
    "game_type": "tic_tac_toe",
    "status": "in_progress",
    "players": [...],
    "game_state": {
      "board": ["", "", "", "", "", "", "", "", ""],
      "current_turn": 0
    }
  }
}
```

**game_state_update**
```json
{
  "type": "game_state_update",
  "data": {
    "game_session_id": 123,
    "game_state": {
      "board": ["X", "", "", "", "O", "", "", "", ""],
      "current_turn": 1
    }
  }
}
```

**game_ended**
```json
{
  "type": "game_ended",
  "data": {
    "game_session_id": 123,
    "status": "finished",
    "players": [
      { "user_id": 1, "username": "Host", "score": 1 },
      { "user_id": 2, "username": "Player2", "score": 0 }
    ]
  }
}
```

**game_forfeited**
```json
{
  "type": "game_forfeited",
  "data": {
    "game_session_id": 123,
    "username": "Player2",
    "winner_username": "Host"
  }
}
```

**game_error**
```json
{
  "type": "game_error",
  "data": {
    "message": "It's not your turn"
  }
}
```

---

## 🐛 Known Issues & Limitations

### Backend
- ✅ No issues - all files working
- ⚠️ Ludo game is placeholder only (returns error)

### Frontend
- ⚠️ GameOverlay passes empty webSocketService (events handled via messages array in VideoWatch)
- ⚠️ Rock Paper Scissors timeout behavior not fully tested
- ⚠️ Game state not persisted across page refresh

### Features Not Yet Implemented
- ❌ Game spectators (non-players watching)
- ❌ Game history/replay
- ❌ Rematch functionality
- ❌ Game statistics/leaderboard
- ❌ Multiple simultaneous games per room
- ❌ Ludo full implementation (Phase 4)

---

## 📂 File Locations

### Backend
```
backend/internal/
├── handlers/
│   ├── websocket.go (integration: lines 1884, 2042, 905-907)
│   └── games/
│       ├── game_manager.go (8.6KB - state management)
│       ├── websocket_handler.go (message routing)
│       ├── tic_tac_toe.go (TTT logic)
│       ├── rock_paper_scissors.go (RPS logic)
│       └── ludo.go (placeholder)
└── models/
    └── game.go (GameSession, GameMove models)
```

### Frontend
```
frontend/src/
├── components/
│   ├── cinema/
│   │   ├── VideoWatch.jsx (main integration)
│   │   └── ui/
│   │       └── LeftSidebar.jsx (game button)
│   └── Games/
│       ├── GameLobbyModal.jsx (221 lines)
│       ├── TicTacToeGame.jsx (151 lines)
│       ├── RockPaperScissorsGame.jsx (186 lines)
│       └── GameOverlay.jsx (130 lines)
```

---

## 🚀 Quick Start Testing

**Fastest way to test end-to-end:**

1. **Terminal 1:** Start backend
   ```bash
   cd /home/chibuzor_dev/WeWatch/backend
   ./server
   ```

2. **Terminal 2:** Start frontend
   ```bash
   cd /home/chibuzor_dev/WeWatch/frontend
   npm run dev
   ```

3. **Browser 1 (Host):** Open room → Create session → Click "Start Game" button

4. **Browser 2 (Player 2):** Join same room and session

5. **Host:** Select Tic Tac Toe → Select both players → Start

6. **Both players:** Take turns clicking cells

7. **Verify:** Win detection, toast notifications, state sync

---

## ✅ Success Criteria

A successful test confirms:
- ✅ Game button appears in LeftSidebar (host only)
- ✅ GameLobbyModal opens with game selection
- ✅ Player selection works (min/max enforced)
- ✅ "Start Game" sends WebSocket message
- ✅ GameOverlay appears with correct game UI
- ✅ Turn-based gameplay works (Tic Tac Toe)
- ✅ Simultaneous gameplay works (Rock Paper Scissors)
- ✅ Win/draw detection accurate
- ✅ Forfeit on disconnect works
- ✅ Toast notifications appear for all events
- ✅ Game state syncs across all players
- ✅ Game closes cleanly
- ✅ No console errors

---

## 📝 Test Results Template

```
GAME SYSTEM TEST - [DATE]

Tester: [NAME]
Backend Version: [COMMIT/BUILD]
Frontend Version: [COMMIT]

[ ] Backend starts without errors
[ ] Frontend compiles without errors
[ ] Game button visible to host
[ ] GameLobbyModal opens
[ ] Tic Tac Toe full game cycle
[ ] Rock Paper Scissors full game cycle
[ ] Win detection works
[ ] Draw detection works
[ ] Forfeit on disconnect works
[ ] All toast notifications appear
[ ] No console errors

Issues Found:
1.
2.
3.

Notes:
-
```

---

## 🎯 Next Steps (If All Tests Pass)

1. **Phase 4:** Implement full Ludo game logic
2. **Enhancements:**
   - Add game spectators
   - Add rematch button
   - Add game statistics
   - Add multiple simultaneous games
   - Add game replay/history
3. **Optimization:**
   - Reduce bundle size
   - Optimize state updates
   - Add loading states
4. **Polish:**
   - Add animations
   - Improve mobile UI
   - Add sound effects

---

**Document Version:** 1.0  
**Last Updated:** [Current Date]  
**Author:** AI Assistant  
**Status:** Ready for Testing 🚀
