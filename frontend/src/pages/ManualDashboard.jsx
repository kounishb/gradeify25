// src/pages/ManualDashboard.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  me,
  logout,
  listClasses,
  createClass,
  deleteClass,
  listGrades,
  createGrade,
  deleteGrade,
  listCategories,
  createCategory,
  deleteCategory,
  getSummary,
  updateGrade,
} from "../api/manual";
import "./ui.css";
import BsdStudentVueImport from "../components/BsdStudentVueImport.jsx";

/* ------------ Helpers ------------ */

function percentToLetter(pct) {
  if (!Number.isFinite(pct)) return "";
  if (pct >= 90) return "A";
  if (pct >= 80) return "B";
  if (pct >= 70) return "C";
  if (pct >= 60) return "D";
  return "F";
}

function percentToGpa(pct) {
  if (pct >= 90) return 4.0;
  if (pct >= 80) return 3.0;
  if (pct >= 70) return 2.0;
  if (pct >= 60) return 1.0;
  return 0.0;
}

function inferCategoryFromTitle(title) {
  if (!title) return null;
  const t = title.toLowerCase();

  if (t.includes("quiz")) return "Quizzes";
  if (t.includes("test") || t.includes("exam")) return "Tests";
  if (t.includes("hw") || t.includes("homework")) return "Homework";
  if (t.includes("project") || t.includes("lab") || t.includes("report"))
    return "Projects";
  if (
    t.includes("packet") ||
    t.includes("worksheet") ||
    t.includes("in class") ||
    t.includes("classwork")
  ) {
    return "Classwork";
  }
  if (t.includes("slide") || t.includes("presentation"))
    return "Presentations";

  return null; // fallback: no auto category match
}

/* ------------ Component ------------ */

