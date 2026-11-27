import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowDownLeft, ArrowLeft, Calendar, FileText, MapPin, MessageCircle, Phone } from 'lucide-react';
import { AppLayout } from '../../components/layout/AppLayout';
import { StatCard } from '../../components/common/StatCard';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { getCustomerById } from '../../services/customerService';
import { listCustomerLedger } from '../../services/ledgerService';
import { openWhatsAppTextLink } from '../../services/reportService';
import type { Customer, LedgerEntry } from '../../types/models';
import { formatINR } from '../../utils/finance';
import { buildWhatsAppShareUrl } from '../../utils/share';

export function CustomerDetails() {
  const { id } = useParams<{ id: string }>();
  const { user, isProMode, shopProfile } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const shopId = shopProfile?.id || user?.uid;
  const shopName = shopProfile?.shopName || 'KhataNova';
  const isHindi = language === 'hi';
  const isPro = isProMode;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);

  useEffect(() => {
    if (!user || !shopId || !id) return;
    getCustomerById(id).then(setCustomer).catch(console.warn);
    listCustomerLedger(shopId, id).then(setLedger).catch(console.warn);
  }, [user, shopId, id]);

  const handleSendKhataWhatsApp = () => {
    if (!customer) return;
    const due = customer.outstandingBalance || 0;
    const msg = isHindi
      ? [
          `*${shopName}* — खाता विवरण`,
          `ग्राहक: ${customer.name}`,
          `फ़ोन: ${customer.mobileNumber}`,
          `कुल उधार: ${formatINR(customer.totalCredit || 0)}`,
          `कुल जमा: ${formatINR(customer.totalPaid || 0)}`,
          `*वर्तमान बाकी राशि: ${formatINR(due)}*`,
          ``,
          due > 0 ? `कृपया बकाया राशि समय पर जमा करें। धन्यवाद! 🙏` : `आपका हिसाब पूरा है। धन्यवाद! 🙏`,
        ].join('\n')
      : [
          `*${shopName}* — Khata Summary`,
          `Customer: ${customer.name}`,
          `Phone: ${customer.mobileNumber}`,
          `Total Credit: ${formatINR(customer.totalCredit || 0)}`,
          `Total Paid: ${formatINR(customer.totalPaid || 0)}`,
          `*Current Balance Due: ${formatINR(due)}*`,
          ``,
          `Thank you! 🙏`,
        ].join('\n');
    openWhatsAppTextLink(buildWhatsAppShareUrl(msg, customer.mobileNumber));
  };

  return (
    <AppLayout title={customer?.name || (isHindi ? 'ग्राहक खाता' : 'Customer Ledger')}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate('/customers')}
            className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{isHindi ? 'ग्राहक सूची' : 'Back to Customers'}</span>
          </button>

          {customer ? (
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleSendKhataWhatsApp}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/35 border border-emerald-400/35 text-emerald-200 text-xs font-semibold"
              >
                <MessageCircle className="w-4 h-4" />
                <span>{isHindi ? 'WhatsApp हिसाब भेजें' : 'WhatsApp Khata'}</span>
              </button>
              <button
                type="button"
                onClick={() => navigate(`/payments/take?customerId=${customer.id}`)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
              >
                <ArrowDownLeft className="w-4 h-4" />
                <span>{isHindi ? 'पेमेंट जमा करें' : 'Take Payment'}</span>
              </button>
            </div>
          ) : null}
        </div>

        {customer ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard
                label={isHindi ? 'कुल उधार' : 'Total Credit'}
                value={formatINR(customer.totalCredit)}
                icon={ArrowLeft}
                tone="amber"
              />
              <StatCard
                label={isHindi ? 'कुल जमा' : 'Total Paid'}
                value={formatINR(customer.totalPaid)}
                icon={ArrowLeft}
                tone="emerald"
              />
              <StatCard
                label={isHindi ? 'बकाया राशि' : 'Outstanding Balance'}
                value={formatINR(customer.outstandingBalance)}
                icon={ArrowLeft}
                tone="rose"
              />
            </div>

            <div className={`${isPro ? 'pro-card' : 'glass-surface'} rounded-2xl p-5 space-y-3`}>
              <h2 className="text-sm font-semibold text-white font-display">
                {isHindi ? 'ग्राहक की पूरी जानकारी' : 'Customer Full Information'}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="flex items-start gap-2 text-slate-200">
                  <Phone className="w-4 h-4 text-cyan-300 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-slate-400">{isHindi ? 'फ़ोन नंबर' : 'Phone Number'}</div>
                    <div className="font-mono-num font-semibold text-white mt-0.5">
                      {customer.mobileNumber}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2 text-slate-200">
                  <Calendar className="w-4 h-4 text-blue-300 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-slate-400">
                      {isHindi ? 'पिछला बकाया व जुड़ने की तारीख' : 'Opening Balance & Added Date'}
                    </div>
                    <div className="text-white mt-0.5 font-mono-num">
                      {formatINR(customer.openingBalance || 0)} ·{' '}
                      {new Date(customer.createdAt).toLocaleDateString('en-IN')}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2 text-slate-200 sm:col-span-2">
                  <MapPin className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-slate-400">{isHindi ? 'पूरा पता' : 'Full Address'}</div>
                    <div className="text-white mt-0.5 break-words">
                      {customer.address?.trim()
                        ? customer.address.trim()
                        : isHindi
                          ? 'पता दर्ज नहीं किया गया'
                          : 'Address not added'}
                    </div>
                  </div>
                </div>

                {customer.notes?.trim() ? (
                  <div className="flex items-start gap-2 text-slate-200 sm:col-span-2">
                    <FileText className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-slate-400">{isHindi ? 'नोट्स / विवरण' : 'Notes'}</div>
                      <div className="text-slate-200 mt-0.5 break-words">{customer.notes.trim()}</div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className={`${isPro ? 'pro-card' : 'glass-surface'} rounded-2xl overflow-x-auto`}>
              <table className="w-full text-left text-sm">
                <thead className="border-b border-blue-400/15 text-xs text-slate-400">
                  <tr>
                    <th className="py-3 px-4 font-medium">{isHindi ? 'तारीख' : 'Date'}</th>
                    <th className="py-3 px-4 font-medium">{isHindi ? 'विवरण' : 'Description'}</th>
                    <th className="py-3 px-4 font-medium text-right">{isHindi ? 'उधार (+)' : 'Debit'}</th>
                    <th className="py-3 px-4 font-medium text-right">{isHindi ? 'जमा (-)' : 'Credit'}</th>
                    <th className="py-3 px-4 font-medium text-right">{isHindi ? 'बाकी' : 'Balance'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-400/10">
                  {ledger.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400 text-xs">
                        {isHindi ? 'अभी तक कोई लेन-देन दर्ज नहीं है।' : 'No ledger transactions recorded yet.'}
                      </td>
                    </tr>
                  ) : (
                    ledger.map((entry) => (
                      <tr key={entry.id}>
                        <td className="py-3 px-4 font-mono-num text-xs text-slate-400">
                          {new Date(entry.transactionDate).toLocaleDateString('en-IN')}
                        </td>
                        <td className="py-3 px-4 text-slate-200">{entry.description}</td>
                        <td className="py-3 px-4 text-right font-mono-num text-rose-300">
                          {entry.debit > 0 ? formatINR(entry.debit) : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-num text-emerald-300">
                          {entry.credit > 0 ? formatINR(entry.credit) : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-num font-semibold text-white">
                          {formatINR(entry.runningBalance)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="glass-surface rounded-2xl p-6 text-sm text-slate-400">
            {isHindi
              ? 'ग्राहक विवरण उपलब्ध नहीं है। लॉगिन करके जांचें।'
              : 'Customer details unavailable. Sign in to view saved records.'}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
