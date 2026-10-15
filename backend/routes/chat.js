const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { processMessage } = require('../services/chatbot/engine');
const contextService = require('../services/conversationContextService');

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

/**
 * ExpenseBot chat endpoint. The user is taken from the verified JWT only
 * (never from the message body, the prompt text, or a database fallback).
 */
async function handleChat(req, res) {
    try {
        const { message } = req.body || {};

        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({
                success: false,
                reply: 'Please provide a valid question or command.',
                message: 'Please provide a valid question or command.',
                error: 'Bad Request: Message cannot be empty'
            });
        }

        const query = message.trim();
        const result = await processMessage(req.user._id, query);
        const reply = result.reply || 'I processed your request but have no data to show.';

        return res.json({
            success: true,
            reply,
            message: reply,
            refreshData: result.refreshData === true,
            downloadFormat: result.downloadFormat || null,
            pendingAction: result.pendingAction || null,
            intent: result.intent || null,
            data: {
                reply,
                answer: reply,
                question: query,
                refreshData: result.refreshData === true,
                downloadFormat: result.downloadFormat || null,
                pendingAction: result.pendingAction || null,
                timestamp: new Date()
            }
        });
    } catch (routeError) {
        console.error('[Chat Route Error]', routeError.stack || routeError.message || routeError);
        return res.status(500).json({
            success: false,
            reply: 'ExpenseBot is temporarily unavailable. Please try again.',
            message: 'Internal Server Error',
            error: routeError.message || 'Internal Server Error'
        });
    }
}

router.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'ExpenseBot Chat API is operational',
        model: (process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim()
    });
});

router.post('/', protect, handleChat);
router.post('/chat', protect, handleChat);

// Clears this user's ExpenseBot conversation memory (chat "Reset" button).
router.post('/reset', protect, async (req, res) => {
    try {
        await contextService.clearContext(req.user._id);
        res.json({ success: true, message: 'Chat context cleared' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Could not clear the chat session.' });
    }
});

module.exports = router;
