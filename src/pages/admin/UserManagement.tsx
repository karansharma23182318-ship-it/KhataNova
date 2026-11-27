import React, { useCallback, useEffect, useState } from 'react';
import { Ban, CheckCircle2, Crown, RefreshCw, ShieldCheck } from 'lucide-react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { fetchAdminOverview, updateShopkeeperStatus } from '../../services/adminService';
import type { ShopProfile, UserProfile } from '../../types/models';

export function UserManagement() {
  const { adminToken } = useAdminAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [shops, setShops] = useState<Record<string, ShopProfile>>({});
  const [search, setSearch] = useState('');
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(() => {
    if (!adminToken) return;
    setError(null);
    fetchAdminOverview(adminToken)
      .then((overview) => {
        setUsers(overview.users);
        setShops(overview.shops || {});
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load shopkeepers.');
      });
  }, [adminToken]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleUpdate = async (
    uid: string,
    patch: Parameters<typeof updateShopkeeperStatus>[2]
  ) => {
    if (!adminToken) return;
    setBusyUid(uid);
    setError(null);
    try {
      const updated = await updateShopkeeperStatus(adminToken, uid, patch);
      setUsers((prev) => prev.map((u) => (u.uid === uid ? updated : u)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update shopkeeper status.');
    } finally {
      setBusyUid(null);
    }
  };

  const filtered = users.filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const shop = shops[u.shopId || u.uid];
    return (
      u.displayName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.phoneNumber || '').toLowerCase().includes(q) ||
      (shop?.shopName || '').toLowerCase().includes(q) ||
      (shop?.phoneNumber || '').toLowerCase().includes(q)
    );
  });

  return (
    <AdminLayout title="Dukandar Management">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by shop, owner name, phone or email..."
            className="w-full sm:w-96 px-3.5 py-2.5 rounded-xl bg-[#0D1A38] border border-blue-400/20 text-sm text-white"
          />

          <button
            type="button"
            onClick={loadUsers}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-blue-400/20 text-xs text-slate-200"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh ({users.length})</span>
          </button>
        </div>

        {error ? (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs">
            {error}
          </div>
        ) : null}

        <div className="glass-surface rounded-2xl overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-blue-400/15 text-xs text-slate-400">
              <tr>
                <th className="py-3 px-4 font-medium">Shop &amp; Owner</th>
                <th className="py-3 px-4 font-medium">Phone &amp; Email</th>
                <th className="py-3 px-4 font-medium">Subscription</th>
                <th className="py-3 px-4 font-medium">Account</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-400/10">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs text-slate-400">
                    No shopkeeper accounts found.
                  </td>
                </tr>
              ) : (
                filtered.map((u) => {
                  const shop = shops[u.shopId || u.uid];
                  const isPremium = u.subscriptionStatus === 'premium_active';
                  const isSuspended = u.accountStatus === 'suspended';
                  return (
                    <tr key={u.uid}>
                      <td className="py-3 px-4">
                        <div className="text-white font-medium">
                          {shop?.shopName || 'Setup Pending'}
                        </div>
                        <div className="text-xs text-slate-400">{u.displayName}</div>
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <div className="font-mono-num text-slate-200">
                          {shop?.phoneNumber || u.phoneNumber || '—'}
                        </div>
                        <div className="text-slate-400">{u.email || '—'}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-xs uppercase font-semibold ${
                            isPremium
                              ? 'text-emerald-300'
                              : u.subscriptionStatus === 'pending'
                                ? 'text-amber-300'
                                : u.subscriptionStatus === 'rejected'
                                  ? 'text-rose-300'
                                  : 'text-slate-300'
                          }`}
                        >
                          {u.subscriptionStatus}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-xs uppercase font-semibold ${
                            isSuspended ? 'text-rose-300' : 'text-cyan-300'
                          }`}
                        >
                          {u.accountStatus}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          {isPremium ? (
                            <button
                              type="button"
                              disabled={busyUid === u.uid}
                              onClick={() =>
                                void handleUpdate(u.uid, { subscriptionStatus: 'free' })
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-700/70 hover:bg-slate-600 text-slate-200 text-xs font-medium"
                            >
                              <span>Set Free</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busyUid === u.uid}
                              onClick={() =>
                                void handleUpdate(u.uid, { subscriptionStatus: 'premium_active' })
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold"
                            >
                              <Crown className="w-3.5 h-3.5" />
                              <span>Make Premium</span>
                            </button>
                          )}

                          {isSuspended ? (
                            <button
                              type="button"
                              disabled={busyUid === u.uid}
                              onClick={() => void handleUpdate(u.uid, { accountStatus: 'active' })}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Activate</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busyUid === u.uid}
                              onClick={() =>
                                void handleUpdate(u.uid, { accountStatus: 'suspended' })
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600/80 hover:bg-rose-500 text-white text-xs font-medium"
                            >
                              <Ban className="w-3.5 h-3.5" />
                              <span>Suspend</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>
            Admin actions take effect immediately and are logged in Admin Audit History.
          </span>
        </div>
      </div>
    </AdminLayout>
  );
}
