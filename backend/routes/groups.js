const express = require('express');
const router = express.Router();
const Group = require('../models/Group');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, async (req, res) => {
    try {
        const groups = await Group.find({ user: req.user._id });
        res.json({ success: true, data: groups });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/', protect, async (req, res) => {
    try {
        const { name, members } = req.body;
        const group = await Group.create({
            user: req.user._id,
            name,
            members: members || []
        });
        res.status(201).json({ success: true, data: group });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
