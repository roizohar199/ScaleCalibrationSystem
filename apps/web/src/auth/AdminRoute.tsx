import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthProvider";

export function AdminRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== 'ADMIN' && user.role !== 'OFFICE') {
    // אם לא אדמין/משרד, העבר לדף המתאים
    if (user.role === 'TECHNICIAN') {
      return <Navigate to="/technician" replace />;
    }
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

