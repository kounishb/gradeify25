// src/pages/DashboardLayout.jsx
import { useState, useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { me, logout } from "../api/manual";          // 👈 get current user from API
import "./DashboardLayout.css";

export default function DashboardLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);

  const isActive = (path) =>
    location.pathname === path ? "nav-link active" : "nav-link";

  // load user on mount
  useEffect(() => {
    me()
      .then((res) => {
        if (res?.user) setCurrentUser(res.user);
        else navigate("/login", { replace: true });
      })
      .catch(() => {
        navigate("/login", { replace: true });
      });
  }, [navigate]);


  const handleSignOut = async () => {
  try {
    await logout(); // calls POST /auth/logout
  } catch (e) {
    // even if it fails, force local sign-out so user isn't stuck
    console.warn("Logout failed:", e?.message || e);
  } finally {
    setCurrentUser(null);

    // optional: clear any stored token you might use anywhere
    localStorage.removeItem("gradeifyToken");

    navigate("/login", { replace: true });
  }
};


  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1 className="logo">Gradeify</h1>

        <nav className="nav">
          <Link to="/app" className={isActive("/app")}>
            Welcome
          </Link>
          <Link to="/app/classes" className={isActive("/app/classes")}>
            Classes
          </Link>
          <Link to="/app/learn" className={isActive("/app/learn")}>
            Learn
          </Link>
          <Link to="/app/tools" className={isActive("/app/tools")}>
            Tools (soon)
          </Link>
          <Link to="/app/settings" className={isActive("/app/settings")}>
            Settings
          </Link>
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <span className="signed-in">
            {currentUser ? `Signed in as ${currentUser.username}` : ""}
          </span>
          <button className="signout-btn" onClick={handleSignOut}>
            Sign out
          </button>
        </header>

        <div className="content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
