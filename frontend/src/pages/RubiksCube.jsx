import { useEffect, useMemo, useState } from "react";
import "./RubiksCube.css";

const FACE_COLORS = {
  U: "white",
  D: "yellow",
  F: "green",
  B: "blue",
  R: "red",
  L: "orange",
};

const NORMAL_TO_FACE = {
  "0,1,0": "U",
  "0,-1,0": "D",
  "0,0,1": "F",
  "0,0,-1": "B",
  "1,0,0": "R",
  "-1,0,0": "L",
};

const FACE_TO_NORMAL = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
  R: [1, 0, 0],
  L: [-1, 0, 0],
};

const MOVES = {
  U: { axis: "y", layer: 1, dir: 1 },
  D: { axis: "y", layer: -1, dir: -1 },
  R: { axis: "x", layer: 1, dir: -1 },
  L: { axis: "x", layer: -1, dir: 1 },
  F: { axis: "z", layer: 1, dir: -1 },
  B: { axis: "z", layer: -1, dir: 1 },
};

function normalKey(n) {
  return `${n[0]},${n[1]},${n[2]}`;
}

function rotateVector([x, y, z], axis, dir) {
  if (axis === "x") return dir === 1 ? [x, -z, y] : [x, z, -y];
  if (axis === "y") return dir === 1 ? [z, y, -x] : [-z, y, x];
  if (axis === "z") return dir === 1 ? [-y, x, z] : [y, -x, z];
  return [x, y, z];
}

function createSolvedCube() {
  const cubies = [];

  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        if (x === 0 && y === 0 && z === 0) continue;

        const stickers = {};

        if (y === 1) stickers["0,1,0"] = FACE_COLORS.U;
        if (y === -1) stickers["0,-1,0"] = FACE_COLORS.D;
        if (z === 1) stickers["0,0,1"] = FACE_COLORS.F;
        if (z === -1) stickers["0,0,-1"] = FACE_COLORS.B;
        if (x === 1) stickers["1,0,0"] = FACE_COLORS.R;
        if (x === -1) stickers["-1,0,0"] = FACE_COLORS.L;

        cubies.push({
          id: `${x}-${y}-${z}`,
          x,
          y,
          z,
          stickers,
        });
      }
    }
  }

  return cubies;
}

function rotateLayer(cubies, move, inverse = false) {
  const config = MOVES[move];
  if (!config) return cubies;

  const dir = inverse ? -config.dir : config.dir;

  return cubies.map((cubie) => {
    if (cubie[config.axis] !== config.layer) return cubie;

    const [newX, newY, newZ] = rotateVector(
      [cubie.x, cubie.y, cubie.z],
      config.axis,
      dir
    );

    const newStickers = {};

    Object.entries(cubie.stickers).forEach(([key, color]) => {
      const oldNormal = key.split(",").map(Number);
      const newNormal = rotateVector(oldNormal, config.axis, dir);
      newStickers[normalKey(newNormal)] = color;
    });

    return {
      ...cubie,
      x: newX,
      y: newY,
      z: newZ,
      stickers: newStickers,
    };
  });
}

export default function RubiksCube() {
  const [cubies, setCubies] = useState(() => createSolvedCube());
  const [history, setHistory] = useState([]);
  const [rotation, setRotation] = useState({ x: -25, y: 35 });

  const sortedCubies = useMemo(() => {
    return [...cubies].sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
  }, [cubies]);

  function doMove(move, inverse = false) {
    setCubies((prev) => rotateLayer(prev, move, inverse));
    setHistory((prev) =>
      [`${move}${inverse ? "'" : ""}`, ...prev].slice(0, 20)
    );
  }

  function resetCube() {
    setCubies(createSolvedCube());
    setHistory([]);
    setRotation({ x: -25, y: 35 });
  }

  function scrambleCube() {
    const keys = Object.keys(MOVES);
    const randomMoves = [];

    let currentCube = cubies;

    for (let i = 0; i < 20; i++) {
      const move = keys[Math.floor(Math.random() * keys.length)];
      const inverse = Math.random() > 0.5;
      currentCube = rotateLayer(currentCube, move, inverse);
      randomMoves.push(`${move}${inverse ? "'" : ""}`);
    }

    setCubies(currentCube);
    setHistory(randomMoves.reverse());
  }

  useEffect(() => {
    function handleKeyDown(e) {
      const key = e.key.toUpperCase();

      const isCubeKey =
        MOVES[key] ||
        key === "ARROWLEFT" ||
        key === "ARROWRIGHT" ||
        key === "ARROWUP" ||
        key === "ARROWDOWN";

      if (isCubeKey) e.preventDefault();

      if (MOVES[key]) {
        doMove(key, e.shiftKey);
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

    window.addEventListener("keydown", handleKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cubies]);

  return (
    <div className="cube-page">
      <div className="cube-header">
        <div>
          <p className="cube-kicker">Gradeify Games</p>
          <h1>Virtual Rubik’s Cube</h1>
          <p>
            Press U, D, L, R, F, or B to turn a face. Hold Shift while pressing
            a letter to turn the opposite direction. Use arrow keys to rotate
            the whole cube view.
          </p>
        </div>

        <div className="cube-actions">
          <button onClick={scrambleCube} type="button">
            Scramble
          </button>
          <button onClick={resetCube} className="secondary" type="button">
            Reset
          </button>
        </div>
      </div>

      <div className="cube-layout">
        <div className="cube-stage">
          <div
            className="cube-world"
            style={{
              transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
            }}
          >
            {sortedCubies.map((cubie) => (
              <Cubie key={cubie.id} cubie={cubie} />
            ))}
          </div>
        </div>

        <div className="cube-panel">
          <h2>Controls</h2>

          <div className="control-grid">
            {Object.keys(MOVES).map((move) => (
              <button key={move} onClick={() => doMove(move)} type="button">
                {move}
              </button>
            ))}
          </div>

          <div className="control-grid inverse">
            {Object.keys(MOVES).map((move) => (
              <button
                key={`${move}-prime`}
                onClick={() => doMove(move, true)}
                type="button"
              >
                {move}'
              </button>
            ))}
          </div>

          <p className="hint">
            Normal moves: U D L R F B
            <br />
            Reverse moves: Shift + key
            <br />
            Rotate view: arrow keys
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

function Cubie({ cubie }) {
  return (
    <div
      className="cubie"
      style={{
        transform: `translate3d(${cubie.x * 72}px, ${-cubie.y * 72}px, ${
          cubie.z * 72
        }px)`,
      }}
    >
      {Object.entries(cubie.stickers).map(([normal, color]) => {
        const face = NORMAL_TO_FACE[normal];
        return (
          <div
            key={normal}
            className={`cubie-sticker face-${face} sticker-${color}`}
          />
        );
      })}
    </div>
  );
}