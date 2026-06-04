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
const SUBSTEPS        = 4;
const TOTAL_SECTIONS  = 20;

const clamp    = (n,lo,hi) => Math.max(lo, Math.min(hi, n));
const randFrom = arr => arr[Math.floor(Math.random()*arr.length)];
const PAL      = ["#ff9de6","#9ee7ff","#b8ff9e","#ffe18f","#d6a3ff","#ffb07c","#ff9999","#99ffee"];

function distPtSeg2D(px,pz,ax,az,bx,bz) {
  const abx=bx-ax, abz=bz-az, apx=px-ax, apz=pz-az;
  const lenSq=abx*abx+abz*abz;
  if (lenSq===0) return Math.hypot(px-ax,pz-az);
  const t=clamp((apx*abx+apz*abz)/lenSq,0,1);
  return Math.hypot(px-(ax+abx*t), pz-(az+abz*t));
}

// ─── SIGN TEXTURE ────────────────────────────────────────────────────────────
function roundRect(ctx,x,y,w,h,r) {
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
  const cv=document.createElement("canvas");
  cv.width=W; cv.height=H;
  const ctx=cv.getContext("2d");
  const g=ctx.createLinearGradient(0,0,W,H);
  g.addColorStop(0,"rgba(255,160,230,0.95)");
  g.addColorStop(1,"rgba(180,90,220,0.92)");
  ctx.fillStyle=g;
  roundRect(ctx,6,6,W-12,H-12,26); ctx.fill();
  ctx.strokeStyle="rgba(255,255,255,0.7)"; ctx.lineWidth=9;
  roundRect(ctx,6,6,W-12,H-12,26); ctx.stroke();
  ctx.font="52px serif";
  ctx.fillStyle="rgba(255,255,255,0.18)";
  ctx.fillText("🐾",22,H-22);
  ctx.fillText("🐾",W-74,42);
  const fs=text.length>22?56:text.length>16?64:70;
  ctx.font=`900 ${fs}px 'Arial Black',Arial,sans-serif`;
  ctx.textAlign="center"; ctx.textBaseline="middle";
  ctx.strokeStyle="rgba(60,0,80,0.9)"; ctx.lineWidth=11;
  ctx.strokeText(text,W/2,H/2);
  ctx.fillStyle="#fff"; ctx.fillText(text,W/2,H/2);
  const t=new THREE.CanvasTexture(cv); t.needsUpdate=true;
  return t;
}

// ─── SIGN (faces +Z = toward player moving in -Z) ───────────────────────────
function makeSign(scene, text, px, py, pz, sw=5.5, sh=1.2) {
  const mat=new THREE.MeshBasicMaterial({
    map:makeSignTexture(text), transparent:true, side:THREE.DoubleSide
  });
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(sw,sh),mat);
  mesh.position.set(px,py,pz);
  scene.add(mesh);
  const pole=new THREE.Mesh(
    new THREE.CylinderGeometry(0.07,0.07,sh*0.7+0.4,8),
    new THREE.MeshStandardMaterial({color:"#fff",roughness:0.5})
  );
  pole.position.set(px,py-sh/2-0.12,pz);
  scene.add(pole);
}

// ─── FURRY DECORATIONS ───────────────────────────────────────────────────────
// parent can be a Scene or a Group
function makeFursuitHead(parent, hx, hy, hz, color) {
  color = color || "#ff9de6";
  const g = new THREE.Group();

  const fur   = new THREE.MeshStandardMaterial({color:color, roughness:0.9});
  const snoutM= new THREE.MeshStandardMaterial({color:"#fff8f0", roughness:0.85});
  const pinkM = new THREE.MeshStandardMaterial({color:"#ff80c0", roughness:0.8});
  const darkM = new THREE.MeshStandardMaterial({color:"#222",    roughness:0.4});
  const eyeM  = new THREE.MeshStandardMaterial({color:"#1a0a2e", roughness:0.3});
  const shineM= new THREE.MeshBasicMaterial  ({color:"#fff"});

  // head sphere
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.8,18,14), fur);
  g.add(head);

  // ears
  const earOffsets=[[-0.46,0.72,0],[0.46,0.72,0]];
  earOffsets.forEach(function(off){
    const ear=new THREE.Mesh(new THREE.ConeGeometry(0.28,0.55,10), fur);
    ear.position.set(off[0],off[1],off[2]);
    g.add(ear);
    const inner=new THREE.Mesh(new THREE.ConeGeometry(0.14,0.38,10), pinkM);
    inner.position.set(off[0],off[1],off[2]+0.04);
    g.add(inner);
  });

  // snout
  const snout=new THREE.Mesh(new THREE.SphereGeometry(0.34,14,10), snoutM);
  snout.position.set(0,-0.12,0.68);
  snout.scale.y=0.7;
  g.add(snout);

  // nose
  const nose=new THREE.Mesh(new THREE.SphereGeometry(0.1,10,8), darkM);
  nose.position.set(0,0.02,0.99);
  g.add(nose);

  // eyes
  const eyeOff=[[-0.3,0.18,0.72],[0.3,0.18,0.72]];
  eyeOff.forEach(function(off){
    const eye=new THREE.Mesh(new THREE.SphereGeometry(0.12,10,8), eyeM);
    eye.position.set(off[0],off[1],off[2]);
    g.add(eye);
    const shine=new THREE.Mesh(new THREE.SphereGeometry(0.05,8,6), shineM);
    shine.position.set(off[0]+0.04,off[1]+0.04,off[2]+0.06);
    g.add(shine);
  });

  g.position.set(hx,hy,hz);
  parent.add(g);
  return g;
}

function makePawPrint(scene, cx, cy, cz, rot) {
  rot = rot || 0;
  const g=new THREE.Group();
  const m=new THREE.MeshStandardMaterial({color:"#ff9de6",roughness:0.7});
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.55,0.55,0.08,18),m));
  var toes=[[-0.46,0,-0.46],[0,0,-0.63],[0.46,0,-0.46],[-0.26,0,0.46],[0.26,0,0.46]];
  toes.forEach(function(toe){
    var t=new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.18,0.08,10),m);
    t.position.set(toe[0],toe[1],toe[2]);
    g.add(t);
  });
  g.position.set(cx,cy,cz);
  g.rotation.y=rot;
  scene.add(g);
}

