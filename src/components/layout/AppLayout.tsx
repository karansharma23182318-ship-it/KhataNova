import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileNav } from './MobileNav';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';

interface AppLayoutProps {
  title: string;
  children: React.ReactNode;
}

export function AppLayout({ title, children }: AppLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isProMode, isSuspended } = useAuth();
  const { language } = useLanguage();
  const isPro = isProMode;
  const isHindi = language === 'hi';

  return (
    <div
      data-plan={isPro ? 'pro' : 'free'}
      className={`min-h-screen text-slate-100 flex ${isPro ? 'pro-canvas' : 'bg-[#070F22]'}`}
    >
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />

      <div className="flex-1 min-w-0 flex flex-col">
        <Header title={title} onOpenMobileMenu={() => setMobileOpen(true)} />
        <main className="flex-1 p-4 sm:p-6 pb-24 lg:pb-8 max-w-[1400px] w-full mx-auto space-y-4">
          {isSuspended ? (
            <div
              role="alert"
              className="rounded-2xl p-4 bg-rose-500/15 border border-rose-500/40 text-rose-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-300 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed">
                  <div className="font-semibold text-sm text-white">
                    {isHindi ? 'आपका खाता अस्थायी रूप से निलंबित है' : 'Account Suspended'}
                  </div>
                  <p className="text-rose-200/90 mt-0.5">
                    {isHindi
                      ? 'एडमिन द्वारा आपका दुकान खाता निलंबित किया गया है। नया डेटा सेव करने के लिए सपोर्ट से संपर्क करें।'
                      : 'Your shop account has been suspended by the administrator. Please contact Support to reactivate.'}
                  </p>
                </div>
              </div>
              <Link
                to="/support"
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold whitespace-nowrap self-start sm:self-center shrink-0"
              >
                {isHindi ? 'सपोर्ट से बात करें' : 'Contact Support'}
              </Link>
            </div>
          ) : null}
          {children}
        </main>
      </div>

      <MobileNav onOpenMore={() => setMobileOpen(true)} />
    </div>
  );
}
