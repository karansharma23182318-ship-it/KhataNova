import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, ExternalLink } from 'lucide-react';
import { AppLayout } from '../../components/layout/AppLayout';
import {
  canAddMoreCustomers,
  FREE_CUSTOMER_LIMIT,
} from '../../config/planConfig';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  createCustomer,
  findDuplicateMobileCustomers,
  listCustomers,
} from '../../services/customerService';
import type { Customer } from '../../types/models';

export function AddCustomer() {
  const { user, userProfile, hasPremierAccess, isProMode, toggleProMode, shopProfile } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const shopId = shopProfile?.id || user?.uid;
  const isHindi = language === 'hi';
  const isPro = isProMode;

  const [customerCount, setCustomerCount] = useState(0);
  const [name, setName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [openingBalanceText, setOpeningBalanceText] = useState('');
  const [duplicateCustomer, setDuplicateCustomer] = useState<Customer | null>(null);
  const [allowDuplicateSave, setAllowDuplicateSave] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user || !shopId) return;
    listCustomers(shopId)
      .then((list) => setCustomerCount(list.length))
      .catch(() => {
        // fallback if offline
      });
  }, [user, shopId]);

  const limitReached = !canAddMoreCustomers(
    customerCount,
    userProfile?.subscriptionStatus,
    isProMode
  );

  const checkDuplicate = async (mobile: string): Promise<Customer | null> => {
    const cleaned = mobile.trim();
    if (!shopId || cleaned.length < 10) {
      setDuplicateCustomer(null);
      return null;
    }
    try {
      const matches = await findDuplicateMobileCustomers(shopId, cleaned);
      const match = matches[0] || null;
      setDuplicateCustomer(match);
      return match;
    } catch {
      setDuplicateCustomer(null);
      return null;
    }
  };

  const saveCustomerRecord = async (forceAllowDuplicate = false) => {
    if (!user || !shopId) {
      setError(
        isHindi
          ? 'ग्राहक सेव करने के लिए कृपया पहले Google से लॉगिन करें।'
          : 'Please sign in with Google first.'
      );
      return;
    }
    if (limitReached) {
      setError(
        isHindi
          ? `Free प्लान में अधिकतम ${FREE_CUSTOMER_LIMIT} ग्राहक ही जोड़े जा सकते हैं। असीमित ग्राहकों के लिए Pro (₹199) लें।`
          : `Free plan allows up to ${FREE_CUSTOMER_LIMIT} customers. Upgrade to Lifetime Pro (₹199) for unlimited customers.`
      );
      return;
    }
    if (name.trim().length < 2 || mobileNumber.trim().length < 10) {
      setError(
        isHindi
          ? 'कृपया सही ग्राहक का नाम और 10 अंकों का मोबाइल नंबर दर्ज करें।'
          : 'Enter valid customer name and 10-digit mobile number.'
      );
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (!forceAllowDuplicate && !allowDuplicateSave) {
        const existing = duplicateCustomer || (await checkDuplicate(mobileNumber));
        if (existing) {
          setSaving(false);
          return;
        }
      }

      const id = await createCustomer(shopId, {
        name,
        mobileNumber,
        address,
        notes,
        openingBalance: Number(openingBalanceText) || 0,
      });
      navigate(`/customers/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save customer');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveCustomerRecord(false);
  };

  return (
    <AppLayout title={isHindi ? 'नया ग्राहक जोड़ें' : 'Add Customer'}>
      <form
        onSubmit={handleSubmit}
        className={`max-w-xl ${isPro ? 'pro-card' : 'glass-surface'} rounded-2xl p-6 space-y-4`}
      >
        {!isPro ? (
          <div className="text-xs text-slate-300 flex items-center justify-between gap-2 pb-2 border-b border-blue-400/15">
            <span>
              {isHindi
                ? `Free प्लान ग्राहक सीमा: ${customerCount} / ${FREE_CUSTOMER_LIMIT}`
                : `Free Plan Customers: ${customerCount} / ${FREE_CUSTOMER_LIMIT}`}
            </span>
            <span className="text-amber-300 font-medium">
              {isHindi ? 'Pro में असीमित' : 'Unlimited in Pro'}
            </span>
          </div>
        ) : null}

        {limitReached ? (
          <div className="p-4 rounded-xl bg-amber-500/15 border border-amber-400/35 text-amber-100 text-xs space-y-2.5">
            <div className="font-semibold text-sm text-amber-200">
              {hasPremierAccess
                ? isHindi
                  ? 'अभी आप Normal / Free मोड में हैं (10 ग्राहक सीमा)'
                  : 'Normal / Free Mode Active (10-Customer Cap)'
                : isHindi
                  ? '10 ग्राहकों की Free सीमा पूरी हो गई है'
                  : '10-Customer Free Plan Limit Reached'}
            </div>
            <p className="leading-relaxed">
              {hasPremierAccess
                ? isHindi
                  ? 'आपका Premier प्लान पहले से खरीदा हुआ है। बिना किसी पेमेंट के Pro मोड वापस ON करें और असीमित ग्राहक जोड़ें।'
                  : 'You already own Lifetime Premier. Switch Pro Mode back ON with zero payment to add unlimited customers.'
                : isHindi
                  ? 'Free प्लान में आप केवल 10 ग्राहक जोड़ सकते हैं। Pro (₹199 लाइफटाइम) लेकर असीमित (Infinite) ग्राहक जोड़ें और मॉल-स्टाइल PDF बिल भी पाएं।'
                  : 'You can add up to 10 customers on the Free plan. Upgrade to Lifetime Pro (₹199) for unlimited customers and PDF invoices.'}
            </p>
            <button
              type="button"
              onClick={() => (hasPremierAccess ? void toggleProMode(true) : navigate('/premium/pay'))}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs"
            >
              <Crown className="w-4 h-4" />
              <span>
                {hasPremierAccess
                  ? isHindi
                    ? 'बिना पेमेंट Pro ON करें'
                    : 'Turn Pro Mode ON (Free)'
                  : isHindi
                    ? 'Pro अनलॉक करें (₹199)'
                    : 'Upgrade to Pro (₹199)'}
              </span>
            </button>
          </div>
        ) : null}

        {error ? (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs leading-relaxed">
            {error}
          </div>
        ) : null}

        {duplicateCustomer ? (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-400/35 text-amber-100 text-xs space-y-2.5">
            <p className="leading-relaxed">
              {isHindi
                ? `यह मोबाइल नंबर पहले से "${duplicateCustomer.name}" के खाते में सेव है।`
                : `Mobile number already belongs to "${duplicateCustomer.name}".`}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigate(`/customers/${duplicateCustomer.id}`)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 font-medium"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>
                  {isHindi
                    ? `${duplicateCustomer.name} का खाता खोलें`
                    : `Open ${duplicateCustomer.name}'s Khata`}
                </span>
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setAllowDuplicateSave(true);
                  void saveCustomerRecord(true);
                }}
                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 font-medium"
              >
                {isHindi ? 'फिर भी नया ग्राहक जोड़ें' : 'Save New Customer Anyway'}
              </button>
            </div>
          </div>
        ) : null}

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            {isHindi ? 'ग्राहक का नाम *' : 'Customer Name *'}
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isHindi ? 'जैसे: विनय शर्मा' : 'e.g. Vinay Sharma'}
            required
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white placeholder:text-slate-400/55 focus:outline-none focus:border-cyan-400"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            {isHindi ? 'मोबाइल नंबर *' : 'Mobile Number *'}
          </label>
          <input
            value={mobileNumber}
            onChange={(e) => {
              setMobileNumber(e.target.value);
              if (duplicateCustomer) setDuplicateCustomer(null);
              if (allowDuplicateSave) setAllowDuplicateSave(false);
            }}
            onBlur={() => void checkDuplicate(mobileNumber)}
            placeholder={isHindi ? '10 अंकों का मोबाइल नंबर' : '10-digit mobile number'}
            required
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white placeholder:text-slate-400/55 font-mono-num focus:outline-none focus:border-cyan-400"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            {isHindi ? 'पिछला बकाया (Opening Balance ₹)' : 'Opening Balance (₹)'}
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="0"
            value={openingBalanceText}
            onChange={(e) => setOpeningBalanceText(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white placeholder:text-slate-400/55 font-mono-num focus:outline-none focus:border-cyan-400"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            {isHindi ? 'पता (वैकल्पिक)' : 'Address (Optional)'}
          </label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={isHindi ? 'मोहल्ला / गाँव / शहर' : 'Street / Area / City'}
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white placeholder:text-slate-400/55 focus:outline-none focus:border-cyan-400"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            {isHindi ? 'नोट्स (वैकल्पिक)' : 'Notes (Optional)'}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={isHindi ? 'कोई जानकारी...' : 'Optional notes...'}
            rows={2}
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white placeholder:text-slate-400/55 focus:outline-none focus:border-cyan-400"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate('/customers')}
            className="px-4 py-2.5 rounded-xl border border-blue-400/20 text-sm text-slate-300 hover:text-white"
          >
            {isHindi ? 'रद्द करें' : 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={saving || limitReached}
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold"
          >
            {saving
              ? isHindi
                ? 'सेव हो रहा है...'
                : 'Saving...'
              : isHindi
                ? 'ग्राहक सेव करें'
                : 'Save Customer'}
          </button>
        </div>
      </form>
    </AppLayout>
  );
}
