import React, { useEffect, useMemo, useRef, useState } from "react";
import "../../styles/SomethingHeardYou.css";

const CANVAS_W = 980;
const CANVAS_H = 620;
const CELL = 96;
const MAP_W = 25;
const MAP_H = 25;
const FOV = Math.PI / 2.65;
const RAYS = 360;
const MAX_DEPTH = CELL * 19;
const ITEM_COUNT = 6;
const MAX_FLOORS = 5;

const clamp = (v, mn, mx) => Math.max(mn, Math.min(mx, v));
const rand = (mn, mx) => Math.random() * (mx - mn) + mn;
const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const normAng = (a) => {
  while (a < -Math.PI) a += Math.PI * 2;
  while (a > Math.PI) a -= Math.PI * 2;
  return a;
};

const UPGRADE_POOL = [
  { key: "quiet", name: "Soft Step", desc: "Footstep noise range -18%. Sprinting is less suicidal.", max: 4 },
  { key: "battery", name: "Deep Cell", desc: "Battery capacity +20 and flashlight drains slower.", max: 4 },
  { key: "stamina", name: "Iron Lungs", desc: "Stamina capacity +18 and faster recovery.", max: 4 },
  { key: "sanity", name: "Cold Nerves", desc: "More sanity and less panic from darkness.", max: 4 },
  { key: "camera", name: "Brighter Flash", desc: "Camera stun range and duration increase.", max: 3 },
  { key: "flare", name: "Hotter Flares", desc: "Thrown flares last longer and distract harder.", max: 3 },
  { key: "map", name: "Dead Reckoning", desc: "Compass and security pings last longer.", max: 3 },
  { key: "life", name: "Refuse Death", desc: "Gain +1 maximum life once.", max: 1 },
];

const FLOOR_THEMES = [
  {
    name: "Asylum",
    wallA: "#46333b",
    wallB: "#22151d",
    floor: "#0c080a",
    ceiling: "#070406",
    fog: [16, 2, 4],
    eye: [255, 24, 24],
    monsterName: "The Crawler",
    monsterDesc: "Slow. Quiet. Watches from corners.",
    prefix: "PATIENT",
  },
  {
    name: "Morgue",
    wallA: "#31434a",
    wallB: "#10191d",
    floor: "#071014",
    ceiling: "#05090d",
    fog: [0, 12, 22],
    eye: [126, 213, 255],
    monsterName: "The Watcher",
    monsterDesc: "Teleports near motionless players.",
    prefix: "CASE",
  },
  {
    name: "Sewers",
    wallA: "#33412b",
    wallB: "#10180a",
    floor: "#060a04",
    ceiling: "#040604",
    fog: [0, 20, 5],
    eye: [84, 255, 84],
    monsterName: "The Mimic",
    monsterDesc: "Creates fake footsteps and false echoes.",
    prefix: "LOG",
  },
  {
    name: "Hotel",
    wallA: "#4c2524",
    wallB: "#170808",
    floor: "#100504",
    ceiling: "#070202",
    fog: [30, 0, 0],
    eye: [255, 126, 70],
    monsterName: "The Stalker",
    monsterDesc: "Only attacks in darkness, but follows forever.",
    prefix: "ROOM",
  },
  {
    name: "Listening Room",
    wallA: "#4a1830",
    wallB: "#10020a",
    floor: "#080205",
    ceiling: "#030103",
    fog: [26, 0, 14],
    eye: [255, 42, 143],
    monsterName: "The Listener",
    monsterDesc: "Every sound is bigger. Every mistake is permanent.",
    prefix: "TRANSCRIPT",
  },
];

const LORE_TEXTS = [
  [
    "PATIENT 047 — I can hear it breathing in the walls at night. The scratches are getting closer to my room.",
    "PATIENT 012 — It stood in my doorway for four hours. By morning, my roommate's bed was empty.",
    "STAFF NOTE — Ward C is wrong. Three missing in two weeks. The doors were locked from the inside.",
  ],
  [
    "CASE 14 — Subject found in cold storage Room 7. Eyes open. Body temperature below the room itself.",
    "CASE 31 — Camera failure from 02:14 to 02:19. When footage resumes, Dr. Mercer is gone.",
    "AUTOPSY NOTE — I have never seen wounds like these. I will not be returning tomorrow.",
  ],
  [
    "LOG 003 — We hear tapping on the pipes. It sounds like Morse. It spells STILL HERE.",
    "LOG 017 — It can smell fear. Breathing helps. I have been in this pipe for three days.",
    "LOG 029 — Do not touch the walls. Do not make noise. Do not stop moving.",
  ],
  [
    "ROOM 606 — The guest checked out in 1983. The room still calls the front desk every night.",
    "HOUSEKEEPING — Do not open rooms with red light under the door. Do not answer knocking from inside.",
    "MANAGER NOTE — The elevator descends below the basement when the building is empty.",
  ],
  [
    "TRANSCRIPT 1 — It heard me thinking. Audio captures no second voice, only a pulse under 20 Hz.",
    "TRANSCRIPT 4 — Microphones detected footsteps from inside the observation glass.",
    "FINAL TRANSCRIPT — If it stops chasing, do not relax. That means it is listening.",
  ],
];


function lightenHex(hex, amt = 0.2) {
  const raw = String(hex || "#000000").replace("#", "");
  if (raw.length !== 6) return hex;
  const n = parseInt(raw, 16);
  const r = clamp(((n >> 16) & 255) + 255 * amt, 0, 255);
  const g = clamp(((n >> 8) & 255) + 255 * amt, 0, 255);
  const b = clamp((n & 255) + 255 * amt, 0, 255);
  return `rgb(${Math.floor(r)},${Math.floor(g)},${Math.floor(b)})`;
}

function defaultUpgrades() {
  return { quiet: 0, battery: 0, stamina: 0, sanity: 0, camera: 0, flare: 0, map: 0, life: 0 };
}
function statMax(upgrades, key) {
  const up = upgrades || defaultUpgrades();
  if (key === "battery") return 100 + up.battery * 20;
  if (key === "stamina") return 100 + up.stamina * 18;
  if (key === "sanity") return 100 + up.sanity * 15;
  if (key === "hp") return 3 + up.life;
  return 100;
}
function chooseUpgradeOptions(player) {
  const upgrades = player?.upgrades || defaultUpgrades();
  return UPGRADE_POOL.filter((u) => (upgrades[u.key] || 0) < u.max)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);
}

function makeMaze() {
  const grid = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(1));
  const stack = [{ x: 1, y: 1 }];
  grid[1][1] = 0;
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const dirs = [
      { x: 2, y: 0 },
      { x: -2, y: 0 },
      { x: 0, y: 2 },
      { x: 0, y: -2 },
    ].sort(() => Math.random() - 0.5);
    let carved = false;
    for (const d of dirs) {
      const nx = cur.x + d.x;
      const ny = cur.y + d.y;
      if (nx > 0 && ny > 0 && nx < MAP_W - 1 && ny < MAP_H - 1 && grid[ny][nx] === 1) {
        grid[cur.y + d.y / 2][cur.x + d.x / 2] = 0;
        grid[ny][nx] = 0;
        stack.push({ x: nx, y: ny });
        carved = true;
        break;
      }
    }
    if (!carved) stack.pop();
  }

  for (let y = 2; y < MAP_H - 2; y++) {
    for (let x = 2; x < MAP_W - 2; x++) {
      if (grid[y][x] === 1 && Math.random() < 0.12) grid[y][x] = 0;
    }
  }
  for (let i = 0; i < 18; i++) {
    const rx = 2 + Math.floor(Math.random() * (MAP_W - 5));
    const ry = 2 + Math.floor(Math.random() * (MAP_H - 5));
    const rw = 2 + Math.floor(Math.random() * 3);
    const rh = 2 + Math.floor(Math.random() * 3);
    for (let yy = ry; yy < ry + rh && yy < MAP_H - 1; yy++) {
      for (let xx = rx; xx < rx + rw && xx < MAP_W - 1; xx++) grid[yy][xx] = 0;
    }
  }
  grid[1][1] = 0;
  grid[MAP_H - 2][MAP_W - 2] = 0;
  return grid;
}

function isWall(grid, x, y) {
  const gx = Math.floor(x / CELL);
  const gy = Math.floor(y / CELL);
  return gx < 0 || gy < 0 || gx >= MAP_W || gy >= MAP_H || grid[gy][gx] === 1;
}
function isOpenCell(grid, gx, gy) {
  return gx > 0 && gy > 0 && gx < MAP_W - 1 && gy < MAP_H - 1 && grid[gy][gx] === 0;
}
function cellCenter(gx, gy) {
  return { x: gx * CELL + CELL / 2, y: gy * CELL + CELL / 2 };
}
function randomOpenCell(grid, used, minDistFromStart = 0) {
  const start = cellCenter(1, 1);
  for (let tries = 0; tries < 800; tries++) {
    const gx = 1 + Math.floor(Math.random() * (MAP_W - 2));
    const gy = 1 + Math.floor(Math.random() * (MAP_H - 2));
    const key = `${gx},${gy}`;
    const pos = cellCenter(gx, gy);
    if (isOpenCell(grid, gx, gy) && !used.has(key) && dist(pos, start) >= minDistFromStart) {
      used.add(key);
      return { ...pos, gx, gy };
    }
  }
  return cellCenter(1, 1);
}

