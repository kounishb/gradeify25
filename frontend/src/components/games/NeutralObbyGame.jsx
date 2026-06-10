import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import "../../styles/NeutralObbyGame.css";

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

// At WALK_SPEED, a full jump (2*JF/G = 0.767s) covers ~5.75 units horizontal.
// At SPRINT_SPEED covers ~8.4 units.  All gaps must be reachable at WALK speed.
// Safe walk-jump gap (Z axis, same Y level) = 5.0 units.  Safe with slight Y drop = 5.5.
const SAFE_GAP  = 5.0;
const JUMP_APEX = (JUMP_FORCE * JUMP_FORCE) / (2 * GRAVITY); // ~1.76 units up

const clamp    = (n,lo,hi) => Math.max(lo, Math.min(hi, n));
const randFrom = arr => arr[Math.floor(Math.random()*arr.length)];
const PAL      = ["#3b82f6","#14b8a6","#22c55e","#f59e0b","#8b5cf6","#f97316","#ef4444","#06b6d4"];

function distPtSeg2D(px,pz,ax,az,bx,bz) {
  var abx=bx-ax, abz=bz-az, apx=px-ax, apz=pz-az;
  var lenSq=abx*abx+abz*abz;
  if (lenSq===0) return Math.hypot(px-ax,pz-az);
  var t=clamp((apx*abx+apz*abz)/lenSq,0,1);
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
  var W=1024, H=256;
  var cv=document.createElement("canvas");
  cv.width=W; cv.height=H;
  var ctx=cv.getContext("2d");
  var g=ctx.createLinearGradient(0,0,W,H);
  g.addColorStop(0,"rgba(37,99,235,0.97)");
  g.addColorStop(1,"rgba(14,165,233,0.95)");
  ctx.fillStyle=g;
  roundRect(ctx,6,6,W-12,H-12,26); ctx.fill();
  ctx.strokeStyle="rgba(255,255,255,0.75)"; ctx.lineWidth=9;
  roundRect(ctx,6,6,W-12,H-12,26); ctx.stroke();
  ctx.font="58px Arial, sans-serif";
  ctx.fillStyle="rgba(255,255,255,0.22)";
  ctx.fillText("◆",28,H-24);
  ctx.fillText("◆",W-74,48);
  var fs=text.length>22?54:text.length>16?62:70;
  ctx.font="900 "+fs+"px 'Arial Black',Arial,sans-serif";
  ctx.textAlign="center"; ctx.textBaseline="middle";
  ctx.strokeStyle="rgba(15,23,42,0.95)"; ctx.lineWidth=12;
  ctx.strokeText(text,W/2,H/2);
  ctx.fillStyle="#fff"; ctx.fillText(text,W/2,H/2);
  var t=new THREE.CanvasTexture(cv); t.needsUpdate=true;
  return t;
}

function makeSign(scene, text, px, py, pz, sw, sh) {
  sw=sw||5.5; sh=sh||1.2;
  var mat=new THREE.MeshBasicMaterial({map:makeSignTexture(text),transparent:true,side:THREE.DoubleSide});
  var mesh=new THREE.Mesh(new THREE.PlaneGeometry(sw,sh),mat);
  mesh.position.set(px,py,pz);
  scene.add(mesh);
  var pole=new THREE.Mesh(
    new THREE.CylinderGeometry(0.07,0.07,sh*0.7+0.4,8),
    new THREE.MeshStandardMaterial({color:"#fff",roughness:0.5})
  );
  pole.position.set(px,py-sh/2-0.12,pz);
  scene.add(pole);
}

// ─── BACKGROUND VISUALS ──────────────────────────────────────────────────
function makeBgRing(scene, cx, cy, cz, scale, color) {
  var g=new THREE.Group();
  var mat=new THREE.MeshBasicMaterial({color:color||"#38bdf8",side:THREE.DoubleSide,transparent:true,opacity:0.42});
  var ring=new THREE.Mesh(new THREE.TorusGeometry(1,0.12,8,28),mat);
  g.add(ring);
  for (var ti=0;ti<4;ti++) {
    var dot=new THREE.Mesh(new THREE.CircleGeometry(0.22,14),mat);
    var a=ti*Math.PI/2;
    dot.position.set(Math.cos(a)*1.45,Math.sin(a)*1.45,0);
    g.add(dot);
  }
  g.scale.set(scale,scale,scale);
  g.position.set(cx,cy,cz);
  g.userData={billboard:true};
  scene.add(g);
  return g;
}

function makeBgCloudCluster(scene, cx, cy, cz, r, color) {
  // cluster of overlapping spheres = cluster look
  var group=new THREE.Group();
  var mat=new THREE.MeshBasicMaterial({color:color,transparent:true,opacity:0.38});
  var count=6;
  for (var i=0;i<count;i++) {
    var angle=i/count*Math.PI*2;
    var s=new THREE.Mesh(new THREE.SphereGeometry(r*(0.7+Math.random()*0.5),10,7),mat);
    s.position.set(Math.cos(angle)*r*0.45, Math.sin(angle)*r*0.35, (Math.random()-0.5)*r*0.5);
    group.add(s);
  }
  var center=new THREE.Mesh(new THREE.SphereGeometry(r*0.8,10,7),mat);
  group.add(center);
  group.position.set(cx,cy,cz);
  scene.add(group);
  return group;
}

function makeBgHeart(scene, cx, cy, cz, scale, color) {
  // Heart from two spheres + cone
  var g=new THREE.Group();
  var mat=new THREE.MeshBasicMaterial({color:color||"#2563eb",transparent:true,opacity:0.45});
  var l=new THREE.Mesh(new THREE.SphereGeometry(0.6,12,8),mat);
  l.position.set(-0.45,0.35,0); g.add(l);
  var r=new THREE.Mesh(new THREE.SphereGeometry(0.6,12,8),mat);
  r.position.set(0.45,0.35,0); g.add(r);
  var body=new THREE.Mesh(new THREE.ConeGeometry(0.85,1.6,4),mat);
  body.rotation.z=Math.PI; body.position.set(0,-0.25,0); g.add(body);
  g.scale.set(scale,scale,scale);
  g.position.set(cx,cy,cz);
  scene.add(g);
  return g;
}

function makeBgStar(scene, cx, cy, cz, scale, color) {
  // Star from a ring of spikes
  var g=new THREE.Group();
  var mat=new THREE.MeshBasicMaterial({color:color||"#ffe18f",transparent:true,opacity:0.5});
  var spoke=5;
  for (var si=0;si<spoke;si++) {
    var ang=si/spoke*Math.PI*2 - Math.PI/2;
    var spike=new THREE.Mesh(new THREE.ConeGeometry(0.28,1.6,6),mat);
    spike.rotation.z=-ang;
    spike.position.set(Math.cos(ang)*0.7,Math.sin(ang)*0.7,0);
    g.add(spike);
  }
  var center=new THREE.Mesh(new THREE.SphereGeometry(0.55,10,7),mat);
  g.add(center);
  g.scale.set(scale,scale,scale);
  g.position.set(cx,cy,cz);
  scene.add(g);
  return g;
}

