import React, { useCallback, useEffect, useRef, useState } from "react";

/* ═══════════════════════════════════════════════
   CROWD MASTERS CLONE  — Count Masters aesthetic
   ═══════════════════════════════════════════════ */

const CW = 800;   // canvas width
const CH = 680;   // canvas height

// Road perspective geometry (matching the reference)
const ROAD_TOP_L  = 310;   // road left edge at horizon
const ROAD_TOP_R  = 490;   // road right edge at horizon
const ROAD_BOT_L  = 40;    // road left edge at bottom
const ROAD_BOT_R  = 760;   // road right edge at bottom
const HORIZON_Y   = 130;   // where the road vanishes
const PLAYER_Y    = 560;   // player's fixed screen Y

// World coordinate system:
// worldY increases as player runs "forward"
// Objects placed at worldY + distance appear ahead
// When object.worldY == state.worldY → object is at player (PLAYER_Y)
// When object.worldY > state.worldY → object is ahead (higher on screen, smaller)

const LANE_CENTER = (CW / 2);  // center of road at bottom
const PLAYER_HALF_WIDTH = 120; // how far left/right player can go from center

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp   = (a, b, t) => a + (b - a) * t;
const rand   = (a, b) => Math.random() * (b - a) + a;

// ── World↔Screen mapping ──────────────────────────────────────────────
// dist = how far AHEAD the object is (objWorldY - playerWorldY)
// dist == 0 → object at player's feet → PLAYER_Y
// dist > 0 → object ahead → somewhere between HORIZON_Y and PLAYER_Y
function worldDistToScreenY(dist) {
  if (dist <= 0) {
    // behind player — extrapolate below screen
    return PLAYER_Y - dist * 0.4;
  }
  const MAX_VISIBLE = 1800; // world units we can see ahead
  const t = clamp(dist / MAX_VISIBLE, 0, 1);
  // t=0 (at player) → PLAYER_Y,  t=1 (horizon) → HORIZON_Y
  // Use power curve for perspective feel
  const curved = 1 - Math.pow(1 - t, 1.8);
  return PLAYER_Y - curved * (PLAYER_Y - HORIZON_Y);
}

// Given a screenY, how wide is the road at that point?
function roadWidthAtY(screenY) {
  const t = clamp((screenY - HORIZON_Y) / (PLAYER_Y - HORIZON_Y), 0, 1);
  const topW = ROAD_TOP_R - ROAD_TOP_L;
  const botW = ROAD_BOT_R - ROAD_BOT_L;
  return lerp(topW, botW, t);
}

// Road center X is always CW/2
const ROAD_CX = CW / 2;

// Convert a world-space X offset (from center) to screen X at a given screenY
function worldXToScreen(worldXOffset, screenY) {
  const t = clamp((screenY - HORIZON_Y) / (PLAYER_Y - HORIZON_Y), 0, 1);
  const scale = lerp(0.02, 1, t); // at horizon everything squishes to center
  return ROAD_CX + worldXOffset * scale;
}

// Perspective scale factor at a given screenY
function pScale(screenY) {
  return clamp((screenY - HORIZON_Y) / (PLAYER_Y - HORIZON_Y), 0.01, 1);
}

// ── Helpers ──────────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  if (!isFinite(x+y+w+h+r) || w <= 0 || h <= 0) return;
  const rr = Math.min(Math.abs(r), w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+rr, y);
  ctx.arcTo(x+w, y, x+w, y+h, rr);
  ctx.arcTo(x+w, y+h, x, y+h, rr);
  ctx.arcTo(x, y+h, x, y, rr);
  ctx.arcTo(x, y, x+w, y, rr);
  ctx.closePath();
}

function fmtGate(gate) {
  if (gate.type==="add") return `+${gate.value}`;
  if (gate.type==="sub") return `-${gate.value}`;
  if (gate.type==="mul") return `×${gate.value}`;
  if (gate.type==="div") return `÷${gate.value}`;
  return "";
}

function applyGate(count, gate) {
  if (gate.type==="add") return count + gate.value;
  if (gate.type==="sub") return Math.max(1, count - gate.value);
  if (gate.type==="mul") return count * gate.value;
  if (gate.type==="div") return Math.max(1, Math.floor(count / gate.value));
  return count;
}

// ── Infinite level generation ─────────────────────────────────────────
let _levelSeed = 1;
function nextRand() {
  _levelSeed = (_levelSeed * 1664525 + 1013904223) & 0xffffffff;
  return ((_levelSeed >>> 0) / 4294967296);
}

const GATE_PAIRS = [
  [{type:"add",value:10},{type:"mul",value:2}],
  [{type:"sub",value:8 },{type:"add",value:30}],
  [{type:"mul",value:3},{type:"add",value:15}],
  [{type:"div",value:2},{type:"add",value:50}],
  [{type:"add",value:40},{type:"mul",value:2}],
  [{type:"mul",value:4},{type:"sub",value:20}],
  [{type:"add",value:25},{type:"mul",value:3}],
  [{type:"div",value:3},{type:"add",value:80}],
];

// Build a chunk of level objects starting at worldY
function buildChunk(startY, chunkIndex) {
  const sections = [];
  let y = startY;

  const difficulty = Math.min(chunkIndex * 0.12, 3);

  // Gate pair
  const pairIdx = chunkIndex % GATE_PAIRS.length;
  const pair = GATE_PAIRS[pairIdx];
  sections.push({
    id: `g${chunkIndex}`,
    kind: "gates",
    worldY: y,
    gates: [
      { side: -1, ...pair[0], triggered: false },
      { side:  1, ...pair[1], triggered: false },
    ],
  });
  y += 550 + nextRand() * 200;

  // Obstacle variety
  const roll = nextRand();
  if (roll < 0.4) {
    // Red enemy mob
    const count = Math.floor(12 + chunkIndex * 5 + nextRand() * 10);
    sections.push({
      id: `e${chunkIndex}`,
      kind: "enemies",
      worldY: y,
      x: (nextRand() - 0.5) * 180,
      count,
      maxCount: count,
      defeated: false,
    });
  } else if (roll < 0.72) {
    // Spinning saw blades
    sections.push({
      id: `o${chunkIndex}`,
      kind: "obstacle",
      worldY: y,
      blades: [
        { xOff: -130, phase: nextRand() * Math.PI * 2, hit: false },
        { xOff:  130, phase: nextRand() * Math.PI * 2, hit: false },
      ],
    });
  } else {
    // Spike field (red triangles like in image)
    const spikes = [];
    for (let i = 0; i < 3 + Math.floor(difficulty); i++) {
      spikes.push({
        xOff: (nextRand() - 0.5) * 300,
        hit: false,
      });
    }
    sections.push({
      id: `sp${chunkIndex}`,
      kind: "spikes",
      worldY: y,
      spikes,
    });
  }
  y += 500 + nextRand() * 200;

  // Coin row
  const coinCount = 10 + Math.floor(nextRand() * 8);
  sections.push({
    id: `c${chunkIndex}`,
    kind: "coins",
    worldY: y,
    coins: Array.from({length: coinCount}, (_, k) => ({
      xOff: Math.sin(k * 0.7 + chunkIndex) * 200,
      zOff: k * 60,   // spread forward along world z
      taken: false,
    })),
  });
  y += 600 + nextRand() * 150;

  // Every 5 chunks: a boss fight
  if (chunkIndex > 0 && chunkIndex % 5 === 0) {
    const bossHp = 200 + chunkIndex * 30;
    sections.push({
      id: `boss${chunkIndex}`,
      kind: "boss",
      worldY: y,
      hp: bossHp,
      maxHp: bossHp,
      defeated: false,
    });
    y += 800;
  }

  return { sections, endY: y };
}

