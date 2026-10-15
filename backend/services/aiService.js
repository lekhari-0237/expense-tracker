'use strict';

/**
 * Backing service for the /api/ai chat endpoint.
 *
 * ExpenseBot's intent handling, entity extraction and conversation memory now
 * live in services/chatbot/engine.js (per-user, MongoDB-backed). This module is
 * kept only so existing callers keep working — it must not grow a second,
 * competing classifier.
 */

const { processMessage } = require('./chatbot/engine');

async function generateFinancialAnalysis(userId, prompt) {
    const result = await processMessage(userId, prompt);
    return result.reply;
}

module.exports = {
    generateFinancialAnalysis
};