function buildBackground(scene, bgObjects) {
  // Scatter neutral background elements along the entire course length (~800 Z units)
  var bgPal=["#3b82f6","#2563eb","#6366f1","#ffe18f","#9ee7ff","#b8ff9e","#f97316","#38bdf8"];
  var rng=function(min,max){return min+Math.random()*(max-min);};

  for (var zi=0;zi>-800;zi-=18) {
    var side=Math.random()<0.5?-1:1;
    var type=Math.floor(Math.random()*4);
    var cx=side*(rng(20,55));
    var cy=rng(5,45);
    var cz=zi-rng(0,10);
    var col=bgPal[Math.floor(Math.random()*bgPal.length)];
    var obj;
    if (type===0) obj=makeBgRing(scene,cx,cy,cz,rng(4,10),col);
    else if (type===1) obj=makeBgCloudCluster(scene,cx,cy,cz,rng(3,8),col);
    else if (type===2) obj=makeBgHeart(scene,cx,cy,cz,rng(3,7),col);
    else obj=makeBgStar(scene,cx,cy,cz,rng(3,7),col);
    if (obj) bgObjects.push(obj);
  }

  // Big floating text signs in the sky
  var skyMessages=[
    "KEEP GOING", "WATCH YOUR STEP", "JUMP", "SPRINT", "CHECKPOINT AHEAD",
    "MOVING PLATFORM", "DODGE", "FOCUS", "ALMOST THERE", "STAY SHARP",
    "BOUNCE PAD", "LAVA ZONE", "SPINNER", "FINISH STRONG",
  ];
  for (var mi=0;mi<14;mi++) {
    var szc=rng(-80,80);
    var syc=rng(30,70);
    var szz=-mi*55-rng(10,40);
    makeSign(scene,skyMessages[mi%skyMessages.length],szc,syc,szz,rng(7,14),rng(2,3.5));
  }

  // Enormous sphere clusters very far out
  var deepCols=["#3b82f6","#6366f1","#9ee7ff","#ffe18f"];
  for (var di=0;di<20;di++) {
    makeBgCloudCluster(scene,
      (Math.random()<0.5?-1:1)*rng(60,120),
      rng(10,60),
      -di*38-20,
      rng(6,16),
      deepCols[di%4]
    );
  }
}

// ─── COURSE DECORATIONS ───────────────────────────────────────────────────────
function makeBeaconTower(parent, hx, hy, hz, color) {
  color=color||"#3b82f6";
  var g=new THREE.Group();
  var baseM=new THREE.MeshStandardMaterial({color:color,roughness:0.72,metalness:0.08});
  var trimM=new THREE.MeshStandardMaterial({color:"#f8fafc",roughness:0.5,metalness:0.12});
  var darkM=new THREE.MeshStandardMaterial({color:"#111827",roughness:0.45});
  var glowM=new THREE.MeshStandardMaterial({color:"#38bdf8",emissive:"#38bdf8",emissiveIntensity:0.5,roughness:0.35});

  var body=new THREE.Mesh(new THREE.CylinderGeometry(0.48,0.62,1.35,12),baseM);
  body.position.set(0,0.05,0); g.add(body);

  var top=new THREE.Mesh(new THREE.CylinderGeometry(0.72,0.72,0.18,16),trimM);
  top.position.set(0,0.82,0); g.add(top);

  var cap=new THREE.Mesh(new THREE.ConeGeometry(0.55,0.55,4),baseM);
  cap.position.set(0,1.18,0); cap.rotation.y=Math.PI/4; g.add(cap);

  var window1=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.34,0.04),darkM);
  window1.position.set(-0.18,0.22,0.5); g.add(window1);
  var window2=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.34,0.04),darkM);
  window2.position.set(0.18,0.22,0.5); g.add(window2);

  var beacon=new THREE.Mesh(new THREE.SphereGeometry(0.18,12,8),glowM);
  beacon.position.set(0,1.58,0); g.add(beacon);

  g.position.set(hx,hy,hz);
  parent.add(g);
  return g;
}

function makeFloorMarker(scene, cx, cy, cz, rot) {
  rot=rot||0;
  var g=new THREE.Group();
  var outerM=new THREE.MeshStandardMaterial({color:"#0f172a",roughness:0.65});
  var innerM=new THREE.MeshStandardMaterial({color:"#38bdf8",roughness:0.55,emissive:"#0ea5e9",emissiveIntensity:0.08});
  var outer=new THREE.Mesh(new THREE.CylinderGeometry(0.62,0.62,0.06,28),outerM); g.add(outer);
  var inner=new THREE.Mesh(new THREE.CylinderGeometry(0.42,0.42,0.07,28),innerM); inner.position.y=0.01; g.add(inner);
  var bar1=new THREE.Mesh(new THREE.BoxGeometry(1.05,0.08,0.12),innerM); bar1.position.y=0.05; g.add(bar1);
  var bar2=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.08,1.05),innerM); bar2.position.y=0.06; g.add(bar2);
  g.position.set(cx,cy,cz); g.rotation.y=rot;
  scene.add(g);
}

function makeSpinnerGate(scene, hazards, opts) {
  var center=opts.center, armLength=opts.armLength||7, speed=opts.speed||1.6;
  var level=opts.level||1, color=opts.color||"#2563eb";
  var g=new THREE.Group();
  g.position.set(center[0],center[1],center[2]);
  var poleM=new THREE.MeshStandardMaterial({color:"#fff",roughness:0.7});
  var pole=new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.2,2,12),poleM);
  pole.position.set(0,0.5,0); g.add(pole);
  var headColors=["#3b82f6","#9ee7ff","#b8ff9e","#ffe18f","#8b5cf6"];
  makeBeaconTower(g,0,2.2,0,randFrom(headColors));
  var armM=new THREE.MeshStandardMaterial({color:color,emissive:color,emissiveIntensity:0.22,roughness:0.85});
  var arm=new THREE.Mesh(new THREE.CylinderGeometry(0.24,0.12,armLength,14),armM);
  arm.rotation.z=Math.PI/2; arm.position.set(0,1.15,0); g.add(arm);
  var tipM=new THREE.MeshStandardMaterial({color:"#fff",emissive:"#e0f2fe",emissiveIntensity:0.22,roughness:0.9});
  var tipPositions=[armLength/2,-armLength/2];
  for (var ti=0;ti<tipPositions.length;ti++) {
    var tip=new THREE.Mesh(new THREE.SphereGeometry(0.6,14,10),tipM);
    tip.position.set(tipPositions[ti],1.15,0); g.add(tip);
  }
  g.userData={type:"spinner",level:level,armLength:armLength,speed:speed,angle:0};
  scene.add(g); hazards.push(g);
  return g;
}

// ─── PLATFORM / HAZARD MAKERS ────────────────────────────────────────────────
function makeBox(scene, objects, opts) {
  var name=opts.name||"p", pos=opts.pos, size=opts.size;
  var color=opts.color||"#3b82f6", type=opts.type||"solid", level=opts.level||1;
  var emissive=opts.emissive||"#000", roughness=opts.roughness||0.62;
  var bounce=opts.bounce||0, move=opts.move||null, deco=opts.deco||false;
  var mesh=new THREE.Mesh(
    new THREE.BoxGeometry(size[0],size[1],size[2]),
    new THREE.MeshStandardMaterial({color:color,emissive:emissive,roughness:roughness,metalness:0.04})
  );
  mesh.position.set(pos[0],pos[1],pos[2]);
  mesh.castShadow=true; mesh.receiveShadow=true;
  mesh.userData={name:name,type:type,level:level,
    pos:[pos[0],pos[1],pos[2]],basePos:[pos[0],pos[1],pos[2]],
    size:[size[0],size[1],size[2]],bounce:bounce,move:move,velX:0,velY:0,velZ:0};
  scene.add(mesh); objects.push(mesh);
  if (deco) makeFloorMarker(scene,pos[0],pos[1]+size[1]/2+0.01,pos[2],Math.random()*Math.PI*2);
  return mesh;
}

function makeSphere(scene, hazards, opts) {
  var pos=opts.pos, radius=opts.radius||0.75, color=opts.color||"#2563eb";
  var level=opts.level||1, move=opts.move||null;
  var m=new THREE.Mesh(new THREE.SphereGeometry(radius,18,14),
    new THREE.MeshStandardMaterial({color:color,emissive:color,emissiveIntensity:0.15,roughness:0.4}));
  m.position.set(pos[0],pos[1],pos[2]);
  m.userData={type:"sphere",level:level,radius:radius,move:move,basePos:[pos[0],pos[1],pos[2]]};
  scene.add(m); hazards.push(m);
}

