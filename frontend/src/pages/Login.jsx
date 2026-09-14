import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../api/axios';

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
    <div className="relative min-h-screen flex flex-col items-center justify-between bg-[#080507] px-4 sm:px-6 lg:px-8 py-8 overflow-hidden selection:bg-orange-400 selection:text-black">
      
      {/* Background Ambient Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] bg-orange-500/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] bg-rose-500/15 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="hidden sm:block"></div>

      {/* Main Glassmorphic Card */}
      <div className="relative z-10 w-full max-w-md bg-[#130910]/80 backdrop-blur-2xl border border-orange-500/30 rounded-3xl shadow-[0_0_50px_rgba(249,115,22,0.12)] p-6 sm:p-10 space-y-4">
        
        {/* Header Branding */}
        <div className="text-center space-y-1">
          <h1 className="text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-rose-300 to-pink-400">
            PUCIT Classroom
          </h1>
          <p className="text-xs font-medium uppercase tracking-widest text-slate-400">
            Secure Portal Gateway
          </p>
        </div>

        {/* Dynamic State Box */}
        <div className="text-center px-1">
          <p className={`text-xs font-medium tracking-wide leading-relaxed py-2.5 px-3 rounded-xl border transition-all shadow-md ${
            isErrorState 
              ? 'bg-red-950/90 border-red-500/60 text-red-200 font-bold' 
              : 'bg-orange-950/30 border-orange-500/20 text-orange-300/90'
          }`}>
            {helperText}
          </p>
        </div>

        {/* Form Inputs */}
        <form onSubmit={handleLogin} className="space-y-3">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-orange-400/80 mb-1.5">
              Roll Number {isRollNoDisabled && <span className="text-slate-500 font-normal lowercase">(bypassed)</span>}
            </label>
            <input 
              type="text" 
              value={rollNo} 
              onChange={(e) => {
                setRollNo(e.target.value);
                if (isErrorState) setIsErrorState(false);
              }} 
              disabled={isRollNoDisabled}
              className={`w-full px-4 py-3 border rounded-2xl text-sm sm:text-base transition-all shadow-inner uppercase ${
                isRollNoDisabled 
                  ? 'bg-[#1a0f15]/50 border-slate-800 text-slate-500 cursor-not-allowed opacity-60' 
                  : 'bg-[#080507]/80 border-slate-700/80 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-400'
              }`} 
              placeholder="BITF26A001" 
            />
          </div>

          <div className="text-center text-[9px] uppercase font-bold tracking-widest text-slate-500 my-[-2px]">
            - OR -
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-orange-400/80 mb-1.5">
              Email Address {isEmailDisabled && <span className="text-slate-500 font-normal lowercase">(bypassed)</span>}
            </label>
            <input 
              type="email" 
              value={email} 
              onChange={(e) => {
                setEmail(e.target.value);
                if (isErrorState) setIsErrorState(false);
              }} 
              disabled={isEmailDisabled}
              className={`w-full px-4 py-3 border rounded-2xl text-sm sm:text-base transition-all shadow-inner lowercase ${
                isEmailDisabled 
                  ? 'bg-[#1a0f15]/50 border-slate-800 text-slate-500 cursor-not-allowed opacity-60' 
                  : 'bg-[#080507]/80 border-slate-700/80 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-400'
              }`} 
              placeholder="teacher.name@pucit.edu.pk or personal email" 
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-orange-400/80">
                Password
              </label>
              <Link to="/forgot-password" className="text-xs text-orange-400/60 hover:text-orange-300 transition-colors font-medium">
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
                className="w-full px-4 py-3 pr-12 bg-[#080507]/80 border border-slate-700/80 rounded-2xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 text-sm sm:text-base transition-all shadow-inner" 
                placeholder="••••••••" 
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-orange-400 transition-colors text-xs font-medium uppercase tracking-wider focus:outline-none cursor-pointer"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading} 
            className="w-full py-3.5 px-4 bg-gradient-to-r from-orange-400 to-rose-500 hover:from-orange-300 hover:to-rose-400 active:scale-[0.99] text-black font-extrabold tracking-wide rounded-2xl shadow-lg shadow-orange-500/25 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed text-sm sm:text-base uppercase mt-2 cursor-pointer"
          >
            {loading ? 'Authenticating...' : 'Login'}
          </button>
        </form>

        <p className="text-center text-sm text-slate-400 pt-1">
          Don't have an account?{' '}
          <Link to="/register" className="text-orange-400 hover:text-orange-300 font-semibold transition-colors underline decoration-orange-400/40 underline-offset-4">
            Register
          </Link>
        </p>

      </div>

      {/* Admin Attribution & Non-Official Footer */}
      <footer className="relative z-10 mt-6 text-center text-xs text-slate-500 space-y-1">
        <p>© 2026 PUCIT Classroom (Non-Official) • All Rights Reserved</p>
        <p className="text-slate-600">Designed & Administered by <span className="text-orange-400/80 font-semibold">Shehzada Ather</span></p>
      </footer>

    </div>
  );
};

export default Login;