import React, { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import "../../styles/FlashcardDash.css";

const LANE_POSITIONS = [-2.9, 0, 2.9];

const START_SPEED = 0.105;
const MAX_SPEED = 0.38;
const SPEED_GAIN = 0.00018;
const LANE_SWITCH_SNAP = 0.34;
const GRAVITY = 0.026;
const JUMP_POWER = 0.45;
const SLIDE_DURATION = 720;

const HALL_WIDTH = 11.5;
const HALL_HEIGHT = 7.4;
const START_HEARTS = 3;

const TILE_LENGTH = 11;
const TILE_COUNT = 20;
const PLAYER_Z = 4.4;
const SPAWN_Z = -58;
const PLATFORM_TOP_Y = 1.52;

const QUESTION_BANK = [
  {
    q: "What is the main purpose of photosynthesis?",
    opts: ["To create glucose using sunlight", "To break down rocks", "To make oxygen from glucose", "To digest proteins"],
    correct: 0,
  },
  {
    q: "What does slope represent in y = mx + b?",
    opts: ["The x-intercept", "The rate of change", "The y-intercept", "The maximum value"],
    correct: 1,
  },
  {
    q: "Which organelle is the powerhouse of the cell?",
    opts: ["Nucleus", "Ribosome", "Mitochondria", "Golgi apparatus"],
    correct: 2,
  },
  {
    q: "What is opportunity cost?",
    opts: ["Total money spent", "The value of the next best alternative", "A fixed expense", "Profit after taxes"],
    correct: 1,
  },
  {
    q: "What is the derivative of x²?",
    opts: ["x", "2x", "x³", "2"],
    correct: 1,
  },
  {
    q: "Which molecule carries genetic information?",
    opts: ["ATP", "DNA", "Glucose", "Water"],
    correct: 1,
  },
  {
    q: "What does inflation mean?",
    opts: ["Prices generally rise over time", "Prices always fall", "Interest rates are zero", "The stock market closes"],
    correct: 0,
  },
  {
    q: "What does a topic sentence usually do?",
    opts: ["Ends the essay", "Introduces the main idea", "Lists citations", "Creates bibliography"],
    correct: 1,
  },
  {
    q: "What is Newton's Second Law?",
    opts: ["F = ma", "E = mc²", "V = IR", "PV = nRT"],
    correct: 0,
  },
  {
    q: "Which planet is closest to the Sun?",
    opts: ["Venus", "Earth", "Mercury", "Mars"],
    correct: 2,
  },
];

function rndLane() {
  return Math.floor(Math.random() * 3);
}

function choice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function normalizeStudyQuestion(item) {
  if (!item) return choice(QUESTION_BANK);
  if (item.q && Array.isArray(item.opts)) return item;

  const q = item.question || item.prompt || item.text || item.term || "Answer this question";
  const correctAnswer = item.correctAnswer || item.answer || item.correct || item.solution || item.definition || "";
  let opts = item.opts || item.choices || item.options || item.answers || [];

  if (!Array.isArray(opts)) opts = [];

  if (opts.length < 2 && correctAnswer) {
    opts = shuffleArray([correctAnswer, "A related but incorrect answer", "An unrelated concept", "None of the above"]);
  }

  let correct = opts.findIndex((opt) => String(opt) === String(correctAnswer));
  if (typeof item.correct === "number" && item.opts) correct = item.correct;

  if (correct < 0) {
    correct = 0;
    if (correctAnswer && opts[0] !== correctAnswer) {
      opts = [correctAnswer, ...opts.filter((opt) => opt !== correctAnswer)].slice(0, 4);
    }
  }

  return { q, opts: opts.slice(0, 4), correct };
}

function rndQ(studySet) {
  const questions = studySet?.questions?.length ? studySet.questions : QUESTION_BANK;
  return normalizeStudyQuestion(choice(questions));
}

function makeMaterial(color, opts = {}) {
  return new THREE.MeshPhongMaterial({ color, shininess: 48, specular: 0x222222, ...opts });
}

function makeBox(w, h, d, color, opts = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d, 3, 3, 3), makeMaterial(color, opts));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeSphere(r, color, opts = {}) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 20), makeMaterial(color, opts));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeCapsule(radius, length, color, opts = {}) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 12, 24), makeMaterial(color, opts));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeCylinder(rTop, rBottom, h, segs, color, opts = {}) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segs, 2), makeMaterial(color, opts));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function disposeObject(obj) {
  obj.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach((mat) => mat.dispose());
      else child.material.dispose();
    }
  });
}

function buildLocker3D(bodyColor, shadowColor) {
  const g = new THREE.Group();
  const body = makeBox(1.7, 1.45, 0.34, bodyColor);
  g.add(body);

  const seam = makeBox(0.035, 1.35, 0.04, shadowColor);
  seam.position.set(0, 0, -0.22);
  g.add(seam);

  const shine = makeBox(0.08, 1.22, 0.035, 0xffffff, { transparent: true, opacity: 0.16 });
  shine.position.set(-0.52, 0.04, -0.2);
  g.add(shine);

  const handle = makeCylinder(0.045, 0.045, 0.16, 12, 0xd8dee9);
  handle.rotation.x = Math.PI / 2;
  handle.position.set(0.42, 0.02, -0.27);
  g.add(handle);

  for (let v = 0; v < 3; v += 1) {
    const vent = makeBox(0.78, 0.035, 0.035, 0x102a43, { transparent: true, opacity: 0.48 });
    vent.position.set(0, 0.43 - v * 0.2, -0.26);
    g.add(vent);
  }

  return g;
}

