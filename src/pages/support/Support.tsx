import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LifeBuoy, Mail, Phone } from 'lucide-react';
import { AppLayout } from '../../components/layout/AppLayout';
import { EmptyState } from '../../components/common/EmptyState';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { getActiveSiteSettings } from '../../services/premiumService';
import { createSupportTicket, listUserSupportTickets } from '../../services/supportService';
import type { AdminSiteSettings, SupportTicket } from '../../types/models';

export function Support() {
  const { language, t } = useLanguage();
  const { user, userProfile, shopProfile } = useAuth();
  const navigate = useNavigate();
  const isHindi = language === 'hi';

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [siteSettings, setSiteSettings] = useState<AdminSiteSettings | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getActiveSiteSettings().then(setSiteSettings).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    listUserSupportTickets(user.uid).then(setTickets).catch(console.warn);
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError(isHindi ? 'कृपया पहले लॉगिन करें।' : 'Please sign in first.');
      return;
    }
    if (!subject.trim() || !message.trim()) {
      setError(isHindi ? 'विषय और संदेश दोनों आवश्यक हैं।' : 'Subject and message are required.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const trimmedMsg = message.trim();
      const id = await createSupportTicket({
        uid: user.uid,
        shopId: shopProfile?.id || user.uid,
        senderName: userProfile?.displayName || user.displayName || 'Shopkeeper',
        shopName: shopProfile?.shopName || 'My Shop',
        phoneNumber: shopProfile?.phoneNumber || '',
        subject: subject.trim(),
        message: trimmedMsg,
        lastMessagePreview: trimmedMsg.slice(0, 120),
      });
      navigate(`/support/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create ticket');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppLayout title={t('nav.support')}>
      <div className="max-w-3xl space-y-6">
        {siteSettings?.supportPhone || siteSettings?.supportEmail ? (
          <div className="glass-surface rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 border border-cyan-400/25">
            <div className="space-y-0.5">
              <div className="text-sm font-semibold text-white">
                {isHindi ? 'सीधा सहायता संपर्क' : 'Direct Support Contact'}
              </div>
              <div className="text-xs text-slate-400">
                {isHindi
                  ? 'आधिकारिक KhataNova सहायता हेल्पडेस्क'
                  : 'Official KhataNova support desk'}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {siteSettings.supportPhone ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-cyan-200 font-mono-num">
                  <Phone className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{siteSettings.supportPhone}</span>
                </span>
              ) : null}
              {siteSettings.supportEmail ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-cyan-200">
                  <Mail className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{siteSettings.supportEmail}</span>
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="glass-surface rounded-2xl p-6 space-y-4">
          <h2 className="text-base font-semibold text-white">Send Support Message</h2>
          {error ? (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs">
              {error}
            </div>
          ) : null}
          <div>
            <label htmlFor="support-subject" className="block text-xs text-slate-300 mb-1.5">
              Subject *
            </label>
            <input
              id="support-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white"
            />
          </div>
          <div>
            <label htmlFor="support-message" className="block text-xs text-slate-300 mb-1.5">
              Message *
            </label>
            <textarea
              id="support-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              rows={3}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-semibold"
          >
            {submitting ? 'Sending...' : 'Submit Request'}
          </button>
        </form>

        {tickets.length === 0 ? (
          <EmptyState
            icon={LifeBuoy}
            title="No support conversations yet"
            description="Write to our team above and track replies directly inside KhataNova."
          />
        ) : (
          <div className="space-y-3">
            {tickets.map((ticket) => (
              <button
                key={ticket.id}
                type="button"
                onClick={() => navigate(`/support/${ticket.id}`)}
                className="w-full glass-surface hover:border-blue-400/35 rounded-2xl p-4 text-left flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{ticket.subject}</div>
                  <div className="text-xs text-slate-400 truncate">{ticket.lastMessagePreview}</div>
                </div>
                <span className="text-xs font-medium text-cyan-300 uppercase shrink-0">
                  {ticket.status}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
