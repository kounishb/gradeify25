import React, { useEffect, useMemo, useRef, useState } from "react";
import "../../styles/SomethingHeardYou.css";

// ─── constants ────────────────────────────────────────────────────────────────
const CANVAS_W = 980;
const CANVAS_H = 620;
const WORLD_W  = 2800;
const WORLD_H  = 2000;

const PLAYER_RADIUS  = 12;
const MONSTER_RADIUS = 22;
const ITEM_COUNT     = 6;
const LORE_COUNT     = 3;

const BATTERY_DRAIN     = 0.0014;
const SANITY_DARK_GAIN  = 0.0025;
const SANITY_MONSTER    = 0.028;
const SANITY_DECAY      = 0.006;

const MONSTER_WALK   = 1.4;
const MONSTER_INVEST = 1.8;
const MONSTER_CHASE  = 2.2;
const MONSTER_FINAL  = 2.5;

const SPECIAL_ROLES = ["breaker", "security", "supply", "altar", "archive", "sealed", "ritual"];

const UPGRADE_POOL = [
  { key:"quiet", name:"Soft Step", desc:"Footstep noise range -18%. Safer sprinting and walking.", max:4 },
  { key:"battery", name:"Deep Cell", desc:"Battery capacity +20 and slower drain.", max:4 },
  { key:"stamina", name:"Iron Lungs", desc:"Stamina capacity +18 and faster recovery.", max:4 },
  { key:"sanity", name:"Cold Nerves", desc:"Sanity capacity +15 and less panic from darkness.", max:4 },
  { key:"camera", name:"Brighter Flash", desc:"Camera stun range/duration increases.", max:3 },
  { key:"flare", name:"Hotter Flares", desc:"Thrown flares last longer and distract harder.", max:3 },
  { key:"map", name:"Dead Reckoning", desc:"Objective compass becomes more stable and security lasts longer.", max:3 },
  { key:"life", name:"Refuse Death", desc:"Gain +1 max life once.", max:1 },
];

// ─── floor themes ─────────────────────────────────────────────────────────────
const FLOOR_THEMES = [
  {
    name: "Asylum",
    floorColor: "#1e1a2b",
    wallColor: "rgba(175,145,110,0.65)",
    hallColor: "#18151f",
    voidColor: "#060410",
    fogColor: "rgba(0,0,0,0.965)",
    vignetteColor: "rgba(0,0,0,0.9)",
    ambientTint: null,
    monsterName: "The Crawler",
    monsterDesc: "Slow. Quiet. Watches from corners.",
    monsterColor: "#220404",
    eyeColor: [255,18,18],
    lorePrefix: "PATIENT",
  },
  {
    name: "Morgue",
    floorColor: "#131a1e",
    wallColor: "rgba(110,150,160,0.55)",
    hallColor: "#0e1318",
    voidColor: "#040810",
    fogColor: "rgba(0,5,8,0.97)",
    vignetteColor: "rgba(0,8,14,0.92)",
    ambientTint: "rgba(0,12,22,0.12)",
    monsterName: "The Watcher",
    monsterDesc: "Teleports near motionless players.",
    monsterColor: "#031420",
    eyeColor: [140,210,255],
    lorePrefix: "CASE",
  },
  {
    name: "Sewers",
    floorColor: "#121810",
    wallColor: "rgba(88,110,72,0.6)",
    hallColor: "#0d1208",
    voidColor: "#050804",
    fogColor: "rgba(2,5,0,0.97)",
    vignetteColor: "rgba(4,10,2,0.92)",
    ambientTint: "rgba(0,18,0,0.1)",
    monsterName: "The Mimic",
    monsterDesc: "Copies noise pulses. Impossible to track.",
    monsterColor: "#0c1a06",
    eyeColor: [80,255,80],
    lorePrefix: "LOG",
  },
  {
    name: "Hotel",
    floorColor: "#1c1414",
    wallColor: "rgba(150,85,70,0.58)",
    hallColor: "#150e0e",
    voidColor: "#070202",
    fogColor: "rgba(5,0,0,0.97)",
    vignetteColor: "rgba(8,0,0,0.92)",
    ambientTint: "rgba(25,0,0,0.13)",
    monsterName: "The Stalker",
    monsterDesc: "Only attacks in darkness, but follows forever.",
    monsterColor: "#160202",
    eyeColor: [255,120,70],
    lorePrefix: "ROOM",
  },
  {
    name: "Listening Room",
    floorColor: "#171217",
    wallColor: "rgba(170,55,90,0.5)",
    hallColor: "#0e090e",
    voidColor: "#030103",
    fogColor: "rgba(0,0,0,0.982)",
    vignetteColor: "rgba(0,0,0,0.96)",
    ambientTint: "rgba(45,0,30,0.13)",
    monsterName: "The Listener",
    monsterDesc: "Every sound is bigger. Every mistake is permanent.",
    monsterColor: "#120008",
    eyeColor: [255,40,140],
    lorePrefix: "TRANSCRIPT",
  },
];

// ─── lore fragments per floor ─────────────────────────────────────────────────
const LORE_TEXTS = [
  [
    "PATIENT 047 — 'I can hear it breathing in the walls at night. Dr. Harlow says it's in my head. But the scratches are getting closer to my room.'",
    "PATIENT 012 — 'It stood in my doorway for four hours. Just watching. When morning came the orderly found my roommate's bed empty. They never explained the smell.'",
    "STAFF NOTE — 'Something is wrong with Ward C. Three missing in two weeks. Administration insists the patients simply escaped. But the doors were locked from the inside.'",
  ],
  [
    "CASE 14 — 'Cause of death: undetermined. Subject found in cold storage Room 7. Unusual: internal temperature measured 12°C below ambient despite sealed environment. Eyes open.'",
    "CASE 31 — 'Night security footage reviewed. Camera failure between 02:14 and 02:19. When footage resumes Dr. Mercer is no longer present at his station. Dr. Mercer remains missing.'",
    "AUTOPSY NOTE — 'I have performed over 400 autopsies. I have never seen wounds like these. I will not be returning tomorrow. God help whoever comes next.'",
  ],
  [
    "LOG 003 — 'Maintenance team went down to section 7 to investigate the smell. Comms cut out at 09:42. We can still hear tapping on the pipes. It sounds like Morse. It spells STILL HERE.'",
    "LOG 017 — 'It can smell fear. I don't know how I know this. Breathing helps. I have been in this pipe for three days. Someone will find this.'",
    "LOG 029 — 'The water is black now. Whatever it leaves behind spreads. Do not touch the walls. Do not make noise. Do not stop moving. If you are reading this you already know it's too late.'",
  ],
  [
    "ROOM 606 — 'The guest checked out in 1983. The room still calls the front desk every night. Nobody is ever on the line, but the receiver is always wet.'",
    "HOUSEKEEPING — 'Do not open rooms with a red light under the door. Do not answer knocking from the inside. Do not look through the peephole if it breathes first.'",
    "MANAGER NOTE — 'The elevator descends below the basement when the building is empty. I heard a crowd applauding down there. We have no ballroom.'",
  ],
  [
    "TRANSCRIPT 1 — 'Subject repeats: It heard me thinking. Audio captures no second voice. Spectrogram reveals a pulse under 20 Hz matching the subject's heartbeat.'",
    "TRANSCRIPT 4 — 'Silence test failed. Microphones detected footsteps from inside the observation glass. There is no space between the panes.'",
    "FINAL TRANSCRIPT — 'If it stops chasing, do not relax. That means it is listening for the sound you make when you believe you are safe.'",
  ],
];

// ─── utils ────────────────────────────────────────────────────────────────────
const clamp  = (v,mn,mx) => Math.max(mn,Math.min(mx,v));
const dist   = (a,b)     => Math.hypot(a.x-b.x, a.y-b.y);
const rand   = (mn,mx)   => Math.random()*(mx-mn)+mn;
const choice = arr       => arr[Math.floor(Math.random()*arr.length)];

function defaultUpgrades(){
  return { quiet:0, battery:0, stamina:0, sanity:0, camera:0, flare:0, map:0, life:0 };
}
function statMax(upgrades,key){
  const up=upgrades||defaultUpgrades();
  if(key==="battery") return 100 + (up.battery||0)*20;
  if(key==="stamina") return 100 + (up.stamina||0)*18;
  if(key==="sanity") return 100 + (up.sanity||0)*15;
  if(key==="hp") return 3 + (up.life||0);
  return 100;
}
function chooseUpgradeOptions(player){
  const upgrades=player?.upgrades||defaultUpgrades();
  const pool=UPGRADE_POOL.filter(u=>(upgrades[u.key]||0)<u.max).sort(()=>Math.random()-0.5);
  return pool.slice(0,3);
}

function pointInRect(p,r,pad=0){
  return p.x>=r.x-pad && p.x<=r.x+r.w+pad && p.y>=r.y-pad && p.y<=r.y+r.h+pad;
}
function rectDistToPoint(rect,p){
  return Math.hypot(p.x-clamp(p.x,rect.x,rect.x+rect.w), p.y-clamp(p.y,rect.y,rect.y+rect.h));
}
function circleAABBOverlap(cx,cy,radius,rect){
  const nx=clamp(cx,rect.x,rect.x+rect.w);
  const ny=clamp(cy,rect.y,rect.y+rect.h);
  return (cx-nx)**2+(cy-ny)**2 < radius*radius;
}
function randomPointInRect(rect,pad=42){
  return { x:rand(rect.x+pad,rect.x+rect.w-pad), y:rand(rect.y+pad,rect.y+rect.h-pad) };
}
function getZoneAt(map,p,pad=0){
  return map.rooms.find(z=>pointInRect(p,z,pad)) || map.corridors.find(z=>pointInRect(p,z,pad)) || null;
}
function zonesTouch(a,b){
  if(!a||!b) return false;
  return !(a.x>b.x+b.w+6 || a.x+a.w+6<b.x || a.y>b.y+b.h+6 || a.y+a.h+6<b.y);
}
function sameZone(map,a,b){
  const az=getZoneAt(map,a,2), bz=getZoneAt(map,b,2);
  return az && bz && az.id===bz.id;
}
function isWalkable(walkable,x,y,radius){
  return walkable.some(z=>circleAABBOverlap(x,y,radius,z));
}

// ─── seeded decorations ───────────────────────────────────────────────────────
function seedRoomDetails(room, floorNum){
  const details=[], n=Math.floor(rand(4,11));
  const detailTypes = floorNum===1
    ? ["crack","stain","claw","symbol","body","debris","rust","writing"]
    : floorNum===2
    ? ["stain","body","tag","rust","debris","drip","symbol"]
    : ["crack","slime","rust","debris","moss","symbol","drip"];
  for(let i=0;i<n;i++) details.push({
    type:choice(detailTypes),
    x:rand(room.x+22,room.x+room.w-22), y:rand(room.y+22,room.y+room.h-22),
    rot:rand(0,Math.PI*2), scale:rand(0.7,1.4), r:Math.random(), g:Math.random(),
  });
  const lights=[], lc=Math.floor(rand(1,4));
  for(let i=0;i<lc;i++) lights.push({
    x:rand(room.x+50,room.x+room.w-50), y:room.y+rand(18,30),
    on:Math.random()>0.3, flicker:rand(1.5,7), phase:rand(0,Math.PI*2),
    warmth: floorNum===1 ? rand(0.4,0.9) : floorNum===2 ? rand(0.1,0.5) : rand(0.2,0.6),
  });
  return {...room,details,lights};
}

// ─── map generation ───────────────────────────────────────────────────────────
function makeMazeMap(floorNum=1){
  const rooms=[], corridors=[];
  // Floor 3 has more rooms, tighter layout
  const cols=floorNum===3?6:5, rows=floorNum===3?5:4;
  const cellW=420, cellH=340, startX=200, startY=170;
  for(let row=0;row<rows;row++){
    for(let col=0;col<cols;col++){
      const isSpawn=row===0&&col===0, isExit=row===rows-1&&col===cols-1;
      const skip=Math.random()<0.14&&!isSpawn&&!isExit;
      if(skip) continue;
      const w=rand(220,320), h=rand(160,250);
      const x=startX+col*cellW+rand(-30,30), y=startY+row*cellH+rand(-25,25);
      rooms.push(seedRoomDetails({
        id:`r-${row}-${col}`,grid:{row,col},x,y,w,h,
        type:isSpawn?"spawn":"room",decay:Math.random(),
        // Some rooms pitch black (no lights on floor 2+)
        pitchDark: floorNum>=2 && Math.random()<0.22 && !isSpawn,
      }, floorNum));
    }
  }
  const byGrid=new Map();
  rooms.forEach(r=>byGrid.set(`${r.grid.row}-${r.grid.col}`,r));
  function connect(a,b){
    if(!a||!b) return;
    const ax=a.x+a.w/2,ay=a.y+a.h/2,bx=b.x+b.w/2,by=b.y+b.h/2;
    const hf=Math.random()>0.4;
    if(hf){
      corridors.push({id:`ch-${a.id}-${b.id}`,x:Math.min(ax,bx)-28,y:ay-28,w:Math.abs(ax-bx)+56,h:56,type:"hallway",decay:Math.random()});
      corridors.push({id:`cv-${a.id}-${b.id}`,x:bx-28,y:Math.min(ay,by)-28,w:56,h:Math.abs(ay-by)+56,type:"hallway",decay:Math.random()});
    } else {
      corridors.push({id:`cv-${a.id}-${b.id}`,x:ax-28,y:Math.min(ay,by)-28,w:56,h:Math.abs(ay-by)+56,type:"hallway",decay:Math.random()});
      corridors.push({id:`ch-${a.id}-${b.id}`,x:Math.min(ax,bx)-28,y:by-28,w:Math.abs(ax-bx)+56,h:56,type:"hallway",decay:Math.random()});
    }
  }
  for(let row=0;row<rows;row++){
    const rr=rooms.filter(r=>r.grid.row===row).sort((a,b)=>a.grid.col-b.grid.col);
    for(let i=1;i<rr.length;i++) connect(rr[i-1],rr[i]);
  }
  for(let col=0;col<cols;col++){
    const cr=rooms.filter(r=>r.grid.col===col).sort((a,b)=>a.grid.row-b.grid.row);
    for(let i=1;i<cr.length;i++) if(Math.random()>0.2||i===1) connect(cr[i-1],cr[i]);
  }
  const walkable=[...rooms,...corridors];
  const spawnRoom=byGrid.get("0-0")||rooms[0];
  const exitRoom=[...rooms].filter(r=>r.id!==spawnRoom.id).sort((a,b)=>{
    const ac={x:a.x+a.w/2,y:a.y+a.h/2},bc={x:b.x+b.w/2,y:b.y+b.h/2};
    const sc={x:spawnRoom.x+spawnRoom.w/2,y:spawnRoom.y+spawnRoom.h/2};
    return dist(bc,sc)-dist(ac,sc);
  })[0];
  return {rooms,corridors,walkable,spawnRoom,exitRoom,floorNum};
}

// ─── special room factory ─────────────────────────────────────────────────────
function assignSpecialRooms(map, reservedRooms=[]){
  const reserved=new Set(reservedRooms.filter(Boolean).map(r=>r.id));
  const candidates=[...map.rooms]
    .filter(r=>!reserved.has(r.id) && r.type!=="spawn")
    .sort(()=>Math.random()-0.5);
  return SPECIAL_ROLES.map((role,i)=>{
    const room=candidates[i];
    if(!room) return null;
    const pt=randomPointInRect(room,52);
    return { id:`special-${role}-${i}`, role, roomId:room.id, x:pt.x, y:pt.y, used:false, pulse:rand(0,Math.PI*2) };
  }).filter(Boolean);
}

// ─── floor factory ────────────────────────────────────────────────────────────
const MAX_FLOORS=5;

