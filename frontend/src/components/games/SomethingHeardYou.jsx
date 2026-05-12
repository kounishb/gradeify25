import React, { useEffect, useMemo, useRef, useState } from "react";
import "../../styles/SomethingHeardYou.css";

const CANVAS_W = 980;
const CANVAS_H = 620;

const WORLD_W = 2600;
const WORLD_H = 1900;

const PLAYER_RADIUS = 14;
const MONSTER_RADIUS = 23;

const ITEM_COUNT = 6;

const BATTERY_DRAIN = 0.0022;
const FEAR_DARK_GAIN = 0.0035;
const FEAR_MONSTER_GAIN = 0.026;
const FEAR_DECAY = 0.006;

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const rand = (min, max) => Math.random() * (max - min) + min;
const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function pointInRect(p, r, pad = 0) {
  return (
    p.x >= r.x - pad &&
    p.x <= r.x + r.w + pad &&
    p.y >= r.y - pad &&
    p.y <= r.y + r.h + pad
  );
}

function rectDistanceToPoint(rect, p) {
  const cx = clamp(p.x, rect.x, rect.x + rect.w);
  const cy = clamp(p.y, rect.y, rect.y + rect.h);
  return Math.hypot(p.x - cx, p.y - cy);
}

function circleRectCollision(circle, rect, radius) {
  const closestX = clamp(circle.x, rect.x, rect.x + rect.w);
  const closestY = clamp(circle.y, rect.y, rect.y + rect.h);
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  return dx * dx + dy * dy < radius * radius;
}

function randomPointInRect(rect, pad = 42) {
  return {
    x: rand(rect.x + pad, rect.x + rect.w - pad),
    y: rand(rect.y + pad, rect.y + rect.h - pad),
  };
}

function makeMazeMap() {
  const rooms = [];
  const corridors = [];

  const cols = 5;
  const rows = 4;
  const cellW = 440;
  const cellH = 360;
  const startX = 230;
  const startY = 185;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const skip = Math.random() < 0.12 && !(row === 0 && col === 0) && !(row === rows - 1 && col === cols - 1);

      if (skip) continue;

      const w = rand(230, 330);
      const h = rand(170, 260);
      const x = startX + col * cellW + rand(-35, 35);
      const y = startY + row * cellH + rand(-30, 30);

      rooms.push({
        id: `room-${row}-${col}`,
        grid: { row, col },
        x,
        y,
        w,
        h,
        type: row === 0 && col === 0 ? "spawn" : "room",
        decay: Math.random(),
      });
    }
  }

  const byGrid = new Map();
  rooms.forEach((r) => byGrid.set(`${r.grid.row}-${r.grid.col}`, r));

  function connectRooms(a, b) {
    if (!a || !b) return;

    const ax = a.x + a.w / 2;
    const ay = a.y + a.h / 2;
    const bx = b.x + b.w / 2;
    const by = b.y + b.h / 2;

    const horizontalFirst = Math.random() > 0.35;

    if (horizontalFirst) {
      corridors.push({
        id: `hall-${a.id}-${b.id}-h`,
        x: Math.min(ax, bx) - 22,
        y: ay - 24,
        w: Math.abs(ax - bx) + 44,
        h: 48,
        type: "hallway",
        decay: Math.random(),
      });

      corridors.push({
        id: `hall-${a.id}-${b.id}-v`,
        x: bx - 24,
        y: Math.min(ay, by) - 22,
        w: 48,
        h: Math.abs(ay - by) + 44,
        type: "hallway",
        decay: Math.random(),
      });
    } else {
      corridors.push({
        id: `hall-${a.id}-${b.id}-v`,
        x: ax - 24,
        y: Math.min(ay, by) - 22,
        w: 48,
        h: Math.abs(ay - by) + 44,
        type: "hallway",
        decay: Math.random(),
      });

      corridors.push({
        id: `hall-${a.id}-${b.id}-h`,
        x: Math.min(ax, bx) - 22,
        y: by - 24,
        w: Math.abs(ax - bx) + 44,
        h: 48,
        type: "hallway",
        decay: Math.random(),
      });
    }
  }

  for (let row = 0; row < rows; row++) {
    const rowRooms = rooms
      .filter((r) => r.grid.row === row)
      .sort((a, b) => a.grid.col - b.grid.col);

    for (let i = 1; i < rowRooms.length; i++) {
      connectRooms(rowRooms[i - 1], rowRooms[i]);
    }
  }

  for (let col = 0; col < cols; col++) {
    const colRooms = rooms
      .filter((r) => r.grid.col === col)
      .sort((a, b) => a.grid.row - b.grid.row);

    for (let i = 1; i < colRooms.length; i++) {
      if (Math.random() > 0.22 || i === 1) {
        connectRooms(colRooms[i - 1], colRooms[i]);
      }
    }
  }

  for (let i = 0; i < 5; i++) {
    const a = choice(rooms);
    const b = choice(rooms);

    if (!a || !b || a.id === b.id) continue;

    const gridDistance = Math.abs(a.grid.row - b.grid.row) + Math.abs(a.grid.col - b.grid.col);

    if (gridDistance <= 2 && Math.random() > 0.45) {
      connectRooms(a, b);
    }
  }

  const walkable = [...rooms, ...corridors];

  const spawnRoom = byGrid.get("0-0") || rooms[0];

  const exitRoom = [...rooms]
    .filter((r) => r.id !== spawnRoom.id)
    .sort((a, b) => {
      const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
      const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      const sc = { x: spawnRoom.x + spawnRoom.w / 2, y: spawnRoom.y + spawnRoom.h / 2 };
      return dist(bc, sc) - dist(ac, sc);
    })[0];

  return {
    rooms,
    corridors,
    walkable,
    spawnRoom,
    exitRoom,
  };
}