function makeTailSpinner(scene, hazards, opts) {
  var center=opts.center, armLength=opts.armLength||7, speed=opts.speed||1.6;
  var level=opts.level||1, color=opts.color||"#ff4fc3";

  const g=new THREE.Group();
  g.position.set(center[0],center[1],center[2]);

  // pole
  const poleM=new THREE.MeshStandardMaterial({color:"#fff",roughness:0.7});
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.2,2,12),poleM);
  pole.position.set(0,0.5,0);
  g.add(pole);

  // fursuit head on pole top
  var headColors=["#ff9de6","#9ee7ff","#b8ff9e","#ffe18f","#d6a3ff"];
  makeFursuitHead(g, 0, 2.2, 0, randFrom(headColors));

  // spinning arm (fluffy tail)
  const armM=new THREE.MeshStandardMaterial({color:color,emissive:color,emissiveIntensity:0.22,roughness:0.85});
  const arm=new THREE.Mesh(new THREE.CylinderGeometry(0.24,0.12,armLength,14),armM);
  arm.rotation.z=Math.PI/2;
  arm.position.set(0,1.15,0);
  g.add(arm);

  // fluffy tips
  const tipM=new THREE.MeshStandardMaterial({color:"#fff",emissive:"#ffe8fa",emissiveIntensity:0.22,roughness:0.9});
  [armLength/2,-armLength/2].forEach(function(tx){
    const tip=new THREE.Mesh(new THREE.SphereGeometry(0.6,14,10),tipM);
    tip.position.set(tx,1.15,0);
    g.add(tip);
  });

  g.userData={type:"spinner",level:level,armLength:armLength,speed:speed,angle:0};
  scene.add(g);
  hazards.push(g);
  return g;
}

// ─── PLATFORM / HAZARD MAKERS ────────────────────────────────────────────────
function makeBox(scene, objects, opts) {
  var name=opts.name||"p", pos=opts.pos, size=opts.size;
  var color=opts.color||"#ff9de6", type=opts.type||"solid", level=opts.level||1;
  var emissive=opts.emissive||"#000", roughness=opts.roughness||0.62;
  var bounce=opts.bounce||0, move=opts.move||null, deco=opts.deco||false;

  const mesh=new THREE.Mesh(
    new THREE.BoxGeometry(size[0],size[1],size[2]),
    new THREE.MeshStandardMaterial({color:color,emissive:emissive,roughness:roughness,metalness:0.04})
  );
  mesh.position.set(pos[0],pos[1],pos[2]);
  mesh.castShadow=true;
  mesh.receiveShadow=true;
  mesh.userData={
    name:name, type:type, level:level,
    pos:[pos[0],pos[1],pos[2]],
    basePos:[pos[0],pos[1],pos[2]],
    size:[size[0],size[1],size[2]],
    bounce:bounce, move:move,
    velX:0, velY:0, velZ:0,
  };
  scene.add(mesh);
  objects.push(mesh);
  if (deco) makePawPrint(scene, pos[0], pos[1]+size[1]/2+0.01, pos[2], Math.random()*Math.PI*2);
  return mesh;
}

function makeSphere(scene, hazards, opts) {
  var pos=opts.pos, radius=opts.radius||0.75, color=opts.color||"#ff4fc3";
  var level=opts.level||1, move=opts.move||null;
  const m=new THREE.Mesh(
    new THREE.SphereGeometry(radius,18,14),
    new THREE.MeshStandardMaterial({color:color,emissive:color,emissiveIntensity:0.15,roughness:0.4})
  );
  m.position.set(pos[0],pos[1],pos[2]);
  m.userData={type:"sphere",level:level,radius:radius,move:move,basePos:[pos[0],pos[1],pos[2]]};
  scene.add(m);
  hazards.push(m);
}

function makeCylinder(scene, hazards, opts) {
  var pos=opts.pos, radius=opts.radius||0.5, height=opts.height||2;
  var color=opts.color||"#ff3b9d", level=opts.level||1, spin=opts.spin||null;
  const m=new THREE.Mesh(
    new THREE.CylinderGeometry(radius,radius,height,18),
    new THREE.MeshStandardMaterial({color:color,emissive:color,emissiveIntensity:0.18,roughness:0.35})
  );
  m.position.set(pos[0],pos[1],pos[2]);
  m.userData={type:"cylinder",level:level,radius:radius,height:height,spin:spin,basePos:[pos[0],pos[1],pos[2]]};
  scene.add(m);
  hazards.push(m);
}

// checkpoint green platform + sign
function cpBox(scene, objects, pos, level, label) {
  makeBox(scene,objects,{
    name:"cp"+level, pos:pos, size:[11,0.7,9],
    color:"#60ffb5", emissive:"#0a4f36", type:"checkpoint", level:level
  });
  makeSign(scene, label, pos[0], pos[1]+3, pos[2]-3.5, 5.8, 1.2);
}

