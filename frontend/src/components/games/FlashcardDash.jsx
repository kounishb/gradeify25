import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import "../../styles/FlashcardDash.css";

// ─── Constants ────────────────────────────────────────────────────────────
const LANE_POSITIONS = [-2.8, 0, 2.8];

const START_SPEED = 0.075;
const MAX_SPEED = 0.22;
const SPEED_GAIN = 0.000035;

const HALL_WIDTH = 11;
const HALL_HEIGHT = 5.6;
const START_HEARTS = 3;

const TILE_LENGTH = 10;
const TILE_COUNT = 18;

const PLAYER_Z = 4.4;
const SPAWN_Z = -78;

const QUESTION_BANK = [
  {
    q: "What is the main purpose of photosynthesis?",
    opts: [
      "To create glucose using sunlight",
      "To break down rocks",
      "To make oxygen from glucose",
      "To digest proteins",
    ],
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
    opts: [
      "Total money spent",
      "The value of the next best alternative",
      "A fixed expense",
      "Profit after taxes",
    ],
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

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function normalizeStudyQuestion(item) {
  if (!item) {
    return QUESTION_BANK[Math.floor(Math.random() * QUESTION_BANK.length)];
  }

  if (item.q && Array.isArray(item.opts)) {
    return item;
  }

  const q =
    item.question ||
    item.prompt ||
    item.text ||
    item.term ||
    "Answer this question";

  const correctAnswer =
    item.correctAnswer ||
    item.answer ||
    item.correct ||
    item.solution ||
    item.definition ||
    "";

  let opts = item.opts || item.choices || item.options || item.answers || [];

  if (!Array.isArray(opts)) {
    opts = [];
  }

  if (opts.length < 2 && correctAnswer) {
    opts = shuffleArray([
      correctAnswer,
      "A related but incorrect answer",
      "An unrelated concept",
      "None of the above",
    ]);
  }

  let correct = opts.findIndex((opt) => String(opt) === String(correctAnswer));

  if (typeof item.correct === "number" && item.opts) {
    correct = item.correct;
  }

  if (correct < 0) {
    correct = 0;
    if (correctAnswer && opts[0] !== correctAnswer) {
      opts = [correctAnswer, ...opts.filter((opt) => opt !== correctAnswer)].slice(0, 4);
    }
  }

  return {
    q,
    opts: opts.slice(0, 4),
    correct,
  };
}

function rndQ(studySet) {
  const questions = studySet?.questions?.length ? studySet.questions : QUESTION_BANK;
  const picked = questions[Math.floor(Math.random() * questions.length)];
  return normalizeStudyQuestion(picked);
}

// ─── Smooth Three.js helpers ──────────────────────────────────────────────

function makeMaterial(color, opts = {}) {
  return new THREE.MeshPhongMaterial({
    color,
    shininess: 45,
    specular: 0x222222,
    ...opts,
  });
}

function makeBox(w, h, d, color, opts = {}) {
  const geo = new THREE.BoxGeometry(w, h, d, 2, 2, 2);
  const mat = makeMaterial(color, opts);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeSphere(r, color, opts = {}) {
  const geo = new THREE.SphereGeometry(r, 24, 18);
  const mat = makeMaterial(color, opts);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeCapsule(radius, length, color, opts = {}) {
  const geo = new THREE.CapsuleGeometry(radius, length, 12, 24);
  const mat = makeMaterial(color, opts);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeCylinder(rTop, rBottom, h, segs, color, opts = {}) {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, h, segs, 2);
  const mat = makeMaterial(color, opts);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ─── Hallway ──────────────────────────────────────────────────────────────

function buildLocker3D(bodyColor, shadowColor) {
  const g = new THREE.Group();

  const body = makeBox(1.7, 1.45, 0.34, bodyColor);
  body.scale.x = 1.02;
  g.add(body);

  const shine = makeBox(0.08, 1.22, 0.035, 0xffffff, {
    transparent: true,
    opacity: 0.18,
  });
  shine.position.set(-0.52, 0.04, -0.2);
  g.add(shine);

  const seam = makeBox(0.035, 1.35, 0.04, shadowColor);
  seam.position.set(0, 0, -0.22);
  g.add(seam);

  const handle = makeCylinder(0.045, 0.045, 0.16, 12, 0xd8dee9);
  handle.rotation.x = Math.PI / 2;
  handle.position.set(0.42, 0.02, -0.27);
  g.add(handle);

  for (let v = 0; v < 3; v += 1) {
    const vent = makeBox(0.78, 0.035, 0.035, 0x102a43, {
      transparent: true,
      opacity: 0.55,
    });
    vent.position.set(0, 0.43 - v * 0.2, -0.26);
    g.add(vent);
  }

  return g;
}

function buildHallSegment(index) {
  const segment = new THREE.Group();
  segment.position.z = -index * TILE_LENGTH;

  const floorColor = index % 2 === 0 ? 0x2c3242 : 0x252b3a;
  const floor = makeBox(HALL_WIDTH, 0.08, TILE_LENGTH, floorColor);
  floor.position.y = -0.04;
  floor.receiveShadow = true;
  segment.add(floor);

  const centerLine = makeBox(0.08, 0.018, TILE_LENGTH, 0xffcc66, {
    emissive: 0x332200,
    shininess: 80,
  });
  centerLine.position.set(0, 0.025, 0);
  segment.add(centerLine);

  const leftLaneLine = makeBox(0.045, 0.018, TILE_LENGTH, 0x7080a0, {
    transparent: true,
    opacity: 0.55,
  });
  leftLaneLine.position.set(-1.4, 0.03, 0);
  segment.add(leftLaneLine);

  const rightLaneLine = makeBox(0.045, 0.018, TILE_LENGTH, 0x7080a0, {
    transparent: true,
    opacity: 0.55,
  });
  rightLaneLine.position.set(1.4, 0.03, 0);
  segment.add(rightLaneLine);

  const ceiling = makeBox(HALL_WIDTH, 0.12, TILE_LENGTH, 0x17172d);
  ceiling.position.y = HALL_HEIGHT;
  segment.add(ceiling);

  const light = makeBox(1.1, 0.08, 3.7, 0xffffdd, {
    emissive: 0xffe9a8,
    emissiveIntensity: 0.75,
    shininess: 90,
  });
  light.position.set(0, HALL_HEIGHT - 0.12, 0);
  segment.add(light);

  const leftWall = makeBox(0.16, HALL_HEIGHT, TILE_LENGTH, 0x223a68);
  leftWall.position.set(-HALL_WIDTH / 2, HALL_HEIGHT / 2, 0);
  segment.add(leftWall);

  const rightWall = makeBox(0.16, HALL_HEIGHT, TILE_LENGTH, 0x223a68);
  rightWall.position.set(HALL_WIDTH / 2, HALL_HEIGHT / 2, 0);
  segment.add(rightWall);

  const leftRail = makeBox(0.18, 0.18, TILE_LENGTH, 0xf59e0b, {
    emissive: 0x271300,
    shininess: 80,
  });
  leftRail.position.set(-HALL_WIDTH / 2 + 0.08, 1.75, 0);
  segment.add(leftRail);

  const rightRail = makeBox(0.18, 0.18, TILE_LENGTH, 0xf59e0b, {
    emissive: 0x271300,
    shininess: 80,
  });
  rightRail.position.set(HALL_WIDTH / 2 - 0.08, 1.75, 0);
  segment.add(rightRail);

  for (let li = 0; li < 3; li += 1) {
    const z = -TILE_LENGTH / 3 + li * (TILE_LENGTH / 3);

    const lockerL = buildLocker3D(0x315ea8, 0x1e3a70);
    lockerL.position.set(-HALL_WIDTH / 2 + 0.2, 0.9, z);
    lockerL.rotation.y = Math.PI / 2;
    segment.add(lockerL);

    const lockerR = buildLocker3D(0x315ea8, 0x1e3a70);
    lockerR.position.set(HALL_WIDTH / 2 - 0.2, 0.9, z);
    lockerR.rotation.y = -Math.PI / 2;
    segment.add(lockerR);
  }

  if (index % 3 === 0) {
    const board = makeBox(0.08, 1.15, 2.2, 0x8b5a2b);
    board.position.set(HALL_WIDTH / 2 - 0.14, 3.35, 0);
    segment.add(board);

    const paper1 = makeBox(0.05, 0.55, 0.48, 0xfaf3dd);
    paper1.position.set(HALL_WIDTH / 2 - 0.21, 3.48, -0.45);
    segment.add(paper1);

    const paper2 = makeBox(0.05, 0.45, 0.6, 0xffd6e8);
    paper2.position.set(HALL_WIDTH / 2 - 0.21, 3.2, 0.42);
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
    if (segment.position.z > 16) {
      segment.position.z -= TILE_COUNT * TILE_LENGTH;
    }
  }
}

// ─── Player ───────────────────────────────────────────────────────────────

function buildPlayer() {
  const g = new THREE.Group();

  const shoeL = makeCapsule(0.13, 0.28, 0xff2d9b);
  shoeL.rotation.x = Math.PI / 2;
  shoeL.position.set(-0.22, 0.13, 0.1);

  const shoeR = makeCapsule(0.13, 0.28, 0xff2d9b);
  shoeR.rotation.x = Math.PI / 2;
  shoeR.position.set(0.22, 0.13, 0.1);

  const legL = makeCapsule(0.13, 0.54, 0x1565c0);
  legL.position.set(-0.22, 0.55, 0);

  const legR = makeCapsule(0.13, 0.54, 0x1565c0);
  legR.position.set(0.22, 0.55, 0);

  const torso = makeCapsule(0.34, 0.38, 0xff6b00);
  torso.position.set(0, 1.24, 0);

  const pack = makeSphere(0.36, 0x06b6d4, {
    shininess: 85,
  });
  pack.scale.set(0.86, 1.08, 0.46);
  pack.position.set(0, 1.22, 0.32);

  const packPocket = makeSphere(0.2, 0x0891b2);
  packPocket.scale.set(1.2, 0.8, 0.35);
  packPocket.position.set(0, -0.18, 0.24);
  pack.add(packPocket);

  const armL = makeCapsule(0.1, 0.5, 0xff8a3d);
  armL.position.set(-0.48, 1.16, 0);
  armL.rotation.z = -0.2;

  const armR = makeCapsule(0.1, 0.5, 0xff8a3d);
  armR.position.set(0.48, 1.16, 0);
  armR.rotation.z = 0.2;

  const neck = makeCapsule(0.09, 0.08, 0xffcc80);
  neck.position.set(0, 1.69, 0);

  const head = makeSphere(0.31, 0xffcc80);
  head.scale.set(0.95, 1.05, 0.9);
  head.position.set(0, 2.05, 0);

  const hair = makeSphere(0.32, 0x27120c);
  hair.scale.set(0.98, 0.48, 0.95);
  hair.position.set(0, 0.17, 0.02);
  head.add(hair);

  const cap = makeSphere(0.33, 0xff2d9b, {
    shininess: 90,
  });
  cap.scale.set(1.02, 0.42, 0.9);
  cap.position.set(0, 0.2, -0.01);
  head.add(cap);

  const capBrim = makeCapsule(0.07, 0.36, 0xe0186a);
  capBrim.rotation.z = Math.PI / 2;
  capBrim.rotation.x = Math.PI / 2;
  capBrim.position.set(0, 0.08, -0.33);
  head.add(capBrim);

  g.add(shoeL, shoeR, legL, legR, torso, pack, armL, armR, neck, head);

  g.userData = {
    legL,
    legR,
    armL,
    armR,
    shoeL,
    shoeR,
    torso,
    pack,
    head,
  };

  return g;
}

// ─── Items ────────────────────────────────────────────────────────────────

function buildCone3D() {
  const g = new THREE.Group();

  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.48, 1.35, 28, 2),
    makeMaterial(0xff6b00, { shininess: 65 })
  );
  cone.position.y = 0.78;
  cone.castShadow = true;
  g.add(cone);

  const stripe1 = makeCylinder(0.34, 0.38, 0.08, 28, 0xffffff, {
    emissive: 0xffffff,
    emissiveIntensity: 0.18,
  });
  stripe1.position.y = 0.68;
  g.add(stripe1);

  const stripe2 = makeCylinder(0.25, 0.29, 0.07, 28, 0xffffff, {
    emissive: 0xffffff,
    emissiveIntensity: 0.18,
  });
  stripe2.position.y = 0.96;
  g.add(stripe2);

  const base = makeCylinder(0.58, 0.58, 0.14, 32, 0x7c2d12);
  base.position.y = 0.07;
  g.add(base);

  g.userData = { kind: "obstacle", subtype: "cone" };
  return g;
}

function buildLockerObstacle3D() {
  const g = new THREE.Group();

  const body = makeCapsule(0.5, 1.45, 0xc62828, {
    shininess: 75,
  });
  body.scale.x = 0.9;
  body.scale.z = 0.52;
  body.position.y = 1.25;
  g.add(body);

  const door = makeBox(0.65, 1.5, 0.06, 0x9e1b1b);
  door.position.set(0, 1.25, -0.31);
  g.add(door);

  const handle = makeSphere(0.09, 0xf4b942, {
    emissive: 0x553300,
    shininess: 100,
  });
  handle.position.set(0.26, 1.18, -0.37);
  g.add(handle);

  for (let v = 0; v < 3; v += 1) {
    const vent = makeBox(0.52, 0.05, 0.04, 0x1a0000, {
      transparent: true,
      opacity: 0.5,
    });
    vent.position.set(0, 1.72 - v * 0.2, -0.36);
    g.add(vent);
  }

  g.userData = { kind: "obstacle", subtype: "locker" };
  return g;
}

function buildBackpack3D() {
  const g = new THREE.Group();

  const body = makeSphere(0.54, 0x5e35b1, {
    shininess: 70,
  });
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

function buildCoin3D() {
  const g = new THREE.Group();

  const coin = makeCylinder(0.32, 0.32, 0.08, 36, 0xffe600, {
    emissive: 0xffcc00,
    emissiveIntensity: 0.35,
    shininess: 100,
  });
  coin.rotation.x = Math.PI / 2;
  g.add(coin);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.25, 0.035, 12, 36),
    makeMaterial(0xffa000, {
      emissive: 0xff8800,
      emissiveIntensity: 0.25,
      shininess: 100,
    })
  );
  ring.rotation.x = Math.PI / 2;
  g.add(ring);

  g.userData = { kind: "coin", spinSpeed: 2.5 + Math.random() * 1.5 };
  return g;
}

function buildFlashcard3D(question) {
  const g = new THREE.Group();

  const card = makeBox(1.05, 0.72, 0.06, 0x0d2a5e, {
    emissive: 0x071e48,
    emissiveIntensity: 0.35,
    shininess: 85,
  });
  g.add(card);

  const glow = makeBox(1.15, 0.82, 0.035, 0x00f5ff, {
    emissive: 0x00f5ff,
    emissiveIntensity: 0.7,
    transparent: true,
    opacity: 0.72,
  });
  glow.position.z = 0.03;
  g.add(glow);

  const dot = makeSphere(0.055, 0xffffff, {
    emissive: 0xffffff,
    emissiveIntensity: 0.25,
  });
  dot.position.set(0, -0.21, -0.08);
  g.add(dot);

  const mark = makeCapsule(0.045, 0.28, 0xffffff, {
    emissive: 0xffffff,
    emissiveIntensity: 0.25,
  });
  mark.position.set(0, 0.1, -0.08);
  g.add(mark);

  g.userData = {
    kind: "card",
    question,
    floatPhase: Math.random() * Math.PI * 2,
  };

  return g;
}

// ─── Main Component ───────────────────────────────────────────────────────

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
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x070817);

    container.appendChild(renderer.domElement);
    renderer.domElement.className = "fd-canvas";

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x070817, 25, 96);

    const camera = new THREE.PerspectiveCamera(
      68,
      container.clientWidth / container.clientHeight,
      0.1,
      140
    );

    camera.position.set(0, 2.55, 8.4);
    camera.lookAt(0, 1.38, -2.8);

    const ambient = new THREE.AmbientLight(0xffffff, 0.54);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.75);
    dirLight.position.set(0, 8, 8);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    for (let z = -6; z >= -80; z -= 14) {
      const light = new THREE.PointLight(0xfff0cc, 1.25, 18);
      light.position.set(0, HALL_HEIGHT - 0.4, z);
      scene.add(light);
    }

    const hallway = buildHallway(scene);

    const player = buildPlayer();
    player.position.set(LANE_POSITIONS[1], 0, PLAYER_Z);
    player.rotation.y = Math.PI;
    scene.add(player);

    const itemPool = [];

    function onResize() {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    }

    onResize();
    window.addEventListener("resize", onResize);

    threeRef.current = {
      renderer,
      scene,
      camera,
      player,
      hallway,
      itemPool,
      cameraLean: 0,
      cameraBob: 0,
    };

    gameStateRef.current = {
      speed: START_SPEED,
      spawnObs: 0,
      spawnCoin: 0,
      spawnCard: 0,
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

      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((mat) => mat.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });

      renderer.dispose();

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  function spawnObstacle(scene, pool) {
    const lane = rndLane();
    const builders = [buildCone3D, buildLockerObstacle3D, buildBackpack3D];
    const mesh = builders[Math.floor(Math.random() * builders.length)]();

    mesh.position.set(LANE_POSITIONS[lane], 0, SPAWN_Z - Math.random() * 8);
    scene.add(mesh);

    pool.push({
      mesh,
      kind: mesh.userData.kind,
      subtype: mesh.userData.subtype,
      baseY: 0,
      lane,
      hit: false,
    });
  }

  function spawnCoins(scene, pool) {
    const lane = rndLane();
    const count = 3 + Math.floor(Math.random() * 3);

    for (let i = 0; i < count; i += 1) {
      const mesh = buildCoin3D();
      mesh.position.set(LANE_POSITIONS[lane], 1.25 + Math.sin(i) * 0.1, SPAWN_Z - i * 2.2);
      scene.add(mesh);

      pool.push({
        mesh,
        kind: "coin",
        baseY: 1.25,
        lane,
      });
    }
  }

  function spawnCard(scene, pool) {
    const lane = rndLane();
    const question = rndQ(studySet);
    const mesh = buildFlashcard3D(question);

    mesh.position.set(LANE_POSITIONS[lane], 1.65, SPAWN_Z - Math.random() * 7);
    scene.add(mesh);

    pool.push({
      mesh,
      kind: "card",
      question,
      baseY: 1.65,
      lane,
    });
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
        const scrollStep = gs.speed * delta;

        scoreRef.current += Math.floor(scrollStep * 28);
        distRef.current += scrollStep * 4.8;

        setScore(scoreRef.current);
        setDistance(distRef.current);

        const targetX = LANE_POSITIONS[gs.targetLane];
        gs.playerX += (targetX - gs.playerX) * 0.18 * delta;
        player.position.x = gs.playerX;

        three.cameraLean += gs.playerX * 0.18 - three.cameraLean;
        three.cameraLean *= 0.9;
        camera.position.x += (three.cameraLean - camera.position.x) * 0.08 * delta;

        gs.cameraBob = Math.sin(gs.runPhase * 0.5) * 0.035;
        camera.position.y += (2.55 + gs.cameraBob - camera.position.y) * 0.08 * delta;
        camera.lookAt(gs.playerX * 0.16, 1.38, -3.2);

        if (gs.jumping) {
          gs.jumpVel -= 0.017 * delta;
          gs.playerY += gs.jumpVel * delta;

          if (gs.playerY <= 0) {
            gs.playerY = 0;
            gs.jumping = false;
            gs.jumpVel = 0;
          }
        }

        player.position.y = gs.playerY;

        if (gs.sliding) {
          player.scale.y += (0.52 - player.scale.y) * 0.2 * delta;
          player.rotation.x += (-0.18 - player.rotation.x) * 0.18 * delta;
        } else {
          player.scale.y += (1 - player.scale.y) * 0.15 * delta;
          player.rotation.x += (0 - player.rotation.x) * 0.15 * delta;
        }

        gs.runPhase += gs.speed * delta * 11;

        const pu = player.userData;

        if (!gs.jumping && !gs.sliding) {
          pu.legL.rotation.x = Math.sin(gs.runPhase) * 0.72;
          pu.legR.rotation.x = -Math.sin(gs.runPhase) * 0.72;
          pu.armL.rotation.x = -Math.sin(gs.runPhase) * 0.5;
          pu.armR.rotation.x = Math.sin(gs.runPhase) * 0.5;
          pu.shoeL.rotation.x = Math.PI / 2 + Math.sin(gs.runPhase) * 0.35;
          pu.shoeR.rotation.x = Math.PI / 2 - Math.sin(gs.runPhase) * 0.35;
          pu.torso.rotation.z = Math.sin(gs.runPhase * 0.5) * 0.035;
          pu.pack.rotation.z = Math.sin(gs.runPhase * 0.5) * 0.045;
          pu.head.rotation.z = Math.sin(gs.runPhase * 0.5) * 0.025;
        } else if (gs.jumping) {
          pu.legL.rotation.x = -0.65;
          pu.legR.rotation.x = -0.48;
          pu.armL.rotation.x = -0.95;
          pu.armR.rotation.x = -0.95;
        }

        if (gs.shakeDur > 0) {
          gs.shakeDur -= delta;
          camera.position.x += (Math.random() - 0.5) * 0.09;
          camera.position.y += (Math.random() - 0.5) * 0.055;
        }

        for (const segment of hallway.segments) {
          segment.position.z += scrollStep;
        }

        recycleHallway(hallway);

        gs.spawnObs += delta;
        gs.spawnCoin += delta;
        gs.spawnCard += delta;

        const obsThresh = Math.max(58, 118 - gs.speed * 170);

        if (gs.spawnObs > obsThresh) {
          gs.spawnObs = 0;
          spawnObstacle(scene, itemPool);
        }

        if (gs.spawnCoin > 34) {
          gs.spawnCoin = 0;
          spawnCoins(scene, itemPool);
        }

        if (gs.spawnCard > 260) {
          gs.spawnCard = 0;
          spawnCard(scene, itemPool);
        }

        const toRemove = [];
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

          if (item.mesh.position.z > playerWorldZ + 8) {
            toRemove.push(item);
            continue;
          }

          const dz = Math.abs(item.mesh.position.z - playerWorldZ);
          const dx = Math.abs(item.mesh.position.x - playerWorldX);

          if (dz < 1.55 && dx < 1.05) {
            if (item.kind === "coin") {
              coinsRef.current += 1;
              scoreRef.current += 20;

              setCoins(coinsRef.current);
              setScore(scoreRef.current);

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

            if (item.kind === "obstacle" && !item.hit) {
              const clearedCone = item.subtype === "cone" && gs.playerY > 0.72;
              const clearedLocker = item.subtype === "locker" && gs.sliding;
              const clearedBackpack = item.subtype === "backpack" && gs.playerY > 0.62;

              if (clearedCone || clearedLocker || clearedBackpack) {
                continue;
              }

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
        }

        for (const item of toRemove) {
          scene.remove(item.mesh);

          item.mesh.traverse((obj) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
              if (Array.isArray(obj.material)) {
                obj.material.forEach((mat) => mat.dispose());
              } else {
                obj.material.dispose();
              }
            }
          });

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

        camera.lookAt(player.position.x * 0.16, 1.38, -3.2);
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
    }

    three.itemPool.length = 0;

    for (let i = 0; i < three.hallway.segments.length; i += 1) {
      three.hallway.segments[i].position.z = -i * TILE_LENGTH;
    }

    gs.speed = START_SPEED;
    gs.spawnObs = 0;
    gs.spawnCoin = 0;
    gs.spawnCard = 0;
    gs.targetLane = 1;
    gs.playerX = LANE_POSITIONS[1];
    gs.jumping = false;
    gs.sliding = false;
    gs.jumpVel = 0;
    gs.playerY = 0;
    gs.runPhase = 0;
    gs.shakeDur = 0;
    gs.lastFrame = performance.now();

    three.player.position.set(LANE_POSITIONS[1], 0, PLAYER_Z);
    three.player.scale.set(1, 1, 1);
    three.player.rotation.set(0, Math.PI, 0);

    three.cameraLean = 0;
    three.camera.position.set(0, 2.55, 8.4);
    three.camera.lookAt(0, 1.38, -3.2);

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
    gs.jumpVel = 0.24;
  }, []);

  const doSlide = useCallback(() => {
    const gs = gameStateRef.current;
    if (!gs || phaseRef.current !== "running" || gs.sliding || gs.jumping) return;

    gs.sliding = true;

    setTimeout(() => {
      const current = gameStateRef.current;
      if (current) current.sliding = false;
    }, 620);
  }, []);

  const togglePause = useCallback(() => {
    if (phaseRef.current === "running") {
      setPhase("paused");
      phaseRef.current = "paused";
    } else if (phaseRef.current === "paused") {
      setPhase("running");
      phaseRef.current = "running";

      if (gameStateRef.current) {
        gameStateRef.current.lastFrame = performance.now();
      }
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

      if (e.key === "ArrowDown" || e.key.toLowerCase() === "s") {
        doSlide();
      }

      if (e.key.toLowerCase() === "p") {
        togglePause();
      }
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

    if (gameStateRef.current) {
      gameStateRef.current.lastFrame = performance.now();
    }
  }

  function continueQuestions() {
    setAnswerStatus(null);
    setActiveQuestion(rndQ(studySet));
  }

  const distM = Math.floor(distance);

  return (
    <div className="fd-page">
      <div className="fd-header">
        <div className="fd-title-block">
          <p className="fd-eyebrow">Gradeify Games</p>
          <h1>Flashcard Dash</h1>
          <p className="fd-subtitle">
            Sprint the school hall — dodge obstacles, grab coins, answer flashcards!
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

          <button
            className="fd-btn-secondary"
            onClick={togglePause}
            disabled={phase === "idle" || phase === "gameover" || phase === "question"}
          >
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
          <strong className="fd-stat-value" style={{ fontSize: "1rem" }}>
            {"❤️".repeat(Math.max(0, hearts)) || "—"}
          </strong>
        </div>

        <div className="fd-stat">
          <span className="fd-stat-label">Streak</span>
          <strong className="fd-stat-value">{streak}🔥</strong>
        </div>

        <div className="fd-stat">
          <span className="fd-stat-label">Best</span>
          <strong className="fd-stat-value">{bestStreak}</strong>
        </div>
      </div>

      <div className="fd-game-wrap" ref={mountRef}>
        {comboText && (
          <div className="fd-combo" key={comboText}>
            {comboText}
          </div>
        )}

        {phase === "idle" && (
          <div className="fd-overlay">
            <div className="fd-card">
              <p className="fd-eyebrow">Ready?</p>
              <h2>Flashcard Dash</h2>
              <p>
                Run through the school hallway. Jump over cones and backpacks, slide under
                lockers, and grab flashcards for bonus points.
              </p>

              <div className="fd-key-grid">
                <div className="fd-key-row">
                  <kbd>← / A</kbd>
                  <span>Move left</span>
                </div>

                <div className="fd-key-row">
                  <kbd>→ / D</kbd>
                  <span>Move right</span>
                </div>

                <div className="fd-key-row">
                  <kbd>↑ / Space</kbd>
                  <span>Jump</span>
                </div>

                <div className="fd-key-row">
                  <kbd>↓ / S</kbd>
                  <span>Slide</span>
                </div>
              </div>

              <button className="fd-btn-primary" onClick={startGame}>
                Start Flashcard Dash
              </button>
            </div>
          </div>
        )}

        {phase === "paused" && (
          <div className="fd-overlay">
            <div className="fd-card">
              <p className="fd-eyebrow">Paused</p>
              <h2>Game Paused</h2>
              <p>
                Press <strong>P</strong> or Resume to keep running.
              </p>

              <button className="fd-btn-primary" onClick={togglePause}>
                Resume
              </button>
            </div>
          </div>
        )}

        {phase === "gameover" && (
          <div className="fd-overlay">
            <div className="fd-card">
              <p className="fd-eyebrow">Run Over</p>
              <h2>Game Over</h2>

              <div className="fd-final-grid">
                <div>
                  <span>Score</span>
                  <strong>{score.toLocaleString()}</strong>
                </div>

                <div>
                  <span>Distance</span>
                  <strong>{distM}m</strong>
                </div>

                <div>
                  <span>Coins</span>
                  <strong>{coins}</strong>
                </div>

                <div>
                  <span>Best Streak</span>
                  <strong>{bestStreak}🔥</strong>
                </div>
              </div>

              <button className="fd-btn-primary" onClick={startGame}>
                Run Again
              </button>
            </div>
          </div>
        )}

        {phase === "question" && activeQuestion && (
          <div className="fd-question-backdrop">
            <div className="fd-question-modal">
              <button className="fd-q-close" onClick={closeQuestion}>
                ×
              </button>

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
                    <button
                      key={`${opt}-${idx}`}
                      className={cls}
                      onClick={() => answerQuestion(idx)}
                      disabled={!!answerStatus}
                    >
                      <span className="opt-letter">
                        {String.fromCharCode(65 + idx)}
                      </span>
                      {opt}
                    </button>
                  );
                })}
              </div>

              {answerStatus === "correct" && (
                <div className="fd-answer-fb correct">
                  Correct! Streak: {streak} 🔥 +{150 + streak * 30} pts
                </div>
              )}

              {answerStatus === "wrong" && (
                <div className="fd-answer-fb wrong">
                  Nope! Answer:{" "}
                  <strong>{activeQuestion.opts[activeQuestion.correct]}</strong>
                </div>
              )}

              <div className="fd-q-actions">
                <button className="fd-btn-ghost" onClick={closeQuestion}>
                  Back to Run
                </button>

                <button
                  className="fd-btn-primary"
                  onClick={continueQuestions}
                  disabled={!answerStatus}
                >
                  Next Question
                </button>
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