import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import API from '../api/axios';

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
    <div className="relative min-h-screen flex flex-col justify-between items-center bg-[#080507] px-4 py-8 overflow-hidden selection:bg-orange-400 selection:text-black">
      <div className="absolute top-[-10%] left-[-10%] w-[60vw] sm:w-[40vw] h-[60vw] sm:h-[40vw] bg-orange-500/15 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] sm:w-[40vw] h-[60vw] sm:h-[40vw] bg-rose-500/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-md my-auto bg-[#130910]/90 backdrop-blur-2xl border border-orange-500/30 rounded-3xl p-6 sm:p-8 space-y-6 shadow-[0_0_40px_rgba(249,115,22,0.08)] relative z-10">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 bg-orange-500/10 border border-orange-500/30 rounded-2xl flex items-center justify-center mx-auto text-orange-400 text-xl font-bold shadow-inner">
            ✉️
          </div>
          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Password Recovery</h1>
            <p className="text-xs text-slate-400 leading-relaxed">Enter your registered email address to receive a verification code.</p>
          </div>
        </div>

        {error && (
          <div className="bg-red-950/80 border border-red-500/50 text-red-200 p-3.5 rounded-2xl text-xs font-medium flex items-center gap-2">
            <span>⚠️</span>
            <p>{error}</p>
          </div>
        )}

        <form onSubmit={handleSendOtp} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-orange-400/80 mb-2">
              University Email
            </label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. bitf26a001@pucit.edu.pk"
              className="w-full px-4 py-3 bg-[#080507] border border-slate-700 rounded-xl text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400 transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-gradient-to-r from-orange-400 to-rose-500 hover:from-orange-300 hover:to-rose-400 text-black font-extrabold uppercase text-xs rounded-xl transition-all shadow-lg shadow-orange-500/20 disabled:opacity-50 cursor-pointer"
          >
            {loading ? 'Sending Code...' : 'Send Verification Code'}
          </button>
        </form>

        <div className="text-center pt-2">
          <Link to="/login" className="text-xs font-bold text-slate-400 hover:text-orange-400 transition-all inline-flex items-center gap-1">
            <span>←</span> Back to Login
          </Link>
        </div>
      </div>

      <footer className="relative z-10 mt-8 text-center text-xs text-slate-500 space-y-1">
        <p>© 2026 PUCIT Classroom (Non-Official) • All Rights Reserved</p>
        <p className="text-slate-600">Designed & Administered by <span className="text-orange-400/80 font-semibold">Shehzada Ather</span></p>
      </footer>
    </div>
  );
};

export default ForgotPassword;