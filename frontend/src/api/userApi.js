// src/api/userApi.js
const baseFromEnv =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_URL) ||
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_API_URL) ||
  "";

const BASE = String(baseFromEnv || "").replace(/\/$/, "");

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: "GET",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    credentials: "include",
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  if (res.status === 204) return null;
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

export const getSettings       = () => req("/me/settings");
export const savePreferences   = (prefs) => req("/me/preferences", { method: "PATCH", body: prefs });
export const updateDisplayName = ({ displayName }) =>
  req("/me/profile", { method: "PATCH", body: { displayName } });
export const updateUsername    = ({ newUsername }) =>
  req("/me/username", { method: "PATCH", body: { newUsername } });
export const updatePassword    = ({ currentPassword, newPassword }) =>
  req("/me/password", { method: "PATCH", body: { currentPassword, newPassword } });
