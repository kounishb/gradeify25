import React, { useEffect, useMemo, useRef, useState } from "react";
import "../../styles/SomethingHeardYou.css";

const CANVAS_W = 980;
const CANVAS_H = 620;

const WORLD_W = 2400;
const WORLD_H = 1800;

const PLAYER_RADIUS = 15;
const MONSTER_RADIUS = 22;

const ITEM_COUNT = 6;
const BATTERY_DRAIN = 0.0035;
const FEAR_DARK_GAIN = 0.012;
const FEAR_MONSTER_GAIN = 0.08;
const FEAR_DECAY = 0.018;

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rand = (min, max) => Math.random() * (max - min) + min;
const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];

function rectsOverlap(a, b, pad = 0) {
  return (
    a.x - pad < b.x + b.w &&
    a.x + a.w + pad > b.x &&
    a.y - pad < b.y + b.h &&
    a.y + a.h + pad > b.y
  );
}

function pointInRect(p, r, pad = 0) {
  return (
    p.x >= r.x - pad &&
    p.x <= r.x + r.w + pad &&
    p.y >= r.y - pad &&
    p.y <= r.y + r.h + pad
  );
}

function circleRectCollision(circle, rect, radius) {
  const closestX = clamp(circle.x, rect.x, rect.x + rect.w);
  const closestY = clamp(circle.y, rect.y, rect.y + rect.h);
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  return dx * dx + dy * dy < radius * radius;
}

function makeRooms() {
  const rooms = [
    { x: 1030, y: 790, w: 340, h: 230, type: "spawn" },
  ];

  let attempts = 0;

  while (rooms.length < 18 && attempts < 900) {
    attempts++;
    const w = rand(220, 420);
    const h = rand(180, 330);
    const room = {
      x: rand(120, WORLD_W - w - 120),
      y: rand(120, WORLD_H - h - 120),
      w,
      h,
      type: "normal",
    };

    if (!rooms.some((r) => rectsOverlap(room, r, 70))) {
      rooms.push(room);
    }
  }

  const corridors = [];

  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1];
    const b = rooms[i];

    const ax = a.x + a.w / 2;
    const ay = a.y + a.h / 2;
    const bx = b.x + b.w / 2;
    const by = b.y + b.h / 2;

    if (Math.random() > 0.5) {
      corridors.push({
        x: Math.min(ax, bx),
        y: ay - 28,
        w: Math.abs(ax - bx),
        h: 56,
        type: "corridor",
      });
      corridors.push({
        x: bx - 28,
        y: Math.min(ay, by),
        w: 56,
        h: Math.abs(ay - by),
        type: "corridor",
      });
    } else {
      corridors.push({
        x: ax - 28,
        y: Math.min(ay, by),
        w: 56,
        h: Math.abs(ay - by),
        type: "corridor",
      });
      corridors.push({
        x: Math.min(ax, bx),
        y: by - 28,
        w: Math.abs(ax - bx),
        h: 56,
        type: "corridor",
      });
    }
  }

  const walkable = [...rooms, ...corridors].map((r) => ({
    ...r,
    id: crypto.randomUUID?.() || Math.random().toString(36),
  }));

  const farRooms = rooms
    .filter((r) => r.type !== "spawn")
    .sort((a, b) => {
      const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
      const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      const spawn = { x: 1200, y: 900 };
      return dist(bc, spawn) - dist(ac, spawn);
    });

  const exitRoom = farRooms[0] || rooms[rooms.length - 1];

  return { rooms, corridors, walkable, exitRoom };
}

function randomPointInRoom(room, pad = 45) {
  return {
    x: rand(room.x + pad, room.x + room.w - pad),
    y: rand(room.y + pad, room.y + room.h - pad),
  };
}

