import React, { useEffect, useMemo, useRef, useState } from "react";
import "../../styles/TowerDefenseGame.css";

const CANVAS_WIDTH = 980;
const CANVAS_HEIGHT = 560;
const MAX_TOWER_LEVEL = 4;

const PATH = [
  { x: 0, y: 300 },
  { x: 130, y: 300 },
  { x: 130, y: 145 },
  { x: 330, y: 145 },
  { x: 330, y: 425 },
  { x: 585, y: 425 },
  { x: 585, y: 215 },
  { x: 785, y: 215 },
  { x: 785, y: 345 },
  { x: 980, y: 345 },
];

const TOWER_TYPES = {
  basic: {
    name: "Cannon",
    icon: "C",
    cost: 115,
    damage: 17,
    range: 112,
    fireRate: 680,
    description: "Balanced starter tower",
    upgradeText: [
      "Standard cannon shots.",
      "Stronger cannonballs.",
      "Double cannon unlocked.",
      "Armor breaker against tanks.",
    ],
  },
  freeze: {
    name: "Frost",
    icon: "F",
    cost: 155,
    damage: 6,
    range: 105,
    fireRate: 920,
    slowAmount: 0.48,
    slowDuration: 950,
    description: "Slows enemies",
    upgradeText: [
      "Slows one enemy.",
      "Longer freeze duration.",
      "Freeze splash unlocked.",
      "Deep freeze slows harder.",
    ],
  },
  splash: {
    name: "Mortar",
    icon: "M",
    cost: 205,
    damage: 13,
    range: 118,
    fireRate: 1120,
    splashRadius: 68,
    description: "Area damage",
    upgradeText: [
      "Large arcing explosion.",
      "Wider blast radius.",
      "Burn damage unlocked.",
      "Heavy shell explosion.",
    ],
  },
  sniper: {
    name: "Sniper",
    icon: "S",
    cost: 260,
    damage: 70,
    range: 260,
    fireRate: 1600,
    description: "Long range, high damage",
    upgradeText: [
      "Long range single shot.",
      "Higher damage.",
      "Tank piercer unlocked.",
      "Executes weak enemies.",
    ],
  },
  rapid: {
    name: "Rapid",
    icon: "R",
    cost: 155,
    damage: 7,
    range: 102,
    fireRate: 255,
    description: "Fast low-damage shots",
    upgradeText: [
      "Very fast shots.",
      "Faster firing.",
      "Double shot unlocked.",
      "Triple shot unlocked.",
    ],
  },
  laser: {
    name: "Laser",
    icon: "L",
    cost: 310,
    damage: 64,
    range: 150,
    fireRate: 0,
    description: "Continuous beam damage",
    upgradeText: [
      "Continuous beam damage.",
      "More range and damage.",
      "Chain beam unlocked.",
      "Stronger chain beam.",
    ],
  },
};

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function angleTo(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x);
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
    if (pointToSegmentDistance(point, PATH[i], PATH[i + 1]) < 48) {
      return true;
    }
  }
  return false;
}