function buildHallSegment(index) {
  const segment = new THREE.Group();
  segment.position.z = -index * TILE_LENGTH;

  const floorColor = index % 2 === 0 ? 0xd9e3f0 : 0xcbd8e8;
  const floor = makeBox(HALL_WIDTH, 0.08, TILE_LENGTH, floorColor);
  floor.position.y = -0.04;
  segment.add(floor);

  const centerLine = makeBox(0.08, 0.018, TILE_LENGTH, 0xffcc66, { emissive: 0x332200, shininess: 80 });
  centerLine.position.set(0, 0.025, 0);
  segment.add(centerLine);

  [-1.45, 1.45].forEach((x) => {
    const laneLine = makeBox(0.045, 0.018, TILE_LENGTH, 0x7184a6, { transparent: true, opacity: 0.55 });
    laneLine.position.set(x, 0.032, 0);
    segment.add(laneLine);
  });

  const ceiling = makeBox(HALL_WIDTH, 0.14, TILE_LENGTH, 0xf8fbff);
  ceiling.position.y = HALL_HEIGHT;
  segment.add(ceiling);

  const light = makeBox(1.15, 0.08, 4.2, 0xffffdd, { emissive: 0xffe9a8, emissiveIntensity: 0.72, shininess: 90 });
  light.position.set(0, HALL_HEIGHT - 0.14, 0);
  segment.add(light);

  const leftWall = makeBox(0.16, HALL_HEIGHT, TILE_LENGTH, 0xaed8f4);
  leftWall.position.set(-HALL_WIDTH / 2, HALL_HEIGHT / 2, 0);
  segment.add(leftWall);

  const rightWall = makeBox(0.16, HALL_HEIGHT, TILE_LENGTH, 0xaed8f4);
  rightWall.position.set(HALL_WIDTH / 2, HALL_HEIGHT / 2, 0);
  segment.add(rightWall);

  const topStripeL = makeBox(0.18, 0.18, TILE_LENGTH, 0xf59e0b, { emissive: 0x271300, shininess: 80 });
  topStripeL.position.set(-HALL_WIDTH / 2 + 0.08, 2.25, 0);
  segment.add(topStripeL);

  const topStripeR = makeBox(0.18, 0.18, TILE_LENGTH, 0xf59e0b, { emissive: 0x271300, shininess: 80 });
  topStripeR.position.set(HALL_WIDTH / 2 - 0.08, 2.25, 0);
  segment.add(topStripeR);

  for (let li = 0; li < 3; li += 1) {
    const z = -TILE_LENGTH / 3 + li * (TILE_LENGTH / 3);
    const lockerL = buildLocker3D(0x5fa8e8, 0x2f6fae);
    lockerL.position.set(-HALL_WIDTH / 2 + 0.2, 0.9, z);
    lockerL.rotation.y = Math.PI / 2;
    segment.add(lockerL);

    const lockerR = buildLocker3D(0x5fa8e8, 0x2f6fae);
    lockerR.position.set(HALL_WIDTH / 2 - 0.2, 0.9, z);
    lockerR.rotation.y = -Math.PI / 2;
    segment.add(lockerR);
  }

  if (index % 3 === 0) {
    const banner = makeBox(0.08, 1.2, 2.6, 0x2563eb, { emissive: 0x071c55, shininess: 70 });
    banner.position.set(HALL_WIDTH / 2 - 0.14, 4.85, 0);
    segment.add(banner);

    const paper = makeBox(0.05, 0.58, 0.62, 0xfef3c7);
    paper.position.set(HALL_WIDTH / 2 - 0.21, 4.98, -0.52);
    segment.add(paper);

    const paper2 = makeBox(0.05, 0.45, 0.72, 0xdbeafe);
    paper2.position.set(HALL_WIDTH / 2 - 0.21, 4.68, 0.48);
    segment.add(paper2);
  }

  return segment;
}

function buildHallway(scene) {
  const group = new THREE.Group();
  const segments = [];
  for (let i = 0; i < TILE_COUNT; i += 1) {
    const segment = buildHallSegment(i);
    group.add(segment);
    segments.push(segment);
  }
  scene.add(group);
  return { group, segments };
}

function recycleHallway(hallway) {
  for (const segment of hallway.segments) {
    if (segment.position.z > 18) segment.position.z -= TILE_COUNT * TILE_LENGTH;
  }
}

function buildPlayer() {
  const g = new THREE.Group();

  const shoeL = makeCapsule(0.13, 0.3, 0xff2d9b);
  shoeL.rotation.x = Math.PI / 2;
  shoeL.position.set(-0.22, 0.13, 0.1);

  const shoeR = makeCapsule(0.13, 0.3, 0xff2d9b);
  shoeR.rotation.x = Math.PI / 2;
  shoeR.position.set(0.22, 0.13, 0.1);

  const legL = makeCapsule(0.13, 0.55, 0x1565c0);
  legL.position.set(-0.22, 0.56, 0);

  const legR = makeCapsule(0.13, 0.55, 0x1565c0);
  legR.position.set(0.22, 0.56, 0);

  const torso = makeCapsule(0.34, 0.4, 0xff6b00);
  torso.position.set(0, 1.25, 0);

  const pack = makeSphere(0.36, 0x06b6d4, { shininess: 85 });
  pack.scale.set(0.86, 1.08, 0.46);
  pack.position.set(0, 1.23, 0.32);

  const pocket = makeSphere(0.2, 0x0891b2);
  pocket.scale.set(1.2, 0.8, 0.35);
  pocket.position.set(0, -0.18, 0.24);
  pack.add(pocket);

  const armL = makeCapsule(0.1, 0.52, 0xff8a3d);
  armL.position.set(-0.48, 1.16, 0);

  const armR = makeCapsule(0.1, 0.52, 0xff8a3d);
  armR.position.set(0.48, 1.16, 0);

  const neck = makeCapsule(0.09, 0.08, 0xffcc80);
  neck.position.set(0, 1.69, 0);

  const head = makeSphere(0.31, 0xffcc80);
  head.scale.set(0.95, 1.05, 0.9);
  head.position.set(0, 2.05, 0);

  const hair = makeSphere(0.32, 0x27120c);
  hair.scale.set(0.98, 0.48, 0.95);
  hair.position.set(0, 0.17, 0.02);
  head.add(hair);

  const cap = makeSphere(0.33, 0xff2d9b, { shininess: 90 });
  cap.scale.set(1.02, 0.42, 0.9);
  cap.position.set(0, 0.2, -0.01);
  head.add(cap);

  const capBrim = makeCapsule(0.07, 0.36, 0xe0186a);
  capBrim.rotation.z = Math.PI / 2;
  capBrim.rotation.x = Math.PI / 2;
  capBrim.position.set(0, 0.08, -0.33);
  head.add(capBrim);

  g.add(shoeL, shoeR, legL, legR, torso, pack, armL, armR, neck, head);
  g.userData = { legL, legR, armL, armR, shoeL, shoeR, torso, pack, head };
  return g;
}

