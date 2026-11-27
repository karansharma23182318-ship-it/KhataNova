import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Crown } from 'lucide-react';
import { AppLayout } from '../../components/layout/AppLayout';
import { ProModeSwitch } from '../../components/common/ProModeSwitch';
import { PLAN_CONFIG } from '../../config/planConfig';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { getActiveSiteSettings } from '../../services/premiumService';
import { formatINR } from '../../utils/finance';

export function PremiumPlan() {
  const { language, t } = useLanguage();
  const { userProfile, hasPremierAccess, isProMode } = useAuth();
  const navigate = useNavigate();
  const isHindi = language === 'hi';
  const [priceInr, setPriceInr] = useState(PLAN_CONFIG.premium.priceInr);
  const [planNotice, setPlanNotice] = useState('');

  useEffect(() => {
    getActiveSiteSettings()
      .then((site) => {
        if (site?.premiumPriceInr) setPriceInr(site.premiumPriceInr);
        if (site?.planNotice) setPlanNotice(site.planNotice);
      })
      .catch(() => {});
  }, []);

  const status = userProfile?.subscriptionStatus || 'free';
  const freeFeatures = language === 'hi' ? PLAN_CONFIG.free.featuresHi : PLAN_CONFIG.free.featuresEn;
  const premiumFeatures =
    language === 'hi' ? PLAN_CONFIG.premium.featuresHi : PLAN_CONFIG.premium.featuresEn;

  return (
    <AppLayout title={t('nav.premium')}>
      <div className="max-w-4xl space-y-6">
        <div className="glass-surface-elevated rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs text-slate-400">
              {isHindi ? 'वर्तमान प्लान स्थिति' : 'Current Plan Status'}
            </div>
            <div className="text-lg font-bold text-white font-display">
              {hasPremierAccess
                ? isProMode
                  ? isHindi
                    ? 'Lifetime Premier अनलॉक ✅ (Pro मोड चालू)'
                    : 'Lifetime Premier Owned ✅ (Pro Mode ON)'
                  : isHindi
                    ? 'Lifetime Premier अनलॉक ✅ (अभी Normal / Free मोड)'
                    : 'Lifetime Premier Owned ✅ (Currently Normal / Free Mode)'
                : status.replace('_', ' ')}
            </div>
            {planNotice ? (
              <div className="text-xs text-cyan-300 mt-0.5">{planNotice}</div>
            ) : null}
          </div>
          {!hasPremierAccess ? (
            <button
              type="button"
              onClick={() => navigate('/premium/pay')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-semibold text-sm whitespace-nowrap shrink-0"
            >
              <Crown className="w-4 h-4" />
              <span>Upgrade to {formatINR(priceInr)} Lifetime</span>
            </button>
          ) : null}
        </div>

        <ProModeSwitch variant="card" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="glass-surface rounded-2xl p-6 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-white">Free Plan</h2>
              <div className="text-2xl font-bold font-mono-num text-slate-200 mt-1">₹0</div>
            </div>
            <ul className="space-y-2.5 text-sm text-slate-300">
              {freeFeatures.map((feat) => (
                <li key={feat} className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="glass-surface-elevated rounded-2xl p-6 space-y-4 border-amber-400/30">
            <div>
              <h2 className="text-lg font-bold text-amber-300">Lifetime Premium</h2>
              <div className="text-2xl font-bold font-mono-num text-white mt-1">
                {formatINR(priceInr)}{' '}
                <span className="text-xs font-normal text-slate-400">One-Time</span>
              </div>
            </div>
            <ul className="space-y-2.5 text-sm text-slate-200">
              {premiumFeatures.map((feat) => (
                <li key={feat} className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
