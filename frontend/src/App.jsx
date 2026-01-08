// src/App.jsx
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";

import AuthLogin from "./pages/AuthLogin.jsx";
import Register from "./pages/Register.jsx";
import ManualDashboard from "./pages/ManualDashboard.jsx";
import SettingsPage from "./pages/Settings.jsx";
import WelcomePage from "./pages/WelcomePage.jsx";
import DashboardLayout from "./pages/DashboardLayout.jsx";

// use the Learn page file we created
import LearnPage from "./pages/Learn.jsx";

import "./App.css";

/* ---------------- ErrorBoundary ---------------- */
function ErrorBoundary({ children }) {
  const [err, setErr] = useState(null);
  const location = useLocation();

  useEffect(() => {
    const onError = (e) => setErr(e?.error || e?.reason || e);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onError);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onError);
    };
  }, []);

  useEffect(() => {
    if (err) setErr(null);
  }, [location.pathname, err]);

  if (err) {
    return (
      <div style={{ padding: 16 }}>
        <h1 style={{ color: "#b00020" }}>Something broke at runtime</h1>
        <pre
          style={{
            background: "#f7f7f7",
            padding: 12,
            borderRadius: 8,
            overflow: "auto",
            whiteSpace: "pre-wrap",
          }}
        >
          {String(err?.stack || err?.message || err)}
        </pre>
        <button
          onClick={() => window.location.reload()}
          className="border px-3 py-2 rounded"
          type="button"
        >
          Reload app
        </button>
      </div>
    );
  }

  return children;
}

/* simple placeholder for Tools page */
function ToolsPage() {
  return <p>Tools and calculators coming soon...</p>;
}

/* ---------------- App ---------------- */
export default function App() {
  const location = useLocation();
  const [theme, setTheme] = useState("light");

  // Force light mode on /login and /register; otherwise use saved theme.
  useEffect(() => {
    const forceLight = ["/login", "/register"].includes(location.pathname);
    const saved =
      localStorage.getItem("gradeify_theme") === "dark" ? "dark" : "light";

    const effectiveTheme = forceLight ? "light" : saved;

    // update <html data-theme="...">
    document.documentElement.setAttribute("data-theme", effectiveTheme);

    // keep React state in sync so we can pass it to pages
    setTheme(effectiveTheme);
  }, [location.pathname]);

  const isDarkMode = theme === "dark";

  return (
    <ErrorBoundary>
      <Routes>
        {/* auth + landing */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<AuthLogin />} />
        <Route path="/register" element={<Register />} />

        {/* main app dashboard */}
        <Route path="/app" element={<DashboardLayout />}>
          {/* default: welcome page */}
          <Route index element={<WelcomePage />} />
          {/* classes = your ManualDashboard */}
          <Route path="classes" element={<ManualDashboard />} />
          {/* settings inside dashboard */}
          <Route path="settings" element={<SettingsPage />} />
          {/* educational features */}
          <Route path="learn" element={<LearnPage isDarkMode={isDarkMode} />} />
          <Route path="tools" element={<ToolsPage />} />
        </Route>

        {/* backwards compatibility: old routes redirect into new ones */}
        <Route path="/manual" element={<Navigate to="/app/classes" replace />} />
        <Route
          path="/settings"
          element={<Navigate to="/app/settings" replace />}
        />

        {/* catch-all */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}

