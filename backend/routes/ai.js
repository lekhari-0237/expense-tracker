const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { generateFinancialAnalysis } = require('../services/aiService');

// POST /api/ai/chat - AI Expense Assistant Query
router.post('/chat', protect, async (req, res) => {
    try {
        const { message } = req.body;

        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid question.'
            });
        }

        // Pass authenticated user ID strictly from JWT token (user isolation)
        const responseText = await generateFinancialAnalysis(req.user._id, message.trim());

        res.json({
            success: true,
            data: {
                question: message,
                answer: responseText,
                timestamp: new Date()
            }
        });
    } catch (error) {
        console.error('Expense AI Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Expense AI is temporarily unavailable. Please try again.'
        });
    }
});

module.exports = router;