export default function ManualDashboard() {
  const nav = useNavigate();

  const [user, setUser] = useState(null);
  const [classes, setClasses] = useState([]);
  const [sel, setSel] = useState(null);

  const [grades, setGrades] = useState([]);
  const [categories, setCategories] = useState([]);
  const [summary, setSummary] = useState(null);

  const [gpa, setGpa] = useState(null);

  // forms
  const [cn, setCn] = useState("");
  const [cp, setCp] = useState("");
  const [ct, setCt] = useState("");

  const [gt, setGt] = useState("");
  const [ge, setGe] = useState("");
  const [gp, setGp] = useState("");
  const [gcat, setGcat] = useState("");

  const [catName, setCatName] = useState("");
  const [catWeight, setCatWeight] = useState("");

  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  const [editingGrade, setEditingGrade] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editEarned, setEditEarned] = useState("");
  const [editPossible, setEditPossible] = useState("");
  const [editCategory, setEditCategory] = useState("");

  /* ------------ Editing helpers ------------ */

  function startEdit(grade) {
    setEditingGrade(grade);
    setEditTitle(grade.title);
    setEditEarned(grade.points_earned);
    setEditPossible(grade.points_possible);
    setEditCategory(grade.category || "");
  }

  async function onSaveEdit(id) {
    await updateGrade(id, {
      title: editTitle.trim(),
      points_earned: Number(editEarned),
      points_possible: Number(editPossible),
      category: editCategory.trim() || null,
    });
    setEditingGrade(null);
    const cid = currentClassId();
    await refreshClassData(cid);
  }

  /* ------------ GPA recompute ------------ */

  async function recomputeGpa(optionalClasses) {
    const classList = optionalClasses || classes;

    if (!classList.length) {
      setGpa(null);
      return;
    }

    let totalGpa = 0;
    let count = 0;

    for (const c of classList) {
      try {
        const sum = await getSummary(c.id);
        const percent = sum?.overallPercent;

        if (typeof percent === "number" && Number.isFinite(percent)) {
          const g = percentToGpa(percent);
          totalGpa += g;
          count += 1;
        }
      } catch (e) {
        console.error("Failed to get summary for class", c.id, e);
      }
    }

    setGpa(count ? totalGpa / count : null);
  }

  function currentClassId() {
    return sel?.id || classes[0]?.id || null;
  }

  /* ------------ Initial load: user + classes ------------ */

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const u = await me();

        if (!u?.user) {
          nav("/login", { replace: true });
          return;
        }

        setUser(u.user);
        const cls = await listClasses();
        const classList = cls.classes || [];
        setClasses(classList);
        await recomputeGpa(classList);
      } catch (e) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [nav]);

  /* ------------ Load class data (grades + categories + summary) ------------ */

  async function refreshClassData(classId) {
    if (!classId) return;
    const [gr, cat, sum] = await Promise.all([
      listGrades(classId),
      listCategories(classId),
      getSummary(classId),
    ]);
    setGrades(gr.grades || []);
    setCategories(cat.categories || []);
    setSummary(sum || null);
  }

  useEffect(() => {
    const id = currentClassId();
    if (id) refreshClassData(id).catch((e) => setErr(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes, sel?.id]);

  /* ------------ Class handlers ------------ */

  async function onAddClass(e) {
    e.preventDefault();
    setErr(null);
    const res = await createClass({
      name: cn.trim(),
      period: cp ? Number(cp) : null,
      teacher: ct.trim() || null,
    });
    const cls = await listClasses();
    const classList = cls.classes || [];
    setClasses(classList);
    setSel(res.class);
    await recomputeGpa(classList);
  }

  async function onRemoveClass(id) {
    await deleteClass(id);
    const cls = await listClasses();
    const classList = cls.classes || [];
    setClasses(classList);
    setSel(null);
    setGrades([]);
    setCategories([]);
    setSummary(null);
    await recomputeGpa(classList);
  }

  /* ------------ Grade handlers ------------ */

  async function onAddGrade(e) {
    e.preventDefault();
    setErr(null);

    const id = currentClassId();
    if (!id) return;

    const earnedNum = Number(ge);
    const possibleNum = Number(gp);

    if (!Number.isFinite(earnedNum) || !Number.isFinite(possibleNum)) {
      setErr("Earned and possible points must be valid numbers.");
      return;
    }

    await createGrade(id, {
      title: gt.trim(),
      points_earned: earnedNum,
      points_possible: possibleNum,
      category: gcat.trim() || null,
    });

    setGt("");
    setGe("");
    setGp("");
    setGcat("");
    await refreshClassData(id);
    await recomputeGpa();
  }

  // Called by BsdStudentVueImport
  async function handleImportedGrades(rows) {
  const id = currentClassId();
  if (!id || !rows.length) return;

  setErr(null);

  for (const row of rows) {
    // Expect row.category to already match StudentVUE's category string,
    // and you have created categories with the same names in Gradeify.
    let categoryName = null;

    if (row.category) {
      const match = categories.find(
        (c) => c.name.toLowerCase() === row.category.toLowerCase()
      );
      if (match) {
        categoryName = match.name;
      }
    }

    await createGrade(id, {
      title: row.title,
      points_earned: row.points_earned,
      points_possible: row.points_possible,
      category: categoryName, // null if there's no matching category yet
    });
  }

  await refreshClassData(id);
  await recomputeGpa();
}

  async function onRemoveGrade(id) {
    await deleteGrade(id);
    const cid = currentClassId();
    if (cid) await refreshClassData(cid);
    await recomputeGpa();
  }

  async function onClearAllGrades() {
  const id = currentClassId();
  if (!id) return;
  if (!grades.length) return;

  const ok = window.confirm(
    "Are you sure you want to delete ALL grades for this class? This cannot be undone."
  );
  if (!ok) return;

  setErr(null);

  // Delete each grade for the selected class
  for (const g of grades) {
    try {
      await deleteGrade(g.id);
    } catch (e) {
      console.error("Failed to delete grade", g.id, e);
    }
  }

  await refreshClassData(id);
  await recomputeGpa();
  }

  /* ------------ Category handlers ------------ */

  async function onAddCategory(e) {
    e.preventDefault();
    setErr(null);

    const id = currentClassId();
    if (!id) return;

    const w = Number(catWeight);
    if (!Number.isFinite(w)) {
      setErr("Weight must be a valid number.");
      return;
    }

    await createCategory(id, {
      name: catName.trim(),
      weight_percent: w,
    });

    setCatName("");
    setCatWeight("");
    await refreshClassData(id);
    await recomputeGpa();
  }

  async function onRemoveCategory(id) {
    await deleteCategory(id);
    const cid = currentClassId();
    if (cid) await refreshClassData(cid);
    await recomputeGpa();
  }

  /* ------------ Auth ------------ */

  async function onLogout() {
    await logout();
    nav("/login", { replace: true });
  }

  /* ------------ Derived values ------------ */

  const cid = currentClassId();
  const selectedClass = cid && classes.find((c) => c.id === cid);
  const sumWeights = summary?.sumWeights || 0;
  const overall = summary?.overallPercent;
  const overallLetter =
    overall != null && Number.isFinite(overall)
      ? percentToLetter(overall)
      : null;

  /* ------------ Render ------------ */

  if (loading) return <div className="page">Loading…</div>;

  return (
    <div className="page">

      {err && <div className="alert">{err}</div>}

      {/* Classes + GPA */}
      <section className="card">
        <div className="card-title">Your Classes</div>
        <div className="pills">
          {classes.map((c) => (
            <button
              key={c.id}
              onClick={() => setSel(c)}
              className={`pill ${sel?.id === c.id ? "active" : ""}`}
              title={c.teacher || ""}
            >
              {c.period ? `${c.period}. ` : ""}
              {c.name}
            </button>
          ))}
        </div>

        <form onSubmit={onAddClass} className="grid4 mt">
          <input
            className="input"
            placeholder="Class name"
            value={cn}
            onChange={(e) => setCn(e.target.value)}
            required
          />
          <input
            className="input"
            placeholder="Period"
            inputMode="numeric"
            value={cp}
            onChange={(e) => setCp(e.target.value)}
          />
          <input
            className="input"
            placeholder="Teacher (optional)"
            value={ct}
            onChange={(e) => setCt(e.target.value)}
          />
          <button className="btn">Add class</button>
        </form>

        {selectedClass && (
          <button
            className="link-danger mt"
            onClick={() => onRemoveClass(selectedClass.id)}
          >
            Remove selected class
          </button>
        )}

        {gpa != null && (
          <div className="mt">
            GPA: <b>{gpa.toFixed(2)}</b> (4.0 scale)
          </div>
        )}
      </section>

      {/* Weights + Overall Grade */}
      <div className="grid2">
        <section className="card">
          <div className="card-title">
            {selectedClass
              ? `Weights for: ${selectedClass.name}`
              : "Add a class to begin"}
          </div>

          {selectedClass && (
            <>
              <div className="weights">
                <div className="weights-list">
                  {categories.length === 0 ? (
                    <div className="muted">
                      No categories yet — add some below (They can sum to 100
                      later).
                    </div>
                  ) : (
                    categories.map((c) => (
                      <div key={c.id} className="row">
                        <div className="grow">{c.name}</div>
                        <div className="muted">{c.weight_percent}%</div>
                        <button
                          className="link-danger"
                          onClick={() => onRemoveCategory(c.id)}
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="progress">
                  <div
                    className="progress-bar"
                    style={{ width: `${Math.min(sumWeights, 100)}%` }}
                  />
                </div>
                <div
                  className={`muted ${
                    sumWeights === 100 ? "ok" : ""
                  }`}
                >
                  Total weights: {sumWeights}%{" "}
                  {sumWeights !== 100 &&
                    "(They’ll be normalized until you hit 100%)"}
                </div>
              </div>

              <form onSubmit={onAddCategory} className="grid3 mt">
                <input
                  className="input"
                  placeholder="Category name (e.g., Homework)"
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  required
                />
                <input
                  className="input"
                  placeholder="Weight %"
                  inputMode="decimal"
                  value={catWeight}
                  onChange={(e) => setCatWeight(e.target.value)}
                  required
                />
                <button className="btn">Add category</button>
              </form>
            </>
          )}
        </section>

        <section className="card">
          <div className="card-title">
            {selectedClass
              ? `Overall Grade: ${
                  overall != null
                    ? `${overall.toFixed(1)}%${
                        overallLetter ? ` (${overallLetter})` : ""
                      }`
                    : "—"
                }`
              : "Overall Grade"}
          </div>

          {summary?.categories?.length ? (
            <div className="cat-table">
              <div className="thead">
                <div>Category</div>
                <div>Weight</div>
                <div>Earned</div>
                <div>Possible</div>
                <div>%</div>
              </div>
              {summary.categories.map((c, i) => (
                <div key={`${c.name}-${i}`} className="trow">
                  <div>{c.name}</div>
                  <div>{c.weight_percent}%</div>
                  <div>{c.earned}</div>
                  <div>{c.possible}</div>
                  <div>
                    {c.percent != null
                      ? c.percent.toFixed(1) + "%"
                      : "—"}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted">
              Add categories and grades to see an overall.
            </div>
          )}
        </section>
      </div>

      {/* Grades */}
      <section className="card">
        <div className="card-title">
          {selectedClass
            ? `Grades for: ${selectedClass.name}`
            : "Add a class to begin"}
        </div>

        {selectedClass && (
          <>
            <form onSubmit={onAddGrade} className="grid5">
              <input
                className="input"
                placeholder="Assignment title"
                value={gt}
                onChange={(e) => setGt(e.target.value)}
                required
              />
              <input
                className="input"
                placeholder="Earned"
                value={ge}
                onChange={(e) => setGe(e.target.value)}
                inputMode="decimal"
                required
              />
              <input
                className="input"
                placeholder="Possible"
                value={gp}
                onChange={(e) => setGp(e.target.value)}
                inputMode="decimal"
                required
              />
              <select
                className="input"
                value={gcat}
                onChange={(e) => setGcat(e.target.value)}
              >
                <option value="">— Category —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button className="btn">Add grade</button>
            </form>

            {/* BSD StudentVUE import (per selected class) */}
            <BsdStudentVueImport onImported={handleImportedGrades} />

            {grades.length > 0 && (
              <button
                type="button"
                className="link-danger mt"
                onClick={onClearAllGrades}
              >
                Clear all grades for this class
              </button>
            )}

            <div className="table mt">
              <div className="thead">
                <div>Title</div>
                <div>Earned</div>
                <div>Possible</div>
                <div>%</div>
                <div>Category</div>
                <div></div>
              </div>

              {grades.length === 0 ? (
                <div className="muted mt">No grades yet.</div>
              ) : (
                grades.map((g) => {
                  const pct =
                    g.points_possible > 0
                      ? (g.points_earned / g.points_possible) * 100
                      : 0;
                  const isEditing = editingGrade?.id === g.id;

                  return (
                    <div key={g.id} className="trow">
                      {isEditing ? (
                        <>
                          <input
                            className="input small"
                            value={editTitle}
                            onChange={(e) =>
                              setEditTitle(e.target.value)
                            }
                          />
                          <input
                            className="input small"
                            value={editEarned}
                            onChange={(e) =>
                              setEditEarned(e.target.value)
                            }
                            inputMode="decimal"
                          />
                          <input
                            className="input small"
                            value={editPossible}
                            onChange={(e) =>
                              setEditPossible(e.target.value)
                            }
                            inputMode="decimal"
                          />
                          <select
                            className="input small"
                            value={editCategory}
                            onChange={(e) =>
                              setEditCategory(e.target.value)
                            }
                          >
                            <option value="">— Category —</option>
                            {categories.map((c) => (
                              <option key={c.id} value={c.name}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                          <div className="edit-remove">
                            <button
                              className="link"
                              onClick={() => onSaveEdit(g.id)}
                            >
                              Save
                            </button>
                            <button
                              className="link-danger"
                              onClick={() =>
                                setEditingGrade(null)
                              }
                            >
                              Cancel
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>{g.title}</div>
                          <div>{g.points_earned}</div>
                          <div>{g.points_possible}</div>
                          <div>{pct.toFixed(1)}%</div>
                          <div>{g.category || "—"}</div>
                          <div className="edit-remove">
                            <button
                              className="link"
                              onClick={() => startEdit(g)}
                            >
                              Edit
                            </button>
                            <button
                              className="link-danger"
                              onClick={() =>
                                onRemoveGrade(g.id)
                              }
                            >
                              Remove
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
