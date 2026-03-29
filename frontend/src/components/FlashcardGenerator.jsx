// src/components/FlashcardGenerator.jsx
import { useMemo, useState, useEffect } from "react";
import { InlineMath, BlockMath } from "react-katex";
import {
  generateFlashcards,
  saveFlashcardSet,
  listClasses,
  listGrades,
  listCategories,
} from "../api/manual";

const getSectionCard = (isDark) => ({
  borderRadius: "18px",
  border: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
  background: isDark ? "#111827" : "#f9fafb",
  padding: "16px 18px",
  marginBottom: "16px",
});

const labelStyle = {
  display: "block",
  fontSize: "13px",
  fontWeight: 600,
  marginBottom: "4px",
};

const inputStyle = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: "8px",
  border: "1px solid #d4d4d8",
  fontSize: "14px",
  outline: "none",
};

const primaryButton = {
  padding: "8px 14px",
  borderRadius: "999px",
  border: "none",
  background: "#4f46e5",
  color: "white",
  fontSize: "14px",
  fontWeight: 700,
  cursor: "pointer",
};

const subtleText = (isDark) => ({
  fontSize: "12px",
  color: isDark ? "#9ca3af" : "#6b7280",
});

const pill = (isDark, active) => ({
  padding: "6px 10px",
  borderRadius: 999,
  border: `1px solid ${active ? "#4f46e5" : isDark ? "#374151" : "#e5e7eb"}`,
  background: active ? (isDark ? "#1f2a5a" : "#eef2ff") : isDark ? "#0b1220" : "#fff",
  color: isDark ? "#e5e7eb" : "#111827",
  cursor: "pointer",
  fontWeight: 800,
  fontSize: 12,
});

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function renderMath(text) {
  const str = String(text ?? "");
  const parts = [];
  let last = 0;

  const re = /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g;
  let m;

  while ((m = re.exec(str)) !== null) {
    if (m.index > last) parts.push({ type: "text", value: str.slice(last, m.index) });
    if (m[1] != null) parts.push({ type: "inline", value: m[1] });
    else parts.push({ type: "block", value: m[2] });
    last = re.lastIndex;
  }

  if (last < str.length) parts.push({ type: "text", value: str.slice(last) });

  const hasWrappers = parts.some((p) => p.type !== "text");
  const looksLikeLatex =
    /\\(int|frac|sqrt|sum|prod|left|right|cdot|times|pi|ln|log|sin|cos|tan|arctan|\^|_)/.test(str);

  if (!hasWrappers && looksLikeLatex) return <InlineMath math={str} />;

  return parts.map((p, i) => {
    if (p.type === "text") return <span key={i}>{p.value}</span>;
    if (p.type === "inline") return <InlineMath key={i} math={p.value} />;
    return <BlockMath key={i} math={p.value} />;
  });
}

