import React, { useEffect, useRef, useState, useCallback } from "react";
import "../../styles/FlashcardDash.css";

// ── Constants ─────────────────────────────────────────────────────────────
const GAME_W = 900;
const GAME_H = 580;
const LANES = [-1, 0, 1];
const LANE_GAP = 182;
const LANE_CENTER_X = GAME_W / 2;
const PLAYER_BASE_Y = 455;   // feet Y in canvas coords
const START_SPEED = 4.8;
const MAX_SPEED = 13;
const START_HEARTS = 3;

// Items spawn lower (further from top = closer to player = bigger in perspective)
const SPAWN_Y = -100;

function laneX(lane) { return LANE_CENTER_X + lane * LANE_GAP; }
function rndLane() { return LANES[Math.floor(Math.random() * 3)]; }

// ── Question bank ─────────────────────────────────────────────────────────
const QUESTION_BANK = [
  { q: "What is the main purpose of photosynthesis?", opts: ["To create glucose using sunlight","To break down rocks","To make oxygen from glucose","To digest proteins"], correct: 0 },
  { q: "What does slope represent in y = mx + b?", opts: ["The x-intercept","The rate of change","The y-intercept","The maximum value"], correct: 1 },
  { q: "Which organelle is the powerhouse of the cell?", opts: ["Nucleus","Ribosome","Mitochondria","Golgi apparatus"], correct: 2 },
  { q: "What is opportunity cost?", opts: ["The total money spent","The value of the next best alternative","A fixed expense","Profit after taxes"], correct: 1 },
  { q: "What is the derivative of x²?", opts: ["x","2x","x³","2"], correct: 1 },
  { q: "Which molecule carries genetic information?", opts: ["ATP","DNA","Glucose","Water"], correct: 1 },
  { q: "What does inflation mean?", opts: ["Prices generally rise over time","Prices always fall","Interest rates are zero","The stock market closes"], correct: 0 },
  { q: "What does a topic sentence usually do?", opts: ["Ends the essay","Introduces the main idea","Lists citations","Creates bibliography"], correct: 1 },
  { q: "What is Newton's Second Law?", opts: ["F = ma","E = mc²","V = IR","PV = nRT"], correct: 0 },
  { q: "Which planet is closest to the Sun?", opts: ["Venus","Earth","Mercury","Mars"], correct: 2 },
];

function rndQuestion() { return QUESTION_BANK[Math.floor(Math.random() * QUESTION_BANK.length)]; }

// ── Item factories ─────────────────────────────────────────────────────────
let nextId = 1;
const OBS_TYPES = ["cone","locker","backpack"];
function mkObstacle() {
  return { id: nextId++, kind: "obstacle", subtype: OBS_TYPES[Math.floor(Math.random()*3)], lane: rndLane(), y: SPAWN_Y, w: 66, h: 74 };
}
function mkCoin(lane, offsetY = 0) {
  return { id: nextId++, kind: "coin", lane, y: SPAWN_Y + offsetY, w: 34, h: 34 };
}
function mkCard() {
  return { id: nextId++, kind: "card", lane: rndLane(), y: SPAWN_Y, w: 62, h: 46, question: rndQuestion() };
}

// ── Canvas environment renderer ────────────────────────────────────────────
// We render the track, sky, buildings, graffiti walls, and ground all on canvas
// for smooth parallax. React handles the player + items as DOM elements on top.

// Tunnel perspective constants
const TRACK_TOP_W  = 360;   // width of road at horizon
const TRACK_BOT_W  = GAME_W + 60; // width at bottom (wide)
const HORIZON_Y    = 168;   // where sky meets road
const TRACK_TOP_X  = (GAME_W - TRACK_TOP_W) / 2; // left edge of road at horizon
const TRACK_BOT_X  = -30;   // left edge at bottom

// Interpolate between horizon and bottom for a given y
function trackX(y, side) {
  const t = (y - HORIZON_Y) / (GAME_H - HORIZON_Y);
  if (side === 'left') return TRACK_TOP_X + (TRACK_BOT_X - TRACK_TOP_X) * t;
  return TRACK_TOP_X + TRACK_TOP_W + (TRACK_BOT_X + TRACK_BOT_W - TRACK_TOP_X - TRACK_TOP_W) * t;
}
function trackWidth(y) { return trackX(y, 'right') - trackX(y, 'left'); }

