import { createContext, useContext, useEffect, useMemo, useState } from "react";

const LS_KEY = "gradeify:settings:v1";

const defaultPrefs = {
  theme: "system",          // "light" | "dark" | "system"
  textScale: "md",          // "sm" | "md" | "lg" | "xl"
  highContrast: false,
  reduceMotion: false,
};

const defaultProfile = {
  displayName: "",          // shown in navbar, etc.
};

const SettingsContext = createContext();

export function SettingsProvider({ children }) {
  const [prefs, setPrefs] = useState(defaultPrefs);
  const [profile, setProfile] = useState(defaultProfile);

  // load once
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const { prefs: p = defaultPrefs, profile: pr = defaultProfile } = JSON.parse(raw);
        setPrefs({ ...defaultPrefs, ...p });
        setProfile({ ...defaultProfile, ...pr });
      }
    } catch {/* ignore */}
  }, []);

  // persist on change
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify({ prefs, profile }));
    // apply theme to <html>
    const root = document.documentElement;
    const sysDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
    const mode = prefs.theme === "system" ? (sysDark ? "dark" : "light") : prefs.theme;
    root.dataset.theme = mode; // use [data-theme="dark"] in CSS if you want
    // text scale class
    root.dataset.textScale = prefs.textScale;
    // contrast
    root.dataset.hc = prefs.highContrast ? "1" : "0";
    // motion
    root.style.setProperty("--pref-reduce-motion", prefs.reduceMotion ? "reduce" : "no-preference");
  }, [prefs, profile]);

  const value = useMemo(() => ({
    prefs, setPrefs,
    profile, setProfile,
    setTheme: (t) => setPrefs(p => ({ ...p, theme: t })),
    setTextScale: (s) => setPrefs(p => ({ ...p, textScale: s })),
    setHighContrast: (b) => setPrefs(p => ({ ...p, highContrast: !!b })),
    setReduceMotion: (b) => setPrefs(p => ({ ...p, reduceMotion: !!b })),
    setDisplayName: (name) => setProfile(pr => ({ ...pr, displayName: name })),
  }), [prefs, profile]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
