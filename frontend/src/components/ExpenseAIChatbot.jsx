import React, { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import ChatView from './ChatView';

const ExpenseAIChatbot = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating Trigger Button */}
      {!isOpen && (
        <button
          className="ai-floating-trigger"
          onClick={() => setIsOpen(true)}
          title="Open ExpenseBot"
        >
          <div className="trigger-pulse" />
          <Sparkles size={18} className="trigger-sparkle" />
          <span className="trigger-text">ExpenseBot</span>
        </button>
      )}

      {/* Chat Window Drawer / Modal */}
      {isOpen && (
        <div className="ai-chat-window-container">
          <div className="chat-window-card">
            <div className="chat-window-topbar">
              <div className="brand-info">
                <div className="brand-icon">
                  <Sparkles size={16} />
                </div>
                <div>
                  <div className="brand-name">ExpenseBot</div>
                  <div className="brand-subtitle">AI Assistant</div>
                </div>
              </div>
              <button
                className="close-drawer-btn"
                onClick={() => setIsOpen(false)}
                title="Close chat"
              >
                <X size={18} />
              </button>
            </div>

            <div className="chat-window-body">
              <ChatView isWidget={true} />
            </div>
          </div>
        </div>
      )}

      <style>{`
        .ai-floating-trigger {
          position: fixed;
          bottom: 1.5rem;
          right: 1.5rem;
          background: linear-gradient(135deg, #4f46e5, #3b82f6);
          color: white;
          border: none;
          border-radius: 50px;
          padding: 0.85rem 1.4rem;
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
          transform: translateY(-2px);
          box-shadow: 0 15px 30px -5px rgba(79, 70, 229, 0.6);
        }

        .trigger-sparkle {
          animation: spin-pulse 3s infinite ease-in-out;
        }

        @keyframes spin-pulse {
          0%, 100% { transform: scale(1) rotate(0deg); }
          50% { transform: scale(1.15) rotate(15deg); }
        }

        .ai-chat-window-container {
          position: fixed;
          bottom: 1.5rem;
          right: 1.5rem;
          width: 420px;
          max-width: calc(100vw - 2rem);
          height: 620px;
          max-height: calc(100vh - 3rem);
          z-index: 1001;
          display: flex;
          flex-direction: column;
          animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .chat-window-card {
          background: #ffffff;
          border-radius: 20px;
          box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05);
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
        }

        .chat-window-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.9rem 1.25rem;
          background: linear-gradient(135deg, #4f46e5, #3b82f6);
          color: white;
        }

        .brand-info {
          display: flex;
          align-items: center;
          gap: 0.65rem;
        }

        .brand-icon {
          width: 32px;
          height: 32px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .brand-name {
          font-weight: 700;
          font-size: 0.95rem;
        }

        .brand-subtitle {
          font-size: 0.75rem;
          opacity: 0.85;
        }

        .close-drawer-btn {
          background: rgba(255, 255, 255, 0.15);
          border: none;
          color: white;
          width: 30px;
          height: 30px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.2s;
        }

        .close-drawer-btn:hover {
          background: rgba(255, 255, 255, 0.3);
        }

        .chat-window-body {
          flex: 1;
          height: calc(100% - 60px);
          overflow: hidden;
        }
      `}</style>
    </>
  );
};

export default ExpenseAIChatbot;