function getZoneAt(map, p, pad = 0) {
  const rooms = map.rooms.filter((zone) => pointInRect(p, zone, pad));
  if (rooms.length) return rooms[0];

  const halls = map.corridors.filter((zone) => pointInRect(p, zone, pad));
  if (halls.length) return halls[0];

  return null;
}

function zonesTouch(a, b) {
  if (!a || !b) return false;

  return !(
    a.x > b.x + b.w + 4 ||
    a.x + a.w + 4 < b.x ||
    a.y > b.y + b.h + 4 ||
    a.y + a.h + 4 < b.y
  );
}

function sameVisibilityZone(map, a, b) {
  const az = getZoneAt(map, a, 2);
  const bz = getZoneAt(map, b, 2);

  if (!az || !bz) return false;
  if (az.id === bz.id) return true;

  return false;
}

function createRun() {
  const map = makeMazeMap();
  const spawn = map.spawnRoom;

  const player = {
    x: spawn.x + spawn.w / 2,
    y: spawn.y + spawn.h / 2,
    angle: 0,
    hp: 3,
    fear: 18,
    battery: 100,
    stamina: 100,
    hidden: false,
    invuln: 0,
    flashlightOff: false,
  };

  const farRooms = [...map.rooms]
    .filter((r) => r.id !== map.spawnRoom.id)
    .sort((a, b) => {
      const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
      const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      return dist(bc, player) - dist(ac, player);
    });

  const itemRooms = [...farRooms].sort(() => Math.random() - 0.5).slice(0, ITEM_COUNT);

  const items = itemRooms.map((room, index) => ({
    id: `fragment-${index}`,
    ...randomPointInRect(room),
    collected: false,
    pulse: Math.random() * Math.PI * 2,
  }));

  const restRooms = [...map.rooms].filter((r) => !itemRooms.some((ir) => ir.id === r.id));

  const batteries = restRooms
    .sort(() => Math.random() - 0.5)
    .slice(0, 7)
    .map((room, index) => ({
      id: `battery-${index}`,
      ...randomPointInRect(room),
      collected: false,
    }));

  const medkits = restRooms
    .sort(() => Math.random() - 0.5)
    .slice(7, 10)
    .map((room, index) => ({
      id: `medkit-${index}`,
      ...randomPointInRect(room),
      collected: false,
    }));

  const hidingSpots = restRooms
    .sort(() => Math.random() - 0.5)
    .slice(10, 19)
    .map((room, index) => ({
      id: `hide-${index}`,
      ...randomPointInRect(room),
      r: 24,
    }));

  const monsterRoom = farRooms[0] || map.exitRoom;

  return {
    map,
    player,
    monster: {
      x: monsterRoom.x + monsterRoom.w / 2,
      y: monsterRoom.y + monsterRoom.h / 2,
      mode: "stalk",
      target: null,
      speed: 2.65,
      anger: 0,
      stun: 0,
      visibleFlash: 0,
    },
    items,
    batteries,
    medkits,
    hidingSpots,
    exit: {
      x: map.exitRoom.x + map.exitRoom.w / 2,
      y: map.exitRoom.y + map.exitRoom.h / 2,
      active: false,
    },
    noisePulses: [],
    hallucinations: [],
    collected: 0,
    finalPhase: false,
    won: false,
    dead: false,
    scare: null,
    message: "Find 6 fragments. Use the static compass if you get lost.",
    hauntTimer: rand(4800, 8500),
    time: 0,
    glitch: 0,
    objectiveBlink: 0,
  };
}

