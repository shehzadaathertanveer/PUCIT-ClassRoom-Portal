import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import API from '../api/axios';
import { ArrowLeftIcon, EnvelopeIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await API.post('/auth/forgot-password', { email: email.trim().toLowerCase() });
      // Move to sleek dedicated OTP verification step
      navigate('/verify-recovery-otp', { state: { email: email.trim().toLowerCase() } });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send recovery code. Please check your email.');
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
            <EnvelopeIcon className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="lm-title text-xl font-black tracking-tight sm:text-2xl">Password Recovery</h1>
            <p className="text-xs leading-relaxed text-slate-400">Enter your registered email address to receive a verification code.</p>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-red-500/40 bg-red-950/60 p-3.5 text-xs font-medium text-red-300">
            <ExclamationTriangleIcon className="lm-ico mt-px" />
            <p className="min-w-0 break-words">{error}</p>
          </div>
        )}

        <form onSubmit={handleSendOtp} className="space-y-4">
          <div>
            <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
              University Email
            </label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. bitf26a001@pucit.edu.pk"
              className="lm-field lm-num w-full min-w-0 break-all transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="lm-btn w-full min-h-[2.75rem] cursor-pointer"
          >
            <EnvelopeIcon className="w-4 h-4" />
            {loading ? 'Sending Code...' : 'Send Verification Code'}
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

export default ForgotPassword;