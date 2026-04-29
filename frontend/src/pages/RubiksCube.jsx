import { useEffect, useRef } from "react";
import "./RubiksCube.css";

export default function RubiksCube() {
  const cubeRef = useRef(null);

  useEffect(() => {
    const existing = document.querySelector("script[data-animcube]");
    const loadCube = () => {
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
            "&supercube=0" +
            "&edit=1" +
            "&initrevmove=#" +
            "&move="
        );
      }
    };

    if (existing) {
      loadCube();
      return;
    }

    const script = document.createElement("script");
    script.src = "/AnimCube3.js";
    script.async = true;
    script.dataset.animcube = "true";
    script.onload = loadCube;
    document.body.appendChild(script);
  }, []);

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
      </div>

      <div className="cube-card">
        <div id="gradeifyCube" ref={cubeRef} className="animcube-box" />
      </div>
    </div>
  );
}