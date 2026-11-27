import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { AppLayout } from '../../components/layout/AppLayout';
import { useAuth } from '../../context/AuthContext';
import { listTicketMessages } from '../../services/supportService';
import type { SupportMessage } from '../../types/models';

export function SupportConversation() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, authReady } = useAuth();
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !authReady || !user) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    listTicketMessages(id)
      .then((list) => {
        if (!cancelled) setMessages(list);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load conversation messages.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, authReady, user]);

  return (
    <AppLayout title="Support Conversation">
      <div className="max-w-3xl space-y-4">
        <button
          type="button"
          onClick={() => navigate('/support')}
          className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Support
        </button>

        {error ? (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs">
            {error}
          </div>
        ) : null}

        <div className="glass-surface rounded-2xl p-5 space-y-3">
          {!authReady || loading ? (
            <p className="text-xs text-slate-400">Loading conversation...</p>
          ) : messages.length === 0 ? (
            <p className="text-xs text-slate-400">Waiting for messages in this conversation.</p>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`p-3.5 rounded-xl text-sm ${
                  m.senderRole === 'admin'
                    ? 'bg-blue-600/20 border border-blue-400/25 text-white'
                    : 'bg-[#0A142D] border border-blue-400/15 text-slate-200'
                }`}
              >
                <div className="text-xs text-slate-400 mb-1">
                  {m.senderName} · {new Date(m.createdAt).toLocaleString()}
                </div>
                <div className="whitespace-pre-wrap break-words">{m.text}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </AppLayout>
  );
}
