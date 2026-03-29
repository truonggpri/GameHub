import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCustomGames } from '../context/CustomGamesContext';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';

export default function AddGame() {
  const { t } = useTranslation();
  const { addCustomGame, customGames } = useCustomGames();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    url: '',
    imageUrl: '',
    tags: '',
    publisher: '',
    players: '',
    controls: '',
    difficulty: 'Medium',
    vipOnly: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (loading) {
    return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">{t('addGame.loading')}</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!['admin', 'mod'].includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  const normalizeUrl = (value) => {
    const cleanedValue = value.trim().replace(/^`+|`+$/g, '').replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, '');
    try {
      const parsed = new URL(cleanedValue);
      return parsed.toString();
    } catch {
      return '';
    }
  };

  const normalizeTags = (value) => {
    if (typeof value !== 'string') return [];
    const unique = [];
    const seen = new Set();

    for (const item of value.split(',')) {
      const normalized = item.trim().toLowerCase().replace(/\s+/g, ' ');
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      unique.push(normalized);
    }

    return unique.slice(0, 12);
  };

  const existingTags = useMemo(() => {
    const unique = [];
    const seen = new Set();

    for (const game of customGames || []) {
      const sourceTags = Array.isArray(game?.tags) && game.tags.length > 0
        ? game.tags
        : [game?.category, game?.difficulty];

      for (const rawTag of sourceTags) {
        if (typeof rawTag !== 'string') continue;
        const normalized = rawTag.trim().toLowerCase().replace(/\s+/g, ' ');
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        unique.push(normalized);
      }
    }

    return unique.slice(0, 30);
  }, [customGames]);

  const selectedTags = useMemo(() => normalizeTags(formData.tags), [formData.tags]);

  const toggleQuickTag = (tag) => {
    const normalizedTag = typeof tag === 'string' ? tag.trim().toLowerCase().replace(/\s+/g, ' ') : '';
    if (!normalizedTag) return;

    const nextTags = selectedTags.includes(normalizedTag)
      ? selectedTags.filter((item) => item !== normalizedTag)
      : [...selectedTags, normalizedTag];

    setFormData((prev) => ({ ...prev, tags: nextTags.join(', ') }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.title || !formData.url) {
      setError(t('addGame.errors.required'));
      return;
    }

    const normalizedGameUrl = normalizeUrl(formData.url);
    const normalizedImageUrl = formData.imageUrl ? normalizeUrl(formData.imageUrl) : '';
    if (!normalizedGameUrl) {
      setError(t('addGame.errors.invalidUrl'));
      return;
    }

    const tagsArray = normalizeTags(formData.tags);

    try {
      setSubmitting(true);
      await addCustomGame({
        title: formData.title.trim(),
        description: formData.description.trim(),
        url: normalizedGameUrl,
        imageUrl: normalizedImageUrl || 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=2070&auto=format&fit=crop',
        category: tagsArray[0] || 'Custom',
        tags: tagsArray,
        difficulty: formData.difficulty || 'Medium',
        publisher: formData.publisher.trim(),
        players: formData.players.trim(),
        controls: formData.controls.trim(),
        vipOnly: Boolean(formData.vipOnly),
        isCustom: true
      });
      navigate('/');
    } catch (err) {
      setError(err?.response?.data?.message || t('addGame.errors.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col animate-page-in">
      <Navbar />
      
      <div className="fixed inset-0 z-0 bg-grid-pattern opacity-10 animate-fade-in"></div>
      <div className="fixed inset-0 z-0 pointer-events-none bg-[radial-gradient(circle_at_12%_15%,rgba(249,115,22,0.15),transparent_28%),radial-gradient(circle_at_85%_20%,rgba(56,189,248,0.14),transparent_28%)] animate-gradient-pan"></div>

      <div className="flex-1 flex items-center justify-center p-6 pt-32 relative z-10">
        <div className="w-full max-w-2xl bg-zinc-900 border border-white/10 p-8 rounded-2xl shadow-2xl backdrop-blur-sm animate-pop-in">
          <div className="flex items-center gap-4 mb-8 animate-fade-up" style={{ '--delay': '70ms' }}>
            <div className="w-12 h-12 bg-orange-500 rounded-lg flex items-center justify-center text-2xl animate-float-slow">
              🚀
            </div>
            <h1 className="text-3xl font-bold tracking-tight">{t('addGame.pageTitle')}</h1>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg mb-6 text-sm">
              {error}
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-6 animate-fade-up" style={{ '--delay': '120ms' }}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-zinc-400 mb-2">{t('addGame.fields.title')}</label>
                <input
                  type="text"
                  required
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                  placeholder={t('addGame.placeholders.title')}
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-zinc-400 mb-2">{t('addGame.fields.gameUrl')}</label>
                <input
                  type="url"
                  required
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                  placeholder={t('addGame.placeholders.gameUrl')}
                  value={formData.url}
                  onChange={(e) => setFormData({...formData, url: e.target.value})}
                />
                <p className="text-xs text-zinc-500 mt-2">
                  {t('addGame.fields.gameUrlHelp')}
                </p>
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-zinc-400 mb-2">{t('addGame.fields.description')}</label>
                <textarea
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all h-32"
                  placeholder={t('addGame.placeholders.description')}
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">{t('addGame.fields.imageUrl')}</label>
                <input
                  type="url"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                  placeholder={t('addGame.placeholders.imageUrl')}
                  value={formData.imageUrl}
                  onChange={(e) => setFormData({...formData, imageUrl: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">{t('addGame.fields.tags')}</label>
                <input
                  type="text"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                  placeholder={t('addGame.placeholders.tags')}
                  value={formData.tags}
                  onChange={(e) => setFormData({...formData, tags: e.target.value})}
                />
                <div className="mt-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-2">{t('addGame.fields.quickTags')}</p>
                  {existingTags.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {existingTags.map((tag) => {
                        const active = selectedTags.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleQuickTag(tag)}
                            className={`px-2.5 py-1 rounded-full border text-[11px] font-bold uppercase tracking-[0.08em] transition-colors ${
                              active
                                ? 'border-cyan-300/60 bg-cyan-400/20 text-cyan-100'
                                : 'border-zinc-600 bg-zinc-800/70 text-zinc-300 hover:border-cyan-400/40 hover:text-cyan-200'
                            }`}
                          >
                            #{tag}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500">{t('addGame.states.noExistingTags')}</p>
                  )}
                </div>
                {selectedTags.length > 0 && (
                  <div className="mt-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">{t('addGame.fields.selectedTags')}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedTags.map((tag) => (
                        <span key={`selected-${tag}`} className="px-2 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/25 text-cyan-200 text-[10px] font-bold">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">{t('addGame.fields.publisher')}</label>
                <input
                  type="text"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                  placeholder={t('addGame.placeholders.publisher')}
                  value={formData.publisher}
                  onChange={(e) => setFormData({...formData, publisher: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">{t('addGame.fields.players')}</label>
                <input
                  type="text"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                  placeholder={t('addGame.placeholders.players')}
                  value={formData.players}
                  onChange={(e) => setFormData({...formData, players: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">{t('addGame.fields.controls')}</label>
                <input
                  type="text"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                  placeholder={t('addGame.placeholders.controls')}
                  value={formData.controls}
                  onChange={(e) => setFormData({...formData, controls: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">{t('addGame.fields.difficulty')}</label>
                <select
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                  value={formData.difficulty}
                  onChange={(e) => setFormData({...formData, difficulty: e.target.value})}
                >
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                  <option value="Expert">Expert</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="inline-flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={Boolean(formData.vipOnly)}
                    onChange={(e) => setFormData({ ...formData, vipOnly: e.target.checked })}
                    className="w-4 h-4 accent-amber-500"
                  />
                  <span className="text-sm text-zinc-200 font-semibold">VIP only game</span>
                </label>
              </div>
            </div>

            <div className="pt-4 flex justify-end gap-4">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="px-6 py-3 rounded-lg font-bold text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors button-lift"
              >
                {t('addGame.actions.cancel')}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-8 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-bold shadow-lg shadow-orange-500/20 transition-all transform hover:scale-105 button-lift"
              >
                {submitting ? t('addGame.actions.adding') : t('addGame.actions.add')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
