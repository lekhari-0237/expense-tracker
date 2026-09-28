const express = require('express');
const router = express.Router();
const Bill = require('../models/Bill');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, async (req, res) => {
    try {
        const bills = await Bill.find({ user: req.user._id });
        res.json({ success: true, data: bills });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/', protect, async (req, res) => {
    try {
        const { title, amount, dueDate } = req.body;
        const bill = await Bill.create({
            user: req.user._id,
            title,
            amount,
            dueDate
        });
        res.status(201).json({ success: true, data: bill });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.put('/:id/pay', protect, async (req, res) => {
    try {
        const bill = await Bill.findOne({ _id: req.params.id, user: req.user._id });
        if (!bill) {
            return res.status(404).json({ success: false, message: 'Bill not found' });
        }
        bill.isPaid = true;
        await bill.save();
        res.json({ success: true, data: bill });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
