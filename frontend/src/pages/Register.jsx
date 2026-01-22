import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { register } from "../api/manual";

export default function Register() {
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await register({ username: username.trim(), password });
      nav("/manual");
    } catch (e) {
      setErr(e?.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-container">
      <div className="login-page">
        <h1 className="title">Create your Gradeify account</h1>
        <p className="subtitle">
          Get access to practice tools, learning features, and grade
          calculations — all in one place.
        </p>

        <form onSubmit={onSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              placeholder="Choose a username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="Create a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          {err && <p className="error-text">{err}</p>}

          <button type="submit" disabled={loading}>
            {loading ? "Creating…" : "Create account"}
          </button>
        </form>

        <p className="switch-link">
          Already have an account?{" "}
          <Link to="/login" className="link">
            Sign in
          </Link>
        </p>

        <p className="switch-link" style={{ marginTop: 10 }}>
          <Link to="/" className="link" style={{ fontWeight: 700 }}>
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
