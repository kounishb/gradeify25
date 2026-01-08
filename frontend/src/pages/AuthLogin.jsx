import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { login, me } from "../api/manual";

export default function AuthLogin() {
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);

  // If already logged in, skip login page
  useEffect(() => {
    me()
      .then((res) => {
        if (res?.user) nav("/manual");
      })
      .catch(() => {});
  }, [nav]);

  async function onSubmit(e) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await login({ username: username.trim(), password });
      nav("/manual");
    } catch (e) {
      setErr(e.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <h1 className="title">Gradeify</h1>
      <p className="subtitle">Track your classes, grades, and study smarter!</p>

      <form onSubmit={onSubmit} className="login-form">
        <div className="form-group">
          <label>Username</label>
          <input
            type="text"
            placeholder="Enter your username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label>Password</label>
          <input
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {err && <p className="error-text">{err}</p>}

        <button disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="switch-link">
        No account yet? <Link to="/register" className="link">Create one</Link>
      </p>
    </div>
  );
}
