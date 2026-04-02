import { useEffect, useState } from 'react';
import { Link, useSearchParams, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';

export default function PaymentSuccess() {
  const { t } = useTranslation();
  const { user, loading, verifyStripePayment } = useAuth();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('verifying'); // verifying, success, error
  const [message, setMessage] = useState('');

  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    if (!sessionId || loading) return;

    const verifyPayment = async () => {
      const result = await verifyStripePayment(sessionId);
      if (result.success) {
        setStatus('success');
        setMessage(result.message || t('membership.paymentSuccess') || 'Payment successful! VIP activated.');
      } else {
        setStatus('error');
        setMessage(result.message || t('membership.paymentFailed') || 'Payment verification failed.');
      }
    };

    verifyPayment();
  }, [sessionId, loading, verifyStripePayment, t]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <Navbar />
        <div className="text-zinc-300">{t('membership.loading')}</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!sessionId) {
    return <Navigate to="/membership" replace />;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white animate-page-in">
      <Navbar />

      <div className="fixed inset-0 z-0 pointer-events-none bg-[radial-gradient(circle_at_15%_18%,rgba(251,191,36,0.16),transparent_30%),radial-gradient(circle_at_85%_20%,rgba(236,72,153,0.16),transparent_30%),radial-gradient(circle_at_50%_82%,rgba(56,189,248,0.14),transparent_34%)]" />

      <div className="relative z-10 container mx-auto px-6 pt-32 pb-14">
        <div className="max-w-md mx-auto">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-8 text-center">
            {status === 'verifying' && (
              <>
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-amber-300 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
                <h2 className="text-xl font-bold mb-2">{t('membership.verifyingPayment') || 'Verifying Payment...'}</h2>
                <p className="text-zinc-400">{t('membership.pleaseWait') || 'Please wait while we confirm your payment.'}</p>
              </>
            )}

            {status === 'success' && (
              <>
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-emerald-400 mb-2">{t('membership.paymentSuccess') || 'Payment Successful!'}</h2>
                <p className="text-zinc-300 mb-6">{message}</p>
                <div className="space-y-3">
                  <Link
                    to="/"
                    className="block w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-zinc-950 font-bold hover:opacity-90"
                  >
                    {t('membership.startPlaying') || 'Start Playing'}
                  </Link>
                  <Link
                    to="/membership"
                    className="block w-full py-3 rounded-xl bg-zinc-800 text-zinc-300 font-bold hover:bg-zinc-700"
                  >
                    {t('membership.viewMembership') || 'View Membership'}
                  </Link>
                </div>
              </>
            )}

            {status === 'error' && (
              <>
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-red-400 mb-2">{t('membership.paymentFailed') || 'Payment Failed'}</h2>
                <p className="text-zinc-400 mb-6">{message}</p>
                <div className="space-y-3">
                  <Link
                    to="/membership"
                    className="block w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-zinc-950 font-bold hover:opacity-90"
                  >
                    {t('membership.tryAgain') || 'Try Again'}
                  </Link>
                  <Link
                    to="/"
                    className="block w-full py-3 rounded-xl bg-zinc-800 text-zinc-300 font-bold hover:bg-zinc-700"
                  >
                    {t('membership.backToHome') || '← Back to Home'}
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
