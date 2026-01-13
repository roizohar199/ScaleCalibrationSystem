import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

function tryLoad(p: string) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
    return true;
  }
  return false;
}

export function loadEnv() {
  // cwd כשמריצים npm --prefix apps/api ... הוא apps/api
  const cwd = process.cwd();

  const apiEnv = path.join(cwd, ".env");          // apps/api/.env
  const rootEnv = path.join(cwd, "..", ".env");   // root .env (fallback)

  const loadedApi = tryLoad(apiEnv);
  const loadedRoot = tryLoad(rootEnv);

  // לוג קצר וברור
  console.log(
    `ENV loaded: apps/api/.env=${loadedApi ? "YES" : "NO"} | root .env=${loadedRoot ? "YES" : "NO"}`
  );

  const required = ["DATABASE_URL", "JWT_SECRET"];
  const missing = required.filter((k) => !process.env[k] || String(process.env[k]).trim() === "");

  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")} (create apps/api/.env)`);
  }
}




