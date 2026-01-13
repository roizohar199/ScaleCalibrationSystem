import jwt from "jsonwebtoken";

export type JwtPayload = { userId: string; role: "TECHNICIAN" | "OFFICE" | "ADMIN" };

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || !String(secret).trim()) {
    // לא מפילים את השרת ב-import – אבל כן נותנים שגיאה ברורה בזמן שימוש
    throw new Error("JWT_SECRET is missing. Add JWT_SECRET to apps/api/.env (or root .env).");
  }
  return secret;
}

export function signToken(payload: JwtPayload) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, getJwtSecret()) as JwtPayload;
}
