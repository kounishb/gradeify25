import React, { useEffect, useMemo, useRef, useState } from "react";
import "../../styles/TowerDefenseGame.css";

const CANVAS_WIDTH = 980;
const CANVAS_HEIGHT = 560;
const MAX_TOWER_LEVEL = 5;

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
    icon: "💣",
    cost: 100,
    damage: 20,
    range: 112,
    fireRate: 680,
    description: "Balanced starter tower",
    upgradeText: [
      "Standard cannon shots.",
      "Ricochet cannonballs occasionally chip nearby enemies.",
      "Double cannon unlocked.",
      "Armor breaker against tanks plus shrapnel splash.",
      "Siege quake: cannon hits briefly stun clustered enemies.",
    ],
  },
  freeze: {
    name: "Frost",
    icon: "❄️",
    cost: 105,
    damage: 6,
    range: 105,
    fireRate: 920,
    slowAmount: 0.48,
    slowDuration: 950,
    description: "Slows enemies",
    upgradeText: [
      "Slows one enemy.",
      "Brittle ice: frozen enemies take extra damage.",
      "Freeze splash unlocked.",
      "Deep freeze slows harder and lasts longer.",
      "Ice prison: freeze blasts can briefly lock enemies in place.",
    ],
  },
  splash: {
    name: "Mortar",
    icon: "💥",
    cost: 175,
    damage: 13,
    range: 118,
    fireRate: 1120,
    splashRadius: 68,
    description: "Area damage",
    upgradeText: [
      "Large arcing explosion.",
      "Craters slow enemies after impact.",
      "Burn damage unlocked.",
      "Heavy shell explosion with bigger burn zones.",
      "Cluster barrage: shells split into mini-bombs after impact.",
    ],
  },
  sniper: {
    name: "Sniper",
    icon: "🎯",
    cost: 260,
    damage: 70,
    range: 260,
    fireRate: 1600,
    description: "Long range, high damage",
    upgradeText: [
      "Long range single shot.",
      "Ricochet rounds bounce to a second target.",
      "Tank piercer unlocked.",
      "Executes weak enemies.",
      "Marked shot: high-value kills pay bonus coins and pierce farther.",
    ],
  },
  rapid: {
    name: "Rapid",
    icon: "⚡",
    cost: 155,
    damage: 7,
    range: 102,
    fireRate: 255,
    description: "Fast low-damage shots",
    upgradeText: [
      "Very fast shots.",
      "Overdrive: firing at enemies ramps attack speed temporarily.",
      "Double shot unlocked.",
      "Triple shot unlocked.",
      "Bullet storm: every few volleys sprays extra shots at nearby enemies.",
    ],
  },
  laser: {
    name: "Laser",
    icon: "🔮",
    cost: 300,
    damage: 64,
    range: 150,
    fireRate: 0,
    description: "Continuous beam damage",
    upgradeText: [
      "Continuous beam damage.",
      "Melt armor: beam targets become vulnerable to all damage.",
      "Chain beam unlocked.",
      "Stronger chain beam.",
      "Prism nova: periodically bursts beams into nearby enemies.",
    ],
  },
  support: {
    name: "Beacon",
    icon: "📡",
    cost: 230,
    damage: 0,
    range: 132,
    fireRate: 0,
    isSupport: true,
    buffDamage: 1.16,
    buffRange: 1.08,
    buffFireRate: 0.9,
    description: "Buffs nearby towers",
    upgradeText: [
      "Nearby towers get damage, range, and attack speed buffs.",
      "Stronger buff aura.",
      "Command pulse: periodically overclocks nearby towers.",
      "Max aura: major range, damage, and speed boosts.",
      "Battle network: boosted towers gain even faster cooldowns during waves.",
    ],
  },
  nuke: {
    name: "Nuke",
    icon: "☢️",
    cost: 600,
    damage: 235,
    range: 9999,
    fireRate: 0,
    isConsumable: true,
    description: "One-time global blast",
    upgradeText: ["Drop once to damage every enemy on the map."],
  },
  chain: {
    name: "Damian",
    icon: "🧨",
    cost: 250,
    damage: 28,
    range: 128,
    fireRate: 1220,
    knockback: 18,
    explodeDelay: 720,
    explosionRadius: 60,
    chainDamage: 25,
    superEvery: 20,
    superRadius: 300,
    superPull: 0.42,
    superDuration: 1150,
    description: "Every third hit chains explosions; every tenth shot groups enemies",
    upgradeText: [
      "Every 3rd shot marks enemies to explode. Every 20th shot pulls enemies together.",
      "Bigger chain blast, stronger knockback, and stronger pull.",
      "Faster reload, larger chain radius, and longer pull duration.",
      "Chain reactions re-prime faster inside packed groups.",
      "Infinite fuse: chain blasts re-mark nearby enemies with stronger repeat explosions.",
    ],
  },
};

function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function angleTo(a, b) { return Math.atan2(b.y - a.y, b.x - a.x); }

function pointToSegmentDistance(point, start, end) {
  const dx = end.x - start.x, dy = end.y - start.y;
  if (dx === 0 && dy === 0) return distance(point, start);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function isTooCloseToPath(point) {
  for (let i = 0; i < PATH.length - 1; i++) {
    if (pointToSegmentDistance(point, PATH[i], PATH[i + 1]) < 48) return true;
  }
  return false;
}

function shuffleArray(arr) { return [...arr].sort(() => Math.random() - 0.5); }

function makeEnemy(wave, index) {
  const isTank = wave % 4 === 0 && index % 4 === 0;
  const isFast = wave % 3 === 0 && index % 3 === 0;
  const isShielded = wave >= 5 && index % 5 === 0;
  const isBoss = wave % 7 === 0 && index === 0;
  const hpMultiplier = 1 + wave * 0.2;
  const maxHp = isBoss ? 390 * hpMultiplier : isTank ? 142 * hpMultiplier : isShielded ? 88 * hpMultiplier : 62 * hpMultiplier;
  return {
    id: `enemy-${Date.now()}-${Math.random()}`,
    x: PATH[0].x, y: PATH[0].y,
    pathIndex: 0, progress: 0,
    radius: isBoss ? 24 : isTank ? 18 : isFast ? 12 : 14,
    maxHp, hp: maxHp,
    speed: isBoss ? 0.72 + wave * 0.015 : isFast ? 1.85 + wave * 0.045 : isTank ? 0.88 + wave * 0.026 : 1.12 + wave * 0.038,
    reward: isBoss ? 48 : isTank ? 17 : isFast ? 10 : isShielded ? 13 : 8,
    type: isBoss ? "boss" : isTank ? "tank" : isFast ? "fast" : isShielded ? "shield" : "normal",
    slowUntil: 0, slowAmount: 1, burnUntil: 0, burnDps: 0, brittleUntil: 0, brittleMultiplier: 1, stunUntil: 0, reachedBase: false,
  };
}

function buildChoices(currentQuestion, allQuestions) {
  if (Array.isArray(currentQuestion.choices) && currentQuestion.choices.length >= 2) {
    const choices = [...currentQuestion.choices];
    if (!choices.includes(currentQuestion.correctAnswer)) choices.push(currentQuestion.correctAnswer);
    return shuffleArray([...new Set(choices)]).slice(0, 4);
  }
  const wrongAnswers = allQuestions.filter(q => q.correctAnswer !== currentQuestion.correctAnswer).map(q => q.correctAnswer).filter(Boolean);
  const choices = shuffleArray([...new Set(wrongAnswers)]).slice(0, 3);
  while (choices.length < 3) choices.push(`Option ${choices.length + 1}`);
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
    ricochet: 0,
    bountyBonus: 0,
    brittleMultiplier: 1,
    brittleDuration: 0,
    stunDuration: 0,
    craterSlowAmount: 1,
    craterSlowDuration: 0,
    clusterBombs: 0,
    shrapnelRadius: 0,
    shrapnelDamage: 0,
    rampMax: 0,
    stormEvery: 0,
    stormShots: 0,
    meltMultiplier: 1,
    meltDuration: 0,
    prismNovaEvery: 0,
    prismNovaRadius: 0,
    prismNovaDamage: 0,
    buffDamage: base.buffDamage || 1,
    buffRange: base.buffRange || 1,
    buffFireRate: base.buffFireRate || 1,
    commandPulseEvery: 0,
    commandPulseDuration: 0,
    networkFireRateBonus: 1,
    knockback: base.knockback || 0,
    explodeDelay: base.explodeDelay || 0,
    explosionRadius: base.explosionRadius || 0,
    chainDamage: base.chainDamage || 0,
    superEvery: base.superEvery || 0,
    superRadius: base.superRadius || 0,
    superPull: base.superPull || 0,
    superDuration: base.superDuration || 0,
  };

  if (tower.type === "basic") {
    if (level >= 2) stats.ricochet = 1;
    if (level >= 3) stats.multiShot = 2;
    if (level >= 4) { stats.tankPierce = true; stats.shrapnelRadius = 46; stats.shrapnelDamage = stats.damage * 0.32; }
    if (level >= 5) { stats.stunDuration = 360; stats.shrapnelRadius = 70; stats.shrapnelDamage = stats.damage * 0.45; }
  }

  if (tower.type === "freeze") {
    stats.slowDuration = base.slowDuration + (level - 1) * 360;
    stats.slowAmount = Math.max(0.28, base.slowAmount - (level - 1) * 0.055);
    if (level >= 2) { stats.brittleMultiplier = 1.18 + (level - 2) * 0.06; stats.brittleDuration = 1200 + level * 160; }
    if (level >= 3) stats.splashRadius = 42;
    if (level >= 4) stats.splashRadius = 60;
    if (level >= 5) { stats.splashRadius = 82; stats.stunDuration = 520; stats.slowAmount = 0.22; }
  }

  if (tower.type === "splash") {
    stats.range = base.range + (level - 1) * 14;
    stats.splashRadius = base.splashRadius + (level - 1) * 18;
    if (level >= 2) { stats.craterSlowAmount = 0.66; stats.craterSlowDuration = 900 + level * 120; }
    if (level >= 3) { stats.burnDps = 7 + level * 2; stats.burnDuration = 1500 + level * 350; }
    if (level >= 4) { stats.splashRadius += 12; stats.burnDps += 7; }
    if (level >= 5) { stats.clusterBombs = 4; stats.splashRadius += 16; }
  }

  if (tower.type === "sniper") {
    stats.range = base.range + (level - 1) * 22;
    stats.fireRate = Math.max(760, base.fireRate - (level - 1) * 120);
    if (level >= 2) stats.ricochet = 1;
    if (level >= 3) stats.tankPierce = true;
    if (level >= 4) stats.execute = true;
    if (level >= 5) { stats.ricochet = 2; stats.bountyBonus = 10; stats.damage *= 1.2; }
  }

  if (tower.type === "rapid") {
    stats.fireRate = Math.max(105, base.fireRate - (level - 1) * 30);
    if (level >= 2) stats.rampMax = 0.36;
    if (level >= 3) stats.multiShot = 2;
    if (level >= 4) stats.multiShot = 3;
    if (level >= 5) { stats.stormEvery = 7; stats.stormShots = 5; stats.fireRate = Math.max(82, stats.fireRate - 20); }
  }

  if (tower.type === "laser") {
    stats.range = base.range + (level - 1) * 18;
    stats.damage = base.damage * (1 + (level - 1) * 0.32);
    stats.chain = level >= 3 ? level - 2 : 0;
    stats.fireRate = 0;
    if (level >= 2) { stats.meltMultiplier = 1.16 + (level - 2) * 0.04; stats.meltDuration = 1000 + level * 160; }
    if (level >= 5) { stats.prismNovaEvery = 1350; stats.prismNovaRadius = 122; stats.prismNovaDamage = stats.damage * 0.9; stats.chain = 3; }
  }

  if (tower.type === "support") {
    stats.range = base.range + (level - 1) * 24;
    stats.damage = 0;
    stats.fireRate = 0;
    stats.buffDamage = base.buffDamage + (level - 1) * 0.07;
    stats.buffRange = base.buffRange + (level - 1) * 0.035;
    stats.buffFireRate = Math.max(0.72, base.buffFireRate - (level - 1) * 0.045);
    if (level >= 3) { stats.commandPulseEvery = 2300; stats.commandPulseDuration = 900 + level * 120; }
    if (level >= 5) stats.networkFireRateBonus = 0.88;
  }

  if (tower.type === "chain") {
    stats.range = base.range + (level - 1) * 13;
    stats.damage = base.damage * (1 + (level - 1) * 0.34);
    stats.fireRate = Math.max(760, base.fireRate - (level - 1) * 105);
    stats.knockback = base.knockback + (level - 1) * 5;
    stats.explodeDelay = Math.max(390, base.explodeDelay - (level - 1) * 65);
    stats.explosionRadius = base.explosionRadius + (level - 1) * 12;
    stats.chainDamage = base.chainDamage * (1 + (level - 1) * 0.3);
    stats.superPull = base.superPull + (level - 1) * 0.08;
    stats.superDuration = base.superDuration + (level - 1) * 140;
    if (level >= 4) stats.chainDamage *= 1.12;
    if (level >= 5) { stats.explosionRadius += 18; stats.chainDamage *= 1.25; stats.superPull += 0.16; }
  }

  return stats;
}

function getUpgradeCost(tower) {
  if (!tower || tower.level >= MAX_TOWER_LEVEL) return null;
  return Math.round(TOWER_TYPES[tower.type].cost * 0.95 + tower.level * 75);
}

// ─── DRAW HELPERS ────────────────────────────────────────────────────────────

function drawRoundedRect(ctx, x, y, w, h, r, fill, stroke, strokeWidth = 1) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = strokeWidth; ctx.stroke(); }
}

// Draw a stone/brick tower base — used by all towers
function drawTowerBase(ctx, x, y, w, h, color1, color2, borderColor) {
  // Shadow
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(x, y + h / 2 + 4, w * 0.52, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Main stone block
  const g = ctx.createLinearGradient(x - w / 2, y - h / 2, x + w / 2, y + h / 2);
  g.addColorStop(0, color1);
  g.addColorStop(1, color2);
  ctx.fillStyle = g;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, 5);
  ctx.fill();
  ctx.stroke();

  // Brick lines
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = 1;
  const brickH = h / 3;
  for (let i = 1; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y - h / 2 + i * brickH);
    ctx.lineTo(x + w / 2, y - h / 2 + i * brickH);
    ctx.stroke();
  }
  // vertical offsets per row
  for (let i = 0; i < 3; i++) {
    const offset = i % 2 === 0 ? 0 : w / 4;
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + w / 4 + offset, y - h / 2 + i * brickH);
    ctx.lineTo(x - w / 2 + w / 4 + offset, y - h / 2 + (i + 1) * brickH);
    ctx.stroke();
  }

  // Top highlight
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.roundRect(x - w / 2 + 2, y - h / 2 + 2, w - 4, 5, 3);
  ctx.fill();

  ctx.restore();
}

// Draw a wooden platform/deck on top of base
function drawWoodDeck(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(x - w / 2, y - h / 2, x - w / 2, y + h / 2);
  g.addColorStop(0, "#c8882a");
  g.addColorStop(1, "#8b5a1a");
  ctx.fillStyle = g;
  ctx.strokeStyle = "#5c3810";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, 3);
  ctx.fill();
  ctx.stroke();
  // planks
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 1;
  const pw = w / 4;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + i * pw, y - h / 2);
    ctx.lineTo(x - w / 2 + i * pw, y + h / 2);
    ctx.stroke();
  }
}

