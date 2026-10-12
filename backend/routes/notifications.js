const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const Bill = require('../models/Bill');
const Loan = require('../models/Loan');
const { protect } = require('../middleware/authMiddleware');

// Helper to sync dynamic alerts from Bills and Loans
async function syncDynamicNotifications(userId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Sync Bill Alerts
    const unpaidBills = await Bill.find({ user: userId, isPaid: false });
    for (const bill of unpaidBills) {
        if (!bill.dueDate) continue;
        const due = new Date(bill.dueDate);
        due.setHours(0, 0, 0, 0);
        const daysDiff = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        let priority = null;
        let title = '';
        let message = '';

        if (daysDiff < 0) {
            priority = 'OVERDUE';
            title = `Bill Overdue: ${bill.billName}`;
            message = `Your bill payment of ₹${bill.amount?.toLocaleString()} for ${bill.billName} was due on ${bill.dueDate} (overdue by ${Math.abs(daysDiff)} days).`;
        } else if (daysDiff === 0) {
            priority = 'DUE_TODAY';
            title = `Bill Due Today: ${bill.billName}`;
            message = `Reminder: ₹${bill.amount?.toLocaleString()} for ${bill.billName} is due today!`;
        } else if (daysDiff <= (bill.reminderDays || 3)) {
            priority = 'WARNING';
            title = `Upcoming Bill: ${bill.billName}`;
            message = `Reminder: ₹${bill.amount?.toLocaleString()} for ${bill.billName} is due in ${daysDiff} day${daysDiff === 1 ? '' : 's'} on ${bill.dueDate}.`;
        }

        if (priority) {
            const refKey = `bill_${bill._id}_${bill.dueDate}_${priority}`;
            const existing = await Notification.findOne({ user: userId, referenceId: refKey });
            if (!existing) {
                await Notification.create({
                    user: userId,
                    title,
                    message,
                    priority,
                    category: 'BILL',
                    referenceId: refKey,
                    isRead: false
                });
            }
        }
    }

    // 2. Sync Loan Alerts
    const pendingLoans = await Loan.find({
        user: userId,
        status: { $ne: 'FULLY_PAID' },
        dueDate: { $ne: null }
    });

    for (const loan of pendingLoans) {
        const totalRepaid = (loan.repayments || []).reduce((s, r) => s + (r.amount || 0), 0);
        const remaining = Math.max(0, loan.amount - totalRepaid);
        if (remaining <= 0) continue;

        const due = new Date(loan.dueDate);
        due.setHours(0, 0, 0, 0);
        const daysDiff = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        let priority = null;
        let title = '';
        let message = '';

        const typeLabel = loan.type === 'BORROWED' ? 'Debt repayment' : 'Loan return';

        if (daysDiff < 0) {
            priority = 'OVERDUE';
            title = `${typeLabel} Overdue: ${loan.personName}`;
            message = `${loan.type === 'BORROWED' ? 'You owe' : `${loan.personName} owes you`} ₹${remaining?.toLocaleString()}, which was due on ${loan.dueDate}.`;
        } else if (daysDiff === 0) {
            priority = 'DUE_TODAY';
            title = `${typeLabel} Due Today: ${loan.personName}`;
            message = `₹${remaining?.toLocaleString()} with ${loan.personName} is due today.`;
        } else if (daysDiff <= (loan.reminderDays || 3)) {
            priority = 'WARNING';
            title = `Upcoming ${typeLabel}: ${loan.personName}`;
            message = `₹${remaining?.toLocaleString()} with ${loan.personName} is due in ${daysDiff} day${daysDiff === 1 ? '' : 's'} on ${loan.dueDate}.`;
        }

        if (priority) {
            const refKey = `loan_${loan._id}_${loan.dueDate}_${priority}`;
            const existing = await Notification.findOne({ user: userId, referenceId: refKey });
            if (!existing) {
                await Notification.create({
                    user: userId,
                    title,
                    message,
                    priority,
                    category: 'LOAN',
                    referenceId: refKey,
                    isRead: false
                });
            }
        }
    }
}

// GET /api/notifications - Fetch all user notifications
router.get('/', protect, async (req, res) => {
    try {
        await syncDynamicNotifications(req.user._id);

        const notifications = await Notification.find({ user: req.user._id })
            .sort({ isRead: 1, createdAt: -1 })
            .limit(50);

        const data = notifications.map(n => ({
            id: n._id,
            _id: n._id,
            title: n.title,
            message: n.message,
            priority: n.priority,
            isRead: n.isRead,
            category: n.category,
            createdAt: n.createdAt
        }));

        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/notifications/:id/read - Mark notification as read
router.put('/:id/read', protect, async (req, res) => {
    try {
        const notif = await Notification.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            { isRead: true },
            { new: true }
        );

        if (!notif) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }

        res.json({ success: true, data: { id: notif._id, isRead: notif.isRead } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/notifications/read-all - Mark all notifications as read
router.put('/read-all', protect, async (req, res) => {
    try {
        await Notification.updateMany({ user: req.user._id }, { isRead: true });
        res.json({ success: true, message: 'All notifications marked as read' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
