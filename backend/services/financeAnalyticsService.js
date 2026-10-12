const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Income = require('../models/Income');
const SavingsGoal = require('../models/SavingsGoal');
const Bill = require('../models/Bill');
const Loan = require('../models/Loan');

/**
 * Robust Date Range Resolver
 * Returns accurate start and end Date objects for various time periods
 */
function resolveDateRange(periodStr, customStart, customEnd) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed (0 = Jan)

    if (customStart && customEnd) {
        const s = new Date(customStart);
        s.setHours(0, 0, 0, 0);
        const e = new Date(customEnd);
        e.setHours(23, 59, 59, 999);
        return { startDate: s, endDate: e, label: `${customStart} to ${customEnd}` };
    }

    const p = (periodStr || '').toLowerCase().trim();

    if (p === 'today') {
        const s = new Date(now);
        s.setHours(0, 0, 0, 0);
        const e = new Date(now);
        e.setHours(23, 59, 59, 999);
        return { startDate: s, endDate: e, label: 'Today' };
    }

    if (p === 'yesterday') {
        const s = new Date(now);
        s.setDate(now.getDate() - 1);
        s.setHours(0, 0, 0, 0);
        const e = new Date(now);
        e.setDate(now.getDate() - 1);
        e.setHours(23, 59, 59, 999);
        return { startDate: s, endDate: e, label: 'Yesterday' };
    }

    if (p === 'this_week' || p === 'current_week') {
        const s = new Date(now);
        s.setDate(now.getDate() - now.getDay());
        s.setHours(0, 0, 0, 0);
        const e = new Date(now);
        e.setHours(23, 59, 59, 999);
        return { startDate: s, endDate: e, label: 'This Week' };
    }

    if (p === 'last_week' || p === 'previous_week') {
        const s = new Date(now);
        s.setDate(now.getDate() - now.getDay() - 7);
        s.setHours(0, 0, 0, 0);
        const e = new Date(now);
        e.setDate(now.getDate() - now.getDay() - 1);
        e.setHours(23, 59, 59, 999);
        return { startDate: s, endDate: e, label: 'Last Week' };
    }

    if (p === 'last_30_days' || p === 'past_30_days') {
        const s = new Date(now);
        s.setDate(now.getDate() - 30);
        s.setHours(0, 0, 0, 0);
        const e = new Date(now);
        e.setHours(23, 59, 59, 999);
        return { startDate: s, endDate: e, label: 'Last 30 Days' };
    }

    if (p === 'previous_month' || p === 'last_month') {
        const s = new Date(currentYear, currentMonth - 1, 1);
        const e = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);
        const mName = s.toLocaleString('default', { month: 'long' });
        return { startDate: s, endDate: e, label: `Last Month (${mName})` };
    }

    // Check specific month names (e.g., 'january', 'september')
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    for (let i = 0; i < monthNames.length; i++) {
        if (p.includes(monthNames[i])) {
            const s = new Date(currentYear, i, 1);
            const e = new Date(currentYear, i + 1, 0, 23, 59, 59, 999);
            const mCapitalized = monthNames[i].charAt(0).toUpperCase() + monthNames[i].slice(1);
            return { startDate: s, endDate: e, label: `${mCapitalized} ${currentYear}` };
        }
    }

    if (p === 'this_year' || p === 'current_year') {
        const s = new Date(currentYear, 0, 1);
        const e = new Date(currentYear, 11, 31, 23, 59, 59, 999);
        return { startDate: s, endDate: e, label: `Year ${currentYear}` };
    }

    if (p === 'last_year' || p === 'previous_year') {
        const s = new Date(currentYear - 1, 0, 1);
        const e = new Date(currentYear - 1, 11, 31, 23, 59, 59, 999);
        return { startDate: s, endDate: e, label: `Year ${currentYear - 1}` };
    }

    if (p === 'all_time') {
        return { startDate: null, endDate: null, label: 'All Time' };
    }

    // Default to current month
    const s = new Date(currentYear, currentMonth, 1);
    const e = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);
    const currMName = s.toLocaleString('default', { month: 'long' });
    return { startDate: s, endDate: e, label: `This Month (${currMName})` };
}

/**
 * Build MongoDB match query for transactions
 */
