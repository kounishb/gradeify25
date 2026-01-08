// src/pages/Learn.jsx
import PracticeGenerator from "../components/PracticeGenerator";

const getPageStyle = (isDark) => ({
  padding: "32px",
  minHeight: "100vh",
  background: isDark ? "#020617" : "#f3f4f6", // overall page background
});

const getCardStyle = (isDark) => ({
  maxWidth: "960px",
  margin: "0 auto",
  background: isDark ? "rgba(15,23,42,0.95)" : "rgba(255,255,255,0.95)",
  borderRadius: "24px",
  boxShadow: "0 18px 40px rgba(15,23,42,0.35)",
  padding: "24px 28px 30px",
  border: isDark ? "1px solid #1f2937" : "1px solid rgba(148,163,184,0.4)",
});

const getHeadingStyle = (isDark) => ({
  fontSize: "28px",
  fontWeight: 700,
  marginBottom: "4px",
  color: isDark ? "#e5e7eb" : "#111827",
});

const getSubheadingStyle = (isDark) => ({
  fontSize: "14px",
  color: isDark ? "#9ca3af" : "#6b7280",
  marginBottom: "20px",
});

export default function LearnPage({ isDarkMode = false }) {
  return (
    <div style={getPageStyle(isDarkMode)}>
      <section style={getCardStyle(isDarkMode)}>
        <h1 style={getHeadingStyle(isDarkMode)}>Learn – Practice Generator</h1>
        <p style={getSubheadingStyle(isDarkMode)}>
          Generate custom practice sets, answer the questions, and then check
          your score at the end.
        </p>

        <PracticeGenerator isDarkMode={isDarkMode} />
      </section>
    </div>
  );
}