function generateRun() {
  const map = makeRooms();

  const normalRooms = map.rooms.filter((r) => r.type !== "spawn");
  const shuffled = [...normalRooms].sort(() => Math.random() - 0.5);

  const items = shuffled.slice(0, ITEM_COUNT).map((room, i) => ({
    id: `sig-${i}`,
    ...randomPointInRoom(room),
    collected: false,
    label: choice(["tape", "idol", "bone", "mask", "coin", "eye", "key"]),
    pulse: Math.random() * Math.PI * 2,
  }));

  const batteries = shuffled.slice(ITEM_COUNT, ITEM_COUNT + 7).map((room, i) => ({
    id: `bat-${i}`,
    ...randomPointInRoom(room),
    collected: false,
  }));

  const medkits = shuffled.slice(ITEM_COUNT + 7, ITEM_COUNT + 10).map((room, i) => ({
    id: `med-${i}`,
    ...randomPointInRoom(room),
    collected: false,
  }));

  const hidingSpots = shuffled.slice(ITEM_COUNT + 10, ITEM_COUNT + 16).map((room, i) => ({
    id: `hide-${i}`,
    ...randomPointInRoom(room),
    r: 24,
  }));

  const spawn = map.rooms.find((r) => r.type === "spawn");
  const exit = {
    x: map.exitRoom.x + map.exitRoom.w / 2,
    y: map.exitRoom.y + map.exitRoom.h / 2,
    active: false,
  };

  const monsterRoom = shuffled[shuffled.length - 1] || map.exitRoom;

  return {
    map,
    player: {
      x: spawn.x + spawn.w / 2,
      y: spawn.y + spawn.h / 2,
      angle: 0,
      hp: 3,
      fear: 8,
      battery: 100,
      stamina: 100,
      hidden: false,
      invuln: 0,
    },
    monster: {
      x: monsterRoom.x + monsterRoom.w / 2,
      y: monsterRoom.y + monsterRoom.h / 2,
      mode: "stalk",
      target: null,
      lastSeen: null,
      speed: 1.15,
      anger: 0,
      stun: 0,
      blink: 0,
    },
    items,
    batteries,
    medkits,
    hidingSpots,
    exit,
    collected: 0,
    won: false,
    dead: false,
    finalPhase: false,
    message: "Find the signal fragments. Do not let it hear you.",
    scare: null,
    noisePulses: [],
    hauntTimer: rand(5000, 10000),
    glitch: 0,
    time: 0,
  };
}

