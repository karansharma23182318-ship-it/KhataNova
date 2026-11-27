import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, Lock, RefreshCw, ShieldCheck } from 'lucide-react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { fetchAdminOverview, saveAdminSiteSettings } from '../../services/adminService';
import type { AdminAuditLog } from '../../types/models';

export function AdminSettings() {
  const { adminToken, envConfigured, changeAdminPassword } = useAdminAuth();
  const [noticeBanner, setNoticeBanner] = useState('');
  const [supportPhone, setSupportPhone] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [savingPass, setSavingPass] = useState(false);
  const [passStatus, setPassStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const loadSettings = useCallback(() => {
    if (!adminToken) return;
    fetchAdminOverview(adminToken)
      .then((overview) => {
        if (overview.siteSettings) {
          setNoticeBanner(overview.siteSettings.noticeBanner || '');
          setSupportPhone(overview.siteSettings.supportPhone || '');
          setSupportEmail(overview.siteSettings.supportEmail || '');
        }
        setAuditLogs(overview.auditLogs || []);
      })
      .catch((err) => {
        setStatus({
          type: 'error',
          text: err instanceof Error ? err.message : 'Failed to load admin settings.',
        });
      });
  }, [adminToken]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken) return;
    setSaving(true);
    setStatus(null);
    try {
      const updated = await saveAdminSiteSettings(adminToken, {
        noticeBanner,
        supportPhone,
        supportEmail,
      });
      setNoticeBanner(updated.noticeBanner);
      setSupportPhone(updated.supportPhone);
      setSupportEmail(updated.supportEmail);
      setStatus({
        type: 'success',
        text: 'Website notice & support contact details saved.',
      });
      loadSettings();
    } catch (err) {
      setStatus({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save settings.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassStatus(null);
    if (!currentPassword.trim()) {
      setPassStatus({ type: 'error', text: 'Please enter your current admin password.' });
      return;
    }
    if (newPassword.trim().length < 6) {
      setPassStatus({ type: 'error', text: 'New password must be at least 6 characters.' });
      return;
    }
    if (newPassword.trim() !== confirmNewPassword.trim()) {
      setPassStatus({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    setSavingPass(true);
    try {
      const res = await changeAdminPassword(currentPassword.trim(), newPassword.trim());
      if (!res.ok) {
        setPassStatus({ type: 'error', text: res.error || 'Could not update password.' });
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPassStatus({
        type: 'success',
        text: 'Admin passcode updated securely and hashed on the server.',
      });
    } finally {
      setSavingPass(false);
    }
  };

  return (
    <AdminLayout title="Admin & Website Settings">
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <form onSubmit={(e) => void handleSave(e)} className="glass-surface rounded-3xl p-6 space-y-4">
            <div className="flex items-center gap-2.5 text-base font-semibold text-white font-display">
              <span className="w-9 h-9 rounded-2xl bg-cyan-500/15 border border-cyan-400/25 text-cyan-300 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </span>
              <span>Website Notice &amp; Owner Support Contact</span>
            </div>

            {status ? (
              <div
                className={`p-3.5 rounded-2xl border text-xs flex items-center gap-2 ${
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
              <label htmlFor="site-notice" className="block text-xs text-slate-300 mb-1.5">
                Website Announcement / Notice Banner (Optional)
              </label>
              <textarea
                id="site-notice"
                value={noticeBanner}
                onChange={(e) => setNoticeBanner(e.target.value)}
                rows={2}
                placeholder="e.g. Support hours 9 AM - 8 PM IST. Lifetime Premium ₹199."
                className="w-full px-4 py-2.5 rounded-2xl bg-[#0A142D] border border-blue-400/20 text-sm text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="support-phone" className="block text-xs text-slate-300 mb-1.5">
                  Support Phone / WhatsApp
                </label>
                <input
                  id="support-phone"
                  value={supportPhone}
                  onChange={(e) => setSupportPhone(e.target.value)}
                  placeholder="e.g. +91 98XXXXXXXX"
                  className="w-full px-4 py-2.5 rounded-2xl bg-[#0A142D] border border-blue-400/20 text-sm text-white font-mono-num focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label htmlFor="support-email" className="block text-xs text-slate-300 mb-1.5">
                  Support Email
                </label>
                <input
                  id="support-email"
                  type="email"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  placeholder="support@khatanova.in"
                  className="w-full px-4 py-2.5 rounded-2xl bg-[#0A142D] border border-blue-400/20 text-sm text-white focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-sm font-semibold"
            >
              {saving ? 'Saving...' : 'Save Website Settings'}
            </button>
          </form>

          <form
            onSubmit={(e) => void handleChangePassword(e)}
            className="glass-surface rounded-3xl p-6 space-y-4"
          >
            <div className="flex items-center gap-2.5 text-base font-semibold text-white font-display">
              <span className="w-9 h-9 rounded-2xl bg-amber-500/15 border border-amber-400/30 text-amber-300 flex items-center justify-center shrink-0">
                <KeyRound className="w-4 h-4" />
              </span>
              <span>Owner Admin Passcode</span>
            </div>

            {envConfigured ? (
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-400/25 text-xs text-amber-100 leading-relaxed">
                Admin passcode is controlled by the <code className="font-mono-num">ADMIN_PASSCODE</code>{' '}
                environment secret. Update it in AI Studio Settings → Secrets if you want to rotate it.
              </div>
            ) : (
              <p className="text-xs text-slate-400 leading-relaxed">
                Your owner passcode is stored with salted scrypt hashing on the server. Tip: when
                publishing to a new server, you can also set <code className="font-mono-num">ADMIN_PASSCODE</code> in Settings → Secrets.
              </p>
            )}

            {passStatus ? (
              <div
                role="status"
                className={`p-3.5 rounded-2xl border text-xs flex items-center gap-2 ${
                  passStatus.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-200'
                    : 'bg-rose-500/10 border-rose-400/30 text-rose-200'
                }`}
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{passStatus.text}</span>
              </div>
            ) : null}

            <div className="space-y-3">
              <div>
                <label htmlFor="admin-current-pass" className="block text-xs text-slate-300 mb-1.5">
                  Current Admin Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="admin-current-pass"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    disabled={envConfigured || savingPass}
                    autoComplete="current-password"
                    placeholder="Enter current password"
                    className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-[#0A142D] border border-blue-400/20 text-sm text-white font-mono-num focus:outline-none focus:border-cyan-400 disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="admin-new-pass" className="block text-xs text-slate-300 mb-1.5">
                    New Password
                  </label>
                  <input
                    id="admin-new-pass"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={envConfigured || savingPass}
                    autoComplete="new-password"
                    placeholder="Min 6 characters"
                    className="w-full px-4 py-2.5 rounded-2xl bg-[#0A142D] border border-blue-400/20 text-sm text-white font-mono-num focus:outline-none focus:border-cyan-400 disabled:opacity-50"
                  />
                </div>

                <div>
                  <label htmlFor="admin-confirm-pass" className="block text-xs text-slate-300 mb-1.5">
                    Confirm New Password
                  </label>
                  <input
                    id="admin-confirm-pass"
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    disabled={envConfigured || savingPass}
                    autoComplete="new-password"
                    placeholder="Repeat new password"
                    className="w-full px-4 py-2.5 rounded-2xl bg-[#0A142D] border border-blue-400/20 text-sm text-white font-mono-num focus:outline-none focus:border-cyan-400 disabled:opacity-50"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={envConfigured || savingPass}
              className="px-6 py-2.5 rounded-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-sm font-semibold"
            >
              {savingPass ? 'Updating...' : 'Update Admin Password'}
            </button>
          </form>
        </div>

        <div className="glass-surface rounded-3xl overflow-hidden">
          <div className="px-5 py-4 border-b border-blue-400/15 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Admin Audit Logs</h2>
            <button
              type="button"
              onClick={loadSettings}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-blue-400/20 text-xs text-slate-200"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-blue-400/15 text-slate-400">
                <tr>
                  <th className="py-3 px-4 font-medium">Action</th>
                  <th className="py-3 px-4 font-medium">Details</th>
                  <th className="py-3 px-4 font-medium">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-400/10">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-slate-400">
                      No admin audit logs recorded yet.
                    </td>
                  </tr>
                ) : (
                  auditLogs.slice(0, 25).map((log) => (
                    <tr key={log.id}>
                      <td className="py-3 px-4 font-mono-num font-semibold text-cyan-300">
                        {log.action}
                      </td>
                      <td className="py-3 px-4 text-slate-200">{log.details}</td>
                      <td className="py-3 px-4 font-mono-num text-slate-400">
                        {new Date(log.createdAt).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
