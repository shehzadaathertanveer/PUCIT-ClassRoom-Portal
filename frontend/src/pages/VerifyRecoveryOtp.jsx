import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import API from '../api/axios';
import { ArrowLeftIcon, ArrowRightIcon, KeyIcon, LightBulbIcon } from '@heroicons/react/24/outline';

const VerifyRecoveryOtp = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [email] = useState(location.state?.email || '');
  const [otp, setOtp] = useState('');
  const [helperText, setHelperText] = useState('Enter the 6-digit verification code sent to your email.');
  const [isErrorState, setIsErrorState] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setIsErrorState(false);

    const trimmedOtp = otp.trim();

    if (trimmedOtp.length !== 6) {
      setHelperText('Please enter a valid 6-digit OTP code.');
      setIsErrorState(true);
      return;
    }

    if (!email) {
      setHelperText('Session email missing. Please restart the forgot password process.');
      setIsErrorState(true);
      return;
    }

    setIsSubmitting(true);
    setHelperText('Verifying code with security gateway...');

    try {
      // Real backend verification request
      await API.post('/auth/verify-recovery-otp', {
        email: email.trim().toLowerCase(),
        otp: trimmedOtp
      }, { timeout: 10000 });

      // If successful, navigate to reset-password passing email and validated otp
      navigate('/reset-password', { state: { email: email.trim().toLowerCase(), otp: trimmedOtp } });
    } catch (err) {
      let errorMsg = 'Invalid code or network error. Please try again.';
      
      if (err?.response?.data?.message) {
        errorMsg = err.response.data.message;
      } else if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        errorMsg = 'Server response timed out. Please check your connection.';
      } else if (err?.message) {
        errorMsg = err.message;
      }

      setHelperText(errorMsg);
      setIsErrorState(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="lm-canvas relative min-h-dvh w-full overflow-x-hidden flex flex-col items-center justify-between px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <div className="lm-topline" />
      <div className="lm-ambient" />

      <div className="lm-card relative z-10 my-auto w-full max-w-md p-5 space-y-6 sm:p-8">

        {/* Header Branding */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="lm-inset flex h-12 w-12 items-center justify-center text-orange-200">
            <KeyIcon className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="lm-title text-xl font-black tracking-tight sm:text-2xl">Enter Verification Code</h1>
            <p className="text-xs text-slate-400">
              Code sent to <span className="lm-num break-all text-orange-200">{email || 'your email'}</span>
            </p>
          </div>
        </div>

        {/* Dynamic State Box */}
        <div className="space-y-3 text-center">
          <p className={`text-xs font-medium leading-relaxed py-2.5 px-3.5 transition-all break-words ${
            isErrorState
              ? 'rounded-[0.875rem] border border-red-500/40 bg-red-950/60 text-red-300 font-bold'
              : 'lm-inset text-slate-300'
          }`}>
            {helperText}
          </p>

          {/* Spam/Junk Notice Box */}
          <div className="lm-inset flex items-center justify-center gap-2 px-3 py-2.5 text-left text-[11px] text-slate-400 sm:text-center">
            <LightBulbIcon className="w-4 h-4 flex-none text-amber-300" />
            <p className="min-w-0">Can't find it? Check your <span className="font-semibold text-slate-200">Spam</span> or <span className="font-semibold text-slate-200">Junk</span> folder.</p>
          </div>
        </div>

        <form onSubmit={handleVerifyOtp} className="space-y-5">
          <div>
            <label className="mb-2 block text-center text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
              6-Digit OTP Code
            </label>
            <input 
              type="text" 
              required
              maxLength="6"
              value={otp}
              onChange={(e) => {
                setOtp(e.target.value.replace(/\D/g, ''));
                if (isErrorState) setIsErrorState(false);
              }}
              placeholder="••••••"
              className="lm-field font-mono w-full min-w-0 text-center text-xl tracking-[0.75em] transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="lm-btn w-full min-h-[2.75rem] cursor-pointer disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              'Verifying...'
            ) : (
              <>
                Verify Code
                <ArrowRightIcon className="lm-ico" />
              </>
            )}
          </button>
        </form>

        <hr className="lm-divider" />

        <div className="text-center">
          <Link to="/forgot-password" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 transition-colors hover:text-orange-200">
            <ArrowLeftIcon className="w-3.5 h-3.5" />
            Resend or change email
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 mt-8 space-y-1 px-1 text-center text-xs text-slate-500">
        <p>© 2026 PUCIT Classroom (Non-Official) • All Rights Reserved</p>
        <p className="text-slate-600">Designed & Administered by <span className="font-semibold text-orange-300/80">Shehzada Ather</span></p>
      </footer>
    </div>
  );
};

export default VerifyRecoveryOtp;