function createFloor(floorNum = 1, previousPlayer = null) {
  const grid = makeMaze();
  const used = new Set(["1,1", `${MAP_W - 2},${MAP_H - 2}`]);
  const theme = FLOOR_THEMES[Math.min(floorNum - 1, FLOOR_THEMES.length - 1)];
  const spawn = cellCenter(1, 1);
  const exit = cellCenter(MAP_W - 2, MAP_H - 2);

  const player = previousPlayer
    ? {
        ...previousPlayer,
        x: spawn.x,
        y: spawn.y,
        angle: 0,
        pitch: 0,
        targetPitch: 0,
        bob: 0,
        vx: 0,
        vy: 0,
        invuln: 2200,
        hidden: false,
        stunned: 0,
        flashlightOff: false,
      }
    : {
        x: spawn.x,
        y: spawn.y,
        angle: 0,
        pitch: 0,
        targetPitch: 0,
        bob: 0,
        vx: 0,
        vy: 0,
        hp: 3,
        battery: 100,
        stamina: 100,
        sanity: 100,
        maxBattery: 100,
        maxStamina: 100,
        maxSanity: 100,
        maxHp: 3,
        flashlightOff: false,
        hasLighter: false,
        flares: 0,
        hasCamera: false,
        cameraCharge: 100,
        hasStunGun: false,
        stunAmmo: 0,
        scraps: 0,
        noise: 0,
        upgrades: defaultUpgrades(),
      };
  player.upgrades = player.upgrades || defaultUpgrades();
  player.maxBattery = statMax(player.upgrades, "battery");
  player.maxStamina = statMax(player.upgrades, "stamina");
  player.maxSanity = statMax(player.upgrades, "sanity");
  player.maxHp = statMax(player.upgrades, "hp");
  player.hp = clamp(player.hp, 1, player.maxHp);
  player.battery = clamp(player.battery, 0, player.maxBattery);
  player.sanity = clamp(player.sanity, 0, player.maxSanity);
  player.stamina = clamp(player.stamina, 0, player.maxStamina);
  player.pitch = clamp(player.pitch || 0, -0.55, 0.55);
  player.targetPitch = clamp(player.targetPitch || player.pitch || 0, -0.55, 0.55);
  player.vx = player.vx || 0;
  player.vy = player.vy || 0;

  const makeItem = (type, minDist, extra = {}) => ({
    id: `${type}-${Math.random().toString(16).slice(2)}`,
    type,
    collected: false,
    pulse: Math.random() * Math.PI * 2,
    ...randomOpenCell(grid, used, minDist),
    ...extra,
  });

  const items = Array.from({ length: ITEM_COUNT }, (_, i) =>
    makeItem("fragment", CELL * 7, { label: choice(["TAPE", "IDOL", "BONE", "MASK", "RELIC", "EYE", "TOOTH", "KEY"]), index: i })
  );
  const lores = Array.from({ length: 3 }, (_, i) => makeItem("lore", CELL * 4, { text: LORE_TEXTS[floorNum - 1]?.[i] || LORE_TEXTS[0][i] }));
  const batteries = Array.from({ length: 6 }, () => makeItem("battery", CELL * 2));
  const medkits = Array.from({ length: 3 }, () => makeItem("medkit", CELL * 3));
  const flares = Array.from({ length: 3 }, () => makeItem("flare", CELL * 3));
  const ammo = Array.from({ length: 4 }, () => makeItem("ammo", CELL * 4, { amount: floorNum >= 3 ? 2 : 1 }));
  const lighter = makeItem("lighter", CELL * 3, { collected: !!previousPlayer?.hasLighter });
  const cameraItem = makeItem("camera", CELL * 4, { collected: !!previousPlayer?.hasCamera });
  const stunGunItem = makeItem("stungun", CELL * 5, { collected: !!previousPlayer?.hasStunGun });

  const specials = [
    { type: "breaker", name: "Breaker Room", desc: "restores lights nearby, but screams" },
    { type: "security", name: "Security Terminal", desc: "reveals monster and objective briefly" },
    { type: "supply", name: "Supply Closet", desc: "battery, sanity, and a flare" },
    { type: "altar", name: "Cursed Altar", desc: "+1 shard, huge noise" },
    { type: "archive", name: "Archive", desc: "read files for map info" },
    { type: "ritual", name: "Ritual Circle", desc: "+1 shard, instant hunt" },
  ].map((sp) => makeItem("special", CELL * 3, { ...sp, used: false }));

  const traps = floorNum >= 2
    ? Array.from({ length: 4 + floorNum * 2 }, () => makeItem("trap", CELL * 2, { trapType: choice(["glass", "wire", floorNum >= 3 ? "bear" : "glass"]), triggered: false }))
    : [];

  const monsterStart = randomOpenCell(grid, used, CELL * 10);
  return {
    grid,
    floorNum,
    theme,
    player,
    monster: {
      x: monsterStart.x,
      y: monsterStart.y,
      angle: 0,
      mode: "stalk",
      target: null,
      stun: 0,
      anger: 0,
      seenTimer: 0,
      lastKnown: null,
      blinkTimer: 0,
      baseSpeed: 1.65 + floorNum * 0.12,
    },
    exit: { ...exit, active: false, pulse: 0 },
    items,
    lores,
    batteries,
    medkits,
    lighter,
    flares,
    cameraItem,
    stunGunItem,
    ammo,
    specials,
    traps,
    activeFlares: [],
    noisePulses: [],
    hallucinations: [],
    collected: 0,
    finalPhase: false,
    dead: false,
    won: false,
    floorComplete: false,
    awaitingUpgrade: false,
    upgradeOptions: [],
    securityPing: 0,
    event: null,
    eventTimer: rand(14000, 26000),
    scare: null,
    loreRead: null,
    message: `${theme.name.toUpperCase()} — FLOOR ${floorNum}. Find the ${ITEM_COUNT} signal fragments. ${theme.monsterName}: ${theme.monsterDesc}`,
    hauntTimer: rand(4500, 9500),
    time: 0,
    glitch: 0,
    inverted: 0,
    trapped: 0,
    lastPlayerPos: { x: player.x, y: player.y },
    stillTimer: 0,
  };
}

function castRay(grid, ox, oy, angle) {
  let depth = 0;
  const step = 3;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  while (depth < MAX_DEPTH) {
    const x = ox + cos * depth;
    const y = oy + sin * depth;
    if (isWall(grid, x, y)) {
      const gx = Math.floor(x / CELL);
      const gy = Math.floor(y / CELL);
      const lx = x - gx * CELL;
      const ly = y - gy * CELL;
      const edge = Math.min(lx, CELL - lx, ly, CELL - ly);
      const vertical = Math.min(lx, CELL - lx) < Math.min(ly, CELL - ly);
      return { depth, x, y, vertical, edge };
    }
    depth += step;
  }
  return { depth: MAX_DEPTH, x: ox + cos * MAX_DEPTH, y: oy + sin * MAX_DEPTH, vertical: false, edge: 0 };
}

