import { Router, Response } from "express";
import { prisma } from "../../db/prisma.js";
import { signToken, verifyToken } from "./jwt.js";
import { requireAuth, AuthedRequest } from "./middleware.js";

export const authRouter = Router();

const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || "auth_token";

function setAuthCookie(res: Response, token: string) {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd, // true בפרודקשן עם https
    sameSite: "lax", // עובד טוב לרוב המקרים
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 ימים
    path: "/",
  });
}

function clearAuthCookie(res: Response) {
  const isProd = process.env.NODE_ENV === "production";
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
  });
}

/**
 * POST /api/auth/register
 * הרשמה למשתמש חדש (רק טכנאי)
 */
authRouter.post("/register", async (req, res) => {
  const { email, password, name } = req.body as { email: string; password: string; name: string };
  
  if (!email || !password || !name) {
    return res.status(400).json({ message: "נדרש אימייל, סיסמה ושם" });
  }

  // בדיקה אם המשתמש כבר קיים
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(400).json({ message: "משתמש עם אימייל זה כבר קיים" });
  }

  // יצירת משתמש חדש עם סטטוס PENDING_APPROVAL
  const user = await prisma.user.create({
    data: {
      email,
      password, // MVP: plaintext (להחליף ל-bcrypt בהמשך)
      name,
      role: "TECHNICIAN",
      status: "PENDING_APPROVAL",
    } as any,
  });

  return res.json({
    message: "ההרשמה בוצעה בהצלחה. אנא המתן לאישור מנהל המערכת.",
    user: { id: user.id, email: user.email, name: user.name, status: user.status },
  });
});

/**
 * MVP: password stored as plain string (להחליף ל-bcrypt בהמשך)
 */
authRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    
    if (!email || !password) {
      return res.status(400).json({ message: "נדרש אימייל וסיסמה" });
    }

    // ניקוי האימייל - הסרת רווחים והמרה לאותיות קטנות
    const cleanEmail = email.trim().toLowerCase();
    console.log(`[auth/login] Attempting login for email: ${cleanEmail}`);
    
    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
    
    if (!user) {
      console.log(`Login attempt failed: user not found for email ${email}`);
      return res.status(401).json({ message: "אימייל או סיסמה שגויים" });
    }

    // השוואת סיסמה (plaintext ב-MVP)
    console.log(`[auth/login] User found: ${user.email}, comparing passwords...`);
    if (user.password !== password) {
      console.log(`[auth/login] Login attempt failed: wrong password for user ${cleanEmail}`);
      console.log(`[auth/login] Expected: "${user.password}", Got: "${password}"`);
      return res.status(401).json({ message: "אימייל או סיסמה שגויים" });
    }

    // בדיקה אם המשתמש מאושר
    if (user.status !== "APPROVED") {
      if (user.status === "PENDING_APPROVAL") {
        return res.status(403).json({ message: "החשבון שלך ממתין לאישור מנהל המערכת" });
      }
      if (user.status === "REJECTED") {
        return res.status(403).json({ message: "החשבון שלך נדחה. אנא פנה למנהל המערכת" });
      }
    }

    console.log(`[auth/login] Password match! Creating token for user ${cleanEmail}...`);
    
    try {
      const token = signToken({ userId: user.id, role: user.role });
      setAuthCookie(res, token);
      console.log(`[auth/login] User ${cleanEmail} logged in successfully`);
    } catch (tokenError: any) {
      console.error(`[auth/login] Token creation failed:`, tokenError);
      return res.status(500).json({ message: "שגיאה ביצירת טוקן. נא לנסות שוב", error: tokenError.message });
    }

    return res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (error: any) {
    console.error('[auth/login] Error:', error);
    console.error('[auth/login] Error stack:', error.stack);
    return res.status(500).json({ message: "שגיאה בהתחברות. נא לנסות שוב", error: error.message });
  }
});

/**
 * GET /api/auth/me
 * בדיקת תקינות הטוקן מהעוגייה והחזרת פרטי המשתמש
 * מחזיר 401 עם user: null אם אין סשן תקין
 */
