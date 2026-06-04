import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import "../../styles/FurryObbyGame.css";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const PLAYER_HEIGHT   = 1.7;
const PLAYER_RADIUS   = 0.32;
const GRAVITY         = 24;
const WALK_SPEED      = 7.5;
const SPRINT_SPEED    = 11;
const JUMP_FORCE      = 9.2;
const AIR_CONTROL     = 0.40;
const GROUND_FRICTION = 14;
const MOUSE_SENS      = 0.0021;
const WORLD_FLOOR_Y   = -30;
const SUBSTEPS        = 4;   // physics sub-steps — kills tunnelling
const TOTAL_SECTIONS  = 20;

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const randFrom = arr => arr[Math.floor(Math.random() * arr.length)];
const PAL = ["#ff9de6","#9ee7ff","#b8ff9e","#ffe18f","#d6a3ff","#ffb07c","#ff9999","#99ffee"];

// ─── DISTANCE POINT→SEGMENT 2-D ──────────────────────────────────────────────
function distPtSeg2D(px, pz, ax, az, bx, bz) {
  const abx=bx-ax, abz=bz-az, apx=px-ax, apz=pz-az;
  const lenSq = abx*abx + abz*abz;
  if (lenSq===0) return Math.hypot(px-ax, pz-az);
  const t = clamp((apx*abx+apz*abz)/lenSq, 0, 1);
  return Math.hypot(px-(ax+abx*t), pz-(az+abz*t));
}

// ─── CANVAS TEXT TEXTURE ─────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
}

function makeSignTexture(text) {
  const W=1024, H=256;
  const cv=document.createElement("canvas"); cv.width=W; cv.height=H;
  const ctx=cv.getContext("2d");
  const g=ctx.createLinearGradient(0,0,W,H);
  g.addColorStop(0,"rgba(255,160,230,0.95)");
  g.addColorStop(1,"rgba(180,90,220,0.92)");
  ctx.fillStyle=g;
  roundRect(ctx,6,6,W-12,H-12,26); ctx.fill();
  ctx.strokeStyle="rgba(255,255,255,0.7)"; ctx.lineWidth=9;
  roundRect(ctx,6,6,W-12,H-12,26); ctx.stroke();
  // decorative paw
  ctx.font="52px serif"; ctx.fillStyle="rgba(255,255,255,0.18)";
  ctx.fillText("🐾",22,H-22); ctx.fillText("🐾",W-74,42);
  // main text
  const fs = text.length>22 ? 56 : text.length>16 ? 64 : 70;
  ctx.font=`900 ${fs}px 'Arial Black',Arial,sans-serif`;
  ctx.textAlign="center"; ctx.textBaseline="middle";
  ctx.strokeStyle="rgba(60,0,80,0.9)"; ctx.lineWidth=11;
  ctx.strokeText(text,W/2,H/2);
  ctx.fillStyle="#fff"; ctx.fillText(text,W/2,H/2);
  const t=new THREE.CanvasTexture(cv); t.needsUpdate=true;
  return t;
}

// ─── SIGN ────────────────────────────────────────────────────────────────────
// Signs face +Z by default (toward approaching player moving in -Z direction)
function makeSign(scene, text, [sx,sy,sz], [sw=5.5, sh=1.2]=[5.5,1.2]) {
  const mat=new THREE.MeshBasicMaterial({map:makeSignTexture(text),transparent:true,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(sw,sh),mat);
  mesh.position.set(sx,sy,sz);
  scene.add(mesh);
  const pole=new THREE.Mesh(
    new THREE.CylinderGeometry(0.07,0.07,sh*0.7+0.4,8),
    new THREE.MeshStandardMaterial({color:"#fff",roughness:0.5})
  );
  pole.position.set(sx,sy-sh/2-0.12,sz);
  scene.add(pole);
}

// ─── FURRY BITS ──────────────────────────────────────────────────────────────
function makeFursuitHead(parent, [hx,hy,hz], color="#ff9de6") {
  const g=new THREE.Group();
  const fur=new THREE.MeshStandardMaterial({color,roughness:0.9});
  const snoutM=new THREE.MeshStandardMaterial({color:"#fff8f0",roughness:0.85});
  g.add(Object.assign(new THREE.Mesh(new THREE.SphereGeometry(0.8,18,14),fur)));
  [[-0.46,0.72,0],[0.46,0.72,0]].forEach(([ex,ey,ez])=>{
    g.add(Object.assign(new THREE.Mesh(new THREE.ConeGeometry(0.28,0.55,10),fur),{position:{x:ex,y:ey,z:ez}}));
    const inner=new THREE.Mesh(new THREE.ConeGeometry(0.14,0.38,10),new THREE.MeshStandardMaterial({color:"#ff80c0",roughness:0.8}));
    inner.position.set(ex,ey,ez+0.04); g.add(inner);
  });
  const snout=new THREE.Mesh(new THREE.SphereGeometry(0.34,14,10),snoutM);
  snout.position.set(0,-0.12,0.68); snout.scale.y=0.7; g.add(snout);
  const nose=new THREE.Mesh(new THREE.SphereGeometry(0.1,10,8),new THREE.MeshStandardMaterial({color:"#222",roughness:0.4}));
  nose.position.set(0,0.02,0.99); g.add(nose);
  const eyeM=new THREE.MeshStandardMaterial({color:"#1a0a2e",roughness:0.3});
  [[-0.3,0.18,0.72],[0.3,0.18,0.72]].forEach(([ex,ey,ez])=>{
    const eye=new THREE.Mesh(new THREE.SphereGeometry(0.12,10,8),eyeM);
    eye.position.set(ex,ey,ez); g.add(eye);
    const shine=new THREE.Mesh(new THREE.SphereGeometry(0.05,8,6),new THREE.MeshBasicMaterial({color:"#fff"}));
    shine.position.set(ex+0.04,ey+0.04,ez+0.06); g.add(shine);
  });
  g.position.set(hx,hy,hz);
  parent.add(g);
  return g;
}

function makePawPrint(scene, cx, cy, cz, rot=0) {
  const g=new THREE.Group();
  const m=new THREE.MeshStandardMaterial({color:"#ff9de6",roughness:0.7});
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.55,0.55,0.08,18),m));
  [[-0.46,0,-0.46],[0,0,-0.63],[0.46,0,-0.46],[-0.26,0,0.46],[0.26,0,0.46]].forEach(([tx,ty,tz])=>{
    const t=new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.18,0.08,10),m);
    t.position.set(tx,ty,tz); g.add(t);
  });
  g.position.set(cx,cy,cz); g.rotation.y=rot;
  scene.add(g);
}

