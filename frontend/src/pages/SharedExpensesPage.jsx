import React, { useState, useEffect } from 'react';
import api from '../services/api';
import Toast from '../components/Toast';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { Users, Plus, UserPlus, CheckCircle } from 'lucide-react';

const SharedExpensesPage = () => {
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState(false);

  // Derived from the current `groups` list, so the view can never keep pointing
  // at a stale copy after a member/expense mutation or a group deletion.
  const selectedGroup = groups.find((g) => g.id === selectedGroupId) || null;

  // Create Group Modal
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [memberNamesInput, setMemberNamesInput] = useState('');

  // Add Member Modal
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');

  // Add Expense Modal
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseTotal, setExpenseTotal] = useState('');
  const [paidByName, setPaidByName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState([]);

  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchGroups();
  }, []);

  useEffect(() => {
    if (selectedGroup) {
      fetchGroupBalances(selectedGroup.id);
    } else {
      setBalances([]);
    }
  }, [selectedGroup?.id, actionPending]);

  const fetchGroups = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    else setActionPending(true);
    try {
      const res = await api.get('/groups');
      if (res.success && res.data) {
        setGroups(res.data);
        setSelectedGroupId((current) => {
          if (current && res.data.some((g) => g.id === current)) return current;
          return res.data.length > 0 ? res.data[0].id : null;
        });
      }
    } catch (err) {
      if (!silent) setToast({ message: 'Could not load your groups. Please retry.', type: 'error' });
    } finally {
      if (!silent) setLoading(false);
      else setActionPending(false);
    }
  };

  const fetchGroupBalances = async (groupId) => {
    try {
      const res = await api.get(`/groups/${groupId}/balances`);
      if (res.success) {
        setBalances(res.data || []);
      }
    } catch (err) {
      setToast({ message: 'Could not load balances. Please retry.', type: 'error' });
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!groupName.trim() || submitting) return;

    setSubmitting(true);
    try {
      const res = await api.post('/groups', {
        groupName: groupName.trim(),
        memberNames: memberNamesInput,
      });

      if (res.success && res.data) {
        setToast({ message: `Group "${res.data.groupName}" created with ${res.data.memberNames.length} member(s)`, type: 'success' });
        setIsGroupModalOpen(false);
        setGroupName('');
        setMemberNamesInput('');
        // Prepend and open the new group immediately — no extra list round-trip.
        setGroups((prev) => [res.data, ...prev.filter((g) => g.id !== res.data.id)]);
        setSelectedGroupId(res.data.id);
      } else {
        setToast({ message: res.message || 'Could not create the group.', type: 'error' });
      }
    } catch (err) {
      setToast({ message: err.message || 'Could not create the group.', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!newMemberName.trim() || !selectedGroup || submitting) return;

    setSubmitting(true);
    try {
      const res = await api.post(`/groups/${selectedGroup.id}/members`, {
        memberName: newMemberName.trim(),
      });

      if (res.success && res.data) {
        setToast({ message: 'Member added', type: 'success' });
        setIsMemberModalOpen(false);
        setNewMemberName('');
        setGroups((prev) => prev.map((g) => (g.id === res.data.id ? res.data : g)));
      } else {
        setToast({ message: res.message || 'Could not add the member.', type: 'error' });
      }
    } catch (err) {
      setToast({ message: err.message || 'Could not add the member.', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!selectedGroup) return;
    if (!expenseDesc || !expenseTotal || !paidByName || selectedMembers.length === 0) {
      setToast({ message: 'Please complete all expense details', type: 'error' });
      return;
    }
    if (submitting) return;

    setSubmitting(true);
    try {
      const res = await api.post(`/groups/${selectedGroup.id}/expenses`, {
        description: expenseDesc,
        totalAmount: parseFloat(expenseTotal),
        paidByName,
        date: new Date().toISOString().split('T')[0],
        members: selectedMembers,
      });

      if (res.success && res.data) {
        setToast({ message: 'Group expense recorded', type: 'success' });
        setIsExpenseModalOpen(false);
        setExpenseDesc('');
        setExpenseTotal('');
        setPaidByName('');
        setSelectedMembers([]);
        setGroups((prev) => prev.map((g) => (g.id === res.data.id ? res.data : g)));
        // The new splits only reach the balances panel through this refetch;
        // without it the section keeps showing the previous settled state.
        fetchGroupBalances(selectedGroup.id);
      } else {
        setToast({ message: res.message || 'Could not record the expense.', type: 'error' });
      }
    } catch (err) {
      setToast({ message: err.message || 'Could not record the expense.', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSettleSplit = async (splitId) => {
    if (!selectedGroup) return;
    try {
      const res = await api.post(`/groups/splits/${splitId}/settle`);
      if (res.success && res.data) {
        setToast({ message: 'Expense marked as settled', type: 'success' });
        setGroups((prev) => prev.map((g) => (g.id === res.data.id ? res.data : g)));
        fetchGroupBalances(selectedGroup.id);
      } else {
        setToast({ message: res.message || 'Could not settle that split.', type: 'error' });
      }
    } catch (err) {
      setToast({ message: err.message || 'Could not settle that split.', type: 'error' });
    }
  };

  const toggleMemberSelection = (name) => {
    if (selectedMembers.includes(name)) {
      setSelectedMembers(selectedMembers.filter((m) => m !== name));
    } else {
      setSelectedMembers([...selectedMembers, name]);
    }
  };

  return (
    <div className="shared-expenses-page">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

      <div className="page-header">
        <div>
          <h1 className="page-title">Shared & Group Expenses</h1>
          <p className="page-subtitle">Split bills with roommates, friends, or team members</p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsGroupModalOpen(true)}>
          <Plus size={18} /> Create Group
        </button>
      </div>

      {loading ? (
        <div className="loading-container">Loading groups...</div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No expense groups created yet."
          description="Create a group like 'Roommates' or 'Trip' to split shared expenses!"
          actionText="Create Group"
          onAction={() => setIsGroupModalOpen(true)}
        />
      ) : (
        <div className="group-layout-grid">
          {/* Group Navigation Tabs */}
          <div className="group-tabs-card card">
            <h3 className="card-title" style={{ marginBottom: '1rem' }}>Your Groups</h3>
            <div className="group-list">
              {groups.map((g) => (
                <button
                  key={g.id}
                  className={`group-tab-btn ${selectedGroup?.id === g.id ? 'active' : ''}`}
                  onClick={() => setSelectedGroupId(g.id)}
                >
                  <Users size={16} />
                  <span>{g.groupName}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Group Content View */}
          {selectedGroup && (
            <div className="group-details-view">
              <div className="card">
                <div className="card-header">
                  <div>
                    <h2 className="card-title">{selectedGroup.groupName}</h2>
                    <div className="member-tags">
                      Members:{' '}
                      {selectedGroup.members?.length
                        ? selectedGroup.members.map((m, i) => (
                          <span key={m.name} className="member-tag">
                            {i > 0 ? ', ' : ''}
                            {m.name}
                            {m.isOwner ? ' (you)' : ''}
                          </span>
                        ))
                        : ' none yet'}
                    </div>
                  </div>
                  <div className="group-action-btns">
                    <button className="btn btn-secondary" onClick={() => setIsMemberModalOpen(true)}>
                      <UserPlus size={16} /> Add Member
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        setPaidByName(selectedGroup.memberNames?.[0] || '');
                        setSelectedMembers(selectedGroup.memberNames || []);
                        setIsExpenseModalOpen(true);
                      }}
                    >
                      <Plus size={16} /> Add Expense
                    </button>
                  </div>
                </div>

                {/* Outstanding Balances Section */}
                <div className="balances-section">
                  <h4 className="section-title">Owed Balances &amp; Settlements</h4>
                  {balances.length === 0 ? (
                    <div className="all-settled-box">🎉 All shared expenses are completely settled!</div>
                  ) : (
                    <div className="balances-list">
                      {balances.map((b) => (
                        <div key={b.splitId} className="balance-item">
                          <div>
                            <div className="balance-text">{b.summaryText}</div>
                            <div className="balance-sub">{b.expenseDescription} · {b.expenseDate}</div>
                          </div>
                          <button className="btn btn-secondary btn-sm" disabled={submitting} onClick={() => handleSettleSplit(b.splitId)}>
                            <CheckCircle size={14} /> Mark as Settled
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Expenses History */}
                <div className="expenses-history-section" style={{ marginTop: '2rem' }}>
                  <h4 className="section-title">Group Expense History</h4>
                  {selectedGroup.expenses?.length === 0 ? (
                    <div className="empty-sub">No expenses recorded in this group yet.</div>
                  ) : (
                    <div className="table-responsive">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Description</th>
                            <th>Paid By</th>
                            <th>Total Amount</th>
                            <th>Split (owed to payer)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedGroup.expenses?.map((e) => {
                            const owed = (e.splits || []).filter((s) => !s.isSettled);
                            const settled = (e.splits || []).filter((s) => s.isSettled).length;
                            return (
                              <tr key={e.id}>
                                <td>{e.date}</td>
                                <td>{e.description}</td>
                                <td><span className="badge badge-info">{e.paidByName}</span></td>
                                <td style={{ fontWeight: 800 }}>₹{e.totalAmount?.toLocaleString('en-IN')}</td>
                                <td className="split-cell">
                                  {owed.length === 0
                                    ? <span className="badge badge-success">Settled</span>
                                    : owed.map((s) => `${s.memberName} ₹${s.amount.toLocaleString('en-IN')}`).join(', ')}
                                  {e.splits?.length ? (
                                    <div className="split-sub">{e.splits.length} way · {settled} settled</div>
                                  ) : null}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Group Modal */}
      <Modal isOpen={isGroupModalOpen} title="Create Expense Group" onClose={() => setIsGroupModalOpen(false)}>
        <form onSubmit={handleCreateGroup}>
          <div className="form-group">
            <label className="form-label">Group Name</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Roommates"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Other Members (comma separated)</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Ravi, Priya, Arun"
              value={memberNamesInput}
              onChange={(e) => setMemberNamesInput(e.target.value)}
            />
            <p className="form-hint">You are added automatically as the first member.</p>
          </div>

          <div className="form-actions" style={{ marginTop: '1.5rem' }}>
            <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Group'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Member Modal */}
      <Modal isOpen={isMemberModalOpen} title="Add Member to Group" onClose={() => setIsMemberModalOpen(false)}>
        <form onSubmit={handleAddMember}>
          <div className="form-group">
            <label className="form-label">Member Name</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Rahul"
              value={newMemberName}
              onChange={(e) => setNewMemberName(e.target.value)}
              required
            />
          </div>

          <div className="form-actions" style={{ marginTop: '1.5rem' }}>
            <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
              {submitting ? 'Adding...' : 'Add Member'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Group Expense Modal */}
      <Modal isOpen={isExpenseModalOpen} title="Add Group Expense" onClose={() => setIsExpenseModalOpen(false)}>
        <form onSubmit={handleAddExpense}>
          <div className="form-group">
            <label className="form-label">Description</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Dinner at restaurant"
              value={expenseDesc}
              onChange={(e) => setExpenseDesc(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Total Amount (₹)</label>
            <input
              type="number"
              step="0.01"
              className="form-control"
              placeholder="e.g. 2000"
              value={expenseTotal}
              onChange={(e) => setExpenseTotal(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Paid By</label>
            <select
              className="form-control"
              value={paidByName}
              onChange={(e) => setPaidByName(e.target.value)}
              required
            >
              {selectedGroup?.memberNames?.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Split Among Members</label>
            <div className="member-checkbox-list">
              {selectedGroup?.memberNames?.map((m) => (
                <label key={m} className="checkbox-item">
                  <input
                    type="checkbox"
                    checked={selectedMembers.includes(m)}
                    onChange={() => toggleMemberSelection(m)}
                  />
                  <span>{m}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="form-actions" style={{ marginTop: '1.5rem' }}>
            <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
              {submitting ? 'Saving...' : 'Add Shared Expense'}
            </button>
          </div>
        </form>
      </Modal>

      <style>{`
        .group-layout-grid {
          display: grid;
          grid-template-columns: 240px 1fr;
          gap: 1.5rem;
        }

        @media (max-width: 768px) {
          .group-layout-grid {
            grid-template-columns: 1fr;
          }
        }

        .group-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .group-tab-btn {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          background: none;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          color: var(--text-secondary);
          font-weight: 600;
          cursor: pointer;
          transition: var(--transition);
          text-align: left;
        }

        .group-tab-btn.active {
          background-color: rgba(37, 99, 235, 0.1);
          border-color: var(--accent-blue);
          color: var(--accent-blue);
        }

        .member-tags {
          font-size: 0.85rem;
          color: var(--text-muted);
          margin-top: 0.25rem;
        }

        .group-action-btns {
          display: flex;
          gap: 0.75rem;
        }

        .section-title {
          font-size: 1rem;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 0.85rem;
        }

        .all-settled-box {
          padding: 1rem;
          background-color: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: var(--radius-sm);
          color: var(--accent-emerald);
          font-weight: 600;
          text-align: center;
        }

        .balances-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .balance-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.85rem 1rem;
          background-color: #f8fafc;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
        }

        .balance-text {
          font-weight: 700;
          color: var(--text-primary);
          font-size: 0.9rem;
        }

        .balance-sub {
          font-size: 0.8rem;
          color: var(--text-muted);
        }

        .member-checkbox-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          background: #f8fafc;
          border: 1px solid var(--border-color);
          padding: 0.85rem;
          border-radius: var(--radius-sm);
        }

        .checkbox-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.9rem;
          cursor: pointer;
        }

        .loading-container {
          padding: 3rem;
          text-align: center;
          color: var(--text-secondary);
        }

        .form-hint {
          font-size: 0.8rem;
          color: var(--text-muted);
          margin: 0.4rem 0 0;
        }

        .split-cell {
          font-size: 0.85rem;
        }

        .split-sub {
          font-size: 0.75rem;
          color: var(--text-muted);
          margin-top: 0.2rem;
        }
      `}</style>
    </div>
  );
};

export default SharedExpensesPage;