function initLevels() {
  _levelSeed = 42;
  const chunks = [];
  let y = 600;
  for (let i = 0; i < 6; i++) {
    const chunk = buildChunk(y, i);
    chunks.push(...chunk.sections);
    y = chunk.endY;
  }
  return { sections: chunks, nextChunkY: y, nextChunkIndex: 6 };
}

// ── Formation positions ───────────────────────────────────────────────
function formationPositions(count) {
  const vis = Math.min(count, 120);
  const cols = Math.min(10, Math.ceil(Math.sqrt(vis * 1.5)));
  const out = [];
  for (let i = 0; i < vis; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const rowCount = Math.min(cols, vis - row * cols);
    out.push({
      x: (col - (rowCount - 1) / 2) * 28,
      z: row * 26,  // z = depth offset (positive = further back)
      scale: Math.max(0.5, 1 - row * 0.025),
    });
  }
  return out;
}

// ── Draw a Count Masters style round blob ────────────────────────────
// These are chunky round figures — sphere head + oval body, no detailed limbs
function drawBlob(ctx, cx, cy, r, topColor, botColor, shadow = true) {
  if (shadow) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 1.85, r * 0.9, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Body (oval)
  const bodyGrad = ctx.createRadialGradient(cx - r*0.25, cy - r*0.1, r*0.1, cx, cy + r*0.5, r*1.5);
  bodyGrad.addColorStop(0, topColor);
  bodyGrad.addColorStop(1, botColor);
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.55, r * 0.82, r * 1.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head (sphere)
  const headGrad = ctx.createRadialGradient(cx - r*0.28, cy - r*0.92, r*0.12, cx, cy - r*0.72, r);
  headGrad.addColorStop(0, lightenColor(topColor, 40));
  headGrad.addColorStop(1, topColor);
  ctx.fillStyle = headGrad;
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.72, r * 0.78, 0, Math.PI * 2);
  ctx.fill();

  // Specular highlight
  ctx.fillStyle = "rgba(255,255,255,0.38)";
  ctx.beginPath();
  ctx.ellipse(cx - r*0.28, cy - r*1.08, r*0.3, r*0.22, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

function lightenColor(hex, amount) {
  // Simple lighten for hsl-style
  if (hex.startsWith("hsl")) return hex;
  // Return a slightly lighter version
  return hex; // fallback — actual lightening done in radial gradient
}

// Draw a blob using HSL so we can lighten easily
function drawBlobHSL(ctx, cx, cy, r, h, s, l, shadow = true) {
  if (r < 1) return;
  if (shadow) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 1.9, r * 0.88, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Body
  const bodyGrad = ctx.createRadialGradient(cx - r*0.2, cy, r*0.05, cx, cy + r*0.5, r*1.4);
  bodyGrad.addColorStop(0, `hsl(${h},${s}%,${l+8}%)`);
  bodyGrad.addColorStop(1, `hsl(${h},${s}%,${l-14}%)`);
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.55, r * 0.8, r * 1.0, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head
  const headGrad = ctx.createRadialGradient(cx - r*0.3, cy - r*0.95, r*0.05, cx, cy - r*0.7, r*0.85);
  headGrad.addColorStop(0, `hsl(${h},${s}%,${l+20}%)`);
  headGrad.addColorStop(1, `hsl(${h},${s}%,${l}%)`);
  ctx.fillStyle = headGrad;
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.72, r * 0.76, 0, Math.PI * 2);
  ctx.fill();

  // Eye dots
  const eyeR = r * 0.12;
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.beginPath();
  ctx.arc(cx - r*0.22, cy - r*0.78, eyeR, 0, Math.PI*2);
  ctx.arc(cx + r*0.22, cy - r*0.78, eyeR, 0, Math.PI*2);
  ctx.fill();

  // Specular
  ctx.fillStyle = "rgba(255,255,255,0.42)";
  ctx.beginPath();
  ctx.ellipse(cx - r*0.3, cy - r*1.1, r*0.25, r*0.18, -0.4, 0, Math.PI*2);
  ctx.fill();
}

// Draw ink splat (fight effect)
function drawSplat(ctx, x, y, r, color) {
  ctx.save();
  ctx.fillStyle = color;
  // Main blob
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI*2);
  ctx.fill();
  // Spikes
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const sr = r * (0.4 + Math.random() * 0.5);
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * r * 1.1, y + Math.sin(a) * r * 0.9, sr * 0.55, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.restore();
}