function makeTailSpinner(scene, hazards, {center,armLength=7,speed=1.6,level=1,color="#ff4fc3"}) {
  const g=new THREE.Group();
  g.position.set(center[0],center[1],center[2]);
  // pole
  g.add(Object.assign(new THREE.Mesh(
    new THREE.CylinderGeometry(0.2,0.2,2,12),
    new THREE.MeshStandardMaterial({color:"#fff",roughness:0.7})
  ),{position:{x:0,y:0.5,z:0}}));
  // fursuit head on top
  makeFursuitHead(g,[0,2.2,0],randFrom(["#ff9de6","#9ee7ff","#b8ff9e","#ffe18f","#d6a3ff"]));
  // arm (fluffy tail)
  const arm=new THREE.Mesh(
    new THREE.CylinderGeometry(0.24,0.12,armLength,14),
    new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:0.22,roughness:0.85})
  );
  arm.rotation.z=Math.PI/2; arm.position.y=1.15; g.add(arm);
  // fluffy tips
  [armLength/2,-armLength/2].forEach(tx=>{
    const tip=new THREE.Mesh(
      new THREE.SphereGeometry(0.6,14,10),
      new THREE.MeshStandardMaterial({color:"#fff",emissive:"#ffe8fa",emissiveIntensity:0.22,roughness:0.9})
    );
    tip.position.set(tx,1.15,0); g.add(tip);
  });
  g.userData={type:"spinner",level,armLength,speed,angle:0};
  scene.add(g); hazards.push(g);
  return g;
}

// ─── PLATFORM / HAZARD MAKERS ────────────────────────────────────────────────
function makeBox(scene, objects, {
  name="p",pos,size,color="#ff9de6",type="solid",level=1,
  emissive="#000",roughness=0.62,bounce=0,move=null,deco=false
}) {
  const mesh=new THREE.Mesh(
    new THREE.BoxGeometry(size[0],size[1],size[2]),
    new THREE.MeshStandardMaterial({color,emissive,roughness,metalness:0.04})
  );
  mesh.position.set(pos[0],pos[1],pos[2]);
  mesh.castShadow=true; mesh.receiveShadow=true;
  mesh.userData={name,type,level,pos:[...pos],basePos:[...pos],size:[...size],bounce,move,delta:[0,0,0]};
  scene.add(mesh); objects.push(mesh);
  if (deco) makePawPrint(scene,pos[0],pos[1]+size[1]/2+0.01,pos[2],Math.random()*Math.PI*2);
  return mesh;
}
function makeSphere(scene,hazards,{pos,radius=0.75,color="#ff4fc3",level=1,move=null}) {
  const m=new THREE.Mesh(
    new THREE.SphereGeometry(radius,18,14),
    new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:0.15,roughness:0.4})
  );
  m.position.set(pos[0],pos[1],pos[2]);
  m.userData={type:"sphere",level,radius,move,basePos:[...pos]};
  scene.add(m); hazards.push(m);
}
function makeCylinder(scene,hazards,{pos,radius=0.5,height=2,color="#ff3b9d",level=1,spin=null}) {
  const m=new THREE.Mesh(
    new THREE.CylinderGeometry(radius,radius,height,18),
    new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:0.18,roughness:0.35})
  );
  m.position.set(pos[0],pos[1],pos[2]);
  m.userData={type:"cylinder",level,radius,height,spin,basePos:[...pos]};
  scene.add(m); hazards.push(m);
}

// ─── CHECKPOINT HELPER ────────────────────────────────────────────────────────
function cpBox(scene,objects,{pos,size=[11,0.7,9],level,label}) {
  makeBox(scene,objects,{name:`cp${level}`,pos,size,color:"#60ffb5",emissive:"#0a4f36",type:"checkpoint",level});
  makeSign(scene,label,[pos[0],pos[1]+3,pos[2]-3.5],[5.8,1.2]);
}

