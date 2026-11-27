import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  BadgeIndianRupee,
  Crown,
  FileBarChart,
  Globe,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  QrCode,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { ADMIN_NAVIGATION, type AdminNavItemConfig } from '../../config/navigation';
import { useAdminAuth } from '../../context/AdminAuthContext';

const ADMIN_ICONS: Record<AdminNavItemConfig['iconName'], React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  Users,
  BadgeIndianRupee,
  QrCode,
  MessageSquareText,
  History,
  FileBarChart,
  Crown,
  Globe,
  ShieldCheck,
};

export function AdminLayout({ title, children }: { title: string; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const { logoutAdmin } = useAdminAuth();

  const handleLogout = async () => {
    await logoutAdmin();
    navigate('/admin/login', { replace: true });
  };

  const sidebar = (
    <div className="flex flex-col h-full bg-[#071026] border-r border-blue-400/15">
      <div className="h-16 px-5 flex items-center justify-between border-b border-blue-400/15">
        <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
          <img src="/logo.svg" alt="KhataNova Admin" className="w-7 h-7 rounded-lg" />
          <span className="text-base font-bold text-white font-display">KhataNova Admin</span>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Close admin sidebar"
          className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5" aria-label="Admin Navigation">
        {ADMIN_NAVIGATION.map((item) => {
          const Icon = ADMIN_ICONS[item.iconName];
          return (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.path === '/admin'}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-sm font-medium transition-all whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-600/30 to-amber-500/15 text-amber-300 border border-amber-400/30'
                    : 'text-slate-300 hover:text-white hover:bg-white/5 border border-transparent'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="p-3 border-t border-blue-400/15 space-y-1.5">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors whitespace-nowrap"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Exit to Shop App</span>
        </button>
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl text-sm font-medium text-rose-300 hover:text-rose-200 hover:bg-rose-500/10 transition-colors whitespace-nowrap"
        >
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>Lock Admin Session</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#050B1A] text-slate-100 flex">
      <aside className="hidden lg:block w-[276px] shrink-0 h-screen sticky top-0">
        {sidebar}
      </aside>
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="relative w-72 max-w-[85vw] h-full z-10">{sidebar}</div>
        </div>
      ) : null}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 sm:h-16 px-4 sm:px-6 border-b border-blue-400/15 bg-[#071026]/90 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open admin menu"
              className="lg:hidden min-w-[40px] min-h-[40px] flex items-center justify-center rounded-2xl text-slate-300 hover:text-white hover:bg-white/5"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-semibold text-white truncate font-display">
              {title}
            </h1>
          </div>
          <span className="text-xs font-medium text-amber-300 whitespace-nowrap shrink-0">
            Owner Console
          </span>
        </header>
        <main className="flex-1 p-4 sm:p-6 max-w-[1400px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
