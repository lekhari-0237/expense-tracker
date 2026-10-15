import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';
import Toast from '../components/Toast';
import ReceiptUploadModal from '../components/ReceiptUploadModal';
import { PlusCircle, ArrowLeft, FileText, Sparkles } from 'lucide-react';

import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, getCategoryColor } from '../utils/categoryColors';

// Values match what ExpenseBot stores in the same Transaction field.
const PAYMENT_METHODS = [
  { value: 'UPI', label: 'UPI' },
  { value: 'Cash', label: 'Cash' },
  { value: 'Card', label: 'Card' },
  { value: 'NetBanking', label: 'Net Banking' },
  { value: 'Wallet', label: 'Wallet' },
];

const AddTransactionPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const initialType = queryParams.get('type') === 'INCOME' ? 'INCOME' : 'EXPENSE';

  const [amount, setAmount] = useState('');
  const [type, setType] = useState(initialType);
  const [category, setCategory] = useState(initialType === 'INCOME' ? 'Salary' : 'Food');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [notes, setNotes] = useState('');

  React.useEffect(() => {
    const newType = queryParams.get('type') === 'INCOME' ? 'INCOME' : 'EXPENSE';
    setType(newType);
    setCategory(newType === 'INCOME' ? 'Salary' : 'Food');
  }, [location.search]);
  
  const [submitting, setSubmitting] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [toast, setToast] = useState({ message: '', type: 'success' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      setToast({ message: 'Amount must be greater than 0', type: 'error' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/transactions', {
        amount: parseFloat(amount),
        category,
        date,
        description,
        type,
        paymentMethod,
        notes,
      });

      if (res.success) {
        setToast({ message: 'Transaction added successfully.', type: 'success' });
        setTimeout(() => {
          navigate('/dashboard');
        }, 1200);
      }
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="add-transaction-page">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

      <ReceiptUploadModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        onTransactionAdded={() => {
          setToast({ message: 'Expense extracted & added from receipt!', type: 'success' });
          setTimeout(() => navigate('/dashboard'), 1200);
        }}
      />

      <div className="page-header">
        <button className="btn-back" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={18} /> Back
        </button>
        <h1 className="page-title">
          {type === 'INCOME' ? 'Add Income' : 'Add Transaction'}
        </h1>
      </div>

      {/* Auto Receipt Upload Banner */}
      {type === 'EXPENSE' && (
        <div className="receipt-upload-banner">
          <div className="banner-info">
            <Sparkles className="banner-icon" size={22} />
            <div>
              <div className="banner-title">Have a receipt photo?</div>
              <div className="banner-sub">Auto-extract amount, vendor, date & category from bill image</div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary banner-btn"
            onClick={() => setIsReceiptModalOpen(true)}
          >
            <FileText size={16} /> Scan Receipt
          </button>
        </div>
      )}

      <div className="card form-card">
        <form onSubmit={handleSubmit}>
          {/* Type Selector Toggle */}
          <div className="form-group">
            <label className="form-label">Transaction Type</label>
            <div className="type-toggle-grid">
              <button
                type="button"
                className={`type-btn ${type === 'EXPENSE' ? 'active-expense' : ''}`}
                onClick={() => { setType('EXPENSE'); setCategory('Food'); }}
              >
                Expense
              </button>
              <button
                type="button"
                className={`type-btn ${type === 'INCOME' ? 'active-income' : ''}`}
                onClick={() => { setType('INCOME'); setCategory('Salary'); }}
              >
                Income
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Amount (₹)</label>
            <input
              type="number"
              step="0.01"
              className="form-control"
              placeholder="e.g. 1500"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">{type === 'INCOME' ? 'Income Source' : 'Category'}</label>
            <select
              className="form-control"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
            >
              {(type === 'INCOME' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Date</label>
            <input
              type="date"
              className="form-control"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">{type === 'INCOME' ? 'Optional Note' : 'Description (Optional)'}</label>
            <input
              type="text"
              className="form-control"
              placeholder={type === 'INCOME' ? 'e.g. October Salary' : 'e.g. Lunch with team'}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Payment Method (Optional)</label>
            <select
              className="form-control"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              <option value="">Not recorded</option>
              {PAYMENT_METHODS.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Notes (Optional)</label>
            <textarea
              className="form-control"
              rows={3}
              maxLength={200}
              placeholder="e.g. Split with roommate, reimbursed next month"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <div className="notes-hint">{notes.length}/200</div>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
              <PlusCircle size={18} /> {submitting ? 'Saving...' : (type === 'INCOME' ? 'Add Income' : 'Add Transaction')}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        .add-transaction-page {
          max-width: 600px;
          margin: 0 auto;
        }

        .btn-back {
          background: none;
          border: none;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          font-weight: 600;
          margin-bottom: 0.5rem;
        }

        .receipt-upload-banner {
          background: linear-gradient(135deg, #eff6ff, #e0e7ff);
          border: 1px solid #c7d2fe;
          border-radius: var(--radius-md);
          padding: 1rem 1.25rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin-top: 1rem;
          margin-bottom: 1rem;
          flex-wrap: wrap;
        }

        .banner-info {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .banner-icon {
          color: var(--accent-blue);
          flex-shrink: 0;
        }

        .banner-title {
          font-size: 0.95rem;
          font-weight: 700;
          color: var(--text-primary);
        }

        .banner-sub {
          font-size: 0.8rem;
          color: var(--text-secondary);
        }

        .banner-btn {
          height: 38px;
          font-size: 0.85rem;
          background-color: #ffffff;
        }

        .form-card {
          margin-top: 0.5rem;
        }

        .type-toggle-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.75rem;
        }

        .type-btn {
          height: 46px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-color);
          background-color: var(--bg-input);
          color: var(--text-secondary);
          font-weight: 700;
          cursor: pointer;
          transition: var(--transition);
        }

        .type-btn.active-expense {
          background-color: #fff1f2;
          border-color: var(--accent-rose);
          color: var(--accent-rose);
        }

        .type-btn.active-income {
          background-color: #f0fdf4;
          border-color: var(--accent-emerald);
          color: var(--accent-emerald);
        }

        .form-actions {
          margin-top: 2rem;
        }

        .notes-hint {
          margin-top: 0.3rem;
          font-size: 0.75rem;
          color: var(--text-secondary);
          text-align: right;
        }

        textarea.form-control {
          resize: vertical;
          font-family: inherit;
        }
      `}</style>
    </div>
  );
};

export default AddTransactionPage;
