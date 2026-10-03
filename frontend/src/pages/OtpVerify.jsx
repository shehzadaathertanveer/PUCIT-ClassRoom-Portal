import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import API from '../api/axios';
import { ArrowPathIcon, LightBulbIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';

const OtpVerify = () => {
  const [otp, setOtp] = useState('');
  const [statusMessage, setStatusMessage] = useState('Enter the 6-digit code sent to your email.');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [isSuccess, setIsSuccess] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  // Extract user data passed from the registration page state
  const { email, name, rollNo, password, personalNotificationEmail, registrationNo, verificationEmail } = location.state || {};
  // The address the server actually delivered the code to (may differ from the
  // official account email, e.g. a fresher verifying via a personal inbox).
  const deliveryEmail = verificationEmail || email;

  useEffect(() => {
    if (!email) {
      navigate('/register', { replace: true });
    }
  }, [email, navigate]);

  useEffect(() => {
    if (countdown > 0 && !isSuccess) {
      const timer = setInterval(() => setCountdown((prev) => prev - 1), 1000);
      return () => clearInterval(timer);
    }
  }, [countdown, isSuccess]);

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (otp.length !== 6 || isSuccess || loading) return;

    setLoading(true);
    setStatusMessage('Verifying security code...');

    try {
      await API.post('/auth/verify-otp', { email: deliveryEmail, otp });
      
      setIsSuccess(true);
      setStatusMessage('User validated, please login now.');
    } catch (err) {
      const msg = err.response?.data?.message || 'Invalid or expired OTP.';
      if (msg.includes('No pending registration')) {
        setStatusMessage('Your registration was not recorded by the server. Re-registering now, please wait...');
        setTimeout(() => {
          navigate('/register', { replace: true });
        }, 1200);
        return;
      }
      setStatusMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resending || countdown > 0) return;

    setResending(true);
    setStatusMessage('Sending a new verification code...');

    try {
      await API.post('/auth/signup/initiate', { 
        name, 
        email: deliveryEmail, 
        password, 
        rollNo,
        ...(personalNotificationEmail && { personalNotificationEmail }),
        ...(registrationNo && { registrationNo })
      });
      setStatusMessage('A new verification code has been sent to your email.');
      setCountdown(60);
      setOtp('');
    } catch (err) {
      setStatusMessage(err.response?.data?.message || 'Failed to resend OTP. Try again.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="lm-canvas relative min-h-dvh w-full overflow-x-hidden flex flex-col items-center justify-between px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <div className="lm-topline" />
      <div className="lm-ambient" />

      <div className="hidden sm:block" />

      <div className="lm-card relative z-10 w-full max-w-md p-5 sm:p-8 space-y-5">

        <div className="flex flex-col items-center gap-3 text-center">
          <div className="lm-inset flex h-12 w-12 items-center justify-center text-orange-200">
            <ShieldCheckIcon className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="lm-title text-2xl sm:text-3xl font-black tracking-tight">
              PUCIT Classroom
            </h1>
            <p className="lm-eyebrow">
              Two-Factor Verification
            </p>
          </div>
        </div>

        <div className="text-center">
          <p className={`text-xs font-medium leading-relaxed py-2.5 px-3.5 transition-all break-words ${
            isSuccess
              ? 'rounded-[0.875rem] border border-emerald-500/40 bg-emerald-950/60 text-emerald-300'
              : 'lm-inset text-slate-300'
          }`}>
            {statusMessage}
            {deliveryEmail && !isSuccess && (
              <span className="mt-1.5 block text-[11px]">
                <span className="text-slate-400">Code sent to</span>{' '}
                <span className="lm-num break-all text-orange-200">{deliveryEmail}</span>
                {email && email !== deliveryEmail && (
                  <span className="mt-1 block text-slate-500">(your official account email is <span className="lm-num break-all text-slate-400">{email}</span>)</span>
                )}
              </span>
            )}
          </p>

          {/* Spam/Junk Notice Box */}
          {!isSuccess && (
            <div className="lm-inset mt-3 flex items-center justify-center gap-2 px-3 py-2.5 text-left text-[11px] text-slate-400 sm:text-center">
              <LightBulbIcon className="w-4 h-4 flex-none text-amber-300" />
              <p className="min-w-0">Can't find it? Check your <span className="font-semibold text-slate-200">Spam</span> or <span className="font-semibold text-slate-200">Junk</span> folder.</p>
            </div>
          )}
        </div>

        {!isSuccess ? (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Verification Code (6 Digits)
              </label>
              <input 
                type="text" 
                maxLength="6"
                value={otp} 
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} 
                required 
                className="lm-field font-mono w-full min-w-0 text-center text-xl tracking-[0.5em] transition-all sm:text-2xl" 
                placeholder="••••••" 
              />
            </div>

            <button 
              type="submit" 
              disabled={loading || otp.length !== 6} 
              className="lm-btn w-full min-h-[2.75rem] cursor-pointer text-sm sm:text-base"
            >
              {loading ? 'Verifying...' : 'Confirm Code'}
            </button>
          </form>
        ) : (
          <div className="pt-1">
            <Link 
              to="/login"
              className="lm-btn w-full min-h-[2.75rem] cursor-pointer text-sm sm:text-base"
            >
              Proceed to Login
            </Link>
          </div>
        )}

        {!isSuccess && (
          <div className="space-y-2 text-center text-sm text-slate-400">
            <p>Didn't receive the code?</p>
            {countdown > 0 ? (
              <span className="lm-num block text-xs text-orange-300/70">
                Resend available in {countdown}s
              </span>
            ) : (
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={resending}
                className="lm-btn-ghost mx-auto cursor-pointer disabled:cursor-not-allowed"
              >
                <ArrowPathIcon className="w-4 h-4" />
                {resending ? 'Resending...' : 'Resend Code'}
              </button>
            )}
          </div>
        )}

      </div>

      <footer className="relative z-10 mt-8 space-y-1 px-1 text-center text-xs text-slate-500">
        <p>© 2026 PUCIT Classroom (Non-Official) • All Rights Reserved</p>
        <p className="text-slate-600">Designed & Administered by <span className="font-semibold text-orange-300/80">Shehzada Ather</span></p>
      </footer>

    </div>
  );
};

export default OtpVerify;