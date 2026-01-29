// src/pages/Review.jsx
import { useEffect, useMemo, useState } from "react";
import { InlineMath, BlockMath } from "react-katex";
import {
  listFlashcardSets,
  getFlashcardSet,
  deleteFlashcardSet,
} from "../api/manual";

const SAVED_TESTS_KEY = "gradeify_saved_practice_tests_v1";

/* -------------------- LocalStorage tests helpers (unchanged) -------------------- */
function loadSavedTests() {
  try {
    const raw = localStorage.getItem(SAVED_TESTS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function deleteSavedTest(id) {
  const all = loadSavedTests();
  const next = all.filter((t) => t.id !== id);
  localStorage.setItem(SAVED_TESTS_KEY, JSON.stringify(next));
  return next;
}

/* -------------------- Math renderer (unchanged) -------------------- */
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

export default function Review() {
  const [tab, setTab] = useState("tests"); // "tests" | "flashcards"

  /* -------------------- Tests state (existing) -------------------- */
  const [tests, setTests] = useState([]);
  const [selectedTestId, setSelectedTestId] = useState(null);

  /* -------------------- Flashcards state (DB) -------------------- */
  const [sets, setSets] = useState([]);
  const [selectedSetId, setSelectedSetId] = useState(null);
  const [selectedSet, setSelectedSet] = useState(null); // { set, cards }
  const [fcLoading, setFcLoading] = useState(false);
  const [fcError, setFcError] = useState("");

  useEffect(() => {
    // load tests once
    const t = loadSavedTests();
    setTests(t);
    if (t.length && !selectedTestId) setSelectedTestId(t[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // load flashcard sets when switching to flashcards tab
  useEffect(() => {
    if (tab !== "flashcards") return;

    (async () => {
      setFcError("");
      setFcLoading(true);
      try {
        const data = await listFlashcardSets(); // { ok, sets }
        const arr = Array.isArray(data.sets) ? data.sets : [];
        setSets(arr);
        if (arr.length && !selectedSetId) setSelectedSetId(arr[0].id);
      } catch (e) {
        setFcError(e.message || "Failed to load flashcard sets");
      } finally {
        setFcLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // load selected set detail
  useEffect(() => {
    if (tab !== "flashcards") return;
    if (!selectedSetId) return;

    (async () => {
      setFcError("");
      setFcLoading(true);
      try {
        const data = await getFlashcardSet(selectedSetId); // { ok, set, cards }
        setSelectedSet(data);
      } catch (e) {
        setFcError(e.message || "Failed to load flashcard set");
      } finally {
        setFcLoading(false);
      }
    })();
  }, [tab, selectedSetId]);

  const selectedTest = useMemo(
    () => tests.find((t) => t.id === selectedTestId) || null,
    [tests, selectedTestId]
  );

  const handleDeleteTest = (id) => {
    const next = deleteSavedTest(id);
    setTests(next);
    if (selectedTestId === id) setSelectedTestId(next[0]?.id ?? null);
  };

  const handleDeleteSet = async (id) => {
    try {
      await deleteFlashcardSet(id);
      const next = sets.filter((s) => s.id !== id);
      setSets(next);

      if (selectedSetId === id) {
        const nextId = next[0]?.id || null;
        setSelectedSetId(nextId);
        setSelectedSet(null);
      }
    } catch (e) {
      setFcError(e.message || "Failed to delete set");
    }
  };

  const formatDate = (iso) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const tabBtn = (active) => ({
    border: active ? "2px solid #4f46e5" : "1px solid #e5e7eb",
    background: active ? "#eef2ff" : "white",
    borderRadius: 999,
    padding: "8px 12px",
    fontWeight: 800,
    cursor: "pointer",
    fontSize: 13,
  });

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <button type="button" onClick={() => setTab("tests")} style={tabBtn(tab === "tests")}>
          Tests
        </button>
        <button type="button" onClick={() => setTab("flashcards")} style={tabBtn(tab === "flashcards")}>
          Flashcards
        </button>
      </div>

      {tab === "tests" ? (
        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: "16px" }}>
          {/* Left: saved tests list */}
          <section
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: "16px",
              padding: "14px",
              background: "white",
            }}
          >
            <h2 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "10px" }}>Saved Tests</h2>

            {tests.length === 0 ? (
              <p style={{ fontSize: "13px", color: "#6b7280" }}>
                No saved tests yet. Take a practice test and click “Save Test” after submitting.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {tests.map((t) => {
                  const active = t.id === selectedTestId;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTestId(t.id)}
                      style={{
                        textAlign: "left",
                        border: active ? "2px solid #4f46e5" : "1px solid #e5e7eb",
                        borderRadius: "14px",
                        padding: "10px",
                        background: active ? "#eef2ff" : "white",
                        cursor: "pointer",
                      }}
                      type="button"
                    >
                      <div style={{ fontWeight: 700, fontSize: "13px", marginBottom: "2px" }}>
                        {t?.meta?.subject || "Untitled"} — {t?.meta?.topic || ""}
                      </div>
                      <div style={{ fontSize: "12px", color: "#374151" }}>
                        Score: {t?.score?.correct}/{t?.score?.total} ({t?.score?.percent}%)
                      </div>
                      <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>
                        {formatDate(t.createdAt)}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Right: selected test detail */}
          <section
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: "16px",
              padding: "14px",
              background: "white",
            }}
          >
            {!selectedTest ? (
              <div style={{ fontSize: "13px", color: "#6b7280" }}>Select a test to review.</div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                  <div>
                    <h2 style={{ fontSize: "16px", fontWeight: 800, marginBottom: "4px" }}>
                      {selectedTest?.meta?.subject} — {selectedTest?.meta?.topic} ({selectedTest?.meta?.difficulty})
                    </h2>
                    <div style={{ fontSize: "13px", color: "#374151" }}>
                      Score: {selectedTest?.score?.correct}/{selectedTest?.score?.total} ({selectedTest?.score?.percent}%)
                    </div>
                    <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>
                      Saved: {formatDate(selectedTest.createdAt)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeleteTest(selectedTest.id)}
                    style={{
                      border: "1px solid #fecaca",
                      background: "#fee2e2",
                      color: "#b91c1c",
                      padding: "8px 12px",
                      borderRadius: "999px",
                      cursor: "pointer",
                      height: "36px",
                      fontWeight: 700,
                      fontSize: "13px",
                    }}
                  >
                    Delete
                  </button>
                </div>

                <hr style={{ margin: "12px 0", border: "none", borderTop: "1px solid #e5e7eb" }} />

                <ol style={{ paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "10px" }}>
                  {selectedTest.questions.map((q, idx) => (
                    <li key={q.id || idx}>
                      <div
                        style={{
                          border: `1px solid ${q.isCorrect ? "#86efac" : "#fca5a5"}`,
                          background: q.isCorrect ? "#ecfdf5" : "#fef2f2",
                          borderRadius: "14px",
                          padding: "12px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                          <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>
                            {renderMath(q.question)}
                          </div>
                          <div
                            style={{
                              fontSize: "12px",
                              fontWeight: 800,
                              color: q.isCorrect ? "#166534" : "#b91c1c",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {q.isCorrect ? "Correct" : "Incorrect"}
                          </div>
                        </div>

                        <div style={{ marginTop: "8px", fontSize: "13px", color: "#111827" }}>
                          <div>
                            <strong>Your answer:</strong>{" "}
                            {q.userAnswer ? renderMath(q.userAnswer) : <span style={{ color: "#6b7280" }}>No answer</span>}
                          </div>
                          <div style={{ marginTop: "4px" }}>
                            <strong>Correct answer:</strong> {renderMath(q.correctDisplay)}
                          </div>

                          {q.explanation ? (
                            <div style={{ marginTop: "6px" }}>
                              <strong>Explanation:</strong> {renderMath(q.explanation)}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </section>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: "16px" }}>
          {/* Left: flashcard sets */}
          <section
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: "16px",
              padding: "14px",
              background: "white",
            }}
          >
            <h2 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "10px" }}>Saved Flashcards</h2>

            {fcLoading && sets.length === 0 ? (
              <p style={{ fontSize: 13, color: "#6b7280" }}>Loading…</p>
            ) : fcError ? (
              <p style={{ fontSize: 13, color: "#b91c1c" }}>{fcError}</p>
            ) : sets.length === 0 ? (
              <p style={{ fontSize: "13px", color: "#6b7280" }}>
                No saved flashcards yet. Generate flashcards in Learn and click “Save to Review”.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {sets.map((s) => {
                  const active = s.id === selectedSetId;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSelectedSetId(s.id)}
                      style={{
                        textAlign: "left",
                        border: active ? "2px solid #4f46e5" : "1px solid #e5e7eb",
                        borderRadius: "14px",
                        padding: "10px",
                        background: active ? "#eef2ff" : "white",
                        cursor: "pointer",
                      }}
                      type="button"
                    >
                      <div style={{ fontWeight: 700, fontSize: "13px", marginBottom: "2px" }}>
                        {s.subject} — {s.topic}
                      </div>
                      <div style={{ fontSize: "12px", color: "#6b7280" }}>
                        {formatDate(s.created_at)}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Right: selected flashcard set */}
          <section
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: "16px",
              padding: "14px",
              background: "white",
            }}
          >
            {fcLoading && !selectedSet ? (
              <p style={{ fontSize: 13, color: "#6b7280" }}>Loading…</p>
            ) : fcError ? (
              <p style={{ fontSize: 13, color: "#b91c1c" }}>{fcError}</p>
            ) : !selectedSet?.set ? (
              <div style={{ fontSize: 13, color: "#6b7280" }}>Select a flashcard set to review.</div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>
                      {selectedSet.set.subject} — {selectedSet.set.topic}
                    </h2>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      Saved: {formatDate(selectedSet.set.created_at)}
                    </div>
                    <div style={{ fontSize: 12, color: "#374151", marginTop: 8 }}>
                      <strong>Prompt:</strong> {selectedSet.set.prompt}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeleteSet(selectedSet.set.id)}
                    style={{
                      border: "1px solid #fecaca",
                      background: "#fee2e2",
                      color: "#b91c1c",
                      padding: "8px 12px",
                      borderRadius: "999px",
                      cursor: "pointer",
                      height: "36px",
                      fontWeight: 700,
                      fontSize: "13px",
                    }}
                  >
                    Delete
                  </button>
                </div>

                <hr style={{ margin: "12px 0", border: "none", borderTop: "1px solid #e5e7eb" }} />

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {(selectedSet.cards || []).map((c, idx) => (
                    <div
                      key={idx}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 14,
                        padding: 12,
                      }}
                    >
                      <div style={{ fontWeight: 800, fontSize: 14 }}>
                        {renderMath(c.term)}
                      </div>
                      <div style={{ marginTop: 6, color: "#374151", fontSize: 13 }}>
                        {renderMath(c.definition)}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
