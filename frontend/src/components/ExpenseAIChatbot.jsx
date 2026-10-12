import React, { useState, useRef, useEffect } from 'react';
import api from '../services/api';
import {
  Sparkles,
  MessageSquare,
  X,
  Send,
  Loader2,
  TrendingUp,
  PieChart,
  DollarSign,
  ArrowRightLeft,
  RotateCcw,
  Target,
  Bell,
  HandCoins,
  Search
} from 'lucide-react';

const SUGGESTIONS = [
  { text: 'What is my highest transaction?', icon: Sparkles },
  { text: 'How much did I spend this month?', icon: DollarSign },
  { text: 'Which category do I spend the most on?', icon: PieChart },
  { text: 'How much did I spend on food?', icon: TrendingUp },
  { text: 'What is my total income?', icon: DollarSign },
  { text: 'What is my current balance?', icon: DollarSign },
  { text: 'Compare this month with last month', icon: ArrowRightLeft },
  { text: 'Show my recent transactions', icon: Search },
  { text: 'What bills are due?', icon: Bell },
  { text: 'How much do I owe?', icon: HandCoins },
  { text: 'How is my savings goal?', icon: Target }
];

const INITIAL_MESSAGE = {
  sender: 'ai',
  text: "Hi! I am your **Context-Aware Financial Assistant**.\n\nAsk me anything about your highest expenses, category breakdowns, monthly income, balances, bills, loans, or savings goals!",
  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
};

// Formatter for rich text rendering (handles **bold**, bullet points •, and newlines)
const FormattedMessage = ({ text }) => {
  if (!text) return null;

  // Split by newlines
  const lines = text.split('\n');

  return (
    <div className="formatted-msg">
      {lines.map((line, lineIdx) => {
        if (!line.trim()) return <div key={lineIdx} className="msg-spacer" />;

        // Parse **bold** parts
        const parts = line.split(/(\*\*.*?\*\*)/g);

        const renderedLine = parts.map((part, pIdx) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={pIdx}>{part.slice(2, -2)}</strong>;
          }
          if (part.startsWith('*') && part.endsWith('*')) {
            return <em key={pIdx}>{part.slice(1, -1)}</em>;
          }
          return part;
        });

        const isBullet = line.trim().startsWith('•') || line.trim().startsWith('-');

        return (
          <div key={lineIdx} className={`msg-line ${isBullet ? 'bullet-line' : ''}`}>
            {renderedLine}
          </div>
        );
      })}
    </div>
  );
};

