// src/pages/Learn.jsx
import { useState } from "react";
import PracticeGenerator from "../components/PracticeGenerator";
import FlashcardGenerator from "../components/FlashcardGenerator.jsx";

const cardStyle = (isDark) => ({
  flex: 1,
  minHeight: 220,
  borderRadius: 22,
  border: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
  background: isDark ? "#0b1220" : "#ffffff",
  padding: 22,
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: 10,
  boxShadow: isDark
    ? "0 10px 30px rgba(0,0,0,0.35)"
    : "0 10px 30px rgba(0,0,0,0.12)",
});

const pageWrap = {
  width: "100%",
  maxWidth: 1100,
  margin: "0 auto",
};

const headerStyle = (isDark) => ({
  fontSize: 26,
  fontWeight: 800,
  marginBottom: 6,
  color: isDark ? "#e5e7eb" : "#111827",
});

const subStyle = (isDark) => ({
  fontSize: 14,
  color: isDark ? "#9ca3af" : "#6b7280",
  marginBottom: 18,
});

const backBtn = (isDark) => ({
  borderRadius: 999,
  border: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
  background: isDark ? "#0b1220" : "#fff",
  color: isDark ? "#e5e7eb" : "#111827",
  padding: "8px 12px",
  fontWeight: 700,
  cursor: "pointer",
});

export default function LearnPage({ isDarkMode = false }) {
  const [mode, setMode] = useState(null); // "test" | "flashcards" | null

  return (
    <div style={pageWrap}>
      <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={headerStyle(isDarkMode)}>Learn</h1>
        {mode && (
          <button type="button" onClick={() => setMode(null)} style={backBtn(isDarkMode)}>
            ← Back
          </button>
        )}
      </div>

      {!mode ? (
        <>
          <p style={subStyle(isDarkMode)}>
            Choose what you want to generate.
          </p>

          <div style={{ display: "flex", gap: 16 }}>
            <div
              role="button"
              tabIndex={0}
              style={cardStyle(isDarkMode)}
              onClick={() => setMode("test")}
              onKeyDown={(e) => e.key === "Enter" && setMode("test")}
            >
              <div style={{ fontSize: 34, fontWeight: 900, color: isDarkMode ? "#e5e7eb" : "#111827" }}>
                Test
              </div>
              <div style={{ fontSize: 14, color: isDarkMode ? "#9ca3af" : "#6b7280" }}>
                Generate a practice test, answer questions, and get your score.
              </div>
            </div>

            <div
              role="button"
              tabIndex={0}
              style={cardStyle(isDarkMode)}
              onClick={() => setMode("flashcards")}
              onKeyDown={(e) => e.key === "Enter" && setMode("flashcards")}
            >
              <div style={{ fontSize: 34, fontWeight: 900, color: isDarkMode ? "#e5e7eb" : "#111827" }}>
                Flashcards
              </div>
              <div style={{ fontSize: 14, color: isDarkMode ? "#9ca3af" : "#6b7280" }}>
                Generate Quizlet-style cards: flip, shuffle, and swap front side.
              </div>
            </div>
          </div>
        </>
      ) : mode === "test" ? (
        <PracticeGenerator isDarkMode={isDarkMode} />
      ) : (
        <FlashcardGenerator isDarkMode={isDarkMode} />
      )}
    </div>
  );
}