// ─── WORLD BUILDER ───────────────────────────────────────────────────────────
function buildWorld(scene, objects, hazards) {
  // ── Spawn pad ──
  makeBox(scene,objects,{name:"start",pos:[0,0,0],size:[14,0.7,14],color:"#ff9de6",type:"checkpoint",level:1});
  makePawPrint(scene,-2,0.36,0); makePawPrint(scene,2,0.36,-2,0.8);
  makeFursuitHead(scene,[-4.5,1.1,-4.5],"#9ee7ff");
  makeFursuitHead(scene,[4.5,1.1,-4.5],"#ff9de6");
  makeSign(scene,"FURRY OBBY: UwU ASCENSION",[0,3.2,-5.8],[7,1.4]);

  // running state — advance in -Z, occasionally vary Y and X
  let z=-10, x=0, y=0;

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 1  – easy intro hops
  makeSign(scene,"SECTION 1: THE AWAKENING",[0,y+3.2,z+2],[5.5,1.2]);
  for (let i=0;i<6;i++) {
    x=(i%2===0)?2.2:-2.2; y+=0.1;
    makeBox(scene,objects,{pos:[x,y,z],size:[5,0.6,5],color:PAL[i%8],type:"solid",level:1,deco:true});
    z-=6.5;
  }
  x=0; y+=0.1;
  cpBox(scene,objects,{pos:[x,y,z],level:2,label:"CHECKPOINT! NYA~"});
  makeFursuitHead(scene,[x-3.5,y+1,z-2],"#ff9de6"); makeFursuitHead(scene,[x+3.5,y+1,z-2],"#9ee7ff");
  z-=11;

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 2  – moving platforms (X-axis only, same Z row)
  makeSign(scene,"SECTION 2: MOVING UWU PLATFORMS",[0,y+3.2,z+2],[6,1.2]);
  for (let i=0;i<5;i++) {
    makeBox(scene,objects,{pos:[0,y,z],size:[5.5,0.6,5],color:"#9ee7ff",type:"solid",level:2,
      move:{axis:"x",distance:4.5,speed:1.2+i*0.1,phase:i*1.3}});
    z-=7.5; y+=0.12;
  }
  makeBox(scene,objects,{pos:[0,y,z],size:[9,0.65,7],color:PAL[2],type:"solid",level:2}); z-=9;
  cpBox(scene,objects,{pos:[0,y,z],level:3,label:"CHECKPOINT! KEEP GOING UWU"}); z-=11;

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 3  – first spinner
  makeSign(scene,"SECTION 3: TAIL SPIN DANGER XD",[0,y+3.2,z+2],[5.8,1.2]);
  makeBox(scene,objects,{pos:[0,y,z],size:[13,0.65,11],color:"#ffe18f",type:"solid",level:3});
  makeTailSpinner(scene,hazards,{center:[0,y+0.33,z],armLength:8,speed:1.3,level:3,color:"#ff3ba7"});
  makeSign(scene,"DODGE THE SPINNY TAIL XD",[0,y+3.4,z-3.6],[5,1.1]);
  z-=13; y+=0.2;
  for (let i=0;i<4;i++) {
    x=[2.5,-2.5,3,-3][i];
    makeBox(scene,objects,{pos:[x,y,z],size:[4.5,0.58,4.5],color:PAL[i],type:"solid",level:3,deco:true});
    z-=6;
  }
  x=0;
  cpBox(scene,objects,{pos:[x,y,z],level:4,label:"✅ SURVIVED SECTION 3!"}); makeFursuitHead(scene,[x,y+1.1,z+1.5],"#d6a3ff"); z-=11;

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 4  – bounce pads
  makeSign(scene,"SECTION 4: BOING BOING BOING",[0,y+3.2,z+2],[5.5,1.2]);
  makeBox(scene,objects,{pos:[0,y,z],size:[6.5,0.55,6.5],color:"#a855f7",emissive:"#5b21b6",type:"bounce",level:4,bounce:14});
  makeSign(scene,"BOINGY PAW PAD OwO",[0,y+3,z-2.5],[4.5,1.1]);
  z-=9; y+=3.3;
  makeBox(scene,objects,{pos:[0,y,z],size:[9,0.65,7],color:PAL[4],type:"solid",level:4,deco:true}); x=0; z-=9;
  makeBox(scene,objects,{pos:[2.5,y,z],size:[5.5,0.55,5.5],color:"#a855f7",emissive:"#5b21b6",type:"bounce",level:4,bounce:13.5});
  z-=9; y+=2.9;
  makeBox(scene,objects,{pos:[0,y,z],size:[9,0.65,7.5],color:PAL[0],type:"solid",level:4}); z-=9;
  cpBox(scene,objects,{pos:[0,y,z],level:5,label:"CHECKPOINT! UWU YOU DID IT"}); z-=11;

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 5  – lava tiles (avoidable — lava only on one half of each platform)
  makeSign(scene,"SECTION 5: UWU LAVA TILES >:3",[0,y+3.2,z+2],[5.5,1.2]);
  for (let i=0;i<5;i++) {
    const pz=z-i*9, px=(i%2===0)?-2:2;
    makeBox(scene,objects,{pos:[px,y,pz],size:[8,0.62,6],color:"#ff9de6",type:"solid",level:5});
    const lx=px+(i%2===0?2.2:-2.2);
    makeBox(scene,objects,{pos:[lx,y+0.38,pz],size:[2.4,0.2,2.4],color:"#ff1744",emissive:"#ff0033",type:"hazardTile",level:5});
  }
  z-=47; y+=0.3;
  cpBox(scene,objects,{pos:[0,y,z],level:6,label:"✅ HALFWAY THERE, BESTIE"});
  makeFursuitHead(scene,[-3,y+1.1,z],"#ffe18f"); makeFursuitHead(scene,[3,y+1.1,z],"#b8ff9e"); z-=11;

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 6  – narrow bridges + spinning cylinders
  makeSign(scene,"SECTION 6: SKINNY PAW BRIDGES",[0,y+3.2,z+2],[5.8,1.2]);
  for (let i=0;i<6;i++) {
    const bx=Math.sin(i*1.3)*3.2;
    makeBox(scene,objects,{pos:[bx,y,z],size:[2.8,0.5,5.5],color:"#fff",type:"solid",level:6,deco:true});
    if (i%2===0) makeCylinder(scene,hazards,{pos:[bx+2.4,y+0.95,z],radius:0.44,height:1.9,color:"#ff006e",level:6,spin:{axis:"y",speed:3.5}});
    z-=5.8; y+=0.07;
  }
  makeBox(scene,objects,{pos:[0,y,z],size:[9,0.65,7],color:PAL[3],type:"solid",level:6}); z-=9;
  cpBox(scene,objects,{pos:[0,y,z],level:7,label:"CHECKPOINT! RAWR XD"}); z-=11;

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 7  – double spinners + hop series
  makeSign(scene,"SECTION 7: DOUBLE TAIL CHAOS",[0,y+3.2,z+2],[5.8,1.2]);
  makeBox(scene,objects,{pos:[0,y,z],size:[18,0.68,13],color:"#2dd4bf",type:"solid",level:7});
  makeTailSpinner(scene,hazards,{center:[-3,y+0.34,z],armLength:7.5,speed:2,level:7,color:"#ff3b9d"});
  makeTailSpinner(scene,hazards,{center:[3,y+0.34,z],armLength:7.5,speed:-2.2,level:7,color:"#a855f7"});
  makeSign(scene,"DOUBLE TAIL ATTACK!!!",[0,y+4,z-4.5],[5,1.1]);
  z-=15; y+=0.3;
  for (let i=0;i<5;i++) {
    x=Math.sin(i*1.9)*4;
    makeBox(scene,objects,{pos:[x,y,z],size:[4,0.55,4],color:PAL[(i+2)%8],type:"solid",level:7,deco:true});
    z-=5.5; y+=0.11;
  }
  x=0;
  cpBox(scene,objects,{pos:[x,y,z],level:8,label:"✅ STILL GOING?? RESPECT"}); z-=11;

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 8  – moving platforms + rolling sphere hazards
  makeSign(scene,"SECTION 8: DODGE & HOP TIME",[0,y+3.2,z+2],[5.5,1.2]);
  for (let i=0;i<5;i++) {
    const ph=i*0.9;
    makeBox(scene,objects,{pos:[0,y,z],size:[5,0.58,5],color:"#9ee7ff",type:"solid",level:8,
      move:{axis:i%2===0?"x":"z",distance:4,speed:1.4+i*0.1,phase:ph}});
    makeSphere(scene,hazards,{pos:[i%2===0?-5:0,y+1.2,z],radius:0.85,color:"#ff4fc3",level:8,
      move:{axis:i%2===0?"x":"z",distance:5,speed:1.6+i*0.1,phase:ph+Math.PI}});
    z-=7; y+=0.1;
  }
  makeBox(scene,objects,{pos:[0,y,z],size:[9,0.65,8],color:PAL[5],type:"solid",level:8}); z-=9;
  cpBox(scene,objects,{pos:[0,y,z],level:9,label:"CHECKPOINT! SO CLOSE UWU"}); makeFursuitHead(scene,[0,y+1.1,z+1],"#ff9de6"); z-=11;

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 9  – alternating moving platform + lava combos
  makeSign(scene,"SECTION 9: MOVING LAVA CHAOS",[0,y+3.2,z+2],[5.8,1.2]);
  for (let i=0;i<4;i++) {
    // safe platform moves, lava tile is static
    makeBox(scene,objects,{pos:[0,y,z],size:[6,0.6,5.5],color:"#ffb07c",type:"solid",level:9,
      move:{axis:"x",distance:4,speed:1.5+i*0.12,phase:i*1.5}});
    makeBox(scene,objects,{pos:[3.5,y+0.38,z],size:[2,0.2,2],color:"#ff1744",emissive:"#ff0033",type:"hazardTile",level:9});
    z-=8; y+=0.12;
  }
  makeBox(scene,objects,{pos:[0,y,z],size:[10,0.65,8],color:PAL[4],type:"solid",level:9}); z-=10;
  cpBox(scene,objects,{pos:[0,y,z],level:10,label:"✅ SECTION 9 DONE!! NYA~"}); z-=11;

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 10  – spinner gauntlet
  makeSign(scene,"SECTION 10: SPINNER GAUNTLET",[0,y+3.2,z+2],[5.8,1.2]);
  makeBox(scene,objects,{pos:[0,y,z],size:[20,0.68,14],color:"#ffe18f",type:"solid",level:10});
  makeTailSpinner(scene,hazards,{center:[-4,y+0.34,z],armLength:8,speed:2.3,level:10,color:"#ff4fc3"});
  makeTailSpinner(scene,hazards,{center:[4,y+0.34,z],armLength:8,speed:-2.5,level:10,color:"#9ee7ff"});
  makeTailSpinner(scene,hazards,{center:[0,y+0.34,z-5],armLength:7,speed:2.8,level:10,color:"#b8ff9e"});
  makeSign(scene,"TRIPLE TAIL TERROR!!!",[0,y+4,z-6],[5.5,1.1]);
  z-=16; y+=0.4;
  for (let i=0;i<4;i++) {
    x=[3,-3,2.5,-2.5][i];
    makeBox(scene,objects,{pos:[x,y,z],size:[4,0.55,4],color:PAL[i],type:"solid",level:10,deco:true});
    z-=6; y+=0.1;
  }
  x=0;
  cpBox(scene,objects,{pos:[x,y,z],level:11,label:"CHECKPOINT! 10/20 DONE!"}); z-=11;

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 11  – tiny paw hops + moving spheres
  makeSign(scene,"SECTION 11: TINY PAW CHAOS",[0,y+3.2,z+2],[5.8,1.2]);
  for (let i=0;i<7;i++) {
    x=Math.sin(i*1.6)*4.5;
    makeBox(scene,objects,{pos:[x,y,z],size:[3.2,0.52,3.2],color:PAL[i%8],type:"solid",level:11,deco:true});
    makeSphere(scene,hazards,{pos:[x+(i%2===0?2:-2),y+1.1,z],radius:0.7,color:"#a855f7",level:11,
      move:{axis:"x",distance:3,speed:1.8+i*0.08,phase:i*0.9}});
    z-=5.5; y+=0.08;
  }
  makeBox(scene,objects,{pos:[0,y,z],size:[9,0.65,7],color:PAL[3],type:"solid",level:11}); z-=9;
  cpBox(scene,objects,{pos:[0,y,z],level:12,label:"✅ CHECKPOINT 12! UWUWUWU"}); z-=11;

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 12  – big bounce + mid-air spinner
  makeSign(scene,"SECTION 12: MEGA BOUNCE UWU",[0,y+3.2,z+2],[5.8,1.2]);
  makeBox(scene,objects,{pos:[0,y,z],size:[7,0.55,7],color:"#a855f7",emissive:"#5b21b6",type:"bounce",level:12,bounce:15});
  makeSign(scene,"MEGA BOINGY TIME OwO",[0,y+3,z-3],[4.8,1.1]);
  z-=10; y+=3.8;
  makeBox(scene,objects,{pos:[0,y,z],size:[12,0.65,10],color:"#ff9de6",type:"solid",level:12});
  makeTailSpinner(scene,hazards,{center:[0,y+0.34,z],armLength:9,speed:2.0,level:12,color:"#ff3b9d"});
  z-=13; y+=0.3;
  makeBox(scene,objects,{pos:[0,y,z],size:[9,0.65,8],color:PAL[6],type:"solid",level:12}); z-=9;
  cpBox(scene,objects,{pos:[0,y,z],level:13,label:"CHECKPOINT 13! HALFWAY!"}); z-=11;

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 13  – staircase with spinners at ends
  makeSign(scene,"SECTION 13: STAIRCASE OF DOOM",[0,y+3.2,z+2],[5.8,1.2]);
  for (let i=0;i<7;i++) {
    const sx=(i%2===0)?2.5:-2.5; y+=0.45;
    makeBox(scene,objects,{pos:[sx,y,z],size:[4.5,0.55,4],color:PAL[i%8],type:"solid",level:13,deco:true});
    if (i===2||i===5) makeTailSpinner(scene,hazards,{center:[sx,y+0.28,z],armLength:5.5,speed:2.2+i*0.1,level:13,color:PAL[(i+3)%8]});
    z-=5.5;
  }
  makeBox(scene,objects,{pos:[0,y,z],size:[9,0.65,7],color:PAL[1],type:"solid",level:13}); z-=9;
  cpBox(scene,objects,{pos:[0,y,z],level:14,label:"✅ CHECKPOINT 14! KEEP IT UP"}); z-=11;

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 14  – wave of moving platforms (Z-axis)
  makeSign(scene,"SECTION 14: WAVY WAVE WOOF",[0,y+3.2,z+2],[5.8,1.2]);
  for (let i=0;i<5;i++) {
    makeBox(scene,objects,{pos:[(i%2===0)?3:-3,y,z],size:[5.5,0.6,5],color:"#99ffee",type:"solid",level:14,
      move:{axis:"z",distance:3.5,speed:1.3+i*0.11,phase:i*1.2}});
    z-=7.5; y+=0.1;
  }
  makeBox(scene,objects,{pos:[0,y,z],size:[9,0.65,8],color:PAL[5],type:"solid",level:14}); z-=9;
  cpBox(scene,objects,{pos:[0,y,z],level:15,label:"CHECKPOINT 15!! ALMOST DONE!!"}); z-=11;

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 15  – lava maze (safe path zigzags, rest is hazardTile)
  makeSign(scene,"SECTION 15: UWU LAVA MAZE",[0,y+3.2,z+2],[5.8,1.2]);
  const safePattern=[
    [-3,0],[-1,0],[-1,-1],[0,-1],[1,-1],[2,-1],[2,-2],[2,-3],[1,-3],[0,-3],[0,-4],
  ];
  const grid=4.5;
  safePattern.forEach(([gx,gz])=>{
    makeBox(scene,objects,{pos:[gx*grid,y,z+gz*grid],size:[4,0.6,4],color:"#ffd700",type:"solid",level:15,deco:true});
  });
  // hazard tiles filling the "wrong" squares nearby
  for (let gx=-4;gx<=4;gx++) for (let gz=0;gz>=-5;gz--) {
    const isSafe=safePattern.some(([sx,sz])=>sx===gx&&sz===gz);
    if (!isSafe&&Math.abs(gx)<=3) {
      makeBox(scene,objects,{pos:[gx*grid,y+0.3,z+gz*grid],size:[3.8,0.15,3.8],color:"#ff1744",emissive:"#ff0033",type:"hazardTile",level:15});
    }
  }
  z+=safePattern[safePattern.length-1][1]*grid - 8;
  y+=0.3;
  cpBox(scene,objects,{pos:[0,y,z],level:16,label:"✅ CHECKPOINT 16! END IS NEAR"});
  makeFursuitHead(scene,[-3.5,y+1.1,z],"#ff9de6"); makeFursuitHead(scene,[3.5,y+1.1,z],"#9ee7ff"); z-=11;

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 16  – moving platforms + cylinders
  makeSign(scene,"SECTION 16: CYLINDER HELL",[0,y+3.2,z+2],[5.8,1.2]);
  for (let i=0;i<6;i++) {
    makeBox(scene,objects,{pos:[0,y,z],size:[5,0.58,5],color:"#ff9999",type:"solid",level:16,
      move:{axis:"x",distance:4.5,speed:1.5+i*0.1,phase:i*0.8}});
    makeCylinder(scene,hazards,{pos:[0,y+1,z-(i%2===0?1.5:-1.5)],radius:0.5,height:2.2,color:"#ff006e",level:16,spin:{axis:"y",speed:4+i*0.3}});
    z-=7; y+=0.1;
  }
  makeBox(scene,objects,{pos:[0,y,z],size:[9,0.65,7],color:PAL[2],type:"solid",level:16}); z-=9;
  cpBox(scene,objects,{pos:[0,y,z],level:17,label:"CHECKPOINT 17! THREE MORE!"}); z-=11;

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 17  – quad spinners arena
  makeSign(scene,"SECTION 17: QUAD SPINNER ARENA",[0,y+3.2,z+2],[6,1.2]);
  makeBox(scene,objects,{pos:[0,y,z],size:[22,0.68,16],color:"#2dd4bf",type:"solid",level:17});
  [[-5,-3],[5,-3],[-5,3],[5,3]].forEach(([sx,sz],i)=>{
    makeTailSpinner(scene,hazards,{center:[sx,y+0.34,z+sz],armLength:6,speed:(i%2===0?2.6:-2.8)+i*0.1,level:17,color:PAL[i]});
  });
  makeSign(scene,"FOUR TAILS. NO MERCY. UWU",[0,y+4.2,z-6.5],[6,1.1]);
  z-=18; y+=0.4;
  for (let i=0;i<5;i++) {
    x=Math.cos(i*1.5)*4;
    makeBox(scene,objects,{pos:[x,y,z],size:[4,0.55,4],color:PAL[i],type:"solid",level:17,deco:true});
    z-=6; y+=0.15;
  }
  x=0;
  cpBox(scene,objects,{pos:[x,y,z],level:18,label:"✅ CHECKPOINT 18! ALMOST!"}); z-=11;

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 18  – everything combined: moving + lava + spinner
  makeSign(scene,"SECTION 18: THE FURRY FINALE",[0,y+3.2,z+2],[5.8,1.2]);
  for (let i=0;i<5;i++) {
    makeBox(scene,objects,{pos:[0,y,z],size:[6,0.6,5.5],color:PAL[i],type:"solid",level:18,
      move:{axis:i%2===0?"x":"z",distance:4,speed:1.7+i*0.12,phase:i*1.1}});
    if (i%2===0) makeBox(scene,objects,{pos:[4,y+0.4,z],size:[2,0.15,2],color:"#ff1744",emissive:"#ff0033",type:"hazardTile",level:18});
    makeSphere(scene,hazards,{pos:[-4,y+1.2,z],radius:0.8,color:"#ff4fc3",level:18,
      move:{axis:"x",distance:4.5,speed:1.9+i*0.1,phase:i*0.8+Math.PI}});
    z-=8; y+=0.12;
  }
  makeBox(scene,objects,{pos:[0,y,z],size:[9,0.65,7],color:PAL[7],type:"solid",level:18}); z-=9;
  cpBox(scene,objects,{pos:[0,y,z],level:19,label:"CHECKPOINT 19! LAST HURDLE!!"}); z-=11;

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 19  – final sprint + bounce into finish
  makeSign(scene,"SECTION 19: THE LAST STRETCH",[0,y+3.2,z+2],[5.8,1.2]);
  for (let i=0;i<6;i++) {
    x=Math.sin(i*2.2)*4;
    makeBox(scene,objects,{pos:[x,y,z],size:[3.8,0.55,3.8],color:["#ffd700","#ff9de6","#9ee7ff","#b8ff9e","#d6a3ff","#ffb07c"][i],type:"solid",level:19,deco:true});
    z-=5.8; y+=0.18;
  }
  // Bounce to FINISH
  x=0;
  makeBox(scene,objects,{pos:[x,y,z],size:[7,0.55,7],color:"#a855f7",emissive:"#5b21b6",type:"bounce",level:19,bounce:16});
  makeSign(scene,"LAST BOUNCE! GO GO GO!",[x,y+3,z-3],[5,1.1]);
  z-=10; y+=4;

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 20 / FINISH
  makeSign(scene,"SECTION 20: THE FINISH LINE!",[0,y+3.6,z+2],[6,1.2]);
  makeBox(scene,objects,{pos:[0,y,z],size:[24,0.85,18],color:"#ffd700",emissive:"#8a6d00",type:"finish",level:20});
  makeSign(scene,"YOU ESCAPED THE UWU DIMENSION!!",[0,y+4.8,z-6],[8,1.5]);
  makeSign(scene,"RAWR XD — YOU WIN, BESTIE!!",[0,y+3.2,z-4.8],[6.5,1.2]);
  for (let i=0;i<6;i++) makeFursuitHead(scene,[(i-2.5)*3.5,y+1.1,z],PAL[i]);
  for (let i=0;i<4;i++) makePawPrint(scene,(i-1.5)*5,y+0.43,z-5,i*0.9);
}

