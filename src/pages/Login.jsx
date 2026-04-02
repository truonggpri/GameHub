import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';

export default function Login() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [googleVerificationToken, setGoogleVerificationToken] = useState('');
  const [googleVerificationCode, setGoogleVerificationCode] = useState('');
  const [googleVerificationEmail, setGoogleVerificationEmail] = useState('');
  const [resendingOtp, setResendingOtp] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const { login, googleLogin, verifyGoogleFirstLogin, resendGoogleFirstLoginCode } = useAuth();
  const navigate = useNavigate();
  const googleButtonRef = useRef(null);
  const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    try {
      const result = await login(identifier, password);
      if (result.success) {
        navigate('/');
      } else {
        setError(result.message || 'Failed to login');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    }
  };

  useEffect(() => {
    if (!googleClientId || !googleButtonRef.current) return undefined;
    let disposed = false;

    const initGoogleButton = () => {
      if (disposed || !window.google?.accounts?.id || !googleButtonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response) => {
          setError('');
          const result = await googleLogin(response?.credential || '');
          if (result.success) {
            navigate('/');
          } else if (result.requiresVerification) {
            setGoogleVerificationToken(result.verificationToken || '');
            setGoogleVerificationEmail(result.email || '');
            setGoogleVerificationCode('');
            setResendCooldown(30);
            setError(result.message || 'Please enter the verification code sent to your email');
          } else {
            setError(result.message || 'Google login failed');
          }
        }
      });
      googleButtonRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'pill',
        width: 320
      });
    };

    if (window.google?.accounts?.id) {
      initGoogleButton();
      return () => {
        disposed = true;
      };
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = initGoogleButton;
    document.head.appendChild(script);

    return () => {
      disposed = true;
    };
  }, [googleClientId, googleLogin, navigate]);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = window.setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  const handleVerifyGoogleFirstLogin = async (e) => {
    e.preventDefault();
    setError('');

    const result = await verifyGoogleFirstLogin(googleVerificationToken, googleVerificationCode);
    if (result.success) {
      setGoogleVerificationToken('');
      setGoogleVerificationCode('');
      setGoogleVerificationEmail('');
      navigate('/');
      return;
    }

    setError(result.message || 'Google verification failed');
  };

  const handleResendGoogleCode = async () => {
    if (!googleVerificationToken || resendingOtp || resendCooldown > 0) return;
    setError('');
    setResendingOtp(true);

    const result = await resendGoogleFirstLoginCode(googleVerificationToken);
    setResendingOtp(false);

    if (result.success) {
      setGoogleVerificationEmail(result.email || googleVerificationEmail);
      setResendCooldown(30);
      setError(result.message || 'A new verification code has been sent to your email.');
      return;
    }

    if (result.retryAfterSeconds > 0) {
      setResendCooldown(result.retryAfterSeconds);
    }
    setError(result.message || 'Unable to resend verification code');
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col font-sans">
      <Navbar />
      
      <div className="fixed inset-0 z-0 bg-grid-pattern opacity-10"></div>

      <div className="flex-1 flex items-center justify-center p-4 relative z-10">
        <div className="w-full max-w-md bg-zinc-900 border border-white/10 p-8 rounded-2xl shadow-2xl backdrop-blur-sm">
          <h2 className="text-3xl font-bold mb-6 text-center tracking-tight">Welcome Back</h2>
          
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-lg mb-6 text-sm">
              {error}
            </div>
          )}

          {googleVerificationToken ? (
            <form onSubmit={handleVerifyGoogleFirstLogin} className="space-y-6">
              <div className="bg-amber-500/10 border border-amber-500/30 text-amber-200 px-4 py-3 rounded-lg text-sm">
                Enter the verification code sent to {googleVerificationEmail || 'your email'} to complete Google sign-in.
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Verification code</label>
                <input
                  type="text"
                  required
                  inputMode="numeric"
                  maxLength={6}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                  placeholder="Enter 6-digit code"
                  value={googleVerificationCode}
                  onChange={(e) => setGoogleVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
              </div>
              <button
                type="submit"
                className="w-full neo-brutalism bg-white text-black font-bold py-3 rounded-lg hover:bg-zinc-200 transition-colors"
              >
                VERIFY CODE
              </button>
              <button
                type="button"
                onClick={handleResendGoogleCode}
                disabled={resendingOtp || resendCooldown > 0}
                className="w-full border border-zinc-700 text-zinc-200 font-semibold py-3 rounded-lg hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {resendingOtp ? 'Sending...' : resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend code'}
              </button>
            </form>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">Username or Email</label>
                  <input
                    type="text"
                    required
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                    placeholder="Enter your username or email"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">Password</label>
                  <input
                    type="password"
                    required
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  className="w-full neo-brutalism bg-white text-black font-bold py-3 rounded-lg hover:bg-zinc-200 transition-colors"
                >
                  LOG IN
                </button>
              </form>

              {googleClientId && (
                <div className="mt-4">
                  <div className="flex items-center gap-3 text-xs text-zinc-500 mb-3">
                    <div className="h-px flex-1 bg-zinc-800" />
                    <span>or</span>
                    <div className="h-px flex-1 bg-zinc-800" />
                  </div>
                  <div ref={googleButtonRef} className="flex justify-center" />
                </div>
              )}
            </>
          )}

          <p className="mt-8 text-center text-zinc-500 text-sm">
            Don't have an account?{' '}
            <Link to="/signup" className="text-purple-400 hover:text-purple-300 font-medium">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
