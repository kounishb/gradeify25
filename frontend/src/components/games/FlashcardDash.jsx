import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import "../../styles/FlashcardDash.css";

// ─── Constants ────────────────────────────────────────────────────────────
const LANE_POSITIONS = [-3.2, 0, 3.2];  // x coords in 3D world
const START_SPEED = 0.22;
const MAX_SPEED   = 0.58;
const HALL_WIDTH  = 12;
const HALL_HEIGHT = 5.5;
const START_HEARTS = 3;
const TILE_LENGTH  = 8;   // length of each floor/ceiling tile segment
const TILE_COUNT   = 18;  // pool of tiles recycled

const QUESTION_BANK = [
  { q: "What is the main purpose of photosynthesis?", opts: ["To create glucose using sunlight","To break down rocks","To make oxygen from glucose","To digest proteins"], correct: 0 },
  { q: "What does slope represent in y = mx + b?", opts: ["The x-intercept","The rate of change","The y-intercept","The maximum value"], correct: 1 },
  { q: "Which organelle is the powerhouse of the cell?", opts: ["Nucleus","Ribosome","Mitochondria","Golgi apparatus"], correct: 2 },
  { q: "What is opportunity cost?", opts: ["Total money spent","The value of the next best alternative","A fixed expense","Profit after taxes"], correct: 1 },
  { q: "What is the derivative of x²?", opts: ["x","2x","x³","2"], correct: 1 },
  { q: "Which molecule carries genetic information?", opts: ["ATP","DNA","Glucose","Water"], correct: 1 },
  { q: "What does inflation mean?", opts: ["Prices generally rise over time","Prices always fall","Interest rates are zero","The stock market closes"], correct: 0 },
  { q: "What does a topic sentence usually do?", opts: ["Ends the essay","Introduces the main idea","Lists citations","Creates bibliography"], correct: 1 },
  { q: "What is Newton's Second Law?", opts: ["F = ma","E = mc²","V = IR","PV = nRT"], correct: 0 },
  { q: "Which planet is closest to the Sun?", opts: ["Venus","Earth","Mercury","Mars"], correct: 2 },
];

function rndQ() { return QUESTION_BANK[Math.floor(Math.random() * QUESTION_BANK.length)]; }
function rndLane() { return Math.floor(Math.random() * 3); }  // 0,1,2

// ─── Three.js builder helpers ─────────────────────────────────────────────

function makeMaterial(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}

function makeBox(w, h, d, color, opts = {}) {
  const geo  = new THREE.BoxGeometry(w, h, d);
  const mat  = makeMaterial(color, opts);
  return new THREE.Mesh(geo, mat);
}

function makeCylinder(rT, rB, h, segs, color) {
  const geo = new THREE.CylinderGeometry(rT, rB, h, segs);
  const mat = makeMaterial(color);
  return new THREE.Mesh(geo, mat);
}

// ─── Build School Hallway Geometry ────────────────────────────────────────

