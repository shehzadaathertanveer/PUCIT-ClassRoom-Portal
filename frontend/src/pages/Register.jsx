import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../api/axios';
import { EnvelopeIcon, ExclamationTriangleIcon, EyeIcon, EyeSlashIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';

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

  // Mirrors the server's delivery rule (authController.initiateRegistration)
  // so the student sees the exact inbox the code will land in BEFORE they
  // submit, instead of discovering a dead address after the fact.
  const otpDestination = (() => {
    if (isRollNoDisabled && !isEmailDisabled && email.trim()) return email.trim().toLowerCase();
    const personal = personalNotificationEmail.trim().toLowerCase();
    if (personal && (isFresherWithRoll || isFresherPrefixOnly)) return personal;
    const roll = rollNo.trim().toLowerCase();
    if (roll && !isFresherPrefixOnly && !fresherBlocked) return `${roll}@pucit.edu.pk`;
    return '';
  })();
  const otpDestinationIsOfficial = /@pucit\.edu\.pk$/i.test(otpDestination);

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
              Create Your Account
            </p>
          </div>
        </div>

        <div className="text-center">
          <p className={`text-xs font-medium leading-relaxed py-2.5 px-3.5 transition-all break-words ${
            isErrorState
              ? 'rounded-[0.875rem] border border-red-500/40 bg-red-950/60 text-red-300 font-bold'
              : 'lm-inset text-slate-300'
          }`}>
            {helperText}
          </p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
              Roll Number / Section Prefix {isRollNoDisabled && <span className="font-normal normal-case tracking-normal text-slate-500">(bypassed for teacher)</span>} {fresherBlocked && <span className="font-normal normal-case tracking-normal text-red-300">(full roll number required)</span>}
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
              className={`lm-field w-full min-w-0 uppercase transition-all ${
                isRollNoDisabled ? 'opacity-55 cursor-not-allowed' : ''
              }`} 
              placeholder="BITF26A or BITF26A004" 
            />
          </div>

          <div>
            <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
              Full Name
            </label>
            <input 
              type="text" 
              value={name} 
              onChange={(e) => {
                setName(e.target.value);
                if (isErrorState) setIsErrorState(false);
              }} 
              className="lm-field w-full min-w-0 transition-all" 
              placeholder="Enter your full name" 
            />
          </div>

          {!isEmailDisabled && (
            <div>
              <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
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
                className={`lm-field w-full min-w-0 transition-all ${
                  isEmailDisabled ? 'cursor-not-allowed border-white/20 text-orange-200 opacity-90' : ''
                }`} 
                placeholder="teacher.name@pucit.edu.pk" 
              />
            </div>
          )}

          {/* Senior students: official inbox is auto-linked to their roll number */}
          {isSenior && (
            <div className="lm-inset p-4">
              <div className="mb-1 flex items-center gap-2">
                <EnvelopeIcon className="w-4 h-4 flex-none text-cyan-300" />
                <p className="min-w-0 text-[11px] font-bold uppercase tracking-[0.12em] text-cyan-300">
                  Official University Email <span className="font-normal normal-case tracking-normal text-slate-500">(auto-configured)</span>
                </p>
              </div>
              <p className="lm-num break-all text-xs text-cyan-200 sm:text-sm">
                {rollNo.trim().toLowerCase()}@pucit.edu.pk
              </p>
              <p className="mt-2 text-[11px] leading-snug text-slate-400">
                Your verification code will be sent to this official inbox. It cannot be changed.
              </p>
            </div>
          )}

          {/* Prefix-only entry rejected while the admin has fresher mode OFF */}
          {fresherBlocked && (
            <div className="rounded-2xl border border-red-500/40 bg-red-950/60 p-4">
              <div className="mb-1 flex items-center gap-2">
                <ExclamationTriangleIcon className="w-4 h-4 flex-none text-red-300" />
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-red-300">
                  Fresher Registration Disabled
                </p>
              </div>
              <p className="text-xs leading-snug text-red-200/80">
                Prefix-only registration is currently off. Please enter your full Roll Number (e.g. BITF26A004) to register.
              </p>
            </div>
          )}

          {/* Conditional Freshers Registration Number & Personal Email Fields (Triggered only when section prefix only is typed AND fresher mode is ON, e.g. BITF26A) */}
          {isFresherPrefixOnly && (
            <div className="lm-card-flat space-y-3.5 p-4">
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                  University Registration Number <span className="text-rose-300">*</span>
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
                  className="lm-field w-full min-w-0 uppercase transition-all" 
                  placeholder="e.g., 2026-NTS-001" 
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                  Personal Notification Email <span className="text-rose-300">*</span>
                </label>
                <p className="mb-2 text-[11px] leading-snug text-slate-400">
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
                  className={`lm-field w-full min-w-0 lowercase transition-all ${
                    personalEmailIsPucit ? 'border-red-500/70' : ''
                  }`} 
                  placeholder="your.personal@gmail.com" 
                />
                {personalEmailIsPucit && (
                  <p className="mt-1.5 flex items-start gap-1.5 text-[11px] font-bold text-red-300">
                    <ExclamationTriangleIcon className="lm-ico mt-px" />
                    Official university emails cannot be used as your personal email.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Conditional Freshers Personal Email ONLY Box (Triggered when full fresher roll number is typed AND fresher mode is ON, e.g. BITF26A004) */}
          {isFresherWithRoll && (
            <div className="lm-card-flat space-y-3.5 p-4">
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                  Personal Notification Email <span className="text-rose-300">*</span>
                </label>
                <p className="mb-2 text-[11px] leading-snug text-slate-400">
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
                  className={`lm-field w-full min-w-0 lowercase transition-all ${
                    personalEmailIsPucit ? 'border-red-500/70' : ''
                  }`} 
                  placeholder="your.personal@gmail.com" 
                />
                {personalEmailIsPucit && (
                  <p className="mt-1.5 flex items-start gap-1.5 text-[11px] font-bold text-red-300">
                    <ExclamationTriangleIcon className="lm-ico mt-px" />
                    Official university emails cannot be used as your personal email.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Exact OTP destination for fresher routes (senior students already
              get the auto-configured official inbox box above). */}
          {otpDestination && !isSenior && !isRollNoDisabled && (
            <div className="lm-inset p-4">
              <div className="mb-1 flex items-center gap-2">
                <EnvelopeIcon className="w-4 h-4 flex-none text-orange-300" />
                <p className="min-w-0 text-[11px] font-bold uppercase tracking-[0.12em] text-orange-200">
                  Verification code will be sent to
                </p>
              </div>
              <p className="lm-num break-all text-xs text-orange-100 sm:text-sm">{otpDestination}</p>
              <p className="mt-2 text-[11px] leading-snug text-slate-400">
                {otpDestinationIsOfficial
                  ? 'Only this official university inbox receives the code - open it, including Spam/Junk, within 10 minutes.'
                  : 'Open this inbox to read the 6-digit code. The code expires 10 minutes after it is sent.'}
              </p>
            </div>
          )}

          <div>
            <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
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

          <div>
            <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
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
                className={`lm-field w-full min-w-0 pr-24 transition-all ${
                  confirmPassword.length > 0 && password !== confirmPassword ? 'border-red-500/70' : ''
                }`} 
                placeholder="••••••••" 
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-1.5 top-1/2 inline-flex h-9 -translate-y-1/2 items-center gap-1.5 rounded-xl px-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100 cursor-pointer"
              >
                {showConfirmPassword ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                {showConfirmPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {/* Live Password Mismatch Error Indicator */}
            {confirmPassword.length > 0 && password !== confirmPassword && (
              <p className="mt-1.5 flex items-start gap-1.5 text-[11px] font-bold text-red-300">
                <ExclamationTriangleIcon className="lm-ico mt-px" />
                Passwords do not match
              </p>
            )}
          </div>

          <button 
            type="submit" 
            disabled={loading || !isFormValid} 
            className="lm-btn w-full min-h-[2.75rem] cursor-pointer text-sm sm:text-base"
          >
            {loading ? 'Processing...' : 'Sign Up'}
          </button>
        </form>

        <hr className="lm-divider" />

        <p className="text-center text-sm text-slate-400">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-orange-300 underline decoration-white/25 underline-offset-4 transition-colors hover:text-orange-200">
            Login
          </Link>
        </p>

      </div>

      <footer className="relative z-10 mt-8 space-y-1 px-1 text-center text-xs text-slate-500">
        <p>© 2026 PUCIT Classroom (Non-Official) • All Rights Reserved</p>
        <p className="text-slate-600">Designed & Administered by <span className="font-semibold text-orange-300/80">Shehzada Ather</span></p>
      </footer>

    </div>
  );
};

export default Register;