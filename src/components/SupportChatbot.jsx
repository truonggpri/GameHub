import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import API_BASE_URL from '../config/api';

const ISSUE_INTENT_PATTERN = /(lỗi|bug|error|crash|freeze|lag|vip|không hoạt động|khong hoat dong|không vào được|khong vao duoc|không dùng được|khong dung duoc)/i;

export default function SupportChatbot() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: t('supportChatbot.welcome') }
  ]);

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
        { message: content, gameId: currentGameId || undefined },
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
        <div className="w-[calc(100vw-2rem)] sm:w-[360px] max-w-[420px] mb-3 rounded-2xl border border-zinc-700/80 bg-zinc-950/95 backdrop-blur-md shadow-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">{t('supportChatbot.assistantName')}</p>
              <p className="text-[11px] text-zinc-500">{t('supportChatbot.subtitle')}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-zinc-500 hover:text-zinc-300 transition-colors text-sm"
            >
              ✕
            </button>
          </div>

          <div className="h-72 overflow-y-auto px-3 py-3 space-y-2">
            {messages.map((item, index) => (
              <div
                key={`${item.role}-${index}`}
                className={`max-w-[88%] px-3 py-2 rounded-xl text-sm whitespace-pre-wrap ${
                  item.role === 'user'
                    ? 'ml-auto bg-cyan-500 text-zinc-950'
                    : 'mr-auto bg-zinc-900 border border-zinc-800 text-zinc-200'
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
              <div className="mr-auto bg-zinc-900 border border-zinc-800 text-zinc-400 px-3 py-2 rounded-xl text-sm">
                {t('supportChatbot.typing')}
              </div>
            )}
          </div>

          <div className="p-3 border-t border-zinc-800 flex items-center gap-2">
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
              className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
              disabled={sending || reporting}
            />
            <button
              type="button"
              onClick={reportIssueToAdmin}
              disabled={sending || reporting}
              className="px-3 py-2 rounded-xl bg-amber-400 text-zinc-950 text-xs font-black disabled:opacity-60"
            >
              {reporting ? t('supportChatbot.reporting') : t('supportChatbot.reportIssue')}
            </button>
            <button
              type="button"
              onClick={sendMessage}
              disabled={sending || reporting || !text.trim()}
              className="px-3 py-2 rounded-xl bg-cyan-500 text-zinc-950 text-sm font-bold disabled:opacity-60"
            >
              {t('supportChatbot.send')}
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-14 h-14 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/30 font-bold"
      >
        AI
      </button>
    </div>
  );
}
