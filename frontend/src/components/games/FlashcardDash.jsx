import React, { useEffect, useMemo, useRef, useState } from "react";
import "../../styles/FlashcardDash.css";

const LANES = [-1, 0, 1];
const GAME_WIDTH = 900;
const GAME_HEIGHT = 560;

const PLAYER_Y = 420;
const PLAYER_WIDTH = 56;
const PLAYER_HEIGHT = 82;

const START_SPEED = 4.2;
const MAX_SPEED = 10.5;

const START_HEARTS = 3;

const QUESTIONS = [
  {
    question: "What is the main purpose of photosynthesis?",
    answers: [
      "To create glucose using sunlight",
      "To break down rocks",
      "To make oxygen from glucose",
      "To digest proteins",
    ],
    correct: 0,
  },
  {
    question: "What does slope represent in y = mx + b?",
    answers: ["The x-intercept", "The rate of change", "The y-intercept", "The maximum value"],
    correct: 1,
  },
  {
    question: "Which organelle is known as the powerhouse of the cell?",
    answers: ["Nucleus", "Ribosome", "Mitochondria", "Golgi apparatus"],
    correct: 2,
  },
  {
    question: "What is opportunity cost?",
    answers: [
      "The total money spent",
      "The value of the next best alternative",
      "A fixed expense",
      "Profit after taxes",
    ],
    correct: 1,
  },
  {
    question: "What is the derivative of x²?",
    answers: ["x", "2x", "x³", "2"],
    correct: 1,
  },
  {
    question: "Which molecule carries genetic information?",
    answers: ["ATP", "DNA", "Glucose", "Water"],
    correct: 1,
  },
  {
    question: "What does inflation mean?",
    answers: [
      "Prices generally rise over time",
      "Prices always fall",
      "Interest rates are zero",
      "The stock market closes",
    ],
    correct: 0,
  },
  {
    question: "In a paragraph, what does a topic sentence usually do?",
    answers: [
      "Ends the essay",
      "Introduces the main idea",
      "Lists citations only",
      "Creates the bibliography",
    ],
    correct: 1,
  },
];

function laneToX(lane) {
  const center = GAME_WIDTH / 2;
  const gap = 190;
  return center + lane * gap;
}

function randomLane() {
  return LANES[Math.floor(Math.random() * LANES.length)];
}

function getRandomQuestion() {
  return QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
}

function makeObstacle(id, speedBoost = 0) {
  const types = ["cone", "locker", "backpack"];
  return {
    id,
    type: "obstacle",
    obstacleType: types[Math.floor(Math.random() * types.length)],
    lane: randomLane(),
    y: -90,
    width: 70,
    height: 72,
    speedBoost,
    passed: false,
  };
}

function makeCoin(id) {
  return {
    id,
    type: "coin",
    lane: randomLane(),
    y: -60,
    width: 38,
    height: 38,
  };
}

function makeFlashcard(id) {
  return {
    id,
    type: "flashcard",
    lane: randomLane(),
    y: -70,
    width: 62,
    height: 48,
    question: getRandomQuestion(),
  };
}