function createFloor(floorNum=1, prevPlayer=null){
  const map=makeMazeMap(floorNum);
  const spawn=map.spawnRoom;
  const theme=FLOOR_THEMES[floorNum-1];

  const player = prevPlayer ? {
    ...prevPlayer,
    x:spawn.x+spawn.w/2, y:spawn.y+spawn.h/2,
    invuln:2200, hidden:false, bobPhase:0, crouching:false,
    stamina:100, stunned:0,
    // New items carry over
  } : {
    x:spawn.x+spawn.w/2, y:spawn.y+spawn.h/2,
    angle:0, hp:3, sanity:100, battery:100, stamina:100,
    hidden:false, invuln:2200, flashlightOff:false, bobPhase:0, crouching:false,
    stunned:0,
    hasLighter:false, flares:0, hasCamera:false, cameraCharge:100,
    hasStunGun:false, stunAmmo:0,
    scraps:0, upgrades:defaultUpgrades(), maxBattery:100, maxStamina:100, maxSanity:100, maxHp:3,
    noise:0, roomsSearched:0, archivesRead:0,
  };

  player.upgrades = player.upgrades || defaultUpgrades();
  player.maxBattery = statMax(player.upgrades,"battery");
  player.maxStamina = statMax(player.upgrades,"stamina");
  player.maxSanity = statMax(player.upgrades,"sanity");
  player.maxHp = statMax(player.upgrades,"hp");
  player.hp = clamp(player.hp ?? player.maxHp, 0, player.maxHp);
  player.battery = clamp(player.battery ?? player.maxBattery, 0, player.maxBattery);
  player.sanity = clamp(player.sanity ?? player.maxSanity, 0, player.maxSanity);
  player.stamina = clamp(player.stamina ?? player.maxStamina, 0, player.maxStamina);
  player.hasStunGun = !!player.hasStunGun;
  player.stunAmmo = player.stunAmmo || 0;

  const farRooms=[...map.rooms]
    .filter(r=>r.id!==map.spawnRoom.id)
    .sort((a,b)=>dist({x:b.x+b.w/2,y:b.y+b.h/2},player)-dist({x:a.x+a.w/2,y:a.y+a.h/2},player));

  const itemRooms=[...farRooms].sort(()=>Math.random()-0.5).slice(0,ITEM_COUNT);
  const items=itemRooms.map((room,i)=>({
    id:`frag-${i}`, ...randomPointInRect(room), collected:false,
    pulse:Math.random()*Math.PI*2, label:choice(["TAPE","IDOL","BONE","MASK","RELIC","EYE","TOOTH","NAIL","LENS","KEY"]),
  }));

  // Lore notes in far rooms that don't have items
  const loreRooms=[...farRooms].filter(r=>!itemRooms.includes(r)).sort(()=>Math.random()-0.5).slice(0,LORE_COUNT);
  const lores=loreRooms.map((room,i)=>({
    id:`lore-${i}`, ...randomPointInRect(room), collected:false,
    text:LORE_TEXTS[floorNum-1][i]||LORE_TEXTS[0][0],
  }));

  const restRooms=[...map.rooms].filter(r=>!itemRooms.some(ir=>ir.id===r.id));
  const batteries=restRooms.sort(()=>Math.random()-0.5).slice(0,6)
    .map((room,i)=>({id:`bat-${i}`,...randomPointInRect(room),collected:false}));
  const medkits=restRooms.sort(()=>Math.random()-0.5).slice(6,9)
    .map((room,i)=>({id:`med-${i}`,...randomPointInRect(room),collected:false}));

  // Special items
  const lighterRoom=restRooms[9];
  const lighter=lighterRoom?{id:'lighter',...randomPointInRect(lighterRoom),collected:prevPlayer?.hasLighter||false}:null;
  const flareRooms=restRooms.sort(()=>Math.random()-0.5).slice(10,12);
  const flares=flareRooms.map((room,i)=>({id:`flare-${i}`,...randomPointInRect(room),collected:false}));
  const cameraRoom=restRooms[12];
  const cameraItem=cameraRoom?{id:'camera',...randomPointInRect(cameraRoom),collected:prevPlayer?.hasCamera||false}:null;
  const gunRoom=restRooms[13]||farRooms[2];
  const stunGunItem=gunRoom?{id:'stungun',...randomPointInRect(gunRoom),collected:prevPlayer?.hasStunGun||false}:null;
  const ammoRooms=restRooms.sort(()=>Math.random()-0.5).slice(14,18);
  const stunAmmoPacks=ammoRooms.map((room,i)=>({id:`ammo-${i}`,...randomPointInRect(room),collected:false,amount:1+(floorNum>=3?1:0)}));

  const hidingSpots=restRooms.sort(()=>Math.random()-0.5).slice(13,22)
    .map((room,i)=>({id:`hide-${i}`,...randomPointInRect(room),r:24}));

  const specialRooms=assignSpecialRooms(map,[map.spawnRoom,map.exitRoom,...itemRooms,...loreRooms]);

  // Traps — floor 2+ has traps
  const traps=[];
  if(floorNum>=2){
    const trapRooms=[...map.corridors].sort(()=>Math.random()-0.5).slice(0,Math.floor(3+floorNum*2));
    trapRooms.forEach((zone,i)=>{
      const pt=randomPointInRect(zone,8);
      traps.push({id:`trap-${i}`, x:pt.x, y:pt.y, type:choice(floorNum===2?["glass","wire"]:["glass","wire","bear"]), triggered:false, triggerTimer:0});
    });
  }

  // Active flares array
  const activeFlares=[];

  const mIdx=Math.min(floorNum,farRooms.length-1);
  const monsterRoom=farRooms[mIdx]||farRooms[0]||map.exitRoom;
  const baseSpeed=MONSTER_CHASE+(floorNum-1)*0.14;

  // Watcher teleport tracker
  const watcherData={stillTimer:0, lastPlayerPos:{x:player.x,y:player.y}};

  const floorMessages=[
    `ASYLUM — FLOOR 1. Find the 6 signal fragments. ◈ ${theme.monsterName}: ${theme.monsterDesc}`,
    `MORGUE — FLOOR 2. Traps have been set. ◈ ${theme.monsterName}: ${theme.monsterDesc}`,
    `SEWERS — FLOOR 3. It knows this place better than you. ◈ ${theme.monsterName}: ${theme.monsterDesc}`,
    `HOTEL — FLOOR 4. Optional rooms are more dangerous, but the rewards matter. ◈ ${theme.monsterName}: ${theme.monsterDesc}`,
    `LISTENING ROOM — FLOOR 5. Every sound is evidence. ◈ ${theme.monsterName}: ${theme.monsterDesc}`,
  ];

  return {
    map, player, floorNum, theme,
    monster:{
      x:monsterRoom.x+monsterRoom.w/2, y:monsterRoom.y+monsterRoom.h/2,
      mode:"stalk", target:null, baseChase:baseSpeed,
      anger:0, stun:0, limbPhase:0, dirAngle:0, bloodTrail:[],
    },
    items, lores, batteries, medkits, lighter, flares, cameraItem, stunGunItem, stunAmmoPacks, activeFlares,
    hidingSpots, traps, specialRooms, watcherData,
    exit:{x:map.exitRoom.x+map.exitRoom.w/2, y:map.exitRoom.y+map.exitRoom.h/2, active:false, pulse:0},
    noisePulses:[], hallucinations:[], bloodSplatters:[], mimicPulses:[],
    collected:0, loreCooldown:0, finalPhase:false, won:false, dead:false, floorComplete:false,
    scare:null, loreRead:null,
    message:floorMessages[Math.min(floorNum-1,floorMessages.length-1)],
    hauntTimer:rand(5000,9000)-(floorNum-1)*1000,
    time:0, glitch:0, objectiveBlink:0, heartbeatPhase:0,
    invertControls:0, sanityEffects:[], // sanity hallucination effects
    trapped:0, // slow debuff timer
    powerOn:true, securityPing:0, event:null, eventTimer:rand(16000,28000),
    awaitingUpgrade:false, upgradeOptions:[], floorReward:1,
  };
}

