import React, { useEffect, useMemo, useRef, useState } from "react";
import "../../styles/SomethingHeardYou.css";

// ─── constants ───────────────────────────────────────────────────────────────
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

// ─── utils ───────────────────────────────────────────────────────────────────
const clamp = (v, mn, mx) => Math.max(mn, Math.min(mx, v));
const dist  = (a, b)      => Math.hypot(a.x - b.x, a.y - b.y);
const rand  = (mn, mx)    => Math.random() * (mx - mn) + mn;
const choice = (arr)      => arr[Math.floor(Math.random() * arr.length)];

function pointInRect(p, r, pad = 0) {
  return p.x >= r.x - pad && p.x <= r.x + r.w + pad &&
         p.y >= r.y - pad && p.y <= r.y + r.h + pad;
}

function rectDistanceToPoint(rect, p) {
  const cx = clamp(p.x, rect.x, rect.x + rect.w);
  const cy = clamp(p.y, rect.y, rect.y + rect.h);
  return Math.hypot(p.x - cx, p.y - cy);
}

function circleRectCollision(circle, rect, radius) {
  const cx = clamp(circle.x, rect.x, rect.x + rect.w);
  const cy = clamp(circle.y, rect.y, rect.y + rect.h);
  return (circle.x - cx) ** 2 + (circle.y - cy) ** 2 < radius * radius;
}

function randomPointInRect(rect, pad = 42) {
  return {
    x: rand(rect.x + pad, rect.x + rect.w - pad),
    y: rand(rect.y + pad, rect.y + rect.h - pad),
  };
}

function getZoneAt(map, p, pad = 0) {
  return map.rooms.find(z => pointInRect(p, z, pad)) ||
         map.corridors.find(z => pointInRect(p, z, pad)) || null;
}

function zonesTouch(a, b) {
  if (!a || !b) return false;
  return !(a.x > b.x + b.w + 4 || a.x + a.w + 4 < b.x ||
           a.y > b.y + b.h + 4 || a.y + a.h + 4 < b.y);
}

function sameVisibilityZone(map, a, b) {
  const az = getZoneAt(map, a, 2);
  const bz = getZoneAt(map, b, 2);
  if (!az || !bz) return false;
  return az.id === bz.id;
}

// ─── seeded room decorations ──────────────────────────────────────────────────
function seedRoomDetails(room) {
  const details = [];
  const n = Math.floor(rand(5, 14));
  for (let i = 0; i < n; i++) {
    details.push({
      type: choice(["crack","stain","pipe","debris","claw","symbol","body","wire","vent","rust"]),
      x: rand(room.x + 16, room.x + room.w - 16),
      y: rand(room.y + 16, room.y + room.h - 16),
      rot: rand(0, Math.PI * 2),
      scale: rand(0.65, 1.5),
      r: Math.random(),
      g: Math.random(),
    });
  }
  const lights = [];
  const lc = Math.floor(rand(1, 5));
  for (let i = 0; i < lc; i++) {
    lights.push({
      x: rand(room.x + 40, room.x + room.w - 40),
      y: room.y + rand(20, 35),
      on: Math.random() > 0.32,
      flicker: rand(2, 9),
      phase: rand(0, Math.PI * 2),
      warmth: rand(0.5, 1),
    });
  }
  return { ...room, details, lights };
}

// ─── map generation (grid-based) ─────────────────────────────────────────────
function makeMazeMap() {
  const rooms = [];
  const corridors = [];
  const cols = 5, rows = 4, cellW = 440, cellH = 360, startX = 230, startY = 185;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const skip = Math.random() < 0.12 &&
        !(row === 0 && col === 0) && !(row === rows - 1 && col === cols - 1);
      if (skip) continue;
      const w = rand(230, 330), h = rand(170, 260);
      const x = startX + col * cellW + rand(-35, 35);
      const y = startY + row * cellH + rand(-30, 30);
      const base = {
        id: `room-${row}-${col}`, grid: { row, col }, x, y, w, h,
        type: row === 0 && col === 0 ? "spawn" : "room", decay: Math.random(),
      };
      rooms.push(seedRoomDetails(base));
    }
  }

  const byGrid = new Map();
  rooms.forEach(r => byGrid.set(`${r.grid.row}-${r.grid.col}`, r));

  function connectRooms(a, b) {
    if (!a || !b) return;
    const ax = a.x + a.w / 2, ay = a.y + a.h / 2;
    const bx = b.x + b.w / 2, by = b.y + b.h / 2;
    const hFirst = Math.random() > 0.35;
    if (hFirst) {
      corridors.push({ id:`c-${a.id}-${b.id}-h`, x:Math.min(ax,bx)-22, y:ay-24, w:Math.abs(ax-bx)+44, h:48, type:"hallway", decay:Math.random() });
      corridors.push({ id:`c-${a.id}-${b.id}-v`, x:bx-24, y:Math.min(ay,by)-22, w:48, h:Math.abs(ay-by)+44, type:"hallway", decay:Math.random() });
    } else {
      corridors.push({ id:`c-${a.id}-${b.id}-v`, x:ax-24, y:Math.min(ay,by)-22, w:48, h:Math.abs(ay-by)+44, type:"hallway", decay:Math.random() });
      corridors.push({ id:`c-${a.id}-${b.id}-h`, x:Math.min(ax,bx)-22, y:by-24, w:Math.abs(ax-bx)+44, h:48, type:"hallway", decay:Math.random() });
    }
  }

  for (let row = 0; row < rows; row++) {
    const rr = rooms.filter(r => r.grid.row === row).sort((a,b) => a.grid.col - b.grid.col);
    for (let i = 1; i < rr.length; i++) connectRooms(rr[i-1], rr[i]);
  }
  for (let col = 0; col < cols; col++) {
    const cr = rooms.filter(r => r.grid.col === col).sort((a,b) => a.grid.row - b.grid.row);
    for (let i = 1; i < cr.length; i++) {
      if (Math.random() > 0.22 || i === 1) connectRooms(cr[i-1], cr[i]);
    }
  }
  for (let i = 0; i < 5; i++) {
    const a = choice(rooms), b = choice(rooms);
    if (!a || !b || a.id === b.id) continue;
    const gd = Math.abs(a.grid.row - b.grid.row) + Math.abs(a.grid.col - b.grid.col);
    if (gd <= 2 && Math.random() > 0.45) connectRooms(a, b);
  }

  const walkable = [...rooms, ...corridors];
  const spawnRoom = byGrid.get("0-0") || rooms[0];
  const exitRoom = [...rooms].filter(r => r.id !== spawnRoom.id).sort((a,b) => {
    const ac = { x:a.x+a.w/2, y:a.y+a.h/2 }, bc = { x:b.x+b.w/2, y:b.y+b.h/2 };
    const sc = { x:spawnRoom.x+spawnRoom.w/2, y:spawnRoom.y+spawnRoom.h/2 };
    return dist(bc,sc) - dist(ac,sc);
  })[0];

  return { rooms, corridors, walkable, spawnRoom, exitRoom };
}

// ─── run factory ──────────────────────────────────────────────────────────────
function createRun() {
  const map = makeMazeMap();
  const spawn = map.spawnRoom;

  const player = {
    x: spawn.x + spawn.w / 2, y: spawn.y + spawn.h / 2,
    angle: 0, hp: 3, fear: 18, battery: 100, stamina: 100,
    hidden: false, invuln: 0, flashlightOff: false, bobPhase: 0,
  };

  const farRooms = [...map.rooms]
    .filter(r => r.id !== map.spawnRoom.id)
    .sort((a,b) => {
      const ac={x:a.x+a.w/2,y:a.y+a.h/2}, bc={x:b.x+b.w/2,y:b.y+b.h/2};
      return dist(bc,player) - dist(ac,player);
    });

  const itemRooms = [...farRooms].sort(()=>Math.random()-0.5).slice(0,ITEM_COUNT);
  const items = itemRooms.map((room,i) => ({
    id:`frag-${i}`, ...randomPointInRect(room), collected:false,
    pulse:Math.random()*Math.PI*2, label:choice(["TAPE","IDOL","BONE","MASK","RELIC","EYE"]),
  }));

  const restRooms = [...map.rooms].filter(r => !itemRooms.some(ir=>ir.id===r.id));
  const batteries = restRooms.sort(()=>Math.random()-0.5).slice(0,7)
    .map((room,i) => ({ id:`bat-${i}`, ...randomPointInRect(room), collected:false }));
  const medkits = restRooms.sort(()=>Math.random()-0.5).slice(7,10)
    .map((room,i) => ({ id:`med-${i}`, ...randomPointInRect(room), collected:false }));
  const hidingSpots = restRooms.sort(()=>Math.random()-0.5).slice(10,19)
    .map((room,i) => ({ id:`hide-${i}`, ...randomPointInRect(room), r:24 }));

  const monsterRoom = farRooms[0] || map.exitRoom;

  return {
    map, player,
    monster: {
      x: monsterRoom.x+monsterRoom.w/2, y: monsterRoom.y+monsterRoom.h/2,
      mode:"stalk", target:null, speed:2.65, anger:0, stun:0, limbPhase:0, dirAngle:0,
    },
    items, batteries, medkits, hidingSpots,
    exit: { x:map.exitRoom.x+map.exitRoom.w/2, y:map.exitRoom.y+map.exitRoom.h/2, active:false, pulse:0 },
    noisePulses:[], hallucinations:[], bloodSplatters:[],
    collected:0, finalPhase:false, won:false, dead:false,
    scare:null, message:"Find 6 fragments. Follow the static compass.",
    hauntTimer:rand(4800,8500), time:0, glitch:0, objectiveBlink:0,
  };
}