// ─── WORLD BUILDER ───────────────────────────────────────────────────────────
function buildWorld(scene, objects, hazards) {
  // ── Spawn pad ──
  makeBox(scene,objects,{name:"start",pos:[0,0,0],size:[14,0.7,14],color:"#ff9de6",type:"checkpoint",level:1});
  makePawPrint(scene,-2,0.36,0);
  makePawPrint(scene,2,0.36,-2,0.8);
  makeFursuitHead(scene,-4.5,1.1,-4.5,"#9ee7ff");
  makeFursuitHead(scene,4.5,1.1,-4.5,"#ff9de6");
  makeSign(scene,"FURRY OBBY: UwU ASCENSION",0,3.2,-5.8,7,1.4);

  var z=-10, x=0, y=0;

  // SECTION 1 – easy intro hops
  makeSign(scene,"SECTION 1: THE AWAKENING",0,y+3.2,z+2,5.5,1.2);
  for (var i=0;i<6;i++) {
    x=(i%2===0)?2.2:-2.2; y+=0.1;
    makeBox(scene,objects,{pos:[x,y,z],size:[5,0.6,5],color:PAL[i%8],type:"solid",level:1,deco:true});
    z-=6.5;
  }
  x=0; y+=0.1;
  cpBox(scene,objects,[x,y,z],2,"CHECKPOINT! NYA~");
  makeFursuitHead(scene,x-3.5,y+1,z-2,"#ff9de6");
  makeFursuitHead(scene,x+3.5,y+1,z-2,"#9ee7ff");
  z-=11;

  // SECTION 2 – moving platforms (X-axis)
  makeSign(scene,"SECTION 2: MOVING UWU PLATFORMS",0,y+3.2,z+2,6,1.2);
  for (var i=0;i<5;i++) {
    makeBox(scene,objects,{pos:[0,y,z],size:[5.5,0.6,5],color:"#9ee7ff",type:"solid",level:2,
      move:{axis:"x",distance:4.5,speed:1.2+i*0.1,phase:i*1.3}});
    z-=7.5; y+=0.12;
  }
  makeBox(scene,objects,{pos:[0,y,z],size:[9,0.65,7],color:PAL[2],type:"solid",level:2});
  z-=9;
  cpBox(scene,objects,[0,y,z],3,"CHECKPOINT! KEEP GOING UWU");
  z-=11;

  // SECTION 3 – first spinner
  makeSign(scene,"SECTION 3: TAIL SPIN DANGER XD",0,y+3.2,z+2,5.8,1.2);
  makeBox(scene,objects,{pos:[0,y,z],size:[13,0.65,11],color:"#ffe18f",type:"solid",level:3});
  makeTailSpinner(scene,hazards,{center:[0,y+0.33,z],armLength:8,speed:1.3,level:3,color:"#ff3ba7"});
  makeSign(scene,"DODGE THE SPINNY TAIL XD",0,y+3.4,z-3.6,5,1.1);
  z-=13; y+=0.2;
  for (var i=0;i<4;i++) {
    x=[2.5,-2.5,3,-3][i];
    makeBox(scene,objects,{pos:[x,y,z],size:[4.5,0.58,4.5],color:PAL[i],type:"solid",level:3,deco:true});
    z-=6;
  }
  x=0;
  cpBox(scene,objects,[x,y,z],4,"YOU SURVIVED SECTION 3!");
  makeFursuitHead(scene,x,y+1.1,z+1.5,"#d6a3ff");
  z-=11;

  // SECTION 4 – bounce pads
  makeSign(scene,"SECTION 4: BOING BOING BOING",0,y+3.2,z+2,5.5,1.2);
  makeBox(scene,objects,{pos:[0,y,z],size:[6.5,0.55,6.5],color:"#a855f7",emissive:"#5b21b6",type:"bounce",level:4,bounce:14});
  makeSign(scene,"BOINGY PAW PAD OwO",0,y+3,z-2.5,4.5,1.1);
  z-=9; y+=3.3;
  makeBox(scene,objects,{pos:[0,y,z],size:[9,0.65,7],color:PAL[4],type:"solid",level:4,deco:true});
  x=0; z-=9;
  makeBox(scene,objects,{pos:[2.5,y,z],size:[5.5,0.55,5.5],color:"#a855f7",emissive:"#5b21b6",type:"bounce",level:4,bounce:13.5});
  z-=9; y+=2.9;
  makeBox(scene,objects,{pos:[0,y,z],size:[9,0.65,7.5],color:PAL[0],type:"solid",level:4});
  z-=9;
  cpBox(scene,objects,[0,y,z],5,"CHECKPOINT! UWU YOU DID IT");
  z-=11;

  // SECTION 5 – lava tiles (avoidable — lava only on one side of each platform)
  makeSign(scene,"SECTION 5: UWU LAVA TILES >:3",0,y+3.2,z+2,5.5,1.2);
  for (var i=0;i<5;i++) {
    var pz=z-i*9, px=(i%2===0)?-2:2;
    makeBox(scene,objects,{pos:[px,y,pz],size:[8,0.62,6],color:"#ff9de6",type:"solid",level:5});
    var lx=px+(i%2===0?2.2:-2.2);
    makeBox(scene,objects,{pos:[lx,y+0.38,pz],size:[2.4,0.2,2.4],color:"#ff1744",emissive:"#ff0033",type:"hazardTile",level:5});
  }
  z-=47; y+=0.3;
  cpBox(scene,objects,[0,y,z],6,"HALFWAY THERE, BESTIE");
  makeFursuitHead(scene,-3,y+1.1,z,"#ffe18f");
  makeFursuitHead(scene,3,y+1.1,z,"#b8ff9e");
  z-=11;

  // SECTION 6 – narrow bridges + spinning cylinders
  makeSign(scene,"SECTION 6: SKINNY PAW BRIDGES",0,y+3.2,z+2,5.8,1.2);
  for (var i=0;i<6;i++) {
    var bx=Math.sin(i*1.3)*3.2;
    makeBox(scene,objects,{pos:[bx,y,z],size:[2.8,0.5,5.5],color:"#fff",type:"solid",level:6,deco:true});
    if (i%2===0) makeCylinder(scene,hazards,{pos:[bx+2.4,y+0.95,z],radius:0.44,height:1.9,color:"#ff006e",level:6,spin:{axis:"y",speed:3.5}});
    z-=5.8; y+=0.07;
  }
  makeBox(scene,objects,{pos:[0,y,z],size:[9,0.65,7],color:PAL[3],type:"solid",level:6});
  z-=9;
  cpBox(scene,objects,[0,y,z],7,"CHECKPOINT! RAWR XD");
  z-=11;

  // SECTION 7 – double spinners + hop series
  makeSign(scene,"SECTION 7: DOUBLE TAIL CHAOS",0,y+3.2,z+2,5.8,1.2);
  makeBox(scene,objects,{pos:[0,y,z],size:[18,0.68,13],color:"#2dd4bf",type:"solid",level:7});
  makeTailSpinner(scene,hazards,{center:[-3,y+0.34,z],armLength:7.5,speed:2,level:7,color:"#ff3b9d"});
  makeTailSpinner(scene,hazards,{center:[3,y+0.34,z],armLength:7.5,speed:-2.2,level:7,color:"#a855f7"});
  makeSign(scene,"DOUBLE TAIL ATTACK!!!",0,y+4,z-4.5,5,1.1);
  z-=15; y+=0.3;
  for (var i=0;i<5;i++) {
    x=Math.sin(i*1.9)*4;
    makeBox(scene,objects,{pos:[x,y,z],size:[4,0.55,4],color:PAL[(i+2)%8],type:"solid",level:7,deco:true});
    z-=5.5; y+=0.11;
  }
  x=0;
  cpBox(scene,objects,[x,y,z],8,"STILL GOING?? RESPECT");
  z-=11;

  // SECTION 8 – moving platforms + rolling sphere hazards
  makeSign(scene,"SECTION 8: DODGE AND HOP TIME",0,y+3.2,z+2,5.5,1.2);
  for (var i=0;i<5;i++) {
    var ph=i*0.9;
    var axis8=i%2===0?"x":"z";
    makeBox(scene,objects,{pos:[0,y,z],size:[5,0.58,5],color:"#9ee7ff",type:"solid",level:8,
      move:{axis:axis8,distance:4,speed:1.4+i*0.1,phase:ph}});
    makeSphere(scene,hazards,{pos:[i%2===0?-5:0,y+1.2,z],radius:0.85,color:"#ff4fc3",level:8,
      move:{axis:axis8,distance:5,speed:1.6+i*0.1,phase:ph+Math.PI}});
    z-=7; y+=0.1;
  }
  makeBox(scene,objects,{pos:[0,y,z],size:[9,0.65,8],color:PAL[5],type:"solid",level:8});
  z-=9;
  cpBox(scene,objects,[0,y,z],9,"CHECKPOINT! SO CLOSE UWU");
  makeFursuitHead(scene,0,y+1.1,z+1,"#ff9de6");
  z-=11;

  // SECTION 9 – moving platforms + lava combos
  makeSign(scene,"SECTION 9: MOVING LAVA CHAOS",0,y+3.2,z+2,5.8,1.2);
  for (var i=0;i<4;i++) {
    makeBox(scene,objects,{pos:[0,y,z],size:[6,0.6,5.5],color:"#ffb07c",type:"solid",level:9,
      move:{axis:"x",distance:4,speed:1.5+i*0.12,phase:i*1.5}});
    makeBox(scene,objects,{pos:[3.5,y+0.38,z],size:[2,0.2,2],color:"#ff1744",emissive:"#ff0033",type:"hazardTile",level:9});
    z-=8; y+=0.12;
  }
  makeBox(scene,objects,{pos:[0,y,z],size:[10,0.65,8],color:PAL[4],type:"solid",level:9});
  z-=10;
  cpBox(scene,objects,[0,y,z],10,"SECTION 9 DONE!! NYA~");
  z-=11;

  // SECTION 10 – triple spinner gauntlet
  makeSign(scene,"SECTION 10: SPINNER GAUNTLET",0,y+3.2,z+2,5.8,1.2);
  makeBox(scene,objects,{pos:[0,y,z],size:[20,0.68,14],color:"#ffe18f",type:"solid",level:10});
  makeTailSpinner(scene,hazards,{center:[-4,y+0.34,z],armLength:8,speed:2.3,level:10,color:"#ff4fc3"});
  makeTailSpinner(scene,hazards,{center:[4,y+0.34,z],armLength:8,speed:-2.5,level:10,color:"#9ee7ff"});
  makeTailSpinner(scene,hazards,{center:[0,y+0.34,z-5],armLength:7,speed:2.8,level:10,color:"#b8ff9e"});
  makeSign(scene,"TRIPLE TAIL TERROR!!!",0,y+4,z-6,5.5,1.1);
  z-=16; y+=0.4;
  for (var i=0;i<4;i++) {
    x=[3,-3,2.5,-2.5][i];
    makeBox(scene,objects,{pos:[x,y,z],size:[4,0.55,4],color:PAL[i],type:"solid",level:10,deco:true});
    z-=6; y+=0.1;
  }
  x=0;
  cpBox(scene,objects,[x,y,z],11,"CHECKPOINT! 10/20 DONE!");
  z-=11;

  // SECTION 11 – tiny paw hops + moving spheres
  makeSign(scene,"SECTION 11: TINY PAW CHAOS",0,y+3.2,z+2,5.8,1.2);
  for (var i=0;i<7;i++) {
    x=Math.sin(i*1.6)*4.5;
    makeBox(scene,objects,{pos:[x,y,z],size:[3.2,0.52,3.2],color:PAL[i%8],type:"solid",level:11,deco:true});
    makeSphere(scene,hazards,{pos:[x+(i%2===0?2:-2),y+1.1,z],radius:0.7,color:"#a855f7",level:11,
      move:{axis:"x",distance:3,speed:1.8+i*0.08,phase:i*0.9}});
    z-=5.5; y+=0.08;
  }
  makeBox(scene,objects,{pos:[0,y,z],size:[9,0.65,7],color:PAL[3],type:"solid",level:11});
  z-=9;
  cpBox(scene,objects,[0,y,z],12,"CHECKPOINT 12! UWUWUWU");
  z-=11;

  // SECTION 12 – big bounce + spinner on landing
  makeSign(scene,"SECTION 12: MEGA BOUNCE UWU",0,y+3.2,z+2,5.8,1.2);
  makeBox(scene,objects,{pos:[0,y,z],size:[7,0.55,7],color:"#a855f7",emissive:"#5b21b6",type:"bounce",level:12,bounce:15});
  makeSign(scene,"MEGA BOINGY TIME OwO",0,y+3,z-3,4.8,1.1);
  z-=10; y+=3.8;
  makeBox(scene,objects,{pos:[0,y,z],size:[12,0.65,10],color:"#ff9de6",type:"solid",level:12});
  makeTailSpinner(scene,hazards,{center:[0,y+0.34,z],armLength:9,speed:2.0,level:12,color:"#ff3b9d"});
  z-=13; y+=0.3;
  makeBox(scene,objects,{pos:[0,y,z],size:[9,0.65,8],color:PAL[6],type:"solid",level:12});
  z-=9;
  cpBox(scene,objects,[0,y,z],13,"CHECKPOINT 13! HALFWAY!");
  z-=11;

  // SECTION 13 – staircase with spinners
  makeSign(scene,"SECTION 13: STAIRCASE OF DOOM",0,y+3.2,z+2,5.8,1.2);
  for (var i=0;i<7;i++) {
    var sx13=(i%2===0)?2.5:-2.5; y+=0.45;
    makeBox(scene,objects,{pos:[sx13,y,z],size:[4.5,0.55,4],color:PAL[i%8],type:"solid",level:13,deco:true});
    if (i===2||i===5) makeTailSpinner(scene,hazards,{center:[sx13,y+0.28,z],armLength:5.5,speed:2.2+i*0.1,level:13,color:PAL[(i+3)%8]});
    z-=5.5;
  }
  makeBox(scene,objects,{pos:[0,y,z],size:[9,0.65,7],color:PAL[1],type:"solid",level:13});
  z-=9;
  cpBox(scene,objects,[0,y,z],14,"CHECKPOINT 14! KEEP IT UP");
  z-=11;

  // SECTION 14 – Z-axis moving platforms
  makeSign(scene,"SECTION 14: WAVY WAVE WOOF",0,y+3.2,z+2,5.8,1.2);
  for (var i=0;i<5;i++) {
    makeBox(scene,objects,{pos:[(i%2===0)?3:-3,y,z],size:[5.5,0.6,5],color:"#99ffee",type:"solid",level:14,
      move:{axis:"z",distance:3.5,speed:1.3+i*0.11,phase:i*1.2}});
    z-=7.5; y+=0.1;
  }
  makeBox(scene,objects,{pos:[0,y,z],size:[9,0.65,8],color:PAL[5],type:"solid",level:14});
  z-=9;
  cpBox(scene,objects,[0,y,z],15,"CHECKPOINT 15!! ALMOST DONE!!");
  z-=11;

  // SECTION 15 – lava maze with gold safe path
  makeSign(scene,"SECTION 15: UWU LAVA MAZE",0,y+3.2,z+2,5.8,1.2);
  var safePath=[[-3,0],[-1,0],[-1,-1],[0,-1],[1,-1],[2,-1],[2,-2],[2,-3],[1,-3],[0,-3],[0,-4]];
  var grid=4.5;
  safePath.forEach(function(gp){
    makeBox(scene,objects,{pos:[gp[0]*grid,y,z+gp[1]*grid],size:[4,0.6,4],color:"#ffd700",type:"solid",level:15,deco:true});
  });
  for (var gx=-4;gx<=4;gx++) {
    for (var gz=0;gz>=-5;gz--) {
      var isSafe=safePath.some(function(sp){return sp[0]===gx&&sp[1]===gz;});
      if (!isSafe&&Math.abs(gx)<=3) {
        makeBox(scene,objects,{pos:[gx*grid,y+0.3,z+gz*grid],size:[3.8,0.15,3.8],color:"#ff1744",emissive:"#ff0033",type:"hazardTile",level:15});
      }
    }
  }
  z+=safePath[safePath.length-1][1]*grid-8;
  y+=0.3;
  cpBox(scene,objects,[0,y,z],16,"CHECKPOINT 16! END IS NEAR");
  makeFursuitHead(scene,-3.5,y+1.1,z,"#ff9de6");
  makeFursuitHead(scene,3.5,y+1.1,z,"#9ee7ff");
  z-=11;

  // SECTION 16 – moving platforms + cylinders
  makeSign(scene,"SECTION 16: CYLINDER HELL",0,y+3.2,z+2,5.8,1.2);
  for (var i=0;i<6;i++) {
    makeBox(scene,objects,{pos:[0,y,z],size:[5,0.58,5],color:"#ff9999",type:"solid",level:16,
      move:{axis:"x",distance:4.5,speed:1.5+i*0.1,phase:i*0.8}});
    makeCylinder(scene,hazards,{pos:[0,y+1,z-(i%2===0?1.5:-1.5)],radius:0.5,height:2.2,color:"#ff006e",level:16,spin:{axis:"y",speed:4+i*0.3}});
    z-=7; y+=0.1;
  }
  makeBox(scene,objects,{pos:[0,y,z],size:[9,0.65,7],color:PAL[2],type:"solid",level:16});
  z-=9;
  cpBox(scene,objects,[0,y,z],17,"CHECKPOINT 17! THREE MORE!");
  z-=11;

  // SECTION 17 – quad spinner arena
  makeSign(scene,"SECTION 17: QUAD SPINNER ARENA",0,y+3.2,z+2,6,1.2);
  makeBox(scene,objects,{pos:[0,y,z],size:[22,0.68,16],color:"#2dd4bf",type:"solid",level:17});
  var spinPos17=[[-5,-3],[5,-3],[-5,3],[5,3]];
  spinPos17.forEach(function(sp,si){
    makeTailSpinner(scene,hazards,{center:[sp[0],y+0.34,z+sp[1]],armLength:6,speed:(si%2===0?2.6:-2.8)+si*0.1,level:17,color:PAL[si]});
  });
  makeSign(scene,"FOUR TAILS. NO MERCY. UWU",0,y+4.2,z-6.5,6,1.1);
  z-=18; y+=0.4;
  for (var i=0;i<5;i++) {
    x=Math.cos(i*1.5)*4;
    makeBox(scene,objects,{pos:[x,y,z],size:[4,0.55,4],color:PAL[i],type:"solid",level:17,deco:true});
    z-=6; y+=0.15;
  }
  x=0;
  cpBox(scene,objects,[x,y,z],18,"CHECKPOINT 18! ALMOST!");
  z-=11;

  // SECTION 18 – everything combined
  makeSign(scene,"SECTION 18: THE FURRY FINALE",0,y+3.2,z+2,5.8,1.2);
  for (var i=0;i<5;i++) {
    var ax18=i%2===0?"x":"z";
    makeBox(scene,objects,{pos:[0,y,z],size:[6,0.6,5.5],color:PAL[i],type:"solid",level:18,
      move:{axis:ax18,distance:4,speed:1.7+i*0.12,phase:i*1.1}});
    if (i%2===0) makeBox(scene,objects,{pos:[4,y+0.4,z],size:[2,0.15,2],color:"#ff1744",emissive:"#ff0033",type:"hazardTile",level:18});
    makeSphere(scene,hazards,{pos:[-4,y+1.2,z],radius:0.8,color:"#ff4fc3",level:18,
      move:{axis:"x",distance:4.5,speed:1.9+i*0.1,phase:i*0.8+Math.PI}});
    z-=8; y+=0.12;
  }
  makeBox(scene,objects,{pos:[0,y,z],size:[9,0.65,7],color:PAL[7],type:"solid",level:18});
  z-=9;
  cpBox(scene,objects,[0,y,z],19,"CHECKPOINT 19! LAST HURDLE!!");
  z-=11;

  // SECTION 19 – final sprint + big bounce
  makeSign(scene,"SECTION 19: THE LAST STRETCH",0,y+3.2,z+2,5.8,1.2);
  var finColors=["#ffd700","#ff9de6","#9ee7ff","#b8ff9e","#d6a3ff","#ffb07c"];
  for (var i=0;i<6;i++) {
    x=Math.sin(i*2.2)*4;
    makeBox(scene,objects,{pos:[x,y,z],size:[3.8,0.55,3.8],color:finColors[i],type:"solid",level:19,deco:true});
    z-=5.8; y+=0.18;
  }
  x=0;
  makeBox(scene,objects,{pos:[x,y,z],size:[7,0.55,7],color:"#a855f7",emissive:"#5b21b6",type:"bounce",level:19,bounce:16});
  makeSign(scene,"LAST BOUNCE! GO GO GO!",x,y+3,z-3,5,1.1);
  z-=10; y+=4;

  // SECTION 20 / FINISH
  makeSign(scene,"SECTION 20: THE FINISH LINE!",0,y+3.6,z+2,6,1.2);
  makeBox(scene,objects,{pos:[0,y,z],size:[24,0.85,18],color:"#ffd700",emissive:"#8a6d00",type:"finish",level:20});
  makeSign(scene,"YOU ESCAPED THE UWU DIMENSION!!",0,y+4.8,z-6,8,1.5);
  makeSign(scene,"RAWR XD - YOU WIN, BESTIE!!",0,y+3.2,z-4.8,6.5,1.2);
  for (var i=0;i<6;i++) makeFursuitHead(scene,(i-2.5)*3.5,y+1.1,z,PAL[i]);
  for (var i=0;i<4;i++) makePawPrint(scene,(i-1.5)*5,y+0.43,z-5,i*0.9);
}

