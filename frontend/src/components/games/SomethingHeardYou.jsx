import React, { useEffect, useMemo, useRef, useState } from "react";
import "../../styles/SomethingHeardYou.css";

// ─── Constants ────────────────────────────────────────────────────────────────
const CANVAS_W = 980;
const CANVAS_H = 620;
const CELL = 96;
const MAP_W = 25;
const MAP_H = 25;
const FOV = Math.PI / 2.5;
const RAYS = 480;
const MAX_DEPTH = CELL * 18;
const ITEM_COUNT = 6;
const MAX_FLOORS = 5;

// ─── Pure helpers ─────────────────────────────────────────────────────────────
const clamp = (v, mn, mx) => Math.max(mn, Math.min(mx, v));
const rand = (mn, mx) => Math.random() * (mx - mn) + mn;
const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const normAng = (a) => {
  while (a < -Math.PI) a += Math.PI * 2;
  while (a > Math.PI) a -= Math.PI * 2;
  return a;
};

// ─── Upgrade pool ─────────────────────────────────────────────────────────────
const UPGRADE_POOL = [
  { key: "quiet",   name: "Soft Step",     desc: "Footstep noise range -18%.", max: 4 },
  { key: "battery", name: "Deep Cell",     desc: "Battery capacity +20, drains slower.", max: 4 },
  { key: "stamina", name: "Iron Lungs",    desc: "Stamina +18, faster recovery.", max: 4 },
  { key: "sanity",  name: "Cold Nerves",   desc: "More sanity, less panic from dark.", max: 4 },
  { key: "camera",  name: "Brighter Flash",desc: "Camera stun range and duration up.", max: 3 },
  { key: "flare",   name: "Hotter Flares", desc: "Flares last longer, distract harder.", max: 3 },
  { key: "map",     name: "Dead Reckoning",desc: "Compass and security pings last longer.", max: 3 },
  { key: "life",    name: "Refuse Death",  desc: "Gain +1 maximum life once.", max: 1 },
];

// ─── Floor themes ─────────────────────────────────────────────────────────────
const FLOOR_THEMES = [
  { name:"Asylum",        wallA:"#46333b", wallB:"#22151d", floor:"#0c080a", ceiling:"#070406", fog:[16,2,4],   eye:[255,24,24],    monsterName:"The Crawler",  monsterDesc:"Slow. Quiet. Watches from corners.", prefix:"PATIENT" },
  { name:"Morgue",        wallA:"#31434a", wallB:"#10191d", floor:"#071014", ceiling:"#05090d", fog:[0,12,22],  eye:[126,213,255],  monsterName:"The Watcher",  monsterDesc:"Teleports near motionless players.", prefix:"CASE" },
  { name:"Sewers",        wallA:"#33412b", wallB:"#10180a", floor:"#060a04", ceiling:"#040604", fog:[0,20,5],   eye:[84,255,84],    monsterName:"The Mimic",    monsterDesc:"Creates fake footsteps.", prefix:"LOG" },
  { name:"Hotel",         wallA:"#4c2524", wallB:"#170808", floor:"#100504", ceiling:"#070202", fog:[30,0,0],   eye:[255,126,70],   monsterName:"The Stalker",  monsterDesc:"Only attacks in darkness.", prefix:"ROOM" },
  { name:"Listening Room",wallA:"#4a1830", wallB:"#10020a", floor:"#080205", ceiling:"#030103", fog:[26,0,14],  eye:[255,42,143],   monsterName:"The Listener", monsterDesc:"Every sound is bigger. Every mistake is permanent.", prefix:"TRANSCRIPT" },
];