function FlashcardViewer({ cards, isDarkMode }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [frontSide, setFrontSide] = useState("term"); // "term" | "definition"

  useEffect(() => {
    setIndex(0);
    setFlipped(false);
  }, [cards]);

  const total = cards.length;
  const current = cards[index];

  const frontText = frontSide === "term" ? current.term : current.definition;
  const backText = frontSide === "term" ? current.definition : current.term;

  const handlePrev = () => {
    setFlipped(false);
    setIndex((i) => (i - 1 + total) % total);
  };

  const handleNext = () => {
    setFlipped(false);
    setIndex((i) => (i + 1) % total);
  };

  return (
    <section style={getSectionCard(isDarkMode)}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
          marginBottom: 10,
        }}
      >
        <div>
          <h2
            style={{
              fontSize: 18,
              fontWeight: 900,
              marginBottom: 4,
              color: isDarkMode ? "#e5e7eb" : "#111827",
            }}
          >
            Flashcards
          </h2>
          <div style={subtleText(isDarkMode)}>
            Click the card to flip. Use next/prev to move through cards.
          </div>
        </div>

        <div style={{ fontWeight: 900, color: isDarkMode ? "#e5e7eb" : "#111827" }}>
          {index + 1} / {total}
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => {
            setFrontSide("term");
            setFlipped(false);
          }}
          style={pill(isDarkMode, frontSide === "term")}
        >
          Term on front
        </button>

        <button
          type="button"
          onClick={() => {
            setFrontSide("definition");
            setFlipped(false);
          }}
          style={pill(isDarkMode, frontSide === "definition")}
        >
          Definition on front
        </button>

        <button type="button" onClick={() => setFlipped((f) => !f)} style={pill(isDarkMode, false)}>
          Flip
        </button>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => setFlipped((f) => !f)}
        onKeyDown={(e) => e.key === "Enter" && setFlipped((f) => !f)}
        style={{
          borderRadius: 18,
          border: `1px solid ${isDarkMode ? "#374151" : "#e5e7eb"}`,
          background: isDarkMode ? "#020617" : "#ffffff",
          minHeight: 220,
          padding: 18,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <div style={{ maxWidth: 760 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 900,
              marginBottom: 10,
              color: isDarkMode ? "#9ca3af" : "#6b7280",
            }}
          >
            {flipped ? "Back" : "Front"}
          </div>

          <div style={{ fontSize: 22, fontWeight: 900, color: isDarkMode ? "#e5e7eb" : "#111827" }}>
            {renderMath(flipped ? backText : frontText)}
          </div>

          <div style={{ marginTop: 10, ...subtleText(isDarkMode) }}>(click to flip)</div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
        <button type="button" onClick={handlePrev} style={{ ...primaryButton, background: "#334155" }}>
          ← Prev
        </button>
        <button type="button" onClick={handleNext} style={{ ...primaryButton }}>
          Next →
        </button>
      </div>
    </section>
  );
}

