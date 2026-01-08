// ProtectedRoute.jsx
import { Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export default function ProtectedRoute({ children }) {
  const [ok, setOk] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setOk(!!data.session);
    });
  }, []);

  if (ok === null) return null; // or a spinner
  return ok ? children : <Navigate to="/login" replace />;
}
