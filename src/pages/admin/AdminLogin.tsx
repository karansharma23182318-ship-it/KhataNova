import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Eye, EyeOff, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { useLanguage } from '../../context/LanguageContext';

export function AdminLogin() {
  const {
    isAdminAuthenticated,
    statusLoaded,
    needsClaim,
    adminLoading,
    adminError,
    retryAfterSeconds,
    claimAdminPassword,
    loginAdmin,
    clearAdminError,
  } = useAdminAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const isHindi = language === 'hi';

  useEffect(() => {
    if (isAdminAuthenticated) {
      navigate('/admin', { replace: true });
    }
  }, [isAdminAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearAdminError();

    const trimmed = password.trim();
    if (!trimmed) {
      setLocalError(isHindi ? 'कृपया एडमिन पासवर्ड दर्ज करें।' : 'Please enter the admin password.');
      return;
    }

    if (needsClaim) {
      if (trimmed.length < 6) {
        setLocalError(
          isHindi
            ? 'पासवर्ड कम से कम 6 अक्षरों/अंकों का होना चाहिए।'
            : 'Password must be at least 6 characters.'
        );
        return;
      }
      if (trimmed !== confirmPassword.trim()) {
        setLocalError(
          isHindi ? 'दोनों पासवर्ड मेल नहीं खा रहे हैं।' : 'Passwords do not match.'
        );
        return;
      }
      const res = await claimAdminPassword(trimmed);
      if (res.ok) {
        setPassword('');
        setConfirmPassword('');
        navigate('/admin', { replace: true });
      }
      return;
    }

    const res = await loginAdmin(trimmed);
    if (res.ok) {
      setPassword('');
      navigate('/admin', { replace: true });
    }
  };

  const activeError = localError || adminError;

  return (
    <div className="min-h-screen bg-[#050B1A] text-slate-100 flex items-center justify-center p-4 sm:p-6">
      <div className="max-w-md w-full glass-surface-elevated rounded-3xl p-6 sm:p-7 space-y-6 border border-blue-400/20">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{isHindi ? 'खातानोवा ऐप पर वापस जाएँ' : 'Back to KhataNova'}</span>
        </button>

        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-300 shrink-0">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white font-display">
              {isHindi ? 'ओनर एडमिन कंसोल' : 'Owner Admin Console'}
            </h1>
            <p className="text-xs text-slate-400">
              {needsClaim
                ? isHindi
                  ? 'पहली बार एडमिन पासवर्ड सेट करें'
                  : 'First-time owner passcode setup'
                : isHindi
                  ? 'एडमिन पैनल खोलने के लिए पासवर्ड दर्ज करें'
                  : 'Enter owner password to unlock'}
            </p>
          </div>
        </div>

        {!statusLoaded ? (
          <div className="py-8 text-center text-sm text-slate-400">
            {isHindi ? 'एडमिन स्थिति जाँची जा रही है...' : 'Checking admin status...'}
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            {needsClaim ? (
              <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-400/25 text-xs text-blue-100 leading-relaxed">
                {isHindi
                  ? 'अभी कोई एडमिन पासवर्ड सेट नहीं है। अपना निजी ओनर पासवर्ड सेट करें — सेव होने के बाद यह सर्वर पर सुरक्षित हैश होकर लॉक हो जाएगा।'
                  : 'No admin passcode is configured yet. Claim your owner passcode below — once set, it is hashed and locked on the server.'}
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label htmlFor="admin-password" className="block text-xs font-medium text-slate-300">
                {needsClaim
                  ? isHindi
                    ? 'नया एडमिन पासवर्ड'
                    : 'New Admin Password'
                  : isHindi
                    ? 'एडमिन पासवर्ड'
                    : 'Admin Password'}
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (localError) setLocalError(null);
                  }}
                  autoComplete={needsClaim ? 'new-password' : 'current-password'}
                  autoFocus
                  disabled={adminLoading || retryAfterSeconds > 0}
                  placeholder={isHindi ? 'पासवर्ड दर्ज करें' : 'Enter password'}
                  className="w-full pl-10 pr-11 py-3 rounded-2xl bg-[#09142F] border border-blue-400/25 focus:border-cyan-400/60 focus:outline-none text-sm text-white placeholder:text-slate-500 font-mono-num"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {needsClaim ? (
              <div className="space-y-1.5">
                <label
                  htmlFor="admin-password-confirm"
                  className="block text-xs font-medium text-slate-300"
                >
                  {isHindi ? 'पासवर्ड दोबारा दर्ज करें' : 'Confirm Admin Password'}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="admin-password-confirm"
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (localError) setLocalError(null);
                    }}
                    autoComplete="new-password"
                    disabled={adminLoading}
                    placeholder={isHindi ? 'पासवर्ड की पुष्टि करें' : 'Confirm password'}
                    className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#09142F] border border-blue-400/25 focus:border-cyan-400/60 focus:outline-none text-sm text-white placeholder:text-slate-500 font-mono-num"
                  />
                </div>
              </div>
            ) : null}

            {activeError ? (
              <div
                role="alert"
                className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200 flex items-start gap-2.5"
              >
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p>{activeError}</p>
                  {retryAfterSeconds > 0 ? (
                    <p className="font-mono-num text-rose-300">
                      {isHindi
                        ? `पुनः प्रयास करें: ${retryAfterSeconds} सेकंड में`
                        : `Retry available in ${retryAfterSeconds}s`}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={adminLoading || retryAfterSeconds > 0}
              className="w-full py-3.5 min-h-[48px] rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all shadow-lg shadow-blue-900/30"
            >
              {adminLoading
                ? isHindi
                  ? 'सत्यापित किया जा रहा है...'
                  : 'Verifying...'
                : needsClaim
                  ? isHindi
                    ? 'पासवर्ड सेट करें और पैनल खोलें'
                    : 'Set Password & Unlock Admin'
                  : isHindi
                    ? 'एडमिन पैनल खोलें'
                    : 'Unlock Admin Console'}
            </button>

            <div className="pt-2 flex items-center gap-2 text-xs text-slate-400">
              <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>
                {isHindi
                  ? 'Gmail की आवश्यकता नहीं — पासवर्ड केवल सर्वर पर सुरक्षित रूप से जाँचा जाता है।'
                  : 'No Gmail required — password is verified exclusively on the server.'}
              </span>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
