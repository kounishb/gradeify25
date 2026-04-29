import { useEffect, useState } from "react";
import "./RubiksCube.css";

const moves = ["U", "D", "L", "R", "F", "B"];

export default function RubiksCube() {
  const [history, setHistory] = useState([]);
  const [rotation, setRotation] = useState({ x: -25, y: 35 });

  function doMove(move) {
    setHistory((prev) => [move, ...prev].slice(0, 12));
  }

  function resetCube() {
    setHistory([]);
    setRotation({ x: -25, y: 35 });
  }

  function scrambleCube() {
    const randomMoves = Array.from({ length: 15 }, () => {
      return moves[Math.floor(Math.random() * moves.length)];
    });
    setHistory(randomMoves);
  }

  useEffect(() => {
    function handleKeyDown(e) {
      const key = e.key.toUpperCase();

      if (moves.includes(key)) {
        doMove(key);
      }

      if (key === "ARROWLEFT") {
        setRotation((r) => ({ ...r, y: r.y - 10 }));
      }

      if (key === "ARROWRIGHT") {
        setRotation((r) => ({ ...r, y: r.y + 10 }));
      }

      if (key === "ARROWUP") {
        setRotation((r) => ({ ...r, x: r.x - 10 }));
      }

      if (key === "ARROWDOWN") {
        setRotation((r) => ({ ...r, x: r.x + 10 }));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="cube-page">
      <div className="cube-header">
        <div>
          <p className="cube-kicker">Gradeify Games</p>
          <h1>Virtual Rubik’s Cube</h1>
          <p>
            Use your keyboard to rotate the cube and practice moves. This is the
            starter version, so the cube is visual first.
          </p>
        </div>

        <div className="cube-actions">
          <button onClick={scrambleCube}>Scramble</button>
          <button onClick={resetCube} className="secondary">
            Reset
          </button>
        </div>
      </div>

      <div className="cube-layout">
        <div className="cube-stage">
          <div
            className="rubiks-cube"
            style={{
              transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
            }}
          >
            <Face className="front" color="green" />
            <Face className="back" color="blue" />
            <Face className="right" color="red" />
            <Face className="left" color="orange" />
            <Face className="top" color="white" />
            <Face className="bottom" color="yellow" />
          </div>
        </div>

        <div className="cube-panel">
          <h2>Controls</h2>

          <div className="control-grid">
            {moves.map((move) => (
              <button key={move} onClick={() => doMove(move)}>
                {move}
              </button>
            ))}
          </div>

          <p className="hint">
            Keys: U, D, L, R, F, B <br />
            Arrow keys: rotate cube view
          </p>

          <h3>Recent moves</h3>
          <div className="move-history">
            {history.length ? history.join("  ") : "No moves yet"}
          </div>
        </div>
      </div>
    </div>
  );
}

function Face({ className, color }) {
  return (
    <div className={`cube-face ${className}`}>
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className={`sticker ${color}`} />
      ))}
    </div>
  );
}