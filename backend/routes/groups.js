const express = require('express');
const router = express.Router();
const Group = require('../models/Group');
const { protect } = require('../middleware/authMiddleware');

function formatGroupResponse(group) {
    return {
        id: group._id,
        _id: group._id,
        groupName: group.groupName,
        memberNames: group.memberNames || [],
        expenses: (group.expenses || []).map(e => ({
            id: e._id,
            _id: e._id,
            description: e.description,
            totalAmount: e.totalAmount,
            paidByName: e.paidByName,
            date: e.date,
            members: e.members || [],
            splits: e.splits || [],
            createdAt: e.createdAt
        })),
        createdAt: group.createdAt
    };
}

// GET /api/groups - Get all shared groups for user
router.get('/', protect, async (req, res) => {
    try {
        const groups = await Group.find({ user: req.user._id }).sort({ createdAt: -1 });
        const formatted = groups.map(formatGroupResponse);
        res.json({ success: true, data: formatted });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/groups - Create a new group
router.post('/', protect, async (req, res) => {
    try {
        const { groupName, memberNames } = req.body;

        if (!groupName || !groupName.trim()) {
            return res.status(400).json({ success: false, message: 'Group name is required' });
        }

        let members = Array.isArray(memberNames) ? memberNames.filter(m => m && m.trim()) : [];
        if (members.length === 0) {
            // Default to at least the user's name or 'Me'
            members = [req.user.name || 'Me'];
        }

        const group = await Group.create({
            user: req.user._id,
            groupName: groupName.trim(),
            memberNames: members,
            expenses: []
        });

        res.status(201).json({ success: true, data: formatGroupResponse(group) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/groups/:id/members - Add a member to an existing group
router.post('/:id/members', protect, async (req, res) => {
    try {
        const { memberName } = req.body;
        if (!memberName || !memberName.trim()) {
            return res.status(400).json({ success: false, message: 'Member name is required' });
        }

        const group = await Group.findOne({ _id: req.params.id, user: req.user._id });
        if (!group) {
            return res.status(404).json({ success: false, message: 'Group not found' });
        }

        const trimmed = memberName.trim();
        if (!group.memberNames.includes(trimmed)) {
            group.memberNames.push(trimmed);
            await group.save();
        }

        res.json({ success: true, data: formatGroupResponse(group) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/groups/:id/expenses - Add an expense to a group and calculate split balances
router.post('/:id/expenses', protect, async (req, res) => {
    try {
        const { description, totalAmount, paidByName, date, members } = req.body;

        if (!description || !totalAmount || !paidByName || !members || members.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide description, totalAmount, paidByName, and members.'
            });
        }

        const group = await Group.findOne({ _id: req.params.id, user: req.user._id });
        if (!group) {
            return res.status(404).json({ success: false, message: 'Group not found' });
        }

        const amt = parseFloat(totalAmount);
        const splitAmount = Math.round((amt / members.length) * 100) / 100;

        const splits = members.map(m => ({
            memberName: m,
            amount: splitAmount,
            isSettled: m.trim().toLowerCase() === paidByName.trim().toLowerCase()
        }));

        group.expenses.unshift({
            description: description.trim(),
            totalAmount: amt,
            paidByName: paidByName.trim(),
            date: date || new Date().toISOString().split('T')[0],
            members: members,
            splits: splits
        });

        await group.save();

        res.status(201).json({ success: true, data: formatGroupResponse(group) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/groups/:id/balances - Get all outstanding unsettled balances for a group
router.get('/:id/balances', protect, async (req, res) => {
    try {
        const group = await Group.findOne({ _id: req.params.id, user: req.user._id });
        if (!group) {
            return res.status(404).json({ success: false, message: 'Group not found' });
        }

        const unsettledBalances = [];

        (group.expenses || []).forEach(exp => {
            (exp.splits || []).forEach(sp => {
                if (!sp.isSettled && sp.memberName !== exp.paidByName) {
                    unsettledBalances.push({
                        splitId: sp._id,
                        expenseId: exp._id,
                        expenseDescription: exp.description,
                        fromMember: sp.memberName,
                        toMember: exp.paidByName,
                        amount: sp.amount,
                        summaryText: `${sp.memberName} owes ${exp.paidByName} ₹${sp.amount?.toLocaleString()}`
                    });
                }
            });
        });

        res.json({ success: true, data: unsettledBalances });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/groups/splits/:splitId/settle - Settle a specific split debt
router.post('/splits/:splitId/settle', protect, async (req, res) => {
    try {
        const group = await Group.findOne({
            user: req.user._id,
            'expenses.splits._id': req.params.splitId
        });

        if (!group) {
            return res.status(404).json({ success: false, message: 'Split record not found' });
        }

        let found = false;
        for (const exp of group.expenses) {
            for (const sp of exp.splits) {
                if (sp._id.toString() === req.params.splitId) {
                    sp.isSettled = true;
                    sp.settledAt = new Date();
                    found = true;
                    break;
                }
            }
            if (found) break;
        }

        await group.save();

        res.json({ success: true, message: 'Split marked as settled' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
