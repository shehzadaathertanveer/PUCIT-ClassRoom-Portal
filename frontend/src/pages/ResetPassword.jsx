import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import API from '../api/axios';

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
    <div className="relative min-h-screen flex flex-col justify-between items-center bg-[#080507] px-4 py-8 overflow-hidden selection:bg-orange-400 selection:text-black">
      <div className="absolute top-[-10%] right-[-10%] w-[60vw] sm:w-[40vw] h-[60vw] sm:h-[40vw] bg-rose-500/15 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-md my-auto bg-[#130910]/90 backdrop-blur-2xl border border-orange-500/30 rounded-3xl p-6 sm:p-8 space-y-6 shadow-[0_0_40px_rgba(249,115,22,0.08)] relative z-10">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 bg-orange-500/10 border border-orange-500/30 rounded-2xl flex items-center justify-center mx-auto text-orange-400 text-xl font-bold shadow-inner">
            🛡️
          </div>
          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Set New Password</h1>
            <p className="text-xs text-slate-400">Choose a secure password for your account.</p>
          </div>
        </div>

        {error && (
          <div className="bg-red-950/80 border border-red-500/50 text-red-200 p-3.5 rounded-2xl text-xs font-medium flex items-center gap-2">
            <span>⚠️</span>
            <p>{error}</p>
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 p-3.5 rounded-2xl text-xs font-medium flex items-center gap-2">
            <span>✓</span>
            <p>{successMsg}</p>
          </div>
        )}

        <form onSubmit={handleResetPassword} className="space-y-4">
          {/* New Password Input with Show/Hide Toggle */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-orange-400/80 mb-2">
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
                className="w-full px-4 py-3 bg-[#080507] border border-slate-700 rounded-xl text-white text-sm pr-12 focus:outline-none focus:ring-2 focus:ring-orange-400 transition-all shadow-inner"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs font-bold uppercase cursor-pointer"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {/* Confirm Password Input with Show/Hide Toggle */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-orange-400/80 mb-2">
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
                className={`w-full px-4 py-3 bg-[#080507] border rounded-xl text-white text-sm pr-12 focus:outline-none focus:ring-2 transition-all shadow-inner ${
                  confirmPassword && !doPasswordsMatch 
                    ? 'border-red-500/80 focus:ring-red-400' 
                    : doPasswordsMatch 
                    ? 'border-emerald-500/80 focus:ring-emerald-400' 
                    : 'border-slate-700 focus:ring-orange-400'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs font-bold uppercase cursor-pointer"
              >
                {showConfirmPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {confirmPassword && !doPasswordsMatch && (
              <p className="text-[10px] text-red-400 font-medium mt-1.5 ml-1">Passwords do not match yet.</p>
            )}
            {doPasswordsMatch && (
              <p className="text-[10px] text-emerald-400 font-medium mt-1.5 ml-1">✓ Passwords match successfully.</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !isFormValid}
            className="w-full py-3.5 bg-gradient-to-r from-orange-400 to-rose-500 hover:from-orange-300 hover:to-rose-400 text-black font-extrabold uppercase text-xs rounded-xl transition-all shadow-lg shadow-orange-500/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer mt-2"
          >
            {loading ? 'Updating Password...' : 'Reset Password'}
          </button>
        </form>

        <div className="text-center pt-2">
          <Link to="/login" className="text-xs font-bold text-slate-400 hover:text-orange-400 transition-all">
            ← Back to Login
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

export default ResetPassword;