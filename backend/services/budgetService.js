'use strict';

const Budget = require('../models/Budget');
const Transaction = require('../models/Transaction');
const Notification = require('../models/Notification');
const { startOfMonthOffset, endOfMonthOffset, getZoneParts } = require('../utils/dateUtil');

function currentMonthYear() {
    const s = startOfMonthOffset(0);
    const parts = getZoneParts(s);
    return { month: parts.month, year: parts.year };
}

/**
 * Create or update a budget. One budget per (user, category, month, year).
 * category: null/'' for the overall monthly budget.
 */
async function setBudget(userId, { category, amount, period = 'monthly', alertThreshold }) {
    const amt = Number(amount);
    if (!isFinite(amt) || amt <= 0) {
        const err = new Error('Budget amount must be greater than 0');
        err.status = 400;
        throw err;
    }
    const { month, year } = currentMonthYear();
    const cat = category ? String(category).trim() : null;

    const existing = await Budget.findOne({ user: userId, category: cat || null, month, year });

    const update = { amount: amt, period };
    if (alertThreshold !== undefined && alertThreshold !== null) {
        const t = Number(alertThreshold);
        if (!isFinite(t) || t < 0.01 || t > 1) {
            const e = new Error('Alert threshold must be between 0.01 and 1 (e.g. 0.8 for 80%)');
            e.status = 400;
            throw e;
        }
        update.alertThreshold = t;
        update.alertTriggered = false; // re-arm when threshold changes
    }

    const budget = await Budget.findOneAndUpdate(
        { user: userId, category: cat || null, month, year },
        { $set: update },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return { budget, created: !existing, month, year };
}

/** Spending per category for a month + total. */
async function getMonthSpending(userId, { month, year } = currentMonthYear()) {
    const start = startOfMonthOffset(0, null); // boundaries for the CURRENT month
    // If a specific month/year was requested, compute its boundaries
    let startDate = start;
    let endDate = endOfMonthOffset(0, null);
    if (month && year) {
        const nowParts = getZoneParts(startDate);
        const monthOffset = (year - nowParts.year) * 12 + (month - nowParts.month);
        startDate = startOfMonthOffset(monthOffset);
        endDate = endOfMonthOffset(monthOffset);
    }

    const rows = await Transaction.aggregate([
        {
            $match: {
                user: userId,
                type: { $in: ['EXPENSE', 'expense'] },
                date: { $gte: startDate, $lte: endDate }
            }
        },
        { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]);

    const byCategory = {};
    let total = 0;
    for (const r of rows) {
        byCategory[r._id || 'Other'] = Math.round(r.total * 100) / 100;
        total += r.total;
    }
    return { byCategory, total: Math.round(total * 100) / 100, startDate, endDate };
}

function statusForBudget(budget, spent) {
    const remaining = Math.round((budget.amount - spent) * 100) / 100;
    const percentUsed = budget.amount > 0 ? Math.round((spent / budget.amount) * 100) : 0;
    const exceeded = spent > budget.amount;
    return {
        id: budget._id,
        category: budget.category || null,
        label: budget.category ? `Category: ${budget.category}` : 'Overall monthly budget',
        amount: budget.amount,
        spent: Math.round(spent * 100) / 100,
        remaining,
        percentUsed,
        exceeded,
        nearLimit: !exceeded && percentUsed >= (budget.alertThreshold || 0.8) * 100,
        alertThreshold: budget.alertThreshold,
        alertTriggered: Boolean(budget.alertTriggered),
        month: budget.month,
        year: budget.year,
        period: budget.period
    };
}

/**
 * Full budget status for the current month: overall + category budgets.
 * Also fires one-time threshold notifications when a budget crosses its
 * alert threshold (alertTriggered flag prevents repeat notifications).
 */
async function getBudgetStatus(userId) {
    const { month, year } = currentMonthYear();
    const [budgets, spending] = await Promise.all([
        Budget.find({ user: userId, month, year }).lean(),
        getMonthSpending(userId, { month, year })
    ]);

    const statuses = budgets.map(b => {
        const spent = b.category ? (spending.byCategory[b.category] || 0) : spending.total;
        return statusForBudget(b, spent);
    });

    const overall = statuses.find(s => s.category === null) || null;
    const categoryStatuses = statuses.filter(s => s.category !== null);

    // Fire threshold notifications exactly once per crossing
    for (const st of statuses) {
        const budget = budgets.find(b => b._id.equals(st.id));
        const threshold = (budget.alertThreshold || 0.8) * 100;
        const crossed = st.percentUsed >= threshold;
        if (crossed && !budget.alertTriggered) {
            await Budget.updateOne({ _id: budget._id }, { $set: { alertTriggered: true } });
            await createBudgetAlertNotification(userId, st, threshold);
            st.alertTriggered = true;
            st.alertJustTriggered = true;
        } else if (!crossed && budget.alertTriggered) {
            // Re-arm the alert if spending dropped back below the threshold
            await Budget.updateOne({ _id: budget._id }, { $set: { alertTriggered: false } });
        }
    }

    return {
        overall,
        categoryStatuses,
        hasBudgets: statuses.length > 0,
        totalSpentThisMonth: spending.total,
        month,
        year
    };
}

function alertReferenceId(status) {
    return `budget_${status.id}_${status.month}_${status.year}`;
}

async function createBudgetAlertNotification(userId, status, thresholdPercent) {
    const name = status.category ? `your ${status.category} budget` : 'your monthly budget';
    const existing = await Notification.findOne({ user: userId, referenceId: alertReferenceId(status) });
    if (existing) return existing;

    const money = (n) => Math.abs(Number(n) || 0).toLocaleString('en-IN');
    const tail = status.exceeded
        ? `You are ₹${money(status.remaining)} over the limit.`
        : `₹${money(status.remaining)} still left.`;

    return Notification.create({
        user: userId,
        title: `Budget alert: ${status.category || 'Monthly'} spending at ${status.percentUsed}%`,
        message: `You have used ${status.percentUsed}% of ${name} (₹${money(status.spent)} of ₹${money(status.amount)}). ${tail}`,
        priority: status.exceeded ? 'OVERDUE' : 'WARNING',
        category: 'BUDGET',
        referenceId: alertReferenceId(status)
    });
}

/** Update alert threshold on budgets (all, or a specific category). */
async function setAlertThreshold(userId, { category, threshold }) {
    const t = Number(threshold);
    if (!isFinite(t) || t < 0.01 || t > 1) {
        const e = new Error('Alert threshold must be between 1% and 100%');
        e.status = 400;
        throw e;
    }
    const { month, year } = currentMonthYear();
    const filter = { user: userId, month, year };
    if (category) filter.category = category;
    else filter.category = null;

    const result = await Budget.updateMany(filter, {
        $set: { alertThreshold: t, alertTriggered: false }
    });
    return result;
}

/** Edit an existing budget the user owns. Never touches another user's row. */
async function updateBudget(userId, budgetId, { amount, alertThreshold, period } = {}) {
    const existing = await Budget.findOne({ _id: budgetId, user: userId });
    if (!existing) {
        const e = new Error('Budget not found');
        e.status = 404;
        throw e;
    }

    const set = {};
    if (amount !== undefined && amount !== null && amount !== '') {
        const amt = Number(amount);
        if (!isFinite(amt) || amt <= 0) {
            const err = new Error('Budget amount must be greater than 0');
            err.status = 400;
            throw err;
        }
        set.amount = amt;
    }
    if (alertThreshold !== undefined && alertThreshold !== null && alertThreshold !== '') {
        const t = Number(alertThreshold);
        if (!isFinite(t) || t < 0.01 || t > 1) {
            const e = new Error('Alert threshold must be between 0.01 and 1 (e.g. 0.8 for 80%)');
            e.status = 400;
            throw e;
        }
        set.alertThreshold = t;
        set.alertTriggered = false; // re-arm so the new threshold can alert
    }
    if (period) {
        if (!['monthly', 'weekly', 'yearly'].includes(period)) {
            const e = new Error("Period must be 'monthly', 'weekly' or 'yearly'");
            e.status = 400;
            throw e;
        }
        set.period = period;
    }

    if (!Object.keys(set).length) {
        const e = new Error('Nothing to update: send amount, alertThreshold or period');
        e.status = 400;
        throw e;
    }

    const updated = await Budget.findOneAndUpdate({ _id: budgetId, user: userId }, { $set: set }, { new: true });
    return updated;
}

/**
 * Delete one of the user's budgets plus the threshold alert it produced, so the
 * notification list cannot reference a budget that no longer exists.
 */
async function removeBudget(userId, budgetId) {
    const existing = await Budget.findOne({ _id: budgetId, user: userId });
    if (!existing) {
        const e = new Error('Budget not found');
        e.status = 404;
        throw e;
    }
    await Budget.deleteOne({ _id: existing._id, user: userId });
    await Notification.deleteMany({
        user: userId,
        referenceId: `budget_${existing._id}_${existing.month}_${existing.year}`
    });
    return { deleted: true, id: String(existing._id) };
}

module.exports = {
    setBudget,
    getBudgetStatus,
    getMonthSpending,
    setAlertThreshold,
    updateBudget,
    removeBudget,
    currentMonthYear
};
