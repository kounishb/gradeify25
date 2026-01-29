// backend/index.js
import express from "express";
import cors from "cors";
import helmet from "helmet";
import session from "express-session";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import { supabase, newId } from "./db.js";
import OpenAI from "openai";
import StudentVue from "studentvue";
import jwt from "jsonwebtoken";


dotenv.config();


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const app = express();


/* ----------- ORIGIN NORMALIZATION + PROXY TRUST ----------- */
// Prefer CLIENT_ORIGINS (comma-separated). Keep CLIENT_ORIGIN as fallback.
const originEnv =
  process.env.CLIENT_ORIGINS ||
  process.env.CLIENT_ORIGIN ||
  "http://localhost:5173";

const allowedOrigins = new Set(
  originEnv
    .split(",")
    .map(s => s.trim().replace(/\/$/, ""))
    .filter(Boolean)
);

// Always include common local dev origins (safe)
[
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
].forEach(o => allowedOrigins.add(o));

// Render/production behind proxy: required for secure cookies
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);


/* ------------------------ HTTP + Socket.IO ------------------------ */
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (origin.startsWith("chrome-extension://")) return cb(null, true);
      if (allowedOrigins.has(origin.replace(/\/$/, ""))) return cb(null, true);
      return cb(new Error(`Socket.IO CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  },
});


/* -------------------------- middleware -------------------------- */
app.use(
  helmet({
    // dev-friendly; prevents CORP from blocking cross-origin XHR/fetch reads
    crossOriginResourcePolicy: { policy: "cross-origin" },

    // dev-friendly; COOP can mess with things like popups / OAuth / tooling
    crossOriginOpenerPolicy: false,

    // optional: CSP can be overkill during dev; uncomment if you still get weird blocking
    // contentSecurityPolicy: false,
  })
);

app.use(express.json());
const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (origin.startsWith("chrome-extension://")) return cb(null, true);

    const normalized = origin.replace(/\/$/, "");
    if (allowedOrigins.has(normalized)) return cb(null, true);

    return cb(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // IMPORTANT: same config as app.use


app.use(
  session({
    name: "gradeify.sid",
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: process.env.NODE_ENV === "production"
        ? { httpOnly: true, sameSite: "none", secure: true }
        : { httpOnly: true, sameSite: "lax", secure: false },
  })
);

function requireUser(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: "Not logged in" });
  next();
}

function requireUserOrToken(req, res, next) {
  if (req.session?.userId) return next();

  const auth = req.headers.authorization || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return res.status(401).json({ error: "Not logged in" });

  try {
    const secret = process.env.SESSION_SECRET || "dev-secret-change-me";
    const decoded = jwt.verify(m[1], secret);
    req.session = req.session || {};
    req.session.userId = decoded.userId;
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}


app.post("/auth/extension-token", requireUser, (req, res) => {
  const secret = process.env.SESSION_SECRET || "dev-secret-change-me";
  const token = jwt.sign({ userId: req.session.userId }, secret, { expiresIn: "7d" });
  res.json({ ok: true, token });
});



function buildPrompt({ subject, topic, difficulty, numQuestions }) {
  return `
You are an expert teacher creating practice tests.

Create a ${numQuestions}-question practice test for:
- Subject: ${subject}
- Topic: ${topic}
- Difficulty: ${difficulty}

Rules:
- Questions must be appropriate for ${subject} level.
- Format the response as pure JSON with this structure:

{
  "subject": "...",
  "topic": "...",
  "difficulty": "...",
  "questions": [
    {
      "id": 1,
      "question": "string",
      "choices": ["A", "B", "C", "D"],
      "answer": "string",
      "explanation": "string"
    }
  ]
}

If multiple choice is not appropriate, leave "choices" as an empty array [].
Do NOT include any text before or after the JSON.
`;
}

function buildFlashcardPrompt({ subject, topic, prompt, numCards }) {
  return `
You are an expert tutor creating study flashcards.

Create ${numCards} flashcards for:
- Subject: ${subject}
- Topic: ${topic}
- User prompt: ${prompt}

Rules:
- Return PURE JSON only, no markdown, no extra text.
- Format must be exactly:

{
  "cards": [
    { "term": "string", "definition": "string" }
  ]
}

- Terms should be short (1–8 words).
- Definitions should be clear and student-friendly (1–3 sentences max).
`;
}

function safeParseJSON(value) {
  // If the model already gave us an object, just use it
  if (value && typeof value === "object") {
    return value;
  }

  const text = String(value ?? "");

  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1) {
      const jsonSlice = text.slice(start, end + 1);
      return JSON.parse(jsonSlice);
    }
    throw new Error("Could not parse JSON");
  }
}

app.post("/api/generate-flashcards", async (req, res) => {
  try {
    const { subject, topic, prompt, numCards } = req.body;

    if (!subject || !topic || !prompt || !numCards) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const n = Math.max(5, Math.min(Number(numCards) || 10, 60));

    const fcPrompt = buildFlashcardPrompt({
      subject,
      topic,
      prompt,
      numCards: n,
    });

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: fcPrompt,
      text: {
        format: { type: "json_object" },
      },
    });

    const content = response.output?.[0]?.content || [];
    if (!content.length) throw new Error("No content returned from OpenAI");

    const rawText = content
      .map((part) => part.text || "")
      .join("\n")
      .trim();

    console.log("🧾 Flashcards raw text (truncated):", rawText.slice(0, 200));

    const data = safeParseJSON(rawText);

    if (!data || !Array.isArray(data.cards)) {
      throw new Error("AI response missing a valid cards array");
    }

    // clean + cap
    const cards = data.cards
      .map((c) => ({
        term: String(c.term ?? "").trim(),
        definition: String(c.definition ?? "").trim(),
      }))
      .filter((c) => c.term && c.definition)
      .slice(0, n);

    if (!cards.length) {
      throw new Error("No valid flashcards generated");
    }

    return res.json({ cards });
  } catch (err) {
    console.error("Error generating flashcards:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
});


app.post("/api/generate-practice", async (req, res) => {
  try {
    const { subject, topic, difficulty, numQuestions } = req.body;

    if (!subject || !topic || !difficulty || !numQuestions) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const prompt = buildPrompt({
      subject,
      topic,
      difficulty,
      numQuestions,
    });

       const response = await openai.responses.create({
          model: "gpt-4.1-mini",
          input: prompt,
          // ✅ JSON mode for Responses API
          text: {
            format: { type: "json_object" },
          },
        });

        // Response shape: response.output[0].content is an array of text chunks
        const content = response.output?.[0]?.content || [];

        if (!content.length) {
          throw new Error("No content returned from OpenAI");
        }

        // Join all text parts together
        const rawText = content
          .map((part) => part.text || "")
          .join("\n")
          .trim();

        console.log("🧾 Raw text from OpenAI (truncated):", rawText.slice(0, 200));

        const data = safeParseJSON(rawText);

        // basic sanity check
        if (!data || !Array.isArray(data.questions)) {
          throw new Error("AI response missing a valid questions array");
        }

        return res.json(data);
      } catch (err) {
        console.error("Error generating practice:", err);
        return res.status(500).json({ error: "Internal server error" });
      }
    });

// Simple StudentVUE preview route (no DB writes yet)
    app.post("/api/studentvue/preview", requireUser, async (req, res) => {
      try {
        const { districtUrl, username, password } = req.body || {};

        if (!districtUrl || !username || !password) {
          return res
            .status(400)
            .json({ error: "Missing districtUrl, username, or password." });
        }

        console.log("🔎 StudentVUE preview hit", { districtUrl, username });

        // 1) Login to StudentVUE
        const client = await StudentVue.login(districtUrl, {
          username,
          password,
        });

        // 2) Fetch gradebook
        const gradebook = await client.getGradebook({});

        // 3) Only send back what we need for now
        return res.json({
          ok: true,
          gradebook,
        });
      } catch (err) {
        console.error("StudentVUE import error:", err);

        const msg = err?.message || "Failed to import from StudentVUE.";
        if (msg.toLowerCase().includes("invalid credentials")) {
          return res
            .status(401)
            .json({ error: "Invalid StudentVUE username/password." });
        }

        return res.status(500).json({ error: msg });
      }
    });

    // BSD Chrome extension -> import classes from StudentVUE
  app.post("/api/import/studentvue", requireUserOrToken, async (req, res) => {
    try {
      const userId = req.session.userId;
      const { mode, classes } = req.body || {};

      // Expect the extension to send: { mode: "classes", classes: [...] }
      if (mode !== "classes" || !Array.isArray(classes) || classes.length === 0) {
        return res.status(400).json({ error: "Expected mode='classes' and a non-empty classes array." });
      }

      // 1) Fetch existing classes for this user so we don't duplicate on repeated imports
      const { data: existing, error: existingErr } = await supabase
        .from("classes")
        .select("id, name, period")
        .eq("user_id", userId);

      if (existingErr) {
        console.error("Import: error loading existing classes:", existingErr);
        return res.status(500).json({ error: "Failed to load existing classes." });
      }

      const existingKeys = new Set(
        (existing || []).map((c) => `${c.name.trim().toLowerCase()}|${c.period ?? ""}`)
      );

      // 2) Build new class rows to insert
      const rowsToInsert = [];

      for (const c of classes) {
        const name = (c.courseName || "").trim();
        if (!name) continue;

        // BSD periods will usually be "1:", "2:", etc. – try to pull a number if present
        let period = c.period;
        if (typeof period === "string") {
          const match = period.match(/\d+/);
          period = match ? Number(match[0]) : null;
        }

        const teacher = c.teacher || null;

        const key = `${name.toLowerCase()}|${period ?? ""}`;
        if (existingKeys.has(key)) {
          // already have this class for this user; skip to avoid duplicates
          continue;
        }

        rowsToInsert.push({
          user_id: userId,
          name,
          period,
          teacher,
          // weight left null; user can edit later in UI
        });
      }

      if (rowsToInsert.length === 0) {
        return res.json({
          ok: true,
          inserted: 0,
          note: "No new classes to import (everything already exists).",
        });
      }

      // 3) Insert new classes
      const { data: inserted, error: insertErr } = await supabase
        .from("classes")
        .insert(rowsToInsert)
        .select();

      if (insertErr) {
        console.error("Import: insert error:", insertErr);
        return res.status(500).json({ error: "Failed to save imported classes." });
      }

      return res.json({
        ok: true,
        inserted: inserted.length,
        classes: inserted,
      });
    } catch (err) {
      console.error("Import: server error:", err);
      return res.status(500).json({ error: "Server error during class import." });
    }
  });


/* ---------------------------- DEBUG ---------------------------- */
// Are we alive?
app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// What session does the server see on this request?
app.get("/whoami", (req, res) => {
  res.json({
    userId: req.session?.userId || null,
    sessionId: req.sessionID || null,
  });
});

// Set a test cookie to ensure browser accepts cookies from this origin
app.get("/debug/set-cookie", (req, res) => {
  res.cookie("gradeify_test", "ok", {
    httpOnly: true,
    sameSite: isHttpsOrigin ? "none" : "lax",
    secure: isHttpsOrigin,
  });
  res.json({ ok: true, note: "Set test cookie gradeify_test" });
});

/* -------------------- AUTH (username) /auth/* -------------------- */

// Register (username)
app.post("/auth/register", async (req, res) => {
  try {
    const { username = "", password = "" } = req.body || {};
    const uname = username.trim();
    if (!uname || !password) {
      return res.status(400).json({ error: "Username and password are required." });
    }

    // case-insensitive uniqueness check
    const { data: clash, error: cErr } = await supabase
      .from("users")
      .select("id")
      .eq("username", uname);
    if (cErr) return res.status(500).json({ error: cErr.message });
    if (clash?.length) return res.status(409).json({ error: "Username already in use." });

    const hash = await bcrypt.hash(password, 12);
    const { data, error } = await supabase
      .from("users")
      .insert({ username: uname, password_hash: hash })
      .select("id, username")
      .single();
    if (error) return res.status(400).json({ error: error.message });

    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: "Session error" });
      req.session.userId = data.id;
      req.session.save((saveErr) => {
        if (saveErr) return res.status(500).json({ error: "Session save failed" });
        res.json({ ok: true, user: data });
      });
    });
  } catch (e) {
    res.status(500).json({ error: e.message || "Registration failed" });
  }
});

// Login (username)
app.post("/auth/login", async (req, res) => {
  try {
    const { username = "", password = "" } = req.body || {};
    const uname = username.trim();
    if (!uname || !password) return res.status(400).json({ error: "Missing credentials." });

    const { data: user, error } = await supabase
      .from("users")
      .select("id, username, password_hash")
      .eq("username", uname)
      .single();
      if (error || !user) {
        return res.status(401).json({ error: "Invalid credentials." });
      }
       // Guard against malformed/legacy rows
      if (!user.password_hash || !user.password_hash.startsWith("$2")) {
        return res.status(400).json({ error: "Account password not set. Please reset." });
      }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials." });

    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: "Session error" });
      req.session.userId = user.id;
      req.session.save((saveErr) => {
        if (saveErr) return res.status(500).json({ error: "Session save failed" });
        console.log("✅ LOGIN OK", { userId: user.id, sessionId: req.sessionID });
        res.json({ ok: true, user: { id: user.id, username: user.username } });
      });
    });
  } catch (e) {
    res.status(500).json({ error: e.message || "Login failed" });
  }
});

app.post("/auth/logout", (req, res) => {
  // Clear BOTH possible cookie variants (covers mismatched CLIENT_ORIGIN / proxy cases)
  const variants = [
    { path: "/", httpOnly: true, sameSite: "lax", secure: false },
    { path: "/", httpOnly: true, sameSite: "none", secure: true },
  ];

  // Also clear without options (sometimes helps if options mismatch)
  res.clearCookie("gradeify.sid");
  for (const opts of variants) res.clearCookie("gradeify.sid", opts);

  // If no session, we’re done
  if (!req.session) return res.status(204).end();

  // Explicitly unset userId and save once, then destroy
  req.session.userId = null;

  req.session.save(() => {
    req.session.destroy(() => {
      // Regenerate a fresh empty session id so old sid can’t be reused
      req.sessionStore?.generate?.(req);
      return res.status(204).end();
    });
  });
});


// Current user (works for either auth style)
app.get("/auth/me", async (req, res) => {
  console.log("🔎 /auth/me hit", {
    sessionId: req.sessionID,
    userId: req.session?.userId || null,
  });

  if (!req.session?.userId) {
    return res.json({ ok: true, user: null });
  }

  const { data, error } = await supabase
    .from("users")
    .select("id, username, display_name, preferences, created_at") // 👈 no email
    .eq("id", req.session.userId)
    .single();

  if (error) {
    console.error("/auth/me error:", error.message);
    return res.json({ ok: true, user: null });
  }

  res.json({ ok: true, user: data });
});


/* ===================== SETTINGS & PROFILE (/me/*) ===================== */

// Return profile + preferences
app.get("/me/settings", requireUser, async (req, res) => {
  const { data: u, error } = await supabase
    .from("users")
    .select("username, display_name, preferences") // 👈 no email
    .eq("id", req.session.userId)
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const prefs = u?.preferences || {};
  res.json({
    ok: true,
    profile: {
      username: u?.username || "",
      email: "", // 👈 still send an email field so the frontend doesn't freak out
      displayName: u?.display_name || "",
    },
    preferences: { theme: prefs.theme || "light", ...prefs },
  });
});

// Update preferences (merge)
app.patch("/me/preferences", requireUser, async (req, res) => {
  const { data: cur, error: gErr } = await supabase
    .from("users")
    .select("preferences")
    .eq("id", req.session.userId)
    .single();
  if (gErr) return res.status(500).json({ error: gErr.message });
  const merged = { ...(cur?.preferences || {}), ...(req.body || {}) };
  const { error: uErr, data } = await supabase
    .from("users")
    .update({ preferences: merged })
    .eq("id", req.session.userId)
    .select("preferences")
    .single();
  if (uErr) return res.status(500).json({ error: uErr.message });
  res.json({ ok: true, preferences: data.preferences });
});

// Update display name
app.patch("/me/profile", requireUser, async (req, res) => {
  const { displayName = "" } = req.body || {};
  const { error } = await supabase
    .from("users")
    .update({ display_name: displayName.trim() })
    .eq("id", req.session.userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, displayName: displayName.trim() });
});

// Change username (case-insensitive uniqueness)
app.patch("/me/username", requireUser, async (req, res) => {
  const { newUsername = "" } = req.body || {};
  const uname = newUsername.trim();
  if (!uname) return res.status(400).json({ error: "Username cannot be empty." });
  const { data: clash, error: cErr } = await supabase
    .from("users")
    .select("id")
    .neq("id", req.session.userId)
    .eq("username", uname);
  if (cErr) return res.status(500).json({ error: cErr.message });
  if (clash && clash.length) return res.status(409).json({ error: "Username already in use." });
  const { error } = await supabase
    .from("users")
    .update({ username: uname })
    .eq("id", req.session.userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, username: uname });
});

// Change password (verify current)
app.patch("/me/password", requireUser, async (req, res) => {
  try {
    const { currentPassword = "", newPassword = "" } = req.body || {};
    if (!currentPassword || !newPassword) return res.status(400).json({ error: "Missing fields" });
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }

    const { data: user, error: gErr } = await supabase
      .from("users")
      .select("password_hash")
      .eq("id", req.session.userId)
      .single();
    if (gErr) return res.status(500).json({ error: gErr.message });
    if (!user) return res.status(404).json({ error: "User not found" });

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) return res.status(403).json({ error: "Current password incorrect." });

    const hash = await bcrypt.hash(newPassword, 12);
    const { error: uErr } = await supabase
      .from("users")
      .update({ password_hash: hash })
      .eq("id", req.session.userId);
    if (uErr) return res.status(500).json({ error: uErr.message });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || "Password change failed" });
  }
});

/* -------------------------- CLASSES (CRUD) -------------------------- */

// List classes
app.get("/me/classes", requireUser, async (req, res) => {
  const { data, error } = await supabase
    .from("classes")
    .select("*")
    .eq("user_id", req.session.userId)
    .order("period", { ascending: true })
    .order("name", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, classes: data });
});

// Create class
app.post("/me/classes", requireUser, async (req, res) => {
  const { name = "", period = null, teacher = null, weight = null } = req.body || {};
  if (!name.trim()) return res.status(400).json({ error: "Class name is required." });
  const payload = {
    user_id: req.session.userId,
    name: name.trim(),
    period,
    teacher,
    weight,
  };
  const { data, error } = await supabase.from("classes").insert(payload).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true, class: data });
});

// Update class
app.put("/me/classes/:id", requireUser, async (req, res) => {
  const { id } = req.params;
  const patch = {};
  if (typeof req.body?.name === "string") patch.name = req.body.name.trim();
  if ("period" in req.body) patch.period = req.body.period;
  if ("teacher" in req.body) patch.teacher = req.body.teacher;
  if ("weight" in req.body) patch.weight = req.body.weight;

  const { data, error } = await supabase
    .from("classes")
    .update(patch)
    .eq("id", id)
    .eq("user_id", req.session.userId)
    .select()
    .single();

  if (error) return res.status(404).json({ error: error.message });
  res.json({ ok: true, class: data });
});

// Delete class (also delete grades if not using FK cascade)
app.delete("/me/classes/:id", requireUser, async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from("classes")
    .delete()
    .eq("id", id)
    .eq("user_id", req.session.userId);

  if (error) return res.status(404).json({ error: "Class not found." });

  // If you didn't set ON DELETE CASCADE on grades.class_id:
  await supabase.from("grades").delete().eq("class_id", id).eq("user_id", req.session.userId);

  res.json({ ok: true });
});

/* --------------------------- GRADES (CRUD) --------------------------- */

// List grades for a class
app.get("/me/classes/:classId/grades", requireUser, async (req, res) => {
  const { classId } = req.params;
  const { data, error } = await supabase
    .from("grades")
    .select("*")
    .eq("class_id", classId)
    .eq("user_id", req.session.userId)
    .order("due_date", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, grades: data });
});

// Create grade
app.post("/me/classes/:classId/grades", requireUser, async (req, res) => {
  const { classId } = req.params;
  const { title = "", points_earned, points_possible, category = null, due_date = null } =
    req.body || {};
  if (!title.trim()) return res.status(400).json({ error: "Title is required." });
  if (points_earned == null || points_possible == null)
    return res.status(400).json({ error: "Points earned/possible are required." });

  const payload = {
    user_id: req.session.userId,
    class_id: classId,
    title: title.trim(),
    points_earned: Number(points_earned),
    points_possible: Number(points_possible),
    category,
    due_date,
  };
  const { data, error } = await supabase.from("grades").insert(payload).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true, grade: data });
});

// Update grade
app.put("/me/grades/:id", requireUser, async (req, res) => {
  const { id } = req.params;
  const patch = {};
  if (typeof req.body?.title === "string") patch.title = req.body.title.trim();
  if ("points_earned" in req.body) patch.points_earned = Number(req.body.points_earned);
  if ("points_possible" in req.body) patch.points_possible = Number(req.body.points_possible);
  if ("category" in req.body) patch.category = req.body.category;
  if ("due_date" in req.body) patch.due_date = req.body.due_date;

  const { data, error } = await supabase
    .from("grades")
    .update(patch)
    .eq("id", id)
    .eq("user_id", req.session.userId)
    .select()
    .single();

  if (error) return res.status(404).json({ error: error.message });
  res.json({ ok: true, grade: data });
});

// Delete grade
app.delete("/me/grades/:id", requireUser, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase
    .from("grades")
    .delete()
    .eq("id", id)
    .eq("user_id", req.session.userId);
  if (error) return res.status(404).json({ error: "Grade not found." });
  res.json({ ok: true });
});

app.post("/me/practice-tests", requireUser, async (req, res) => {
  try {
    const { meta, questions, score } = req.body || {};

    if (!meta || !questions || !score) {
      return res.status(400).json({ error: "Missing test data" });
    }

    const { data, error } = await supabase
      .from("practice_tests")
      .insert({
        user_id: req.session.userId,
        meta,
        questions,
        score,
      })
      .select()
      .single();

    if (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to save test" });
    }

    res.json({ ok: true, test: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ===================== FLASHCARDS (DB) /me/flashcards =====================

// Create a flashcard set + cards
app.post("/me/flashcard-sets", requireUser, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { subject, topic, prompt, cards } = req.body || {};

    if (!subject || !topic || !prompt || !Array.isArray(cards) || cards.length === 0) {
      return res.status(400).json({ error: "Missing subject/topic/prompt or cards[]" });
    }

    const setId = newId();

    // 1) Insert set
    const { data: setRow, error: setErr } = await supabase
      .from("flashcard_sets")
      .insert({
        id: setId,
        user_id: userId,
        subject: String(subject).trim(),
        topic: String(topic).trim(),
        prompt: String(prompt).trim(),
      })
      .select()
      .single();

    if (setErr) {
      console.error("flashcard_sets insert error:", setErr);
      return res.status(500).json({ error: "Failed to save flashcard set" });
    }

    // 2) Insert cards
    const rows = cards
      .map((c, idx) => ({
        id: newId(),
        set_id: setId,
        user_id: userId,
        card_index: idx,
        term: String(c.term ?? "").trim(),
        definition: String(c.definition ?? "").trim(),
      }))
      .filter((c) => c.term && c.definition);

    if (!rows.length) {
      // clean up empty set if cards invalid
      await supabase.from("flashcard_sets").delete().eq("id", setId).eq("user_id", userId);
      return res.status(400).json({ error: "Cards were empty/invalid" });
    }

    const { error: cardsErr } = await supabase.from("flashcards").insert(rows);
    if (cardsErr) {
      console.error("flashcards insert error:", cardsErr);
      // cleanup if cards insert fails
      await supabase.from("flashcard_sets").delete().eq("id", setId).eq("user_id", userId);
      return res.status(500).json({ error: "Failed to save flashcards" });
    }

    return res.json({ ok: true, set: setRow });
  } catch (e) {
    console.error("POST /me/flashcard-sets error:", e);
    return res.status(500).json({ error: e.message || "Server error" });
  }
});

// List sets (metadata only)
app.get("/me/flashcard-sets", requireUser, async (req, res) => {
  try {
    const userId = req.session.userId;

    const { data, error } = await supabase
      .from("flashcard_sets")
      .select("id, subject, topic, prompt, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true, sets: data });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
});

// Get one set + cards
app.get("/me/flashcard-sets/:id", requireUser, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { id } = req.params;

    const { data: setRow, error: setErr } = await supabase
      .from("flashcard_sets")
      .select("id, subject, topic, prompt, created_at")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (setErr || !setRow) return res.status(404).json({ error: "Set not found" });

    const { data: cards, error: cardsErr } = await supabase
      .from("flashcards")
      .select("term, definition, card_index")
      .eq("set_id", id)
      .eq("user_id", userId)
      .order("card_index", { ascending: true });

    if (cardsErr) return res.status(500).json({ error: cardsErr.message });

    return res.json({ ok: true, set: setRow, cards });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
});

// Delete a set (cascade deletes cards)
app.delete("/me/flashcard-sets/:id", requireUser, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { id } = req.params;

    const { error } = await supabase
      .from("flashcard_sets")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) return res.status(500).json({ error: error.message });

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
});


/* ------------------------- CATEGORIES (CRUD) ------------------------- */

// List categories
app.get("/me/classes/:classId/categories", requireUser, async (req, res) => {
  const { classId } = req.params;
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("class_id", classId)
    .eq("user_id", req.session.userId)
    .order("name", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, categories: data });
});

// Create category
app.post("/me/classes/:classId/categories", requireUser, async (req, res) => {
  const { classId } = req.params;
  const { name = "", weight_percent } = req.body || {};
  if (!name.trim()) return res.status(400).json({ error: "Category name is required." });
  const w = Number(weight_percent);
  if (!Number.isFinite(w) || w <= 0 || w > 100) {
    return res.status(400).json({ error: "Weight must be 1–100." });
  }
  const { data, error } = await supabase
    .from("categories")
    .insert({
      id: newId(), // optional; DB can generate too
      user_id: req.session.userId,
      class_id: classId,
      name: name.trim(),
      weight_percent: w,
    })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true, category: data });
});

// Update category
app.put("/me/categories/:id", requireUser, async (req, res) => {
  const { id } = req.params;
  const patch = {};
  if (typeof req.body?.name === "string") patch.name = req.body.name.trim();
  if ("weight_percent" in req.body) {
    const w = Number(req.body.weight_percent);
    if (!Number.isFinite(w) || w <= 0 || w > 100) {
      return res.status(400).json({ error: "Weight must be 1–100." });
    }
    patch.weight_percent = w;
  }
  const { data, error } = await supabase
    .from("categories")
    .update(patch)
    .eq("id", id)
    .eq("user_id", req.session.userId)
    .select()
    .single();
  if (error) return res.status(404).json({ error: "Category not found." });
  res.json({ ok: true, category: data });
});

// Delete category
app.delete("/me/categories/:id", requireUser, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", id)
    .eq("user_id", req.session.userId);
  if (error) return res.status(404).json({ error: "Category not found." });
  res.json({ ok: true });
});

/* ----------------------------- SUMMARY ----------------------------- */
app.get("/me/classes/:classId/summary", requireUser, async (req, res) => {
  const { classId } = req.params;

  const [{ data: cats, error: cErr }, { data: grades, error: gErr }] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, weight_percent")
      .eq("class_id", classId)
      .eq("user_id", req.session.userId),
    supabase
      .from("grades")
      .select("title, points_earned, points_possible, category")
      .eq("class_id", classId)
      .eq("user_id", req.session.userId),
  ]);
  if (cErr || gErr) return res.status(500).json({ error: (cErr || gErr).message });

  const byCat = new Map();
  for (const g of grades) {
    const key = (g.category || "Uncategorized").trim().toLowerCase();
    const cur = byCat.get(key) || { earned: 0, possible: 0, name: g.category || "Uncategorized" };
    cur.earned += Number(g.points_earned) || 0;
    cur.possible += Number(g.points_possible) || 0;
    byCat.set(key, cur);
  }

  let sumWeights = 0;
  const catRows = cats.map((c) => {
    const w = Number(c.weight_percent) || 0;
    sumWeights += w;
    const key = c.name.trim().toLowerCase();
    const agg = byCat.get(key) || { earned: 0, possible: 0, name: c.name };
    const pct = agg.possible > 0 ? (agg.earned / agg.possible) * 100 : null;
    return { id: c.id, name: c.name, weight_percent: w, earned: agg.earned, possible: agg.possible, percent: pct };
  });

  for (const [key, agg] of byCat) {
    const already = catRows.find((r) => r.name.trim().toLowerCase() === key);
    if (!already) {
      catRows.push({
        id: null,
        name: agg.name,
        weight_percent: 0,
        earned: agg.earned,
        possible: agg.possible,
        percent: agg.possible > 0 ? (agg.earned / agg.possible) * 100 : null,
      });
    }
  }

  let overall = null;
  if (sumWeights > 0) {
    let acc = 0;
    for (const c of catRows) if (c.weight_percent > 0 && c.percent != null) {
      acc += (c.percent * c.weight_percent) / 100;
    }
    const effective = catRows
      .filter((c) => c.weight_percent > 0 && c.percent != null)
      .reduce((s, c) => s + c.weight_percent, 0);
    overall = effective > 0 ? acc * (100 / effective) : null;
    if (overall == null) {
      const totalEarned = grades.reduce((a, g) => a + (+g.points_earned || 0), 0);
      const totalPossible = grades.reduce((a, g) => a + (+g.points_possible || 0), 0);
      overall = totalPossible > 0 ? (totalEarned / totalPossible) * 100 : null;
    }
  } else {
    const totalEarned = grades.reduce((a, g) => a + (+g.points_earned || 0), 0);
    const totalPossible = grades.reduce((a, g) => a + (+g.points_possible || 0), 0);
    overall = totalPossible > 0 ? (totalEarned / totalPossible) * 100 : null;
  }

  res.json({ ok: true, overallPercent: overall, categories: catRows, sumWeights });
});

/* -------------------- GROUPS + REAL-TIME (Socket.IO) -------------------- */

// helper: check membership
async function isMember(userId, groupId) {
  const { data, error } = await supabase
    .from("group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

async function requireGroupMember(req, res, next) {
  try {
    const { groupId } = req.params;
    if (!groupId) return res.status(400).json({ error: "Missing groupId." });
    const ok = await isMember(req.session.userId, groupId);
    if (!ok) return res.status(403).json({ error: "Not in group" });
    next();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// Create a group
app.post("/groups", requireUser, async (req, res) => {
  const { name = "" } = req.body || {};
  if (!name.trim()) return res.status(400).json({ error: "Group name required" });
  const groupId = newId();

  const { error: gErr } = await supabase.from("groups").insert({ id: groupId, name: name.trim() });
  if (gErr) return res.status(500).json({ error: gErr.message });

  // add creator as member
  await supabase.from("group_members").insert({
    id: newId(),
    group_id: groupId,
    user_id: req.session.userId,
  });

  res.json({ ok: true, group: { id: groupId, name: name.trim() } });
});

// Join a group
app.post("/groups/:groupId/join", requireUser, async (req, res) => {
  const { groupId } = req.params;
  const { data: group } = await supabase.from("groups").select("*").eq("id", groupId).single();
  if (!group) return res.status(404).json({ error: "Group not found" });

  // upsert (requires unique index on (group_id, user_id) to be fully idempotent)
  await supabase
    .from("group_members")
    .upsert({ id: newId(), group_id: groupId, user_id: req.session.userId }, { onConflict: "group_id,user_id" });

  res.json({ ok: true, group });
});

// Get classes in a group
app.get("/groups/:groupId/classes", requireUser, requireGroupMember, async (req, res) => {
  const { groupId } = req.params;
  const { data, error } = await supabase
    .from("classes")
    .select("*")
    .eq("group_id", groupId)
    .order("period", { ascending: true })
    .order("name", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, classes: data });
});

// Create a class (auto sync)
app.post("/groups/:groupId/classes", requireUser, requireGroupMember, async (req, res) => {
  const { groupId } = req.params;
  const { name = "", period = null, teacher = null, weight = null } = req.body || {};
  if (!name.trim()) return res.status(400).json({ error: "Class name required" });

  const payload = { id: newId(), group_id: groupId, name: name.trim(), period, teacher, weight };
  const { data, error } = await supabase.from("classes").insert(payload).select().single();
  if (error) return res.status(500).json({ error: error.message });

  io.to(groupId).emit("refreshClasses", { action: "add", class: data });
  res.json({ ok: true, class: data });
});

// Update class (auto sync)
app.put("/groups/:groupId/classes/:id", requireUser, requireGroupMember, async (req, res) => {
  const { groupId, id } = req.params;
  const patch = {};
  if (typeof req.body?.name === "string") patch.name = req.body.name.trim();
  if ("period" in req.body) patch.period = req.body.period;
  if ("teacher" in req.body) patch.teacher = req.body.teacher;
  if ("weight" in req.body) patch.weight = req.body.weight;

  const { data, error } = await supabase
    .from("classes")
    .update(patch)
    .eq("id", id)
    .eq("group_id", groupId)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });

  io.to(groupId).emit("refreshClasses", { action: "update", class: data });
  res.json({ ok: true, class: data });
});

// Delete class (auto sync)
app.delete("/groups/:groupId/classes/:id", requireUser, requireGroupMember, async (req, res) => {
  const { groupId, id } = req.params;
  const { error } = await supabase.from("classes").delete().eq("id", id).eq("group_id", groupId);
  if (error) return res.status(500).json({ error: error.message });

  io.to(groupId).emit("refreshClasses", { action: "delete", classId: id });
  res.json({ ok: true });
});

// --- start server ---
const PORT = process.env.PORT || 3001;
app.use((err, req, res, next) => {
  console.error("❌ Express error:", err?.message || err);

  if (String(err?.message || "").startsWith("CORS blocked")) {
    return res.status(403).json({ ok: false, error: err.message });
  }

  return res.status(500).json({ ok: false, error: err.message || "Internal Server Error" });
});



server.listen(PORT, () => console.log(`✅ Backend running on ${PORT} (Socket.IO active)`));
