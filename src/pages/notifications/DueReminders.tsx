import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  BellOff,
  BellRing,
  CheckCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { AppLayout } from '../../components/layout/AppLayout';
import { EmptyState } from '../../components/common/EmptyState';
import { StatCard } from '../../components/common/StatCard';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useNotifications } from '../../context/NotificationContext';
import { clampReminderIntervalDays } from '../../utils/dueReminders';
import { formatINR } from '../../utils/finance';

type HistoryFilter = 'all' | 'unread' | 'active' | 'cleared';

const PRESET_DAYS = [3, 7, 14, 30];

export function DueReminders() {
  const { user, isProMode } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const {
    settings,
    notifications,
    evaluations,
    unreadCount,
    browserPermission,
    loading,
    refreshNotifications,
    updateReminderSettings,
    markNotificationAsRead,
    clearResolvedHistory,
    enableBrowserPush,
    sendTestNotification,
  } = useNotifications();

  const isHindi = language === 'hi';
  const isPro = isProMode;
  const cardSurface = isPro ? 'pro-card border-amber-400/30' : 'glass-surface';

  const [intervalInput, setIntervalInput] = useState<string>(String(settings.intervalDays || 7));
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [savingSettings, setSavingSettings] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  useEffect(() => {
    setIntervalInput(String(settings.intervalDays || 7));
  }, [settings.intervalDays]);

  const dueEvaluations = evaluations.filter((e) => e.outstandingBalance > 0);
  const currentlyDueList = dueEvaluations.filter((e) => e.cycleNumber >= 1);
  const totalOverdueAmount = currentlyDueList.reduce((sum, e) => sum + e.outstandingBalance, 0);

  const filteredHistory = notifications.filter((item) => {
    if (filter === 'unread') return !item.isRead && item.status === 'active';
    if (filter === 'active') return item.status === 'active';
    if (filter === 'cleared') return item.status === 'cleared';
    return true;
  });

  const resolvedCount = notifications.filter((n) => n.status === 'cleared').length;

  const handleToggleEnabled = async () => {
    setSavingSettings(true);
    setFeedback(null);
    try {
      const nextEnabled = !settings.enabled;
      await updateReminderSettings({ enabled: nextEnabled });
      setFeedback({
        type: 'success',
        text: nextEnabled
          ? isHindi
            ? 'स्मार्ट ऑटो रिमाइंडर चालू कर दिए गए हैं।'
            : 'Automatic due reminders enabled.'
          : isHindi
            ? 'स्मार्ट ऑटो रिमाइंडर रोक दिए गए हैं।'
            : 'Automatic due reminders paused.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update settings.',
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveInterval = async (daysValue?: number) => {
    const parsed = clampReminderIntervalDays(daysValue ?? intervalInput);
    setIntervalInput(String(parsed));
    setSavingSettings(true);
    setFeedback(null);
    try {
      await updateReminderSettings({ intervalDays: parsed });
      setFeedback({
        type: 'success',
        text: isHindi
          ? `रिमाइंडर अंतराल ${parsed} दिन सेव हो गया।`
          : `Reminder interval saved to ${parsed} day(s).`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not update interval.',
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleEnablePush = async () => {
    setFeedback(null);
    const perm = await enableBrowserPush();
    if (perm === 'granted') {
      setFeedback({
        type: 'success',
        text: isHindi
          ? 'ब्राउज़र पुश नोटिफिकेशन चालू हो गया (केवल दुकानदार के लिए)।'
          : 'Browser push notifications enabled (shopkeeper only).',
      });
    } else if (perm === 'denied') {
      setFeedback({
        type: 'error',
        text: isHindi
          ? 'ब्राउज़र ने नोटिफिकेशन अनुमति रोकी है। कृपया ब्राउज़र सेटिंग से अनुमति दें।'
          : 'Browser notification permission is blocked. Allow notifications in browser site settings.',
      });
    } else {
      setFeedback({
        type: 'error',
        text: isHindi
          ? 'इस डिवाइस/ब्राउज़र पर पुश नोटिफिकेशन उपलब्ध नहीं है। इन-ऐप सूचनाएं काम करती रहेंगी।'
          : 'Browser push is unsupported here. In-app notifications remain active.',
      });
    }
  };

  const handleSendTest = async () => {
    const ok = await sendTestNotification();
    setFeedback({
      type: ok ? 'success' : 'error',
      text: ok
        ? isHindi
          ? 'टेस्ट नोटिफिकेशन आपके ब्राउज़र पर भेजा गया!'
          : 'Test browser notification sent to your device!'
        : isHindi
          ? 'कृपया पहले ब्राउज़र नोटिफिकेशन की अनुमति दें।'
          : 'Please allow browser notifications first.',
    });
  };

  const handleOpenNotification = async (notificationId: string, customerId: string) => {
    await markNotificationAsRead(notificationId);
    navigate(`/customers/${customerId}`);
  };

  const formatDateLabel = (iso: string | null | undefined) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <AppLayout title={isHindi ? 'स्मार्ट बकाया रिमाइंडर' : 'Smart Due Reminders'}>
      <div className="space-y-6">
        {/* Privacy & Shopkeeper-Only Guarantee Banner */}
        <div
          className={`rounded-2xl p-4 border flex flex-wrap items-center justify-between gap-3 ${
            isPro
              ? 'bg-amber-500/10 border-amber-400/30 text-amber-100'
              : 'bg-blue-500/10 border-cyan-400/25 text-cyan-100'
          }`}
        >
          <div className="flex items-start gap-3 flex-1 min-w-[240px]">
            <ShieldCheck className="w-5 h-5 text-cyan-300 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed">
              <div className="font-semibold text-white">
                {isHindi
                  ? 'केवल दुकानदार के लिए निजी रिमाइंडर सिस्टम'
                  : 'Private Shopkeeper-Only Reminder System'}
              </div>
              <p className="text-slate-300 mt-0.5">
                {isHindi
                  ? 'ये ऑटोमैटिक सूचनाएं केवल लॉगिन किए हुए दुकानदार (आपको) वेबसाइट और ब्राउज़र नोटिफिकेशन पर दिखती हैं — ग्राहकों को कोई WhatsApp या मैसेज नहीं भेजा जाता।'
                  : 'Automatic due reminders are delivered strictly to you (the logged-in shopkeeper) via in-app & browser notifications — zero WhatsApp or automated messages are sent to customers.'}
              </p>
              {!user ? (
                <p className="text-amber-300 mt-1 font-medium">
                  {isHindi
                    ? 'सेटिंग्स बदलने और अपने ग्राहकों का बकाया ट्रैक करने के लिए ऊपर Google से साइन इन करें।'
                    : 'Sign in with Google above to track your customers and save reminder settings.'}
                </p>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            disabled={!user || loading}
            onClick={() => void refreshNotifications({ notifyBrowser: true })}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{isHindi ? 'अभी जांचें' : 'Scan Dues Now'}</span>
          </button>
        </div>

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            label={isHindi ? 'देय बकाया ग्राहक' : 'Customers Due Now'}
            value={String(currentlyDueList.length)}
            icon={BellRing}
            tone="rose"
          />
          <StatCard
            label={isHindi ? 'कुल देय राशि' : 'Total Due Amount'}
            value={formatINR(totalOverdueAmount)}
            icon={Clock}
            tone="amber"
          />
          <StatCard
            label={isHindi ? 'नई अनपढ़ी सूचनाएं' : 'Unread Alerts'}
            value={String(unreadCount)}
            icon={Bell}
            tone="cyan"
          />
          <StatCard
            label={isHindi ? 'रिमाइंडर अंतराल' : 'Reminder Interval'}
            value={`${settings.intervalDays} ${isHindi ? 'दिन' : 'Days'}`}
            icon={SlidersHorizontal}
            tone="emerald"
          />
        </div>

        {/* Configuration Panel: Enable/Disable + 7-day Default / Custom Days + Browser Push */}
        <section className={`${cardSurface} rounded-2xl p-5 space-y-5`}>
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-blue-400/15">
            <div>
              <h2 className="text-base font-semibold text-white font-display">
                {isHindi ? 'ऑटोमैटिक रिमाइंडर सेटिंग्स' : 'Automatic Reminder Settings'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {isHindi
                  ? 'डिफ़ॉल्ट 7 दिन पर या अपने अनुसार कस्टम दिनों पर ऑटो रिमाइंडर सेट करें। पूरा बकाया जमा होते ही रिमाइंडर अपने आप बंद हो जाता है।'
                  : 'Defaults to 7 days or set a custom day interval. Reminders stop automatically as soon as the customer clears their balance.'}
              </p>
            </div>

            <button
              type="button"
              disabled={!user || savingSettings}
              onClick={() => void handleToggleEnabled()}
              aria-pressed={settings.enabled}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold border transition-colors disabled:opacity-50 ${
                settings.enabled
                  ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/30'
                  : 'bg-slate-800 border-slate-600/50 text-slate-300 hover:text-white'
              }`}
            >
              {settings.enabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
              <span>
                {settings.enabled
                  ? isHindi
                    ? 'ऑटो रिमाइंडर: चालू (ON)'
                    : 'Auto Reminders: ON'
                  : isHindi
                    ? 'ऑटो रिमाइंडर: बंद (OFF)'
                    : 'Auto Reminders: OFF'}
              </span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Interval Controls */}
            <div className="space-y-3">
              <div className="text-xs font-semibold text-slate-200">
                {isHindi
                  ? 'रिमाइंडर अंतराल चुनें (डिफ़ॉल्ट: 7 दिन)'
                  : 'Reminder Interval (Default: 7 Days)'}
              </div>
              <div className="flex flex-wrap gap-2">
                {PRESET_DAYS.map((days) => {
                  const active = settings.intervalDays === days;
                  return (
                    <button
                      key={days}
                      type="button"
                      disabled={!user || savingSettings}
                      onClick={() => void handleSaveInterval(days)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                        active
                          ? 'bg-blue-600 border-cyan-400/50 text-white'
                          : 'bg-[#0A142D] border-blue-400/20 text-slate-300 hover:border-cyan-400/40'
                      }`}
                    >
                      {days} {isHindi ? 'दिन' : 'days'}
                      {days === 7 ? (isHindi ? ' (डिफ़ॉल्ट)' : ' (Default)') : ''}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <label htmlFor="custom-reminder-days" className="sr-only">
                  {isHindi ? 'कस्टम दिन' : 'Custom reminder days'}
                </label>
                <input
                  id="custom-reminder-days"
                  type="number"
                  min={1}
                  max={365}
                  value={intervalInput}
                  onChange={(e) => setIntervalInput(e.target.value)}
                  className="w-28 px-3 py-2 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white font-mono-num focus:outline-none focus:border-cyan-400"
                />
                <span className="text-xs text-slate-400">{isHindi ? 'दिन' : 'days'}</span>
                <button
                  type="button"
                  disabled={!user || savingSettings}
                  onClick={() => void handleSaveInterval()}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold"
                >
                  {isHindi ? 'अंतराल सेव करें' : 'Save Interval'}
                </button>
              </div>
            </div>

            {/* Browser Push Controls */}
            <div className="space-y-3 rounded-xl bg-[#0A142D]/70 border border-blue-400/15 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-white">
                  {isHindi ? 'ब्राउज़र पुश नोटिफिकेशन' : 'Browser Push Notifications'}
                </div>
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                    browserPermission === 'granted'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : browserPermission === 'denied'
                        ? 'bg-rose-500/20 text-rose-300'
                        : 'bg-amber-500/20 text-amber-300'
                  }`}
                >
                  {browserPermission === 'granted'
                    ? isHindi
                      ? 'अनुमति प्राप्त'
                      : 'Granted'
                    : browserPermission === 'denied'
                      ? isHindi
                        ? 'ब्लॉक है'
                        : 'Blocked'
                      : browserPermission === 'unsupported'
                        ? isHindi
                          ? 'उपलब्ध नहीं'
                          : 'Unsupported'
                        : isHindi
                          ? 'अनुमति बाकी'
                          : 'Permission Needed'}
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                {isHindi
                  ? 'ब्राउज़र अलर्ट चालू करने पर जब किसी ग्राहक का बकाया समय पूरा होगा, तो आपके डिवाइस पर तुरंत नोटिफिकेशन आएगा।'
                  : 'Enable browser alerts so your device notifies you immediately when a customer reaches their Udhaar due date.'}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!user || browserPermission === 'unsupported'}
                  onClick={() => void handleEnablePush()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-600/25 hover:bg-cyan-600/35 border border-cyan-400/35 text-cyan-200 text-xs font-semibold disabled:opacity-50"
                >
                  <BellRing className="w-3.5 h-3.5" />
                  <span>
                    {browserPermission === 'granted' && settings.browserPushEnabled
                      ? isHindi
                        ? 'ब्राउज़र पुश चालू है'
                        : 'Browser Push Active'
                      : isHindi
                        ? 'ब्राउज़र नोटिफिकेशन चालू करें'
                        : 'Enable Browser Push'}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={browserPermission !== 'granted'}
                  onClick={() => void handleSendTest()}
                  className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-blue-400/20 text-slate-200 text-xs font-medium disabled:opacity-45"
                >
                  {isHindi ? 'टेस्ट अलर्ट भेजें' : 'Send Test Alert'}
                </button>
              </div>
            </div>
          </div>

          {feedback ? (
            <div
              role="status"
              className={`rounded-xl px-3.5 py-2.5 text-xs flex items-center gap-2 border ${
                feedback.type === 'success'
                  ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-200'
                  : 'bg-rose-500/15 border-rose-400/30 text-rose-200'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{feedback.text}</span>
            </div>
          ) : null}
        </section>

        {/* Notification History Section */}
        <section className={`${cardSurface} rounded-2xl p-5 space-y-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-white font-display">
                {isHindi ? 'सूचना इतिहास (Notification History)' : 'Notification History'}
              </h2>
              <p className="text-xs text-slate-400">
                {isHindi
                  ? 'किसी भी सूचना पर क्लिक करके सीधे उस ग्राहक का पूरा खाता खोलें।'
                  : 'Click any notification to open that customer’s ledger directly.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {unreadCount > 0 ? (
                <button
                  type="button"
                  onClick={() => void markNotificationAsRead()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/35 border border-blue-400/30 text-cyan-200 text-xs font-medium"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>{isHindi ? 'सभी पढ़ा हुआ मानें' : 'Mark All Read'}</span>
                </button>
              ) : null}
              {resolvedCount > 0 ? (
                <button
                  type="button"
                  onClick={() => void clearResolvedHistory()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-blue-400/20 text-slate-300 text-xs font-medium"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isHindi ? 'चुकाए गए हटाएं' : 'Clear Settled'}</span>
                </button>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 p-1 bg-[#0A142D] rounded-xl border border-blue-400/15 w-fit">
            {(
              [
                { id: 'all', label: isHindi ? `सभी (${notifications.length})` : `All (${notifications.length})` },
                { id: 'unread', label: isHindi ? `नई (${unreadCount})` : `Unread (${unreadCount})` },
                {
                  id: 'active',
                  label: isHindi
                    ? `सक्रिय (${notifications.filter((n) => n.status === 'active').length})`
                    : `Active (${notifications.filter((n) => n.status === 'active').length})`,
                },
                {
                  id: 'cleared',
                  label: isHindi ? `चुकाया गया (${resolvedCount})` : `Cleared (${resolvedCount})`,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filter === tab.id
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {filteredHistory.length === 0 ? (
            <EmptyState
              icon={Bell}
              title={
                isHindi ? 'कोई बकाया सूचना इतिहास नहीं है' : 'No due reminder notifications yet'
              }
              description={
                isHindi
                  ? `जब किसी ग्राहक का उधार ${settings.intervalDays} दिन या अधिक समय से बाकी होगा, तो यहाँ अपने आप सूचना दिखेगी।`
                  : `When a customer has an unpaid Udhaar balance for ${settings.intervalDays} day(s) or longer, a notification will appear here automatically.`
              }
            />
          ) : (
            <div className="space-y-2.5">
              {filteredHistory.map((item) => {
                const isCleared = item.status === 'cleared';
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void handleOpenNotification(item.id, item.customerId)}
                    className={`w-full text-left rounded-xl p-4 border transition-colors flex flex-wrap items-center justify-between gap-3 ${
                      isCleared
                        ? 'bg-[#091224]/70 border-emerald-500/20 hover:border-emerald-400/40'
                        : !item.isRead
                          ? 'bg-blue-600/15 border-cyan-400/40 hover:border-cyan-300/60'
                          : 'bg-[#0A142D]/80 border-blue-400/15 hover:border-cyan-400/35'
                    }`}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {!item.isRead && !isCleared ? (
                          <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
                        ) : null}
                        <span className="text-sm font-semibold text-white">
                          {item.customerName}
                        </span>
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                            isCleared
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          {isCleared
                            ? isHindi
                              ? 'राशि जमा · बंद'
                              : 'Cleared · Paid'
                            : isHindi
                              ? `बाकी: ${formatINR(item.pendingAmount)}`
                              : `Pending: ${formatINR(item.pendingAmount)}`}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>
                          {isHindi ? 'देय तारीख:' : 'Due Date:'} {formatDateLabel(item.dueDate)}
                        </span>
                        <span>
                          {isHindi ? 'अंतराल:' : 'Interval:'} {item.intervalDays}{' '}
                          {isHindi ? 'दिन' : 'days'}
                        </span>
                        <span>
                          {isHindi ? 'अलर्ट समय:' : 'Notified:'} {formatDateLabel(item.createdAt)}
                        </span>
                      </div>
                    </div>

                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-300 shrink-0">
                      <span>{isHindi ? 'खाता खोलें' : 'Open Ledger'}</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Live Customer Udhaar Tracker */}
        <section className={`${cardSurface} rounded-2xl p-5 space-y-4`}>
          <div>
            <h2 className="text-base font-semibold text-white font-display">
              {isHindi ? 'बकाया उधार ट्रैकर (Live Udhaar Schedule)' : 'Live Udhaar Due Schedule'}
            </h2>
            <p className="text-xs text-slate-400">
              {isHindi
                ? 'जिन ग्राहकों पर उधार बाकी है, उनकी अगली देय तारीख और स्थिति यहाँ दिखती है।'
                : 'Tracks every customer with an open Udhaar balance and when their payment becomes due.'}
            </p>
          </div>

          {dueEvaluations.length === 0 ? (
            <p className="text-xs text-slate-400 py-4">
              {isHindi
                ? 'अभी किसी भी ग्राहक पर कोई उधार बाकी नहीं है।'
                : 'No customers currently have an outstanding Udhaar balance.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-blue-400/15 text-xs text-slate-400">
                  <tr>
                    <th className="py-2.5 px-3 font-medium">{isHindi ? 'ग्राहक' : 'Customer'}</th>
                    <th className="py-2.5 px-3 font-medium text-right">
                      {isHindi ? 'बाकी राशि' : 'Pending'}
                    </th>
                    <th className="py-2.5 px-3 font-medium">{isHindi ? 'देय तारीख' : 'Due Date'}</th>
                    <th className="py-2.5 px-3 font-medium">{isHindi ? 'स्थिति' : 'Status'}</th>
                    <th className="py-2.5 px-3 font-medium text-right">
                      {isHindi ? 'खाता' : 'Ledger'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-400/10">
                  {dueEvaluations.map((ev) => {
                    const overdue = ev.cycleNumber >= 1;
                    return (
                      <tr key={ev.customerId} className="hover:bg-white/5">
                        <td className="py-2.5 px-3 font-medium text-white">{ev.customerName}</td>
                        <td className="py-2.5 px-3 text-right font-mono-num font-semibold text-rose-300">
                          {formatINR(ev.outstandingBalance)}
                        </td>
                        <td className="py-2.5 px-3 font-mono-num text-xs text-slate-300">
                          {formatDateLabel(ev.dueDate)}
                        </td>
                        <td className="py-2.5 px-3 text-xs">
                          {overdue ? (
                            <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 font-semibold">
                              {ev.daysOverdue === 0
                                ? isHindi
                                  ? 'आज देय'
                                  : 'Due today'
                                : isHindi
                                  ? `${ev.daysOverdue} दिन से देय`
                                  : `${ev.daysOverdue}d overdue`}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-blue-500/15 text-cyan-200 font-medium">
                              {isHindi
                                ? `${Math.abs(ev.daysOverdue)} दिन बाकी`
                                : `Due in ${Math.abs(ev.daysOverdue)}d`}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => navigate(`/customers/${ev.customerId}`)}
                            className="text-xs font-semibold text-cyan-300 hover:underline"
                          >
                            {isHindi ? 'खोलें' : 'View'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