// ─── COLLISION HELPERS ───────────────────────────────────────────────────────
function getTopLanding(objects, prevY, nextY, nextX, nextZ, velY) {
  var feetPrev=prevY-PLAYER_HEIGHT, feetNext=nextY-PLAYER_HEIGHT;
  var best=null, bestTop=-Infinity;
  for (var i=0;i<objects.length;i++) {
    var obj=objects[i];
    if (obj.userData.type==="hazardTile") continue;
    var pos=obj.userData.pos, size=obj.userData.size;
    var top=pos[1]+size[1]/2;
    var inX=nextX+PLAYER_RADIUS>pos[0]-size[0]/2 && nextX-PLAYER_RADIUS<pos[0]+size[0]/2;
    var inZ=nextZ+PLAYER_RADIUS>pos[2]-size[2]/2 && nextZ-PLAYER_RADIUS<pos[2]+size[2]/2;
    if (!inX||!inZ) continue;
    if (feetPrev>=top-0.22 && feetNext<=top+0.3 && velY<=0.05 && top>bestTop) {
      best=obj; bestTop=top;
    }
  }
  return best;
}

function isLavaTile(objects, x, y, z) {
  for (var i=0;i<objects.length;i++) {
    var obj=objects[i];
    if (obj.userData.type!=="hazardTile") continue;
    var pos=obj.userData.pos, size=obj.userData.size;
    if (x+PLAYER_RADIUS>pos[0]-size[0]/2 && x-PLAYER_RADIUS<pos[0]+size[0]/2 &&
        z+PLAYER_RADIUS>pos[2]-size[2]/2 && z-PLAYER_RADIUS<pos[2]+size[2]/2 &&
        y-PLAYER_HEIGHT<pos[1]+size[1]/2+0.4 && y>pos[1]-size[1]/2) return true;
  }
  return false;
}