function shuffleArray(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

function makeEnemy(wave, index) {
  const isTank = wave % 4 === 0 && index % 4 === 0;
  const isFast = wave % 3 === 0 && index % 3 === 0;
  const isShielded = wave >= 5 && index % 5 === 0;
  const isBoss = wave % 7 === 0 && index === 0;

  const hpMultiplier = 1 + wave * 0.2;

  const maxHp = isBoss
    ? 390 * hpMultiplier
    : isTank
    ? 142 * hpMultiplier
    : isShielded
    ? 88 * hpMultiplier
    : 62 * hpMultiplier;

  return {
    id: `enemy-${Date.now()}-${Math.random()}`,
    x: PATH[0].x,
    y: PATH[0].y,
    pathIndex: 0,
    progress: 0,
    radius: isBoss ? 24 : isTank ? 18 : isFast ? 12 : 14,
    maxHp,
    hp: maxHp,
    speed: isBoss
      ? 0.72 + wave * 0.015
      : isFast
      ? 1.85 + wave * 0.045
      : isTank
      ? 0.88 + wave * 0.026
      : 1.12 + wave * 0.038,
    reward: isBoss ? 48 : isTank ? 17 : isFast ? 10 : isShielded ? 13 : 8,
    type: isBoss
      ? "boss"
      : isTank
      ? "tank"
      : isFast
      ? "fast"
      : isShielded
      ? "shield"
      : "normal",
    slowUntil: 0,
    slowAmount: 1,
    burnUntil: 0,
    burnDps: 0,
    reachedBase: false,
  };
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

function getTowerStats(tower) {
  const base = TOWER_TYPES[tower.type];
  const level = tower.level || 1;

  const stats = {
    ...base,
    damage: base.damage * (1 + (level - 1) * 0.36),
    range: base.range + (level - 1) * 11,
    fireRate: Math.max(90, base.fireRate - (level - 1) * 55),
    splashRadius: base.splashRadius || 0,
    slowDuration: base.slowDuration || 0,
    slowAmount: base.slowAmount || 1,
    multiShot: 1,
    burnDps: 0,
    burnDuration: 0,
    chain: 0,
    tankPierce: false,
    execute: false,
  };

  if (tower.type === "basic") {
    if (level >= 3) stats.multiShot = 2;
    if (level >= 4) stats.tankPierce = true;
  }

  if (tower.type === "freeze") {
    stats.slowDuration = base.slowDuration + (level - 1) * 360;
    stats.slowAmount = Math.max(0.28, base.slowAmount - (level - 1) * 0.055);
    if (level >= 3) stats.splashRadius = 42;
    if (level >= 4) stats.splashRadius = 60;
  }

  if (tower.type === "splash") {
    stats.range = base.range + (level - 1) * 14;
    stats.splashRadius = base.splashRadius + (level - 1) * 18;

    if (level >= 3) {
      stats.burnDps = 7 + level * 2;
      stats.burnDuration = 1500 + level * 350;
    }
  }

  if (tower.type === "sniper") {
    stats.range = base.range + (level - 1) * 22;
    stats.fireRate = Math.max(820, base.fireRate - (level - 1) * 115);
    if (level >= 3) stats.tankPierce = true;
    if (level >= 4) stats.execute = true;
  }

  if (tower.type === "rapid") {
    stats.fireRate = Math.max(105, base.fireRate - (level - 1) * 30);
    if (level >= 3) stats.multiShot = 2;
    if (level >= 4) stats.multiShot = 3;
  }

  if (tower.type === "laser") {
    stats.range = base.range + (level - 1) * 18;
    stats.damage = base.damage * (1 + (level - 1) * 0.32);
    stats.chain = level >= 3 ? level - 2 : 0;
    stats.fireRate = 0;
  }

  return stats;
}

function getUpgradeCost(tower) {
  if (!tower || tower.level >= MAX_TOWER_LEVEL) return null;
  return Math.round(TOWER_TYPES[tower.type].cost * 0.95 + tower.level * 75);
}

export default function TowerDefenseGame({ studySet, onExit }) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const gameRef = useRef(null);
  const autoWaveTimeoutRef = useRef(null);
  const draggingRef = useRef(null);
  const selectedTowerIdRef = useRef(null);
  const isRunningRef = useRef(true);
  const ignoreNextClickRef = useRef(false);
  const wasRunningBeforeQuestionRef = useRef(true);

  const questions = useMemo(() => {
    return studySet?.questions?.length ? studySet.questions : [];
  }, [studySet]);

  const [selectedTowerType, setSelectedTowerType] = useState("basic");
  const [selectedTowerId, setSelectedTowerId] = useState(null);
  const [draggingTower, setDraggingTower] = useState(null);

  const [coins, setCoins] = useState(150);
  const [baseHealth, setBaseHealth] = useState(18);
  const [wave, setWave] = useState(1);
  const [score, setScore] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  const [gameOver, setGameOver] = useState(false);
  const [message, setMessage] = useState(
    "Drag towers from the bottom bar onto the map. Answer questions to earn coins."
  );
  const [questionModal, setQuestionModal] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [streak, setStreak] = useState(0);
  const [answerFeedback, setAnswerFeedback] = useState(null);

  const selectedTower = useMemo(() => {
    const game = gameRef.current;
    if (!game || !selectedTowerId) return null;
    return game.towers.find((tower) => tower.id === selectedTowerId) || null;
  }, [selectedTowerId, coins, wave, score]);

  const selectedTowerStats = selectedTower ? getTowerStats(selectedTower) : null;
  const selectedUpgradeCost = selectedTower ? getUpgradeCost(selectedTower) : null;

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    selectedTowerIdRef.current = selectedTowerId;
  }, [selectedTowerId]);

  function clearAutoWaveTimer() {
    if (autoWaveTimeoutRef.current) {
      clearTimeout(autoWaveTimeoutRef.current);
      autoWaveTimeoutRef.current = null;
    }
  }

  function syncStateFromRef() {
    const game = gameRef.current;
    if (!game) return;

    setCoins(Math.round(game.coins));
    setBaseHealth(game.baseHealth);
    setWave(game.wave);
    setScore(game.score);
    setGameOver(game.gameOver);
  }

  function pauseGameForQuestion() {
    const game = gameRef.current;
    wasRunningBeforeQuestionRef.current = isRunningRef.current;

    clearAutoWaveTimer();
    setIsRunning(false);
    isRunningRef.current = false;

    if (game && !game.gameOver) {
      setMessage("Question mode opened. Game paused.");
    }
  }

  function resumeAfterQuestionIfNeeded() {
    const game = gameRef.current;
    if (!game || game.gameOver) return;

    if (wasRunningBeforeQuestionRef.current) {
      setIsRunning(true);
      isRunningRef.current = true;

      if (!game.waveInProgress && game.nextWaveReady) {
        scheduleAutoWave(1200, `Wave ${game.wave} started automatically.`);
      }

      setMessage("Question mode closed. Game resumed.");
    } else {
      setMessage("Question mode closed. Game is still paused.");
    }
  }

  function getCanvasPointFromEvent(e) {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
      inside:
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom,
    };
  }

  function canvasToPercent(point) {
    return {
      left: `${(point.x / CANVAS_WIDTH) * 100}%`,
      top: `${(point.y / CANVAS_HEIGHT) * 100}%`,
    };
  }

  function canPlaceTower(point, type) {
    const game = gameRef.current;
    if (!game || !point?.inside) return false;

    const towerType = TOWER_TYPES[type];

    if (game.coins < towerType.cost) return false;
    if (point.x < 28 || point.x > CANVAS_WIDTH - 28) return false;
    if (point.y < 28 || point.y > CANVAS_HEIGHT - 28) return false;
    if (isTooCloseToPath(point)) return false;

    return !game.towers.some((tower) => distance(tower, point) < 52);
  }

  function placeTower(type, point) {
    const game = gameRef.current;
    if (!game || !canPlaceTower(point, type)) return false;

    const towerType = TOWER_TYPES[type];

    const newTower = {
      id: `tower-${Date.now()}-${Math.random()}`,
      x: point.x,
      y: point.y,
      type,
      level: 1,
      angle: -Math.PI / 2,
      lastShot: 0,
      lastPopup: 0,
      spent: towerType.cost,
      kills: 0,
    };

    game.towers.push(newTower);
    game.coins -= towerType.cost;

    setSelectedTowerId(newTower.id);
    selectedTowerIdRef.current = newTower.id;
    setMessage(`${towerType.name} placed.`);
    syncStateFromRef();
    return true;
  }

  function startTowerDrag(type, e) {
    e.preventDefault();

    setSelectedTowerType(type);
    setSelectedTowerId(null);
    selectedTowerIdRef.current = null;

    const point = getCanvasPointFromEvent(e);
    const valid = point ? canPlaceTower(point, type) : false;

    const drag = {
      type,
      clientX: e.clientX,
      clientY: e.clientY,
      canvasPoint: point,
      valid,
    };

    draggingRef.current = drag;
    setDraggingTower(drag);
  }

  useEffect(() => {
    function handlePointerMove(e) {
      const drag = draggingRef.current;
      if (!drag) return;

      const point = getCanvasPointFromEvent(e);
      const updatedDrag = {
        ...drag,
        clientX: e.clientX,
        clientY: e.clientY,
        canvasPoint: point,
        valid: point ? canPlaceTower(point, drag.type) : false,
      };

      draggingRef.current = updatedDrag;
      setDraggingTower(updatedDrag);
    }

    function handlePointerUp(e) {
      const drag = draggingRef.current;
      if (!drag) return;

      const point = getCanvasPointFromEvent(e);

      if (point && canPlaceTower(point, drag.type)) {
        placeTower(drag.type, point);
        ignoreNextClickRef.current = true;
      } else {
        setMessage("That tower cannot be placed there.");
      }

      draggingRef.current = null;
      setDraggingTower(null);

      setTimeout(() => {
        ignoreNextClickRef.current = false;
      }, 0);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  function launchWave(game) {
    game.waveInProgress = true;
    game.nextWaveReady = false;
    game.enemiesToSpawn = 9 + game.wave * 4;
    game.enemiesSpawned = 0;
    game.lastSpawnTime = 0;
  }

  function scheduleAutoWave(delayMs = 3000, customMessage = null) {
    clearAutoWaveTimer();

    autoWaveTimeoutRef.current = setTimeout(() => {
      const game = gameRef.current;
      if (!game || game.gameOver || game.waveInProgress || !isRunningRef.current) {
        return;
      }

      launchWave(game);
      setMessage(customMessage || `Wave ${game.wave} started automatically.`);
      syncStateFromRef();
    }, delayMs);
  }

  function resetGame() {
    clearAutoWaveTimer();

    const initialGame = {
      coins: 150,
      baseHealth: 18,
      wave: 1,
      score: 0,
      gameOver: false,
      towers: [],
      enemies: [],
      bullets: [],
      beams: [],
      explosions: [],
      damagePopups: [],
      waveInProgress: false,
      enemiesToSpawn: 0,
      enemiesSpawned: 0,
      lastSpawnTime: 0,
      nextWaveReady: true,
      lastFrame: performance.now(),
    };

    gameRef.current = initialGame;

    setCoins(150);
    setBaseHealth(18);
    setWave(1);
    setScore(0);
    setGameOver(false);
    setIsRunning(true);
    isRunningRef.current = true;
    wasRunningBeforeQuestionRef.current = true;
    setQuestionIndex(0);
    setStreak(0);
    setQuestionModal(null);
    setAnswerFeedback(null);
    setSelectedTowerId(null);
    selectedTowerIdRef.current = null;
    setMessage("Get ready. The first wave starts automatically.");

    scheduleAutoWave(1400, "Wave 1 started automatically.");
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
      if (ignoreNextClickRef.current) return;

      const game = gameRef.current;
      if (!game || game.gameOver) return;

      const point = getCanvasPointFromEvent(e);
      if (!point) return;

      const clickedTower = [...game.towers]
        .reverse()
        .find((tower) => distance(tower, point) <= 30);

      if (clickedTower) {
        setSelectedTowerId(clickedTower.id);
        selectedTowerIdRef.current = clickedTower.id;
        setMessage(`${TOWER_TYPES[clickedTower.type].name} selected.`);
      } else {
        setSelectedTowerId(null);
        selectedTowerIdRef.current = null;
      }
    }

    canvas.addEventListener("click", handleCanvasClick);
    return () => canvas.removeEventListener("click", handleCanvasClick);
  }, []);

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

      if (isRunningRef.current && !game.gameOver) {
        updateGame(game, now, delta);
      } else {
        updateVisualEffectsOnly(game, delta);
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
  }, []);

  function updateGame(game, now, delta) {
    if (game.waveInProgress && game.enemiesSpawned < game.enemiesToSpawn) {
      if (now - game.lastSpawnTime > Math.max(390, 690 - game.wave * 12)) {
        game.enemies.push(makeEnemy(game.wave, game.enemiesSpawned));
        game.enemiesSpawned += 1;
        game.lastSpawnTime = now;
      }
    }

    game.enemies.forEach((enemy) => {
      if (enemy.burnUntil > now) {
        enemy.hp -= enemy.burnDps * (delta / 1000);
      }

      moveEnemy(enemy, delta, now);
    });

    const enemiesThatReachedBase = game.enemies.filter(
      (enemy) => enemy.reachedBase
    );

    if (enemiesThatReachedBase.length > 0) {
      game.baseHealth -= enemiesThatReachedBase.reduce((total, enemy) => {
        return total + (enemy.type === "boss" ? 3 : enemy.type === "tank" ? 2 : 1);
      }, 0);

      game.enemies = game.enemies.filter((enemy) => !enemy.reachedBase);
      setBaseHealth(game.baseHealth);
    }

    if (game.baseHealth <= 0) {
      clearAutoWaveTimer();
      game.baseHealth = 0;
      game.gameOver = true;
      setGameOver(true);
      setIsRunning(false);
      isRunningRef.current = false;
      setMessage("Game over. Your base was destroyed.");
      return;
    }

    game.towers.forEach((tower) => fireTower(game, tower, now, delta));

    updateBullets(game, now, delta);
    updateBeamsExplosionsAndPopups(game, delta);
    removeDefeatedEnemies(game);

    if (
      game.waveInProgress &&
      game.enemiesSpawned >= game.enemiesToSpawn &&
      game.enemies.length === 0
    ) {
      game.waveInProgress = false;
      game.nextWaveReady = true;
      game.wave += 1;
      game.coins += 28;

      setMessage(`Wave cleared. Bonus +28 coins. Next wave starts soon.`);
      syncStateFromRef();

      scheduleAutoWave(2700, `Wave ${game.wave} started automatically.`);
    }
  }

  function updateVisualEffectsOnly(game, delta) {
    updateBeamsExplosionsAndPopups(game, delta);
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

  function getEnemiesInRange(game, tower, stats) {
    return game.enemies
      .filter((enemy) => enemy.hp > 0 && distance(tower, enemy) <= stats.range)
      .sort((a, b) => b.progress - a.progress);
  }

  function fireTower(game, tower, now, delta) {
    const stats = getTowerStats(tower);
    const enemiesInRange = getEnemiesInRange(game, tower, stats);

    if (!enemiesInRange.length) return;

    const target = enemiesInRange[0];
    tower.angle = angleTo(tower, target);

    if (tower.type === "laser") {
      const damage = stats.damage * (delta / 1000);
      applyDamage(game, target, damage, tower, now, {
        ...stats,
        silent: true,
      });

      game.beams.push({
        id: `beam-${Date.now()}-${Math.random()}`,
        x1: tower.x,
        y1: tower.y,
        x2: target.x,
        y2: target.y,
        life: 46,
        maxLife: 46,
        width: 6 + tower.level,
        type: "laser",
      });

      if (now - tower.lastPopup > 450) {
        tower.lastPopup = now;
        game.damagePopups.push({
          id: `popup-${Date.now()}-${Math.random()}`,
          x: target.x,
          y: target.y - target.radius,
          text: Math.round(stats.damage).toString(),
          life: 520,
          color: "#db2777",
        });
      }

      if (stats.chain > 0) {
        const chainTargets = enemiesInRange
          .filter((enemy) => enemy.id !== target.id && distance(enemy, target) <= 105)
          .slice(0, stats.chain);

        chainTargets.forEach((enemy) => {
          applyDamage(game, enemy, damage * 0.55, tower, now, {
            ...stats,
            silent: true,
          });

          game.beams.push({
            id: `beam-chain-${Date.now()}-${Math.random()}`,
            x1: target.x,
            y1: target.y,
            x2: enemy.x,
            y2: enemy.y,
            life: 46,
            maxLife: 46,
            width: 3 + tower.level * 0.6,
            type: "laser-chain",
          });
        });
      }

      return;
    }

    if (now - tower.lastShot < stats.fireRate) return;

    const targets = enemiesInRange.slice(0, stats.multiShot);

    targets.forEach((shotTarget, index) => {
      if (index === 0) tower.angle = angleTo(tower, shotTarget);

      const isMortar = tower.type === "splash";

      game.bullets.push({
        id: `bullet-${Date.now()}-${Math.random()}`,
        x: tower.x,
        y: tower.y,
        startX: tower.x,
        startY: tower.y,
        targetX: shotTarget.x,
        targetY: shotTarget.y,
        targetId: shotTarget.id,
        speed: tower.type === "sniper" ? 18 : tower.type === "rapid" ? 11 : 8.8,
        damage: stats.damage,
        type: tower.type,
        towerId: tower.id,
        splashRadius: stats.splashRadius || 0,
        slowAmount: stats.slowAmount || 1,
        slowDuration: stats.slowDuration || 0,
        burnDps: stats.burnDps || 0,
        burnDuration: stats.burnDuration || 0,
        tankPierce: stats.tankPierce,
        execute: stats.execute,
        mode: isMortar ? "arc" : "direct",
        startTime: now,
        duration: isMortar ? 680 : 0,
        arcHeight: isMortar ? 105 + tower.level * 16 : 0,
      });
    });

    tower.lastShot = now;
  }

  function updateBullets(game, now, delta) {
    game.bullets.forEach((bullet) => {
      const target = game.enemies.find((enemy) => enemy.id === bullet.targetId);

      if (bullet.mode === "arc") {
        if (target) {
          bullet.targetX = target.x;
          bullet.targetY = target.y;
        }

        const t = Math.min(1, (now - bullet.startTime) / bullet.duration);
        const eased = t;
        const arc = Math.sin(Math.PI * t) * bullet.arcHeight;

        bullet.x = bullet.startX + (bullet.targetX - bullet.startX) * eased;
        bullet.y = bullet.startY + (bullet.targetY - bullet.startY) * eased - arc;

        if (t >= 1) {
          explodeBullet(game, bullet, now, {
            x: bullet.targetX,
            y: bullet.targetY,
          });
          bullet.dead = true;
        }

        return;
      }

      if (!target) {
        bullet.dead = true;
        return;
      }

      const dx = target.x - bullet.x;
      const dy = target.y - bullet.y;
      const dist = Math.hypot(dx, dy);
      const movement = bullet.speed * (delta / 16);

      if (dist < movement + target.radius) {
        if (bullet.splashRadius > 0) {
          explodeBullet(game, bullet, now, target);
        } else {
          const tower = game.towers.find((t) => t.id === bullet.towerId);
          applyDamage(game, target, bullet.damage, tower, now, bullet);

          if (bullet.slowDuration > 0) {
            target.slowUntil = now + bullet.slowDuration;
            target.slowAmount = bullet.slowAmount;
          }

          if (bullet.burnDuration > 0) {
            target.burnUntil = now + bullet.burnDuration;
            target.burnDps = bullet.burnDps;
          }
        }

        bullet.dead = true;
      } else {
        bullet.x += (dx / dist) * movement;
        bullet.y += (dy / dist) * movement;
      }
    });

    game.bullets = game.bullets.filter((bullet) => !bullet.dead);
  }

  function explodeBullet(game, bullet, now, center) {
    const tower = game.towers.find((t) => t.id === bullet.towerId);
    const radius = bullet.splashRadius || 0;

    game.explosions.push({
      id: `explosion-${Date.now()}-${Math.random()}`,
      x: center.x,
      y: center.y,
      radius,
      life: 280,
      maxLife: 280,
      type: bullet.type,
    });

    game.enemies.forEach((enemy) => {
      const dist = distance(enemy, center);

      if (dist <= radius) {
        const falloff = Math.max(0.55, 1 - dist / Math.max(1, radius) * 0.35);
        applyDamage(game, enemy, bullet.damage * falloff, tower, now, bullet);

        if (bullet.slowDuration > 0) {
          enemy.slowUntil = now + bullet.slowDuration;
          enemy.slowAmount = bullet.slowAmount;
        }

        if (bullet.burnDuration > 0) {
          enemy.burnUntil = now + bullet.burnDuration;
          enemy.burnDps = bullet.burnDps;
        }
      }
    });
  }

  function applyDamage(game, enemy, rawDamage, tower, now, source) {
    if (!enemy || enemy.hp <= 0) return;

    const wasAlive = enemy.hp > 0;
    let damage = rawDamage;

    if (source?.tankPierce && (enemy.type === "tank" || enemy.type === "boss")) {
      damage *= 1.45;
    }

    if (source?.execute && enemy.hp / enemy.maxHp < 0.18) {
      damage = enemy.hp + 1;
    }

    if (enemy.type === "shield" && !source?.tankPierce) {
      damage *= 0.68;
    }

    enemy.hp -= damage;

    if (!source?.silent) {
      game.damagePopups.push({
        id: `popup-${Date.now()}-${Math.random()}`,
        x: enemy.x,
        y: enemy.y - enemy.radius,
        text: Math.round(damage).toString(),
        life: 600,
        color: source?.execute && enemy.hp <= 0 ? "#facc15" : "#ffffff",
      });
    }

    if (tower && wasAlive && enemy.hp <= 0) {
      tower.kills = (tower.kills || 0) + 1;
    }
  }

  function updateBeamsExplosionsAndPopups(game, delta) {
    game.beams.forEach((beam) => {
      beam.life -= delta;
    });

    game.explosions.forEach((explosion) => {
      explosion.life -= delta;
    });

    game.damagePopups.forEach((popup) => {
      popup.life -= delta;
      popup.y -= 0.35 * (delta / 16);
    });

    game.beams = game.beams.filter((beam) => beam.life > 0);
    game.explosions = game.explosions.filter((explosion) => explosion.life > 0);
    game.damagePopups = game.damagePopups.filter((popup) => popup.life > 0);
  }

  function removeDefeatedEnemies(game) {
    const defeated = game.enemies.filter((enemy) => enemy.hp <= 0);

    if (defeated.length > 0) {
      defeated.forEach((enemy) => {
        game.coins += enemy.reward;
        game.score += enemy.reward * 10;
      });

      game.enemies = game.enemies.filter((enemy) => enemy.hp > 0);
      syncStateFromRef();
    }
  }

  // ─── DRAWING FUNCTIONS ────────────────────────────────────────────────

  function drawGame(ctx, game) {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    drawBackground(ctx);
    drawDecorations(ctx);
    drawPath(ctx);
    drawSpawnGate(ctx);
    drawBase(ctx);
    drawTowers(ctx, game);
    drawPlacementPreview(ctx);
    drawEnemies(ctx, game);
    drawBullets(ctx, game);
    drawBeams(ctx, game);
    drawExplosions(ctx, game);
    drawDamagePopups(ctx, game);
    drawTopOverlay(ctx, game);

    if (!isRunningRef.current && !game.gameOver) {
      drawPauseBadge(ctx, questionModal ? "⚡ QUESTION MODE" : "⏸ PAUSED");
    }

    if (game.gameOver) {
      drawGameOver(ctx);
    }
  }

  function drawBackground(ctx) {
    // Dark sci-fi ground with subtle grid
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, "#0d1520");
    gradient.addColorStop(1, "#0a1118");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Subtle hex-grid pattern
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 0.5;
    const hexSize = 38;
    const cols = Math.ceil(CANVAS_WIDTH / hexSize) + 2;
    const rows = Math.ceil(CANVAS_HEIGHT / hexSize) + 2;
    for (let row = -1; row < rows; row++) {
      for (let col = -1; col < cols; col++) {
        const x = col * hexSize + (row % 2 === 0 ? 0 : hexSize / 2);
        const y = row * hexSize * 0.86;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 6;
          const px = x + (hexSize / 2) * Math.cos(angle);
          const py = y + (hexSize / 2) * Math.sin(angle);
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.restore();

    // Subtle glow zones near base and spawn
    ctx.save();
    const spawnGlow = ctx.createRadialGradient(0, 300, 0, 0, 300, 120);
    spawnGlow.addColorStop(0, "rgba(239,68,68,0.06)");
    spawnGlow.addColorStop(1, "transparent");
    ctx.fillStyle = spawnGlow;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const baseGlow = ctx.createRadialGradient(980, 345, 0, 980, 345, 150);
    baseGlow.addColorStop(0, "rgba(59,130,246,0.07)");
    baseGlow.addColorStop(1, "transparent");
    ctx.fillStyle = baseGlow;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.restore();
  }

  function drawDecorations(ctx) {
    ctx.save();

    // Futuristic crystal clusters
    const crystals = [
      { x: 55, y: 65 },
      { x: 885, y: 70 },
      { x: 915, y: 115 },
      { x: 865, y: 500 },
      { x: 80, y: 495 },
      { x: 475, y: 70 },
    ];

    crystals.forEach((pos) => {
      // Glow under crystal
      const glow = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 28);
      glow.addColorStop(0, "rgba(6,182,212,0.18)");
      glow.addColorStop(1, "transparent");
      ctx.fillStyle = glow;
      ctx.fillRect(pos.x - 28, pos.y - 28, 56, 56);

      // Crystal spires
      [[0, -22, 6], [-12, -10, 5], [12, -8, 5], [6, -16, 4], [-6, -14, 4]].forEach(([dx, dy, h]) => {
        ctx.fillStyle = "rgba(6,182,212,0.55)";
        ctx.strokeStyle = "rgba(103,232,249,0.8)";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(pos.x + dx, pos.y + 8);
        ctx.lineTo(pos.x + dx - 4, pos.y + dy + h);
        ctx.lineTo(pos.x + dx, pos.y + dy);
        ctx.lineTo(pos.x + dx + 4, pos.y + dy + h);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      });

      // Bright tip
      ctx.fillStyle = "#67e8f9";
      ctx.beginPath();
      ctx.arc(pos.x, pos.y - 22, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Futuristic sensor nodes (replacing rocks)
    const nodes = [
      { x: 215, y: 70 },
      { x: 250, y: 515 },
      { x: 690, y: 94 },
      { x: 825, y: 450 },
      { x: 465, y: 78 },
    ];

    nodes.forEach((node) => {
      ctx.strokeStyle = "rgba(99,155,255,0.4)";
      ctx.lineWidth = 1;
      ctx.fillStyle = "rgba(30,46,80,0.8)";
      ctx.beginPath();
      ctx.arc(node.x, node.y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Inner dot
      ctx.fillStyle = "#3b82f6";
      ctx.beginPath();
      ctx.arc(node.x, node.y, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Pulse ring
      ctx.strokeStyle = "rgba(59,130,246,0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(node.x, node.y, 18, 0, Math.PI * 2);
      ctx.stroke();
    });

    ctx.restore();
  }

  function drawPath(ctx) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Outer shadow
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 18;
    ctx.strokeStyle = "#050a10";
    ctx.lineWidth = 72;
    ctx.beginPath();
    ctx.moveTo(PATH[0].x, PATH[0].y);
    for (let i = 1; i < PATH.length; i++) ctx.lineTo(PATH[i].x, PATH[i].y);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Dark tarmac base
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 62;
    ctx.beginPath();
    ctx.moveTo(PATH[0].x, PATH[0].y);
    for (let i = 1; i < PATH.length; i++) ctx.lineTo(PATH[i].x, PATH[i].y);
    ctx.stroke();

    // Mid-tone road
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 52;
    ctx.beginPath();
    ctx.moveTo(PATH[0].x, PATH[0].y);
    for (let i = 1; i < PATH.length; i++) ctx.lineTo(PATH[i].x, PATH[i].y);
    ctx.stroke();

    // Edge glow lines
    ctx.strokeStyle = "rgba(59,130,246,0.2)";
    ctx.lineWidth = 54;
    ctx.beginPath();
    ctx.moveTo(PATH[0].x, PATH[0].y);
    for (let i = 1; i < PATH.length; i++) ctx.lineTo(PATH[i].x, PATH[i].y);
    ctx.stroke();

    // Inner road surface
    ctx.strokeStyle = "#263045";
    ctx.lineWidth = 46;
    ctx.beginPath();
    ctx.moveTo(PATH[0].x, PATH[0].y);
    for (let i = 1; i < PATH.length; i++) ctx.lineTo(PATH[i].x, PATH[i].y);
    ctx.stroke();

    // Glowing dashed center line
    ctx.strokeStyle = "rgba(59,130,246,0.55)";
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 14]);
    ctx.lineDashOffset = (performance.now() / 40) % 24;
    ctx.beginPath();
    ctx.moveTo(PATH[0].x, PATH[0].y);
    for (let i = 1; i < PATH.length; i++) ctx.lineTo(PATH[i].x, PATH[i].y);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawSpawnGate(ctx) {
    ctx.save();

    // Gate post
    const postGrad = ctx.createLinearGradient(4, 260, 28, 260);
    postGrad.addColorStop(0, "#1e293b");
    postGrad.addColorStop(1, "#374151");
    ctx.fillStyle = postGrad;
    ctx.beginPath();
    ctx.roundRect(4, 258, 24, 84, 4);
    ctx.fill();
    ctx.strokeStyle = "rgba(239,68,68,0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Glowing circle
    const circleGlow = ctx.createRadialGradient(34, 300, 0, 34, 300, 24);
    circleGlow.addColorStop(0, "rgba(239,68,68,0.6)");
    circleGlow.addColorStop(0.6, "rgba(239,68,68,0.2)");
    circleGlow.addColorStop(1, "transparent");
    ctx.fillStyle = circleGlow;
    ctx.beginPath();
    ctx.arc(34, 300, 28, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#1e293b";
    ctx.beginPath();
    ctx.arc(34, 300, 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(239,68,68,0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(34, 300, 18, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(34, 300, 7, 0, Math.PI * 2);
    ctx.fill();

    // SPAWN label
    ctx.fillStyle = "rgba(239,68,68,0.8)";
    ctx.font = "bold 7px monospace";
    ctx.textAlign = "center";
    ctx.fillText("SPAWN", 34, 326);

    ctx.restore();
  }

  function drawBase(ctx) {
    ctx.save();

    // Base glow
    const baseGlow = ctx.createRadialGradient(946, 349, 0, 946, 349, 70);
    baseGlow.addColorStop(0, "rgba(59,130,246,0.2)");
    baseGlow.addColorStop(1, "transparent");
    ctx.fillStyle = baseGlow;
    ctx.fillRect(876, 279, 140, 140);

    // Main body
    const bodyGrad = ctx.createLinearGradient(918, 298, 974, 400);
    bodyGrad.addColorStop(0, "#1e3a5f");
    bodyGrad.addColorStop(1, "#0f1f40");
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(918, 298, 56, 102, 14);
    ctx.fill();

    ctx.strokeStyle = "rgba(59,130,246,0.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(918, 298, 56, 102, 14);
    ctx.stroke();

    // Top turret
    const turretGrad = ctx.createLinearGradient(929, 278, 964, 303);
    turretGrad.addColorStop(0, "#1e40af");
    turretGrad.addColorStop(1, "#1d3a7a");
    ctx.fillStyle = turretGrad;
    ctx.beginPath();
    ctx.roundRect(929, 278, 35, 25, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(59,130,246,0.6)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Door
    ctx.fillStyle = "#0a1628";
    ctx.beginPath();
    ctx.roundRect(938, 350, 18, 28, 6);
    ctx.fill();
    ctx.strokeStyle = "rgba(59,130,246,0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Flag
    ctx.fillStyle = "#2563eb";
    ctx.fillRect(964, 268, 2.5, 20);
    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    ctx.moveTo(966.5, 268);
    ctx.lineTo(979, 274);
    ctx.lineTo(966.5, 280);
    ctx.closePath();
    ctx.fill();

    // BASE label
    ctx.fillStyle = "#93c5fd";
    ctx.font = "bold 9px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillText("BASE", 946, 332);

    // Glowing accent dots
    [[922, 308], [966, 308], [922, 388], [966, 388]].forEach(([x, y]) => {
      ctx.fillStyle = "rgba(59,130,246,0.7)";
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  }

  function drawTowers(ctx, game) {
    game.towers.forEach((tower) => {
      const stats = getTowerStats(tower);
      const isSelected = tower.id === selectedTowerIdRef.current;

      ctx.save();

      if (isSelected) {
        // Range ring with pulsing glow
        const rangeGrad = ctx.createRadialGradient(tower.x, tower.y, stats.range - 4, tower.x, tower.y, stats.range + 4);
        rangeGrad.addColorStop(0, "rgba(245,158,11,0.15)");
        rangeGrad.addColorStop(0.5, "rgba(245,158,11,0.35)");
        rangeGrad.addColorStop(1, "transparent");
        ctx.fillStyle = rangeGrad;
        ctx.beginPath();
        ctx.arc(tower.x, tower.y, stats.range + 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "rgba(245,158,11,0.8)";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.arc(tower.x, tower.y, stats.range, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.shadowColor = "#f59e0b";
        ctx.shadowBlur = 20;
      }

      drawTowerSprite(ctx, tower);
      ctx.shadowBlur = 0;

      // Level badge
      const levelColors = ["", "#22c55e", "#3b82f6", "#a855f7", "#f59e0b"];
      ctx.fillStyle = levelColors[tower.level] || "#22c55e";
      ctx.beginPath();
      ctx.arc(tower.x + 16, tower.y - 17, 9, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#fff";
      ctx.font = "bold 9px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.fillText(tower.level, tower.x + 16, tower.y - 14);

      ctx.restore();
    });
  }

  function drawTowerBase(ctx, tower, color) {
    const level = tower.level || 1;

    // Shadow
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(tower.x + 2, tower.y + 22, 24, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Platform
    const baseGrad = ctx.createLinearGradient(tower.x - 22, tower.y + 4, tower.x + 22, tower.y + 24);
    baseGrad.addColorStop(0, "#1e293b");
    baseGrad.addColorStop(1, "#0f172a");
    ctx.fillStyle = baseGrad;
    ctx.beginPath();
    ctx.roundRect(tower.x - 22, tower.y + 4, 44, 20, 7);
    ctx.fill();

    ctx.strokeStyle = color + "66";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(tower.x - 22, tower.y + 4, 44, 20, 7);
    ctx.stroke();

    if (level >= 2) {
      ctx.fillStyle = "#263045";
      ctx.beginPath();
      ctx.roundRect(tower.x - 17, tower.y, 34, 11, 5);
      ctx.fill();
    }

    if (level >= 3) {
      ctx.strokeStyle = color + "aa";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(tower.x - 16, tower.y + 7, 32, 9);
    }

    if (level >= 4) {
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(tower.x - 19, tower.y + 8, 3.5, 0, Math.PI * 2);
      ctx.arc(tower.x + 19, tower.y + 8, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  function drawRotatingBarrel(ctx, tower, length, width, color, tipColor = "#ffffff") {
    const angle = tower.angle ?? -Math.PI / 2;

    ctx.save();
    ctx.translate(tower.x, tower.y);
    ctx.rotate(angle);

    // Barrel gradient
    const barrelGrad = ctx.createLinearGradient(0, -width / 2, 0, width / 2);
    barrelGrad.addColorStop(0, lightenColor(color, 30));
    barrelGrad.addColorStop(0.5, color);
    barrelGrad.addColorStop(1, darkenColor(color, 30));
    ctx.fillStyle = barrelGrad;
    ctx.beginPath();
    ctx.roundRect(0, -width / 2, length, width, width / 2);
    ctx.fill();

    // Barrel highlight
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.roundRect(2, -width / 2 + 1, length - 6, width * 0.4, (width * 0.4) / 2);
    ctx.fill();

    // Tip
    ctx.fillStyle = tipColor;
    ctx.shadowColor = tipColor;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(length, 0, width * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  function lightenColor(hex, amount) {
    const num = parseInt(hex.replace("#", ""), 16);
    const r = Math.min(255, (num >> 16) + amount);
    const g = Math.min(255, ((num >> 8) & 0xff) + amount);
    const b = Math.min(255, (num & 0xff) + amount);
    return `rgb(${r},${g},${b})`;
  }

  function darkenColor(hex, amount) {
    const num = parseInt(hex.replace("#", ""), 16);
    const r = Math.max(0, (num >> 16) - amount);
    const g = Math.max(0, ((num >> 8) & 0xff) - amount);
    const b = Math.max(0, (num & 0xff) - amount);
    return `rgb(${r},${g},${b})`;
  }

  function drawTowerSprite(ctx, tower) {
    const level = tower.level || 1;

    ctx.save();

    if (tower.type === "basic") {
      drawTowerBase(ctx, tower, "#2563eb");

      // Body with metallic gradient
      const bodyGrad = ctx.createLinearGradient(tower.x - 16, tower.y - 14, tower.x + 16, tower.y + 14);
      bodyGrad.addColorStop(0, level >= 4 ? "#1e40af" : "#2563eb");
      bodyGrad.addColorStop(1, level >= 4 ? "#1d3a8a" : "#1d4ed8");
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.roundRect(tower.x - 16, tower.y - 14, 32, 28, 9);
      ctx.fill();

      ctx.strokeStyle = "rgba(147,197,253,0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(tower.x - 16, tower.y - 14, 32, 28, 9);
      ctx.stroke();

      if (level >= 3) {
        drawRotatingBarrel(ctx, { ...tower, y: tower.y - 5 }, 33, 8, "#1e3a8a", "#93c5fd");
        drawRotatingBarrel(ctx, { ...tower, y: tower.y + 4 }, 31, 7, "#1e3a8a", "#93c5fd");
      } else {
        drawRotatingBarrel(ctx, tower, 34 + level * 3, 9, "#1e3a8a", "#93c5fd");
      }

      // Core gem
      ctx.fillStyle = "#93c5fd";
      ctx.shadowColor = "#3b82f6";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(tower.x, tower.y, 5 + level * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    if (tower.type === "freeze") {
      drawTowerBase(ctx, tower, "#06b6d4");

      const bodyGrad = ctx.createLinearGradient(tower.x - 16, tower.y - 8, tower.x + 16, tower.y + 18);
      bodyGrad.addColorStop(0, level >= 4 ? "#0e7490" : "#0891b2");
      bodyGrad.addColorStop(1, "#0c5a72");
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.roundRect(tower.x - 16, tower.y - 8, 32, 26, 8);
      ctx.fill();
      ctx.strokeStyle = "rgba(103,232,249,0.4)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.save();
      ctx.translate(tower.x, tower.y);
      ctx.rotate(tower.angle ?? -Math.PI / 2);

      // Ice shard projectile shape
      const shardGrad = ctx.createLinearGradient(0, -(13 + level), 36 + level * 3, 0);
      shardGrad.addColorStop(0, "#a5f3fc");
      shardGrad.addColorStop(1, "#06b6d4");
      ctx.fillStyle = shardGrad;
      ctx.beginPath();
      ctx.moveTo(36 + level * 3, 0);
      ctx.lineTo(8, 13 + level);
      ctx.lineTo(-8, 0);
      ctx.lineTo(8, -13 - level);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "#ecfeff";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.restore();

      if (level >= 3) {
        ctx.strokeStyle = "rgba(103,232,249,0.4)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.arc(tower.x, tower.y, 16 + level * 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    if (tower.type === "splash") {
      drawTowerBase(ctx, tower, "#7c3aed");

      const bodyGrad = ctx.createLinearGradient(tower.x - 18, tower.y - 10, tower.x + 18, tower.y + 20);
      bodyGrad.addColorStop(0, level >= 4 ? "#4c1d95" : "#5b21b6");
      bodyGrad.addColorStop(1, "#3b0f6b");
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.roundRect(tower.x - 18, tower.y - 10, 36, 30, 10);
      ctx.fill();
      ctx.strokeStyle = "rgba(167,139,250,0.4)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Mortar sphere
      const sphereGrad = ctx.createRadialGradient(tower.x - 2, tower.y - 6, 2, tower.x, tower.y - 4, 12 + level);
      sphereGrad.addColorStop(0, "#c4b5fd");
      sphereGrad.addColorStop(1, "#7c3aed");
      ctx.fillStyle = sphereGrad;
      ctx.shadowColor = "#7c3aed";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(tower.x, tower.y - 4, 12 + level, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      drawRotatingBarrel(ctx, { ...tower, y: tower.y - 5 }, 38 + level * 5, 13 + level, "#312e81", "#ddd6fe");

      if (level >= 3) {
        ctx.fillStyle = "#f97316";
        ctx.shadowColor = "#f97316";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(tower.x - 10, tower.y - 16, 4, 0, Math.PI * 2);
        ctx.arc(tower.x + 10, tower.y - 16, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    if (tower.type === "sniper") {
      drawTowerBase(ctx, tower, "#374151");

      const bodyGrad = ctx.createLinearGradient(tower.x - 15, tower.y - 12, tower.x + 15, tower.y + 19);
      bodyGrad.addColorStop(0, level >= 4 ? "#111827" : "#1f2937");
      bodyGrad.addColorStop(1, "#0d1117");
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.roundRect(tower.x - 15, tower.y - 12, 30, 31, 7);
      ctx.fill();
      ctx.strokeStyle = "rgba(245,204,11,0.3)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Scope triangle
      ctx.fillStyle = "#374151";
      ctx.beginPath();
      ctx.moveTo(tower.x, tower.y - 30);
      ctx.lineTo(tower.x + 18, tower.y + 9);
      ctx.lineTo(tower.x - 18, tower.y + 9);
      ctx.closePath();
      ctx.fill();

      drawRotatingBarrel(ctx, tower, 55 + level * 5, 6, "#facc15", "#fef3c7");

      // Scope
      ctx.strokeStyle = "rgba(254,243,199,0.6)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(tower.x, tower.y, 8, 0, Math.PI * 2);
      ctx.stroke();
      // Cross-hairs
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(tower.x - 7, tower.y);
      ctx.lineTo(tower.x + 7, tower.y);
      ctx.moveTo(tower.x, tower.y - 7);
      ctx.lineTo(tower.x, tower.y + 7);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (tower.type === "rapid") {
      drawTowerBase(ctx, tower, "#ea580c");

      const bodyGrad = ctx.createLinearGradient(tower.x - 17, tower.y - 10, tower.x + 17, tower.y + 18);
      bodyGrad.addColorStop(0, level >= 4 ? "#9a3412" : "#c2410c");
      bodyGrad.addColorStop(1, "#7c2d12");
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.roundRect(tower.x - 17, tower.y - 10, 34, 28, 9);
      ctx.fill();
      ctx.strokeStyle = "rgba(251,146,60,0.4)";
      ctx.lineWidth = 1;
      ctx.stroke();

      const barrels = level >= 4 ? [-9, 0, 9] : level >= 3 ? [-6, 6] : [0];
      barrels.forEach((offset) => {
        drawRotatingBarrel(
          ctx,
          {
            ...tower,
            x: tower.x + Math.cos((tower.angle ?? 0) + Math.PI / 2) * offset,
            y: tower.y + Math.sin((tower.angle ?? 0) + Math.PI / 2) * offset,
          },
          32 + level * 3, 5, "#fed7aa", "#fff7ed"
        );
      });

      // Engine core
      const coreGrad = ctx.createRadialGradient(tower.x - 1, tower.y, 1, tower.x, tower.y + 1, 7 + level);
      coreGrad.addColorStop(0, "#fbbf24");
      coreGrad.addColorStop(1, "#fb923c");
      ctx.fillStyle = coreGrad;
      ctx.shadowColor = "#f97316";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(tower.x, tower.y + 1, 7 + level, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    if (tower.type === "laser") {
      drawTowerBase(ctx, tower, "#db2777");

      const bodyGrad = ctx.createLinearGradient(tower.x - 17, tower.y - 13, tower.x + 17, tower.y + 19);
      bodyGrad.addColorStop(0, level >= 4 ? "#9d174d" : "#be185d");
      bodyGrad.addColorStop(1, "#881337");
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.roundRect(tower.x - 17, tower.y - 13, 34, 32, 9);
      ctx.fill();
      ctx.strokeStyle = "rgba(249,168,212,0.4)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Lens
      const lensGrad = ctx.createRadialGradient(tower.x - 2, tower.y - 4, 1, tower.x, tower.y - 2, 10 + level);
      lensGrad.addColorStop(0, "#fce7f3");
      lensGrad.addColorStop(0.5, "#f9a8d4");
      lensGrad.addColorStop(1, "#db2777");
      ctx.fillStyle = lensGrad;
      ctx.shadowColor = "#db2777";
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(tower.x, tower.y - 2, 10 + level, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      drawRotatingBarrel(ctx, tower, 37 + level * 4, 8, "#831843", "#fbcfe8");

      if (level >= 3) {
        ctx.strokeStyle = "rgba(251,207,232,0.5)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.arc(tower.x, tower.y - 2, 16 + level, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    ctx.restore();
  }

  function drawPlacementPreview(ctx) {
    const drag = draggingRef.current;
    if (!drag?.canvasPoint?.inside) return;

    const point = drag.canvasPoint;
    const valid = drag.valid;
    const tempTower = {
      x: point.x,
      y: point.y,
      type: drag.type,
      level: 1,
      angle: -Math.PI / 2,
    };
    const stats = getTowerStats(tempTower);

    ctx.save();

    // Range preview
    const rangeColor = valid ? "34,197,94" : "239,68,68";
    const rangeGrad = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, stats.range);
    rangeGrad.addColorStop(0, `rgba(${rangeColor},0.04)`);
    rangeGrad.addColorStop(0.85, `rgba(${rangeColor},0.06)`);
    rangeGrad.addColorStop(1, `rgba(${rangeColor},0.0)`);
    ctx.fillStyle = rangeGrad;
    ctx.beginPath();
    ctx.arc(point.x, point.y, stats.range, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = valid ? "rgba(34,197,94,0.7)" : "rgba(239,68,68,0.7)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.arc(point.x, point.y, stats.range, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Tower preview circle
    ctx.shadowColor = valid ? "#22c55e" : "#ef4444";
    ctx.shadowBlur = 22;
    const circGrad = ctx.createRadialGradient(point.x - 4, point.y - 4, 2, point.x, point.y, 24);
    circGrad.addColorStop(0, valid ? "#22c55e" : "#ef4444");
    circGrad.addColorStop(1, valid ? "#15803d" : "#b91c1c");
    ctx.fillStyle = circGrad;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "#fff";
    ctx.font = "bold 14px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillText(TOWER_TYPES[drag.type].icon, point.x, point.y + 5);

    ctx.restore();
  }

  function drawEnemies(ctx, game) {
    game.enemies.forEach((enemy) => {
      ctx.save();

      // Drop shadow
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(enemy.x + 2, enemy.y + enemy.radius + 4, enemy.radius * 0.9, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Enemy body with gradient
      let colorOuter, colorInner, glowColor;
      if (enemy.type === "boss") {
        colorOuter = "#7f1d1d"; colorInner = "#b91c1c"; glowColor = "#ef4444";
      } else if (enemy.type === "tank") {
        colorOuter = "#78350f"; colorInner = "#b45309"; glowColor = "#f59e0b";
      } else if (enemy.type === "fast") {
        colorOuter = "#9a3412"; colorInner = "#ea580c"; glowColor = "#fb923c";
      } else if (enemy.type === "shield") {
        colorOuter = "#0f766e"; colorInner = "#0d9488"; glowColor = "#2dd4bf";
      } else {
        colorOuter = "#1e3a5f"; colorInner = "#2563eb"; glowColor = "#60a5fa";
      }

      const bodyGrad = ctx.createRadialGradient(
        enemy.x - enemy.radius * 0.3, enemy.y - enemy.radius * 0.3, 1,
        enemy.x, enemy.y, enemy.radius
      );
      bodyGrad.addColorStop(0, colorInner);
      bodyGrad.addColorStop(1, colorOuter);
      ctx.fillStyle = bodyGrad;
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = enemy.type === "boss" ? 16 : 8;
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Specular highlight
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.beginPath();
      ctx.arc(enemy.x - enemy.radius * 0.3, enemy.y - enemy.radius * 0.35, enemy.radius * 0.3, 0, Math.PI * 2);
      ctx.fill();

      // Shield ring
      if (enemy.type === "shield") {
        ctx.strokeStyle = "#2dd4bf";
        ctx.lineWidth = 3;
        ctx.shadowColor = "#2dd4bf";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Boss halo
      if (enemy.type === "boss") {
        ctx.strokeStyle = "#fca5a5";
        ctx.lineWidth = 3;
        ctx.shadowColor = "#ef4444";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Crown spikes
        for (let i = 0; i < 5; i++) {
          const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
          const ix = enemy.x + Math.cos(angle) * (enemy.radius + 4);
          const iy = enemy.y + Math.sin(angle) * (enemy.radius + 4);
          const ox = enemy.x + Math.cos(angle) * (enemy.radius + 12);
          const oy = enemy.y + Math.sin(angle) * (enemy.radius + 12);
          ctx.strokeStyle = "#fecaca";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(ix, iy);
          ctx.lineTo(ox, oy);
          ctx.stroke();
        }
      }

      // Status rings
      if (enemy.burnUntil > performance.now()) {
        ctx.strokeStyle = "#fb923c";
        ctx.lineWidth = 2;
        ctx.shadowColor = "#f97316";
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius + 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      if (enemy.slowUntil > performance.now()) {
        ctx.strokeStyle = "#67e8f9";
        ctx.lineWidth = 2;
        ctx.shadowColor = "#06b6d4";
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // HP bar
      const hpPct = Math.max(0, enemy.hp / enemy.maxHp);
      const bw = enemy.radius * 2.6;
      const bx = enemy.x - bw / 2;
      const by = enemy.y - enemy.radius - 13;

      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, 5, 3);
      ctx.fill();

      const hpColor = hpPct > 0.5 ? "#22c55e" : hpPct > 0.25 ? "#f59e0b" : "#ef4444";
      ctx.fillStyle = hpColor;
      ctx.shadowColor = hpColor;
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw * hpPct, 5, 3);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.restore();
    });
  }

  function drawBullets(ctx, game) {
    game.bullets.forEach((bullet) => {
      ctx.save();

      if (bullet.type === "basic") {
        ctx.shadowColor = "#3b82f6";
        ctx.shadowBlur = 8;
        const g = ctx.createRadialGradient(bullet.x, bullet.y, 0, bullet.x, bullet.y, 6);
        g.addColorStop(0, "#93c5fd");
        g.addColorStop(1, "#1d4ed8");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      if (bullet.type === "freeze") {
        ctx.shadowColor = "#06b6d4";
        ctx.shadowBlur = 10;
        const g = ctx.createRadialGradient(bullet.x, bullet.y, 0, bullet.x, bullet.y, 6);
        g.addColorStop(0, "#a5f3fc");
        g.addColorStop(1, "#0891b2");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      if (bullet.type === "splash") {
        // Mortar shell with arc shadow
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = "#7c3aed";
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.shadowColor = "#a855f7";
        ctx.shadowBlur = 12;
        const g = ctx.createRadialGradient(bullet.x - 2, bullet.y - 2, 1, bullet.x, bullet.y, 8);
        g.addColorStop(0, "#ddd6fe");
        g.addColorStop(1, "#4c1d95");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      if (bullet.type === "sniper") {
        const target = game.enemies.find((e) => e.id === bullet.targetId);
        const rotation = target ? angleTo(bullet, target) : 0;

        ctx.translate(bullet.x, bullet.y);
        ctx.rotate(rotation);
        ctx.shadowColor = "#facc15";
        ctx.shadowBlur = 10;

        const g = ctx.createLinearGradient(-6, 0, 14, 0);
        g.addColorStop(0, "#fef3c7");
        g.addColorStop(1, "#d97706");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect(-6, -2, 14, 4, 3);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      if (bullet.type === "rapid") {
        ctx.shadowColor = "#fb923c";
        ctx.shadowBlur = 6;
        const g = ctx.createRadialGradient(bullet.x, bullet.y, 0, bullet.x, bullet.y, 5);
        g.addColorStop(0, "#fed7aa");
        g.addColorStop(1, "#c2410c");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      ctx.restore();
    });
  }

  function drawBeams(ctx, game) {
    game.beams.forEach((beam) => {
      ctx.save();

      const alpha = Math.max(0.2, beam.life / beam.maxLife);
      ctx.globalAlpha = alpha;

      const isChain = beam.type === "laser-chain";
      const mainColor = isChain ? "#f472b6" : "#db2777";
      const coreColor = isChain ? "#fce7f3" : "#fbcfe8";

      // Outer glow
      ctx.strokeStyle = mainColor;
      ctx.lineWidth = beam.width * 2;
      ctx.lineCap = "round";
      ctx.globalAlpha = alpha * 0.25;
      ctx.beginPath();
      ctx.moveTo(beam.x1, beam.y1);
      ctx.lineTo(beam.x2, beam.y2);
      ctx.stroke();

      // Main beam
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = mainColor;
      ctx.lineWidth = beam.width;
      ctx.shadowColor = mainColor;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(beam.x1, beam.y1);
      ctx.lineTo(beam.x2, beam.y2);
      ctx.stroke();

      // Core white
      ctx.strokeStyle = coreColor;
      ctx.lineWidth = Math.max(1.5, beam.width * 0.3);
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(beam.x1, beam.y1);
      ctx.lineTo(beam.x2, beam.y2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.restore();
    });
  }

  function drawExplosions(ctx, game) {
    game.explosions.forEach((explosion) => {
      const progress = 1 - explosion.life / explosion.maxLife;
      const radius = explosion.radius * (0.2 + progress * 0.95);
      const alpha = Math.max(0, explosion.life / explosion.maxLife);

      ctx.save();

      // Outer ring
      ctx.globalAlpha = alpha * 0.35;
      ctx.fillStyle = "#f97316";
      ctx.shadowColor = "#f97316";
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(explosion.x, explosion.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Mid ring
      ctx.globalAlpha = alpha * 0.6;
      ctx.strokeStyle = "#fde68a";
      ctx.lineWidth = 4 + progress * 4;
      ctx.beginPath();
      ctx.arc(explosion.x, explosion.y, radius * 0.68, 0, Math.PI * 2);
      ctx.stroke();

      // Inner flash
      ctx.globalAlpha = alpha * (1 - progress);
      ctx.fillStyle = "#fff7ed";
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(explosion.x, explosion.y, Math.max(4, radius * 0.22), 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.restore();
    });
  }

  function drawDamagePopups(ctx, game) {
    game.damagePopups.forEach((popup) => {
      const t = popup.life / 600;
      ctx.save();

      ctx.globalAlpha = Math.max(0, t);
      const scale = 0.8 + (1 - t) * 0.4;
      ctx.translate(popup.x, popup.y);
      ctx.scale(scale, scale);

      ctx.font = "bold 13px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.lineWidth = 3;
      ctx.strokeText(popup.text, 0, 0);

      ctx.fillStyle = popup.color;
      ctx.shadowColor = popup.color;
      ctx.shadowBlur = 6;
      ctx.fillText(popup.text, 0, 0);
      ctx.shadowBlur = 0;

      ctx.restore();
    });
  }

  function drawTopOverlay(ctx, game) {
    ctx.save();

    // HUD bar background
    ctx.fillStyle = "rgba(10,14,26,0.82)";
    ctx.strokeStyle = "rgba(59,130,246,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(14, 12, 460, 44, 12);
    ctx.fill();
    ctx.stroke();

    // Top accent line
    ctx.fillStyle = "rgba(59,130,246,0.5)";
    ctx.beginPath();
    ctx.roundRect(14, 12, 460, 2, [12, 12, 0, 0]);
    ctx.fill();

    const stats = [
      { label: "WAVE", value: game.wave, color: "#f59e0b" },
      { label: "COINS", value: Math.round(game.coins), color: "#facc15" },
      { label: "HP", value: game.baseHealth, color: game.baseHealth > 8 ? "#22c55e" : "#ef4444" },
      { label: "SCORE", value: game.score, color: "#a78bfa" },
    ];

    stats.forEach((stat, i) => {
      const x = 38 + i * 115;
      ctx.fillStyle = "rgba(99,155,255,0.4)";
      ctx.font = "bold 8px 'Courier New', monospace";
      ctx.textAlign = "left";
      ctx.fillText(stat.label, x, 30);

      ctx.fillStyle = stat.color;
      ctx.font = "bold 14px 'Courier New', monospace";
      ctx.fillText(stat.value, x, 47);
    });

    ctx.restore();
  }

  function drawPauseBadge(ctx, text) {
    ctx.save();

    ctx.fillStyle = "rgba(10,14,26,0.88)";
    ctx.strokeStyle = "rgba(245,158,11,0.6)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(CANVAS_WIDTH / 2 - 140, 14, 280, 42, 14);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#f59e0b";
    ctx.font = "bold 14px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.shadowColor = "#f59e0b";
    ctx.shadowBlur = 10;
    ctx.fillText(text, CANVAS_WIDTH / 2, 41);
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  function drawGameOver(ctx) {
    ctx.save();

    // Dark overlay
    ctx.fillStyle = "rgba(5,8,18,0.85)";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Panel
    ctx.fillStyle = "rgba(15,22,40,0.95)";
    ctx.strokeStyle = "rgba(239,68,68,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(CANVAS_WIDTH / 2 - 180, CANVAS_HEIGHT / 2 - 70, 360, 140, 20);
    ctx.fill();
    ctx.stroke();

    // Top accent
    ctx.fillStyle = "rgba(239,68,68,0.7)";
    ctx.beginPath();
    ctx.roundRect(CANVAS_WIDTH / 2 - 180, CANVAS_HEIGHT / 2 - 70, 360, 2, [20, 20, 0, 0]);
    ctx.fill();

    ctx.fillStyle = "#ef4444";
    ctx.font = "bold 36px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.shadowColor = "#ef4444";
    ctx.shadowBlur = 20;
    ctx.fillText("GAME OVER", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 14);
    ctx.shadowBlur = 0;

    ctx.fillStyle = "rgba(248,113,113,0.7)";
    ctx.font = "13px 'Courier New', monospace";
    ctx.fillText("Your base has been destroyed", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 18);

    ctx.fillStyle = "rgba(148,163,184,0.6)";
    ctx.font = "11px 'Courier New', monospace";
    ctx.fillText("Press RESTART to try again", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 44);

    ctx.restore();
  }

  // ─── GAME LOGIC (unchanged) ───────────────────────────────────────────

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

  function makeQuestionModal(index) {
    if (!questions.length) return null;

    const q = questions[index % questions.length];

    return {
      question: q,
      choices: buildChoices(q, questions),
      startedAt: Date.now(),
    };
  }

  function openQuestion() {
    if (!questions.length) {
      setMessage("No study questions found.");
      return;
    }

    pauseGameForQuestion();
    setAnswerFeedback(null);
    setQuestionModal(makeQuestionModal(questionIndex));
  }

  function closeQuestions() {
    setQuestionModal(null);
    setAnswerFeedback(null);
    resumeAfterQuestionIfNeeded();
  }

  function answerQuestion(choice) {
    const game = gameRef.current;
    if (!game || !questionModal || answerFeedback) return;

    const isCorrect = choice === questionModal.question.correctAnswer;
    const timeTaken = Date.now() - questionModal.startedAt;

    let earned = 0;

    if (isCorrect) {
      const speedBonus = timeTaken < 6000 ? 10 : 0;
      const streakBonus = streak >= 3 ? 10 : 0;
      earned = 42 + speedBonus + streakBonus;

      game.coins += earned;
      game.score += earned * 4;

      setStreak((prev) => prev + 1);
      setMessage(`Correct! +${earned} coins.`);
    } else {
      earned = 2;
      game.coins += earned;
      setStreak(0);
      setMessage(
        `Wrong. +2 coins. Correct answer: ${questionModal.question.correctAnswer}`
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
    const nextIndex = (questionIndex + 1) % Math.max(questions.length, 1);
    setQuestionIndex(nextIndex);
    setAnswerFeedback(null);
    setQuestionModal(makeQuestionModal(nextIndex));
  }

  function upgradeSelectedTower() {
    const game = gameRef.current;
    if (!game || !selectedTowerId) return;

    const tower = game.towers.find((t) => t.id === selectedTowerId);
    if (!tower) return;

    if (tower.level >= MAX_TOWER_LEVEL) {
      setMessage("This tower is already max level.");
      return;
    }

    const upgradeCost = getUpgradeCost(tower);

    if (game.coins < upgradeCost) {
      setMessage(`Need ${upgradeCost} coins to upgrade.`);
      return;
    }

    game.coins -= upgradeCost;
    tower.level += 1;
    tower.spent = (tower.spent || TOWER_TYPES[tower.type].cost) + upgradeCost;

    setMessage(
      `${TOWER_TYPES[tower.type].name} upgraded to level ${tower.level}. ${
        TOWER_TYPES[tower.type].upgradeText[tower.level - 1]
      }`
    );

    syncStateFromRef();
  }

  function sellSelectedTower() {
    const game = gameRef.current;
    if (!game || !selectedTowerId) return;

    const tower = game.towers.find((t) => t.id === selectedTowerId);
    if (!tower) return;

    const refund = Math.round((tower.spent || TOWER_TYPES[tower.type].cost) * 0.55);

    game.coins += refund;
    game.towers = game.towers.filter((t) => t.id !== selectedTowerId);

    setSelectedTowerId(null);
    selectedTowerIdRef.current = null;
    setMessage(`Tower sold for ${refund} coins.`);
    syncStateFromRef();
  }

  // ─── JSX ─────────────────────────────────────────────────────────────

  return (
    <div className="td-page">
      <div className="td-header compact">
        <div>
          <p className="td-eyebrow">Study Siege</p>
          <h1>{studySet?.title || "Tower Defense"}</h1>
        </div>

        <div className="td-header-actions">
          <button className="td-quiz-btn" onClick={openQuestion}>
            ⚡ Answer Questions
          </button>

          <button
            onClick={() => {
              setIsRunning((prev) => {
                const next = !prev;
                isRunningRef.current = next;

                if (!next) {
                  clearAutoWaveTimer();
                } else {
                  const game = gameRef.current;
                  if (game && !game.waveInProgress && game.nextWaveReady) {
                    scheduleAutoWave(1200, `Wave ${game.wave} started automatically.`);
                  }
                }

                return next;
              });
            }}
          >
            {isRunning ? "⏸ Pause" : "▶ Resume"}
          </button>

          <button onClick={startWave}>▶▶ Send Wave</button>
          <button onClick={resetGame}>↺ Restart</button>
          <button className="secondary" onClick={onExit}>✕ Exit</button>
        </div>
      </div>

      <div className="td-game-card">
        <div className="td-canvas-wrap">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="td-canvas"
          />

          {selectedTower && selectedTowerStats && (
            <div
              className="tower-map-popover"
              style={canvasToPercent(selectedTower)}
            >
              <div className="tower-popover-head">
                <div className={`tower-shop-icon tower-${selectedTower.type}`}>
                  {TOWER_TYPES[selectedTower.type].icon}
                </div>

                <div>
                  <strong>{TOWER_TYPES[selectedTower.type].name}</strong>
                  <span>Level {selectedTower.level}</span>
                </div>

                <button
                  className="tower-popover-close"
                  onClick={() => {
                    setSelectedTowerId(null);
                    selectedTowerIdRef.current = null;
                  }}
                >
                  ×
                </button>
              </div>

              <div className="tower-mini-stats">
                <div>
                  <span>Dmg</span>
                  <strong>{Math.round(selectedTowerStats.damage)}</strong>
                </div>
                <div>
                  <span>Range</span>
                  <strong>{Math.round(selectedTowerStats.range)}</strong>
                </div>
                <div>
                  <span>Kills</span>
                  <strong>{selectedTower.kills || 0}</strong>
                </div>
              </div>

              <p>{TOWER_TYPES[selectedTower.type].upgradeText[selectedTower.level - 1]}</p>

              <div className="tower-popover-actions">
                <button
                  onClick={upgradeSelectedTower}
                  disabled={selectedTower.level >= MAX_TOWER_LEVEL}
                >
                  {selectedTower.level >= MAX_TOWER_LEVEL
                    ? "✓ Maxed"
                    : `▲ Upgrade ${selectedUpgradeCost}`}
                </button>

                <button className="sell" onClick={sellSelectedTower}>
                  $ Sell
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="td-bottom-bar">
          <div className="td-message">{message}</div>

          <div className="td-bottom-stats">
            <div>
              <span>Wave</span>
              <strong>{wave}</strong>
            </div>
            <div>
              <span>Coins</span>
              <strong>{coins}</strong>
            </div>
            <div>
              <span>Health</span>
              <strong style={{ color: baseHealth > 8 ? "#22c55e" : "#ef4444" }}>{baseHealth}</strong>
            </div>
            <div>
              <span>Streak</span>
              <strong style={{ color: streak >= 3 ? "#f59e0b" : "inherit" }}>{streak}</strong>
            </div>
          </div>

          <div className="td-tower-dock">
            {Object.entries(TOWER_TYPES).map(([key, tower]) => (
              <button
                key={key}
                className={selectedTowerType === key ? "dock-tower active" : "dock-tower"}
                onPointerDown={(e) => startTowerDrag(key, e)}
                onClick={() => setSelectedTowerType(key)}
                title={`${tower.name}: ${tower.description}`}
              >
                <div className={`dock-tower-icon tower-${key}`}>
                  {tower.icon}
                </div>

                <div>
                  <strong>{tower.name}</strong>
                  <span>{tower.cost}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {draggingTower && (
        <div
          className={`floating-drag-tower ${draggingTower.valid ? "valid" : "invalid"}`}
          style={{
            left: draggingTower.clientX,
            top: draggingTower.clientY,
          }}
        >
          {TOWER_TYPES[draggingTower.type].icon}
        </div>
      )}

      {questionModal && (
        <div className="question-backdrop">
          <div className="question-modal">
            <div className="question-modal-header">
              <p>⚡ Earn Coins — Game Paused</p>
              <button onClick={closeQuestions}>×</button>
            </div>

            <h2>{questionModal.question.question}</h2>

            <div className="choice-list">
              {questionModal.choices.map((choice, index) => {
                let className = "";

                if (answerFeedback) {
                  if (choice === answerFeedback.correctAnswer) className = "correct";
                  else if (choice === answerFeedback.selectedChoice && !answerFeedback.isCorrect) className = "wrong";
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
              <div className={answerFeedback.isCorrect ? "answer-feedback correct-box" : "answer-feedback wrong-box"}>
                <strong>
                  {answerFeedback.isCorrect ? "✓ Correct!" : "✗ Wrong answer"}
                </strong>
                <p>
                  {answerFeedback.isCorrect
                    ? `Nice job. You earned ${answerFeedback.earned} coins.`
                    : `The correct answer is: ${answerFeedback.correctAnswer}`}
                </p>

                <button className="td-primary-btn" onClick={continueAfterAnswer}>
                  Continue to Next Question →
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}