import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { login, me } from "../api/manual";

export default function AuthLogin() {
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
    await login({ username: username.trim(), password });

    const meRes = await me();
    if (!meRes?.user) {
      throw new Error("Login succeeded, but your session did not persist on this device.");
    }

    nav("/app/classes", { replace: true });
  } catch (e) {
    setErr(e?.message || "Login failed. Please try again.");
  } finally {
    setLoading(false);
  }
}

  return (
    <div className="app-container">
      <div className="login-page">
        <h1 className="title">Gradeify</h1>
        <p className="subtitle">
          Practice smarter with learning tools and grade calculations — all in
          one place.
        </p>

        <form onSubmit={onSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              placeholder="Enter your username"
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
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {err && <p className="error-text">{err}</p>}

          <button type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="switch-link">
          No account yet?{" "}
          <Link to="/register" className="link">
            Create one
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