authRouter.get("/me", async (req: AuthedRequest, res) => {
  try {
    const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || "auth_token";
    const token = req.cookies?.[COOKIE_NAME] || 
      (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : "");
    
    if (!token) {
      return res.status(401).json({ user: null });
    }

    try {
      const auth = verifyToken(token);
      const user = await prisma.user.findUnique({ where: { id: auth.userId } });
      
      if (!user) {
        return res.status(401).json({ user: null });
      }

      return res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status } });
    } catch (error: any) {
      console.error('[auth/me] Token verification error:', error.message);
      return res.status(401).json({ user: null });
    }
  } catch (error: any) {
    console.error('[auth/me] Unexpected error:', error);
    console.error('[auth/me] Error stack:', error.stack);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/auth/logout
 * מחיקת העוגייה והתנתקות
 */
authRouter.post("/logout", async (_req, res) => {
  clearAuthCookie(res);
  return res.json({ ok: true });
});

/**
 * GET /api/auth/pending-users
 * קבלת רשימת משתמשים ממתינים לאישור (רק ADMIN)
 */
authRouter.get("/pending-users", requireAuth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  
  if (!user || user.role !== "ADMIN") {
    return res.status(403).json({ message: "אין הרשאה" });
  }

  const pendingUsers = await prisma.user.findMany({
    where: { status: "PENDING_APPROVAL" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return res.json(pendingUsers);
});

/**
 * POST /api/auth/approve-user
 * אישור או דחיית משתמש (רק ADMIN)
 */
authRouter.post("/approve-user", requireAuth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  
  if (!user || user.role !== "ADMIN") {
    return res.status(403).json({ message: "אין הרשאה" });
  }

  const { userId, action } = req.body as { userId: string; action: "approve" | "reject" };

  if (!userId || !action) {
    return res.status(400).json({ message: "נדרש userId ו-action" });
  }

  const targetUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!targetUser) {
    return res.status(404).json({ message: "משתמש לא נמצא" });
  }

  if (targetUser.status !== "PENDING_APPROVAL") {
    return res.status(400).json({ message: "המשתמש כבר טופל" });
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      status: action === "approve" ? "APPROVED" : "REJECTED",
    },
  });

  return res.json({
    message: action === "approve" ? "משתמש אושר בהצלחה" : "משתמש נדחה",
    user: {
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      status: updatedUser.status,
    },
  });
});

/**
 * GET /api/auth/users
 * קבלת רשימת כל המשתמשים המאושרים (רק ADMIN)
 */
authRouter.get("/users", requireAuth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  
  if (!user || user.role !== "ADMIN") {
    return res.status(403).json({ message: "אין הרשאה" });
  }

  const users = await prisma.user.findMany({
    where: { status: "APPROVED" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return res.json(users);
});

/**
 * PUT /api/auth/users/:id
 * עריכת משתמש (שם, אימייל) (רק ADMIN)
 */
authRouter.put("/users/:id", requireAuth, async (req: AuthedRequest, res) => {
  const admin = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  
  if (!admin || admin.role !== "ADMIN") {
    return res.status(403).json({ message: "אין הרשאה" });
  }

  const { id } = req.params;
  const { name, email } = req.body as { name?: string; email?: string };

  const targetUser = await prisma.user.findUnique({ where: { id } });
  if (!targetUser) {
    return res.status(404).json({ message: "משתמש לא נמצא" });
  }

  // בדיקה אם האימייל החדש כבר קיים במשתמש אחר
  if (email && email !== targetUser.email) {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: "אימייל זה כבר בשימוש" });
    }
  }

  const updatedUser = await prisma.user.update({
    where: { id },
    data: {
      ...(name && { name }),
      ...(email && { email: email.trim().toLowerCase() }),
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      createdAt: true,
    },
  });

  return res.json({
    message: "משתמש עודכן בהצלחה",
    user: updatedUser,
  });
});

/**
 * PUT /api/auth/users/:id/password
 * החלפת סיסמה של משתמש (רק ADMIN)
 */
authRouter.put("/users/:id/password", requireAuth, async (req: AuthedRequest, res) => {
  const admin = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  
  if (!admin || admin.role !== "ADMIN") {
    return res.status(403).json({ message: "אין הרשאה" });
  }

  const { id } = req.params;
  const { password } = req.body as { password: string };

  if (!password || password.length < 6) {
    return res.status(400).json({ message: "סיסמה חייבת להכיל לפחות 6 תווים" });
  }

  const targetUser = await prisma.user.findUnique({ where: { id } });
  if (!targetUser) {
    return res.status(404).json({ message: "משתמש לא נמצא" });
  }

  await prisma.user.update({
    where: { id },
    data: { password }, // MVP: plaintext (להחליף ל-bcrypt בהמשך)
  });

  return res.json({ message: "סיסמה עודכנה בהצלחה" });
});

/**
 * DELETE /api/auth/users/:id
 * מחיקת משתמש (רק ADMIN)
 */
authRouter.delete("/users/:id", requireAuth, async (req: AuthedRequest, res) => {
  const admin = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  
  if (!admin || admin.role !== "ADMIN") {
    return res.status(403).json({ message: "אין הרשאה" });
  }

  const { id } = req.params;

  // מניעת מחיקה של עצמו
  if (id === admin.id) {
    return res.status(400).json({ message: "לא ניתן למחוק את עצמך" });
  }

  const targetUser = await prisma.user.findUnique({ where: { id } });
  if (!targetUser) {
    return res.status(404).json({ message: "משתמש לא נמצא" });
  }

  await prisma.user.delete({ where: { id } });

  return res.json({ message: "משתמש נמחק בהצלחה" });
});