// Draw the static environment (called every frame to get scrolling ground lines)
function drawEnvironment(ctx, scrollOffset, now) {
  // Sky gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, HORIZON_Y + 30);
  skyGrad.addColorStop(0,   "#08001a");
  skyGrad.addColorStop(0.45,"#1a0533");
  skyGrad.addColorStop(0.75,"#3d0f6e");
  skyGrad.addColorStop(1,   "#7b2fbf");
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, GAME_W, HORIZON_Y + 30);

  // Stars
  ctx.save();
  const starData = [
    [60,20,1.2],[140,45,0.8],[220,15,1.4],[310,60,0.7],[400,25,1.1],[500,40,0.9],
    [590,18,1.3],[680,50,0.8],[760,30,1.0],[830,12,1.2],[880,55,0.7],[30,55,0.9],
    [170,8,0.8],[350,35,1.1],[450,12,0.6],[630,42,1.0],[720,20,0.9],[800,38,1.3],
  ];
  starData.forEach(([sx, sy, r]) => {
    const twinkle = 0.5 + 0.5 * Math.sin(now * 0.002 + sx);
    ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.4 * twinkle})`;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  // Distant city silhouette
  ctx.save();
  ctx.fillStyle = "rgba(50,10,100,0.85)";
  const buildings = [
    [60,70,55],[130,95,48],[210,60,52],[290,80,44],[370,105,50],[450,70,46],
    [520,88,54],[600,62,46],[670,95,50],[740,72,48],[800,85,52],[860,65,44],
  ];
  buildings.forEach(([bx, bh, bw]) => {
    ctx.beginPath();
    ctx.roundRect(bx - bw/2, HORIZON_Y - bh, bw, bh + 2, [6, 6, 0, 0]);
    ctx.fill();
    // Windows
    ctx.fillStyle = "rgba(255,230,0,0.22)";
    for (let wy = 8; wy < bh - 8; wy += 16) {
      for (let wx = 8; wx < bw - 8; wx += 12) {
        if (Math.random() > 0.45) {
          ctx.fillRect(bx - bw/2 + wx, HORIZON_Y - bh + wy, 7, 9);
        }
      }
    }
    ctx.fillStyle = "rgba(50,10,100,0.85)";
  });
  ctx.restore();

  // Neon glow at horizon
  const horizonGlow = ctx.createLinearGradient(0, HORIZON_Y - 20, 0, HORIZON_Y + 20);
  horizonGlow.addColorStop(0, "transparent");
  horizonGlow.addColorStop(0.5, "rgba(255,45,155,0.3)");
  horizonGlow.addColorStop(1, "transparent");
  ctx.fillStyle = horizonGlow;
  ctx.fillRect(0, HORIZON_Y - 20, GAME_W, 40);

  // ── Road surface ──────────────────────────────────────────────────────
  ctx.save();
  // Road trapezoid fill
  ctx.beginPath();
  ctx.moveTo(TRACK_TOP_X, HORIZON_Y);
  ctx.lineTo(TRACK_TOP_X + TRACK_TOP_W, HORIZON_Y);
  ctx.lineTo(TRACK_BOT_X + TRACK_BOT_W, GAME_H);
  ctx.lineTo(TRACK_BOT_X, GAME_H);
  ctx.closePath();
  const roadGrad = ctx.createLinearGradient(0, HORIZON_Y, 0, GAME_H);
  roadGrad.addColorStop(0,   "#1a1a2e");
  roadGrad.addColorStop(0.4, "#222240");
  roadGrad.addColorStop(1,   "#2a2a4a");
  ctx.fillStyle = roadGrad;
  ctx.fill();

  // Road edge glow strips (left & right)
  const leftGlow = ctx.createLinearGradient(TRACK_BOT_X, 0, TRACK_BOT_X + 80, 0);
  leftGlow.addColorStop(0, "rgba(255,45,155,0.18)");
  leftGlow.addColorStop(1, "transparent");
  ctx.fillStyle = leftGlow;
  ctx.fill();

  // Scrolling horizontal ground lines (perspective stripes)
  const STRIPE_SPACING = 90; // at bottom
  const numStripes = Math.ceil(GAME_H / STRIPE_SPACING) + 2;
  for (let i = 0; i < numStripes; i++) {
    // Start stripes from bottom, scroll up
    let yBot = GAME_H - ((scrollOffset % STRIPE_SPACING) + i * STRIPE_SPACING);
    if (yBot < HORIZON_Y) continue;
    if (yBot > GAME_H + STRIPE_SPACING) continue;
    const t = (yBot - HORIZON_Y) / (GAME_H - HORIZON_Y);
    // Alpha based on distance (fades toward horizon)
    const alpha = 0.04 + t * 0.14;
    ctx.beginPath();
    ctx.moveTo(trackX(yBot, 'left'),  yBot);
    ctx.lineTo(trackX(yBot, 'right'), yBot);
    ctx.strokeStyle = `rgba(150,100,255,${alpha})`;
    ctx.lineWidth = Math.max(0.5, t * 3);
    ctx.stroke();
  }

  // Perspective lane dividers — 3 lanes = 2 dividers
  const laneRelPositions = [-0.333, 0, 0.333]; // normalized -0.5 to 0.5 across road
  // Draw lane lines (dashed in perspective)
  const DASH_SPACING = 80;
  for (let li = 0; li < 2; li++) {
    const laneRelX = -0.5 + (li + 1) * (1 / 3); // 0.167 and 0.5
    const numDashes = Math.ceil(GAME_H / DASH_SPACING) + 2;
    for (let di = 0; di < numDashes; di++) {
      let yBot = GAME_H - ((scrollOffset * 0.9 % DASH_SPACING) + di * DASH_SPACING);
      if (yBot < HORIZON_Y + 10) continue;
      if (yBot > GAME_H) continue;
      const t = (yBot - HORIZON_Y) / (GAME_H - HORIZON_Y);
      const roadLeft = trackX(yBot, 'left');
      const w = trackWidth(yBot);
      const dashX = roadLeft + w * (0.5 + laneRelX);
      const dashLen = Math.max(4, t * 30);
      const dashH  = Math.max(1.5, t * 8);
      ctx.fillStyle = `rgba(200,180,255,${0.06 + t * 0.18})`;
      ctx.beginPath();
      ctx.roundRect(dashX - dashLen/2, yBot - dashH/2, dashLen, dashH, 2);
      ctx.fill();
    }
  }

  // Road edges (neon outlines)
  ctx.beginPath();
  ctx.moveTo(TRACK_TOP_X, HORIZON_Y);
  ctx.lineTo(TRACK_BOT_X, GAME_H);
  ctx.strokeStyle = "rgba(255,45,155,0.55)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(TRACK_TOP_X + TRACK_TOP_W, HORIZON_Y);
  ctx.lineTo(TRACK_BOT_X + TRACK_BOT_W, GAME_H);
  ctx.strokeStyle = "rgba(0,245,255,0.55)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.restore();

  // ── Side walls (graffiti) ─────────────────────────────────────────────
  ctx.save();

  // Left wall
  ctx.beginPath();
  ctx.moveTo(0, HORIZON_Y - 10);
  ctx.lineTo(TRACK_BOT_X, GAME_H);
  ctx.lineTo(0, GAME_H);
  ctx.closePath();
  const lwGrad = ctx.createLinearGradient(0, HORIZON_Y, 0, GAME_H);
  lwGrad.addColorStop(0, "#0d0020");
  lwGrad.addColorStop(1, "#1a0033");
  ctx.fillStyle = lwGrad;
  ctx.fill();

  // Right wall
  ctx.beginPath();
  ctx.moveTo(GAME_W, HORIZON_Y - 10);
  ctx.lineTo(TRACK_BOT_X + TRACK_BOT_W, GAME_H);
  ctx.lineTo(GAME_W, GAME_H);
  ctx.closePath();
  const rwGrad = ctx.createLinearGradient(GAME_W, HORIZON_Y, GAME_W, GAME_H);
  rwGrad.addColorStop(0, "#0d0020");
  rwGrad.addColorStop(1, "#1a0033");
  ctx.fillStyle = rwGrad;
  ctx.fill();

  // Graffiti tags on left wall — static art shapes
  drawGraffitiLeft(ctx, scrollOffset);
  drawGraffitiRight(ctx, scrollOffset);

  // Scrolling light poles on both sides
  drawPoles(ctx, scrollOffset);

  ctx.restore();
}

function drawGraffitiLeft(ctx, scroll) {
  const shift = (scroll * 0.4) % 900;
  ctx.save();
  ctx.globalAlpha = 0.55;
  // Repeating graffiti "DASH" letters
  const tags = [
    { x: -800 + shift, y: 320, text: "DASH", color: "#ff2d9b", size: 28 },
    { x: -800 + shift + 200, y: 360, text: "GO", color: "#39ff14", size: 22 },
    { x: -800 + shift + 380, y: 330, text: "STUDY", color: "#00f5ff", size: 18 },
    { x: -800 + shift + 560, y: 350, text: "×", color: "#ffe600", size: 32 },
    { x: -800 + shift + 700, y: 320, text: "GRADEIFY", color: "#ff6b00", size: 14 },
    { x: -800 + shift + 900, y: 345, text: "DASH", color: "#ff2d9b", size: 28 },
    { x: -800 + shift + 1100, y: 360, text: "GO", color: "#39ff14", size: 22 },
    { x: -800 + shift + 1280, y: 330, text: "STUDY", color: "#00f5ff", size: 18 },
  ];
  tags.forEach(({ x, y, text, color, size }) => {
    if (x < -120 || x > 160) return;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.font = `900 ${size}px 'Bebas Neue', sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(text, x, y);
  });
  ctx.restore();
}

