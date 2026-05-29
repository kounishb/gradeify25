import React, { useEffect, useRef, useState } from "react";
import "../../styles/MobRush.css";

const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 640;

const TRACK_LEFT = 250;
const TRACK_RIGHT = 750;
const TRACK_CENTER = (TRACK_LEFT + TRACK_RIGHT) / 2;

const WORLD_LENGTH = 6200;
const FINISH_Y = 5350;

const PLAYER_BASE_Y = 515;
const MAX_VISIBLE_RUNNERS = 95;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function formatGateText(gate) {
  if (gate.type === "add") return `+${gate.value}`;
  if (gate.type === "sub") return `-${gate.value}`;
  if (gate.type === "mul") return `x${gate.value}`;
  if (gate.type === "div") return `÷${gate.value}`;
  return "";
}

function applyGate(count, gate) {
  if (gate.type === "add") return count + gate.value;
  if (gate.type === "sub") return Math.max(1, count - gate.value);
  if (gate.type === "mul") return count * gate.value;
  if (gate.type === "div") return Math.max(1, Math.floor(count / gate.value));
  return count;
}

function makeLevels() {
  const levels = [];

  const gatePairs = [
    [
      { lane: -1, type: "add", value: 12 },
      { lane: 1, type: "mul", value: 2 },
    ],
    [
      { lane: -1, type: "sub", value: 8 },
      { lane: 1, type: "add", value: 28 },
    ],
    [
      { lane: -1, type: "mul", value: 3 },
      { lane: 1, type: "add", value: 35 },
    ],
    [
      { lane: -1, type: "div", value: 2 },
      { lane: 1, type: "add", value: 50 },
    ],
    [
      { lane: -1, type: "add", value: 40 },
      { lane: 1, type: "mul", value: 2 },
    ],
    [
      { lane: -1, type: "mul", value: 4 },
      { lane: 1, type: "sub", value: 25 },
    ],
  ];

  let y = 720;

  gatePairs.forEach((pair, index) => {
    levels.push({
      id: `gates-${index}`,
      kind: "gates",
      y,
      gates: pair.map((g) => ({
        ...g,
        x: TRACK_CENTER + g.lane * 135,
        width: 190,
        height: 88,
        triggered: false,
      })),
    });

    y += 550;

    if (index % 2 === 0) {
      levels.push({
        id: `enemies-${index}`,
        kind: "enemies",
        y,
        count: 14 + index * 8,
        defeated: false,
        x: TRACK_CENTER + (index % 3 === 0 ? -60 : 70),
      });
      y += 480;
    } else {
      levels.push({
        id: `obstacle-${index}`,
        kind: "obstacle",
        y,
        blades: [
          {
            x: TRACK_CENTER - 110,
            radius: 54,
            hit: false,
            phase: Math.random() * Math.PI,
          },
          {
            x: TRACK_CENTER + 115,
            radius: 54,
            hit: false,
            phase: Math.random() * Math.PI,
          },
        ],
      });
      y += 480;
    }

    levels.push({
      id: `coins-${index}`,
      kind: "coins",
      y,
      coins: Array.from({ length: 12 }, (_, i) => ({
        x: TRACK_CENTER + Math.sin(i * 0.8) * 150,
        yOffset: i * 34,
        taken: false,
      })),
    });

    y += 420;
  });

  levels.push({
    id: "final-boss",
    kind: "boss",
    y: FINISH_Y,
    hp: 260,
    maxHp: 260,
    defeated: false,
  });

  return levels;
}

function createParticles(x, y, amount, type = "coin") {
  return Array.from({ length: amount }, () => ({
    x,
    y,
    vx: rand(-2.8, 2.8),
    vy: rand(-5.2, -1.2),
    life: rand(28, 52),
    maxLife: 52,
    size: rand(3, 8),
    type,
  }));
}

function getFormationPositions(count) {
  const visible = Math.min(count, MAX_VISIBLE_RUNNERS);
  const positions = [];

  for (let i = 0; i < visible; i++) {
    const row = Math.floor(i / 9);
    const col = i % 9;
    const rowCount = Math.min(9, visible - row * 9);

    const spacingX = 24;
    const spacingY = 22;
    const offsetX = (col - (rowCount - 1) / 2) * spacingX;
    const offsetY = row * spacingY;

    positions.push({
      x: offsetX + Math.sin(i * 13.1) * 2,
      y: offsetY,
      scale: 1 - row * 0.012,
    });
  }

  return positions;
}

