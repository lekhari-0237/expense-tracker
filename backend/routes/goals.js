const express = require('express');
const router = express.Router();
const SavingsGoal = require('../models/SavingsGoal');
const Transaction = require('../models/Transaction');
const Income = require('../models/Income');
const { protect } = require('../middleware/authMiddleware');

// Helper to calculate total user savings from real transactions/income
async function calculateUserSavings(userId) {
    const transactions = await Transaction.find({ user: userId });
    let totalIncome = 0;
    let totalExpenses = 0;

    transactions.forEach(t => {
        if (t.type === 'INCOME' || t.type === 'income') {
            totalIncome += t.amount;
        } else if (t.type === 'EXPENSE' || t.type === 'expense') {
            totalExpenses += t.amount;
        }
    });

    const now = new Date();
    const monthlyIncomeRecord = await Income.findOne({
        user: userId,
        month: now.getMonth() + 1,
        year: now.getFullYear()
    });

    if (monthlyIncomeRecord && monthlyIncomeRecord.amount > 0 && totalIncome === 0) {
        totalIncome = monthlyIncomeRecord.amount;
    }

    const netSavings = totalIncome - totalExpenses;
    return netSavings > 0 ? netSavings : 0;
}

// GET /api/goals - Fetch all goals with live progress calculations
router.get('/', protect, async (req, res) => {
    try {
        const goals = await SavingsGoal.find({ user: req.user._id }).sort({ createdAt: -1 });
        const currentSavings = await calculateUserSavings(req.user._id);

        const data = goals.map(g => {
            const targetAmount = g.targetAmount || 0;
            const remainingAmount = Math.max(0, targetAmount - currentSavings);
            const progressPercentage = targetAmount > 0
                ? Math.min(100, Math.round((currentSavings / targetAmount) * 100))
                : 0;
            const isAchieved = currentSavings >= targetAmount && targetAmount > 0;

            return {
                id: g._id,
                _id: g._id,
                goalName: g.goalName,
                targetAmount: targetAmount,
                targetDate: g.targetDate,
                description: g.description || '',
                currentSavings: currentSavings,
                remainingAmount: remainingAmount,
                progressPercentage: progressPercentage,
                isAchieved: isAchieved,
                createdAt: g.createdAt
            };
        });

        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/goals - Create a new savings goal
router.post('/', protect, async (req, res) => {
    try {
        const { goalName, targetAmount, targetDate, description } = req.body;

        if (!goalName || !targetAmount || !targetDate) {
            return res.status(400).json({
                success: false,
                message: 'Please provide goalName, targetAmount, and targetDate.'
            });
        }

        const goal = await SavingsGoal.create({
            user: req.user._id,
            goalName: goalName.trim(),
            targetAmount: parseFloat(targetAmount),
            targetDate,
            description: description ? description.trim() : ''
        });

        res.status(201).json({
            success: true,
            data: {
                id: goal._id,
                _id: goal._id,
                goalName: goal.goalName,
                targetAmount: goal.targetAmount,
                targetDate: goal.targetDate,
                description: goal.description,
                isAchieved: false
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE /api/goals/:id - Delete a savings goal
router.delete('/:id', protect, async (req, res) => {
    try {
        const goal = await SavingsGoal.findOneAndDelete({
            _id: req.params.id,
            user: req.user._id
        });

        if (!goal) {
            return res.status(404).json({ success: false, message: 'Savings goal not found' });
        }

        res.json({ success: true, message: 'Savings goal deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
