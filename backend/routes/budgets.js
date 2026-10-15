const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const budgetService = require('../services/budgetService');
const { MONTH_NAMES } = require('../utils/dateUtil');

function fail(res, error, fallbackStatus = 500) {
    console.error('[Budget API]', error.message || error);
    res.status(error.status || fallbackStatus).json({ success: false, message: error.message });
}

// GET /api/budgets — current month's overall + category budgets with live spending.
// Reading the status is also what evaluates the thresholds, so a budget that has
// just crossed its alert limit notifies once (alertTriggered + referenceId dedupe).
router.get('/', protect, async (req, res) => {
    try {
        const status = await budgetService.getBudgetStatus(req.user._id);
        const monthLabel = `${MONTH_NAMES[status.month - 1][0].toUpperCase()}${MONTH_NAMES[status.month - 1].slice(1)} ${status.year}`;
        res.json({ success: true, data: { ...status, monthLabel } });
    } catch (error) {
        fail(res, error);
    }
});

// POST /api/budgets — create or update this month's budget for a category
// (category omitted or empty = overall monthly budget).
router.post('/', protect, async (req, res) => {
    try {
        const { category, amount, period, alertThreshold } = req.body || {};
        const { budget, created, month, year } = await budgetService.setBudget(req.user._id, {
            category, amount, period, alertThreshold
        });
        const status = await budgetService.getBudgetStatus(req.user._id);
        const row = [status.overall, ...status.categoryStatuses].find(s => s && String(s.id) === String(budget._id));

        res.status(created ? 201 : 200).json({
            success: true,
            message: created
                ? `Budget set: ₹${budget.amount.toLocaleString('en-IN')}${budget.category ? ` for ${budget.category}` : ' overall'} for ${month}/${year}`
                : `Budget updated: ₹${budget.amount.toLocaleString('en-IN')}${budget.category ? ` for ${budget.category}` : ' overall'}`,
            data: { budget: row || null, status }
        });
    } catch (error) {
        fail(res, error, 400);
    }
});

// PUT /api/budgets/:id — edit the limit, alert threshold or period of one budget.
router.put('/:id', protect, async (req, res) => {
    try {
        const { amount, alertThreshold, period } = req.body || {};
        const updated = await budgetService.updateBudget(req.user._id, req.params.id, {
            amount, alertThreshold, period
        });
        const status = await budgetService.getBudgetStatus(req.user._id);
        res.json({
            success: true,
            message: 'Budget updated',
            data: { budget: updated, status }
        });
    } catch (error) {
        fail(res, error, 400);
    }
});

// DELETE /api/budgets/:id
router.delete('/:id', protect, async (req, res) => {
    try {
        const result = await budgetService.removeBudget(req.user._id, req.params.id);
        const status = await budgetService.getBudgetStatus(req.user._id);
        res.json({ success: true, message: 'Budget removed', data: { ...result, status } });
    } catch (error) {
        fail(res, error, 400);
    }
});

// GET /api/budgets/spending — month-to-date spending by category (for the picker/summary).
router.get('/spending', protect, async (req, res) => {
    try {
        const { month, year } = budgetService.currentMonthYear();
        const spending = await budgetService.getMonthSpending(req.user._id, { month, year });
        res.json({
            success: true,
            data: {
                byCategory: spending.byCategory,
                total: spending.total,
                month,
                year,
                rangeStart: spending.startDate,
                rangeEnd: spending.endDate
            }
        });
    } catch (error) {
        fail(res, error);
    }
});

module.exports = router;
