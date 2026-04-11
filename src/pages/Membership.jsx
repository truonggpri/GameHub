import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';

export default function Membership() {
  const { t } = useTranslation();
  const { user, loading, getVipPlans, createStripeCheckout, verifyStripePayment } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [notice, setNotice] = useState({ type: '', message: '' });
  const [buyingPlanId, setBuyingPlanId] = useState('');
  const handledStripeSessionRef = useRef('');

  useEffect(() => {
    let cancelled = false;
    const loadPlans = async () => {
      setLoadingPlans(true);
      const result = await getVipPlans();
      if (cancelled) return;
      if (result.success) {
        setPlans(Array.isArray(result.plans) ? result.plans : []);
      } else {
        setNotice({ type: 'error', message: result.message || t('membership.plansLoading') });
      }
      setLoadingPlans(false);
    };
    loadPlans();
    return () => {
      cancelled = true;
    };
  }, [getVipPlans]);

  useEffect(() => {
    if (loading || !user) return;
    const stripeState = typeof searchParams.get('stripe') === 'string' ? searchParams.get('stripe').trim().toLowerCase() : '';
    const sessionId = typeof searchParams.get('session_id') === 'string' ? searchParams.get('session_id').trim() : '';
    if (!stripeState) return;

    if (stripeState === 'cancel') {
      setNotice({ type: 'error', message: t('membership.cancelledMessage') || 'You have cancelled the payment.' });
      navigate('/membership', { replace: true });
      return;
    }

    if (stripeState !== 'success' || !sessionId) {
      navigate('/membership', { replace: true });
      return;
    }

    if (handledStripeSessionRef.current === sessionId) {
      return;
    }
    handledStripeSessionRef.current = sessionId;

    let cancelled = false;
    const verifyPayment = async () => {
      setNotice({ type: 'info', message: t('membership.verifyingPayment') || 'Verifying payment...' });
      const result = await verifyStripePayment(sessionId);
      if (cancelled) return;
      if (result.success) {
        setNotice({ type: 'success', message: result.message || t('membership.paymentSuccess') || 'Payment successful! VIP activated.' });
      } else {
        setNotice({ type: 'error', message: result.message || t('membership.paymentFailed') || 'Payment verification failed.' });
      }
      navigate('/membership', { replace: true });
    };

    verifyPayment();
    return () => {
      cancelled = true;
    };
  }, [loading, user, searchParams, verifyStripePayment, t, navigate]);

  const vipStatus = useMemo(() => {
    if (!user?.isVip) return t('membership.statusFree');
    if (!user?.vipExpiresAt) return t('membership.statusActive');
    const expires = new Date(user.vipExpiresAt);
    if (Number.isNaN(expires.getTime())) return t('membership.statusActive');
    return t('membership.statusActiveUntil', { date: expires.toLocaleDateString() });
  }, [user?.isVip, user?.vipExpiresAt, t]);

  const handleBuy = async (planId) => {
    setNotice({ type: '', message: '' });
    setBuyingPlanId(planId);
    const result = await createStripeCheckout(planId);
    if (result.success && result.checkoutUrl) {
      // Redirect to Stripe checkout
      window.location.href = result.checkoutUrl;
    } else {
      setNotice({ type: 'error', message: result.message || t('membership.paymentFailed') || 'Unable to initiate payment' });
      setBuyingPlanId('');
    }
  };

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
        <div className="max-w-4xl mx-auto space-y-6">
          <section className="rounded-3xl border border-amber-400/30 bg-zinc-900/75 backdrop-blur-sm p-6 md:p-8">
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-orange-300 to-pink-300">
              {t('membership.title')}
            </h1>
            <p className="mt-2 text-zinc-300">
              {t('membership.subtitle')}
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-500/10 px-4 py-1.5 text-xs font-bold text-amber-200">
              <span>👑</span>
              {vipStatus}
            </div>
          </section>

          {notice.message && (
            <div className={`rounded-xl border px-4 py-3 text-sm ${
              notice.type === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : notice.type === 'error'
                ? 'border-red-500/30 bg-red-500/10 text-red-200'
                : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200'
            }`}>
              {notice.message}
            </div>
          )}

          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {loadingPlans ? (
              <div className="md:col-span-3 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 text-center text-zinc-400">{t('membership.plansLoading')}</div>
            ) : plans.length > 0 ? (
              plans.map((plan) => {
                const price = Number(plan.price);
                const priceLabel = Number.isFinite(price)
                  ? `${price.toLocaleString()} ${plan.currency || 'usd'}`
                  : t('membership.contactUs');
                return (
                  <article
                    key={plan.id}
                    className="rounded-2xl border border-white/10 bg-zinc-900/70 p-5 hover:border-amber-400/40 transition-colors"
                  >
                    <h2 className="text-lg font-black text-white">{plan.title}</h2>
                    <p className="mt-1 text-sm text-zinc-400">{t('membership.daysAccess', { days: plan.days })}</p>
                    <div className="mt-4 text-2xl font-black text-amber-200">{priceLabel}</div>
                    <button
                      type="button"
                      onClick={() => handleBuy(plan.id)}
                      disabled={Boolean(buyingPlanId)}
                      className="mt-5 w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-bold text-zinc-950 hover:opacity-90 disabled:opacity-60"
                    >
                      {buyingPlanId === plan.id ? t('membership.processing') : t('membership.buyPlan')}
                    </button>
                  </article>
                );
              })
            ) : (
              <div className="md:col-span-3 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 text-center text-zinc-400">{t('membership.noPlans')}</div>
            )}
          </section>

          <div className="text-center pt-2">
            <Link to="/" className="text-cyan-300 hover:text-cyan-100 text-sm font-semibold">
              {t('membership.backToHome')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