// ─── component ────────────────────────────────────────────────────────────────
export default function SomethingHeardYou({onExit}){
  const canvasRef=useRef(null);
  const cardRef=useRef(null);
  const keysRef  =useRef({});
  const mouseRef =useRef({x:CANVAS_W/2,y:CANVAS_H/2});
  const runRef   =useRef(null);
  const rafRef   =useRef(null);
  const lastRef  =useRef(performance.now());

  const [started,setStarted]=useState(false);
  const [isFullscreen,setIsFullscreen]=useState(false);
  const [run,setRun]=useState(()=>createFloor(1));

  const horrorLines=useMemo(()=>[
    "Something is listening.",
    "The dark is not empty.",
    "Do not sprint unless you have to.",
    "The walls remember you.",
    "You hear footsteps copying yours.",
    "Your flashlight catches a shape, then nothing.",
    "The hallway is longer than it was.",
    "That door was not open before.",
    "It only needs to hear you once.",
    "The air smells of copper.",
    "You counted six steps. There were seven.",
    "Don't look at the ceiling.",
    "It has been watching since you arrived.",
    "You are not the first one here.",
    "The exit is a lie it tells you.",
    "Something just moved behind you.",
    "Your flashlight is getting dimmer.",
    "It doesn't breathe. But you can hear it.",
    "The temperature just dropped.",
    "Don't stop moving.",
  ],[]);

  useEffect(()=>{runRef.current=run;},[run]);

  function restart(){
    const fresh=createFloor(1);
    runRef.current=fresh; setRun(fresh); setStarted(true);
    lastRef.current=performance.now();
  }

  // ── noise ──────────────────────────────────────────────────────────────────
  function createNoise(r,x,y,power,isMimic=false){
    const quiet=1-((r.player?.upgrades?.quiet||0)*0.18);
    const listenerBoost=r.floorNum>=5?1.25:1;
    const eventBoost=r.event?.type==="listening"?1.45:1;
    power=Math.max(12,power*quiet*listenerBoost*eventBoost);
    if(r.player) r.player.noise=clamp((r.player.noise||0)+power*0.22,0,100);
    if(isMimic){
      r.mimicPulses.push({x,y,pr:4,max:power,alpha:0.6});
    } else {
      r.noisePulses.push({x,y,pr:4,max:power,alpha:0.82});
    }
    if(isMimic) return; // mimic pulses don't alert monster

    const d=Math.hypot(r.monster.x-x,r.monster.y-y);
    if(d<power+140){
      r.monster.target={x,y};
      r.monster.mode=d<power*0.6?"chase":"investigate";
      r.monster.anger=clamp(r.monster.anger+18,0,100);
      if(d<power*0.6) r.message="It heard that.";
    }
  }

  function triggerScare(r,text="RUN"){
    r.scare={text,timer:1100,seed:Math.random()};
    r.player.sanity=clamp(r.player.sanity-28,0,100);
    r.glitch=1;
  }

  // ── monster-specific AI behaviors ──────────────────────────────────────────
  function updateWatcher(r,dt){
    // Floor 2: The Watcher — teleports near player if player is still too long
    const wd=r.watcherData, p=r.player;
    const playerMoved=Math.hypot(p.x-wd.lastPlayerPos.x,p.y-wd.lastPlayerPos.y)>15;
    if(playerMoved){
      wd.stillTimer=0;
      wd.lastPlayerPos={x:p.x,y:p.y};
    } else {
      wd.stillTimer+=dt;
      if(wd.stillTimer>6500&&r.monster.mode!=="chase"){
        // Teleport to a room adjacent to player
        const pz=getZoneAt(r.map,p,5);
        const candidates=r.map.rooms.filter(room=>{
          const c={x:room.x+room.w/2,y:room.y+room.h/2};
          return dist(c,p)>120 && dist(c,p)<400 && room.id!==pz?.id;
        });
        const target=choice(candidates)||r.map.rooms[Math.floor(Math.random()*r.map.rooms.length)];
        r.monster.x=target.x+target.w/2;
        r.monster.y=target.y+target.h/2;
        r.monster.mode="investigate";
        r.monster.target={x:p.x,y:p.y};
        wd.stillTimer=0;
        triggerScare(r,"BLINK");
        r.message="You stood still too long.";
        r.glitch=0.7;
      }
    }
  }

  function updateMimic(r,dt){
    // Floor 3: The Mimic — occasionally spawns fake noise pulses near player to confuse
    if(!r._mimicTimer) r._mimicTimer=rand(4000,8000);
    r._mimicTimer-=dt;
    if(r._mimicTimer<=0){
      const p=r.player;
      const angle=rand(0,Math.PI*2);
      createNoise(r, p.x+Math.cos(angle)*rand(80,200), p.y+Math.sin(angle)*rand(80,200), 140, true);
      r._mimicTimer=rand(3500,7000);
      r.message="That noise wasn't yours.";
    }
  }

  function activateSpecial(r,sp){
    const p=r.player;
    const role=sp.role;
    sp.used=true;
    p.roomsSearched=(p.roomsSearched||0)+1;
    if(role==="breaker"){
      r.powerOn=true;
      r.map.rooms.forEach(room=>{ if(dist({x:room.x+room.w/2,y:room.y+room.h/2},sp)<520) room.pitchDark=false; });
      createNoise(r,sp.x,sp.y,260);
      r.securityPing=Math.max(r.securityPing||0,2500);
      r.message="Breaker room restored nearby lights, but the switch screamed.";
    } else if(role==="security"){
      r.securityPing=9000+(p.upgrades.map||0)*3500;
      createNoise(r,sp.x,sp.y,125);
      r.message="Security terminal online. Monster and objectives revealed briefly.";
    } else if(role==="supply"){
      p.flares=(p.flares||0)+1+(p.upgrades.flare>=2?1:0);
      p.battery=clamp(p.battery+45,0,p.maxBattery);
      p.sanity=clamp(p.sanity+12,0,p.maxSanity);
      createNoise(r,sp.x,sp.y,90);
      r.message="Supply room looted: flare, battery, and a moment to breathe.";
    } else if(role==="altar"){
      p.sanity=clamp(p.sanity-22,0,p.maxSanity);
      p.scraps=(p.scraps||0)+1;
      r.monster.mode="investigate";
      r.monster.target={x:sp.x,y:sp.y};
      createNoise(r,sp.x,sp.y,210);
      r.message="You took a cursed shard. Permanent upgrade currency gained.";
    } else if(role==="archive"){
      p.archivesRead=(p.archivesRead||0)+1;
      p.scraps=(p.scraps||0)+(p.archivesRead%2===0?1:0);
      p.sanity=clamp(p.sanity-8,0,p.maxSanity);
      r.securityPing=Math.max(r.securityPing||0,5000);
      createNoise(r,sp.x,sp.y,70);
      r.message=p.archivesRead%2===0?"Archive decoded: +1 cursed shard.":"Archive read. The building makes more sense now.";
    } else if(role==="sealed"){
      const docs=r.lores.filter(l=>l.collected).length;
      if(docs>=1){
        p.scraps=(p.scraps||0)+1;
        p.battery=clamp(p.battery+25,0,p.maxBattery);
        createNoise(r,sp.x,sp.y,180);
        r.message="Sealed office opened using a document code. +1 cursed shard.";
      } else {
        sp.used=false;
        r.message="Sealed office. Find at least one document code first.";
      }
    } else if(role==="ritual"){
      p.scraps=(p.scraps||0)+1;
      r.hauntTimer=Math.min(r.hauntTimer,900);
      r.monster.mode="chase";
      r.monster.target={x:p.x,y:p.y};
      createNoise(r,sp.x,sp.y,320);
      r.message="Ritual circle broken. +1 cursed shard, but it knows exactly where you are.";
    }
    r.glitch=Math.max(r.glitch,0.35);
  }

  function applyUpgradeChoice(index){
    const r=runRef.current;
    if(!r||!r.awaitingUpgrade||r.won) return;
    const up=r.upgradeOptions[index];
    if(!up){
      const next=createFloor(r.floorNum+1,r.player);
      next.message="No upgrades left, going deeper.";
      runRef.current=next; setRun(next); return;
    }
    const p=r.player;
    p.upgrades=p.upgrades||defaultUpgrades();
    // Floor-clear upgrades are guaranteed. Optional cursed shards still show as bonus currency,
    // but the player should never get stuck because an upgrade key/button did nothing.
    if((p.scraps||0)>0) p.scraps=Math.max(0,(p.scraps||0)-1);
    p.upgrades[up.key]=clamp((p.upgrades[up.key]||0)+1,0,up.max);
    p.maxBattery=statMax(p.upgrades,"battery");
    p.maxStamina=statMax(p.upgrades,"stamina");
    p.maxSanity=statMax(p.upgrades,"sanity");
    p.maxHp=statMax(p.upgrades,"hp");
    p.battery=clamp(p.battery+30,0,p.maxBattery);
    p.stamina=p.maxStamina;
    p.sanity=clamp(p.sanity+25,0,p.maxSanity);
    p.hp=clamp(p.hp+1,0,p.maxHp);
    const next=createFloor(r.floorNum+1,p);
    next.message=`Upgrade installed: ${up.name}.`;
    runRef.current=next;
    setRun(next);
  }

  function startRandomEvent(r){
    if(r.event||r.dead||r.won||r.floorComplete) return;
    const options=[
      {type:"brownout", name:"BROWNOUT", timer:4200, msg:"Brownout. Lights dimmed briefly — scary, but not instant death. Keep moving."},
      {type:"lockdown", name:"LOCKDOWN", timer:10000, msg:"Lockdown. Doors grind shut somewhere nearby."},
      {type:"hunt", name:"BLOOD HUNT", timer:8500, msg:"Blood hunt. It moves faster."},
      {type:"listening", name:"LISTENING HOUR", timer:11000, msg:"Listening hour. Every noise carries farther."},
      {type:"whispers", name:"WHISPER STORM", timer:10000, msg:"Whispers fill the vents. Keep moving."},
    ];
    const ev=choice(options);
    r.event={...ev};
    if(ev.type==="brownout"){ r.powerOn=true; r.glitch=Math.max(r.glitch,0.28); if(r.monster.mode === "chase") r.monster.mode="investigate"; }
    if(ev.type==="hunt"){ r.monster.mode="investigate"; r.monster.target={x:r.player.x,y:r.player.y}; }
    if(ev.type==="lockdown") createNoise(r,r.player.x,r.player.y,110);
    r.message=ev.msg;
  }

  // ── interact ───────────────────────────────────────────────────────────────
  function interact(){
    const r=runRef.current;
    if(!r||r.dead||r.won||r.floorComplete) return;
    const p=r.player;

    for(const sp of r.specialRooms||[]){
      if(!sp.used&&dist(p,sp)<54){
        activateSpecial(r,sp);
        return;
      }
    }

    // Lore notes
    for(const lore of r.lores){
      if(!lore.collected&&dist(p,lore)<44){
        lore.collected=true;
        r.loreRead={text:lore.text,timer:6000};
        p.sanity=clamp(p.sanity-14,0,100);
        createNoise(r,p.x,p.y,80);
        if(Math.random()<0.5) triggerScare(r,choice(["DON'T READ","TOO LATE","IT SAW YOU READ THAT"]));
        return;
      }
    }

    for(const item of r.items){
      if(!item.collected&&dist(p,item)<44){
        item.collected=true; r.collected++; r.glitch=0.85;
        p.sanity=clamp(p.sanity-10,0,100);
        createNoise(r,p.x,p.y,240);
        if(r.collected>=ITEM_COUNT){
          r.finalPhase=true; r.exit.active=true;
          r.monster.mode="chase"; r.monster.target={x:p.x,y:p.y};
          r.message="ALL FRAGMENTS. EXIT IS OPEN — RUN!";
          r.glitch=Math.max(r.glitch,0.55);
        } else {
          r.message=`${ITEM_COUNT-r.collected} fragments remain. The relic made noise, but no cheap jump scare.`;
        }
        return;
      }
    }
    for(const bat of r.batteries){
      if(!bat.collected&&dist(p,bat)<40){
        bat.collected=true; p.battery=clamp(p.battery+42,0,p.maxBattery||100);
        if(p.flashlightOff&&p.battery>0) p.flashlightOff=false;
        r.message="Battery found."; createNoise(r,p.x,p.y,80); return;
      }
    }
    for(const med of r.medkits){
      if(!med.collected&&dist(p,med)<40){
        med.collected=true; p.hp=clamp(p.hp+1,0,p.maxHp||3); p.sanity=clamp(p.sanity+20,0,p.maxSanity||100);
        r.message="Your breathing steadies."; createNoise(r,p.x,p.y,80); return;
      }
    }
    // Lighter pickup
    if(r.lighter&&!r.lighter.collected&&dist(p,r.lighter)<40){
      r.lighter.collected=true; p.hasLighter=true;
      r.message="Lighter found. Dim but infinite light.";
      createNoise(r,p.x,p.y,60); return;
    }
    // Flare pickup
    for(const flare of r.flares){
      if(!flare.collected&&dist(p,flare)<40){
        flare.collected=true; p.flares=(p.flares||0)+1;
        r.message=`Flare found. [Q] to throw. (${p.flares})`;
        createNoise(r,p.x,p.y,60); return;
      }
    }
    // Camera pickup
    if(r.cameraItem&&!r.cameraItem.collected&&dist(p,r.cameraItem)<40){
      r.cameraItem.collected=true; p.hasCamera=true; p.cameraCharge=100;
      r.message="Camera found. [C] flash = close-range monster stun.";
      createNoise(r,p.x,p.y,60); return;
    }
    // Stun gun pickup/ammo — Granny-style emergency defense
    if(r.stunGunItem&&!r.stunGunItem.collected&&dist(p,r.stunGunItem)<40){
      r.stunGunItem.collected=true; p.hasStunGun=true; p.stunAmmo=(p.stunAmmo||0)+2;
      r.message="Stun pistol found. [R] fires a loud shot that freezes the monster. Ammo: "+p.stunAmmo;
      createNoise(r,p.x,p.y,120); return;
    }
    for(const ammo of r.stunAmmoPacks||[]){
      if(!ammo.collected&&dist(p,ammo)<38){
        ammo.collected=true; p.stunAmmo=(p.stunAmmo||0)+(ammo.amount||1);
        r.message=`Stun ammo found. [R] shots: ${p.stunAmmo}.`;
        createNoise(r,p.x,p.y,70); return;
      }
    }
    if(r.exit.active&&dist(p,r.exit)<60){
      r.floorComplete=true;
      if(r.floorNum>=MAX_FLOORS){
        r.won=true; r.message="You made it out. It's still in there. Waiting.";
        triggerScare(r,"YOU ESCAPED");
      } else {
        p.scraps=(p.scraps||0)+r.floorReward;
        r.awaitingUpgrade=true;
        r.upgradeOptions=chooseUpgradeOptions(p);
        r.message=`Floor ${r.floorNum} cleared. Choose an upgrade.`;
      }
    }
  }

  function throwFlare(){
    const r=runRef.current;
    if(!r||r.dead||r.won||!r.player.flares||r.player.flares<1) return;
    r.player.flares--;
    const p=r.player;
    // Throw in facing direction
    const fx=p.x+Math.cos(p.angle)*180;
    const fy=p.y+Math.sin(p.angle)*180;
    // Clamp to walkable
    r.activeFlares.push({x:fx,y:fy,timer:9000+(p.upgrades.flare||0)*2500,radius:220+(p.upgrades.flare||0)*35});
    // Flares attract monster if it hears it
    createNoise(r,fx,fy,200);
    r.message="Flare thrown. It will come to investigate.";
  }

  function useCamera(){
    const r=runRef.current;
    if(!r||r.dead||r.won||!r.player.hasCamera||r.player.cameraCharge<30) return;
    r.player.cameraCharge-=30;
    // Flash stuns monster if close
    const d=dist(r.player,r.monster);
    const camRange=340+(r.player.upgrades.camera||0)*85;
    if(d<camRange){
      r.monster.stun=2800+(r.player.upgrades.camera||0)*650;
      r.monster.mode="stalk";
      r.monster.target=null;
      triggerScare(r,"STUNNED");
      r.message="Camera flash stunned it. Use this when it is close.";
    } else {
      r.message="Camera flash is close-range only. Save it for panic moments.";
    }
    r.glitch=0.5;
  }

  function fireStunGun(){
    const r=runRef.current;
    if(!r||r.dead||r.won||r.floorComplete) return;
    const p=r.player;
    if(!p.hasStunGun){ r.message="No stun pistol yet. Look for a blue sidearm case."; return; }
    if((p.stunAmmo||0)<=0){ r.message="Stun pistol empty. Find blue ammo boxes."; return; }
    p.stunAmmo--;
    const dx=Math.cos(p.angle), dy=Math.sin(p.angle);
    const mx=r.monster.x-p.x, my=r.monster.y-p.y;
    const forward=mx*dx+my*dy;
    const side=Math.abs(mx*dy-my*dx);
    const range=560, width=52;
    createNoise(r,p.x,p.y,360);
    r.glitch=Math.max(r.glitch,0.36);
    r.gunFlash={x:p.x,y:p.y,angle:p.angle,timer:180,hit:false};
    if(forward>0 && forward<range && side<width){
      r.monster.stun=4200;
      r.monster.mode="stalk";
      r.monster.target=null;
      r.gunFlash.hit=true;
      r.message=`Direct hit. It is stunned for 4 seconds. Ammo left: ${p.stunAmmo}.`;
    } else {
      r.monster.mode="investigate";
      r.monster.target={x:p.x,y:p.y};
      r.message=`Shot missed. It heard exactly where you are. Ammo left: ${p.stunAmmo}.`;
    }
    setRun({...r});
  }

  function toggleFullscreen(){
    const el=cardRef.current;
    if(!el) return;
    if(!document.fullscreenElement){
      el.requestFullscreen?.().catch(()=>{});
    } else {
      document.exitFullscreen?.();
    }
  }

  function getObjective(r){
    if(r.exit.active) return r.exit;
    const rem=r.items.filter(i=>!i.collected);
    return rem.length ? rem.sort((a,b)=>dist(a,r.player)-dist(b,r.player))[0] : r.exit;
  }

  // ── monster AI ────────────────────────────────────────────────────────────
  function updateMonster(r, dt){
    const p=r.player, m=r.monster;
    if(m.stun>0){ m.stun-=dt; return; }
    m.limbPhase+=dt*0.009;

    // Floor-specific behaviors
    if(r.floorNum===2) updateWatcher(r,dt);
    if(r.floorNum===3) updateMimic(r,dt);

    const same=sameZone(r.map,p,m);
    const d=dist(p,m);
    const darkEnough = p.flashlightOff || p.battery<=0 || p.sanity<35 || (r.event?.type==="brownout" && dist(p,r.monster)<120);
    const floor4CanAttack = r.floorNum!==4 || darkEnough || d<120 || r.finalPhase;
    const proximityChase=!p.hidden&&floor4CanAttack&&d<(r.finalPhase?300:220);
    const visionChase=!p.hidden&&floor4CanAttack&&same&&d<(r.finalPhase?650:490);

    if(proximityChase||visionChase){
      m.mode="chase";
      m.target={x:p.x,y:p.y};
      m.anger=clamp(m.anger+0.1*dt,0,100);
    } else if(m.mode==="chase"&&!same&&d>600){
      m.mode="investigate";
    }

    let chaseSpd=r.finalPhase
      ? MONSTER_FINAL+(r.floorNum-1)*0.16
      : m.baseChase;
    if(r.event?.type==="hunt") chaseSpd+=0.55;
    if(r.floorNum===4 && !p.flashlightOff && !r.event) chaseSpd-=0.22;
    if(r.floorNum>=5) chaseSpd+=0.22;

    if(m.mode==="stalk"){
      if(!m.target||dist(m,m.target)<40||Math.random()<0.005){
        const pz=getZoneAt(r.map,p,5);
        const cands=r.map.rooms
          .filter(room=>room.id!==pz?.id)
          .map(room=>({room,d:dist({x:room.x+room.w/2,y:room.y+room.h/2},p)}))
          .filter(e=>e.d>280&&e.d<1000)
          .sort(()=>Math.random()-0.5);
        m.target=randomPointInRect(cands[0]?.room||choice(r.map.rooms),55);
      }
      moveMonster(r,m.target,MONSTER_WALK+(r.floorNum-1)*0.1,dt);
    }
    if(m.mode==="investigate"){
      if(m.target) moveMonster(r,m.target,MONSTER_INVEST+(r.floorNum-1)*0.1,dt);
      if(!m.target||dist(m,m.target)<45){ m.mode="stalk"; m.target=null; }
    }
    if(m.mode==="chase"){
      m.target={x:p.x,y:p.y};
      moveMonster(r,m.target,chaseSpd,dt);
      if(Math.random()<0.022) r.message=choice(["RUN.","IT SEES YOU.","DON'T STOP.","FASTER.","YOU CAN'T HIDE."]);
      // Leave blood trail
      if(Math.random()<0.04) m.bloodTrail.push({x:m.x,y:m.y,alpha:0.6,r:rand(3,8)});
    }
    // Trim blood trail
    m.bloodTrail=m.bloodTrail.filter(b=>b.alpha>0.05).map(b=>({...b,alpha:b.alpha-0.0008*dt}));
    if(m.target) m.dirAngle=Math.atan2(m.target.y-m.y,m.target.x-m.x);
    m.anger=clamp(m.anger-dt*0.003,0,100);
  }

  function moveMonster(r,target,speed,dt){
    if(!target) return;
    const m=r.monster;
    const angle=Math.atan2(target.y-m.y,target.x-m.x);
    const step=speed*(dt/16.67);
    const nx=m.x+Math.cos(angle)*step, ny=m.y+Math.sin(angle)*step;
    if(isWalkable(r.map.walkable,nx,m.y,MONSTER_RADIUS)) m.x=nx;
    else m.x+=Math.cos(angle+rand(-1.5,1.5))*step*0.4;
    if(isWalkable(r.map.walkable,m.x,ny,MONSTER_RADIUS)) m.y=ny;
    else m.y+=Math.sin(angle+rand(-1.5,1.5))*step*0.4;
  }

  function haunt(r){
    const p=r.player,roll=Math.random();
    r.message=choice(horrorLines);
    r.glitch=Math.max(r.glitch,rand(0.22,0.62));
    if(roll<0.13){
      const a=rand(0,Math.PI*2);
      r.hallucinations.push({x:p.x+Math.cos(a)*rand(130,220),y:p.y+Math.sin(a)*rand(130,220),timer:rand(600,1100)});
    } else if(roll<0.26){
      createNoise(r,p.x-Math.cos(p.angle)*rand(130,240),p.y-Math.sin(p.angle)*rand(130,240),160);
      r.message="Footsteps behind you.";
    } else if(roll<0.38){ p.sanity=clamp(p.sanity-rand(6,16),0,100); }
    else if(roll<0.52){ r.monster.mode="investigate"; r.monster.target={x:p.x+rand(-240,240),y:p.y+rand(-240,240)}; }
    else if(roll<0.65&&p.sanity<45) triggerScare(r,choice(["LOOK","BEHIND YOU","FOUND YOU","DON'T BREATHE","IT'S CLOSE","ABOVE YOU"]));
    // Sanity inversion: controls flip briefly if sanity very low
    else if(roll<0.78&&p.sanity<25){
      r.invertControls=2500;
      r.message="Your mind is slipping.";
      r.glitch=0.8;
    }
    else r.message="Silence. Too much silence.";
  }

  // ── trap check ────────────────────────────────────────────────────────────
  function checkTraps(r,dt){
    const p=r.player;
    for(const trap of r.traps){
      if(trap.triggered) continue;
      const d=dist(p,trap);
      if(d<18){
        trap.triggered=true;
        if(trap.type==="glass"||trap.type==="wire"){
          createNoise(r,trap.x,trap.y,280);
          r.message=trap.type==="glass"?"You stepped on glass — it heard that.":"You tripped a wire.";
          p.sanity=clamp(p.sanity-10,0,100);
          if(Math.random()<0.5) triggerScare(r,"NOISE");
        } else if(trap.type==="bear"){
          p.hp=clamp(p.hp-1,0,3);
          r.trapped=3500;
          createNoise(r,trap.x,trap.y,200);
          p.sanity=clamp(p.sanity-18,0,100);
          triggerScare(r,"TRAPPED");
          r.bloodSplatters.push({x:p.x+rand(-20,20),y:p.y+rand(-20,20),rr:rand(5,16),alpha:0.9});
          if(p.hp<=0){ r.dead=true; r.message="The dark learned your name."; }
          else r.message=`Bear trap! ${p.hp} ${p.hp===1?"life":"lives"} remaining.`;
        }
      }
    }
    // Decay trap debuff
    if(r.trapped>0) r.trapped=Math.max(0,r.trapped-dt);
  }

  // ── main update ───────────────────────────────────────────────────────────
  function updateGame(dtMs){
    const r=runRef.current;
    if(!r||!started||r.dead||r.won) return;
    const p=r.player;

    if(r.floorComplete&&!r.won){
      r.time+=dtMs;
      setRun({...r});
      return;
    }

    const dt=Math.min(dtMs,34);
    r.time+=dt; r.objectiveBlink+=dt;
    r.glitch=Math.max(0,r.glitch-dt/1400);
    p.noise=clamp((p.noise||0)-dt*0.06,0,100);
    if(r.securityPing>0) r.securityPing=Math.max(0,r.securityPing-dt);
    r.eventTimer-=dt;
    if(r.event){
      r.event.timer-=dt;
      if(r.event.type==="whispers") p.sanity=clamp(p.sanity-dt*0.0035,0,p.maxSanity);
      if(r.event.type==="brownout") p.sanity=clamp(p.sanity-dt*0.00012,0,p.maxSanity);
      if(r.event.timer<=0){
        if(r.event.type==="brownout") r.powerOn=true;
        r.event=null;
        r.eventTimer=rand(16000,30000)-r.floorNum*900;
        r.message="The building settles. For now.";
      }
    } else if(r.eventTimer<=0){
      startRandomEvent(r);
    }
    if(r.exit.active) r.exit.pulse=(r.exit.pulse||0)+dt*0.004;
    if(r.loreCooldown>0) r.loreCooldown=Math.max(0,r.loreCooldown-dt);
    if(r.loreRead) r.loreRead.timer-=dt, r.loreRead.timer<=0 && (r.loreRead=null);
    if(r.invertControls>0) r.invertControls=Math.max(0,r.invertControls-dt);
    for(const af of r.activeFlares) af.timer-=dt;
    r.activeFlares=r.activeFlares.filter(f=>f.timer>0);
    if(r.gunFlash){ r.gunFlash.timer-=dt; if(r.gunFlash.timer<=0) r.gunFlash=null; }

    const keys=keysRef.current, cam=getCamera(r);
    if(p.invuln>0) p.invuln-=dt;
    if(p.stunned>0) p.stunned=Math.max(0,p.stunned-dt);
    p.angle=Math.atan2(mouseRef.current.y+cam.y-p.y, mouseRef.current.x+cam.x-p.x);

    let dx=0,dy=0;
    if(!p.hidden&&!p.stunned){
      const inv=r.invertControls>0?-1:1;
      if(keys.w||keys.arrowup)    dy-=inv;
      if(keys.s||keys.arrowdown)  dy+=inv;
      if(keys.a||keys.arrowleft)  dx-=inv;
      if(keys.d||keys.arrowright) dx+=inv;
    }
    const moving=dx!==0||dy!==0;
    const len=Math.hypot(dx,dy)||1; dx/=len; dy/=len;
    const crouching=keys.control||keys.ctrl;
    const sprinting=moving&&keys.shift&&p.stamina>8&&!p.hidden&&!crouching&&r.trapped<=0;
    // Crouch: very quiet, slow. Walk: normal. Sprint: fast, noisy
    const trapped=r.trapped>0;
    const speed=crouching?1.1:sprinting?3.5:(trapped?0.8:2.1);

    p.crouching=crouching;
    if(sprinting){ p.stamina=clamp(p.stamina-dt*0.07,0,p.maxStamina); if(Math.random()<0.055) createNoise(r,p.x,p.y,175); }
    else if(crouching&&moving){ if(Math.random()<0.006) createNoise(r,p.x,p.y,28); }
    else { p.stamina=clamp(p.stamina+dt*(0.025+(p.upgrades.stamina||0)*0.006),0,p.maxStamina); }
    if(moving) p.bobPhase+=dt*(sprinting?0.019:crouching?0.005:0.011);
    if(moving&&!crouching&&!sprinting&&Math.random()<0.013) createNoise(r,p.x,p.y,60);

    const nx=p.x+dx*speed*(dt/16.67);
    const ny=p.y+dy*speed*(dt/16.67);
    if(isWalkable(r.map.walkable,nx,p.y,PLAYER_RADIUS)) p.x=nx;
    if(isWalkable(r.map.walkable,p.x,ny,PLAYER_RADIUS)) p.y=ny;

    // Battery drain — lighter doesn't drain battery
    if(!p.flashlightOff&&!p.hasLighter&&p.battery>0)
      p.battery=clamp(p.battery-BATTERY_DRAIN*dt*(r.finalPhase?1.3:1)*(1-(p.upgrades.battery||0)*0.08),0,p.maxBattery);
    if(p.battery<=0&&!p.hasLighter) p.flashlightOff=true;
    // Camera charge regenerates slowly
    if(p.hasCamera) p.cameraCharge=clamp(p.cameraCharge+dt*0.004,0,100);

    updateMonster(r,dt);
    checkTraps(r,dt);

    const same=sameZone(r.map,p,r.monster);
    const md=dist(p,r.monster);
    if(!p.hidden&&same&&md<490)
      p.sanity=clamp(p.sanity-SANITY_MONSTER*dt*(1-md/530)*(1-(p.upgrades.sanity||0)*0.06),0,p.maxSanity);
    else if(p.flashlightOff&&!p.hasLighter)
      p.sanity=clamp(p.sanity-SANITY_DARK_GAIN*dt*(1-(p.upgrades.sanity||0)*0.05),0,p.maxSanity);
    else
      p.sanity=clamp(p.sanity+SANITY_DECAY*dt*(p.hasLighter?0.6:1),0,p.maxSanity);

    r.heartbeatPhase=(r.heartbeatPhase||0)+dt*clamp((450-md)/4000,0.001,0.028);

    // Monster catch
    if(md<PLAYER_RADIUS+MONSTER_RADIUS+10&&p.invuln<=0){
      if(p.hidden&&Math.random()>0.48){
        r.message="It walked past. Inches away.";
        r.monster.mode="stalk"; r.monster.target=null;
        p.sanity=clamp(p.sanity-22,0,100);
      } else {
        p.hp-=1; p.invuln=2000; p.hidden=false;
        p.sanity=clamp(p.sanity-38,0,100);
        triggerScare(r,"CAUGHT");
        r.bloodSplatters.push({x:p.x+rand(-28,28),y:p.y+rand(-28,28),rr:rand(7,22),alpha:0.9});
        if(p.hp<=0){
          r.dead=true; r.message="The dark learned your name.";
        } else {
          const spawn=r.map.spawnRoom;
          p.x=spawn.x+spawn.w/2; p.y=spawn.y+spawn.h/2;
          r.message=`Sent back to start. ${p.hp} ${p.hp===1?"life":"lives"} remaining.`;
          const safeRooms=r.map.rooms
            .filter(room=>dist({x:room.x+room.w/2,y:room.y+room.h/2},p)>500)
            .sort(()=>Math.random()-0.5);
          const room=safeRooms[0]||choice(r.map.rooms);
          const pos=randomPointInRect(room,60);
          r.monster.x=pos.x; r.monster.y=pos.y;
          r.monster.mode="stalk"; r.monster.target=null;
        }
      }
    }

    for(const pulse of r.noisePulses){pulse.pr+=dt*0.34;pulse.alpha-=dt*0.0011;}
    r.noisePulses=r.noisePulses.filter(p=>p.alpha>0&&p.pr<p.max);
    for(const pulse of r.mimicPulses){pulse.pr+=dt*0.28;pulse.alpha-=dt*0.0009;}
    r.mimicPulses=r.mimicPulses.filter(p=>p.alpha>0&&p.pr<p.max);
    for(const h of r.hallucinations) h.timer-=dt;
    r.hallucinations=r.hallucinations.filter(h=>h.timer>0);
    r.hauntTimer-=dt;
    if(r.hauntTimer<=0){ haunt(r); r.hauntTimer=rand(r.finalPhase?2200:5500,r.finalPhase?5000:11000)-(r.floorNum-1)*600; }
    if(r.scare){r.scare.timer-=dt;if(r.scare.timer<=0) r.scare=null;}

    setRun({...r});
  }

  function getCamera(r){
    const fearShake=(100-r.player.sanity)>62?((100-r.player.sanity)-62)*0.08:0;
    const shake=r.glitch*9+fearShake;
    return {
      x:clamp(r.player.x-CANVAS_W/2+rand(-shake,shake),0,WORLD_W-CANVAS_W),
      y:clamp(r.player.y-CANVAS_H/2+rand(-shake,shake),0,WORLD_H-CANVAS_H),
    };
  }

  // ══ DRAWING ══════════════════════════════════════════════════════════════════
  function drawGame(ctx,r){
    ctx.clearRect(0,0,CANVAS_W,CANVAS_H);
    const cam=getCamera(r);
    ctx.save();ctx.translate(-cam.x,-cam.y);
    drawWorld(ctx,r);
    drawMonsterBloodTrail(ctx,r);
    drawBloodSplatters(ctx,r);
    drawTraps(ctx,r);
    drawSpecialRooms(ctx,r);
    drawItems(ctx,r);
    drawLoreNotes(ctx,r);
    drawHidingSpots(ctx,r);
    drawActiveFlares(ctx,r);
    drawExit(ctx,r);
    drawNoise(ctx,r);
    drawGunFlash(ctx,r);
    drawHallucinations(ctx,r);
    drawPlayer(ctx,r);
    ctx.restore();

    drawLighting(ctx,r,cam);

    ctx.save();ctx.translate(-cam.x,-cam.y);
    drawMonsterBody(ctx,r,cam);
    ctx.restore();

    drawMonsterEyes(ctx,r,cam);
    drawHUD(ctx,r);
    drawLorePopup(ctx,r);
    drawOverlays(ctx,r);
  }

  // ── world ──────────────────────────────────────────────────────────────────
  function drawWorld(ctx,r){
    const theme=r.theme||FLOOR_THEMES[0];
    ctx.fillStyle=theme.voidColor;
    ctx.fillRect(0,0,WORLD_W,WORLD_H);

    for(const zone of r.map.walkable){
      const isHall=zone.type==="hallway";
      if(isHall){
        ctx.fillStyle=theme.hallColor;
        ctx.fillRect(zone.x,zone.y,zone.w,zone.h);
        const horiz=zone.w>zone.h;
        ctx.fillStyle="rgba(200,180,150,0.04)";
        if(horiz) ctx.fillRect(zone.x,zone.y+zone.h*0.18,zone.w,zone.h*0.64);
        else      ctx.fillRect(zone.x+zone.w*0.18,zone.y,zone.w*0.64,zone.h);
        ctx.strokeStyle=theme.wallColor; ctx.lineWidth=2;
        ctx.strokeRect(zone.x+1.5,zone.y+1.5,zone.w-3,zone.h-3);
        ctx.strokeStyle=theme.voidColor; ctx.lineWidth=10;
        ctx.strokeRect(zone.x,zone.y,zone.w,zone.h);
        // Floor-specific pipe styles
        const pipeCol=r.floorNum===3?"rgba(65,85,50,0.5)":r.floorNum===2?"rgba(60,75,85,0.5)":"rgba(95,82,65,0.5)";
        ctx.strokeStyle=pipeCol; ctx.lineWidth=3.5; ctx.lineCap="square";
        if(horiz){
          ctx.beginPath();ctx.moveTo(zone.x,zone.y+7);ctx.lineTo(zone.x+zone.w,zone.y+7);ctx.stroke();
          ctx.beginPath();ctx.moveTo(zone.x,zone.y+zone.h-7);ctx.lineTo(zone.x+zone.w,zone.y+zone.h-7);ctx.stroke();
        } else {
          ctx.beginPath();ctx.moveTo(zone.x+7,zone.y);ctx.lineTo(zone.x+7,zone.y+zone.h);ctx.stroke();
          ctx.beginPath();ctx.moveTo(zone.x+zone.w-7,zone.y);ctx.lineTo(zone.x+zone.w-7,zone.y+zone.h);ctx.stroke();
        }
      } else {
        ctx.fillStyle=theme.floorColor;
        ctx.fillRect(zone.x,zone.y,zone.w,zone.h);
        // Tile grid color per floor
        const tileAlpha=r.floorNum===2?0.04:r.floorNum===3?0.038:0.048;
        ctx.strokeStyle=`rgba(255,255,255,${tileAlpha})`; ctx.lineWidth=0.8;
        for(let tx=zone.x;tx<zone.x+zone.w;tx+=48){ctx.beginPath();ctx.moveTo(tx,zone.y);ctx.lineTo(tx,zone.y+zone.h);ctx.stroke();}
        for(let ty=zone.y;ty<zone.y+zone.h;ty+=48){ctx.beginPath();ctx.moveTo(zone.x,ty);ctx.lineTo(zone.x+zone.w,ty);ctx.stroke();}
        ctx.strokeStyle=theme.wallColor; ctx.lineWidth=3;
        ctx.strokeRect(zone.x+2,zone.y+2,zone.w-4,zone.h-4);
        ctx.strokeStyle="rgba(85,70,58,0.28)"; ctx.lineWidth=1;
        ctx.strokeRect(zone.x+11,zone.y+11,zone.w-22,zone.h-22);
        ctx.strokeStyle=theme.voidColor; ctx.lineWidth=11;
        ctx.strokeRect(zone.x,zone.y,zone.w,zone.h);
        // Lights
        if(zone.lights){
          for(const l of zone.lights){
            const t=r.time*0.001+l.phase;
            const on=l.on&&!zone.pitchDark&&Math.sin(t*l.flicker)>-0.25+Math.random()*0.04;
            if(on){
              ctx.save();
              let wr,wg,wb;
              if(r.floorNum===2){ wr=Math.floor(130*l.warmth); wg=Math.floor(155*l.warmth); wb=Math.floor(170*l.warmth); }
              else if(r.floorNum===3){ wr=Math.floor(100*l.warmth); wg=Math.floor(140*l.warmth); wb=Math.floor(100*l.warmth); }
              else { wr=Math.floor(215*l.warmth); wg=Math.floor(185*l.warmth); wb=140; }
              ctx.shadowColor=`rgba(${wr},${wg},${wb},0.9)`;ctx.shadowBlur=28;
              ctx.fillStyle=`rgba(${wr},${wg},${wb},0.88)`;ctx.fillRect(l.x-14,l.y-4,28,8);
              const lg=ctx.createRadialGradient(l.x,l.y+4,3,l.x,l.y+4,110);
              lg.addColorStop(0,`rgba(${wr},${wg},${wb},0.18)`);lg.addColorStop(1,"rgba(0,0,0,0)");
              ctx.fillStyle=lg;ctx.beginPath();ctx.ellipse(l.x,l.y+58,70,58,0,0,Math.PI*2);ctx.fill();
              ctx.restore();
            } else if(l.on){
              ctx.fillStyle="rgba(38,32,32,0.6)";ctx.fillRect(l.x-14,l.y-4,28,8);
            }
          }
        }
        // Pitch-dark room indicator
        if(zone.pitchDark){
          ctx.save();
          ctx.globalAlpha=0.22;
          ctx.fillStyle="#000"; ctx.fillRect(zone.x,zone.y,zone.w,zone.h);
          ctx.restore();
        }
        if(zone.details){
          for(const d of zone.details){
            ctx.save();ctx.translate(d.x,d.y);ctx.rotate(d.rot);ctx.globalAlpha=0.52;
            drawEnvDetail(ctx,d,r.floorNum);ctx.restore();
          }
        }
      }
    }
  }

  function drawEnvDetail(ctx,d,floorNum){
    switch(d.type){
      case"crack":{ctx.strokeStyle="rgba(0,0,0,0.8)";ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(0,0);let cx=0,cy=0;for(let i=0;i<Math.floor(3+d.r*5);i++){cx+=(d.g*32-16)*d.scale*0.5;cy+=(d.r*32-16)*d.scale*0.5;ctx.lineTo(cx,cy);}ctx.stroke();break;}
      case"stain":{ctx.fillStyle=`rgba(${65+Math.floor(d.r*35)},0,0,0.52)`;ctx.beginPath();ctx.ellipse(0,0,7+d.scale*10,4+d.scale*7,d.rot*0.5,0,Math.PI*2);ctx.fill();ctx.fillStyle="rgba(50,0,0,0.32)";ctx.fillRect(-2,3,4,d.scale*20);break;}
      case"claw":{ctx.strokeStyle="rgba(130,22,22,0.7)";ctx.lineWidth=2;for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(-6+i*4,-14*d.scale);ctx.quadraticCurveTo(d.g*18-9,0,-4+i*4,14*d.scale);ctx.stroke();}break;}
      case"symbol":{ctx.strokeStyle=floorNum===2?"rgba(30,90,140,0.55)":floorNum===3?"rgba(30,100,30,0.55)":"rgba(155,30,30,0.55)";ctx.lineWidth=1.8;const sr=12*d.scale;ctx.beginPath();ctx.arc(0,0,sr,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(0,-sr);ctx.lineTo(0,sr);ctx.moveTo(-sr,0);ctx.lineTo(sr,0);ctx.stroke();break;}
      case"body":{ctx.fillStyle="rgba(22,12,12,0.68)";ctx.beginPath();ctx.ellipse(0,8*d.scale,8*d.scale,16*d.scale,d.rot*0.3,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(0,-10*d.scale,7*d.scale,0,Math.PI*2);ctx.fill();ctx.fillStyle="rgba(85,0,0,0.42)";ctx.beginPath();ctx.ellipse(5*d.scale,10*d.scale,5*d.scale,3*d.scale,0,0,Math.PI*2);ctx.fill();break;}
      case"debris":{for(let i=0;i<5;i++){ctx.fillStyle=`rgba(${38+i*7},${30+i*5},${22+i*4},0.7)`;ctx.fillRect((d.r*22-11+i*3)*d.scale*0.5,(d.g*22-11+i*2)*d.scale*0.5,(3+d.r*6)*d.scale,(2+d.g*5)*d.scale);}break;}
      case"rust":{ctx.fillStyle="rgba(98,42,10,0.44)";for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse((d.r*16-8+i*5)*d.scale,(d.g*12-6)*d.scale,(3+d.r*5)*d.scale,(2+d.g*4)*d.scale,d.rot,0,Math.PI*2);ctx.fill();}break;}
      case"writing":{ctx.strokeStyle="rgba(155,30,30,0.68)";ctx.lineWidth=1.5;// Scratchy text lines
        for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(-18+d.r*8,(i-1)*8*d.scale);ctx.lineTo(18-d.g*6,(i-1)*8*d.scale+rand(-1,1));ctx.stroke();}break;}
      case"drip":{ctx.fillStyle=floorNum===3?"rgba(20,55,15,0.55)":"rgba(50,0,0,0.55)";for(let i=0;i<3;i++){ctx.beginPath();ctx.arc((i-1)*7*d.scale,(d.r*18)*d.scale,2+d.g*3,0,Math.PI*2);ctx.fill();}break;}
      case"slime":{ctx.fillStyle="rgba(20,50,12,0.48)";ctx.beginPath();ctx.ellipse(0,0,10*d.scale,7*d.scale,d.rot,0,Math.PI*2);ctx.fill();break;}
      case"moss":{ctx.fillStyle="rgba(28,58,18,0.52)";for(let i=0;i<5;i++){ctx.beginPath();ctx.arc((d.r*24-12)*d.scale,(d.g*14-7)*d.scale,(2+d.r*4)*d.scale,0,Math.PI*2);ctx.fill();}break;}
      case"tag":{ctx.fillStyle="rgba(20,60,80,0.38)";ctx.fillRect(-14,-8,28,16);ctx.strokeStyle="rgba(60,130,170,0.4)";ctx.lineWidth=0.8;ctx.strokeRect(-14,-8,28,16);ctx.fillStyle="rgba(100,160,190,0.55)";ctx.font="7px monospace";ctx.textAlign="center";ctx.fillText(`#${Math.floor(d.r*999+100)}`,0,3);break;}
      default:break;
    }
  }

  function drawMonsterBloodTrail(ctx,r){
    const theme=r.theme||FLOOR_THEMES[0];
    for(const b of r.monster.bloodTrail){
      ctx.save();ctx.globalAlpha=b.alpha*0.5;
      ctx.fillStyle=r.floorNum===3?"#0a1e04":r.floorNum===2?"#041218":"#1a0000";
      ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();ctx.restore();
    }
  }

  function drawBloodSplatters(ctx,r){
    for(const s of r.bloodSplatters){ctx.save();ctx.globalAlpha=s.alpha*0.72;ctx.fillStyle="#2c0000";ctx.beginPath();ctx.arc(s.x,s.y,s.rr,0,Math.PI*2);ctx.fill();ctx.restore();}
  }

  // ── traps ──────────────────────────────────────────────────────────────────
  function drawTraps(ctx,r){
    for(const trap of r.traps){
      if(trap.triggered) continue;
      ctx.save();ctx.translate(trap.x,trap.y);
      if(trap.type==="glass"){
        ctx.strokeStyle="rgba(180,220,255,0.38)";ctx.lineWidth=0.8;
        for(let i=0;i<6;i++){ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(i*1.05)*14,Math.sin(i*1.05)*14);ctx.stroke();}
        ctx.fillStyle="rgba(160,200,240,0.22)";for(let i=0;i<4;i++)ctx.fillRect(rand(-8,8),rand(-8,8),rand(2,6),rand(2,6));
      } else if(trap.type==="wire"){
        ctx.strokeStyle="rgba(210,180,100,0.32)";ctx.lineWidth=1.2;
        ctx.beginPath();ctx.moveTo(-20,0);ctx.lineTo(20,0);ctx.stroke();
        ctx.fillStyle="rgba(200,170,80,0.4)";ctx.beginPath();ctx.arc(0,0,3,0,Math.PI*2);ctx.fill();
      } else if(trap.type==="bear"){
        ctx.strokeStyle="rgba(155,140,120,0.45)";ctx.lineWidth=2;
        ctx.beginPath();ctx.arc(0,0,10,0,Math.PI*2);ctx.stroke();
        for(let i=0;i<8;i++){ctx.beginPath();ctx.moveTo(Math.cos(i*0.785)*7,Math.sin(i*0.785)*7);ctx.lineTo(Math.cos(i*0.785)*14,Math.sin(i*0.785)*14);ctx.stroke();}
        ctx.fillStyle="rgba(120,110,90,0.5)";ctx.beginPath();ctx.arc(0,0,4,0,Math.PI*2);ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawSpecialRooms(ctx,r){
    const labels={breaker:"BREAKER",security:"CAMS",supply:"SUPPLY",altar:"ALTAR",archive:"ARCHIVE",sealed:"LOCKED",ritual:"RITUAL"};
    const colors={breaker:[245,210,80],security:[80,165,255],supply:[95,230,130],altar:[210,45,45],archive:[205,175,95],sealed:[170,170,190],ritual:[210,60,180]};
    for(const sp of r.specialRooms||[]){
      if(sp.used) continue;
      const near=dist(sp,r.player)<60;
      sp.pulse=(sp.pulse||0)+0.035;
      const [cr,cg,cb]=colors[sp.role]||[200,200,200];
      ctx.save();ctx.translate(sp.x,sp.y);
      ctx.shadowColor=`rgba(${cr},${cg},${cb},${near?0.75:0.35})`;ctx.shadowBlur=near?18:8;
      ctx.strokeStyle=`rgba(${cr},${cg},${cb},${near?0.82:0.38})`;ctx.lineWidth=2;
      ctx.fillStyle=`rgba(${cr*0.12},${cg*0.12},${cb*0.12},0.75)`;
      if(sp.role==="breaker"){ctx.fillRect(-18,-18,36,36);ctx.strokeRect(-18,-18,36,36);ctx.beginPath();ctx.moveTo(-8,0);ctx.lineTo(4,-12);ctx.lineTo(0,-2);ctx.lineTo(10,-2);ctx.lineTo(-3,14);ctx.lineTo(1,3);ctx.lineTo(-8,3);ctx.stroke();}
      else if(sp.role==="security"){ctx.fillRect(-22,-14,44,28);ctx.strokeRect(-22,-14,44,28);ctx.beginPath();ctx.arc(0,0,8,0,Math.PI*2);ctx.stroke();}
      else if(sp.role==="supply"){ctx.fillRect(-19,-15,38,30);ctx.strokeRect(-19,-15,38,30);ctx.fillRect(-3,-12,6,24);ctx.fillRect(-14,-3,28,6);}
      else if(sp.role==="altar"||sp.role==="ritual"){ctx.beginPath();ctx.arc(0,0,20,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(0,-20);ctx.lineTo(18,10);ctx.lineTo(-18,10);ctx.closePath();ctx.stroke();}
      else if(sp.role==="archive"){ctx.fillRect(-14,-18,28,36);ctx.strokeRect(-14,-18,28,36);for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(-9,-9+i*6);ctx.lineTo(9,-9+i*6);ctx.stroke();}}
      else {ctx.fillRect(-18,-20,36,40);ctx.strokeRect(-18,-20,36,40);ctx.beginPath();ctx.arc(8,0,3,0,Math.PI*2);ctx.fill();}
      ctx.shadowBlur=0;
      ctx.fillStyle=`rgba(${cr},${cg},${cb},${near?0.95:0.66})`;ctx.font="bold 9px 'Courier New'";ctx.textAlign="center";ctx.fillText(labels[sp.role]||sp.role.toUpperCase(),0,31);
      if(near){ctx.fillStyle="rgba(240,230,230,0.88)";ctx.fillText("[E] USE",0,44);}
      ctx.restore();
    }
  }

  // ── items ──────────────────────────────────────────────────────────────────
  function drawItems(ctx,r){
    for(const item of r.items){
      if(item.collected) continue;
      item.pulse+=0.042;
      ctx.save();ctx.translate(item.x,item.y);ctx.rotate(item.pulse*0.35);
      const g=ctx.createRadialGradient(0,0,1,0,0,14);
      g.addColorStop(0,"#ff8080");g.addColorStop(0.45,"#b01c1c");g.addColorStop(1,"#300000");
      ctx.shadowColor="rgba(230,40,40,1)";ctx.shadowBlur=(12+Math.sin(item.pulse)*5)*2.5;
      ctx.fillStyle=g;
      ctx.beginPath();ctx.moveTo(0,-14);ctx.lineTo(8,-4);ctx.lineTo(12,0);ctx.lineTo(8,4);
      ctx.lineTo(0,14);ctx.lineTo(-8,4);ctx.lineTo(-12,0);ctx.lineTo(-8,-4);ctx.closePath();ctx.fill();
      ctx.shadowBlur=0;ctx.fillStyle="rgba(255,225,225,0.95)";ctx.beginPath();ctx.arc(0,0,3.5,0,Math.PI*2);ctx.fill();
      ctx.rotate(-item.pulse*0.35);
      ctx.fillStyle="rgba(255,125,125,0.88)";ctx.font="bold 9px 'Courier New'";ctx.textAlign="center";
      ctx.fillText(item.label,0,28);ctx.restore();
    }
    for(const bat of r.batteries){
      if(bat.collected) continue;
      ctx.save();ctx.translate(bat.x,bat.y);
      ctx.shadowColor="rgba(205,215,80,0.65)";ctx.shadowBlur=10;
      ctx.fillStyle="#28240f";ctx.strokeStyle="#a09028";ctx.lineWidth=1.5;
      ctx.fillRect(-12,-7,24,14);ctx.strokeRect(-12,-7,24,14);
      ctx.fillStyle="#c0b032";ctx.fillRect(12,-4,5,8);
      ctx.fillStyle="#7a7820";ctx.fillRect(-10,-4,18,8);
      ctx.fillStyle="#d0c038";ctx.fillRect(-10,-4,7,8);
      ctx.restore();
    }
    for(const med of r.medkits){
      if(med.collected) continue;
      ctx.save();ctx.translate(med.x,med.y);
      ctx.shadowColor="rgba(195,70,70,0.65)";ctx.shadowBlur=10;
      ctx.fillStyle="#18090a";ctx.strokeStyle="#882020";ctx.lineWidth=1.5;
      ctx.fillRect(-13,-10,26,20);ctx.strokeRect(-13,-10,26,20);
      ctx.fillStyle="#aa2828";ctx.fillRect(-3,-8,6,16);ctx.fillRect(-10,-3,20,6);ctx.restore();
    }
    // Lighter
    if(r.lighter&&!r.lighter.collected){
      ctx.save();ctx.translate(r.lighter.x,r.lighter.y);
      ctx.shadowColor="rgba(255,200,80,0.7)";ctx.shadowBlur=12;
      ctx.fillStyle="#1a1208";ctx.strokeStyle="#c87820";ctx.lineWidth=1.5;
      ctx.fillRect(-6,-14,12,20);ctx.strokeRect(-6,-14,12,20);
      ctx.fillStyle="#e09030";ctx.beginPath();ctx.arc(0,-16,4,0,Math.PI*2);ctx.fill();
      ctx.shadowColor="rgba(255,220,100,0.9)";ctx.shadowBlur=8;
      ctx.fillStyle="rgba(255,230,100,0.9)";ctx.beginPath();ctx.ellipse(0,-20,3,5,0,0,Math.PI*2);ctx.fill();
      ctx.shadowBlur=0;ctx.fillStyle="rgba(255,200,80,0.8)";ctx.font="bold 9px 'Courier New'";ctx.textAlign="center";ctx.fillText("LIGHTER",0,14);ctx.restore();
    }
    // Flares
    for(const flare of r.flares){
      if(flare.collected) continue;
      ctx.save();ctx.translate(flare.x,flare.y);
      ctx.fillStyle="#1a0810";ctx.strokeStyle="#c04025";ctx.lineWidth=1.5;
      ctx.fillRect(-5,-14,10,22);ctx.strokeRect(-5,-14,10,22);
      ctx.fillStyle="#e05535";ctx.fillRect(-4,-13,8,7);
      ctx.fillStyle="rgba(240,120,50,0.85)";ctx.font="bold 9px 'Courier New'";ctx.textAlign="center";ctx.fillText("FLARE",0,16);ctx.restore();
    }
    // Camera
    if(r.cameraItem&&!r.cameraItem.collected){
      ctx.save();ctx.translate(r.cameraItem.x,r.cameraItem.y);
      ctx.fillStyle="#0e1018";ctx.strokeStyle="#5870a0";ctx.lineWidth=1.5;
      ctx.fillRect(-14,-10,28,20);ctx.strokeRect(-14,-10,28,20);
      ctx.fillStyle="#3860a0";ctx.beginPath();ctx.arc(0,0,6,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#88a8d0";ctx.beginPath();ctx.arc(0,0,3.5,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="rgba(130,170,220,0.85)";ctx.font="bold 9px 'Courier New'";ctx.textAlign="center";ctx.fillText("CAMERA",0,18);ctx.restore();
    }
    // Stun pistol and ammo
    if(r.stunGunItem&&!r.stunGunItem.collected){
      ctx.save();ctx.translate(r.stunGunItem.x,r.stunGunItem.y);
      ctx.shadowColor="rgba(80,180,255,0.8)";ctx.shadowBlur=12;
      ctx.fillStyle="#071422";ctx.strokeStyle="#55a8ff";ctx.lineWidth=1.6;
      ctx.fillRect(-16,-7,24,10);ctx.fillRect(2,-3,12,7);ctx.strokeRect(-16,-7,24,10);
      ctx.fillStyle="#85d8ff";ctx.fillRect(7,-5,7,3);
      ctx.shadowBlur=0;ctx.fillStyle="rgba(120,205,255,0.9)";ctx.font="bold 9px 'Courier New'";ctx.textAlign="center";ctx.fillText("STUN [R]",0,20);ctx.restore();
    }
    for(const ammo of r.stunAmmoPacks||[]){
      if(ammo.collected) continue;
      ctx.save();ctx.translate(ammo.x,ammo.y);
      ctx.fillStyle="#071422";ctx.strokeStyle="rgba(85,168,255,0.72)";ctx.lineWidth=1.4;
      ctx.fillRect(-10,-8,20,16);ctx.strokeRect(-10,-8,20,16);
      ctx.fillStyle="#55a8ff";ctx.fillRect(-6,-4,12,8);
      ctx.fillStyle="rgba(120,205,255,0.85)";ctx.font="bold 8px 'Courier New'";ctx.textAlign="center";ctx.fillText("AMMO",0,17);ctx.restore();
    }
  }

  // ── lore notes ─────────────────────────────────────────────────────────────
  function drawLoreNotes(ctx,r){
    for(const lore of r.lores){
      if(lore.collected) continue;
      const near=dist(lore,r.player)<48;
      ctx.save();ctx.translate(lore.x,lore.y);
      ctx.fillStyle="#0e0c08";ctx.strokeStyle=near?"rgba(230,210,150,0.7)":"rgba(180,160,100,0.28)";ctx.lineWidth=1.5;
      // Paper shape
      ctx.beginPath();ctx.moveTo(-12,-16);ctx.lineTo(12,-16);ctx.lineTo(14,18);ctx.lineTo(-14,18);ctx.closePath();ctx.fill();ctx.stroke();
      // Lines on paper
      ctx.strokeStyle="rgba(180,160,100,0.22)";ctx.lineWidth=0.7;
      for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(-9,-9+i*6);ctx.lineTo(9,-9+i*6);ctx.stroke();}
      // Red X or ! warning sign
      ctx.fillStyle="rgba(210,50,50,0.8)";ctx.font="bold 11px monospace";ctx.textAlign="center";ctx.fillText("!",0,-2);
      if(near){ctx.fillStyle="rgba(230,210,150,0.82)";ctx.font="bold 9px 'Courier New'";ctx.fillText("[E] READ",0,30);}
      ctx.restore();
    }
  }

  function drawActiveFlares(ctx,r){
    for(const f of r.activeFlares){
      const alpha=Math.min(1,f.timer/500)*0.9;
      ctx.save();ctx.translate(f.x,f.y);
      const g=ctx.createRadialGradient(0,0,4,0,0,f.radius*0.5);
      g.addColorStop(0,`rgba(255,150,40,${alpha*0.45})`);g.addColorStop(1,"rgba(0,0,0,0)");
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,f.radius*0.5,0,Math.PI*2);ctx.fill();
      ctx.shadowColor="rgba(255,130,40,0.9)";ctx.shadowBlur=18;
      ctx.fillStyle=`rgba(255,180,60,${alpha})`;ctx.beginPath();ctx.arc(0,0,4,0,Math.PI*2);ctx.fill();
      ctx.shadowBlur=0;ctx.restore();
    }
  }

  function drawHidingSpots(ctx,r){
    for(const h of r.hidingSpots){
      const near=dist(h,r.player)<54;
      ctx.save();ctx.translate(h.x,h.y);
      ctx.fillStyle="#0b0912";
      ctx.strokeStyle=near?"rgba(155,175,255,0.58)":"rgba(255,255,255,0.13)";ctx.lineWidth=2;
      ctx.fillRect(-21,-32,42,64);ctx.strokeRect(-21,-32,42,64);
      ctx.strokeStyle=near?"rgba(155,175,255,0.32)":"rgba(255,255,255,0.07)";ctx.lineWidth=0.8;
      ctx.beginPath();ctx.moveTo(0,-30);ctx.lineTo(0,30);ctx.stroke();
      ctx.fillStyle=near?"rgba(175,195,255,0.65)":"rgba(255,255,255,0.22)";
      ctx.beginPath();ctx.arc(9,2,4,0,Math.PI*2);ctx.fill();
      if(near){ctx.fillStyle="rgba(175,195,255,0.82)";ctx.font="bold 9px 'Courier New'";ctx.textAlign="center";ctx.fillText("[SPACE]",0,46);}
      ctx.restore();
    }
  }

  function drawExit(ctx,r){
    if(!r.exit.active) return;
    const pulse=Math.sin(r.exit.pulse||0)*0.32+0.68;
    ctx.save();ctx.translate(r.exit.x,r.exit.y);
    const grd=ctx.createRadialGradient(0,0,8,0,0,105);
    grd.addColorStop(0,`rgba(55,255,95,${0.2*pulse})`);grd.addColorStop(1,"rgba(0,0,0,0)");
    ctx.fillStyle=grd;ctx.beginPath();ctx.arc(0,0,105,0,Math.PI*2);ctx.fill();
    ctx.shadowColor=`rgba(65,255,105,${0.85*pulse})`;ctx.shadowBlur=26*pulse;
    ctx.strokeStyle=`rgba(75,255,115,${0.92*pulse})`;ctx.lineWidth=3;
    ctx.strokeRect(-30,-48,60,96);ctx.fillStyle="rgba(5,20,8,0.92)";ctx.fillRect(-28,-46,56,92);
    ctx.fillStyle=`rgba(95,255,135,${pulse})`;ctx.font="bold 14px 'Courier New'";ctx.textAlign="center";
    ctx.fillText("EXIT",0,-20);ctx.fillText(`FLOOR ${r.floorNum}`,0,-4);
    ctx.strokeStyle=`rgba(95,255,135,${0.88*pulse})`;ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(0,8);ctx.lineTo(0,28);ctx.moveTo(-8,20);ctx.lineTo(0,28);ctx.lineTo(8,20);ctx.stroke();
    ctx.restore();
  }

  function drawNoise(ctx,r){
    for(const pulse of r.noisePulses){
      ctx.save();
      ctx.strokeStyle=`rgba(255,80,80,${pulse.alpha*0.24})`;ctx.lineWidth=1.8;
      ctx.beginPath();ctx.arc(pulse.x,pulse.y,pulse.pr,0,Math.PI*2);ctx.stroke();
      ctx.strokeStyle=`rgba(255,200,200,${pulse.alpha*0.1})`;ctx.lineWidth=0.8;
      ctx.beginPath();ctx.arc(pulse.x,pulse.y,pulse.pr*0.5,0,Math.PI*2);ctx.stroke();
      ctx.restore();
    }
    // Mimic pulses in a different color
    for(const pulse of r.mimicPulses){
      ctx.save();
      ctx.strokeStyle=`rgba(80,255,80,${pulse.alpha*0.22})`;ctx.lineWidth=1.5;
      ctx.beginPath();ctx.arc(pulse.x,pulse.y,pulse.pr,0,Math.PI*2);ctx.stroke();
      ctx.restore();
    }
  }

  function drawGunFlash(ctx,r){
    if(!r.gunFlash) return;
    const g=r.gunFlash;
    const alpha=clamp(g.timer/180,0,1);
    ctx.save();ctx.translate(g.x,g.y);ctx.rotate(g.angle);
    ctx.globalAlpha=alpha;
    ctx.strokeStyle=g.hit?"rgba(120,220,255,0.95)":"rgba(255,240,160,0.75)";
    ctx.lineWidth=g.hit?5:3;ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=18;
    ctx.beginPath();ctx.moveTo(10,0);ctx.lineTo(g.hit?560:420,0);ctx.stroke();
    ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.arc(24,0,8,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }

  function drawHallucinations(ctx,r){
    for(const h of r.hallucinations){
      ctx.save();ctx.translate(h.x,h.y);ctx.globalAlpha=clamp(h.timer/900,0,0.82);
      ctx.shadowColor="rgba(255,0,0,0.55)";ctx.shadowBlur=16;
      ctx.fillStyle="rgba(2,1,2,0.98)";ctx.beginPath();ctx.ellipse(0,0,28,42,0,0,Math.PI*2);ctx.fill();
      ctx.shadowBlur=0;ctx.fillStyle="rgba(255,0,0,0.9)";
      ctx.beginPath();ctx.ellipse(-10,-8,6,4.5,-0.2,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.ellipse(10,-8,6,4.5,0.2,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#000";ctx.beginPath();ctx.arc(-10,-8,3,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(10,-8,3,0,Math.PI*2);ctx.fill();
      ctx.restore();
    }
  }

  // ── player ─────────────────────────────────────────────────────────────────
  function drawPlayer(ctx,r){
    const p=r.player;
    ctx.save();ctx.translate(p.x,p.y);
    ctx.fillStyle="rgba(0,0,0,0.48)";ctx.beginPath();ctx.ellipse(2,p.crouching?8:13,13,p.crouching?3:5,0,0,Math.PI*2);ctx.fill();
    ctx.rotate(p.angle);
    if(p.hidden) ctx.globalAlpha=0.38;
    const bob=Math.sin(p.bobPhase)*2;
    const scaleY=p.crouching?0.72:1;
    ctx.save();ctx.translate(0,bob);ctx.scale(1,scaleY);
    const legSwing=Math.sin(p.bobPhase*2)*7;
    ctx.fillStyle=p.invuln>0?"#c06060":"#3e3360";
    ctx.fillRect(-5,9,4,12+legSwing);ctx.fillRect(2,9,4,12-legSwing);
    ctx.fillStyle=p.invuln>0?"#d09090":"#58487a";
    if(ctx.roundRect){ctx.beginPath();ctx.roundRect(-9,-9,18,18,2);ctx.fill();}
    else{ctx.fillRect(-9,-9,18,18);}
    const armSwing=Math.sin(p.bobPhase*2)*7;
    ctx.fillStyle=p.invuln>0?"#c06060":"#3e3360";
    ctx.fillRect(-14,-5+armSwing,4,10);ctx.fillRect(10,-5-armSwing,4,10);
    ctx.fillStyle=p.invuln>0?"#d0a0a0":"#6e5890";
    ctx.beginPath();ctx.arc(0,-15,10,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="rgba(255,255,255,0.75)";ctx.beginPath();ctx.arc(6,-15,3,0,Math.PI*2);ctx.fill();
    // Flashlight or lighter
    const hasLight=(!p.flashlightOff&&p.battery>0)||p.hasLighter;
    if(hasLight){
      if(p.hasLighter){
        ctx.fillStyle="rgba(255,190,60,0.95)";ctx.fillRect(10,-3,10,4);
        ctx.shadowColor="rgba(255,210,80,0.7)";ctx.shadowBlur=6;
        ctx.fillStyle="rgba(255,220,80,0.9)";ctx.beginPath();ctx.arc(20,0,3,0,Math.PI*2);ctx.fill();
        ctx.shadowBlur=0;
      } else {
        ctx.fillStyle="rgba(218,208,178,0.96)";ctx.fillRect(10,-3,17,6);
        ctx.fillStyle="rgba(255,252,222,0.9)";ctx.beginPath();ctx.arc(27,0,4.5,0,Math.PI*2);ctx.fill();
        ctx.shadowColor="rgba(255,250,200,0.5)";ctx.shadowBlur=8;
        ctx.fillStyle="rgba(255,252,222,0.6)";ctx.beginPath();ctx.arc(27,0,4.5,0,Math.PI*2);ctx.fill();
        ctx.shadowBlur=0;
      }
    }
    ctx.restore();ctx.restore();
  }

  // ── monster body ──────────────────────────────────────────────────────────
  function drawMonsterBody(ctx,r,cam){
    const m=r.monster, p=r.player;
    const theme=r.theme||FLOOR_THEMES[0];
    const same=sameZone(r.map,p,m);
    const d=dist(m,p);
    const chasing=m.mode==="chase"||r.finalPhase;

    const bodyOpacity=chasing?clamp((550-d)/480,0.15,1):same?clamp((350-d)/320,0.0,0.85):0;
    if(bodyOpacity<=0) return;

    const flicker=chasing?(Math.random()<0.06?rand(0.75,1):1):(Math.random()<0.18?rand(0.35,1):1);
    const op=bodyOpacity*flicker;
    const lp=m.limbPhase||0;

    ctx.save();ctx.translate(m.x,m.y);ctx.globalAlpha=op;
    ctx.rotate((m.dirAngle||0)-Math.PI/2);

    ctx.globalAlpha=op*0.4;ctx.fillStyle="#000";
    ctx.beginPath();ctx.ellipse(0,26,22,9,0,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=op;

    // Floor-specific monster silhouette tweaks
    const bodyCol=theme.monsterColor;
    const limbCol=r.floorNum===2?"#031015":r.floorNum===3?"#080f04":"#180606";

    ctx.strokeStyle=limbCol;ctx.lineWidth=4.5;ctx.lineCap="round";
    for(let i=0;i<4;i++){
      const side=i<2?-1:1,off=(i%2)*12-6;
      const swing=Math.sin(lp+i*1.5)*17;
      ctx.beginPath();ctx.moveTo(side*9,off);
      ctx.quadraticCurveTo(side*30,off+10+swing,side*24,off+34+swing);ctx.stroke();
    }
    ctx.fillStyle=bodyCol;
    ctx.beginPath();ctx.ellipse(0,-5,18,32,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=r.floorNum===2?"#021018":r.floorNum===3?"#060d04":"#1a0303";
    ctx.fillRect(-5,-38,10,15);
    ctx.fillStyle=r.floorNum===2?"#041520":r.floorNum===3?"#081204":"#200404";
    ctx.beginPath();ctx.ellipse(0,-50,17,22,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=r.floorNum===2?"#021018":r.floorNum===3?"#060c04":"#1a0303";
    ctx.lineWidth=5.5;ctx.lineCap="round";
    const armSwing=Math.sin(lp)*12;
    ctx.beginPath();ctx.moveTo(-15,-18);ctx.quadraticCurveTo(-34,10+armSwing,-28,48+armSwing);ctx.stroke();
    ctx.beginPath();ctx.moveTo(15,-18);ctx.quadraticCurveTo(34,10-armSwing,28,48-armSwing);ctx.stroke();
    const clawCol=r.floorNum===2?"rgba(30,80,130,0.45)":r.floorNum===3?"rgba(30,100,30,0.45)":"rgba(140,20,20,0.45)";
    ctx.strokeStyle=chasing?clawCol:"rgba(90,80,110,0.35)";ctx.lineWidth=1.5;
    for(let f=0;f<3;f++){
      ctx.beginPath();ctx.moveTo(-28+f*5,48+armSwing);ctx.lineTo(-32+f*6,60+armSwing);ctx.stroke();
      ctx.beginPath();ctx.moveTo(28-f*5,48-armSwing);ctx.lineTo(32-f*6,60-armSwing);ctx.stroke();
    }
    ctx.restore();

    if(chasing&&cam){
      const sx=m.x-cam.x,sy=m.y-cam.y;
      const onScreen=sx>-50&&sx<CANVAS_W+50&&sy>-50&&sy<CANVAS_H+50;
      if(!onScreen){
        ctx.save();ctx.setTransform(1,0,0,1,0,0);
        const ang=Math.atan2(sy-CANVAS_H/2,sx-CANVAS_W/2);
        const ax=CANVAS_W/2+Math.cos(ang)*265,ay=CANVAS_H/2+Math.sin(ang)*188;
        ctx.globalAlpha=0.7+Math.sin(r.time*0.009)*0.3;
        ctx.fillStyle=r.floorNum===2?"#1a60c0":r.floorNum===3?"#1a8020":"#ff1a1a";
        ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=14;
        ctx.save();ctx.translate(ax,ay);ctx.rotate(ang);
        ctx.beginPath();ctx.moveTo(20,0);ctx.lineTo(-9,-8);ctx.lineTo(-5,0);ctx.lineTo(-9,8);ctx.closePath();ctx.fill();
        ctx.restore();ctx.shadowBlur=0;ctx.restore();
      }
    }
  }

  function drawMonsterEyes(ctx,r,cam){
    const m=r.monster,p=r.player;
    const theme=r.theme||FLOOR_THEMES[0];
    const d=dist(m,p);
    const chasing=m.mode==="chase"||r.finalPhase;
    const same=sameZone(r.map,p,m);

    const eyeOpacity=chasing?clamp((650-d)/580,0.25,1):same?clamp((380-d)/340,0.0,0.9):d<250?clamp((250-d)/220,0.0,0.5):0;
    if(eyeOpacity<=0.02) return;

    const sx=m.x-cam.x,sy=m.y-cam.y;
    if(sx<-160||sx>CANVAS_W+160||sy<-160||sy>CANVAS_H+160) return;

    const facing=(m.dirAngle||0)-Math.PI/2;
    const throb=chasing?0.55+Math.abs(Math.sin(r.time*0.014))*0.45:0.7+Math.sin(r.time*0.004)*0.3;
    const [er,eg,eb]=theme.eyeColor;
    const eyeCol=`rgba(${er},${eg},${eb},${eyeOpacity*throb})`;
    const glowCol=`rgba(${er},${eg},${eb},${eyeOpacity*0.85})`;
    const glowSize=chasing?28:16;

    ctx.save();
    for(const{ex,ey} of [{ex:-6,ey:-53},{ex:6,ey:-53}]){
      const rx=ex*Math.cos(facing)-ey*Math.sin(facing);
      const ry=ex*Math.sin(facing)+ey*Math.cos(facing);
      const fx=sx+rx,fy=sy+ry;
      ctx.globalAlpha=eyeOpacity*throb*(chasing?0.55:0.28);
      const bloom=ctx.createRadialGradient(fx,fy,0,fx,fy,glowSize);
      bloom.addColorStop(0,glowCol);bloom.addColorStop(1,"rgba(0,0,0,0)");
      ctx.fillStyle=bloom;ctx.beginPath();ctx.arc(fx,fy,glowSize,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=eyeOpacity*throb;
      ctx.shadowColor=glowCol;ctx.shadowBlur=chasing?22:10;
      ctx.fillStyle=eyeCol;
      ctx.beginPath();ctx.ellipse(fx,fy,chasing?6.5:5,chasing?4.5:3.5,facing,0,Math.PI*2);ctx.fill();
      ctx.shadowBlur=0;ctx.globalAlpha=eyeOpacity;
      ctx.fillStyle="#000";ctx.beginPath();ctx.arc(fx,fy,chasing?3:2.2,0,Math.PI*2);ctx.fill();
    }
    if(chasing&&d<320){
      const mouthOpacity=clamp((320-d)/280,0,1)*eyeOpacity*throb;
      ctx.globalAlpha=mouthOpacity;
      const mLocal={ex:0,ey:-36};
      const mrx=mLocal.ex*Math.cos(facing)-mLocal.ey*Math.sin(facing);
      const mry=mLocal.ex*Math.sin(facing)+mLocal.ey*Math.cos(facing);
      const mx2=sx+mrx,my2=sy+mry;
      ctx.shadowColor=glowCol;ctx.shadowBlur=14;
      ctx.strokeStyle=`rgba(${er},${eg},${eb},${mouthOpacity})`;ctx.lineWidth=2;
      ctx.save();ctx.translate(mx2,my2);ctx.rotate(facing);
      ctx.beginPath();ctx.moveTo(-12,8);ctx.quadraticCurveTo(0,20,12,8);ctx.stroke();
      ctx.fillStyle=`rgba(230,215,215,${mouthOpacity*0.6})`;
      for(let t=0;t<4;t++) ctx.fillRect(-9+t*6,8,4,7);
      ctx.restore();ctx.shadowBlur=0;
    }
    ctx.restore();
  }

  // ── lighting ───────────────────────────────────────────────────────────────
  function drawLighting(ctx,r,cam){
    const p=r.player;
    const brownout = r.event?.type==="brownout";
    const blackout = !r.powerOn;
    const theme=r.theme||FLOOR_THEMES[0];
    const px=p.x-cam.x,py=p.y-cam.y;
    const dk=document.createElement("canvas");
    dk.width=CANVAS_W;dk.height=CANVAS_H;
    const dc=dk.getContext("2d");

    dc.fillStyle=theme.fogColor;dc.fillRect(0,0,CANVAS_W,CANVAS_H);

    const cz=getZoneAt(r.map,p,6);
    const revealZones=r.map.walkable.filter(zone=>{
      if(!cz) return rectDistToPoint(zone,p)<160;
      if(zone.id===cz.id) return true;
      if(zonesTouch(zone,cz)&&rectDistToPoint(zone,p)<160) return true;
      return false;
    });

    dc.globalCompositeOperation="destination-out";

    // Active flares add light
    for(const f of r.activeFlares){
      const alpha=Math.min(1,f.timer/500)*0.92;
      const fx=f.x-cam.x,fy=f.y-cam.y;
      const flareG=dc.createRadialGradient(fx,fy,4,fx,fy,f.radius);
      flareG.addColorStop(0,`rgba(255,200,80,${alpha*0.88})`);
      flareG.addColorStop(0.45,`rgba(255,160,40,${alpha*0.48})`);
      flareG.addColorStop(1,"rgba(255,255,255,0)");
      dc.fillStyle=flareG;dc.beginPath();dc.arc(fx,fy,f.radius,0,Math.PI*2);dc.fill();
    }

    for(const zone of revealZones){
      dc.save();
      dc.beginPath();dc.rect(zone.x-cam.x,zone.y-cam.y,zone.w,zone.h);dc.clip();

      // Pitch dark rooms: only light up with flashlight, no ambient
      const pitchDark=zone.pitchDark;
      const baseR=p.flashlightOff?55:(p.hasLighter?85:130+p.battery*0.8);
      const radius=pitchDark?clamp(baseR-40,30,180):clamp(baseR-(100-p.sanity)*0.18,70,210);

      if((!blackout || brownout) && (!pitchDark||((!p.flashlightOff||p.hasLighter)))){
        const amb=dc.createRadialGradient(px,py,8,px,py,pitchDark?radius*0.7:radius);
        amb.addColorStop(0,"rgba(255,255,255,0.95)");
        amb.addColorStop(0.38,"rgba(255,255,255,0.65)");
        amb.addColorStop(0.72,"rgba(255,255,255,0.18)");
        amb.addColorStop(1,"rgba(255,255,255,0)");
        dc.fillStyle=amb;dc.beginPath();dc.arc(px,py,pitchDark?radius*0.7:radius,0,Math.PI*2);dc.fill();
      }

      if((!blackout || brownout)&&!p.flashlightOff&&p.battery>0){
        const ff=Math.random()<(100-p.sanity)/480?rand(0.58,0.96):1;
        const coneLen=p.hasLighter?clamp(160+p.battery*0.5-(100-p.sanity)*0.5,100,240)*ff:clamp(290+p.battery*1.15-(100-p.sanity)*0.75,170,440)*ff;
        const coneW=p.hasLighter?0.32:0.47;
        const cG=dc.createRadialGradient(px,py,18,px,py,coneLen);
        cG.addColorStop(0,"rgba(255,255,255,0.88)");cG.addColorStop(0.32,"rgba(255,248,232,0.58)");cG.addColorStop(0.7,"rgba(255,240,205,0.22)");cG.addColorStop(1,"rgba(255,255,255,0)");
        dc.fillStyle=cG;dc.beginPath();dc.moveTo(px,py);dc.arc(px,py,coneLen,p.angle-coneW,p.angle+coneW);dc.closePath();dc.fill();
        if(!p.hasLighter){
          const core=dc.createRadialGradient(px,py,5,px,py,coneLen*0.55);
          core.addColorStop(0,"rgba(255,255,255,0.68)");core.addColorStop(1,"rgba(255,255,255,0)");
          dc.fillStyle=core;dc.beginPath();dc.moveTo(px,py);dc.arc(px,py,coneLen*0.55,p.angle-coneW*0.38,p.angle+coneW*0.38);dc.closePath();dc.fill();
        }
      }
      dc.restore();
    }

    dc.globalCompositeOperation="source-over";
    ctx.drawImage(dk,0,0);

    // Ambient floor tint
    if(theme.ambientTint){
      ctx.save();ctx.fillStyle=theme.ambientTint;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);ctx.restore();
    }

    // Vignette
    const vigCol=r.floorNum===2?"rgba(0,4,10,0.9)":r.floorNum===3?"rgba(2,6,0,0.9)":"rgba(0,0,0,0.9)";
    const vig=ctx.createRadialGradient(CANVAS_W/2,CANVAS_H/2,60,CANVAS_W/2,CANVAS_H/2,600);
    vig.addColorStop(0,"rgba(0,0,0,0)");vig.addColorStop(0.5,"rgba(0,0,0,0.16)");vig.addColorStop(1,vigCol);
    ctx.fillStyle=vig;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);

    const insanity=(100-r.player.sanity)/100;
    if(insanity>0.38) ctx.fillStyle=`rgba(62,0,0,${(insanity-0.38)/100*0.3})`,ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
    // Floor 2 blue tint on high insanity
    if(r.floorNum===2&&insanity>0.4) ctx.fillStyle=`rgba(0,18,38,${(insanity-0.4)*0.22})`,ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
  }

  // ── lore popup ─────────────────────────────────────────────────────────────
  function drawLorePopup(ctx,r){
    if(!r.loreRead||r.loreRead.timer<=0) return;
    const alpha=Math.min(1,r.loreRead.timer/500);
    const maxW=520,padH=18,padV=14;
    ctx.save();
    ctx.font="12px 'Courier New'";
    // Wrap text
    const words=r.loreRead.text.split(" ");
    const lines=[];let cur="";
    for(const w of words){
      const test=cur+(cur?" ":"")+w;
      if(ctx.measureText(test).width>maxW-padH*2){ lines.push(cur); cur=w; }
      else cur=test;
    }
    if(cur) lines.push(cur);
    const boxH=lines.length*18+padV*2+28;
    const bx=CANVAS_W/2-maxW/2, by=CANVAS_H/2-boxH/2;
    ctx.globalAlpha=alpha*0.96;
    ctx.fillStyle="rgba(4,2,10,0.94)";
    rrect(ctx,bx,by,maxW,boxH,6);ctx.fill();
    ctx.strokeStyle="rgba(178,148,80,0.5)";ctx.lineWidth=1;
    rrect(ctx,bx,by,maxW,boxH,6);ctx.stroke();
    ctx.fillStyle="rgba(178,148,80,0.88)";ctx.font="bold 10px 'Courier New'";ctx.textAlign="left";
    const prefix=FLOOR_THEMES[r.floorNum-1].lorePrefix;
    ctx.fillText(`◈ ${prefix} FILE — FOUND DOCUMENT`,bx+padH,by+padV+10);
    ctx.strokeStyle="rgba(178,148,80,0.22)";ctx.lineWidth=0.8;
    ctx.beginPath();ctx.moveTo(bx+padH,by+padV+16);ctx.lineTo(bx+maxW-padH,by+padV+16);ctx.stroke();
    ctx.fillStyle="rgba(210,195,165,0.9)";ctx.font="12px 'Courier New'";
    for(let i=0;i<lines.length;i++) ctx.fillText(lines[i],bx+padH,by+padV+32+i*18);
    ctx.globalAlpha=1;ctx.restore();
  }

  // ── HUD ────────────────────────────────────────────────────────────────────
  function rrect(ctx,x,y,w,h,r2){ctx.beginPath();ctx.moveTo(x+r2,y);ctx.lineTo(x+w-r2,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r2);ctx.lineTo(x+w,y+h-r2);ctx.quadraticCurveTo(x+w,y+h,x+w-r2,y+h);ctx.lineTo(x+r2,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r2);ctx.lineTo(x,y+r2);ctx.quadraticCurveTo(x,y,x+r2,y);ctx.closePath();}

  function hBar(ctx,x,y,w,h,v,fc,ec,label){
    ctx.fillStyle=ec;rrect(ctx,x,y,w,h,2.5);ctx.fill();
    if(v>0){ctx.save();ctx.beginPath();ctx.rect(x,y,w*clamp(v,0,1),h);ctx.clip();ctx.fillStyle=fc;rrect(ctx,x,y,w,h,2.5);ctx.fill();ctx.restore();}
    ctx.strokeStyle="rgba(255,255,255,0.08)";ctx.lineWidth=0.8;rrect(ctx,x,y,w,h,2.5);ctx.stroke();
    ctx.fillStyle="rgba(178,178,178,0.72)";ctx.font="bold 8px 'Courier New'";ctx.textAlign="left";ctx.fillText(label,x+w+8,y+h-1);
  }

  function drawObjectiveCompass(ctx,r,objective,distance){
    if(!objective) return;
    const p=r.player;
    const angle=Math.atan2(objective.y-p.y,objective.x-p.x);
    const pulse=0.65+Math.sin(r.objectiveBlink/200)*0.25;
    const cx2=CANVAS_W-82,cy2=88;
    ctx.save();
    ctx.strokeStyle="rgba(160,50,50,0.32)";ctx.lineWidth=1;
    ctx.beginPath();ctx.arc(cx2,cy2,25,0,Math.PI*2);ctx.stroke();
    ctx.translate(cx2,cy2);ctx.rotate(angle);ctx.globalAlpha=pulse;
    ctx.fillStyle=r.exit.active?"#48ff78":"#ff9090";
    ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=10;
    ctx.beginPath();ctx.moveTo(23,0);ctx.lineTo(-10,-8);ctx.lineTo(-5,0);ctx.lineTo(-10,8);ctx.closePath();ctx.fill();
    ctx.shadowBlur=0;ctx.restore();
    ctx.save();ctx.textAlign="center";ctx.fillStyle="rgba(200,180,180,0.72)";ctx.font="10px 'Courier New'";
    ctx.fillText(r.exit.active?"EXIT":"SIGNAL",cx2,cy2+37);ctx.fillText(`${distance}m`,cx2,cy2+49);ctx.restore();
  }

  function drawHUD(ctx,r){
    const p=r.player,obj=getObjective(r);
    const objDist=obj?Math.round(dist(p,obj)):0;
    const theme=r.theme||FLOOR_THEMES[0];
    ctx.save();

    const px2=18,py2=18,pw=262,ph=180;
    ctx.fillStyle="rgba(3,2,8,0.86)";rrect(ctx,px2,py2,pw,ph,5);ctx.fill();
    ctx.strokeStyle="rgba(165,50,50,0.4)";ctx.lineWidth=1;rrect(ctx,px2,py2,pw,ph,5);ctx.stroke();
    ctx.fillStyle="rgba(165,20,20,0.92)";ctx.fillRect(px2+5,py2+1,pw-10,3);
    ctx.fillStyle="rgba(200,72,72,0.96)";ctx.font="bold 10px 'Courier New'";ctx.textAlign="left";
    ctx.fillText(`◈ ${theme.name.toUpperCase()} — FLOOR ${r.floorNum}/${MAX_FLOORS}`,px2+11,py2+18);
    ctx.strokeStyle="rgba(165,50,50,0.22)";ctx.lineWidth=0.8;
    ctx.beginPath();ctx.moveTo(px2+8,py2+25);ctx.lineTo(px2+pw-8,py2+25);ctx.stroke();

    const bx=px2+11,bw=pw-60;
    hBar(ctx,bx,py2+35,bw,10,p.battery/(p.maxBattery||100),"#c8ba32","#4a4218",p.hasLighter?"BAT*":"BAT");
    hBar(ctx,bx,py2+58,bw,10,p.sanity/(p.maxSanity||100),p.sanity<30?"#c84848":"#3890d8","#142852","MIND");
    hBar(ctx,bx,py2+81,bw,10,p.stamina/(p.maxStamina||100),"#828282","#2a2a2a","STM");
    hBar(ctx,bx,py2+104,bw,7,(p.noise||0)/100,"#b84646","#361111","NOISE");

    // Crouching indicator
    if(p.crouching){
      ctx.fillStyle="rgba(100,200,140,0.85)";ctx.font="bold 9px 'Courier New'";ctx.textAlign="right";
      ctx.fillText("CROUCH",px2+pw-10,py2+95);
    }

    ctx.fillStyle="rgba(138,138,138,0.7)";ctx.font="9px 'Courier New'";ctx.textAlign="left";ctx.fillText("VITAL",bx,py2+123);
    for(let i=0;i<(p.maxHp||3);i++){
      ctx.fillStyle=i<p.hp?"rgba(178,20,20,0.98)":"rgba(55,20,20,0.52)";
      ctx.font="18px monospace";ctx.fillText("♥",bx+i*24,py2+149);
    }

    // Special items row
    let itemX=bx;
    if(p.hasLighter){ ctx.fillStyle="rgba(255,180,60,0.8)";ctx.font="10px 'Courier New'";ctx.fillText("🔥LT",itemX,py2+168);itemX+=40;}
    if(p.flares>0){ ctx.fillStyle="rgba(240,100,50,0.8)";ctx.font="10px 'Courier New'";ctx.fillText(`[Q]×${p.flares}FLR`,itemX,py2+168);itemX+=55;}
    if(p.hasCamera){
      const camPct=Math.round(p.cameraCharge);
      ctx.fillStyle=p.cameraCharge>=30?"rgba(120,170,220,0.8)":"rgba(120,120,120,0.5)";
      ctx.font="10px 'Courier New'";ctx.fillText(`[C]CAM ${camPct}%`,itemX,py2+168);itemX+=70;
    }
    if(p.hasStunGun){
      ctx.fillStyle=(p.stunAmmo||0)>0?"rgba(120,205,255,0.86)":"rgba(100,100,120,0.55)";
      ctx.font="10px 'Courier New'";ctx.fillText(`[R]STUN×${p.stunAmmo||0}`,itemX,py2+168);
    }

    if(p.hidden){ctx.fillStyle="rgba(105,135,225,0.88)";ctx.font="bold 9px 'Courier New'";ctx.textAlign="center";ctx.fillText("⬛ CONCEALED",px2+pw/2,py2+ph+16);}
    if(r.trapped>0){ctx.fillStyle="rgba(195,90,30,0.88)";ctx.font="bold 9px 'Courier New'";ctx.textAlign="center";ctx.fillText("⛓ TRAPPED",px2+pw/2,py2+ph+(p.hidden?32:16));}

    // Sanity low warning
    if(p.sanity<25){
      const pulse=Math.sin(r.time*0.008)*0.4+0.6;
      ctx.fillStyle=`rgba(140,10,10,${pulse*0.8})`;ctx.font="bold 10px 'Courier New'";ctx.textAlign="center";
      ctx.fillText("◈ LOSING CONTROL ◈",px2+pw/2,py2+ph+32+(p.hidden?16:0));
    }

    // Fragment + lore counter
    const fcW=188,fcH=58;
    ctx.fillStyle="rgba(3,2,8,0.86)";rrect(ctx,CANVAS_W-fcW-18,18,fcW,fcH,5);ctx.fill();
    ctx.strokeStyle="rgba(165,50,50,0.4)";ctx.lineWidth=1;rrect(ctx,CANVAS_W-fcW-18,18,fcW,fcH,5);ctx.stroke();
    ctx.textAlign="right";ctx.fillStyle="rgba(200,72,72,0.94)";ctx.font="bold 10px 'Courier New'";
    ctx.fillText("FRAGMENTS",CANVAS_W-26,35);
    ctx.fillStyle=r.collected===ITEM_COUNT?"rgba(55,245,100,0.97)":"rgba(228,178,178,0.94)";
    ctx.font="bold 22px 'Courier New'";ctx.fillText(`${r.collected} / ${ITEM_COUNT}`,CANVAS_W-26,57);
    // Lore counter
    const loreCollected=r.lores.filter(l=>l.collected).length;
    ctx.fillStyle="rgba(178,148,80,0.65)";ctx.font="9px 'Courier New'";
    ctx.fillText(`DOCS: ${loreCollected}/${LORE_COUNT}  SHARDS: ${p.scraps||0}`,CANVAS_W-26,72);

    const guideX = 18;
const guideY = CANVAS_H - 96;
const guideW = 270;
const guideH = 76;

ctx.textAlign = "left";
ctx.fillStyle = "rgba(3,2,8,0.72)";
rrect(ctx, guideX, guideY, guideW, guideH, 5);
ctx.fill();

ctx.strokeStyle = "rgba(165,50,50,0.24)";
rrect(ctx, guideX, guideY, guideW, guideH, 5);
ctx.stroke();

ctx.fillStyle = "rgba(210,185,185,0.75)";
ctx.font = "9px 'Courier New'";

ctx.fillText("ITEMS:", guideX + 10, guideY + 17);
ctx.fillText("Red = relic/objective", guideX + 10, guideY + 32);
ctx.fillText("Yellow = battery  Orange = flare", guideX + 10, guideY + 47);
ctx.fillText("Blue = camera / stun pistol / ammo", guideX + 10, guideY + 62);

    if(r.event){
      const ew=260,eh=34,ex=CANVAS_W/2-ew/2,ey=14;
      ctx.fillStyle="rgba(30,0,0,0.78)";rrect(ctx,ex,ey,ew,eh,4);ctx.fill();
      ctx.strokeStyle="rgba(230,55,55,0.45)";rrect(ctx,ex,ey,ew,eh,4);ctx.stroke();
      ctx.textAlign="center";ctx.fillStyle="rgba(255,115,115,0.95)";ctx.font="bold 11px 'Courier New'";
      ctx.fillText(`${r.event.name} — ${Math.ceil(r.event.timer/1000)}s`,CANVAS_W/2,ey+22);
    }

    drawObjectiveCompass(ctx,r,obj,objDist);

    if(r.securityPing>0){
      const sx=CANVAS_W-125,sy=96,scale=0.035;
      ctx.fillStyle="rgba(0,0,0,0.52)";rrect(ctx,sx-44,sy-38,88,76,4);ctx.fill();
      ctx.strokeStyle="rgba(80,165,255,0.32)";rrect(ctx,sx-44,sy-38,88,76,4);ctx.stroke();
      ctx.fillStyle="rgba(80,165,255,0.85)";ctx.font="8px 'Courier New'";ctx.textAlign="center";ctx.fillText("SECURITY",sx,sy-25);
      ctx.fillStyle="rgba(90,220,120,0.9)";ctx.beginPath();ctx.arc(sx+(p.x-WORLD_W/2)*scale,sy+(p.y-WORLD_H/2)*scale,3,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="rgba(255,60,60,0.95)";ctx.beginPath();ctx.arc(sx+(r.monster.x-WORLD_W/2)*scale,sy+(r.monster.y-WORLD_H/2)*scale,4,0,Math.PI*2);ctx.fill();
    }

    // Monster name when chasing
    if(r.monster.mode==="chase"||r.finalPhase){
      const tp=Math.sin(r.time*0.004)*0.38+0.62;
      ctx.fillStyle=`rgba(125,0,0,${0.28*tp})`;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
      ctx.textAlign="center";ctx.fillStyle=`rgba(255,55,55,${tp*0.97})`;ctx.font="bold 13px 'Courier New'";
      ctx.shadowColor="rgba(255,0,0,0.45)";ctx.shadowBlur=14;
      const chaseText=r.finalPhase?"▶  RUN TO THE EXIT  ◀":`▶  ${theme.monsterName.toUpperCase()} IS CHASING YOU  ◀`;
      ctx.fillText(chaseText,CANVAS_W/2,36);ctx.shadowBlur=0;
    }

    const md=dist(p,r.monster);
    if(md<400){
      const hbI=clamp((400-md)/400,0,1);
      const hbP=Math.sin((r.heartbeatPhase||0)*Math.PI*2);
      if(hbP>0.68){ctx.fillStyle=`rgba(90,0,0,${hbI*hbP*0.15})`;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);}
    }

    if(r.message){
      const mW=580,mH=36,mX=CANVAS_W/2-mW/2,mY=CANVAS_H-60;
      ctx.fillStyle="rgba(3,2,8,0.82)";rrect(ctx,mX,mY,mW,mH,4);ctx.fill();
      ctx.strokeStyle="rgba(158,55,55,0.28)";ctx.lineWidth=0.8;rrect(ctx,mX,mY,mW,mH,4);ctx.stroke();
      ctx.textAlign="center";ctx.fillStyle="rgba(212,192,192,0.94)";ctx.font="12px 'Courier New'";
      ctx.fillText(r.message,CANVAS_W/2,mY+23);
    }
    ctx.restore();
  }

  // ── overlays ───────────────────────────────────────────────────────────────
  function drawOverlays(ctx,r){
    const insanity=(100-r.player.sanity)/100;

    if(insanity>0.38){ctx.save();ctx.globalAlpha=(insanity-0.38)*0.11;for(let y=0;y<CANVAS_H;y+=3){ctx.fillStyle="rgba(0,0,0,0.75)";ctx.fillRect(0,y,CANVAS_W,1);}ctx.restore();}
    if(insanity>0.48){ctx.save();ctx.globalAlpha=(insanity-0.48)*0.24;for(let i=0;i<60;i++){ctx.fillStyle=Math.random()>0.5?"rgba(255,255,255,0.92)":"rgba(0,0,0,0.92)";ctx.fillRect(rand(0,CANVAS_W),rand(0,CANVAS_H),rand(1,4),rand(1,3));}ctx.restore();}

    // Inverted controls warning
    if(r.invertControls>0){
      ctx.save();ctx.globalAlpha=Math.min(1,r.invertControls/500)*0.85;
      ctx.fillStyle="rgba(60,0,60,0.18)";ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
      ctx.textAlign="center";ctx.fillStyle=`rgba(220,120,255,0.9)`;ctx.font="bold 14px 'Courier New'";
      ctx.fillText("◈ CONTROLS INVERTED ◈",CANVAS_W/2,CANVAS_H-90);
      ctx.restore();
    }

    if(r.glitch>0){
      ctx.save();
      for(let i=0;i<Math.floor(r.glitch*12);i++){
        const by2=rand(0,CANVAS_H),bh=rand(2,15),shift=rand(-28,28)*r.glitch;
        ctx.globalAlpha=r.glitch*0.32;
        ctx.fillStyle="rgba(255,0,0,0.48)";ctx.fillRect(shift,by2,CANVAS_W,bh);
        ctx.fillStyle="rgba(0,255,255,0.24)";ctx.fillRect(-shift,by2+1,CANVAS_W,bh-2);
      }
      if(r.glitch>0.5){ctx.globalAlpha=r.glitch*0.42;ctx.fillStyle="rgba(255,255,255,0.14)";ctx.fillRect(rand(CANVAS_W*0.18,CANVAS_W*0.82),0,rand(2,9),CANVAS_H);}
      ctx.restore();
    }

    if(r.floorComplete&&!r.won){
      ctx.save();ctx.fillStyle="rgba(0,0,0,0.88)";ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
      ctx.textAlign="center";
      ctx.shadowColor="rgba(55,200,90,0.6)";ctx.shadowBlur=30;
      ctx.fillStyle="rgba(90,230,130,0.98)";ctx.font="bold 42px 'Courier New'";
      ctx.fillText(`FLOOR ${r.floorNum} CLEARED`,CANVAS_W/2,116);ctx.shadowBlur=0;
      const nextTheme=FLOOR_THEMES[r.floorNum]||FLOOR_THEMES[FLOOR_THEMES.length-1];
      ctx.fillStyle="rgba(180,205,188,0.76)";ctx.font="13px 'Courier New'";
      ctx.fillText(`Next: ${nextTheme.name} — ${nextTheme.monsterName}: ${nextTheme.monsterDesc}`,CANVAS_W/2,146);
      ctx.fillStyle="rgba(178,148,80,0.86)";ctx.font="bold 12px 'Courier New'";
      ctx.fillText(`Choose one permanent upgrade. Bonus shards: ${r.player.scraps||0}.`,CANVAS_W/2,180);
      const opts=r.upgradeOptions||[];
      for(let i=0;i<opts.length;i++){
        const up=opts[i], x=CANVAS_W/2-330+i*220, y=226;
        ctx.fillStyle="rgba(16,12,18,0.92)";rrect(ctx,x,y,200,150,8);ctx.fill();
        ctx.strokeStyle="rgba(190,70,70,0.42)";ctx.lineWidth=1.2;rrect(ctx,x,y,200,150,8);ctx.stroke();
        ctx.fillStyle="rgba(230,85,85,0.95)";ctx.font="bold 13px 'Courier New'";ctx.fillText(`[${i+1}] ${up.name}`,x+100,y+32);
        ctx.fillStyle="rgba(210,190,190,0.78)";ctx.font="11px 'Courier New'";
        const words=up.desc.split(" "); let line="", yy=y+66;
        for(const w of words){
          if((line+w).length>24){ctx.fillText(line,x+100,yy);yy+=18;line=w+" ";}
          else line+=w+" ";
        }
        if(line) ctx.fillText(line,x+100,yy);
        ctx.fillStyle="rgba(145,120,120,0.7)";ctx.font="10px 'Courier New'";ctx.fillText(`Level ${(r.player.upgrades?.[up.key]||0)+1}/${up.max}`,x+100,y+128);
      }
      ctx.fillStyle="rgba(160,130,130,0.64)";ctx.font="11px 'Courier New'";
      ctx.fillText("Press 1, 2, or 3 to go deeper.",CANVAS_W/2,420);
      ctx.restore();
    }

    if(r.scare){
      const progress=r.scare.timer/1100,alpha=clamp(progress*1.4,0,1),scl=1+(1-progress)*0.72;
      ctx.save();
      if(progress>0.86){ctx.fillStyle=`rgba(255,255,255,${(progress-0.86)*6.5*0.62})`;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);}
      ctx.fillStyle=`rgba(0,0,0,${0.52+alpha*0.35})`;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
      ctx.save();ctx.translate(CANVAS_W/2,CANVAS_H/2-38);ctx.scale(scl,scl);
      const fg=ctx.createRadialGradient(0,0,8,0,0,132);
      fg.addColorStop(0,`rgba(8,4,4,${alpha})`);fg.addColorStop(0.65,`rgba(4,2,2,${alpha})`);fg.addColorStop(1,"rgba(0,0,0,0)");
      ctx.fillStyle=fg;ctx.beginPath();ctx.ellipse(0,0,96,132,0,0,Math.PI*2);ctx.fill();
      const eL={x:-30+rand(-3,3),y:-38+rand(-2,2)},eR={x:36+rand(-3,3),y:-33+rand(-2,2)};
      const theme=r.theme||FLOOR_THEMES[0];
      const [er,eg,eb]=theme.eyeColor;
      ctx.fillStyle=`rgba(${er},${eg},${eb},${alpha*0.95})`;ctx.shadowColor=`rgba(${er},${eg},${eb},0.9)`;ctx.shadowBlur=20;
      ctx.beginPath();ctx.ellipse(eL.x,eL.y,15,10,rand(-0.4,0.4),0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.ellipse(eR.x,eR.y,12,16,rand(-0.4,0.4),0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#000";ctx.shadowBlur=0;
      ctx.beginPath();ctx.arc(eL.x,eL.y,7,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(eR.x,eR.y,6,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=`rgba(255,255,255,${alpha*0.58})`;ctx.lineWidth=4.5;
      ctx.beginPath();ctx.moveTo(-54,28);ctx.quadraticCurveTo(0,82,54,28);ctx.stroke();
      ctx.fillStyle=`rgba(240,230,220,${alpha*0.52})`;for(let t=0;t<7;t++) ctx.fillRect(-38+t*12,30,10,19);
      ctx.restore();
      ctx.textAlign="center";ctx.fillStyle=`rgba(255,255,255,${alpha*0.98})`;
      ctx.shadowColor=`rgba(${r.theme?.eyeColor?.[0]||235},0,0,0.48)`;ctx.shadowBlur=24;
      ctx.font=`bold ${Math.floor(54+(1-progress)*24)}px 'Courier New'`;
      ctx.fillText(r.scare.text,CANVAS_W/2,CANVAS_H-72);ctx.shadowBlur=0;
      ctx.restore();
    }

    if(!started||r.dead||r.won){
      ctx.save();ctx.fillStyle="rgba(0,0,0,0.9)";ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
      for(let i=0;i<18;i++){ctx.fillStyle=`rgba(48,8,8,${rand(0.02,0.07)})`;ctx.fillRect(0,rand(0,CANVAS_H),CANVAS_W,rand(1,3));}
      const cx2=CANVAS_W/2,cy2=CANVAS_H/2;ctx.textAlign="center";

      if(!started){
        ctx.fillStyle="rgba(125,16,16,0.09)";ctx.font="bold 130px 'Courier New'";ctx.fillText("SHY",cx2,cy2+52);
        ctx.shadowColor="rgba(178,20,20,0.58)";ctx.shadowBlur=32;ctx.fillStyle="rgba(222,82,82,0.99)";
        ctx.font="bold 38px 'Courier New'";ctx.fillText("SOMETHING HEARD YOU",cx2,cy2-72);ctx.shadowBlur=0;
        ctx.fillStyle="rgba(172,150,150,0.76)";ctx.font="13px 'Courier New'";
        ctx.fillText("5 floors. 6 fragments each. Noise, rooms, events, upgrades, and monsters that change rules.",cx2,cy2-30);
        ctx.fillText("WASD move  ·  Mouse aim  ·  Shift sprint  ·  Ctrl crouch  ·  E interact",cx2,cy2-8);
        ctx.fillText("F flashlight  ·  Space hide  ·  Q throw flare  ·  C camera flash  ·  1/2/3 upgrade",cx2,cy2+14);
        ctx.fillStyle="rgba(178,148,80,0.65)";ctx.font="12px 'Courier New'";
        ctx.fillText("Special rooms are optional risk/reward. Relics no longer trigger pickup jump scares.",cx2,cy2+38);
        const p2=(Math.sin(Date.now()*0.003)*0.3)+0.7;
        ctx.fillStyle=`rgba(192,60,60,${p2})`;ctx.font="bold 15px 'Courier New'";ctx.fillText("[ CLICK OR PRESS START ]",cx2,cy2+80);
      } else if(r.dead){
        ctx.shadowColor="rgba(128,0,0,0.68)";ctx.shadowBlur=40;ctx.fillStyle="rgba(192,50,50,0.99)";
        ctx.font="bold 50px 'Courier New'";ctx.fillText("YOU WERE HEARD",cx2,cy2-42);ctx.shadowBlur=0;
        ctx.fillStyle="rgba(172,132,132,0.76)";ctx.font="14px 'Courier New'";ctx.fillText("The dark learned your name.",cx2,cy2+2);
        ctx.fillStyle="rgba(118,90,90,0.58)";ctx.font="12px 'Courier New'";
        ctx.fillText(`Floor ${r.floorNum}/${MAX_FLOORS}  ·  Fragments: ${r.collected}/${ITEM_COUNT}  ·  Docs: ${r.lores.filter(l=>l.collected).length}/${LORE_COUNT}`,cx2,cy2+24);
        ctx.fillStyle="rgba(172,68,68,0.82)";ctx.font="bold 13px 'Courier New'";ctx.fillText("[ RESTART ]",cx2,cy2+70);
      } else if(r.won){
        ctx.shadowColor="rgba(52,178,72,0.58)";ctx.shadowBlur=32;ctx.fillStyle="rgba(90,222,132,0.99)";
        ctx.font="bold 48px 'Courier New'";ctx.fillText("YOU ESCAPED",cx2,cy2-42);ctx.shadowBlur=0;
        ctx.fillStyle="rgba(145,192,158,0.76)";ctx.font="14px 'Courier New'";ctx.fillText("All 5 floors cleared. They're still in there.",cx2,cy2+2);
        const totalLore=[...Array(3)].reduce((a,_,i)=>a,0);
        ctx.fillStyle="rgba(178,148,80,0.65)";ctx.font="12px 'Courier New'";ctx.fillText("Waiting for the next one.",cx2,cy2+22);
        ctx.fillStyle="rgba(85,165,108,0.82)";ctx.font="bold 13px 'Courier New'";ctx.fillText("[ PLAY AGAIN ]",cx2,cy2+68);
      }
      ctx.restore();
    }
  }

  // ── input ──────────────────────────────────────────────────────────────────
  useEffect(()=>{
    const down=(e)=>{
      const key=e.key.toLowerCase();
      keysRef.current[key]=true;
      if(["w","a","s","d"," ","shift","e","f","q","c","r","control","1","2","3"].includes(key)) e.preventDefault();
      if(["1","2","3"].includes(key)||["digit1","digit2","digit3","numpad1","numpad2","numpad3"].includes(e.code?.toLowerCase?.())){
        const n = key >= "1" && key <= "3" ? Number(key) : Number((e.code||"").replace(/\D/g,"").slice(-1));
        applyUpgradeChoice(n-1); return;
      }
      if(key==="f"){const r=runRef.current;if(!r||r.dead||r.won)return;if(!r.player.hasLighter){r.player.flashlightOff=!r.player.flashlightOff;r.message=r.player.flashlightOff?"Flashlight off.":"Flashlight on.";}}
      if(key==="e") interact();
      if(key==="q") throwFlare();
      if(key==="c") useCamera();
      if(key==="r") fireStunGun();
      if(key===" "){
        const r=runRef.current;if(!r||r.dead||r.won||r.floorComplete)return;
        const near=r.hidingSpots.find(s=>dist(s,r.player)<48);
        if(near){r.player.hidden=!r.player.hidden;r.message=r.player.hidden?"You hold your breath.":"You step out.";if(!r.player.hidden) createNoise(r,r.player.x,r.player.y,190);}
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
    const onFs=()=>setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange",onFs);
    return()=>document.removeEventListener("fullscreenchange",onFs);
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

  const theme=run.theme||FLOOR_THEMES[0];

  return(
    <div className="shy-page">
      <div className="shy-shell">
        <div className="shy-header">
          <div>
            <p className="shy-kicker">◈ {theme.name} — Signal Detected — Floor {run.floorNum}/{MAX_FLOORS} ◈</p>
            <h1>Something Heard You</h1>
            <p>Five floors. Five rule sets. One way out — if you're quiet enough to earn it.</p>
          </div>
          <div className="shy-actions">
            <button onClick={started?restart:()=>setStarted(true)}>{started?"Restart":"Start Run"}</button>
            <button className="shy-secondary" onClick={toggleFullscreen}>{isFullscreen?"Exit Fullscreen":"Fullscreen"}</button>
            {onExit&&<button className="shy-secondary" onClick={onExit}>Back</button>}
          </div>
        </div>
        <div className="shy-game-card" ref={cardRef}>
          <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} className="shy-canvas"
            onClick={()=>{if(!started)setStarted(true);}}/>
          {run.awaitingUpgrade && !run.won && (
            <div className="shy-upgrade-overlay">
              <div className="shy-upgrade-title">Choose one upgrade to go deeper — click a card or press 1 / 2 / 3</div>
              <div className="shy-upgrade-grid">
                {(run.upgradeOptions||[]).map((up,i)=>(
                  <button key={up.key} onClick={()=>applyUpgradeChoice(i)}>
                    <strong>[{i+1}] {up.name}</strong>
                    <span>{up.desc}</span>
                    <em>Level {(run.player.upgrades?.[up.key]||0)+1}/{up.max}</em>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="shy-controls">
            <span>WASD · move</span><span>Mouse · aim</span><span>Shift · sprint</span>
            <span>Ctrl · crouch</span><span>E · interact</span><span>F · flashlight</span>
            <span>Space · hide</span><span>Q · flare</span><span>C · camera</span><span>R · stun pistol</span><span>1/2/3 · upgrade</span>
          </div>
        </div>
        <div className="shy-notes">
          <div>
            <h3>Five Unique Floors</h3>
            <p>Asylum → Morgue → Sewers → Hotel → Listening Room. Each floor changes the monster rules, random events, lighting, and how dangerous sound becomes.</p>
          </div>
          <div>
            <h3>New Mechanics</h3>
            <p>Special rooms now add risk/reward choices, while clearer pickups separate objectives, survival items, distractions, and defense. Blue stun gear lets you freeze the monster in emergencies.</p>
          </div>
          <div>
            <h3>Roguelike Progression</h3>
            <p>Clear floors to choose permanent upgrades. Random events like Blackout, Blood Hunt, Lockdown, Whisper Storm, and Listening Hour keep runs from feeling repetitive.</p>
          </div>
        </div>
      </div>
    </div>
  );
}