function isHazard(hazards, px, py, pz) {
  for (var i=0;i<hazards.length;i++) {
    var hz=hazards[i];
    if (hz.userData.type==="spinner") {
      var c=hz.position, ang=hz.rotation.y, len=hz.userData.armLength/2;
      var ax=c.x+Math.cos(ang)*-len, az=c.z+Math.sin(ang)*-len;
      var bx=c.x+Math.cos(ang)*len,  bz=c.z+Math.sin(ang)*len;
      if (py-PLAYER_HEIGHT<c.y+1.65 && py>c.y+0.35 &&
          distPtSeg2D(px,pz,ax,az,bx,bz)<PLAYER_RADIUS+0.4) return true;
    } else {
      var r=hz.userData.radius||0.6, h=hz.userData.height||r*2;
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
  const [flash,setFlash]=useState(null);
  const [toast,setToast]=useState(null);
  const toastRef=useRef(null);

  const showToast=useCallback(function(msg){
    setToast(msg); clearTimeout(toastRef.current);
    toastRef.current=setTimeout(function(){setToast(null);},2200);
  },[]);

  const triggerFlash=useCallback(function(type){
    setFlash(type); setTimeout(function(){setFlash(null);},type==="death"?450:650);
  },[]);

  useEffect(function(){
    var mount=mountRef.current; if (!mount) return;

    var scene=new THREE.Scene();
    scene.background=new THREE.Color("#9bdcff");
    scene.fog=new THREE.Fog("#9bdcff",28,200);
    var camera=new THREE.PerspectiveCamera(80,mount.clientWidth/mount.clientHeight,0.04,700);
    camera.rotation.order="YXZ";
    var renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});
    renderer.setSize(mount.clientWidth,mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    // Lights
    scene.add(new THREE.HemisphereLight("#ffe8fa","#9e5bbd",0.95));
    var sun=new THREE.DirectionalLight("#fff5f0",1.35);
    sun.position.set(20,40,18); sun.castShadow=true;
    sun.shadow.mapSize.width=sun.shadow.mapSize.height=2048;
    sun.shadow.camera.left=sun.shadow.camera.bottom=-100;
    sun.shadow.camera.right=sun.shadow.camera.top=100;
    scene.add(sun);
    var fill=new THREE.DirectionalLight("#c0e8ff",0.45);
    fill.position.set(-15,10,15); scene.add(fill);

    var objects=[], hazards=[];
    buildWorld(scene,objects,hazards);

    // Sky
    var sky=new THREE.Mesh(
      new THREE.SphereGeometry(350,32,18),
      new THREE.MeshBasicMaterial({color:"#d0b8ff",side:THREE.BackSide})
    );
    scene.add(sky);

    // Clouds
    var cloudMat=new THREE.MeshBasicMaterial({color:"#fff",transparent:true,opacity:0.62});
    var clouds=[];
    for (var ci=0;ci<65;ci++) {
      var cl=new THREE.Mesh(new THREE.SphereGeometry(2.5+Math.random()*3.2,10,7),cloudMat);
      cl.position.set(-90+Math.random()*180, 26+Math.random()*38, -20-Math.random()*700);
      cl.scale.set(2,0.48,1); scene.add(cl); clouds.push(cl);
    }

    // Player
    var SPAWN=new THREE.Vector3(0,2.3,2.5);
    var player={
      pos:SPAWN.clone(), vel:new THREE.Vector3(),
      yaw:0, pitch:0, grounded:false,
      checkpointPos:SPAWN.clone(), checkpointLevel:1, checkpointYaw:0,
      level:1, deaths:0, completed:false,
      startTime:performance.now(), finishedTime:null,
    };
    var keys={KeyW:false,KeyA:false,KeyS:false,KeyD:false,Space:false,ShiftLeft:false,ShiftRight:false};
    var rt={scene:scene,camera:camera,renderer:renderer,objects:objects,hazards:hazards,
      player:player,keys:keys,running:true,started:false,paused:false,locked:false,
      lastT:performance.now(),raf:null,lastHudUpdate:0};
    stateRef.current=rt;

    function respawn() {
      player.deaths++;
      player.pos.copy(player.checkpointPos);
      player.vel.set(0,0,0);
      player.yaw=player.checkpointYaw;
      player.pitch=0;
      player.grounded=false;
      triggerFlash("death");
      setHud(function(h){return Object.assign({},h,{deaths:player.deaths});});
    }

    function saveCheckpoint(platform) {
      var lvl=platform.userData.level;
      if (lvl<=player.checkpointLevel) return;
      player.checkpointLevel=lvl;
      var top=platform.position.y+platform.userData.size[1]/2;
      player.checkpointPos.set(platform.position.x, top+PLAYER_HEIGHT+0.12, platform.position.z+1.6);
      player.checkpointYaw=player.yaw;
      showToast("Checkpoint "+lvl+"/"+TOTAL_SECTIONS+" saved! NYA~");
      triggerFlash("check");
      setHud(function(h){return Object.assign({},h,{checkpoint:player.checkpointLevel,level:Math.max(h.level,lvl)});});
    }

    function onPLC() {
      rt.locked=document.pointerLockElement===renderer.domElement;
      setHud(function(h){return Object.assign({},h,{locked:rt.locked});});
    }
    function onMM(e) {
      if (!rt.locked||rt.paused||player.completed) return;
      player.yaw-=e.movementX*MOUSE_SENS;
      player.pitch=clamp(player.pitch-e.movementY*MOUSE_SENS,-1.3,1.3);
    }
    function onKD(e) {
      if (e.code in keys) keys[e.code]=true;
      if (e.code==="Escape") { rt.paused=true; document.exitPointerLock&&document.exitPointerLock(); setHud(function(h){return Object.assign({},h,{paused:true});}); }
      if (e.code==="KeyP") { rt.paused=!rt.paused; if (!rt.paused) renderer.domElement.requestPointerLock&&renderer.domElement.requestPointerLock(); setHud(function(h){return Object.assign({},h,{paused:rt.paused});}); }
      if (e.code==="KeyR") respawn();
    }
    function onKU(e) { if (e.code in keys) keys[e.code]=false; }
    function onClick() {
      if (!rt.locked&&!rt.paused&&!player.completed) {
        renderer.domElement.requestPointerLock&&renderer.domElement.requestPointerLock();
        rt.started=true;
        setHud(function(h){return Object.assign({},h,{started:true});});
      }
    }
    function onResize() {
      if (!mount) return;
      camera.aspect=mount.clientWidth/mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth,mount.clientHeight);
    }
    document.addEventListener("pointerlockchange",onPLC);
    document.addEventListener("mousemove",onMM);
    window.addEventListener("keydown",onKD);
    window.addEventListener("keyup",onKU);
    window.addEventListener("resize",onResize);
    renderer.domElement.addEventListener("click",onClick);

    function updateMovingObjects(t) {
      for (var i=0;i<objects.length;i++) {
        var obj=objects[i], mv=obj.userData.move; if (!mv) continue;
        var ox=obj.position.x, oy=obj.position.y, oz=obj.position.z;
        var base=obj.userData.basePos;
        var off=Math.sin(t*mv.speed+mv.phase)*mv.distance;
        if (mv.axis==="x") obj.position.x=base[0]+off;
        else if (mv.axis==="y") obj.position.y=base[1]+off;
        else obj.position.z=base[2]+off;
        obj.userData.pos=[obj.position.x,obj.position.y,obj.position.z];
        obj.userData.velX=obj.position.x-ox;
        obj.userData.velY=obj.position.y-oy;
        obj.userData.velZ=obj.position.z-oz;
      }
      for (var i=0;i<hazards.length;i++) {
        var hz=hazards[i];
        if (hz.userData.type==="spinner") {
          hz.userData.angle=(hz.userData.angle||0)+(hz.userData.speed||0)*0.016;
          hz.rotation.y=hz.userData.angle;
        }
        if (hz.userData.spin) hz.rotation[hz.userData.spin.axis]+=hz.userData.spin.speed*0.016;
        if (hz.userData.move) {
          var mv2=hz.userData.move, base2=hz.userData.basePos;
          var off2=Math.sin(t*mv2.speed+mv2.phase)*mv2.distance;
          if (mv2.axis==="x") hz.position.x=base2[0]+off2;
          else if (mv2.axis==="y") hz.position.y=base2[1]+off2;
          else hz.position.z=base2[2]+off2;
        }
      }
    }

    function updatePlayer(dt) {
      if (!rt.started||rt.paused||player.completed) return;
      var pos=player.pos, vel=player.vel;
      var fwd=new THREE.Vector3(-Math.sin(player.yaw),0,-Math.cos(player.yaw));
      var rgt=new THREE.Vector3( Math.cos(player.yaw),0,-Math.sin(player.yaw));
      var wish=new THREE.Vector3();
      if (keys.KeyW) wish.add(fwd);
      if (keys.KeyS) wish.sub(fwd);
      if (keys.KeyD) wish.add(rgt);
      if (keys.KeyA) wish.sub(rgt);
      if (wish.lengthSq()>0) wish.normalize();

      var maxSpd=(keys.ShiftLeft||keys.ShiftRight)?SPRINT_SPEED:WALK_SPEED;
      var ctrl=player.grounded?1:AIR_CONTROL;
      vel.x+=wish.x*maxSpd*GROUND_FRICTION*ctrl*dt;
      vel.z+=wish.z*maxSpd*GROUND_FRICTION*ctrl*dt;

      var hSpd=Math.hypot(vel.x,vel.z);
      if (hSpd>maxSpd) { vel.x*=maxSpd/hSpd; vel.z*=maxSpd/hSpd; }
      if (player.grounded&&wish.lengthSq()===0) { var damp=Math.max(0,1-GROUND_FRICTION*dt); vel.x*=damp; vel.z*=damp; }
      if (player.grounded&&keys.Space) { vel.y=JUMP_FORCE; player.grounded=false; }
      vel.y-=GRAVITY*dt;

      var subDt=dt/SUBSTEPS;
      for (var step=0;step<SUBSTEPS;step++) {
        var prevY=pos.y;
        var nx=pos.x+vel.x*subDt;
        var ny=pos.y+vel.y*subDt;
        var nz=pos.z+vel.z*subDt;

        var landed=getTopLanding(objects,prevY,ny,nx,nz,vel.y);
        if (landed) {
          var top=landed.position.y+landed.userData.size[1]/2;
          pos.set(nx, top+PLAYER_HEIGHT, nz);
          vel.y=0;
          player.grounded=true;
          // Match platform velocity so player doesn't get pushed off
          vel.x+=landed.userData.velX||0;
          vel.z+=landed.userData.velZ||0;
          var type=landed.userData.type, lvl=landed.userData.level;
          if (type==="checkpoint") saveCheckpoint(landed);
          if (type==="bounce") { vel.y=landed.userData.bounce||12; player.grounded=false; }
          if (type==="finish"&&!player.completed) {
            player.completed=true; player.finishedTime=(performance.now()-player.startTime)/1000;
            document.exitPointerLock&&document.exitPointerLock();
            setHud(function(h){return Object.assign({},h,{completed:true,locked:false,time:player.finishedTime,level:TOTAL_SECTIONS});});
          }
          player.level=Math.max(player.level,lvl);
        } else {
          pos.set(nx,ny,nz);
          player.grounded=false;
        }
      }

      if (isLavaTile(objects,pos.x,pos.y,pos.z)||isHazard(hazards,pos.x,pos.y,pos.z)) respawn();
      if (pos.y<WORLD_FLOOR_Y) respawn();

      camera.position.copy(pos);
      camera.rotation.y=player.yaw;
      camera.rotation.x=player.pitch;
    }

    function animate(now) {
      if (!rt.running) return;
      var dt=Math.min((now-rt.lastT)/1000,0.04); rt.lastT=now;
      updateMovingObjects(now/1000);
      updatePlayer(dt);
      sky.position.copy(camera.position);
      for (var ci=0;ci<clouds.length;ci++) clouds[ci].position.x+=Math.sin(now/1000*0.17+ci*0.7)*0.002;
      renderer.render(scene,camera);
      if (now-rt.lastHudUpdate>180) {
        rt.lastHudUpdate=now;
        var elapsed=player.completed&&player.finishedTime?player.finishedTime:(performance.now()-player.startTime)/1000;
        setHud(function(h){return Object.assign({},h,{level:Math.max(h.level,player.level),deaths:player.deaths,checkpoint:player.checkpointLevel,paused:rt.paused,locked:rt.locked,started:rt.started,time:elapsed,completed:player.completed});});
      }
      rt.raf=requestAnimationFrame(animate);
    }
    rt.raf=requestAnimationFrame(animate);

    return function(){
      rt.running=false; if (rt.raf) cancelAnimationFrame(rt.raf);
      document.removeEventListener("pointerlockchange",onPLC);
      document.removeEventListener("mousemove",onMM);
      window.removeEventListener("keydown",onKD);
      window.removeEventListener("keyup",onKU);
      window.removeEventListener("resize",onResize);
      renderer.domElement.removeEventListener("click",onClick);
      if (document.pointerLockElement===renderer.domElement&&document.exitPointerLock) document.exitPointerLock();
      renderer.dispose();
      scene.traverse(function(obj){
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          var mats=Array.isArray(obj.material)?obj.material:[obj.material];
          mats.forEach(function(m){if(m.map)m.map.dispose();m.dispose();});
        }
      });
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      stateRef.current=null; clearTimeout(toastRef.current);
    };
  },[showToast,triggerFlash]);

  function resumeGame() {
    var rt=stateRef.current; if (!rt) return;
    rt.paused=false;
    rt.renderer.domElement.requestPointerLock&&rt.renderer.domElement.requestPointerLock();
    setHud(function(h){return Object.assign({},h,{paused:false});});
  }

  function restartGame() {
    var rt=stateRef.current; if (!rt) return;
    var player=rt.player;
    var sp=new THREE.Vector3(0,2.3,2.5);
    player.pos.copy(sp); player.vel.set(0,0,0);
    player.yaw=0; player.pitch=0; player.grounded=false;
    player.checkpointPos.copy(sp); player.checkpointYaw=0;
    player.checkpointLevel=1; player.level=1; player.deaths=0;
    player.completed=false; player.startTime=performance.now(); player.finishedTime=null;
    rt.started=true; rt.paused=false;
    setHud({started:true,paused:false,locked:false,level:1,deaths:0,checkpoint:1,completed:false,time:0});
    rt.renderer.domElement.requestPointerLock&&rt.renderer.domElement.requestPointerLock();
  }

  function fmt(sec) {
    var s=Math.max(0,Math.floor(sec));
    return Math.floor(s/60)+":"+String(s%60).padStart(2,"0");
  }

  return (
    <div className="furry-obby-page">
      <div className="furry-obby-topbar">
        <div>
          <h1>🐾 Furry Obby: UwU Ascension</h1>
          <p>20-section first-person cringe platformer nightmare. NYA~</p>
        </div>
        <div className="furry-obby-actions">
          {onBack && <button type="button" onClick={onBack}>← Back</button>}
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

        {flash==="check" && <div key={"cf"+hud.checkpoint} className="furry-obby-checkpoint-flash" />}
        {flash==="death" && <div key={"df"+hud.deaths} className="furry-obby-death-flash" />}
        {toast && <div key={toast} className="furry-obby-toast">{toast}</div>}

        {!hud.started && (
          <div className="furry-obby-overlay">
            <div className="furry-obby-card">
              <h2>🐾 Furry Obby: UwU Ascension</h2>
              <p>20 cursed sections. Spinning fursuit tails, UWU lava, bounce pads, rolling orbs, and enough cringe to power a convention. Click to lock your mouse.</p>
              <div className="furry-obby-controls">
                <span>WASD · move</span><span>Mouse · look</span><span>Space · jump</span>
                <span>Shift · sprint</span><span>R · respawn</span><span>P / Esc · pause</span>
              </div>
              <button type="button" onClick={function(){
                var rt=stateRef.current; if (!rt) return;
                rt.started=true; rt.paused=false;
                rt.renderer.domElement.requestPointerLock&&rt.renderer.domElement.requestPointerLock();
                setHud(function(h){return Object.assign({},h,{started:true,paused:false});});
              }}>
                Enter the UwU Dimension 🐾
              </button>
            </div>
          </div>
        )}

        {hud.paused && !hud.completed && (
          <div className="furry-obby-overlay">
            <div className="furry-obby-card">
              <h2>⏸ Paused</h2>
              <p>The cringe awaits. Deaths: <strong>{hud.deaths}</strong></p>
              <button type="button" onClick={resumeGame}>Resume UwU</button>
            </div>
          </div>
        )}

        {hud.completed && (
          <div className="furry-obby-overlay">
            <div className="furry-obby-card victory">
              <h2>🏆 You Escaped!</h2>
              <p>You survived all 20 sections of the UwU Dimension.</p>
              <p>Time: <strong>{fmt(hud.time)}</strong> · Deaths: <strong>{hud.deaths}</strong></p>
              <button type="button" onClick={restartGame}>Run It Back 🐾</button>
            </div>
          </div>
        )}

        {!hud.locked && hud.started && !hud.paused && !hud.completed && (
          <div className="furry-obby-clickhint">Click the game to look around</div>
        )}
      </div>
    </div>
  );
}