function hasLineOfSight(grid, a, b) {
  const d = dist(a, b);
  const steps = Math.max(2, Math.floor(d / 18));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (isWall(grid, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false;
  }
  return true;
}

function moveEntity(grid, ent, angle, amount, radius = 18) {
  const mx = Math.cos(angle) * amount;
  const my = Math.sin(angle) * amount;
  moveEntityVector(grid, ent, mx, my, radius);
}

function moveEntityVector(grid, ent, mx, my, radius = 18) {
  const nx = ent.x + mx;
  const ny = ent.y + my;
  if (!isWall(grid, nx + Math.sign(mx || 0) * radius, ent.y) && !isWall(grid, nx, ent.y - radius * 0.55) && !isWall(grid, nx, ent.y + radius * 0.55)) ent.x = nx;
  else ent.vx = 0;
  if (!isWall(grid, ent.x, ny + Math.sign(my || 0) * radius) && !isWall(grid, ent.x - radius * 0.55, ny) && !isWall(grid, ent.x + radius * 0.55, ny)) ent.y = ny;
  else ent.vy = 0;
}

export default function SomethingHeardYou({ onExit }) {
  const canvasRef = useRef(null);
  const cardRef = useRef(null);
  const keysRef = useRef({});
  const runRef = useRef(null);
  const rafRef = useRef(null);
  const lastRef = useRef(performance.now());
  const [started, setStarted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [run, setRun] = useState(() => {
    const initial = createFloor(1);
    runRef.current = initial;
    return initial;
  });

  const horrorLines = useMemo(() => [
    "Something is walking where the hallway should end.",
    "The walls are breathing again.",
    "You hear your own footsteps answer back.",
    "That door was not open before.",
    "It only needs to hear you once.",
    "Your flashlight catches teeth, then nothing.",
    "The ceiling clicked.",
    "Do not trust the quiet.",
    "It is learning your route.",
    "The exit is lying to you.",
  ], []);

  useEffect(() => { runRef.current = run; }, [run]);

  function restart() {
    const fresh = createFloor(1);
    runRef.current = fresh;
    setRun(fresh);
    setStarted(true);
    lastRef.current = performance.now();
    canvasRef.current?.focus?.();
  }

  function makeNoise(r, x, y, power, fake = false) {
    const quiet = 1 - (r.player.upgrades.quiet || 0) * 0.18;
    const boost = r.floorNum >= 5 || r.event?.type === "listening" ? 1.35 : 1;
    const pwr = Math.max(20, power * quiet * boost);
    if (!fake) r.player.noise = clamp(r.player.noise + pwr * 0.18, 0, 100);
    r.noisePulses.push({ x, y, r: 6, max: pwr, alpha: fake ? 0.35 : 0.8, fake });
    if (fake) return;
    const d = dist({ x, y }, r.monster);
    if (d < pwr + 180) {
      r.monster.mode = d < pwr * 0.72 ? "chase" : "investigate";
      r.monster.target = { x, y };
      r.monster.lastKnown = { x, y };
      r.monster.anger = clamp(r.monster.anger + 18, 0, 100);
      if (d < pwr * 0.72) r.message = "It heard that.";
    }
  }

  function scare(r, text = "RUN") {
    r.scare = { text, timer: 980, seed: Math.random() };
    r.player.sanity = clamp(r.player.sanity - 24, 0, r.player.maxSanity);
    r.glitch = Math.max(r.glitch, 0.9);
  }

  function pickupNearby() {
    const r = runRef.current;
    if (!r || r.dead || r.won || r.floorComplete) return;
    const p = r.player;
    const near = (obj, range = 62) => !obj.collected && dist(p, obj) < range;

    for (const sp of r.specials) {
      if (!sp.used && dist(p, sp) < 70) {
        sp.used = true;
        if (sp.type === "breaker") {
          r.securityPing = 3500;
          makeNoise(r, sp.x, sp.y, 260);
          r.message = "Breaker restored emergency lights. The switch screamed through the walls.";
        } else if (sp.type === "security") {
          r.securityPing = 9000 + (p.upgrades.map || 0) * 3000;
          makeNoise(r, sp.x, sp.y, 110);
          r.message = "Security terminal online. Monster and objective revealed briefly.";
        } else if (sp.type === "supply") {
          p.flares += 1;
          p.battery = clamp(p.battery + 45, 0, p.maxBattery);
          p.sanity = clamp(p.sanity + 12, 0, p.maxSanity);
          makeNoise(r, sp.x, sp.y, 85);
          r.message = "Supply closet looted: flare, battery, and a little calm.";
        } else if (sp.type === "altar") {
          p.scraps += 1;
          p.sanity = clamp(p.sanity - 22, 0, p.maxSanity);
          makeNoise(r, sp.x, sp.y, 280);
          r.monster.mode = "chase";
          r.monster.target = { x: p.x, y: p.y };
          r.message = "Cursed shard taken. It knows exactly where you are.";
        } else if (sp.type === "archive") {
          p.scraps += Math.random() < 0.5 ? 1 : 0;
          p.sanity = clamp(p.sanity - 8, 0, p.maxSanity);
          r.securityPing = 5000;
          makeNoise(r, sp.x, sp.y, 70);
          r.message = "Archive decoded. The building makes more sense and less sense.";
        } else if (sp.type === "ritual") {
          p.scraps += 1;
          makeNoise(r, sp.x, sp.y, 340);
          r.monster.mode = "chase";
          r.monster.target = { x: p.x, y: p.y };
          scare(r, "FOUND");
          r.message = "Ritual circle broken. +1 shard. Run.";
        }
        setRun({ ...r });
        return;
      }
    }

    for (const lore of r.lores) {
      if (near(lore, 62)) {
        lore.collected = true;
        r.loreRead = { text: lore.text, timer: 6500 };
        p.sanity = clamp(p.sanity - 12, 0, p.maxSanity);
        makeNoise(r, p.x, p.y, 75);
        if (Math.random() < 0.5) scare(r, "READ");
        setRun({ ...r });
        return;
      }
    }

    for (const item of r.items) {
      if (near(item, 62)) {
        item.collected = true;
        r.collected += 1;
        p.sanity = clamp(p.sanity - 8, 0, p.maxSanity);
        makeNoise(r, p.x, p.y, 235);
        if (r.collected >= ITEM_COUNT) {
          r.exit.active = true;
          r.finalPhase = true;
          r.monster.mode = "chase";
          r.monster.target = { x: p.x, y: p.y };
          r.message = "ALL FRAGMENTS FOUND. EXIT IS OPEN. IT IS RUNNING.";
          scare(r, "EXIT");
        } else r.message = `${ITEM_COUNT - r.collected} fragments remain. The relic screamed.`;
        setRun({ ...r });
        return;
      }
    }

    for (const bat of r.batteries) if (near(bat, 58)) {
      bat.collected = true;
      p.battery = clamp(p.battery + 42, 0, p.maxBattery);
      p.flashlightOff = false;
      makeNoise(r, p.x, p.y, 55);
      r.message = "Battery found.";
      setRun({ ...r });
      return;
    }
    for (const med of r.medkits) if (near(med, 58)) {
      med.collected = true;
      p.hp = clamp(p.hp + 1, 0, p.maxHp);
      p.sanity = clamp(p.sanity + 20, 0, p.maxSanity);
      makeNoise(r, p.x, p.y, 60);
      r.message = "Medkit found. Your breathing steadies.";
      setRun({ ...r });
      return;
    }
    for (const fl of r.flares) if (near(fl, 58)) {
      fl.collected = true;
      p.flares += 1;
      makeNoise(r, p.x, p.y, 55);
      r.message = `Flare found. Press Q to throw. Flares: ${p.flares}.`;
      setRun({ ...r });
      return;
    }
    for (const am of r.ammo) if (near(am, 58)) {
      am.collected = true;
      p.stunAmmo += am.amount || 1;
      makeNoise(r, p.x, p.y, 55);
      r.message = `Stun ammo found. Shots: ${p.stunAmmo}.`;
      setRun({ ...r });
      return;
    }
    if (r.lighter && near(r.lighter, 58)) {
      r.lighter.collected = true;
      p.hasLighter = true;
      makeNoise(r, p.x, p.y, 55);
      r.message = "Lighter found. Dim infinite light.";
      setRun({ ...r });
      return;
    }
    if (r.cameraItem && near(r.cameraItem, 58)) {
      r.cameraItem.collected = true;
      p.hasCamera = true;
      p.cameraCharge = 100;
      makeNoise(r, p.x, p.y, 55);
      r.message = "Camera found. Press C for a close-range flash stun.";
      setRun({ ...r });
      return;
    }
    if (r.stunGunItem && near(r.stunGunItem, 58)) {
      r.stunGunItem.collected = true;
      p.hasStunGun = true;
      p.stunAmmo += 2;
      makeNoise(r, p.x, p.y, 110);
      r.message = `Stun pistol found. Press R to fire. Ammo: ${p.stunAmmo}.`;
      setRun({ ...r });
      return;
    }

    if (r.exit.active && dist(p, r.exit) < 78) {
      r.floorComplete = true;
      if (r.floorNum >= MAX_FLOORS) {
        r.won = true;
        r.message = "You made it out. It is still inside, waiting for another sound.";
        scare(r, "ESCAPED");
      } else {
        p.scraps += 1;
        r.awaitingUpgrade = true;
        r.upgradeOptions = chooseUpgradeOptions(p);
        r.message = `Floor ${r.floorNum} cleared. Choose an upgrade.`;
      }
      setRun({ ...r });
    }
  }

  function throwFlare() {
    const r = runRef.current;
    if (!r || r.dead || r.won || r.player.flares <= 0) return;
    const p = r.player;
    p.flares -= 1;
    const f = { x: p.x, y: p.y, timer: 9500 + (p.upgrades.flare || 0) * 2500, radius: 270 + (p.upgrades.flare || 0) * 40 };
    for (let i = 0; i < 7; i++) moveEntity(r.grid, f, p.angle, 34, 10);
    r.activeFlares.push(f);
    makeNoise(r, f.x, f.y, 205);
    r.message = "Flare thrown. It will go look.";
    setRun({ ...r });
  }

  function useCamera() {
    const r = runRef.current;
    if (!r || !r.player.hasCamera || r.player.cameraCharge < 30) return;
    const p = r.player;
    p.cameraCharge -= 30;
    r.glitch = Math.max(r.glitch, 0.65);
    const d = dist(p, r.monster);
    const facing = Math.abs(normAng(Math.atan2(r.monster.y - p.y, r.monster.x - p.x) - p.angle));
    const range = 360 + (p.upgrades.camera || 0) * 90;
    if (d < range && facing < 0.7 && hasLineOfSight(r.grid, p, r.monster)) {
      r.monster.stun = 3000 + (p.upgrades.camera || 0) * 700;
      r.monster.mode = "stalk";
      r.message = "Camera flash stunned it.";
      scare(r, "FLASH");
    } else r.message = "Camera flash missed. Save it for when it is in front of you.";
    setRun({ ...r });
  }

  function fireStunGun() {
    const r = runRef.current;
    if (!r || r.dead || r.won) return;
    const p = r.player;
    if (!p.hasStunGun) { r.message = "No stun pistol yet. Find the blue case."; setRun({ ...r }); return; }
    if (p.stunAmmo <= 0) { r.message = "Stun pistol empty. Find blue ammo boxes."; setRun({ ...r }); return; }
    p.stunAmmo -= 1;
    makeNoise(r, p.x, p.y, 360);
    r.gunFlash = 170;
    const d = dist(p, r.monster);
    const facing = Math.abs(normAng(Math.atan2(r.monster.y - p.y, r.monster.x - p.x) - p.angle));
    if (d < 620 && facing < 0.18 && hasLineOfSight(r.grid, p, r.monster)) {
      r.monster.stun = 4300;
      r.monster.mode = "stalk";
      r.message = `Direct hit. It is stunned for 4 seconds. Ammo left: ${p.stunAmmo}.`;
    } else {
      r.monster.mode = "chase";
      r.monster.target = { x: p.x, y: p.y };
      r.message = `Shot missed. It heard exactly where you are. Ammo left: ${p.stunAmmo}.`;
    }
    setRun({ ...r });
  }

  function applyUpgradeChoice(index) {
    const r = runRef.current;
    if (!r?.awaitingUpgrade) return;
    const up = r.upgradeOptions[index];
    const p = r.player;
    if (up) {
      p.upgrades[up.key] = clamp((p.upgrades[up.key] || 0) + 1, 0, up.max);
      if (p.scraps > 0) p.scraps -= 1;
      p.maxBattery = statMax(p.upgrades, "battery");
      p.maxStamina = statMax(p.upgrades, "stamina");
      p.maxSanity = statMax(p.upgrades, "sanity");
      p.maxHp = statMax(p.upgrades, "hp");
      p.battery = clamp(p.battery + 30, 0, p.maxBattery);
      p.stamina = p.maxStamina;
      p.sanity = clamp(p.sanity + 25, 0, p.maxSanity);
      p.hp = clamp(p.hp + 1, 0, p.maxHp);
    }
    const next = createFloor(r.floorNum + 1, p);
    next.message = up ? `Upgrade installed: ${up.name}.` : "No upgrade chosen. Going deeper.";
    runRef.current = next;
    setRun(next);
  }

  function startEvent(r) {
    const ev = choice([
      { type: "brownout", name: "BROWNOUT", timer: 5200, msg: "Brownout. The building exhales. Keep moving." },
      { type: "hunt", name: "BLOOD HUNT", timer: 9000, msg: "Blood hunt. It moves faster." },
      { type: "listening", name: "LISTENING HOUR", timer: 10500, msg: "Listening hour. Every sound carries farther." },
      { type: "whispers", name: "WHISPER STORM", timer: 10000, msg: "Whispers flood the vents. Your mind is slipping." },
    ]);
    r.event = ev;
    r.message = ev.msg;
    if (ev.type === "hunt") {
      r.monster.mode = "investigate";
      r.monster.target = { x: r.player.x, y: r.player.y };
    }
  }

  function updateMonster(r, dt) {
    const p = r.player;
    const m = r.monster;
    if (m.stun > 0) { m.stun -= dt; return; }

    const d = dist(p, m);
    const los = d < (r.finalPhase ? 850 : 620) && hasLineOfSight(r.grid, m, p);
    const darkAttack = r.floorNum !== 4 || p.flashlightOff || p.battery <= 0 || r.finalPhase || d < 140;
    if (los && darkAttack) {
      m.mode = "chase";
      m.target = { x: p.x, y: p.y };
      m.lastKnown = { x: p.x, y: p.y };
      m.seenTimer += dt;
    } else if (m.mode === "chase" && m.lastKnown) {
      m.target = m.lastKnown;
      if (dist(m, m.lastKnown) < 50) m.mode = "investigate";
    }

    if (r.floorNum === 2) {
      if (dist(p, r.lastPlayerPos) < 6) r.stillTimer += dt;
      else { r.stillTimer = 0; r.lastPlayerPos = { x: p.x, y: p.y }; }
      if (r.stillTimer > 6200 && m.mode !== "chase") {
        const a = p.angle + Math.PI + rand(-0.8, 0.8);
        const blink = { x: p.x, y: p.y };
        for (let i = 0; i < 9; i++) moveEntity(r.grid, blink, a, 42, 16);
        m.x = blink.x;
        m.y = blink.y;
        m.mode = "investigate";
        m.target = { x: p.x, y: p.y };
        r.stillTimer = 0;
        scare(r, "BLINK");
        r.message = "You stood still too long.";
      }
    }
    if (r.floorNum === 3) {
      m.blinkTimer -= dt;
      if (m.blinkTimer <= 0) {
        const a = rand(0, Math.PI * 2);
        makeNoise(r, p.x + Math.cos(a) * rand(140, 300), p.y + Math.sin(a) * rand(140, 300), 150, true);
        m.blinkTimer = rand(3500, 7000);
      }
    }

    if (m.mode === "stalk") {
      if (!m.target || dist(m, m.target) < 60 || Math.random() < 0.01) {
        const a = rand(0, Math.PI * 2);
        m.target = { x: p.x + Math.cos(a) * rand(360, 900), y: p.y + Math.sin(a) * rand(360, 900) };
      }
    }
    if (m.mode === "investigate" && (!m.target || dist(m, m.target) < 58)) {
      m.mode = "stalk";
      m.target = null;
    }
    const target = m.mode === "chase" ? p : m.target;
    if (target) {
      let spd = m.mode === "chase" ? m.baseSpeed + 0.75 : m.mode === "investigate" ? m.baseSpeed + 0.25 : 1.18 + r.floorNum * 0.08;
      if (r.finalPhase) spd += 0.45;
      if (r.event?.type === "hunt") spd += 0.6;
      if (r.floorNum >= 5) spd += 0.25;
      const ang = Math.atan2(target.y - m.y, target.x - m.x);
      m.angle = ang;
      moveEntity(r.grid, m, ang, spd * (dt / 16.67), 24);
      if (isWall(r.grid, m.x, m.y)) {
        m.x = target.x + Math.cos(ang + Math.PI) * 150;
        m.y = target.y + Math.sin(ang + Math.PI) * 150;
      }
    }
  }

  function checkTraps(r) {
    const p = r.player;
    for (const t of r.traps) {
      if (t.triggered || dist(p, t) > 34) continue;
      t.triggered = true;
      if (t.trapType === "bear") {
        p.hp -= 1;
        r.trapped = 3300;
        scare(r, "TRAPPED");
        r.message = p.hp <= 0 ? "The dark learned your name." : `Bear trap. ${p.hp} lives remaining.`;
        if (p.hp <= 0) r.dead = true;
      } else {
        makeNoise(r, t.x, t.y, 280);
        p.sanity = clamp(p.sanity - 10, 0, p.maxSanity);
        r.message = t.trapType === "wire" ? "Tripwire snapped. It heard that." : "Glass shattered under your foot.";
      }
    }
  }

  function updateGame(dtMs) {
    const r = runRef.current;
    if (!r || !started || r.dead || r.won) return;
    if (r.floorComplete && !r.won) { r.time += dtMs; setRun({ ...r }); return; }
    const dt = Math.min(dtMs, 34);
    const p = r.player;
    const keys = keysRef.current;
    r.time += dt;
    r.glitch = Math.max(0, r.glitch - dt / 1350);
    r.eventTimer -= dt;
    if (r.event) {
      r.event.timer -= dt;
      if (r.event.type === "whispers") p.sanity = clamp(p.sanity - dt * 0.004, 0, p.maxSanity);
      if (r.event.timer <= 0) {
        r.event = null;
        r.eventTimer = rand(15000, 28000) - r.floorNum * 900;
        r.message = "The building settles. For now.";
      }
    } else if (r.eventTimer <= 0) startEvent(r);

    if (p.invuln > 0) p.invuln -= dt;
    if (r.inverted > 0) r.inverted -= dt;
    if (r.trapped > 0) r.trapped -= dt;
    if (r.loreRead) { r.loreRead.timer -= dt; if (r.loreRead.timer <= 0) r.loreRead = null; }
    if (r.scare) { r.scare.timer -= dt; if (r.scare.timer <= 0) r.scare = null; }
    if (r.gunFlash) r.gunFlash = Math.max(0, r.gunFlash - dt);
    r.securityPing = Math.max(0, r.securityPing - dt);
    r.exit.pulse += dt * 0.004;
    p.noise = clamp(p.noise - dt * 0.055, 0, 100);

    let turn = 0;
    if (keys.arrowleft) turn -= 1;
    if (keys.arrowright) turn += 1;
    p.angle = normAng(p.angle + turn * 0.045 * (dt / 16.67));

    let forward = 0;
    let strafe = 0;
    const inv = r.inverted > 0 ? -1 : 1;
    if (keys.w || keys.arrowup) forward += inv;
    if (keys.s || keys.arrowdown) forward -= inv;
    if (keys.a) strafe -= inv;
    if (keys.d) strafe += inv;
    const moving = forward !== 0 || strafe !== 0;
    const crouch = keys.control || keys.ctrl;
    const sprint = moving && keys.shift && !crouch && p.stamina > 7 && r.trapped <= 0;
    const speed = crouch ? 1.25 : sprint ? 3.55 : r.trapped > 0 ? 0.8 : 2.15;
    const frame = dt / 16.67;
    p.targetPitch = clamp(p.targetPitch || 0, -0.55, 0.55);
    p.pitch += (p.targetPitch - p.pitch) * clamp(dt / 95, 0, 1);

    if (moving) {
      const mag = Math.hypot(forward, strafe) || 1;
      const f = forward / mag;
      const st = strafe / mag;
      const targetVx = (Math.cos(p.angle) * f + Math.cos(p.angle + Math.PI / 2) * st) * speed;
      const targetVy = (Math.sin(p.angle) * f + Math.sin(p.angle + Math.PI / 2) * st) * speed;
      const accel = sprint ? 0.32 : crouch ? 0.18 : 0.24;
      p.vx += (targetVx - p.vx) * accel;
      p.vy += (targetVy - p.vy) * accel;
      moveEntityVector(r.grid, p, p.vx * frame, p.vy * frame, 19);
      p.bob += dt * (sprint ? 0.018 : crouch ? 0.005 : 0.010);
      if (sprint) {
        p.stamina = clamp(p.stamina - dt * 0.075, 0, p.maxStamina);
        if (Math.random() < 0.052) makeNoise(r, p.x, p.y, 175);
      } else if (crouch) {
        if (Math.random() < 0.0045) makeNoise(r, p.x, p.y, 28);
      } else if (Math.random() < 0.010) makeNoise(r, p.x, p.y, 60);
    } else {
      p.vx *= Math.pow(0.72, frame);
      p.vy *= Math.pow(0.72, frame);
      if (Math.hypot(p.vx, p.vy) > 0.03) moveEntityVector(r.grid, p, p.vx * frame, p.vy * frame, 19);
      p.stamina = clamp(p.stamina + dt * (0.028 + (p.upgrades.stamina || 0) * 0.006), 0, p.maxStamina);
    }

    if (!sprint) p.stamina = clamp(p.stamina + dt * 0.018, 0, p.maxStamina);
    if (!p.flashlightOff && !p.hasLighter && p.battery > 0) p.battery = clamp(p.battery - dt * 0.0016 * (r.finalPhase ? 1.3 : 1) * (1 - (p.upgrades.battery || 0) * 0.08), 0, p.maxBattery);
    if (p.battery <= 0 && !p.hasLighter) p.flashlightOff = true;
    if (p.hasCamera) p.cameraCharge = clamp(p.cameraCharge + dt * 0.004, 0, 100);

    for (const f of r.activeFlares) f.timer -= dt;
    r.activeFlares = r.activeFlares.filter((f) => f.timer > 0);
    for (const pulse of r.noisePulses) { pulse.r += dt * 0.36; pulse.alpha -= dt * 0.0012; }
    r.noisePulses = r.noisePulses.filter((pulse) => pulse.alpha > 0 && pulse.r < pulse.max);

    updateMonster(r, dt);
    checkTraps(r);

    const md = dist(p, r.monster);
    const monsterVisible = md < 620 && hasLineOfSight(r.grid, p, r.monster);
    if (monsterVisible) p.sanity = clamp(p.sanity - dt * 0.022 * (1 - md / 700) * (1 - (p.upgrades.sanity || 0) * 0.06), 0, p.maxSanity);
    else if (p.flashlightOff && !p.hasLighter) p.sanity = clamp(p.sanity - dt * 0.0022, 0, p.maxSanity);
    else p.sanity = clamp(p.sanity + dt * 0.0045, 0, p.maxSanity);

    if (md < 44 && p.invuln <= 0) {
      p.hp -= 1;
      p.invuln = 2300;
      p.sanity = clamp(p.sanity - 36, 0, p.maxSanity);
      scare(r, "CAUGHT");
      if (p.hp <= 0) {
        r.dead = true;
        r.message = "The dark learned your name.";
      } else {
        const spawn = cellCenter(1, 1);
        p.x = spawn.x; p.y = spawn.y; p.angle = 0;
        const far = randomOpenCell(r.grid, new Set(["1,1"]), CELL * 8);
        r.monster.x = far.x; r.monster.y = far.y; r.monster.mode = "stalk";
        r.message = `It dragged you back to the start. ${p.hp} lives remaining.`;
      }
    }

    r.hauntTimer -= dt;
    if (r.hauntTimer <= 0) {
      r.message = choice(horrorLines);
      r.glitch = Math.max(r.glitch, rand(0.2, 0.65));
      if (Math.random() < 0.28) makeNoise(r, p.x - Math.cos(p.angle) * rand(150, 260), p.y - Math.sin(p.angle) * rand(150, 260), 150, true);
      if (p.sanity < 28 && Math.random() < 0.25) { r.inverted = 2400; r.message = "Your mind is slipping."; }
      if (p.sanity < 45 && Math.random() < 0.25) scare(r, choice(["LOOK", "BEHIND", "LISTEN", "RUN"]));
      r.hauntTimer = rand(r.finalPhase ? 2400 : 5200, r.finalPhase ? 5200 : 10500) - r.floorNum * 550;
    }
    setRun({ ...r });
  }

  function getInteractTarget(r) {
    const p = r.player;
    const all = [
      ...r.items.filter((x) => !x.collected),
      ...r.lores.filter((x) => !x.collected),
      ...r.batteries.filter((x) => !x.collected),
      ...r.medkits.filter((x) => !x.collected),
      ...r.flares.filter((x) => !x.collected),
      ...r.ammo.filter((x) => !x.collected),
      ...(r.lighter && !r.lighter.collected ? [r.lighter] : []),
      ...(r.cameraItem && !r.cameraItem.collected ? [r.cameraItem] : []),
      ...(r.stunGunItem && !r.stunGunItem.collected ? [r.stunGunItem] : []),
      ...r.specials.filter((x) => !x.used),
      ...(r.exit.active ? [r.exit] : []),
    ];
    let best = null;
    let bd = Infinity;
    for (const obj of all) {
      const d = dist(p, obj);
      if (d > 95 || d > bd) continue;
      const a = Math.abs(normAng(Math.atan2(obj.y - p.y, obj.x - p.x) - p.angle));
      if (a < 0.9 && hasLineOfSight(r.grid, p, obj)) { best = obj; bd = d; }
    }
    return best;
  }

  function drawBar(ctx, x, y, w, h, frac, label) {
    ctx.fillStyle = "rgba(0,0,0,.56)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(255,255,255,.16)";
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = frac > 0.55 ? "rgba(220,220,200,.85)" : frac > 0.25 ? "rgba(210,142,62,.9)" : "rgba(205,34,34,.9)";
    ctx.fillRect(x + 2, y + 2, (w - 4) * clamp(frac, 0, 1), h - 4);
    ctx.fillStyle = "rgba(255,245,235,.8)";
    ctx.font = "10px 'Share Tech Mono', monospace";
    ctx.fillText(label, x, y - 4);
  }

  function drawItemIcon(ctx, type, size, color) {
    const s = size;
    ctx.lineWidth = Math.max(1.2, s * 0.035);
    ctx.strokeStyle = "rgba(20,10,10,.72)";
    ctx.fillStyle = color;

    if (type === "fragment") {
      const grad = ctx.createRadialGradient(0, 0, s * 0.04, 0, 0, s * 0.46);
      grad.addColorStop(0, "rgba(255,245,245,.98)");
      grad.addColorStop(0.45, "rgba(255,40,45,.95)");
      grad.addColorStop(1, "rgba(80,0,0,.92)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI * 2 / 10;
        const rr = i % 2 ? s * 0.18 : s * 0.42;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.75)";
      ctx.beginPath(); ctx.arc(-s * 0.08, -s * 0.09, s * 0.07, 0, Math.PI * 2); ctx.fill();
    } else if (type === "battery") {
      ctx.fillStyle = "rgba(25,25,18,.95)";
      ctx.fillRect(-s * 0.27, -s * 0.34, s * 0.54, s * 0.68);
      ctx.strokeRect(-s * 0.27, -s * 0.34, s * 0.54, s * 0.68);
      ctx.fillStyle = "rgba(255,230,65,.96)";
      ctx.fillRect(-s * 0.18, -s * 0.21, s * 0.36, s * 0.42);
      ctx.fillStyle = "rgba(210,210,190,.9)";
      ctx.fillRect(-s * 0.12, -s * 0.43, s * 0.24, s * 0.09);
      ctx.fillStyle = "rgba(20,20,12,.8)";
      ctx.font = `bold ${s * 0.24}px 'Share Tech Mono', monospace`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("+", 0, 0);
    } else if (type === "medkit") {
      ctx.fillStyle = "rgba(232,232,224,.96)";
      roundRect(ctx, -s * 0.34, -s * 0.25, s * 0.68, s * 0.5, s * 0.06, true, true);
      ctx.fillStyle = "rgba(190,20,30,.96)";
      ctx.fillRect(-s * 0.07, -s * 0.18, s * 0.14, s * 0.36);
      ctx.fillRect(-s * 0.18, -s * 0.07, s * 0.36, s * 0.14);
    } else if (type === "lore") {
      ctx.fillStyle = "rgba(222,194,133,.96)";
      ctx.beginPath();
      ctx.moveTo(-s * 0.25, -s * 0.34); ctx.lineTo(s * 0.2, -s * 0.34); ctx.lineTo(s * 0.31, -s * 0.23);
      ctx.lineTo(s * 0.31, s * 0.34); ctx.lineTo(-s * 0.25, s * 0.34); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "rgba(55,28,18,.45)";
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(-s * 0.16, i * s * 0.1); ctx.lineTo(s * 0.17, i * s * 0.1); ctx.stroke(); }
    } else if (type === "flare" || type === "activeFlare") {
      ctx.rotate(-0.25);
      ctx.fillStyle = "rgba(60,20,12,.94)";
      roundRect(ctx, -s * 0.12, -s * 0.37, s * 0.24, s * 0.74, s * 0.08, true, true);
      ctx.fillStyle = "rgba(255,130,40,.96)";
      ctx.fillRect(-s * 0.15, -s * 0.2, s * 0.3, s * 0.14);
      ctx.fillStyle = "rgba(255,236,128,.98)";
      ctx.beginPath(); ctx.arc(0, -s * 0.43, s * 0.12 + Math.sin(performance.now() * 0.02) * s * 0.02, 0, Math.PI * 2); ctx.fill();
    } else if (type === "camera") {
      ctx.fillStyle = "rgba(24,36,42,.96)";
      roundRect(ctx, -s * 0.35, -s * 0.22, s * 0.7, s * 0.44, s * 0.07, true, true);
      ctx.fillStyle = "rgba(118,215,255,.95)";
      ctx.beginPath(); ctx.arc(0, 0, s * 0.16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fillRect(-s * 0.25, -s * 0.3, s * 0.23, s * 0.08);
    } else if (type === "stungun") {
      ctx.fillStyle = "rgba(28,46,70,.96)";
      ctx.fillRect(-s * 0.28, -s * 0.1, s * 0.48, s * 0.16);
      ctx.fillRect(s * 0.08, -s * 0.08, s * 0.25, s * 0.08);
      ctx.fillRect(-s * 0.05, s * 0.02, s * 0.13, s * 0.32);
      ctx.strokeRect(-s * 0.28, -s * 0.1, s * 0.61, s * 0.16);
      ctx.strokeStyle = "rgba(96,180,255,.95)";
      ctx.beginPath(); ctx.moveTo(s * 0.36, -s * 0.1); ctx.lineTo(s * 0.48, -s * 0.22); ctx.moveTo(s * 0.36, s * 0.04); ctx.lineTo(s * 0.5, s * 0.17); ctx.stroke();
    } else if (type === "ammo") {
      ctx.fillStyle = "rgba(40,70,105,.96)";
      roundRect(ctx, -s * 0.28, -s * 0.22, s * 0.56, s * 0.44, s * 0.05, true, true);
      ctx.fillStyle = "rgba(100,185,255,.95)";
      for (let i = -1; i <= 1; i++) ctx.fillRect(i * s * 0.12 - s * 0.035, -s * 0.15, s * 0.07, s * 0.3);
    } else if (type === "lighter") {
      ctx.fillStyle = "rgba(70,42,22,.96)";
      roundRect(ctx, -s * 0.16, -s * 0.28, s * 0.32, s * 0.56, s * 0.05, true, true);
      ctx.fillStyle = "rgba(220,220,200,.96)"; ctx.fillRect(-s * 0.12, -s * 0.38, s * 0.24, s * 0.14);
      ctx.fillStyle = "rgba(255,196,95,.95)"; ctx.beginPath(); ctx.arc(0, -s * 0.46, s * 0.1, 0, Math.PI * 2); ctx.fill();
    } else if (type === "special") {
      ctx.strokeStyle = color; ctx.lineWidth = s * 0.045;
      ctx.beginPath(); ctx.arc(0, 0, s * 0.36, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.26, 0); ctx.lineTo(s * 0.26, 0); ctx.moveTo(0, -s * 0.26); ctx.lineTo(0, s * 0.26); ctx.stroke();
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, s * 0.08, 0, Math.PI * 2); ctx.fill();
    } else if (type === "trap") {
      ctx.strokeStyle = "rgba(160,160,150,.65)";
      ctx.lineWidth = s * 0.025;
      ctx.beginPath(); ctx.moveTo(-s * 0.35, s * 0.18); ctx.lineTo(s * 0.35, s * 0.18); ctx.moveTo(-s * 0.2, s * 0.18); ctx.lineTo(-s * 0.06, -s * 0.05); ctx.moveTo(s * 0.2, s * 0.18); ctx.lineTo(s * 0.06, -s * 0.05); ctx.stroke();
    } else if (type === "exit") {
      ctx.strokeStyle = color; ctx.lineWidth = s * 0.045;
      ctx.beginPath(); ctx.arc(0, 0, s * 0.38, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, s * 0.2, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = color; ctx.fillRect(-s * 0.06, -s * 0.46, s * 0.12, s * 0.92);
    }
  }

  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  function drawSprite(ctx, r, obj, rays, opts = {}) {
    const p = r.player;
    if (obj.collected || obj.used) return;
    const dx = obj.x - p.x;
    const dy = obj.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 1 || d > MAX_DEPTH * 0.9) return;
    const angle = normAng(Math.atan2(dy, dx) - p.angle);
    if (Math.abs(angle) > FOV * 0.76) return;
    if (!hasLineOfSight(r.grid, p, obj) && !opts.always) return;

    const horizon = CANVAS_H / 2 + Math.sin(p.bob) * 4 + (p.pitch || 0) * 230;
    const screenX = CANVAS_W / 2 + Math.tan(angle) * (CANVAS_W / 2) / Math.tan(FOV / 2);
    const size = clamp((CELL * 450) / d, opts.min || 16, opts.max || 160);
    const groundDrop = clamp((CELL * 170) / d, 18, 155);
    const y = horizon + groundDrop - size * 0.58 + (opts.yOffset || 0);
    const col = Math.floor(screenX / (CANVAS_W / RAYS));
    if (rays[col] && d > rays[col].depth + 30) return;

    ctx.save();
    ctx.globalAlpha = clamp(1 - d / (MAX_DEPTH * 0.95), 0.2, 1) * (opts.alpha ?? 1);
    ctx.translate(screenX, y + size / 2);
    const pulse = 1 + Math.sin(r.time * 0.006 + (obj.pulse || 0)) * (obj.type === "trap" ? 0.015 : 0.055);
    ctx.scale(pulse, pulse);
    ctx.shadowColor = opts.shadow || opts.color || "#fff";
    ctx.shadowBlur = opts.glow || 12;
    drawItemIcon(ctx, obj.type, size, opts.color || "#fff");
    ctx.shadowBlur = 0;
    // soft floor contact shadow
    ctx.globalAlpha *= 0.36;
    ctx.fillStyle = "rgba(0,0,0,.75)";
    ctx.beginPath(); ctx.ellipse(0, size * 0.43, size * 0.28, size * 0.055, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawMonster(ctx, r, rays) {
    const p = r.player;
    const m = r.monster;
    const d = dist(p, m);
    const angle = normAng(Math.atan2(m.y - p.y, m.x - p.x) - p.angle);
    if (Math.abs(angle) > FOV * 0.86 || d > MAX_DEPTH || !hasLineOfSight(r.grid, p, m)) {
      if (m.mode === "chase" && d < 900) {
        const side = angle < 0 ? 36 : CANVAS_W - 36;
        ctx.save();
        ctx.globalAlpha = 0.7 + Math.sin(r.time * 0.012) * 0.25;
        ctx.fillStyle = `rgb(${r.theme.eye[0]},${r.theme.eye[1]},${r.theme.eye[2]})`;
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.moveTo(side, CANVAS_H / 2);
        ctx.lineTo(side + (angle < 0 ? -18 : 18), CANVAS_H / 2 - 15);
        ctx.lineTo(side + (angle < 0 ? -18 : 18), CANVAS_H / 2 + 15);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      return;
    }
    const screenX = CANVAS_W / 2 + Math.tan(angle) * (CANVAS_W / 2) / Math.tan(FOV / 2);
    const col = Math.floor(screenX / (CANVAS_W / RAYS));
    if (rays[col] && d > rays[col].depth + 24) return;
    const size = clamp((CELL * 760) / d, 58, 460);
    const y = CANVAS_H / 2 + Math.sin(p.bob) * 4 + (p.pitch || 0) * 230 - size * 0.52;
    const [er, eg, eb] = r.theme.eye;
    ctx.save();
    ctx.translate(screenX, y + size * 0.52);
    ctx.globalAlpha = clamp(1 - d / 1200, 0.32, 1);
    ctx.shadowColor = `rgba(${er},${eg},${eb},.7)`;
    ctx.shadowBlur = m.mode === "chase" ? 30 : 14;
    const body = ctx.createRadialGradient(0, 0, 4, 0, 0, size * 0.55);
    body.addColorStop(0, "rgba(20,0,0,.95)");
    body.addColorStop(0.55, "rgba(6,0,0,.96)");
    body.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, size * 0.04, size * 0.34, size * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(${er},${eg},${eb},.95)`;
    ctx.beginPath(); ctx.ellipse(-size * 0.105, -size * 0.12, size * 0.045, size * 0.025, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(size * 0.105, -size * 0.12, size * 0.045, size * 0.025, 0, 0, Math.PI * 2); ctx.fill();
    if (d < 260 || m.mode === "chase") {
      ctx.strokeStyle = `rgba(${er},${eg},${eb},.72)`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-size * 0.13, size * 0.06); ctx.quadraticCurveTo(0, size * 0.19, size * 0.13, size * 0.06); ctx.stroke();
    }
    ctx.restore();
  }

  function drawMiniMap(ctx, r) {
    if (r.securityPing <= 0) return;
    const scale = 4;
    const ox = CANVAS_W - MAP_W * scale - 18;
    const oy = 18;
    ctx.save();
    ctx.globalAlpha = 0.86;
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fillRect(ox - 8, oy - 8, MAP_W * scale + 16, MAP_H * scale + 16);
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      ctx.fillStyle = r.grid[y][x] ? "rgba(150,60,60,.42)" : "rgba(220,220,190,.15)";
      ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
    }
    ctx.fillStyle = "#d22"; ctx.fillRect(ox + (r.monster.x / CELL) * scale - 2, oy + (r.monster.y / CELL) * scale - 2, 4, 4);
    ctx.fillStyle = "#70ff90"; ctx.fillRect(ox + (r.player.x / CELL) * scale - 2, oy + (r.player.y / CELL) * scale - 2, 4, 4);
    const obj = r.exit.active ? r.exit : r.items.find((i) => !i.collected);
    if (obj) { ctx.fillStyle = "#ffd34f"; ctx.fillRect(ox + (obj.x / CELL) * scale - 2, oy + (obj.y / CELL) * scale - 2, 4, 4); }
    ctx.restore();
  }

  function drawGame(ctx, r) {
    const p = r.player;
    const theme = r.theme;
    const bob = Math.sin(p.bob) * 4;
    const sway = Math.sin(p.bob * 0.5) * 2.5;
    const horizon = CANVAS_H / 2 + bob + (p.pitch || 0) * 230;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    const ceil = ctx.createLinearGradient(0, 0, 0, horizon);
    ceil.addColorStop(0, lightenHex(theme.ceiling, 0.24));
    ceil.addColorStop(0.55, theme.ceiling);
    ceil.addColorStop(1, "#090508");
    ctx.fillStyle = ceil;
    ctx.fillRect(0, 0, CANVAS_W, Math.max(0, horizon));
    const floor = ctx.createLinearGradient(0, horizon, 0, CANVAS_H);
    floor.addColorStop(0, lightenHex(theme.floor, 0.18));
    floor.addColorStop(0.55, theme.floor);
    floor.addColorStop(1, "#020101");
    ctx.fillStyle = floor;
    ctx.fillRect(0, horizon, CANVAS_W, CANVAS_H - horizon);

    // perspective floor boards / stains so the hallway does not feel like one flat rectangle
    ctx.save();
    ctx.globalAlpha = 0.25;
    for (let yy = Math.max(horizon + 18, 0); yy < CANVAS_H; yy += 28) {
      const t = (yy - horizon) / Math.max(1, CANVAS_H - horizon);
      ctx.strokeStyle = `rgba(255,225,190,${0.045 * (1 - t)})`;
      ctx.beginPath();
      ctx.moveTo(CANVAS_W * (0.5 - t * 0.52) + sway, yy);
      ctx.lineTo(CANVAS_W * (0.5 + t * 0.52) + sway, yy);
      ctx.stroke();
    }
    for (let i = -5; i <= 5; i++) {
      ctx.strokeStyle = "rgba(0,0,0,.18)";
      ctx.beginPath();
      ctx.moveTo(CANVAS_W / 2 + sway, horizon);
      ctx.lineTo(CANVAS_W / 2 + sway + i * 120, CANVAS_H);
      ctx.stroke();
    }
    ctx.restore();

    const rays = [];
    const stripW = CANVAS_W / RAYS + 1;
    for (let i = 0; i < RAYS; i++) {
      const rayAngle = p.angle - FOV / 2 + (i / (RAYS - 1)) * FOV;
      const hit = castRay(r.grid, p.x, p.y, rayAngle);
      const corrected = hit.depth * Math.cos(rayAngle - p.angle);
      const wallH = clamp((CELL * 590) / Math.max(1, corrected), 0, CANVAS_H * 1.85);
      const x = i * (CANVAS_W / RAYS);
      const y = horizon - wallH / 2;
      const shade = clamp(1 - corrected / MAX_DEPTH, 0.1, 1);
      const edgeShade = hit.edge < 7 ? 0.66 : 1;
      const textureCoord = hit.vertical ? hit.y % CELL : hit.x % CELL;
      const stripe = Math.sin(textureCoord * 0.18) * 0.035 + Math.sin((hit.x + hit.y) * 0.035) * 0.025;
      ctx.fillStyle = hit.vertical ? lightenHex(theme.wallA, 0.08 + stripe) : lightenHex(theme.wallB, 0.06 + stripe);
      ctx.globalAlpha = 1;
      ctx.fillRect(x, y, stripW, wallH);
      ctx.fillStyle = `rgba(0,0,0,${clamp(0.12 + (1 - shade * edgeShade) * 0.82, 0, 0.94)})`;
      ctx.fillRect(x, y, stripW, wallH);
      if (i % 5 === 0) {
        ctx.fillStyle = `rgba(255,230,200,${0.028 * shade})`;
        ctx.fillRect(x, y, 1, wallH);
      }
      if (Math.floor(textureCoord) % 33 < 2) {
        ctx.fillStyle = `rgba(0,0,0,${0.16 * shade})`;
        ctx.fillRect(x, y, stripW, wallH);
      }
      if (Math.random() < 0.0012 + (100 - p.sanity) * 0.00001) {
        ctx.fillStyle = `rgba(130,0,0,${0.11 * shade})`;
        ctx.fillRect(x, y + rand(0, wallH), stripW, rand(8, 46));
      }
      rays[i] = { depth: corrected };
    }

    const sprites = [
      ...r.activeFlares.map((f) => ({ ...f, type: "activeFlare" })),
      ...(r.exit.active ? [{ ...r.exit, type: "exit" }] : []),
      ...r.items,
      ...r.lores,
      ...r.batteries,
      ...r.medkits,
      ...r.flares,
      ...r.ammo,
      ...(r.lighter && !r.lighter.collected ? [r.lighter] : []),
      ...(r.cameraItem && !r.cameraItem.collected ? [r.cameraItem] : []),
      ...(r.stunGunItem && !r.stunGunItem.collected ? [r.stunGunItem] : []),
      ...r.specials.filter((s) => !s.used),
      ...r.traps.filter((t) => !t.triggered),
    ].sort((a, b) => dist(p, b) - dist(p, a));

    for (const s of sprites) {
      if (s.type === "fragment") drawSprite(ctx, r, s, rays, { color: "#ff3030", shadow: "#ff0000", glow: 24, max: 130 });
      else if (s.type === "lore") drawSprite(ctx, r, s, rays, { color: "#d8c08b", shape: "note", glow: 10, max: 105 });
      else if (s.type === "battery") drawSprite(ctx, r, s, rays, { color: "#ffe868", shape: "box", glow: 12, max: 92 });
      else if (s.type === "medkit") drawSprite(ctx, r, s, rays, { color: "#f7f7f7", shape: "box", glow: 9, max: 90 });
      else if (s.type === "flare" || s.type === "activeFlare") drawSprite(ctx, r, s, rays, { color: "#ff9b30", shape: "box", glow: s.type === "activeFlare" ? 36 : 16, max: s.type === "activeFlare" ? 130 : 88 });
      else if (s.type === "camera") drawSprite(ctx, r, s, rays, { color: "#7fd7ff", shape: "box", glow: 18, max: 95 });
      else if (s.type === "stungun" || s.type === "ammo") drawSprite(ctx, r, s, rays, { color: "#59a8ff", shape: "box", glow: 18, max: 95 });
      else if (s.type === "lighter") drawSprite(ctx, r, s, rays, { color: "#ffd18a", shape: "box", glow: 18, max: 90 });
      else if (s.type === "special") drawSprite(ctx, r, s, rays, { color: "#b46cff", shape: "exit", glow: 20, max: 120 });
      else if (s.type === "trap") drawSprite(ctx, r, s, rays, { color: "rgba(90,90,90,.85)", shape: "box", glow: 3, max: 65, alpha: 0.62 });
      else if (s.type === "exit") drawSprite(ctx, r, s, rays, { color: "#61ff85", shape: "exit", glow: 34, max: 190 });
    }
    drawMonster(ctx, r, rays);

    // flashlight darkness layer: brighter center, directional cone, still scary edges
    const flashlight = !p.flashlightOff && (p.battery > 0 || p.hasLighter);
    const beamX = CANVAS_W / 2 + sway * 4;
    const beamY = horizon + 10;
    const dark = ctx.createRadialGradient(beamX, beamY, 32, beamX, beamY, 720);
    const darkness = r.event?.type === "brownout" ? 0.82 : flashlight ? (p.hasLighter ? 0.74 : 0.64) : 0.92;
    dark.addColorStop(0, `rgba(0,0,0,${flashlight ? 0.0 : 0.32})`);
    dark.addColorStop(0.24, `rgba(0,0,0,${flashlight ? 0.06 : 0.5})`);
    dark.addColorStop(0.58, `rgba(0,0,0,${darkness})`);
    dark.addColorStop(1, "rgba(0,0,0,.975)");
    ctx.fillStyle = dark;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    if (flashlight && !p.hasLighter) {
      ctx.save();
      const strength = clamp(p.battery / Math.max(1, p.maxBattery), 0.25, 1);
      const cone = ctx.createLinearGradient(beamX, beamY - 35, beamX, CANVAS_H);
      cone.addColorStop(0, `rgba(255,246,214,${0.22 * strength})`);
      cone.addColorStop(0.38, `rgba(255,232,178,${0.11 * strength})`);
      cone.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(beamX - 34, beamY - 18);
      ctx.bezierCurveTo(CANVAS_W * 0.35, CANVAS_H * 0.62, CANVAS_W * 0.22, CANVAS_H * 0.84, CANVAS_W * 0.16, CANVAS_H);
      ctx.lineTo(CANVAS_W * 0.84, CANVAS_H);
      ctx.bezierCurveTo(CANVAS_W * 0.78, CANVAS_H * 0.84, CANVAS_W * 0.65, CANVAS_H * 0.62, beamX + 34, beamY - 18);
      ctx.closePath();
      ctx.fill();
      const hot = ctx.createRadialGradient(beamX, beamY, 12, beamX, beamY, 250 + p.battery * 1.5);
      hot.addColorStop(0, `rgba(255,248,220,${0.18 * strength})`);
      hot.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = hot;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.restore();
    }

    for (const f of r.activeFlares) {
      const d = dist(p, f);
      if (d < f.radius * 2 && hasLineOfSight(r.grid, p, f)) {
        ctx.fillStyle = `rgba(255,95,20,${clamp((f.radius * 2 - d) / (f.radius * 2), 0, 1) * 0.16})`;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      }
    }

    const [fr, fg, fb] = theme.fog;
    ctx.fillStyle = `rgba(${fr},${fg},${fb},.18)`;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    if (r.gunFlash > 0) {
      ctx.fillStyle = `rgba(180,220,255,${r.gunFlash / 250})`;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
    if (r.glitch > 0) {
      for (let i = 0; i < 10 * r.glitch; i++) {
        ctx.fillStyle = `rgba(255,0,0,${rand(0.015, 0.07) * r.glitch})`;
        ctx.fillRect(rand(0, CANVAS_W), rand(0, CANVAS_H), rand(20, 220), rand(1, 8));
      }
    }

    // crosshair + prompts
    ctx.strokeStyle = "rgba(255,255,255,.34)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(CANVAS_W / 2 - 8, CANVAS_H / 2); ctx.lineTo(CANVAS_W / 2 - 2, CANVAS_H / 2); ctx.moveTo(CANVAS_W / 2 + 2, CANVAS_H / 2); ctx.lineTo(CANVAS_W / 2 + 8, CANVAS_H / 2); ctx.moveTo(CANVAS_W / 2, CANVAS_H / 2 - 8); ctx.lineTo(CANVAS_W / 2, CANVAS_H / 2 - 2); ctx.moveTo(CANVAS_W / 2, CANVAS_H / 2 + 2); ctx.lineTo(CANVAS_W / 2, CANVAS_H / 2 + 8); ctx.stroke();

    const target = getInteractTarget(r);
    if (target) {
      ctx.fillStyle = "rgba(0,0,0,.56)";
      ctx.fillRect(CANVAS_W / 2 - 180, CANVAS_H - 128, 360, 42);
      ctx.strokeStyle = "rgba(255,255,255,.12)";
      ctx.strokeRect(CANVAS_W / 2 - 180, CANVAS_H - 128, 360, 42);
      ctx.fillStyle = "rgba(255,235,200,.92)";
      ctx.font = "bold 12px 'Share Tech Mono', monospace";
      ctx.textAlign = "center";
      const names = { fragment: "TAKE SIGNAL FRAGMENT", lore: "READ DOCUMENT", battery: "TAKE BATTERY", medkit: "USE MEDKIT", flare: "TAKE FLARE", ammo: "TAKE AMMO", lighter: "TAKE LIGHTER", camera: "TAKE CAMERA", stungun: "TAKE STUN PISTOL", special: target.name?.toUpperCase() || "USE ROOM", exit: "ENTER EXIT" };
      ctx.fillText(`[E] ${names[target.type] || "INTERACT"}`, CANVAS_W / 2, CANVAS_H - 103);
    }

    // HUD
    ctx.textAlign = "left";
    drawBar(ctx, 22, 42, 136, 12, p.hp / p.maxHp, "LIVES");
    drawBar(ctx, 176, 42, 136, 12, p.battery / p.maxBattery, "BATTERY");
    drawBar(ctx, 330, 42, 136, 12, p.stamina / p.maxStamina, "STAMINA");
    drawBar(ctx, 484, 42, 136, 12, p.sanity / p.maxSanity, "SANITY");
    ctx.fillStyle = "rgba(235,220,210,.9)";
    ctx.font = "bold 13px 'Share Tech Mono', monospace";
    ctx.fillText(`${theme.name.toUpperCase()}  FLOOR ${r.floorNum}`, 22, 22);
    ctx.fillText(`FRAGMENTS ${r.collected}/${ITEM_COUNT}`, 650, 48);
    ctx.fillText(`FLARES ${p.flares || 0}`, 650, 68);
    ctx.fillText(`STUN ${p.hasStunGun ? p.stunAmmo : "—"}`, 760, 68);
    ctx.fillText(`CAM ${p.hasCamera ? Math.floor(p.cameraCharge) + "%" : "—"}`, 850, 68);
    if (r.event) {
      ctx.fillStyle = "rgba(255,65,65,.96)";
      ctx.fillText(`${r.event.name} ${(r.event.timer / 1000).toFixed(1)}s`, 650, 28);
    }
    ctx.fillStyle = "rgba(225,205,205,.78)";
    ctx.font = "12px 'Share Tech Mono', monospace";
    ctx.fillText(r.message || "", 22, CANVAS_H - 28);

    // compass
    const obj = r.exit.active ? r.exit : r.items.filter((i) => !i.collected).sort((a, b) => dist(a, p) - dist(b, p))[0];
    if (obj) {
      const a = normAng(Math.atan2(obj.y - p.y, obj.x - p.x) - p.angle);
      ctx.save();
      ctx.translate(CANVAS_W / 2 + Math.sin(a) * 120, 82);
      ctx.rotate(a);
      ctx.fillStyle = r.exit.active ? "#60ff88" : "#ff4b4b";
      ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(8, 8); ctx.lineTo(0, 4); ctx.lineTo(-8, 8); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    drawMiniMap(ctx, r);

    if (r.loreRead) {
      const alpha = Math.min(1, r.loreRead.timer / 600);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "rgba(4,2,6,.92)";
      ctx.fillRect(170, 168, 640, 160);
      ctx.strokeStyle = "rgba(210,170,90,.4)";
      ctx.strokeRect(170, 168, 640, 160);
      ctx.fillStyle = "rgba(230,205,170,.94)";
      ctx.font = "13px 'Share Tech Mono', monospace";
      const words = r.loreRead.text.split(" ");
      let line = "";
      let y = 210;
      for (const word of words) {
        const test = line + (line ? " " : "") + word;
        if (ctx.measureText(test).width > 560) { ctx.fillText(line, 205, y); line = word; y += 20; }
        else line = test;
      }
      if (line) ctx.fillText(line, 205, y);
      ctx.restore();
    }

    if (r.scare) {
      ctx.save();
      ctx.globalAlpha = clamp(r.scare.timer / 500, 0, 1);
      ctx.fillStyle = "rgba(90,0,0,.55)";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = "rgba(255,235,235,.96)";
      ctx.font = `bold ${80 + Math.sin(r.time * 0.04) * 10}px 'Share Tech Mono', monospace`;
      ctx.textAlign = "center";
      ctx.fillText(r.scare.text, CANVAS_W / 2 + rand(-6, 6), CANVAS_H / 2 + rand(-6, 6));
      ctx.restore();
    }

    if (!started || r.dead || r.won) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,.74)";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.textAlign = "center";
      ctx.fillStyle = r.dead ? "#ff4040" : r.won ? "#8cff9f" : "#eadede";
      ctx.font = "bold 42px 'Crimson Pro', serif";
      ctx.fillText(r.dead ? "IT HEARD YOU" : r.won ? "YOU ESCAPED" : "SOMETHING HEARD YOU", CANVAS_W / 2, 230);
      ctx.fillStyle = "rgba(230,205,205,.78)";
      ctx.font = "14px 'Share Tech Mono', monospace";
      ctx.fillText(r.dead || r.won ? "Press Restart to play again." : "Click the canvas to lock mouse. Mouse looks around/up/down. WASD moves. E picks up.", CANVAS_W / 2, 275);
      ctx.fillText("F flashlight · Shift sprint · Ctrl crouch · Q flare · C camera · R stun pistol", CANVAS_W / 2, 305);
      ctx.restore();
    }
  }

  useEffect(() => {
    const down = (e) => {
      const k = e.key.toLowerCase();
      keysRef.current[k] = true;
      if (["w", "a", "s", "d", " ", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift", "control"].includes(k)) e.preventDefault();
      if (k === "e") pickupNearby();
      if (k === "q") throwFlare();
      if (k === "c") useCamera();
      if (k === "r") fireStunGun();
      if (k === "f") {
        const r = runRef.current;
        if (r?.player) { r.player.flashlightOff = !r.player.flashlightOff; r.message = r.player.flashlightOff ? "Flashlight off." : "Flashlight on."; setRun({ ...r }); }
      }
      if (["1", "2", "3"].includes(k)) applyUpgradeChoice(Number(k) - 1);
    };
    const up = (e) => { keysRef.current[e.key.toLowerCase()] = false; };
    const move = (e) => {
      if (document.pointerLockElement === canvasRef.current) {
        const r = runRef.current;
        if (r?.player && started && !r.dead && !r.won) {
          r.player.angle = normAng((r.player.angle || 0) + e.movementX * 0.0044);
          r.player.targetPitch = clamp((r.player.targetPitch || 0) + e.movementY * 0.0034, -0.55, 0.55);
          runRef.current = r;
        }
      }
    };
    const pointer = () => setIsFullscreen(!!document.fullscreenElement);
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    window.addEventListener("mousemove", move);
    document.addEventListener("fullscreenchange", pointer);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("mousemove", move);
      document.removeEventListener("fullscreenchange", pointer);
    };
  }, [started]);

  useEffect(() => {
    const loop = (now) => {
      const dt = now - lastRef.current;
      lastRef.current = now;
      const ctx = canvasRef.current?.getContext("2d");

      // Hard safety guard: the canvas should always draw something, even before Start Run
      // or if React remounts this component inside Gradeify.
      if (!runRef.current) runRef.current = run || createFloor(1);

      try {
        updateGame(dt);
        if (ctx && runRef.current) drawGame(ctx, runRef.current);
      } catch (err) {
        console.error("SomethingHeardYou crashed for one frame:", err);
        const safe = runRef.current || createFloor(1);
        runRef.current = safe;
        if (ctx) drawGame(ctx, safe);
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [started, run]);

  function toggleFullscreen() {
    const el = cardRef.current;
    if (!el) return;
    if (!document.fullscreenElement) el.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.();
  }

  return (
    <div className="shy-page">
      <div className="shy-shell">
        <div className="shy-header">
          <div>
            <p className="shy-kicker">Gradeify Games · First-person horror roguelike</p>
            <h1>Something Heard You</h1>
            <p>
              A 3D hallway horror game built on canvas raycasting. Collect six signal fragments, manage light and sanity,
              use emergency tools, and escape before the thing in the halls learns your route.
            </p>
          </div>
          <div className="shy-actions">
            <button onClick={restart}>{started ? "Restart" : "Start Run"}</button>
            <button className="shy-secondary" onClick={toggleFullscreen}>{isFullscreen ? "Exit Fullscreen" : "Fullscreen"}</button>
            {onExit && <button className="shy-secondary" onClick={onExit}>Back</button>}
          </div>
        </div>

        <div ref={cardRef} className="shy-game-card">
          <canvas
            ref={canvasRef}
            tabIndex={0}
            width={CANVAS_W}
            height={CANVAS_H}
            className="shy-canvas"
            onClick={() => {
              if (!started) restart();
              canvasRef.current?.focus?.();
              canvasRef.current?.requestPointerLock?.();
            }}
          />

          {run.awaitingUpgrade && !run.won && (
            <div className="shy-upgrade-overlay">
              <div className="shy-upgrade-title">Floor cleared. Choose one upgrade.</div>
              <div className="shy-upgrade-grid">
                {run.upgradeOptions.map((up, i) => (
                  <button key={up.key} onClick={() => applyUpgradeChoice(i)}>
                    <strong>{i + 1}. {up.name}</strong>
                    <span>{up.desc}</span>
                    <em>Current level: {(run.player.upgrades?.[up.key] || 0)} / {up.max}</em>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="shy-controls">
            <span>WASD move</span><span>Mouse look + up/down</span><span>Arrows turn</span><span>E interact</span><span>F flashlight</span>
            <span>Shift sprint</span><span>Ctrl crouch</span><span>Q flare</span><span>C camera</span><span>R stun pistol</span>
          </div>
        </div>

        <div className="shy-notes">
          <div><h3>Goal</h3><p>Find six red signal fragments. They make noise, so every pickup pushes the monster closer.</p></div>
          <div><h3>Survive</h3><p>Light protects sanity, sprinting creates sound, crouching is safer, and flares can pull the monster away.</p></div>
          <div><h3>Defend</h3><p>The camera stuns at close range. The stun pistol is stronger, but missing is loud enough to start a hunt.</p></div>
        </div>
      </div>
    </div>
  );
}
