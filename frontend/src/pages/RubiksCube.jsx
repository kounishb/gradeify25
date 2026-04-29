import { useEffect, useRef, useState } from "react";
import "./RubiksCube.css";

export default function RubiksCube() {
  const cubeRef = useRef(null);
  const [scrambleText, setScrambleText] = useState("");

  function generateScramble() {
    const moves = ["R", "L", "U", "D", "F", "B"];
    const modifiers = ["", "'", "2"];

    let scramble = "";
    let lastMove = "";

    for (let i = 0; i < 20; i++) {
      let move = moves[Math.floor(Math.random() * moves.length)];

      while (move === lastMove) {
        move = moves[Math.floor(Math.random() * moves.length)];
      }

      const mod = modifiers[Math.floor(Math.random() * modifiers.length)];
      scramble += move + mod + " ";
      lastMove = move;
    }

    return scramble.trim();
  }

  function loadCube(move = "") {
    if (window.AnimCube3 && cubeRef.current) {
      cubeRef.current.innerHTML = "";

      window.AnimCube3(
        "id=gradeifyCube" +
          "&bgcolor=f8fafc" +
          "&butbgcolor=2563eb" +
          "&colorscheme=wyorgb" +
          "&buttonheight=25" +
          "&movetext=1" +
          "&snap=1" +
          "&edit=1" +
          `&move=${encodeURIComponent(move)}`
      );
    }
  }

  useEffect(() => {
    const existing = document.querySelector("script[data-animcube]");

    window.loadGradeifyCube = loadCube;

    if (existing) {
      loadCube();
      return;
    }

    const script = document.createElement("script");
    script.src = `${import.meta.env.BASE_URL}AnimCube3.js`;
    script.async = true;
    script.dataset.animcube = "true";
    script.onload = () => loadCube();
    script.onerror = () => {
      console.error("Failed to load AnimCube3.js from:", script.src);
    };

    document.body.appendChild(script);
  }, []);

  function handleScramble() {
    const scramble = generateScramble();
    setScrambleText(scramble);
    loadCube(scramble);
  }

  function handleReset() {
    setScrambleText("");
    loadCube("");
  }

  return (
    <div className="cube-page">
      <div className="cube-header">
        <div>
          <p className="cube-kicker">Gradeify Games</p>
          <h1>Virtual Rubik’s Cube</h1>
          <p>
            Drag a layer with your finger or mouse to turn it. Drag outside the
            cube to rotate the whole cube.
          </p>
        </div>

        <div className="cube-actions">
          <button type="button" onClick={handleScramble}>
            Scramble
          </button>

          <button type="button" className="secondary" onClick={handleReset}>
            Reset
          </button>
        </div>
      </div>

      {scrambleText && (
        <div className="scramble-box">
          <strong>Scramble:</strong> {scrambleText}
        </div>
      )}

      <div className="cube-card">
        <div id="gradeifyCube" ref={cubeRef} className="animcube-box" />
      </div>
    </div>
  );
}