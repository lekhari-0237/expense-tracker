const express = require('express');
const router = express.Router();
const Income = require('../models/Income');
const { protect } = require('../middleware/authMiddleware');

// Get income for specific year and month
router.get('/:year/:month', protect, async (req, res) => {
    try {
        const { year, month } = req.params;
        const income = await Income.findOne({
            user: req.user._id,
            year: parseInt(year, 10),
            month: parseInt(month, 10)
        });

        res.json({
            success: true,
            data: income || null
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Set or update monthly income
router.post('/', protect, async (req, res) => {
    try {
        const { month, year, amount } = req.body;

        if (!month || !year || amount === undefined) {
            return res.status(400).json({ success: false, message: 'Please provide month, year, and amount' });
        }

        const income = await Income.findOneAndUpdate(
            { user: req.user._id, month: parseInt(month, 10), year: parseInt(year, 10) },
            { amount: parseFloat(amount) },
            { new: true, upsert: true }
        );

        res.json({
            success: true,
            data: income,
            message: 'Income saved successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get all income history
router.get('/', protect, async (req, res) => {
    try {
        const incomes = await Income.find({ user: req.user._id }).sort({ year: -1, month: -1 });
        res.json({ success: true, data: incomes });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
