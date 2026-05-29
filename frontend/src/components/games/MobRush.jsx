import React, { useEffect, useRef, useState, useCallback } from "react";

/* ─────────────────── CONSTANTS ─────────────────── */
const CW = 1000;
const CH = 640;

const TRACK_L = 250;
const TRACK_R = 750;
const TRACK_CX = (TRACK_L + TRACK_R) / 2;
const HORIZON_Y = 120;          // where the road vanishes
const PLAYER_Y = 530;           // player screen Y (bottom of view)
const WORLD_LEN = 6200;
const FINISH_WORLD = 5350;
const MAX_VIS = 95;

/* perspective helpers */
const persScale = (screenY) => {
  const t = Math.max(0.01, (screenY - HORIZON_Y) / (PLAYER_Y - HORIZON_Y));
  return t;
};
const persX = (worldX, screenY) => {
  const t = persScale(screenY);
  return TRACK_CX + (worldX - TRACK_CX) * t;
};
const persW = (w, screenY) => w * persScale(screenY);

/* world-space lane limits */
const LANE_L = TRACK_L + 45;
const LANE_R = TRACK_R - 45;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (a, b) => Math.random() * (b - a) + a;

/* ─────────────────── GATE / LEVEL LOGIC ─────────────────── */
function fmtGate(g) {
  return g.type === "add" ? `+${g.value}`
    : g.type === "sub" ? `-${g.value}`
    : g.type === "mul" ? `×${g.value}`
    : `÷${g.value}`;
}
function applyGate(n, g) {
  if (g.type === "add") return n + g.value;
  if (g.type === "sub") return Math.max(1, n - g.value);
  if (g.type === "mul") return n * g.value;
  if (g.type === "div") return Math.max(1, Math.floor(n / g.value));
  return n;
}

const GATE_PAIRS = [
  [{ lane: -1, type: "add", value: 12 }, { lane: 1, type: "mul", value: 2 }],
  [{ lane: -1, type: "sub", value: 8 },  { lane: 1, type: "add", value: 28 }],
  [{ lane: -1, type: "mul", value: 3 },  { lane: 1, type: "add", value: 35 }],
  [{ lane: -1, type: "div", value: 2 },  { lane: 1, type: "add", value: 50 }],
  [{ lane: -1, type: "add", value: 40 }, { lane: 1, type: "mul", value: 2 }],
  [{ lane: -1, type: "mul", value: 4 },  { lane: 1, type: "sub", value: 25 }],
];

function makeLevels() {
  const levels = [];
  let y = 720;
  GATE_PAIRS.forEach((pair, i) => {
    levels.push({
      id: `g${i}`, kind: "gates", y,
      gates: pair.map(g => ({
        ...g,
        x: TRACK_CX + g.lane * 135,
        width: 190, height: 88,
        triggered: false,
      })),
    });
    y += 550;
    if (i % 2 === 0) {
      levels.push({ id: `e${i}`, kind: "enemies", y,
        count: 14 + i * 8, defeated: false,
        x: TRACK_CX + (i % 3 === 0 ? -60 : 70) });
      y += 480;
    } else {
      levels.push({ id: `o${i}`, kind: "obstacle", y,
        blades: [
          { x: TRACK_CX - 110, radius: 54, hit: false, phase: Math.random() * Math.PI * 2 },
          { x: TRACK_CX + 110, radius: 54, hit: false, phase: Math.random() * Math.PI * 2 },
        ]});
      y += 480;
    }
    levels.push({ id: `c${i}`, kind: "coins", y,
      coins: Array.from({ length: 12 }, (_, k) => ({
        x: TRACK_CX + Math.sin(k * 0.8) * 150,
        yOffset: k * 34,
        taken: false,
      }))});
    y += 420;
  });
  levels.push({ id: "boss", kind: "boss", y: FINISH_WORLD,
    hp: 260, maxHp: 260, defeated: false });
  return levels;
}

function spawnParticles(x, y, n, type) {
  return Array.from({ length: n }, () => ({
    x, y,
    vx: rand(-3, 3),
    vy: rand(-6, -1.5),
    life: rand(30, 60),
    maxLife: 60,
    size: rand(3, 9),
    type,
  }));
}

function formationPositions(count) {
  const vis = Math.min(count, MAX_VIS);
  const out = [];
  for (let i = 0; i < vis; i++) {
    const row = Math.floor(i / 9);
    const col = i % 9;
    const rowCount = Math.min(9, vis - row * 9);
    out.push({
      x: (col - (rowCount - 1) / 2) * 26 + Math.sin(i * 13.1) * 2,
      y: row * 24,
      s: 1 - row * 0.014,
    });
  }
  return out;
}

/* ─────────────────── DRAWING HELPERS ─────────────────── */
function roundRect(ctx, x, y, w, h, r) {
  const rc = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rc, y);
  ctx.arcTo(x + w, y, x + w, y + h, rc);
  ctx.arcTo(x + w, y + h, x, y + h, rc);
  ctx.arcTo(x, y + h, x, y, rc);
  ctx.arcTo(x, y, x + w, y, rc);
  ctx.closePath();
}

