import "./RubiksCube.css";

export default function RubiksCube() {
  return (
    <div className="cube-page">
      <div className="cube-header">
        <div>
          <p className="cube-kicker">Gradeify Games</p>
          <h1>Virtual Rubik’s Cube</h1>
          <p>
            Drag the cube to turn faces, scramble it, solve it, or practice
            algorithms.
          </p>
        </div>
      </div>

      <div className="cube-embed-card">
        <iframe
          title="Virtual Rubik's Cube"
          src="https://onlinecube.com/"
          className="cube-iframe"
          allow="fullscreen"
        />
      </div>
    </div>
  );
}