function buildHallway(scene) {
  const group = new THREE.Group();

  // Texture-like material using vertex colors approach with MeshLambertMaterial
  // Floor tiles — alternating cream/light grey
  const floorTiles = [];
  for (let i = 0; i < TILE_COUNT; i++) {
    const color = i % 2 === 0 ? 0xf0ece0 : 0xe0dcd0;
    const tile = makeBox(HALL_WIDTH, 0.05, TILE_LENGTH, color);
    tile.receiveShadow = true;
    tile.position.y = 0;
    tile.position.z = -(i * TILE_LENGTH);
    // Grout lines via child thin strips
    const grout = makeBox(HALL_WIDTH, 0.06, 0.08, 0xbbbbaa);
    grout.position.z = TILE_LENGTH / 2;
    tile.add(grout);
    const grout2 = makeBox(0.08, 0.06, TILE_LENGTH, 0xbbbbaa);
    grout2.position.x = HALL_WIDTH / 2;
    tile.add(grout2);
    group.add(tile);
    floorTiles.push(tile);
  }

  // Ceiling tiles — drop-panel look
  const ceilTiles = [];
  for (let i = 0; i < TILE_COUNT; i++) {
    const tile = makeBox(HALL_WIDTH, 0.1, TILE_LENGTH, 0xf5f5f0);
    tile.position.y = HALL_HEIGHT;
    tile.position.z = -(i * TILE_LENGTH);
    group.add(tile);
    ceilTiles.push(tile);

    // Ceiling light fixture every 2nd tile
    if (i % 2 === 0) {
      const fixture = makeBox(0.6, 0.12, TILE_LENGTH * 0.7, 0xffffee);
      fixture.position.y = HALL_HEIGHT - 0.1;
      fixture.position.z = -(i * TILE_LENGTH);
      // Emissive glow
      fixture.material = new THREE.MeshLambertMaterial({ color: 0xffffcc, emissive: 0xffffaa, emissiveIntensity: 0.6 });
      group.add(fixture);
    }
  }

  // Left wall — painted cinder block + lockers
  const leftWallTiles = [];
  for (let i = 0; i < TILE_COUNT; i++) {
    // Upper wall (painted)
    const upper = makeBox(0.15, HALL_HEIGHT * 0.52, TILE_LENGTH, 0x8bbfe0);  // school blue
    upper.position.set(-HALL_WIDTH / 2, HALL_HEIGHT * 0.74, -(i * TILE_LENGTH));
    group.add(upper);
    leftWallTiles.push(upper);

    // Lockers on lower half
    for (let li = 0; li < 3; li++) {
      const lockerGroup = buildLocker3D(0x4a7fc1, 0x3a6aaa);
      lockerGroup.position.set(
        -HALL_WIDTH / 2 + 0.25,
        HALL_HEIGHT * 0.22,
        -(i * TILE_LENGTH) + (li - 1) * (TILE_LENGTH / 3)
      );
      lockerGroup.rotation.y = Math.PI / 2;
      group.add(lockerGroup);
    }

    // Baseboard
    const base = makeBox(0.15, 0.18, TILE_LENGTH, 0x3355aa);
    base.position.set(-HALL_WIDTH / 2, 0.09, -(i * TILE_LENGTH));
    group.add(base);
  }

  // Right wall — painted + bulletin boards + lockers
  const rightWallTiles = [];
  for (let i = 0; i < TILE_COUNT; i++) {
    const upper = makeBox(0.15, HALL_HEIGHT * 0.52, TILE_LENGTH, 0x8bbfe0);
    upper.position.set(HALL_WIDTH / 2, HALL_HEIGHT * 0.74, -(i * TILE_LENGTH));
    group.add(upper);
    rightWallTiles.push(upper);

    // Lockers
    for (let li = 0; li < 3; li++) {
      const lockerGroup = buildLocker3D(0x4a7fc1, 0x3a6aaa);
      lockerGroup.position.set(
        HALL_WIDTH / 2 - 0.25,
        HALL_HEIGHT * 0.22,
        -(i * TILE_LENGTH) + (li - 1) * (TILE_LENGTH / 3)
      );
      lockerGroup.rotation.y = -Math.PI / 2;
      group.add(lockerGroup);
    }

    // Bulletin board every 3rd tile
    if (i % 3 === 0) {
      const board = makeBox(0.1, 1.2, 2.2, 0x8B4513);
      board.position.set(HALL_WIDTH / 2 - 0.12, HALL_HEIGHT * 0.7, -(i * TILE_LENGTH));
      const paper = makeBox(0.08, 1.0, 2.0, 0xf5deb3);
      paper.position.set(0.05, 0, 0);
      board.add(paper);
      group.add(board);
    }

    const base = makeBox(0.15, 0.18, TILE_LENGTH, 0x3355aa);
    base.position.set(HALL_WIDTH / 2, 0.09, -(i * TILE_LENGTH));
    group.add(base);
  }

  scene.add(group);
  return { group, floorTiles, ceilTiles, leftWallTiles, rightWallTiles };
}

// ─── Locker 3D model ──────────────────────────────────────────────────────
function buildLocker3D(bodyColor, shadowColor) {
  const g = new THREE.Group();
  // Body
  const body = makeBox(2.2, 1.6, 0.5, bodyColor);
  body.castShadow = true;
  g.add(body);
  // Door seam
  const seam = makeBox(2.22, 0.03, 0.52, shadowColor);
  g.add(seam);
  // Handle
  const handle = makeBox(0.06, 0.22, 0.12, 0xc0c0c0);
  handle.position.set(0.5, 0, 0.32);
  g.add(handle);
  // Vent slats
  for (let v = 0; v < 3; v++) {
    const vent = makeBox(1.4, 0.06, 0.12, 0x000000, { transparent: true, opacity: 0.35 });
    vent.position.set(0, 0.45 - v * 0.25, 0.27);
    g.add(vent);
  }
  // Number plate
  const plate = makeBox(0.35, 0.25, 0.08, 0xffffff, { transparent: true, opacity: 0.7 });
  plate.position.set(-0.5, 0.5, 0.27);
  g.add(plate);
  return g;
}

