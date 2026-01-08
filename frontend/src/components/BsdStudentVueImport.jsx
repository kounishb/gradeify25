// src/components/BsdStudentVueImport.jsx
import { useState } from "react";
import "../pages/ui.css";

function parseBsdStudentVueContentView(raw) {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const result = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Look for the "Category | XX.XX points" line
    if (!line.includes("|") || !/points/i.test(line)) continue;

    // category is before the "|"
    const [categoryPart] = line.split("|");
    const category = categoryPart.trim();

    // possible points from "... | 10.00 points"
    const ptsMatch = line.match(/\|\s*([\d.]+)\s*points/i);
    const possible = ptsMatch ? parseFloat(ptsMatch[1]) : null;

    // find title as the nearest previous non-junk line
    let title = null;
    for (let j = i - 1; j >= 0; j--) {
      const prev = lines[j];

      // skip obvious non-title lines
      if (/^week\s+/i.test(prev)) continue;
      if (/items\)/i.test(prev)) continue;
      if (/^\d+(\.\d+)?%$/.test(prev)) continue; // 90.0%
      if (/^\d{1,2}$/.test(prev)) continue; // "19" (day)
      if (/^[A-Za-z]{3}$/i.test(prev)) continue; // "Sep"
      if (/^[A-Za-z]{3}\s+\d{1,2}$/.test(prev)) continue; // "Sep 19"

      title = prev;
      break;
    }

    // earned points line is usually right after category line
    const earnedLine = lines[i + 1] || "";
    const earned = /^[\d.]+$/.test(earnedLine)
      ? parseFloat(earnedLine)
      : null;

    if (
      title &&
      category &&
      possible != null &&
      Number.isFinite(possible) &&
      earned != null &&
      Number.isFinite(earned)
    ) {
      result.push({
        title,
        category, // EXACT string from StudentVUE
        points_earned: earned,
        points_possible: possible,
      });
    }
  }

  return result;
}

export default function BsdStudentVueImport({ onImported }) {
  const [importText, setImportText] = useState("");
  const [preview, setPreview] = useState([]);
  const [err, setErr] = useState("");

  function handleParse() {
    setErr("");
    const rows = parseBsdStudentVueContentView(importText);

    if (!rows.length) {
      setPreview([]);
      setErr(
        "Couldn't detect any assignments. Make sure you pasted from the *Content View* in StudentVUE for this class."
      );
      return;
    }

    setPreview(rows);
  }

  async function handleCreate() {
    if (!preview.length) return;
    setErr("");
    await onImported(preview);
    setImportText("");
    setPreview([]);
  }

  return (
    <div className="mt">
      <details>
        <summary className="link">
          Import from StudentVUE (BSD Course Content View)
        </summary>
        <div className="mt">
          <p className="muted">
            In StudentVUE, open this class&apos;s <b>Gradebook Course Content</b> (the
            view that shows lines like &quot;Class assessment/in class work |
            10.00 points&quot;), select the assignments, copy, and paste the
            text below. Must have included categories and weights exactly the same as StudentVUE.
          </p>

          <textarea
            className="input"
            style={{ width: "100%", minHeight: 140 }}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="Paste your BSD StudentVUE Content View text here..."
          />

          {err && <div className="alert mt">{err}</div>}

          <button className="btn mt" type="button" onClick={handleParse}>
            Preview assignments
          </button>

          {preview.length > 0 && (
            <div className="mt">
              <div className="thead">
                <div>Title</div>
                <div>Category</div>
                <div>Earned</div>
                <div>Possible</div>
              </div>
              {preview.map((row, i) => (
                <div key={i} className="trow">
                  <div>{row.title}</div>
                  <div>{row.category}</div>
                  <div>{row.points_earned}</div>
                  <div>{row.points_possible}</div>
                </div>
              ))}

              <button
                className="btn mt"
                type="button"
                onClick={handleCreate}
              >
                Create {preview.length} assignments
              </button>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