export default function FlashcardGenerator({ isDarkMode = false, selectedClassId = null }) {
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [numCards, setNumCards] = useState(10);
  const [prompt, setPrompt] = useState("");
  const [selectedClassName, setSelectedClassName] = useState("");
  const [useSelectedClass, setUseSelectedClass] = useState(true);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cards, setCards] = useState([]);
  const [error, setError] = useState("");

  const canShowViewer = cards.length > 0;

  const helperText = useMemo(() => {
    return "Example: Make flashcards for the electromagnetic spectrum (radio → gamma). Include frequency/wavelength trends and one real-world example for each.";
  }, []);

  useEffect(() => {
    async function loadSelectedClassData() {
      if (!selectedClassId) return;

      try {
        const clsRes = await listClasses();
        const classList = clsRes.classes || [];
        const selected = classList.find((c) => c.id === selectedClassId);

        if (selected) {
          setSelectedClassName(selected.name || "");
          setSubject((prev) => prev || selected.name || "");
        }

        const gradesRes = await listGrades(selectedClassId);
        const categoriesRes = await listCategories(selectedClassId);

        const grades = gradesRes.grades || [];
        const categories = categoriesRes.categories || [];

        const categoryNames = categories.map((c) => c.name).filter(Boolean);
        const assignmentTitles = grades.map((g) => g.title).filter(Boolean);

        const autoTopic = [
          categoryNames.length ? `Categories: ${categoryNames.join(", ")}` : "",
          assignmentTitles.length
            ? `Assignments/topics: ${assignmentTitles.slice(0, 15).join(", ")}`
            : "",
        ]
          .filter(Boolean)
          .join(". ");

        if (autoTopic) {
          setTopic((prev) => prev || autoTopic);
          setPrompt(
            (prev) =>
              prev ||
              `Make flashcards based on this class content. Focus on the most important concepts, vocabulary, and likely test topics. ${autoTopic}`
          );
        }
      } catch (err) {
        console.error("Failed to load selected class data", err);
      }
    }

    loadSelectedClassData();
  }, [selectedClassId]);

  const handleGenerate = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setCards([]);

    try {
      const finalSubject = useSelectedClass && selectedClassName ? selectedClassName : subject;
      const finalTopic = topic;
      const finalPrompt = prompt.trim();

      const data = await generateFlashcards({
        subject: finalSubject,
        topic: finalTopic,
        prompt: finalPrompt,
        numCards: Number(numCards),
      });

      if (!data?.cards || !Array.isArray(data.cards)) {
        throw new Error("Bad response from server: expected { cards: [...] }");
      }

      const normalized = data.cards
        .map((c, i) => ({
          id: `${Date.now()}_${i}`,
          term: String(c.term ?? "").trim(),
          definition: String(c.definition ?? "").trim(),
        }))
        .filter((c) => c.term && c.definition);

      if (!normalized.length) {
        throw new Error("No flashcards returned. Try a more specific prompt.");
      }

      setCards(normalized);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Something went wrong generating flashcards.");
    } finally {
      setLoading(false);
    }
  };

  const handleShuffle = () => setCards((prev) => shuffleArray(prev));

  // ✅ THIS is where the save handler belongs (inside component)
  const handleSaveToReview = async () => {
    if (!cards.length) return;

    setSaving(true);
    setError("");

    try {
      await saveFlashcardSet({
        subject: (useSelectedClass && selectedClassName ? selectedClassName : subject).trim(),
        topic: topic.trim(),
        prompt: prompt.trim(),
        cards: cards.map(({ term, definition }) => ({
          term,
          definition,
        })),
      });

      alert("Saved to Review!");
    } catch (e) {
      console.error(e);
      setError(e?.message || "Failed to save flashcards.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section style={getSectionCard(isDarkMode)}>
        <h2 style={{ fontSize: 18, fontWeight: 900, marginBottom: 8, color: isDarkMode ? "#e5e7eb" : "#111827" }}>
          Flashcard Generator
        </h2>

        {selectedClassId && (
  <div style={{ marginBottom: 10, ...subtleText(isDarkMode) }}>
    Using the class selected in your dashboard{selectedClassName ? `: ${selectedClassName}` : ""}.
  </div>
)}

        <form onSubmit={handleGenerate} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 12 }}>
            <div>
              <label style={labelStyle}>Subject (e.g., Biology)</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} style={inputStyle} required />
            </div>
            <div>
              <label style={labelStyle}>Topic (e.g., Cell Membrane)</label>
              <input value={topic} onChange={(e) => setTopic(e.target.value)} style={inputStyle} required />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 220px", gap: 12, alignItems: "end" }}>
            <div>
              <label style={labelStyle}>Prompt (tell the AI what flashcards to make)</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                style={{ ...inputStyle, resize: "vertical" }}
                placeholder={helperText}
                required
              />
              <div style={{ marginTop: 6, ...subtleText(isDarkMode) }}>
                Be specific: include subtopics + style (simple, AP-level, include examples, etc.).
              </div>
            </div>

            <div>
              <label style={labelStyle}>Number of cards</label>
              <input
                type="number"
                min={5}
                max={60}
                value={numCards}
                onChange={(e) => setNumCards(Number(e.target.value))}
                style={inputStyle}
              />

              <button
                type="submit"
                disabled={loading}
                style={{
                  ...primaryButton,
                  width: "100%",
                  marginTop: 10,
                  opacity: loading ? 0.7 : 1,
                  cursor: loading ? "default" : "pointer",
                }}
              >
                {loading ? "Generating..." : "Generate Flashcards"}
              </button>

              {canShowViewer && (
                <>
                  <button
                    type="button"
                    onClick={handleShuffle}
                    style={{
                      ...primaryButton,
                      width: "100%",
                      marginTop: 8,
                      background: "#334155",
                    }}
                  >
                    Shuffle
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveToReview}
                    disabled={saving}
                    style={{
                      ...primaryButton,
                      width: "100%",
                      marginTop: 8,
                      background: "#059669",
                      opacity: saving ? 0.75 : 1,
                      cursor: saving ? "default" : "pointer",
                    }}
                  >
                    {saving ? "Saving..." : "Save to Review"}
                  </button>
                </>
              )}
            </div>
          </div>
        </form>

        {error && (
          <div
            style={{
              marginTop: 8,
              padding: "6px 8px",
              borderRadius: 10,
              border: "1px solid #fecaca",
              background: "#fee2e2",
              color: "#b91c1c",
              fontSize: 12,
            }}
          >
            {error}
          </div>
        )}
      </section>

      {canShowViewer && <FlashcardViewer cards={cards} isDarkMode={isDarkMode} />}
    </div>
  );
}