function buildQuery(userId, options = {}) {
    const query = { user: new mongoose.Types.ObjectId(userId) };

    if (options.type) {
        const tUpper = options.type.toUpperCase();
        query.type = { $in: [tUpper, tUpper.toLowerCase()] };
    }

    if (options.category) {
        query.category = { $regex: new RegExp(`^${options.category}$`, 'i') };
    }

    if (options.startDate || options.endDate) {
        query.date = {};
        if (options.startDate) query.date.$gte = options.startDate;
        if (options.endDate) query.date.$lte = options.endDate;
    }

    if (options.minAmount !== undefined) {
        query.amount = query.amount || {};
        query.amount.$gte = Number(options.minAmount);
    }

    if (options.maxAmount !== undefined) {
        query.amount = query.amount || {};
        query.amount.$lte = Number(options.maxAmount);
    }

    if (options.search) {
        const searchRegex = new RegExp(options.search, 'i');
        query.$or = [
            { description: searchRegex },
            { merchant: searchRegex },
            { category: searchRegex }
        ];
    }

    return query;
}

/**
 * 1. GET MAXIMUM TRANSACTION
 * Returns the highest transaction(s), optionally ranked (rank 1 = highest, 2 = second highest)
 */
async function getMaxTransaction(userId, options = {}) {
    const { rank = 1, type, period, category, startDate, endDate } = options;
    const dateRange = period ? resolveDateRange(period, startDate, endDate) : (startDate && endDate ? resolveDateRange('custom', startDate, endDate) : { startDate: null, endDate: null, label: 'All Time' });
    
    const query = buildQuery(userId, {
        type: type || (category ? 'EXPENSE' : undefined), // default to expense if category specified, else any
        category,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate
    });

    const skip = Math.max(0, parseInt(rank, 10) - 1);
    const transactions = await Transaction.find(query)
        .sort({ amount: -1, date: -1 })
        .skip(skip)
        .limit(1);

    if (!transactions || transactions.length === 0) {
        return { found: false, transaction: null, rank, periodLabel: dateRange.label };
    }

    const tx = transactions[0];
    return {
        found: true,
        rank,
        periodLabel: dateRange.label,
        transaction: {
            id: tx._id,
            amount: tx.amount,
            category: tx.category,
            description: tx.description || tx.merchant || tx.category,
            merchant: tx.merchant || '',
            date: tx.date ? tx.date.toISOString().split('T')[0] : '',
            formattedDate: tx.date ? new Date(tx.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '',
            type: (tx.type || 'EXPENSE').toUpperCase(),
            source: tx.source || 'manual'
        }
    };
}

/**
 * 2. GET MINIMUM TRANSACTION
 */
async function getMinTransaction(userId, options = {}) {
    const { rank = 1, type, period, category, startDate, endDate } = options;
    const dateRange = period ? resolveDateRange(period, startDate, endDate) : { startDate: null, endDate: null, label: 'All Time' };
    
    const query = buildQuery(userId, {
        type: type || 'EXPENSE',
        category,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate
    });

    const skip = Math.max(0, parseInt(rank, 10) - 1);
    const transactions = await Transaction.find(query)
        .sort({ amount: 1, date: -1 })
        .skip(skip)
        .limit(1);

    if (!transactions || transactions.length === 0) {
        return { found: false, transaction: null, rank, periodLabel: dateRange.label };
    }

    const tx = transactions[0];
    return {
        found: true,
        rank,
        periodLabel: dateRange.label,
        transaction: {
            id: tx._id,
            amount: tx.amount,
            category: tx.category,
            description: tx.description || tx.merchant || tx.category,
            merchant: tx.merchant || '',
            date: tx.date ? tx.date.toISOString().split('T')[0] : '',
            formattedDate: tx.date ? new Date(tx.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '',
            type: (tx.type || 'EXPENSE').toUpperCase(),
            source: tx.source || 'manual'
        }
    };
}

/**
 * 3. GET TOTAL EXPENSES
 */
async function getTotalExpenses(userId, options = {}) {
    const { period = 'current_month', startDate, endDate, category } = options;
    const dateRange = resolveDateRange(period, startDate, endDate);

    const query = buildQuery(userId, {
        type: 'EXPENSE',
        category,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate
    });

    const results = await Transaction.aggregate([
        { $match: query },
        {
            $group: {
                _id: null,
                totalAmount: { $sum: '$amount' },
                count: { $sum: 1 },
                avgAmount: { $avg: '$amount' }
            }
        }
    ]);

    const total = results.length > 0 ? Math.round(results[0].totalAmount * 100) / 100 : 0;
    const count = results.length > 0 ? results[0].count : 0;
    const average = count > 0 ? Math.round((total / count) * 100) / 100 : 0;

    return {
        total,
        count,
        average,
        category: category || null,
        periodLabel: dateRange.label,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate
    };
}

/**
 * 4. GET TOTAL INCOME
 */
async function getTotalIncome(userId, options = {}) {
    const { period = 'current_month', startDate, endDate } = options;
    const dateRange = resolveDateRange(period, startDate, endDate);

    const query = buildQuery(userId, {
        type: 'INCOME',
        startDate: dateRange.startDate,
        endDate: dateRange.endDate
    });

    const results = await Transaction.aggregate([
        { $match: query },
        {
            $group: {
                _id: null,
                totalAmount: { $sum: '$amount' },
                count: { $sum: 1 }
            }
        }
    ]);

    let total = results.length > 0 ? Math.round(results[0].totalAmount * 100) / 100 : 0;
    let count = results.length > 0 ? results[0].count : 0;

    // Check fixed income fallback if no income transactions recorded for the month
    if (total === 0 && dateRange.startDate) {
        const monthNum = dateRange.startDate.getMonth() + 1;
        const yearNum = dateRange.startDate.getFullYear();
        const fixedInc = await Income.findOne({
            user: userId,
            month: monthNum,
            year: yearNum
        });
        if (fixedInc && fixedInc.amount > 0) {
            total = fixedInc.amount;
            count = 1;
        }
    }

    return {
        total,
        count,
        periodLabel: dateRange.label
    };
}

/**
 * 5. GET BALANCE
 */
async function getBalance(userId, options = {}) {
    const { period = 'current_month', startDate, endDate } = options;
    const [incomeData, expenseData] = await Promise.all([
        getTotalIncome(userId, { period, startDate, endDate }),
        getTotalExpenses(userId, { period, startDate, endDate })
    ]);

    const balance = Math.round((incomeData.total - expenseData.total) * 100) / 100;
    const savings = balance > 0 ? balance : 0;
    const savingsPercentage = incomeData.total > 0 ? Math.round((savings / incomeData.total) * 100) : 0;

    return {
        income: incomeData.total,
        expenses: expenseData.total,
        balance,
        savings,
        savingsPercentage,
        periodLabel: incomeData.periodLabel
    };
}

/**
 * 6. GET CATEGORY BREAKDOWN & TOP CATEGORIES
 */
async function getCategoryBreakdown(userId, options = {}) {
    const { period = 'current_month', startDate, endDate } = options;
    const dateRange = resolveDateRange(period, startDate, endDate);

    const query = buildQuery(userId, {
        type: 'EXPENSE',
        startDate: dateRange.startDate,
        endDate: dateRange.endDate
    });

    const categoryStats = await Transaction.aggregate([
        { $match: query },
        {
            $group: {
                _id: '$category',
                totalAmount: { $sum: '$amount' },
                count: { $sum: 1 },
                maxAmount: { $max: '$amount' }
            }
        },
        { $sort: { totalAmount: -1 } }
    ]);

    const totalExpense = categoryStats.reduce((sum, c) => sum + c.totalAmount, 0);

    const categories = categoryStats.map(c => ({
        category: c._id || 'Other',
        amount: Math.round(c.totalAmount * 100) / 100,
        count: c.count,
        percentage: totalExpense > 0 ? Math.round((c.totalAmount / totalExpense) * 100) : 0
    }));

    const topCategory = categories.length > 0 ? categories[0] : null;

    return {
        categories,
        topCategory,
        totalExpense: Math.round(totalExpense * 100) / 100,
        periodLabel: dateRange.label
    };
}

/**
 * 7. GET RECENT TRANSACTIONS
 */
async function getRecentTransactions(userId, options = {}) {
    const { limit = 5, type, category, minAmount, maxAmount, search, period } = options;
    const dateRange = period ? resolveDateRange(period) : { startDate: null, endDate: null };

    const query = buildQuery(userId, {
        type,
        category,
        minAmount,
        maxAmount,
        search,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate
    });

    const txns = await Transaction.find(query)
        .sort({ date: -1, createdAt: -1 })
        .limit(Math.min(20, parseInt(limit, 10) || 5));

    return txns.map(t => ({
        id: t._id,
        amount: t.amount,
        category: t.category,
        description: t.description || t.merchant || t.category,
        merchant: t.merchant || '',
        date: t.date ? t.date.toISOString().split('T')[0] : '',
        formattedDate: t.date ? new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '',
        type: (t.type || 'EXPENSE').toUpperCase(),
        source: t.source || 'manual'
    }));
}

/**
 * 8. COMPARE TWO PERIODS (e.g. this month vs last month)
 */
async function comparePeriods(userId, period1Str = 'current_month', period2Str = 'previous_month') {
    const [p1Expenses, p2Expenses, p1Income, p2Income] = await Promise.all([
        getTotalExpenses(userId, { period: period1Str }),
        getTotalExpenses(userId, { period: period2Str }),
        getTotalIncome(userId, { period: period1Str }),
        getTotalIncome(userId, { period: period2Str })
    ]);

    const expenseDiff = Math.round((p1Expenses.total - p2Expenses.total) * 100) / 100;
    const absDiff = Math.abs(expenseDiff);
    const pctChange = p2Expenses.total > 0 ? Math.round((absDiff / p2Expenses.total) * 100) : 0;
    const direction = expenseDiff > 0 ? 'increased' : (expenseDiff < 0 ? 'decreased' : 'same');

    return {
        period1: {
            label: p1Expenses.periodLabel,
            expenses: p1Expenses.total,
            income: p1Income.total,
            count: p1Expenses.count
        },
        period2: {
            label: p2Expenses.periodLabel,
            expenses: p2Expenses.total,
            income: p2Income.total,
            count: p2Expenses.count
        },
        difference: expenseDiff,
        absDifference: absDiff,
        percentageChange: pctChange,
        direction
    };
}

/**
 * 9. GET SAVINGS GOALS DATA
 */
async function getSavingsGoalsData(userId) {
    const goals = await SavingsGoal.find({ user: userId }).sort({ createdAt: -1 });
    const balanceData = await getBalance(userId, { period: 'all_time' });
    const currentSavings = balanceData.savings;

    return goals.map(g => {
        const remaining = Math.max(0, g.targetAmount - currentSavings);
        const progress = g.targetAmount > 0 ? Math.min(100, Math.round((currentSavings / g.targetAmount) * 100)) : 0;
        return {
            id: g._id,
            goalName: g.goalName,
            targetAmount: g.targetAmount,
            targetDate: g.targetDate,
            currentSavings,
            remainingAmount: remaining,
            progressPercentage: progress,
            isAchieved: currentSavings >= g.targetAmount
        };
    });
}

/**
 * 10. GET BILLS DATA
 */
async function getBillsData(userId) {
    const bills = await Bill.find({ user: userId }).sort({ dueDate: 1 });
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return bills.map(b => {
        let daysRemaining = null;
        if (b.dueDate) {
            const due = new Date(b.dueDate);
            due.setHours(0, 0, 0, 0);
            daysRemaining = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        }
        return {
            id: b._id,
            billName: b.billName,
            amount: b.amount,
            category: b.category,
            dueDate: b.dueDate,
            isPaid: b.isPaid,
            daysRemaining
        };
    });
}

/**
 * 11. GET LOANS DATA
 */
async function getLoansData(userId) {
    const loans = await Loan.find({ user: userId });
    let totalReceive = 0;
    let totalOwe = 0;

    const list = loans.map(l => {
        const repaid = (l.repayments || []).reduce((sum, r) => sum + r.amount, 0);
        const remaining = Math.max(0, l.amount - repaid);
        if (l.type === 'LENT') totalReceive += remaining;
        else totalOwe += remaining;

        return {
            id: l._id,
            personName: l.personName,
            type: l.type,
            originalAmount: l.amount,
            remainingAmount: remaining,
            status: l.status,
            dueDate: l.dueDate
        };
    });

    return {
        totalReceive,
        totalOwe,
        loans: list
    };
}

module.exports = {
    resolveDateRange,
    getMaxTransaction,
    getMinTransaction,
    getTotalExpenses,
    getTotalIncome,
    getBalance,
    getCategoryBreakdown,
    getRecentTransactions,
    comparePeriods,
    getSavingsGoalsData,
    getBillsData,
    getLoansData
};
