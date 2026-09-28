const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const Income = require('../models/Income');
const { protect } = require('../middleware/authMiddleware');

// Get dashboard summary
router.get('/summary', protect, async (req, res) => {
    try {
        const transactions = await Transaction.find({ user: req.user._id });

        let totalIncome = 0;
        let totalExpenses = 0;

        transactions.forEach(t => {
            if (t.type === 'income' || t.type === 'INCOME') {
                totalIncome += t.amount;
            } else if (t.type === 'expense' || t.type === 'EXPENSE') {
                totalExpenses += t.amount;
            }
        });

        // If no income transactions, also check for monthly income budget/salary
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

        res.json({
            success: true,
            data: {
                totalIncome,
                totalExpenses,
                balance,
                savings,
                savingsPercentage,
                transactionCount: transactions.length
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get category summary
router.get('/category-summary', protect, async (req, res) => {
    try {
        const transactions = await Transaction.find({ user: req.user._id });
        const expensesByCategory = {};

        transactions.forEach(t => {
            if (t.type === 'expense' || t.type === 'EXPENSE') {
                expensesByCategory[t.category] = (expensesByCategory[t.category] || 0) + t.amount;
            }
        });

        const categoriesArray = Object.keys(expensesByCategory).map(cat => ({
            category: cat,
            amount: expensesByCategory[cat],
            percentage: 0
        }));

        res.json({ success: true, data: categoriesArray });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get trend data
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
