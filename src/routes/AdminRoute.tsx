import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';

export function AdminRoute() {
  const { isAdminAuthenticated, statusLoaded } = useAdminAuth();

  if (!statusLoaded) {
    return (
      <div className="min-h-screen bg-[#050B1A] text-slate-300 flex items-center justify-center text-sm">
        Verifying Admin Authorization...
      </div>
    );
  }

  if (!isAdminAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }

  return <Outlet />;
}
