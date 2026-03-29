import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';

export default function Membership() {
  const { user, loading, getVipPlans, purchaseVip } = useAuth();
  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [notice, setNotice] = useState({ type: '', message: '' });
  const [buyingPlanId, setBuyingPlanId] = useState('');

  useEffect(() => {
    let cancelled = false;
    const loadPlans = async () => {
      setLoadingPlans(true);
      const result = await getVipPlans();
      if (cancelled) return;
      if (result.success) {
        setPlans(Array.isArray(result.plans) ? result.plans : []);
      } else {
        setNotice({ type: 'error', message: result.message || 'Unable to load VIP plans' });
      }
      setLoadingPlans(false);
    };
    loadPlans();
    return () => {
      cancelled = true;
    };
  }, [getVipPlans]);

  const vipStatus = useMemo(() => {
    if (!user?.isVip) return 'Free member';
    if (!user?.vipExpiresAt) return 'VIP active';
    const expires = new Date(user.vipExpiresAt);
    if (Number.isNaN(expires.getTime())) return 'VIP active';
    return `VIP active until ${expires.toLocaleDateString()}`;
  }, [user?.isVip, user?.vipExpiresAt]);

  const handleBuy = async (planId) => {
    setNotice({ type: '', message: '' });
    setBuyingPlanId(planId);
    const result = await purchaseVip(planId);
    if (result.success) {
      setNotice({ type: 'success', message: result.message || 'VIP plan activated successfully.' });
    } else {
      setNotice({ type: 'error', message: result.message || 'Unable to activate VIP plan' });
    }
    setBuyingPlanId('');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <Navbar />
        <div className="text-zinc-300">Loading membership...</div>
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
              VIP Membership
            </h1>
            <p className="mt-2 text-zinc-300">
              Unlock exclusive VIP-only games and premium access across the platform.
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
                : 'border-red-500/30 bg-red-500/10 text-red-200'
            }`}>
              {notice.message}
            </div>
          )}

          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {loadingPlans ? (
              <div className="md:col-span-3 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 text-center text-zinc-400">Loading plans...</div>
            ) : plans.length > 0 ? (
              plans.map((plan) => {
                const price = Number(plan.price);
                const priceLabel = Number.isFinite(price)
                  ? `${price.toLocaleString()} ${plan.currency || 'VND'}`
                  : `Contact us`;
                return (
                  <article
                    key={plan.id}
                    className="rounded-2xl border border-white/10 bg-zinc-900/70 p-5 hover:border-amber-400/40 transition-colors"
                  >
                    <h2 className="text-lg font-black text-white">{plan.title}</h2>
                    <p className="mt-1 text-sm text-zinc-400">{plan.days} days access</p>
                    <div className="mt-4 text-2xl font-black text-amber-200">{priceLabel}</div>
                    <button
                      type="button"
                      onClick={() => handleBuy(plan.id)}
                      disabled={Boolean(buyingPlanId)}
                      className="mt-5 w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-bold text-zinc-950 hover:opacity-90 disabled:opacity-60"
                    >
                      {buyingPlanId === plan.id ? 'Processing...' : 'Buy VIP Plan'}
                    </button>
                  </article>
                );
              })
            ) : (
              <div className="md:col-span-3 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 text-center text-zinc-400">No VIP plans available right now.</div>
            )}
          </section>

          <div className="text-center pt-2">
            <Link to="/" className="text-cyan-300 hover:text-cyan-100 text-sm font-semibold">
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
