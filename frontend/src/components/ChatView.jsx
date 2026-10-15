import React, { useState, useRef, useEffect } from 'react';
import { sendChatMessage, resetChatSession, downloadReportFile } from '../services/api';
import {
  Sparkles,
  Send,
  Loader2,
  Download,
  FileText,
  RotateCcw,
  CheckCircle,
  XCircle,
  ArrowRight
} from 'lucide-react';

const SUGGESTIONS = [
  'Add ₹250 for lunch today',
  'How much did I spend this month?',
  'Which category do I spend most on?',
  'Set my monthly budget to ₹15,000',
  'Delete my last expense',
  'Export to PDF',
  'List my upcoming bills'
];

const INITIAL_MESSAGE = {
  sender: 'ai',
  text: "Hi! I am **ExpenseBot**, your personal finance assistant.\n\nI can log expenses, check your spending, manage bills, and export reports. What would you like to do today?",
  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
};

export const ChatMessage = ({ msg, onActionClick }) => {
  const isAi = msg.sender === 'ai';
  const text = msg.text || '';

  // Structured flags from the server drive the action buttons — no guessing from reply text.
  const format = (msg.downloadFormat || '').toLowerCase();
  const hasPdfExport = format === 'pdf';
  const hasExcelExport = format === 'excel';
  const needsConfirmation = isAi && !!msg.pendingAction?.needsConfirmation && typeof onActionClick === 'function';

  // Formatter for rich text
  const renderFormattedText = (raw) => {
    // Clean markdown link syntax [label](url) into clean text
    const cleaned = raw.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    const lines = cleaned.split('\n');

    return lines.map((line, lIdx) => {
      if (!line.trim()) return <div key={lIdx} className="msg-spacer" />;

      const isBullet = line.trim().startsWith('•') || line.trim().startsWith('-');
      const lineContent = isBullet ? line.trim().substring(1).trim() : line;

      const parts = lineContent.split(/(\*\*.*?\*\*|\*.*?\*)/g);
      const renderedParts = parts.map((part, pIdx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={pIdx}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('*') && part.endsWith('*')) {
          return <em key={pIdx}>{part.slice(1, -1)}</em>;
        }
        return part;
      });

      return (
        <div key={lIdx} className={`msg-line ${isBullet ? 'bullet-line' : ''}`}>
          {isBullet && <span className="bullet-dot">•</span>}
          <span>{renderedParts}</span>
        </div>
      );
    });
  };

  return (
    <div className={`chat-bubble-row ${isAi ? 'ai-row' : 'user-row'}`}>
      {isAi && (
        <div className="msg-avatar">
          <Sparkles size={16} />
        </div>
      )}

      <div className={`chat-bubble ${isAi ? 'ai-bubble' : 'user-bubble'}`}>
        <div className="bubble-text">{renderFormattedText(text)}</div>

        {/* Working Export Buttons inside Chat */}
        {isAi && (hasPdfExport || hasExcelExport) && (
          <div className="chat-export-actions">
            {hasPdfExport && (
              <button
                type="button"
                className="chat-action-btn pdf-btn"
                onClick={() => downloadReportFile('pdf')}
              >
                <FileText size={15} />
                <span>Download PDF Report</span>
                <Download size={14} />
              </button>
            )}
            {hasExcelExport && (
              <button
                type="button"
                className="chat-action-btn excel-btn"
                onClick={() => downloadReportFile('excel')}
              >
                <FileText size={15} />
                <span>Download Excel Report</span>
                <Download size={14} />
              </button>
            )}
          </div>
        )}

        {/* Interactive Yes / No Confirmation Buttons */}
        {needsConfirmation && (
          <div className="chat-confirm-actions">
            <button
              type="button"
              className="chat-confirm-btn yes-btn"
              onClick={() => onActionClick && onActionClick('yes')}
            >
              <CheckCircle size={14} />
              <span>Yes, confirm</span>
            </button>
            <button
              type="button"
              className="chat-confirm-btn no-btn"
              onClick={() => onActionClick && onActionClick('no')}
            >
              <XCircle size={14} />
              <span>No, cancel</span>
            </button>
          </div>
        )}

        {/* Clarification step: always offer a way out of the dialog */}
        {isAi && msg.pendingAction && !needsConfirmation && typeof onActionClick === 'function' && (
          <div className="chat-confirm-actions">
            <button
              type="button"
              className="chat-confirm-btn no-btn"
              onClick={() => onActionClick && onActionClick('cancel')}
            >
              <XCircle size={14} />
              <span>Cancel</span>
            </button>
          </div>
        )}

        <div className="bubble-time">{msg.time}</div>
      </div>
    </div>
  );
};