// ─── COLLISION ───────────────────────────────────────────────────────────────
function getTopLanding(objects, prevY, nextY, nextX, nextZ, velY) {
  const feetPrev = prevY - PLAYER_HEIGHT;
  const feetNext = nextY - PLAYER_HEIGHT;
  let best=null, bestTop=-Infinity;
  for (const obj of objects) {
    if (obj.userData.type==="hazardTile") continue;
    const [px,py,pz]=obj.userData.pos;
    const [sx,sy,sz]=obj.userData.size;
    const top=py+sy/2;
    const inX=nextX+PLAYER_RADIUS>px-sx/2 && nextX-PLAYER_RADIUS<px+sx/2;
    const inZ=nextZ+PLAYER_RADIUS>pz-sz/2 && nextZ-PLAYER_RADIUS<pz+sz/2;
    if (!inX||!inZ) continue;
    // generous sweep: allow 0.22 units of penetration to catch thin platforms
    if (feetPrev>=top-0.22 && feetNext<=top+0.3 && velY<=0.05 && top>bestTop) {
      best=obj; bestTop=top;
    }
  }
  return best;
}
function isLavaTile(objects,x,y,z) {
  for (const obj of objects) {
    if (obj.userData.type!=="hazardTile") continue;
    const [px,py,pz]=obj.userData.pos;
    const [sx,sy,sz]=obj.userData.size;
    if (x+PLAYER_RADIUS>px-sx/2 && x-PLAYER_RADIUS<px+sx/2 &&
        z+PLAYER_RADIUS>pz-sz/2 && z-PLAYER_RADIUS<pz+sz/2 &&
        y-PLAYER_HEIGHT<py+sy/2+0.4 && y>py-sy/2) return true;
  }
  return false;
}
function isHazard(hazards,px,py,pz) {
  for (const hz of hazards) {
    if (hz.userData.type==="spinner") {
      const c=hz.position, ang=hz.rotation.y, len=hz.userData.armLength/2;
      const ax=c.x+Math.cos(ang)*-len, az=c.z+Math.sin(ang)*-len;
      const bx=c.x+Math.cos(ang)*len,  bz=c.z+Math.sin(ang)*len;
      if (py-PLAYER_HEIGHT<c.y+1.65 && py>c.y+0.35 &&
          distPtSeg2D(px,pz,ax,az,bx,bz)<PLAYER_RADIUS+0.4) return true;
    } else {
      const r=hz.userData.radius||0.6, h=hz.userData.height||r*2;
      if (Math.hypot(px-hz.position.x,pz-hz.position.z)<r+PLAYER_RADIUS &&
          py-PLAYER_HEIGHT<hz.position.y+h/2 && py>hz.position.y-h/2) return true;
    }
  }
  return false;
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export default function FurryObbyGame({onBack}) {
  const mountRef=useRef(null);
  const stateRef=useRef(null);
  const [hud,setHud]=useState({started:false,paused:false,locked:false,level:1,deaths:0,checkpoint:1,completed:false,time:0});
  const [flash,setFlash]=useState(null); // "check"|"death"
  const [toast,setToast]=useState(null);
  const toastRef=useRef(null);

  const showToast=useCallback(msg=>{
    setToast(msg); clearTimeout(toastRef.current);
    toastRef.current=setTimeout(()=>setToast(null),2200);
  },[]);

  const triggerFlash=useCallback(type=>{
    setFlash(type); setTimeout(()=>setFlash(null),type==="death"?450:650);
  },[]);

  useEffect(()=>{
    const mount=mountRef.current; if (!mount) return;

    // Scene setup
    const scene=new THREE.Scene();
    scene.background=new THREE.Color("#9bdcff");
    scene.fog=new THREE.Fog("#9bdcff",28,200);
    const camera=new THREE.PerspectiveCamera(80,mount.clientWidth/mount.clientHeight,0.04,700);
    camera.rotation.order="YXZ";
    const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});
    renderer.setSize(mount.clientWidth,mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    // Lights
    scene.add(new THREE.HemisphereLight("#ffe8fa","#9e5bbd",0.95));
    const sun=new THREE.DirectionalLight("#fff5f0",1.35);
    sun.position.set(20,40,18); sun.castShadow=true;
    sun.shadow.mapSize.width=sun.shadow.mapSize.height=2048;
    ["left","right","top","bottom"].forEach(s=>sun.shadow.camera[s]=(s==="left"||s==="bottom"?-1:1)*100);
    scene.add(sun);
    scene.add(Object.assign(new THREE.DirectionalLight("#c0e8ff",0.45),{position:{x:-15,y:10,z:15}}));

    // Build world
    const objects=[], hazards=[];
    buildWorld(scene,objects,hazards);

    // Sky + clouds
    const sky=new THREE.Mesh(new THREE.SphereGeometry(350,32,18),new THREE.MeshBasicMaterial({color:"#d0b8ff",side:THREE.BackSide}));
    scene.add(sky);
    const cloudMat=new THREE.MeshBasicMaterial({color:"#fff",transparent:true,opacity:0.62});
    const clouds=Array.from({length:65},(_,i)=>{
      const cl=new THREE.Mesh(new THREE.SphereGeometry(2.5+Math.random()*3.2,10,7),cloudMat);
      cl.position.set(-90+Math.random()*180, 26+Math.random()*38, -20-Math.random()*700);
      cl.scale.set(2,0.48,1); scene.add(cl); return cl;
    });

    // ── Player ──
    const SPAWN=new THREE.Vector3(0,2.3,2.5);
    const player={
      pos:SPAWN.clone(), vel:new THREE.Vector3(),
      yaw:0,   // FIX: yaw=0 → forward is -Z = into the course
      pitch:0, grounded:false,
      checkpointPos:SPAWN.clone(), checkpointLevel:1, checkpointYaw:0,
      level:1, deaths:0, completed:false,
      startTime:performance.now(), finishedTime:null,
    };
    const keys={KeyW:false,KeyA:false,KeyS:false,KeyD:false,Space:false,ShiftLeft:false,ShiftRight:false};
    const rt={scene,camera,renderer,objects,hazards,player,keys,
      running:true,started:false,paused:false,locked:false,
      lastT:performance.now(),raf:null,lastHudUpdate:0};
    stateRef.current=rt;

    // ── Respawn ──
    function respawn() {
      player.deaths++;
      player.pos.copy(player.checkpointPos);
      player.vel.set(0,0,0);
      player.yaw=player.checkpointYaw;   // FIX: restore yaw from when CP was saved
      player.pitch=0;
      player.grounded=false;
      triggerFlash("death");
      setHud(h=>({...h,deaths:player.deaths}));
    }

    // ── Checkpoint save ──
    function saveCheckpoint(platform) {
      const lvl=platform.userData.level;
      if (lvl<=player.checkpointLevel) return;
      player.checkpointLevel=lvl;
      const top=platform.position.y+platform.userData.size[1]/2;
      player.checkpointPos.set(platform.position.x, top+PLAYER_HEIGHT+0.12, platform.position.z+1.6);
      // Save current yaw so respawn faces the same direction you arrived from
      player.checkpointYaw=player.yaw;
      showToast(`✅ Checkpoint ${lvl}/${TOTAL_SECTIONS} saved! NYA~`);
      triggerFlash("check");
      setHud(h=>({...h,checkpoint:player.checkpointLevel,level:Math.max(h.level,lvl)}));
    }

    // ── Events ──
    function onPLC() { rt.locked=document.pointerLockElement===renderer.domElement; setHud(h=>({...h,locked:rt.locked})); }
    function onMM(e) {
      if (!rt.locked||rt.paused||player.completed) return;
      player.yaw-=e.movementX*MOUSE_SENS;
      player.pitch=clamp(player.pitch-e.movementY*MOUSE_SENS,-1.3,1.3);
    }
    function onKD(e) {
      if (e.code in keys) keys[e.code]=true;
      if (e.code==="Escape") { rt.paused=true; document.exitPointerLock?.(); setHud(h=>({...h,paused:true})); }
      if (e.code==="KeyP") { rt.paused=!rt.paused; if (!rt.paused) renderer.domElement.requestPointerLock?.(); setHud(h=>({...h,paused:rt.paused})); }
      if (e.code==="KeyR") respawn();
    }
    function onKU(e) { if (e.code in keys) keys[e.code]=false; }
    function onClick() { if (!rt.locked&&!rt.paused&&!player.completed) { renderer.domElement.requestPointerLock?.(); rt.started=true; setHud(h=>({...h,started:true})); } }
    function onResize() { if (!mount) return; camera.aspect=mount.clientWidth/mount.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(mount.clientWidth,mount.clientHeight); }
    document.addEventListener("pointerlockchange",onPLC);
    document.addEventListener("mousemove",onMM);
    window.addEventListener("keydown",onKD);
    window.addEventListener("keyup",onKU);
    window.addEventListener("resize",onResize);
    renderer.domElement.addEventListener("click",onClick);

    // ── Animate moving objects ──
    function updateMovingObjects(t) {
      for (const obj of objects) {
        const mv=obj.userData.move; if (!mv) continue;
        const [ox,oy,oz]=[obj.position.x,obj.position.y,obj.position.z];
        const base=obj.userData.basePos;
        const off=Math.sin(t*mv.speed+mv.phase)*mv.distance;
        if (mv.axis==="x") obj.position.x=base[0]+off;
        else if (mv.axis==="y") obj.position.y=base[1]+off;
        else obj.position.z=base[2]+off;
        obj.userData.pos=[obj.position.x,obj.position.y,obj.position.z];
        // Track per-frame velocity for platform riding
        obj.userData.velX=obj.position.x-ox;
        obj.userData.velY=obj.position.y-oy;
        obj.userData.velZ=obj.position.z-oz;
      }
      for (const hz of hazards) {
        if (hz.userData.type==="spinner") hz.rotation.y=(hz.userData.angle+=(hz.userData.speed||0)*0.016);
        if (hz.userData.spin) { const s=hz.userData.spin; hz.rotation[s.axis]+=s.speed*0.016; }
        if (hz.userData.move) {
          const mv=hz.userData.move, base=hz.userData.basePos;
          const off=Math.sin((performance.now()/1000)*mv.speed+mv.phase)*mv.distance;
          if (mv.axis==="x") hz.position.x=base[0]+off;
          else if (mv.axis==="y") hz.position.y=base[1]+off;
          else hz.position.z=base[2]+off;
        }
      }
    }

    // ── Player physics (sub-stepped) ──
    function updatePlayer(dt) {
      if (!rt.started||rt.paused||player.completed) return;
      const {pos,vel}=player;

      const fwd=new THREE.Vector3(-Math.sin(player.yaw),0,-Math.cos(player.yaw));
      const rgt=new THREE.Vector3( Math.cos(player.yaw),0,-Math.sin(player.yaw));
      const wish=new THREE.Vector3();
      if (keys.KeyW) wish.add(fwd);
      if (keys.KeyS) wish.sub(fwd);
      if (keys.KeyD) wish.add(rgt);
      if (keys.KeyA) wish.sub(rgt);
      if (wish.lengthSq()>0) wish.normalize();

      const maxSpd=(keys.ShiftLeft||keys.ShiftRight)?SPRINT_SPEED:WALK_SPEED;
      const ctrl=player.grounded?1:AIR_CONTROL;
      vel.x+=wish.x*maxSpd*GROUND_FRICTION*ctrl*dt;
      vel.z+=wish.z*maxSpd*GROUND_FRICTION*ctrl*dt;

      const hSpd=Math.hypot(vel.x,vel.z);
      if (hSpd>maxSpd) { vel.x*=maxSpd/hSpd; vel.z*=maxSpd/hSpd; }
      if (player.grounded&&wish.lengthSq()===0) { const d=Math.max(0,1-GROUND_FRICTION*dt); vel.x*=d; vel.z*=d; }
      if (player.grounded&&keys.Space) { vel.y=JUMP_FORCE; player.grounded=false; }
      vel.y-=GRAVITY*dt;

      // ── Sub-step loop (prevents tunnelling) ──
      const subDt=dt/SUBSTEPS;
      for (let step=0;step<SUBSTEPS;step++) {
        const prevY=pos.y;
        const nx=pos.x+vel.x*subDt;
        const ny=pos.y+vel.y*subDt;
        const nz=pos.z+vel.z*subDt;

        const landed=getTopLanding(objects,prevY,ny,nx,nz,vel.y);
        if (landed) {
          const top=landed.position.y+landed.userData.size[1]/2;
          pos.set(nx, top+PLAYER_HEIGHT, nz);
          vel.y=0;
          player.grounded=true;

          // FIX: match platform velocity exactly — don't apply positional delta
          // Instead give player the platform's velocity so their own inputs still work
          vel.x+=landed.userData.velX||0;
          vel.z+=landed.userData.velZ||0;

          const type=landed.userData.type, lvl=landed.userData.level;
          if (type==="checkpoint") saveCheckpoint(landed);
          if (type==="bounce") { vel.y=landed.userData.bounce||12; player.grounded=false; }
          if (type==="finish"&&!player.completed) {
            player.completed=true; player.finishedTime=(performance.now()-player.startTime)/1000;
            document.exitPointerLock?.();
            setHud(h=>({...h,completed:true,locked:false,time:player.finishedTime,level:TOTAL_SECTIONS}));
          }
          player.level=Math.max(player.level,lvl);
        } else {
          pos.set(nx,ny,nz);
          player.grounded=false;
        }
      }

      // Hazard / void checks
      if (isLavaTile(objects,pos.x,pos.y,pos.z)||isHazard(hazards,pos.x,pos.y,pos.z)) respawn();
      if (pos.y<WORLD_FLOOR_Y) respawn();

      camera.position.copy(pos);
      camera.rotation.y=player.yaw;
      camera.rotation.x=player.pitch;
    }

    // ── Render loop ──
    function animate(now) {
      if (!rt.running) return;
      const dt=Math.min((now-rt.lastT)/1000,0.04); rt.lastT=now;
      updateMovingObjects(now/1000);
      updatePlayer(dt);
      sky.position.copy(camera.position);
      clouds.forEach((cl,i)=>{ cl.position.x+=Math.sin(now/1000*0.17+i*0.7)*0.002; });
      renderer.render(scene,camera);
      if (now-rt.lastHudUpdate>180) {
        rt.lastHudUpdate=now;
        const elapsed=player.completed&&player.finishedTime?player.finishedTime:(performance.now()-player.startTime)/1000;
        setHud(h=>({...h,level:Math.max(h.level,player.level),deaths:player.deaths,checkpoint:player.checkpointLevel,paused:rt.paused,locked:rt.locked,started:rt.started,time:elapsed,completed:player.completed}));
      }
      rt.raf=requestAnimationFrame(animate);
    }
    rt.raf=requestAnimationFrame(animate);

    return ()=>{
      rt.running=false; if (rt.raf) cancelAnimationFrame(rt.raf);
      document.removeEventListener("pointerlockchange",onPLC);
      document.removeEventListener("mousemove",onMM);
      window.removeEventListener("keydown",onKD);
      window.removeEventListener("keyup",onKU);
      window.removeEventListener("resize",onResize);
      renderer.domElement.removeEventListener("click",onClick);
      if (document.pointerLockElement===renderer.domElement) document.exitPointerLock?.();
      renderer.dispose();
      scene.traverse(obj=>{ obj.geometry?.dispose?.(); (Array.isArray(obj.material)?obj.material:[obj.material||{}]).forEach(m=>{m.map?.dispose?.();m.dispose?.();}); });
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      stateRef.current=null; clearTimeout(toastRef.current);
    };
  },[showToast,triggerFlash]);

  function resumeGame() {
    const rt=stateRef.current; if (!rt) return;
    rt.paused=false; rt.renderer.domElement.requestPointerLock?.(); setHud(h=>({...h,paused:false}));
  }
  function restartGame() {
    const rt=stateRef.current; if (!rt) return;
    const {player}=rt;
    const sp=new THREE.Vector3(0,2.3,2.5);
    player.pos.copy(sp); player.vel.set(0,0,0);
    player.yaw=0; player.pitch=0; player.grounded=false;
    player.checkpointPos.copy(sp); player.checkpointYaw=0;
    player.checkpointLevel=1; player.level=1; player.deaths=0;
    player.completed=false; player.startTime=performance.now(); player.finishedTime=null;
    rt.started=true; rt.paused=false;
    setHud({started:true,paused:false,locked:false,level:1,deaths:0,checkpoint:1,completed:false,time:0});
    rt.renderer.domElement.requestPointerLock?.();
  }
  function fmt(sec) { const s=Math.max(0,Math.floor(sec)); return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`; }

  return (
    <div className="furry-obby-page">
      <div className="furry-obby-topbar">
        <div>
          <h1>🐾 Furry Obby: UwU Ascension</h1>
          <p>20-section first-person cringe platformer nightmare. NYA~</p>
        </div>
        <div className="furry-obby-actions">
          {onBack&&<button type="button" onClick={onBack}>← Back</button>}
          <button type="button" onClick={restartGame}>Restart</button>
          <button type="button" onClick={resumeGame}>Resume</button>
        </div>
      </div>

      <div className="furry-obby-shell">
        <div ref={mountRef} className="furry-obby-canvas" />
        <div className="furry-obby-crosshair"><span /></div>
        <div className="furry-obby-hud">
          <div><strong>Section</strong><span>{hud.level}/{TOTAL_SECTIONS}</span></div>
          <div><strong>Checkpoint</strong><span>{hud.checkpoint}</span></div>
          <div><strong>Deaths</strong><span>{hud.deaths}</span></div>
          <div><strong>Time</strong><span>{fmt(hud.time)}</span></div>
        </div>

        {flash==="check"&&<div key={`cf${hud.checkpoint}`} className="furry-obby-checkpoint-flash"/>}
        {flash==="death"&&<div key={`df${hud.deaths}`} className="furry-obby-death-flash"/>}
        {toast&&<div key={toast} className="furry-obby-toast">{toast}</div>}

        {!hud.started&&(
          <div className="furry-obby-overlay">
            <div className="furry-obby-card">
              <h2>🐾 Furry Obby: UwU Ascension</h2>
              <p>20 cursed sections. Spinning fursuit tails, UWU lava, bounce pads, rolling orbs, cylinder spinners, and enough cringe to power a convention. Click to lock your mouse.</p>
              <div className="furry-obby-controls">
                <span>WASD · move</span><span>Mouse · look</span><span>Space · jump</span>
                <span>Shift · sprint</span><span>R · respawn</span><span>P / Esc · pause</span>
              </div>
              <button type="button" onClick={()=>{const rt=stateRef.current;if(!rt)return;rt.started=true;rt.paused=false;rt.renderer.domElement.requestPointerLock?.();setHud(h=>({...h,started:true,paused:false}));}}>
                Enter the UwU Dimension 🐾
              </button>
            </div>
          </div>
        )}

        {hud.paused&&!hud.completed&&(
          <div className="furry-obby-overlay">
            <div className="furry-obby-card">
              <h2>⏸ Paused</h2>
              <p>The cringe awaits. Deaths: <strong>{hud.deaths}</strong></p>
              <button type="button" onClick={resumeGame}>Resume UwU</button>
            </div>
          </div>
        )}

        {hud.completed&&(
          <div className="furry-obby-overlay">
            <div className="furry-obby-card victory">
              <h2>🏆 You Escaped!</h2>
              <p>You survived all 20 sections of the UwU Dimension.</p>
              <p>Time: <strong>{fmt(hud.time)}</strong> · Deaths: <strong>{hud.deaths}</strong></p>
              <button type="button" onClick={restartGame}>Run It Back 🐾</button>
            </div>
          </div>
        )}

        {!hud.locked&&hud.started&&!hud.paused&&!hud.completed&&(
          <div className="furry-obby-clickhint">Click the game to look around</div>
        )}
      </div>
    </div>
  );
}