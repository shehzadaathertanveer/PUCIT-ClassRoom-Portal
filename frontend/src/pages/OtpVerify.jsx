import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import API from '../api/axios';

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
  const { email, name, rollNo, password, personalNotificationEmail } = location.state || {};

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
      await API.post('/auth/verify-otp', { email, otp });
      
      setIsSuccess(true);
      setStatusMessage('User validated, please login now.');
    } catch (err) {
      setStatusMessage(err.response?.data?.message || 'Invalid or expired OTP.');
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
        email, 
        password, 
        rollNo,
        ...(personalNotificationEmail && { personalNotificationEmail }) 
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
    <div className="relative min-h-screen flex flex-col items-center justify-between bg-[#080507] px-4 sm:px-6 lg:px-8 py-8 overflow-hidden selection:bg-orange-400 selection:text-black">
      
      <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] bg-orange-500/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] bg-rose-500/15 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="hidden sm:block"></div>

      <div className="relative z-10 w-full max-w-md bg-[#130910]/85 backdrop-blur-2xl border border-orange-500/30 rounded-3xl shadow-[0_0_50px_rgba(249,115,22,0.12)] p-6 sm:p-10 space-y-6">
        
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-rose-300 to-pink-400">
            PUCIT Classroom
          </h1>
          <p className="text-xs font-medium uppercase tracking-widest text-slate-400">
            Two-Factor Verification
          </p>
        </div>

        <div className="text-center px-2">
          <p className={`text-xs font-medium tracking-wide leading-relaxed py-3 px-3 rounded-xl border transition-all ${
            isSuccess 
              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' 
              : 'bg-orange-950/30 border-orange-500/20 text-orange-300/95'
          }`}>
            {statusMessage}
            {email && !isSuccess && <span className="block mt-1 font-mono text-slate-300 text-[11px]">{email}</span>}
          </p>

          {/* Spam/Junk Notice Box */}
          {!isSuccess && (
            <div className="mt-3 flex items-center justify-center gap-2 bg-[#080507]/60 border border-slate-800/80 rounded-xl py-2 px-3 text-[11px] text-slate-400">
              <span>💡</span>
              <p>Can't find it? Check your <span className="text-slate-200 font-semibold">Spam</span> or <span className="text-slate-200 font-semibold">Junk</span> folder.</p>
            </div>
          )}
        </div>

        {!isSuccess ? (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-orange-400/80 mb-2">
                Verification Code (6 Digits)
              </label>
              <input 
                type="text" 
                maxLength="6"
                value={otp} 
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} 
                required 
                className="w-full px-4 py-3.5 bg-[#080507]/80 border border-slate-700/80 rounded-2xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 text-center tracking-[0.5em] font-mono text-xl sm:text-2xl transition-all shadow-inner" 
                placeholder="••••••" 
              />
            </div>

            <button 
              type="submit" 
              disabled={loading || otp.length !== 6} 
              className="w-full py-3.5 px-4 bg-gradient-to-r from-orange-400 to-rose-500 hover:from-orange-300 hover:to-rose-400 active:scale-[0.99] text-black font-extrabold tracking-wide rounded-2xl shadow-lg shadow-orange-500/25 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed text-sm sm:text-base uppercase cursor-pointer"
            >
              {loading ? 'Verifying...' : 'Confirm Code'}
            </button>
          </form>
        ) : (
          <div className="space-y-4 pt-2">
            <Link 
              to="/login"
              className="block w-full py-3.5 px-4 text-center bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-300 hover:to-teal-400 active:scale-[0.99] text-black font-extrabold tracking-wide rounded-2xl shadow-lg shadow-emerald-500/25 transition-all duration-200 text-sm sm:text-base uppercase cursor-pointer"
            >
              Proceed to Login
            </Link>
          </div>
        )}

        {!isSuccess && (
          <div className="text-center text-sm text-slate-400 space-y-2">
            <p className="text-slate-400">Didn't receive the code?</p>
            {countdown > 0 ? (
              <span className="text-xs text-orange-400/70 block font-mono">
                Resend available in {countdown}s
              </span>
            ) : (
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={resending}
                className="text-xs font-bold uppercase tracking-wider text-orange-400 hover:text-orange-300 underline transition-all disabled:opacity-50 cursor-pointer"
              >
                {resending ? 'Resending...' : 'Resend Code'}
              </button>
            )}
          </div>
        )}

      </div>

      <footer className="relative z-10 mt-8 text-center text-xs text-slate-500 space-y-1">
        <p>© 2026 PUCIT Classroom (Non-Official) • All Rights Reserved</p>
        <p className="text-slate-600">Designed & Administered by <span className="text-orange-400/80 font-semibold">Shehzada Ather</span></p>
      </footer>

    </div>
  );
};

export default OtpVerify;