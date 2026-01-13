import { Request, Response, NextFunction } from "express";
import { verifyToken, JwtPayload } from "./jwt.js";

export type AuthedRequest = Request & { auth?: JwtPayload };

const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || "auth_token";

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  // קודם נבדוק cookies, ואם אין - נבדוק Authorization header (backward compatibility)
  const token = req.cookies?.[COOKIE_NAME] || 
    (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : "");
  
  if (!token) return res.status(401).json({ message: "Not authenticated" });

  try {
    req.auth = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ message: "Not authenticated" });
  }
}

export function requireRole(roles: Array<JwtPayload["role"]>) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ error: "Missing auth" });
    if (!roles.includes(req.auth.role)) return res.status(403).json({ error: "Forbidden" });
    next();
  };
}

