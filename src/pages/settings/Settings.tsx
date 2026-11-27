import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  BellOff,
  BellRing,
  CheckCircle2,
  Crown,
  Download,
  Languages,
  LifeBuoy,
  LogOut,
  QrCode,
  ShieldCheck,
  Store,
  Upload,
} from 'lucide-react';
import { AppLayout } from '../../components/layout/AppLayout';
import { ProModeSwitch } from '../../components/common/ProModeSwitch';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { PLAN_CONFIG } from '../../config/planConfig';
import { shopApiFetch } from '../../services/apiClient';
import { getActiveSiteSettings } from '../../services/premiumService';
import {
  readRateBook,
  readShopVault,
  writeRateBook,
  writeShopVault,
  type ShopVaultSnapshot,
} from '../../services/localVault';
import type { ShopProfile, UserProfile } from '../../types/models';
import { buildShopBackupPayload, parseAndValidateShopBackup } from '../../utils/backup';
import { clampReminderIntervalDays } from '../../utils/dueReminders';
import { formatINR, getLocalDateKey } from '../../utils/finance';

export function Settings() {
  const { language, setLanguage, t } = useLanguage();
  const { user, isProMode, shopProfile, logout, refreshProfile } = useAuth();
  const {
    settings: reminderSettings,
    unreadCount,
    browserPermission,
    updateReminderSettings,
    enableBrowserPush,
  } = useNotifications();
  const navigate = useNavigate();
  const isHindi = language === 'hi';
  const isPro = isProMode;
  const cardSurface = isPro ? 'pro-card border-amber-400/30' : 'glass-surface';

  const [intervalDaysInput, setIntervalDaysInput] = useState(
    String(reminderSettings.intervalDays || 7)
  );
  const [savingReminder, setSavingReminder] = useState(false);
  const [premiumPriceInr, setPremiumPriceInr] = useState<number>(PLAN_CONFIG.premium.priceInr);

  useEffect(() => {
    setIntervalDaysInput(String(reminderSettings.intervalDays || 7));
  }, [reminderSettings.intervalDays]);

  useEffect(() => {
    let active = true;
    getActiveSiteSettings()
      .then((site) => {
        if (active && site?.premiumPriceInr) {
          setPremiumPriceInr(site.premiumPriceInr);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [backupBusy, setBackupBusy] = useState<'export' | 'import' | null>(null);
  const [backupNotice, setBackupNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const handleExportJson = async () => {
    setBackupBusy('export');
    setBackupNotice(null);
    try {
      const vault = readShopVault(user?.uid);
      let exportShopProfile = shopProfile || vault?.shopProfile || null;
      let customers = vault?.customers || [];
      let sales = vault?.sales || [];
      let payments = vault?.payments || [];
      let ledger = vault?.ledger || [];
      let novaProducts = vault?.novaProducts || [];

      if (user) {
        try {
          const synced = await shopApiFetch<{
            userProfile: UserProfile;
            shopProfile: ShopProfile | null;
            customers: ShopVaultSnapshot['customers'];
            sales: ShopVaultSnapshot['sales'];
            payments: ShopVaultSnapshot['payments'];
            ledger: ShopVaultSnapshot['ledger'];
            novaProducts?: ShopVaultSnapshot['novaProducts'];
          }>('/api/shop/sync', {
            method: 'POST',
            body: JSON.stringify({
              shopProfile: exportShopProfile,
              customers,
              sales,
              payments,
              ledger,
              novaProducts,
              rateBook: readRateBook(user.uid),
            }),
          });
          exportShopProfile = synced.shopProfile;
          customers = synced.customers;
          sales = synced.sales;
          payments = synced.payments;
          ledger = synced.ledger;
          novaProducts = synced.novaProducts || [];
          writeShopVault(user.uid, {
            userProfile: synced.userProfile,
            shopProfile: synced.shopProfile,
            customers,
            sales,
            payments,
            ledger,
            novaProducts,
          });
        } catch {
          // Fall back to cached local vault if offline
        }
      }

      const payload = buildShopBackupPayload({
        uid: user?.uid,
        shopProfile: exportShopProfile,
        customers,
        sales,
        payments,
        ledger,
        novaProducts,
        rateBook: readRateBook(user?.uid),
      });

      const jsonText = JSON.stringify(payload, null, 2);
      const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const dateStr = getLocalDateKey();
      const a = document.createElement('a');
      a.href = url;
      a.download = `khatanova-backup-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setBackupNotice({
        type: 'success',
        text: isHindi
          ? `बैकअप डाउनलोड हो गया (${customers.length} ग्राहक · ${sales.length} बिक्री · ${payments.length} पेमेंट)`
          : `Backup downloaded (${customers.length} customers · ${sales.length} sales · ${payments.length} payments)`,
      });
    } catch (err) {
      setBackupNotice({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : isHindi
              ? 'बैकअप डाउनलोड नहीं हो सका।'
              : 'Failed to export backup JSON.',
      });
    } finally {
      setBackupBusy(null);
    }
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setBackupBusy('import');
    setBackupNotice(null);
    try {
      const rawText = await file.text();
      const parsed = parseAndValidateShopBackup(rawText);
      if (!parsed.ok) {
        setBackupNotice({ type: 'error', text: parsed.error });
        return;
      }

      if (!user) {
        setBackupNotice({
          type: 'error',
          text: isHindi
            ? 'डेटा रिस्टोर करने के लिए कृपया पहले Google से साइन इन करें।'
            : 'Please sign in with Google first to restore your shop backup.',
        });
        return;
      }

      const synced = await shopApiFetch<{
        userProfile: UserProfile;
        shopProfile: ShopProfile | null;
        customers: ShopVaultSnapshot['customers'];
        sales: ShopVaultSnapshot['sales'];
        payments: ShopVaultSnapshot['payments'];
        ledger: ShopVaultSnapshot['ledger'];
        novaProducts?: ShopVaultSnapshot['novaProducts'];
      }>('/api/shop/sync', {
        method: 'POST',
        body: JSON.stringify({
          shopProfile: parsed.payload.shopProfile,
          customers: parsed.payload.customers,
          sales: parsed.payload.sales,
          payments: parsed.payload.payments,
          ledger: parsed.payload.ledger,
          novaProducts: parsed.payload.novaProducts || [],
          rateBook: parsed.payload.rateBook || [],
        }),
      });

      writeShopVault(user.uid, {
        userProfile: synced.userProfile,
        shopProfile: synced.shopProfile,
        customers: synced.customers,
        sales: synced.sales,
        payments: synced.payments,
        ledger: synced.ledger,
        ...(synced.novaProducts ? { novaProducts: synced.novaProducts } : {}),
      });

      if (parsed.payload.rateBook && parsed.payload.rateBook.length > 0) {
        writeRateBook(user.uid, parsed.payload.rateBook);
      }

      await refreshProfile();

      setBackupNotice({
        type: 'success',
        text: isHindi
          ? `डेटा सफलतापूर्वक रिस्टोर हो गया (${synced.customers.length} ग्राहक · ${synced.sales.length} बिक्री · ${synced.payments.length} पेमेंट)`
          : `Backup restored cleanly (${synced.customers.length} customers · ${synced.sales.length} sales · ${synced.payments.length} payments)`,
      });
    } catch (err) {
      setBackupNotice({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : isHindi
              ? 'बैकअप फ़ाइल रिस्टोर नहीं हो सकी।'
              : 'Failed to restore backup file.',
      });
    } finally {
      setBackupBusy(null);
    }
  };

  return (
    <AppLayout title={t('nav.settings')}>
      <div className="max-w-3xl space-y-4">
        <ProModeSwitch variant="card" />

        <div className={`${cardSurface} rounded-3xl p-5 flex items-center justify-between gap-4`}>
          <div className="flex items-center gap-3">
            <Languages className="w-5 h-5 text-cyan-400 shrink-0" />
            <div>
              <div className="text-sm font-semibold text-white">{t('common.language')}</div>
              <div className="text-xs text-slate-400">Hindi (Default) / English</div>
            </div>
          </div>
          <div className="flex items-center gap-1 p-1 bg-[#0A142D] rounded-full border border-blue-400/15">
            <button
              type="button"
              onClick={() => setLanguage('hi')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium ${
                language === 'hi' ? 'bg-blue-600 text-white' : 'text-slate-300'
              }`}
            >
              हिंदी
            </button>
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium ${
                language === 'en' ? 'bg-blue-600 text-white' : 'text-slate-300'
              }`}
            >
              English
            </button>
          </div>
        </div>

        {/* Smart Automatic Due Reminders (Shopkeeper Only) */}
        <div className={`${cardSurface} rounded-3xl p-5 space-y-4`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span
                className={`w-10 h-10 rounded-2xl border flex items-center justify-center shrink-0 ${
                  isPro
                    ? 'bg-amber-500/15 border-amber-400/30 text-amber-300'
                    : 'bg-blue-600/20 border-cyan-400/30 text-cyan-300'
                }`}
              >
                <Bell className="w-4 h-4" />
              </span>
              <div>
                <div className="text-sm font-semibold text-white">
                  {isHindi
                    ? 'स्मार्ट ऑटोमैटिक बकाया रिमाइंडर (केवल दुकानदार)'
                    : 'Smart Automatic Due Reminders (Shopkeeper Only)'}
                </div>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  {isHindi
                    ? 'ग्राहक का उधार समय पूरा होने पर केवल आपको (दुकानदार को) सूचना मिलेगी — ग्राहकों को कोई मैसेज नहीं जाएगा।'
                    : 'Tracks overdue Udhaar automatically and notifies only you — never sends WhatsApp or messages to customers.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={!user || savingReminder}
              onClick={async () => {
                setSavingReminder(true);
                try {
                  await updateReminderSettings({ enabled: !reminderSettings.enabled });
                } finally {
                  setSavingReminder(false);
                }
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors disabled:opacity-50 ${
                reminderSettings.enabled
                  ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
                  : 'bg-slate-800 border-slate-600/50 text-slate-300'
              }`}
            >
              {reminderSettings.enabled ? (
                <Bell className="w-3.5 h-3.5" />
              ) : (
                <BellOff className="w-3.5 h-3.5" />
              )}
              <span>
                {reminderSettings.enabled
                  ? isHindi
                    ? 'चालू (ON)'
                    : 'Enabled (ON)'
                  : isHindi
                    ? 'बंद (OFF)'
                    : 'Paused (OFF)'}
              </span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <label htmlFor="settings-interval-days" className="text-xs text-slate-300">
              {isHindi ? 'रिमाइंडर अंतराल (दिन):' : 'Reminder interval (days):'}
            </label>
            <input
              id="settings-interval-days"
              type="number"
              min={1}
              max={365}
              value={intervalDaysInput}
              onChange={(e) => setIntervalDaysInput(e.target.value)}
              className="w-24 px-3 py-1.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-xs text-white font-mono-num focus:outline-none focus:border-cyan-400"
            />
            <button
              type="button"
              disabled={!user || savingReminder}
              onClick={async () => {
                const days = clampReminderIntervalDays(intervalDaysInput);
                setIntervalDaysInput(String(days));
                setSavingReminder(true);
                try {
                  await updateReminderSettings({ intervalDays: days });
                } finally {
                  setSavingReminder(false);
                }
              }}
              className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold"
            >
              {isHindi ? 'सेव करें' : 'Save'}
            </button>
            <button
              type="button"
              disabled={!user || browserPermission === 'unsupported'}
              onClick={() => void enableBrowserPush()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-400/35 text-cyan-200 text-xs font-medium disabled:opacity-50"
            >
              <BellRing className="w-3.5 h-3.5" />
              <span>
                {browserPermission === 'granted' && reminderSettings.browserPushEnabled
                  ? isHindi
                    ? 'ब्राउज़र पुश चालू'
                    : 'Browser Push On'
                  : isHindi
                    ? 'ब्राउज़र पुश चालू करें'
                    : 'Enable Push'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/notifications')}
              className="ml-auto text-xs font-semibold text-cyan-300 hover:underline"
            >
              {isHindi
                ? `सूचना इतिहास (${unreadCount} नई) →`
                : `Notification History (${unreadCount} new) →`}
            </button>
          </div>
        </div>

        {/* Full JSON Data Export & Restore Backup */}
        <div className={`${cardSurface} rounded-3xl p-5 space-y-4`}>
          <div className="flex items-start gap-3">
            <span
              className={`w-10 h-10 rounded-2xl border flex items-center justify-center shrink-0 ${
                isPro
                  ? 'bg-amber-500/15 border-amber-400/30 text-amber-300'
                  : 'bg-emerald-500/15 border-emerald-400/25 text-emerald-300'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">
                {isHindi ? 'डेटा बैकअप और रिस्टोर (JSON)' : 'Shop Data Backup & Restore (JSON)'}
              </div>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                {isHindi
                  ? 'अपनी दुकान का पूरा डेटा (दुकान प्रोफ़ाइल, ग्राहक, बिक्री, पेमेंट व खाता) JSON फ़ाइल में डाउनलोड करें या पुरानी बैकअप फ़ाइल से तुरंत वापस रिस्टोर करें।'
                  : 'Download your entire shop data (profile, customers, sales, payments & ledger) as a JSON file, or import a JSON backup file to restore it.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleExportJson()}
              disabled={backupBusy !== null}
              className={`inline-flex items-center gap-2 px-4 py-2.5 min-h-[42px] rounded-full text-xs font-semibold transition-colors disabled:opacity-50 ${
                isPro
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                  : 'bg-blue-600 hover:bg-blue-500 text-white'
              }`}
            >
              <Download className="w-4 h-4" />
              <span>
                {backupBusy === 'export'
                  ? isHindi
                    ? 'बैकअप बन रहा है...'
                    : 'Exporting...'
                  : isHindi
                    ? 'पूरा डेटा डाउनलोड करें (Export JSON)'
                    : 'Export Shop Data (JSON)'}
              </span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={(e) => void handleImportFileChange(e)}
              className="hidden"
              aria-label={isHindi ? 'JSON बैकअप फ़ाइल चुनें' : 'Select JSON backup file'}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={backupBusy !== null}
              className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[42px] rounded-full bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-400/35 text-emerald-200 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              <span>
                {backupBusy === 'import'
                  ? isHindi
                    ? 'रिस्टोर हो रहा है...'
                    : 'Restoring...'
                  : isHindi
                    ? 'बैकअप फ़ाइल से रिस्टोर करें (Import JSON)'
                    : 'Import & Restore Backup (JSON)'}
              </span>
            </button>
          </div>

          {backupNotice ? (
            <div
              role="status"
              className={`rounded-xl px-3.5 py-2.5 text-xs flex items-center gap-2 border ${
                backupNotice.type === 'success'
                  ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-200'
                  : 'bg-rose-500/15 border-rose-400/30 text-rose-200'
              }`}
            >
              {backupNotice.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-300" />
              ) : null}
              <span>{backupNotice.text}</span>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => navigate('/profile#payment-scanner')}
          className={`w-full ${cardSurface} hover:border-violet-400/45 rounded-3xl p-5 flex items-center justify-between text-left transition-all hover:-translate-y-0.5`}
        >
          <div className="flex items-center gap-3">
            <QrCode className="w-5 h-5 text-violet-300" />
            <div>
              <div className="text-sm font-semibold text-white">
                {isHindi ? 'पेमेंट स्कैनर और UPI ID (PhonePe / UPI)' : 'Payment Scanner & UPI ID (PhonePe / UPI)'}
              </div>
              <div className="text-xs text-slate-400">
                {shopProfile?.paymentUpiId
                  ? `${isHindi ? 'सेव किया गया UPI:' : 'Saved UPI:'} ${shopProfile.paymentUpiId}`
                  : isHindi
                    ? 'गैलरी से QR अपलोड करें व UPI ID सेव करें (Pro बिल स्कैनर के लिए)'
                    : 'Upload gallery QR & type UPI ID for Pro amount-locked invoice scanner'}
              </div>
            </div>
          </div>
          <span className="text-xs text-violet-300 shrink-0">
            {shopProfile?.paymentUpiId ? (isHindi ? 'बदलें' : 'Edit') : isHindi ? 'सेटअप' : 'Setup'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => navigate('/profile')}
          className={`w-full ${cardSurface} hover:border-blue-400/35 rounded-3xl p-5 flex items-center justify-between text-left transition-all hover:-translate-y-0.5`}
        >
          <div className="flex items-center gap-3">
            <Store className="w-5 h-5 text-blue-400" />
            <div>
              <div className="text-sm font-semibold text-white">{t('nav.profile')}</div>
              <div className="text-xs text-slate-400">Shop details, address, GST, WhatsApp & Scanner</div>
            </div>
          </div>
          <span className="text-xs text-cyan-300">Open</span>
        </button>

        <button
          type="button"
          onClick={() => navigate('/premium')}
          className={`w-full ${cardSurface} hover:border-amber-400/40 rounded-3xl p-5 flex items-center justify-between text-left transition-all hover:-translate-y-0.5`}
        >
          <div className="flex items-center gap-3">
            <Crown className="w-5 h-5 text-amber-400" />
            <div>
              <div className="text-sm font-semibold text-white">{t('nav.premium')}</div>
              <div className="text-xs text-slate-400">
                {formatINR(premiumPriceInr)} One-Time Lifetime Plan
              </div>
            </div>
          </div>
          <span className="text-xs text-amber-300">View</span>
        </button>

        <button
          type="button"
          onClick={() => navigate('/support')}
          className={`w-full ${cardSurface} hover:border-blue-400/35 rounded-3xl p-5 flex items-center justify-between text-left transition-all hover:-translate-y-0.5`}
        >
          <div className="flex items-center gap-3">
            <LifeBuoy className="w-5 h-5 text-cyan-400" />
            <div>
              <div className="text-sm font-semibold text-white">{t('nav.support')}</div>
              <div className="text-xs text-slate-400">Contact website owner & view ticket replies</div>
            </div>
          </div>
          <span className="text-xs text-cyan-300">Open</span>
        </button>

        {user ? (
          <button
            type="button"
            onClick={() => void logout()}
            className={`w-full ${cardSurface} hover:border-rose-500/40 rounded-3xl p-5 flex items-center gap-3 text-rose-300 text-sm font-semibold`}
          >
            <LogOut className="w-5 h-5" />
            <span>{t('nav.logout')}</span>
          </button>
        ) : null}
      </div>
    </AppLayout>
  );
}
