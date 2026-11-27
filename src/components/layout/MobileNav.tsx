import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  BookOpenCheck,
  Home,
  Menu,
  ReceiptIndianRupee,
  ScanBarcode,
  Users,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';

interface MobileNavProps {
  onOpenMore: () => void;
}

export function MobileNav({ onOpenMore }: MobileNavProps) {
  const { t } = useLanguage();
  const { isProMode } = useAuth();
  const isPro = isProMode;

  const items = [
    { path: '/', label: t('nav.home'), icon: Home },
    { path: '/sales', label: t('nav.sales'), icon: ReceiptIndianRupee },
    { path: '/customers', label: t('nav.customers'), icon: Users },
    { path: '/nova-scan', label: t('nav.novaScan'), icon: ScanBarcode },
    { path: '/udhaar', label: t('nav.udhaar').replace(' Khata', ''), icon: BookOpenCheck },
  ];

  return (
    <nav
      aria-label="Mobile Bottom Navigation"
      className={`lg:hidden fixed bottom-0 inset-x-0 z-30 h-14 backdrop-blur-md px-1.5 grid grid-cols-6 items-center ${
        isPro
          ? 'bg-[#070B19]/95 border-t border-amber-400/25 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.8)]'
          : 'bg-[#081229]/95 border-t border-blue-400/15 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.8)]'
      }`}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `min-h-[44px] flex flex-col items-center justify-center gap-0.5 py-1 rounded-2xl text-[10px] font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? isPro
                    ? 'text-amber-300'
                    : 'text-cyan-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`px-2.5 py-0.5 rounded-full flex items-center justify-center transition-colors ${
                    isActive
                      ? isPro
                        ? 'bg-amber-500/20'
                        : 'bg-cyan-500/20'
                      : ''
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                </span>
                <span className="truncate max-w-[56px] leading-tight">{item.label}</span>
              </>
            )}
          </NavLink>
        );
      })}
      <button
        type="button"
        onClick={onOpenMore}
        className="min-h-[44px] flex flex-col items-center justify-center gap-0.5 py-1 rounded-2xl text-[10px] font-medium text-slate-400 hover:text-slate-200 transition-colors whitespace-nowrap"
      >
        <span className="px-2.5 py-0.5 rounded-full flex items-center justify-center">
          <Menu className="w-4 h-4 shrink-0" />
        </span>
        <span className="leading-tight">{t('nav.more')}</span>
      </button>
    </nav>
  );
}
