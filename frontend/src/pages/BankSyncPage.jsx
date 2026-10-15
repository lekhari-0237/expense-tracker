import React, { useState, useEffect } from 'react';
import api from '../services/api';
import Toast from '../components/Toast';
import { getCategoryColor, getCategoryBg } from '../utils/categoryColors';
import {
  Landmark,
  RefreshCw,
  CheckCircle2,
  ShieldCheck,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Unlink,
  Link,
  Info,
  Clock,
  Coins
} from 'lucide-react';

const BankSyncPage = () => {
  const [bankStatus, setBankStatus] = useState(null);
  const [mockFeed, setMockFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [syncStats, setSyncStats] = useState(null);
  const [toast, setToast] = useState({ message: '', type: 'success' });

  useEffect(() => {
    fetchBankData();
  }, []);

  const fetchBankData = async () => {
    setLoading(true);
    try {
      const [statusRes, feedRes] = await Promise.all([
        api.get('/bank/mock/status').catch(() => ({ success: false })),
        api.get('/bank/mock/transactions').catch(() => ({ success: false })),
      ]);

      if (statusRes.success) setBankStatus(statusRes.data);
      if (feedRes.success) setMockFeed(feedRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await api.post('/bank/mock/connect');
      if (res.success) {
        setToast({ message: 'Demo Bank connected successfully.', type: 'success' });
        setBankStatus((prev) => ({
          ...prev,
          connected: true,
          bankName: res.data.bankName,
          accountMask: res.data.accountMask
        }));
      }
    } catch (err) {
      setToast({ message: err.message || 'Failed to connect demo bank', type: 'error' });
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setConnecting(true);
    try {
      const res = await api.post('/bank/mock/disconnect');
      if (res.success) {
        setToast({ message: 'Demo Bank disconnected.', type: 'info' });
        setBankStatus((prev) => ({ ...prev, connected: false }));
        setSyncStats(null);
      }
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setConnecting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncStats(null);
    try {
      const res = await api.post('/bank/mock/sync');
      if (res.success) {
        setSyncStats(res.data);
        setToast({
          message: res.message || 'Transactions synchronized successfully!',
          type: res.data.newImported > 0 ? 'success' : 'info'
        });
        fetchBankData();
        window.dispatchEvent(new CustomEvent('expense-tracker-data-changed'));
      }
    } catch (err) {
      setToast({ message: err.message || 'Unable to sync transactions. Please try again.', type: 'error' });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="bank-sync-page">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Bank Sync</h1>
          <p className="page-subtitle">Automatically import and categorize transactions into your Expense Tracker.</p>
        </div>
      </div>

      {/* Security & Demo Notice */}
      <div className="demo-notice-card">
        <div className="notice-icon-box">
          <ShieldCheck size={28} className="shield-icon" />
        </div>
        <div className="notice-content">
          <div className="notice-title">
            <span className="demo-tag">DEMO / MOCK BANK</span> Sandbox Environment
          </div>
          <div className="notice-desc">
            This is a fictional simulation demonstrating automated bank transaction synchronization and categorization.
            <strong> We never ask for your real banking credentials, passwords, UPI PINs, OTPs, or debit card CVVs.</strong>
          </div>
        </div>
      </div>

      {/* Bank Account Connection Card */}
      <div className="card account-status-card">
        <div className="account-card-header">
          <div className="bank-brand-info">
            <div className="bank-logo-box">
              <Landmark size={26} />
            </div>
            <div>
              <h2 className="bank-name">{bankStatus?.bankName || 'Apex Demo Bank (Fictional)'}</h2>
              <div className="account-number">
                Account: <strong>{bankStatus?.accountMask || '**** 4582'}</strong> • Checking / Savings
              </div>
            </div>
          </div>

          <div className="connection-badge-box">
            {bankStatus?.connected ? (
              <span className="status-badge connected">
                <CheckCircle2 size={16} /> Connected
              </span>
            ) : (
              <span className="status-badge disconnected">
                <AlertTriangle size={16} /> Disconnected
              </span>
            )}
          </div>
        </div>

        <div className="account-meta-grid">
          <div className="meta-item">
            <div className="meta-label"><Clock size={14} /> Last Synced</div>
            <div className="meta-val">
              {bankStatus?.lastSynced
                ? new Date(bankStatus.lastSynced).toLocaleString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })
                : 'Never synced yet'}
            </div>
          </div>

          <div className="meta-item">
            <div className="meta-label"><Coins size={14} /> Imported Transactions</div>
            <div className="meta-val">{bankStatus?.syncedTransactionsCount || 0} Synced</div>
          </div>
        </div>

        <div className="account-actions-bar">
          {bankStatus?.connected ? (
            <>
              <button
                className="btn btn-primary sync-btn"
                onClick={handleSync}
                disabled={syncing}
              >
                <RefreshCw size={18} className={syncing ? 'spinning' : ''} />
                {syncing ? 'Syncing Transactions...' : 'Sync Transactions'}
              </button>

              <button
                className="btn btn-outline-danger"
                onClick={handleDisconnect}
                disabled={connecting || syncing}
              >
                <Unlink size={16} /> Disconnect
              </button>
            </>
          ) : (
            <button
              className="btn btn-primary"
              onClick={handleConnect}
              disabled={connecting}
            >
              <Link size={18} /> Connect Demo Bank
            </button>
          )}
        </div>
      </div>

      {/* Sync Stats Banner (If just synced) */}
      {syncStats && (
        <div className="sync-results-card card">
          <div className="results-header">
            <CheckCircle2 size={20} className="success-icon" />
            <h3>Sync Summary</h3>
          </div>
          <div className="stats-metric-row">
            <div className="metric-box">
              <span className="num">{syncStats.totalFetched}</span>
              <span className="lbl">Total In Feed</span>
            </div>
            <div className="metric-box highlight">
              <span className="num">+{syncStats.newImported}</span>
              <span className="lbl">New Imported</span>
            </div>
            <div className="metric-box">
              <span className="num">{syncStats.duplicatesSkipped}</span>
              <span className="lbl">Duplicates Skipped</span>
            </div>
            <div className="metric-box expense-metric">
              <span className="num">{syncStats.expensesCreated}</span>
              <span className="lbl">Expenses Created</span>
            </div>
            <div className="metric-box income-metric">
              <span className="num">{syncStats.incomeCreated}</span>
              <span className="lbl">Income Created</span>
            </div>
          </div>
        </div>
      )}

      {/* Mock Bank Live Feed Preview */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Available Mock Bank Transactions</h3>
            <p className="card-subtitle">Transactions available for automated synchronization and intelligent categorization</p>
          </div>
          <span className="badge badge-info">{mockFeed.length} Transactions in Sandbox</span>
        </div>

        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Merchant / Description</th>
                <th>Auto Category</th>
                <th>Flow</th>
                <th>Amount</th>
                <th>External ID</th>
              </tr>
            </thead>
            <tbody>
              {mockFeed.map((txn) => {
                const isCredit = txn.type === 'CREDIT';
                const catColor = getCategoryColor(txn.category);
                const catBg = getCategoryBg(txn.category);

                return (
                  <tr key={txn.externalId}>
                    <td>
                      {new Date(txn.date).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </td>
                    <td>
                      <strong>{txn.merchant}</strong>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{txn.description}</div>
                    </td>
                    <td>
                      <span
                        className="custom-category-badge"
                        style={{
                          backgroundColor: catBg,
                          color: catColor,
                          border: `1px solid ${catColor}30`
                        }}
                      >
                        <span className="cat-dot" style={{ backgroundColor: catColor }} />
                        {txn.category}
                      </span>
                    </td>
                    <td>
                      {isCredit ? (
                        <span className="flow-badge credit"><ArrowUpRight size={14} /> Credit (Income)</span>
                      ) : (
                        <span className="flow-badge debit"><ArrowDownRight size={14} /> Debit (Expense)</span>
                      )}
                    </td>
                    <td className={`amount-cell ${isCredit ? 'income' : 'expense'}`}>
                      {isCredit ? '+' : '-'}₹{txn.amount.toLocaleString()}
                    </td>
                    <td>
                      <code className="external-id-code">{txn.externalId}</code>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        .bank-sync-page {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          max-width: 1000px;
          margin: 0 auto;
        }

        .demo-notice-card {
          background: linear-gradient(135deg, #eff6ff, #dbeafe);
          border: 1px solid #bfdbfe;
          border-radius: var(--radius-md);
          padding: 1.25rem 1.5rem;
          display: flex;
          align-items: flex-start;
          gap: 1rem;
        }

        .notice-icon-box {
          color: #2563eb;
          flex-shrink: 0;
          margin-top: 0.15rem;
        }

        .notice-title {
          font-size: 1rem;
          font-weight: 800;
          color: #1e3a8a;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.25rem;
        }

        .demo-tag {
          background-color: #2563eb;
          color: white;
          padding: 0.15rem 0.5rem;
          border-radius: 4px;
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.04em;
        }

        .notice-desc {
          font-size: 0.875rem;
          color: #1e40af;
          line-height: 1.45;
        }

        .account-status-card {
          padding: 1.75rem;
        }

        .account-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 1rem;
          padding-bottom: 1.25rem;
          border-bottom: 1px solid var(--border-color);
        }

        .bank-brand-info {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .bank-logo-box {
          width: 52px;
          height: 52px;
          border-radius: 12px;
          background: linear-gradient(135deg, #1e1b4b, #312e81);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(30, 27, 75, 0.2);
        }

        .bank-name {
          font-size: 1.25rem;
          font-weight: 800;
          color: var(--text-primary);
          margin-bottom: 0.15rem;
        }

        .account-number {
          font-size: 0.875rem;
          color: var(--text-secondary);
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.4rem 0.85rem;
          border-radius: 20px;
          font-size: 0.85rem;
          font-weight: 700;
        }

        .status-badge.connected {
          background-color: #f0fdf4;
          color: #166534;
          border: 1px solid #bbf7d0;
        }

        .status-badge.disconnected {
          background-color: #fff1f2;
          color: #9f1239;
          border: 1px solid #fecdd3;
        }

        .account-meta-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1.25rem;
          padding: 1.25rem 0;
          border-bottom: 1px solid var(--border-color);
        }

        .meta-label {
          font-size: 0.8rem;
          color: var(--text-muted);
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 0.35rem;
          margin-bottom: 0.25rem;
        }

        .meta-val {
          font-size: 1.05rem;
          font-weight: 700;
          color: var(--text-primary);
        }

        .account-actions-bar {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-top: 1.25rem;
          flex-wrap: wrap;
        }

        .sync-btn {
          min-width: 190px;
          font-weight: 700;
        }

        .btn-outline-danger {
          background: none;
          border: 1px solid #fecdd3;
          color: #e11d48;
          padding: 0.65rem 1rem;
          border-radius: var(--radius-sm);
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          cursor: pointer;
          transition: var(--transition);
        }

        .btn-outline-danger:hover {
          background-color: #fff1f2;
          border-color: #fda4af;
        }

        .sync-results-card {
          background: #f8fafc;
          border: 1px solid #cbd5e1;
        }

        .results-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }

        .results-header h3 {
          font-size: 1rem;
          font-weight: 800;
          color: var(--text-primary);
        }

        .success-icon {
          color: #10b981;
        }

        .stats-metric-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
          gap: 0.75rem;
        }

        .metric-box {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 0.85rem;
          text-align: center;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .metric-box.highlight {
          background: #f0fdf4;
          border-color: #86efac;
        }

        .metric-box .num {
          font-size: 1.35rem;
          font-weight: 800;
          color: var(--text-primary);
        }

        .metric-box.highlight .num {
          color: #15803d;
        }

        .metric-box.expense-metric .num {
          color: #e11d48;
        }

        .metric-box.income-metric .num {
          color: #10b981;
        }

        .metric-box .lbl {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-muted);
        }

        .custom-category-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.25rem 0.65rem;
          border-radius: 14px;
          font-size: 0.78rem;
          font-weight: 700;
        }

        .cat-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }

        .flow-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.8rem;
          font-weight: 700;
        }

        .flow-badge.credit { color: #10b981; }
        .flow-badge.debit { color: #e11d48; }

        .amount-cell {
          font-weight: 800;
          font-size: 0.95rem;
        }

        .amount-cell.income { color: #10b981; }
        .amount-cell.expense { color: #e11d48; }

        .external-id-code {
          background: #f1f5f9;
          padding: 0.2rem 0.45rem;
          border-radius: 4px;
          font-size: 0.75rem;
          color: #475569;
        }

        .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default BankSyncPage;
