import React from 'react';
import ChatView from '../components/ChatView';
import { Bot, Sparkles, ShieldCheck } from 'lucide-react';

const ChatPage = () => {
  return (
    <div className="chat-page-container">
      <div className="chat-page-header">
        <div className="header-left">
          <div className="header-icon-box">
            <Bot size={24} />
          </div>
          <div>
            <h1 className="header-title">ExpenseBot Assistant</h1>
            <p className="header-subtitle">
              Natural-language financial assistant for expense logging, insights, and report exports
            </p>
          </div>
        </div>
        <div className="header-badge">
          <ShieldCheck size={16} />
          <span>Private & Grounded</span>
        </div>
      </div>

      <div className="chat-page-card">
        <ChatView isWidget={false} />
      </div>

      <style>{`
        .chat-page-container {
          padding: 1.5rem;
          max-width: 1100px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          height: calc(100vh - 80px);
        }

        .chat-page-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 1.5rem;
          background: #ffffff;
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 4px 15px -3px rgba(0, 0, 0, 0.05);
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .header-icon-box {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          background: linear-gradient(135deg, #4f46e5, #3b82f6);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 8px 16px rgba(79, 70, 229, 0.25);
        }

        .header-title {
          font-size: 1.4rem;
          font-weight: 800;
          color: #0f172a;
          margin: 0;
        }

        .header-subtitle {
          font-size: 0.88rem;
          color: #64748b;
          margin: 0.2rem 0 0 0;
        }

        .header-badge {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          background: #f0fdf4;
          color: #166534;
          border: 1px solid #bbf7d0;
          padding: 0.4rem 0.8rem;
          border-radius: 20px;
          font-size: 0.82rem;
          font-weight: 600;
        }

        .chat-page-card {
          flex: 1;
          min-height: 0;
          background: #ffffff;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08);
          border: 1px solid #e2e8f0;
        }
      `}</style>
    </div>
  );
};

export default ChatPage;