export default function MobRush() {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const keysRef = useRef({});
  const dragRef = useRef({ active: false, startX: 0, playerStartX: TRACK_CENTER });

  const [gameState, setGameState] = useState("menu");
  const [upgradeVersion, setUpgradeVersion] = useState(0);

  const stateRef = useRef({
    gameState: "menu",
    playerX: TRACK_CENTER,
    worldY: 0,
    speed: 5.2,
    crowd: 1,
    coins: 0,
    runCoins: 0,
    distance: 0,
    levels: makeLevels(),
    particles: [],
    floatTexts: [],
    shake: 0,
    bossDamageTimer: 0,
    finalRewardGiven: false,
    upgrades: {
      startCrowd: 1,
      income: 1,
      damage: 1,
      speed: 1,
    },
    stats: {
      bestCrowd: 1,
      bestCoins: 0,
    },
  });

  const syncGameState = (value) => {
    stateRef.current.gameState = value;
    setGameState(value);
  };

  const forceUpdate = () => setUpgradeVersion((v) => v + 1);

  const addFloatText = (text, x, y, color = "#ffffff", size = 34) => {
    stateRef.current.floatTexts.push({
      text,
      x,
      y,
      vy: -1.4,
      life: 56,
      color,
      size,
    });
  };

  const addParticles = (x, y, amount, type = "coin") => {
    stateRef.current.particles.push(...createParticles(x, y, amount, type));
  };

  const resetRun = () => {
    const s = stateRef.current;
    s.playerX = TRACK_CENTER;
    s.worldY = 0;
    s.distance = 0;
    s.speed = 5.2 + s.upgrades.speed * 0.16;
    s.crowd = Math.max(1, s.upgrades.startCrowd);
    s.runCoins = 0;
    s.levels = makeLevels();
    s.particles = [];
    s.floatTexts = [];
    s.shake = 0;
    s.bossDamageTimer = 0;
    s.finalRewardGiven = false;
    syncGameState("playing");
  };

  const hardReset = () => {
    stateRef.current = {
      gameState: "menu",
      playerX: TRACK_CENTER,
      worldY: 0,
      speed: 5.2,
      crowd: 1,
      coins: 0,
      runCoins: 0,
      distance: 0,
      levels: makeLevels(),
      particles: [],
      floatTexts: [],
      shake: 0,
      bossDamageTimer: 0,
      finalRewardGiven: false,
      upgrades: {
        startCrowd: 1,
        income: 1,
        damage: 1,
        speed: 1,
      },
      stats: {
        bestCrowd: 1,
        bestCoins: 0,
      },
    };
    syncGameState("menu");
    forceUpdate();
  };

  const buyUpgrade = (key) => {
    const s = stateRef.current;
    const current = s.upgrades[key];

    const costs = {
      startCrowd: 45 + current * 35,
      income: 60 + current * 45,
      damage: 70 + current * 50,
      speed: 50 + current * 40,
    };

    const cost = costs[key];
    if (s.coins < cost) return;

    s.coins -= cost;
    s.upgrades[key] += 1;
    forceUpdate();
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      keysRef.current[e.key.toLowerCase()] = true;
      if (e.key === " " && stateRef.current.gameState === "menu") resetRun();
    };

    const onKeyUp = (e) => {
      keysRef.current[e.key.toLowerCase()] = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getCanvasX = (clientX) => {
      const rect = canvas.getBoundingClientRect();
      return ((clientX - rect.left) / rect.width) * CANVAS_WIDTH;
    };

    const onPointerDown = (e) => {
      dragRef.current.active = true;
      dragRef.current.startX = getCanvasX(e.clientX);
      dragRef.current.playerStartX = stateRef.current.playerX;
      canvas.setPointerCapture?.(e.pointerId);
    };

    const onPointerMove = (e) => {
      if (!dragRef.current.active) return;
      const currentX = getCanvasX(e.clientX);
      const dx = currentX - dragRef.current.startX;
      stateRef.current.playerX = clamp(
        dragRef.current.playerStartX + dx * 1.1,
        TRACK_LEFT + 45,
        TRACK_RIGHT - 45
      );
    };

    const onPointerUp = (e) => {
      dragRef.current.active = false;
      canvas.releasePointerCapture?.(e.pointerId);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
    };
  }, []);

  useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");

    let lastTime = performance.now();

    const loop = (now) => {
      const dt = Math.min(2, (now - lastTime) / 16.67);
      lastTime = now;

      update(dt);
      draw(ctx, now);

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const update = (dt) => {
    const s = stateRef.current;

    s.particles = s.particles
      .map((p) => ({
        ...p,
        x: p.x + p.vx * dt,
        y: p.y + p.vy * dt,
        vy: p.vy + 0.18 * dt,
        life: p.life - dt,
      }))
      .filter((p) => p.life > 0);

    s.floatTexts = s.floatTexts
      .map((f) => ({
        ...f,
        y: f.y + f.vy * dt,
        life: f.life - dt,
      }))
      .filter((f) => f.life > 0);

    s.shake = Math.max(0, s.shake - 0.7 * dt);

    if (s.gameState !== "playing") return;

    if (!dragRef.current.active) {
      if (keysRef.current.a || keysRef.current.arrowleft) s.playerX -= 8.5 * dt;
      if (keysRef.current.d || keysRef.current.arrowright) s.playerX += 8.5 * dt;
    }

    s.playerX = clamp(s.playerX, TRACK_LEFT + 45, TRACK_RIGHT - 45);

    if (s.worldY < FINISH_Y - 120) {
      s.worldY += s.speed * dt;
      s.distance = Math.floor((s.worldY / WORLD_LENGTH) * 100);
    } else {
      s.worldY += 2.2 * dt;
    }

    for (const section of s.levels) {
      const screenY = section.y - s.worldY + 110;

      if (screenY > CANVAS_HEIGHT + 150 || screenY < -220) continue;

      if (section.kind === "gates") {
        for (const gate of section.gates) {
          if (gate.triggered) continue;

          const hitY = Math.abs(screenY - PLAYER_BASE_Y) < 48;
          const hitX = Math.abs(s.playerX - gate.x) < gate.width / 2;

          if (hitY && hitX) {
            gate.triggered = true;

            const before = s.crowd;
            s.crowd = clamp(applyGate(s.crowd, gate), 1, 999);

            const positive = s.crowd >= before;
            addFloatText(
              `${formatGateText(gate)}`,
              gate.x,
              PLAYER_BASE_Y - 90,
              positive ? "#4dff9b" : "#ff4d6d",
              44
            );

            addParticles(gate.x, PLAYER_BASE_Y - 60, positive ? 34 : 22, positive ? "good" : "bad");
            s.shake = positive ? 5 : 8;
          }
        }
      }

      if (section.kind === "enemies" && !section.defeated) {
        const hitY = Math.abs(screenY - PLAYER_BASE_Y + 5) < 52;
        const hitX = Math.abs(s.playerX - section.x) < 135;

        if (hitY && hitX) {
          const lost = Math.min(s.crowd - 1, section.count);
          const enemyLost = Math.min(section.count, s.crowd);

          s.crowd = Math.max(1, s.crowd - lost);
          section.count -= enemyLost;

          addFloatText(`-${lost}`, section.x, PLAYER_BASE_Y - 80, "#ff4d6d", 36);
          addParticles(section.x, PLAYER_BASE_Y - 45, 38, "hit");
          s.shake = 10;

          if (section.count <= 0) {
            section.defeated = true;
            const reward = Math.floor((18 + enemyLost * 1.5) * s.upgrades.income);
            s.coins += reward;
            s.runCoins += reward;
            addFloatText(`+${reward} coins`, section.x, PLAYER_BASE_Y - 125, "#ffe66d", 30);
            addParticles(section.x, PLAYER_BASE_Y - 90, 42, "coin");
            forceUpdate();
          }
        }
      }

      if (section.kind === "obstacle") {
        for (const blade of section.blades) {
          if (blade.hit) continue;

          const bladeX = blade.x + Math.sin(Date.now() / 280 + blade.phase) * 65;
          const hitY = Math.abs(screenY - PLAYER_BASE_Y + 12) < 48;
          const hitX = Math.abs(s.playerX - bladeX) < blade.radius + 35;

          if (hitY && hitX) {
            blade.hit = true;
            const lost = Math.min(s.crowd - 1, Math.ceil(s.crowd * 0.28) + 4);
            s.crowd = Math.max(1, s.crowd - lost);
            addFloatText(`-${lost}`, bladeX, PLAYER_BASE_Y - 90, "#ff4d6d", 38);
            addParticles(bladeX, PLAYER_BASE_Y - 55, 32, "bad");
            s.shake = 12;
          }
        }
      }

      if (section.kind === "coins") {
        for (const coin of section.coins) {
          if (coin.taken) continue;

          const coinScreenY = screenY + coin.yOffset;
          const hitY = Math.abs(coinScreenY - PLAYER_BASE_Y) < 42;
          const hitX = Math.abs(s.playerX - coin.x) < 58;

          if (hitY && hitX) {
            coin.taken = true;
            const gain = 2 * s.upgrades.income;
            s.coins += gain;
            s.runCoins += gain;
            addParticles(coin.x, PLAYER_BASE_Y - 40, 8, "coin");
            forceUpdate();
          }
        }
      }

      if (section.kind === "boss" && !section.defeated) {
        const hitY = Math.abs(screenY - PLAYER_BASE_Y + 35) < 75;

        if (hitY) {
          s.bossDamageTimer += dt;

          if (s.bossDamageTimer > 5) {
            s.bossDamageTimer = 0;

            const damage = Math.max(1, Math.floor(s.crowd * (0.4 + s.upgrades.damage * 0.08)));
            section.hp -= damage;
            const lost = Math.min(s.crowd - 1, Math.ceil(section.maxHp / 80));
            s.crowd = Math.max(1, s.crowd - lost);

            addFloatText(`-${damage}`, TRACK_CENTER, PLAYER_BASE_Y - 155, "#ffffff", 34);
            addParticles(TRACK_CENTER, PLAYER_BASE_Y - 90, 18, "hit");
            s.shake = 8;

            if (section.hp <= 0) {
              section.defeated = true;
              const reward = Math.floor((100 + s.crowd * 3) * s.upgrades.income);
              s.coins += reward;
              s.runCoins += reward;
              s.stats.bestCrowd = Math.max(s.stats.bestCrowd, s.crowd);
              s.stats.bestCoins = Math.max(s.stats.bestCoins, s.runCoins);
              s.finalRewardGiven = true;

              addFloatText(`BOSS DOWN! +${reward}`, TRACK_CENTER, PLAYER_BASE_Y - 175, "#ffe66d", 36);
              addParticles(TRACK_CENTER, PLAYER_BASE_Y - 120, 100, "coin");
              s.shake = 18;

              setTimeout(() => {
                syncGameState("complete");
                forceUpdate();
              }, 900);
            }

            if (s.crowd <= 1 && section.hp > 0) {
              setTimeout(() => {
                syncGameState("failed");
                forceUpdate();
              }, 450);
            }
          }
        }
      }
    }

    if (s.worldY > WORLD_LENGTH && s.gameState === "playing") {
      syncGameState("complete");
      forceUpdate();
    }
  };

  const drawTrack = (ctx, now) => {
    const s = stateRef.current;

    const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    sky.addColorStop(0, "#72dcff");
    sky.addColorStop(0.55, "#7fd7ff");
    sky.addColorStop(1, "#dff8ff");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.save();
    ctx.translate(0, 40);

    const roadTopLeft = 370;
    const roadTopRight = 630;
    const roadBottomLeft = 190;
    const roadBottomRight = 810;

    const roadGradient = ctx.createLinearGradient(0, 70, 0, CANVAS_HEIGHT);
    roadGradient.addColorStop(0, "#f9fbff");
    roadGradient.addColorStop(1, "#d7dceb");

    ctx.fillStyle = roadGradient;
    ctx.beginPath();
    ctx.moveTo(roadTopLeft, 0);
    ctx.lineTo(roadTopRight, 0);
    ctx.lineTo(roadBottomRight, CANVAS_HEIGHT);
    ctx.lineTo(roadBottomLeft, CANVAS_HEIGHT);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(roadTopLeft, 0);
    ctx.lineTo(roadBottomLeft, CANVAS_HEIGHT);
    ctx.moveTo(roadTopRight, 0);
    ctx.lineTo(roadBottomRight, CANVAS_HEIGHT);
    ctx.stroke();

    ctx.strokeStyle = "rgba(150,160,185,0.23)";
    ctx.lineWidth = 3;
    for (let i = 0; i < 12; i++) {
      const y = ((i * 115 - (s.worldY * 1.6) % 115) + CANVAS_HEIGHT) % CANVAS_HEIGHT;
      const t = y / CANVAS_HEIGHT;
      const left = roadTopLeft + (roadBottomLeft - roadTopLeft) * t;
      const right = roadTopRight + (roadBottomRight - roadTopRight) * t;
      ctx.beginPath();
      ctx.moveTo(left + 30, y);
      ctx.lineTo(right - 30, y);
      ctx.stroke();
    }

    ctx.restore();
  };

  const worldToScreenY = (worldY) => worldY - stateRef.current.worldY + 110;

  const drawGate = (ctx, gate, screenY) => {
    const positive = gate.type === "add" || gate.type === "mul";

    ctx.save();

    ctx.globalAlpha = gate.triggered ? 0.38 : 1;

    const x = gate.x;
    const w = gate.width;
    const h = gate.height;

    const gradient = ctx.createLinearGradient(x - w / 2, screenY, x + w / 2, screenY + h);
    if (positive) {
      gradient.addColorStop(0, "#12d86e");
      gradient.addColorStop(1, "#03964d");
    } else {
      gradient.addColorStop(0, "#ff4964");
      gradient.addColorStop(1, "#b51632");
    }

    ctx.fillStyle = gradient;
    roundRect(ctx, x - w / 2, screenY - h / 2, w, h, 16);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 5;
    roundRect(ctx, x - w / 2, screenY - h / 2, w, h, 16);
    ctx.stroke();

    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(x - 4, screenY - h / 2, 8, h);

    ctx.font = "900 42px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 7;
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.strokeText(formatGateText(gate), x, screenY);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(formatGateText(gate), x, screenY);

    ctx.restore();
  };

  const drawEnemies = (ctx, section, screenY) => {
    if (section.defeated) return;

    const count = Math.min(section.count, 40);
    const positions = getFormationPositions(count);

    ctx.save();

    ctx.font = "900 28px Arial";
    ctx.textAlign = "center";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0,0,0,0.38)";
    ctx.strokeText(`${section.count}`, section.x, screenY - 68);
    ctx.fillStyle = "#ff405f";
    ctx.fillText(`${section.count}`, section.x, screenY - 68);

    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      const px = section.x + p.x * 0.75;
      const py = screenY + p.y * 0.7;
      drawBlob(ctx, px, py, "#ff405f", "#b70d2c", 0.78);
    }

    ctx.restore();
  };

  const drawObstacle = (ctx, section, screenY, now) => {
    ctx.save();

    for (const blade of section.blades) {
      if (blade.hit) ctx.globalAlpha = 0.35;
      else ctx.globalAlpha = 1;

      const bladeX = blade.x + Math.sin(now / 280 + blade.phase) * 65;
      const angle = now / 120 + blade.phase;

      ctx.save();
      ctx.translate(bladeX, screenY);
      ctx.rotate(angle);

      ctx.fillStyle = "#3a4258";
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();

      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.fillStyle = "#f3f6ff";
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(70, -5);
        ctx.lineTo(92, 0);
        ctx.lineTo(70, 5);
        ctx.lineTo(0, 10);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = "rgba(0,0,0,0.25)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.fillStyle = "#222838";
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    ctx.restore();
  };

  const drawCoins = (ctx, section, screenY, now) => {
    for (const coin of section.coins) {
      if (coin.taken) continue;

      const y = screenY + coin.yOffset;
      const bob = Math.sin(now / 180 + coin.x) * 4;

      ctx.save();
      ctx.translate(coin.x, y + bob);
      ctx.scale(1, 0.82);

      const grad = ctx.createRadialGradient(-5, -6, 4, 0, 0, 18);
      grad.addColorStop(0, "#fff9a8");
      grad.addColorStop(0.45, "#ffd43b");
      grad.addColorStop(1, "#e39d00");

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = "rgba(130,85,0,0.55)";
      ctx.font = "900 18px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("$", 0, 1);

      ctx.restore();
    }
  };

  const drawBoss = (ctx, section, screenY) => {
    if (section.defeated) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.font = "900 44px Arial";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffe66d";
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 7;
      ctx.strokeText("DESTROYED", TRACK_CENTER, screenY - 20);
      ctx.fillText("DESTROYED", TRACK_CENTER, screenY - 20);
      ctx.restore();
      return;
    }

    const x = TRACK_CENTER;
    const y = screenY;

    ctx.save();

    ctx.fillStyle = "#38405a";
    roundRect(ctx, x - 120, y - 85, 240, 170, 22);
    ctx.fill();

    ctx.fillStyle = "#4b5574";
    roundRect(ctx, x - 92, y - 125, 184, 70, 20);
    ctx.fill();

    ctx.fillStyle = "#ff405f";
    ctx.beginPath();
    ctx.arc(x - 45, y - 80, 13, 0, Math.PI * 2);
    ctx.arc(x + 45, y - 80, 13, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#252b3c";
    roundRect(ctx, x - 65, y - 25, 130, 22, 8);
    ctx.fill();

    ctx.fillStyle = "#2a3044";
    ctx.fillRect(x - 145, y - 40, 35, 105);
    ctx.fillRect(x + 110, y - 40, 35, 105);

    ctx.fillStyle = "#1e2433";
    roundRect(ctx, x - 160, y + 55, 320, 55, 16);
    ctx.fill();

    const barW = 300;
    const pct = clamp(section.hp / section.maxHp, 0, 1);

    ctx.fillStyle = "rgba(0,0,0,0.28)";
    roundRect(ctx, x - barW / 2, y - 165, barW, 26, 13);
    ctx.fill();

    const hpGrad = ctx.createLinearGradient(x - barW / 2, y, x + barW / 2, y);
    hpGrad.addColorStop(0, "#ff405f");
    hpGrad.addColorStop(1, "#ffae00");

    ctx.fillStyle = hpGrad;
    roundRect(ctx, x - barW / 2, y - 165, barW * pct, 26, 13);
    ctx.fill();

    ctx.font = "900 26px Arial";
    ctx.textAlign = "center";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.strokeText("FINAL BOSS", x, y - 190);
    ctx.fillStyle = "#ffffff";
    ctx.fillText("FINAL BOSS", x, y - 190);

    ctx.restore();
  };

  const drawCrowd = (ctx, now) => {
    const s = stateRef.current;
    const positions = getFormationPositions(s.crowd);

    const runBob = Math.sin(now / 90) * 3;

    ctx.save();

    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 7;

    for (let i = positions.length - 1; i >= 0; i--) {
      const p = positions[i];
      const px = s.playerX + p.x;
      const py = PLAYER_BASE_Y + p.y * 0.62 + runBob * (i % 2 ? 1 : -0.3);

      drawBlob(ctx, px, py, "#1fa9ff", "#0069c9", p.scale);
    }

    ctx.restore();

    ctx.save();
    ctx.font = "900 42px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 8;
    ctx.strokeStyle = "rgba(0,0,0,0.38)";
    ctx.strokeText(`${s.crowd}`, s.playerX, PLAYER_BASE_Y - 82);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`${s.crowd}`, s.playerX, PLAYER_BASE_Y - 82);
    ctx.restore();
  };

  const drawParticles = (ctx) => {
    const s = stateRef.current;

    for (const p of s.particles) {
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;

      if (p.type === "coin") ctx.fillStyle = "#ffd43b";
      else if (p.type === "good") ctx.fillStyle = "#4dff9b";
      else if (p.type === "bad") ctx.fillStyle = "#ff4d6d";
      else ctx.fillStyle = "#ffffff";

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    for (const f of s.floatTexts) {
      const alpha = clamp(f.life / 56, 0, 1);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `900 ${f.size}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 7;
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
  };

  const drawHUD = (ctx) => {
    const s = stateRef.current;

    ctx.save();

    ctx.fillStyle = "rgba(255,255,255,0.82)";
    roundRect(ctx, 28, 24, 208, 72, 22);
    ctx.fill();

    ctx.fillStyle = "#202436";
    ctx.font = "900 24px Arial";
    ctx.textAlign = "left";
    ctx.fillText(`Coins: ${s.coins}`, 52, 55);

    ctx.font = "800 17px Arial";
    ctx.fillStyle = "#68708a";
    ctx.fillText(`Run: +${s.runCoins}`, 52, 80);

    ctx.fillStyle = "rgba(255,255,255,0.82)";
    roundRect(ctx, CANVAS_WIDTH - 255, 24, 225, 72, 22);
    ctx.fill();

    ctx.fillStyle = "#202436";
    ctx.font = "900 24px Arial";
    ctx.textAlign = "left";
    ctx.fillText(`Crowd: ${s.crowd}`, CANVAS_WIDTH - 230, 55);

    ctx.font = "800 17px Arial";
    ctx.fillStyle = "#68708a";
    ctx.fillText(`Progress: ${clamp(s.distance, 0, 100)}%`, CANVAS_WIDTH - 230, 80);

    const barX = 300;
    const barY = 38;
    const barW = 400;
    const barH = 22;
    const pct = clamp(s.worldY / FINISH_Y, 0, 1);

    ctx.fillStyle = "rgba(0,0,0,0.16)";
    roundRect(ctx, barX, barY, barW, barH, 999);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    roundRect(ctx, barX + 3, barY + 3, (barW - 6) * pct, barH - 6, 999);
    ctx.fill();

    ctx.fillStyle = "#202436";
    ctx.font = "900 15px Arial";
    ctx.textAlign = "center";
    ctx.fillText("FINISH", barX + barW + 42, barY + 17);

    ctx.restore();
  };

  const drawOverlay = (ctx) => {
    const s = stateRef.current;

    if (s.gameState === "playing") return;

    ctx.save();

    ctx.fillStyle = "rgba(12,20,38,0.48)";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.fillStyle = "rgba(255,255,255,0.94)";
    roundRect(ctx, 270, 120, 460, 360, 34);
    ctx.fill();

    ctx.textAlign = "center";

    if (s.gameState === "menu") {
      ctx.fillStyle = "#202436";
      ctx.font = "900 58px Arial";
      ctx.fillText("MOB RUSH", CANVAS_WIDTH / 2, 195);

      ctx.fillStyle = "#68708a";
      ctx.font = "800 22px Arial";
      ctx.fillText("Swipe left and right. Hit the best gates.", CANVAS_WIDTH / 2, 240);
      ctx.fillText("Build the biggest mob and smash the boss.", CANVAS_WIDTH / 2, 270);

      ctx.fillStyle = "#1fa9ff";
      roundRect(ctx, 382, 325, 236, 72, 24);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = "900 30px Arial";
      ctx.fillText("START RUN", CANVAS_WIDTH / 2, 371);

      ctx.fillStyle = "#8a92aa";
      ctx.font = "700 16px Arial";
      ctx.fillText("A/D or Arrow Keys also work", CANVAS_WIDTH / 2, 430);
    }

    if (s.gameState === "complete") {
      ctx.fillStyle = "#202436";
      ctx.font = "900 52px Arial";
      ctx.fillText("LEVEL CLEARED", CANVAS_WIDTH / 2, 190);

      ctx.fillStyle = "#68708a";
      ctx.font = "800 24px Arial";
      ctx.fillText(`Coins earned: +${s.runCoins}`, CANVAS_WIDTH / 2, 245);
      ctx.fillText(`Final crowd: ${s.crowd}`, CANVAS_WIDTH / 2, 280);

      ctx.fillStyle = "#12c76f";
      roundRect(ctx, 382, 330, 236, 72, 24);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = "900 30px Arial";
      ctx.fillText("RUN AGAIN", CANVAS_WIDTH / 2, 376);
    }

    if (s.gameState === "failed") {
      ctx.fillStyle = "#202436";
      ctx.font = "900 52px Arial";
      ctx.fillText("MOB WIPED", CANVAS_WIDTH / 2, 190);

      ctx.fillStyle = "#68708a";
      ctx.font = "800 24px Arial";
      ctx.fillText(`Coins earned: +${s.runCoins}`, CANVAS_WIDTH / 2, 245);
      ctx.fillText("Upgrade and try again.", CANVAS_WIDTH / 2, 280);

      ctx.fillStyle = "#ff405f";
      roundRect(ctx, 382, 330, 236, 72, 24);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = "900 30px Arial";
      ctx.fillText("RETRY", CANVAS_WIDTH / 2, 376);
    }

    ctx.restore();
  };

  const draw = (ctx, now) => {
    const s = stateRef.current;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const shakeX = s.shake ? rand(-s.shake, s.shake) : 0;
    const shakeY = s.shake ? rand(-s.shake, s.shake) : 0;

    ctx.save();
    ctx.translate(shakeX, shakeY);

    drawTrack(ctx, now);

    for (const section of s.levels) {
      const screenY = worldToScreenY(section.y);

      if (screenY < -260 || screenY > CANVAS_HEIGHT + 260) continue;

      if (section.kind === "gates") {
        section.gates.forEach((gate) => drawGate(ctx, gate, screenY));
      }

      if (section.kind === "enemies") {
        drawEnemies(ctx, section, screenY);
      }

      if (section.kind === "obstacle") {
        drawObstacle(ctx, section, screenY, now);
      }

      if (section.kind === "coins") {
        drawCoins(ctx, section, screenY, now);
      }

      if (section.kind === "boss") {
        drawBoss(ctx, section, screenY);
      }
    }

    drawCrowd(ctx, now);
    drawParticles(ctx);
    drawHUD(ctx);

    ctx.restore();

    drawOverlay(ctx);
  };

  const handleCanvasClick = (e) => {
    const s = stateRef.current;

    if (s.gameState === "playing") return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
    const y = ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;

    const inButton = x >= 382 && x <= 618 && y >= 325 && y <= 402;

    if (inButton) resetRun();
  };

  const s = stateRef.current;

  const upgradeData = [
    {
      key: "startCrowd",
      name: "Starting Mob",
      desc: "Begin each run with more runners.",
      level: s.upgrades.startCrowd,
      cost: 45 + s.upgrades.startCrowd * 35,
    },
    {
      key: "income",
      name: "Coin Magnet",
      desc: "Earn more coins from everything.",
      level: s.upgrades.income,
      cost: 60 + s.upgrades.income * 45,
    },
    {
      key: "damage",
      name: "Boss Damage",
      desc: "Your mob hits the final boss harder.",
      level: s.upgrades.damage,
      cost: 70 + s.upgrades.damage * 50,
    },
    {
      key: "speed",
      name: "Rush Speed",
      desc: "Move through the level faster.",
      level: s.upgrades.speed,
      cost: 50 + s.upgrades.speed * 40,
    },
  ];

  return (
    <div className="mob-rush-page">
      <div className="mob-rush-shell">
        <div className="mob-rush-header">
          <div>
            <h1>Mob Rush</h1>
            <p>Pick gates, grow the mob, dodge blades, and destroy the boss.</p>
          </div>

          <div className="mob-rush-header-actions">
            <button onClick={resetRun}>Start Run</button>
            <button className="secondary" onClick={hardReset}>
              Reset
            </button>
          </div>
        </div>

        <div className="mob-rush-main">
          <div className="mob-rush-canvas-wrap">
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              onClick={handleCanvasClick}
              className="mob-rush-canvas"
            />
          </div>

          <aside className="mob-rush-panel">
            <div className="mob-rush-stat-card">
              <span>Total Coins</span>
              <strong>{s.coins}</strong>
            </div>

            <div className="mob-rush-stat-grid">
              <div>
                <span>Best Mob</span>
                <strong>{s.stats.bestCrowd}</strong>
              </div>
              <div>
                <span>Best Coins</span>
                <strong>{s.stats.bestCoins}</strong>
              </div>
            </div>

            <div className="mob-rush-upgrades">
              <h2>Upgrades</h2>

              {upgradeData.map((upgrade) => (
                <button
                  key={upgrade.key}
                  className="mob-rush-upgrade"
                  onClick={() => buyUpgrade(upgrade.key)}
                  disabled={s.coins < upgrade.cost}
                >
                  <div>
                    <strong>{upgrade.name}</strong>
                    <span>{upgrade.desc}</span>
                    <small>Level {upgrade.level}</small>
                  </div>

                  <b>{upgrade.cost}</b>
                </button>
              ))}
            </div>

            <div className="mob-rush-help">
              <h2>Controls</h2>
              <p>Drag/swipe on the game, or use A/D and arrow keys.</p>
              <p>Green gates help. Red gates hurt. Bigger mob = bigger boss damage.</p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function drawBlob(ctx, x, y, topColor, bottomColor, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  const grad = ctx.createLinearGradient(0, -25, 0, 35);
  grad.addColorStop(0, topColor);
  grad.addColorStop(1, bottomColor);

  ctx.fillStyle = "rgba(0,0,0,0.14)";
  ctx.beginPath();
  ctx.ellipse(0, 38, 17, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = grad;

  ctx.beginPath();
  ctx.arc(0, -17, 17, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(0, 13, 18, 27, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(-6, -22, 5, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = bottomColor;
  ctx.lineWidth = 8;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(-13, 8);
  ctx.lineTo(-27, 22);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(13, 8);
  ctx.lineTo(27, 22);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-7, 35);
  ctx.lineTo(-11, 52);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(7, 35);
  ctx.lineTo(11, 52);
  ctx.stroke();

  ctx.restore();
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}