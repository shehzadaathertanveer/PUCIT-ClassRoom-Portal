import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';

const VerifyRecoveryOtp = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [email] = useState(location.state?.email || '');
  const [otp, setOtp] = useState('');
  const [helperText, setHelperText] = useState('Enter the 6-digit verification code sent to your email.');
  const [isErrorState, setIsErrorState] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleVerifyOtp = (e) => {
    e.preventDefault();
    setIsErrorState(false);

    if (otp.trim().length !== 6) {
      setHelperText('Please enter a valid 6-digit OTP code.');
      setIsErrorState(true);
      return;
    }

    setIsSubmitting(true);
    // Securely routes to your /reset-password page passing email and otp via router state
    setTimeout(() => {
      navigate('/reset-password', { state: { email, otp: otp.trim() } });
    }, 300);
  };

  return (
    <div className="relative min-h-screen flex flex-col justify-between items-center bg-[#080507] px-4 py-8 overflow-hidden selection:bg-orange-400 selection:text-black">
      
      {/* Background Ambient Glows matching the master app theme */}
      <div className="absolute top-[-10%] left-[-10%] w-[60vw] sm:w-[40vw] h-[60vw] sm:h-[40vw] bg-orange-500/15 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] sm:w-[40vw] h-[60vw] sm:h-[40vw] bg-rose-500/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-md my-auto bg-[#130910]/90 backdrop-blur-2xl border border-orange-500/30 rounded-3xl p-6 sm:p-8 space-y-6 shadow-[0_0_40px_rgba(249,115,22,0.08)] relative z-10">
        
        {/* Header Branding */}
        <div className="text-center space-y-3">
          <div className="w-12 h-12 bg-orange-500/10 border border-orange-500/30 rounded-2xl flex items-center justify-center mx-auto text-orange-400 text-xl font-bold shadow-inner">
            🔑
          </div>
          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Enter Verification Code</h1>
            <p className="text-xs text-slate-400">
              Code sent to <span className="font-mono text-orange-300">{email || 'your email'}</span>
            </p>
          </div>
        </div>

        {/* Dynamic State Box */}
        <div className="text-center px-1 space-y-3">
          <p className={`text-xs font-medium tracking-wide leading-relaxed py-2.5 px-3 rounded-xl border transition-all shadow-md ${
            isErrorState 
              ? 'bg-red-950/90 border-red-500/60 text-red-200 font-bold' 
              : 'bg-orange-950/30 border-orange-500/20 text-orange-300/90'
          }`}>
            {helperText}
          </p>

          {/* Spam/Junk Notice Box */}
          <div className="flex items-center justify-center gap-2 bg-[#080507]/60 border border-slate-800/80 rounded-xl py-2 px-3 text-[11px] text-slate-400">
            <span>💡</span>
            <p>Can't find it? Check your <span className="text-slate-200 font-semibold">Spam</span> or <span className="text-slate-200 font-semibold">Junk</span> folder.</p>
          </div>
        </div>

        <form onSubmit={handleVerifyOtp} className="space-y-5">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-orange-400/80 mb-2 text-center">
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
              className="w-full px-4 py-4 bg-[#080507] border border-slate-700 rounded-2xl text-white text-xl font-mono tracking-[0.75em] text-center focus:outline-none focus:ring-2 focus:ring-orange-400 transition-all shadow-inner"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 bg-gradient-to-r from-orange-400 to-rose-500 hover:from-orange-300 hover:to-rose-400 text-black font-extrabold uppercase text-xs rounded-xl transition-all shadow-lg shadow-orange-500/20 cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? 'Verifying...' : 'Verify Code →'}
          </button>
        </form>

        <div className="text-center pt-2">
          <Link to="/forgot-password" className="text-xs font-bold text-slate-400 hover:text-orange-400 transition-all inline-flex items-center gap-1">
            <span>←</span> Resend or change email
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 mt-8 text-center text-xs text-slate-500 space-y-1">
        <p>© 2026 PUCIT Classroom (Non-Official) • All Rights Reserved</p>
        <p className="text-slate-600">Designed & Administered by <span className="text-orange-400/80 font-semibold">Shehzada Ather</span></p>
      </footer>
    </div>
  );
};

export default VerifyRecoveryOtp;