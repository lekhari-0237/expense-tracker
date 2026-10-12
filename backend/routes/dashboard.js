const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const Income = require('../models/Income');
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');

// Helper to calculate date range based on period filter
function getDateRange(period) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed

    let startDate = null;
    let endDate = new Date(now);

    switch (period) {
        case 'previous_month':
        case 'last_month':
            startDate = new Date(currentYear, currentMonth - 1, 1);
            endDate = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);
            break;
        case 'this_week':
            startDate = new Date(now);
            startDate.setDate(now.getDate() - now.getDay());
            startDate.setHours(0, 0, 0, 0);
            break;
        case 'last_7_days':
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 7);
            startDate.setHours(0, 0, 0, 0);
            break;
        case 'last_30_days':
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 30);
            startDate.setHours(0, 0, 0, 0);
            break;
        case 'current_year':
            startDate = new Date(currentYear, 0, 1);
            endDate = new Date(currentYear, 11, 31, 23, 59, 59, 999);
            break;
        case 'all_time':
            startDate = new Date(2000, 0, 1);
            break;
        case 'current_month':
        case 'this_month':
        default:
            startDate = new Date(currentYear, currentMonth, 1);
            endDate = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);
            break;
    }

    return { startDate, endDate };
}

// GET /api/dashboard/summary - Comprehensive dashboard KPI summary with spending comparison
router.get('/summary', protect, async (req, res) => {
    try {
        const period = req.query.period || 'current_month';
        const { startDate, endDate } = getDateRange(period);

        // Fetch transactions for requested period
        const dateQuery = { user: req.user._id };
        if (startDate && endDate) {
            dateQuery.date = { $gte: startDate, $lte: endDate };
        }

        const transactions = await Transaction.find(dateQuery);
        const user = await User.findById(req.user._id);

        let totalIncome = 0;
        let totalExpenses = 0;

        transactions.forEach(t => {
            if (t.type === 'income' || t.type === 'INCOME') {
                totalIncome += t.amount;
            } else if (t.type === 'expense' || t.type === 'EXPENSE') {
                totalExpenses += t.amount;
            }
        });

        // Fixed income fallback for current month if no income transactions
        const now = new Date();
        const monthlyIncomeRecord = await Income.findOne({
            user: req.user._id,
            month: now.getMonth() + 1,
            year: now.getFullYear()
        });

        if (monthlyIncomeRecord && monthlyIncomeRecord.amount > 0 && totalIncome === 0) {
            totalIncome = monthlyIncomeRecord.amount;
        }

        const balance = totalIncome - totalExpenses;
        const savings = balance > 0 ? balance : 0;
        const savingsPercentage = totalIncome > 0 ? Math.round((savings / totalIncome) * 100) : 0;

        // Calculate Month-over-Month Comparison (This Month vs Last Month)
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

        const thisMonthTxns = await Transaction.find({
            user: req.user._id,
            type: { $in: ['EXPENSE', 'expense'] },
            date: { $gte: currentMonthStart, $lte: currentMonthEnd }
        });

        const lastMonthTxns = await Transaction.find({
            user: req.user._id,
            type: { $in: ['EXPENSE', 'expense'] },
            date: { $gte: lastMonthStart, $lte: lastMonthEnd }
        });

        const thisMonthExpense = thisMonthTxns.reduce((sum, t) => sum + t.amount, 0);
        const lastMonthExpense = lastMonthTxns.reduce((sum, t) => sum + t.amount, 0);

        const diff = thisMonthExpense - lastMonthExpense;
        const pctChange = lastMonthExpense > 0 ? Math.round((Math.abs(diff) / lastMonthExpense) * 100) : 0;

        const bankTxnCount = await Transaction.countDocuments({
            user: req.user._id,
            source: 'mock_bank'
        });

        res.json({
            success: true,
            data: {
                totalIncome,
                totalExpenses,
                balance,
                savings,
                savingsPercentage,
                transactionCount: transactions.length,
                comparison: {
                    thisMonthExpense,
                    lastMonthExpense,
                    difference: diff,
                    percentageChange: pctChange,
                    direction: diff > 0 ? 'increased' : (diff < 0 ? 'decreased' : 'same')
                },
                bankInfo: {
                    connected: !!user?.bankConnected,
                    lastSynced: user?.bankLastSynced || null,
                    bankTransactionsCount: bankTxnCount
                }
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/dashboard/category-summary - Category analytics with counts, averages, and percentages
router.get('/category-summary', protect, async (req, res) => {
    try {
        const period = req.query.period || 'current_month';
        const { startDate, endDate } = getDateRange(period);

        const dateQuery = {
            user: req.user._id,
            type: { $in: ['EXPENSE', 'expense'] }
        };

        if (startDate && endDate) {
            dateQuery.date = { $gte: startDate, $lte: endDate };
        }

        const transactions = await Transaction.find(dateQuery).sort({ date: -1 });

        const categoryMap = {};
        let totalExpenseSum = 0;

        transactions.forEach(t => {
            totalExpenseSum += t.amount;
            const cat = t.category || 'Other';

            if (!categoryMap[cat]) {
                categoryMap[cat] = {
                    category: cat,
                    amount: 0,
                    transactionCount: 0,
                    highestAmount: 0,
                    highestDescription: '',
                    transactions: []
                };
            }

            categoryMap[cat].amount += t.amount;
            categoryMap[cat].transactionCount += 1;

            if (t.amount > categoryMap[cat].highestAmount) {
                categoryMap[cat].highestAmount = t.amount;
                categoryMap[cat].highestDescription = t.description || cat;
            }

            if (categoryMap[cat].transactions.length < 5) {
                categoryMap[cat].transactions.push({
                    id: t._id,
                    amount: t.amount,
                    description: t.description || cat,
                    date: t.date.toISOString().split('T')[0],
                    source: t.source || 'manual'
                });
            }
        });

        const categoriesArray = Object.values(categoryMap).map(c => ({
            category: c.category,
            amount: Math.round(c.amount * 100) / 100,
            transactionCount: c.transactionCount,
            averageAmount: Math.round((c.amount / (c.transactionCount || 1)) * 100) / 100,
            highestAmount: c.highestAmount,
            highestDescription: c.highestDescription,
            percentage: totalExpenseSum > 0 ? Math.round((c.amount / totalExpenseSum) * 100) : 0,
            transactions: c.transactions
        }));

        // Sort descending by amount
        categoriesArray.sort((a, b) => b.amount - a.amount);

        res.json({
            success: true,
            data: categoriesArray,
            totalExpenses: totalExpenseSum
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/dashboard/trend - Monthly trend data
router.get('/trend', protect, async (req, res) => {
    try {
        const transactions = await Transaction.find({ user: req.user._id });
        
        const monthlyData = {};
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        
        transactions.forEach(t => {
            const d = new Date(t.date);
            const key = `${monthNames[d.getMonth()]}`;
            if (!monthlyData[key]) {
                monthlyData[key] = { month: key, income: 0, expense: 0, sortKey: d.getFullYear() * 100 + d.getMonth() };
            }
            if (t.type === 'income' || t.type === 'INCOME') {
                monthlyData[key].income += t.amount;
            } else {
                monthlyData[key].expense += t.amount;
            }
        });

        const trendArray = Object.values(monthlyData).sort((a, b) => a.sortKey - b.sortKey);
        trendArray.forEach(item => delete item.sortKey);

        res.json({ success: true, data: trendArray });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
