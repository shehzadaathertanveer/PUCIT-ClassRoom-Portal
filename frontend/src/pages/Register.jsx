import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../api/axios';

const Register = () => {
  const [rollNo, setRollNo] = useState('');
  const [registrationNo, setRegistrationNo] = useState(''); 
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [personalNotificationEmail, setPersonalNotificationEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [isEmailDisabled, setIsEmailDisabled] = useState(false);
  const [isRollNoDisabled, setIsRollNoDisabled] = useState(false);
  
  // Differentiate fresher states accurately
  const [isFresherPrefixOnly, setIsFresherPrefixOnly] = useState(false); // Triggers BOTH RegNo & Personal Email (e.g. BITF26A) - ONLY when mode ON
  const [isFresherWithRoll, setIsFresherWithRoll] = useState(false);       // Triggers ONLY Personal Email (e.g. BITF26A004) - ONLY when mode ON
  const [isSenior, setIsSenior] = useState(false);                         // Senior/disabled-mode -> official email auto-linked, NO personal email
  const [fresherBlocked, setFresherBlocked] = useState(false);             // Prefix typed while fresher mode is OFF -> must enter full roll number

  const [helperText, setHelperText] = useState('Enter your roll number first if you are a student, or enter your email first if you are a teacher.');
  const [isErrorState, setIsErrorState] = useState(false);
  const [loading, setLoading] = useState(false);

  const [fresherRegistrationEnabled, setFresherRegistrationEnabled] = useState(null);
  
  const { login } = useAuth();
  const navigate = useNavigate();

  const fresherBatchCode = (import.meta.env.VITE_FRESHER_BATCH || 'f26').trim().toLowerCase();

  // Load the fresher registration gate. When disabled, students may only
  // register with full Roll Numbers (e.g. BITF26A004), not bare prefixes.
  useEffect(() => {
    API.get('/auth/registration-mode')
      .then((res) => {
        const enabled = res.data?.data?.fresherRegistrationEnabled;
        if (typeof enabled === 'boolean') setFresherRegistrationEnabled(enabled);
      })
      .catch(() => setFresherRegistrationEnabled(true));
  }, []);

  // Smart dual-role and precise fresher detection logic
  useEffect(() => {
    if (isErrorState) return;

    const trimmedRoll = rollNo.trim().toLowerCase();

    if (trimmedRoll.length > 0) {
      setIsRollNoDisabled(false);
      setIsEmailDisabled(true);

      const isFresherBatch = trimmedRoll.includes(fresherBatchCode);

      if (isFresherBatch) {
        // Check if it ends with digits (e.g. 004 in BITF26A004)
        const hasNumberSuffix = /\d{2,3}$/.test(trimmedRoll);

        setEmail('');
        setIsSenior(false);
        if (!hasNumberSuffix) {
          // Prefix only (e.g. BITF26A): personal email is ONLY available when
          // the admin has fresher mode ENABLED. When disabled the form MUST NOT
          // let the prefix through — the user has to type a full roll number.
          setIsFresherPrefixOnly(fresherRegistrationEnabled === true);
          setIsFresherWithRoll(false);
          setFresherBlocked(fresherRegistrationEnabled !== true);
          setRegistrationNo('');
          setPersonalNotificationEmail('');
          if (fresherRegistrationEnabled === false) {
            setHelperText(`Fresher prefix-only registration is disabled by the administrator. Please enter your full Roll Number (e.g. BITF26A004) to continue. (${trimmedRoll.toUpperCase()})`);
          } else if (fresherRegistrationEnabled === true) {
            setHelperText(`Fresher section prefix detected (${trimmedRoll.toUpperCase()}). Please enter your University Registration Number & Personal Email.`);
          } else {
            setHelperText(`Checking registration mode... please enter your full Roll Number to continue. (${trimmedRoll.toUpperCase()})`);
          }
        } else {
          // Full fresher roll number (e.g. BITF26A004). The personal-email
          // option is available ONLY when the admin has confirmed fresher mode
          // ON. Otherwise the roll number is auto-converted to the official
          // inbox (rollno@pucit.edu.pk) and they verify it exactly like seniors.
          setIsFresherPrefixOnly(false);
          setFresherBlocked(false);
          setRegistrationNo('');
          setPersonalNotificationEmail('');
          if (fresherRegistrationEnabled === true) {
            setIsFresherWithRoll(true);
            setIsSenior(false);
            setHelperText(`Fresher roll number detected (${trimmedRoll.toUpperCase()}). Please enter your Personal Notification Email.`);
          } else {
            setIsFresherWithRoll(false);
            setIsSenior(true);
            setHelperText(
              fresherRegistrationEnabled === false
                ? `Fresher registration is disabled. Your official inbox (${trimmedRoll}@pucit.edu.pk) will be used for verification.`
                : `Checking registration mode... please wait.`
            );
          }
        }
      } else {
        // Senior student profile -> official email auto-linked, NO personal email
        setEmail(`${trimmedRoll}@pucit.edu.pk`);
        setIsFresherPrefixOnly(false);
        setIsFresherWithRoll(false);
        setFresherBlocked(false);
        setIsSenior(true);
        setPersonalNotificationEmail('');
        setRegistrationNo('');
        setHelperText(`Senior student profile linked to: ${trimmedRoll.toUpperCase()}@pucit.edu.pk`);
      }
    } else if (email.trim().length > 0 && !isEmailDisabled) {
      setIsRollNoDisabled(true);
      setIsFresherPrefixOnly(false);
      setIsFresherWithRoll(false);
      setFresherBlocked(false);
      setIsSenior(false);
      setPersonalNotificationEmail('');
      setRegistrationNo('');
      setHelperText('Faculty profile active: Roll number entry bypassed.');
    } else {
      setIsRollNoDisabled(false);
      setIsEmailDisabled(false);
      setIsFresherPrefixOnly(false);
      setIsFresherWithRoll(false);
      setFresherBlocked(false);
      setIsSenior(false);
      setPersonalNotificationEmail('');
      setRegistrationNo('');
      setHelperText('Enter your roll number first if you are a student, or enter your email first if you are a teacher.');
    }
  }, [rollNo, email, fresherBatchCode, isErrorState, fresherRegistrationEnabled]);

  // Real-time form validation including password matching
  const hasIdentifier = rollNo.trim().length > 0 || email.trim().length > 0;
  let fresherCheck = true;
  if (isFresherPrefixOnly) {
    fresherCheck = registrationNo.trim().length > 0 && personalNotificationEmail.trim().length > 0;
  } else if (isFresherWithRoll) {
    fresherCheck = personalNotificationEmail.trim().length > 0;
  }
  const personalEmailIsPucit = /@pucit\.edu\.pk$/i.test(personalNotificationEmail.trim());
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const isFormValid = hasIdentifier && !fresherBlocked && !personalEmailIsPucit
    && fresherCheck && name.trim().length > 0 && password.length >= 6 && passwordsMatch;

  const handleRegister = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!isFormValid || loading) return;

    if (password !== confirmPassword) {
      setHelperText('Passwords do not match.');
      setIsErrorState(true);
      return;
    }

    if (personalEmailIsPucit) {
      setHelperText('You cannot use your official @pucit.edu.pk email as the personal notification email.');
      setIsErrorState(true);
      return;
    }

    setLoading(true);
    setIsErrorState(false);
    setHelperText('Communicating with security gateway...');

    try {
      const teacherMode = isRollNoDisabled;
      const registerRoll = !teacherMode ? rollNo.trim().toUpperCase() : '';

      const payload = {
        name: name.trim(),
        password,
        ...(registerRoll && { rollNo: registerRoll }),
        ...(email.trim() && { email: email.trim().toLowerCase() }),
        ...(isFresherPrefixOnly && {
          registrationNo: registrationNo.trim().toUpperCase(),
          personalNotificationEmail: personalNotificationEmail.trim().toLowerCase()
        }),
        ...(isFresherWithRoll && {
          personalNotificationEmail: personalNotificationEmail.trim().toLowerCase()
        })
      };

      const res = await API.post('/auth/signup/initiate', payload);
      const responseData = res.data;
      
      setLoading(false);

      if (responseData.email) {
        navigate('/otp-verify', { 
          state: { 
            email: responseData.email, 
            verificationEmail: responseData.verificationEmail || responseData.email,
            name: name.trim(), 
            rollNo: registerRoll, 
            password,
            registrationNo: registrationNo.trim().toUpperCase(),
            personalNotificationEmail: personalNotificationEmail.trim().toLowerCase()
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
              Roll Number / Section Prefix {isRollNoDisabled && <span className="text-slate-500 font-normal lowercase">(bypassed for teacher)</span>} {fresherBlocked && <span className="text-red-400 font-normal lowercase">(full roll number required)</span>}
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
              placeholder="BITF26A or BITF26A004" 
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
              placeholder="Enter your full name" 
            />
          </div>

          {!isEmailDisabled && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-orange-400/80 mb-2">
                Email Address
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
          )}

          {/* Senior students: official inbox is auto-linked to their roll number */}
          {isSenior && (
            <div className="bg-sky-950/20 border border-sky-500/20 p-4 rounded-2xl animate-fadeIn">
              <p className="text-[11px] text-sky-300 font-bold uppercase tracking-wider mb-1">
                Official University Email <span className="text-slate-500 font-normal lowercase">(auto-configured)</span>
              </p>
              <p className="text-xs sm:text-sm text-sky-100 font-mono break-all">
                {rollNo.trim().toLowerCase()}@pucit.edu.pk
              </p>
              <p className="text-[11px] text-slate-400 leading-snug mt-2">
                Your verification code will be sent to this official inbox. It cannot be changed.
              </p>
            </div>
          )}

          {/* Prefix-only entry rejected while the admin has fresher mode OFF */}
          {fresherBlocked && (
            <div className="bg-red-950/40 border border-red-500/40 p-4 rounded-2xl animate-fadeIn">
              <p className="text-[11px] text-red-300 font-bold uppercase tracking-wider mb-1">
                Fresher Registration Disabled
              </p>
              <p className="text-xs text-red-200/80 leading-snug">
                Prefix-only registration is currently off. Please enter your full Roll Number (e.g. BITF26A004) to register.
              </p>
            </div>
          )}

          {/* Conditional Freshers Registration Number & Personal Email Fields (Triggered only when section prefix only is typed AND fresher mode is ON, e.g. BITF26A) */}
          {isFresherPrefixOnly && (
            <div className="bg-orange-950/20 border border-orange-500/20 p-4 rounded-2xl space-y-3.5 animate-fadeIn">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-orange-400 mb-1.5">
                  University Registration Number <span className="text-rose-400">*</span>
                </label>
                <input 
                  type="text" 
                  value={registrationNo} 
                  onChange={(e) => {
                    setRegistrationNo(e.target.value.toUpperCase());
                    if (isErrorState) setIsErrorState(false);
                  }} 
                  required
                  autoCapitalize="characters"
                  className="w-full px-4 py-3 bg-[#080507] border border-orange-500/40 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-400 text-sm transition-all uppercase" 
                  placeholder="e.g., 2026-NTS-001" 
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-orange-400 mb-1.5">
                  Personal Notification Email <span className="text-rose-400">*</span>
                </label>
                <p className="text-[11px] text-slate-400 leading-snug mb-2">
                  Only for freshers (fresher registration is enabled). Must be a personal, non-university email — your official @pucit.edu.pk inbox cannot be used here.
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
                  className={`w-full px-4 py-3 bg-[#080507] border rounded-xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-400 text-sm transition-all lowercase ${
                    personalEmailIsPucit ? 'border-red-500' : 'border-orange-500/40'
                  }`} 
                  placeholder="your.personal@gmail.com" 
                />
                {personalEmailIsPucit && (
                  <p className="text-[11px] text-red-400 font-bold mt-1.5 ml-1">
                    ⚠️ Official university emails cannot be used as your personal email.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Conditional Freshers Personal Email ONLY Box (Triggered when full fresher roll number is typed AND fresher mode is ON, e.g. BITF26A004) */}
          {isFresherWithRoll && (
            <div className="bg-orange-950/20 border border-orange-500/20 p-4 rounded-2xl space-y-3.5 animate-fadeIn">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-orange-400 mb-1.5">
                  Personal Notification Email <span className="text-rose-400">*</span>
                </label>
                <p className="text-[11px] text-slate-400 leading-snug mb-2">
                  Only for freshers (fresher registration is enabled). Must be a personal, non-university email — your official @pucit.edu.pk inbox cannot be used here.
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
                  className={`w-full px-4 py-3 bg-[#080507] border rounded-xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-400 text-sm transition-all lowercase ${
                    personalEmailIsPucit ? 'border-red-500' : 'border-orange-500/40'
                  }`} 
                  placeholder="your.personal@gmail.com" 
                />
                {personalEmailIsPucit && (
                  <p className="text-[11px] text-red-400 font-bold mt-1.5 ml-1">
                    ⚠️ Official university emails cannot be used as your personal email.
                  </p>
                )}
              </div>
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
                className={`w-full px-4 py-3.5 pr-12 bg-[#080507]/80 border rounded-2xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 text-sm sm:text-base transition-all shadow-inner ${
                  confirmPassword.length > 0 && password !== confirmPassword 
                    ? 'border-red-500 focus:ring-red-400' 
                    : 'border-slate-700/80 focus:ring-orange-400 focus:border-orange-400'
                }`} 
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
            {/* Live Password Mismatch Error Indicator */}
            {confirmPassword.length > 0 && password !== confirmPassword && (
              <p className="text-[11px] text-red-400 font-bold mt-1.5 ml-1">
                ⚠️ Passwords do not match
              </p>
            )}
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