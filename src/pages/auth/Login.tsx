import React from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Languages, ShieldCheck, Store } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';

export function Login() {
  const {
    loginWithGoogle,
    loginWithGoogleRedirect,
    canRetryRedirect,
    authLoading,
    authError,
    authReady,
    user,
    shopProfile,
  } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!authReady || !user) return;
    if (shopProfile) {
      navigate('/', { replace: true });
    } else {
      navigate('/setup', { replace: true });
    }
  }, [authReady, user, shopProfile, navigate]);

  return (
    <div className="min-h-screen bg-[#060D1E] text-slate-100 flex flex-col justify-between p-6">
      <header className="max-w-5xl w-full mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="KhataNova" className="w-9 h-9 rounded-xl" />
          <span className="text-xl font-bold text-white font-display">KhataNova</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLanguage(language === 'hi' ? 'en' : 'hi')}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-full border border-blue-400/20 bg-[#0D1A38] text-xs font-medium text-slate-200 hover:border-cyan-400/40"
          >
            <Languages className="w-3.5 h-3.5 text-cyan-400" />
            <span>{language === 'hi' ? 'हिं / EN' : 'EN / हिं'}</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin/login')}
            aria-label={t('nav.adminAccess')}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-2xl border border-blue-400/20 bg-[#0D1A38] text-slate-300 hover:text-amber-300"
          >
            <KeyRound className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-lg w-full mx-auto my-12">
        <div className="glass-surface-elevated rounded-3xl p-6 sm:p-8 space-y-6">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-400/30 flex items-center justify-center text-cyan-300">
            <Store className="w-6 h-6" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-white font-display leading-tight">
              {t('auth.welcomeTitle')}
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              {t('auth.welcomeSubtitle')}
            </p>
          </div>

          {authError ? (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs leading-relaxed space-y-2">
              <p>{authError}</p>
              {canRetryRedirect ? (
                <button
                  type="button"
                  disabled={authLoading}
                  onClick={() => void loginWithGoogleRedirect()}
                  className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/30 text-white text-xs font-medium"
                >
                  {language === 'hi' ? 'Redirect से लॉगिन करें' : 'Try Redirect Sign-In'}
                </button>
              ) : null}
            </div>
          ) : null}

          <button
            type="button"
            disabled={authLoading}
            onClick={() => void loginWithGoogle()}
            className="w-full py-3.5 px-6 min-h-[48px] rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:opacity-60 text-white font-semibold text-sm transition-all flex items-center justify-center gap-3 shadow-lg shadow-blue-950/50"
          >
            <span>{authLoading ? t('auth.signingIn') : t('auth.continueGoogle')}</span>
          </button>

          <div className="pt-4 border-t border-blue-400/15 flex items-center gap-2.5 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>
              {language === 'hi'
                ? 'प्रत्येक दुकान का डेटा अलग और सुरक्षित रहता है।'
                : 'Every shop’s records remain isolated and secured.'}
            </span>
          </div>
        </div>
      </main>

      <footer className="max-w-5xl w-full mx-auto text-center text-xs text-slate-500">
        KhataNova · {t('app.tagline')}
      </footer>
    </div>
  );
}
