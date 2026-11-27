import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, Lock, Power, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';

interface ProModeSwitchProps {
  variant?: 'compact' | 'card';
}

/**
 * Unique Royal Vault Dial / Mechanical Slide Switch for toggling between
 * Premier (Pro) Mode and Normal (Free) Mode.
 * Only unlocked for accounts that own Lifetime Premier (`subscriptionStatus === 'premium_active'`).
 * Switching OFF preserves Premier ownership so turning back ON requires zero repayment.
 */
export function ProModeSwitch({ variant = 'card' }: ProModeSwitchProps) {
  const { hasPremierAccess, isProMode, toggleProMode } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const isHindi = language === 'hi';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async () => {
    if (!hasPremierAccess || busy) return;
    setBusy(true);
    setError(null);
    try {
      await toggleProMode(!isProMode);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isHindi
            ? 'मोड बदलने में समस्या आई।'
            : 'Unable to switch Premier mode.'
      );
    } finally {
      setBusy(false);
    }
  };

  if (variant === 'compact') {
    if (!hasPremierAccess) return null;

    return (
      <button
        type="button"
        role="switch"
        aria-checked={isProMode}
        aria-label={
          isProMode
            ? isHindi
              ? 'Premier मोड चालू है — Normal फ्री मोड में जाने के लिए दबाएं'
              : 'Premier Mode ON — tap to switch to Normal Free Mode'
            : isHindi
              ? 'Normal फ्री मोड चालू है — बिना पेमेंट Premier मोड चालू करें'
              : 'Normal Free Mode ON — tap to turn Premier Mode back ON without paying'
        }
        title={
          isProMode
            ? isHindi
              ? 'Premier ON · Normal मोड के लिए दबाएं'
              : 'Premier ON · Switch to Free Mode'
            : isHindi
              ? 'Free मोड · Premier वापस ON करें'
              : 'Free Mode · Turn Premier Back ON'
        }
        disabled={busy}
        onClick={() => void handleToggle()}
        className={`group relative inline-flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-xl border transition-all duration-300 select-none shrink-0 whitespace-nowrap disabled:opacity-60 ${
          isProMode
            ? 'bg-gradient-to-r from-[#1A1405] via-[#261B07] to-[#12162A] border-amber-400/55 text-amber-200 shadow-[0_0_18px_-6px_rgba(245,158,11,0.55)] hover:border-amber-300'
            : 'bg-[#0C1733] border-cyan-400/30 text-slate-200 hover:border-amber-400/50'
        }`}
      >
        {/* Engraved kinetic rail track */}
        <span
          aria-hidden="true"
          className={`relative w-10 h-5 rounded-lg border flex items-center px-0.5 transition-colors duration-300 ${
            isProMode
              ? 'bg-amber-500/20 border-amber-400/60'
              : 'bg-[#070E20] border-slate-600/60'
          }`}
        >
          <span
            className={`w-4 h-4 rounded-md flex items-center justify-center transition-all duration-300 shadow-sm ${
              isProMode
                ? 'translate-x-5 bg-gradient-to-br from-amber-300 to-amber-500 text-slate-950 rotate-0'
                : 'translate-x-0 bg-slate-600 text-slate-200 -rotate-12'
            }`}
          >
            {isProMode ? <Crown className="w-2.5 h-2.5" /> : <Power className="w-2.5 h-2.5" />}
          </span>
        </span>

        <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wider uppercase font-mono-num">
          <span
            aria-hidden="true"
            className={`w-1.5 h-1.5 rounded-sm transition-colors ${
              isProMode ? 'bg-amber-400' : 'bg-slate-400'
            }`}
          />
          <span>{isProMode ? 'PRO ON' : 'FREE'}</span>
        </span>
      </button>
    );
  }

  return (
    <div
      className={`rounded-2xl p-5 border transition-all duration-300 space-y-3 ${
        hasPremierAccess
          ? isProMode
            ? 'pro-card border-amber-400/45 shadow-[0_14px_34px_-18px_rgba(245,158,11,0.35)]'
            : 'glass-surface-elevated border-cyan-400/30'
          : 'glass-surface border-blue-400/20'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          {/* Bespoke Medallion Emblem */}
          <div
            className={`relative w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 transition-all duration-300 ${
              hasPremierAccess
                ? isProMode
                  ? 'bg-gradient-to-br from-amber-400/25 via-amber-500/15 to-transparent border-amber-400/55 text-amber-300'
                  : 'bg-[#0A1530] border-cyan-400/35 text-cyan-300'
                : 'bg-[#091228] border-slate-700 text-slate-400'
            }`}
          >
            {hasPremierAccess ? (
              isProMode ? (
                <Crown className="w-6 h-6" />
              ) : (
                <ShieldCheck className="w-6 h-6" />
              )
            ) : (
              <Lock className="w-5 h-5" />
            )}
            {hasPremierAccess && isProMode ? (
              <Sparkles className="w-3.5 h-3.5 text-amber-200 absolute -top-1 -right-1" />
            ) : null}
          </div>

          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-white font-display">
                {isHindi ? 'Premier मोड स्विच (Pro ↔ Free)' : 'Premier Mode Switch (Pro ↔ Free)'}
              </h3>
              {hasPremierAccess ? (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                    isProMode
                      ? 'bg-amber-500/20 border-amber-400/45 text-amber-200'
                      : 'bg-cyan-500/15 border-cyan-400/35 text-cyan-200'
                  }`}
                >
                  {isProMode
                    ? isHindi
                      ? 'PRO चालू है'
                      : 'PRO ON'
                    : isHindi
                      ? 'NORMAL / FREE मोड'
                      : 'FREE MODE'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-800 border border-slate-600/60 text-slate-300">
                  {isHindi ? 'केवल Premier यूज़र' : 'PREMIER ONLY'}
                </span>
              )}
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {hasPremierAccess
                ? isProMode
                  ? isHindi
                    ? 'आपका Lifetime Premier प्लान सक्रिय है। कभी भी Normal (Free) मोड देखने के लिए स्विच OFF करें — आपका Pro प्लान सुरक्षित रहेगा।'
                    : 'Your Lifetime Premier access is active. Switch OFF anytime to use Normal (Free) mode — your Premier status remains safe.'
                  : isHindi
                    ? 'अभी आप Normal (Free) मोड में हैं, लेकिन आपका Premier प्लान सुरक्षित है। बिना किसी पेमेंट के वापस ON दबाकर Pro में जाएं।'
                    : 'You are currently in Normal (Free) mode while keeping full Premier ownership. Flip ON anytime to re-enter Pro Mode with zero payment.'
                : isHindi
                  ? 'यह खास ON/OFF स्विच केवल उन यूज़र्स के लिए काम करता है जिन्होंने Premier (₹199 लाइफटाइम) खरीदा है।'
                  : 'This exclusive ON/OFF switch only works for users who have unlocked the Lifetime Premier (₹199) plan.'}
            </p>
          </div>
        </div>

        {/* Unique Dual-Rail Mechanical Vault Switch */}
        <div className="shrink-0 flex items-center gap-3 self-start sm:self-center">
          {hasPremierAccess ? (
            <button
              type="button"
              role="switch"
              aria-checked={isProMode}
              aria-label={
                isHindi
                  ? 'Premier मोड ऑन/ऑफ स्विच'
                  : 'Toggle Premier Mode ON or OFF'
              }
              disabled={busy}
              onClick={() => void handleToggle()}
              className={`group relative w-40 h-12 rounded-xl border p-1.5 flex items-center justify-between transition-all duration-300 disabled:opacity-60 ${
                isProMode
                  ? 'bg-gradient-to-r from-[#1A1306] via-[#281C08] to-[#151A2E] border-amber-400/65 shadow-[0_8px_24px_-10px_rgba(245,158,11,0.65)] hover:border-amber-300'
                  : 'bg-[#081229] border-blue-400/35 hover:border-amber-400/50'
              }`}
            >
              {/* Dual Rail Labels */}
              <span
                className={`z-10 w-1/2 text-center text-[11px] font-bold tracking-wider uppercase font-mono-num transition-colors ${
                  !isProMode ? 'text-cyan-200' : 'text-slate-500'
                }`}
              >
                FREE
              </span>
              <span
                className={`z-10 w-1/2 text-center text-[11px] font-bold tracking-wider uppercase font-mono-num transition-colors ${
                  isProMode ? 'text-slate-950' : 'text-slate-400'
                }`}
              >
                PRO
              </span>

              {/* Sliding Metallic Shuttle */}
              <span
                aria-hidden="true"
                className={`absolute top-1.5 bottom-1.5 w-[calc(50%-6px)] rounded-lg flex items-center justify-center transition-all duration-300 ${
                  isProMode
                    ? 'translate-x-[calc(100%+4px)] bg-gradient-to-br from-amber-300 via-amber-400 to-amber-500 shadow-[0_4px_14px_rgba(245,158,11,0.5)]'
                    : 'translate-x-0 bg-gradient-to-br from-slate-700 to-slate-800 border border-cyan-400/40'
                }`}
              />
            </button>
          ) : (
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                role="switch"
                aria-checked={false}
                aria-disabled="true"
                disabled
                aria-label={
                  isHindi
                    ? 'Premier मोड स्विच लॉक है (केवल Premier मेंबर्स के लिए)'
                    : 'Premier Mode switch locked (only for Premier members)'
                }
                className="relative w-32 h-11 rounded-xl border border-slate-700/80 bg-[#081022] p-1.5 flex items-center justify-between opacity-75 cursor-not-allowed"
              >
                <span className="z-10 w-1/2 text-center text-[10px] font-bold uppercase font-mono-num text-slate-300">
                  FREE
                </span>
                <span className="z-10 w-1/2 text-center text-[10px] font-bold uppercase font-mono-num text-slate-500 flex items-center justify-center gap-1">
                  <Lock className="w-3 h-3" />
                  <span>PRO</span>
                </span>
                <span
                  aria-hidden="true"
                  className="absolute top-1.5 bottom-1.5 left-1.5 w-[calc(50%-6px)] rounded-lg bg-slate-800 border border-slate-600/60"
                />
              </button>

              <button
                type="button"
                onClick={() => navigate('/premium/pay')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-bold whitespace-nowrap shrink-0 transition-colors"
              >
                <Crown className="w-3.5 h-3.5" />
                <span>{isHindi ? 'Pro लें ₹199' : 'Unlock ₹199'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {error ? (
        <div role="alert" className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-2">
          {error}
        </div>
      ) : null}
    </div>
  );
}
