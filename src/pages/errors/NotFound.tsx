import React from 'react';
import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';

export function NotFound() {
  return (
    <div className="min-h-screen bg-[#060D1E] text-slate-100 flex items-center justify-center p-6">
      <div className="glass-surface-elevated rounded-3xl p-8 max-w-md w-full text-center space-y-4">
        <div className="text-4xl font-bold font-mono-num text-cyan-400">404</div>
        <h1 className="text-xl font-bold text-white font-display">Page Not Found</h1>
        <p className="text-sm text-slate-400">
          The KhataNova page you requested does not exist.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
        >
          <Home className="w-4 h-4" />
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