export default function FlashcardDash() {
  const gameRef = useRef(null);
  const animationRef = useRef(null);
  const keysRef = useRef({});
  const lastTimeRef = useRef(0);
  const spawnTimerRef = useRef(0);
  const coinTimerRef = useRef(0);
  const flashcardTimerRef = useRef(0);
  const itemIdRef = useRef(1);

  const [running, setRunning] = useState(false);
  const [pausedForQuestion, setPausedForQuestion] = useState(false);
  const [gameOver, setGameOver] = useState(false);

  const [playerLane, setPlayerLane] = useState(0);
  const [isJumping, setIsJumping] = useState(false);
  const [isSliding, setIsSliding] = useState(false);
  const [jumpOffset, setJumpOffset] = useState(0);

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

  const playerX = useMemo(() => laneToX(playerLane), [playerLane]);

  function resetGame() {
    setRunning(true);
    setPausedForQuestion(false);
    setGameOver(false);
    setPlayerLane(0);
    setIsJumping(false);
    setIsSliding(false);
    setJumpOffset(0);
    setItems([]);
    setSpeed(START_SPEED);
    setDistance(0);
    setCoins(0);
    setHearts(START_HEARTS);
    setStreak(0);
    setBestStreak(0);
    setScore(0);
    setActiveQuestion(null);
    setAnswerStatus(null);

    keysRef.current = {};
    lastTimeRef.current = performance.now();
    spawnTimerRef.current = 0;
    coinTimerRef.current = 0;
    flashcardTimerRef.current = 0;
    itemIdRef.current = 1;
  }

  function startGame() {
    resetGame();
  }

  function stopGame() {
    setRunning(false);
    setGameOver(true);
  }

  function moveLeft() {
    if (!running || pausedForQuestion || gameOver) return;
    setPlayerLane((lane) => Math.max(-1, lane - 1));
  }

  function moveRight() {
    if (!running || pausedForQuestion || gameOver) return;
    setPlayerLane((lane) => Math.min(1, lane + 1));
  }

  function jump() {
    if (!running || pausedForQuestion || gameOver || isJumping || isSliding) return;

    setIsJumping(true);

    let start = null;
    const duration = 620;
    const maxHeight = 116;

    function animateJump(timestamp) {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const height = Math.sin(progress * Math.PI) * maxHeight;
      setJumpOffset(height);

      if (progress < 1) {
        requestAnimationFrame(animateJump);
      } else {
        setJumpOffset(0);
        setIsJumping(false);
      }
    }

    requestAnimationFrame(animateJump);
  }

  function slide() {
    if (!running || pausedForQuestion || gameOver || isSliding || isJumping) return;

    setIsSliding(true);
    setTimeout(() => {
      setIsSliding(false);
    }, 520);
  }

  function checkCollision(item, currentPlayerLane, currentJumpOffset, currentSliding) {
    if (item.lane !== currentPlayerLane) return false;

    const playerTop = PLAYER_Y - currentJumpOffset;
    const playerBottom = playerTop + (currentSliding ? PLAYER_HEIGHT * 0.55 : PLAYER_HEIGHT);

    const itemTop = item.y;
    const itemBottom = item.y + item.height;

    const verticalOverlap = playerBottom > itemTop && playerTop < itemBottom;

    if (!verticalOverlap) return false;

    if (item.type === "obstacle") {
      if (item.obstacleType === "cone" && currentJumpOffset > 55) return false;
      if (item.obstacleType === "locker" && currentSliding) return false;
      return true;
    }

    return true;
  }

  function handleQuestionAnswer(index) {
    if (!activeQuestion || answerStatus) return;

    const correct = index === activeQuestion.correct;

    if (correct) {
      const newStreak = streak + 1;
      const bonus = 150 + newStreak * 25;

      setAnswerStatus("correct");
      setStreak(newStreak);
      setBestStreak((prev) => Math.max(prev, newStreak));
      setCoins((prev) => prev + 8 + Math.min(newStreak, 8));
      setScore((prev) => prev + bonus);
    } else {
      setAnswerStatus("wrong");
      setStreak(0);
      setHearts((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          setTimeout(() => {
            setPausedForQuestion(false);
            setRunning(false);
            setGameOver(true);
          }, 650);
        }
        return Math.max(0, next);
      });
    }
  }

  function continueAfterQuestion() {
    setAnswerStatus(null);

    const nextQuestion = getRandomQuestion();
    setActiveQuestion(nextQuestion);
  }

  function closeQuestion() {
    setActiveQuestion(null);
    setAnswerStatus(null);
    setPausedForQuestion(false);

    if (!gameOver) {
      setRunning(true);
      lastTimeRef.current = performance.now();
    }
  }

  useEffect(() => {
    function onKeyDown(e) {
      keysRef.current[e.key] = true;

      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") moveLeft();
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") moveRight();
      if (e.key === "ArrowUp" || e.key === " ") jump();
      if (e.key === "ArrowDown" || e.key.toLowerCase() === "s") slide();

      if (e.key.toLowerCase() === "p") {
        if (gameOver || pausedForQuestion) return;
        setRunning((prev) => !prev);
        lastTimeRef.current = performance.now();
      }
    }

    function onKeyUp(e) {
      keysRef.current[e.key] = false;
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [running, pausedForQuestion, gameOver, isJumping, isSliding, activeQuestion, answerStatus, streak]);

  useEffect(() => {
    if (!running || pausedForQuestion || gameOver) return;

    function tick(timestamp) {
      const delta = Math.min((timestamp - lastTimeRef.current) / 16.67, 2);
      lastTimeRef.current = timestamp;

      spawnTimerRef.current += delta;
      coinTimerRef.current += delta;
      flashcardTimerRef.current += delta;

      setDistance((prev) => prev + speed * delta);
      setScore((prev) => prev + Math.floor(speed * delta));
      setSpeed((prev) => Math.min(MAX_SPEED, prev + 0.0019 * delta));

      setItems((prevItems) => {
        let nextItems = prevItems.map((item) => ({
          ...item,
          y: item.y + (speed + (item.speedBoost || 0)) * delta,
        }));

        if (spawnTimerRef.current > Math.max(42, 92 - speed * 4.5)) {
          spawnTimerRef.current = 0;
          nextItems.push(makeObstacle(itemIdRef.current++, speed * 0.05));
        }

        if (coinTimerRef.current > 18) {
          coinTimerRef.current = 0;

          const lane = randomLane();
          const baseId = itemIdRef.current++;

          nextItems.push({
            ...makeCoin(baseId),
            lane,
            y: -50,
          });

          if (Math.random() > 0.45) {
            nextItems.push({
              ...makeCoin(itemIdRef.current++),
              lane,
              y: -105,
            });
          }
        }

        if (flashcardTimerRef.current > 250) {
          flashcardTimerRef.current = 0;
          nextItems.push(makeFlashcard(itemIdRef.current++));
        }

        const remaining = [];

        for (const item of nextItems) {
          const collided = checkCollision(item, playerLane, jumpOffset, isSliding);

          if (collided) {
            if (item.type === "coin") {
              setCoins((prev) => prev + 1);
              setScore((prev) => prev + 20);
              continue;
            }

            if (item.type === "flashcard") {
              setActiveQuestion(item.question);
              setPausedForQuestion(true);
              setRunning(false);
              continue;
            }

            if (item.type === "obstacle") {
              setHearts((prev) => {
                const next = prev - 1;

                if (next <= 0) {
                  setTimeout(() => stopGame(), 50);
                }

                return Math.max(0, next);
              });

              setStreak(0);
              continue;
            }
          }

          if (item.y < GAME_HEIGHT + 120) {
            remaining.push(item);
          }
        }

        return remaining;
      });

      animationRef.current = requestAnimationFrame(tick);
    }

    animationRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [running, pausedForQuestion, gameOver, speed, playerLane, jumpOffset, isSliding]);

  const distanceMeters = Math.floor(distance / 12);

  return (
    <div className="flashdash-page">
      <div className="flashdash-header">
        <div>
          <p className="flashdash-kicker">Gradeify Games</p>
          <h1>Flashcard Dash</h1>
          <p>
            Sprint through the study tunnel, dodge school obstacles, collect coins, and answer
            flashcards to keep your streak alive.
          </p>
        </div>

        <div className="flashdash-header-actions">
          <button className="flashdash-primary-btn" onClick={startGame}>
            {gameOver || !running ? "Start Run" : "Restart"}
          </button>
          <button
            className="flashdash-secondary-btn"
            onClick={() => {
              if (!gameOver && !pausedForQuestion) {
                setRunning((prev) => !prev);
                lastTimeRef.current = performance.now();
              }
            }}
          >
            {running ? "Pause" : "Resume"}
          </button>
        </div>
      </div>

      <div className="flashdash-shell">
        <div className="flashdash-stats">
          <div>
            <span>Score</span>
            <strong>{score}</strong>
          </div>
          <div>
            <span>Distance</span>
            <strong>{distanceMeters}m</strong>
          </div>
          <div>
            <span>Coins</span>
            <strong>{coins}</strong>
          </div>
          <div>
            <span>Hearts</span>
            <strong>{"❤️".repeat(hearts) || "—"}</strong>
          </div>
          <div>
            <span>Streak</span>
            <strong>{streak}🔥</strong>
          </div>
          <div>
            <span>Best</span>
            <strong>{bestStreak}</strong>
          </div>
        </div>

        <div className="flashdash-game" ref={gameRef}>
          <div className="flashdash-skyline">
            <div className="flashdash-building b1" />
            <div className="flashdash-building b2" />
            <div className="flashdash-building b3" />
            <div className="flashdash-building b4" />
            <div className="flashdash-building b5" />
          </div>

          <div className="flashdash-track">
            <div className="flashdash-lane left" />
            <div className="flashdash-lane middle" />
            <div className="flashdash-lane right" />

            <div className={`flashdash-speed-lines ${running ? "active" : ""}`} />

            {items.map((item) => {
              const x = laneToX(item.lane);

              if (item.type === "coin") {
                return (
                  <div
                    key={item.id}
                    className="dash-item dash-coin"
                    style={{
                      left: x,
                      top: item.y,
                    }}
                  >
                    $
                  </div>
                );
              }

              if (item.type === "flashcard") {
                return (
                  <div
                    key={item.id}
                    className="dash-item dash-flashcard"
                    style={{
                      left: x,
                      top: item.y,
                    }}
                  >
                    <span>?</span>
                    <small>card</small>
                  </div>
                );
              }

              return (
                <div
                  key={item.id}
                  className={`dash-item dash-obstacle ${item.obstacleType}`}
                  style={{
                    left: x,
                    top: item.y,
                  }}
                >
                  {item.obstacleType === "cone" && (
                    <>
                      <div className="cone-top" />
                      <div className="cone-base" />
                    </>
                  )}

                  {item.obstacleType === "locker" && (
                    <>
                      <div className="locker-door" />
                      <div className="locker-vent one" />
                      <div className="locker-vent two" />
                    </>
                  )}

                  {item.obstacleType === "backpack" && (
                    <>
                      <div className="bag-pocket" />
                      <div className="bag-strap left" />
                      <div className="bag-strap right" />
                    </>
                  )}
                </div>
              );
            })}

            <div
              className={`flashdash-player ${isJumping ? "jumping" : ""} ${
                isSliding ? "sliding" : ""
              }`}
              style={{
                left: playerX,
                top: PLAYER_Y - jumpOffset,
              }}
            >
              <div className="player-shadow" />
              <div className="player-head">
                <span />
              </div>
              <div className="player-body">
                <div className="player-backpack" />
                <div className="player-arm left" />
                <div className="player-arm right" />
                <div className="player-leg left" />
                <div className="player-leg right" />
              </div>
            </div>
          </div>

          {!running && !pausedForQuestion && !gameOver && (
            <div className="flashdash-overlay">
              <div className="flashdash-start-card">
                <h2>Ready to dash?</h2>
                <p>
                  Use arrow keys or the buttons below. Dodge cones by jumping, slide under lockers,
                  and grab flashcards for bonus points.
                </p>
                <button onClick={startGame}>Start Flashcard Dash</button>
              </div>
            </div>
          )}

          {gameOver && (
            <div className="flashdash-overlay">
              <div className="flashdash-start-card game-over">
                <p className="flashdash-kicker">Run finished</p>
                <h2>Game Over</h2>
                <div className="flashdash-final-grid">
                  <div>
                    <span>Score</span>
                    <strong>{score}</strong>
                  </div>
                  <div>
                    <span>Distance</span>
                    <strong>{distanceMeters}m</strong>
                  </div>
                  <div>
                    <span>Coins</span>
                    <strong>{coins}</strong>
                  </div>
                  <div>
                    <span>Best Streak</span>
                    <strong>{bestStreak}</strong>
                  </div>
                </div>
                <button onClick={startGame}>Run Again</button>
              </div>
            </div>
          )}

          {pausedForQuestion && activeQuestion && (
            <div className="flashdash-question-backdrop">
              <div className="flashdash-question-modal">
                <button className="question-close" onClick={closeQuestion}>
                  ×
                </button>

                <p className="flashdash-kicker">Flashcard Checkpoint</p>
                <h2>{activeQuestion.question}</h2>

                <div className="question-options">
                  {activeQuestion.answers.map((answer, index) => {
                    let className = "question-option";

                    if (answerStatus) {
                      if (index === activeQuestion.correct) className += " correct";
                      else if (answerStatus === "wrong") className += " muted";
                    }

                    return (
                      <button
                        key={answer}
                        className={className}
                        onClick={() => handleQuestionAnswer(index)}
                        disabled={!!answerStatus}
                      >
                        <span>{String.fromCharCode(65 + index)}</span>
                        {answer}
                      </button>
                    );
                  })}
                </div>

                {answerStatus === "correct" && (
                  <div className="answer-feedback correct">
                    Correct! Your streak is now {streak} 🔥
                  </div>
                )}

                {answerStatus === "wrong" && (
                  <div className="answer-feedback wrong">
                    Not quite. The right answer is{" "}
                    <strong>{activeQuestion.answers[activeQuestion.correct]}</strong>.
                  </div>
                )}

                <div className="question-actions">
                  <button className="flashdash-secondary-btn" onClick={closeQuestion}>
                    Back to Run
                  </button>
                  <button
                    className="flashdash-primary-btn"
                    onClick={continueAfterQuestion}
                    disabled={!answerStatus}
                  >
                    Continue Questions
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flashdash-controls">
          <button onClick={moveLeft}>←</button>
          <button onClick={jump}>Jump</button>
          <button onClick={slide}>Slide</button>
          <button onClick={moveRight}>→</button>
        </div>

        <div className="flashdash-help">
          <div>
            <strong>Move:</strong> Arrow keys / A-D
          </div>
          <div>
            <strong>Jump:</strong> Up arrow or Space
          </div>
          <div>
            <strong>Slide:</strong> Down arrow or S
          </div>
          <div>
            <strong>Pause:</strong> P
          </div>
        </div>
      </div>
    </div>
  );
}