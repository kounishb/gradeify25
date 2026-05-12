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
const BATTERY_DRAIN = 0.0018;
const FEAR_DARK_GAIN = 0.003;
const FEAR_MONSTER_GAIN = 0.028;
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
  return !(a.x > b.x + b.w + 6 || a.x + a.w + 6 < b.x ||
           a.y > b.y + b.h + 6 || a.y + a.h + 6 < b.y);
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
  const n = Math.floor(rand(4, 10));
  for (let i = 0; i < n; i++) {
    details.push({
      type: choice(["crack","stain","claw","symbol","body","debris","rust"]),
      x: rand(room.x + 20, room.x + room.w - 20),
      y: rand(room.y + 20, room.y + room.h - 20),
      rot: rand(0, Math.PI * 2),
      scale: rand(0.7, 1.4),
      r: Math.random(), g: Math.random(),
    });
  }
  const lights = [];
  const lc = Math.floor(rand(1, 4));
  for (let i = 0; i < lc; i++) {
    lights.push({
      x: rand(room.x + 50, room.x + room.w - 50),
      y: room.y + rand(18, 30),
      on: Math.random() > 0.3,
      flicker: rand(1.5, 7),
      phase: rand(0, Math.PI * 2),
      warmth: rand(0.55, 1),
    });
  }
  return { ...room, details, lights };
}

