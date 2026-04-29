import { useEffect, useRef, useState } from "react";
import "./RubiksCube.css";

export default function RubiksCube() {
  const cubeRef = useRef(null);
  const cardRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  function generateScramble() {
    const moves = ["R", "L", "U", "D", "F", "B"];
    const modifiers = ["", "'", "2"];
    let scramble = "";
    let lastMove = "";

    for (let i = 0; i < 25; i++) {
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

  function loadCube(move = "", autoPlay = false) {
    if (!window.AnimCube3 || !cubeRef.current) return;

    cubeRef.current.innerHTML = "";

    window.AnimCube3(
      "id=gradeifyCube" +
        "&bgcolor=f8fafc" +
        "&butbgcolor=2563eb" +
        "&colorscheme=wygbor" +

        // 👇 SMOOTH / LESS SENSITIVE SETTINGS
        "&drag=4" +        // requires more finger movement (BIGGEST FIX)
        "&snap=7" +        // stronger snapping (less jitter)
        "&speed=4" +       // slower, smoother turns
        "&doublespeed=8" + // smoother double turns
        "&perspective=800" + // softer 3D feel

        // 👇 GENERAL SETTINGS
        "&edit=1" +
        "&movetext=0" +
        "&buttonheight=25" +

        `&move=${encodeURIComponent(move)}` +
        (autoPlay ? "&initmove=1" : "")
    );
  }

  useEffect(() => {
    const existing = document.querySelector("script[data-animcube]");

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

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  function handleScramble() {
    const scramble = generateScramble();

    // This reloads the cube with a random move sequence and auto-plays it,
    // so the cube visibly scrambles itself instead of only showing text.
    loadCube(scramble, true);
  }

  function handleReset() {
    loadCube("");
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await cardRef.current?.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error("Fullscreen failed:", err);
    }
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

          <button type="button" className="secondary" onClick={toggleFullscreen}>
            {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          </button>
        </div>
      </div>

      <div className="cube-card" ref={cardRef}>
        <div id="gradeifyCube" ref={cubeRef} className="animcube-box" />
      </div>
    </div>
  );
}