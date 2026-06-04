import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import "../../styles/FurryObbyGame.css";

// ─── CONSTANTS ──────────────────────────────────────────────────────────────
const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.32;
const GRAVITY = 24;
const WALK_SPEED = 7.5;
const SPRINT_SPEED = 11;
const JUMP_FORCE = 9.2;
const AIR_CONTROL = 0.38;
const GROUND_FRICTION = 14;
const MOUSE_SENS = 0.0021;
const WORLD_FLOOR_Y = -22;
// Sub-steps for physics — prevents tunnelling through thin platforms
const PHYSICS_SUBSTEPS = 3;

// ─── UTILS ──────────────────────────────────────────────────────────────────
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const randFrom = (arr) => arr[Math.floor(Math.random() * arr.length)];

function distPtSeg2D(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az;
  const apx = px - ax, apz = pz - az;
  const lenSq = abx * abx + abz * abz;
  if (lenSq === 0) return Math.hypot(px - ax, pz - az);
  const t = clamp((apx * abx + apz * abz) / lenSq, 0, 1);
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}

// ─── SIGN TEXTURE ────────────────────────────────────────────────────────────
function makeSignTexture(text, {
  w = 1024, h = 256, fontSize = 68,
  bg = "rgba(255,179,236,0.9)", fg = "#fff", stroke = "#7c2d92",
} = {}) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d");

  // Background
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, bg);
  grad.addColorStop(1, "rgba(200,100,220,0.88)");
  ctx.fillStyle = grad;
  roundRect(ctx, 8, 8, w - 16, h - 16, 28);
  ctx.fill();

  // Border
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 10;
  roundRect(ctx, 8, 8, w - 16, h - 16, 28);
  ctx.stroke();

  // Paw prints decoration
  ctx.font = `${Math.round(fontSize * 0.6)}px serif`;
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillText("🐾", 24, h - 24);
  ctx.fillText("🐾", w - 80, 40);

  // Text
  ctx.font = `900 ${fontSize}px 'Arial Black', Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 12;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, w / 2, h / 2);
  ctx.fillStyle = fg;
  ctx.fillText(text, w / 2, h / 2);

  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── SIGN BILLBOARD (facing +Z so player sees it approaching) ────────────────
function makeSign(scene, text, pos, scl = [5, 1.2]) {
  const tex = makeSignTexture(text);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(scl[0], scl[1]), mat);
  mesh.position.set(pos[0], pos[1], pos[2]);
  // No rotation — default PlaneGeometry faces +Z which is toward the player
  scene.add(mesh);

  // Little pole
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, scl[1] * 0.6 + 0.4, 8),
    new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.5 })
  );
  pole.position.set(pos[0], pos[1] - scl[1] / 2 - 0.1, pos[2]);
  scene.add(pole);
  return mesh;
}

// ─── FURRY DECORATIONS ───────────────────────────────────────────────────────
function makeFurrySphere(scene, pos, r, color, emissiveInt = 0.18) {
  // Fluffy sphere made of layered imperfect spheres
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: emissiveInt, roughness: 0.85,
  });
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r * (0.7 + Math.random() * 0.4), 16, 12), mat);
    m.position.set(
      (Math.random() - 0.5) * r * 0.5,
      (Math.random() - 0.5) * r * 0.5,
      (Math.random() - 0.5) * r * 0.5
    );
    group.add(m);
  }
  group.position.set(pos[0], pos[1], pos[2]);
  scene.add(group);
  return group;
}

function makePawPrint(scene, cx, cy, cz, rot = 0) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: "#ff9de6", roughness: 0.7 });

  // Main pad
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 20), mat);
  group.add(pad);

  // Toe beans
  const toeOffsets = [
    [-0.45, 0, -0.45], [0, 0, -0.62], [0.45, 0, -0.45], [-0.25, 0, 0.45], [0.25, 0, 0.45],
  ];
  toeOffsets.forEach(([tx, ty, tz]) => {
    const toe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.08, 12),
      mat
    );
    toe.position.set(tx, ty, tz);
    group.add(toe);
  });

  group.position.set(cx, cy, cz);
  group.rotation.y = rot;
  scene.add(group);
  return group;
}

function makeFursuitHead(scene, pos, color = "#ff9de6") {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
  const snoutMat = new THREE.MeshStandardMaterial({ color: "#fff8f0", roughness: 0.85 });

  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.8, 20, 16), mat);
  group.add(head);

  // Ears
  [[-0.45, 0.72, 0], [0.45, 0.72, 0]].forEach(([ex, ey, ez]) => {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.55, 10), mat);
    ear.position.set(ex, ey, ez);
    group.add(ear);
    // Inner ear
    const innerMat = new THREE.MeshStandardMaterial({ color: "#ff80c0", roughness: 0.8 });
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.38, 10), innerMat);
    inner.position.set(ex, ey, ez + 0.04);
    group.add(inner);
  });

  // Snout
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), snoutMat);
  snout.position.set(0, -0.12, 0.68);
  snout.scale.y = 0.7;
  group.add(snout);

  // Nose
  const nose = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 12, 10),
    new THREE.MeshStandardMaterial({ color: "#222", roughness: 0.5 })
  );
  nose.position.set(0, 0.02, 0.99);
  group.add(nose);

  // Eyes
  const eyeMat = new THREE.MeshStandardMaterial({ color: "#1a0a2e", roughness: 0.3 });
  [[-0.3, 0.18, 0.72], [0.3, 0.18, 0.72]].forEach(([ex, ey, ez]) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), eyeMat);
    eye.position.set(ex, ey, ez);
    group.add(eye);
    const shine = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 8, 6),
      new THREE.MeshBasicMaterial({ color: "#fff" })
    );
    shine.position.set(ex + 0.04, ey + 0.04, ez + 0.06);
    group.add(shine);
  });

  group.position.set(pos[0], pos[1], pos[2]);
  scene.add(group);
  return group;
}

function makeTailSpinner(scene, hazards, options) {
  const { center, armLength = 7, speed = 1.6, level = 1, color = "#ff4fc3" } = options;

  const group = new THREE.Group();
  group.position.set(center[0], center[1], center[2]);

  // Center pole — fursuit head on top!
  const headColors = ["#ff9de6", "#9ee7ff", "#b8ff9e", "#ffe18f", "#d6a3ff"];
  makeFursuitHead(group, [0, 1.8, 0], randFrom(headColors));

  // Pole body
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, 2, 12),
    new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.7 })
  );
  pole.position.y = 0.5;
  group.add(pole);

  // Arm — looks like a big fluffy tail
  const armMat = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 0.2, roughness: 0.85,
  });
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.12, armLength, 14), armMat);
  arm.rotation.z = Math.PI / 2;
  arm.position.y = 1.1;
  group.add(arm);

  // Fluffy tail tips
  [armLength / 2, -armLength / 2].forEach(tx => {
    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 16, 12),
      new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#ffe8fa", emissiveIntensity: 0.2, roughness: 0.9 })
    );
    tip.position.set(tx, 1.1, 0);
    group.add(tip);
  });

  group.userData = {
    type: "spinner", level, center: [...center], armLength, speed, angle: 0,
  };

  scene.add(group);
  hazards.push(group);
  return group;
}

// ─── PLATFORM BUILDER ────────────────────────────────────────────────────────
function makeBox(scene, objects, opts) {
  const {
    name = "platform", pos, size, color = "#ff9de6", type = "solid", level = 1,
    emissive = "#000000", roughness = 0.62, metalness = 0.04,
    opacity = 1, transparent = false, bounce = 0, move = null,
    decoration = null,
  } = opts;

  const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
  const mat = new THREE.MeshStandardMaterial({
    color, emissive, roughness, metalness, opacity, transparent,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  // Cache AABB data
  mesh.userData = {
    name, type, level,
    pos: [...pos],
    basePos: [...pos],
    size: [...size],
    bounce, move,
    delta: [0, 0, 0],
  };

  scene.add(mesh);
  objects.push(mesh);

  // Add paw print decoration on top of platforms
  if (decoration === "paw") {
    makePawPrint(scene, pos[0], pos[1] + size[1] / 2 + 0.01, pos[2], Math.random() * Math.PI);
  }

  return mesh;
}

function makeSphere(scene, hazards, opts) {
  const { pos, radius = 0.75, color = "#ffffff", level = 1, move = null } = opts;
  const geo = new THREE.SphereGeometry(radius, 20, 16);
  const mat = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 0.14, roughness: 0.4,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.castShadow = true;
  mesh.userData = { type: "sphere", level, radius, move, basePos: [...pos] };
  scene.add(mesh);
  hazards.push(mesh);
  return mesh;
}

function makeCylinder(scene, hazards, opts) {
  const { pos, radius = 0.5, height = 2, color = "#ff3b9d", level = 1, spin = null } = opts;
  const geo = new THREE.CylinderGeometry(radius, radius, height, 20);
  const mat = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 0.16, roughness: 0.35,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.castShadow = true;
  mesh.userData = { type: "cylinder", level, radius, height, spin, basePos: [...pos] };
  scene.add(mesh);
  hazards.push(mesh);
  return mesh;
}

// ─── WORLD BUILDER ──────────────────────────────────────────────────────────
const CRINGE_MESSAGES = [
  "UWU CHECKPOINT~", "OWO DON'T FALL!", "FURSUIT FURY ZONE",
  "NYA~ NYA~ NYA~", "PAW PATROL BUT WORSE", "NO ESCAPE FROM UWU",
  "TAIL SPIN DANGER!", "THE CRINGE GETS WORSE", "FURRY CONVENTION LAVA",
  "RAWR XD 2025", "WELCOME TO PAW HELL", "ONLY ALPHAS SURVIVE",
  "TOUCH GRASS... LATER", "BARK BARK JUMP", "THIS IS YOUR FAULT",
];

const PAL = ["#ff9de6", "#9ee7ff", "#b8ff9e", "#ffe18f", "#d6a3ff", "#ffb07c", "#ff9999", "#99ffee"];

function buildWorld(scene, objects, hazards) {
  // ── Starting platform ──
  makeBox(scene, objects, {
    name: "start", pos: [0, 0, 0], size: [14, 0.7, 14],
    color: "#ff9de6", type: "checkpoint", level: 1,
  });
  makePawPrint(scene, -2, 0.36, 0);
  makePawPrint(scene, 2, 0.36, -2, 0.8);
  makeFursuitHead(scene, [-4.5, 1.1, -4.5], "#9ee7ff");
  makeFursuitHead(scene, [4.5, 1.1, -4.5], "#ff9de6");
  makeSign(scene, "FURRY OBBY: UwU ASCENSION", [0, 3.2, -5.8], [6.5, 1.3]);

  // We advance from z=-8 onward (player faces -Z since yaw=PI)
  let z = -10;
  let x = 0;
  let y = 0;

  // ── SECTION 1: Easy intro hops ──
  makeSign(scene, "SECTION 1: THE AWAKENING", [0, y + 3.2, z + 2], [5.5, 1.2]);
  for (let i = 0; i < 6; i++) {
    x = (i % 2 === 0) ? 2.2 : -2.2;
    y += 0.1;
    makeBox(scene, objects, {
      name: `s1-hop-${i}`, pos: [x, y, z], size: [5, 0.6, 5],
      color: PAL[i % PAL.length], type: "solid", level: 1, decoration: "paw",
    });
    z -= 6.5;
  }

  // Checkpoint 1
  x = 0; y += 0.1;
  makeBox(scene, objects, {
    name: "cp1", pos: [x, y, z], size: [11, 0.7, 9], color: "#60ffb5",
    emissive: "#0a4f36", type: "checkpoint", level: 2,
  });
  makeSign(scene, "✅ CHECKPOINT SAVED! NYA~", [x, y + 3, z - 3], [5.5, 1.2]);
  makeFursuitHead(scene, [x - 3.5, y + 1.0, z - 2], "#ff9de6");
  makeFursuitHead(scene, [x + 3.5, y + 1.0, z - 2], "#9ee7ff");
  z -= 10;

  // ── SECTION 2: Moving platforms ──
  makeSign(scene, "SECTION 2: MOVING UWU PLATFORMS", [x, y + 3, z + 2], [6, 1.2]);
  for (let i = 0; i < 4; i++) {
    const phase = i * 1.4;
    makeBox(scene, objects, {
      name: `s2-mov-${i}`, pos: [x, y, z], size: [5.5, 0.6, 5],
      color: "#9ee7ff", type: "solid", level: 2,
      move: { axis: "x", distance: 4.5, speed: 1.2 + i * 0.12, phase },
    });
    z -= 7.5;
    y += 0.15;
  }
  // Landing pad
  makeBox(scene, objects, {
    name: "s2-land", pos: [0, y, z], size: [8, 0.65, 7],
    color: PAL[2], type: "solid", level: 2,
  });
  x = 0; z -= 8;

  // Checkpoint 2
  makeBox(scene, objects, {
    name: "cp2", pos: [x, y, z], size: [11, 0.7, 9], color: "#60ffb5",
    emissive: "#0a4f36", type: "checkpoint", level: 3,
  });
  makeSign(scene, "CHECKPOINT! KEEP GOING UWU", [x, y + 3, z - 3], [5.5, 1.2]);
  z -= 10;

  // ── SECTION 3: Spinner intro ──
  makeSign(scene, "SECTION 3: TAIL SPIN DANGER XD", [0, y + 3, z + 2], [5.8, 1.2]);
  makeBox(scene, objects, {
    name: "s3-base1", pos: [0, y, z], size: [12, 0.65, 10], color: "#ffe18f", type: "solid", level: 3,
  });
  makeTailSpinner(scene, hazards, { center: [0, y + 0.33, z], armLength: 8, speed: 1.3, level: 3, color: "#ff3ba7" });
  makeSign(scene, "DODGE THE SPINNY TAIL XD", [0, y + 3.4, z - 3.5], [5, 1.1]);
  z -= 12;
  y += 0.2;

  // Hop to next
  for (let i = 0; i < 4; i++) {
    x = [2.5, -2.5, 3, -3][i];
    makeBox(scene, objects, {
      name: `s3-hop-${i}`, pos: [x, y, z], size: [4.5, 0.58, 4.5],
      color: PAL[i], type: "solid", level: 3, decoration: "paw",
    });
    z -= 6;
  }

  // Checkpoint 3
  x = 0;
  makeBox(scene, objects, {
    name: "cp3", pos: [x, y, z], size: [11, 0.7, 9], color: "#60ffb5",
    emissive: "#0a4f36", type: "checkpoint", level: 4,
  });
  makeSign(scene, "✅ YOU SURVIVED SECTION 3!", [x, y + 3, z - 3], [5.5, 1.2]);
  makeFursuitHead(scene, [x, y + 1.1, z + 1.5], "#d6a3ff");
  z -= 11;

  // ── SECTION 4: Bounce pads ──
  makeSign(scene, "SECTION 4: BOING BOING BOING", [0, y + 3, z + 2], [5.5, 1.2]);
  makeBox(scene, objects, {
    name: "s4-bounce1", pos: [x, y, z], size: [6, 0.55, 6],
    color: "#a855f7", emissive: "#5b21b6", type: "bounce", level: 4, bounce: 14,
  });
  makeSign(scene, "BOINGY PAW PAD OwO", [x, y + 3, z - 2.5], [4.5, 1.1]);
  z -= 9;
  y += 3.2;

  makeBox(scene, objects, {
    name: "s4-high-land", pos: [0, y, z], size: [8, 0.65, 7],
    color: PAL[4], type: "solid", level: 4, decoration: "paw",
  });
  x = 0; z -= 8;

  // Second bounce slightly harder
  makeBox(scene, objects, {
    name: "s4-bounce2", pos: [2.5, y, z], size: [5, 0.55, 5],
    color: "#a855f7", emissive: "#5b21b6", type: "bounce", level: 4, bounce: 13.5,
  });
  z -= 8;
  y += 2.8;

  makeBox(scene, objects, {
    name: "s4-high-land2", pos: [0, y, z], size: [8.5, 0.65, 7.5],
    color: PAL[0], type: "solid", level: 4,
  });
  x = 0; z -= 9;

  // Checkpoint 4
  makeBox(scene, objects, {
    name: "cp4", pos: [x, y, z], size: [11, 0.7, 9], color: "#60ffb5",
    emissive: "#0a4f36", type: "checkpoint", level: 5,
  });
  makeSign(scene, "CHECKPOINT! UWU YOU DID IT", [x, y + 3, z - 3], [5.5, 1.2]);
  z -= 11;

  // ── SECTION 5: Hazard lava tiles on safe-looking platforms ──
  makeSign(scene, "SECTION 5: UWU LAVA TILES >:3", [0, y + 3, z + 2], [5.5, 1.2]);
  for (let i = 0; i < 4; i++) {
    const pz = z - i * 9;
    const px = (i % 2 === 0) ? -2 : 2;
    // Safe platform
    makeBox(scene, objects, {
      name: `s5-safe-${i}`, pos: [px, y, pz], size: [7, 0.62, 6],
      color: "#ff9de6", type: "solid", level: 5,
    });
    // Lava tiles embedded on top — offset to be avoidable
    const lavaX = px + (i % 2 === 0 ? 1.8 : -1.8);
    makeBox(scene, objects, {
      name: `s5-lava-${i}`, pos: [lavaX, y + 0.38, pz],
      size: [2.2, 0.2, 2.2], color: "#ff1744", emissive: "#ff0033",
      type: "hazardTile", level: 5,
    });
    makeFurrySphere(scene, [lavaX, y + 1.0, pz], 0.4, "#ff1744", 0.5);
  }
  z -= 40; y += 0.3;

  // Checkpoint 5
  makeBox(scene, objects, {
    name: "cp5", pos: [0, y, z], size: [11, 0.7, 9], color: "#60ffb5",
    emissive: "#0a4f36", type: "checkpoint", level: 6,
  });
  makeSign(scene, "✅ HALFWAY THERE, BESTIE", [0, y + 3, z - 3], [5.5, 1.2]);
  makeFursuitHead(scene, [-3, y + 1.1, z], "#ffe18f");
  makeFursuitHead(scene, [3, y + 1.1, z], "#b8ff9e");
  z -= 11;

  // ── SECTION 6: Narrow bridges + spinning cylinders ──
  makeSign(scene, "SECTION 6: SKINNY PAW BRIDGES", [0, y + 3, z + 2], [5.8, 1.2]);
  for (let i = 0; i < 5; i++) {
    const bx = Math.sin(i * 1.4) * 3;
    makeBox(scene, objects, {
      name: `s6-bridge-${i}`, pos: [bx, y, z], size: [2.8, 0.5, 5.5],
      color: "#ffffff", type: "solid", level: 6,
    });
    if (i % 2 === 0) {
      makeCylinder(scene, hazards, {
        pos: [bx + 2.2, y + 0.9, z],
        radius: 0.42, height: 1.8, color: "#ff006e", level: 6,
        spin: { axis: "y", speed: 3.5 },
      });
    }
    z -= 5.8;
    y += 0.08;
  }

  // Landing
  makeBox(scene, objects, {
    name: "s6-land", pos: [0, y, z], size: [9, 0.65, 7],
    color: PAL[3], type: "solid", level: 6,
  });
  x = 0; z -= 9;

  // Checkpoint 6
  makeBox(scene, objects, {
    name: "cp6", pos: [x, y, z], size: [11, 0.7, 9], color: "#60ffb5",
    emissive: "#0a4f36", type: "checkpoint", level: 7,
  });
  makeSign(scene, "CHECKPOINT! RAWR XD", [x, y + 3, z - 3], [5.5, 1.2]);
  z -= 11;

  // ── SECTION 7: Double spinners ──
  makeSign(scene, "SECTION 7: DOUBLE TAIL CHAOS", [0, y + 3, z + 2], [5.8, 1.2]);
  makeBox(scene, objects, {
    name: "s7-boss", pos: [0, y, z], size: [16, 0.68, 12], color: "#2dd4bf", type: "solid", level: 7,
  });
  makeTailSpinner(scene, hazards, { center: [-3, y + 0.34, z], armLength: 7.5, speed: 2, level: 7, color: "#ff3b9d" });
  makeTailSpinner(scene, hazards, { center: [3, y + 0.34, z], armLength: 7.5, speed: -2.2, level: 7, color: "#a855f7" });
  makeSign(scene, "DOUBLE TAIL ATTACK!!!", [0, y + 4, z - 4.5], [5, 1.1]);
  z -= 14;
  y += 0.3;

  // Hop series
  for (let i = 0; i < 5; i++) {
    x = Math.sin(i * 1.9) * 4;
    makeBox(scene, objects, {
      name: `s7-hop-${i}`, pos: [x, y, z], size: [4, 0.55, 4],
      color: PAL[(i + 2) % PAL.length], type: "solid", level: 7, decoration: "paw",
    });
    z -= 5.5;
    y += 0.12;
  }

  // Checkpoint 7
  x = 0;
  makeBox(scene, objects, {
    name: "cp7", pos: [x, y, z], size: [11, 0.7, 9], color: "#60ffb5",
    emissive: "#0a4f36", type: "checkpoint", level: 8,
  });
  makeSign(scene, "✅ STILL GOING?? RESPECT", [x, y + 3, z - 3], [5.5, 1.2]);
  z -= 11;

  // ── SECTION 8: Moving platforms + spheres ──
  makeSign(scene, "SECTION 8: DODGE & HOP TIME", [0, y + 3, z + 2], [5.5, 1.2]);
  for (let i = 0; i < 5; i++) {
    const phase = i * 0.9;
    makeBox(scene, objects, {
      name: `s8-mov-${i}`, pos: [0, y, z], size: [5, 0.58, 5],
      color: "#9ee7ff", type: "solid", level: 8,
      move: { axis: i % 2 === 0 ? "x" : "z", distance: 4, speed: 1.4 + i * 0.1, phase },
    });
    makeSphere(scene, hazards, {
      pos: [i % 2 === 0 ? -5 : 0, y + 1.2, z],
      radius: 0.85, color: "#ff4fc3", level: 8,
      move: { axis: i % 2 === 0 ? "x" : "z", distance: 5, speed: 1.6 + i * 0.1, phase: phase + Math.PI },
    });
    z -= 7;
    y += 0.1;
  }
  makeBox(scene, objects, {
    name: "s8-land", pos: [0, y, z], size: [9, 0.65, 8], color: PAL[5], type: "solid", level: 8,
  });
  x = 0; z -= 9;

  // Checkpoint 8
  makeBox(scene, objects, {
    name: "cp8", pos: [x, y, z], size: [11, 0.7, 9], color: "#60ffb5",
    emissive: "#0a4f36", type: "checkpoint", level: 9,
  });
  makeSign(scene, "CHECKPOINT! SO CLOSE UWU", [x, y + 3, z - 3], [5.5, 1.2]);
  makeFursuitHead(scene, [0, y + 1.1, z + 1], "#ff9de6");
  z -= 11;

  // ── SECTION 9: The Gauntlet ──
  makeSign(scene, "SECTION 9: THE UWU GAUNTLET", [0, y + 3, z + 2], [5.5, 1.2]);

  // Moving + spinner combo
  makeBox(scene, objects, {
    name: "s9-gaunt1", pos: [0, y, z], size: [10, 0.65, 9], color: "#ffe18f", type: "solid", level: 9,
  });
  makeTailSpinner(scene, hazards, { center: [0, y + 0.33, z], armLength: 7, speed: 2.5, level: 9, color: "#ff4fc3" });
  z -= 12;

  for (let i = 0; i < 4; i++) {
    const phase = i * 1.2;
    makeBox(scene, objects, {
      name: `s9-mov-${i}`, pos: [0, y, z], size: [4.5, 0.58, 4.5],
      color: PAL[i], type: "solid", level: 9,
      move: { axis: "x", distance: 4, speed: 1.6 + i * 0.15, phase },
    });
    z -= 6.5;
    y += 0.15;
  }

  // Bounce to final area
  x = 0;
  makeBox(scene, objects, {
    name: "s9-bounce", pos: [x, y, z], size: [5.5, 0.55, 5.5],
    color: "#a855f7", emissive: "#5b21b6", type: "bounce", level: 9, bounce: 14.5,
  });
  z -= 9;
  y += 3.5;

  makeBox(scene, objects, {
    name: "s9-high", pos: [0, y, z], size: [10, 0.65, 9], color: PAL[0], type: "solid", level: 9,
  });

  // Triple spinner finale
  makeTailSpinner(scene, hazards, { center: [-2.5, y + 0.33, z], armLength: 6.5, speed: 2.8, level: 9, color: "#ff3b9d" });
  makeTailSpinner(scene, hazards, { center: [2.5, y + 0.33, z], armLength: 6.5, speed: -2.6, level: 9, color: "#9ee7ff" });
  makeSign(scene, "ALMOST THERE!!! RAWR XD", [0, y + 3.6, z - 3.5], [5.2, 1.1]);
  z -= 12;

  // Final checkpoint
  makeBox(scene, objects, {
    name: "cp9", pos: [0, y, z], size: [13, 0.7, 10], color: "#60ffb5",
    emissive: "#0a4f36", type: "checkpoint", level: 10,
  });
  makeSign(scene, "✅ LAST CHECKPOINT! GO GO GO!", [0, y + 3.2, z - 3.5], [5.8, 1.2]);
  for (let i = 0; i < 4; i++) {
    makeFursuitHead(scene, [(i - 1.5) * 3.5, y + 1.1, z + 1.5], PAL[i]);
  }
  z -= 12;

  // ── SECTION 10: Final sprint ──
  makeSign(scene, "SECTION 10: THE END IS NEAR", [0, y + 3, z + 2], [5.5, 1.2]);
  for (let i = 0; i < 5; i++) {
    x = Math.sin(i * 2.1) * 3.5;
    y += 0.2;
    makeBox(scene, objects, {
      name: `s10-hop-${i}`, pos: [x, y, z], size: [4, 0.58, 4],
      color: ["#ffd700", "#ff9de6", "#9ee7ff", "#b8ff9e", "#d6a3ff"][i],
      type: "solid", level: 10, decoration: "paw",
    });
    z -= 6;
  }

  // ── FINISH ──
  x = 0; y += 0.5;
  makeBox(scene, objects, {
    name: "finish", pos: [x, y, z], size: [18, 0.85, 15],
    color: "#ffd700", emissive: "#8a6d00", type: "finish", level: 11,
  });
  makeSign(scene, "🏆 YOU ESCAPED THE UWU DIMENSION!", [x, y + 4.2, z - 5], [7, 1.4]);
  makeSign(scene, "CONGRATULATIONS BESTIE UWU", [x, y + 2.8, z - 4], [6, 1.2]);
  // Trophy heads
  for (let i = 0; i < 5; i++) {
    makeFursuitHead(scene, [(i - 2) * 3, y + 1.1, z], PAL[i]);
  }
}

// ─── COLLISION HELPERS ───────────────────────────────────────────────────────
// Returns the platform an AABB capsule lands on, with substepped position
function getStandingPlatform(objects, prevY, nextY, nextX, nextZ, velY) {
  const feetPrev = prevY - PLAYER_HEIGHT;
  const feetNext = nextY - PLAYER_HEIGHT;

  let best = null;
  let bestTop = -Infinity;

  for (const obj of objects) {
    if (obj.userData.type === "hazardTile") continue;

    const [px, py, pz] = obj.userData.pos;
    const [sx, sy, sz] = obj.userData.size;
    const top = py + sy / 2;

    // XZ overlap (with radius expansion)
    const inX = nextX + PLAYER_RADIUS > px - sx / 2 && nextX - PLAYER_RADIUS < px + sx / 2;
    const inZ = nextZ + PLAYER_RADIUS > pz - sz / 2 && nextZ - PLAYER_RADIUS < pz + sz / 2;
    if (!inX || !inZ) continue;

    // Crossed the top face from above — allow a generous sweep window
    const swept = feetPrev >= top - 0.18 && feetNext <= top + 0.32 && velY <= 0.05;
    if (swept && top > bestTop) {
      best = obj;
      bestTop = top;
    }
  }
  return best;
}

function isHazardTileContact(objects, x, y, z) {
  for (const obj of objects) {
    if (obj.userData.type !== "hazardTile") continue;
    const [px, py, pz] = obj.userData.pos;
    const [sx, sy, sz] = obj.userData.size;
    const footY = y - PLAYER_HEIGHT;
    if (
      x + PLAYER_RADIUS > px - sx / 2 && x - PLAYER_RADIUS < px + sx / 2 &&
      z + PLAYER_RADIUS > pz - sz / 2 && z - PLAYER_RADIUS < pz + sz / 2 &&
      footY < py + sy / 2 + 0.35 && y > py - sy / 2
    ) return true;
  }
  return false;
}

function isHazardContact(hazards, px, py, pz) {
  for (const hz of hazards) {
    if (hz.userData.type === "spinner") {
      const center = hz.position;
      const angle = hz.rotation.y;
      const len = hz.userData.armLength / 2;
      const ax = center.x + Math.cos(angle) * -len;
      const az = center.z + Math.sin(angle) * -len;
      const bx = center.x + Math.cos(angle) * len;
      const bz = center.z + Math.sin(angle) * len;
      const vertHit = py - PLAYER_HEIGHT < center.y + 1.6 && py > center.y + 0.4;
      if (vertHit && distPtSeg2D(px, pz, ax, az, bx, bz) < PLAYER_RADIUS + 0.38) return true;
    } else {
      const r = hz.userData.radius || 0.6;
      const h = hz.userData.height || r * 2;
      const dist = Math.hypot(px - hz.position.x, pz - hz.position.z);
      const vertHit = py - PLAYER_HEIGHT < hz.position.y + h / 2 && py > hz.position.y - h / 2;
      if (vertHit && dist < r + PLAYER_RADIUS) return true;
    }
  }
  return false;
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────
export default function FurryObbyGame({ onBack }) {
  const mountRef = useRef(null);
  const stateRef = useRef(null);

  const [hud, setHud] = useState({
    started: false, paused: false, locked: false,
    level: 1, deaths: 0, checkpoint: 1, completed: false, time: 0,
  });
  const [showCheckFlash, setShowCheckFlash] = useState(false);
  const [showDeathFlash, setShowDeathFlash] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const triggerToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#9bdcff");
    scene.fog = new THREE.Fog("#9bdcff", 24, 160);

    const camera = new THREE.PerspectiveCamera(80, mount.clientWidth / mount.clientHeight, 0.04, 600);
    camera.rotation.order = "YXZ";

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    // Lighting
    const hemi = new THREE.HemisphereLight("#ffe8fa", "#9e5bbd", 0.95);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight("#fff5f0", 1.35);
    sun.position.set(20, 38, 16);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -90;
    sun.shadow.camera.right = sun.shadow.camera.top = 90;
    scene.add(sun);
    const fill = new THREE.DirectionalLight("#c0e8ff", 0.45);
    fill.position.set(-15, 10, 15);
    scene.add(fill);

    // Build world
    const objects = [];
    const hazards = [];
    buildWorld(scene, objects, hazards);

    // Sky dome
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(280, 32, 18),
      new THREE.MeshBasicMaterial({ color: "#d0b8ff", side: THREE.BackSide })
    );
    scene.add(sky);

    // Clouds
    const clouds = [];
    const cloudMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.65 });
    for (let i = 0; i < 60; i++) {
      const cl = new THREE.Mesh(new THREE.SphereGeometry(2 + Math.random() * 3, 10, 7), cloudMat);
      cl.position.set(
        -80 + Math.random() * 160,
        22 + Math.random() * 35,
        -15 - Math.random() * 600
      );
      cl.scale.set(2, 0.5, 1);
      scene.add(cl);
      clouds.push(cl);
    }

    // Decorative fluffy spheres in the sky
    for (let i = 0; i < 25; i++) {
      makeFurrySphere(scene, [
        -60 + Math.random() * 120,
        28 + Math.random() * 20,
        -50 - Math.random() * 500,
      ], 1.5 + Math.random(), PAL[i % PAL.length], 0.08);
    }

    // Player state
    const spawnPos = new THREE.Vector3(0, 2.3, 2.5);
    const player = {
      pos: spawnPos.clone(),
      vel: new THREE.Vector3(),
      yaw: Math.PI,
      pitch: 0,
      grounded: false,
      checkpointPos: spawnPos.clone(),
      checkpointLevel: 1,
      level: 1,
      deaths: 0,
      completed: false,
      startTime: performance.now(),
      finishedTime: null,
    };

    const keys = {
      KeyW: false, KeyA: false, KeyS: false, KeyD: false,
      Space: false, ShiftLeft: false, ShiftRight: false,
    };

    const rt = {
      scene, camera, renderer, objects, hazards, player, keys,
      running: true, started: false, paused: false, locked: false,
      lastT: performance.now(), raf: null, lastHudUpdate: 0,
    };
    stateRef.current = rt;

    // ── Respawn ──
    function respawn() {
      player.deaths++;
      player.pos.copy(player.checkpointPos);
      player.vel.set(0, 0, 0);
      player.pitch = 0;
      player.yaw = Math.PI;
      player.grounded = false;
      setShowDeathFlash(true);
      setTimeout(() => setShowDeathFlash(false), 500);
      setHud(h => ({ ...h, deaths: player.deaths }));
    }

    // ── Checkpoint save ──
    function saveCheckpoint(platform) {
      const lvl = platform.userData.level;
      if (lvl <= player.checkpointLevel) return;
      player.checkpointLevel = lvl;
      const top = platform.position.y + platform.userData.size[1] / 2;
      player.checkpointPos.set(
        platform.position.x,
        top + PLAYER_HEIGHT + 0.1,
        platform.position.z + 1.5
      );
      triggerToast(`✅ Checkpoint ${lvl} Saved! NYA~`);
      setShowCheckFlash(true);
      setTimeout(() => setShowCheckFlash(false), 700);
      setHud(h => ({ ...h, checkpoint: player.checkpointLevel, level: Math.max(h.level, lvl) }));
    }

    // ── Input ──
    function onPointerLockChange() {
      rt.locked = document.pointerLockElement === renderer.domElement;
      setHud(h => ({ ...h, locked: rt.locked }));
    }
    function onMouseMove(e) {
      if (!rt.locked || rt.paused || player.completed) return;
      player.yaw -= e.movementX * MOUSE_SENS;
      player.pitch = clamp(player.pitch - e.movementY * MOUSE_SENS, -1.3, 1.3);
    }
    function onKeyDown(e) {
      if (e.code in keys) keys[e.code] = true;
      if (e.code === "Escape") {
        rt.paused = true;
        document.exitPointerLock?.();
        setHud(h => ({ ...h, paused: true }));
      }
      if (e.code === "KeyP") {
        rt.paused = !rt.paused;
        if (!rt.paused) renderer.domElement.requestPointerLock?.();
        setHud(h => ({ ...h, paused: rt.paused }));
      }
      if (e.code === "KeyR") respawn();
    }
    function onKeyUp(e) { if (e.code in keys) keys[e.code] = false; }
    function onClick() {
      if (!rt.locked && !rt.paused && !player.completed) {
        renderer.domElement.requestPointerLock?.();
        rt.started = true;
        setHud(h => ({ ...h, started: true }));
      }
    }
    function onResize() {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    }

    document.addEventListener("pointerlockchange", onPointerLockChange);
    document.addEventListener("mousemove", onMouseMove);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("resize", onResize);
    renderer.domElement.addEventListener("click", onClick);

    // ── Update moving objects ──
    function updateMovingObjects(t) {
      for (const obj of objects) {
        const mv = obj.userData.move;
        if (!mv) continue;
        const prevX = obj.position.x, prevY = obj.position.y, prevZ = obj.position.z;
        const base = obj.userData.basePos;
        const off = Math.sin(t * mv.speed + mv.phase) * mv.distance;
        if (mv.axis === "x") obj.position.x = base[0] + off;
        else if (mv.axis === "y") obj.position.y = base[1] + off;
        else obj.position.z = base[2] + off;
        obj.userData.pos = [obj.position.x, obj.position.y, obj.position.z];
        obj.userData.delta = [obj.position.x - prevX, obj.position.y - prevY, obj.position.z - prevZ];
      }

      for (const hz of hazards) {
        if (hz.userData.type === "spinner") {
          hz.userData.angle = (hz.userData.angle || 0) + hz.userData.speed * 0.016;
          hz.rotation.y = hz.userData.angle;
        }
        if (hz.userData.spin) {
          const s = hz.userData.spin;
          hz.rotation[s.axis] += s.speed * 0.016;
        }
        if (hz.userData.move) {
          const mv = hz.userData.move;
          const base = hz.userData.basePos;
          const off = Math.sin(t * mv.speed + mv.phase) * mv.distance;
          if (mv.axis === "x") hz.position.x = base[0] + off;
          else if (mv.axis === "y") hz.position.y = base[1] + off;
          else hz.position.z = base[2] + off;
        }
      }
    }

    // ── Player update with sub-stepping ──
    function updatePlayer(dt) {
      if (!rt.started || rt.paused || player.completed) return;

      const fwd = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
      const rgt = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));

      const wish = new THREE.Vector3();
      if (keys.KeyW) wish.add(fwd);
      if (keys.KeyS) wish.sub(fwd);
      if (keys.KeyD) wish.add(rgt);
      if (keys.KeyA) wish.sub(rgt);
      if (wish.lengthSq() > 0) wish.normalize();

      const maxSpd = (keys.ShiftLeft || keys.ShiftRight) ? SPRINT_SPEED : WALK_SPEED;
      const ctrl = player.grounded ? 1 : AIR_CONTROL;

      player.vel.x += wish.x * maxSpd * GROUND_FRICTION * ctrl * dt;
      player.vel.z += wish.z * maxSpd * GROUND_FRICTION * ctrl * dt;

      // Clamp horizontal speed
      const hSpd = Math.hypot(player.vel.x, player.vel.z);
      if (hSpd > maxSpd) {
        const scale = maxSpd / hSpd;
        player.vel.x *= scale;
        player.vel.z *= scale;
      }

      // Friction when not inputting
      if (player.grounded && wish.lengthSq() === 0) {
        const damp = Math.max(0, 1 - GROUND_FRICTION * dt);
        player.vel.x *= damp;
        player.vel.z *= damp;
      }

      // Jump
      if (player.grounded && keys.Space) {
        player.vel.y = JUMP_FORCE;
        player.grounded = false;
      }

      // Gravity
      player.vel.y -= GRAVITY * dt;

      // ── Sub-step integration ──
      const subDt = dt / PHYSICS_SUBSTEPS;
      for (let step = 0; step < PHYSICS_SUBSTEPS; step++) {
        const prevY = player.pos.y;
        const nx = player.pos.x + player.vel.x * subDt;
        const nz = player.pos.z + player.vel.z * subDt;
        const ny = player.pos.y + player.vel.y * subDt;

        const landed = getStandingPlatform(objects, prevY, ny, nx, nz, player.vel.y);
        if (landed) {
          const top = landed.position.y + landed.userData.size[1] / 2;
          player.pos.set(nx, top + PLAYER_HEIGHT, nz);
          player.vel.y = 0;
          player.grounded = true;

          // Ride moving platform
          const d = landed.userData.delta;
          if (d) { player.pos.x += d[0]; player.pos.z += d[2]; }

          // Handle platform types
          const type = landed.userData.type;
          const lvl = landed.userData.level;

          if (type === "checkpoint") saveCheckpoint(landed);
          if (type === "bounce") {
            player.vel.y = landed.userData.bounce || 12;
            player.grounded = false;
          }
          if (type === "finish" && !player.completed) {
            player.completed = true;
            player.finishedTime = (performance.now() - player.startTime) / 1000;
            document.exitPointerLock?.();
            setHud(h => ({ ...h, completed: true, locked: false, time: player.finishedTime, level: 11 }));
          }
          player.level = Math.max(player.level, lvl);
        } else {
          player.pos.set(nx, ny, nz);
          player.grounded = false;
        }
      }

      // Hazard check
      if (
        isHazardTileContact(objects, player.pos.x, player.pos.y, player.pos.z) ||
        isHazardContact(hazards, player.pos.x, player.pos.y, player.pos.z)
      ) {
        respawn();
      }

      // Void check
      if (player.pos.y < WORLD_FLOOR_Y) respawn();

      // Update camera
      camera.position.copy(player.pos);
      camera.rotation.y = player.yaw;
      camera.rotation.x = player.pitch;
    }

    // ── Render loop ──
    function animate(now) {
      if (!rt.running) return;
      const dt = Math.min((now - rt.lastT) / 1000, 0.04);
      rt.lastT = now;
      const t = now / 1000;

      updateMovingObjects(t);
      updatePlayer(dt);

      sky.position.copy(camera.position);
      clouds.forEach((cl, i) => { cl.position.x += Math.sin(t * 0.18 + i * 0.7) * 0.002; });

      renderer.render(scene, camera);

      if (now - rt.lastHudUpdate > 180) {
        rt.lastHudUpdate = now;
        const elapsed = player.completed && player.finishedTime
          ? player.finishedTime
          : (performance.now() - player.startTime) / 1000;
        setHud(h => ({
          ...h,
          level: Math.max(h.level, player.level),
          deaths: player.deaths,
          checkpoint: player.checkpointLevel,
          paused: rt.paused, locked: rt.locked, started: rt.started,
          time: elapsed, completed: player.completed,
        }));
      }

      rt.raf = requestAnimationFrame(animate);
    }

    rt.raf = requestAnimationFrame(animate);

    return () => {
      rt.running = false;
      if (rt.raf) cancelAnimationFrame(rt.raf);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      document.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("click", onClick);
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock?.();
      renderer.dispose();
      scene.traverse(obj => {
        obj.geometry?.dispose?.();
        if (obj.material) {
          (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => {
            m.map?.dispose?.(); m.dispose?.();
          });
        }
      });
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      stateRef.current = null;
      clearTimeout(toastTimer.current);
    };
  }, [triggerToast]);

  function resumeGame() {
    const rt = stateRef.current;
    if (!rt) return;
    rt.paused = false;
    rt.renderer.domElement.requestPointerLock?.();
    setHud(h => ({ ...h, paused: false }));
  }

  function restartGame() {
    const rt = stateRef.current;
    if (!rt) return;
    const { player } = rt;
    const spawn = new THREE.Vector3(0, 2.3, 2.5);
    player.pos.copy(spawn);
    player.vel.set(0, 0, 0);
    player.yaw = Math.PI;
    player.pitch = 0;
    player.grounded = false;
    player.checkpointPos.copy(spawn);
    player.checkpointLevel = 1;
    player.level = 1;
    player.deaths = 0;
    player.completed = false;
    player.startTime = performance.now();
    player.finishedTime = null;
    rt.started = true;
    rt.paused = false;
    setHud({ started: true, paused: false, locked: false, level: 1, deaths: 0, checkpoint: 1, completed: false, time: 0 });
    rt.renderer.domElement.requestPointerLock?.();
  }

  function fmt(sec) {
    const s = Math.max(0, Math.floor(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  return (
    <div className="furry-obby-page">
      <div className="furry-obby-topbar">
        <div>
          <h1>🐾 Furry Obby: UwU Ascension</h1>
          <p>First-person cringe platformer nightmare. NYA~</p>
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
          <div><strong>Section</strong><span>{hud.level}/11</span></div>
          <div><strong>Checkpoint</strong><span>{hud.checkpoint}</span></div>
          <div><strong>Deaths</strong><span>{hud.deaths}</span></div>
          <div><strong>Time</strong><span>{fmt(hud.time)}</span></div>
        </div>

        {showCheckFlash && <div className="furry-obby-checkpoint-flash" key={`cf-${hud.checkpoint}`} />}
        {showDeathFlash && <div className="furry-obby-death-flash" key={`df-${hud.deaths}`} />}
        {toast && <div className="furry-obby-toast" key={toast}>{toast}</div>}

        {/* Start screen */}
        {!hud.started && (
          <div className="furry-obby-overlay">
            <div className="furry-obby-card">
              <h2>🐾 Furry Obby: UwU Ascension</h2>
              <p>
                10 cursed sections, spinning fursuit tails, UWU lava tiles,
                paw-print bounce pads, and enough cringe to last a lifetime.
                Click to lock your mouse and enter the UwU dimension.
              </p>
              <div className="furry-obby-controls">
                <span>WASD · move</span>
                <span>Mouse · look</span>
                <span>Space · jump</span>
                <span>Shift · sprint</span>
                <span>R · respawn</span>
                <span>P · pause</span>
                <span>Esc · pause</span>
              </div>
              <button type="button" onClick={() => {
                const rt = stateRef.current;
                if (!rt) return;
                rt.started = true;
                rt.paused = false;
                rt.renderer.domElement.requestPointerLock?.();
                setHud(h => ({ ...h, started: true, paused: false }));
              }}>
                Enter the UwU Dimension 🐾
              </button>
            </div>
          </div>
        )}

        {/* Paused */}
        {hud.paused && !hud.completed && (
          <div className="furry-obby-overlay">
            <div className="furry-obby-card">
              <h2>⏸ Paused</h2>
              <p>The cringe awaits. Deaths so far: <strong>{hud.deaths}</strong></p>
              <button type="button" onClick={resumeGame}>Resume UwU</button>
            </div>
          </div>
        )}

        {/* Victory */}
        {hud.completed && (
          <div className="furry-obby-overlay">
            <div className="furry-obby-card victory">
              <h2>🏆 You Escaped!</h2>
              <p>You survived the UwU Dimension.</p>
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