/* draw a lil runner blob with face */
function drawRunner(ctx, x, y, scale = 1, hue = 210, runPhase = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  const bob = Math.sin(runPhase) * 2.5;
  ctx.translate(0, bob);

  /* shadow */
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.ellipse(0, 44, 16 * scale, 6 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  const c1 = `hsl(${hue},90%,55%)`;
  const c2 = `hsl(${hue},90%,35%)`;

  /* legs */
  const lA = Math.sin(runPhase * 2) * 22;
  const rA = -lA;
  ctx.strokeStyle = c2;
  ctx.lineWidth = 9;
  ctx.lineCap = "round";

  ctx.save();
  ctx.translate(-6, 28);
  ctx.rotate((lA * Math.PI) / 180);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 22); ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.translate(6, 28);
  ctx.rotate((rA * Math.PI) / 180);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 22); ctx.stroke();
  ctx.restore();

  /* arms */
  const aL = Math.sin(runPhase * 2 + 1.2) * 30;
  ctx.lineWidth = 7;
  ctx.save(); ctx.translate(-14, 6); ctx.rotate((aL * Math.PI) / 180);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-8, 18); ctx.stroke();
  ctx.restore();
  ctx.save(); ctx.translate(14, 6); ctx.rotate((-aL * Math.PI) / 180);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(8, 18); ctx.stroke();
  ctx.restore();

  /* body */
  const gBody = ctx.createLinearGradient(-14, -16, 14, 28);
  gBody.addColorStop(0, c1);
  gBody.addColorStop(1, c2);
  ctx.fillStyle = gBody;
  ctx.beginPath();
  ctx.ellipse(0, 8, 14, 22, 0, 0, Math.PI * 2);
  ctx.fill();

  /* head */
  const gHead = ctx.createRadialGradient(-4, -22, 3, 0, -18, 16);
  gHead.addColorStop(0, `hsl(${hue},85%,72%)`);
  gHead.addColorStop(1, c1);
  ctx.fillStyle = gHead;
  ctx.beginPath();
  ctx.arc(0, -18, 14, 0, Math.PI * 2);
  ctx.fill();

  /* face */
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.beginPath(); ctx.arc(-5, -20, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(5, -20, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, -15, 5, 0.2, Math.PI - 0.2);
  ctx.stroke();

  /* shine */
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.beginPath();
  ctx.ellipse(-5, -24, 4, 3, -0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/* ─────────────────── MAIN COMPONENT ─────────────────── */
export default function MobRush() {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const keysRef = useRef({});
  const dragRef = useRef({ active: false, startX: 0, baseX: TRACK_CX, lastClientX: 0 });

  const [uiState, setUiState] = useState("menu");
  const [tick, setTick] = useState(0);

  const gs = useRef({
    phase: "menu",
    playerX: TRACK_CX,
    playerVX: 0,     // smooth velocity
    worldY: 0,
    speed: 5.2,
    crowd: 1,
    coins: 0,
    runCoins: 0,
    levels: makeLevels(),
    particles: [],
    floatTexts: [],
    flash: { r: 0, g: 0, b: 0, a: 0 },
    shake: 0,
    runPhase: 0,
    bossDmgTimer: 0,
    upgrades: { startCrowd: 1, income: 1, damage: 1, speed: 1 },
    stats: { bestCrowd: 1, bestCoins: 0 },
  });

  const sync = useCallback((phase) => {
    gs.current.phase = phase;
    setUiState(phase);
  }, []);

  const bump = () => setTick(t => t + 1);

  const addFloat = (text, x, y, color = "#fff", size = 34) => {
    gs.current.floatTexts.push({ text, x, y, vy: -1.8, life: 60, maxLife: 60, color, size });
  };

  const addPfx = (x, y, n, type) => {
    gs.current.particles.push(...spawnParticles(x, y, n, type));
  };

  const screenFlash = (r, g, b, a) => {
    gs.current.flash = { r, g, b, a };
  };

  /* ── reset ── */
  const resetRun = useCallback(() => {
    const s = gs.current;
    s.playerX = TRACK_CX;
    s.playerVX = 0;
    s.worldY = 0;
    s.speed = 5.2 + s.upgrades.speed * 0.18;
    s.crowd = Math.max(1, s.upgrades.startCrowd);
    s.runCoins = 0;
    s.levels = makeLevels();
    s.particles = [];
    s.floatTexts = [];
    s.flash = { r: 0, g: 0, b: 0, a: 0 };
    s.shake = 0;
    s.runPhase = 0;
    s.bossDmgTimer = 0;
    sync("playing");
  }, [sync]);

  const hardReset = useCallback(() => {
    gs.current = {
      phase: "menu",
      playerX: TRACK_CX, playerVX: 0,
      worldY: 0, speed: 5.2,
      crowd: 1, coins: 0, runCoins: 0,
      levels: makeLevels(),
      particles: [], floatTexts: [],
      flash: { r: 0, g: 0, b: 0, a: 0 },
      shake: 0, runPhase: 0, bossDmgTimer: 0,
      upgrades: { startCrowd: 1, income: 1, damage: 1, speed: 1 },
      stats: { bestCrowd: 1, bestCoins: 0 },
    };
    sync("menu");
    bump();
  }, [sync]);

  const buyUpgrade = useCallback((key) => {
    const s = gs.current;
    const lv = s.upgrades[key];
    const costs = { startCrowd: 45 + lv * 35, income: 60 + lv * 45, damage: 70 + lv * 50, speed: 50 + lv * 40 };
    const cost = costs[key];
    if (s.coins < cost) return;
    s.coins -= cost;
    s.upgrades[key]++;
    bump();
  }, []);

  /* ── input ── */
  useEffect(() => {
    const dn = (e) => {
      keysRef.current[e.key.toLowerCase()] = true;
      if (e.key === " " && gs.current.phase === "menu") resetRun();
    };
    const up = (e) => { keysRef.current[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, [resetRun]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = (clientX) => ((clientX - canvas.getBoundingClientRect().left) / canvas.getBoundingClientRect().width) * CW;
    const pd = (e) => {
      dragRef.current.active = true;
      dragRef.current.startX = cx(e.clientX);
      dragRef.current.baseX = gs.current.playerX;
      dragRef.current.lastClientX = e.clientX;
      canvas.setPointerCapture?.(e.pointerId);
    };
    const pm = (e) => {
      if (!dragRef.current.active) return;
      const nowX = cx(e.clientX);
      const dx = (nowX - dragRef.current.startX) * 1.15;
      gs.current.playerX = clamp(dragRef.current.baseX + dx, LANE_L, LANE_R);
      gs.current.playerVX = (e.clientX - dragRef.current.lastClientX) * 2;
      dragRef.current.lastClientX = e.clientX;
    };
    const pu = () => { dragRef.current.active = false; };
    canvas.addEventListener("pointerdown", pd);
    canvas.addEventListener("pointermove", pm);
    canvas.addEventListener("pointerup", pu);
    canvas.addEventListener("pointercancel", pu);
    return () => {
      canvas.removeEventListener("pointerdown", pd);
      canvas.removeEventListener("pointermove", pm);
      canvas.removeEventListener("pointerup", pu);
      canvas.removeEventListener("pointercancel", pu);
    };
  }, []);

  /* ── game loop ── */
  useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");
    let last = performance.now();

    const loop = (now) => {
      const dt = Math.min(2.5, (now - last) / 16.67);
      last = now;
      update(dt, now);
      draw(ctx, now);
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []); // eslint-disable-line

  /* ════════════════════ UPDATE ════════════════════ */
  const update = (dt, now) => {
    const s = gs.current;

    /* particles */
    s.particles = s.particles
      .map(p => ({ ...p, x: p.x + p.vx * dt, y: p.y + p.vy * dt, vy: p.vy + 0.22 * dt, life: p.life - dt }))
      .filter(p => p.life > 0);

    s.floatTexts = s.floatTexts
      .map(f => ({ ...f, y: f.y + f.vy * dt, life: f.life - dt }))
      .filter(f => f.life > 0);

    s.shake = Math.max(0, s.shake - 0.9 * dt);
    s.flash.a = Math.max(0, s.flash.a - 0.04 * dt);

    if (s.phase !== "playing") return;

    /* ── horizontal movement ── */
    if (!dragRef.current.active) {
      const kL = keysRef.current["a"] || keysRef.current["arrowleft"];
      const kR = keysRef.current["d"] || keysRef.current["arrowright"];
      const acc = 18;
      if (kL) s.playerVX -= acc * dt;
      if (kR) s.playerVX += acc * dt;
      if (!kL && !kR) s.playerVX *= Math.pow(0.75, dt); // friction
    } else {
      // drag mode — playerX already set
    }

    s.playerVX = clamp(s.playerVX, -22, 22);
    s.playerX = clamp(s.playerX + s.playerVX * dt, LANE_L, LANE_R);

    /* running animation */
    s.runPhase += s.speed * 0.12 * dt;

    /* ── scroll forward (world moves toward player) ── */
    if (s.worldY < FINISH_WORLD - 80) {
      s.worldY += s.speed * dt;
    } else {
      s.worldY += 2.0 * dt;
    }

    /* ── level interactions ── */
    for (const sec of s.levels) {
      /* screenY = PLAYER_Y - dist, dist = sec.y - worldY. Ahead objects appear above player. */
      const screenY = PLAYER_Y - (sec.y - s.worldY);

      if (screenY > CH + 200 || screenY < HORIZON_Y - 200) continue;

      /* hit zone: when object is at/near player */
      const hitZone = Math.abs(screenY - PLAYER_Y) < 55;

      if (sec.kind === "gates") {
        for (const gate of sec.gates) {
          if (gate.triggered) continue;
          if (!hitZone) continue;
          const gScreenX = persX(gate.x, PLAYER_Y);
          const gW = persW(gate.width * 0.55, PLAYER_Y);
          if (Math.abs(s.playerX - gate.x) < gate.width / 2) {
            gate.triggered = true;
            const before = s.crowd;
            s.crowd = clamp(applyGate(s.crowd, gate), 1, 9999);
            const gained = s.crowd >= before;
            addFloat(fmtGate(gate), s.playerX, PLAYER_Y - 100,
              gained ? "#4dff9b" : "#ff4d6d", 48);
            addPfx(s.playerX, PLAYER_Y - 60, gained ? 40 : 24, gained ? "good" : "bad");
            screenFlash(gained ? 0 : 255, gained ? 255 : 0, 0, gained ? 0.18 : 0.22);
            s.shake = gained ? 4 : 9;
          }
        }
      }

      if (sec.kind === "enemies" && !sec.defeated) {
        if (!hitZone) continue;
        if (Math.abs(s.playerX - sec.x) < 140) {
          const lost = Math.min(s.crowd - 1, sec.count);
          s.crowd = Math.max(1, s.crowd - lost);
          sec.count -= Math.min(sec.count, s.crowd + lost);
          addFloat(`-${lost}`, sec.x, PLAYER_Y - 90, "#ff4d6d", 38);
          addPfx(sec.x, PLAYER_Y - 50, 40, "hit");
          s.shake = 11;
          screenFlash(255, 60, 60, 0.2);
          if (sec.count <= 0) {
            sec.defeated = true;
            const rew = Math.floor((18 + lost * 1.5) * s.upgrades.income);
            s.coins += rew; s.runCoins += rew;
            addFloat(`+${rew} 🪙`, sec.x, PLAYER_Y - 140, "#ffd43b", 30);
            addPfx(sec.x, PLAYER_Y - 90, 50, "coin");
            bump();
          }
        }
      }

      if (sec.kind === "obstacle") {
        if (!hitZone) continue;
        for (const blade of sec.blades) {
          if (blade.hit) continue;
          const bx = blade.x + Math.sin(now / 280 + blade.phase) * 65;
          if (Math.abs(s.playerX - bx) < blade.radius + 32) {
            blade.hit = true;
            const lost = Math.min(s.crowd - 1, Math.ceil(s.crowd * 0.28) + 4);
            s.crowd = Math.max(1, s.crowd - lost);
            addFloat(`-${lost}`, bx, PLAYER_Y - 90, "#ff4d6d", 38);
            addPfx(bx, PLAYER_Y - 55, 35, "bad");
            s.shake = 13;
            screenFlash(255, 80, 0, 0.25);
          }
        }
      }

      if (sec.kind === "coins") {
        for (const coin of sec.coins) {
          if (coin.taken) continue;
          const coinScreenY = screenY + coin.yOffset;
          if (Math.abs(coinScreenY - PLAYER_Y) > 50) continue;
          if (Math.abs(s.playerX - coin.x) < 60) {
            coin.taken = true;
            const gain = 2 * s.upgrades.income;
            s.coins += gain; s.runCoins += gain;
            addPfx(coin.x, PLAYER_Y - 40, 10, "coin");
            bump();
          }
        }
      }

      if (sec.kind === "boss" && !sec.defeated) {
        const inRange = Math.abs(screenY - PLAYER_Y) < 90;
        if (inRange) {
          s.bossDmgTimer += dt;
          if (s.bossDmgTimer > 5) {
            s.bossDmgTimer = 0;
            const dmg = Math.max(1, Math.floor(s.crowd * (0.4 + s.upgrades.damage * 0.09)));
            sec.hp -= dmg;
            const lostCrowd = Math.min(s.crowd - 1, Math.ceil(sec.maxHp / 80));
            s.crowd = Math.max(1, s.crowd - lostCrowd);
            addFloat(`-${dmg}`, TRACK_CX, PLAYER_Y - 160, "#fff", 34);
            addPfx(TRACK_CX, PLAYER_Y - 90, 22, "hit");
            s.shake = 9;
            screenFlash(200, 0, 0, 0.15);

            if (sec.hp <= 0) {
              sec.defeated = true;
              const rew = Math.floor((100 + s.crowd * 3) * s.upgrades.income);
              s.coins += rew; s.runCoins += rew;
              s.stats.bestCrowd = Math.max(s.stats.bestCrowd, s.crowd);
              s.stats.bestCoins = Math.max(s.stats.bestCoins, s.runCoins);
              addFloat(`BOSS DOWN! +${rew}🪙`, TRACK_CX, PLAYER_Y - 180, "#ffd43b", 38);
              addPfx(TRACK_CX, PLAYER_Y - 100, 120, "coin");
              s.shake = 22;
              screenFlash(255, 220, 0, 0.4);
              bump();
              setTimeout(() => { sync("complete"); bump(); }, 1100);
            }
            if (s.crowd <= 1 && sec.hp > 0) {
              setTimeout(() => { sync("failed"); bump(); }, 500);
            }
          }
        }
      }
    }

    if (s.worldY >= WORLD_LEN && s.phase === "playing") {
      sync("complete"); bump();
    }
  };

  /* ════════════════════ DRAW ════════════════════ */
  const worldToScreen = (objY) => {
    const s = gs.current;
    // Correct "running forward into screen" perspective:
    // - Player is always at screen bottom (PLAYER_Y)
    // - Objects AHEAD have higher worldY values (e.g. 720, 1270...)
    // - They should appear near HORIZON_Y when far away, slide DOWN to PLAYER_Y when adjacent
    // - dist = objY - s.worldY  (positive = object is still ahead)
    // - when dist == 0: screenY = PLAYER_Y (object at player)
    // - when dist is large: screenY approaches HORIZON_Y
    // Use: screenY = PLAYER_Y - dist  clamped to [HORIZON_Y, PLAYER_Y+200]
    const dist = objY - s.worldY;
    return PLAYER_Y - dist;
  };

  const draw = (ctx, now) => {
    const s = gs.current;

    ctx.clearRect(0, 0, CW, CH);

    const sx = s.shake ? rand(-s.shake, s.shake) : 0;
    const sy = s.shake ? rand(-s.shake * 0.6, s.shake * 0.6) : 0;

    ctx.save();
    ctx.translate(sx, sy);

    drawSky(ctx, now);
    drawTrack(ctx, now);
    drawLevelObjects(ctx, now, worldToScreen);
    drawCrowd(ctx, now);
    drawParticles(ctx);
    drawHUD(ctx, now);

    ctx.restore();

    /* screen flash */
    if (s.flash.a > 0.01) {
      ctx.fillStyle = `rgba(${s.flash.r},${s.flash.g},${s.flash.b},${s.flash.a})`;
      ctx.fillRect(0, 0, CW, CH);
    }

    drawOverlay(ctx, now);
  };

  /* ── sky + environment ── */
  const drawSky = (ctx, now) => {
    const s = gs.current;
    const t = now * 0.0002;

    /* sky gradient */
    const sky = ctx.createLinearGradient(0, 0, 0, HORIZON_Y + 60);
    sky.addColorStop(0, "#0a1628");
    sky.addColorStop(0.5, "#1a3c6e");
    sky.addColorStop(1, "#2d6ca8");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, CW, HORIZON_Y + 60);

    /* stars */
    const starSeed = [13, 47, 89, 134, 200, 255, 312, 379, 430, 490,
                      550, 610, 665, 720, 780, 820, 875, 930, 970, 999];
    starSeed.forEach((seed, i) => {
      const sx2 = (seed * 37 + i * 17) % CW;
      const sy2 = (seed * 13 + i * 7) % (HORIZON_Y - 10);
      const brightness = 0.5 + Math.sin(t + i) * 0.3;
      ctx.fillStyle = `rgba(255,255,255,${brightness})`;
      ctx.beginPath();
      ctx.arc(sx2, sy2, 1.5, 0, Math.PI * 2);
      ctx.fill();
    });

    /* horizon glow */
    const glow = ctx.createLinearGradient(0, HORIZON_Y - 40, 0, HORIZON_Y + 60);
    glow.addColorStop(0, "rgba(80,180,255,0.0)");
    glow.addColorStop(0.5, "rgba(120,210,255,0.35)");
    glow.addColorStop(1, "rgba(180,230,255,0.0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, HORIZON_Y - 40, CW, 100);

    /* distant buildings silhouette */
    ctx.fillStyle = "rgba(10,20,50,0.7)";
    const buildings = [
      [200, 60, 40, 80], [260, 45, 30, 95], [310, 70, 50, 70],
      [650, 55, 35, 85], [700, 40, 45, 100], [760, 65, 30, 75],
    ];
    buildings.forEach(([bx, by, bw, bh]) => {
      ctx.fillRect(bx, HORIZON_Y - bh, bw, bh);
      /* windows */
      ctx.fillStyle = `rgba(255,240,120,${0.4 + Math.sin(now * 0.003 + bx) * 0.1})`;
      for (let wr = 0; wr < 3; wr++) {
        for (let wc = 0; wc < Math.floor(bw / 10); wc++) {
          if (Math.random() > 0.35) {
            ctx.fillRect(bx + wc * 10 + 3, HORIZON_Y - bh + wr * 18 + 5, 5, 7);
          }
        }
      }
      ctx.fillStyle = "rgba(10,20,50,0.7)";
    });
  };

  const drawTrack = (ctx, now) => {
    const s = gs.current;

    /* road surface — trapezoid from horizon to bottom */
    const roadGrad = ctx.createLinearGradient(0, HORIZON_Y, 0, CH);
    roadGrad.addColorStop(0, "#1e2535");
    roadGrad.addColorStop(0.4, "#252c3f");
    roadGrad.addColorStop(1, "#2e3550");
    ctx.fillStyle = roadGrad;

    ctx.beginPath();
    ctx.moveTo(TRACK_CX - 20, HORIZON_Y);
    ctx.lineTo(TRACK_CX + 20, HORIZON_Y);
    ctx.lineTo(TRACK_R + 80, CH);
    ctx.lineTo(TRACK_L - 80, CH);
    ctx.closePath();
    ctx.fill();

    /* road edge glow lines */
    const drawEdge = (worldX, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(TRACK_CX + (worldX - TRACK_CX) * 0.02 + TRACK_CX - TRACK_CX, HORIZON_Y);
      /* properly lerp edge to screen */
      const topX = TRACK_CX + (worldX - TRACK_CX) * 0.04;
      const botX = worldX + (worldX > TRACK_CX ? 80 : -80);
      ctx.moveTo(topX, HORIZON_Y);
      ctx.lineTo(botX, CH);
      ctx.stroke();
    };

    /* left/right road edges */
    ctx.strokeStyle = "rgba(255,140,0,0.9)";
    ctx.lineWidth = 5;
    ctx.shadowColor = "rgba(255,140,0,0.6)";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(TRACK_CX - 5, HORIZON_Y);
    ctx.lineTo(TRACK_L - 80, CH);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(TRACK_CX + 5, HORIZON_Y);
    ctx.lineTo(TRACK_R + 80, CH);
    ctx.stroke();
    ctx.shadowBlur = 0;

    /* lane divider — dashed center line in perspective */
    const dashCount = 18;
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    for (let i = 0; i < dashCount; i++) {
      /* animate scrolling */
      const rawT = (i / dashCount + (s.worldY * 0.008) % 1) % 1;
      const t1 = rawT;
      const t2 = rawT + 0.035;
      if (t1 > 0.98 || t2 < 0.01) continue;
      const y1 = HORIZON_Y + (CH - HORIZON_Y) * t1;
      const y2 = HORIZON_Y + (CH - HORIZON_Y) * Math.min(t2, 1);
      const x1 = TRACK_CX;
      const x2 = TRACK_CX;
      const lw = 3 + t1 * 6;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    /* road shoulder stripes */
    const stripeCount = 10;
    for (let i = 0; i < stripeCount; i++) {
      const rawT = (i / stripeCount + (s.worldY * 0.005) % 1) % 1;
      const y = HORIZON_Y + (CH - HORIZON_Y) * rawT;
      const t = persScale(y);
      const leftX = TRACK_CX - 5 + (TRACK_L - 80 - TRACK_CX) * rawT;
      const rightX = TRACK_CX + 5 + (TRACK_R + 80 - TRACK_CX) * rawT;
      const alpha = rawT * 0.4;
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fillRect(leftX - t * 15, y, t * 30, t * 6);
      ctx.fillRect(rightX - t * 15, y, t * 30, t * 6);
    }

    /* road surface shimmer */
    const shimmer = ctx.createLinearGradient(TRACK_CX - 150, 0, TRACK_CX + 150, 0);
    shimmer.addColorStop(0, "transparent");
    shimmer.addColorStop(0.5, `rgba(100,160,255,${0.04 + Math.sin(now * 0.003) * 0.02})`);
    shimmer.addColorStop(1, "transparent");
    ctx.fillStyle = shimmer;
    ctx.beginPath();
    ctx.moveTo(TRACK_CX - 5, HORIZON_Y);
    ctx.lineTo(TRACK_CX + 5, HORIZON_Y);
    ctx.lineTo(TRACK_R + 80, CH);
    ctx.lineTo(TRACK_L - 80, CH);
    ctx.closePath();
    ctx.fill();
  };

  /* ── level objects ── */
  const drawLevelObjects = (ctx, now, w2s) => {
    const s = gs.current;

    for (const sec of s.levels) {
      const screenY = w2s(sec.y);
      if (screenY > CH + 300 || screenY < HORIZON_Y - 100) continue;

      const pScale = clamp(persScale(screenY), 0.05, 1.2);

      if (sec.kind === "gates") {
        sec.gates.forEach(gate => drawGate3D(ctx, gate, screenY, pScale));
      }
      if (sec.kind === "enemies" && !sec.defeated) {
        drawEnemies3D(ctx, sec, screenY, pScale, now);
      }
      if (sec.kind === "obstacle") {
        drawObstacle3D(ctx, sec, screenY, pScale, now);
      }
      if (sec.kind === "coins") {
        drawCoins3D(ctx, sec, screenY, pScale, now);
      }
      if (sec.kind === "boss") {
        drawBoss3D(ctx, sec, screenY, pScale, now);
      }
    }
  };

  const drawGate3D = (ctx, gate, screenY, pScale) => {
    const positive = gate.type === "add" || gate.type === "mul";
    const sx = persX(gate.x, screenY);
    const w = persW(gate.width, screenY);
    const h = Math.max(20, gate.height * pScale);

    ctx.save();
    ctx.globalAlpha = gate.triggered ? 0.35 : 1;

    /* gate beam going into ground */
    const beamGrad = ctx.createLinearGradient(sx, screenY - h, sx, screenY + h * 0.3);
    if (positive) {
      beamGrad.addColorStop(0, "rgba(0,255,120,0)");
      beamGrad.addColorStop(0.5, "rgba(0,255,120,0.15)");
      beamGrad.addColorStop(1, "rgba(0,255,120,0)");
    } else {
      beamGrad.addColorStop(0, "rgba(255,60,80,0)");
      beamGrad.addColorStop(0.5, "rgba(255,60,80,0.15)");
      beamGrad.addColorStop(1, "rgba(255,60,80,0)");
    }
    ctx.fillStyle = beamGrad;
    ctx.fillRect(sx - w / 2, screenY - h * 1.5, w, h * 2);

    /* main gate box */
    const grad = ctx.createLinearGradient(sx - w / 2, screenY, sx + w / 2, screenY + h);
    if (positive) {
      grad.addColorStop(0, "#00ff85");
      grad.addColorStop(1, "#00b35c");
    } else {
      grad.addColorStop(0, "#ff3c5a");
      grad.addColorStop(1, "#b51020");
    }
    ctx.fillStyle = grad;
    roundRect(ctx, sx - w / 2, screenY - h / 2, w, h, 10 * pScale);
    ctx.fill();

    /* border glow */
    ctx.strokeStyle = positive ? "rgba(100,255,180,0.9)" : "rgba(255,100,120,0.9)";
    ctx.lineWidth = 3 * pScale;
    ctx.shadowColor = positive ? "#00ff85" : "#ff3c5a";
    ctx.shadowBlur = 15;
    roundRect(ctx, sx - w / 2, screenY - h / 2, w, h, 10 * pScale);
    ctx.stroke();
    ctx.shadowBlur = 0;

    /* text */
    const fontSize = Math.max(12, 40 * pScale);
    ctx.font = `900 ${fontSize}px "Segoe UI", Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = Math.max(1, 6 * pScale);
    ctx.strokeText(fmtGate(gate), sx, screenY);
    ctx.fillText(fmtGate(gate), sx, screenY);

    ctx.restore();
  };

  const drawEnemies3D = (ctx, sec, screenY, pScale, now) => {
    const count = Math.min(sec.count, 40);
    const positions = formationPositions(count);
    const sx = persX(sec.x, screenY);

    ctx.save();

    const runPhase = now * 0.007;
    for (let i = positions.length - 1; i >= 0; i--) {
      const p = positions[i];
      const ex = sx + p.x * pScale * 0.8;
      const ey = screenY + p.y * pScale * 0.7;
      const es = pScale * p.s * 0.72;
      drawRunner(ctx, ex, ey, es, 0, runPhase + i * 0.3); // red hue=0
    }

    /* count badge */
    const badgeFontSize = Math.max(10, 28 * pScale);
    ctx.font = `900 ${badgeFontSize}px Arial`;
    ctx.textAlign = "center";
    ctx.fillStyle = "#ff2244";
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 5 * pScale;
    ctx.strokeText(`${sec.count}`, sx, screenY - 60 * pScale);
    ctx.fillText(`${sec.count}`, sx, screenY - 60 * pScale);

    ctx.restore();
  };

  const drawObstacle3D = (ctx, sec, screenY, pScale, now) => {
    ctx.save();
    for (const blade of sec.blades) {
      const bx = persX(blade.x + Math.sin(now / 280 + blade.phase) * 65, screenY);
      const by = screenY;
      const r = blade.radius * pScale;
      const angle = now / 120 + blade.phase;

      if (blade.hit) ctx.globalAlpha = 0.3;
      else ctx.globalAlpha = 1;

      /* glow */
      ctx.shadowColor = "rgba(200,220,255,0.8)";
      ctx.shadowBlur = 20;

      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(angle);

      /* hub */
      ctx.fillStyle = "#1e2840";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.25, 0, Math.PI * 2);
      ctx.fill();

      /* blades */
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        const bg = ctx.createLinearGradient(0, 0, r, 0);
        bg.addColorStop(0, "#d0d8f0");
        bg.addColorStop(0.6, "#a8b4d0");
        bg.addColorStop(1, "rgba(200,210,240,0)");
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.12);
        ctx.lineTo(r * 0.75, -r * 0.06);
        ctx.lineTo(r, 0);
        ctx.lineTo(r * 0.75, r * 0.06);
        ctx.lineTo(0, r * 0.12);
        ctx.closePath();
        ctx.fill();
      }

      /* center cap */
      ctx.fillStyle = "#0d1220";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.14, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  };

  const drawCoins3D = (ctx, sec, screenY, pScale, now) => {
    for (const coin of sec.coins) {
      if (coin.taken) continue;
      const coinScreenY = screenY + coin.yOffset * pScale;
      if (coinScreenY < HORIZON_Y || coinScreenY > CH + 40) continue;
      const cps = clamp(persScale(coinScreenY), 0.05, 1.2);
      const cx2 = persX(coin.x, coinScreenY);
      const r = 18 * cps;
      const bob = Math.sin(now / 180 + coin.x) * 4 * cps;

      ctx.save();
      ctx.translate(cx2, coinScreenY + bob);
      ctx.scale(1, 0.85);

      ctx.shadowColor = "rgba(255,200,0,0.7)";
      ctx.shadowBlur = 12;

      const cg = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
      cg.addColorStop(0, "#fff9aa");
      cg.addColorStop(0.45, "#ffd43b");
      cg.addColorStop(1, "#e08800");
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(120,70,0,0.6)";
      ctx.font = `900 ${Math.max(7, 16 * cps)}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("$", 0, 1 * cps);

      ctx.restore();
    }
  };

  const drawBoss3D = (ctx, sec, screenY, pScale, now) => {
    const x = persX(TRACK_CX, screenY);

    if (sec.defeated) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.font = `900 ${Math.max(18, 48 * pScale)}px Arial`;
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffd43b";
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 7;
      ctx.strokeText("DESTROYED", x, screenY - 20);
      ctx.fillText("DESTROYED", x, screenY - 20);
      ctx.restore();
      return;
    }

    const bw = 280 * pScale;
    const bh = 200 * pScale;
    const pulse = Math.sin(now * 0.004) * 3;

    ctx.save();

    /* boss shadow on road */
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(x, screenY + bh * 0.55, bw * 0.55, 22 * pScale, 0, 0, Math.PI * 2);
    ctx.fill();

    /* body */
    const bodyGrad = ctx.createLinearGradient(x - bw / 2, screenY - bh / 2, x + bw / 2, screenY + bh / 2);
    bodyGrad.addColorStop(0, "#3a0a4a");
    bodyGrad.addColorStop(0.5, "#5a1060");
    bodyGrad.addColorStop(1, "#2a0635");
    ctx.fillStyle = bodyGrad;
    roundRect(ctx, x - bw / 2, screenY - bh * 0.55, bw, bh, 24 * pScale);
    ctx.fill();

    /* glow border */
    ctx.strokeStyle = `rgba(180,0,255,${0.7 + Math.sin(now * 0.008) * 0.2})`;
    ctx.lineWidth = 4 * pScale;
    ctx.shadowColor = "#aa00ff";
    ctx.shadowBlur = 25;
    roundRect(ctx, x - bw / 2, screenY - bh * 0.55, bw, bh, 24 * pScale);
    ctx.stroke();
    ctx.shadowBlur = 0;

    /* eyes */
    const eyeY = screenY - bh * 0.25;
    const eyeR = 18 * pScale;
    [x - bw * 0.22, x + bw * 0.22].forEach(ex => {
      const eyeGrad = ctx.createRadialGradient(ex, eyeY, 0, ex, eyeY, eyeR);
      eyeGrad.addColorStop(0, "#ffffff");
      eyeGrad.addColorStop(0.3, "#ff2040");
      eyeGrad.addColorStop(1, "#800020");
      ctx.fillStyle = eyeGrad;
      ctx.shadowColor = "#ff2040";
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(ex, eyeY + pulse, eyeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    /* mouth */
    ctx.strokeStyle = "#ff2040";
    ctx.lineWidth = 4 * pScale;
    ctx.beginPath();
    ctx.arc(x, screenY + bh * 0.05, bw * 0.2, 0.1, Math.PI - 0.1);
    ctx.stroke();

    /* health bar */
    const barW = 280 * pScale;
    const barH = 22 * pScale;
    const barX = x - barW / 2;
    const barY = screenY - bh * 0.55 - barH - 8 * pScale;
    const pct = clamp(sec.hp / sec.maxHp, 0, 1);

    ctx.fillStyle = "rgba(0,0,0,0.5)";
    roundRect(ctx, barX, barY, barW, barH, barH / 2);
    ctx.fill();

    const hpGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    hpGrad.addColorStop(0, "#ff1040");
    hpGrad.addColorStop(0.5, "#ff6000");
    hpGrad.addColorStop(1, "#ffcc00");
    ctx.fillStyle = hpGrad;
    roundRect(ctx, barX + 2, barY + 2, (barW - 4) * pct, barH - 4, barH / 2 - 1);
    ctx.fill();

    const labelFS = Math.max(10, 22 * pScale);
    ctx.font = `900 ${labelFS}px Arial`;
    ctx.textAlign = "center";
    ctx.fillStyle = "#ff1040";
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 5;
    const labelY = barY - 8 * pScale;
    ctx.strokeText("⚡ FINAL BOSS ⚡", x, labelY);
    ctx.fillStyle = "#ffffff";
    ctx.fillText("⚡ FINAL BOSS ⚡", x, labelY);

    ctx.restore();
  };

  /* ── player crowd ── */
  const drawCrowd = (ctx, now) => {
    const s = gs.current;
    const positions = formationPositions(s.crowd);

    /* crowd shadow */
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.ellipse(s.playerX, PLAYER_Y + 50, 80, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    /* draw back to front */
    for (let i = positions.length - 1; i >= 0; i--) {
      const p = positions[i];
      const px = s.playerX + p.x;
      const py = PLAYER_Y + p.y * 0.6;
      const runOffset = (i % 2 === 0 ? 1 : -0.4);
      drawRunner(ctx, px, py, p.s, 210, s.runPhase * runOffset);
    }

    /* crowd count badge */
    ctx.save();
    const badgeX = s.playerX;
    const badgeY = PLAYER_Y - 90;
    const bText = `${s.crowd}`;
    const bFS = 36;
    ctx.font = `900 ${bFS}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    /* badge pill */
    const tw = ctx.measureText(bText).width + 28;
    const th = 44;
    const bgGrad = ctx.createLinearGradient(badgeX - tw / 2, badgeY, badgeX + tw / 2, badgeY);
    bgGrad.addColorStop(0, "rgba(30,60,120,0.85)");
    bgGrad.addColorStop(1, "rgba(20,40,90,0.85)");
    ctx.fillStyle = bgGrad;
    roundRect(ctx, badgeX - tw / 2, badgeY - th / 2, tw, th, th / 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(100,180,255,0.7)";
    ctx.lineWidth = 2;
    roundRect(ctx, badgeX - tw / 2, badgeY - th / 2, tw, th, th / 2);
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.fillText(bText, badgeX, badgeY + 1);
    ctx.restore();
  };

  const drawParticles = (ctx) => {
    const s = gs.current;
    for (const p of s.particles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      let color;
      if (p.type === "coin") color = "#ffd43b";
      else if (p.type === "good") color = "#00ff85";
      else if (p.type === "bad") color = "#ff4d6d";
      else color = "#ffffff";

      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (const f of s.floatTexts) {
      const a = clamp(f.life / f.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `900 ${f.size}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 7;
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 12;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
  };

  const drawHUD = (ctx, now) => {
    const s = gs.current;
    if (s.phase !== "playing") return;

    const pct = clamp(s.worldY / FINISH_WORLD, 0, 1);

    /* top bar backdrop */
    const hudGrad = ctx.createLinearGradient(0, 0, 0, 80);
    hudGrad.addColorStop(0, "rgba(8,14,30,0.8)");
    hudGrad.addColorStop(1, "rgba(8,14,30,0)");
    ctx.fillStyle = hudGrad;
    ctx.fillRect(0, 0, CW, 80);

    /* coins */
    ctx.save();
    ctx.font = "900 22px Arial";
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffd43b";
    ctx.shadowColor = "#ffd43b";
    ctx.shadowBlur = 10;
    ctx.fillText("🪙", 22, 38);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`${s.coins}`, 52, 38);
    ctx.font = "700 14px Arial";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText(`+${s.runCoins} this run`, 52, 58);
    ctx.restore();

    /* progress bar */
    const barX = 260, barY = 20, barW = 480, barH = 20;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    roundRect(ctx, barX, barY, barW, barH, 10);
    ctx.fill();

    const progGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    progGrad.addColorStop(0, "#00d4ff");
    progGrad.addColorStop(0.5, "#0077ff");
    progGrad.addColorStop(1, "#aa00ff");
    ctx.fillStyle = progGrad;
    ctx.shadowColor = "#0077ff";
    ctx.shadowBlur = 12;
    roundRect(ctx, barX + 2, barY + 2, (barW - 4) * pct, barH - 4, 8);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "700 13px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`${Math.floor(pct * 100)}%`, barX + barW / 2, barY + barH * 0.75);

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 13px Arial";
    ctx.textAlign = "left";
    ctx.fillText("START", barX - 40, barY + 14);
    ctx.textAlign = "right";
    ctx.fillText("🏁", barX + barW + 25, barY + 14);
    ctx.restore();

    /* crowd display */
    ctx.save();
    ctx.font = "900 22px Arial";
    ctx.textAlign = "right";
    ctx.fillStyle = "#00d4ff";
    ctx.shadowColor = "#00d4ff";
    ctx.shadowBlur = 10;
    ctx.fillText("👥", CW - 52, 38);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`${s.crowd}`, CW - 22, 38);
    ctx.font = "700 14px Arial";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText("CROWD", CW - 22, 58);
    ctx.restore();
  };

  const drawOverlay = (ctx, now) => {
    const s = gs.current;
    if (s.phase === "playing") return;

    /* backdrop blur panel */
    ctx.save();
    ctx.fillStyle = "rgba(5,10,25,0.65)";
    ctx.fillRect(0, 0, CW, CH);

    /* panel */
    const px = CW / 2 - 240, py = CH / 2 - 200;
    const pw = 480, ph = 400;

    /* panel glow */
    ctx.shadowColor = "rgba(0,180,255,0.4)";
    ctx.shadowBlur = 40;
    const panelGrad = ctx.createLinearGradient(px, py, px, py + ph);
    panelGrad.addColorStop(0, "rgba(15,25,55,0.97)");
    panelGrad.addColorStop(1, "rgba(8,16,40,0.97)");
    ctx.fillStyle = panelGrad;
    roundRect(ctx, px, py, pw, ph, 28);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = "rgba(60,140,255,0.4)";
    ctx.lineWidth = 1.5;
    roundRect(ctx, px, py, pw, ph, 28);
    ctx.stroke();

    const cx2 = CW / 2;
    ctx.textAlign = "center";

    if (s.phase === "menu") {
      /* title */
      const titleGrad = ctx.createLinearGradient(cx2 - 180, 0, cx2 + 180, 0);
      titleGrad.addColorStop(0, "#00d4ff");
      titleGrad.addColorStop(0.5, "#aa00ff");
      titleGrad.addColorStop(1, "#ff2266");
      ctx.font = "900 62px Arial";
      ctx.fillStyle = titleGrad;
      ctx.shadowColor = "rgba(120,0,255,0.5)";
      ctx.shadowBlur = 22;
      ctx.fillText("MOB RUSH", cx2, py + 90);
      ctx.shadowBlur = 0;

      ctx.font = "700 18px Arial";
      ctx.fillStyle = "rgba(160,200,255,0.8)";
      ctx.fillText("Swipe · Multiply · Smash the Boss", cx2, py + 130);

      /* tips */
      const tips = ["Hit GREEN gates to GROW your mob", "Avoid RED gates & spinning blades", "Build crowd → boss damage"];
      tips.forEach((tip, i) => {
        ctx.font = "600 15px Arial";
        ctx.fillStyle = `rgba(130,180,255,${0.7 - i * 0.1})`;
        ctx.fillText(`${i + 1}. ${tip}`, cx2, py + 175 + i * 26);
      });

      drawButton(ctx, cx2, py + 310, 220, 56, "#0077ff", "#00aaff", "▶  START RUN");
    }

    if (s.phase === "complete") {
      ctx.font = "900 52px Arial";
      const cg = ctx.createLinearGradient(cx2 - 150, 0, cx2 + 150, 0);
      cg.addColorStop(0, "#00ff85");
      cg.addColorStop(1, "#00d4ff");
      ctx.fillStyle = cg;
      ctx.shadowColor = "#00ff85";
      ctx.shadowBlur = 20;
      ctx.fillText("CLEARED! 🎉", cx2, py + 90);
      ctx.shadowBlur = 0;

      ctx.font = "700 24px Arial";
      ctx.fillStyle = "#ffd43b";
      ctx.fillText(`+${s.runCoins} coins earned`, cx2, py + 145);
      ctx.fillStyle = "rgba(160,200,255,0.8)";
      ctx.font = "600 20px Arial";
      ctx.fillText(`Final crowd: ${s.crowd}`, cx2, py + 180);
      ctx.fillText(`Best crowd ever: ${s.stats.bestCrowd}`, cx2, py + 210);

      drawButton(ctx, cx2, py + 310, 220, 56, "#00a050", "#00cc66", "↺  RUN AGAIN");
    }

    if (s.phase === "failed") {
      ctx.font = "900 52px Arial";
      const fg = ctx.createLinearGradient(cx2 - 150, 0, cx2 + 150, 0);
      fg.addColorStop(0, "#ff1040");
      fg.addColorStop(1, "#ff6600");
      ctx.fillStyle = fg;
      ctx.shadowColor = "#ff1040";
      ctx.shadowBlur = 20;
      ctx.fillText("MOB WIPED 💀", cx2, py + 90);
      ctx.shadowBlur = 0;

      ctx.font = "700 24px Arial";
      ctx.fillStyle = "#ffd43b";
      ctx.fillText(`+${s.runCoins} coins earned`, cx2, py + 145);
      ctx.fillStyle = "rgba(160,200,255,0.8)";
      ctx.font = "600 19px Arial";
      ctx.fillText("Upgrade your mob and try again!", cx2, py + 185);

      drawButton(ctx, cx2, py + 310, 220, 56, "#cc1040", "#ff2255", "↺  RETRY");
    }

    ctx.restore();
  };

  const drawButton = (ctx, cx2, cy, w, h, c1, c2, label) => {
    const bx = cx2 - w / 2, by = cy - h / 2;
    ctx.save();
    const bg = ctx.createLinearGradient(bx, by, bx, by + h);
    bg.addColorStop(0, c2);
    bg.addColorStop(1, c1);
    ctx.shadowColor = c2;
    ctx.shadowBlur = 22;
    ctx.fillStyle = bg;
    roundRect(ctx, bx, by, w, h, h / 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 22px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, cx2, cy);
    ctx.restore();
  };

  /* ── canvas clicks ── */
  const handleClick = (e) => {
    const s = gs.current;
    if (s.phase === "playing") return;
    const rect = canvasRef.current.getBoundingClientRect();
    const cx2 = ((e.clientX - rect.left) / rect.width) * CW;
    const cy = ((e.clientY - rect.top) / rect.height) * CH;
    const bx = CW / 2, by = CH / 2 + 110;
    if (Math.abs(cx2 - bx) < 115 && Math.abs(cy - by) < 32) resetRun();
  };

  /* ── upgrade data ── */
  const s = gs.current;
  const upgrades = [
    { key: "startCrowd", icon: "👥", name: "Starting Mob", desc: "Begin with more runners", lv: s.upgrades.startCrowd, cost: 45 + s.upgrades.startCrowd * 35 },
    { key: "income",     icon: "🪙", name: "Coin Magnet",  desc: "Earn more from everything", lv: s.upgrades.income, cost: 60 + s.upgrades.income * 45 },
    { key: "damage",     icon: "⚡", name: "Boss Damage",  desc: "Hit the final boss harder", lv: s.upgrades.damage, cost: 70 + s.upgrades.damage * 50 },
    { key: "speed",      icon: "💨", name: "Rush Speed",   desc: "Move through levels faster", lv: s.upgrades.speed, cost: 50 + s.upgrades.speed * 40 },
  ];

  return (
    <div style={CSS.page}>
      <div style={CSS.shell}>
        {/* header */}
        <div style={CSS.header}>
          <div>
            <div style={CSS.titleRow}>
              <span style={CSS.titleIcon}>🏃</span>
              <h1 style={CSS.title}>Mob Rush</h1>
            </div>
            <p style={CSS.subtitle}>Pick gates · grow your mob · smash the final boss</p>
          </div>
          <div style={CSS.headerBtns}>
            <button style={{ ...CSS.btn, ...CSS.btnPrimary }} onClick={resetRun}>▶ Start Run</button>
            <button style={{ ...CSS.btn, ...CSS.btnSecondary }} onClick={hardReset}>Reset</button>
          </div>
        </div>

        <div style={CSS.main}>
          {/* canvas */}
          <div style={CSS.canvasWrap}>
            <canvas ref={canvasRef} width={CW} height={CH}
              onClick={handleClick} style={CSS.canvas} />
          </div>

          {/* side panel */}
          <aside style={CSS.panel}>
            <div style={CSS.statCard}>
              <span style={CSS.statLabel}>🪙 Total Coins</span>
              <strong style={CSS.statBig}>{s.coins}</strong>
            </div>

            <div style={CSS.statGrid}>
              <div style={CSS.statSmall}>
                <span style={CSS.statLabel}>👥 Best Mob</span>
                <strong style={CSS.statMid}>{s.stats.bestCrowd}</strong>
              </div>
              <div style={CSS.statSmall}>
                <span style={CSS.statLabel}>🏆 Best Run</span>
                <strong style={CSS.statMid}>{s.stats.bestCoins}</strong>
              </div>
            </div>

            <div style={CSS.upgradesBox}>
              <h2 style={CSS.panelH2}>Upgrades</h2>
              {upgrades.map(u => (
                <button key={u.key} style={{ ...CSS.upgradeBtn, opacity: s.coins < u.cost ? 0.45 : 1 }}
                  onClick={() => buyUpgrade(u.key)} disabled={s.coins < u.cost}>
                  <div style={CSS.upgradeIcon}>{u.icon}</div>
                  <div style={CSS.upgradeInfo}>
                    <strong style={CSS.upgradeName}>{u.name}</strong>
                    <span style={CSS.upgradeDesc}>{u.desc}</span>
                    <span style={CSS.upgradeLv}>Lv {u.lv}</span>
                  </div>
                  <div style={CSS.upgradeCost}>
                    <span>🪙</span>
                    <b>{u.cost}</b>
                  </div>
                </button>
              ))}
            </div>

            <div style={CSS.helpBox}>
              <h2 style={CSS.panelH2}>Controls</h2>
              <p style={CSS.helpText}>Drag to steer · A/D or ← → keys</p>
              <p style={CSS.helpText}>🟢 Gates grow your mob &nbsp;🔴 Gates shrink it</p>
              <p style={CSS.helpText}>Bigger mob = more boss damage!</p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ── STYLES ── */
const CSS = {
  page: {
    minHeight: "100vh",
    width: "100%",
    padding: "24px",
    background: "linear-gradient(135deg, #060c1e 0%, #0d1830 50%, #0a1228 100%)",
    color: "#e0eaff",
    boxSizing: "border-box",
    fontFamily: "'Segoe UI', Arial, sans-serif",
  },
  shell: { maxWidth: 1380, margin: "0 auto" },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: 20, marginBottom: 20,
  },
  titleRow: { display: "flex", alignItems: "center", gap: 12 },
  titleIcon: { fontSize: 40 },
  title: {
    margin: 0, fontSize: 48, fontWeight: 950,
    background: "linear-gradient(135deg, #00d4ff, #aa00ff, #ff2266)",
    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
    letterSpacing: "-2px",
  },
  subtitle: { margin: "6px 0 0", color: "rgba(160,200,255,0.7)", fontSize: 15, fontWeight: 700 },
  headerBtns: { display: "flex", gap: 10 },
  btn: {
    border: 0, borderRadius: 18, padding: "13px 20px",
    fontWeight: 900, fontSize: 14, cursor: "pointer",
    transition: "transform 0.15s, box-shadow 0.15s",
  },
  btnPrimary: {
    background: "linear-gradient(135deg, #0077ff, #00d4ff)",
    color: "#fff", boxShadow: "0 8px 28px rgba(0,120,255,0.35)",
  },
  btnSecondary: {
    background: "rgba(255,255,255,0.08)",
    color: "rgba(200,220,255,0.85)",
    border: "1px solid rgba(100,150,255,0.2)",
    boxShadow: "none",
  },
  main: { display: "grid", gridTemplateColumns: "minmax(0,1fr) 310px", gap: 20, alignItems: "start" },
  canvasWrap: {
    background: "rgba(0,0,0,0.4)",
    border: "1px solid rgba(60,120,255,0.25)",
    boxShadow: "0 24px 70px rgba(0,20,80,0.6)",
    borderRadius: 28, padding: 12, overflow: "hidden",
  },
  canvas: {
    width: "100%", display: "block", borderRadius: 20,
    touchAction: "none", cursor: "grab", userSelect: "none",
  },
  panel: { display: "flex", flexDirection: "column", gap: 14 },
  statCard: {
    background: "rgba(15,25,55,0.9)",
    border: "1px solid rgba(60,120,255,0.2)",
    boxShadow: "0 12px 40px rgba(0,20,80,0.4)",
    borderRadius: 22, padding: 20,
  },
  statGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  statSmall: {
    background: "rgba(15,25,55,0.9)",
    border: "1px solid rgba(60,120,255,0.2)",
    boxShadow: "0 12px 40px rgba(0,20,80,0.4)",
    borderRadius: 22, padding: 16,
  },
  statLabel: { display: "block", color: "rgba(130,180,255,0.7)", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.6px" },
  statBig: { display: "block", marginTop: 4, fontSize: 44, fontWeight: 950, color: "#ffd43b", lineHeight: 1 },
  statMid: { display: "block", marginTop: 4, fontSize: 28, fontWeight: 950, color: "#ffffff" },
  upgradesBox: {
    background: "rgba(15,25,55,0.9)",
    border: "1px solid rgba(60,120,255,0.2)",
    boxShadow: "0 12px 40px rgba(0,20,80,0.4)",
    borderRadius: 22, padding: 18,
  },
  panelH2: { margin: "0 0 14px", fontSize: 18, fontWeight: 950, color: "#e0eaff", letterSpacing: "-0.5px" },
  upgradeBtn: {
    width: "100%", border: "1px solid rgba(80,140,255,0.2)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 18, padding: "12px 14px", marginBottom: 10,
    cursor: "pointer", display: "flex", alignItems: "center",
    gap: 12, textAlign: "left", color: "#e0eaff",
    transition: "transform 0.15s, background 0.15s",
  },
  upgradeIcon: { fontSize: 26, flexShrink: 0 },
  upgradeInfo: { flex: 1, display: "flex", flexDirection: "column", gap: 2 },
  upgradeName: { color: "#e0eaff", fontSize: 14, fontWeight: 900 },
  upgradeDesc: { color: "rgba(130,180,255,0.7)", fontSize: 11, fontWeight: 700 },
  upgradeLv: { display: "inline-block", background: "rgba(0,120,255,0.2)", color: "#60b0ff", fontSize: 10, fontWeight: 900, borderRadius: 99, padding: "2px 8px", marginTop: 3 },
  upgradeCost: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0 },
  helpBox: {
    background: "rgba(15,25,55,0.9)",
    border: "1px solid rgba(60,120,255,0.2)",
    boxShadow: "0 12px 40px rgba(0,20,80,0.4)",
    borderRadius: 22, padding: 18,
  },
  helpText: { margin: "8px 0 0", color: "rgba(130,180,255,0.7)", fontWeight: 700, fontSize: 13, lineHeight: 1.5 },
};