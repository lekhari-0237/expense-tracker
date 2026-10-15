import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import ReceiptUploadModal from '../components/ReceiptUploadModal';
import { getCategoryColor, getCategoryBg } from '../utils/categoryColors';
import {
  Wallet,
  TrendingDown,
  TrendingUp,
  Scale,
  PiggyBank,
  Filter,
  Plus,
  FileText,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Landmark,
  Layers,
  Sparkles,
  Info,
  Calendar,
  X,
  ChevronRight,
  Receipt,
  Smartphone
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend
} from 'recharts';

const DashboardPage = () => {
  const [summary, setSummary] = useState(null);
  const [categories, setCategories] = useState([]);
  const [trend, setTrend] = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [bankTransactions, setBankTransactions] = useState([]);
  const [period, setPeriod] = useState('current_month');
  const [loading, setLoading] = useState(true);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [selectedCategoryDetail, setSelectedCategoryDetail] = useState(null);

  const navigate = useNavigate();

  useEffect(() => {
    fetchDashboardData();

    const handleDataChanged = () => {
      fetchDashboardData();
    };
    window.addEventListener('expense-tracker-data-changed', handleDataChanged);
    return () => window.removeEventListener('expense-tracker-data-changed', handleDataChanged);
  }, [period]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [sumRes, catRes, trendRes, txRes, bankRes] = await Promise.all([
        api.get(`/dashboard/summary?period=${period}`).catch(() => ({ success: false })),
        api.get(`/dashboard/category-summary?period=${period}`).catch(() => ({ success: false })),
        api.get('/dashboard/trend').catch(() => ({ success: false })),
        api.get('/transactions?limit=6').catch(() => ({ success: false })),
        api.get('/transactions?source=mock_bank&limit=4').catch(() => ({ success: false })),
      ]);

      if (sumRes.success) setSummary(sumRes.data);
      if (catRes.success) setCategories(catRes.data || []);
      if (trendRes.success) setTrend(trendRes.data || []);
      if (txRes.success) setRecentTransactions(txRes.data || []);
      if (bankRes.success) setBankTransactions(bankRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const totalExpenseAmount = categories.reduce((sum, c) => sum + (c.amount || 0), 0);

  // Custom Interactive Tooltip for Donut Chart
  const CustomDonutTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const color = getCategoryColor(data.category);
      return (
        <div className="custom-donut-tooltip">
          <div className="tooltip-header">
            <span className="tooltip-dot" style={{ backgroundColor: color }} />
            <strong>{data.category}</strong>
          </div>
          <div className="tooltip-amount">₹{data.amount.toLocaleString()}</div>
          <div className="tooltip-pct">{data.percentage}% of total spending</div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="dashboard-page">
      <ReceiptUploadModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        onTransactionAdded={() => fetchDashboardData()}
      />

      {/* Page Header with Action Bar */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Smart Dashboard</h1>
          <p className="page-subtitle">AI-powered tracking for personal expenses, income & bank sync</p>
        </div>

        <div className="period-filter-wrapper">
          <div className="filter-select-box">
            <Filter size={16} className="filter-icon" />
            <select
              className="period-select"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            >
              <option value="current_month">This Month</option>
              <option value="previous_month">Last Month</option>
              <option value="this_week">This Week</option>
              <option value="last_7_days">Last 7 Days</option>
              <option value="last_30_days">Last 30 Days</option>
              <option value="current_year">Current Year</option>
            </select>
          </div>

          <button className="btn btn-secondary" onClick={() => setIsReceiptModalOpen(true)}>
            <FileText size={17} /> Scan Receipt
          </button>

          <button className="btn btn-bank" onClick={() => navigate('/bank-sync')}>
            <Landmark size={17} /> Bank Sync
          </button>

          <button className="btn btn-success" onClick={() => navigate('/add-transaction?type=INCOME')}>
            <TrendingUp size={17} /> + Income
          </button>

          <button className="btn btn-primary" onClick={() => navigate('/add-transaction')}>
            <Plus size={17} /> + Expense
          </button>
        </div>
      </div>

      {/* KPI Summary Cards Grid */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon income"><Wallet size={24} /></div>
          <div>
            <div className="kpi-label">Total Income</div>
            <div className="kpi-value">
              {loading && !summary ? <span className="skeleton-line" /> : `₹${summary?.totalIncome?.toLocaleString() || '0'}`}
            </div>
            <button
              className="btn-link-subtle"
              onClick={() => navigate('/income')}
              style={{ fontSize: '0.75rem', background: 'none', border: 'none', color: 'var(--accent-emerald)', cursor: 'pointer', padding: 0, fontWeight: 600, marginTop: '4px' }}
            >
              + Set Monthly Salary
            </button>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon expense"><TrendingDown size={24} /></div>
          <div>
            <div className="kpi-label">Total Expenses</div>
            <div className="kpi-value">
              {loading && !summary ? <span className="skeleton-line" /> : `₹${summary?.totalExpenses?.toLocaleString() || '0'}`}
            </div>
            <div className="kpi-subtext">
              {summary?.transactionCount || 0} transactions in period
            </div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon balance"><Scale size={24} /></div>
          <div>
            <div className="kpi-label">Current Balance</div>
            <div className="kpi-value">
              {loading && !summary ? (
                <span className="skeleton-line" />
              ) : (
                `₹${(summary?.currentBalance ?? summary?.balance ?? 0).toLocaleString()}`
              )}
            </div>
            {summary && Number(summary?.totalIncome || 0) === 0 && (
              <div style={{ fontSize: '0.72rem', color: 'var(--accent-rose)', marginTop: '4px', fontWeight: '500' }}>
                Add income to see net balance
              </div>
            )}
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon savings"><PiggyBank size={24} /></div>
          <div>
            <div className="kpi-label">Savings Rate</div>
            <div className="kpi-value">
              {loading && !summary ? (
                <span className="skeleton-line" />
              ) : (
                <>
                  ₹{summary?.savings?.toLocaleString() || '0'}{' '}
                  <span className="savings-pct">({summary?.savingsPercentage || 0}%)</span>
                </>
              )}
            </div>
            <div className="kpi-subtext">Retained capital</div>
          </div>
        </div>
      </div>

      {/* Month-over-Month Spending Comparison Banner */}
      {summary?.comparison && (
        <div className="spending-comparison-banner card">
          <div className="comparison-content">
            <div className="comp-icon-box">
              <Sparkles size={20} />
            </div>
            <div>
              <div className="comp-title">Monthly Spending Comparison</div>
              <div className="comp-desc">
                This Month: <strong>₹{summary.comparison.thisMonthExpense.toLocaleString()}</strong> vs Last Month: <strong>₹{summary.comparison.lastMonthExpense.toLocaleString()}</strong>
                {summary.comparison.lastMonthExpense > 0 && (
                  <span className={`comp-diff-pill ${summary.comparison.direction}`}>
                    {summary.comparison.direction === 'increased' ? '+' : '-'}₹{Math.abs(summary.comparison.difference).toLocaleString()} ({summary.comparison.percentageChange}%)
                  </span>
                )}
              </div>
            </div>
          </div>
          <button className="btn btn-sm btn-outline" onClick={() => navigate('/calendar')}>
            View Calendar <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* Main Charts Row */}
      <div className="charts-grid">
        {/* Spending by Category Donut Chart with Integrated Center & Centralized Colors */}
        <div className="card chart-card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Spending by Category</h3>
              <p className="card-subtitle">Color-coded breakdown • Click a category to view details</p>
            </div>
            <span className="badge badge-info">{categories.length} Categories</span>
          </div>

          {loading && categories.length === 0 ? (
            <div className="chart-empty"><RefreshCw size={20} className="spinning" /> Loading spending data...</div>
          ) : categories.length === 0 ? (
            <div className="chart-empty empty-state-box">
              <Layers size={36} style={{ color: 'var(--text-muted)' }} />
              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>No expense data available</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: 300, textAlign: 'center' }}>
                Add an expense, upload a receipt, or sync your Demo Bank to see your spending breakdown.
              </div>
            </div>
          ) : (
            <div className="donut-and-legend-wrapper">
              {/* Donut Chart Container */}
              <div className="donut-chart-container">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={categories}
                      dataKey="amount"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      innerRadius={68}
                      outerRadius={98}
                      paddingAngle={3}
                      onClick={(entry) => setSelectedCategoryDetail(entry)}
                      style={{ cursor: 'pointer' }}
                    >
                      {categories.map((entry) => (
                        <Cell
                          key={`cell-${entry.category}`}
                          fill={getCategoryColor(entry.category)}
                          stroke="#ffffff"
                          strokeWidth={2}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomDonutTooltip />} />
                  </PieChart>
                </ResponsiveContainer>

                {/* Donut Center Display */}
                <div className="donut-center-info">
                  <div className="donut-center-amount">₹{totalExpenseAmount.toLocaleString()}</div>
                  <div className="donut-center-label">Total Spending</div>
                </div>
              </div>

              {/* Categorized Color Legend Grid */}
              <div className="category-legend-grid">
                {categories.map((cat) => {
                  const color = getCategoryColor(cat.category);
                  const bg = getCategoryBg(cat.category);
                  return (
                    <div
                      key={cat.category}
                      className="legend-item-card"
                      onClick={() => setSelectedCategoryDetail(cat)}
                    >
                      <div className="legend-left">
                        <span className="legend-dot" style={{ backgroundColor: color }} />
                        <span className="legend-cat-name">{cat.category}</span>
                      </div>
                      <div className="legend-right">
                        <span className="legend-cat-amount">₹{cat.amount.toLocaleString()}</span>
                        <span className="legend-cat-pct" style={{ color: color }}>
                          {cat.percentage}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Category Insights Strip */}
          {categories.length > 0 && (
            <div className="category-insights-strip">
              <Sparkles size={14} className="strip-sparkle" />
              <span>
                <strong>{categories[0].category}</strong> is your highest expense category at <strong>₹{categories[0].amount.toLocaleString()}</strong> ({categories[0].percentage}% of total).
              </span>
            </div>
          )}
        </div>

        {/* Income vs Expense Trend Bar Chart */}
        <div className="card chart-card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Income vs Expense Trend</h3>
              <p className="card-subtitle">Month-over-month cash flow analysis</p>
            </div>
          </div>
          {loading && trend.length === 0 ? (
            <div className="chart-empty"><RefreshCw size={20} className="spinning" /> Loading trend...</div>
          ) : trend.length === 0 ? (
            <div className="chart-empty">No trend data available</div>
          ) : (
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer>
                <BarChart data={trend} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" stroke="#475569" />
                  <YAxis stroke="#475569" />
                  <Tooltip formatter={(val) => `₹${val.toLocaleString()}`} />
                  <Legend />
                  <Bar dataKey="income" name="Income" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expense" name="Expense" fill="#e11d48" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Category Deep-Dive Drilldown Modal */}
      {selectedCategoryDetail && (
        <div className="modal-backdrop" onClick={() => setSelectedCategoryDetail(null)}>
          <div className="modal-box category-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span
                  className="cat-detail-dot"
                  style={{ backgroundColor: getCategoryColor(selectedCategoryDetail.category) }}
                />
                <h2>{selectedCategoryDetail.category} Analytics</h2>
              </div>
              <button className="btn-close" onClick={() => setSelectedCategoryDetail(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="cat-analytics-grid">
              <div className="analytics-card">
                <span className="lbl">Total Spending</span>
                <span className="val" style={{ color: getCategoryColor(selectedCategoryDetail.category) }}>
                  ₹{selectedCategoryDetail.amount?.toLocaleString()}
                </span>
              </div>
              <div className="analytics-card">
                <span className="lbl">Share of Total</span>
                <span className="val">{selectedCategoryDetail.percentage}%</span>
              </div>
              <div className="analytics-card">
                <span className="lbl">Transactions</span>
                <span className="val">{selectedCategoryDetail.transactionCount || 1}</span>
              </div>
              <div className="analytics-card">
                <span className="lbl">Average / Txn</span>
                <span className="val">₹{selectedCategoryDetail.averageAmount?.toLocaleString() || selectedCategoryDetail.amount}</span>
              </div>
            </div>

            {selectedCategoryDetail.highestAmount > 0 && (
              <div className="highest-txn-box">
                <Info size={16} />
                <div>
                  Largest expense: <strong>₹{selectedCategoryDetail.highestAmount?.toLocaleString()}</strong> ({selectedCategoryDetail.highestDescription})
                </div>
              </div>
            )}

            {selectedCategoryDetail.transactions && selectedCategoryDetail.transactions.length > 0 && (
              <div className="cat-recent-txns">
                <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.5rem' }}>Recent {selectedCategoryDetail.category} Transactions:</h4>
                <div className="mini-txn-list">
                  {selectedCategoryDetail.transactions.map((t, idx) => (
                    <div key={idx} className="mini-txn-item">
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{t.description}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t.date} • {t.source}</div>
                      </div>
                      <div style={{ fontWeight: 800, color: 'var(--accent-rose)' }}>
                        -₹{t.amount?.toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dual Table Section: Recent Transactions + Recent Bank Sync Feeds */}
      <div className="dashboard-tables-grid">
        {/* Recent Transactions Table */}
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Recent Transactions</h3>
              <p className="card-subtitle">All entries (Manual, OCR, Bank Sync)</p>
            </div>
            <button className="btn-link" onClick={() => navigate('/calendar')}>View All</button>
          </div>

          {recentTransactions.length === 0 ? (
            <div className="empty-state-text">No transactions recorded yet.</div>
          ) : (
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Source</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTransactions.map((tx) => {
                    const catColor = getCategoryColor(tx.category);
                    const catBg = getCategoryBg(tx.category);
                    return (
                      <tr key={tx.id}>
                        <td>{tx.date}</td>
                        <td>
                          <strong>{tx.description || '-'}</strong>
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
                            {tx.category}
                          </span>
                        </td>
                        <td>
                          <span className={`source-badge ${tx.source || 'manual'}`}>
                            {tx.source === 'ocr' && <Receipt size={12} />}
                            {tx.source === 'mock_bank' && <Landmark size={12} />}
                            {tx.source === 'manual' && <Smartphone size={12} />}
                            {tx.source === 'mock_bank' ? 'Bank Sync' : (tx.source === 'ocr' ? 'OCR' : 'Manual')}
                          </span>
                        </td>
                        <td className={`tx-amount ${tx.type?.toLowerCase()}`}>
                          {tx.type === 'INCOME' ? '+' : '-'}₹{tx.amount?.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Bank Sync Overview & Recent Synced Transactions */}
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Bank Sync Feeds</h3>
              <p className="card-subtitle">Fictional Demo Bank integration</p>
            </div>
            <button className="btn btn-sm btn-secondary" onClick={() => navigate('/bank-sync')}>
              <Landmark size={14} /> Open Sync
            </button>
          </div>

          <div className="bank-card-inner">
            <div className="bank-summary-strip">
              <Landmark size={20} className="bank-strip-icon" />
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Apex Demo Bank (**** 4582)</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Status: {summary?.bankInfo?.connected ? '✓ Connected' : 'Disconnected'} • {summary?.bankInfo?.bankTransactionsCount || 0} Transactions Synced
                </div>
              </div>
            </div>

            {bankTransactions.length === 0 ? (
              <div className="empty-bank-box">
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                  Connect your Demo Bank to automatically import transactions.
                </p>
                <button className="btn btn-sm btn-primary" onClick={() => navigate('/bank-sync')}>
                  Go to Bank Sync
                </button>
              </div>
            ) : (
              <div className="bank-mini-txns-list">
                {bankTransactions.map((bt) => (
                  <div key={bt.id} className="bank-mini-item">
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{bt.description}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {bt.date} • <span style={{ color: getCategoryColor(bt.category), fontWeight: 600 }}>{bt.category}</span>
                      </div>
                    </div>
                    <div style={{ fontWeight: 800, color: bt.type === 'INCOME' ? '#10b981' : '#e11d48', fontSize: '0.9rem' }}>
                      {bt.type === 'INCOME' ? '+' : '-'}₹{bt.amount?.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .dashboard-page {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .page-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 1rem;
          margin-bottom: 0.25rem;
        }

        .page-title {
          font-size: 1.75rem;
          font-weight: 800;
          color: var(--text-primary);
        }

        .page-subtitle {
          font-size: 0.875rem;
          color: var(--text-secondary);
        }

        .period-filter-wrapper {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          flex-wrap: wrap;
        }

        .filter-select-box {
          display: flex;
          align-items: center;
          background: #ffffff;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          padding: 0 0.65rem;
        }

        .filter-icon {
          color: var(--text-muted);
        }

        .period-select {
          border: none;
          outline: none;
          background: transparent;
          font-size: 0.85rem;
          font-weight: 600;
          padding: 0.55rem 0.35rem;
          cursor: pointer;
        }

        .btn-bank {
          background-color: #1e1b4b;
          color: white;
          border: none;
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.6rem 0.95rem;
          border-radius: var(--radius-sm);
          font-weight: 700;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-bank:hover {
          background-color: #312e81;
          transform: translateY(-1px);
        }

        .spending-comparison-banner {
          background: linear-gradient(135deg, #f8fafc, #f1f5f9);
          border: 1px solid #cbd5e1;
          padding: 0.95rem 1.25rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .comparison-content {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .comp-icon-box {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: #e0e7ff;
          color: #4338ca;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .comp-title {
          font-size: 0.85rem;
          font-weight: 800;
          color: var(--text-primary);
        }

        .comp-desc {
          font-size: 0.82rem;
          color: var(--text-secondary);
        }

        .comp-diff-pill {
          margin-left: 0.5rem;
          padding: 0.15rem 0.45rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 700;
        }

        .comp-diff-pill.increased {
          background-color: #fff1f2;
          color: #e11d48;
        }

        .comp-diff-pill.decreased {
          background-color: #f0fdf4;
          color: #166534;
        }

        .btn-outline {
          background: white;
          border: 1px solid var(--border-color);
          color: var(--text-primary);
          padding: 0.4rem 0.75rem;
          border-radius: var(--radius-sm);
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          cursor: pointer;
        }

        .donut-and-legend-wrapper {
          display: grid;
          grid-template-columns: 240px 1fr;
          gap: 1.5rem;
          align-items: center;
        }

        @media (max-width: 600px) {
          .donut-and-legend-wrapper {
            grid-template-columns: 1fr;
          }
        }

        .donut-chart-container {
          position: relative;
          width: 100%;
          height: 260px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .donut-center-info {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          text-align: center;
          pointer-events: none;
        }

        .donut-center-amount {
          font-size: 1.25rem;
          font-weight: 800;
          color: var(--text-primary);
        }

        .donut-center-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        .category-legend-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
          gap: 0.65rem;
          max-height: 260px;
          overflow-y: auto;
          padding-right: 0.25rem;
        }

        .legend-item-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 0.55rem 0.75rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
          transition: background 0.15s, transform 0.15s;
        }

        .legend-item-card:hover {
          background: #eff6ff;
          border-color: #bfdbfe;
          transform: translateX(2px);
        }

        .legend-left {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .legend-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .legend-cat-name {
          font-size: 0.85rem;
          font-weight: 700;
          color: var(--text-primary);
        }

        .legend-right {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .legend-cat-amount {
          font-size: 0.85rem;
          font-weight: 700;
          color: var(--text-secondary);
        }

        .legend-cat-pct {
          font-size: 0.75rem;
          font-weight: 800;
        }

        .category-insights-strip {
          margin-top: 1rem;
          padding: 0.65rem 0.95rem;
          background-color: #eff6ff;
          border-radius: 6px;
          font-size: 0.8rem;
          color: #1e40af;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .strip-sparkle {
          color: #2563eb;
          flex-shrink: 0;
        }

        .custom-donut-tooltip {
          background: #1e293b;
          color: white;
          padding: 0.65rem 0.85rem;
          border-radius: 8px;
          box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3);
          font-size: 0.8rem;
        }

        .tooltip-header {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          margin-bottom: 0.25rem;
        }

        .tooltip-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
        }

        .tooltip-amount {
          font-size: 1rem;
          font-weight: 800;
          color: #38bdf8;
        }

        .tooltip-pct {
          font-size: 0.72rem;
          color: #94a3b8;
          margin-top: 0.15rem;
        }

        .custom-category-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.2rem 0.6rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 700;
        }

        .cat-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }

        .source-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          font-size: 0.72rem;
          font-weight: 700;
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
        }

        .source-badge.manual {
          background-color: #f1f5f9;
          color: #475569;
        }

        .source-badge.ocr {
          background-color: #fdf2f8;
          color: #db2777;
          border: 1px solid #fbcfe8;
        }

        .source-badge.mock_bank {
          background-color: #e0e7ff;
          color: #4338ca;
          border: 1px solid #c7d2fe;
        }

        .dashboard-tables-grid {
          display: grid;
          grid-template-columns: 1.6fr 1fr;
          gap: 1.5rem;
        }

        @media (max-width: 900px) {
          .dashboard-tables-grid {
            grid-template-columns: 1fr;
          }
        }

        .bank-card-inner {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .bank-summary-strip {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          background: #f8fafc;
          padding: 0.75rem;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
        }

        .bank-strip-icon {
          color: #4338ca;
        }

        .bank-mini-txns-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .bank-mini-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.6rem 0.75rem;
          background: #ffffff;
          border: 1px solid #f1f5f9;
          border-radius: 6px;
        }

        .empty-bank-box {
          padding: 1.5rem;
          text-align: center;
          background: #f8fafc;
          border-radius: 8px;
        }

        /* Modal styling for Category Deep-Dive */
        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.45);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 1rem;
        }

        .category-detail-modal {
          background: white;
          width: 480px;
          max-width: 100%;
          border-radius: 14px;
          padding: 1.5rem;
          box-shadow: 0 20px 25px -5px rgba(0,0,0,0.2);
        }

        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1.25rem;
        }

        .modal-header h2 {
          font-size: 1.2rem;
          font-weight: 800;
        }

        .cat-detail-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
        }

        .btn-close {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--text-muted);
        }

        .cat-analytics-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }

        .analytics-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .analytics-card .lbl {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-weight: 600;
        }

        .analytics-card .val {
          font-size: 1.1rem;
          font-weight: 800;
          color: var(--text-primary);
        }

        .highest-txn-box {
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          color: #1e40af;
          padding: 0.65rem 0.85rem;
          border-radius: 6px;
          font-size: 0.8rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }

        .mini-txn-list {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          max-height: 160px;
          overflow-y: auto;
        }

        .mini-txn-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 0.75rem;
          background: #f8fafc;
          border-radius: 6px;
        }
      `}</style>
    </div>
  );
};

export default DashboardPage;
