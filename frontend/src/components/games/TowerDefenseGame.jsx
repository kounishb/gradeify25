import React, { useEffect, useMemo, useRef, useState } from "react";
import "../../styles/TowerDefenseGame.css";

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 540;
const MAX_TOWER_LEVEL = 4;

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
    name: "Cannon",
    icon: "●",
    cost: 100,
    damage: 18,
    range: 115,
    fireRate: 620,
    radius: 17,
    description: "Balanced starter tower",
    upgradeText: [
      "Basic cannon shots.",
      "Higher damage and range.",
      "Double shot unlocked.",
      "Armor breaker against tanks.",
    ],
  },
  freeze: {
    name: "Frost",
    icon: "◆",
    cost: 140,
    damage: 7,
    range: 108,
    fireRate: 850,
    radius: 17,
    slowAmount: 0.45,
    slowDuration: 1100,
    description: "Slows enemies",
    upgradeText: [
      "Slows one enemy.",
      "Longer freeze duration.",
      "Small freeze splash.",
      "Deep freeze slows harder.",
    ],
  },
  splash: {
    name: "Mortar",
    icon: "◉",
    cost: 180,
    damage: 13,
    range: 105,
    fireRate: 980,
    radius: 18,
    splashRadius: 55,
    description: "Area damage",
    upgradeText: [
      "Explodes in a small area.",
      "Larger blast radius.",
      "Burn damage unlocked.",
      "Heavy explosion damage.",
    ],
  },
  sniper: {
    name: "Sniper",
    icon: "▲",
    cost: 220,
    damage: 75,
    range: 250,
    fireRate: 1450,
    radius: 16,
    description: "Long range, high damage",
    upgradeText: [
      "Long range single shot.",
      "More damage.",
      "Tank piercer unlocked.",
      "Execute low-health enemies.",
    ],
  },
  rapid: {
    name: "Rapid",
    icon: "✦",
    cost: 130,
    damage: 8,
    range: 105,
    fireRate: 230,
    radius: 16,
    description: "Fast low-damage shots",
    upgradeText: [
      "Very fast shots.",
      "Faster fire rate.",
      "Multi-shot unlocked.",
      "Triple-shot unlocked.",
    ],
  },
  laser: {
    name: "Laser",
    icon: "✶",
    cost: 260,
    damage: 12,
    range: 150,
    fireRate: 135,
    radius: 17,
    description: "Continuous beam damage",
    upgradeText: [
      "Rapid beam damage.",
      "More range and damage.",
      "Chain beam unlocked.",
      "Stronger chain beam.",
    ],
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
    if (pointToSegmentDistance(point, PATH[i], PATH[i + 1]) < 45) {
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

  return {
    id: `enemy-${Date.now()}-${Math.random()}`,
    x: PATH[0].x,
    y: PATH[0].y,
    pathIndex: 0,
    progress: 0,
    radius: isTank ? 18 : isFast ? 12 : 14,
    maxHp: isTank
      ? 115 + wave * 16
      : isShielded
      ? 70 + wave * 12
      : 48 + wave * 9,
    hp: isTank
      ? 115 + wave * 16
      : isShielded
      ? 70 + wave * 12
      : 48 + wave * 9,
    speed: isFast ? 1.65 + wave * 0.04 : isTank ? 0.86 + wave * 0.025 : 1.08 + wave * 0.035,
    reward: isTank ? 28 : isFast ? 16 : isShielded ? 20 : 13,
    type: isTank ? "tank" : isFast ? "fast" : isShielded ? "shield" : "normal",
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
    damage: base.damage * (1 + (level - 1) * 0.42),
    range: base.range + (level - 1) * 13,
    fireRate: Math.max(90, base.fireRate - (level - 1) * 65),
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
    stats.slowDuration = base.slowDuration + (level - 1) * 420;
    stats.slowAmount = Math.max(0.25, base.slowAmount - (level - 1) * 0.06);
    if (level >= 3) stats.splashRadius = 38;
    if (level >= 4) stats.splashRadius = 55;
  }

  if (tower.type === "splash") {
    stats.splashRadius = base.splashRadius + (level - 1) * 14;
    if (level >= 3) {
      stats.burnDps = 7 + level * 2;
      stats.burnDuration = 1600 + level * 350;
    }
  }

  if (tower.type === "sniper") {
    stats.range = base.range + (level - 1) * 22;
    stats.fireRate = Math.max(760, base.fireRate - (level - 1) * 120);
    if (level >= 3) stats.tankPierce = true;
    if (level >= 4) stats.execute = true;
  }

  if (tower.type === "rapid") {
    stats.fireRate = Math.max(95, base.fireRate - (level - 1) * 34);
    if (level >= 3) stats.multiShot = 2;
    if (level >= 4) stats.multiShot = 3;
  }

  if (tower.type === "laser") {
    stats.range = base.range + (level - 1) * 18;
    stats.damage = base.damage * (1 + (level - 1) * 0.32);
    stats.chain = level >= 3 ? level - 2 : 0;
  }

  return stats;
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

  const questions = useMemo(() => {
    return studySet?.questions?.length ? studySet.questions : [];
  }, [studySet]);

  const [selectedTowerType, setSelectedTowerType] = useState("basic");
  const [selectedTowerId, setSelectedTowerId] = useState(null);
  const [draggingTower, setDraggingTower] = useState(null);

  const [coins, setCoins] = useState(220);
  const [baseHealth, setBaseHealth] = useState(20);
  const [wave, setWave] = useState(1);
  const [score, setScore] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  const [gameOver, setGameOver] = useState(false);
  const [message, setMessage] = useState(
    "Drag towers onto the map. Answer questions to earn coins."
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

    setCoins(game.coins);
    setBaseHealth(game.baseHealth);
    setWave(game.wave);
    setScore(game.score);
    setGameOver(game.gameOver);
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

  function canPlaceTower(point, type) {
    const game = gameRef.current;
    if (!game || !point?.inside) return false;

    const towerType = TOWER_TYPES[type];

    if (game.coins < towerType.cost) return false;
    if (point.x < 24 || point.x > CANVAS_WIDTH - 24) return false;
    if (point.y < 24 || point.y > CANVAS_HEIGHT - 24) return false;
    if (isTooCloseToPath(point)) return false;

    return !game.towers.some((tower) => distance(tower, point) < 48);
  }

  function placeTower(type, point) {
    const game = gameRef.current;
    if (!game || !canPlaceTower(point, type)) return false;

    const towerType = TOWER_TYPES[type];

    game.towers.push({
      id: `tower-${Date.now()}-${Math.random()}`,
      x: point.x,
      y: point.y,
      type,
      level: 1,
      lastShot: 0,
      spent: towerType.cost,
      kills: 0,
    });

    game.coins -= towerType.cost;
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
    game.enemiesToSpawn = 7 + game.wave * 3;
    game.enemiesSpawned = 0;
    game.lastSpawnTime = 0;
  }

  function scheduleAutoWave(delayMs = 3000, customMessage = null) {
    clearAutoWaveTimer();

    autoWaveTimeoutRef.current = setTimeout(() => {
      const game = gameRef.current;
      if (!game || game.gameOver || game.waveInProgress || !isRunningRef.current) return;

      launchWave(game);
      setMessage(customMessage || `Wave ${game.wave} started automatically.`);
      syncStateFromRef();
    }, delayMs);
  }

  function resetGame() {
    clearAutoWaveTimer();

    const initialGame = {
      coins: 220,
      baseHealth: 20,
      wave: 1,
      score: 0,
      gameOver: false,
      towers: [],
      enemies: [],
      bullets: [],
      beams: [],
      damagePopups: [],
      waveInProgress: false,
      enemiesToSpawn: 0,
      enemiesSpawned: 0,
      lastSpawnTime: 0,
      nextWaveReady: true,
      lastFrame: performance.now(),
    };

    gameRef.current = initialGame;

    setCoins(220);
    setBaseHealth(20);
    setWave(1);
    setScore(0);
    setGameOver(false);
    setIsRunning(true);
    isRunningRef.current = true;
    setQuestionIndex(0);
    setStreak(0);
    setQuestionModal(null);
    setAnswerFeedback(null);
    setSelectedTowerId(null);
    setMessage("Get ready. The first wave starts automatically.");

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
      if (ignoreNextClickRef.current) return;

      const game = gameRef.current;
      if (!game || game.gameOver) return;

      const point = getCanvasPointFromEvent(e);
      if (!point) return;

      const clickedTower = [...game.towers]
        .reverse()
        .find((tower) => distance(tower, point) <= 26);

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
      if (now - game.lastSpawnTime > 650) {
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
      isRunningRef.current = false;
      setMessage("Game over. Your base was destroyed.");
      return;
    }

    game.towers.forEach((tower) => fireTower(game, tower, now));

    updateBullets(game, now);
    updateBeamsAndPopups(game, delta);
    removeDefeatedEnemies(game);

    if (
      game.waveInProgress &&
      game.enemiesSpawned >= game.enemiesToSpawn &&
      game.enemies.length === 0
    ) {
      game.waveInProgress = false;
      game.nextWaveReady = true;
      game.wave += 1;
      game.coins += 75;

      setMessage(`Wave cleared. Bonus +75 coins. Next wave starts soon.`);
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

  function fireTower(game, tower, now) {
    const stats = getTowerStats(tower);

    if (now - tower.lastShot < stats.fireRate) return;

    const enemiesInRange = game.enemies
      .filter((enemy) => distance(tower, enemy) <= stats.range)
      .sort((a, b) => b.progress - a.progress);

    if (!enemiesInRange.length) return;

    if (tower.type === "laser") {
      const target = enemiesInRange[0];

      applyDamage(game, target, stats.damage, tower, now, stats);

      game.beams.push({
        id: `beam-${Date.now()}-${Math.random()}`,
        x1: tower.x,
        y1: tower.y,
        x2: target.x,
        y2: target.y,
        type: tower.type,
        life: 90,
      });

      if (stats.chain > 0) {
        const chainTargets = enemiesInRange
          .filter((enemy) => enemy.id !== target.id && distance(enemy, target) <= 95)
          .slice(0, stats.chain);

        chainTargets.forEach((enemy) => {
          applyDamage(game, enemy, stats.damage * 0.55, tower, now, stats);

          game.beams.push({
            id: `beam-chain-${Date.now()}-${Math.random()}`,
            x1: target.x,
            y1: target.y,
            x2: enemy.x,
            y2: enemy.y,
            type: tower.type,
            life: 90,
          });
        });
      }

      tower.lastShot = now;
      return;
    }

    const targets = enemiesInRange.slice(0, stats.multiShot);

    targets.forEach((target) => {
      game.bullets.push({
        id: `bullet-${Date.now()}-${Math.random()}`,
        x: tower.x,
        y: tower.y,
        targetId: target.id,
        speed: tower.type === "sniper" ? 14 : 8.5,
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
      });
    });

    tower.lastShot = now;
  }

  function updateBullets(game, now) {
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
        const tower = game.towers.find((t) => t.id === bullet.towerId);

        if (bullet.splashRadius > 0) {
          game.enemies.forEach((enemy) => {
            if (distance(enemy, target) <= bullet.splashRadius) {
              applyDamage(game, enemy, bullet.damage, tower, now, bullet);

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
        } else {
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
        bullet.x += (dx / dist) * bullet.speed;
        bullet.y += (dy / dist) * bullet.speed;
      }
    });

    game.bullets = game.bullets.filter((bullet) => !bullet.dead);
  }

  function applyDamage(game, enemy, rawDamage, tower, now, source) {
    let damage = rawDamage;

    if (source?.tankPierce && enemy.type === "tank") {
      damage *= 1.65;
    }

    if (source?.execute && enemy.hp / enemy.maxHp < 0.22) {
      damage = enemy.hp + 1;
    }

    if (enemy.type === "shield" && !source?.tankPierce) {
      damage *= 0.72;
    }

    enemy.hp -= damage;

    game.damagePopups.push({
      id: `popup-${Date.now()}-${Math.random()}`,
      x: enemy.x,
      y: enemy.y - enemy.radius,
      text: Math.round(damage).toString(),
      life: 620,
      color: source?.execute && enemy.hp <= 0 ? "#facc15" : "#ffffff",
    });

    if (tower && enemy.hp <= 0) {
      tower.kills = (tower.kills || 0) + 1;
    }
  }

  function updateBeamsAndPopups(game, delta) {
    game.beams.forEach((beam) => {
      beam.life -= delta;
    });

    game.damagePopups.forEach((popup) => {
      popup.life -= delta;
      popup.y -= 0.35 * (delta / 16);
    });

    game.beams = game.beams.filter((beam) => beam.life > 0);
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
    drawDamagePopups(ctx, game);
    drawTopOverlay(ctx, game);

    if (!isRunningRef.current && !game.gameOver) {
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

    ctx.save();
    ctx.globalAlpha = 0.16;
    for (let x = 0; x < CANVAS_WIDTH; x += 45) {
      for (let y = 0; y < CANVAS_HEIGHT; y += 45) {
        ctx.fillStyle = (x + y) % 90 === 0 ? "#22c55e" : "#16a34a";
        ctx.fillRect(x, y, 45, 45);
      }
    }
    ctx.restore();
  }

  function drawDecorations(ctx) {
    ctx.save();

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
      { x: 72, y: 430 },
      { x: 545, y: 98 },
    ];

    bushes.forEach((bush) => {
      ctx.fillStyle = "#15803d";
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

    ctx.strokeStyle = "#854d0e";
    ctx.lineWidth = 64;
    ctx.beginPath();
    ctx.moveTo(PATH[0].x, PATH[0].y);
    for (let i = 1; i < PATH.length; i++) ctx.lineTo(PATH[i].x, PATH[i].y);
    ctx.stroke();

    ctx.strokeStyle = "#d6a34d";
    ctx.lineWidth = 46;
    ctx.beginPath();
    ctx.moveTo(PATH[0].x, PATH[0].y);
    for (let i = 1; i < PATH.length; i++) ctx.lineTo(PATH[i].x, PATH[i].y);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 6;
    ctx.setLineDash([14, 16]);
    ctx.beginPath();
    ctx.moveTo(PATH[0].x, PATH[0].y);
    for (let i = 1; i < PATH.length; i++) ctx.lineTo(PATH[i].x, PATH[i].y);
    ctx.stroke();

    ctx.restore();
  }

  function drawSpawnGate(ctx) {
    ctx.save();

    ctx.fillStyle = "#78350f";
    ctx.fillRect(6, 238, 24, 66);

    ctx.fillStyle = "#92400e";
    ctx.beginPath();
    ctx.arc(30, 270, 19, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fde68a";
    ctx.beginPath();
    ctx.arc(30, 270, 8, 0, Math.PI * 2);
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
      const stats = getTowerStats(tower);
      const isSelected = tower.id === selectedTowerIdRef.current;

      ctx.save();

      if (isSelected) {
        ctx.strokeStyle = "#facc15";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(tower.x, tower.y, stats.range, 0, Math.PI * 2);
        ctx.stroke();

        ctx.shadowColor = "#facc15";
        ctx.shadowBlur = 18;
      } else {
        ctx.globalAlpha = 0.07;
        ctx.fillStyle = "#0f172a";
        ctx.beginPath();
        ctx.arc(tower.x, tower.y, stats.range, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      ctx.fillStyle = "#334155";
      ctx.beginPath();
      ctx.arc(tower.x, tower.y, 21, 0, Math.PI * 2);
      ctx.fill();

      drawTowerSprite(ctx, tower);

      ctx.shadowBlur = 0;

      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(tower.x + 15, tower.y - 15, 9, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 10px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(tower.level, tower.x + 15, tower.y - 12);

      ctx.restore();
    });
  }

  function drawTowerSprite(ctx, tower) {
    if (tower.type === "basic") {
      ctx.fillStyle = "#2563eb";
      ctx.beginPath();
      ctx.arc(tower.x, tower.y, 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#1d4ed8";
      ctx.fillRect(tower.x - 4, tower.y - 20, 8, 24);
    }

    if (tower.type === "freeze") {
      ctx.fillStyle = "#06b6d4";
      ctx.beginPath();
      ctx.moveTo(tower.x, tower.y - 19);
      ctx.lineTo(tower.x + 13, tower.y);
      ctx.lineTo(tower.x, tower.y + 19);
      ctx.lineTo(tower.x - 13, tower.y);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "#cffafe";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (tower.type === "splash") {
      ctx.fillStyle = "#7c3aed";
      ctx.beginPath();
      ctx.arc(tower.x, tower.y, 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#c4b5fd";
      ctx.beginPath();
      ctx.arc(tower.x, tower.y - 2, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#5b21b6";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(tower.x + 7, tower.y - 7);
      ctx.lineTo(tower.x + 14, tower.y - 16);
      ctx.stroke();
    }

    if (tower.type === "sniper") {
      ctx.fillStyle = "#111827";
      ctx.beginPath();
      ctx.moveTo(tower.x, tower.y - 18);
      ctx.lineTo(tower.x + 16, tower.y + 12);
      ctx.lineTo(tower.x - 16, tower.y + 12);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "#facc15";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(tower.x, tower.y - 18);
      ctx.lineTo(tower.x, tower.y - 30);
      ctx.stroke();
    }

    if (tower.type === "rapid") {
      ctx.fillStyle = "#ea580c";
      ctx.beginPath();
      ctx.arc(tower.x, tower.y, 13, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#fed7aa";
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(tower.x - 9 + i * 9, tower.y - 13);
        ctx.lineTo(tower.x - 9 + i * 9, tower.y - 25);
        ctx.stroke();
      }
    }

    if (tower.type === "laser") {
      ctx.fillStyle = "#db2777";
      ctx.beginPath();
      ctx.arc(tower.x, tower.y, 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#fbcfe8";
      ctx.beginPath();
      ctx.arc(tower.x, tower.y, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#831843";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(tower.x - 12, tower.y);
      ctx.lineTo(tower.x + 12, tower.y);
      ctx.moveTo(tower.x, tower.y - 12);
      ctx.lineTo(tower.x, tower.y + 12);
      ctx.stroke();
    }
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
    };
    const stats = getTowerStats(tempTower);

    ctx.save();

    ctx.fillStyle = valid ? "rgba(34,197,94,0.16)" : "rgba(239,68,68,0.16)";
    ctx.strokeStyle = valid ? "#22c55e" : "#ef4444";
    ctx.lineWidth = 4;

    ctx.beginPath();
    ctx.arc(point.x, point.y, stats.range, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.shadowColor = valid ? "#22c55e" : "#ef4444";
    ctx.shadowBlur = 22;
    ctx.globalAlpha = 0.92;

    ctx.fillStyle = valid ? "#16a34a" : "#dc2626";
    ctx.beginPath();
    ctx.arc(point.x, point.y, 23, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 19px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(TOWER_TYPES[drag.type].icon, point.x, point.y + 7);

    ctx.restore();
  }

  function drawEnemies(ctx, game) {
    game.enemies.forEach((enemy) => {
      ctx.save();

      ctx.globalAlpha = 0.16;
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.ellipse(
        enemy.x,
        enemy.y + enemy.radius + 4,
        enemy.radius,
        5,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.globalAlpha = 1;

      if (enemy.type === "tank") {
        ctx.fillStyle = "#b91c1c";
      } else if (enemy.type === "fast") {
        ctx.fillStyle = "#ea580c";
      } else if (enemy.type === "shield") {
        ctx.fillStyle = "#0f766e";
      } else {
        ctx.fillStyle = "#334155";
      }

      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
      ctx.fill();

      if (enemy.type === "shield") {
        ctx.strokeStyle = "#99f6e4";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius + 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (enemy.burnUntil > performance.now()) {
        ctx.strokeStyle = "#fb923c";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius + 7, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (enemy.slowUntil > performance.now()) {
        ctx.strokeStyle = "#06b6d4";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius + 5, 0, Math.PI * 2);
        ctx.stroke();
      }

      const hpPercent = Math.max(0, enemy.hp / enemy.maxHp);
      const barWidth = enemy.radius * 2.4;

      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(enemy.x - barWidth / 2, enemy.y - enemy.radius - 12, barWidth, 5);

      ctx.fillStyle =
        hpPercent > 0.5 ? "#22c55e" : hpPercent > 0.25 ? "#f59e0b" : "#ef4444";
      ctx.fillRect(
        enemy.x - barWidth / 2,
        enemy.y - enemy.radius - 12,
        barWidth * hpPercent,
        5
      );

      ctx.restore();
    });
  }

  function drawBullets(ctx, game) {
    game.bullets.forEach((bullet) => {
      ctx.save();

      if (bullet.type === "basic") ctx.fillStyle = "#1d4ed8";
      if (bullet.type === "freeze") ctx.fillStyle = "#06b6d4";
      if (bullet.type === "splash") ctx.fillStyle = "#8b5cf6";
      if (bullet.type === "sniper") ctx.fillStyle = "#facc15";
      if (bullet.type === "rapid") ctx.fillStyle = "#fb923c";

      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, bullet.type === "sniper" ? 4 : 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, bullet.type === "sniper" ? 10 : 9, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    });
  }

  function drawBeams(ctx, game) {
    game.beams.forEach((beam) => {
      ctx.save();

      ctx.globalAlpha = Math.max(0.18, beam.life / 90);
      ctx.strokeStyle = "#db2777";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(beam.x1, beam.y1);
      ctx.lineTo(beam.x2, beam.y2);
      ctx.stroke();

      ctx.strokeStyle = "#fbcfe8";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(beam.x1, beam.y1);
      ctx.lineTo(beam.x2, beam.y2);
      ctx.stroke();

      ctx.restore();
    });
  }

  function drawDamagePopups(ctx, game) {
    game.damagePopups.forEach((popup) => {
      ctx.save();

      ctx.globalAlpha = Math.max(0, popup.life / 620);
      ctx.fillStyle = popup.color;
      ctx.font = "bold 13px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.strokeStyle = "rgba(15,23,42,0.65)";
      ctx.lineWidth = 3;
      ctx.strokeText(popup.text, popup.x, popup.y);
      ctx.fillText(popup.text, popup.x, popup.y);

      ctx.restore();
    });
  }

  function drawTopOverlay(ctx, game) {
    ctx.save();

    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.beginPath();
    ctx.roundRect(18, 16, 388, 48, 14);
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
      earned = 85 + speedBonus + streakBonus;

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

  function getUpgradeCost(tower) {
    if (!tower || tower.level >= MAX_TOWER_LEVEL) return null;
    return Math.round(TOWER_TYPES[tower.type].cost * 0.72 + tower.level * 55);
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

    const refund = Math.round((tower.spent || TOWER_TYPES[tower.type].cost) * 0.65);

    game.coins += refund;
    game.towers = game.towers.filter((t) => t.id !== selectedTowerId);

    setSelectedTowerId(null);
    selectedTowerIdRef.current = null;
    setMessage(`Tower sold for ${refund} coins.`);
    syncStateFromRef();
  }

  const selectedTowerStats = selectedTower ? getTowerStats(selectedTower) : null;
  const selectedUpgradeCost = selectedTower ? getUpgradeCost(selectedTower) : null;

  return (
    <div className="td-page">
      <div className="td-header">
        <div>
          <p className="td-eyebrow">Study Siege</p>
          <h1>{studySet?.title || "Tower Defense"}</h1>
          <p className="td-subtitle">
            Drag towers onto the map, answer questions for coins, then upgrade your defense.
          </p>
        </div>

        <div className="td-header-actions">
          <button
            onClick={() => {
              setIsRunning((prev) => {
                isRunningRef.current = !prev;
                return !prev;
              });
            }}
          >
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

          <div className="td-panel td-study-panel">
            <div>
              <h3>Study Power</h3>
              <p>Correct answers earn coins. Fast answers and streaks give bonuses.</p>
            </div>

            <button className="td-primary-btn" onClick={openQuestion}>
              Answer Question
            </button>

            <div className="td-small-info">
              Streak: <strong>{streak}</strong>
            </div>
          </div>

          <div className="td-panel">
            <h3>Tower Shop</h3>
            <p className="td-panel-note">Drag a tower onto a valid green spot.</p>

            <div className="tower-options real-td-shop">
              {Object.entries(TOWER_TYPES).map(([key, tower]) => (
                <button
                  key={key}
                  className={
                    selectedTowerType === key
                      ? "tower-option active"
                      : "tower-option"
                  }
                  onPointerDown={(e) => startTowerDrag(key, e)}
                  onClick={() => setSelectedTowerType(key)}
                >
                  <div className={`tower-shop-icon tower-${key}`}>
                    {tower.icon}
                  </div>

                  <div className="tower-shop-copy">
                    <strong>{tower.name}</strong>
                    <span>{tower.description}</span>
                  </div>

                  <em>{tower.cost}</em>
                </button>
              ))}
            </div>
          </div>

          <div className="td-panel selected-tower-panel">
            <h3>Selected Tower</h3>

            {!selectedTower && (
              <p className="td-panel-note">
                Click one of your placed towers to upgrade or sell it.
              </p>
            )}

            {selectedTower && (
              <>
                <div className="selected-tower-top">
                  <div className={`tower-shop-icon tower-${selectedTower.type}`}>
                    {TOWER_TYPES[selectedTower.type].icon}
                  </div>

                  <div>
                    <strong>
                      {TOWER_TYPES[selectedTower.type].name} Tower
                    </strong>
                    <span>Level {selectedTower.level}</span>
                  </div>
                </div>

                <div className="tower-details-grid">
                  <div>
                    <span>Damage</span>
                    <strong>{Math.round(selectedTowerStats.damage)}</strong>
                  </div>
                  <div>
                    <span>Range</span>
                    <strong>{Math.round(selectedTowerStats.range)}</strong>
                  </div>
                  <div>
                    <span>Speed</span>
                    <strong>{Math.round(1000 / selectedTowerStats.fireRate * 10) / 10}/s</strong>
                  </div>
                  <div>
                    <span>Kills</span>
                    <strong>{selectedTower.kills || 0}</strong>
                  </div>
                </div>

                <div className="tower-ability-box">
                  <span>Current ability</span>
                  <p>{TOWER_TYPES[selectedTower.type].upgradeText[selectedTower.level - 1]}</p>
                </div>

                <button
                  className="td-primary-btn"
                  onClick={upgradeSelectedTower}
                  disabled={selectedTower.level >= MAX_TOWER_LEVEL}
                >
                  {selectedTower.level >= MAX_TOWER_LEVEL
                    ? "Max Level"
                    : `Upgrade · ${selectedUpgradeCost} coins`}
                </button>

                <button className="td-danger-btn" onClick={sellSelectedTower}>
                  Sell Tower
                </button>
              </>
            )}
          </div>

          <div className="td-panel">
            <h3>Waves</h3>
            <p>Waves auto-start, but you can send the next wave early.</p>

            <button
              className="td-secondary-btn"
              onClick={startWave}
              disabled={gameOver}
            >
              Send Wave Now
            </button>
          </div>
        </aside>
      </div>

      {draggingTower && (
        <div
          className={`floating-drag-tower ${
            draggingTower.valid ? "valid" : "invalid"
          }`}
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
                    ? `Nice job. You earned ${answerFeedback.earned} coins.`
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