const ExpenseAIChatbot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleClearChat = () => {
    setMessages([INITIAL_MESSAGE]);
  };

  const handleSend = async (customText) => {
    const query = (customText || input).trim();
    if (!query || loading) return;

    const userMsg = {
      sender: 'user',
      text: query,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customText) setInput('');
    setLoading(true);

    try {
      const res = await api.post('/ai/chat', { message: query });
      const aiResponse = res.data?.answer || res.message || 'I analyzed your financial data.';

      setMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: aiResponse,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: err.message || 'Expense AI is temporarily unavailable. Please try again.',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Floating Chat Trigger Button */}
      {!isOpen && (
        <button
          className="ai-floating-trigger"
          onClick={() => setIsOpen(true)}
          title="Open AI Finance Assistant"
        >
          <div className="trigger-pulse" />
          <Sparkles size={20} className="trigger-sparkle" />
          <span className="trigger-text">Finance AI</span>
        </button>
      )}

      {/* Chat Window Drawer / Modal */}
      {isOpen && (
        <div className="ai-chat-window">
          <div className="chat-header">
            <div className="chat-header-info">
              <div className="ai-avatar">
                <Sparkles size={18} />
              </div>
              <div>
                <div className="ai-title">Personal Finance AI</div>
                <div className="ai-status">
                  <span className="online-dot" /> Real MongoDB Data Grounded
                </div>
              </div>
            </div>

            <div className="header-actions">
              <button
                className="chat-icon-btn"
                onClick={handleClearChat}
                title="Clear Conversation"
              >
                <RotateCcw size={15} />
              </button>
              <button
                className="chat-icon-btn"
                onClick={() => setIsOpen(false)}
                title="Close Chat"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Messages Feed */}
          <div className="chat-messages-container">
            {messages.map((m, idx) => (
              <div key={idx} className={`chat-bubble-row ${m.sender === 'user' ? 'user-row' : 'ai-row'}`}>
                {m.sender === 'ai' && (
                  <div className="msg-avatar">
                    <Sparkles size={14} />
                  </div>
                )}
                <div className={`chat-bubble ${m.sender === 'user' ? 'user-bubble' : 'ai-bubble'}`}>
                  <div className="bubble-text">
                    {m.sender === 'ai' ? <FormattedMessage text={m.text} /> : m.text}
                  </div>
                  <div className="bubble-time">{m.time}</div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="chat-bubble-row ai-row">
                <div className="msg-avatar">
                  <Sparkles size={14} />
                </div>
                <div className="chat-bubble ai-bubble typing-bubble">
                  <Loader2 size={16} className="spinning" />
                  <span>Analyzing your live financial data...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggested Quick Questions */}
          <div className="chat-suggestions-section">
            <div className="suggestions-label">Suggested Questions:</div>
            <div className="suggestions-chips-grid">
              {SUGGESTIONS.map((s, idx) => {
                const Icon = s.icon;
                return (
                  <button
                    key={idx}
                    type="button"
                    className="suggestion-chip"
                    onClick={() => handleSend(s.text)}
                    disabled={loading}
                  >
                    <Icon size={12} className="chip-icon" />
                    <span>{s.text}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Chat Input Bar */}
          <form
            className="chat-input-bar"
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
          >
            <textarea
              ref={textareaRef}
              rows="1"
              className="chat-input"
              placeholder="Ask about highest expense, food spending, balance..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />
            <button
              type="submit"
              className="chat-send-btn"
              disabled={!input.trim() || loading}
              title="Send Message (Enter)"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}

      <style>{`
        .ai-floating-trigger {
          position: fixed;
          bottom: 1.5rem;
          right: 1.5rem;
          background: linear-gradient(135deg, #4f46e5, #2563eb);
          color: white;
          border: none;
          border-radius: 50px;
          padding: 0.85rem 1.35rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-weight: 700;
          font-size: 0.95rem;
          box-shadow: 0 10px 25px -5px rgba(79, 70, 229, 0.5);
          cursor: pointer;
          z-index: 1000;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .ai-floating-trigger:hover {
          transform: translateY(-2px) scale(1.02);
          box-shadow: 0 15px 30px -5px rgba(79, 70, 229, 0.6);
        }

        .trigger-pulse {
          position: absolute;
          inset: 0;
          border-radius: 50px;
          border: 2px solid #818cf8;
          animation: pulseRing 2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
          pointer-events: none;
        }

        @keyframes pulseRing {
          0% { transform: scale(0.95); opacity: 0.8; }
          50% { transform: scale(1.15); opacity: 0; }
          100% { transform: scale(1.15); opacity: 0; }
        }

        .ai-chat-window {
          position: fixed;
          bottom: 1.5rem;
          right: 1.5rem;
          width: 420px;
          max-width: calc(100vw - 2rem);
          height: 600px;
          max-height: calc(100vh - 4rem);
          background: #ffffff;
          border: 1px solid var(--border-color);
          border-radius: 16px;
          box-shadow: 0 20px 40px -10px rgba(15, 23, 42, 0.25);
          display: flex;
          flex-direction: column;
          z-index: 1000;
          overflow: hidden;
          animation: slideUp 0.25s ease-out;
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .chat-header {
          background: linear-gradient(135deg, #1e1b4b, #312e81);
          color: white;
          padding: 1rem 1.25rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .chat-header-info {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .ai-avatar {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: linear-gradient(135deg, #6366f1, #3b82f6);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
        }

        .ai-title {
          font-weight: 800;
          font-size: 1rem;
          letter-spacing: -0.01em;
        }

        .ai-status {
          font-size: 0.72rem;
          color: #c7d2fe;
          display: flex;
          align-items: center;
          gap: 0.35rem;
        }

        .online-dot {
          width: 6px;
          height: 6px;
          background-color: #34d399;
          border-radius: 50%;
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }

        .chat-icon-btn {
          background: rgba(255, 255, 255, 0.15);
          border: none;
          color: white;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.2s;
        }

        .chat-icon-btn:hover {
          background: rgba(255, 255, 255, 0.3);
        }

        .chat-messages-container {
          flex: 1;
          padding: 1rem;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
          background-color: #f8fafc;
        }

        .chat-bubble-row {
          display: flex;
          gap: 0.5rem;
          align-items: flex-end;
        }

        .user-row {
          justify-content: flex-end;
        }

        .ai-row {
          justify-content: flex-start;
        }

        .msg-avatar {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #4f46e5;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-bottom: 2px;
        }

        .chat-bubble {
          max-width: 82%;
          padding: 0.8rem 1rem;
          border-radius: 14px;
          font-size: 0.875rem;
          line-height: 1.5;
        }

        .ai-bubble {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          color: #1e293b;
          border-bottom-left-radius: 4px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }

        .user-bubble {
          background: #4f46e5;
          color: #ffffff;
          border-bottom-right-radius: 4px;
        }

        .bubble-time {
          font-size: 0.68rem;
          margin-top: 0.35rem;
          opacity: 0.7;
          text-align: right;
        }

        .formatted-msg {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .msg-spacer {
          height: 0.4rem;
        }

        .bullet-line {
          padding-left: 0.25rem;
        }

        .typing-bubble {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: #64748b;
          font-size: 0.8rem;
        }

        .chat-suggestions-section {
          padding: 0.6rem 0.85rem;
          background: #ffffff;
          border-top: 1px solid #e2e8f0;
        }

        .suggestions-label {
          font-size: 0.72rem;
          font-weight: 700;
          color: #64748b;
          margin-bottom: 0.4rem;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        .suggestions-chips-grid {
          display: flex;
          gap: 0.4rem;
          overflow-x: auto;
          padding-bottom: 0.35rem;
          scrollbar-width: thin;
        }

        .suggestion-chip {
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          color: #334155;
          border-radius: 20px;
          padding: 0.35rem 0.75rem;
          font-size: 0.75rem;
          font-weight: 600;
          white-space: nowrap;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          transition: background 0.15s, border-color 0.15s;
        }

        .suggestion-chip:hover {
          background: #e2e8f0;
          border-color: #94a3b8;
          color: #0f172a;
        }

        .chip-icon {
          color: #4f46e5;
        }

        .chat-input-bar {
          padding: 0.65rem 0.85rem;
          background: #ffffff;
          border-top: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .chat-input {
          flex: 1;
          border: 1px solid #cbd5e1;
          border-radius: 20px;
          padding: 0.5rem 0.95rem;
          font-size: 0.85rem;
          font-family: inherit;
          resize: none;
          max-height: 80px;
          outline: none;
          transition: border-color 0.2s;
        }

        .chat-input:focus {
          border-color: #4f46e5;
        }

        .chat-send-btn {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: #4f46e5;
          color: white;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: opacity 0.2s, transform 0.1s;
        }

        .chat-send-btn:active {
          transform: scale(0.95);
        }

        .chat-send-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @media (max-width: 480px) {
          .ai-chat-window {
            bottom: 0.5rem;
            right: 0.5rem;
            width: calc(100vw - 1rem);
            height: calc(100vh - 1rem);
          }
        }
      `}</style>
    </>
  );
};

export default ExpenseAIChatbot;