// ─── map ──────────────────────────────────────────────────────────────────────
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
      const x = startX + col * cellW + rand(-30, 30);
      const y = startY + row * cellH + rand(-25, 25);
      rooms.push(seedRoomDetails({
        id: `room-${row}-${col}`, grid: { row, col }, x, y, w, h,
        type: row === 0 && col === 0 ? "spawn" : "room", decay: Math.random(),
      }));
    }
  }

  const byGrid = new Map();
  rooms.forEach(r => byGrid.set(`${r.grid.row}-${r.grid.col}`, r));

  function connectRooms(a, b) {
    if (!a || !b) return;
    const ax = a.x + a.w / 2, ay = a.y + a.h / 2;
    const bx = b.x + b.w / 2, by = b.y + b.h / 2;
    const hf = Math.random() > 0.4;
    if (hf) {
      corridors.push({ id:`ch-${a.id}-${b.id}`, x:Math.min(ax,bx)-24, y:ay-26, w:Math.abs(ax-bx)+48, h:52, type:"hallway", decay:Math.random() });
      corridors.push({ id:`cv-${a.id}-${b.id}`, x:bx-26, y:Math.min(ay,by)-24, w:52, h:Math.abs(ay-by)+48, type:"hallway", decay:Math.random() });
    } else {
      corridors.push({ id:`cv-${a.id}-${b.id}`, x:ax-26, y:Math.min(ay,by)-24, w:52, h:Math.abs(ay-by)+48, type:"hallway", decay:Math.random() });
      corridors.push({ id:`ch-${a.id}-${b.id}`, x:Math.min(ax,bx)-24, y:by-26, w:Math.abs(ax-bx)+48, h:52, type:"hallway", decay:Math.random() });
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

  const walkable = [...rooms, ...corridors];
  const spawnRoom = byGrid.get("0-0") || rooms[0];
  const exitRoom = [...rooms].filter(r => r.id !== spawnRoom.id).sort((a,b) => {
    const ac={x:a.x+a.w/2,y:a.y+a.h/2}, bc={x:b.x+b.w/2,y:b.y+b.h/2};
    const sc={x:spawnRoom.x+spawnRoom.w/2,y:spawnRoom.y+spawnRoom.h/2};
    return dist(bc,sc)-dist(ac,sc);
  })[0];

  return { rooms, corridors, walkable, spawnRoom, exitRoom };
}

// ─── run factory ──────────────────────────────────────────────────────────────
function createRun() {
  const map = makeMazeMap();
  const spawn = map.spawnRoom;
  const player = {
    x: spawn.x + spawn.w/2, y: spawn.y + spawn.h/2,
    angle: 0, hp: 3, fear: 0, battery: 100, stamina: 100,
    hidden: false, invuln: 0, flashlightOff: false, bobPhase: 0,
  };

  const farRooms = [...map.rooms]
    .filter(r => r.id !== map.spawnRoom.id)
    .sort((a,b) => dist({x:b.x+b.w/2,y:b.y+b.h/2},player) - dist({x:a.x+a.w/2,y:a.y+a.h/2},player));

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
    scare:null, message:"Find 6 fragments. The compass arrow points the way.",
    hauntTimer:rand(5000,9000), time:0, glitch:0, objectiveBlink:0,
    // heartbeat tracker for proximity dread
    heartbeatPhase: 0,
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
    "Something is listening.", "The dark is not empty.",
    "Do not sprint unless you have to.", "The walls swallowed the sound.",
    "You hear footsteps copying yours.", "It is close, but not close enough to see.",
    "Your flashlight catches a shape, then nothing.", "The hallway bends the wrong way.",
    "That door was not open before.", "It only needs to hear you once.",
    "The air smells of copper.", "You counted six steps. There were seven.",
    "Don't look at the ceiling.", "It has been watching since you arrived.",
  ], []);

  useEffect(() => { runRef.current = run; }, [run]);

  function restart() {
    const fresh = createRun();
    runRef.current = fresh; setRun(fresh); setStarted(true);
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
    r.scare = { text, timer:1100, seed:Math.random() };
    r.player.fear = clamp(r.player.fear+24, 0, 100);
    r.glitch = 1;
  }

  function interact() {
    const r = runRef.current;
    if (!r || r.dead || r.won) return;
    const p = r.player;
    for (const item of r.items) {
      if (!item.collected && dist(p,item) < 42) {
        item.collected = true; r.collected++; r.glitch = 0.8;
        p.fear = clamp(p.fear+8, 0, 100);
        createNoise(r, p.x, p.y, 230);
        if (r.collected >= ITEM_COUNT) {
          r.finalPhase=true; r.exit.active=true;
          r.monster.mode="investigate"; r.monster.target={x:p.x,y:p.y};
          r.monster.speed=3.3;
          r.message="ALL FRAGMENTS COLLECTED — EXIT IS OPEN. RUN.";
          triggerScare(r,"IT KNOWS");
        } else {
          r.message=`${ITEM_COUNT-r.collected} fragments remain.`;
          if(Math.random()<0.32) triggerScare(r,choice(["BEHIND YOU","IT HEARD YOU","DON'T STOP"]));
        }
        return;
      }
    }
    for (const bat of r.batteries) {
      if (!bat.collected && dist(p,bat)<38) {
        bat.collected=true; p.battery=clamp(p.battery+40,0,100);
        r.message="Battery found."; createNoise(r,p.x,p.y,100); return;
      }
    }
    for (const med of r.medkits) {
      if (!med.collected && dist(p,med)<38) {
        med.collected=true; p.hp=clamp(p.hp+1,0,3); p.fear=clamp(p.fear-18,0,100);
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
    if (m.stun > 0) { m.stun-=dt; return; }
    m.limbPhase += dt*0.008;

    const sameZone = sameVisibilityZone(r.map,p,m);
    const d = dist(p,m);

    if (!p.hidden && sameZone && d < (r.finalPhase ? 560 : 440)) {
      m.mode="chase"; m.target={x:p.x,y:p.y};
      m.anger=clamp(m.anger+0.12*dt,0,100);
    } else if (m.mode==="chase") {
      m.mode="investigate"; m.target={x:p.x,y:p.y};
    }

    if (m.mode==="stalk") {
      if (!m.target || dist(m,m.target)<38 || Math.random()<0.006) {
        const pz=getZoneAt(r.map,p,5);
        const possible=r.map.rooms
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
      moveMonsterToward(r,m.target,m.speed*(r.finalPhase?1.28:1.1),dt);
      if(Math.random()<0.025) r.message=choice(["RUN.","IT SEES YOU.","DO NOT STOP."]);
    }
    if (m.target) m.dirAngle=Math.atan2(m.target.y-m.y,m.target.x-m.x);
    m.anger=clamp(m.anger-dt*0.003,0,100);
  }

  function moveMonsterToward(r, target, speed, dt) {
    if (!target) return;
    const m=r.monster, angle=Math.atan2(target.y-m.y,target.x-m.x), step=speed*(dt/16.67);
    const nx=m.x+Math.cos(angle)*step, ny=m.y+Math.sin(angle)*step;
    if (isWalkable(r,nx,m.y,MONSTER_RADIUS)) m.x=nx; else m.x+=Math.cos(angle+rand(-1.7,1.7))*step*0.42;
    if (isWalkable(r,m.x,ny,MONSTER_RADIUS)) m.y=ny; else m.y+=Math.sin(angle+rand(-1.7,1.7))*step*0.42;
  }

  function haunt(r) {
    const p=r.player, roll=Math.random();
    r.message=choice(horrorLines);
    r.glitch=Math.max(r.glitch,rand(0.2,0.55));
    if (roll<0.18) {
      const angle=rand(0,Math.PI*2);
      r.hallucinations.push({ x:p.x+Math.cos(angle)*rand(130,220), y:p.y+Math.sin(angle)*rand(130,220), timer:rand(600,1000) });
    } else if (roll<0.35) {
      createNoise(r, p.x-Math.cos(p.angle)*rand(130,240), p.y-Math.sin(p.angle)*rand(130,240), 150);
      r.message="Footsteps behind you.";
    } else if (roll<0.52) { p.fear=clamp(p.fear+rand(5,12),0,100); }
    else if (roll<0.68) { r.monster.mode="investigate"; r.monster.target={x:p.x+rand(-200,200),y:p.y+rand(-200,200)}; }
    else if (roll<0.84&&p.fear>38) triggerScare(r,choice(["LOOK","MOVE","FOUND YOU","DON'T BREATHE"]));
    else r.message="Silence. Too much silence.";
  }

  function updateGame(dtMs) {
    const r=runRef.current;
    if (!r||!started||r.dead||r.won) return;
    const dt=Math.min(dtMs,34);
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

    if(sprinting){ p.stamina=clamp(p.stamina-dt*0.07,0,100); if(Math.random()<0.052) createNoise(r,p.x,p.y,170); }
    else          { p.stamina=clamp(p.stamina+dt*0.026,0,100); }
    if(moving){
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

    // heartbeat advances faster when monster is close
    r.heartbeatPhase = (r.heartbeatPhase||0) + dt * clamp((500-md)/5000, 0.001, 0.025);

    if(md<PLAYER_RADIUS+MONSTER_RADIUS+8&&p.invuln<=0){
      if(p.hidden&&Math.random()>0.5){
        r.message="It walked past you."; r.monster.mode="stalk"; r.monster.target=null;
        p.fear=clamp(p.fear+18,0,100);
      } else {
        p.hp-=1; p.invuln=1800; p.hidden=false; p.fear=clamp(p.fear+36,0,100);
        triggerScare(r,"CAUGHT");
        r.bloodSplatters.push({x:p.x+rand(-25,25),y:p.y+rand(-25,25),rr:rand(6,20),alpha:0.85});
        const safeRooms=r.map.rooms.filter(room=>dist({x:room.x+room.w/2,y:room.y+room.h/2},p)>360).sort(()=>Math.random()-0.5);
        const room=safeRooms[0]||choice(r.map.rooms);
        const pos=randomPointInRect(room,60);
        r.monster.x=pos.x; r.monster.y=pos.y; r.monster.mode="stalk"; r.monster.target=null;
        if(p.hp<=0){ r.dead=true; r.message="The dark learned your name."; }
      }
    }

    for(const pulse of r.noisePulses){ pulse.r+=dt*0.34; pulse.alpha-=dt*0.0011; }
    r.noisePulses=r.noisePulses.filter(p=>p.alpha>0&&p.r<p.max);
    for(const h of r.hallucinations) h.timer-=dt;
    r.hallucinations=r.hallucinations.filter(h=>h.timer>0);
    r.hauntTimer-=dt;
    if(r.hauntTimer<=0){ haunt(r); r.hauntTimer=rand(r.finalPhase?2500:5500,r.finalPhase?6500:13000); }
    if(r.scare){ r.scare.timer-=dt; if(r.scare.timer<=0) r.scare=null; }

    setRun({...r});
  }

  function getCamera(r) {
    const fearShake=r.player.fear>65?(r.player.fear-65)*0.07:0;
    const shake=r.glitch*8+fearShake;
    return {
      x:clamp(r.player.x-CANVAS_W/2+rand(-shake,shake),0,WORLD_W-CANVAS_W),
      y:clamp(r.player.y-CANVAS_H/2+rand(-shake,shake),0,WORLD_H-CANVAS_H),
    };
  }

  // ── draw ──────────────────────────────────────────────────────────────────
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
    drawPlayer(ctx,r);
    ctx.restore();

    // lighting drawn here — monster drawn AFTER so it always shows through darkness
    drawLighting(ctx,r,cam);

    ctx.save(); ctx.translate(-cam.x,-cam.y);
    drawMonster(ctx,r,cam);
    ctx.restore();

    drawHUD(ctx,r);
    drawOverlays(ctx,r);
  }

  // ── world ──────────────────────────────────────────────────────────────────
  function drawWorld(ctx, r) {
    // Void / wall color — dark desaturated stone, not pure black
    ctx.fillStyle="#0a0810"; ctx.fillRect(0,0,WORLD_W,WORLD_H);

    for (const zone of r.map.walkable) {
      const isHall = zone.type==="hallway";

      if (isHall) {
        // Corridors: noticeably distinct floor — slightly warmer, lighter
        ctx.fillStyle="#1a1624";
        ctx.fillRect(zone.x,zone.y,zone.w,zone.h);

        // Corridor floor center strip so you can see the path
        const horiz=zone.w>zone.h;
        if(horiz){
          ctx.fillStyle="rgba(255,240,200,0.04)";
          ctx.fillRect(zone.x,zone.y+zone.h*0.2,zone.w,zone.h*0.6);
        }else{
          ctx.fillStyle="rgba(255,240,200,0.04)";
          ctx.fillRect(zone.x+zone.w*0.2,zone.y,zone.w*0.6,zone.h);
        }

        // Corridor wall borders — bright enough to read
        ctx.strokeStyle="rgba(140,110,90,0.55)"; ctx.lineWidth=3;
        ctx.strokeRect(zone.x+1.5,zone.y+1.5,zone.w-3,zone.h-3);

        // Outer hard border (wall)
        ctx.strokeStyle="#050408"; ctx.lineWidth=8;
        ctx.strokeRect(zone.x,zone.y,zone.w,zone.h);

        // Pipes along the corridor ceiling
        ctx.strokeStyle="rgba(100,88,72,0.45)"; ctx.lineWidth=4; ctx.lineCap="square";
        if(horiz){
          ctx.beginPath();ctx.moveTo(zone.x,zone.y+8);ctx.lineTo(zone.x+zone.w,zone.y+8);ctx.stroke();
          ctx.beginPath();ctx.moveTo(zone.x,zone.y+zone.h-8);ctx.lineTo(zone.x+zone.w,zone.y+zone.h-8);ctx.stroke();
        }else{
          ctx.beginPath();ctx.moveTo(zone.x+8,zone.y);ctx.lineTo(zone.x+8,zone.y+zone.h);ctx.stroke();
          ctx.beginPath();ctx.moveTo(zone.x+zone.w-8,zone.y);ctx.lineTo(zone.x+zone.w-8,zone.y+zone.h);ctx.stroke();
        }

      } else {
        // Rooms: warmer, lighter floor
        ctx.fillStyle="#221e30";
        ctx.fillRect(zone.x,zone.y,zone.w,zone.h);

        // Tile grid — subtle but visible
        ctx.strokeStyle="rgba(255,255,255,0.05)"; ctx.lineWidth=0.8;
        const tile=48;
        for(let tx=zone.x;tx<zone.x+zone.w;tx+=tile){ ctx.beginPath();ctx.moveTo(tx,zone.y);ctx.lineTo(tx,zone.y+zone.h);ctx.stroke(); }
        for(let ty=zone.y;ty<zone.y+zone.h;ty+=tile){ ctx.beginPath();ctx.moveTo(zone.x,ty);ctx.lineTo(zone.x+zone.w,ty);ctx.stroke(); }

        // Inner wall edge — bright highlight so boundary is clear
        ctx.strokeStyle="rgba(170,140,110,0.6)"; ctx.lineWidth=3;
        ctx.strokeRect(zone.x+2,zone.y+2,zone.w-4,zone.h-4);

        // Mid inset line (baseboard)
        ctx.strokeStyle="rgba(90,75,65,0.35)"; ctx.lineWidth=1;
        ctx.strokeRect(zone.x+10,zone.y+10,zone.w-20,zone.h-20);

        // Hard outer wall
        ctx.strokeStyle="#050408"; ctx.lineWidth=9;
        ctx.strokeRect(zone.x,zone.y,zone.w,zone.h);

        // Ceiling lights
        if(zone.lights){
          for(const light of zone.lights){
            const t=r.time*0.001+light.phase;
            const flickOn=light.on&&Math.sin(t*light.flicker)>-0.25+Math.random()*0.04;
            if(flickOn){
              ctx.save();
              const wr=Math.floor(220*light.warmth), wg=Math.floor(190*light.warmth);
              ctx.shadowColor=`rgba(${wr},${wg},140,0.95)`;ctx.shadowBlur=28;
              ctx.fillStyle=`rgba(${wr+10},${wg+10},160,0.9)`;
              ctx.fillRect(light.x-14,light.y-4,28,8);
              // downward cone of ambient light on the floor
              const lg=ctx.createRadialGradient(light.x,light.y+4,3,light.x,light.y+4,100);
              lg.addColorStop(0,`rgba(${wr},${wg},100,0.18)`);lg.addColorStop(1,"rgba(0,0,0,0)");
              ctx.fillStyle=lg;ctx.beginPath();ctx.ellipse(light.x,light.y+55,65,55,0,0,Math.PI*2);ctx.fill();
              ctx.restore();
            } else if(light.on){
              ctx.fillStyle="rgba(50,42,42,0.6)";ctx.fillRect(light.x-14,light.y-4,28,8);
            }
          }
        }

        // Env details
        if(zone.details){
          for(const d of zone.details){
            ctx.save();ctx.translate(d.x,d.y);ctx.rotate(d.rot);ctx.globalAlpha=0.5;
            drawEnvDetail(ctx,d);ctx.restore();
          }
        }
      }
    }

    // Subtle grit dots
    for(let i=0;i<140;i++){
      const x=(i*173)%WORLD_W, y=(i*97)%WORLD_H;
      ctx.fillStyle="rgba(255,255,255,0.025)"; ctx.fillRect(x,y,2,2);
    }
  }

  function drawEnvDetail(ctx, d) {
    switch(d.type){
      case "crack":{
        ctx.strokeStyle="rgba(0,0,0,0.8)";ctx.lineWidth=1.2;
        ctx.beginPath();ctx.moveTo(0,0);
        let cx2=0,cy2=0;
        for(let i=0;i<Math.floor(3+d.r*5);i++){
          cx2+=(d.g*32-16)*d.scale*0.5; cy2+=(d.r*32-16)*d.scale*0.5; ctx.lineTo(cx2,cy2);
        }ctx.stroke();break;
      }
      case "stain":{
        ctx.fillStyle=`rgba(${65+Math.floor(d.r*35)},0,0,0.5)`;
        ctx.beginPath();ctx.ellipse(0,0,7+d.scale*10,4+d.scale*7,d.rot*0.5,0,Math.PI*2);ctx.fill();
        ctx.fillStyle="rgba(50,0,0,0.3)";ctx.fillRect(-2,3,4,d.scale*20);break;
      }
      case "claw":{
        ctx.strokeStyle="rgba(120,20,20,0.65)";ctx.lineWidth=2;
        for(let i=0;i<4;i++){
          ctx.beginPath();ctx.moveTo(-6+i*4,-14*d.scale);
          ctx.quadraticCurveTo(d.g*18-9,0,-4+i*4,14*d.scale);ctx.stroke();
        }break;
      }
      case "symbol":{
        ctx.strokeStyle="rgba(150,28,28,0.5)";ctx.lineWidth=1.8;
        const sr=12*d.scale;ctx.beginPath();ctx.arc(0,0,sr,0,Math.PI*2);ctx.stroke();
        ctx.beginPath();ctx.moveTo(0,-sr);ctx.lineTo(0,sr);ctx.moveTo(-sr,0);ctx.lineTo(sr,0);ctx.stroke();break;
      }
      case "body":{
        ctx.fillStyle="rgba(20,12,12,0.65)";
        ctx.beginPath();ctx.ellipse(0,8*d.scale,8*d.scale,16*d.scale,d.rot*0.3,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(0,-10*d.scale,7*d.scale,0,Math.PI*2);ctx.fill();
        ctx.fillStyle="rgba(80,0,0,0.4)";ctx.beginPath();ctx.ellipse(5*d.scale,10*d.scale,5*d.scale,3*d.scale,0,0,Math.PI*2);ctx.fill();break;
      }
      case "debris":{
        for(let i=0;i<5;i++){
          ctx.fillStyle=`rgba(${38+i*7},${30+i*5},${22+i*4},0.7)`;
          ctx.fillRect((d.r*22-11+i*3)*d.scale*0.5,(d.g*22-11+i*2)*d.scale*0.5,(3+d.r*6)*d.scale,(2+d.g*5)*d.scale);
        }break;
      }
      case "rust":{
        ctx.fillStyle="rgba(95,42,10,0.42)";
        for(let i=0;i<3;i++){
          ctx.beginPath();ctx.ellipse((d.r*16-8+i*5)*d.scale,(d.g*12-6)*d.scale,(3+d.r*5)*d.scale,(2+d.g*4)*d.scale,d.rot,0,Math.PI*2);ctx.fill();
        }break;
      }
      default:break;
    }
  }

  function drawBloodSplatters(ctx, r) {
    for(const s of r.bloodSplatters){
      ctx.save();ctx.globalAlpha=s.alpha*0.7;
      ctx.fillStyle="#300000";ctx.beginPath();ctx.arc(s.x,s.y,s.rr,0,Math.PI*2);ctx.fill();ctx.restore();
    }
  }

  // ── items ──────────────────────────────────────────────────────────────────
  function drawItems(ctx, r) {
    for(const item of r.items){
      if(item.collected) continue;
      item.pulse+=0.04;
      const glow=12+Math.sin(item.pulse)*5;
      ctx.save();ctx.translate(item.x,item.y);ctx.rotate(item.pulse*0.35);
      const g=ctx.createRadialGradient(0,0,1,0,0,14);
      g.addColorStop(0,"#ff8080");g.addColorStop(0.45,"#b01c1c");g.addColorStop(1,"#300000");
      ctx.shadowColor="rgba(220,40,40,1)";ctx.shadowBlur=glow*2.5;ctx.fillStyle=g;
      ctx.beginPath();ctx.moveTo(0,-14);ctx.lineTo(8,-4);ctx.lineTo(12,0);ctx.lineTo(8,4);
      ctx.lineTo(0,14);ctx.lineTo(-8,4);ctx.lineTo(-12,0);ctx.lineTo(-8,-4);ctx.closePath();ctx.fill();
      ctx.shadowBlur=0;ctx.fillStyle="rgba(255,220,220,0.95)";ctx.beginPath();ctx.arc(0,0,3.5,0,Math.PI*2);ctx.fill();
      ctx.rotate(-item.pulse*0.35);
      ctx.fillStyle="rgba(255,120,120,0.85)";ctx.font="bold 9px 'Courier New'";ctx.textAlign="center";
      ctx.fillText(item.label,0,28);ctx.restore();
    }
    for(const bat of r.batteries){
      if(bat.collected) continue;
      ctx.save();ctx.translate(bat.x,bat.y);
      ctx.shadowColor="rgba(200,210,80,0.6)";ctx.shadowBlur=10;
      ctx.fillStyle="#2a2618";ctx.strokeStyle="#a09028";ctx.lineWidth=1.5;
      ctx.fillRect(-12,-7,24,14);ctx.strokeRect(-12,-7,24,14);
      ctx.fillStyle="#c0b032";ctx.fillRect(12,-4,5,8);
      ctx.fillStyle="#7a7820";ctx.fillRect(-10,-4,18,8);
      ctx.fillStyle="#d0c038";ctx.fillRect(-10,-4,7,8);
      ctx.restore();
    }
    for(const med of r.medkits){
      if(med.collected) continue;
      ctx.save();ctx.translate(med.x,med.y);
      ctx.shadowColor="rgba(190,70,70,0.6)";ctx.shadowBlur=10;
      ctx.fillStyle="#1a0c0c";ctx.strokeStyle="#882020";ctx.lineWidth=1.5;
      ctx.fillRect(-13,-10,26,20);ctx.strokeRect(-13,-10,26,20);
      ctx.fillStyle="#aa2828";ctx.fillRect(-3,-8,6,16);ctx.fillRect(-10,-3,20,6);ctx.restore();
    }
  }

  function drawHidingSpots(ctx, r) {
    for(const h of r.hidingSpots){
      const near=dist(h,r.player)<52;
      ctx.save();ctx.translate(h.x,h.y);
      ctx.fillStyle="#0c0a14";
      ctx.strokeStyle=near?"rgba(150,170,255,0.55)":"rgba(255,255,255,0.14)";ctx.lineWidth=2;
      ctx.fillRect(-21,-32,42,64);ctx.strokeRect(-21,-32,42,64);
      ctx.strokeStyle=near?"rgba(150,170,255,0.3)":"rgba(255,255,255,0.08)";ctx.lineWidth=0.8;
      ctx.beginPath();ctx.moveTo(0,-30);ctx.lineTo(0,30);ctx.stroke();
      ctx.fillStyle=near?"rgba(170,190,255,0.6)":"rgba(255,255,255,0.22)";
      ctx.beginPath();ctx.arc(9,2,4,0,Math.PI*2);ctx.fill();
      if(near){ctx.fillStyle="rgba(170,190,255,0.8)";ctx.font="bold 9px 'Courier New'";ctx.textAlign="center";ctx.fillText("[SPACE]",0,46);}
      ctx.restore();
    }
  }

  function drawExit(ctx, r) {
    if(!r.exit.active) return;
    const pulse=Math.sin(r.exit.pulse||0)*0.3+0.7;
    ctx.save();ctx.translate(r.exit.x,r.exit.y);
    // Glow aura
    const grd=ctx.createRadialGradient(0,0,8,0,0,100);
    grd.addColorStop(0,`rgba(60,255,100,${0.18*pulse})`);grd.addColorStop(1,"rgba(0,0,0,0)");
    ctx.fillStyle=grd;ctx.beginPath();ctx.arc(0,0,100,0,Math.PI*2);ctx.fill();
    ctx.shadowColor=`rgba(70,255,110,${0.8*pulse})`;ctx.shadowBlur=24*pulse;
    ctx.strokeStyle=`rgba(80,255,120,${0.9*pulse})`;ctx.lineWidth=3;
    ctx.strokeRect(-30,-48,60,96);ctx.fillStyle="rgba(6,22,10,0.9)";ctx.fillRect(-28,-46,56,92);
    ctx.fillStyle=`rgba(100,255,140,${pulse})`;ctx.font="bold 14px 'Courier New'";ctx.textAlign="center";
    ctx.fillText("EXIT",0,-18);
    ctx.strokeStyle=`rgba(100,255,140,${0.85*pulse})`;ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,24);ctx.moveTo(-8,16);ctx.lineTo(0,24);ctx.lineTo(8,16);ctx.stroke();
    ctx.restore();
  }

  function drawNoise(ctx, r) {
    for(const pulse of r.noisePulses){
      ctx.save();
      ctx.strokeStyle=`rgba(255,80,80,${pulse.alpha*0.22})`;ctx.lineWidth=1.8;
      ctx.beginPath();ctx.arc(pulse.x,pulse.y,pulse.r,0,Math.PI*2);ctx.stroke();
      ctx.strokeStyle=`rgba(255,200,200,${pulse.alpha*0.1})`;ctx.lineWidth=0.8;
      ctx.beginPath();ctx.arc(pulse.x,pulse.y,pulse.r*0.5,0,Math.PI*2);ctx.stroke();
      ctx.restore();
    }
  }

  function drawHallucinations(ctx, r) {
    for(const h of r.hallucinations){
      ctx.save();ctx.translate(h.x,h.y);ctx.globalAlpha=clamp(h.timer/900,0,0.8);
      ctx.shadowColor="rgba(255,0,0,0.5)";ctx.shadowBlur=14;
      ctx.fillStyle="rgba(2,1,2,0.98)";ctx.beginPath();ctx.ellipse(0,0,28,42,0,0,Math.PI*2);ctx.fill();
      ctx.shadowBlur=0;ctx.fillStyle="rgba(255,255,255,0.9)";
      ctx.beginPath();ctx.ellipse(-10,-8,5,4,-0.2,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.ellipse(10,-8,5,4,0.2,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#000";ctx.beginPath();ctx.arc(-10,-8,2.5,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(10,-8,2.5,0,Math.PI*2);ctx.fill();
      ctx.restore();
    }
  }

  // ── player ─────────────────────────────────────────────────────────────────
  function drawPlayer(ctx, r) {
    const p=r.player;
    ctx.save();ctx.translate(p.x,p.y);
    // ground shadow
    ctx.fillStyle="rgba(0,0,0,0.5)";ctx.beginPath();ctx.ellipse(2,12,12,4,0,0,Math.PI*2);ctx.fill();
    ctx.rotate(p.angle);
    if(p.hidden) ctx.globalAlpha=0.4;
    const bob=Math.sin(p.bobPhase)*2;
    ctx.save();ctx.translate(0,bob);
    const legSwing=Math.sin(p.bobPhase*2)*6;
    // legs
    ctx.fillStyle=p.invuln>0?"#c06060":"#3a2f58";
    ctx.fillRect(-5,8,4,12+legSwing);ctx.fillRect(2,8,4,12-legSwing);
    // torso
    ctx.fillStyle=p.invuln>0?"#d08888":"#52456e";
    ctx.beginPath();if(ctx.roundRect) ctx.roundRect(-9,-9,18,17,2); else ctx.rect(-9,-9,18,17); ctx.fill();
    // arm swing
    const armSwing=Math.sin(p.bobPhase*2)*7;
    ctx.fillStyle=p.invuln>0?"#c06060":"#3a2f58";
    ctx.fillRect(-14,-5+armSwing,4,10);ctx.fillRect(10,-5-armSwing,4,10);
    // head
    ctx.fillStyle=p.invuln>0?"#d09898":"#6a5882";
    ctx.beginPath();ctx.arc(0,-15,9,0,Math.PI*2);ctx.fill();
    // face dot (direction indicator)
    ctx.fillStyle="rgba(255,255,255,0.7)";ctx.beginPath();ctx.arc(5,-15,2.5,0,Math.PI*2);ctx.fill();
    // flashlight
    if(!p.flashlightOff&&p.battery>0){
      ctx.fillStyle="rgba(215,205,175,0.95)";ctx.fillRect(9,-3,16,6);
      ctx.fillStyle="rgba(255,250,220,0.8)";ctx.beginPath();ctx.arc(25,0,4,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();ctx.restore();
  }

  // ── monster — drawn AFTER lighting so it's always visible ─────────────────
  function drawMonster(ctx, r, cam) {
    const m=r.monster, p=r.player;
    const sameZone=sameVisibilityZone(r.map,p,m);
    const d=dist(m,p);
    const chasing=m.mode==="chase"||r.finalPhase;

    // Visibility: show when in same zone, chasing, close, or high fear
    // Always show at least a faint silhouette when chasing
    const baseOpacity = chasing ? 1 :
                        sameZone ? clamp(1-(d/500),0.2,1) :
                        d < 200 ? clamp(1-(d/200),0.1,0.6) :
                        p.fear > 70 ? 0.2 : 0;
    if(baseOpacity <= 0) return;

    // When chasing, subtle flicker but never goes fully invisible
    const flicker = chasing ? (Math.random()<0.08 ? rand(0.7,1) : 1)
                             : (Math.random()<0.15 ? rand(0.5,1) : 1);
    const opacity = baseOpacity * flicker;

    const lp=m.limbPhase||0;

    ctx.save();ctx.translate(m.x,m.y);
    ctx.globalAlpha=opacity;
    ctx.rotate((m.dirAngle||0)-Math.PI/2);

    // Drop shadow under monster
    ctx.globalAlpha=opacity*0.4;
    ctx.fillStyle="#000";ctx.beginPath();ctx.ellipse(0,24,20,8,0,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=opacity;

    // ─ Spindly legs (4) ─
    ctx.strokeStyle=chasing?"#1a0a0a":"#0c0a10";
    ctx.lineWidth=4;ctx.lineCap="round";
    for(let i=0;i<4;i++){
      const side=i<2?-1:1, off=(i%2)*12-6, swing=Math.sin(lp+i*1.5)*16;
      ctx.beginPath();ctx.moveTo(side*8,off);ctx.quadraticCurveTo(side*28,off+10+swing,side*22,off+32+swing);ctx.stroke();
    }

    // ─ Body ─
    // Use a lighter fill so the shape reads against dark floor
    const bodyColor = chasing ? "#2a0505" : "#1a1522";
    const rimColor  = chasing ? "rgba(200,20,20,0.55)" : "rgba(100,80,120,0.35)";
    ctx.fillStyle=bodyColor;
    ctx.beginPath();ctx.ellipse(0,-6,17,30,0,0,Math.PI*2);ctx.fill();
    // Rim highlight
    ctx.strokeStyle=rimColor;ctx.lineWidth=2;
    ctx.beginPath();ctx.ellipse(0,-6,17,30,0,0,Math.PI*2);ctx.stroke();

    // ─ Neck ─
    ctx.fillStyle=chasing?"#220404":"#130e1c";
    ctx.fillRect(-5,-38,10,14);

    // ─ Head ─
    ctx.fillStyle=chasing?"#280505":"#1a1428";
    ctx.beginPath();ctx.ellipse(0,-50,16,21,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=rimColor;ctx.lineWidth=1.5;
    ctx.beginPath();ctx.ellipse(0,-50,16,21,0,0,Math.PI*2);ctx.stroke();

    // ─ Eyes — large and unmissable ─
    const eyeColor = chasing ? "#ff2020" : "#eeeeee";
    const eyeGlow  = chasing ? "rgba(255,0,0,0.9)" : "rgba(200,200,255,0.7)";
    ctx.fillStyle=eyeColor;
    ctx.shadowColor=eyeGlow; ctx.shadowBlur=chasing?18:10;
    ctx.beginPath();
    ctx.ellipse(-6,-53,5,3.5,-0.25,0,Math.PI*2);ctx.fill();
    ctx.beginPath();
    ctx.ellipse(6,-53,5,3.5,0.25,0,Math.PI*2);ctx.fill();
    ctx.shadowBlur=0;
    // Pupils
    ctx.fillStyle="#000";
    ctx.beginPath();ctx.arc(-6,-53,2.5,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(6,-53,2.5,0,Math.PI*2);ctx.fill();

    // ─ Long dragging arms ─
    const armCol=chasing?"#1e0303":"#110e18";
    ctx.strokeStyle=armCol;ctx.lineWidth=5;ctx.lineCap="round";
    const armSwing=Math.sin(lp)*11;
    ctx.beginPath();ctx.moveTo(-14,-18);ctx.quadraticCurveTo(-32,10+armSwing,-26,46+armSwing);ctx.stroke();
    ctx.beginPath();ctx.moveTo(14,-18);ctx.quadraticCurveTo(32,10-armSwing,26,46-armSwing);ctx.stroke();
    // Rim on arms
    ctx.strokeStyle=rimColor;ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(-14,-18);ctx.quadraticCurveTo(-32,10+armSwing,-26,46+armSwing);ctx.stroke();
    ctx.beginPath();ctx.moveTo(14,-18);ctx.quadraticCurveTo(32,10-armSwing,26,46-armSwing);ctx.stroke();

    // ─ Claw fingers ─
    ctx.strokeStyle=chasing?"rgba(180,20,20,0.7)":"rgba(120,100,140,0.5)";ctx.lineWidth=1.5;
    for(let f=0;f<3;f++){
      ctx.beginPath();ctx.moveTo(-26+f*5,46+armSwing);ctx.lineTo(-30+f*6,58+armSwing);ctx.stroke();
      ctx.beginPath();ctx.moveTo(26-f*5,46-armSwing);ctx.lineTo(30-f*6,58-armSwing);ctx.stroke();
    }

    ctx.restore();

    // ─ Chase proximity indicator: red vignette pulse around screen edges ─
    if(chasing && cam){
      const screenX=m.x-cam.x, screenY=m.y-cam.y;
      const onScreen=screenX>-60&&screenX<CANVAS_W+60&&screenY>-60&&screenY<CANVAS_H+60;
      if(!onScreen){
        // Show an off-screen arrow indicator
        ctx.save();
        ctx.setTransform(1,0,0,1,0,0);
        const ang=Math.atan2(screenY-CANVAS_H/2, screenX-CANVAS_W/2);
        const arrowX=CANVAS_W/2+Math.cos(ang)*260, arrowY=CANVAS_H/2+Math.sin(ang)*180;
        ctx.globalAlpha=0.75+Math.sin(r.time*0.008)*0.25;
        ctx.fillStyle="#ff2020";
        ctx.shadowColor="rgba(255,0,0,0.8)";ctx.shadowBlur=12;
        ctx.save();ctx.translate(arrowX,arrowY);ctx.rotate(ang);
        ctx.beginPath();ctx.moveTo(18,0);ctx.lineTo(-8,-7);ctx.lineTo(-4,0);ctx.lineTo(-8,7);ctx.closePath();ctx.fill();
        ctx.restore();
        ctx.shadowBlur=0;ctx.restore();
      }
    }
  }

  // ── lighting ───────────────────────────────────────────────────────────────
  // Uses an offscreen canvas with destination-out to carve light from darkness.
  // Flashlight is much brighter and wider so the player can actually see.
  function drawLighting(ctx, r, cam) {
    const p=r.player;
    const px=p.x-cam.x, py=p.y-cam.y;

    const dk=document.createElement("canvas");
    dk.width=CANVAS_W; dk.height=CANVAS_H;
    const dc=dk.getContext("2d");

    // Darkness: slightly less than pitch black so you can vaguely see walls
    dc.fillStyle="rgba(0,0,0,0.96)";dc.fillRect(0,0,CANVAS_W,CANVAS_H);

    const currentZone=getZoneAt(r.map,p,6);
    const revealZones=r.map.walkable.filter(zone=>{
      if(!currentZone) return rectDistanceToPoint(zone,p)<130;
      if(zone.id===currentZone.id) return true;
      if(zonesTouch(zone,currentZone)&&rectDistanceToPoint(zone,p)<100) return true;
      return false;
    });

    dc.globalCompositeOperation="destination-out";

    for(const zone of revealZones){
      dc.save();
      dc.beginPath();dc.rect(zone.x-cam.x,zone.y-cam.y,zone.w,zone.h);dc.clip();

      // Ambient glow: much larger base radius so you can always see the room
      const baseR = p.flashlightOff ? 70 : 110 + p.battery*0.7;
      const radius = clamp(baseR - p.fear*0.25, 55, 180);

      const amb=dc.createRadialGradient(px,py,8,px,py,radius);
      amb.addColorStop(0,"rgba(255,255,255,0.95)");
      amb.addColorStop(0.4,"rgba(255,255,255,0.6)");
      amb.addColorStop(0.75,"rgba(255,255,255,0.15)");
      amb.addColorStop(1,"rgba(255,255,255,0)");
      dc.fillStyle=amb;dc.beginPath();dc.arc(px,py,radius,0,Math.PI*2);dc.fill();

      // Flashlight cone
      if(!p.flashlightOff&&p.battery>0){
        const fearFlicker=Math.random()<p.fear/500?rand(0.55,0.95):1;
        // Significantly longer cone
        const coneLen=clamp(280+p.battery*1.1-p.fear*0.8,160,420)*fearFlicker;
        const coneW=0.46;

        // Outer wide soft beam
        const cG=dc.createRadialGradient(px,py,16,px,py,coneLen);
        cG.addColorStop(0,"rgba(255,255,255,0.85)");
        cG.addColorStop(0.35,"rgba(255,248,230,0.55)");
        cG.addColorStop(0.7,"rgba(255,240,200,0.2)");
        cG.addColorStop(1,"rgba(255,255,255,0)");
        dc.fillStyle=cG;dc.beginPath();dc.moveTo(px,py);
        dc.arc(px,py,coneLen,p.angle-coneW,p.angle+coneW);dc.closePath();dc.fill();

        // Tight bright core
        const core=dc.createRadialGradient(px,py,5,px,py,coneLen*0.55);
        core.addColorStop(0,"rgba(255,255,255,0.65)");core.addColorStop(1,"rgba(255,255,255,0)");
        dc.fillStyle=core;dc.beginPath();dc.moveTo(px,py);
        dc.arc(px,py,coneLen*0.55,p.angle-coneW*0.4,p.angle+coneW*0.4);dc.closePath();dc.fill();
      }

      dc.restore();
    }

    dc.globalCompositeOperation="source-over";
    ctx.drawImage(dk,0,0);

    // Vignette
    const vig=ctx.createRadialGradient(CANVAS_W/2,CANVAS_H/2,60,CANVAS_W/2,CANVAS_H/2,600);
    vig.addColorStop(0,"rgba(0,0,0,0)");vig.addColorStop(0.5,"rgba(0,0,0,0.18)");vig.addColorStop(1,"rgba(0,0,0,0.88)");
    ctx.fillStyle=vig;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);

    // Fear: red tint grows
    if(p.fear>40){
      ctx.fillStyle=`rgba(60,0,0,${(p.fear-40)/100*0.28})`;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
    }
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
    ctx.strokeStyle="rgba(255,255,255,0.08)";ctx.lineWidth=0.8;rrect(ctx,x,y,w,h,2.5);ctx.stroke();
    ctx.fillStyle="rgba(175,175,175,0.7)";ctx.font="bold 8px 'Courier New'";ctx.textAlign="left";
    ctx.fillText(label,x+w+8,y+h-1);
  }

  function drawObjectiveCompass(ctx, r, objective, distance) {
    if(!objective) return;
    const p=r.player;
    const angle=Math.atan2(objective.y-p.y,objective.x-p.x);
    const pulse=0.65+Math.sin(r.objectiveBlink/200)*0.25;
    const cx2=CANVAS_W-82, cy2=88;
    ctx.save();
    ctx.strokeStyle="rgba(160,50,50,0.3)";ctx.lineWidth=1;
    ctx.beginPath();ctx.arc(cx2,cy2,24,0,Math.PI*2);ctx.stroke();
    ctx.translate(cx2,cy2);ctx.rotate(angle);ctx.globalAlpha=pulse;
    ctx.fillStyle=r.exit.active?"#50ff80":"#ff9090";
    ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=9;
    ctx.beginPath();ctx.moveTo(22,0);ctx.lineTo(-10,-8);ctx.lineTo(-5,0);ctx.lineTo(-10,8);ctx.closePath();ctx.fill();
    ctx.shadowBlur=0;ctx.restore();
    ctx.save();ctx.textAlign="center";ctx.fillStyle="rgba(200,180,180,0.7)";ctx.font="10px 'Courier New'";
    ctx.fillText(r.exit.active?"EXIT":"SIGNAL",cx2,cy2+36);ctx.fillText(`${distance}m`,cx2,cy2+48);ctx.restore();
  }

  function drawHUD(ctx, r) {
    const p=r.player, objective=getObjective(r);
    const objDist=objective?Math.round(dist(p,objective)):0;
    ctx.save();

    // ── left stat panel ──
    const px2=18,py2=18,pw=244,ph=158;
    ctx.fillStyle="rgba(3,2,8,0.82)";rrect(ctx,px2,py2,pw,ph,5);ctx.fill();
    ctx.strokeStyle="rgba(165,50,50,0.38)";ctx.lineWidth=1;rrect(ctx,px2,py2,pw,ph,5);ctx.stroke();
    ctx.fillStyle="rgba(165,22,22,0.9)";ctx.fillRect(px2+5,py2+1,pw-10,2.5);
    ctx.fillStyle="rgba(195,72,72,0.95)";ctx.font="bold 10px 'Courier New'";ctx.textAlign="left";
    ctx.fillText("◈ SOMETHING HEARD YOU",px2+11,py2+18);
    ctx.strokeStyle="rgba(165,50,50,0.2)";ctx.lineWidth=0.8;
    ctx.beginPath();ctx.moveTo(px2+8,py2+24);ctx.lineTo(px2+pw-8,py2+24);ctx.stroke();

    const bx=px2+11, bw=pw-58;
    drawHorrorBar(ctx,bx,py2+34,bw,10,p.battery/100,"#c8b832","#4a4215","BAT");
    drawHorrorBar(ctx,bx,py2+57,bw,10,1-p.fear/100,"#3888d0","#14284a","CALM");
    drawHorrorBar(ctx,bx,py2+80,bw,10,p.stamina/100,"#808080","#2a2a2a","STM");

    ctx.fillStyle="rgba(135,135,135,0.68)";ctx.font="9px 'Courier New'";ctx.fillText("VITAL",bx,py2+108);
    for(let i=0;i<3;i++){
      ctx.fillStyle=i<p.hp?"rgba(175,22,22,0.97)":"rgba(55,22,22,0.5)";
      ctx.font="18px monospace";ctx.fillText("♥",bx+i*26,py2+134);
    }
    if(p.hidden){
      ctx.fillStyle="rgba(100,130,220,0.85)";ctx.font="bold 9px 'Courier New'";ctx.textAlign="center";
      ctx.fillText("⬛ CONCEALED",px2+pw/2,py2+ph+16);
    }

    // ── fragment counter ──
    const fcW=165,fcH=46;
    ctx.fillStyle="rgba(3,2,8,0.82)";rrect(ctx,CANVAS_W-fcW-18,18,fcW,fcH,5);ctx.fill();
    ctx.strokeStyle="rgba(165,50,50,0.38)";ctx.lineWidth=1;rrect(ctx,CANVAS_W-fcW-18,18,fcW,fcH,5);ctx.stroke();
    ctx.textAlign="right";ctx.fillStyle="rgba(195,72,72,0.92)";ctx.font="bold 10px 'Courier New'";
    ctx.fillText("FRAGMENTS",CANVAS_W-26,35);
    ctx.fillStyle=r.collected===ITEM_COUNT?"rgba(60,240,100,0.95)":"rgba(225,175,175,0.92)";
    ctx.font="bold 22px 'Courier New'";ctx.fillText(`${r.collected} / ${ITEM_COUNT}`,CANVAS_W-26,56);

    drawObjectiveCompass(ctx,r,objective,objDist);

    // ── final phase strip ──
    if(r.finalPhase){
      const tp=Math.sin(r.time*0.004)*0.35+0.65;
      ctx.fillStyle=`rgba(120,0,0,${0.3*tp})`;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
      ctx.textAlign="center";ctx.fillStyle=`rgba(255,60,60,${tp*0.95})`;ctx.font="bold 13px 'Courier New'";
      ctx.shadowColor="rgba(255,0,0,0.4)";ctx.shadowBlur=12;
      ctx.fillText("▶  RUN TO THE EXIT  ◀",CANVAS_W/2,36);ctx.shadowBlur=0;
    }

    // ── heartbeat proximity dread ──
    const md=dist(p,r.monster);
    if(md<350){
      const hbIntensity=clamp((350-md)/350,0,1);
      const hbPulse=Math.sin(r.heartbeatPhase*Math.PI*2);
      if(hbPulse>0.7){
        ctx.fillStyle=`rgba(80,0,0,${hbIntensity*hbPulse*0.12})`;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
      }
    }

    // ── message bar ──
    if(r.message){
      const mW=560,mH=36,mX=CANVAS_W/2-mW/2,mY=CANVAS_H-58;
      ctx.fillStyle="rgba(3,2,8,0.78)";rrect(ctx,mX,mY,mW,mH,4);ctx.fill();
      ctx.strokeStyle="rgba(155,55,55,0.25)";ctx.lineWidth=0.8;rrect(ctx,mX,mY,mW,mH,4);ctx.stroke();
      ctx.textAlign="center";ctx.fillStyle="rgba(210,190,190,0.92)";ctx.font="12px 'Courier New'";
      ctx.fillText(r.message,CANVAS_W/2,mY+23);
    }
    ctx.restore();
  }

  // ── overlays ───────────────────────────────────────────────────────────────
  function drawOverlays(ctx, r) {
    const fear=r.player.fear/100;

    // Scanlines
    if(fear>0.4){ctx.save();ctx.globalAlpha=(fear-0.4)*0.1;for(let y=0;y<CANVAS_H;y+=3){ctx.fillStyle="rgba(0,0,0,0.7)";ctx.fillRect(0,y,CANVAS_W,1);}ctx.restore();}

    // Static noise
    if(fear>0.5){ctx.save();ctx.globalAlpha=(fear-0.5)*0.22;for(let i=0;i<55;i++){ctx.fillStyle=Math.random()>0.5?"rgba(255,255,255,0.9)":"rgba(0,0,0,0.9)";ctx.fillRect(rand(0,CANVAS_W),rand(0,CANVAS_H),rand(1,4),rand(1,3));}ctx.restore();}

    // RGB glitch
    if(r.glitch>0){
      ctx.save();
      for(let i=0;i<Math.floor(r.glitch*10);i++){
        const by2=rand(0,CANVAS_H),bh=rand(2,14),shift=rand(-26,26)*r.glitch;
        ctx.globalAlpha=r.glitch*0.3;
        ctx.fillStyle="rgba(255,0,0,0.45)";ctx.fillRect(shift,by2,CANVAS_W,bh);
        ctx.fillStyle="rgba(0,255,255,0.22)";ctx.fillRect(-shift,by2+1,CANVAS_W,bh-2);
      }
      if(r.glitch>0.5){ctx.globalAlpha=r.glitch*0.4;ctx.fillStyle="rgba(255,255,255,0.12)";ctx.fillRect(rand(CANVAS_W*0.2,CANVAS_W*0.8),0,rand(2,8),CANVAS_H);}
      ctx.restore();
    }

    // Jump scare
    if(r.scare){
      const progress=r.scare.timer/1100, alpha=clamp(progress*1.4,0,1), scl=1+(1-progress)*0.7;
      ctx.save();
      if(progress>0.88){ctx.fillStyle=`rgba(255,255,255,${(progress-0.88)*6*0.6})`;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);}
      ctx.fillStyle=`rgba(0,0,0,${0.5+alpha*0.36})`;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
      ctx.save();ctx.translate(CANVAS_W/2,CANVAS_H/2-35);ctx.scale(scl,scl);
      const fg=ctx.createRadialGradient(0,0,8,0,0,130);
      fg.addColorStop(0,`rgba(8,5,5,${alpha})`);fg.addColorStop(0.65,`rgba(4,2,2,${alpha})`);fg.addColorStop(1,"rgba(0,0,0,0)");
      ctx.fillStyle=fg;ctx.beginPath();ctx.ellipse(0,0,95,130,0,0,Math.PI*2);ctx.fill();
      const eyeL={x:-30+rand(-3,3),y:-38+rand(-2,2)}, eyeR={x:36+rand(-3,3),y:-33+rand(-2,2)};
      ctx.fillStyle=`rgba(255,255,255,${alpha*0.92})`;ctx.shadowColor="rgba(220,0,0,0.8)";ctx.shadowBlur=16;
      ctx.beginPath();ctx.ellipse(eyeL.x,eyeL.y,14,10,rand(-0.4,0.4),0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.ellipse(eyeR.x,eyeR.y,11,15,rand(-0.4,0.4),0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#000";ctx.shadowBlur=0;
      ctx.beginPath();ctx.arc(eyeL.x,eyeL.y,6.5,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(eyeR.x,eyeR.y,5.5,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=`rgba(255,255,255,${alpha*0.55})`;ctx.lineWidth=4.5;
      ctx.beginPath();ctx.moveTo(-52,28);ctx.quadraticCurveTo(0,80,52,28);ctx.stroke();
      ctx.fillStyle=`rgba(238,228,218,${alpha*0.5})`;
      for(let t=0;t<7;t++) ctx.fillRect(-38+t*12,30,10,18);
      ctx.restore();
      ctx.textAlign="center";ctx.fillStyle=`rgba(255,255,255,${alpha*0.97})`;
      ctx.shadowColor="rgba(230,0,0,0.45)";ctx.shadowBlur=22;
      ctx.font=`bold ${Math.floor(52+(1-progress)*22)}px 'Courier New'`;
      ctx.fillText(r.scare.text,CANVAS_W/2,CANVAS_H-74);ctx.shadowBlur=0;
      ctx.restore();
    }

    // Start / death / win
    if(!started||r.dead||r.won){
      ctx.save();ctx.fillStyle="rgba(0,0,0,0.88)";ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
      for(let i=0;i<16;i++){ctx.fillStyle=`rgba(48,8,8,${rand(0.02,0.06)})`;ctx.fillRect(0,rand(0,CANVAS_H),CANVAS_W,rand(1,3));}
      const cx2=CANVAS_W/2, cy2=CANVAS_H/2;ctx.textAlign="center";

      if(!started){
        ctx.fillStyle="rgba(130,18,18,0.09)";ctx.font="bold 130px 'Courier New'";ctx.fillText("SHY",cx2,cy2+50);
        ctx.shadowColor="rgba(175,22,22,0.55)";ctx.shadowBlur=30;ctx.fillStyle="rgba(220,85,85,0.98)";
        ctx.font="bold 40px 'Courier New'";ctx.fillText("SOMETHING HEARD YOU",cx2,cy2-56);ctx.shadowBlur=0;
        ctx.fillStyle="rgba(172,152,152,0.74)";ctx.font="13px 'Courier New'";
        ctx.fillText("A dark horror roguelike. Follow the compass. Do not let it hear you.",cx2,cy2-10);
        ctx.fillText("WASD move  ·  Mouse aim flashlight  ·  Shift sprint  ·  E interact",cx2,cy2+14);
        ctx.fillText("F flashlight toggle  ·  Space hide in locker  ·  Collect 6 fragments then escape.",cx2,cy2+36);
        const p2=(Math.sin(Date.now()*0.003)*0.3)+0.7;
        ctx.fillStyle=`rgba(192,62,62,${p2})`;ctx.font="bold 15px 'Courier New'";
        ctx.fillText("[ CLICK OR PRESS START ]",cx2,cy2+84);
      } else if(r.dead){
        ctx.shadowColor="rgba(130,0,0,0.65)";ctx.shadowBlur=38;ctx.fillStyle="rgba(192,52,52,0.98)";
        ctx.font="bold 50px 'Courier New'";ctx.fillText("YOU WERE HEARD",cx2,cy2-36);ctx.shadowBlur=0;
        ctx.fillStyle="rgba(172,135,135,0.74)";ctx.font="14px 'Courier New'";ctx.fillText("The dark learned your name.",cx2,cy2+8);
        ctx.fillStyle="rgba(118,92,92,0.56)";ctx.font="12px 'Courier New'";ctx.fillText(`Fragments: ${r.collected} / ${ITEM_COUNT}`,cx2,cy2+34);
        ctx.fillStyle="rgba(172,70,70,0.8)";ctx.font="bold 13px 'Courier New'";ctx.fillText("[ RESTART ]",cx2,cy2+76);
      } else if(r.won){
        ctx.shadowColor="rgba(55,175,75,0.55)";ctx.shadowBlur=30;ctx.fillStyle="rgba(95,218,135,0.98)";
        ctx.font="bold 50px 'Courier New'";ctx.fillText("YOU ESCAPED",cx2,cy2-36);ctx.shadowBlur=0;
        ctx.fillStyle="rgba(148,192,158,0.74)";ctx.font="14px 'Courier New'";ctx.fillText("But the signal is still active.",cx2,cy2+8);
        ctx.fillStyle="rgba(112,152,122,0.56)";ctx.font="12px 'Courier New'";ctx.fillText("Something followed you out.",cx2,cy2+34);
        ctx.fillStyle="rgba(88,168,108,0.8)";ctx.font="bold 13px 'Courier New'";ctx.fillText("[ RESTART ]",cx2,cy2+76);
      }
      ctx.restore();
    }
  }

  // ── input ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const down=(e)=>{
      const key=e.key.toLowerCase();
      keysRef.current[key]=true;
      if(["w","a","s","d"," ","shift","e","f"].includes(key)) e.preventDefault();
      if(key==="f"){const r=runRef.current;if(!r||r.dead||r.won)return;r.player.flashlightOff=!r.player.flashlightOff;r.message=r.player.flashlightOff?"Flashlight off.":"Flashlight on.";}
      if(key==="e") interact();
      if(key===" "){
        const r=runRef.current;if(!r||r.dead||r.won)return;
        const near=r.hidingSpots.find(s=>dist(s,r.player)<46);
        if(near){r.player.hidden=!r.player.hidden;r.message=r.player.hidden?"You hold your breath.":"You step out.";if(!r.player.hidden) createNoise(r,r.player.x,r.player.y,185);}
        else r.message="No locker nearby.";
      }
    };
    const up=(e)=>{keysRef.current[e.key.toLowerCase()]=false;};
    const move=(e)=>{
      const canvas=canvasRef.current;if(!canvas)return;
      const rect=canvas.getBoundingClientRect();
      mouseRef.current={x:((e.clientX-rect.left)/rect.width)*CANVAS_W,y:((e.clientY-rect.top)/rect.height)*CANVAS_H};
    };
    window.addEventListener("keydown",down);window.addEventListener("keyup",up);window.addEventListener("mousemove",move);
    return()=>{window.removeEventListener("keydown",down);window.removeEventListener("keyup",up);window.removeEventListener("mousemove",move);};
  },[]);

  useEffect(()=>{
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
  },[started]);

  return (
    <div className="shy-page">
      <div className="shy-shell">
        <div className="shy-header">
          <div>
            <p className="shy-kicker">◈ Signal Detected ◈</p>
            <h1>Something Heard You</h1>
            <p>A dark horror roguelike. Explore the facility. Collect 6 fragments. Escape before it finds you.</p>
          </div>
          <div className="shy-actions">
            <button onClick={started?restart:()=>setStarted(true)}>{started?"Restart Run":"Start Run"}</button>
            {onExit&&<button className="shy-secondary" onClick={onExit}>Back</button>}
          </div>
        </div>
        <div className="shy-game-card">
          <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} className="shy-canvas"
            onClick={()=>{if(!started)setStarted(true);}} />
          <div className="shy-controls">
            <span>WASD · move</span><span>Mouse · aim light</span><span>Shift · sprint</span>
            <span>E · interact</span><span>F · flashlight</span><span>Space · hide</span>
          </div>
        </div>
        <div className="shy-notes">
          <div>
            <h3>Objective</h3>
            <p>Collect 6 signal fragments — the red compass arrow points to the nearest. After all 6, the exit opens and the monster hunts aggressively.</p>
          </div>
          <div>
            <h3>The Monster</h3>
            <p>It fully chases when it shares your room or hallway. A red arrow shows its direction when off-screen. Running creates noise that attracts it.</p>
          </div>
          <div>
            <h3>Survival</h3>
            <p>Darkness and proximity raise fear. High fear worsens flashlight range, adds screen glitches, and triggers jump scares. Lockers hide you — sometimes.</p>
          </div>
        </div>
      </div>
    </div>
  );
}