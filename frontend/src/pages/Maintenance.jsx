import React from 'react';
import {
  ArrowPathIcon,
  ClockIcon,
  ShieldCheckIcon,
  WrenchScrewdriverIcon
} from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';

const Maintenance = ({ maintenanceData }) => {
  const navigate = useNavigate();
  const message = maintenanceData?.message || 'We are currently performing scheduled maintenance to improve your classroom management experience. Please check back shortly.';
  const estimatedEnd = maintenanceData?.estimatedEnd;

  return (
    <div className="lm-canvas relative flex min-h-dvh w-full items-center justify-center overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8">
      <div className="lm-topline" />
      <div className="lm-ambient" />

      <div className="lm-card relative z-10 w-full max-w-md p-5 text-center sm:p-8">

        {/* Animated Maintenance Icon */}
        <div className="lm-inset mx-auto mb-6 flex h-16 w-16 items-center justify-center text-orange-200">
          <WrenchScrewdriverIcon className="w-8 h-8 animate-pulse" />
        </div>

        <h1 className="lm-title mb-2 text-2xl font-bold tracking-tight">
          System Maintenance
        </h1>

        <div className="lm-badge mb-6 text-amber-300">
          <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping"></span>
          Under Maintenance Mode Active
        </div>

        <p className="mb-6 text-sm leading-relaxed text-slate-300">
          {message}
        </p>

        {estimatedEnd && (
          <div className="lm-inset mb-6 p-4 text-left">
            <div className="mb-1 flex items-center gap-2">
              <ClockIcon className="w-4 h-4 flex-none text-cyan-300" />
              <p className="min-w-0 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Estimated Completion
              </p>
            </div>
            <p className="lm-num text-sm font-medium break-words text-cyan-200">
              {new Date(estimatedEnd).toLocaleString()}
            </p>
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={() => window.location.reload()}
            className="lm-btn w-full min-h-[2.75rem] cursor-pointer"
          >
            <ArrowPathIcon className="w-4 h-4" />
            Check Status Again
          </button>

          <button
            onClick={() => navigate('/login')}
            className="lm-btn-ghost w-full min-h-[2.75rem] cursor-pointer"
          >
            <ShieldCheckIcon className="w-4 h-4" />
            Admin / Faculty Bypass Login
          </button>
        </div>

        <hr className="lm-divider my-6" />

        <div className="text-xs text-slate-500">
          PU Classroom & Labroom Management System
        </div>
      </div>
    </div>
  );
};

export default Maintenance;