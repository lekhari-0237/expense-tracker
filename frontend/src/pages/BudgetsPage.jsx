import React, { useState, useEffect } from 'react';
import api from '../services/api';
import Toast from '../components/Toast';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { PiggyBank, Plus, AlertTriangle, Pencil, Trash2, CheckCircle } from 'lucide-react';

const inr = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const BudgetsPage = () => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ message: '', type: 'success' });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState(null); // budget row being edited, or null for create
  const [form, setForm] = useState({ category: '', amount: '', threshold: '80' });
  const [categoryOptions, setCategoryOptions] = useState([]);

  useEffect(() => {
    fetchStatus();
    const onChanged = () => fetchStatus();
    window.addEventListener('expense-tracker-data-changed', onChanged);
    return () => window.removeEventListener('expense-tracker-data-changed', onChanged);
  }, []);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await api.get('/budgets');
      if (res.success) setStatus(res.data);
    } catch (err) {
      setToast({ message: err.message || 'Could not load budgets', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ category: '', amount: '', threshold: '80' });
    setIsModalOpen(true);
    // Existing categories make the picker useful without typing them from memory.
    api.get('/transactions?limit=200')
      .then((res) => {
        const cats = [...new Set((res.data || []).map((t) => t.category).filter(Boolean))].sort();
        setCategoryOptions(cats);
      })
      .catch(() => setCategoryOptions([]));
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      category: row.category || '',
      amount: String(row.amount),
      threshold: String(Math.round((row.alertThreshold || 0.8) * 100))
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!isFinite(amount) || amount <= 0) {
      setToast({ message: 'Enter a budget amount greater than 0', type: 'error' });
      return;
    }
    const threshold = Number(form.threshold) / 100;
    if (!isFinite(threshold) || threshold < 0.01 || threshold > 1) {
      setToast({ message: 'Alert threshold must be between 1% and 100%', type: 'error' });
      return;
    }

    setSaving(true);
    try {
      const res = editing
        ? await api.put(`/budgets/${editing.id}`, { amount, alertThreshold: threshold })
        : await api.post('/budgets', { category: form.category.trim(), amount, alertThreshold: threshold });

      setToast({ message: res.message || 'Budget saved', type: 'success' });
      setIsModalOpen(false);
      setEditing(null);
      await fetchStatus();
    } catch (err) {
      setToast({ message: err.message || 'Could not save budget', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row) => {
    const scope = row.category ? `${row.category} budget` : 'overall monthly budget';
    if (!window.confirm(`Delete your ${scope} of ${inr(row.amount)}? Your transactions are not affected.`)) return;
    try {
      const res = await api.delete(`/budgets/${row.id}`);
      setToast({ message: res.message || 'Budget removed', type: 'success' });
      await fetchStatus();
    } catch (err) {
      setToast({ message: err.message || 'Could not delete budget', type: 'error' });
    }
  };

  const rows = status ? [status.overall, ...(status.categoryStatuses || [])].filter(Boolean) : [];

  return (
    <div className="budgets-page">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

      <div className="page-header">
        <div>
          <h1 className="page-title">Budget Manager</h1>
          <p className="page-subtitle">
            {status ? `${status.monthLabel || ''} limits, live spending and threshold alerts` : 'Monthly limits with threshold alerts'}
          </p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={18} /> {rows.length ? 'Set / Update Budget' : 'Create Budget'}
        </button>
      </div>

      {loading ? (
        <div className="loading-container">Loading budgets...</div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={PiggyBank}
          title="No budgets yet."
          description="Set an overall monthly limit or a limit per category. ExpenseBot will alert you once when spending crosses your threshold."
          actionText="Create Budget"
          onAction={openCreate}
        />
      ) : (
        <>
          <div className="kpi-grid budget-kpis">
            <div className="card kpi-card">
              <div className="kpi-label">Spent this month</div>
              <div className="kpi-value text-rose">{inr(status.totalSpentThisMonth)}</div>
            </div>
            <div className="card kpi-card">
              <div className="kpi-label">Budgets set</div>
              <div className="kpi-value">{rows.length}</div>
            </div>
            <div className="card kpi-card">
              <div className="kpi-label">Alerts sent</div>
              <div className="kpi-value">{rows.filter((r) => r.alertTriggered).length}</div>
            </div>
          </div>

          <div className="budgets-grid">
            {rows.map((row) => (
              <div key={row.id} className={`card budget-card ${row.exceeded ? 'over' : row.nearLimit ? 'near' : ''}`}>
                <div className="budget-card-header">
                  <div>
                    <h3 className="budget-title">{row.category ? row.category : 'Overall monthly budget'}</h3>
                    <div className="budget-period">{MONTH_NAMES[row.month - 1]} {row.year} · {row.period}</div>
                  </div>
                  {row.exceeded ? (
                    <span className="badge badge-danger"><AlertTriangle size={14} /> Over budget</span>
                  ) : row.nearLimit ? (
                    <span className="badge badge-warning"><AlertTriangle size={14} /> Near limit</span>
                  ) : (
                    <span className="badge badge-success"><CheckCircle size={14} /> On track</span>
                  )}
                </div>

                <div className="budget-metrics">
                  <div>
                    <span className="metric-label">Limit</span>
                    <span className="metric-val">{inr(row.amount)}</span>
                  </div>
                  <div>
                    <span className="metric-label">Spent</span>
                    <span className="metric-val">{inr(row.spent)}</span>
                  </div>
                  <div>
                    <span className="metric-label">{row.remaining < 0 ? 'Over by' : 'Remaining'}</span>
                    <span className={`metric-val ${row.remaining < 0 ? 'text-rose' : 'text-emerald'}`}>{inr(Math.abs(row.remaining))}</span>
                  </div>
                </div>

                <div className="progress-section">
                  <div className="progress-bar-container">
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${Math.min(row.percentUsed, 100)}%`,
                        background: row.exceeded
                          ? 'var(--accent-rose)'
                          : row.nearLimit
                            ? 'var(--accent-amber)'
                            : undefined
                      }}
                    ></div>
                  </div>
                  <div className="progress-text">{row.percentUsed}% used · alert at {Math.round((row.alertThreshold || 0.8) * 100)}%</div>
                </div>

                <div className="budget-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(row)}>
                    <Pencil size={14} /> Edit limit
                  </button>
                  <button className="btn-icon-danger" onClick={() => handleDelete(row)} title="Delete this budget">
                    <Trash2 size={16} />
                  </button>
                </div>

                {row.alertTriggered && (
                  <div className="alert-note">
                    Threshold alert already sent for this budget — you will be alerted again only if spending drops
                    below {Math.round((row.alertThreshold || 0.8) * 100)}% and crosses it once more.
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <Modal isOpen={isModalOpen} title={editing ? 'Edit Budget' : 'Set a Budget'} onClose={() => setIsModalOpen(false)}>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Category</label>
            {editing ? (
              <input className="form-control" value={editing.category || 'Overall monthly budget'} disabled />
            ) : (
              <>
                <input
                  className="form-control"
                  list="budget-category-options"
                  placeholder="Leave empty for the overall monthly budget"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                />
                <datalist id="budget-category-options">
                  {categoryOptions.map((c) => <option key={c} value={c} />)}
                </datalist>
              </>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Monthly limit (₹)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              className="form-control"
              placeholder="e.g. 12000"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Alert me at (% of limit)</label>
            <input
              type="number"
              step="1"
              min="1"
              max="100"
              className="form-control"
              value={form.threshold}
              onChange={(e) => setForm({ ...form, threshold: e.target.value })}
              required
            />
            <div className="form-hint">One alert per budget per month when spending reaches this point.</div>
          </div>

          <div className="form-actions" style={{ marginTop: '1.5rem' }}>
            <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Update Budget' : 'Create Budget'}
            </button>
          </div>
        </form>
      </Modal>

      <style>{`
        .budget-kpis { margin-bottom: 1.5rem; }
        .text-rose { color: var(--accent-rose); }
        .text-emerald { color: var(--accent-emerald); }
        .budgets-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 1.5rem;
        }
        .budget-card { display: flex; flex-direction: column; }
        .budget-card.over { border-color: var(--accent-rose); }
        .budget-card.near { border-color: var(--accent-amber); }
        .budget-card-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }
        .budget-title { font-size: 1.1rem; font-weight: 800; color: var(--text-primary); }
        .budget-period { font-size: 0.78rem; color: var(--text-muted); margin-top: 0.15rem; }
        .budget-metrics {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 0.5rem;
          background-color: #f8fafc;
          border: 1px solid var(--border-color);
          padding: 0.85rem;
          border-radius: var(--radius-sm);
          margin-bottom: 1rem;
        }
        .budget-metrics .metric-label { display: block; font-size: 0.75rem; color: var(--text-muted); }
        .budget-metrics .metric-val { font-size: 0.95rem; font-weight: 700; color: var(--text-primary); }
        .progress-text { font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); margin-top: 0.35rem; }
        .budget-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 1rem;
        }
        .btn-sm { padding: 0.35rem 0.7rem; font-size: 0.8rem; }
        .btn-icon-danger { background: none; border: none; color: var(--accent-rose); cursor: pointer; }
        .alert-note {
          margin-top: 0.85rem;
          font-size: 0.75rem;
          color: var(--accent-amber);
          background: rgba(217, 119, 6, 0.08);
          border-radius: var(--radius-sm);
          padding: 0.5rem 0.65rem;
        }
        .form-hint { font-size: 0.75rem; color: var(--text-muted); margin-top: 0.3rem; }
        .loading-container { padding: 3rem; text-align: center; color: var(--text-secondary); }
      `}</style>
    </div>
  );
};

export default BudgetsPage;
