import React, { useEffect, useMemo, useRef, useState } from "react";
import "../../styles/SomethingHeardYou.css";

// ─── constants ────────────────────────────────────────────────────────────────
const CANVAS_W = 980;
const CANVAS_H = 620;
const WORLD_W  = 2600;
const WORLD_H  = 1900;

// Collision radius is LARGER than visual so the player never clips walls
const PLAYER_RADIUS  = 18;
const MONSTER_RADIUS = 22;
const ITEM_COUNT     = 6;

const BATTERY_DRAIN     = 0.0016;
const FEAR_DARK_GAIN    = 0.003;
const FEAR_MONSTER_GAIN = 0.032;
const FEAR_DECAY        = 0.007;

// Monster base walk speed slightly slower than player walk speed (2.1)
// so the player can escape if they keep moving.  Chase is fast but beatable.
const MONSTER_WALK   = 1.5;   // stalk
const MONSTER_INVEST = 1.9;  // investigate
const MONSTER_CHASE  = 2.2;  // chase — scary but survivable
const MONSTER_FINAL  = 2.4;   // final-phase chase — genuinely threatening

// ─── utils ────────────────────────────────────────────────────────────────────
const clamp  = (v,mn,mx) => Math.max(mn,Math.min(mx,v));
const dist   = (a,b)     => Math.hypot(a.x-b.x, a.y-b.y);
const rand   = (mn,mx)   => Math.random()*(mx-mn)+mn;
const choice = arr       => arr[Math.floor(Math.random()*arr.length)];

function pointInRect(p,r,pad=0){
  return p.x>=r.x-pad && p.x<=r.x+r.w+pad && p.y>=r.y-pad && p.y<=r.y+r.h+pad;
}
function rectDistToPoint(rect,p){
  return Math.hypot(p.x-clamp(p.x,rect.x,rect.x+rect.w), p.y-clamp(p.y,rect.y,rect.y+rect.h));
}
// Precise circle-vs-AABB — used for both collision check AND wall-push
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

// ─── walkability — returns true if circle fits inside ANY walkable zone ────────
function isWalkable(walkable,x,y,radius){
  return walkable.some(z=>circleAABBOverlap(x,y,radius,z));
}


// ─── seeded decorations ───────────────────────────────────────────────────────
function seedRoomDetails(room){
  const details=[], n=Math.floor(rand(4,10));
  for(let i=0;i<n;i++) details.push({
    type:choice(["crack","stain","claw","symbol","body","debris","rust"]),
    x:rand(room.x+22,room.x+room.w-22), y:rand(room.y+22,room.y+room.h-22),
    rot:rand(0,Math.PI*2), scale:rand(0.7,1.4), r:Math.random(), g:Math.random(),
  });
  const lights=[], lc=Math.floor(rand(1,4));
  for(let i=0;i<lc;i++) lights.push({
    x:rand(room.x+50,room.x+room.w-50), y:room.y+rand(18,30),
    on:Math.random()>0.28, flicker:rand(1.5,7), phase:rand(0,Math.PI*2), warmth:rand(0.5,1),
  });
  return {...room,details,lights};
}