// Draw crenellations (battlements) on top of a tower
function drawBattlements(ctx, x, y, totalW, merlonW, merlonH, color, borderColor) {
  const gap = merlonW * 0.6;
  const count = Math.floor(totalW / (merlonW + gap));
  const startX = x - ((count * (merlonW + gap) - gap) / 2);
  for (let i = 0; i < count; i++) {
    const bx = startX + i * (merlonW + gap);
    drawRoundedRect(ctx, bx, y - merlonH, merlonW, merlonH, [2, 2, 0, 0], color, borderColor, 1.5);
  }
}

// Draw a cannon barrel with perspective
function drawCannon(ctx, x, y, angle, length, radius, color, highlight) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  // barrel shadow
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(length * 0.5, radius * 0.6, length * 0.5, radius * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // main barrel
  const bg = ctx.createLinearGradient(0, -radius, 0, radius);
  bg.addColorStop(0, highlight);
  bg.addColorStop(0.4, color);
  bg.addColorStop(1, darken(color, 40));
  ctx.fillStyle = bg;
  ctx.strokeStyle = darken(color, 50);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(0, -radius, length, radius * 2, radius);
  ctx.fill();
  ctx.stroke();
  // muzzle ring
  ctx.fillStyle = darken(color, 20);
  ctx.strokeStyle = darken(color, 50);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(length, 0, radius * 1.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// Draw a leaf/plant tuft for decoration
function drawLeafTuft(ctx, x, y, size, color) {
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const lx = x + Math.cos(a) * size * 0.5;
    const ly = y + Math.sin(a) * size * 0.5;
    ctx.beginPath();
    ctx.ellipse(lx, ly, size * 0.4, size * 0.25, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function darken(hex, amt) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const n = parseInt(c, 16);
  const r = Math.max(0, (n >> 16) - amt);
  const g = Math.max(0, ((n >> 8) & 0xff) - amt);
  const b = Math.max(0, (n & 0xff) - amt);
  return `rgb(${r},${g},${b})`;
}
function lighten(hex, amt) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const n = parseInt(c, 16);
  const r = Math.min(255, (n >> 16) + amt);
  const g = Math.min(255, ((n >> 8) & 0xff) + amt);
  const b = Math.min(255, (n & 0xff) + amt);
  return `rgb(${r},${g},${b})`;
}

// ─── TOWER SPRITE DRAWERS ────────────────────────────────────────────────────

function drawCannonTower(ctx, tower) {
  const { x, y, level, angle } = tower;
  const lv = level || 1;

  // Base: stone tower
  const baseH = 28 + lv * 2;
  const baseW = 34 + lv * 2;
  drawTowerBase(ctx, x, y + 8, baseW, baseH, "#b0bec5", "#78909c", "#546e7a");

  // Level 3+: add a second tier
  if (lv >= 3) {
    drawTowerBase(ctx, x, y - 4, baseW - 8, 16, "#90a4ae", "#607d8b", "#455a64");
  }

  // Battlements
  const bY = y + 8 - baseH / 2;
  drawBattlements(ctx, x, bY, baseW, 7, 8, "#b0bec5", "#546e7a");
  if (lv >= 3) drawBattlements(ctx, x, bY - 16, baseW - 8, 6, 7, "#90a4ae", "#455a64");

  // Cannon wheel (level 2+)
  if (lv >= 2) {
    ctx.fillStyle = "#5d4037";
    ctx.strokeStyle = "#3e2723";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x - 2, y + 14, 9 + lv, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Spokes
    ctx.strokeStyle = "#8d6e63";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x - 2, y + 14);
      ctx.lineTo(x - 2 + Math.cos(a) * (9 + lv), y + 14 + Math.sin(a) * (9 + lv));
      ctx.stroke();
    }
    ctx.fillStyle = "#a1887f";
    ctx.beginPath();
    ctx.arc(x - 2, y + 14, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Cannon barrels
  if (lv >= 3) {
    // Double cannon
    drawCannon(ctx, x, y - 4, angle - 0.18, 26 + lv * 3, 5, "#37474f", "#78909c");
    drawCannon(ctx, x, y - 4, angle + 0.18, 26 + lv * 3, 5, "#37474f", "#78909c");
  } else {
    drawCannon(ctx, x, y - 2, angle, 28 + lv * 4, 6 + lv, "#37474f", "#78909c");
  }

  // Cannonball stockpile
  ctx.fillStyle = "#212121";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 1;
  [[x + 12, y + 16], [x + 16, y + 13], [x + 14, y + 19]].slice(0, lv).forEach(([bx, by]) => {
    ctx.beginPath();
    ctx.arc(bx, by, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  // Level 4: gold band
  if (lv >= 4) {
    ctx.fillStyle = "#f4b942";
    ctx.strokeStyle = "#c8862a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x - baseW / 2, y + 8 - baseH / 2 + 8, baseW, 5, 2);
    ctx.fill();
    ctx.stroke();
  }
}

function drawFrostTower(ctx, tower) {
  const { x, y, level, angle } = tower;
  const lv = level || 1;

  // Ice crystal base — blue-tinted stone
  const baseH = 26 + lv * 2;
  const baseW = 32 + lv * 2;
  drawTowerBase(ctx, x, y + 8, baseW, baseH, "#b3e5fc", "#4fc3f7", "#0288d1");

  if (lv >= 3) drawTowerBase(ctx, x, y - 4, baseW - 6, 14, "#e1f5fe", "#81d4fa", "#0277bd");

  // Icy battlements with pointed tops
  const bY = y + 8 - baseH / 2;
  ctx.fillStyle = "#e1f5fe";
  ctx.strokeStyle = "#0288d1";
  ctx.lineWidth = 1.5;
  const iceW = baseW;
  for (let i = 0; i < 4; i++) {
    const ix = x - iceW / 2 + 4 + i * (iceW / 4);
    ctx.beginPath();
    ctx.moveTo(ix, bY);
    ctx.lineTo(ix - 4, bY + 9);
    ctx.lineTo(ix + 4, bY + 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Central crystal orb
  const orbR = 9 + lv * 1.5;
  const orbG = ctx.createRadialGradient(x - 2, y - orbR * 0.3, 2, x, y, orbR);
  orbG.addColorStop(0, "#e1f5fe");
  orbG.addColorStop(0.5, "#29b6f6");
  orbG.addColorStop(1, "#01579b");
  ctx.fillStyle = orbG;
  ctx.shadowColor = "#29b6f6";
  ctx.shadowBlur = 12 + lv * 2;
  ctx.beginPath();
  ctx.arc(x, y, orbR, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#e1f5fe";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Snowflake / crystal arms radiating from orb
  const arms = lv >= 3 ? 8 : 6;
  ctx.strokeStyle = "rgba(225,245,254,0.7)";
  ctx.lineWidth = lv >= 4 ? 2 : 1.5;
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2 + (angle || 0);
    const len = orbR + 6 + lv * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
    // Small crossbars
    const mx = x + Math.cos(a) * len * 0.6;
    const my = y + Math.sin(a) * len * 0.6;
    ctx.beginPath();
    ctx.moveTo(mx + Math.cos(a + Math.PI / 2) * 5, my + Math.sin(a + Math.PI / 2) * 5);
    ctx.lineTo(mx + Math.cos(a - Math.PI / 2) * 5, my + Math.sin(a - Math.PI / 2) * 5);
    ctx.stroke();
  }

  // Level 4: ice spike crown
  if (lv >= 4) {
    ctx.fillStyle = "#b3e5fc";
    ctx.strokeStyle = "#0288d1";
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const ix = x + Math.cos(a) * (orbR + 10);
      const iy = y + Math.sin(a) * (orbR + 10);
      ctx.beginPath();
      ctx.moveTo(ix, iy);
      ctx.lineTo(ix - 4, iy + 8);
      ctx.lineTo(ix + 4, iy + 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
}

function drawMortarTower(ctx, tower) {
  const { x, y, level, angle } = tower;
  const lv = level || 1;

  // Wide heavy stone base
  const baseH = 30 + lv * 2;
  const baseW = 38 + lv * 3;
  drawTowerBase(ctx, x, y + 10, baseW, baseH, "#8d6e63", "#5d4037", "#3e2723");

  if (lv >= 2) {
    drawTowerBase(ctx, x, y - 2, baseW - 6, 18, "#795548", "#4e342e", "#3e2723");
  }

  // Battlements (heavy)
  const bY = y + 10 - baseH / 2;
  drawBattlements(ctx, x, bY, baseW, 9, 10, "#8d6e63", "#3e2723");
  if (lv >= 2) drawBattlements(ctx, x, bY - 18, baseW - 6, 8, 9, "#795548", "#3e2723");

  // Mortar tube pointing up at angle
  ctx.save();
  ctx.translate(x, y - 4);
  ctx.rotate(angle - Math.PI / 2 + 0.6);
  // Tube body
  const tg = ctx.createLinearGradient(-6, 0, 6, 0);
  tg.addColorStop(0, "#4a4a4a");
  tg.addColorStop(0.4, "#757575");
  tg.addColorStop(1, "#212121");
  ctx.fillStyle = tg;
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-7, -28 - lv * 3, 14, 28 + lv * 3, [5, 5, 0, 0]);
  ctx.fill();
  ctx.stroke();
  // Muzzle flash ring
  ctx.fillStyle = "#f4b942";
  ctx.beginPath();
  ctx.arc(0, -28 - lv * 3, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Mounting ring
  const rg = ctx.createRadialGradient(x - 2, y - 6, 2, x, y - 4, 11 + lv);
  rg.addColorStop(0, "#757575");
  rg.addColorStop(1, "#37474f");
  ctx.fillStyle = rg;
  ctx.strokeStyle = "#212121";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y - 4, 11 + lv, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Level 3+: flame vent decoration
  if (lv >= 3) {
    ctx.fillStyle = "#ff7043";
    ctx.shadowColor = "#ff5722";
    ctx.shadowBlur = 8;
    [[x - 14, y + 6], [x + 14, y + 6]].forEach(([fx, fy]) => {
      ctx.beginPath();
      ctx.moveTo(fx, fy + 8);
      ctx.lineTo(fx - 5, fy);
      ctx.lineTo(fx, fy - 6);
      ctx.lineTo(fx + 5, fy);
      ctx.closePath();
      ctx.fill();
    });
    ctx.shadowBlur = 0;
  }

  // Level 4: golden band
  if (lv >= 4) {
    ctx.fillStyle = "#f4b942";
    ctx.strokeStyle = "#c8862a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x - baseW / 2, y + 10 - baseH / 2 + 8, baseW, 6, 2);
    ctx.fill();
    ctx.stroke();
  }
}

function drawSniperTower(ctx, tower) {
  const { x, y, level, angle } = tower;
  const lv = level || 1;

  // Tall dark stone tower
  const baseH = 34 + lv * 3;
  const baseW = 28 + lv;
  drawTowerBase(ctx, x, y + 6, baseW, baseH, "#455a64", "#263238", "#1a2327");
  if (lv >= 2) drawTowerBase(ctx, x, y - 10, baseW - 4, 16, "#546e7a", "#37474f", "#263238");

  // Narrow crenellations
  const bY = y + 6 - baseH / 2;
  drawBattlements(ctx, x, bY, baseW, 5, 10, "#455a64", "#263238");
  if (lv >= 2) drawBattlements(ctx, x, bY - 16, baseW - 4, 5, 8, "#546e7a", "#37474f");

  // Scope/eye window
  ctx.fillStyle = "#1a1a2e";
  ctx.strokeStyle = "#f4b942";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(x, y - 2, 7 + lv, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Crosshair
  ctx.strokeStyle = "rgba(244,185,66,0.7)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 6 - lv, y - 2); ctx.lineTo(x + 6 + lv, y - 2);
  ctx.moveTo(x, y - 4 - lv); ctx.lineTo(x, y + 4 + lv);
  ctx.stroke();

  // Long rifle barrel
  const barrelLen = 42 + lv * 8;
  ctx.save();
  ctx.translate(x, y - 4);
  ctx.rotate(angle);
  // Suppressor / scope on top
  if (lv >= 2) {
    ctx.fillStyle = "#37474f";
    ctx.strokeStyle = "#263238";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(8, -8, 16, 4, 2);
    ctx.fill();
    ctx.stroke();
    // scope lens
    ctx.fillStyle = "#7986cb";
    ctx.shadowColor = "#7986cb";
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.arc(22, -6, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  // Barrel
  const barG = ctx.createLinearGradient(0, -5, 0, 5);
  barG.addColorStop(0, "#607d8b");
  barG.addColorStop(0.5, "#37474f");
  barG.addColorStop(1, "#1a2327");
  ctx.fillStyle = barG;
  ctx.strokeStyle = "#1a2327";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(0, -4, barrelLen, 8, 3);
  ctx.fill();
  ctx.stroke();
  // Muzzle
  ctx.fillStyle = "#f4b942";
  ctx.beginPath();
  ctx.arc(barrelLen, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Level 4: golden decorations
  if (lv >= 4) {
    ctx.fillStyle = "#f4b942";
    ctx.strokeStyle = "#c8862a";
    ctx.lineWidth = 1;
    [y + 6 - baseH / 2 + 6, y + 6 - baseH / 2 + 18].forEach(ly => {
      ctx.beginPath();
      ctx.roundRect(x - baseW / 2, ly, baseW, 4, 1);
      ctx.fill();
      ctx.stroke();
    });
  }
}

function drawRapidTower(ctx, tower) {
  const { x, y, level, angle } = tower;
  const lv = level || 1;

  // Short wide wooden fort
  const baseH = 24 + lv * 2;
  const baseW = 36 + lv * 2;

  // Wooden base instead of stone for variety
  ctx.save();
  const wg = ctx.createLinearGradient(x - baseW / 2, y, x + baseW / 2, y + baseH / 2);
  wg.addColorStop(0, "#a1887f");
  wg.addColorStop(1, "#6d4c41");
  ctx.fillStyle = wg;
  ctx.strokeStyle = "#3e2723";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x - baseW / 2, y - baseH / 2 + 14, baseW, baseH, 4);
  ctx.fill();
  ctx.stroke();
  // Wood grain
  ctx.strokeStyle = "rgba(0,0,0,0.1)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(x - baseW / 2, y - baseH / 2 + 14 + i * (baseH / 4));
    ctx.lineTo(x + baseW / 2, y - baseH / 2 + 14 + i * (baseH / 4));
    ctx.stroke();
  }
  ctx.restore();

  // Raised turret platform
  drawWoodDeck(ctx, x, y + 2, baseW - 4, 12);

  // Gear/engine center
  const gearR = 9 + lv * 1.5;
  ctx.fillStyle = "#ff8f00";
  ctx.strokeStyle = "#e65100";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y - 4, gearR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Gear teeth
  ctx.fillStyle = "#ffb300";
  ctx.strokeStyle = "#e65100";
  ctx.lineWidth = 1;
  const teeth = 8;
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2 + (performance.now() * 0.003);
    ctx.save();
    ctx.translate(x + Math.cos(a) * gearR, y - 4 + Math.sin(a) * gearR);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.roundRect(-3, -3, 6, 6, 1);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  // Center hub
  ctx.fillStyle = "#ffe082";
  ctx.beginPath();
  ctx.arc(x, y - 4, 4, 0, Math.PI * 2);
  ctx.fill();

  // Multi-barrels based on level
  const numBarrels = lv >= 4 ? 3 : lv >= 3 ? 2 : 1;
  const spread = 0.22;
  for (let i = 0; i < numBarrels; i++) {
    const offset = (i - (numBarrels - 1) / 2) * spread;
    const bLen = 22 + lv * 3;
    ctx.save();
    ctx.translate(x, y - 4);
    ctx.rotate(angle + offset);
    const bg = ctx.createLinearGradient(0, -3, 0, 3);
    bg.addColorStop(0, "#ffcc02");
    bg.addColorStop(0.5, "#ff9800");
    bg.addColorStop(1, "#e65100");
    ctx.fillStyle = bg;
    ctx.strokeStyle = "#bf360c";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(0, -3, bLen, 6, 3);
    ctx.fill();
    ctx.stroke();
    // Flash ring at tip
    ctx.fillStyle = "#fff9c4";
    ctx.beginPath();
    ctx.arc(bLen, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Level 4: lightning bolt decals
  if (lv >= 4) {
    ctx.fillStyle = "#f4b942";
    ctx.shadowColor = "#f4b942";
    ctx.shadowBlur = 8;
    [[x - 14, y + 8], [x + 14, y + 8]].forEach(([lx, ly]) => {
      ctx.beginPath();
      ctx.moveTo(lx, ly - 8);
      ctx.lineTo(lx - 4, ly + 2);
      ctx.lineTo(lx + 1, ly + 2);
      ctx.lineTo(lx - 2, ly + 10);
      ctx.lineTo(lx + 5, ly - 1);
      ctx.lineTo(lx + 1, ly - 1);
      ctx.lineTo(lx + 4, ly - 8);
      ctx.closePath();
      ctx.fill();
    });
    ctx.shadowBlur = 0;
  }
}

function drawLaserTower(ctx, tower) {
  const { x, y, level, angle } = tower;
  const lv = level || 1;

  // Arcane stone tower
  const baseH = 30 + lv * 2;
  const baseW = 32 + lv;
  drawTowerBase(ctx, x, y + 8, baseW, baseH, "#9c27b0", "#4a148c", "#38006b");
  if (lv >= 2) drawTowerBase(ctx, x, y - 4, baseW - 6, 18, "#ab47bc", "#6a1b9a", "#4a148c");

  // Purple crystal battlements
  const bY = y + 8 - baseH / 2;
  ctx.fillStyle = "#ce93d8";
  ctx.strokeStyle = "#4a148c";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    const ix = x - baseW / 2 + 4 + i * (baseW / 4);
    ctx.beginPath();
    ctx.moveTo(ix, bY);
    ctx.lineTo(ix - 3, bY + 10);
    ctx.lineTo(ix + 3, bY + 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Energy orb
  const orbR = 10 + lv * 1.5;
  const og = ctx.createRadialGradient(x - 3, y - 5, 2, x, y, orbR);
  og.addColorStop(0, "#f3e5f5");
  og.addColorStop(0.4, "#e040fb");
  og.addColorStop(1, "#4a148c");
  ctx.fillStyle = og;
  ctx.shadowColor = "#e040fb";
  ctx.shadowBlur = 16 + lv * 3;
  ctx.beginPath();
  ctx.arc(x, y, orbR, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Rotating outer ring
  const ringAngle = performance.now() * 0.002;
  ctx.strokeStyle = "rgba(225,190,231,0.8)";
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 6]);
  ctx.lineDashOffset = -ringAngle * 20;
  ctx.beginPath();
  ctx.arc(x, y, orbR + 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Level 3+: satellite crystal arms
  if (lv >= 3) {
    const arms = lv >= 4 ? 4 : 3;
    for (let i = 0; i < arms; i++) {
      const a = (i / arms) * Math.PI * 2 + ringAngle;
      const cx2 = x + Math.cos(a) * (orbR + 14);
      const cy2 = y + Math.sin(a) * (orbR + 14);
      ctx.fillStyle = "#ce93d8";
      ctx.strokeStyle = "#4a148c";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx2, cy2 - 6);
      ctx.lineTo(cx2 - 4, cy2 + 4);
      ctx.lineTo(cx2 + 4, cy2 + 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Connector line
      ctx.strokeStyle = "rgba(206,147,216,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(cx2, cy2);
      ctx.stroke();
    }
  }

  // Barrel pointing at enemy
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const barG2 = ctx.createLinearGradient(0, -4, 0, 4);
  barG2.addColorStop(0, "#e040fb");
  barG2.addColorStop(0.5, "#7b1fa2");
  barG2.addColorStop(1, "#4a148c");
  ctx.fillStyle = barG2;
  ctx.strokeStyle = "#4a148c";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(orbR - 2, -4, 20 + lv * 3, 8, 4);
  ctx.fill();
  ctx.stroke();
  // Tip glow
  ctx.fillStyle = "#f3e5f5";
  ctx.shadowColor = "#e040fb";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(orbR + 18 + lv * 3, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}


function drawSupportTower(ctx, tower) {
  const { x, y, level } = tower;
  const lv = level || 1;
  const time = performance.now();

  const baseH = 28 + lv * 2;
  const baseW = 34 + lv * 2;
  drawTowerBase(ctx, x, y + 8, baseW, baseH, "#a5d6a7", "#43a047", "#1b5e20");
  if (lv >= 3) drawTowerBase(ctx, x, y - 4, baseW - 8, 16, "#c8e6c9", "#66bb6a", "#2e7d32");

  const deckY = y + 8 - baseH / 2;
  drawBattlements(ctx, x, deckY, baseW, 7, 8, "#81c784", "#2e7d32");
  drawWoodDeck(ctx, x, y + 4, baseW - 6, 10);

  // Radio mast
  ctx.strokeStyle = "#1b5e20";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y + 2);
  ctx.lineTo(x, y - 28 - lv * 3);
  ctx.stroke();

  // Dish facing upward/right
  ctx.save();
  ctx.translate(x, y - 22 - lv * 3);
  ctx.rotate(-0.65);
  const dishG = ctx.createLinearGradient(-12, -8, 12, 8);
  dishG.addColorStop(0, "#e8f5e9");
  dishG.addColorStop(0.5, "#66bb6a");
  dishG.addColorStop(1, "#1b5e20");
  ctx.fillStyle = dishG;
  ctx.strokeStyle = "#0f3d14";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, 15 + lv * 1.5, 8 + lv, 0, Math.PI * 0.12, Math.PI * 1.88);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#fffde7";
  ctx.shadowColor = "#d4ff7a";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(3, 0, 4 + lv * 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();

  // Pulsing buff rings
  for (let i = 0; i < 2; i++) {
    const p = ((time * 0.001 + i * 0.5) % 1);
    ctx.globalAlpha = 0.35 * (1 - p);
    ctx.strokeStyle = "#d4ff7a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y - 18 - lv * 2, 10 + p * (24 + lv * 4), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  if (lv >= 4) {
    ctx.fillStyle = "#f4b942";
    ctx.strokeStyle = "#c8862a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x - baseW / 2, y + 8 - baseH / 2 + 8, baseW, 6, 2);
    ctx.fill();
    ctx.stroke();
  }
}

function drawChainTower(ctx, tower) {
  const { x, y, level, angle } = tower;
  const lv = level || 1;

  const baseH = 28 + lv * 2;
  const baseW = 34 + lv * 2;
  drawTowerBase(ctx, x, y + 8, baseW, baseH, "#ffcc80", "#ef6c00", "#9c3d00");
  if (lv >= 2) drawTowerBase(ctx, x, y - 4, baseW - 8, 16, "#ffb74d", "#e65100", "#8a2f00");

  const bY = y + 8 - baseH / 2;
  drawBattlements(ctx, x, bY, baseW, 7, 8, "#ffa726", "#9c3d00");
  if (lv >= 2) drawBattlements(ctx, x, bY - 16, baseW - 8, 6, 7, "#ffb74d", "#8a2f00");

  // Volatile core
  const coreR = 9 + lv * 1.4;
  const cg = ctx.createRadialGradient(x - 2, y - 6, 2, x, y - 4, coreR);
  cg.addColorStop(0, "#fff9c4");
  cg.addColorStop(0.45, "#ff7043");
  cg.addColorStop(1, "#b71c1c");
  ctx.fillStyle = cg;
  ctx.shadowColor = "#ff5722";
  ctx.shadowBlur = 12 + lv * 2;
  ctx.beginPath();
  ctx.arc(x, y - 4, coreR, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#7f1d1d";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Launcher barrel
  ctx.save();
  ctx.translate(x, y - 4);
  ctx.rotate(angle);
  const barrelLen = 26 + lv * 5;
  const bg = ctx.createLinearGradient(0, -5, 0, 5);
  bg.addColorStop(0, "#ffecb3");
  bg.addColorStop(0.45, "#f4511e");
  bg.addColorStop(1, "#7f1d1d");
  ctx.fillStyle = bg;
  ctx.strokeStyle = "#5f1515";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(coreR - 2, -5, barrelLen, 10, 5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#212121";
  ctx.beginPath();
  ctx.arc(coreR + barrelLen - 1, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Fuse sparks
  ctx.fillStyle = "#fff176";
  ctx.shadowColor = "#ffeb3b";
  ctx.shadowBlur = 8;
  const sparks = lv >= 4 ? 5 : lv >= 3 ? 4 : 3;
  for (let i = 0; i < sparks; i++) {
    const a = (i / sparks) * Math.PI * 2 + performance.now() * 0.006;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * (coreR + 8), y - 4 + Math.sin(a) * (coreR + 8), 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────

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
  const [message, setMessage] = useState("Drag towers from the bottom bar onto the map. Answer questions to earn coins.");
  const [questionModal, setQuestionModal] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [streak, setStreak] = useState(0);
  const [answerFeedback, setAnswerFeedback] = useState(null);

  const selectedTower = useMemo(() => {
    const game = gameRef.current;
    if (!game || !selectedTowerId) return null;
    return game.towers.find(t => t.id === selectedTowerId) || null;
  }, [selectedTowerId, coins, wave, score]);

  const selectedTowerStats = selectedTower ? getTowerStats(selectedTower) : null;
  const selectedUpgradeCost = selectedTower ? getUpgradeCost(selectedTower) : null;

  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);
  useEffect(() => { selectedTowerIdRef.current = selectedTowerId; }, [selectedTowerId]);

  function clearAutoWaveTimer() {
    if (autoWaveTimeoutRef.current) { clearTimeout(autoWaveTimeoutRef.current); autoWaveTimeoutRef.current = null; }
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
    wasRunningBeforeQuestionRef.current = isRunningRef.current;
    clearAutoWaveTimer();
    setIsRunning(false);
    isRunningRef.current = false;
    const game = gameRef.current;
    if (game && !game.gameOver) setMessage("Question mode opened. Game paused.");
  }

  function resumeAfterQuestionIfNeeded() {
    const game = gameRef.current;
    if (!game || game.gameOver) return;
    if (wasRunningBeforeQuestionRef.current) {
      setIsRunning(true);
      isRunningRef.current = true;
      if (!game.waveInProgress && game.nextWaveReady) scheduleAutoWave(1200, `Wave ${game.wave} started automatically.`);
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
      inside: e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom,
    };
  }

  function canvasToPercent(point) {
    return { left: `${(point.x / CANVAS_WIDTH) * 100}%`, top: `${(point.y / CANVAS_HEIGHT) * 100}%` };
  }

  function canPlaceTower(point, type) {
    const game = gameRef.current;
    if (!game || !point?.inside) return false;
    if (game.coins < TOWER_TYPES[type].cost) return false;
    if (point.x < 28 || point.x > CANVAS_WIDTH - 28) return false;
    if (point.y < 28 || point.y > CANVAS_HEIGHT - 28) return false;
    if (TOWER_TYPES[type]?.isConsumable) return true;
    if (isTooCloseToPath(point)) return false;
    return !game.towers.some(t => distance(t, point) < 52);
  }

  function placeTower(type, point) {
    const game = gameRef.current;
    if (!game || !canPlaceTower(point, type)) return false;
    const towerType = TOWER_TYPES[type];
    if (towerType.isConsumable) {
      game.coins -= towerType.cost;
      detonateNuke(game, point);
      setSelectedTowerId(null);
      selectedTowerIdRef.current = null;
      syncStateFromRef();
      return true;
    }
    const newTower = {
      id: `tower-${Date.now()}-${Math.random()}`,
      x: point.x, y: point.y, type, level: 1,
      angle: -Math.PI / 2, lastShot: 0, lastPopup: 0, shotCount: 0,
      spent: towerType.cost, kills: 0,
      targetPriority: "first",
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
    const drag = { type, clientX: e.clientX, clientY: e.clientY, canvasPoint: point, valid: point ? canPlaceTower(point, type) : false };
    draggingRef.current = drag;
    setDraggingTower(drag);
  }

  useEffect(() => {
    function handlePointerMove(e) {
      const drag = draggingRef.current;
      if (!drag) return;
      const point = getCanvasPointFromEvent(e);
      const updatedDrag = { ...drag, clientX: e.clientX, clientY: e.clientY, canvasPoint: point, valid: point ? canPlaceTower(point, drag.type) : false };
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
      setTimeout(() => { ignoreNextClickRef.current = false; }, 0);
    }
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => { window.removeEventListener("pointermove", handlePointerMove); window.removeEventListener("pointerup", handlePointerUp); };
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
      if (!game || game.gameOver || game.waveInProgress || !isRunningRef.current) return;
      launchWave(game);
      setMessage(customMessage || `Wave ${game.wave} started automatically.`);
      syncStateFromRef();
    }, delayMs);
  }

  function resetGame() {
    clearAutoWaveTimer();
    const initialGame = {
      coins: 150, baseHealth: 18, wave: 1, score: 0, gameOver: false,
      towers: [], enemies: [], bullets: [], beams: [], explosions: [], vortices: [], damagePopups: [],
      waveInProgress: false, enemiesToSpawn: 0, enemiesSpawned: 0,
      lastSpawnTime: 0, nextWaveReady: true, lastFrame: performance.now(),
    };
    gameRef.current = initialGame;
    setCoins(150); setBaseHealth(18); setWave(1); setScore(0);
    setGameOver(false); setIsRunning(true); isRunningRef.current = true;
    wasRunningBeforeQuestionRef.current = true;
    setQuestionIndex(0); setStreak(0); setQuestionModal(null); setAnswerFeedback(null);
    setSelectedTowerId(null); selectedTowerIdRef.current = null;
    setMessage("Get ready. The first wave starts automatically.");
    scheduleAutoWave(1400, "Wave 1 started automatically.");
  }

  useEffect(() => { resetGame(); }, [studySet]);
  useEffect(() => { return () => { clearAutoWaveTimer(); if (animationRef.current) cancelAnimationFrame(animationRef.current); }; }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    function handleCanvasClick(e) {
      if (ignoreNextClickRef.current) return;
      const game = gameRef.current;
      if (!game || game.gameOver) return;
      const point = getCanvasPointFromEvent(e);
      if (!point) return;
      const clickedTower = [...game.towers].reverse().find(t => distance(t, point) <= 30);
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
      if (!game || !ctx) { animationRef.current = requestAnimationFrame(gameLoop); return; }
      const delta = Math.min(32, now - game.lastFrame);
      game.lastFrame = now;
      if (isRunningRef.current && !game.gameOver) updateGame(game, now, delta);
      else updateVisualEffectsOnly(game, delta);
      drawGame(ctx, game, now);
      animationRef.current = requestAnimationFrame(gameLoop);
    }
    animationRef.current = requestAnimationFrame(gameLoop);
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, []);

  // ─── GAME UPDATE LOGIC (unchanged) ───────────────────────────────────────

  function updateGame(game, now, delta) {
    if (game.waveInProgress && game.enemiesSpawned < game.enemiesToSpawn) {
      if (now - game.lastSpawnTime > Math.max(390, 690 - game.wave * 12)) {
        game.enemies.push(makeEnemy(game.wave, game.enemiesSpawned));
        game.enemiesSpawned += 1;
        game.lastSpawnTime = now;
      }
    }
    game.enemies.forEach(enemy => {
      if (enemy.burnUntil > now) enemy.hp -= enemy.burnDps * (delta / 1000);
      moveEnemy(enemy, delta, now);
    });
    updateVortices(game, now, delta);
    const reached = game.enemies.filter(e => e.reachedBase);
    if (reached.length > 0) {
      game.baseHealth -= reached.reduce((t, e) => t + (e.type === "boss" ? 3 : e.type === "tank" ? 2 : 1), 0);
      game.enemies = game.enemies.filter(e => !e.reachedBase);
      setBaseHealth(game.baseHealth);
    }
    if (game.baseHealth <= 0) {
      clearAutoWaveTimer();
      game.baseHealth = 0; game.gameOver = true;
      setGameOver(true); setIsRunning(false); isRunningRef.current = false;
      setMessage("Game over. Your base was destroyed.");
      return;
    }
    game.towers.forEach(tower => fireTower(game, tower, now, delta));
    updateBullets(game, now, delta);
    updateChainExplosions(game, now);
    updateBeamsExplosionsAndPopups(game, delta);
    removeDefeatedEnemies(game);
    if (game.waveInProgress && game.enemiesSpawned >= game.enemiesToSpawn && game.enemies.length === 0) {
      game.waveInProgress = false; game.nextWaveReady = true; game.wave += 1; game.coins += 28;
      setMessage(`Wave cleared. Bonus +28 coins. Next wave starts soon.`);
      syncStateFromRef();
      scheduleAutoWave(2700, `Wave ${game.wave} started automatically.`);
    }
  }

  function updateVisualEffectsOnly(game, delta) { updateBeamsExplosionsAndPopups(game, delta); }

  function moveEnemy(enemy, delta, now) {
    if (enemy.stunUntil && enemy.stunUntil > now) return;
    if (enemy.pathIndex >= PATH.length - 1) { enemy.reachedBase = true; return; }
    const current = PATH[enemy.pathIndex];
    const next = PATH[enemy.pathIndex + 1];
    const dx = next.x - enemy.x, dy = next.y - enemy.y;
    const dist = Math.hypot(dx, dy);
    const slowMultiplier = enemy.slowUntil > now ? enemy.slowAmount : 1;
    const movement = enemy.speed * slowMultiplier * (delta / 16);
    if (dist <= movement) {
      enemy.x = next.x; enemy.y = next.y; enemy.pathIndex += 1;
      if (enemy.pathIndex >= PATH.length - 1) enemy.reachedBase = true;
    } else {
      enemy.x += (dx / dist) * movement; enemy.y += (dy / dist) * movement;
    }
    enemy.progress = enemy.pathIndex + 1 - dist / Math.max(1, distance(current, next));
  }

  function getEnemiesInRange(game, tower, stats) {
    const inRange = game.enemies.filter(e => e.hp > 0 && distance(tower, e) <= stats.range);
    const priority = tower.targetPriority || "first";
    inRange.sort((a, b) => {
      switch (priority) {
        case "first":    return b.progress - a.progress;
        case "last":     return a.progress - b.progress;
        case "strongest": return b.hp - a.hp;
        case "weakest":  return a.hp - b.hp;
        case "closest":  return distance(tower, a) - distance(tower, b);
        default:         return b.progress - a.progress;
      }
    });
    return inRange;
  }

  function getSupportBuffForTower(game, tower) {
    if (!game || tower.type === "support" || tower.type === "nuke") return { damage: 1, range: 1, fireRate: 1 };
    return game.towers.reduce((buff, supportTower) => {
      if (supportTower.type !== "support" || supportTower.id === tower.id) return buff;
      const supportStats = getTowerStats(supportTower);
      if (distance(supportTower, tower) > supportStats.range) return buff;
      const pulseBonus = tower.overclockUntil && tower.overclockUntil > performance.now() ? 0.82 : 1;
      return {
        damage: Math.max(buff.damage, supportStats.buffDamage),
        range: Math.max(buff.range, supportStats.buffRange),
        fireRate: Math.min(buff.fireRate, supportStats.buffFireRate * supportStats.networkFireRateBonus * pulseBonus),
      };
    }, { damage: 1, range: 1, fireRate: 1 });
  }

  function applySupportBuffToStats(stats, buff) {
    return {
      ...stats,
      damage: stats.damage * buff.damage,
      range: stats.range * buff.range,
      fireRate: stats.fireRate === 0 ? 0 : Math.max(70, stats.fireRate * buff.fireRate),
    };
  }

  function fireTower(game, tower, now, delta) {
    let stats = getTowerStats(tower);
    if (tower.type === "support") {
      tower.angle = (tower.angle || 0) + 0.012;
      const supportStats = getTowerStats(tower);
      if (supportStats.commandPulseEvery && now - (tower.lastCommandPulse || 0) > supportStats.commandPulseEvery) {
        tower.lastCommandPulse = now;
        game.towers.forEach(otherTower => {
          if (otherTower.id === tower.id || otherTower.type === "support") return;
          if (distance(tower, otherTower) <= supportStats.range) {
            otherTower.overclockUntil = now + supportStats.commandPulseDuration;
            game.beams.push({
              id: `beam-command-${Date.now()}-${Math.random()}`,
              x1: tower.x, y1: tower.y - 18, x2: otherTower.x, y2: otherTower.y,
              life: 260, maxLife: 260, width: 3 + tower.level, type: "support",
            });
          }
        });
        game.explosions.push({ id: `explosion-command-${Date.now()}-${Math.random()}`, x: tower.x, y: tower.y, radius: supportStats.range, life: 380, maxLife: 380, type: "support" });
        game.damagePopups.push({ id: `popup-command-${Date.now()}-${Math.random()}`, x: tower.x, y: tower.y - 36, text: "OVERCLOCK", life: 720, color: "#d4ff7a" });
      }
      return;
    }
    stats = applySupportBuffToStats(stats, getSupportBuffForTower(game, tower));
    const enemiesInRange = getEnemiesInRange(game, tower, stats);

    // Always rotate barrel toward primary target every frame
    if (enemiesInRange.length > 0) {
      tower.angle = angleTo(tower, enemiesInRange[0]);
    }

    if (!enemiesInRange.length) {
      if (tower.type === "rapid") tower.rapidHeat = Math.max(0, (tower.rapidHeat || 0) - delta * 0.0018);
      return;
    }
    if (tower.type === "rapid" && stats.rampMax) {
      tower.rapidHeat = Math.min(stats.rampMax, (tower.rapidHeat || 0) + delta * 0.00065);
      stats.fireRate = Math.max(70, stats.fireRate * (1 - tower.rapidHeat));
    }
    const target = enemiesInRange[0];
    if (tower.type === "laser") {
      const damage = stats.damage * (delta / 1000);
      applyDamage(game, target, damage, tower, now, { ...stats, silent: true });
      if (stats.meltDuration) {
        target.brittleUntil = Math.max(target.brittleUntil || 0, now + stats.meltDuration);
        target.brittleMultiplier = Math.max(target.brittleMultiplier || 1, stats.meltMultiplier);
      }
      game.beams.push({ id: `beam-${Date.now()}-${Math.random()}`, x1: tower.x, y1: tower.y, x2: target.x, y2: target.y, life: 46, maxLife: 46, width: 6 + tower.level, type: "laser" });
      if (now - tower.lastPopup > 450) {
        tower.lastPopup = now;
        game.damagePopups.push({ id: `popup-${Date.now()}-${Math.random()}`, x: target.x, y: target.y - target.radius, text: Math.round(stats.damage).toString(), life: 520, color: "#e040fb" });
      }
      if (stats.chain > 0) {
        const chainTargets = enemiesInRange.filter(e => e.id !== target.id && distance(e, target) <= 105).slice(0, stats.chain);
        chainTargets.forEach(e => {
          applyDamage(game, e, damage * 0.55, tower, now, { ...stats, silent: true });
          if (stats.meltDuration) {
            e.brittleUntil = Math.max(e.brittleUntil || 0, now + stats.meltDuration * 0.7);
            e.brittleMultiplier = Math.max(e.brittleMultiplier || 1, stats.meltMultiplier - 0.04);
          }
          game.beams.push({ id: `beam-chain-${Date.now()}-${Math.random()}`, x1: target.x, y1: target.y, x2: e.x, y2: e.y, life: 46, maxLife: 46, width: 3 + tower.level * 0.6, type: "laser-chain" });
        });
      }
      if (stats.prismNovaEvery && now - (tower.lastPrismNova || 0) > stats.prismNovaEvery) {
        tower.lastPrismNova = now;
        game.explosions.push({ id: `explosion-prism-${Date.now()}-${Math.random()}`, x: target.x, y: target.y, radius: stats.prismNovaRadius, life: 360, maxLife: 360, type: "prism" });
        game.enemies
          .filter(e => e.hp > 0 && e.id !== target.id && distance(e, target) <= stats.prismNovaRadius)
          .slice(0, 8)
          .forEach(e => {
            applyDamage(game, e, stats.prismNovaDamage, tower, now, { ...stats, type: "prism" });
            game.beams.push({ id: `beam-prism-${Date.now()}-${Math.random()}`, x1: target.x, y1: target.y, x2: e.x, y2: e.y, life: 170, maxLife: 170, width: 4, type: "laser-chain" });
          });
        game.damagePopups.push({ id: `popup-prism-${Date.now()}-${Math.random()}`, x: target.x, y: target.y - 28, text: "PRISM", life: 650, color: "#f3e5f5" });
      }
      return;
    }
    if (now - tower.lastShot < stats.fireRate) return;
    const targets = enemiesInRange.slice(0, stats.multiShot);
    targets.forEach((shotTarget, index) => {
      const isMortar = tower.type === "splash";
      const nextShotCount = (tower.shotCount || 0) + 1 + index;
      const isChainPowerShot = tower.type === "chain" && nextShotCount % 3 === 0;
      const isChainSuperShot = tower.type === "chain" && stats.superEvery && nextShotCount % stats.superEvery === 0;
      const isStormShot = tower.type === "rapid" && stats.stormEvery && nextShotCount % stats.stormEvery === 0;
      game.bullets.push({
        id: `bullet-${Date.now()}-${Math.random()}`,
        x: tower.x, y: tower.y, startX: tower.x, startY: tower.y,
        targetX: shotTarget.x, targetY: shotTarget.y, targetId: shotTarget.id,
        speed: tower.type === "sniper" ? 18 : tower.type === "rapid" ? 11 : tower.type === "chain" ? 9.6 : 8.8,
        damage: stats.damage, type: tower.type, towerId: tower.id,
        splashRadius: stats.splashRadius || 0, slowAmount: stats.slowAmount || 1,
        slowDuration: stats.slowDuration || 0, burnDps: stats.burnDps || 0,
        burnDuration: stats.burnDuration || 0, tankPierce: stats.tankPierce, execute: stats.execute,
        ricochet: stats.ricochet || 0, bountyBonus: stats.bountyBonus || 0,
        brittleMultiplier: stats.brittleMultiplier || 1, brittleDuration: stats.brittleDuration || 0,
        stunDuration: stats.stunDuration || 0, craterSlowAmount: stats.craterSlowAmount || 1,
        craterSlowDuration: stats.craterSlowDuration || 0, clusterBombs: stats.clusterBombs || 0,
        shrapnelRadius: stats.shrapnelRadius || 0, shrapnelDamage: stats.shrapnelDamage || 0,
        stormEvery: stats.stormEvery || 0, stormShots: stats.stormShots || 0, specialStorm: isStormShot,
        specialChain: isChainPowerShot,
        specialSuper: isChainSuperShot,
        knockback: isChainPowerShot ? stats.knockback : 0,
        explodeDelay: isChainPowerShot ? stats.explodeDelay : 0,
        explosionRadius: isChainPowerShot ? stats.explosionRadius : 0,
        chainDamage: isChainPowerShot ? stats.chainDamage : 0,
        superPull: isChainSuperShot ? stats.superPull : 0,
        superRadius: isChainSuperShot ? stats.superRadius : 0,
        superDuration: isChainSuperShot ? stats.superDuration : 0,
        mode: isMortar ? "arc" : "direct", startTime: now,
        duration: isMortar ? 680 : 0, arcHeight: isMortar ? 105 + tower.level * 16 : 0,
      });
    });
    tower.shotCount = (tower.shotCount || 0) + targets.length;
    tower.lastShot = now;
  }

  function updateBullets(game, now, delta) {
    game.bullets.forEach(bullet => {
      const target = game.enemies.find(e => e.id === bullet.targetId);
      if (bullet.mode === "arc") {
        if (target) { bullet.targetX = target.x; bullet.targetY = target.y; }
        const t = Math.min(1, (now - bullet.startTime) / bullet.duration);
        const arc = Math.sin(Math.PI * t) * bullet.arcHeight;
        bullet.x = bullet.startX + (bullet.targetX - bullet.startX) * t;
        bullet.y = bullet.startY + (bullet.targetY - bullet.startY) * t - arc;
        if (t >= 1) { explodeBullet(game, bullet, now, { x: bullet.targetX, y: bullet.targetY }); bullet.dead = true; }
        return;
      }
      if (!target) { bullet.dead = true; return; }
      const dx = target.x - bullet.x, dy = target.y - bullet.y;
      const dist = Math.hypot(dx, dy);
      const movement = bullet.speed * (delta / 16);
      if (dist < movement + target.radius) {
        if (bullet.splashRadius > 0) explodeBullet(game, bullet, now, target);
        else {
          const tower = game.towers.find(t => t.id === bullet.towerId);
          applyDamage(game, target, bullet.damage, tower, now, bullet);
          applyBulletStatusEffects(target, bullet, now);
          if (bullet.shrapnelRadius > 0) triggerShrapnel(game, target, tower, now, bullet);
          if (bullet.ricochet > 0) triggerRicochet(game, target, tower, now, bullet);
          if (bullet.specialStorm) triggerBulletStorm(game, target, tower, now, bullet);
          if (bullet.specialChain) {
            knockbackEnemy(target, bullet.knockback || 0);
            markEnemyToExplode(game, target, tower, now, bullet, 0);
          }
          if (bullet.specialSuper) {
            triggerChainSuper(game, target, tower, now, bullet);
          }
        }
        bullet.dead = true;
      } else { bullet.x += (dx / dist) * movement; bullet.y += (dy / dist) * movement; }
    });
    game.bullets = game.bullets.filter(b => !b.dead);
  }

  function explodeBullet(game, bullet, now, center) {
    const tower = game.towers.find(t => t.id === bullet.towerId);
    const radius = bullet.splashRadius || 0;
    game.explosions.push({ id: `explosion-${Date.now()}-${Math.random()}`, x: center.x, y: center.y, radius, life: 280, maxLife: 280, type: bullet.type });
    game.enemies.forEach(enemy => {
      const dist = distance(enemy, center);
      if (dist <= radius) {
        const falloff = Math.max(0.55, 1 - dist / Math.max(1, radius) * 0.35);
        applyDamage(game, enemy, bullet.damage * falloff, tower, now, bullet);
        applyBulletStatusEffects(enemy, bullet, now);
        if (bullet.craterSlowDuration > 0) {
          enemy.slowUntil = Math.max(enemy.slowUntil || 0, now + bullet.craterSlowDuration);
          enemy.slowAmount = Math.min(enemy.slowAmount || 1, bullet.craterSlowAmount || 0.7);
        }
      }
    });
    triggerClusterBombs(game, center, tower, now, bullet);
  }

  function applyBulletStatusEffects(enemy, bullet, now) {
    if (!enemy || enemy.hp <= 0) return;
    if (bullet.slowDuration > 0) {
      enemy.slowUntil = Math.max(enemy.slowUntil || 0, now + bullet.slowDuration);
      enemy.slowAmount = Math.min(enemy.slowAmount || 1, bullet.slowAmount || 1);
    }
    if (bullet.burnDuration > 0) {
      enemy.burnUntil = Math.max(enemy.burnUntil || 0, now + bullet.burnDuration);
      enemy.burnDps = Math.max(enemy.burnDps || 0, bullet.burnDps || 0);
    }
    if (bullet.brittleDuration > 0) {
      enemy.brittleUntil = Math.max(enemy.brittleUntil || 0, now + bullet.brittleDuration);
      enemy.brittleMultiplier = Math.max(enemy.brittleMultiplier || 1, bullet.brittleMultiplier || 1);
    }
    if (bullet.stunDuration > 0) {
      enemy.stunUntil = Math.max(enemy.stunUntil || 0, now + bullet.stunDuration);
    }
  }

  function triggerShrapnel(game, centerEnemy, tower, now, source) {
    const radius = source.shrapnelRadius || 0;
    if (!radius) return;
    game.explosions.push({ id: `explosion-shrapnel-${Date.now()}-${Math.random()}`, x: centerEnemy.x, y: centerEnemy.y, radius, life: 220, maxLife: 220, type: "shrapnel" });
    game.enemies.forEach(enemy => {
      if (enemy.hp <= 0 || enemy.id === centerEnemy.id) return;
      const dist = distance(enemy, centerEnemy);
      if (dist > radius) return;
      const falloff = Math.max(0.45, 1 - dist / Math.max(1, radius) * 0.45);
      applyDamage(game, enemy, (source.shrapnelDamage || source.damage * 0.25) * falloff, tower, now, { ...source, type: "shrapnel" });
      if (source.stunDuration) enemy.stunUntil = Math.max(enemy.stunUntil || 0, now + source.stunDuration * 0.55);
    });
  }

  function triggerRicochet(game, hitEnemy, tower, now, source) {
    let origin = hitEnemy;
    let remaining = source.ricochet || 0;
    let damage = source.damage * 0.52;
    const used = new Set([hitEnemy.id]);
    while (remaining > 0) {
      const next = game.enemies
        .filter(e => e.hp > 0 && !used.has(e.id) && distance(origin, e) <= 120)
        .sort((a, b) => distance(origin, a) - distance(origin, b))[0];
      if (!next) break;
      used.add(next.id);
      applyDamage(game, next, damage, tower, now, { ...source, silent: false, type: "ricochet" });
      applyBulletStatusEffects(next, source, now);
      game.beams.push({ id: `beam-ricochet-${Date.now()}-${Math.random()}`, x1: origin.x, y1: origin.y, x2: next.x, y2: next.y, life: 155, maxLife: 155, width: 2.5, type: "ricochet" });
      origin = next;
      damage *= 0.72;
      remaining -= 1;
    }
  }

  function triggerBulletStorm(game, hitEnemy, tower, now, source) {
    const targets = game.enemies
      .filter(e => e.hp > 0 && distance(tower, e) <= 155)
      .sort((a, b) => distance(hitEnemy, a) - distance(hitEnemy, b))
      .slice(0, source.stormShots || 4);
    if (!targets.length) return;
    game.damagePopups.push({ id: `popup-storm-${Date.now()}-${Math.random()}`, x: tower.x, y: tower.y - 34, text: "STORM", life: 650, color: "#fff176" });
    targets.forEach((enemy, i) => {
      applyDamage(game, enemy, source.damage * 0.42, tower, now, { ...source, type: "storm" });
      game.beams.push({ id: `beam-storm-${Date.now()}-${Math.random()}-${i}`, x1: tower.x, y1: tower.y, x2: enemy.x, y2: enemy.y, life: 130, maxLife: 130, width: 2.2, type: "storm" });
    });
  }

  function triggerClusterBombs(game, center, tower, now, source) {
    const count = source.clusterBombs || 0;
    if (!count) return;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.35;
      const r = 34 + Math.random() * 44;
      const miniCenter = { x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r };
      const radius = Math.max(34, (source.splashRadius || 60) * 0.45);
      game.explosions.push({ id: `explosion-cluster-${Date.now()}-${Math.random()}`, x: miniCenter.x, y: miniCenter.y, radius, life: 260 + i * 20, maxLife: 260 + i * 20, type: "cluster" });
      game.enemies.forEach(enemy => {
        if (enemy.hp <= 0 || distance(enemy, miniCenter) > radius) return;
        applyDamage(game, enemy, source.damage * 0.34, tower, now, { ...source, type: "cluster" });
        if (source.burnDuration > 0) { enemy.burnUntil = Math.max(enemy.burnUntil || 0, now + source.burnDuration * 0.65); enemy.burnDps = Math.max(enemy.burnDps || 0, source.burnDps * 0.75); }
      });
    }
  }

  function knockbackEnemy(enemy, amount) {
    if (!enemy || amount <= 0 || enemy.pathIndex >= PATH.length - 1) return;
    const current = PATH[enemy.pathIndex];
    const next = PATH[Math.min(enemy.pathIndex + 1, PATH.length - 1)];
    const dx = next.x - current.x;
    const dy = next.y - current.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    enemy.x -= (dx / len) * amount;
    enemy.y -= (dy / len) * amount;
  }

  function markEnemyToExplode(game, enemy, tower, now, source, depth = 0) {
    if (!enemy || enemy.hp <= 0) return;

    // If already primed, keep the sooner explosion instead of resetting the timer backward.
    // After the enemy explodes, it can be marked again, so two healthy enemies beside
    // each other can theoretically bounce the chain forever.
    const nextExplodeAt = now + (source.explodeDelay || 700);
    if (enemy.explodePrimed && enemy.explodeAt && enemy.explodeAt <= nextExplodeAt) return;

    enemy.explodeAt = nextExplodeAt;
    enemy.explodeRadius = source.explosionRadius || 54;
    enemy.explodeDamage = source.chainDamage || source.damage || 22;
    enemy.explodeSourceTowerId = tower?.id || source.towerId || null;
    enemy.explodeChainDepth = depth;
    enemy.explodePrimed = true;
    game.damagePopups.push({
      id: `popup-explode-${Date.now()}-${Math.random()}`,
      x: enemy.x,
      y: enemy.y - enemy.radius - 10,
      text: depth === 0 ? "EXPLODE" : "CHAIN",
      life: 650,
      color: depth === 0 ? "#ff7043" : "#ffca28",
    });
  }

  function triggerChainExplosion(game, enemy, now) {
    if (!enemy || !enemy.explodePrimed) return;
    const tower = game.towers.find(t => t.id === enemy.explodeSourceTowerId);
    const center = { x: enemy.x, y: enemy.y };
    const radius = enemy.explodeRadius || 54;
    const damage = enemy.explodeDamage || 22;
    const depth = enemy.explodeChainDepth || 0;
    enemy.explodePrimed = false;
    enemy.explodeAt = null;
    game.explosions.push({
      id: `explosion-chain-${Date.now()}-${Math.random()}`,
      x: center.x,
      y: center.y,
      radius,
      life: 320,
      maxLife: 320,
      type: "chain",
    });
    game.enemies.forEach(other => {
      if (other.hp <= 0) return;
      const dist = distance(other, center);
      if (dist > radius) return;
      const falloff = Math.max(0.62, 1 - dist / Math.max(1, radius) * 0.28);
      applyDamage(game, other, damage * falloff, tower, now, { type: "chain", silent: other.id === enemy.id });
      if (other.id !== enemy.id) {
        markEnemyToExplode(game, other, tower, now, {
          explodeDelay: 520,
          explosionRadius: radius,
          chainDamage: Math.max(10, damage * 0.9),
        }, depth + 1);
      }
    });
  }

  function updateChainExplosions(game, now) {
    game.enemies.forEach(enemy => {
      if (enemy.explodePrimed && enemy.explodeAt && now >= enemy.explodeAt) {
        triggerChainExplosion(game, enemy, now);
      }
    });
  }

  function triggerChainSuper(game, target, tower, now, source) {
    if (!target || !game.enemies.length) return;
    const radius = source.superRadius || 9999;
    const life = source.superDuration || 1100;
    const pull = source.superPull || 0.42;
    game.vortices.push({
      id: `vortex-${Date.now()}-${Math.random()}`,
      x: target.x,
      y: target.y,
      radius,
      pull,
      life,
      maxLife: life,
      sourceTowerId: tower?.id || source.towerId || null,
    });
    game.explosions.push({
      id: `explosion-vortex-start-${Date.now()}-${Math.random()}`,
      x: target.x,
      y: target.y,
      radius: 88,
      life: 300,
      maxLife: 300,
      type: "vortex",
    });
    game.damagePopups.push({
      id: `popup-super-${Date.now()}-${Math.random()}`,
      x: target.x,
      y: target.y - target.radius - 22,
      text: "SUPER PULL",
      life: 850,
      color: "#ffca28",
    });
  }

  function updateVortices(game, now, delta) {
    if (!game.vortices?.length) return;
    game.vortices.forEach(vortex => {
      const pullStep = vortex.pull * (delta / 16);
      game.enemies.forEach(enemy => {
        if (enemy.hp <= 0 || enemy.reachedBase) return;
        const dx = vortex.x - enemy.x;
        const dy = vortex.y - enemy.y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        if (dist > vortex.radius) return;
        const strength = Math.max(0.18, 1 - dist / Math.max(1, vortex.radius));
        const maxMove = Math.min(dist, 7.5 * pullStep * strength);
        enemy.x += (dx / dist) * maxMove;
        enemy.y += (dy / dist) * maxMove;
        enemy.slowUntil = Math.max(enemy.slowUntil || 0, now + 90);
        enemy.slowAmount = Math.min(enemy.slowAmount || 1, 0.72);
      });
      vortex.life -= delta;
    });
    game.vortices = game.vortices.filter(v => v.life > 0);
  }

  function detonateNuke(game, point, now = performance.now()) {
    const nuke = TOWER_TYPES.nuke;
    const blastRadius = 290;
    game.explosions.push({
      id: `explosion-nuke-${Date.now()}-${Math.random()}`,
      x: point.x,
      y: point.y,
      radius: blastRadius,
      life: 620,
      maxLife: 620,
      type: "nuke",
    });
    game.enemies.forEach(enemy => {
      const dist = distance(enemy, point);
      const mapWideDamage = nuke.damage * 0.62;
      const closeBonus = dist <= blastRadius ? nuke.damage * Math.max(0.45, 1 - dist / blastRadius * 0.45) : 0;
      applyDamage(game, enemy, mapWideDamage + closeBonus, null, now, { type: "nuke" });
      enemy.slowUntil = Math.max(enemy.slowUntil || 0, now + 520);
      enemy.slowAmount = Math.min(enemy.slowAmount || 1, 0.62);
    });
    game.damagePopups.push({ id: `popup-nuke-${Date.now()}-${Math.random()}`, x: point.x, y: point.y - 20, text: "NUKE", life: 850, color: "#fff176" });
    setMessage("Nuke dropped. Every enemy took blast damage.");
  }

  function applyDamage(game, enemy, rawDamage, tower, now, source) {
    if (!enemy || enemy.hp <= 0) return;
    const wasAlive = enemy.hp > 0;
    let damage = rawDamage;
    if (source?.tankPierce && (enemy.type === "tank" || enemy.type === "boss")) damage *= 1.45;
    if (enemy.brittleUntil && enemy.brittleUntil > now) damage *= enemy.brittleMultiplier || 1.15;
    if (source?.execute && enemy.hp / enemy.maxHp < 0.18) damage = enemy.hp + 1;
    if (enemy.type === "shield" && !source?.tankPierce) damage *= 0.68;
    enemy.hp -= damage;
    if (!source?.silent) {
      game.damagePopups.push({ id: `popup-${Date.now()}-${Math.random()}`, x: enemy.x, y: enemy.y - enemy.radius, text: Math.round(damage).toString(), life: 600, color: source?.execute && enemy.hp <= 0 ? "#f4b942" : "#ffffff" });
    }
    if (tower && wasAlive && enemy.hp <= 0) {
      tower.kills = (tower.kills || 0) + 1;
      if (source?.bountyBonus) {
        game.coins += source.bountyBonus;
        game.damagePopups.push({ id: `popup-bounty-${Date.now()}-${Math.random()}`, x: enemy.x, y: enemy.y - enemy.radius - 16, text: `+${source.bountyBonus}`, life: 650, color: "#f4b942" });
      }
    }
  }

  function updateBeamsExplosionsAndPopups(game, delta) {
    game.beams.forEach(b => b.life -= delta);
    game.explosions.forEach(e => e.life -= delta);
    game.damagePopups.forEach(p => { p.life -= delta; p.y -= 0.35 * (delta / 16); });
    game.beams = game.beams.filter(b => b.life > 0);
    game.explosions = game.explosions.filter(e => e.life > 0);
    game.damagePopups = game.damagePopups.filter(p => p.life > 0);
  }

  function removeDefeatedEnemies(game) {
    const defeated = game.enemies.filter(e => e.hp <= 0);
    if (defeated.length > 0) {
      defeated.forEach(e => { game.coins += e.reward; game.score += e.reward * 10; });
      game.enemies = game.enemies.filter(e => e.hp > 0);
      syncStateFromRef();
    }
  }

  // ─── DRAW GAME ───────────────────────────────────────────────────────────

  function drawGame(ctx, game, now) {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    drawBackground(ctx, now);
    drawDecorations(ctx, now);
    drawPath(ctx, now);
    drawSpawnGate(ctx);
    drawBase(ctx);
    drawTowers(ctx, game);
    drawPlacementPreview(ctx);
    drawVortices(ctx, game, now);
    drawEnemies(ctx, game, now);
    drawBullets(ctx, game);
    drawBeams(ctx, game);
    drawExplosions(ctx, game);
    drawDamagePopups(ctx, game);
    drawTopOverlay(ctx, game);
    if (!isRunningRef.current && !game.gameOver) drawPauseBadge(ctx, questionModal ? "⏸ Question Mode" : "⏸ Paused");
    if (game.gameOver) drawGameOver(ctx);
  }

  function drawBackground(ctx, now) {
    // Lush green gradient field
    const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    bg.addColorStop(0, "#8ecf52");
    bg.addColorStop(0.5, "#6db83a");
    bg.addColorStop(1, "#4e9422");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Grass texture checkerboard
    ctx.save();
    ctx.globalAlpha = 0.1;
    for (let x = 0; x < CANVAS_WIDTH; x += 36) {
      for (let y = 0; y < CANVAS_HEIGHT; y += 36) {
        if ((Math.floor(x / 36) + Math.floor(y / 36)) % 2 === 0) {
          ctx.fillStyle = "#5aab2e";
          ctx.fillRect(x, y, 36, 36);
        }
      }
    }
    ctx.restore();

    // Light dapple effect
    ctx.save();
    ctx.globalAlpha = 0.06;
    for (let i = 0; i < 12; i++) {
      const dx = (i * 137.5) % CANVAS_WIDTH;
      const dy = (i * 97.3) % CANVAS_HEIGHT;
      const r = 30 + (i * 23) % 50;
      const dapple = ctx.createRadialGradient(dx, dy, 0, dx, dy, r);
      dapple.addColorStop(0, "#ffffff");
      dapple.addColorStop(1, "transparent");
      ctx.fillStyle = dapple;
      ctx.fillRect(dx - r, dy - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  function drawDecorations(ctx, now) {
    ctx.save();

    // Decorative trees (round canopy style)
    const trees = [
      { x: 52, y: 62, s: 1.1 },
      { x: 890, y: 68, s: 1.0 },
      { x: 920, y: 118, s: 0.85 },
      { x: 868, y: 502, s: 0.9 },
      { x: 78, y: 498, s: 1.0 },
      { x: 475, y: 68, s: 0.95 },
      { x: 200, y: 500, s: 0.8 },
      { x: 700, y: 500, s: 0.85 },
    ];

    trees.forEach(({ x, y, s }) => {
      // Shadow
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(x + 4, y + 18 * s, 16 * s, 6 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Trunk
      const trunkG = ctx.createLinearGradient(x - 5 * s, y, x + 5 * s, y);
      trunkG.addColorStop(0, "#8d5524");
      trunkG.addColorStop(1, "#5c3317");
      ctx.fillStyle = trunkG;
      ctx.strokeStyle = "#3e2000";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x - 4 * s, y + 6 * s, 8 * s, 16 * s, 2);
      ctx.fill();
      ctx.stroke();

      // Canopy layers (3 circles for depth)
      [[0, 0, 20 * s, "#2d8c4e"], [-10 * s, -6 * s, 16 * s, "#38a055"], [8 * s, -5 * s, 15 * s, "#3ba352"],
        [0, -14 * s, 16 * s, "#45b55e"]].forEach(([dx, dy, r, col]) => {
        ctx.fillStyle = col;
        ctx.strokeStyle = darken(col, 15);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });

      // Top highlight
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.beginPath();
      ctx.arc(x - 4 * s, y - 14 * s, 6 * s, 0, Math.PI * 2);
      ctx.fill();

      // Fruit/flowers on level 4+
      ctx.fillStyle = "#e74c3c";
      ctx.beginPath();
      ctx.arc(x + 8 * s, y - 8 * s, 3 * s, 0, Math.PI * 2);
      ctx.fill();
    });

    // Decorative bushes / flower patches
    const bushes = [
      { x: 220, y: 72 }, { x: 255, y: 510 }, { x: 695, y: 92 }, { x: 830, y: 448 }, { x: 460, y: 82 },
    ];
    bushes.forEach(({ x, y }) => {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(x + 2, y + 10, 14, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      [[-8, 0, 11, "#4caf50"], [4, -3, 10, "#66bb6a"], [-2, -8, 9, "#81c784"]].forEach(([dx, dy, r, col]) => {
        ctx.fillStyle = col;
        ctx.strokeStyle = darken(col, 20);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
      // Flowers
      [[0, -5], [10, -2], [-6, -3]].forEach(([fx, fy], fi) => {
        const fc = ["#ff7043", "#ffca28", "#f06292"][fi];
        ctx.fillStyle = fc;
        ctx.beginPath();
        ctx.arc(x + fx, y + fy, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    ctx.restore();
  }

  function drawPath(ctx, now) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Wide dirt shadow
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 16;
    ctx.strokeStyle = "#3d2000";
    ctx.lineWidth = 64;
    ctx.beginPath();
    ctx.moveTo(PATH[0].x, PATH[0].y);
    for (let i = 1; i < PATH.length; i++) ctx.lineTo(PATH[i].x, PATH[i].y);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Dirt base
    const pathG = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    pathG.addColorStop(0, "#c8a060");
    pathG.addColorStop(0.5, "#b08040");
    pathG.addColorStop(1, "#a07030");
    ctx.strokeStyle = pathG;
    ctx.lineWidth = 54;
    ctx.beginPath();
    ctx.moveTo(PATH[0].x, PATH[0].y);
    for (let i = 1; i < PATH.length; i++) ctx.lineTo(PATH[i].x, PATH[i].y);
    ctx.stroke();

    // Lighter center lane
    ctx.strokeStyle = "#d4aa70";
    ctx.lineWidth = 42;
    ctx.beginPath();
    ctx.moveTo(PATH[0].x, PATH[0].y);
    for (let i = 1; i < PATH.length; i++) ctx.lineTo(PATH[i].x, PATH[i].y);
    ctx.stroke();

    // Edge stones/pebbles trim
    ctx.strokeStyle = "rgba(180,140,90,0.6)";
    ctx.lineWidth = 46;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(PATH[0].x, PATH[0].y);
    for (let i = 1; i < PATH.length; i++) ctx.lineTo(PATH[i].x, PATH[i].y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Animated footstep dots
    const dotOffset = (now / 600) % 1;
    ctx.fillStyle = "rgba(100,70,30,0.3)";
    for (let i = 0; i < PATH.length - 1; i++) {
      const seg = PATH[i];
      const segEnd = PATH[i + 1];
      const segLen = distance(seg, segEnd);
      const steps = Math.floor(segLen / 28);
      for (let j = 0; j < steps; j++) {
        const t = ((j / steps) + dotOffset) % 1;
        const px = seg.x + (segEnd.x - seg.x) * t;
        const py = seg.y + (segEnd.y - seg.y) * t;
        const side = (j % 2 === 0 ? 1 : -1) * 10;
        const nx = -(segEnd.y - seg.y) / segLen;
        const ny = (segEnd.x - seg.x) / segLen;
        ctx.beginPath();
        ctx.ellipse(px + nx * side, py + ny * side, 4, 3, Math.atan2(segEnd.y - seg.y, segEnd.x - seg.x), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  function drawSpawnGate(ctx) {
    ctx.save();
    // Wooden gate posts
    [[4, 262], [4, 316]].forEach(([px, py]) => {
      const pg = ctx.createLinearGradient(px, 0, px + 16, 0);
      pg.addColorStop(0, "#8d5524");
      pg.addColorStop(1, "#5c3317");
      ctx.fillStyle = pg;
      ctx.strokeStyle = "#3e2000";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(px, py, 16, 22, 3);
      ctx.fill();
      ctx.stroke();
    });

    // Top beam
    ctx.fillStyle = "#7a4520";
    ctx.strokeStyle = "#3e2000";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(2, 256, 22, 10, 3);
    ctx.fill();
    ctx.stroke();

    // Red warning torch glow
    const glow = ctx.createRadialGradient(34, 300, 0, 34, 300, 26);
    glow.addColorStop(0, "rgba(255,80,20,0.55)");
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.fillRect(8, 274, 52, 52);

    // Gate sign
    ctx.fillStyle = "#8d5524";
    ctx.strokeStyle = "#3e2000";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(10, 286, 32, 28, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ff6b35";
    ctx.shadowColor = "#ff4500";
    ctx.shadowBlur = 6;
    ctx.font = "bold 8px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("⚠", 26, 296);
    ctx.fillStyle = "#ffe0cc";
    ctx.shadowBlur = 0;
    ctx.font = "bold 6px sans-serif";
    ctx.fillText("SPAWN", 26, 308);
    ctx.restore();
  }

  function drawBase(ctx) {
    ctx.save();
    // Fortified castle base
    // Foundation
    const wallG = ctx.createLinearGradient(915, 290, 975, 405);
    wallG.addColorStop(0, "#b0bec5");
    wallG.addColorStop(1, "#78909c");
    ctx.fillStyle = wallG;
    ctx.strokeStyle = "#455a64";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(915, 290, 60, 108, 10);
    ctx.fill();
    ctx.stroke();

    // Brick lines
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(915, 290 + i * 21);
      ctx.lineTo(975, 290 + i * 21);
      ctx.stroke();
    }
    for (let row = 0; row < 5; row++) {
      const offset = row % 2 === 0 ? 15 : 0;
      ctx.beginPath();
      ctx.moveTo(915 + 15 + offset, 290 + row * 21);
      ctx.lineTo(915 + 15 + offset, 290 + (row + 1) * 21);
      ctx.stroke();
    }

    // Top tower section
    const topG = ctx.createLinearGradient(920, 270, 975, 300);
    topG.addColorStop(0, "#cfd8dc");
    topG.addColorStop(1, "#90a4ae");
    ctx.fillStyle = topG;
    ctx.strokeStyle = "#455a64";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(924, 272, 38, 26, 6);
    ctx.fill();
    ctx.stroke();

    // Battlements
    drawBattlements(ctx, 943, 272, 38, 7, 9, "#cfd8dc", "#455a64");

    // Door arch
    ctx.fillStyle = "#1a2327";
    ctx.strokeStyle = "#37474f";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(936, 350, 20, 30, [10, 10, 0, 0]);
    ctx.fill();
    ctx.stroke();
    // Door bars
    ctx.strokeStyle = "#455a64";
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(936 + 5 + i * 5, 352);
      ctx.lineTo(936 + 5 + i * 5, 379);
      ctx.stroke();
    }

    // Slit windows
    [[935, 312], [958, 318], [935, 336]].forEach(([wx, wy]) => {
      ctx.fillStyle = "#263238";
      ctx.beginPath();
      ctx.roundRect(wx, wy, 6, 10, 3);
      ctx.fill();
      // Light inside
      ctx.fillStyle = "rgba(255,220,100,0.4)";
      ctx.beginPath();
      ctx.arc(wx + 3, wy + 3, 2, 0, Math.PI * 2);
      ctx.fill();
    });

    // Flag
    ctx.fillStyle = "#455a64";
    ctx.fillRect(958, 262, 2.5, 22);
    ctx.fillStyle = "#e53935";
    ctx.strokeStyle = "#b71c1c";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(960.5, 262);
    ctx.lineTo(978, 269);
    ctx.lineTo(960.5, 276);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Flag detail
    ctx.fillStyle = "#ffca28";
    ctx.font = "bold 8px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("★", 970, 272);

    ctx.restore();
  }

  function drawTowers(ctx, game) {
    game.towers.forEach(tower => {
      const stats = getTowerStats(tower);
      const isSelected = tower.id === selectedTowerIdRef.current;

      ctx.save();
      if (isSelected) {
        // Range circle
        ctx.strokeStyle = "rgba(244,185,66,0.7)";
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.arc(tower.x, tower.y, stats.range, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(244,185,66,0.06)";
        ctx.beginPath();
        ctx.arc(tower.x, tower.y, stats.range, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw active support links before the sprite so buffed towers feel connected
      const buff = getSupportBuffForTower(game, tower);
      if (tower.type !== "support" && (buff.damage > 1 || buff.range > 1 || buff.fireRate < 1)) {
        const supportTower = game.towers.find(s => s.type === "support" && distance(s, tower) <= getTowerStats(s).range);
        if (supportTower) {
          ctx.strokeStyle = "rgba(212,255,122,0.42)";
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 7]);
          ctx.beginPath();
          ctx.moveTo(supportTower.x, supportTower.y - 18);
          ctx.lineTo(tower.x, tower.y - 8);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // Draw the sprite
      if (tower.type === "basic") drawCannonTower(ctx, tower);
      else if (tower.type === "freeze") drawFrostTower(ctx, tower);
      else if (tower.type === "splash") drawMortarTower(ctx, tower);
      else if (tower.type === "sniper") drawSniperTower(ctx, tower);
      else if (tower.type === "rapid") drawRapidTower(ctx, tower);
      else if (tower.type === "laser") drawLaserTower(ctx, tower);
      else if (tower.type === "support") drawSupportTower(ctx, tower);
      else if (tower.type === "chain") drawChainTower(ctx, tower);

      // Level badge
      const lvColors = ["", "#4caf50", "#2196f3", "#9c27b0", "#f4b942"];
      ctx.fillStyle = lvColors[tower.level] || "#4caf50";
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 1.5;
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(tower.x + 15, tower.y - 18, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff";
      ctx.font = "bold 9px 'Nunito', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(tower.level, tower.x + 15, tower.y - 14);

      ctx.restore();
    });
  }

  function drawPlacementPreview(ctx) {
    const drag = draggingRef.current;
    if (!drag?.canvasPoint?.inside) return;
    const point = drag.canvasPoint;
    const valid = drag.valid;
    const stats = getTowerStats({ x: point.x, y: point.y, type: drag.type, level: 1 });
    ctx.save();
    ctx.strokeStyle = valid ? "rgba(76,175,80,0.8)" : "rgba(239,68,68,0.8)";
    ctx.fillStyle = valid ? "rgba(76,175,80,0.08)" : "rgba(239,68,68,0.08)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.arc(point.x, point.y, stats.range, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowColor = valid ? "#4caf50" : "#ef4444";
    ctx.shadowBlur = 18;
    ctx.fillStyle = valid ? "#2e7d32" : "#c62828";
    ctx.beginPath();
    ctx.arc(point.x, point.y, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = valid ? "#a5d6a7" : "#ef9a9a";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(valid ? "✓" : "✗", point.x, point.y + 5);
    ctx.restore();
  }

  function drawEnemies(ctx, game, now) {
    game.enemies.forEach(enemy => {
      ctx.save();
      // Drop shadow
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(enemy.x + 2, enemy.y + enemy.radius + 5, enemy.radius * 0.85, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Body — different shapes per enemy type
      if (enemy.type === "normal") {
        // Rounded blob creature — green
        const bg = ctx.createRadialGradient(enemy.x - 3, enemy.y - 4, 2, enemy.x, enemy.y, enemy.radius);
        bg.addColorStop(0, "#a5d6a7");
        bg.addColorStop(0.6, "#388e3c");
        bg.addColorStop(1, "#1b5e20");
        ctx.fillStyle = bg;
        ctx.strokeStyle = "#1b5e20";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Eyes
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(enemy.x - 4, enemy.y - 3, 3.5, 0, Math.PI * 2);
        ctx.arc(enemy.x + 4, enemy.y - 3, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#c62828";
        ctx.beginPath();
        ctx.arc(enemy.x - 4, enemy.y - 3, 2, 0, Math.PI * 2);
        ctx.arc(enemy.x + 4, enemy.y - 3, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      if (enemy.type === "fast") {
        // Slim darting creature — orange
        const bg = ctx.createRadialGradient(enemy.x - 2, enemy.y - 3, 1, enemy.x, enemy.y, enemy.radius);
        bg.addColorStop(0, "#ffe082");
        bg.addColorStop(1, "#e65100");
        ctx.fillStyle = bg;
        ctx.strokeStyle = "#bf360c";
        ctx.lineWidth = 1.5;
        // Pointy shape
        ctx.beginPath();
        ctx.moveTo(enemy.x + enemy.radius + 4, enemy.y);
        ctx.lineTo(enemy.x - enemy.radius * 0.5, enemy.y - enemy.radius);
        ctx.lineTo(enemy.x - enemy.radius, enemy.y);
        ctx.lineTo(enemy.x - enemy.radius * 0.5, enemy.y + enemy.radius);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Speed lines
        ctx.strokeStyle = "rgba(255,200,100,0.5)";
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(enemy.x - enemy.radius * 0.5 - 6, enemy.y - 4 + i * 4);
          ctx.lineTo(enemy.x - enemy.radius * 0.5 - 16, enemy.y - 4 + i * 4);
          ctx.stroke();
        }
      }

      if (enemy.type === "tank") {
        // Armored block creature — grey/brown
        const bg = ctx.createLinearGradient(enemy.x - enemy.radius, enemy.y - enemy.radius, enemy.x + enemy.radius, enemy.y + enemy.radius);
        bg.addColorStop(0, "#a1887f");
        bg.addColorStop(1, "#4e342e");
        ctx.fillStyle = bg;
        ctx.strokeStyle = "#3e2723";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(enemy.x - enemy.radius, enemy.y - enemy.radius, enemy.radius * 2, enemy.radius * 2, 4);
        ctx.fill();
        ctx.stroke();
        // Armor plates
        ctx.strokeStyle = "#6d4c41";
        ctx.lineWidth = 1;
        ctx.strokeRect(enemy.x - enemy.radius + 3, enemy.y - enemy.radius + 3, enemy.radius * 2 - 6, enemy.radius * 2 - 6);
        // Rivets
        [[enemy.x - enemy.radius + 6, enemy.y - enemy.radius + 6], [enemy.x + enemy.radius - 6, enemy.y - enemy.radius + 6],
          [enemy.x - enemy.radius + 6, enemy.y + enemy.radius - 6], [enemy.x + enemy.radius - 6, enemy.y + enemy.radius - 6]].forEach(([rx, ry]) => {
          ctx.fillStyle = "#8d6e63";
          ctx.beginPath();
          ctx.arc(rx, ry, 2.5, 0, Math.PI * 2);
          ctx.fill();
        });
        // Angry eyes
        ctx.fillStyle = "#ff5722";
        ctx.beginPath();
        ctx.arc(enemy.x - 5, enemy.y - 3, 3, 0, Math.PI * 2);
        ctx.arc(enemy.x + 5, enemy.y - 3, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      if (enemy.type === "shield") {
        // Turtle-like shielded creature — teal
        const bg = ctx.createRadialGradient(enemy.x - 3, enemy.y - 4, 2, enemy.x, enemy.y, enemy.radius);
        bg.addColorStop(0, "#80cbc4");
        bg.addColorStop(1, "#00695c");
        ctx.fillStyle = bg;
        ctx.strokeStyle = "#004d40";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Shell pattern
        ctx.strokeStyle = "#26a69a";
        ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(enemy.x, enemy.y);
          ctx.lineTo(enemy.x + Math.cos(a) * enemy.radius * 0.8, enemy.y + Math.sin(a) * enemy.radius * 0.8);
          ctx.stroke();
        }
        // Shield glow ring
        ctx.strokeStyle = "#80deea";
        ctx.lineWidth = 3;
        ctx.shadowColor = "#26c6da";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      if (enemy.type === "boss") {
        // Large menacing boss — dark red with crown
        const bg = ctx.createRadialGradient(enemy.x - 4, enemy.y - 6, 3, enemy.x, enemy.y, enemy.radius);
        bg.addColorStop(0, "#ef9a9a");
        bg.addColorStop(0.5, "#c62828");
        bg.addColorStop(1, "#7f0000");
        ctx.fillStyle = bg;
        ctx.strokeStyle = "#4a0000";
        ctx.lineWidth = 3;
        ctx.shadowColor = "#c62828";
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        // Crown
        ctx.fillStyle = "#f4b942";
        ctx.strokeStyle = "#c8862a";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const crownY = enemy.y - enemy.radius - 2;
        ctx.moveTo(enemy.x - 12, crownY + 8);
        ctx.lineTo(enemy.x - 12, crownY);
        ctx.lineTo(enemy.x - 6, crownY + 5);
        ctx.lineTo(enemy.x, crownY - 2);
        ctx.lineTo(enemy.x + 6, crownY + 5);
        ctx.lineTo(enemy.x + 12, crownY);
        ctx.lineTo(enemy.x + 12, crownY + 8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Crown gems
        ["#e53935", "#e91e63", "#9c27b0"].forEach((gc, gi) => {
          ctx.fillStyle = gc;
          ctx.beginPath();
          ctx.arc(enemy.x - 6 + gi * 6, crownY + 2, 2.5, 0, Math.PI * 2);
          ctx.fill();
        });
        // Eyes
        ctx.fillStyle = "#ff8f00";
        ctx.shadowColor = "#ff6d00";
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(enemy.x - 7, enemy.y - 4, 5, 0, Math.PI * 2);
        ctx.arc(enemy.x + 7, enemy.y - 4, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#000";
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(enemy.x - 7, enemy.y - 4, 2.5, 0, Math.PI * 2);
        ctx.arc(enemy.x + 7, enemy.y - 4, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Burn effect
      if (enemy.burnUntil > now) {
        ctx.strokeStyle = "#ff7043";
        ctx.lineWidth = 2;
        ctx.shadowColor = "#ff5722";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius + 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Slow effect (ice crystals)
      if (enemy.slowUntil > now) {
        ctx.strokeStyle = "#80deea";
        ctx.lineWidth = 2;
        ctx.shadowColor = "#26c6da";
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        // Ice overlay
        ctx.fillStyle = "rgba(176,224,230,0.25)";
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Brittle / armor melt vulnerability marker
      if (enemy.brittleUntil > now) {
        ctx.strokeStyle = "#fff59d";
        ctx.lineWidth = 2;
        ctx.shadowColor = "#fff176";
        ctx.shadowBlur = 7;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius + 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;
      }

      // Stun / ice prison marker
      if (enemy.stunUntil > now) {
        ctx.fillStyle = "rgba(255,255,255,0.72)";
        ctx.strokeStyle = "#bbdefb";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(enemy.x - enemy.radius - 4, enemy.y - enemy.radius - 4, (enemy.radius + 4) * 2, (enemy.radius + 4) * 2, 8);
        ctx.fill();
        ctx.stroke();
      }

      // Chainshot explode marker
      if (enemy.explodePrimed) {
        const pulse = 0.65 + Math.sin(now * 0.018) * 0.22;
        ctx.strokeStyle = `rgba(255,112,67,${pulse})`;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = "#ff5722";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius + 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#ff7043";
        ctx.font = "bold 11px 'Nunito', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("✹", enemy.x, enemy.y - enemy.radius - 18);
      }

      // HP bar
      const hpPct = Math.max(0, enemy.hp / enemy.maxHp);
      const bw = enemy.radius * 2.6;
      const bx = enemy.x - bw / 2;
      const by = enemy.y - enemy.radius - 14;
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, 6, 3);
      ctx.fill();
      const hpCol = hpPct > 0.5 ? "#4caf50" : hpPct > 0.25 ? "#ffc107" : "#f44336";
      ctx.fillStyle = hpCol;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw * hpPct, 6, 3);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, 6, 3);
      ctx.stroke();

      ctx.restore();
    });
  }

  function drawBullets(ctx, game) {
    game.bullets.forEach(bullet => {
      ctx.save();
      if (bullet.type === "basic") {
        // Iron cannonball
        const bg = ctx.createRadialGradient(bullet.x - 2, bullet.y - 2, 1, bullet.x, bullet.y, 6);
        bg.addColorStop(0, "#9e9e9e");
        bg.addColorStop(1, "#212121");
        ctx.fillStyle = bg;
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 1;
        ctx.shadowColor = "#000";
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        // Trailing smoke
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = "#aaa";
        ctx.beginPath();
        ctx.arc(bullet.x - 6, bullet.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      if (bullet.type === "freeze") {
        // Ice shard — pointy blue crystal
        ctx.shadowColor = "#29b6f6";
        ctx.shadowBlur = 10;
        ctx.fillStyle = "#b3e5fc";
        ctx.strokeStyle = "#0288d1";
        ctx.lineWidth = 1;
        const target = game.enemies.find(e => e.id === bullet.targetId);
        const a = target ? angleTo(bullet, target) : 0;
        ctx.save();
        ctx.translate(bullet.x, bullet.y);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(-4, -5);
        ctx.lineTo(-6, 0);
        ctx.lineTo(-4, 5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      if (bullet.type === "splash") {
        // Mortar bomb — black sphere with fuse
        ctx.shadowColor = "#555";
        ctx.shadowBlur = 8;
        ctx.fillStyle = "#212121";
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        // Fuse spark
        ctx.fillStyle = "#ff9800";
        ctx.shadowColor = "#ff5722";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(bullet.x + 5, bullet.y - 7, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#795548";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(bullet.x + 2, bullet.y - 5);
        ctx.quadraticCurveTo(bullet.x + 7, bullet.y - 9, bullet.x + 5, bullet.y - 7);
        ctx.stroke();
      }

      if (bullet.type === "sniper") {
        // Long brass casing
        const target = game.enemies.find(e => e.id === bullet.targetId);
        const rot = target ? angleTo(bullet, target) : 0;
        ctx.save();
        ctx.translate(bullet.x, bullet.y);
        ctx.rotate(rot);
        const bg2 = ctx.createLinearGradient(-8, 0, 12, 0);
        bg2.addColorStop(0, "#ffcc02");
        bg2.addColorStop(0.5, "#c8a000");
        bg2.addColorStop(1, "#ffd740");
        ctx.fillStyle = bg2;
        ctx.strokeStyle = "#a07800";
        ctx.lineWidth = 1;
        ctx.shadowColor = "#ffca28";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.roundRect(-8, -2.5, 18, 5, 2.5);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        // Tip
        ctx.fillStyle = "#e0e0e0";
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(14, -2);
        ctx.lineTo(14, 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      if (bullet.type === "rapid") {
        // Small orange pellet
        ctx.fillStyle = "#ff9800";
        ctx.shadowColor = "#ff6d00";
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        // Trail
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = "#ffcc02";
        ctx.beginPath();
        ctx.arc(bullet.x - 5, bullet.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      if (bullet.type === "chain") {
        const target = game.enemies.find(e => e.id === bullet.targetId);
        const rot = target ? angleTo(bullet, target) : 0;
        ctx.save();
        ctx.translate(bullet.x, bullet.y);
        ctx.rotate(rot);
        const chainG = ctx.createLinearGradient(-10, 0, 12, 0);
        chainG.addColorStop(0, bullet.specialSuper ? "#ffffff" : bullet.specialChain ? "#fff176" : "#ffcc80");
        chainG.addColorStop(0.5, bullet.specialSuper ? "#ffca28" : bullet.specialChain ? "#ff5722" : "#ef6c00");
        chainG.addColorStop(1, bullet.specialSuper ? "#b71c1c" : bullet.specialChain ? "#b71c1c" : "#8a2f00");
        ctx.fillStyle = chainG;
        ctx.strokeStyle = bullet.specialSuper || bullet.specialChain ? "#fff9c4" : "#5f1515";
        ctx.lineWidth = bullet.specialSuper ? 2.5 : bullet.specialChain ? 2 : 1.2;
        ctx.shadowColor = bullet.specialSuper ? "#ffca28" : bullet.specialChain ? "#ff5722" : "#ef6c00";
        ctx.shadowBlur = bullet.specialSuper ? 20 : bullet.specialChain ? 14 : 7;
        ctx.beginPath();
        ctx.roundRect(-9, -4.5, 18, 9, 5);
        ctx.fill();
        ctx.stroke();
        if (bullet.specialSuper) {
          ctx.strokeStyle = "rgba(255,249,196,0.95)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, 13, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (bullet.specialChain) {
          ctx.strokeStyle = "#fff176";
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(0, 0, 11, -0.5, Math.PI * 1.4);
          ctx.stroke();
        }
        ctx.restore();
      }

      ctx.restore();
    });
  }

  function drawBeams(ctx, game) {
    game.beams.forEach(beam => {
      ctx.save();
      const alpha = Math.max(0.2, beam.life / beam.maxLife);
      ctx.globalAlpha = alpha;
      const isChain = beam.type === "laser-chain";
      // Outer glow
      ctx.strokeStyle = isChain ? "#ce93d8" : "#7b1fa2";
      ctx.lineWidth = beam.width * 2.5;
      ctx.lineCap = "round";
      ctx.globalAlpha = alpha * 0.2;
      ctx.beginPath();
      ctx.moveTo(beam.x1, beam.y1);
      ctx.lineTo(beam.x2, beam.y2);
      ctx.stroke();
      // Core beam
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = isChain ? "#e040fb" : "#9c27b0";
      ctx.lineWidth = beam.width;
      ctx.shadowColor = isChain ? "#e040fb" : "#9c27b0";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(beam.x1, beam.y1);
      ctx.lineTo(beam.x2, beam.y2);
      ctx.stroke();
      // White hot center
      ctx.strokeStyle = "#f3e5f5";
      ctx.lineWidth = Math.max(1, beam.width * 0.28);
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(beam.x1, beam.y1);
      ctx.lineTo(beam.x2, beam.y2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
    });
  }

  function drawVortices(ctx, game, now) {
    if (!game.vortices?.length) return;
    game.vortices.forEach(vortex => {
      const progress = 1 - vortex.life / vortex.maxLife;
      const alpha = Math.max(0, vortex.life / vortex.maxLife);
      const pulse = 1 + Math.sin(now * 0.014) * 0.08;
      const visualRadius = Math.min(155, 60 + progress * 95) * pulse;
      ctx.save();
      ctx.translate(vortex.x, vortex.y);
      ctx.rotate(now * 0.006);
      ctx.globalAlpha = alpha * 0.55;
      const vg = ctx.createRadialGradient(0, 0, 8, 0, 0, visualRadius);
      vg.addColorStop(0, "rgba(255,249,196,0.95)");
      vg.addColorStop(0.28, "rgba(255,112,67,0.42)");
      vg.addColorStop(0.7, "rgba(183,28,28,0.18)");
      vg.addColorStop(1, "rgba(183,28,28,0)");
      ctx.fillStyle = vg;
      ctx.beginPath();
      ctx.arc(0, 0, visualRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,202,40,0.9)";
      ctx.lineWidth = 4;
      ctx.setLineDash([12, 10]);
      ctx.lineDashOffset = -now * 0.08;
      ctx.beginPath();
      ctx.arc(0, 0, visualRadius * 0.7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(255,112,67,0.85)";
      ctx.lineWidth = 3;
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        ctx.beginPath();
        ctx.arc(0, 0, visualRadius * 0.42, a, a + Math.PI * 0.55);
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  function drawExplosions(ctx, game) {
    game.explosions.forEach(explosion => {
      const progress = 1 - explosion.life / explosion.maxLife;
      const radius = explosion.radius * (0.2 + progress * 0.95);
      const alpha = Math.max(0, explosion.life / explosion.maxLife);
      ctx.save();
      // Dirt/smoke cloud
      ctx.globalAlpha = alpha * (explosion.type === "nuke" ? 0.25 : explosion.type === "vortex" ? 0.34 : 0.4);
      ctx.fillStyle = explosion.type === "chain" || explosion.type === "vortex" ? "#ff7043" : explosion.type === "nuke" ? "#fff176" : "#8d6e63";
      ctx.beginPath();
      ctx.arc(explosion.x, explosion.y, radius * 1.1, 0, Math.PI * 2);
      ctx.fill();
      // Fire core
      ctx.globalAlpha = alpha * (explosion.type === "nuke" ? 0.55 : 0.7);
      const fg = ctx.createRadialGradient(explosion.x, explosion.y, 0, explosion.x, explosion.y, radius * 0.8);
      if (explosion.type === "nuke") {
        fg.addColorStop(0, "#ffffff");
        fg.addColorStop(0.22, "#fff176");
        fg.addColorStop(0.55, "#ff9800");
        fg.addColorStop(1, "rgba(255,255,120,0)");
      } else if (explosion.type === "vortex") {
        fg.addColorStop(0, "#fff9c4");
        fg.addColorStop(0.3, "#ffca28");
        fg.addColorStop(0.72, "#ff7043");
        fg.addColorStop(1, "rgba(183,28,28,0)");
      } else if (explosion.type === "chain") {
        fg.addColorStop(0, "#fff9c4");
        fg.addColorStop(0.28, "#ff7043");
        fg.addColorStop(0.72, "#b71c1c");
        fg.addColorStop(1, "rgba(100,0,0,0)");
      } else {
        fg.addColorStop(0, "#fff9c4");
        fg.addColorStop(0.3, "#ff9800");
        fg.addColorStop(0.7, "#e64a19");
        fg.addColorStop(1, "rgba(100,30,0,0)");
      }
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(explosion.x, explosion.y, radius * 0.8, 0, Math.PI * 2);
      ctx.fill();
      // Shockwave ring
      ctx.globalAlpha = alpha * (explosion.type === "nuke" ? 0.85 : 0.5);
      ctx.strokeStyle = explosion.type === "chain" || explosion.type === "vortex" ? "#ff7043" : explosion.type === "nuke" ? "#fff176" : "#ff9800";
      ctx.lineWidth = explosion.type === "nuke" ? 7 + progress * 5 : 4 + progress * 3;
      ctx.beginPath();
      ctx.arc(explosion.x, explosion.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });
  }

  function drawDamagePopups(ctx, game) {
    game.damagePopups.forEach(popup => {
      const t = popup.life / 600;
      ctx.save();
      ctx.globalAlpha = Math.max(0, t);
      const scale = 0.85 + (1 - t) * 0.3;
      ctx.translate(popup.x, popup.y);
      ctx.scale(scale, scale);
      ctx.font = "bold 13px 'Nunito', sans-serif";
      ctx.textAlign = "center";
      ctx.strokeStyle = "rgba(0,0,0,0.65)";
      ctx.lineWidth = 3;
      ctx.strokeText(popup.text, 0, 0);
      ctx.fillStyle = popup.color;
      ctx.fillText(popup.text, 0, 0);
      ctx.restore();
    });
  }

  function drawTopOverlay(ctx, game) {
    ctx.save();
    // HUD panel
    ctx.fillStyle = "rgba(255,253,235,0.92)";
    ctx.strokeStyle = "rgba(150,180,80,0.6)";
    ctx.lineWidth = 1.5;
    ctx.shadowColor = "rgba(0,0,0,0.15)";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.roundRect(14, 12, 450, 46, 14);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    // Green top stripe
    ctx.fillStyle = "rgba(76,175,80,0.7)";
    ctx.beginPath();
    ctx.roundRect(14, 12, 450, 4, [14, 14, 0, 0]);
    ctx.fill();
    const items = [
      { label: "Wave", value: game.wave, icon: "🌊", x: 38 },
      { label: "Coins", value: Math.round(game.coins), icon: "🪙", x: 148 },
      { label: "HP", value: game.baseHealth, icon: "❤️", x: 258 },
      { label: "Score", value: game.score, icon: "⭐", x: 358 },
    ];
    items.forEach(item => {
      ctx.font = "11px 'Nunito', sans-serif";
      ctx.fillStyle = "#567a38";
      ctx.textAlign = "left";
      ctx.fillText(item.icon + " " + item.label, item.x, 30);
      ctx.font = "bold 16px 'Fredoka', sans-serif";
      ctx.fillStyle = item.label === "HP" && game.baseHealth <= 5 ? "#e53935" : "#2c3e1a";
      ctx.fillText(item.value, item.x + 2, 48);
    });
    ctx.restore();
  }

  function drawPauseBadge(ctx, text) {
    ctx.save();
    ctx.fillStyle = "rgba(255,253,235,0.95)";
    ctx.strokeStyle = "rgba(200,130,42,0.7)";
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(0,0,0,0.2)";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.roundRect(CANVAS_WIDTH / 2 - 130, 14, 260, 42, 14);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#8d5a1a";
    ctx.font = "bold 15px 'Fredoka', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, CANVAS_WIDTH / 2, 41);
    ctx.restore();
  }

  function drawGameOver(ctx) {
    ctx.save();
    ctx.fillStyle = "rgba(20,10,0,0.72)";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = "rgba(255,250,235,0.97)";
    ctx.strokeStyle = "rgba(180,80,40,0.8)";
    ctx.lineWidth = 3;
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.roundRect(CANVAS_WIDTH / 2 - 180, CANVAS_HEIGHT / 2 - 72, 360, 144, 24);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(180,60,20,0.9)";
    ctx.beginPath();
    ctx.roundRect(CANVAS_WIDTH / 2 - 180, CANVAS_HEIGHT / 2 - 72, 360, 4, [24, 24, 0, 0]);
    ctx.fill();
    ctx.fillStyle = "#c62828";
    ctx.font = "bold 38px 'Fredoka', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Game Over! 💀", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 16);
    ctx.fillStyle = "#6d4c41";
    ctx.font = "15px 'Nunito', sans-serif";
    ctx.fillText("Your base has fallen to the enemies.", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 18);
    ctx.fillStyle = "#9e9e9e";
    ctx.font = "12px 'Nunito', sans-serif";
    ctx.fillText("Press Restart to try again", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 46);
    ctx.restore();
  }

  // ─── GAME ACTIONS ─────────────────────────────────────────────────────────

  function startWave() {
    const game = gameRef.current;
    if (!game || game.gameOver) return;
    clearAutoWaveTimer();
    if (game.waveInProgress) { setMessage("Wave already in progress."); return; }
    launchWave(game);
    setMessage(`Wave ${game.wave} started.`);
    syncStateFromRef();
  }

  function makeQuestionModal(index) {
    if (!questions.length) return null;
    const q = questions[index % questions.length];
    return { question: q, choices: buildChoices(q, questions), startedAt: Date.now() };
  }

  function openQuestion() {
    if (!questions.length) { setMessage("No study questions found."); return; }
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
      setStreak(prev => prev + 1);
      setMessage(`Correct! +${earned} coins.`);
    } else {
      earned = 2;
      game.coins += earned;
      setStreak(0);
      setMessage(`Wrong. +2 coins. Correct answer: ${questionModal.question.correctAnswer}`);
    }
    syncStateFromRef();
    setAnswerFeedback({ isCorrect, selectedChoice: choice, correctAnswer: questionModal.question.correctAnswer, earned });
  }

  function continueAfterAnswer() {
    const nextIndex = (questionIndex + 1) % Math.max(questions.length, 1);
    setQuestionIndex(nextIndex);
    setAnswerFeedback(null);
    setQuestionModal(makeQuestionModal(nextIndex));
  }

  function setTowerPriority(priority) {
    const game = gameRef.current;
    if (!game || !selectedTowerId) return;
    const tower = game.towers.find(t => t.id === selectedTowerId);
    if (!tower) return;
    tower.targetPriority = priority;
    // Force a re-render so the popover updates
    syncStateFromRef();
  }

  function upgradeSelectedTower() {
    const game = gameRef.current;
    if (!game || !selectedTowerId) return;
    const tower = game.towers.find(t => t.id === selectedTowerId);
    if (!tower) return;
    if (tower.level >= MAX_TOWER_LEVEL) { setMessage("This tower is already max level."); return; }
    const upgradeCost = getUpgradeCost(tower);
    if (game.coins < upgradeCost) { setMessage(`Need ${upgradeCost} coins to upgrade.`); return; }
    game.coins -= upgradeCost;
    tower.level += 1;
    tower.spent = (tower.spent || TOWER_TYPES[tower.type].cost) + upgradeCost;
    setMessage(`${TOWER_TYPES[tower.type].name} upgraded to level ${tower.level}. ${TOWER_TYPES[tower.type].upgradeText[tower.level - 1]}`);
    syncStateFromRef();
  }

  function sellSelectedTower() {
    const game = gameRef.current;
    if (!game || !selectedTowerId) return;
    const tower = game.towers.find(t => t.id === selectedTowerId);
    if (!tower) return;
    const refund = Math.round((tower.spent || TOWER_TYPES[tower.type].cost) * 0.55);
    game.coins += refund;
    game.towers = game.towers.filter(t => t.id !== selectedTowerId);
    setSelectedTowerId(null);
    selectedTowerIdRef.current = null;
    setMessage(`Tower sold for ${refund} coins.`);
    syncStateFromRef();
  }

  // ─── JSX ──────────────────────────────────────────────────────────────────

  return (
    <div className="td-page">
      <div className="td-header compact">
        <div>
          <p className="td-eyebrow">🌿 Study Siege</p>
          <h1>{studySet?.title || "Tower Defense"}</h1>
        </div>
        <div className="td-header-actions">
          <button className="td-quiz-btn" onClick={openQuestion}>⚡ Answer Questions</button>
          <button onClick={() => {
            setIsRunning(prev => {
              const next = !prev;
              isRunningRef.current = next;
              if (!next) { clearAutoWaveTimer(); }
              else {
                const game = gameRef.current;
                if (game && !game.waveInProgress && game.nextWaveReady) scheduleAutoWave(1200, `Wave ${game.wave} started automatically.`);
              }
              return next;
            });
          }}>{isRunning ? "⏸ Pause" : "▶ Resume"}</button>
          <button onClick={startWave}>▶▶ Send Wave</button>
          <button onClick={resetGame}>↺ Restart</button>
          <button className="secondary" onClick={onExit}>✕ Exit</button>
        </div>
      </div>

      <div className="td-game-card">
        <div className="td-canvas-wrap">
          <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="td-canvas" />

          {selectedTower && selectedTowerStats && (
            <div className="tower-map-popover" style={canvasToPercent(selectedTower)}>
              <div className="tower-popover-head">
                <div className={`tower-shop-icon tower-${selectedTower.type}`}>{TOWER_TYPES[selectedTower.type].icon}</div>
                <div>
                  <strong>{TOWER_TYPES[selectedTower.type].name}</strong>
                  <span>Level {selectedTower.level}</span>
                </div>
                <button className="tower-popover-close" onClick={() => { setSelectedTowerId(null); selectedTowerIdRef.current = null; }}>×</button>
              </div>
              <div className="tower-mini-stats">
                <div><span>Dmg</span><strong>{Math.round(selectedTowerStats.damage)}</strong></div>
                <div><span>Range</span><strong>{Math.round(selectedTowerStats.range)}</strong></div>
                <div><span>Kills</span><strong>{selectedTower.kills || 0}</strong></div>
              </div>

              {/* Target priority selector */}
              {selectedTower.type !== "support" && (
                <div className="tower-priority-row">
                  <span className="tower-priority-label">🎯 Target</span>
                  <div className="tower-priority-btns">
                    {[
                      { key: "first",    label: "First",    emoji: "⏩" },
                      { key: "last",     label: "Last",     emoji: "⏪" },
                      { key: "strongest",label: "Strong",   emoji: "💪" },
                      { key: "weakest",  label: "Weak",     emoji: "🩸" },
                      { key: "closest",  label: "Close",    emoji: "📍" },
                    ].map(({ key, label, emoji }) => (
                      <button
                        key={key}
                        className={`priority-btn${(selectedTower.targetPriority || "first") === key ? " active" : ""}`}
                        onClick={() => setTowerPriority(key)}
                        title={label}
                      >
                        {emoji}<span>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <p>{TOWER_TYPES[selectedTower.type].upgradeText[selectedTower.level - 1]}</p>
              <div className="tower-popover-actions">
                <button onClick={upgradeSelectedTower} disabled={selectedTower.level >= MAX_TOWER_LEVEL}>
                  {selectedTower.level >= MAX_TOWER_LEVEL ? "✓ Maxed" : `▲ Upgrade ${selectedUpgradeCost}`}
                </button>
                <button className="sell" onClick={sellSelectedTower}>💰 Sell</button>
              </div>
            </div>
          )}
        </div>

        <div className="td-bottom-bar">
          <div className="td-message">{message}</div>
          <div className="td-bottom-stats">
            <div><span>Wave</span><strong>{wave}</strong></div>
            <div><span>Coins</span><strong>{coins}</strong></div>
            <div><span>Health</span><strong style={{ color: baseHealth > 8 ? "#2e7d32" : "#c62828" }}>{baseHealth}</strong></div>
            <div><span>Streak</span><strong style={{ color: streak >= 3 ? "#c8862a" : "inherit" }}>{streak}</strong></div>
          </div>
          <div className="td-tower-dock">
            {Object.entries(TOWER_TYPES).map(([key, tower]) => (
              <button key={key} className={selectedTowerType === key ? "dock-tower active" : "dock-tower"}
                onPointerDown={e => startTowerDrag(key, e)} onClick={() => setSelectedTowerType(key)}
                title={`${tower.name}: ${tower.description}`}>
                <div className={`dock-tower-icon tower-${key}`}>{tower.icon}</div>
                <div><strong>{tower.name}</strong><span>{tower.cost}</span></div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {draggingTower && (
        <div className={`floating-drag-tower ${draggingTower.valid ? "valid" : "invalid"}`}
          style={{ left: draggingTower.clientX, top: draggingTower.clientY }}>
          {TOWER_TYPES[draggingTower.type].icon}
        </div>
      )}

      {questionModal && (
        <div className="question-backdrop">
          <div className="question-modal">
            <div className="question-modal-header">
              <p>🌿 Earn Coins — Game Paused</p>
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
                  <button key={`${choice}-${index}`} className={className} onClick={() => answerQuestion(choice)} disabled={!!answerFeedback}>
                    {choice}
                  </button>
                );
              })}
            </div>
            {answerFeedback && (
              <div className={answerFeedback.isCorrect ? "answer-feedback correct-box" : "answer-feedback wrong-box"}>
                <strong>{answerFeedback.isCorrect ? "✓ Correct!" : "✗ Wrong answer"}</strong>
                <p>{answerFeedback.isCorrect ? `Nice job! You earned ${answerFeedback.earned} coins.` : `The correct answer is: ${answerFeedback.correctAnswer}`}</p>
                <button className="td-primary-btn" onClick={continueAfterAnswer}>Continue to Next Question →</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}