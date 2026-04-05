import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import API_BASE_URL from '../config/api';

const ISSUE_INTENT_PATTERN = /(lỗi|bug|error|crash|freeze|lag|vip|không hoạt động|khong hoat dong|không vào được|khong vao duoc|không dùng được|khong dung duoc)/i;

export default function SupportChatbot() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const closeTimerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [reporting, setReporting] = useState(false);
  const messagesEndRef = useRef(null);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: t('supportChatbot.welcome') }
  ]);

  useEffect(() => {
    setMessages((prev) => {
      if (!Array.isArray(prev) || prev.length === 0) {
        return [{ role: 'assistant', content: t('supportChatbot.welcome') }];
      }

      const hasUserMessage = prev.some((item) => item.role === 'user');
      if (hasUserMessage) {
        return prev;
      }

      const next = [...prev];
      if (next[0]?.role === 'assistant') {
        next[0] = { ...next[0], content: t('supportChatbot.welcome') };
        return next;
      }

      return [{ role: 'assistant', content: t('supportChatbot.welcome') }, ...next];
    });
  }, [i18n.language, t]);

  useEffect(() => {
    if (!open) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, open]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const openPanel = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsClosing(false);
    setOpen(true);
  };

  const closePanel = () => {
    if (!open || isClosing) return;
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      setIsClosing(false);
      closeTimerRef.current = null;
    }, 220);
  };

  const togglePanel = () => {
    if (open && !isClosing) {
      closePanel();
      return;
    }
    openPanel();
  };

  const currentGameId = useMemo(() => {
    const match = location.pathname.match(/^\/games\/play\/([^/]+)$/) || location.pathname.match(/^\/games\/([^/]+)$/);
    return match?.[1] || '';
  }, [location.pathname]);

  const sendMessage = async () => {
    const content = text.trim();
    if (!content || sending) return;

    const nextUserMessage = { role: 'user', content };
    setMessages((prev) => [...prev, nextUserMessage]);
    setText('');
    setSending(true);

    try {
      const token = localStorage.getItem('token');

      if (token && ISSUE_INTENT_PATTERN.test(content)) {
        const conversation = [...messages.slice(-10), nextUserMessage]
          .map((item) => ({ role: item.role, content: item.content }));

        try {
          const reportRes = await axios.post(
            `${API_BASE_URL}/ai/report-issue`,
            {
              message: content,
              gameId: currentGameId || undefined,
              conversation
            },
            { headers: { Authorization: `Bearer ${token}` } }
          );

          const ticketId = reportRes.data?.ticket?.id;
          const aiSummary = typeof reportRes.data?.aiSummary === 'string' ? reportRes.data.aiSummary.trim() : '';
          const autoReply = ticketId
            ? t('supportChatbot.issueReportedWithTicket', { ticketId, summary: aiSummary ? `\n${t('supportChatbot.summary')}: ${aiSummary}` : '' })
            : t('supportChatbot.issueReported');
          setMessages((prev) => [...prev, { role: 'assistant', content: autoReply, ticketId: ticketId || '' }]);
          return;
        } catch {
          // fallback xuống chat thường nếu gửi report lỗi thất bại
        }
      }

      const res = await axios.post(
        `${API_BASE_URL}/ai/chat`,
        { message: content, gameId: currentGameId || undefined, language: i18n.language || 'en' },
        token ? { headers: { Authorization: `Bearer ${token}` } } : undefined
      );
      const reply = typeof res.data?.message === 'string' && res.data.message.trim()
        ? res.data.message.trim()
        : t('supportChatbot.fallbackReply');
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (error) {
      const message = error?.response?.data?.message || t('supportChatbot.connectionError');
      setMessages((prev) => [...prev, { role: 'assistant', content: message }]);
    } finally {
      setSending(false);
    }
  };

  const reportIssueToAdmin = async () => {
    if (reporting || sending) return;
    const token = localStorage.getItem('token');
    if (!token) {
      setMessages((prev) => [...prev, { role: 'assistant', content: t('supportChatbot.loginRequired') }]);
      return;
    }

    const typed = text.trim();
    const lastUserMessage = [...messages].reverse().find((item) => item.role === 'user')?.content?.trim() || '';
    const issueText = typed || lastUserMessage;
    if (!issueText || issueText.length < 6) {
      setMessages((prev) => [...prev, { role: 'assistant', content: t('supportChatbot.describeIssue') }]);
      return;
    }

    const conversation = messages.slice(-10).map((item) => ({ role: item.role, content: item.content }));
    if (typed) {
      conversation.push({ role: 'user', content: typed });
      setMessages((prev) => [...prev, { role: 'user', content: typed }]);
      setText('');
    }

    setReporting(true);
    try {
      const res = await axios.post(
        `${API_BASE_URL}/ai/report-issue`,
        {
          message: issueText,
          gameId: currentGameId || undefined,
          conversation
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const ticketId = res.data?.ticket?.id;
      const aiSummary = typeof res.data?.aiSummary === 'string' ? res.data.aiSummary.trim() : '';
      const reply = ticketId
        ? t('supportChatbot.issueSentWithTicket', { ticketId, summary: aiSummary ? `\n${t('supportChatbot.summary')}: ${aiSummary}` : '' })
        : t('supportChatbot.issueSent');
      setMessages((prev) => [...prev, { role: 'assistant', content: reply, ticketId: ticketId || '' }]);
    } catch (error) {
      const message = error?.response?.data?.message || t('supportChatbot.sendFailed');
      setMessages((prev) => [...prev, { role: 'assistant', content: message }]);
    } finally {
      setReporting(false);
    }
  };

  return (
    <div className="fixed z-[70] right-4 bottom-4 sm:right-6 sm:bottom-6">
      {open && (
        <div className={`relative w-[calc(100vw-2rem)] sm:w-[390px] max-w-[440px] mb-3 rounded-3xl border border-cyan-400/25 bg-zinc-950/90 backdrop-blur-xl shadow-[0_18px_60px_rgba(6,182,212,0.18)] overflow-hidden origin-bottom-right transition-all duration-200 ease-out ${isClosing ? 'opacity-0 translate-y-2 scale-95' : 'opacity-100 translate-y-0 scale-100'}`}>
          <div className="pointer-events-none absolute -top-24 -left-10 w-44 h-44 rounded-full bg-cyan-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -right-16 w-52 h-52 rounded-full bg-fuchsia-500/20 blur-3xl" />

          <div className="relative px-4 py-3.5 border-b border-cyan-400/20 bg-gradient-to-r from-cyan-500/15 via-blue-500/10 to-fuchsia-500/15 flex items-center justify-between">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-zinc-900/80 border border-cyan-300/30 grid place-items-center text-cyan-300 font-black shadow-[0_0_16px_rgba(34,211,238,0.35)]">
                AI
              </div>
              <div>
                <p className="text-sm font-bold text-white tracking-wide">{t('supportChatbot.assistantName')}</p>
                <p className="text-[11px] text-cyan-100/70">{t('supportChatbot.subtitle')}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={closePanel}
              className="w-8 h-8 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-cyan-400/60 hover:bg-cyan-500/10 transition-colors text-sm"
            >
              ✕
            </button>
          </div>

          <div className="relative h-80 overflow-y-auto px-3.5 py-3.5 space-y-2.5 custom-chat-scroll">
            {messages.map((item, index) => (
              <div
                key={`${item.role}-${index}`}
                className={`max-w-[90%] px-3.5 py-2.5 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed shadow-md ${
                  item.role === 'user'
                    ? 'ml-auto bg-gradient-to-br from-cyan-400 to-blue-500 text-zinc-950 font-medium border border-cyan-200/40 shadow-cyan-500/20'
                    : 'mr-auto bg-zinc-900/85 border border-zinc-700/90 text-zinc-100'
                }`}
              >
                {item.content}
                {item.role === 'assistant' && item.ticketId && (
                  <button
                    type="button"
                    onClick={() => {
                      navigate('/support');
                      setOpen(false);
                    }}
                    className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-400 text-zinc-950 text-[11px] font-black hover:bg-amber-300 transition-colors"
                  >
                    {t('supportChatbot.openTicket')}
                  </button>
                )}
              </div>
            ))}
            {sending && (
              <div className="mr-auto inline-flex items-center gap-1.5 bg-zinc-900/90 border border-zinc-700 text-zinc-300 px-3 py-2 rounded-xl text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-300 animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-300 animate-bounce [animation-delay:120ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-300 animate-bounce [animation-delay:240ms]" />
                <span className="ml-1">{t('supportChatbot.typing')}</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="relative p-3 border-t border-cyan-400/15 bg-zinc-950/85 flex items-center gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={t('supportChatbot.inputPlaceholder')}
              className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900/90 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
              disabled={sending || reporting}
            />
            <button
              type="button"
              onClick={reportIssueToAdmin}
              disabled={sending || reporting}
              className="px-3 py-2.5 rounded-xl bg-amber-400 text-zinc-950 text-xs font-black hover:bg-amber-300 disabled:opacity-60 transition-colors"
            >
              {reporting ? t('supportChatbot.reporting') : t('supportChatbot.reportIssue')}
            </button>
            <button
              type="button"
              onClick={sendMessage}
              disabled={sending || reporting || !text.trim()}
              className="px-3 py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 text-zinc-950 text-sm font-black shadow-[0_0_20px_rgba(34,211,238,0.35)] hover:brightness-110 disabled:opacity-60 transition-all"
            >
              {t('supportChatbot.send')}
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={togglePanel}
        className={`group relative w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-400 via-blue-500 to-fuchsia-500 text-white shadow-[0_14px_35px_rgba(34,211,238,0.35)] font-black transition-all duration-300 ${open ? 'scale-95' : 'hover:-translate-y-0.5 hover:scale-105'}`}
      >
        <span className="absolute inset-0 rounded-2xl border border-white/30 group-hover:border-cyan-200/60 transition-colors" />
        <span className="relative">AI</span>
      </button>
    </div>
  );
}
