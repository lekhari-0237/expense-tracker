const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Income = require('../models/Income');
const SavingsGoal = require('../models/SavingsGoal');
const Bill = require('../models/Bill');
const Loan = require('../models/Loan');
const {
    resolvePeriod,
    startOfMonthOffset,
    endOfMonthOffset,
    getZoneParts,
    daysElapsedThisMonth,
    daysInMonthOffset,
    formatLongDate,
    formatShortDate,
    formatDate,
    MONTH_NAMES,
    MONTH_SHORT
} = require('../utils/dateUtil');

/**
 * Resolve a period name (or explicit range) to { startDate, endDate, label }
 * using timezone-aware boundaries (APP_TIMEZONE, default Asia/Kolkata).
 */
function resolveDateRange(periodStr, customStart, customEnd) {
    if (customStart && customEnd) {
        // Date instances are already-resolved timezone-aware boundaries and pass through
        // untouched; strings are date-only values extended to end of day.
        const start = new Date(customStart);
        const end = customEnd instanceof Date ? new Date(customEnd.getTime()) : new Date(new Date(customEnd).setHours(23, 59, 59, 999));
        return resolvePeriod('custom', {
            startDate: start,
            endDate: end,
            label: `${formatDate(start)} to ${formatDate(end)}`
        });
    }
    return resolvePeriod(periodStr);
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

function serializeTransaction(tx) {
    return {
        id: tx._id,
        amount: tx.amount,
        category: tx.category,
        description: tx.description || tx.merchant || tx.category,
        merchant: tx.merchant || '',
        date: tx.date ? formatDate(tx.date) : '',
        formattedDate: tx.date ? formatLongDate(tx.date) : '',
        type: (tx.type || 'EXPENSE').toUpperCase(),
        source: tx.source || 'manual',
        paymentMethod: tx.paymentMethod || '',
        notes: tx.notes || ''
    };
}

/**
 * 1. GET MAXIMUM TRANSACTION
 * Returns the highest transaction(s), optionally ranked (rank 1 = highest, 2 = second highest)
 */
async function getMaxTransaction(userId, options = {}) {
    const { rank = 1, type = 'EXPENSE', period, category, startDate, endDate } = options;
    const dateRange = period ? resolveDateRange(period, startDate, endDate) : (startDate && endDate ? resolveDateRange('custom', startDate, endDate) : { startDate: null, endDate: null, label: 'All Time' });

    const query = buildQuery(userId, {
        type,
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

    return { found: true, rank, periodLabel: dateRange.label, transaction: serializeTransaction(transactions[0]) };
}

/**
 * 2. GET MINIMUM TRANSACTION
 */
async function getMinTransaction(userId, options = {}) {
    const { rank = 1, type = 'EXPENSE', period, category, startDate, endDate } = options;
    const dateRange = period ? resolveDateRange(period, startDate, endDate) : { startDate: null, endDate: null, label: 'All Time' };

    const query = buildQuery(userId, {
        type,
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

    return { found: true, rank, periodLabel: dateRange.label, transaction: serializeTransaction(transactions[0]) };
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
        const zParts = getZoneParts(dateRange.startDate);
        const monthNum = zParts.month;
        const yearNum = zParts.year;
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
    const { limit = 5, type, category, minAmount, maxAmount, search, period, startDate, endDate } = options;
    const dateRange = (startDate && endDate) ? resolveDateRange('custom', startDate, endDate) : (period ? resolveDateRange(period) : { startDate: null, endDate: null });

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
        .limit(Math.min(50, parseInt(limit, 10) || 5));

    return txns.map(serializeTransaction);
}

/**
 * 7b. GET MONTHLY SPENDING TREND (last N calendar months, including the current one)
 */
async function getMonthlyTrend(userId, monthCount = 6) {
    const n = Math.max(1, Math.min(24, parseInt(monthCount, 10) || 6));
    const rows = await Transaction.aggregate([
        {
            $match: {
                user: new mongoose.Types.ObjectId(userId),
                date: { $gte: startOfMonthOffset(-(n - 1)) }
            }
        },
        {
            $group: {
                _id: {
                    year: { $year: { date: '$date', timezone: process.env.APP_TIMEZONE || 'Asia/Kolkata' } },
                    month: { $month: { date: '$date', timezone: process.env.APP_TIMEZONE || 'Asia/Kolkata' } }
                },
                expenses: {
                    $sum: {
                        $cond: [
                            { $in: ['$type', ['EXPENSE', 'expense']] },
                            '$amount',
                            0
                        ]
                    }
                },
                income: {
                    $sum: {
                        $cond: [
                            { $in: ['$type', ['INCOME', 'income']] },
                            '$amount',
                            0
                        ]
                    }
                },
                count: { $sum: 1 }
            }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    const byKey = {};
    for (const r of rows) {
        byKey[`${r._id.year}-${r._id.month}`] = {
            year: r._id.year,
            month: r._id.month,
            expenses: Math.round(r.expenses * 100) / 100,
            income: Math.round(r.income * 100) / 100,
            count: r.count
        };
    }

    const months = [];
    for (let i = -(n - 1); i <= 0; i++) {
        const s = getZoneParts(startOfMonthOffset(i));
        const key = `${s.year}-${s.month}`;
        const data = byKey[key] || { expenses: 0, income: 0, count: 0 };
        months.push({
            label: `${MONTH_NAMES[s.month - 1][0].toUpperCase() + MONTH_NAMES[s.month - 1].slice(1)} ${s.year}`,
            shortLabel: `${MONTH_SHORT[s.month - 1]} ${String(s.year).slice(2)}`,
            year: s.year,
            month: s.month,
            expenses: data.expenses,
            income: data.income,
            count: data.count,
            isCurrent: i === 0
        });
    }
    return months;
}

/**
 * 7c. GET AVERAGE DAILY SPENDING for a period.
 * For the current month, divides by days elapsed so far; for complete
 * periods, divides by the number of days in the period.
 */
async function getDailyAverage(userId, options = {}) {
    const { period, startDate, endDate } = options;
    const hasCustomRange = !!(startDate && endDate);
    const effectivePeriod = hasCustomRange ? null : (period || 'current_month');
    const dateRange = resolveDateRange(effectivePeriod, startDate, endDate);
    const expenseData = await getTotalExpenses(userId, { period: effectivePeriod, startDate, endDate });

    let days;
    if (hasCustomRange) {
        days = Math.max(1, Math.round((dateRange.endDate.getTime() - dateRange.startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    } else if (effectivePeriod === 'current_month' || effectivePeriod === 'this_month') {
        days = daysElapsedThisMonth();
    } else if (effectivePeriod === 'today') {
        days = 1;
    } else if (effectivePeriod === 'yesterday') {
        days = 1;
    } else if (effectivePeriod === 'this_week' || effectivePeriod === 'last_7_days') {
        days = 7;
    } else if (effectivePeriod === 'last_week') {
        days = 7;
    } else if (effectivePeriod === 'last_30_days') {
        days = 30;
    } else if (effectivePeriod === 'previous_month' || effectivePeriod === 'last_month') {
        days = daysInMonthOffset(-1);
    } else if (dateRange.startDate && dateRange.endDate) {
        days = Math.max(1, Math.round((dateRange.endDate.getTime() - dateRange.startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    } else {
        // all_time / this_year: days from first transaction (fallback: days elapsed this year)
        const first = await Transaction.findOne({ user: userId, type: { $in: ['EXPENSE', 'expense'] } }).sort({ date: 1 });
        const from = first && first.date ? new Date(first.date) : dateRange.startDate;
        days = from ? Math.max(1, Math.round((Date.now() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1) : 1;
    }

    const average = days > 0 ? Math.round((expenseData.total / days) * 100) / 100 : 0;
    return {
        total: expenseData.total,
        count: expenseData.count,
        days,
        average,
        periodLabel: dateRange.label
    };
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
    getMonthlyTrend,
    getDailyAverage,
    comparePeriods,
    getSavingsGoalsData,
    getBillsData,
    getLoansData
};