function buildCone3D() {
  const g = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.48, 1.35, 28, 2), makeMaterial(0xff6b00, { shininess: 65 }));
  cone.position.y = 0.78;
  cone.castShadow = true;
  g.add(cone);

  const stripe1 = makeCylinder(0.34, 0.38, 0.08, 28, 0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.18 });
  stripe1.position.y = 0.68;
  g.add(stripe1);

  const stripe2 = makeCylinder(0.25, 0.29, 0.07, 28, 0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.18 });
  stripe2.position.y = 0.96;
  g.add(stripe2);

  const base = makeCylinder(0.58, 0.58, 0.14, 32, 0x7c2d12);
  base.position.y = 0.07;
  g.add(base);
  g.userData = { kind: "obstacle", subtype: "cone" };
  return g;
}

function buildBackpack3D() {
  const g = new THREE.Group();
  const body = makeSphere(0.54, 0x5e35b1, { shininess: 70 });
  body.scale.set(0.9, 1.18, 0.65);
  body.position.y = 0.8;
  g.add(body);

  const pocket = makeSphere(0.29, 0x4527a0);
  pocket.scale.set(1.05, 0.75, 0.28);
  pocket.position.set(0, 0.48, -0.38);
  g.add(pocket);

  const zipper = makeCapsule(0.035, 0.48, 0xbdbdbd);
  zipper.rotation.z = Math.PI / 2;
  zipper.position.set(0, 0.76, -0.56);
  g.add(zipper);

  const strapL = makeCapsule(0.05, 0.82, 0x3a1f8a);
  strapL.position.set(-0.28, 0.77, 0.28);
  const strapR = makeCapsule(0.05, 0.82, 0x3a1f8a);
  strapR.position.set(0.28, 0.77, 0.28);
  g.add(strapL, strapR);

  g.userData = { kind: "obstacle", subtype: "backpack" };
  return g;
}

function buildLockerObstacle3D() {
  const g = new THREE.Group();
  const body = makeCapsule(0.5, 1.45, 0xc62828, { shininess: 75 });
  body.scale.x = 0.9;
  body.scale.z = 0.52;
  body.position.y = 1.25;
  g.add(body);

  const door = makeBox(0.65, 1.5, 0.06, 0x9e1b1b);
  door.position.set(0, 1.25, -0.31);
  g.add(door);

  const handle = makeSphere(0.09, 0xf4b942, { emissive: 0x553300, shininess: 100 });
  handle.position.set(0.26, 1.18, -0.37);
  g.add(handle);

  for (let v = 0; v < 3; v += 1) {
    const vent = makeBox(0.52, 0.05, 0.04, 0x1a0000, { transparent: true, opacity: 0.5 });
    vent.position.set(0, 1.72 - v * 0.2, -0.36);
    g.add(vent);
  }

  g.userData = { kind: "obstacle", subtype: "locker" };
  return g;
}

function buildBarrier3D() {
  const g = new THREE.Group();

  const leftPost = makeCylinder(0.12, 0.12, 2.25, 18, 0x334155);
  leftPost.position.set(-0.58, 1.1, 0);
  const rightPost = makeCylinder(0.12, 0.12, 2.25, 18, 0x334155);
  rightPost.position.set(0.58, 1.1, 0);
  g.add(leftPost, rightPost);

  const topBar = makeBox(1.5, 0.24, 0.22, 0xef4444, { emissive: 0x3a0505, shininess: 80 });
  topBar.position.set(0, 1.72, 0);
  g.add(topBar);

  const warning = makeBox(1.16, 0.1, 0.24, 0xfacc15, { emissive: 0x332200, shininess: 80 });
  warning.position.set(0, 1.72, -0.16);
  g.add(warning);

  const arrow = makeCapsule(0.055, 0.5, 0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.22 });
  arrow.rotation.z = Math.PI / 2;
  arrow.rotation.x = Math.PI / 2;
  arrow.position.set(0, 1.45, -0.18);
  g.add(arrow);

  g.userData = { kind: "obstacle", subtype: "barrier" };
  return g;
}

