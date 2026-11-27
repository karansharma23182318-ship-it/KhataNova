import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';

export function Unauthorized() {
  return (
    <div className="min-h-screen bg-[#060D1E] text-slate-100 flex items-center justify-center p-6">
      <div className="glass-surface-elevated rounded-3xl p-8 max-w-md w-full text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold text-white font-display">Unauthorized Access</h1>
        <p className="text-sm text-slate-400">
          You do not have permission to view this section.
        </p>
        <Link
          to="/"
          className="inline-flex items-center px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
        >
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
