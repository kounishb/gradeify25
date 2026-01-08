const API_BASE = (
  import.meta?.env?.VITE_API_URL || import.meta?.env?.VITE_API_BASE || ""
).trim().replace(/\/$/, "") || "http://localhost:3001";



async function request(path, { method = "GET", body, headers, timeoutMs = 10000 } = {}) {
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
    const resClone = res.clone(); // ← important: clone for fallback parse

    let data;
    try {
      data = await res.json();
    } catch {
      const raw = await resClone.text();
      data = { raw };
    }

    if (!res.ok) {
      const msg = data?.error || data?.message || data?.raw || `HTTP ${res.status}`;
      throw new Error(String(msg));
    }
    return data;
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Request timed out. Please try again.");
    throw new Error(err?.message || "Network error");
  } finally {
    clearTimeout(timer);
  }
}

export const me = () => request("/auth/me");
export const register = (payload) => request("/auth/register", { method: "POST", body: payload });
export const login = (payload) => request("/auth/login", { method: "POST", body: payload });
export const logout = () => request("/auth/logout", { method: "POST" });

export const listClasses = () => request("/me/classes");
export const createClass = (payload) => request("/me/classes", { method: "POST", body: payload });
export const updateClass = (id, payload) => request(`/me/classes/${id}`, { method: "PUT", body: payload });
export const deleteClass = (id) => request(`/me/classes/${id}`, { method: "DELETE" });

export const listGrades = (classId) => request(`/me/classes/${classId}/grades`);
export const createGrade = (classId, payload) => request(`/me/classes/${classId}/grades`, { method: "POST", body: payload });
export const updateGrade = (id, payload) => request(`/me/grades/${id}`, { method: "PUT", body: payload });
export const deleteGrade = (id) => request(`/me/grades/${id}`, { method: "DELETE" });

// … existing request(), auth & classes & grades …

export const listCategories = (classId) =>
  request(`/me/classes/${classId}/categories`);

export const createCategory = (classId, payload) =>
  request(`/me/classes/${classId}/categories`, { method: "POST", body: payload });

export const updateCategory = (id, payload) =>
  request(`/me/categories/${id}`, { method: "PUT", body: payload });

export const deleteCategory = (id) =>
  request(`/me/categories/${id}`, { method: "DELETE" });

export const getSummary = (classId) =>
  request(`/me/classes/${classId}/summary`);