function buildStudyShuttle3D() {
  const g = new THREE.Group();
  const length = 8.8;

  const base = makeBox(2.05, 0.55, length, 0x2563eb, { shininess: 80 });
  base.position.y = 0.62;
  g.add(base);

  const top = makeBox(2.15, 0.2, length, 0xf8fafc, { shininess: 90 });
  top.position.y = PLATFORM_TOP_Y;
  g.add(top);

  const railL = makeBox(0.12, 0.42, length - 0.5, 0xf59e0b, { emissive: 0x271300, shininess: 80 });
  railL.position.set(-1.08, 1.8, 0);
  const railR = makeBox(0.12, 0.42, length - 0.5, 0xf59e0b, { emissive: 0x271300, shininess: 80 });
  railR.position.set(1.08, 1.8, 0);
  g.add(railL, railR);

  for (let i = -1; i <= 1; i += 1) {
    const bookStack = makeBox(0.62, 0.42, 0.85, i === 0 ? 0xef4444 : 0x22c55e, { shininess: 70 });
    bookStack.position.set(i * 0.52, 1.86, -2.4 + i * 1.2);
    g.add(bookStack);

    const bookStripe = makeBox(0.64, 0.04, 0.87, 0xffffff, { transparent: true, opacity: 0.45 });
    bookStripe.position.set(i * 0.52, 2.06, -2.4 + i * 1.2);
    g.add(bookStripe);
  }

  [-3.5, -1.25, 1.25, 3.5].forEach((z) => {
    const wheelL = makeCylinder(0.24, 0.24, 0.16, 18, 0x111827);
    wheelL.rotation.z = Math.PI / 2;
    wheelL.position.set(-1.12, 0.24, z);
    const wheelR = makeCylinder(0.24, 0.24, 0.16, 18, 0x111827);
    wheelR.rotation.z = Math.PI / 2;
    wheelR.position.set(1.12, 0.24, z);
    g.add(wheelL, wheelR);
  });

  const label = makeBox(1.35, 0.32, 0.05, 0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.08 });
  label.position.set(0, 0.78, -length / 2 - 0.035);
  g.add(label);

  g.userData = { kind: "platform", subtype: "study-shuttle", length, topY: PLATFORM_TOP_Y + 0.12 };
  return g;
}

function buildCoin3D() {
  const g = new THREE.Group();
  const coin = makeCylinder(0.32, 0.32, 0.08, 36, 0xffe600, { emissive: 0xffcc00, emissiveIntensity: 0.35, shininess: 100 });
  coin.rotation.x = Math.PI / 2;
  g.add(coin);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.035, 12, 36), makeMaterial(0xffa000, { emissive: 0xff8800, emissiveIntensity: 0.25, shininess: 100 }));
  ring.rotation.x = Math.PI / 2;
  g.add(ring);

  g.userData = { kind: "coin", spinSpeed: 2.5 + Math.random() * 1.5 };
  return g;
}

function buildFlashcard3D(question) {
  const g = new THREE.Group();
  const card = makeBox(1.05, 0.72, 0.06, 0x0d2a5e, { emissive: 0x071e48, emissiveIntensity: 0.35, shininess: 85 });
  g.add(card);

  const glow = makeBox(1.15, 0.82, 0.035, 0x00f5ff, { emissive: 0x00f5ff, emissiveIntensity: 0.65, transparent: true, opacity: 0.68 });
  glow.position.z = 0.03;
  g.add(glow);

  const dot = makeSphere(0.055, 0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.25 });
  dot.position.set(0, -0.21, -0.08);
  const mark = makeCapsule(0.045, 0.28, 0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.25 });
  mark.position.set(0, 0.1, -0.08);
  g.add(dot, mark);

  g.userData = { kind: "card", question, floatPhase: Math.random() * Math.PI * 2 };
  return g;
}

