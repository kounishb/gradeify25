import { useEffect, useRef, useState } from "react";
import "cubing/twisty";
import "./RubiksCube.css";

const SCRAMBLES = [
  "R U R' U' F R U R' U' F'",
  "L U2 R' D2 R U' R' D2 R2",
  "F R U R' U' F' U R U' R'",
  "R2 D2 B2 U' L2 F2 R2 D B2",
  "U R2 F B R B2 R U2 L B2",
];

export default function RubiksCube() {
  const playerRef = useRef(null);
  const [alg, setAlg] = useState("");
  const [currentScramble, setCurrentScramble] = useState("");

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    player.puzzle = "3x3x3";
    player.background = "none";
    player.controlPanel = "bottom-row";
    player.visualization = "3D";
    player.experimentalStickering = "full";
  }, []);

  function applyAlg(nextAlg) {
    setAlg(nextAlg);
    if (playerRef.current) {
      playerRef.current.alg = nextAlg;
    }
  }

  function scrambleCube() {
    const random = SCRAMBLES[Math.floor(Math.random() * SCRAMBLES.length)];
    setCurrentScramble(random);
    applyAlg(random);
  }

  function resetCube() {
    setCurrentScramble("");
    applyAlg("");
  }

  return (
    <div className="cube-page">
      <div className="cube-header">
        <div>
          <p className="cube-kicker">Gradeify Games</p>
          <h1>Virtual Rubik’s Cube</h1>
          <p>
            Drag the cube with your mouse or touchscreen. Use the controls below
            to play, pause, scramble, or reset.
          </p>
        </div>

        <div className="cube-actions">
          <button type="button" onClick={scrambleCube}>
            Scramble
          </button>
          <button type="button" onClick={resetCube} className="secondary">
            Reset
          </button>
        </div>
      </div>

      <div className="cube-card">
        <twisty-player ref={playerRef} alg={alg}></twisty-player>
      </div>

      <div className="cube-info">
        <h2>Current scramble</h2>
        <p>{currentScramble || "No scramble yet. Click Scramble to start."}</p>
      </div>
    </div>
  );
}