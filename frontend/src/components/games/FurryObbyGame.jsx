import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import "../../styles/FurryObbyGame.css";

const PLAYER_HEIGHT = 1.75;
const PLAYER_RADIUS = 0.38;
const GRAVITY = 22;
const WALK_SPEED = 7.2;
const SPRINT_SPEED = 10.4;
const JUMP_FORCE = 8.4;
const AIR_CONTROL = 0.42;
const FRICTION = 11;
const MOUSE_SENS = 0.0022;
const WORLD_FLOOR_Y = -16;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function randFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function makeCanvasTextTexture(text, options = {}) {
  const {
    width = 1024,
    height = 256,
    fontSize = 72,
    bg = "rgba(255, 179, 236, 0.78)",
    color = "#ffffff",
    stroke = "#7c2d92",
  } = options;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.lineWidth = 18;
  ctx.strokeStyle = stroke;
  ctx.strokeRect(12, 12, width - 24, height - 24);

  ctx.font = `900 ${fontSize}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 10;
  ctx.strokeStyle = "rgba(80, 0, 100, 0.95)";
  ctx.strokeText(text, width / 2, height / 2);
  ctx.fillStyle = color;
  ctx.fillText(text, width / 2, height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createTextBillboard(text, position, scale = [5.5, 1.4, 1]) {
  const texture = makeCanvasTextTexture(text);
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(scale[0], scale[1]), mat);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.rotation.y = Math.PI;
  return mesh;
}

function makeBox(scene, objects, options) {
  const {
    name = "platform",
    pos,
    size,
    color = "#ff9de6",
    type = "solid",
    level = 1,
    emissive = "#000000",
    roughness = 0.55,
    metalness = 0.05,
    opacity = 1,
    transparent = false,
    bounce = 0,
    move = null,
  } = options;

  const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive,
    roughness,
    metalness,
    opacity,
    transparent,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = {
    name,
    type,
    level,
    pos: [...pos],
    basePos: [...pos],
    size: [...size],
    bounce,
    move,
  };

  scene.add(mesh);
  objects.push(mesh);
  return mesh;
}

function makeCylinder(scene, hazards, options) {
  const {
    pos,
    radius = 0.55,
    height = 2,
    color = "#ff3b9d",
    type = "hazard",
    level = 1,
    spin = null,
  } = options;

  const geo = new THREE.CylinderGeometry(radius, radius, height, 24);
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.15,
    roughness: 0.35,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = {
    type,
    level,
    radius,
    height,
    spin,
    basePos: [...pos],
  };

  scene.add(mesh);
  hazards.push(mesh);
  return mesh;
}

function makeSphere(scene, hazards, options) {
  const {
    pos,
    radius = 0.75,
    color = "#ffffff",
    type = "hazard",
    level = 1,
    move = null,
  } = options;

  const geo = new THREE.SphereGeometry(radius, 24, 18);
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.12,
    roughness: 0.42,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = {
    type,
    level,
    radius,
    move,
    basePos: [...pos],
  };

  scene.add(mesh);
  hazards.push(mesh);
  return mesh;
}

function makeSpinner(scene, hazards, options) {
  const {
    center,
    armLength = 7,
    armThickness = 0.28,
    speed = 1.6,
    level = 1,
    color = "#ff4fc3",
  } = options;

  const group = new THREE.Group();
  group.position.set(center[0], center[1], center[2]);

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.25, 2.2, 20),
    new THREE.MeshStandardMaterial({
      color: "#ffffff",
      emissive: "#ffb6f0",
      emissiveIntensity: 0.12,
    })
  );
  pole.position.y = 0.45;
  pole.castShadow = true;
  group.add(pole);

  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(armLength, armThickness, armThickness),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.25,
    })
  );
  arm.position.y = 1.05;
  arm.castShadow = true;
  group.add(arm);

  const tailTipA = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 18, 14),
    new THREE.MeshStandardMaterial({
      color: "#ffffff",
      emissive: "#ffc4f3",
      emissiveIntensity: 0.2,
    })
  );
  tailTipA.position.set(armLength / 2, 1.05, 0);
  group.add(tailTipA);

  const tailTipB = tailTipA.clone();
  tailTipB.position.set(-armLength / 2, 1.05, 0);
  group.add(tailTipB);

  group.userData = {
    type: "spinner",
    level,
    center: [...center],
    armLength,
    armThickness,
    speed,
    angle: 0,
  };

  scene.add(group);
  hazards.push(group);
  return group;
}

function addCringeDecor(scene, x, y, z, text) {
  const sign = createTextBillboard(text, [x, y, z], [4.8, 1.1, 1]);
  scene.add(sign);
  return sign;
}

function buildFurryObby(scene, objects, hazards) {
  const cringe = [
    "UWU CHECKPOINT",
    "OWO DON'T FALL",
    "FURSUIT FURY",
    "NYA~",
    "PAW PATROL BUT WORSE",
    "NO ESCAPE FROM UWU",
    "TAIL SPIN ZONE",
    "THE CRINGE GETS WORSE",
    "FURRY CONVENTION LAVA",
    "RAWR XD",
    "WELCOME TO PAW HELL",
    "ONLY ALPHAS SURVIVE",
  ];

  const platformColors = [
    "#ff9de6",
    "#9ee7ff",
    "#b8ff9e",
    "#ffe18f",
    "#d6a3ff",
    "#ffb07c",
  ];

  makeBox(scene, objects, {
    name: "start",
    pos: [0, 0, 0],
    size: [12, 0.65, 12],
    color: "#ff9de6",
    type: "checkpoint",
    level: 1,
  });

  addCringeDecor(scene, 0, 3.1, -4.6, "FURRY OBBY: THE UWU ASCENSION");

  let z = -13;
  let x = 0;
  let y = 0;
  let level = 1;

  for (let i = 0; i < 42; i++) {
    level = i + 1;
    const pattern = i % 9;
    const color = platformColors[i % platformColors.length];

    if (i % 5 === 0) {
      makeBox(scene, objects, {
        name: `checkpoint-${level}`,
        pos: [x, y, z],
        size: [9.5, 0.65, 7],
        color: "#60ffb5",
        emissive: "#0c5435",
        type: "checkpoint",
        level,
      });
      addCringeDecor(scene, x, y + 3.1, z - 2.7, randFrom(cringe));
      z -= 10;
    }

    if (pattern === 0) {
      for (let j = 0; j < 4; j++) {
        x += j % 2 === 0 ? 3.8 : -3.1;
        y += 0.15;
        makeBox(scene, objects, {
          name: `paw-hop-${level}-${j}`,
          pos: [x, y, z],
          size: [4.8, 0.55, 4.8],
          color,
          type: "solid",
          level,
        });
        z -= 7.2;
      }
    }

    if (pattern === 1) {
      for (let j = 0; j < 5; j++) {
        x = Math.sin(j * 1.7) * 5.6;
        y += 0.18;
        makeBox(scene, objects, {
          name: `tiny-paw-${level}-${j}`,
          pos: [x, y, z],
          size: [3.25, 0.52, 3.25],
          color,
          type: "solid",
          level,
        });
        z -= 6.1;
      }
    }

    if (pattern === 2) {
      makeBox(scene, objects, {
        name: `moving-tail-platform-${level}`,
        pos: [x, y, z],
        size: [6.2, 0.55, 5.4],
        color: "#9ee7ff",
        type: "solid",
        level,
        move: {
          axis: "x",
          distance: 5.6,
          speed: 1.4 + i * 0.015,
          phase: i,
        },
      });
      addCringeDecor(scene, x, y + 2.7, z - 1.6, "MOVING UWU PLATFORM");
      z -= 9.4;

      makeBox(scene, objects, {
        name: `landing-${level}`,
        pos: [0, y + 0.1, z],
        size: [7, 0.55, 5.6],
        color,
        type: "solid",
        level,
      });
      x = 0;
      y += 0.1;
      z -= 8.5;
    }

    if (pattern === 3) {
      makeBox(scene, objects, {
        name: `spinner-base-${level}`,
        pos: [0, y, z],
        size: [10.5, 0.55, 8],
        color: "#ffe18f",
        type: "solid",
        level,
      });
      makeSpinner(scene, hazards, {
        center: [0, y + 0.3, z],
        armLength: 8,
        speed: 1.25 + i * 0.035,
        level,
        color: "#ff3ba7",
      });
      addCringeDecor(scene, 0, y + 3.2, z - 2.9, "DODGE THE SPINNY TAIL XD");
      z -= 10.5;
    }

    if (pattern === 4) {
      for (let j = 0; j < 4; j++) {
        const side = j % 2 === 0 ? -4.4 : 4.4;
        makeBox(scene, objects, {
          name: `side-paw-${level}-${j}`,
          pos: [side, y, z],
          size: [4.2, 0.52, 4.2],
          color,
          type: "solid",
          level,
        });
        makeSphere(scene, hazards, {
          pos: [-side, y + 1.15, z],
          radius: 0.9,
          color: "#ff4fc3",
          level,
          move: {
            axis: "x",
            distance: 4.8,
            speed: 1.5 + i * 0.02,
            phase: j,
          },
        });
        z -= 6.6;
      }
      x = 4.4;
    }

    if (pattern === 5) {
      makeBox(scene, objects, {
        name: `bounce-pad-${level}`,
        pos: [x, y, z],
        size: [5.8, 0.5, 5.8],
        color: "#a855f7",
        emissive: "#5b21b6",
        type: "bounce",
        level,
        bounce: 13.2,
      });
      addCringeDecor(scene, x, y + 2.8, z - 2.1, "BOINGY PAW PAD");
      z -= 11.5;
      y += 2.6;

      makeBox(scene, objects, {
        name: `high-landing-${level}`,
        pos: [0, y, z],
        size: [7.4, 0.58, 6.2],
        color,
        type: "solid",
        level,
      });
      x = 0;
      z -= 8;
    }

    if (pattern === 6) {
      for (let j = 0; j < 6; j++) {
        const narrowX = Math.sin(j * 1.35) * 3.2;
        makeBox(scene, objects, {
          name: `skinny-bridge-${level}-${j}`,
          pos: [narrowX, y, z],
          size: [2.4, 0.48, 5.1],
          color: "#ffffff",
          type: "solid",
          level,
        });

        if (j % 2 === 1) {
          makeCylinder(scene, hazards, {
            pos: [narrowX + 2.1, y + 0.8, z],
            radius: 0.45,
            height: 1.6,
            color: "#ff006e",
            level,
            spin: {
              axis: "y",
              speed: 3,
            },
          });
        }

        z -= 5.4;
      }
    }

    if (pattern === 7) {
      makeBox(scene, objects, {
        name: `fake-safe-${level}`,
        pos: [0, y, z],
        size: [9.5, 0.55, 6.8],
        color: "#ff9de6",
        type: "solid",
        level,
      });

      const lavaPieces = [
        [-3.1, y + 0.42, z],
        [0, y + 0.42, z + 1.8],
        [3.1, y + 0.42, z - 1.8],
      ];

      lavaPieces.forEach((p, idx) => {
        makeBox(scene, objects, {
          name: `uwu-lava-${level}-${idx}`,
          pos: p,
          size: [2.25, 0.18, 2.25],
          color: "#ff1744",
          emissive: "#ff0033",
          type: "hazardTile",
          level,
        });
      });

      addCringeDecor(scene, 0, y + 3.1, z - 2.5, "UWU LAVA TILES");
      z -= 9.5;
    }

    if (pattern === 8) {
      for (let j = 0; j < 5; j++) {
        const platformX = (j - 2) * 2.7;
        y += j === 2 ? 0.75 : 0.08;
        makeBox(scene, objects, {
          name: `stair-paw-${level}-${j}`,
          pos: [platformX, y, z],
          size: [3.3, 0.5, 3.3],
          color,
          type: "solid",
          level,
        });
        z -= 5.2;
      }

      makeSpinner(scene, hazards, {
        center: [0, y + 0.2, z + 7],
        armLength: 6.6,
        speed: 1.8 + i * 0.025,
        level,
        color: "#00d4ff",
      });
      x = 0;
    }

    if (i > 0 && i % 11 === 0) {
      makeBox(scene, objects, {
        name: `boss-checkpoint-${level}`,
        pos: [0, y + 0.2, z],
        size: [13, 0.68, 9],
        color: "#60ffb5",
        emissive: "#0c5435",
        type: "checkpoint",
        level,
      });

      addCringeDecor(scene, 0, y + 3.3, z - 3.2, "MEGA CHECKPOINT, BESTIE");
      z -= 11;

      makeBox(scene, objects, {
        name: `boss-platform-${level}`,
        pos: [0, y + 0.2, z],
        size: [15, 0.65, 11],
        color: "#2dd4bf",
        type: "solid",
        level,
      });

      makeSpinner(scene, hazards, {
        center: [-3.2, y + 0.45, z],
        armLength: 7.5,
        speed: 2.1 + i * 0.02,
        level,
        color: "#ff3b9d",
      });

      makeSpinner(scene, hazards, {
        center: [3.2, y + 0.45, z],
        armLength: 7.5,
        speed: -2.35 - i * 0.018,
        level,
        color: "#a855f7",
      });

      addCringeDecor(scene, 0, y + 3.4, z - 4.2, "DOUBLE TAIL ATTACK");
      z -= 13;
    }
  }

  makeBox(scene, objects, {
    name: "finish",
    pos: [0, y + 0.5, z],
    size: [16, 0.8, 13],
    color: "#ffd700",
    emissive: "#8a6d00",
    type: "finish",
    level: 43,
  });

  addCringeDecor(scene, 0, y + 4, z - 3.8, "YOU ESCAPED THE UWU DIMENSION");
}

function distancePointToSegment2D(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const apx = px - ax;
  const apz = pz - az;
  const lenSq = abx * abx + abz * abz;
  if (lenSq === 0) return Math.hypot(px - ax, pz - az);
  const t = clamp((apx * abx + apz * abz) / lenSq, 0, 1);
  const cx = ax + abx * t;
  const cz = az + abz * t;
  return Math.hypot(px - cx, pz - cz);
}

export default function FurryObbyGame({ onBack }) {
  const mountRef = useRef(null);
  const stateRef = useRef(null);

  const [hud, setHud] = useState({
    started: false,
    paused: false,
    locked: false,
    level: 1,
    deaths: 0,
    checkpoint: 1,
    completed: false,
    time: 0,
  });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#9bdcff");
    scene.fog = new THREE.Fog("#9bdcff", 18, 145);

    const camera = new THREE.PerspectiveCamera(
      78,
      mount.clientWidth / mount.clientHeight,
      0.05,
      500
    );
    camera.rotation.order = "YXZ";

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight("#ffffff", "#9e5bbd", 0.9);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight("#ffffff", 1.25);
    sun.position.set(18, 32, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.left = -70;
    sun.shadow.camera.right = 70;
    sun.shadow.camera.top = 70;
    sun.shadow.camera.bottom = -70;
    scene.add(sun);

    const objects = [];
    const hazards = [];
    buildFurryObby(scene, objects, hazards);

    const skyGeo = new THREE.SphereGeometry(240, 32, 18);
    const skyMat = new THREE.MeshBasicMaterial({
      color: "#d9b8ff",
      side: THREE.BackSide,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    scene.add(sky);

    const clouds = [];
    for (let i = 0; i < 55; i++) {
      const cloud = new THREE.Mesh(
        new THREE.SphereGeometry(2 + Math.random() * 2.5, 12, 8),
        new THREE.MeshBasicMaterial({
          color: "#ffffff",
          transparent: true,
          opacity: 0.62,
        })
      );
      cloud.position.set(
        -65 + Math.random() * 130,
        20 + Math.random() * 32,
        -10 - Math.random() * 520
      );
      cloud.scale.set(1.9, 0.55, 0.9);
      scene.add(cloud);
      clouds.push(cloud);
    }

    const player = {
      pos: new THREE.Vector3(0, 2.3, 2.8),
      vel: new THREE.Vector3(0, 0, 0),
      yaw: Math.PI,
      pitch: 0,
      grounded: false,
      checkpointPos: new THREE.Vector3(0, 2.3, 2.8),
      checkpointLevel: 1,
      level: 1,
      deaths: 0,
      completed: false,
      startTime: performance.now(),
      finishedTime: null,
      lastGroundObject: null,
      platformDelta: new THREE.Vector3(),
    };

    const keys = {
      KeyW: false,
      KeyA: false,
      KeyS: false,
      KeyD: false,
      Space: false,
      ShiftLeft: false,
      ShiftRight: false,
      KeyR: false,
    };

    const runtime = {
      scene,
      camera,
      renderer,
      objects,
      hazards,
      player,
      keys,
      running: true,
      started: false,
      paused: false,
      locked: false,
      lastT: performance.now(),
      raf: null,
      lastHudUpdate: 0,
      pointerHint: true,
    };

    stateRef.current = runtime;

    function respawn() {
      player.deaths += 1;
      player.pos.copy(player.checkpointPos);
      player.vel.set(0, 0, 0);
      player.pitch = 0;
      player.yaw = Math.PI;
      player.grounded = false;
      player.lastGroundObject = null;

      setHud((h) => ({
        ...h,
        deaths: player.deaths,
        level: player.checkpointLevel,
        checkpoint: player.checkpointLevel,
        completed: false,
      }));
    }

    function requestLock() {
      renderer.domElement.requestPointerLock?.();
      runtime.started = true;
      setHud((h) => ({ ...h, started: true }));
    }

    function onPointerLockChange() {
      runtime.locked = document.pointerLockElement === renderer.domElement;
      setHud((h) => ({ ...h, locked: runtime.locked }));
    }

    function onMouseMove(e) {
      if (!runtime.locked || runtime.paused || player.completed) return;

      player.yaw -= e.movementX * MOUSE_SENS;
      player.pitch -= e.movementY * MOUSE_SENS;
      player.pitch = clamp(player.pitch, -1.38, 1.38);
    }

    function onKeyDown(e) {
      if (e.code in keys) keys[e.code] = true;

      if (e.code === "Escape") {
        runtime.paused = true;
        document.exitPointerLock?.();
        setHud((h) => ({ ...h, paused: true }));
      }

      if (e.code === "KeyP") {
        runtime.paused = !runtime.paused;
        setHud((h) => ({ ...h, paused: runtime.paused }));
      }

      if (e.code === "KeyR") {
        respawn();
      }
    }

    function onKeyUp(e) {
      if (e.code in keys) keys[e.code] = false;
    }

    function onClick() {
      if (!runtime.locked && !runtime.paused && !player.completed) {
        requestLock();
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

    function updateMovingObjects(t) {
      for (const obj of objects) {
        const move = obj.userData.move;
        if (!move) continue;

        const oldX = obj.position.x;
        const oldY = obj.position.y;
        const oldZ = obj.position.z;

        const base = obj.userData.basePos;
        const offset = Math.sin(t * move.speed + move.phase) * move.distance;

        if (move.axis === "x") obj.position.x = base[0] + offset;
        if (move.axis === "y") obj.position.y = base[1] + offset;
        if (move.axis === "z") obj.position.z = base[2] + offset;

        obj.userData.pos = [obj.position.x, obj.position.y, obj.position.z];
        obj.userData.delta = [
          obj.position.x - oldX,
          obj.position.y - oldY,
          obj.position.z - oldZ,
        ];
      }

      for (const hz of hazards) {
        if (hz.userData.type === "spinner") {
          hz.userData.angle += hz.userData.speed * 0.016;
          hz.rotation.y = hz.userData.angle;
        }

        if (hz.userData.spin) {
          const s = hz.userData.spin;
          if (s.axis === "y") hz.rotation.y += s.speed * 0.016;
          if (s.axis === "x") hz.rotation.x += s.speed * 0.016;
          if (s.axis === "z") hz.rotation.z += s.speed * 0.016;
        }

        if (hz.userData.move) {
          const move = hz.userData.move;
          const base = hz.userData.basePos;
          const offset = Math.sin(t * move.speed + move.phase) * move.distance;
          if (move.axis === "x") hz.position.x = base[0] + offset;
          if (move.axis === "y") hz.position.y = base[1] + offset;
          if (move.axis === "z") hz.position.z = base[2] + offset;
        }
      }
    }

    function getStandingPlatform(prevPos, nextPos) {
      const feetPrev = prevPos.y - PLAYER_HEIGHT;
      const feetNext = nextPos.y - PLAYER_HEIGHT;

      let best = null;
      let bestTop = -Infinity;

      for (const obj of objects) {
        const type = obj.userData.type;
        if (type === "hazardTile") continue;

        const [px, py, pz] = obj.userData.pos;
        const [sx, sy, sz] = obj.userData.size;
        const top = py + sy / 2;

        const insideX =
          nextPos.x + PLAYER_RADIUS > px - sx / 2 &&
          nextPos.x - PLAYER_RADIUS < px + sx / 2;
        const insideZ =
          nextPos.z + PLAYER_RADIUS > pz - sz / 2 &&
          nextPos.z - PLAYER_RADIUS < pz + sz / 2;

        const crossedTop =
          feetPrev >= top - 0.08 &&
          feetNext <= top + 0.16 &&
          player.vel.y <= 0;

        if (insideX && insideZ && crossedTop && top > bestTop) {
          best = obj;
          bestTop = top;
        }
      }

      return best;
    }

    function isInsideHazardTile(pos) {
      for (const obj of objects) {
        if (obj.userData.type !== "hazardTile") continue;

        const [px, py, pz] = obj.userData.pos;
        const [sx, sy, sz] = obj.userData.size;

        const inside =
          pos.x > px - sx / 2 - PLAYER_RADIUS &&
          pos.x < px + sx / 2 + PLAYER_RADIUS &&
          pos.z > pz - sz / 2 - PLAYER_RADIUS &&
          pos.z < pz + sz / 2 + PLAYER_RADIUS &&
          pos.y - PLAYER_HEIGHT < py + sy / 2 + 0.25 &&
          pos.y > py - sy / 2;

        if (inside) return true;
      }

      return false;
    }

    function isTouchingHazard(pos) {
      if (isInsideHazardTile(pos)) return true;

      for (const hz of hazards) {
        if (hz.userData.type === "spinner") {
          const center = hz.position;
          const angle = hz.rotation.y;
          const len = hz.userData.armLength / 2;

          const ax = center.x + Math.cos(angle) * -len;
          const az = center.z + Math.sin(angle) * -len;
          const bx = center.x + Math.cos(angle) * len;
          const bz = center.z + Math.sin(angle) * len;

          const verticalHit =
            pos.y - PLAYER_HEIGHT < center.y + 1.35 && pos.y > center.y + 0.45;

          if (
            verticalHit &&
            distancePointToSegment2D(pos.x, pos.z, ax, az, bx, bz) <
              PLAYER_RADIUS + 0.35
          ) {
            return true;
          }
        } else {
          const r = hz.userData.radius || 0.65;
          const h = hz.userData.height || r * 2;
          const dx = pos.x - hz.position.x;
          const dz = pos.z - hz.position.z;
          const horizontal = Math.hypot(dx, dz);
          const vertical =
            pos.y - PLAYER_HEIGHT < hz.position.y + h / 2 &&
            pos.y > hz.position.y - h / 2;

          if (vertical && horizontal < r + PLAYER_RADIUS) return true;
        }
      }

      return false;
    }

    function checkSpecialPlatform(platform) {
      if (!platform) return;

      const type = platform.userData.type;
      const lvl = platform.userData.level || 1;

      if (type === "checkpoint" && lvl >= player.checkpointLevel) {
        player.checkpointLevel = lvl;
        player.checkpointPos.set(
          platform.position.x,
          platform.position.y + platform.userData.size[1] / 2 + PLAYER_HEIGHT + 0.08,
          platform.position.z + 1.8
        );

        setHud((h) => ({
          ...h,
          checkpoint: player.checkpointLevel,
          level: Math.max(h.level, lvl),
        }));
      }

      if (type === "bounce") {
        player.vel.y = platform.userData.bounce || 12;
        player.grounded = false;
      }

      if (type === "finish" && !player.completed) {
        player.completed = true;
        player.finishedTime = (performance.now() - player.startTime) / 1000;
        document.exitPointerLock?.();

        setHud((h) => ({
          ...h,
          completed: true,
          locked: false,
          time: player.finishedTime,
          level: 43,
        }));
      }

      player.level = Math.max(player.level, lvl);
    }

    function updatePlayer(dt) {
      if (!runtime.started || runtime.paused || player.completed) return;

      const prev = player.pos.clone();

      const forward = new THREE.Vector3(
        -Math.sin(player.yaw),
        0,
        -Math.cos(player.yaw)
      );
      const right = new THREE.Vector3(
        Math.cos(player.yaw),
        0,
        -Math.sin(player.yaw)
      );

      const wish = new THREE.Vector3();

      if (keys.KeyW) wish.add(forward);
      if (keys.KeyS) wish.sub(forward);
      if (keys.KeyD) wish.add(right);
      if (keys.KeyA) wish.sub(right);

      if (wish.lengthSq() > 0) wish.normalize();

      const maxSpeed = keys.ShiftLeft || keys.ShiftRight ? SPRINT_SPEED : WALK_SPEED;
      const control = player.grounded ? 1 : AIR_CONTROL;

      player.vel.x += wish.x * maxSpeed * FRICTION * control * dt;
      player.vel.z += wish.z * maxSpeed * FRICTION * control * dt;

      const horizontal = new THREE.Vector2(player.vel.x, player.vel.z);
      const speed = horizontal.length();
      if (speed > maxSpeed) {
        horizontal.setLength(maxSpeed);
        player.vel.x = horizontal.x;
        player.vel.z = horizontal.y;
      }

      if (player.grounded && wish.lengthSq() === 0) {
        const damp = Math.max(0, 1 - FRICTION * dt);
        player.vel.x *= damp;
        player.vel.z *= damp;
      }

      if (player.grounded && keys.Space) {
        player.vel.y = JUMP_FORCE;
        player.grounded = false;
        player.lastGroundObject = null;
      }

      player.vel.y -= GRAVITY * dt;

      const next = player.pos.clone().addScaledVector(player.vel, dt);
      const standing = getStandingPlatform(prev, next);

      if (standing) {
        const top = standing.position.y + standing.userData.size[1] / 2;
        next.y = top + PLAYER_HEIGHT;
        player.vel.y = 0;
        player.grounded = true;
        player.lastGroundObject = standing;

        const delta = standing.userData.delta;
        if (delta) {
          next.x += delta[0];
          next.y += delta[1];
          next.z += delta[2];
        }

        checkSpecialPlatform(standing);
      } else {
        player.grounded = false;
        player.lastGroundObject = null;
      }

      player.pos.copy(next);

      if (isTouchingHazard(player.pos)) {
        respawn();
      }

      if (player.pos.y < WORLD_FLOOR_Y) {
        respawn();
      }

      camera.position.copy(player.pos);
      camera.rotation.y = player.yaw;
      camera.rotation.x = player.pitch;
    }

    function animate(now) {
      if (!runtime.running) return;

      const rawDt = (now - runtime.lastT) / 1000;
      const dt = Math.min(rawDt, 0.033);
      runtime.lastT = now;

      const t = now / 1000;

      updateMovingObjects(t);
      updatePlayer(dt);

      sky.position.copy(camera.position);

      for (let i = 0; i < clouds.length; i++) {
        clouds[i].position.x += Math.sin(t * 0.2 + i) * 0.002;
      }

      renderer.render(scene, camera);

      if (now - runtime.lastHudUpdate > 160) {
        runtime.lastHudUpdate = now;
        const elapsed =
          player.completed && player.finishedTime
            ? player.finishedTime
            : (performance.now() - player.startTime) / 1000;

        setHud((h) => ({
          ...h,
          level: Math.max(h.level, player.level),
          deaths: player.deaths,
          checkpoint: player.checkpointLevel,
          paused: runtime.paused,
          locked: runtime.locked,
          started: runtime.started,
          time: elapsed,
          completed: player.completed,
        }));
      }

      runtime.raf = requestAnimationFrame(animate);
    }

    runtime.raf = requestAnimationFrame(animate);

    return () => {
      runtime.running = false;
      if (runtime.raf) cancelAnimationFrame(runtime.raf);

      document.removeEventListener("pointerlockchange", onPointerLockChange);
      document.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("click", onClick);

      if (document.pointerLockElement === renderer.domElement) {
        document.exitPointerLock?.();
      }

      renderer.dispose();

      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose?.();

        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => {
              m.map?.dispose?.();
              m.dispose?.();
            });
          } else {
            obj.material.map?.dispose?.();
            obj.material.dispose?.();
          }
        }
      });

      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }

      stateRef.current = null;
    };
  }, []);

  function resumeGame() {
    const runtime = stateRef.current;
    if (!runtime) return;
    runtime.paused = false;
    runtime.renderer.domElement.requestPointerLock?.();
    setHud((h) => ({ ...h, paused: false }));
  }

  function restartGame() {
    const runtime = stateRef.current;
    if (!runtime) return;

    const { player } = runtime;
    player.pos.set(0, 2.3, 2.8);
    player.vel.set(0, 0, 0);
    player.yaw = Math.PI;
    player.pitch = 0;
    player.grounded = false;
    player.checkpointPos.set(0, 2.3, 2.8);
    player.checkpointLevel = 1;
    player.level = 1;
    player.deaths = 0;
    player.completed = false;
    player.startTime = performance.now();
    player.finishedTime = null;

    runtime.started = true;
    runtime.paused = false;

    setHud({
      started: true,
      paused: false,
      locked: false,
      level: 1,
      deaths: 0,
      checkpoint: 1,
      completed: false,
      time: 0,
    });

    runtime.renderer.domElement.requestPointerLock?.();
  }

  function formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return `${min}:${String(sec).padStart(2, "0")}`;
  }

  return (
    <div className="furry-obby-page">
      <div className="furry-obby-topbar">
        <div>
          <h1>Furry Obby: UwU Ascension</h1>
          <p>First-person Roblox-inspired cringe platforming nightmare.</p>
        </div>

        <div className="furry-obby-actions">
          {onBack && (
            <button type="button" onClick={onBack}>
              Back
            </button>
          )}
          <button type="button" onClick={restartGame}>
            Restart
          </button>
          <button type="button" onClick={resumeGame}>
            Resume
          </button>
        </div>
      </div>

      <div className="furry-obby-shell">
        <div ref={mountRef} className="furry-obby-canvas" />

        <div className="furry-obby-crosshair">
          <span />
        </div>

        <div className="furry-obby-hud">
          <div>
            <strong>Level</strong>
            <span>{hud.level}/43</span>
          </div>
          <div>
            <strong>Checkpoint</strong>
            <span>{hud.checkpoint}</span>
          </div>
          <div>
            <strong>Deaths</strong>
            <span>{hud.deaths}</span>
          </div>
          <div>
            <strong>Time</strong>
            <span>{formatTime(hud.time)}</span>
          </div>
        </div>

        {!hud.started && (
          <div className="furry-obby-overlay">
            <div className="furry-obby-card">
              <h2>Furry Obby: UwU Ascension</h2>
              <p>
                Click to lock your mouse. Survive 43 cursed Roblox-style obby
                stages full of paw pads, tail sweepers, uwu lava, fursuit heads,
                and cringe signs.
              </p>
              <div className="furry-obby-controls">
                <span>WASD · move</span>
                <span>Mouse · look</span>
                <span>Space · jump</span>
                <span>Shift · sprint</span>
                <span>R · respawn</span>
                <span>P · pause</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const runtime = stateRef.current;
                  if (!runtime) return;
                  runtime.started = true;
                  runtime.paused = false;
                  runtime.renderer.domElement.requestPointerLock?.();
                  setHud((h) => ({ ...h, started: true, paused: false }));
                }}
              >
                Enter the UwU Dimension
              </button>
            </div>
          </div>
        )}

        {hud.paused && !hud.completed && (
          <div className="furry-obby-overlay">
            <div className="furry-obby-card">
              <h2>Paused</h2>
              <p>The cringe is waiting.</p>
              <button type="button" onClick={resumeGame}>
                Resume
              </button>
            </div>
          </div>
        )}

        {hud.completed && (
          <div className="furry-obby-overlay">
            <div className="furry-obby-card victory">
              <h2>You Escaped the UwU Dimension</h2>
              <p>
                Final time: <strong>{formatTime(hud.time)}</strong>
              </p>
              <p>
                Deaths: <strong>{hud.deaths}</strong>
              </p>
              <button type="button" onClick={restartGame}>
                Run It Back
              </button>
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