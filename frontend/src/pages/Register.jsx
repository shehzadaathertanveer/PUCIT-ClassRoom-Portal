import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../api/axios';

const Register = () => {
  const [rollNo, setRollNo] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [personalNotificationEmail, setPersonalNotificationEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [isEmailDisabled, setIsEmailDisabled] = useState(false);
  const [isRollNoDisabled, setIsRollNoDisabled] = useState(false);
  const [isFresher, setIsFresher] = useState(false);
  const [helperText, setHelperText] = useState('Enter your roll number first if you are a student, or enter your email first if you are a teacher.');
  const [isErrorState, setIsErrorState] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isFormValid, setIsFormValid] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();

  const fresherBatchCode = (import.meta.env.VITE_FRESHER_BATCH || 'f26').trim().toLowerCase();

  // Smart dual-role field toggling & instruction sync
  useEffect(() => {
    if (isErrorState) return;

    if (rollNo.trim().length > 0) {
      setIsRollNoDisabled(false);
      setIsEmailDisabled(true);

      const cleanRollNo = rollNo.trim().toLowerCase();
      
      if (cleanRollNo.includes(fresherBatchCode)) {
        setEmail(''); 
        setIsFresher(true);
        setHelperText(`Fresher batch (${fresherBatchCode.toUpperCase()}) detected. Provide personal email for instant alerts.`);
      } else {
        setEmail(`${cleanRollNo}@pucit.edu.pk`);
        setIsFresher(false);
        setHelperText(`Senior student profile linked to: ${cleanRollNo}@pucit.edu.pk`);
      }
    } else if (email.trim().length > 0 && !isEmailDisabled) {
      setIsRollNoDisabled(true);
      setIsFresher(false);
      setHelperText('Faculty profile active: Roll number entry bypassed.');
    } else {
      setIsRollNoDisabled(false);
      setIsEmailDisabled(false);
      setIsFresher(false);
      setHelperText('Enter your roll number first if you are a student, or enter your email first if you are a teacher.');
    }
  }, [rollNo, email, fresherBatchCode, isErrorState]);

  // Real-time form validation
  useEffect(() => {
    const hasIdentifier = rollNo.trim().length > 0 || email.trim().length > 0;
    const fresherEmailCheck = !isFresher || personalNotificationEmail.trim().length > 0;
    
    if (hasIdentifier && fresherEmailCheck && name.trim() && password.length >= 6 && password === confirmPassword) {
      setIsFormValid(true);
    } else {
      setIsFormValid(false);
    }
  }, [rollNo, name, email, personalNotificationEmail, password, confirmPassword, isFresher]);

  const handleRegister = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!isFormValid || loading) return;

    // Reset UI before request
    setLoading(true);
    setIsErrorState(false);
    setHelperText('Communicating with security gateway...');

    try {
      const identifierRoll = rollNo.trim() ? rollNo.trim().toUpperCase() : email.trim().split('@')[0].toUpperCase();

      const payload = {
        name: name.trim(),
        password,
        rollNo: identifierRoll,
        ...(email.trim() && { email: email.trim().toLowerCase() }),
        ...(isFresher && personalNotificationEmail.trim() && { personalNotificationEmail: personalNotificationEmail.trim().toLowerCase() })
      };

      const res = await API.post('/auth/signup/initiate', payload);
      const responseData = res.data;
      
      setLoading(false);

      if (responseData.email) {
        navigate('/otp-verify', { 
          state: { 
            email: responseData.email, 
            name: name.trim(), 
            rollNo: identifierRoll, 
            password 
          } 
        });
      } else if (responseData.data?.user) {
        login(responseData.data.user, responseData.token);
        navigate('/');
      } else {
        setHelperText(responseData.message || 'Registration successful!');
      }
    } catch (err) {
      const errorMsg = 
        err?.response?.data?.message || 
        err?.message || 
        'Registration failed. Please check your inputs.';
      
      setLoading(false);
      setHelperText(errorMsg);
      setIsErrorState(true);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-between bg-[#080507] px-4 sm:px-6 lg:px-8 py-8 overflow-hidden selection:bg-orange-400 selection:text-black">
      
      <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] bg-orange-500/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] bg-rose-500/15 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="hidden sm:block"></div>

      <div className="relative z-10 w-full max-w-md bg-[#130910]/80 backdrop-blur-2xl border border-orange-500/30 rounded-3xl shadow-[0_0_50px_rgba(249,115,22,0.12)] p-6 sm:p-10 space-y-5">
        
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-rose-300 to-pink-400">
            PUCIT Classroom
          </h1>
          <p className="text-xs font-medium uppercase tracking-widest text-slate-400">
            Create Your Account
          </p>
        </div>

        <div className="text-center px-2">
          <p className={`text-xs font-medium tracking-wide leading-relaxed py-2.5 px-3 rounded-xl border transition-all shadow-md ${
            isErrorState 
              ? 'bg-red-950/90 border-red-500/60 text-red-200 font-bold' 
              : 'bg-orange-950/30 border-orange-500/20 text-orange-300/90'
          }`}>
            {helperText}
          </p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-orange-400/80 mb-2">
              Roll Number {isRollNoDisabled && <span className="text-slate-500 font-normal lowercase">(bypassed for teacher)</span>}
            </label>
            <input 
              type="text" 
              value={rollNo} 
              onChange={(e) => {
                setRollNo(e.target.value.toUpperCase());
                if (isErrorState) setIsErrorState(false);
              }} 
              disabled={isRollNoDisabled}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck="false"
              autoComplete="off"
              className={`w-full px-4 py-3.5 border rounded-2xl text-sm sm:text-base transition-all shadow-inner uppercase ${
                isRollNoDisabled 
                  ? 'bg-[#1a0f15]/50 border-slate-800 text-slate-500 cursor-not-allowed opacity-60' 
                  : 'bg-[#080507]/80 border-slate-700/80 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-400'
              }`} 
              placeholder="BITF26A001" 
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-orange-400/80 mb-2">
              Full Name
            </label>
            <input 
              type="text" 
              value={name} 
              onChange={(e) => {
                setName(e.target.value);
                if (isErrorState) setIsErrorState(false);
              }} 
              className="w-full px-4 py-3.5 bg-[#080507]/80 border border-slate-700/80 rounded-2xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 text-sm sm:text-base transition-all shadow-inner" 
              placeholder="Shehzada Ather" 
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-orange-400/80 mb-2">
              Email Address {isEmailDisabled && <span className="text-orange-300 font-normal lowercase">(auto-configured)</span>}
            </label>
            <input 
              type="email" 
              value={email} 
              onChange={(e) => {
                if (!isEmailDisabled) setEmail(e.target.value);
                if (isErrorState) setIsErrorState(false);
              }} 
              disabled={isEmailDisabled}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              className={`w-full px-4 py-3.5 border rounded-2xl text-sm sm:text-base transition-all shadow-inner ${
                isEmailDisabled 
                  ? 'bg-[#1a0f15] border-orange-500/30 text-orange-200 cursor-not-allowed opacity-90' 
                  : 'bg-[#080507]/80 border-slate-700/80 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-400'
              }`} 
              placeholder="teacher.name@pucit.edu.pk" 
            />
          </div>

          {/* Conditional Personal Fallback Email Field for Freshies */}
          {isFresher && (
            <div className="bg-orange-950/20 border border-orange-500/20 p-3.5 rounded-2xl space-y-1.5 animate-fadeIn">
              <label className="block text-xs font-bold uppercase tracking-wider text-orange-400">
                Personal Notification Email <span className="text-rose-400">*</span>
              </label>
              <p className="text-[11px] text-slate-400 leading-snug">
                Since your official PUCIT email isn't active yet, enter your personal Gmail/Outlook to receive instant quizzes and assignment alerts.
              </p>
              <input 
                type="email" 
                value={personalNotificationEmail} 
                onChange={(e) => {
                  setPersonalNotificationEmail(e.target.value);
                  if (isErrorState) setIsErrorState(false);
                }} 
                required
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                className="w-full px-4 py-3 bg-[#080507] border border-orange-500/40 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-400 text-sm transition-all" 
                placeholder="your.personal@gmail.com" 
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-orange-400/80 mb-2">
              Password
            </label>
            <div className="relative">
              <input 
                type={showPassword ? 'text' : 'password'} 
                value={password} 
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (isErrorState) setIsErrorState(false);
                }} 
                className="w-full px-4 py-3.5 pr-12 bg-[#080507]/80 border border-slate-700/80 rounded-2xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 text-sm sm:text-base transition-all shadow-inner" 
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

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-orange-400/80 mb-2">
              Confirm Password
            </label>
            <div className="relative">
              <input 
                type={showConfirmPassword ? 'text' : 'password'} 
                value={confirmPassword} 
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (isErrorState) setIsErrorState(false);
                }} 
                className="w-full px-4 py-3.5 pr-12 bg-[#080507]/80 border border-slate-700/80 rounded-2xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 text-sm sm:text-base transition-all shadow-inner" 
                placeholder="••••••••" 
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-orange-400 transition-colors text-xs font-medium uppercase tracking-wider focus:outline-none cursor-pointer"
              >
                {showConfirmPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading || !isFormValid} 
            className="w-full py-3.5 px-4 bg-gradient-to-r from-orange-400 to-rose-500 hover:from-orange-300 hover:to-rose-400 active:scale-[0.99] text-black font-extrabold tracking-wide rounded-2xl shadow-lg shadow-orange-500/25 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed text-sm sm:text-base uppercase mt-2 cursor-pointer"
          >
            {loading ? 'Processing...' : 'Sign Up'}
          </button>
        </form>

        <p className="text-center text-sm text-slate-400">
          Already have an account?{' '}
          <Link to="/login" className="text-orange-400 hover:text-orange-300 font-semibold transition-colors underline decoration-orange-400/40 underline-offset-4">
            Login
          </Link>
        </p>

      </div>

      <footer className="relative z-10 mt-8 text-center text-xs text-slate-500 space-y-1">
        <p>© 2026 PUCIT Classroom (Non-Official) • All Rights Reserved</p>
        <p className="text-slate-600">Designed & Administered by <span className="text-orange-400/80 font-semibold">Shehzada Ather</span></p>
      </footer>

    </div>
  );
};

export default Register;




