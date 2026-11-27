import React, { useEffect, useState } from 'react';
import { Check, CheckCircle2, Crown, Users } from 'lucide-react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { PLAN_CONFIG } from '../../config/planConfig';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { fetchAdminOverview, saveAdminSiteSettings } from '../../services/adminService';
import { formatINR } from '../../utils/finance';

export function PlanManagement() {
  const { adminToken } = useAdminAuth();
  const [priceInr, setPriceInr] = useState(String(PLAN_CONFIG.premium.priceInr));
  const [planNotice, setPlanNotice] = useState('One-time ₹199 Lifetime Upgrade via UPI QR');
  const [freeCount, setFreeCount] = useState(0);
  const [premiumCount, setPremiumCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!adminToken) return;
    fetchAdminOverview(adminToken)
      .then((overview) => {
        setFreeCount(
          overview.users.filter((u) => u.subscriptionStatus === 'free').length
        );
        setPremiumCount(
          overview.users.filter((u) => u.subscriptionStatus === 'premium_active').length
        );
        if (overview.siteSettings) {
          setPriceInr(String(overview.siteSettings.premiumPriceInr || 199));
          setPlanNotice(overview.siteSettings.planNotice || '');
        }
      })
      .catch(() => {
        // Keep safe defaults
      });
  }, [adminToken]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken) return;
    const numericPrice = Number(priceInr);
    if (!Number.isFinite(numericPrice) || numericPrice < 1) {
      setStatus({ type: 'error', text: 'Enter a valid price in ₹ (minimum ₹1).' });
      return;
    }

    setSaving(true);
    setStatus(null);
    try {
      const updated = await saveAdminSiteSettings(adminToken, {
        premiumPriceInr: numericPrice,
        planNotice: planNotice.trim(),
      });
      setPriceInr(String(updated.premiumPriceInr));
      setPlanNotice(updated.planNotice);
      setStatus({
        type: 'success',
        text: `Lifetime Premium Plan updated to ${formatINR(updated.premiumPriceInr)}.`,
      });
    } catch (err) {
      setStatus({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not update plan settings.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout title="Premium Plan Management">
      <div className="space-y-6 max-w-4xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <form onSubmit={(e) => void handleSave(e)} className="glass-surface-elevated rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-300 font-semibold text-base">
                <Crown className="w-5 h-5" />
                <span>Lifetime Premium Pricing</span>
              </div>
              <span className="text-xs font-mono-num text-emerald-300">
                {premiumCount} Active
              </span>
            </div>

            {status ? (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                  status.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-200'
                    : 'bg-rose-500/10 border-rose-400/30 text-rose-200'
                }`}
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{status.text}</span>
              </div>
            ) : null}

            <div>
              <label htmlFor="plan-price" className="block text-xs text-slate-300 mb-1.5">
                Lifetime Upgrade Price (INR ₹)
              </label>
              <input
                id="plan-price"
                type="number"
                min={1}
                value={priceInr}
                onChange={(e) => setPriceInr(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white font-mono-num focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label htmlFor="plan-notice" className="block text-xs text-slate-300 mb-1.5">
                Plan Tagline / Offer Notice
              </label>
              <input
                id="plan-notice"
                value={planNotice}
                onChange={(e) => setPlanNotice(e.target.value)}
                placeholder="One-time ₹199 Lifetime Upgrade via UPI QR"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-semibold"
            >
              {saving ? 'Saving...' : 'Update Plan Settings'}
            </button>
          </form>

          <div className="glass-surface rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-cyan-300 font-semibold text-base">
                <Users className="w-5 h-5" />
                <span>Free Plan vs Premium Features</span>
              </div>
              <span className="text-xs font-mono-num text-slate-300">{freeCount} Free Users</span>
            </div>

            <div className="space-y-2 text-xs text-slate-300">
              <div className="font-semibold text-white">Included in Lifetime Premium:</div>
              {PLAN_CONFIG.premium.featuresEn.map((feat) => (
                <div key={feat} className="flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span>{feat}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