// ─── Player character (back-facing, Subway Surfers style) ─────────────────
function buildPlayer() {
  const g = new THREE.Group();

  // Shoes
  const shoeL = makeBox(0.32, 0.22, 0.55, 0xff2d9b);
  shoeL.position.set(-0.22, 0.11, 0.1);
  const shoeR = makeBox(0.32, 0.22, 0.55, 0xff2d9b);
  shoeR.position.set(0.22, 0.11, 0.1);
  g.add(shoeL, shoeR);

  // Legs
  const legL = makeBox(0.28, 0.72, 0.28, 0x1565c0);
  legL.position.set(-0.22, 0.58, 0);
  const legR = makeBox(0.28, 0.72, 0.28, 0x1565c0);
  legR.position.set(0.22, 0.58, 0);
  g.add(legL, legR);

  // Torso (jersey)
  const torso = makeBox(0.72, 0.72, 0.38, 0xff6b00);
  torso.position.set(0, 1.22, 0);
  // Number "7" represented as slightly darker box on front
  const num = makeBox(0.22, 0.28, 0.06, 0xffaa44, { transparent: true, opacity: 0.9 });
  num.position.set(0, 0, -0.22);
  torso.add(num);
  g.add(torso);

  // Backpack (visible from behind)
  const pack = makeBox(0.54, 0.62, 0.28, 0x06b6d4);
  pack.position.set(0, 1.22, 0.32);
  const packPocket = makeBox(0.36, 0.32, 0.1, 0x0891b2);
  packPocket.position.set(0, -0.14, 0.52);
  pack.add(packPocket);
  g.add(pack);

  // Arms
  const armL = makeBox(0.22, 0.62, 0.22, 0xff6b00);
  armL.position.set(-0.52, 1.1, 0);
  const armR = makeBox(0.22, 0.62, 0.22, 0xff6b00);
  armR.position.set(0.52, 1.1, 0);
  g.add(armL, armR);

  // Neck
  const neck = makeBox(0.2, 0.18, 0.18, 0xffcc80);
  neck.position.set(0, 1.68, 0);
  g.add(neck);

  // Head (we see the back)
  const head = makeBox(0.58, 0.58, 0.52, 0xffcc80);
  head.position.set(0, 2.08, 0);
  g.add(head);

  // Hair / cap (pink cap, brim pointing forward = toward us = toward -z since camera is behind)
  const capTop = makeBox(0.64, 0.2, 0.56, 0xff2d9b);
  capTop.position.set(0, 0.34, -0.02);
  head.add(capTop);
  const capBrim = makeBox(0.72, 0.08, 0.28, 0xe0186a);
  capBrim.position.set(0, 0.2, -0.36);  // brim sticks out toward us (behind player = positive z from camera view, so -z in world)
  head.add(capBrim);

  // Store references for animation
  g.userData = {
    legL, legR, armL, armR,
    shoeL, shoeR,
    phase: 0,
    isJumping: false,
    isSliding: false,
    jumpVel: 0,
    groundY: 0,
  };

  return g;
}

// ─── Obstacle 3D models ───────────────────────────────────────────────────

function buildCone3D() {
  const g = new THREE.Group();
  // Cone body
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.55, 1.4, 12),
    new THREE.MeshLambertMaterial({ color: 0xff6b00 })
  );
  cone.position.y = 0.85;
  cone.castShadow = true;
  g.add(cone);
  // Reflective stripe
  const stripe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 0.14, 12),
    new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.3 })
  );
  stripe.position.y = 0.7;
  g.add(stripe);
  const stripe2 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.1, 12),
    new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.3 })
  );
  stripe2.position.y = 1.0;
  g.add(stripe2);
  // Base
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.62, 0.14, 16),
    new THREE.MeshLambertMaterial({ color: 0x7c2d12 })
  );
  base.position.y = 0.07;
  g.add(base);
  g.userData = { kind: "obstacle", subtype: "cone" };
  return g;
}

function buildLockerObstacle3D() {
  const g = new THREE.Group();
  // Main locker body — big red school locker obstacle
  const body = makeBox(1.1, 2.4, 0.65, 0xc62828);
  body.position.y = 1.2;
  body.castShadow = true;
  g.add(body);
  // Door detail
  const door = makeBox(0.9, 2.0, 0.08, 0x9e1b1b);
  door.position.set(0, 1.2, -0.37);
  g.add(door);
  // Handle — gold sphere
  const handle = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 8, 8),
    new THREE.MeshLambertMaterial({ color: 0xf4b942, emissive: 0xf4b942, emissiveIntensity: 0.2 })
  );
  handle.position.set(0.3, 1.2, -0.42);
  g.add(handle);
  // Vents
  for (let v = 0; v < 3; v++) {
    const vent = makeBox(0.7, 0.07, 0.06, 0x1a0000, { transparent: true, opacity: 0.5 });
    vent.position.set(0, 1.9 - v * 0.28, -0.38);
    g.add(vent);
  }
  // Number
  const num = makeBox(0.28, 0.2, 0.04, 0xffffff, { transparent: true, opacity: 0.8 });
  num.position.set(-0.2, 2.0, -0.38);
  g.add(num);
  g.userData = { kind: "obstacle", subtype: "locker" };
  return g;
}

function buildBackpack3D() {
  const g = new THREE.Group();
  // Main bag body
  const body = makeBox(0.95, 1.3, 0.55, 0x5e35b1);
  body.position.y = 0.75;
  body.castShadow = true;
  g.add(body);
  // Front pocket
  const pocket = makeBox(0.72, 0.62, 0.14, 0x4527a0);
  pocket.position.set(0, 0.4, -0.35);
  g.add(pocket);
  // Zipper
  const zip = makeBox(0.58, 0.06, 0.06, 0xbdbdbd);
  zip.position.set(0, 0.72, -0.42);
  g.add(zip);
  // Straps
  const strapL = makeBox(0.12, 1.1, 0.12, 0x3a1f8a);
  strapL.position.set(-0.3, 0.75, 0.3);
  const strapR = makeBox(0.12, 1.1, 0.12, 0x3a1f8a);
  strapR.position.set(0.3, 0.75, 0.3);
  g.add(strapL, strapR);
  g.userData = { kind: "obstacle", subtype: "backpack" };
  return g;
}

