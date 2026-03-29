import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';

export default function SupportChatbot() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Xin chào, mình là trợ lý GameHub. Bạn muốn tìm game nào hôm nay?' }
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
      const res = await axios.post(
        'http://localhost:5000/api/ai/chat',
        { message: content, gameId: currentGameId || undefined },
        token ? { headers: { Authorization: `Bearer ${token}` } } : undefined
      );
      const reply = typeof res.data?.message === 'string' && res.data.message.trim()
        ? res.data.message.trim()
        : 'Mình chưa có phản hồi phù hợp. Bạn thử mô tả rõ hơn nhé.';
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (error) {
      const message = error?.response?.data?.message || 'Không thể kết nối trợ lý AI lúc này.';
      setMessages((prev) => [...prev, { role: 'assistant', content: message }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed z-[70] right-4 bottom-4 sm:right-6 sm:bottom-6">
      {open && (
        <div className="w-[calc(100vw-2rem)] sm:w-[360px] max-w-[420px] mb-3 rounded-2xl border border-zinc-700/80 bg-zinc-950/95 backdrop-blur-md shadow-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">GameHub Assistant</p>
              <p className="text-[11px] text-zinc-500">Gợi ý game và hỗ trợ nhanh</p>
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
              </div>
            ))}
            {sending && (
              <div className="mr-auto bg-zinc-900 border border-zinc-800 text-zinc-400 px-3 py-2 rounded-xl text-sm">
                Đang trả lời...
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
              placeholder="Hỏi về game tương tự, độ khó, thể loại..."
              className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
              disabled={sending}
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={sending || !text.trim()}
              className="px-3 py-2 rounded-xl bg-cyan-500 text-zinc-950 text-sm font-bold disabled:opacity-60"
            >
              Gửi
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
