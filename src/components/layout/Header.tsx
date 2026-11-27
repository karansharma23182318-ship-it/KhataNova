import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell,
  Calculator,
  CheckCheck,
  Crown,
  ExternalLink,
  KeyRound,
  Languages,
  Menu,
  X,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { formatINR } from '../../utils/finance';
import { SmartRateCalculator } from '../calculator/SmartRateCalculator';
import { ProModeSwitch } from '../common/ProModeSwitch';

interface HeaderProps {
  title: string;
  onOpenMobileMenu: () => void;
}

export function Header({ title, onOpenMobileMenu }: HeaderProps) {
  const { language, setLanguage, t } = useLanguage();
  const { user, isProMode, loginWithGoogle } = useAuth();
  const { notifications, unreadCount, markNotificationAsRead } = useNotifications();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const isPro = isProMode;
  const isHindi = language === 'hi';

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'KHATANOVA_OPEN_ROUTE' && typeof event.data.path === 'string') {
        navigate(event.data.path);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);

  const toggleLanguage = () => {
    setLanguage(language === 'hi' ? 'en' : 'hi');
  };

  return (
    <>
      <header
        className={`h-14 sm:h-16 px-3.5 sm:px-6 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between gap-2 sm:gap-4 ${
          isPro
            ? 'bg-[#070B19]/92 border-b border-amber-400/25'
            : 'bg-[#081229]/90 border-b border-blue-400/15'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Open navigation menu"
            className="lg:hidden min-w-[40px] min-h-[40px] flex items-center justify-center rounded-2xl text-slate-300 hover:text-white hover:bg-white/5 shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="text-sm sm:text-lg font-semibold text-white truncate font-display">
            {title}
          </h1>
          {isPro ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold tracking-wider uppercase text-amber-300 shrink-0 whitespace-nowrap">
              <Crown className="w-3.5 h-3.5 text-amber-400" />
              <span>PRO</span>
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <ProModeSwitch variant="compact" />
          <button
            type="button"
            onClick={() => setCalcOpen(true)}
            aria-label={language === 'hi' ? 'स्मार्ट रेट कैलकुलेटर' : 'Smart Rate Calculator'}
            title={language === 'hi' ? 'स्मार्ट रेट कैलकुलेटर' : 'Smart Rate Calculator'}
            className={`min-w-[40px] min-h-[40px] flex items-center justify-center rounded-2xl border transition-colors ${
              isPro
                ? 'border-amber-400/25 bg-[#0D1326] text-amber-300 hover:border-amber-400/50'
                : 'border-blue-400/20 bg-[#0D1A38] text-cyan-300 hover:border-cyan-400/40'
            }`}
          >
            <Calculator className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={toggleLanguage}
            aria-label={t('common.language')}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-full border border-blue-400/20 bg-[#0D1A38] hover:border-cyan-400/40 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0"
          >
            <Languages className="w-3.5 h-3.5 text-cyan-400" />
            <span>{language === 'hi' ? 'हिं / EN' : 'EN / हिं'}</span>
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setNotifOpen((prev) => !prev)}
              aria-label={t('common.notifications')}
              aria-expanded={notifOpen}
              className="relative min-w-[40px] min-h-[40px] flex items-center justify-center rounded-2xl border border-blue-400/20 bg-[#0D1A38] hover:border-cyan-400/40 text-slate-300 hover:text-white transition-colors"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 ? (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold font-mono-num flex items-center justify-center shadow">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ) : null}
            </button>

            {notifOpen ? (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-3xl p-4 shadow-2xl z-40 space-y-3 bg-[#0A142D]/98 backdrop-blur-xl border border-cyan-400/30">
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-blue-400/15">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">
                      {isHindi ? 'बकाया सूचनाएं' : 'Due Reminders'}
                    </span>
                    {unreadCount > 0 ? (
                      <span className="px-1.5 py-0.5 rounded-md bg-rose-500/20 text-rose-300 text-[10px] font-bold font-mono-num">
                        {unreadCount} {isHindi ? 'नई' : 'new'}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => void markNotificationAsRead()}
                        className="inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:text-cyan-200"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span>{isHindi ? 'सभी पढ़ें' : 'Read all'}</span>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setNotifOpen(false)}
                      aria-label={t('common.cancel')}
                      className="text-slate-400 hover:text-white p-1"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {notifications.length === 0 ? (
                  <p className="py-5 text-xs text-slate-400 text-center">
                    {t('common.noNotifications')}
                  </p>
                ) : (
                  <div className="max-h-72 overflow-y-auto space-y-2 pr-0.5">
                    {notifications.slice(0, 6).map((item) => {
                      const isCleared = item.status === 'cleared';
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={async () => {
                            await markNotificationAsRead(item.id);
                            setNotifOpen(false);
                            navigate(`/customers/${item.customerId}`);
                          }}
                          className={`w-full text-left rounded-xl p-3 border transition-colors ${
                            isCleared
                              ? 'bg-[#091224]/70 border-emerald-500/20 hover:border-emerald-400/40'
                              : !item.isRead
                                ? 'bg-blue-600/15 border-cyan-400/35 hover:border-cyan-300/60'
                                : 'bg-[#0A142D]/80 border-blue-400/15 hover:border-cyan-400/35'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-white truncate flex items-center gap-1.5">
                              {!item.isRead && !isCleared ? (
                                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                              ) : null}
                              <span className="truncate">{item.customerName}</span>
                            </span>
                            <span
                              className={`text-[11px] font-mono-num font-semibold shrink-0 ${
                                isCleared ? 'text-emerald-300' : 'text-rose-300'
                              }`}
                            >
                              {isCleared
                                ? isHindi
                                  ? 'जमा ✓'
                                  : 'Cleared'
                                : formatINR(item.pendingAmount)}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                            <span>
                              {isHindi ? 'देय:' : 'Due:'}{' '}
                              {new Date(item.dueDate).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                              })}
                            </span>
                            <span className="text-cyan-300 inline-flex items-center gap-1">
                              <span>{isHindi ? 'खाता' : 'Ledger'}</span>
                              <ExternalLink className="w-3 h-3" />
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="pt-2 border-t border-blue-400/15 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">
                    {isHindi ? 'केवल दुकानदार के लिए' : 'Shopkeeper only'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setNotifOpen(false);
                      navigate('/notifications');
                    }}
                    className="text-xs font-semibold text-cyan-300 hover:underline"
                  >
                    {isHindi ? 'सभी व सेटिंग्स देखें →' : 'View All & Settings →'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => navigate('/admin/login')}
            aria-label={t('nav.adminAccess')}
            title={t('nav.adminAccess')}
            className="p-2.5 rounded-xl border border-blue-400/20 bg-[#0D1A38] hover:border-amber-400/50 text-slate-300 hover:text-amber-300 transition-colors"
          >
            <KeyRound className="w-4 h-4" />
          </button>

          {!user ? (
            <Link
              to="/login"
              onClick={async (e) => {
                e.preventDefault();
                const ok = await loginWithGoogle();
                if (!ok) {
                  navigate('/login');
                }
              }}
              className="hidden sm:inline-flex items-center px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0"
            >
              {t('auth.continueGoogle')}
            </Link>
          ) : null}
        </div>
      </header>

      {calcOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-black/65 backdrop-blur-xs"
            onClick={() => setCalcOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-md h-full bg-[#070F22] border-l border-blue-400/20 overflow-y-auto p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-blue-400/15">
              <span className="text-sm font-semibold text-white font-display">
                {language === 'hi' ? 'स्मार्ट रेट कैलकुलेटर' : 'Smart Rate Calculator'}
              </span>
              <button
                type="button"
                onClick={() => setCalcOpen(false)}
                aria-label="Close calculator"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <SmartRateCalculator variant="drawer" onCloseDrawer={() => setCalcOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