export default function SomethingHeardYou() {
  const canvasRef = useRef(null);
  const keysRef = useRef({});
  const mouseRef = useRef({ x: CANVAS_W / 2, y: CANVAS_H / 2 });
  const rafRef = useRef(null);
  const lastRef = useRef(performance.now());
  const runRef = useRef(null);

  const [run, setRun] = useState(() => generateRun());
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);

  const horrorLines = useMemo(
    () => [
      "Something moved in the dark.",
      "The walls are closer than before.",
      "You hear breathing, but not yours.",
      "Do not run.",
      "It heard that.",
      "The hallway was not this long.",
      "Your flashlight flickers.",
      "There is something behind you.",
      "The exit sign points nowhere.",
      "It is learning your footsteps.",
    ],
    []
  );

  useEffect(() => {
    runRef.current = run;
  }, [run]);

  function restart() {
    const fresh = generateRun();
    runRef.current = fresh;
    setRun(fresh);
    setStarted(true);
    lastRef.current = performance.now();
  }

  useEffect(() => {
    const down = (e) => {
      keysRef.current[e.key.toLowerCase()] = true;

      if (["w", "a", "s", "d", " ", "shift", "e", "f"].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }

      if (e.key.toLowerCase() === "f") {
        const r = runRef.current;
        if (!r || r.dead || r.won) return;
        r.player.flashlightOff = !r.player.flashlightOff;
      }

      if (e.key.toLowerCase() === "e") {
        interact();
      }

      if (e.key === " ") {
        const r = runRef.current;
        if (!r || r.dead || r.won) return;
        const nearHide = r.hidingSpots.find((h) => dist(h, r.player) < 45);
        if (nearHide) {
          r.player.hidden = !r.player.hidden;
          r.message = r.player.hidden ? "You hold your breath." : "You step back out.";
          if (!r.player.hidden) createNoise(r, r.player.x, r.player.y, 210);
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
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
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

  function isWalkable(r, x, y, radius = PLAYER_RADIUS) {
    return r.map.walkable.some((zone) => circleRectCollision({ x, y }, zone, radius));
  }

  function createNoise(r, x, y, power) {
    r.noisePulses.push({
      x,
      y,
      r: 5,
      max: power,
      alpha: 0.8,
    });

    const d = Math.hypot(r.monster.x - x, r.monster.y - y);
    if (d < power + 120 && r.monster.stun <= 0) {
      r.monster.target = { x, y };
      r.monster.mode = d < power * 0.75 ? "chase" : "investigate";
      r.monster.anger += 10;
      r.message = "It heard you.";
    }
  }

  function interact() {
    const r = runRef.current;
    if (!r || r.dead || r.won) return;

    const p = r.player;

    for (const item of r.items) {
      if (!item.collected && dist(p, item) < 42) {
        item.collected = true;
        r.collected += 1;
        r.player.fear = clamp(r.player.fear + 10, 0, 100);
        r.glitch = 0.8;
        createNoise(r, p.x, p.y, 250);

        if (r.collected >= ITEM_COUNT) {
          r.finalPhase = true;
          r.exit.active = true;
          r.monster.mode = "chase";
          r.monster.speed = 1.95;
          r.message = "The signal is complete. Run to the exit.";
          triggerScare(r, "THE DARK HEARD YOU");
        } else {
          r.message = `${ITEM_COUNT - r.collected} fragments remain.`;
          if (Math.random() < 0.35) triggerScare(r, choice(["DON'T TURN AROUND", "IT IS CLOSER", "RUN"]));
        }

        return;
      }
    }

    for (const bat of r.batteries) {
      if (!bat.collected && dist(p, bat) < 38) {
        bat.collected = true;
        p.battery = clamp(p.battery + 32, 0, 100);
        r.message = "Battery recovered.";
        createNoise(r, p.x, p.y, 120);
        return;
      }
    }

    for (const med of r.medkits) {
      if (!med.collected && dist(p, med) < 38) {
        med.collected = true;
        p.hp = clamp(p.hp + 1, 0, 3);
        p.fear = clamp(p.fear - 18, 0, 100);
        r.message = "You steady yourself.";
        createNoise(r, p.x, p.y, 120);
        return;
      }
    }

    if (r.exit.active && dist(p, r.exit) < 55) {
      r.won = true;
      r.message = "You escaped, but something followed the signal out.";
    }
  }

  function triggerScare(r, text = "LOOK") {
    r.scare = {
      text,
      timer: 850,
      faceSeed: Math.random(),
    };
    r.player.fear = clamp(r.player.fear + 22, 0, 100);
    r.glitch = 1;
  }

  function updateGame(dtMs) {
    const r = runRef.current;
    if (!r || !started || r.dead || r.won) return;

    const dt = Math.min(dtMs, 33);
    r.time += dt;
    r.glitch = Math.max(0, r.glitch - dt / 900);

    const p = r.player;
    const m = r.monster;
    const keys = keysRef.current;

    if (p.invuln > 0) p.invuln -= dt;
    if (m.stun > 0) m.stun -= dt;

    const cam = getCamera(r);
    const mx = mouseRef.current.x + cam.x;
    const my = mouseRef.current.y + cam.y;
    p.angle = Math.atan2(my - p.y, mx - p.x);

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

    const sprinting = keys.shift && p.stamina > 5 && moving && !p.hidden;
    const speed = sprinting ? 3.65 : 2.15;

    if (sprinting) {
      p.stamina = clamp(p.stamina - dt * 0.08, 0, 100);
      if (Math.random() < 0.05) createNoise(r, p.x, p.y, 170);
    } else {
      p.stamina = clamp(p.stamina + dt * 0.035, 0, 100);
    }

    if (moving && Math.random() < (sprinting ? 0.06 : 0.018)) {
      createNoise(r, p.x, p.y, sprinting ? 160 : 75);
    }

    const nx = p.x + dx * speed * (dt / 16.67);
    const ny = p.y + dy * speed * (dt / 16.67);

    if (isWalkable(r, nx, p.y)) p.x = nx;
    if (isWalkable(r, p.x, ny)) p.y = ny;

    p.x = clamp(p.x, 20, WORLD_W - 20);
    p.y = clamp(p.y, 20, WORLD_H - 20);

    if (!p.flashlightOff && p.battery > 0) {
      p.battery = clamp(p.battery - BATTERY_DRAIN * dt * (r.finalPhase ? 1.4 : 1), 0, 100);
    }

    if (p.battery <= 0) {
      p.flashlightOff = true;
    }

    updateMonster(r, dt);

    const monsterDistance = dist(p, m);

    if (monsterDistance < 280 && !p.hidden) {
      p.fear = clamp(p.fear + FEAR_MONSTER_GAIN * dt * (1 - monsterDistance / 300), 0, 100);
    } else if (p.flashlightOff || p.battery <= 0) {
      p.fear = clamp(p.fear + FEAR_DARK_GAIN * dt, 0, 100);
    } else {
      p.fear = clamp(p.fear - FEAR_DECAY * dt, 0, 100);
    }

    if (monsterDistance < PLAYER_RADIUS + MONSTER_RADIUS + 6 && p.invuln <= 0) {
      if (p.hidden && Math.random() > 0.45) {
        r.message = "It passed inches away.";
        m.mode = "stalk";
        m.target = null;
        p.fear = clamp(p.fear + 18, 0, 100);
      } else {
        p.hp -= 1;
        p.invuln = 1800;
        p.hidden = false;
        p.fear = clamp(p.fear + 35, 0, 100);
        triggerScare(r, "CAUGHT");
        m.x += rand(-140, 140);
        m.y += rand(-140, 140);

        if (p.hp <= 0) {
          r.dead = true;
          r.message = "No one heard you scream.";
        }
      }
    }

    for (const pulse of r.noisePulses) {
      pulse.r += dt * 0.35;
      pulse.alpha -= dt * 0.0012;
    }

    r.noisePulses = r.noisePulses.filter((pulse) => pulse.alpha > 0 && pulse.r < pulse.max);

    r.hauntTimer -= dt;
    if (r.hauntTimer <= 0) {
      runHauntEvent(r, horrorLines);
      r.hauntTimer = rand(r.finalPhase ? 2500 : 5500, r.finalPhase ? 6500 : 13000);
    }

    if (r.scare) {
      r.scare.timer -= dt;
      if (r.scare.timer <= 0) r.scare = null;
    }

    setRun({ ...r });
  }

  function updateMonster(r, dt) {
    const p = r.player;
    const m = r.monster;

    if (m.stun > 0) return;

    const d = dist(p, m);
    const canSensePlayer = !p.hidden && d < (r.finalPhase ? 420 : 280 + m.anger * 2);

    if (canSensePlayer && Math.random() < 0.025) {
      m.mode = r.finalPhase || d < 170 || p.fear > 65 ? "chase" : "stalk";
      m.target = { x: p.x, y: p.y };
    }

    if (m.mode === "stalk") {
      if (!m.target || dist(m, m.target) < 40 || Math.random() < 0.008) {
        const nearbyRooms = r.map.rooms
          .map((room) => ({
            room,
            d: dist(
              { x: room.x + room.w / 2, y: room.y + room.h / 2 },
              p
            ),
          }))
          .filter((entry) => entry.d > 260 && entry.d < 850)
          .sort(() => Math.random() - 0.5);

        const selected = nearbyRooms[0]?.room || choice(r.map.rooms);
        m.target = randomPointInRoom(selected, 50);
      }

      moveMonsterToward(r, m.target, m.speed * 0.55, dt);
    }

    if (m.mode === "investigate") {
      if (m.target) moveMonsterToward(r, m.target, m.speed * 0.85, dt);

      if (!m.target || dist(m, m.target) < 38) {
        m.mode = "stalk";
        m.target = null;
      }
    }

    if (m.mode === "chase") {
      m.target = { x: p.x, y: p.y };
      moveMonsterToward(r, m.target, m.speed * (r.finalPhase ? 1.3 : 1), dt);

      if (d > 620 && !r.finalPhase) {
        m.mode = "stalk";
        m.target = null;
      }
    }

    m.anger = clamp(m.anger - dt * 0.002, 0, 100);
  }

  function moveMonsterToward(r, target, speed, dt) {
    const m = r.monster;
    if (!target) return;

    const angle = Math.atan2(target.y - m.y, target.x - m.x);
    const step = speed * (dt / 16.67);

    const nx = m.x + Math.cos(angle) * step;
    const ny = m.y + Math.sin(angle) * step;

    if (isWalkable(r, nx, m.y, MONSTER_RADIUS)) {
      m.x = nx;
    } else {
      m.x += Math.cos(angle + rand(-1.4, 1.4)) * step * 0.35;
    }

    if (isWalkable(r, m.x, ny, MONSTER_RADIUS)) {
      m.y = ny;
    } else {
      m.y += Math.sin(angle + rand(-1.4, 1.4)) * step * 0.35;
    }
  }

  function runHauntEvent(r, lines) {
    const p = r.player;
    const event = Math.random();

    r.message = choice(lines);

    if (event < 0.25) {
      r.glitch = 0.65;
    } else if (event < 0.45) {
      const behind = {
        x: p.x - Math.cos(p.angle) * rand(120, 220),
        y: p.y - Math.sin(p.angle) * rand(120, 220),
      };
      createNoise(r, behind.x, behind.y, 180);
    } else if (event < 0.62) {
      r.monster.mode = "investigate";
      r.monster.target = {
        x: p.x + rand(-160, 160),
        y: p.y + rand(-160, 160),
      };
    } else if (event < 0.78) {
      r.player.fear = clamp(r.player.fear + rand(6, 14), 0, 100);
    } else if (event < 0.9 && r.player.fear > 45) {
      triggerScare(r, choice(["NO SIGNAL", "IT SAW YOU", "HIDE"]));
    } else {
      r.message = "Silence.";
    }
  }

  function getCamera(r) {
    const shake = r.glitch * 8 + (r.player.fear > 75 ? rand(-2, 2) : 0);

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
    drawMonster(ctx, r);
    drawPlayer(ctx, r);

    ctx.restore();

    drawLighting(ctx, r, cam);
    drawHUD(ctx, r);
    drawOverlays(ctx, r);
  }

  function drawWorld(ctx, r) {
    ctx.fillStyle = "#070707";
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    for (const zone of r.map.walkable) {
      const isCorridor = zone.type === "corridor";
      ctx.fillStyle = isCorridor ? "#151515" : "#1c1b1b";
      ctx.fillRect(zone.x, zone.y, zone.w, zone.h);

      ctx.strokeStyle = isCorridor ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.06)";
      ctx.lineWidth = 2;
      ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);

      if (!isCorridor) {
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = "rgba(255,255,255,0.025)";
          ctx.fillRect(
            zone.x + 25 + i * 70,
            zone.y + 24,
            38,
            8
          );
        }
      }
    }

    for (let i = 0; i < 130; i++) {
      const x = (i * 173) % WORLD_W;
      const y = (i * 91) % WORLD_H;
      ctx.fillStyle = "rgba(255,255,255,0.025)";
      ctx.fillRect(x, y, 2, 2);
    }
  }

  function drawItems(ctx, r) {
    for (const item of r.items) {
      if (item.collected) continue;

      item.pulse += 0.03;
      const glow = 8 + Math.sin(item.pulse) * 4;

      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.shadowColor = "rgba(255, 70, 70, 0.8)";
      ctx.shadowBlur = glow;
      ctx.fillStyle = "#9e1b1b";
      ctx.beginPath();
      ctx.moveTo(0, -13);
      ctx.lineTo(10, 0);
      ctx.lineTo(0, 13);
      ctx.lineTo(-10, 0);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.fillRect(-3, -3, 6, 6);
      ctx.restore();
    }

    for (const bat of r.batteries) {
      if (bat.collected) continue;
      ctx.save();
      ctx.translate(bat.x, bat.y);
      ctx.fillStyle = "#d6d6aa";
      ctx.fillRect(-10, -6, 20, 12);
      ctx.fillStyle = "#8b8b61";
      ctx.fillRect(10, -3, 4, 6);
      ctx.restore();
    }

    for (const med of r.medkits) {
      if (med.collected) continue;
      ctx.save();
      ctx.translate(med.x, med.y);
      ctx.fillStyle = "#d8d8d8";
      ctx.fillRect(-12, -10, 24, 20);
      ctx.fillStyle = "#8b1111";
      ctx.fillRect(-3, -8, 6, 16);
      ctx.fillRect(-8, -3, 16, 6);
      ctx.restore();
    }
  }

  function drawHidingSpots(ctx, r) {
    for (const h of r.hidingSpots) {
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.fillStyle = "#101010";
      ctx.strokeStyle = "rgba(255,255,255,0.13)";
      ctx.lineWidth = 2;
      ctx.fillRect(-18, -26, 36, 52);
      ctx.strokeRect(-18, -26, 36, 52);
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      ctx.fillRect(-3, -18, 2, 36);
      ctx.fillRect(6, -2, 3, 3);
      ctx.restore();
    }
  }

  function drawExit(ctx, r) {
    if (!r.exit.active) return;

    ctx.save();
    ctx.translate(r.exit.x, r.exit.y);
    ctx.shadowColor = "rgba(210, 255, 210, 0.8)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "#c9ffd3";
    ctx.fillRect(-32, -42, 64, 84);
    ctx.fillStyle = "#0c1a0f";
    ctx.font = "bold 13px Arial";
    ctx.textAlign = "center";
    ctx.fillText("EXIT", 0, -8);
    ctx.restore();
  }

  function drawNoise(ctx, r) {
    for (const pulse of r.noisePulses) {
      ctx.strokeStyle = `rgba(255,255,255,${pulse.alpha * 0.18})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pulse.x, pulse.y, pulse.r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawPlayer(ctx, r) {
    const p = r.player;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);

    if (p.hidden) {
      ctx.globalAlpha = 0.45;
    }

    ctx.fillStyle = p.invuln > 0 ? "#f0e4e4" : "#d7d7d7";
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(5, -5, 17, 10);

    ctx.restore();
  }

  function drawMonster(ctx, r) {
    const m = r.monster;
    const p = r.player;

    const d = dist(m, p);
    const visible =
      r.finalPhase ||
      d < 210 ||
      r.player.fear > 60 ||
      Math.random() < 0.97;

    if (!visible) return;

    ctx.save();
    ctx.translate(m.x, m.y);

    const flicker = Math.random() < 0.12 ? rand(0.3, 1) : 1;
    ctx.globalAlpha = clamp((260 - d) / 220, 0.16, 0.95) * flicker;

    ctx.shadowColor = "rgba(0,0,0,1)";
    ctx.shadowBlur = 25;

    ctx.fillStyle = "#050505";
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 32, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#0b0b0b";
    ctx.beginPath();
    ctx.arc(0, -30, 17, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.beginPath();
    ctx.arc(-6, -33, 2.6, 0, Math.PI * 2);
    ctx.arc(6, -33, 2.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-13, -8);
    ctx.lineTo(-30, 24);
    ctx.moveTo(13, -8);
    ctx.lineTo(30, 24);
    ctx.stroke();

    ctx.restore();
  }

  function drawLighting(ctx, r, cam) {
    const p = r.player;

    ctx.save();

    ctx.fillStyle = "rgba(0,0,0,0.94)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    ctx.globalCompositeOperation = "destination-out";

    const px = p.x - cam.x;
    const py = p.y - cam.y;

    const baseRadius = p.flashlightOff ? 55 : 105 + p.battery * 0.85;
    const fearPenalty = p.fear * 0.45;
    const radius = clamp(baseRadius - fearPenalty, 38, 190);

    const gradient = ctx.createRadialGradient(px, py, 15, px, py, radius);
    gradient.addColorStop(0, "rgba(255,255,255,0.9)");
    gradient.addColorStop(0.55, "rgba(255,255,255,0.35)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();

    if (!p.flashlightOff && p.battery > 0) {
      const flicker = Math.random() < p.fear / 700 ? rand(0.55, 0.9) : 1;
      const angle = p.angle;
      const coneLen = clamp(330 + p.battery * 1.2 - p.fear * 1.2, 130, 430) * flicker;
      const coneWidth = 0.52;

      const grad = ctx.createRadialGradient(px, py, 10, px, py, coneLen);
      grad.addColorStop(0, "rgba(255,255,255,0.55)");
      grad.addColorStop(0.45, "rgba(255,255,255,0.24)");
      grad.addColorStop(1, "rgba(255,255,255,0)");

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.arc(px, py, coneLen, angle - coneWidth, angle + coneWidth);
      ctx.closePath();
      ctx.fill();
    }

    ctx.globalCompositeOperation = "source-over";

    const vignette = ctx.createRadialGradient(
      CANVAS_W / 2,
      CANVAS_H / 2,
      120,
      CANVAS_W / 2,
      CANVAS_H / 2,
      600
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(0.7, "rgba(0,0,0,0.25)");
    vignette.addColorStop(1, "rgba(0,0,0,0.82)");

    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    ctx.restore();
  }

  function drawHUD(ctx, r) {
    const p = r.player;

    ctx.save();

    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(18, 18, 280, 128);

    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.strokeRect(18, 18, 280, 128);

    ctx.fillStyle = "#f3f3f3";
    ctx.font = "bold 18px Arial";
    ctx.fillText("SOMETHING HEARD YOU", 34, 45);

    drawBar(ctx, 34, 62, 220, 12, p.battery, "#e5e0b8", "Battery");
    drawBar(ctx, 34, 88, 220, 12, 100 - p.fear, "#b8d5e5", "Calm");
    drawBar(ctx, 34, 114, 220, 12, p.stamina, "#d3d3d3", "Stamina");

    ctx.fillStyle = "#f3f3f3";
    ctx.font = "14px Arial";
    ctx.fillText(`Health: ${"♥".repeat(Math.max(0, p.hp))}`, 34, 139);

    ctx.textAlign = "right";
    ctx.fillText(`Fragments: ${r.collected}/${ITEM_COUNT}`, CANVAS_W - 34, 38);

    if (r.finalPhase) {
      ctx.fillStyle = "rgba(160,0,0,0.35)";
      ctx.fillRect(CANVAS_W / 2 - 150, 20, 300, 36);
      ctx.strokeStyle = "rgba(255,80,80,0.45)";
      ctx.strokeRect(CANVAS_W / 2 - 150, 20, 300, 36);
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffd6d6";
      ctx.font = "bold 17px Arial";
      ctx.fillText("RUN TO THE EXIT", CANVAS_W / 2, 44);
    }

    if (r.message) {
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(CANVAS_W / 2 - 280, CANVAS_H - 72, 560, 42);
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.strokeRect(CANVAS_W / 2 - 280, CANVAS_H - 72, 560, 42);

      ctx.fillStyle = "#eeeeee";
      ctx.font = "15px Arial";
      ctx.fillText(r.message, CANVAS_W / 2, CANVAS_H - 45);
    }

    if (p.hidden) {
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(200,220,255,0.85)";
      ctx.font = "bold 15px Arial";
      ctx.fillText("HIDING — HOLD STILL", CANVAS_W / 2, 80);
    }

    ctx.restore();
  }

  function drawBar(ctx, x, y, w, h, value, color, label) {
    ctx.fillStyle = "rgba(255,255,255,0.09)";
    ctx.fillRect(x, y, w, h);

    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * clamp(value / 100, 0, 1), h);

    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "11px Arial";
    ctx.fillText(label, x + w + 12, y + 10);
  }

  function drawOverlays(ctx, r) {
    const fear = r.player.fear / 100;

    if (fear > 0.35) {
      ctx.save();
      ctx.globalAlpha = (fear - 0.35) * 0.35;
      for (let i = 0; i < 22; i++) {
        ctx.fillStyle = "rgba(255,255,255,0.14)";
        ctx.fillRect(rand(0, CANVAS_W), rand(0, CANVAS_H), rand(1, 3), rand(1, 3));
      }
      ctx.restore();
    }

    if (r.glitch > 0) {
      ctx.save();
      ctx.globalAlpha = r.glitch * 0.2;
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? "rgba(255,0,0,0.5)" : "rgba(255,255,255,0.3)";
        ctx.fillRect(0, rand(0, CANVAS_H), CANVAS_W, rand(2, 8));
      }
      ctx.restore();
    }

    if (r.scare) {
      const alpha = clamp(r.scare.timer / 850, 0, 1);

      ctx.save();
      ctx.fillStyle = `rgba(0,0,0,${0.35 + alpha * 0.3})`;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      ctx.translate(CANVAS_W / 2, CANVAS_H / 2);
      ctx.scale(1 + (1 - alpha) * 0.7, 1 + (1 - alpha) * 0.7);

      ctx.fillStyle = `rgba(15,15,15,${0.92})`;
      ctx.beginPath();
      ctx.ellipse(0, -20, 100, 145, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(255,255,255,${0.8})`;
      ctx.beginPath();
      ctx.arc(-36, -48, 12, 0, Math.PI * 2);
      ctx.arc(36, -48, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(0,0,0,0.9)";
      ctx.beginPath();
      ctx.arc(-36, -48, 5, 0, Math.PI * 2);
      ctx.arc(36, -48, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `rgba(255,255,255,${0.5})`;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-42, 38);
      ctx.quadraticCurveTo(0, 70, 42, 38);
      ctx.stroke();

      ctx.setTransform(1, 0, 0, 1, 0, 0);

      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.font = "bold 44px Arial";
      ctx.textAlign = "center";
      ctx.fillText(r.scare.text, CANVAS_W / 2, CANVAS_H - 95);

      ctx.restore();
    }

    if (r.dead || r.won || !started) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.82)";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      ctx.textAlign = "center";
      ctx.fillStyle = "#f4f4f4";
      ctx.font = "bold 46px Arial";

      if (!started) {
        ctx.fillText("SOMETHING HEARD YOU", CANVAS_W / 2, CANVAS_H / 2 - 74);
        ctx.font = "18px Arial";
        ctx.fillStyle = "rgba(255,255,255,0.78)";
        ctx.fillText("A top-down horror roguelike. Move quietly. Stay in the light.", CANVAS_W / 2, CANVAS_H / 2 - 28);
        ctx.fillText("WASD move • Mouse aim • Shift sprint • E interact • F flashlight • Space hide", CANVAS_W / 2, CANVAS_H / 2 + 5);
        ctx.fillText("Collect all fragments, then escape.", CANVAS_W / 2, CANVAS_H / 2 + 38);
      } else if (r.dead) {
        ctx.fillText("YOU WERE HEARD", CANVAS_W / 2, CANVAS_H / 2 - 45);
        ctx.font = "18px Arial";
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.fillText("No one heard you scream.", CANVAS_W / 2, CANVAS_H / 2 - 5);
      } else if (r.won) {
        ctx.fillText("YOU ESCAPED", CANVAS_W / 2, CANVAS_H / 2 - 45);
        ctx.font = "18px Arial";
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.fillText("But the signal is still active.", CANVAS_W / 2, CANVAS_H / 2 - 5);
      }

      ctx.restore();
    }
  }

  useEffect(() => {
    const tick = (now) => {
      const dt = now - lastRef.current;
      lastRef.current = now;

      updateGame(dt);

      const ctx = canvasRef.current?.getContext("2d");
      const r = runRef.current;

      if (ctx && r) drawGame(ctx, r);

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
              A dark horror roguelike with randomized rooms, a stalking monster,
              jump scares, flashlight survival, fear, and a final escape phase.
            </p>
          </div>

          <div className="shy-actions">
            <button onClick={started ? restart : () => setStarted(true)}>
              {started ? "Restart Run" : "Start Run"}
            </button>
            <button
              className="shy-secondary"
              onClick={() => setMuted((m) => !m)}
            >
              {muted ? "Muted" : "Atmosphere On"}
            </button>
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
            <h3>How to win</h3>
            <p>
              Collect all six fragments. After the last one, the exit appears
              and the monster becomes aggressive.
            </p>
          </div>
          <div>
            <h3>How horror works</h3>
            <p>
              Running creates noise. Darkness raises fear. High fear causes
              glitches, fake warnings, jump scares, and worse visibility.
            </p>
          </div>
          <div>
            <h3>Tip</h3>
            <p>
              Use hiding spots, but do not rely on them. Sometimes it passes by.
              Sometimes it checks.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}