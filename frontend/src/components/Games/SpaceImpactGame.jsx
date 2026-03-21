// src/components/Games/SpaceImpactGame.jsx
// Classic Nokia Space Impact arcade game
// Single player - everyone watches the broadcast

import { useEffect, useRef, useCallback } from 'react';

export default function SpaceImpactGame({ canvasRef: externalCanvasRef, onGameOver, isActive }) {
  const internalCanvasRef = useRef(null);
  const canvasRef = externalCanvasRef || internalCanvasRef;
  const gameStateRef = useRef({
    ship: { x: 100, y: 270, width: 40, height: 30, speed: 5 },
    bullets: [],
    enemies: [],
    explosions: [],
    score: 0,
    health: 100,
    gameOver: false,
    frame: 0,
    keys: {}
  });

  const animationFrameRef = useRef(null);

  // Game constants
  const CANVAS_WIDTH = 1920;
  const CANVAS_HEIGHT = 1080;
  const BULLET_SPEED = 12;
  const ENEMY_SPEED = 4;
  const ENEMY_SPAWN_RATE = 60; // frames between spawns

  // Draw ship
  const drawShip = (ctx, ship) => {
    ctx.save();
    
    // Ship body (triangular)
    ctx.fillStyle = '#00ff00';
    ctx.beginPath();
    ctx.moveTo(ship.x + ship.width, ship.y + ship.height / 2);
    ctx.lineTo(ship.x, ship.y);
    ctx.lineTo(ship.x, ship.y + ship.height);
    ctx.closePath();
    ctx.fill();
    
    // Engine glow
    ctx.fillStyle = '#ffaa00';
    ctx.beginPath();
    ctx.arc(ship.x - 5, ship.y + ship.height / 2, 8, 0, Math.PI * 2);
    ctx.fill();
    
    // Cockpit
    ctx.fillStyle = '#00cccc';
    ctx.beginPath();
    ctx.arc(ship.x + 15, ship.y + ship.height / 2, 5, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  };

  // Draw bullet
  const drawBullet = (ctx, bullet) => {
    ctx.fillStyle = '#ffff00';
    ctx.fillRect(bullet.x, bullet.y - 2, 15, 4);
    
    // Bullet trail
    ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
    ctx.fillRect(bullet.x - 10, bullet.y - 1, 10, 2);
  };

  // Draw enemy
  const drawEnemy = (ctx, enemy) => {
    ctx.save();
    
    // Enemy body
    ctx.fillStyle = enemy.type === 'fast' ? '#ff0000' : '#ff6600';
    ctx.beginPath();
    ctx.moveTo(enemy.x, enemy.y + enemy.height / 2);
    ctx.lineTo(enemy.x + enemy.width, enemy.y);
    ctx.lineTo(enemy.x + enemy.width, enemy.y + enemy.height);
    ctx.closePath();
    ctx.fill();
    
    // Enemy eyes
    ctx.fillStyle = '#ffff00';
    ctx.beginPath();
    ctx.arc(enemy.x + 10, enemy.y + 10, 3, 0, Math.PI * 2);
    ctx.arc(enemy.x + 10, enemy.y + enemy.height - 10, 3, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  };

  // Draw explosion
  const drawExplosion = (ctx, explosion) => {
    const progress = explosion.frame / explosion.maxFrames;
    const radius = 30 * progress;
    const alpha = 1 - progress;
    
    ctx.save();
    ctx.globalAlpha = alpha;
    
    // Outer ring
    ctx.fillStyle = '#ff6600';
    ctx.beginPath();
    ctx.arc(explosion.x, explosion.y, radius, 0, Math.PI * 2);
    ctx.fill();
    
    // Inner ring
    ctx.fillStyle = '#ffff00';
    ctx.beginPath();
    ctx.arc(explosion.x, explosion.y, radius * 0.6, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  };

  // Collision detection
  const checkCollision = (rect1, rect2) => {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
  };

  // Spawn enemy
  const spawnEnemy = (gameState) => {
    const type = Math.random() > 0.7 ? 'fast' : 'normal';
    const enemy = {
      x: CANVAS_WIDTH,
      y: Math.random() * (CANVAS_HEIGHT - 100) + 50,
      width: 40,
      height: 30,
      speed: type === 'fast' ? ENEMY_SPEED * 1.5 : ENEMY_SPEED,
      type,
      health: type === 'fast' ? 1 : 2
    };
    gameState.enemies.push(enemy);
  };

  // Game loop
  const gameLoop = useCallback(() => {
    if (!isActive) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const gameState = gameStateRef.current;
    
    if (gameState.gameOver) {
      animationFrameRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    gameState.frame++;

    // Clear canvas with space background
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, '#000033');
    gradient.addColorStop(1, '#000011');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw stars
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 100; i++) {
      const x = (i * 137 + gameState.frame * 2) % CANVAS_WIDTH;
      const y = (i * 197) % CANVAS_HEIGHT;
      const size = (i % 3) + 1;
      ctx.fillRect(x, y, size, size);
    }

    // Update ship position
    if (gameState.keys['ArrowUp'] || gameState.keys['w']) {
      gameState.ship.y = Math.max(0, gameState.ship.y - gameState.ship.speed);
    }
    if (gameState.keys['ArrowDown'] || gameState.keys['s']) {
      gameState.ship.y = Math.min(CANVAS_HEIGHT - gameState.ship.height, gameState.ship.y + gameState.ship.speed);
    }
    if (gameState.keys['ArrowLeft'] || gameState.keys['a']) {
      gameState.ship.x = Math.max(0, gameState.ship.x - gameState.ship.speed);
    }
    if (gameState.keys['ArrowRight'] || gameState.keys['d']) {
      gameState.ship.x = Math.min(300, gameState.ship.x + gameState.ship.speed);
    }

    // Shoot bullets
    if (gameState.keys[' '] && gameState.frame % 10 === 0) {
      gameState.bullets.push({
        x: gameState.ship.x + gameState.ship.width,
        y: gameState.ship.y + gameState.ship.height / 2,
        width: 15,
        height: 4
      });
    }

    // Update bullets
    gameState.bullets = gameState.bullets.filter(bullet => {
      bullet.x += BULLET_SPEED;
      return bullet.x < CANVAS_WIDTH;
    });

    // Spawn enemies
    if (gameState.frame % ENEMY_SPAWN_RATE === 0) {
      spawnEnemy(gameState);
    }

    // Update enemies
    gameState.enemies = gameState.enemies.filter(enemy => {
      enemy.x -= enemy.speed;
      return enemy.x + enemy.width > 0;
    });

    // Check bullet-enemy collisions
    gameState.bullets = gameState.bullets.filter(bullet => {
      let hit = false;
      gameState.enemies = gameState.enemies.filter(enemy => {
        if (checkCollision(bullet, enemy)) {
          enemy.health--;
          if (enemy.health <= 0) {
            gameState.score += enemy.type === 'fast' ? 20 : 10;
            gameState.explosions.push({
              x: enemy.x + enemy.width / 2,
              y: enemy.y + enemy.height / 2,
              frame: 0,
              maxFrames: 20
            });
            hit = true;
            return false;
          }
          hit = true;
        }
        return true;
      });
      return !hit;
    });

    // Check ship-enemy collisions
    gameState.enemies.forEach(enemy => {
      if (checkCollision(gameState.ship, enemy)) {
        gameState.health -= 10;
        gameState.explosions.push({
          x: enemy.x,
          y: enemy.y,
          frame: 0,
          maxFrames: 20
        });
        enemy.x = -100; // Remove enemy
        
        if (gameState.health <= 0) {
          gameState.gameOver = true;
          setTimeout(() => onGameOver(gameState.score), 2000);
        }
      }
    });

    // Update explosions
    gameState.explosions = gameState.explosions.filter(explosion => {
      explosion.frame++;
      return explosion.frame < explosion.maxFrames;
    });

    // Draw everything
    drawShip(ctx, gameState.ship);
    gameState.bullets.forEach(bullet => drawBullet(ctx, bullet));
    gameState.enemies.forEach(enemy => drawEnemy(ctx, enemy));
    gameState.explosions.forEach(explosion => drawExplosion(ctx, explosion));

    // Draw HUD
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Score: ${gameState.score}`, 30, 50);
    
    // Health bar
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(30, 70, 200, 20);
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(30, 70, gameState.health * 2, 20);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(30, 70, 200, 20);
    
    // Controls hint
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '20px Arial';
    ctx.textAlign = 'right';
    ctx.fillText('Arrow Keys / WASD - Move  |  Space - Shoot', CANVAS_WIDTH - 30, 50);

    // Game over
    if (gameState.gameOver) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      ctx.fillStyle = '#ff0000';
      ctx.font = 'bold 80px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 50);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 50px Arial';
      ctx.fillText(`Final Score: ${gameState.score}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 50);
    }

    animationFrameRef.current = requestAnimationFrame(gameLoop);
  }, [isActive, onGameOver]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', ' '].includes(e.key)) {
        e.preventDefault();
        gameStateRef.current.keys[e.key] = true;
      }
    };

    const handleKeyUp = (e) => {
      gameStateRef.current.keys[e.key] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Start game loop
  useEffect(() => {
    if (!isActive) return;

    const canvas = canvasRef.current;
    if (!canvas) {
      console.log('🎮 [SpaceImpact] Canvas not found!');
      return;
    }

    console.log('🎮 [SpaceImpact] Starting game on canvas:', canvas.width, 'x', canvas.height);

    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;

    console.log('🎮 [SpaceImpact] Canvas initialized:', canvas.width, 'x', canvas.height);

    // Reset game state
    gameStateRef.current = {
      ship: { x: 100, y: CANVAS_HEIGHT / 2 - 15, width: 40, height: 30, speed: 5 },
      bullets: [],
      enemies: [],
      explosions: [],
      score: 0,
      health: 100,
      gameOver: false,
      frame: 0,
      keys: {}
    };

    gameLoop();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isActive, gameLoop]);

  // Only render canvas if no external ref provided (standalone mode)
  if (externalCanvasRef) {
    return null; // Parent manages canvas
  }

  return (
    <canvas 
      ref={canvasRef}
      style={{ display: 'none' }} // Hidden - used as texture
    />
  );
}
