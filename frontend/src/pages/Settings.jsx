// src/pages/Settings.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./ui.css";
import {
  getSettings,
  savePreferences,
  updateUsername,
  updatePassword,
} from "../api/userApi";

/* Small helper to apply theme to <html> immediately */
function applyTheme(theme) {
  const t = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem("gradeify_theme", t); } catch {}
}

function applyFontSize(size) {
  const allowed = ["small", "medium", "large"];
  const s = allowed.includes(size) ? size : "medium";
  document.documentElement.setAttribute("data-font-size", s);
  try { localStorage.setItem("gradeify_font_size", s); } catch {}
}

export default function SettingsPage() {
  const nav = useNavigate();

  // status
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  // prefs
  const [theme, setTheme] = useState("light");
  const [fontSize, setFontSize] = useState("medium");  

  // profile
  const [username, setUsername] = useState("");     // current
  const [newUsername, setNewUsername] = useState(""); // input

  // password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

    // ref for input to keep focus stable
  const usernameInputRef = useRef(null);
  const currentPasswordRef = useRef(null);
  const newPasswordRef = useRef(null);
  const confirmPwRef   = useRef(null);
  

  // (Optional) mount debugging to see if SettingsPage is remounting
  useEffect(() => {
    console.log("SettingsPage mounted");
    return () => console.log("SettingsPage unmounted");
  }, []);

  // If something causes a re-render/remount and steals focus,
  // this puts it back in the username box while you're typing.
  useEffect(() => {
    if (!usernameInputRef.current) return;
    // Only try to keep focus if you're actively editing (non-empty)
    if (newUsername !== "" && document.activeElement !== usernameInputRef.current) {
      const el = usernameInputRef.current;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len); // cursor at end
    }
  }, [newUsername]);

  // Keep focus in "Current password" while typing
useEffect(() => {
  if (!currentPasswordRef.current) return;
  if (
    currentPassword !== "" &&
    document.activeElement !== currentPasswordRef.current
  ) {
    const el = currentPasswordRef.current;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }
}, [currentPassword]);

// Keep focus in "New password" while typing
useEffect(() => {
  if (!newPasswordRef.current) return;
  if (newPassword !== "" && document.activeElement !== newPasswordRef.current) {
    const el = newPasswordRef.current;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }
}, [newPassword]);

