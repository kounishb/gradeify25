// src/components/PracticeGenerator.jsx
import { useState, useEffect } from "react";
import { generatePractice } from "../api/manual";
import { InlineMath, BlockMath } from "react-katex";



const STORAGE_KEY = "gradeify_practice_state_v1";

const SAVED_TESTS_KEY = "gradeify_saved_practice_tests_v1";

function loadSavedTests() {
  try {
    const raw = localStorage.getItem(SAVED_TESTS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveTestToStorage(test) {
  const existing = loadSavedTests();

  // avoid duplicates (same id)
  if (existing.some((t) => t.id === test.id)) return { ok: false, reason: "duplicate" };

  const next = [test, ...existing].slice(0, 50); // keep newest 50
  localStorage.setItem(SAVED_TESTS_KEY, JSON.stringify(next));
  return { ok: true };
}


// Theme-aware styles
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
  fontWeight: 500,
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

const selectStyle = { ...inputStyle };

const getSmallText = (isDark) => ({
  fontSize: "12px",
  color: isDark ? "#9ca3af" : "#6b7280",
});

const primaryButton = {
  padding: "8px 14px",
  borderRadius: "999px",
  border: "none",
  background: "#4f46e5",
  color: "white",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryButton = {
  ...primaryButton,
  background: "#059669",
};

const getQuestionCard = (isDark) => ({
  background: isDark ? "#020617" : "white",
  borderRadius: "14px",
  border: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
  padding: "12px 14px",
});

const OPTION_LETTERS = ["a", "b", "c", "d", "e", "f"];

// Normalize for comparison: lowercase & strip non-alphanumerics
function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function renderMath(text) {
  const str = String(text ?? "");
  const parts = [];
  let last = 0;

  // matches \( ... \) OR \[ ... \]
  const re = /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g;
  let m;

  while ((m = re.exec(str)) !== null) {
    if (m.index > last) {
      parts.push({ type: "text", value: str.slice(last, m.index) });
    }

    if (m[1] != null) parts.push({ type: "inline", value: m[1] });
    else parts.push({ type: "block", value: m[2] });

    last = re.lastIndex;
  }

  if (last < str.length) parts.push({ type: "text", value: str.slice(last) });

  // If no \( \) or \[ \] wrappers but it still looks like LaTeX, render as inline math
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


function getCorrectAnswerInfo(q) {
  const raw = String(q.answer ?? "").trim();
  if (!raw) {
    return { normalized: "", display: "" };
  }

  const first = raw[0].toLowerCase();

  // handle "B", "b", "B.", "b)", "B: P = I^2R", etc.
  const looksLikeLetter =
    OPTION_LETTERS.includes(first) &&
    (raw.length === 1 ||
      raw[1] === "." ||
      raw[1] === ")" ||
      raw[1] === ":" ||
      raw[1] === " ");

  if (looksLikeLetter && Array.isArray(q.choices) && q.choices.length) {
    const idx = OPTION_LETTERS.indexOf(first);
    const choiceText = q.choices[idx];

    return {
      normalized: normalizeText(choiceText ?? first),
      display: first.toUpperCase(),   // <-- only show "A", "B", "C", etc.
    };

  }

  // Otherwise treat the answer as the full text
  return {
    normalized: normalizeText(raw),
    display: raw,
  };
}

export default function PracticeGenerator({ isDarkMode = false }) {
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [numQuestions, setNumQuestions] = useState(10);
  const [loading, setLoading] = useState(false);
  const [testData, setTestData] = useState(null);
  const [error, setError] = useState("");
  const [savedNow, setSavedNow] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");


  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState(null);

  // Restore from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);

      // If submitted previously, do NOT restore the test — clear it.
      if (saved.submitted === true) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }

      if (saved.subject) setSubject(saved.subject);
      if (saved.topic) setTopic(saved.topic);
      if (saved.difficulty) setDifficulty(saved.difficulty);
      if (typeof saved.numQuestions === "number") setNumQuestions(saved.numQuestions);

      if (saved.testData) setTestData(saved.testData);
      if (saved.selectedAnswers) setSelectedAnswers(saved.selectedAnswers);
      if (typeof saved.submitted === "boolean") setSubmitted(saved.submitted);
      if (saved.results) setResults(saved.results);
    } catch (e) {
      console.error("Failed to restore practice state:", e);
    }
  }, []);

  // Save to localStorage whenever state changes
  useEffect(() => {
    // If the test is finished, remove it instead of saving it.
    if (submitted === true) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }

    try {
      const payload = {
        subject,
        topic,
        difficulty,
        numQuestions,
        testData,
        selectedAnswers,
        submitted,
        results,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.error("Failed to save practice state:", e);
    }
  }, [
    subject,
    topic,
    difficulty,
    numQuestions,
    testData,
    selectedAnswers,
    submitted,
    results,
  ]);

  const handleGenerate = async (e) => {
    e.preventDefault();
    setError("");
    setTestData(null);
    setSelectedAnswers({});
    setSubmitted(false);
    setResults(null);
    setLoading(true);
    setSavedNow(false);
    setSaveMsg("");


    try {
      const data = await generatePractice({
        subject,
        topic,
        difficulty,
        numQuestions: Number(numQuestions),
      });
      
      setTestData(data);

    } catch (err) {
      console.error(err);
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleChoiceChange = (questionId, value) => {
    if (submitted) return;
    setSelectedAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSubmitAnswers = () => {
    if (!testData?.questions?.length) return;

    let correctCount = 0;
    const perQuestion = testData.questions.map((q) => {
      const userAnswer = selectedAnswers[q.id];
      const userNorm = normalizeText(userAnswer);
      const { normalized: correctNorm } = getCorrectAnswerInfo(q);

      const isCorrect = !!userAnswer && userNorm === correctNorm;
      if (isCorrect) correctCount++;

      return { id: q.id, correct: isCorrect, userAnswer };
    });

    setResults({
      score: correctCount,
      total: testData.questions.length,
      perQuestion,
    });
    setSubmitted(true);
  };

  const handleSaveTest = () => {
    if (!submitted || !results || !testData?.questions?.length) return;

    // create a stable id for THIS submitted test
    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

    // build per-question review data
    const reviewQuestions = testData.questions.map((q) => {
      const userAnswer = selectedAnswers[q.id] ?? "";
      const { normalized: correctNorm, display: correctDisplay } = getCorrectAnswerInfo(q);
      const isCorrect = normalizeText(userAnswer) === correctNorm && userAnswer !== "";

      return {
        id: q.id,
        question: q.question,
        choices: q.choices ?? [],
        explanation: q.explanation ?? "",
        correctDisplay,     // "A"/"B"/... or full text
        userAnswer,
        isCorrect,
      };
    });

    const payload = {
      id,
      createdAt: new Date().toISOString(),
      meta: {
        subject: testData.subject,
        topic: testData.topic,
        difficulty: testData.difficulty,
      },
      score: {
        correct: results.score,
        total: results.total,
        percent: Math.round((results.score / results.total) * 100),
      },
      questions: reviewQuestions,
    };

    const res = saveTestToStorage(payload);
    if (res.ok) {
      setSavedNow(true);
      setSaveMsg("Saved! You can view it in the Review tab.");
    } else {
      setSaveMsg("Already saved.");
    }
  };


  const getQuestionResult = (id) =>
    results?.perQuestion?.find((r) => r.id === id) || null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Generator card */}
      <section style={getSectionCard(isDarkMode)}>
        <h2
          style={{
            fontSize: "18px",
            fontWeight: 600,
            marginBottom: "8px",
            color: isDarkMode ? "#e5e7eb" : "#111827",
          }}
        >
          AI Practice Test Generator
        </h2>

        <form
          onSubmit={handleGenerate}
          style={{ display: "flex", flexDirection: "column", gap: "12px" }}
        >
          {/* subject & topic */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
              gap: "12px",
            }}
          >
            <div>
              <label style={labelStyle}>Subject (e.g., AP Calculus BC)</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                style={inputStyle}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>Topic (e.g., parametrics)</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                style={inputStyle}
                required
              />
            </div>
          </div>

          {/* difficulty / number / button */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0,1fr) 140px 160px",
              gap: "12px",
              alignItems: "end",
            }}
          >
            <div>
              <label style={labelStyle}>Difficulty</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                style={selectStyle}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Number of questions</label>
              <input
                type="number"
                min={1}
                max={50}
                value={numQuestions}
                onChange={(e) => setNumQuestions(Number(e.target.value))}
                style={inputStyle}
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                style={{
                  ...primaryButton,
                  width: "100%",
                  opacity: loading ? 0.7 : 1,
                  cursor: loading ? "default" : "pointer",
                }}
              >
                {loading ? "Generating..." : "Generate Practice Test"}
              </button>
            </div>
          </div>
        </form>

        {error && (
          <div
            style={{
              marginTop: "8px",
              padding: "6px 8px",
              borderRadius: "10px",
              border: "1px solid #fecaca",
              background: "#fee2e2",
              color: "#b91c1c",
              fontSize: "12px",
            }}
          >
            {error}
          </div>
        )}
      </section>

      {/* Quiz card */}
      {testData && (
        <section
          style={{
            ...getSectionCard(isDarkMode),
            background: isDarkMode ? "#020617" : "#f3f4f6",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: "8px",
              gap: "12px",
            }}
          >
            <div>
              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  marginBottom: "2px",
                  color: isDarkMode ? "#e5e7eb" : "#111827",
                }}
              >
                {testData.subject} – {testData.topic} ({testData.difficulty})
              </h3>
              <p style={getSmallText(isDarkMode)}>
                Select your answers, then click{" "}
                <strong>Submit Answers</strong> to see your score.
              </p>
            </div>

                      {submitted && results && (
            <div
              style={{
                marginTop: "10px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <div style={getSmallText(isDarkMode)}>
                {saveMsg ? saveMsg : "Want to review this later? Save it."}
              </div>

              <button
                type="button"
                onClick={handleSaveTest}
                disabled={savedNow}
                style={{
                  ...primaryButton,
                  background: savedNow ? "#6b7280" : "#4f46e5",
                  cursor: savedNow ? "default" : "pointer",
                }}
              >
                {savedNow ? "Saved" : "Save Test"}
              </button>
            </div>
          )}


            {results && (
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: isDarkMode ? "#e5e7eb" : "#111827",
                  }}
                >
                  Score: {results.score} / {results.total}
                </div>
                <div style={getSmallText(isDarkMode)}>
                  {Math.round((results.score / results.total) * 100)}%
                </div>
              </div>
            )}
          </div>

          <ol
            style={{
              listStyle: "decimal",
              paddingLeft: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            {testData.questions?.map((q) => {
              const result = getQuestionResult(q.id);
              const isCorrect = result?.correct;
              const userAnswer = selectedAnswers[q.id];

              let borderColor = isDarkMode ? "#374151" : "#e5e7eb";
              if (submitted && isCorrect === true) borderColor = "#4ade80";
              if (submitted && isCorrect === false) borderColor = "#f97373";

              return (
                <li key={q.id}>
                  <div style={{ ...getQuestionCard(isDarkMode), borderColor }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "8px",
                      }}
                    >
                      <p
                        style={{
                          fontSize: "14px",
                          fontWeight: 500,
                          marginBottom: "6px",
                          color: isDarkMode ? "#e5e7eb" : "#111827",
                        }}
                      >
                        {renderMath(q.question)}
                      </p>
                      {submitted && (
                        <span
                          style={{
                            fontSize: "11px",
                            padding: "2px 8px",
                            borderRadius: "999px",
                            background: isCorrect ? "#dcfce7" : "#fee2e2",
                            color: isCorrect ? "#166534" : "#b91c1c",
                            alignSelf: "flex-start",
                          }}
                        >
                          {isCorrect ? "Correct" : "Incorrect"}
                        </span>
                      )}
                    </div>

                    {/* choices or free response */}
                    {q.choices && q.choices.length > 0 ? (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                        }}
                      >
                        {q.choices.map((choice, idx) => (
                          <label
                            key={idx}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              fontSize: "13px",
                              cursor: submitted ? "default" : "pointer",
                              color: isDarkMode ? "#e5e7eb" : "#111827",
                            }}
                          >
                            <input
                              type="radio"
                              name={`q-${q.id}`}
                              value={choice}
                              disabled={submitted}
                              checked={userAnswer === choice}
                              onChange={() => handleChoiceChange(q.id, choice)}
                            />
                            <span style={{ display: "inline-block" }}>{renderMath(choice)}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <input
                        type="text"
                        style={{ ...inputStyle, marginTop: "4px" }}
                        value={userAnswer || ""}
                        disabled={submitted}
                        onChange={(e) =>
                          handleChoiceChange(q.id, e.target.value)
                        }
                      />
                    )}

                    {/* explanation after submit */}
                    {submitted && (
                      <div
                        style={{
                          marginTop: "6px",
                          fontSize: "12px",
                          color: isDarkMode ? "#e5e7eb" : "#111827",
                        }}
                      >
                        <p>
                          <strong>Correct answer:</strong>{" "}
                          {renderMath(getCorrectAnswerInfo(q).display)}
                        </p>
                        {q.explanation && (
                          <p style={{ marginTop: "3px" }}>
                            <strong>Explanation:</strong> {renderMath(q.explanation)}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          {!submitted && testData.questions?.length > 0 && (
            <div style={{ marginTop: "10px", textAlign: "right" }}>
              <button
                type="button"
                onClick={handleSubmitAnswers}
                style={secondaryButton}
              >
                Submit Answers
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
