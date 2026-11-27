import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({ requireShop = false }: { requireShop?: boolean }) {
  const { user, shopProfile, authReady } = useAuth();

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#060D1E] text-slate-300 flex items-center justify-center text-sm">
        Loading KhataNova...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requireShop && !shopProfile) {
    return <Navigate to="/setup" replace />;
  }

  return <Outlet />;
}