// ══════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════
export default function MobRush() {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);
  const keysRef   = useRef({});
  const dragRef   = useRef({ active: false, startX: 0, baseX: LANE_CENTER });

  const [, rerender] = useState(0);
  const bump = () => rerender(v => v + 1);

  const gs = useRef(makeInitialState());

  function makeInitialState() {
    const lvl = initLevels();
    return {
      phase: "menu",
      playerX: LANE_CENTER,      // screen X of player
      targetX: LANE_CENTER,
      worldY: 0,                 // how far the player has run
      speed: 5.8,
      crowd: 1,
      coins: 0,
      runCoins: 0,
      runDistance: 0,
      levels: lvl.sections,
      nextChunkY: lvl.nextChunkY,
      nextChunkIndex: lvl.nextChunkIndex,
      particles: [],
      floatTexts: [],
      splats: [],                // permanent splat marks on road
      flash: { r:0, g:0, b:0, a:0 },
      shake: 0,
      upgrades: { startCrowd:1, income:1, damage:1, speed:1 },
      stats: { bestCrowd:1, bestDistance:0 },
    };
  }

  const startRun = useCallback(() => {
    const lvl = initLevels();
    const s = gs.current;
    Object.assign(gs.current, {
      phase: "playing",
      playerX: LANE_CENTER,
      targetX: LANE_CENTER,
      worldY: 0,
      speed: 5.8 + s.upgrades.speed * 0.28,
      crowd: Math.max(1, s.upgrades.startCrowd),
      runCoins: 0,
      runDistance: 0,
      levels: lvl.sections,
      nextChunkY: lvl.nextChunkY,
      nextChunkIndex: lvl.nextChunkIndex,
      particles: [],
      floatTexts: [],
      splats: [],
      flash: { r:0, g:0, b:0, a:0 },
      shake: 0,
    });
    bump();
  }, []);

  const hardReset = useCallback(() => {
    gs.current = makeInitialState();
    gs.current.coins = gs.current.coins || 0; // preserve coins? no, full reset
    bump();
  }, []);

  const buyUpgrade = useCallback((key) => {
    const s = gs.current;
    const lv = s.upgrades[key];
    const costs = { startCrowd:45+lv*35, income:60+lv*45, damage:70+lv*52, speed:50+lv*42 };
    if (s.coins < costs[key]) return;
    s.coins -= costs[key];
    s.upgrades[key]++;
    bump();
  }, []);

  // ── Input ────────────────────────────────────────────────────────────
  useEffect(() => {
    const kd = (e) => {
      keysRef.current[e.key.toLowerCase()] = true;
      if (e.key === " " && gs.current.phase !== "playing") { e.preventDefault(); startRun(); }
    };
    const ku = (e) => { keysRef.current[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
  }, [startRun]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = (clientX) => ((clientX - canvas.getBoundingClientRect().left) / canvas.getBoundingClientRect().width) * CW;
    const pd = (e) => { dragRef.current = { active: true, startX: cx(e.clientX), baseX: gs.current.targetX }; canvas.setPointerCapture?.(e.pointerId); };
    const pm = (e) => { if (!dragRef.current.active) return; gs.current.targetX = clamp(dragRef.current.baseX + (cx(e.clientX) - dragRef.current.startX) * 1.1, LANE_CENTER - PLAYER_HALF_WIDTH, LANE_CENTER + PLAYER_HALF_WIDTH); };
    const pu = () => { dragRef.current.active = false; };
    canvas.addEventListener("pointerdown", pd);
    canvas.addEventListener("pointermove", pm);
    canvas.addEventListener("pointerup", pu);
    canvas.addEventListener("pointercancel", pu);
    return () => { canvas.removeEventListener("pointerdown", pd); canvas.removeEventListener("pointermove", pm); canvas.removeEventListener("pointerup", pu); canvas.removeEventListener("pointercancel", pu); };
  }, []);

  // ── Game loop ────────────────────────────────────────────────────────
  useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");
    let last = performance.now();
    const loop = (now) => {
      const dt = clamp((now - last) / 16.67, 0.1, 2.5);
      last = now;
      update(dt, now);
      draw(ctx, now);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []); // eslint-disable-line

  // ══════════════════════════════════════════════════════════════════════
  //  UPDATE
  // ══════════════════════════════════════════════════════════════════════
  const addFloat = (text, x, y, color="#fff", size=34) => {
    gs.current.floatTexts.push({ text, x, y, vy:-2.0, life:55, maxLife:55, color, size });
    if (gs.current.floatTexts.length > 50) gs.current.floatTexts.splice(0, 10);
  };
  const addParticles = (x, y, n, type) => {
    for (let i = 0; i < n; i++) {
      gs.current.particles.push({ x, y, vx:rand(-4,4), vy:rand(-7,-1.5), life:rand(28,55), maxLife:55, size:rand(3,9), type });
    }
    if (gs.current.particles.length > 300) gs.current.particles.splice(0, 50);
  };
  const doFlash = (r,g,b,a) => { gs.current.flash = {r,g,b,a}; };

  const update = (dt, now) => {
    const s = gs.current;

    // Particles
    s.particles = s.particles.map(p => ({...p, x:p.x+p.vx*dt, y:p.y+p.vy*dt, vy:p.vy+0.28*dt, life:p.life-dt})).filter(p=>p.life>0);
    s.floatTexts = s.floatTexts.map(f => ({...f, y:f.y+f.vy*dt, life:f.life-dt})).filter(f=>f.life>0);
    s.shake = Math.max(0, s.shake - 1.1*dt);
    s.flash.a = Math.max(0, s.flash.a - 0.05*dt);
    // Fade old splats
    s.splats = s.splats.filter(sp => sp.worldY > s.worldY - 800);

    if (s.phase !== "playing") return;

    // Movement
    if (!dragRef.current.active) {
      if (keysRef.current.a || keysRef.current.arrowleft)  s.targetX -= 13*dt;
      if (keysRef.current.d || keysRef.current.arrowright) s.targetX += 13*dt;
      s.targetX = clamp(s.targetX, LANE_CENTER - PLAYER_HALF_WIDTH, LANE_CENTER + PLAYER_HALF_WIDTH);
    }
    // Smooth follow
    s.playerX = lerp(s.playerX, s.targetX, 1 - Math.pow(0.008, dt/10));
    s.playerX = clamp(s.playerX, LANE_CENTER - PLAYER_HALF_WIDTH, LANE_CENTER + PLAYER_HALF_WIDTH);

    // Advance world
    s.worldY += s.speed * dt;
    s.runDistance = Math.floor(s.worldY / 100);

    // Lazy-generate more level chunks
    while (s.worldY + 2400 > s.nextChunkY) {
      const chunk = buildChunk(s.nextChunkY, s.nextChunkIndex);
      s.levels.push(...chunk.sections);
      s.nextChunkY = chunk.endY;
      s.nextChunkIndex++;
    }
    // Cull old sections
    s.levels = s.levels.filter(sec => sec.worldY > s.worldY - 400);

    // Player world-space X offset from center
    const playerWorldX = s.playerX - LANE_CENTER;

    // ── Check interactions ──────────────────────────────────────────
    for (const sec of s.levels) {
      const dist = sec.worldY - s.worldY; // positive = ahead
      const screenY = worldDistToScreenY(dist);

      // Skip if way off screen
      if (dist > 1900 || dist < -100) continue;

      // Hit detection: object is "at player level" when dist is small
      // We use world-space distance for hit detection (more precise)
      const HIT_DIST = 55; // world units — object must be within this to trigger

      if (sec.kind === "gates") {
        if (Math.abs(dist) > HIT_DIST) continue;
        for (const gate of sec.gates) {
          if (gate.triggered) continue;
          // Gate occupies left or right half of road
          const gateWorldXCenter = gate.side * 155;
          const gateHalfW = 160;
          if (Math.abs(playerWorldX - gateWorldXCenter) < gateHalfW) {
            gate.triggered = true;
            const before = s.crowd;
            s.crowd = clamp(applyGate(s.crowd, gate), 1, 9999);
            const good = s.crowd >= before;
            addFloat(fmtGate(gate), s.playerX, PLAYER_Y - 100, good ? "#22dd66" : "#ff4455", 52);
            addParticles(s.playerX, PLAYER_Y - 60, good ? 45 : 22, good ? "good" : "bad");
            doFlash(good?0:255, good?220:40, good?100:60, good?0.14:0.22);
            s.shake = good ? 3 : 8;
          }
        }
      }

      if (sec.kind === "enemies" && !sec.defeated) {
        if (Math.abs(dist) > HIT_DIST*1.2) continue;
        if (Math.abs(playerWorldX - sec.x) > 180) continue;

        // Fight! Both sides lose numbers
        const myStrength = s.crowd;
        const theirStrength = sec.count;
        const lost = Math.min(s.crowd - 1, Math.ceil(theirStrength * 0.65));
        const enemyLost = Math.min(sec.count, myStrength);

        s.crowd = Math.max(1, s.crowd - lost);
        sec.count -= enemyLost;

        // Splat at fight location
        s.splats.push({ worldY: sec.worldY, worldX: sec.x, color: "rgba(220,40,60,0.55)", r: 18 + Math.random()*12 });
        s.splats.push({ worldY: sec.worldY + (Math.random()-0.5)*40, worldX: sec.x + (Math.random()-0.5)*60, color: "rgba(40,120,255,0.5)", r: 14 + Math.random()*10 });

        if (lost > 0) {
          addFloat(`-${lost}`, s.playerX, PLAYER_Y - 90, "#ff3355", 38);
          addParticles(s.playerX, PLAYER_Y - 55, 35, "hit");
          s.shake = 10;
          doFlash(255,60,60,0.18);
        }

        if (sec.count <= 0) {
          sec.defeated = true;
          const reward = Math.floor((20 + theirStrength * 1.5) * s.upgrades.income);
          s.coins += reward; s.runCoins += reward;
          addFloat(`+${reward}🪙`, s.playerX, PLAYER_Y - 140, "#ffcc00", 30);
          addParticles(s.playerX, PLAYER_Y - 90, 50, "coin");
          bump();
        } else if (s.crowd <= 1 && sec.count > 0) {
          s.phase = "failed"; bump();
        }
      }

      if (sec.kind === "obstacle") {
        if (Math.abs(dist) > HIT_DIST) continue;
        for (const blade of sec.blades) {
          if (blade.hit) continue;
          // Blade oscillates left/right
          const bladeWorldX = blade.xOff + Math.sin(now/280 + blade.phase) * 70;
          if (Math.abs(playerWorldX - bladeWorldX) < 55) {
            blade.hit = true;
            const lost = Math.min(s.crowd-1, Math.ceil(s.crowd*0.3)+3);
            s.crowd = Math.max(1, s.crowd - lost);
            addFloat(`-${lost}`, s.playerX, PLAYER_Y - 90, "#ff4455", 38);
            addParticles(s.playerX, PLAYER_Y-55, 30, "bad");
            s.shake = 13;
            doFlash(255,120,0,0.24);
          }
        }
      }

      if (sec.kind === "spikes") {
        if (Math.abs(dist) > HIT_DIST*0.8) continue;
        for (const spike of sec.spikes) {
          if (spike.hit) continue;
          if (Math.abs(playerWorldX - spike.xOff) < 50) {
            spike.hit = true;
            const lost = Math.min(s.crowd-1, 3 + Math.floor(s.crowd*0.18));
            s.crowd = Math.max(1, s.crowd - lost);
            addFloat(`-${lost}`, s.playerX, PLAYER_Y-90, "#ff4455", 38);
            addParticles(s.playerX, PLAYER_Y-55, 25, "bad");
            s.shake = 7;
            doFlash(255,80,0,0.18);
          }
        }
      }

      if (sec.kind === "coins") {
        for (const coin of sec.coins) {
          if (coin.taken) continue;
          // Each coin has its own world depth
          const coinDist = (sec.worldY + coin.zOff) - s.worldY;
          if (Math.abs(coinDist) > 45) continue;
          if (Math.abs(playerWorldX - coin.xOff) < 70) {
            coin.taken = true;
            const gain = 2 * s.upgrades.income;
            s.coins += gain; s.runCoins += gain;
            addParticles(s.playerX, PLAYER_Y-40, 10, "coin");
            bump();
          }
        }
      }

      if (sec.kind === "boss" && !sec.defeated) {
        if (Math.abs(dist) > 100) continue;
        // Continuous damage exchange
        const tickDmg = Math.max(1, Math.floor(s.crowd * (0.4 + s.upgrades.damage*0.08))) * dt * 0.25;
        const tickLost = (sec.maxHp / 800) * dt;
        sec.hp = Math.max(0, sec.hp - tickDmg);
        s.crowd = Math.max(1, s.crowd - tickLost);

        s.shake = 4;
        addParticles(s.playerX, PLAYER_Y-80, Math.ceil(2*dt), "hit");

        if (sec.hp <= 0) {
          sec.defeated = true;
          const reward = Math.floor((150 + Math.floor(s.crowd)*4) * s.upgrades.income);
          s.coins += reward; s.runCoins += reward;
          s.stats.bestCrowd = Math.max(s.stats.bestCrowd, Math.floor(s.crowd));
          s.stats.bestDistance = Math.max(s.stats.bestDistance, s.runDistance);
          addFloat(`BOSS DOWN! +${reward}🪙`, LANE_CENTER, PLAYER_Y-170, "#ffcc00", 40);
          addParticles(LANE_CENTER, PLAYER_Y-100, 120, "coin");
          doFlash(255,220,0,0.4);
          s.shake = 20;
          bump();
        }
        if (s.crowd < 1) {
          s.crowd = 0;
          s.phase = "failed"; bump();
        }
      }
    }

    if (s.crowd < 1) { s.crowd = 0; s.phase = "failed"; bump(); }
  };

  // ══════════════════════════════════════════════════════════════════════
  //  DRAW
  // ══════════════════════════════════════════════════════════════════════
  const draw = (ctx, now) => {
    const s = gs.current;
    ctx.clearRect(0, 0, CW, CH);

    const shX = s.shake ? rand(-s.shake, s.shake) : 0;
    const shY = s.shake ? rand(-s.shake*0.5, s.shake*0.5) : 0;

    ctx.save();
    ctx.translate(shX, shY);

    drawBackground(ctx, now);
    drawRoad(ctx);
    drawSplats(ctx);
    drawLevelObjects(ctx, now);
    drawPlayerCrowd(ctx, now);
    drawFx(ctx);
    drawHUD(ctx);

    ctx.restore();

    if (s.flash.a > 0.01) {
      ctx.fillStyle = `rgba(${s.flash.r},${s.flash.g},${s.flash.b},${s.flash.a.toFixed(3)})`;
      ctx.fillRect(0, 0, CW, CH);
    }

    drawOverlay(ctx);
  };

  // ── Background: sky blue ─────────────────────────────────────────────
  const drawBackground = (ctx, now) => {
    // Sky — bright aqua blue like the reference image
    const skyGrad = ctx.createLinearGradient(0, 0, 0, HORIZON_Y + 80);
    skyGrad.addColorStop(0, "#55d4f0");
    skyGrad.addColorStop(0.7, "#72e0f5");
    skyGrad.addColorStop(1, "#90eafa");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, CW, HORIZON_Y + 80);

    // Side panels (the blue pillars / architecture from the reference)
    // Left side
    drawSideArchitecture(ctx, "left");
    drawSideArchitecture(ctx, "right");
  };

  const drawSideArchitecture = (ctx, side) => {
    const isLeft = side === "left";
    const baseX = isLeft ? 0 : CW - 100;
    const color1 = "#7dd8ee";
    const color2 = "#5bbece";
    const shadow = "rgba(40,140,180,0.25)";

    ctx.save();

    // Draw 3 receding column/pillar sets
    const pillars = [
      { x: isLeft ? 28 : CW-70,  y: HORIZON_Y+20, w:42, h:70, depth:0.3 },
      { x: isLeft ? 10 : CW-58,  y: HORIZON_Y+55, w:52, h:90, depth:0.55 },
      { x: isLeft ? -5 : CW-60,  y: HORIZON_Y+110, w:65, h:130, depth:0.85 },
    ];

    pillars.forEach(p => {
      const sc = p.depth;
      ctx.fillStyle = shadow;
      ctx.fillRect(p.x + (isLeft?2:-2), p.y+2, p.w*sc, p.h*sc);

      const colGrad = ctx.createLinearGradient(p.x, p.y, p.x + p.w*sc, p.y);
      if (isLeft) {
        colGrad.addColorStop(0, color2);
        colGrad.addColorStop(1, color1);
      } else {
        colGrad.addColorStop(0, color1);
        colGrad.addColorStop(1, color2);
      }
      ctx.fillStyle = colGrad;
      roundRect(ctx, p.x, p.y, p.w*sc, p.h*sc, 5*sc);
      ctx.fill();

      // Top cap
      ctx.fillStyle = "#a8ebf8";
      ctx.fillRect(p.x - 3*sc, p.y, p.w*sc + 6*sc, 8*sc);
    });

    ctx.restore();
  };

  // ── Road ─────────────────────────────────────────────────────────────
  const drawRoad = (ctx) => {
    const s = gs.current;

    // Road fill — bright white/light grey
    ctx.save();
    const roadGrad = ctx.createLinearGradient(0, HORIZON_Y, 0, CH);
    roadGrad.addColorStop(0, "#f0f4ff");
    roadGrad.addColorStop(0.5, "#e8ecf8");
    roadGrad.addColorStop(1, "#dce4f5");
    ctx.fillStyle = roadGrad;
    ctx.beginPath();
    ctx.moveTo(ROAD_TOP_L, HORIZON_Y);
    ctx.lineTo(ROAD_TOP_R, HORIZON_Y);
    ctx.lineTo(ROAD_BOT_R, CH);
    ctx.lineTo(ROAD_BOT_L, CH);
    ctx.closePath();
    ctx.fill();

    // Road edge lines (subtle, dark)
    ctx.strokeStyle = "rgba(140,160,210,0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ROAD_TOP_L, HORIZON_Y);
    ctx.lineTo(ROAD_BOT_L, CH);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ROAD_TOP_R, HORIZON_Y);
    ctx.lineTo(ROAD_BOT_R, CH);
    ctx.stroke();

    // Lane lines (scrolling)
    const LANE_DASH_WORLD = 150;
    ctx.strokeStyle = "rgba(160,175,220,0.5)";
    for (let i = 0; i < 22; i++) {
      const raw = (i / 22 + (s.worldY * 0.0038) % 1) % 1;
      if (raw > 0.96) continue; // gap
      const y1 = HORIZON_Y + (CH - HORIZON_Y) * raw;
      const y2 = HORIZON_Y + (CH - HORIZON_Y) * Math.min(raw + 0.032, 1);
      ctx.lineWidth = 1.5 + raw * 3;
      ctx.beginPath();
      ctx.moveTo(ROAD_CX, y1);
      ctx.lineTo(ROAD_CX, y2);
      ctx.stroke();
    }

    ctx.restore();
  };

  // ── Splats ───────────────────────────────────────────────────────────
  const drawSplats = (ctx) => {
    const s = gs.current;
    ctx.save();
    for (const sp of s.splats) {
      const dist = sp.worldY - s.worldY;
      if (dist > 1900 || dist < -50) continue;
      const screenY = worldDistToScreenY(dist);
      const sc = pScale(screenY);
      const sx = worldXToScreen(sp.worldX, screenY);
      ctx.globalAlpha = Math.max(0, Math.min(0.7, (dist + 400) / 400));
      ctx.fillStyle = sp.color;
      ctx.beginPath();
      ctx.ellipse(sx, screenY, sp.r*sc*1.4, sp.r*sc*0.55, 0, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();
  };

  // ── Level objects ────────────────────────────────────────────────────
  const drawLevelObjects = (ctx, now) => {
    const s = gs.current;

    // Sort back to front by worldY descending (furthest first)
    const visible = s.levels.filter(sec => {
      const dist = sec.worldY - s.worldY;
      return dist > -120 && dist < 1900;
    }).sort((a, b) => b.worldY - a.worldY);

    for (const sec of visible) {
      const dist = sec.worldY - s.worldY;
      const screenY = worldDistToScreenY(dist);
      const sc = pScale(screenY);

      if (sec.kind === "gates") drawGateSection(ctx, sec, screenY, sc, now);
      if (sec.kind === "enemies" && !sec.defeated) drawEnemySection(ctx, sec, screenY, sc, now);
      if (sec.kind === "obstacle") drawObstacleSection(ctx, sec, screenY, sc, now);
      if (sec.kind === "spikes") drawSpikesSection(ctx, sec, screenY, sc);
      if (sec.kind === "coins") drawCoinsSection(ctx, sec, s.worldY, now);
      if (sec.kind === "boss") drawBossSection(ctx, sec, screenY, sc, now);
    }
  };

  // Gates — tall vertical posts with a bar, number on ground
  const drawGateSection = (ctx, sec, screenY, sc, now) => {
    const postH = 240 * sc;
    const barH  = 55 * sc;

    sec.gates.forEach(gate => {
      const positive = gate.type === "add" || gate.type === "mul";
      const gx = worldXToScreen(gate.side * 155, screenY);
      const gw = 170 * sc;

      ctx.save();
      ctx.globalAlpha = gate.triggered ? 0.3 : 1;

      // Gate background panel
      const panelColor = positive
        ? ctx.createLinearGradient(gx-gw/2, screenY-barH/2, gx+gw/2, screenY+barH/2)
        : ctx.createLinearGradient(gx-gw/2, screenY-barH/2, gx+gw/2, screenY+barH/2);

      if (positive) {
        panelColor.addColorStop(0, "rgba(30,220,110,0.92)");
        panelColor.addColorStop(1, "rgba(10,160,80,0.92)");
      } else {
        panelColor.addColorStop(0, "rgba(255,60,80,0.92)");
        panelColor.addColorStop(1, "rgba(180,20,40,0.92)");
      }

      ctx.fillStyle = panelColor;
      roundRect(ctx, gx - gw/2, screenY - barH/2, gw, barH, 10*sc);
      ctx.fill();

      // Vertical posts (left and right of gate)
      ctx.fillStyle = "#b0b8cc";
      const postW = 14*sc;
      ctx.fillRect(gx - gw/2 - postW/2, screenY - postH, postW, postH + barH/2);
      ctx.fillRect(gx + gw/2 - postW/2, screenY - postH, postW, postH + barH/2);

      // Post caps
      ctx.fillStyle = "#d0d8e8";
      ctx.fillRect(gx - gw/2 - postW, screenY - postH, postW*2, 8*sc);
      ctx.fillRect(gx + gw/2 - postW, screenY - postH, postW*2, 8*sc);

      // Text
      const fs = Math.max(10, 42*sc);
      ctx.font = `900 ${fs}px Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 6*sc;
      ctx.strokeText(fmtGate(gate), gx, screenY);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(fmtGate(gate), gx, screenY);

      ctx.restore();
    });

    // Ground line between gates
    const lx = worldXToScreen(-155, screenY);
    const rx = worldXToScreen(155, screenY);
    ctx.save();
    ctx.strokeStyle = "rgba(180,190,220,0.6)";
    ctx.lineWidth = 2*sc;
    ctx.beginPath();
    ctx.moveTo(lx, screenY + 28*sc);
    ctx.lineTo(rx, screenY + 28*sc);
    ctx.stroke();
    ctx.restore();
  };

  // Enemies — red round blobs in formation
  const drawEnemySection = (ctx, sec, screenY, sc, now) => {
    const positions = formationPositions(Math.min(sec.count, 60));
    const cx2 = worldXToScreen(sec.x, screenY);
    const blobR = Math.max(3, 22 * sc);
    const phase = now * 0.005;

    // Draw back-to-front
    for (let i = positions.length - 1; i >= 0; i--) {
      const p = positions[i];
      // Each blob has slight z (depth) offset
      const blobDist = (sec.worldY + p.z) - gs.current.worldY;
      const bsy = worldDistToScreenY(blobDist);
      const bsc = pScale(bsy);
      const r = Math.max(2, 22 * bsc);
      const bx = worldXToScreen(sec.x + p.x, bsy);
      // Slight bob
      const bob = Math.sin(phase + i * 0.5) * 2 * bsc;
      drawBlobHSL(ctx, bx, bsy + bob, r, 0, 90, 52, i < 3);
    }

    // Count badge
    if (sec.count > 0) {
      const fs = Math.max(10, 26*sc);
      ctx.save();
      ctx.font = `900 ${fs}px Arial`;
      ctx.textAlign = "center";
      ctx.fillStyle = "#ff2244";
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 5;
      ctx.strokeText(`${sec.count}`, cx2, screenY - blobR*4.5);
      ctx.fillText(`${sec.count}`, cx2, screenY - blobR*4.5);
      ctx.restore();
    }
  };

  // Spinning saw blades
  const drawObstacleSection = (ctx, sec, screenY, sc, now) => {
    sec.blades.forEach(blade => {
      if (blade.hit) return;
      const worldX = blade.xOff + Math.sin(now/280 + blade.phase) * 70;
      const bx = worldXToScreen(worldX, screenY);
      const r = Math.max(8, 50*sc);
      const angle = now/110 + blade.phase;

      ctx.save();
      ctx.translate(bx, screenY);
      ctx.rotate(angle);

      // Red saw blade (matches reference — red spinning blade)
      ctx.shadowColor = "rgba(220,30,30,0.6)";
      ctx.shadowBlur = 10;

      for (let i = 0; i < 6; i++) {
        ctx.rotate(Math.PI/3);
        const bg = ctx.createLinearGradient(0, -r*0.1, r, 0);
        bg.addColorStop(0, "#ff3344");
        bg.addColorStop(0.7, "#cc1122");
        bg.addColorStop(1, "rgba(200,20,30,0)");
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.moveTo(0, -r*0.12);
        ctx.lineTo(r*0.78, -r*0.05);
        ctx.lineTo(r, 0);
        ctx.lineTo(r*0.78, r*0.05);
        ctx.lineTo(0, r*0.12);
        ctx.closePath();
        ctx.fill();
      }

      ctx.shadowBlur = 0;
      // Center hub
      ctx.fillStyle = "#880010";
      ctx.beginPath();
      ctx.arc(0, 0, r*0.22, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = "#cc1a2a";
      ctx.beginPath();
      ctx.arc(0, 0, r*0.13, 0, Math.PI*2);
      ctx.fill();

      ctx.restore();
    });
  };

  // Red spike triangles (the red triangles in the reference image)
  const drawSpikesSection = (ctx, sec, screenY, sc) => {
    sec.spikes.forEach(spike => {
      if (spike.hit) return;
      const sx = worldXToScreen(spike.xOff, screenY);
      const w = Math.max(8, 52*sc);
      const h = Math.max(12, 78*sc);

      ctx.save();

      // Shadow
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.beginPath();
      ctx.ellipse(sx, screenY + h*0.08, w*0.65, 8*sc, 0, 0, Math.PI*2);
      ctx.fill();

      // Triangle — solid red like in the reference
      const triGrad = ctx.createLinearGradient(sx-w/2, screenY-h/2, sx+w/2, screenY+h/2);
      triGrad.addColorStop(0, "#ff4455");
      triGrad.addColorStop(1, "#cc1122");

      ctx.fillStyle = triGrad;
      ctx.beginPath();
      ctx.moveTo(sx, screenY - h/2);
      ctx.lineTo(sx + w/2, screenY + h/2);
      ctx.lineTo(sx - w/2, screenY + h/2);
      ctx.closePath();
      ctx.fill();

      // Highlight edge
      ctx.strokeStyle = "rgba(255,150,160,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, screenY - h/2);
      ctx.lineTo(sx - w/2, screenY + h/2);
      ctx.stroke();

      ctx.restore();
    });
  };

  // Coins
  const drawCoinsSection = (ctx, sec, worldY, now) => {
    for (const coin of sec.coins) {
      if (coin.taken) continue;
      const coinDist = (sec.worldY + coin.zOff) - worldY;
      if (coinDist > 1800 || coinDist < -80) continue;
      const sy = worldDistToScreenY(coinDist);
      const sc2 = pScale(sy);
      const cx2 = worldXToScreen(coin.xOff, sy);
      const r = Math.max(3, 16*sc2);
      const bob = Math.sin(now/160 + coin.xOff*0.01) * 3 * sc2;

      ctx.save();
      ctx.translate(cx2, sy + bob);

      const cg = ctx.createRadialGradient(-r*0.3, -r*0.35, r*0.05, 0, 0, r);
      cg.addColorStop(0, "#fff9aa");
      cg.addColorStop(0.45, "#ffcc00");
      cg.addColorStop(1, "#cc8800");
      ctx.shadowColor = "rgba(255,200,0,0.7)";
      ctx.shadowBlur = 8;
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI*2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = "rgba(100,60,0,0.7)";
      ctx.font = `900 ${Math.max(6,r*0.9)}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("$", 0, 1);

      ctx.restore();
    }
  };

  // Boss
  const drawBossSection = (ctx, sec, screenY, sc, now) => {
    const x = worldXToScreen(0, screenY);

    if (sec.defeated) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.font = `900 ${Math.max(14,44*sc)}px Arial`;
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffcc00";
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 7;
      ctx.strokeText("DESTROYED!", x, screenY-10*sc);
      ctx.fillText("DESTROYED!", x, screenY-10*sc);
      ctx.restore();
      return;
    }

    const w = 290*sc, h = 200*sc;
    const pulse = Math.sin(now*0.004)*3*sc;

    ctx.save();

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(x, screenY+h*0.58, w*0.55, 20*sc, 0, 0, Math.PI*2);
    ctx.fill();

    // Body
    const body = ctx.createLinearGradient(x-w/2, screenY-h/2, x+w/2, screenY+h/2);
    body.addColorStop(0, "#4a0a5a"); body.addColorStop(0.5, "#7a1490"); body.addColorStop(1, "#2a0535");
    ctx.fillStyle = body;
    roundRect(ctx, x-w/2, screenY-h*0.55, w, h, 28*sc);
    ctx.fill();

    ctx.strokeStyle = `rgba(200,20,255,${0.65+Math.sin(now*0.007)*0.2})`;
    ctx.lineWidth = Math.max(1,4*sc);
    ctx.shadowColor = "#cc00ff";
    ctx.shadowBlur = 20;
    roundRect(ctx, x-w/2, screenY-h*0.55, w, h, 28*sc);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Eyes
    const eyeR = 17*sc;
    const eyeY = screenY - h*0.24;
    [x-w*0.22, x+w*0.22].forEach(ex => {
      const eg = ctx.createRadialGradient(ex, eyeY, 0, ex, eyeY, eyeR);
      eg.addColorStop(0,"#fff"); eg.addColorStop(0.3,"#ff2040"); eg.addColorStop(1,"#800020");
      ctx.fillStyle = eg;
      ctx.shadowColor = "#ff2040"; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(ex, eyeY+pulse, eyeR, 0, Math.PI*2); ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Mouth
    ctx.strokeStyle = "#ff2040"; ctx.lineWidth = Math.max(1,3*sc);
    ctx.beginPath(); ctx.arc(x, screenY+h*0.05, w*0.18, 0.1, Math.PI-0.1); ctx.stroke();

    // HP bar
    const bw=280*sc, bh=20*sc;
    const bx=x-bw/2, by=screenY-h*0.7;
    const pct = clamp(sec.hp/sec.maxHp, 0, 1);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    roundRect(ctx, bx, by, bw, bh, bh/2); ctx.fill();
    const hpg = ctx.createLinearGradient(bx,0,bx+bw,0);
    hpg.addColorStop(0,"#ff1040"); hpg.addColorStop(0.5,"#ff6000"); hpg.addColorStop(1,"#ffcc00");
    ctx.fillStyle = hpg;
    roundRect(ctx, bx+2, by+2, (bw-4)*pct, bh-4, bh/2); ctx.fill();

    ctx.font = `900 ${Math.max(9,20*sc)}px Arial`;
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 4;
    ctx.strokeText("⚡ FINAL BOSS ⚡", x, by - 9*sc);
    ctx.fillText("⚡ FINAL BOSS ⚡", x, by - 9*sc);

    ctx.restore();
  };

  // ── Player crowd ─────────────────────────────────────────────────────
  const drawPlayerCrowd = (ctx, now) => {
    const s = gs.current;
    const positions = formationPositions(Math.ceil(s.crowd));

    // Sort back-to-front
    for (let i = positions.length - 1; i >= 0; i--) {
      const p = positions[i];
      // Each blob is at a slightly different world depth (z)
      const blobWorldDist = -p.z * 0.6; // negative = at/behind player
      const bsy = worldDistToScreenY(blobWorldDist);
      const bsc = pScale(bsy);
      const bx = s.playerX + p.x * bsc;
      const r = Math.max(2, 22 * bsc * p.scale);
      const bob = Math.sin(now * 0.011 + i * 0.7) * 2.5 * bsc;
      drawBlobHSL(ctx, bx, bsy + bob, r, 215, 90, 55, i === 0);
    }

    // Crowd count badge
    if (Math.ceil(s.crowd) > 0) {
      ctx.save();
      const cnt = Math.ceil(s.crowd).toString();
      const bY = PLAYER_Y - 92;
      ctx.font = "900 38px Arial";
      const tw = ctx.measureText(cnt).width + 30;
      const tH = 46;

      // Pill background
      ctx.fillStyle = "rgba(30,80,200,0.9)";
      roundRect(ctx, s.playerX - tw/2, bY-tH/2, tw, tH, tH/2);
      ctx.fill();
      ctx.strokeStyle = "rgba(100,200,255,0.8)";
      ctx.lineWidth = 2;
      roundRect(ctx, s.playerX - tw/2, bY-tH/2, tw, tH, tH/2);
      ctx.stroke();

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff";
      ctx.fillText(cnt, s.playerX, bY + 1);
      ctx.restore();
    }
  };

  // ── Particles & float texts ──────────────────────────────────────────
  const drawFx = (ctx) => {
    const s = gs.current;
    s.particles.forEach(p => {
      const a = clamp(p.life/p.maxLife, 0, 1);
      const color = p.type==="coin" ? "#ffcc00" : p.type==="good" ? "#22dd66" : p.type==="bad" ? "#ff4466" : "#ffffff";
      ctx.save();
      ctx.globalAlpha = a;
      ctx.shadowColor = color; ctx.shadowBlur = 6;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    });

    s.floatTexts.forEach(f => {
      const a = clamp(f.life/f.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `900 ${f.size}px Arial`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineWidth = 6;
      ctx.strokeStyle = "rgba(0,0,0,0.45)";
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.shadowColor = f.color; ctx.shadowBlur = 10;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    });
  };

  // ── HUD ──────────────────────────────────────────────────────────────
  const drawHUD = (ctx) => {
    const s = gs.current;
    if (s.phase !== "playing") return;

    // Top fade
    const bg = ctx.createLinearGradient(0,0,0,70);
    bg.addColorStop(0,"rgba(0,0,0,0.45)");
    bg.addColorStop(1,"rgba(0,0,0,0)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CW, 70);

    ctx.save();
    // Coins
    ctx.font = "900 22px Arial";
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffcc00";
    ctx.fillText("🪙", 18, 36);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(s.coins, 50, 36);
    ctx.font = "700 13px Arial";
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText(`+${s.runCoins} run`, 50, 54);

    // Distance
    ctx.textAlign = "center";
    ctx.font = "900 20px Arial";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`${s.runDistance}m`, CW/2, 36);

    // Crowd
    ctx.textAlign = "right";
    ctx.font = "900 22px Arial";
    ctx.fillStyle = "#44aaff";
    ctx.fillText(`👥 ${Math.ceil(s.crowd)}`, CW-18, 36);
    ctx.restore();
  };

  // ── Overlay ──────────────────────────────────────────────────────────
  const drawOverlay = (ctx) => {
    const s = gs.current;
    if (s.phase === "playing") return;

    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0,0,CW,CH);

    const pw=440, ph=400;
    const px=(CW-pw)/2, py=(CH-ph)/2;

    ctx.shadowColor = "rgba(0,160,255,0.4)";
    ctx.shadowBlur = 35;
    const pan = ctx.createLinearGradient(px,py,px,py+ph);
    pan.addColorStop(0,"rgba(14,24,55,0.97)");
    pan.addColorStop(1,"rgba(6,12,32,0.97)");
    ctx.fillStyle = pan;
    roundRect(ctx, px,py,pw,ph, 28); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(80,150,255,0.4)";
    ctx.lineWidth = 1.5;
    roundRect(ctx, px,py,pw,ph, 28); ctx.stroke();

    const cx2 = CW/2;
    ctx.textAlign = "center";

    if (s.phase==="menu") {
      const tg = ctx.createLinearGradient(cx2-160,0,cx2+160,0);
      tg.addColorStop(0,"#00d4ff"); tg.addColorStop(0.5,"#aa00ff"); tg.addColorStop(1,"#ff2266");
      ctx.font = "900 60px Arial";
      ctx.fillStyle = tg;
      ctx.shadowColor = "rgba(120,0,255,0.5)"; ctx.shadowBlur = 18;
      ctx.fillText("MOB RUSH", cx2, py+88);
      ctx.shadowBlur = 0;

      ctx.font = "700 17px Arial";
      ctx.fillStyle = "rgba(180,220,255,0.8)";
      ctx.fillText("Swipe · Multiply · Smash Enemies", cx2, py+125);

      ["Hit green gates to grow your mob","Avoid red gates, blades & spikes","Infinite levels — beat your best!"].forEach((t,i) => {
        ctx.font = "600 14px Arial";
        ctx.fillStyle = `rgba(180,220,255,${0.72-i*0.08})`;
        ctx.fillText(`${i+1}. ${t}`, cx2, py+172+i*26);
      });

      drawOvBtn(ctx, cx2, py+305, 210, 54, "#0077ff","#00d4ff","▶  START RUN");
    }

    if (s.phase==="complete" || s.phase==="failed") {
      const won = s.phase==="complete";
      const tg = ctx.createLinearGradient(cx2-150,0,cx2+150,0);
      if (won) { tg.addColorStop(0,"#00ff85"); tg.addColorStop(1,"#00d4ff"); }
      else     { tg.addColorStop(0,"#ff1040"); tg.addColorStop(1,"#ff7700"); }
      ctx.font = "900 50px Arial";
      ctx.fillStyle = tg;
      ctx.shadowColor = won?"#00ff85":"#ff1040"; ctx.shadowBlur = 18;
      ctx.fillText(won ? "CLEARED! 🎉" : "MOB WIPED 💀", cx2, py+88);
      ctx.shadowBlur = 0;

      ctx.font = "700 22px Arial";
      ctx.fillStyle = "#ffcc00";
      ctx.fillText(`+${s.runCoins} coins`, cx2, py+138);
      ctx.font = "600 18px Arial";
      ctx.fillStyle = "rgba(180,220,255,0.85)";
      ctx.fillText(`Distance: ${s.runDistance}m`, cx2, py+170);
      ctx.fillText(`Best crowd: ${s.stats.bestCrowd}`, cx2, py+200);

      drawOvBtn(ctx, cx2, py+305, 210, 54, won?"#00a050":"#cc1040", won?"#00dd75":"#ff2255", "↺  RUN AGAIN");
    }
  };

  function drawOvBtn(ctx, cx2, cy, w, h, c1, c2, label) {
    const x=cx2-w/2, y=cy-h/2;
    ctx.save();
    const g = ctx.createLinearGradient(x,y,x,y+h);
    g.addColorStop(0,c2); g.addColorStop(1,c1);
    ctx.shadowColor = c2; ctx.shadowBlur = 20;
    ctx.fillStyle = g;
    roundRect(ctx, x,y,w,h, h/2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff";
    ctx.font = "900 20px Arial";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(label, cx2, cy);
    ctx.restore();
  }

  // ── Canvas click ──────────────────────────────────────────────────────
  const handleClick = (e) => {
    const s = gs.current;
    if (s.phase === "playing") return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX-rect.left)/rect.width)*CW;
    const y = ((e.clientY-rect.top)/rect.height)*CH;
    if (Math.abs(x-CW/2)<110 && Math.abs(y-(CH/2+105))<32) startRun();
  };

  // ── Render ───────────────────────────────────────────────────────────
  const s = gs.current;
  const upgrades = [
    {key:"startCrowd",icon:"👥",name:"Starting Mob",    desc:"Begin with more runners",         lv:s.upgrades.startCrowd, cost:45+s.upgrades.startCrowd*35},
    {key:"income",    icon:"🪙",name:"Coin Magnet",     desc:"Earn more coins from everything", lv:s.upgrades.income,     cost:60+s.upgrades.income*45},
    {key:"damage",    icon:"⚡",name:"Mob Strength",    desc:"Fight enemies & boss harder",     lv:s.upgrades.damage,     cost:70+s.upgrades.damage*52},
    {key:"speed",     icon:"💨",name:"Rush Speed",      desc:"Move through levels faster",      lv:s.upgrades.speed,      cost:50+s.upgrades.speed*42},
  ];

  return (
    <div style={ST.page}>
      <div style={ST.shell}>
        <div style={ST.header}>
          <div>
            <div style={ST.titleRow}>
              <span style={ST.emoji}>🏃</span>
              <h1 style={ST.title}>Mob Rush</h1>
            </div>
            <p style={ST.sub}>Pick gates · grow your mob · smash the final boss</p>
          </div>
          <div style={ST.hBtns}>
            <button style={{...ST.btn,...ST.btnP}} onClick={startRun}>▶ Start Run</button>
            <button style={{...ST.btn,...ST.btnS}} onClick={hardReset}>Reset</button>
          </div>
        </div>

        <div style={ST.main}>
          <div style={ST.canvasWrap}>
            <canvas ref={canvasRef} width={CW} height={CH} style={ST.canvas} onClick={handleClick}/>
          </div>

          <aside style={ST.panel}>
            <div style={ST.statCard}>
              <span style={ST.statLbl}>🪙 Total Coins</span>
              <strong style={ST.statBig}>{s.coins}</strong>
            </div>

            <div style={ST.statGrid}>
              <div style={ST.statSmall}><span style={ST.statLbl}>👥 Best Mob</span><strong style={ST.statMid}>{s.stats.bestCrowd}</strong></div>
              <div style={ST.statSmall}><span style={ST.statLbl}>📏 Best Dist</span><strong style={ST.statMid}>{s.stats.bestDistance}m</strong></div>
            </div>

            <div style={ST.upgradeBox}>
              <h2 style={ST.h2}>Upgrades</h2>
              {upgrades.map(u => (
                <button key={u.key} style={{...ST.upBtn, opacity:s.coins<u.cost?0.45:1}} disabled={s.coins<u.cost} onClick={()=>buyUpgrade(u.key)}>
                  <div style={ST.upIcon}>{u.icon}</div>
                  <div style={ST.upInfo}>
                    <strong style={ST.upName}>{u.name}</strong>
                    <span style={ST.upDesc}>{u.desc}</span>
                    <span style={ST.upLv}>Lv {u.lv}</span>
                  </div>
                  <div style={ST.upCost}><span>🪙</span><b style={{fontSize:15}}>{u.cost}</b></div>
                </button>
              ))}
            </div>

            <div style={ST.helpBox}>
              <h2 style={ST.h2}>Controls</h2>
              <p style={ST.helpP}>Drag / swipe to steer</p>
              <p style={ST.helpP}>A / D or ← → arrow keys</p>
              <p style={ST.helpP}>🟢 Gates grow mob · 🔴 Shrink it</p>
              <p style={ST.helpP}>Infinite run — beat your distance!</p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

// ── Inline styles ────────────────────────────────────────────────────────
const ST = {
  page: { minHeight:"100vh", width:"100%", padding:24, boxSizing:"border-box",
    background:"linear-gradient(135deg,#060c1e 0%,#0d1830 50%,#0a1228 100%)",
    color:"#e0eaff", fontFamily:"'Segoe UI',Arial,sans-serif" },
  shell: { maxWidth:1320, margin:"0 auto" },
  header: { display:"flex", alignItems:"center", justifyContent:"space-between", gap:20, marginBottom:18 },
  titleRow: { display:"flex", alignItems:"center", gap:10 },
  emoji: { fontSize:36 },
  title: { margin:0, fontSize:44, fontWeight:950, letterSpacing:"-2px",
    background:"linear-gradient(135deg,#00d4ff,#aa00ff,#ff2266)",
    WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" },
  sub: { margin:"5px 0 0", color:"rgba(180,215,255,0.7)", fontSize:14, fontWeight:700 },
  hBtns: { display:"flex", gap:10 },
  btn: { border:0, borderRadius:16, padding:"12px 20px", fontWeight:900, fontSize:14, cursor:"pointer" },
  btnP: { background:"linear-gradient(135deg,#0077ff,#00d4ff)", color:"#fff", boxShadow:"0 8px 24px rgba(0,120,255,0.35)" },
  btnS: { background:"rgba(255,255,255,0.08)", color:"rgba(220,235,255,0.85)", border:"1px solid rgba(120,170,255,0.22)" },
  main: { display:"grid", gridTemplateColumns:"minmax(0,1fr) 300px", gap:18, alignItems:"start" },
  canvasWrap: { background:"rgba(0,0,0,0.35)", border:"1px solid rgba(80,140,255,0.22)",
    boxShadow:"0 24px 70px rgba(0,20,80,0.6)", borderRadius:26, padding:10, overflow:"hidden" },
  canvas: { width:"100%", display:"block", borderRadius:18, touchAction:"none", cursor:"grab" },
  panel: { display:"flex", flexDirection:"column", gap:12 },
  statCard: { background:"rgba(14,25,58,0.92)", border:"1px solid rgba(80,140,255,0.22)",
    borderRadius:22, padding:18, boxShadow:"0 14px 38px rgba(0,15,60,0.4)" },
  statGrid: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 },
  statSmall: { background:"rgba(14,25,58,0.92)", border:"1px solid rgba(80,140,255,0.22)",
    borderRadius:22, padding:14 },
  statLbl: { display:"block", color:"rgba(180,215,255,0.65)", fontSize:11, fontWeight:900, textTransform:"uppercase", letterSpacing:"0.6px" },
  statBig: { display:"block", marginTop:5, fontSize:40, fontWeight:950, color:"#ffd43b", lineHeight:1 },
  statMid: { display:"block", marginTop:5, fontSize:24, fontWeight:950, color:"#fff" },
  upgradeBox: { background:"rgba(14,25,58,0.92)", border:"1px solid rgba(80,140,255,0.22)",
    borderRadius:22, padding:16 },
  h2: { margin:"0 0 12px", color:"#fff", fontSize:18, fontWeight:950 },
  upBtn: { width:"100%", border:"1px solid rgba(80,140,255,0.18)",
    background:"rgba(22,40,90,0.95)", borderRadius:16, padding:"11px 12px", marginBottom:9,
    color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", gap:10, textAlign:"left" },
  upIcon: { flexShrink:0, width:38, height:38, display:"grid", placeItems:"center",
    borderRadius:12, background:"rgba(0,200,255,0.1)", border:"1px solid rgba(0,200,255,0.18)", fontSize:20 },
  upInfo: { flex:1, display:"flex", flexDirection:"column", gap:2 },
  upName: { color:"#fff", fontSize:13, fontWeight:900 },
  upDesc: { color:"rgba(180,215,255,0.65)", fontSize:11, fontWeight:700 },
  upLv: { display:"inline-block", marginTop:5, background:"rgba(0,200,255,0.13)", color:"#78e7ff",
    fontSize:10, fontWeight:900, borderRadius:99, padding:"2px 7px" },
  upCost: { flexShrink:0, display:"flex", flexDirection:"column", alignItems:"center",
    gap:1, minWidth:44, padding:"7px 8px", borderRadius:12,
    background:"rgba(255,210,59,0.12)", color:"#ffd43b" },
  helpBox: { background:"rgba(14,25,58,0.92)", border:"1px solid rgba(80,140,255,0.22)",
    borderRadius:22, padding:16 },
  helpP: { margin:"7px 0 0", color:"rgba(180,215,255,0.65)", fontWeight:700, fontSize:13, lineHeight:1.4 },
};