// Keep focus in "Confirm new password" while typing
useEffect(() => {
  if (!confirmPwRef.current) return;
  if (confirmPw !== "" && document.activeElement !== confirmPwRef.current) {
    const el = confirmPwRef.current;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }
}, [confirmPw]);

  // -------- Floating toast (no layout changes) --------
  function Toast() {
    if (!err && !msg) return null;
    const isErr = !!err;
    return (
      <div
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          zIndex: 1000,
          maxWidth: 420,
          background: isErr ? "var(--alert-bg)" : "#d4edda",
          color: isErr ? "var(--alert-text)" : "#155724",
          border: `1px solid ${isErr ? "var(--alert-border)" : "#c3e6cb"}`,
          boxShadow: "0 8px 20px rgba(0,0,0,.25)",
          padding: "10px 12px",
          borderRadius: 10,
        }}
        role="status"
        aria-live="polite"
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div style={{ whiteSpace: "pre-wrap" }}>{isErr ? err : msg}</div>
          <button
            type="button"
            onClick={() => { setErr(""); setMsg(""); }}
            className="link"
            style={{ fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  // Apply saved theme once
// Only apply theme once on mount, not when other state updates
useEffect(() => {
  const stored = localStorage.getItem("gradeify_theme");
  if (stored === "dark" || stored === "light") {
    document.documentElement.setAttribute("data-theme", stored);
  }
  // don't call setTheme() here — that triggers a render loop
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);


  // Initial load of settings
  useEffect(() => {
    (async () => {
      try {
        setErr(""); setMsg("");
        const data = await getSettings();
        const p = data?.preferences || {};
        const prof = data?.profile || {};
        const t = p.theme || "light";
        setTheme(t);
        applyTheme(t);
        const fs = p.fontSize || localStorage.getItem("gradeify_font_size") || "medium";
        setFontSize(fs);
        applyFontSize(fs);
        setUsername(prof.username || "");
      } catch (e) {
        setErr(e.message || "Failed to load settings.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function onSaveAppearance(e) {
    e.preventDefault();
    setErr("");
    setMsg("");

    try {
      const t = theme === "dark" ? "dark" : "light";
      const allowed = ["small", "medium", "large"];
      const fs = allowed.includes(fontSize) ? fontSize : "medium";

      await savePreferences({ theme: t, fontSize: fs });

      applyTheme(t);
      applyFontSize(fs);

      setMsg("Appearance settings saved.");
    } catch (e) {
      setErr(e.message || "Failed to save appearance.");
    }
}


  async function onSaveUsername(e) {
    e.preventDefault(); // prevent page reload → avoids jump
    setErr(""); 
    setMsg("");
    try {
      const u = (newUsername || "").trim();
      if (!u) throw new Error("New username cannot be empty.");
      await updateUsername({ newUsername: u });
      setUsername(u);
      setNewUsername("");
      setMsg("Username changed.");
    } catch (e) {
      setErr(e.message || "Failed to change username.");
    }
  }

  async function onChangePassword(e) {
    e.preventDefault(); // prevent page reload → avoids jump
    setErr(""); setMsg("");
    try {
      if (newPassword !== confirmPw) throw new Error("New passwords do not match.");
      if (!newPassword || newPassword.length < 8) {
        throw new Error("Password must be at least 8 characters.");
      }
      await updatePassword({ currentPassword, newPassword });
      setCurrentPassword(""); setNewPassword(""); setConfirmPw("");
      setMsg("Password updated.");
    } catch (e) {
      setErr(e.message || "Failed to change password.");
    }
  }

  // keep inputs from accidentally submitting on Enter while typing
  const preventEnterSubmit = (e) => {
    if (e.key === "Enter") e.preventDefault();
  };

  const Card = ({ title, children }) => (
    <section className="card" style={{ borderRadius: 16 }}>
      <div className="card-title" style={{ marginTop: 0 }}>{title}</div>
      {children}
    </section>
  );

  if (loading) return <div className="page" style={{ padding: "2rem" }}>Loading…</div>;

  return (
    <div className="page" style={{ minHeight: "100vh", padding: "2rem" }}>
      {/* Top bar */}
      <div
        style={{
          maxWidth: 900,
          margin: "0 auto 1rem auto",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
      </div>

      {/* Floating toast (no layout shift) */}
      <Toast />

      <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gap: "1rem" }}>
        {/* Theme */}
        <Card title="Appearance">
          <form
            className="grid3"
            onSubmit={onSaveAppearance}
            onKeyDown={preventEnterSubmit}
          >
            {/* Theme row */}
            <label className="muted">Theme</label>
            <select
              className="input"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
            <div />

            {/* Font size row */}
            <label className="muted">Font size</label>
            <select
              className="input"
              value={fontSize}
              onChange={(e) => setFontSize(e.target.value)}
            >
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
            <div />

            {/* Save button row */}
            <div />
            <div style={{ textAlign: "right" }}>
              <button className="btn" type="submit">Save appearance</button>
            </div>
          </form>
        </Card>


        {/* Username */}
        <Card title="Change Username">
          <div className="muted" style={{ marginBottom: 8 }}>
            Current: <b>{username}</b>
          </div>
          <form className="grid3" onSubmit={onSaveUsername} noValidate onKeyDown={preventEnterSubmit}>
            <label className="muted" htmlFor="new-username">New username</label>
            <input
              id="new-username"
              className="input"
              ref={usernameInputRef}    
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="New username"
              autoComplete="username"
              required
            />
            <div />
            <div />
            <div style={{ textAlign: "right" }}>
              <button className="btn" type="submit">Change Username</button>
            </div>
          </form>
        </Card>

        {/* Password */}
        <Card title="Change Password">
          <form className="grid3" onSubmit={onChangePassword} noValidate onKeyDown={preventEnterSubmit}>
            <label className="muted" htmlFor="cur-pw">Current password</label>
            <input
              id="cur-pw"
              className="input"
              type="password"
              ref={currentPasswordRef}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <div />

            <label className="muted" htmlFor="new-pw">New password</label>
            <input
              id="new-pw"
              className="input"
              type="password"
              ref={newPasswordRef}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            <div />

            <label className="muted" htmlFor="confirm-pw">Confirm new password</label>
            <input
              id="confirm-pw"
              className="input"
              type="password"
              ref={confirmPwRef}
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              autoComplete="new-password"
              required
            />
            <div />

            <div />
            <div style={{ textAlign: "right" }}>
              <button className="btn" type="submit">Update Password</button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}

