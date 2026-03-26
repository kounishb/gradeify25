// src/api/manual.js

// 1) Base URL resolution (bulletproof)
const fromEnv = (
  import.meta?.env?.VITE_API_URL ||
  import.meta?.env?.VITE_API_BASE ||
  ""
)
  .trim()
  .replace(/\/$/, "");

// Never fall back to localhost in production builds
const API_BASE = fromEnv || (import.meta.env.DEV ? "http://localhost:3001" : "");

console.log("API_BASE:", API_BASE);
console.log("VITE_API_URL:", import.meta.env.VITE_API_URL);
console.log("VITE_API_BASE:", import.meta.env.VITE_API_BASE);

// 2) Core request helper
async function request(
  path,
  { method = "GET", body, headers, timeoutMs = 60000 } = {}
) {
  if (!API_BASE) {
    // This prevents silent failures in production if env vars are missing
    throw new Error(
      "API base URL is not set. Set VITE_API_URL (or VITE_API_BASE) in your environment."
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const opts = {
    method,
    credentials: "include",
    signal: controller.signal,
    headers: headers || {},
  };

  if (body !== undefined) {
    opts.body = typeof body === "string" ? body : JSON.stringify(body);
    if (!opts.headers["Content-Type"]) opts.headers["Content-Type"] = "application/json";
  }

  try {
    const res = await fetch(`${API_BASE}${path}`, opts);
    const resClone = res.clone();

    let data;
    try {
      data = await res.json();
    } catch {
      const raw = await resClone.text();
      data = { raw };
    }

    if (!res.ok) {
      const msg =
        data?.error ||
        data?.message ||
        data?.raw ||
        `HTTP ${res.status}`;
      throw new Error(String(msg));
    }

    return data;
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    throw new Error(err?.message || "Network error");
  } finally {
    clearTimeout(timer);
  }
}

// 3) Auth
export const me = () => request("/auth/me");
export const register = (payload) => request("/auth/register", { method: "POST", body: payload });
export const login = (payload) => request("/auth/login", { method: "POST", body: payload });
export const logout = () => request("/auth/logout", { method: "POST" });

// 4) Classes / Grades
export const listClasses = () => request("/me/classes");
export const createClass = (payload) => request("/me/classes", { method: "POST", body: payload });
export const updateClass = (id, payload) => request(`/me/classes/${id}`, { method: "PUT", body: payload });
export const deleteClass = (id) => request(`/me/classes/${id}`, { method: "DELETE" });

export const listGrades = (classId) => request(`/me/classes/${classId}/grades`);
export const createGrade = (classId, payload) =>
  request(`/me/classes/${classId}/grades`, { method: "POST", body: payload });
export const updateGrade = (id, payload) => request(`/me/grades/${id}`, { method: "PUT", body: payload });
export const deleteGrade = (id) => request(`/me/grades/${id}`, { method: "DELETE" });

// 5) Categories / Summary
export const listCategories = (classId) => request(`/me/classes/${classId}/categories`);
export const createCategory = (classId, payload) =>
  request(`/me/classes/${classId}/categories`, { method: "POST", body: payload });
export const updateCategory = (id, payload) => request(`/me/categories/${id}`, { method: "PUT", body: payload });
export const deleteCategory = (id) => request(`/me/categories/${id}`, { method: "DELETE" });

export const getSummary = (classId) => request(`/me/classes/${classId}/summary`);

// 6) AI: Practice test generator (existing)
export const generatePractice = (payload) =>
  request("/api/generate-practice", { method: "POST", body: payload });

// 7) AI: Flashcards generator (NEW)
// Your backend should implement POST /api/generate-flashcards
// returning: { cards: [{ term: "...", definition: "..." }, ...] }
export const generateFlashcards = ({ subject, topic, prompt, numCards }) =>
  request("/api/generate-flashcards", {
    method: "POST",
    body: { subject, topic, prompt, numCards },
  });

export const saveFlashcardSet = (payload) =>
  request("/me/flashcard-sets", { method: "POST", body: payload });

export const listFlashcardSets = () =>
  request("/me/flashcard-sets");

export const getFlashcardSet = (id) =>
  request(`/me/flashcard-sets/${id}`);

export const deleteFlashcardSet = (id) =>
  request(`/me/flashcard-sets/${id}`, { method: "DELETE" });

export const savePracticeTest = (payload) =>
  request("/me/practice-tests", {
    method: "POST",
    body: payload,
  });

export async function submitFeedback({ message, rating, username}) {
  const res = await fetch(`${API_BASE}/api/feedback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ message, rating, username }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Failed to submit feedback.");
  return data;
}

export async function getPublicFeedback() {
  const res = await fetch(`${API_BASE}/api/feedback/public`, {
    method: "GET",
    credentials: "include",
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Failed to load feedback.");
  return data;
}

/* 8) OPTIONAL for later (DB-backed saved practice tests)
export const savePracticeTest = (payload) =>
  request("/me/practice-tests", { method: "POST", body: payload });

export const listPracticeTests = () => request("/me/practice-tests");
export const getPracticeTest = (id) => request(`/me/practice-tests/${id}`);
export const deletePracticeTest = (id) => request(`/me/practice-tests/${id}`, { method: "DELETE" });
*/
