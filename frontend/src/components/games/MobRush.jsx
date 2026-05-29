import React, { useEffect, useRef, useState } from "react";

/* ═══════════════════════════════════════════════════════
   MOB RUSH  —  Count Masters clone, infinite, engaging
   ═══════════════════════════════════════════════════════ */

const CW = 800, CH = 680;
const ROAD_TOP_L = 320, ROAD_TOP_R = 480;   // road at horizon
const ROAD_BOT_L = 20,  ROAD_BOT_R = 780;   // road at bottom
const ROAD_CX    = CW / 2;
const HORIZON_Y  = 130;
const PLAYER_Y   = 560;
const PLAYER_HALF = 130;   // how far from center player can move
const MAX_VIS    = 1800;   // world units visible ahead

const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const lerp  = (a,b,t)  => a + (b-a)*t;
const rand  = (a,b)    => Math.random()*(b-a)+a;
const randI = (a,b)    => Math.floor(rand(a,b+1));

/* ── Perspective helpers ─────────────────────────────── */
function distToScreenY(dist) {
  if (dist <= 0) return PLAYER_Y - dist * 0.35;
  const t = clamp(dist / MAX_VIS, 0, 1);
  const c = 1 - Math.pow(1-t, 1.75);
  return PLAYER_Y - c * (PLAYER_Y - HORIZON_Y);
}
function pScale(screenY) {
  return clamp((screenY - HORIZON_Y) / (PLAYER_Y - HORIZON_Y), 0.01, 1.05);
}
function worldXToSX(worldXOff, screenY) {
  return ROAD_CX + worldXOff * pScale(screenY);
}

