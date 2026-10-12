const express = require('express');
const router = express.Router();
const Bill = require('../models/Bill');
const { protect } = require('../middleware/authMiddleware');

function calculateBillStatus(bill) {
    if (bill.isPaid) {
        return {
            daysRemaining: 0,
            statusText: 'Paid'
        };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const due = new Date(bill.dueDate);
    due.setHours(0, 0, 0, 0);

    const diffTime = due.getTime() - today.getTime();
    const daysRemaining = Math.round(diffTime / (1000 * 60 * 60 * 24));

    let statusText = '';
    if (daysRemaining < 0) {
        statusText = `Overdue by ${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) === 1 ? '' : 's'}`;
    } else if (daysRemaining === 0) {
        statusText = 'Due Today';
    } else if (daysRemaining === 1) {
        statusText = 'Due Tomorrow';
    } else {
        statusText = `Due in ${daysRemaining} days`;
    }

    return { daysRemaining, statusText };
}

// GET /api/bills - Fetch all bills for the authenticated user
router.get('/', protect, async (req, res) => {
    try {
        const bills = await Bill.find({ user: req.user._id }).sort({ dueDate: 1 });

        const data = bills.map(b => {
            const { daysRemaining, statusText } = calculateBillStatus(b);
            return {
                id: b._id,
                _id: b._id,
                billName: b.billName,
                amount: b.amount,
                category: b.category,
                dueDate: b.dueDate,
                recurringFrequency: b.recurringFrequency,
                reminderDays: b.reminderDays,
                notes: b.notes || '',
                isPaid: b.isPaid,
                lastPaidDate: b.lastPaidDate,
                daysRemaining,
                statusText,
                createdAt: b.createdAt
            };
        });

        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/bills - Create new recurring bill
router.post('/', protect, async (req, res) => {
    try {
        const { billName, amount, category, dueDate, recurringFrequency, reminderDays, notes } = req.body;

        if (!billName || !amount || !dueDate) {
            return res.status(400).json({
                success: false,
                message: 'Please provide billName, amount, and dueDate.'
            });
        }

        const bill = await Bill.create({
            user: req.user._id,
            billName: billName.trim(),
            amount: parseFloat(amount),
            category: category || 'Rent',
            dueDate,
            recurringFrequency: recurringFrequency || 'MONTHLY',
            reminderDays: reminderDays !== undefined ? parseInt(reminderDays, 10) : 3,
            notes: notes ? notes.trim() : ''
        });

        const { daysRemaining, statusText } = calculateBillStatus(bill);

        res.status(201).json({
            success: true,
            data: {
                id: bill._id,
                _id: bill._id,
                billName: bill.billName,
                amount: bill.amount,
                category: bill.category,
                dueDate: bill.dueDate,
                recurringFrequency: bill.recurringFrequency,
                reminderDays: bill.reminderDays,
                notes: bill.notes,
                isPaid: bill.isPaid,
                daysRemaining,
                statusText
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/bills/:id/pay & PUT /api/bills/:id/pay - Mark bill as paid
const handleMarkPaid = async (req, res) => {
    try {
        const bill = await Bill.findOne({ _id: req.params.id, user: req.user._id });
        if (!bill) {
            return res.status(404).json({ success: false, message: 'Bill not found' });
        }

        bill.isPaid = true;
        bill.lastPaidDate = new Date();
        await bill.save();

        const { daysRemaining, statusText } = calculateBillStatus(bill);

        res.json({
            success: true,
            message: 'Bill marked as paid',
            data: {
                id: bill._id,
                _id: bill._id,
                billName: bill.billName,
                amount: bill.amount,
                isPaid: bill.isPaid,
                lastPaidDate: bill.lastPaidDate,
                daysRemaining,
                statusText
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

router.post('/:id/pay', protect, handleMarkPaid);
router.put('/:id/pay', protect, handleMarkPaid);

// DELETE /api/bills/:id - Delete bill
router.delete('/:id', protect, async (req, res) => {
    try {
        const bill = await Bill.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        if (!bill) {
            return res.status(404).json({ success: false, message: 'Bill not found' });
        }

        res.json({ success: true, message: 'Bill deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
