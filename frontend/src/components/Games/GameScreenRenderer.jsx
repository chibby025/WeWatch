// src/components/Games/GameScreenRenderer.jsx
// Renders games on canvas - used for both 3D texture and fullscreen display
// Creates a hidden canvas that can be used as THREE.CanvasTexture

import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';

const GameScreenRenderer = forwardRef(({ 
  activeGame, 
  currentUserId, 
  onMove,
  width = 1920,
  height = 1080
}, ref) => {
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);

  // Expose canvas ref to parent for THREE.CanvasTexture creation
  useImperativeHandle(ref, () => ({
    getCanvas: () => canvasRef.current
  }));

  useEffect(() => {
    if (!activeGame || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Set fixed canvas size for consistent texture quality
    canvas.width = width;
    canvas.height = height;

    // Initial render
    const gameType = activeGame.game_type;
    if (gameType === 'tic_tac_toe') {
      renderTicTacToe(ctx, canvas, activeGame, currentUserId, onMove);
    } else if (gameType === 'rock_paper_scissors') {
      renderRockPaperScissors(ctx, canvas, activeGame, currentUserId, onMove);
    }

    // Set up animation loop for dynamic updates (RPS countdown, etc.)
    const animate = () => {
      if (gameType === 'tic_tac_toe') {
        renderTicTacToe(ctx, canvas, activeGame, currentUserId, onMove);
      } else if (gameType === 'rock_paper_scissors') {
        renderRockPaperScissors(ctx, canvas, activeGame, currentUserId, onMove);
      }
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    if (gameType === 'rock_paper_scissors' && activeGame.status === 'active') {
      animate(); // Only animate if game is active (countdown)
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [activeGame, currentUserId, onMove, width, height]);

  if (!activeGame) return null;

  return (
    <canvas 
      ref={canvasRef}
      style={{ display: 'none' }} // Hidden - used as texture source
    />
  );
});

GameScreenRenderer.displayName = 'GameScreenRenderer';

export default GameScreenRenderer;

// === RENDERING FUNCTIONS ===

function renderTicTacToe(ctx, canvas, gameState, currentUserId, onMove) {
  const { width, height } = canvas;
  const board = gameState.game_state?.board || Array(9).fill('');
  const currentTurn = gameState.game_state?.current_turn || 0;
  const players = gameState.players || [];
  const currentPlayer = players[currentTurn];

  // Clear canvas with gradient background
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#0f172a');
  gradient.addColorStop(1, '#1e1b4b');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Title
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.floor(height * 0.06)}px Arial`;
  ctx.textAlign = 'center';
  ctx.fillText('TIC TAC TOE', width / 2, height * 0.1);

  // Player indicators
  const player1 = players[0];
  const player2 = players[1];
  
  ctx.font = `${Math.floor(height * 0.035)}px Arial`;
  
  // Player 1 (X)
  ctx.fillStyle = currentTurn === 0 ? '#FF6B6B' : '#666666';
  ctx.textAlign = 'left';
  ctx.fillText(`${player1?.username || 'Player 1'} (X)`, width * 0.15, height * 0.18);
  if (currentTurn === 0) {
    ctx.fillStyle = '#FFD700';
    ctx.font = `${Math.floor(height * 0.025)}px Arial`;
    ctx.fillText('← PLAYING', width * 0.15, height * 0.22);
  }

  // Player 2 (O)
  ctx.font = `${Math.floor(height * 0.035)}px Arial`;
  ctx.fillStyle = currentTurn === 1 ? '#4ECDC4' : '#666666';
  ctx.textAlign = 'right';
  ctx.fillText(`${player2?.username || 'Player 2'} (O)`, width * 0.85, height * 0.18);
  if (currentTurn === 1) {
    ctx.fillStyle = '#FFD700';
    ctx.font = `${Math.floor(height * 0.025)}px Arial`;
    ctx.fillText('PLAYING →', width * 0.85, height * 0.22);
  }

  // Calculate grid dimensions (centered)
  const gridSize = Math.min(width, height) * 0.5;
  const cellSize = gridSize / 3;
  const offsetX = (width - gridSize) / 2;
  const offsetY = (height - gridSize) / 2 + height * 0.05;

  // Draw grid lines
  ctx.strokeStyle = '#4B5563';
  ctx.lineWidth = 6;
  for (let i = 1; i < 3; i++) {
    // Vertical lines
    ctx.beginPath();
    ctx.moveTo(offsetX + i * cellSize, offsetY);
    ctx.lineTo(offsetX + i * cellSize, offsetY + gridSize);
    ctx.stroke();

    // Horizontal lines
    ctx.beginPath();
    ctx.moveTo(offsetX, offsetY + i * cellSize);
    ctx.lineTo(offsetX + gridSize, offsetY + i * cellSize);
    ctx.stroke();
  }

  // Draw X's and O's
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  
  board.forEach((cell, index) => {
    if (!cell) return;

    const row = Math.floor(index / 3);
    const col = index % 3;
    const x = offsetX + col * cellSize + cellSize / 2;
    const y = offsetY + row * cellSize + cellSize / 2;
    const padding = cellSize * 0.25;

    if (cell === 'X') {
      ctx.strokeStyle = '#FF6B6B';
      ctx.beginPath();
      ctx.moveTo(x - padding, y - padding);
      ctx.lineTo(x + padding, y + padding);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + padding, y - padding);
      ctx.lineTo(x - padding, y + padding);
      ctx.stroke();
    } else if (cell === 'O') {
      ctx.strokeStyle = '#4ECDC4';
      ctx.beginPath();
      ctx.arc(x, y, padding, 0, Math.PI * 2);
      ctx.stroke();
    }
  });

  // Winner overlay
  if (gameState.status === 'finished' || gameState.status === 'completed') {
    const winner = players.find(p => gameState.winner_id === p.user_id);
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#FFD700';
    ctx.font = `bold ${Math.floor(height * 0.08)}px Arial`;
    ctx.textAlign = 'center';
    
    if (winner) {
      ctx.fillText(`🏆 ${winner.username} WINS! 🏆`, width / 2, height / 2);
    } else {
      ctx.fillText("🤝 DRAW! 🤝", width / 2, height / 2);
    }
  }
}

function renderRockPaperScissors(ctx, canvas, gameState, currentUserId, onMove) {
  const { width, height } = canvas;
  const players = gameState.players || [];
  const picks = gameState.game_state?.picks || {};
  const countdown = gameState.game_state?.countdown || 5;
  const myPick = picks[currentUserId];
  const allPicked = Object.keys(picks).length === players.length;

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#0c4a6e');
  gradient.addColorStop(1, '#1e1b4b');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Title
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.floor(height * 0.07)}px Arial`;
  ctx.textAlign = 'center';
  ctx.fillText('ROCK PAPER SCISSORS', width / 2, height * 0.15);

  // Countdown
  if (!allPicked && gameState.status === 'active') {
    ctx.fillStyle = '#FFD700';
    ctx.font = `bold ${Math.floor(height * 0.2)}px Arial`;
    ctx.fillText(countdown, width / 2, height * 0.4);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.floor(height * 0.04)}px Arial`;
    if (myPick) {
      ctx.fillText(`✓ You picked ${myPick.toUpperCase()}`, width / 2, height * 0.52);
      ctx.fillText('Waiting for opponent...', width / 2, height * 0.58);
    } else {
      ctx.fillText('Make your pick!', width / 2, height * 0.52);
    }
  }

  // Choice buttons (if haven't picked)
  if (!myPick && gameState.status === 'active') {
    const choices = [
      { emoji: '🪨', label: 'ROCK', value: 'rock', x: width * 0.25 },
      { emoji: '📄', label: 'PAPER', value: 'paper', x: width * 0.5 },
      { emoji: '✂️', label: 'SCISSORS', value: 'scissors', x: width * 0.75 }
    ];

    const buttonSize = Math.min(width, height) * 0.12;
    const buttonY = height * 0.65;

    choices.forEach(choice => {
      // Button circle
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(choice.x, buttonY, buttonSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Emoji
      ctx.font = `${Math.floor(buttonSize * 0.5)}px Arial`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(choice.emoji, choice.x, buttonY);

      // Label
      ctx.font = `bold ${Math.floor(height * 0.03)}px Arial`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(choice.label, choice.x, buttonY + buttonSize / 2 + 30);
    });
  }

  // Results
  if (gameState.status === 'finished' || gameState.status === 'completed') {
    const winner = players.find(p => gameState.winner_id === p.user_id);
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(0, 0, width, height);

    // Show picks
    ctx.font = `${Math.floor(height * 0.1)}px Arial`;
    players.forEach((player, index) => {
      const xPos = index === 0 ? width * 0.3 : width * 0.7;
      const pick = picks[player.user_id];
      const emojiMap = { rock: '🪨', paper: '📄', scissors: '✂️' };
      
      ctx.fillStyle = '#ffffff';
      ctx.fillText(player.username, xPos, height * 0.35);
      ctx.fillText(emojiMap[pick] || '?', xPos, height * 0.5);
    });

    // Winner
    ctx.fillStyle = '#FFD700';
    ctx.font = `bold ${Math.floor(height * 0.07)}px Arial`;
    if (winner) {
      ctx.fillText(`🏆 ${winner.username} WINS! 🏆`, width / 2, height * 0.75);
    } else {
      ctx.fillText("🤝 IT'S A DRAW! 🤝", width / 2, height * 0.75);
    }
  }
}

// === TIC TAC TOE RENDERER ===
function renderTicTacToe(ctx, canvas, gameState, currentUserId, onMove) {
  const { width, height } = canvas;
  const board = gameState.game_state?.board || Array(9).fill('');
  const currentTurn = gameState.game_state?.current_turn || 0;
  const players = gameState.players || [];
  const myPlayerIndex = players.findIndex(p => p.user_id === currentUserId);
  const currentPlayer = players[currentTurn];
  const isMyTurn = currentPlayer?.user_id === currentUserId;

  // Clear canvas
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, width, height);

  // Calculate grid dimensions (centered, responsive)
  const gridSize = Math.min(width, height) * 0.6;
  const cellSize = gridSize / 3;
  const offsetX = (width - gridSize) / 2;
  const offsetY = (height - gridSize) / 2 + 50; // Leave space for header

  // Draw header
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.floor(height * 0.05)}px Arial`;
  ctx.textAlign = 'center';
  ctx.fillText('TIC TAC TOE', width / 2, height * 0.08);

  // Draw player indicators
  const player1 = players[0];
  const player2 = players[1];
  
  ctx.font = `${Math.floor(height * 0.03)}px Arial`;
  
  // Player 1 (X)
  ctx.fillStyle = currentTurn === 0 ? '#FF6B6B' : '#666666';
  ctx.textAlign = 'left';
  ctx.fillText(`${player1?.username || 'Player 1'} (X)`, width * 0.1, height * 0.15);
  if (currentTurn === 0) {
    ctx.fillStyle = '#FFD700';
    ctx.fillText('← YOUR TURN', width * 0.1, height * 0.19);
  }

  // Player 2 (O)
  ctx.fillStyle = currentTurn === 1 ? '#4ECDC4' : '#666666';
  ctx.textAlign = 'right';
  ctx.fillText(`${player2?.username || 'Player 2'} (O)`, width * 0.9, height * 0.15);
  if (currentTurn === 1) {
    ctx.fillStyle = '#FFD700';
    ctx.fillText('YOUR TURN →', width * 0.9, height * 0.19);
  }

  // Draw grid lines
  ctx.strokeStyle = '#444466';
  ctx.lineWidth = 4;
  for (let i = 1; i < 3; i++) {
    // Vertical lines
    ctx.beginPath();
    ctx.moveTo(offsetX + i * cellSize, offsetY);
    ctx.lineTo(offsetX + i * cellSize, offsetY + gridSize);
    ctx.stroke();

    // Horizontal lines
    ctx.beginPath();
    ctx.moveTo(offsetX, offsetY + i * cellSize);
    ctx.lineTo(offsetX + gridSize, offsetY + i * cellSize);
    ctx.stroke();
  }

  // Draw X's and O's
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  
  board.forEach((cell, index) => {
    if (!cell) return;

    const row = Math.floor(index / 3);
    const col = index % 3;
    const x = offsetX + col * cellSize + cellSize / 2;
    const y = offsetY + row * cellSize + cellSize / 2;
    const padding = cellSize * 0.2;

    if (cell === 'X') {
      // Draw X
      ctx.strokeStyle = '#FF6B6B';
      ctx.beginPath();
      ctx.moveTo(x - padding, y - padding);
      ctx.lineTo(x + padding, y + padding);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + padding, y - padding);
      ctx.lineTo(x - padding, y + padding);
      ctx.stroke();
    } else if (cell === 'O') {
      // Draw O
      ctx.strokeStyle = '#4ECDC4';
      ctx.beginPath();
      ctx.arc(x, y, padding, 0, Math.PI * 2);
      ctx.stroke();
    }
  });

  // Draw hover effect on empty cells (only if it's your turn)
  if (isMyTurn && gameState.status === 'active') {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    // Hover effect will be handled by click event
  }

  // Draw winner message
  if (gameState.status === 'finished' || gameState.status === 'completed') {
    const winner = players.find(p => gameState.winner_id === p.user_id);
    
    // Semi-transparent overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, width, height);

    // Winner text
    ctx.fillStyle = '#FFD700';
    ctx.font = `bold ${Math.floor(height * 0.08)}px Arial`;
    ctx.textAlign = 'center';
    
    if (winner) {
      ctx.fillText(`🏆 ${winner.username} WINS! 🏆`, width / 2, height / 2);
    } else {
      ctx.fillText("🤝 IT'S A DRAW! 🤝", width / 2, height / 2);
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.floor(height * 0.03)}px Arial`;
    ctx.fillText('Game will close automatically...', width / 2, height / 2 + 60);
  }

  // Store grid info for click detection
  canvas.dataset.gridInfo = JSON.stringify({
    offsetX,
    offsetY,
    cellSize,
    isMyTurn,
    status: gameState.status
  });
}

// === ROCK PAPER SCISSORS RENDERER ===
function renderRockPaperScissors(ctx, canvas, gameState, currentUserId, onMove) {
  const { width, height } = canvas;
  const players = gameState.players || [];
  const picks = gameState.game_state?.picks || {};
  const countdown = gameState.game_state?.countdown || 5;
  const myPick = picks[currentUserId];
  const allPicked = Object.keys(picks).length === players.length;

  // Clear canvas
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#1a1a2e');
  gradient.addColorStop(1, '#16213e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Title
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.floor(height * 0.06)}px Arial`;
  ctx.textAlign = 'center';
  ctx.fillText('ROCK PAPER SCISSORS', width / 2, height * 0.12);

  // Countdown timer
  if (!allPicked) {
    ctx.fillStyle = '#FFD700';
    ctx.font = `bold ${Math.floor(height * 0.15)}px Arial`;
    ctx.fillText(countdown, width / 2, height * 0.35);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.floor(height * 0.03)}px Arial`;
    ctx.fillText('Make your pick!', width / 2, height * 0.43);
  }

  // Choice buttons (if haven't picked yet)
  if (!myPick && gameState.status === 'active') {
    const choices = [
      { emoji: '🪨', label: 'ROCK', value: 'rock', x: width * 0.25 },
      { emoji: '📄', label: 'PAPER', value: 'paper', x: width * 0.5 },
      { emoji: '✂️', label: 'SCISSORS', value: 'scissors', x: width * 0.75 }
    ];

    const buttonSize = Math.min(width, height) * 0.15;
    const buttonY = height * 0.55;

    choices.forEach(choice => {
      // Button background
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(choice.x, buttonY, buttonSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Emoji
      ctx.font = `${Math.floor(buttonSize * 0.5)}px Arial`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(choice.emoji, choice.x, buttonY);

      // Label
      ctx.font = `bold ${Math.floor(height * 0.025)}px Arial`;
      ctx.fillText(choice.label, choice.x, buttonY + buttonSize / 2 + 25);
    });

    // Store button info for clicks
    canvas.dataset.rpsButtons = JSON.stringify(choices.map(c => ({
      ...c,
      y: buttonY,
      radius: buttonSize / 2
    })));
  } else if (myPick) {
    // Show "Waiting for other player..."
    ctx.fillStyle = '#4ECDC4';
    ctx.font = `${Math.floor(height * 0.04)}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText('✓ You picked ' + myPick.toUpperCase(), width / 2, height * 0.5);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.floor(height * 0.03)}px Arial`;
    ctx.fillText('Waiting for opponent...', width / 2, height * 0.56);
  }

  // Show results if game finished
  if (gameState.status === 'finished' || gameState.status === 'completed') {
    const winner = players.find(p => gameState.winner_id === p.user_id);
    
    // Semi-transparent overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, width, height);

    // Show both picks
    ctx.font = `${Math.floor(height * 0.08)}px Arial`;
    ctx.textAlign = 'center';
    
    players.forEach((player, index) => {
      const xPos = index === 0 ? width * 0.3 : width * 0.7;
      const pick = picks[player.user_id];
      const emojiMap = { rock: '🪨', paper: '📄', scissors: '✂️' };
      
      ctx.fillStyle = '#ffffff';
      ctx.fillText(player.username, xPos, height * 0.3);
      ctx.fillText(emojiMap[pick] || '?', xPos, height * 0.45);
    });

    // Winner announcement
    ctx.fillStyle = '#FFD700';
    ctx.font = `bold ${Math.floor(height * 0.06)}px Arial`;
    
    if (winner) {
      ctx.fillText(`🏆 ${winner.username} WINS! 🏆`, width / 2, height * 0.7);
    } else {
      ctx.fillText("🤝 IT'S A DRAW! 🤝", width / 2, height * 0.7);
    }
  }
}

// === CLICK HANDLER ===
function handleCanvasClick(e, canvas, activeGame, currentUserId, onMove) {
  if (!canvas || activeGame.status !== 'active') return;

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  // Scale to canvas coordinates
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const canvasX = x * scaleX;
  const canvasY = y * scaleY;

  if (activeGame.game_type === 'tic_tac_toe') {
    const gridInfo = JSON.parse(canvas.dataset.gridInfo || '{}');
    if (!gridInfo.isMyTurn) return;

    const { offsetX, offsetY, cellSize } = gridInfo;
    
    // Check if click is within grid
    if (canvasX < offsetX || canvasX > offsetX + cellSize * 3 ||
        canvasY < offsetY || canvasY > offsetY + cellSize * 3) {
      return;
    }

    // Calculate which cell was clicked
    const col = Math.floor((canvasX - offsetX) / cellSize);
    const row = Math.floor((canvasY - offsetY) / cellSize);
    const position = row * 3 + col;

    // Check if cell is empty
    const board = activeGame.game_state?.board || [];
    if (board[position]) return;

    onMove({ position });
  } else if (activeGame.game_type === 'rock_paper_scissors') {
    const buttons = JSON.parse(canvas.dataset.rpsButtons || '[]');
    
    buttons.forEach(button => {
      const distance = Math.sqrt(
        Math.pow(canvasX - button.x, 2) + 
        Math.pow(canvasY - button.y, 2)
      );
      
      if (distance <= button.radius) {
        onMove({ 
          move_type: 'pick',
          move_data: { pick: button.value }
        });
      }
    });
  }
}