function makeCylinder(scene, hazards, opts) {
  var pos=opts.pos, radius=opts.radius||0.5, height=opts.height||2;
  var color=opts.color||"#2563eb", level=opts.level||1, spin=opts.spin||null;
  var m=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,height,18),
    new THREE.MeshStandardMaterial({color:color,emissive:color,emissiveIntensity:0.18,roughness:0.35}));
  m.position.set(pos[0],pos[1],pos[2]);
  m.userData={type:"cylinder",level:level,radius:radius,height:height,spin:spin,basePos:[pos[0],pos[1],pos[2]]};
  scene.add(m); hazards.push(m);
}

function cpBox(scene, objects, pos, level, label) {
  makeBox(scene,objects,{name:"cp"+level,pos:pos,size:[12,0.7,10],
    color:"#60ffb5",emissive:"#0a4f36",type:"checkpoint",level:level});
  makeSign(scene,label,pos[0],pos[1]+3,pos[2]-4,6,1.2);
}

// ─── WORLD BUILDER ───────────────────────────────────────────────────────────
// Jump physics reference:
//   Walk jump range  ~5.7 units horizontal (same Y)
//   Sprint jump range ~8.3 units horizontal (same Y)
//   Each 1 unit of Y drop adds ~0.29 units of extra horizontal range
//   Keep all gaps <= 5.0 at same height so walk-only is always possible.
//   Use z -= 6.5 MAX for same-level straight jumps (platform sz=5 trailing edge to next leading edge = 6.5 - 5/2 - 5/2 = 1.5 gap, easily jumpable).
//   Actually gap = z_step - platform_depth.  With size[2]=5 and z-=6.5: gap = 6.5-5 = 1.5. With z-=7: gap=2. With z-=8: gap=3. z-=9.5: gap=4.5 (ok).

