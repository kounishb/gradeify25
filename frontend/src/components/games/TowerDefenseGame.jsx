import React, { useEffect, useMemo, useRef, useState } from "react";
import "../../styles/TowerDefenseGame.css";

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 540;

const PATH = [
  { x: 0, y: 270 },
  { x: 140, y: 270 },
  { x: 140, y: 120 },
  { x: 330, y: 120 },
  { x: 330, y: 410 },
  { x: 560, y: 410 },
  { x: 560, y: 190 },
  { x: 760, y: 190 },
  { x: 760, y: 320 },
  { x: 900, y: 320 },
];

const TOWER_TYPES = {
  basic: {
    name: "Basic",
    cost: 100,
    damage: 18,
    range: 115,
    fireRate: 620,
    radius: 16,
    description: "Balanced tower",
  },
  freeze: {
    name: "Freeze",
    cost: 140,
    damage: 7,
    range: 105,
    fireRate: 850,
    radius: 16,
    slowAmount: 0.45,
    slowDuration: 1100,
    description: "Slows enemies",
  },
  splash: {
    name: "Splash",
    cost: 180,
    damage: 12,
    range: 95,
    fireRate: 950,
    radius: 17,
    splashRadius: 55,
    description: "Hits nearby enemies",
  },
};

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointToSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  if (dx === 0 && dy === 0) return distance(point, start);

  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)
    )
  );

  return Math.hypot(
    point.x - (start.x + t * dx),
    point.y - (start.y + t * dy)
  );
}

function isTooCloseToPath(point) {
  for (let i = 0; i < PATH.length - 1; i++) {
    if (pointToSegmentDistance(point, PATH[i], PATH[i + 1]) < 42) {
      return true;
    }
  }
  return false;
}

function makeEnemy(wave, index) {
  const isTank = wave % 4 === 0 && index % 4 === 0;
  const isFast = wave % 3 === 0 && index % 3 === 0;

  return {
    id: `enemy-${Date.now()}-${Math.random()}`,
    x: PATH[0].x,
    y: PATH[0].y,
    pathIndex: 0,
    progress: 0,
    radius: isTank ? 17 : 13,
    maxHp: isTank ? 95 + wave * 14 : 45 + wave * 9,
    hp: isTank ? 95 + wave * 14 : 45 + wave * 9,
    speed: isFast ? 1.55 + wave * 0.04 : 1.05 + wave * 0.035,
    reward: isTank ? 22 : 12,
    type: isTank ? "tank" : isFast ? "fast" : "normal",
    slowUntil: 0,
    slowAmount: 1,
    reachedBase: false,
  };
}