function buildCoin3D() {
  const g = new THREE.Group();
  const coin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.32, 0.1, 16),
    new THREE.MeshLambertMaterial({ color: 0xffe600, emissive: 0xffcc00, emissiveIntensity: 0.5 })
  );
  coin.rotation.x = Math.PI / 2;  // face toward camera
  g.add(coin);
  // Dollar sign ring
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.28, 0.04, 8, 16),
    new THREE.MeshLambertMaterial({ color: 0xffa000, emissive: 0xff8800, emissiveIntensity: 0.3 })
  );
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  g.userData = { kind: "coin", spinSpeed: 2.5 + Math.random() * 1.5 };
  return g;
}

function buildFlashcard3D() {
  const g = new THREE.Group();
  const card = makeBox(1.0, 0.72, 0.06, 0x0d2a5e);
  card.material = new THREE.MeshLambertMaterial({
    color: 0x0d2a5e,
    emissive: 0x0a4488,
    emissiveIntensity: 0.4,
  });
  g.add(card);
  // Border glow
  const border = makeBox(1.1, 0.82, 0.04, 0x00f5ff);
  border.material = new THREE.MeshLambertMaterial({
    color: 0x00f5ff,
    emissive: 0x00f5ff,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.7,
  });
  border.position.z = 0.02;
  g.add(border);
  // "?" mark as small box
  const q = makeBox(0.12, 0.38, 0.1, 0xffffff);
  q.material = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xaaaaff, emissiveIntensity: 0.5 });
  g.add(q);
  g.userData = { kind: "card", question: rndQ(), floatPhase: Math.random() * Math.PI * 2 };
  return g;
}