function buildWorld(scene, objects, hazards) {
  // Spawn pad
  makeBox(scene,objects,{name:"start",pos:[0,0,0],size:[14,0.7,14],color:"#3b82f6",type:"checkpoint",level:1});
  makeFloorMarker(scene,-2,0.36,0); makeFloorMarker(scene,2,0.36,-2,0.8);
  makeBeaconTower(scene,-4.5,1.1,-4.5,"#9ee7ff");
  makeBeaconTower(scene,4.5,1.1,-4.5,"#3b82f6");
  makeSign(scene,"SKYLINE OBBY: ASCENT RUN",0,3.2,-5.8,7,1.4);

  var z=-10, x=0, y=0;

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 1 – easy intro hops.
  // Platform size 5x5, gap 1.5 (z-=6.5), alternating ±2.2 X.
  // Diagonal dist = sqrt(4.4²+1.5²) = 4.6 → trivially jumpable.
  makeSign(scene,"SECTION 1: THE AWAKENING",0,y+3.2,z+2,5.5,1.2);
  for (var i=0;i<6;i++) {
    x=(i%2===0)?2.2:-2.2; y+=0.1;
    makeBox(scene,objects,{pos:[x,y,z],size:[5,0.6,5],color:PAL[i%8],type:"solid",level:1,deco:true});
    z-=6.5;
  }
  x=0; y+=0.1;
  cpBox(scene,objects,[x,y,z],2,"CHECKPOINT SAVED!");
  makeBeaconTower(scene,x-3.5,y+1,z-2,"#3b82f6");
  makeBeaconTower(scene,x+3.5,y+1,z-2,"#9ee7ff");
  z-=12;

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 2 – moving platforms (X only).
  // z-=7.5, platform 5.5 deep → gap 2.0 at CENTER position → fine.
  makeSign(scene,"SECTION 2: MOVING PLATFORMS",0,y+3.2,z+2,6,1.2);
  for (var i=0;i<5;i++) {
    makeBox(scene,objects,{pos:[0,y,z],size:[5.5,0.6,5.5],color:"#9ee7ff",type:"solid",level:2,
      move:{axis:"x",distance:4,speed:1.1+i*0.09,phase:i*1.3}});
    z-=7.5; y+=0.1;
  }
  // Static landing pad – no gap needed
  makeBox(scene,objects,{pos:[0,y,z],size:[10,0.65,8],color:PAL[2],type:"solid",level:2});
  z-=10;
  cpBox(scene,objects,[0,y,z],3,"CHECKPOINT 3 SAVED!");
  z-=12;

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 3 – first spinner arena then easy hops.
  makeSign(scene,"SECTION 3: SPINNER DANGER",0,y+3.2,z+2,5.8,1.2);
  makeBox(scene,objects,{pos:[0,y,z],size:[14,0.65,12],color:"#ffe18f",type:"solid",level:3});
  makeSpinnerGate(scene,hazards,{center:[0,y+0.33,z],armLength:8,speed:1.3,level:3,color:"#2563eb"});
  makeSign(scene,"DODGE THE SPINNER BAR",0,y+3.4,z-4,5.2,1.1);
  z-=14; y+=0.2;
  // Hops: size 4.8, gap = 7-4.8 = 2.2, alternating ±3 X
  // Diagonal = sqrt(6²+2.2²) = 6.4 → sprint jump (ok, sprint is natural by now)
  // But reduce X to ±2 so diagonal = sqrt(4²+2.2²) = 4.6 → walk fine
  for (var i=0;i<4;i++) {
    x=(i%2===0)?2:-2;
    makeBox(scene,objects,{pos:[x,y,z],size:[5,0.58,5],color:PAL[i],type:"solid",level:3,deco:true});
    z-=7; y+=0.05;
  }
  x=0;
  cpBox(scene,objects,[x,y,z],4,"SECTION 3 CLEAR!");
  makeBeaconTower(scene,x,y+1.1,z+1.5,"#8b5cf6");
  z-=12;

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 4 – bounce pads.  Landing pads are large, no tricky jumps.
  makeSign(scene,"SECTION 4: BOING BOING BOING",0,y+3.2,z+2,5.5,1.2);
  // Bounce pad, land 9 ahead. y+3.3 is the apex — landing pad at z-9 y+3.3.
  makeBox(scene,objects,{pos:[0,y,z],size:[7,0.55,7],color:"#6366f1",emissive:"#5b21b6",type:"bounce",level:4,bounce:14});
  makeSign(scene,"BOUNCE PAD",0,y+3,z-2.8,4.5,1.1);
  z-=9; y+=3.3;
  makeBox(scene,objects,{pos:[0,y,z],size:[10,0.65,8],color:PAL[4],type:"solid",level:4,deco:true});
  z-=10;
  // Second bounce
  makeBox(scene,objects,{pos:[0,y,z],size:[7,0.55,7],color:"#6366f1",emissive:"#5b21b6",type:"bounce",level:4,bounce:13.5});
  z-=9; y+=2.9;
  makeBox(scene,objects,{pos:[0,y,z],size:[10,0.65,8],color:PAL[0],type:"solid",level:4});
  z-=10;
  cpBox(scene,objects,[0,y,z],5,"BOUNCE SECTION COMPLETE!");
  z-=12;

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 5 – lava tiles.  Platforms size [8,0.62,6], lava on one side.
  // Gap between platforms = z_step - sz_Z = 9 - 6 = 3.0 → straight jump fine.
  // Alternating X only ±1.5 (small offset) so player doesn't need to jump diagonally.
  makeSign(scene,"SECTION 5: LAVA TILES",0,y+3.2,z+2,5.5,1.2);
  for (var i=0;i<5;i++) {
    var pz=z-i*9, px=(i%2===0)?-1.5:1.5;
    makeBox(scene,objects,{pos:[px,y,pz],size:[8,0.62,6],color:"#3b82f6",type:"solid",level:5});
    var lx=px+(i%2===0?2.4:-2.4);
    makeBox(scene,objects,{pos:[lx,y+0.38,pz],size:[2.4,0.2,2.4],color:"#ff1744",emissive:"#ff0033",type:"hazardTile",level:5});
  }
  // After last platform (i=4, pz=z-36), move z past it
  z-=36+8; y+=0.3;
  cpBox(scene,objects,[0,y,z],6,"LAVA SECTION CLEAR!");
  makeBeaconTower(scene,-3,y+1.1,z,"#ffe18f");
  makeBeaconTower(scene,3,y+1.1,z,"#b8ff9e");
  z-=12;

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 6 – narrow bridges + cylinders.
  // Bridge size [3,0.5,5.5], gap = 5.8-5.5 = 0.3 → basically touching.
  // X offset uses sin pattern, max ~3 → diag = sqrt(6²+0.3²) = 6 → sprint jump.
  // Reduce X offset to max ±2 and gap to 5.5 (sz 5.5 step 5.8 → gap 0.3) so no jump needed at all.
  makeSign(scene,"SECTION 6: SKINNY BRIDGES",0,y+3.2,z+2,5.8,1.2);
  var lastBx=0;
  for (var i=0;i<6;i++) {
    var bx=Math.sin(i*1.3)*2.2; // max ±2.2 X offset
    makeBox(scene,objects,{pos:[bx,y,z],size:[3,0.5,5.5],color:"#fff",type:"solid",level:6,deco:true});
    if (i%2===0) makeCylinder(scene,hazards,{pos:[bx+2.2,y+0.95,z],radius:0.44,height:1.9,color:"#ef4444",level:6,spin:{axis:"y",speed:3.5}});
    // Overlap bridges slightly so the gap is never a falling hazard
    // z step = 5.2 < bridge depth 5.5 → bridges overlap → no gap needed
    z-=5.2; y+=0.06; lastBx=bx;
  }
  makeBox(scene,objects,{pos:[0,y,z],size:[10,0.65,8],color:PAL[3],type:"solid",level:6});
  z-=10;
  cpBox(scene,objects,[0,y,z],7,"BRIDGES COMPLETE!");
  z-=12;

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 7 – double spinners + straightforward hops off the end.
  makeSign(scene,"SECTION 7: DOUBLE SPINNER CHAOS",0,y+3.2,z+2,5.8,1.2);
  makeBox(scene,objects,{pos:[0,y,z],size:[18,0.68,14],color:"#2dd4bf",type:"solid",level:7});
  makeSpinnerGate(scene,hazards,{center:[-3,y+0.34,z],armLength:7.5,speed:1.9,level:7,color:"#2563eb"});
  makeSpinnerGate(scene,hazards,{center:[3,y+0.34,z],armLength:7.5,speed:-2.1,level:7,color:"#6366f1"});
  makeSign(scene,"DOUBLE SPINNER ATTACK!",0,y+4,z-5,5.2,1.1);
  z-=16; y+=0.3;
  // Exit hops: size 4, gap = 7-4 = 3 → fine. X swings ±3 (diag=sqrt(6²+3²)=6.7, sprint jump)
  // Reduce to ±2 for walk safety: diag=sqrt(4²+3²)=5.0 → walk borderline → keep sprint required but manageable
  for (var i=0;i<5;i++) {
    x=Math.sin(i*1.9)*3;
    makeBox(scene,objects,{pos:[x,y,z],size:[4.5,0.55,4.5],color:PAL[(i+2)%8],type:"solid",level:7,deco:true});
    z-=7; y+=0.1;
  }
  x=0;
  cpBox(scene,objects,[x,y,z],8,"TWO SPINNERS BEATEN!");
  z-=12;

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 8 – moving platforms + sphere hazards. Same-Z platforms, sphere passes.
  makeSign(scene,"SECTION 8: DODGE AND HOP TIME",0,y+3.2,z+2,5.5,1.2);
  for (var i=0;i<5;i++) {
    var ph=i*0.9;
    var axis8=i%2===0?"x":"z";
    // Platform size 5.5, z step 7.5 → gap 2.0 → walk fine
    makeBox(scene,objects,{pos:[0,y,z],size:[5.5,0.58,5.5],color:"#9ee7ff",type:"solid",level:8,
      move:{axis:axis8,distance:3.5,speed:1.3+i*0.09,phase:ph}});
    makeSphere(scene,hazards,{pos:[i%2===0?-5:0,y+1.2,z],radius:0.8,color:"#2563eb",level:8,
      move:{axis:axis8,distance:4.5,speed:1.5+i*0.09,phase:ph+Math.PI}});
    z-=7.5; y+=0.08;
  }
  makeBox(scene,objects,{pos:[0,y,z],size:[10,0.65,8],color:PAL[5],type:"solid",level:8});
  z-=10;
  cpBox(scene,objects,[0,y,z],9,"ORBS DODGED! ");
  makeBeaconTower(scene,0,y+1.1,z+1,"#3b82f6");
  z-=12;

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 9 – moving + lava combo. Lava always on the SAME side (right) so
  // player learns to hug the left. Platform size [7,0.6,6], z step 8 → gap 2.
  makeSign(scene,"SECTION 9: MOVING LAVA CHAOS",0,y+3.2,z+2,5.8,1.2);
  for (var i=0;i<4;i++) {
    makeBox(scene,objects,{pos:[0,y,z],size:[7,0.6,6],color:"#f97316",type:"solid",level:9,
      move:{axis:"x",distance:3.5,speed:1.4+i*0.1,phase:i*1.5}});
    // Lava at fixed world pos so it doesn't track with platform – forces timing
    makeBox(scene,objects,{pos:[4,y+0.38,z],size:[2,0.2,2],color:"#ff1744",emissive:"#ff0033",type:"hazardTile",level:9});
    z-=8; y+=0.1;
  }
  makeBox(scene,objects,{pos:[0,y,z],size:[10,0.65,8],color:PAL[4],type:"solid",level:9});
  z-=10;
  cpBox(scene,objects,[0,y,z],10,"LAVA + MOVING?? NICE SAVE!!!");
  z-=12;

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 10 – triple spinner arena.
  makeSign(scene,"SECTION 10: SPINNER GAUNTLET",0,y+3.2,z+2,5.8,1.2);
  makeBox(scene,objects,{pos:[0,y,z],size:[22,0.68,16],color:"#ffe18f",type:"solid",level:10});
  makeSpinnerGate(scene,hazards,{center:[-4.5,y+0.34,z],armLength:8,speed:2.1,level:10,color:"#2563eb"});
  makeSpinnerGate(scene,hazards,{center:[4.5,y+0.34,z],armLength:8,speed:-2.3,level:10,color:"#9ee7ff"});
  makeSpinnerGate(scene,hazards,{center:[0,y+0.34,z-5.5],armLength:7,speed:2.6,level:10,color:"#b8ff9e"});
  makeSign(scene,"TRIPLE SPINNER TERROR!",0,y+4,z-7,5.5,1.1);
  z-=18; y+=0.4;
  // Straight hops off arena: size 4.5, z-=7 → gap 2.5. X alternating ±2 (diag 5.4 → sprint ok)
  for (var i=0;i<4;i++) {
    x=(i%2===0)?2:-2;
    makeBox(scene,objects,{pos:[x,y,z],size:[4.5,0.55,4.5],color:PAL[i],type:"solid",level:10,deco:true});
    z-=7; y+=0.08;
  }
  x=0;
  cpBox(scene,objects,[x,y,z],11,"SECTION 10 CLEAR! CLEAR!!!");
  z-=12;

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 11 – tiny platform hops + moving spheres.
  // Platform 3.5x3.5, step 6 → gap 2.5. X offset uses sin, max ±3.5.
  // Diag when X jumps ±7: sqrt(7²+2.5²)=7.4 → too far. Reduce to ±2: sqrt(4²+2.5²)=4.7 → walk fine.
  makeSign(scene,"SECTION 11: TINY PLATFORM CHAOS",0,y+3.2,z+2,5.8,1.2);
  for (var i=0;i<7;i++) {
    x=Math.sin(i*1.4)*2.5; // max ±2.5
    makeBox(scene,objects,{pos:[x,y,z],size:[3.5,0.52,3.5],color:PAL[i%8],type:"solid",level:11,deco:true});
    makeSphere(scene,hazards,{pos:[x+(i%2===0?3:-3),y+1.1,z],radius:0.65,color:"#6366f1",level:11,
      move:{axis:"x",distance:2.5,speed:1.6+i*0.07,phase:i*0.9}});
    z-=6; y+=0.07;
  }
  makeBox(scene,objects,{pos:[0,y,z],size:[10,0.65,7],color:PAL[3],type:"solid",level:11});
  z-=10;
  cpBox(scene,objects,[0,y,z],12,"TINY PLATFORMS CLEAR!");
  z-=12;

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 12 – big bounce + spinner on landing.
  makeSign(scene,"SECTION 12: MEGA BOUNCE",0,y+3.2,z+2,5.8,1.2);
  makeBox(scene,objects,{pos:[0,y,z],size:[8,0.55,8],color:"#6366f1",emissive:"#5b21b6",type:"bounce",level:12,bounce:15});
  makeSign(scene,"MEGA BOUNCE TIME",0,y+3,z-3.5,5,1.1);
  z-=10; y+=3.8;
  makeBox(scene,objects,{pos:[0,y,z],size:[13,0.65,11],color:"#3b82f6",type:"solid",level:12});
  makeSpinnerGate(scene,hazards,{center:[0,y+0.34,z],armLength:9,speed:1.9,level:12,color:"#2563eb"});
  z-=13; y+=0.3;
  makeBox(scene,objects,{pos:[0,y,z],size:[10,0.65,8],color:PAL[6],type:"solid",level:12});
  z-=10;
  cpBox(scene,objects,[0,y,z],13,"BOUNCED INTO SECTION 13! W");
  z-=12;

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 13 – staircase.  Each step is 0.45 units higher, step Z 5.5, platform 4.5 deep.
  // Gap along Z: 5.5-4.5=1. Y rise: 0.45. Horizontal needed: sqrt(1²) ~ 1. Trivially fine.
  makeSign(scene,"SECTION 13: STAIRCASE OF DOOM",0,y+3.2,z+2,5.8,1.2);
  for (var i=0;i<7;i++) {
    var sx13=(i%2===0)?2:-2; y+=0.45;
    makeBox(scene,objects,{pos:[sx13,y,z],size:[5,0.55,4.5],color:PAL[i%8],type:"solid",level:13,deco:true});
    if (i===2||i===5) makeSpinnerGate(scene,hazards,{center:[sx13,y+0.28,z],armLength:5,speed:2.1+i*0.1,level:13,color:PAL[(i+3)%8]});
    z-=5.5;
  }
  makeBox(scene,objects,{pos:[0,y,z],size:[10,0.65,8],color:PAL[1],type:"solid",level:13});
  z-=10;
  cpBox(scene,objects,[0,y,z],14,"STAIRWAY CLEAR!");
  z-=12;

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 14 – Z-axis moving platforms.
  // Platform 5.5x5.5, z step 8 → gap 2.5. Platform moves ±3 on Z so sometimes closer.
  // Stationary position is center (0 offset at phase start); gap always 2.5 → walk fine.
  makeSign(scene,"SECTION 14: WAVY PLATFORMS",0,y+3.2,z+2,5.8,1.2);
  for (var i=0;i<5;i++) {
    makeBox(scene,objects,{pos:[(i%2===0)?2.5:-2.5,y,z],size:[5.5,0.6,5.5],color:"#99ffee",type:"solid",level:14,
      move:{axis:"z",distance:3,speed:1.2+i*0.1,phase:i*1.2}});
    z-=8; y+=0.09;
  }
  makeBox(scene,objects,{pos:[0,y,z],size:[10,0.65,8],color:PAL[5],type:"solid",level:14});
  z-=10;
  cpBox(scene,objects,[0,y,z],15,"WAVY CHECKPOINT!");
  z-=12;

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 15 – lava maze with gold safe path.
  // Grid spacing 4.5, platform size 4 → gap 0.5 → player walks straight, no jumping.
  makeSign(scene,"SECTION 15: LAVA MAZE",0,y+3.2,z+2,5.8,1.2);
  // Safe path: simple right-then-forward zigzag (easy to read visually)
  var safePath=[
    [0,0],[1,0],[2,0],[2,-1],[2,-2],[1,-2],[0,-2],[0,-3],[0,-4],[-1,-4],[-2,-4]
  ];
  var grid=4.8;
  for (var pi=0;pi<safePath.length;pi++) {
    makeBox(scene,objects,{pos:[safePath[pi][0]*grid,y,z+safePath[pi][1]*grid],
      size:[4.2,0.6,4.2],color:"#ffd700",type:"solid",level:15,deco:true});
  }
  // Lava fills adjacent squares
  for (var gx=-3;gx<=3;gx++) {
    for (var gz=0;gz>=-5;gz--) {
      var isSafe=false;
      for (var pi=0;pi<safePath.length;pi++){if(safePath[pi][0]===gx&&safePath[pi][1]===gz){isSafe=true;break;}}
      if (!isSafe) {
        makeBox(scene,objects,{pos:[gx*grid,y+0.3,z+gz*grid],size:[4.0,0.15,4.0],
          color:"#ff1744",emissive:"#ff0033",type:"hazardTile",level:15});
      }
    }
  }
  // Advance z to end of maze
  var mazeEndGx=safePath[safePath.length-1][0];
  var mazeEndGz=safePath[safePath.length-1][1];
  z+=mazeEndGz*grid-10;
  x=mazeEndGx*grid;
  y+=0.3;
  cpBox(scene,objects,[x,y,z],16,"MAZE CONQUERED!");
  makeBeaconTower(scene,x-4,y+1.1,z,"#3b82f6");
  makeBeaconTower(scene,x+4,y+1.1,z,"#9ee7ff");
  x=0; z-=12;

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 16 – moving + cylinders.
  // Platform 5.5x5.5, step 8 → gap 2.5. Walk fine. Cylinders float beside, not ON, path.
  makeSign(scene,"SECTION 16: CYLINDER GAUNTLET",0,y+3.2,z+2,5.8,1.2);
  for (var i=0;i<6;i++) {
    makeBox(scene,objects,{pos:[0,y,z],size:[5.5,0.58,5.5],color:"#ff9999",type:"solid",level:16,
      move:{axis:"x",distance:4,speed:1.4+i*0.09,phase:i*0.8}});
    // Cylinder beside (offset Z so it's not blocking the landing pad center)
    makeCylinder(scene,hazards,{pos:[0,y+1,z+(i%2===0?2.2:-2.2)],radius:0.48,height:2.2,color:"#ef4444",level:16,spin:{axis:"y",speed:3.8+i*0.25}});
    z-=8; y+=0.09;
  }
  makeBox(scene,objects,{pos:[0,y,z],size:[10,0.65,8],color:PAL[2],type:"solid",level:16});
  z-=10;
  cpBox(scene,objects,[0,y,z],17,"CYLINDERS CLEAR!");
  z-=12;

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 17 – quad spinner arena.  Big platform so player has lots of room.
  makeSign(scene,"SECTION 17: QUAD SPINNER ARENA",0,y+3.2,z+2,6,1.2);
  makeBox(scene,objects,{pos:[0,y,z],size:[24,0.68,18],color:"#2dd4bf",type:"solid",level:17});
  var sp17=[[-5.5,-3.5],[5.5,-3.5],[-5.5,3.5],[5.5,3.5]];
  for (var si=0;si<sp17.length;si++) {
    makeSpinnerGate(scene,hazards,{center:[sp17[si][0],y+0.34,z+sp17[si][1]],armLength:6,
      speed:(si%2===0?2.4:-2.6)+si*0.08,level:17,color:PAL[si]});
  }
  makeSign(scene,"FOUR SPINNERS. NO MERCY.",0,y+4.5,z-7,6,1.1);
  z-=20; y+=0.4;
  // Exit: straight hops, step 7.5, size 4.5 → gap 3. Walk fine.
  for (var i=0;i<5;i++) {
    x=(i%2===0)?2:-2;
    makeBox(scene,objects,{pos:[x,y,z],size:[5,0.55,5],color:PAL[i],type:"solid",level:17,deco:true});
    z-=7.5; y+=0.12;
  }
  x=0;
  cpBox(scene,objects,[x,y,z],18,"FOUR SPINNERS CLEARED!");
  z-=12;

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 18 – everything combined. Platform 6.5x6, step 9 → gap 3. X move only.
  makeSign(scene,"SECTION 18: THE FINAL COMBO",0,y+3.2,z+2,5.8,1.2);
  for (var i=0;i<5;i++) {
    var ax18=i%2===0?"x":"z";
    makeBox(scene,objects,{pos:[0,y,z],size:[6.5,0.6,6],color:PAL[i],type:"solid",level:18,
      move:{axis:ax18,distance:3.5,speed:1.6+i*0.1,phase:i*1.1}});
    // Lava tile on fixed right side, avoidable by walking left
    if (i%2===0) makeBox(scene,objects,{pos:[4.5,y+0.4,z],size:[2,0.15,2],
      color:"#ff1744",emissive:"#ff0033",type:"hazardTile",level:18});
    makeSphere(scene,hazards,{pos:[-5,y+1.2,z],radius:0.8,color:"#2563eb",level:18,
      move:{axis:"x",distance:4,speed:1.8+i*0.09,phase:i*0.8+Math.PI}});
    z-=9; y+=0.1;
  }
  makeBox(scene,objects,{pos:[0,y,z],size:[10,0.65,8],color:PAL[7],type:"solid",level:18});
  z-=10;
  cpBox(scene,objects,[0,y,z],19,"SECTION 18 CLEAR! ONE MORE!!");
  z-=12;

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 19 – final sprint: generous platforms, fun X weave, big bounce to finish.
  makeSign(scene,"SECTION 19: THE LAST STRETCH",0,y+3.2,z+2,5.8,1.2);
  var finColors=["#ffd700","#3b82f6","#9ee7ff","#b8ff9e","#8b5cf6","#f97316"];
  for (var i=0;i<6;i++) {
    // Platform 5x5, step 7 → gap 2. X offset alternating ±2 (diag 5.4, sprint fine)
    x=(i%2===0)?2.5:-2.5;
    makeBox(scene,objects,{pos:[x,y,z],size:[5,0.55,5],color:finColors[i],type:"solid",level:19,deco:true});
    z-=7; y+=0.15;
  }
  x=0;
  // Generous bounce pad, big landing above
  makeBox(scene,objects,{pos:[x,y,z],size:[8,0.55,8],color:"#6366f1",emissive:"#5b21b6",type:"bounce",level:19,bounce:16});
  makeSign(scene,"LAST BOUNCE! GO GO GO!",x,y+3,z-3.5,5.2,1.1);
  z-=10; y+=4.2;

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 20 / FINISH – enormous gold platform
  makeSign(scene,"SECTION 20: FINISH LINE!!!",0,y+4,z+2,6.5,1.3);
  makeBox(scene,objects,{pos:[0,y,z],size:[26,0.85,20],color:"#ffd700",emissive:"#8a6d00",type:"finish",level:20});
  makeSign(scene,"YOU CLEARED THE COURSE!",0,y+5.5,z-7,8,1.6);
  makeSign(scene,"CONGRATULATIONS!",0,y+3.6,z-5.5,7,1.3);
  for (var i=0;i<7;i++) makeBeaconTower(scene,(i-3)*3.5,y+1.1,z,PAL[i%8]);
  for (var i=0;i<5;i++) makeFloorMarker(scene,(i-2)*5,y+0.44,z-6,i*0.7);
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
export default function NeutralObbyGame({onBack}) {
  var mountRef=useRef(null);
  var stateRef=useRef(null);
  var [hud,setHud]=useState({started:false,paused:false,locked:false,level:1,deaths:0,checkpoint:1,completed:false,time:0});
  var [flash,setFlash]=useState(null);
  var [toast,setToast]=useState(null);
  var toastRef=useRef(null);

  var showToast=useCallback(function(msg){
    setToast(msg); clearTimeout(toastRef.current);
    toastRef.current=setTimeout(function(){setToast(null);},2200);
  },[]);
  var triggerFlash=useCallback(function(type){
    setFlash(type); setTimeout(function(){setFlash(null);},type==="death"?450:650);
  },[]);

  useEffect(function(){
    var mount=mountRef.current; if (!mount) return;

    var scene=new THREE.Scene();
    scene.background=new THREE.Color("#bfe8ff"); // vivid purple sky
    scene.fog=new THREE.Fog("#bfe8ff",35,220);
    var camera=new THREE.PerspectiveCamera(80,mount.clientWidth/mount.clientHeight,0.04,700);
    camera.rotation.order="YXZ";
    var renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});
    renderer.setSize(mount.clientWidth,mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight("#e0f2fe","#64748b",1.0));
    var sun=new THREE.DirectionalLight("#ffffff",1.35);
    sun.position.set(20,40,18); sun.castShadow=true;
    sun.shadow.mapSize.width=sun.shadow.mapSize.height=2048;
    sun.shadow.camera.left=sun.shadow.camera.bottom=-110;
    sun.shadow.camera.right=sun.shadow.camera.top=110;
    scene.add(sun);
    var fill=new THREE.DirectionalLight("#93c5fd",0.45); fill.position.set(-15,10,15); scene.add(fill);

    var objects=[], hazards=[], bgObjects=[];
    buildWorld(scene,objects,hazards);
    buildBackground(scene,bgObjects);

    // Sky dome — bright pink-purple gradient effect
    var sky=new THREE.Mesh(new THREE.SphereGeometry(380,32,18),
      new THREE.MeshBasicMaterial({color:"#d8f3ff",side:THREE.BackSide}));
    scene.add(sky);

    // Fluffy sphere clouds
    var clouds=[];
    var cloudColors=["#fff","#f8fafc","#eef6ff","#e8f8ff"];
    for (var ci=0;ci<50;ci++) {
      var ccol=cloudColors[ci%4];
      var cmat=new THREE.MeshBasicMaterial({color:ccol,transparent:true,opacity:0.55+Math.random()*0.2});
      // Each cloud = cluster of 3-4 spheres
      var cg=new THREE.Group();
      var ccount=3+Math.floor(Math.random()*3);
      for (var cc=0;cc<ccount;cc++) {
        var cs=new THREE.Mesh(new THREE.SphereGeometry(2.5+Math.random()*2.5,10,7),cmat);
        cs.position.set((Math.random()-0.5)*5,(Math.random()-0.5)*2,(Math.random()-0.5)*3);
        cg.add(cs);
      }
      cg.position.set(-90+Math.random()*180, 24+Math.random()*36, -20-Math.random()*750);
      scene.add(cg); clouds.push(cg);
    }

    var SPAWN=new THREE.Vector3(0,2.3,2.5);
    var player={pos:SPAWN.clone(),vel:new THREE.Vector3(),
      yaw:0,pitch:0,grounded:false,
      checkpointPos:SPAWN.clone(),checkpointLevel:1,checkpointYaw:0,
      level:1,deaths:0,completed:false,
      startTime:performance.now(),finishedTime:null};
    var keys={KeyW:false,KeyA:false,KeyS:false,KeyD:false,Space:false,ShiftLeft:false,ShiftRight:false};
    var rt={scene:scene,camera:camera,renderer:renderer,objects:objects,hazards:hazards,
      player:player,keys:keys,running:true,started:false,paused:false,locked:false,
      lastT:performance.now(),raf:null,lastHudUpdate:0};
    stateRef.current=rt;

    function respawn() {
      player.deaths++;
      player.pos.copy(player.checkpointPos);
      player.vel.set(0,0,0);
      player.yaw=player.checkpointYaw; player.pitch=0; player.grounded=false;
      triggerFlash("death");
      setHud(function(h){return Object.assign({},h,{deaths:player.deaths});});
    }
    function saveCheckpoint(platform) {
      var lvl=platform.userData.level;
      if (lvl<=player.checkpointLevel) return;
      player.checkpointLevel=lvl;
      var top=platform.position.y+platform.userData.size[1]/2;
      player.checkpointPos.set(platform.position.x,top+PLAYER_HEIGHT+0.12,platform.position.z+2);
      player.checkpointYaw=player.yaw;
      showToast("Checkpoint "+lvl+"/"+TOTAL_SECTIONS+" saved!");
      triggerFlash("check");
      setHud(function(h){return Object.assign({},h,{checkpoint:player.checkpointLevel,level:Math.max(h.level,lvl)});});
    }

    function onPLC(){rt.locked=document.pointerLockElement===renderer.domElement;setHud(function(h){return Object.assign({},h,{locked:rt.locked});});}
    function onMM(e){if(!rt.locked||rt.paused||player.completed)return;player.yaw-=e.movementX*MOUSE_SENS;player.pitch=clamp(player.pitch-e.movementY*MOUSE_SENS,-1.3,1.3);}
    function onKD(e){
      // Prevent page scroll for game keys when locked
      if(rt.locked&&(e.code==="Space"||e.code==="KeyW"||e.code==="KeyS"||e.code==="ArrowUp"||e.code==="ArrowDown")){e.preventDefault();}
      if(e.code in keys) keys[e.code]=true;
      if(e.code==="Escape"){rt.paused=true;document.exitPointerLock&&document.exitPointerLock();setHud(function(h){return Object.assign({},h,{paused:true});});}
      if(e.code==="KeyP"){rt.paused=!rt.paused;if(!rt.paused)renderer.domElement.requestPointerLock&&renderer.domElement.requestPointerLock();setHud(function(h){return Object.assign({},h,{paused:rt.paused});});}
      if(e.code==="KeyR") respawn();
    }
    function onKU(e){if(e.code in keys)keys[e.code]=false;}
    function onClick(){if(!rt.locked&&!rt.paused&&!player.completed){renderer.domElement.requestPointerLock&&renderer.domElement.requestPointerLock();rt.started=true;setHud(function(h){return Object.assign({},h,{started:true});});}}
    function onResize(){if(!mount)return;camera.aspect=mount.clientWidth/mount.clientHeight;camera.updateProjectionMatrix();renderer.setSize(mount.clientWidth,mount.clientHeight);}

    document.addEventListener("pointerlockchange",onPLC);
    document.addEventListener("mousemove",onMM);
    window.addEventListener("keydown",onKD);
    window.addEventListener("keyup",onKU);
    window.addEventListener("resize",onResize);
    renderer.domElement.addEventListener("click",onClick);

    function updateMovingObjects(t) {
      for (var i=0;i<objects.length;i++) {
        var obj=objects[i], mv=obj.userData.move; if(!mv) continue;
        var ox=obj.position.x, oy=obj.position.y, oz=obj.position.z;
        var base=obj.userData.basePos;
        var off=Math.sin(t*mv.speed+mv.phase)*mv.distance;
        if(mv.axis==="x") obj.position.x=base[0]+off;
        else if(mv.axis==="y") obj.position.y=base[1]+off;
        else obj.position.z=base[2]+off;
        obj.userData.pos=[obj.position.x,obj.position.y,obj.position.z];
        obj.userData.velX=obj.position.x-ox;
        obj.userData.velY=obj.position.y-oy;
        obj.userData.velZ=obj.position.z-oz;
      }
      for (var i=0;i<hazards.length;i++) {
        var hz=hazards[i];
        if(hz.userData.type==="spinner"){hz.userData.angle=(hz.userData.angle||0)+(hz.userData.speed||0)*0.016;hz.rotation.y=hz.userData.angle;}
        if(hz.userData.spin) hz.rotation[hz.userData.spin.axis]+=hz.userData.spin.speed*0.016;
        if(hz.userData.move){
          var mv2=hz.userData.move,base2=hz.userData.basePos;
          var off2=Math.sin(t*mv2.speed+mv2.phase)*mv2.distance;
          if(mv2.axis==="x") hz.position.x=base2[0]+off2;
          else if(mv2.axis==="y") hz.position.y=base2[1]+off2;
          else hz.position.z=base2[2]+off2;
        }
      }
    }

    function updatePlayer(dt) {
      if(!rt.started||rt.paused||player.completed) return;
      var pos=player.pos, vel=player.vel;
      var fwd=new THREE.Vector3(-Math.sin(player.yaw),0,-Math.cos(player.yaw));
      var rgt=new THREE.Vector3(Math.cos(player.yaw),0,-Math.sin(player.yaw));
      var wish=new THREE.Vector3();
      if(keys.KeyW) wish.add(fwd);
      if(keys.KeyS) wish.sub(fwd);
      if(keys.KeyD) wish.add(rgt);
      if(keys.KeyA) wish.sub(rgt);
      if(wish.lengthSq()>0) wish.normalize();
      var maxSpd=(keys.ShiftLeft||keys.ShiftRight)?SPRINT_SPEED:WALK_SPEED;
      var ctrl=player.grounded?1:AIR_CONTROL;
      vel.x+=wish.x*maxSpd*GROUND_FRICTION*ctrl*dt;
      vel.z+=wish.z*maxSpd*GROUND_FRICTION*ctrl*dt;
      var hSpd=Math.hypot(vel.x,vel.z);
      if(hSpd>maxSpd){vel.x*=maxSpd/hSpd;vel.z*=maxSpd/hSpd;}
      if(player.grounded&&wish.lengthSq()===0){var damp=Math.max(0,1-GROUND_FRICTION*dt);vel.x*=damp;vel.z*=damp;}
      if(player.grounded&&keys.Space){vel.y=JUMP_FORCE;player.grounded=false;}
      vel.y-=GRAVITY*dt;

      var subDt=dt/SUBSTEPS;
      for(var step=0;step<SUBSTEPS;step++){
        var prevY=pos.y;
        var nx=pos.x+vel.x*subDt, ny=pos.y+vel.y*subDt, nz=pos.z+vel.z*subDt;
        var landed=getTopLanding(objects,prevY,ny,nx,nz,vel.y);
        if(landed){
          var top=landed.position.y+landed.userData.size[1]/2;
          pos.set(nx,top+PLAYER_HEIGHT,nz);
          vel.y=0; player.grounded=true;
          vel.x+=landed.userData.velX||0;
          vel.z+=landed.userData.velZ||0;
          var type=landed.userData.type, lvl=landed.userData.level;
          if(type==="checkpoint") saveCheckpoint(landed);
          if(type==="bounce"){vel.y=landed.userData.bounce||12;player.grounded=false;}
          if(type==="finish"&&!player.completed){
            player.completed=true;player.finishedTime=(performance.now()-player.startTime)/1000;
            document.exitPointerLock&&document.exitPointerLock();
            setHud(function(h){return Object.assign({},h,{completed:true,locked:false,time:player.finishedTime,level:TOTAL_SECTIONS});});
          }
          player.level=Math.max(player.level,lvl);
        } else {
          pos.set(nx,ny,nz); player.grounded=false;
        }
      }
      if(isLavaTile(objects,pos.x,pos.y,pos.z)||isHazard(hazards,pos.x,pos.y,pos.z)) respawn();
      if(pos.y<WORLD_FLOOR_Y) respawn();
      camera.position.copy(pos);
      camera.rotation.y=player.yaw;
      camera.rotation.x=player.pitch;
    }

    function animate(now) {
      if(!rt.running) return;
      var dt=Math.min((now-rt.lastT)/1000,0.04); rt.lastT=now;
      var t=now/1000;
      updateMovingObjects(t);
      updatePlayer(dt);
      sky.position.copy(camera.position);
      // Slowly drift clouds
      for(var ci=0;ci<clouds.length;ci++) clouds[ci].position.x+=Math.sin(t*0.15+ci*0.8)*0.003;
      // Slowly spin bg stars and bounce bg objects
      for(var bi=0;bi<bgObjects.length;bi++){
        bgObjects[bi].rotation.z+=0.003;
        bgObjects[bi].position.y+=Math.sin(t*0.4+bi*0.5)*0.004;
      }
      renderer.render(scene,camera);
      if(now-rt.lastHudUpdate>180){
        rt.lastHudUpdate=now;
        var elapsed=player.completed&&player.finishedTime?player.finishedTime:(performance.now()-player.startTime)/1000;
        setHud(function(h){return Object.assign({},h,{level:Math.max(h.level,player.level),deaths:player.deaths,checkpoint:player.checkpointLevel,paused:rt.paused,locked:rt.locked,started:rt.started,time:elapsed,completed:player.completed});});
      }
      rt.raf=requestAnimationFrame(animate);
    }
    rt.raf=requestAnimationFrame(animate);

    return function(){
      rt.running=false; if(rt.raf) cancelAnimationFrame(rt.raf);
      document.removeEventListener("pointerlockchange",onPLC);
      document.removeEventListener("mousemove",onMM);
      window.removeEventListener("keydown",onKD);
      window.removeEventListener("keyup",onKU);
      window.removeEventListener("resize",onResize);
      renderer.domElement.removeEventListener("click",onClick);
      if(document.pointerLockElement===renderer.domElement&&document.exitPointerLock) document.exitPointerLock();
      renderer.dispose();
      scene.traverse(function(obj){
        if(obj.geometry) obj.geometry.dispose();
        if(obj.material){var mats=Array.isArray(obj.material)?obj.material:[obj.material];mats.forEach(function(m){if(m.map)m.map.dispose();m.dispose();});}
      });
      if(mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      stateRef.current=null; clearTimeout(toastRef.current);
    };
  },[showToast,triggerFlash]);

  function resumeGame(){var rt=stateRef.current;if(!rt)return;rt.paused=false;rt.renderer.domElement.requestPointerLock&&rt.renderer.domElement.requestPointerLock();setHud(function(h){return Object.assign({},h,{paused:false});});}
  function restartGame(){
    var rt=stateRef.current; if(!rt) return;
    var player=rt.player, sp=new THREE.Vector3(0,2.3,2.5);
    player.pos.copy(sp); player.vel.set(0,0,0);
    player.yaw=0; player.pitch=0; player.grounded=false;
    player.checkpointPos.copy(sp); player.checkpointYaw=0;
    player.checkpointLevel=1; player.level=1; player.deaths=0;
    player.completed=false; player.startTime=performance.now(); player.finishedTime=null;
    rt.started=true; rt.paused=false;
    setHud({started:true,paused:false,locked:false,level:1,deaths:0,checkpoint:1,completed:false,time:0});
    rt.renderer.domElement.requestPointerLock&&rt.renderer.domElement.requestPointerLock();
  }
  function fmt(sec){var s=Math.max(0,Math.floor(sec));return Math.floor(s/60)+":"+String(s%60).padStart(2,"0");}

  return (
    <div className="neutral-obby-page">
      <div className="neutral-obby-topbar">
        <div>
          <h1>Skyline Obby: Ascent Run</h1>
          <p>20-section first-person platformer with moving platforms, hazards, checkpoints, and bounce pads.</p>
        </div>
        <div className="neutral-obby-actions">
          {onBack && <button type="button" onClick={onBack}>← Back</button>}
          <button type="button" onClick={restartGame}>Restart</button>
          <button type="button" onClick={resumeGame}>Resume</button>
        </div>
      </div>
      <div className="neutral-obby-shell">
        <div ref={mountRef} className="neutral-obby-canvas" />
        <div className="neutral-obby-crosshair"><span /></div>
        <div className="neutral-obby-hud">
          <div><strong>Section</strong><span>{hud.level}/{TOTAL_SECTIONS}</span></div>
          <div><strong>Checkpoint</strong><span>{hud.checkpoint}</span></div>
          <div><strong>Deaths</strong><span>{hud.deaths}</span></div>
          <div><strong>Time</strong><span>{fmt(hud.time)}</span></div>
        </div>
        {flash==="check" && <div key={"cf"+hud.checkpoint} className="neutral-obby-checkpoint-flash"/>}
        {flash==="death" && <div key={"df"+hud.deaths} className="neutral-obby-death-flash"/>}
        {toast && <div key={toast} className="neutral-obby-toast">{toast}</div>}

        {!hud.started && (
          <div className="neutral-obby-overlay">
            <div className="neutral-obby-card">
              <h2>Skyline Obby: Ascent Run</h2>
              <p>20 obstacle-course sections. Dodge spinner bars, lava tiles, moving platforms, bounce pads, rolling orbs, and precision jumps. Click to lock your mouse.</p>
              <div className="neutral-obby-controls">
                <span>WASD · move</span><span>Mouse · look</span><span>Space · jump</span>
                <span>Shift · sprint</span><span>R · respawn</span><span>P / Esc · pause</span>
              </div>
              <button type="button" onClick={function(){var rt=stateRef.current;if(!rt)return;rt.started=true;rt.paused=false;rt.renderer.domElement.requestPointerLock&&rt.renderer.domElement.requestPointerLock();setHud(function(h){return Object.assign({},h,{started:true,paused:false});});}}>
                Start the Course
              </button>
            </div>
          </div>
        )}
        {hud.paused && !hud.completed && (
          <div className="neutral-obby-overlay">
            <div className="neutral-obby-card">
              <h2>⏸ Paused</h2>
              <p>The course is waiting. Deaths: <strong>{hud.deaths}</strong></p>
              <button type="button" onClick={resumeGame}>Resume Run</button>
            </div>
          </div>
        )}
        {hud.completed && (
          <div className="neutral-obby-overlay">
            <div className="neutral-obby-card victory">
              <h2>🏆 You Escaped!</h2>
              <p>You cleared all 20 sections of the obstacle course.</p>
              <p>Time: <strong>{fmt(hud.time)}</strong> · Deaths: <strong>{hud.deaths}</strong></p>
              <button type="button" onClick={restartGame}>Run It Back</button>
            </div>
          </div>
        )}
        {!hud.locked && hud.started && !hud.paused && !hud.completed && (
          <div className="neutral-obby-clickhint">Click the game to look around</div>
        )}
      </div>
    </div>
  );
}