const LORE_TEXTS = [
  ["PATIENT 047 — I can hear it breathing in the walls at night.","PATIENT 012 — It stood in my doorway for four hours. My roommate's bed was empty by morning.","STAFF NOTE — Ward C is wrong. Three missing in two weeks. Doors locked from inside."],
  ["CASE 14 — Subject found in cold storage Room 7. Eyes open. Body temperature below the room.","CASE 31 — Camera failure 02:14 to 02:19. When footage resumes, Dr. Mercer is gone.","AUTOPSY NOTE — I have never seen wounds like these. I will not be returning."],
  ["LOG 003 — Tapping on the pipes. Morse code. STILL HERE.","LOG 017 — It can smell fear. I have been in this pipe for three days.","LOG 029 — Do not touch the walls. Do not make noise. Do not stop moving."],
  ["ROOM 606 — Checked out in 1983. Calls the front desk every night.","HOUSEKEEPING — Do not open rooms with red light under the door.","MANAGER — The elevator goes below the basement when the building is empty."],
  ["TRANSCRIPT 1 — It heard me thinking.","TRANSCRIPT 4 — Footsteps detected inside the observation glass.","FINAL TRANSCRIPT — If it stops chasing, that means it is listening."],
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function lightenHex(hex, amt = 0.2) {
  const raw = String(hex || "#000000").replace("#", "");
  if (raw.length !== 6) return hex;
  const n = parseInt(raw, 16);
  const r = clamp(((n >> 16) & 255) + 255 * amt, 0, 255);
  const g = clamp(((n >>  8) & 255) + 255 * amt, 0, 255);
  const b = clamp((n         & 255) + 255 * amt, 0, 255);
  return `rgb(${Math.floor(r)},${Math.floor(g)},${Math.floor(b)})`;
}

function hexToRgb(hex) {
  const n = parseInt(String(hex).replace("#",""), 16);
  return [(n>>16)&255,(n>>8)&255,n&255];
}

function defaultUpgrades() { return { quiet:0,battery:0,stamina:0,sanity:0,camera:0,flare:0,map:0,life:0 }; }
function statMax(upgrades, key) {
  const up = upgrades || defaultUpgrades();
  if (key==="battery") return 100 + up.battery * 20;
  if (key==="stamina") return 100 + up.stamina * 18;
  if (key==="sanity")  return 100 + up.sanity  * 15;
  if (key==="hp")      return 3   + up.life;
  return 100;
}
function chooseUpgradeOptions(player) {
  const up = player?.upgrades || defaultUpgrades();
  return UPGRADE_POOL.filter(u => (up[u.key]||0) < u.max).sort(()=>Math.random()-0.5).slice(0,3);
}

// ─── Maze ─────────────────────────────────────────────────────────────────────
function makeMaze() {
  const grid = Array.from({length:MAP_H}, ()=>Array(MAP_W).fill(1));
  const stack = [{x:1,y:1}];
  grid[1][1] = 0;
  while (stack.length) {
    const cur = stack[stack.length-1];
    const dirs = [{x:2,y:0},{x:-2,y:0},{x:0,y:2},{x:0,y:-2}].sort(()=>Math.random()-0.5);
    let carved = false;
    for (const d of dirs) {
      const nx=cur.x+d.x, ny=cur.y+d.y;
      if (nx>0&&ny>0&&nx<MAP_W-1&&ny<MAP_H-1&&grid[ny][nx]===1) {
        grid[cur.y+d.y/2][cur.x+d.x/2]=0; grid[ny][nx]=0;
        stack.push({x:nx,y:ny}); carved=true; break;
      }
    }
    if (!carved) stack.pop();
  }
  for (let y=2;y<MAP_H-2;y++) for(let x=2;x<MAP_W-2;x++) if(grid[y][x]===1&&Math.random()<0.12) grid[y][x]=0;
  for (let i=0;i<18;i++) {
    const rx=2+Math.floor(Math.random()*(MAP_W-5)), ry=2+Math.floor(Math.random()*(MAP_H-5));
    const rw=2+Math.floor(Math.random()*3), rh=2+Math.floor(Math.random()*3);
    for(let yy=ry;yy<ry+rh&&yy<MAP_H-1;yy++) for(let xx=rx;xx<rx+rw&&xx<MAP_W-1;xx++) grid[yy][xx]=0;
  }
  grid[1][1]=0; grid[MAP_H-2][MAP_W-2]=0;
  return grid;
}

function isWall(grid, x, y) {
  const gx=Math.floor(x/CELL), gy=Math.floor(y/CELL);
  return gx<0||gy<0||gx>=MAP_W||gy>=MAP_H||grid[gy][gx]===1;
}
function isOpenCell(grid,gx,gy) { return gx>0&&gy>0&&gx<MAP_W-1&&gy<MAP_H-1&&grid[gy][gx]===0; }
function cellCenter(gx,gy) { return {x:gx*CELL+CELL/2, y:gy*CELL+CELL/2}; }
function randomOpenCell(grid, used, minDistFromStart=0) {
  const start = cellCenter(1,1);
  for(let t=0;t<800;t++) {
    const gx=1+Math.floor(Math.random()*(MAP_W-2)), gy=1+Math.floor(Math.random()*(MAP_H-2));
    const key=`${gx},${gy}`, pos=cellCenter(gx,gy);
    if(isOpenCell(grid,gx,gy)&&!used.has(key)&&dist(pos,start)>=minDistFromStart) { used.add(key); return {...pos,gx,gy}; }
  }
  return cellCenter(1,1);
}

// ─── Floor creation ───────────────────────────────────────────────────────────
function createFloor(floorNum=1, previousPlayer=null) {
  const grid = makeMaze();
  const used = new Set(["1,1",`${MAP_W-2},${MAP_H-2}`]);
  const theme = FLOOR_THEMES[Math.min(floorNum-1, FLOOR_THEMES.length-1)];
  const spawn = cellCenter(1,1);
  const exit = cellCenter(MAP_W-2, MAP_H-2);

  const player = previousPlayer ? {
    ...previousPlayer, x:spawn.x,y:spawn.y, angle:0, pitch:0, targetPitch:0,
    bob:0, bobVel:0, vx:0, vy:0, invuln:2200, hidden:false, stunned:0, flashlightOff:false,
  } : {
    x:spawn.x,y:spawn.y, angle:0, pitch:0, targetPitch:0, bob:0, bobVel:0,
    vx:0, vy:0, hp:3, battery:100, stamina:100, sanity:100,
    maxBattery:100, maxStamina:100, maxSanity:100, maxHp:3,
    flashlightOff:false, hasLighter:false, flares:0,
    hasCamera:false, cameraCharge:100, hasStunGun:false, stunAmmo:0,
    scraps:0, noise:0, upgrades:defaultUpgrades(),
  };
  player.upgrades    = player.upgrades || defaultUpgrades();
  player.maxBattery  = statMax(player.upgrades,"battery");
  player.maxStamina  = statMax(player.upgrades,"stamina");
  player.maxSanity   = statMax(player.upgrades,"sanity");
  player.maxHp       = statMax(player.upgrades,"hp");
  player.hp          = clamp(player.hp,1,player.maxHp);
  player.battery     = clamp(player.battery,0,player.maxBattery);
  player.sanity      = clamp(player.sanity,0,player.maxSanity);
  player.stamina     = clamp(player.stamina,0,player.maxStamina);
  player.pitch       = clamp(player.pitch||0,-0.55,0.55);
  player.targetPitch = clamp(player.targetPitch||0,-0.55,0.55);
  player.vx = player.vx||0; player.vy = player.vy||0;
  player.bobVel = 0;

  const makeItem = (type,minDist,extra={}) => ({
    id:`${type}-${Math.random().toString(16).slice(2)}`, type, collected:false,
    pulse:Math.random()*Math.PI*2,
    ...randomOpenCell(grid,used,minDist), ...extra,
  });

  const items    = Array.from({length:ITEM_COUNT},(_,i) => makeItem("fragment",CELL*7,{label:choice(["TAPE","IDOL","BONE","MASK","RELIC","EYE","TOOTH","KEY"]),index:i}));
  const lores    = Array.from({length:3},(_,i) => makeItem("lore",CELL*4,{text:LORE_TEXTS[floorNum-1]?.[i]||LORE_TEXTS[0][i]}));
  const batteries= Array.from({length:6},() => makeItem("battery",CELL*2));
  const medkits  = Array.from({length:3},() => makeItem("medkit",CELL*3));
  const flares   = Array.from({length:3},() => makeItem("flare",CELL*3));
  const ammo     = Array.from({length:4},() => makeItem("ammo",CELL*4,{amount:floorNum>=3?2:1}));
  const lighter   = makeItem("lighter",CELL*3,{collected:!!previousPlayer?.hasLighter});
  const cameraItem= makeItem("camera",CELL*4,{collected:!!previousPlayer?.hasCamera});
  const stunGunItem=makeItem("stungun",CELL*5,{collected:!!previousPlayer?.hasStunGun});

  const specials = [
    {type:"breaker",name:"Breaker Room",    desc:"restores lights nearby, but screams"},
    {type:"security",name:"Security Terminal",desc:"reveals monster and objective briefly"},
    {type:"supply",name:"Supply Closet",   desc:"battery, sanity, and a flare"},
    {type:"altar",name:"Cursed Altar",     desc:"+1 shard, huge noise"},
    {type:"archive",name:"Archive",        desc:"read files for map info"},
    {type:"ritual",name:"Ritual Circle",   desc:"+1 shard, instant hunt"},
  ].map(sp => makeItem("special",CELL*3,{...sp,used:false}));

  const traps = floorNum>=2
    ? Array.from({length:4+floorNum*2},() => makeItem("trap",CELL*2,{trapType:choice(["glass","wire",floorNum>=3?"bear":"glass"]),triggered:false}))
    : [];

  const monsterStart = randomOpenCell(grid,used,CELL*10);
  return {
    grid, floorNum, theme, player,
    monster:{
      x:monsterStart.x, y:monsterStart.y, angle:0, mode:"stalk",
      target:null, stun:0, anger:0, seenTimer:0, lastKnown:null,
      blinkTimer:rand(3500,7000), baseSpeed:1.65+floorNum*0.12,
      // rendering
      bodyAnim:0, eyePulse:0, lastSeen:0,
    },
    exit:{...exit,active:false,pulse:0},
    items, lores, batteries, medkits, lighter, flares, cameraItem, stunGunItem, ammo, specials, traps,
    activeFlares:[], noisePulses:[], hallucinations:[],
    collected:0, finalPhase:false, dead:false, won:false,
    floorComplete:false, awaitingUpgrade:false, upgradeOptions:[],
    securityPing:0, event:null, eventTimer:rand(14000,26000),
    scare:null, loreRead:null,
    message:`${theme.name.toUpperCase()} — FLOOR ${floorNum}. Find the ${ITEM_COUNT} signal fragments. ${theme.monsterName}: ${theme.monsterDesc}`,
    hauntTimer:rand(4500,9500), time:0, glitch:0, inverted:0, trapped:0,
    lastPlayerPos:{x:player.x,y:player.y}, stillTimer:0,
    gunFlash:0,
    // breathing/audio simulation
    heartbeat:0, breathTimer:rand(8000,18000),
    // smooth camera shake
    shakeX:0, shakeY:0, shakeDecay:0,
  };
}

// ─── Raycaster ────────────────────────────────────────────────────────────────
function castRay(grid, ox, oy, angle) {
  // DDA algorithm for crisp, non-blocky walls
  const sin = Math.sin(angle), cos = Math.cos(angle);
  let mapX = Math.floor(ox/CELL), mapY = Math.floor(oy/CELL);
  const stepX = cos>0?1:-1, stepY = sin>0?1:-1;
  const deltaDistX = Math.abs(1/cos), deltaDistY = Math.abs(1/sin);
  let sideDistX = cos>0?(mapX+1-ox/CELL)*deltaDistX:(ox/CELL-mapX)*deltaDistX;
  let sideDistY = sin>0?(mapY+1-oy/CELL)*deltaDistY:(oy/CELL-mapY)*deltaDistY;
  let side = 0, depth = 0;
  for (let i=0;i<160;i++) {
    if (sideDistX < sideDistY) { sideDistX+=deltaDistX; mapX+=stepX; side=0; }
    else                        { sideDistY+=deltaDistY; mapY+=stepY; side=1; }
    if (mapX<0||mapY<0||mapX>=MAP_W||mapY>=MAP_H||grid[mapY][mapX]===1) {
      depth = side===0 ? (sideDistX-deltaDistX)*CELL : (sideDistY-deltaDistY)*CELL;
      // texture coordinate
      let wallX;
      if (side===0) wallX = oy/CELL + depth/CELL * sin;
      else          wallX = ox/CELL + depth/CELL * cos;
      wallX -= Math.floor(wallX);
      return { depth:Math.max(depth,1), side, wallX, mapX, mapY };
    }
  }
  return { depth:MAX_DEPTH, side:0, wallX:0, mapX, mapY };
}

function hasLineOfSight(grid, a, b) {
  const d=dist(a,b), steps=Math.max(2,Math.floor(d/18));
  for(let i=1;i<steps;i++) { const t=i/steps; if(isWall(grid,a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t)) return false; }
  return true;
}

function moveEntityVector(grid, ent, mx, my, radius=18) {
  const nx=ent.x+mx, ny=ent.y+my;
  const sl=Math.sign(mx||0)*radius, st=Math.sign(my||0)*radius;
  if (!isWall(grid,nx+sl,ent.y) && !isWall(grid,nx,ent.y-radius*0.55) && !isWall(grid,nx,ent.y+radius*0.55)) ent.x=nx;
  else ent.vx=0;
  if (!isWall(grid,ent.x,ny+st) && !isWall(grid,ent.x-radius*0.55,ny) && !isWall(grid,ent.x+radius*0.55,ny)) ent.y=ny;
  else ent.vy=0;
}
function moveEntity(grid,ent,angle,amount,radius=18) {
  moveEntityVector(grid,ent,Math.cos(angle)*amount,Math.sin(angle)*amount,radius);
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SomethingHeardYou({ onExit }) {
  const canvasRef  = useRef(null);
  const cardRef    = useRef(null);
  const keysRef    = useRef({});
  const runRef     = useRef(null);
  const rafRef     = useRef(null);
  const lastRef    = useRef(performance.now());
  // Precomputed ray table (cos/sin) — rebuilt once per mount
  const rayTable   = useRef(null);
  // Off-screen depth buffer shared per frame
  const zbuf       = useRef(new Float32Array(RAYS));

  const [started, setStarted]       = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [uiRun, setUiRun]           = useState(() => {
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

  // Build ray angle table once
  useEffect(() => {
    const t = new Array(RAYS);
    for (let i=0;i<RAYS;i++) {
      const a = -FOV/2 + (i/(RAYS-1))*FOV;
      t[i] = { cos:Math.cos(a), sin:Math.sin(a), angle:a };
    }
    rayTable.current = t;
  }, []);

  // Sync ref → state for React UI only (upgrade overlay, etc.)
  const syncUi = () => { if (runRef.current) setUiRun({...runRef.current}); };

  function restart() {
    const fresh = createFloor(1);
    runRef.current = fresh;
    setUiRun(fresh);
    setStarted(true);
    lastRef.current = performance.now();
    canvasRef.current?.focus?.();
  }

  // ─── Noise / scare / pickup helpers ────────────────────────────────────────
  function makeNoise(r, x, y, power, fake=false) {
    const quiet = 1-(r.player.upgrades.quiet||0)*0.18;
    const boost = r.floorNum>=5||r.event?.type==="listening" ? 1.35 : 1;
    const pwr = Math.max(20,power*quiet*boost);
    if (!fake) r.player.noise = clamp(r.player.noise+pwr*0.18,0,100);
    r.noisePulses.push({x,y,r:6,max:pwr,alpha:fake?0.35:0.8,fake});
    if (fake) return;
    const d=dist({x,y},r.monster);
    if (d<pwr+180) {
      r.monster.mode = d<pwr*0.72?"chase":"investigate";
      r.monster.target = {x,y};
      r.monster.lastKnown = {x,y};
      r.monster.anger = clamp(r.monster.anger+18,0,100);
      if (d<pwr*0.72) r.message="It heard that.";
    }
  }

  function doScare(r, text="RUN") {
    r.scare = {text, timer:980, seed:Math.random()};
    r.player.sanity = clamp(r.player.sanity-24,0,r.player.maxSanity);
    r.glitch = Math.max(r.glitch,0.9);
    r.shakeX = rand(-8,8); r.shakeY = rand(-8,8); r.shakeDecay = 0.88;
  }

  function pickupNearby() {
    const r = runRef.current;
    if (!r||r.dead||r.won||r.floorComplete) return;
    const p = r.player;
    const near = (obj,range=62) => !obj.collected && dist(p,obj)<range;

    for (const sp of r.specials) {
      if (!sp.used && dist(p,sp)<70) {
        sp.used=true;
        if (sp.type==="breaker")  { r.securityPing=3500; makeNoise(r,sp.x,sp.y,260); r.message="Breaker scream echoed through the walls."; }
        if (sp.type==="security") { r.securityPing=9000+(p.upgrades.map||0)*3000; makeNoise(r,sp.x,sp.y,110); r.message="Security terminal: monster and objective revealed."; }
        if (sp.type==="supply")   { p.flares+=1; p.battery=clamp(p.battery+45,0,p.maxBattery); p.sanity=clamp(p.sanity+12,0,p.maxSanity); makeNoise(r,sp.x,sp.y,85); r.message="Supply closet: flare, battery, sanity."; }
        if (sp.type==="altar")    { p.scraps+=1; p.sanity=clamp(p.sanity-22,0,p.maxSanity); makeNoise(r,sp.x,sp.y,280); r.monster.mode="chase"; r.monster.target={x:p.x,y:p.y}; r.message="Cursed shard taken. It knows exactly where you are."; }
        if (sp.type==="archive")  { r.securityPing=5000; makeNoise(r,sp.x,sp.y,70); r.message="Archive decoded."; }
        if (sp.type==="ritual")   { p.scraps+=1; makeNoise(r,sp.x,sp.y,340); r.monster.mode="chase"; r.monster.target={x:p.x,y:p.y}; doScare(r,"FOUND"); r.message="Ritual circle broken. +1 shard. Run."; }
        syncUi(); return;
      }
    }
    for (const lore of r.lores) {
      if (near(lore,62)) { lore.collected=true; r.loreRead={text:lore.text,timer:6500}; p.sanity=clamp(p.sanity-12,0,p.maxSanity); makeNoise(r,p.x,p.y,75); if(Math.random()<0.5) doScare(r,"READ"); syncUi(); return; }
    }
    for (const item of r.items) {
      if (near(item,62)) {
        item.collected=true; r.collected+=1; p.sanity=clamp(p.sanity-8,0,p.maxSanity); makeNoise(r,p.x,p.y,235);
        if (r.collected>=ITEM_COUNT) { r.exit.active=true; r.finalPhase=true; r.monster.mode="chase"; r.monster.target={x:p.x,y:p.y}; r.message="ALL FRAGMENTS FOUND. EXIT IS OPEN. IT IS RUNNING."; doScare(r,"EXIT"); }
        else r.message=`${ITEM_COUNT-r.collected} fragments remain. The relic screamed.`;
        syncUi(); return;
      }
    }
    for (const bat of r.batteries) if(near(bat,58)){bat.collected=true;p.battery=clamp(p.battery+42,0,p.maxBattery);p.flashlightOff=false;makeNoise(r,p.x,p.y,55);r.message="Battery found.";syncUi();return;}
    for (const med of r.medkits)   if(near(med,58)){med.collected=true;p.hp=clamp(p.hp+1,0,p.maxHp);p.sanity=clamp(p.sanity+20,0,p.maxSanity);makeNoise(r,p.x,p.y,60);r.message="Medkit found.";syncUi();return;}
    for (const fl  of r.flares)    if(near(fl,58)) {fl.collected=true;p.flares+=1;makeNoise(r,p.x,p.y,55);r.message=`Flare (${p.flares})`;syncUi();return;}
    for (const am  of r.ammo)      if(near(am,58)) {am.collected=true;p.stunAmmo+=am.amount||1;makeNoise(r,p.x,p.y,55);r.message=`Ammo: ${p.stunAmmo}`;syncUi();return;}
    if (r.lighter  &&near(r.lighter,58))    {r.lighter.collected=true;p.hasLighter=true;makeNoise(r,p.x,p.y,55);r.message="Lighter found.";syncUi();return;}
    if (r.cameraItem&&near(r.cameraItem,58)){r.cameraItem.collected=true;p.hasCamera=true;p.cameraCharge=100;makeNoise(r,p.x,p.y,55);r.message="Camera found. Press C.";syncUi();return;}
    if (r.stunGunItem&&near(r.stunGunItem,58)){r.stunGunItem.collected=true;p.hasStunGun=true;p.stunAmmo+=2;makeNoise(r,p.x,p.y,110);r.message=`Stun pistol found. Ammo: ${p.stunAmmo}.`;syncUi();return;}
    if (r.exit.active&&dist(p,r.exit)<78) {
      r.floorComplete=true;
      if (r.floorNum>=MAX_FLOORS) { r.won=true; r.message="You escaped. It is still inside."; doScare(r,"ESCAPED"); }
      else { p.scraps+=1; r.awaitingUpgrade=true; r.upgradeOptions=chooseUpgradeOptions(p); r.message=`Floor ${r.floorNum} cleared.`; }
      syncUi();
    }
  }

  function throwFlare() {
    const r=runRef.current; if(!r||r.dead||r.won||r.player.flares<=0) return;
    const p=r.player; p.flares-=1;
    const f={x:p.x,y:p.y,timer:9500+(p.upgrades.flare||0)*2500,radius:270+(p.upgrades.flare||0)*40};
    for(let i=0;i<7;i++) moveEntity(r.grid,f,p.angle,34,10);
    r.activeFlares.push(f); makeNoise(r,f.x,f.y,205); r.message="Flare thrown."; syncUi();
  }

  function useCamera() {
    const r=runRef.current; if(!r||!r.player.hasCamera||r.player.cameraCharge<30) return;
    const p=r.player; p.cameraCharge-=30; r.glitch=Math.max(r.glitch,0.65);
    r.shakeX=rand(-5,5); r.shakeY=rand(-5,5); r.shakeDecay=0.82;
    const d=dist(p,r.monster), facing=Math.abs(normAng(Math.atan2(r.monster.y-p.y,r.monster.x-p.x)-p.angle));
    const range=360+(p.upgrades.camera||0)*90;
    if(d<range&&facing<0.7&&hasLineOfSight(r.grid,p,r.monster)) { r.monster.stun=3000+(p.upgrades.camera||0)*700; r.monster.mode="stalk"; r.message="Camera flash stunned it."; doScare(r,"FLASH"); }
    else r.message="Missed. Save it.";
    syncUi();
  }

  function fireStunGun() {
    const r=runRef.current; if(!r||r.dead||r.won) return;
    const p=r.player;
    if(!p.hasStunGun){r.message="No stun pistol yet.";syncUi();return;}
    if(p.stunAmmo<=0){r.message="Empty.";syncUi();return;}
    p.stunAmmo-=1; makeNoise(r,p.x,p.y,360); r.gunFlash=170;
    r.shakeX=rand(-12,12); r.shakeY=rand(-6,6); r.shakeDecay=0.78;
    const d=dist(p,r.monster), facing=Math.abs(normAng(Math.atan2(r.monster.y-p.y,r.monster.x-p.x)-p.angle));
    if(d<620&&facing<0.18&&hasLineOfSight(r.grid,p,r.monster)) { r.monster.stun=4300; r.monster.mode="stalk"; r.message=`Hit. Stunned. Ammo: ${p.stunAmmo}.`; }
    else { r.monster.mode="chase"; r.monster.target={x:p.x,y:p.y}; r.message=`Missed. It heard. Ammo: ${p.stunAmmo}.`; }
    syncUi();
  }

  function applyUpgradeChoice(index) {
    const r=runRef.current; if(!r?.awaitingUpgrade) return;
    const up=r.upgradeOptions[index], p=r.player;
    if(up) {
      p.upgrades[up.key]=clamp((p.upgrades[up.key]||0)+1,0,up.max);
      if(p.scraps>0) p.scraps-=1;
      p.maxBattery=statMax(p.upgrades,"battery"); p.maxStamina=statMax(p.upgrades,"stamina");
      p.maxSanity =statMax(p.upgrades,"sanity");  p.maxHp=statMax(p.upgrades,"hp");
      p.battery=clamp(p.battery+30,0,p.maxBattery); p.stamina=p.maxStamina;
      p.sanity=clamp(p.sanity+25,0,p.maxSanity); p.hp=clamp(p.hp+1,0,p.maxHp);
    }
    const next=createFloor(r.floorNum+1,p);
    next.message=up?`Upgrade: ${up.name}.`:"No upgrade. Going deeper.";
    runRef.current=next; setUiRun(next);
  }

  function startEvent(r) {
    const ev=choice([
      {type:"brownout",  name:"BROWNOUT",       timer:5200, msg:"Brownout. Keep moving."},
      {type:"hunt",      name:"BLOOD HUNT",      timer:9000, msg:"Blood hunt. It moves faster."},
      {type:"listening", name:"LISTENING HOUR",  timer:10500,msg:"Listening hour. Every sound carries."},
      {type:"whispers",  name:"WHISPER STORM",   timer:10000,msg:"Whispers. Your mind is slipping."},
    ]);
    r.event=ev; r.message=ev.msg;
    if(ev.type==="hunt"){r.monster.mode="investigate";r.monster.target={x:r.player.x,y:r.player.y};}
  }

  // ─── Monster AI ────────────────────────────────────────────────────────────
  function updateMonster(r, dt) {
    const p=r.player, m=r.monster;
    m.bodyAnim = (m.bodyAnim||0)+dt*0.003;
    m.eyePulse  = (m.eyePulse||0)+dt*0.005;
    if(m.stun>0){m.stun-=dt;return;}
    const d=dist(p,m);
    const los=d<(r.finalPhase?850:620)&&hasLineOfSight(r.grid,m,p);
    const darkAttack=r.floorNum!==4||p.flashlightOff||p.battery<=0||r.finalPhase||d<140;
    if(los&&darkAttack){
      m.mode="chase"; m.target={x:p.x,y:p.y}; m.lastKnown={x:p.x,y:p.y};
      m.seenTimer+=dt; m.lastSeen=r.time;
    } else if(m.mode==="chase"&&m.lastKnown){
      m.target=m.lastKnown;
      if(dist(m,m.lastKnown)<50) m.mode="investigate";
    }
    // Floor 2 – Watcher
    if(r.floorNum===2){
      if(dist(p,r.lastPlayerPos)<6) r.stillTimer+=dt; else{r.stillTimer=0;r.lastPlayerPos={x:p.x,y:p.y};}
      if(r.stillTimer>6200&&m.mode!=="chase"){
        const a=p.angle+Math.PI+rand(-0.8,0.8);
        const blink={x:p.x,y:p.y};
        for(let i=0;i<9;i++) moveEntity(r.grid,blink,a,42,16);
        m.x=blink.x;m.y=blink.y;m.mode="investigate";m.target={x:p.x,y:p.y};r.stillTimer=0;
        doScare(r,"BLINK"); r.message="You stood still too long.";
      }
    }
    // Floor 3 – Mimic
    if(r.floorNum===3){
      m.blinkTimer-=dt;
      if(m.blinkTimer<=0){
        const a=rand(0,Math.PI*2);
        makeNoise(r,p.x+Math.cos(a)*rand(140,300),p.y+Math.sin(a)*rand(140,300),150,true);
        m.blinkTimer=rand(3500,7000);
      }
    }
    if(m.mode==="stalk"&&(!m.target||dist(m,m.target)<60||Math.random()<0.01)){
      const a=rand(0,Math.PI*2);
      m.target={x:p.x+Math.cos(a)*rand(360,900),y:p.y+Math.sin(a)*rand(360,900)};
    }
    if(m.mode==="investigate"&&(!m.target||dist(m,m.target)<58)){m.mode="stalk";m.target=null;}

    const target=m.mode==="chase"?p:m.target;
    if(target){
      let spd=m.mode==="chase"?m.baseSpeed+0.75:m.mode==="investigate"?m.baseSpeed+0.25:1.18+r.floorNum*0.08;
      if(r.finalPhase) spd+=0.45;
      if(r.event?.type==="hunt") spd+=0.6;
      if(r.floorNum>=5) spd+=0.25;
      const ang=Math.atan2(target.y-m.y,target.x-m.x);
      m.angle=ang;
      moveEntity(r.grid,m,ang,spd*(dt/16.67),24);
      if(isWall(r.grid,m.x,m.y)){m.x=target.x+Math.cos(ang+Math.PI)*150;m.y=target.y+Math.sin(ang+Math.PI)*150;}
    }
  }

  function checkTraps(r) {
    const p=r.player;
    for(const t of r.traps){
      if(t.triggered||dist(p,t)>34) continue;
      t.triggered=true;
      if(t.trapType==="bear"){p.hp-=1;r.trapped=3300;doScare(r,"TRAPPED");r.message=p.hp<=0?"The dark learned your name.":`Bear trap. ${p.hp} lives.`;if(p.hp<=0)r.dead=true;}
      else{makeNoise(r,t.x,t.y,280);p.sanity=clamp(p.sanity-10,0,p.maxSanity);r.message=t.trapType==="wire"?"Tripwire snapped.":"Glass shattered.";}
    }
  }

  // ─── Game loop ─────────────────────────────────────────────────────────────
  function updateGame(dtMs) {
    const r=runRef.current;
    if(!r||!started||r.dead||r.won) return;
    if(r.floorComplete&&!r.won) { r.time+=dtMs; return; }
    const dt=Math.min(dtMs,34);
    const p=r.player, keys=keysRef.current;
    r.time+=dt;
    r.glitch=Math.max(0,r.glitch-dt/1350);
    r.eventTimer-=dt;
    // Camera shake decay
    if(r.shakeDecay>0){r.shakeX*=r.shakeDecay;r.shakeY*=r.shakeDecay;if(Math.abs(r.shakeX)<0.1){r.shakeX=0;r.shakeY=0;r.shakeDecay=0;}}

    if(r.event){
      r.event.timer-=dt;
      if(r.event.type==="whispers") p.sanity=clamp(p.sanity-dt*0.004,0,p.maxSanity);
      if(r.event.timer<=0){r.event=null;r.eventTimer=rand(15000,28000)-r.floorNum*900;r.message="The building settles.";}
    } else if(r.eventTimer<=0) startEvent(r);

    if(p.invuln>0) p.invuln-=dt;
    if(r.inverted>0) r.inverted-=dt;
    if(r.trapped>0) r.trapped-=dt;
    if(r.loreRead){r.loreRead.timer-=dt;if(r.loreRead.timer<=0)r.loreRead=null;}
    if(r.scare){r.scare.timer-=dt;if(r.scare.timer<=0)r.scare=null;}
    if(r.gunFlash) r.gunFlash=Math.max(0,r.gunFlash-dt);
    r.securityPing=Math.max(0,r.securityPing-dt);
    r.exit.pulse+=dt*0.004;
    p.noise=clamp(p.noise-dt*0.055,0,100);

    // Heartbeat when monster is close
    r.heartbeat=(r.heartbeat||0)+dt;

    // Breathing scare
    if(r.breathTimer){
      r.breathTimer-=dt;
      if(r.breathTimer<=0){
        r.breathTimer=rand(10000,22000);
        if(p.sanity<50) doScare(r,choice(["LOOK","BEHIND","LISTEN","RUN","STILL"]));
      }
    }

    // Turning
    let turn=0;
    if(keys.arrowleft) turn-=1;
    if(keys.arrowright) turn+=1;
    p.angle=normAng(p.angle+turn*0.045*(dt/16.67));

    // Movement — smooth acceleration
    let fwd=0, strafe=0;
    const inv=r.inverted>0?-1:1;
    if(keys.w||keys.arrowup)   fwd   +=inv;
    if(keys.s||keys.arrowdown) fwd   -=inv;
    if(keys.a)                 strafe-=inv;
    if(keys.d)                 strafe+=inv;
    const moving  = fwd!==0||strafe!==0;
    const crouch  = keys.control||keys.ctrl;
    const sprint  = moving&&keys.shift&&!crouch&&p.stamina>7&&r.trapped<=0;
    const speed   = crouch?1.25:sprint?3.55:r.trapped>0?0.8:2.15;
    const frame   = dt/16.67;
    p.targetPitch = clamp(p.targetPitch||0,-0.55,0.55);
    p.pitch      += (p.targetPitch-p.pitch)*clamp(dt/95,0,1);

    if(moving){
      const mag=Math.hypot(fwd,strafe)||1;
      const f=fwd/mag, st=strafe/mag;
      const tvx=(Math.cos(p.angle)*f+Math.cos(p.angle+Math.PI/2)*st)*speed;
      const tvy=(Math.sin(p.angle)*f+Math.sin(p.angle+Math.PI/2)*st)*speed;
      // Smooth acceleration — tighter feel than original
      const accel=sprint?0.28:crouch?0.15:0.22;
      p.vx+=(tvx-p.vx)*accel;
      p.vy+=(tvy-p.vy)*accel;
      moveEntityVector(r.grid,p,p.vx*frame,p.vy*frame,19);
      // Smooth bob using velocity
      const bobTarget=(sprint?0.018:crouch?0.005:0.010)*Math.hypot(p.vx,p.vy)*0.6;
      p.bobVel=(p.bobVel||0)+bobTarget;
      p.bob+=p.bobVel*(dt/1000);
      p.bobVel*=0.88;
      if(sprint){
        p.stamina=clamp(p.stamina-dt*0.075,0,p.maxStamina);
        if(Math.random()<0.052) makeNoise(r,p.x,p.y,175);
      } else if(crouch){
        if(Math.random()<0.0045) makeNoise(r,p.x,p.y,28);
      } else if(Math.random()<0.010) makeNoise(r,p.x,p.y,60);
    } else {
      // Friction — exponential decay, very smooth stop
      const friction=Math.pow(0.78,frame);
      p.vx*=friction; p.vy*=friction;
      if(Math.hypot(p.vx,p.vy)>0.05) moveEntityVector(r.grid,p,p.vx*frame,p.vy*frame,19);
      else {p.vx=0;p.vy=0;}
      p.stamina=clamp(p.stamina+dt*(0.028+(p.upgrades.stamina||0)*0.006),0,p.maxStamina);
      // Bob smoothly decays to 0
      p.bob+=(0-p.bob)*Math.min(dt/220,1);
    }
    if(!sprint) p.stamina=clamp(p.stamina+dt*0.018,0,p.maxStamina);
    if(!p.flashlightOff&&!p.hasLighter&&p.battery>0)
      p.battery=clamp(p.battery-dt*0.0016*(r.finalPhase?1.3:1)*(1-(p.upgrades.battery||0)*0.08),0,p.maxBattery);
    if(p.battery<=0&&!p.hasLighter) p.flashlightOff=true;
    if(p.hasCamera) p.cameraCharge=clamp(p.cameraCharge+dt*0.004,0,100);

    for(const f of r.activeFlares) f.timer-=dt;
    r.activeFlares=r.activeFlares.filter(f=>f.timer>0);
    for(const pulse of r.noisePulses){pulse.r+=dt*0.36;pulse.alpha-=dt*0.0012;}
    r.noisePulses=r.noisePulses.filter(p=>p.alpha>0&&p.r<p.max);

    updateMonster(r,dt);
    checkTraps(r);

    const md=dist(p,r.monster);
    const monsterVisible=md<620&&hasLineOfSight(r.grid,p,r.monster);
    if(monsterVisible)   p.sanity=clamp(p.sanity-dt*0.022*(1-md/700)*(1-(p.upgrades.sanity||0)*0.06),0,p.maxSanity);
    else if(p.flashlightOff&&!p.hasLighter) p.sanity=clamp(p.sanity-dt*0.0022,0,p.maxSanity);
    else p.sanity=clamp(p.sanity+dt*0.0045,0,p.maxSanity);

    if(md<44&&p.invuln<=0){
      p.hp-=1; p.invuln=2300; p.sanity=clamp(p.sanity-36,0,p.maxSanity);
      doScare(r,"CAUGHT");
      r.shakeX=rand(-18,18); r.shakeY=rand(-14,14); r.shakeDecay=0.84;
      if(p.hp<=0){r.dead=true;r.message="The dark learned your name.";}
      else{
        const sp=cellCenter(1,1);p.x=sp.x;p.y=sp.y;p.angle=0;p.vx=0;p.vy=0;
        const far=randomOpenCell(r.grid,new Set(["1,1"]),CELL*8);
        r.monster.x=far.x;r.monster.y=far.y;r.monster.mode="stalk";
        r.message=`Dragged back. ${p.hp} lives remaining.`;
      }
    }

    r.hauntTimer-=dt;
    if(r.hauntTimer<=0){
      r.message=choice(horrorLines);
      r.glitch=Math.max(r.glitch,rand(0.2,0.65));
      if(Math.random()<0.28) makeNoise(r,p.x-Math.cos(p.angle)*rand(150,260),p.y-Math.sin(p.angle)*rand(150,260),150,true);
      if(p.sanity<28&&Math.random()<0.25){r.inverted=2400;r.message="Your mind is slipping.";}
      if(p.sanity<45&&Math.random()<0.25) doScare(r,choice(["LOOK","BEHIND","LISTEN","RUN"]));
      r.hauntTimer=rand(r.finalPhase?2400:5200,r.finalPhase?5200:10500)-r.floorNum*550;
    }
  }

  // ─── Interact target ───────────────────────────────────────────────────────
  function getInteractTarget(r) {
    const p=r.player;
    const all=[
      ...r.items.filter(x=>!x.collected),
      ...r.lores.filter(x=>!x.collected),
      ...r.batteries.filter(x=>!x.collected),
      ...r.medkits.filter(x=>!x.collected),
      ...r.flares.filter(x=>!x.collected),
      ...r.ammo.filter(x=>!x.collected),
      ...(r.lighter&&!r.lighter.collected?[r.lighter]:[]),
      ...(r.cameraItem&&!r.cameraItem.collected?[r.cameraItem]:[]),
      ...(r.stunGunItem&&!r.stunGunItem.collected?[r.stunGunItem]:[]),
      ...r.specials.filter(x=>!x.used),
      ...(r.exit.active?[r.exit]:[]),
    ];
    let best=null,bd=Infinity;
    for(const obj of all){
      const d=dist(p,obj);
      if(d>95||d>bd) continue;
      const a=Math.abs(normAng(Math.atan2(obj.y-p.y,obj.x-p.x)-p.angle));
      if(a<0.9&&hasLineOfSight(r.grid,p,obj)){best=obj;bd=d;}
    }
    return best;
  }

  // ─── Draw helpers ──────────────────────────────────────────────────────────
  function drawBar(ctx,x,y,w,h,frac,label){
    ctx.fillStyle="rgba(0,0,0,.56)"; ctx.fillRect(x,y,w,h);
    ctx.strokeStyle="rgba(255,255,255,.16)"; ctx.strokeRect(x,y,w,h);
    ctx.fillStyle=frac>0.55?"rgba(220,220,200,.85)":frac>0.25?"rgba(210,142,62,.9)":"rgba(205,34,34,.9)";
    ctx.fillRect(x+2,y+2,(w-4)*clamp(frac,0,1),h-4);
    ctx.fillStyle="rgba(255,245,235,.8)";
    ctx.font="10px 'Share Tech Mono',monospace";
    ctx.fillText(label,x,y-4);
  }

  // ─── Sprite icon draw ──────────────────────────────────────────────────────
  function drawItemIcon(ctx, type, size, t) {
    const s=size;
    ctx.lineWidth=Math.max(1.2,s*0.035);
    ctx.strokeStyle="rgba(20,10,10,.72)";

    if(type==="fragment"){
      const g=ctx.createRadialGradient(0,0,s*.04,0,0,s*.46);
      g.addColorStop(0,"rgba(255,245,245,.98)"); g.addColorStop(.45,"rgba(255,40,45,.95)"); g.addColorStop(1,"rgba(80,0,0,.92)");
      ctx.fillStyle=g;
      ctx.beginPath();
      for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI*2/10;const r2=i%2?s*.18:s*.42;ctx.lineTo(Math.cos(a)*r2,Math.sin(a)*r2);}
      ctx.closePath();ctx.fill();ctx.stroke();
      // pulsing glow ring
      ctx.strokeStyle=`rgba(255,80,80,${0.4+Math.sin(t*0.006)*0.3})`;
      ctx.lineWidth=2; ctx.beginPath(); ctx.arc(0,0,s*.52,0,Math.PI*2); ctx.stroke();
    } else if(type==="battery"){
      ctx.fillStyle="rgba(22,22,14,.96)"; ctx.fillRect(-s*.27,-s*.34,s*.54,s*.68); ctx.strokeRect(-s*.27,-s*.34,s*.54,s*.68);
      ctx.fillStyle=`rgba(${Math.floor(200+Math.sin(t*.008)*55)},230,65,.96)`; ctx.fillRect(-s*.18,-s*.21,s*.36,s*.42);
      ctx.fillStyle="rgba(210,210,190,.9)"; ctx.fillRect(-s*.12,-s*.43,s*.24,s*.09);
      ctx.fillStyle="rgba(20,20,12,.8)"; ctx.font=`bold ${s*.24}px monospace`; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText("+",0,0);
    } else if(type==="medkit"){
      ctx.fillStyle="rgba(232,232,224,.96)"; roundRect(ctx,-s*.34,-s*.25,s*.68,s*.5,s*.06,true,true);
      ctx.fillStyle="rgba(190,20,30,.96)"; ctx.fillRect(-s*.07,-s*.18,s*.14,s*.36); ctx.fillRect(-s*.18,-s*.07,s*.36,s*.14);
    } else if(type==="lore"){
      ctx.fillStyle="rgba(222,194,133,.96)";
      ctx.beginPath();ctx.moveTo(-s*.25,-s*.34);ctx.lineTo(s*.2,-s*.34);ctx.lineTo(s*.31,-s*.23);ctx.lineTo(s*.31,s*.34);ctx.lineTo(-s*.25,s*.34);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.strokeStyle="rgba(55,28,18,.45)";
      for(let i=-2;i<=2;i++){ctx.beginPath();ctx.moveTo(-s*.16,i*s*.1);ctx.lineTo(s*.17,i*s*.1);ctx.stroke();}
    } else if(type==="flare"||type==="activeFlare"){
      ctx.rotate(-0.25);
      ctx.fillStyle="rgba(60,20,12,.94)"; roundRect(ctx,-s*.12,-s*.37,s*.24,s*.74,s*.08,true,true);
      ctx.fillStyle="rgba(255,130,40,.96)"; ctx.fillRect(-s*.15,-s*.2,s*.3,s*.14);
      const flicker=s*.12+Math.sin(t*.022)*s*.03;
      ctx.fillStyle="rgba(255,236,128,.98)"; ctx.beginPath(); ctx.arc(0,-s*.43,flicker,0,Math.PI*2); ctx.fill();
      if(type==="activeFlare"){ ctx.fillStyle=`rgba(255,160,60,${.4+Math.sin(t*.015)*.2})`; ctx.beginPath();ctx.arc(0,-s*.43,flicker*2.5,0,Math.PI*2);ctx.fill(); }
    } else if(type==="camera"){
      ctx.fillStyle="rgba(24,36,42,.96)"; roundRect(ctx,-s*.35,-s*.22,s*.7,s*.44,s*.07,true,true);
      ctx.fillStyle="rgba(118,215,255,.95)"; ctx.beginPath();ctx.arc(0,0,s*.16,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.fillStyle="rgba(255,255,255,.85)"; ctx.fillRect(-s*.25,-s*.3,s*.23,s*.08);
    } else if(type==="stungun"){
      ctx.fillStyle="rgba(28,46,70,.96)";
      ctx.fillRect(-s*.28,-s*.1,s*.48,s*.16); ctx.fillRect(s*.08,-s*.08,s*.25,s*.08); ctx.fillRect(-s*.05,s*.02,s*.13,s*.32);
      ctx.strokeRect(-s*.28,-s*.1,s*.61,s*.16);
      ctx.strokeStyle=`rgba(96,180,255,${.7+Math.sin(t*.01)*.25})`; ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(s*.36,-s*.1);ctx.lineTo(s*.48,-s*.22);ctx.moveTo(s*.36,s*.04);ctx.lineTo(s*.5,s*.17);ctx.stroke();
    } else if(type==="ammo"){
      ctx.fillStyle="rgba(40,70,105,.96)"; roundRect(ctx,-s*.28,-s*.22,s*.56,s*.44,s*.05,true,true);
      ctx.fillStyle="rgba(100,185,255,.95)";
      for(let i=-1;i<=1;i++) ctx.fillRect(i*s*.12-s*.035,-s*.15,s*.07,s*.3);
    } else if(type==="lighter"){
      ctx.fillStyle="rgba(70,42,22,.96)"; roundRect(ctx,-s*.16,-s*.28,s*.32,s*.56,s*.05,true,true);
      ctx.fillStyle="rgba(220,220,200,.96)"; ctx.fillRect(-s*.12,-s*.38,s*.24,s*.14);
      ctx.fillStyle=`rgba(255,${Math.floor(160+Math.sin(t*.02)*40)},80,.95)`; ctx.beginPath();ctx.arc(0,-s*.46,s*.1+Math.sin(t*.018)*s*.02,0,Math.PI*2);ctx.fill();
    } else if(type==="special"){
      ctx.strokeStyle="rgba(180,110,255,.85)"; ctx.lineWidth=s*.045;
      ctx.beginPath();ctx.arc(0,0,s*.36,0,Math.PI*2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(-s*.26,0);ctx.lineTo(s*.26,0);ctx.moveTo(0,-s*.26);ctx.lineTo(0,s*.26);ctx.stroke();
      ctx.fillStyle=`rgba(200,130,255,${.5+Math.sin(t*.008)*.3})`; ctx.beginPath();ctx.arc(0,0,s*.08,0,Math.PI*2);ctx.fill();
    } else if(type==="trap"){
      ctx.strokeStyle="rgba(160,160,150,.5)"; ctx.lineWidth=s*.025;
      ctx.beginPath();ctx.moveTo(-s*.35,s*.18);ctx.lineTo(s*.35,s*.18);ctx.moveTo(-s*.2,s*.18);ctx.lineTo(-s*.06,-s*.05);ctx.moveTo(s*.2,s*.18);ctx.lineTo(s*.06,-s*.05);ctx.stroke();
    } else if(type==="exit"){
      ctx.strokeStyle=`rgba(97,255,133,${.7+Math.sin(t*.007)*.25})`; ctx.lineWidth=s*.045;
      ctx.beginPath();ctx.arc(0,0,s*.38,0,Math.PI*2);ctx.stroke();
      ctx.beginPath();ctx.arc(0,0,s*.2,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle=`rgba(97,255,133,${.6+Math.sin(t*.007)*.3})`; ctx.fillRect(-s*.06,-s*.46,s*.12,s*.92);
    }
  }

  function roundRect(ctx,x,y,w,h,r,fill,stroke){
    const rr=Math.min(r,Math.abs(w)/2,Math.abs(h)/2);
    ctx.beginPath();ctx.moveTo(x+rr,y);ctx.arcTo(x+w,y,x+w,y+h,rr);ctx.arcTo(x+w,y+h,x,y+h,rr);ctx.arcTo(x,y+h,x,y,rr);ctx.arcTo(x,y,x+w,y,rr);ctx.closePath();
    if(fill)ctx.fill();if(stroke)ctx.stroke();
  }

  // ─── Sprite renderer ───────────────────────────────────────────────────────
  function drawSprite(ctx, r, obj, opts={}) {
    const p=r.player;
    if(obj.collected||obj.used) return;
    const dx=obj.x-p.x, dy=obj.y-p.y, d=Math.hypot(dx,dy);
    if(d<1||d>MAX_DEPTH*.9) return;
    const relAngle=normAng(Math.atan2(dy,dx)-p.angle);
    if(Math.abs(relAngle)>FOV*.76) return;
    if(!hasLineOfSight(r.grid,p,obj)&&!opts.always) return;

    const bobOffset=Math.sin(p.bob)*4;
    const horizon=CANVAS_H/2+bobOffset+(p.pitch||0)*230 + (r.shakeY||0);
    const screenX=CANVAS_W/2 + Math.tan(relAngle)*(CANVAS_W/2)/Math.tan(FOV/2) + (r.shakeX||0);
    const size=clamp((CELL*450)/d,opts.min||16,opts.max||160);
    const groundDrop=clamp((CELL*170)/d,18,155);
    const y=horizon+groundDrop-size*.58+(opts.yOffset||0);

    // z-check against depth buffer
    const col=Math.round(screenX/(CANVAS_W/RAYS));
    if(col>=0&&col<RAYS&&zbuf.current[col]<d) return;

    ctx.save();
    ctx.globalAlpha=clamp(1-d/(MAX_DEPTH*.95),.2,1)*(opts.alpha??1);
    ctx.translate(screenX, y+size/2);
    const pulse=1+Math.sin(r.time*0.006+(obj.pulse||0))*(obj.type==="trap"?.015:.055);
    ctx.scale(pulse,pulse);
    ctx.shadowColor=opts.shadow||opts.color||"#fff";
    ctx.shadowBlur=opts.glow||12;
    drawItemIcon(ctx, obj.type, size, r.time);
    ctx.shadowBlur=0;
    ctx.globalAlpha*=0.36;
    ctx.fillStyle="rgba(0,0,0,.75)";
    ctx.beginPath();ctx.ellipse(0,size*.43,size*.28,size*.055,0,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }

  // ─── Monster renderer ──────────────────────────────────────────────────────
  function drawMonster(ctx, r) {
    const p=r.player, m=r.monster;
    const d=dist(p,m);
    const relAngle=normAng(Math.atan2(m.y-p.y,m.x-p.x)-p.angle);
    const [er,eg,eb]=r.theme.eye;
    const inFOV=Math.abs(relAngle)<FOV*.86;
    const los=inFOV&&d<MAX_DEPTH&&hasLineOfSight(r.grid,p,m);

    // Off-screen arrow when chasing and not visible
    if(!los&&m.mode==="chase"&&d<900){
      const side=relAngle<0?36:CANVAS_W-36;
      ctx.save();
      ctx.globalAlpha=0.7+Math.sin(r.time*.012)*.25;
      ctx.fillStyle=`rgb(${er},${eg},${eb})`;
      ctx.shadowColor=ctx.fillStyle; ctx.shadowBlur=18;
      ctx.beginPath();ctx.moveTo(side,CANVAS_H/2);ctx.lineTo(side+(relAngle<0?-18:18),CANVAS_H/2-15);ctx.lineTo(side+(relAngle<0?-18:18),CANVAS_H/2+15);ctx.closePath();ctx.fill();
      ctx.restore();
    }
    if(!los) return;

    const col=Math.round((CANVAS_W/2+Math.tan(relAngle)*(CANVAS_W/2)/Math.tan(FOV/2))/(CANVAS_W/RAYS));
    if(col>=0&&col<RAYS&&zbuf.current[col]<d-24) return;

    const screenX=CANVAS_W/2+Math.tan(relAngle)*(CANVAS_W/2)/Math.tan(FOV/2)+(r.shakeX||0);
    const bobOffset=Math.sin(p.bob)*4;
    const horizon=CANVAS_H/2+bobOffset+(p.pitch||0)*230+(r.shakeY||0);
    const size=clamp((CELL*760)/d,58,480);
    const yBase=horizon-size*.52;
    const chase=m.mode==="chase";

    // Subtle body sway
    const sway=Math.sin((m.bodyAnim||0))*size*.018;
    const ey=Math.sin((m.eyePulse||0))*size*.006;

    ctx.save();
    ctx.translate(screenX+sway, yBase+size*.52);
    ctx.globalAlpha=clamp(1-d/1200,.28,1);

    // Shadow blob under feet
    ctx.fillStyle=`rgba(0,0,0,.55)`;
    ctx.beginPath();ctx.ellipse(0,size*.55,size*.38,size*.08,0,0,Math.PI*2);ctx.fill();

    // Body — tall dark silhouette with subtle limbs
    ctx.shadowColor=`rgba(${er},${eg},${eb},.5)`;
    ctx.shadowBlur=chase?40:16;
    // Main body mass
    const body=ctx.createRadialGradient(0,-size*.05,4,0,0,size*.58);
    body.addColorStop(0,"rgba(12,2,2,.97)");
    body.addColorStop(.5,"rgba(4,0,0,.96)");
    body.addColorStop(1,"rgba(0,0,0,0)");
    ctx.fillStyle=body;
    ctx.beginPath();ctx.ellipse(0,0,size*.38,size*.58,0,0,Math.PI*2);ctx.fill();

    // Tall thin silhouette head
    const headSize=size*.18;
    ctx.fillStyle="rgba(8,0,0,.97)";
    ctx.beginPath();ctx.ellipse(0,-size*.52,headSize*.9,headSize,0,0,Math.PI*2);ctx.fill();

    // Long arms hanging down (if close or chasing)
    if(d<400||chase){
      const armAlpha=clamp(1-d/500,.15,.85);
      ctx.globalAlpha*=armAlpha;
      ctx.strokeStyle="rgba(8,2,2,.95)"; ctx.lineWidth=size*.06;
      // left arm
      ctx.beginPath();ctx.moveTo(-size*.28,-size*.08);ctx.quadraticCurveTo(-size*.42+sway*2,size*.28,-size*.35+sway,size*.54);ctx.stroke();
      // right arm
      ctx.beginPath();ctx.moveTo(size*.28,-size*.08);ctx.quadraticCurveTo(size*.42+sway*2,size*.28,size*.35+sway,size*.54);ctx.stroke();
      ctx.globalAlpha=clamp(1-d/1200,.28,1);
    }

    // Eyes — glowing, asymmetric when close
    ctx.shadowColor=`rgba(${er},${eg},${eb},.9)`;
    ctx.shadowBlur=chase?28:12;
    const eyeIntensity=chase?1:0.72+Math.sin((m.eyePulse||0))*.25;
    ctx.fillStyle=`rgba(${er},${eg},${eb},${eyeIntensity})`;
    // slight asymmetry
    ctx.beginPath();ctx.ellipse(-size*.11,-size*.52+ey,size*.042,size*.024,-.12,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(size*.115,-size*.52+ey,size*.038,size*.021,.1,0,Math.PI*2);ctx.fill();

    // Pupils (dark center in eyes)
    ctx.fillStyle="rgba(0,0,0,.85)";
    ctx.beginPath();ctx.ellipse(-size*.11,-size*.52+ey,size*.018,size*.012,-.12,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(size*.115,-size*.52+ey,size*.016,size*.011,.1,0,Math.PI*2);ctx.fill();

    // Mouth — open wider when chasing
    if(d<300||chase){
      const mw=chase?size*.14:size*.08;
      const mh=chase?size*.06+Math.sin((m.bodyAnim||0)*2)*size*.02:size*.025;
      ctx.strokeStyle=`rgba(${er},${eg},${eb},.62)`;
      ctx.lineWidth=1.5;
      ctx.fillStyle="rgba(0,0,0,.92)";
      ctx.beginPath();
      ctx.ellipse(0,-size*.38,mw,mh,0,0,Math.PI*2);
      ctx.fill();ctx.stroke();
      // teeth glint
      if(chase&&d<180){
        ctx.fillStyle="rgba(240,230,230,.7)";
        for(let t2=0;t2<4;t2++) ctx.fillRect(-mw*.7+t2*mw*.38,-size*.38-mh*.3,mw*.12,mh*.7);
      }
    }

    // Distortion shimmer when very close
    if(d<180){
      ctx.globalAlpha*=.28;
      ctx.fillStyle=`rgba(${er},${eg},${eb},.3)`;
      ctx.beginPath();ctx.ellipse(0,0,size*.42,size*.62,Math.sin((m.bodyAnim||0)*.5)*.15,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }

  // ─── Minimap ───────────────────────────────────────────────────────────────
  function drawMiniMap(ctx, r) {
    if(r.securityPing<=0) return;
    const sc=4, ox=CANVAS_W-MAP_W*sc-18, oy=18;
    ctx.save();
    ctx.globalAlpha=0.86;
    ctx.fillStyle="rgba(0,0,0,.55)"; ctx.fillRect(ox-8,oy-8,MAP_W*sc+16,MAP_H*sc+16);
    for(let y=0;y<MAP_H;y++) for(let x=0;x<MAP_W;x++){
      ctx.fillStyle=r.grid[y][x]?"rgba(150,60,60,.42)":"rgba(220,220,190,.15)";
      ctx.fillRect(ox+x*sc,oy+y*sc,sc,sc);
    }
    ctx.fillStyle="#d22"; ctx.fillRect(ox+(r.monster.x/CELL)*sc-2,oy+(r.monster.y/CELL)*sc-2,4,4);
    ctx.fillStyle="#70ff90"; ctx.fillRect(ox+(r.player.x/CELL)*sc-2,oy+(r.player.y/CELL)*sc-2,4,4);
    const obj=r.exit.active?r.exit:r.items.find(i=>!i.collected);
    if(obj){ctx.fillStyle="#ffd34f";ctx.fillRect(ox+(obj.x/CELL)*sc-2,oy+(obj.y/CELL)*sc-2,4,4);}
    ctx.restore();
  }

  // ─── Main draw ─────────────────────────────────────────────────────────────
  function drawGame(ctx, r) {
    const p=r.player, theme=r.theme;
    const bob=Math.sin(p.bob)*4;
    const sway=Math.sin(p.bob*.5)*2.5;
    const shakeX=r.shakeX||0, shakeY=r.shakeY||0;
    const horizon=CANVAS_H/2+bob+(p.pitch||0)*230+shakeY;

    ctx.clearRect(0,0,CANVAS_W,CANVAS_H);

    // Ceiling
    const ceil=ctx.createLinearGradient(0,0,0,horizon);
    ceil.addColorStop(0,lightenHex(theme.ceiling,.24));
    ceil.addColorStop(.55,theme.ceiling);
    ceil.addColorStop(1,"#090508");
    ctx.fillStyle=ceil; ctx.fillRect(0,0,CANVAS_W,Math.max(0,horizon));
    // Floor
    const floor=ctx.createLinearGradient(0,horizon,0,CANVAS_H);
    floor.addColorStop(0,lightenHex(theme.floor,.18));
    floor.addColorStop(.55,theme.floor);
    floor.addColorStop(1,"#020101");
    ctx.fillStyle=floor; ctx.fillRect(0,horizon,CANVAS_W,CANVAS_H-horizon);

    // Floor boards (perspective converging lines)
    ctx.save();ctx.globalAlpha=0.22;
    for(let yy=Math.max(horizon+18,0);yy<CANVAS_H;yy+=28){
      const t=(yy-horizon)/Math.max(1,CANVAS_H-horizon);
      ctx.strokeStyle=`rgba(255,225,190,${.04*(1-t)})`;
      ctx.beginPath();ctx.moveTo(CANVAS_W*(.5-t*.52)+sway+shakeX,yy);ctx.lineTo(CANVAS_W*(.5+t*.52)+sway+shakeX,yy);ctx.stroke();
    }
    ctx.restore();

    // ── DDA raycasting with zbuffer ────────────────────────────────────────
    const table=rayTable.current;
    if(!table) return;
    const stripW=CANVAS_W/RAYS+1;
    zbuf.current.fill(MAX_DEPTH+1);

    for(let i=0;i<RAYS;i++){
      const rayAngle=p.angle+table[i].angle;
      const hit=castRay(r.grid,p.x,p.y,rayAngle);
      const corrected=hit.depth*Math.cos(table[i].angle); // fish-eye correction
      zbuf.current[i]=corrected;
      const wallH=clamp((CELL*590)/Math.max(1,corrected),0,CANVAS_H*1.85);
      const x=i*(CANVAS_W/RAYS)+shakeX;
      const y=horizon-wallH/2;
      const shade=clamp(1-corrected/MAX_DEPTH,.1,1);
      const edgeShade=1;
      // Texture: use wallX for alternating brickwork pattern
      const tx=hit.wallX;
      const brickRow=Math.floor(corrected/CELL);
      const brickShift=brickRow%2*.5;
      const brickX=((tx+brickShift)%1+1)%1;
      const mortar=brickX<0.04||brickX>0.96?0.55:1;
      const verticalDarken=hit.side===1?.82:1;
      ctx.fillStyle=hit.side===0?lightenHex(theme.wallA,.06):lightenHex(theme.wallB,.04);
      ctx.globalAlpha=1;
      ctx.fillRect(x,y,stripW,wallH);
      // Depth darkening
      ctx.fillStyle=`rgba(0,0,0,${clamp(.1+(1-shade*mortar*verticalDarken)*.84,0,.95)})`;
      ctx.fillRect(x,y,stripW,wallH);
      // Occasional grunge marks
      if((Math.floor(tx*CELL))%31<2){ctx.fillStyle=`rgba(0,0,0,${.14*shade})`;ctx.fillRect(x,y,stripW,wallH);}
    }

    // ── Sprites ──────────────────────────────────────────────────────────
    const sprites=[
      ...r.activeFlares.map(f=>({...f,type:"activeFlare"})),
      ...(r.exit.active?[{...r.exit,type:"exit"}]:[]),
      ...r.items,...r.lores,...r.batteries,...r.medkits,...r.flares,...r.ammo,
      ...(r.lighter&&!r.lighter.collected?[r.lighter]:[]),
      ...(r.cameraItem&&!r.cameraItem.collected?[r.cameraItem]:[]),
      ...(r.stunGunItem&&!r.stunGunItem.collected?[r.stunGunItem]:[]),
      ...r.specials.filter(s=>!s.used),
      ...r.traps.filter(t=>!t.triggered),
    ].sort((a,b)=>dist(p,b)-dist(p,a));

    for(const s of sprites){
      if(s.type==="fragment")       drawSprite(ctx,r,s,{color:"#ff3030",shadow:"#ff0000",glow:24,max:130});
      else if(s.type==="lore")      drawSprite(ctx,r,s,{color:"#d8c08b",glow:10,max:105});
      else if(s.type==="battery")   drawSprite(ctx,r,s,{color:"#ffe868",glow:12,max:92});
      else if(s.type==="medkit")    drawSprite(ctx,r,s,{color:"#f7f7f7",glow:9,max:90});
      else if(s.type==="flare"||s.type==="activeFlare") drawSprite(ctx,r,s,{color:"#ff9b30",glow:s.type==="activeFlare"?36:16,max:s.type==="activeFlare"?130:88});
      else if(s.type==="camera")    drawSprite(ctx,r,s,{color:"#7fd7ff",glow:18,max:95});
      else if(s.type==="stungun"||s.type==="ammo") drawSprite(ctx,r,s,{color:"#59a8ff",glow:18,max:95});
      else if(s.type==="lighter")   drawSprite(ctx,r,s,{color:"#ffd18a",glow:18,max:90});
      else if(s.type==="special")   drawSprite(ctx,r,s,{color:"#b46cff",glow:20,max:120});
      else if(s.type==="trap")      drawSprite(ctx,r,s,{color:"rgba(90,90,90,.85)",glow:3,max:65,alpha:.62});
      else if(s.type==="exit")      drawSprite(ctx,r,s,{color:"#61ff85",glow:34,max:190});
    }
    drawMonster(ctx,r);

    // ── FLASHLIGHT — the key fix ──────────────────────────────────────────
    // The flashlight is a layered system:
    // 1. Hard dark vignette fills the entire canvas
    // 2. A shaped cone mask punches through
    // 3. A volumetric warm beam overlaid with multiply
    const flashOn=!p.flashlightOff&&(p.battery>0||p.hasLighter);
    const batFrac=flashOn?clamp(p.battery/Math.max(1,p.maxBattery),.18,1):0;
    const lighter=flashOn&&p.hasLighter;

    // Base darkness layer
    ctx.globalAlpha=1;
    const baseDark=r.event?.type==="brownout"?.86:lighter?.7:.0;
    if(!flashOn||baseDark>0){
      ctx.fillStyle=`rgba(0,0,0,${flashOn?baseDark:.93})`;
      ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
    }

    if(flashOn&&!lighter){
      // Beam origin — slightly below center, follows bob
      const bx=CANVAS_W/2+sway*5+shakeX;
      const by=horizon+6+shakeY;

      // Punch-through mask: use destination-out to carve light from darkness
      ctx.save();
      // Draw the darkness layer first at full alpha
      ctx.fillStyle="rgba(0,0,0,.97)";
      ctx.fillRect(0,0,CANVAS_W,CANVAS_H);

      // Now carve a cone out with a custom clip path
      ctx.globalCompositeOperation="destination-out";

      // Main cone shape — wide at bottom, tight at origin
      const coneAngle=FOV*.55;
      const coneLen=CANVAS_H*1.6;
      const cx1=bx+Math.cos(-Math.PI/2-coneAngle)*coneLen;
      const cy1=by +Math.sin(-Math.PI/2-coneAngle)*coneLen;
      const cx2=bx+Math.cos(-Math.PI/2+coneAngle)*coneLen;
      const cy2=by +Math.sin(-Math.PI/2+coneAngle)*coneLen;

      const coneGrad=ctx.createRadialGradient(bx,by,0,bx,by,coneLen);
      coneGrad.addColorStop(0,`rgba(0,0,0,${batFrac})`);
      coneGrad.addColorStop(.18,`rgba(0,0,0,${batFrac*.9})`);
      coneGrad.addColorStop(.55,`rgba(0,0,0,${batFrac*.55})`);
      coneGrad.addColorStop(.85,`rgba(0,0,0,${batFrac*.18})`);
      coneGrad.addColorStop(1,"rgba(0,0,0,0)");
      ctx.fillStyle=coneGrad;
      ctx.beginPath();
      ctx.moveTo(bx,by);
      ctx.lineTo(cx1,cy1);
      ctx.arc(bx,by,coneLen,-Math.PI/2-coneAngle,-Math.PI/2+coneAngle);
      ctx.lineTo(bx,by);
      ctx.fill();

      // Small close-range halo around the source
      const haloGrad=ctx.createRadialGradient(bx,by,0,bx,by,160);
      haloGrad.addColorStop(0,`rgba(0,0,0,${batFrac*.65})`);
      haloGrad.addColorStop(1,"rgba(0,0,0,0)");
      ctx.fillStyle=haloGrad;
      ctx.beginPath();ctx.arc(bx,by,160,0,Math.PI*2);ctx.fill();

      ctx.globalCompositeOperation="source-over";

      // Warm tint of the beam (additive glow — not darkness punching)
      ctx.globalAlpha=batFrac*.14;
      const warmGrad=ctx.createRadialGradient(bx,by,0,bx,by,coneLen*.7);
      warmGrad.addColorStop(0,`rgba(255,242,200,1)`);
      warmGrad.addColorStop(.3,`rgba(255,225,160,.6)`);
      warmGrad.addColorStop(1,"rgba(0,0,0,0)");
      ctx.fillStyle=warmGrad;
      ctx.beginPath();ctx.moveTo(bx,by);ctx.lineTo(cx1,cy1);ctx.arc(bx,by,coneLen*.7,-Math.PI/2-coneAngle,-Math.PI/2+coneAngle);ctx.lineTo(bx,by);ctx.fill();

      // Battery flicker
      if(batFrac<0.35){
        const flicker=Math.sin(r.time*.08+Math.random())*.15;
        ctx.globalAlpha=Math.max(0,flicker);
        ctx.fillStyle="rgba(0,0,0,.5)";
        ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
      }
      ctx.restore();
    } else if(lighter){
      // Lighter: tiny dim ambient sphere only
      ctx.save();
      ctx.fillStyle="rgba(0,0,0,.97)";
      ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
      ctx.globalCompositeOperation="destination-out";
      const lg=ctx.createRadialGradient(CANVAS_W/2+shakeX,horizon+shakeY,0,CANVAS_W/2+shakeX,horizon+shakeY,260);
      lg.addColorStop(0,"rgba(0,0,0,.72)");
      lg.addColorStop(.55,"rgba(0,0,0,.32)");
      lg.addColorStop(1,"rgba(0,0,0,0)");
      ctx.fillStyle=lg; ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
      ctx.globalCompositeOperation="source-over";
      ctx.restore();
    }

    // Flare light blooms
    for(const f of r.activeFlares){
      const d=dist(p,f);
      if(d<f.radius*2&&hasLineOfSight(r.grid,p,f)){
        ctx.fillStyle=`rgba(255,95,20,${clamp((f.radius*2-d)/(f.radius*2),0,1)*.15})`;
        ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
      }
    }

    // Fog tint
    const [fr,fg,fb]=theme.fog;
    ctx.fillStyle=`rgba(${fr},${fg},${fb},.16)`;
    ctx.fillRect(0,0,CANVAS_W,CANVAS_H);

    // Gun flash
    if(r.gunFlash>0){ctx.fillStyle=`rgba(180,220,255,${r.gunFlash/250})`;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);}

    // Sanity effects
    if(p.sanity<40){
      const s=1-p.sanity/40;
      ctx.save();
      ctx.globalAlpha=s*.22;
      ctx.fillStyle=`rgba(80,0,0,1)`;
      // Vignette
      const vig=ctx.createRadialGradient(CANVAS_W/2,CANVAS_H/2,CANVAS_H*.3,CANVAS_W/2,CANVAS_H/2,CANVAS_W*.7);
      vig.addColorStop(0,"rgba(0,0,0,0)"); vig.addColorStop(1,`rgba(60,0,0,${s*.6})`);
      ctx.fillStyle=vig; ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
      ctx.restore();
    }

    // Monster-proximity heartbeat red pulse
    const md=dist(p,r.monster);
    if(md<380){
      const prox=1-md/380;
      const pulse=Math.max(0,Math.sin(r.heartbeat*0.0075)*prox*.12);
      ctx.fillStyle=`rgba(120,0,0,${pulse})`;
      ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
    }

    // Glitch horizontal bars
    if(r.glitch>0){
      for(let i=0;i<Math.floor(10*r.glitch);i++){
        ctx.fillStyle=`rgba(255,0,0,${rand(.015,.07)*r.glitch})`;
        ctx.fillRect(rand(0,CANVAS_W),rand(0,CANVAS_H),rand(20,220),rand(1,8));
      }
    }

    // Crosshair
    ctx.strokeStyle="rgba(255,255,255,.34)"; ctx.lineWidth=1;
    ctx.beginPath();
    ctx.moveTo(CANVAS_W/2-8,CANVAS_H/2);ctx.lineTo(CANVAS_W/2-2,CANVAS_H/2);
    ctx.moveTo(CANVAS_W/2+2,CANVAS_H/2);ctx.lineTo(CANVAS_W/2+8,CANVAS_H/2);
    ctx.moveTo(CANVAS_W/2,CANVAS_H/2-8);ctx.lineTo(CANVAS_W/2,CANVAS_H/2-2);
    ctx.moveTo(CANVAS_W/2,CANVAS_H/2+2);ctx.lineTo(CANVAS_W/2,CANVAS_H/2+8);
    ctx.stroke();

    // Interact prompt
    const target=getInteractTarget(r);
    if(target){
      ctx.fillStyle="rgba(0,0,0,.56)"; ctx.fillRect(CANVAS_W/2-180,CANVAS_H-128,360,42);
      ctx.strokeStyle="rgba(255,255,255,.12)"; ctx.strokeRect(CANVAS_W/2-180,CANVAS_H-128,360,42);
      ctx.fillStyle="rgba(255,235,200,.92)"; ctx.font="bold 12px 'Share Tech Mono',monospace"; ctx.textAlign="center";
      const names={fragment:"TAKE SIGNAL FRAGMENT",lore:"READ DOCUMENT",battery:"TAKE BATTERY",medkit:"USE MEDKIT",flare:"TAKE FLARE",ammo:"TAKE AMMO",lighter:"TAKE LIGHTER",camera:"TAKE CAMERA",stungun:"TAKE STUN PISTOL",special:target.name?.toUpperCase()||"USE ROOM",exit:"ENTER EXIT"};
      ctx.fillText(`[E] ${names[target.type]||"INTERACT"}`,CANVAS_W/2,CANVAS_H-103);
    }

    // HUD
    ctx.textAlign="left";
    drawBar(ctx,22,42,136,12,p.hp/p.maxHp,"LIVES");
    drawBar(ctx,176,42,136,12,p.battery/p.maxBattery,"BATTERY");
    drawBar(ctx,330,42,136,12,p.stamina/p.maxStamina,"STAMINA");
    drawBar(ctx,484,42,136,12,p.sanity/p.maxSanity,"SANITY");
    ctx.fillStyle="rgba(235,220,210,.9)"; ctx.font="bold 13px 'Share Tech Mono',monospace";
    ctx.fillText(`${theme.name.toUpperCase()}  FLOOR ${r.floorNum}`,22,22);
    ctx.fillText(`FRAGMENTS ${r.collected}/${ITEM_COUNT}`,650,48);
    ctx.fillText(`FLARES ${p.flares||0}`,650,68);
    ctx.fillText(`STUN ${p.hasStunGun?p.stunAmmo:"—"}`,760,68);
    ctx.fillText(`CAM ${p.hasCamera?Math.floor(p.cameraCharge)+"%":"—"}`,850,68);
    if(r.event){ctx.fillStyle="rgba(255,65,65,.96)";ctx.fillText(`${r.event.name} ${(r.event.timer/1000).toFixed(1)}s`,650,28);}
    ctx.fillStyle="rgba(225,205,205,.78)"; ctx.font="12px 'Share Tech Mono',monospace";
    ctx.fillText(r.message||"",22,CANVAS_H-28);

    // Compass
    const obj=r.exit.active?r.exit:r.items.filter(i=>!i.collected).sort((a,b)=>dist(a,p)-dist(b,p))[0];
    if(obj){
      const a=normAng(Math.atan2(obj.y-p.y,obj.x-p.x)-p.angle);
      ctx.save();ctx.translate(CANVAS_W/2+Math.sin(a)*120,82);ctx.rotate(a);
      ctx.fillStyle=r.exit.active?"#60ff88":"#ff4b4b";
      ctx.beginPath();ctx.moveTo(0,-10);ctx.lineTo(8,8);ctx.lineTo(0,4);ctx.lineTo(-8,8);ctx.closePath();ctx.fill();
      ctx.restore();
    }

    drawMiniMap(ctx,r);

    // Lore popup
    if(r.loreRead){
      const alpha=Math.min(1,r.loreRead.timer/600);
      ctx.save();ctx.globalAlpha=alpha;
      ctx.fillStyle="rgba(4,2,6,.92)"; ctx.fillRect(170,168,640,160);
      ctx.strokeStyle="rgba(210,170,90,.4)"; ctx.strokeRect(170,168,640,160);
      ctx.fillStyle="rgba(230,205,170,.94)"; ctx.font="13px 'Share Tech Mono',monospace";
      const words=r.loreRead.text.split(" ");let line="",y2=210;
      for(const word of words){const test=line+(line?" ":"")+word;if(ctx.measureText(test).width>560){ctx.fillText(line,205,y2);line=word;y2+=20;}else line=test;}
      if(line) ctx.fillText(line,205,y2);
      ctx.restore();
    }

    // Scare flash
    if(r.scare){
      ctx.save();ctx.globalAlpha=clamp(r.scare.timer/500,0,1);
      ctx.fillStyle="rgba(90,0,0,.55)"; ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
      ctx.fillStyle="rgba(255,235,235,.96)";
      ctx.font=`bold ${80+Math.sin(r.time*.04)*10}px 'Share Tech Mono',monospace`;
      ctx.textAlign="center";
      ctx.fillText(r.scare.text,CANVAS_W/2+rand(-4,4),CANVAS_H/2+rand(-4,4));
      ctx.restore();
    }

    // Title / death / win overlay
    if(!started||r.dead||r.won){
      ctx.save();ctx.fillStyle="rgba(0,0,0,.74)";ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
      ctx.textAlign="center";
      ctx.fillStyle=r.dead?"#ff4040":r.won?"#8cff9f":"#eadede";
      ctx.font="bold 42px 'Crimson Pro',serif";
      ctx.fillText(r.dead?"IT HEARD YOU":r.won?"YOU ESCAPED":"SOMETHING HEARD YOU",CANVAS_W/2,230);
      ctx.fillStyle="rgba(230,205,205,.78)"; ctx.font="14px 'Share Tech Mono',monospace";
      ctx.fillText(r.dead||r.won?"Press Restart to play again.":"Click to lock mouse. WASD moves. Mouse looks. E picks up.",CANVAS_W/2,275);
      ctx.fillText("F flashlight · Shift sprint · Ctrl crouch · Q flare · C camera · R stun pistol",CANVAS_W/2,305);
      ctx.restore();
    }
  }

  // ─── Input ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const down = (e) => {
      const k=e.key.toLowerCase();
      keysRef.current[k]=true;
      if(["w","a","s","d"," ","arrowup","arrowdown","arrowleft","arrowright","shift","control"].includes(k)) e.preventDefault();
      if(k==="e") pickupNearby();
      if(k==="q") throwFlare();
      if(k==="c") useCamera();
      if(k==="r") fireStunGun();
      if(k==="f"){
        const r=runRef.current;
        if(r?.player){r.player.flashlightOff=!r.player.flashlightOff;r.message=r.player.flashlightOff?"Flashlight off.":"Flashlight on.";}
      }
      if(["1","2","3"].includes(k)) applyUpgradeChoice(Number(k)-1);
    };
    const up=(e)=>{keysRef.current[e.key.toLowerCase()]=false;};
    const move=(e)=>{
      if(document.pointerLockElement===canvasRef.current){
        const r=runRef.current;
        if(r?.player&&started&&!r.dead&&!r.won){
          r.player.angle=normAng((r.player.angle||0)+e.movementX*0.0055);
          r.player.targetPitch=clamp((r.player.targetPitch||0)+e.movementY*0.004,-0.55,0.55);
        }
      }
    };
    const onFull=()=>setIsFullscreen(!!document.fullscreenElement);
    window.addEventListener("keydown",down,{passive:false});
    window.addEventListener("keyup",up);
    window.addEventListener("mousemove",move);
    document.addEventListener("fullscreenchange",onFull);
    return()=>{
      window.removeEventListener("keydown",down);
      window.removeEventListener("keyup",up);
      window.removeEventListener("mousemove",move);
      document.removeEventListener("fullscreenchange",onFull);
    };
  },[started]);

  // ─── Render loop ───────────────────────────────────────────────────────────
  useEffect(() => {
    const loop=(now)=>{
      const dt=now-lastRef.current;
      lastRef.current=now;
      const ctx=canvasRef.current?.getContext("2d");
      try {
        if (!runRef.current) runRef.current = uiRun || createFloor(1);
        updateGame(dt);
        if(ctx&&runRef.current) drawGame(ctx,runRef.current);
      } catch (err) {
        console.error("SomethingHeardYou render loop crashed:", err);
        const fresh = createFloor(1);
        runRef.current = fresh;
        setUiRun(fresh);
        setStarted(false);
        if (ctx) drawGame(ctx, fresh);
      }
      rafRef.current=requestAnimationFrame(loop);
    };
    rafRef.current=requestAnimationFrame(loop);
    return()=>cancelAnimationFrame(rafRef.current);
  },[started]);

  function toggleFullscreen(){
    const el=cardRef.current; if(!el) return;
    if(!document.fullscreenElement) el.requestFullscreen?.().catch(()=>{});
    else document.exitFullscreen?.();
  }

  // ─── JSX ──────────────────────────────────────────────────────────────────
  return (
    <div className="shy-page">
      <div className="shy-shell">
        <div className="shy-header">
          <div>
            <p className="shy-kicker">Gradeify Games · First-person horror roguelike</p>
            <h1>Something Heard You</h1>
            <p>
              A 3D hallway horror game. Collect six signal fragments, manage light and sanity,
              use emergency tools, and escape before the thing in the halls learns your route.
            </p>
          </div>
          <div className="shy-actions">
            <button onClick={restart}>{started?"Restart":"Start Run"}</button>
            <button className="shy-secondary" onClick={toggleFullscreen}>{isFullscreen?"Exit Fullscreen":"Fullscreen"}</button>
            {onExit&&<button className="shy-secondary" onClick={onExit}>Back</button>}
          </div>
        </div>

        <div ref={cardRef} className="shy-game-card">
          <canvas
            ref={canvasRef}
            tabIndex={0}
            width={CANVAS_W}
            height={CANVAS_H}
            className="shy-canvas"
            onClick={()=>{if(!started)restart();canvasRef.current?.focus?.();canvasRef.current?.requestPointerLock?.();}}
          />
          {uiRun.awaitingUpgrade&&!uiRun.won&&(
            <div className="shy-upgrade-overlay">
              <div className="shy-upgrade-title">Floor cleared. Choose one upgrade.</div>
              <div className="shy-upgrade-grid">
                {uiRun.upgradeOptions.map((up,i)=>(
                  <button key={up.key} onClick={()=>applyUpgradeChoice(i)}>
                    <strong>{i+1}. {up.name}</strong>
                    <span>{up.desc}</span>
                    <em>Level: {(uiRun.player.upgrades?.[up.key]||0)} / {up.max}</em>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="shy-controls">
            <span>WASD move</span><span>Mouse look</span><span>Arrows turn</span>
            <span>E interact</span><span>F flashlight</span><span>Shift sprint</span>
            <span>Ctrl crouch</span><span>Q flare</span><span>C camera</span><span>R stun pistol</span>
          </div>
        </div>

        <div className="shy-notes">
          <div><h3>Goal</h3><p>Find six red signal fragments. They scream when picked up — every one pulls the monster closer.</p></div>
          <div><h3>Survive</h3><p>Light protects sanity. Sprinting creates sound. Crouching is safer. Flares lure it away.</p></div>
          <div><h3>Defend</h3><p>Camera stuns at close range. Stun pistol hits harder but missing starts a hunt.</p></div>
        </div>
      </div>
    </div>
  );
}