function shuffleArray(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

function buildChoices(currentQuestion, allQuestions) {
  if (
    Array.isArray(currentQuestion.choices) &&
    currentQuestion.choices.length >= 2
  ) {
    const choices = [...currentQuestion.choices];

    if (!choices.includes(currentQuestion.correctAnswer)) {
      choices.push(currentQuestion.correctAnswer);
    }

    return shuffleArray([...new Set(choices)]).slice(0, 4);
  }

  const wrongAnswers = allQuestions
    .filter((q) => q.correctAnswer !== currentQuestion.correctAnswer)
    .map((q) => q.correctAnswer)
    .filter(Boolean);

  const uniqueWrong = [...new Set(wrongAnswers)];
  const choices = shuffleArray(uniqueWrong).slice(0, 3);

  while (choices.length < 3) {
    choices.push(`Option ${choices.length + 1}`);
  }

  return shuffleArray([currentQuestion.correctAnswer, ...choices]);
}

export default function TowerDefenseGame({ studySet, onExit }) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const gameRef = useRef(null);
  const autoWaveTimeoutRef = useRef(null);

  const questions = useMemo(() => {
    return studySet?.questions?.length ? studySet.questions : [];
  }, [studySet]);

  const [selectedTowerType, setSelectedTowerType] = useState("basic");
  const [coins, setCoins] = useState(180);
  const [baseHealth, setBaseHealth] = useState(20);
  const [wave, setWave] = useState(1);
  const [score, setScore] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  const [gameOver, setGameOver] = useState(false);
  const [message, setMessage] = useState(
    "Answer questions to earn coins. Click the map to place towers."
  );
  const [questionModal, setQuestionModal] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [streak, setStreak] = useState(0);
  const [answerFeedback, setAnswerFeedback] = useState(null);

  function clearAutoWaveTimer() {
    if (autoWaveTimeoutRef.current) {
      clearTimeout(autoWaveTimeoutRef.current);
      autoWaveTimeoutRef.current = null;
    }
  }

  function syncStateFromRef() {
    const game = gameRef.current;
    if (!game) return;

    setCoins(game.coins);
    setBaseHealth(game.baseHealth);
    setWave(game.wave);
    setScore(game.score);
    setGameOver(game.gameOver);
  }

  function launchWave(game) {
    game.waveInProgress = true;
    game.nextWaveReady = false;
    game.enemiesToSpawn = 7 + game.wave * 3;
    game.enemiesSpawned = 0;
    game.lastSpawnTime = 0;
  }

  function scheduleAutoWave(delayMs = 3000, customMessage = null) {
    clearAutoWaveTimer();

    autoWaveTimeoutRef.current = setTimeout(() => {
      const game = gameRef.current;
      if (!game || game.gameOver || game.waveInProgress || !isRunning) return;

      launchWave(game);
      setMessage(customMessage || `Wave ${game.wave} started automatically.`);
      syncStateFromRef();
    }, delayMs);
  }

  function resetGame() {
    clearAutoWaveTimer();

    const initialGame = {
      coins: 180,
      baseHealth: 20,
      wave: 1,
      score: 0,
      gameOver: false,
      towers: [],
      enemies: [],
      bullets: [],
      waveInProgress: false,
      enemiesToSpawn: 0,
      enemiesSpawned: 0,
      lastSpawnTime: 0,
      nextWaveReady: true,
      lastFrame: performance.now(),
    };

    gameRef.current = initialGame;

    setCoins(180);
    setBaseHealth(20);
    setWave(1);
    setScore(0);
    setGameOver(false);
    setIsRunning(true);
    setQuestionIndex(0);
    setStreak(0);
    setQuestionModal(null);
    setAnswerFeedback(null);
    setMessage("Get ready... the first wave starts automatically.");

    scheduleAutoWave(1200, "Wave 1 started automatically.");
  }

  useEffect(() => {
    resetGame();
  }, [studySet]);

  useEffect(() => {
    return () => {
      clearAutoWaveTimer();
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function handleCanvasClick(e) {
      const game = gameRef.current;
      if (!game || game.gameOver || !isRunning) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = CANVAS_WIDTH / rect.width;
      const scaleY = CANVAS_HEIGHT / rect.height;

      const clickPoint = {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };

      const towerType = TOWER_TYPES[selectedTowerType];

      if (game.coins < towerType.cost) {
        setMessage(`Not enough coins for ${towerType.name} Tower.`);
        return;
      }

      if (isTooCloseToPath(clickPoint)) {
        setMessage("You cannot place towers directly on the enemy path.");
        return;
      }

      const tooCloseToTower = game.towers.some(
        (tower) => distance(tower, clickPoint) < 42
      );

      if (tooCloseToTower) {
        setMessage("That spot is too close to another tower.");
        return;
      }

      game.towers.push({
        id: `tower-${Date.now()}-${Math.random()}`,
        x: clickPoint.x,
        y: clickPoint.y,
        type: selectedTowerType,
        level: 1,
        lastShot: 0,
      });

      game.coins -= towerType.cost;
      setMessage(`${towerType.name} Tower placed.`);
      syncStateFromRef();
    }

    canvas.addEventListener("click", handleCanvasClick);
    return () => canvas.removeEventListener("click", handleCanvasClick);
  }, [selectedTowerType, isRunning]);

  useEffect(() => {
    function gameLoop(now) {
      const game = gameRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");

      if (!game || !ctx) {
        animationRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      const delta = Math.min(32, now - game.lastFrame);
      game.lastFrame = now;

      if (isRunning && !game.gameOver) {
        updateGame(game, now, delta);
      }

      drawGame(ctx, game);
      animationRef.current = requestAnimationFrame(gameLoop);
    }

    animationRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isRunning]);

  function updateGame(game, now, delta) {
    if (game.waveInProgress && game.enemiesSpawned < game.enemiesToSpawn) {
      if (now - game.lastSpawnTime > 700) {
        game.enemies.push(makeEnemy(game.wave, game.enemiesSpawned));
        game.enemiesSpawned += 1;
        game.lastSpawnTime = now;
      }
    }

    game.enemies.forEach((enemy) => {
      moveEnemy(enemy, delta, now);
    });

    const enemiesThatReachedBase = game.enemies.filter(
      (enemy) => enemy.reachedBase
    );

    if (enemiesThatReachedBase.length > 0) {
      game.baseHealth -= enemiesThatReachedBase.length;
      game.enemies = game.enemies.filter((enemy) => !enemy.reachedBase);
      setBaseHealth(game.baseHealth);
    }

    if (game.baseHealth <= 0) {
      clearAutoWaveTimer();
      game.baseHealth = 0;
      game.gameOver = true;
      setGameOver(true);
      setIsRunning(false);
      setMessage("Game over. Your base was destroyed.");
      return;
    }

    game.towers.forEach((tower) => {
      const towerStats = TOWER_TYPES[tower.type];
      const levelMultiplier = 1 + (tower.level - 1) * 0.35;
      const range = towerStats.range + (tower.level - 1) * 8;
      const fireRate = Math.max(
        280,
        towerStats.fireRate - (tower.level - 1) * 65
      );

      if (now - tower.lastShot < fireRate) return;

      const target = game.enemies
        .filter((enemy) => distance(tower, enemy) <= range)
        .sort((a, b) => b.progress - a.progress)[0];

      if (!target) return;

      game.bullets.push({
        id: `bullet-${Date.now()}-${Math.random()}`,
        x: tower.x,
        y: tower.y,
        targetId: target.id,
        speed: 8.5,
        damage: towerStats.damage * levelMultiplier,
        type: tower.type,
        splashRadius: towerStats.splashRadius || 0,
        slowAmount: towerStats.slowAmount || 1,
        slowDuration: towerStats.slowDuration || 0,
      });

      tower.lastShot = now;
    });

    game.bullets.forEach((bullet) => {
      const target = game.enemies.find((enemy) => enemy.id === bullet.targetId);

      if (!target) {
        bullet.dead = true;
        return;
      }

      const dx = target.x - bullet.x;
      const dy = target.y - bullet.y;
      const dist = Math.hypot(dx, dy);

      if (dist < bullet.speed + target.radius) {
        if (bullet.splashRadius > 0) {
          game.enemies.forEach((enemy) => {
            if (distance(enemy, target) <= bullet.splashRadius) {
              enemy.hp -= bullet.damage;
            }
          });
        } else {
          target.hp -= bullet.damage;
        }

        if (bullet.slowDuration > 0) {
          target.slowUntil = now + bullet.slowDuration;
          target.slowAmount = bullet.slowAmount;
        }

        bullet.dead = true;
      } else {
        bullet.x += (dx / dist) * bullet.speed;
        bullet.y += (dy / dist) * bullet.speed;
      }
    });

    game.bullets = game.bullets.filter((bullet) => !bullet.dead);

    const defeated = game.enemies.filter((enemy) => enemy.hp <= 0);

    if (defeated.length > 0) {
      defeated.forEach((enemy) => {
        game.coins += enemy.reward;
        game.score += enemy.reward * 10;
      });

      game.enemies = game.enemies.filter((enemy) => enemy.hp > 0);
      syncStateFromRef();
    }

    if (
      game.waveInProgress &&
      game.enemiesSpawned >= game.enemiesToSpawn &&
      game.enemies.length === 0
    ) {
      game.waveInProgress = false;
      game.nextWaveReady = true;
      game.wave += 1;
      game.coins += 60;

      setMessage(
        `Wave cleared. Bonus +60 coins. Next wave starts in 3 seconds.`
      );
      syncStateFromRef();

      scheduleAutoWave(3000, `Wave ${game.wave} started automatically.`);
    }
  }

  function moveEnemy(enemy, delta, now) {
    if (enemy.pathIndex >= PATH.length - 1) {
      enemy.reachedBase = true;
      return;
    }

    const current = PATH[enemy.pathIndex];
    const next = PATH[enemy.pathIndex + 1];

    const dx = next.x - enemy.x;
    const dy = next.y - enemy.y;
    const dist = Math.hypot(dx, dy);

    const slowMultiplier = enemy.slowUntil > now ? enemy.slowAmount : 1;
    const movement = enemy.speed * slowMultiplier * (delta / 16);

    if (dist <= movement) {
      enemy.x = next.x;
      enemy.y = next.y;
      enemy.pathIndex += 1;

      if (enemy.pathIndex >= PATH.length - 1) {
        enemy.reachedBase = true;
      }
    } else {
      enemy.x += (dx / dist) * movement;
      enemy.y += (dy / dist) * movement;
    }

    enemy.progress =
      enemy.pathIndex + 1 - dist / Math.max(1, distance(current, next));
  }

  function drawGame(ctx, game) {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    drawBackground(ctx);
    drawDecorations(ctx);
    drawPath(ctx);
    drawSpawnGate(ctx);
    drawBase(ctx);
    drawTowers(ctx, game);
    drawEnemies(ctx, game);
    drawBullets(ctx, game);
    drawTopOverlay(ctx, game);

    if (!isRunning && !game.gameOver) {
      drawCenterText(ctx, "Paused");
    }

    if (game.gameOver) {
      drawCenterText(ctx, "Game Over");
    }
  }

  function drawBackground(ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, "#d9f99d");
    gradient.addColorStop(1, "#86efac");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  function drawDecorations(ctx) {
    ctx.save();

    for (let i = 0; i < 18; i++) {
      const x = 40 + i * 48;
      const y = 60 + (i % 5) * 85;

      ctx.fillStyle = "rgba(34,197,94,0.15)";
      ctx.beginPath();
      ctx.arc(x, y, 24, 0, Math.PI * 2);
      ctx.fill();
    }

    const rocks = [
      { x: 90, y: 70 },
      { x: 250, y: 485 },
      { x: 690, y: 90 },
      { x: 820, y: 430 },
      { x: 470, y: 65 },
    ];

    rocks.forEach((rock) => {
      ctx.fillStyle = "#94a3b8";
      ctx.beginPath();
      ctx.arc(rock.x, rock.y, 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#cbd5e1";
      ctx.beginPath();
      ctx.arc(rock.x - 3, rock.y - 3, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    const bushes = [
      { x: 205, y: 55 },
      { x: 380, y: 500 },
      { x: 620, y: 70 },
      { x: 760, y: 465 },
    ];

    bushes.forEach((bush) => {
      ctx.fillStyle = "#16a34a";
      ctx.beginPath();
      ctx.arc(bush.x, bush.y, 12, 0, Math.PI * 2);
      ctx.arc(bush.x + 10, bush.y - 4, 10, 0, Math.PI * 2);
      ctx.arc(bush.x - 10, bush.y - 4, 10, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  }

  function drawPath(ctx) {
    ctx.save();

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.strokeStyle = "#a16207";
    ctx.lineWidth = 60;
    ctx.beginPath();
    ctx.moveTo(PATH[0].x, PATH[0].y);
    for (let i = 1; i < PATH.length; i++) {
      ctx.lineTo(PATH[i].x, PATH[i].y);
    }
    ctx.stroke();

    ctx.strokeStyle = "#d6a34d";
    ctx.lineWidth = 44;
    ctx.beginPath();
    ctx.moveTo(PATH[0].x, PATH[0].y);
    for (let i = 1; i < PATH.length; i++) {
      ctx.lineTo(PATH[i].x, PATH[i].y);
    }
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 6;
    ctx.setLineDash([14, 16]);
    ctx.beginPath();
    ctx.moveTo(PATH[0].x, PATH[0].y);
    for (let i = 1; i < PATH.length; i++) {
      ctx.lineTo(PATH[i].x, PATH[i].y);
    }
    ctx.stroke();

    ctx.restore();
  }

  function drawSpawnGate(ctx) {
    ctx.save();

    ctx.fillStyle = "#78350f";
    ctx.fillRect(6, 238, 22, 64);

    ctx.fillStyle = "#92400e";
    ctx.beginPath();
    ctx.arc(28, 270, 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fde68a";
    ctx.beginPath();
    ctx.arc(28, 270, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawBase(ctx) {
    ctx.save();

    ctx.fillStyle = "#475569";
    ctx.beginPath();
    ctx.roundRect(825, 265, 58, 110, 14);
    ctx.fill();

    ctx.fillStyle = "#1e293b";
    ctx.beginPath();
    ctx.roundRect(836, 245, 36, 26, 8);
    ctx.fill();

    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.roundRect(845, 320, 18, 28, 6);
    ctx.fill();

    ctx.fillStyle = "#2563eb";
    ctx.fillRect(872, 235, 3, 22);
    ctx.beginPath();
    ctx.moveTo(875, 235);
    ctx.lineTo(888, 240);
    ctx.lineTo(875, 246);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("BASE", 854, 305);

    ctx.restore();
  }

  function drawTowers(ctx, game) {
    game.towers.forEach((tower) => {
      const stats = TOWER_TYPES[tower.type];
      const range = stats.range + (tower.level - 1) * 8;

      ctx.save();

      ctx.globalAlpha = 0.08;
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.arc(tower.x, tower.y, range, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.fillStyle = "#334155";
      ctx.beginPath();
      ctx.arc(tower.x, tower.y, 20, 0, Math.PI * 2);
      ctx.fill();

      if (tower.type === "basic") {
        ctx.fillStyle = "#2563eb";
        ctx.beginPath();
        ctx.arc(tower.x, tower.y, 14, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#1d4ed8";
        ctx.fillRect(tower.x - 4, tower.y - 18, 8, 22);
      }

      if (tower.type === "freeze") {
        ctx.fillStyle = "#06b6d4";
        ctx.beginPath();
        ctx.moveTo(tower.x, tower.y - 18);
        ctx.lineTo(tower.x + 12, tower.y);
        ctx.lineTo(tower.x, tower.y + 18);
        ctx.lineTo(tower.x - 12, tower.y);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = "#cffafe";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      if (tower.type === "splash") {
        ctx.fillStyle = "#7c3aed";
        ctx.beginPath();
        ctx.arc(tower.x, tower.y, 13, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#c4b5fd";
        ctx.beginPath();
        ctx.arc(tower.x, tower.y - 2, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "#5b21b6";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(tower.x + 6, tower.y - 6);
        ctx.lineTo(tower.x + 12, tower.y - 14);
        ctx.stroke();
      }

      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(tower.x + 14, tower.y - 14, 9, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 10px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(tower.level, tower.x + 14, tower.y - 11);

      ctx.restore();
    });
  }

  function drawEnemies(ctx, game) {
    game.enemies.forEach((enemy) => {
      ctx.save();

      ctx.globalAlpha = 0.16;
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.ellipse(enemy.x, enemy.y + enemy.radius + 4, enemy.radius, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      if (enemy.type === "tank") {
        ctx.fillStyle = "#b91c1c";
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#fecaca";
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y - 2, 5, 0, Math.PI * 2);
        ctx.fill();
      } else if (enemy.type === "fast") {
        ctx.fillStyle = "#ea580c";
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "#fdba74";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(enemy.x - 8, enemy.y + 2);
        ctx.lineTo(enemy.x + 8, enemy.y - 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = "#334155";
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#cbd5e1";
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y - 2, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      const hpPercent = Math.max(0, enemy.hp / enemy.maxHp);
      const barWidth = enemy.radius * 2.2;

      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(enemy.x - barWidth / 2, enemy.y - enemy.radius - 11, barWidth, 5);

      ctx.fillStyle =
        hpPercent > 0.5 ? "#22c55e" : hpPercent > 0.25 ? "#f59e0b" : "#ef4444";
      ctx.fillRect(
        enemy.x - barWidth / 2,
        enemy.y - enemy.radius - 11,
        barWidth * hpPercent,
        5
      );

      if (enemy.slowUntil > performance.now()) {
        ctx.strokeStyle = "#06b6d4";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius + 5, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    });
  }

  function drawBullets(ctx, game) {
    game.bullets.forEach((bullet) => {
      ctx.save();

      if (bullet.type === "basic") ctx.fillStyle = "#1d4ed8";
      if (bullet.type === "freeze") ctx.fillStyle = "#06b6d4";
      if (bullet.type === "splash") ctx.fillStyle = "#8b5cf6";

      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, 9, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    });
  }

  function drawTopOverlay(ctx, game) {
    ctx.save();

    ctx.fillStyle = "rgba(255,255,255,0.86)";
    ctx.beginPath();
    ctx.roundRect(18, 16, 360, 48, 14);
    ctx.fill();

    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 15px Inter, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Wave ${game.wave}`, 36, 46);
    ctx.fillText(`Coins ${game.coins}`, 128, 46);
    ctx.fillText(`Health ${game.baseHealth}`, 234, 46);
    ctx.fillText(`Score ${game.score}`, 320, 46);

    ctx.restore();
  }

  function drawCenterText(ctx, text) {
    ctx.save();

    ctx.fillStyle = "rgba(15, 23, 42, 0.72)";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 46px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);

    ctx.restore();
  }

  function startWave() {
    const game = gameRef.current;
    if (!game || game.gameOver) return;

    clearAutoWaveTimer();

    if (game.waveInProgress) {
      setMessage("Wave already in progress.");
      return;
    }

    launchWave(game);
    setMessage(`Wave ${game.wave} started.`);
    syncStateFromRef();
  }

  function openQuestion() {
    if (!questions.length) {
      setMessage("No study questions found.");
      return;
    }

    if (questionModal) return;

    const q = questions[questionIndex % questions.length];

    setAnswerFeedback(null);
    setQuestionModal({
      question: q,
      choices: buildChoices(q, questions),
      startedAt: Date.now(),
    });
  }

  function answerQuestion(choice) {
    const game = gameRef.current;
    if (!game || !questionModal || answerFeedback) return;

    const isCorrect = choice === questionModal.question.correctAnswer;
    const timeTaken = Date.now() - questionModal.startedAt;

    let earned = 0;

    if (isCorrect) {
      const speedBonus = timeTaken < 6000 ? 25 : 0;
      const streakBonus = streak >= 2 ? 20 : 0;
      earned = 75 + speedBonus + streakBonus;

      game.coins += earned;
      game.score += earned * 4;

      setStreak((prev) => prev + 1);
      setMessage(`Correct! +${earned} coins.`);
    } else {
      earned = 10;
      game.coins += earned;
      setStreak(0);
      setMessage(
        `Not quite. +10 coins. Correct answer: ${questionModal.question.correctAnswer}`
      );
    }

    syncStateFromRef();

    setAnswerFeedback({
      isCorrect,
      selectedChoice: choice,
      correctAnswer: questionModal.question.correctAnswer,
      earned,
    });
  }

  function continueAfterAnswer() {
    setQuestionIndex((prev) => prev + 1);
    setAnswerFeedback(null);
    setQuestionModal(null);
  }

  function upgradeLowestTower() {
    const game = gameRef.current;
    if (!game || !game.towers.length) {
      setMessage("Place a tower first.");
      return;
    }

    const lowestTower = [...game.towers].sort((a, b) => a.level - b.level)[0];
    const upgradeCost = 85 + lowestTower.level * 45;

    if (game.coins < upgradeCost) {
      setMessage(`Need ${upgradeCost} coins for an upgrade.`);
      return;
    }

    lowestTower.level += 1;
    game.coins -= upgradeCost;
    setMessage(`Tower upgraded to level ${lowestTower.level}.`);
    syncStateFromRef();
  }

  return (
    <div className="td-page">
      <div className="td-header">
        <div>
          <p className="td-eyebrow">Study Siege</p>
          <h1>{studySet?.title || "Tower Defense"}</h1>
        </div>

        <div className="td-header-actions">
          <button onClick={() => setIsRunning((prev) => !prev)}>
            {isRunning ? "Pause" : "Resume"}
          </button>
          <button onClick={resetGame}>Restart</button>
          <button className="secondary" onClick={onExit}>
            Exit
          </button>
        </div>
      </div>

      <div className="td-layout">
        <div className="td-main-card">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="td-canvas"
          />

          <div className="td-message">{message}</div>
        </div>

        <aside className="td-sidebar">
          <div className="td-stat-grid">
            <div>
              <span>Coins</span>
              <strong>{coins}</strong>
            </div>
            <div>
              <span>Health</span>
              <strong>{baseHealth}</strong>
            </div>
            <div>
              <span>Wave</span>
              <strong>{wave}</strong>
            </div>
            <div>
              <span>Score</span>
              <strong>{score}</strong>
            </div>
          </div>

          <div className="td-panel">
            <h3>Study Power</h3>
            <p>
              Answer questions to earn coins. Faster answers and streaks give bonuses.
            </p>

            <button className="td-primary-btn" onClick={openQuestion}>
              Answer Question
            </button>

            <div className="td-small-info">
              Streak: <strong>{streak}</strong>
            </div>
          </div>

          <div className="td-panel">
            <h3>Tower Shop</h3>

            <div className="tower-options">
              {Object.entries(TOWER_TYPES).map(([key, tower]) => (
                <button
                  key={key}
                  className={
                    selectedTowerType === key
                      ? "tower-option active"
                      : "tower-option"
                  }
                  onClick={() => setSelectedTowerType(key)}
                >
                  <div>
                    <strong>{tower.name}</strong>
                    <span>{tower.description}</span>
                  </div>
                  <em>{tower.cost}</em>
                </button>
              ))}
            </div>

            <button className="td-secondary-btn" onClick={upgradeLowestTower}>
              Upgrade Lowest Tower
            </button>
          </div>

          <div className="td-panel">
            <h3>Waves</h3>
            <p>
              Waves now auto-start. You can still manually send the next wave early.
            </p>

            <button
              className="td-primary-btn"
              onClick={startWave}
              disabled={gameOver}
            >
              Send Next Wave Now
            </button>
          </div>
        </aside>
      </div>

      {questionModal && (
        <div className="question-backdrop">
          <div className="question-modal">
            <div className="question-modal-header">
              <p>Earn Coins</p>
              <button
                onClick={() => {
                  setQuestionModal(null);
                  setAnswerFeedback(null);
                }}
              >
                ×
              </button>
            </div>

            <h2>{questionModal.question.question}</h2>

            <div className="choice-list">
              {questionModal.choices.map((choice, index) => {
                let className = "";

                if (answerFeedback) {
                  if (choice === answerFeedback.correctAnswer) {
                    className = "correct";
                  } else if (
                    choice === answerFeedback.selectedChoice &&
                    !answerFeedback.isCorrect
                  ) {
                    className = "wrong";
                  }
                }

                return (
                  <button
                    key={`${choice}-${index}`}
                    className={className}
                    onClick={() => answerQuestion(choice)}
                    disabled={!!answerFeedback}
                  >
                    {choice}
                  </button>
                );
              })}
            </div>

            {answerFeedback && (
              <div
                className={
                  answerFeedback.isCorrect
                    ? "answer-feedback correct-box"
                    : "answer-feedback wrong-box"
                }
              >
                <strong>
                  {answerFeedback.isCorrect ? "Correct!" : "Wrong answer"}
                </strong>
                <p>
                  {answerFeedback.isCorrect
                    ? `Nice job — you earned ${answerFeedback.earned} coins.`
                    : `The correct answer is: ${answerFeedback.correctAnswer}`}
                </p>

                <button className="td-primary-btn" onClick={continueAfterAnswer}>
                  Continue
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}