const ChatView = ({ isWidget = false }) => {
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleClearChat = async () => {
    setMessages([INITIAL_MESSAGE]);
    try {
      await resetChatSession();
    } catch (err) {
      // The transcript is already cleared locally; a lingering server-side
      // dialog state expires on its own, so this is not user-blocking.
    }
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
      const res = await sendChatMessage(query);
      const reply =
        res.reply ||
        res.message ||
        res.data?.reply ||
        res.data?.answer ||
        (typeof res === 'string' ? res : 'I processed your request.');

      setMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: reply,
          downloadFormat: res.downloadFormat || res.data?.downloadFormat || null,
          pendingAction: res.pendingAction || res.data?.pendingAction || null,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);

      // The server tells us when a write actually landed — no text matching.
      if (res.refreshData === true || res.data?.refreshData === true) {
        window.dispatchEvent(new CustomEvent('expense-tracker-data-changed'));
      }
    } catch (err) {
      const serverMsg = err.response?.data?.message || err.response?.data?.error;
      const statusText = err.response?.status ? ` [HTTP ${err.response.status}]` : '';
      const displayMsg = serverMsg ? `${serverMsg}${statusText}` : (err.message || 'ExpenseBot is temporarily unavailable. Please try again.');

      setMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: `⚠️ ${displayMsg}`,
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
    <div className={`chat-component-root ${isWidget ? 'widget-mode' : 'page-mode'}`}>
      {/* Header controls for page or widget */}
      <div className="chat-top-bar">
        <div className="chat-title-info">
          <div className="bot-status-indicator">
            <span className="pulsing-dot" />
            <span className="bot-status-text">ExpenseBot Active</span>
          </div>
        </div>
        <button
          type="button"
          className="chat-clear-btn"
          onClick={handleClearChat}
          title="Reset Chat"
        >
          <RotateCcw size={14} />
          <span>Reset</span>
        </button>
      </div>

      {/* Messages Feed */}
      <div className="chat-messages-scroll-area">
        {messages.map((m, idx) => (
          <ChatMessage
            key={idx}
            msg={m}
            // A confirmation only belongs to the newest reply; an old "yes" button
            // must never re-confirm against the current pending action.
            onActionClick={idx === messages.length - 1 && !loading ? handleSend : undefined}
          />
        ))}

        {loading && (
          <div className="chat-bubble-row ai-row">
            <div className="msg-avatar">
              <Sparkles size={16} />
            </div>
            <div className="chat-bubble ai-bubble typing-bubble">
              <Loader2 size={16} className="spinning" />
              <span>ExpenseBot is thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggestion Chips */}
      <div className="chat-suggestions-bar">
        <div className="suggestions-scroll">
          {SUGGESTIONS.map((text, idx) => (
            <button
              key={idx}
              type="button"
              className="suggestion-pill"
              onClick={() => handleSend(text)}
              disabled={loading}
            >
              <span>{text}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Input Bar */}
      <form
        className="chat-input-row"
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
      >
        <textarea
          ref={textareaRef}
          rows="1"
          className="chat-textarea"
          placeholder="Ask ExpenseBot (e.g. 'Add ₹250 for lunch', 'How much did I spend this month?')..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />
        <button
          type="submit"
          className="chat-submit-btn"
          disabled={!input.trim() || loading}
          title="Send"
        >
          <Send size={18} />
        </button>
      </form>

      <style>{`
        .chat-component-root {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #ffffff;
          overflow: hidden;
        }

        .chat-component-root.page-mode {
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.08);
          max-height: calc(100vh - 120px);
        }

        .chat-top-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1.25rem;
          border-bottom: 1px solid #edf2f7;
          background: #f8fafc;
        }

        .bot-status-indicator {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .pulsing-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background-color: #10b981;
          box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
        }

        .bot-status-text {
          font-size: 0.8rem;
          font-weight: 600;
          color: #475569;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .chat-clear-btn {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          background: transparent;
          border: 1px solid #e2e8f0;
          padding: 0.35rem 0.75rem;
          border-radius: 8px;
          font-size: 0.8rem;
          color: #64748b;
          cursor: pointer;
          transition: all 0.2s;
        }

        .chat-clear-btn:hover {
          background: #f1f5f9;
          color: #0f172a;
        }

        .chat-messages-scroll-area {
          flex: 1;
          overflow-y: auto;
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .chat-bubble-row {
          display: flex;
          align-items: flex-start;
          gap: 0.65rem;
          width: 100%;
        }

        .chat-bubble-row.user-row {
          justify-content: flex-end;
        }

        .msg-avatar {
          width: 32px;
          height: 32px;
          border-radius: 10px;
          background: linear-gradient(135deg, #4f46e5, #6366f1);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 4px 10px rgba(99, 102, 241, 0.3);
        }

        .chat-bubble {
          max-width: 80%;
          padding: 0.85rem 1.15rem;
          border-radius: 16px;
          font-size: 0.93rem;
          line-height: 1.55;
          position: relative;
        }

        .ai-bubble {
          background: #f1f5f9;
          color: #1e293b;
          border-top-left-radius: 4px;
        }

        .user-bubble {
          background: linear-gradient(135deg, #4f46e5, #4338ca);
          color: #ffffff;
          border-top-right-radius: 4px;
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.2);
        }

        .bubble-text {
          white-space: pre-wrap;
          word-break: break-word;
        }

        .msg-spacer {
          height: 0.5rem;
        }

        .msg-line {
          margin: 0.15rem 0;
        }

        .bullet-line {
          display: flex;
          align-items: flex-start;
          gap: 0.4rem;
          margin-left: 0.25rem;
        }

        .bullet-dot {
          color: #4f46e5;
          font-weight: bold;
        }

        .bubble-time {
          font-size: 0.7rem;
          margin-top: 0.4rem;
          opacity: 0.65;
          text-align: right;
        }

        .typing-bubble {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          color: #64748b;
          font-style: italic;
        }

        .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .chat-export-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.6rem;
          margin-top: 0.85rem;
        }

        .chat-action-btn {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.55rem 0.95rem;
          border-radius: 10px;
          border: none;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.08);
        }

        .chat-action-btn.pdf-btn {
          background: #ef4444;
          color: white;
        }

        .chat-action-btn.pdf-btn:hover {
          background: #dc2626;
          transform: translateY(-1px);
        }

        .chat-action-btn.excel-btn {
          background: #10b981;
          color: white;
        }

        .chat-action-btn.excel-btn:hover {
          background: #059669;
          transform: translateY(-1px);
        }

        .chat-confirm-actions {
          display: flex;
          gap: 0.6rem;
          margin-top: 0.85rem;
        }

        .chat-confirm-btn {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.5rem 0.9rem;
          border-radius: 8px;
          border: 1px solid transparent;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .chat-confirm-btn.yes-btn {
          background: #fee2e2;
          color: #b91c1c;
          border-color: #fca5a5;
        }

        .chat-confirm-btn.yes-btn:hover {
          background: #fecaca;
        }

        .chat-confirm-btn.no-btn {
          background: #e2e8f0;
          color: #334155;
          border-color: #cbd5e1;
        }

        .chat-confirm-btn.no-btn:hover {
          background: #cbd5e1;
        }

        .chat-suggestions-bar {
          padding: 0.6rem 1.25rem;
          border-top: 1px solid #f1f5f9;
          background: #ffffff;
        }

        .suggestions-scroll {
          display: flex;
          gap: 0.5rem;
          overflow-x: auto;
          scrollbar-width: none;
        }

        .suggestions-scroll::-webkit-scrollbar {
          display: none;
        }

        .suggestion-pill {
          white-space: nowrap;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          color: #475569;
          padding: 0.4rem 0.8rem;
          border-radius: 20px;
          font-size: 0.8rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .suggestion-pill:hover:not(:disabled) {
          background: #eef2ff;
          border-color: #c7d2fe;
          color: #4338ca;
        }

        .chat-input-row {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.85rem 1.25rem;
          border-top: 1px solid #edf2f7;
          background: #ffffff;
        }

        .chat-textarea {
          flex: 1;
          border: 1px solid #cbd5e1;
          border-radius: 12px;
          padding: 0.75rem 1rem;
          font-size: 0.92rem;
          resize: none;
          outline: none;
          font-family: inherit;
          transition: border-color 0.2s;
        }

        .chat-textarea:focus {
          border-color: #4f46e5;
          box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.12);
        }

        .chat-submit-btn {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: #4f46e5;
          color: white;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          flex-shrink: 0;
        }

        .chat-submit-btn:hover:not(:disabled) {
          background: #4338ca;
          transform: translateY(-1px);
        }

        .chat-submit-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
};

export default ChatView;