// ─── Main Component ───────────────────────────────────────────────────────
export default function FlashcardDash({ studySet }) {
  const mountRef = useRef(null);
  const threeRef = useRef(null);  // holds all Three.js objects
  const gameStateRef = useRef(null);
  const animFrameRef = useRef(null);

  // React UI state
  const [phase, setPhase]               = useState("idle");
  const [score, setScore]               = useState(0);
  const [distance, setDistance]         = useState(0);
  const [coins, setCoins]               = useState(0);
  const [hearts, setHearts]             = useState(START_HEARTS);
  const [streak, setStreak]             = useState(0);
  const [bestStreak, setBestStreak]     = useState(0);
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [answerStatus, setAnswerStatus] = useState(null);
  const [comboText, setComboText]       = useState(null);
  const [speed, setSpeed]               = useState(START_SPEED);

  const phaseRef = useRef("idle");
  const heartRef = useRef(START_HEARTS);
  const scoreRef = useRef(0);
  const streakRef = useRef(0);
  const coinsRef = useRef(0);
  const distRef  = useRef(0);
  const speedRef = useRef(START_SPEED);

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ── Three.js setup ──────────────────────────────────────────────────────
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x001122);
    container.appendChild(renderer.domElement);
    renderer.domElement.className = "fd-canvas";

    // Scene
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x001122, 18, 55);

    // Camera — positioned behind player, looking forward down the hall
    const camera = new THREE.PerspectiveCamera(65, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 3.8, 7.5);
    camera.lookAt(0, 2.0, -15);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);

    // Ceiling lights (point lights simulating fluorescent)
    const lightPositions = [-8, -16, -24, -32, -40];
    lightPositions.forEach(z => {
      const pl = new THREE.PointLight(0xffffee, 1.4, 18);
      pl.position.set(0, HALL_HEIGHT - 0.3, z);
      pl.castShadow = false;
      scene.add(pl);
    });

    // Directional light from front for depth
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.4);
    dirLight.position.set(0, 8, 10);
    scene.add(dirLight);

    // Build hallway
    const hallway = buildHallway(scene);

    // Build player
    const player = buildPlayer();
    player.position.set(LANE_POSITIONS[1], 0, 4.5);
    player.rotation.y = Math.PI; // face away from camera (back to us)
    scene.add(player);

    // Item pools
    const itemPool = [];  // active 3D items in scene

    // Resize handler
    function onResize() {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    onResize();
    window.addEventListener("resize", onResize);

    // Store everything
    threeRef.current = {
      renderer, scene, camera,
      player, hallway, itemPool,
      cameraTargetX: 0,
      cameraLean: 0,
    };

    // Init game state
    gameStateRef.current = {
      speed: START_SPEED,
      hallZ: 0,      // how far we've scrolled (we move world toward +z)
      spawnObs: 0,
      spawnCoin: 0,
      spawnCard: 0,
      playerLane: 1,
      targetLane: 1,
      playerX: LANE_POSITIONS[1],
      jumping: false,
      sliding: false,
      jumpVel: 0,
      playerY: 0,
      runPhase: 0,
      shakeDur: 0,
      lastFrame: performance.now(),
    };

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(animFrameRef.current);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // ── Animation loop ──────────────────────────────────────────────────────
  useEffect(() => {
    function animate(now) {
      animFrameRef.current = requestAnimationFrame(animate);
      const three = threeRef.current;
      const gs    = gameStateRef.current;
      if (!three || !gs) return;

      const { renderer, scene, camera, player, hallway, itemPool } = three;
      const delta = Math.min((now - gs.lastFrame) / 16.67, 2.5);
      gs.lastFrame = now;

      const isRunning = phaseRef.current === "running";

      if (isRunning) {
        // Speed up
        gs.speed = Math.min(MAX_SPEED, gs.speed + 0.00015 * delta);
        speedRef.current = gs.speed;

        // Scroll world
        gs.hallZ += gs.speed * delta * 10;

        // Score + distance
        const ds = Math.floor(gs.speed * delta * 8);
        scoreRef.current += ds;
        distRef.current  += gs.speed * delta * 10;
        setScore(s => s + ds);
        setDistance(distRef.current);

        // Smooth lane change
        const targetX = LANE_POSITIONS[gs.targetLane];
        gs.playerX += (targetX - gs.playerX) * 0.18 * delta;
        player.position.x = gs.playerX;

        // Camera lean into lane change
        three.cameraLean += ((gs.playerX * 0.18) - three.cameraLean) * 0.1 * delta;
        camera.position.x = three.cameraLean;

        // Jump physics
        if (gs.jumping) {
          gs.jumpVel -= 0.025 * delta;
          gs.playerY += gs.jumpVel * delta;
          if (gs.playerY <= 0) {
            gs.playerY = 0;
            gs.jumping = false;
            gs.jumpVel = 0;
          }
        }
        player.position.y = gs.playerY;

        // Slide: scale player vertically
        if (gs.sliding) {
          player.scale.y += (0.52 - player.scale.y) * 0.22 * delta;
        } else {
          player.scale.y += (1.0 - player.scale.y) * 0.18 * delta;
        }

        // Run animation
        gs.runPhase += gs.speed * delta * 6;
        const pu = player.userData;
        if (!gs.jumping && !gs.sliding) {
          pu.legL.rotation.x =  Math.sin(gs.runPhase) * 0.55;
          pu.legR.rotation.x = -Math.sin(gs.runPhase) * 0.55;
          pu.armL.rotation.x = -Math.sin(gs.runPhase) * 0.45;
          pu.armR.rotation.x =  Math.sin(gs.runPhase) * 0.45;
          pu.shoeL.rotation.x = Math.sin(gs.runPhase) * 0.3;
          pu.shoeR.rotation.x = -Math.sin(gs.runPhase) * 0.3;
        } else if (gs.jumping) {
          pu.legL.rotation.x = -0.6;
          pu.legR.rotation.x = -0.6;
          pu.armL.rotation.x = -1.0;
          pu.armR.rotation.x = -1.0;
        }

        // Screen shake on hit
        if (gs.shakeDur > 0) {
          gs.shakeDur -= delta;
          camera.position.x += (Math.random() - 0.5) * 0.12;
          camera.position.y = 3.8 + (Math.random() - 0.5) * 0.08;
        } else {
          camera.position.y += (3.8 - camera.position.y) * 0.1;
        }

        // Recycle hallway tiles
        recycleHallway(hallway, gs.hallZ);

        // Spawn items
        gs.spawnObs  += delta;
        gs.spawnCoin += delta;
        gs.spawnCard += delta;

        const obsThresh = Math.max(28, 72 - gs.speed * 80);
        if (gs.spawnObs > obsThresh) {
          gs.spawnObs = 0;
          spawnObstacle(scene, itemPool, gs.hallZ);
        }
        if (gs.spawnCoin > 12) {
          gs.spawnCoin = 0;
          spawnCoins(scene, itemPool, gs.hallZ);
        }
        if (gs.spawnCard > 210) {
          gs.spawnCard = 0;
          spawnCard(scene, itemPool, gs.hallZ);
        }

        // Animate items + collision
        const playerWorldZ = player.position.z;
        const playerWorldX = player.position.x;
        const playerTop    = gs.playerY + 2.3 * player.scale.y;
        const COLL_X = 1.4;
        const COLL_Z_NEAR = 0.8;
        const COLL_Z_FAR  = 2.5;

        const toRemove = [];
        for (const item of itemPool) {
          item.mesh.position.z += gs.speed * delta * 10;

          // Animate
          if (item.kind === "coin") {
            item.mesh.rotation.y += (item.mesh.userData.spinSpeed || 2) * delta * 0.08;
            item.mesh.position.y = item.baseY + Math.sin(now * 0.002 + item.mesh.position.x) * 0.15;
          }
          if (item.kind === "card") {
            const fp = item.mesh.userData.floatPhase || 0;
            item.mesh.position.y = item.baseY + Math.sin(now * 0.0015 + fp) * 0.2;
            item.mesh.rotation.y = Math.sin(now * 0.001 + fp) * 0.3;
          }

          // Cull far behind
          if (item.mesh.position.z > playerWorldZ + 6) {
            toRemove.push(item);
            continue;
          }

          // Collision check
          const dz = Math.abs(item.mesh.position.z - playerWorldZ);
          const dx = Math.abs(item.mesh.position.x - playerWorldX);

          if (dz < COLL_Z_FAR && dz > COLL_Z_NEAR - 0.5 && dx < COLL_X) {
            if (item.kind === "coin") {
              coinsRef.current += 1;
              scoreRef.current += 20;
              setCoins(c => c + 1);
              setScore(s => s + 20);
              toRemove.push(item);
              continue;
            }
            if (item.kind === "card") {
              setActiveQuestion(item.question);
              setPhase("question");
              phaseRef.current = "question";
              toRemove.push(item);
              continue;
            }
            if (item.kind === "obstacle") {
              // Dodge checks
              if (item.subtype === "cone" && gs.playerY > 0.9) { continue; }
              if (item.subtype === "locker" && gs.sliding) { continue; }
              // HIT
              const nh = Math.max(0, heartRef.current - 1);
              heartRef.current = nh;
              setHearts(nh);
              streakRef.current = 0;
              setStreak(0);
              gs.shakeDur = 18;
              if (nh <= 0) {
                setPhase("gameover");
                phaseRef.current = "gameover";
              }
              toRemove.push(item);
            }
          }
        }

        for (const item of toRemove) {
          scene.remove(item.mesh);
          const idx = itemPool.indexOf(item);
          if (idx !== -1) itemPool.splice(idx, 1);
        }
      } else {
        // Still animate run cycle gently while idle/paused
        gs.runPhase += 0.04 * delta;
        const pu = player.userData;
        pu.legL.rotation.x = Math.sin(gs.runPhase) * 0.15;
        pu.legR.rotation.x = -Math.sin(gs.runPhase) * 0.15;
      }

      // Always render
      renderer.render(scene, camera);
    }

    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []); // single loop, reads phaseRef

  // ── Hallway tile recycling ──────────────────────────────────────────────
  function recycleHallway(hallway, hallZ) {
    const farZ = -(TILE_COUNT * TILE_LENGTH);
    // Move tiles that are behind camera far ahead
    for (const tile of hallway.floorTiles) {
      if (tile.position.z + hallZ > 12) {
        tile.position.z -= TILE_COUNT * TILE_LENGTH;
      }
    }
    for (const tile of hallway.ceilTiles) {
      if (tile.position.z + hallZ > 12) {
        tile.position.z -= TILE_COUNT * TILE_LENGTH;
      }
    }
  }

  function spawnObstacle(scene, pool, hallZ) {
    const lane = rndLane();
    const builders = [buildCone3D, buildLockerObstacle3D, buildBackpack3D];
    const mesh = builders[Math.floor(Math.random() * 3)]();
    mesh.position.set(LANE_POSITIONS[lane], 0, -45 + hallZ % 8);
    scene.add(mesh);
    pool.push({ mesh, kind: mesh.userData.kind, subtype: mesh.userData.subtype, baseY: 0, lane });
  }

  function spawnCoins(scene, pool, hallZ) {
    const lane = rndLane();
    const count = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const mesh = buildCoin3D();
      mesh.position.set(LANE_POSITIONS[lane], 1.2 + i * 0.1, -42 - i * 1.8 + hallZ % 8);
      scene.add(mesh);
      pool.push({ mesh, kind: "coin", baseY: 1.2, lane });
    }
  }

  function spawnCard(scene, pool, hallZ) {
    const lane = rndLane();
    const mesh = buildFlashcard3D();
    mesh.position.set(LANE_POSITIONS[lane], 1.6, -42 + hallZ % 8);
    scene.add(mesh);
    pool.push({ mesh, kind: "card", question: mesh.userData.question, baseY: 1.6, lane });
  }

  // ── Game start/reset ────────────────────────────────────────────────────
  function startGame() {
    const three = threeRef.current;
    const gs = gameStateRef.current;
    if (!three || !gs) return;

    // Clear items
    for (const item of three.itemPool) {
      three.scene.remove(item.mesh);
    }
    three.itemPool.length = 0;

    // Reset state
    gs.speed = START_SPEED;
    gs.hallZ = 0;
    gs.spawnObs = 0;
    gs.spawnCoin = 0;
    gs.spawnCard = 0;
    gs.playerLane = 1;
    gs.targetLane = 1;
    gs.playerX = LANE_POSITIONS[1];
    gs.jumping = false;
    gs.sliding = false;
    gs.jumpVel = 0;
    gs.playerY = 0;
    gs.runPhase = 0;
    gs.shakeDur = 0;
    three.player.position.set(LANE_POSITIONS[1], 0, 4.5);
    three.player.scale.set(1, 1, 1);
    three.cameraLean = 0;
    three.camera.position.set(0, 3.8, 7.5);

    heartRef.current = START_HEARTS;
    scoreRef.current = 0;
    streakRef.current = 0;
    coinsRef.current = 0;
    distRef.current = 0;
    speedRef.current = START_SPEED;

    setHearts(START_HEARTS);
    setScore(0);
    setDistance(0);
    setCoins(0);
    setStreak(0);
    setActiveQuestion(null);
    setAnswerStatus(null);
    setComboText(null);
    setPhase("running");
    phaseRef.current = "running";
    gs.lastFrame = performance.now();
  }

  // ── Controls ────────────────────────────────────────────────────────────
  const moveLeft = useCallback(() => {
    const gs = gameStateRef.current;
    if (!gs || phaseRef.current !== "running") return;
    gs.targetLane = Math.max(0, gs.targetLane - 1);
    gs.playerLane = gs.targetLane;
  }, []);

  const moveRight = useCallback(() => {
    const gs = gameStateRef.current;
    if (!gs || phaseRef.current !== "running") return;
    gs.targetLane = Math.min(2, gs.targetLane + 1);
    gs.playerLane = gs.targetLane;
  }, []);

  const doJump = useCallback(() => {
    const gs = gameStateRef.current;
    if (!gs || phaseRef.current !== "running" || gs.jumping || gs.sliding) return;
    gs.jumping = true;
    gs.jumpVel = 0.38;
  }, []);

  const doSlide = useCallback(() => {
    const gs = gameStateRef.current;
    if (!gs || phaseRef.current !== "running" || gs.sliding || gs.jumping) return;
    gs.sliding = true;
    setTimeout(() => { if (gs) gs.sliding = false; }, 600);
  }, []);

  const togglePause = useCallback(() => {
    if (phaseRef.current === "running") {
      setPhase("paused");
      phaseRef.current = "paused";
    } else if (phaseRef.current === "paused") {
      setPhase("running");
      phaseRef.current = "running";
      if (gameStateRef.current) gameStateRef.current.lastFrame = performance.now();
    }
  }, []);

  // Keyboard
  useEffect(() => {
    function onKey(e) {
      if (e.key === "ArrowLeft"  || e.key.toLowerCase() === "a") moveLeft();
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") moveRight();
      if (e.key === "ArrowUp"    || e.key === " ") { e.preventDefault(); doJump(); }
      if (e.key === "ArrowDown"  || e.key.toLowerCase() === "s") doSlide();
      if (e.key.toLowerCase() === "p") togglePause();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moveLeft, moveRight, doJump, doSlide, togglePause]);

  // ── Question UI ──────────────────────────────────────────────────────────
  function answerQuestion(idx) {
    if (!activeQuestion || answerStatus) return;
    const correct = idx === activeQuestion.correct;
    if (correct) {
      const ns = streakRef.current + 1;
      const bonus = 150 + ns * 30;
      streakRef.current = ns;
      scoreRef.current += bonus;
      coinsRef.current += 8 + Math.min(ns, 10);
      setStreak(ns);
      setBestStreak(b => Math.max(b, ns));
      setScore(s => s + bonus);
      setCoins(c => c + 8 + Math.min(ns, 10));
      setAnswerStatus("correct");
      if (ns >= 3) { setComboText(`${ns}× COMBO! 🔥`); setTimeout(() => setComboText(null), 1600); }
    } else {
      streakRef.current = 0;
      const nh = Math.max(0, heartRef.current - 1);
      heartRef.current = nh;
      setStreak(0);
      setHearts(nh);
      setAnswerStatus("wrong");
      if (nh <= 0) {
        setTimeout(() => {
          setAnswerStatus(null);
          setActiveQuestion(null);
          setPhase("gameover");
          phaseRef.current = "gameover";
        }, 800);
      }
    }
  }

  function closeQuestion() {
    setActiveQuestion(null);
    setAnswerStatus(null);
    setPhase("running");
    phaseRef.current = "running";
    if (gameStateRef.current) gameStateRef.current.lastFrame = performance.now();
  }

  function continueQuestions() {
    setAnswerStatus(null);
    setActiveQuestion(rndQ());
  }

  const distM = Math.floor(distance / 10);

  return (
    <div className="fd-page">
      {/* Header */}
      <div className="fd-header">
        <div className="fd-title-block">
          <p className="fd-eyebrow">Gradeify Games</p>
          <h1>Flashcard Dash</h1>
          <p className="fd-subtitle">Sprint the school hall — dodge obstacles, grab coins, answer flashcards!</p>
        </div>
        <div className="fd-header-btns">
          <button className="fd-btn-primary" onClick={startGame}>
            {phase === "gameover" || phase === "idle" ? "Start Run" : "Restart"}
          </button>
          <button
            className="fd-btn-secondary"
            onClick={togglePause}
            disabled={phase === "idle" || phase === "gameover" || phase === "question"}
          >
            {phase === "running" ? "Pause" : "Resume"}
          </button>
        </div>
      </div>

      {/* Stats HUD */}
      <div className="fd-stats">
        <div className="fd-stat"><span className="fd-stat-label">Score</span><strong className="fd-stat-value">{score.toLocaleString()}</strong></div>
        <div className="fd-stat"><span className="fd-stat-label">Distance</span><strong className="fd-stat-value">{distM}m</strong></div>
        <div className="fd-stat"><span className="fd-stat-label">Coins</span><strong className="fd-stat-value">{coins}</strong></div>
        <div className="fd-stat"><span className="fd-stat-label">Hearts</span><strong className="fd-stat-value" style={{ fontSize: "1rem" }}>{"❤️".repeat(Math.max(0, hearts)) || "—"}</strong></div>
        <div className="fd-stat"><span className="fd-stat-label">Streak</span><strong className="fd-stat-value">{streak}🔥</strong></div>
        <div className="fd-stat"><span className="fd-stat-label">Best</span><strong className="fd-stat-value">{bestStreak}</strong></div>
      </div>

      {/* 3D Game Canvas */}
      <div className="fd-game-wrap" ref={mountRef}>
        {/* Combo notice */}
        {comboText && <div className="fd-combo" key={comboText}>{comboText}</div>}

        {/* Start screen */}
        {phase === "idle" && (
          <div className="fd-overlay">
            <div className="fd-card">
              <p className="fd-eyebrow">Ready?</p>
              <h2>Flashcard Dash</h2>
              <p>Run through the school hallway. Jump over cones, slide under lockers, grab flashcards for bonus points.</p>
              <div className="fd-key-grid">
                <div className="fd-key-row"><kbd>← / A</kbd><span>Move left</span></div>
                <div className="fd-key-row"><kbd>→ / D</kbd><span>Move right</span></div>
                <div className="fd-key-row"><kbd>↑ / Space</kbd><span>Jump (clears cones)</span></div>
                <div className="fd-key-row"><kbd>↓ / S</kbd><span>Slide (ducks lockers)</span></div>
              </div>
              <button className="fd-btn-primary" onClick={startGame}>Start Flashcard Dash</button>
            </div>
          </div>
        )}

        {/* Paused */}
        {phase === "paused" && (
          <div className="fd-overlay">
            <div className="fd-card">
              <p className="fd-eyebrow">Paused</p>
              <h2>Game Paused</h2>
              <p>Press <strong>P</strong> or Resume to keep running.</p>
              <button className="fd-btn-primary" onClick={togglePause}>Resume</button>
            </div>
          </div>
        )}

        {/* Game over */}
        {phase === "gameover" && (
          <div className="fd-overlay">
            <div className="fd-card">
              <p className="fd-eyebrow">Run Over</p>
              <h2>Game Over</h2>
              <div className="fd-final-grid">
                <div><span>Score</span><strong>{score.toLocaleString()}</strong></div>
                <div><span>Distance</span><strong>{distM}m</strong></div>
                <div><span>Coins</span><strong>{coins}</strong></div>
                <div><span>Best Streak</span><strong>{bestStreak}🔥</strong></div>
              </div>
              <button className="fd-btn-primary" onClick={startGame}>Run Again</button>
            </div>
          </div>
        )}

        {/* Question modal */}
        {phase === "question" && activeQuestion && (
          <div className="fd-question-backdrop">
            <div className="fd-question-modal">
              <button className="fd-q-close" onClick={closeQuestion}>×</button>
              <p className="fd-eyebrow">Flashcard Checkpoint</p>
              <h2>{activeQuestion.q}</h2>
              <div className="fd-options">
                {activeQuestion.opts.map((opt, idx) => {
                  let cls = "fd-option";
                  if (answerStatus) {
                    if (idx === activeQuestion.correct) cls += " correct";
                    else if (answerStatus === "wrong") cls += " muted";
                  }
                  return (
                    <button key={opt} className={cls} onClick={() => answerQuestion(idx)} disabled={!!answerStatus}>
                      <span className="opt-letter">{String.fromCharCode(65 + idx)}</span>
                      {opt}
                    </button>
                  );
                })}
              </div>
              {answerStatus === "correct" && (
                <div className="fd-answer-fb correct">Correct! Streak: {streak} 🔥  +{150 + streak * 30} pts</div>
              )}
              {answerStatus === "wrong" && (
                <div className="fd-answer-fb wrong">
                  Nope! Answer: <strong>{activeQuestion.opts[activeQuestion.correct]}</strong>
                </div>
              )}
              <div className="fd-q-actions">
                <button className="fd-btn-ghost" onClick={closeQuestion}>Back to Run</button>
                <button className="fd-btn-primary" onClick={continueQuestions} disabled={!answerStatus}>Next Question</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* On-screen controls */}
      <div className="fd-controls">
        <button onClick={moveLeft}>← Left</button>
        <button onClick={doJump}>↑ Jump</button>
        <button onClick={doSlide}>↓ Slide</button>
        <button onClick={moveRight}>Right →</button>
      </div>
    </div>
  );
}