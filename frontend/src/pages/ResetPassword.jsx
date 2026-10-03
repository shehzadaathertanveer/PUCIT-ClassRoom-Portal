import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import API from '../api/axios';
import { ArrowLeftIcon, CheckIcon, ExclamationTriangleIcon, EyeIcon, EyeSlashIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';

const ResetPassword = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const [email] = useState(location.state?.email || '');
  const [otp] = useState(location.state?.otp || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Show/Hide Password states
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Password matching validation logic
  const isLengthValid = newPassword.length >= 6;
  const doPasswordsMatch = newPassword === confirmPassword && confirmPassword !== '';
  const isFormValid = isLengthValid && doPasswordsMatch;

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!isLengthValid) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (!doPasswordsMatch) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    setLoading(true);

    try {
      const res = await API.post('/auth/reset-password/verify-otp', {
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
        newPassword: newPassword.trim()
      });

      setSuccessMsg(res.data?.message || 'Password reset successful!');
      setTimeout(() => {
        navigate('/login');
      }, 1800);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reset password. Invalid or expired session.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lm-canvas relative min-h-dvh w-full overflow-x-hidden flex flex-col items-center justify-between px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <div className="lm-topline" />
      <div className="lm-ambient" />

      <div className="lm-card relative z-10 my-auto w-full max-w-md p-5 space-y-6 sm:p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="lm-inset flex h-12 w-12 items-center justify-center text-orange-200">
            <ShieldCheckIcon className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="lm-title text-xl font-black tracking-tight sm:text-2xl">Set New Password</h1>
            <p className="text-xs text-slate-400">Choose a secure password for your account.</p>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-red-500/40 bg-red-950/60 p-3.5 text-xs font-medium text-red-300">
            <ExclamationTriangleIcon className="lm-ico mt-px" />
            <p className="min-w-0 break-words">{error}</p>
          </div>
        )}

        {successMsg && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-emerald-500/40 bg-emerald-950/60 p-3.5 text-xs font-medium text-emerald-300">
            <CheckIcon className="lm-ico mt-px" />
            <p className="min-w-0 break-words">{successMsg}</p>
          </div>
        )}

        <form onSubmit={handleResetPassword} className="space-y-4">
          {/* New Password Input with Show/Hide Toggle */}
          <div>
            <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
              New Password
            </label>
            <div className="relative">
              <input 
                type={showPassword ? 'text' : 'password'}
                required
                minLength="6"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="lm-field w-full min-w-0 pr-24 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-1.5 top-1/2 inline-flex h-9 -translate-y-1/2 items-center gap-1.5 rounded-xl px-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100 cursor-pointer"
              >
                {showPassword ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {/* Confirm Password Input with Show/Hide Toggle */}
          <div>
            <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
              Confirm New Password
            </label>
            <div className="relative">
              <input 
                type={showConfirmPassword ? 'text' : 'password'}
                required
                minLength="6"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className={`lm-field w-full min-w-0 pr-24 transition-all ${
                  confirmPassword && !doPasswordsMatch ? 'border-red-500/70' : ''
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-1.5 top-1/2 inline-flex h-9 -translate-y-1/2 items-center gap-1.5 rounded-xl px-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100 cursor-pointer"
              >
                {showConfirmPassword ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                {showConfirmPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {confirmPassword && !doPasswordsMatch && (
              <p className="mt-1.5 ml-1 text-[11px] font-medium text-red-300">Passwords do not match yet.</p>
            )}
            {doPasswordsMatch && (
              <p className="mt-1.5 ml-1 flex items-center gap-1.5 text-[11px] font-medium text-emerald-300">
                <CheckIcon className="lm-ico" />
                Passwords match successfully.
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !isFormValid}
            className="lm-btn w-full min-h-[2.75rem] cursor-pointer disabled:cursor-not-allowed"
          >
            {loading ? 'Updating Password...' : 'Reset Password'}
          </button>
        </form>

        <hr className="lm-divider" />

        <div className="text-center">
          <Link to="/login" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 transition-colors hover:text-orange-200">
            <ArrowLeftIcon className="w-3.5 h-3.5" />
            Back to Login
          </Link>
        </div>
      </div>

      <footer className="relative z-10 mt-8 space-y-1 px-1 text-center text-xs text-slate-500">
        <p>© 2026 PUCIT Classroom (Non-Official) • All Rights Reserved</p>
        <p className="text-slate-600">Designed & Administered by <span className="font-semibold text-orange-300/80">Shehzada Ather</span></p>
      </footer>
    </div>
  );
};

export default ResetPassword;