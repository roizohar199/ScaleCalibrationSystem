import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import api from "../api/client";

export type User = {
  id: string;
  email: string;
  name: string;
  role: "TECHNICIAN" | "OFFICE" | "ADMIN";
};

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  refreshMe: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = async () => {
    try {
      const res = await api.get("/auth/me"); // baseURL=/api => /api/auth/me
      setUser(res.data.user ?? null);
    } catch (err: any) {
      // 401 זה לא שגיאה - זה פשוט "לא מחובר"
      if (err.response?.status === 401) {
        setUser(null);
      } else {
        // רק אם זה לא 401, נדפיס שגיאה
        console.error("[auth] error:", err);
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await api.post("/auth/logout").catch(() => {});
    setUser(null);
  };

  useEffect(() => {
    refreshMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(() => ({ user, loading, refreshMe, logout }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}


