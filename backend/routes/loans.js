const express = require('express');
const router = express.Router();
const Loan = require('../models/Loan');
const { protect } = require('../middleware/authMiddleware');

function calculateLoanMetrics(loan) {
    const totalRepaid = (loan.repayments || []).reduce((sum, r) => sum + (r.amount || 0), 0);
    const remainingAmount = Math.max(0, Math.round((loan.amount - totalRepaid) * 100) / 100);

    let calculatedStatus = 'PENDING';
    if (remainingAmount <= 0) {
        calculatedStatus = 'FULLY_PAID';
    } else if (totalRepaid > 0) {
        calculatedStatus = 'PARTIALLY_PAID';
    }

    let daysRemaining = null;
    let statusText = calculatedStatus === 'PARTIALLY_PAID' ? 'Partially Paid' : 'Pending';

    if (calculatedStatus === 'FULLY_PAID') {
        statusText = 'Fully Paid';
        daysRemaining = 0;
    } else if (loan.dueDate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const due = new Date(loan.dueDate);
        due.setHours(0, 0, 0, 0);

        const diffTime = due.getTime() - today.getTime();
        daysRemaining = Math.round(diffTime / (1000 * 60 * 60 * 24));

        if (daysRemaining < 0) {
            statusText = `Overdue by ${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) === 1 ? '' : 's'}`;
        } else if (daysRemaining === 0) {
            statusText = 'Due Today';
        } else if (daysRemaining === 1) {
            statusText = 'Due Tomorrow';
        } else {
            statusText = `Due in ${daysRemaining} days`;
        }
    }

    return {
        totalRepaid,
        remainingAmount,
        status: calculatedStatus,
        daysRemaining,
        statusText
    };
}

// GET /api/loans/totals - Summary totals for lent and borrowed
router.get('/totals', protect, async (req, res) => {
    try {
        const loans = await Loan.find({ user: req.user._id });

        let totalReceive = 0;
        let totalOwe = 0;

        loans.forEach(loan => {
            const { remainingAmount } = calculateLoanMetrics(loan);
            if (loan.type === 'LENT') {
                totalReceive += remainingAmount;
            } else if (loan.type === 'BORROWED') {
                totalOwe += remainingAmount;
            }
        });

        res.json({
            success: true,
            data: {
                totalReceive: Math.round(totalReceive * 100) / 100,
                totalOwe: Math.round(totalOwe * 100) / 100
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/loans - Fetch all loans for user
router.get('/', protect, async (req, res) => {
    try {
        const loans = await Loan.find({ user: req.user._id }).sort({ createdAt: -1 });

        const data = loans.map(loan => {
            const metrics = calculateLoanMetrics(loan);
            return {
                id: loan._id,
                _id: loan._id,
                personName: loan.personName,
                type: loan.type,
                amount: loan.amount,
                dateGivenTaken: loan.dateGivenTaken,
                dueDate: loan.dueDate,
                reminderDays: loan.reminderDays,
                notes: loan.notes || '',
                repayments: (loan.repayments || []).map(r => ({
                    id: r._id,
                    _id: r._id,
                    amount: r.amount,
                    repaymentDate: r.repaymentDate,
                    notes: r.notes || ''
                })),
                totalRepaid: metrics.totalRepaid,
                remainingAmount: metrics.remainingAmount,
                status: metrics.status,
                daysRemaining: metrics.daysRemaining,
                statusText: metrics.statusText,
                createdAt: loan.createdAt
            };
        });

        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/loans - Create a new loan record
router.post('/', protect, async (req, res) => {
    try {
        const { personName, type, amount, dateGivenTaken, dueDate, reminderDays, notes } = req.body;

        if (!personName || !type || !amount || !dateGivenTaken) {
            return res.status(400).json({
                success: false,
                message: 'Please provide personName, type, amount, and dateGivenTaken.'
            });
        }
        // Invalid enums/values must not reach Mongoose and surface as a 500
        if (!['LENT', 'BORROWED'].includes(String(type).toUpperCase())) {
            return res.status(400).json({ success: false, message: 'Type must be LENT or BORROWED.' });
        }
        const loanAmount = parseFloat(amount);
        if (!isFinite(loanAmount) || loanAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Amount must be a positive number.' });
        }
        if (isNaN(new Date(dateGivenTaken).getTime())) {
            return res.status(400).json({ success: false, message: 'dateGivenTaken must be a valid date (YYYY-MM-DD).' });
        }

        const loan = await Loan.create({
            user: req.user._id,
            personName: personName.trim(),
            type: String(type).toUpperCase(),
            amount: loanAmount,
            dateGivenTaken,
            dueDate: dueDate || null,
            reminderDays: reminderDays !== undefined ? parseInt(reminderDays, 10) : 3,
            notes: notes ? notes.trim() : '',
            repayments: []
        });

        const metrics = calculateLoanMetrics(loan);

        res.status(201).json({
            success: true,
            data: {
                id: loan._id,
                _id: loan._id,
                personName: loan.personName,
                type: loan.type,
                amount: loan.amount,
                dateGivenTaken: loan.dateGivenTaken,
                dueDate: loan.dueDate,
                reminderDays: loan.reminderDays,
                notes: loan.notes,
                repayments: [],
                remainingAmount: metrics.remainingAmount,
                status: metrics.status,
                statusText: metrics.statusText
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/loans/:id/repayments - Record repayment for a loan
router.post('/:id/repayments', protect, async (req, res) => {
    try {
        const { amount, repaymentDate, notes } = req.body;

        if (!amount || parseFloat(amount) <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid positive repayment amount.'
            });
        }

        const loan = await Loan.findOne({ _id: req.params.id, user: req.user._id });
        if (!loan) {
            return res.status(404).json({ success: false, message: 'Loan record not found' });
        }

        const currentMetrics = calculateLoanMetrics(loan);
        const repayVal = parseFloat(amount);

        if (repayVal > currentMetrics.remainingAmount) {
            return res.status(400).json({
                success: false,
                message: `Repayment amount cannot exceed the remaining balance of ₹${currentMetrics.remainingAmount}`
            });
        }

        loan.repayments.push({
            amount: repayVal,
            repaymentDate: repaymentDate || new Date().toISOString().split('T')[0],
            notes: notes ? notes.trim() : ''
        });

        const updatedMetrics = calculateLoanMetrics(loan);
        loan.status = updatedMetrics.status;
        await loan.save();

        res.json({
            success: true,
            message: 'Repayment recorded successfully',
            data: {
                id: loan._id,
                remainingAmount: updatedMetrics.remainingAmount,
                status: updatedMetrics.status,
                statusText: updatedMetrics.statusText,
                repayments: loan.repayments
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE /api/loans/:id - Delete a loan record
router.delete('/:id', protect, async (req, res) => {
    try {
        const loan = await Loan.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        if (!loan) {
            return res.status(404).json({ success: false, message: 'Loan record not found' });
        }

        res.json({ success: true, message: 'Loan record deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