/* ── roundRect ───────────────────────────────────────── */
function rr(ctx, x,y,w,h,r) {
  if (!isFinite(x+y+w+h) || w<=0 || h<=0) return;
  r = Math.min(Math.abs(r), w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
}

/* ── Gate math ───────────────────────────────────────── */
function fmtGate(g) {
  return g.type==="add"?`+${g.v}`:g.type==="sub"?`-${g.v}`:g.type==="mul"?`×${g.v}`:`÷${g.v}`;
}
function applyGate(n,g) {
  if(g.type==="add") return n+g.v;
  if(g.type==="sub") return Math.max(1,n-g.v);
  if(g.type==="mul") return n*g.v;
  if(g.type==="div") return Math.max(1,Math.floor(n/g.v));
  return n;
}
function isGoodGate(g) { return g.type==="add"||g.type==="mul"; }

/* ── Seeded random for chunk generation ─────────────── */
let _seed = 1;
function srnd() {
  _seed = (_seed * 1664525 + 1013904223) & 0xffffffff;
  return ((_seed>>>0) / 4294967296);
}
function srndI(a,b) { return Math.floor(srnd()*(b-a+1))+a; }

/* ── Chunk / level generator ─────────────────────────── */
function makeGatePair(chunkIdx) {
  // Random gate pair — one good, one bad, values scale with chunk
  const scale = Math.min(chunkIdx, 20);
  const goodTypes  = ["add","add","mul","mul","add","mul"];
  const badTypes   = ["sub","div","sub","sub","div","sub"];
  const goodType   = goodTypes[srndI(0, goodTypes.length-1)];
  const badType    = badTypes [srndI(0, badTypes.length-1)];

  let goodVal, badVal;
  if (goodType==="mul") goodVal = srndI(2, Math.min(2+Math.floor(scale/4), 5));
  else goodVal = srndI(8+scale*2, 20+scale*4);
  if (badType==="div")  badVal = srndI(2, Math.min(2+Math.floor(scale/5), 4));
  else badVal = srndI(5+scale, 15+scale*2);

  // Randomize which side is good
  const goodLeft = srnd() > 0.5;
  return [
    { side: -1, type: goodLeft?goodType:badType,  v: goodLeft?goodVal:badVal,  triggered:false },
    { side:  1, type: goodLeft?badType:goodType,   v: goodLeft?badVal:goodVal,  triggered:false },
  ];
}

function buildChunk(startY, chunkIdx) {
  const secs = [];
  let y = startY;
  const diff = Math.min(chunkIdx * 0.15, 5);

  // ── Gate ──────────────────────────────────────────
  secs.push({ id:`g${chunkIdx}`, kind:"gates", worldY:y,
    gates: makeGatePair(chunkIdx) });
  y += 480 + srnd()*180;

  // ── Obstacle (random type each time) ──────────────
  const obsType = srndI(0,3); // 0=enemies 1=blades 2=spikes 3=wall+gap
  if (obsType === 0) {
    const count = srndI(8+chunkIdx*3, 16+chunkIdx*5);
    const xOff = (srnd()-0.5)*160;
    secs.push({ id:`e${chunkIdx}`, kind:"enemies", worldY:y,
      x:xOff, count, maxCount:count, defeated:false });
  } else if (obsType === 1) {
    const bladeCount = srndI(1,2);
    const blades = [];
    if (bladeCount===1) {
      blades.push({ xOff:(srnd()-0.5)*180, phase:srnd()*Math.PI*2, hit:false });
    } else {
      blades.push({ xOff:-120-srnd()*40, phase:srnd()*Math.PI*2, hit:false });
      blades.push({ xOff: 120+srnd()*40, phase:srnd()*Math.PI*2, hit:false });
    }
    secs.push({ id:`b${chunkIdx}`, kind:"blades", worldY:y, blades });
  } else if (obsType === 2) {
    // Spikes — random arrangement with a clear gap somewhere
    const gapSide = srnd()>0.5?1:-1; // gap on left or right
    const spikes = [];
    const count = 2+Math.floor(diff*0.5);
    for (let i=0;i<count;i++) {
      const side = (i%2===0)?-1:1;
      spikes.push({ xOff: side*(60+srnd()*120), hit:false });
    }
    secs.push({ id:`sp${chunkIdx}`, kind:"spikes", worldY:y, spikes });
  } else {
    // Narrow corridor — two spike walls with one safe lane
    const safeX = (srndI(0,2)-1)*160; // -160, 0, or 160
    secs.push({ id:`g2${chunkIdx}`, kind:"gauntlet", worldY:y,
      safeX, spread:srndI(2,3) });
  }
  y += 420 + srnd()*200;

  // ── Second gate (later chunks) ─────────────────────
  if (chunkIdx >= 3) {
    secs.push({ id:`g3${chunkIdx}`, kind:"gates", worldY:y,
      gates: makeGatePair(chunkIdx) });
    y += 400 + srnd()*120;
  }

  // ── Boss every 6 chunks ────────────────────────────
  if (chunkIdx>0 && chunkIdx%6===0) {
    const hp = 180+chunkIdx*25;
    secs.push({ id:`boss${chunkIdx}`, kind:"boss", worldY:y,
      hp, maxHp:hp, defeated:false, charge:0 });
    y += 900;
  }

  return { secs, endY: y };
}

function initWorld(runSeed) {
  _seed = runSeed;
  const secs = [];
  let y = 500;
  for (let i=0;i<7;i++) {
    const c = buildChunk(y, i);
    secs.push(...c.secs);
    y = c.endY;
  }
  return { secs, nextY:y, nextIdx:7 };
}

/* ── Pillar data for scrolling side architecture ──── */
function makePillars() {
  const out = [];
  for (let i=0;i<60;i++) {
    const side = i%2===0?-1:1;
    // World-space: pillars are placed along the sides of the road
    // worldX defines how far from road center
    out.push({
      worldX: side * (380 + Math.random()*80),
      worldY: i * 320 + Math.random()*80,
      width:  50 + Math.random()*30,
      height: 80 + Math.random()*60,
      hue: 190 + Math.random()*20,
    });
  }
  return out;
}
const PILLARS = makePillars();

/* ── Formation positions ─────────────────────────── */
function formation(count) {
  const vis = Math.min(count, 150);
  const cols = Math.min(12, Math.max(1, Math.ceil(Math.sqrt(vis*1.6))));
  const out = [];
  for (let i=0;i<vis;i++) {
    const row = Math.floor(i/cols);
    const col = i%cols;
    const rc  = Math.min(cols, vis-row*cols);
    out.push({
      x: (col-(rc-1)/2)*26,
      z: row*24,
      s: Math.max(0.5, 1-row*0.022),
    });
  }
  return out;
}

/* ── Draw round blob (Count Masters style) ────────── */
function drawBlob(ctx, cx,cy,r,h,sat,lit, doShadow=true) {
  if (r<1) return;
  if (doShadow) {
    ctx.save(); ctx.fillStyle="rgba(0,0,0,0.18)";
    ctx.beginPath(); ctx.ellipse(cx,cy+r*1.85,r*0.85,r*0.28,0,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
  const bg = ctx.createRadialGradient(cx-r*.22,cy-r*.05,r*.04,cx,cy+r*.45,r*1.35);
  bg.addColorStop(0,`hsl(${h},${sat}%,${lit+10}%)`);
  bg.addColorStop(1,`hsl(${h},${sat}%,${lit-12}%)`);
  ctx.fillStyle=bg;
  ctx.beginPath(); ctx.ellipse(cx,cy+r*.52,r*.78,r*.98,0,0,Math.PI*2); ctx.fill();

  const hg = ctx.createRadialGradient(cx-r*.3,cy-r*.95,r*.04,cx,cy-r*.7,r*.82);
  hg.addColorStop(0,`hsl(${h},${sat}%,${lit+22}%)`);
  hg.addColorStop(1,`hsl(${h},${sat}%,${lit+2}%)`);
  ctx.fillStyle=hg;
  ctx.beginPath(); ctx.arc(cx,cy-r*.72,r*.74,0,Math.PI*2); ctx.fill();

  const er=r*.11;
  ctx.fillStyle="rgba(0,0,0,0.72)";
  ctx.beginPath();
  ctx.arc(cx-r*.2,cy-r*.78,er,0,Math.PI*2);
  ctx.arc(cx+r*.2,cy-r*.78,er,0,Math.PI*2);
  ctx.fill();

  ctx.fillStyle="rgba(255,255,255,0.44)";
  ctx.beginPath(); ctx.ellipse(cx-r*.28,cy-r*1.1,r*.23,r*.17,-0.4,0,Math.PI*2); ctx.fill();
}

/* ══════════════════════════════════════════════════════
   COMPONENT
   ══════════════════════════════════════════════════════ */
export default function MobRush() {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);
  const keysRef   = useRef({});
  const dragRef   = useRef({active:false,startX:0,baseX:ROAD_CX});
  const [, bump]  = useState(0);
  const rerender  = () => bump(v=>v+1);

  const gs = useRef(newState());

  function newState() {
    const seed = Date.now() & 0xfffffff;
    const w = initWorld(seed);
    return {
      phase:"menu",
      playerX: ROAD_CX,
      targetX: ROAD_CX,
      worldY:  0,
      speed:   5.5,
      crowd:   1,
      distance:0,
      wave:    1,
      streak:  0,          // consecutive good gates
      onFire:  false,
      fireTimer:0,
      waveAnnounce:0,      // countdown for wave text
      waveAnnounceText:"",
      levels:  w.secs,
      nextY:   w.nextY,
      nextIdx: w.nextIdx,
      particles:[],
      floats:[],
      splats:[],
      popBlobs:[],         // pop-in animation when crowd grows
      flash:{r:0,g:0,b:0,a:0},
      shake:0,
      bossAlert:0,
      stats:{ best:1, bestDist:0 },
      runSeed: seed,
    };
  }

  const startRun = () => {
    const seed = Date.now() & 0xfffffff;
    const w = initWorld(seed);
    const prev = gs.current.stats;
    Object.assign(gs.current, {
      phase:"playing",
      playerX:ROAD_CX, targetX:ROAD_CX,
      worldY:0, speed:5.5, crowd:1,
      distance:0, wave:1, streak:0,
      onFire:false, fireTimer:0,
      waveAnnounce:0, waveAnnounceText:"",
      levels:w.secs, nextY:w.nextY, nextIdx:w.nextIdx,
      particles:[], floats:[], splats:[], popBlobs:[],
      flash:{r:0,g:0,b:0,a:0}, shake:0, bossAlert:0,
      stats:prev, runSeed:seed,
    });
    rerender();
  };

  /* helpers */
  const addFloat = (text,x,y,color="#fff",size=34) => {
    gs.current.floats.push({text,x,y,vy:-2.1,life:60,ml:60,color,size});
    if(gs.current.floats.length>60) gs.current.floats.splice(0,10);
  };
  const pfx = (x,y,n,type) => {
    for(let i=0;i<n;i++)
      gs.current.particles.push({x,y,vx:rand(-4,4),vy:rand(-7.5,-1.5),life:rand(28,58),ml:58,size:rand(3,9),type});
    if(gs.current.particles.length>350) gs.current.particles.splice(0,60);
  };
  const doFlash = (r,g,b,a) => { gs.current.flash={r,g,b,a}; };
  const popIn = (x,y,n,h,sat,lit) => {
    for(let i=0;i<Math.min(n,18);i++) {
      gs.current.popBlobs.push({
        x:x+rand(-50,50), y:y+rand(-30,10),
        scale:0, targetScale:1,
        life:22, ml:22, h,sat,lit,
      });
    }
  };

  /* ── Input ─────────────────────────────────────── */
  useEffect(()=>{
    const kd=e=>{
      keysRef.current[e.key.toLowerCase()]=true;
      if(e.key===" "&&gs.current.phase!=="playing"){e.preventDefault();startRun();}
    };
    const ku=e=>{ keysRef.current[e.key.toLowerCase()]=false; };
    window.addEventListener("keydown",kd);
    window.addEventListener("keyup",ku);
    return()=>{window.removeEventListener("keydown",kd);window.removeEventListener("keyup",ku);};
  },[]);

  useEffect(()=>{
    const canvas=canvasRef.current; if(!canvas) return;
    const cx=cX=>(( cX-canvas.getBoundingClientRect().left)/canvas.getBoundingClientRect().width)*CW;
    const pd=e=>{ dragRef.current={active:true,startX:cx(e.clientX),baseX:gs.current.targetX}; canvas.setPointerCapture?.(e.pointerId); };
    const pm=e=>{ if(!dragRef.current.active)return; gs.current.targetX=clamp(dragRef.current.baseX+(cx(e.clientX)-dragRef.current.startX)*1.12,ROAD_CX-PLAYER_HALF,ROAD_CX+PLAYER_HALF); };
    const pu=()=>{ dragRef.current.active=false; };
    canvas.addEventListener("pointerdown",pd); canvas.addEventListener("pointermove",pm);
    canvas.addEventListener("pointerup",pu); canvas.addEventListener("pointercancel",pu);
    return()=>{ canvas.removeEventListener("pointerdown",pd); canvas.removeEventListener("pointermove",pm); canvas.removeEventListener("pointerup",pu); canvas.removeEventListener("pointercancel",pu); };
  },[]);

  /* ── Loop ──────────────────────────────────────── */
  useEffect(()=>{
    const ctx=canvasRef.current.getContext("2d");
    let last=performance.now();
    const loop=now=>{
      const dt=clamp((now-last)/16.67,0.1,2.5); last=now;
      update(dt,now); draw(ctx,now);
      rafRef.current=requestAnimationFrame(loop);
    };
    rafRef.current=requestAnimationFrame(loop);
    return()=>cancelAnimationFrame(rafRef.current);
  },[]);

  /* ════════════════════════════════════════════════
     UPDATE
     ════════════════════════════════════════════════ */
  const update=(dt,now)=>{
    const s=gs.current;

    /* particles/floats */
    s.particles=s.particles.map(p=>({...p,x:p.x+p.vx*dt,y:p.y+p.vy*dt,vy:p.vy+0.28*dt,life:p.life-dt})).filter(p=>p.life>0);
    s.floats=s.floats.map(f=>({...f,y:f.y+f.vy*dt,life:f.life-dt})).filter(f=>f.life>0);
    s.popBlobs=s.popBlobs.map(b=>({...b,scale:lerp(b.scale,b.targetScale,0.25*dt*3),life:b.life-dt})).filter(b=>b.life>0);
    s.shake=Math.max(0,s.shake-1.2*dt);
    s.flash.a=Math.max(0,s.flash.a-0.055*dt);
    s.splats=s.splats.filter(sp=>sp.worldY>s.worldY-800);
    if(s.fireTimer>0) s.fireTimer-=dt;
    else s.onFire=false;
    if(s.waveAnnounce>0) s.waveAnnounce-=dt;
    if(s.bossAlert>0) s.bossAlert-=dt;

    if(s.phase!=="playing") return;

    /* movement */
    if(!dragRef.current.active){
      if(keysRef.current.a||keysRef.current.arrowleft)  s.targetX-=14*dt;
      if(keysRef.current.d||keysRef.current.arrowright) s.targetX+=14*dt;
      s.targetX=clamp(s.targetX,ROAD_CX-PLAYER_HALF,ROAD_CX+PLAYER_HALF);
    }
    s.playerX=lerp(s.playerX,s.targetX,1-Math.pow(0.005,dt/10));
    s.playerX=clamp(s.playerX,ROAD_CX-PLAYER_HALF,ROAD_CX+PLAYER_HALF);

    /* world scroll */
    s.worldY+=s.speed*dt;
    s.distance=Math.floor(s.worldY/100);

    /* speed ramp — gets faster gradually */
    s.speed=Math.min(12, 5.5+s.distance*0.004);

    /* wave counter */
    const newWave=Math.floor(s.worldY/2000)+1;
    if(newWave>s.wave){
      s.wave=newWave;
      s.waveAnnounce=2.8;
      s.waveAnnounceText=`WAVE ${s.wave}`;
      pfx(ROAD_CX,CH/2,60,"good");
    }

    /* lazy chunk generation */
    while(s.worldY+2400>s.nextY){
      const c=buildChunk(s.nextY,s.nextIdx);
      s.levels.push(...c.secs);
      s.nextY=c.endY;
      s.nextIdx++;
    }
    s.levels=s.levels.filter(sec=>sec.worldY>s.worldY-500);

    const pxOff = s.playerX - ROAD_CX;  // player's world-X offset

    /* interactions */
    for(const sec of s.levels){
      const dist=sec.worldY-s.worldY;
      if(dist>1900||dist<-120) continue;
      const HIT=52;

      /* ── GATES ── */
      if(sec.kind==="gates" && Math.abs(dist)<HIT){
        for(const g of sec.gates){
          if(g.triggered) continue;
          const gxOff=g.side*155;
          if(Math.abs(pxOff-gxOff)<160){
            g.triggered=true;
            const before=s.crowd;
            s.crowd=clamp(applyGate(s.crowd,g),1,9999);
            const good=isGoodGate(g);
            const gained=s.crowd-before;

            if(good){
              s.streak++;
              if(s.streak>=3){
                s.onFire=true; s.fireTimer=3.5;
                addFloat("🔥 ON FIRE!",s.playerX,PLAYER_Y-140,"#ff8800",32);
              }
              if(g.type==="mul"){
                // big pop-in for multiplier
                popIn(s.playerX,PLAYER_Y-60,gained,215,90,55);
                addFloat(fmtGate(g),s.playerX,PLAYER_Y-110,"#ffffff",58);
                doFlash(0,220,130,0.22);
                s.shake=5;
                pfx(s.playerX,PLAYER_Y-70,55,"good");
              } else {
                addFloat(fmtGate(g),s.playerX,PLAYER_Y-100,"#22ee77",46);
                pfx(s.playerX,PLAYER_Y-60,30,"good");
                doFlash(0,200,100,0.14);
                s.shake=3;
              }
            } else {
              s.streak=0; s.onFire=false;
              addFloat(fmtGate(g),s.playerX,PLAYER_Y-100,"#ff3355",46);
              pfx(s.playerX,PLAYER_Y-60,25,"bad");
              doFlash(255,40,60,0.22);
              s.shake=9;
            }
          }
        }
      }

      /* ── ENEMIES ── */
      if(sec.kind==="enemies"&&!sec.defeated&&Math.abs(dist)<HIT*1.2){
        if(Math.abs(pxOff-sec.x)<180){
          const bonusDmg=s.onFire?1.5:1;
          const myPow=Math.floor(s.crowd*bonusDmg);
          const theirPow=sec.count;
          const lost=Math.min(s.crowd-1,Math.ceil(theirPow*0.6));
          s.crowd=Math.max(1,s.crowd-lost);
          sec.count-=Math.min(sec.count,myPow);
          s.splats.push({worldY:sec.worldY,worldX:sec.x,c:"rgba(210,30,50,0.6)",r:14+rand(0,10)});
          s.splats.push({worldY:sec.worldY,worldX:sec.x+(rand(-1,1)*40),c:"rgba(40,110,255,0.5)",r:10+rand(0,8)});
          if(lost>0){addFloat(`-${lost}`,s.playerX,PLAYER_Y-90,"#ff3355",36);pfx(s.playerX,PLAYER_Y-55,35,"hit");s.shake=10;doFlash(255,60,60,0.18);}
          if(sec.count<=0){
            sec.defeated=true;
            addFloat("CLEARED!",sec.worldX?ROAD_CX+sec.x:ROAD_CX,PLAYER_Y-140,"#22ee77",28);
            pfx(ROAD_CX,PLAYER_Y-80,50,"good");
            rerender();
          } else if(s.crowd<=1){s.phase="failed";rerender();}
        }
      }

      /* ── BLADES ── */
      if(sec.kind==="blades"&&Math.abs(dist)<HIT){
        for(const b of sec.blades){
          if(b.hit) continue;
          const bxOff=b.xOff+Math.sin(now/270+b.phase)*72;
          if(Math.abs(pxOff-bxOff)<52){
            b.hit=true;
            const lost=Math.min(s.crowd-1,Math.ceil(s.crowd*0.28)+3);
            s.crowd=Math.max(1,s.crowd-lost);
            s.streak=0; s.onFire=false;
            addFloat(`-${lost}`,s.playerX,PLAYER_Y-90,"#ff4466",36);
            pfx(s.playerX,PLAYER_Y-55,30,"bad");
            s.shake=13; doFlash(255,120,0,0.26);
            if(s.crowd<=1){s.phase="failed";rerender();}
          }
        }
      }

      /* ── SPIKES ── */
      if(sec.kind==="spikes"&&Math.abs(dist)<HIT*.9){
        for(const sp of sec.spikes){
          if(sp.hit) continue;
          if(Math.abs(pxOff-sp.xOff)<48){
            sp.hit=true;
            const lost=Math.min(s.crowd-1,2+Math.ceil(s.crowd*.15));
            s.crowd=Math.max(1,s.crowd-lost);
            s.streak=0;
            addFloat(`-${lost}`,s.playerX,PLAYER_Y-90,"#ff4466",36);
            pfx(s.playerX,PLAYER_Y-55,20,"bad");
            s.shake=7; doFlash(255,80,0,0.18);
            if(s.crowd<=1){s.phase="failed";rerender();}
          }
        }
      }

      /* ── GAUNTLET ── */
      if(sec.kind==="gauntlet"&&Math.abs(dist)<HIT){
        if(Math.abs(pxOff-sec.safeX)>80){
          // hit the wall
          const lost=Math.min(s.crowd-1,Math.ceil(s.crowd*.22)+2);
          s.crowd=Math.max(1,s.crowd-lost);
          s.streak=0;
          addFloat(`-${lost}`,s.playerX,PLAYER_Y-90,"#ff4466",36);
          pfx(s.playerX,PLAYER_Y-55,25,"bad");
          s.shake=10; doFlash(255,100,0,0.22);
          if(s.crowd<=1){s.phase="failed";rerender();}
        }
      }

      /* ── BOSS ── */
      if(sec.kind==="boss"&&!sec.defeated&&Math.abs(dist)<110){
        if(s.bossAlert<=0){s.bossAlert=999;} // keep showing
        const bonusDmg=s.onFire?1.8:1;
        const dmg=Math.max(0.3,s.crowd*0.018*(0.4+bonusDmg*0.08))*dt;
        sec.hp=Math.max(0,sec.hp-dmg);
        sec.charge=(sec.charge||0)+dt;

        const crowdLoss=(sec.maxHp/2000)*dt;
        s.crowd=Math.max(1,s.crowd-crowdLoss);

        pfx(ROAD_CX,PLAYER_Y-90,Math.ceil(2*dt),"hit");
        s.shake=3;

        if(Math.floor(sec.charge*2)>Math.floor((sec.charge-dt)*2)){
          // damage tick text
          addFloat(`-${Math.ceil(dmg*10)}`,ROAD_CX+(rand(-1,1)*60),PLAYER_Y-155,"#fff",22);
        }

        if(sec.hp<=0){
          sec.defeated=true;
          s.stats.best=Math.max(s.stats.best,Math.floor(s.crowd));
          s.stats.bestDist=Math.max(s.stats.bestDist,s.distance);
          addFloat("BOSS DEFEATED!",ROAD_CX,PLAYER_Y-180,"#ffcc00",40);
          pfx(ROAD_CX,PLAYER_Y-100,150,"coin");
          doFlash(255,220,0,0.5);
          s.shake=22; s.bossAlert=0;
          rerender();
          setTimeout(()=>{if(gs.current.phase==="playing"&&sec.defeated){/* keep going */}},100);
        }
        if(s.crowd<1){s.crowd=0;s.phase="failed";rerender();}
      }
    }

    /* update stats */
    s.stats.best=Math.max(s.stats.best,Math.floor(s.crowd));
    s.stats.bestDist=Math.max(s.stats.bestDist,s.distance);
    if(s.crowd<1){s.crowd=0;s.phase="failed";rerender();}
  };

  /* ════════════════════════════════════════════════
     DRAW
     ════════════════════════════════════════════════ */
  const draw=(ctx,now)=>{
    const s=gs.current;
    ctx.clearRect(0,0,CW,CH);
    const shX=s.shake?rand(-s.shake,s.shake):0;
    const shY=s.shake?rand(-s.shake*.5,s.shake*.5):0;
    ctx.save(); ctx.translate(shX,shY);

    drawBg(ctx,now);
    drawRoad(ctx,now);
    drawSplats(ctx);
    drawObjects(ctx,now);
    drawPlayerCrowd(ctx,now);
    drawPopBlobs(ctx);
    drawFx(ctx);
    drawHUD(ctx,now);

    ctx.restore();

    if(s.flash.a>0.01){
      ctx.fillStyle=`rgba(${s.flash.r},${s.flash.g},${s.flash.b},${s.flash.a.toFixed(3)})`;
      ctx.fillRect(0,0,CW,CH);
    }
    drawOverlay(ctx,now);
    drawWaveAnnounce(ctx,now);
  };

  /* ── Background + scrolling side pillars ───────── */
  const drawBg=(ctx,now)=>{
    const s=gs.current;
    // Sky
    const sky=ctx.createLinearGradient(0,0,0,HORIZON_Y+90);
    sky.addColorStop(0,"#45c8e8");
    sky.addColorStop(0.65,"#62d8f2");
    sky.addColorStop(1,"#88e8f8");
    ctx.fillStyle=sky; ctx.fillRect(0,0,CW,HORIZON_Y+90);

    // Fill area below horizon that isn't road
    ctx.fillStyle="#b8e8f0";
    ctx.fillRect(0,HORIZON_Y,CW,CH-HORIZON_Y);

    // Scrolling side pillars — world-space objects
    const PILLAR_TILE = 60 * 320; // total span of pillar array
    const tileOffset = Math.floor(s.worldY / PILLAR_TILE) * PILLAR_TILE;
    for(const p of PILLARS){
      // Try current tile and next tile so there's no pop
      for(const offset of [tileOffset, tileOffset + PILLAR_TILE]) {
      const dist=(p.worldY+offset)-s.worldY;
      if(dist>MAX_VIS||dist<-50) continue;
      const sy=distToScreenY(dist);
      const sc=pScale(sy);
      const sx=worldXToSX(p.worldX,sy);
      const pw=p.width*sc;
      const ph=p.height*sc;

      // Only draw if in the side zone (outside road)
      if(p.worldX<0 && sx>ROAD_BOT_L-10) continue;
      if(p.worldX>0 && sx<ROAD_BOT_R+10) continue;

      ctx.save();
      // Shadow
      ctx.fillStyle="rgba(30,120,160,0.22)";
      ctx.fillRect(sx-pw/2+2,sy-ph+2,pw,ph);

      // Pillar face
      const h=p.hue;
      const colGrad=ctx.createLinearGradient(sx-pw/2,sy,sx+pw/2,sy);
      colGrad.addColorStop(0,`hsl(${h},65%,58%)`);
      colGrad.addColorStop(0.4,`hsl(${h},65%,70%)`);
      colGrad.addColorStop(1,`hsl(${h},65%,52%)`);
      ctx.fillStyle=colGrad;
      rr(ctx,sx-pw/2,sy-ph,pw,ph,4*sc); ctx.fill();

      // Top cap highlight
      ctx.fillStyle=`hsl(${h},65%,80%)`;
      ctx.fillRect(sx-pw/2-2*sc,sy-ph,pw+4*sc,7*sc);

      ctx.restore();
      } // end offset loop
    }
  };

  /* ── Road ───────────────────────────────────────── */
  const drawRoad=(ctx,now)=>{
    const s=gs.current;

    // Fire tint if on fire
    const fireTint = s.onFire ? Math.sin(now*.012)*0.06+0.06 : 0;

    const roadGrad=ctx.createLinearGradient(0,HORIZON_Y,0,CH);
    roadGrad.addColorStop(0,`hsl(${220+fireTint*20},${15+fireTint*30}%,93%)`);
    roadGrad.addColorStop(0.5,`hsl(${220+fireTint*20},${12+fireTint*25}%,90%)`);
    roadGrad.addColorStop(1,`hsl(${220+fireTint*20},${10+fireTint*20}%,86%)`);
    ctx.fillStyle=roadGrad;
    ctx.beginPath();
    ctx.moveTo(ROAD_TOP_L,HORIZON_Y); ctx.lineTo(ROAD_TOP_R,HORIZON_Y);
    ctx.lineTo(ROAD_BOT_R,CH);       ctx.lineTo(ROAD_BOT_L,CH);
    ctx.closePath(); ctx.fill();

    // Edges
    ctx.strokeStyle="rgba(120,140,200,0.55)"; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.moveTo(ROAD_TOP_L,HORIZON_Y); ctx.lineTo(ROAD_BOT_L,CH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ROAD_TOP_R,HORIZON_Y); ctx.lineTo(ROAD_BOT_R,CH); ctx.stroke();

    // Centre dashes — scroll with world
    ctx.strokeStyle="rgba(160,175,220,0.55)";
    for(let i=0;i<24;i++){
      const raw=((i/24)+(s.worldY*0.0042)%1)%1;
      if(raw>0.94) continue;
      const y1=HORIZON_Y+(CH-HORIZON_Y)*raw;
      const y2=HORIZON_Y+(CH-HORIZON_Y)*Math.min(raw+0.028,1);
      ctx.lineWidth=1.5+raw*3.5;
      ctx.beginPath(); ctx.moveTo(ROAD_CX,y1); ctx.lineTo(ROAD_CX,y2); ctx.stroke();
    }

    // Fire trail on road
    if(s.onFire){
      const fireAlpha=Math.min(1,s.fireTimer/3.5)*0.35;
      const fireGrad=ctx.createLinearGradient(ROAD_CX-80,PLAYER_Y-80,ROAD_CX+80,PLAYER_Y+40);
      fireGrad.addColorStop(0,"rgba(255,180,0,0)");
      fireGrad.addColorStop(0.4,`rgba(255,120,0,${fireAlpha})`);
      fireGrad.addColorStop(0.8,`rgba(255,60,0,${fireAlpha*0.7})`);
      fireGrad.addColorStop(1,"rgba(255,0,0,0)");
      ctx.fillStyle=fireGrad;
      ctx.beginPath(); ctx.ellipse(ROAD_CX,PLAYER_Y,80,50,0,0,Math.PI*2); ctx.fill();
    }
  };

  /* ── Splats ─────────────────────────────────────── */
  const drawSplats=(ctx)=>{
    const s=gs.current;
    ctx.save();
    for(const sp of s.splats){
      const dist=sp.worldY-s.worldY;
      if(dist>1900||dist<-60) continue;
      const sy=distToScreenY(dist);
      const sc=pScale(sy);
      const sx=worldXToSX(sp.worldX,sy);
      ctx.globalAlpha=Math.max(0,Math.min(0.65,(dist+400)/400));
      ctx.fillStyle=sp.c;
      ctx.beginPath(); ctx.ellipse(sx,sy,sp.r*sc*1.5,sp.r*sc*0.5,0,0,Math.PI*2); ctx.fill();
      // splat dots
      for(let i=0;i<5;i++){
        const a=(i/5)*Math.PI*2;
        ctx.beginPath(); ctx.arc(sx+Math.cos(a)*sp.r*sc*1.8,sy+Math.sin(a)*sp.r*sc*0.6,sp.r*sc*.4,0,Math.PI*2); ctx.fill();
      }
    }
    ctx.restore();
  };

  /* ── Level objects ──────────────────────────────── */
  const drawObjects=(ctx,now)=>{
    const s=gs.current;
    const vis=[...s.levels].filter(sec=>{
      const d=sec.worldY-s.worldY;
      return d>-130&&d<MAX_VIS;
    }).sort((a,b)=>b.worldY-a.worldY);

    for(const sec of vis){
      const dist=sec.worldY-s.worldY;
      const sy=distToScreenY(dist);
      const sc=pScale(sy);
      if(sec.kind==="gates")   drawGates(ctx,sec,sy,sc);
      if(sec.kind==="enemies"&&!sec.defeated) drawEnemies(ctx,sec,sy,sc,now);
      if(sec.kind==="blades")  drawBlades(ctx,sec,sy,sc,now);
      if(sec.kind==="spikes")  drawSpikes(ctx,sec,sy,sc);
      if(sec.kind==="gauntlet") drawGauntlet(ctx,sec,sy,sc);
      if(sec.kind==="boss")    drawBoss(ctx,sec,sy,sc,now);
    }
  };

  /* Gates */
  const drawGates=(ctx,sec,sy,sc)=>{
    const postH=220*sc;
    const barH=52*sc;
    sec.gates.forEach(g=>{
      const positive=isGoodGate(g);
      const gx=worldXToSX(g.side*155,sy);
      const gw=168*sc;
      ctx.save(); ctx.globalAlpha=g.triggered?0.28:1;

      // Beam glow from sky
      const beam=ctx.createLinearGradient(gx,sy-postH,gx,sy+barH*.5);
      beam.addColorStop(0,positive?"rgba(0,240,120,0)":"rgba(255,50,80,0)");
      beam.addColorStop(0.45,positive?"rgba(0,240,120,0.18)":"rgba(255,50,80,0.18)");
      beam.addColorStop(1,positive?"rgba(0,240,120,0)":"rgba(255,50,80,0)");
      ctx.fillStyle=beam; ctx.fillRect(gx-gw/2,sy-postH*1.1,gw,postH*1.6);

      // Posts
      ctx.fillStyle="#c0c8dc";
      const pw=12*sc;
      ctx.fillRect(gx-gw/2-pw/2, sy-postH, pw, postH+barH*.5);
      ctx.fillRect(gx+gw/2-pw/2, sy-postH, pw, postH+barH*.5);
      ctx.fillStyle="#d8e0f0";
      ctx.fillRect(gx-gw/2-pw*1.1,sy-postH,pw*2.2,7*sc);
      ctx.fillRect(gx+gw/2-pw*1.1,sy-postH,pw*2.2,7*sc);

      // Panel
      const pg=ctx.createLinearGradient(gx-gw/2,sy-barH/2,gx+gw/2,sy+barH/2);
      if(positive){pg.addColorStop(0,"#1edd80");pg.addColorStop(1,"#0da858");}
      else{pg.addColorStop(0,"#ff3c58");pg.addColorStop(1,"#b80e22");}
      ctx.fillStyle=pg; rr(ctx,gx-gw/2,sy-barH/2,gw,barH,10*sc); ctx.fill();

      // Glow border
      ctx.strokeStyle=positive?"rgba(100,255,160,0.9)":"rgba(255,120,140,0.9)";
      ctx.lineWidth=Math.max(1,3.5*sc);
      ctx.shadowColor=positive?"#00ff88":"#ff3355"; ctx.shadowBlur=12;
      rr(ctx,gx-gw/2,sy-barH/2,gw,barH,10*sc); ctx.stroke();
      ctx.shadowBlur=0;

      // Text
      const fs=Math.max(11,42*sc);
      ctx.font=`900 ${fs}px Arial`;
      ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.strokeStyle="rgba(0,0,0,.4)"; ctx.lineWidth=Math.max(1,6*sc);
      ctx.strokeText(fmtGate(g),gx,sy);
      ctx.fillStyle="#fff"; ctx.fillText(fmtGate(g),gx,sy);

      ctx.restore();
    });
  };

  /* Enemies */
  const drawEnemies=(ctx,sec,sy,sc,now)=>{
    const positions=formation(Math.min(sec.count,60));
    const cx2=worldXToSX(sec.x,sy);
    const phase=now*.005;
    // Draw back to front
    for(let i=positions.length-1;i>=0;i--){
      const p=positions[i];
      const bd=(sec.worldY+p.z)-gs.current.worldY;
      const bsy=distToScreenY(bd);
      const bsc=pScale(bsy);
      const r=Math.max(2,21*bsc*p.s);
      const bx=worldXToSX(sec.x+p.x,bsy);
      const bob=Math.sin(phase+i*.6)*2*bsc;
      // panic if we have way more than them — they spread out
      const panicX=sec.count<gs.current.crowd*.3?Math.sin(now*.008+i)*15*bsc:0;
      drawBlob(ctx,bx+panicX,bsy+bob,r,0,90,52,i<4);
    }
    if(sec.count>0){
      const fs=Math.max(10,26*sc);
      ctx.save(); ctx.font=`900 ${fs}px Arial`; ctx.textAlign="center";
      ctx.strokeStyle="rgba(0,0,0,.55)"; ctx.lineWidth=4; ctx.fillStyle="#ff1133";
      const label=sec.count.toString();
      ctx.strokeText(label,cx2,sy-35*sc); ctx.fillText(label,cx2,sy-35*sc);
      ctx.restore();
    }
  };

  /* Spinning blades */
  const drawBlades=(ctx,sec,sy,sc,now)=>{
    sec.blades.forEach(b=>{
      if(b.hit) return;
      const bxOff=b.xOff+Math.sin(now/270+b.phase)*72;
      const bx=worldXToSX(bxOff,sy);
      const r=Math.max(8,48*sc);
      const angle=now/105+b.phase;
      ctx.save(); ctx.translate(bx,sy); ctx.rotate(angle);
      ctx.shadowColor="rgba(220,20,20,0.7)"; ctx.shadowBlur=14;
      for(let i=0;i<6;i++){
        ctx.rotate(Math.PI/3);
        const bg=ctx.createLinearGradient(0,0,r,0);
        bg.addColorStop(0,"#ff3344"); bg.addColorStop(0.72,"#cc1020"); bg.addColorStop(1,"rgba(200,15,25,0)");
        ctx.fillStyle=bg;
        ctx.beginPath(); ctx.moveTo(0,-r*.13); ctx.lineTo(r*.76,-r*.05); ctx.lineTo(r,0); ctx.lineTo(r*.76,r*.05); ctx.lineTo(0,r*.13); ctx.closePath(); ctx.fill();
      }
      ctx.shadowBlur=0;
      ctx.fillStyle="#7a0010"; ctx.beginPath(); ctx.arc(0,0,r*.22,0,Math.PI*2); ctx.fill();
      ctx.fillStyle="#cc1020"; ctx.beginPath(); ctx.arc(0,0,r*.12,0,Math.PI*2); ctx.fill();
      ctx.restore();
    });
  };

  /* Spikes */
  const drawSpikes=(ctx,sec,sy,sc)=>{
    sec.spikes.forEach(sp=>{
      if(sp.hit) return;
      const sx=worldXToSX(sp.xOff,sy);
      const w=50*sc, h=75*sc;
      ctx.save();
      ctx.fillStyle="rgba(0,0,0,.15)";
      ctx.beginPath(); ctx.ellipse(sx,sy+h*.08,w*.6,7*sc,0,0,Math.PI*2); ctx.fill();
      const tg=ctx.createLinearGradient(sx-w/2,sy-h/2,sx+w/2,sy+h/2);
      tg.addColorStop(0,"#ff4455"); tg.addColorStop(1,"#cc1022");
      ctx.fillStyle=tg;
      ctx.beginPath(); ctx.moveTo(sx,sy-h/2); ctx.lineTo(sx+w/2,sy+h/2); ctx.lineTo(sx-w/2,sy+h/2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle="rgba(255,160,170,.5)"; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(sx,sy-h/2); ctx.lineTo(sx-w/2,sy+h/2); ctx.stroke();
      ctx.restore();
    });
  };

  /* Gauntlet — two spike walls */
  const drawGauntlet=(ctx,sec,sy,sc)=>{
    // Two walls with a gap at sec.safeX
    const spread=sec.spread||2;
    for(let side=-1;side<=1;side+=2){
      for(let k=0;k<spread;k++){
        const xOff=side*(80+k*60);
        if(Math.abs(xOff-sec.safeX)<85) continue;
        const sx=worldXToSX(xOff,sy);
        const w=50*sc, h=80*sc;
        ctx.save();
        const tg=ctx.createLinearGradient(sx-w/2,sy-h/2,sx+w/2,sy+h/2);
        tg.addColorStop(0,"#ff3344"); tg.addColorStop(1,"#aa0818");
        ctx.fillStyle=tg;
        ctx.beginPath(); ctx.moveTo(sx,sy-h/2); ctx.lineTo(sx+w/2,sy+h/2); ctx.lineTo(sx-w/2,sy+h/2); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    // "safe" arrow hint
    const safeX=worldXToSX(sec.safeX,sy);
    ctx.save(); ctx.globalAlpha=0.55;
    ctx.fillStyle="#22ee77";
    ctx.font=`900 ${Math.max(10,22*sc)}px Arial`; ctx.textAlign="center";
    ctx.fillText("↓",safeX,sy-85*sc);
    ctx.restore();
  };

  /* Boss */
  const drawBoss=(ctx,sec,sy,sc,now)=>{
    const x=worldXToSX(0,sy);
    if(sec.defeated){
      ctx.save(); ctx.globalAlpha=.5;
      ctx.font=`900 ${Math.max(16,44*sc)}px Arial`; ctx.textAlign="center";
      ctx.fillStyle="#ffcc00"; ctx.strokeStyle="rgba(0,0,0,.5)"; ctx.lineWidth=7;
      ctx.strokeText("DESTROYED!",x,sy-12*sc); ctx.fillText("DESTROYED!",x,sy-12*sc);
      ctx.restore(); return;
    }
    const w=295*sc, h=205*sc;
    const pulse=Math.sin(now*.004)*4*sc;
    const hpPct=clamp(sec.hp/sec.maxHp,0,1);
    // rage shake when low
    const rage=hpPct<0.3?Math.sin(now*.025)*(1-hpPct)*6*sc:0;

    ctx.save(); ctx.translate(rage,0);
    ctx.fillStyle="rgba(0,0,0,.38)";
    ctx.beginPath(); ctx.ellipse(x,sy+h*.56,w*.55,20*sc,0,0,Math.PI*2); ctx.fill();

    const bg=ctx.createLinearGradient(x-w/2,sy-h/2,x+w/2,sy+h/2);
    bg.addColorStop(0,"#3a085a"); bg.addColorStop(.5,"#6a1290"); bg.addColorStop(1,"#250330");
    ctx.fillStyle=bg; rr(ctx,x-w/2,sy-h*.55,w,h,28*sc); ctx.fill();

    ctx.strokeStyle=`rgba(190,0,255,${.7+Math.sin(now*.008)*.22})`;
    ctx.lineWidth=Math.max(1,4*sc); ctx.shadowColor="#cc00ff"; ctx.shadowBlur=22;
    rr(ctx,x-w/2,sy-h*.55,w,h,28*sc); ctx.stroke(); ctx.shadowBlur=0;

    // Eyes glow red when low hp
    const eyeH=hpPct<0.4?0:0;
    const eyeY=sy-h*.26; const eyeR=17*sc;
    [x-w*.22,x+w*.22].forEach(ex=>{
      const eg=ctx.createRadialGradient(ex,eyeY,0,ex,eyeY,eyeR);
      const eyeColor=hpPct<0.3?"#ff4400":"#ff2040";
      eg.addColorStop(0,"#fff"); eg.addColorStop(.3,eyeColor); eg.addColorStop(1,"#800020");
      ctx.fillStyle=eg; ctx.shadowColor=eyeColor; ctx.shadowBlur=hpPct<0.3?28:16;
      ctx.beginPath(); ctx.arc(ex,eyeY+pulse,eyeR,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
    });
    ctx.strokeStyle="#ff2040"; ctx.lineWidth=Math.max(1,3.5*sc);
    ctx.beginPath(); ctx.arc(x,sy+h*.04,w*.18,.1,Math.PI-.1); ctx.stroke();

    // HP bar
    const bw=290*sc, bh=22*sc, bx=x-bw/2, by=sy-h*.7;
    ctx.fillStyle="rgba(0,0,0,.55)"; rr(ctx,bx,by,bw,bh,bh/2); ctx.fill();
    const hpg=ctx.createLinearGradient(bx,0,bx+bw,0);
    hpg.addColorStop(0,hpPct<0.3?"#ff3300":"#ff1040");
    hpg.addColorStop(.55,hpPct<0.3?"#ff6600":"#ff6600");
    hpg.addColorStop(1,"#ffcc00");
    ctx.fillStyle=hpg; rr(ctx,bx+2,by+2,(bw-4)*hpPct,bh-4,bh/2); ctx.fill();
    ctx.font=`900 ${Math.max(9,20*sc)}px Arial`; ctx.textAlign="center";
    ctx.fillStyle="#fff"; ctx.strokeStyle="rgba(0,0,0,.55)"; ctx.lineWidth=4;
    ctx.strokeText("⚡ FINAL BOSS ⚡",x,by-9*sc); ctx.fillText("⚡ FINAL BOSS ⚡",x,by-9*sc);
    ctx.restore();
  };

  /* ── Player crowd ───────────────────────────────── */
  const drawPlayerCrowd=(ctx,now)=>{
    const s=gs.current;
    const count=Math.max(1,Math.ceil(s.crowd));
    const positions=formation(count);

    // Ground shadow
    ctx.save(); ctx.fillStyle="rgba(0,0,0,.2)";
    ctx.beginPath(); ctx.ellipse(s.playerX,PLAYER_Y+52,90,18,0,0,Math.PI*2); ctx.fill(); ctx.restore();

    // Fire particles around crowd
    if(s.onFire){
      const fa=Math.min(1,s.fireTimer/3.5);
      for(let i=0;i<3;i++){
        const a=now*.006+i*2.1;
        const fx2=s.playerX+Math.cos(a)*45;
        const fy2=PLAYER_Y-40+Math.sin(a*.7)*15;
        ctx.save(); ctx.globalAlpha=fa*.7;
        ctx.fillStyle=`hsl(${30+i*12},100%,${50+i*8}%)`;
        ctx.shadowColor="#ff6600"; ctx.shadowBlur=12;
        ctx.beginPath(); ctx.arc(fx2,fy2,6+i*2,0,Math.PI*2); ctx.fill();
        ctx.restore();
      }
    }

    // Blobs back to front
    for(let i=positions.length-1;i>=0;i--){
      const p=positions[i];
      const bd=-(p.z*0.55);
      const bsy=distToScreenY(bd);
      const bsc=pScale(bsy);
      const r=Math.max(2,21*bsc*p.s);
      const bx=s.playerX+p.x*bsc;
      const bob=Math.sin(now*.012+i*.7)*2.5*bsc;
      drawBlob(ctx,bx,bsy+bob,r,215,90,55,i<3);
    }

    // Count badge
    ctx.save();
    const txt=count.toString();
    const bY=PLAYER_Y-96;
    ctx.font="900 36px Arial";
    const tw=ctx.measureText(txt).width+28;
    // fire gradient badge when on fire
    if(s.onFire){
      const bg2=ctx.createLinearGradient(s.playerX-tw/2,bY-22,s.playerX+tw/2,bY+22);
      bg2.addColorStop(0,"rgba(255,80,0,.92)"); bg2.addColorStop(1,"rgba(200,40,0,.92)");
      ctx.fillStyle=bg2;
    } else {
      ctx.fillStyle="rgba(28,55,130,.92)";
    }
    rr(ctx,s.playerX-tw/2,bY-23,tw,46,23); ctx.fill();
    ctx.strokeStyle=s.onFire?"rgba(255,180,0,.85)":"rgba(100,190,255,.8)";
    ctx.lineWidth=2;
    rr(ctx,s.playerX-tw/2,bY-23,tw,46,23); ctx.stroke();
    ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillStyle="#fff";
    ctx.fillText(txt,s.playerX,bY+1);
    ctx.restore();
  };

  /* ── Pop-in blobs (crowd grow animation) ───────── */
  const drawPopBlobs=(ctx)=>{
    const s=gs.current;
    for(const b of s.popBlobs){
      const a=clamp(b.life/b.ml,0,1);
      ctx.save(); ctx.globalAlpha=a;
      drawBlob(ctx,b.x,b.y,18*b.scale,b.h,b.sat,b.lit,false);
      ctx.restore();
    }
  };

  /* ── Particles + floats ─────────────────────────── */
  const drawFx=(ctx)=>{
    const s=gs.current;
    s.particles.forEach(p=>{
      const a=clamp(p.life/p.ml,0,1);
      const c=p.type==="coin"?"#ffcc00":p.type==="good"?"#22ee77":p.type==="bad"?"#ff4466":"#fff";
      ctx.save(); ctx.globalAlpha=a;
      ctx.shadowColor=c; ctx.shadowBlur=6;
      ctx.fillStyle=c; ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,Math.PI*2); ctx.fill();
      ctx.restore();
    });
    s.floats.forEach(f=>{
      const a=clamp(f.life/f.ml,0,1);
      ctx.save(); ctx.globalAlpha=a;
      ctx.font=`900 ${f.size}px Arial`; ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.lineWidth=6; ctx.strokeStyle="rgba(0,0,0,.5)"; ctx.strokeText(f.text,f.x,f.y);
      ctx.fillStyle=f.color; ctx.shadowColor=f.color; ctx.shadowBlur=10;
      ctx.fillText(f.text,f.x,f.y);
      ctx.restore();
    });
  };

  /* ── HUD ────────────────────────────────────────── */
  const drawHUD=(ctx,now)=>{
    const s=gs.current;
    if(s.phase!=="playing") return;
    const bg=ctx.createLinearGradient(0,0,0,72);
    bg.addColorStop(0,"rgba(0,0,0,.5)"); bg.addColorStop(1,"rgba(0,0,0,0)");
    ctx.fillStyle=bg; ctx.fillRect(0,0,CW,72);

    ctx.save();
    // left: distance
    ctx.font="900 21px Arial"; ctx.textAlign="left"; ctx.fillStyle="#fff";
    ctx.fillText(`${s.distance}m`,20,36);
    ctx.font="700 13px Arial"; ctx.fillStyle="rgba(255,255,255,.6)";
    ctx.fillText(`WAVE ${s.wave}`,20,54);

    // centre: streak
    if(s.streak>=2||s.onFire){
      ctx.textAlign="center";
      ctx.font=`900 ${s.onFire?22:18}px Arial`;
      ctx.fillStyle=s.onFire?"#ff8800":"#ffdd00";
      ctx.shadowColor=s.onFire?"#ff4400":"#ffaa00"; ctx.shadowBlur=12;
      ctx.fillText(s.onFire?`🔥 ON FIRE x${s.streak}`:`⚡ STREAK x${s.streak}`,ROAD_CX,36);
      ctx.shadowBlur=0;
    }

    // right: crowd
    ctx.textAlign="right"; ctx.font="900 21px Arial"; ctx.fillStyle="#55ccff";
    ctx.fillText(`👥 ${Math.ceil(s.crowd)}`,CW-20,36);
    ctx.font="700 13px Arial"; ctx.fillStyle="rgba(255,255,255,.6)";
    ctx.fillText("BEST "+s.stats.best,CW-20,54);
    ctx.restore();
  };

  /* ── Wave announce ──────────────────────────────── */
  const drawWaveAnnounce=(ctx,now)=>{
    const s=gs.current;
    if(s.waveAnnounce<=0) return;
    const t=s.waveAnnounce/2.8;
    const alpha=Math.min(1,t*3)*Math.min(1,(s.waveAnnounce/2.8)*3);
    const scale=1+(1-t)*0.4;
    ctx.save();
    ctx.globalAlpha=clamp(alpha,0,1);
    ctx.translate(ROAD_CX,CH/2);
    ctx.scale(scale,scale);
    ctx.translate(-ROAD_CX,-CH/2);
    ctx.font="900 62px Arial"; ctx.textAlign="center";
    ctx.strokeStyle="rgba(0,0,0,.6)"; ctx.lineWidth=10;
    ctx.strokeText(s.waveAnnounceText,ROAD_CX,CH/2);
    const wg=ctx.createLinearGradient(ROAD_CX-180,0,ROAD_CX+180,0);
    wg.addColorStop(0,"#00d4ff"); wg.addColorStop(.5,"#ffffff"); wg.addColorStop(1,"#ff00aa");
    ctx.fillStyle=wg;
    ctx.fillText(s.waveAnnounceText,ROAD_CX,CH/2);
    ctx.restore();
  };

  /* ── Overlay ────────────────────────────────────── */
  const drawOverlay=(ctx,now)=>{
    const s=gs.current;
    if(s.phase==="playing") return;
    ctx.fillStyle="rgba(0,0,0,.6)"; ctx.fillRect(0,0,CW,CH);
    const pw=430,ph=370,px=(CW-pw)/2,py=(CH-ph)/2;
    ctx.shadowColor="rgba(0,180,255,.4)"; ctx.shadowBlur=40;
    const pan=ctx.createLinearGradient(px,py,px,py+ph);
    pan.addColorStop(0,"rgba(14,25,58,.98)"); pan.addColorStop(1,"rgba(6,12,32,.98)");
    ctx.fillStyle=pan; rr(ctx,px,py,pw,ph,28); ctx.fill();
    ctx.shadowBlur=0; ctx.strokeStyle="rgba(80,150,255,.38)"; ctx.lineWidth=1.5;
    rr(ctx,px,py,pw,ph,28); ctx.stroke();
    const cx2=CW/2; ctx.textAlign="center";

    if(s.phase==="menu"){
      const tg=ctx.createLinearGradient(cx2-170,0,cx2+170,0);
      tg.addColorStop(0,"#00d4ff"); tg.addColorStop(.5,"#aa00ff"); tg.addColorStop(1,"#ff2266");
      ctx.font="900 60px Arial"; ctx.fillStyle=tg;
      ctx.shadowColor="rgba(120,0,255,.55)"; ctx.shadowBlur=20;
      ctx.fillText("MOB RUSH",cx2,py+84); ctx.shadowBlur=0;
      ctx.font="700 16px Arial"; ctx.fillStyle="rgba(180,220,255,.8)";
      ctx.fillText("Swipe · Multiply · Smash Enemies",cx2,py+120);
      ctx.fillText("Infinite waves · Random every run",cx2,py+143);
      ["Hit ×green gates — multiply your mob","Avoid red gates · blades · spikes","ON FIRE streak = bonus damage!"].forEach((t,i)=>{
        ctx.font="600 13px Arial"; ctx.fillStyle=`rgba(180,220,255,${.7-i*.08})`;
        ctx.fillText(`${i+1}. ${t}`,cx2,py+185+i*24);
      });
      drawBtn(ctx,cx2,py+298,200,52,"#0077ff","#00d4ff","▶  START");
    }
    if(s.phase==="failed"){
      const tg=ctx.createLinearGradient(cx2-140,0,cx2+140,0);
      tg.addColorStop(0,"#ff1040"); tg.addColorStop(1,"#ff7700");
      ctx.font="900 48px Arial"; ctx.fillStyle=tg;
      ctx.shadowColor="#ff1040"; ctx.shadowBlur=18; ctx.fillText("MOB WIPED 💀",cx2,py+82); ctx.shadowBlur=0;
      ctx.font="700 22px Arial"; ctx.fillStyle="rgba(200,230,255,.88)";
      ctx.fillText(`Distance: ${s.distance}m`,cx2,py+130);
      ctx.fillText(`Crowd: ${Math.ceil(s.crowd)} / Best: ${s.stats.best}`,cx2,py+158);
      ctx.fillText(`Best dist: ${s.stats.bestDist}m`,cx2,py+185);
      drawBtn(ctx,cx2,py+280,200,52,"#cc1040","#ff2255","↺  RETRY");
    }
  };

  function drawBtn(ctx,cx2,cy,w,h,c1,c2,lbl){
    const x=cx2-w/2, y=cy-h/2;
    ctx.save();
    const g=ctx.createLinearGradient(x,y,x,y+h);
    g.addColorStop(0,c2); g.addColorStop(1,c1);
    ctx.shadowColor=c2; ctx.shadowBlur=20;
    ctx.fillStyle=g; rr(ctx,x,y,w,h,h/2); ctx.fill();
    ctx.shadowBlur=0;
    ctx.fillStyle="#fff"; ctx.font="900 20px Arial";
    ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText(lbl,cx2,cy);
    ctx.restore();
  }

  const handleClick=(e)=>{
    const s=gs.current; if(s.phase==="playing") return;
    const rect=canvasRef.current.getBoundingClientRect();
    const x=((e.clientX-rect.left)/rect.width)*CW;
    const y=((e.clientY-rect.top)/rect.height)*CH;
    if(Math.abs(x-CW/2)<105&&Math.abs(y-(CH/2+98))<30) startRun();
  };

  const s=gs.current;

  return (
    <div style={ST.page}>
      <div style={ST.shell}>
        <div style={ST.header}>
          <div>
            <h1 style={ST.title}>🏃 Mob Rush</h1>
            <p style={ST.sub}>Infinite · Random · Swipe to steer · Build your mob</p>
          </div>
          <div style={ST.hBtns}>
            <button style={{...ST.btn,...ST.btnP}} onClick={startRun}>▶ New Run</button>
          </div>
        </div>

        <div style={ST.main}>
          <div style={ST.cWrap}>
            <canvas ref={canvasRef} width={CW} height={CH} style={ST.canvas} onClick={handleClick}/>
          </div>

          <aside style={ST.panel}>
            <div style={ST.sCard}>
              <span style={ST.sLbl}>🏆 Best Crowd</span>
              <strong style={ST.sBig}>{s.stats.best}</strong>
            </div>
            <div style={ST.sCard}>
              <span style={ST.sLbl}>📏 Best Distance</span>
              <strong style={ST.sBig}>{s.stats.bestDist}m</strong>
            </div>

            <div style={ST.infoBox}>
              <h2 style={ST.h2}>How to Play</h2>
              <p style={ST.hp}><b style={{color:"#22ee77"}}>Green gates</b> grow your mob</p>
              <p style={ST.hp}><b style={{color:"#ff4466"}}>Red gates</b> shrink it</p>
              <p style={ST.hp}>Hit 3+ green in a row = <b style={{color:"#ff8800"}}>🔥 ON FIRE!</b></p>
              <p style={ST.hp}>Dodge blades, spikes, gauntlets</p>
              <p style={ST.hp}>Boss every 6 waves — survive!</p>
              <p style={ST.hp}>Game speeds up as waves increase</p>
            </div>

            <div style={ST.infoBox}>
              <h2 style={ST.h2}>Controls</h2>
              <p style={ST.hp}>🖱 Drag / swipe to steer</p>
              <p style={ST.hp}>⌨ A / D · ← → arrow keys</p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

const ST = {
  page:{minHeight:"100vh",width:"100%",padding:22,boxSizing:"border-box",
    background:"linear-gradient(135deg,#050a1a 0%,#0b1528 50%,#080f20 100%)",
    color:"#e0eaff",fontFamily:"'Segoe UI',Arial,sans-serif"},
  shell:{maxWidth:1300,margin:"0 auto"},
  header:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:18,marginBottom:16},
  title:{margin:0,fontSize:42,fontWeight:950,letterSpacing:"-1.8px",
    background:"linear-gradient(135deg,#00d4ff,#aa00ff,#ff2266)",
    WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"},
  sub:{margin:"5px 0 0",color:"rgba(180,215,255,.7)",fontSize:14,fontWeight:700},
  hBtns:{display:"flex",gap:10},
  btn:{border:0,borderRadius:16,padding:"12px 22px",fontWeight:900,fontSize:14,cursor:"pointer"},
  btnP:{background:"linear-gradient(135deg,#0077ff,#00d4ff)",color:"#fff",boxShadow:"0 8px 24px rgba(0,120,255,.35)"},
  main:{display:"grid",gridTemplateColumns:"minmax(0,1fr) 280px",gap:18,alignItems:"start"},
  cWrap:{background:"rgba(0,0,0,.35)",border:"1px solid rgba(80,140,255,.22)",
    boxShadow:"0 22px 65px rgba(0,18,70,.6)",borderRadius:24,padding:10,overflow:"hidden"},
  canvas:{width:"100%",display:"block",borderRadius:16,touchAction:"none",cursor:"grab"},
  panel:{display:"flex",flexDirection:"column",gap:12},
  sCard:{background:"rgba(14,24,55,.92)",border:"1px solid rgba(80,140,255,.22)",
    borderRadius:20,padding:16,boxShadow:"0 12px 36px rgba(0,12,55,.4)"},
  sLbl:{display:"block",color:"rgba(180,215,255,.65)",fontSize:11,fontWeight:900,textTransform:"uppercase",letterSpacing:".6px"},
  sBig:{display:"block",marginTop:4,fontSize:38,fontWeight:950,color:"#ffd43b",lineHeight:1},
  infoBox:{background:"rgba(14,24,55,.92)",border:"1px solid rgba(80,140,255,.22)",
    borderRadius:20,padding:16,boxShadow:"0 12px 36px rgba(0,12,55,.4)"},
  h2:{margin:"0 0 10px",color:"#fff",fontSize:17,fontWeight:950},
  hp:{margin:"7px 0 0",color:"rgba(180,215,255,.7)",fontWeight:700,fontSize:13,lineHeight:1.4},
};