// ─── component ────────────────────────────────────────────────────────────────
export default function SomethingHeardYou({ onExit }) {
  const canvasRef = useRef(null);
  const keysRef   = useRef({});
  const mouseRef  = useRef({ x:CANVAS_W/2, y:CANVAS_H/2 });
  const runRef    = useRef(null);
  const rafRef    = useRef(null);
  const lastRef   = useRef(performance.now());

  const [started, setStarted] = useState(false);
  const [run, setRun] = useState(() => createRun());

  const horrorLines = useMemo(() => [
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
    "The air smells of copper.",
    "You counted six steps. There were seven.",
    "Don't look at the ceiling.",
  ], []);

  useEffect(() => { runRef.current = run; }, [run]);

  function restart() {
    const fresh = createRun();
    runRef.current = fresh;
    setRun(fresh);
    setStarted(true);
    lastRef.current = performance.now();
  }

  function isWalkable(r, x, y, radius = PLAYER_RADIUS) {
    return r.map.walkable.some(zone => circleRectCollision({x,y}, zone, radius));
  }

  function createNoise(r, x, y, power) {
    r.noisePulses.push({ x, y, r:4, max:power, alpha:0.82 });
    const d = Math.hypot(r.monster.x-x, r.monster.y-y);
    if (d < power + 130) {
      r.monster.target = { x, y };
      r.monster.mode = "investigate";
      r.monster.anger = clamp(r.monster.anger+16, 0, 100);
      r.message = "It heard that.";
    }
  }

  function triggerScare(r, text = "RUN") {
    r.scare = { text, timer:1050, seed:Math.random() };
    r.player.fear = clamp(r.player.fear+24, 0, 100);
    r.glitch = 1;
  }

  function interact() {
    const r = runRef.current;
    if (!r || r.dead || r.won) return;
    const p = r.player;

    for (const item of r.items) {
      if (!item.collected && dist(p,item) < 42) {
        item.collected = true; r.collected++; r.glitch = 0.75;
        p.fear = clamp(p.fear+8, 0, 100);
        createNoise(r, p.x, p.y, 230);
        if (r.collected >= ITEM_COUNT) {
          r.finalPhase=true; r.exit.active=true;
          r.monster.mode="investigate"; r.monster.target={x:p.x,y:p.y};
          r.monster.speed=3.25;
          r.message="All fragments collected. The exit is awake. Run.";
          triggerScare(r,"IT KNOWS");
        } else {
          r.message=`${ITEM_COUNT-r.collected} fragments remain.`;
          if(Math.random()<0.32) triggerScare(r,choice(["BEHIND YOU","NO SIGNAL","IT HEARD YOU"]));
        }
        return;
      }
    }
    for (const bat of r.batteries) {
      if (!bat.collected && dist(p,bat)<38) {
        bat.collected=true; p.battery=clamp(p.battery+35,0,100);
        r.message="Battery found."; createNoise(r,p.x,p.y,100); return;
      }
    }
    for (const med of r.medkits) {
      if (!med.collected && dist(p,med)<38) {
        med.collected=true; p.hp=clamp(p.hp+1,0,3); p.fear=clamp(p.fear-15,0,100);
        r.message="Your breathing steadies."; createNoise(r,p.x,p.y,100); return;
      }
    }
    if (r.exit.active && dist(p,r.exit)<58) {
      r.won=true; r.message="You escaped. The dark did not.";
    }
  }

  function getObjective(r) {
    if (r.exit.active) return r.exit;
    const rem = r.items.filter(i=>!i.collected);
    if (!rem.length) return r.exit;
    return rem.sort((a,b)=>dist(a,r.player)-dist(b,r.player))[0];
  }

  function updateMonster(r, dt) {
    const p = r.player, m = r.monster;
    if (m.stun > 0) { m.stun -= dt; return; }
    m.limbPhase += dt * 0.007;

    const sameZone = sameVisibilityZone(r.map, p, m);
    const d = dist(p, m);

    if (!p.hidden && sameZone && d < (r.finalPhase ? 560 : 440)) {
      m.mode="chase"; m.target={x:p.x,y:p.y};
      m.anger=clamp(m.anger+0.12*dt,0,100);
    } else if (m.mode==="chase") {
      m.mode="investigate"; m.target={x:p.x,y:p.y};
    }

    if (m.mode==="stalk") {
      if (!m.target || dist(m,m.target)<38 || Math.random()<0.006) {
        const pz = getZoneAt(r.map,p,5);
        const possible = r.map.rooms
          .filter(room=>room.id!==pz?.id)
          .map(room=>({room,d:dist({x:room.x+room.w/2,y:room.y+room.h/2},p)}))
          .filter(e=>e.d>260&&e.d<980).sort(()=>Math.random()-0.5);
        m.target=randomPointInRect((possible[0]?.room||choice(r.map.rooms)),55);
      }
      moveMonsterToward(r,m.target,m.speed*0.58,dt);
    }
    if (m.mode==="investigate") {
      if (m.target) moveMonsterToward(r,m.target,m.speed*0.86,dt);
      if (!m.target||dist(m,m.target)<42) { m.mode="stalk"; m.target=null; }
    }
    if (m.mode==="chase") {
      m.target={x:p.x,y:p.y};
      moveMonsterToward(r,m.target,m.speed*(r.finalPhase?1.24:1.08),dt);
      if(Math.random()<0.025) r.message=choice(["RUN.","IT SEES YOU.","DO NOT LOOK BACK."]);
    }
    if (m.target) m.dirAngle=Math.atan2(m.target.y-m.y,m.target.x-m.x);
    m.anger=clamp(m.anger-dt*0.003,0,100);
  }

  function moveMonsterToward(r, target, speed, dt) {
    if (!target) return;
    const m = r.monster;
    const angle = Math.atan2(target.y-m.y,target.x-m.x);
    const step = speed*(dt/16.67);
    const nx=m.x+Math.cos(angle)*step, ny=m.y+Math.sin(angle)*step;
    if (isWalkable(r,nx,m.y,MONSTER_RADIUS)) m.x=nx;
    else m.x+=Math.cos(angle+rand(-1.7,1.7))*step*0.42;
    if (isWalkable(r,m.x,ny,MONSTER_RADIUS)) m.y=ny;
    else m.y+=Math.sin(angle+rand(-1.7,1.7))*step*0.42;
  }

  function haunt(r) {
    const p = r.player, roll = Math.random();
    r.message = choice(horrorLines);
    r.glitch = Math.max(r.glitch, rand(0.18,0.5));
    if (roll<0.18) {
      const angle=rand(0,Math.PI*2);
      r.hallucinations.push({
        x:p.x+Math.cos(angle)*rand(140,230), y:p.y+Math.sin(angle)*rand(140,230),
        timer:rand(550,950), type:"eyes",
      });
    } else if (roll<0.35) {
      const behind={x:p.x-Math.cos(p.angle)*rand(140,240),y:p.y-Math.sin(p.angle)*rand(140,240)};
      createNoise(r,behind.x,behind.y,150); r.message="Footsteps behind you.";
    } else if (roll<0.52) {
      p.fear=clamp(p.fear+rand(5,11),0,100);
    } else if (roll<0.68) {
      r.monster.mode="investigate";
      r.monster.target={x:p.x+rand(-220,220),y:p.y+rand(-220,220)};
    } else if (roll<0.84&&p.fear>42) {
      triggerScare(r,choice(["LOOK","MOVE","FOUND YOU","DON'T BREATHE"]));
    } else {
      r.message="Silence. Too much silence.";
    }
  }

  function updateGame(dtMs) {
    const r = runRef.current;
    if (!r||!started||r.dead||r.won) return;
    const dt = Math.min(dtMs,34);
    r.time+=dt; r.objectiveBlink+=dt;
    r.glitch=Math.max(0,r.glitch-dt/1200);
    if (r.exit.active) r.exit.pulse=(r.exit.pulse||0)+dt*0.004;

    const p=r.player, keys=keysRef.current, cam=getCamera(r);
    if (p.invuln>0) p.invuln-=dt;

    p.angle=Math.atan2(mouseRef.current.y+cam.y-p.y, mouseRef.current.x+cam.x-p.x);

    let dx=0, dy=0;
    if (!p.hidden) {
      if(keys.w||keys.arrowup)    dy-=1;
      if(keys.s||keys.arrowdown)  dy+=1;
      if(keys.a||keys.arrowleft)  dx-=1;
      if(keys.d||keys.arrowright) dx+=1;
    }
    const moving=dx!==0||dy!==0;
    const len=Math.hypot(dx,dy)||1; dx/=len; dy/=len;
    const sprinting=moving&&keys.shift&&p.stamina>8&&!p.hidden;
    const speed=sprinting?3.45:2.05;

    if(sprinting) { p.stamina=clamp(p.stamina-dt*0.07,0,100); if(Math.random()<0.052) createNoise(r,p.x,p.y,170); }
    else          { p.stamina=clamp(p.stamina+dt*0.026,0,100); }
    if(moving) {
      p.bobPhase+=dt*(sprinting?0.018:0.01);
      if(Math.random()<(sprinting?0.055:0.012)) createNoise(r,p.x,p.y,sprinting?150:65);
    }

    const nx=p.x+dx*speed*(dt/16.67), ny=p.y+dy*speed*(dt/16.67);
    if(isWalkable(r,nx,p.y,PLAYER_RADIUS)) p.x=nx;
    if(isWalkable(r,p.x,ny,PLAYER_RADIUS)) p.y=ny;

    if(!p.flashlightOff&&p.battery>0)
      p.battery=clamp(p.battery-BATTERY_DRAIN*dt*(r.finalPhase?1.28:1),0,100);
    if(p.battery<=0) p.flashlightOff=true;

    updateMonster(r,dt);

    const sameZone=sameVisibilityZone(r.map,p,r.monster);
    const md=dist(p,r.monster);
    if(!p.hidden&&sameZone&&md<460)
      p.fear=clamp(p.fear+FEAR_MONSTER_GAIN*dt*(1-md/500),0,100);
    else if(p.flashlightOff||p.battery<=0)
      p.fear=clamp(p.fear+FEAR_DARK_GAIN*dt,0,100);
    else
      p.fear=clamp(p.fear-FEAR_DECAY*dt,0,100);

    if(md<PLAYER_RADIUS+MONSTER_RADIUS+8&&p.invuln<=0) {
      if(p.hidden&&Math.random()>0.5) {
        r.message="It walked past you."; r.monster.mode="stalk"; r.monster.target=null;
        p.fear=clamp(p.fear+18,0,100);
      } else {
        p.hp-=1; p.invuln=1800; p.hidden=false; p.fear=clamp(p.fear+36,0,100);
        triggerScare(r,"CAUGHT");
        r.bloodSplatters.push({x:p.x+rand(-25,25),y:p.y+rand(-25,25),r:rand(6,20),alpha:0.85});
        const safeRooms=r.map.rooms.filter(room=>dist({x:room.x+room.w/2,y:room.y+room.h/2},p)>360).sort(()=>Math.random()-0.5);
        const room=safeRooms[0]||choice(r.map.rooms);
        const pos=randomPointInRect(room,60);
        r.monster.x=pos.x; r.monster.y=pos.y; r.monster.mode="stalk"; r.monster.target=null;
        if(p.hp<=0) { r.dead=true; r.message="The dark learned your name."; }
      }
    }

    for(const pulse of r.noisePulses) { pulse.r+=dt*0.34; pulse.alpha-=dt*0.0011; }
    r.noisePulses=r.noisePulses.filter(p=>p.alpha>0&&p.r<p.max);
    for(const h of r.hallucinations) h.timer-=dt;
    r.hallucinations=r.hallucinations.filter(h=>h.timer>0);

    r.hauntTimer-=dt;
    if(r.hauntTimer<=0) { haunt(r); r.hauntTimer=rand(r.finalPhase?2300:5200,r.finalPhase?6000:12000); }
    if(r.scare) { r.scare.timer-=dt; if(r.scare.timer<=0) r.scare=null; }

    setRun({...r});
  }

  function getCamera(r) {
    const fearShake=r.player.fear>68?(r.player.fear-68)*0.08:0;
    const shake=r.glitch*9+fearShake;
    return {
      x:clamp(r.player.x-CANVAS_W/2+rand(-shake,shake),0,WORLD_W-CANVAS_W),
      y:clamp(r.player.y-CANVAS_H/2+rand(-shake,shake),0,WORLD_H-CANVAS_H),
    };
  }

  // ── draw orchestrator ──────────────────────────────────────────────────────
  function drawGame(ctx, r) {
    ctx.clearRect(0,0,CANVAS_W,CANVAS_H);
    const cam=getCamera(r);
    ctx.save(); ctx.translate(-cam.x,-cam.y);
    drawWorld(ctx,r);
    drawBloodSplatters(ctx,r);
    drawItems(ctx,r);
    drawHidingSpots(ctx,r);
    drawExit(ctx,r);
    drawNoise(ctx,r);
    drawHallucinations(ctx,r);
    drawMonster(ctx,r);
    drawPlayer(ctx,r);
    ctx.restore();
    drawLighting(ctx,r,cam);
    drawHUD(ctx,r);
    drawOverlays(ctx,r);
  }

  // ── world ──────────────────────────────────────────────────────────────────
  function drawWorld(ctx, r) {
    ctx.fillStyle="#020103"; ctx.fillRect(0,0,WORLD_W,WORLD_H);

    for (const zone of r.map.walkable) {
      const isHall=zone.type==="hallway";
      ctx.fillStyle=isHall?"#0d0c12":"#131220";
      ctx.fillRect(zone.x,zone.y,zone.w,zone.h);

      if (!isHall) {
        // tile grid
        ctx.strokeStyle="rgba(255,255,255,0.02)"; ctx.lineWidth=0.5;
        const tile=44;
        for(let tx=zone.x;tx<zone.x+zone.w;tx+=tile){ ctx.beginPath();ctx.moveTo(tx,zone.y);ctx.lineTo(tx,zone.y+zone.h);ctx.stroke(); }
        for(let ty=zone.y;ty<zone.y+zone.h;ty+=tile){ ctx.beginPath();ctx.moveTo(zone.x,ty);ctx.lineTo(zone.x+zone.w,ty);ctx.stroke(); }
        // walls
        ctx.strokeStyle="rgba(200,180,180,0.06)"; ctx.lineWidth=2;
        ctx.strokeRect(zone.x+1.5,zone.y+1.5,zone.w-3,zone.h-3);
        ctx.strokeStyle="rgba(0,0,0,0.95)"; ctx.lineWidth=7;
        ctx.strokeRect(zone.x,zone.y,zone.w,zone.h);
        // env details
        if (zone.details) {
          for(const d of zone.details){
            ctx.save();ctx.translate(d.x,d.y);ctx.rotate(d.rot);ctx.globalAlpha=0.4;
            drawEnvDetail(ctx,d); ctx.restore();
          }
        }
        // ceiling lights
        if (zone.lights) {
          for(const light of zone.lights){
            const t=r.time*0.001+light.phase;
            const flickOn=light.on&&Math.sin(t*light.flicker)>-0.25+Math.random()*0.05;
            if(flickOn){
              ctx.save();
              ctx.shadowColor=`rgba(${Math.floor(220*light.warmth)},${Math.floor(190*light.warmth)},140,0.9)`;
              ctx.shadowBlur=22;
              ctx.fillStyle=`rgba(${Math.floor(230*light.warmth)},${Math.floor(200*light.warmth)},155,0.85)`;
              ctx.fillRect(light.x-11,light.y-3,22,6);
              const lg=ctx.createRadialGradient(light.x,light.y+3,2,light.x,light.y+3,80);
              lg.addColorStop(0,"rgba(200,170,110,0.1)");lg.addColorStop(1,"rgba(200,170,110,0)");
              ctx.fillStyle=lg;ctx.beginPath();ctx.ellipse(light.x,light.y+48,52,44,0,0,Math.PI*2);ctx.fill();
              ctx.restore();
            } else if(light.on){
              ctx.fillStyle="rgba(60,50,50,0.55)";ctx.fillRect(light.x-11,light.y-3,22,6);
            }
          }
        }
      } else {
        // hallway pipes
        ctx.strokeStyle="rgba(90,80,65,0.28)"; ctx.lineWidth=5;
        const horiz=zone.w>zone.h;
        if(horiz){
          ctx.beginPath();ctx.moveTo(zone.x,zone.y+zone.h*0.26);ctx.lineTo(zone.x+zone.w,zone.y+zone.h*0.26);ctx.stroke();
          ctx.beginPath();ctx.moveTo(zone.x,zone.y+zone.h*0.74);ctx.lineTo(zone.x+zone.w,zone.y+zone.h*0.74);ctx.stroke();
        }else{
          ctx.beginPath();ctx.moveTo(zone.x+zone.w*0.26,zone.y);ctx.lineTo(zone.x+zone.w*0.26,zone.y+zone.h);ctx.stroke();
          ctx.beginPath();ctx.moveTo(zone.x+zone.w*0.74,zone.y);ctx.lineTo(zone.x+zone.w*0.74,zone.y+zone.h);ctx.stroke();
        }
        ctx.strokeStyle="rgba(0,0,0,0.9)"; ctx.lineWidth=5;
        ctx.strokeRect(zone.x,zone.y,zone.w,zone.h);
      }
    }
    for(let i=0;i<160;i++){
      const x=(i*173)%WORLD_W, y=(i*97)%WORLD_H;
      ctx.fillStyle="rgba(255,255,255,0.018)"; ctx.fillRect(x,y,1.5,1.5);
    }
  }

  function drawEnvDetail(ctx, d) {
    switch(d.type){
      case "crack":{
        ctx.strokeStyle="rgba(0,0,0,0.75)";ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(0,0);
        let cx2=0,cy2=0;
        for(let i=0;i<Math.floor(3+d.r*5);i++){
          cx2+=(d.g*36-18)*d.scale*0.5; cy2+=(d.r*36-18)*d.scale*0.5;
          ctx.lineTo(cx2,cy2);
        }ctx.stroke();break;
      }
      case "stain":{
        ctx.fillStyle=`rgba(${70+Math.floor(d.r*40)},0,0,0.4)`;
        ctx.beginPath();ctx.ellipse(0,0,8+d.scale*10,5+d.scale*8,d.rot*0.5,0,Math.PI*2);ctx.fill();
        ctx.fillStyle="rgba(60,0,0,0.25)";ctx.fillRect(-2,2,4,d.scale*22);break;
      }
      case "pipe":{
        ctx.strokeStyle="rgba(75,65,55,0.6)";ctx.lineWidth=5*d.scale;ctx.lineCap="round";
        ctx.beginPath();ctx.moveTo(-20*d.scale,0);ctx.lineTo(20*d.scale,0);ctx.stroke();
        ctx.fillStyle="rgba(55,45,35,0.75)";ctx.beginPath();ctx.arc(0,0,5*d.scale,0,Math.PI*2);ctx.fill();break;
      }
      case "debris":{
        for(let i=0;i<5;i++){
          ctx.fillStyle=`rgba(${35+i*8},${28+i*5},${22+i*4},0.65)`;
          ctx.fillRect((d.r*24-12+i*3)*d.scale*0.5,(d.g*24-12+i*2)*d.scale*0.5,(3+d.r*6)*d.scale,(2+d.g*5)*d.scale);
        }break;
      }
      case "claw":{
        ctx.strokeStyle="rgba(110,18,18,0.58)";ctx.lineWidth=1.8;
        for(let i=0;i<4;i++){
          ctx.beginPath();ctx.moveTo(-6+i*4,-15*d.scale);
          ctx.quadraticCurveTo(d.g*20-10,0,-4+i*4,15*d.scale);ctx.stroke();
        }break;
      }
      case "symbol":{
        ctx.strokeStyle="rgba(140,25,25,0.42)";ctx.lineWidth=1.5;
        const sr=13*d.scale;
        ctx.beginPath();ctx.arc(0,0,sr,0,Math.PI*2);ctx.stroke();
        ctx.beginPath();ctx.moveTo(0,-sr);ctx.lineTo(0,sr);ctx.moveTo(-sr,0);ctx.lineTo(sr,0);ctx.stroke();break;
      }
      case "body":{
        ctx.fillStyle="rgba(18,10,10,0.58)";
        ctx.beginPath();ctx.ellipse(0,8*d.scale,9*d.scale,17*d.scale,d.rot*0.3,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(0,-11*d.scale,7*d.scale,0,Math.PI*2);ctx.fill();
        ctx.fillStyle="rgba(70,0,0,0.32)";
        ctx.beginPath();ctx.ellipse(5*d.scale,11*d.scale,6*d.scale,3*d.scale,0,0,Math.PI*2);ctx.fill();break;
      }
      case "wire":{
        ctx.strokeStyle="rgba(55,55,65,0.48)";ctx.lineWidth=1.5;
        ctx.beginPath();ctx.moveTo(-16*d.scale,-7*d.scale);
        ctx.quadraticCurveTo(0,16*d.scale,16*d.scale,-5*d.scale);ctx.stroke();break;
      }
      case "vent":{
        ctx.strokeStyle="rgba(80,75,70,0.45)";ctx.lineWidth=1;
        ctx.strokeRect(-12*d.scale,-8*d.scale,24*d.scale,16*d.scale);
        for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(-10*d.scale,-5*d.scale+i*3*d.scale);ctx.lineTo(10*d.scale,-5*d.scale+i*3*d.scale);ctx.stroke();}break;
      }
      case "rust":{
        ctx.fillStyle="rgba(90,40,10,0.35)";
        for(let i=0;i<3;i++){
          ctx.beginPath();ctx.ellipse((d.r*18-9+i*5)*d.scale,(d.g*14-7)*d.scale,(3+d.r*5)*d.scale,(2+d.g*4)*d.scale,d.rot,0,Math.PI*2);ctx.fill();
        }break;
      }
      default:break;
    }
  }

  function drawBloodSplatters(ctx, r) {
    for(const s of r.bloodSplatters){
      ctx.save();ctx.globalAlpha=s.alpha*0.65;
      ctx.fillStyle="#2e0000";ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();ctx.restore();
    }
  }

  // ── items ──────────────────────────────────────────────────────────────────
  function drawItems(ctx, r) {
    for(const item of r.items){
      if(item.collected) continue;
      item.pulse+=0.038;
      const glow=10+Math.sin(item.pulse)*5;
      ctx.save();ctx.translate(item.x,item.y);ctx.rotate(item.pulse*0.35);
      const g=ctx.createRadialGradient(0,0,1,0,0,14);
      g.addColorStop(0,"#ff7070");g.addColorStop(0.45,"#9e1a1a");g.addColorStop(1,"#2e0000");
      ctx.shadowColor="rgba(210,30,30,0.95)";ctx.shadowBlur=glow*2;ctx.fillStyle=g;
      ctx.beginPath();ctx.moveTo(0,-14);ctx.lineTo(8,-4);ctx.lineTo(12,0);ctx.lineTo(8,4);
      ctx.lineTo(0,14);ctx.lineTo(-8,4);ctx.lineTo(-12,0);ctx.lineTo(-8,-4);ctx.closePath();ctx.fill();
      ctx.shadowBlur=0;ctx.fillStyle="rgba(255,210,210,0.9)";ctx.beginPath();ctx.arc(0,0,3,0,Math.PI*2);ctx.fill();
      ctx.rotate(-item.pulse*0.35);
      ctx.fillStyle="rgba(255,100,100,0.72)";ctx.font="bold 9px 'Courier New'";ctx.textAlign="center";
      ctx.fillText(item.label,0,26);ctx.restore();
    }
    for(const bat of r.batteries){
      if(bat.collected) continue;
      ctx.save();ctx.translate(bat.x,bat.y);
      ctx.shadowColor="rgba(190,200,100,0.5)";ctx.shadowBlur=9;
      ctx.fillStyle="#25221a";ctx.strokeStyle="#908820";ctx.lineWidth=1.5;
      ctx.fillRect(-12,-7,24,14);ctx.strokeRect(-12,-7,24,14);
      ctx.fillStyle="#b8b030";ctx.fillRect(12,-4,5,8);
      ctx.fillStyle="#7a7818";ctx.fillRect(-10,-4,18,8);
      ctx.fillStyle="#c8b830";ctx.fillRect(-10,-4,7,8);
      ctx.fillStyle="rgba(190,190,80,0.6)";ctx.font="bold 7px 'Courier New'";ctx.textAlign="center";
      ctx.fillText("BATT",0,22);ctx.restore();
    }
    for(const med of r.medkits){
      if(med.collected) continue;
      ctx.save();ctx.translate(med.x,med.y);
      ctx.shadowColor="rgba(180,60,60,0.5)";ctx.shadowBlur=9;
      ctx.fillStyle="#180c0c";ctx.strokeStyle="#7a1c1c";ctx.lineWidth=1.5;
      ctx.fillRect(-13,-10,26,20);ctx.strokeRect(-13,-10,26,20);
      ctx.fillStyle="#a02828";ctx.fillRect(-3,-8,6,16);ctx.fillRect(-10,-3,20,6);
      ctx.fillStyle="rgba(255,80,80,0.25)";ctx.fillRect(-10,-8,7,6);ctx.restore();
    }
  }

  function drawHidingSpots(ctx, r) {
    for(const h of r.hidingSpots){
      const near=dist(h,r.player)<52;
      ctx.save();ctx.translate(h.x,h.y);
      ctx.fillStyle="#08070d";
      ctx.strokeStyle=near?"rgba(140,160,255,0.45)":"rgba(255,255,255,0.1)";ctx.lineWidth=1.8;
      ctx.fillRect(-21,-32,42,64);ctx.strokeRect(-21,-32,42,64);
      ctx.strokeStyle=near?"rgba(140,160,255,0.28)":"rgba(255,255,255,0.07)";ctx.lineWidth=0.8;
      ctx.beginPath();ctx.moveTo(0,-30);ctx.lineTo(0,30);ctx.stroke();
      ctx.fillStyle=near?"rgba(160,180,255,0.55)":"rgba(255,255,255,0.18)";
      ctx.beginPath();ctx.arc(9,2,3.5,0,Math.PI*2);ctx.fill();
      if(near){ctx.fillStyle="rgba(160,180,255,0.72)";ctx.font="bold 9px 'Courier New'";ctx.textAlign="center";ctx.fillText("[SPACE]",0,44);}
      ctx.restore();
    }
  }

  function drawExit(ctx, r) {
    if(!r.exit.active) return;
    const pulse=Math.sin(r.exit.pulse||0)*0.3+0.7;
    ctx.save();ctx.translate(r.exit.x,r.exit.y);
    const grd=ctx.createRadialGradient(0,0,8,0,0,88);
    grd.addColorStop(0,`rgba(70,240,110,${0.14*pulse})`);grd.addColorStop(1,"rgba(0,0,0,0)");
    ctx.fillStyle=grd;ctx.beginPath();ctx.arc(0,0,88,0,Math.PI*2);ctx.fill();
    ctx.shadowColor=`rgba(80,255,120,${0.7*pulse})`;ctx.shadowBlur=18*pulse;
    ctx.strokeStyle=`rgba(90,240,130,${0.82*pulse})`;ctx.lineWidth=2.5;
    ctx.strokeRect(-30,-46,60,92);ctx.fillStyle=`rgba(8,26,12,0.88)`;ctx.fillRect(-28,-44,56,88);
    ctx.fillStyle=`rgba(110,255,150,${pulse})`;ctx.font="bold 13px 'Courier New'";ctx.textAlign="center";
    ctx.fillText("EXIT",0,-16);
    ctx.strokeStyle=`rgba(110,255,150,${0.8*pulse})`;ctx.lineWidth=1.8;
    ctx.beginPath();ctx.moveTo(0,2);ctx.lineTo(0,22);ctx.moveTo(-7,15);ctx.lineTo(0,22);ctx.lineTo(7,15);ctx.stroke();
    ctx.restore();
  }

  function drawNoise(ctx, r) {
    for(const pulse of r.noisePulses){
      ctx.save();
      ctx.strokeStyle=`rgba(255,70,70,${pulse.alpha*0.2})`;ctx.lineWidth=1.5;
      ctx.beginPath();ctx.arc(pulse.x,pulse.y,pulse.r,0,Math.PI*2);ctx.stroke();
      ctx.strokeStyle=`rgba(255,180,180,${pulse.alpha*0.08})`;ctx.lineWidth=0.8;
      ctx.beginPath();ctx.arc(pulse.x,pulse.y,pulse.r*0.55,0,Math.PI*2);ctx.stroke();
      ctx.restore();
    }
  }

  function drawHallucinations(ctx, r) {
    for(const h of r.hallucinations){
      ctx.save();ctx.translate(h.x,h.y);ctx.globalAlpha=clamp(h.timer/900,0,0.82);
      ctx.shadowColor="rgba(255,0,0,0.4)";ctx.shadowBlur=12;
      ctx.fillStyle="rgba(2,2,2,0.97)";ctx.beginPath();ctx.ellipse(0,0,30,44,0,0,Math.PI*2);ctx.fill();
      ctx.shadowBlur=0;ctx.fillStyle="rgba(255,255,255,0.85)";
      ctx.beginPath();ctx.ellipse(-10,-9,5,4,-0.2,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.ellipse(10,-9,5,4,0.2,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#000";ctx.beginPath();ctx.arc(-10,-9,2.5,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(10,-9,2.5,0,Math.PI*2);ctx.fill();
      ctx.restore();
    }
  }

  // ── player ─────────────────────────────────────────────────────────────────
  function drawPlayer(ctx, r) {
    const p=r.player;
    ctx.save();ctx.translate(p.x,p.y);
    // shadow
    ctx.fillStyle="rgba(0,0,0,0.45)";ctx.beginPath();ctx.ellipse(2,10,11,4,0,0,Math.PI*2);ctx.fill();
    ctx.rotate(p.angle);
    if(p.hidden) ctx.globalAlpha=0.38;
    const bob=Math.sin(p.bobPhase)*1.8;
    ctx.save();ctx.translate(0,bob);
    const legSwing=Math.sin(p.bobPhase*2)*6;
    ctx.fillStyle=p.invuln>0?"#c07070":"#32284a";
    ctx.fillRect(-5,7,4,11+legSwing);ctx.fillRect(1,7,4,11-legSwing);
    ctx.fillStyle=p.invuln>0?"#d09090":"#423862";
    ctx.beginPath();ctx.roundRect(-8,-8,16,15,2);ctx.fill();
    const armSwing=Math.sin(p.bobPhase*2)*6;
    ctx.fillStyle=p.invuln>0?"#c07070":"#32284a";
    ctx.fillRect(-13,-5+armSwing,4,9);ctx.fillRect(9,-5-armSwing,4,9);
    ctx.fillStyle=p.invuln>0?"#d0a0a0":"#524870";
    ctx.beginPath();ctx.arc(0,-14,8,0,Math.PI*2);ctx.fill();
    if(!p.flashlightOff&&p.battery>0){
      ctx.fillStyle="rgba(210,200,170,0.9)";ctx.fillRect(8,-2,15,5);
      ctx.fillStyle="rgba(255,245,210,0.65)";ctx.beginPath();ctx.arc(23,0,3.5,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();ctx.restore();
  }

  // ── monster ────────────────────────────────────────────────────────────────
  function drawMonster(ctx, r) {
    const m=r.monster, p=r.player;
    const sameZone=sameVisibilityZone(r.map,p,m);
    const d=dist(m,p);
    if(!(r.finalPhase||sameZone||d<115||p.fear>72||m.mode==="chase")) return;

    const opacity=clamp((420-d)/350,0.15,1);
    const flicker=Math.random()<0.14?rand(0.28,0.9):1;
    const lp=m.limbPhase||0;

    ctx.save();ctx.translate(m.x,m.y);ctx.globalAlpha=opacity*flicker;
    ctx.rotate((m.dirAngle||0)-Math.PI/2);

    // shadow
    ctx.globalAlpha=opacity*flicker*0.35;
    ctx.fillStyle="#000";ctx.beginPath();ctx.ellipse(0,22,18,7,0,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=opacity*flicker;

    // legs
    ctx.strokeStyle="#040404";ctx.lineWidth=3.5;
    for(let i=0;i<4;i++){
      const side=i<2?-1:1,off=(i%2)*10-5,swing=Math.sin(lp+i*1.5)*15;
      ctx.beginPath();ctx.moveTo(side*7,off);ctx.quadraticCurveTo(side*26,off+8+swing,side*20,off+30+swing);ctx.stroke();
    }
    // body
    const bg=ctx.createLinearGradient(0,-36,0,14);bg.addColorStop(0,"#090909");bg.addColorStop(1,"#030303");
    ctx.fillStyle=bg;ctx.beginPath();ctx.ellipse(0,-8,15,28,0,0,Math.PI*2);ctx.fill();
    // neck
    ctx.fillStyle="#060606";ctx.fillRect(-4,-40,8,12);
    // head
    ctx.fillStyle="#070707";ctx.beginPath();ctx.ellipse(0,-50,14,19,0,0,Math.PI*2);ctx.fill();
    // eyes
    const chasing=m.mode==="chase"||r.finalPhase;
    ctx.fillStyle=chasing?"rgba(255,20,20,0.95)":"rgba(255,255,255,0.92)";
    ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=chasing?10:6;
    ctx.beginPath();ctx.ellipse(-5,-53,3.8,2.8,-0.2,0,Math.PI*2);ctx.ellipse(5,-53,3.8,2.8,0.2,0,Math.PI*2);ctx.fill();
    ctx.shadowBlur=0;ctx.fillStyle="#000";
    ctx.beginPath();ctx.arc(-5,-53,2,0,Math.PI*2);ctx.arc(5,-53,2,0,Math.PI*2);ctx.fill();
    // arms
    ctx.strokeStyle="#030303";ctx.lineWidth=4.5;
    const armSwing=Math.sin(lp)*10;
    ctx.beginPath();ctx.moveTo(-13,-16);ctx.quadraticCurveTo(-30,8+armSwing,-24,42+armSwing);ctx.stroke();
    ctx.beginPath();ctx.moveTo(13,-16);ctx.quadraticCurveTo(30,8-armSwing,24,42-armSwing);ctx.stroke();
    // claws
    ctx.strokeStyle="rgba(15,12,12,0.8)";ctx.lineWidth=1.2;
    for(let f=0;f<3;f++){
      ctx.beginPath();ctx.moveTo(-24+f*5,42+armSwing);ctx.lineTo(-28+f*6,54+armSwing);ctx.stroke();
      ctx.beginPath();ctx.moveTo(24-f*5,42-armSwing);ctx.lineTo(28-f*6,54-armSwing);ctx.stroke();
    }
    ctx.restore();
  }

  // ── lighting ───────────────────────────────────────────────────────────────
  function drawLighting(ctx, r, cam) {
    const p=r.player;
    const px=p.x-cam.x, py=p.y-cam.y;

    const darkness=document.createElement("canvas");
    darkness.width=CANVAS_W; darkness.height=CANVAS_H;
    const dc=darkness.getContext("2d");

    dc.fillStyle="rgba(0,0,0,0.968)";dc.fillRect(0,0,CANVAS_W,CANVAS_H);

    const currentZone=getZoneAt(r.map,p,6);
    const revealZones=r.map.walkable.filter(zone=>{
      if(!currentZone) return rectDistanceToPoint(zone,p)<110;
      if(zone.id===currentZone.id) return true;
      if(zonesTouch(zone,currentZone)&&rectDistanceToPoint(zone,p)<90) return true;
      return false;
    });

    dc.globalCompositeOperation="destination-out";

    for(const zone of revealZones){
      dc.save();dc.beginPath();dc.rect(zone.x-cam.x,zone.y-cam.y,zone.w,zone.h);dc.clip();

      const baseR=p.flashlightOff?50:82+p.battery*0.55;
      const radius=clamp(baseR-p.fear*0.38,32,128);
      const ambient=dc.createRadialGradient(px,py,6,px,py,radius);
      ambient.addColorStop(0,"rgba(255,255,255,0.9)");ambient.addColorStop(0.48,"rgba(255,255,255,0.3)");ambient.addColorStop(1,"rgba(255,255,255,0)");
      dc.fillStyle=ambient;dc.beginPath();dc.arc(px,py,radius,0,Math.PI*2);dc.fill();

      if(!p.flashlightOff&&p.battery>0){
        const fearFlicker=Math.random()<p.fear/600?rand(0.48,0.92):1;
        const coneLen=clamp(220+p.battery*0.95-p.fear*1.2,100,320)*fearFlicker;
        const coneW=0.43;
        const coneG=dc.createRadialGradient(px,py,14,px,py,coneLen);
        coneG.addColorStop(0,"rgba(255,255,255,0.72)");coneG.addColorStop(0.38,"rgba(255,248,230,0.35)");coneG.addColorStop(1,"rgba(255,255,255,0)");
        dc.fillStyle=coneG;dc.beginPath();dc.moveTo(px,py);dc.arc(px,py,coneLen,p.angle-coneW,p.angle+coneW);dc.closePath();dc.fill();
        const coreG=dc.createRadialGradient(px,py,4,px,py,coneLen*0.52);
        coreG.addColorStop(0,"rgba(255,255,255,0.52)");coreG.addColorStop(1,"rgba(255,255,255,0)");
        dc.fillStyle=coreG;dc.beginPath();dc.moveTo(px,py);dc.arc(px,py,coneLen*0.52,p.angle-coneW*0.44,p.angle+coneW*0.44);dc.closePath();dc.fill();
      }
      dc.restore();
    }

    dc.globalCompositeOperation="source-over";
    ctx.drawImage(darkness,0,0);

    const vig=ctx.createRadialGradient(CANVAS_W/2,CANVAS_H/2,65,CANVAS_W/2,CANVAS_H/2,615);
    vig.addColorStop(0,"rgba(0,0,0,0.02)");vig.addColorStop(0.52,"rgba(0,0,0,0.28)");vig.addColorStop(1,"rgba(0,0,0,0.92)");
    ctx.fillStyle=vig;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);

    if(p.fear>52){ctx.fillStyle=`rgba(50,0,0,${(p.fear-52)/100*0.2})`;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);}
  }

  // ── HUD ────────────────────────────────────────────────────────────────────
  function rrect(ctx, x, y, w, h, r2) {
    ctx.beginPath();ctx.moveTo(x+r2,y);ctx.lineTo(x+w-r2,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r2);
    ctx.lineTo(x+w,y+h-r2);ctx.quadraticCurveTo(x+w,y+h,x+w-r2,y+h);ctx.lineTo(x+r2,y+h);
    ctx.quadraticCurveTo(x,y+h,x,y+h-r2);ctx.lineTo(x,y+r2);ctx.quadraticCurveTo(x,y,x+r2,y);ctx.closePath();
  }

  function drawHorrorBar(ctx, x, y, w, h, value, fillCol, emptyCol, label) {
    ctx.fillStyle=emptyCol;rrect(ctx,x,y,w,h,2.5);ctx.fill();
    if(value>0){
      ctx.save();ctx.beginPath();ctx.rect(x,y,w*clamp(value,0,1),h);ctx.clip();
      ctx.fillStyle=fillCol;rrect(ctx,x,y,w,h,2.5);ctx.fill();ctx.restore();
    }
    ctx.strokeStyle="rgba(255,255,255,0.07)";ctx.lineWidth=0.8;rrect(ctx,x,y,w,h,2.5);ctx.stroke();
    ctx.fillStyle="rgba(170,170,170,0.68)";ctx.font="bold 8px 'Courier New'";ctx.textAlign="left";
    ctx.fillText(label,x+w+8,y+h-1);
  }

  function drawObjectiveCompass(ctx, r, objective, distance) {
    if(!objective) return;
    const p=r.player;
    const angle=Math.atan2(objective.y-p.y,objective.x-p.x);
    const pulse=0.62+Math.sin(r.objectiveBlink/200)*0.28;
    const cx2=CANVAS_W-82, cy2=88;
    ctx.save();
    ctx.strokeStyle="rgba(160,50,50,0.25)";ctx.lineWidth=1;
    ctx.beginPath();ctx.arc(cx2,cy2,24,0,Math.PI*2);ctx.stroke();
    ctx.translate(cx2,cy2);ctx.rotate(angle);ctx.globalAlpha=pulse;
    ctx.fillStyle=r.exit.active?"#60ff90":"#ff9090";
    ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=8;
    ctx.beginPath();ctx.moveTo(20,0);ctx.lineTo(-9,-8);ctx.lineTo(-4,0);ctx.lineTo(-9,8);ctx.closePath();ctx.fill();
    ctx.shadowBlur=0;ctx.restore();
    ctx.save();ctx.textAlign="center";ctx.fillStyle="rgba(200,180,180,0.68)";ctx.font="10px 'Courier New'";
    ctx.fillText(r.exit.active?"EXIT":"STATIC",cx2,cy2+36);ctx.fillText(`${distance}m`,cx2,cy2+48);ctx.restore();
  }

  function drawHUD(ctx, r) {
    const p=r.player, objective=getObjective(r);
    const objDist=objective?Math.round(dist(p,objective)):0;
    ctx.save();

    // left panel
    const px2=18,py2=18,pw=240,ph=152;
    ctx.fillStyle="rgba(3,2,7,0.8)";rrect(ctx,px2,py2,pw,ph,5);ctx.fill();
    ctx.strokeStyle="rgba(160,50,50,0.32)";ctx.lineWidth=1;rrect(ctx,px2,py2,pw,ph,5);ctx.stroke();
    ctx.fillStyle="rgba(160,24,24,0.85)";ctx.fillRect(px2+5,py2+1,pw-10,2);
    ctx.fillStyle="rgba(190,70,70,0.92)";ctx.font="bold 10px 'Courier New'";ctx.textAlign="left";
    ctx.fillText("◈ SOMETHING HEARD YOU",px2+11,py2+18);
    ctx.strokeStyle="rgba(160,50,50,0.18)";ctx.lineWidth=0.8;
    ctx.beginPath();ctx.moveTo(px2+8,py2+24);ctx.lineTo(px2+pw-8,py2+24);ctx.stroke();
    const bx=px2+11, bw=pw-58;
    drawHorrorBar(ctx,bx,py2+34,bw,9,p.battery/100,"#c0b030","#4a4212","BAT");
    drawHorrorBar(ctx,bx,py2+56,bw,9,1-p.fear/100,"#3880c8","#142840","CALM");
    drawHorrorBar(ctx,bx,py2+78,bw,9,p.stamina/100,"#7a7a7a","#2a2a2a","STM");
    ctx.fillStyle="rgba(130,130,130,0.65)";ctx.font="9px 'Courier New'";ctx.fillText("VITAL",bx,py2+104);
    for(let i=0;i<3;i++){
      ctx.fillStyle=i<p.hp?"rgba(170,24,24,0.95)":"rgba(55,24,24,0.5)";
      ctx.font="17px monospace";ctx.fillText("♥",bx+i*24,py2+128);
    }
    if(p.hidden){ctx.fillStyle="rgba(90,120,210,0.82)";ctx.font="bold 9px 'Courier New'";ctx.textAlign="center";ctx.fillText("⬛ CONCEALED",px2+pw/2,py2+ph+15);}

    // fragment counter
    const fcW=160,fcH=44;
    ctx.fillStyle="rgba(3,2,7,0.8)";rrect(ctx,CANVAS_W-fcW-18,18,fcW,fcH,5);ctx.fill();
    ctx.strokeStyle="rgba(160,50,50,0.32)";ctx.lineWidth=1;rrect(ctx,CANVAS_W-fcW-18,18,fcW,fcH,5);ctx.stroke();
    ctx.textAlign="right";ctx.fillStyle="rgba(190,70,70,0.9)";ctx.font="bold 10px 'Courier New'";
    ctx.fillText("FRAGMENTS",CANVAS_W-26,35);
    ctx.fillStyle=r.collected===ITEM_COUNT?"rgba(70,240,110,0.92)":"rgba(220,170,170,0.9)";
    ctx.font="bold 20px 'Courier New'";ctx.fillText(`${r.collected} / ${ITEM_COUNT}`,CANVAS_W-26,54);

    drawObjectiveCompass(ctx,r,objective,objDist);

    if(r.finalPhase){
      const tp=(Math.sin(r.time*0.003)*0.3)+0.7;
      ctx.fillStyle=`rgba(110,0,0,${0.26*tp})`;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
      ctx.textAlign="center";ctx.fillStyle=`rgba(255,60,60,${tp*0.92})`;ctx.font="bold 12px 'Courier New'";
      ctx.fillText("▶  RUN TO THE EXIT  ◀",CANVAS_W/2,36);
    }

    if(r.message){
      const mW=540,mH=34,mX=CANVAS_W/2-mW/2,mY=CANVAS_H-55;
      ctx.fillStyle="rgba(3,2,7,0.75)";rrect(ctx,mX,mY,mW,mH,4);ctx.fill();
      ctx.strokeStyle="rgba(150,55,55,0.22)";ctx.lineWidth=0.8;rrect(ctx,mX,mY,mW,mH,4);ctx.stroke();
      ctx.textAlign="center";ctx.fillStyle="rgba(205,185,185,0.9)";ctx.font="12px 'Courier New'";
      ctx.fillText(r.message,CANVAS_W/2,mY+21);
    }
    ctx.restore();
  }

  // ── overlays ───────────────────────────────────────────────────────────────
  function drawOverlays(ctx, r) {
    const fear=r.player.fear/100;

    if(fear>0.42){ctx.save();ctx.globalAlpha=(fear-0.42)*0.1;for(let y=0;y<CANVAS_H;y+=3){ctx.fillStyle="rgba(0,0,0,0.7)";ctx.fillRect(0,y,CANVAS_W,1);}ctx.restore();}

    if(fear>0.5){
      ctx.save();ctx.globalAlpha=(fear-0.5)*0.22;
      for(let i=0;i<55;i++){ctx.fillStyle=Math.random()>0.5?"rgba(255,255,255,0.9)":"rgba(0,0,0,0.9)";ctx.fillRect(rand(0,CANVAS_W),rand(0,CANVAS_H),rand(1,4),rand(1,3));}
      ctx.restore();
    }

    if(r.glitch>0){
      ctx.save();
      const bands=Math.floor(r.glitch*10);
      for(let i=0;i<bands;i++){
        const by2=rand(0,CANVAS_H),bh=rand(2,13),shift=rand(-24,24)*r.glitch;
        ctx.globalAlpha=r.glitch*0.32;
        ctx.fillStyle="rgba(255,0,0,0.4)";ctx.fillRect(shift,by2,CANVAS_W,bh);
        ctx.fillStyle="rgba(0,255,255,0.2)";ctx.fillRect(-shift,by2+1,CANVAS_W,bh-2);
      }
      if(r.glitch>0.5){ctx.globalAlpha=r.glitch*0.38;ctx.fillStyle="rgba(255,255,255,0.12)";ctx.fillRect(rand(CANVAS_W*0.2,CANVAS_W*0.8),0,rand(2,8),CANVAS_H);}
      ctx.restore();
    }

    if(r.scare){
      const progress=r.scare.timer/1050, alpha=clamp(progress*1.4,0,1), scl=1+(1-progress)*0.65;
      ctx.save();
      if(progress>0.88){ctx.fillStyle=`rgba(255,255,255,${(progress-0.88)*6*0.65})`;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);}
      ctx.fillStyle=`rgba(0,0,0,${0.48+alpha*0.38})`;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
      ctx.save();ctx.translate(CANVAS_W/2,CANVAS_H/2-35);ctx.scale(scl,scl);
      const faceGrad=ctx.createRadialGradient(0,0,8,0,0,128);
      faceGrad.addColorStop(0,`rgba(8,6,6,${alpha})`);faceGrad.addColorStop(0.65,`rgba(4,2,2,${alpha})`);faceGrad.addColorStop(1,"rgba(0,0,0,0)");
      ctx.fillStyle=faceGrad;ctx.beginPath();ctx.ellipse(0,0,92,128,0,0,Math.PI*2);ctx.fill();
      const eyeL={x:-30+rand(-2,2),y:-38+rand(-1,1)}, eyeR={x:36+rand(-2,2),y:-33+rand(-1,1)};
      ctx.fillStyle=`rgba(255,255,255,${alpha*0.9})`;ctx.shadowColor="rgba(200,0,0,0.7)";ctx.shadowBlur=14;
      ctx.beginPath();ctx.ellipse(eyeL.x,eyeL.y,13,9,rand(-0.4,0.4),0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.ellipse(eyeR.x,eyeR.y,10,14,rand(-0.4,0.4),0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#000";ctx.shadowBlur=0;ctx.beginPath();ctx.arc(eyeL.x,eyeL.y,6,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(eyeR.x,eyeR.y,5,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=`rgba(255,255,255,${alpha*0.55})`;ctx.lineWidth=4;
      ctx.beginPath();ctx.moveTo(-50,28);ctx.quadraticCurveTo(0,78,50,28);ctx.stroke();
      ctx.fillStyle=`rgba(235,225,215,${alpha*0.48})`;
      for(let t=0;t<7;t++) ctx.fillRect(-37+t*12,30,9,17);
      ctx.restore();
      ctx.textAlign="center";ctx.fillStyle=`rgba(255,255,255,${alpha*0.95})`;
      ctx.shadowColor="rgba(220,0,0,0.45)";ctx.shadowBlur=20;
      ctx.font=`bold ${Math.floor(50+(1-progress)*20)}px 'Courier New'`;
      ctx.fillText(r.scare.text,CANVAS_W/2,CANVAS_H-76);ctx.shadowBlur=0;
      ctx.restore();
    }

    if(!started||r.dead||r.won){
      ctx.save();ctx.fillStyle="rgba(0,0,0,0.88)";ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
      for(let i=0;i<16;i++){ctx.fillStyle=`rgba(50,8,8,${rand(0.02,0.06)})`;ctx.fillRect(0,rand(0,CANVAS_H),CANVAS_W,rand(1,3));}
      const cx2=CANVAS_W/2, cy2=CANVAS_H/2;
      ctx.textAlign="center";

      if(!started){
        ctx.fillStyle="rgba(140,20,20,0.1)";ctx.font="bold 130px 'Courier New'";ctx.fillText("SHY",cx2,cy2+48);
        ctx.shadowColor="rgba(180,25,25,0.5)";ctx.shadowBlur=28;ctx.fillStyle="rgba(220,90,90,0.97)";
        ctx.font="bold 40px 'Courier New'";ctx.fillText("SOMETHING HEARD YOU",cx2,cy2-58);ctx.shadowBlur=0;
        ctx.fillStyle="rgba(175,155,155,0.72)";ctx.font="13px 'Courier New'";
        ctx.fillText("A dark horror roguelike. Follow the static compass. Do not let it hear you.",cx2,cy2-12);
        ctx.fillText("WASD move  ·  Mouse aim  ·  Shift sprint  ·  E interact  ·  F flashlight  ·  Space hide",cx2,cy2+14);
        ctx.fillText("Collect 6 signal fragments. Then escape through the exit.",cx2,cy2+38);
        const p2=(Math.sin(Date.now()*0.003)*0.3)+0.7;
        ctx.fillStyle=`rgba(195,65,65,${p2})`;ctx.font="bold 15px 'Courier New'";ctx.fillText("[ CLICK OR PRESS START ]",cx2,cy2+86);
      } else if(r.dead){
        ctx.shadowColor="rgba(140,0,0,0.6)";ctx.shadowBlur=36;ctx.fillStyle="rgba(195,55,55,0.97)";
        ctx.font="bold 50px 'Courier New'";ctx.fillText("YOU WERE HEARD",cx2,cy2-36);ctx.shadowBlur=0;
        ctx.fillStyle="rgba(175,138,138,0.72)";ctx.font="14px 'Courier New'";ctx.fillText("The dark learned your name.",cx2,cy2+8);
        ctx.fillStyle="rgba(120,95,95,0.55)";ctx.font="12px 'Courier New'";ctx.fillText(`Fragments collected: ${r.collected} / ${ITEM_COUNT}`,cx2,cy2+34);
        ctx.fillStyle="rgba(175,72,72,0.78)";ctx.font="bold 13px 'Courier New'";ctx.fillText("[ PRESS RESTART ]",cx2,cy2+76);
      } else if(r.won){
        ctx.shadowColor="rgba(60,180,80,0.5)";ctx.shadowBlur=28;ctx.fillStyle="rgba(100,220,140,0.97)";
        ctx.font="bold 50px 'Courier New'";ctx.fillText("YOU ESCAPED",cx2,cy2-36);ctx.shadowBlur=0;
        ctx.fillStyle="rgba(150,195,160,0.72)";ctx.font="14px 'Courier New'";ctx.fillText("But the signal is still active.",cx2,cy2+8);
        ctx.fillStyle="rgba(115,155,125,0.55)";ctx.font="12px 'Courier New'";ctx.fillText("Something followed you out.",cx2,cy2+34);
        ctx.fillStyle="rgba(90,170,110,0.78)";ctx.font="bold 13px 'Courier New'";ctx.fillText("[ PRESS RESTART ]",cx2,cy2+76);
      }
      ctx.restore();
    }
  }

  // ── input ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const down = (e) => {
      const key=e.key.toLowerCase();
      keysRef.current[key]=true;
      if(["w","a","s","d"," ","shift","e","f"].includes(key)) e.preventDefault();
      if(key==="f"){
        const r=runRef.current;if(!r||r.dead||r.won) return;
        r.player.flashlightOff=!r.player.flashlightOff;
        r.message=r.player.flashlightOff?"You turned off the light.":"The flashlight flickers on.";
      }
      if(key==="e") interact();
      if(key===" "){
        const r=runRef.current;if(!r||r.dead||r.won) return;
        const near=r.hidingSpots.find(s=>dist(s,r.player)<45);
        if(near){r.player.hidden=!r.player.hidden;r.message=r.player.hidden?"You hold your breath.":"You step out.";if(!r.player.hidden) createNoise(r,r.player.x,r.player.y,185);}
        else r.message="No hiding spot nearby.";
      }
    };
    const up=(e)=>{keysRef.current[e.key.toLowerCase()]=false;};
    const move=(e)=>{
      const canvas=canvasRef.current;if(!canvas) return;
      const rect=canvas.getBoundingClientRect();
      mouseRef.current={x:((e.clientX-rect.left)/rect.width)*CANVAS_W,y:((e.clientY-rect.top)/rect.height)*CANVAS_H};
    };
    window.addEventListener("keydown",down);window.addEventListener("keyup",up);window.addEventListener("mousemove",move);
    return()=>{window.removeEventListener("keydown",down);window.removeEventListener("keyup",up);window.removeEventListener("mousemove",move);};
  }, []);

  useEffect(() => {
    const tick=(now)=>{
      const dt=now-lastRef.current;lastRef.current=now;
      updateGame(dt);
      const ctx=canvasRef.current?.getContext("2d");
      const r=runRef.current;
      if(ctx&&r) drawGame(ctx,r);
      rafRef.current=requestAnimationFrame(tick);
    };
    rafRef.current=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(rafRef.current);
  }, [started]);

  return (
    <div className="shy-page">
      <div className="shy-shell">
        <div className="shy-header">
          <div>
            <p className="shy-kicker">◈ Signal Detected ◈</p>
            <h1>Something Heard You</h1>
            <p>A dark horror roguelike with maze corridors, a stalking creature, fear-based visibility, jump scares, and a final escape phase.</p>
          </div>
          <div className="shy-actions">
            <button onClick={started ? restart : () => setStarted(true)}>
              {started ? "Restart Run" : "Start Run"}
            </button>
            {onExit && <button className="shy-secondary" onClick={onExit}>Back</button>}
          </div>
        </div>

        <div className="shy-game-card">
          <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} className="shy-canvas"
            onClick={() => { if(!started) setStarted(true); }} />
          <div className="shy-controls">
            <span>WASD · move</span><span>Mouse · aim</span><span>Shift · sprint</span>
            <span>E · interact</span><span>F · flashlight</span><span>Space · hide</span>
          </div>
        </div>

        <div className="shy-notes">
          <div>
            <h3>Objective</h3>
            <p>Collect 6 signal fragments. The compass points to the nearest one. After the last, the exit activates — and it hunts.</p>
          </div>
          <div>
            <h3>The Monster</h3>
            <p>It only fully chases when it shares your room or hallway. But it reacts to sound. Running is loud.</p>
          </div>
          <div>
            <h3>Survival</h3>
            <p>Darkness and proximity raise fear. High fear worsens visibility, causes glitches, hallucinations, and jump scares.</p>
          </div>
        </div>
      </div>
    </div>
  );
}