import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  BookOpenCheck,
  Calculator,
  ClipboardList,
  Crown,
  Home,
  LifeBuoy,
  LogOut,
  ReceiptIndianRupee,
  ScanBarcode,
  Settings,
  Store,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { USER_NAVIGATION, type NavItemConfig } from '../../config/navigation';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';

const ICONS: Record<NavItemConfig['iconName'], React.ComponentType<{ className?: string }>> = {
  Home,
  ReceiptIndianRupee,
  Calculator,
  Users,
  BookOpenCheck,
  Wallet,
  BarChart3,
  Store,
  Settings,
  LifeBuoy,
  Crown,
  ClipboardList,
  Bell,
  ScanBarcode,
};

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ mobileOpen, onCloseMobile }: SidebarProps) {
  const { t } = useLanguage();
  const { user, isProMode, shopProfile, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const isPro = isProMode;

  const navContent = (
    <div
      className={`flex flex-col h-full ${
        isPro
          ? 'bg-[#060916] border-r border-amber-400/20'
          : 'bg-[#081229] border-r border-blue-400/15'
      }`}
    >
      <div
        className={`h-16 px-5 flex items-center justify-between shrink-0 ${
          isPro ? 'border-b border-amber-400/20' : 'border-b border-blue-400/15'
        }`}
      >
        <NavLink
          to="/"
          onClick={onCloseMobile}
          className="flex items-center gap-3 whitespace-nowrap shrink-0"
        >
          <img src="/logo.svg" alt="KhataNova" className="w-8 h-8 rounded-lg" />
          <span className="text-lg font-bold tracking-tight text-white font-display">
            KhataNova
          </span>
          {isPro ? (
            <span className="text-[10px] font-bold tracking-widest uppercase text-amber-300">
              PRO
            </span>
          ) : null}
        </NavLink>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5" aria-label="Primary Navigation">
        {USER_NAVIGATION.map((item) => {
          const Icon = ICONS[item.iconName];
          const isPremiumNav = item.id === 'premium';
          return (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.path === '/' || item.path === '/customers'}
              onClick={onCloseMobile}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-sm font-medium transition-all whitespace-nowrap shrink-0 ${
                  isActive
                    ? isPro
                      ? 'bg-gradient-to-r from-amber-500/20 to-cyan-500/10 text-amber-300 border border-amber-400/35 shadow-sm'
                      : 'bg-gradient-to-r from-blue-600/25 to-cyan-500/10 text-cyan-300 border border-blue-400/25 shadow-sm'
                    : isPremiumNav
                      ? 'text-amber-300 hover:bg-amber-500/10 border border-transparent'
                      : 'text-slate-300 hover:text-white hover:bg-white/5 border border-transparent'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate flex-1">{t(item.labelKey)}</span>
              {item.id === 'notifications' && unreadCount > 0 ? (
                <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold font-mono-num">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ) : null}
              {item.id === 'nova-scan' ? (
                <span className="text-[9px] font-bold tracking-widest uppercase text-amber-300">
                  PRO
                </span>
              ) : null}
            </NavLink>
          );
        })}
      </nav>

      <div
        className={`p-3 space-y-2 shrink-0 ${
          isPro ? 'border-t border-amber-400/20' : 'border-t border-blue-400/15'
        }`}
      >
        {shopProfile || user ? (
          <div
            className={`px-3.5 py-3 rounded-2xl ${
              isPro
                ? 'bg-[#0F152A] border border-amber-400/25'
                : 'bg-[#0D1A38] border border-blue-400/10'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium text-white truncate">
                {shopProfile?.shopName || user?.displayName || 'Dukaan'}
              </div>
              {isPro ? <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" /> : null}
            </div>
            <div className="text-xs text-slate-400 truncate">
              {user?.email || 'Not signed in'}
            </div>
          </div>
        ) : null}

        {user ? (
          <button
            type="button"
            onClick={() => void logout()}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl text-sm font-medium text-slate-300 hover:text-rose-300 hover:bg-rose-500/10 transition-colors whitespace-nowrap"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>{t('nav.logout')}</span>
          </button>
        ) : null}
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-[260px] shrink-0 h-screen sticky top-0">
        {navContent}
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative w-72 max-w-[85vw] h-full z-10">{navContent}</div>
        </div>
      ) : null}
    </>
  );
}
