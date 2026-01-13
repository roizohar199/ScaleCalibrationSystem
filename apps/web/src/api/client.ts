import axios, { AxiosError } from "axios";

export const api = axios.create({
  baseURL: "/api",              // תמיד דרך ה־Vite proxy
  withCredentials: true,        // אם אתה עובד עם cookie/session
  headers: {
    "Content-Type": "application/json",
  },
});

// אופציונלי: לוג נוח לדיבאג
api.interceptors.response.use(
  (res) => res,
  (err: AxiosError) => {
    const status = err.response?.status;
    const url = err.config?.url;

    // לא לזרוק ״שגיאה״ על 401 של /auth/me – זה מצב ״לא מחובר״
    if (status === 401 && url?.includes("/auth/me")) {
      return Promise.reject(err);
    }

    // כאן אפשר להדפיס לשימושך
    console.error("[api]", { status, url, message: err.message });
    return Promise.reject(err);
  }
);

export default api;

