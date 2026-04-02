import { Link, useSearchParams, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';

export default function PaymentCancel() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');

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

  return (
    <div className="min-h-screen bg-zinc-950 text-white animate-page-in">
      <Navbar />

      <div className="fixed inset-0 z-0 pointer-events-none bg-[radial-gradient(circle_at_15%_18%,rgba(251,191,36,0.16),transparent_30%),radial-gradient(circle_at_85%_20%,rgba(236,72,153,0.16),transparent_30%),radial-gradient(circle_at_50%_82%,rgba(56,189,248,0.14),transparent_34%)]" />

      <div className="relative z-10 container mx-auto px-6 pt-32 pb-14">
        <div className="max-w-md mx-auto">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-amber-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-amber-300 mb-2">{t('membership.paymentCancelled') || 'Payment Cancelled'}</h2>
            <p className="text-zinc-400 mb-6">
              {t('membership.cancelledMessage') || 'You have cancelled the payment. Your account has not been charged.'}
            </p>
            {sessionId && (
              <p className="text-xs text-zinc-500 mb-6">
                Session ID: <code className="text-zinc-400">{sessionId}</code>
              </p>
            )}
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
          </div>
        </div>
      </div>
    </div>
  );
}
