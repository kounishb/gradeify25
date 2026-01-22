// src/pages/DashboardLayout.jsx
import { useState, useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { me, logout } from "../api/manual";
import "./DashboardLayout.css";

export default function DashboardLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);

  const isActive = (path) =>
    location.pathname === path ? "nav-link active" : "nav-link";

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
      await logout();
    } catch (e) {
      console.warn("Logout failed:", e?.message || e);
    } finally {
      setCurrentUser(null);
      localStorage.removeItem("gradeifyToken");
      navigate("/login", { replace: true });
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <h1 className="logo">Gradeify</h1>
        </div>

        {/* IMPORTANT: use side-nav instead of nav to avoid Landing.css .nav collisions */}
        <nav className="side-nav">
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
          <button className="signout-btn" onClick={handleSignOut} type="button">
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
