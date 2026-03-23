import { useState, useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { me, logout } from "../api/manual";
import "./DashboardLayout.css";

export default function DashboardLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const isActive = (path) =>
    location.pathname === path ? "nav-link active" : "nav-link";

  useEffect(() => {
  let cancelled = false;

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function checkAuth() {
    try {
      let res = await me();

      if (!res?.user) {
        await wait(400);
        res = await me();
      }

      if (cancelled) return;

      if (res?.user) {
        setCurrentUser(res.user);
      } else {
        navigate("/login", { replace: true });
      }
    } catch (err) {
      if (!cancelled) {
        navigate("/login", { replace: true });
      }
    } finally {
      if (!cancelled) {
        setCheckingAuth(false);
      }
    }
  }

  checkAuth();

  return () => {
    cancelled = true;
  };
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

  if (checkingAuth) {
    return (
      <div className="app-shell">
        <main className="main">
          <div className="content">
            <p>Loading...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <h1 className="logo">Gradeify</h1>
        </div>

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
          <Link to="/app/review" className={isActive("/app/review")}>
            Review
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