function drawGraffitiRight(ctx, scroll) {
  const shift = (scroll * 0.35) % 900;
  ctx.save();
  ctx.globalAlpha = 0.5;
  const tags = [
    { x: GAME_W - 130 + (shift % 900) * 0.15, y: 310, text: "RUN", color: "#ff6b00", size: 30 },
    { x: GAME_W - 110 + ((shift+200) % 900) * 0.12, y: 355, text: "A+", color: "#ffe600", size: 26 },
    { x: GAME_W - 125 + ((shift+430) % 900) * 0.1, y: 330, text: "LEARN", color: "#7c3aed", size: 18 },
  ];
  tags.forEach(({ x, y, text, color, size }) => {
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.font = `900 ${size}px 'Bebas Neue', sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText(text, x, y);
  });
  ctx.restore();
}

function drawPoles(ctx, scroll) {
  const POLE_SPACING = 220;
  const numPoles = 6;
  for (let i = 0; i < numPoles; i++) {
    const base = ((scroll * 1.1) % POLE_SPACING);
    const offset = i * POLE_SPACING - base;
    const t = Math.max(0, Math.min(1, offset / (GAME_H - HORIZON_Y)));
    const yBot = HORIZON_Y + t * (GAME_H - HORIZON_Y);
    if (yBot < HORIZON_Y || yBot > GAME_H + 20) continue;

    const poleH = 80 * t + 20;
    const poleW = 4 * t + 1;

    // Left pole
    const lx = trackX(yBot, 'left') - 12 * t;
    ctx.fillStyle = `rgba(160,100,255,${0.3 + t * 0.4})`;
    ctx.fillRect(lx, yBot - poleH, poleW, poleH);
    // Lamp
    ctx.fillStyle = `rgba(255,230,0,${0.5 + t * 0.4})`;
    ctx.shadowColor = "#ffe600";
    ctx.shadowBlur = 8 * t;
    ctx.beginPath();
    ctx.arc(lx + poleW/2, yBot - poleH, poleW * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Right pole
    const rx = trackX(yBot, 'right') + 12 * t;
    ctx.fillStyle = `rgba(160,100,255,${0.3 + t * 0.4})`;
    ctx.fillRect(rx - poleW, yBot - poleH, poleW, poleH);
    ctx.fillStyle = `rgba(255,230,0,${0.5 + t * 0.4})`;
    ctx.shadowColor = "#ffe600";
    ctx.shadowBlur = 8 * t;
    ctx.beginPath();
    ctx.arc(rx - poleW/2, yBot - poleH, poleW * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function FlashcardDash({ studySet }) {
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const animRef = useRef(null);
  const lastTimeRef = useRef(0);
  const scrollRef = useRef(0);
  const spawnObsRef = useRef(0);
  const spawnCoinRef = useRef(0);
  const spawnCardRef = useRef(0);

  // React state for UI
  const [phase, setPhase] = useState("idle"); // idle | running | paused | question | gameover
  const [playerLane, setPlayerLane] = useState(0);
  const [jumpOffset, setJumpOffset] = useState(0);
  const [isJumping, setIsJumping] = useState(false);
  const [isSliding, setIsSliding] = useState(false);
  const [isHit, setIsHit] = useState(false);
  const [items, setItems] = useState([]);
  const [speed, setSpeed] = useState(START_SPEED);
  const [distance, setDistance] = useState(0);
  const [coins, setCoins] = useState(0);
  const [hearts, setHearts] = useState(START_HEARTS);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [score, setScore] = useState(0);
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [answerStatus, setAnswerStatus] = useState(null);
  const [comboText, setComboText] = useState(null);
  const [shake, setShake] = useState(false);

  // Mutable refs that game loop reads directly
  const phaseRef     = useRef("idle");
  const laneRef      = useRef(0);
  const jumpRef      = useRef(0);
  const slidingRef   = useRef(false);
  const jumpingRef   = useRef(false);
  const speedRef     = useRef(START_SPEED);
  const heartsRef    = useRef(START_HEARTS);
  const itemsRef     = useRef([]);
  const streakRef    = useRef(0);
  const scoreRef     = useRef(0);
  const coinsRef     = useRef(0);
  const distRef      = useRef(0);

  // Sync refs
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { laneRef.current = playerLane; }, [playerLane]);
  useEffect(() => { jumpRef.current = jumpOffset; }, [jumpOffset]);
  useEffect(() => { slidingRef.current = isSliding; }, [isSliding]);
  useEffect(() => { jumpingRef.current = isJumping; }, [isJumping]);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { heartsRef.current = hearts; }, [hearts]);
  useEffect(() => { streakRef.current = streak; }, [streak]);
  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { coinsRef.current = coins; }, [coins]);
  useEffect(() => { distRef.current = distance; }, [distance]);
  useEffect(() => { itemsRef.current = items; }, [items]);

  // ── Canvas loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    function loop(now) {
      animRef.current = requestAnimationFrame(loop);
      const delta = Math.min((now - (lastTimeRef.current || now)) / 16.67, 2.5);
      lastTimeRef.current = now;

      const ph = phaseRef.current;
      if (ph === "running") {
        scrollRef.current += speedRef.current * delta;
      }

      drawEnvironment(ctx, scrollRef.current, now);
    }

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  // ── Game tick (items + collisions) ───────────────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;

    let tickAnim;
    let lastT = performance.now();

    function tick(now) {
      tickAnim = requestAnimationFrame(tick);
      const delta = Math.min((now - lastT) / 16.67, 2.5);
      lastT = now;

      const spd = speedRef.current;

      // Timers
      spawnObsRef.current  += delta;
      spawnCoinRef.current += delta;
      spawnCardRef.current += delta;

      // Increase score & distance
      const dScore = Math.floor(spd * delta);
      scoreRef.current  += dScore;
      distRef.current   += spd * delta;
      setScore(s => s + dScore);
      setDistance(d => d + spd * delta);
      setSpeed(s => Math.min(MAX_SPEED, s + 0.002 * delta));
      speedRef.current = Math.min(MAX_SPEED, speedRef.current + 0.002 * delta);

      setItems(prev => {
        let next = prev.map(it => ({ ...it, y: it.y + spd * delta }));

        // Spawn obstacles
        const obsThresh = Math.max(38, 88 - spd * 4);
        if (spawnObsRef.current > obsThresh) {
          spawnObsRef.current = 0;
          next.push(mkObstacle());
        }

        // Spawn coins
        if (spawnCoinRef.current > 16) {
          spawnCoinRef.current = 0;
          const cl = rndLane();
          next.push(mkCoin(cl, 0));
          if (Math.random() > 0.4) next.push(mkCoin(cl, -55));
          if (Math.random() > 0.65) next.push(mkCoin(cl, -110));
        }

        // Spawn flashcard
        if (spawnCardRef.current > 240) {
          spawnCardRef.current = 0;
          next.push(mkCard());
        }

        const keep = [];
        for (const it of next) {
          // Cull off-screen
          if (it.y > GAME_H + 80) continue;

          // Collision check — items hit player when near player's feet
          const playerY = PLAYER_BASE_Y - jumpRef.current;
          const inLane = it.lane === laneRef.current;
          const itemFeet = it.y + it.h / 2;
          const playerFeet = playerY;
          const hitZone = inLane && itemFeet > playerFeet - 55 && itemFeet < playerFeet + 30;

          if (hitZone) {
            if (it.kind === "coin") {
              coinsRef.current += 1;
              scoreRef.current += 20;
              setCoins(c => c + 1);
              setScore(s => s + 20);
              continue; // remove coin
            }

            if (it.kind === "card") {
              // Pause for question
              setActiveQuestion(it.question);
              setPhase("question");
              phaseRef.current = "question";
              continue;
            }

            if (it.kind === "obstacle") {
              // Can we dodge?
              if (it.subtype === "cone" && jumpRef.current > 50) { keep.push(it); continue; }
              if (it.subtype === "locker" && slidingRef.current) { keep.push(it); continue; }

              // HIT
              const newH = heartsRef.current - 1;
              heartsRef.current = Math.max(0, newH);
              setHearts(Math.max(0, newH));
              setIsHit(true);
              setShake(true);
              setTimeout(() => setIsHit(false), 400);
              setTimeout(() => setShake(false), 420);
              setStreak(0);
              streakRef.current = 0;

              if (newH <= 0) {
                setPhase("gameover");
                phaseRef.current = "gameover";
              }
              continue; // remove the obstacle
            }
          }

          keep.push(it);
        }

        itemsRef.current = keep;
        return keep;
      });
    }

    tickAnim = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(tickAnim);
  }, [phase]);

  // ── Controls ──────────────────────────────────────────────────────────────
  const moveLeft  = useCallback(() => { if (phaseRef.current !== "running") return; setPlayerLane(l => Math.max(-1, l - 1)); laneRef.current = Math.max(-1, laneRef.current - 1); }, []);
  const moveRight = useCallback(() => { if (phaseRef.current !== "running") return; setPlayerLane(l => Math.min(1, l + 1)); laneRef.current = Math.min(1, laneRef.current + 1); }, []);

  const doJump = useCallback(() => {
    if (phaseRef.current !== "running" || jumpingRef.current || slidingRef.current) return;
    jumpingRef.current = true;
    setIsJumping(true);
    let start = null;
    const dur = 640;
    const maxH = 130;
    function frame(ts) {
      if (!start) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      const h = Math.sin(p * Math.PI) * maxH;
      jumpRef.current = h;
      setJumpOffset(h);
      if (p < 1) requestAnimationFrame(frame);
      else { jumpRef.current = 0; setJumpOffset(0); jumpingRef.current = false; setIsJumping(false); }
    }
    requestAnimationFrame(frame);
  }, []);

  const doSlide = useCallback(() => {
    if (phaseRef.current !== "running" || slidingRef.current || jumpingRef.current) return;
    slidingRef.current = true;
    setIsSliding(true);
    setTimeout(() => { slidingRef.current = false; setIsSliding(false); }, 540);
  }, []);

  // Keyboard
  useEffect(() => {
    function onKey(e) {
      if (e.key === "ArrowLeft"  || e.key.toLowerCase() === "a") moveLeft();
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") moveRight();
      if (e.key === "ArrowUp"    || e.key === " ") { e.preventDefault(); doJump(); }
      if (e.key === "ArrowDown"  || e.key.toLowerCase() === "s") doSlide();
      if (e.key.toLowerCase() === "p") {
        setPhase(p => {
          const next = p === "running" ? "paused" : p === "paused" ? "running" : p;
          phaseRef.current = next;
          return next;
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moveLeft, moveRight, doJump, doSlide]);

  // ── Game start / reset ────────────────────────────────────────────────────
  function startGame() {
    nextId = 1;
    scrollRef.current = 0;
    spawnObsRef.current = 0;
    spawnCoinRef.current = 0;
    spawnCardRef.current = 0;
    laneRef.current = 0;
    jumpRef.current = 0;
    slidingRef.current = false;
    jumpingRef.current = false;
    speedRef.current = START_SPEED;
    heartsRef.current = START_HEARTS;
    streakRef.current = 0;
    scoreRef.current = 0;
    coinsRef.current = 0;
    distRef.current = 0;
    itemsRef.current = [];

    setPlayerLane(0);
    setJumpOffset(0);
    setIsJumping(false);
    setIsSliding(false);
    setIsHit(false);
    setItems([]);
    setSpeed(START_SPEED);
    setDistance(0);
    setCoins(0);
    setHearts(START_HEARTS);
    setStreak(0);
    setScore(0);
    setActiveQuestion(null);
    setAnswerStatus(null);
    setComboText(null);
    setShake(false);
    setPhase("running");
    phaseRef.current = "running";
    lastTimeRef.current = performance.now();
  }

  // ── Question answering ────────────────────────────────────────────────────
  function answerQuestion(idx) {
    if (!activeQuestion || answerStatus) return;
    const correct = idx === activeQuestion.correct;
    if (correct) {
      const newStreak = streakRef.current + 1;
      const bonus = 150 + newStreak * 30;
      streakRef.current = newStreak;
      scoreRef.current += bonus;
      coinsRef.current += 8 + Math.min(newStreak, 10);
      setStreak(newStreak);
      setBestStreak(b => Math.max(b, newStreak));
      setScore(s => s + bonus);
      setCoins(c => c + 8 + Math.min(newStreak, 10));
      setAnswerStatus("correct");
      if (newStreak >= 3) setComboText(`${newStreak}× COMBO! 🔥`);
    } else {
      streakRef.current = 0;
      heartsRef.current = Math.max(0, heartsRef.current - 1);
      setStreak(0);
      setHearts(h => {
        const nh = Math.max(0, h - 1);
        if (nh <= 0) {
          setTimeout(() => {
            setAnswerStatus(null);
            setActiveQuestion(null);
            setPhase("gameover");
            phaseRef.current = "gameover";
          }, 800);
        }
        return nh;
      });
      setAnswerStatus("wrong");
    }
  }

  function closeQuestion() {
    setActiveQuestion(null);
    setAnswerStatus(null);
    setComboText(null);
    setPhase("running");
    phaseRef.current = "running";
    lastTimeRef.current = performance.now();
  }

  function continueQuestions() {
    setAnswerStatus(null);
    setActiveQuestion(rndQuestion());
  }

  // ── Computed ──────────────────────────────────────────────────────────────
  const playerX = laneX(playerLane);
  const playerY = PLAYER_BASE_Y - jumpOffset;
  const distM = Math.floor(distance / 12);
  const heartsDisplay = "❤️".repeat(Math.max(0, hearts)) || "—";

  // Scale canvas coords to CSS %
  const toCSSX = (cx) => `${(cx / GAME_W) * 100}%`;
  const toCSSY = (cy) => `${(cy / GAME_H) * 100}%`;

  return (
    <div className="flashdash-page">
      <div className="flashdash-header">
        <div>
          <p className="flashdash-kicker">Gradeify Games</p>
          <h1>Flashcard Dash</h1>
          <p>Sprint the neon track, dodge obstacles, grab coins, answer flashcards to keep your streak alive.</p>
        </div>
        <div className="flashdash-header-actions">
          <button className="flashdash-primary-btn" onClick={startGame}>
            {phase === "gameover" || phase === "idle" ? "Start Run" : "Restart"}
          </button>
          <button className="flashdash-secondary-btn" onClick={() => {
            if (phase === "running") { setPhase("paused"); phaseRef.current = "paused"; }
            else if (phase === "paused") { setPhase("running"); phaseRef.current = "running"; lastTimeRef.current = performance.now(); }
          }} disabled={phase === "idle" || phase === "gameover" || phase === "question"}>
            {phase === "running" ? "Pause" : "Resume"}
          </button>
        </div>
      </div>

      <div className="flashdash-shell">
        {/* HUD stats */}
        <div className="flashdash-stats">
          <div><span>Score</span><strong>{score.toLocaleString()}</strong></div>
          <div><span>Distance</span><strong>{distM}m</strong></div>
          <div><span>Coins</span><strong>{coins}</strong></div>
          <div><span>Hearts</span><strong style={{ fontSize: "1rem" }}>{heartsDisplay}</strong></div>
          <div><span>Streak</span><strong>{streak}🔥</strong></div>
          <div><span>Best</span><strong>{bestStreak}</strong></div>
        </div>

        {/* Game viewport */}
        <div className={`flashdash-game${shake ? " shake" : ""}`} ref={gameRef}>
          {/* Canvas — draws track / sky / environment */}
          <canvas
            ref={canvasRef}
            className="flashdash-canvas"
            width={GAME_W}
            height={GAME_H}
          />

          {/* Overlay layer — player + items as DOM elements */}
          <div className="flashdash-overlay-layer">
            {/* Items */}
            {items.map(it => {
              const ix = toCSSX(laneX(it.lane));
              const iy = toCSSY(it.y);

              if (it.kind === "coin") return (
                <div key={it.id} className="dash-item dash-coin" style={{ left: ix, top: iy }}>$</div>
              );

              if (it.kind === "card") return (
                <div key={it.id} className="dash-item dash-flashcard" style={{ left: ix, top: iy }}>
                  <span className="card-q">?</span>
                  <span className="card-label">Flashcard</span>
                </div>
              );

              // Obstacles
              return (
                <div key={it.id} className={`dash-item dash-obstacle ${it.subtype}`} style={{ left: ix, top: iy }}>
                  {it.subtype === "cone" && (
                    <>
                      <div className="cone-body" />
                      <div className="cone-base" />
                    </>
                  )}
                  {it.subtype === "locker" && (
                    <>
                      <div className="locker-door" />
                      <div className="locker-handle" />
                      <div className="locker-vent one" />
                      <div className="locker-vent two" />
                    </>
                  )}
                  {it.subtype === "backpack" && (
                    <>
                      <div className="bag-strap left" />
                      <div className="bag-strap right" />
                      <div className="bag-zipper" />
                      <div className="bag-pocket" />
                    </>
                  )}
                </div>
              );
            })}

            {/* Combo text */}
            {comboText && (
              <div key={comboText + streak} className="combo-notice">{comboText}</div>
            )}

            {/* Player */}
            {(phase === "running" || phase === "paused" || phase === "question") && (
              <div
                className={`flashdash-player${isJumping ? " jumping" : ""}${isSliding ? " sliding" : ""}${isHit ? " hit" : ""}`}
                style={{ left: toCSSX(playerX), top: toCSSY(playerY) }}
              >
                <div className="pl-shadow" />
                <div className="pl-shoe left" />
                <div className="pl-shoe right" />
                <div className="pl-leg left" />
                <div className="pl-leg right" />
                <div className="pl-torso" />
                <div className="pl-arm left" />
                <div className="pl-arm right" />
                <div className="pl-head" />
                <div className="pl-pack" />
              </div>
            )}
          </div>

          {/* Speed lines (CSS) when running fast */}
          {phase === "running" && (
            <div className={`flashdash-speed-lines${speed > 7 ? " active" : ""}`} />
          )}

          {/* ── Overlays ── */}

          {/* Idle start screen */}
          {phase === "idle" && (
            <div className="flashdash-overlay">
              <div className="flashdash-start-card">
                <p className="flashdash-kicker">Ready to dash?</p>
                <h2>Flashcard Dash</h2>
                <p>Dodge cones by <strong style={{color:"#ffe600"}}>jumping</strong>, slide under <strong style={{color:"#ff2d9b"}}>lockers</strong>, grab <strong style={{color:"#00f5ff"}}>flashcards</strong> for bonus score.</p>
                <div className="key-hints">
                  <div className="key-hint"><kbd>← →</kbd><span>Change lane</span></div>
                  <div className="key-hint"><kbd>↑ / Space</kbd><span>Jump</span></div>
                  <div className="key-hint"><kbd>↓ / S</kbd><span>Slide</span></div>
                  <div className="key-hint"><kbd>P</kbd><span>Pause</span></div>
                </div>
                <button onClick={startGame}>Start Flashcard Dash</button>
              </div>
            </div>
          )}

          {/* Paused */}
          {phase === "paused" && (
            <div className="flashdash-overlay">
              <div className="flashdash-start-card">
                <p className="flashdash-kicker">Paused</p>
                <h2>Game Paused</h2>
                <p>Press <strong style={{color:"#ffe600"}}>P</strong> or hit Resume to keep running.</p>
                <button onClick={() => { setPhase("running"); phaseRef.current = "running"; lastTimeRef.current = performance.now(); }}>Resume</button>
              </div>
            </div>
          )}

          {/* Game over */}
          {phase === "gameover" && (
            <div className="flashdash-overlay">
              <div className="flashdash-start-card game-over">
                <p className="flashdash-kicker">Run finished</p>
                <h2>Game Over</h2>
                <div className="flashdash-final-grid">
                  <div><span>Score</span><strong>{score.toLocaleString()}</strong></div>
                  <div><span>Distance</span><strong>{distM}m</strong></div>
                  <div><span>Coins</span><strong>{coins}</strong></div>
                  <div><span>Best Streak</span><strong>{bestStreak}🔥</strong></div>
                </div>
                <button onClick={startGame}>Run Again</button>
              </div>
            </div>
          )}

          {/* Question modal */}
          {phase === "question" && activeQuestion && (
            <div className="flashdash-question-backdrop">
              <div className="flashdash-question-modal">
                <button className="question-close" onClick={closeQuestion}>×</button>
                <p className="flashdash-kicker">Flashcard Checkpoint</p>
                <h2>{activeQuestion.q}</h2>
                <div className="question-options">
                  {activeQuestion.opts.map((opt, idx) => {
                    let cls = "question-option";
                    if (answerStatus) {
                      if (idx === activeQuestion.correct) cls += " correct";
                      else if (answerStatus === "wrong") cls += " muted";
                    }
                    return (
                      <button key={opt} className={cls} onClick={() => answerQuestion(idx)} disabled={!!answerStatus}>
                        <span>{String.fromCharCode(65 + idx)}</span>
                        {opt}
                      </button>
                    );
                  })}
                </div>
                {answerStatus === "correct" && (
                  <div className="answer-feedback correct">Correct! Streak: {streak} 🔥 +{150 + streak * 30} points</div>
                )}
                {answerStatus === "wrong" && (
                  <div className="answer-feedback wrong">
                    Not quite. Correct answer: <strong>{activeQuestion.opts[activeQuestion.correct]}</strong>
                  </div>
                )}
                <div className="question-actions">
                  <button className="flashdash-secondary-btn" onClick={closeQuestion}>Back to Run</button>
                  <button className="flashdash-primary-btn" onClick={continueQuestions} disabled={!answerStatus}>Next Question</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* On-screen controls */}
        <div className="flashdash-controls">
          <button onClick={moveLeft}>← Left</button>
          <button onClick={doJump}>↑ Jump</button>
          <button onClick={doSlide}>↓ Slide</button>
          <button onClick={moveRight}>Right →</button>
        </div>

        {/* Help strip */}
        <div className="flashdash-help">
          <div><strong>Move:</strong> Arrow keys / A D</div>
          <div><strong>Jump:</strong> Up / Space — clears cones</div>
          <div><strong>Slide:</strong> Down / S — ducks lockers</div>
          <div><strong>Pause:</strong> P</div>
        </div>
      </div>
    </div>
  );
}