export default function FlashcardDash({ studySet, onExit }) {
  const mountRef = useRef(null);
  const threeRef = useRef(null);
  const gameStateRef = useRef(null);
  const animFrameRef = useRef(null);

  const [phase, setPhase] = useState("idle");
  const [score, setScore] = useState(0);
  const [distance, setDistance] = useState(0);
  const [coins, setCoins] = useState(0);
  const [hearts, setHearts] = useState(START_HEARTS);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [answerStatus, setAnswerStatus] = useState(null);
  const [comboText, setComboText] = useState(null);
  const [speedHud, setSpeedHud] = useState(Math.round(START_SPEED * 1000));

  const phaseRef = useRef("idle");
  const heartRef = useRef(START_HEARTS);
  const scoreRef = useRef(0);
  const streakRef = useRef(0);
  const coinsRef = useRef(0);
  const distRef = useRef(0);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return undefined;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0xdff4ff);
    renderer.domElement.className = "fd-canvas";
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xdff4ff, 42, 125);

    const camera = new THREE.PerspectiveCamera(68, container.clientWidth / container.clientHeight, 0.1, 160);
    camera.position.set(0, 4.05, 9.8);
    camera.lookAt(0, 2.1, -9);

    const ambient = new THREE.AmbientLight(0xffffff, 0.83);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.02);
    dirLight.position.set(0, 9, 8);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    for (let z = -6; z >= -96; z -= 14) {
      const light = new THREE.PointLight(0xfff0cc, 1.18, 20);
      light.position.set(0, HALL_HEIGHT - 0.45, z);
      scene.add(light);
    }

    const hallway = buildHallway(scene);
    const player = buildPlayer();
    player.position.set(LANE_POSITIONS[1], 0, PLAYER_Z);
    player.rotation.y = Math.PI;
    scene.add(player);

    const itemPool = [];

    function onResize() {
      const w = Math.max(container.clientWidth, 320);
      const h = Math.max(container.clientHeight, 320);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    }

    onResize();
    window.addEventListener("resize", onResize);

    threeRef.current = { renderer, scene, camera, player, hallway, itemPool, cameraLean: 0, cameraBob: 0 };
    gameStateRef.current = {
      speed: START_SPEED,
      spawnObs: 0,
      spawnCoin: 34,
      spawnCard: 0,
      spawnPlatform: 120,
      targetLane: 1,
      playerX: LANE_POSITIONS[1],
      jumping: false,
      sliding: false,
      jumpVel: 0,
      playerY: 0,
      onPlatform: false,
      runPhase: 0,
      shakeDur: 0,
      lastFrame: performance.now(),
    };

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(animFrameRef.current);
      scene.traverse((obj) => disposeObject(obj));
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, []);

  function addPoolItem(scene, pool, mesh, data) {
    scene.add(mesh);
    pool.push({ mesh, hit: false, ...data });
  }

  function spawnObstacle(scene, pool, difficulty = 0) {
    const lane = rndLane();
    const builders = [buildCone3D, buildBackpack3D, buildBarrier3D, buildLockerObstacle3D];
    const mesh = choice(builders)();
    mesh.position.set(LANE_POSITIONS[lane], 0, SPAWN_Z - Math.random() * 6);
    addPoolItem(scene, pool, mesh, { kind: "obstacle", subtype: mesh.userData.subtype, baseY: 0, lane });

    if (Math.random() < 0.24 + difficulty * 0.28) {
      const lane2 = choice([0, 1, 2].filter((l) => l !== lane));
      const mesh2 = choice(builders)();
      mesh2.position.set(LANE_POSITIONS[lane2], 0, SPAWN_Z - 8 - Math.random() * 5);
      addPoolItem(scene, pool, mesh2, { kind: "obstacle", subtype: mesh2.userData.subtype, baseY: 0, lane: lane2 });
    }
  }

  function spawnPlatform(scene, pool) {
    const lane = rndLane();
    const mesh = buildStudyShuttle3D();
    mesh.position.set(LANE_POSITIONS[lane], 0, SPAWN_Z - Math.random() * 8);
    addPoolItem(scene, pool, mesh, {
      kind: "platform",
      subtype: "study-shuttle",
      lane,
      baseY: 0,
      length: mesh.userData.length,
      topY: mesh.userData.topY,
    });

    for (let i = 0; i < 4; i += 1) {
      const coin = buildCoin3D();
      coin.position.set(LANE_POSITIONS[lane], mesh.userData.topY + 0.75, mesh.position.z - 2.8 + i * 1.45);
      addPoolItem(scene, pool, coin, { kind: "coin", lane, baseY: mesh.userData.topY + 0.75, ridesPlatform: true });
    }
  }

  function spawnCoins(scene, pool) {
    const pattern = Math.random();
    const lane = rndLane();

    if (pattern < 0.45) {
      for (let i = 0; i < 6; i += 1) {
        const mesh = buildCoin3D();
        mesh.position.set(LANE_POSITIONS[lane], 1.35 + Math.sin(i * 0.8) * 0.08, SPAWN_Z - i * 2.25);
        addPoolItem(scene, pool, mesh, { kind: "coin", baseY: 1.35, lane });
      }
      return;
    }

    if (pattern < 0.75) {
      for (let i = 0; i < 7; i += 1) {
        const lane2 = i % 2 === 0 ? lane : Math.min(2, Math.max(0, lane + (lane === 2 ? -1 : 1)));
        const mesh = buildCoin3D();
        mesh.position.set(LANE_POSITIONS[lane2], 1.35, SPAWN_Z - i * 2.15);
        addPoolItem(scene, pool, mesh, { kind: "coin", baseY: 1.35, lane: lane2 });
      }
      return;
    }

    for (let i = 0; i < 5; i += 1) {
      const lane2 = i < 2 ? 0 : i < 4 ? 1 : 2;
      const mesh = buildCoin3D();
      mesh.position.set(LANE_POSITIONS[lane2], 1.35 + i * 0.04, SPAWN_Z - i * 2.05);
      addPoolItem(scene, pool, mesh, { kind: "coin", baseY: 1.35, lane: lane2 });
    }
  }

  function spawnCard(scene, pool) {
    const lane = rndLane();
    const question = rndQ(studySet);
    const mesh = buildFlashcard3D(question);
    mesh.position.set(LANE_POSITIONS[lane], 1.75, SPAWN_Z - Math.random() * 7);
    addPoolItem(scene, pool, mesh, { kind: "card", question, baseY: 1.75, lane });
  }

  useEffect(() => {
    function animate(now) {
      animFrameRef.current = requestAnimationFrame(animate);
      const three = threeRef.current;
      const gs = gameStateRef.current;
      if (!three || !gs) return;

      const { renderer, scene, camera, player, hallway, itemPool } = three;
      const delta = Math.min((now - gs.lastFrame) / 16.67, 2.2);
      gs.lastFrame = now;
      const isRunning = phaseRef.current === "running";

      if (isRunning) {
        gs.speed = Math.min(MAX_SPEED, gs.speed + SPEED_GAIN * delta);
        const speedRatio = Math.min(1, (gs.speed - START_SPEED) / (MAX_SPEED - START_SPEED));
        const scrollStep = gs.speed * delta;

        scoreRef.current += Math.floor(scrollStep * 36);
        distRef.current += scrollStep * 5.6;
        setScore(scoreRef.current);
        setDistance(distRef.current);
        setSpeedHud(Math.round(gs.speed * 1000));

        const targetX = LANE_POSITIONS[gs.targetLane];
        gs.playerX += (targetX - gs.playerX) * LANE_SWITCH_SNAP * delta;
        player.position.x = gs.playerX;

        three.cameraLean += gs.playerX * 0.18 - three.cameraLean;
        three.cameraLean *= 0.9;
        camera.position.x += (three.cameraLean - camera.position.x) * 0.09 * delta;

        gs.cameraBob = Math.sin(gs.runPhase * 0.5) * 0.04;
        const targetCamY = 4.05 + gs.cameraBob + speedRatio * 0.42;
        const targetCamZ = 9.8 - speedRatio * 1.35;
        camera.position.y += (targetCamY - camera.position.y) * 0.09 * delta;
        camera.position.z += (targetCamZ - camera.position.z) * 0.09 * delta;
        camera.fov += (68 + speedRatio * 9 - camera.fov) * 0.045 * delta;
        camera.updateProjectionMatrix();
        camera.lookAt(gs.playerX * 0.18, 2.05, -10 - speedRatio * 4.2);

        for (const segment of hallway.segments) segment.position.z += scrollStep;
        recycleHallway(hallway);

        const toRemove = [];
        let supportY = 0;
        let standingOnPlatform = false;
        const playerWorldZ = player.position.z;
        const playerWorldX = player.position.x;

        for (const item of itemPool) {
          item.mesh.position.z += scrollStep;

          if (item.kind === "coin") {
            item.mesh.rotation.y += (item.mesh.userData.spinSpeed || 2) * delta * 0.08;
            item.mesh.position.y = item.baseY + Math.sin(now * 0.002 + item.mesh.position.x) * 0.13;
          }

          if (item.kind === "card") {
            const fp = item.mesh.userData.floatPhase || 0;
            item.mesh.position.y = item.baseY + Math.sin(now * 0.0015 + fp) * 0.18;
            item.mesh.rotation.y = Math.sin(now * 0.001 + fp) * 0.22;
          }

          if (item.kind === "obstacle") {
            item.mesh.rotation.y += Math.sin(now * 0.001 + item.mesh.position.z) * 0.0015;
          }

          if (item.kind === "platform") {
            item.mesh.position.y = Math.sin(now * 0.002 + item.mesh.position.z) * 0.018;
            const halfLen = (item.length || 8.8) / 2;
            const dzPlatform = Math.abs(item.mesh.position.z - playerWorldZ);
            const dxPlatform = Math.abs(item.mesh.position.x - playerWorldX);

            if (dxPlatform < 1.15 && dzPlatform < halfLen && gs.playerY >= item.topY - 0.5 && gs.jumpVel <= 0.08) {
              supportY = Math.max(supportY, item.topY);
              standingOnPlatform = true;
            }
          }

          if (item.mesh.position.z > playerWorldZ + 10) {
            toRemove.push(item);
            continue;
          }
        }

        if (gs.jumping || gs.playerY > supportY) {
          gs.jumpVel -= GRAVITY * delta;
          gs.playerY += gs.jumpVel * delta;
        }

        if (gs.playerY <= supportY) {
          gs.playerY = supportY;
          gs.jumping = false;
          gs.jumpVel = 0;
        }

        gs.onPlatform = standingOnPlatform;
        player.position.y = gs.playerY;

        if (gs.sliding) {
          player.scale.y += (0.52 - player.scale.y) * 0.22 * delta;
          player.rotation.x += (-0.2 - player.rotation.x) * 0.2 * delta;
        } else {
          player.scale.y += (1 - player.scale.y) * 0.16 * delta;
          player.rotation.x += (0 - player.rotation.x) * 0.16 * delta;
        }

        gs.runPhase += gs.speed * delta * (13.5 + speedRatio * 9);
        const pu = player.userData;

        if (!gs.jumping && !gs.sliding) {
          const stride = Math.sin(gs.runPhase);
          const stride2 = Math.cos(gs.runPhase);
          pu.legL.rotation.x = stride * 0.9;
          pu.legR.rotation.x = -stride * 0.9;
          pu.armL.rotation.x = -stride * 0.68;
          pu.armR.rotation.x = stride * 0.68;
          pu.shoeL.rotation.x = Math.PI / 2 + stride2 * 0.24;
          pu.shoeR.rotation.x = Math.PI / 2 - stride2 * 0.24;
          pu.torso.rotation.z = stride * 0.025;
          pu.pack.rotation.z = -stride * 0.035;
          pu.head.rotation.z = stride * 0.018;
        } else if (gs.jumping) {
          pu.legL.rotation.x = -0.72;
          pu.legR.rotation.x = -0.52;
          pu.armL.rotation.x = -1.02;
          pu.armR.rotation.x = -0.9;
        } else if (gs.sliding) {
          pu.legL.rotation.x = 1.05;
          pu.legR.rotation.x = 0.82;
          pu.armL.rotation.x = -0.35;
          pu.armR.rotation.x = -0.35;
          pu.torso.rotation.z = 0;
          pu.head.rotation.z = 0;
        }

        if (gs.shakeDur > 0) {
          gs.shakeDur -= delta;
          camera.position.x += (Math.random() - 0.5) * 0.09;
          camera.position.y += (Math.random() - 0.5) * 0.055;
        }

        gs.spawnObs += delta;
        gs.spawnCoin += delta;
        gs.spawnCard += delta;
        gs.spawnPlatform += delta;

        const obsThresh = Math.max(34, 92 - speedRatio * 52);
        const coinThresh = Math.max(44, 76 - speedRatio * 20);
        const cardThresh = Math.max(168, 250 - speedRatio * 55);
        const platformThresh = Math.max(210, 360 - speedRatio * 80);

        if (gs.spawnPlatform > platformThresh) {
          gs.spawnPlatform = 0;
          spawnPlatform(scene, itemPool);
        }

        if (gs.spawnObs > obsThresh) {
          gs.spawnObs = 0;
          spawnObstacle(scene, itemPool, speedRatio);
        }

        if (gs.spawnCoin > coinThresh) {
          gs.spawnCoin = 0;
          spawnCoins(scene, itemPool);
        }

        if (gs.spawnCard > cardThresh) {
          gs.spawnCard = 0;
          spawnCard(scene, itemPool);
        }

        for (const item of itemPool) {
          if (toRemove.includes(item)) continue;

          const dz = Math.abs(item.mesh.position.z - playerWorldZ);
          const dx = Math.abs(item.mesh.position.x - playerWorldX);

          if (item.kind === "coin" && dz < 1.15 && dx < 0.9 && Math.abs(item.mesh.position.y - (gs.playerY + 1.35)) < 1.2) {
            coinsRef.current += 1;
            scoreRef.current += 24;
            setCoins(coinsRef.current);
            setScore(scoreRef.current);
            toRemove.push(item);
            continue;
          }

          if (item.kind === "card" && dz < 1.22 && dx < 0.95) {
            setActiveQuestion(item.question);
            setPhase("question");
            phaseRef.current = "question";
            toRemove.push(item);
            continue;
          }

          if (item.kind === "obstacle" && !item.hit && dz < 1.18 && dx < 0.92) {
            const clearedCone = item.subtype === "cone" && gs.playerY > 0.48;
            const clearedBackpack = item.subtype === "backpack" && gs.playerY > 0.56;
            const clearedBarrier = item.subtype === "barrier" && gs.sliding;
            const clearedLocker = false;

            if (clearedCone || clearedBackpack || clearedBarrier || clearedLocker) continue;

            item.hit = true;
            const nextHearts = Math.max(0, heartRef.current - 1);
            heartRef.current = nextHearts;
            streakRef.current = 0;
            setHearts(nextHearts);
            setStreak(0);
            gs.shakeDur = 18;
            toRemove.push(item);

            if (nextHearts <= 0) {
              setPhase("gameover");
              phaseRef.current = "gameover";
            }
          }
        }

        for (const item of toRemove) {
          scene.remove(item.mesh);
          disposeObject(item.mesh);
          const idx = itemPool.indexOf(item);
          if (idx !== -1) itemPool.splice(idx, 1);
        }
      } else {
        gs.runPhase += 0.025 * delta;
        const pu = player.userData;
        pu.legL.rotation.x = Math.sin(gs.runPhase) * 0.1;
        pu.legR.rotation.x = -Math.sin(gs.runPhase) * 0.1;
        pu.armL.rotation.x = -Math.sin(gs.runPhase) * 0.08;
        pu.armR.rotation.x = Math.sin(gs.runPhase) * 0.08;
        camera.lookAt(player.position.x * 0.14, 2.05, -9);
      }

      renderer.render(scene, camera);
    }

    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [studySet]);

  function startGame() {
    const three = threeRef.current;
    const gs = gameStateRef.current;
    if (!three || !gs) return;

    for (const item of three.itemPool) {
      three.scene.remove(item.mesh);
      disposeObject(item.mesh);
    }
    three.itemPool.length = 0;

    for (let i = 0; i < three.hallway.segments.length; i += 1) {
      three.hallway.segments[i].position.z = -i * TILE_LENGTH;
    }

    Object.assign(gs, {
      speed: START_SPEED,
      spawnObs: 0,
      spawnCoin: 34,
      spawnCard: 0,
      spawnPlatform: 120,
      targetLane: 1,
      playerX: LANE_POSITIONS[1],
      jumping: false,
      sliding: false,
      jumpVel: 0,
      playerY: 0,
      onPlatform: false,
      runPhase: 0,
      shakeDur: 0,
      lastFrame: performance.now(),
    });

    three.player.position.set(LANE_POSITIONS[1], 0, PLAYER_Z);
    three.player.scale.set(1, 1, 1);
    three.player.rotation.set(0, Math.PI, 0);
    three.cameraLean = 0;
    three.camera.position.set(0, 4.05, 9.8);
    three.camera.fov = 68;
    three.camera.updateProjectionMatrix();
    three.camera.lookAt(0, 2.05, -9);

    heartRef.current = START_HEARTS;
    scoreRef.current = 0;
    streakRef.current = 0;
    coinsRef.current = 0;
    distRef.current = 0;

    setHearts(START_HEARTS);
    setScore(0);
    setDistance(0);
    setCoins(0);
    setStreak(0);
    setBestStreak(0);
    setActiveQuestion(null);
    setAnswerStatus(null);
    setComboText(null);
    setSpeedHud(Math.round(START_SPEED * 1000));
    setPhase("running");
    phaseRef.current = "running";
  }

  const moveLeft = useCallback(() => {
    const gs = gameStateRef.current;
    if (!gs || phaseRef.current !== "running") return;
    gs.targetLane = Math.max(0, gs.targetLane - 1);
  }, []);

  const moveRight = useCallback(() => {
    const gs = gameStateRef.current;
    if (!gs || phaseRef.current !== "running") return;
    gs.targetLane = Math.min(2, gs.targetLane + 1);
  }, []);

  const doJump = useCallback(() => {
    const gs = gameStateRef.current;
    if (!gs || phaseRef.current !== "running" || gs.jumping || gs.sliding) return;
    gs.jumping = true;
    gs.jumpVel = JUMP_POWER;
  }, []);

  const doSlide = useCallback(() => {
    const gs = gameStateRef.current;
    if (!gs || phaseRef.current !== "running" || gs.sliding || gs.jumping) return;
    gs.sliding = true;
    setTimeout(() => {
      const current = gameStateRef.current;
      if (current) current.sliding = false;
    }, SLIDE_DURATION);
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

  useEffect(() => {
    function onKey(e) {
      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") moveLeft();
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") moveRight();
      if (e.key === "ArrowUp" || e.key === " ") {
        e.preventDefault();
        doJump();
      }
      if (e.key === "ArrowDown" || e.key.toLowerCase() === "s") doSlide();
      if (e.key.toLowerCase() === "p") togglePause();
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moveLeft, moveRight, doJump, doSlide, togglePause]);

  function answerQuestion(idx) {
    if (!activeQuestion || answerStatus) return;
    const correct = idx === activeQuestion.correct;

    if (correct) {
      const nextStreak = streakRef.current + 1;
      const bonus = 150 + nextStreak * 30;
      streakRef.current = nextStreak;
      scoreRef.current += bonus;
      coinsRef.current += 8 + Math.min(nextStreak, 10);
      setStreak(nextStreak);
      setBestStreak((best) => Math.max(best, nextStreak));
      setScore(scoreRef.current);
      setCoins(coinsRef.current);
      setAnswerStatus("correct");

      if (nextStreak >= 3) {
        setComboText(`${nextStreak}× COMBO! 🔥`);
        setTimeout(() => setComboText(null), 1600);
      }
    } else {
      streakRef.current = 0;
      const nextHearts = Math.max(0, heartRef.current - 1);
      heartRef.current = nextHearts;
      setStreak(0);
      setHearts(nextHearts);
      setAnswerStatus("wrong");

      if (nextHearts <= 0) {
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

  const distM = Math.floor(distance);

  return (
    <div className="fd-page">
      <div className="fd-header">
        <div className="fd-title-block">
          <p className="fd-eyebrow">Gradeify Games</p>
          <h1>Flashcard Dash</h1>
          <p className="fd-subtitle">
            Sprint through the hallway, jump on Study Shuttles, slide under barriers, dodge lockers, and answer flashcards.
          </p>
        </div>

        <div className="fd-header-btns">
          {onExit && (
            <button className="fd-btn-secondary" onClick={onExit}>
              Back
            </button>
          )}
          <button className="fd-btn-primary" onClick={startGame}>
            {phase === "gameover" || phase === "idle" ? "Start Run" : "Restart"}
          </button>
          <button className="fd-btn-secondary" onClick={togglePause} disabled={phase === "idle" || phase === "gameover" || phase === "question"}>
            {phase === "running" ? "Pause" : "Resume"}
          </button>
        </div>
      </div>

      <div className="fd-stats">
        <div className="fd-stat">
          <span className="fd-stat-label">Score</span>
          <strong className="fd-stat-value">{score.toLocaleString()}</strong>
        </div>
        <div className="fd-stat">
          <span className="fd-stat-label">Distance</span>
          <strong className="fd-stat-value">{distM}m</strong>
        </div>
        <div className="fd-stat">
          <span className="fd-stat-label">Coins</span>
          <strong className="fd-stat-value">{coins}</strong>
        </div>
        <div className="fd-stat">
          <span className="fd-stat-label">Hearts</span>
          <strong className="fd-stat-value fd-heart-value">{"❤️".repeat(Math.max(0, hearts)) || "—"}</strong>
        </div>
        <div className="fd-stat">
          <span className="fd-stat-label">Speed</span>
          <strong className="fd-stat-value">{speedHud}</strong>
        </div>
        <div className="fd-stat">
          <span className="fd-stat-label">Streak</span>
          <strong className="fd-stat-value">{streak}🔥</strong>
        </div>
      </div>

      <div className="fd-game-wrap" ref={mountRef}>
        {comboText && <div className="fd-combo">{comboText}</div>}

        {phase === "idle" && (
          <div className="fd-overlay">
            <div className="fd-card">
              <p className="fd-eyebrow">Ready?</p>
              <h2>Flashcard Dash</h2>
              <p>
                Jump over cones and backpacks, slide under red barriers, dodge lockers, and jump onto blue Study Shuttles for coins above the floor.
              </p>
              <div className="fd-key-grid">
                <div className="fd-key-row"><kbd>← / A</kbd><span>Move left</span></div>
                <div className="fd-key-row"><kbd>→ / D</kbd><span>Move right</span></div>
                <div className="fd-key-row"><kbd>↑ / Space</kbd><span>Jump / land on shuttles</span></div>
                <div className="fd-key-row"><kbd>↓ / S</kbd><span>Slide under barriers</span></div>
              </div>
              <button className="fd-btn-primary" onClick={startGame}>Start Flashcard Dash</button>
            </div>
          </div>
        )}

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
                    <button key={`${opt}-${idx}`} className={cls} onClick={() => answerQuestion(idx)} disabled={!!answerStatus}>
                      <span className="opt-letter">{String.fromCharCode(65 + idx)}</span>
                      {opt}
                    </button>
                  );
                })}
              </div>

              {answerStatus === "correct" && <div className="fd-answer-fb correct">Correct! Streak: {streak} 🔥 +{150 + streak * 30} pts</div>}
              {answerStatus === "wrong" && <div className="fd-answer-fb wrong">Nope! Answer: <strong>{activeQuestion.opts[activeQuestion.correct]}</strong></div>}

              <div className="fd-q-actions">
                <button className="fd-btn-ghost" onClick={closeQuestion}>Back to Run</button>
                <button className="fd-btn-primary" onClick={closeQuestion} disabled={!answerStatus}>Continue Run</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="fd-controls">
        <button onClick={moveLeft}>← Left</button>
        <button onClick={doJump}>↑ Jump</button>
        <button onClick={doSlide}>↓ Slide</button>
        <button onClick={moveRight}>Right →</button>
      </div>
    </div>
  );
}