export default function SomethingHeardYou({ onExit }) {
  const canvasRef = useRef(null);
  const keysRef = useRef({});
  const mouseRef = useRef({ x: CANVAS_W / 2, y: CANVAS_H / 2 });
  const runRef = useRef(null);
  const rafRef = useRef(null);
  const lastRef = useRef(performance.now());

  const [started, setStarted] = useState(false);
  const [run, setRun] = useState(() => createRun());

  const horrorLines = useMemo(
    () => [
      "Something is listening.",
      "The dark is not empty.",
      "Do not sprint unless you have to.",
      "The walls swallowed the sound.",
      "You hear footsteps copying yours.",
      "It is close, but not close enough to see.",
      "Your flashlight catches a shape, then nothing.",
      "The hallway bends the wrong way.",
      "That door was not open before.",
      "It only needs to hear you once.",
    ],
    []
  );

  useEffect(() => {
    runRef.current = run;
  }, [run]);

  function restart() {
    const fresh = createRun();
    runRef.current = fresh;
    setRun(fresh);
    setStarted(true);
    lastRef.current = performance.now();
  }

  function isWalkable(r, x, y, radius = PLAYER_RADIUS) {
    return r.map.walkable.some((zone) => circleRectCollision({ x, y }, zone, radius));
  }

  function createNoise(r, x, y, power) {
    r.noisePulses.push({
      x,
      y,
      r: 4,
      max: power,
      alpha: 0.82,
    });

    const d = Math.hypot(r.monster.x - x, r.monster.y - y);

    if (d < power + 130) {
      r.monster.target = { x, y };
      r.monster.mode = "investigate";
      r.monster.anger = clamp(r.monster.anger + 16, 0, 100);
      r.message = "It heard that.";
    }
  }

  function triggerScare(r, text = "RUN") {
    r.scare = {
      text,
      timer: 1050,
      seed: Math.random(),
    };

    r.player.fear = clamp(r.player.fear + 24, 0, 100);
    r.glitch = 1;
  }

  function interact() {
    const r = runRef.current;
    if (!r || r.dead || r.won) return;

    const p = r.player;

    for (const item of r.items) {
      if (!item.collected && dist(p, item) < 42) {
        item.collected = true;
        r.collected += 1;
        r.glitch = 0.75;
        p.fear = clamp(p.fear + 8, 0, 100);

        createNoise(r, p.x, p.y, 230);

        if (r.collected >= ITEM_COUNT) {
          r.finalPhase = true;
          r.exit.active = true;
          r.monster.mode = "investigate";
          r.monster.target = { x: p.x, y: p.y };
          r.monster.speed = 3.25;
          r.message = "All fragments collected. The exit is awake. Run.";
          triggerScare(r, "IT KNOWS");
        } else {
          r.message = `${ITEM_COUNT - r.collected} fragments remain. Follow the static.`;
          if (Math.random() < 0.32) {
            triggerScare(r, choice(["BEHIND YOU", "NO SIGNAL", "IT HEARD YOU"]));
          }
        }

        return;
      }
    }

    for (const battery of r.batteries) {
      if (!battery.collected && dist(p, battery) < 38) {
        battery.collected = true;
        p.battery = clamp(p.battery + 35, 0, 100);
        r.message = "Battery found.";
        createNoise(r, p.x, p.y, 100);
        return;
      }
    }

    for (const medkit of r.medkits) {
      if (!medkit.collected && dist(p, medkit) < 38) {
        medkit.collected = true;
        p.hp = clamp(p.hp + 1, 0, 3);
        p.fear = clamp(p.fear - 15, 0, 100);
        r.message = "Your breathing steadies.";
        createNoise(r, p.x, p.y, 100);
        return;
      }
    }

    if (r.exit.active && dist(p, r.exit) < 58) {
      r.won = true;
      r.message = "You escaped. The dark did not.";
    }
  }

  function getObjective(r) {
    if (r.exit.active) return r.exit;

    const remaining = r.items.filter((item) => !item.collected);
    if (!remaining.length) return r.exit;

    return remaining.sort((a, b) => dist(a, r.player) - dist(b, r.player))[0];
  }

  function updateMonster(r, dt) {
    const p = r.player;
    const m = r.monster;

    if (m.stun > 0) {
      m.stun -= dt;
      return;
    }

    const sameZone = sameVisibilityZone(r.map, p, m);
    const d = dist(p, m);

    if (!p.hidden && sameZone && d < (r.finalPhase ? 560 : 440)) {
      m.mode = "chase";
      m.target = { x: p.x, y: p.y };
      m.anger = clamp(m.anger + 0.12 * dt, 0, 100);
    } else if (m.mode === "chase") {
      m.mode = "investigate";
      m.target = { x: p.x, y: p.y };
    }

    if (m.mode === "stalk") {
      if (!m.target || dist(m, m.target) < 38 || Math.random() < 0.006) {
        const playerZone = getZoneAt(r.map, p, 5);

        const possible = r.map.rooms
          .filter((room) => room.id !== playerZone?.id)
          .map((room) => ({
            room,
            d: dist({ x: room.x + room.w / 2, y: room.y + room.h / 2 }, p),
          }))
          .filter((entry) => entry.d > 260 && entry.d < 980)
          .sort(() => Math.random() - 0.5);

        const selected = possible[0]?.room || choice(r.map.rooms);
        m.target = randomPointInRect(selected, 55);
      }

      moveMonsterToward(r, m.target, m.speed * 0.58, dt);
    }

    if (m.mode === "investigate") {
      if (m.target) {
        moveMonsterToward(r, m.target, m.speed * 0.86, dt);
      }

      if (!m.target || dist(m, m.target) < 42) {
        m.mode = "stalk";
        m.target = null;
      }
    }

    if (m.mode === "chase") {
      m.target = { x: p.x, y: p.y };
      moveMonsterToward(r, m.target, m.speed * (r.finalPhase ? 1.24 : 1.08), dt);

      if (Math.random() < 0.025) {
        r.message = choice(["RUN.", "IT SEES YOU.", "DO NOT LOOK BACK."]);
      }
    }

    m.anger = clamp(m.anger - dt * 0.003, 0, 100);
  }

  function moveMonsterToward(r, target, speed, dt) {
    if (!target) return;

    const m = r.monster;
    const angle = Math.atan2(target.y - m.y, target.x - m.x);
    const step = speed * (dt / 16.67);

    const nx = m.x + Math.cos(angle) * step;
    const ny = m.y + Math.sin(angle) * step;

    if (isWalkable(r, nx, m.y, MONSTER_RADIUS)) {
      m.x = nx;
    } else {
      m.x += Math.cos(angle + rand(-1.7, 1.7)) * step * 0.42;
    }

    if (isWalkable(r, m.x, ny, MONSTER_RADIUS)) {
      m.y = ny;
    } else {
      m.y += Math.sin(angle + rand(-1.7, 1.7)) * step * 0.42;
    }
  }

  function haunt(r) {
    const p = r.player;
    const roll = Math.random();

    r.message = choice(horrorLines);
    r.glitch = Math.max(r.glitch, rand(0.18, 0.5));

    if (roll < 0.18) {
      const angle = rand(0, Math.PI * 2);
      r.hallucinations.push({
        x: p.x + Math.cos(angle) * rand(140, 230),
        y: p.y + Math.sin(angle) * rand(140, 230),
        timer: rand(550, 950),
        type: "eyes",
      });
    } else if (roll < 0.35) {
      const behind = {
        x: p.x - Math.cos(p.angle) * rand(140, 240),
        y: p.y - Math.sin(p.angle) * rand(140, 240),
      };
      createNoise(r, behind.x, behind.y, 150);
      r.message = "Footsteps behind you.";
    } else if (roll < 0.52) {
      p.fear = clamp(p.fear + rand(5, 11), 0, 100);
    } else if (roll < 0.68) {
      r.monster.mode = "investigate";
      r.monster.target = {
        x: p.x + rand(-220, 220),
        y: p.y + rand(-220, 220),
      };
    } else if (roll < 0.84 && p.fear > 42) {
      triggerScare(r, choice(["LOOK", "MOVE", "FOUND YOU"]));
    } else {
      r.message = "Silence. Too much silence.";
    }
  }

  function updateGame(dtMs) {
    const r = runRef.current;
    if (!r || !started || r.dead || r.won) return;

    const dt = Math.min(dtMs, 34);
    r.time += dt;
    r.objectiveBlink += dt;
    r.glitch = Math.max(0, r.glitch - dt / 1200);

    const p = r.player;
    const keys = keysRef.current;
    const cam = getCamera(r);

    if (p.invuln > 0) p.invuln -= dt;

    const worldMouse = {
      x: mouseRef.current.x + cam.x,
      y: mouseRef.current.y + cam.y,
    };

    p.angle = Math.atan2(worldMouse.y - p.y, worldMouse.x - p.x);

    let dx = 0;
    let dy = 0;

    if (!p.hidden) {
      if (keys.w || keys.arrowup) dy -= 1;
      if (keys.s || keys.arrowdown) dy += 1;
      if (keys.a || keys.arrowleft) dx -= 1;
      if (keys.d || keys.arrowright) dx += 1;
    }

    const moving = dx !== 0 || dy !== 0;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;

    const sprinting = moving && keys.shift && p.stamina > 8 && !p.hidden;
    const speed = sprinting ? 3.45 : 2.05;

    if (sprinting) {
      p.stamina = clamp(p.stamina - dt * 0.07, 0, 100);
      if (Math.random() < 0.052) createNoise(r, p.x, p.y, 170);
    } else {
      p.stamina = clamp(p.stamina + dt * 0.026, 0, 100);
    }

    if (moving && Math.random() < (sprinting ? 0.055 : 0.012)) {
      createNoise(r, p.x, p.y, sprinting ? 150 : 65);
    }

    const nx = p.x + dx * speed * (dt / 16.67);
    const ny = p.y + dy * speed * (dt / 16.67);

    if (isWalkable(r, nx, p.y, PLAYER_RADIUS)) p.x = nx;
    if (isWalkable(r, p.x, ny, PLAYER_RADIUS)) p.y = ny;

    if (!p.flashlightOff && p.battery > 0) {
      p.battery = clamp(p.battery - BATTERY_DRAIN * dt * (r.finalPhase ? 1.28 : 1), 0, 100);
    }

    if (p.battery <= 0) {
      p.flashlightOff = true;
    }

    updateMonster(r, dt);

    const sameZone = sameVisibilityZone(r.map, p, r.monster);
    const monsterDistance = dist(p, r.monster);

    if (!p.hidden && sameZone && monsterDistance < 460) {
      p.fear = clamp(
        p.fear + FEAR_MONSTER_GAIN * dt * (1 - monsterDistance / 500),
        0,
        100
      );
    } else if (p.flashlightOff || p.battery <= 0) {
      p.fear = clamp(p.fear + FEAR_DARK_GAIN * dt, 0, 100);
    } else {
      p.fear = clamp(p.fear - FEAR_DECAY * dt, 0, 100);
    }

    if (monsterDistance < PLAYER_RADIUS + MONSTER_RADIUS + 8 && p.invuln <= 0) {
      if (p.hidden && Math.random() > 0.5) {
        r.message = "It walked past you.";
        r.monster.mode = "stalk";
        r.monster.target = null;
        p.fear = clamp(p.fear + 18, 0, 100);
      } else {
        p.hp -= 1;
        p.invuln = 1800;
        p.hidden = false;
        p.fear = clamp(p.fear + 36, 0, 100);
        triggerScare(r, "CAUGHT");

        const safeRooms = r.map.rooms
          .filter((room) => dist({ x: room.x + room.w / 2, y: room.y + room.h / 2 }, p) > 360)
          .sort(() => Math.random() - 0.5);

        const room = safeRooms[0] || choice(r.map.rooms);
        const pos = randomPointInRect(room, 60);

        r.monster.x = pos.x;
        r.monster.y = pos.y;
        r.monster.mode = "stalk";
        r.monster.target = null;

        if (p.hp <= 0) {
          r.dead = true;
          r.message = "The dark learned your name.";
        }
      }
    }

    for (const pulse of r.noisePulses) {
      pulse.r += dt * 0.34;
      pulse.alpha -= dt * 0.0011;
    }

    r.noisePulses = r.noisePulses.filter((pulse) => pulse.alpha > 0 && pulse.r < pulse.max);

    for (const h of r.hallucinations) {
      h.timer -= dt;
    }

    r.hallucinations = r.hallucinations.filter((h) => h.timer > 0);

    r.hauntTimer -= dt;

    if (r.hauntTimer <= 0) {
      haunt(r);
      r.hauntTimer = rand(r.finalPhase ? 2300 : 5200, r.finalPhase ? 6000 : 12000);
    }

    if (r.scare) {
      r.scare.timer -= dt;
      if (r.scare.timer <= 0) r.scare = null;
    }

    setRun({ ...r });
  }

  function getCamera(r) {
    const fearShake = r.player.fear > 68 ? (r.player.fear - 68) * 0.08 : 0;
    const shake = r.glitch * 9 + fearShake;

    return {
      x: clamp(r.player.x - CANVAS_W / 2 + rand(-shake, shake), 0, WORLD_W - CANVAS_W),
      y: clamp(r.player.y - CANVAS_H / 2 + rand(-shake, shake), 0, WORLD_H - CANVAS_H),
    };
  }

  function drawGame(ctx, r) {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    const cam = getCamera(r);

    ctx.save();
    ctx.translate(-cam.x, -cam.y);

    drawWorld(ctx, r);
    drawItems(ctx, r);
    drawHidingSpots(ctx, r);
    drawExit(ctx, r);
    drawNoise(ctx, r);
    drawHallucinations(ctx, r);
    drawMonster(ctx, r);
    drawPlayer(ctx, r);

    ctx.restore();

    drawLighting(ctx, r, cam);
    drawHUD(ctx, r);
    drawOverlays(ctx, r);
  }

  function drawWorld(ctx, r) {
    ctx.fillStyle = "#020202";
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    for (const zone of r.map.walkable) {
      const isHall = zone.type === "hallway";

      ctx.fillStyle = isHall ? "#101010" : "#191818";
      ctx.fillRect(zone.x, zone.y, zone.w, zone.h);

      ctx.strokeStyle = isHall ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.065)";
      ctx.lineWidth = 2;
      ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);

      const stainCount = isHall ? 2 : 6;

      for (let i = 0; i < stainCount; i++) {
        const sx = zone.x + ((i * 79 + zone.decay * 233) % Math.max(1, zone.w - 30)) + 15;
        const sy = zone.y + ((i * 47 + zone.decay * 181) % Math.max(1, zone.h - 30)) + 15;

        ctx.fillStyle = i % 3 === 0 ? "rgba(80,0,0,0.18)" : "rgba(255,255,255,0.025)";
        ctx.beginPath();
        ctx.ellipse(sx, sy, rand(8, 22), rand(4, 13), rand(0, Math.PI), 0, Math.PI * 2);
        ctx.fill();
      }

      if (!isHall) {
        for (let i = 0; i < 3; i++) {
          const lx = zone.x + 35 + i * 76;
          const ly = zone.y + 26;
          ctx.fillStyle = "rgba(255,255,210,0.045)";
          ctx.fillRect(lx, ly, 44, 7);
        }

        ctx.strokeStyle = "rgba(255,255,255,0.05)";
        ctx.lineWidth = 1;

        for (let i = 0; i < 5; i++) {
          const x = zone.x + 20 + i * 60;
          ctx.beginPath();
          ctx.moveTo(x, zone.y + zone.h - 16);
          ctx.lineTo(x + rand(12, 28), zone.y + zone.h - rand(25, 55));
          ctx.stroke();
        }
      }
    }

    for (let i = 0; i < 160; i++) {
      const x = (i * 173) % WORLD_W;
      const y = (i * 97) % WORLD_H;

      ctx.fillStyle = "rgba(255,255,255,0.022)";
      ctx.fillRect(x, y, 1.5, 1.5);
    }
  }

  function drawItems(ctx, r) {
    for (const item of r.items) {
      if (item.collected) continue;

      item.pulse += 0.04;
      const glow = 12 + Math.sin(item.pulse) * 5;

      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.shadowColor = "rgba(255,0,0,0.95)";
      ctx.shadowBlur = glow;

      ctx.fillStyle = "#b01818";
      ctx.beginPath();
      ctx.moveTo(0, -15);
      ctx.lineTo(12, -4);
      ctx.lineTo(8, 13);
      ctx.lineTo(-8, 13);
      ctx.lineTo(-12, -4);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    for (const battery of r.batteries) {
      if (battery.collected) continue;

      ctx.save();
      ctx.translate(battery.x, battery.y);
      ctx.shadowColor = "rgba(240,230,160,0.6)";
      ctx.shadowBlur = 8;
      ctx.fillStyle = "#d9d1a0";
      ctx.fillRect(-10, -6, 20, 12);
      ctx.fillStyle = "#77704a";
      ctx.fillRect(10, -3, 4, 6);
      ctx.restore();
    }

    for (const medkit of r.medkits) {
      if (medkit.collected) continue;

      ctx.save();
      ctx.translate(medkit.x, medkit.y);
      ctx.shadowColor = "rgba(255,255,255,0.4)";
      ctx.shadowBlur = 7;
      ctx.fillStyle = "#d7d7d7";
      ctx.fillRect(-12, -10, 24, 20);
      ctx.fillStyle = "#801010";
      ctx.fillRect(-3, -8, 6, 16);
      ctx.fillRect(-8, -3, 16, 6);
      ctx.restore();
    }
  }

  function drawHidingSpots(ctx, r) {
    for (const h of r.hidingSpots) {
      ctx.save();
      ctx.translate(h.x, h.y);

      ctx.fillStyle = "#070707";
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 2;
      ctx.fillRect(-19, -28, 38, 56);
      ctx.strokeRect(-19, -28, 38, 56);

      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(-3, -21, 2, 42);
      ctx.fillRect(7, -2, 3, 3);

      ctx.restore();
    }
  }

  function drawExit(ctx, r) {
    if (!r.exit.active) return;

    ctx.save();
    ctx.translate(r.exit.x, r.exit.y);
    ctx.shadowColor = "rgba(230,255,230,0.95)";
    ctx.shadowBlur = 24;

    ctx.fillStyle = "#d8ffe2";
    ctx.fillRect(-36, -48, 72, 96);

    ctx.fillStyle = "#041208";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.fillText("EXIT", 0, -7);

    ctx.restore();
  }

  function drawNoise(ctx, r) {
    for (const pulse of r.noisePulses) {
      ctx.strokeStyle = `rgba(255,255,255,${pulse.alpha * 0.15})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pulse.x, pulse.y, pulse.r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawHallucinations(ctx, r) {
    for (const h of r.hallucinations) {
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.globalAlpha = clamp(h.timer / 900, 0, 0.85);

      ctx.fillStyle = "rgba(0,0,0,0.95)";
      ctx.beginPath();
      ctx.ellipse(0, 0, 32, 46, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.82)";
      ctx.beginPath();
      ctx.arc(-10, -8, 4, 0, Math.PI * 2);
      ctx.arc(10, -8, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  function drawPlayer(ctx, r) {
    const p = r.player;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);

    if (p.hidden) ctx.globalAlpha = 0.42;

    ctx.fillStyle = p.invuln > 0 ? "#ffffff" : "#d8d8d8";
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#111";
    ctx.fillRect(5, -5, 18, 10);

    ctx.restore();
  }

  function drawMonster(ctx, r) {
    const m = r.monster;
    const p = r.player;

    const sameZone = sameVisibilityZone(r.map, p, m);
    const d = dist(m, p);

    const shouldReveal =
      r.finalPhase ||
      sameZone ||
      d < 115 ||
      r.player.fear > 72 ||
      r.monster.mode === "chase";

    if (!shouldReveal) return;

    ctx.save();
    ctx.translate(m.x, m.y);

    const flicker = Math.random() < 0.18 ? rand(0.25, 0.9) : 1;
    ctx.globalAlpha = clamp((420 - d) / 350, 0.18, 0.98) * flicker;

    ctx.shadowColor = "rgba(0,0,0,1)";
    ctx.shadowBlur = 28;

    ctx.fillStyle = "#010101";
    ctx.beginPath();
    ctx.ellipse(0, 4, 22, 38, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(0, -32, 18, 24, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-16, -4);
    ctx.lineTo(-38, 34);
    ctx.moveTo(16, -4);
    ctx.lineTo(38, 34);
    ctx.moveTo(-10, 34);
    ctx.lineTo(-18, 64);
    ctx.moveTo(10, 34);
    ctx.lineTo(18, 64);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.86)";
    ctx.beginPath();
    ctx.arc(-7, -36, 3.2, 0, Math.PI * 2);
    ctx.arc(7, -36, 3.2, 0, Math.PI * 2);
    ctx.fill();

    if (m.mode === "chase") {
      ctx.fillStyle = "rgba(160,0,0,0.38)";
      ctx.beginPath();
      ctx.arc(0, -36, 23, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawLighting(ctx, r, cam) {
    const p = r.player;

    const px = p.x - cam.x;
    const py = p.y - cam.y;

    const darkness = document.createElement("canvas");
    darkness.width = CANVAS_W;
    darkness.height = CANVAS_H;

    const dctx = darkness.getContext("2d");

    dctx.fillStyle = "rgba(0,0,0,0.965)";
    dctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const currentZone = getZoneAt(r.map, p, 6);

    const revealZones = r.map.walkable.filter((zone) => {
      if (!currentZone) return rectDistanceToPoint(zone, p) < 110;
      if (zone.id === currentZone.id) return true;
      if (zonesTouch(zone, currentZone) && rectDistanceToPoint(zone, p) < 90) return true;
      return false;
    });

    dctx.globalCompositeOperation = "destination-out";

    for (const zone of revealZones) {
      dctx.save();

      dctx.beginPath();
      dctx.rect(zone.x - cam.x, zone.y - cam.y, zone.w, zone.h);
      dctx.clip();

      const baseRadius = p.flashlightOff ? 56 : 86 + p.battery * 0.55;
      const fearPenalty = p.fear * 0.36;
      const radius = clamp(baseRadius - fearPenalty, 34, 132);

      const playerGlow = dctx.createRadialGradient(px, py, 8, px, py, radius);
      playerGlow.addColorStop(0, "rgba(255,255,255,0.92)");
      playerGlow.addColorStop(0.5, "rgba(255,255,255,0.32)");
      playerGlow.addColorStop(1, "rgba(255,255,255,0)");

      dctx.fillStyle = playerGlow;
      dctx.beginPath();
      dctx.arc(px, py, radius, 0, Math.PI * 2);
      dctx.fill();

      if (!p.flashlightOff && p.battery > 0) {
        const flicker = Math.random() < p.fear / 620 ? rand(0.45, 0.9) : 1;
        const coneLen = clamp(230 + p.battery * 0.95 - p.fear * 1.2, 105, 330) * flicker;
        const coneWidth = 0.42;

        const coneGlow = dctx.createRadialGradient(px, py, 16, px, py, coneLen);
        coneGlow.addColorStop(0, "rgba(255,255,255,0.75)");
        coneGlow.addColorStop(0.42, "rgba(255,255,255,0.34)");
        coneGlow.addColorStop(1, "rgba(255,255,255,0)");

        dctx.fillStyle = coneGlow;
        dctx.beginPath();
        dctx.moveTo(px, py);
        dctx.arc(px, py, coneLen, p.angle - coneWidth, p.angle + coneWidth);
        dctx.closePath();
        dctx.fill();
      }

      dctx.restore();
    }

    dctx.globalCompositeOperation = "source-over";
    ctx.drawImage(darkness, 0, 0);

    const vignette = ctx.createRadialGradient(
      CANVAS_W / 2,
      CANVAS_H / 2,
      70,
      CANVAS_W / 2,
      CANVAS_H / 2,
      620
    );

    vignette.addColorStop(0, "rgba(0,0,0,0.02)");
    vignette.addColorStop(0.55, "rgba(0,0,0,0.28)");
    vignette.addColorStop(1, "rgba(0,0,0,0.9)");

    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  function drawHUD(ctx, r) {
    const p = r.player;
    const objective = getObjective(r);
    const objectiveDistance = objective ? Math.round(dist(p, objective)) : 0;

    ctx.save();

    ctx.fillStyle = "rgba(0,0,0,0.52)";
    ctx.fillRect(18, 18, 302, 146);

    ctx.strokeStyle = "rgba(255,255,255,0.13)";
    ctx.strokeRect(18, 18, 302, 146);

    ctx.fillStyle = "#f4f4f4";
    ctx.font = "bold 18px Arial";
    ctx.fillText("SOMETHING HEARD YOU", 34, 45);

    drawBar(ctx, 34, 64, 218, 12, p.battery, "#d8d0a3", "Battery");
    drawBar(ctx, 34, 91, 218, 12, 100 - p.fear, "#a9c7da", "Calm");
    drawBar(ctx, 34, 118, 218, 12, p.stamina, "#d6d6d6", "Stamina");

    ctx.fillStyle = "#f3f3f3";
    ctx.font = "14px Arial";
    ctx.fillText(`Health: ${"♥".repeat(Math.max(0, p.hp))}`, 34, 148);

    ctx.textAlign = "right";
    ctx.fillStyle = "#f3f3f3";
    ctx.font = "14px Arial";
    ctx.fillText(`Fragments: ${r.collected}/${ITEM_COUNT}`, CANVAS_W - 34, 37);

    drawObjectiveCompass(ctx, r, objective, objectiveDistance);

    if (r.finalPhase) {
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(140,0,0,0.42)";
      ctx.fillRect(CANVAS_W / 2 - 164, 20, 328, 42);
      ctx.strokeStyle = "rgba(255,70,70,0.52)";
      ctx.strokeRect(CANVAS_W / 2 - 164, 20, 328, 42);

      ctx.fillStyle = "#ffd8d8";
      ctx.font = "bold 18px Arial";
      ctx.fillText("THE EXIT IS OPEN. RUN.", CANVAS_W / 2, 47);
    }

    if (r.message) {
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(0,0,0,0.64)";
      ctx.fillRect(CANVAS_W / 2 - 312, CANVAS_H - 74, 624, 44);

      ctx.strokeStyle = "rgba(255,255,255,0.11)";
      ctx.strokeRect(CANVAS_W / 2 - 312, CANVAS_H - 74, 624, 44);

      ctx.fillStyle = "#eeeeee";
      ctx.font = "15px Arial";
      ctx.fillText(r.message, CANVAS_W / 2, CANVAS_H - 46);
    }

    if (p.hidden) {
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(220,230,255,0.9)";
      ctx.font = "bold 15px Arial";
      ctx.fillText("HIDING — DO NOT MOVE", CANVAS_W / 2, 82);
    }

    ctx.restore();
  }

  function drawObjectiveCompass(ctx, r, objective, distance) {
    if (!objective) return;

    const p = r.player;
    const angle = Math.atan2(objective.y - p.y, objective.x - p.x);
    const pulse = 0.65 + Math.sin(r.objectiveBlink / 210) * 0.25;

    ctx.save();
    ctx.translate(CANVAS_W - 82, 88);
    ctx.rotate(angle);

    ctx.globalAlpha = pulse;
    ctx.fillStyle = r.exit.active ? "#d9ffe2" : "#ffb8b8";
    ctx.beginPath();
    ctx.moveTo(22, 0);
    ctx.lineTo(-10, -10);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-10, 10);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.font = "12px Arial";
    ctx.fillText(r.exit.active ? "EXIT" : "STATIC", CANVAS_W - 82, 122);
    ctx.fillText(`${distance}m`, CANVAS_W - 82, 139);
    ctx.restore();
  }

  function drawBar(ctx, x, y, w, h, value, color, label) {
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x, y, w, h);

    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * clamp(value / 100, 0, 1), h);

    ctx.strokeStyle = "rgba(255,255,255,0.17)";
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.font = "11px Arial";
    ctx.fillText(label, x + w + 12, y + 10);
  }

  function drawOverlays(ctx, r) {
    const fear = r.player.fear / 100;

    ctx.save();
    ctx.globalAlpha = 0.12 + fear * 0.16;

    for (let i = 0; i < 80; i++) {
      const x = (i * 97 + r.time * 0.015) % CANVAS_W;
      const y = (i * 53 + r.time * 0.027) % CANVAS_H;

      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(x, y, 1, 1);
    }

    ctx.restore();

    if (fear > 0.45) {
      ctx.save();
      ctx.globalAlpha = (fear - 0.45) * 0.4;
      ctx.fillStyle = "rgba(120,0,0,0.22)";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.restore();
    }

    if (r.glitch > 0) {
      ctx.save();
      ctx.globalAlpha = r.glitch * 0.22;

      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = i % 2 ? "rgba(255,0,0,0.42)" : "rgba(255,255,255,0.28)";
        ctx.fillRect(0, rand(0, CANVAS_H), CANVAS_W, rand(2, 8));
      }

      ctx.restore();
    }

    if (r.scare) {
      const alpha = clamp(r.scare.timer / 1050, 0, 1);
      const grow = 1 + (1 - alpha) * 1.4;

      ctx.save();

      ctx.fillStyle = `rgba(0,0,0,${0.36 + alpha * 0.38})`;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      ctx.translate(CANVAS_W / 2 + rand(-8, 8), CANVAS_H / 2 + rand(-8, 8));
      ctx.scale(grow, grow);

      ctx.fillStyle = "rgba(5,5,5,0.98)";
      ctx.beginPath();
      ctx.ellipse(0, -22, 118, 162, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(255,255,255,${0.9})`;
      ctx.beginPath();
      ctx.ellipse(-42, -58, 18, 28, -0.2, 0, Math.PI * 2);
      ctx.ellipse(42, -58, 18, 28, 0.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(0,0,0,0.95)";
      ctx.beginPath();
      ctx.arc(-42, -56, 7, 0, Math.PI * 2);
      ctx.arc(42, -56, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-55, 35);
      ctx.quadraticCurveTo(0, 95, 55, 35);
      ctx.stroke();

      for (let i = 0; i < 9; i++) {
        ctx.strokeStyle = "rgba(255,255,255,0.2)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-45 + i * 11, 39);
        ctx.lineTo(-51 + i * 12, 78);
        ctx.stroke();
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);

      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.font = "bold 54px Arial";
      ctx.textAlign = "center";
      ctx.fillText(r.scare.text, CANVAS_W / 2, CANVAS_H - 86);

      ctx.restore();
    }

    if (!started || r.dead || r.won) {
      ctx.save();

      ctx.fillStyle = "rgba(0,0,0,0.86)";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      ctx.textAlign = "center";
      ctx.fillStyle = "#f4f4f4";
      ctx.font = "bold 48px Arial";

      if (!started) {
        ctx.fillText("SOMETHING HEARD YOU", CANVAS_W / 2, CANVAS_H / 2 - 86);

        ctx.font = "18px Arial";
        ctx.fillStyle = "rgba(255,255,255,0.78)";
        ctx.fillText("A dark horror roguelike. Follow the static. Do not let it hear you.", CANVAS_W / 2, CANVAS_H / 2 - 34);
        ctx.fillText("WASD move • Mouse aim • Shift sprint • E interact • F flashlight • Space hide", CANVAS_W / 2, CANVAS_H / 2);
        ctx.fillText("Collect 6 fragments. Then escape.", CANVAS_W / 2, CANVAS_H / 2 + 34);
      }

      if (r.dead) {
        ctx.fillText("YOU WERE HEARD", CANVAS_W / 2, CANVAS_H / 2 - 42);

        ctx.font = "18px Arial";
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.fillText("The dark learned your name.", CANVAS_W / 2, CANVAS_H / 2);
      }

      if (r.won) {
        ctx.fillText("YOU ESCAPED", CANVAS_W / 2, CANVAS_H / 2 - 42);

        ctx.font = "18px Arial";
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.fillText("But the signal is still active.", CANVAS_W / 2, CANVAS_H / 2);
      }

      ctx.restore();
    }
  }

  useEffect(() => {
    const down = (e) => {
      const key = e.key.toLowerCase();
      keysRef.current[key] = true;

      if (["w", "a", "s", "d", " ", "shift", "e", "f"].includes(key)) {
        e.preventDefault();
      }

      if (key === "f") {
        const r = runRef.current;
        if (!r || r.dead || r.won) return;

        r.player.flashlightOff = !r.player.flashlightOff;
        r.message = r.player.flashlightOff ? "You turned off the light." : "The flashlight flickers on.";
      }

      if (key === "e") {
        interact();
      }

      if (key === " ") {
        const r = runRef.current;
        if (!r || r.dead || r.won) return;

        const nearHide = r.hidingSpots.find((spot) => dist(spot, r.player) < 45);

        if (nearHide) {
          r.player.hidden = !r.player.hidden;
          r.message = r.player.hidden ? "You hold your breath." : "You step out.";
          if (!r.player.hidden) createNoise(r, r.player.x, r.player.y, 185);
        } else {
          r.message = "No hiding spot nearby.";
        }
      }
    };

    const up = (e) => {
      keysRef.current[e.key.toLowerCase()] = false;
    };

    const move = (e) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();

      mouseRef.current = {
        x: ((e.clientX - rect.left) / rect.width) * CANVAS_W,
        y: ((e.clientY - rect.top) / rect.height) * CANVAS_H,
      };
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("mousemove", move);

    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("mousemove", move);
    };
  }, []);

  useEffect(() => {
    const tick = (now) => {
      const dt = now - lastRef.current;
      lastRef.current = now;

      updateGame(dt);

      const ctx = canvasRef.current?.getContext("2d");
      const r = runRef.current;

      if (ctx && r) {
        drawGame(ctx, r);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafRef.current);
  }, [started]);

  return (
    <div className="shy-page">
      <div className="shy-shell">
        <div className="shy-header">
          <div>
            <p className="shy-kicker">Final hidden game</p>
            <h1>Something Heard You</h1>
            <p>
              A dark roguelike horror game with a maze layout, flashlight
              survival, fear, noise, jump scares, and a creature that only fully
              chases when it shares your hallway.
            </p>
          </div>

          <div className="shy-actions">
            <button onClick={started ? restart : () => setStarted(true)}>
              {started ? "Restart Run" : "Start Run"}
            </button>

            {onExit && (
              <button className="shy-secondary" onClick={onExit}>
                Back to Games
              </button>
            )}
          </div>
        </div>

        <div className="shy-game-card">
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            className="shy-canvas"
            onClick={() => {
              if (!started) setStarted(true);
            }}
          />

          <div className="shy-controls">
            <span>WASD move</span>
            <span>Mouse aim</span>
            <span>Shift sprint</span>
            <span>E interact</span>
            <span>F flashlight</span>
            <span>Space hide</span>
          </div>
        </div>

        <div className="shy-notes">
          <div>
            <h3>Goal</h3>
            <p>
              Collect 6 fragments. The compass points toward the nearest one.
              After that, follow it to the exit.
            </p>
          </div>

          <div>
            <h3>Monster</h3>
            <p>
              It moves fast, but it only fully chases when it shares your room
              or hallway. Running still attracts it.
            </p>
          </div>

          <div>
            <h3>Survival</h3>
            <p>
              Darkness and close encounters raise fear. High fear causes worse
              visibility, glitches, haunt events, and jump scares.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}