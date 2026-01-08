// backend/db.js
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load backend/.env explicitly (ESM imports run before index.js, so do it here)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

// Validate required envs
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env (backend/.env)."
  );
}

// Backend-only Supabase client (never expose the service role key to the frontend)
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// Keep newId() for compatibility; Postgres can also auto-gen ids
export function newId() {
  return crypto.randomUUID();
}

/* ------------------------------------------------------------------
  Optional helpers: call `supabase` directly in routes or centralize here.
------------------------------------------------------------------- */

// Example:
// export async function findUserByUsername(username) {
//   const { data, error } = await supabase
//     .from("users")
//     .select("id, username, password_hash, display_name, preferences, created_at")
//     .eq("username", username)
//     .single();
//   if (error) throw error;
//   return data;
// }