// ─── map generation ───────────────────────────────────────────────────────────
function makeMazeMap(floorNum=1){
  const rooms=[], corridors=[];
  const cols=5,rows=4,cellW=440,cellH=360,startX=230,startY=185;
  for(let row=0;row<rows;row++){
    for(let col=0;col<cols;col++){
      const skip=Math.random()<0.12&&!(row===0&&col===0)&&!(row===rows-1&&col===cols-1);
      if(skip) continue;
      const w=rand(230,330),h=rand(170,260);
      const x=startX+col*cellW+rand(-30,30), y=startY+row*cellH+rand(-25,25);
      rooms.push(seedRoomDetails({
        id:`r-${row}-${col}`,grid:{row,col},x,y,w,h,
        type:row===0&&col===0?"spawn":"room",decay:Math.random(),
      }));
    }
  }
  const byGrid=new Map();
  rooms.forEach(r=>byGrid.set(`${r.grid.row}-${r.grid.col}`,r));
  function connect(a,b){
    if(!a||!b) return;
    const ax=a.x+a.w/2,ay=a.y+a.h/2,bx=b.x+b.w/2,by=b.y+b.h/2;
    const hf=Math.random()>0.4;
    if(hf){
      corridors.push({id:`ch-${a.id}-${b.id}`,x:Math.min(ax,bx)-24,y:ay-26,w:Math.abs(ax-bx)+48,h:52,type:"hallway",decay:Math.random()});
      corridors.push({id:`cv-${a.id}-${b.id}`,x:bx-26,y:Math.min(ay,by)-24,w:52,h:Math.abs(ay-by)+48,type:"hallway",decay:Math.random()});
    } else {
      corridors.push({id:`cv-${a.id}-${b.id}`,x:ax-26,y:Math.min(ay,by)-24,w:52,h:Math.abs(ay-by)+48,type:"hallway",decay:Math.random()});
      corridors.push({id:`ch-${a.id}-${b.id}`,x:Math.min(ax,bx)-24,y:by-26,w:Math.abs(ax-bx)+48,h:52,type:"hallway",decay:Math.random()});
    }
  }
  for(let row=0;row<rows;row++){
    const rr=rooms.filter(r=>r.grid.row===row).sort((a,b)=>a.grid.col-b.grid.col);
    for(let i=1;i<rr.length;i++) connect(rr[i-1],rr[i]);
  }
  for(let col=0;col<cols;col++){
    const cr=rooms.filter(r=>r.grid.col===col).sort((a,b)=>a.grid.row-b.grid.row);
    for(let i=1;i<cr.length;i++) if(Math.random()>0.22||i===1) connect(cr[i-1],cr[i]);
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

// ─── floor/level factory ──────────────────────────────────────────────────────
function createFloor(floorNum=1, prevPlayer=null){
  const map=makeMazeMap(floorNum);
  const spawn=map.spawnRoom;
  const player = prevPlayer ? {
    ...prevPlayer,
    x:spawn.x+spawn.w/2, y:spawn.y+spawn.h/2,
    invuln:2000, hidden:false, bobPhase:0,
    // carry over hp/battery/fear but reset stamina
    stamina:100,
  } : {
    x:spawn.x+spawn.w/2, y:spawn.y+spawn.h/2,
    angle:0, hp:3, fear:0, battery:100, stamina:100,
    hidden:false, invuln:2000, flashlightOff:false, bobPhase:0,
  };

  const farRooms=[...map.rooms]
    .filter(r=>r.id!==map.spawnRoom.id)
    .sort((a,b)=>dist({x:b.x+b.w/2,y:b.y+b.h/2},player)-dist({x:a.x+a.w/2,y:a.y+a.h/2},player));

  const itemRooms=[...farRooms].sort(()=>Math.random()-0.5).slice(0,ITEM_COUNT);
  const items=itemRooms.map((room,i)=>({
    id:`frag-${i}`, ...randomPointInRect(room), collected:false,
    pulse:Math.random()*Math.PI*2, label:choice(["TAPE","IDOL","BONE","MASK","RELIC","EYE","TOOTH","NAIL"]),
  }));
  const restRooms=[...map.rooms].filter(r=>!itemRooms.some(ir=>ir.id===r.id));
  const batteries=restRooms.sort(()=>Math.random()-0.5).slice(0,7)
    .map((room,i)=>({id:`bat-${i}`,...randomPointInRect(room),collected:false}));
  const medkits=restRooms.sort(()=>Math.random()-0.5).slice(7,10)
    .map((room,i)=>({id:`med-${i}`,...randomPointInRect(room),collected:false}));
  const hidingSpots=restRooms.sort(()=>Math.random()-0.5).slice(10,19)
    .map((room,i)=>({id:`hide-${i}`,...randomPointInRect(room),r:24}));

  // Monster starts further on higher floors
  const mIdx=Math.min(floorNum-1,farRooms.length-1);
  const monsterRoom=farRooms[mIdx]||farRooms[0]||map.exitRoom;

  // Scale monster aggression with floor
  const baseSpeed=MONSTER_CHASE+(floorNum-1)*0.12;

  const floorMessages=[
    "Find the 6 signal fragments. The compass points the way.",
    "Floor 2. It remembers your footsteps now.",
    "Floor 3. It no longer needs to hear you.",
  ];

  return {
    map, player, floorNum,
    monster:{
      x:monsterRoom.x+monsterRoom.w/2, y:monsterRoom.y+monsterRoom.h/2,
      mode:"stalk", target:null, baseChase:baseSpeed,
      anger:0, stun:0, limbPhase:0, dirAngle:0,
    },
    items, batteries, medkits, hidingSpots,
    exit:{x:map.exitRoom.x+map.exitRoom.w/2, y:map.exitRoom.y+map.exitRoom.h/2, active:false, pulse:0},
    noisePulses:[], hallucinations:[], bloodSplatters:[],
    collected:0, finalPhase:false, won:false, dead:false, floorComplete:false,
    scare:null,
    message:floorMessages[Math.min(floorNum-1,2)],
    hauntTimer:rand(4500,8000)-(floorNum-1)*800,
    time:0, glitch:0, objectiveBlink:0, heartbeatPhase:0,
    // running footstep sound visual
    footstepPulse:0,
  };
}

// ─── component ────────────────────────────────────────────────────────────────
const MAX_FLOORS=3;

export default function SomethingHeardYou({onExit}){
  const canvasRef=useRef(null);
  const keysRef  =useRef({});
  const mouseRef =useRef({x:CANVAS_W/2,y:CANVAS_H/2});
  const runRef   =useRef(null);
  const rafRef   =useRef(null);
  const lastRef  =useRef(performance.now());

  const [started,setStarted]=useState(false);
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
  ],[]);

  useEffect(()=>{runRef.current=run;},[run]);

  function restart(){
    const fresh=createFloor(1);
    runRef.current=fresh; setRun(fresh); setStarted(true);
    lastRef.current=performance.now();
  }

  // ── noise ──────────────────────────────────────────────────────────────────
  function createNoise(r,x,y,power){
    r.noisePulses.push({x,y,pr:4,max:power,alpha:0.82});
    const d=Math.hypot(r.monster.x-x,r.monster.y-y);
    if(d<power+140){
      r.monster.target={x,y};
      r.monster.mode=d<power*0.6?"chase":"investigate";
      r.monster.anger=clamp(r.monster.anger+18,0,100);
      r.message="It heard that.";
    }
  }

  function triggerScare(r,text="RUN"){
    r.scare={text,timer:1100,seed:Math.random()};
    r.player.fear=clamp(r.player.fear+26,0,100);
    r.glitch=1;
  }

  // ── interact ───────────────────────────────────────────────────────────────
  function interact(){
    const r=runRef.current;
    if(!r||r.dead||r.won||r.floorComplete) return;
    const p=r.player;
    for(const item of r.items){
      if(!item.collected&&dist(p,item)<44){
        item.collected=true; r.collected++; r.glitch=0.85;
        p.fear=clamp(p.fear+10,0,100);
        createNoise(r,p.x,p.y,240);
        if(r.collected>=ITEM_COUNT){
          r.finalPhase=true; r.exit.active=true;
          r.monster.mode="chase"; r.monster.target={x:p.x,y:p.y};
          r.message="ALL FRAGMENTS. EXIT IS OPEN — RUN!";
          triggerScare(r,"IT KNOWS");
        } else {
          r.message=`${ITEM_COUNT-r.collected} fragments remain.`;
          if(Math.random()<0.35) triggerScare(r,choice(["BEHIND YOU","IT HEARD YOU","DON'T STOP"]));
        }
        return;
      }
    }
    for(const bat of r.batteries){
      if(!bat.collected&&dist(p,bat)<40){
        bat.collected=true; p.battery=clamp(p.battery+42,0,100);
        r.message="Battery found."; createNoise(r,p.x,p.y,90); return;
      }
    }
    for(const med of r.medkits){
      if(!med.collected&&dist(p,med)<40){
        med.collected=true; p.hp=clamp(p.hp+1,0,3); p.fear=clamp(p.fear-20,0,100);
        r.message="Your breathing steadies."; createNoise(r,p.x,p.y,90); return;
      }
    }
    if(r.exit.active&&dist(p,r.exit)<60){
      // Floor complete!
      r.floorComplete=true;
      if(r.floorNum>=MAX_FLOORS){
        r.won=true; r.message="You made it out. It's still in there. Waiting.";
        triggerScare(r,"YOU ESCAPED");
      } else {
        r.message=`Floor ${r.floorNum} cleared. Going deeper…`;
      }
    }
  }

  function getObjective(r){
    if(r.exit.active) return r.exit;
    const rem=r.items.filter(i=>!i.collected);
    return rem.length ? rem.sort((a,b)=>dist(a,r.player)-dist(b,r.player))[0] : r.exit;
  }

  // ── monster AI ────────────────────────────────────────────────────────────
  function updateMonster(r,dt){
    const p=r.player,m=r.monster;
    if(m.stun>0){m.stun-=dt;return;}
    m.limbPhase+=dt*0.009;

    const same=sameZone(r.map,p,m);
    const d=dist(p,m);

    // Vision: chase if same zone + close
    if(!p.hidden&&same&&d<(r.finalPhase?600:460)){
      m.mode="chase";
      m.target={x:p.x,y:p.y};
      m.anger=clamp(m.anger+0.1*dt,0,100);
    } else if(m.mode==="chase"&&(!same||d>550)){
      // Lost player — switch to investigate last known position
      m.mode="investigate";
    }

    const chaseSpd=r.finalPhase ? MONSTER_FINAL+(r.floorNum-1)*0.15 : m.baseChase;

    if(m.mode==="stalk"){
      if(!m.target||dist(m,m.target)<40||Math.random()<0.005){
        const pz=getZoneAt(r.map,p,5);
        const cands=r.map.rooms
          .filter(room=>room.id!==pz?.id)
          .map(room=>({room,d:dist({x:room.x+room.w/2,y:room.y+room.h/2},p)}))
          .filter(e=>e.d>280&&e.d<1000).sort(()=>Math.random()-0.5);
        m.target=randomPointInRect(cands[0]?.room||choice(r.map.rooms),55);
      }
      moveMonster(r,m.target,MONSTER_WALK+(r.floorNum-1)*0.08,dt);
    }
    if(m.mode==="investigate"){
      if(m.target) moveMonster(r,m.target,MONSTER_INVEST+(r.floorNum-1)*0.1,dt);
      if(!m.target||dist(m,m.target)<45){m.mode="stalk";m.target=null;}
    }
    if(m.mode==="chase"){
      m.target={x:p.x,y:p.y};
      moveMonster(r,m.target,chaseSpd,dt);
      if(Math.random()<0.022) r.message=choice(["RUN.","IT SEES YOU.","DON'T STOP.","FASTER."]);
    }
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
    r.glitch=Math.max(r.glitch,rand(0.22,0.6));
    if(roll<0.16){
      const a=rand(0,Math.PI*2);
      r.hallucinations.push({x:p.x+Math.cos(a)*rand(130,220),y:p.y+Math.sin(a)*rand(130,220),timer:rand(600,1100)});
    } else if(roll<0.32){
      createNoise(r,p.x-Math.cos(p.angle)*rand(130,240),p.y-Math.sin(p.angle)*rand(130,240),160);
      r.message="Footsteps behind you.";
    } else if(roll<0.48){ p.fear=clamp(p.fear+rand(6,14),0,100); }
    else if(roll<0.64){ r.monster.mode="investigate"; r.monster.target={x:p.x+rand(-220,220),y:p.y+rand(-220,220)}; }
    else if(roll<0.82&&p.fear>35) triggerScare(r,choice(["LOOK","BEHIND YOU","FOUND YOU","DON'T BREATHE","IT'S CLOSE"]));
    else r.message="Silence. Too much silence.";
  }

  // ── main update ───────────────────────────────────────────────────────────
  function updateGame(dtMs){
    const r=runRef.current;
    if(!r||!started||r.dead||r.won) return;

    // Floor-complete transition: wait then advance
    if(r.floorComplete&&!r.won){
      r.time+=dtMs;
      if(r.time>3200){
        const next=createFloor(r.floorNum+1, r.player);
        runRef.current=next; setRun(next);
      } else {
        setRun({...r});
      }
      return;
    }

    const dt=Math.min(dtMs,34);
    r.time+=dt; r.objectiveBlink+=dt;
    r.glitch=Math.max(0,r.glitch-dt/1200);
    if(r.exit.active) r.exit.pulse=(r.exit.pulse||0)+dt*0.004;

    const p=r.player,keys=keysRef.current,cam=getCamera(r);
    if(p.invuln>0) p.invuln-=dt;
    p.angle=Math.atan2(mouseRef.current.y+cam.y-p.y, mouseRef.current.x+cam.x-p.x);

    let dx=0,dy=0;
    if(!p.hidden){
      if(keys.w||keys.arrowup)    dy-=1;
      if(keys.s||keys.arrowdown)  dy+=1;
      if(keys.a||keys.arrowleft)  dx-=1;
      if(keys.d||keys.arrowright) dx+=1;
    }
    const moving=dx!==0||dy!==0;
    const len=Math.hypot(dx,dy)||1; dx/=len; dy/=len;
    const sprinting=moving&&keys.shift&&p.stamina>8&&!p.hidden;
    // Player walk 2.1, sprint 3.5 — faster than monster walk, slower than monster chase
    const speed=sprinting?3.5:2.1;

    if(sprinting){ p.stamina=clamp(p.stamina-dt*0.07,0,100); if(Math.random()<0.055) createNoise(r,p.x,p.y,175); }
    else          { p.stamina=clamp(p.stamina+dt*0.025,0,100); }
    if(moving){
      p.bobPhase+=dt*(sprinting?0.019:0.011);
      if(Math.random()<(sprinting?0.06:0.013)) createNoise(r,p.x,p.y,sprinting?155:60);
    }

    // ── MOVEMENT + WALL COLLISION ─────────────────────────────────────────
    // 1. Move on each axis independently
    const nx=p.x+dx*speed*(dt/16.67);
    const ny=p.y+dy*speed*(dt/16.67);
    if(isWalkable(r.map.walkable,nx,p.y,PLAYER_RADIUS)) p.x=nx;
    if(isWalkable(r.map.walkable,p.x,ny,PLAYER_RADIUS)) p.y=ny;
    

    if(!p.flashlightOff&&p.battery>0)
      p.battery=clamp(p.battery-BATTERY_DRAIN*dt*(r.finalPhase?1.3:1),0,100);
    if(p.battery<=0) p.flashlightOff=true;

    updateMonster(r,dt);

    const same=sameZone(r.map,p,r.monster);
    const md=dist(p,r.monster);
    if(!p.hidden&&same&&md<480)
      p.fear=clamp(p.fear+FEAR_MONSTER_GAIN*dt*(1-md/520),0,100);
    else if(p.flashlightOff||p.battery<=0)
      p.fear=clamp(p.fear+FEAR_DARK_GAIN*dt,0,100);
    else
      p.fear=clamp(p.fear-FEAR_DECAY*dt,0,100);

    r.heartbeatPhase=(r.heartbeatPhase||0)+dt*clamp((450-md)/4000,0.001,0.028);

    if(md<PLAYER_RADIUS+MONSTER_RADIUS+10&&p.invuln<=0){
      if(p.hidden&&Math.random()>0.48){
        r.message="It walked past. Inches away.";
        r.monster.mode="stalk"; r.monster.target=null;
        p.fear=clamp(p.fear+22,0,100);
      } else {
        p.hp-=1; p.invuln=1900; p.hidden=false; p.fear=clamp(p.fear+38,0,100);
        triggerScare(r,"CAUGHT");
        r.bloodSplatters.push({x:p.x+rand(-28,28),y:p.y+rand(-28,28),rr:rand(7,22),alpha:0.9});
        const safeRooms=r.map.rooms.filter(room=>dist({x:room.x+room.w/2,y:room.y+room.h/2},p)>400).sort(()=>Math.random()-0.5);
        const sr=safeRooms[0]||choice(r.map.rooms);
        const pos=randomPointInRect(sr,60);
        r.monster.x=pos.x; r.monster.y=pos.y; r.monster.mode="stalk"; r.monster.target=null;
        if(p.hp<=0){r.dead=true;r.message="The dark learned your name.";}
      }
    }

    for(const pulse of r.noisePulses){pulse.pr+=dt*0.34;pulse.alpha-=dt*0.0011;}
    r.noisePulses=r.noisePulses.filter(p=>p.alpha>0&&p.pr<p.max);
    for(const h of r.hallucinations) h.timer-=dt;
    r.hallucinations=r.hallucinations.filter(h=>h.timer>0);
    r.hauntTimer-=dt;
    if(r.hauntTimer<=0){ haunt(r); r.hauntTimer=rand(r.finalPhase?2200:5000,r.finalPhase?5500:11000)-(r.floorNum-1)*500; }
    if(r.scare){r.scare.timer-=dt;if(r.scare.timer<=0) r.scare=null;}

    setRun({...r});
  }

  function getCamera(r){
    const fearShake=r.player.fear>62?(r.player.fear-62)*0.08:0;
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
    drawBloodSplatters(ctx,r);
    drawItems(ctx,r);
    drawHidingSpots(ctx,r);
    drawExit(ctx,r);
    drawNoise(ctx,r);
    drawHallucinations(ctx,r);
    drawPlayer(ctx,r);
    ctx.restore();

    // Darkness over the world
    drawLighting(ctx,r,cam);

    // Monster body drawn AFTER darkness so it always shows
    ctx.save();ctx.translate(-cam.x,-cam.y);
    drawMonsterBody(ctx,r,cam);
    ctx.restore();

    // Monster EYES drawn last — always glow through everything
    drawMonsterEyes(ctx,r,cam);

    drawHUD(ctx,r);
    drawOverlays(ctx,r);
  }

  // ── world ──────────────────────────────────────────────────────────────────
  function drawWorld(ctx,r){
    // Void between rooms
    ctx.fillStyle="#080610";
    ctx.fillRect(0,0,WORLD_W,WORLD_H);

    for(const zone of r.map.walkable){
      const isHall=zone.type==="hallway";
      if(isHall){
        // Corridor floor
        ctx.fillStyle="#18151f";
        ctx.fillRect(zone.x,zone.y,zone.w,zone.h);
        // Center path highlight
        const horiz=zone.w>zone.h;
        ctx.fillStyle="rgba(200,180,150,0.05)";
        if(horiz) ctx.fillRect(zone.x,zone.y+zone.h*0.18,zone.w,zone.h*0.64);
        else      ctx.fillRect(zone.x+zone.w*0.18,zone.y,zone.w*0.64,zone.h);
        // Walls: two-tone border so you can see the edges
        ctx.strokeStyle="rgba(160,128,95,0.65)"; ctx.lineWidth=2.5;
        ctx.strokeRect(zone.x+1.5,zone.y+1.5,zone.w-3,zone.h-3);
        ctx.strokeStyle="#04030a"; ctx.lineWidth=10;
        ctx.strokeRect(zone.x,zone.y,zone.w,zone.h);
        // Pipes
        ctx.strokeStyle="rgba(95,82,65,0.5)"; ctx.lineWidth=3.5; ctx.lineCap="square";
        if(horiz){
          ctx.beginPath();ctx.moveTo(zone.x,zone.y+7);ctx.lineTo(zone.x+zone.w,zone.y+7);ctx.stroke();
          ctx.beginPath();ctx.moveTo(zone.x,zone.y+zone.h-7);ctx.lineTo(zone.x+zone.w,zone.y+zone.h-7);ctx.stroke();
        } else {
          ctx.beginPath();ctx.moveTo(zone.x+7,zone.y);ctx.lineTo(zone.x+7,zone.y+zone.h);ctx.stroke();
          ctx.beginPath();ctx.moveTo(zone.x+zone.w-7,zone.y);ctx.lineTo(zone.x+zone.w-7,zone.y+zone.h);ctx.stroke();
        }
      } else {
        // Room floor
        ctx.fillStyle="#201c2e";
        ctx.fillRect(zone.x,zone.y,zone.w,zone.h);
        // Tile grid
        ctx.strokeStyle="rgba(255,255,255,0.048)"; ctx.lineWidth=0.8;
        for(let tx=zone.x;tx<zone.x+zone.w;tx+=48){ctx.beginPath();ctx.moveTo(tx,zone.y);ctx.lineTo(tx,zone.y+zone.h);ctx.stroke();}
        for(let ty=zone.y;ty<zone.y+zone.h;ty+=48){ctx.beginPath();ctx.moveTo(zone.x,ty);ctx.lineTo(zone.x+zone.w,ty);ctx.stroke();}
        // Bright inner wall edge — this is what makes walls legible
        ctx.strokeStyle="rgba(175,145,110,0.65)"; ctx.lineWidth=3;
        ctx.strokeRect(zone.x+2,zone.y+2,zone.w-4,zone.h-4);
        // Baseboard inset
        ctx.strokeStyle="rgba(85,70,58,0.35)"; ctx.lineWidth=1;
        ctx.strokeRect(zone.x+11,zone.y+11,zone.w-22,zone.h-22);
        // Hard outer wall — thick black
        ctx.strokeStyle="#04030a"; ctx.lineWidth=11;
        ctx.strokeRect(zone.x,zone.y,zone.w,zone.h);
        // Ceiling lights
        if(zone.lights){
          for(const l of zone.lights){
            const t=r.time*0.001+l.phase;
            const on=l.on&&Math.sin(t*l.flicker)>-0.25+Math.random()*0.04;
            if(on){
              ctx.save();
              const wr=Math.floor(215*l.warmth),wg=Math.floor(185*l.warmth);
              ctx.shadowColor=`rgba(${wr},${wg},140,0.95)`;ctx.shadowBlur=30;
              ctx.fillStyle=`rgba(${wr},${wg},155,0.9)`;ctx.fillRect(l.x-14,l.y-4,28,8);
              const lg=ctx.createRadialGradient(l.x,l.y+4,3,l.x,l.y+4,110);
              lg.addColorStop(0,`rgba(${wr},${wg},100,0.2)`);lg.addColorStop(1,"rgba(0,0,0,0)");
              ctx.fillStyle=lg;ctx.beginPath();ctx.ellipse(l.x,l.y+58,70,58,0,0,Math.PI*2);ctx.fill();
              ctx.restore();
            } else if(l.on){
              ctx.fillStyle="rgba(48,40,40,0.6)";ctx.fillRect(l.x-14,l.y-4,28,8);
            }
          }
        }
        // Env details
        if(zone.details){
          for(const d of zone.details){
            ctx.save();ctx.translate(d.x,d.y);ctx.rotate(d.rot);ctx.globalAlpha=0.52;
            drawEnvDetail(ctx,d);ctx.restore();
          }
        }
      }
    }
    for(let i=0;i<140;i++){
      const gx=(i*173)%WORLD_W,gy=(i*97)%WORLD_H;
      ctx.fillStyle="rgba(255,255,255,0.022)";ctx.fillRect(gx,gy,2,2);
    }
  }

  function drawEnvDetail(ctx,d){
    switch(d.type){
      case"crack":{ctx.strokeStyle="rgba(0,0,0,0.8)";ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(0,0);let cx=0,cy=0;for(let i=0;i<Math.floor(3+d.r*5);i++){cx+=(d.g*32-16)*d.scale*0.5;cy+=(d.r*32-16)*d.scale*0.5;ctx.lineTo(cx,cy);}ctx.stroke();break;}
      case"stain":{ctx.fillStyle=`rgba(${65+Math.floor(d.r*35)},0,0,0.52)`;ctx.beginPath();ctx.ellipse(0,0,7+d.scale*10,4+d.scale*7,d.rot*0.5,0,Math.PI*2);ctx.fill();ctx.fillStyle="rgba(50,0,0,0.32)";ctx.fillRect(-2,3,4,d.scale*20);break;}
      case"claw":{ctx.strokeStyle="rgba(130,22,22,0.7)";ctx.lineWidth=2;for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(-6+i*4,-14*d.scale);ctx.quadraticCurveTo(d.g*18-9,0,-4+i*4,14*d.scale);ctx.stroke();}break;}
      case"symbol":{ctx.strokeStyle="rgba(155,30,30,0.55)";ctx.lineWidth=1.8;const sr=12*d.scale;ctx.beginPath();ctx.arc(0,0,sr,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(0,-sr);ctx.lineTo(0,sr);ctx.moveTo(-sr,0);ctx.lineTo(sr,0);ctx.stroke();break;}
      case"body":{ctx.fillStyle="rgba(22,12,12,0.68)";ctx.beginPath();ctx.ellipse(0,8*d.scale,8*d.scale,16*d.scale,d.rot*0.3,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(0,-10*d.scale,7*d.scale,0,Math.PI*2);ctx.fill();ctx.fillStyle="rgba(85,0,0,0.42)";ctx.beginPath();ctx.ellipse(5*d.scale,10*d.scale,5*d.scale,3*d.scale,0,0,Math.PI*2);ctx.fill();break;}
      case"debris":{for(let i=0;i<5;i++){ctx.fillStyle=`rgba(${38+i*7},${30+i*5},${22+i*4},0.7)`;ctx.fillRect((d.r*22-11+i*3)*d.scale*0.5,(d.g*22-11+i*2)*d.scale*0.5,(3+d.r*6)*d.scale,(2+d.g*5)*d.scale);}break;}
      case"rust":{ctx.fillStyle="rgba(98,42,10,0.44)";for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse((d.r*16-8+i*5)*d.scale,(d.g*12-6)*d.scale,(3+d.r*5)*d.scale,(2+d.g*4)*d.scale,d.rot,0,Math.PI*2);ctx.fill();}break;}
      default:break;
    }
  }

  function drawBloodSplatters(ctx,r){
    for(const s of r.bloodSplatters){ctx.save();ctx.globalAlpha=s.alpha*0.72;ctx.fillStyle="#2c0000";ctx.beginPath();ctx.arc(s.x,s.y,s.rr,0,Math.PI*2);ctx.fill();ctx.restore();}
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
    ctx.fillText("EXIT",0,-20);
    ctx.fillText(`FLOOR ${r.floorNum}`,0,-4);
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
    ctx.fillStyle="rgba(0,0,0,0.48)";ctx.beginPath();ctx.ellipse(2,13,13,5,0,0,Math.PI*2);ctx.fill();
    ctx.rotate(p.angle);
    if(p.hidden) ctx.globalAlpha=0.38;
    const bob=Math.sin(p.bobPhase)*2;
    ctx.save();ctx.translate(0,bob);
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
    // Direction dot on head
    ctx.fillStyle="rgba(255,255,255,0.75)";ctx.beginPath();ctx.arc(6,-15,3,0,Math.PI*2);ctx.fill();
    // Flashlight barrel
    if(!p.flashlightOff&&p.battery>0){
      ctx.fillStyle="rgba(218,208,178,0.96)";ctx.fillRect(10,-3,17,6);
      ctx.fillStyle="rgba(255,252,222,0.9)";ctx.beginPath();ctx.arc(27,0,4.5,0,Math.PI*2);ctx.fill();
      ctx.shadowColor="rgba(255,250,200,0.5)";ctx.shadowBlur=8;
      ctx.fillStyle="rgba(255,252,222,0.6)";ctx.beginPath();ctx.arc(27,0,4.5,0,Math.PI*2);ctx.fill();
      ctx.shadowBlur=0;
    }
    ctx.restore();ctx.restore();
  }

  // ── monster body (drawn after lighting) ───────────────────────────────────
  function drawMonsterBody(ctx,r,cam){
    const m=r.monster,p=r.player;
    const same=sameZone(r.map,p,m);
    const d=dist(m,p);
    const chasing=m.mode==="chase"||r.finalPhase;

    // Body visible when: chasing, same zone, or very close
    const bodyOpacity = chasing ? 1 :
                        same ? clamp(1-(d/520),0.15,1) :
                        d<180 ? clamp(1-(d/180),0.08,0.55) : 0;
    if(bodyOpacity<=0) return;

    const flicker=chasing?(Math.random()<0.07?rand(0.75,1):1):(Math.random()<0.18?rand(0.4,1):1);
    const op=bodyOpacity*flicker;
    const lp=m.limbPhase||0;

    ctx.save();ctx.translate(m.x,m.y);ctx.globalAlpha=op;
    ctx.rotate((m.dirAngle||0)-Math.PI/2);

    // Shadow
    ctx.globalAlpha=op*0.38;ctx.fillStyle="#000";ctx.beginPath();ctx.ellipse(0,26,22,9,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=op;

    // Legs
    ctx.strokeStyle=chasing?"#1c0808":"#0e0b14";ctx.lineWidth=4.5;ctx.lineCap="round";
    for(let i=0;i<4;i++){
      const side=i<2?-1:1,off=(i%2)*12-6,swing=Math.sin(lp+i*1.5)*17;
      ctx.beginPath();ctx.moveTo(side*9,off);ctx.quadraticCurveTo(side*30,off+10+swing,side*24,off+34+swing);ctx.stroke();
    }
    // Body
    const rim=chasing?"rgba(210,22,22,0.65)":"rgba(105,85,130,0.4)";
    ctx.fillStyle=chasing?"#280606":"#1c1828";
    ctx.beginPath();ctx.ellipse(0,-5,18,32,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=rim;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,-5,18,32,0,0,Math.PI*2);ctx.stroke();
    // Neck
    ctx.fillStyle=chasing?"#200404":"#140f1e";ctx.fillRect(-5,-38,10,15);
    // Head
    ctx.fillStyle=chasing?"#260505":"#181228";
    ctx.beginPath();ctx.ellipse(0,-50,17,22,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=rim;ctx.lineWidth=1.8;ctx.beginPath();ctx.ellipse(0,-50,17,22,0,0,Math.PI*2);ctx.stroke();
    // Arms
    ctx.strokeStyle=chasing?"#1e0404":"#120e1a";ctx.lineWidth=5.5;ctx.lineCap="round";
    const armSwing=Math.sin(lp)*12;
    ctx.beginPath();ctx.moveTo(-15,-18);ctx.quadraticCurveTo(-34,10+armSwing,-28,48+armSwing);ctx.stroke();
    ctx.beginPath();ctx.moveTo(15,-18);ctx.quadraticCurveTo(34,10-armSwing,28,48-armSwing);ctx.stroke();
    ctx.strokeStyle=rim;ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(-15,-18);ctx.quadraticCurveTo(-34,10+armSwing,-28,48+armSwing);ctx.stroke();
    ctx.beginPath();ctx.moveTo(15,-18);ctx.quadraticCurveTo(34,10-armSwing,28,48-armSwing);ctx.stroke();
    // Claws
    ctx.strokeStyle=chasing?"rgba(190,20,20,0.75)":"rgba(120,100,145,0.55)";ctx.lineWidth=1.6;
    for(let f=0;f<3;f++){
      ctx.beginPath();ctx.moveTo(-28+f*5,48+armSwing);ctx.lineTo(-32+f*6,60+armSwing);ctx.stroke();
      ctx.beginPath();ctx.moveTo(28-f*5,48-armSwing);ctx.lineTo(32-f*6,60-armSwing);ctx.stroke();
    }
    ctx.restore();

    // Off-screen arrow when chasing
    if(chasing&&cam){
      const sx=m.x-cam.x,sy=m.y-cam.y;
      const onScreen=sx>-50&&sx<CANVAS_W+50&&sy>-50&&sy<CANVAS_H+50;
      if(!onScreen){
        ctx.save();ctx.setTransform(1,0,0,1,0,0);
        const ang=Math.atan2(sy-CANVAS_H/2,sx-CANVAS_W/2);
        const ax=CANVAS_W/2+Math.cos(ang)*265,ay=CANVAS_H/2+Math.sin(ang)*188;
        ctx.globalAlpha=0.7+Math.sin(r.time*0.009)*0.3;
        ctx.fillStyle="#ff1a1a";ctx.shadowColor="rgba(255,0,0,0.9)";ctx.shadowBlur=14;
        ctx.save();ctx.translate(ax,ay);ctx.rotate(ang);
        ctx.beginPath();ctx.moveTo(20,0);ctx.lineTo(-9,-8);ctx.lineTo(-5,0);ctx.lineTo(-9,8);ctx.closePath();ctx.fill();
        ctx.restore();ctx.shadowBlur=0;ctx.restore();
      }
    }
  }

  // ── MONSTER EYES — drawn completely last, always visible ──────────────────
  // These are drawn in SCREEN space so they pierce through the darkness overlay.
  function drawMonsterEyes(ctx,r,cam){
    const m=r.monster,p=r.player;
    const d=dist(m,p);
    const chasing=m.mode==="chase"||r.finalPhase;

    // Eyes are visible from much further than body
    // Opacity based purely on distance, always at least faint
    const eyeOpacity = chasing ? clamp((700-d)/600,0.3,1)
                                : clamp((400-d)/380,0.05,0.85);
    if(eyeOpacity<=0.02) return;

    // Convert monster world coords to screen coords
    const sx=m.x-cam.x, sy=m.y-cam.y;
    // Only draw if somewhere near screen
    if(sx<-150||sx>CANVAS_W+150||sy<-150||sy>CANVAS_H+150) return;

    // The monster head faces dirAngle, so eyes must be offset in that direction
    const facing=(m.dirAngle||0)-Math.PI/2;
    // Rotate eye positions by facing
    const eyeOffsets=[{ex:-6,ey:-53},{ex:6,ey:-53}];

    ctx.save();
    const pulsate=chasing?(0.6+Math.abs(Math.sin(r.time*0.006))*0.4):1;
    const eyeColor=chasing?`rgba(255,20,20,${eyeOpacity*pulsate})`:`rgba(240,240,255,${eyeOpacity})`;
    const glowColor=chasing?`rgba(255,0,0,${eyeOpacity*0.9})`:`rgba(180,180,255,${eyeOpacity*0.6})`;

    for(const {ex,ey} of eyeOffsets){
      // Rotate the local eye offset by the monster's facing angle
      const rotX=ex*Math.cos(facing)-ey*Math.sin(facing);
      const rotY=ex*Math.sin(facing)+ey*Math.cos(facing);
      const finalX=sx+rotX, finalY=sy+rotY;

      // Outer glow
      ctx.globalAlpha=eyeOpacity*(chasing?0.5:0.3);
      const glowGrad=ctx.createRadialGradient(finalX,finalY,1,finalX,finalY,chasing?22:14);
      glowGrad.addColorStop(0,glowColor);
      glowGrad.addColorStop(1,"rgba(0,0,0,0)");
      ctx.fillStyle=glowGrad;
      ctx.beginPath();ctx.arc(finalX,finalY,chasing?22:14,0,Math.PI*2);ctx.fill();

      // Eye white/iris
      ctx.globalAlpha=eyeOpacity*pulsate;
      ctx.shadowColor=glowColor;ctx.shadowBlur=chasing?20:10;
      ctx.fillStyle=eyeColor;
      ctx.beginPath();ctx.ellipse(finalX,finalY,chasing?6.5:5,chasing?4.5:3.5,facing,0,Math.PI*2);ctx.fill();
      ctx.shadowBlur=0;

      // Pupil
      ctx.globalAlpha=eyeOpacity;
      ctx.fillStyle="#000";
      ctx.beginPath();ctx.arc(finalX,finalY,chasing?3:2.5,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }

  // ── lighting ───────────────────────────────────────────────────────────────
  function drawLighting(ctx,r,cam){
    const p=r.player;
    const px=p.x-cam.x,py=p.y-cam.y;
    const dk=document.createElement("canvas");
    dk.width=CANVAS_W;dk.height=CANVAS_H;
    const dc=dk.getContext("2d");

    dc.fillStyle="rgba(0,0,0,0.965)";dc.fillRect(0,0,CANVAS_W,CANVAS_H);

    const cz=getZoneAt(r.map,p,6);
    const revealZones=r.map.walkable.filter(zone=>{
      if(!cz) return rectDistToPoint(zone,p)<130;
      if(zone.id===cz.id) return true;
      if(zonesTouch(zone,cz)&&rectDistToPoint(zone,p)<105) return true;
      return false;
    });

    dc.globalCompositeOperation="destination-out";

    for(const zone of revealZones){
      dc.save();
      dc.beginPath();dc.rect(zone.x-cam.x,zone.y-cam.y,zone.w,zone.h);dc.clip();

      const baseR=p.flashlightOff?72:115+p.battery*0.72;
      const radius=clamp(baseR-p.fear*0.22,58,190);

      const amb=dc.createRadialGradient(px,py,8,px,py,radius);
      amb.addColorStop(0,"rgba(255,255,255,0.95)");
      amb.addColorStop(0.38,"rgba(255,255,255,0.65)");
      amb.addColorStop(0.72,"rgba(255,255,255,0.18)");
      amb.addColorStop(1,"rgba(255,255,255,0)");
      dc.fillStyle=amb;dc.beginPath();dc.arc(px,py,radius,0,Math.PI*2);dc.fill();

      if(!p.flashlightOff&&p.battery>0){
        const ff=Math.random()<p.fear/480?rand(0.58,0.96):1;
        const coneLen=clamp(290+p.battery*1.15-p.fear*0.75,170,440)*ff;
        const coneW=0.47;
        // Wide soft beam
        const cG=dc.createRadialGradient(px,py,18,px,py,coneLen);
        cG.addColorStop(0,"rgba(255,255,255,0.88)");cG.addColorStop(0.32,"rgba(255,248,232,0.58)");cG.addColorStop(0.7,"rgba(255,240,205,0.22)");cG.addColorStop(1,"rgba(255,255,255,0)");
        dc.fillStyle=cG;dc.beginPath();dc.moveTo(px,py);dc.arc(px,py,coneLen,p.angle-coneW,p.angle+coneW);dc.closePath();dc.fill();
        // Bright core
        const core=dc.createRadialGradient(px,py,5,px,py,coneLen*0.55);
        core.addColorStop(0,"rgba(255,255,255,0.68)");core.addColorStop(1,"rgba(255,255,255,0)");
        dc.fillStyle=core;dc.beginPath();dc.moveTo(px,py);dc.arc(px,py,coneLen*0.55,p.angle-coneW*0.38,p.angle+coneW*0.38);dc.closePath();dc.fill();
      }
      dc.restore();
    }

    dc.globalCompositeOperation="source-over";
    ctx.drawImage(dk,0,0);

    // Vignette
    const vig=ctx.createRadialGradient(CANVAS_W/2,CANVAS_H/2,60,CANVAS_W/2,CANVAS_H/2,600);
    vig.addColorStop(0,"rgba(0,0,0,0)");vig.addColorStop(0.5,"rgba(0,0,0,0.16)");vig.addColorStop(1,"rgba(0,0,0,0.9)");
    ctx.fillStyle=vig;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);

    if(p.fear>38){ctx.fillStyle=`rgba(62,0,0,${(p.fear-38)/100*0.3})`;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);}
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
    ctx.save();

    // Left panel
    const px2=18,py2=18,pw=244,ph=162;
    ctx.fillStyle="rgba(3,2,8,0.84)";rrect(ctx,px2,py2,pw,ph,5);ctx.fill();
    ctx.strokeStyle="rgba(165,50,50,0.4)";ctx.lineWidth=1;rrect(ctx,px2,py2,pw,ph,5);ctx.stroke();
    ctx.fillStyle="rgba(165,20,20,0.92)";ctx.fillRect(px2+5,py2+1,pw-10,3);
    ctx.fillStyle="rgba(200,72,72,0.96)";ctx.font="bold 10px 'Courier New'";ctx.textAlign="left";
    ctx.fillText(`◈ SOMETHING HEARD YOU — FLOOR ${r.floorNum}/${MAX_FLOORS}`,px2+11,py2+18);
    ctx.strokeStyle="rgba(165,50,50,0.22)";ctx.lineWidth=0.8;
    ctx.beginPath();ctx.moveTo(px2+8,py2+25);ctx.lineTo(px2+pw-8,py2+25);ctx.stroke();
    const bx=px2+11,bw=pw-58;
    hBar(ctx,bx,py2+35,bw,10,p.battery/100,"#c8ba32","#4a4218","BAT");
    hBar(ctx,bx,py2+58,bw,10,1-p.fear/100,"#3890d8","#142852","CALM");
    hBar(ctx,bx,py2+81,bw,10,p.stamina/100,"#828282","#2a2a2a","STM");
    ctx.fillStyle="rgba(138,138,138,0.7)";ctx.font="9px 'Courier New'";ctx.fillText("VITAL",bx,py2+110);
    for(let i=0;i<3;i++){
      ctx.fillStyle=i<p.hp?"rgba(178,20,20,0.98)":"rgba(55,20,20,0.52)";
      ctx.font="19px monospace";ctx.fillText("♥",bx+i*28,py2+138);
    }
    if(p.hidden){ctx.fillStyle="rgba(105,135,225,0.88)";ctx.font="bold 9px 'Courier New'";ctx.textAlign="center";ctx.fillText("⬛ CONCEALED",px2+pw/2,py2+ph+16);}

    // Fragment counter
    const fcW=168,fcH=46;
    ctx.fillStyle="rgba(3,2,8,0.84)";rrect(ctx,CANVAS_W-fcW-18,18,fcW,fcH,5);ctx.fill();
    ctx.strokeStyle="rgba(165,50,50,0.4)";ctx.lineWidth=1;rrect(ctx,CANVAS_W-fcW-18,18,fcW,fcH,5);ctx.stroke();
    ctx.textAlign="right";ctx.fillStyle="rgba(200,72,72,0.94)";ctx.font="bold 10px 'Courier New'";
    ctx.fillText("FRAGMENTS",CANVAS_W-26,35);
    ctx.fillStyle=r.collected===ITEM_COUNT?"rgba(55,245,100,0.97)":"rgba(228,178,178,0.94)";
    ctx.font="bold 22px 'Courier New'";ctx.fillText(`${r.collected} / ${ITEM_COUNT}`,CANVAS_W-26,57);

    drawObjectiveCompass(ctx,r,obj,objDist);

    // Final phase banner
    if(r.finalPhase){
      const tp=Math.sin(r.time*0.004)*0.38+0.62;
      ctx.fillStyle=`rgba(125,0,0,${0.28*tp})`;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
      ctx.textAlign="center";ctx.fillStyle=`rgba(255,55,55,${tp*0.97})`;ctx.font="bold 13px 'Courier New'";
      ctx.shadowColor="rgba(255,0,0,0.45)";ctx.shadowBlur=14;
      ctx.fillText("▶  RUN TO THE EXIT  ◀",CANVAS_W/2,36);ctx.shadowBlur=0;
    }

    // Heartbeat proximity dread
    const md=dist(p,r.monster);
    if(md<400){
      const hbI=clamp((400-md)/400,0,1);
      const hbP=Math.sin((r.heartbeatPhase||0)*Math.PI*2);
      if(hbP>0.68) {ctx.fillStyle=`rgba(90,0,0,${hbI*hbP*0.15})`;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);}
    }

    // Message bar
    if(r.message){
      const mW=570,mH=36,mX=CANVAS_W/2-mW/2,mY=CANVAS_H-60;
      ctx.fillStyle="rgba(3,2,8,0.8)";rrect(ctx,mX,mY,mW,mH,4);ctx.fill();
      ctx.strokeStyle="rgba(158,55,55,0.28)";ctx.lineWidth=0.8;rrect(ctx,mX,mY,mW,mH,4);ctx.stroke();
      ctx.textAlign="center";ctx.fillStyle="rgba(212,192,192,0.94)";ctx.font="12px 'Courier New'";
      ctx.fillText(r.message,CANVAS_W/2,mY+23);
    }
    ctx.restore();
  }

  // ── overlays ───────────────────────────────────────────────────────────────
  function drawOverlays(ctx,r){
    const fear=r.player.fear/100;

    // Scanlines
    if(fear>0.38){ctx.save();ctx.globalAlpha=(fear-0.38)*0.11;for(let y=0;y<CANVAS_H;y+=3){ctx.fillStyle="rgba(0,0,0,0.75)";ctx.fillRect(0,y,CANVAS_W,1);}ctx.restore();}
    // Static
    if(fear>0.48){ctx.save();ctx.globalAlpha=(fear-0.48)*0.24;for(let i=0;i<60;i++){ctx.fillStyle=Math.random()>0.5?"rgba(255,255,255,0.92)":"rgba(0,0,0,0.92)";ctx.fillRect(rand(0,CANVAS_W),rand(0,CANVAS_H),rand(1,4),rand(1,3));}ctx.restore();}
    // RGB glitch
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

    // Floor complete banner
    if(r.floorComplete&&!r.won){
      ctx.save();ctx.fillStyle="rgba(0,0,0,0.82)";ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
      ctx.textAlign="center";
      ctx.shadowColor="rgba(55,200,90,0.6)";ctx.shadowBlur=30;
      ctx.fillStyle="rgba(90,230,130,0.98)";ctx.font="bold 46px 'Courier New'";
      ctx.fillText(`FLOOR ${r.floorNum} CLEARED`,CANVAS_W/2,CANVAS_H/2-28);ctx.shadowBlur=0;
      ctx.fillStyle="rgba(148,195,162,0.75)";ctx.font="15px 'Courier New'";
      ctx.fillText("Going deeper…",CANVAS_W/2,CANVAS_H/2+18);
      const dots=".".repeat(Math.floor(r.time/400)%4);
      ctx.fillStyle="rgba(100,180,130,0.58)";ctx.font="13px 'Courier New'";
      ctx.fillText(`Entering floor ${r.floorNum+1}${dots}`,CANVAS_W/2,CANVAS_H/2+46);
      ctx.restore();
    }

    // Jump scare
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
      ctx.fillStyle=`rgba(255,0,0,${alpha*0.95})`;ctx.shadowColor="rgba(255,0,0,0.9)";ctx.shadowBlur=20;
      ctx.beginPath();ctx.ellipse(eL.x,eL.y,15,10,rand(-0.4,0.4),0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.ellipse(eR.x,eR.y,12,16,rand(-0.4,0.4),0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#000";ctx.shadowBlur=0;
      ctx.beginPath();ctx.arc(eL.x,eL.y,7,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(eR.x,eR.y,6,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=`rgba(255,255,255,${alpha*0.58})`;ctx.lineWidth=4.5;
      ctx.beginPath();ctx.moveTo(-54,28);ctx.quadraticCurveTo(0,82,54,28);ctx.stroke();
      ctx.fillStyle=`rgba(240,230,220,${alpha*0.52})`;for(let t=0;t<7;t++) ctx.fillRect(-38+t*12,30,10,19);
      ctx.restore();
      ctx.textAlign="center";ctx.fillStyle=`rgba(255,255,255,${alpha*0.98})`;
      ctx.shadowColor="rgba(235,0,0,0.48)";ctx.shadowBlur=24;
      ctx.font=`bold ${Math.floor(54+(1-progress)*24)}px 'Courier New'`;
      ctx.fillText(r.scare.text,CANVAS_W/2,CANVAS_H-72);ctx.shadowBlur=0;
      ctx.restore();
    }

    // Start / death / win
    if(!started||r.dead||r.won){
      ctx.save();ctx.fillStyle="rgba(0,0,0,0.9)";ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
      for(let i=0;i<18;i++){ctx.fillStyle=`rgba(48,8,8,${rand(0.02,0.07)})`;ctx.fillRect(0,rand(0,CANVAS_H),CANVAS_W,rand(1,3));}
      const cx2=CANVAS_W/2,cy2=CANVAS_H/2;ctx.textAlign="center";

      if(!started){
        ctx.fillStyle="rgba(125,16,16,0.09)";ctx.font="bold 130px 'Courier New'";ctx.fillText("SHY",cx2,cy2+52);
        ctx.shadowColor="rgba(178,20,20,0.58)";ctx.shadowBlur=32;ctx.fillStyle="rgba(222,82,82,0.99)";
        ctx.font="bold 40px 'Courier New'";ctx.fillText("SOMETHING HEARD YOU",cx2,cy2-58);ctx.shadowBlur=0;
        ctx.fillStyle="rgba(172,150,150,0.76)";ctx.font="13px 'Courier New'";
        ctx.fillText("A dark horror roguelike. 3 floors. 6 fragments each. One monster.",cx2,cy2-10);
        ctx.fillText("WASD move  ·  Mouse aim flashlight  ·  Shift sprint  ·  E interact",cx2,cy2+14);
        ctx.fillText("F flashlight toggle  ·  Space hide in locker  ·  Collect 6 fragments then escape.",cx2,cy2+36);
        const p2=(Math.sin(Date.now()*0.003)*0.3)+0.7;
        ctx.fillStyle=`rgba(192,60,60,${p2})`;ctx.font="bold 15px 'Courier New'";ctx.fillText("[ CLICK OR PRESS START ]",cx2,cy2+84);
      } else if(r.dead){
        ctx.shadowColor="rgba(128,0,0,0.68)";ctx.shadowBlur=40;ctx.fillStyle="rgba(192,50,50,0.99)";
        ctx.font="bold 50px 'Courier New'";ctx.fillText("YOU WERE HEARD",cx2,cy2-36);ctx.shadowBlur=0;
        ctx.fillStyle="rgba(172,132,132,0.76)";ctx.font="14px 'Courier New'";ctx.fillText("The dark learned your name.",cx2,cy2+8);
        ctx.fillStyle="rgba(118,90,90,0.58)";ctx.font="12px 'Courier New'";
        ctx.fillText(`Floor ${r.floorNum}/${MAX_FLOORS}  ·  Fragments: ${r.collected}/${ITEM_COUNT}`,cx2,cy2+32);
        ctx.fillStyle="rgba(172,68,68,0.82)";ctx.font="bold 13px 'Courier New'";ctx.fillText("[ RESTART ]",cx2,cy2+76);
      } else if(r.won){
        ctx.shadowColor="rgba(52,178,72,0.58)";ctx.shadowBlur=32;ctx.fillStyle="rgba(90,222,132,0.99)";
        ctx.font="bold 50px 'Courier New'";ctx.fillText("YOU ESCAPED",cx2,cy2-36);ctx.shadowBlur=0;
        ctx.fillStyle="rgba(145,192,158,0.76)";ctx.font="14px 'Courier New'";ctx.fillText("All 3 floors cleared. It's still in there.",cx2,cy2+8);
        ctx.fillStyle="rgba(110,150,122,0.58)";ctx.font="12px 'Courier New'";ctx.fillText("Waiting for the next one.",cx2,cy2+32);
        ctx.fillStyle="rgba(85,165,108,0.82)";ctx.font="bold 13px 'Courier New'";ctx.fillText("[ PLAY AGAIN ]",cx2,cy2+76);
      }
      ctx.restore();
    }
  }

  // ── input ──────────────────────────────────────────────────────────────────
  useEffect(()=>{
    const down=(e)=>{
      const key=e.key.toLowerCase();
      keysRef.current[key]=true;
      if(["w","a","s","d"," ","shift","e","f"].includes(key)) e.preventDefault();
      if(key==="f"){const r=runRef.current;if(!r||r.dead||r.won)return;r.player.flashlightOff=!r.player.flashlightOff;r.message=r.player.flashlightOff?"Flashlight off.":"Flashlight on.";}
      if(key==="e") interact();
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

  return(
    <div className="shy-page">
      <div className="shy-shell">
        <div className="shy-header">
          <div>
            <p className="shy-kicker">◈ Signal Detected — {run.floorNum}/{MAX_FLOORS} Floors ◈</p>
            <h1>Something Heard You</h1>
            <p>A dark horror roguelike. Three floors. Six fragments each. One thing hunting you — and it learns.</p>
          </div>
          <div className="shy-actions">
            <button onClick={started?restart:()=>setStarted(true)}>{started?"Restart":"Start Run"}</button>
            {onExit&&<button className="shy-secondary" onClick={onExit}>Back</button>}
          </div>
        </div>
        <div className="shy-game-card">
          <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} className="shy-canvas"
            onClick={()=>{if(!started)setStarted(true);}}/>
          <div className="shy-controls">
            <span>WASD · move</span><span>Mouse · aim light</span><span>Shift · sprint</span>
            <span>E · interact/collect</span><span>F · flashlight</span><span>Space · hide</span>
          </div>
        </div>
        <div className="shy-notes">
          <div>
            <h3>Three Floors</h3>
            <p>Clear each floor by collecting 6 fragments and reaching the exit. The monster gets faster and more aggressive on each floor. Your health and battery carry over.</p>
          </div>
          <div>
            <h3>The Monster</h3>
            <p>Its glowing eyes are always visible in the dark — use them to track it. It chases slower than you sprint, but catches you if you walk. Running creates noise that attracts it.</p>
          </div>
          <div>
            <h3>Survival</h3>
            <p>The red compass arrow shows where it is when it's off-screen and chasing. Use lockers to hide. Heartbeat pulses when it's close. High fear causes glitches and jump scares.</p>
          </div>
        </div>
      </div>
    </div>
  );
}