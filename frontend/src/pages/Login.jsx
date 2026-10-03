import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../api/axios';
import { EyeIcon, EyeSlashIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';

const Login = () => {
  const [rollNo, setRollNo] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [isEmailDisabled, setIsEmailDisabled] = useState(false);
  const [isRollNoDisabled, setIsRollNoDisabled] = useState(false);
  
  const [helperText, setHelperText] = useState('Enter your Roll Number (if student) OR Email (if teacher/admin) with your password.');
  const [isErrorState, setIsErrorState] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();

  // Smart dual-role field toggling & instruction sync
  useEffect(() => {
    if (rollNo.trim().length > 0) {
      setIsRollNoDisabled(false);
      setIsEmailDisabled(true);
      if (!isErrorState) setHelperText('Student profile linked: Roll number entry active.');
    } else if (email.trim().length > 0) {
      setIsRollNoDisabled(true);
      setIsEmailDisabled(false);
      if (!isErrorState) setHelperText('Faculty/Fresher profile active: Roll number entry bypassed.');
    } else {
      setIsRollNoDisabled(false);
      setIsEmailDisabled(false);
      if (!isErrorState) setHelperText('Enter your Roll Number (if student) OR Email (if teacher/admin) with your password.');
    }
  }, [rollNo, email, isErrorState]);

  const handleLogin = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    setIsErrorState(false);

    const trimmedRoll = rollNo.trim();
    const trimmedEmail = email.trim();

    if (!trimmedRoll && !trimmedEmail) {
      setHelperText('Please provide either your Roll Number or Email Address.');
      setIsErrorState(true);
      return;
    }

    if (!password) {
      setHelperText('Please enter your password.');
      setIsErrorState(true);
      return;
    }

    setLoading(true);
    setHelperText('Authenticating with security gateway...');

    try {
      const loginIdentifier = trimmedRoll ? trimmedRoll.toUpperCase() : trimmedEmail.toLowerCase();

      const payload = {
        loginIdentifier,
        password
      };

      const res = await API.post('/auth/login', payload, { timeout: 10000 });
      login(res.data.user, res.data.token);
      navigate('/');
    } catch (err) {
      let errorMsg = 'Invalid credentials or network error.';
      
      if (err?.response?.data?.message) {
        errorMsg = err.response.data.message;
      } else if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        errorMsg = 'Server response timed out. Please check your connection and try again.';
      } else if (err?.message) {
        errorMsg = err.message;
      }

      setHelperText(errorMsg);
      setIsErrorState(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lm-canvas relative min-h-dvh w-full overflow-x-hidden flex flex-col items-center justify-between px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <div className="lm-topline" />
      <div className="lm-ambient" />

      <div className="hidden sm:block" />

      {/* Main steel panel */}
      <div className="lm-card relative z-10 w-full max-w-md p-5 sm:p-8 space-y-5">

        {/* Header Branding */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="lm-inset flex h-12 w-12 items-center justify-center text-orange-200">
            <ShieldCheckIcon className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="lm-title text-2xl sm:text-3xl font-black tracking-tight">
              PUCIT Classroom
            </h1>
            <p className="lm-eyebrow">
              Secure Portal Gateway
            </p>
          </div>
        </div>

        {/* Dynamic State Box */}
        <div className="text-center">
          <p className={`text-xs font-medium leading-relaxed py-2.5 px-3.5 transition-all break-words ${
            isErrorState
              ? 'rounded-[0.875rem] border border-red-500/40 bg-red-950/60 text-red-300 font-bold'
              : 'lm-inset text-slate-300'
          }`}>
            {helperText}
          </p>
        </div>

        {/* Form Inputs */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 mb-1.5">
              Roll Number {isRollNoDisabled && <span className="text-slate-500 font-normal normal-case tracking-normal">(bypassed)</span>}
            </label>
            <input 
              type="text" 
              value={rollNo} 
              onChange={(e) => {
                setRollNo(e.target.value);
                if (isErrorState) setIsErrorState(false);
              }} 
              disabled={isRollNoDisabled}
              className={`lm-field w-full min-w-0 uppercase transition-all ${
                isRollNoDisabled ? 'opacity-55 cursor-not-allowed' : ''
              }`} 
              placeholder="BITF26A001" 
            />
          </div>

          <div className="flex items-center gap-3">
            <hr className="lm-divider flex-1" />
            <span className="lm-eyebrow">- OR -</span>
            <hr className="lm-divider flex-1" />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 mb-1.5">
              Email Address {isEmailDisabled && <span className="text-slate-500 font-normal normal-case tracking-normal">(bypassed)</span>}
            </label>
            <input 
              type="email" 
              value={email} 
              onChange={(e) => {
                setEmail(e.target.value);
                if (isErrorState) setIsErrorState(false);
              }} 
              disabled={isEmailDisabled}
              className={`lm-field w-full min-w-0 lowercase transition-all ${
                isEmailDisabled ? 'opacity-55 cursor-not-allowed' : ''
              }`} 
              placeholder="teacher.name@pucit.edu.pk or personal email" 
            />
          </div>

          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Password
              </label>
              <Link to="/forgot-password" className="text-xs font-medium text-orange-300 transition-colors hover:text-orange-200">
                Forgot Password?
              </Link>
            </div>
            <div className="relative">
              <input 
                type={showPassword ? 'text' : 'password'} 
                value={password} 
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (isErrorState) setIsErrorState(false);
                }} 
                className="lm-field w-full min-w-0 pr-24 transition-all" 
                placeholder="••••••••" 
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

          <button 
            type="submit" 
            disabled={loading} 
            className="lm-btn w-full min-h-[2.75rem] cursor-pointer text-sm sm:text-base"
          >
            {loading ? 'Authenticating...' : 'Login'}
          </button>
        </form>

        <hr className="lm-divider" />

        <p className="text-center text-sm text-slate-400">
          Don't have an account?{' '}
          <Link to="/register" className="font-semibold text-orange-300 underline decoration-white/25 underline-offset-4 transition-colors hover:text-orange-200">
            Register
          </Link>
        </p>

      </div>

      {/* Admin Attribution & Non-Official Footer */}
      <footer className="relative z-10 mt-6 space-y-1 px-1 text-center text-xs text-slate-500">
        <p>© 2026 PUCIT Classroom (Non-Official) • All Rights Reserved</p>
        <p className="text-slate-600">Designed & Administered by <span className="font-semibold text-orange-300/80">Shehzada Ather</span></p>
      </footer>

    </div>
  );
};

export default Login;