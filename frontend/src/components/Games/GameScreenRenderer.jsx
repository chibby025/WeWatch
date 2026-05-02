// src/components/Games/GameScreenRenderer.jsx
// Renders games on canvas - used for both 3D texture and fullscreen display
// Creates a hidden canvas that can be used as THREE.CanvasTexture

import { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react';

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
    getCanvas: () => {
      return canvasRef.current;
    },
    handleCanvasClick: (normalizedX, normalizedY) => {
      // Handle click on canvas (normalized coordinates 0-1)
      console.log('🎮 [GameScreenRenderer] Canvas click received:', { normalizedX, normalizedY });
      
      if (!activeGame || !canvasRef.current) return;
      
      const canvas = canvasRef.current;
      const clickX = normalizedX * canvas.width;
      const clickY = normalizedY * canvas.height;
      
      // Check if game is over and restart button was clicked
      if (activeGame.isGameOver) {
        const restartButtonData = canvas.dataset.restartButton;
        if (restartButtonData) {
          const button = JSON.parse(restartButtonData);
          if (clickX >= button.x && clickX <= button.x + button.width &&
              clickY >= button.y && clickY <= button.y + button.height) {
            console.log('🎮 [GameScreenRenderer] Restart button clicked');
            // Send restart signal
            if (onMove) {
              onMove({ action: 'restart_game' });
            }
            return;
          }
        }
        console.log('🎮 [GameScreenRenderer] Game is over, ignoring click');
        return;
      }
      
      const gameType = activeGame.game_type;
      
      if (gameType === 'tic_tac_toe') {
        // Calculate which cell was clicked
        const gridSize = Math.min(canvas.width, canvas.height) * 0.5;
        const cellSize = gridSize / 3;
        const offsetX = (canvas.width - gridSize) / 2;
        const offsetY = (canvas.height - gridSize) / 2 + canvas.height * 0.05;
        
        // Check if click is within grid
        if (clickX >= offsetX && clickX <= offsetX + gridSize &&
            clickY >= offsetY && clickY <= offsetY + gridSize) {
          const col = Math.floor((clickX - offsetX) / cellSize);
          const row = Math.floor((clickY - offsetY) / cellSize);
          const cellIndex = row * 3 + col;
          
          console.log('🎮 [TicTacToe] Cell clicked:', { row, col, cellIndex });
          
          // Send move
          if (onMove) {
            onMove({ position: cellIndex });
          }
        }
      } else if (gameType === 'rock_paper_scissors') {
        // Handle RPS button clicks
        const buttons = JSON.parse(canvas.dataset.rpsButtons || '[]');
        console.log('🎮 [RPS] Checking buttons:', buttons);
        
        buttons.forEach(button => {
          const distance = Math.sqrt(
            Math.pow(clickX - button.x, 2) + 
            Math.pow(clickY - button.y, 2)
          );
          
          if (distance <= button.radius) {
            console.log('🎮 [RPS] Button clicked:', button.value);
            if (onMove) {
              onMove({ pick: button.value });
            }
          }
        });
      }
    }
  }));

  useEffect(() => {
    if (!activeGame) return;

    const gameType = activeGame.game_type;

    // Multiplayer games use canvas rendering
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Set fixed canvas size for consistent texture quality
    canvas.width = width;
    canvas.height = height;

    // Initial render
    if (gameType === 'tic_tac_toe') {
      renderTicTacToe(ctx, canvas, activeGame, currentUserId, onMove);
    } else if (gameType === 'rock_paper_scissors') {
      renderRockPaperScissors(ctx, canvas, activeGame, currentUserId, onMove);
      console.log('🎮 [GameScreenRenderer] Initial rock_paper_scissors render complete');
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

  const gameType = activeGame.game_type;

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
  if (gameState.isGameOver || gameState.status === 'finished' || gameState.status === 'completed') {
    const winner = players.find(p => (gameState.winnerId || gameState.winner_id) === p.user_id);
    
    // Semi-transparent dark overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, 0, width, height);

    // Winner text
    ctx.fillStyle = '#FFD700';
    ctx.font = `bold ${Math.floor(height * 0.08)}px Arial`;
    ctx.textAlign = 'center';
    
    if (winner) {
      ctx.fillText(`🏆 ${winner.username} WINS! 🏆`, width / 2, height / 2 - height * 0.15);
    } else {
      ctx.fillText("🤝 DRAW! 🤝", width / 2, height / 2 - height * 0.15);
    }

    // Restart button
    const buttonWidth = width * 0.3;
    const buttonHeight = height * 0.08;
    const buttonX = (width - buttonWidth) / 2;
    const buttonY = height / 2 + height * 0.02;
    
    // Button background with gradient
    const buttonGradient = ctx.createLinearGradient(buttonX, buttonY, buttonX, buttonY + buttonHeight);
    buttonGradient.addColorStop(0, '#10B981');
    buttonGradient.addColorStop(1, '#059669');
    ctx.fillStyle = buttonGradient;
    ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);
    
    // Button border
    ctx.strokeStyle = '#34D399';
    ctx.lineWidth = 3;
    ctx.strokeRect(buttonX, buttonY, buttonWidth, buttonHeight);
    
    // Button text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${Math.floor(height * 0.045)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PLAY AGAIN', width / 2, buttonY + buttonHeight / 2);
    
    // Store button coordinates for click detection
    canvas.dataset.restartButton = JSON.stringify({
      x: buttonX,
      y: buttonY,
      width: buttonWidth,
      height: buttonHeight
    });
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
    
    // Store button data for click detection
    const buttonData = choices.map(choice => ({
      x: choice.x,
      y: buttonY,
      radius: buttonSize / 2,
      value: choice.value
    }));
    canvas.dataset.rpsButtons = JSON.stringify(buttonData);

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
  } else {
    // Clear button data if already picked
    canvas.dataset.rpsButtons = '[]';
  }

  // Results (check status or isGameOver flag)
  const isGameFinished = gameState.status === 'finished' || gameState.status === 'completed' || gameState.isGameOver;
  if (isGameFinished) {
    const winner = players.find(p => (gameState.winner_id || gameState.winnerId) === p.user_id);
    // Use final_picks if available (set when game completes), otherwise use regular picks
    const finalPicks = gameState.game_state?.final_picks || picks;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(0, 0, width, height);

    // Show picks
    ctx.font = `${Math.floor(height * 0.1)}px Arial`;
    players.forEach((player, index) => {
      const xPos = index === 0 ? width * 0.3 : width * 0.7;
      const pick = finalPicks[player.user_id];
      const emojiMap = { rock: '🪨', paper: '📄', scissors: '✂️' };
      
      ctx.fillStyle = '#ffffff';
      ctx.fillText(player.username, xPos, height * 0.35);
      ctx.fillText(emojiMap[pick] || '?', xPos, height * 0.5);
    });

    // Winner
    ctx.fillStyle = '#FFD700';
    ctx.font = `bold ${Math.floor(height * 0.07)}px Arial`;
    if (winner) {
      ctx.fillText(`🏆 ${winner.username} WINS! 🏆`, width / 2, height * 0.7);
    } else {
      ctx.fillText("🤝 IT'S A DRAW! 🤝", width / 2, height * 0.7);
    }
    
    // Play Again button
    const buttonWidth = width * 0.3;
    const buttonHeight = height * 0.08;
    const buttonX = (width - buttonWidth) / 2;
    const buttonY = height * 0.8;
    
    // Button background with gradient
    const buttonGradient = ctx.createLinearGradient(buttonX, buttonY, buttonX, buttonY + buttonHeight);
    buttonGradient.addColorStop(0, '#10B981');
    buttonGradient.addColorStop(1, '#059669');
    ctx.fillStyle = buttonGradient;
    ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);
    
    // Button border
    ctx.strokeStyle = '#34D399';
    ctx.lineWidth = 3;
    ctx.strokeRect(buttonX, buttonY, buttonWidth, buttonHeight);
    
    // Button text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${Math.floor(height * 0.045)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PLAY AGAIN', width / 2, buttonY + buttonHeight / 2);
    
    // Store button coordinates for click detection
    canvas.dataset.restartButton = JSON.stringify({
      x: buttonX,
      y: buttonY,
      width: buttonWidth,
      height: buttonHeight
    });
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
