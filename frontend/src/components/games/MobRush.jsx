import React, { useCallback, useEffect, useRef, useState } from "react";
import "../../styles/MobRush.css";

const CW = 1000;
const CH = 640;

const TRACK_L = 250;
const TRACK_R = 750;
const TRACK_CX = 500;

const HORIZON_Y = 118;
const PLAYER_Y = 530;

const LANE_L = TRACK_L + 45;
const LANE_R = TRACK_R - 45;

const WORLD_LEN = 6200;
const FINISH_WORLD = 5520;
const LOOKAHEAD_WORLD = 1600;

const MAX_VISIBLE_RUNNERS = 100;
const HIT_WORLD_WINDOW = 48;
const COIN_HIT_WORLD_WINDOW = 36;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => Math.random() * (b - a) + a;

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function worldToScreenY(objY, worldY) {
  const dist = objY - worldY;

  if (dist < 0) {
    return PLAYER_Y + Math.abs(dist) * 0.72;
  }

  const t = 1 - clamp(dist / LOOKAHEAD_WORLD, 0, 1);
  const eased = easeOutCubic(t);

  return HORIZON_Y + (PLAYER_Y - HORIZON_Y) * eased;
}

function perspectiveScale(screenY) {
  const t = clamp((screenY - HORIZON_Y) / (PLAYER_Y - HORIZON_Y), 0.04, 1.22);
  return t;
}

function perspectiveX(worldX, screenY) {
  const t = perspectiveScale(screenY);
  return TRACK_CX + (worldX - TRACK_CX) * t;
}

function perspectiveW(width, screenY) {
  return width * perspectiveScale(screenY);
}

function inHitZone(objY, worldY, window = HIT_WORLD_WINDOW) {
  return Math.abs(objY - worldY) <= window;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function fmtGate(gate) {
  if (gate.type === "add") return `+${gate.value}`;
  if (gate.type === "sub") return `-${gate.value}`;
  if (gate.type === "mul") return `×${gate.value}`;
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
    [{ lane: -1, type: "add", value: 14 }, { lane: 1, type: "mul", value: 2 }],
    [{ lane: -1, type: "sub", value: 8 }, { lane: 1, type: "add", value: 32 }],
    [{ lane: -1, type: "mul", value: 3 }, { lane: 1, type: "add", value: 38 }],
    [{ lane: -1, type: "div", value: 2 }, { lane: 1, type: "add", value: 55 }],
    [{ lane: -1, type: "add", value: 45 }, { lane: 1, type: "mul", value: 2 }],
    [{ lane: -1, type: "mul", value: 4 }, { lane: 1, type: "sub", value: 30 }],
    [{ lane: -1, type: "add", value: 70 }, { lane: 1, type: "mul", value: 2 }],
  ];

  let y = 760;

  gatePairs.forEach((pair, i) => {
    levels.push({
      id: `gates-${i}`,
      kind: "gates",
      y,
      gates: pair.map((gate) => ({
        ...gate,
        x: TRACK_CX + gate.lane * 138,
        width: 190,
        height: 92,
        triggered: false,
      })),
    });

    y += 520;

    if (i % 3 === 0) {
      levels.push({
        id: `enemies-${i}`,
        kind: "enemies",
        y,
        x: TRACK_CX + (i % 2 === 0 ? -65 : 70),
        count: 16 + i * 7,
        defeated: false,
      });
      y += 430;
    } else if (i % 3 === 1) {
      levels.push({
        id: `obstacles-${i}`,
        kind: "obstacle",
        y,
        blades: [
          {
            x: TRACK_CX - 115,
            radius: 56,
            hit: false,
            phase: i * 1.3,
          },
          {
            x: TRACK_CX + 115,
            radius: 56,
            hit: false,
            phase: i * 1.9,
          },
        ],
      });
      y += 430;
    } else {
      levels.push({
        id: `wall-${i}`,
        kind: "wall",
        y,
        x: TRACK_CX,
        hp: 42 + i * 16,
        maxHp: 42 + i * 16,
        broken: false,
      });
      y += 420;
    }

    levels.push({
      id: `coins-${i}`,
      kind: "coins",
      y,
      coins: Array.from({ length: 14 }, (_, k) => ({
        x: TRACK_CX + Math.sin(k * 0.72 + i) * 155,
        yOffset: k * 42,
        taken: false,
      })),
    });

    y += 510;
  });

  levels.push({
    id: "boss",
    kind: "boss",
    y: FINISH_WORLD,
    hp: 340,
    maxHp: 340,
    defeated: false,
  });

  return levels;
}

function spawnParticles(x, y, amount, type) {
  return Array.from({ length: amount }, () => ({
    x,
    y,
    vx: rand(-4.2, 4.2),
    vy: rand(-7.2, -1.4),
    life: rand(34, 64),
    maxLife: 64,
    size: rand(3, 9),
    type,
  }));
}

function formationPositions(count) {
  const visible = Math.min(count, MAX_VISIBLE_RUNNERS);
  const positions = [];

  for (let i = 0; i < visible; i += 1) {
    const row = Math.floor(i / 10);
    const col = i % 10;
    const rowCount = Math.min(10, visible - row * 10);

    positions.push({
      x: (col - (rowCount - 1) / 2) * 25 + Math.sin(i * 9.7) * 2.2,
      y: row * 23,
      scale: Math.max(0.55, 1 - row * 0.018),
      phase: i * 0.37,
    });
  }

  return positions;
}

