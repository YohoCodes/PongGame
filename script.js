(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const statusEl = document.getElementById('status');
  const selectEl = document.getElementById('playerSelect');
  const difficultyEl = document.getElementById('difficultySelect');
  const btn1P = document.getElementById('btn1P');
  const btn2P = document.getElementById('btn2P');
  const btnEasy = document.getElementById('btnEasy');
  const btnMedium = document.getElementById('btnMedium');
  const btnHard = document.getElementById('btnHard');

  // Audio context for vintage arcade sounds
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  
  function playSound(frequency, duration, type = 'square', volume = 0.3) {
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    oscillator.type = type;
    
    gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + duration);
  }
  
  const SOUNDS = {
    paddleHit: () => playSound(500, 0.08, 'sine', 0.15),
    wallHit: () => playSound(350, 0.06, 'sine', 0.12),
    score: () => {
      playSound(200, 0.2, 'sine', 0.25);
      setTimeout(() => playSound(300, 0.2, 'sine', 0.25), 100);
      setTimeout(() => playSound(400, 0.3, 'sine', 0.25), 200);
    },
    gameStart: () => {
      playSound(523, 0.15, 'square', 0.2);
      setTimeout(() => playSound(659, 0.15, 'square', 0.2), 150);
      setTimeout(() => playSound(784, 0.3, 'square', 0.2), 300);
    },
    gameOver: () => {
      playSound(784, 0.2, 'sawtooth', 0.25);
      setTimeout(() => playSound(659, 0.2, 'sawtooth', 0.25), 200);
      setTimeout(() => playSound(523, 0.4, 'sawtooth', 0.25), 400);
    },
    menuSelect: () => playSound(600, 0.1, 'triangle', 0.2),
    powerUpSpawn: () => playSound(800, 0.2, 'sine', 0.2),
    powerUpCollect: () => {
      playSound(600, 0.1, 'sine', 0.3);
      setTimeout(() => playSound(800, 0.15, 'sine', 0.3), 100);
      setTimeout(() => playSound(1000, 0.2, 'sine', 0.3), 200);
    }
  };

  const ARENA = { width: canvas.width, height: canvas.height };

  const COLORS = {
    courtLine: '#f7931e',
    net: '#ff6b35',
    ball: '#fbbf24',
    paddle: '#8b5cf6',
    text: '#ffffff',
    shadow: 'rgba(0,0,0,0.35)'
  };

  const SETTINGS = {
    paddle: { width: 14, height: 110, speed: 520 },
    ball: { radius: 12, speed: 420, speedMax: 860, speedInc: 28 },
    net: { width: 6, gap: 14 },
    scoreToWin: 8
  };

  const KEYS = { up: false, down: false, w: false, s: false };

  const state = {
    left: { x: 30, y: ARENA.height / 2 - SETTINGS.paddle.height / 2, score: 0 },
    right: { x: ARENA.width - 30 - SETTINGS.paddle.width, y: ARENA.height / 2 - SETTINGS.paddle.height / 2, score: 0 },
    ball: { 
      x: ARENA.width / 2, 
      y: ARENA.height / 2, 
      vx: 0, 
      vy: 0, 
      speed: SETTINGS.ball.speed, 
      baseSpeed: SETTINGS.ball.speed, // Track base speed separately
      powerUpMultiplier: 1.0, // Track power-up multiplier
      inPlay: false 
    },
    ballTrail: [], // Array to store trail positions
    powerUps: [], // Array to store multiple power-ups
    paused: false,
    cpuRight: true,
    cpuDifficulty: 'medium', // easy, medium, hard
    winner: null,
    awaitingPlayerSelect: true,
    awaitingDifficultySelect: false
  };

  function randChoice(arr) { return arr[(Math.random() * arr.length) | 0]; }

  function serve(direction = randChoice([-1, 1])) {
    state.ball.x = ARENA.width / 2;
    state.ball.y = ARENA.height / 2;
    const angle = (Math.random() * 0.6 - 0.3); // -17deg..17deg
    // Use the current speed (base speed * power-up multiplier)
    state.ball.vx = Math.cos(angle) * state.ball.speed * direction;
    state.ball.vy = Math.sin(angle) * state.ball.speed;
    state.ball.inPlay = true;
    state.ballTrail = []; // Clear trail on serve
    state.winner = null;
    setStatus('Playing');
    SOUNDS.gameStart();
  }

  function setStatus(text) { statusEl.textContent = text; }

  function reset() {
    // Reset to player selection menu
    state.left.score = 0;
    state.right.score = 0;
    state.winner = null;
    state.paused = false;
    state.ball.speed = SETTINGS.ball.speed;
    state.ball.baseSpeed = SETTINGS.ball.speed;
    state.ball.powerUpMultiplier = 1.0;
    state.ball.inPlay = false;
    state.ballTrail = [];
    centerPaddles();
    
    // Show player selection menu
    state.awaitingPlayerSelect = true;
    state.awaitingDifficultySelect = false;
    if (selectEl) selectEl.style.display = 'grid';
    if (difficultyEl) difficultyEl.style.display = 'none';
    setStatus('Select players: press 1 or 2');
  }

  function centerPaddles() {
    state.left.y = ARENA.height / 2 - SETTINGS.paddle.height / 2;
    state.right.y = ARENA.height / 2 - SETTINGS.paddle.height / 2;
  }

  window.addEventListener('keydown', (e) => {
    // Prevent page scrolling with game keys
    const gameKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'W', 's', 'S', 'p', 'P', 'r', 'R', '1', ' ', 'Escape'];
    if (gameKeys.includes(e.key) || e.code === 'Space') {
      e.preventDefault();
    }

    // Handle player selection overlay first
    if (state.awaitingPlayerSelect) {
      if (e.key === '1') { choosePlayers(1); e.preventDefault(); return; }
      if (e.key === '2') { choosePlayers(2); e.preventDefault(); return; }
      return; // ignore other keys until selected
    }
    
    // Handle difficulty selection
    if (state.awaitingDifficultySelect) {
      if (e.key.toLowerCase() === 'e') { chooseDifficulty('easy'); e.preventDefault(); return; }
      if (e.key.toLowerCase() === 'm') { chooseDifficulty('medium'); e.preventDefault(); return; }
      if (e.key.toLowerCase() === 'h') { chooseDifficulty('hard'); e.preventDefault(); return; }
      return; // ignore other keys until selected
    }
    if (e.key === 'ArrowUp') KEYS.up = true;
    if (e.key === 'ArrowDown') KEYS.down = true;
    if (e.key.toLowerCase() === 'w') KEYS.w = true;
    if (e.key.toLowerCase() === 's') KEYS.s = true;
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') togglePause();
    if (e.key === 'r' || e.key === 'R') reset();
    if (e.key === '1') { 
      state.cpuRight = !state.cpuRight; 
      // Update status to show current configuration
      const cpuSide = state.cpuRight ? 'Left' : 'Right';
      setStatus(`CPU now controls ${cpuSide} paddle`);
    }
    if (e.code === 'Space') {
      if (!state.ball.inPlay && !state.winner) serve(randChoice([-1, 1]));
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowUp') KEYS.up = false;
    if (e.key === 'ArrowDown') KEYS.down = false;
    if (e.key.toLowerCase() === 'w') KEYS.w = false;
    if (e.key.toLowerCase() === 's') KEYS.s = false;
  });

  function togglePause() {
    state.paused = !state.paused;
    setStatus(state.paused ? 'Paused' : (state.ball.inPlay ? 'Playing' : 'Press Space to serve'));
  }

  function choosePlayers(count) {
    if (count === 1) {
      // Show difficulty selection for 1 player
      state.awaitingPlayerSelect = false;
      state.awaitingDifficultySelect = true;
      if (selectEl) selectEl.style.display = 'none';
      if (difficultyEl) difficultyEl.style.display = 'grid';
      SOUNDS.menuSelect();
    } else {
      // 2 players: human controls both sides
      state.cpuRight = false;
      state.awaitingPlayerSelect = false;
      if (selectEl) selectEl.style.display = 'none';
      setStatus('Press Space to serve');
      SOUNDS.menuSelect();
    }
  }
  
  function chooseDifficulty(difficulty) {
    state.cpuDifficulty = difficulty;
    state.cpuRight = true; // CPU controls left paddle
    state.awaitingDifficultySelect = false;
    if (difficultyEl) difficultyEl.style.display = 'none';
    setStatus('Press Space to serve');
    SOUNDS.menuSelect();
  }

  function update(dt) {
    if (state.paused) return;

    // Player controls - dynamic based on CPU position
    if (state.cpuRight) {
      // CPU controls left paddle, human controls right paddle
      // CPU AI for left paddle
      const paddleCenter = state.left.y + SETTINGS.paddle.height / 2;
      let targetY = state.ball.y;
      
      // Difficulty settings
      const difficultySettings = {
        easy: { speed: 0.9, ease: 5.0, randomness: 35, prediction: false },
        medium: { speed: 1.0, ease: 6.5, randomness: 20, prediction: true },
        hard: { speed: 1.15, ease: 8.0, randomness: 8, prediction: true }
      };
      
      const settings = difficultySettings[state.cpuDifficulty];
      
      // Add prediction based on ball velocity (medium and hard only)
      if (settings.prediction && state.ball.vx < 0) { // Ball moving towards CPU
        const timeToReach = Math.abs((state.ball.x - (state.left.x + SETTINGS.paddle.width)) / state.ball.vx);
        const predictedY = state.ball.y + state.ball.vy * timeToReach;
        targetY = predictedY;
      }
      
      // Add randomness based on difficulty
      targetY += (Math.random() - 0.5) * settings.randomness;
      
      targetY -= SETTINGS.paddle.height / 2;
      const diff = targetY - state.left.y;
      const cpuSpeed = SETTINGS.paddle.speed * settings.speed;
      state.left.y += Math.max(-cpuSpeed, Math.min(cpuSpeed, diff * settings.ease)) * dt * 0.8;
      
      // Human controls right paddle with arrows
      const rightDir = (KEYS.up ? -1 : 0) + (KEYS.down ? 1 : 0);
      state.right.y += rightDir * SETTINGS.paddle.speed * dt;
    } else {
      // CPU controls right paddle, human controls left paddle
      // Human controls left paddle with W/S
      const leftDir = (KEYS.w ? -1 : 0) + (KEYS.s ? 1 : 0);
      state.left.y += leftDir * SETTINGS.paddle.speed * dt;
      
      // CPU AI for right paddle
      const paddleCenter = state.right.y + SETTINGS.paddle.height / 2;
      let targetY = state.ball.y;
      
      // Difficulty settings
      const difficultySettings = {
        easy: { speed: 0.9, ease: 5.0, randomness: 35, prediction: false },
        medium: { speed: 1.0, ease: 6.5, randomness: 20, prediction: true },
        hard: { speed: 1.15, ease: 8.0, randomness: 8, prediction: true }
      };
      
      const settings = difficultySettings[state.cpuDifficulty];
      
      // Add prediction based on ball velocity (medium and hard only)
      if (settings.prediction && state.ball.vx > 0) { // Ball moving towards CPU
        const timeToReach = Math.abs((state.ball.x - state.right.x) / state.ball.vx);
        const predictedY = state.ball.y + state.ball.vy * timeToReach;
        targetY = predictedY;
      }
      
      // Add randomness based on difficulty
      targetY += (Math.random() - 0.5) * settings.randomness;
      
      targetY -= SETTINGS.paddle.height / 2;
      const diff = targetY - state.right.y;
      const cpuSpeed = SETTINGS.paddle.speed * settings.speed;
      state.right.y += Math.max(-cpuSpeed, Math.min(cpuSpeed, diff * settings.ease)) * dt * 0.8;
    }

    // Clamp paddles
    state.left.y = Math.max(0, Math.min(ARENA.height - SETTINGS.paddle.height, state.left.y));
    state.right.y = Math.max(0, Math.min(ARENA.height - SETTINGS.paddle.height, state.right.y));

    if (!state.ball.inPlay) return;

    // Ball physics
    state.ball.x += state.ball.vx * dt;
    state.ball.y += state.ball.vy * dt;
    
    // Update ball trail
    if (state.ball.inPlay) {
      state.ballTrail.push({ x: state.ball.x, y: state.ball.y, time: 0 });
      // Keep only last 8 trail positions
      if (state.ballTrail.length > 8) {
        state.ballTrail.shift();
      }
    } else {
      // Clear trail when ball is not in play
      state.ballTrail = [];
    }
    
    // Update trail timing
    state.ballTrail.forEach(pos => pos.time += dt);
    
    // Power-up system
    if (state.ball.inPlay) {
      // Randomly spawn power-up (0.5% chance per frame - increased from 0.3% but balanced)
      // Limit to maximum of 4 power-ups at once
      if (Math.random() < 0.005 && state.powerUps.length < 4) {
        const newPowerUp = {
          x: Math.random() * (ARENA.width - 100) + 50,
          y: Math.random() * (ARENA.height - 100) + 50,
          radius: 20, // Increased from 12 to 20 for larger power-ups
          collected: false,
          speedBoost: 2.0 // Increased from 1.5 to 2.0 for 2x speed boost
        };
        state.powerUps.push(newPowerUp);
        SOUNDS.powerUpSpawn();
      }
      
      // Check power-up collision with ball
      state.powerUps.forEach(powerUp => {
        if (!powerUp.collected) {
          const distance = Math.sqrt(
            Math.pow(state.ball.x - powerUp.x, 2) + 
            Math.pow(state.ball.y - powerUp.y, 2)
          );
          
          if (distance < SETTINGS.ball.radius + powerUp.radius) {
            powerUp.collected = true;
            // Apply speed boost by multiplying the power-up multiplier
            state.ball.powerUpMultiplier *= powerUp.speedBoost;
            state.ball.speed = state.ball.baseSpeed * state.ball.powerUpMultiplier;
            
            // Update velocity components to reflect the new speed
            const currentSpeed = Math.sqrt(state.ball.vx * state.ball.vx + state.ball.vy * state.ball.vy);
            if (currentSpeed > 0) {
              const speedRatio = state.ball.speed / currentSpeed;
              state.ball.vx *= speedRatio;
              state.ball.vy *= speedRatio;
            }
            
            SOUNDS.powerUpCollect();
          }
        }
      });

      // Remove collected power-ups
      state.powerUps = state.powerUps.filter(powerUp => !powerUp.collected);
    } else {
      // Clear power-ups when ball is not in play
      state.powerUps = [];
    }

    // Wall collisions
    if (state.ball.y - SETTINGS.ball.radius <= 0 && state.ball.vy < 0) {
      state.ball.y = SETTINGS.ball.radius;
      state.ball.vy *= -1;
      // Reset ball speed to normal when hitting wall
      state.ball.powerUpMultiplier = 1.0;
      state.ball.speed = state.ball.baseSpeed;
      // Update velocity components to reflect the new speed
      const currentSpeed = Math.sqrt(state.ball.vx * state.ball.vx + state.ball.vy * state.ball.vy);
      if (currentSpeed > 0) {
        const speedRatio = state.ball.speed / currentSpeed;
        state.ball.vx *= speedRatio;
        state.ball.vy *= speedRatio;
      }
      SOUNDS.wallHit();
    }
    if (state.ball.y + SETTINGS.ball.radius >= ARENA.height && state.ball.vy > 0) {
      state.ball.y = ARENA.height - SETTINGS.ball.radius;
      state.ball.vy *= -1;
      // Reset ball speed to normal when hitting wall
      state.ball.powerUpMultiplier = 1.0;
      state.ball.speed = state.ball.baseSpeed;
      // Update velocity components to reflect the new speed
      const currentSpeed = Math.sqrt(state.ball.vx * state.ball.vx + state.ball.vy * state.ball.vy);
      if (currentSpeed > 0) {
        const speedRatio = state.ball.speed / currentSpeed;
        state.ball.vx *= speedRatio;
        state.ball.vy *= speedRatio;
      }
      SOUNDS.wallHit();
    }

    // Paddle collisions
    const paddleBallIntersect = (px, py) => {
      const withinX = Math.abs(state.ball.x - (px + SETTINGS.paddle.width / 2)) <= (SETTINGS.paddle.width / 2 + SETTINGS.ball.radius);
      const withinY = state.ball.y + SETTINGS.ball.radius >= py && state.ball.y - SETTINGS.ball.radius <= py + SETTINGS.paddle.height;
      return withinX && withinY;
    };

    // Left paddle
    if (state.ball.vx < 0 && state.ball.x - SETTINGS.ball.radius <= state.left.x + SETTINGS.paddle.width) {
      if (paddleBallIntersect(state.left.x, state.left.y)) {
        const relativeIntersectY = (state.ball.y - (state.left.y + SETTINGS.paddle.height / 2)) / (SETTINGS.paddle.height / 2);
        const bounceAngle = relativeIntersectY * (Math.PI / 3.5); // spread
        // Reset power-up multiplier and calculate new speed
        state.ball.powerUpMultiplier = 1.0;
        const speed = Math.min(state.ball.baseSpeed + SETTINGS.ball.speedInc, SETTINGS.ball.speedMax);
        state.ball.speed = speed;
        state.ball.vx = Math.cos(bounceAngle) * speed;
        state.ball.vy = Math.sin(bounceAngle) * speed;
        state.ball.x = state.left.x + SETTINGS.paddle.width + SETTINGS.ball.radius + 0.01;
        SOUNDS.paddleHit();
      }
    }

    // Right paddle
    if (state.ball.vx > 0 && state.ball.x + SETTINGS.ball.radius >= state.right.x) {
      if (paddleBallIntersect(state.right.x, state.right.y)) {
        const relativeIntersectY = (state.ball.y - (state.right.y + SETTINGS.paddle.height / 2)) / (SETTINGS.paddle.height / 2);
        const bounceAngle = relativeIntersectY * (Math.PI / 3.5);
        // Reset power-up multiplier and calculate new speed
        state.ball.powerUpMultiplier = 1.0;
        const speed = Math.min(state.ball.baseSpeed + SETTINGS.ball.speedInc, SETTINGS.ball.speedMax);
        state.ball.speed = speed;
        state.ball.vx = -Math.cos(bounceAngle) * speed;
        state.ball.vy = Math.sin(bounceAngle) * speed;
        state.ball.x = state.right.x - SETTINGS.ball.radius - 0.01;
        SOUNDS.paddleHit();
      }
    }

    // Scoring
    if (state.ball.x + SETTINGS.ball.radius < 0) {
      score('right');
    }
    if (state.ball.x - SETTINGS.ball.radius > ARENA.width) {
      score('left');
    }
  }

  function score(side) {
    state.ball.inPlay = false;
    state.ball.vx = 0; state.ball.vy = 0;
    // Reset ball speed and power-up multiplier when scoring
    state.ball.speed = SETTINGS.ball.speed;
    state.ball.baseSpeed = SETTINGS.ball.speed;
    state.ball.powerUpMultiplier = 1.0;
    if (side === 'left') state.left.score += 1; else state.right.score += 1;
    const leader = side === 'left' ? 'Left' : 'Right';
    setStatus(`${leader} scores! Space to serve`);
    SOUNDS.score();
    checkWin();
  }

  function checkWin() {
    if (state.left.score >= SETTINGS.scoreToWin || state.right.score >= SETTINGS.scoreToWin) {
      const winner = state.left.score > state.right.score ? 'Left' : 'Right';
      state.winner = winner;
      state.ball.inPlay = false;
      setStatus(`${winner} wins! Press R to reset`);
      SOUNDS.gameOver();
    }
  }

  function drawCourt() {
    // COURT BACKGROUND WITH CYBERPUNK AESTHETIC! 🚀
    ctx.save();
    
    // Deep space gradient background
    const bgGradient = ctx.createLinearGradient(0, 0, 0, ARENA.height);
    bgGradient.addColorStop(0, '#1e3a8a');
    bgGradient.addColorStop(0.5, '#1e1b4b');
    bgGradient.addColorStop(1, '#0f172a');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, ARENA.width, ARENA.height);
    
    // NEON COURT LINES - BLADE RUNNER STYLE! 🌃
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#f7931e';
    ctx.shadowColor = '#f7931e';
    ctx.shadowBlur = 10;
    ctx.setLineDash([]);
    
    // Outer rectangle with glow
    ctx.strokeRect(8, 8, ARENA.width - 16, ARENA.height - 16);
    
    // MIDLINE WITH PULSING EFFECT! ⚡
    ctx.beginPath();
    ctx.setLineDash([15, 20]);
    ctx.moveTo(ARENA.width / 2, 16);
    ctx.lineTo(ARENA.width / 2, ARENA.height - 16);
    
    // Pulsing opacity for cyberpunk effect
    const pulse = Math.sin(Date.now() * 0.003) * 0.3 + 0.7;
    ctx.globalAlpha = pulse;
    ctx.stroke();
    
    // NEON NET WITH PARTICLE EFFECTS! ✨
    ctx.save();
    ctx.fillStyle = '#ff6b35';
    ctx.shadowColor = '#ff6b35';
    ctx.shadowBlur = 8;
    const netX = ARENA.width / 2 - SETTINGS.net.width / 2;
    
    for (let y = 20; y < ARENA.height - 20; y += SETTINGS.net.gap + SETTINGS.net.width) {
      // Pulsing net blocks
      const netPulse = Math.sin(Date.now() * 0.002 + y * 0.1) * 0.2 + 0.8;
      ctx.globalAlpha = netPulse;
      ctx.fillRect(netX, y, SETTINGS.net.width, SETTINGS.net.gap);
      
      // Particle effects around net
      if (Math.random() < 0.1) {
        ctx.fillStyle = 'rgba(255, 107, 53, 0.6)';
        ctx.beginPath();
        ctx.arc(netX + Math.random() * SETTINGS.net.width, y + Math.random() * SETTINGS.net.gap, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff6b35';
      }
    }
    
    ctx.restore();
    ctx.restore();
  }

  function drawPaddle(x, y) {
    ctx.save();
    
    // NEON GLOW EFFECT - ULTRA HYPE! 🔥
    const glowGradient = ctx.createLinearGradient(x, y, x + SETTINGS.paddle.width, y + SETTINGS.paddle.height);
    glowGradient.addColorStop(0, 'rgba(139, 92, 246, 0.8)');
    glowGradient.addColorStop(0.5, 'rgba(139, 92, 246, 1)');
    glowGradient.addColorStop(1, 'rgba(139, 92, 246, 0.8)');
    
    // Outer glow
    ctx.shadowColor = '#8b5cf6';
    ctx.shadowBlur = 20;
    ctx.fillStyle = glowGradient;
    roundRect(ctx, x - 2, y - 2, SETTINGS.paddle.width + 4, SETTINGS.paddle.height + 4, 10);
    ctx.fill();
    
    // Inner glow
    ctx.shadowColor = '#a855f7';
    ctx.shadowBlur = 12;
    ctx.fillStyle = COLORS.paddle;
    roundRect(ctx, x, y, SETTINGS.paddle.width, SETTINGS.paddle.height, 8);
    ctx.fill();
    
    // HIGHLIGHT STRIPES FOR EXTRA HYPE! ⚡
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    roundRect(ctx, x + 2, y + 3, SETTINGS.paddle.width - 4, 4, 2);
    ctx.fill();
    
    roundRect(ctx, x + 2, y + SETTINGS.paddle.height - 7, SETTINGS.paddle.width - 4, 4, 2);
    ctx.fill();
    
    ctx.restore();
  }

  function drawBall() {
    ctx.save();
    
    // Draw ULTRA-DETAILED COSMIC TRAIL - EYE-CATCHING MASTERPIECE! 🌟✨
    state.ballTrail.forEach((pos, index) => {
      const age = pos.time;
      const opacity = Math.max(0, 1 - age * 1.2); // Longer fade for more visibility
      const baseSize = SETTINGS.ball.radius * (1 - age * 0.2); // Slower shrink
      const hue = (45 + age * 60) % 120; // Yellow to orange to purple (game color palette)
      const pulse = Math.sin(Date.now() * 0.01 + index * 0.5) * 0.2 + 1; // Pulsing effect
      
      if (opacity > 0 && baseSize > 0) {
        // EXTENDED LAYER SYSTEM FOR MAXIMUM DETAIL! 🔥
        const layers = [
          { size: baseSize * 2.5, alpha: opacity * 0.08, blur: 20, hue: hue - 30, pulse: 0.8 },
          { size: baseSize * 2.0, alpha: opacity * 0.12, blur: 15, hue: hue - 20, pulse: 0.9 },
          { size: baseSize * 1.6, alpha: opacity * 0.18, blur: 12, hue: hue - 10, pulse: 1.0 },
          { size: baseSize * 1.3, alpha: opacity * 0.25, blur: 8, hue: hue, pulse: 1.1 },
          { size: baseSize * 1.0, alpha: opacity * 0.4, blur: 6, hue: hue + 10, pulse: 1.2 },
          { size: baseSize * 0.7, alpha: opacity * 0.6, blur: 4, hue: hue + 20, pulse: 1.3 },
          { size: baseSize * 0.4, alpha: opacity * 0.8, blur: 2, hue: hue + 30, pulse: 1.4 }
        ];
        
        layers.forEach(layer => {
          if (layer.size > 0) {
            const finalSize = layer.size * layer.pulse * pulse;
            ctx.globalAlpha = layer.alpha;
            ctx.shadowColor = `hsl(${layer.hue}, 90%, 75%)`;
            ctx.shadowBlur = layer.blur;
            
            // MULTI-GRADIENT SYSTEM FOR DEPTH! 🌈
            const gradient = ctx.createRadialGradient(
              pos.x, pos.y, 0,
              pos.x, pos.y, finalSize
            );
            gradient.addColorStop(0, `hsla(${layer.hue}, 90%, 75%, ${layer.alpha})`);
            gradient.addColorStop(0.3, `hsla(${layer.hue}, 80%, 65%, ${layer.alpha * 0.8})`);
            gradient.addColorStop(0.6, `hsla(${layer.hue}, 70%, 55%, ${layer.alpha * 0.5})`);
            gradient.addColorStop(1, `hsla(${layer.hue}, 60%, 45%, 0)`);
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, finalSize, 0, Math.PI * 2);
            ctx.fill();
          }
        });
        
        // ENHANCED SPARKLE SYSTEM WITH VARIETY! ✨
        if (opacity > 0.3) {
          const sparkleTypes = [
            { count: Math.floor(Math.random() * 4) + 2, size: 1, color: `hsl(${hue + 15}, 95%, 85%)` },
            { count: Math.floor(Math.random() * 3) + 1, size: 2, color: `hsl(${hue + 30}, 90%, 80%)` },
            { count: Math.floor(Math.random() * 2) + 1, size: 3, color: `hsl(${hue + 45}, 85%, 75%)` }
          ];
          
          sparkleTypes.forEach(sparkleType => {
            for (let i = 0; i < sparkleType.count; i++) {
              const angle = Math.random() * Math.PI * 2;
              const distance = Math.random() * baseSize * 1.2;
              const sparkleX = pos.x + Math.cos(angle) * distance;
              const sparkleY = pos.y + Math.sin(angle) * distance;
              const sparkleSize = sparkleType.size + Math.random() * 2;
              
              ctx.globalAlpha = opacity * 0.9;
              ctx.fillStyle = sparkleType.color;
              ctx.shadowColor = sparkleType.color;
              ctx.shadowBlur = 6;
              ctx.beginPath();
              ctx.arc(sparkleX, sparkleY, sparkleSize, 0, Math.PI * 2);
              ctx.fill();
            }
          });
        }
        
        // ENERGY RINGS AROUND TRAIL! 💫
        if (opacity > 0.5 && index % 2 === 0) {
          const ringCount = 2;
          for (let ring = 0; ring < ringCount; ring++) {
            const ringSize = baseSize * (1.5 + ring * 0.3);
            const ringOpacity = opacity * (0.3 - ring * 0.1);
            
            ctx.globalAlpha = ringOpacity;
            ctx.strokeStyle = `hsl(${hue + ring * 15}, 80%, 70%)`;
            ctx.lineWidth = 2;
            ctx.shadowColor = `hsl(${hue + ring * 15}, 80%, 70%)`;
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, ringSize, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        
        // COSMIC DUST PARTICLES! 🌌
        if (opacity > 0.4) {
          const dustCount = Math.floor(Math.random() * 6) + 3;
          for (let i = 0; i < dustCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * baseSize * 1.5;
            const dustX = pos.x + Math.cos(angle) * distance;
            const dustY = pos.y + Math.sin(angle) * distance;
            const dustSize = Math.random() * 1.5 + 0.5;
            
            ctx.globalAlpha = opacity * 0.4;
            ctx.fillStyle = `hsl(${hue + Math.random() * 30}, 70%, 60%)`;
            ctx.shadowColor = `hsl(${hue + Math.random() * 30}, 70%, 60%)`;
            ctx.shadowBlur = 3;
            ctx.beginPath();
            ctx.arc(dustX, dustY, dustSize, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    });
    
    // Draw main ball with enhanced glow
    ctx.globalAlpha = 1;
    
    // Ball glow
    const ballGlow = ctx.createRadialGradient(
      state.ball.x, state.ball.y, 0,
      state.ball.x, state.ball.y, SETTINGS.ball.radius * 2
    );
    ballGlow.addColorStop(0, 'rgba(251, 191, 36, 0.8)');
    ballGlow.addColorStop(0.5, 'rgba(251, 191, 36, 0.3)');
    ballGlow.addColorStop(1, 'rgba(251, 191, 36, 0)');
    
    ctx.fillStyle = ballGlow;
    ctx.beginPath();
    ctx.arc(state.ball.x, state.ball.y, SETTINGS.ball.radius * 2, 0, Math.PI * 2);
    ctx.fill();
    
    // Main ball with black outline (cartoon puck style)
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000000';
    ctx.fillStyle = COLORS.ball;
    ctx.shadowColor = COLORS.ball;
    ctx.shadowBlur = 16;
    
    // Check if ball is powered up for stretching effect
    const isPoweredUp = state.ball.powerUpMultiplier > 1.0;
    const stretchFactor = isPoweredUp ? 1.5 : 1.0;
    const stretchDirection = state.ball.vx > 0 ? 1 : -1;
    
    ctx.beginPath();
    if (isPoweredUp) {
      // Draw stretched ball (ellipse)
      ctx.save();
      ctx.translate(state.ball.x, state.ball.y);
      ctx.scale(stretchFactor, 1);
      ctx.arc(0, 0, SETTINGS.ball.radius, 0, Math.PI * 2);
      ctx.restore();
    } else {
      // Draw normal ball (circle)
      ctx.arc(state.ball.x, state.ball.y, SETTINGS.ball.radius, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
    
    ctx.restore();
  }

  function drawPowerUp() {
    state.powerUps.forEach(powerUp => {
      if (!powerUp.collected) {
        ctx.save();
        
        // Pulsing glow effect
        const pulse = Math.sin(Date.now() * 0.01) * 0.3 + 0.7;
        
        // Outer glow
        ctx.shadowColor = '#ff6b35';
        ctx.shadowBlur = 20 * pulse;
        ctx.fillStyle = 'rgba(255, 107, 53, 0.3)';
        ctx.beginPath();
        ctx.arc(powerUp.x, powerUp.y, powerUp.radius * 2, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner glow
        ctx.shadowColor = '#f7931e';
        ctx.shadowBlur = 12 * pulse;
        ctx.fillStyle = 'rgba(247, 147, 30, 0.6)';
        ctx.beginPath();
        ctx.arc(powerUp.x, powerUp.y, powerUp.radius * 1.4, 0, Math.PI * 2);
        ctx.fill();
        
        // Core marble
        ctx.shadowColor = '#f7931e';
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#ff6b35';
        ctx.beginPath();
        ctx.arc(powerUp.x, powerUp.y, powerUp.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Highlight - scaled for larger power-up
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.beginPath();
        ctx.arc(powerUp.x - powerUp.radius * 0.15, powerUp.y - powerUp.radius * 0.15, powerUp.radius * 0.2, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
      }
    });
  }

  function drawScore() {
    ctx.save();
    
    // HOLOGRAPHIC SCORE DISPLAY - TRON STYLE! 🌟
    const scorePositions = [
      { x: ARENA.width * 0.25, y: 18, score: state.left.score },
      { x: ARENA.width * 0.75, y: 18, score: state.right.score }
    ];
    
    scorePositions.forEach(pos => {
      // Outer glow effect
      ctx.shadowColor = '#f7931e';
      ctx.shadowBlur = 15;
      ctx.fillStyle = '#000000';
      ctx.font = '700 48px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(String(pos.score), pos.x + 2, pos.y + 2);
      
      // Main score with gradient
      const gradient = ctx.createLinearGradient(pos.x - 20, pos.y, pos.x + 20, pos.y + 50);
      gradient.addColorStop(0, '#fbbf24');
      gradient.addColorStop(0.5, '#f7931e');
      gradient.addColorStop(1, '#fbbf24');
      
      ctx.shadowColor = '#f7931e';
      ctx.shadowBlur = 8;
      ctx.fillStyle = gradient;
      ctx.fillText(String(pos.score), pos.x, pos.y);
    });
    
    ctx.restore();
  }

  function drawOverlay() {
    if (state.paused || !state.ball.inPlay || state.winner) {
      ctx.save();
      
      // FROST GLASS EFFECT - ULTRA HYPE! ❄️
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, 0, ARENA.width, ARENA.height);
      
      // Add frost texture
      for (let i = 0; i < 50; i++) {
        ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.1})`;
        ctx.fillRect(
          Math.random() * ARENA.width,
          Math.random() * ARENA.height,
          Math.random() * 3 + 1,
          Math.random() * 3 + 1
        );
      }
      
      // HOLOGRAPHIC TEXT WITH GLOW! 🌟
      const text = state.winner ? `${state.winner} WINS!` : (!state.ball.inPlay ? 'PRESS SPACE TO SERVE' : 'PAUSED');
      
      // Text shadow
      ctx.shadowColor = '#f7931e';
      ctx.shadowBlur = 20;
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 32px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto';
      ctx.fillText(text, ARENA.width / 2 + 3, ARENA.height / 2 + 3);
      
      // Main text with gradient
      const textGradient = ctx.createLinearGradient(
        ARENA.width / 2 - 100, ARENA.height / 2 - 20,
        ARENA.width / 2 + 100, ARENA.height / 2 + 20
      );
      textGradient.addColorStop(0, '#fbbf24');
      textGradient.addColorStop(0.5, '#f7931e');
      textGradient.addColorStop(1, '#fbbf24');
      
      ctx.shadowColor = '#f7931e';
      ctx.shadowBlur = 10;
      ctx.fillStyle = textGradient;
      ctx.fillText(text, ARENA.width / 2, ARENA.height / 2);
      
      // PULSING BORDER EFFECT! 💥
      const pulse = Math.sin(Date.now() * 0.005) * 0.2 + 0.8;
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = '#f7931e';
      ctx.lineWidth = 3;
      ctx.strokeRect(20, 20, ARENA.width - 40, ARENA.height - 40);
      
      ctx.restore();
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  let last = 0;
  function frame(ts) {
    const now = ts || performance.now();
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;

    update(dt);

    ctx.clearRect(0, 0, ARENA.width, ARENA.height);
    drawCourt();
    drawPaddle(state.left.x, state.left.y);
    drawPaddle(state.right.x, state.right.y);
    drawBall();
    drawPowerUp();
    drawScore();
    drawOverlay();

    requestAnimationFrame(frame);
  }

  // Initialize
  reset();
  // Show player selection on first load
  state.awaitingPlayerSelect = true;
  if (selectEl) selectEl.style.display = 'grid';
  setStatus('Select players: press 1 or 2');
  // Wire buttons
  btn1P?.addEventListener('click', () => choosePlayers(1));
  btn2P?.addEventListener('click', () => choosePlayers(2));
  btnEasy?.addEventListener('click', () => chooseDifficulty('easy'));
  btnMedium?.addEventListener('click', () => chooseDifficulty('medium'));
  btnHard?.addEventListener('click', () => chooseDifficulty('hard'));
  
  // Resume audio context on first user interaction
  document.addEventListener('click', () => {
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }, { once: true });
  
  requestAnimationFrame(frame);
})();


