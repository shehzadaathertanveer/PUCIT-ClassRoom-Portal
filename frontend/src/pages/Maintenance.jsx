import React from 'react';
import { WrenchScrewdriverIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';

const Maintenance = ({ maintenanceData }) => {
  const navigate = useNavigate();
  const message = maintenanceData?.message || 'We are currently performing scheduled maintenance to improve your classroom management experience. Please check back shortly.';
  const estimatedEnd = maintenanceData?.estimatedEnd;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 select-none">
      <div className="max-w-md w-full bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl shadow-2xl p-8 text-center relative overflow-hidden">
        
        {/* Subtle background glow effect */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>

        {/* Animated Maintenance Icon */}
        <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mb-6 shadow-inner">
          <WrenchScrewdriverIcon className="w-8 h-8 animate-pulse" />
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-white mb-2">
          System Maintenance
        </h1>
        
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium mb-6">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
          Under Maintenance Mode Active
        </div>

        <p className="text-slate-300 text-sm leading-relaxed mb-6">
          {message}
        </p>

        {estimatedEnd && (
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 mb-6 text-left">
            <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">
              Estimated Completion
            </p>
            <p className="text-sm font-medium text-indigo-300">
              {new Date(estimatedEnd).toLocaleString()}
            </p>
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={() => window.location.reload()}
            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-all shadow-lg shadow-indigo-600/20 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 text-sm"
          >
            Check Status Again
          </button>

          <button
            onClick={() => navigate('/login')}
            className="w-full py-2 px-4 bg-transparent hover:bg-slate-800/60 text-slate-400 hover:text-slate-200 font-medium rounded-xl transition-all text-xs flex items-center justify-center gap-2"
          >
            <ShieldCheckIcon className="w-4 h-4" />
            Admin / Faculty Bypass Login
          </button>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-800/60 text-xs text-slate-500">
          PU Classroom & Labroom Management System
        </div>
      </div>
    </div>
  );
};

export default Maintenance;