function drawRunner(ctx, x, y, scale = 1, hue = 210, phase = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  const bob = Math.sin(phase * 2) * 2.2;
  ctx.translate(0, bob);

  ctx.fillStyle = "rgba(0,0,0,0.24)";
  ctx.beginPath();
  ctx.ellipse(0, 45, 18, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  const top = `hsl(${hue}, 95%, 58%)`;
  const bottom = `hsl(${hue}, 95%, 35%)`;

  const legSwing = Math.sin(phase * 2) * 0.55;
  ctx.lineCap = "round";
  ctx.strokeStyle = bottom;
  ctx.lineWidth = 8;

  ctx.beginPath();
  ctx.moveTo(-7, 28);
  ctx.lineTo(-11 - legSwing * 8, 50);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(7, 28);
  ctx.lineTo(11 + legSwing * 8, 50);
  ctx.stroke();

  const armSwing = Math.sin(phase * 2 + 1.3) * 0.55;
  ctx.lineWidth = 7;

  ctx.beginPath();
  ctx.moveTo(-13, 5);
  ctx.lineTo(-24 - armSwing * 8, 22);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(13, 5);
  ctx.lineTo(24 + armSwing * 8, 22);
  ctx.stroke();

  const bodyGrad = ctx.createLinearGradient(-16, -18, 16, 30);
  bodyGrad.addColorStop(0, top);
  bodyGrad.addColorStop(1, bottom);

  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.ellipse(0, 10, 16, 24, 0, 0, Math.PI * 2);
  ctx.fill();

  const headGrad = ctx.createRadialGradient(-5, -25, 3, 0, -18, 17);
  headGrad.addColorStop(0, `hsl(${hue}, 95%, 76%)`);
  headGrad.addColorStop(1, top);

  ctx.fillStyle = headGrad;
  ctx.beginPath();
  ctx.arc(0, -20, 15, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(0,0,0,0.72)";
  ctx.beginPath();
  ctx.arc(-5, -21, 2.4, 0, Math.PI * 2);
  ctx.arc(5, -21, 2.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(0,0,0,0.68)";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, -16, 5, 0.15, Math.PI - 0.15);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.42)";
  ctx.beginPath();
  ctx.ellipse(-6, -27, 4, 3, -0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawMiniCoin(ctx, x, y, r, text = "$") {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, 0.86);

  const grad = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.12, 0, 0, r);
  grad.addColorStop(0, "#fff9aa");
  grad.addColorStop(0.45, "#ffd43b");
  grad.addColorStop(1, "#d98b00");

  ctx.shadowColor = "rgba(255,210,40,0.8)";
  ctx.shadowBlur = 10;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(115,70,0,0.72)";
  ctx.font = `900 ${Math.max(8, r * 0.95)}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, 1);

  ctx.restore();
}

export default function MobRush() {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const keysRef = useRef({});
  const dragRef = useRef({ active: false, startX: 0, baseTargetX: TRACK_CX });
  const mountedRef = useRef(true);
  const timeoutRef = useRef([]);
  const runIdRef = useRef(0);

  const [, forceRender] = useState(0);

  const gs = useRef({
    phase: "menu",
    playerX: TRACK_CX,
    targetX: TRACK_CX,
    worldY: 0,
    speed: 6.4,
    crowd: 1,
    coins: 0,
    runCoins: 0,
    levels: makeLevels(),
    particles: [],
    floatTexts: [],
    flash: { r: 0, g: 0, b: 0, a: 0 },
    shake: 0,
    runPhase: 0,
    bossTimer: 0,
    combo: 0,
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

  const rerender = () => forceRender((v) => v + 1);

  const clearTimers = () => {
    timeoutRef.current.forEach((id) => clearTimeout(id));
    timeoutRef.current = [];
  };

  const setPhase = useCallback((phase) => {
    if (!mountedRef.current) return;
    gs.current.phase = phase;
    rerender();
  }, []);

  const safeDelayPhase = useCallback(
    (phase, delay, runId) => {
      const id = setTimeout(() => {
        if (!mountedRef.current) return;
        if (runIdRef.current !== runId) return;
        setPhase(phase);
      }, delay);

      timeoutRef.current.push(id);
    },
    [setPhase]
  );

  const addFloat = (text, x, y, color = "#ffffff", size = 34) => {
    const s = gs.current;
    s.floatTexts.push({
      text,
      x,
      y,
      vy: -1.9,
      life: 62,
      maxLife: 62,
      color,
      size,
    });

    if (s.floatTexts.length > 40) {
      s.floatTexts.splice(0, s.floatTexts.length - 40);
    }
  };

  const addParticles = (x, y, amount, type) => {
    const s = gs.current;
    s.particles.push(...spawnParticles(x, y, amount, type));

    if (s.particles.length > 260) {
      s.particles.splice(0, s.particles.length - 260);
    }
  };

  const flash = (r, g, b, a) => {
    gs.current.flash = { r, g, b, a };
  };

  const startRun = useCallback(() => {
    clearTimers();
    runIdRef.current += 1;

    const s = gs.current;
    s.phase = "playing";
    s.playerX = TRACK_CX;
    s.targetX = TRACK_CX;
    s.worldY = 0;
    s.speed = 6.25 + s.upgrades.speed * 0.22;
    s.crowd = Math.max(1, s.upgrades.startCrowd);
    s.runCoins = 0;
    s.levels = makeLevels();
    s.particles = [];
    s.floatTexts = [];
    s.flash = { r: 0, g: 0, b: 0, a: 0 };
    s.shake = 0;
    s.runPhase = 0;
    s.bossTimer = 0;
    s.combo = 0;
    rerender();
  }, []);

  const hardReset = useCallback(() => {
    clearTimers();
    runIdRef.current += 1;

    gs.current = {
      phase: "menu",
      playerX: TRACK_CX,
      targetX: TRACK_CX,
      worldY: 0,
      speed: 6.4,
      crowd: 1,
      coins: 0,
      runCoins: 0,
      levels: makeLevels(),
      particles: [],
      floatTexts: [],
      flash: { r: 0, g: 0, b: 0, a: 0 },
      shake: 0,
      runPhase: 0,
      bossTimer: 0,
      combo: 0,
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

    rerender();
  }, []);

  const buyUpgrade = useCallback((key) => {
    const s = gs.current;
    const level = s.upgrades[key];

    const costs = {
      startCrowd: 45 + level * 35,
      income: 60 + level * 45,
      damage: 70 + level * 52,
      speed: 50 + level * 42,
    };

    const cost = costs[key];

    if (s.coins < cost) return;

    s.coins -= cost;
    s.upgrades[key] += 1;
    rerender();
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    const keyDown = (e) => {
      keysRef.current[e.key.toLowerCase()] = true;

      if (e.key === " " && gs.current.phase !== "playing") {
        e.preventDefault();
        startRun();
      }
    };

    const keyUp = (e) => {
      keysRef.current[e.key.toLowerCase()] = false;
    };

    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);

    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
    };
  }, [startRun]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getCanvasX = (clientX) => {
      const rect = canvas.getBoundingClientRect();
      return ((clientX - rect.left) / rect.width) * CW;
    };

    const pointerDown = (e) => {
      dragRef.current.active = true;
      dragRef.current.startX = getCanvasX(e.clientX);
      dragRef.current.baseTargetX = gs.current.targetX;
      canvas.setPointerCapture?.(e.pointerId);
    };

    const pointerMove = (e) => {
      if (!dragRef.current.active) return;

      const nowX = getCanvasX(e.clientX);
      const dx = (nowX - dragRef.current.startX) * 1.12;

      gs.current.targetX = clamp(
        dragRef.current.baseTargetX + dx,
        LANE_L,
        LANE_R
      );
    };

    const pointerUp = (e) => {
      dragRef.current.active = false;
      canvas.releasePointerCapture?.(e.pointerId);
    };

    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerUp);
    canvas.addEventListener("pointercancel", pointerUp);

    return () => {
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", pointerUp);
    };
  }, []);

  const update = useCallback(
    (dt, now) => {
      const s = gs.current;

      s.particles = s.particles
        .map((p) => ({
          ...p,
          x: p.x + p.vx * dt,
          y: p.y + p.vy * dt,
          vy: p.vy + 0.24 * dt,
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

      s.shake = Math.max(0, s.shake - 0.9 * dt);
      s.flash.a = Math.max(0, s.flash.a - 0.045 * dt);

      if (s.phase !== "playing") return;

      const left = keysRef.current.a || keysRef.current.arrowleft;
      const right = keysRef.current.d || keysRef.current.arrowright;

      if (!dragRef.current.active) {
        if (left) s.targetX -= 12 * dt;
        if (right) s.targetX += 12 * dt;
        s.targetX = clamp(s.targetX, LANE_L, LANE_R);
      }

      const follow = 1 - Math.pow(0.001, dt / 10);
      s.playerX = lerp(s.playerX, s.targetX, follow);
      s.playerX = clamp(s.playerX, LANE_L, LANE_R);

      s.runPhase += s.speed * 0.13 * dt;

      if (s.worldY < FINISH_WORLD - 90) {
        s.worldY += s.speed * dt;
      } else {
        s.worldY += Math.max(2.25, s.speed * 0.34) * dt;
      }

      for (const section of s.levels) {
        const screenY = worldToScreenY(section.y, s.worldY);

        if (screenY > CH + 250 || screenY < HORIZON_Y - 120) continue;

        if (section.kind === "gates") {
          if (!inHitZone(section.y, s.worldY)) continue;

          for (const gate of section.gates) {
            if (gate.triggered) continue;

            if (Math.abs(s.playerX - gate.x) < gate.width / 2) {
              gate.triggered = true;

              const before = s.crowd;
              s.crowd = clamp(applyGate(s.crowd, gate), 1, 9999);

              const good = s.crowd >= before;
              s.combo = good ? s.combo + 1 : 0;

              addFloat(
                fmtGate(gate),
                s.playerX,
                PLAYER_Y - 108,
                good ? "#00ff85" : "#ff4d6d",
                48
              );
              addParticles(
                s.playerX,
                PLAYER_Y - 62,
                good ? 46 : 28,
                good ? "good" : "bad"
              );
              flash(good ? 0 : 255, good ? 255 : 45, good ? 135 : 70, good ? 0.16 : 0.24);
              s.shake = good ? 4 : 10;

              if (good && s.combo >= 3) {
                const bonus = Math.floor(4 * s.upgrades.income);
                s.coins += bonus;
                s.runCoins += bonus;
                addFloat(`COMBO +${bonus}🪙`, s.playerX, PLAYER_Y - 154, "#ffd43b", 26);
                rerender();
              }
            }
          }
        }

        if (section.kind === "enemies" && !section.defeated) {
          if (!inHitZone(section.y, s.worldY)) continue;

          if (Math.abs(s.playerX - section.x) < 140) {
            const attackingCrowd = s.crowd;
            const enemyDefeated = Math.min(section.count, attackingCrowd);
            const lost = Math.min(s.crowd - 1, Math.ceil(section.count * 0.72));

            section.count -= enemyDefeated;
            s.crowd = Math.max(1, s.crowd - lost);
            s.combo = 0;

            addFloat(`-${lost}`, section.x, PLAYER_Y - 94, "#ff4d6d", 38);
            addParticles(section.x, PLAYER_Y - 55, 44, "hit");
            flash(255, 75, 75, 0.22);
            s.shake = 12;

            if (section.count <= 0) {
              section.defeated = true;

              const reward = Math.floor((24 + enemyDefeated * 1.6) * s.upgrades.income);
              s.coins += reward;
              s.runCoins += reward;

              addFloat(`+${reward}🪙`, section.x, PLAYER_Y - 142, "#ffd43b", 32);
              addParticles(section.x, PLAYER_Y - 92, 54, "coin");
              rerender();
            }
          }
        }

        if (section.kind === "obstacle") {
          if (!inHitZone(section.y, s.worldY)) continue;

          for (const blade of section.blades) {
            if (blade.hit) continue;

            const bx = blade.x + Math.sin(now / 280 + blade.phase) * 66;

            if (Math.abs(s.playerX - bx) < blade.radius + 34) {
              blade.hit = true;

              const lost = Math.min(s.crowd - 1, Math.ceil(s.crowd * 0.28) + 4);
              s.crowd = Math.max(1, s.crowd - lost);
              s.combo = 0;

              addFloat(`-${lost}`, bx, PLAYER_Y - 94, "#ff4d6d", 38);
              addParticles(bx, PLAYER_Y - 55, 38, "bad");
              flash(255, 110, 0, 0.26);
              s.shake = 14;
            }
          }
        }

        if (section.kind === "wall" && !section.broken) {
          if (!inHitZone(section.y, s.worldY)) continue;

          if (Math.abs(s.playerX - section.x) < 210) {
            const damage = Math.max(1, Math.floor(s.crowd * 0.65));
            section.hp -= damage;

            const lost = Math.min(s.crowd - 1, Math.ceil(section.maxHp / 16));
            s.crowd = Math.max(1, s.crowd - lost);
            s.combo = 0;

            addFloat(`-${damage}`, section.x, PLAYER_Y - 126, "#ffffff", 30);
            addParticles(section.x, PLAYER_Y - 70, 34, "hit");
            s.shake = 10;
            flash(120, 160, 255, 0.13);

            if (section.hp <= 0) {
              section.broken = true;

              const reward = Math.floor((30 + section.maxHp * 0.8) * s.upgrades.income);
              s.coins += reward;
              s.runCoins += reward;

              addFloat(`WALL BROKEN +${reward}🪙`, section.x, PLAYER_Y - 168, "#ffd43b", 28);
              addParticles(section.x, PLAYER_Y - 100, 70, "coin");
              rerender();
            } else if (s.crowd <= 1) {
              safeDelayPhase("failed", 450, runIdRef.current);
            }
          }
        }

        if (section.kind === "coins") {
          for (const coin of section.coins) {
            if (coin.taken) continue;

            const coinWorldY = section.y + coin.yOffset;
            const coinScreenY = worldToScreenY(coinWorldY, s.worldY);

            if (coinScreenY > CH + 80 || coinScreenY < HORIZON_Y - 50) continue;
            if (!inHitZone(coinWorldY, s.worldY, COIN_HIT_WORLD_WINDOW)) continue;

            if (Math.abs(s.playerX - coin.x) < 64) {
              coin.taken = true;

              const gain = 2 * s.upgrades.income;
              s.coins += gain;
              s.runCoins += gain;

              addParticles(coin.x, PLAYER_Y - 40, 12, "coin");
              rerender();
            }
          }
        }

        if (section.kind === "boss" && !section.defeated) {
          if (!inHitZone(section.y, s.worldY, 90)) continue;

          s.bossTimer += dt;

          if (s.bossTimer >= 4.2) {
            s.bossTimer = 0;

            const damage = Math.max(
              1,
              Math.floor(s.crowd * (0.45 + s.upgrades.damage * 0.1))
            );
            const lost = Math.min(s.crowd - 1, Math.ceil(section.maxHp / 85));

            section.hp -= damage;
            s.crowd = Math.max(1, s.crowd - lost);

            addFloat(`-${damage}`, TRACK_CX, PLAYER_Y - 166, "#ffffff", 34);
            addParticles(TRACK_CX, PLAYER_Y - 95, 28, "hit");
            flash(200, 40, 60, 0.16);
            s.shake = 10;

            if (section.hp <= 0) {
              section.defeated = true;

              const reward = Math.floor((130 + s.crowd * 3.2) * s.upgrades.income);
              s.coins += reward;
              s.runCoins += reward;

              s.stats.bestCrowd = Math.max(s.stats.bestCrowd, s.crowd);
              s.stats.bestCoins = Math.max(s.stats.bestCoins, s.runCoins);

              addFloat(`BOSS DOWN +${reward}🪙`, TRACK_CX, PLAYER_Y - 190, "#ffd43b", 38);
              addParticles(TRACK_CX, PLAYER_Y - 110, 130, "coin");
              flash(255, 220, 0, 0.42);
              s.shake = 22;
              rerender();

              safeDelayPhase("complete", 1100, runIdRef.current);
            } else if (s.crowd <= 1) {
              safeDelayPhase("failed", 520, runIdRef.current);
            }
          }
        }
      }

      if (s.worldY >= WORLD_LEN && s.phase === "playing") {
        setPhase("complete");
      }
    },
    [safeDelayPhase, setPhase]
  );

  const drawSky = (ctx, now) => {
    const sky = ctx.createLinearGradient(0, 0, 0, HORIZON_Y + 70);
    sky.addColorStop(0, "#071126");
    sky.addColorStop(0.48, "#173766");
    sky.addColorStop(1, "#2d74ad");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, CW, HORIZON_Y + 70);

    const starSeed = [13, 47, 89, 134, 200, 255, 312, 379, 430, 490, 550, 610, 665, 720, 780, 820, 875, 930, 970, 999];

    starSeed.forEach((seed, i) => {
      const x = (seed * 37 + i * 17) % CW;
      const y = (seed * 13 + i * 7) % (HORIZON_Y - 12);
      const a = 0.45 + Math.sin(now * 0.002 + i) * 0.25;

      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    });

    const glow = ctx.createLinearGradient(0, HORIZON_Y - 50, 0, HORIZON_Y + 65);
    glow.addColorStop(0, "rgba(90,190,255,0)");
    glow.addColorStop(0.5, "rgba(120,215,255,0.36)");
    glow.addColorStop(1, "rgba(120,215,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, HORIZON_Y - 50, CW, 115);

    ctx.fillStyle = "rgba(6,15,36,0.72)";
    const buildings = [
      [190, 45, 42, 72],
      [252, 28, 34, 90],
      [304, 58, 56, 62],
      [641, 47, 40, 74],
      [700, 24, 52, 97],
      [770, 52, 35, 68],
    ];

    buildings.forEach(([x, , w, h]) => {
      ctx.fillStyle = "rgba(6,15,36,0.72)";
      ctx.fillRect(x, HORIZON_Y - h, w, h);

      ctx.fillStyle = "rgba(255,230,120,0.45)";
      for (let row = 0; row < 4; row += 1) {
        for (let col = 0; col < Math.floor(w / 10); col += 1) {
          const lit = ((x + row * 17 + col * 31) % 7) !== 0;
          if (lit) {
            ctx.fillRect(x + col * 10 + 3, HORIZON_Y - h + row * 17 + 5, 5, 6);
          }
        }
      }
    });
  };

  const drawTrack = (ctx, now) => {
    const s = gs.current;

    ctx.fillStyle = "#0a1124";
    ctx.fillRect(0, HORIZON_Y + 70, CW, CH);

    const roadGrad = ctx.createLinearGradient(0, HORIZON_Y, 0, CH);
    roadGrad.addColorStop(0, "#1c2537");
    roadGrad.addColorStop(0.52, "#252e46");
    roadGrad.addColorStop(1, "#323956");

    ctx.fillStyle = roadGrad;
    ctx.beginPath();
    ctx.moveTo(TRACK_CX - 18, HORIZON_Y);
    ctx.lineTo(TRACK_CX + 18, HORIZON_Y);
    ctx.lineTo(TRACK_R + 85, CH);
    ctx.lineTo(TRACK_L - 85, CH);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(255,145,0,0.9)";
    ctx.lineWidth = 5;
    ctx.shadowColor = "rgba(255,145,0,0.75)";
    ctx.shadowBlur = 12;

    ctx.beginPath();
    ctx.moveTo(TRACK_CX - 5, HORIZON_Y);
    ctx.lineTo(TRACK_L - 85, CH);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(TRACK_CX + 5, HORIZON_Y);
    ctx.lineTo(TRACK_R + 85, CH);
    ctx.stroke();

    ctx.shadowBlur = 0;

    ctx.strokeStyle = "rgba(255,255,255,0.48)";
    for (let i = 0; i < 20; i += 1) {
      const raw = (i / 20 + (s.worldY * 0.0045) % 1) % 1;
      const y1 = HORIZON_Y + (CH - HORIZON_Y) * raw;
      const y2 = y1 + 16 + raw * 42;

      ctx.lineWidth = 2 + raw * 5;
      ctx.beginPath();
      ctx.moveTo(TRACK_CX, y1);
      ctx.lineTo(TRACK_CX, Math.min(y2, CH));
      ctx.stroke();
    }

    for (let i = 0; i < 12; i += 1) {
      const raw = (i / 12 + (s.worldY * 0.003) % 1) % 1;
      const y = HORIZON_Y + (CH - HORIZON_Y) * raw;
      const leftX = lerp(TRACK_CX - 6, TRACK_L - 85, raw);
      const rightX = lerp(TRACK_CX + 6, TRACK_R + 85, raw);

      ctx.fillStyle = `rgba(255,255,255,${raw * 0.35})`;
      ctx.fillRect(leftX - raw * 20, y, raw * 40, raw * 6);
      ctx.fillRect(rightX - raw * 20, y, raw * 40, raw * 6);
    }

    const shimmer = ctx.createLinearGradient(TRACK_CX - 170, 0, TRACK_CX + 170, 0);
    shimmer.addColorStop(0, "rgba(100,180,255,0)");
    shimmer.addColorStop(0.5, `rgba(100,180,255,${0.04 + Math.sin(now * 0.003) * 0.02})`);
    shimmer.addColorStop(1, "rgba(100,180,255,0)");

    ctx.fillStyle = shimmer;
    ctx.beginPath();
    ctx.moveTo(TRACK_CX - 10, HORIZON_Y);
    ctx.lineTo(TRACK_CX + 10, HORIZON_Y);
    ctx.lineTo(TRACK_R + 85, CH);
    ctx.lineTo(TRACK_L - 85, CH);
    ctx.closePath();
    ctx.fill();
  };

  const drawGate = (ctx, gate, screenY) => {
    const positive = gate.type === "add" || gate.type === "mul";
    const scale = perspectiveScale(screenY);
    const x = perspectiveX(gate.x, screenY);
    const w = perspectiveW(gate.width, screenY);
    const h = Math.max(18, gate.height * scale);

    ctx.save();
    ctx.globalAlpha = gate.triggered ? 0.28 : 1;

    const beam = ctx.createLinearGradient(x, screenY - h * 1.4, x, screenY + h);
    beam.addColorStop(0, positive ? "rgba(0,255,140,0)" : "rgba(255,70,95,0)");
    beam.addColorStop(0.5, positive ? "rgba(0,255,140,0.16)" : "rgba(255,70,95,0.16)");
    beam.addColorStop(1, positive ? "rgba(0,255,140,0)" : "rgba(255,70,95,0)");

    ctx.fillStyle = beam;
    ctx.fillRect(x - w / 2, screenY - h * 1.4, w, h * 2.4);

    const grad = ctx.createLinearGradient(x - w / 2, screenY, x + w / 2, screenY + h);
    if (positive) {
      grad.addColorStop(0, "#00ff85");
      grad.addColorStop(1, "#00a85a");
    } else {
      grad.addColorStop(0, "#ff4567");
      grad.addColorStop(1, "#aa1024");
    }

    ctx.fillStyle = grad;
    roundRect(ctx, x - w / 2, screenY - h / 2, w, h, 13 * scale);
    ctx.fill();

    ctx.strokeStyle = positive ? "rgba(110,255,190,0.95)" : "rgba(255,140,150,0.95)";
    ctx.lineWidth = Math.max(1, 4 * scale);
    ctx.shadowColor = positive ? "#00ff85" : "#ff405f";
    ctx.shadowBlur = 15;
    roundRect(ctx, x - w / 2, screenY - h / 2, w, h, 13 * scale);
    ctx.stroke();
    ctx.shadowBlur = 0;

    const fontSize = Math.max(11, 42 * scale);
    ctx.font = `900 ${fontSize}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = Math.max(1, 6 * scale);
    ctx.strokeStyle = "rgba(0,0,0,0.44)";
    ctx.fillStyle = "#ffffff";
    ctx.strokeText(fmtGate(gate), x, screenY);
    ctx.fillText(fmtGate(gate), x, screenY);

    ctx.restore();
  };

  const drawEnemies = (ctx, section, screenY, now) => {
    const scale = perspectiveScale(screenY);
    const x = perspectiveX(section.x, screenY);
    const positions = formationPositions(Math.min(section.count, 42));

    ctx.save();

    for (let i = positions.length - 1; i >= 0; i -= 1) {
      const p = positions[i];
      drawRunner(
        ctx,
        x + p.x * scale * 0.78,
        screenY + p.y * scale * 0.62,
        scale * p.scale * 0.72,
        350,
        now * 0.006 + p.phase
      );
    }

    ctx.font = `900 ${Math.max(11, 28 * scale)}px Arial`;
    ctx.textAlign = "center";
    ctx.lineWidth = Math.max(2, 5 * scale);
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.fillStyle = "#ff3c5a";
    ctx.strokeText(`${section.count}`, x, screenY - 64 * scale);
    ctx.fillText(`${section.count}`, x, screenY - 64 * scale);

    ctx.restore();
  };

  const drawObstacle = (ctx, section, screenY, now) => {
    const scale = perspectiveScale(screenY);

    ctx.save();

    section.blades.forEach((blade) => {
      const movingX = blade.x + Math.sin(now / 280 + blade.phase) * 66;
      const x = perspectiveX(movingX, screenY);
      const r = blade.radius * scale;

      ctx.save();
      ctx.globalAlpha = blade.hit ? 0.25 : 1;
      ctx.translate(x, screenY);
      ctx.rotate(now / 120 + blade.phase);

      ctx.shadowColor = "rgba(210,230,255,0.9)";
      ctx.shadowBlur = 16;

      for (let i = 0; i < 4; i += 1) {
        ctx.rotate(Math.PI / 2);

        const grad = ctx.createLinearGradient(0, 0, r, 0);
        grad.addColorStop(0, "#eef4ff");
        grad.addColorStop(0.65, "#aab7d3");
        grad.addColorStop(1, "rgba(220,230,255,0)");

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.13);
        ctx.lineTo(r * 0.76, -r * 0.06);
        ctx.lineTo(r, 0);
        ctx.lineTo(r * 0.76, r * 0.06);
        ctx.lineTo(0, r * 0.13);
        ctx.closePath();
        ctx.fill();
      }

      ctx.shadowBlur = 0;
      ctx.fillStyle = "#10182b";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.24, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#050914";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.13, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    });

    ctx.restore();
  };

  const drawWall = (ctx, section, screenY) => {
    if (section.broken) return;

    const scale = perspectiveScale(screenY);
    const x = perspectiveX(section.x, screenY);
    const w = 360 * scale;
    const h = 110 * scale;
    const pct = clamp(section.hp / section.maxHp, 0, 1);

    ctx.save();

    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.beginPath();
    ctx.ellipse(x, screenY + h * 0.54, w * 0.48, 16 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    const grad = ctx.createLinearGradient(x - w / 2, screenY - h / 2, x + w / 2, screenY + h / 2);
    grad.addColorStop(0, "#324160");
    grad.addColorStop(0.5, "#526381");
    grad.addColorStop(1, "#25314c");

    ctx.fillStyle = grad;
    roundRect(ctx, x - w / 2, screenY - h / 2, w, h, 18 * scale);
    ctx.fill();

    ctx.strokeStyle = "rgba(120,190,255,0.7)";
    ctx.lineWidth = Math.max(1, 3 * scale);
    ctx.shadowColor = "rgba(60,160,255,0.7)";
    ctx.shadowBlur = 12;
    roundRect(ctx, x - w / 2, screenY - h / 2, w, h, 18 * scale);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "rgba(0,0,0,0.45)";
    roundRect(ctx, x - w * 0.36, screenY - h * 0.72, w * 0.72, 15 * scale, 10 * scale);
    ctx.fill();

    ctx.fillStyle = "#ffcc00";
    roundRect(ctx, x - w * 0.36, screenY - h * 0.72, w * 0.72 * pct, 15 * scale, 10 * scale);
    ctx.fill();

    ctx.font = `900 ${Math.max(11, 30 * scale)}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = Math.max(2, 5 * scale);
    ctx.fillStyle = "#ffffff";
    ctx.strokeText(`${Math.max(0, section.hp)}`, x, screenY);
    ctx.fillText(`${Math.max(0, section.hp)}`, x, screenY);

    ctx.restore();
  };

  const drawCoins = (ctx, section, now) => {
    section.coins.forEach((coin) => {
      if (coin.taken) return;

      const coinWorldY = section.y + coin.yOffset;
      const screenY = worldToScreenY(coinWorldY, gs.current.worldY);

      if (screenY < HORIZON_Y - 40 || screenY > CH + 80) return;

      const scale = perspectiveScale(screenY);
      const x = perspectiveX(coin.x, screenY);
      const bob = Math.sin(now / 170 + coin.x) * 4 * scale;

      drawMiniCoin(ctx, x, screenY + bob, 18 * scale);
    });
  };

  const drawBoss = (ctx, section, screenY, now) => {
    const scale = perspectiveScale(screenY);
    const x = perspectiveX(TRACK_CX, screenY);

    if (section.defeated) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.font = `900 ${Math.max(18, 48 * scale)}px Arial`;
      ctx.textAlign = "center";
      ctx.strokeStyle = "rgba(0,0,0,0.65)";
      ctx.lineWidth = 8 * scale;
      ctx.fillStyle = "#ffd43b";
      ctx.strokeText("DESTROYED", x, screenY - 15 * scale);
      ctx.fillText("DESTROYED", x, screenY - 15 * scale);
      ctx.restore();
      return;
    }

    const w = 300 * scale;
    const h = 210 * scale;
    const pulse = Math.sin(now * 0.004) * 4 * scale;

    ctx.save();

    ctx.fillStyle = "rgba(0,0,0,0.42)";
    ctx.beginPath();
    ctx.ellipse(x, screenY + h * 0.57, w * 0.58, 22 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    const body = ctx.createLinearGradient(x - w / 2, screenY - h / 2, x + w / 2, screenY + h / 2);
    body.addColorStop(0, "#3a0a4a");
    body.addColorStop(0.5, "#65106d");
    body.addColorStop(1, "#250330");

    ctx.fillStyle = body;
    roundRect(ctx, x - w / 2, screenY - h * 0.55, w, h, 26 * scale);
    ctx.fill();

    ctx.strokeStyle = `rgba(190,0,255,${0.68 + Math.sin(now * 0.008) * 0.2})`;
    ctx.lineWidth = Math.max(1, 4 * scale);
    ctx.shadowColor = "#aa00ff";
    ctx.shadowBlur = 22;
    roundRect(ctx, x - w / 2, screenY - h * 0.55, w, h, 26 * scale);
    ctx.stroke();
    ctx.shadowBlur = 0;

    const eyeY = screenY - h * 0.26;
    const eyeR = 18 * scale;

    [x - w * 0.22, x + w * 0.22].forEach((eyeX) => {
      const eye = ctx.createRadialGradient(eyeX, eyeY, 0, eyeX, eyeY, eyeR);
      eye.addColorStop(0, "#ffffff");
      eye.addColorStop(0.3, "#ff2040");
      eye.addColorStop(1, "#800020");

      ctx.fillStyle = eye;
      ctx.shadowColor = "#ff2040";
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(eyeX, eyeY + pulse, eyeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    ctx.strokeStyle = "#ff2040";
    ctx.lineWidth = Math.max(1, 4 * scale);
    ctx.beginPath();
    ctx.arc(x, screenY + h * 0.04, w * 0.2, 0.1, Math.PI - 0.1);
    ctx.stroke();

    const barW = 300 * scale;
    const barH = 22 * scale;
    const barX = x - barW / 2;
    const barY = screenY - h * 0.72;
    const pct = clamp(section.hp / section.maxHp, 0, 1);

    ctx.fillStyle = "rgba(0,0,0,0.58)";
    roundRect(ctx, barX, barY, barW, barH, barH / 2);
    ctx.fill();

    const hp = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    hp.addColorStop(0, "#ff1040");
    hp.addColorStop(0.55, "#ff6600");
    hp.addColorStop(1, "#ffcc00");

    ctx.fillStyle = hp;
    roundRect(ctx, barX + 2, barY + 2, (barW - 4) * pct, barH - 4, barH / 2);
    ctx.fill();

    ctx.font = `900 ${Math.max(10, 22 * scale)}px Arial`;
    ctx.textAlign = "center";
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = Math.max(2, 5 * scale);
    ctx.fillStyle = "#ffffff";
    ctx.strokeText("⚡ FINAL BOSS ⚡", x, barY - 10 * scale);
    ctx.fillText("⚡ FINAL BOSS ⚡", x, barY - 10 * scale);

    ctx.restore();
  };

  const drawLevelObjects = (ctx, now) => {
    const s = gs.current;

    s.levels.forEach((section) => {
      const screenY = worldToScreenY(section.y, s.worldY);

      if (screenY > CH + 300 || screenY < HORIZON_Y - 150) return;

      if (section.kind === "gates") {
        section.gates.forEach((gate) => drawGate(ctx, gate, screenY));
      }

      if (section.kind === "enemies" && !section.defeated) {
        drawEnemies(ctx, section, screenY, now);
      }

      if (section.kind === "obstacle") {
        drawObstacle(ctx, section, screenY, now);
      }

      if (section.kind === "wall") {
        drawWall(ctx, section, screenY);
      }

      if (section.kind === "coins") {
        drawCoins(ctx, section, now);
      }

      if (section.kind === "boss") {
        drawBoss(ctx, section, screenY, now);
      }
    });
  };

  const drawCrowd = (ctx, now) => {
    const s = gs.current;
    const positions = formationPositions(s.crowd);

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(s.playerX, PLAYER_Y + 50, 90, 19, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    for (let i = positions.length - 1; i >= 0; i -= 1) {
      const p = positions[i];

      drawRunner(
        ctx,
        s.playerX + p.x,
        PLAYER_Y + p.y * 0.58,
        p.scale,
        210,
        s.runPhase + p.phase + now * 0.0005
      );
    }

    ctx.save();

    const text = `${s.crowd}`;
    const badgeY = PLAYER_Y - 92;

    ctx.font = "900 38px Arial";
    const width = ctx.measureText(text).width + 32;

    const grad = ctx.createLinearGradient(s.playerX - width / 2, 0, s.playerX + width / 2, 0);
    grad.addColorStop(0, "rgba(25,55,120,0.92)");
    grad.addColorStop(1, "rgba(15,35,88,0.92)");

    ctx.fillStyle = grad;
    roundRect(ctx, s.playerX - width / 2, badgeY - 24, width, 48, 24);
    ctx.fill();

    ctx.strokeStyle = "rgba(100,190,255,0.85)";
    ctx.lineWidth = 2;
    roundRect(ctx, s.playerX - width / 2, badgeY - 24, width, 48, 24);
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, s.playerX, badgeY + 1);

    ctx.restore();
  };

  const drawParticles = (ctx) => {
    const s = gs.current;

    s.particles.forEach((p) => {
      const alpha = clamp(p.life / p.maxLife, 0, 1);

      let color = "#ffffff";
      if (p.type === "coin") color = "#ffd43b";
      if (p.type === "good") color = "#00ff85";
      if (p.type === "bad") color = "#ff4d6d";
      if (p.type === "hit") color = "#ffffff";

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    s.floatTexts.forEach((f) => {
      const alpha = clamp(f.life / f.maxLife, 0, 1);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `900 ${f.size}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 7;
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.strokeText(f.text, f.x, f.y);
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    });
  };

  const drawHUD = (ctx) => {
    const s = gs.current;
    if (s.phase !== "playing") return;

    const pct = clamp(s.worldY / FINISH_WORLD, 0, 1);

    const bg = ctx.createLinearGradient(0, 0, 0, 86);
    bg.addColorStop(0, "rgba(6,12,28,0.84)");
    bg.addColorStop(1, "rgba(6,12,28,0)");

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CW, 86);

    ctx.save();

    ctx.font = "900 23px Arial";
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffd43b";
    ctx.fillText("🪙", 22, 38);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`${s.coins}`, 54, 38);

    ctx.font = "700 14px Arial";
    ctx.fillStyle = "rgba(220,235,255,0.58)";
    ctx.fillText(`+${s.runCoins} this run`, 54, 59);

    const barX = 260;
    const barY = 20;
    const barW = 480;
    const barH = 20;

    ctx.fillStyle = "rgba(0,0,0,0.48)";
    roundRect(ctx, barX, barY, barW, barH, 10);
    ctx.fill();

    const prog = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    prog.addColorStop(0, "#00d4ff");
    prog.addColorStop(0.5, "#0077ff");
    prog.addColorStop(1, "#aa00ff");

    ctx.fillStyle = prog;
    ctx.shadowColor = "#0077ff";
    ctx.shadowBlur = 12;
    roundRect(ctx, barX + 2, barY + 2, (barW - 4) * pct, barH - 4, 8);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.font = "800 13px Arial";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fillText(`${Math.floor(pct * 100)}%`, barX + barW / 2, barY + 15);

    ctx.textAlign = "right";
    ctx.font = "900 23px Arial";
    ctx.fillStyle = "#00d4ff";
    ctx.fillText("👥", CW - 58, 38);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`${s.crowd}`, CW - 22, 38);

    ctx.font = "700 14px Arial";
    ctx.fillStyle = "rgba(220,235,255,0.58)";
    ctx.fillText("CROWD", CW - 22, 59);

    ctx.restore();
  };

  const drawButton = (ctx, cx, cy, w, h, c1, c2, label) => {
    const x = cx - w / 2;
    const y = cy - h / 2;

    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, c2);
    grad.addColorStop(1, c1);

    ctx.save();
    ctx.shadowColor = c2;
    ctx.shadowBlur = 24;
    ctx.fillStyle = grad;
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 22px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, cx, cy);
    ctx.restore();
  };

  const drawOverlay = (ctx) => {
    const s = gs.current;
    if (s.phase === "playing") return;

    ctx.save();

    ctx.fillStyle = "rgba(4,8,22,0.68)";
    ctx.fillRect(0, 0, CW, CH);

    const panelX = CW / 2 - 246;
    const panelY = CH / 2 - 210;
    const panelW = 492;
    const panelH = 420;

    ctx.shadowColor = "rgba(0,180,255,0.42)";
    ctx.shadowBlur = 42;

    const panel = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelH);
    panel.addColorStop(0, "rgba(16,27,58,0.98)");
    panel.addColorStop(1, "rgba(7,14,36,0.98)");

    ctx.fillStyle = panel;
    roundRect(ctx, panelX, panelY, panelW, panelH, 30);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(80,150,255,0.42)";
    ctx.lineWidth = 1.5;
    roundRect(ctx, panelX, panelY, panelW, panelH, 30);
    ctx.stroke();

    const cx = CW / 2;

    ctx.textAlign = "center";

    if (s.phase === "menu") {
      const title = ctx.createLinearGradient(cx - 190, 0, cx + 190, 0);
      title.addColorStop(0, "#00d4ff");
      title.addColorStop(0.48, "#aa00ff");
      title.addColorStop(1, "#ff2266");

      ctx.font = "900 64px Arial";
      ctx.fillStyle = title;
      ctx.shadowColor = "rgba(120,0,255,0.55)";
      ctx.shadowBlur = 22;
      ctx.fillText("MOB RUSH", cx, panelY + 92);
      ctx.shadowBlur = 0;

      ctx.font = "800 18px Arial";
      ctx.fillStyle = "rgba(170,210,255,0.82)";
      ctx.fillText("Swipe · Multiply · Smash the Boss", cx, panelY + 132);

      const tips = [
        "Hit green gates to grow your mob",
        "Avoid red gates and spinning blades",
        "Break walls, farm coins, upgrade fast",
      ];

      tips.forEach((tip, i) => {
        ctx.font = "700 15px Arial";
        ctx.fillStyle = `rgba(170,210,255,${0.75 - i * 0.09})`;
        ctx.fillText(`${i + 1}. ${tip}`, cx, panelY + 180 + i * 27);
      });

      drawButton(ctx, cx, panelY + 322, 224, 58, "#0077ff", "#00d4ff", "▶ START RUN");
    }

    if (s.phase === "complete") {
      const title = ctx.createLinearGradient(cx - 170, 0, cx + 170, 0);
      title.addColorStop(0, "#00ff85");
      title.addColorStop(1, "#00d4ff");

      ctx.font = "900 54px Arial";
      ctx.fillStyle = title;
      ctx.shadowColor = "#00ff85";
      ctx.shadowBlur = 20;
      ctx.fillText("CLEARED 🎉", cx, panelY + 92);
      ctx.shadowBlur = 0;

      ctx.font = "800 25px Arial";
      ctx.fillStyle = "#ffd43b";
      ctx.fillText(`+${s.runCoins} coins earned`, cx, panelY + 150);

      ctx.font = "700 20px Arial";
      ctx.fillStyle = "rgba(170,210,255,0.85)";
      ctx.fillText(`Final crowd: ${s.crowd}`, cx, panelY + 188);
      ctx.fillText(`Best crowd: ${s.stats.bestCrowd}`, cx, panelY + 220);

      drawButton(ctx, cx, panelY + 322, 224, 58, "#00a050", "#00dd75", "↺ RUN AGAIN");
    }

    if (s.phase === "failed") {
      const title = ctx.createLinearGradient(cx - 170, 0, cx + 170, 0);
      title.addColorStop(0, "#ff1040");
      title.addColorStop(1, "#ff7700");

      ctx.font = "900 50px Arial";
      ctx.fillStyle = title;
      ctx.shadowColor = "#ff1040";
      ctx.shadowBlur = 20;
      ctx.fillText("MOB WIPED 💀", cx, panelY + 92);
      ctx.shadowBlur = 0;

      ctx.font = "800 25px Arial";
      ctx.fillStyle = "#ffd43b";
      ctx.fillText(`+${s.runCoins} coins earned`, cx, panelY + 150);

      ctx.font = "700 20px Arial";
      ctx.fillStyle = "rgba(170,210,255,0.85)";
      ctx.fillText("Upgrade and run it back.", cx, panelY + 190);

      drawButton(ctx, cx, panelY + 322, 224, 58, "#cc1040", "#ff2255", "↺ RETRY");
    }

    ctx.restore();
  };

  const draw = useCallback((ctx, now) => {
    const s = gs.current;

    ctx.clearRect(0, 0, CW, CH);

    const shakeX = s.shake ? rand(-s.shake, s.shake) : 0;
    const shakeY = s.shake ? rand(-s.shake * 0.6, s.shake * 0.6) : 0;

    ctx.save();
    ctx.translate(shakeX, shakeY);

    drawSky(ctx, now);
    drawTrack(ctx, now);
    drawLevelObjects(ctx, now);
    drawCrowd(ctx, now);
    drawParticles(ctx);
    drawHUD(ctx);

    ctx.restore();

    if (s.flash.a > 0.01) {
      ctx.fillStyle = `rgba(${s.flash.r}, ${s.flash.g}, ${s.flash.b}, ${s.flash.a})`;
      ctx.fillRect(0, 0, CW, CH);
    }

    drawOverlay(ctx);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    let last = performance.now();

    const loop = (now) => {
      const dt = clamp((now - last) / 16.67, 0.25, 2.15);
      last = now;

      update(dt, now);
      draw(ctx, now);

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      mountedRef.current = false;
      clearTimers();
      cancelAnimationFrame(rafRef.current);
    };
  }, [draw, update]);

  const handleCanvasClick = (e) => {
    const s = gs.current;

    if (s.phase === "playing") return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * CW;
    const y = ((e.clientY - rect.top) / rect.height) * CH;

    const buttonX = CW / 2;
    const buttonY = CH / 2 + 112;

    if (Math.abs(x - buttonX) < 116 && Math.abs(y - buttonY) < 34) {
      startRun();
    }
  };

  const s = gs.current;

  const upgradeData = [
    {
      key: "startCrowd",
      icon: "👥",
      name: "Starting Mob",
      desc: "Begin each run with more runners.",
      level: s.upgrades.startCrowd,
      cost: 45 + s.upgrades.startCrowd * 35,
    },
    {
      key: "income",
      icon: "🪙",
      name: "Coin Magnet",
      desc: "Earn more coins from everything.",
      level: s.upgrades.income,
      cost: 60 + s.upgrades.income * 45,
    },
    {
      key: "damage",
      icon: "⚡",
      name: "Boss Damage",
      desc: "Your mob hits bosses and walls harder.",
      level: s.upgrades.damage,
      cost: 70 + s.upgrades.damage * 52,
    },
    {
      key: "speed",
      icon: "💨",
      name: "Rush Speed",
      desc: "Move through levels faster.",
      level: s.upgrades.speed,
      cost: 50 + s.upgrades.speed * 42,
    },
  ];

  return (
    <div className="mob-rush-page">
      <div className="mob-rush-shell">
        <div className="mob-rush-header">
          <div>
            <div className="mob-rush-title-row">
              <span className="mob-rush-title-icon">🏃</span>
              <h1>Mob Rush</h1>
            </div>
            <p>Pick gates · grow your mob · smash the final boss</p>
          </div>

          <div className="mob-rush-header-buttons">
            <button className="mob-rush-primary-btn" onClick={startRun}>
              ▶ Start Run
            </button>
            <button className="mob-rush-secondary-btn" onClick={hardReset}>
              Reset
            </button>
          </div>
        </div>

        <div className="mob-rush-main">
          <div className="mob-rush-canvas-wrap">
            <canvas
              ref={canvasRef}
              width={CW}
              height={CH}
              className="mob-rush-canvas"
              onClick={handleCanvasClick}
            />
          </div>

          <aside className="mob-rush-panel">
            <div className="mob-rush-stat-card">
              <span>🪙 Total Coins</span>
              <strong>{s.coins}</strong>
            </div>

            <div className="mob-rush-stat-grid">
              <div>
                <span>👥 Best Mob</span>
                <strong>{s.stats.bestCrowd}</strong>
              </div>
              <div>
                <span>🏆 Best Run</span>
                <strong>{s.stats.bestCoins}</strong>
              </div>
            </div>

            <div className="mob-rush-upgrades">
              <h2>Upgrades</h2>

              {upgradeData.map((upgrade) => (
                <button
                  key={upgrade.key}
                  className="mob-rush-upgrade-btn"
                  onClick={() => buyUpgrade(upgrade.key)}
                  disabled={s.coins < upgrade.cost}
                >
                  <div className="mob-rush-upgrade-icon">{upgrade.icon}</div>

                  <div className="mob-rush-upgrade-info">
                    <strong>{upgrade.name}</strong>
                    <span>{upgrade.desc}</span>
                    <small>Lv {upgrade.level}</small>
                  </div>

                  <div className="mob-rush-upgrade-cost">
                    <span>🪙</span>
                    <b>{upgrade.cost}</b>
                  </div>
                </button>
              ))}
            </div>

            <div className="mob-rush-help">
              <h2>Controls</h2>
              <p>Drag to steer · A/D or ← → keys</p>
              <p>🟢 Gates grow your mob · 🔴 Gates shrink it</p>
              <p>Bigger mob = more boss damage.</p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}